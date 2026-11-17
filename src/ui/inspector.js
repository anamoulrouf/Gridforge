// Object inspector (GDD §14): stats, state, capacity, condition, connections, costs, actions,
// and a plain-language "why" for anything that isn't working (§2 legibility before complexity).
import { h, icon, esc } from './dom.js';
import { S, fmt } from '../data/strings.js';
import { CUSTOMER_TYPES } from '../data/balance.js';
import { demandAt } from '../sim/power.js';
import { lvNodesInReach, planDrop } from '../sim/grid.js';

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

  const meter = (pct, mark = null) => {
    const cls = pct >= 100 ? 'red' : pct >= 85 ? 'amber' : '';
    return `<div class="meter ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i>${mark != null ? `<span class="mark" style="left:${mark}%"></span>` : ''}</div>`;
  };
  const condMeter = (c) => `<div class="meter ${c < 40 ? 'red' : c < 70 ? 'amber' : ''}"><i style="width:${c}%"></i></div>`;
  const btn = (label, act, opts = {}) => `<button class="btn small ${opts.primary ? 'primary' : ''} ${opts.danger ? 'danger' : ''}" data-act='${esc(JSON.stringify(act))}' ${opts.disabled ? 'disabled' : ''} title="${esc(opts.title || '')}">${opts.icon ? icon(opts.icon) : ''}${label}</button>`;
  const pill = (cls, text, ic) => `<span class="status-pill ${cls}">${ic ? icon(ic) : ''}${esc(text)}</span>`;
  const head = (ic, title, sub) => `<div class="insp-head"><div class="ic">${icon(ic)}</div><div><h3>${esc(title)}</h3><div class="sub">${esc(sub)}</div></div><button class="iconbtn insp-close" data-act='{"type":"deselect"}' aria-label="Close inspector" title="Close (Esc)">${icon('x')}</button></div>`;
  const kv = (rows) => `<div class="kv">${rows.filter(Boolean).map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${v}</span>`).join('')}</div>`;

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
    const hour = Math.floor((state.clock % 1440) / 60);
    if (sel.kind === 'demand') {
      const total = (hh) => state.map.customers.reduce((s, c) => s + demandAt(bal, c.type, hh), 0);
      const vals = Array.from({ length: 24 }, (_, i) => total(i));
      const mx = Math.max(...vals);
      const bars = vals.map((v, i) => `<rect x="${i * 12 + 1}" y="${70 - (v / mx) * 62}" width="10" height="${(v / mx) * 62}" rx="2" fill="${i === hour ? '#d4ff3a' : v === mx ? '#ffb547' : '#3fd8ff'}" opacity="${i === hour ? 1 : 0.65}"/>`).join('');
      const byType = ['home', 'school', 'market', 'clinic'].map((t) => {
        const cs = state.map.customers.filter((c) => c.type === t);
        return [`${CUSTOMER_TYPES[t].label}${cs.length > 1 ? 's' : ''} (${cs.length})`, `${fmt.kw(cs.reduce((s, c) => s + demandAt(bal, c.type, hour), 0))} <span style="color:var(--muted)">/ ${cs.length * CUSTOMER_TYPES[t].nominal} nom.</span>`];
      });
      return (
        head('home', 'Town demand', 'All 13 customers') +
        kv([['Demand now', fmt.kw(state.flow.townDemandKW)], ['Nominal total', '40 kW'], ['Evening peak (18–19 h)', `<span style="color:var(--amber)">${fmt.kw(mx)}</span>`], ['Energy per day', fmt.kwh(vals.reduce((a, b) => a + b, 0))]]) +
        `<svg viewBox="0 0 288 84" style="width:100%;margin:6px 0 2px" role="img" aria-label="Demand by hour">${bars}<text x="0" y="82" font-size="8" fill="#8fa3bb">0h</text><text x="138" y="82" font-size="8" fill="#8fa3bb">12h</text><text x="270" y="82" font-size="8" fill="#8fa3bb">23h</text></svg>` +
        kv(byType) +
        `<div class="note">Homes use 2.5× more in the evening; the school and market run by day; the clinic never stops. Size transformers for the <b>peak</b>, not the average.</div>`
      );
    }

    if (sel.kind === 'gen') {
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
        `<div class="panel-title" style="margin-top:14px"><span>If supply runs short</span></div>` +
        `<div class="seg" role="radiogroup" aria-label="Load-shed policy"><button role="radio" aria-checked="${state.policy === 'critical'}" class="${state.policy === 'critical' ? 'on' : ''}" data-act='{"type":"policy","value":"critical"}'>Protect critical</button><button role="radio" aria-checked="${state.policy === 'equal'}" class="${state.policy === 'equal' ? 'on' : ''}" data-act='{"type":"policy","value":"equal"}'>Equal reduction</button></div>` +
        `<div class="note">${state.policy === 'critical' ? 'Clinic first, then school, then others — some homes go dark when short.' : 'Everyone gets a reduced share — lights dim and flicker everywhere.'}</div>`
      );
    }

    if (sel.kind === 'depot') {
      const j = state.crew.job;
      const name = (id) => (id === 'gen' ? 'generator' : ctx.xfmrName(id));
      const crew = !j ? ['st-on', 'Idle at depot'] : j.phase === 'travel' ? ['st-info', `Driving to ${name(j.target)} · ${fmt.dur(j.remain)}`] : j.phase === 'standby' ? ['st-warn', `Standing by at ${name(j.target)}`] : j.phase === 'work' ? ['st-warn', `${j.type === 'repair' ? 'Repairing' : 'Servicing'} ${name(j.target)} · ${fmt.dur(j.remain)}`] : ['st-info', `Returning · ${fmt.dur(j.remain)}`];
      const P = bal.procurement;
      const ord = (item, label) => btn(`${label} · ${P[item].cost} ¢`, { type: 'order', item }, { disabled: state.credits < P[item].cost, title: `Arrives in ${P[item].leadH} h` });
      const transit = state.orders.filter((o) => o.item !== 'fuel');
      return (
        head('depot', 'Grid Ops depot', 'Repair crew · stores') +
        pill(crew[0], crew[1], 'truck') +
        (state.crew.queue.length ? `<div class="note">Queued: ${state.crew.queue.map((q) => `${q.type} ${name(q.target)}`).join(', ')}</div>` : '') +
        kv([['Poles', state.inv.poles], ['Cable', `${state.inv.cable} m`], ['Transformers', state.inv.transformers], ['Repair kits', state.inv.kits], transit.length ? ['On order', transit.map((o) => `${o.qty} ${o.item} in ${fmt.dur(o.arriveT - state.t)}`).join(', ')] : null]) +
        `<div class="panel-title"><span>Procurement</span></div><div class="actions">${ord('poles', '+5 poles')}${ord('cable', '+100 m cable')}${ord('transformer', '+1 transformer')}${ord('kits', '+1 repair kit')}</div>` +
        `<div class="note">Deliveries take a few hours of game time. Keep a repair kit in reserve for faults.</div>`
      );
    }

    if (sel.kind === 'building') {
      const c = state.map.customers.find((x) => x.id === sel.id);
      if (!c) return '';
      const cs = state.cust[c.id];
      const T = CUSTOMER_TYPES[c.type];
      const st = S.status[cs.status];
      const cls = cs.status === 'on' ? 'st-on' : cs.status === 'partial' ? 'st-warn' : cs.status === 'unconnected' ? 'st-off' : 'st-bad';
      let why = st.why;
      if (cs.status === 'xfmrDown' && cs.xfmr) {
        const n = state.nodes[cs.xfmr];
        why = `Transformer <b>${ctx.xfmrName(cs.xfmr)}</b> is ${n.state === 'fault' ? 'FAULTED — send the repair crew' : n.state === 'trip' ? 'tripped on overload — reduce its load, then Reset' : 'under maintenance'}.`;
      }
      const reach = !cs.dropped ? lvNodesInReach(state, bal, c.id) : [];
      const dropPlan = !cs.dropped ? planDrop(state, bal, c.id) : null;
      const ic = c.type === 'home' ? 'home' : c.type;
      return (
        head(ic, c.name, `${T.label}${T.critical ? ' · critical service' : ''} · ${T.nominal} kW nominal`) +
        pill(cls, st.label, cs.status === 'on' ? 'bolt' : cs.status === 'unconnected' ? 'plug' : 'dark') +
        `<div class="why ${cs.status === 'on' ? 'ok' : ''}"><b>${cs.status === 'on' ? 'Why it’s lit' : 'Why it’s dark'}</b>${why}</div>` +
        kv([
          ['Demand now', fmt.kw(cs.demand)],
          ['Receiving', fmt.kw(cs.served)],
          ['Evening peak', fmt.kw(T.nominal * Math.max(...Array.from({ length: 24 }, (_, i) => bal.profiles[c.type](i))))],
          ['Energy today', fmt.kwh(cs.kWhToday)],
          ['Bill today', fmt.cr(cs.kWhToday * bal.tariff)],
          ['Fed by', cs.xfmr ? ctx.xfmrName(cs.xfmr) : '—'],
          ['Priority', T.critical ? '<span style="color:var(--amber)">Critical</span>' : c.type === 'school' ? 'Public' : 'Standard'],
        ]) +
        (!cs.dropped
          ? `<div class="actions">${btn('Add service drop · 15 ¢', { type: 'drop', building: c.id }, { primary: true, icon: 'plug', disabled: !dropPlan?.ok, title: dropPlan?.ok ? '' : S.reasons[dropPlan?.reason] })}</div>${!reach.length ? `<div class="note">${S.reasons.noLVInReach}</div>` : ''}`
          : `<div class="actions">${btn('Remove drop', { type: 'remove', target: ctx.dropOf(c.id) }, { danger: true, icon: 'trash' })}</div>`)
      );
    }

    if (sel.kind === 'node') {
      const n = state.nodes[sel.id];
      if (!n) return '';
      if (n.kind === 'xfmr') {
        const name = ctx.xfmrName(n.id);
        const pct = n.loadPct || 0;
        let st;
        if (n.state === 'fault') st = ['st-bad', 'FAULT — needs repair', 'alert'];
        else if (n.state === 'trip') st = ['st-bad', 'Tripped (overload)', 'alert'];
        else if (n.state === 'maint') st = ['st-info', 'Under maintenance', 'wrench'];
        else if (n.overheat) st = ['st-warn', 'Overheating — failing', 'thermo'];
        else if (n.overMin > 0) st = ['st-warn', `Overloaded · trips in ${60 - n.overMin} min`, 'warn'];
        else if (pct >= 85) st = ['st-warn', 'Heavily loaded', 'warn'];
        else if (!n.connected) st = ['st-off', 'No 11 kV supply', 'plug'];
        else st = ['st-on', n.energized ? 'In service' : 'In service (no power)', 'check'];
        const cool = n.state === 'trip' ? Math.max(0, n.coolUntil - state.t) : 0;
        const job = ctx.crewJob(n.id);
        const fc = n.forecastPeakKW || 0;
        let why = '';
        if (n.state === 'fault') why = `<div class="why"><b>Failed internally.</b>Its ${n.customers.length} customers are dark until the crew repairs it (1 kit + ${bal.costs.repairLabour} ¢, ~2 h on site).</div>`;
        else if (n.state === 'trip') why = `<div class="why"><b>Protection tripped it.</b>It carried more than 40 kW for too long. ${cool > 0 ? `Cooling: ${cool} min.` : 'Reduce its load, then Reset.'}</div>`;
        else if (n.overheat) why = `<div class="why"><b>${Math.round(n.tempC)} °C — not explained by load.</b>Something inside is failing. Send the crew now so they’re on site when it goes.</div>`;
        else if (fc > bal.transformer.ratingKW) why = `<div class="why"><b>Forecast peak ${fmt.kw(fc)} at ${fc ? n.forecastPeakHour : 18}:00 > 40 kW rating.</b>Move some drops to another transformer before the peak.</div>`;
        else if (!n.connected) why = `<div class="why"><b>Not connected to 11 kV.</b>Run an 11 kV line from the generator network to this pole.</div>`;
        return (
          head('xfmr', `Transformer ${name}`, `11 kV → 400 V · ${bal.transformer.ratingKW} kW rating`) +
          pill(...st) +
          why +
          `<div class="meter-label" style="margin-top:12px"><span>Load ${fmt.kw(n.loadKW || 0)} / 40 kW</span><span>${Math.round(pct)}%</span></div>` +
          meter(pct, 85) +
          kv([
            ['Temperature', `${Math.round(n.tempC)} °C`],
            ['Condition', `${Math.round(n.condition)}%`],
            ['Customers fed', `${n.customers.length}`],
            ['Forecast peak', `<span style="color:${fc > 40 ? 'var(--red)' : fc > 34 ? 'var(--amber)' : 'inherit'}">${fmt.kw(fc)}</span>`],
            job ? ['Crew', job] : null,
          ]) +
          condMeter(n.condition) +
          `<div class="actions">` +
          (n.state === 'trip' ? btn(cool > 0 ? `Reset (cooling ${cool} min)` : 'Reset', { type: 'reset', target: n.id }, { primary: cool <= 0, disabled: cool > 0, icon: 'restart' }) : '') +
          (n.state === 'fault' || n.overheat ? btn(`Send repair crew · ${bal.costs.repairLabour} ¢ + kit`, { type: 'repair', target: n.id }, { primary: true, icon: 'truck', disabled: !!job || state.inv.kits < 1 || state.credits < bal.costs.repairLabour, title: state.inv.kits < 1 ? S.reasons.noKits : '' }) : '') +
          (n.state === 'ok' && !n.overheat ? btn(`Service · ${bal.costs.maintain} ¢`, { type: 'maintain', target: n.id }, { icon: 'wrench', disabled: !!job || state.credits < bal.costs.maintain, title: 'Restores condition to 100%. Its customers lose power for ~1 h while the crew works.' }) : '') +
          btn('Connect buildings in reach', { type: 'dropAll', node: n.id }, { icon: 'plug' }) +
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
        return (
          head('pole', n.tier === 'MV' ? '11 kV pole' : '400 V pole', n.tier === 'MV' ? 'Medium voltage (MV) distribution' : 'Low voltage (LV) — feeds buildings') +
          pill(n.energized ? 'st-on' : 'st-off', n.energized ? 'Energised' : n.connected ? 'Connected (no power)' : 'Not connected to supply', n.energized ? 'bolt' : 'plug') +
          kv([['Connections', conns], ['Max line load', fmt.kw(thru)], ['Voltage', n.tier === 'MV' ? '11 kV' : '400 V']]) +
          `<div class="actions">${n.tier === 'LV' ? btn('Connect buildings in reach', { type: 'dropAll', node: n.id }, { primary: true, icon: 'plug' }) : btn('Mount transformer · 600 ¢', { type: 'transformer', at: n.id }, { primary: true, icon: 'xfmr', disabled: state.inv.transformers < 1 || state.credits < 600 })}${btn('Remove', { type: 'confirmRemove', target: n.id }, { danger: true, icon: 'trash' })}</div>` +
          `<div class="note">${n.tier === 'MV' ? 'Mount a transformer here to start a 400 V branch.' : 'Buildings within 22 m can take a service drop from this pole.'}</div>`
        );
      }
      if (n.kind === 'gen') return build({ kind: 'gen' }, state, ctx);
    }

    if (sel.kind === 'edge') {
      const e = state.edges[sel.id];
      if (!e) return '';
      const rating = e.kind === 'drop' ? null : e.tier === 'MV' ? bal.network.mvRatingKW : bal.network.lvRatingKW;
      const loss = e.kind === 'line' ? e.loadKW * bal.network.lossPer100m * (e.length / 100) * (e.loadKW / rating) : 0;
      return (
        head(e.kind === 'drop' ? 'plug' : 'cable', e.kind === 'drop' ? 'Service drop' : e.tier === 'MV' ? '11 kV line' : '400 V line', `${Math.round(e.length)} m`) +
        pill(e.energized ? 'st-on' : 'st-off', e.energized ? 'Energised' : 'Dead', e.energized ? 'bolt' : 'plug') +
        (rating ? `<div class="meter-label" style="margin-top:12px"><span>Load ${fmt.kw(e.loadKW)}</span><span>Rating ${rating} kW</span></div>${meter((e.loadKW / rating) * 100)}` : '') +
        kv([e.kind === 'line' ? ['Losses now', `${(loss * 1000).toFixed(0)} W`] : null, e.kind === 'drop' ? ['Feeds', esc(state.map.customers.find((c) => c.id === e.b)?.name || '')] : null]) +
        `<div class="actions">${btn('Remove', { type: 'confirmRemove', target: e.id }, { danger: true, icon: 'trash' })}</div>`
      );
    }
    return '';
  }

  return { render, el, get pointerDown() { return pointerDown; } };
}
