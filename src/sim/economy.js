// Economy & stakeholders (GDD §7.7 trust, §8.1–8.4 revenue/costs/tariffs, §8.6 prosumers,
// §8.5 contracts). Simplified, illustrative model — labelled as such in-game.
import { typeDef, marketPrice } from './power.js';

/** Tariff class of a customer type (Stage 1 has a single flat tariff). */
export const classOf = (bal, type) => typeDef(bal, type).cls || 'home';

/** ¢/kWh this customer pays. */
export function tariffOf(state, bal, c) {
  if (c.contract && state.contracts?.[c.contract]?.accepted) return state.contracts[c.contract].tariff;
  if (!bal.tariffs) return bal.tariff;
  const cls = classOf(bal, c.type);
  return state.tariffs?.[cls] ?? bal.tariffs[cls]?.base ?? bal.tariff;
}

export function initEconomy(state, bal, mission) {
  if (bal.tariffs) state.tariffs = Object.fromEntries(Object.entries(bal.tariffs).map(([k, v]) => [k, v.base]));
  if (bal.trust) {
    state.trust = {};
    for (const c of state.map.customers) state.trust[classOf(bal, c.type)] = bal.trust.start;
  }
  state.ledger = { revenue: 0, fuelCost: 0, energyCost: 0, overhead: 0, penalties: 0, programs: 0, exportCredit: 0, grants: 0, kWh: 0, co2: 0, kWhRenew: 0, kWhFossil: 0, kWhGen: 0, unservedKWh: 0 };
  state.days = []; // daily statements
  state.contracts = {};
  for (const k of Object.keys(mission.contracts || {})) state.contracts[k] = { ...mission.contracts[k], accepted: false, offered: false, minTotal: 0, minOut: 0, penaltyPaid: 0 };
  state.programs = {};
  state.affordPct = 0;
  const li = bal.tariffs?.lowincome ? typeDef(bal, 'lowincome') : null;
  if (li) state.affordPct = ((li.dailyKWh * state.tariffs.lowincome) / bal.income.lowincome) * 100;
}

/** Rolling contract window: hourly outage minutes for the last `windowH` hours. */
export function closeContractHour(ct) {
  const W = ct.windowH || 48;
  ct.ring = ct.ring || [];
  ct.ring.push(ct.curOut || 0);
  if (ct.ring.length > W) ct.ring.shift();
  ct.curMin = 0;
  ct.curOut = 0;
  if (ct.ring.length >= W) ct.best = Math.max(ct.best ?? 0, windowAvail(ct));
}

/** Availability (%) over the rolling window so far (complete hours plus the current one). */
export function windowAvail(ct) {
  const ring = ct?.ring || [];
  const mins = ring.length * 60 + (ct?.curMin || 0);
  if (!mins) return 100;
  const out = ring.reduce((a, b) => a + b, 0) + (ct.curOut || 0);
  return 100 - (out / mins) * 100;
}

/** Hours counted in the rolling window (capped at its length). */
export function windowHours(ct) {
  return Math.min(ct?.windowH || 48, (ct?.ring || []).length);
}

/** Per-minute accrual of revenue, costs, emissions and contract availability. */
export function accrueMinute(state, bal) {
  const L = state.ledger;
  for (const c of state.map.customers) {
    const cs = state.cust[c.id];
    if (cs.active === false) continue;
    const kwh = cs.served / 60;
    // happy customers pay on time; an angry town pays late or not at all (reputation 0..100 → −5 % .. +5 %)
    const repK = state.ev ? 1 + Math.max(-0.05, Math.min(0.05, (state.ev.rep - 60) / 400)) : 1;
    const rev = kwh * tariffOf(state, bal, c) * repK;
    cs.revToday = (cs.revToday || 0) + rev;
    L.revenue += rev;
    L.kWh += kwh;
    // prosumer export credit (net metering at the export price)
    if (cs.exportKW > 0) {
      // prosumer export: clean energy into the grid, credited at the export price (net metering)
      L.exportCredit += (cs.exportKW / 60) * (bal.exportPrice ?? 0);
      L.kWhRenew += cs.exportKW / 60;
      L.kWhGen += cs.exportKW / 60;
    }
    if (cs.dropped && cs.connected && cs.served < cs.demand - 1e-6) L.unservedKWh += (cs.demand - cs.served) / 60;
    if (c.contract) {
      const ct = state.contracts[c.contract];
      // the contract clock starts once the plant has first had power (commissioning is free)
      if (ct && ct.accepted && cs.everPowered) {
        const out = cs.status !== 'on';
        ct.minTotal++;
        ct.curMin = (ct.curMin || 0) + 1;
        if (out) {
          ct.minOut++;
          ct.curOut = (ct.curOut || 0) + 1;
          ct.penaltyToday = (ct.penaltyToday || 0) + ct.penaltyPerMin;
        }
        if (ct.curMin >= 60) closeContractHour(ct);
      }
    }
  }
  for (const id in state.gens) {
    const g = state.gens[id];
    const T = bal.sourceTypes?.[g.type] || {};
    const kwh = (g.outKW || 0) / 60;
    if (kwh <= 0) continue;
    L.kWhGen += kwh;
    L.co2 += kwh * (T.co2 || 0);
    if (T.renewable || T.variable || T.storageClean) L.kWhRenew += kwh;
    else if (!T.storage) L.kWhFossil += kwh;
    if (T.market) {
      const pr = marketPrice(state, bal);
      L.energyCost += kwh * pr;
      L.tradeBuy = (L.tradeBuy || 0) + kwh * pr;
    } else if (T.costPerKWh) L.energyCost += kwh * T.costPerKWh;
  }
  // power sold abroad through a market link, and batteries buying cheap power to charge
  for (const id in state.gens) {
    const g = state.gens[id];
    const T = bal.sourceTypes?.[g.type] || {};
    if (T.market && g.exportKW > 0) {
      const v = (g.exportKW / 60) * marketPrice(state, bal) * (T.exportShare ?? 0.9);
      L.exportCredit += v;
      L.tradeSell = (L.tradeSell || 0) + v;
      state.stats.tradeSell = (state.stats.tradeSell || 0) + v;
    }
  }
}

/** Hourly: trust drift and affordability (GDD §7.7 — explainable, not arbitrary). */
export function hourlyEconomy(state, bal) {
  if (!state.trust) return;
  const T = bal.trust;
  const byCls = {};
  for (const c of state.map.customers) {
    const cs = state.cust[c.id];
    if (cs.active === false) continue;
    const cls = classOf(bal, c.type);
    const o = (byCls[cls] ||= { n: 0, out: 0, planned: 0 });
    o.n++;
    // unpowered after being connected, or still waiting for a connection a day after appearing
    if ((cs.everPowered || cs.dropped) && !(cs.status === 'on' || cs.status === 'partial')) o.out++;
    if (cs.appearedT != null && !cs.dropped && state.t - cs.appearedT > T.waitH * 60) o.out += 0.5;
  }
  // affordability: low-income daily bill as a share of daily income
  const li = bal.tariffs?.lowincome ? typeDef(bal, 'lowincome') : null;
  if (li) state.affordPct = ((li.dailyKWh * (state.tariffs.lowincome ?? bal.tariffs.lowincome.base)) / bal.income.lowincome) * 100;
  const why = {};
  for (const cls in state.trust) {
    const o = byCls[cls] || { n: 1, out: 0 };
    const outFrac = o.out / Math.max(1, o.n);
    const ref = bal.tariffs?.[cls]?.base ?? bal.tariff;
    const price = (state.tariffs?.[cls] ?? ref) / ref;
    const parts = { base: T.base, outages: -T.outageWeight * outFrac, price: -Math.max(0, price - 1) * T.priceWeight + Math.max(0, 1 - price) * T.priceWeight * 0.4, afford: cls === 'lowincome' ? -Math.max(0, state.affordPct - bal.afford.limitPct) * T.affordWeight : 0 };
    const target = Math.max(0, Math.min(100, parts.base + parts.outages + parts.price + parts.afford));
    state.trust[cls] += (target - state.trust[cls]) * T.rate;
    why[cls] = { ...parts, target };
  }
  state.trustWhy = why;
}

/** Midnight statement (GDD §8.4). Returns the statement; applies it to credits. */
export function midnight(state, bal) {
  const L = state.ledger;
  const ctPen = Object.values(state.contracts || {}).reduce((s, ct) => s + (ct.penaltyToday || 0), 0);
  for (const ct of Object.values(state.contracts || {})) {
    ct.penaltyPaid += ct.penaltyToday || 0;
    ct.penaltyToday = 0;
  }
  const programs = Object.values(state.programs || {}).reduce((s, p) => s + (p.on ? p.dailyCost || 0 : 0), 0);
  const st = {
    day: Math.floor(state.clock / 1440),
    revenue: Math.round(L.revenue),
    energyCost: Math.round(L.energyCost),
    exportCredit: Math.round(L.exportCredit),
    overhead: bal.costs.dailyOverhead,
    penalties: Math.round(ctPen),
    programs: Math.round(programs),
    grants: Math.round(L.grants),
    kWh: L.kWh,
    kWhGen: L.kWhGen,
    kWhRenew: L.kWhRenew,
    kWhFossil: L.kWhFossil,
    co2: L.co2,
    unservedKWh: L.unservedKWh,
    fuelBought: Math.round(state.fuelBoughtToday || 0),
  };
  st.renewPct = st.kWhGen > 0 ? (st.kWhRenew / st.kWhGen) * 100 : 0;
  st.net = st.revenue + st.grants - st.energyCost - st.exportCredit - st.overhead - st.penalties - st.programs - st.fuelBought;
  state.credits += st.revenue + st.grants - st.energyCost - st.exportCredit - st.overhead - st.penalties - st.programs;
  state.stats.earned += st.revenue + st.grants;
  state.stats.spent += st.energyCost + st.exportCredit + st.overhead + st.penalties + st.programs;
  state.days.push(st);
  state.fuelBoughtToday = 0;
  state.ledger = { revenue: 0, fuelCost: 0, energyCost: 0, overhead: 0, penalties: 0, programs: 0, exportCredit: 0, grants: 0, kWh: 0, co2: 0, kWhRenew: 0, kWhFossil: 0, kWhGen: 0, unservedKWh: 0 };
  for (const c of state.map.customers) state.cust[c.id].revToday = 0;
  return st;
}
