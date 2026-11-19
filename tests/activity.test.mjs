// Round 8 activity: new event kinds (VIP visit, wildfire, landslide, cyber alert, dust storm),
// daily side quests and story beats. All pure and replay-safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, loadSim } from '../src/sim/sim.js';
import { STAGES } from '../src/missions/index.js';
import { drainAndRespond } from '../src/sim/events.js';
import { questView } from '../src/sim/quests.js';
import { runSteps } from '../src/sim/steps.js';

const [S1, S2, S3, S4] = STAGES;
const start = (sim) => (sim.cmd({ type: 'begin' }), sim.cmd({ type: 'startGen' }));
const only = (M, entry) => ({ ...M, events: { ...M.events, count: [1, 1], avoidH: [], pool: [entry] }, story: [], quests: undefined });
const poolOf = (M, k) => M.events.pool.find((p) => p.key === k);
function run(M, seed, hours, onEv = () => {}, until = () => false, auto = false) {
  const sim = createSim({ mission: M, seed });
  M.refBuild?.(sim);
  start(sim);
  for (let i = 0; i < hours * 60 && !until(sim) && !sim.state.result; i++) {
    sim.tick();
    for (const e of auto ? drainAndRespond(sim) : sim.drainEvents()) onEv(sim, e);
  }
  return sim;
}

test('VIP visit: a lit tour pays the grant; a dark one costs reputation', () => {
  const M = only(S2, { ...poolOf(S2, 'minister'), windowH: [34, 35], atHour: undefined });
  let end = null;
  const ok = run(M, 3, 60, (s, e) => e.type === 'evEnd' && (end = e), (s) => s.state.ev.deck[0].phase === 'done');
  assert.equal(ok.state.ev.deck[0].phase, 'done');
  assert.ok(end.ok, `lit ${end.pct}%`);
  assert.equal(end.grant, 600);
  end = null;
  const dark = run(M, 3, 60, (s, e) => {
    if (e.type === 'evHit') for (const id of s.state.ev.deck[0].ids) s.state.cust[id].dropped && (s.state.edges[Object.keys(s.state.edges).find((x) => s.state.edges[x].kind === 'drop' && s.state.edges[x].b === id)].state = 'fault');
    if (e.type === 'evEnd') end = e;
  }, (s) => s.state.ev.deck[0].phase === 'done');
  assert.equal(end.ok, false);
  assert.ok(dark.state.ev.rep < ok.state.ev.rep);
});

test('wildfire: protected transformers survive, unprotected ones burn', () => {
  const zone = { x: -60, z: 0, r: 60 };
  const M = only(S2, { key: 'fire', kind: 'wildfire', windowH: [34, 35], warnH: 5, durH: 3, params: { area: 'the old quarter', zone } });
  let warn = null;
  const safe = run(M, 4, 60, (s, e) => {
    if (e.type === 'evWarn') {
      warn = e;
      for (const id of e.at) assert.ok(s.cmd({ type: 'protect', target: id }).ok);
    }
  }, (s) => s.state.ev.deck[0].phase === 'done');
  assert.ok(warn.at.length >= 1, 'a transformer sits in the fire zone');
  const burntX = safe.state.ev.deck[0].damaged.filter((id) => safe.state.nodes[id]);
  assert.equal(burntX.length, 0);
  const risky = run(M, 4, 60, () => {}, (s) => s.state.ev.deck[0].phase === 'done');
  assert.ok(risky.state.ev.deck[0].damaged.some((id) => risky.state.nodes[id]));
});

test('landslide: an hour of warning, then at most its cap of damage', () => {
  const M = only(S3, { ...poolOf(S3, 'landslide'), windowH: [14, 15], params: { ...poolOf(S3, 'landslide').params, zone: { x: 0, z: 0, r: 200 } } });
  let warnAt = null;
  let hitAt = null;
  const sim = run(M, 5, 80, (s, e) => {
    if (e.type === 'evWarn') warnAt = s.state.clock;
    if (e.type === 'evHit') hitAt = s.state.clock;
  }, (s) => s.state.ev.deck[0].phase === 'done', true);
  assert.ok(warnAt != null && hitAt != null, 'warned and hit');
  assert.ok(hitAt - warnAt >= 60);
  assert.ok(sim.state.ev.deck[0].damaged.length <= 2);
});

test('cyber alert: patching keeps the substation on; ignoring it trips one until reset', () => {
  const entry = { key: 'cyber', kind: 'cyberAlert', windowH: [34, 35], warnH: 6, params: { cost: 600 } };
  const M = only(S3, entry);
  const patched = run(M, 6, 60, (s, e) => e.type === 'choice' && assert.ok(s.cmd({ type: 'choose', ev: e.id, opt: 0 }).ok), (s) => s.state.ev.deck[0].phase === 'done');
  const d1 = patched.state.ev.deck[0];
  assert.equal(patched.state.nodes[d1.target].state === 'trip', false);
  let tripped = null;
  const risky = run(M, 6, 60, (s, e) => {
    if (e.type === 'choice') s.cmd({ type: 'choose', ev: e.id, opt: 1 });
    if (e.type === 'evHit' && e.tripped) tripped = e.target;
  }, (s) => s.state.ev.deck[0].phase === 'done');
  assert.ok(tripped);
  assert.equal(risky.state.nodes[tripped].state, 'trip');
  for (let i = 0; i < 20; i++) risky.tick();
  assert.ok(risky.cmd({ type: 'reset', target: tripped }).ok);
});

test('dust storm: dirty panels lose output until the crew washes them', () => {
  const M = only(S4, { key: 'dust', kind: 'dustStorm', windowH: [36, 37], warnH: 4, durH: 2, params: { loss: 0.5 } });
  let dusty = null;
  const sim = run(M, 7, 60, (s, e) => e.type === 'evEnd' && (dusty = e.dusty), (s) => s.state.ev.deck[0].phase === 'done');
  assert.ok(dusty.length >= 1);
  const g = sim.state.gens[dusty[0]];
  assert.equal(g.dust, 0.5);
  assert.ok(sim.cmd({ type: 'cleanPanels', target: dusty[0] }).ok);
  for (let i = 0; i < 6 * 60 && g.dust > 0; i++) sim.tick();
  assert.equal(g.dust, 0);
});

test('denser decks: 3–4 events in Stage 1, 7–9 in Stages 2–5, all placed in time', () => {
  for (const M of STAGES.slice(0, 5)) {
    const [lo, hi] = M.events.count;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const n = createSim({ mission: M, seed }).state.ev.deck.length;
      assert.ok(n >= lo - 1 && n <= hi, `${M.key} seed ${seed}: ${n}`);
    }
  }
});

test('side quests: seeded per day, identical on replay, and pay out when done', () => {
  for (const M of STAGES.slice(0, 5)) {
    const sim = createSim({ mission: M, seed: 11 });
    M.refBuild?.(sim);
    start(sim);
    for (let i = 0; i < 2.5 * 1440 && !sim.state.result; i++) {
      sim.tick();
      drainAndRespond(sim);
    }
    const q = sim.state.q;
    assert.ok(q.list.length >= 1, `${M.key}: quests offered`);
    for (const x of q.list) {
      const v = questView(sim.state, x, M.bal);
      assert.ok(v.title && v.how.length && v.now.length && v.reward, `${M.key}/${x.key} view`);
      assert.ok(!/—/.test(v.title + v.text + v.how.join(' ')), 'no em-dash');
    }
    const again = loadSim({ ...sim.save() }, { mission: M });
    assert.deepEqual(again.state.q.list.map((x) => [x.key, x.status]), q.list.map((x) => [x.key, x.status]));
  }
});

test('a finished quest pays its reward', () => {
  const M = { ...S1, events: { ...S1.events, count: [0, 0], pool: [] }, story: [], quests: { perDay: [1, 1], pool: [{ key: 'c', who: 'mayor', title: 'Connect two', text: 't', goal: { type: 'build', kind: 'drop', n: 2, hour: 20 }, reward: { credits: 123, rep: 2 } }] } };
  const sim = createSim({ mission: M, seed: 1 });
  start(sim);
  sim.tick();
  const q = sim.state.q.list[0];
  assert.equal(q.status, 'open');
  runSteps(sim.cmd, sim.state, M.map.reference);
  const mid = sim.state.credits;
  sim.tick();
  assert.equal(q.status, 'done');
  assert.ok(Math.abs(sim.state.credits - mid - 123) < 1, `paid ${sim.state.credits - mid}`);
  assert.equal(sim.state.q.done, 1);
});

test('story beats fire once at their hour; choices go through the choice card', () => {
  for (const M of STAGES.slice(0, 5)) {
    const seen = [];
    const sim = createSim({ mission: M, seed: 2 });
    M.refBuild?.(sim);
    start(sim);
    for (let i = 0; i < 4 * 1440 && !sim.state.result; i++) {
      sim.tick();
      for (const e of drainAndRespond(sim)) {
        if (e.type === 'beat') seen.push(e.id);
        if (e.type === 'choice' && e.id.startsWith('story')) {
          seen.push(e.id);
          assert.ok(sim.state.ev.choices[e.id].done, 'answered through the choice command');
        }
      }
    }
    const due = sim.state.ev.beats.filter((b) => b.at <= sim.state.clock && b.at > (M.bal.startClockMin ?? 0));
    assert.ok(seen.length >= 2 && seen.length === due.length, `${M.key}: ${seen.length} of ${due.length} beats`);
    assert.ok(sim.state.ev.beats.every((b) => b.done === b.at <= sim.state.clock));
    assert.equal(new Set(seen).size, seen.length, 'each beat once');
  }
});
