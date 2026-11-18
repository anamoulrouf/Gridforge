import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, loadSim } from '../src/sim/sim.js';
import { BALANCE } from '../src/data/balance.js';
import { MISSION1 as M1 } from '../src/data/mission1.js';

// Stage 1 rule tests run without run events; events have their own tests (tests/events.test.mjs).
const MISSION1 = { ...M1, customers: M1.customers.filter((c) => !c.surprise) };
import { demandAt } from '../src/sim/power.js';
import { nodeAt } from '../src/sim/grid.js';

/** Execute the mission's reference layout through the public command API. */
function buildReference(sim, steps = MISSION1.reference) {
  let last = null;
  const ref = (r) => {
    if (r === '@last') return last;
    if (typeof r === 'string' && r.startsWith('@node:')) {
      const [x, z] = r.slice(6).split(',').map(Number);
      return nodeAt(sim.state, x, z, 1);
    }
    return r;
  };
  for (const s of steps) {
    let r;
    if (s.type === 'line') {
      r = sim.cmd({ type: 'line', from: ref(s.from), to: s.to });
      if (r.ok) last = r.last;
    } else if (s.type === 'transformer') r = sim.cmd({ type: 'transformer', at: ref(s.at) });
    else if (s.type === 'drop') r = sim.cmd({ type: 'drop', building: s.building });
    assert.ok(r.ok, `step ${JSON.stringify(s)} failed: ${r.reason}`);
  }
}

const runHours = (sim, h) => {
  for (let i = 0; i < h * 60; i++) sim.tick();
};

/** Play the reference strategy to the end: build, start, keep fuel up, repair the fault. */
function playReference(sim) {
  sim.cmd({ type: 'inspect', target: 'gen' });
  sim.cmd({ type: 'inspect', target: 'demand' });
  buildReference(sim);
  assert.ok(sim.cmd({ type: 'startGen' }).ok);
  for (let i = 0; i < 5 * 24 * 60 && !sim.state.result; i++) {
    sim.tick();
    const s = sim.state;
    if (s.gen.fuel < 40 && !s.orders.some((o) => o.item === 'fuel')) sim.cmd({ type: 'order', item: 'fuel' });
    for (const ev of sim.drainEvents()) {
      if (ev.type === 'fault') sim.cmd({ type: 'repair', target: ev.target });
    }
  }
}

test('demand profile matches the balance sheet (night 16.8, day 35, peak 47.8 kW)', () => {
  const total = (h) => MISSION1.customers.reduce((s, c) => s + demandAt(BALANCE, c.type, h), 0);
  const L = Array.from({ length: 24 }, (_, h) => total(h));
  assert.equal(Math.round(L[3] * 10) / 10, 16.8);
  assert.equal(Math.round(Math.max(...L.slice(8, 18)) * 10) / 10, 35.0);
  assert.equal(Math.round(Math.max(...L) * 10) / 10, 47.8);
  assert.equal(Math.round(L.reduce((a, b) => a + b)), 692);
  const nominal = MISSION1.customers.reduce((s, c) => s + ({ home: 1, school: 8, market: 10, clinic: 12 })[c.type], 0);
  assert.equal(nominal, 40);
});

test('a line merely ending next to a building does not power it (touching ≠ powered)', () => {
  const sim = createSim({ events: false });
  let r = sim.cmd({ type: 'line', from: 'gen', to: { x: -62, z: -8 } });
  r = sim.cmd({ type: 'line', from: r.last, to: { x: -24, z: -8 } });
  r = sim.cmd({ type: 'line', from: r.last, to: { x: -2, z: 10 } });
  assert.ok(r.ok);
  sim.cmd({ type: 'transformer', at: r.last });
  // LV line ends right beside the clinic
  r = sim.cmd({ type: 'line', from: nodeAt(sim.state, -2, 10, 1), to: { x: -5, z: 21 } });
  assert.ok(r.ok, r.reason);
  sim.cmd({ type: 'startGen' });
  runHours(sim, 1);
  assert.equal(sim.state.cust.clinic.status, 'unconnected');
  assert.ok(sim.cmd({ type: 'drop', building: 'clinic' }).ok);
  assert.equal(sim.state.cust.clinic.status, 'on');
});

test('11 kV cannot connect straight to 400 V; buildings refuse lines', () => {
  const sim = createSim({ events: false });
  let r = sim.cmd({ type: 'line', from: 'gen', to: { x: -62, z: -8 } });
  const mvPole = r.last;
  r = sim.cmd({ type: 'line', from: mvPole, to: { x: -30, z: -8 } });
  sim.cmd({ type: 'transformer', at: r.last });
  r = sim.cmd({ type: 'line', from: r.last, to: { x: -30, z: -30 } }); // LV out of transformer
  assert.ok(r.ok);
  assert.equal(sim.state.nodes[r.last].tier, 'LV');
  const lv = sim.cmd({ type: 'line', from: mvPole, to: r.last });
  assert.equal(lv.ok, false);
  assert.equal(lv.reason, 'tierMismatch');
  const b = sim.preview({ type: 'line', from: mvPole, to: { x: -12, z: -18 } });
  assert.equal(b.reason, 'endOnBuilding');
  const t = sim.preview({ type: 'transformer', at: r.last });
  assert.equal(t.reason, 'xfmrOnLV');
  const road = sim.preview({ type: 'line', from: mvPole, to: { x: -50, z: 0 } });
  assert.equal(road.reason, 'onRoad');
});

test('reference layout fits the budget (13 poles, ≤ 400 m, < 60% credits)', () => {
  const sim = createSim({ events: false });
  buildReference(sim);
  const s = sim.state;
  assert.equal(BALANCE.start.poles - s.inv.poles, 13);
  assert.ok(BALANCE.start.cable - s.inv.cable <= 400, `cable used ${BALANCE.start.cable - s.inv.cable}`);
  assert.ok(s.stats.spent < 0.6 * BALANCE.start.credits, `spent ${s.stats.spent}`);
  assert.equal(s.flow.connected, 13);
});

test('a single transformer feeding the whole town trips at the evening peak; two transformers hold', () => {
  const one = createSim({ events: false });
  let r = one.cmd({ type: 'line', from: 'gen', to: { x: -62, z: -8 } });
  r = one.cmd({ type: 'line', from: r.last, to: { x: -24, z: -8 } });
  r = one.cmd({ type: 'line', from: r.last, to: { x: 4, z: -8 } });
  one.cmd({ type: 'transformer', at: r.last });
  const T = r.last;
  // LV everywhere from a single transformer
  const lv = [
    [T, { x: 28, z: -8 }], ['@', { x: 50, z: -12 }], ['@', { x: 50, z: -30 }], [T, { x: 4, z: -28 }],
    [T, { x: -2, z: 10 }], ['@', { x: -2, z: 30 }], ['#-2,10', { x: 24, z: 10 }], ['@', { x: 48, z: 12 }], ['@', { x: 72, z: 12 }], ['#48,12', { x: 50, z: 36 }],
  ];
  let last = null;
  for (const [f, to] of lv) {
    const from = f === '@' ? last : f.startsWith('#') ? nodeAt(one.state, ...f.slice(1).split(',').map(Number), 1) : f;
    r = one.cmd({ type: 'line', from, to });
    assert.ok(r.ok, r.reason);
    last = r.last;
  }
  for (const c of MISSION1.customers) assert.ok(one.cmd({ type: 'drop', building: c.id }).ok, c.id);
  one.cmd({ type: 'startGen' });
  const evs = [];
  for (let i = 0; i < 3 * 60; i++) {
    one.tick();
    evs.push(...one.drainEvents());
  }
  assert.ok(evs.some((e) => e.type === 'xfmrOverload'), 'overload telegraphed');
  assert.ok(evs.some((e) => e.type === 'xfmrTrip'), 'single transformer trips');
  assert.equal(one.state.stats.trips, 1);

  const two = createSim({ events: false });
  buildReference(two);
  two.cmd({ type: 'startGen' });
  runHours(two, 6);
  assert.equal(two.state.stats.trips, 0);
});

test('losses are small and labelled-simplified range (1–6 %)', () => {
  const sim = createSim({ events: false });
  buildReference(sim);
  sim.cmd({ type: 'startGen' });
  runHours(sim, 2);
  const p = sim.state.flow.lossPct;
  assert.ok(p > 1 && p < 6, `loss ${p}`);
  assert.ok(Math.abs(sim.state.flow.genKW - sim.state.flow.servedKW - sim.state.flow.lossKW) < 1e-9);
});

test('the clock is frozen until the generator starts; ticks do nothing before', () => {
  const sim = createSim({ events: false });
  buildReference(sim);
  const h = sim.hash();
  for (let i = 0; i < 100; i++) sim.tick();
  assert.equal(sim.hash(), h);
  assert.equal(sim.state.t, 0);
});

test('reference strategy reaches victory with fault repaired and one fuel resupply', () => {
  const sim = createSim({ events: false });
  playReference(sim);
  const s = sim.state;
  assert.equal(s.result?.outcome, 'victory', JSON.stringify(s.result));
  assert.equal(s.fault.phase, 'repaired');
  assert.ok(s.stats.fuelOrders >= 1);
  assert.ok(s.result.score.total >= 65, `score ${s.result.score.total}`);
  const days = s.clock / 1440;
  assert.ok(days < 5, `finished day ${days}`);
});

test('fuel starvation leads to failure after warnings', () => {
  const sim = createSim({ events: false });
  buildReference(sim);
  sim.cmd({ type: 'startGen' });
  const evs = [];
  for (let i = 0; i < 5 * 24 * 60 && !sim.state.result; i++) {
    sim.tick();
    evs.push(...sim.drainEvents());
    for (const e of evs.splice(0)) {
      if (e.type === 'fault') sim.cmd({ type: 'repair', target: e.target });
      if (e.type === 'failWarn') evs.warned = true;
      if (e.type === 'noFuel') evs.noFuel = true;
    }
  }
  assert.equal(sim.state.result?.outcome, 'fail');
  assert.equal(sim.state.result.cause, 'fuel');
  assert.ok(evs.warned && evs.noFuel);
});

test('restart and replay are deterministic (identical hash)', () => {
  const a = createSim({ events: false, seed: 42 });
  playReference(a);
  const save = a.save();
  const b = loadSim(save);
  assert.equal(b.hash(), a.hash());
  // a fresh sim with the same seed starts identical
  assert.equal(createSim({ events: false, seed: 42 }).hash(), createSim({ events: false, seed: 42 }).hash());
});

test('save/load mid-mission round-trips through JSON', () => {
  const a = createSim({ events: false, seed: 7 });
  buildReference(a);
  a.cmd({ type: 'startGen' });
  runHours(a, 30);
  const save = JSON.parse(JSON.stringify(a.save()));
  const b = loadSim(save);
  assert.equal(b.hash(), a.hash());
  runHours(a, 5);
  runHours(b, 5);
  assert.equal(b.hash(), a.hash());
});

test('scripted fault is telegraphed, darkens its customers, and pre-dispatch shortens restoration', () => {
  const run = (pre) => {
    const sim = createSim({ events: false });
    buildReference(sim);
    sim.cmd({ type: 'startGen' });
    let warnAt = null;
    let dark = null;
    for (let i = 0; i < 3 * 24 * 60 && sim.state.fault.phase !== 'repaired'; i++) {
      sim.tick();
      for (const e of sim.drainEvents()) {
        if (e.type === 'faultWarn') {
          warnAt = e.t;
          if (pre) assert.ok(sim.cmd({ type: 'repair', target: e.target }).ok);
        }
        if (e.type === 'fault') {
          dark = e.affected.every((id) => sim.state.cust[id].status === 'xfmrDown');
          if (!pre) sim.cmd({ type: 'repair', target: e.target });
        }
      }
      if (sim.state.gen.fuel < 40 && !sim.state.orders.length) sim.cmd({ type: 'order', item: 'fuel' });
    }
    return { warnAt, dark, restore: sim.state.fault.restoredT - sim.state.fault.tripT };
  };
  const late = run(false);
  const early = run(true);
  assert.ok(late.warnAt != null && late.dark);
  assert.ok(early.restore < late.restore, `${early.restore} < ${late.restore}`);
});

test('maintenance restores condition and costs credits; generator servicing caps output', () => {
  const sim = createSim({ events: false });
  buildReference(sim);
  sim.cmd({ type: 'startGen' });
  runHours(sim, 20);
  const c0 = sim.state.gen.condition;
  assert.ok(c0 < 100);
  const cr = sim.state.credits;
  assert.ok(sim.cmd({ type: 'maintain', target: 'gen' }).ok);
  assert.equal(sim.state.credits, cr - BALANCE.costs.maintain);
  let sawCap = false;
  for (let i = 0; i < 4 * 60; i++) {
    sim.tick();
    if (sim.state.gen.servicing) sawCap = sim.state.flow.availKW <= BALANCE.generator.servicingCapKW;
  }
  assert.ok(sawCap);
  assert.equal(sim.state.gen.condition > c0, true);
  assert.equal(sim.state.stats.serviced, 1);
});

test('remove refunds 50% credits and returns materials', () => {
  const sim = createSim({ events: false });
  const r = sim.cmd({ type: 'line', from: 'gen', to: { x: -62, z: -8 } });
  const before = { ...sim.state.inv, credits: sim.state.credits };
  const rm = sim.cmd({ type: 'remove', target: r.last });
  assert.ok(rm.ok);
  assert.equal(sim.state.inv.poles, before.poles + 1);
  assert.ok(sim.state.inv.cable > before.cable);
  assert.ok(sim.state.credits > before.credits);
  assert.equal(sim.cmd({ type: 'remove', target: 'gen' }).reason, 'cantRemoveGen');
});
