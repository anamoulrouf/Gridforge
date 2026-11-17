// Stage 5 · The 100% Green City — "Aurora" (GDD §6 Stage 5, §7.4 storage, §9.4 flexibility).
// A metropolis already runs on wind, solar and a big battery — with fossil imports filling the gaps.
// Make every kWh clean for a full day: smart EV charging, vehicle-to-grid, demand response,
// efficiency, more clean supply, and a self-healing network that reroutes around faults.
import { BALANCE } from '../data/balance.js';
import { LINES as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { runSteps } from '../sim/steps.js';
import { typeDef } from '../sim/power.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;

// ------------------------------------------------------------------ map
const tower = (id, name, x, z, label) => ({ id, type: 'tower', name, x, z, w: 20, d: 20, floors: 12, label });
const apt = (id, name, x, z) => ({ id, type: 'apartment', name, x, z, w: 22, d: 16, floors: 6 });
const row = (id, name, x, z) => ({ id, type: 'lowincome', name, x, z, w: 16, d: 9, scale: 40 });
const street = (id, name, x, z) => ({ id, type: 'home', name, x, z, w: 10, d: 10, scale: 60, pvKWp: 150 });
const hub = (id, name, x, z) => ({ id, type: 'evhub', name, x, z, w: 24, d: 18 });

export const MAP5 = {
  id: 'stage5-aurora',
  bounds: { minX: -470, maxX: 470, minZ: -420, maxZ: 420 },
  tile: { cx: 0, cz: 0, hw: 510, hd: 460, radius: 70 },
  mvTypes: ['datacenter', 'evhub'],
  roads: [
    { id: 'main', x: 0, z: 0, w: 1000, d: 10, lanes: true },
    { id: 'avenue', x: 0, z: 0, w: 10, d: 880, lanes: true },
    { id: 'north', x: 0, z: -170, w: 600, d: 8, lanes: true },
    { id: 'south', x: 0, z: 170, w: 600, d: 8, lanes: true },
    { id: 'west', x: -220, z: 0, w: 8, d: 340, lanes: true },
    { id: 'east', x: 220, z: 0, w: 8, d: 340, lanes: true },
    { id: 'depot', x: 330, z: 60, w: 8, d: 50 },
  ],
  crossings: [[0, -9, false], [0, 9, false], [-9, 0, true], [9, 0, true]],
  lampRoads: ['main', 'avenue', 'north', 'south', 'west', 'east'],
  clear: [{ x: 0, z: -330, w: 380, d: 80 }],
  core: [{ x: 0, z: 0, w: 560, d: 440 }],
  water: [{ x: 0, z: 420, w: 1000, d: 40 }],
  sources: [
    { id: 'windN', type: 'wind', name: 'Aurora north wind farm', tier: 'HV', x: 0, z: -360, w: 340, d: 40, port: { x: 0, z: -320 }, kw: 6000, turbines: 6, scale: 0.85 },
    { id: 'solarW', type: 'solar', name: 'West solar park', tier: 'HV', x: -390, z: 120, w: 110, d: 150, port: { x: -320, z: 60 }, kw: 4000 },
    { id: 'batt', type: 'battery', name: 'City battery', tier: 'MV', x: 60, z: -55, w: 40, d: 16, port: { x: 38, z: -40 }, kw: 3000, kwh: 12000, soc: 0.5 },
    { id: 'link', type: 'import', name: 'National interconnector (fossil mix)', tier: 'HV', x: 430, z: -330, w: 30, d: 20, port: { x: 400, z: -310 }, kw: 6000, running: true, dirX: 1 },
  ],
  sites: [
    { id: 'windE', name: 'East wind site', desc: 'Exposed headland east of the port', x: 430, z: 230, w: 60, d: 200, tier: 'HV', port: { x: 380, z: 230 }, turbines: 4, options: [{ type: 'wind', kw: 5000, cost: 30000, note: 'Four large turbines on the headland. 66 kV connection.' }] },
    { id: 'solarS', name: 'South solar park', desc: 'Brownfield site by the shore', x: -260, z: 310, w: 160, d: 70, tier: 'HV', port: { x: -170, z: 280 }, options: [{ type: 'solar', kw: 4000, cost: 22000 }] },
    { id: 'batt2', name: 'Second battery site', desc: 'Beside the south substation', x: -60, z: 60, w: 40, d: 16, tier: 'MV', port: { x: -38, z: 40 }, options: [{ type: 'battery', kw: 4000, kwh: 16000, cost: 30000 }] },
  ],
  depot: { id: 'depot', x: 330, z: 100, w: 18, d: 12 },
  townCenterZ: 0,
  decor: [
    { kind: 'windfarm', x: -720, z: -100, w: 120, d: 300, top: -10 },
    { kind: 'city', x: 0, z: -640, w: 300, d: 150, top: -12 },
    { kind: 'port', x: 400, z: 620, w: 240, d: 110, top: -12 },
    { kind: 'farm', x: -400, z: 620, w: 210, d: 100, top: -9 },
  ],
  customers: [
    // north-west residential
    apt('a1', 'Aurora Heights', -140, -60), apt('a2', 'Linden Court', -60, -60), apt('a3', 'Birch Towers', -140, -120), apt('a4', 'Maple Court', -60, -120),
    row('r1', 'Riverside Rows', -300, -60), row('r2', 'Old Town Rows', -300, -120),
    // north-east business
    tower('t1', 'Aurora Tower', 70, -110, 'AURORA'), tower('t2', 'Harbour Tower', 140, -110, 'HARBOUR'), tower('t3', 'Market Tower', 140, -50),
    { id: 'dc', type: 'datacenter', name: 'Aurora Data Centre', x: 300, z: -100, w: 50, d: 34, label: 'AURORA DATA' },
    // south-west civic & homes
    { id: 'hospital', type: 'hospital', name: 'Aurora General Hospital', x: -140, z: 80, w: 30, d: 22 },
    { id: 'school', type: 'school', name: 'Aurora Academy', x: -60, z: 120, w: 26, d: 12 },
    street('s1', 'Garden Streets', -300, 60), street('s2', 'Orchard Streets', -300, 120), street('s3', 'Park Streets', -140, 135),
    // south-east mobility
    hub('ev1', 'Central EV hub', 70, 70), hub('ev2', 'Port EV hub', 150, 70), hub('ev3', 'Ring EV hub', 150, 130),
  ],
};

// ------------------------------------------------------------------ balance
export const BAL5 = {
  ...BALANCE,
  start: { credits: 90000, poles: 60, transformers: 10, cable: 3000, kits: 4, fuel: 0, substations: 3 },
  startClockMin: 6 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1500, substation: 15000, drop: 50, maintain: 500, repairLabour: 800, dailyOverhead: 6000 },
  procurement: { ...BALANCE.procurement, kits: { qty: 1, cost: 800, leadH: 6 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 40000, MV: 4000, LV: 600 }, dropReach: 24, mvDropReach: 34 },
  transformer: { ...BALANCE.transformer, ratingKW: 1500 },
  substation: { ratingKW: 12000 },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  sourceTypes: {
    import: { dispatch: true, rampH: 0, maxKW: 6000, costPerKWh: 0.3, co2: 0.45 },
    solar: { variable: 'solar', renewable: true, co2: 0 },
    wind: { variable: 'wind', renewable: true, co2: 0 },
    battery: { storage: true, storageClean: true, kwh: 12000, eff: 0.9, co2: 0 },
  },
  dispatchOrder: ['battery', 'import'],
  exportPrice: 0.2,
  types: {
    apartment: { label: 'Apartment block', cls: 'home', nominal: 120, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.2 : h >= 7 && h <= 8 ? 1.3 : h >= 9 && h <= 17 ? 0.6 : 0.35) },
    lowincome: { label: 'Terrace rows (low-income)', cls: 'lowincome', nominal: 2, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.2 : h >= 7 && h <= 8 ? 1.2 : h >= 9 && h <= 17 ? 0.5 : 0.3), dailyKWh: 2 * (8 * 0.3 + 2 * 1.2 + 9 * 0.5 + 5 * 2.2) / 40 },
    home: { label: 'Streets of homes', cls: 'home', nominal: 1, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.5 : h >= 7 && h <= 8 ? 1.4 : h >= 9 && h <= 17 ? 0.5 : 0.3) },
    tower: { label: 'Office tower', cls: 'business', nominal: 300, priority: 1, profile: (h) => (h >= 8 && h <= 18 ? 1.0 : 0.2) },
    datacenter: { label: 'Data centre (11 kV)', cls: 'business', nominal: 1200, priority: 2, profile: (h) => (h >= 10 && h <= 18 ? 1.05 : 0.95) },
    hospital: { label: 'Hospital', cls: 'public', nominal: 400, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 120, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
    evhub: { label: 'EV charging hub (11 kV)', cls: 'business', nominal: 400, priority: 1, profile: (h) => (h >= 17 && h <= 22 ? 1.8 : h >= 7 && h <= 9 ? 0.8 : h >= 10 && h <= 16 ? 0.5 : 0.2) },
  },
  tariffs: { lowincome: { base: 0.3, min: 0.2, max: 0.5 }, home: { base: 0.4, min: 0.3, max: 0.6 }, business: { base: 0.48, min: 0.35, max: 0.8 }, public: { base: 0.3, min: 0.2, max: 0.45 } },
  income: { lowincome: 68 },
  afford: { limitPct: 6 },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 4, bankruptGraceH: 6, deadlineDay: 7, debtLimit: -40000 },
};

const W5 = {
  1: { wind: 5, cloud: 0.6, label: 'Light winds, cloudy' },
  2: { wind: 5.5, cloud: 0.5, label: 'Light winds' },
  3: { heat: true, label: 'Heat dome — cooling demand up 20 %' },
  5: { wind: 13, cloud: 0.15, label: 'Bright and breezy' },
  6: { wind: 11, cloud: 0.2, label: 'Fair and windy' },
};
const HUBS = ['ev1', 'ev2', 'ev3'];
const DR = ['dc', 't1', 't2', 't3'];
const EFF = ['a1', 'a2', 'a3', 'a4', 'r1', 'r2', 's1', 's2', 's3'];
const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const prog = (st, k) => st.programs?.[k] || {};

// Flexibility (GDD §9.4): smart charging shifts EV energy to the solar midday and the windy night;
// V2G lends parked-car batteries at the evening peak; demand response trims and shifts peaks;
// efficiency lowers demand all day. All shift or save energy — none of them create it.
function demandMod(state, c, kw, hour, w, bal) {
  const T = typeDef(bal, c.type);
  let k = kw;
  if (w.heat && hour >= 12 && hour <= 22 && (T.cls === 'home' || T.cls === 'lowincome' || T.cls === 'business')) k *= 1.2;
  if (c.type === 'datacenter' && state.flags.dcExpansion === 'accepted' && state.clock >= day(3, 14)) k *= 1.4;
  if (c.type === 'evhub') {
    if (prog(state, 'smart').on) {
      // same daily energy, moved out of 17–22 into 0–6 and 10–15
      const daily = T.nominal * (5 * 1.8 + 3 * 0.8 + 7 * 0.5 + 9 * 0.2);
      const share = hour <= 6 ? 0.5 / 7 : hour >= 10 && hour <= 15 ? 0.5 / 6 : 0;
      k = daily * share * (k / Math.max(1e-9, kw));
      if (prog(state, 'v2g').on && hour >= 18 && hour <= 21) k = -T.nominal * 0.6; // cars discharge into the grid
      if (prog(state, 'v2g').on && hour >= 1 && hour <= 5) k += (T.nominal * 0.6 * 4) / 5 / 0.9; // and recharge overnight
    }
  }
  if (prog(state, 'dr').on && DR.includes(c.id)) {
    if (hour >= 17 && hour <= 21) k *= 0.8;
    else if (hour >= 22 || hour <= 1) k *= 1.2; // shifted, not deleted
  }
  if (state.programs?.eff?.[c.id]) k *= 0.85;
  return k;
}

// ------------------------------------------------------------------ objectives
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;
const panel = { x: 0, z: 0, sel: { kind: 'programs' } };

const objectives = [
  {
    id: 'smart',
    primary: true,
    label: 'Switch EV hubs to smart charging',
    eval: (st) => ({ done: !!prog(st, 'smart').on }),
    guide: (st) => ({
      title: 'Switch EV hubs to smart charging',
      why: 'Unmanaged, everyone plugs in after work — the EV hubs add 2 MW right on the evening peak. Smart charging moves the same energy to windy nights and sunny middays.',
      steps: ['Open the <b>Programs</b> panel (click an EV hub, or the Supply chip → Programs).', 'Enable <b>Smart charging</b> (one-off integration cost).', 'Watch the evening peak drop in the demand curve.'],
      now: [prog(st, 'smart').on ? ok('Smart charging on') : todo('Off — EVs charge on the evening peak')],
      focus: panel,
      focusLabel: 'Open Programs',
    }),
  },
  {
    id: 'dr',
    primary: true,
    label: 'Enrol the data centre and towers in demand response',
    eval: (st) => ({ done: !!prog(st, 'dr').on }),
    guide: (st) => ({
      title: 'Enrol the data centre and towers in demand response',
      why: 'Big commercial customers can trim 20 % at the 17–21 h peak and catch up later — for a daily payment. It’s cheaper than building supply for a few peak hours.',
      steps: ['Open <b>Programs</b>.', 'Enable <b>Demand response</b> (daily payment to participants).', 'The shifted energy reappears late evening — it isn’t deleted.'],
      now: [prog(st, 'dr').on ? ok('Enrolled') : todo('Not enrolled')],
      focus: panel,
      focusLabel: 'Open Programs',
    }),
  },
  {
    id: 'auto',
    primary: true,
    label: 'Make the network self-healing',
    eval: (st) => ({ done: !!prog(st, 'auto').on }),
    guide: (st) => ({
      title: 'Make the network self-healing',
      why: 'Three normally-open tie switches link neighbouring feeders. With automation, when a feeder faults the switches isolate the fault and re-route supply in about a minute.',
      steps: ['Open <b>Programs</b> and buy <b>Feeder automation</b>.', 'Tie switches show as dashed links between feeders.', 'Without it, you must spot faults and close a tie switch yourself.'],
      now: [prog(st, 'auto').on ? ok('Automation active') : todo('Manual switching only')],
      focus: panel,
      focusLabel: 'Open Programs',
    }),
  },
  {
    id: 'clean',
    primary: true,
    bar: true,
    unit: 'h',
    label: '24 h of 100% clean electricity, nobody dark',
    eval: (st) => ({ done: (st.flags.cleanBest || 0) >= 1440, progress: [Math.floor((st.flags.cleanRun || 0) / 60), 24] }),
    guide: (st) => ({
      title: '24 h of 100% clean electricity, nobody dark',
      why: 'The goal of the whole campaign: every kWh consumed comes from clean sources, for a full day, with no unserved demand. Imports from the national grid count as fossil.',
      steps: ['Add clean supply: the east wind site and the south solar park (G).', 'Add storage (second battery) and flexibility (smart charging, V2G, demand response, efficiency).', 'Keep the interconnector at the bottom of the dispatch order — any import resets the clock.'],
      now: [info(`Current clean run: ${fmt.dur(st.flags.cleanRun || 0)} · best ${fmt.dur(st.flags.cleanBest || 0)}`), (st.gens.link?.outKW || 0) > 1 ? warn(`Importing ${fmt.kw(st.gens.link.outKW)} of fossil power now`) : ok('No imports right now'), (st.flow.deficitKW || 0) > 1 ? warn(`Short by ${fmt.kw(st.flow.deficitKW)}`) : null].filter(Boolean),
      focus: { x: 0, z: 0, sel: { kind: 'mix' } },
      focusLabel: 'Open Supply',
    }),
  },
  {
    id: 'rel',
    primary: true,
    live: true,
    label: 'Keep reliability at 99.5% or better',
    eval: (st) => {
      const s = st.stats;
      const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
      return { done: r >= 99.5 };
    },
    guide: (st) => {
      const s = st.stats;
      const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
      return {
        title: 'Keep reliability at 99.5% or better',
        why: 'A 100 % clean grid only counts if it’s also reliable. Customer-hours powered ÷ customer-hours connected, since the start.',
        steps: ['Avoid shortages: storage and flexibility before the evening peak.', 'Let feeder automation re-route around faults.', 'Protect the hospital and the data centre.'],
        now: [r >= 99.5 ? ok(`Reliability ${r.toFixed(2)}%`) : warn(`Reliability ${r.toFixed(2)}% — below 99.5%`)],
        focus: null,
      };
    },
  },
  {
    id: 'afford',
    primary: true,
    live: true,
    label: 'Keep low-income bills under 6% of income',
    eval: (st, bal) => ({ done: st.affordPct <= bal.afford.limitPct + 1e-9 }),
    guide: (st, bal) => ({
      title: 'Keep low-income bills under 6% of income',
      why: 'A just transition: clean power must stay affordable for everyone.',
      steps: ['Open Finance (cash chip).', 'Keep the low-income tariff low; recover costs from businesses and cheaper clean energy.'],
      now: [st.affordPct <= bal.afford.limitPct ? ok(`Bill share ${st.affordPct.toFixed(1)}%`) : warn(`Bill share ${st.affordPct.toFixed(1)}%`)],
      focus: null,
    }),
  },
  {
    id: 'v2g',
    primary: false,
    label: 'Optional · Turn on vehicle-to-grid',
    eval: (st) => ({ done: !!prog(st, 'v2g').on }),
    guide: (st) => ({
      title: 'Optional · Turn on vehicle-to-grid',
      why: 'Parked EVs are batteries on wheels. With V2G the hubs export at the evening peak and recharge overnight — paid for their help.',
      steps: ['Requires smart charging.', 'Open Programs and enable V2G.'],
      now: [prog(st, 'v2g').on ? ok('On') : todo('Off')],
      focus: panel,
      focusLabel: 'Open Programs',
    }),
  },
  {
    id: 'eff',
    primary: false,
    label: 'Optional · Efficiency retrofits for every home block',
    eval: (st) => ({ done: EFF.every((id) => st.programs?.eff?.[id]) }),
    guide: (st) => ({
      title: 'Optional · Efficiency retrofits for every home block',
      why: 'Insulation, heat pumps and LEDs cut demand 15 % at every hour — the cleanest kWh is the one you don’t need.',
      steps: ['Open Programs → Efficiency, or click a home block.', 'Retrofit each block (one-off cost).'],
      now: [info(`Retrofitted: ${EFF.filter((id) => st.programs?.eff?.[id]).length} / ${EFF.length}`)],
      focus: panel,
      focusLabel: 'Open Programs',
    }),
  },
];

// ------------------------------------------------------------------ prebuilt city network
const PREBUILT = [
  // 66 kV: wind farm → north substation; interconnector → north substation; solar → west substation; ring north–west–south
  { type: 'line', from: 'windN', to: { x: -12, z: -230 } },
  { type: 'line', from: '@last', to: { x: -12, z: -150 } },
  { type: 'substation', at: '@last' },
  { type: 'line', from: 'link', to: { x: 330, z: -240 } },
  { type: 'line', from: '@last', to: { x: 230, z: -190 } },
  { type: 'line', from: '@last', to: { x: 120, z: -150 } },
  { type: 'line', from: '@last', to: '@node:-12,-150' },
  { type: 'line', from: 'solarW', to: { x: -230, z: 30 } },
  { type: 'line', from: '@last', to: { x: -150, z: 20 } },
  { type: 'substation', at: '@last' },
  { type: 'line', from: '@node:-12,-150', tier: 'up', to: { x: -120, z: -150 } },
  { type: 'line', from: '@last', to: { x: -232, z: -110 } },
  { type: 'line', from: '@last', to: '@node:-150,20' },
  { type: 'line', from: '@node:-150,20', tier: 'up', to: { x: -20, z: 20 } },
  { type: 'line', from: '@last', to: { x: 50, z: 20 } },
  { type: 'substation', at: '@last' },
  // 11 kV feeders and transformers
  { type: 'line', from: '@node:-12,-150', tier: 'down', to: { x: -100, z: -90 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-100,-90', tier: 'up', to: { x: -260, z: -90 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-12,-150', tier: 'down', to: { x: 105, z: -80 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-12,-150', tier: 'down', to: { x: 250, z: -140 } },
  { type: 'line', from: '@last', to: { x: 268, z: -100 } },
  { type: 'line', from: '@node:-150,20', tier: 'down', to: { x: -110, z: 50 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-150,20', tier: 'down', to: { x: -260, z: 90 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:50,20', tier: 'down', to: { x: 110, z: 100 } },
  { type: 'line', from: '@last', to: { x: 130, z: 100 } },
  { type: 'line', from: '@node:50,20', tier: 'down', to: { x: 38, z: -40 } },
  { type: 'line', from: '@node:-150,20', tier: 'down', to: { x: -38, z: 40 } },
  // 400 V branches
  { type: 'line', from: '@node:-100,-90', to: { x: -118, z: -75 } },
  { type: 'line', from: '@node:-100,-90', to: { x: -118, z: -105 } },
  { type: 'line', from: '@node:-100,-90', to: { x: -82, z: -75 } },
  { type: 'line', from: '@node:-100,-90', to: { x: -82, z: -105 } },
  { type: 'line', from: '@node:-260,-90', to: { x: -275, z: -60 } },
  { type: 'line', from: '@node:-260,-90', to: { x: -275, z: -120 } },
  { type: 'line', from: '@node:105,-80', to: { x: 88, z: -108 } },
  { type: 'line', from: '@node:105,-80', to: { x: 122, z: -108 } },
  { type: 'line', from: '@node:105,-80', to: { x: 122, z: -52 } },
  { type: 'line', from: '@node:-110,50', to: { x: -110, z: 80 } },
  { type: 'line', from: '@last', to: { x: -128, z: 120 } },
  { type: 'line', from: '@node:-110,50', to: { x: -80, z: 100 } },
  { type: 'line', from: '@node:-260,90', to: { x: -275, z: 60 } },
  { type: 'line', from: '@node:-260,90', to: { x: -275, z: 120 } },
  ...MAP5.customers.map((c) => ({ type: 'drop', building: c.id })),
  // tie lines (normally open): west residential ↔ west civic; business ↔ mobility feeder
  { type: 'line', from: '@node:-260,-90', tier: 'up', to: { x: -244, z: -30 }, tie: true },
  { type: 'line', from: '@last', to: { x: -244, z: 40 }, tie: true },
  { type: 'line', from: '@last', to: '@node:-260,90', tie: true },
  { type: 'line', from: '@node:105,-80', tier: 'up', to: { x: 175, z: -40 }, tie: true },
  { type: 'line', from: '@last', to: { x: 175, z: 40 }, tie: true },
  { type: 'line', from: '@last', to: { x: 175, z: 100 }, tie: true },
  { type: 'line', from: '@last', to: '@node:130,100', tie: true },
];

function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D;
  const d = Math.floor(state.clock / D) + 1;
  // clean-run clock: no fossil output and nobody short, minute by minute
  const fossil = Object.values(state.gens).some((g) => g.type === 'import' && g.outKW > 0.5);
  const short = api.map.customers.some((c) => state.cust[c.id].dropped && !(state.cust[c.id].status === 'on'));
  if (!fossil && !short) {
    F.cleanRun = (F.cleanRun || 0) + 1;
    F.cleanBest = Math.max(F.cleanBest || 0, F.cleanRun);
    if (F.cleanRun === 1440) api.emit('cleanDay');
  } else {
    if ((F.cleanRun || 0) >= 120) api.emit('cleanBroken', { fossil, short, run: F.cleanRun });
    F.cleanRun = 0;
  }
  // day 2 evening: heat dome forecast; day 3: data centre expansion request + a feeder fault
  if (d === 2 && hm === 18 * 60) api.emit('heatForecast');
  if (d === 3 && hm === 9 * 60 && !F.dcExpansion) {
    F.dcExpansion = 'offered';
    api.emit('dcOffer');
  }
  if (d === 3 && hm === 18 * 60 && !F.feederFault) {
    const e = Object.keys(state.edges).find((id) => state.edges[id].faultTarget);
    if (e) {
      state.edges[e].state = 'fault';
      F.feederFault = e;
      F.faultT = state.t;
      api.emit('feederFault', { target: e });
      return 'resolve';
    }
  }
  // self-healing: with automation, close tie switches that would restore customers cut off by a fault
  if (prog(state, 'auto').on && F.feederFault && state.edges[F.feederFault]?.state === 'fault' && !F.healed && state.t - F.faultT >= 1) {
    for (const id of Object.keys(state.edges)) {
      const e = state.edges[id];
      if (e.tie && e.open) e.open = false;
    }
    F.healed = true;
    api.emit('selfHealed');
    return 'resolve';
  }
  // after the repair, the switches return to normally-open
  if (F.healed && state.edges[F.feederFault]?.state === 'ok' && !F.restored) {
    for (const id of Object.keys(state.edges)) if (state.edges[id].tie) state.edges[id].open = true;
    F.restored = true;
    return 'resolve';
  }
}

function score(state) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const clean = Math.min(30, ((state.flags.cleanBest || 0) / 1440) * 30);
  const reliability = Math.max(0, Math.min(25, (r - 98) * 12.5));
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  const emissions = Math.max(0, Math.min(15, 15 - co2 / 8));
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(15, 6 + net / 8000));
  const fair = state.affordPct <= 5 ? 15 : state.affordPct <= 6 ? 10 : 0;
  const parts = { clean: Math.round(clean), reliability: Math.round(reliability), emissions: Math.round(emissions), finance: Math.round(finance), fair };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['clean', '100% clean', 30], ['reliability', 'Reliability', 25], ['emissions', 'Emissions', 15], ['finance', 'Finance', 15], ['fair', 'Fairness', 15]] };
}

function metrics(state) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  return {
    powered: state.flow.powered,
    total: state.map.customers.length,
    decisions: { smart: !!prog(state, 'smart').on, v2g: !!prog(state, 'v2g').on, dr: !!prog(state, 'dr').on, healed: !!state.flags.healed },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.map.customers.length}`],
      ['Longest clean run', fmt.dur(state.flags.cleanBest || 0)],
      ['Reliability', `${r.toFixed(2)}%`],
      ['CO₂ from imports', `${co2.toFixed(1)} t`],
      ['Peak demand', fmt.kw(s.peakKW)],
      ['Energy delivered', fmt.kwh(s.kWhDelivered)],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
      ['Low-income bill share', `${state.affordPct.toFixed(1)}%`],
      ['Self-healing', state.flags.healed ? 'Re-routed automatically' : state.flags.feederFault ? 'Manual' : '—'],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN5 = {
  flex: { title: 'Flexibility is a resource', what: 'You switched on a flexibility program.', why: 'Clean supply follows the weather. Instead of building for the worst hour, you can move demand to when clean power is plentiful — and store it when it isn’t.', todo: ['Smart charging moves EV energy away from the evening peak.', 'V2G lets parked cars help at the peak.', 'Demand response trims commercial peaks — the energy is shifted, not deleted.'], real: 'Grid operators increasingly buy flexibility from customers instead of building peaking plants.' },
  selfheal: { title: 'A self-healing grid', what: 'A feeder faulted and the automation re-routed supply.', why: 'Normally-open tie switches link neighbouring feeders. Sensors locate the fault, isolate it and close the right tie in about a minute.', todo: ['Repair the faulted section — the ties re-open afterwards.'], real: 'Fault location, isolation and service restoration (FLISR) cuts outage minutes dramatically on modern distribution grids.' },
  fault: { title: 'Feeder fault — manual switching', what: 'A feeder section faulted. Customers beyond it are dark.', why: 'Without automation, the network can’t re-route on its own.', todo: ['Click a dashed tie switch and Close it to re-route supply.', 'Send the crew to repair the fault.', 'Buy feeder automation to make this automatic.'], real: 'Before automation, crews drove out to open and close switches by hand — taking hours.' },
  clean: { title: '100% clean', what: 'A full day without a single fossil kWh — and nobody dark.', why: 'Clean supply, storage and flexibility, working together.', todo: ['Keep the run going — or enjoy the view.'], real: 'Cities and regions are now reaching hours, then days, of 100 % clean electricity.' },
};

const LINES5 = {
  ...L1,
  intro: [['advisor', 'Welcome to Aurora. The city already runs on wind, sun and a big battery — most of the time.'], ['sofia', 'When the wind drops, we import fossil power from the national grid. The goal: a full day without it.']],
  heatForecast: [['advisor', 'Heat dome tomorrow: cooling demand up about 20 % from noon.']],
  dcOffer: [['daniel', 'The data centre wants to add 40 % more servers from 14:00. More revenue — and more load.']],
  feederFault: [['sofia', 'Cable fault on a city feeder! Customers are dark.']],
  selfHealed: [['sofia', 'The automation re-routed around the fault in under a minute. Crew, go fix the cable.']],
  cleanDay: [['maya', 'Twenty-four hours of 100 % clean power — the whole city.']],
  tutorialDone: [['advisor', 'Aurora is yours. Make it the first 100 % clean city.']],
};

const TUT5 = [
  { id: 'mix', title: 'Where does Aurora’s power come from?', body: 'Click the Supply chip: wind, solar, the city battery — and the national interconnector, which is fossil.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
  { id: 'programs', title: 'Flexibility programs', body: 'Click an EV hub (south-east) and open Programs. Turn on smart charging — EVs stop piling onto the evening peak.', target: { world: 'cust', id: 'ev1' }, done: (st) => !!prog(st, 'smart').on },
  { id: 'auto', title: 'A self-healing network', body: 'In Programs, buy feeder automation. Dashed tie switches will re-route power around faults.', target: { world: 'cust', id: 'ev1' }, done: (st) => !!prog(st, 'auto').on },
  { id: 'build', title: 'More clean supply', body: 'Press G and build the east wind site or the south solar park, then connect it at 66 kV.', target: { world: 'site', id: 'windE' }, done: (st) => !!st.gens.windE || !!st.gens.solarS },
];

const ENDING5 = {
  common: ['For a full day and night, every light in Aurora ran on wind, sun and stored energy.', 'Cars charged when the wind blew and gave power back at dusk. Towers eased off at the peak. The grid healed itself.'],
  sustainable: 'A 100 % clean, reliable and fair city. From one diesel generator to this — the campaign is complete.',
  reliable: 'Clean, reliable power for a whole metropolis. The future arrived.',
  hardwon: 'It took everything you had — but Aurora ran on clean power.',
  decisions: { smart: 'Smart charging tamed the evening EV rush.', v2g: 'Parked cars became the city’s second battery.', dr: 'The data centre and towers flexed their demand.', healed: 'The network healed itself in under a minute.' },
  next: 'Thank you for playing Gridforge.',
};

const PROG = {
  smart: { name: 'Smart EV charging', cost: 12000, daily: 0, desc: 'Moves EV charging out of 17–22 h into the night and midday. Same energy, different hours.' },
  v2g: { name: 'Vehicle-to-grid (V2G)', cost: 15000, daily: 600, desc: 'Parked EVs export at 18–21 h and recharge overnight. Requires smart charging.' },
  dr: { name: 'Demand response', cost: 0, daily: 1500, desc: 'Data centre and towers trim 20 % at 17–21 h and catch up at 22–01 h. Paid daily.' },
  auto: { name: 'Feeder automation (self-healing)', cost: 25000, daily: 0, desc: 'Sensors and remote switches re-route supply around faults in about a minute.' },
};

const ui = {
  tutorial: TUT5,
  lines: LINES5,
  learn: LEARN5,
  ending: ENDING5,
  endTitle: 'Aurora runs on 100% clean electricity',
  demandNote: 'Apartments and homes peak in the evening; towers by day; the data centre and hospital run around the clock. EV hubs pile onto the evening peak unless smart charging moves them.',
  briefing: {
    text: 'Aurora is a metropolis that already runs on wind, solar and a city battery — with <b>fossil imports</b> filling the gaps. Make every kWh clean for a <b>full day</b>, without leaving anyone in the dark.',
    goals: ['Smart EV charging, demand response and a self-healing network', '24 hours of 100 % clean electricity with nobody dark', 'Reliability ≥ 99.5 % and fair low-income bills'],
    newSystems: ['<b>Smart charging</b> and <b>vehicle-to-grid</b>', '<b>Demand response</b> and <b>efficiency</b>', '<b>Self-healing</b> networks (tie switches + automation)', 'The <b>100 % clean</b> goal'],
  },
  failCause: { clinic: { title: 'The hospital lost power too long', body: 'Aurora General was dark for 4 hours.', tip: 'Feeder automation and storage protect critical services.' } },
  handles: ['heatForecast', 'dcOffer', 'feederFault', 'selfHealed', 'cleanDay', 'cleanBroken', 'program', 'switched'],
  onEvent(e, u) {
    switch (e.type) {
      case 'heatForecast':
        u.audio.play('warn');
        u.say('heatForecast');
        break;
      case 'dcOffer':
        u.audio.play('warn');
        u.say('dcOffer');
        u.hud.alert({ id: 'dc', level: 'info', title: 'Data centre asks for +40 % from 14:00', text: 'More revenue, and about 500 kW more load all day and night. Can your clean supply carry it?', actions: [{ label: 'Accept', primary: true, fn: () => u.cmd({ type: 'dcExpand', accept: true }).ok && u.hud.dismiss('dc') }, { label: 'Decline', fn: () => u.cmd({ type: 'dcExpand', accept: false }).ok && u.hud.dismiss('dc') }] });
        break;
      case 'feederFault':
        u.audio.play('trip');
        u.audio.play('critical');
        u.say('feederFault');
        u.hud.alert({ id: 'ff', level: 'critical', title: 'Cable fault on a city feeder', text: u.state.programs?.auto?.on ? 'Automation is re-routing supply…' : 'Close a tie switch (dashed link) to re-route, and send the crew.', actions: [{ label: 'Send repair crew', primary: true, fn: () => u.cmd({ type: 'repair', target: e.target }).ok && u.hud.dismiss('ff') }, u.focusAct(e.target)] });
        if (!u.state.programs?.auto?.on) u.learnOnce('fault', { focus: () => u.focus({ kind: 'edge', id: e.target }) });
        break;
      case 'selfHealed':
        u.audio.play('objective');
        u.say('selfHealed');
        u.learnOnce('selfheal');
        break;
      case 'cleanDay':
        u.audio.play('swell');
        u.say('cleanDay');
        u.learnOnce('clean');
        break;
      case 'cleanBroken':
        u.hud.alert({ id: 'cleanb', level: 'warn', title: `Clean run ended after ${u.fmt.dur(e.run)}`, text: e.fossil ? 'The interconnector imported fossil power.' : 'Some customers were short of supply.', ttl: 8000, actions: [{ label: 'Supply', fn: () => u.select({ kind: 'mix' }) }] });
        break;
      case 'program':
        u.learnOnce('flex');
        break;
    }
  },
  programsPanel(state, ctx, { btn, kv, head, sec }) {
    const rows = Object.entries(PROG)
      .map(([k2, p]) => {
        const on = !!state.programs?.[k2]?.on;
        const needs = k2 === 'v2g' && !state.programs?.smart?.on;
        return `<div class="build-opt"><b>${p.name}</b> ${on ? '<span class="status-pill st-on">On</span>' : ''}<div class="note">${p.desc}${p.cost ? ` One-off ${fmt.cr(p.cost)}.` : ''}${p.daily ? ` ${fmt.cr(p.daily)} per day.` : ''}</div><div class="actions">${on ? (k2 === 'auto' ? '' : btn('Turn off', { type: 'program', id: k2, on: false }, {})) : btn(p.cost ? `Enable · ${fmt.cr(p.cost)}` : 'Enable', { type: 'program', id: k2, on: true }, { primary: true, disabled: needs || state.credits < p.cost, title: needs ? 'Requires smart charging' : '' })}</div></div>`;
      })
      .join('');
    const effDone = EFF.filter((id) => state.programs?.eff?.[id]).length;
    const effNext = EFF.find((id) => !state.programs?.eff?.[id]);
    return head('bolt', 'Programs', 'Flexibility, efficiency and automation') + rows + sec('Efficiency retrofits') + `<div class="note">Insulation, heat pumps and LEDs: −15 % demand at every hour for a home block. 4 000 ¢ each.</div>` + kv([['Retrofitted', `${effDone} / ${EFF.length}`]]) + (effNext ? `<div class="actions">${btn(`Retrofit next block · ${fmt.cr(4000)}`, { type: 'efficiency', target: effNext }, { primary: true, disabled: state.credits < 4000 })}</div>` : '');
  },
  buildingExtra(c, state, ctx, { btn }) {
    if (c.type === 'evhub' || DR.includes(c.id)) return `<div class="actions">${btn('Open Programs', { type: 'openPanel', kind: 'programs' }, { primary: true, icon: 'bolt' })}</div>`;
    if (EFF.includes(c.id)) return state.programs?.eff?.[c.id] ? '<div class="note">Efficiency retrofit done (−15 % demand).</div>' : `<div class="actions">${btn('Efficiency retrofit · 4 000 ¢', { type: 'efficiency', target: c.id }, { primary: true, disabled: state.credits < 4000 })}</div>`;
    return '';
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF5 = [
  { type: 'inspect', target: 'mix' },
  { type: 'program', id: 'smart', on: true },
  { type: 'program', id: 'auto', on: true },
  { type: 'program', id: 'dr', on: true },
  { type: 'build', site: 'windE', option: 'wind' },
  { type: 'line', from: 'windE', to: { x: 300, z: 180 } },
  { type: 'line', from: '@last', to: { x: 240, z: 60 } },
  { type: 'line', from: '@last', to: { x: 120, z: 30 } },
  { type: 'line', from: '@last', to: '@node:50,20', tier: 'HV' },
];
export const REF5_DAY2 = [
  { type: 'build', site: 'solarS', option: 'solar' },
  { type: 'line', from: 'solarS', to: { x: -200, z: 200 } },
  { type: 'line', from: '@last', to: { x: -160, z: 100 } },
  { type: 'line', from: '@last', to: '@node:-150,20' },
];
export const REF5_DAY3 = [
  { type: 'build', site: 'batt2', option: 'battery' },
  { type: 'line', from: 'batt2', to: '@node:-150,20' },
  { type: 'dispatchOrder', order: ['battery', 'import'] },
];

export default {
  id: MAP5.id,
  n: 5,
  key: 'stage5',
  stageName: 'Stage 5 · The 100% Green City',
  name: 'Aurora',
  region: 'Aurora',
  blurb: 'A metropolis on the edge of 100 % clean power. Add supply, storage and flexibility — and run a full day without a single fossil kWh.',
  learns: ['Smart charging & V2G', 'Demand response & efficiency', 'Self-healing networks', '100 % clean electricity'],
  map: MAP5,
  bal: BAL5,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'sub', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'mix', 'renew', 'co2', 'weather', 'powered', 'afford'],
  objectives,
  weather: W5,
  demandMod,
  prebuilt: PREBUILT,
  init(state) {
    state.started = true;
    state.programs = { eff: {} };
    state.prosumers = { s1: true, s2: true, s3: true }; // Aurora's rooftops already have solar
  },
  afterPrebuilt(state) {
    for (const id in state.nodes) if (state.nodes[id].kind === 'xfmr') state.nodes[id].legacy = true;
    for (const id in state.edges) state.edges[id].legacy = true;
    // the business feeder section that will fault on day 3
    const cand = Object.keys(state.edges).filter((id) => state.edges[id].kind === 'line' && state.edges[id].tier === 'MV' && !state.edges[id].tie);
    const target = cand.find((id) => {
      const e = state.edges[id];
      const a = state.nodes[e.a];
      const b = state.nodes[e.b];
      return a && b && Math.max(a.x, b.x) > 60 && Math.min(a.z, b.z) < -80 && Math.max(a.z, b.z) < 0;
    });
    if (target) state.edges[target].faultTarget = true;
  },
  commands: {
    program(c, api) {
      const st = api.state;
      const p = PROG[c.id];
      if (!p) return { ok: false, reason: 'badTarget' };
      const cur = st.programs[c.id] || {};
      if (c.on && cur.on) return { ok: false, reason: 'badTarget' };
      if (c.on) {
        if (c.id === 'v2g' && !st.programs.smart?.on) return { ok: false, reason: 'badTarget' };
        if (!cur.paid) {
          if (st.credits < p.cost) return { ok: false, reason: 'noCredits' };
          api.spend(p.cost);
        }
        st.programs[c.id] = { on: true, paid: true, dailyCost: p.daily };
      } else {
        if (c.id === 'auto') return { ok: false, reason: 'badTarget' };
        st.programs[c.id] = { ...cur, on: false };
        if (c.id === 'smart' && st.programs.v2g?.on) st.programs.v2g.on = false;
      }
      api.emit('program', { id: c.id, on: !!c.on });
      api.resolve();
      return { ok: true };
    },
    efficiency(c, api) {
      const st = api.state;
      if (!EFF.includes(c.target) || st.programs.eff[c.target]) return { ok: false, reason: 'badTarget' };
      if (st.credits < 4000) return { ok: false, reason: 'noCredits' };
      api.spend(4000);
      st.programs.eff[c.target] = true;
      api.emit('program', { id: 'eff', target: c.target });
      api.resolve();
      return { ok: true };
    },
    dcExpand(c, api) {
      const F = api.state.flags;
      if (F.dcExpansion !== 'offered') return { ok: false, reason: 'badTarget' };
      F.dcExpansion = c.accept ? 'accepted' : 'declined';
      api.resolve();
      return { ok: true };
    },
  },
  director,
  score,
  metrics,
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF5);
    for (let i = 0; i < 7 * D && !sim.state.result; i++) {
      sim.tick();
      if (sim.state.clock === day(2, 9)) runSteps(sim.cmd, sim.state, REF5_DAY2);
      if (sim.state.clock === day(3, 9)) runSteps(sim.cmd, sim.state, REF5_DAY3);
      if (sim.state.clock === day(4, 9)) {
        sim.cmd({ type: 'program', id: 'v2g', on: true });
        for (const id of EFF) sim.cmd({ type: 'efficiency', target: id });
      }
      for (const e of sim.drainEvents()) {
        if (e.type === 'feederFault') sim.cmd({ type: 'repair', target: e.target });
        if (e.type === 'dcOffer') sim.cmd({ type: 'dcExpand', accept: false });
      }
    }
  },
  ui,
  camera: { x: 0, z: -10, dist: 700 },
  ending: { x: 0, z: 0, dist: 380, outDist: 1100, outDX: 0, outDZ: 0 },
};
