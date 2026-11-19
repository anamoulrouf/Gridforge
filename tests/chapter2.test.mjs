// Chapter II mechanics (Stages 7–10): pumped storage and ice on lines, green hydrogen and heat
// derating, the hourly market and battery trading, HVDC regional hubs. Each stage's reference
// winning on 20 seeds is covered by events.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { runSteps } from '../src/sim/steps.js';
import { marketPrice, derate } from '../src/sim/power.js';
import S7, { REF7 } from '../src/missions/stage7.js';
import S8, { REF8, h2Window } from '../src/missions/stage8.js';
import S9, { REF9, priceAt } from '../src/missions/stage9.js';
import S10, { REF10 } from '../src/missions/stage10.js';

const run = (sim, min) => {
  for (let i = 0; i < min && !sim.state.result; i++) sim.tick();
};

for (const M of [S7, S8, S9, S10]) {
  test(`${M.stageName}: the pre-built network powers everyone, and doing nothing fails`, () => {
    const sim = createSim({ mission: M, seed: 1, events: false });
    assert.equal(sim.state.prebuiltFailed, undefined, M.key);
    assert.equal(sim.state.flow.powered, sim.state.flow.activeCount);
    run(sim, (M.bal.fail.deadlineDay + 1) * 1440);
    assert.notEqual(sim.state.result?.outcome, 'victory', M.key);
  });
}

test('Stage 7: ice builds on an idle pass line and melts off a line carrying current', () => {
  const ice = { key: 'ice', kind: 'iceStorm', hitH: 12, warnH: 2, durH: 6, params: { zone: { x: -265, z: 40, r: 60 }, tiers: ['HV'], buildH: 3, meltPct: 25 } };
  const mk = (mode) => {
    const M = { ...S7, events: { ...S7.events, count: [0, 0], pool: [], fixed: [ice] }, story: [], quests: undefined };
    const sim = createSim({ mission: M, seed: 1 });
    runSteps(sim.cmd, sim.state, REF7);
    sim.cmd({ type: 'battery', target: 'pumped', mode });
    return sim;
  };
  const idle = mk('hold'); // nothing flows over the pass
  run(idle, 12 * 60);
  assert.ok(idle.state.ev.deck[0].snapped >= 1, 'an idle line snaps');
  const busy = mk('charge'); // pumping pulls current over the pass
  run(busy, 12 * 60);
  assert.ok(!busy.state.ev.deck[0].snapped, 'a busy line sheds its ice');
});

test('Stage 7: pumped storage pumps with grid power on Charge only and gives about 75% back', () => {
  const sim = createSim({ mission: S7, seed: 1, events: false });
  runSteps(sim.cmd, sim.state, REF7);
  sim.cmd({ type: 'battery', target: 'pumped', mode: 'charge' });
  const g = sim.state.gens.pumped;
  const s0 = g.soc;
  run(sim, 120);
  assert.ok(g.soc > s0 + 100, 'the lake fills');
  assert.ok(g.everCharged);
});

test('Stage 8: hydrogen goes to the steel plant every hour, and heat derates the network', () => {
  const sim = createSim({ mission: S8, seed: 1, events: false });
  runSteps(sim.cmd, sim.state, REF8);
  run(sim, 30 * 60);
  const w = h2Window(sim.state);
  assert.ok(w.hours >= 24 && w.pct > 50, `delivered ${w.pct.toFixed(0)}% over ${w.hours} h`);
  assert.equal(derate(S8.bal, { temp: 30 }), 1);
  assert.ok(Math.abs(derate(S8.bal, { temp: 45 }) - 0.9) < 1e-9);
  assert.equal(derate(S7.bal, { temp: 45 }), 1, 'only stages that opt in');
});

test('Stage 9: prices are cheap at night and dear at the evening peak; surplus sells and the battery trades', () => {
  assert.ok(priceAt(3 * 60) < 0.12 && priceAt(19 * 60) > 0.4);
  const sim = createSim({ mission: S9, seed: 1, events: false });
  runSteps(sim.cmd, sim.state, REF9);
  assert.equal(sim.state.gens.batt.mode, 'trade');
  run(sim, 54 * 60);
  assert.ok((sim.state.stats.tradeSell || 0) > 0, 'surplus sold abroad');
  assert.ok((sim.state.flags.arbBest || 0) > 0, 'the battery made money trading');
  assert.ok(marketPrice(sim.state, S9.bal) > 0);
  assert.equal(createSim({ mission: S7 }).cmd({ type: 'battery', target: 'x', mode: 'trade' }).ok, false);
});

test('Stage 10: regional hubs follow their own clocks, and the reference wins the finale', () => {
  const T = S10.bal.sourceTypes;
  assert.ok(T.hubDunefield.profile(6) > T.hubKalani.profile(6, 1, { cloud: 0 }) - 0.2, 'desert sun rises early');
  assert.equal(T.hubDunefield.profile(22), 0);
  assert.ok(T.hubAurora.profile(2, 1) > 0, 'northern wind at night');
  const sim = createSim({ mission: S10, seed: 1 });
  S10.autoplay(sim);
  assert.equal(sim.state.result?.outcome, 'victory', JSON.stringify(sim.state.objectives));
  assert.ok(sim.state.result.score.total >= 85);
  assert.equal(S10.ui.ending.next, 'Thank you for playing Gridforge.');
  void REF10;
});
