// Gameplay HUD (GDD §14): top bar, objective rail, toolbar + inventory, alert centre, comms,
// captions, compass, overlay legend, cursor tip and projected world labels.
import { h, icon, esc } from './dom.js';
import { S, fmt } from '../data/strings.js';
import { CAST } from '../data/dialogue.js';
import { OBJECTIVES, evalObjective } from '../sim/mission.js';
import { BALANCE } from '../data/balance.js';
import { objectiveGuide } from './guide.js';

export function createHud(ui, labelsEl, cb) {
  // ---------------------------------------------------------------- top bar
  const chip = (id, ic, k, opts = {}) =>
    h('div', { class: 'chip', id: 'chip-' + id, role: opts.button ? 'button' : null, tabindex: opts.button ? '0' : null, title: opts.title || '', onclick: opts.onclick, onkeydown: opts.button ? (e) => (e.key === 'Enter' || e.key === ' ') && opts.onclick?.() : null, html: `${icon(ic, 'ic')}<div><span class="k">${k}</span><span class="v">–</span></div>${opts.bar ? '<div class="bar"><i></i></div>' : ''}` });
  const chips = {
    credits: chip('credits', 'coins', 'Credits', { title: 'Cash available. Construction is paid up front; customers pay their bills at midnight.' }),
    demand: chip('demand', 'home', 'Demand', { button: true, onclick: () => cb.onDemand(), title: 'Power all 13 customers want right now (kW). Click for the daily demand curve.' }),
    gen: chip('gen', 'bolt', 'Generation', { title: 'Power the generator is producing now (kW): what customers receive plus network losses.', bar: true }),
    fuel: chip('fuel', 'fuel', 'Fuel', { title: 'Diesel in the tank. ~1 unit per 20 kWh. Order more at the generator (6 h delivery).', bar: true }),
    powered: chip('powered', 'eye', 'Powered', { title: 'Customers receiving power out of 13.' }),
    rel: chip('rel', 'shield', 'Reliability', { title: 'Share of customer-hours with power since first light.' }),
    loss: chip('loss', 'wave', 'Losses', { title: 'Energy lost as heat in lines and transformers (simplified model).' }),
  };
  const speedBtns = [
    ['pause', 0, 'Pause (Space)'],
    ['play', 1, 'Speed ×1 (1)'],
    ['ff', 2, 'Speed ×2 (2)'],
    ['fff', 3, 'Speed ×3 (3)'],
  ].map(([ic, sp, t]) => h('button', { 'aria-label': t, title: t, html: icon(ic), onclick: () => cb.onSpeed(sp) }));
  const clockEl = h('div', { class: 'clock', html: '<div class="day">Day 1</div><div class="time">17:00</div>' });
  const topbar = h(
    'header',
    { id: 'topbar', class: 'glass', hidden: true },
    h('div', { class: 'brand', html: `${S.title}<small>${S.missionName}</small>` }),
    h('div', { class: 'chips' }, Object.values(chips)),
    h(
      'div',
      { class: 'clockbox' },
      clockEl,
      h('div', { class: 'speed', role: 'group', 'aria-label': 'Simulation speed' }, speedBtns),
      h('button', { class: 'iconbtn', id: 'btn-sound', title: 'Sound on/off', 'aria-label': 'Toggle sound', html: icon('sound'), onclick: () => cb.onSound() }),
      h('button', { class: 'iconbtn', title: 'Pause menu (Esc)', 'aria-label': 'Pause menu', html: icon('menu'), onclick: () => cb.onMenu() }),
    ),
  );

  // ---------------------------------------------------------------- objectives
  const objList = h('div');
  const objectives = h('aside', { id: 'objectives', class: 'glass', hidden: true, 'aria-label': 'Objectives' }, h('div', { class: 'panel-title', html: `<span>${S.stageName}</span>` }), h('div', { class: 'mission-name', text: S.missionName }), h('div', { class: 'obj-help', html: `${icon('info')}Hover an objective for step-by-step help` }), objList);
  // Hover / focus card with the full "how to complete" guide for one objective.
  const objCard = h('div', { id: 'objcard', class: 'glass', role: 'tooltip', hidden: true });
  const card = { id: null, pinned: false, row: null, hideT: null, html: '', state: null };

  // ---------------------------------------------------------------- toolbar + inventory + hint
  const tools = ['select', 'line', 'xfmr', 'drop', 'remove'];
  const toolIcons = { select: 'cursor', line: 'line', xfmr: 'xfmr', drop: 'plug', remove: 'trash', overlay: 'layers' };
  const toolBtns = {};
  for (const t of [...tools, 'overlay']) {
    toolBtns[t] = h('button', {
      class: 'tool',
      id: 'tool-' + t,
      title: `${S.tools[t].name} (${S.tools[t].key}) — ${S.tools[t].hint}`,
      'aria-label': `${S.tools[t].name} tool, key ${S.tools[t].key}`,
      html: `${icon(toolIcons[t])}<span>${S.tools[t].name}</span><kbd>${S.tools[t].key}</kbd>${t === 'overlay' ? '<span class="sub" id="overlay-name">Flow</span>' : ''}`,
      onclick: () => (t === 'overlay' ? cb.onOverlay() : cb.onTool(t)),
    });
  }
  const toolbar = h('nav', { id: 'toolbar', class: 'glass', hidden: true, 'aria-label': 'Build tools' }, tools.map((t) => toolBtns[t]), h('div', { class: 'toolsep' }), toolBtns.overlay);
  const inventory = h('div', { id: 'inventory', class: 'glass', hidden: true });
  const hint = h('div', { id: 'hint', class: 'glass' });

  // ---------------------------------------------------------------- alerts, comms, captions, compass, legend, tip
  const alerts = h('div', { id: 'alerts', 'aria-live': 'polite' });
  const comms = h('div', { id: 'comms', 'aria-live': 'polite' });
  const captions = h('div', { id: 'captions', 'aria-live': 'polite' });
  const compassBtn = h('button', { id: 'compass', class: 'glass', title: 'North · click to reset the camera (Home)', 'aria-label': 'Reset camera', html: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="none" stroke="rgba(255,228,188,.3)"/><path d="M12 3 8.5 12h7z" fill="#ff5a4e"/><path d="M12 21 8.5 12h7z" fill="#c2b29c"/><text x="12" y="2.6" font-size="3" text-anchor="middle" fill="#fff">N</text></svg>`, onclick: () => cb.onResetCamera() });
  const legend = h('div', { id: 'overlay-legend', class: 'glass', hidden: true });
  const tip = h('div', { id: 'cursor-tip', class: 'glass', hidden: true });
  // ---------------------------------------------------------------- objective card behaviour
  function renderCard() {
    const st = card.state;
    if (!st || !card.id) return;
    const gd = objectiveGuide(st, BALANCE, card.id, { xfmrName: cb.xfmrName });
    const r = evalObjective(st, card.id);
    const done = card.id === 'losses' ? r.done : st.objectives[card.id];
    const html =
      `<div class="oc-head"><span class="oc-state ${done ? 'done' : ''}">${done ? icon('check') + 'Done' : 'To do'}</span>${card.pinned ? '<span class="oc-pin">Pinned · Esc to close</span>' : ''}</div>` +
      `<h4>${esc(gd.title)}</h4><p class="oc-why">${gd.why}</p>` +
      `<div class="oc-sec">How to complete</div><ol class="oc-steps">${gd.steps.map((t) => `<li>${t}</li>`).join('')}</ol>` +
      `<div class="oc-sec">Right now</div><ul class="oc-now">${gd.now.map((n) => `<li class="${n.cls}"><i></i><span>${n.html}</span></li>`).join('')}</ul>` +
      (gd.tip ? `<div class="oc-tip">${icon('info')}<span>${gd.tip}</span></div>` : '') +
      (gd.focus ? `<div class="oc-acts"><button class="btn small primary" data-focus="1">${icon('eye')}${esc(gd.focusLabel || 'Show me')}</button></div>` : '');
    if (html !== card.html) {
      card.html = html;
      objCard.innerHTML = html;
      card.focus = gd.focus;
    }
    place();
  }
  function place() {
    if (!card.row || !card.row.isConnected) card.row = objList.querySelector(`[data-obj="${card.id}"]`);
    const rb = objectives.getBoundingClientRect();
    const rr = card.row ? card.row.getBoundingClientRect() : rb;
    objCard.style.left = rb.right + 10 + 'px';
    const hgt = objCard.offsetHeight;
    objCard.style.top = Math.max(70, Math.min(window.innerHeight - hgt - 12, rr.top - 12)) + 'px';
  }
  function openCard(id, row, pin = false) {
    clearTimeout(card.hideT);
    if (card.id !== id) card.html = '';
    card.id = id;
    card.row = row;
    if (pin) card.pinned = true;
    objCard.hidden = false;
    for (const r of objList.querySelectorAll('.obj')) r.classList.toggle('hover', r.dataset.obj === id);
    renderCard();
  }
  function closeCard(force = false) {
    if (card.pinned && !force) return;
    clearTimeout(card.hideT);
    card.id = null;
    card.pinned = false;
    card.html = '';
    objCard.hidden = true;
    for (const r of objList.querySelectorAll('.obj.hover')) r.classList.remove('hover');
  }
  const softClose = () => {
    clearTimeout(card.hideT);
    card.hideT = setTimeout(() => closeCard(), 220);
  };
  const rowOf = (e) => e.target.closest?.('.obj[data-obj]');
  objList.addEventListener('mouseover', (e) => {
    const r = rowOf(e);
    if (r && !(card.pinned && card.id !== r.dataset.obj)) openCard(r.dataset.obj, r);
  });
  objList.addEventListener('mouseleave', softClose);
  objList.addEventListener('focusin', (e) => {
    const r = rowOf(e);
    if (r) openCard(r.dataset.obj, r);
  });
  objList.addEventListener('focusout', (e) => !objCard.contains(e.relatedTarget) && softClose());
  objList.addEventListener('click', (e) => {
    const r = rowOf(e);
    if (!r) return;
    if (card.pinned && card.id === r.dataset.obj) return closeCard(true);
    card.pinned = false;
    openCard(r.dataset.obj, r, true);
  });
  objList.addEventListener('keydown', (e) => {
    const r = rowOf(e);
    if (r && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      r.click();
    }
  });
  objCard.addEventListener('mouseenter', () => clearTimeout(card.hideT));
  objCard.addEventListener('mouseleave', softClose);
  objCard.addEventListener('click', (e) => {
    if (e.target.closest('[data-focus]') && card.focus) cb.onFocusObjective?.(card.focus);
  });

  document.addEventListener('pointerdown', (e) => {
    if (card.pinned && !objCard.contains(e.target) && !objList.contains(e.target)) closeCard(true);
  });

  ui.append(topbar, objectives, objCard, inventory, hint, toolbar, alerts, comms, captions, compassBtn, legend, tip);

  const gameEls = [topbar, objectives, toolbar, inventory, compassBtn];
  function show(on) {
    for (const el of gameEls) el.hidden = !on;
    hint.style.display = on ? '' : 'none';
    alerts.style.display = comms.style.display = on ? '' : 'none';
    if (!on) {
      closeCard(true);
      legend.hidden = true;
      tip.hidden = true;
      labelsEl.innerHTML = '';
      labels.clear();
    }
  }

  // ---------------------------------------------------------------- update
  let lastObjKey = '';
  function setChip(c, v, cls = '', barPct = null) {
    c.querySelector('.v').textContent = v;
    c.classList.toggle('warn', cls === 'warn');
    c.classList.toggle('bad', cls === 'bad');
    c.classList.toggle('good', cls === 'good');
    if (barPct != null) {
      const b = c.querySelector('.bar i');
      b.style.width = Math.max(0, Math.min(100, barPct)) + '%';
      b.style.background = cls === 'bad' ? 'var(--red)' : cls === 'warn' ? 'var(--amber)' : 'var(--power)';
    }
  }
  function update(state, ux) {
    const f = state.flow;
    const g = state.gen;
    setChip(chips.credits, fmt.cr(state.credits), state.credits < 300 ? 'warn' : '');
    setChip(chips.demand, fmt.kw(f.townDemandKW || 0));
    const genCls = f.deficitKW > 0.01 && f.availKW > 0 ? 'warn' : g.status === 'running' ? 'good' : '';
    setChip(chips.gen, `${fmt.kw(f.genKW || 0)} / ${Math.round(f.availKW || 0)}`, genCls, ((f.genKW || 0) / 100) * 100);
    const hrs = f.genKW > 0 ? (g.fuel * 20) / f.genKW : null;
    setChip(chips.fuel, `${Math.floor(g.fuel)} u${hrs != null ? ' · ' + Math.floor(hrs) + ' h' : ''}`, g.fuel <= 0 ? 'bad' : g.fuel < 30 ? 'warn' : '', (g.fuel / 150) * 100);
    setChip(chips.powered, `${f.powered} / 13`, f.powered === 13 ? 'good' : '');
    const s = state.stats;
    const rel = s.custMinTotal > 0 ? (s.custMinPowered / s.custMinTotal) * 100 : null;
    setChip(chips.rel, rel == null ? '—' : fmt.pct(rel), rel != null && rel < 80 ? 'warn' : '');
    setChip(chips.loss, f.genKW > 0 ? `${(f.lossPct || 0).toFixed(1)}%` : '—', f.lossPct > 5 ? 'warn' : '');
    const c = fmt.clock(state.clock);
    clockEl.innerHTML = `<div class="day">Day ${c.day}</div><div class="time">${c.time}</div>${state.started ? '' : '<div class="frozen">time frozen</div>'}`;
    speedBtns.forEach((b, i) => b.classList.toggle('on', ux.paused ? i === 0 : i === ux.speed));
    document.getElementById('btn-sound').innerHTML = icon(ux.muted ? 'mute' : 'sound');

    // objectives
    const rows = OBJECTIVES.map((o) => {
      const r = evalObjective(state, o.id);
      const done = o.id === 'losses' ? r.done : state.objectives[o.id];
      return { o, r, done };
    });
    const cur = rows.find((x) => x.o.primary && !x.done);
    const key = rows.map((x) => `${x.o.id}${x.done ? 1 : 0}${x.r.progress ? x.r.progress.join('/') : ''}`).join('|') + (cur ? cur.o.id : '');
    if (key !== lastObjKey) {
      lastObjKey = key;
      objList.innerHTML = '';
      rows.forEach((x, i) => {
        if (i === OBJECTIVES.findIndex((o) => !o.primary)) objList.append(h('div', { class: 'sep' }));
        const p = x.r.progress;
        const showBar = p && !x.done && (x.o.id === 'connect' || x.o.id === 'stable');
        objList.append(
          h(
            'div',
            {
              class: `obj ${x.done ? 'done' : ''} ${cur && cur.o.id === x.o.id ? 'current' : ''} ${x.o.primary ? '' : 'optional'} ${card.id === x.o.id ? 'hover' : ''}`,
              tabindex: '0',
              role: 'button',
              'data-obj': x.o.id,
              'aria-describedby': 'objcard',
              'aria-label': `${S.objectives[x.o.id]}${x.done ? ' (done)' : ''}. Show how to complete it.`,
            },
            h('div', { class: 'box', html: x.done ? icon('check') : '' }),
            h('div', { style: { flex: 1 } }, S.objectives[x.o.id], showBar ? h('div', { class: 'pbar', html: `<i style="width:${(p[0] / p[1]) * 100}%"></i>` }) : null),
            p && !x.done ? h('span', { class: 'prog', text: x.o.id === 'stable' ? `${p[0]} / ${p[1]} h` : `${p[0]}/${p[1]}` }) : null,
            h('span', { class: 'more', html: icon('info') }),
          ),
        );
      });
      if (card.id) card.row = objList.querySelector(`[data-obj="${card.id}"]`);
    }
    card.state = state;
    if (card.id) renderCard();

    // inventory
    const inv = state.inv;
    const lo = (v, t) => (v <= t ? 'low' : '');
    inventory.innerHTML = `<span class="${lo(inv.poles, 2)}">Poles <b>${inv.poles}</b></span><span class="${lo(inv.cable, 40)}">Cable <b>${inv.cable} m</b></span><span class="${lo(inv.transformers, 0)}">Transformers <b>${inv.transformers}</b></span><span class="${lo(inv.kits, 0)}">Repair kits <b>${inv.kits}</b></span>`;
  }

  function setTool(t, overlayName) {
    for (const k in toolBtns) toolBtns[k].classList.toggle('on', k === t);
    document.getElementById('overlay-name').textContent = overlayName;
  }

  // ---------------------------------------------------------------- alerts
  const alertMap = new Map();
  function alert({ id, level = 'warn', title, text = '', actions = [], ttl = 0 }) {
    dismiss(id);
    const ic = level === 'critical' ? 'alert' : level === 'info' ? 'info' : level === 'good' ? 'check' : 'warn';
    const acts = h('div', { class: 'acts' }, actions.map((a) => h('button', { class: `btn small ${a.primary ? 'primary' : ''}`, disabled: a.disabled || null, onclick: () => a.fn() }, a.label)));
    const el = h('div', { class: `alert glass ${level}`, role: level === 'critical' ? 'alert' : 'status' }, h('span', { html: icon(ic, 'ic') }), h('div', { style: { flex: 1 } }, h('b', { text: title }), text ? h('p', { html: text }) : null, actions.length ? acts : null), h('button', { class: 'x', 'aria-label': 'Dismiss', onclick: () => dismiss(id), text: '×' }));
    alerts.prepend(el);
    const rec = { el, timer: ttl ? setTimeout(() => dismiss(id), ttl) : null };
    alertMap.set(id, rec);
    while (alerts.children.length > 4) {
      const last = alerts.lastElementChild;
      for (const [k, v] of alertMap) if (v.el === last) alertMap.delete(k);
      last.remove();
    }
  }
  function dismiss(id) {
    const r = alertMap.get(id);
    if (!r) return;
    clearTimeout(r.timer);
    r.el.remove();
    alertMap.delete(id);
  }
  function clearAlerts() {
    for (const id of [...alertMap.keys()]) dismiss(id);
    comms.innerHTML = '';
  }

  // ---------------------------------------------------------------- comms
  function say(who, text) {
    const c = CAST[who] || CAST.advisor;
    const el = h('div', { class: 'msg glass' }, h('div', { class: 'avatar', style: { background: c.color }, text: c.initials }), h('div', {}, h('div', { class: 'who', html: `<b>${esc(c.name)}</b>${esc(c.role)}` }), h('p', { text })));
    comms.append(el);
    while (comms.children.length > 3) comms.firstElementChild.remove();
    setTimeout(() => {
      el.style.transition = 'opacity .6s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 650);
    }, 9000 + text.length * 25);
  }

  let capTimer = null;
  function caption(text) {
    captions.textContent = text;
    clearTimeout(capTimer);
    capTimer = setTimeout(() => (captions.textContent = ''), 2600);
  }

  function setHint(text) {
    hint.textContent = text || '';
  }
  function showTip(html, x, y, bad) {
    tip.hidden = !html;
    if (!html) return;
    tip.innerHTML = html;
    tip.classList.toggle('bad', !!bad);
    const w = tip.offsetWidth;
    tip.style.left = Math.min(x, window.innerWidth - w - 30) + 'px';
    tip.style.top = Math.min(y, window.innerHeight - 90) + 'px';
  }
  function setCompass(deg) {
    compassBtn.querySelector('svg').style.transform = `rotate(${deg}deg)`;
  }
  const LEG = {
    flow: [['#ffcf3a', 'Energised 400 V'], ['repeating-linear-gradient(0deg,#ffe9a8 0 2px,transparent 2px 4px)', 'Energised 11 kV (double)'], ['repeating-linear-gradient(90deg,#4a4038 0 5px,transparent 5px 8px)', 'Dead (dashed)']],
    capacity: [['#74d36b', '< 60% load'], ['#ff9f3a', '85–100%'], ['#ff5a4e', 'Overloaded']],
    tier: [['#ff8a4a', '11 kV (MV)'], ['#ffcf3a', '400 V (LV)']],
    condition: [['#74d36b', 'Good > 70%'], ['#ff9f3a', 'Worn 40–70%'], ['#ff5a4e', 'Poor < 40%']],
    outages: [['#ff5a4e', 'Unpowered + reason'], ['#74d36b', 'Powered']],
  };
  function setLegend(name) {
    legend.hidden = false;
    legend.innerHTML = `<b>${S.overlays[name]}</b>` + LEG[name].map(([c, t]) => `<div class="row"><span class="sw" style="background:${c}"></span>${t}</div>`).join('');
  }

  // ---------------------------------------------------------------- projected world labels
  const labels = new Map();
  /** list: [{key, x,y,z, html, cls}] — positions projected by `project` */
  function updateLabels(list, project) {
    const seen = new Set();
    for (const L of list) {
      seen.add(L.key);
      let el = labels.get(L.key);
      if (!el) {
        el = h('div', { class: 'wl' });
        labelsEl.append(el);
        labels.set(L.key, el);
        el._html = '';
      }
      if (el._html !== L.html) {
        el.innerHTML = L.html;
        el._html = L.html;
      }
      el.className = 'wl ' + (L.cls || '');
      const p = project(L.x, L.y, L.z);
      el.style.display = p.visible ? '' : 'none';
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
    }
    for (const [k, el] of labels) {
      if (!seen.has(k)) {
        el.remove();
        labels.delete(k);
      }
    }
  }

  return { show, update, setTool, closeObjCard: () => (card.id ? (closeCard(true), true) : false), alert, dismiss, clearAlerts, say, caption, setHint, showTip, setCompass, setLegend, updateLabels, el: { topbar, objectives, toolbar, alerts, legend } };
}
