// Stage 2 · Growing Demand — "Millbrook Grows" (GDD §6 Stage 2, §8.3 tariffs, §7.7 trust).
// The player inherits an operating diesel utility for Millbrook's old quarter (pre-built, undersized),
// sets per-class tariffs inside the regulator's band, keeps low-income bills affordable, connects
// the High Street and a growing estate, and rides out a heat wave and a storm.
import { BALANCE } from '../data/balance.js';
import { LINES_BASE as L1, LEARN as LEARN1 } from '../data/dialogue.js';
import { fmt } from '../data/strings.js';
import { lvNodesInReach, dropOf } from '../sim/grid.js';
import { typeDef } from '../sim/power.js';
import { runSteps } from '../sim/steps.js';
import { drainAndRespond } from '../sim/events.js';

const D2 = 1440; // minutes per day
const day = (d, h) => (d - 1) * D2 + h * 60; // absolute clock minute of day d, hour h

// ------------------------------------------------------------------ map
const home = (id, name, x, z, extra = {}) => ({ id, type: 'home', name, x, z, w: 8, d: 8, ...extra });
const row = (id, name, x, z, extra = {}) => ({ id, type: 'lowincome', name, x, z, w: 14, d: 8, scale: 3, ...extra });
const shop = (id, name, x, z, label) => ({ id, type: 'shop', name, x, z, w: 10, d: 9, label });

const GROW1 = day(2, 8);
const GROW2 = day(3, 8);

export const MAP2 = {
  id: 'stage2-millbrook',
  bounds: { minX: -240, maxX: 230, minZ: -150, maxZ: 150 },
  tile: { cx: -5, cz: 0, hw: 268, hd: 190, radius: 54 },
  life: { traffic: 0.75 },
  roads: [
    { id: 'main', x: 0, z: 0, w: 540, d: 8, lanes: true },
    { id: 'old', x: -40, z: 0, w: 7, d: 240, lanes: true },
    { id: 'high', x: 40, z: -60, w: 7, d: 112, lanes: true },
    { id: 'estate', x: 135, z: 60, w: 130, d: 7, lanes: true },
    { id: 'estateLink', x: 72, z: 30, w: 7, d: 52 },
    { id: 'yard', x: -200, z: -18, w: 6, d: 22 },
    { id: 'gasyard', x: -200, z: 16, w: 6, d: 16 },
    { id: 'depot', x: 160, z: -16, w: 8, d: 24 },
  ],
  crossings: [[-40, -7.5, false], [-40, 7.5, false], [40, -7.5, false], [-48.5, 0, true], [-31.5, 0, true]],
  water: [{ x: -120, z: 0, w: 14, d: 380 }],
  lampRoads: ['main', 'old', 'high', 'estate'],
  clear: [{ x: -160, z: 0, w: 90, d: 40 }, { x: 0, z: -10, w: 90, d: 22 }],
  core: [{ x: 0, z: 0, w: 200, d: 240 }, { x: 140, z: 60, w: 150, d: 120 }],
  sources: [{ id: 'gen', type: 'diesel', name: 'Millbrook diesel station', tier: 'MV', x: -210, z: -40, w: 14, d: 10, port: { x: -200, z: -30 }, kw: 130, fuel: 220, running: true }],
  sites: [
    { id: 'gas', name: 'Gas genset site', desc: 'Pipeline-fed plot next to the diesel station', x: -210, z: 30, w: 16, d: 12, tier: 'MV', port: { x: -198, z: 24 }, options: [{ type: 'gas', kw: 100, cost: 2400, note: 'Dispatchable and cheaper to run than diesel (0.14 ¢/kWh, no deliveries). Emits less CO₂.' }] },
  ],
  depot: { id: 'depot', x: 160, z: -36, w: 18, d: 12 },
  townCenterZ: 0,
  decor: [
    { kind: 'town', x: 330, z: -320, w: 180, d: 170, top: -8 },
    { kind: 'powerstation', x: -420, z: -300, w: 190, d: 160, top: -12 },
    { kind: 'farm', x: 20, z: 300, w: 210, d: 100, top: -9 },
    { kind: 'lake', x: -420, z: 260, w: 190, d: 170, top: -10 },
  ],
  customers: [
    // Old quarter (served by the inherited network)
    home('h1', 'Baker home', -58, -50), home('h2', 'Osei home', -27, -50), home('h3', 'Marsh home', -58, -28), home('h4', 'Ilves home', -27, -28),
    home('h5', 'Quinn home', -58, 28), home('h6', 'Varga home', -27, 28),
    row('li1', 'Mill Row', -60, 55), row('li2', 'Canal Row', -20, 55), row('li3', 'Brook Row', -60, -74), row('li4', 'Weaver Row', -20, -74),
    { id: 'clinic', type: 'clinic', name: 'Millbrook Clinic', x: -82, z: -38, w: 16, d: 12 },
    { id: 'school', type: 'school', name: 'Millbrook School', x: -40, z: 106, w: 24, d: 12 },
    { id: 'pump', type: 'pump', name: 'Water pumping station', x: -92, z: 30, w: 12, d: 10 },
    // High Street (to connect)
    shop('s1', 'Bakery', 22, -25, 'BAKERY'), shop('s2', 'Grocer', 58, -25, 'GROCER'), shop('s3', 'Pharmacy', 22, -55, 'PHARMACY'), shop('s4', 'Hardware', 58, -55, 'HARDWARE'),
    { id: 'o1', type: 'office', name: 'Millbrook Works office', x: 58, z: -90, w: 14, d: 12, floors: 3, label: 'OFFICES' },
    // New estate (appears as the town grows)
    home('n1', 'New home · Plot 1', 92, 44, { appearAt: GROW1 }), home('n2', 'New home · Plot 2', 116, 44, { appearAt: GROW1 }), home('n3', 'New home · Plot 3', 140, 44, { appearAt: GROW1 }),
    home('n4', 'New home · Plot 4', 92, 77, { appearAt: GROW1 }), home('n5', 'New home · Plot 5', 116, 77, { appearAt: GROW1 }), home('n6', 'New home · Plot 6', 140, 77, { appearAt: GROW1 }),
    home('n7', 'New home · Plot 7', 164, 44, { appearAt: GROW2 }), home('n8', 'New home · Plot 8', 164, 77, { appearAt: GROW2 }), home('n9', 'New home · Plot 9', 188, 44, { appearAt: GROW2 }), home('n10', 'New home · Plot 10', 188, 77, { appearAt: GROW2 }),
    row('li5', 'Orchard Row', 120, 104, { appearAt: GROW2 }), row('li6', 'Meadow Row', 160, 104, { appearAt: GROW2 }),
    // surprise: a school annexe goes up in some runs
    { id: 'annexe', type: 'school', name: 'School annexe (new)', x: -8, z: 108, w: 18, d: 10, surprise: 'annexe' },
  ],
};

// ------------------------------------------------------------------ balance
const P = (f) => f;
const homeProfile = P((h) => (h >= 18 && h <= 22 ? 2.5 : h >= 7 && h <= 8 ? 1.4 : h >= 9 && h <= 17 ? 0.5 : 0.3));
const liProfile = P((h) => (h >= 18 && h <= 22 ? 2.2 : h >= 7 && h <= 8 ? 1.2 : h >= 9 && h <= 17 ? 0.5 : 0.3));

export const BAL2 = {
  ...BALANCE,
  start: { credits: 9000, poles: 30, transformers: 3, cable: 800, kits: 3, fuel: 220 },
  startClockMin: 12 * 60,
  costs: { ...BALANCE.costs, dailyOverhead: 200, transformer: 600 },
  procurement: { ...BALANCE.procurement, fuel: { qty: 100, cost: 500, leadH: 6 } },
  generator: { ...BALANCE.generator, maxKW: 130 },
  sourceTypes: {
    diesel: { dispatch: true, fuel: 'tank', rampH: 0.25, maxKW: 130, kWhPerFuel: 20, kWhPerFuelWorn: 16, tankMax: 320, co2: 0.75, wearPerRunHour: 0.3 },
    gas: { dispatch: true, rampH: 0.1, maxKW: 100, costPerKWh: 0.14, co2: 0.45, wearPerRunHour: 0.2 },
  },
  dispatchOrder: ['gas', 'diesel'],
  types: {
    home: { label: 'Home', cls: 'home', nominal: 1, priority: 1, profile: homeProfile },
    lowincome: { label: 'Terrace row (3 low-income homes)', cls: 'lowincome', nominal: 0.6, priority: 1, profile: liProfile, dailyKWh: 0.6 * (8 * 0.3 + 2 * 1.2 + 9 * 0.5 + 5 * 2.2) },
    shop: { label: 'Shop', cls: 'business', nominal: 4, priority: 1, profile: (h) => (h >= 8 && h <= 18 ? 1.0 : 0.15) },
    office: { label: 'Office', cls: 'business', nominal: 8, priority: 1, profile: (h) => (h >= 8 && h <= 17 ? 1.0 : h === 18 ? 0.4 : 0.1) },
    school: { label: 'School', cls: 'public', nominal: 8, priority: 2, profile: (h) => (h >= 8 && h <= 15 ? 1.0 : 0.1) },
    clinic: { label: 'Clinic', cls: 'public', nominal: 12, priority: 3, critical: true, profile: () => 1.0 },
    pump: { label: 'Water pump', cls: 'public', nominal: 6, priority: 3, critical: true, profile: (h) => ((h >= 5 && h <= 8) || (h >= 17 && h <= 21) ? 1.0 : 0.3) },
  },
  tariffs: {
    lowincome: { base: 0.3, min: 0.2, max: 0.5 },
    home: { base: 0.4, min: 0.3, max: 0.6 },
    business: { base: 0.5, min: 0.35, max: 0.8 },
    public: { base: 0.3, min: 0.2, max: 0.45 },
  },
  income: { lowincome: 68 }, // ¢ per household per day (illustrative)
  afford: { limitPct: 6 },
  trust: { start: 70, base: 84, outageWeight: 70, priceWeight: 60, affordWeight: 6, rate: 0.12, waitH: 12 },
  upgrades: { xfmr100: { ratingKW: 100, cost: 900 } },
  relCountsAll: false,
  fault: { ...BALANCE.fault },
  fail: { fuelGraceH: 3, clinicOutageH: 6, bankruptGraceH: 3, deadlineDay: 6, trustMin: 25, trustGraceH: 6, debtLimit: -1500 },
};

// demand modifiers: heat wave (fans/cooling), tariff response (simplified price elasticity)
function demandMod(state, c, kw, hour, w, bal) {
  const T = typeDef(bal, c.type);
  let k = kw;
  if (w.heat && hour >= 13 && hour <= 23 && (T.cls === 'home' || T.cls === 'lowincome' || T.cls === 'business')) k *= 1.3;
  if (state.tariffs && (T.cls === 'home' || T.cls === 'business')) k *= Math.pow(bal.tariffs[T.cls].base / state.tariffs[T.cls], 0.2);
  return k;
}

// ------------------------------------------------------------------ objectives (eval + guide card)
const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });
const k = (key) => `<kbd>${key}</kbd>`;
const SHOPS = ['s1', 's2', 's3', 's4', 'o1'];
const NEW = MAP2.customers.filter((c) => c.appearAt != null).map((c) => c.id);
const powered = (st, id) => st.cust[id].status === 'on' || st.cust[id].status === 'partial';
const T1 = (st) => Object.keys(st.nodes).find((id) => st.nodes[id].kind === 'xfmr' && st.nodes[id].legacy);

const objectives = [
  {
    id: 'tariffs',
    primary: true,
    label: 'Review the tariffs for each customer class',
    eval: (st) => ({ done: !!st.inspected.finance }),
    guide: (st, bal) => ({
      title: 'Review the tariffs for each customer class',
      why: 'Your income pays for fuel, staff and new equipment. But prices also decide how much people trust you, and whether poorer families can afford power at all.',
      steps: [`Click the <b>Yesterday</b> (cash) chip in the top bar, or the <b>Afford.</b> chip.`, 'Read the last statement and the four class tariffs.', `Use <b>−</b>/<b>+</b> to adjust a tariff inside the regulator’s band.`],
      now: [st.inspected.finance ? ok('Finance panel opened') : todo('Not opened yet'), info(`Low-income tariff ${st.tariffs.lowincome.toFixed(2)} ¢ → bill share ${st.affordPct.toFixed(1)}% (limit ${bal.afford.limitPct}%)`)],
      tip: 'Businesses can usually carry a higher tariff than low-income homes.',
      focus: null,
    }),
  },
  {
    id: 'peak',
    primary: true,
    label: 'Get the old quarter through an evening peak',
    eval: (st) => ({ done: !!st.flags.peakOk }),
    guide: (st, bal, ctx) => {
      const t1 = T1(st);
      const n = st.nodes[t1];
      const r = n ? n.ratingKW : bal.transformer.ratingKW;
      return {
        title: 'Get the old quarter through an evening peak',
        why: 'The inherited transformer T1 is rated 40 kW, but the old quarter needs about 50 kW at 18:00, when homes, terrace rows, the clinic and the water pumps all peak together.',
        steps: [`Click <b>${ctx.xfmrName(t1)}</b> (west of the Old Road junction).`, `Either <b>Upgrade</b> it to 100 kW (${bal.upgrades.xfmr100.cost} ¢), or build a second transformer and move some buildings to it.`, 'Get through 18:00–22:00 without a protective trip and with everyone lit.'],
        now: [n ? (n.forecastPeakKW > r ? warn(`${ctx.xfmrName(t1)} forecast peak <b>${fmt.kw(n.forecastPeakKW)}</b> &gt; ${fmt.kw(r)} rating`) : ok(`${ctx.xfmrName(t1)} forecast ${fmt.kw(n.forecastPeakKW)} within ${fmt.kw(r)}`)) : info('Transformer removed'), st.flags.peakOk ? ok('Evening peak handled') : todo('Next check: 22:00 tonight')],
        focus: n ? { x: n.x, z: n.z, sel: { kind: 'node', id: t1 } } : null,
        focusLabel: n ? `Show ${ctx.xfmrName(t1)}` : null,
      };
    },
  },
  {
    id: 'shops',
    primary: true,
    label: 'Power the High Street shops and offices',
    bar: true,
    eval: (st) => ({ done: SHOPS.every((id) => powered(st, id)), progress: [SHOPS.filter((id) => powered(st, id)).length, SHOPS.length] }),
    guide: (st, bal) => {
      const miss = SHOPS.filter((id) => !powered(st, id)).map((id) => MAP2.customers.find((c) => c.id === id));
      const near = miss.filter((c) => lvNodesInReach(st, bal, c.id).length && !dropOf(st, c.id));
      return {
        title: 'Power the High Street shops and offices',
        why: 'Businesses pay a higher price and use power by day, which balances the homes that use most in the evening.',
        steps: [`Draw an 11 kV line (${k('L')}) from an existing 11 kV pole east along the main road toward the High Street.`, `Mount a transformer (${k('T')}) on an 11 kV pole near the shops.`, `Run 400 V lines between the shops and connect them with ${k('C')}.`],
        now: [miss.length ? todo(`${SHOPS.length - miss.length} / ${SHOPS.length} powered`) : ok('All High Street customers powered'), near.length ? info(`Ready for a drop: <b>${near.map((c) => c.name).join(', ')}</b>`) : null].filter(Boolean),
        focus: { x: 40, z: -50 },
        focusLabel: 'Show the High Street',
      };
    },
  },
  {
    id: 'growth',
    primary: true,
    label: 'Connect the new estate as families move in',
    bar: true,
    eval: (st) => {
      const appeared = NEW.filter((id) => st.cust[id].active !== false);
      const on = appeared.filter((id) => powered(st, id)).length;
      return { done: appeared.length === NEW.length && on === NEW.length, progress: [on, NEW.length] };
    },
    guide: (st) => {
      const appeared = NEW.filter((id) => st.cust[id].active !== false);
      const waiting = appeared.filter((id) => !powered(st, id));
      return {
        title: 'Connect the new estate as families move in',
        why: 'Millbrook is growing: six homes arrive on day 2 and six more (with two terrace rows) on day 3. Families waiting for power lose trust in you.',
        steps: ['Bring 11 kV to the estate east of the High Street.', 'Add a transformer sized for the estate’s evening peak (about 33 kW, more in a heat wave).', 'Run 400 V lines along Estate Road and connect each home as it appears (marked plots show where).'],
        now: [info(`Families moved in: ${appeared.length} / ${NEW.length}${appeared.length < NEW.length ? ` · next arrivals ${st.clock < GROW1 ? 'day 2, 08:00' : 'day 3, 08:00'}` : ''}`), waiting.length ? warn(`Waiting for power: <b>${waiting.length}</b>`) : appeared.length ? ok('Everyone who has moved in is powered') : null].filter(Boolean),
        focus: { x: 140, z: 60 },
        focusLabel: 'Show the estate',
      };
    },
  },
  {
    id: 'heat',
    primary: true,
    label: 'Ride out the day-3 heat wave',
    eval: (st) => ({ done: !!st.flags.heatOk }),
    guide: (st, bal) => {
      const r = st.flags.heatRel;
      return {
        title: 'Ride out the day-3 heat wave',
        why: 'On day 3 fans and fridges push home and shop demand up 30 % from 13:00. Transformers and generators sized for a normal day may overload or run short.',
        steps: ['Check each transformer’s forecast before day 3 (hover them or press O for the Capacity overlay).', `Add spare supply: the <b>gas genset site</b> (${k('G')}) adds 100 kW.`, 'Keep the clinic and water pumps powered all day; aim for ≥ 95 % customer-hours.'],
        now: [st.clock < day(3, 0) ? info('The heat wave arrives on day 3. See the forecast in the Supply panel') : st.flags.heatOk ? ok('Heat wave handled') : r != null ? (r >= 95 ? ok(`Reliability so far today ${r.toFixed(1)}%`) : warn(`Reliability so far today ${r.toFixed(1)}% (need 95%)`)) : todo('In progress'), st.flags.heatCritOut ? warn('A vital service lost power today, so this one is missed') : null, info(`Supply available: ${fmt.kw(st.flow.availKW || 0)} vs demand ${fmt.kw(st.flow.townDemandKW || 0)}`)].filter(Boolean),
        focus: st.gens.gas ? null : { x: -210, z: 30, sel: { kind: 'site', id: 'gas' } },
        focusLabel: st.gens.gas ? null : 'Show gas site',
      };
    },
  },
  {
    id: 'cash',
    primary: true,
    label: 'Two positive daily statements in a row',
    eval: (st) => {
      let run = 0;
      for (const d of st.days || []) run = d.net >= 0 ? run + 1 : 0;
      return { done: run >= 2 || !!st.flags.cashOk, progress: [Math.min(2, run), 2] };
    },
    guide: (st) => {
      const last = st.days?.[st.days.length - 1];
      return {
        title: 'Two positive daily statements in a row',
        why: 'Your operating result must cover fuel, staff and overhead before you can keep growing. Construction is paid separately.',
        steps: ['Sell more energy: connect the High Street and the estate.', 'Lower costs: the gas genset runs at 0.14 ¢/kWh versus about 0.25 ¢/kWh for diesel fuel.', 'Adjust prices: businesses first, and keep low-income bills down.'],
        now: [last ? (last.net >= 0 ? ok(`Day ${last.day}: +${fmt.cr(last.net)}`) : warn(`Day ${last.day}: −${fmt.cr(-last.net)}`)) : info('First statement at midnight'), info(`Today so far: revenue ${fmt.cr(st.ledger.revenue)}, energy ${fmt.cr(st.ledger.energyCost)}`)],
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
      why: 'Energy poverty: when power costs too much of a poor household’s income, families cut back on heat, light and food, and trust collapses.',
      steps: ['Open Finance (cash chip).', `Keep the <b>low-income</b> tariff at or below ${(bal.income.lowincome * bal.afford.limitPct / 100 / typeDef(bal, 'lowincome').dailyKWh).toFixed(2)} ¢/kWh.`, 'Recover revenue from businesses, efficiency and cheaper generation instead.'],
      now: [st.affordPct <= bal.afford.limitPct ? ok(`Bill share ${st.affordPct.toFixed(1)}%`) : warn(`Bill share ${st.affordPct.toFixed(1)}%, over the ${bal.afford.limitPct}% limit`)],
      focus: null,
    }),
  },
  {
    id: 'trust',
    primary: true,
    live: true,
    label: 'Every customer class trusts you (≥ 60)',
    eval: (st) => ({ done: Object.values(st.trust).every((v) => v >= 60) }),
    guide: (st) => {
      const low = Object.entries(st.trust).sort((a, b) => a[1] - b[1]);
      return {
        title: 'Every customer class trusts you (≥ 60)',
        why: 'Trust follows reliability, price and fairness. The regulator watches it: below 25 for 6 hours and your licence is revoked.',
        steps: ['Avoid outages (trips, shortages, storm damage).', 'Don’t leave new families waiting long for a connection.', 'Keep prices near the regulator’s guide price, especially for households.'],
        now: low.map(([cls, v]) => (v >= 60 ? ok(`${cls}: ${Math.round(v)}`) : warn(`${cls}: ${Math.round(v)}`))),
        focus: null,
      };
    },
  },
  {
    id: 'gas',
    primary: false,
    label: 'Optional · Build the gas genset',
    eval: (st) => ({ done: !!st.gens.gas }),
    guide: (st) => ({
      title: 'Optional · Build the gas genset',
      why: 'A second unit adds 100 kW of spare capacity for growth and the heat wave, and is cheaper per kWh than diesel.',
      steps: [`Press ${k('G')} (Build) and click the marked plot south of the diesel station.`, 'Choose the gas genset (2 400 ¢).', `Run an 11 kV line (${k('L')}) from it to your network, then press Start in its card.`],
      now: [st.gens.gas ? ok(`Built · ${st.gens.gas.status}`) : todo('Not built')],
      focus: { x: -210, z: 30, sel: { kind: 'site', id: 'gas' } },
      focusLabel: 'Show gas site',
    }),
  },
];

// ------------------------------------------------------------------ director: pre-built network, peak check, storm, heat-wave tracking
const PREBUILT = [
  { type: 'line', from: 'gen', to: { x: -160, z: -9 } },
  { type: 'line', from: '@last', to: { x: -104, z: -9 } },
  { type: 'line', from: '@last', to: { x: -48, z: -9 } },
  { type: 'transformer', at: '@last' },
  { type: 'line', from: '@node:-48,-9', to: { x: -48, z: -42 } },
  { type: 'line', from: '@last', to: { x: -48, z: -76 } },
  { type: 'line', from: '@node:-48,-9', to: { x: -48, z: 20 } },
  { type: 'line', from: '@last', to: { x: -48, z: 52 } },
  { type: 'line', from: '@last', to: { x: -48, z: 90 } },
  { type: 'line', from: '@node:-48,20', to: { x: -76, z: 20 } },
  { type: 'line', from: '@node:-48,-42', to: { x: -66, z: -42 } },
  ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li1', 'li2', 'li3', 'li4', 'clinic', 'school', 'pump'].map((b) => ({ type: 'drop', building: b })),
];

function director(state, api) {
  const F = state.flags;
  const hm = state.clock % D2;
  const d = Math.floor(state.clock / D2) + 1;
  // evening-peak check (18:00–22:00) for the old quarter
  if (hm === 17 * 60) F.tripsAt17 = state.stats.trips;
  if (hm === 22 * 60 && !F.peakOk) {
    const quarter = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li1', 'li2', 'li3', 'li4', 'clinic', 'school', 'pump'];
    if (state.stats.trips === (F.tripsAt17 ?? 0) && quarter.every((id) => state.cust[id].status === 'on')) {
      F.peakOk = true;
      api.emit('peakOk');
    } else api.emit('peakMissed');
  }
  // heat-wave telegraph & tracking (day 3)
  if (d === 2 && hm === 12 * 60) api.emit('heatForecast');
  if (d === 3) {
    F.heatMin = (F.heatMin || 0) + 1;
    let tot = 0;
    let on = 0;
    for (const c of api.map.customers) {
      const cs = state.cust[c.id];
      if (cs.active === false || !cs.dropped) continue;
      tot++;
      if (cs.status === 'on' || cs.status === 'partial') on++;
      if ((c.type === 'clinic' || c.type === 'pump') && cs.everPowered && !(cs.status === 'on' || cs.status === 'partial')) F.heatCritOut = true;
    }
    F.heatOn = (F.heatOn || 0) + on;
    F.heatTot = (F.heatTot || 0) + tot;
    F.heatRel = F.heatTot ? (F.heatOn / F.heatTot) * 100 : 100;
    if (hm === 23 * 60 + 59) {
      if (!F.heatCritOut && F.heatRel >= 95) {
        F.heatOk = true;
        api.emit('heatOk');
      } else api.emit('heatMissed', { rel: F.heatRel });
    }
  }
  // storm: telegraphed day 2 20:00, a player-built 11 kV span comes down day 3 02:00
  if (d === 2 && hm === 20 * 60) api.emit('stormForecast');
  if (d === 3 && hm === 2 * 60 && !F.stormDone) {
    F.stormDone = true;
    const mv = Object.keys(state.edges)
      .filter((id) => state.edges[id].kind === 'line' && state.edges[id].tier === 'MV' && !state.edges[id].legacy && state.edges[id].energized)
      .sort((a, b) => state.edges[b].length - state.edges[a].length || (a < b ? -1 : 1));
    if (mv.length) {
      const e = state.edges[mv[0]];
      e.state = 'fault';
      F.stormEdge = mv[0];
      api.emit('stormDamage', { target: mv[0] });
      return 'resolve';
    }
  }
}

function score(state, bal) {
  const s = state.stats;
  const coverage = s.custMinTotal > 0 ? s.custMinPowered / s.custMinTotal : 0;
  const trips = s.trips + (state.flags.stormEdge ? 0 : 0);
  const reliability = Math.max(0, 25 - 5 * trips - (state.flags.heatCritOut ? 8 : 0));
  const afford = Math.max(0, Math.min(15, 15 - Math.max(0, state.affordPct - 4) * 5));
  const netSum = (state.days || []).reduce((a, d) => a + d.net, 0);
  const finance = Math.max(0, Math.min(20, 10 + netSum / 80));
  const trustMin = Math.min(...Object.values(state.trust));
  const trust = Math.max(0, Math.min(15, ((trustMin - 50) / 35) * 15));
  const parts = { coverage: Math.round(coverage * 25), reliability: Math.round(reliability), afford: Math.round(afford), finance: Math.round(finance), trust: Math.round(trust) };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', spec: [['coverage', 'Coverage', 25], ['reliability', 'Reliability', 25], ['afford', 'Affordability', 15], ['finance', 'Finance', 20], ['trust', 'Trust', 15]] };
}

function metrics(state) {
  const s = state.stats;
  const days = state.days || [];
  const active = state.map.customers.filter((c) => state.cust[c.id].active !== false);
  const trustMin = Math.min(...Object.values(state.trust));
  return {
    powered: state.flow.powered,
    total: active.length,
    decisions: { gas: !!state.gens.gas, upgraded: Object.values(state.nodes).some((n) => n.upgraded), fair: state.affordPct <= 5, growth: !!state.objectives.growth },
    cells: [
      ['Customers powered', `${state.flow.powered} / ${active.length}`],
      ['Energy delivered', fmt.kwh(s.kWhDelivered)],
      ['Peak demand', fmt.kw(s.peakKW)],
      ['Reliability', `${s.custMinTotal ? ((s.custMinPowered / s.custMinTotal) * 100).toFixed(1) + '%' : 'n/a'}`],
      ['Operating result (all days)', fmt.cr(days.reduce((a, d) => a + d.net, 0))],
      ['Credits now', fmt.cr(state.credits)],
      ['Low-income bill share', `${state.affordPct.toFixed(1)}%`],
      ['Lowest trust', `${Math.round(trustMin)}`],
      ['Overload trips', `${s.trips}`],
    ],
  };
}

// ------------------------------------------------------------------ narrative & learning
const LEARN2 = {
  tariffs: { title: 'Tariffs and fairness', what: 'You set what each customer class pays per kWh, within the regulator’s band.', why: 'Your income has to cover fuel, staff and new equipment. But price affects how much people use, how much they trust you, and whether poorer families can afford power.', todo: ['Recover more from businesses, which use power to earn money.', 'Keep low-income bills under 6 % of income.', 'Cut costs (cheaper generation, fewer losses) before raising household prices.'], real: 'Real utilities file tariff schedules with a regulator; many use “lifeline” or social tariffs for low-income homes.' },
  statement: { title: 'Your first daily statement', what: 'Day closed with revenue {rev} and an operating result of {net}.', why: 'Revenue comes from kWh sold × tariff. Costs are fuel or gas, staff overhead and any penalties. Construction is capital spending and isn’t in the daily result.', todo: ['Click the cash chip any time for the breakdown and tariffs.', 'Two positive days in a row complete an objective.'], real: 'Utilities track operating margin separately from capital investment, which is usually financed over many years.' },
  growth: { title: 'The town is growing', what: 'New families have moved into the estate and need connections.', why: 'Population growth raises both energy and peak demand. Each new home adds about 2.5 kW to the evening peak.', todo: ['Connect new homes quickly. Families kept waiting lose trust.', 'Check there’s spare transformer and generator capacity as the load grows.'], real: 'Planners forecast growth years ahead so substations and lines are ready before the houses are.' },
  heat: { title: 'Heat wave tomorrow', what: 'Forecasters expect a heat wave on day 3.', why: 'Fans, fridges and cooling raise home and business demand about 30 % in the afternoon and evening. Equipment that was fine yesterday can overload.', todo: ['Check every transformer’s forecast peak and upgrade or split the busiest.', 'Add spare supply: the gas genset adds 100 kW.', 'Keep the clinic and water pumps protected.'], real: 'Heat waves set many networks’ all-time peaks; operators issue conservation appeals and bring every unit online.' },
  storm: { title: 'Storm damage', what: 'High winds brought down an 11 kV span. The customers beyond it are dark.', why: 'Overhead lines are exposed to wind and falling trees. A radial network has only one path to each customer.', todo: ['Send the repair crew to the damaged span (1 kit + labour).', 'Later stages let you add backup paths so one span can’t black out a district.'], real: 'Storms cause most distribution outages; utilities pre-position crews when they’re forecast.' },
  trust: { title: 'Trust is slipping', what: 'One customer class’s trust is falling.', why: 'Outages, long waits for a connection, high prices and unaffordable bills all pull trust down.', todo: ['Open the Trust panel for the breakdown.', 'Fix the biggest cause first.'], real: 'Regulators can fine or replace utilities that fail their customers.' },
};

const LINES2 = {
  ...L1,
  intro: [['advisor', 'Welcome to Millbrook. You’ve taken over a small diesel power company, and a town that is about to grow.'], ['sofia', 'The old quarter’s transformer is undersized. It won’t survive tonight’s peak as it is.']],
  peakOk: [['sofia', 'The old quarter made it through the peak. Nice work.']],
  peakMissed: [['sofia', 'The old quarter didn’t make it through the peak cleanly. We’ll try again tomorrow evening.']],
  growth: [['maya', 'New families are moving into the estate! They’re asking when the lights come on.']],
  heatForecast: [['advisor', 'Weather service: heat wave tomorrow. Expect about 30 % more demand from 13:00.']],
  stormForecast: [['sofia', 'Storm tonight. Keep a repair kit ready. An exposed 11 kV line could come down.']],
  stormDamage: [['sofia', 'The storm brought down an 11 kV span. Send the crew.']],
  heatOk: [['maya', 'Everyone kept their power through the heat. The clinic and the pumps never missed a beat.']],
  tariff: [['daniel', 'Tariff change noted. Watch trust and the low-income bill share.']],
  tutorialDone: [['advisor', 'You know Millbrook now. Keep growing, and keep it fair.']],
};

const TUT2 = [
  { id: 'fin', title: 'Open the books', body: 'Click the cash chip (“Yesterday”) in the top bar. Tariffs, the daily statement and affordability live there.', target: { ui: '#chip-cash' }, done: (st) => !!st.inspected.finance },
  { id: 't1', title: 'T1 will overload tonight', body: 'The old quarter needs about 50 kW at 18:00, but T1 is built for 40 kW. It will switch off an hour after the peak starts. Click T1 and Upgrade it (or build a second transformer and move load).', target: { world: 'node', find: (st) => st.nodes[T1(st)], label: 'T1: overloads at 18:00' }, done: (st) => { const n = st.nodes[T1(st)]; return !n || n.forecastPeakKW <= n.ratingKW; } },
  { id: 'shops', title: 'Wire up the High Street', body: 'Extend 11 kV east from the old quarter (L), mount a transformer near the shops (T), then 400 V lines and drops (C).', target: { world: 'marker', x: 40, z: -40, label: 'High Street' }, done: (st) => SHOPS.every((id) => powered(st, id)) },
  { id: 'gas', title: 'Cheaper, bigger supply', body: 'Press G and click the gas genset plot south of the diesel station. Connect it with an 11 kV line, then Start it in its card.', target: { world: 'site', id: 'gas' }, done: (st) => !!st.gens.gas && st.gens.gas.status !== 'off' },
  { id: 'trust', title: 'Mind your customers', body: 'Click the Trust chip. Outages, long waits, high prices and unaffordable bills all lower trust.', target: { ui: '#chip-trust' }, done: (st) => !!st.inspected.trust },
];

const ENDING2 = {
  common: ['Millbrook kept growing, and its power kept up.', 'New families on the estate switched on their lights the week they moved in.'],
  sustainable: 'Fair prices, a healthy margin and power through the heat: Millbrook trusts its utility.',
  reliable: 'The lights stayed on for nearly everyone, and the books balanced.',
  hardwon: 'It wasn’t easy, but the town grew without being left in the dark.',
  decisions: { gas: 'The gas genset gave the town spare power and cut the fuel bill.', upgraded: 'You upgraded the old transformer before it failed.', fair: 'Low-income families paid a fair share, not a crushing one.' },
  next: 'Next: the Ironvale corridor. Industry needs megawatts, and that means high voltage.',
};

const ui = {
  tutorial: TUT2,
  lines: LINES2,
  learn: LEARN2,
  ending: ENDING2,
  endTitle: 'Millbrook grows, fairly',
  demandNote: 'Homes peak in the evening (and a little at breakfast); shops and offices by day; the clinic and the water pumps never stop. On hot days homes and shops use 30 % more.',
  financeNote: 'Higher tariffs raise revenue but lower that class’s trust; prices also nudge demand down a little. Building costs are paid up front, so they aren’t in the daily result.',
  briefing: {
    text: 'Millbrook’s little diesel utility is yours. The old quarter is already wired, but its transformer is too small, the High Street wants power, and new families arrive on days 2 and 3.',
    goals: ['Get the old quarter through tonight’s peak', 'Connect the High Street and the new estate', 'Two positive daily statements, fair low-income bills, trust ≥ 60', 'Ride out the day-3 heat wave'],
    newSystems: ['Customer classes and <b>tariffs</b>', 'Daily <b>statements</b> (operating result)', '<b>Affordability</b> and <b>trust</b>', 'Population <b>growth</b> and a second generator'],
  },
  failCause: {
    trust: { title: 'Licence revoked', body: 'Public trust collapsed and the regulator replaced you as Millbrook’s utility.', tip: 'Watch the Trust panel: fix outages first, connect new homes quickly, and don’t raise household tariffs too far.' },
    clinic: { title: 'A critical service went dark too long', body: 'The clinic or the water pumps were without power for 6 hours.', tip: 'Protect critical services: leave spare capacity on their transformer and set the shed policy to Protect critical.' },
  },
  handles: ['peakOk', 'peakMissed', 'heatForecast', 'stormForecast', 'stormDamage', 'heatOk', 'heatMissed', 'tariff', 'upgraded'],
  onEvent(e, u) {
    const st = u.state;
    switch (e.type) {
      case 'peakOk':
        u.audio.play('objective');
        u.say('peakOk');
        break;
      case 'peakMissed':
        u.say('peakMissed');
        break;
      case 'heatForecast':
        u.audio.play('warn');
        u.say('heatForecast');
        u.learnOnce('heat');
        break;
      case 'stormForecast':
        u.audio.play('warn');
        u.say('stormForecast');
        u.hud.alert({ id: 'storm', level: 'warn', title: 'Storm forecast tonight', text: 'An exposed 11 kV span may come down around 02:00. Keep a repair kit and 200 ¢ ready.', ttl: 15000 });
        break;
      case 'stormDamage':
        u.audio.play('trip');
        u.say('stormDamage');
        u.hud.alert({ id: 'storm', level: 'critical', title: 'Storm damage: an 11 kV line is down', text: 'Customers beyond it are dark. Send the repair crew.', actions: [{ label: 'Send repair crew', primary: true, fn: () => u.cmd({ type: 'repair', target: e.target }).ok && u.hud.dismiss('storm') }, u.focusAct(e.target)] });
        u.learnOnce('storm', { focus: () => u.focus({ kind: 'edge', id: e.target }) });
        break;
      case 'heatOk':
        u.audio.play('objective');
        u.say('heatOk');
        break;
      case 'heatMissed':
        u.hud.alert({ id: 'heat', level: 'warn', title: 'Heat wave: objective missed', text: `Reliability was ${e.rel.toFixed(1)}% or a critical service went dark. It can’t be retried, so focus on the other goals.`, ttl: 9000 });
        break;
      case 'newCustomer': {
        if (!u.app.nudges.growth) {
          u.app.nudges.growth = true;
          u.say('growth');
          u.learnOnce('growth', { focus: () => u.focus({ kind: 'building', id: e.id }) });
        }
        break;
      }
      case 'tariff':
        if (!u.app.nudges.tariffSaid) {
          u.app.nudges.tariffSaid = true;
          u.say('tariff');
          u.learnOnce('tariffs');
        }
        break;
      case 'upgraded':
        u.audio.play('build');
        u.hud.alert({ id: 'upg', level: 'good', title: `${u.xfmrName(e.target)} upgraded to 100 kW`, ttl: 5000 });
        break;
    }
    void st;
  },
};

// ------------------------------------------------------------------ reference strategy (tests, review ending)
export const REF2 = {
  build: [
    { type: 'upgrade', target: '@node:-48,-9', kind: 'xfmr100' },
    // High Street: 11 kV east along the north verge, transformer T2 near the shops
    { type: 'line', from: '@node:-48,-9', tier: 'up', to: { x: -12, z: -9 } },
    { type: 'line', from: '@last', to: { x: 30, z: -9 } },
    { type: 'transformer', at: '@last' },
    { type: 'line', from: '@node:30,-9', to: { x: 32, z: -40 } },
    { type: 'line', from: '@last', to: { x: 33, z: -72 } },
    { type: 'line', from: '@last', to: { x: 50, z: -76 } },
    { type: 'line', from: '@node:30,-9', to: { x: 48, z: -12 } },
    ...SHOPS.map((b) => ({ type: 'drop', building: b })),
    // gas genset
    { type: 'build', site: 'gas', option: 'gas' },
    { type: 'line', from: 'gas', to: { x: -160, z: 10 } },
    { type: 'line', from: '@last', to: { x: -160, z: -9 } },
    { type: 'startGen', target: 'gas' },
    // estate feeder: 11 kV east then across the main road, transformer T3 (upgraded) beside Estate Road
    { type: 'line', from: '@node:30,-9', tier: 'up', to: { x: 62, z: -9 } },
    { type: 'line', from: '@last', to: { x: 62, z: 9 } },
    { type: 'line', from: '@last', to: { x: 62, z: 52 } },
    { type: 'line', from: '@last', to: { x: 104, z: 52 } },
    { type: 'transformer', at: '@last' },
    { type: 'upgrade', target: '@node:104,52', kind: 'xfmr100' },
    { type: 'line', from: '@node:104,52', to: { x: 128, z: 52 } },
    { type: 'line', from: '@last', to: { x: 152, z: 52 } },
    { type: 'line', from: '@last', to: { x: 176, z: 52 } },
    { type: 'line', from: '@node:104,52', to: { x: 104, z: 68 } },
    { type: 'line', from: '@last', to: { x: 128, z: 68 } },
    { type: 'line', from: '@last', to: { x: 152, z: 68 } },
    { type: 'line', from: '@last', to: { x: 176, z: 68 } },
    { type: 'line', from: '@node:152,68', to: { x: 140, z: 94 } },
  ],
};

export default {
  id: MAP2.id,
  n: 2,
  key: 'stage2',
  stageName: 'Stage 2 · Growing Demand',
  name: 'Millbrook Grows',
  region: 'Millbrook',
  blurb: 'A developing town is growing fast. Expand the grid, price it fairly and keep it reliable through a heat wave.',
  learns: ['Customer classes & tariffs', 'Affordability & trust', 'Peak demand & growth', 'Daily cash flow'],
  map: MAP2,
  bal: BAL2,
  systems: { economy: true, weather: true },
  tools: ['select', 'line', 'xfmr', 'drop', 'build', 'remove'],
  chips: ['credits', 'cash', 'demand', 'gen', 'fuel', 'powered', 'trust', 'afford', 'rel'],
  objectives,
  weather: { 3: { heat: true, label: 'Heat wave' } },
  cast: { mayor: { name: 'Henrik Dahl', role: 'Mayor of Millbrook', color: '#b48cf2', initials: 'HD' } },
  quests: {
    perDay: [1, 2],
    pool: [
      { key: 'lateShop', who: 'ravi', title: 'Late-night shopping on High Street', text: 'The shops stay open late tonight. Keep the bakery, grocer, pharmacy and hardware store lit from 17:00 to 21:00.', goal: { type: 'keepLit', ids: ['s1', 's2', 's3', 's4'], fromH: 17, toH: 21 }, reward: { credits: 300, rep: 3 }, news: 'High Street’s late opening is a hit.' },
      { key: 'water', who: 'mayor', title: 'Fill the water tanks', text: 'The pumping station is filling the town’s tanks for the weekend. Keep it running from 10:00 to 16:00.', goal: { type: 'keepLit', ids: ['pump'], fromH: 10, toH: 16 }, reward: { credits: 250, rep: 3 } },
      { key: 'vaccines', who: 'maya', title: 'Vaccination day at the clinic', text: 'The clinic is vaccinating children today. The fridge for the vaccines must stay on from 09:00 to 16:00.', goal: { type: 'keepLit', ids: ['clinic'], fromH: 9, toH: 16 }, reward: { credits: 300, rep: 4 }, news: 'Two hundred children vaccinated at Millbrook Clinic.' },
      { key: 'estate', who: 'mayor', title: 'Connect three new homes', text: 'Families on the estate are tired of waiting. Connect three more buildings today.', goal: { type: 'build', kind: 'drop', n: 3, hour: 20 }, reward: { credits: 400, rep: 3 } },
      { key: 'office', who: 'daniel', title: 'Payroll day at the Works', text: 'The Millbrook Works office runs payroll today. Their computers need power from 09:00 to 17:00.', goal: { type: 'poweredBy', id: 'o1', hour: 12 }, reward: { credits: 350, rep: 2 } },
      { key: 'noCuts', who: 'maya', title: 'An evening without cuts', text: 'No one switched off between 17:00 and 22:00, please.', goal: { type: 'noShed', fromH: 17, toH: 22 }, reward: { credits: 250, rep: 2 } },
    ],
  },
  story: [
    { day: 1, hour: 16, who: 'mayor', lines: ['Welcome to Millbrook. The old diesel station has kept us going for years, but the town is growing fast.', 'Price it fairly and keep it on. That’s all anyone asks.'] },
    { day: 2, hour: 10, who: 'leila', title: 'The Gazette wants to see your accounts', text: 'Leila from the Millbrook Gazette says people want to know where their money goes. Will you open the books?', options: [{ label: 'Open the books', rep: 5, note: 'Being open about money builds trust.', news: 'Millbrook utility opens its books to the public.' }, { label: 'No comment', rep: -3, note: 'The Gazette prints “Utility refuses to explain bills”.', news: 'Utility refuses to explain its bills.' }] },
    { day: 3, hour: 9, who: 'tom', title: 'Line workers ask for safety training', text: 'Tom, the line workers’ union rep, asks for a paid safety day after a near miss on a pole.', options: [{ label: 'Pay for training · 400 ¢', cost: 400, rep: 3, note: 'Safer crews, happier crews.', news: 'Line crews get new safety training.' }, { label: 'Not now', rep: -2, note: 'The crew grumbles.' }] },
    { day: 4, hour: 18, who: 'ravi', lines: ['Fridges full, lights on, till ringing. Best week the High Street has had in years.'] },
    { day: 5, hour: 10, who: 'amira', title: 'Solar lessons at school', text: 'Mrs Khan wants a solar science kit so pupils can learn how electricity is made.', options: [{ label: 'Buy the kit · 300 ¢', cost: 300, rep: 4, news: 'Millbrook pupils build their first solar panel.' }, { label: 'Maybe next year', rep: -1 }] },
    { day: 6, hour: 12, who: 'mayor', lines: ['The council meets tomorrow about your licence. Make today count.'] },
  ],
  events: {
    count: [7, 9],
    minGapH: 6,
    avoidH: [[44, 72]], // storm night and heat wave (day 2 evening to day 3)
    pool: [
      { key: 'flood', kind: 'flood', weight: 2, windowH: [24, 42], warnH: 4, durH: 3, params: { area: 'the river flats and the west side of the old quarter', zone: { poly: [[-136, -46], [-42, -46], [-42, 68], [-136, 68]] } } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 2, windowH: [74, 128], warnH: 3 },
      { key: 'bazaar', kind: 'festival', weight: 2, windowH: [74, 130], atHour: 18, warnH: 18, durH: 5, params: { name: 'The Friday bazaar', text: 'High Street is hosting the Friday night bazaar: stalls, music and food until late.', ids: ['s1', 's2', 's3', 's4', 'o1'], mult: 1.7, startH: 18, at: { x: 40, z: -40 }, say: 'High Street is throwing the Friday bazaar. The traders are counting on us!', goodNews: 'Bazaar crowds enjoy a bright night on High Street.', badNews: 'Blackout spoils the Friday bazaar.' } },
      { key: 'annexe', kind: 'arrivals', weight: 1, windowH: [76, 112], warnH: 8, durH: 12, params: { group: 'annexe', at: { x: -8, z: 108 }, title: 'A school annexe is opening', text: 'Millbrook School is opening a new annexe next door for the growing number of children.', say: 'The school’s new annexe opens soon. The children will need lights and heating.', goodNews: 'School annexe opens with power on day one.', badNews: 'New school annexe opens without power.' } },
      { key: 'nightTariff', kind: 'request', weight: 1, windowH: [26, 120], params: { who: 'maya', title: 'A cheaper tariff for shift workers', text: 'Night-shift workers at Millbrook Works ask for a lower home tariff. Money is tight for many families.', options: [{ label: 'Lower the home tariff by 5 ¢', yes: true, tariff: { home: -0.05 }, rep: 5, trust: 3, cls: ['home'], note: 'Less revenue from homes, but people will appreciate it.', news: 'Utility cuts home tariff after workers ask for help.' }, { label: 'Keep prices as they are', rep: -3, note: 'You keep the revenue. Some people will be disappointed.' }] } },
      { key: 'lights', kind: 'request', weight: 1, windowH: [26, 120], params: { who: 'maya', title: 'Street lights for Mill Row', text: 'Families on Mill Row say the lane is pitch dark at night and children walk home from school there. They ask you to put up street lights.', options: [{ label: 'Put up street lights · 450 ¢', cost: 450, yes: true, rep: 6, trust: 4, cls: ['lowincome'], note: 'A small cost for a safer street.', news: 'New street lights make Mill Row safer.' }, { label: 'Not right now', rep: -3, note: 'You save the money. The lane stays dark.' }] } },
      { key: 'storm', kind: 'storm', weight: 2, windowH: [74, 130], warnH: 3, durH: 2, params: { p: 0.15, max: 2 } },
      { key: 'theft', kind: 'theft', weight: 2, windowH: [26, 130], warnH: 6, params: { area: 'the old quarter', cost: 250 } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [74, 130], warnH: 10, params: { grant: 400 } },
      { key: 'sponsor', kind: 'request', weight: 1, windowH: [26, 130], params: { who: 'daniel', title: 'Millbrook Bank wants its name on your poles', text: 'Millbrook Bank offers 500 ¢ to put small adverts on the poles along High Street.', options: [{ label: 'Accept · +500 ¢', gain: 500, rep: -2, yes: true, note: 'Useful money. Some people dislike adverts on the street.', news: 'Bank adverts appear on High Street power poles.' }, { label: 'No thanks', rep: 1, note: 'High Street stays advert-free.' }] } },
      { key: 'minister', kind: 'vipVisit', weight: 2, windowH: [74, 130], atHour: 11, warnH: 14, durH: 3, params: { name: 'The energy minister', who: 'mayor', zone: { x: 40, z: -60, r: 60 }, grant: 600, text: 'The energy minister wants to see how a small utility keeps High Street running.', say: 'The minister is touring High Street. Show them what a well-run town grid looks like.', goodNews: 'Minister praises Millbrook’s “model” town grid.', badNews: 'Embarrassment as High Street goes dark during the minister’s visit.' } },
    ],
    protests: { outages: 4, credit: 800 },
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
    runSteps(sim.cmd, sim.state, REF2.build);
    for (const c of sim.map.customers) if (sim.state.cust[c.id].active !== false) sim.cmd({ type: 'drop', building: c.id });
  },
  autoplay(sim) {
    sim.cmd({ type: 'inspect', target: 'finance' });
    sim.cmd({ type: 'inspect', target: 'trust' });
    runSteps(sim.cmd, sim.state, REF2.build);
    sim.cmd({ type: 'tariff', cls: 'business', value: 0.54 });
    const dropAll = () => {
      for (const c of sim.map.customers) if (sim.state.cust[c.id].active !== false && !sim.state.dropByBuilding[c.id]) sim.cmd({ type: 'drop', building: c.id });
    };
    for (let i = 0; i < 6 * 1440 && !sim.state.result; i++) {
      sim.tick();
      if (i % 30 === 0) dropAll();
      const g = sim.state.gens.gen;
      if (g.fuel < 60 && !sim.state.orders.some((o) => o.item === 'fuel')) sim.cmd({ type: 'order', item: 'fuel' });
      for (const e of drainAndRespond(sim)) if (e.type === 'stormDamage') sim.cmd({ type: 'repair', target: e.target });
    }
  },
  ui,
  camera: { x: -30, z: 0, dist: 360 },
  ending: { x: -10, z: 10, dist: 300, outDist: 640, outDZ: 0, outDX: 0 },
};

export { LEARN1 };
