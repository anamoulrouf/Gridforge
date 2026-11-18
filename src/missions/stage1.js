// Stage 1 · The Beginning — "Light the First District" (GDD §25).
// Packages the original Stage 1 content for the mission framework without changing it.
import { BALANCE } from '../data/balance.js';
import { MISSION1 } from '../data/mission1.js';
import { S } from '../data/strings.js';
import { LINES, TUTORIAL, ENDING } from '../data/dialogue.js';
import { OBJECTIVES, evalObjective, computeScore, computeMetrics } from '../sim/mission.js';
import { objectiveGuide } from '../ui/guide.js';
import { drainAndRespond } from '../sim/events.js';

const POWERED = new Set(['on', 'partial']);

/** Scripted, telegraphed transformer fault (GDD §10): warn at ~18:00 day 2, trip 1 h later. */
function faultDirector(state) {
  const bal = BALANCE;
  const F = state.fault;
  const day = Math.floor(state.clock / 1440) + 1;
  const hourMin = state.clock % 1440;
  if (F.phase === 'pending') {
    if (day < bal.fault.earliestDay) return;
    if (hourMin < bal.fault.warnHour * 60 + state.faultJitter && day === bal.fault.earliestDay) return;
    if ((state.flow.powered || 0) < bal.fault.minPowered) return;
    let best = null;
    for (const id of Object.keys(state.nodes).sort()) {
      const n = state.nodes[id];
      if (n.kind !== 'xfmr' || n.state !== 'ok' || !n.energized) continue;
      const k = (n.customers || []).length;
      if (!best || k > best.k) best = { id, k };
    }
    if (!best || best.k === 0) return;
    F.phase = 'warn';
    F.target = best.id;
    F.warnT = state.t;
    F.tripT = state.t + bal.fault.warnLeadH * 60;
    state.nodes[best.id].overheat = true;
    return { emit: ['faultWarn', { target: best.id, inMin: bal.fault.warnLeadH * 60 }] };
  }
  if (F.phase === 'warn' && state.t >= F.tripT) {
    const n = state.nodes[F.target];
    if (!n) {
      F.phase = 'pending';
      return;
    }
    n.state = 'fault';
    n.overheat = false;
    n.condition = 20;
    F.phase = 'active';
    F.tripT = state.t;
    F.affected = [...(n.customers || [])];
    return { emit: ['fault', { target: n.id, affected: F.affected }], resolve: true };
  }
}

const objectives = OBJECTIVES.map((o) => ({
  ...o,
  label: S.objectives[o.id],
  live: o.id === 'losses',
  eval: (state) => evalObjective(state, o.id),
  guide: (state, bal, ctx) => objectiveGuide(state, bal, o.id, ctx),
}));

export default {
  id: MISSION1.id,
  n: 1,
  key: 'stage1',
  stageName: S.stageName,
  name: S.missionName,
  region: 'Riverside',
  blurb: 'A rural town has never had grid power. Build the first network from a diesel generator to 13 customers.',
  learns: ['Generation → transmission → distribution', 'Power (kW) vs energy (kWh)', 'Capacity and overload', 'Fault response'],
  map: MISSION1,
  bal: BALANCE,
  systems: { economy: false },
  tools: ['select', 'line', 'xfmr', 'drop', 'remove'],
  chips: ['credits', 'demand', 'gen', 'fuel', 'powered', 'rel', 'loss'],
  objectives,
  weather: {},
  // Run events (one or two per playthrough, gentle: this is the first lesson)
  events: {
    count: [1, 2],
    avoidH: [[41, 47]], // the scripted transformer fault on day 2 evening
    pool: [
      { key: 'lane', kind: 'arrivals', weight: 2, windowH: [24, 38], warnH: 6, durH: 12, params: { group: 'lane', at: { x: 92, z: -28 }, title: 'Three new families are moving in', text: 'New homes are going up on the east lane, past the Mbeki home.', say: 'Three families are moving onto the east lane. Can we have their lights on from the first night?', goodNews: 'Welcome home! New families on the east lane get power on day one.', badNews: 'New families on the east lane still waiting for power.' } },
      { key: 'wedding', kind: 'festival', weight: 2, windowH: [60, 90], atHour: 18, warnH: 20, durH: 5, params: { name: 'The Adeyemi wedding', text: 'The Adeyemi family is holding the wedding party at the Town Market.', ids: ['market', 'h9', 'h10'], mult: 1.3, startH: 18, at: { x: 60, z: 30 }, say: 'The whole town is invited to the Adeyemi wedding at the market. Lights and music all evening!', goodNews: 'Wedding at the market dances until midnight under bright lights.', badNews: 'Power cut leaves wedding guests in the dark.' } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [52, 76], warnH: 3 },
    ],
    protests: { outages: 4, credit: 300 },
  },
  director(state, api) {
    const r = faultDirector(state);
    if (r?.emit) api.emit(...r.emit);
    return r?.resolve ? 'resolve' : undefined;
  },
  after(state, api) {
    // clinic outage outside the scripted fault (score: reliability)
    const cl = state.cust.clinic;
    if (cl && cl.everPowered && !POWERED.has(cl.status)) {
      const scripted = state.fault.phase === 'active' && cl.xfmr === state.fault.target && cl.status === 'xfmrDown';
      if (!scripted) state.stats.clinicOutMinNonFault++;
    }
    // stability window after the fault is repaired
    // new arrivals only count once you've connected them
    const allOn = api.map.customers.every((c) => state.cust[c.id].status === 'on' || (c.surprise && !state.cust[c.id].dropped));
    if (state.fault.phase === 'repaired' && allOn) state.stableMin++;
    else if (state.fault.phase === 'repaired') {
      if (state.stableMin > 0) api.emit('stableReset');
      state.stableMin = 0;
    }
  },
  /** Reference strategy (tests, review "Play ending"): build, start, refuel, repair. */
  autoplay(sim) {
    let last = null;
    const at = (x, z) => Object.keys(sim.state.nodes).find((id) => Math.hypot(sim.state.nodes[id].x - x, sim.state.nodes[id].z - z) < 1);
    for (const s of MISSION1.reference) {
      const from = s.from === '@last' ? last : typeof s.from === 'string' && s.from.startsWith('@node:') ? at(...s.from.slice(6).split(',').map(Number)) : s.from;
      if (s.type === 'line') last = sim.cmd({ type: 'line', from, to: s.to }).last;
      else if (s.type === 'transformer') sim.cmd({ type: 'transformer', at: s.at === '@last' ? last : s.at });
      else sim.cmd({ type: 'drop', building: s.building });
    }
    sim.cmd({ type: 'inspect', target: 'gen' });
    sim.cmd({ type: 'inspect', target: 'demand' });
    sim.cmd({ type: 'startGen' });
    for (let i = 0; i < 5 * 1440 && !sim.state.result; i++) {
      sim.tick();
      if (sim.state.gen.fuel < 40 && !sim.state.orders.length) sim.cmd({ type: 'order', item: 'fuel' });
      for (const e of drainAndRespond(sim)) if (e.type === 'fault') sim.cmd({ type: 'repair', target: e.target });
    }
  },
  score: (state) => computeScore(state),
  metrics: (state) => computeMetrics(state),
  ui: { tutorial: TUTORIAL, lines: LINES, ending: ENDING, endTitle: 'The First District is lit' },
  camera: { x: -22, z: 8, dist: 310 },
};
