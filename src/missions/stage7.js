// Stage 7 · Mountain Power, "Highvale" (Chapter II).
// A mountain valley with a ski resort, a copper mine and an electric railway. A small river plant
// follows the snowmelt; a diesel plant fills the gaps. Over the western pass lies a site for pumped
// storage: pump water uphill when power is spare, run it back down at the peak. The line over the
// pass must be 66 kV, and on day 3 a cold snap brings freezing rain: lightly loaded lines ice up and
// snap, while lines carrying real current stay warm enough to shed it.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { runSteps } from '../sim/steps.js';
import { typeDef, ratedKW } from '../sim/power.js';
import { drainAndRespond } from '../sim/events.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;

// ------------------------------------------------------------------ map
const chalets = (id, name, x, z, extra = {}) => ({ id, type: 'home', name, x, z, w: 10, d: 10, scale: 25, ...extra });
const PASS = { x: -265, z: 40, r: 60 };

export const MAP7 = {
  id: 'stage7-highvale',
  bounds: { minX: -430, maxX: 430, minZ: -270, maxZ: 270 },
  tile: { cx: 0, cz: 0, hw: 470, hd: 310, radius: 80 },
  mvTypes: ['ski', 'mine', 'rail'],
  life: { traffic: 0.7, busColor: '#d9443a' },
  snow: true,
  roads: [
    { id: 'main', x: 60, z: 0, w: 720, d: 9, lanes: true },
    { id: 'town', x: 40, z: -10, w: 8, d: 170, lanes: true },
    { id: 'ski', x: 280, z: -60, w: 8, d: 110, lanes: true },
    { id: 'depot', x: 150, z: 70, w: 8, d: 60 },
  ],
  rail: { x: 0, z: -40, w: 940, d: 6 },
  railCustomer: 'rail',
  crossings: [[40, -8.5, false], [40, 8.5, false]],
  lampRoads: ['main', 'town'],
  water: [{ x: 20, z: 112, w: 860, d: 14 }],
  hills: [
    { x: -300, z: -170, r: 140, h: 70, squash: 0.65, snow: true },
    { x: -280, z: 225, r: 120, h: 55, squash: 0.6, snow: true },
    { x: -40, z: -245, r: 150, h: 60, squash: 0.4, snow: true },
    { x: 260, z: -235, r: 150, h: 65, squash: 0.45, snow: true },
    { x: 360, z: 230, r: 130, h: 45, squash: 0.6, snow: true },
  ],
  clear: [{ x: -265, z: 40, w: 140, d: 70 }],
  core: [{ x: 60, z: 0, w: 240, d: 200 }],
  sources: [
    { id: 'river', type: 'runriver', name: 'Highvale river plant', tier: 'MV', x: -130, z: 112, w: 30, d: 12, port: { x: -130, z: 92 }, kw: 600, running: true },
    { id: 'diesel', type: 'diesel', name: 'Valley diesel plant', tier: 'MV', x: -150, z: -80, w: 20, d: 14, port: { x: -150, z: -64 }, kw: 1400, fuel: 2000, running: true },
  ],
  sites: [
    { id: 'pumped', name: 'Pumped storage site', desc: 'A high lake above the western valley, with room for a lower reservoir and a powerhouse', x: -385, z: 40, w: 40, d: 30, tier: 'HV', port: { x: -350, z: 40 }, options: [{ type: 'pumped', kw: 2000, kwh: 12000, cost: 26000, note: 'Pumps water up to the high lake with spare power and runs it back down through turbines at the peak. About 75% comes back. Connects at 66 kV over the pass.' }] },
    { id: 'wind', name: 'South ridge wind site', desc: 'A windy shoulder above the river', x: 200, z: 205, w: 120, d: 30, tier: 'MV', port: { x: 200, z: 170 }, turbines: 4, options: [{ type: 'wind', kw: 2400, cost: 18000, note: 'Four 600 kW turbines on the ridge, connecting at 11 kV across the river.' }] },
    { id: 'solar', name: 'Sunny slope solar site', desc: 'A south-facing meadow above the river', x: -40, z: 190, w: 100, d: 40, tier: 'MV', port: { x: -40, z: 162 }, options: [{ type: 'solar', kw: 800, cost: 6000 }] },
  ],
  depot: { id: 'depot', x: 150, z: 110 - 22, w: 18, d: 12 },
  townCenterZ: 0,
  decor: [
    { kind: 'town', x: 380, z: -480, w: 180, d: 150, top: -10 },
    { kind: 'lake', x: -620, z: 120, w: 190, d: 170, top: -10 },
  ],
  customers: [
    chalets('c1', 'Pine Lane chalets', 10, -78),
    chalets('c2', 'Edelweiss chalets', 70, -78),
    chalets('c3', 'Riverside chalets', 10, 48),
    chalets('c4', 'Larch Row chalets', 70, 48),
    { id: 'hospital', type: 'hospital', name: 'Highvale Hospital', x: -60, z: 55, w: 26, d: 18 },
    { id: 'school', type: 'school', name: 'Highvale School', x: -60, z: -78, w: 24, d: 12 },
    { id: 'lodge', type: 'apartment', name: 'Alpine Lodge hotel', x: 120, z: 45, w: 18, d: 14, floors: 4 },
    { id: 'shop', type: 'shop', name: 'Village shop', x: 120, z: -24, w: 10, d: 9, label: 'SHOP' },
    { id: 'ski', type: 'ski', name: 'Highvale ski lifts', x: 300, z: -130, w: 40, d: 26, label: 'SKI', look: 'resort' },
    { id: 'mine', type: 'mine', name: 'Highvale copper mine', x: 330, z: 70, w: 44, d: 28, label: 'COPPER MINE', look: 'factory' },
    { id: 'rail', type: 'rail', name: 'Railway traction substation', x: 190, z: -62, w: 20, d: 12, label: 'RAIL', look: 'warehouse' },
    // surprise: new chalets for ski instructors (some runs)
    { ...chalets('n1', 'Instructors’ chalets (new)', 200, 40), surprise: 'chalets' },
    { ...chalets('n2', 'Guide chalets (new)', 240, 40), surprise: 'chalets' },
  ],
};

// ------------------------------------------------------------------ balance
const chaletProfile = (h) => (h >= 17 && h <= 22 ? 2.5 : h >= 7 && h <= 8 ? 1.5 : h >= 9 && h <= 16 ? 0.6 : 0.4);
export const BAL7 = {
  ...BALANCE,
  start: { credits: 70000, poles: 50, transformers: 3, cable: 2000, kits: 3, fuel: 2000, substations: 1 },
  startClockMin: 7 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1200, substation: 9000, drop: 50, maintain: 400, repairLabour: 600, dailyOverhead: 3500 },
  procurement: { ...BALANCE.procurement, fuel: { qty: 800, cost: 6400, leadH: 8 }, kits: { qty: 1, cost: 600, leadH: 8 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 2400, MV: 2500, LV: 650 }, dropReach: 24, mvDropReach: 32 },
  transformer: { ...BALANCE.transformer, ratingKW: 650 },
  substation: { ratingKW: 3000 },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  sourceTypes: {
    diesel: { dispatch: true, fuel: 'tank', rampH: 0.2, maxKW: 1400, minFrac: 0.2, kWhPerFuel: 20, kWhPerFuelWorn: 17, tankMax: 2000, co2: 0.75, wearPerRunHour: 0.1 },
    // run-of-river: no dam to speak of, so output follows the river (low in the frost, high in the thaw)
    runriver: { renewable: true, co2: 0, profile: (h, d, w) => (w && w.temp < 0 ? 0.35 : d >= 4 ? 0.8 : 0.55) },
    pumped: { storage: true, storageClean: true, kwh: 9000, eff: 0.75, co2: 0 },
    wind: { variable: 'wind', renewable: true, co2: 0 },
    solar: { variable: 'solar', renewable: true, co2: 0 },
  },
  dispatchOrder: ['pumped', 'diesel'],
  chargeFromGrid: true, // Charge only pumps with any power on the grid, diesel included
  types: {
    home: { label: 'Chalets', cls: 'home', nominal: 1, priority: 1, profile: chaletProfile },
    hospital: { label: 'Hospital', cls: 'public', nominal: 150, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 50, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
    apartment: { label: 'Hotel', cls: 'business', nominal: 60, priority: 1, profile: (h) => (h >= 17 && h <= 23 ? 2.2 : h >= 7 && h <= 9 ? 1.4 : 0.7) },
    shop: { label: 'Shop', cls: 'business', nominal: 25, priority: 1, profile: (h) => (h >= 8 && h <= 19 ? 1.0 : 0.1) },
    ski: { label: 'Ski lifts and snowmaking (11 kV)', cls: 'business', nominal: 280, priority: 1, profile: (h) => (h >= 17 && h <= 23 ? 1.3 : h >= 8 && h <= 16 ? 0.8 : 0.3) },
    mine: { label: 'Copper mine (11 kV)', cls: 'industry', nominal: 350, priority: 1, profile: (h) => (h >= 6 && h <= 22 ? 1.0 : 0.4) },
    rail: { label: 'Electric railway (11 kV)', cls: 'public', nominal: 260, priority: 2, profile: (h) => (h >= 6 && h <= 23 ? (h % 2 ? 1.2 : 0.7) : 0.15) },
  },
  tariffs: { home: { base: 0.42, min: 0.3, max: 0.6 }, business: { base: 0.5, min: 0.35, max: 0.8 }, industry: { base: 0.4, min: 0.3, max: 0.6 }, public: { base: 0.3, min: 0.2, max: 0.45 } },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 6, bankruptGraceH: 6, deadlineDay: 7, debtLimit: -25000 },
};

// day 3: a cold snap with freezing rain; days 4 and 5: thaw and strong westerlies
const W7 = {
  1: { wind: 7, cloud: 0.4, tempAdd: -16, label: 'Crisp and clear' },
  2: { wind: 8, cloud: 0.5, tempAdd: -18, label: 'Cold, breezy' },
  3: { wind: 6, cloud: 0.9, tempAdd: -30, label: 'Cold snap: freezing rain on the pass' },
  4: { wind: 11, cloud: 0.4, tempAdd: -10, label: 'Thaw: strong westerly wind' },
  5: { wind: 10, cloud: 0.3, tempAdd: -8, label: 'Mild and windy' },
  6: { wind: 8, cloud: 0.35, tempAdd: -10, label: 'Fair' },
  7: { wind: 9, cloud: 0.3, tempAdd: -8, label: 'Breezy' },
};

const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;

// heating in a cold snap: chalets, the hotel and the shop draw more as the temperature falls
function demandMod(state, c, kw, hour, w, bal) {
  const T = typeDef(bal, c.type);
  if (w.temp < 2 && (T.cls === 'home' || c.type === 'apartment')) return kw * (1 + Math.min(0.6, (2 - w.temp) * 0.03));
  return kw;
}

const objectives = [
  {
    id: 'pumped',
    primary: true,
    label: 'Build pumped storage and bring it over the pass at 66 kV',
    eval: (st) => ({ done: !!st.gens.pumped && !!st.nodes.pumped?.connected && !!st.gens.pumped.everCharged }),
    guide: (st) => ({
      title: 'Build pumped storage and bring it over the pass at 66 kV',
      why: 'Pumped storage is a giant water battery: spare power pumps water up to the high lake, and at the peak it runs back down through turbines. The site is over the western pass, too far and too big for 11 kV.',
      steps: [`Press ${k('G')} and build the pumped storage site in the far west.`, `Run a 66 kV line (${k('L')}) from it east over the pass, the flat gap between the two peaks.`, `Put a substation (${k('B')}) at the valley end and link it to the 11 kV network.`, 'Once spare power reaches it, it starts pumping.'],
      now: [st.gens.pumped ? (st.nodes.pumped?.connected ? (st.gens.pumped.everCharged ? ok(`Upper lake ${Math.round((st.gens.pumped.soc / st.gens.pumped.kwh) * 100)}% full`) : info('Connected, waiting for spare power to pump')) : warn('Built but not connected')) : todo('Not built yet')],
      focus: { x: -385, z: 40, sel: { kind: 'site', id: 'pumped' } },
      focusLabel: 'Show the site',
    }),
  },
  {
    id: 'cold',
    primary: true,
    label: 'Keep the railway and hospital running through the cold snap',
    eval: (st) => ({ done: !!st.flags.coldOk }),
    guide: (st) => ({
      title: 'Keep the railway and hospital running through the cold snap',
      why: 'On day 3 the temperature plunges. Heating demand rises, the river freezes down to a trickle and freezing rain coats the lines on the pass. The trains and the hospital must keep going.',
      steps: ['Fill the high lake before day 3, and keep fuel in the diesel tank.', 'When ice forms on the pass line, keep it carrying current: put the pumped storage on <b>Charge only</b> for a while, and the current warms the line so the ice falls off.', 'If a line snaps, send the crew straight away.'],
      now: [st.clock < day(3, 0) ? info(`Cold snap starts in ${fmt.dur(day(3, 0) - st.clock)}`) : st.flags.coldOk ? ok('Trains and hospital ran all day') : st.flags.coldOk === false ? warn(`Missed: ${st.flags.coldRel?.toFixed(1)}% of the day`) : info(`So far ${(st.flags.coldRel ?? 100).toFixed(1)}% powered`)],
      focus: null,
    }),
  },
  {
    id: 'clean',
    primary: true,
    bar: true,
    unit: 'h',
    label: '36 hours without the diesel plant, nobody short of power',
    eval: (st) => ({ done: (st.flags.cleanBest || 0) >= 2160, progress: [Math.floor((st.flags.cleanRun || 0) / 60), 36] }),
    guide: (st) => ({
      title: '36 hours without the diesel plant, nobody short of power',
      why: 'Diesel has to be trucked up the mountain road. The valley’s own water, wind and sun can carry it, if storage moves energy from windy hours to the evening peak.',
      steps: ['Build the ridge wind farm and the slope solar site.', 'Let the pumped storage soak up spare power and give it back at the peak.', 'Then stop the diesel plant (click it, Stop). Any diesel output, or anyone switched off for lack of power, restarts the clock. Storm damage doesn’t.'],
      now: [info(`Current run ${fmt.dur(st.flags.cleanRun || 0)} · best ${fmt.dur(st.flags.cleanBest || 0)}`), (st.gens.diesel?.outKW || 0) > 0.5 ? warn(`Diesel running: ${fmt.kw(st.gens.diesel.outKW)}`) : ok('Diesel off')],
      focus: { x: 0, z: 0, sel: { kind: 'mix' } },
      focusLabel: 'Open Supply',
    }),
  },
  {
    id: 'deice',
    primary: false,
    label: 'Optional · Get the pass line through the ice storm without it snapping',
    eval: (st) => ({ done: !!st.flags.iceOk }),
    guide: (st) => ({
      title: 'Optional · Get the pass line through the ice storm without it snapping',
      why: 'Engineers in snowy countries melt ice off lines by pushing current through them. A warm line sheds ice; an idle one collects it until it snaps.',
      steps: ['Watch the ice level on the 66 kV line (click it).', 'Keep it above a quarter of its limit: pump water uphill (Charge only), or run the pumped storage hard at the peak.'],
      now: [st.flags.iceOk ? ok('No line snapped') : st.flags.iceSnapped ? warn('A line snapped in the ice') : info('Ice storm forecast for day 3')],
      focus: { x: PASS.x, z: PASS.z },
      focusLabel: 'Show the pass',
    }),
  },
];

// ------------------------------------------------------------------ pre-built valley network (11 kV)
const PREBUILT = [
  { type: 'line', from: 'diesel', to: { x: -110, z: -55 } },
  { type: 'line', from: '@last', to: { x: -110, z: -12 } },
  { type: 'line', from: 'river', to: { x: -110, z: 75 } },
  { type: 'line', from: '@last', to: { x: -110, z: 18 } },
  { type: 'line', from: '@last', to: '@node:-110,-12' },
  // town transformers
  { type: 'line', from: '@node:-110,-12', to: { x: -20, z: -18 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-20,-18', tier: 'up', to: { x: -20, z: 20 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-20,-18', to: { x: -20, z: -60 } },
  { type: 'line', from: '@last', to: { x: 28, z: -60 } },
  { type: 'line', from: '@last', to: { x: 90, z: -60 } },
  { type: 'line', from: '@node:-20,-60', to: { x: -60, z: -60 } },
  { type: 'line', from: '@node:-20,20', to: { x: -20, z: 32 } },
  { type: 'line', from: '@last', to: { x: 28, z: 32 } },
  { type: 'line', from: '@last', to: { x: 95, z: 32 } },
  { type: 'line', from: '@node:-20,32', to: { x: -45, z: 40 } },
  { type: 'line', from: '@node:90,-60', to: { x: 108, z: -38 } },
  // 11 kV east to the railway, the mine and the ski lifts
  { type: 'line', from: '@node:-20,20', tier: 'up', to: { x: 60, z: 20 } },
  { type: 'line', from: '@last', to: { x: 170, z: 20 } },
  { type: 'line', from: '@last', to: { x: 172, z: -52 } },
  { type: 'line', from: '@node:170,20', to: { x: 260, z: 20 } },
  { type: 'line', from: '@last', to: { x: 300, z: 40 } },
  { type: 'line', from: '@node:260,20', to: { x: 262, z: -60 } },
  { type: 'line', from: '@last', to: { x: 270, z: -105 } },
  ...MAP7.customers.filter((c) => !c.surprise).map((c) => ({ type: 'drop', building: c.id })),
];

// ------------------------------------------------------------------ director
function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D;
  const d = Math.floor(state.clock / D) + 1;
  const pg = state.gens.pumped;
  if (pg && (pg.chargeKW || 0) > 1) pg.everCharged = true;
  if (d === 2 && hm === 16 * 60 && !F.coldWarned) {
    F.coldWarned = true;
    api.emit('coldForecast');
  }
  // diesel-free run: no diesel output and nobody short of power
  const dieselOn = (state.gens.diesel?.outKW || 0) > 0.5;
  // only a shortage of supply counts (customers switched off for lack of power), not storm damage
  const short = api.map.customers.some((c) => state.cust[c.id].active !== false && state.cust[c.id].status === 'shed');
  if (!dieselOn && !short) {
    F.cleanRun = (F.cleanRun || 0) + 1;
    F.cleanBest = Math.max(F.cleanBest || 0, F.cleanRun);
    if (F.cleanRun === 2160) api.emit('cleanDone');
  } else {
    if ((F.cleanRun || 0) >= 180) api.emit('cleanBroken', { run: F.cleanRun, diesel: dieselOn });
    F.cleanRun = 0;
  }
  // the cold snap: day 3, railway and hospital
  if (d === 3) {
    for (const id of ['rail', 'hospital']) {
      F.coldTot = (F.coldTot || 0) + 1;
      if (powered(state, id)) F.coldOn = (F.coldOn || 0) + 1;
    }
    F.coldRel = (F.coldOn / F.coldTot) * 100;
    if (hm === 23 * 60 + 59 && F.coldOk == null) {
      F.coldOk = F.coldRel >= 98;
      api.emit(F.coldOk ? 'coldOk' : 'coldMissed', { rel: F.coldRel });
    }
  }
  const ice = state.ev?.deck.find((x) => x.key === 'ice');
  if (ice?.snapped) F.iceSnapped = true;
  if (ice?.phase === 'done' && !ice.snapped && ice.lines?.length && F.iceOk == null) F.iceOk = true;
}

function score(state, bal) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const reliability = Math.max(0, Math.min(25, (r - 95) * 5));
  const clean = Math.min(25, ((state.flags.cleanBest || 0) / 2160) * 25);
  const fuel = s.fuelUsed || 0;
  const emissions = Math.max(0, Math.min(15, 15 - fuel / 400));
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(15, 7 + net / 5000));
  const resilience = (state.flags.coldOk ? 12 : 0) + (state.flags.iceOk ? 8 : 0);
  void bal;
  const parts = { reliability: Math.round(reliability), clean: Math.round(clean), emissions: Math.round(emissions), finance: Math.round(finance), resilience };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['reliability', 'Reliability', 25], ['clean', 'Diesel-free', 25], ['emissions', 'Emissions', 15], ['finance', 'Finance', 15], ['resilience', 'Cold snap', 20]] };
}

function metrics(state, bal) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const pg = state.gens.pumped;
  return {
    powered: state.flow.powered,
    total: state.flow.activeCount ?? state.map.customers.length,
    decisions: { pumped: !!pg, wind: !!state.gens.wind, ice: !!state.flags.iceOk, cold: !!state.flags.coldOk },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.flow.activeCount ?? state.map.customers.length}`],
      ['Reliability', `${r.toFixed(2)}%`],
      ['Longest diesel-free run', fmt.dur(state.flags.cleanBest || 0)],
      ['Diesel burned', `${Math.round(s.fuelUsed || 0).toLocaleString('en-US')} units`],
      ['Pumped storage', pg ? `${fmt.kw(ratedKW(bal, pg))} · lake ${Math.round((pg.soc / pg.kwh) * 100)}%` : 'Not built'],
      ['Cold snap (trains and hospital)', state.flags.coldRel != null ? `${state.flags.coldRel.toFixed(1)}%` : 'n/a'],
      ['Ice storm', state.flags.iceOk ? 'No line snapped' : state.flags.iceSnapped ? 'A line snapped' : 'n/a'],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN7 = {
  pumped: { title: 'Pumped storage: a water battery', what: 'Your pumped storage is pumping water up to the high lake.', why: 'Spare power runs the pumps; at the peak the water flows back down through turbines. About three quarters of the energy comes back. It is slower to build than a battery but stores far more.', todo: ['Leave it on Auto to pump when power is spare and generate at the peak.', 'Use Charge only before a cold snap to fill the lake.'], real: 'Pumped hydro still holds over 90% of the world’s grid storage.' },
  ice: { title: 'Ice on the lines', what: 'Freezing rain is coating the lines on the pass.', why: 'Ice adds weight until a line snaps. Current warms a conductor: a line carrying at least a quarter of its limit stays warm enough to shed the ice, an idle line keeps collecting it.', todo: ['Click the 66 kV line to see its ice level.', 'Keep current flowing through it: pump water uphill (Charge only) or let the pumped storage generate.', 'If it snaps, repair it once the storm eases.'], real: 'Utilities in Canada and Scandinavia de-ice lines by deliberately loading them, a trick called "load-current de-icing".' },
  cold: { title: 'A cold snap is coming', what: 'Tomorrow the temperature plunges.', why: 'Heating pushes demand up while the river freezes down to a trickle. Wind may drop too.', todo: ['Fill the high lake tonight (Charge only).', 'Keep the diesel tank topped up as a backup.', 'Watch the pass line for ice.'], real: 'Winter peaks, not summer ones, are the toughest test for mountain grids.' },
};

const LINES7 = {
  ...L1,
  intro: [['advisor', 'Welcome to Highvale. Ski lifts, a copper mine and an electric railway, all in one narrow valley.'], ['sofia', 'The river plant follows the snowmelt and the diesel fills the gaps. Over the western pass there’s a site for pumped storage.']],
  coldForecast: [['advisor', 'Cold snap tomorrow, with freezing rain on the pass. Fill the high lake tonight.']],
  iceHeavy: [['sofia', 'Ice is building fast on {name}. Push current through it or it will snap.']],
  iceSnap: [['sofia', 'The ice snapped a line on the pass. Crew, as soon as it is safe.']],
  coldOk: [['maya', 'The trains ran all through the cold snap. People got to work, and the hospital never flickered.']],
  cleanDone: [['maya', 'A day and a half without the diesel plant. You can hear the birds instead of the engine.']],
  tutorialDone: [['advisor', 'The valley is yours. Store the water, watch the ice.']],
};

const TUT7 = [
  { id: 'mix', title: 'River, diesel and a cold week', body: 'Click the Supply chip. The river plant follows the snowmelt; the diesel fills the rest. Day 3 brings a cold snap.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
  { id: 'pumped', title: 'A water battery over the pass', body: 'Press G and build the pumped storage site in the far west. It connects at 66 kV.', target: { world: 'site', id: 'pumped' }, done: (st) => !!st.gens.pumped },
  { id: 'line', title: 'Over the pass at 66 kV', body: 'Press L, click the pumped storage and run a line east over the flat pass. Put a substation (B) at the valley end and link it to the 11 kV network.', target: { world: 'site', id: 'pumped' }, done: (st) => !!st.nodes.pumped?.connected },
  { id: 'wind', title: 'Wind on the ridge', body: 'Build the south ridge wind site and run an 11 kV line across the river to the valley.', target: { world: 'site', id: 'wind' }, done: (st) => !!st.gens.wind && !!st.nodes.wind?.connected },
];

const ENDING7 = {
  common: ['Water climbs to the high lake on windy nights and pours back down at the evening peak.', 'When the cold snap came, the trains kept running and the ice never won.'],
  sustainable: 'A clean, resilient mountain grid. The diesel plant is now a museum piece.',
  reliable: 'The valley’s lights, lifts and trains run on its own water and wind.',
  hardwon: 'The winter tested every line, but Highvale came through.',
  decisions: { pumped: 'Pumped storage turned the high lake into the valley’s battery.', wind: 'The ridge wind farm carried the windy nights.', ice: 'Current kept the pass line free of ice.', cold: 'Trains and hospital ran right through the cold snap.' },
  next: 'Next: the desert of Dunefield.',
};

const ui = {
  tutorial: TUT7,
  lines: LINES7,
  learn: LEARN7,
  ending: ENDING7,
  endTitle: 'Highvale runs on water and wind',
  demandNote: 'Chalets and the hotel peak in the evening, more in the cold. The mine runs two shifts, the ski lifts by day and the snow cannons at night, and the trains every hour.',
  briefing: {
    text: 'Highvale is a narrow mountain valley with a <b>ski resort</b>, a <b>copper mine</b> and an <b>electric railway</b>. A small river plant and a diesel plant run it today. Build <b>pumped storage</b> over the pass, ride out a <b>cold snap</b> with freezing rain, and run the valley without diesel.',
    goals: ['Pumped storage, connected at 66 kV over the pass', 'Trains and hospital running through the day-3 cold snap', '36 hours without the diesel plant, with enough power for everyone'],
    newSystems: ['<b>Pumped hydro storage</b> (a water battery)', '<b>Run-of-river</b> hydro that follows the snowmelt', '<b>Ice on lines</b> and de-icing with current', '<b>Electric railways</b> and heating demand in the cold'],
  },
  failCause: { clinic: { title: 'Highvale Hospital lost power too long', body: 'The hospital was dark for 6 hours.', tip: 'Keep storage full and diesel in the tank before the cold snap.' } },
  handles: ['coldForecast', 'iceHeavy', 'iceSnap', 'coldOk', 'coldMissed', 'cleanDone', 'cleanBroken'],
  onEvent(e, u) {
    switch (e.type) {
      case 'coldForecast':
        u.audio.play('warn');
        u.say('coldForecast');
        u.hud.alert({ id: 'cold', level: 'warn', title: 'Cold snap tomorrow', text: 'Temperatures far below freezing all day 3. Heating demand rises, the river slows to a trickle and freezing rain will coat the pass line. Fill the high lake tonight (pumped storage: Charge only) and keep diesel in the tank.', actions: [{ label: 'Supply panel', primary: true, fn: () => u.select({ kind: 'mix' }) }] });
        u.learnOnce('cold');
        break;
      case 'iceHeavy':
        u.audio.play('warn');
        u.say('iceHeavy', { name: '66 kV line' });
        u.hud.alert({ id: 'ice-' + e.target, level: 'critical', title: `Ice at ${Math.round(e.ice * 100)}% on a pass line`, text: 'It snaps at 100%. A line carrying at least a quarter of its limit warms up and sheds the ice. Put the pumped storage on Charge only to push current through it.', actions: [{ label: 'Show me', primary: true, fn: () => u.focus({ kind: 'edge', id: e.target }) }, u.state.gens.pumped ? { label: 'Pump now', fn: () => u.cmd({ type: 'battery', target: 'pumped', mode: 'charge' }) } : null].filter(Boolean) });
        u.learnOnce('ice');
        break;
      case 'iceSnap':
        u.audio.play('trip');
        u.say('iceSnap');
        u.hud.alert({ id: 'snap', level: 'critical', title: 'Ice snapped a line on the pass', text: 'Send the crew. It is a long climb.', actions: [{ label: 'Send the crew', primary: true, fn: () => u.cmd({ type: 'repair', target: e.target }) }, u.focusAct(e.target)] });
        break;
      case 'coldOk':
        u.audio.play('objective');
        u.say('coldOk');
        break;
      case 'coldMissed':
        u.hud.alert({ id: 'coldMissed', level: 'warn', title: 'The cold snap caught us out', text: `Trains and hospital had power ${e.rel.toFixed(1)}% of the day.`, ttl: 9000 });
        break;
      case 'cleanDone':
        u.audio.play('swell');
        u.say('cleanDone');
        break;
      case 'cleanBroken':
        u.hud.alert({ id: 'cleanb', level: 'warn', title: `Diesel-free run ended after ${u.fmt.dur(e.run)}`, text: e.diesel ? 'The diesel plant came back on.' : 'Some customers lost power.', ttl: 8000, actions: [{ label: 'Supply', fn: () => u.select({ kind: 'mix' }) }] });
        break;
    }
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF7 = [
  { type: 'inspect', target: 'mix' },
  { type: 'build', site: 'pumped', option: 'pumped' },
  { type: 'line', from: 'pumped', to: { x: -265, z: 40 } },
  { type: 'line', from: '@last', to: { x: -180, z: 40 } },
  { type: 'substation', at: '@last' },
  { type: 'line', from: '@node:-180,40', tier: 'down', to: '@node:-110,18' },
  { type: 'build', site: 'wind', option: 'wind' },
  { type: 'line', from: 'wind', to: { x: 200, z: 140 } },
  { type: 'line', from: '@last', to: { x: 200, z: 80 } },
  { type: 'line', from: '@last', to: '@node:170,20' },
  { type: 'build', site: 'solar', option: 'solar' },
  { type: 'line', from: 'solar', to: { x: -40, z: 130 } },
  { type: 'line', from: '@last', to: { x: -70, z: 90 } },
  { type: 'line', from: '@last', to: '@node:-110,75' },
  { type: 'dispatchOrder', order: ['pumped', 'diesel'] },
];

export default {
  id: MAP7.id,
  n: 7,
  key: 'stage7',
  stageName: 'Stage 7 · Mountain Power',
  name: 'Highvale',
  region: 'Highvale',
  blurb: 'A mountain valley of ski lifts, a mine and an electric railway. Store water uphill, ride out a cold snap and ice storm, and shut down the diesel.',
  learns: ['Pumped hydro storage', 'Run-of-river hydro and snowmelt', 'Ice on lines and de-icing', 'Railways and winter peaks'],
  map: MAP7,
  bal: BAL7,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'sub', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'mix', 'renew', 'weather', 'powered', 'rel'],
  objectives,
  weather: W7,
  cast: { mayor: { name: 'Anna Berger', role: 'Mayor of Highvale', color: '#b48cf2', initials: 'AB' }, tom: { name: 'Jonas Keller', role: 'Miners’ union', color: '#e2734e', initials: 'JK' }, nana: { name: 'Old Matthias', role: 'Retired mountain guide', color: '#d9b38c', initials: 'OM' } },
  quests: {
    perDay: [1, 2],
    pool: [
      { key: 'firstTrain', who: 'mayor', title: 'The first train of the day', text: 'Keep the railway powered from 06:00 to 10:00 for the commuter rush.', goal: { type: 'keepLit', ids: ['rail'], fromH: 6, toH: 10 }, reward: { credits: 1200, rep: 3 } },
      { key: 'nightSki', who: 'ravi', title: 'Night skiing', text: 'The ski lifts are open late tonight. Keep them running from 18:00 to 23:00.', goal: { type: 'keepLit', ids: ['ski'], fromH: 18, toH: 23 }, reward: { credits: 1500, rep: 2 }, news: 'Floodlit night skiing draws a crowd at Highvale.' },
      { key: 'shift', who: 'tom', title: 'A double shift at the mine', text: 'The mine runs a double shift today. Keep it powered from 08:00 to 20:00.', goal: { type: 'keepLit', ids: ['mine'], fromH: 8, toH: 20 }, reward: { credits: 1800, rep: 2 } },
      { key: 'warm', who: 'nana', title: 'Warm homes tonight', text: 'Keep every chalet street lit and warm from 17:00 to 22:00.', goal: { type: 'keepLit', ids: ['c1', 'c2', 'c3', 'c4'], fromH: 17, toH: 22 }, reward: { credits: 1000, rep: 4 } },
      { key: 'lake', who: 'sofia', title: 'Fill the high lake', text: 'Get the pumped storage to 70% by 17:00.', goal: { type: 'socAt', pct: 70, hour: 17 }, reward: { credits: 1200, rep: 2 } },
      { key: 'green', who: 'maya', title: 'A cleaner day', text: 'Make at least 70% of today’s electricity from water, wind and sun.', goal: { type: 'renewShare', pct: 70 }, reward: { credits: 1500, rep: 3 } },
    ],
  },
  story: [
    { day: 1, hour: 10, who: 'mayor', lines: ['Welcome to Highvale! The valley lives on three things: snow, copper and the railway. All three need power.'] },
    { day: 1, hour: 17, who: 'tom', title: 'The miners want a say', text: 'Jonas from the miners’ union asks to be told before any planned outage at the mine, so shifts aren’t wasted.', options: [{ label: 'Agree to warn them', rep: 3, note: 'Respect earns patience.', news: 'Utility promises miners advance notice of outages.' }, { label: 'Not possible', rep: -3 }] },
    { day: 2, hour: 11, who: 'leila', title: 'Fishers worry about the lake', text: 'Anglers ask whether pumping will make the high lake rise and fall too fast for the trout.', options: [{ label: 'Fund a fish ladder · 1,500 ¢', cost: 1500, rep: 5, note: 'The trout and the anglers are happy.', news: 'Fish ladder built at the pumped storage lake.' }, { label: 'The trout will cope', rep: -3, news: 'Anglers unhappy about the new pumped storage.' }] },
    { day: 3, hour: 8, who: 'nana', lines: ['In forty years I have never seen ice like this on the pass. Keep those lines singing.'] },
    { day: 4, hour: 12, who: 'amira', lines: ['The school trip to the pumped storage lake was the best day of term. They want to be engineers now!'] },
    { day: 5, hour: 15, who: 'mayor', lines: ['The railway company says this was its most reliable winter week ever.'] },
  ],
  events: {
    count: [7, 9],
    minGapH: 6,
    avoidH: [[38, 72]], // the cold-snap forecast, the cold snap and the ice storm
    fixed: [{ key: 'ice', kind: 'iceStorm', hitH: 55, warnH: 4, durH: 8, params: { zone: PASS, tiers: ['HV'], buildH: 5, meltPct: 25 } }],
    pool: [
      { key: 'avalanche', kind: 'landslide', weight: 2, windowH: [76, 150], warnH: 1, durH: 3, params: { area: 'the ski road', zone: { x: 280, z: -110, r: 70 }, p: 0.6, max: 2 } },
      { key: 'melt', kind: 'flood', weight: 1, windowH: [76, 150], warnH: 4, durH: 3, params: { area: 'the riverbanks', zone: { poly: [[-200, 95], [420, 95], [420, 130], [-200, 130]] } } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [10, 36], warnH: 3 },
      { key: 'xfmr2', kind: 'xfmrFail', weight: 1, windowH: [76, 150], warnH: 3 },
      { key: 'dieselTrip', kind: 'blackout', weight: 1, windowH: [10, 36], warnH: 2, durH: 2, params: { targets: ['diesel'] } },
      { key: 'winterFest', kind: 'festival', weight: 2, windowH: [76, 150], atHour: 18, warnH: 18, durH: 5, params: { name: 'The winter festival', text: 'Highvale’s winter festival fills the village with lights, music and mulled wine.', ids: ['c1', 'c2', 'c3', 'c4', 'lodge', 'shop'], mult: 1.35, startH: 18, at: { x: 40, z: -10 }, goodNews: 'Winter festival glows all night.', badNews: 'Power cut chills the winter festival.' } },
      { key: 'chalets', kind: 'arrivals', weight: 2, windowH: [10, 36], warnH: 8, durH: 12, params: { group: 'chalets', at: { x: 220, z: 40 }, title: 'New chalets for the ski instructors', text: 'Two chalets for the ski school’s instructors are finishing beside the river.', goodNews: 'Ski instructors move into warm, lit chalets.', badNews: 'New chalets still waiting for power.' } },
      { key: 'minister', kind: 'vipVisit', weight: 1, windowH: [76, 150], atHour: 11, warnH: 14, durH: 3, params: { name: 'The transport minister', who: 'mayor', zone: { x: 160, z: -40, r: 70 }, grant: 2000, text: 'The transport minister is riding the valley railway to see the new electric trains.', goodNews: 'Minister rides Highvale’s electric railway without a hitch.', badNews: 'Minister’s train stopped by a power cut.' } },
      { key: 'cyber', kind: 'cyberAlert', weight: 1, windowH: [76, 150], warnH: 6, params: { cost: 1000 } },
      { key: 'storm', kind: 'storm', weight: 1, windowH: [76, 150], warnH: 3, durH: 2, params: { p: 0.15, max: 1 } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [10, 36], warnH: 10, params: { grant: 1500 } },
      { key: 'heatPumps', kind: 'request', weight: 1, windowH: [10, 130], params: { who: 'maya', title: 'Heat pumps for the chalets', text: 'Chalet owners ask for help swapping their oil boilers for heat pumps. More electricity demand, but much less oil burned in the valley.', options: [{ label: 'Help pay · 2,000 ¢', cost: 2000, yes: true, rep: 5, note: 'Cleaner air in the valley.', news: 'Highvale chalets switch to heat pumps.' }, { label: 'Not now', rep: -2 }] } },
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
    runSteps(sim.cmd, sim.state, REF7);
  },
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF7);
    for (let i = 0; i < 7 * D && !sim.state.result; i++) {
      const c = sim.state.clock;
      // fill the lake before the cold snap; run it hard (and keep the pass line warm) during the ice
      if (c === day(2, 18)) sim.cmd({ type: 'battery', target: 'pumped', mode: 'charge' });
      if (c === day(3, 5)) sim.cmd({ type: 'battery', target: 'pumped', mode: 'auto' });
      if (c === day(4, 0)) sim.cmd({ type: 'stopGen', target: 'diesel' });
      const g = sim.state.gens.diesel;
      if (g && g.fuel < 500 && !sim.state.orders.some((o) => o.item === 'fuel') && c < day(4, 0)) sim.cmd({ type: 'order', item: 'fuel', target: 'diesel' });
      sim.tick();
      drainAndRespond(sim);
      if (sim.state.flags.cleanRun === 0 && c > day(4, 0) && sim.state.gens.diesel.status === 'running') sim.cmd({ type: 'stopGen', target: 'diesel' });
    }
  },
  ui,
  camera: { x: 20, z: 0, dist: 640 },
  ending: { x: 40, z: 0, dist: 340, outDist: 960, outDX: 0, outDZ: 0 },
};
