// Mission 1 objectives, victory score and ending choice (GDD §25, §13 endings).

export const OBJECTIVES = [
  { id: 'inspect', primary: true },
  { id: 'route', primary: true },
  { id: 'xfmr', primary: true },
  { id: 'connect', primary: true },
  { id: 'start', primary: true },
  { id: 'revenue', primary: true },
  { id: 'fault', primary: true },
  { id: 'stable', primary: true },
  { id: 'service', primary: false },
  { id: 'losses', primary: false },
];

/** Returns { done, progress:[cur,max] | null } for each objective (pure read of state). */
export function evalObjective(state, id) {
  const f = state.flow;
  switch (id) {
    case 'inspect':
      return { done: !!(state.inspected.gen && state.inspected.demand), progress: [(state.inspected.gen ? 1 : 0) + (state.inspected.demand ? 1 : 0), 2] };
    case 'route': {
      const ok = Object.values(state.edges).some((e) => e.kind === 'line' && e.tier === 'MV' && (e.a === 'gen' || e.b === 'gen'));
      return { done: ok, progress: null };
    }
    case 'xfmr': {
      const ok = Object.values(state.nodes).some((n) => n.kind === 'xfmr' && n.connected);
      return { done: ok, progress: null };
    }
    case 'connect':
      return { done: f.connected === state.map.customers.length, progress: [f.connected || 0, state.map.customers.length] };
    case 'start':
      return { done: state.gen.status === 'running' && f.powered > 0 && f.deficitKW < 0.01, progress: null };
    case 'revenue':
      return { done: state.stats.bills > 0, progress: null };
    case 'fault':
      return { done: state.fault.phase === 'repaired', progress: null };
    case 'stable':
      return { done: state.stableMin >= 24 * 60, progress: [Math.floor(state.stableMin / 60), 24] };
    case 'service':
      return { done: state.stats.serviced > 0, progress: null };
    case 'losses': {
      const avg = state.stats.kWhGen > 0 ? (state.stats.kWhLoss / state.stats.kWhGen) * 100 : 0;
      return { done: state.stats.kWhGen > 0 && avg < 5, progress: null, live: true };
    }
  }
  return { done: false, progress: null };
}

export function computeScore(state) {
  const s = state.stats;
  const coverage = s.custMinTotal > 0 ? s.custMinPowered / s.custMinTotal : 0;
  const clinicNonFaultH = s.clinicOutMinNonFault / 60;
  const reliability = Math.max(0, 30 - 8 * s.trips - 3 * clinicNonFaultH);
  const restoreMin = state.fault.restoredT != null ? state.fault.restoredT - state.fault.tripT : 999;
  const restoration = restoreMin <= 150 ? 15 : restoreMin >= 480 ? 3 : 15 - ((restoreMin - 150) / 330) * 12;
  const finance = Math.max(0, Math.min(15, ((state.credits - 500) / 2000) * 15));
  const lossPct = s.kWhGen > 0 ? (s.kWhLoss / s.kWhGen) * 100 : 0;
  const efficiency = lossPct <= 3 ? 10 : lossPct >= 8 ? 0 : 10 - ((lossPct - 3) / 5) * 10;
  const parts = {
    coverage: Math.round(coverage * 30),
    reliability: Math.round(reliability),
    restoration: Math.round(restoration),
    finance: Math.round(finance),
    efficiency: Math.round(efficiency),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const ending = total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon';
  return { parts, total, ending, lossPct, restoreMin, coverage };
}

export function computeMetrics(state) {
  const s = state.stats;
  const hours = s.firstLightT != null ? Math.max(1 / 60, (state.t - s.firstLightT) / 60) : 0;
  const conds = Object.values(state.nodes).filter((n) => n.kind === 'xfmr').map((n) => n.condition);
  conds.push(state.gen.condition);
  return {
    powered: state.flow.powered,
    total: state.map.customers.length,
    kWh: s.kWhDelivered,
    avgKW: hours > 0 ? s.kWhDelivered / hours : 0,
    peakKW: s.peakKW,
    outageCustH: (s.custMinTotal - s.custMinPowered) / 60,
    restoreMin: state.fault.restoredT != null ? state.fault.restoredT - state.fault.tripT : null,
    lossPct: s.kWhGen > 0 ? (s.kWhLoss / s.kWhGen) * 100 : 0,
    earned: s.earned,
    spent: s.spent,
    credits: state.credits,
    condition: conds.reduce((a, b) => a + b, 0) / conds.length,
    trips: s.trips,
    decisions: { split: s.trips === 0 && Object.values(state.nodes).filter((n) => n.kind === 'xfmr').length >= 2, preDispatch: !!state.fault.preDispatched, serviced: s.serviced > 0, ordered: s.fuelOrders > 0 },
  };
}
