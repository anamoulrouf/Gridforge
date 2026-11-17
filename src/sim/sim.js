// Simulation orchestrator: state, commands, fixed tick (1 sim-minute), events.
// Deterministic: the same seed + mission + command log always yields the same state (GDD §18.1).
// UI/render read `sim.state` and call `sim.cmd()`; they never mutate state directly.
// Missions (src/missions/*) supply the map, balance, objectives, scripted director, fail rules,
// victory and score; this file is the shared engine.

import { CUSTOMER_TYPES } from '../data/balance.js';
import { planLine, planDrop, planTransformer, dist, nodePos, dropOf, isLVNode, sourceDef, siteBlocked, xfmrRating } from './grid.js';
import { solve, srcType, ratedKW } from './power.js';
import { weatherAt } from './weather.js';
import { initEconomy, accrueMinute, hourlyEconomy, midnight } from './economy.js';
import { rng, fnv, canonical } from './rng.js';
import STAGE1 from '../missions/stage1.js';

export const POWERED = new Set(['on', 'partial']);

function mkGen(def, bal) {
  const T = srcType(bal, def.type);
  const g = { id: def.id, type: def.type, status: 'off', rampMin: 0, condition: 100, servicing: false, runMin: 0, everStarted: false, outKW: 0, availKW: 0, chargeKW: 0 };
  if (def.kw != null) g.kw = def.kw;
  if (T.fuel === 'tank') g.fuel = def.fuel ?? bal.start.fuel;
  if (T.storage) {
    g.kwh = def.kwh ?? T.kwh;
    g.soc = (def.soc ?? 0.5) * g.kwh;
    g.mode = 'auto';
    g.status = 'running';
  }
  if (T.variable) g.status = 'running';
  if (T.reservoir) g.reservoir = def.reservoir ?? T.reservoir;
  if (def.running) g.status = 'running';
  if (def.retireAt != null) g.retireAt = def.retireAt;
  return g;
}

function initialState(seed, mission) {
  const { map, bal } = mission;
  const nodes = {};
  const gens = {};
  const sources = map.sources || [{ id: 'gen', type: 'diesel', ...map.generator, tier: 'MV' }];
  for (const s of sources) {
    nodes[s.id] = { id: s.id, kind: 'gen', tier: s.tier || 'MV', x: s.x, z: s.z };
    gens[s.id] = mkGen(s, bal);
  }
  const cust = {};
  for (const c of map.customers) {
    cust[c.id] = { status: 'unconnected', demand: 0, served: 0, supplyFrac: 0, kWhToday: 0, kWhTotal: 0, poweredMin: 0, outMin: 0, everPowered: false, connected: false, dropped: false, xfmr: null };
    if (c.appearAt != null) cust[c.id].active = false;
  }
  const st = {
    v: 1,
    seed,
    mission: mission.id,
    map,
    t: 0,
    clock: bal.startClockMin,
    started: false,
    credits: bal.start.credits,
    inv: { poles: bal.start.poles, transformers: bal.start.transformers, cable: bal.start.cable, kits: bal.start.kits, substations: bal.start.substations || 0 },
    gens,
    nodes,
    edges: {},
    dropByBuilding: {},
    built: {},
    nextId: 1,
    cust,
    flow: {},
    policy: 'critical',
    dispatch: bal.dispatchOrder ? [...bal.dispatchOrder] : [],
    orders: [],
    crew: { job: null, queue: [] },
    fault: { phase: 'pending', target: null, warnT: null, tripT: null, restoredT: null, preDispatched: false, affected: [] },
    inspected: {},
    stats: { kWhDelivered: 0, kWhGen: 0, kWhLoss: 0, peakKW: 0, earned: 0, spent: 0, fuelUsed: 0, trips: 0, bills: 0, serviced: 0, fuelOrders: 0, firstLightT: null, custMinPowered: 0, custMinTotal: 0, clinicOutMinNonFault: 0, lastBill: null, criticalOutMin: 0, lineTrips: 0, co2: 0, kWhRenew: 0 },
    billing: { kWhToday: 0, revenueToday: 0, peakToday: 0 },
    objectives: Object.fromEntries(mission.objectives.map((o) => [o.id, false])),
    stableMin: 0,
    warnings: { fuelOutMin: 0, bankruptMin: 0, trustMin: 0 },
    result: null,
    faultJitter: Math.floor(rng(seed)() * 40),
    flags: {},
  };
  // Stage 1 compatibility: the single diesel generator is also reachable as `state.gen`.
  if (gens.gen) st.gen = gens.gen;
  if (mission.systems?.economy) initEconomy(st, bal, mission);
  st.weather = weatherAt(seed, st.clock, mission.weather);
  mission.init?.(st);
  return st;
}

export function createSim({ seed = 1337, mission = STAGE1, bal: balOverride, map: mapOverride } = {}) {
  if (balOverride || mapOverride) mission = { ...mission, bal: balOverride || mission.bal, map: mapOverride || mission.map };
  const { bal, map } = mission;
  const state = initialState(seed, mission);
  const log = [];
  let events = [];
  let prevPowered = new Set();

  const emit = (type, data = {}) => events.push({ type, t: state.t, ...data });
  const spend = (amt) => {
    state.credits -= amt;
    state.stats.spent += amt;
  };
  const newId = (p) => `${p}${state.nextId++}`;
  const custById = (id) => map.customers.find((c) => c.id === id);
  const ctx = { demandMod: mission.demandMod ? (st, c, kw, hour, w) => mission.demandMod(st, c, kw, hour, w, bal) : null };

  function resolveAndDiff() {
    solve(state, bal, ctx);
    const now = new Set(map.customers.filter((c) => POWERED.has(state.cust[c.id].status)).map((c) => c.id));
    const on = [...now].filter((id) => !prevPowered.has(id));
    const off = [...prevPowered].filter((id) => !now.has(id));
    if (on.length) {
      if (state.stats.firstLightT == null) {
        state.stats.firstLightT = state.t;
        emit('firstLight', { ids: on });
      } else emit('powerOn', { ids: on });
      for (const id of on) state.cust[id].everPowered = true;
    }
    if (off.length) emit('powerOff', { ids: off, reasons: Object.fromEntries(off.map((id) => [id, state.cust[id].status])) });
    prevPowered = now;
    updateObjectives();
  }

  function updateObjectives() {
    for (const o of mission.objectives) {
      const r = o.eval(state, bal);
      if (o.live) {
        state.objectives[o.id] = r.done;
        continue;
      }
      if (r.done && !state.objectives[o.id]) {
        state.objectives[o.id] = true;
        emit('objective', { id: o.id });
      }
    }
  }

  function mkXfmrFields(n, ratio) {
    Object.assign(n, { kind: 'xfmr', ratio: ratio || 'MV/LV', state: 'ok', condition: 100, loadKW: 0, loadPct: 0, tempC: bal.transformer.ambientC, overMin: 0, coolUntil: 0, overheat: false, warned: false, forecastPeakKW: 0, customers: [] });
    if (ratio === 'HV/MV') n.ratingKW = bal.substation.ratingKW;
  }

  // ---------------------------------------------------------------- commands
  const handlers = {
    inspect(c) {
      state.inspected[c.target] = true;
      const n = state.nodes[c.target];
      if (n && n.hiddenWear != null && !n.wearKnown) {
        n.wearKnown = true;
        emit('inspected', { target: c.target, wear: n.hiddenWear });
      }
      updateObjectives();
      return { ok: true };
    },

    line(c) {
      const p = planLine(state, bal, c.from, c.to, c.tier);
      if (!p.ok) return { ok: false, reason: p.reason, plan: p };
      const ids = [c.from];
      for (let i = 1; i < p.points.length; i++) {
        const last = i === p.points.length - 1;
        if (last && !p.endNew) {
          ids.push(p.toId);
          break;
        }
        const id = newId('p');
        const pc = bal.costs.pole;
        state.nodes[id] = { id, kind: 'pole', tier: p.tier, x: p.points[i].x, z: p.points[i].z, cost: typeof pc === 'object' ? pc[p.tier] : pc, built: state.t };
        ids.push(id);
      }
      const cpm = typeof bal.costs.cablePerM === 'object' ? bal.costs.cablePerM[p.tier] : bal.costs.cablePerM;
      for (let i = 0; i < ids.length - 1; i++) {
        const a = nodePos(state, ids[i]);
        const b = nodePos(state, ids[i + 1]);
        const eid = newId('e');
        const length = dist(a, b);
        state.edges[eid] = { id: eid, kind: 'line', tier: p.tier, a: ids[i], b: ids[i + 1], length, cost: Math.ceil(length) * cpm, loadKW: 0, energized: false, built: state.t, state: 'ok', overMin: 0 };
      }
      if (!p.hv) {
        state.inv.poles -= p.newPoles;
        state.inv.cable -= p.meters;
      }
      spend(p.cost);
      emit('built', { what: 'line', tier: p.tier, nodes: ids, cost: p.cost });
      resolveAndDiff();
      return { ok: true, last: ids[ids.length - 1], nodes: ids, plan: p };
    },

    transformer(c) {
      const sub = c.sub === true;
      const p = planTransformer(state, bal, c.at, sub);
      if (!p.ok) return p;
      let id;
      if (p.node) {
        id = p.node;
        const n = state.nodes[id];
        n.onPole = true;
        n.cost = (n.cost || 0) + p.cost;
        mkXfmrFields(n, p.ratio);
      } else {
        id = newId(sub ? 's' : 't');
        state.nodes[id] = { id, x: p.point.x, z: p.point.z, onPole: false, cost: p.cost, built: state.t };
        mkXfmrFields(state.nodes[id], p.ratio);
      }
      if (sub) state.inv.substations -= 1;
      else state.inv.transformers -= 1;
      spend(p.cost);
      emit('built', { what: sub ? 'sub' : 'xfmr', id, cost: p.cost });
      resolveAndDiff();
      return { ok: true, id };
    },

    substation(c) {
      return handlers.transformer({ ...c, sub: true });
    },

    drop(c) {
      const p = planDrop(state, bal, c.building, c.from);
      if (!p.ok) return p;
      const eid = newId('d');
      const n = state.nodes[p.from];
      const b = custById(c.building);
      state.edges[eid] = { id: eid, kind: 'drop', tier: 'LV', a: p.from, b: c.building, length: dist(n, b), cost: p.cost, loadKW: 0, energized: false, built: state.t };
      state.dropByBuilding[c.building] = eid;
      spend(p.cost);
      emit('built', { what: 'drop', building: c.building, cost: p.cost });
      resolveAndDiff();
      return { ok: true, id: eid };
    },

    dropAll(c) {
      const n = state.nodes[c.node];
      if (!n || !isLVNode(n)) return { ok: false, reason: 'dropNeedsLV' };
      const made = [];
      for (const b of map.customers) {
        if (state.dropByBuilding[b.id]) continue;
        const p = planDrop(state, bal, b.id, c.node);
        if (p.ok) made.push(handlers.drop({ building: b.id, from: c.node }).id);
      }
      if (!made.length) return { ok: false, reason: 'noneInReach' };
      return { ok: true, count: made.length };
    },

    /** Build a source/storage on a marked site (solar farm, wind turbine, battery, hydro, gas genset). */
    build(c) {
      const site = (map.sites || []).find((s) => s.id === c.site);
      if (!site) return { ok: false, reason: 'badTarget' };
      if (state.gens[site.id]) return { ok: false, reason: 'siteTaken' };
      const opt = c.option ? (site.options || []).find((o) => o.type === c.option) : site.options?.[0] || site;
      if (!opt) return { ok: false, reason: 'badTarget' };
      if (site.unlockAt != null && state.clock < site.unlockAt) return { ok: false, reason: 'notYet' };
      if (state.credits < opt.cost) return { ok: false, reason: 'noCredits' };
      const def = { id: site.id, type: opt.type, tier: opt.tier || site.tier || 'MV', x: site.x, z: site.z, w: site.w, d: site.d, port: site.port, kw: opt.kw, kwh: opt.kwh, soc: opt.soc, reservoir: opt.reservoir };
      state.built[site.id] = def;
      state.nodes[site.id] = { id: site.id, kind: 'gen', tier: def.tier, x: site.x, z: site.z, cost: opt.cost, built: state.t, site: true };
      state.gens[site.id] = mkGen(def, bal);
      spend(opt.cost);
      emit('built', { what: 'source', id: site.id, type: opt.type, cost: opt.cost });
      resolveAndDiff();
      return { ok: true, id: site.id };
    },

    remove(c) {
      const id = c.target;
      const job = state.crew.job;
      if (state.nodes[id]) {
        const n = state.nodes[id];
        if (n.kind === 'gen' && !n.site) return { ok: false, reason: 'cantRemoveGen' };
        if ((job && job.target === id) || state.crew.queue.some((j) => j.target === id)) return { ok: false, reason: 'crewOnSite' };
        let refund = 0;
        for (const eid of Object.keys(state.edges)) {
          const e = state.edges[eid];
          if (e.a === id || e.b === id) refund += removeEdge(eid);
        }
        if ((n.kind === 'pole' || n.onPole) && n.tier !== 'HV') state.inv.poles += 1;
        if (n.kind === 'xfmr') {
          if (n.ratio === 'HV/MV') state.inv.substations += 1;
          else state.inv.transformers += 1;
        }
        refund += Math.floor((n.cost || 0) * bal.costs.refundRate);
        if (state.fault.target === id && state.fault.phase !== 'repaired') {
          state.fault.phase = 'pending';
          state.fault.target = null;
        }
        if (n.kind === 'gen') {
          delete state.gens[id];
          delete state.built[id];
        }
        delete state.nodes[id];
        state.credits += refund;
        state.stats.spent -= refund;
        emit('removed', { id, refund });
        resolveAndDiff();
        return { ok: true, refund };
      }
      if (state.edges[id]) {
        if (crewBusyWith(id)) return { ok: false, reason: 'crewOnSite' };
        const refund = removeEdge(id);
        state.credits += refund;
        state.stats.spent -= refund;
        emit('removed', { id, refund });
        resolveAndDiff();
        return { ok: true, refund };
      }
      return { ok: false, reason: 'badTarget' };
    },

    startGen(c) {
      const id = c.target || firstDispatchable();
      const g = state.gens[id];
      if (!g) return { ok: false, reason: 'badTarget' };
      const T = srcType(bal, g.type);
      if (!T.dispatch && !T.reservoir) return { ok: false, reason: 'notDispatchable' };
      if (g.retired) return { ok: false, reason: 'retired' };
      if (g.status === 'running' || g.status === 'starting') return { ok: false, reason: 'alreadyRunning' };
      if (T.fuel === 'tank' && g.fuel <= 0) return { ok: false, reason: 'noFuel' };
      g.status = 'starting';
      g.rampMin = 0;
      g.startT = state.t;
      if (!state.started) state.started = true;
      g.everStarted = true;
      emit('genStart', { id });
      resolveAndDiff();
      return { ok: true };
    },

    stopGen(c) {
      const id = c.target || firstDispatchable();
      const g = state.gens[id];
      if (!g || g.status === 'off') return { ok: false, reason: 'alreadyOff' };
      g.status = 'off';
      emit('genStop', { id });
      resolveAndDiff();
      return { ok: true };
    },

    /** Begin operations without a dispatchable start (renewable-only stages). */
    begin() {
      if (state.started) return { ok: false, reason: 'alreadyRunning' };
      state.started = true;
      emit('begin');
      resolveAndDiff();
      return { ok: true };
    },

    policy(c) {
      if (!['critical', 'equal'].includes(c.value)) return { ok: false, reason: 'badTarget' };
      state.policy = c.value;
      resolveAndDiff();
      return { ok: true };
    },

    dispatchOrder(c) {
      if (!Array.isArray(c.order)) return { ok: false, reason: 'badTarget' };
      state.dispatch = c.order.slice();
      resolveAndDiff();
      return { ok: true };
    },

    battery(c) {
      const g = state.gens[c.target];
      if (!g || !srcType(bal, g.type).storage) return { ok: false, reason: 'badTarget' };
      if (!['auto', 'hold', 'charge'].includes(c.mode)) return { ok: false, reason: 'badTarget' };
      g.mode = c.mode;
      resolveAndDiff();
      return { ok: true };
    },

    tariff(c) {
      const t = bal.tariffs?.[c.cls];
      if (!t) return { ok: false, reason: 'badTarget' };
      const v = Math.round(c.value * 100) / 100;
      if (v < t.min - 1e-9 || v > t.max + 1e-9) return { ok: false, reason: 'tariffBand' };
      state.tariffs[c.cls] = v;
      emit('tariff', { cls: c.cls, value: v });
      resolveAndDiff();
      return { ok: true };
    },

    contract(c) {
      const ct = state.contracts?.[c.id];
      if (!ct || !ct.offered) return { ok: false, reason: 'badTarget' };
      if (ct.accepted === c.accept) return { ok: false, reason: 'badTarget' };
      ct.accepted = !!c.accept;
      ct.decided = true;
      emit('contract', { id: c.id, accept: ct.accepted });
      resolveAndDiff();
      return { ok: true };
    },

    order(c) {
      const p = bal.procurement[c.item];
      if (!p) return { ok: false, reason: 'badTarget' };
      if (state.credits < p.cost) return { ok: false, reason: 'noCredits' };
      const target = c.target || firstTank();
      if (c.item === 'fuel') {
        const g = state.gens[target];
        if (!g || g.fuel == null) return { ok: false, reason: 'badTarget' };
        const inTransit = state.orders.filter((o) => o.item === 'fuel' && (o.target || firstTank()) === target).reduce((s, o) => s + o.qty, 0);
        const tankMax = srcType(bal, g.type).tankMax ?? 150;
        if (g.fuel + inTransit + p.qty > tankMax) return { ok: false, reason: 'tankFull' };
        state.stats.fuelOrders++;
        state.fuelBoughtToday = (state.fuelBoughtToday || 0) + p.cost;
      }
      spend(p.cost);
      const o = { item: c.item, qty: p.qty, arriveT: state.t + p.leadH * 60 };
      if (c.item === 'fuel' && target !== 'gen') o.target = target;
      state.orders.push(o);
      emit('ordered', { item: c.item, qty: p.qty, etaH: p.leadH, target });
      return { ok: true };
    },

    reset(c) {
      const n = state.nodes[c.target];
      const e = state.edges[c.target];
      if (e && e.state === 'trip') {
        if (state.t < e.coolUntil) return { ok: false, reason: 'cooling', minutes: e.coolUntil - state.t };
        e.state = 'ok';
        e.overMin = 0;
        emit('reset', { id: c.target });
        resolveAndDiff();
        return { ok: true };
      }
      if (!n || n.kind !== 'xfmr') return { ok: false, reason: 'badTarget' };
      if (n.state !== 'trip') return { ok: false, reason: 'notTripped' };
      if (state.t < n.coolUntil) return { ok: false, reason: 'cooling', minutes: n.coolUntil - state.t };
      n.state = 'ok';
      n.overMin = 0;
      emit('reset', { id: n.id });
      resolveAndDiff();
      return { ok: true };
    },

    repair(c) {
      const n = state.nodes[c.target];
      const e = state.edges[c.target];
      const g = state.gens[c.target];
      const broken = (n && n.kind === 'xfmr' && (n.state === 'fault' || n.overheat)) || (e && e.state === 'fault') || (g && g.damaged);
      if (!n && !e && !g) return { ok: false, reason: 'badTarget' };
      if (!broken) return { ok: false, reason: 'nothingToRepair' };
      if (crewBusyWith(c.target)) return { ok: false, reason: 'alreadyDispatched' };
      if (state.inv.kits < 1) return { ok: false, reason: 'noKits' };
      if (state.credits < bal.costs.repairLabour) return { ok: false, reason: 'noCredits' };
      state.inv.kits -= 1;
      spend(bal.costs.repairLabour);
      if (n?.overheat) state.fault.preDispatched = true;
      return dispatch({ type: 'repair', target: c.target });
    },

    maintain(c) {
      const id = c.target;
      if (!state.gens[id]) {
        const n = state.nodes[id];
        if (!n || n.kind !== 'xfmr') return { ok: false, reason: 'badTarget' };
        if (n.overheat) return { ok: false, reason: 'useRepair' };
        if (n.state === 'fault') return { ok: false, reason: 'useRepair' };
      }
      if (crewBusyWith(id)) return { ok: false, reason: 'alreadyDispatched' };
      if (state.credits < bal.costs.maintain) return { ok: false, reason: 'noCredits' };
      spend(bal.costs.maintain);
      return dispatch({ type: 'maintain', target: id });
    },

    upgrade(c) {
      const n = state.nodes[c.target];
      const up = bal.upgrades?.[c.kind];
      if (!n || !up) return { ok: false, reason: 'badTarget' };
      if (c.kind === 'xfmr100') {
        if (n.kind !== 'xfmr' || n.ratio === 'HV/MV') return { ok: false, reason: 'badTarget' };
        if (n.ratingKW >= up.ratingKW) return { ok: false, reason: 'alreadyUpgraded' };
        if (n.state === 'fault') return { ok: false, reason: 'useRepair' };
      }
      if (state.credits < up.cost) return { ok: false, reason: 'noCredits' };
      spend(up.cost);
      if (c.kind === 'xfmr100') {
        n.ratingKW = up.ratingKW;
        n.upgraded = true;
        n.overMin = 0;
        if (n.state === 'trip') n.state = 'ok';
      }
      emit('upgraded', { target: c.target, kind: c.kind });
      resolveAndDiff();
      return { ok: true };
    },
  };

  // mission-specific commands (tariff programs, DR, smart switching, …)
  const api = {
    state,
    bal,
    map,
    emit,
    spend,
    newId,
    resolve: () => resolveAndDiff(),
    dispatchCrew: (job) => dispatch(job),
    crewBusyWith: (id) => crewBusyWith(id),
  };
  for (const [k, fn] of Object.entries(mission.commands || {})) handlers[k] = (c) => fn(c, api);

  function firstDispatchable() {
    return Object.keys(state.gens).find((id) => srcType(bal, state.gens[id].type).dispatch) || Object.keys(state.gens)[0];
  }
  function firstTank() {
    return Object.keys(state.gens).find((id) => state.gens[id].fuel != null);
  }

  function removeEdge(eid) {
    const e = state.edges[eid];
    const refund = Math.floor((e.cost || 0) * bal.costs.refundRate);
    if (e.kind === 'line' && e.tier !== 'HV') state.inv.cable += Math.ceil(e.length);
    else if (e.kind === 'drop') delete state.dropByBuilding[e.b];
    delete state.edges[eid];
    return refund;
  }

  function crewBusyWith(id) {
    return (state.crew.job && state.crew.job.target === id) || state.crew.queue.some((j) => j.target === id);
  }

  function siteOf(id) {
    if (state.gens[id]) {
      const s = sourceDef(state, id);
      return s?.port || state.nodes[id];
    }
    if (state.edges[id]) {
      const e = state.edges[id];
      const a = nodePos(state, e.a);
      const b = e.kind === 'drop' ? custById(e.b) : nodePos(state, e.b);
      return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    }
    return state.nodes[id];
  }

  function travelMin(id) {
    const s = siteOf(id);
    // roads are roughly orthogonal: Manhattan distance from the depot
    const d = Math.abs(s.x - map.depot.x) + Math.abs(s.z - map.depot.z);
    return Math.max(10, Math.round((d / bal.crew.speedMPerH) * 60));
  }

  function dispatch(job) {
    const j = { ...job, phase: 'travel', remain: travelMin(job.target), travel: travelMin(job.target) };
    if (state.crew.job && state.crew.job.phase !== 'return') {
      state.crew.queue.push(j);
      emit('crewQueued', { target: j.target, kind: j.type });
      return { ok: true, queued: true };
    }
    state.crew.job = j;
    emit('crewDispatched', { target: j.target, kind: j.type, etaMin: j.remain });
    return { ok: true, etaMin: j.remain };
  }

  function cmd(c) {
    if (state.result) return { ok: false, reason: 'missionOver' };
    const h = handlers[c.type];
    if (!h) return { ok: false, reason: 'unknownCommand' };
    const r = h(c);
    if (r.ok) log.push([state.t, JSON.parse(JSON.stringify(c))]);
    return r;
  }

  function preview(c) {
    if (c.type === 'line') return planLine(state, bal, c.from, c.to, c.tier);
    if (c.type === 'drop') return planDrop(state, bal, c.building, c.from);
    if (c.type === 'transformer') return planTransformer(state, bal, c.at, false);
    if (c.type === 'substation') return planTransformer(state, bal, c.at, true);
    return { ok: false, reason: 'unknownCommand' };
  }

  // ---------------------------------------------------------------- tick
  function crewTick() {
    const cr = state.crew;
    const j = cr.job;
    if (!j) {
      if (cr.queue.length) {
        cr.job = cr.queue.shift();
        emit('crewDispatched', { target: cr.job.target, kind: cr.job.type, etaMin: cr.job.remain });
      }
      return;
    }
    if (j.phase === 'return') {
      if (--j.remain <= 0) {
        cr.job = null;
        if (cr.queue.length) {
          cr.job = cr.queue.shift();
          emit('crewDispatched', { target: cr.job.target, kind: cr.job.type, etaMin: cr.job.remain });
        }
      }
      return;
    }
    const g = state.gens[j.target];
    const n = g ? null : state.nodes[j.target];
    const e = state.edges[j.target];
    if (!g && !n && !e) {
      cr.job = { ...j, phase: 'return', remain: j.travel };
      return;
    }
    const isBroken = () => (n && n.state === 'fault') || (e && e.state === 'fault') || (g && g.damaged);
    if (j.phase === 'travel') {
      if (--j.remain <= 0) {
        emit('crewArrived', { target: j.target, kind: j.type });
        if (j.type === 'repair') {
          if (isBroken()) {
            j.phase = 'work';
            j.remain = bal.crew.repairH * 60;
            emit('repairStart', { target: j.target });
          } else j.phase = 'standby';
        } else {
          j.phase = 'work';
          j.remain = bal.crew.maintainH * 60;
          if (g) g.servicing = true;
          else n.state = 'maint';
          emit('maintStart', { target: j.target });
          return 'resolve';
        }
      }
      return;
    }
    if (j.phase === 'standby') {
      if (isBroken()) {
        j.phase = 'work';
        j.remain = bal.crew.repairH * 60;
        emit('repairStart', { target: j.target });
      } else if (n && !n.overheat && n.state === 'ok' && state.fault.target !== n.id) {
        cr.job = { ...j, phase: 'return', remain: j.travel };
      }
      return;
    }
    if (j.phase === 'work') {
      if (--j.remain <= 0) {
        if (j.type === 'repair') {
          if (n) {
            n.state = 'ok';
            n.condition = 100;
            n.overheat = false;
            n.overMin = 0;
            if (n.hiddenWear != null) n.hiddenWear = 0;
          }
          if (e) {
            e.state = 'ok';
            e.overMin = 0;
          }
          if (g) g.damaged = false;
          if (state.fault.target === j.target && state.fault.phase === 'active') {
            state.fault.phase = 'repaired';
            state.fault.restoredT = state.t;
          }
          emit('repaired', { target: j.target });
        } else {
          if (g) {
            g.servicing = false;
            g.condition = 100;
          } else {
            n.state = 'ok';
            n.condition = 100;
            if (n.hiddenWear != null) n.hiddenWear = 0;
          }
          state.stats.serviced++;
          emit('maintained', { target: j.target });
        }
        cr.job = { ...j, phase: 'return', remain: j.travel };
        return 'resolve';
      }
    }
  }

  function protection() {
    const T = bal.transformer;
    let changed = false;
    for (const id of Object.keys(state.nodes).sort()) {
      const n = state.nodes[id];
      if (n.kind !== 'xfmr') continue;
      const target = T.ambientC + (T.tempPerLoad * n.loadPct) / 100 + (n.overheat ? 40 : 0) + (n.condition < 50 ? 8 : 0);
      n.tempC += (target - n.tempC) * 0.15;
      if (n.state !== 'ok') {
        n.overMin = 0;
        continue;
      }
      if (n.loadPct >= T.warnPct && !n.warned) {
        n.warned = true;
        emit('xfmrWarn', { target: id, pct: n.loadPct });
      } else if (n.loadPct < T.warnPct - 5) n.warned = false;
      let trip = false;
      if (n.loadPct > T.instantTripPct) trip = true;
      else if (n.loadPct > T.tripPct) {
        n.overMin++;
        if (n.overMin === 1) emit('xfmrOverload', { target: id, pct: n.loadPct, inMin: T.tripDelayH * 60 });
        if (n.overMin >= T.tripDelayH * 60) trip = true;
      } else n.overMin = Math.max(0, n.overMin - 2);
      if (trip) {
        n.state = 'trip';
        n.coolUntil = state.t + T.resetCoolH * 60;
        n.overMin = 0;
        state.stats.trips++;
        changed = true;
        emit('xfmrTrip', { target: id, pct: n.loadPct, affected: [...(n.customers || [])] });
      }
    }
    // line thermal protection (congestion) where the mission enables it
    const LP = bal.lineProtection;
    if (LP) {
      for (const id of Object.keys(state.edges).sort()) {
        const e = state.edges[id];
        if (e.kind !== 'line' || e.state !== 'ok') continue;
        if (e.loadPct > LP.tripPct) {
          e.overMin = (e.overMin || 0) + 1;
          if (e.overMin === 1) emit('lineOverload', { target: id, pct: e.loadPct, inMin: LP.delayMin });
          if (e.overMin >= LP.delayMin) {
            e.state = 'trip';
            e.coolUntil = state.t + LP.coolMin;
            e.overMin = 0;
            state.stats.lineTrips++;
            changed = true;
            emit('lineTrip', { target: id, pct: e.loadPct });
          }
        } else e.overMin = Math.max(0, (e.overMin || 0) - 2);
      }
    }
    return changed;
  }

  function sourceTick() {
    let resolveNeeded = false;
    for (const id of Object.keys(state.gens).sort()) {
      const g = state.gens[id];
      const T = srcType(bal, g.type);
      if (g.retireAt != null && !g.retired && state.clock >= g.retireAt) {
        g.retired = true;
        g.status = 'off';
        emit('retired', { id });
        resolveNeeded = true;
      }
      if (g.status === 'starting') {
        g.rampMin++;
        resolveNeeded = true;
        if (g.rampMin >= (T.rampH ?? bal.generator.rampH) * 60) {
          g.status = 'running';
          emit('genRunning', { id });
        }
      }
    }
    return resolveNeeded;
  }

  function energyTick() {
    const f = state.flow;
    for (const id of Object.keys(state.gens).sort()) {
      const g = state.gens[id];
      const T = srcType(bal, g.type);
      const kwh = (g.outKW || 0) / 60;
      if (T.fuel === 'tank' && kwh > 0) {
        const eff = g.condition < 50 ? (T.kWhPerFuelWorn ?? bal.generator.kWhPerFuelWorn) : (T.kWhPerFuel ?? bal.generator.kWhPerFuel);
        const use = kwh / eff;
        g.fuel = Math.max(0, g.fuel - use);
        state.stats.fuelUsed += use;
        if (g.fuel <= 0) {
          g.status = 'nofuel';
          emit('noFuel', { id });
          resolveAndDiff();
        } else if (g.fuel < 30 && g.fuel + use >= 30) emit('fuelLow', { id, fuel: g.fuel });
      }
      if (T.storage) {
        const eff = T.eff ?? 0.9;
        g.soc = Math.max(0, Math.min(g.kwh, g.soc - kwh + ((g.chargeKW || 0) / 60) * eff));
      }
      if (T.reservoir) g.reservoir = Math.min(T.reservoir, Math.max(0, g.reservoir - kwh + (T.inflowKW || 0) / 60));
      if (T.dispatch && (g.status === 'running' || g.status === 'starting')) {
        g.runMin++;
        g.condition = Math.max(0, g.condition - (T.wearPerRunHour ?? bal.generator.wearPerRunHour) / 60);
      }
    }
    for (const id in state.nodes) {
      const n = state.nodes[id];
      if (n.kind === 'xfmr' && n.state === 'ok' && n.energized) {
        const r = n.loadPct / 100;
        n.condition = Math.max(5, n.condition - (bal.transformer.wearBaseH + bal.transformer.wearLoadH * r * r) / 60);
      }
    }
    const s = state.stats;
    const genKWh = f.genKW / 60;
    s.kWhGen += genKWh;
    s.kWhLoss += f.lossKW / 60;
    s.peakKW = Math.max(s.peakKW, f.servedKW);
    state.billing.peakToday = Math.max(state.billing.peakToday, f.servedKW);
    for (const c of map.customers) {
      const cs = state.cust[c.id];
      if (cs.active === false) continue;
      const kwh = cs.served / 60;
      cs.kWhToday += kwh;
      cs.kWhTotal += kwh;
      s.kWhDelivered += kwh;
      state.billing.kWhToday += kwh;
      state.billing.revenueToday += kwh * (bal.tariff ?? 0);
      const on = POWERED.has(cs.status);
      if (on) cs.poweredMin++;
      if (s.firstLightT != null) {
        s.custMinTotal++;
        if (on) s.custMinPowered++;
      }
      if (cs.everPowered && !on) cs.outMin++;
      else cs.outMin = 0;
    }
    if (state.ledger) accrueMinute(state, bal);
  }

  function growthTick() {
    let any = false;
    for (const c of map.customers) {
      const cs = state.cust[c.id];
      if (cs.active === false && c.appearAt != null && state.clock >= c.appearAt) {
        cs.active = true;
        cs.appearedT = state.t;
        emit('newCustomer', { id: c.id });
        any = true;
      }
    }
    return any;
  }

  function tick() {
    if (state.result || !state.started) return false;
    state.t++;
    state.clock++;
    let needResolve = false;
    if (state.clock % 60 === 0 || !state.weather) state.weather = weatherAt(state.seed, state.clock, mission.weather);
    if (sourceTick()) needResolve = true;
    if (growthTick()) needResolve = true;

    for (const o of state.orders.filter((o) => o.arriveT <= state.t)) {
      if (o.item === 'fuel') {
        const g = state.gens[o.target || firstTank()];
        if (g) {
          g.fuel += o.qty;
          if (g.status === 'nofuel') {
            g.status = 'starting';
            g.rampMin = 0;
          }
        }
      } else if (o.item === 'poles') state.inv.poles += o.qty;
      else if (o.item === 'cable') state.inv.cable += o.qty;
      else if (o.item === 'transformer') state.inv.transformers += o.qty;
      else if (o.item === 'kits') state.inv.kits += o.qty;
      else if (o.item === 'substation') state.inv.substations += o.qty;
      emit('delivery', { item: o.item, qty: o.qty });
      needResolve = true;
    }
    state.orders = state.orders.filter((o) => o.arriveT > state.t);
    if (crewTick() === 'resolve') needResolve = true;
    if (mission.director?.(state, api) === 'resolve') needResolve = true;
    void needResolve;

    // demand → dispatch → route → losses (every tick: demand changes hourly)
    resolveAndDiff();
    if (protection()) resolveAndDiff();

    energyTick();
    if (state.clock % 60 === 0) hourlyEconomy(state, bal);

    // midnight billing (§8.1 retail sales; §8.2 overhead)
    if (state.clock % 1440 === 0) {
      if (state.ledger) {
        const st = midnight(state, bal);
        state.stats.bills++;
        state.stats.lastBill = st;
        emit('statement', st);
      } else {
        const b = state.billing;
        const revenue = Math.round(b.revenueToday);
        const overhead = bal.costs.dailyOverhead;
        state.credits += revenue - overhead;
        state.stats.earned += revenue;
        state.stats.spent += overhead;
        state.stats.bills++;
        state.stats.lastBill = { day: Math.floor(state.clock / 1440), kWh: b.kWhToday, revenue, overhead, peakKW: b.peakToday, demandNow: state.flow.townDemandKW, tariff: bal.tariff };
        emit('bill', state.stats.lastBill);
      }
      state.billing = { kWhToday: 0, revenueToday: 0, peakToday: 0 };
      for (const c of map.customers) state.cust[c.id].kWhToday = 0;
    }

    mission.after?.(state, api);
    updateObjectives();
    checkFail();
    checkVictory();
    return true;
  }

  function checkFail() {
    if (state.result) return;
    const F = bal.fail;
    const W = state.warnings;
    // fuel starvation: every fuel-tank unit empty, nothing else available, nothing on order
    const tanks = Object.values(state.gens).filter((g) => g.fuel != null && !g.retired);
    if (tanks.length && F.fuelGraceH) {
      const fuelInTransit = state.orders.some((o) => o.item === 'fuel');
      const othersUp = Object.values(state.gens).some((g) => g.fuel == null && (g.availKW || 0) > 0);
      if (tanks.every((g) => g.fuel <= 0) && !fuelInTransit && !othersUp) {
        W.fuelOutMin++;
        if (W.fuelOutMin === 1 || W.fuelOutMin === 120) emit('failWarn', { cause: 'fuel', minutesLeft: F.fuelGraceH * 60 - W.fuelOutMin });
        if (W.fuelOutMin >= F.fuelGraceH * 60) return fail('fuel');
      } else W.fuelOutMin = 0;
    }
    // critical services (clinic, water pump, hospital): outage limit
    for (const c of map.customers) {
      const T = (bal.types && bal.types[c.type]) || CUSTOMER_TYPES[c.type];
      if (!T?.critical) continue;
      const cs = state.cust[c.id];
      if (cs.active === false || !cs.everPowered || cs.outMin <= 0) continue;
      if (cs.outMin === 180 || cs.outMin === 300) emit('failWarn', { cause: 'clinic', id: c.id, minutesLeft: F.clinicOutageH * 60 - cs.outMin });
      if (cs.outMin >= F.clinicOutageH * 60) return fail('clinic', { id: c.id });
    }
    // bankruptcy
    const unconnected = map.customers.some((c) => state.cust[c.id].active !== false && !state.cust[c.id].dropped);
    const floor = (typeof bal.costs.pole === 'object' ? bal.costs.pole.LV : bal.costs.pole) + bal.costs.drop;
    if ((state.credits < floor && unconnected && state.flow.powered === 0) || state.credits < (F.debtLimit ?? -Infinity)) {
      W.bankruptMin++;
      if (W.bankruptMin === 1) emit('failWarn', { cause: 'bankrupt', minutesLeft: F.bankruptGraceH * 60 });
      if (W.bankruptMin >= F.bankruptGraceH * 60) return fail('bankrupt');
    } else W.bankruptMin = 0;
    // public trust (licence revoked)
    if (state.trust && F.trustMin != null) {
      const low = Object.entries(state.trust).find(([, v]) => v < F.trustMin);
      if (low) {
        W.trustMin++;
        if (W.trustMin === 1) emit('failWarn', { cause: 'trust', cls: low[0], minutesLeft: F.trustGraceH * 60 });
        if (W.trustMin >= F.trustGraceH * 60) return fail('trust', { cls: low[0] });
      } else W.trustMin = 0;
    }
    const mf = mission.checkFail?.(state, api);
    if (mf) return fail(mf.cause, mf);
    // deadline
    const deadline = F.deadlineDay * 1440;
    if (state.clock === deadline - 12 * 60) emit('failWarn', { cause: 'deadline', minutesLeft: 12 * 60 });
    if (state.clock >= deadline) return fail('deadline');
  }

  function fail(cause, extra = {}) {
    state.result = { outcome: 'fail', cause, ...extra, metrics: mission.metrics(state, bal) };
    emit('fail', { cause });
  }

  function checkVictory() {
    if (state.result) return;
    const prim = mission.objectives.filter((o) => o.primary).every((o) => state.objectives[o.id]);
    if (prim) {
      const score = mission.score(state, bal);
      state.result = { outcome: 'victory', score, metrics: mission.metrics(state, bal) };
      emit('victory', { score: score.total, ending: score.ending });
    }
  }

  function hash() {
    const { map: _m, gen: _g, ...rest } = state;
    return fnv(canonical(rest));
  }

  function drainEvents() {
    const e = events;
    events = [];
    return e;
  }

  // initial solve so flow fields exist
  solve(state, bal, ctx);
  updateObjectives();
  events = [];

  return {
    state,
    bal,
    map,
    mission,
    log,
    cmd,
    preview,
    tick,
    hash,
    drainEvents,
    nodePos: (id) => nodePos(state, id),
    dropOf: (b) => dropOf(state, b),
    siteOf,
    canBuildAt: (x, z) => !siteBlocked(state, x, z),
    xfmrRating: (n) => xfmrRating(bal, n),
    save() {
      return { v: 1, mission: mission.id, seed: state.seed, t: state.t, log: log.slice() };
    },
  };
}

/** Rebuild a sim by replaying a saved command log (deterministic load / restart). */
export function loadSim(save, opts = {}) {
  const mission = opts.mission || STAGE1;
  if (!save || save.v !== 1 || save.mission !== mission.id || !Array.isArray(save.log)) throw new Error('Incompatible save');
  const sim = createSim({ seed: save.seed, ...opts, mission });
  for (const [t, c] of save.log) {
    while (sim.state.t < t) if (!sim.tick()) break;
    sim.cmd(c);
  }
  while (sim.state.t < save.t) if (!sim.tick()) break;
  sim.drainEvents();
  return sim;
}

export { CUSTOMER_TYPES };
