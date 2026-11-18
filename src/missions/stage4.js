// Stage 4 · The Green Transition — "Saltmarsh Coast" (GDD §6 Stage 4, §7.2 variable renewables,
// §7.4 storage, §8.6 prosumers). The coal station retires at the end of day 3. Replace it with wind,
// solar, hydro and storage, ride out a storm and a calm overcast day, and reach a 70 % renewable day.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { runSteps } from '../sim/steps.js';
import { srcType, ratedKW } from '../sim/power.js';
import { drainAndRespond } from '../sim/events.js';

const D = 1440;
const day = (d, h) => (d - 1) * D + h * 60;

// ------------------------------------------------------------------ map
const apt = (id, name, x, z) => ({ id, type: 'apartment', name, x, z, w: 18, d: 14, floors: 4 });
const street = (id, name, x, z) => ({ id, type: 'home', name, x, z, w: 9, d: 9, scale: 25, pvKWp: 60 });
export const MAP4 = {
  id: 'stage4-saltmarsh',
  bounds: { minX: -460, maxX: 460, minZ: -340, maxZ: 280 },
  tile: { cx: 0, cz: -20, hw: 500, hd: 360, radius: 60 },
  mvTypes: ['port'],
  roads: [
    { id: 'main', x: 0, z: 0, w: 980, d: 9, lanes: true },
    { id: 'harbour', x: 0, z: 90, w: 7, d: 170, lanes: true },
    { id: 'north', x: 0, z: -150, w: 7, d: 290, lanes: true },
    { id: 'quay', x: 120, z: 150, w: 220, d: 7, lanes: true },
    { id: 'depot', x: 170, z: -40, w: 8, d: 70 },
  ],
  crossings: [[0, -8.5, false], [0, 8.5, false]],
  water: [
    { x: 0, z: 255, w: 980, d: 50 },
    { x: -250, z: -60, w: 16, d: 560 },
  ],
  hills: [{ x: 300, z: -220, r: 110, h: 18, squash: 0.55 }, { x: -330, z: -250, r: 90, h: 16, squash: 0.7 }, { x: 400, z: 170, r: 60, h: 10, squash: 0.7 }],
  lampRoads: ['main', 'harbour', 'quay'],
  clear: [{ x: -120, z: -60, w: 260, d: 50 }, { x: 0, z: -190, w: 30, d: 260 }],
  core: [{ x: 20, z: 60, w: 260, d: 200 }],
  sources: [
    { id: 'coal', type: 'coal', name: 'Saltmarsh coal station (retiring)', tier: 'HV', x: -390, z: -110, w: 80, d: 70, port: { x: -342, z: -62 }, kw: 3000, running: true, retireAt: day(4, 0) },
    { id: 'link', type: 'import', name: 'Regional interconnector', tier: 'HV', x: 60, z: -300, w: 30, d: 20, port: { x: 40, z: -290 }, kw: 1500, running: true, dirX: 1 },
  ],
  sites: [
    { id: 'wind1', name: 'Ridge wind site', desc: 'An exposed ridge with the best wind in the region', x: 300, z: -220, w: 120, d: 50, tier: 'HV', port: { x: 230, z: -200 }, turbines: 3, options: [{ type: 'wind', kw: 2400, cost: 16000, note: 'Three 800 kW turbines on the ridge. Cut-in 3 m/s, cut-out 25 m/s.' }] },
    { id: 'wind2', name: 'Headland wind site', desc: 'Coastal headland east of the harbour', x: 400, z: 170, w: 60, d: 30, tier: 'MV', port: { x: 360, z: 150 }, turbines: 2, options: [{ type: 'wind', kw: 1400, cost: 10000, note: 'Two turbines on the headland, connecting at 11 kV.' }] },
    { id: 'solar1', name: 'Marsh fields solar site', desc: 'Flat fields south-west of town', x: -140, z: 150, w: 130, d: 70, tier: 'MV', port: { x: -70, z: 120 }, options: [{ type: 'solar', kw: 1500, cost: 11000 }] },
    { id: 'solar2', name: 'North fields solar site', desc: 'Fields north of the main road', x: 130, z: -190, w: 90, d: 50, tier: 'MV', port: { x: 80, z: -170 }, options: [{ type: 'solar', kw: 1000, cost: 7500 }] },
    { id: 'hydro', name: 'River dam site', desc: 'A narrow stretch of river with room for a small reservoir', x: -250, z: -230, w: 30, d: 12, tier: 'MV', port: { x: -225, z: -215 }, options: [{ type: 'hydro', kw: 800, cost: 9000, note: 'Dispatchable and clean, but the reservoir is limited (about 6 MWh, refilled slowly by the river).' }] },
    { id: 'battery', name: 'Battery site', desc: 'Next to the town substation', x: 60, z: -60, w: 34, d: 16, tier: 'MV', port: { x: 40, z: -45 }, options: [{ type: 'battery', kw: 1000, kwh: 4000, cost: 9000 }, { type: 'battery', kw: 2000, kwh: 8000, cost: 16000 }] },
  ],
  depot: { id: 'depot', x: 170, z: -80, w: 18, d: 12 },
  townCenterZ: 0,
  decor: [
    { kind: 'city', x: 0, z: -560, w: 260, d: 150, top: -12 },
    { kind: 'port', x: 360, z: 420, w: 240, d: 110, top: -12 },
    { kind: 'windfarm', x: 680, z: -80, w: 120, d: 300, top: -10 },
    { kind: 'lake', x: -680, z: -100, w: 190, d: 170, top: -10 },
  ],
  customers: [
    apt('a1', 'Harbour Flats', -40, -30), apt('a2', 'Gull Court', 40, -30), apt('a3', 'Seaview', -40, 40), apt('a4', 'Anchor Flats', 40, 40), apt('a5', 'Dune Court', -40, 80), apt('a6', 'Tide Flats', 40, 80),
    street('st1', 'Marsh Lane homes', -100, -32), street('st2', 'Reed Lane homes', -100, 32), street('st3', 'Saltpan homes', -140, -32), street('st4', 'Cockle Row homes', 100, -32), street('st5', 'Pier Street homes', 100, 32), street('st6', 'Lighthouse homes', 140, 32),
    { id: 'hospital', type: 'hospital', name: 'Saltmarsh Hospital', x: -60, z: 130, w: 26, d: 18 },
    { id: 'school', type: 'school', name: 'Saltmarsh School', x: 60, z: 120, w: 24, d: 12 },
    { id: 'o1', type: 'office', name: 'Harbour offices', x: 150, z: -32, w: 16, d: 14, floors: 4, label: 'HARBOUR' },
    { id: 'sh1', type: 'shop', name: 'Fish market', x: -140, z: 32, w: 10, d: 9, label: 'FISH' },
    { id: 'port', type: 'port', name: 'Saltmarsh Port', x: 160, z: 195, w: 70, d: 40 },
    // surprise: a fishing village grows east of the harbour (some runs)
    { ...street('v1', 'Fisher’s Cottages (new)', 250, 60), surprise: 'village' },
    { ...street('v2', 'Net Lane cottages (new)', 250, 100), surprise: 'village' },
  ],
};

// ------------------------------------------------------------------ balance
export const BAL4 = {
  ...BALANCE,
  start: { credits: 110000, poles: 50, transformers: 4, cable: 2000, kits: 4, fuel: 0, substations: 1 },
  startClockMin: 8 * 60,
  costs: { ...BALANCE.costs, pole: { HV: 1500, MV: 120, LV: 90 }, cablePerM: { HV: 5, MV: 2, LV: 1 }, transformer: 1500, substation: 15000, drop: 50, maintain: 400, repairLabour: 600, dailyOverhead: 3000 },
  procurement: { ...BALANCE.procurement, transformer: { qty: 1, cost: 2500, leadH: 8 }, kits: { qty: 1, cost: 600, leadH: 6 } },
  network: { ...BALANCE.network, maxSpan: { HV: 120, MV: 40, LV: 40 }, ratingKW: { HV: 30000, MV: 2500, LV: 300 }, dropReach: 22, mvDropReach: 30 },
  transformer: { ...BALANCE.transformer, ratingKW: 500 },
  substation: { ratingKW: 5000 },
  lineProtection: { tripPct: 100, delayMin: 30, coolMin: 30 },
  sourceTypes: {
    coal: { dispatch: true, rampH: 2, minFrac: 0.4, maxKW: 3000, costPerKWh: 0.06, co2: 0.95, wearPerRunHour: 0.05 },
    import: { dispatch: true, rampH: 0, maxKW: 1500, costPerKWh: 0.35, co2: 0.45 },
    hydro: { dispatch: true, rampH: 0.05, maxKW: 800, reservoir: 6000, inflowKW: 150, costPerKWh: 0.01, co2: 0, renewable: true },
    solar: { variable: 'solar', renewable: true, co2: 0 },
    wind: { variable: 'wind', renewable: true, co2: 0 },
    battery: { storage: true, storageClean: true, kwh: 4000, eff: 0.9, co2: 0 },
  },
  dispatchOrder: ['battery', 'hydro', 'coal', 'import'],
  exportPrice: 0.2,
  types: {
    apartment: { label: 'Apartment block', cls: 'home', nominal: 60, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.4 : h >= 7 && h <= 8 ? 1.3 : h >= 9 && h <= 17 ? 0.6 : 0.35) },
    home: { label: 'Street of homes', cls: 'home', nominal: 1, priority: 1, profile: (h) => (h >= 18 && h <= 22 ? 2.5 : h >= 7 && h <= 8 ? 1.4 : h >= 9 && h <= 17 ? 0.5 : 0.3) },
    hospital: { label: 'Hospital', cls: 'public', nominal: 200, priority: 3, critical: true, profile: () => 1.0 },
    school: { label: 'School', cls: 'public', nominal: 60, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
    office: { label: 'Offices', cls: 'business', nominal: 120, priority: 1, profile: (h) => (h >= 8 && h <= 17 ? 1.0 : 0.15) },
    shop: { label: 'Market', cls: 'business', nominal: 40, priority: 1, profile: (h) => (h >= 6 && h <= 15 ? 1.0 : 0.1) },
    port: { label: 'Port (11 kV)', cls: 'industry', nominal: 600, priority: 1, profile: (h) => (h >= 6 && h <= 20 ? 1.0 : 0.5) },
  },
  tariffs: { home: { base: 0.4, min: 0.3, max: 0.6 }, public: { base: 0.3, min: 0.2, max: 0.45 }, business: { base: 0.5, min: 0.35, max: 0.8 }, industry: { base: 0.42, min: 0.3, max: 0.6 } },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { clinicOutageH: 6, bankruptGraceH: 6, deadlineDay: 7, debtLimit: -20000 },
};

const W = { 4: { storm: true, peakHour: 13, label: 'Storm: wind over 25 m/s, too strong for turbines' }, 5: { calm: true, label: 'Calm and cloudy: little wind or sun' } };
const RENEW = ['solar', 'wind', 'hydro'];
const renewKW = (st, bal) => Object.values(st.gens).filter((g) => RENEW.includes(g.type)).reduce((s, g) => s + ratedKW(bal, g), 0);
const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const bestShare = (st) => Math.max(0, ...(st.days || []).filter((d) => d.day >= 1).map((d) => d.renewPct));
const STREETS = ['st1', 'st2', 'st3', 'st4', 'st5', 'st6'];

// ------------------------------------------------------------------ objectives
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;

const objectives = [
  {
    id: 'renew',
    primary: true,
    bar: true,
    label: 'Build 3 MW of renewable generation',
    eval: (st, bal) => {
      const kw = renewKW(st, bal);
      return { done: kw >= 3000 && Object.keys(st.gens).filter((id) => RENEW.includes(st.gens[id].type)).every((id) => st.nodes[id]?.connected), progress: [Math.min(30, Math.round(kw / 100)) / 10, 3] };
    },
    guide: (st, bal) => {
      const built = Object.keys(st.gens).filter((id) => RENEW.includes(st.gens[id].type));
      const unconnected = built.filter((id) => !st.nodes[id]?.connected);
      return {
        title: 'Build 3 MW of renewable generation',
        why: 'The coal station closes at midnight on day 3. Wind, sun and water are free fuel, but each one depends on the weather.',
        steps: [`Press ${k('G')} (Build) and click a marked site: ridge or headland wind, marsh or north solar, the river dam.`, 'Connect each one: wind on the ridge at 66 kV, the others at 11 kV.', 'Mix your sources. Wind often blows at night, the sun shines by day, and you can run the dam whenever you need it.'],
        now: [info(`Built: ${fmt.kw(renewKW(st, bal))} of 3 MW`), unconnected.length ? warn(`Not connected yet: <b>${unconnected.map((id) => st.map.sites.find((s) => s.id === id)?.name || id).join(', ')}</b>`) : null, info(`Credits ${fmt.cr(st.credits)}`)].filter(Boolean),
        focus: { x: 300, z: -220, sel: { kind: 'site', id: 'wind1' } },
        focusLabel: 'Show the ridge wind site',
      };
    },
  },
  {
    id: 'battery',
    primary: true,
    label: 'Install battery storage and connect it',
    eval: (st) => ({ done: !!st.gens.battery && !!st.nodes.battery?.connected }),
    guide: (st) => ({
      title: 'Install battery storage and connect it',
      why: 'A battery moves energy in time: it stores surplus wind and sun and releases it at the evening peak or on a still day. It can’t create energy (about 90 % round trip).',
      steps: [`Press ${k('G')} and click the battery site beside the town substation.`, 'Choose 1 MW / 4 MWh or 2 MW / 8 MWh.', `Connect it with an 11 kV line (${k('L')}) to the substation’s 11 kV bus. Leave it on Auto.`],
      now: [st.gens.battery ? (st.nodes.battery.connected ? ok(`Battery at ${Math.round((st.gens.battery.soc / st.gens.battery.kwh) * 100)}%`) : warn('Built but not connected')) : todo('Not built')],
      focus: { x: 60, z: -60, sel: { kind: 'site', id: 'battery' } },
      focusLabel: 'Show battery site',
    }),
  },
  {
    id: 'retire',
    primary: true,
    label: 'Retire coal without a blackout or heavy imports',
    eval: (st) => ({ done: !!st.flags.retireOk }),
    guide: (st) => ({
      title: 'Retire coal without a blackout',
      why: 'At midnight on day 3 the coal station shuts for good. Whatever replaces it must already be running.',
      steps: ['Have enough clean generation and storage connected before midnight on day 3.', 'The regional link is a backup. It’s expensive and mostly fossil power.', 'From 00:00 to 06:00 on day 4 everyone must stay powered, with imports under half of demand.'],
      now: [st.flags.retireOk ? ok('Coal closed, and clean power carried the town') : st.flags.retireOk === false ? warn(`Missed: ${st.flags.retireImport > 0.5 ? `imports reached ${Math.round(st.flags.retireImport * 100)}% of demand` : 'some customers lost power'}`) : st.gens.coal.retired ? info(`Checking until 06:00 · peak import share so far ${Math.round((st.flags.retireImport || 0) * 100)}%`) : info(`Coal retires in ${fmt.dur(Math.max(0, day(4, 0) - st.clock))}`), info(`Interconnector now: ${fmt.kw(st.gens.link?.outKW || 0)}`)],
      focus: null,
    }),
  },
  {
    id: 'storm',
    primary: true,
    label: 'Ride out the day-4 storm',
    eval: (st) => ({ done: !!st.flags.stormOk }),
    guide: (st) => ({
      title: 'Ride out the day-4 storm',
      why: 'Storm winds above 25 m/s force turbines to shut down to protect themselves; heavy cloud cuts solar. A line may come down.',
      steps: ['Charge the battery before the storm.', 'Keep the dam’s reservoir full for the storm (it’s dispatchable).', 'Repair storm damage fast; protect the hospital.'],
      now: [st.clock < day(4, 0) ? info('Storm forecast for day 4 (see the Supply panel forecast)') : st.flags.stormOk ? ok('Storm handled') : st.flags.stormRel != null ? (st.flags.stormRel >= 95 ? ok(`Reliability today ${st.flags.stormRel.toFixed(1)}%`) : warn(`Reliability today ${st.flags.stormRel.toFixed(1)}% (need 95%)`)) : todo('In progress')],
      focus: null,
    }),
  },
  {
    id: 'calm',
    primary: true,
    label: 'Keep everyone powered through the calm, overcast day 5',
    eval: (st) => ({ done: !!st.flags.calmOk }),
    guide: (st) => ({
      title: 'Keep everyone powered through the calm, overcast day 5',
      why: 'Days with no wind and hardly any sun are the hardest test for a renewable grid.',
      steps: ['Fill the battery and the reservoir on day 4 evening, after the storm.', 'In the Supply panel, move the <b>interconnector to the top</b> of the dispatch order for day 5, so it carries the steady load all day.', 'That saves the battery and the dam for the evening peak, when the interconnector alone isn’t enough. Unserved energy must stay under 2 %.'],
      now: [st.clock < day(5, 0) ? info('Day 5 forecast: calm and overcast') : st.flags.calmOk ? ok('Calm day handled') : info(`Unserved so far: ${(st.flags.calmUnserved || 0).toFixed(2)}%`)],
      focus: null,
    }),
  },
  {
    id: 'share',
    primary: true,
    label: 'A full day at ≥ 70% renewable electricity',
    eval: (st) => ({ done: (st.days || []).some((d) => d.renewPct >= 70 && d.day >= 4) }),
    guide: (st) => {
      const L = st.ledger;
      const today = L.kWhGen > 0 ? (L.kWhRenew / L.kWhGen) * 100 : 0;
      return {
        title: 'A full day at ≥ 70% renewable electricity',
        why: 'Renewable share = clean energy ÷ all energy generated in a day. Interconnector imports count as fossil.',
        steps: ['Build enough wind and solar that a normal day covers most demand.', 'Use storage to shift surplus to the evening.', 'Keep the interconnector last in the dispatch order.'],
        now: [info(`Best day so far: ${Math.round(bestShare(st))}%`), info(`Today so far: ${Math.round(today)}%`)],
        focus: null,
      };
    },
  },
  {
    id: 'prosumer',
    primary: false,
    label: 'Optional · Launch the rooftop solar program',
    eval: (st) => ({ done: STREETS.every((id) => st.prosumers?.[id]) }),
    guide: (st) => ({
      title: 'Optional · Launch the rooftop solar program',
      why: 'Prosumers: homes generate their own power, use it first and export the surplus, paid at the export price (0.20 ¢/kWh).',
      steps: ['Open the Programs panel (Supply chip → Programs, or click a street of homes).', 'Enrol the six streets (2 000 ¢ each subsidy).', 'Midday exports may need storage to soak up.'],
      now: [info(`Enrolled: ${STREETS.filter((id) => st.prosumers?.[id]).length} / 6 streets`)],
      focus: { x: -100, z: -32, sel: { kind: 'building', id: 'st1' } },
      focusLabel: 'Show a street',
    }),
  },
];

// ------------------------------------------------------------------ prebuilt network and director
const PREBUILT = [
  // 66 kV backbone: coal → town substation; interconnector → town substation
  { type: 'line', from: 'coal', to: { x: -220, z: -60 } },
  { type: 'line', from: '@last', to: { x: -110, z: -60 } },
  { type: 'line', from: '@last', to: { x: 20, z: -60 } },
  { type: 'substation', at: '@last' },
  { type: 'line', from: 'link', to: { x: 20, z: -190 } },
  { type: 'line', from: '@last', to: '@node:20,-60' },
  // 11 kV to four town transformers and the port
  { type: 'line', from: '@node:20,-60', tier: 'down', to: { x: 20, z: -14 } },
  { type: 'line', from: '@last', to: { x: 60, z: -14 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:20,-14', to: { x: -12, z: -14 } },
  { type: 'line', from: '@last', to: { x: -70, z: -14 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-12,-14', to: { x: -12, z: 60 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-12,60', tier: 'up', to: { x: 18, z: 60 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-12,60', tier: 'up', to: { x: -14, z: 150 } },
  { type: 'line', from: '@last', to: { x: 120, z: 175 } },
  // 400 V
  { type: 'line', from: '@node:-70,-14', to: { x: -120, z: -14 } },
  { type: 'line', from: '@node:-70,-14', to: { x: -54, z: -40 } },
  { type: 'line', from: '@node:-70,-14', to: { x: -70, z: 14 } },
  { type: 'line', from: '@last', to: { x: -120, z: 14 } },
  { type: 'line', from: '@node:60,-14', to: { x: 110, z: -14 } },
  { type: 'line', from: '@last', to: { x: 140, z: -14 } },
  { type: 'line', from: '@node:60,-14', to: { x: 60, z: 14 } },
  { type: 'line', from: '@last', to: { x: 110, z: 14 } },
  { type: 'line', from: '@last', to: { x: 140, z: 14 } },
  { type: 'line', from: '@node:-12,60', to: { x: -24, z: 45 } },
  { type: 'line', from: '@node:-12,60', to: { x: -24, z: 80 } },
  { type: 'line', from: '@node:-12,60', to: { x: -12, z: 98 } },
  { type: 'line', from: '@last', to: { x: -40, z: 112 } },
  { type: 'line', from: '@node:18,60', to: { x: 18, z: 100 } },
  { type: 'line', from: '@last', to: { x: 50, z: 108 } },
  ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'hospital', 'school', 'o1', 'sh1', 'port'].map((b) => ({ type: 'drop', building: b })),
];

function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D;
  const d = Math.floor(state.clock / D) + 1;
  if (d === 3 && hm === 12 * 60) api.emit('stormForecast');
  if (d === 4 && hm === 17 * 60) api.emit('calmForecast');
  if (d === 3 && hm === 18 * 60) api.emit('retireSoon');
  // retirement check at 01:00 day 4
  // retirement window: the first 6 hours after coal shuts must be blackout-free and mostly clean
  if (d === 4 && hm < 6 * 60) {
    const imp = state.gens.link?.outKW || 0;
    const dem = state.flow.townDemandKW || 1;
    F.retireImport = Math.max(F.retireImport || 0, imp / dem);
    if (!api.map.customers.every((c) => state.cust[c.id].active === false || (c.surprise && !state.cust[c.id].dropped) || powered(state, c.id)) || imp > 0.5 * dem) F.retireBad = true;
  }
  if (d === 4 && hm === 6 * 60 && F.retireOk == null) {
    F.retireOk = !F.retireBad;
    api.emit(F.retireOk ? 'retireOk' : 'retireMissed');
  }
  // storm: day 4 — damage the longest player-built line at 11:00; track reliability
  const track = (key) => {
    let tot = 0;
    let on = 0;
    for (const c of api.map.customers) {
      const cs = state.cust[c.id];
      if (!cs.dropped) continue;
      tot++;
      if (powered(state, c.id)) on++;
      if (c.type === 'hospital' && !powered(state, c.id)) F[key + 'Crit'] = true;
    }
    F[key + 'On'] = (F[key + 'On'] || 0) + on;
    F[key + 'Tot'] = (F[key + 'Tot'] || 0) + tot;
    F[key + 'Rel'] = F[key + 'Tot'] ? (F[key + 'On'] / F[key + 'Tot']) * 100 : 100;
  };
  if (d === 4) {
    track('storm');
    if (hm === 11 * 60 && !F.stormHit) {
      F.stormHit = true;
      const lines = Object.keys(state.edges)
        .filter((id) => state.edges[id].kind === 'line' && !state.edges[id].legacy && state.edges[id].energized)
        .sort((a, b) => state.edges[b].length - state.edges[a].length || (a < b ? -1 : 1));
      if (lines.length) {
        state.edges[lines[0]].state = 'fault';
        api.emit('stormDamage', { target: lines[0] });
        return 'resolve';
      }
    }
    if (hm === 23 * 60 + 59) {
      F.stormOk = !F.stormCrit && F.stormRel >= 95;
      api.emit(F.stormOk ? 'stormOk' : 'stormMissed', { rel: F.stormRel });
    }
  }
  if (d === 5) {
    let need = 0;
    let got = 0;
    for (const c of api.map.customers) {
      const cs = state.cust[c.id];
      if (!cs.dropped) continue;
      need += cs.demand;
      got += cs.served;
    }
    F.calmNeed = (F.calmNeed || 0) + need;
    F.calmGot = (F.calmGot || 0) + got;
    F.calmUnserved = F.calmNeed > 0 ? (1 - F.calmGot / F.calmNeed) * 100 : 0;
    if (hm === 23 * 60 + 59) {
      F.calmOk = F.calmUnserved <= 2;
      api.emit(F.calmOk ? 'calmOk' : 'calmMissed', { pct: F.calmUnserved });
    }
  }
}

function score(state, bal) {
  const s = state.stats;
  const best = bestShare(state);
  const renew = Math.max(0, Math.min(25, ((best - 40) / 50) * 25));
  const coverage = s.custMinTotal > 0 ? s.custMinPowered / s.custMinTotal : 0;
  const reliability = Math.max(0, Math.min(25, (coverage - 0.9) * 250));
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  const emissions = Math.max(0, Math.min(15, 15 - Math.max(0, co2 - 40) / 6));
  const net = (state.days || []).reduce((a, x) => a + x.net, 0);
  const finance = Math.max(0, Math.min(20, 8 + net / 5000));
  const resilience = (state.flags.stormOk ? 8 : 0) + (state.flags.calmOk ? 7 : 0);
  const parts = { renew: Math.round(renew), reliability: Math.round(reliability), emissions: Math.round(emissions), finance: Math.round(finance), resilience };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  void bal;
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['renew', 'Renewable share', 25], ['reliability', 'Reliability', 25], ['emissions', 'Emissions', 15], ['finance', 'Finance', 20], ['resilience', 'Resilience', 15]] };
}

function metrics(state, bal) {
  const s = state.stats;
  const co2 = (state.days || []).reduce((a, x) => a + x.co2, 0) / 1000;
  return {
    powered: state.flow.powered,
    total: state.flow.activeCount ?? state.map.customers.length,
    decisions: { battery: !!state.gens.battery, hydro: !!state.gens.hydro, prosumer: STREETS.some((id) => state.prosumers?.[id]), storm: !!state.flags.stormOk },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${state.flow.activeCount ?? state.map.customers.length}`],
      ['Renewables built', fmt.kw(renewKW(state, bal))],
      ['Best renewable day', `${Math.round(bestShare(state))}%`],
      ['Reliability', `${s.custMinTotal ? ((s.custMinPowered / s.custMinTotal) * 100).toFixed(1) + '%' : 'n/a'}`],
      ['CO₂ (all days)', `${co2.toFixed(1)} t`],
      ['Storm day reliability', state.flags.stormRel != null ? `${state.flags.stormRel.toFixed(1)}%` : 'n/a'],
      ['Calm day: demand not met', state.flags.calmUnserved != null ? `${state.flags.calmUnserved.toFixed(2)}%` : 'n/a'],
      ['Operating result', fmt.cr((state.days || []).reduce((a, x) => a + x.net, 0))],
      ['Prosumer streets', `${STREETS.filter((id) => state.prosumers?.[id]).length} / 6`],
    ],
  };
}

// ------------------------------------------------------------------ narrative
const LEARN4 = {
  variable: { title: 'Variable renewables', what: 'Your first wind or solar farm is producing.', why: 'Their output follows the weather: solar is zero at night and drops under cloud; wind turbines start at 3 m/s, reach full power at 12 m/s and shut down above 25 m/s to protect themselves.', todo: ['Mix wind (often strong at night) with solar (midday).', 'Use the forecast in the Supply panel.', 'Add storage or dispatchable hydro for still, dark hours.'], real: 'Grid operators forecast wind and solar hours ahead to schedule everything else.' },
  storage: { title: 'Storage moves energy in time', what: 'Your battery is charging from surplus clean power.', why: 'It stores energy when supply exceeds demand and releases it later. About 10% is lost on the way in and out. It can’t create energy.', todo: ['Leave it on Auto for normal operation.', 'Set “Charge only” before a storm or calm spell, then back to Auto.'], real: 'Grid batteries now routinely shift solar from midday to the evening peak.' },
  retire: { title: 'Coal retires tonight', what: 'The coal station closes at midnight.', why: 'It is old, polluting and expensive to keep running. Its 3 MW must be replaced by clean sources and storage.', todo: ['Check the Supply panel: will tonight’s clean supply plus storage cover the peak?', 'The regional link fills gaps, but it costs money and brings fossil emissions.'], real: 'Regions plan coal closures years ahead so replacement capacity is online first.' },
  storm: { title: 'Storm tomorrow', what: 'A storm is forecast for day 4.', why: 'Winds above 25 m/s force turbines to shut down; cloud cuts solar; lines can be damaged.', todo: ['Charge the battery (Charge only) tonight.', 'Keep the dam reservoir full.', 'Keep a repair kit ready.'], real: 'Operators prepare for storms by securing reserves and pre-positioning crews.' },
  calm: { title: 'A calm, overcast day ahead', what: 'Tomorrow will have almost no wind and little sun.', why: 'Long still, grey spells are the hardest test for renewable grids. If the battery runs first thing in the morning, it’s empty by the evening peak.', todo: ['Refill storage and the reservoir tonight.', 'For tomorrow, put the interconnector first in the dispatch order so it carries the base load.', 'Save the battery and dam for the evening peak, then switch the order back.'], real: 'Long-duration storage, hydro and interconnectors are how renewable-heavy grids handle these spells.' },
  prosumer: { title: 'Prosumers', what: 'Homes on the program now make their own power.', why: 'They use it first and export the surplus, which you buy at the export price. At midday this can push power backwards through local transformers.', todo: ['Watch midday transformer loading.', 'Storage absorbs surplus exports.'], real: 'Net metering and feed-in tariffs pay rooftop solar owners for exported power.' },
};

const LINES4 = {
  ...L1,
  intro: [['advisor', 'Saltmarsh still runs on coal, but the station closes at midnight on day 3.'], ['sofia', 'We have wind on the ridge, sun on the marshes and a dam site on the river. Let’s build the replacement.']],
  firstRenew: [['sofia', 'First clean power on the grid! Watch how it follows the weather.']],
  stormForecast: [['advisor', 'Storm warning for tomorrow: gusts above the turbines’ cut-out. Charge the battery tonight.']],
  calmForecast: [['advisor', 'After the storm: a calm, grey day. Little wind, little sun. Fill the storage tonight.']],
  retireSoon: [['daniel', 'Coal shuts at midnight. Make sure the clean side can carry the evening.']],
  retireOk: [['maya', 'The coal station went quiet and nobody noticed. The lights stayed on.']],
  retireMissed: [['sofia', 'We lost customers when coal shut down. Add clean capacity or storage fast.']],
  stormDamage: [['sofia', 'The storm brought a line down. Crew, please.']],
  stormOk: [['maya', 'What a storm! And the hospital never lost power.']],
  calmOk: [['sofia', 'Still and grey all day, and storage and the dam carried us. That’s a real renewable grid.']],
  tutorialDone: [['advisor', 'You know the coast now. Keep it clean, and keep it on.']],
};

const TUT4 = [
  { id: 'mix', title: 'Know your weather', body: 'Click the Supply chip. The forecast shows sun (top) and wind (bottom) for the next 24 hours. A storm and a calm day are coming.', target: { ui: '#chip-mix' }, done: (st) => !!st.inspected.mix },
  { id: 'wind', title: 'Build wind on the ridge', body: 'Press G and click the ridge wind site (north-east). It connects at 66 kV: press L, click it, and run towers to the town substation.', target: { world: 'site', id: 'wind1' }, done: (st) => !!st.gens.wind1 && st.nodes.wind1?.connected },
  { id: 'solar', title: 'Add solar', body: 'Build a solar site (G) and connect it at 11 kV to the nearest 11 kV line or the substation.', target: { world: 'site', id: 'solar1' }, done: (st) => Object.values(st.gens).some((g) => g.type === 'solar') },
  { id: 'battery', title: 'Store it', body: 'Build the battery beside the substation and connect it at 11 kV. Auto mode stores surplus and covers shortfalls.', target: { world: 'site', id: 'battery' }, done: (st) => !!st.gens.battery && st.nodes.battery?.connected },
  { id: 'retire', title: 'Coal closes on day 3', body: 'Before midnight on day 3, make sure clean supply plus storage can carry the evening. Hover the objectives for details.', target: { ui: '#objectives' }, done: (st) => st.clock >= day(3, 12) || renewKW(st, BAL4) >= 3000 },
];

const ENDING4 = {
  common: ['The coal station’s chimneys are cold now.', 'Wind on the ridge, sun on the marshes, water behind the dam, and the lights stayed on through storm and calm.'],
  sustainable: 'Saltmarsh runs mostly on clean power, affordably and reliably. The transition worked.',
  reliable: 'Clean power carries most days, with the regional link as a safety net. A solid change.',
  hardwon: 'It was rough at times, but the coast left coal behind.',
  decisions: { battery: 'Your battery shifted sunshine into the evening peak.', hydro: 'The dam gave you clean power on demand.', prosumer: 'Hundreds of rooftops became small power stations.', storm: 'You kept the hospital lit through the storm.' },
  next: 'Next: Aurora, a whole city running on 100% clean electricity.',
};

const ui = {
  tutorial: TUT4,
  lines: LINES4,
  learn: LEARN4,
  ending: ENDING4,
  endTitle: 'Saltmarsh leaves coal behind',
  demandNote: 'Apartments and streets of homes peak in the evening; offices, the market and the port by day; the hospital never stops.',
  briefing: {
    text: 'The Saltmarsh coal station <b>retires at midnight on day 3</b>. Replace it with wind, solar, hydro and batteries, then get through a <b>storm</b> on day 4 and a <b>calm, cloudy</b> day 5.',
    goals: ['Build 3 MW of renewables and a battery', 'Retire coal without a blackout', 'Ride out the storm and the calm day', 'One full day at ≥ 70 % renewable electricity'],
    newSystems: ['<b>Solar</b>, <b>wind</b> and <b>hydro</b> following the <b>weather</b>', '<b>Battery storage</b> (state of charge, modes)', '<b>Prosumers</b>: rooftop solar and exports', '<b>Emissions</b> and <b>renewable share</b>'],
  },
  failCause: { clinic: { title: 'The hospital lost power too long', body: 'Saltmarsh Hospital was without power for 6 hours.', tip: 'Keep storage charged before storms and protect critical services with the shed policy.' } },
  handles: ['stormForecast', 'calmForecast', 'retireSoon', 'retireOk', 'retireMissed', 'stormDamage', 'stormOk', 'stormMissed', 'calmOk', 'calmMissed', 'program'],
  onEvent(e, u) {
    switch (e.type) {
      case 'stormForecast':
        u.audio.play('warn');
        u.say('stormForecast');
        u.hud.alert({ id: 'storm', level: 'warn', title: 'Storm tomorrow (day 4)', text: 'Turbines will cut out above 25 m/s; cloud cuts solar. Charge the battery and keep the reservoir full.', ttl: 15000, actions: [{ label: 'Forecast', fn: () => u.select({ kind: 'mix' }) }] });
        u.learnOnce('storm');
        break;
      case 'calmForecast':
        u.audio.play('warn');
        u.say('calmForecast');
        u.hud.alert({ id: 'calm', level: 'warn', title: 'Calm, overcast day tomorrow (day 5)', text: 'Little wind or sun. Fill the battery and the reservoir tonight.', ttl: 15000, actions: [{ label: 'Forecast', fn: () => u.select({ kind: 'mix' }) }] });
        u.learnOnce('calm');
        break;
      case 'retireSoon':
        u.say('retireSoon');
        u.learnOnce('retire');
        break;
      case 'retireOk':
        u.audio.play('objective');
        u.say('retireOk');
        break;
      case 'retireMissed':
        u.audio.play('critical');
        u.say('retireMissed');
        break;
      case 'stormDamage':
        u.audio.play('trip');
        u.say('stormDamage');
        u.hud.alert({ id: 'stormdmg', level: 'critical', title: 'Storm damage: a line is down', text: 'Send the repair crew.', actions: [{ label: 'Send repair crew', primary: true, fn: () => u.cmd({ type: 'repair', target: e.target }).ok && u.hud.dismiss('stormdmg') }, u.focusAct(e.target)] });
        break;
      case 'stormOk':
        u.audio.play('objective');
        u.say('stormOk');
        break;
      case 'stormMissed':
        u.hud.alert({ id: 'storm', level: 'warn', title: 'Storm day: objective missed', text: `Reliability ${e.rel.toFixed(1)}% or the hospital went dark.`, ttl: 9000 });
        break;
      case 'calmOk':
        u.audio.play('objective');
        u.say('calmOk');
        break;
      case 'calmMissed':
        u.hud.alert({ id: 'calm', level: 'warn', title: 'Calm day: objective missed', text: `${e.pct.toFixed(1)}% of demand went unserved.`, ttl: 9000 });
        break;
      case 'program':
        u.learnOnce('prosumer');
        break;
      case 'built':
        if (e.what === 'source' && ['solar', 'wind'].includes(e.type)) {
          u.say('firstRenew');
          u.learnOnce('variable');
        }
        if (e.what === 'source' && e.type === 'battery') u.learnOnce('storage');
        break;
    }
  },

  buildingExtra(c, state, ctx, { btn }) {
    if (!c.pvKWp) return '';
    const on = state.prosumers?.[c.id];
    return `<div class="why ${on ? 'ok' : ''}"><b>Rooftop solar program</b>${on ? `Enrolled · ${fmt.kw(c.pvKWp)} of panels. Surplus is exported at ${ctx.bal.exportPrice.toFixed(2)} ¢/kWh.` : `Subsidise ${fmt.kw(c.pvKWp)} of rooftop panels on this street (2 000 ¢). Homes use their own power first and export the rest.`}</div>` + (on ? '' : `<div class="actions">${btn('Enrol street · 2 000 ¢', { type: 'program', id: 'rooftop', target: c.id }, { primary: true, icon: 'sun', disabled: state.credits < 2000 })}</div>`);
  },
};

// ------------------------------------------------------------------ reference strategy
export const REF4 = [
  { type: 'inspect', target: 'mix' },
  // ridge wind at 66 kV to the town substation
  { type: 'build', site: 'wind1', option: 'wind' },
  { type: 'line', from: 'wind1', to: { x: 130, z: -120 } },
  { type: 'line', from: '@last', to: '@node:20,-60' },
  // marsh solar at 11 kV to the west transformer feeder
  { type: 'build', site: 'solar1', option: 'solar' },
  { type: 'line', from: 'solar1', to: { x: -70, z: 80 } },
  { type: 'line', from: '@last', to: { x: -70, z: 40 } },
  { type: 'line', from: '@last', to: '@node:-12,60' },
  // north solar at 11 kV to the substation
  { type: 'build', site: 'solar2', option: 'solar' },
  { type: 'line', from: 'solar2', to: { x: 40, z: -130 } },
  { type: 'line', from: '@last', to: '@node:20,-60' },
  // headland wind at 11 kV to the quay feeder
  { type: 'build', site: 'wind2', option: 'wind' },
  { type: 'line', from: 'wind2', to: { x: 280, z: 140 } },
  { type: 'line', from: '@last', to: { x: 200, z: 160 } },
  { type: 'line', from: '@last', to: '@node:120,175' },
  // dam at 11 kV, battery at the substation
  { type: 'build', site: 'hydro', option: 'hydro' },
  { type: 'line', from: 'hydro', to: { x: -200, z: -130 } },
  { type: 'line', from: '@last', to: { x: -110, z: -76 } },
  { type: 'line', from: '@last', to: '@node:20,-60' },
  { type: 'build', site: 'battery', option: 'battery' },
  { type: 'line', from: 'battery', to: '@node:20,-60' },
  { type: 'startGen', target: 'hydro' },
  { type: 'dispatchOrder', order: ['battery', 'hydro', 'coal', 'import'] },
];

export default {
  id: MAP4.id,
  n: 4,
  key: 'stage4',
  stageName: 'Stage 4 · The Green Transition',
  name: 'Saltmarsh Coast',
  region: 'Saltmarsh',
  blurb: 'The coal station retires on day 3. Replace it with wind, sun, water and batteries, and keep the lights on through a storm and a still, grey day.',
  learns: ['Solar & wind follow the weather', 'Storage moves energy in time', 'Prosumers & exports', 'Emissions & renewable share'],
  map: MAP4,
  bal: BAL4,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'sub', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'mix', 'renew', 'co2', 'weather', 'powered', 'rel'],
  objectives,
  weather: W,
  events: {
    count: [3, 4],
    avoidH: [[58, 121]], // storm, coal retirement and the calm day (day 3 noon to the end of day 5)
    pool: [
      { key: 'tsunami', excl: 'tsunami', kind: 'tsunami', weight: 2, windowH: [26, 56], warnH: 2, durH: 3, params: { area: 'the harbour front', zone: { poly: [[-470, 168], [470, 168], [470, 285], [-470, 285]] }, maxLines: 3 } },
      { key: 'tsunami2', excl: 'tsunami', kind: 'tsunami', weight: 1, windowH: [124, 156], warnH: 2, durH: 3, params: { area: 'the harbour front', zone: { poly: [[-470, 168], [470, 168], [470, 285], [-470, 285]] }, maxLines: 3 } },
      { key: 'flood', kind: 'flood', weight: 1, windowH: [124, 156], warnH: 4, durH: 4, params: { area: 'the river banks west of town', zone: { poly: [[-300, -210], [-196, -210], [-196, 130], [-300, 130]] } } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [124, 156], warnH: 3 },
      { key: 'linkTrip', kind: 'blackout', weight: 1, windowH: [124, 156], warnH: 2, durH: 3 },
      { key: 'village', kind: 'arrivals', weight: 2, windowH: [26, 56], warnH: 8, durH: 12, params: { group: 'village', at: { x: 250, z: 80 }, title: 'A fishing village is growing', text: 'Fishing families are moving into new cottages east of the harbour, with solar panels on their roofs.', say: 'The fishing families east of the harbour want to join the grid. Their roofs are covered in solar panels!', goodNews: 'Fishing village joins the grid, rooftop solar and all.', badNews: 'New fishing village still waiting to be connected.' } },
      { key: 'harbourFest', kind: 'festival', weight: 2, windowH: [124, 156], atHour: 18, warnH: 18, durH: 5, params: { name: 'The harbour festival', text: 'Saltmarsh’s harbour festival fills the waterfront with music, lights and food stalls.', ids: ['a3', 'a4', 'a5', 'a6', 'sh1', 'hospital', 'school'], mult: 1.3, startH: 18, at: { x: 0, z: 80 }, say: 'Harbour festival tonight! It’s the biggest night of the year on the coast.', goodNews: 'Harbour festival glows all night, powered by clean energy.', badNews: 'Blackout leaves the harbour festival in darkness.' } },
      { key: 'shore', kind: 'request', weight: 1, windowH: [26, 150], params: { who: 'maya', title: 'Shore power for the fishing boats', text: 'The fishing co-op asks for charging points on the quay so boats can stop running diesel engines in the harbour.', options: [{ label: 'Install shore power · 1,200 ¢', cost: 1200, yes: true, rep: 6, trust: 3, note: 'Cleaner air on the quay.', news: 'Fishing boats plug into clean shore power.' }, { label: 'Not now', rep: -3, note: 'The boats keep idling their engines.' }] } },
    ],
    protests: { hvNearHomes: 25, compensation: 2000, outages: 5, credit: 1500 },
  },
  prebuilt: PREBUILT,
  init(state) {
    state.started = true;
    state.prosumers = {};
  },
  afterPrebuilt(state) {
    for (const id in state.nodes) if (state.nodes[id].kind === 'xfmr') state.nodes[id].legacy = true;
    for (const id in state.edges) state.edges[id].legacy = true;
  },
  commands: {
    program(c, api) {
      const st = api.state;
      if (c.id !== 'rooftop') return { ok: false, reason: 'badTarget' };
      const cu = api.map.customers.find((x) => x.id === c.target);
      if (!cu || !cu.pvKWp || st.prosumers[c.target]) return { ok: false, reason: 'badTarget' };
      if (st.credits < 2000) return { ok: false, reason: 'noCredits' };
      api.spend(2000);
      st.prosumers[c.target] = true;
      api.emit('program', { id: 'rooftop', target: c.target });
      api.resolve();
      return { ok: true };
    },
  },
  director,
  score,
  metrics,
  refBuild(sim) {
    runSteps(sim.cmd, sim.state, REF4);
    for (const id of STREETS) sim.cmd({ type: 'program', id: 'rooftop', target: id });
  },
  autoplay(sim) {
    runSteps(sim.cmd, sim.state, REF4);
    for (const id of STREETS) sim.cmd({ type: 'program', id: 'rooftop', target: id });
    for (let i = 0; i < 7 * D && !sim.state.result; i++) {
      sim.tick();
      const hm = sim.state.clock % D;
      const d = Math.floor(sim.state.clock / D) + 1;
      if (sim.state.gens.battery) {
        const want = (d === 3 && hm >= 20 * 60) || (d === 4 && (hm >= 16 * 60 || hm < 9 * 60)) ? 'charge' : 'auto';
        if (sim.state.gens.battery.mode !== want) sim.cmd({ type: 'battery', target: 'battery', mode: want });
      }
      if (hm === 0 && d === 5) sim.cmd({ type: 'dispatchOrder', order: ['import', 'hydro', 'battery', 'coal'] });
      if (hm === 0 && d === 6) sim.cmd({ type: 'dispatchOrder', order: ['battery', 'hydro', 'coal', 'import'] });
      for (const e of drainAndRespond(sim)) if (e.type === 'stormDamage' || e.type === 'fault') sim.cmd({ type: 'repair', target: e.target });
    }
  },
  ui,
  camera: { x: 20, z: 0, dist: 560 },
  ending: { x: 20, z: 40, dist: 320, outDist: 820, outDX: 40, outDZ: -120 },
};

export { srcType };
