// Stage 6 · Island Power, "Kalani Island" (Chapter II: grids of the world).
// A small island grid with no neighbours to lean on. Three diesel units, a little solar, a fuel
// tanker every morning. Lesson: on an island the biggest unit can trip at any second, so you must
// always hold enough fast reserve to replace it (or the frequency falls and customers are switched
// off automatically). A grid-forming battery gives that reserve without burning fuel, and wind and
// sun cut the diesel the island depends on — which matters when the tanker is held up by a storm.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { runSteps } from '../sim/steps.js';
import { typeDef, srcType, ratedKW } from '../sim/power.js';
import { drainAndRespond } from '../sim/events.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;

// ------------------------------------------------------------------ map
const street = (id, name, x, z) => ({ id, type: 'home', name, x, z, w: 10, d: 10, scale: 30 });
const village = (id, name, x, z, extra = {}) => ({ id, type: 'lowincome', name, x, z, w: 16, d: 9, scale: 15, ...extra });
const resort = (id, name, x, z, label, extra = {}) => ({ id, type: 'resort', name, x, z, w: 40, d: 24, label, ...extra });
const unit = (id, n, x) => ({ id, type: 'diesel', name: `Diesel unit ${n}`, tier: 'MV', x, z: 100, w: 16, d: 12, port: { x, z: 88 }, kw: 450, fuel: 400, running: true });

export const MAP6 = {
  id: 'stage6-kalani',
  bounds: { minX: -320, maxX: 320, minZ: -240, maxZ: 240 },
  tile: { cx: 0, cz: 0, hw: 400, hd: 320, radius: 150 },
  mvTypes: ['resort', 'desal', 'port'],
  life: { traffic: 0.6, busColor: '#e9862c' },
  palms: true,
  roads: [
    { id: 'main', x: 0, z: 150, w: 620, d: 9, lanes: true },
    { id: 'north', x: -90, z: -20, w: 8, d: 340, lanes: true },
    { id: 'cross', x: 100, z: 0, w: 400, d: 8, lanes: true },
    { id: 'harbour', x: 100, z: 200, w: 8, d: 92 },
    { id: 'depot', x: 200, z: 122, w: 8, d: 48 },
  ],
  crossings: [[-90, 141, false], [-90, 159, false], [100, -8.5, false], [100, 8.5, false]],
  lampRoads: ['main', 'cross'],
  water: [
    { x: 0, z: -288, w: 800, d: 64 },
    { x: 0, z: 288, w: 800, d: 64 },
    { x: -368, z: 0, w: 64, d: 520 },
    { x: 368, z: 0, w: 64, d: 520 },
  ],
  hills: [{ x: -20, z: -205, r: 120, h: 24, squash: 0.45 }],
  clear: [{ x: -170, z: 90, w: 140, d: 50 }],
  core: [{ x: 10, z: 150, w: 220, d: 120 }],
  sources: [
    unit('d1', 1, -200),
    unit('d2', 2, -170),
    unit('d3', 3, -140),
    { id: 'solarA', type: 'solar', name: 'Harbour solar field', tier: 'MV', x: 60, z: 40, w: 50, d: 30, port: { x: 60, z: 62 }, kw: 250 },
  ],
  sites: [
    { id: 'wind', name: 'Kalani hill wind site', desc: 'The trade winds blow steadily over the hill', x: -20, z: -205, w: 120, d: 40, tier: 'MV', port: { x: -20, z: -165 }, turbines: 3, options: [{ type: 'wind', kw: 900, cost: 9000, note: 'Three 300 kW turbines on the hill. They connect at 11 kV.' }] },
    { id: 'solarB', name: 'Airfield solar site', desc: 'Flat ground beside the old airstrip', x: 170, z: -160, w: 100, d: 50, tier: 'MV', port: { x: 120, z: -140 }, options: [{ type: 'solar', kw: 1000, cost: 7000 }] },
    { id: 'gfb', name: 'Grid-forming battery site', desc: 'Next to the diesel station', x: -230, z: 30, w: 30, d: 14, tier: 'MV', port: { x: -200, z: 40 }, options: [{ type: 'battery', kw: 1000, kwh: 4000, cost: 12000, note: 'A grid-forming battery responds in milliseconds. It counts as fast reserve and can run the island on its own.' }] },
  ],
  depot: { id: 'depot', x: 200, z: 90, w: 18, d: 12 },
  townCenterZ: 150,
  decor: [
    { kind: 'port', x: 360, z: 470, w: 240, d: 110, top: -12 },
    { kind: 'farm', x: -380, z: -470, w: 210, d: 100, top: -9 },
  ],
  customers: [
    street('h1', 'Harbour Street homes', -10, 125),
    street('h2', 'Coral Lane homes', 30, 125),
    street('h3', 'Lagoon Row homes', -10, 180),
    street('h4', 'Shell Street homes', 30, 180),
    { id: 'school', type: 'school', name: 'Kalani School', x: -50, z: 122, w: 24, d: 12 },
    { id: 'clinic', type: 'clinic', name: 'Kalani Clinic', x: -50, z: 182, w: 16, d: 12 },
    { id: 'market', type: 'shop', name: 'Harbour market', x: 68, z: 125, w: 10, d: 9, label: 'MARKET' },
    { id: 'desal', type: 'desal', name: 'Desalination plant', x: -170, z: 205, w: 30, d: 20, label: 'WATER' },
    { id: 'port', type: 'port', name: 'Harbour and cold store', x: 150, z: 212, w: 50, d: 30 },
    village('v1', 'Tane fishing village', -278, 180),
    village('v2', 'Moana fishing village', 278, 182),
    resort('r1', 'Coral Bay Resort', 250, -62, 'CORAL BAY'),
    resort('r2', 'Palm Cove Resort', -240, -140, 'PALM COVE'),
    // surprise: a third resort opens (some runs)
    resort('r3', 'Lagoon Resort (new)', 270, 50, 'LAGOON', { w: 34, d: 20, surprise: 'lagoon' }),
  ],
};

// ------------------------------------------------------------------ balance
const homeProfile = (h) => (h >= 18 && h <= 22 ? 2.5 : h >= 7 && h <= 8 ? 1.4 : h >= 9 && h <= 17 ? 0.6 : 0.3);
export const BAL6 = {
  ...BALANCE,
  start: { credits: 45000, poles: 40, transformers: 3, cable: 1500, kits: 3, fuel: 400 },
  startClockMin: 6 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1200, drop: 50, maintain: 300, repairLabour: 500, dailyOverhead: 2500 },
  procurement: { ...BALANCE.procurement, fuel: { qty: 60, cost: 2400, leadH: 8 }, kits: { qty: 1, cost: 500, leadH: 8 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 20000, MV: 2500, LV: 500 }, dropReach: 24, mvDropReach: 32 },
  generator: { ...BALANCE.generator, maxKW: 450 },
  transformer: { ...BALANCE.transformer, ratingKW: 500 },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  sourceTypes: {
    // each engine burns fuel just to keep spinning (idleFrac), and can't run below a quarter load
    diesel: { dispatch: true, fuel: 'tank', rampH: 0.15, maxKW: 450, minFrac: 0.25, idleFrac: 0.08, kWhPerFuel: 20, kWhPerFuelWorn: 17, tankMax: 400, co2: 0.75, wearPerRunHour: 0.15 },
    solar: { variable: 'solar', renewable: true, co2: 0 },
    wind: { variable: 'wind', renewable: true, co2: 0 },
    battery: { storage: true, storageClean: true, kwh: 4000, eff: 0.9, co2: 0, gridForming: true },
  },
  dispatchOrder: ['battery', 'diesel'],
  fuelPrice: 6, // ¢ per unit delivered by the morning tanker
  types: {
    home: { label: 'Street of homes', cls: 'home', nominal: 1, priority: 1, profile: homeProfile },
    lowincome: { label: 'Fishing village (low-income)', cls: 'lowincome', nominal: 2, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.2 : h >= 4 && h <= 7 ? 1.3 : h >= 8 && h <= 17 ? 0.5 : 0.3), dailyKWh: 2 * (8 * 0.3 + 4 * 1.3 + 7 * 0.5 + 5 * 2.2) / 15 },
    resort: { label: 'Resort hotel (11 kV)', cls: 'business', nominal: 150, priority: 1, profile: (h) => (h >= 18 && h <= 23 ? 1.3 : h >= 11 && h <= 17 ? 1.1 : h >= 7 && h <= 10 ? 1.0 : 0.75) },
    desal: { label: 'Desalination plant (11 kV)', cls: 'public', nominal: 180, priority: 3, critical: true, profile: () => 1.0 },
    clinic: { label: 'Clinic', cls: 'public', nominal: 30, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 30, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
    shop: { label: 'Market', cls: 'business', nominal: 25, priority: 1, profile: (h) => (h >= 6 && h <= 19 ? 1.0 : 0.1) },
    port: { label: 'Harbour and cold store (11 kV)', cls: 'business', nominal: 120, priority: 2, profile: (h) => (h >= 5 && h <= 14 ? 1.0 : 0.6) },
  },
  tariffs: { lowincome: { base: 0.3, min: 0.2, max: 0.5 }, home: { base: 0.45, min: 0.3, max: 0.65 }, business: { base: 0.6, min: 0.4, max: 0.9 }, public: { base: 0.3, min: 0.2, max: 0.45 } },
  income: { lowincome: 60 },
  afford: { limitPct: 6 },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 6, bankruptGraceH: 6, deadlineDay: 6, debtLimit: -20000 },
};

const W6 = {
  1: { wind: 8, cloud: 0.2, label: 'Sunny with a fresh trade wind' },
  2: { wind: 7, cloud: 0.35, label: 'Fair, light trade wind' },
  3: { wind: 11, cloud: 0.55, label: 'Storm at sea: windy and showery' },
  4: { wind: 9, cloud: 0.25, label: 'Clearing, breezy' },
  5: { wind: 6, cloud: 0.2, label: 'Sunny, light wind' },
  6: { wind: 7, cloud: 0.3, label: 'Fair' },
};

const UNITS = ['d1', 'd2', 'd3'];
const RENEW = ['solar', 'wind'];
const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const lit = (st, c) => st.cust[c.id].active === false || !st.cust[c.id].dropped || powered(st, c.id);
const fuelTotal = (st) => UNITS.reduce((s, id) => s + (st.gens[id]?.fuel || 0), 0);
const bestShare = (st) => Math.max(0, ...(st.days || []).filter((d) => d.day >= 1).map((d) => d.renewPct));
const reserveOk = (st) => (st.flow.largestKW || 0) > 0 && (st.flow.reserveKW || 0) + 1 >= st.flow.largestKW;

// ------------------------------------------------------------------ objectives
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;

const objectives = [
  {
    id: 'gfb',
    primary: true,
    label: 'Build the grid-forming battery and connect it',
    eval: (st) => ({ done: !!st.gens.gfb && !!st.nodes.gfb?.connected }),
    guide: (st) => ({
      title: 'Build the grid-forming battery and connect it',
      why: 'On an island there is no big grid next door to catch you when a unit fails. A grid-forming battery reacts in milliseconds, so it can stand in for a tripped diesel instantly, without burning any fuel.',
      steps: [`Press ${k('G')} (Build) and click the battery site beside the diesel station.`, `Connect it with an 11 kV line (${k('L')}) to the station’s 11 kV bus.`, 'Leave it on Auto. Its spare output counts as fast reserve.'],
      now: [st.gens.gfb ? (st.nodes.gfb?.connected ? ok(`Battery at ${Math.round((st.gens.gfb.soc / st.gens.gfb.kwh) * 100)}%`) : warn('Built but not connected')) : todo('Not built yet')],
      focus: { x: -230, z: 30, sel: { kind: 'site', id: 'gfb' } },
      focusLabel: 'Show the battery site',
    }),
  },
  {
    id: 'reserve',
    primary: true,
    bar: true,
    unit: 'h',
    label: 'Hold enough fast reserve to cover the biggest unit for 24 h',
    eval: (st) => ({ done: (st.flags.resBest || 0) >= 1440, progress: [Math.floor((st.flags.resRun || 0) / 60), 24] }),
    guide: (st) => ({
      title: 'Hold enough fast reserve to cover the biggest unit for 24 h',
      why: 'Fast reserve is the spare power your running engines and batteries can add within seconds. If it is smaller than your biggest unit and that unit trips, the island’s frequency falls and the protection switches customers off automatically.',
      steps: ['Watch the <b>Reserve</b> chip: spare power on the left, biggest unit on the right. Green means you are covered.', 'Run an extra diesel unit at the evening peak, or better, add the grid-forming battery.', 'Spreading load over more, smaller sources also helps: wind and sun reduce how hard each diesel works.'],
      now: [reserveOk(st) ? ok(`Covered: ${fmt.kw(st.flow.reserveKW || 0)} spare vs ${fmt.kw(st.flow.largestKW || 0)} biggest unit`) : warn(`Short: ${fmt.kw(st.flow.reserveKW || 0)} spare vs ${fmt.kw(st.flow.largestKW || 0)} biggest unit`), info(`This run ${fmt.dur(st.flags.resRun || 0)} · best ${fmt.dur(st.flags.resBest || 0)}`)],
      focus: { x: 0, z: 0, sel: { kind: 'mix' } },
      focusLabel: 'Open Supply',
    }),
  },
  {
    id: 'tanker',
    primary: true,
    label: 'Keep the lights on while the tanker is delayed',
    eval: (st) => ({ done: !!st.flags.delayOk }),
    guide: (st) => {
      const F = st.flags;
      return {
        title: 'Keep the lights on while the tanker is delayed',
        why: 'Every drop of diesel arrives by ship. When a storm at sea holds the tanker in port, the fuel in the tanks has to last two days, so every kWh from the wind and sun is diesel you don’t burn.',
        steps: ['Build the hill wind farm and the airfield solar site and connect them.', 'Switch off diesel units you don’t need: an idling engine still burns fuel.', 'Let the battery soak up midday sun and give it back at night.', 'From 00:00 on day 3 until the tanker arrives at 07:00 on day 4, at least 98% of customers must keep their power.'],
        now: [F.delayOk ? ok('The island got through the delay') : F.delayOk === false ? warn(`Missed: only ${(F.delayRel ?? 0).toFixed(1)}% of customers kept power`) : F.delayAnnounced ? info(`Fuel left: ${Math.round(fuelTotal(st))} units, about ${fmt.dur(Math.round((fuelTotal(st) * 20 * 60) / Math.max(50, UNITS.reduce((s, id) => s + (st.gens[id]?.outKW || 0), 0))))} at today’s rate`) : info('The tanker comes every morning at 07:00'), F.delayRel != null && F.delayOk == null ? info(`So far ${F.delayRel.toFixed(1)}% kept power`) : null].filter(Boolean),
        focus: { x: -20, z: -205, sel: { kind: 'site', id: 'wind' } },
        focusLabel: 'Show the wind site',
      };
    },
  },
  {
    id: 'clean',
    primary: true,
    label: 'A full day with 60% of power from sun and wind',
    eval: (st) => ({ done: bestShare(st) >= 60 }),
    guide: (st) => {
      const L = st.ledger;
      const today = L && L.kWhGen > 0 ? (L.kWhRenew / L.kWhGen) * 100 : 0;
      return {
        title: 'A full day with 60% of power from sun and wind',
        why: 'Every kWh of diesel is shipped across the ocean and burned. Islands that switch to sun, wind and batteries save money, fuel and worry.',
        steps: ['Build wind and solar and connect them.', 'Keep the battery first in the generation order so it is used before diesel.', 'Run as few diesel units as you safely can. A running engine can’t go below a quarter load, which wastes sun at midday.'],
        now: [info(`Best day so far: ${Math.round(bestShare(st))}%`), info(`Today so far: ${Math.round(today)}%`)],
        focus: { x: 0, z: 0, sel: { kind: 'mix' } },
        focusLabel: 'Open Supply',
      };
    },
  },
  {
    id: 'ride',
    primary: false,
    label: 'Optional · Ride through a unit trip with nobody switched off',
    eval: (st) => ({ done: !!st.flags.rideOk }),
    guide: (st) => ({
      title: 'Optional · Ride through a unit trip with nobody switched off',
      why: 'When a unit trips and the reserve covers it, nobody notices a thing. That is what good island operators aim for every hour of every day.',
      steps: ['Keep the Reserve chip green, especially at the evening peak.', 'The grid-forming battery is the easiest way to do it.'],
      now: [st.flags.rideOk ? ok('Rode through a trip') : (st.flags.uflsCount || 0) > 0 ? warn(`${st.flags.uflsCount} trip${st.flags.uflsCount === 1 ? '' : 's'} switched customers off`) : info('No unit has tripped yet')],
      focus: null,
    }),
  },
];

// ------------------------------------------------------------------ pre-built island network
const PREBUILT = [
  // diesel station bus and the 11 kV trunk along the island
  { type: 'line', from: 'd2', to: { x: -170, z: 75 } },
  { type: 'line', from: 'd1', to: '@node:-170,75' },
  { type: 'line', from: 'd3', to: '@node:-170,75' },
  { type: 'line', from: '@node:-170,75', to: { x: -110, z: 75 } },
  { type: 'line', from: '@last', to: { x: -20, z: 75 } },
  { type: 'line', from: '@last', to: { x: 60, z: 75 } },
  { type: 'line', from: 'solarA', to: '@node:60,75' },
  // town transformer and 400 V streets
  { type: 'line', from: '@node:-20,75', to: { x: 10, z: 100 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:10,100', to: { x: 10, z: 138 } },
  { type: 'line', from: '@last', to: { x: -32, z: 138 } },
  { type: 'line', from: '@node:10,138', to: { x: 52, z: 138 } },
  { type: 'line', from: '@node:10,138', to: { x: 10, z: 166 } },
  { type: 'line', from: '@last', to: { x: -32, z: 166 } },
  { type: 'line', from: '@node:10,166', to: { x: 45, z: 166 } },
  // desalination plant and the west village
  { type: 'line', from: '@node:-110,75', to: { x: -112, z: 138 } },
  { type: 'line', from: '@last', to: { x: -170, z: 138 } },
  { type: 'line', from: '@last', to: { x: -170, z: 180 } },
  { type: 'line', from: '@node:-170,138', to: { x: -240, z: 138 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-240,138', to: { x: -268, z: 164 } },
  // harbour and the east village
  { type: 'line', from: '@node:60,75', to: { x: 120, z: 110 } },
  { type: 'line', from: '@last', to: { x: 120, z: 138 } },
  { type: 'line', from: '@last', to: { x: 125, z: 180 } },
  { type: 'line', from: '@node:120,138', to: { x: 185, z: 138 } },
  { type: 'line', from: '@last', to: { x: 250, z: 138 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:250,138', to: { x: 268, z: 166 } },
  // resorts on 11 kV
  { type: 'line', from: '@node:60,75', to: { x: 150, z: 40 } },
  { type: 'line', from: '@last', to: { x: 228, z: 22 } },
  { type: 'line', from: '@last', to: { x: 228, z: -38 } },
  { type: 'line', from: '@node:-170,75', to: { x: -170, z: 20 } },
  { type: 'line', from: '@last', to: { x: -200, z: -40 } },
  { type: 'line', from: '@last', to: { x: -218, z: -112 } },
  ...MAP6.customers.filter((c) => !c.surprise).map((c) => ({ type: 'drop', building: c.id })),
];

// ------------------------------------------------------------------ director: tanker, scripted trip, reserve and frequency
function snapshot(state, bal) {
  const out = {};
  const head = {};
  for (const id in state.gens) {
    const g = state.gens[id];
    out[id] = g.outKW || 0;
    const T = srcType(bal, g.type);
    head[id] = g.status === 'running' ? (T.storage ? Math.max(0, Math.min(ratedKW(bal, g), g.soc * 60) - g.outKW) : T.dispatch ? Math.max(0, (g.availKW || 0) - g.outKW) : 0) : 0;
  }
  return { out, head, res: state.flow.reserveKW || 0, status: Object.fromEntries(Object.entries(state.gens).map(([id, g]) => [id, g.status])) };
}

/** A unit has just dropped out: if the reserve couldn't replace it, the frequency falls and
 *  under-frequency protection switches the least important customers off for 15 minutes. */
function afterTrip(state, api, id, snap) {
  const F = state.flags;
  const lost = snap.out[id] || 0;
  if (lost < 5) return;
  const spare = Math.max(0, snap.res - (snap.head[id] || 0));
  if (lost <= spare + 1) {
    F.rideOk = true;
    api.emit('rideThrough', { target: id, lost, spare });
    return;
  }
  let need = lost - spare;
  const cands = api.map.customers
    .filter((c) => state.cust[c.id].active !== false && powered(state, c.id) && !typeDef(api.bal, c.type).critical)
    .sort((a, b) => (typeDef(api.bal, a.type).priority ?? 1) - (typeDef(api.bal, b.type).priority ?? 1) || state.cust[b.id].demand - state.cust[a.id].demand || (a.id < b.id ? -1 : 1));
  const ids = [];
  for (const c of cands) {
    if (need <= 0) break;
    state.cust[c.id].uflsUntil = state.t + 15;
    ids.push(c.id);
    need -= state.cust[c.id].demand || 0;
  }
  F.uflsCount = (F.uflsCount || 0) + 1;
  api.emit('ufls', { target: id, lost, spare, ids });
}

function director(state, api) {
  const F = state.flags;
  const bal = api.bal;
  const hm = state.clock % D;
  const d = Math.floor(state.clock / D) + 1;
  let changed;

  // 1. a unit that tripped or ran dry since the last minute
  const prev = F.snap;
  if (prev) {
    for (const id of Object.keys(state.gens).sort()) {
      const s0 = prev.status[id];
      const s1 = state.gens[id].status;
      if ((s0 === 'running' || s0 === 'starting') && (s1 === 'tripped' || s1 === 'nofuel')) {
        afterTrip(state, api, id, prev);
        changed = 'resolve';
      }
    }
  }

  // 2. the morning tanker (held in port by a storm on day 3)
  if (d === 2 && hm === 12 * 60 && !F.delayAnnounced) {
    F.delayAnnounced = true;
    api.emit('tankerDelay');
  }
  if (hm === 7 * 60 && d >= 2 && d !== 3) {
    let units = 0;
    for (const id of UNITS) {
      const g = state.gens[id];
      const T = srcType(bal, g.type);
      const add = Math.max(0, (T.tankMax ?? 400) - g.fuel);
      g.fuel += add;
      units += add;
      if (g.status === 'nofuel') {
        g.status = 'starting';
        g.rampMin = 0;
      }
    }
    const cost = Math.round(units * (bal.fuelPrice ?? 6));
    if (units > 0) api.spend(cost);
    api.emit('tanker', { units: Math.round(units), cost, late: d === 4 });
    changed = 'resolve';
  }

  // 3. the day-2 scripted trip: a unit's fuel pump fails at the evening peak
  if (d === 2 && hm === 17 * 60 && !F.tripWarned) {
    const run = UNITS.filter((id) => state.gens[id].status === 'running').sort((a, b) => (state.gens[b].outKW || 0) - (state.gens[a].outKW || 0) || (a < b ? -1 : 1));
    F.tripWarned = true;
    F.tripTarget = run[0] || 'd2';
    api.emit('unitWarn', { target: F.tripTarget });
  }
  if (d === 2 && hm === 19 * 60 && F.tripTarget && !F.tripDone) {
    F.tripDone = true;
    const g = state.gens[F.tripTarget];
    if (g.status === 'running' || g.status === 'starting') {
      const snap = snapshot(state, bal);
      g.status = 'tripped';
      g.tripUntil = state.clock + 120;
      F.scriptTrip = true;
      afterTrip(state, api, F.tripTarget, snap);
      api.emit('unitTrip', { target: F.tripTarget });
      changed = 'resolve';
    } else api.emit('unitSpared', { target: F.tripTarget });
  }
  if (F.scriptTrip && state.gens[F.tripTarget]?.status === 'tripped' && state.clock >= state.gens[F.tripTarget].tripUntil) {
    const g = state.gens[F.tripTarget];
    g.status = 'starting';
    g.rampMin = 0;
    F.scriptTrip = false;
    api.emit('unitBack', { target: F.tripTarget });
    changed = 'resolve';
  }

  // 4. reserve streak (minutes in a row with the biggest unit covered)
  if (reserveOk(state)) {
    F.resRun = (F.resRun || 0) + 1;
    F.resBest = Math.max(F.resBest || 0, F.resRun);
    if (F.resRun === 1440) api.emit('reserveDay');
  } else {
    if ((F.resRun || 0) >= 180 && !F.resWarnedAt) api.emit('reserveLost', { run: F.resRun });
    F.resRun = 0;
  }

  // 5. the tanker delay window: day 3 00:00 to day 4 07:00
  if (state.clock >= day(3, 0) && state.clock < day(4, 7)) {
    let on = 0;
    let tot = 0;
    for (const c of api.map.customers) {
      if (state.cust[c.id].active === false || !state.cust[c.id].dropped) continue;
      tot++;
      if (powered(state, c.id)) on++;
      else if (typeDef(bal, c.type).critical) F.delayCrit = true;
    }
    F.dOn = (F.dOn || 0) + on;
    F.dTot = (F.dTot || 0) + tot;
    F.delayRel = F.dTot ? (F.dOn / F.dTot) * 100 : 100;
  }
  if (state.clock === day(4, 7) && F.delayOk == null) {
    F.delayOk = !F.delayCrit && (F.delayRel ?? 0) >= 98;
    api.emit(F.delayOk ? 'delayOk' : 'delayMissed', { rel: F.delayRel });
  }

  F.snap = snapshot(state, bal);
  return changed;
}

function score(state) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const reliability = Math.max(0, Math.min(25, (r - 95) * 5));
  const best = bestShare(state);
  const clean = Math.max(0, Math.min(25, ((best - 30) / 40) * 25));
  const stability = Math.max(0, 20 - (state.flags.uflsCount || 0) * 5) * Math.min(1, (state.flags.resBest || 0) / 1440);
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(15, 7 + net / 4000));
  const fair = state.affordPct <= 5 ? 15 : state.affordPct <= 6 ? 10 : 0;
  const parts = { reliability: Math.round(reliability), clean: Math.round(clean), stability: Math.round(stability), finance: Math.round(finance), fair };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['reliability', 'Reliability', 25], ['clean', 'Sun and wind', 25], ['stability', 'Stability', 20], ['finance', 'Finance', 15], ['fair', 'Fairness', 15]] };
}

function metrics(state, bal) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const renew = Object.values(state.gens).filter((g) => RENEW.includes(g.type)).reduce((a, g) => a + ratedKW(bal, g), 0);
  return {
    powered: state.flow.powered,
    total: state.flow.activeCount ?? state.map.customers.length,
    decisions: { battery: !!state.gens.gfb, wind: !!state.gens.wind, rode: !!state.flags.rideOk, delay: !!state.flags.delayOk },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.flow.activeCount ?? state.map.customers.length}`],
      ['Reliability', `${r.toFixed(2)}%`],
      ['Sun and wind built', fmt.kw(renew)],
      ['Best clean day', `${Math.round(bestShare(state))}%`],
      ['Longest covered run', fmt.dur(state.flags.resBest || 0)],
      ['Automatic switch-offs', `${state.flags.uflsCount || 0}`],
      ['Diesel burned', `${Math.round(s.fuelUsed || 0).toLocaleString('en-US')} units`],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
      ['Low-income bill share', `${(state.affordPct || 0).toFixed(1)}%`],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN6 = {
  reserve: { title: 'Fast reserve and the biggest unit', what: 'Your island has no neighbour to lean on. If a running unit trips, the others must replace it within seconds.', why: 'The spare power your running engines and batteries can add straight away is the fast reserve. If it is smaller than the biggest unit and that unit trips, the frequency falls and protection switches customers off to save the rest.', todo: ['Keep the Reserve chip green: spare power at least as big as your biggest unit.', 'Run one more diesel at the peak, or add the grid-forming battery.', 'More, smaller sources make the biggest one less scary.'], real: 'Island grids such as Hawaii, the Canaries and King Island plan every hour around their largest unit, and now use grid-forming batteries to keep the frequency steady.' },
  ufls: { title: 'The frequency fell: customers switched off', what: 'A unit tripped and there wasn’t enough fast reserve to replace it.', why: 'When demand is bigger than supply, every engine on the island slows down and the frequency drops. Protection switches off the least important customers to stop a total blackout.', todo: ['They come back on in 15 minutes.', 'Hold more reserve: another unit running, or the grid-forming battery.'], real: 'This is called under-frequency load shedding. It saves the grid from collapse by sacrificing some load.' },
  ride: { title: 'Rode through a trip', what: 'A unit tripped and nobody noticed.', why: 'Your fast reserve was bigger than the lost unit, so the other sources picked up the load within seconds.', todo: ['Keep it that way at every peak.'], real: 'Grid operators call this an N-1 secure system: it survives losing any one unit.' },
  idle: { title: 'Idling engines burn fuel', what: 'Each running diesel burns fuel even with no load, and can’t run below a quarter of its rating.', why: 'So running every unit all day is safe but wasteful, and at midday it forces you to waste sunshine.', todo: ['Switch off units you don’t need (click a unit, Stop).', 'Let the battery hold the reserve instead.'], real: 'Islands save huge amounts of fuel by switching engines off once batteries can keep the grid stable.' },
  tanker: { title: 'The tanker is delayed', what: 'A storm at sea is holding the fuel tanker in port. Tomorrow’s delivery won’t come.', why: 'Every drop of diesel arrives by ship. The fuel in the tanks now has to last until 07:00 on day 4.', todo: ['Build and connect wind and solar today.', 'Switch off diesel units you don’t need.', 'Charge the battery from the sun and use it at night.'], real: 'Many island grids have just days of fuel in store. Renewables are as much about security as about cost.' },
};

const LINES6 = {
  ...L1,
  intro: [['advisor', 'Welcome to Kalani Island. Three diesel engines, a little solar, and a fuel tanker every morning.'], ['sofia', 'There is no big grid next door. If one engine trips, the others must catch it within seconds.']],
  tankerDelay: [['daniel', 'Bad news: a storm at sea is holding the tanker in port. No fuel tomorrow. The tanks have to last until the morning after.']],
  unitWarn: [['sofia', '{name} has a vibrating fuel pump. It could trip at the evening peak. Is our reserve big enough to catch it?']],
  unitTrip: [['sofia', '{name} has tripped!']],
  rideThrough: [['sofia', 'A unit dropped out and the others caught it. Nobody noticed. That is how it should be.']],
  ufls: [['sofia', 'The frequency fell and protection switched customers off. We need more reserve.']],
  reserveDay: [['advisor', 'A full day with the biggest unit covered. The island is secure.']],
  delayOk: [['maya', 'The tanker is in and we never ran dry. The wind and the sun carried us.']],
  tanker: [['advisor', 'The tanker has topped up the diesel tanks.']],
  tutorialDone: [['advisor', 'Kalani is yours. Keep it steady, and burn as little diesel as you can.']],
};

const TUT6 = [
  { id: 'mix', title: 'Three engines and a little sun', body: 'Click the Supply chip. Three diesel units and a small solar field run the island. The Reserve chip shows your spare fast power against your biggest unit.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
  { id: 'gfb', title: 'A battery that steadies the island', body: 'Press G and click the battery site beside the diesel station. Then connect it to the 11 kV bus with a line (L).', target: { world: 'site', id: 'gfb' }, done: (st) => !!st.gens.gfb && !!st.nodes.gfb?.connected },
  { id: 'wind', title: 'Wind on the hill', body: 'Build the hill wind site (G) and run an 11 kV line from it down to the trunk.', target: { world: 'site', id: 'wind' }, done: (st) => !!st.gens.wind && !!st.nodes.wind?.connected },
  { id: 'solar', title: 'Sun on the airfield', body: 'Build the airfield solar site and connect it. Every kWh of sun is diesel you don’t have to ship in.', target: { world: 'site', id: 'solarB' }, done: (st) => !!st.gens.solarB && !!st.nodes.solarB?.connected },
];

const ENDING6 = {
  common: ['On Kalani the engines are quiet for most of the day now. Wind turns on the hill, panels shine by the old airstrip, and a battery holds the island steady.', 'When the tanker was late, nobody went without water or light.'],
  sustainable: 'A secure, mostly clean island grid. Other islands are already asking how you did it.',
  reliable: 'Steady power for every family and every guest. The island trusts its grid.',
  hardwon: 'It was close at times, but Kalani kept its lights on.',
  decisions: { battery: 'A grid-forming battery kept the frequency steady.', wind: 'The trade winds became the island’s main fuel.', rode: 'A diesel trip passed without anyone noticing.', delay: 'The island rode out the tanker delay.' },
  next: 'Next: the mountains of Highvale.',
};

const ui = {
  tutorial: TUT6,
  lines: LINES6,
  learn: LEARN6,
  ending: ENDING6,
  endTitle: 'Kalani Island runs steady and clean',
  demandNote: 'Homes and villages peak in the evening, resorts run their air conditioning all day and most of the night, and the desalination plant and clinic never stop.',
  briefing: {
    text: 'Kalani Island runs on <b>three diesel engines</b> fed by a tanker every morning. There is no grid next door: when an engine trips, the rest of the island must catch it in seconds. Make the island <b>secure</b> and <b>cleaner</b>, and get it through a <b>tanker delay</b>.',
    goals: ['A grid-forming battery on the 11 kV bus', 'Enough fast reserve to cover the biggest unit, 24 hours straight', 'Everyone powered while the tanker is delayed', 'A day with 60% of power from sun and wind'],
    newSystems: ['<b>Fast reserve</b> and the biggest unit (the Reserve chip)', '<b>Under-frequency load shedding</b> when reserve runs short', '<b>Grid-forming batteries</b>', '<b>Idling engines</b> burn fuel and can’t run below a quarter load'],
  },
  failCause: { clinic: { title: 'The island lost its water or its clinic', body: 'The desalination plant or the clinic was dark for 6 hours.', tip: 'Keep reserve for the evening peak, and keep diesel in the tanks for the tanker delay.' } },
  handles: ['tankerDelay', 'tanker', 'unitWarn', 'unitTrip', 'unitSpared', 'unitBack', 'ufls', 'rideThrough', 'reserveDay', 'reserveLost', 'delayOk', 'delayMissed'],
  onEvent(e, u) {
    const nm = (id) => u.srcName(id);
    switch (e.type) {
      case 'tankerDelay':
        u.audio.play('warn');
        u.say('tankerDelay');
        u.hud.alert({ id: 'tankerDelay', level: 'warn', title: 'No tanker tomorrow', text: `A storm at sea is holding the fuel tanker in port. The ${Math.round(fuelTotal(u.state))} units in the tanks must last until 07:00 on day 4. Build wind and solar, and switch off engines you don’t need.`, actions: [{ label: 'Supply panel', primary: true, fn: () => u.select({ kind: 'mix' }) }], ttl: 0 });
        u.learnOnce('tanker');
        break;
      case 'tanker':
        if (!e.late) u.learnOnce('idle');
        u.hud.alert({ id: 'tanker', level: e.late ? 'good' : 'info', title: e.late ? 'The tanker is finally in' : 'Fuel delivered', text: `${e.units.toLocaleString('en-US')} units of diesel pumped ashore for ${fmt.cr(e.cost)}.`, ttl: 7000 });
        break;
      case 'unitWarn':
        u.audio.play('warn');
        u.say('unitWarn', { name: nm(e.target) });
        u.hud.alert({ id: 'unitWarn', level: 'warn', title: `${nm(e.target)} could trip at 19:00`, text: 'Its fuel pump is vibrating. If it trips at the evening peak, your fast reserve must replace it or the protection will switch customers off. Check the Reserve chip, or stop the unit now and run the others.', actions: [{ label: 'Supply panel', primary: true, fn: () => u.select({ kind: 'mix' }) }, { label: 'Show me', fn: () => u.focus({ kind: 'gen', id: e.target }) }] });
        u.learnOnce('reserve');
        break;
      case 'unitTrip':
        u.audio.play('trip');
        u.hud.dismiss('unitWarn');
        u.say('unitTrip', { name: nm(e.target) });
        break;
      case 'unitSpared':
        u.hud.dismiss('unitWarn');
        u.hud.alert({ id: 'spared', level: 'good', title: `${nm(e.target)} was already off`, text: 'The faulty pump can be fixed without any drama.', ttl: 7000 });
        break;
      case 'unitBack':
        u.hud.alert({ id: 'unitBack', level: 'good', title: `${nm(e.target)} is starting again`, text: 'The fuel pump has been fixed.', ttl: 6000 });
        break;
      case 'ufls':
        u.audio.play('critical');
        u.say('ufls');
        u.hud.alert({ id: 'ufls', level: 'critical', title: `Frequency fell: ${e.ids.length} customer${e.ids.length === 1 ? '' : 's'} switched off`, text: `${nm(e.target)} dropped ${fmt.kw(e.lost)}, but only ${fmt.kw(e.spare)} of fast reserve was ready. Protection switched off the least important customers for 15 minutes. Hold more reserve: another unit running, or the grid-forming battery.`, actions: [{ label: 'Supply panel', primary: true, fn: () => u.select({ kind: 'mix' }) }], ttl: 15000 });
        u.learnOnce('ufls');
        break;
      case 'rideThrough':
        u.audio.play('objective');
        u.say('rideThrough');
        u.hud.alert({ id: 'ride', level: 'good', title: 'Rode through a trip', text: `${nm(e.target)} dropped ${fmt.kw(e.lost)} and your ${fmt.kw(e.spare)} of reserve caught it. Nobody lost power.`, ttl: 9000 });
        u.learnOnce('ride');
        break;
      case 'reserveDay':
        u.audio.play('swell');
        u.say('reserveDay');
        break;
      case 'reserveLost':
        u.hud.alert({ id: 'resLost', level: 'warn', title: `Reserve fell short after ${u.fmt.dur(e.run)}`, text: 'The biggest unit is now bigger than your spare fast power. Start another unit or let the battery help.', ttl: 9000, actions: [{ label: 'Supply panel', fn: () => u.select({ kind: 'mix' }) }] });
        break;
      case 'delayOk':
        u.audio.play('objective');
        u.say('delayOk');
        break;
      case 'delayMissed':
        u.hud.alert({ id: 'delayMissed', level: 'warn', title: 'The delay hurt', text: `Only ${e.rel.toFixed(1)}% of customers kept power while the tanker was away.`, ttl: 9000 });
        break;
    }
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF6 = [
  { type: 'inspect', target: 'mix' },
  { type: 'build', site: 'gfb', option: 'battery' },
  { type: 'line', from: 'gfb', to: '@node:-170,75' },
  { type: 'build', site: 'wind', option: 'wind' },
  { type: 'line', from: 'wind', to: { x: -20, z: -120 } },
  { type: 'line', from: '@last', to: { x: -20, z: -40 } },
  { type: 'line', from: '@last', to: '@node:-20,75' },
  { type: 'build', site: 'solarB', option: 'solar' },
  { type: 'line', from: 'solarB', to: { x: 120, z: -60 } },
  { type: 'line', from: '@last', to: '@node:150,40' },
  { type: 'dispatchOrder', order: ['battery', 'diesel'] },
];

export default {
  id: MAP6.id,
  n: 6,
  key: 'stage6',
  stageName: 'Stage 6 · Island Power',
  name: 'Kalani Island',
  region: 'Kalani',
  blurb: 'An island on three diesel engines and a daily fuel tanker. Hold enough reserve to survive any trip, and cut the diesel before the tanker is late.',
  learns: ['Fast reserve and the biggest unit', 'Frequency and automatic load shedding', 'Grid-forming batteries', 'Fuel security on an island'],
  map: MAP6,
  bal: BAL6,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'mix', 'reserve', 'tanks', 'renew', 'weather', 'powered'],
  objectives,
  weather: W6,
  cast: { mayor: { name: 'Leilani Kahale', role: 'Mayor of Kalani', color: '#b48cf2', initials: 'LK' }, nana: { name: 'Tutu Malia', role: 'Island elder', color: '#d9b38c', initials: 'TM' }, ravi: { name: 'Koa Nainoa', role: 'Fisherman and market trader', color: '#9bd36b', initials: 'KN' } },
  quests: {
    perDay: [1, 2],
    pool: [
      { key: 'catch', who: 'ravi', title: 'Keep the cold store running', text: 'The boats are bringing in a big catch. Keep the harbour and cold store lit from 06:00 to 14:00.', goal: { type: 'keepLit', ids: ['port'], fromH: 6, toH: 14 }, reward: { credits: 1200, rep: 3 }, news: 'Record catch kept fresh at Kalani harbour.' },
      { key: 'luau', who: 'mayor', title: 'Beach party at Coral Bay', text: 'Coral Bay Resort is holding a beach party. Keep it lit from 18:00 to 23:00.', goal: { type: 'keepLit', ids: ['r1'], fromH: 18, toH: 23 }, reward: { credits: 1500, rep: 2 } },
      { key: 'water', who: 'nana', title: 'Fill the island’s water tanks', text: 'The dry season is coming. Keep the desalination plant running from 08:00 to 20:00.', goal: { type: 'keepLit', ids: ['desal'], fromH: 8, toH: 20 }, reward: { credits: 1000, rep: 4 }, news: 'Kalani’s water tanks full for the dry season.' },
      { key: 'sunny', who: 'maya', title: 'A sunny-day challenge', text: 'Make at least 45% of today’s electricity from sun and wind.', goal: { type: 'renewShare', pct: 45 }, reward: { credits: 1500, rep: 3 } },
      { key: 'fuelSaver', who: 'daniel', title: 'Save diesel today', text: 'Burn less than 14,000 kWh of diesel power today.', goal: { type: 'fossilUnder', kWh: 14000 }, reward: { credits: 1800, rep: 2 } },
      { key: 'charged', who: 'sofia', title: 'Battery full for the evening', text: 'Have the battery at 80% or more by 17:00.', goal: { type: 'socAt', pct: 80, hour: 17 }, reward: { credits: 1000, rep: 2 } },
      { key: 'noCuts', who: 'maya', title: 'An evening without cuts', text: 'No one switched off between 17:00 and 22:00, please.', goal: { type: 'noShed', fromH: 17, toH: 22 }, reward: { credits: 1000, rep: 2 } },
    ],
  },
  story: [
    { day: 1, hour: 9, who: 'mayor', lines: ['Aloha! I’m Leilani, the mayor. The whole island depends on those three old engines and a ship that comes every morning.', 'When the ship is late, we worry. Help us worry less.'] },
    { day: 1, hour: 16, who: 'ravi', title: 'Ice for the fishing boats', text: 'Koa asks if the cold store can make extra ice for the night boats. It means more load in the evening, and the boats pay for it.', options: [{ label: 'Make the ice · +600 ¢', gain: 600, rep: 2, note: 'More evening load, more income.', news: 'Night boats sail with Kalani ice.' }, { label: 'Not tonight', rep: -1 }] },
    { day: 2, hour: 10, who: 'leila', title: 'The island radio wants a word', text: 'Leila from Kalani Radio asks why the lights flicker when an engine stops. Will you explain on air?', options: [{ label: 'Explain on the radio', rep: 4, note: 'People like to understand.', news: '“It’s all about reserve,” the utility explains on Kalani Radio.' }, { label: 'No comment', rep: -2 }] },
    { day: 3, hour: 9, who: 'nana', lines: ['When I was young, the island went dark every time the ship was late. Let’s see if this time is different.'] },
    { day: 3, hour: 14, who: 'tom', title: 'The engine crew is exhausted', text: 'The diesel crew has been nursing the engines through the delay. Tom asks for a hot meal and overtime pay.', options: [{ label: 'Pay overtime · 800 ¢', cost: 800, rep: 3, trust: 2, note: 'A happy crew keeps the engines happy.', news: 'Utility thanks its engine crew through the fuel crisis.' }, { label: 'Not now', rep: -3 }] },
    { day: 4, hour: 12, who: 'amira', lines: ['The children counted the wind turbines turning from the school window today. They want to name one!'] },
    { day: 5, hour: 10, who: 'mayor', lines: ['Other islands have been calling. They want to know how Kalani keeps its lights on with so little diesel.'] },
  ],
  events: {
    count: [7, 9],
    minGapH: 6,
    avoidH: [[34, 45], [48, 79]], // day-2 tanker news and trip, and the tanker delay window
    pool: [
      { key: 'cyclone', kind: 'cyclone', weight: 2, windowH: [80, 135], warnH: 18, durH: 6, params: { name: 'Hina', track: [-400, -240, 400, 120], width: 110, p: 0.4, max: 3 } },
      { key: 'tsunami', kind: 'tsunami', weight: 1, windowH: [80, 135], warnH: 2, durH: 3, params: { area: 'the south shore', zone: { poly: [[-400, 190], [400, 190], [400, 320], [-400, 320]] }, maxLines: 2 } },
      { key: 'unitTrip', kind: 'blackout', weight: 2, windowH: [10, 32], warnH: 2, durH: 2, params: { targets: ['d1', 'd2', 'd3'] } },
      { key: 'unitTrip2', kind: 'blackout', weight: 2, windowH: [80, 135], warnH: 2, durH: 2, params: { targets: ['d1', 'd2', 'd3'] } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [80, 135], warnH: 3 },
      { key: 'cruise', kind: 'festival', weight: 2, windowH: [80, 135], atHour: 17, warnH: 18, durH: 6, params: { name: 'A cruise ship calls', text: 'A cruise ship is anchoring off Kalani and two thousand passengers will pour into the harbour, the market and the resorts.', ids: ['port', 'market', 'r1', 'r2'], mult: 1.35, startH: 17, at: { x: 120, z: 190 }, say: 'Cruise ship tomorrow evening! The harbour and resorts will be packed.', goodNews: 'Cruise passengers enjoy a bright evening on Kalani.', badNews: 'Power cut greets cruise passengers.' } },
      { key: 'regatta', kind: 'festival', weight: 1, windowH: [10, 32], atHour: 18, warnH: 12, durH: 4, params: { name: 'The canoe regatta', text: 'The island’s canoe regatta ends with a feast in both fishing villages.', ids: ['v1', 'v2', 'h3', 'h4'], mult: 1.4, startH: 18, at: { x: 0, z: 180 }, goodNews: 'Regatta feast lights up both villages.', badNews: 'Regatta feast in the dark.' } },
      { key: 'lagoon', kind: 'arrivals', weight: 2, windowH: [80, 120], warnH: 8, durH: 12, params: { group: 'lagoon', at: { x: 270, z: 50 }, title: 'A new resort is opening', text: 'Lagoon Resort, 40 rooms on the east shore, is finishing its first wing.', say: 'A new resort is opening on the east shore. More guests, more air conditioning.', goodNews: 'Lagoon Resort opens with the lights on.', badNews: 'New resort opens without power.' } },
      { key: 'mayor', kind: 'vipVisit', weight: 1, windowH: [80, 135], atHour: 11, warnH: 14, durH: 3, params: { name: 'The island governor', who: 'mayor', zone: { x: 10, z: 150, r: 75 }, grant: 1500, text: 'The governor is visiting the harbour town to see the island’s energy plan.', goodNews: 'Governor praises Kalani’s steady, cleaner grid.', badNews: 'Lights fail during the governor’s visit.' } },
      { key: 'storm', kind: 'storm', weight: 1, windowH: [10, 32], warnH: 3, durH: 2, params: { p: 0.15, max: 1 } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [80, 135], warnH: 10, params: { grant: 1200 } },
      { key: 'theft', kind: 'theft', weight: 1, windowH: [80, 135], warnH: 6, params: { area: 'the harbour', cost: 400 } },
      { key: 'shore', kind: 'request', weight: 1, windowH: [10, 135], params: { who: 'ravi', title: 'Solar freezers for the village', text: 'The Tane fishing families ask for help buying solar freezers, so their catch keeps without diesel.', options: [{ label: 'Help pay · 1,500 ¢', cost: 1500, yes: true, rep: 5, trust: 4, cls: ['lowincome'], note: 'Fresher fish, lower bills.', news: 'Tane fishers get solar freezers.' }, { label: 'Not now', rep: -2 }] } },
    ],
    protests: { outages: 4, credit: 1500 },
  },
  prebuilt: PREBUILT,
  init(state) {
    state.started = true;
    state.gens.d3.status = 'off'; // the third unit is on standby
  },
  afterPrebuilt(state) {
    for (const id in state.nodes) if (state.nodes[id].kind === 'xfmr') state.nodes[id].legacy = true;
    for (const id in state.edges) state.edges[id].legacy = true;
  },
  director,
  score,
  metrics,
  refBuild(sim) {
    runSteps(sim.cmd, sim.state, REF6);
    sim.cmd({ type: 'startGen', target: 'd3' });
  },
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF6);
    for (let i = 0; i < 6 * D && !sim.state.result; i++) {
      const hm = sim.state.clock % D;
      // run two engines by day and three at the evening peak while the battery holds the reserve
      if (hm === 10 * 60) sim.cmd({ type: 'stopGen', target: 'd3' });
      if (hm === 16 * 60 && sim.state.clock < day(3, 0)) sim.cmd({ type: 'startGen', target: 'd3' });
      sim.tick();
      drainAndRespond(sim);
    }
  },
  ui,
  camera: { x: 0, z: 10, dist: 720 },
  ending: { x: 0, z: 100, dist: 320, outDist: 900, outDX: 0, outDZ: 0 },
};
