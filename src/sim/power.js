// Power delivery solver (GDD §9.2 validation, §9.3 sequence, §9.4 load shedding, §7.5 losses).
// A customer is powered only if: an available source exists in its network island; a valid path
// reaches it through tier-compatible, in-service infrastructure; and supply remains after losses
// and the shed policy.
// Simplified model (labelled in-game): each island is dispatched as a single "copper plate";
// line loading follows the shortest-length tree from the island's sources.

import { busOf, xfmrAvailable, lineRating, xfmrRating, ratioOf } from './grid.js';
import { CUSTOMER_TYPES } from '../data/balance.js';
import { solarFrac, windFrac } from './weather.js';

const CONTRIB = (n) => n.kind === 'gen';

// Who draws through each line in the last solve (UI explanations only; kept off the state so
// saves and replay hashes are unaffected).
const contribs = new WeakMap();
/** Customers whose supply flows through line `edgeId`, largest first: [{ id, kw }]. */
export function lineContributors(state, edgeId) {
  return (contribs.get(state)?.get(edgeId) || []).slice().sort((a, b) => b.kw - a.kw || (a.id < b.id ? -1 : 1));
}

function buildGraph(state, ignoreState) {
  const adj = new Map();
  const add = (u, v, w, edgeId) => {
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u).push({ v, w, edgeId });
    adj.get(v).push({ v: u, w, edgeId });
  };
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.kind === 'xfmr' && (ignoreState || xfmrAvailable(n))) add(id + ':hv', id + ':lv', 0.001, 'X:' + id);
    if (CONTRIB(n) && !adj.has(id)) adj.set(id, []);
  }
  for (const id in state.edges) {
    const e = state.edges[id];
    if (!ignoreState && (e.state === 'trip' || e.state === 'fault' || e.open)) continue;
    if (ignoreState && e.open && !e.closable) continue;
    if (e.kind === 'line' || e.kind === 'switch') add(busOf(state, e.a, e.tier), busOf(state, e.b, e.tier), e.length, id);
    else add(busOf(state, e.a, e.tier || 'LV'), 'c:' + e.b, 1, id);
  }
  return adj;
}

/** Deterministic multi-source Dijkstra. Returns Map bus -> {d, parent, edgeId, root}. */
function shortestTree(adj, seeds) {
  const best = new Map(seeds.map((s) => [s, { d: 0, parent: null, edgeId: null, root: s }]));
  const done = new Set();
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
    const root = best.get(u).root;
    for (const { v, w, edgeId } of adj.get(u) || []) {
      const nd = ud + w;
      const cur = best.get(v);
      if (!cur || nd < cur.d - 1e-9) best.set(v, { d: nd, parent: u, edgeId, root });
    }
  }
  return best;
}

/** Connected components of the live graph: bus -> component id (smallest bus name). */
function components(adj) {
  const comp = new Map();
  const keys = [...adj.keys()].sort();
  for (const k of keys) {
    if (comp.has(k)) continue;
    const stack = [k];
    comp.set(k, k);
    while (stack.length) {
      const u = stack.pop();
      for (const { v } of adj.get(u) || []) {
        if (!comp.has(v)) {
          comp.set(v, k);
          stack.push(v);
        }
      }
    }
  }
  return comp;
}

/** Customer type definition: mission types override the Stage 1 defaults. */
export function typeDef(bal, type) {
  if (bal.types && bal.types[type]) return bal.types[type];
  return { ...CUSTOMER_TYPES[type], profile: bal.profiles[type] };
}

export function demandAt(bal, type, hour) {
  const t = typeDef(bal, type);
  return t.nominal * t.profile(hour);
}

/** Source type behaviour (mission balance may add types). */
export function srcType(bal, type) {
  return (bal.sourceTypes && bal.sourceTypes[type]) || (type === 'diesel' ? { dispatch: true, fuel: 'tank', rampH: bal.generator.rampH, maxKW: bal.generator.maxKW } : { dispatch: true });
}

/** Rated kW of a source. */
export function ratedKW(bal, g) {
  return g.kw ?? srcType(bal, g.type).maxKW ?? bal.generator.maxKW;
}

/** Available output (kW) of one source right now, and its must-run minimum. */
export function sourceAvail(state, bal, id, w) {
  const g = state.gens[id];
  const T = srcType(bal, g.type);
  const rated = ratedKW(bal, g);
  if (g.retired) return { avail: 0, min: 0 };
  if (T.variable === 'solar') return { avail: g.status === 'running' ? rated * solarFrac(w) * (g.damaged ? 0 : 1) : 0, min: 0, variable: true };
  if (T.variable === 'wind') return { avail: g.status === 'running' ? rated * windFrac(w) * (g.damaged ? 0 : 1) : 0, min: 0, variable: true };
  if (T.storage) {
    const disch = g.status === 'running' && g.mode !== 'hold' && g.mode !== 'charge' ? Math.min(rated, g.soc * 60) : 0;
    return { avail: disch, min: 0, storage: true };
  }
  if (g.status === 'off' || g.status === 'nofuel' || g.status === 'tripped') return { avail: 0, min: 0 };
  let cap = rated;
  if (g.status === 'starting') cap *= Math.min(1, g.rampMin / (Math.max(0.01, T.rampH ?? bal.generator.rampH) * 60));
  if (g.servicing) cap = Math.min(cap, T.servicingCapKW ?? bal.generator.servicingCapKW);
  if (T.reservoir) cap = Math.min(cap, Math.max(0, g.reservoir) * 60);
  const min = g.status === 'running' && T.minFrac ? rated * T.minFrac : 0;
  return { avail: cap, min: Math.min(min, cap) };
}

/** Legacy single-generator availability (Stage 1 HUD / tests). */
export function genAvailableKW(state, bal) {
  const w = state.weather || { sun: 0, cloud: 0, wind: 0 };
  return Object.keys(state.gens).reduce((s, id) => s + sourceAvail(state, bal, id, w).avail, 0);
}

/**
 * Solve the network for the current minute. Writes results into state.flow and per-entity fields.
 * ctx: { demandMod(state, c, kw, hour) } optional mission hook.
 */
export function solve(state, bal, ctx = {}) {
  const hour = Math.floor((state.clock % 1440) / 60);
  const w = state.weather || { sun: 0, cloud: 0, wind: 0, temp: 20 };
  const srcIds = Object.keys(state.gens).filter((id) => state.nodes[id]).sort();
  const liveAdj = buildGraph(state, false);
  const live = shortestTree(liveAdj, srcIds);
  const topo = shortestTree(buildGraph(state, true), srcIds);
  const comp = components(liveAdj);
  const net = bal.network;

  // Path (list of edge ids incl. transformer pseudo-edges) from a source to a bus
  const pathOf = (tree, bus) => {
    const out = [];
    let cur = tree.get(bus);
    while (cur && cur.parent !== null) {
      out.push(cur.edgeId);
      cur = tree.get(cur.parent);
    }
    return out;
  };

  // ---- sources available per island
  const islands = new Map(); // compId -> { avail, min, srcs:[{id, a}] , statuses:Set }
  for (const id of srcIds) {
    const c = comp.get(id) ?? id;
    if (!islands.has(c)) islands.set(c, { avail: 0, min: 0, srcs: [], statuses: new Set(), exportKW: 0 });
    const isl = islands.get(c);
    const a = sourceAvail(state, bal, id, w);
    isl.avail += a.avail;
    isl.min += a.min;
    isl.srcs.push({ id, ...a });
    isl.statuses.add(state.gens[id].status);
    state.gens[id].availKW = a.avail;
    state.gens[id].outKW = 0;
    state.gens[id].chargeKW = 0;
  }

  // ---- demand, connection and status per customer
  const customers = state.map.customers;
  const cust = state.cust;
  let townDemand = 0;
  let activeCount = 0;
  const reachable = [];
  for (const c of customers) {
    const cs = cust[c.id];
    cs.served = 0;
    cs.supplyFrac = 0;
    cs.xfmr = null;
    cs.sub = null;
    if (cs.active === false) {
      cs.status = 'planned';
      cs.demand = 0;
      cs.connected = false;
      continue;
    }
    activeCount++;
    let d = demandAt(bal, c.type, hour) * (c.scale || 1);
    if (ctx.demandMod) d = ctx.demandMod(state, c, d, hour, w);
    cs.pvKW = c.pvKWp && state.prosumers?.[c.id] ? c.pvKWp * solarFrac(w) : 0;
    cs.grossDemand = d;
    cs.demand = Math.max(0, d - cs.pvKW);
    cs.exportKW = Math.max(0, cs.pvKW - d);
    townDemand += cs.demand;
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
    const xf = tp.filter((e) => e.startsWith('X:')).map((e) => e.slice(2));
    cs.xfmr = xf.find((id) => (state.nodes[id].ratio || 'MV/LV') === 'MV/LV') || null;
    cs.sub = xf.find((id) => state.nodes[id].ratio === 'HV/MV') || null;
    if (!live.has(bus)) {
      // blocked by an out-of-service transformer or line on the topological path
      cs.status = tp.some((e) => !e.startsWith('X:') && state.edges[e] && (state.edges[e].state === 'trip' || state.edges[e].state === 'fault')) ? 'lineDown' : 'xfmrDown';
      continue;
    }
    const isl = islands.get(comp.get(bus));
    if (cs.exportKW > 0 && isl) isl.exportKW += cs.exportKW;
    if (!isl || isl.avail + isl.exportKW <= 0) {
      cs.status = isl && isl.statuses.has('nofuel') && ![...isl.statuses].some((s) => s === 'running' || s === 'starting') ? 'noFuel' : 'genOff';
      if (cs.demand <= 0 && cs.exportKW > 0) cs.status = 'on';
      continue;
    }
    reachable.push({ c, cs, path: pathOf(live, bus), isl: comp.get(bus) });
  }

  // ---- edge rating lookup and loading
  const ratingOf = (eid) => {
    if (eid.startsWith('X:')) return xfmrRating(bal, state.nodes[eid.slice(2)]);
    const e = state.edges[eid];
    if (e.kind === 'drop') return Infinity;
    return lineRating(bal, e.tier);
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

  // ---- dispatch with load-shed policy, island by island
  let served = [];
  const byIsl = new Map();
  for (const r of reachable) {
    if (!byIsl.has(r.isl)) byIsl.set(r.isl, []);
    byIsl.get(r.isl).push(r);
  }
  for (const [ci, list] of [...byIsl.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const isl = islands.get(ci);
    const avail = isl.avail + isl.exportKW;
    const totalD = list.reduce((s, r) => s + r.cs.demand, 0);
    let all = list.map((r) => ({ ...r, kw: r.cs.demand }));
    let res = computeLoads(all);
    if (totalD + res.losses <= avail + 1e-9) {
      served.push(...all);
    } else if (state.policy === 'equal') {
      let f = avail / (totalD + res.losses);
      for (let i = 0; i < 4; i++) {
        all = list.map((r) => ({ ...r, kw: r.cs.demand * f }));
        res = computeLoads(all);
        f = Math.max(0, Math.min(1, avail / (totalD + res.losses / Math.max(f, 1e-6))));
      }
      served.push(...all);
    } else {
      const pr = (r) => typeDef(bal, r.c.type).priority ?? 1;
      const order = [...list].sort((p, q) => pr(q) - pr(p) || (p.c.id < q.c.id ? -1 : 1));
      const pick = [];
      for (const r of order) {
        const trial = [...pick, { ...r, kw: r.cs.demand }];
        const tr = computeLoads(trial);
        if (trial.reduce((s, x) => s + x.kw, 0) + tr.losses <= avail + 1e-9) pick.push({ ...r, kw: r.cs.demand });
      }
      served.push(...pick);
    }
  }

  const { load, losses } = computeLoads(served);
  const via = new Map();
  for (const r of served) {
    if (r.kw <= 0) continue;
    for (const eid of r.path) {
      if (eid.startsWith('X:') || state.edges[eid]?.kind !== 'line') continue;
      if (!via.has(eid)) via.set(eid, []);
      via.get(eid).push({ id: r.c.id, kw: r.kw });
    }
  }
  contribs.set(state, via);
  const servedSet = new Map(served.map((r) => [r.c.id, r.kw]));
  let servedKW = 0;
  const islNeed = new Map();
  for (const r of reachable) {
    const kw = servedSet.get(r.c.id) || 0;
    r.cs.served = kw;
    r.cs.supplyFrac = r.cs.demand > 0 ? kw / r.cs.demand : 1;
    servedKW += kw;
    if (kw <= 0 && r.cs.demand > 0) r.cs.status = 'shed';
    else if (r.cs.supplyFrac < 0.98) r.cs.status = 'partial';
    else r.cs.status = 'on';
    islNeed.set(r.isl, (islNeed.get(r.isl) || 0) + kw);
  }
  // losses split across islands by served share
  const lossShare = (ci) => (servedKW > 0 ? (losses * (islNeed.get(ci) || 0)) / servedKW : 0);

  // ---- merit-order dispatch of sources in each island (GDD §9.3 step 3)
  const prio = state.dispatch || [];
  const rank = (type) => {
    const i = prio.indexOf(type);
    return i < 0 ? 99 : i;
  };
  let curtailedKW = 0;
  for (const [ci, isl] of islands) {
    let need = (islNeed.get(ci) || 0) + lossShare(ci);
    if (need <= 0 && isl.exportKW <= 0) continue;
    const giveTo = (s, kw) => {
      state.gens[s.id].outKW += kw;
      return kw;
    };
    // 1. must-run minimums (e.g. a coal unit can't go below 40 %)
    for (const s of isl.srcs) if (s.min > 0) need -= giveTo(s, s.min);
    // 2. prosumer exports (behind-the-meter solar) and variable renewables
    let surplus = 0;
    const expUse = Math.min(Math.max(0, need), isl.exportKW);
    need -= expUse;
    surplus += isl.exportKW - expUse;
    for (const s of isl.srcs.filter((x) => x.variable)) {
      const use = Math.min(Math.max(0, need), s.avail);
      need -= giveTo(s, use);
      surplus += s.avail - use;
    }
    // 3. storage discharge, then dispatchable units by the player's priority
    const disp = isl.srcs.filter((x) => !x.variable).sort((a, b) => rank(state.gens[a.id].type) - rank(state.gens[b.id].type) || (a.storage ? -1 : 0) - (b.storage ? -1 : 0) || (a.id < b.id ? -1 : 1));
    for (const s of disp) {
      if (need <= 1e-9) break;
      const room = s.avail - s.min;
      if (room <= 0) continue;
      need -= giveTo(s, Math.min(need, room));
    }
    // 4. surplus charges batteries (cannot create energy), the rest is curtailed
    if (need < 0) surplus += -need;
    for (const s of isl.srcs) {
      if (surplus <= 1e-9) break;
      const g = state.gens[s.id];
      if (!s.storage || g.status !== 'running' || g.mode === 'hold' || g.outKW > 0) continue;
      const T = srcType(bal, g.type);
      const room = Math.max(0, ((g.kwh ?? T.kwh) - g.soc) * 60);
      const ch = Math.min(ratedKW(bal, g), room, surplus);
      g.chargeKW = ch;
      surplus -= ch;
    }
    curtailedKW += Math.max(0, surplus);
  }

  // ---- write loads onto edges and transformers (+ 24 h forecast in one pass, §10 telegraphing)
  for (const id in state.edges) state.edges[id].loadKW = load.get(id) || 0;
  const fc = {};
  // upcoming festivals raise the forecast for the hours they run
  const fests = (state.ev?.deck || []).filter((d) => d.kind === 'festival' && (d.phase === 'warned' || d.phase === 'active') && d.ids);
  const fm = (id, h) => {
    let m = 1;
    for (const d of fests) {
      const h0 = d.p.startH ?? 18;
      const dur = (d.endAt - d.hitAt) / 60;
      if (d.ids.includes(id) && ((h - h0 + 24) % 24) < dur) m *= d.p.mult ?? 1.6;
    }
    return m;
  };
  for (const c of customers) {
    const cs = cust[c.id];
    if (cs.active === false) continue;
    const t = typeDef(bal, c.type);
    for (const xid of [cs.xfmr, cs.sub]) {
      if (!xid) continue;
      const arr = (fc[xid] ||= new Array(24).fill(0));
      for (let h = 0; h < 24; h++) arr[h] += t.nominal * t.profile(h) * (c.scale || 1) * (fests.length ? fm(c.id, h) : 1);
    }
  }
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.kind === 'xfmr') {
      n.loadKW = load.get('X:' + id) || 0;
      n.ratingKW = xfmrRating(bal, n);
      n.loadPct = (n.loadKW / n.ratingKW) * 100;
      n.customers = customers.filter((c) => cust[c.id].xfmr === id || cust[c.id].sub === id).map((c) => c.id);
      let pk = 0;
      let ph = 0;
      const arr = fc[id];
      if (arr) for (let h = 0; h < 24; h++) if (arr[h] > pk + 1e-9) [pk, ph] = [arr[h], h];
      n.forecastPeakKW = pk;
      n.forecastPeakHour = ph;
    }
  }

  const f = state.flow;
  const totalAvail = [...islands.values()].reduce((s, i) => s + i.avail, 0);
  f.townDemandKW = townDemand;
  f.activeCount = activeCount;
  f.connectedDemandKW = reachable.reduce((s, r) => s + r.cs.demand, 0) + customers.filter((c) => ['xfmrDown', 'lineDown', 'genOff', 'noFuel'].includes(cust[c.id].status)).reduce((s, c) => s + cust[c.id].demand, 0);
  f.servedKW = servedKW;
  f.lossKW = losses;
  f.genKW = Object.values(state.gens).reduce((s, g) => s + g.outKW, 0);
  if (!served.length && f.genKW < 1e-9) f.genKW = 0;
  f.availKW = totalAvail;
  f.curtailedKW = curtailedKW;
  f.chargeKW = Object.values(state.gens).reduce((s, g) => s + (g.chargeKW || 0), 0);
  f.exportKW = customers.reduce((s, c) => s + (cust[c.id].exportKW || 0), 0);
  f.lossPct = f.genKW > 0 ? (losses / f.genKW) * 100 : 0;
  f.powered = customers.filter((c) => cust[c.id].status === 'on' || cust[c.id].status === 'partial').length;
  f.connected = customers.filter((c) => cust[c.id].active !== false && cust[c.id].connected).length;
  f.deficitKW = Math.max(0, reachable.reduce((s, r) => s + r.cs.demand, 0) + losses - [...byIsl.keys()].reduce((s, ci) => s + islands.get(ci).avail + islands.get(ci).exportKW, 0));

  // energised buses (visuals): everything in an island with available supply
  const islOn = (bus) => {
    const i = islands.get(comp.get(bus));
    return !!i && i.avail + i.exportKW > 0;
  };
  for (const id in state.edges) state.edges[id].flowDir = 1;
  for (const [, info] of live) {
    if (!info.edgeId || info.edgeId.startsWith('X:')) continue;
    const e = state.edges[info.edgeId];
    if (!e) continue;
    const aBus = busOf(state, e.a, e.kind === 'drop' ? e.tier || 'LV' : e.tier);
    e.flowDir = info.parent === aBus ? 1 : -1;
  }
  for (const id in state.edges) {
    const e = state.edges[id];
    if (e.kind === 'drop') e.energized = servedSet.has(e.b) || (cust[e.b]?.status === 'on' && cust[e.b]?.exportKW > 0);
    else {
      const a = busOf(state, e.a, e.tier);
      const b = busOf(state, e.b, e.tier);
      e.energized = live.has(a) && live.has(b) && islOn(a) && !(e.state === 'trip' || e.state === 'fault' || e.open);
      e.ratingKW = lineRating(bal, e.tier);
      e.loadPct = (e.loadKW / e.ratingKW) * 100;
    }
  }
  for (const id in state.nodes) {
    const n = state.nodes[id];
    const bus = n.kind === 'xfmr' ? id + ':hv' : id;
    n.energized = live.has(bus) && islOn(bus);
    n.connected = topo.has(bus);
    if (n.kind === 'xfmr') n.tierUp = ratioOf(n)[0];
  }
  return f;
}

/** Peak multiplier of a profile over the day (for forecasting). */
export function peakMult(bal, type) {
  const t = typeDef(bal, type);
  let m = 0;
  for (let h = 0; h < 24; h++) m = Math.max(m, t.profile(h));
  return m;
}

/** Forecast load on a transformer at an hour = sum of downstream customers' demand. */
export function forecastAtHour(state, bal, xfmrId, hour) {
  let s = 0;
  for (const c of state.map.customers) {
    const cs = state.cust[c.id];
    if (cs.active === false) continue;
    if (cs.xfmr === xfmrId || cs.sub === xfmrId) s += demandAt(bal, c.type, hour) * (c.scale || 1);
  }
  return s;
}
