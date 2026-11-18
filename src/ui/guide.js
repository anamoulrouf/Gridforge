// Objective guide: what each milestone means, exactly how to complete it, and a live
// "right now" read-out of the player's progress (shown when hovering an objective).
// Pure function of sim state — no DOM, so it is unit-testable.
import { lvNodesInReach, dropOf } from '../sim/grid.js';
import { evalObjective } from '../sim/mission.js';
import { fmt } from '../data/strings.js';

const ok = (html) => ({ cls: 'ok', html });
const todo = (html) => ({ cls: 'todo', html });
const warn = (html) => ({ cls: 'warn', html });
const info = (html) => ({ cls: 'info', html });

const k = (key) => `<kbd>${key}</kbd>`;

/**
 * @returns {{ title, why, steps: string[], now: {cls, html}[], tip?: string,
 *             focus: {x, z, sel?} | null, focusLabel?: string }}
 */
export function objectiveGuide(state, bal, id, ctx = {}) {
  const map = state.map;
  const f = state.flow || {};
  const g = state.gen;
  const nodes = Object.values(state.nodes);
  const xfmrs = Object.entries(state.nodes).filter(([, n]) => n.kind === 'xfmr');
  const name = ctx.xfmrName || ((x) => x);
  const genFocus = { x: map.generator.x, z: map.generator.z, sel: { kind: 'gen' } };
  const r = evalObjective(state, id);
  const hourOfDay = Math.floor((state.clock % 1440) / 60);

  switch (id) {
    case 'inspect':
      return {
        title: 'Inspect the generator and total demand',
        why: 'Know how much power you can make and how much the town needs before you spend anything.',
        steps: [
          `Click the <b>generator</b>, the brick power house west of town. Its card shows the <b>100 kW</b> maximum output and the fuel tank.`,
          `Click the <b>Demand</b> chip in the top bar to open the 24-hour demand curve (evening peak about 48 kW).`,
        ],
        now: [state.inspected.gen ? ok('Generator inspected') : todo('Generator not inspected yet'), state.inspected.demand ? ok('Demand curve viewed') : todo('Demand curve not seen yet. Click <b>Demand</b> in the top bar')],
        focus: genFocus,
        focusLabel: 'Show generator',
      };

    case 'route': {
      const mv = Object.values(state.edges).filter((e) => e.kind === 'line' && e.tier === 'MV');
      const metres = mv.reduce((s, e) => s + e.length, 0);
      return {
        title: 'Build an 11 kV route from the generator',
        why: 'The generator makes 11 kV power. That voltage travels a long way without losing much, so bring it toward town.',
        steps: [
          `Press ${k('L')} (Line tool).`,
          `Click the <b>generator</b> to start the line.`,
          `Click on the ground toward town. A pole is placed automatically every ≤ ${bal.network.maxSpan} m; the cost shows before you click.`,
          `Keep clicking to extend the route. Right-click (or ${k('Esc')}) to stop.`,
          `Poles can’t stand on roads or buildings. Keep to the grass beside the road.`,
        ],
        now: [
          r.done ? ok(`11 kV route built: ${mv.length} span${mv.length === 1 ? '' : 's'}, ${Math.round(metres)} m`) : todo('No 11 kV line leaves the generator yet'),
          info(`Stock: ${state.inv.poles} poles · ${state.inv.cable} m cable · ${fmt.cr(state.credits)}`),
          info(`Cost: ${bal.costs.pole} ¢ per pole + ${bal.costs.cablePerM} ¢ per metre`),
        ],
        tip: 'Aim for the gap between the north and south houses. Then one transformer can feed each side.',
        focus: { x: map.generator.port.x, z: map.generator.port.z, sel: { kind: 'gen' } },
        focusLabel: 'Show generator',
      };
    }

    case 'xfmr': {
      const mvPoles = Object.entries(state.nodes).filter(([, n]) => n.kind === 'pole' && n.tier === 'MV');
      const placed = xfmrs.length;
      const connected = xfmrs.filter(([, n]) => n.connected).length;
      const now = [];
      if (!placed) now.push(todo('No transformer placed yet'));
      else now.push(connected ? ok(`${connected} of ${placed} transformer${placed > 1 ? 's' : ''} connected to the generator`) : warn(`${placed} placed, but none is connected to the generator by an 11 kV line`));
      if (!mvPoles.length && !placed) now.push(warn('You have no 11 kV poles yet. Build the 11 kV route first'));
      now.push(info(`In stock: ${state.inv.transformers} · cost ${bal.costs.transformer} ¢ each`));
      const last = mvPoles.length ? mvPoles[mvPoles.length - 1][1] : null;
      return {
        title: 'Place and connect a transformer',
        why: 'Buildings use 400 V. A transformer steps the 11 kV line down to 400 V for the street.',
        steps: [
          `Press ${k('T')} (Transformer tool).`,
          `Click an <b>11 kV pole</b> close to the buildings it will feed.`,
          `Lines you draw <b>out of the transformer</b> carry 400 V. Use the Line tool ${k('L')} from it to reach the houses.`,
        ],
        now,
        tip: `Each transformer is rated <b>${bal.transformer.ratingKW} kW</b>. The town needs about 48 kW around 18:00, so one transformer for the north side and one for the south keeps both under the limit.`,
        focus: last ? { x: last.x, z: last.z } : genFocus,
        focusLabel: last ? 'Show my 11 kV line' : 'Show generator',
      };
    }

    case 'connect': {
      const missing = map.customers.filter((c) => !state.cust[c.id].connected);
      const now = [r.done ? ok('All 13 customers connected') : todo(`Connected <b>${r.progress[0]} / ${r.progress[1]}</b>`)];
      const short = (c) => c.name.replace(/ home$/, '').replace('Community ', '').replace('Riverside ', '').replace('Town ', '');
      const inReach = [];
      const noPath = [];
      const far = [];
      for (const c of missing) {
        if (dropOf(state, c.id)) noPath.push(c);
        else if (lvNodesInReach(state, bal, c.id).length) inReach.push(c);
        else far.push(c);
      }
      if (!xfmrs.length) now.push(warn('Place a transformer first. 400 V lines start from it'));
      if (inReach.length) now.push(info(`Ready to connect (press ${k('C')}, click the building): <b>${inReach.map(short).join(', ')}</b>`));
      if (noPath.length) now.push(warn(`Has a drop but no supply route: <b>${noPath.map(short).join(', ')}</b>. Its 400 V line has to reach a working transformer`));
      if (far.length) now.push(todo(`No 400 V pole within ${bal.network.dropReach} m. Run a 400 V line closer to: <b>${far.map(short).join(', ')}</b>`));
      const first = inReach[0] || far[0] || missing[0];
      return {
        title: 'Connect school, clinic, market and homes',
        why: 'A building only receives power through a service drop from a 400 V pole. A line passing close by is not enough.',
        steps: [
          `Draw 400 V lines (${k('L')}) out of a transformer until a pole is within <b>${bal.network.dropReach} m</b> of each building.`,
          `Press ${k('C')} (Service drop) and click a building (${bal.costs.drop} ¢ each).`,
          `Faster: with ${k('C')}, click a 400 V pole to connect every building in reach at once.`,
        ],
        now,
        tip: 'The clinic matters most. Connect it early.',
        focus: first ? { x: first.x, z: first.z, sel: { kind: 'building', id: first.id } } : null,
        focusLabel: first ? `Show ${first.name}` : null,
      };
    }

    case 'start': {
      const now = [];
      const label = { off: 'Off', starting: 'Starting…', running: 'Running', nofuel: 'Out of fuel' }[g.status] || g.status;
      now.push(g.status === 'running' ? ok(`Generator running · ${fmt.kw(f.genKW || 0)} of ${Math.round(f.availKW || 0)} kW available`) : todo(`Generator: <b>${label}</b>${g.status === 'off' ? '. Click it and press <b>Start</b>' : ''}`));
      if (!(f.connected > 0)) now.push(warn('No building is connected yet. Power needs somewhere to go'));
      else if (g.status === 'running' && !(f.powered > 0)) now.push(warn('Running, but no building gets power. Check the transformer and 400 V lines'));
      if (g.status === 'starting') now.push(info(`Warming up: ${Math.round(f.availKW || 0)} of ${bal.generator.maxKW} kW so far. Customers come on as it speeds up`));
      else if (f.deficitKW > 0.01) now.push(warn(`Short of power by <b>${fmt.kw(f.deficitKW)}</b>, so some customers have been switched off`));
      else if (f.powered > 0) now.push(ok(`Demand met · ${f.powered} customer${f.powered > 1 ? 's' : ''} powered`));
      now.push(info(`Fuel ${Math.floor(g.fuel)} units (about 1 unit per ${bal.generator.kWhPerFuel} kWh)`));
      return {
        title: 'Start the generator and meet demand',
        why: 'Nothing lights up until the generator runs and its output covers what connected customers need.',
        steps: [
          `Click the <b>generator</b>.`,
          `Press <b>Start</b>. It ramps to full output in about ${Math.round(bal.generator.rampH * 60)} game-minutes.`,
          `Watch the <b>Generation</b> chip: output must cover demand plus small line losses.`,
        ],
        now,
        focus: genFocus,
        focusLabel: 'Show generator',
      };
    }

    case 'revenue': {
      const minsToMidnight = 1440 - (state.clock % 1440);
      const b = state.billing || {};
      return {
        title: 'Earn your first day of revenue',
        why: 'Customers pay for energy (kWh), not for power (kW). Bills are paid once a day.',
        steps: [`Keep customers powered.`, `At <b>00:00</b> every customer pays ${bal.tariff.toFixed(2)} ¢ per kWh they used that day.`, `Fuel and a ${bal.costs.dailyOverhead} ¢ daily overhead come out of your credits too.`],
        now: [
          r.done ? ok('First bill collected') : todo(`Next bill in <b>${fmt.dur(minsToMidnight)}</b> (at midnight)`),
          info(`Energy sold today: <b>${fmt.kwh(b.kWhToday || 0)}</b> about ${fmt.cr(b.revenueToday || 0)}`),
          f.powered ? info(`${f.powered} customer${f.powered > 1 ? 's' : ''} powered right now`) : warn('Nobody has power, so you’re not selling anything'),
        ],
        tip: `Use ${k('2')} or ${k('3')} to speed up time while you wait.`,
        focus: null,
      };
    }

    case 'fault': {
      const F = state.fault;
      const now = [];
      let focus = null;
      if (F.phase === 'pending') {
        now.push(info('No fault yet. Hard-working equipment can overheat, and an alert will warn you before it fails.'));
        now.push(state.inv.kits > 0 ? ok(`Repair kits ready: ${state.inv.kits}`) : warn('No repair kits. Order one from the depot'));
        now.push(state.credits >= bal.costs.repairLabour ? ok(`Credits for labour (${bal.costs.repairLabour} ¢) available`) : warn(`Keep at least ${bal.costs.repairLabour} ¢ for repair labour`));
      } else if (F.phase === 'warn') {
        const n = state.nodes[F.target];
        const inMin = Math.max(0, F.tripT - state.t);
        now.push(warn(`Transformer <b>${name(F.target)}</b> is overheating and will probably fail in about ${fmt.dur(inMin)}`));
        now.push(info('Send the crew now so they are on site when it fails.'));
        if (n) focus = { x: n.x, z: n.z, sel: { kind: 'node', id: F.target } };
      } else if (F.phase === 'active') {
        const n = state.nodes[F.target];
        now.push(todo(`Transformer <b>${name(F.target)}</b> has failed. ${F.affected.length} customer${F.affected.length === 1 ? ' is' : 's are'} dark`));
        const job = state.crew.job;
        if (job && job.target === F.target) {
          const ph = { travel: 'driving to site', standby: 'waiting on site', work: 'repairing', return: 'returning' }[job.phase] || job.phase;
          now.push(info(`Crew ${ph}${job.remain != null && job.phase !== 'standby' ? ` · ${fmt.dur(job.remain)} left` : ''}`));
        } else now.push(warn('No crew on the way. Click the transformer and press <b>Send repair crew</b>'));
        if (n) focus = { x: n.x, z: n.z, sel: { kind: 'node', id: F.target } };
      } else now.push(ok('Fault repaired and power restored'));
      return {
        title: 'Respond to the transformer fault',
        why: 'Real equipment fails. A fast, ordered response keeps the clinic and homes powered.',
        steps: [
          `Watch for an <b>Overheating</b> alert on a transformer.`,
          `Click the transformer (or the alert’s button) and press <b>Send repair crew</b>. It uses 1 repair kit and costs ${bal.costs.repairLabour} ¢.`,
          `The crew truck drives from the depot and repairs it in ${bal.crew.repairH} h. Power returns automatically.`,
        ],
        now,
        focus,
        focusLabel: focus ? `Show ${name(F.target)}` : null,
      };
    }

    case 'stable': {
      const now = [];
      const hours = Math.floor(state.stableMin / 60);
      if (state.fault.phase !== 'repaired') now.push(todo('The 24 h count starts after the transformer fault is repaired'));
      else now.push(state.stableMin >= 1440 ? ok('24 hours without a break. District complete!') : todo(`Stable for <b>${hours} / 24 h</b>`));
      { const all = f.activeCount ?? 13; now.push((f.powered || 0) >= all ? ok(`All ${all} customers powered`) : warn(`Only ${f.powered || 0} of ${all} powered. Any outage restarts the count`)); }
      for (const [xid, n] of xfmrs) {
        if (n.forecastPeakKW == null) continue;
        const pct = (n.forecastPeakKW / bal.transformer.ratingKW) * 100;
        if (pct >= 100) now.push(warn(`<b>${name(xid)}</b> will reach ${Math.round(pct)}% at the evening peak and may switch off. Move some buildings to another transformer`));
      }
      const hrsFuel = f.genKW > 0 ? (g.fuel * bal.generator.kWhPerFuel) / f.genKW : null;
      const ordered = (state.orders || []).some((o) => o.item === 'fuel');
      if (hrsFuel != null && hrsFuel < 24 - hours && !ordered) now.push(warn(`Fuel lasts about ${Math.floor(hrsFuel)} h. Order a delivery at the generator (${bal.procurement.fuel.leadH} h lead time)`));
      return {
        title: 'Keep all 13 customers powered for 24 h',
        why: 'The final proof: a full day with no outage after the fault is fixed. Finish before the end of day 5.',
        steps: ['Repair the transformer fault first. The count starts then.', 'Keep every customer powered for 24 hours in a row. Any outage restarts the count.', 'Stay ahead of the evening peak (split load across transformers) and keep fuel on order.'],
        now,
        focus: null,
      };
    }

    case 'service': {
      const peak = hourOfDay >= 18 && hourOfDay <= 22;
      const soon = hourOfDay === 16 || hourOfDay === 17;
      const goodTime = (f.townDemandKW || 0) < bal.generator.servicingCapKW * 0.9 && !peak && !soon;
      return {
        title: 'Optional · Service the generator',
        why: `Running wears the generator down. Below 50% condition it burns about 20% more fuel.`,
        steps: [`Click the <b>generator</b>.`, `Press <b>Service</b> (${bal.costs.maintain} ¢). Output is limited to ${bal.generator.servicingCapKW} kW for ${bal.crew.maintainH} h.`, `Do it in the daytime, when demand is under ${bal.generator.servicingCapKW} kW. Never during the 18:00 to 22:00 peak.`],
        now: [
          r.done ? ok('Generator serviced') : todo(`Condition <b>${Math.round(g.condition)}%</b>`),
          g.status !== 'running' ? info('Start the generator first') : goodTime ? ok(`Good time now: demand is ${fmt.kw(f.townDemandKW || 0)}, under the ${bal.generator.servicingCapKW} kW limit`) : warn(peak ? `Not now. It’s the evening peak (18:00 to 22:00), demand ${fmt.kw(f.townDemandKW || 0)}` : soon ? `Wait. The evening peak starts at 18:00 and servicing takes ${bal.crew.maintainH} h` : `Not now. Demand is ${fmt.kw(f.townDemandKW || 0)}, close to the ${bal.generator.servicingCapKW} kW limit`),
        ],
        focus: genFocus,
        focusLabel: 'Show generator',
      };
    }

    case 'losses': {
      const avg = state.stats.kWhGen > 0 ? (state.stats.kWhLoss / state.stats.kWhGen) * 100 : null;
      return {
        title: 'Optional · Keep losses under 5%',
        why: 'Some energy turns to heat in lines and transformers. You pay fuel for it but can’t bill it.',
        steps: ['Keep 400 V lines short. Put transformers close to the buildings they feed.', 'Avoid long detours and heavily loaded lines.', 'Use the <b>Capacity</b> overlay (press <kbd>O</kbd>) to spot busy lines.'],
        now: [avg == null ? info('Measured once the generator is running') : avg < 5 ? ok(`Average losses <b>${avg.toFixed(1)}%</b> (target under 5%)`) : warn(`Average losses <b>${avg.toFixed(1)}%</b>, above the 5% target`), f.genKW > 0 ? info(`Right now: ${(f.lossPct || 0).toFixed(1)}%`) : null].filter(Boolean),
        focus: null,
      };
    }
  }
  void nodes;
  return { title: id, why: '', steps: [], now: [], focus: null };
}
