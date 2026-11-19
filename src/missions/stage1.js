// Stage 1 · The Beginning — "Light the First District" (GDD §25).
// Packages the original Stage 1 content for the mission framework without changing it.
import { BALANCE } from '../data/balance.js';
import { MISSION1 } from '../data/mission1.js';
import { S } from '../data/strings.js';
import { LINES, TUTORIAL, ENDING } from '../data/dialogue.js';
import { OBJECTIVES, evalObjective, computeScore, computeMetrics } from '../sim/mission.js';
import { objectiveGuide } from '../ui/guide.js';
import { drainAndRespond } from '../sim/events.js';

const POWERED = new Set(['on', 'partial']);

/** Scripted, telegraphed transformer fault (GDD §10): warn at ~18:00 day 2, trip 1 h later. */
function faultDirector(state) {
  const bal = BALANCE;
  const F = state.fault;
  const day = Math.floor(state.clock / 1440) + 1;
  const hourMin = state.clock % 1440;
  if (F.phase === 'pending') {
    if (day < bal.fault.earliestDay) return;
    if (hourMin < bal.fault.warnHour * 60 + state.faultJitter && day === bal.fault.earliestDay) return;
    if ((state.flow.powered || 0) < bal.fault.minPowered) return;
    let best = null;
    for (const id of Object.keys(state.nodes).sort()) {
      const n = state.nodes[id];
      if (n.kind !== 'xfmr' || n.state !== 'ok' || !n.energized) continue;
      const k = (n.customers || []).length;
      if (!best || k > best.k) best = { id, k };
    }
    if (!best || best.k === 0) return;
    F.phase = 'warn';
    F.target = best.id;
    F.warnT = state.t;
    F.tripT = state.t + bal.fault.warnLeadH * 60;
    state.nodes[best.id].overheat = true;
    return { emit: ['faultWarn', { target: best.id, inMin: bal.fault.warnLeadH * 60 }] };
  }
  if (F.phase === 'warn' && state.t >= F.tripT) {
    const n = state.nodes[F.target];
    if (!n) {
      F.phase = 'pending';
      return;
    }
    n.state = 'fault';
    n.overheat = false;
    n.condition = 20;
    F.phase = 'active';
    F.tripT = state.t;
    F.affected = [...(n.customers || [])];
    return { emit: ['fault', { target: n.id, affected: F.affected }], resolve: true };
  }
}

const objectives = OBJECTIVES.map((o) => ({
  ...o,
  label: S.objectives[o.id],
  live: o.id === 'losses',
  eval: (state) => evalObjective(state, o.id),
  guide: (state, bal, ctx) => objectiveGuide(state, bal, o.id, ctx),
}));

export default {
  id: MISSION1.id,
  n: 1,
  key: 'stage1',
  stageName: S.stageName,
  name: S.missionName,
  region: 'Riverside',
  blurb: 'A rural town has never had grid power. Build the first network from a diesel generator to 13 customers.',
  learns: ['Generation → transmission → distribution', 'Power (kW) vs energy (kWh)', 'Capacity and overload', 'Fault response'],
  map: MISSION1,
  bal: BALANCE,
  systems: { economy: false },
  tools: ['select', 'line', 'xfmr', 'drop', 'remove'],
  chips: ['credits', 'demand', 'gen', 'fuel', 'powered', 'rel', 'loss'],
  objectives,
  weather: {},
  quests: {
    fromDay: 2, // day 1 is the tutorial
    perDay: [1, 2],
    pool: [
      { key: 'market', who: 'ravi', title: 'Light the market by 18:00', text: 'Ravi and the traders want lights for the evening market. Can you connect the Town Market today?', goal: { type: 'poweredBy', id: 'market', hour: 18 }, reward: { credits: 120, rep: 3 }, news: 'Town Market opens its first evening under electric light.' },
      { key: 'school', who: 'amira', title: 'Power for the school by 15:00', text: 'Mrs Khan wants to show the children a film this afternoon. The school needs power.', goal: { type: 'poweredBy', id: 'school', hour: 15 }, reward: { credits: 120, rep: 3 }, news: 'Riverside pupils watch their first film at school.' },
      { key: 'match', who: 'ravi', title: 'Keep the south street lit for the match', text: 'The Nguyen, Rahman and Kowalski families are watching the football together from 19:00 to 22:00.', goal: { type: 'keepLit', ids: ['h6', 'h7', 'h8'], fromH: 19, toH: 22 }, reward: { credits: 100, rep: 3 }, news: 'South street cheers the match on TV.' },
      { key: 'clinicNight', who: 'nana', title: 'A safe night at the clinic', text: 'A baby is due tonight. Keep the Community Clinic lit from 20:00 to 23:00.', goal: { type: 'keepLit', ids: ['clinic'], fromH: 20, toH: 23 }, reward: { credits: 150, rep: 4 }, news: 'Baby girl born under electric light at the clinic.' },
      { key: 'connect2', who: 'mayor', title: 'Connect two more buildings today', text: 'The mayor wants more homes on the grid before the council meets.', goal: { type: 'build', kind: 'drop', n: 2, hour: 20 }, reward: { credits: 150, rep: 2 } },
      { key: 'noCuts', who: 'maya', title: 'An evening without cuts', text: 'Nobody switched off between 18:00 and 22:00, please. People are cooking dinner.', goal: { type: 'noShed', fromH: 18, toH: 22 }, reward: { credits: 100, rep: 2 } },
    ],
  },
  story: [
    { day: 2, hour: 8, who: 'mayor', lines: ['Good morning! I’m Grace Okafor, the mayor. The whole town was talking about the lights last night.', 'Keep it going. People are starting to believe this will last.'] },
    { day: 2, hour: 15, who: 'amira', title: 'A science fair for the school', text: 'Mrs Khan, the head teacher, asks if you’ll sponsor the school science fair. The prize is a model generator.', options: [{ label: 'Sponsor it · 150 ¢', cost: 150, rep: 4, note: 'The children will love it.', news: 'Utility sponsors Riverside School science fair.' }, { label: 'Not this time', rep: -1, note: 'Mrs Khan understands. Money is tight.' }] },
    { day: 3, hour: 9, who: 'leila', title: 'The Riverside Courier wants an interview', text: 'Leila from the local paper wants to ask how the new grid works and what happens when it breaks.', options: [{ label: 'Talk openly', rep: 4, note: 'Honest answers build trust.', news: '“We’ll fix faults fast,” promises the new utility.' }, { label: 'No comment', rep: -2, note: 'People wonder what you’re hiding.' }] },
    { day: 3, hour: 19, who: 'ravi', lines: ['My fridge kept the milk cold all night. First time in my life!'] },
    { day: 4, hour: 10, who: 'nana', lines: ['I’m 82 years old. Last night I read a book under a light bulb. Thank you, young people.'] },
    { day: 4, hour: 16, who: 'mayor', title: 'Name the generator', text: 'The children want the diesel generator to have a name. The mayor has two favourites.', options: [{ label: '“Old Faithful”', rep: 2, news: 'Town names its generator “Old Faithful”.' }, { label: '“The Riverside Spark”', rep: 2, news: 'Town names its generator “The Riverside Spark”.' }] },
    { day: 5, hour: 9, who: 'mayor', lines: ['Last day of the trial. The council votes on your contract tonight. Make it a good one.'] },
  ],
  // Run events (three or four per playthrough, gentle: this is the first lesson)
  events: {
    count: [3, 4],
    minGapH: 6,
    avoidH: [[41, 47]], // the scripted transformer fault on day 2 evening
    pool: [
      { key: 'lane', kind: 'arrivals', weight: 2, windowH: [24, 38], warnH: 6, durH: 12, params: { group: 'lane', at: { x: 92, z: -28 }, title: 'Three new families are moving in', text: 'New homes are going up on the east lane, past the Mbeki home.', say: 'Three families are moving onto the east lane. Can we have their lights on from the first night?', goodNews: 'Welcome home! New families on the east lane get power on day one.', badNews: 'New families on the east lane still waiting for power.' } },
      { key: 'wedding', kind: 'festival', weight: 2, windowH: [60, 90], atHour: 18, warnH: 20, durH: 5, params: { name: 'The Adeyemi wedding', text: 'The Adeyemi family is holding the wedding party at the Town Market.', ids: ['market', 'h9', 'h10'], mult: 1.3, startH: 18, at: { x: 60, z: 30 }, say: 'The whole town is invited to the Adeyemi wedding at the market. Lights and music all evening!', goodNews: 'Wedding at the market dances until midnight under bright lights.', badNews: 'Power cut leaves wedding guests in the dark.' } },
      { key: 'xfmr', kind: 'xfmrFail', weight: 1, windowH: [52, 76], warnH: 3 },
      { key: 'storm', kind: 'storm', weight: 2, windowH: [26, 80], warnH: 3, durH: 2, params: { p: 0.12, max: 1 } },
      { key: 'inspection', kind: 'inspection', weight: 1, windowH: [28, 80], warnH: 10, params: { grant: 200 } },
      { key: 'sponsor', kind: 'request', weight: 1, windowH: [26, 80], params: { who: 'daniel', title: 'The market traders want to sponsor you', text: 'The Town Market traders offer 250 ¢ if they can hang their banner on your poles along the main road.', options: [{ label: 'Accept · +250 ¢', gain: 250, rep: -1, yes: true, note: 'Extra money now. A few people find the banners a bit much.', news: 'Market banners go up on the new power poles.' }, { label: 'No thanks', rep: 1, note: 'The poles stay plain.' }] } },
      { key: 'mayor', kind: 'vipVisit', weight: 2, windowH: [30, 100], atHour: 10, warnH: 12, durH: 3, params: { name: 'Mayor Okafor', who: 'mayor', zone: { x: 20, z: 10, r: 60 }, grant: 250, text: 'The mayor is walking round the town centre with the regional paper to see the new power lines.', say: 'I’m bringing the newspaper to see your work tomorrow. Please, no blackouts while we’re there!', goodNews: 'Mayor Okafor: “Riverside finally has the power it deserves.”', badNews: 'Lights go out as the mayor shows off the new grid.' } },
    ],
    protests: { outages: 4, credit: 300 },
  },
  director(state, api) {
    const r = faultDirector(state);
    if (r?.emit) api.emit(...r.emit);
    return r?.resolve ? 'resolve' : undefined;
  },
  after(state, api) {
    // clinic outage outside the scripted fault (score: reliability)
    const cl = state.cust.clinic;
    if (cl && cl.everPowered && !POWERED.has(cl.status)) {
      const scripted = state.fault.phase === 'active' && cl.xfmr === state.fault.target && cl.status === 'xfmrDown';
      if (!scripted) state.stats.clinicOutMinNonFault++;
    }
    // stability window after the fault is repaired
    // new arrivals only count once you've connected them
    const allOn = api.map.customers.every((c) => state.cust[c.id].status === 'on' || (c.surprise && !state.cust[c.id].dropped));
    if (state.fault.phase === 'repaired' && allOn) state.stableMin++;
    else if (state.fault.phase === 'repaired') {
      if (state.stableMin > 0) api.emit('stableReset');
      state.stableMin = 0;
    }
  },
  /** Reference strategy (tests, review "Play ending"): build, start, refuel, repair. */
  autoplay(sim) {
    let last = null;
    const at = (x, z) => Object.keys(sim.state.nodes).find((id) => Math.hypot(sim.state.nodes[id].x - x, sim.state.nodes[id].z - z) < 1);
    for (const s of MISSION1.reference) {
      const from = s.from === '@last' ? last : typeof s.from === 'string' && s.from.startsWith('@node:') ? at(...s.from.slice(6).split(',').map(Number)) : s.from;
      if (s.type === 'line') last = sim.cmd({ type: 'line', from, to: s.to }).last;
      else if (s.type === 'transformer') sim.cmd({ type: 'transformer', at: s.at === '@last' ? last : s.at });
      else sim.cmd({ type: 'drop', building: s.building });
    }
    sim.cmd({ type: 'inspect', target: 'gen' });
    sim.cmd({ type: 'inspect', target: 'demand' });
    sim.cmd({ type: 'startGen' });
    for (let i = 0; i < 5 * 1440 && !sim.state.result; i++) {
      sim.tick();
      if (sim.state.gen.fuel < 40 && !sim.state.orders.length) sim.cmd({ type: 'order', item: 'fuel' });
      for (const e of drainAndRespond(sim)) if (e.type === 'fault') sim.cmd({ type: 'repair', target: e.target });
    }
  },
  score: (state) => computeScore(state),
  metrics: (state) => computeMetrics(state),
  ui: { tutorial: TUTORIAL, lines: LINES, ending: ENDING, endTitle: 'The First District is lit' },
  camera: { x: -22, z: 8, dist: 310 },
};
