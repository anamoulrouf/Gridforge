// Stage 1 · The Beginning — "Light the First District" (GDD §25).
// Packages the original Stage 1 content for the mission framework without changing it.
import { BALANCE } from '../data/balance.js';
import { MISSION1 } from '../data/mission1.js';
import { S } from '../data/strings.js';
import { LINES, TUTORIAL, ENDING } from '../data/dialogue.js';
import { OBJECTIVES, evalObjective, computeScore, computeMetrics } from '../sim/mission.js';
import { objectiveGuide } from '../ui/guide.js';

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
    const allOn = api.map.customers.every((c) => state.cust[c.id].status === 'on');
    if (state.fault.phase === 'repaired' && allOn) state.stableMin++;
    else if (state.fault.phase === 'repaired') {
      if (state.stableMin > 0) api.emit('stableReset');
      state.stableMin = 0;
    }
  },
  score: (state) => computeScore(state),
  metrics: (state) => computeMetrics(state),
  ui: { tutorial: TUTORIAL, lines: LINES, ending: ENDING, endTitle: 'The First District is lit' },
  camera: { x: -22, z: 8, dist: 310 },
};
