// Stage 6 · Kalani Island: fast reserve, under-frequency load shedding, the grid-forming battery,
// idling engines, the morning tanker and its delay, and the reference strategy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { runSteps } from '../src/sim/steps.js';
import S6, { REF6 } from '../src/missions/stage6.js';

const quiet = (extra = {}) => createSim({ mission: S6, seed: 1, events: false, ...extra });
const run = (sim, min, on = () => {}) => {
  for (let i = 0; i < min && !sim.state.result; i++) {
    sim.tick();
    for (const e of sim.drainEvents()) on(e);
  }
};

test('Stage 6: the island network powers everyone at the start, with two units running', () => {
  const sim = quiet();
  assert.equal(sim.state.prebuiltFailed, undefined);
  assert.equal(sim.state.flow.powered, sim.state.flow.activeCount);
  assert.deepEqual(['d1', 'd2', 'd3'].map((id) => sim.state.gens[id].status), ['running', 'running', 'off']);
  assert.ok(sim.state.flow.largestKW > 0 && sim.state.flow.reserveKW >= 0);
});

test('Stage 6: a trip bigger than the fast reserve switches the least important customers off for 15 minutes', () => {
  const sim = quiet();
  run(sim, 12 * 60); // 18:00, evening peak on two units
  const big = sim.state.flow.largestId;
  assert.ok(sim.state.flow.reserveKW < sim.state.flow.largestKW, 'two units at the peak are not covered');
  const events = [];
  sim.state.gens[big].status = 'tripped';
  sim.state.gens[big].tripUntil = sim.state.clock + 60;
  run(sim, 2, (e) => events.push(e));
  const u = events.find((e) => e.type === 'ufls');
  assert.ok(u && u.ids.length >= 1, 'protection switched customers off');
  for (const id of u.ids) {
    assert.equal(sim.state.cust[id].status, 'shed');
    assert.notEqual(id, 'desal');
    assert.notEqual(id, 'clinic');
  }
  run(sim, 16);
  assert.ok(u.ids.every((id) => !sim.state.cust[id].ufls), 'back after 15 minutes');
});

test('Stage 6: with the grid-forming battery the same trip is ridden through', () => {
  const sim = quiet();
  runSteps(sim.cmd, sim.state, REF6.slice(0, 3));
  sim.cmd({ type: 'dispatchOrder', order: ['diesel', 'battery'] }); // engines carry the load, the battery stands by
  run(sim, 12 * 60);
  assert.ok(sim.state.flow.reserveKW + 1 >= sim.state.flow.largestKW, 'battery covers the biggest unit');
  const big = ['d1', 'd2'].sort((a, b) => sim.state.gens[b].outKW - sim.state.gens[a].outKW)[0];
  const events = [];
  sim.state.gens[big].status = 'tripped';
  run(sim, 2, (e) => events.push(e));
  assert.ok(events.some((e) => e.type === 'rideThrough'));
  assert.ok(!events.some((e) => e.type === 'ufls'));
  assert.ok(sim.state.flags.rideOk);
});

test('Stage 6: an idling engine still burns fuel, and the tanker refills the tanks every morning', () => {
  const a = quiet();
  const b = quiet();
  b.cmd({ type: 'startGen', target: 'd3' });
  const f0 = (s) => ['d1', 'd2', 'd3'].reduce((t, id) => t + s.state.gens[id].fuel, 0);
  run(a, 6 * 60);
  run(b, 6 * 60);
  assert.ok(f0(b) < f0(a) - 5, `three units burn more (${f0(b).toFixed(0)} vs ${f0(a).toFixed(0)})`);
  let tanker = null;
  run(a, 20 * 60, (e) => e.type === 'tanker' && (tanker = e));
  assert.ok(tanker && tanker.units > 0 && tanker.cost > 0, 'tanker on day 2 at 07:00');
});

test('Stage 6: no tanker on day 3, and doing nothing loses the island’s water', () => {
  const sim = quiet();
  const tankers = [];
  run(sim, 6 * 1440, (e) => e.type === 'tanker' && tankers.push(sim.state.clock));
  assert.ok(!tankers.some((c) => c >= 2 * 1440 && c < 3 * 1440), 'the day-3 tanker never came');
  assert.equal(sim.state.result?.outcome, 'fail');
  assert.notEqual(sim.state.flags.delayOk, true);
});

test('Stage 6: wind and solar without the battery still miss the delay and the reserve', () => {
  const sim = quiet();
  runSteps(sim.cmd, sim.state, REF6.slice(3));
  sim.cmd({ type: 'startGen', target: 'd3' });
  run(sim, 6 * 1440);
  assert.notEqual(sim.state.result?.outcome, 'victory');
});

test('Stage 6: the reference strategy wins with a strong score', () => {
  const sim = createSim({ mission: S6, seed: 1 });
  S6.autoplay(sim);
  const r = sim.state.result;
  assert.equal(r?.outcome, 'victory', JSON.stringify(sim.state.objectives));
  assert.ok(r.score.total >= 85, `score ${r.score.total}`);
  assert.ok(sim.state.flags.delayOk && sim.state.flags.resBest >= 1440);
});
