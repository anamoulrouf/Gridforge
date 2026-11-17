// Simulation orchestrator: state, commands, fixed tick (1 sim-minute), events.
// Deterministic: the same seed + command log always yields the same state (GDD §18.1).
// UI/render read `sim.state` and call `sim.cmd()`; they never mutate state directly.

import { BALANCE, CUSTOMER_TYPES } from '../data/balance.js';
import { MISSION1 } from '../data/mission1.js';
import { planLine, planDrop, planTransformer, dist, nodePos, dropOf } from './grid.js';
import { solve, forecastAtHour } from './power.js';
import { OBJECTIVES, evalObjective, computeScore, computeMetrics } from './mission.js';
import { rng, fnv, canonical } from './rng.js';

const POWERED = new Set(['on', 'partial']);

function initialState(seed, bal, map) {
  const nodes = { gen: { id: 'gen', kind: 'gen', x: map.generator.x, z: map.generator.z } };
  const cust = {};
  for (const c of map.customers) {
    cust[c.id] = {
      status: 'unconnected',
      demand: 0,
      served: 0,
      supplyFrac: 0,
      kWhToday: 0,
      kWhTotal: 0,
      poweredMin: 0,
      outMin: 0,
      everPowered: false,
      connected: false,
      dropped: false,
      xfmr: null,
    };
  }
  return {
    v: 1,
    seed,
    map,
    t: 0,
    clock: bal.startClockMin,
    started: false,
    credits: bal.start.credits,
    inv: { poles: bal.start.poles, transformers: bal.start.transformers, cable: bal.start.cable, kits: bal.start.kits },
    gen: { status: 'off', rampMin: 0, fuel: bal.start.fuel, condition: 100, servicing: false, runMin: 0, everStarted: false },
    nodes,
    edges: {},
    dropByBuilding: {},
    nextId: 1,
    cust,
    flow: {},
    policy: 'critical',
    orders: [],
    crew: { job: null, queue: [] },
    fault: { phase: 'pending', target: null, warnT: null, tripT: null, restoredT: null, preDispatched: false, affected: [] },
    inspected: {},
    stats: {
      kWhDelivered: 0,
      kWhGen: 0,
      kWhLoss: 0,
      peakKW: 0,
      earned: 0,
      spent: 0,
      fuelUsed: 0,
      trips: 0,
      bills: 0,
      serviced: 0,
      fuelOrders: 0,
      firstLightT: null,
      custMinPowered: 0,
      custMinTotal: 0,
      clinicOutMinNonFault: 0,
      lastBill: null,
    },
    billing: { kWhToday: 0, revenueToday: 0, peakToday: 0 },
    objectives: Object.fromEntries(OBJECTIVES.map((o) => [o.id, false])),
    stableMin: 0,
    warnings: { fuelOutMin: 0, bankruptMin: 0 },
    result: null,
    faultJitter: Math.floor(rng(seed)() * 40),
  };
}

export function createSim({ seed = 1337, bal = BALANCE, map = MISSION1 } = {}) {
  const state = initialState(seed, bal, map);
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

  function resolveAndDiff() {
    solve(state, bal);
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
    for (const o of OBJECTIVES) {
      const r = evalObjective(state, o.id);
      if (o.id === 'losses') {
        state.objectives.losses = r.done;
        continue;
      }
      if (r.done && !state.objectives[o.id]) {
        state.objectives[o.id] = true;
        emit('objective', { id: o.id });
      }
    }
  }

  function mkXfmrFields(n) {
    Object.assign(n, { kind: 'xfmr', state: 'ok', condition: 100, loadKW: 0, loadPct: 0, tempC: bal.transformer.ambientC, overMin: 0, coolUntil: 0, overheat: false, warned: false, forecastPeakKW: 0, customers: [] });
  }

  // ---------------------------------------------------------------- commands
  const handlers = {
    inspect(c) {
      state.inspected[c.target] = true;
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
        state.nodes[id] = { id, kind: 'pole', tier: p.tier, x: p.points[i].x, z: p.points[i].z, cost: bal.costs.pole, built: state.t };
        ids.push(id);
      }
      for (let i = 0; i < ids.length - 1; i++) {
        const a = nodePos(state, ids[i]);
        const b = nodePos(state, ids[i + 1]);
        const eid = newId('e');
        const length = dist(a, b);
        state.edges[eid] = { id: eid, kind: 'line', tier: p.tier, a: ids[i], b: ids[i + 1], length, cost: Math.ceil(length) * bal.costs.cablePerM, loadKW: 0, energized: false, built: state.t };
      }
      state.inv.poles -= p.newPoles;
      state.inv.cable -= p.meters;
      spend(p.cost);
      emit('built', { what: 'line', tier: p.tier, nodes: ids, cost: p.cost });
      resolveAndDiff();
      return { ok: true, last: ids[ids.length - 1], nodes: ids, plan: p };
    },

    transformer(c) {
      const p = planTransformer(state, bal, c.at);
      if (!p.ok) return p;
      let id;
      if (p.node) {
        id = p.node;
        const n = state.nodes[id];
        n.onPole = true;
        n.cost = (n.cost || 0) + p.cost;
        mkXfmrFields(n);
      } else {
        id = newId('t');
        state.nodes[id] = { id, x: p.point.x, z: p.point.z, onPole: false, cost: p.cost, built: state.t };
        mkXfmrFields(state.nodes[id]);
      }
      state.inv.transformers -= 1;
      spend(p.cost);
      emit('built', { what: 'xfmr', id, cost: p.cost });
      resolveAndDiff();
      return { ok: true, id };
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
      if (!n || !((n.kind === 'pole' && n.tier === 'LV') || n.kind === 'xfmr')) return { ok: false, reason: 'dropNeedsLV' };
      const made = [];
      for (const b of map.customers) {
        if (state.dropByBuilding[b.id]) continue;
        const p = planDrop(state, bal, b.id, c.node);
        if (p.ok) made.push(handlers.drop({ building: b.id, from: c.node }).id);
      }
      if (!made.length) return { ok: false, reason: 'noneInReach' };
      return { ok: true, count: made.length };
    },

    remove(c) {
      const id = c.target;
      const job = state.crew.job;
      if (state.nodes[id]) {
        const n = state.nodes[id];
        if (n.kind === 'gen') return { ok: false, reason: 'cantRemoveGen' };
        if ((job && job.target === id) || state.crew.queue.some((j) => j.target === id)) return { ok: false, reason: 'crewOnSite' };
        let refund = 0;
        for (const eid of Object.keys(state.edges)) {
          const e = state.edges[eid];
          if (e.a === id || e.b === id) refund += removeEdge(eid);
        }
        if (n.kind === 'pole' || n.onPole) state.inv.poles += 1;
        if (n.kind === 'xfmr') state.inv.transformers += 1;
        refund += Math.floor((n.cost || 0) * bal.costs.refundRate);
        if (state.fault.target === id && state.fault.phase !== 'repaired') {
          state.fault.phase = 'pending';
          state.fault.target = null;
        }
        delete state.nodes[id];
        state.credits += refund;
        state.stats.spent -= refund;
        emit('removed', { id, refund });
        resolveAndDiff();
        return { ok: true, refund };
      }
      if (state.edges[id]) {
        const refund = removeEdge(id);
        state.credits += refund;
        state.stats.spent -= refund;
        emit('removed', { id, refund });
        resolveAndDiff();
        return { ok: true, refund };
      }
      return { ok: false, reason: 'badTarget' };
    },

    startGen() {
      const g = state.gen;
      if (g.status === 'running' || g.status === 'starting') return { ok: false, reason: 'alreadyRunning' };
      if (g.fuel <= 0) return { ok: false, reason: 'noFuel' };
      g.status = 'starting';
      g.rampMin = 0;
      g.startT = state.t;
      if (!state.started) {
        state.started = true;
        // §10 telegraph: forecast evening peak per transformer when operations begin
        for (const id in state.nodes) {
          const n = state.nodes[id];
          if (n.kind === 'xfmr') n.forecastPeakKW = Math.max(n.forecastPeakKW || 0, forecastAtHour(state, bal, id, 18));
        }
      }
      g.everStarted = true;
      emit('genStart');
      resolveAndDiff();
      return { ok: true };
    },

    stopGen() {
      if (state.gen.status === 'off') return { ok: false, reason: 'alreadyOff' };
      state.gen.status = 'off';
      emit('genStop');
      resolveAndDiff();
      return { ok: true };
    },

    policy(c) {
      if (!['critical', 'equal'].includes(c.value)) return { ok: false, reason: 'badTarget' };
      state.policy = c.value;
      resolveAndDiff();
      return { ok: true };
    },

    order(c) {
      const p = bal.procurement[c.item];
      if (!p) return { ok: false, reason: 'badTarget' };
      if (state.credits < p.cost) return { ok: false, reason: 'noCredits' };
      if (c.item === 'fuel') {
        const inTransit = state.orders.filter((o) => o.item === 'fuel').reduce((s, o) => s + o.qty, 0);
        if (state.gen.fuel + inTransit + p.qty > 150) return { ok: false, reason: 'tankFull' };
        state.stats.fuelOrders++;
      }
      spend(p.cost);
      state.orders.push({ item: c.item, qty: p.qty, arriveT: state.t + p.leadH * 60 });
      emit('ordered', { item: c.item, qty: p.qty, etaH: p.leadH });
      return { ok: true };
    },

    reset(c) {
      const n = state.nodes[c.target];
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
      if (!n || n.kind !== 'xfmr') return { ok: false, reason: 'badTarget' };
      if (!(n.state === 'fault' || n.overheat)) return { ok: false, reason: 'nothingToRepair' };
      if (crewBusyWith(n.id)) return { ok: false, reason: 'alreadyDispatched' };
      if (state.inv.kits < 1) return { ok: false, reason: 'noKits' };
      if (state.credits < bal.costs.repairLabour) return { ok: false, reason: 'noCredits' };
      state.inv.kits -= 1;
      spend(bal.costs.repairLabour);
      if (n.overheat) state.fault.preDispatched = true;
      return dispatch({ type: 'repair', target: n.id });
    },

    maintain(c) {
      const id = c.target;
      if (id !== 'gen') {
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
  };

  function removeEdge(eid) {
    const e = state.edges[eid];
    let refund = Math.floor((e.cost || 0) * bal.costs.refundRate);
    if (e.kind === 'line') state.inv.cable += Math.ceil(e.length);
    else delete state.dropByBuilding[e.b];
    delete state.edges[eid];
    return refund;
  }

  function crewBusyWith(id) {
    return (state.crew.job && state.crew.job.target === id) || state.crew.queue.some((j) => j.target === id);
  }

  function siteOf(id) {
    return id === 'gen' ? map.generator.port : state.nodes[id];
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
    if (c.type === 'transformer') return planTransformer(state, bal, c.at);
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
    const n = j.target === 'gen' ? null : state.nodes[j.target];
    if (j.target !== 'gen' && !n) {
      cr.job = { ...j, phase: 'return', remain: j.travel };
      return;
    }
    if (j.phase === 'travel') {
      if (--j.remain <= 0) {
        emit('crewArrived', { target: j.target, kind: j.type });
        if (j.type === 'repair') {
          if (n.state === 'fault') {
            j.phase = 'work';
            j.remain = bal.crew.repairH * 60;
            emit('repairStart', { target: j.target });
          } else j.phase = 'standby';
        } else {
          j.phase = 'work';
          j.remain = bal.crew.maintainH * 60;
          if (j.target === 'gen') state.gen.servicing = true;
          else n.state = 'maint';
          emit('maintStart', { target: j.target });
          return 'resolve';
        }
      }
      return;
    }
    if (j.phase === 'standby') {
      if (n.state === 'fault') {
        j.phase = 'work';
        j.remain = bal.crew.repairH * 60;
        emit('repairStart', { target: j.target });
      }
      return;
    }
    if (j.phase === 'work') {
      if (--j.remain <= 0) {
        if (j.type === 'repair') {
          n.state = 'ok';
          n.condition = 100;
          n.overheat = false;
          n.overMin = 0;
          if (state.fault.target === n.id && state.fault.phase === 'active') {
            state.fault.phase = 'repaired';
            state.fault.restoredT = state.t;
          }
          emit('repaired', { target: n.id });
        } else {
          if (j.target === 'gen') {
            state.gen.servicing = false;
            state.gen.condition = 100;
          } else {
            n.state = 'ok';
            n.condition = 100;
          }
          state.stats.serviced++;
          emit('maintained', { target: j.target });
        }
        cr.job = { ...j, phase: 'return', remain: j.travel };
        return 'resolve';
      }
    }
  }

  function faultDirector() {
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
      emit('faultWarn', { target: best.id, inMin: bal.fault.warnLeadH * 60 });
      return;
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
      emit('fault', { target: n.id, affected: F.affected });
      return 'resolve';
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
    return changed;
  }

  function tick() {
    if (state.result || !state.started) return false;
    state.t++;
    state.clock++;
    let needResolve = false;
    const g = state.gen;

    // timers: ramp, deliveries, crew, fault director
    if (g.status === 'starting') {
      g.rampMin++;
      needResolve = true;
      if (g.rampMin >= bal.generator.rampH * 60) {
        g.status = 'running';
        emit('genRunning');
      }
    }
    for (const o of state.orders.filter((o) => o.arriveT <= state.t)) {
      if (o.item === 'fuel') {
        g.fuel += o.qty;
        if (g.status === 'nofuel') {
          g.status = 'starting';
          g.rampMin = 0;
        }
      } else if (o.item === 'poles') state.inv.poles += o.qty;
      else if (o.item === 'cable') state.inv.cable += o.qty;
      else if (o.item === 'transformer') state.inv.transformers += o.qty;
      else if (o.item === 'kits') state.inv.kits += o.qty;
      emit('delivery', { item: o.item, qty: o.qty });
      needResolve = true;
    }
    state.orders = state.orders.filter((o) => o.arriveT > state.t);
    if (crewTick() === 'resolve') needResolve = true;
    if (faultDirector() === 'resolve') needResolve = true;

    // demand → dispatch → route → losses (every tick: demand changes hourly)
    resolveAndDiff();
    // protection
    if (protection()) resolveAndDiff();

    // fuel & energy accounting for this minute
    const f = state.flow;
    const genKWh = f.genKW / 60;
    if (genKWh > 0) {
      const eff = g.condition < 50 ? bal.generator.kWhPerFuelWorn : bal.generator.kWhPerFuel;
      const use = genKWh / eff;
      g.fuel = Math.max(0, g.fuel - use);
      state.stats.fuelUsed += use;
      if (g.fuel <= 0) {
        g.status = 'nofuel';
        emit('noFuel');
        resolveAndDiff();
      } else if (g.fuel < 30 && g.fuel + use >= 30) emit('fuelLow', { fuel: g.fuel });
    }
    if (g.status === 'running' || g.status === 'starting') {
      g.runMin++;
      g.condition = Math.max(0, g.condition - bal.generator.wearPerRunHour / 60);
    }
    for (const id in state.nodes) {
      const n = state.nodes[id];
      if (n.kind === 'xfmr' && n.state === 'ok' && n.energized) {
        const r = n.loadPct / 100;
        n.condition = Math.max(5, n.condition - (bal.transformer.wearBaseH + bal.transformer.wearLoadH * r * r) / 60);
      }
    }
    const s = state.stats;
    s.kWhGen += genKWh;
    s.kWhLoss += f.lossKW / 60;
    s.peakKW = Math.max(s.peakKW, f.servedKW);
    state.billing.peakToday = Math.max(state.billing.peakToday, f.servedKW);
    for (const c of map.customers) {
      const cs = state.cust[c.id];
      const kwh = cs.served / 60;
      cs.kWhToday += kwh;
      cs.kWhTotal += kwh;
      s.kWhDelivered += kwh;
      state.billing.kWhToday += kwh;
      state.billing.revenueToday += kwh * bal.tariff;
      const on = POWERED.has(cs.status);
      if (on) cs.poweredMin++;
      if (s.firstLightT != null) {
        s.custMinTotal++;
        if (on) s.custMinPowered++;
      }
      if (cs.everPowered && !on) cs.outMin++;
      else cs.outMin = 0;
    }
    // clinic outage outside the scripted fault
    const cl = state.cust.clinic;
    if (cl && cl.everPowered && !POWERED.has(cl.status)) {
      const scripted = state.fault.phase === 'active' && cl.xfmr === state.fault.target && cl.status === 'xfmrDown';
      if (!scripted) s.clinicOutMinNonFault++;
    }

    // midnight billing (§8.1 retail sales; §8.2 overhead)
    if (state.clock % 1440 === 0) {
      const b = state.billing;
      const revenue = Math.round(b.revenueToday);
      const overhead = bal.costs.dailyOverhead;
      state.credits += revenue - overhead;
      s.earned += revenue;
      s.spent += overhead;
      s.bills++;
      s.lastBill = { day: Math.floor(state.clock / 1440), kWh: b.kWhToday, revenue, overhead, peakKW: b.peakToday, demandNow: f.townDemandKW, tariff: bal.tariff };
      emit('bill', s.lastBill);
      state.billing = { kWhToday: 0, revenueToday: 0, peakToday: 0 };
      for (const c of map.customers) state.cust[c.id].kWhToday = 0;
    }

    // stability window after the fault is repaired
    const allOn = map.customers.every((c) => state.cust[c.id].status === 'on');
    if (state.fault.phase === 'repaired' && allOn) state.stableMin++;
    else if (state.fault.phase === 'repaired') {
      if (state.stableMin > 0) emit('stableReset');
      state.stableMin = 0;
    }
    updateObjectives();
    checkFail();
    checkVictory();
    return true;
  }

  function checkFail() {
    if (state.result) return;
    const F = bal.fail;
    const W = state.warnings;
    const g = state.gen;
    // fuel starvation
    const fuelInTransit = state.orders.some((o) => o.item === 'fuel');
    if (g.fuel <= 0 && !fuelInTransit) {
      W.fuelOutMin++;
      if (W.fuelOutMin === 1 || W.fuelOutMin === 120) emit('failWarn', { cause: 'fuel', minutesLeft: F.fuelGraceH * 60 - W.fuelOutMin });
      if (W.fuelOutMin >= F.fuelGraceH * 60) return fail('fuel');
    } else W.fuelOutMin = 0;
    // clinic outage
    const cl = state.cust.clinic;
    if (cl.everPowered && cl.outMin > 0) {
      if (cl.outMin === 180 || cl.outMin === 300) emit('failWarn', { cause: 'clinic', minutesLeft: F.clinicOutageH * 60 - cl.outMin });
      if (cl.outMin >= F.clinicOutageH * 60) return fail('clinic');
    }
    // bankruptcy
    const unconnected = map.customers.some((c) => !state.cust[c.id].dropped);
    if (state.credits < bal.costs.pole + bal.costs.drop && unconnected && state.flow.powered === 0) {
      W.bankruptMin++;
      if (W.bankruptMin === 1) emit('failWarn', { cause: 'bankrupt', minutesLeft: F.bankruptGraceH * 60 });
      if (W.bankruptMin >= F.bankruptGraceH * 60) return fail('bankrupt');
    } else W.bankruptMin = 0;
    // deadline
    const deadline = F.deadlineDay * 1440;
    if (state.clock === deadline - 12 * 60) emit('failWarn', { cause: 'deadline', minutesLeft: 12 * 60 });
    if (state.clock >= deadline) return fail('deadline');
  }

  function fail(cause) {
    state.result = { outcome: 'fail', cause, metrics: computeMetrics(state) };
    emit('fail', { cause });
  }

  function checkVictory() {
    if (state.result) return;
    const prim = OBJECTIVES.filter((o) => o.primary).every((o) => state.objectives[o.id]);
    if (prim) {
      const score = computeScore(state);
      state.result = { outcome: 'victory', score, metrics: computeMetrics(state) };
      emit('victory', { score: score.total, ending: score.ending });
    }
  }

  function hash() {
    const { map: _m, ...rest } = state;
    return fnv(canonical(rest));
  }

  function drainEvents() {
    const e = events;
    events = [];
    return e;
  }

  // initial solve so flow fields exist
  solve(state, bal);
  updateObjectives();

  return {
    state,
    bal,
    map,
    log,
    cmd,
    preview,
    tick,
    hash,
    drainEvents,
    nodePos: (id) => nodePos(state, id),
    dropOf: (b) => dropOf(state, b),
    save() {
      return { v: 1, mission: map.id, seed: state.seed, t: state.t, log: log.slice() };
    },
  };
}

/** Rebuild a sim by replaying a saved command log (deterministic load / restart). */
export function loadSim(save, opts = {}) {
  if (!save || save.v !== 1 || save.mission !== MISSION1.id || !Array.isArray(save.log)) throw new Error('Incompatible save');
  const sim = createSim({ seed: save.seed, ...opts });
  for (const [t, c] of save.log) {
    while (sim.state.t < t) if (!sim.tick()) break;
    sim.cmd(c);
  }
  while (sim.state.t < save.t) if (!sim.tick()) break;
  sim.drainEvents();
  return sim;
}

export { CUSTOMER_TYPES };
