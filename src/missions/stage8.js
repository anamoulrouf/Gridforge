// Stage 8 · Desert Sun, "Dunefield" (Chapter II).
// An oasis town, a date-packing works and a new green-steel plant in the desert. The sun is huge
// but only shines by day, dust storms dim it, and in the heat lines and transformers carry less.
// Green hydrogen is the long-duration store: an electrolyser turns midday surplus into hydrogen,
// the steel plant buys some of it every hour under contract, and a turbine burns the rest at night.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { runSteps } from '../sim/steps.js';
import { typeDef, ratedKW } from '../sim/power.js';
import { drainAndRespond } from '../sim/events.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;
const H2_PER_H = 250; // kWh of hydrogen the steel plant takes every hour once the plant is running

// ------------------------------------------------------------------ map
const homes = (id, name, x, z, extra = {}) => ({ id, type: 'home', name, x, z, w: 10, d: 10, scale: 30, ...extra });

export const MAP8 = {
  id: 'stage8-dunefield',
  bounds: { minX: -420, maxX: 420, minZ: -260, maxZ: 260 },
  tile: { cx: 0, cz: 0, hw: 460, hd: 300, radius: 90 },
  mvTypes: ['steel', 'dates', 'pump'],
  desert: true,
  palms: true,
  treeDensity: 0.18,
  life: { traffic: 0.65, busColor: '#e9862c', birds: 6 },
  roads: [
    { id: 'main', x: 0, z: 0, w: 900, d: 9, lanes: true },
    { id: 'oasis', x: -60, z: 60, w: 8, d: 120, lanes: true },
    { id: 'works', x: 220, z: -70, w: 8, d: 140, lanes: true },
    { id: 'depot', x: 90, z: 40, w: 8, d: 70 },
  ],
  crossings: [[-60, 8.5, false], [220, -8.5, false]],
  lampRoads: ['main', 'oasis'],
  water: [{ x: -175, z: 165, w: 50, d: 26 }],
  hills: [
    { x: -330, z: -190, r: 120, h: 18, squash: 0.5 },
    { x: 330, z: 200, r: 110, h: 16, squash: 0.45 },
    { x: -340, z: 200, r: 100, h: 14, squash: 0.6 },
    { x: 60, z: 230, r: 90, h: 12, squash: 0.5 },
  ],
  clear: [{ x: 0, z: -170, w: 500, d: 120 }],
  core: [{ x: -60, z: 70, w: 220, d: 150 }],
  sources: [
    { id: 'solarA', type: 'solar', name: 'Dunefield solar park', tier: 'MV', x: -150, z: -160, w: 160, d: 80, port: { x: -150, z: -110 }, kw: 3000 },
    { id: 'gas', type: 'gas', name: 'Desert gas plant', tier: 'MV', x: 360, z: 60, w: 26, d: 18, port: { x: 340, z: 40 }, kw: 2200, running: true },
  ],
  sites: [
    { id: 'solarB', name: 'East sand flats solar site', desc: 'Flat, empty and sunny', x: 120, z: -180, w: 180, d: 70, tier: 'MV', port: { x: 120, z: -135 }, options: [{ type: 'solar', kw: 4000, cost: 18000 }] },
    { id: 'batt', name: 'Battery site', desc: 'Next to the town switchyard', x: 30, z: 60, w: 34, d: 16, tier: 'MV', port: { x: 30, z: 40 }, options: [{ type: 'battery', kw: 1500, kwh: 6000, cost: 14000 }] },
    { id: 'h2', name: 'Hydrogen plant site', desc: 'Beside the steel plant', x: 300, z: -150, w: 40, d: 30, tier: 'MV', port: { x: 270, z: -130 }, options: [{ type: 'h2', kw: 1500, kwh: 30000, cost: 28000, note: 'A 2.5 MW electrolyser splits water into hydrogen with spare power. The steel plant buys some of it every hour; a 1.5 MW turbine can burn the rest at night. Only about 40% of the electricity comes back.' }] },
  ],
  depot: { id: 'depot', x: 90, z: 85, w: 18, d: 12 },
  townCenterZ: 60,
  decor: [
    { kind: 'farm', x: -380, z: 470, w: 210, d: 100, top: -9 },
    { kind: 'town', x: 380, z: -470, w: 180, d: 150, top: -8 },
  ],
  customers: [
    homes('h1', 'Palm Street homes', -100, 40),
    homes('h2', 'Well Street homes', -20, 40),
    homes('h3', 'Oasis Row homes', -100, 90),
    homes('h4', 'Caravan Lane homes', -20, 90),
    { id: 'clinic', type: 'clinic', name: 'Dunefield Clinic', x: -100, z: 140, w: 16, d: 12 },
    { id: 'school', type: 'school', name: 'Dunefield School', x: -20, z: 140, w: 24, d: 12 },
    { id: 'market', type: 'shop', name: 'Souk market', x: -160, z: 30, w: 10, d: 9, label: 'SOUK' },
    { id: 'pump', type: 'pump', name: 'Desert well pumps', x: -190, z: 110, w: 14, d: 10 },
    { id: 'dates', type: 'dates', name: 'Date-packing works', x: 120, z: -50, w: 36, d: 22, label: 'DATES', look: 'warehouse' },
    { id: 'steel', type: 'steel', name: 'Dunefield green steel', x: 300, z: -70, w: 60, d: 40, label: 'GREEN STEEL', look: 'mill' },
    // surprise: a new town for solar workers (some runs)
    { ...homes('n1', 'Solar workers’ homes (new)', 60, 130), surprise: 'workers' },
    { ...homes('n2', 'Panel Lane homes (new)', 100, 130), surprise: 'workers' },
  ],
};

// ------------------------------------------------------------------ balance
// air conditioning: homes peak in the afternoon heat and again in the evening
const acProfile = (h) => (h >= 13 && h <= 17 ? 1.9 : h >= 18 && h <= 22 ? 2.2 : h >= 7 && h <= 12 ? 1.1 : 0.6);
export const BAL8 = {
  ...BALANCE,
  start: { credits: 80000, poles: 50, transformers: 3, cable: 2000, kits: 3, fuel: 0 },
  startClockMin: 7 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1200, drop: 50, maintain: 400, repairLabour: 600, dailyOverhead: 4000 },
  procurement: { ...BALANCE.procurement, kits: { qty: 1, cost: 600, leadH: 8 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 20000, MV: 4000, LV: 400 }, dropReach: 24, mvDropReach: 32 },
  transformer: { ...BALANCE.transformer, ratingKW: 260 },
  upgrades: { xfmr100: { ratingKW: 420, cost: 2500 } },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  heatDerate: true,
  sourceTypes: {
    gas: { dispatch: true, rampH: 0.1, maxKW: 2200, costPerKWh: 0.22, co2: 0.45, wearPerRunHour: 0.1 },
    solar: { variable: 'solar', renewable: true, co2: 0 },
    battery: { storage: true, storageClean: true, kwh: 6000, eff: 0.9, co2: 0 },
    // hydrogen: a big electrolyser (charging), a smaller turbine (discharging), a huge tank, poor round trip
    h2: { storage: true, storageClean: true, kwh: 30000, eff: 0.4, chargeMaxKW: 2500, dischargeKW: 1500, co2: 0 },
  },
  dispatchOrder: ['battery', 'h2', 'gas'],
  types: {
    home: { label: 'Homes', cls: 'home', nominal: 1, priority: 1, profile: acProfile },
    clinic: { label: 'Clinic', cls: 'public', nominal: 40, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 60, priority: 2, profile: (h) => (h >= 7 && h <= 13 ? 1.0 : 0.1) },
    shop: { label: 'Market', cls: 'business', nominal: 40, priority: 1, profile: (h) => (h >= 6 && h <= 12 ? 1.0 : h >= 17 && h <= 22 ? 1.2 : 0.2) },
    pump: { label: 'Well pumps (11 kV)', cls: 'public', nominal: 220, priority: 3, critical: true, profile: (h) => (h >= 5 && h <= 9 ? 1.0 : h >= 16 && h <= 21 ? 1.0 : 0.4) },
    dates: { label: 'Date-packing works (11 kV)', cls: 'business', nominal: 300, priority: 1, profile: (h) => (h >= 6 && h <= 15 ? 1.0 : 0.25) },
    steel: { label: 'Green steel plant (11 kV)', cls: 'industry', nominal: 700, priority: 1, profile: (h) => (h >= 8 && h <= 17 ? 1.0 : 0.45) },
  },
  tariffs: { home: { base: 0.4, min: 0.3, max: 0.6 }, business: { base: 0.48, min: 0.35, max: 0.8 }, industry: { base: 0.4, min: 0.3, max: 0.6 }, public: { base: 0.3, min: 0.2, max: 0.45 } },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 6, bankruptGraceH: 6, deadlineDay: 7, debtLimit: -30000 },
};

// desert heat: hot every day, a heat record on day 4 (lines and transformers carry less)
const W8 = {
  1: { wind: 4, cloud: 0.05, tempAdd: 14, label: 'Hot and clear' },
  2: { wind: 6, cloud: 0.1, tempAdd: 14, label: 'Hot; a sandstorm in the afternoon' },
  3: { wind: 4, cloud: 0.05, tempAdd: 16, label: 'Very hot' },
  4: { wind: 3, cloud: 0.0, tempAdd: 22, label: 'Heat record: lines and transformers carry less' },
  5: { wind: 4, cloud: 0.05, tempAdd: 15, label: 'Hot and clear' },
  6: { wind: 4, cloud: 0.1, tempAdd: 14, label: 'Hot' },
  7: { wind: 4, cloud: 0.05, tempAdd: 14, label: 'Hot and clear' },
};

const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;
const h2Pct = (st) => (st.gens.h2 ? (st.gens.h2.soc / st.gens.h2.kwh) * 100 : 0);
/** Hydrogen delivered to the steel plant over the last 48 hours, as a share of what was owed. */
export function h2Window(st) {
  const ct = st.flags.h2Hours || [];
  const owed = ct.length * H2_PER_H;
  const got = ct.reduce((a, x) => a + x, 0);
  return { hours: ct.length, pct: owed ? (got / owed) * 100 : 0 };
}

// air conditioners work harder in the heat
function demandMod(state, c, kw, hour, w, bal) {
  if (w.temp > 40 && typeDef(bal, c.type).cls === 'home') return kw * (1 + Math.min(0.25, (w.temp - 40) * 0.04));
  return kw;
}

const objectives = [
  {
    id: 'h2',
    primary: true,
    label: 'Build the hydrogen plant and connect it',
    eval: (st) => ({ done: !!st.gens.h2 && !!st.nodes.h2?.connected }),
    guide: (st) => ({
      title: 'Build the hydrogen plant and connect it',
      why: 'The desert has more sun than it can use at noon and none at night. An electrolyser turns the midday surplus into hydrogen, which keeps for days. Only about 40% of the energy comes back as electricity, so it is best used for things batteries can’t do.',
      steps: [`Press ${k('G')} and build the hydrogen plant beside the steel works.`, `Connect it with an 11 kV line (${k('L')}).`, 'It makes hydrogen whenever there is spare power.'],
      now: [st.gens.h2 ? (st.nodes.h2?.connected ? ok(`Tank ${Math.round(h2Pct(st))}% full`) : warn('Built but not connected')) : todo('Not built yet')],
      focus: { x: 300, z: -150, sel: { kind: 'site', id: 'h2' } },
      focusLabel: 'Show the site',
    }),
  },
  {
    id: 'contract',
    primary: true,
    label: 'Supply the steel plant 95% of its hydrogen over 48 hours',
    eval: (st) => {
      const w = h2Window(st);
      return { done: !!st.flags.contractOk, progress: [Math.min(48, w.hours), 48] };
    },
    guide: (st) => {
      const w = h2Window(st);
      return {
        title: 'Supply the steel plant 95% of its hydrogen over 48 hours',
        why: `Dunefield Green Steel makes iron with hydrogen instead of coal. It needs ${H2_PER_H} kWh of hydrogen every hour. The contract is checked over any 48 hours in a row.`,
        steps: ['Build lots of solar: every kWh of spare sunshine makes hydrogen.', 'Keep the tank from running dry at night: the steel plant gets its hydrogen before the turbine does.', 'If you need the turbine at night, use it sparingly.'],
        now: [w.hours ? info(`Last ${w.hours} h: ${w.pct.toFixed(1)}% delivered`) : todo('Contract starts when the hydrogen plant is running'), st.gens.h2 ? info(`Tank ${Math.round(h2Pct(st))}% full`) : null].filter(Boolean),
        focus: st.gens.h2 ? { x: 300, z: -150, sel: { kind: 'gen', id: 'h2' } } : null,
        focusLabel: 'Show the tank',
      };
    },
  },
  {
    id: 'nights',
    primary: true,
    bar: true,
    label: 'Run two whole nights without the gas plant',
    eval: (st) => ({ done: (st.flags.cleanNights || 0) >= 2, progress: [Math.min(2, st.flags.cleanNights || 0), 2] }),
    guide: (st) => ({
      title: 'Run two whole nights without the gas plant',
      why: 'Gas is expensive and dirty. The town’s nights (20:00 to 06:00) can run on stored sun: a battery for the evening, hydrogen for the small hours.',
      steps: ['Build the battery and the hydrogen plant.', 'Keep gas last in the generation order.', 'Stop the gas plant once storage is full (click it, Stop). A night counts if gas made nothing and nobody was short of power.'],
      now: [info(`Clean nights: ${st.flags.cleanNights || 0} of 2`), (st.gens.gas?.outKW || 0) > 1 ? warn(`Gas running: ${fmt.kw(st.gens.gas.outKW)}`) : ok('Gas idle')],
      focus: { x: 0, z: 0, sel: { kind: 'mix' } },
      focusLabel: 'Open Supply',
    }),
  },
  {
    id: 'pumps',
    primary: true,
    label: 'Keep the well pumps and clinic running through the heat record',
    eval: (st) => ({ done: !!st.flags.heatOk }),
    guide: (st) => ({
      title: 'Keep the well pumps and clinic running through the heat record',
      why: 'On day 4 it reaches about 46 °C. Hot conductors can carry less current, so every line and transformer loses around a tenth of its limit just when air conditioning is at full blast.',
      steps: ['Check transformer forecasts the evening before (O for the capacity overlay).', 'Build an extra transformer or split a busy one before day 4.', 'Keep supply ready for the afternoon peak.'],
      now: [st.clock < day(4, 0) ? info(`Heat record in ${fmt.dur(day(4, 0) - st.clock)}`) : st.flags.heatOk ? ok('Pumps and clinic kept running') : st.flags.heatOk === false ? warn(`Missed: ${(st.flags.heatRel ?? 0).toFixed(1)}%`) : info(`So far ${(st.flags.heatRel ?? 100).toFixed(1)}%`)],
      focus: null,
    }),
  },
  {
    id: 'noWaste',
    primary: false,
    label: 'Optional · A sunny noon with no sunshine wasted',
    eval: (st) => ({ done: !!st.flags.noWaste }),
    guide: (st) => ({
      title: 'Optional · A sunny noon with no sunshine wasted',
      why: 'At noon the solar parks make more than the town needs. Without storage or hydrogen, the rest is simply switched off.',
      steps: ['Give the surplus somewhere to go: the battery, then the electrolyser.', 'From 11:00 to 14:00, less than 2% of the sunshine may be wasted.'],
      now: [st.flags.noWaste ? ok('Not a ray wasted') : info(`Wasted right now: ${fmt.kw(st.flow.curtailedKW || 0)}`)],
      focus: null,
    }),
  },
];

// ------------------------------------------------------------------ pre-built town network (11 kV)
const PREBUILT = [
  { type: 'line', from: 'solarA', to: { x: -150, z: -60 } },
  { type: 'line', from: '@last', to: { x: -60, z: -20 } },
  { type: 'line', from: '@last', to: { x: 40, z: -20 } },
  { type: 'line', from: '@last', to: { x: 160, z: -20 } },
  { type: 'line', from: '@last', to: { x: 260, z: -20 } },
  { type: 'line', from: '@last', to: { x: 340, z: -20 } },
  { type: 'line', from: 'gas', to: '@node:340,-20' },
  // town transformers (east of the oasis road) and 400 V streets
  { type: 'line', from: '@node:-60,-20', to: { x: -40, z: 22 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-40,22', tier: 'up', to: { x: -40, z: 66 } },
  { type: 'line', from: '@last', to: { x: -40, z: 115 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-40,22', to: { x: -20, z: 24 } },
  { type: 'line', from: '@node:-40,22', to: { x: -80, z: 24 } },
  { type: 'line', from: '@last', to: { x: -120, z: 24 } },
  { type: 'line', from: '@last', to: { x: -150, z: 24 } },
  { type: 'line', from: '@node:-40,115', to: { x: -40, z: 75 } },
  { type: 'line', from: '@last', to: { x: -80, z: 75 } },
  { type: 'line', from: '@last', to: { x: -112, z: 75 } },
  { type: 'line', from: '@node:-40,75', to: { x: -20, z: 75 } },
  { type: 'line', from: '@node:-40,115', to: { x: -80, z: 128 } },
  { type: 'line', from: '@last', to: { x: -100, z: 128 } },
  { type: 'line', from: '@node:-40,115', to: { x: -20, z: 128 } },
  // pumps, the date works and the steel plant on 11 kV
  { type: 'line', from: '@node:-150,-60', to: { x: -210, z: 20 } },
  { type: 'line', from: '@last', to: { x: -210, z: 90 } },
  { type: 'line', from: '@node:160,-20', to: { x: 140, z: -32 } },
  { type: 'line', from: '@node:260,-20', to: { x: 262, z: -42 } },
  ...MAP8.customers.filter((c) => !c.surprise).map((c) => ({ type: 'drop', building: c.id })),
];

// ------------------------------------------------------------------ director
function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D;
  const d = Math.floor(state.clock / D) + 1;
  const g = state.gens.h2;
  // hydrogen to the steel plant: first call on the tank, every hour, once the plant runs
  if (g && state.nodes.h2?.connected && hm % 60 === 0) {
    if (!F.h2Start) {
      F.h2Start = state.clock;
      api.emit('h2Start');
    }
    const take = Math.min(H2_PER_H, g.soc);
    g.soc -= take;
    (F.h2Hours ||= []).push(Math.round(take));
    if (F.h2Hours.length > 48) F.h2Hours.shift();
    F.h2Sold = (F.h2Sold || 0) + take;
    state.credits += take * 0.3; // the steel plant pays 0.30 ¢ per kWh of hydrogen
    const w = h2Window(state);
    if (w.hours >= 48 && w.pct >= 95 && !F.contractOk) {
      F.contractOk = true;
      api.emit('contractOk');
    }
    if (take < H2_PER_H * 0.5 && !F.h2DryWarned) {
      F.h2DryWarned = true;
      api.emit('h2Dry');
    }
    if (take >= H2_PER_H) F.h2DryWarned = false;
  }
  // a clean night: 20:00 to 06:00 with no gas and nobody short of power
  const inNight = hm >= 20 * 60 || hm < 6 * 60;
  if (inNight) {
    if (hm === 20 * 60) F.nightBad = false;
    if ((state.gens.gas?.outKW || 0) > 1 || api.map.customers.some((c) => state.cust[c.id].status === 'shed')) F.nightBad = true;
  }
  if (hm === 6 * 60 && d > 1 && F.nightBad === false) {
    F.cleanNights = (F.cleanNights || 0) + 1;
    api.emit('cleanNight', { n: F.cleanNights });
    F.nightBad = null;
  }
  // the heat record: day 4, pumps and clinic
  if (d === 3 && hm === 18 * 60) api.emit('heatForecast');
  if (d === 4) {
    for (const id of ['pump', 'clinic']) {
      F.heatTot = (F.heatTot || 0) + 1;
      if (powered(state, id)) F.heatOn = (F.heatOn || 0) + 1;
    }
    F.heatRel = ((F.heatOn || 0) / F.heatTot) * 100;
    if (hm === 23 * 60 + 59 && F.heatOk == null) {
      F.heatOk = F.heatRel >= 98;
      api.emit(F.heatOk ? 'heatOk' : 'heatMissed', { rel: F.heatRel });
    }
  }
  // no sunshine wasted from 11:00 to 14:00 on a clear day
  if (hm >= 11 * 60 && hm < 14 * 60) {
    if (hm === 11 * 60) {
      F.noonWaste = 0;
      F.noonSun = 0;
    }
    F.noonWaste = (F.noonWaste || 0) + (state.flow.curtailedKW || 0);
    F.noonSun = (F.noonSun || 0) + Object.values(state.gens).filter((x) => x.type === 'solar').reduce((a, x) => a + (x.availKW || 0), 0);
  }
  if (hm === 14 * 60 && F.noonSun > 0 && F.noonWaste / F.noonSun < 0.02 && !F.noWaste && state.gens.h2) {
    F.noWaste = true;
    api.emit('noWaste');
  }
}

function score(state) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const reliability = Math.max(0, Math.min(25, (r - 95) * 5));
  const w = h2Window(state);
  const hydrogen = Math.min(20, (w.pct / 100) * 20);
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  const emissions = Math.max(0, Math.min(20, 20 - co2 / 3));
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(15, 6 + net / 6000));
  const heat = state.flags.heatOk ? 15 : 0;
  const parts = { reliability: Math.round(reliability), hydrogen: Math.round(hydrogen), emissions: Math.round(emissions), finance: Math.round(finance), heat };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['reliability', 'Reliability', 25], ['hydrogen', 'Hydrogen contract', 20], ['emissions', 'Emissions', 20], ['finance', 'Finance', 15], ['heat', 'Heat record', 15]] };
}

function metrics(state, bal) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  const solar = Object.values(state.gens).filter((g) => g.type === 'solar').reduce((a, g) => a + ratedKW(bal, g), 0);
  return {
    powered: state.flow.powered,
    total: state.flow.activeCount ?? state.map.customers.length,
    decisions: { h2: !!state.gens.h2, battery: !!state.gens.batt, nights: (state.flags.cleanNights || 0) >= 2, heat: !!state.flags.heatOk },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.flow.activeCount ?? state.map.customers.length}`],
      ['Reliability', `${r.toFixed(2)}%`],
      ['Solar built', fmt.kw(solar)],
      ['Hydrogen to the steel plant', `${Math.round((state.flags.h2Sold || 0) / 1000).toLocaleString('en-US')} MWh`],
      ['Contract (last 48 h)', `${h2Window(state).pct.toFixed(1)}%`],
      ['Clean nights', `${state.flags.cleanNights || 0}`],
      ['CO₂ from gas', `${co2.toFixed(1)} t`],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN8 = {
  h2: { title: 'Green hydrogen', what: 'Your electrolyser is splitting water into hydrogen with spare sunshine.', why: 'Hydrogen stores energy for days or weeks, far longer than a battery. But making it and burning it again loses about 60% of the energy, so it is best for industry (like steel) and for the longest gaps.', todo: ['Let the battery handle the evening; save hydrogen for the small hours.', 'The steel plant takes its hydrogen first every hour.'], real: 'Green steel plants in Sweden and elsewhere are already replacing coal with hydrogen made from clean power.' },
  derate: { title: 'Heat makes lines weaker', what: 'Above 35 °C, every line and transformer can carry a little less.', why: 'A conductor’s limit is set by how hot it can safely get. On a 46 °C day it starts closer to that limit, so it can carry about a tenth less current.', todo: ['Check the capacity overlay (O) the evening before.', 'Split busy transformers or add another feeder before the heat.', 'Batteries near the town ease the evening peak.'], real: 'Grid operators publish lower summer ratings for lines, and some use sensors to rate them by the actual weather.' },
  dust: { title: 'Dust on the panels', what: 'A sandstorm has coated the solar parks.', why: 'Dirty panels let less light through, so output falls until they are washed.', todo: ['Send the crew to wash each solar park.'], real: 'Desert solar plants use robots and crews to clean panels, sometimes every night.' },
};

const LINES8 = {
  ...L1,
  intro: [['advisor', 'Welcome to Dunefield. More sunshine than anywhere you’ve worked, and none of it at night.'], ['sofia', 'A green-steel plant is opening. It runs on hydrogen, and we are going to make that hydrogen from the sun.']],
  h2Start: [['daniel', 'The hydrogen plant is running. The steel plant will take its share every hour from now on.']],
  h2Dry: [['sofia', 'The hydrogen tank is nearly dry! The steel plant isn’t getting its share.']],
  heatForecast: [['advisor', 'Heat record tomorrow, about 46 °C. Every line and transformer will carry about a tenth less.']],
  heatOk: [['maya', 'The hottest day in memory, and the water never stopped.']],
  contractOk: [['daniel', 'Forty-eight hours of hydrogen, right on contract. The steel plant is delighted.']],
  cleanNight: [['maya', 'A whole night on stored sunshine. The gas plant didn’t even warm up.']],
  noWaste: [['sofia', 'Noon, full sun, and not a ray wasted. The battery and the electrolyser soaked it all up.']],
  tutorialDone: [['advisor', 'The desert is yours. Store the sun.']],
};

const TUT8 = [
  { id: 'mix', title: 'Sun by day, gas by night', body: 'Click the Supply chip. A big solar park runs the town by day; the gas plant runs it at night.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
  { id: 'solar', title: 'More sun', body: 'Press G and build the east sand flats solar site, then connect it at 11 kV.', target: { world: 'site', id: 'solarB' }, done: (st) => !!st.gens.solarB && !!st.nodes.solarB?.connected },
  { id: 'h2', title: 'Make hydrogen', body: 'Build the hydrogen plant beside the steel works and connect it. Spare sunshine becomes hydrogen for the steel plant.', target: { world: 'site', id: 'h2' }, done: (st) => !!st.gens.h2 && !!st.nodes.h2?.connected },
  { id: 'batt', title: 'A battery for the evening', body: 'Build the battery beside the town and connect it. It carries the evening peak so hydrogen can wait for the small hours.', target: { world: 'site', id: 'batt' }, done: (st) => !!st.gens.batt && !!st.nodes.batt?.connected },
];

const ENDING8 = {
  common: ['Every noon the solar parks flood the grid, and every drop of spare sunshine turns into hydrogen.', 'The steel plant makes iron without coal, and the town sleeps on stored sun.'],
  sustainable: 'A desert grid that runs on sunshine day and night. Investors are calling it the future of heavy industry.',
  reliable: 'Reliable power and clean steel from the desert sun.',
  hardwon: 'The heat and the dust tested everything, but Dunefield made it work.',
  decisions: { h2: 'The electrolyser turned noon into night-time power and green steel.', battery: 'A battery carried the evening peaks.', nights: 'Whole nights ran without gas.', heat: 'The pumps kept running through the heat record.' },
  next: 'Next: two cities and a market on the river border.',
};

const ui = {
  tutorial: TUT8,
  lines: LINES8,
  learn: LEARN8,
  ending: ENDING8,
  endTitle: 'Dunefield runs on the desert sun',
  demandNote: 'Air conditioning makes homes peak in the afternoon and again in the evening. The steel plant works by day, the date works in the morning, and the well pumps at dawn and dusk.',
  briefing: {
    text: 'Dunefield is an oasis town in the desert, with a date-packing works and a new <b>green-steel plant</b> that runs on hydrogen. The sun is huge, but only by day, and <b>heat</b> and <b>dust</b> make the grid weaker. Make <b>green hydrogen</b> from the surplus, run whole nights without gas, and get through a <b>heat record</b>.',
    goals: ['A hydrogen plant beside the steel works', '95% of the steel plant’s hydrogen over 48 hours', 'Two whole nights without the gas plant', 'Pumps and clinic running through the day-4 heat record'],
    newSystems: ['<b>Green hydrogen</b>: an electrolyser, a tank and a turbine', 'A <b>hydrogen supply contract</b>', '<b>Heat derating</b> of lines and transformers', '<b>Dust storms</b> and panel washing'],
  },
  failCause: { clinic: { title: 'The town lost its water or its clinic', body: 'The well pumps or the clinic were dark for 6 hours.', tip: 'Check transformer capacity before the heat record, and keep storage for the night.' } },
  handles: ['h2Start', 'h2Dry', 'heatForecast', 'heatOk', 'heatMissed', 'contractOk', 'cleanNight', 'noWaste'],
  onEvent(e, u) {
    switch (e.type) {
      case 'h2Start':
        u.say('h2Start');
        u.learnOnce('h2');
        break;
      case 'h2Dry':
        u.audio.play('warn');
        u.say('h2Dry');
        u.hud.alert({ id: 'h2dry', level: 'warn', title: 'Hydrogen tank nearly empty', text: `The steel plant needs ${H2_PER_H} kWh of hydrogen every hour. Build more solar, and stop the hydrogen turbine burning it at night (set it to Hold).`, actions: [{ label: 'Show the tank', primary: true, fn: () => u.focus({ kind: 'gen', id: 'h2' }) }], ttl: 12000 });
        break;
      case 'heatForecast':
        u.audio.play('warn');
        u.say('heatForecast');
        u.hud.alert({ id: 'heat', level: 'warn', title: 'Heat record tomorrow: about 46 °C', text: 'Every line and transformer will carry about 10% less, right when air conditioning is at full blast. Check the capacity overlay (O) and relieve any transformer near its limit tonight.', actions: [{ label: 'Capacity overlay', primary: true, fn: () => u.app && (u.app.overlay = 'capacity') }] });
        u.learnOnce('derate');
        break;
      case 'heatOk':
        u.audio.play('objective');
        u.say('heatOk');
        break;
      case 'heatMissed':
        u.hud.alert({ id: 'heatm', level: 'warn', title: 'The heat caught us out', text: `Pumps and clinic had power ${e.rel.toFixed(1)}% of the day.`, ttl: 9000 });
        break;
      case 'contractOk':
        u.audio.play('objective');
        u.say('contractOk');
        break;
      case 'cleanNight':
        u.audio.play('objective');
        u.say('cleanNight');
        break;
      case 'noWaste':
        u.audio.play('objective');
        u.say('noWaste');
        break;
    }
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF8 = [
  { type: 'inspect', target: 'mix' },
  { type: 'build', site: 'solarB', option: 'solar' },
  { type: 'line', from: 'solarB', to: { x: 120, z: -80 } },
  { type: 'line', from: '@last', to: '@node:160,-20' },
  { type: 'build', site: 'h2', option: 'h2' },
  { type: 'line', from: 'h2', to: { x: 262, z: -100 } },
  { type: 'line', from: '@last', to: '@node:262,-42' },
  { type: 'build', site: 'batt', option: 'battery' },
  { type: 'line', from: 'batt', to: '@node:40,-20' },
  { type: 'dispatchOrder', order: ['battery', 'h2', 'gas'] },
  { type: 'upgrade', target: '@node:-40,22', kind: 'xfmr100' },
  { type: 'upgrade', target: '@node:-40,115', kind: 'xfmr100' },
];

export default {
  id: MAP8.id,
  n: 8,
  key: 'stage8',
  stageName: 'Stage 8 · Desert Sun',
  name: 'Dunefield',
  region: 'Dunefield',
  blurb: 'A desert oasis, a date works and a green-steel plant. Turn the noon sun into hydrogen, run the nights without gas, and survive the dust and the heat.',
  learns: ['Green hydrogen and long storage', 'Industrial hydrogen contracts', 'Heat derating of lines', 'Dust storms and panel washing'],
  map: MAP8,
  bal: BAL8,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'mix', 'renew', 'co2', 'weather', 'powered'],
  objectives,
  weather: W8,
  cast: { mayor: { name: 'Samira Haddad', role: 'Mayor of Dunefield', color: '#b48cf2', initials: 'SH' }, ravi: { name: 'Youssef Amari', role: 'Date farmer and trader', color: '#9bd36b', initials: 'YA' }, nana: { name: 'Grandma Zahra', role: 'Keeper of the old well', color: '#d9b38c', initials: 'GZ' }, tom: { name: 'Karim Saleh', role: 'Steelworkers’ union', color: '#e2734e', initials: 'KS' } },
  quests: {
    perDay: [1, 2],
    pool: [
      { key: 'harvest', who: 'ravi', title: 'Date harvest rush', text: 'The harvest is in. Keep the date-packing works running from 06:00 to 15:00.', goal: { type: 'keepLit', ids: ['dates'], fromH: 6, toH: 15 }, reward: { credits: 1500, rep: 3 }, news: 'Record date harvest packed on time.' },
      { key: 'water', who: 'nana', title: 'Fill the cisterns', text: 'Keep the well pumps running from 05:00 to 10:00 so the cisterns fill before the heat.', goal: { type: 'keepLit', ids: ['pump'], fromH: 6, toH: 10 }, reward: { credits: 1000, rep: 4 } },
      { key: 'souk', who: 'ravi', title: 'Night market', text: 'The souk stays open late. Keep it lit from 18:00 to 23:00.', goal: { type: 'keepLit', ids: ['market'], fromH: 18, toH: 23 }, reward: { credits: 800, rep: 2 } },
      { key: 'green', who: 'maya', title: 'A sunny day', text: 'Make at least 75% of today’s electricity from the sun.', goal: { type: 'renewShare', pct: 75 }, reward: { credits: 2000, rep: 3 } },
      { key: 'charged', who: 'sofia', title: 'Battery full for the evening', text: 'Have your storage 80% full by 17:00.', goal: { type: 'socAt', pct: 80, hour: 17 }, reward: { credits: 1200, rep: 2 } },
      { key: 'noCuts', who: 'maya', title: 'An evening without cuts', text: 'No one switched off between 17:00 and 22:00, please.', goal: { type: 'noShed', fromH: 17, toH: 22 }, reward: { credits: 1200, rep: 2 } },
    ],
  },
  story: [
    { day: 1, hour: 9, who: 'mayor', lines: ['Welcome to Dunefield! We have sand, dates and sunshine. Now we are going to make steel too.'] },
    { day: 1, hour: 15, who: 'tom', title: 'Training for the steelworkers', text: 'Karim asks you to help pay for training so local people can run the new hydrogen plant, instead of hiring from abroad.', options: [{ label: 'Fund the training · 2,000 ¢', cost: 2000, rep: 5, trust: 3, note: 'Local jobs, local pride.', news: 'Dunefield locals train to run the hydrogen plant.' }, { label: 'Hire experts instead', rep: -3 }] },
    { day: 2, hour: 10, who: 'nana', lines: ['When the sand blows, cover your mouth and your solar panels. My grandmother said the first part, I added the second.'] },
    { day: 3, hour: 11, who: 'leila', title: 'Is hydrogen safe?', text: 'The Desert Times asks whether a hydrogen tank next to town is dangerous.', options: [{ label: 'Invite them for a safety tour', rep: 4, news: 'Reporters tour the hydrogen plant’s safety systems.' }, { label: 'No comment', rep: -3, news: 'Questions over hydrogen safety go unanswered.' }] },
    { day: 5, hour: 12, who: 'mayor', lines: ['The first green steel shipped today. The buyer called it “steel made from sunshine”.'] },
  ],
  events: {
    count: [7, 9],
    minGapH: 6,
    avoidH: [[52, 96]], // the heat-record forecast and the heat record
    fixed: [{ key: 'sandstorm', kind: 'dustStorm', hitH: 38, warnH: 4, durH: 3, params: { loss: 0.5 } }],
    pool: [
      { key: 'dust2', kind: 'dustStorm', weight: 2, windowH: [100, 160], warnH: 4, durH: 3, params: { loss: 0.4 } },
      { key: 'wadi', kind: 'flood', weight: 1, windowH: [100, 160], warnH: 3, durH: 3, params: { area: 'the dry riverbed', zone: { poly: [[-260, 160], [40, 160], [40, 200], [-260, 200]] } } },
      { key: 'fire', kind: 'wildfire', weight: 1, windowH: [100, 160], warnH: 5, durH: 3, params: { area: 'the scrub east of town', zone: { x: 200, z: 120, r: 70 } } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [10, 34], warnH: 3 },
      { key: 'xfmr2', kind: 'xfmrFail', weight: 1, windowH: [100, 160], warnH: 3 },
      { key: 'gasTrip', kind: 'blackout', weight: 1, windowH: [10, 34], warnH: 2, durH: 2, params: { targets: ['gas'] } },
      { key: 'workers', kind: 'arrivals', weight: 2, windowH: [100, 140], warnH: 8, durH: 12, params: { group: 'workers', at: { x: 80, z: 130 }, title: 'Homes for the solar workers', text: 'Two streets of homes for the solar park crews are finishing north of the depot.', goodNews: 'Solar crews move into homes powered by their own panels.', badNews: 'Solar workers’ homes still dark.' } },
      { key: 'wedding', kind: 'festival', weight: 2, windowH: [100, 160], atHour: 19, warnH: 18, durH: 5, params: { name: 'A desert wedding', text: 'Three families are celebrating a wedding under the palms, with music until late.', ids: ['h1', 'h2', 'h3', 'h4', 'market'], mult: 1.3, startH: 19, at: { x: -60, z: 60 }, goodNews: 'Wedding lights shine until dawn.', badNews: 'Wedding party in the dark.' } },
      { key: 'minister', kind: 'vipVisit', weight: 1, windowH: [100, 160], atHour: 10, warnH: 14, durH: 3, params: { name: 'The industry minister', who: 'mayor', zone: { x: 280, z: -90, r: 80 }, grant: 3000, text: 'The industry minister is touring the green-steel plant and the hydrogen works.', goodNews: 'Minister hails Dunefield’s green steel.', badNews: 'Power cut during the minister’s steel tour.' } },
      { key: 'theft', kind: 'theft', weight: 1, windowH: [10, 160], warnH: 6, params: { area: 'the desert road', cost: 600 } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [10, 34], warnH: 10, params: { grant: 2000 } },
      { key: 'cooling', kind: 'request', weight: 1, windowH: [10, 160], params: { who: 'maya', title: 'Cool roofs for the old town', text: 'Families ask for help painting their roofs white and adding shade, to cut how hard air conditioners work.', options: [{ label: 'Fund it · 2,500 ¢', cost: 2500, yes: true, rep: 6, trust: 4, note: 'Cooler homes, smaller bills.', news: 'White roofs cool Dunefield’s old town.' }, { label: 'Not now', rep: -2 }] } },
    ],
    protests: { hvNearHomes: 25, compensation: 2000, outages: 4, credit: 1500 },
  },
  demandMod,
  prebuilt: PREBUILT,
  init(state) {
    state.started = true;
  },
  afterPrebuilt(state) {
    for (const id in state.nodes) if (state.nodes[id].kind === 'xfmr') state.nodes[id].legacy = true;
    for (const id in state.edges) state.edges[id].legacy = true;
  },
  director,
  score,
  metrics,
  refBuild(sim) {
    runSteps(sim.cmd, sim.state, REF8);
  },
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF8);
    for (let i = 0; i < 7 * D && !sim.state.result; i++) {
      const c = sim.state.clock;
      const hm = c % D;
      // gas stays as backup until storage is in place, then sleeps through the night
      if (hm === 19 * 60 && c > day(2, 0)) sim.cmd({ type: 'stopGen', target: 'gas' });
      sim.tick();
      for (const e of drainAndRespond(sim)) if (e.type === 'failWarn') sim.cmd({ type: 'startGen', target: 'gas' });
    }
  },
  ui,
  camera: { x: 0, z: 0, dist: 640 },
  ending: { x: 0, z: 20, dist: 340, outDist: 960, outDX: 0, outDZ: 0 },
};
