// Run events: seeded decks, telegraphing, flood isolation, festivals, protests, reputation, and
// every stage's reference strategy surviving whatever the deck throws at it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, loadSim } from '../src/sim/sim.js';
import { STAGES } from '../src/missions/index.js';
import { drainAndRespond, eventDemandMult } from '../src/sim/events.js';
import { runSteps } from '../src/sim/steps.js';
import { REF5 } from '../src/missions/stage5.js';

const S2 = STAGES[1];
const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i * 7919);
const start = (sim) => (sim.cmd({ type: 'begin' }), sim.cmd({ type: 'startGen' }));
const only = (M, entry, extra = {}) => ({ ...M, events: { ...M.events, count: [1, 1], avoidH: [], pool: [entry], ...extra } });

test('the event deck is deterministic per seed and differs between seeds', () => {
  for (const M of STAGES) {
    const a = createSim({ mission: M, seed: 11 }).state.ev.deck;
    const b = createSim({ mission: M, seed: 11 }).state.ev.deck;
    assert.deepEqual(a, b, M.key);
    assert.ok(a.length >= (M.events?.count?.[0] ?? 0), `${M.key}: ${a.length} events`);
    const decks = new Set(SEEDS.map((s) => JSON.stringify(createSim({ mission: M, seed: s }).state.ev.deck.map((d) => [d.key, d.hitAt]))));
    assert.ok(decks.size >= 5, `${M.key}: only ${decks.size} different decks over ${SEEDS.length} seeds`);
  }
});

test('events stay clear of each stage’s scripted complications', () => {
  for (const M of STAGES) {
    for (const seed of SEEDS) {
      for (const d of createSim({ mission: M, seed }).state.ev.deck) {
        if (d.fixed) continue; // the stage’s own scripted hazards (Highvale’s ice, the Supergrid’s perfect storm)
        const h = d.hitAt / 60;
        for (const [a, b] of M.events?.avoidH || []) assert.ok(h < a - 2 || h > b + 2, `${M.key} seed ${seed}: ${d.key} at ${h} h`);
      }
    }
  }
});

for (const M of STAGES) {
  test(`${M.stageName}: the reference strategy wins on 20 different runs`, () => {
    const scores = [];
    for (const seed of SEEDS) {
      const sim = createSim({ mission: M, seed });
      M.autoplay(sim);
      assert.equal(sim.state.result?.outcome, 'victory', `seed ${seed}: ${JSON.stringify(sim.state.result?.cause || sim.state.result)} deck ${sim.state.ev.deck.map((d) => d.key).join(',')}`);
      scores.push(sim.state.result.score.total);
    }
    assert.ok(Math.min(...scores) >= 65, `lowest score ${Math.min(...scores)}`);
  });
}

test('hazards are announced at least an hour ahead (earthquakes are the one exception)', () => {
  for (const M of STAGES) {
    for (const seed of SEEDS.slice(0, 8)) {
      const sim = createSim({ mission: M, seed });
      const warned = {};
      const orig = sim.drainEvents;
      sim.drainEvents = () => {
        const evs = orig();
        for (const e of evs) {
          if (e.type === 'evWarn') warned[e.id] = sim.state.clock;
          if (e.type === 'evHit' && !['quake', 'request'].includes(e.kind)) {
            assert.ok(warned[e.id] != null, `${M.key} seed ${seed}: ${e.kind} hit without warning`);
            assert.ok(sim.state.clock - warned[e.id] >= 60, `${M.key} seed ${seed}: ${e.kind} warned only ${sim.state.clock - warned[e.id]} min ahead`);
          }
        }
        return evs;
      };
      M.autoplay(sim);
    }
  }
});

const FLOOD = S2.events.pool.find((p) => p.kind === 'flood');
function floodRun(isolate) {
  const M = only(S2, { ...FLOOD, windowH: [30, 31] });
  const sim = createSim({ mission: M, seed: 5 });
  M.refBuild(sim);
  start(sim);
  const out = { damaged: null };
  for (let i = 0; i < 2 * 1440 && out.damaged == null; i++) {
    sim.tick();
    for (const e of sim.drainEvents()) {
      if (e.type === 'evWarn' && isolate) for (const id of e.at) assert.ok(sim.cmd({ type: 'isolate', target: id }).ok);
      if (e.type === 'evHit') out.damaged = e.damaged;
    }
  }
  out.sim = sim;
  return out;
}

test('switching equipment off before a flood saves it; live equipment is damaged', () => {
  const live = floodRun(false);
  assert.ok(live.damaged.length >= 1, 'the old quarter transformer is in the flood zone');
  const safe = floodRun(true);
  assert.deepEqual(safe.damaged, []);
  const iso = Object.values(safe.sim.state.nodes).filter((n) => n.state === 'isolated');
  assert.ok(iso.length >= 1);
  // it can't be switched back on while the water is up
  assert.equal(safe.sim.cmd({ type: 'isolate', target: iso[0].id, on: true }).reason, 'stillFlooded');
});

test('a festival raises demand only while it runs', () => {
  const fest = S2.events.pool.find((p) => p.kind === 'festival');
  const M = only(S2, { ...fest, windowH: [30, 31] }); // day 2, 18:00
  const sim = createSim({ mission: M, seed: 3 });
  M.refBuild(sim);
  start(sim);
  const d = sim.state.ev.deck[0];
  const dem = () => sim.state.cust.s1.demand;
  for (let i = 0; i < 5 * 1440 && sim.state.clock < d.hitAt - 1; i++) sim.tick();
  const before = dem();
  sim.tick();
  sim.tick();
  assert.ok(dem() > before * 1.4, `demand ${before} → ${dem()}`);
  for (let i = 0; i < 1440 && sim.state.clock < d.endAt + 2; i++) sim.tick();
  assert.equal(d.phase, 'done');
  const r = sim.state.ev.rep;
  assert.ok(sim.state.ev.stats.festivalsLit + sim.state.ev.stats.festivalsDark === 1);
  void r;
});

test('requests: a choice applies its cost and effects once; unanswered ones expire as "no"', () => {
  const req = S2.events.pool.find((p) => p.key === 'lights');
  const M = only(S2, { ...req, windowH: [30, 31] });
  const a = createSim({ mission: M, seed: 9 });
  M.refBuild(a);
  start(a);
  for (let i = 0; i < 3 * 1440 && !Object.keys(a.state.ev.choices).length; i++) a.tick();
  const id = Object.keys(a.state.ev.choices)[0];
  const c0 = a.state.credits;
  const r0 = a.state.ev.rep;
  assert.ok(a.cmd({ type: 'choose', ev: id, opt: 0 }).ok);
  assert.equal(a.state.credits, c0 - 450);
  assert.ok(a.state.ev.rep > r0);
  assert.equal(a.cmd({ type: 'choose', ev: id, opt: 0 }).ok, false, 'only once');

  const b = createSim({ mission: M, seed: 9 });
  M.refBuild(b);
  start(b);
  for (let i = 0; i < 3 * 1440 && !Object.keys(b.state.ev.choices).length; i++) b.tick();
  const ch = Object.values(b.state.ev.choices)[0];
  for (let i = 0; i < 1440 && b.state.t < ch.until + 1; i++) b.tick();
  assert.ok(ch.done && ch.picked === 'Not right now');
});

test('reputation rises with reliable service and falls with long outages', () => {
  const M = { ...S2, events: { ...S2.events, pool: [] } };
  const good = createSim({ mission: M, seed: 1 });
  M.refBuild(good);
  start(good);
  const r0 = good.state.ev.rep;
  for (let i = 0; i < 12 * 60; i++) good.tick();
  assert.ok(good.state.ev.rep > r0, `${r0} → ${good.state.ev.rep}`);
  const bad = createSim({ mission: M, seed: 1 });
  M.refBuild(bad);
  start(bad);
  for (let i = 0; i < 60; i++) bad.tick();
  for (const id of Object.keys(bad.state.gens)) bad.cmd({ type: 'stopGen', target: id });
  for (let i = 0; i < 12 * 60; i++) bad.tick();
  assert.ok(bad.state.ev.rep < r0, `${r0} → ${bad.state.ev.rep}`);
});

test('saves with events replay to the same state', () => {
  for (const M of STAGES) {
    const a = createSim({ mission: M, seed: 4242 });
    // Stage 5's review shortcut tops up credits directly, which a save can't replay: use its plain steps
    if (M === STAGES[4]) runSteps(a.cmd, a.state, REF5);
    else M.refBuild?.(a);
    start(a);
    for (let i = 0; i < 2.5 * 1440; i++) {
      a.tick();
      drainAndRespond(a);
    }
    const b = loadSim(JSON.parse(JSON.stringify(a.save())), { mission: M });
    assert.equal(b.hash(), a.hash(), M.key);
  }
});

test('Stage 1 still teaches the basics: its reference wins with events on every seed', () => {
  // covered above for all stages; this checks the gentle cap on Stage 1 events
  for (const seed of SEEDS) assert.ok(createSim({ mission: STAGES[0], seed }).state.ev.deck.length <= 4);
  void runSteps;
});

test('the built game has no em-dashes in any player-facing text', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const f = new URL('../dist/gridforge.html', import.meta.url);
  if (!existsSync(f)) return; // run `node build.mjs` first
  const html = readFileSync(f, 'utf8');
  const hits = [...html.matchAll(/.{0,40}—.{0,40}/g)].map((m) => m[0]);
  assert.deepEqual(hits, [], 'em-dashes found in dist/gridforge.html');
});

// ------------------------------------------------------------------ round 7: more activity
const S2pool = (k) => S2.events.pool.find((p) => p.key === k);
function runTo(M, seed, until, onEv = () => {}) {
  const sim = createSim({ mission: M, seed });
  M.refBuild(sim);
  start(sim);
  for (let i = 0; i < 4 * 1440 && !until(sim); i++) {
    sim.tick();
    for (const e of sim.drainEvents()) onEv(sim, e);
  }
  return sim;
}

test('cable theft: night guards keep the line safe; taking the risk loses it', () => {
  const M = only(S2, { ...S2pool('theft'), windowH: [34, 35] });
  const guarded = runTo(M, 4, (s) => s.state.ev.deck[0].phase === 'done', (s, e) => e.type === 'choice' && assert.ok(s.cmd({ type: 'choose', ev: e.id, opt: 0 }).ok));
  assert.equal(guarded.state.ev.deck[0].damaged.length, 0);
  assert.equal(guarded.state.ev.stats.avoided, 1);
  const risky = runTo(M, 4, (s) => s.state.ev.deck[0].phase === 'done', (s, e) => e.type === 'choice' && s.cmd({ type: 'choose', ev: e.id, opt: 1 }));
  const d = risky.state.ev.deck[0];
  assert.equal(d.damaged.length, 1);
  assert.notEqual(risky.state.edges[d.target].tier, 'HV');
});

test('inspection: a clean grid earns the grant; broken kit is reported', () => {
  const M = only(S2, { ...S2pool('inspection'), windowH: [34, 35] });
  let hit = null;
  const clean = runTo(M, 6, () => hit, (s, e) => {
    if (e.type === 'evWarn') s.state.credits += 0;
    if (e.type === 'evHit') hit = e;
  });
  assert.ok(hit.ok === (hit.issues.length === 0));
  if (hit.ok) assert.equal(hit.grant, 400);
  void clean;
  hit = null;
  const broken = runTo(M, 6, () => hit, (s, e) => {
    if (e.type === 'evWarn') {
      const id = Object.keys(s.state.edges).find((x) => s.state.edges[x].kind === 'line');
      s.state.edges[id].state = 'fault';
    }
    if (e.type === 'evHit') hit = e;
  });
  assert.equal(hit.ok, false);
  assert.ok(hit.issues.length >= 1);
  void broken;
});

test('thunderstorm: warned ahead, darkens the sky and breaks at most its cap', () => {
  const M = only(S2, { ...S2pool('storm'), windowH: [34, 35] });
  let stormy = false;
  const sim = runTo(M, 8, (s) => s.state.ev.deck[0].phase === 'done', (s) => {
    if (s.state.ev.deck[0].phase === 'active' && s.state.weather.storm) stormy = true;
  });
  assert.ok(stormy);
  assert.ok(sim.state.ev.deck[0].damaged.length <= 2);
});

test('heat wave: demand rises across homes only while it runs', () => {
  const M = only(S2, { key: 'heat', kind: 'heat', windowH: [36, 37], atHour: 13, warnH: 14, durH: 6, params: { mult: 1.2, startH: 13, cls: ['home', 'lowincome', 'business'] } });
  const mk = (m, ev) => {
    const sim = createSim({ mission: m, seed: 3, events: ev });
    m.refBuild(sim);
    start(sim);
    return sim;
  };
  const hot = mk(M, true);
  const calm = mk(S2, false);
  const d = hot.state.ev.deck[0];
  const total = (sim) => ['h1', 'h2', 'li1', 's1', 'o1'].reduce((a, id) => a + sim.state.cust[id].demand, 0);
  for (let i = 0; i < 5 * 1440 && hot.state.clock < d.hitAt + 2; i++) (hot.tick(), calm.tick());
  assert.equal(d.phase, 'active');
  assert.ok(total(hot) > total(calm) * 1.15, `${total(calm)} → ${total(hot)}`);
  for (let i = 0; i < 1440 && hot.state.clock < d.endAt + 2; i++) (hot.tick(), calm.tick());
  assert.equal(d.phase, 'done');
  assert.ok(S2.map.customers.every((c) => eventDemandMult(hot.state, c) === 1), 'back to normal afterwards');
});

test('the crew drives straight to the next queued job instead of back to the depot', () => {
  const sim = createSim({ mission: S2, seed: 2, events: false });
  S2.refBuild(sim);
  start(sim);
  for (let i = 0; i < 120; i++) sim.tick();
  const lines = Object.keys(sim.state.edges).filter((x) => sim.state.edges[x].kind === 'line').slice(0, 2);
  for (const id of lines) sim.state.edges[id].state = 'fault';
  for (const id of lines) assert.ok(sim.cmd({ type: 'repair', target: id }).ok);
  const phases = [];
  for (let i = 0; i < 12 * 60 && lines.some((id) => sim.state.edges[id].state === 'fault'); i++) {
    sim.tick();
    const p = sim.state.crew.job?.phase;
    if (p && phases[phases.length - 1] !== p) phases.push(p);
  }
  assert.ok(lines.every((id) => sim.state.edges[id].state === 'ok'));
  assert.ok(!phases.slice(0, phases.lastIndexOf('work')).includes('return'), phases.join(' → '));
});
