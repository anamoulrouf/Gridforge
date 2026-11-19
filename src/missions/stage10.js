// Stage 10 · The Supergrid, "Continental" (finale).
// Meridian, the capital, still runs on a gas plant and imports. Every region you electrified
// (Kalani's sun, Highvale's water, Dunefield's desert, Aurora's wind) can now send power here over
// high-voltage direct current links. Each region alone is variable; together they smooth each other
// out. Connect the continent, run it on clean power for three days, and survive the "perfect
// storm": a cyclone, a heat wave and a cyber attack on the same day.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { runSteps } from '../sim/steps.js';
import { typeDef, ratedKW } from '../sim/power.js';
import { drainAndRespond } from '../sim/events.js';
import { rollingRel } from '../sim/sim.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;
const sunAt = (h) => (h < 6 || h >= 19 ? 0 : Math.max(0, Math.sin(((h - 6 + 0.5) / 13) * Math.PI)));

// ------------------------------------------------------------------ map
const tower = (id, name, x, z, label) => ({ id, type: 'tower', name, x, z, w: 20, d: 20, floors: 12, label });
const apt = (id, name, x, z) => ({ id, type: 'apartment', name, x, z, w: 22, d: 16, floors: 7 });
const street = (id, name, x, z) => ({ id, type: 'home', name, x, z, w: 10, d: 10, scale: 70 });
const HUBS = ['kalani', 'highvale', 'dunefield', 'aurora'];

export const MAP10 = {
  id: 'stage10-continental',
  bounds: { minX: -480, maxX: 480, minZ: -330, maxZ: 330 },
  tile: { cx: 0, cz: 0, hw: 520, hd: 370, radius: 90 },
  mvTypes: ['tower', 'datacenter', 'evhub'],
  life: { traffic: 1.2 },
  roads: [
    { id: 'main', x: 0, z: 0, w: 1000, d: 10, lanes: true },
    { id: 'avenue', x: 0, z: 0, w: 10, d: 700, lanes: true },
    { id: 'ring', x: 0, z: -140, w: 520, d: 8, lanes: true },
    { id: 'ring2', x: 0, z: 140, w: 520, d: 8, lanes: true },
  ],
  crossings: [[0, -9, false], [0, 9, false], [-9, 0, true], [9, 0, true]],
  lampRoads: ['main', 'avenue', 'ring', 'ring2'],
  water: [{ x: 0, z: 355, w: 1000, d: 30 }],
  hills: [{ x: -380, z: -280, r: 110, h: 40, squash: 0.5, snow: true }, { x: 420, z: 260, r: 100, h: 18, squash: 0.5, color: '#d9b97c' }],
  core: [{ x: 0, z: 0, w: 560, d: 420 }],
  sources: [
    { id: 'gas', type: 'gas', name: 'Meridian gas plant', tier: 'HV', x: -420, z: 60, w: 50, d: 34, port: { x: -380, z: 40 }, kw: 5000, running: true },
    { id: 'twin', type: 'market', name: 'Twin Cities market link (HVDC)', tier: 'HV', x: -440, z: 220, w: 34, d: 24, port: { x: -400, z: 200 }, kw: 3000, running: true, dirX: -1, label: 'MARKET', color: '#3d6fa8' },
  ],
  sites: [
    { id: 'kalani', name: 'Kalani subsea converter', desc: 'Where the undersea cable from Kalani Island lands', x: 260, z: 300, w: 44, d: 28, tier: 'HV', port: { x: 230, z: 270 }, options: [{ type: 'hubKalani', kw: 2000, cost: 30000, label: 'KALANI', color: '#2fa38a', dirZ: 1, note: 'Island sunshine (plus the battery’s evening help) over a 300 km subsea DC cable.' }] },
    { id: 'highvale', name: 'Highvale converter', desc: 'The DC line from the mountain reservoirs', x: -260, z: -300, w: 44, d: 28, tier: 'HV', port: { x: -230, z: -260 }, options: [{ type: 'hubHighvale', kw: 3500, cost: 36000, label: 'HIGHVALE', color: '#3d6fa8', dirZ: -1, note: 'Dispatchable mountain hydro and pumped storage: about 40 MWh in the lakes, refilled by the rivers.' }] },
    { id: 'dunefield', name: 'Dunefield converter', desc: 'The DC line from the desert solar parks', x: 450, z: -80, w: 44, d: 28, tier: 'HV', port: { x: 410, z: -60 }, options: [{ type: 'hubDunefield', kw: 4000, cost: 38000, label: 'DUNEFIELD', color: '#e9862c', dirX: 1, note: 'Desert sun from two time zones east: it rises two hours earlier than here.' }] },
    { id: 'aurora', name: 'Aurora converter', desc: 'The DC line from the northern wind farms', x: 120, z: -310, w: 44, d: 28, tier: 'HV', port: { x: 120, z: -270 }, options: [{ type: 'hubAurora', kw: 3000, cost: 34000, label: 'AURORA', color: '#6a4fb3', dirZ: -1, note: 'Northern wind, often blowing when it is calm here.' }] },
    { id: 'batt', name: 'Capital battery site', desc: 'Beside the central substation', x: 80, z: 60, w: 44, d: 18, tier: 'MV', port: { x: 60, z: 45 }, options: [{ type: 'battery', kw: 4000, kwh: 20000, cost: 32000 }] },
  ],
  depot: { id: 'depot', x: 300, z: 40, w: 18, d: 12 },
  townCenterZ: 0,
  decor: [
    { kind: 'city', x: 0, z: -620, w: 300, d: 150, top: -12 },
    { kind: 'port', x: 400, z: 640, w: 240, d: 110, top: -12 },
  ],
  customers: [
    tower('tw1', 'Meridian Tower', -80, -70, 'MERIDIAN'), tower('tw2', 'Continental Bank', 80, -70, 'BANK'), tower('tw3', 'Parliament offices', -80, 70, 'PARLIAMENT'),
    apt('a1', 'Riverside Apartments', -200, -70), apt('a2', 'Garden Court', -200, 70), apt('a3', 'Skyline Flats', 200, -70), apt('a4', 'Harbour Flats', 200, 70),
    street('s1', 'Old Town streets', -180, 200), street('s2', 'Canal streets', 180, 200),
    { id: 'hosp1', type: 'hospital', name: 'Meridian General Hospital', x: -60, z: 200, w: 30, d: 22 },
    { id: 'hosp2', type: 'hospital', name: 'Children’s Hospital', x: 60, z: 200, w: 26, d: 20 },
    { id: 'dc', type: 'datacenter', name: 'Continental Data Centre', x: 300, z: -190, w: 50, d: 34, label: 'CONTINENTAL' },
    { id: 'ev', type: 'evhub', name: 'Central EV hub', x: -300, z: -190, w: 24, d: 18 },
    { id: 'school', type: 'school', name: 'Meridian Academy', x: 200, z: -190, w: 26, d: 12 },
  ],
};

// ------------------------------------------------------------------ balance
export const BAL10 = {
  ...BALANCE,
  start: { credits: 230000, poles: 140, transformers: 8, cable: 8000, kits: 6, fuel: 0, substations: 4 },
  startClockMin: 6 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1500, substation: 12000, drop: 50, maintain: 500, repairLabour: 800, dailyOverhead: 9000 },
  procurement: { ...BALANCE.procurement, kits: { qty: 1, cost: 800, leadH: 6 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 40000, MV: 6000, LV: 1200 }, dropReach: 26, mvDropReach: 36 },
  transformer: { ...BALANCE.transformer, ratingKW: 2000 },
  substation: { ratingKW: 15000 },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  market: (clock) => {
    const h = Math.floor((clock % 1440) / 60);
    return h >= 17 && h <= 21 ? 0.42 : h >= 7 && h <= 16 ? 0.22 : 0.12;
  },
  sourceTypes: {
    gas: { dispatch: true, rampH: 0.1, maxKW: 5000, costPerKWh: 0.25, co2: 0.45, wearPerRunHour: 0.05 },
    market: { dispatch: true, market: true, rampH: 0, maxKW: 3000, exportMaxKW: 3000, exportShare: 0.9, co2: 0.4 },
    battery: { storage: true, storageClean: true, kwh: 20000, eff: 0.9, co2: 0 },
    // each region arrives over its own DC link, with its own weather and its own timing
    hubKalani: { renewable: true, co2: 0, profile: (h, d, w) => 0.15 + 0.75 * sunAt(h) * (1 - 0.5 * (w?.cloud ?? 0)) },
    hubDunefield: { renewable: true, co2: 0, profile: (h) => 0.92 * sunAt(h + 2) },
    hubAurora: { renewable: true, co2: 0, profile: (h, d) => 0.5 + 0.35 * Math.sin((h + d * 9) / 3.5) },
    hubHighvale: { dispatch: true, renewable: true, rampH: 0.05, reservoir: 40000, inflowKW: 900, co2: 0 },
  },
  dispatchOrder: ['battery', 'hubHighvale', 'market', 'gas'],
  types: {
    apartment: { label: 'Apartment block', cls: 'home', nominal: 150, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.2 : h >= 7 && h <= 8 ? 1.3 : h >= 9 && h <= 17 ? 0.6 : 0.35) },
    home: { label: 'Streets of homes', cls: 'home', nominal: 1, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.5 : h >= 7 && h <= 8 ? 1.4 : h >= 9 && h <= 17 ? 0.5 : 0.3) },
    tower: { label: 'Office tower (11 kV)', cls: 'business', nominal: 380, priority: 1, profile: (h) => (h >= 8 && h <= 18 ? 1.0 : 0.2) },
    datacenter: { label: 'Data centre (11 kV)', cls: 'business', nominal: 1200, priority: 2, profile: (h) => (h >= 10 && h <= 18 ? 1.05 : 0.95) },
    evhub: { label: 'EV charging hub (11 kV)', cls: 'business', nominal: 500, priority: 1, profile: (h) => (h >= 17 && h <= 22 ? 1.6 : h >= 7 && h <= 9 ? 0.8 : h >= 10 && h <= 16 ? 0.6 : 0.3) },
    hospital: { label: 'Hospital', cls: 'public', nominal: 350, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 120, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
  },
  tariffs: { home: { base: 0.42, min: 0.3, max: 0.6 }, business: { base: 0.5, min: 0.35, max: 0.8 }, public: { base: 0.3, min: 0.2, max: 0.45 } },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 4, bankruptGraceH: 6, deadlineDay: 8, debtLimit: -60000 },
};

const W10 = {
  1: { wind: 6, cloud: 0.4, label: 'Mild and cloudy' },
  2: { wind: 5, cloud: 0.6, label: 'Grey and still here; windy in the north' },
  3: { wind: 7, cloud: 0.3, label: 'Fair' },
  4: { wind: 14, cloud: 0.9, tempAdd: 8, label: 'The perfect storm: cyclone, heat and a cyber threat' },
  5: { wind: 6, cloud: 0.3, label: 'Clearing' },
  6: { wind: 6, cloud: 0.25, label: 'Fair' },
  7: { wind: 7, cloud: 0.35, label: 'Fair' },
  8: { wind: 6, cloud: 0.3, label: 'Fair' },
};

const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;
const hubsOn = (st) => HUBS.filter((id) => st.gens[id] && st.nodes[id]?.connected);
const CLEAN_GOAL = 48 * 60;

const objectives = [
  {
    id: 'hubs',
    primary: true,
    bar: true,
    label: 'Connect four regions by HVDC',
    eval: (st) => ({ done: hubsOn(st).length >= 4, progress: [hubsOn(st).length, 4] }),
    guide: (st) => ({
      title: 'Connect four regions by HVDC',
      why: 'High-voltage direct current carries power hundreds of kilometres with little loss. At each end a converter station turns it back into the alternating current the city uses.',
      steps: [`Press ${k('G')} and build a converter station at the edge of the map: Kalani (south), Highvale (north-west), Dunefield (east) or Aurora (north).`, `Connect each to the capital’s 66 kV network with a line (${k('L')}) and a substation where needed.`, 'Each region has its own timing: desert sun rises early, the north is often windy when it is calm here, Highvale can run whenever you ask.'],
      now: [info(`Connected: ${hubsOn(st).length} of 4 (${hubsOn(st).map((id) => id[0].toUpperCase() + id.slice(1)).join(', ') || 'none yet'})`)],
      focus: { x: 450, z: -80, sel: { kind: 'site', id: 'dunefield' } },
      focusLabel: 'Show a converter site',
    }),
  },
  {
    id: 'clean',
    primary: true,
    bar: true,
    unit: 'h',
    label: '48 hours of a 100% clean continent, nobody short of power',
    eval: (st) => ({ done: (st.flags.cleanBest || 0) >= CLEAN_GOAL, progress: [Math.floor((st.flags.cleanRun || 0) / 60), 48] }),
    guide: (st) => ({
      title: '48 hours of a 100% clean continent, nobody short of power',
      why: 'One region alone can’t run a capital on clean power: the sun sets, the wind drops. Many regions together, plus storage, can.',
      steps: ['Connect the regional links and the capital battery.', 'Keep the gas plant and the market last in the generation order, then stop the gas plant.', 'Gas output, market imports, or anyone switched off for lack of power restart the clock. Storm damage doesn’t.'],
      now: [info(`Current run ${fmt.dur(st.flags.cleanRun || 0)} · best ${fmt.dur(st.flags.cleanBest || 0)}`), (st.gens.gas?.outKW || 0) > 1 ? warn(`Gas: ${fmt.kw(st.gens.gas.outKW)}`) : ok('No gas'), (st.gens.twin?.outKW || 0) > 1 ? warn(`Importing ${fmt.kw(st.gens.twin.outKW)}`) : ok('No imports')],
      focus: { x: 0, z: 0, sel: { kind: 'mix' } },
      focusLabel: 'Open Supply',
    }),
  },
  {
    id: 'storm',
    primary: true,
    label: 'Survive the perfect storm with both hospitals lit',
    eval: (st) => ({ done: !!st.flags.stormOk }),
    guide: (st) => ({
      title: 'Survive the perfect storm with both hospitals lit',
      why: 'On day 4 everything happens at once: a cyclone crosses the capital, a heat wave pushes demand up and hackers probe the control systems. A strong grid has spare supply, storage, protected equipment and crews ready.',
      steps: ['Before day 4: fill the battery and Highvale’s lakes, hire contractors when the cyclone is announced.', 'Patch the control systems when the warning comes.', 'Repair storm damage straight away, hospitals first.'],
      now: [st.clock < day(4, 0) ? info(`The storm day starts in ${fmt.dur(day(4, 0) - st.clock)}`) : st.flags.stormOk ? ok('Both hospitals stayed lit') : st.flags.stormOk === false ? warn('A hospital lost power') : info('In progress')],
      focus: null,
    }),
  },
  {
    id: 'rel',
    primary: true,
    live: true,
    label: 'Keep reliability at 99% or better (last 48 h)',
    eval: (st) => ({ done: st.clock >= day(5, 0) && rollingRel(st).pct >= 99 }),
    guide: (st) => {
      const r = rollingRel(st).pct;
      return { title: 'Keep reliability at 99% or better (last 48 h)', why: 'The capital never sleeps. Checked from day 5, after the storm.', steps: ['Repair quickly, keep storage ready, keep a backup.'], now: [r >= 99 ? ok(`Reliability ${r.toFixed(2)}%`) : warn(`Reliability ${r.toFixed(2)}%`)], focus: null };
    },
  },
  {
    id: 'all',
    primary: false,
    label: 'Optional · Connect all five regions (with the market)',
    eval: (st) => ({ done: hubsOn(st).length >= 4 && !!st.gens.batt }),
    guide: (st) => ({ title: 'Optional · Connect all five regions (with the market)', why: 'Every region you built, joined in one grid.', steps: ['Build all four converters and the capital battery.'], now: [info(`${hubsOn(st).length} converters, battery ${st.gens.batt ? 'built' : 'not built'}`)], focus: null }),
  },
];

// ------------------------------------------------------------------ pre-built capital network
const PREBUILT = [
  // 66 kV: gas and the market link to the west substation, a 66 kV spine to the east substation
  { type: 'line', from: 'gas', to: { x: -300, z: 30 } },
  { type: 'line', from: '@last', to: { x: -140, z: 30 } },
  { type: 'substation', at: '@last' },
  { type: 'line', from: 'twin', to: { x: -320, z: 150 } },
  { type: 'line', from: '@last', to: '@node:-140,30' },
  { type: 'line', from: '@node:-140,30', tier: 'up', to: { x: -40, z: 30 } },
  { type: 'line', from: '@last', to: { x: 40, z: 30 } },
  { type: 'line', from: '@last', to: { x: 140, z: 30 } },
  { type: 'substation', at: '@last' },
  // 11 kV feeders and transformers
  { type: 'line', from: '@node:-140,30', tier: 'down', to: { x: -140, z: -50 } },
  { type: 'line', from: '@last', to: { x: -110, z: -50 } },
  { type: 'line', from: '@node:-140,-50', to: { x: -175, z: -50 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-140,30', tier: 'down', to: { x: -140, z: 90 } },
  { type: 'line', from: '@last', to: { x: -110, z: 90 } },
  { type: 'line', from: '@node:-140,90', to: { x: -175, z: 90 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-140,90', to: { x: -140, z: 170 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:140,30', tier: 'down', to: { x: 140, z: -50 } },
  { type: 'line', from: '@last', to: { x: 110, z: -50 } },
  { type: 'line', from: '@node:140,-50', to: { x: 175, z: -50 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:140,-50', to: { x: 140, z: -120 } },
  { type: 'line', from: '@last', to: { x: 250, z: -170 } },
  { type: 'line', from: '@node:140,-120', to: { x: 185, z: -170 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:140,30', tier: 'down', to: { x: 140, z: 90 } },
  { type: 'line', from: '@node:140,90', to: { x: 175, z: 90 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:140,90', to: { x: 140, z: 170 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-140,-50', to: { x: -140, z: -120 } },
  { type: 'line', from: '@last', to: { x: -290, z: -170 } },
  // 400 V
  { type: 'line', from: '@node:-175,-50', to: { x: -200, z: -50 } },
  { type: 'line', from: '@node:-175,90', to: { x: -200, z: 90 } },
  { type: 'line', from: '@node:-140,170', to: { x: -180, z: 182 } },
  { type: 'line', from: '@node:-140,170', to: { x: -75, z: 182 } },
  { type: 'line', from: '@node:175,-50', to: { x: 200, z: -50 } },
  { type: 'line', from: '@node:185,-170', to: { x: 200, z: -175 } },
  { type: 'line', from: '@node:175,90', to: { x: 200, z: 90 } },
  { type: 'line', from: '@node:140,170', to: { x: 180, z: 182 } },
  { type: 'line', from: '@node:140,170', to: { x: 75, z: 182 } },
  ...MAP10.customers.map((c) => ({ type: 'drop', building: c.id })),
];

// ------------------------------------------------------------------ director
function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D;
  const d = Math.floor(state.clock / D) + 1;
  const fossil = (state.gens.gas?.outKW || 0) > 1 || (state.gens.twin?.outKW || 0) > 1;
  const short = api.map.customers.some((c) => state.cust[c.id].status === 'shed');
  if (!fossil && !short) {
    F.cleanRun = (F.cleanRun || 0) + 1;
    F.cleanBest = Math.max(F.cleanBest || 0, F.cleanRun);
    if (F.cleanRun === CLEAN_GOAL) api.emit('cleanDone');
  } else {
    if ((F.cleanRun || 0) >= 180) api.emit('cleanBroken', { run: F.cleanRun, fossil });
    F.cleanRun = 0;
  }
  for (const id of HUBS) if (state.gens[id] && state.nodes[id]?.connected && !F['hub_' + id]) {
    F['hub_' + id] = true;
    api.emit('hubOn', { id, n: hubsOn(state).length });
  }
  if (d === 3 && hm === 12 * 60) api.emit('stormForecast');
  if (d === 4) {
    for (const id of ['hosp1', 'hosp2']) if (state.cust[id].dropped && !powered(state, id)) F.stormDark = true;
    if (hm === 23 * 60 + 59 && F.stormOk == null) {
      F.stormOk = !F.stormDark;
      api.emit(F.stormOk ? 'stormOk' : 'stormMissed');
    }
  }
}

function score(state, bal) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const reliability = Math.max(0, Math.min(25, (r - 97) * 8.33));
  const clean = Math.min(25, ((state.flags.cleanBest || 0) / CLEAN_GOAL) * 25);
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  const emissions = Math.max(0, Math.min(15, 15 - co2 / 12));
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(15, 6 + net / 15000));
  const storm = state.flags.stormOk ? 20 : 0;
  void bal;
  const parts = { reliability: Math.round(reliability), clean: Math.round(clean), emissions: Math.round(emissions), finance: Math.round(finance), storm };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['reliability', 'Reliability', 25], ['clean', 'Clean continent', 25], ['emissions', 'Emissions', 15], ['finance', 'Finance', 15], ['storm', 'Perfect storm', 20]] };
}

function metrics(state, bal) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  const regional = HUBS.filter((id) => state.gens[id]).reduce((a, id) => a + ratedKW(bal, state.gens[id]), 0);
  return {
    powered: state.flow.powered,
    total: state.flow.activeCount ?? state.map.customers.length,
    decisions: { hubs: hubsOn(state).length >= 4, battery: !!state.gens.batt, storm: !!state.flags.stormOk, clean: (state.flags.cleanBest || 0) >= CLEAN_GOAL },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.flow.activeCount ?? state.map.customers.length}`],
      ['Reliability', `${r.toFixed(2)}%`],
      ['Regions connected', `${hubsOn(state).length} of 4`],
      ['Regional power', fmt.kw(regional)],
      ['Longest clean run', fmt.dur(state.flags.cleanBest || 0)],
      ['CO₂ (all days)', `${co2.toFixed(1)} t`],
      ['Perfect storm', state.flags.stormOk ? 'Hospitals lit' : state.flags.stormOk === false ? 'A hospital went dark' : 'n/a'],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN10 = {
  hvdc: { title: 'High-voltage direct current', what: 'Power from a far region is arriving over an HVDC link.', why: 'Over hundreds of kilometres, direct current loses far less than alternating current, and it can run under the sea. Converter stations at each end switch between DC and the AC the city uses.', todo: ['Connect more regions: each has its own weather and timing.', 'Watch how they fill each other’s gaps in the Supply panel.'], real: 'HVDC links already join Norway and the UK, China’s west and east, and Australia’s mainland and Tasmania.' },
  smooth: { title: 'Geographic smoothing', what: 'With several regions connected, the dips of one are filled by another.', why: 'The desert sun rises early, the island sun sets later, the northern wind often blows when it is calm here, and Highvale’s lakes can run any time.', todo: ['Use Highvale’s water and the battery for the gaps that remain.', 'Keep gas and the market as the last resort.'], real: 'This is why continental supergrids are planned: the wider the area, the steadier clean power becomes.' },
  storm: { title: 'The perfect storm', what: 'Tomorrow a cyclone, a heat wave and a cyber threat arrive together.', why: 'Big blackouts happen when several things go wrong at once. Resilient grids prepare for exactly that.', todo: ['Fill the battery and Highvale’s lakes tonight.', 'Hire contractors when the cyclone warning comes.', 'Patch the control systems when warned.'], real: 'Grid operators run "N-1" and "N-2" studies: what if one, or two, big things fail at once?' },
};

const LINES10 = {
  ...L1,
  intro: [['advisor', 'This is Meridian, the capital. Everything you have built, region by region, can now power it.'], ['sofia', 'Kalani, Highvale, Dunefield and Aurora are each waiting at the end of a DC line. Let’s connect the continent.']],
  hubOn: [['sofia', 'Another region is on the supergrid.']],
  stormForecast: [['advisor', 'Tomorrow: a cyclone, a heat wave and a cyber threat, all on the same day. Fill every store tonight.']],
  stormOk: [['maya', 'The worst day in the capital’s history, and both hospitals never flickered.']],
  cleanDone: [['maya', 'Two days of a 100% clean continent. Every region pulled its weight.']],
  tutorialDone: [['advisor', 'The supergrid is yours. Bring the continent together.']],
};

const TUT10 = [
  { id: 'mix', title: 'A capital on gas', body: 'Click the Supply chip. Meridian runs on a gas plant and imports from the market. The regions you built are waiting at the map’s edges.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
  { id: 'dune', title: 'Bring in the desert sun', body: 'Press G and build the Dunefield converter on the east edge, then connect it to the east substation at 66 kV.', target: { world: 'site', id: 'dunefield' }, done: (st) => !!st.gens.dunefield && !!st.nodes.dunefield?.connected },
  { id: 'aurora', title: 'Northern wind', body: 'Build the Aurora converter in the north and connect it. The wind up north often blows when it is calm here.', target: { world: 'site', id: 'aurora' }, done: (st) => !!st.gens.aurora && !!st.nodes.aurora?.connected },
  { id: 'hv', title: 'Mountain water on demand', body: 'Build the Highvale converter. Its lakes can run whenever you need them, perfect for the evening peak.', target: { world: 'site', id: 'highvale' }, done: (st) => !!st.gens.highvale && !!st.nodes.highvale?.connected },
];

const ENDING10 = {
  common: ['Island sunshine, mountain water, desert sun and northern wind now flow into one capital, over lines you can’t see.', 'When the perfect storm came, the continent held together.'],
  sustainable: 'A clean, reliable, continental grid. From one diesel generator in Riverside to this. The campaign is complete.',
  reliable: 'The capital runs on the whole continent’s clean power. The campaign is complete.',
  hardwon: 'It took everything you had learned, but the supergrid stands. The campaign is complete.',
  decisions: { hubs: 'Four regions joined by direct current.', battery: 'A capital battery covered the last gaps.', storm: 'Both hospitals stayed lit through the perfect storm.', clean: 'Two days of a 100% clean continent.' },
  next: 'Thank you for playing Gridforge.',
};

const ui = {
  tutorial: TUT10,
  lines: LINES10,
  learn: LEARN10,
  ending: ENDING10,
  endTitle: 'The continent runs on clean power',
  demandNote: 'Apartments and homes peak in the evening, towers by day, the data centre and hospitals never stop, and the EV hub fills up after work.',
  briefing: {
    text: '<b>Meridian</b>, the capital, still runs on gas and imports. At the edges of the map, <b>Kalani, Highvale, Dunefield and Aurora</b> wait at the end of high-voltage DC lines. Connect the continent, run it on <b>clean power for two days</b>, and survive the <b>perfect storm</b> on day 4.',
    goals: ['Four regions connected by HVDC', '48 hours of a 100% clean continent', 'Both hospitals lit through the perfect storm', 'Reliability ≥ 99% over the last 48 hours'],
    newSystems: ['<b>HVDC</b> links and converter stations', '<b>Geographic smoothing</b>: different regions, different weather', 'A <b>compound disaster</b> day'],
  },
  failCause: { clinic: { title: 'A hospital lost power too long', body: 'A Meridian hospital was dark for 4 hours.', tip: 'Fill every store before the perfect storm, and repair hospitals first.' } },
  handles: ['hubOn', 'stormForecast', 'stormOk', 'stormMissed', 'cleanDone', 'cleanBroken'],
  onEvent(e, u) {
    switch (e.type) {
      case 'hubOn':
        u.audio.play('swell');
        u.say('hubOn');
        u.hud.alert({ id: 'hub-' + e.id, level: 'good', title: `${e.id[0].toUpperCase() + e.id.slice(1)} is on the supergrid`, text: `${e.n} of 4 regions connected.`, ttl: 7000 });
        u.learnOnce(e.n >= 2 ? 'smooth' : 'hvdc');
        break;
      case 'stormForecast':
        u.audio.play('warn');
        u.say('stormForecast');
        u.hud.alert({ id: 'pstorm', level: 'critical', title: 'The perfect storm arrives tomorrow', text: 'A cyclone, a heat wave and a cyber threat, all on day 4. Fill the battery and Highvale’s lakes tonight, and get ready to hire contractors.', actions: [{ label: 'Supply panel', primary: true, fn: () => u.select({ kind: 'mix' }) }] });
        u.learnOnce('storm');
        break;
      case 'stormOk':
        u.audio.play('objective');
        u.say('stormOk');
        break;
      case 'stormMissed':
        u.hud.alert({ id: 'pstormm', level: 'warn', title: 'A hospital went dark in the storm', text: 'Hospitals come first next time.', ttl: 9000 });
        break;
      case 'cleanDone':
        u.audio.play('swell');
        u.say('cleanDone');
        break;
      case 'cleanBroken':
        u.hud.alert({ id: 'cleanb', level: 'warn', title: `Clean run ended after ${u.fmt.dur(e.run)}`, text: e.fossil ? 'Gas or market imports were used.' : 'Some customers were short of power.', ttl: 8000, actions: [{ label: 'Supply', fn: () => u.select({ kind: 'mix' }) }] });
        break;
    }
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF10 = [
  { type: 'inspect', target: 'mix' },
  { type: 'build', site: 'dunefield', option: 'hubDunefield' },
  { type: 'line', from: 'dunefield', to: { x: 300, z: 30 } },
  { type: 'line', from: '@last', to: '@node:140,30' },
  { type: 'build', site: 'aurora', option: 'hubAurora' },
  { type: 'line', from: 'aurora', to: { x: 120, z: -220 } },
  { type: 'line', from: '@last', to: { x: 230, z: -120 } },
  { type: 'line', from: '@last', to: '@node:140,30' },
  { type: 'build', site: 'highvale', option: 'hubHighvale' },
  { type: 'startGen', target: 'highvale' },
  { type: 'line', from: 'highvale', to: { x: -250, z: -120 } },
  { type: 'line', from: '@last', to: '@node:-140,30' },
  { type: 'build', site: 'kalani', option: 'hubKalani' },
  { type: 'line', from: 'kalani', to: { x: 260, z: 240 } },
  { type: 'line', from: '@last', to: '@node:140,30' },
  { type: 'build', site: 'batt', option: 'battery' },
  { type: 'line', from: 'batt', to: { x: 112, z: 40 } },
  { type: 'line', from: '@last', to: '@node:140,90' },
  { type: 'dispatchOrder', order: ['battery', 'hubHighvale', 'market', 'gas'] },
];

export default {
  id: MAP10.id,
  n: 10,
  key: 'stage10',
  stageName: 'Stage 10 · The Supergrid',
  name: 'Continental',
  region: 'Meridian',
  blurb: 'The finale. Join every region you built to the capital over HVDC links, run the continent on clean power, and survive the perfect storm.',
  learns: ['HVDC links and converters', 'Geographic smoothing', 'Compound disasters', 'Everything you have learned'],
  map: MAP10,
  bal: BAL10,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'sub', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'mix', 'renew', 'co2', 'weather', 'powered', 'rel'],
  objectives,
  weather: W10,
  cast: { mayor: { name: 'President Adaeze Nwosu', role: 'President of the Continental Council', color: '#b48cf2', initials: 'AN' }, nana: { name: 'Grace Okafor', role: 'Former mayor of Riverside', color: '#d9b38c', initials: 'GO' } },
  quests: {
    perDay: [1, 2],
    pool: [
      { key: 'surgery', who: 'maya', title: 'A long day at the children’s hospital', text: 'Keep the Children’s Hospital lit from 08:00 to 20:00.', goal: { type: 'keepLit', ids: ['hosp2'], fromH: 8, toH: 20 }, reward: { credits: 3000, rep: 4 } },
      { key: 'data', who: 'daniel', title: 'A big night for the data centre', text: 'The data centre is training a huge model tonight. Keep it running from 18:00 to 06:00.', goal: { type: 'keepLit', ids: ['dc'], fromH: 18, toH: 23 }, reward: { credits: 3500, rep: 2 } },
      { key: 'green', who: 'maya', title: 'A clean capital day', text: 'Make at least 85% of today’s electricity clean.', goal: { type: 'renewShare', pct: 85 }, reward: { credits: 4000, rep: 4 } },
      { key: 'charged', who: 'sofia', title: 'Storage ready for the peak', text: 'Have the capital battery at 80% by 17:00.', goal: { type: 'socAt', pct: 80, hour: 17 }, reward: { credits: 2500, rep: 2 } },
      { key: 'noCuts', who: 'maya', title: 'An evening without cuts', text: 'No one switched off between 17:00 and 22:00, please.', goal: { type: 'noShed', fromH: 17, toH: 22 }, reward: { credits: 2500, rep: 2 } },
    ],
  },
  story: [
    { day: 1, hour: 9, who: 'mayor', lines: ['The Continental Council has given you one job: join our regions into one clean grid.', 'No pressure. Only the whole continent is watching.'] },
    { day: 1, hour: 15, who: 'nana', lines: ['Do you remember Riverside? Thirteen buildings and one diesel generator. Look how far you’ve come.'] },
    { day: 2, hour: 11, who: 'leila', title: 'The Continental Times asks about the cost', text: 'Some say the supergrid is too expensive. Will you publish what it costs and what it saves?', options: [{ label: 'Publish the numbers', rep: 5, news: 'Supergrid costs and savings published in full.' }, { label: 'No comment', rep: -3 }] },
    { day: 3, hour: 18, who: 'tom', title: 'Crews on standby for the storm', text: 'The line workers’ union offers to keep extra crews on standby through the storm, for overtime pay.', options: [{ label: 'Pay for standby crews · 4,000 ¢', cost: 4000, rep: 4, trust: 3, note: 'Faster repairs tomorrow.', news: 'Extra crews on standby for the perfect storm.' }, { label: 'We’ll manage', rep: -2 }] },
    { day: 5, hour: 10, who: 'amira', lines: ['The children in every region drew pictures of the supergrid. They all put their own town in the middle.'] },
    { day: 6, hour: 12, who: 'mayor', lines: ['Other continents are sending engineers to learn from you. Well done.'] },
  ],
  events: {
    count: [6, 8],
    minGapH: 6,
    avoidH: [[66, 96]], // the storm forecast and the perfect storm itself
    fixed: [
      { key: 'pcyclone', kind: 'cyclone', hitH: 82, warnH: 16, durH: 6, params: { name: 'Zephyr', track: [-520, -300, 520, 250], width: 110, p: 0.35, max: 3 } },
      { key: 'pheat', kind: 'heat', hitH: 85, warnH: 18, durH: 6, params: { mult: 1.15, startH: 13, cls: ['home', 'business'] } },
      { key: 'pcyber', kind: 'cyberAlert', hitH: 88, warnH: 10, params: { cost: 3000 } },
    ],
    pool: [
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [10, 60], warnH: 3 },
      { key: 'xfmr2', kind: 'xfmrFail', weight: 1, windowH: [100, 180], warnH: 3 },
      { key: 'storm', kind: 'storm', weight: 1, windowH: [100, 180], warnH: 3, durH: 2, params: { p: 0.15, max: 2 } },
      { key: 'quake', kind: 'quake', weight: 1, windowH: [100, 180], params: { zone: { x: 0, z: 0, r: 300 }, p: 0.2, max: 2 } },
      { key: 'gala', kind: 'festival', weight: 2, windowH: [100, 180], atHour: 18, warnH: 18, durH: 5, params: { name: 'The supergrid gala', text: 'The capital celebrates the supergrid with lights on every tower.', ids: ['tw1', 'tw2', 'tw3', 'a1', 'a2', 'a3', 'a4'], mult: 1.25, startH: 18, at: { x: 0, z: 0 }, goodNews: 'The capital glows for the supergrid gala.', badNews: 'Blackout spoils the supergrid gala.' } },
      { key: 'president', kind: 'vipVisit', weight: 2, windowH: [100, 180], atHour: 11, warnH: 14, durH: 3, params: { name: 'The President', who: 'mayor', zone: { x: 0, z: 0, r: 110 }, grant: 6000, text: 'The President is opening the supergrid control centre in the heart of the capital.', goodNews: 'President opens the supergrid under bright lights.', badNews: 'Power cut during the President’s opening.' } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [10, 60], warnH: 10, params: { grant: 4000 } },
      { key: 'theft', kind: 'theft', weight: 1, windowH: [10, 180], warnH: 6, params: { area: 'the outskirts', cost: 1000 } },
      { key: 'linkTrip', kind: 'blackout', weight: 1, windowH: [100, 180], warnH: 2, durH: 2, params: { targets: ['dunefield', 'aurora', 'kalani'] } },
      { key: 'buses', kind: 'request', weight: 1, windowH: [10, 180], params: { who: 'maya', title: 'Electric buses for every city', text: 'The council asks you to fund chargers for electric buses in every region’s towns.', options: [{ label: 'Fund it · 5,000 ¢', cost: 5000, yes: true, rep: 6, note: 'Clean transport across the continent.', news: 'Electric buses roll out across the continent.' }, { label: 'Not now', rep: -2 }] } },
    ],
    protests: { hvNearHomes: 25, compensation: 4000, outages: 6, credit: 3000 },
  },
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
    runSteps(sim.cmd, sim.state, REF10);
  },
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF10);
    for (let i = 0; i < 8 * D && !sim.state.result; i++) {
      const c = sim.state.clock;
      if (c === day(3, 18)) sim.cmd({ type: 'battery', target: 'batt', mode: 'charge' });
      if (c === day(4, 6)) sim.cmd({ type: 'battery', target: 'batt', mode: 'auto' });
      if (c === day(4, 23)) sim.cmd({ type: 'stopGen', target: 'gas' });
      sim.tick();
      drainAndRespond(sim);
    }
  },
  ui,
  camera: { x: 0, z: 0, dist: 760 },
  ending: { x: 0, z: 0, dist: 420, outDist: 1150, outDX: 0, outDZ: 0 },
};
