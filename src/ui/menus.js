// Screens & modals (GDD §14): intro, main menu, How to Play, Settings, Credits, Pause, Fail,
// Victory, learning panels, confirmations, ending sequence.
import { h, icon, esc } from './dom.js';
import { S, fmt } from '../data/strings.js';
import { LEARN } from '../data/dialogue.js';

export function createMenus(ui) {
  const stack = []; // open modals (Esc closes top)

  function modal(content, { cls = '', side = false, onClose = null, dismissable = true } = {}) {
    const box = h('div', { class: `modal glass ${cls}`, role: 'dialog', 'aria-modal': side ? 'false' : 'true' }, content);
    const wrap = h('div', { class: `modal-wrap ${side ? 'side' : ''}` }, box);
    if (dismissable && !side) wrap.addEventListener('mousedown', (e) => e.target === wrap && close());
    ui.append(wrap);
    const rec = { wrap, onClose, dismissable };
    stack.push(rec);
    setTimeout(() => (box.querySelector('button.primary') || box.querySelector('button'))?.focus(), 30);
    function close(silent) {
      const i = stack.indexOf(rec);
      if (i < 0) return;
      stack.splice(i, 1);
      wrap.remove();
      if (!silent) rec.onClose?.();
    }
    rec.close = close;
    return rec;
  }
  const closeTop = () => {
    const top = stack[stack.length - 1];
    if (top && top.dismissable) {
      top.close();
      return true;
    }
    return !!top;
  };
  const closeAll = () => [...stack].forEach((m) => m.close(true));
  const isOpen = () => stack.length > 0;

  // ---------------------------------------------------------------- intro
  function intro(onDone) {
    const line = h('div', { class: 'line' }, '');
    const el = h('section', { id: 'intro', class: 'screen', role: 'presentation' }, h('h1', { class: 't', text: S.title }), h('div', { class: 's', text: S.tagline }), line, h('div', { class: 'skip', text: S.skip }));
    ui.append(el);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', finish);
      el.style.transition = 'opacity .8s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 800);
      onDone();
    };
    el.addEventListener('click', finish);
    window.addEventListener('keydown', finish);
    return {
      el,
      show: () => el.classList.add('show'),
      line: (t) => {
        line.textContent = t;
        line.classList.add('on');
      },
      finish,
    };
  }

  // ---------------------------------------------------------------- main menu
  function mainMenu({ hasSave, onContinue, onNew, onHow, onSettings, onCredits }) {
    const items = [
      hasSave ? h('button', { class: 'btn primary', onclick: onContinue, html: `${icon('play')}${S.menu.continue}` }) : null,
      h('button', { class: `btn ${hasSave ? '' : 'primary'}`, onclick: onNew, html: `${icon('bolt')}${S.menu.newGame}` }),
      h('button', { class: 'btn', onclick: onHow, html: `${icon('info')}${S.menu.howTo}` }),
      h('button', { class: 'btn', onclick: onSettings, html: `${icon('gear')}${S.menu.settings}` }),
      h('button', { class: 'btn', onclick: onCredits, html: `${icon('chat')}${S.menu.credits}` }),
    ];
    const el = h(
      'section',
      { id: 'menu', class: 'screen' },
      h('div', { class: 'nav', html: `<span>Strategy · Simulation</span><span>Single-player · Offline</span>` }),
      h('h1', { html: `GRID<span>FORGE</span>` }),
      h('div', { class: 'tag', text: S.tagline }),
      h('div', { class: 'stage', text: `${S.stageName} — ${S.missionName}` }),
      h('div', { class: 'items' }, items),
      h('div', { class: 'foot', text: 'Numbers are simplified, illustrative models — not engineering data.' }),
    );
    ui.append(el);
    setTimeout(() => el.querySelector('button')?.focus(), 50);
    return { el, remove: () => el.remove() };
  }

  // ---------------------------------------------------------------- How to Play
  function howTo(onClose) {
    const tabs = [
      ['Controls', () => `<table class="ctable">${S.help.controls.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`],
      ['Building', () => `<ul class="blist">${S.help.building.map((l) => `<li>${l}</li>`).join('')}</ul>`],
      ['Electricity basics', () => `<ul class="blist">${S.help.basics.map((l) => `<li>${l}</li>`).join('')}</ul><p class="note">Gridforge uses simplified, consistent rules — it is a strategy game, not an engineering tool.</p>`],
      ['Objectives', () => `<ul class="blist">${S.help.objectives.map((l) => `<li>${l}</li>`).join('')}</ul>`],
    ];
    const body = h('div');
    const tabBar = h('div', { class: 'tabs', role: 'tablist' });
    const pick = (i) => {
      tabBar.querySelectorAll('button').forEach((b, j) => {
        b.classList.toggle('on', i === j);
        b.setAttribute('aria-selected', String(i === j));
      });
      body.innerHTML = tabs[i][1]();
    };
    tabs.forEach(([t], i) => tabBar.append(h('button', { role: 'tab', onclick: () => pick(i) }, t)));
    const m = modal([h('div', { class: 'kicker', text: 'Guide' }), h('h2', { text: S.menu.howTo }), tabBar, body, h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: () => m.close() }, 'Close'))], { cls: 'wide', onClose });
    pick(0);
    return m;
  }

  // ---------------------------------------------------------------- Settings
  function settings(cfg, onChange, onClose, extras = {}) {
    const rows = h('div');
    const toggle = (key, label, sub) => {
      const b = h('button', { class: 'toggle', role: 'switch', 'aria-checked': String(!!cfg[key]), 'aria-label': label });
      b.onclick = () => {
        cfg[key] = !cfg[key];
        b.setAttribute('aria-checked', String(cfg[key]));
        onChange(cfg);
      };
      return h('div', { class: 'setting' }, h('label', { html: `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}` }), b);
    };
    const slider = (key, label) => {
      const id = 'set-' + key;
      const r = h('input', { type: 'range', min: '0', max: '100', id, value: String(Math.round(cfg[key] * 100)) });
      r.oninput = () => {
        cfg[key] = r.value / 100;
        onChange(cfg);
      };
      return h('div', { class: 'setting' }, h('label', { for: id, text: label }), r);
    };
    const select = (key, label, opts, sub) => {
      const id = 'set-' + key;
      const s = h('select', { id }, opts.map(([v, t]) => h('option', { value: v, selected: String(cfg[key]) === String(v) || null }, t)));
      s.onchange = () => {
        cfg[key] = isNaN(+s.value) ? s.value : +s.value;
        onChange(cfg);
      };
      return h('div', { class: 'setting' }, h('label', { for: id, html: `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}` }), s);
    };
    rows.append(
      toggle('sound', 'Sound', 'Master sound on/off'),
      slider('master', 'Master volume'),
      slider('music', 'Music volume'),
      slider('sfx', 'Effects volume'),
      toggle('captions', 'Sound captions', 'Show text for meaningful sounds'),
      toggle('reduceMotion', 'Reduce motion', 'Calmer pulses, camera and transitions'),
      toggle('cbPatterns', 'Colour-blind patterns', 'Add dash patterns to warning states'),
      select('textScale', 'Text size', [[0.9, '90%'], [1, '100%'], [1.15, '115%'], [1.3, '130%']]),
      select('quality', 'Graphics quality', [['high', 'High (bloom + shadows)'], ['medium', 'Medium'], ['low', 'Low (fastest)']]),
      toggle('tutorial', 'Guided tutorial', 'Step-by-step help in a new game'),
      toggle('autoPause', 'Pause on major events', 'Learning panels pause time while open'),
    );
    const dev = extras.onJumpEnding ? h('div', { class: 'setting' }, h('label', { html: 'Review build: jump to ending<small>Development shortcut — plays the ending sequence</small>' }), h('button', { class: 'btn small', onclick: () => extras.onJumpEnding() }, 'Play ending')) : null;
    const m = modal([h('div', { class: 'kicker', text: 'Options' }), h('h2', { text: S.menu.settings }), rows, dev, h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: () => m.close() }, 'Done'))], { onClose });
    return m;
  }

  function credits(onClose) {
    const m = modal([h('div', { class: 'kicker', text: 'Credits' }), h('h2', { text: S.title }), h('table', { class: 'ctable', html: S.credits.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') }), h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: () => m.close() }, 'Close'))], { cls: 'narrow', onClose });
    return m;
  }

  // ---------------------------------------------------------------- pause
  function pause({ muted, onResume, onSound, onRestart, onMenu, onHow, onSettings }) {
    const soundBtn = h('button', { class: 'btn', html: `${icon(muted ? 'mute' : 'sound')}Sound: ${muted ? 'off' : 'on'}` });
    soundBtn.onclick = () => {
      const m2 = onSound();
      soundBtn.innerHTML = `${icon(m2 ? 'mute' : 'sound')}Sound: ${m2 ? 'off' : 'on'}`;
    };
    const m = modal(
      [
        h('div', { class: 'kicker info', text: 'Paused' }),
        h('h2', { text: 'Simulation paused' }),
        h('p', { text: 'Time, demand, fuel, crews and events are frozen.' }),
        h(
          'div',
          { style: { display: 'grid', gap: '8px', marginTop: '14px' } },
          h('button', { class: 'btn primary', html: `${icon('play')}Resume`, onclick: () => m.close() }),
          soundBtn,
          h('button', { class: 'btn', html: `${icon('info')}How to Play`, onclick: onHow }),
          h('button', { class: 'btn', html: `${icon('gear')}Settings`, onclick: onSettings }),
          h('button', { class: 'btn', html: `${icon('restart')}Restart level`, onclick: () => confirm('Restart the level?', 'Your progress in this mission will be lost and the mission resets to its starting state.', 'Restart', () => (m.close(true), onRestart())) }),
          h('button', { class: 'btn danger', html: `${icon('home')}Back to main menu`, onclick: () => confirm('Leave to the main menu?', 'Your progress is autosaved — use Continue to come back.', 'Main menu', () => (m.close(true), onMenu())) }),
        ),
      ],
      { cls: 'narrow', onClose: onResume },
    );
    return m;
  }

  function confirm(title, text, okLabel, onOk, danger = true) {
    const m = modal([h('h2', { text: title }), h('p', { text }), h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => (m.close(true), onOk()) }, okLabel))], { cls: 'narrow' });
    return m;
  }

  // ---------------------------------------------------------------- learning panel (What happened / Why / What can I do / Real world)
  function learn(key, vars, onClose) {
    const L = LEARN[key];
    const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
    const m = modal(
      [
        h('div', { class: 'kicker info', text: 'Grid Advisor · Learning' }),
        h('h2', { text: fill(L.title) }),
        h('div', { class: 'sec', html: `<h5>What happened?</h5><p>${fill(L.what)}</p>` }),
        h('div', { class: 'sec', html: `<h5>Why it happened</h5><p>${fill(L.why)}</p>` }),
        h('div', { class: 'sec', html: `<h5>What can I do?</h5><ul>${L.todo.map((t) => `<li>${fill(t)}</li>`).join('')}</ul>` }),
        h('div', { class: 'sec real', html: `<h5>Real-world connection</h5><p>${fill(L.real)}</p>` }),
        h('div', { class: 'simplified', text: 'Simplified model — real systems are more complex.' }),
        h('div', { class: 'row-actions' }, vars.focus ? h('button', { class: 'btn', onclick: () => (m.close(), vars.focus()) }, 'Show me') : null, h('button', { class: 'btn primary', onclick: () => m.close() }, 'Got it')),
      ],
      { cls: 'learn', onClose },
    );
    return m;
  }

  // ---------------------------------------------------------------- results
  function metricsGrid(M) {
    const cell = (k, v) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    return h('div', {
      class: 'metrics',
      html: [
        cell('Customers powered', `${M.powered} / ${M.total}`),
        cell('Energy delivered', fmt.kwh(M.kWh)),
        cell('Average / peak', `${fmt.kw(M.avgKW)} / ${fmt.kw(M.peakKW)}`),
        cell('Outage (customer-h)', M.outageCustH.toFixed(1)),
        cell('Restoration time', M.restoreMin != null ? fmt.dur(M.restoreMin) : '—'),
        cell('Network losses', `${M.lossPct.toFixed(1)}%`),
        cell('Credits earned', fmt.cr(M.earned)),
        cell('Credits spent', fmt.cr(M.spent)),
        cell('Asset condition', `${Math.round(M.condition)}%`),
      ].join(''),
    });
  }

  function victory(result, { onContinue, onReplay, onMenu }) {
    const sc = result.score;
    const part = (k, label, max) => `<div class="part"><span>${label}</span><div class="meter"><i style="width:${(sc.parts[k] / max) * 100}%"></i></div><span class="n">${sc.parts[k]}/${max}</span></div>`;
    const m = modal(
      [
        h('div', { class: 'kicker', text: 'Mission complete' }),
        h('h2', { text: `${S.missionName} — ${S.endings[sc.ending]}` }),
        h('div', { class: 'score', html: `<div class="total">${sc.total}<small> / 100</small></div><div class="parts">${part('coverage', 'Coverage', 30)}${part('reliability', 'Reliability', 30)}${part('restoration', 'Restoration', 15)}${part('finance', 'Finance', 15)}${part('efficiency', 'Efficiency', 10)}</div>` }),
        metricsGrid(result.metrics),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (m.close(true), onMenu()) }, 'Main menu'), h('button', { class: 'btn', onclick: () => (m.close(true), onReplay()) }, 'Replay'), h('button', { class: 'btn primary', onclick: () => (m.close(true), onContinue()) }, 'Continue')),
      ],
      { cls: 'wide', dismissable: false },
    );
    return m;
  }

  function fail(result, { onRetry, onMenu }) {
    const F = S.failCause[result.cause];
    const m = modal(
      [
        h('div', { class: 'kicker bad', text: 'Mission failed' }),
        h('h2', { text: F.title }),
        h('p', { text: F.body }),
        h('div', { class: 'why', html: `<b>Next time</b>${esc(F.tip)}` }),
        metricsGrid(result.metrics),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: () => (m.close(true), onMenu()) }, 'Back to main menu'), h('button', { class: 'btn primary', onclick: () => (m.close(true), onRetry()) }, 'Retry')),
      ],
      { cls: 'wide', dismissable: false },
    );
    return m;
  }

  // ---------------------------------------------------------------- ending overlay
  function ending({ title, kicker, lines, onEnd }) {
    const narr = h('div', { class: 'narr' });
    const ttl = h('div', { class: 'ttl', html: `<div class="k">${esc(kicker)}</div><h2>${esc(title)}</h2>` });
    const acts = h('div', { class: 'end-actions' }, h('button', { class: 'btn primary', onclick: () => finish() }, 'Return to main menu'));
    const skip = h('button', { class: 'btn small skipend', onclick: () => jump() }, 'Skip');
    const el = h('div', { id: 'ending' }, h('div', { class: 'bars' }), ttl, narr, acts, skip);
    ui.append(el);
    const timers = [];
    let i = 0;
    const T = (fn, ms) => timers.push(setTimeout(fn, ms));
    T(() => ttl.classList.add('on'), 1200);
    T(() => ttl.classList.remove('on'), 6500);
    const next = () => {
      if (i >= lines.length) {
        narr.classList.remove('on');
        T(() => {
          ttl.classList.add('on');
          acts.classList.add('on');
          acts.querySelector('button').focus();
        }, 1200);
        return;
      }
      narr.classList.remove('on');
      T(() => {
        narr.textContent = lines[i++];
        narr.classList.add('on');
        T(next, 4200 + narr.textContent.length * 22);
      }, 900);
    };
    T(next, 7200);
    function jump() {
      timers.forEach(clearTimeout);
      narr.classList.remove('on');
      ttl.classList.add('on');
      acts.classList.add('on');
      skip.remove();
      acts.querySelector('button').focus();
    }
    function finish() {
      timers.forEach(clearTimeout);
      el.remove();
      onEnd();
    }
    return { el, finish, jump };
  }

  return { modal, closeTop, closeAll, isOpen, intro, mainMenu, howTo, settings, credits, pause, confirm, learn, victory, fail, ending };
}
