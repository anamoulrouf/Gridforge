// Stage 3 · Industrial Revolution — "The Ironvale Corridor" (GDD §6 Stage 3, §7.3 transmission,
// §8.5 contracts). Bulk power must travel ~800 m from the coal station to an industrial park:
// 11 kV can't carry megawatts, so the player builds 66 kV towers and a substation, signs and keeps
// an industrial supply contract, manages an inflexible coal unit with a gas peaker, and finds
// hidden wear in an inherited substation before it fails.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { typeDef } from '../sim/power.js';
import { windowAvail, windowHours } from '../sim/economy.js';
import { runSteps } from '../sim/steps.js';
import { drainAndRespond } from '../sim/events.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;

// ------------------------------------------------------------------ map
const apt = (id, name, x, z) => ({ id, type: 'apartment', name, x, z, w: 18, d: 14, floors: 4 });
export const MAP3 = {
  id: 'stage3-ironvale',
  bounds: { minX: -520, maxX: 520, minZ: -200, maxZ: 200 },
  tile: { cx: 0, cz: 0, hw: 560, hd: 245, radius: 60 },
  mvTypes: ['mill', 'factory', 'warehouse'],
  roads: [
    { id: 'main', x: 0, z: 0, w: 1100, d: 9, lanes: true },
    { id: 'town1', x: -40, z: 10, w: 7, d: 200, lanes: true },
    { id: 'town2', x: 70, z: -50, w: 7, d: 100, lanes: true },
    { id: 'park', x: 380, z: 0, w: 8, d: 300, lanes: true },
    { id: 'coalyard', x: -430, z: -22, w: 8, d: 36 },
    { id: 'depot', x: 180, z: -32, w: 8, d: 56 },
  ],
  crossings: [[-40, -8, false], [-40, 8, false], [70, -8, false], [380, -8.5, false], [380, 8.5, false]],
  lampRoads: ['town1', 'town2', 'park'],
  clear: [{ x: -230, z: -20, w: 420, d: 70 }, { x: 160, z: -20, w: 300, d: 60 }],
  core: [{ x: 10, z: 10, w: 240, d: 220 }, { x: 390, z: 0, w: 220, d: 300 }],
  hills: [{ x: -200, z: 150, r: 70, h: 14, squash: 0.6 }, { x: 180, z: 160, r: 60, h: 10, squash: 0.6 }],
  sources: [{ id: 'coal', type: 'coal', name: 'Ironvale coal station', tier: 'HV', x: -470, z: -100, w: 80, d: 70, port: { x: -422, z: -42 }, kw: 4000, running: true }],
  sites: [{ id: 'peaker', name: 'Gas peaker site', desc: 'Pipeline plot beside the industrial park', x: 458, z: 150, w: 40, d: 26, tier: 'HV', port: { x: 430, z: 128 }, options: [{ type: 'gas', kw: 2000, cost: 9000, note: 'Starts in minutes but costs a lot (0.22 ¢/kWh), so run it only for peaks. 0.5 kg CO₂/kWh.' }] }],
  depot: { id: 'depot', x: 180, z: -66, w: 18, d: 12 },
  townCenterZ: 0,
  decor: [
    { kind: 'town', x: 0, z: -420, w: 220, d: 150, top: -10 },
    { kind: 'windfarm', x: 700, z: 0, w: 120, d: 300, top: -10 },
    { kind: 'port', x: 300, z: 400, w: 240, d: 110, top: -12 },
    { kind: 'farm', x: -330, z: 380, w: 210, d: 100, top: -9 },
  ],
  customers: [
    apt('a1', 'Foundry Terrace', -75, -35), apt('a2', 'Station Flats', -5, -35), apt('a3', 'Canal Flats', -75, -75), apt('a4', 'Forge Court', -5, -75), apt('a5', 'Rail View', -75, 40), apt('a6', 'Union Flats', -5, 40),
    { id: 'hospital', type: 'hospital', name: 'Ironvale Hospital', x: -75, z: 85, w: 26, d: 18 },
    { id: 'school', type: 'school', name: 'Ironvale School', x: -5, z: 85, w: 24, d: 12 },
    { id: 'sh1', type: 'shop', name: 'Corner shop', x: 45, z: -30, w: 10, d: 9, label: 'STORE' },
    { id: 'sh2', type: 'shop', name: 'Café', x: 45, z: -70, w: 10, d: 9, label: 'CAFÉ' },
    { id: 'o1', type: 'office', name: 'Ironvale Works HQ', x: 100, z: -30, w: 16, d: 14, floors: 5, label: 'IRONVALE' },
    { id: 'o2', type: 'office', name: 'Corridor Offices', x: 100, z: -75, w: 16, d: 14, floors: 4 },
    { id: 'mill', type: 'mill', name: 'Ironvale Steel', x: 315, z: -95, w: 60, d: 40, contract: 'mill', label: 'IRONVALE STEEL' },
    { id: 'factory', type: 'factory', name: 'Corridor Engineering', x: 450, z: -70, w: 40, d: 28, label: 'ENGINEERING' },
    { id: 'warehouse', type: 'warehouse', name: 'Logistics Hub', x: 450, z: 40, w: 44, d: 24, label: 'LOGISTICS' },
    // surprise: workers' housing for the mill (appears in some runs)
    { ...apt('w1', 'Millworkers’ Flats (new)', 45, 42), surprise: 'workers' },
    { ...apt('w2', 'Furnace Row Flats (new)', 105, 42), surprise: 'workers' },
  ],
};

// ------------------------------------------------------------------ balance
export const BAL3 = {
  ...BALANCE,
  start: { credits: 60000, poles: 30, transformers: 3, cable: 1200, kits: 3, fuel: 0, substations: 1 },
  startClockMin: 9 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1500, substation: 15000, drop: 50, maintain: 400, repairLabour: 600, dailyOverhead: 3000 },
  procurement: { ...BALANCE.procurement, transformer: { qty: 1, cost: 2500, leadH: 8 }, substation: { qty: 1, cost: 18000, leadH: 12 }, kits: { qty: 1, cost: 600, leadH: 6 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 30000, MV: 1500, LV: 300 }, dropReach: 22, mvDropReach: 30, lossPer100m: 0.02 },
  transformer: { ...BALANCE.transformer, ratingKW: 400 },
  substation: { ratingKW: 5000 },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  sourceTypes: {
    coal: { dispatch: true, rampH: 2, minFrac: 0.4, maxKW: 4000, costPerKWh: 0.06, co2: 0.95, wearPerRunHour: 0.05 },
    gas: { dispatch: true, rampH: 0.1, maxKW: 2000, costPerKWh: 0.22, co2: 0.5, wearPerRunHour: 0.1 },
  },
  dispatchOrder: ['coal', 'gas'],
  types: {
    apartment: { label: 'Apartment block', cls: 'home', nominal: 30, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.4 : h >= 7 && h <= 8 ? 1.3 : h >= 9 && h <= 17 ? 0.6 : 0.35) },
    hospital: { label: 'Hospital', cls: 'public', nominal: 120, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 40, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
    shop: { label: 'Shop', cls: 'business', nominal: 25, priority: 1, profile: (h) => (h >= 8 && h <= 19 ? 1.0 : 0.15) },
    office: { label: 'Office', cls: 'business', nominal: 60, priority: 1, profile: (h) => (h >= 8 && h <= 17 ? 1.0 : h === 18 ? 0.4 : 0.15) },
    mill: { label: 'Steel mill (11 kV)', cls: 'industry', nominal: 2000, priority: 1, profile: (h) => (h >= 22 || h <= 5 ? 0.85 : 1.0) },
    factory: { label: 'Factory (11 kV)', cls: 'industry', nominal: 800, priority: 1, profile: (h) => (h >= 6 && h <= 21 ? 1.0 : 0.3) },
    warehouse: { label: 'Warehouse (11 kV)', cls: 'industry', nominal: 300, priority: 1, profile: (h) => (h >= 6 && h <= 22 ? 0.8 : 0.5) },
  },
  tariffs: {
    home: { base: 0.4, min: 0.3, max: 0.6 },
    public: { base: 0.3, min: 0.2, max: 0.45 },
    business: { base: 0.5, min: 0.35, max: 0.8 },
    industry: { base: 0.42, min: 0.3, max: 0.6 },
  },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 6, bankruptGraceH: 6, deadlineDay: 6, debtLimit: -20000 },
};

const CONTRACTS = { mill: { tariff: 0.32, penaltyPerMin: 5, target: 98, windowH: 48, name: 'Ironvale Steel supply contract' } };
const INDUSTRY = ['mill', 'factory', 'warehouse'];
const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const S0 = (st) => Object.keys(st.nodes).find((id) => st.nodes[id].kind === 'xfmr' && st.nodes[id].ratio === 'HV/MV' && st.nodes[id].legacy);
const parkSub = (st) => Object.keys(st.nodes).find((id) => st.nodes[id].kind === 'xfmr' && st.nodes[id].ratio === 'HV/MV' && !st.nodes[id].legacy && st.nodes[id].x > 200);
const avail = (ct) => windowAvail(ct);
/** Best full 48 h window so far, or the running window before the first one completes. */
const bestAvail = (ct) => (ct?.best != null ? ct.best : windowAvail(ct));

function demandMod(state, c, kw, hour) {
  if (c.contract) {
    const ct = state.contracts[c.contract];
    if (!ct?.accepted) return 0; // the mill won't run without a firm supply contract
    if (state.flags.expansion === 'accepted' && state.clock >= day(2, 12)) return kw * 1.5;
  }
  void hour;
  return kw;
}

// ------------------------------------------------------------------ objectives
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;
const hvNear = (st) => Object.values(st.nodes).some((n) => (n.kind === 'pole' || n.kind === 'xfmr') && (n.tier === 'HV' || n.ratio === 'HV/MV') && n.x > 250 && n.connected);

const objectives = [
  {
    id: 'contract',
    primary: true,
    label: 'Sign the steel mill’s supply contract',
    eval: (st) => ({ done: !!st.contracts.mill.accepted }),
    guide: (st) => ({
      title: 'Sign the steel mill’s supply contract',
      why: 'Ironvale Steel will only run its furnaces with a firm supply: a lower tariff (0.32 ¢/kWh) for a huge, steady load, and a penalty for every minute it’s dark.',
      steps: ['Click <b>Ironvale Steel</b> in the industrial park (east).', 'Read the terms: keep the mill powered 98% of the time over 48 hours, or pay 5 ¢ for every minute it’s dark.', 'Press <b>Sign contract</b>. Penalties only start once the mill first gets power, so sign early.'],
      now: [st.contracts.mill.accepted ? ok('Signed') : todo('Not signed. The mill stays idle until you sign')],
      focus: { x: 315, z: -95, sel: { kind: 'building', id: 'mill' } },
      focusLabel: 'Show the steel mill',
    }),
  },
  {
    id: 'hv',
    primary: true,
    label: 'Build a 66 kV line to the industrial park',
    eval: (st) => ({ done: hvNear(st) }),
    guide: (st, bal) => ({
      title: 'Build a 66 kV line to the industrial park',
      why: 'The park needs over 3 MW. An 11 kV line can carry only 1.5 MW. It would overheat and switch off. At 66 kV the same conductors carry 20× the power with far lower losses.',
      steps: [`Press ${k('L')} and click the <b>coal station</b> (it outputs 66 kV).`, `Click east along the corridor. Towers go at least every ${bal.network.maxSpan.HV} m (${fmt.cr(bal.costs.pole.HV)} each + ${bal.costs.cablePerM.HV} ¢/m).`, 'Stop near the park road (x about 340), on the grass beside the mill.'],
      now: [hvNear(st) ? ok('66 kV reaches the park') : todo('Not there yet'), info(`Credits ${fmt.cr(st.credits)}`)],
      tip: 'Keep the route on the north verge of the main road to avoid buildings.',
      focus: { x: -422, z: -42, sel: { kind: 'gen', id: 'coal' } },
      focusLabel: 'Show the coal station',
    }),
  },
  {
    id: 'sub',
    primary: true,
    label: 'Build a substation at the park',
    eval: (st) => ({ done: !!parkSub(st) && st.nodes[parkSub(st)].energized }),
    guide: (st, bal) => ({
      title: 'Build a substation at the park',
      why: 'A substation turns 66 kV into 11 kV for local lines. It’s like a big pole transformer, built for 5 MW.',
      steps: [`Press ${k('B')} (Substation) and click your last 66 kV tower near the park.`, `It costs ${fmt.cr(bal.costs.substation)}. You have ${st.inv.substations} in stock.`, '11 kV lines drawn out of it feed the mill, factory and warehouse.'],
      now: [parkSub(st) ? (st.nodes[parkSub(st)].energized ? ok('Substation is live') : warn('Built but not live. Is the 66 kV line connected to the coal station?')) : todo('Not built')],
      focus: null,
    }),
  },
  {
    id: 'industry',
    primary: true,
    bar: true,
    label: 'Power the mill, factory and warehouse',
    eval: (st) => ({ done: INDUSTRY.every((id) => powered(st, id)), progress: [INDUSTRY.filter((id) => powered(st, id)).length, 3] }),
    guide: (st) => ({
      title: 'Power the mill, factory and warehouse',
      why: 'Factories connect straight to 11 kV (no pole transformer), from an 11 kV pole or the substation within 30 m.',
      steps: ['Put the park substation within 30 m of the steel mill.', `Connect the mill (${k('C')}) <b>straight to the substation</b>. At 2 MW it needs more than one 11 kV line can carry (1.5 MW).`, `Draw an 11 kV feeder (${k('L')}) out of the substation to the factory and warehouse, and connect them.`],
      now: INDUSTRY.map((id) => (powered(st, id) ? ok(`${st.map.customers.find((c) => c.id === id).name}: powered`) : todo(`${st.map.customers.find((c) => c.id === id).name}: ${st.cust[id].status}`))),
      focus: { x: 390, z: -20 },
      focusLabel: 'Show the park',
    }),
  },
  {
    id: 'clean',
    primary: true,
    unit: 'h',
    bar: true,
    label: '24 h with no overload trip after industry is on',
    eval: (st) => ({ done: (st.flags.cleanMin || 0) >= 1440, progress: [Math.floor((st.flags.cleanMin || 0) / 60), 24] }),
    guide: (st) => ({
      title: '24 h with no overload trip after industry is on',
      why: 'Congestion: every line, transformer and substation has a rating. Overloads trip protection and black out everyone downstream.',
      steps: ['Use the Capacity overlay (O) to spot red/amber assets.', 'Keep each 11 kV line under 1.5 MW. Split big loads across lines.', 'Make sure supply covers the peak (start the gas peaker if needed).'],
      now: [INDUSTRY.every((id) => powered(st, id)) ? info(`Clean for ${Math.floor((st.flags.cleanMin || 0) / 60)} h`) : todo('Starts once all industry is powered'), (st.stats.lineTrips || 0) + st.stats.trips ? warn(`Trips so far: ${st.stats.trips + (st.stats.lineTrips || 0)}`) : ok('No trips so far')],
      focus: null,
    }),
  },
  {
    id: 'avail',
    primary: true,
    label: 'Keep the mill at 98% power for 48 hours',
    eval: (st) => {
      const ct = st.contracts.mill;
      return { done: ct.accepted && (ct.best ?? 0) >= ct.target, progress: [windowHours(ct), ct.windowH] };
    },
    guide: (st) => {
      const ct = st.contracts.mill;
      return {
        title: 'Keep the mill at 98% power for 48 hours',
        why: 'If a steel mill loses power, the metal in its furnace can set solid. The contract pays well, but you pay a penalty for every minute the mill is dark.',
        steps: ['The clock starts when the mill first gets power, so building the line first costs you nothing.', 'Keep the mill on its own short supply from the park substation, inside its ratings.', 'Have a backup ready: the gas peaker for supply, and spare repair kits for faults.', 'Any 48 hours in a row count. If an outage drags the figure down, it recovers as that hour drops out of the window.'],
        now: [
          !ct.accepted ? todo('Contract not signed yet') : !st.cust.mill.everPowered ? todo('Waiting for the mill’s first power. The clock hasn’t started.') : avail(ct) >= ct.target ? ok(`Last ${windowHours(ct) || '<1'} h: ${avail(ct).toFixed(1)}% (you need ${ct.target}%)`) : warn(`Last ${windowHours(ct) || '<1'} h: ${avail(ct).toFixed(1)}%, below ${ct.target}%. It recovers as clean hours replace the outage.`),
          ct.best != null ? info(`Best full 48 h so far: ${ct.best.toFixed(1)}%`) : ct.accepted && st.cust.mill.everPowered ? info(`${ct.windowH - windowHours(ct)} h until the first full 48 h window`) : null,
          ct.penaltyPaid || ct.penaltyToday ? warn(`Penalties so far: ${fmt.cr((ct.penaltyPaid || 0) + (ct.penaltyToday || 0))}`) : null,
        ].filter(Boolean),
        focus: { x: 315, z: -95, sel: { kind: 'building', id: 'mill' } },
        focusLabel: 'Show the steel mill',
      };
    },
  },
  {
    id: 'inspect',
    primary: false,
    label: 'Optional · Inspect and service the old substation',
    eval: (st) => {
      const n = st.nodes[S0(st)];
      return { done: !!n && n.wearKnown && !n.hiddenWear };
    },
    guide: (st, bal, ctx) => {
      const id = S0(st);
      const n = st.nodes[id];
      return {
        title: 'Optional · Inspect and service the old substation',
        why: 'Condition you can’t see is still condition. The inherited substation by the coal station has incomplete records.',
        steps: [`Click <b>${ctx.xfmrName(id)}</b> near the coal station and press <b>Inspect</b>.`, `If wear is found, press <b>Service</b> (${fmt.cr(bal.costs.maintain)}). Overnight is best, when the town uses less.`],
        now: [!n ? info('Removed') : n.wearKnown ? (n.hiddenWear ? warn('Hidden wear found. Service it') : ok('Serviced')) : todo('Not inspected')],
        focus: n ? { x: n.x, z: n.z, sel: { kind: 'node', id } } : null,
        focusLabel: n ? `Show ${ctx.xfmrName(id)}` : null,
      };
    },
  },
  {
    id: 'peaker',
    primary: false,
    label: 'Optional · Build the gas peaker',
    eval: (st) => ({ done: !!st.gens.peaker }),
    guide: (st) => ({
      title: 'Optional · Build the gas peaker',
      why: 'Coal is cheap but slow and can’t go below 40 %. A fast gas peaker covers peaks and outages, but each kWh costs more.',
      steps: [`Press ${k('G')} and click the peaker plot (north-east of the park).`, 'Connect it with a 66 kV line to the park substation’s tower line.', 'Start it, and keep it below coal in the dispatch order (Supply panel).'],
      now: [st.gens.peaker ? ok(`Built · ${st.gens.peaker.status}`) : todo('Not built')],
      focus: { x: 458, z: 150, sel: { kind: 'site', id: 'peaker' } },
      focusLabel: 'Show peaker site',
    }),
  },
];

// ------------------------------------------------------------------ inherited network & director
const PREBUILT = [
  { type: 'line', from: 'coal', to: { x: -380, z: -26 } },
  { type: 'substation', at: '@last' },
  { type: 'line', from: '@node:-380,-26', to: { x: -260, z: -14 } },
  { type: 'line', from: '@last', to: { x: -140, z: -14 } },
  { type: 'line', from: '@last', to: { x: -55, z: -14 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-55,-14', tier: 'up', to: { x: -25, z: -14 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-25,-14', tier: 'up', to: { x: 55, z: -14 } },
  { type: 'transformer', at: '@last' },
  // LV in town
  { type: 'line', from: '@node:-55,-14', to: { x: -55, z: -42 } },
  { type: 'line', from: '@last', to: { x: -55, z: -78 } },
  { type: 'line', from: '@node:-55,-14', to: { x: -55, z: 20 } },
  { type: 'line', from: '@last', to: { x: -55, z: 48 } },
  { type: 'line', from: '@last', to: { x: -55, z: 82 } },
  { type: 'line', from: '@node:-25,-14', to: { x: -25, z: -42 } },
  { type: 'line', from: '@last', to: { x: -25, z: -78 } },
  { type: 'line', from: '@node:-25,-14', to: { x: -25, z: 20 } },
  { type: 'line', from: '@last', to: { x: -25, z: 48 } },
  { type: 'line', from: '@last', to: { x: -25, z: 82 } },
  { type: 'line', from: '@node:55,-14', to: { x: 55, z: -40 } },
  { type: 'line', from: '@last', to: { x: 55, z: -72 } },
  { type: 'line', from: '@node:55,-40', to: { x: 85, z: -40 } },
  { type: 'line', from: '@last', to: { x: 85, z: -75 } },
  ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'hospital', 'school', 'sh1', 'sh2', 'o1', 'o2'].map((b) => ({ type: 'drop', building: b })),
];

function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D;
  const d = Math.floor(state.clock / D) + 1;
  // contract offered from the start
  if (!state.contracts.mill.offered) state.contracts.mill.offered = true;
  // clean-running counter once all industry is on
  const indOn = INDUSTRY.every((id) => powered(state, id));
  const trips = state.stats.trips + (state.stats.lineTrips || 0);
  if (indOn && trips === (F.tripsSeen ?? trips)) F.cleanMin = (F.cleanMin || 0) + 1;
  else if (trips !== (F.tripsSeen ?? trips)) {
    if (F.cleanMin) api.emit('cleanReset');
    F.cleanMin = 0;
  }
  F.tripsSeen = trips;
  // inherited substation: records incomplete (day 1 14:00), hidden wear fails it on day 2 at 15:00
  const s0 = S0(state);
  if (d === 1 && hm === 14 * 60) api.emit('recordsWarning', { target: s0 });
  if (s0 && d === 2 && hm === 15 * 60 && state.nodes[s0].hiddenWear > 0 && state.nodes[s0].state === 'ok') {
    const n = state.nodes[s0];
    n.state = 'fault';
    n.condition = 15;
    state.fault.phase = 'active';
    state.fault.target = s0;
    state.fault.tripT = state.t;
    api.emit('fault', { target: s0, affected: [...(n.customers || [])] });
    return 'resolve';
  }
  // mill expansion request (day 2 08:00, from 12:00) — the player decides
  if (d === 2 && hm === 8 * 60 && state.contracts.mill.accepted && !F.expansion) {
    F.expansion = 'offered';
    api.emit('expansionOffer');
  }
}

function score(state) {
  const s = state.stats;
  const ct = state.contracts.mill;
  const coverage = s.custMinTotal > 0 ? s.custMinPowered / s.custMinTotal : 0;
  const trips = s.trips + (s.lineTrips || 0);
  const contract = ct.accepted ? Math.max(0, Math.min(25, (25 * (bestAvail(ct) - 95)) / 4.5)) : 0;
  const reliability = Math.max(0, 15 - trips * 5);
  const lossPct = s.kWhGen > 0 ? (s.kWhLoss / s.kWhGen) * 100 : 0;
  const efficiency = lossPct <= 2 ? 15 : lossPct >= 7 ? 0 : 15 - ((lossPct - 2) / 5) * 15;
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(20, 8 + net / 4000 + (state.flags.expansion === 'accepted' ? 4 : 0)));
  const parts = { coverage: Math.round(coverage * 25), contract: Math.round(contract), reliability: Math.round(reliability), efficiency: Math.round(efficiency), finance: Math.round(finance) };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['coverage', 'Coverage', 25], ['contract', 'Contract', 25], ['reliability', 'Reliability', 15], ['efficiency', 'Efficiency', 15], ['finance', 'Finance', 20]] };
}

function metrics(state) {
  const s = state.stats;
  const ct = state.contracts.mill;
  const lossPct = s.kWhGen > 0 ? (s.kWhLoss / s.kWhGen) * 100 : 0;
  return {
    powered: state.flow.powered,
    total: state.flow.activeCount ?? state.map.customers.length,
    decisions: { hv: true, inspected: !!state.nodes[S0(state)]?.wearKnown, expanded: state.flags.expansion === 'accepted', peaker: !!state.gens.peaker },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.flow.activeCount ?? state.map.customers.length}`],
      ['Energy delivered', fmt.kwh(s.kWhDelivered)],
      ['Peak demand', fmt.kw(s.peakKW)],
      ['Contract availability (best 48 h)', ct.accepted ? `${bestAvail(ct).toFixed(1)}%` : 'Not signed'],
      ['Contract penalties', fmt.cr(ct.penaltyPaid + (ct.penaltyToday || 0))],
      ['Network losses', `${lossPct.toFixed(1)}%`],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
      ['Overload trips', `${s.trips + (s.lineTrips || 0)}`],
      ['CO₂ (all days)', `${((state.days || []).reduce((a, x) => a + x.co2, 0) / 1000).toFixed(1)} t`],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN3 = {
  hv: { title: 'Why high voltage?', what: 'You’re moving megawatts over almost a kilometre.', why: 'Power = voltage × current. At 66 kV the same power needs one-sixth of the current of 11 kV, and line losses fall with the square of current.', todo: ['Use 66 kV for bulk power over distance.', 'Step down at a substation near the load.', 'Keep 11 kV feeders short and under 1.5 MW.'], real: 'Transmission grids run at 66–765 kV for exactly this reason.' },
  contract: { title: 'Industrial supply contract', what: 'You signed a firm supply contract with Ironvale Steel.', why: 'Big customers pay less per kWh but buy huge amounts. Outages cost them dearly, so the contract has penalties.', todo: ['Keep the mill’s supply within its limits.', 'Keep backup supply ready (gas peaker).', 'Plan maintenance away from the mill’s supply path.'], real: 'Industrial contracts often include interruption clauses, demand charges and availability guarantees.' },
  coal: { title: 'Inflexible coal', what: 'The coal unit can’t run below 40 % of its rating.', why: 'Big thermal plants need minimum steam flow. When demand is lower, the extra energy is wasted, but it still burns coal.', todo: ['Connect more demand (industry) to use the minimum output.', 'Use the fast gas peaker for peaks instead of over-sizing coal.'], real: 'Inflexible baseload is one reason grids add flexible gas, hydro and storage.' },
  inspection: { title: 'Hidden wear', what: 'The inherited substation’s records are incomplete.', why: 'Not all wear is visible from its readings. Inspections find insulation and contact problems before they fail.', todo: ['Inspect it (free).', 'Service it if wear is found, ideally overnight.'], real: 'Condition-based maintenance uses inspections and sensors to fix assets just before they would fail.' },
  expansion: { title: 'The mill wants to expand', what: 'Ironvale Steel asks to add a second furnace (+1 MW).', why: 'More load means more income, but also more strain on your substation, lines and supply.', todo: ['Check the substation has room to spare (it’s built for 5 MW).', 'Make sure supply covers the new peak (gas peaker).', 'Accept only if you can keep 99 % availability.'], real: 'Utilities run connection studies before approving large new loads.' },
};

const LINES3 = {
  ...L1,
  intro: [['advisor', 'Ironvale runs on coal and steel. The steel mill wants a guaranteed supply: 2 MW, day and night.'], ['sofia', 'The town is fed over 11 kV from the coal station. That won’t carry megawatts to the park. We need 66 kV.']],
  contract: [['daniel', 'Contract signed. Lots of power at a small profit per kWh, and a penalty for every minute the mill is dark.']],
  records: [['sofia', 'The records for the old substation by the coal station are incomplete. Worth an inspection.']],
  inspectedWear: [['sofia', 'Inspection found hidden wear in {name}. Service it before it fails.']],
  expansion: [['daniel', 'The mill wants a second furnace: another megawatt. Your call.']],
  tutorialDone: [['advisor', 'You’ve got the corridor in hand. Keep the mill running.']],
};

const TUT3 = [
  { id: 'contract', title: 'Meet your biggest customer', body: 'Click Ironvale Steel in the industrial park (east) and sign its supply contract.', target: { world: 'cust', id: 'mill' }, done: (st) => !!st.contracts.mill.accepted },
  { id: 'hv', title: 'Go high voltage', body: 'Press L, click the coal station (66 kV) and click east along the main road. Towers go at least every 120 m. Stop beside the park.', target: { world: 'gen', id: 'coal', label: 'Coal station: 66 kV' }, done: (st) => hvNear(st) },
  { id: 'sub', title: 'Step it down', body: 'Press B (Substation) and click your last tower near the park. It converts 66 kV to 11 kV.', target: { world: 'marker', x: 340, z: -30, label: 'Substation here' }, done: (st) => !!parkSub(st) },
  { id: 'feed', title: 'Feed the plants', body: 'Draw 11 kV feeders out of the substation (L), then press C and click the mill, factory and warehouse.', target: { world: 'cust', id: 'factory' }, done: (st) => INDUSTRY.every((id) => powered(st, id)) },
  { id: 'mix', title: 'Dispatch', body: 'Click the Supply chip: coal runs first (cheap, inflexible); a gas peaker can cover peaks.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
];

const ENDING3 = {
  common: ['Ironvale’s furnaces never went cold.', 'Sixty-six thousand volts now hum along the corridor, carrying megawatts with hardly a loss.'],
  sustainable: 'Industry, town and utility all came out ahead: reliable power, a contract kept, a corridor ready to grow.',
  reliable: 'The mill got its power and the town kept its lights. A solid industrial grid.',
  hardwon: 'There were trips and penalties along the way, but Ironvale is wired for industry now.',
  decisions: { inspected: 'You found the old substation’s hidden wear before it failed.', expanded: 'You said yes to the mill’s second furnace, and delivered.', peaker: 'A fast gas peaker covered the peaks the coal unit couldn’t.' },
  next: 'Next: the Saltmarsh coast. The coal station is closing, and wind, sun, water and batteries must take over.',
};

const ui = {
  tutorial: TUT3,
  lines: LINES3,
  learn: LEARN3,
  ending: ENDING3,
  endTitle: 'Ironvale is wired for industry',
  demandNote: 'Apartments peak in the evening; offices and shops by day; the hospital never stops. The steel mill runs around the clock once its contract is signed; the factory runs two shifts.',
  briefing: {
    text: 'The Ironvale corridor: a coal station in the west, a town in the middle and an industrial park in the east that needs <b>over 3 MW</b>. 11 kV lines can’t carry that. It’s time for <b>66 kV transmission</b>.',
    goals: ['Sign the steel mill’s supply contract', 'Build a 66 kV line and a substation at the park', 'Power the mill, factory and warehouse', '24 h without an overload trip, and the mill powered 98% of the time over 48 hours'],
    newSystems: ['<b>High-voltage transmission</b> (66 kV lattice towers) and <b>substations</b>', '<b>Large industrial loads</b> connected at 11 kV', '<b>Congestion</b>: lines trip when overloaded', '<b>Contracts</b> with penalties · coal vs gas <b>dispatch</b> · <b>inspections</b>'],
  },
  failCause: {
    clinic: { title: 'The hospital lost power too long', body: 'Ironvale Hospital was without power for 6 hours.', tip: 'Keep a backup path or spare capacity for critical services, and repair faults fast.' },
    bankrupt: { title: 'Out of money', body: 'Debts passed the bank’s limit.', tip: 'Sign the mill’s contract early (it’s your biggest income) and avoid penalties.' },
  },
  handles: ['recordsWarning', 'expansionOffer', 'contract', 'inspected', 'cleanReset'],
  onEvent(e, u) {
    switch (e.type) {
      case 'recordsWarning':
        u.say('records');
        u.hud.alert({ id: 'records', level: 'warn', title: `${u.xfmrName(e.target)}: maintenance records incomplete`, text: 'Inspect it (free) to check for hidden wear.', actions: [{ label: 'Inspect now', primary: true, fn: () => u.cmd({ type: 'inspect', target: e.target }) && u.hud.dismiss('records') }, u.focusAct(e.target)] });
        u.learnOnce('inspection', { focus: () => u.focus({ kind: 'node', id: e.target }) });
        break;
      case 'inspected':
        if (e.wear > 0) {
          u.audio.play('warn');
          u.say('inspectedWear', { name: u.xfmrName(e.target) });
          u.hud.alert({ id: 'wear', level: 'warn', title: `Hidden wear found in ${u.xfmrName(e.target)}`, text: 'Service it before it fails (crew about 1 h; its customers are off during the work).', actions: [{ label: 'Service', primary: true, fn: () => u.cmd({ type: 'maintain', target: e.target }) && u.hud.dismiss('wear') }, u.focusAct(e.target)] });
        }
        break;
      case 'expansionOffer':
        u.audio.play('warn');
        u.say('expansion');
        u.hud.alert({
          id: 'expand',
          level: 'info',
          title: 'Ironvale Steel asks for +1 MW from 12:00',
          text: 'More income, but more load on your substation, lines and supply. Decide before noon.',
          actions: [
            { label: 'Accept', primary: true, fn: () => u.cmd({ type: 'expand', accept: true }).ok && u.hud.dismiss('expand') },
            { label: 'Decline', fn: () => u.cmd({ type: 'expand', accept: false }).ok && u.hud.dismiss('expand') },
          ],
        });
        u.learnOnce('expansion', { focus: () => u.focus({ kind: 'building', id: 'mill' }) });
        break;
      case 'contract':
        if (e.accept) {
          u.audio.play('objective');
          u.say('contract');
          u.learnOnce('contract');
        }
        break;
      case 'cleanReset':
        u.hud.alert({ id: 'clean', level: 'warn', title: 'Something tripped, so the 24 h clock starts again', ttl: 7000 });
        break;
    }
  },
  buildingExtra(c, state, ctx, { btn }) {
    if (c.contract !== 'mill') return '';
    const ct = state.contracts.mill;
    return `<div class="why ${ct.accepted ? 'ok' : ''}"><b>${ct.name}</b>Tariff ${ct.tariff.toFixed(2)} ¢/kWh · target ${ct.target}% over ${ct.windowH} h · penalty ${ct.penaltyPerMin} ¢ per minute dark.${ct.accepted ? (state.cust.mill.everPowered ? ` Last ${windowHours(ct) || '<1'} h: ${avail(ct).toFixed(1)}% · penalties ${fmt.cr(ct.penaltyPaid + (ct.penaltyToday || 0))}.` : ' The clock starts when the mill first gets power.') : ' The mill stays idle until you sign.'}</div>` + (ct.accepted ? '' : `<div class="actions">${btn('Sign contract', { type: 'contract', id: 'mill', accept: true }, { primary: true, icon: 'check' })}</div>`);
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF3 = [
  { type: 'contract', id: 'mill', accept: true },
  { type: 'inspect', target: 'mix' },
  // 66 kV corridor along the north verge
  { type: 'line', from: 'coal', to: { x: -320, z: -30 } },
  { type: 'line', from: '@last', to: { x: -100, z: -30 } },
  { type: 'line', from: '@last', to: { x: 120, z: -40 } },
  { type: 'line', from: '@last', to: { x: 300, z: -30 } },
  { type: 'line', from: '@last', to: { x: 352, z: -60 } },
  { type: 'substation', at: '@last' },
  // the mill connects straight to the substation's 11 kV bus (a single feeder is rated 1.5 MW)
  { type: 'drop', building: 'mill', from: '@node:352,-60' },
  // 11 kV feeder for the factory and warehouse
  { type: 'line', from: '@node:352,-60', tier: 'down', to: { x: 410, z: -40 } },
  { type: 'line', from: '@last', to: { x: 410, z: 20 } },
  { type: 'drop', building: 'factory' },
  { type: 'drop', building: 'warehouse' },
  // gas peaker on the park's 66 kV
  { type: 'build', site: 'peaker', option: 'gas' },
  { type: 'line', from: 'peaker', to: { x: 360, z: 110 } },
  { type: 'line', from: '@last', to: '@node:352,-60' },
  { type: 'dispatchOrder', order: ['coal', 'gas'] },
];

export default {
  id: MAP3.id,
  n: 3,
  key: 'stage3',
  stageName: 'Stage 3 · Industrial Revolution',
  name: 'The Ironvale Corridor',
  region: 'Ironvale',
  blurb: 'An industrial park needs megawatts a kilometre from the coal station. Build 66 kV transmission and keep a steel mill’s contract.',
  learns: ['High-voltage transmission', 'Substations & congestion', 'Industrial contracts', 'Coal vs gas dispatch'],
  map: MAP3,
  bal: BAL3,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'sub', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'mix', 'powered', 'co2', 'rel', 'loss'],
  objectives,
  weather: {},
  cast: { mayor: { name: 'Joan Pritchard', role: 'Mayor of Ironvale', color: '#b48cf2', initials: 'JP' }, nana: { name: 'Bridget Hale', role: 'Retired steelworker', color: '#d9b38c', initials: 'BH' } },
  quests: {
    perDay: [1, 2],
    pool: [
      { key: 'breakfast', who: 'ravi', title: 'Breakfast rush at the café', text: 'The café and corner shop serve the early shift. Keep them lit from 07:00 to 11:00.', goal: { type: 'keepLit', ids: ['sh1', 'sh2'], fromH: 7, toH: 11 }, reward: { credits: 500, rep: 2 } },
      { key: 'rush', who: 'tom', title: 'A rush order at Corridor Engineering', text: 'The engineering works has a rush order. They need power from 08:00 to 17:00.', goal: { type: 'keepLit', ids: ['factory'], fromH: 8, toH: 17 }, reward: { credits: 900, rep: 2 } },
      { key: 'surgery', who: 'maya', title: 'A long day in surgery', text: 'Ironvale Hospital has a full list of operations. Keep it lit from 08:00 to 20:00.', goal: { type: 'keepLit', ids: ['hospital'], fromH: 8, toH: 20 }, reward: { credits: 800, rep: 4 }, news: 'Ironvale Hospital clears its surgery waiting list.' },
      { key: 'flats', who: 'mayor', title: 'Evening in the flats', text: 'Keep every block of flats lit from 18:00 to 22:00. It’s quiz night on the radio.', goal: { type: 'keepLit', ids: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], fromH: 18, toH: 22 }, reward: { credits: 700, rep: 3 } },
      { key: 'warehouse', who: 'daniel', title: 'The Logistics Hub wants power', text: 'Trucks are waiting at the Logistics Hub. Connect it before 18:00.', goal: { type: 'poweredBy', id: 'warehouse', hour: 18 }, reward: { credits: 1000, rep: 2 } },
      { key: 'noCuts', who: 'maya', title: 'An evening without cuts', text: 'No one switched off between 17:00 and 22:00, please.', goal: { type: 'noShed', fromH: 17, toH: 22 }, reward: { credits: 600, rep: 2 } },
    ],
  },
  story: [
    { day: 1, hour: 12, who: 'tom', lines: ['I speak for the steelworkers. Two thousand jobs depend on that mill getting steady power.', 'No pressure.'] },
    { day: 2, hour: 15, who: 'tom', title: 'Night crews want a bonus', text: 'Your line crews are working nights to keep the corridor going. Tom says they’ll walk out unless night work is paid fairly.', options: [{ label: 'Pay a night bonus · 1,000 ¢', cost: 1000, rep: 4, trust: 3, note: 'The crews stay happy.', news: 'Utility agrees night bonus with line crews.' }, { label: 'Refuse', rep: -6, note: 'Morale drops and the town hears about it.', news: 'Line crews angry over night pay.' }] },
    { day: 3, hour: 10, who: 'leila', title: 'Questions about coal', text: 'The Ironvale Gazette asks how long the town will keep burning coal.', options: [{ label: 'Share your plans for cleaner power', rep: 3, news: 'Utility talks about a cleaner future for Ironvale.' }, { label: 'No comment', rep: -2 }] },
    { day: 4, hour: 19, who: 'nana', lines: ['My grandson works at the mill. He says the furnaces haven’t stopped once this week. That’s your doing.'] },
    { day: 5, hour: 9, who: 'mayor', lines: ['Investors from the capital are watching the mill’s numbers this week. If it holds, they’ll build a second line.'] },
  ],
  events: {
    count: [7, 9],
    minGapH: 6,
    avoidH: [[30, 41]], // mill expansion offer and the hidden substation fault (day 2)
    pool: [
      { key: 'quake', kind: 'quake', weight: 2, windowH: [44, 130], params: { zone: { x: -60, z: -30, r: 320 }, p: 0.35, max: 3 } },
      { key: 'coalTrip', kind: 'blackout', weight: 2, windowH: [44, 130], warnH: 2, durH: 3, params: { targets: ['coal'] } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [44, 130], warnH: 3 },
      { key: 'workers', kind: 'arrivals', weight: 2, windowH: [44, 110], warnH: 8, durH: 12, params: { group: 'workers', at: { x: 75, z: 42 }, title: 'Housing for the mill workers', text: 'Two blocks of flats for Ironvale Steel’s workers are finishing across the main road from the shops.', say: 'The mill’s new workers move in soon. Two whole blocks of flats need power.', goodNews: 'Mill workers move into new flats with the lights already on.', badNews: 'New mill workers’ flats still dark a day after opening.' } },
      { key: 'cup', kind: 'festival', weight: 1, windowH: [44, 130], atHour: 18, warnH: 18, durH: 4, params: { name: 'The cup final', text: 'Ironvale United are in the cup final and the whole town will be watching at home.', ids: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], mult: 1.3, startH: 18, at: { x: -40, z: 0 }, say: 'Cup final tonight! Every TV in town will be on. Please keep the flats lit.', goodNews: 'Ironvale watches the cup final without a flicker.', badNews: 'Power cut during the cup final. Fans are furious.' } },
      { key: 'hospital', kind: 'request', weight: 1, windowH: [44, 130], params: { who: 'maya', title: 'The hospital wants a backup generator', text: 'Ironvale Hospital asks you to help pay for a backup generator, so the operating theatres never go dark, even in a disaster.', options: [{ label: 'Pay for it · 2,000 ¢', cost: 2000, yes: true, rep: 6, trust: 5, cls: ['public'], note: 'A real comfort for patients and staff.', news: 'Utility funds backup power for Ironvale Hospital.' }, { label: 'Not this year', rep: -3, note: 'You keep the money. The hospital is disappointed.' }] } },
      { key: 'storm', kind: 'storm', weight: 2, windowH: [44, 130], warnH: 3, durH: 3, params: { p: 0.15, max: 2 } },
      { key: 'heat', kind: 'heat', weight: 1, windowH: [44, 130], atHour: 13, warnH: 14, durH: 6, params: { mult: 1.15, startH: 13, cls: ['home', 'lowincome', 'business'] } },
      { key: 'theft', kind: 'theft', weight: 1, windowH: [44, 130], warnH: 6, params: { cost: 400 } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [44, 130], warnH: 10, params: { grant: 800 } },
      { key: 'apprentices', kind: 'request', weight: 1, windowH: [44, 130], params: { who: 'maya', title: 'Apprentices from Ironvale College', text: 'The college asks you to take on six apprentice line workers. It costs money to train them, but young people in town need jobs.', options: [{ label: 'Take them on · 600 ¢', cost: 600, yes: true, rep: 5, trust: 3, note: 'Good jobs for local young people.', news: 'Six Ironvale teenagers start apprenticeships at the utility.' }, { label: 'Not this year', rep: -2, note: 'You save the money.' }] } },
      { key: 'minister', kind: 'vipVisit', weight: 1, windowH: [44, 130], atHour: 11, warnH: 14, durH: 3, params: { name: 'The industry minister', who: 'mayor', zone: { x: -40, z: 60, r: 70 }, grant: 1200, text: 'The industry minister is opening a new ward at Ironvale Hospital and touring the school.', goodNews: 'Minister opens new hospital ward on a steady supply.', badNews: 'Power cut interrupts minister at hospital opening.' } },
      { key: 'wildfire', kind: 'wildfire', weight: 1, windowH: [44, 130], warnH: 5, durH: 4, params: { area: 'the scrubland west of town', zone: { x: -250, z: -60, r: 80 } } },
      { key: 'landslide', kind: 'landslide', weight: 1, windowH: [44, 130], warnH: 1, durH: 3, params: { area: 'the south hill', zone: { x: 180, z: 110, r: 70 }, p: 0.6, max: 2 } },
    ],
    protests: { hvNearHomes: 25, compensation: 1500, outages: 4, credit: 1200 },
  },
  contracts: CONTRACTS,
  demandMod,
  prebuilt: PREBUILT,
  init(state) {
    state.started = true;
  },
  afterPrebuilt(state) {
    for (const id in state.nodes) if (state.nodes[id].kind === 'xfmr') state.nodes[id].legacy = true;
    for (const id in state.edges) state.edges[id].legacy = true;
    const s0 = S0(state);
    if (s0) {
      state.nodes[s0].hiddenWear = 70;
      state.nodes[s0].condition = 78;
    }
    state.contracts.mill.offered = true;
  },
  commands: {
    expand(c, api) {
      const F = api.state.flags;
      if (F.expansion !== 'offered') return { ok: false, reason: 'badTarget' };
      F.expansion = c.accept ? 'accepted' : 'declined';
      api.emit('expansion', { accept: !!c.accept });
      api.resolve();
      return { ok: true };
    },
  },
  director,
  score,
  metrics,
  refBuild(sim) {
    runSteps(sim.cmd, sim.state, REF3);
    sim.cmd({ type: 'startGen', target: 'peaker' });
  },
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF3);
    sim.cmd({ type: 'startGen', target: 'peaker' });
    for (let i = 0; i < 6 * D && !sim.state.result; i++) {
      sim.tick();
      for (const e of drainAndRespond(sim)) {
        if (e.type === 'recordsWarning') sim.cmd({ type: 'inspect', target: e.target });
        if (e.type === 'inspected' && e.wear > 0) sim.cmd({ type: 'maintain', target: e.target });
        if (e.type === 'expansionOffer') sim.cmd({ type: 'expand', accept: true });
        if (e.type === 'fault' || e.type === 'lineTrip') sim.cmd({ type: 'repair', target: e.target });
      }
    }
  },
  ui,
  camera: { x: 0, z: 0, dist: 640 },
  ending: { x: 300, z: -40, dist: 320, outDist: 900, outDX: -300, outDZ: 40 },
};
