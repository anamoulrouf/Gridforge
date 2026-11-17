// Power delivery solver (GDD §9.2 validation, §9.3 sequence, §9.4 load shedding, §7.5 losses).
// A customer is powered only if: a running, fuelled source exists; a valid path reaches it through
// tier-compatible, in-service infrastructure; and supply remains after losses and the shed policy.
// Simplified model: radial operation on the shortest-length path tree from the generator.

import { busOf, xfmrAvailable } from './grid.js';
import { CUSTOMER_TYPES } from '../data/balance.js';

function buildGraph(state, ignoreXfmrState) {
  const adj = new Map();
  const add = (u, v, w, edgeId) => {
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u).push({ v, w, edgeId });
    adj.get(v).push({ v: u, w, edgeId });
  };
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.kind === 'xfmr' && (ignoreXfmrState || xfmrAvailable(n))) add(id + ':hv', id + ':lv', 0.001, 'X:' + id);
  }
  for (const id in state.edges) {
    const e = state.edges[id];
    if (e.kind === 'line') add(busOf(state, e.a, e.tier), busOf(state, e.b, e.tier), e.length, id);
    else add(busOf(state, e.a, 'LV'), 'c:' + e.b, 1, id);
  }
  return adj;
}

/** Deterministic Dijkstra from the generator bus. Returns Map bus -> {d, parent, edgeId}. */
function shortestTree(adj) {
  const best = new Map([['gen', { d: 0, parent: null, edgeId: null }]]);
  const done = new Set();
  // tiny graphs: O(n^2) selection keeps ordering deterministic
  for (;;) {
    let u = null;
    let ud = Infinity;
    for (const [k, v] of best) {
      if (done.has(k)) continue;
      if (v.d < ud || (v.d === ud && k < u)) {
        u = k;
        ud = v.d;
      }
    }
    if (u === null) break;
    done.add(u);
    for (const { v, w, edgeId } of adj.get(u) || []) {
      const nd = ud + w;
      const cur = best.get(v);
      if (!cur || nd < cur.d - 1e-9) best.set(v, { d: nd, parent: u, edgeId });
    }
  }
  return best;
}

export function demandAt(bal, type, hour) {
  return CUSTOMER_TYPES[type].nominal * bal.profiles[type](hour);
}

export function genAvailableKW(state, bal) {
  const g = state.gen;
  if (g.status === 'off' || g.status === 'nofuel') return 0;
  let cap = bal.generator.maxKW;
  if (g.status === 'starting') cap *= Math.min(1, g.rampMin / (bal.generator.rampH * 60));
  if (g.servicing) cap = Math.min(cap, bal.generator.servicingCapKW);
  return cap;
}

/**
 * Solve the network for the current hour. Writes results into state.flow and per-entity fields.
 */
export function solve(state, bal) {
  const hour = Math.floor((state.clock % 1440) / 60);
  const live = shortestTree(buildGraph(state, false));
  const topo = shortestTree(buildGraph(state, true));
  const avail = genAvailableKW(state, bal);
  const net = bal.network;

  // Path (list of edge ids incl. transformer pseudo-edges) from generator to a customer bus
  const pathOf = (tree, bus) => {
    const out = [];
    let cur = tree.get(bus);
    let k = bus;
    while (cur && cur.parent !== null) {
      out.push(cur.edgeId);
      k = cur.parent;
      cur = tree.get(k);
    }
    return out;
  };

  const customers = state.map.customers;
  const cust = state.cust;
  let townDemand = 0;
  const reachable = [];
  for (const c of customers) {
    const cs = cust[c.id];
    cs.demand = demandAt(bal, c.type, hour);
    townDemand += cs.demand;
    cs.served = 0;
    cs.supplyFrac = 0;
    cs.xfmr = null;
    const bus = 'c:' + c.id;
    cs.dropped = !!state.dropByBuilding[c.id];
    cs.connected = topo.has(bus);
    if (!cs.dropped) {
      cs.status = 'unconnected';
      continue;
    }
    if (!cs.connected) {
      cs.status = 'nopath';
      continue;
    }
    const tp = pathOf(topo, bus);
    const xf = tp.find((e) => e.startsWith('X:'));
    cs.xfmr = xf ? xf.slice(2) : null;
    if (!live.has(bus)) {
      // blocked by an out-of-service transformer on the topological path
      cs.status = 'xfmrDown';
      continue;
    }
    if (state.gen.status === 'nofuel') {
      cs.status = 'noFuel';
      continue;
    }
    if (avail <= 0) {
      cs.status = 'genOff';
      continue;
    }
    reachable.push({ c, cs, path: pathOf(live, bus) });
  }

  // Edge rating lookup
  const ratingOf = (eid) => {
    if (eid.startsWith('X:')) return bal.transformer.ratingKW;
    const e = state.edges[eid];
    if (e.kind === 'drop') return Infinity;
    return e.tier === 'MV' ? net.mvRatingKW : net.lvRatingKW;
  };

  const computeLoads = (servedList) => {
    const load = new Map();
    for (const r of servedList) for (const eid of r.path) load.set(eid, (load.get(eid) || 0) + r.kw);
    let losses = 0;
    for (const [eid, kw] of load) {
      if (eid.startsWith('X:')) {
        const n = state.nodes[eid.slice(2)];
        const worn = n.condition < 50 ? 1.5 : 1;
        losses += kw * net.transformerLoss * worn;
      } else {
        const e = state.edges[eid];
        if (e.kind === 'drop') continue;
        losses += kw * net.lossPer100m * (e.length / 100) * (kw / ratingOf(eid));
      }
    }
    return { load, losses };
  };

  // Dispatch with load-shed policy
  let served = [];
  if (reachable.length) {
    const totalD = reachable.reduce((s, r) => s + r.cs.demand, 0);
    let all = reachable.map((r) => ({ ...r, kw: r.cs.demand }));
    let res = computeLoads(all);
    if (totalD + res.losses <= avail + 1e-9) {
      served = all;
    } else if (state.policy === 'equal') {
      // Equal proportional reduction for everyone
      let f = avail / (totalD + res.losses);
      for (let i = 0; i < 4; i++) {
        all = reachable.map((r) => ({ ...r, kw: r.cs.demand * f }));
        res = computeLoads(all);
        f = Math.max(0, Math.min(1, avail / (totalD + res.losses / Math.max(f, 1e-6))));
      }
      served = all;
    } else {
      // Protect critical services: serve by priority, shed the rest whole
      const order = [...reachable].sort(
        (p, q) => CUSTOMER_TYPES[q.c.type].priority - CUSTOMER_TYPES[p.c.type].priority || (p.c.id < q.c.id ? -1 : 1),
      );
      const pick = [];
      for (const r of order) {
        const trial = [...pick, { ...r, kw: r.cs.demand }];
        const tr = computeLoads(trial);
        if (trial.reduce((s, x) => s + x.kw, 0) + tr.losses <= avail + 1e-9) pick.push({ ...r, kw: r.cs.demand });
      }
      served = pick;
    }
  }

  const { load, losses } = computeLoads(served);
  const servedSet = new Map(served.map((r) => [r.c.id, r.kw]));
  let servedKW = 0;
  for (const r of reachable) {
    const kw = servedSet.get(r.c.id) || 0;
    r.cs.served = kw;
    r.cs.supplyFrac = r.cs.demand > 0 ? kw / r.cs.demand : 1;
    servedKW += kw;
    if (kw <= 0) r.cs.status = 'shed';
    else if (r.cs.supplyFrac < 0.98) r.cs.status = 'partial';
    else r.cs.status = 'on';
  }

  // Write loads onto edges and transformers
  for (const id in state.edges) state.edges[id].loadKW = load.get(id) || 0;
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.kind === 'xfmr') {
      n.loadKW = load.get('X:' + id) || 0;
      n.loadPct = (n.loadKW / bal.transformer.ratingKW) * 100;
      // Forecast: peak demand of downstream customers (for §10 telegraphing)
      let fc = 0;
      let fh = 0;
      for (let h = 0; h < 24; h++) {
        const v = forecastAtHour(state, bal, id, h);
        if (v > fc + 1e-9) {
          fc = v;
          fh = h;
        }
      }
      n.forecastPeakKW = fc;
      n.forecastPeakHour = fh;
      n.customers = customers.filter((c) => cust[c.id].xfmr === id).map((c) => c.id);
    }
  }

  const f = state.flow;
  f.townDemandKW = townDemand;
  f.connectedDemandKW = reachable.reduce((s, r) => s + r.cs.demand, 0) + customers.filter((c) => ['xfmrDown', 'genOff', 'noFuel'].includes(cust[c.id].status)).reduce((s, c) => s + cust[c.id].demand, 0);
  f.servedKW = servedKW;
  f.lossKW = losses;
  f.genKW = served.length ? servedKW + losses : 0;
  f.availKW = avail;
  f.lossPct = f.genKW > 0 ? (losses / f.genKW) * 100 : 0;
  f.powered = customers.filter((c) => cust[c.id].status === 'on' || cust[c.id].status === 'partial').length;
  f.connected = customers.filter((c) => cust[c.id].connected).length;
  f.deficitKW = Math.max(0, reachable.reduce((s, r) => s + r.cs.demand, 0) + losses - avail);
  // Energized buses (for visuals): everything on the live tree when the generator produces
  const energized = new Set();
  if (avail > 0) for (const [bus] of live) energized.add(bus);
  // Flow direction along each line (for the pulse visuals): +1 means a → b.
  for (const id in state.edges) state.edges[id].flowDir = 1;
  for (const [bus, info] of live) {
    if (!info.edgeId || info.edgeId.startsWith('X:')) continue;
    const e = state.edges[info.edgeId];
    if (!e) continue;
    const aBus = e.kind === 'drop' ? busOf(state, e.a, 'LV') : busOf(state, e.a, e.tier);
    e.flowDir = info.parent === aBus ? 1 : -1;
    void bus;
  }
  for (const id in state.edges) {
    const e = state.edges[id];
    e.energized = avail > 0 && (e.kind === 'drop' ? servedSet.has(e.b) : live.has(busOf(state, e.a, e.tier)) && live.has(busOf(state, e.b, e.tier)));
  }
  for (const id in state.nodes) {
    const n = state.nodes[id];
    n.energized = avail > 0 && (n.kind === 'xfmr' ? live.has(id + ':hv') : live.has(id));
    n.connected = n.kind === 'xfmr' ? topo.has(id + ':hv') : topo.has(id);
  }
  return f;
}

/** Peak multiplier of a profile over the day (for forecasting). */
export function peakMult(bal, type) {
  let m = 0;
  for (let h = 0; h < 24; h++) m = Math.max(m, bal.profiles[type](h));
  return m;
}

/** Forecast evening peak load on a transformer = sum of downstream customers' demand at the town peak hour. */
export function forecastAtHour(state, bal, xfmrId, hour) {
  let s = 0;
  for (const c of state.map.customers) if (state.cust[c.id].xfmr === xfmrId) s += demandAt(bal, c.type, hour);
  return s;
}
