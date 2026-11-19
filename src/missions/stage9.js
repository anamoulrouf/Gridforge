// Stage 9 · Power Market, "Twin Cities" (Chapter II).
// Riverport and Ostra face each other across a river. Ostra has wind and sun, Riverport has a gas
// plant and a link to the national electricity market, where the price changes every hour. Sell
// surplus wind abroad, let the battery buy cheap and sell dear, and add a second market link when
// the first one is full. Keep both cities reliable through price spikes.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { runSteps } from '../sim/steps.js';
import { marketPrice } from '../sim/power.js';
import { drainAndRespond } from '../sim/events.js';
import { fnv } from '../sim/rng.js';
import { rollingRel } from '../sim/sim.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;

// ------------------------------------------------------------------ map
const apt = (id, name, x, z) => ({ id, type: 'apartment', name, x, z, w: 22, d: 14, floors: 6 });
const tower = (id, name, x, z, label) => ({ id, type: 'tower', name, x, z, w: 20, d: 20, floors: 10, label });
const street = (id, name, x, z) => ({ id, type: 'home', name, x, z, w: 10, d: 10, scale: 60 });

export const MAP9 = {
  id: 'stage9-twincities',
  bounds: { minX: -440, maxX: 440, minZ: -260, maxZ: 260 },
  tile: { cx: 0, cz: 0, hw: 480, hd: 300, radius: 70 },
  mvTypes: ['tower', 'factory'],
  life: { traffic: 1.1 },
  roads: [
    { id: 'main', x: 0, z: 0, w: 940, d: 10, lanes: true },
    { id: 'west', x: -180, z: 0, w: 8, d: 320, lanes: true },
    { id: 'east', x: 180, z: 0, w: 8, d: 320, lanes: true },
    { id: 'quay', x: 0, z: 190, w: 600, d: 8, lanes: true },
    { id: 'depot', x: 60, z: -60, w: 8, d: 60 },
  ],
  crossings: [[-180, -9, false], [-180, 9, false], [180, -9, false], [180, 9, false]],
  lampRoads: ['main', 'west', 'east', 'quay'],
  water: [{ x: 0, z: 0, w: 30, d: 620 }],
  clear: [{ x: -300, z: -230, w: 160, d: 60 }],
  core: [{ x: -190, z: 20, w: 260, d: 260 }, { x: 200, z: 0, w: 260, d: 260 }],
  sources: [
    { id: 'link', type: 'market', name: 'National market link', tier: 'MV', x: -430, z: -180, w: 30, d: 20, port: { x: -400, z: -160 }, kw: 2000, running: true, dirX: -1 },
    { id: 'gas', type: 'gas', name: 'Riverport gas plant', tier: 'MV', x: -390, z: 120, w: 26, d: 18, port: { x: -362, z: 100 }, kw: 2500 },
    { id: 'windE', type: 'wind', name: 'Ostra wind farm', tier: 'MV', x: 400, z: 200, w: 60, d: 90, port: { x: 370, z: 150 }, kw: 3000, turbines: 4 },
    { id: 'solarE', type: 'solar', name: 'Ostra solar park', tier: 'MV', x: 380, z: -200, w: 100, d: 50, port: { x: 360, z: -170 }, kw: 1500 },
  ],
  sites: [
    { id: 'windN', name: 'Riverport hills wind site', desc: 'Windy hills west of Riverport', x: -300, z: -235, w: 160, d: 40, tier: 'MV', port: { x: -300, z: -200 }, turbines: 4, options: [{ type: 'wind', kw: 3000, cost: 20000, note: 'Four turbines on the hills. Strong wind at night, just when the market price is low and demand is low: perfect for exports and charging.' }] },
    { id: 'batt', name: 'Ostra battery site', desc: 'Beside the river', x: 60, z: 120, w: 40, d: 16, tier: 'MV', port: { x: 60, z: 100 }, options: [{ type: 'battery', kw: 2000, kwh: 8000, cost: 16000, note: 'Put it on Trade to buy power when it is cheap and sell it when it is dear.' }] },
    { id: 'link2', name: 'Ostra market link site', desc: 'A second connection to the market on the east border', x: 440, z: -60, w: 30, d: 20, tier: 'MV', port: { x: 420, z: -60 }, options: [{ type: 'market', kw: 2000, cost: 15000, note: 'Another 2 MW to buy and sell on the market.' }] },
  ],
  depot: { id: 'depot', x: 60, z: -100, w: 18, d: 12 },
  townCenterZ: 0,
  decor: [
    { kind: 'city', x: -620, z: -100, w: 150, d: 300, top: -12 },
    { kind: 'city', x: 620, z: 100, w: 150, d: 300, top: -12 },
  ],
  customers: [
    // Riverport (west bank)
    apt('a1', 'Harbour Heights', -230, -60), apt('a2', 'Quayside Court', -130, -60), apt('a3', 'Bridge View', -230, 60), apt('a4', 'Old Mill Flats', -130, 60),
    { id: 'li1', type: 'lowincome', name: 'Dockers’ terraces', x: -300, z: 140, w: 16, d: 9, scale: 30 },
    { id: 'hospital', type: 'hospital', name: 'Riverport Hospital', x: -120, z: 140, w: 26, d: 18 },
    tower('t1', 'Riverport Exchange', -160, -150, 'EXCHANGE'),
    // Ostra (east bank)
    tower('t2', 'Ostra Tower', 140, -60, 'OSTRA'), tower('t3', 'Bank Tower', 220, -60),
    street('s1', 'Ostra garden streets', 140, 60), street('s2', 'Linden streets', 220, 60),
    { id: 'school', type: 'school', name: 'Ostra Academy', x: 300, z: 60, w: 24, d: 12 },
    { id: 'factory', type: 'factory', name: 'Ostra cable works', x: 300, z: -140, w: 40, d: 28, label: 'CABLES' },
    // surprise: a new riverside market hall (some runs)
    { id: 'hall', type: 'shop', name: 'Riverside market hall (new)', x: 60, z: 160, w: 14, d: 10, label: 'MARKET', surprise: 'hall' },
  ],
};

// ------------------------------------------------------------------ the market
// Hourly wholesale price (¢/kWh): cheap at night, a dip at noon when solar floods the market,
// dear at the evening peak. Each day is a little different (seeded), and spikes come from events.
const BASE = [0.09, 0.08, 0.08, 0.08, 0.09, 0.12, 0.18, 0.24, 0.24, 0.2, 0.17, 0.14, 0.12, 0.12, 0.14, 0.18, 0.26, 0.38, 0.46, 0.48, 0.42, 0.32, 0.2, 0.13];
export function priceAt(clock, seed = 1) {
  const h = Math.floor((clock % 1440) / 60);
  const d = Math.floor(clock / 1440) + 1;
  const k = 0.9 + (parseInt(fnv(`price:${d}:${seed % 97}`), 16) % 1000) / 4000;
  return Math.round(BASE[h] * k * 1000) / 1000;
}

const apartment = (h) => (h >= 18 && h <= 22 ? 2.2 : h >= 7 && h <= 8 ? 1.3 : h >= 9 && h <= 17 ? 0.6 : 0.35);
export const BAL9 = {
  ...BALANCE,
  start: { credits: 90000, poles: 120, transformers: 4, cable: 6000, kits: 4, fuel: 0 },
  startClockMin: 6 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1500, drop: 50, maintain: 400, repairLabour: 700, dailyOverhead: 5000 },
  procurement: { ...BALANCE.procurement, kits: { qty: 1, cost: 700, leadH: 6 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 30000, MV: 5000, LV: 1000 }, dropReach: 26, mvDropReach: 36 },
  transformer: { ...BALANCE.transformer, ratingKW: 1500 },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  market: priceAt,
  tradeBuyBelow: 0.12,
  tradeSellAbove: 0.3,
  sourceTypes: {
    market: { dispatch: true, market: true, rampH: 0, maxKW: 2000, exportMaxKW: 2000, exportShare: 0.9, co2: 0.4 },
    gas: { dispatch: true, rampH: 0.1, maxKW: 2500, costPerKWh: 0.24, co2: 0.45, wearPerRunHour: 0.1 },
    wind: { variable: 'wind', renewable: true, co2: 0 },
    solar: { variable: 'solar', renewable: true, co2: 0 },
    battery: { storage: true, storageClean: true, kwh: 8000, eff: 0.9, co2: 0 },
  },
  dispatchOrder: ['battery', 'market', 'gas'],
  types: {
    apartment: { label: 'Apartment block', cls: 'home', nominal: 80, priority: 1, profile: apartment },
    lowincome: { label: 'Terraces (low-income)', cls: 'lowincome', nominal: 2, priority: 1, profile: apartment, dailyKWh: 2 * (8 * 0.35 + 2 * 1.3 + 9 * 0.6 + 5 * 2.2) / 30 },
    home: { label: 'Streets of homes', cls: 'home', nominal: 1, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.5 : h >= 7 && h <= 8 ? 1.4 : h >= 9 && h <= 17 ? 0.5 : 0.3) },
    tower: { label: 'Office tower (11 kV)', cls: 'business', nominal: 300, priority: 1, profile: (h) => (h >= 8 && h <= 18 ? 1.0 : 0.2) },
    hospital: { label: 'Hospital', cls: 'public', nominal: 250, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 80, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
    factory: { label: 'Cable works (11 kV)', cls: 'industry', nominal: 450, priority: 1, profile: (h) => (h >= 6 && h <= 22 ? 1.0 : 0.3) },
    shop: { label: 'Market hall', cls: 'business', nominal: 60, priority: 1, profile: (h) => (h >= 7 && h <= 20 ? 1.0 : 0.1) },
  },
  tariffs: { lowincome: { base: 0.3, min: 0.2, max: 0.5 }, home: { base: 0.42, min: 0.3, max: 0.6 }, business: { base: 0.5, min: 0.35, max: 0.8 }, industry: { base: 0.42, min: 0.3, max: 0.6 }, public: { base: 0.3, min: 0.2, max: 0.45 } },
  income: { lowincome: 70 },
  afford: { limitPct: 6 },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 4, bankruptGraceH: 6, deadlineDay: 7, debtLimit: -40000 },
};

const W9 = {
  1: { wind: 9, cloud: 0.3, label: 'Breezy' },
  2: { wind: 11, cloud: 0.4, label: 'Windy' },
  3: { wind: 7, cloud: 0.2, label: 'Sunny, lighter wind' },
  4: { wind: 12, cloud: 0.5, label: 'Strong wind' },
  5: { wind: 10, cloud: 0.3, label: 'Windy' },
  6: { wind: 8, cloud: 0.25, label: 'Fair' },
  7: { wind: 9, cloud: 0.3, label: 'Breezy' },
};

const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;
const SELL_GOAL = 12000;
const TRADE_GOAL = 1500;
const links = (st) => Object.values(st.gens).filter((g) => g.type === 'market');

const objectives = [
  {
    id: 'sell',
    primary: true,
    bar: true,
    unit: '¢',
    label: `Sell ${SELL_GOAL.toLocaleString('en-US')} ¢ of power on the market`,
    eval: (st) => ({ done: (st.stats.tradeSell || 0) >= SELL_GOAL, progress: [Math.floor((st.stats.tradeSell || 0) / 1000) * 1000, SELL_GOAL] }),
    guide: (st, bal) => ({
      title: `Sell ${SELL_GOAL.toLocaleString('en-US')} ¢ of power on the market`,
      why: 'When your wind and sun make more than the twin cities need, the market link sells the rest abroad at that hour’s price. Instead of wasting it, you earn from it.',
      steps: [`Build the Riverport hills wind site (${k('G')}) and connect it at 11 kV.`, 'Surplus goes to the market automatically, up to each link’s capacity.', 'Night wind sells cheaply, evening surplus sells dear.'],
      now: [info(`Sold so far: ${fmt.cr(st.stats.tradeSell || 0)}`), info(`Price now: ${(marketPrice(st, bal || BAL9) ?? 0).toFixed(2)} ¢/kWh`), info(`Selling now: ${fmt.kw(links(st).reduce((a, g) => a + (g.exportKW || 0), 0))}`)],
      focus: { x: 0, z: 0, sel: { kind: 'mix' } },
      focusLabel: 'Open Supply',
    }),
  },
  {
    id: 'arb',
    primary: true,
    label: `Earn ${TRADE_GOAL.toLocaleString('en-US')} ¢ trading with the battery`,
    eval: (st) => ({ done: (st.flags.arbBest || 0) >= TRADE_GOAL }),
    guide: (st) => ({
      title: `Earn ${TRADE_GOAL.toLocaleString('en-US')} ¢ trading with the battery`,
      why: 'Prices swing from under 0.10 ¢ at night to nearly 0.50 ¢ at the evening peak. A battery that buys when power is cheap and sells when it is dear earns the difference, and helps the grid when it needs it most.',
      steps: ['Build the Ostra battery and connect it.', 'Click it and set its mode to <b>Trade</b>: it buys below 0.12 ¢ and sells above 0.30 ¢.', 'Profit is counted over each day: value of what it sold minus the cost of what it bought.'],
      now: [st.gens.batt ? (st.gens.batt.mode === 'trade' ? ok('Battery is trading') : warn(`Battery mode: ${st.gens.batt.mode}`)) : todo('No battery yet'), info(`Today’s trading profit: ${fmt.cr(st.flags.arbToday || 0)} · best day ${fmt.cr(st.flags.arbBest || 0)}`)],
      focus: st.gens.batt ? { x: 60, z: 120, sel: { kind: 'gen', id: 'batt' } } : { x: 60, z: 120, sel: { kind: 'site', id: 'batt' } },
      focusLabel: 'Show the battery',
    }),
  },
  {
    id: 'link2',
    primary: true,
    label: 'Open a second market link',
    eval: (st) => ({ done: !!st.gens.link2 && !!st.nodes.link2?.connected }),
    guide: (st) => ({
      title: 'Open a second market link',
      why: 'One link can carry 2 MW. On windy nights it fills up and the rest of your wind is wasted, while the price abroad stays low because so little gets through. That is congestion.',
      steps: [`Build the Ostra market link (${k('G')}) on the east border.`, 'Connect it to Ostra’s 11 kV network.'],
      now: [st.gens.link2 ? (st.nodes.link2?.connected ? ok('Two links open: 4 MW of trading') : warn('Built but not connected')) : todo(`One link: ${fmt.kw(links(st).reduce((a, g) => a + (g.exportKW || 0), 0))} going out now`), (st.flow.curtailedKW || 0) > 50 ? warn(`Wasted right now: ${fmt.kw(st.flow.curtailedKW)}`) : null].filter(Boolean),
      focus: { x: 440, z: -60, sel: { kind: 'site', id: 'link2' } },
      focusLabel: 'Show the site',
    }),
  },
  {
    id: 'rel',
    primary: true,
    live: true,
    label: 'Keep reliability at 99.5% or better (last 48 h)',
    eval: (st) => ({ done: st.clock >= day(3, 0) && rollingRel(st).pct >= 99.5 }),
    guide: (st) => {
      const r = rollingRel(st).pct;
      return {
        title: 'Keep reliability at 99.5% or better (last 48 h)',
        why: 'Trading is good business, but the cities come first. Don’t sell what your own customers need, and keep enough supply for the evening peak and for price spikes.',
        steps: ['Keep the gas plant ready as a backup.', 'The battery sells only when the price is high, which is also when your own peak is.'],
        now: [r >= 99.5 ? ok(`Reliability ${r.toFixed(2)}%`) : warn(`Reliability ${r.toFixed(2)}%`), st.clock < day(3, 0) ? info('Checked from day 3') : null].filter(Boolean),
        focus: null,
      };
    },
  },
  {
    id: 'spike',
    primary: false,
    label: 'Optional · Buy nothing from abroad during a price spike',
    eval: (st) => ({ done: !!st.flags.spikeOk }),
    guide: (st) => ({
      title: 'Optional · Buy nothing from abroad during a price spike',
      why: 'When a heat wave abroad sends prices sky-high, buying even a little is very expensive.',
      steps: ['When a spike is announced, start the gas plant and fill the battery.', 'Move the market to the bottom of the generation order for the spike.'],
      now: [st.flags.spikeOk ? ok('Dodged a spike') : info('No spike dodged yet')],
      focus: null,
    }),
  },
];

// ------------------------------------------------------------------ pre-built twin-city network
const PREBUILT = [
  // Riverport: market link and gas plant feed the west 11 kV bus
  { type: 'line', from: 'link', to: { x: -330, z: -110 } },
  { type: 'line', from: '@last', to: { x: -200, z: -110 } },
  { type: 'line', from: '@node:-200,-110', to: { x: -200, z: -20 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-200,-20', tier: 'up', to: { x: -200, z: 40 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-200,40', tier: 'up', to: { x: -210, z: 110 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: 'gas', to: { x: -280, z: 90 } },
  { type: 'line', from: '@last', to: '@node:-210,110' },
  { type: 'line', from: '@node:-200,-20', to: { x: -230, z: -38 } },
  { type: 'line', from: '@node:-200,-20', to: { x: -130, z: -38 } },
  { type: 'line', from: '@node:-200,40', to: { x: -230, z: 44 } },
  { type: 'line', from: '@node:-200,40', to: { x: -130, z: 44 } },
  { type: 'line', from: '@node:-210,110', to: { x: -140, z: 122 } },
  { type: 'line', from: '@node:-210,110', to: { x: -280, z: 128 } },
  // the bridge line to Ostra
  { type: 'line', from: '@node:-200,-110', to: { x: -60, z: -110 } },
  { type: 'line', from: '@last', to: { x: 60, z: -110 } },
  { type: 'line', from: '@last', to: { x: 140, z: -90 } },
  { type: 'line', from: '@last', to: { x: 220, z: -90 } },
  { type: 'line', from: '@last', to: { x: 270, z: -112 } },
  // Ostra homes and school
  { type: 'line', from: '@node:140,-90', to: { x: 200, z: 20 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:200,20', to: { x: 140, z: 40 } },
  { type: 'line', from: '@node:200,20', to: { x: 220, z: 40 } },
  { type: 'line', from: '@last', to: { x: 285, z: 45 } },
  { type: 'line', from: 'windE', to: { x: 300, z: 110 } },
  { type: 'line', from: '@last', to: '@node:200,20' },
  { type: 'line', from: 'solarE', to: { x: 250, z: -165 } },
  { type: 'line', from: '@last', to: '@node:270,-112' },
  ...MAP9.customers.filter((c) => !c.surprise).map((c) => ({ type: 'drop', building: c.id })),
];

// ------------------------------------------------------------------ director
function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D;
  const price = marketPrice(state, api.bal);
  // battery trading profit, day by day
  const b = state.gens.batt;
  if (b) {
    if (hm === 0) F.arbToday = 0;
    F.arbToday = (F.arbToday || 0) + ((b.outKW || 0) / 60) * price - ((b.chargeKW || 0) / 60) * price;
    F.arbBest = Math.max(F.arbBest || 0, F.arbToday);
    if (F.arbBest >= TRADE_GOAL && !F.arbAnnounced) {
      F.arbAnnounced = true;
      api.emit('arbDone');
    }
  }
  // congestion: the links are full and wind is being wasted
  const exp = links(state).reduce((a, g) => a + (g.exportKW || 0), 0);
  const cap = links(state).reduce((a, g) => a + (api.bal.sourceTypes.market.exportMaxKW ?? 2000), 0);
  if (exp >= cap - 1 && (state.flow.curtailedKW || 0) > 200 && !F.congestionWarned) {
    F.congestionWarned = true;
    api.emit('congestion', { wasted: state.flow.curtailedKW });
  }
  // a spike passed without buying anything
  for (const d of state.ev?.deck || []) if (d.kind === 'priceSpike' && d.phase === 'done' && d.bought != null && d.bought < 50) F.spikeOk = true;
  if (hm === 7 * 60 && Math.floor(state.clock / D) === 0) api.emit('marketIntro');
}

function score(state) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  const reliability = Math.max(0, Math.min(25, (r - 97) * 8.33));
  const trade = Math.min(25, ((s.tradeSell || 0) / (SELL_GOAL * 1.5)) * 25);
  const arb = Math.min(10, ((state.flags.arbBest || 0) / TRADE_GOAL) * 10);
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(15, 6 + net / 8000));
  const fair = state.affordPct <= 5 ? 15 : state.affordPct <= 6 ? 10 : 0;
  const parts = { reliability: Math.round(reliability), trade: Math.round(trade), arb: Math.round(arb), finance: Math.round(finance), fair };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['reliability', 'Reliability', 25], ['trade', 'Market sales', 25], ['arb', 'Battery trading', 10], ['finance', 'Finance', 15], ['fair', 'Fairness', 15]] };
}

function metrics(state) {
  const s = state.stats;
  const r = s.custMinTotal ? (s.custMinPowered / s.custMinTotal) * 100 : 100;
  return {
    powered: state.flow.powered,
    total: state.flow.activeCount ?? state.map.customers.length,
    decisions: { wind: !!state.gens.windN, battery: !!state.gens.batt, link2: !!state.gens.link2, spike: !!state.flags.spikeOk },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.flow.activeCount ?? state.map.customers.length}`],
      ['Reliability', `${r.toFixed(2)}%`],
      ['Sold on the market', fmt.cr(s.tradeSell || 0)],
      ['Best day of battery trading', fmt.cr(state.flags.arbBest || 0)],
      ['Market links', `${links(state).length}`],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
      ['Low-income bill share', `${(state.affordPct || 0).toFixed(1)}%`],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN9 = {
  market: { title: 'An electricity market', what: 'The twin cities are linked to the national market, where the price changes every hour.', why: 'Power is cheap at night when few people need it, cheaper at noon when solar floods the market, and dear at the evening peak. You buy at the hour’s price when you import, and sell at it when you export.', todo: ['Surplus wind and sun sells abroad automatically.', 'Put gas below the market in the order when the market is cheaper, and above it at the peak.', 'A battery on Trade buys cheap and sells dear.'], real: 'Most of Europe trades electricity hour by hour (and now every 15 minutes) across borders.' },
  congestion: { title: 'Congestion', what: 'The market link is full and wind is being wasted.', why: 'A link can only carry so much. When it is full, the extra power can’t get out, so it is switched off, and on the far side the price stays high because so little arrives.', todo: ['Open a second link to the market.', 'Store the surplus in the battery and sell it later.'], real: 'Price differences between countries are often caused by full interconnectors, which is why new ones are built.' },
  trade: { title: 'Trading with a battery', what: 'Your battery is trading on the market.', why: 'Buying at 0.08 ¢ and selling at 0.45 ¢ is a big margin, even after losing 10% in the battery. And the battery delivers power exactly when the grid needs it most.', todo: ['Leave it on Trade overnight and through the evening.', 'Switch it to Auto if your own customers need it.'], real: 'Grid batteries earn much of their income from this kind of trading, called arbitrage.' },
  spike: { title: 'A price spike is coming', what: 'A heat wave abroad will send market prices up three times for a few hours.', why: 'Every kWh you import during the spike is very expensive.', todo: ['Start the gas plant and fill the battery before it starts.', 'Put the market last in the generation order until it passes.'], real: 'Price spikes reward utilities that keep flexible supply and storage on hand.' },
};

const LINES9 = {
  ...L1,
  intro: [['advisor', 'Welcome to the twin cities: Riverport on the west bank and Ostra on the east.'], ['daniel', 'We are connected to the national market. The price changes every hour, and that is an opportunity.']],
  marketIntro: [['daniel', 'Look at the Supply panel: the market price is low now, and it will nearly triple this evening.']],
  congestion: [['sofia', 'The market link is full and our wind is being wasted. We need a second link.']],
  arbDone: [['daniel', 'The battery bought cheap and sold dear all day. That is a tidy profit.']],
  tutorialDone: [['advisor', 'Two cities, one market. Trade wisely, and keep the lights on.']],
};

const TUT9 = [
  { id: 'mix', title: 'Prices change every hour', body: 'Click the Supply chip to see the market price and what you are buying or selling right now.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
  { id: 'wind', title: 'More wind to sell', body: 'Press G and build the Riverport hills wind site, then connect it to the west 11 kV network.', target: { world: 'site', id: 'windN' }, done: (st) => !!st.gens.windN && !!st.nodes.windN?.connected },
  { id: 'batt', title: 'A trading battery', body: 'Build the Ostra battery and connect it. Then click it and set its mode to Trade.', target: { world: 'site', id: 'batt' }, done: (st) => st.gens.batt?.mode === 'trade' },
  { id: 'link2', title: 'A second link', body: 'Build the Ostra market link on the east border so more power can be bought and sold.', target: { world: 'site', id: 'link2' }, done: (st) => !!st.gens.link2 && !!st.nodes.link2?.connected },
];

const ENDING9 = {
  common: ['On windy nights the twin cities sell their surplus across the border; at the evening peak the battery sells it back dear.', 'The market made clean power pay for itself.'],
  sustainable: 'A reliable, fair and profitable grid that other cities now trade with.',
  reliable: 'Both cities kept their lights on through every price swing.',
  hardwon: 'The market was rough at times, but the twin cities came through.',
  decisions: { wind: 'The hills wind farm became the cities’ export earner.', battery: 'The battery bought cheap and sold dear.', link2: 'A second link ended the congestion.', spike: 'A price spike passed without a single expensive import.' },
  next: 'Next: the supergrid that joins every region you have built.',
};

const ui = {
  tutorial: TUT9,
  lines: LINES9,
  learn: LEARN9,
  ending: ENDING9,
  endTitle: 'The twin cities trade clean power',
  demandNote: 'Apartments and homes peak in the evening, towers by day, the cable works on two shifts and the hospital around the clock.',
  briefing: {
    text: '<b>Riverport</b> and <b>Ostra</b> face each other across a river. Ostra has wind and sun; Riverport has a gas plant and a link to the national <b>electricity market</b>, where the price changes every hour. Sell your surplus, <b>trade with a battery</b>, ease <b>congestion</b> on the link, and keep both cities reliable.',
    goals: [`Sell ${SELL_GOAL.toLocaleString('en-US')} ¢ of power on the market`, `Earn ${TRADE_GOAL.toLocaleString('en-US')} ¢ in a day trading with the battery`, 'Open a second market link', 'Reliability ≥ 99.5% over the last 48 hours'],
    newSystems: ['<b>Hourly market prices</b>: buying and selling', '<b>Battery trading</b> (arbitrage)', '<b>Congestion</b> on a full link', '<b>Price spikes</b>'],
  },
  failCause: { clinic: { title: 'Riverport Hospital lost power too long', body: 'The hospital was dark for 4 hours.', tip: 'Never sell what your own customers need: keep the gas plant ready.' } },
  handles: ['marketIntro', 'congestion', 'arbDone'],
  onEvent(e, u) {
    switch (e.type) {
      case 'marketIntro':
        u.say('marketIntro');
        u.learnOnce('market');
        break;
      case 'congestion':
        u.audio.play('warn');
        u.say('congestion');
        u.hud.alert({ id: 'cong', level: 'warn', title: 'The market link is full', text: `${fmt.kw(e.wasted)} of clean power is being wasted because the link can’t carry any more. Build a second link, or store it in the battery.`, actions: [{ label: 'Show the site', primary: true, fn: () => u.focus({ kind: 'site', id: 'link2' }) }], ttl: 15000 });
        u.learnOnce('congestion');
        break;
      case 'arbDone':
        u.audio.play('objective');
        u.say('arbDone');
        u.learnOnce('trade');
        break;
    }
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF9 = [
  { type: 'inspect', target: 'mix' },
  { type: 'build', site: 'windN', option: 'wind' },
  { type: 'line', from: 'windN', to: { x: -260, z: -150 } },
  { type: 'line', from: '@last', to: '@node:-200,-110' },
  { type: 'build', site: 'batt', option: 'battery' },
  { type: 'line', from: 'batt', to: { x: 120, z: 40 } },
  { type: 'line', from: '@last', to: '@node:200,20' },
  { type: 'battery', target: 'batt', mode: 'trade' },
  { type: 'build', site: 'link2', option: 'market' },
  { type: 'line', from: 'link2', to: { x: 340, z: -80 } },
  { type: 'line', from: '@last', to: '@node:270,-112' },
  { type: 'startGen', target: 'gas' },
  { type: 'dispatchOrder', order: ['battery', 'market', 'gas'] },
];

export default {
  id: MAP9.id,
  n: 9,
  key: 'stage9',
  stageName: 'Stage 9 · Power Market',
  name: 'Twin Cities',
  region: 'Twin Cities',
  blurb: 'Two cities across a river, linked to a market where the price changes every hour. Sell your surplus, trade with a battery and beat the congestion.',
  learns: ['Hourly electricity prices', 'Selling surplus abroad', 'Battery trading (arbitrage)', 'Congestion and price spikes'],
  map: MAP9,
  bal: BAL9,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'mix', 'renew', 'weather', 'powered', 'afford'],
  objectives,
  weather: W9,
  cast: { mayor: { name: 'Pieter Vos', role: 'Mayor of Riverport', color: '#b48cf2', initials: 'PV' }, leila: { name: 'Ana Kovač', role: 'Reporter, Ostra Daily', color: '#f2d15c', initials: 'AK' }, nana: { name: 'Grandpa Emil', role: 'Retired ferryman', color: '#d9b38c', initials: 'GE' } },
  quests: {
    perDay: [1, 2],
    pool: [
      { key: 'trading', who: 'maya', title: 'A clean day', text: 'Make at least 60% of today’s electricity from wind and sun.', goal: { type: 'renewShare', pct: 60 }, reward: { credits: 2000, rep: 2 } },
      { key: 'hospital', who: 'maya', title: 'A busy day at the hospital', text: 'Riverport Hospital has a full list. Keep it lit from 08:00 to 20:00.', goal: { type: 'keepLit', ids: ['hospital'], fromH: 8, toH: 20 }, reward: { credits: 1500, rep: 4 } },
      { key: 'shift', who: 'tom', title: 'Night shift at the cable works', text: 'Keep the cable works running from 14:00 to 22:00 for a big order.', goal: { type: 'keepLit', ids: ['factory'], fromH: 14, toH: 22 }, reward: { credits: 1800, rep: 2 } },
      { key: 'charged', who: 'sofia', title: 'Battery ready for the peak', text: 'Have the battery at 80% by 17:00, ready to sell at the evening price.', goal: { type: 'socAt', pct: 80, hour: 17 }, reward: { credits: 1500, rep: 2 } },
      { key: 'noCuts', who: 'maya', title: 'An evening without cuts', text: 'No one switched off between 17:00 and 22:00, please.', goal: { type: 'noShed', fromH: 17, toH: 22 }, reward: { credits: 1500, rep: 2 } },
    ],
  },
  story: [
    { day: 1, hour: 9, who: 'mayor', lines: ['Riverport and Ostra used to argue about everything, even the bridge. Now we share a grid.'] },
    { day: 2, hour: 14, who: 'leila', title: '“Is Ostra selling our wind abroad?”', text: 'Some Ostra residents say their wind should power their homes first, not earn money across the border.', options: [{ label: 'Share the profits with Ostra · 1,500 ¢', cost: 1500, rep: 5, trust: 3, note: 'A community fund for Ostra’s streets.', news: 'Ostra gets a share of the wind profits.' }, { label: 'Explain how the market works', rep: 2, news: 'Utility explains: exports only use spare wind.' }] },
    { day: 3, hour: 10, who: 'nana', lines: ['I ferried people across this river for forty years. Now the electricity crosses it faster than I ever did.'] },
    { day: 4, hour: 16, who: 'daniel', title: 'A trader wants a fixed price', text: 'A big buyer abroad offers a fixed 0.20 ¢ for all your night wind for the week. Safe, but you might miss higher prices.', options: [{ label: 'Take the deal · +2,000 ¢ now', gain: 2000, rep: 1, note: 'Money in the bank.', news: 'Twin cities sign a wind supply deal abroad.' }, { label: 'Stay on the open market', rep: 0 }] },
    { day: 5, hour: 12, who: 'mayor', lines: ['Even Ostra’s mayor agreed with me today. That has never happened before.'] },
  ],
  events: {
    count: [7, 9],
    minGapH: 6,
    pool: [
      { key: 'spike', kind: 'priceSpike', weight: 3, windowH: [30, 150], atHour: 17, warnH: 12, durH: 4, params: { mult: 3 } },
      { key: 'spike2', kind: 'priceSpike', weight: 1, windowH: [30, 150], atHour: 17, warnH: 12, durH: 4, params: { mult: 2.5 } },
      { key: 'heat', kind: 'heat', weight: 1, windowH: [30, 150], atHour: 13, warnH: 14, durH: 6, params: { mult: 1.15, startH: 13, cls: ['home', 'lowincome', 'business'] } },
      { key: 'storm', kind: 'storm', weight: 1, windowH: [10, 150], warnH: 3, durH: 2, params: { p: 0.15, max: 2 } },
      { key: 'linkTrip', kind: 'blackout', weight: 1, windowH: [30, 150], warnH: 2, durH: 2, params: { targets: ['link'] } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [10, 150], warnH: 3 },
      { key: 'riverFest', kind: 'festival', weight: 2, windowH: [30, 150], atHour: 18, warnH: 18, durH: 5, params: { name: 'The river festival', text: 'Both cities hold a festival on the bridge and the quays, with fireworks over the water.', ids: ['a1', 'a2', 'a3', 'a4', 's1', 's2'], mult: 1.3, startH: 18, at: { x: 0, z: 30 }, goodNews: 'Fireworks over a brightly lit river.', badNews: 'Power cut dims the river festival.' } },
      { key: 'hall', kind: 'arrivals', weight: 2, windowH: [30, 120], warnH: 8, durH: 12, params: { group: 'hall', at: { x: 60, z: 160 }, title: 'A riverside market hall is opening', text: 'A new market hall is opening on the Ostra quay.', goodNews: 'Riverside market hall opens to crowds.', badNews: 'New market hall still waiting for power.' } },
      { key: 'cyber', kind: 'cyberAlert', weight: 1, windowH: [30, 150], warnH: 6, params: { cost: 1500 } },
      { key: 'minister', kind: 'vipVisit', weight: 1, windowH: [30, 150], atHour: 11, warnH: 14, durH: 3, params: { name: 'The trade minister', who: 'mayor', zone: { x: 180, z: -60, r: 80 }, grant: 3000, text: 'The trade minister is visiting Ostra’s business district to talk about cross-border power trading.', goodNews: 'Trade minister praises the twin cities’ power deals.', badNews: 'Blackout embarrasses the trade minister’s visit.' } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [10, 150], warnH: 10, params: { grant: 2500 } },
      { key: 'theft', kind: 'theft', weight: 1, windowH: [10, 150], warnH: 6, params: { area: 'the docks', cost: 800 } },
    ],
    protests: { hvNearHomes: 25, compensation: 3000, outages: 5, credit: 2500 },
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
    runSteps(sim.cmd, sim.state, REF9);
  },
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF9);
    for (let i = 0; i < 7 * D && !sim.state.result; i++) {
      sim.tick();
      for (const e of drainAndRespond(sim)) {
        // dodge price spikes: gas first, the market last, until it passes
        if (e.type === 'evHit' && e.kind === 'priceSpike') sim.cmd({ type: 'dispatchOrder', order: ['battery', 'gas', 'market'] });
        if (e.type === 'evEnd' && e.kind === 'priceSpike') sim.cmd({ type: 'dispatchOrder', order: ['battery', 'market', 'gas'] });
      }
    }
  },
  ui,
  camera: { x: 0, z: 0, dist: 640 },
  ending: { x: 0, z: 0, dist: 360, outDist: 980, outDX: 0, outDZ: 0 },
};
