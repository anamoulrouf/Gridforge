// Object inspector (GDD §14): stats, state, capacity, condition, connections, costs, actions,
// and a plain-language "why" for anything that isn't working (§2 legibility before complexity).
// Also hosts the operations panels used from Stage 2 on: finance & tariffs, trust, supply mix.
import { h, icon, esc } from './dom.js';
import { S, fmt } from '../data/strings.js';
import { demandAt, typeDef, srcType, ratedKW } from '../sim/power.js';
import { lvNodesInReach, planDrop, lineRating } from '../sim/grid.js';
import { tariffOf, classOf } from '../sim/economy.js';
import { forecast } from '../sim/weather.js';

export function createInspector(ui, cb) {
  const el = h('aside', { id: 'inspector', class: 'glass', hidden: true, 'aria-label': 'Inspector' });
  ui.append(el);
  let pointerDown = false;
  el.addEventListener('pointerdown', () => (pointerDown = true));
  window.addEventListener('pointerup', () => setTimeout(() => (pointerDown = false), 0));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    cb.onAction(JSON.parse(b.dataset.act));
  });
  let lastHtml = '';

  const meter = (pct, mark = null, color = null) => {
    const cls = pct >= 100 ? 'red' : pct >= 85 ? 'amber' : '';
    return `<div class="meter ${color ? '' : cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%${color ? `;background:${color}` : ''}"></i>${mark != null ? `<span class="mark" style="left:${mark}%"></span>` : ''}</div>`;
  };
  const condMeter = (c) => `<div class="meter ${c < 40 ? 'red' : c < 70 ? 'amber' : ''}"><i style="width:${c}%"></i></div>`;
  const btn = (label, act, opts = {}) => `<button class="btn small ${opts.primary ? 'primary' : ''} ${opts.danger ? 'danger' : ''}" data-act='${esc(JSON.stringify(act))}' ${opts.disabled ? 'disabled' : ''} title="${esc(opts.title || '')}" aria-label="${esc(opts.aria || label.replace(/<[^>]+>/g, ''))}">${opts.icon ? icon(opts.icon) : ''}${label}</button>`;
  const pill = (cls, text, ic) => `<span class="status-pill ${cls}">${ic ? icon(ic) : ''}${esc(text)}</span>`;
  const head = (ic, title, sub) => `<div class="insp-head"><div class="ic">${icon(ic)}</div><div><h3>${esc(title)}</h3><div class="sub">${esc(sub)}</div></div><button class="iconbtn insp-close" data-act='{"type":"deselect"}' aria-label="Close inspector" title="Close (Esc)">${icon('x')}</button></div>`;
  const kv = (rows) => `<div class="kv">${rows.filter(Boolean).map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${v}</span>`).join('')}</div>`;
  const sec = (t) => `<div class="panel-title" style="margin-top:14px"><span>${esc(t)}</span></div>`;
  const tn = (t) => S.tierName[t] || t;
  const policySeg = (state) =>
    sec('If supply runs short') +
    `<div class="seg" role="radiogroup" aria-label="Load-shed policy"><button role="radio" aria-checked="${state.policy === 'critical'}" class="${state.policy === 'critical' ? 'on' : ''}" data-act='{"type":"policy","value":"critical"}'>Protect critical</button><button role="radio" aria-checked="${state.policy === 'equal'}" class="${state.policy === 'equal' ? 'on' : ''}" data-act='{"type":"policy","value":"equal"}'>Equal reduction</button></div>` +
    `<div class="note">${state.policy === 'critical' ? 'Critical services first (clinic, water, hospital), then public, then others.' : 'Everyone gets a reduced share — lights dim and flicker everywhere.'}</div>`;

  function render(sel, state, ctx) {
    if (!sel) {
      el.hidden = true;
      lastHtml = '';
      return;
    }
    if (pointerDown) return;
    let html = '';
    try {
      html = build(sel, state, ctx);
    } catch (e) {
      html = '';
    }
    if (!html) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (html !== lastHtml) {
      el.innerHTML = html;
      lastHtml = html;
    }
  }

  function build(sel, state, ctx) {
    const bal = ctx.bal;
    const M = ctx.mission;
    const hour = Math.floor((state.clock % 1440) / 60);
    const active = state.map.customers.filter((c) => state.cust[c.id].active !== false);

    if (sel.kind === 'demand') {
      const total = (hh) => active.reduce((s, c) => s + demandAt(bal, c.type, hh) * (c.scale || 1), 0);
      const vals = Array.from({ length: 24 }, (_, i) => total(i));
      const mx = Math.max(...vals);
      const pkH = vals.indexOf(mx);
      const bars = vals.map((v, i) => `<rect x="${i * 12 + 1}" y="${70 - (v / mx) * 62}" width="10" height="${(v / mx) * 62}" rx="2" fill="${i === hour ? '#ffc63a' : v === mx ? '#ff9f3a' : '#e8d3a8'}" opacity="${i === hour ? 1 : 0.65}"/>`).join('');
      const types = [...new Set(active.map((c) => c.type))];
      const byType = types.map((t) => {
        const cs = active.filter((c) => c.type === t);
        const T = typeDef(bal, t);
        return [`${T.label}${cs.length > 1 ? 's' : ''} (${cs.length})`, `${fmt.kw(cs.reduce((s, c) => s + demandAt(bal, c.type, hour) * (c.scale || 1), 0))} <span style="color:var(--muted)">/ ${fmt.kw(cs.reduce((s, c) => s + T.nominal * (c.scale || 1), 0))} nom.</span>`];
      });
      const nominal = active.reduce((s, c) => s + typeDef(bal, c.type).nominal * (c.scale || 1), 0);
      return (
        head('home', M.n === 1 ? 'Town demand' : `${M.region} demand`, `All ${active.length} customers`) +
        kv([['Demand now', fmt.kw(state.flow.townDemandKW)], ['Nominal total', fmt.kw(nominal)], [`Peak (${pkH}–${pkH + 1} h)`, `<span style="color:var(--amber)">${fmt.kw(mx)}</span>`], ['Energy per day', fmt.kwh(vals.reduce((a, b) => a + b, 0))]]) +
        `<svg viewBox="0 0 288 84" style="width:100%;margin:6px 0 2px" role="img" aria-label="Demand by hour">${bars}<text x="0" y="82" font-size="8" fill="#c2b29c">0h</text><text x="138" y="82" font-size="8" fill="#c2b29c">12h</text><text x="270" y="82" font-size="8" fill="#c2b29c">23h</text></svg>` +
        kv(byType) +
        `<div class="note">${M.ui.demandNote || 'Homes use 2.5× more in the evening; the school and market run by day; the clinic never stops. Size transformers for the <b>peak</b>, not the average.'}</div>`
      );
    }

    if (sel.kind === 'gen' && (!sel.id || sel.id === 'gen') && state.gen && M.n === 1) return stage1Gen(state, ctx);
    if (sel.kind === 'gen') return sourcePanel(sel.id, state, ctx);
    if (sel.kind === 'site') return sitePanel(sel.id, state, ctx);
    if (sel.kind === 'finance') return financePanel(state, ctx);
    if (sel.kind === 'trust') return trustPanel(state, ctx);
    if (sel.kind === 'mix') return mixPanel(state, ctx);
    if (sel.kind === 'programs') return M.ui.programsPanel?.(state, ctx, { btn, kv, head, sec, pill, meter }) || '';

    if (sel.kind === 'depot') {
      const j = state.crew.job;
      const name = (id) => (state.gens[id] ? ctx.srcName(id) : state.edges[id] ? `${tn(state.edges[id].tier)} line` : ctx.xfmrName(id));
      const crew = !j ? ['st-on', 'Idle at depot'] : j.phase === 'travel' ? ['st-info', `Driving to ${name(j.target)} · ${fmt.dur(j.remain)}`] : j.phase === 'standby' ? ['st-warn', `Standing by at ${name(j.target)}`] : j.phase === 'work' ? ['st-warn', `${j.type === 'repair' ? 'Repairing' : 'Servicing'} ${name(j.target)} · ${fmt.dur(j.remain)}`] : ['st-info', `Returning · ${fmt.dur(j.remain)}`];
      const P = bal.procurement;
      const ord = (item, label) => (P[item] ? btn(`${label} · ${P[item].cost} ¢`, { type: 'order', item }, { disabled: state.credits < P[item].cost, title: `Arrives in ${P[item].leadH} h` }) : '');
      const transit = state.orders.filter((o) => o.item !== 'fuel');
      return (
        head('depot', 'Grid Ops depot', 'Repair crew · stores') +
        pill(crew[0], crew[1], 'truck') +
        (state.crew.queue.length ? `<div class="note">Queued: ${state.crew.queue.map((q) => `${q.type} ${name(q.target)}`).join(', ')}</div>` : '') +
        kv([['Poles', state.inv.poles], ['Cable', `${state.inv.cable} m`], ['Transformers', state.inv.transformers], M.tools.includes('sub') ? ['Substations', state.inv.substations] : null, ['Repair kits', state.inv.kits], transit.length ? ['On order', transit.map((o) => `${o.qty} ${o.item} in ${fmt.dur(o.arriveT - state.t)}`).join(', ')] : null]) +
        `<div class="panel-title"><span>Procurement</span></div><div class="actions">${ord('poles', '+5 poles')}${ord('cable', '+100 m cable')}${ord('transformer', '+1 transformer')}${ord('substation', '+1 substation')}${ord('kits', '+1 repair kit')}</div>` +
        `<div class="note">Deliveries take a few hours of game time. Keep a repair kit in reserve for faults.</div>`
      );
    }

    if (sel.kind === 'building') {
      const c = state.map.customers.find((x) => x.id === sel.id);
      if (!c) return '';
      const cs = state.cust[c.id];
      const T = typeDef(bal, c.type);
      const st = S.status[cs.status] || { label: cs.status, why: '' };
      const cls = cs.status === 'on' ? 'st-on' : cs.status === 'partial' ? 'st-warn' : cs.status === 'unconnected' ? 'st-off' : 'st-bad';
      let why = st.why;
      if (cs.status === 'xfmrDown' && (cs.xfmr || cs.sub)) {
        const xid = state.nodes[cs.xfmr]?.state !== 'ok' ? cs.xfmr : cs.sub;
        const n = state.nodes[xid];
        if (n) why = `${n.ratio === 'HV/MV' ? 'Substation' : 'Transformer'} <b>${ctx.xfmrName(xid)}</b> is ${n.state === 'fault' ? 'FAULTED — send the repair crew' : n.state === 'trip' ? 'tripped on overload — reduce its load, then Reset' : 'under maintenance'}.`;
      }
      const reach = !cs.dropped ? lvNodesInReach(state, bal, c.id) : [];
      const dropPlan = !cs.dropped ? planDrop(state, bal, c.id) : null;
      const ic = ['home', 'lowincome', 'apartment'].includes(c.type) ? 'home' : ['school', 'clinic', 'market', 'pump', 'factory', 'office', 'shop'].includes(c.type) ? c.type : c.type === 'evhub' ? 'ev' : c.type === 'mill' || c.type === 'warehouse' ? 'factory' : 'home';
      const peak = T.nominal * (c.scale || 1) * Math.max(...Array.from({ length: 24 }, (_, i) => T.profile(i)));
      const tariff = tariffOf(state, bal, c);
      const ct = c.contract ? state.contracts?.[c.contract] : null;
      return (
        head(ic, c.name, `${T.label}${T.critical ? ' · critical service' : ''} · ${fmt.kw(T.nominal * (c.scale || 1))} nominal`) +
        pill(cls, st.label, cs.status === 'on' ? 'bolt' : cs.status === 'unconnected' ? 'plug' : 'dark') +
        `<div class="why ${cs.status === 'on' ? 'ok' : ''}"><b>${cs.status === 'on' ? 'Why it’s lit' : 'Why it’s dark'}</b>${why}</div>` +
        kv([
          ['Demand now', fmt.kw(cs.demand)],
          ['Receiving', fmt.kw(cs.served)],
          cs.pvKW > 0 || c.pvKWp ? ['Rooftop solar', `${fmt.kw(cs.pvKW || 0)} of ${fmt.kw(c.pvKWp)} peak${cs.exportKW > 0 ? ` · exporting ${fmt.kw(cs.exportKW)}` : ''}`] : null,
          ['Daily peak', fmt.kw(peak)],
          ['Energy today', fmt.kwh(cs.kWhToday)],
          ['Tariff', `${tariff.toFixed(2)} ¢/kWh${bal.tariffs ? ` · ${S.clsName[classOf(bal, c.type)] || ''}` : ''}`],
          ['Bill today', fmt.cr(cs.kWhToday * tariff)],
          ['Fed by', cs.xfmr ? ctx.xfmrName(cs.xfmr) : cs.sub ? ctx.xfmrName(cs.sub) : '—'],
          ['Priority', T.critical ? '<span style="color:var(--amber)">Critical</span>' : (T.priority ?? 1) >= 2 ? 'Public / high' : 'Standard'],
          ct ? ['Contract', ct.accepted ? `Signed · availability ${ct.minTotal ? (100 - (ct.minOut / ct.minTotal) * 100).toFixed(2) : '100.00'}%` : 'Not signed'] : null,
        ]) +
        (M.ui.buildingExtra ? M.ui.buildingExtra(c, state, ctx, { btn, kv }) : '') +
        (!cs.dropped
          ? `<div class="actions">${btn(`Add service drop · ${bal.costs.drop} ¢`, { type: 'drop', building: c.id }, { primary: true, icon: 'plug', disabled: !dropPlan?.ok, title: dropPlan?.ok ? '' : S.reasons[dropPlan?.reason] })}</div>${!reach.length ? `<div class="note">${S.reasons.noLVInReach}</div>` : ''}`
          : `<div class="actions">${btn('Remove drop', { type: 'remove', target: ctx.dropOf(c.id) }, { danger: true, icon: 'trash' })}</div>`)
      );
    }

    if (sel.kind === 'node') {
      const n = state.nodes[sel.id];
      if (!n) return '';
      if (n.kind === 'xfmr') {
        const sub = n.ratio === 'HV/MV';
        const name = ctx.xfmrName(n.id);
        const rating = n.ratingKW || (sub ? bal.substation.ratingKW : bal.transformer.ratingKW);
        const pct = n.loadPct || 0;
        let st;
        if (n.state === 'fault') st = ['st-bad', 'FAULT — needs repair', 'alert'];
        else if (n.state === 'trip') st = ['st-bad', 'Tripped (overload)', 'alert'];
        else if (n.state === 'maint') st = ['st-info', 'Under maintenance', 'wrench'];
        else if (n.overheat) st = ['st-warn', 'Overheating — failing', 'thermo'];
        else if (n.overMin > 0) st = ['st-warn', `Overloaded · trips in ${60 - n.overMin} min`, 'warn'];
        else if (pct >= 85) st = ['st-warn', 'Heavily loaded', 'warn'];
        else if (!n.connected) st = ['st-off', `No ${tn(sub ? 'HV' : 'MV')} supply`, 'plug'];
        else st = ['st-on', n.energized ? 'In service' : 'In service (no power)', 'check'];
        const cool = n.state === 'trip' ? Math.max(0, n.coolUntil - state.t) : 0;
        const job = ctx.crewJob(n.id);
        const fc = n.forecastPeakKW || 0;
        let why = '';
        if (n.state === 'fault') why = `<div class="why"><b>Failed internally.</b>Its ${n.customers.length} customers are dark until the crew repairs it (1 kit + ${bal.costs.repairLabour} ¢, ~${bal.crew.repairH} h on site).</div>`;
        else if (n.state === 'trip') why = `<div class="why"><b>Protection tripped it.</b>It carried more than ${fmt.kw(rating)} for too long. ${cool > 0 ? `Cooling: ${cool} min.` : 'Reduce its load, then Reset.'}</div>`;
        else if (n.overheat) why = `<div class="why"><b>${Math.round(n.tempC)} °C — not explained by load.</b>Something inside is failing. Send the crew now so they’re on site when it goes.</div>`;
        else if (n.wearKnown && n.hiddenWear > 0) why = `<div class="why"><b>Inspection found hidden wear (${Math.round(n.hiddenWear)}%).</b>Service it before it fails — the crew takes about ${bal.crew.maintainH} h.</div>`;
        else if (fc > rating) why = `<div class="why"><b>Forecast peak ${fmt.kw(fc)} at ${n.forecastPeakHour}:00 &gt; ${fmt.kw(rating)} rating.</b>${bal.upgrades?.xfmr100 && !sub && !n.upgraded ? 'Upgrade it, or move' : 'Move'} some customers to another ${sub ? 'substation' : 'transformer'} before the peak.</div>`;
        else if (!n.connected) why = `<div class="why"><b>Not connected to ${tn(sub ? 'HV' : 'MV')}.</b>Run a ${tn(sub ? 'HV' : 'MV')} line from the supply to it.</div>`;
        const up = bal.upgrades?.xfmr100;
        return (
          head(sub ? 'sub' : 'xfmr', `${sub ? 'Substation' : 'Transformer'} ${name}`, `${tn(sub ? 'HV' : 'MV')} → ${tn(sub ? 'MV' : 'LV')} · ${fmt.kw(rating)} rating`) +
          pill(...st) +
          why +
          `<div class="meter-label" style="margin-top:12px"><span>Load ${fmt.kw(n.loadKW || 0)} / ${fmt.kw(rating)}</span><span>${Math.round(pct)}%</span></div>` +
          meter(pct, 85) +
          kv([
            ['Temperature', `${Math.round(n.tempC)} °C`],
            ['Condition', `${Math.round(n.condition)}%${n.wearKnown && n.hiddenWear ? ' <span style="color:var(--amber)">(hidden wear found)</span>' : ''}`],
            ['Customers fed', `${n.customers.length}`],
            ['Forecast peak', `<span style="color:${fc > rating ? 'var(--red)' : fc > rating * 0.85 ? 'var(--amber)' : 'inherit'}">${fmt.kw(fc)}</span>`],
            job ? ['Crew', job] : null,
          ]) +
          condMeter(n.condition) +
          `<div class="actions">` +
          (n.state === 'trip' ? btn(cool > 0 ? `Reset (cooling ${cool} min)` : 'Reset', { type: 'reset', target: n.id }, { primary: cool <= 0, disabled: cool > 0, icon: 'restart' }) : '') +
          (n.state === 'fault' || n.overheat ? btn(`Send repair crew · ${bal.costs.repairLabour} ¢ + kit`, { type: 'repair', target: n.id }, { primary: true, icon: 'truck', disabled: !!job || state.inv.kits < 1 || state.credits < bal.costs.repairLabour, title: state.inv.kits < 1 ? S.reasons.noKits : '' }) : '') +
          (up && !sub && !n.upgraded && n.state !== 'fault' ? btn(`Upgrade to ${fmt.kw(up.ratingKW)} · ${up.cost} ¢`, { type: 'upgrade', target: n.id, kind: 'xfmr100' }, { icon: 'xfmr', disabled: state.credits < up.cost, title: 'Swap in a larger transformer — no outage (simplified).' }) : '') +
          (n.hiddenWear != null && !n.wearKnown ? btn('Inspect', { type: 'inspect', target: n.id }, { icon: 'eye', title: 'Send an inspector — reveals hidden wear (free, instant in this model).' }) : '') +
          (n.state === 'ok' && !n.overheat ? btn(`Service · ${bal.costs.maintain} ¢`, { type: 'maintain', target: n.id }, { icon: 'wrench', disabled: !!job || state.credits < bal.costs.maintain, title: 'Restores condition to 100%. Its customers lose power for ~1 h while the crew works.' }) : '') +
          (!sub ? btn('Connect buildings in reach', { type: 'dropAll', node: n.id }, { icon: 'plug' }) : '') +
          btn('Remove', { type: 'confirmRemove', target: n.id }, { danger: true, icon: 'trash' }) +
          `</div>`
        );
      }
      if (n.kind === 'pole') {
        let thru = 0;
        let conns = 0;
        for (const id in state.edges) {
          const e = state.edges[id];
          if (e.a === n.id || e.b === n.id) {
            conns++;
            if (e.kind === 'line') thru = Math.max(thru, e.loadKW);
          }
        }
        const tierDesc = { HV: 'High voltage (HV) transmission — bulk power over distance', MV: 'Medium voltage (MV) distribution', LV: 'Low voltage (LV) — feeds buildings' }[n.tier];
        const mount = n.tier === 'HV' ? (M.tools.includes('sub') ? btn(`Build substation · ${bal.costs.substation} ¢`, { type: 'substation', at: n.id }, { primary: true, icon: 'sub', disabled: state.inv.substations < 1 || state.credits < bal.costs.substation }) : '') : n.tier === 'MV' ? btn(`Mount transformer · ${bal.costs.transformer} ¢`, { type: 'transformer', at: n.id }, { primary: true, icon: 'xfmr', disabled: state.inv.transformers < 1 || state.credits < bal.costs.transformer }) : btn('Connect buildings in reach', { type: 'dropAll', node: n.id }, { primary: true, icon: 'plug' });
        return (
          head('pole', `${tn(n.tier)} ${n.tier === 'HV' ? 'tower' : 'pole'}`, tierDesc) +
          pill(n.energized ? 'st-on' : 'st-off', n.energized ? 'Energised' : n.connected ? 'Connected (no power)' : 'Not connected to supply', n.energized ? 'bolt' : 'plug') +
          kv([['Connections', conns], ['Max line load', fmt.kw(thru)], ['Voltage', tn(n.tier)]]) +
          `<div class="actions">${mount}${btn('Remove', { type: 'confirmRemove', target: n.id }, { danger: true, icon: 'trash' })}</div>` +
          `<div class="note">${n.tier === 'HV' ? 'Build a substation here to step down to 11 kV for a district.' : n.tier === 'MV' ? 'Mount a transformer here to start a 400 V branch.' : `Buildings within ${bal.network.dropReach} m can take a service drop from this pole.`}</div>`
        );
      }
      if (n.kind === 'gen') return build({ kind: 'gen', id: n.id }, state, ctx);
    }

    if (sel.kind === 'edge') {
      const e = state.edges[sel.id];
      if (!e) return '';
      const rating = e.kind === 'drop' ? null : e.ratingKW || lineRating(bal, e.tier);
      const loss = e.kind === 'line' ? e.loadKW * bal.network.lossPer100m * (e.length / 100) * (e.loadKW / rating) : 0;
      const job = ctx.crewJob(e.id);
      const cool = e.state === 'trip' ? Math.max(0, (e.coolUntil || 0) - state.t) : 0;
      const stp = e.state === 'fault' ? pill('st-bad', 'DAMAGED — needs repair', 'alert') : e.state === 'trip' ? pill('st-bad', 'Tripped (overload)', 'alert') : e.overMin > 0 ? pill('st-warn', 'Overloaded', 'warn') : pill(e.energized ? 'st-on' : 'st-off', e.energized ? 'Energised' : 'Dead', e.energized ? 'bolt' : 'plug');
      return (
        head(e.kind === 'drop' ? 'plug' : 'cable', e.kind === 'drop' ? 'Service drop' : `${tn(e.tier)} line`, `${Math.round(e.length)} m`) +
        stp +
        (e.state === 'fault' ? `<div class="why"><b>Storm damage.</b>A crew must repair it (1 kit + ${bal.costs.repairLabour} ¢).</div>` : '') +
        (e.kind === 'line' && (e.state === 'trip' || e.overMin > 0) && ctx.lineAdvice ? ((A) => `<div class="why"><b>Why it’s overloaded</b>${A.who} ${A.why}</div><div class="why"><b>How to fix</b>${A.fixes.map((f) => `• ${f}`).join('<br>')}</div>`)(ctx.lineAdvice(e.id)) : '') +
        (rating ? `<div class="meter-label" style="margin-top:12px"><span>Load ${fmt.kw(e.loadKW)}</span><span>Rating ${fmt.kw(rating)}</span></div>${meter((e.loadKW / rating) * 100)}` : '') +
        kv([e.kind === 'line' ? ['Losses now', loss >= 1 ? fmt.kw(loss) : `${(loss * 1000).toFixed(0)} W`] : null, e.kind === 'drop' ? ['Feeds', esc(state.map.customers.find((c) => c.id === e.b)?.name || '')] : null, job ? ['Crew', job] : null]) +
        (e.tie ? `<div class="why ${e.open ? '' : 'ok'}"><b>Tie switch — normally open</b>${e.open ? 'Open: the two feeders run separately. Close it to re-route supply around a fault.' : 'Closed: power can flow between the two feeders.'}</div><div class="actions">${btn(e.open ? 'Close switch' : 'Open switch', { type: 'switch', target: e.id, open: !e.open }, { primary: e.open, icon: 'cable' })}</div>` : '') +
        `<div class="actions">${e.state === 'trip' ? btn(cool > 0 ? `Reset (cooling ${cool} min)` : 'Reset', { type: 'reset', target: e.id }, { primary: cool <= 0, disabled: cool > 0, icon: 'restart' }) : ''}${e.state === 'fault' ? btn(`Send repair crew · ${bal.costs.repairLabour} ¢ + kit`, { type: 'repair', target: e.id }, { primary: true, icon: 'truck', disabled: !!job || state.inv.kits < 1 }) : ''}${btn('Remove', { type: 'confirmRemove', target: e.id }, { danger: true, icon: 'trash' })}</div>`
      );
    }
    return '';
  }

  // ---------------------------------------------------------------- Stage 1 generator (unchanged)
  function stage1Gen(state, ctx) {
    const bal = ctx.bal;
    const g = state.gen;
    const f = state.flow;
    const st = g.servicing ? ['st-info', 'Servicing (50 kW cap)', 'wrench'] : g.status === 'running' ? ['st-on', S.genState.running, 'bolt'] : g.status === 'starting' ? ['st-warn', S.genState.starting, 'bolt'] : g.status === 'nofuel' ? ['st-bad', S.genState.nofuel, 'fuel'] : ['st-off', S.genState.off, 'bolt'];
    const hrs = f.genKW > 0 ? (g.fuel * 20) / f.genKW : null;
    const transit = state.orders.filter((o) => o.item === 'fuel');
    const fuelP = bal.procurement.fuel;
    const canStart = g.status === 'off' && g.fuel > 0;
    const why = g.status === 'off' ? `<div class="why"><b>Not producing.</b>${state.started ? 'Press Start to restore supply.' : 'Press Start when your network reaches customers. Time starts flowing then.'}</div>` : g.status === 'nofuel' ? `<div class="why"><b>Out of fuel.</b>It restarts automatically when a delivery arrives.</div>` : f.deficitKW > 0.01 ? `<div class="why"><b>Short of supply by ${fmt.kw(f.deficitKW)}.</b>${g.status === 'starting' ? 'Still ramping up.' : 'Customers are being shed by your policy.'}</div>` : '';
    return (
      head('gen', 'Diesel generator', '100 kW · 11 kV output') +
      pill(...st) +
      why +
      `<div class="meter-label" style="margin-top:12px"><span>Output ${fmt.kw(f.genKW)}</span><span>Available ${fmt.kw(f.availKW)}</span></div>` +
      meter((f.genKW / 100) * 100) +
      `<div class="meter-label" style="margin-top:10px"><span>Fuel ${Math.floor(g.fuel)} / 150 u</span><span>${hrs != null ? '≈ ' + Math.floor(hrs) + ' h left' : ''}</span></div>` +
      `<div class="meter ${g.fuel < 30 ? 'amber' : ''} ${g.fuel <= 0 ? 'red' : ''}"><i style="width:${(g.fuel / 150) * 100}%;background:${g.fuel < 30 ? '' : 'var(--cyan)'}"></i></div>` +
      `<div class="meter-label" style="margin-top:10px"><span>Condition ${Math.round(g.condition)}%</span><span>${g.condition < 50 ? 'worn: 20% more fuel' : ''}</span></div>` +
      condMeter(g.condition) +
      kv([['Customers served', `${f.powered} / 13`], ['Losses', `${fmt.kw(f.lossKW)} (${(f.lossPct || 0).toFixed(1)}%)`], transit.length ? ['Fuel on the way', transit.map((o) => `${o.qty} u in ${fmt.dur(o.arriveT - state.t)}`).join(', ')] : null]) +
      `<div class="actions">` +
      (g.status === 'off' || g.status === 'nofuel' ? btn('Start', { type: 'startGen' }, { primary: true, disabled: !canStart, icon: 'play', title: canStart ? 'Start the generator' : S.reasons.noFuel }) : btn('Stop', { type: 'stopGen' }, { icon: 'pause' })) +
      btn(`Order fuel · ${fuelP.cost} ¢`, { type: 'order', item: 'fuel' }, { disabled: state.credits < fuelP.cost || g.fuel + transit.reduce((s, o) => s + o.qty, 0) + fuelP.qty > 150, icon: 'fuel', title: `${fuelP.qty} units, arrives in ${fuelP.leadH} h` }) +
      btn(`Service · ${bal.costs.maintain} ¢`, { type: 'maintain', target: 'gen' }, { disabled: state.credits < bal.costs.maintain || ctx.crewBusy('gen'), icon: 'wrench', title: 'Crew services the generator: condition back to 100%. Output capped at 50 kW for 1 h.' }) +
      `</div>` +
      policySeg(state)
    );
  }

  // ---------------------------------------------------------------- any generation source
  function sourcePanel(id, state, ctx) {
    const bal = ctx.bal;
    const g = state.gens[id];
    if (!g) return '';
    const T = srcType(bal, g.type);
    const rated = ratedKW(bal, g);
    const def = ctx.srcDef(id) || {};
    const f = state.flow;
    const name = ctx.srcName(id);
    const job = ctx.crewJob(id);
    let st;
    if (g.retired) st = ['st-off', 'Retired', 'dark'];
    else if (g.damaged) st = ['st-bad', 'Storm damage — needs repair', 'alert'];
    else if (g.servicing) st = ['st-info', 'Servicing', 'wrench'];
    else if (T.storage) st = g.chargeKW > 0.1 ? ['st-info', `Charging ${fmt.kw(g.chargeKW)}`, 'battery'] : g.outKW > 0.1 ? ['st-on', `Discharging ${fmt.kw(g.outKW)}`, 'bolt'] : ['st-off', g.mode === 'hold' ? 'Holding charge' : 'Idle', 'battery'];
    else if (T.variable) st = g.availKW > 0.5 ? ['st-on', 'Generating', T.variable === 'solar' ? 'sun' : 'wind'] : ['st-off', T.variable === 'solar' ? (state.weather?.sun > 0 ? 'Too cloudy' : 'Night — no sun') : state.weather?.wind >= 25 ? 'Storm cut-out (>25 m/s)' : 'Too little wind', T.variable === 'solar' ? 'sun' : 'wind'];
    else st = g.status === 'running' ? ['st-on', S.genState.running, 'bolt'] : g.status === 'starting' ? ['st-warn', S.genState.starting, 'bolt'] : g.status === 'nofuel' ? ['st-bad', S.genState.nofuel, 'fuel'] : ['st-off', S.genState.off, 'bolt'];
    const rows = [
      ['Rated', fmt.kw(rated)],
      ['Connects at', S.tierName[def.tier || state.nodes[id]?.tier || 'MV']],
      T.costPerKWh ? ['Running cost', `${T.costPerKWh.toFixed(2)} ¢/kWh`] : null,
      ['CO₂', T.co2 ? `${T.co2.toFixed(2)} kg/kWh` : '<span style="color:var(--green)">none</span>'],
      T.minFrac ? ['Minimum output', `${Math.round(T.minFrac * 100)}% when running`] : null,
      T.rampH ? ['Start-up', fmt.dur(T.rampH * 60)] : null,
      g.retireAt != null && !g.retired ? ['Retires', `Day ${Math.floor(g.retireAt / 1440) + 1}, ${String(Math.floor((g.retireAt % 1440) / 60)).padStart(2, '0')}:00`] : null,
      job ? ['Crew', job] : null,
    ];
    let extra = '';
    if (g.fuel != null) {
      const transit = state.orders.filter((o) => o.item === 'fuel' && (o.target || 'gen') === id);
      const fuelP = bal.procurement.fuel;
      const tankMax = T.tankMax ?? 150;
      extra += `<div class="meter-label" style="margin-top:10px"><span>Fuel ${Math.floor(g.fuel)} / ${tankMax} u</span><span>${g.outKW > 0 ? '≈ ' + Math.floor((g.fuel * (T.kWhPerFuel ?? 20)) / g.outKW) + ' h left' : ''}</span></div>${meter((g.fuel / tankMax) * 100, null, g.fuel < 30 ? 'var(--amber)' : 'var(--cyan)')}`;
      extra += kv([transit.length ? ['Fuel on the way', transit.map((o) => `${o.qty} u in ${fmt.dur(o.arriveT - state.t)}`).join(', ')] : null]);
      extra += `<div class="actions">${btn(`Order fuel · ${fuelP.cost} ¢`, { type: 'order', item: 'fuel', target: id }, { icon: 'fuel', disabled: state.credits < fuelP.cost || g.fuel + transit.reduce((s, o) => s + o.qty, 0) + fuelP.qty > tankMax, title: `${fuelP.qty} units, arrives in ${fuelP.leadH} h` })}</div>`;
    }
    if (T.storage) {
      const soc = (g.soc / g.kwh) * 100;
      extra += `<div class="meter-label" style="margin-top:10px"><span>Charge ${fmt.kwh(g.soc)} / ${fmt.kwh(g.kwh)}</span><span>${Math.round(soc)}%</span></div>${meter(soc, null, 'var(--green)')}`;
      extra += `${sec('Battery mode')}<div class="seg" role="radiogroup" aria-label="Battery mode">${[['auto', 'Auto'], ['charge', 'Charge only'], ['hold', 'Hold']].map(([m, l]) => `<button role="radio" aria-checked="${g.mode === m}" class="${g.mode === m ? 'on' : ''}" data-act='${JSON.stringify({ type: 'battery', target: id, mode: m })}'>${l}</button>`).join('')}</div>`;
      extra += `<div class="note">Auto: stores surplus clean power and covers shortfalls. It moves energy in time — it can’t create it (≈${Math.round((T.eff ?? 0.9) * 100)}% round trip).</div>`;
    }
    if (T.reservoir) {
      extra += `<div class="meter-label" style="margin-top:10px"><span>Reservoir ${fmt.kwh(g.reservoir)}</span><span>inflow ${fmt.kw(T.inflowKW || 0)}</span></div>${meter((g.reservoir / T.reservoir) * 100, null, 'var(--cyan)')}`;
    }
    const canStart = (T.dispatch || T.reservoir) && !g.retired && (g.status === 'off' || g.status === 'nofuel');
    const acts =
      (canStart ? btn('Start', { type: 'startGen', target: id }, { primary: true, icon: 'play', disabled: g.fuel != null && g.fuel <= 0 }) : '') +
      ((T.dispatch || T.reservoir) && !g.retired && (g.status === 'running' || g.status === 'starting') ? btn('Stop', { type: 'stopGen', target: id }, { icon: 'pause' }) : '') +
      (g.damaged ? btn(`Send repair crew · ${bal.costs.repairLabour} ¢ + kit`, { type: 'repair', target: id }, { primary: true, icon: 'truck', disabled: !!job || state.inv.kits < 1 }) : '') +
      (!g.retired && !T.variable && !T.storage ? btn(`Service · ${bal.costs.maintain} ¢`, { type: 'maintain', target: id }, { icon: 'wrench', disabled: !!job || state.credits < bal.costs.maintain }) : '') +
      (state.nodes[id]?.site ? btn('Remove', { type: 'confirmRemove', target: id }, { danger: true, icon: 'trash' }) : '');
    return (
      head(g.type === 'battery' ? 'battery' : g.type === 'solar' ? 'sun' : g.type === 'wind' ? 'wind' : 'gen', name, `${S.srcName[g.type]} · ${fmt.kw(rated)}`) +
      pill(...st) +
      `<div class="meter-label" style="margin-top:12px"><span>Output ${fmt.kw(g.outKW || 0)}</span><span>Available ${fmt.kw(g.availKW || 0)}</span></div>` +
      meter(((g.outKW || 0) / Math.max(1, rated)) * 100) +
      (T.dispatch ? `<div class="meter-label" style="margin-top:10px"><span>Condition ${Math.round(g.condition)}%</span><span></span></div>${condMeter(g.condition)}` : '') +
      kv(rows) +
      extra +
      (acts ? `<div class="actions">${acts}</div>` : '') +
      (f.curtailedKW > 1 && T.variable ? `<div class="note">${fmt.kw(f.curtailedKW)} of clean power is being curtailed — storage or more demand at this hour would use it.</div>` : '') +
      policySeg(state)
    );
  }

  // ---------------------------------------------------------------- build sites
  function sitePanel(id, state, ctx) {
    const bal = ctx.bal;
    const site = (state.map.sites || []).find((s) => s.id === id);
    if (!site) return '';
    if (state.gens[id]) return sourcePanel(id, state, ctx);
    const opts = site.options || [site];
    const locked = site.unlockAt != null && state.clock < site.unlockAt;
    return (
      head('plus', site.name || 'Build site', site.desc || 'Reserved plot for generation or storage') +
      (locked ? pill('st-off', `Available from day ${Math.floor(site.unlockAt / 1440) + 1}`, 'clock') : pill('st-info', 'Ready to build', 'plus')) +
      opts
        .map((o) => {
          const T = srcType(bal, o.type);
          return (
            `<div class="build-opt"><b>${S.srcName[o.type]} · ${fmt.kw(o.kw)}${o.kwh ? ` / ${fmt.kwh(o.kwh)}` : ''}</b>` +
            `<div class="note">${o.note || (T.variable === 'solar' ? 'Free fuel; follows the sun and clouds; nothing at night.' : T.variable === 'wind' ? 'Free fuel; follows the wind (cut-in 3 m/s, cut-out 25 m/s).' : T.storage ? 'Stores surplus energy and releases it at peaks or in calm, cloudy spells.' : T.costPerKWh ? `Dispatchable · ${T.costPerKWh.toFixed(2)} ¢/kWh · ${T.co2 ? T.co2 + ' kg CO₂/kWh' : 'clean'}` : '')}</div>` +
            `<div class="actions">${btn(`Build · ${fmt.cr(o.cost)}`, { type: 'build', site: id, option: o.type }, { primary: true, icon: 'plus', disabled: locked || state.credits < o.cost })}</div></div>`
          );
        })
        .join('') +
      `<div class="note">Connects at ${S.tierName[site.tier || opts[0].tier || 'MV']}. Run a line from it into your network after building.</div>`
    );
  }

  // ---------------------------------------------------------------- finance & tariffs (GDD §8.3–8.4)
  function financePanel(state, ctx) {
    const bal = ctx.bal;
    const last = state.days?.[state.days.length - 1];
    const L = state.ledger || {};
    const tariffs = bal.tariffs
      ? Object.entries(bal.tariffs)
          .map(([cls, t]) => {
            const v = state.tariffs[cls];
            const step = t.step ?? 0.02;
            return `<div class="tariff-row"><span class="tl">${esc(S.clsName[cls] || cls)}</span>${btn('−', { type: 'tariff', cls, value: Math.round((v - step) * 100) / 100 }, { disabled: v - step < t.min - 1e-9, aria: `Lower ${cls} tariff` })}<b>${v.toFixed(2)} ¢</b>${btn('+', { type: 'tariff', cls, value: Math.round((v + step) * 100) / 100 }, { disabled: v + step > t.max + 1e-9, aria: `Raise ${cls} tariff` })}<span class="tb">${t.min.toFixed(2)}–${t.max.toFixed(2)}</span></div>`;
          })
          .join('')
      : '';
    const aff = bal.afford ? `<div class="meter-label" style="margin-top:10px"><span>Low-income bill share ${(state.affordPct || 0).toFixed(1)}%</span><span>limit ${bal.afford.limitPct}%</span></div>${meter(((state.affordPct || 0) / (bal.afford.limitPct * 1.5)) * 100, (100 / 1.5), state.affordPct > bal.afford.limitPct ? 'var(--red)' : 'var(--green)')}` : '';
    const stmt = last
      ? kv([['Revenue', fmt.cr(last.revenue)], ['Energy & fuel', `−${fmt.cr(last.energyCost + (last.fuelBought || 0))}`], last.exportCredit ? ['Prosumer export credits', `−${fmt.cr(last.exportCredit)}`] : null, ['Overhead', `−${fmt.cr(last.overhead)}`], last.penalties ? ['Contract penalties', `−${fmt.cr(last.penalties)}`] : null, last.programs ? ['Programs', `−${fmt.cr(last.programs)}`] : null, last.grants ? ['Grants', `+${fmt.cr(last.grants)}`] : null, ['<b>Net</b>', `<b style="color:${last.net >= 0 ? 'var(--green)' : 'var(--red)'}">${last.net >= 0 ? '+' : '−'}${fmt.cr(Math.abs(last.net))}</b>`]])
      : '<div class="note">The first statement arrives at midnight.</div>';
    return (
      head('coins', 'Finance & tariffs', `Day ${Math.floor(state.clock / 1440) + 1}`) +
      kv([['Credits', fmt.cr(state.credits)], ['Revenue so far today', fmt.cr(L.revenue || 0)], ['Energy cost so far', fmt.cr(L.energyCost || 0)]]) +
      sec('Last daily statement') +
      stmt +
      (tariffs ? sec('Tariffs (¢ per kWh, regulator band)') + tariffs : '') +
      aff +
      `<div class="note">${ctx.mission.ui.financeNote || 'Higher tariffs raise revenue but lower trust; low-income bills above the limit hurt trust fast. Cheaper supply and fewer losses improve margins without raising prices.'}</div>`
    );
  }

  function trustPanel(state, ctx) {
    if (!state.trust) return '';
    const bal = ctx.bal;
    const rows = Object.entries(state.trust)
      .map(([cls, v]) => {
        const w = state.trustWhy?.[cls];
        const parts = w ? `<div class="note">Base ${Math.round(w.base)} · outages ${Math.round(w.outages)} · price ${Math.round(w.price)}${cls === 'lowincome' ? ` · affordability ${Math.round(w.afford)}` : ''} → heading to <b>${Math.round(w.target)}</b></div>` : '';
        return `<div class="meter-label" style="margin-top:10px"><span>${esc(S.clsName[cls] || cls)}</span><span>${Math.round(v)}</span></div>${meter(v, bal.fail.trustMin ?? 30, v < (bal.fail.trustMin ?? 30) + 10 ? 'var(--red)' : v < 60 ? 'var(--amber)' : 'var(--green)')}${parts}`;
      })
      .join('');
    return head('chat', 'Customer trust', 'By customer class (0–100)') + rows + `<div class="note">Trust moves toward its target each hour. Outages, high prices and unaffordable bills pull it down; reliable, fair service pushes it up. Below ${bal.fail.trustMin} for ${bal.fail.trustGraceH} h the regulator revokes your licence.</div>`;
  }

  // ---------------------------------------------------------------- supply mix, dispatch order, forecast
  function mixPanel(state, ctx) {
    const bal = ctx.bal;
    const gens = Object.entries(state.gens).filter(([, g]) => !g.retired);
    const total = gens.reduce((s, [, g]) => s + (g.outKW || 0), 0) + (state.flow.exportKW || 0);
    const rows = gens
      .map(([id, g]) => [`${esc(ctx.srcName(id))}`, `${fmt.kw(g.outKW || 0)} <span style="color:var(--muted)">/ ${fmt.kw(g.availKW || 0)}</span>${g.chargeKW > 0.1 ? ` <span style="color:var(--green)">+${fmt.kw(g.chargeKW)}</span>` : ''}`])
      .concat(state.flow.exportKW > 0.1 ? [['Rooftop solar (prosumers)', fmt.kw(state.flow.exportKW)]] : []);
    const order = state.dispatch || [];
    const types = [...new Set(gens.map(([, g]) => g.type).filter((t) => srcType(bal, t).dispatch || srcType(bal, t).storage))];
    const ordered = [...order.filter((t) => types.includes(t)), ...types.filter((t) => !order.includes(t))];
    const disp = ordered.length > 1
      ? sec('Dispatch order (who runs first after renewables)') +
        ordered
          .map((t, i) => {
            const up = [...ordered];
            if (i > 0) [up[i - 1], up[i]] = [up[i], up[i - 1]];
            const T = srcType(bal, t);
            const fuelCost = T.fuel && bal.procurement?.fuel ? bal.procurement.fuel.cost / bal.procurement.fuel.qty / (T.kWhPerFuel || bal.generator?.kWhPerFuel || 20) : null;
            const cost = T.costPerKWh ? `${T.costPerKWh.toFixed(2)} ¢/kWh` : fuelCost != null ? `≈${fuelCost.toFixed(2)} ¢/kWh fuel` : T.storage ? 'stored' : 'no fuel cost';
            return `<div class="tariff-row"><span class="tl">${i + 1}. ${S.srcName[t]}</span><span class="tb">${cost} · ${T.co2 ? T.co2 + ' kg/kWh' : 'clean'}</span>${btn('↑', { type: 'dispatchOrder', order: up }, { disabled: i === 0, aria: `Move ${t} up` })}</div>`;
          })
          .join('')
      : '';
    let fc = '';
    // the sun/wind forecast only matters once the map has (or can build) weather-driven supply
    const variable = Object.values(bal.sourceTypes || {}).some((T) => T.variable);
    if (ctx.mission.systems?.weather && variable) {
      const f = forecast(state.seed, state.clock, ctx.mission.weather, 24);
      const W = 288 / 24;
      const bars = f.map((w, i) => `<rect x="${i * W + 1}" y="${40 - w.sun * (1 - 0.78 * w.cloud) * 36}" width="${W - 2}" height="${w.sun * (1 - 0.78 * w.cloud) * 36}" rx="2" fill="#ffc63a"/><rect x="${i * W + 1}" y="${80 - Math.min(1, w.wind / 25) * 36}" width="${W - 2}" height="${Math.min(1, w.wind / 25) * 36}" rx="2" fill="${w.wind >= 25 || w.wind < 3 ? '#ff5a4e' : '#7cc4f0'}"/>`).join('');
      fc = sec('Next 24 h — sun (top) and wind (bottom)') + `<svg viewBox="0 0 288 84" style="width:100%" role="img" aria-label="Weather forecast">${bars}<line x1="0" x2="288" y1="${80 - (3 / 25) * 36}" y2="${80 - (3 / 25) * 36}" stroke="#c2b29c" stroke-dasharray="2 3"/></svg><div class="note">Red wind bars: below cut-in or above storm cut-out — turbines produce nothing. ${f.find((w) => w.label)?.label ? `<b>${esc(f.find((w) => w.label).label)}</b>` : ''}</div>`;
    }
    const day = state.days?.[state.days.length - 1];
    const progBtn = ctx.mission.ui.programsPanel ? `<div class="actions">${btn('Programs', { type: 'openPanel', kind: 'programs' }, { primary: true, icon: 'bolt' })}</div>` : '';
    return (
      head('bolt', 'Supply mix', `Generating ${fmt.kw(total)}`) +
      progBtn +
      kv(rows) +
      (state.ledger && Object.values(bal.sourceTypes || {}).some((T) => T.renewable || T.variable) ? kv([['Renewable share today', `${state.ledger.kWhGen > 0 ? Math.round((state.ledger.kWhRenew / state.ledger.kWhGen) * 100) : 0}%`], day ? ['Yesterday', `${Math.round(day.renewPct)}% renewable · ${(day.co2 / 1000).toFixed(2)} t CO₂`] : null, state.flow.curtailedKW > 0.5 ? ['Curtailed now', fmt.kw(state.flow.curtailedKW)] : null]) : '') +
      disp +
      fc
    );
  }

  return { render, el, get pointerDown() { return pointerDown; } };
}
