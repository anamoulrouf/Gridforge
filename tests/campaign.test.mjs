// Campaign (Stages 2–5) simulation tests: reference strategies win, careless plans fail,
// stage systems obey their rules, and everything stays deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, loadSim } from '../src/sim/sim.js';
import { STAGES } from '../src/missions/index.js';
import { runSteps } from '../src/sim/steps.js';
import { planLine } from '../src/sim/grid.js';
import { sunAt, weatherAt, solarFrac } from '../src/sim/weather.js';
import S2 from '../src/missions/stage2.js';
import S3, { REF3 } from '../src/missions/stage3.js';
import S4, { REF4 } from '../src/missions/stage4.js';
import S5, { REF5 } from '../src/missions/stage5.js';

const D = 1440;
const play = (M, extra) => {
  const sim = createSim({ mission: M });
  (extra || M.autoplay)(sim);
  return sim;
};

test('the campaign has five stages with unique ids and complete UI content', () => {
  assert.equal(STAGES.length, 5);
  assert.deepEqual(STAGES.map((s) => s.n), [1, 2, 3, 4, 5]);
  assert.equal(new Set(STAGES.map((s) => s.id)).size, 5);
  for (const s of STAGES) {
    assert.ok(s.objectives.some((o) => o.primary), s.key);
    for (const o of s.objectives) {
      assert.equal(typeof o.eval, 'function');
      assert.equal(typeof o.guide, 'function');
    }
    assert.ok(s.ui.tutorial.length >= 4 && s.ui.ending && s.ui.endTitle, s.key);
  }
});

test('every objective guide card renders at the start of every stage', () => {
  for (const M of STAGES) {
    const sim = createSim({ mission: M });
    for (const o of M.objectives) {
      const g = o.guide(sim.state, M.bal, { xfmrName: (id) => id, srcName: (id) => id });
      assert.ok(g.title && g.why && g.steps.length && Array.isArray(g.now), `${M.key}/${o.id}`);
    }
  }
});

test('pre-built networks build cleanly and power their customers', () => {
  for (const M of [S2, S3, S4, S5]) {
    const sim = createSim({ mission: M });
    assert.equal(sim.state.prebuiltFailed, undefined, M.key);
    assert.ok(sim.state.flow.powered > 0, M.key);
  }
});

for (const [M, minScore] of [[S2, 70], [S3, 85], [S4, 80], [S5, 80]]) {
  test(`${M.stageName}: the reference strategy wins`, () => {
    const sim = play(M);
    const r = sim.state.result;
    assert.equal(r?.outcome, 'victory', `${M.key}: ${r?.cause} ${JSON.stringify(sim.state.objectives)}`);
    assert.ok(r.score.total >= minScore, `${M.key} score ${r.score.total}`);
  });
}

test('Stage 2: doing nothing fails (T1 trips at the peak, the clinic goes dark)', () => {
  const sim = createSim({ mission: S2 });
  for (let i = 0; i < 2 * D && !sim.state.result; i++) sim.tick();
  assert.equal(sim.state.result?.outcome, 'fail');
  assert.equal(sim.state.result.cause, 'clinic');
});

test('Stage 2: tariffs drive revenue, trust and affordability', () => {
  const a = createSim({ mission: S2 });
  const b = createSim({ mission: S2 });
  assert.equal(b.cmd({ type: 'tariff', cls: 'lowincome', value: 0.5 }).ok, true);
  assert.equal(b.cmd({ type: 'tariff', cls: 'lowincome', value: 0.9 }).ok, false); // outside the regulator band
  for (let i = 0; i < 6 * 60; i++) {
    a.tick();
    b.tick();
  }
  assert.ok(b.state.affordPct > S2.bal.afford.limitPct);
  assert.ok(b.state.trust.lowincome < a.state.trust.lowincome);
  assert.ok(b.state.ledger.revenue > a.state.ledger.revenue);
});

test('Stage 3: 66 kV cannot connect to 400 V without a substation chain', () => {
  const sim = createSim({ mission: S3 });
  const t = Object.keys(sim.state.nodes).find((id) => sim.state.nodes[id].kind === 'xfmr' && sim.state.nodes[id].ratio === 'MV/LV');
  const p = planLine(sim.state, sim.bal, 'coal', t);
  assert.equal(p.ok, false);
  assert.equal(p.reason, 'tierXfmrHV');
});

test('Stage 3: an 11 kV route to industry congests and trips; careless supply misses the contract', () => {
  const t = createSim({ mission: S3 });
  t.cmd({ type: 'contract', id: 'mill', accept: true });
  runSteps(t.cmd, t.state, [{ type: 'line', from: '@node:55,-14', tier: 'up', to: { x: 135, z: -14 } }, { type: 'line', from: '@last', to: { x: 255, z: -14 } }, { type: 'line', from: '@last', to: { x: 345, z: -60 } }, { type: 'drop', building: 'mill' }]);
  for (let i = 0; i < 120; i++) t.tick();
  assert.ok(t.state.stats.lineTrips >= 1);
  // no peaker but accepting the expansion: availability falls below the contract
  const s = createSim({ mission: S3 });
  runSteps(s.cmd, s.state, REF3.filter((x) => !(x.site === 'peaker' || x.from === 'peaker' || (x.to === '@node:352,-60' && x.from === '@last'))));
  for (let i = 0; i < 6 * D && !s.state.result; i++) {
    s.tick();
    for (const e of s.drainEvents()) {
      if (e.type === 'expansionOffer') s.cmd({ type: 'expand', accept: true });
      if (e.type === 'fault') s.cmd({ type: 'repair', target: e.target });
    }
  }
  assert.notEqual(s.state.result?.outcome, 'victory');
  assert.ok(s.state.contracts.mill.minOut > 0);
  assert.ok(s.state.contracts.mill.penaltyPaid > 0, 'penalties charged for outage minutes');
});

test('Stage 4: solar is zero at night; the battery cannot create energy', () => {
  assert.equal(sunAt(2), 0);
  assert.equal(solarFrac(weatherAt(1, 2 * 60, {})), 0);
  const sim = createSim({ mission: S4 });
  runSteps(sim.cmd, sim.state, REF4);
  const g = sim.state.gens.battery;
  let charged = 0;
  let discharged = 0;
  const soc0 = g.soc;
  for (let i = 0; i < 2 * D; i++) {
    sim.tick();
    charged += (g.chargeKW || 0) / 60;
    discharged += (g.outKW || 0) / 60;
  }
  assert.ok(charged > 0 && discharged > 0);
  assert.ok(Math.abs(g.soc - (soc0 + charged * 0.9 - discharged)) < 1e-6, 'state of charge = start + 90 % of charge − discharge');
  assert.ok(discharged <= soc0 + charged * 0.9 + 1e-6);
});

test('Stage 4: without storage and new clean supply, coal retirement leaves people dark', () => {
  const sim = createSim({ mission: S4 });
  for (let i = 0; i < 4 * D && !sim.state.result; i++) sim.tick();
  assert.equal(sim.state.flags.retireOk, false);
});

test('Stage 5: demand response shifts energy instead of deleting it', () => {
  const a = createSim({ mission: S5 });
  const b = createSim({ mission: S5 });
  b.cmd({ type: 'program', id: 'dr', on: true });
  const kwh = (sim) => sim.state.map.customers.filter((c) => ['dc', 't1', 't2', 't3'].includes(c.id)).reduce((s, c) => s + sim.state.cust[c.id].kWhTotal, 0);
  for (let i = 0; i < D; i++) {
    a.tick();
    b.tick();
  }
  const ratio = kwh(b) / kwh(a);
  assert.ok(ratio > 0.97 && ratio < 1.05, `DR daily energy ratio ${ratio.toFixed(3)}`);
});

test('Stage 5: feeder automation self-heals a fault; without it customers stay dark', () => {
  for (const auto of [true, false]) {
    const sim = createSim({ mission: S5 });
    if (auto) sim.cmd({ type: 'program', id: 'auto', on: true });
    while (sim.state.clock < 3 * D - D + 18 * 60 + 5) sim.tick();
    const dark = sim.state.map.customers.filter((c) => sim.state.cust[c.id].status === 'lineDown').length;
    if (auto) assert.equal(dark, 0, 'automation restored everyone');
    else assert.ok(dark > 0, 'manual: customers are dark until a switch is closed');
  }
});

test('Stage 5: without flexibility and storage, fossil imports break the clean run', () => {
  const sim = createSim({ mission: S5 });
  runSteps(sim.cmd, sim.state, REF5.filter((x) => x.type !== 'program'));
  for (let i = 0; i < 7 * D && !sim.state.result; i++) sim.tick();
  assert.notEqual(sim.state.result?.outcome, 'victory');
  assert.ok((sim.state.flags.cleanBest || 0) < 1440);
});

test('campaign stages are deterministic: replay and save/load give identical hashes', () => {
  for (const M of [S2, S3, S4, S5]) {
    const a = createSim({ mission: M, seed: 7 });
    runSteps(a.cmd, a.state, M === S2 ? [{ type: 'tariff', cls: 'business', value: 0.54 }] : M === S3 ? REF3.slice(0, 6) : M === S4 ? REF4.slice(0, 4) : REF5.slice(0, 3));
    for (let i = 0; i < 600; i++) a.tick();
    const b = loadSim(JSON.parse(JSON.stringify(a.save())), { mission: M });
    assert.equal(b.hash(), a.hash(), M.key);
  }
});
