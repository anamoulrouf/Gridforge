// Gridforge — Stage 1 "Light the First District".
// App controller: screens, game loop (fixed sim tick, separate from render), input & tools,
// event → feedback routing, tutorial, autosave, test hooks.
import * as THREE from 'three';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/camera.js';
import { createWorld } from './render/world.js';
import { createNetworkView } from './render/network.js';
import { createFx } from './render/fx.js';
import { createPeople } from './render/people.js';
import { createHud } from './ui/hud.js';
import { createInspector } from './ui/inspector.js';
import { createMenus } from './ui/menus.js';
import { h, icon } from './ui/dom.js';
import { createAudio } from './audio/synth.js';
import { createSim, loadSim } from './sim/sim.js';
import { rectDist, dist as d2 } from './sim/grid.js';
import { BALANCE } from './data/balance.js';
import { MISSION1 } from './data/mission1.js';
import { S, fmt } from './data/strings.js';
import { LINES, TUTORIAL, ENDING } from './data/dialogue.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SAVE_KEY = 'gridforge.save.v1';
const SET_KEY = 'gridforge.settings.v1';
const map = MISSION1;
const bal = BALANCE;

// ------------------------------------------------------------------ settings
const DEFAULTS = {
  sound: true,
  master: 0.8,
  music: 0.55,
  sfx: 0.8,
  captions: true,
  reduceMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  cbPatterns: false,
  textScale: 1,
  quality: 'high',
  tutorial: true,
  autoPause: true,
};
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
const cfg = { ...DEFAULTS, ...(store.get(SET_KEY) || {}) };

// ------------------------------------------------------------------ boot
const canvas = document.getElementById('gl');
let G;
try {
  G = createScene(canvas);
} catch (e) {
  document.getElementById('nogl').hidden = false;
  throw e;
}
const { scene, camera, composer } = G;
const rig = createCameraRig(camera, map.bounds);
const world = createWorld(scene, map);
const net = createNetworkView(scene, map);
const fx = createFx(scene);
const people = createPeople(scene, map);
const audio = createAudio();
const uiEl = document.getElementById('ui');
const labelsEl = document.getElementById('labels');
const fadeEl = document.getElementById('fade');

const app = {
  mode: 'boot',
  sim: null,
  paused: false,
  speed: 1,
  acc: 0,
  hold: 0,
  tool: 'select',
  lineStart: null,
  dragging: false,
  downPt: null,
  overlay: 'flow',
  selected: null,
  hover: null,
  mouse: { x: 0, y: 0, in: false, ground: null },
  shift: false,
  keys: new Set(),
  learnSeen: new Set(),
  nudges: {},
  tut: -1,
  shown: {},
  pending: new Map(),
  tipLock: 0,
  lastHour: -1,
  ending: null,
  menuEl: null,
  resultShown: false,
};
const OVERLAYS = ['flow', 'capacity', 'tier', 'condition', 'outages'];
const OVERLAY_SHORT = { flow: 'Flow', capacity: 'Load %', tier: 'Voltage', condition: 'Condition', outages: 'Outages' };

// ------------------------------------------------------------------ UI
const hud = createHud(uiEl, labelsEl, {
  onDemand: () => {
    cmd({ type: 'inspect', target: 'demand' }, true);
    select({ kind: 'demand' });
  },
  onSpeed: (s) => setSpeed(s),
  onSound: () => toggleSound(),
  onMenu: () => openPause(),
  onTool: (t) => setTool(t),
  onOverlay: () => cycleOverlay(),
  onResetCamera: () => rig.reset(),
});
const inspector = createInspector(uiEl, { onAction: (a) => doAction(a) });
const menus = createMenus(uiEl);
const tutEl = h('div', { id: 'tutorial', class: 'glass', hidden: true, role: 'region', 'aria-label': 'Tutorial' });
uiEl.append(tutEl);
audio.onCaption((t) => cfg.captions && hud.caption(t));

function applySettings() {
  document.documentElement.style.setProperty('--scale', cfg.textScale);
  document.documentElement.classList.toggle('reduce-motion', !!cfg.reduceMotion);
  audio.set({ master: cfg.master, music: cfg.music, sfx: cfg.sfx, muted: !cfg.sound });
  G.setQuality(cfg.quality);
  rig.smooth = true;
  store.set(SET_KEY, cfg);
}
applySettings();

// ------------------------------------------------------------------ helpers
const S_ = () => app.sim.state;
const xfmrName = (id) => {
  const ids = Object.keys(S_().nodes)
    .filter((k) => S_().nodes[k].kind === 'xfmr')
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const i = ids.indexOf(id);
  return i >= 0 ? `T${i + 1}` : id;
};
const custOf = (id) => map.customers.find((c) => c.id === id);
const siteOf = (id) => (id === 'gen' ? map.generator.port : S_().nodes[id] || null);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
function say(key, vars = {}) {
  for (const [who, text] of LINES[key] || []) hud.say(who, fill(text, vars));
}
function crewJobText(id) {
  const st = S_();
  const j = st.crew.job;
  if (j && j.target === id) {
    if (j.phase === 'travel') return `En route · ${fmt.dur(j.remain)}`;
    if (j.phase === 'standby') return 'On site · standing by';
    if (j.phase === 'work') return `${j.type === 'repair' ? 'Repairing' : 'Servicing'} · ${fmt.dur(j.remain)}`;
  }
  if (st.crew.queue.some((q) => q.target === id)) return 'Queued';
  return null;
}
const crewBusy = (id) => !!crewJobText(id);

function setTool(t) {
  if (app.mode !== 'game') return;
  app.tool = t;
  app.lineStart = null;
  app.dragging = false;
  net.showGhost(null);
  hud.showTip(null);
  hud.setTool(t, OVERLAY_SHORT[app.overlay]);
  hud.setHint(S.tools[t].hint);
  audio.play('click');
}
function cycleOverlay() {
  app.overlay = OVERLAYS[(OVERLAYS.indexOf(app.overlay) + 1) % OVERLAYS.length];
  hud.setTool(app.tool, OVERLAY_SHORT[app.overlay]);
  hud.setLegend(app.overlay);
  audio.play('click');
}
function setSpeed(s) {
  if (s === 0) app.paused = !app.paused;
  else {
    app.speed = s;
    app.paused = false;
  }
  audio.play('click');
}
function toggleSound() {
  cfg.sound = !cfg.sound;
  applySettings();
  if (cfg.sound) audio.unlock();
  return !cfg.sound;
}
function select(sel) {
  app.selected = sel;
  if (sel && sel.kind === 'building') cmd({ type: 'inspect', target: sel.id }, true);
  if (sel && sel.kind === 'gen') cmd({ type: 'inspect', target: 'gen' }, true);
  if (sel) audio.play('select');
  refreshInspector(true);
}
function selPos(sel) {
  if (!sel) return null;
  if (sel.kind === 'gen') return { x: map.generator.x, z: map.generator.z, r: 11 };
  if (sel.kind === 'depot') return { x: map.depot.x, z: map.depot.z, r: 13 };
  if (sel.kind === 'building') {
    const c = custOf(sel.id);
    return { x: c.x, z: c.z, r: Math.max(c.w, c.d) * 0.75 };
  }
  if (sel.kind === 'node') {
    const n = S_().nodes[sel.id];
    return n ? { x: n.x, z: n.z, r: n.kind === 'xfmr' ? 5 : 3.5 } : null;
  }
  if (sel.kind === 'edge') {
    const e = S_().edges[sel.id];
    if (!e) return null;
    const a = siteOf(e.a);
    const b = e.kind === 'drop' ? custOf(e.b) : siteOf(e.b);
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: 3 };
  }
  return null;
}
function focus(sel) {
  const p = selPos(sel);
  if (!p) return;
  rig.flyTo(p.x, p.z, Math.min(rig.distGoal, 170));
  select(sel);
}
let lastInsp = 0;
function refreshInspector(force) {
  if (!app.sim) return;
  const now = performance.now();
  if (!force && now - lastInsp < 250) return;
  lastInsp = now;
  inspector.render(app.mode === 'game' ? app.selected : null, S_(), { bal, xfmrName, crewJob: crewJobText, crewBusy, dropOf: (b) => app.sim.dropOf(b) });
  hud.el.alerts.classList.toggle('wide', inspector.el.hidden);
}

/** Run a sim command with player feedback. */
function cmd(c, quiet = false) {
  if (!app.sim) return { ok: false };
  const r = app.sim.cmd(c);
  if (!r.ok && !quiet) {
    audio.play('error');
    hud.alert({ id: 'cmd-err', level: 'warn', title: 'Can’t do that', text: S.reasons[r.reason] || r.reason, ttl: 4500 });
  }
  if (r.ok && !quiet && ['startGen', 'order', 'repair', 'maintain', 'reset', 'policy', 'stopGen'].includes(c.type)) audio.play('confirm');
  refreshInspector(true);
  return r;
}
function doAction(a) {
  if (a.type === 'deselect') return select(null);
  if (a.type === 'confirmRemove') return confirmRemove(a.target);
  const r = cmd(a);
  if (r.ok && a.type === 'transformer') audio.play('build');
  if (r.ok && a.type === 'drop') audio.play('build');
  if (r.ok && a.type === 'dropAll') audio.play('build');
  if (r.ok && a.type === 'remove' && app.selected && (app.selected.id === a.target || app.selected.kind === 'building')) refreshInspector(true);
}
function confirmRemove(id) {
  const st = S_();
  const what = st.nodes[id] ? (st.nodes[id].kind === 'xfmr' ? `transformer ${xfmrName(id)}` : 'this pole and its lines') : st.edges[id]?.kind === 'drop' ? 'this service drop' : 'this line';
  menus.confirm(`Remove ${what}?`, 'You get 50% of the build cost back and all materials return to stock. Customers it feeds will lose power.', 'Remove', () => {
    const r = cmd({ type: 'remove', target: id });
    if (r.ok) {
      audio.play('remove');
      if (app.selected?.id === id) select(null);
    }
  });
}
function hold(n) {
  app.hold = Math.max(0, app.hold + n);
}

// ------------------------------------------------------------------ picking
function pick(p) {
  if (!p || !app.sim) return null;
  const st = S_();
  let best = null;
  let bd = 4.5;
  for (const id in st.nodes) {
    if (id === 'gen') continue;
    const n = st.nodes[id];
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < bd) {
      bd = d;
      best = { kind: 'node', id };
    }
  }
  if (best) return best;
  const g = map.generator;
  if (rectDist(p.x, p.z, g) < 3 || Math.hypot(p.x - g.port.x, p.z - g.port.z) < 4) return { kind: 'gen', id: 'gen' };
  if (rectDist(p.x, p.z, map.depot) < 2) return { kind: 'depot', id: 'depot' };
  for (const c of map.customers) if (rectDist(p.x, p.z, c) < 0.8) return { kind: 'building', id: c.id };
  let be = null;
  let bed = 2.4;
  for (const id in st.edges) {
    const e = st.edges[id];
    const a = siteOf(e.a);
    let b = e.kind === 'drop' ? custOf(e.b) : siteOf(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
    const d = Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
    if (d < bed) {
      bed = d;
      be = { kind: 'edge', id };
    }
  }
  return be;
}
const pickNodeId = (pk) => (pk && (pk.kind === 'node' || pk.kind === 'gen') ? pk.id : null);

// ------------------------------------------------------------------ input
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerenter', () => (app.mouse.in = true));
canvas.addEventListener('pointerleave', () => {
  app.mouse.in = false;
  hud.showTip(null);
});
let rpan = null;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  canvas.focus({ preventScroll: true });
  if (app.mode !== 'game' || menus.isOpen()) return;
  const p = rig.groundAt(e.clientX, e.clientY);
  if (e.button === 2 || e.button === 1) {
    rpan = { x: e.clientX, y: e.clientY, moved: false, g: p };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0 || !p) return;
  const pk = pick(p);
  switch (app.tool) {
    case 'select':
      select(pk && pk.kind !== 'node' && pk.kind !== 'edge' ? (pk.kind === 'gen' ? { kind: 'gen' } : pk) : pk);
      break;
    case 'line': {
      if (!app.lineStart) {
        const id = pickNodeId(pk);
        if (!id) {
          audio.play('error');
          lockTip(`<b>${S.reasons.noStart}</b>`, true);
          return;
        }
        app.lineStart = id;
        app.dragging = true;
        app.downPt = p;
        audio.play('select');
      } else commitLine(p);
      break;
    }
    case 'xfmr': {
      const id = pickNodeId(pk);
      const r = cmd({ type: 'transformer', at: id && id !== 'gen' ? id : id === 'gen' ? 'gen' : { x: p.x, z: p.z } }, true);
      if (r.ok) {
        audio.play('build');
        fx.burst(S_().nodes[r.id].x, 0, S_().nodes[r.id].z, 'build', 20);
      } else {
        audio.play('error');
        lockTip(`<b>${S.reasons[r.reason] || r.reason}</b>`, true);
      }
      break;
    }
    case 'drop': {
      let r;
      if (pk?.kind === 'building') r = cmd({ type: 'drop', building: pk.id }, true);
      else if (pk?.kind === 'node') r = cmd({ type: 'dropAll', node: pk.id }, true);
      else r = { ok: false, reason: 'dropNeedsLV' };
      if (r.ok) {
        audio.play('build');
        if (pk.kind === 'building') {
          const c = custOf(pk.id);
          fx.burst(c.x, 0, c.z, 'build', 16);
        }
      } else {
        audio.play('error');
        lockTip(`<b>${S.reasons[r.reason] || r.reason}</b>`, true);
      }
      break;
    }
    case 'remove': {
      if (pk && (pk.kind === 'node' || pk.kind === 'edge')) confirmRemove(pk.id);
      else if (pk?.kind === 'building' && app.sim.dropOf(pk.id)) confirmRemove(app.sim.dropOf(pk.id));
      else {
        audio.play('error');
        lockTip('<b>Click a pole, line, drop or transformer.</b>', true);
      }
      break;
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  app.mouse.x = e.clientX;
  app.mouse.y = e.clientY;
  if (rpan) {
    const p = rig.groundAt(e.clientX, e.clientY);
    if (Math.hypot(e.clientX - rpan.x, e.clientY - rpan.y) > 4) rpan.moved = true;
    if (rpan.moved && p && rpan.g) {
      rig.goal.x += rpan.g.x - p.x;
      rig.goal.z += rpan.g.z - p.z;
      rig.target.x += rpan.g.x - p.x;
      rig.target.z += rpan.g.z - p.z;
    }
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (rpan) {
    if (!rpan.moved) {
      // right-click: cancel
      if (app.lineStart) {
        app.lineStart = null;
        net.showGhost(null);
        audio.play('cancel');
      } else if (app.tool !== 'select') setTool('select');
      else select(null);
    }
    rpan = null;
    return;
  }
  if (app.mode !== 'game' || e.button !== 0) return;
  if (app.tool === 'line' && app.dragging) {
    app.dragging = false;
    const p = rig.groundAt(e.clientX, e.clientY);
    if (p && app.downPt && Math.hypot(p.x - app.downPt.x, p.z - app.downPt.z) > 5) commitLine(p);
  }
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (app.mode !== 'game') return;
    rig.zoom(e.deltaY > 0 ? 1.12 : 0.89);
  },
  { passive: false },
);

function lineTarget(p) {
  const pk = pick(p);
  const id = pickNodeId(pk);
  return id && id !== app.lineStart ? id : { x: p.x, z: p.z };
}
function commitLine(p) {
  const to = lineTarget(p);
  const start = S_().nodes[app.lineStart];
  const r = cmd({ type: 'line', from: app.lineStart, to, tier: app.shift && start?.kind === 'xfmr' ? 'MV' : undefined }, true);
  if (r.ok) {
    audio.play('build');
    for (const id of r.nodes.slice(1)) {
      const n = S_().nodes[id];
      if (n && n.kind !== 'gen') fx.burst(n.x, 0, n.z, 'build', 14);
    }
    app.lineStart = r.last;
  } else {
    audio.play('error');
    lockTip(`<b>${S.reasons[r.reason] || r.reason}</b>`, true);
  }
}
function lockTip(html, bad) {
  hud.showTip(html, app.mouse.x, app.mouse.y, bad);
  app.tipLock = performance.now() + 2200;
}

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.key === 'Shift') app.shift = true;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (app.mode === 'ending' && e.key === 'Escape') return app.ending?.jump();
  if (app.mode !== 'game') return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (menus.isOpen()) return void menus.closeTop();
    if (app.lineStart) {
      app.lineStart = null;
      net.showGhost(null);
      return;
    }
    if (app.tool !== 'select') return setTool('select');
    if (app.selected) return select(null);
    return openPause();
  }
  if (menus.isOpen()) return;
  const k = e.key.toLowerCase();
  if (e.key === ' ') {
    e.preventDefault();
    return setSpeed(0);
  }
  if (k === '1' || k === '2' || k === '3') return setSpeed(+k);
  const toolKeys = { v: 'select', l: 'line', t: 'xfmr', c: 'drop', x: 'remove' };
  if (toolKeys[k]) return setTool(toolKeys[k]);
  if (k === 'o') return cycleOverlay();
  if (k === 'q') return rig.rotate(-1);
  if (k === 'e') return rig.rotate(1);
  if (e.key === 'Home') return rig.reset();
  if ((e.key === 'Delete' || e.key === 'Backspace') && app.selected) {
    e.preventDefault();
    const sel = app.selected;
    if (sel.kind === 'node' || sel.kind === 'edge') confirmRemove(sel.id);
    else if (sel.kind === 'building' && app.sim.dropOf(sel.id)) confirmRemove(app.sim.dropOf(sel.id));
    return;
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    e.preventDefault();
    app.keys.add(k);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') app.shift = false;
  app.keys.delete(e.key.toLowerCase());
});
window.addEventListener('blur', () => {
  app.keys.clear();
  app.shift = false;
});

// ------------------------------------------------------------------ hover preview / tips
function updateHover() {
  if (app.mode !== 'game' || !app.mouse.in || menus.isOpen()) {
    net.showGhost(null);
    if (performance.now() > app.tipLock) hud.showTip(null);
    return;
  }
  const p = rig.groundAt(app.mouse.x, app.mouse.y);
  app.mouse.ground = p;
  const pk = p ? pick(p) : null;
  app.hover = pk;
  canvas.style.cursor = rpan?.moved ? 'grabbing' : app.tool !== 'select' ? 'crosshair' : pk ? 'pointer' : 'default';
  if (performance.now() < app.tipLock) return;
  const st = S_();
  let tip = null;
  let bad = false;
  if (app.tool === 'line') {
    if (app.lineStart && p) {
      const start = st.nodes[app.lineStart];
      const pl = app.sim.preview({ type: 'line', from: app.lineStart, to: lineTarget(p), tier: app.shift && start?.kind === 'xfmr' ? 'MV' : undefined });
      const pts = pl.points && pl.points.length ? pl.points : [st.nodes[app.lineStart].kind === 'gen' ? map.generator.port : start, p];
      net.showGhost(pts, pl.ok, performance.now() / 1000, pl.tier || 'LV');
      const tierName = pl.tier === 'MV' ? '11 kV line' : '400 V line';
      if (pl.ok) tip = `<b>${tierName}</b> · ${pl.newPoles} pole${pl.newPoles === 1 ? '' : 's'} · ${pl.meters} m<br><span class="cost">${fmt.cr(pl.cost)}</span> <span style="color:var(--muted)">· click to build</span>`;
      else {
        tip = `<b>${tierName}</b><br>${S.reasons[pl.reason] || pl.reason}${pl.cost ? ` <span class="cost">${fmt.cr(pl.cost)}</span>` : ''}`;
        bad = true;
      }
    } else {
      net.showGhost(null);
      const id = pickNodeId(pk);
      tip = id ? `Start a line from <b>${id === 'gen' ? 'the generator (11 kV)' : st.nodes[id].kind === 'xfmr' ? `${xfmrName(id)} (400 V out)` : st.nodes[id].tier === 'MV' ? 'this 11 kV pole' : 'this 400 V pole'}</b>` : 'Click the generator, a pole or a transformer';
    }
  } else if (app.tool === 'xfmr') {
    const id = pickNodeId(pk);
    const pl = app.sim.preview({ type: 'transformer', at: id || (p ? { x: p.x, z: p.z } : null) });
    tip = pl.ok ? `<b>Mount transformer</b> · 11 kV → 400 V, 40 kW<br><span class="cost">${fmt.cr(pl.cost)}</span>` : `<b>Transformer</b><br>${S.reasons[pl.reason]}`;
    bad = !pl.ok;
  } else if (app.tool === 'drop') {
    if (pk?.kind === 'building') {
      const pl = app.sim.preview({ type: 'drop', building: pk.id });
      tip = pl.ok ? `<b>Service drop</b> to ${custOf(pk.id).name}<br><span class="cost">${fmt.cr(pl.cost)}</span>` : `<b>${custOf(pk.id).name}</b><br>${S.reasons[pl.reason]}`;
      bad = !pl.ok;
    } else if (pk?.kind === 'node') tip = '<b>Connect every building within 22 m</b> of this pole';
    else tip = 'Click a building (or a 400 V pole)';
  } else if (app.tool === 'remove') {
    if (pk && (pk.kind === 'node' || pk.kind === 'edge')) tip = '<b>Remove</b> · 50% refund, materials returned';
    else tip = 'Click a pole, line, drop or transformer';
  } else if (pk && app.tool === 'select') {
    const name = pk.kind === 'gen' ? 'Diesel generator' : pk.kind === 'depot' ? 'Grid Ops depot' : pk.kind === 'building' ? custOf(pk.id).name : pk.kind === 'node' ? (st.nodes[pk.id].kind === 'xfmr' ? `Transformer ${xfmrName(pk.id)}` : st.nodes[pk.id].tier === 'MV' ? '11 kV pole' : '400 V pole') : st.edges[pk.id]?.kind === 'drop' ? 'Service drop' : 'Line';
    tip = `<b>${name}</b>`;
    if (pk.kind === 'building') {
      const cs = st.cust[pk.id];
      tip += ` · ${S.status[cs.status].label}`;
      bad = cs.status !== 'on';
    }
  }
  hud.showTip(tip, app.mouse.x, app.mouse.y, bad);
}

// ------------------------------------------------------------------ events → feedback
function learnOnce(key, vars = {}) {
  if (app.learnSeen.has(key)) return;
  app.learnSeen.add(key);
  const pausing = cfg.autoPause;
  if (pausing) hold(+1);
  setTimeout(() => {
    if (app.mode !== 'game') {
      if (pausing) hold(-1);
      return;
    }
    menus.learn(key, vars, () => pausing && hold(-1));
  }, 350);
}
function focusAct(id) {
  return { label: 'Focus', fn: () => focus(id === 'gen' ? { kind: 'gen' } : { kind: 'node', id }) };
}
function handleEvents(evs) {
  const st = S_();
  for (const e of evs) {
    switch (e.type) {
      case 'firstLight':
        audio.play('swell');
        say('firstLight');
        schedulePower();
        app.firstLightPending = true;
        break;
      case 'powerOn':
        audio.play('connect');
        break;
      case 'powerOff': {
        const shed = Object.entries(e.reasons).filter(([, r]) => r === 'shed').map(([id]) => custOf(id).name);
        if (shed.length && e.t - (st.gen.startT ?? -999) > bal.generator.rampH * 60 + 1) hud.alert({ id: 'shed', level: 'warn', title: 'Supply short — load shed', text: `${shed.slice(0, 3).join(', ')}${shed.length > 3 ? ` +${shed.length - 3}` : ''} disconnected by your policy.`, ttl: 8000 });
        break;
      }
      case 'genStart':
        audio.play('genStart');
        forecastCheck(true);
        break;
      case 'genRunning':
        say('genRunning');
        if (app.firstLightPending) {
          app.firstLightPending = false;
          setTimeout(() => learnOnce('firstLight'), 1800);
        }
        break;
      case 'xfmrWarn':
        if (!app.nudges['warn' + e.target]) {
          app.nudges['warn' + e.target] = true;
          say('xfmrWarn', { name: xfmrName(e.target), pct: fmt.pct(e.pct) });
        }
        break;
      case 'xfmrOverload': {
        const n = st.nodes[e.target];
        audio.play('warn');
        hud.alert({ id: 'ovl-' + e.target, level: 'warn', title: `${xfmrName(e.target)} overloaded — ${fmt.pct(e.pct)}`, text: `Carrying ${fmt.kw(n.loadKW)} on a 40 kW rating. It trips in ~60 min unless its load drops.`, actions: [focusAct(e.target)] });
        learnOnce('overload', { name: xfmrName(e.target), kw: fmt.kw(n.loadKW), focus: () => focus({ kind: 'node', id: e.target }) });
        break;
      }
      case 'xfmrTrip': {
        const n = st.nodes[e.target];
        audio.play('trip');
        fx.burst(n.x, 7, n.z, 'sparks', 40);
        hud.dismiss('ovl-' + e.target);
        hud.alert({ id: 'trip-' + e.target, level: 'critical', title: `${xfmrName(e.target)} tripped on overload`, text: `${e.affected.length} customers dark. Reduce its load, then Reset after 30 min of cooling.`, actions: [focusAct(e.target)] });
        say('trip', { name: xfmrName(e.target) });
        learnOnce('trip', { name: xfmrName(e.target), focus: () => focus({ kind: 'node', id: e.target }) });
        break;
      }
      case 'reset':
        hud.dismiss('trip-' + e.id);
        say('reset', { name: xfmrName(e.id) });
        break;
      case 'bill': {
        audio.play('bill');
        if (!app.learnSeen.has('bill')) {
          say('bill', { rev: fmt.cr(e.revenue) });
          learnOnce('bill', { kwh: fmt.kwh(e.kWh), rev: fmt.cr(e.revenue), kw: fmt.kw(e.demandNow) });
        } else hud.alert({ id: 'bill', level: 'good', title: `Day ${e.day} billed: +${fmt.cr(e.revenue)}`, text: `${fmt.kwh(e.kWh)} sold · overhead −${fmt.cr(e.overhead)} · peak ${fmt.kw(e.peakKW)}`, ttl: 7000 });
        break;
      }
      case 'fuelLow':
        audio.play('warn');
        say('fuelLow', { h: Math.floor((st.gen.fuel * 20) / Math.max(1, st.flow.genKW)) });
        hud.alert({ id: 'fuel', level: 'warn', title: 'Fuel below 30 units', text: 'A delivery takes 6 hours. Order now to avoid a blackout.', actions: [{ label: 'Order fuel · 250 ¢', primary: true, fn: () => cmd({ type: 'order', item: 'fuel' }) && hud.dismiss('fuel') }, focusAct('gen')] });
        break;
      case 'noFuel':
        audio.play('critical');
        say('noFuel');
        hud.alert({ id: 'fuel', level: 'critical', title: 'Generator out of fuel', text: 'The whole network is dark. Order fuel now.', actions: [{ label: 'Order fuel · 250 ¢', primary: true, fn: () => cmd({ type: 'order', item: 'fuel' }) && hud.dismiss('fuel') }, focusAct('gen')] });
        learnOnce('noFuel', { focus: () => focus({ kind: 'gen' }) });
        break;
      case 'ordered':
        say('ordered', { qty: e.qty, item: e.item === 'fuel' ? 'units of fuel' : e.item, h: e.etaH });
        break;
      case 'delivery':
        audio.play('confirm');
        hud.alert({ id: 'delivery-' + e.item, level: 'info', title: `Delivery: ${e.qty} ${e.item === 'fuel' ? 'units of fuel' : e.item}`, ttl: 5000 });
        if (e.item === 'fuel') hud.dismiss('fuel');
        break;
      case 'faultWarn': {
        const n = st.nodes[e.target];
        audio.play('warn');
        say('faultWarn', { name: xfmrName(e.target), temp: `${Math.round(Math.max(n.tempC, 88))} °C` });
        hud.alert({ id: 'fault-' + e.target, level: 'warn', title: `${xfmrName(e.target)} overheating — failure likely`, text: 'Temperature is rising without extra load. Pre-dispatch the crew so they are on site when it fails.', actions: [{ label: 'Send crew now', primary: true, fn: () => cmd({ type: 'repair', target: e.target }).ok && hud.dismiss('fault-' + e.target) }, focusAct(e.target)] });
        break;
      }
      case 'fault': {
        const n = st.nodes[e.target];
        const clinic = e.affected.includes('clinic');
        audio.play('trip');
        audio.play('critical');
        fx.burst(n.x, 7, n.z, 'sparks', 60);
        const pre = crewBusy(e.target);
        hud.alert({ id: 'fault-' + e.target, level: 'critical', title: `${xfmrName(e.target)} FAULT — ${e.affected.length} customers dark`, text: `${clinic ? 'Including the clinic (6 h limit). ' : ''}${pre ? 'Your crew is already on it.' : 'Send the repair crew: 1 kit + 200 ¢.'}`, actions: [pre ? null : { label: 'Send repair crew', primary: true, fn: () => cmd({ type: 'repair', target: e.target }).ok && hud.dismiss('fault-' + e.target) }, focusAct(e.target)].filter(Boolean) });
        say(clinic ? 'fault' : 'faultNoClinic', { name: xfmrName(e.target) });
        learnOnce('fault', { name: xfmrName(e.target), count: e.affected.length, clinic: clinic ? ', including the clinic' : '', focus: () => focus({ kind: 'node', id: e.target }) });
        break;
      }
      case 'crewDispatched':
        say('crewDispatched', { name: e.target === 'gen' ? 'the generator' : xfmrName(e.target), eta: fmt.dur(e.etaMin) });
        break;
      case 'repairStart':
        audio.play('repair');
        say('repairStart', { name: xfmrName(e.target) });
        break;
      case 'repaired': {
        audio.play('objective');
        hud.dismiss('fault-' + e.target);
        say('repaired', { name: xfmrName(e.target) });
        if (st.fault.target === e.target) learnOnce('restored', { name: xfmrName(e.target), dur: fmt.dur(st.fault.restoredT - st.fault.tripT) });
        break;
      }
      case 'maintStart':
        say('maintStart', { name: e.target === 'gen' ? 'the generator' : xfmrName(e.target) });
        break;
      case 'maintained':
        audio.play('confirm');
        say('maintained', { name: e.target === 'gen' ? 'The generator' : xfmrName(e.target) });
        break;
      case 'objective':
        audio.play('objective');
        hud.alert({ id: 'obj-' + e.id, level: 'good', title: 'Objective complete', text: S.objectives[e.id], ttl: 5000 });
        break;
      case 'failWarn': {
        const t = { fuel: ['Fuel out — mission at risk', 'Order fuel now. Without a delivery on its way the mission fails in'], clinic: ['Clinic dark — mission at risk', 'Restore power to the clinic. The mission fails in'], bankrupt: ['Credits nearly gone', 'Without income the mission fails in'], deadline: ['Final day', 'The district must be stable by midnight — time left:'] }[e.cause];
        audio.play('critical');
        hud.alert({ id: 'fail-' + e.cause, level: 'critical', title: t[0], text: `${t[1]} ${fmt.dur(e.minutesLeft)}.`, actions: e.cause === 'fuel' ? [{ label: 'Order fuel · 250 ¢', primary: true, fn: () => cmd({ type: 'order', item: 'fuel' }) }] : e.cause === 'clinic' ? [{ label: 'Focus clinic', fn: () => focus({ kind: 'building', id: 'clinic' }) }] : [] });
        if (e.cause === 'clinic') say('clinicWarn', { h: Math.round(st.cust.clinic.outMin / 60) });
        break;
      }
      case 'stableReset':
        hud.alert({ id: 'stable', level: 'warn', title: 'Stability clock restarted', text: 'Every customer must stay fully powered for 24 h in a row.', ttl: 6000 });
        break;
      case 'victory':
      case 'fail':
        showResult();
        break;
    }
  }
}
function forecastCheck(force) {
  const st = S_();
  for (const id in st.nodes) {
    const n = st.nodes[id];
    if (n.kind !== 'xfmr' || n.state !== 'ok') continue;
    if (n.forecastPeakKW > bal.transformer.ratingKW + 0.01) {
      const key = 'fc' + id + Math.floor(st.clock / 1440);
      if (app.nudges[key] && !force) continue;
      app.nudges[key] = true;
      say('forecast', { name: xfmrName(id), kw: fmt.kw(n.forecastPeakKW) });
      hud.alert({ id: 'fc-' + id, level: 'warn', title: `${xfmrName(id)} forecast: ${fmt.kw(n.forecastPeakKW)} at the evening peak`, text: 'Its rating is 40 kW. Split its customers across another transformer before 18:00.', actions: [focusAct(id)], ttl: 15000 });
    }
  }
}
function timedNudges() {
  const st = S_();
  const hour = Math.floor((st.clock % 1440) / 60);
  const day = Math.floor(st.clock / 1440) + 1;
  if (st.t === app.lastHour) return;
  if (st.t % 60 !== 0) return;
  app.lastHour = st.t;
  if (hour >= 15 && hour <= 17) forecastCheck(false);
  if (day === 2 && hour === 8 && !app.nudges.margin) {
    app.nudges.margin = true;
    say('marginNudge');
  }
  if (st.gen.condition < 85 && !app.nudges.service && !st.objectives.service) {
    app.nudges.service = true;
    say('serviceNudge');
  }
  if (st.fault.phase === 'repaired' && st.stableMin > 0 && !app.nudges.stable) {
    app.nudges.stable = true;
    say('stableStart');
  }
  autosave();
}

// building light-up follows the power wave from the generator
function schedulePower() {
  const st = S_();
  const now = performance.now() / 1000;
  for (const c of map.customers) {
    const s = st.cust[c.id].status;
    const on = s === 'on' || s === 'partial';
    const was = app.shown[c.id];
    if (was === s) continue;
    const wasOn = was === 'on' || was === 'partial';
    if (on && !wasOn) {
      const delay = cfg.reduceMotion ? 0 : Math.min(2.8, (Math.hypot(c.x - map.generator.port.x, c.z - map.generator.port.z) * 1.25) / 90) + 0.25;
      if (!app.pending.has(c.id)) app.pending.set(c.id, now + delay);
    } else {
      app.pending.delete(c.id);
      world.setPower(c.id, s);
      app.shown[c.id] = s;
    }
  }
  for (const [id, at] of app.pending) {
    if (now >= at) {
      app.pending.delete(id);
      const s = st.cust[id].status;
      world.setPower(id, s);
      app.shown[id] = s;
      const c = custOf(id);
      if (s === 'on' && !cfg.reduceMotion) fx.burst(c.x, 6, c.z, 'light', 10);
    }
  }
  // street lights by cluster
  const frac = (pred) => {
    const cs = map.customers.filter(pred);
    return cs.filter((c) => ['on', 'partial'].includes(app.shown[c.id])).length / cs.length;
  };
  world.setGroupLevel('street-n', frac((c) => c.z < 0) >= 0.5 ? 1 : 0);
  world.setGroupLevel('street-s', frac((c) => c.z > 0) >= 0.5 ? 1 : 0);
}

// ------------------------------------------------------------------ tutorial
function tutDone(step) {
  const st = S_();
  switch (step.id) {
    case 'gen':
      return !!st.inspected.gen;
    case 'clinic':
      return !!st.inspected.clinic;
    case 'demand':
      return !!st.inspected.demand;
    case 'tool':
      return app.tool === 'line' || Object.keys(st.edges).length > 0;
    case 'mv':
      return Object.values(st.nodes).some((n) => (n.kind === 'pole' && n.tier === 'MV' && n.x >= -45) || n.kind === 'xfmr');
    case 'xfmr':
      return !!st.objectives.xfmr;
    case 'lv':
      return st.cust.clinic.dropped && st.cust.clinic.connected;
    case 'start':
      return st.gen.everStarted;
    case 'rest':
      return st.flow.connected === 13;
  }
  return true;
}
let tutKey = '';
function updateTutorial() {
  if (app.tut < 0 || app.mode !== 'game') {
    inspector.el.style.maxHeight = '';
    tutEl.hidden = true;
    fx.marker(null);
    document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    return;
  }
  while (app.tut < TUTORIAL.length && tutDone(TUTORIAL[app.tut])) {
    app.tut++;
    if (app.tut < TUTORIAL.length) audio.play('connect');
  }
  if (app.tut >= TUTORIAL.length) {
    app.tut = -1;
    say('tutorialDone');
    return updateTutorial();
  }
  const step = TUTORIAL[app.tut];
  const key = step.id;
  if (key !== tutKey) {
    tutKey = key;
    tutEl.hidden = false;
    tutEl.innerHTML = '';
    tutEl.append(
      h('div', { class: 'step', text: `Tutorial · step ${app.tut + 1} of ${TUTORIAL.length}` }),
      h('h4', { text: step.title }),
      h('p', { text: step.body }),
      h('div', { class: 'acts' }, h('button', { class: 'btn small', onclick: () => endTutorial() }, 'End tutorial'), h('button', { class: 'btn small', onclick: () => skipStep() }, 'Skip step')),
    );
    document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    if (step.target?.ui) document.querySelector(step.target.ui)?.classList.add('tut-glow');
  }
  const tr = tutEl.getBoundingClientRect();
  inspector.el.style.maxHeight = `${Math.max(220, tr.top - 90)}px`;
  const t = step.target;
  if (t?.world === 'gen') fx.marker(map.generator.x, map.generator.z, 13);
  else if (t?.world === 'clinic') fx.marker(custOf('clinic').x, custOf('clinic').z, 13);
  else if (t?.world === 'marker') fx.marker(t.x, t.z, 6);
  else fx.marker(null);
}
function skipStep() {
  // skipping marks the step as seen; game state still has to satisfy later steps
  app.tut++;
  tutKey = '';
  if (app.tut >= TUTORIAL.length) endTutorial();
  audio.play('click');
}
function endTutorial() {
  app.tut = -1;
  tutKey = '';
  updateTutorial();
  audio.play('click');
}
function tutLabel() {
  if (app.tut < 0) return null;
  const t = TUTORIAL[app.tut]?.target;
  if (!t?.world) return null;
  const p = t.world === 'gen' ? { x: map.generator.x, z: map.generator.z, y: 12 } : t.world === 'clinic' ? { x: custOf('clinic').x, z: custOf('clinic').z, y: 14 } : { x: t.x, z: t.z, y: 8 };
  const txt = { gen: 'Generator', clinic: 'Community Clinic', marker: 'Run the line to here' }[t.world];
  return { key: 'tut', x: p.x, y: p.y, z: p.z, html: `${icon('target')}${txt}`, cls: 'tut' };
}

// ------------------------------------------------------------------ labels
function buildLabels() {
  const st = S_();
  const L = [];
  const band = rig.zoomBand();
  for (const id in st.nodes) {
    const n = st.nodes[id];
    if (n.kind !== 'xfmr') continue;
    const name = xfmrName(id);
    let cls = '';
    let html = `${icon('xfmr')}${name}`;
    const notable = n.state !== 'ok' || n.overheat || n.loadPct >= 85 || app.overlay === 'capacity' || app.overlay === 'condition';
    if (n.state === 'fault') {
      cls = 'bad';
      html = `${icon('alert')}${name} · FAULT`;
    } else if (n.state === 'trip') {
      cls = 'bad';
      html = `${icon('alert')}${name} · TRIPPED`;
    } else if (n.state === 'maint') html = `${icon('wrench')}${name} · service`;
    else if (n.overheat) {
      cls = 'warn';
      html = `${icon('thermo')}${name} · ${Math.round(n.tempC)} °C`;
    } else if (app.overlay === 'condition') {
      cls = n.condition < 40 ? 'bad' : n.condition < 70 ? 'warn' : 'good';
      html = `${icon('wrench')}${name} · ${Math.round(n.condition)}%`;
    } else if (n.loadPct >= 85 || app.overlay === 'capacity') {
      cls = n.loadPct >= 100 ? 'bad' : n.loadPct >= 85 ? 'warn' : 'good';
      html = `${icon(n.loadPct >= 85 ? 'warn' : 'gauge')}${name} · ${Math.round(n.loadKW)}/40 kW`;
    }
    if (notable || band !== 'planning') L.push({ key: 'x' + id, x: n.x, y: n.onPole ? 12.5 : 4.5, z: n.z, html, cls: cls + (notable ? '' : ' mini') });
  }
  for (const c of map.customers) {
    const cs = st.cust[c.id];
    const b = world.buildings[c.id];
    const showAll = app.overlay === 'outages';
    if (cs.status === 'on' && !showAll) continue;
    if (cs.status === 'unconnected' && !showAll && !(c.type === 'clinic' && st.started)) continue;
    if (!showAll && band === 'planning' && cs.status !== 'xfmrDown' && c.type !== 'clinic') continue;
    const ok = cs.status === 'on';
    const short = { unconnected: 'not connected', nopath: 'no route', xfmrDown: 'transformer out', noFuel: 'no fuel', genOff: 'generator off', shed: 'shed', partial: 'low supply', on: 'powered' }[cs.status];
    L.push({ key: 'b' + c.id, x: c.x, y: b.height + 3.5, z: c.z, html: `${icon(ok ? 'bolt' : 'dark')}${c.type === 'home' ? '' : c.name.split(' ').slice(-1)[0] + ' · '}${short}`, cls: (ok ? 'good' : cs.status === 'unconnected' ? '' : 'bad') + ' mini' });
  }
  const j = st.crew.job;
  if (j) {
    const tp = people.truck.position;
    L.push({ key: 'crew', x: tp.x, y: 5, z: tp.z, html: `${icon('truck')}Crew · ${j.phase === 'travel' ? 'ETA ' + fmt.dur(j.remain) : j.phase === 'work' ? fmt.dur(j.remain) + ' left' : j.phase === 'standby' ? 'standing by' : 'returning'}`, cls: 'crew' });
  }
  if (st.gen.status !== 'running' && band !== 'planning' && !(app.tut >= 0 && TUTORIAL[app.tut]?.target?.world === 'gen')) {
    L.push({ key: 'gen', x: map.generator.x, y: 9, z: map.generator.z, html: `${icon('gen')}Generator · ${S.genState[st.gen.status]}`, cls: st.gen.status === 'nofuel' ? 'bad' : st.gen.status === 'starting' ? 'warn' : '' });
  }
  if (app.lineStart && st.nodes[app.lineStart]) {
    const p = siteOf(app.lineStart);
    L.push({ key: 'ls', x: p.x, y: 3, z: p.z, html: 'start', cls: 'tut mini' });
  }
  const tl = tutLabel();
  if (tl) L.push(tl);
  hud.updateLabels(L, rig.toScreen);
}

// ------------------------------------------------------------------ screens
function fade(on) {
  fadeEl.classList.toggle('on', on);
}
function clearScreens() {
  menus.closeAll();
  app.menuEl?.remove();
  app.menuEl = null;
  app.ending?.el.remove();
  app.ending = null;
}

function startIntro() {
  app.mode = 'intro';
  app.sim = createSim({ seed: 1337 });
  resetVisuals();
  let t0 = performance.now() / 1000;
  rig.cinematic = (t) => {
    const k = Math.min(1, (t - t0) / 9);
    const e = 1 - Math.pow(1 - k, 3);
    return { target: new THREE.Vector3(-20 + e * 20, 0, e * 4), yaw: 0.2 + e * 0.6, pitch: 1.2 - e * 0.45, dist: 520 - e * 260 };
  };
  setTimeout(() => fade(false), 150);
  const intro = menus.intro(() => startMenu());
  setTimeout(() => intro.show(), 900);
  setTimeout(() => intro.line(fill(LINES.intro[0][1], {})), 4200);
  setTimeout(() => intro.finish(), 9500);
}

function startMenu() {
  clearScreens();
  app.mode = 'menu';
  hud.show(false);
  inspector.render(null);
  tutEl.hidden = true;
  fx.marker(null);
  fx.select(null);
  if (!app.sim || app.sim.state.started) {
    app.sim = createSim({ seed: 1337 });
    resetVisuals();
  }
  const t0 = performance.now() / 1000;
  rig.cinematic = (t) => ({ target: new THREE.Vector3(10, 0, 0), yaw: 0.8 + (t - t0) * 0.025, pitch: 0.62, dist: 250 });
  const save = store.get(SAVE_KEY);
  const m = menus.mainMenu({
    hasSave: !!save,
    onContinue: () => (audio.play('confirm'), startGame(save)),
    onNew: () => (audio.play('confirm'), startGame(null)),
    onHow: () => menus.howTo(),
    onSettings: () => openSettings(true),
    onCredits: () => menus.credits(),
  });
  app.menuEl = m.el;
  fade(false);
}

function openSettings(fromMenu) {
  hold(+1);
  menus.settings(
    cfg,
    () => applySettings(),
    () => hold(-1),
    { onJumpEnding: () => (menus.closeAll(), (app.hold = 0), jumpToEnding()) },
  );
  void fromMenu;
}

function resetVisuals() {
  app.shown = {};
  app.pending.clear();
  for (const c of map.customers) world.setPower(c.id, 'off');
  world.setGroupLevel('street-n', 0);
  world.setGroupLevel('street-s', 0);
  for (const id of [...map.customers.map((c) => c.id), 'street-n', 'street-s']) if (world.groups[id]) world.groups[id].level = 0;
}

function startGame(save) {
  clearScreens();
  fade(true);
  setTimeout(() => {
    let sim = null;
    if (save) {
      try {
        sim = loadSim(save);
      } catch (e) {
        console.warn('Save incompatible, starting new game', e);
        store.del(SAVE_KEY);
      }
    }
    app.sim = sim || createSim({ seed: 1337 });
    app.mode = 'game';
    app.paused = false;
    app.speed = 1;
    app.acc = 0;
    app.hold = 0;
    app.selected = null;
    app.lineStart = null;
    app.overlay = 'flow';
    app.learnSeen = new Set(save?.ui?.learnSeen || []);
    app.nudges = save?.ui?.nudges || {};
    app.tut = sim ? (save.ui?.tut ?? -1) : cfg.tutorial ? 0 : -1;
    app.lastHour = -1;
    app.resultShown = false;
    tutKey = '';
    resetVisuals();
    hud.clearAlerts();
    hud.show(true);
    hud.setLegend('flow');
    setTool('select');
    rig.cinematic = null;
    rig.target.set(-22, 0, 8);
    rig.goal.set(-22, 0, 8);
    rig.yaw = rig.yawGoal = Math.PI / 4;
    rig.dist = rig.distGoal = 310;
    rig.pitch = rig.pitchGoal = 0.92;
    app.sim.drainEvents();
    schedulePower();
    if (!sim) say('intro');
    else hud.alert({ id: 'cont', level: 'info', title: 'Game restored', text: `Day ${fmt.clock(S_().clock).day}, ${fmt.clock(S_().clock).time}.`, ttl: 4000 });
    fade(false);
    canvas.focus({ preventScroll: true });
  }, 450);
}

function openPause() {
  if (app.mode !== 'game' || menus.isOpen()) return;
  autosave();
  hold(+1);
  audio.play('click');
  menus.pause({
    muted: !cfg.sound,
    onResume: () => hold(-1),
    onSound: () => toggleSound(),
    onRestart: () => {
      app.hold = 0;
      store.del(SAVE_KEY);
      startGame(null);
    },
    onMenu: () => {
      app.hold = 0;
      autosave();
      fade(true);
      setTimeout(() => startMenu(), 450);
    },
    onHow: () => menus.howTo(),
    onSettings: () => openSettings(false),
  });
}

function showResult() {
  if (app.resultShown) return;
  app.resultShown = true;
  const r = S_().result;
  store.del(SAVE_KEY);
  hold(+1);
  setTimeout(() => {
    if (r.outcome === 'victory') {
      audio.play('victory');
      menus.victory(r, {
        onContinue: () => startEnding(app.sim),
        onReplay: () => startGame(null),
        onMenu: () => startMenu(),
      });
    } else {
      audio.play('fail');
      menus.fail(r, { onRetry: () => startGame(null), onMenu: () => startMenu() });
    }
  }, 1400);
}

function jumpToEnding() {
  // Review-build shortcut: play the reference strategy to victory, then show the ending.
  const sim = createSim({ seed: 1337 });
  let last = null;
  const at = (x, z) => Object.keys(sim.state.nodes).find((id) => Math.hypot(sim.state.nodes[id].x - x, sim.state.nodes[id].z - z) < 1);
  for (const s of map.reference) {
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
    for (const e of sim.drainEvents()) if (e.type === 'fault') sim.cmd({ type: 'repair', target: e.target });
  }
  startEnding(sim);
}

function startEnding(sim) {
  clearScreens();
  app.sim = sim;
  app.mode = 'ending';
  app.hold = 0;
  hud.show(false);
  inspector.render(null);
  tutEl.hidden = true;
  fx.marker(null);
  fx.select(null);
  for (const c of map.customers) world.setPower(c.id, sim.state.cust[c.id].status === 'off' ? 'off' : 'on');
  world.setGroupLevel('street-n', 1);
  world.setGroupLevel('street-s', 1);
  const t0 = performance.now() / 1000;
  rig.cinematic = (t) => {
    const k = (t - t0) / 60;
    return { target: new THREE.Vector3(20 - k * 10, 0, 4), yaw: 2.3 + (t - t0) * (cfg.reduceMotion ? 0.006 : 0.03), pitch: 0.62 - Math.min(0.2, k * 0.4), dist: 260 - Math.min(90, (t - t0) * 3) };
  };
  fireflies.on = true;
  const score = sim.state.result?.score || { ending: 'reliable', total: 0 };
  const M = sim.state.result?.metrics;
  const lines = [...ENDING.common, ENDING[score.ending]];
  if (M) for (const k of ['split', 'preDispatch', 'ordered', 'serviced']) if (M.decisions[k] && lines.length < 5) lines.push(ENDING.decisions[k]);
  lines.push(ENDING.next);
  audio.setWarmth(13);
  app.ending = menus.ending({
    kicker: `Stage 1 complete · ${S.endings[score.ending]}`,
    title: 'The First District is lit',
    lines,
    onEnd: () => {
      fireflies.on = false;
      fade(true);
      setTimeout(() => startMenu(), 600);
    },
  });
}

function autosave() {
  if (app.mode !== 'game' || !app.sim || S_().result) return;
  store.set(SAVE_KEY, { ...app.sim.save(), ui: { tut: app.tut, learnSeen: [...app.learnSeen], nudges: app.nudges } });
}
document.addEventListener('visibilitychange', () => document.hidden && autosave());
window.addEventListener('beforeunload', () => autosave());
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

// ------------------------------------------------------------------ ambient emitters
const smoke = fx.addEmitter({
  rate: 0,
  make: () => {
    const p = world.generator.stackTop;
    return { x: p.x + (Math.random() - 0.5) * 0.4, y: p.y, z: p.z, vx: 0.6 + Math.random() * 0.5, vy: 2.6 + Math.random(), vz: (Math.random() - 0.5) * 0.6, g: 0, life: 3.2, s0: 1.4, s1: 5, c: new THREE.Color(0.16, 0.18, 0.22), fade: 0 };
  },
});
for (const ct of world.coolingTowers) {
  fx.addEmitter({
    rate: 6,
    make: () => ({ x: ct.x + (Math.random() - 0.5) * ct.r, y: ct.top, z: ct.z + (Math.random() - 0.5) * ct.r, vx: 1.2, vy: 4 + Math.random() * 2, vz: 0.3, g: 0, life: 6, s0: 8, s1: 22, c: new THREE.Color(0.2, 0.26, 0.34), fade: 0 }),
  });
}
const fireflies = fx.addEmitter({
  rate: 18,
  make: () => {
    const c = map.customers[Math.floor(Math.random() * map.customers.length)];
    const warm = Math.random() < 0.5;
    return { x: c.x + (Math.random() - 0.5) * 30, y: 1 + Math.random() * 3, z: c.z + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.6, g: 0, life: 4, s0: 1.1, s1: 0.3, c: warm ? new THREE.Color(2.2, 1.4, 0.5) : new THREE.Color(0.4, 1.6, 2.4), fade: 0 };
  },
});
fireflies.on = false;

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
timer.connect?.(document);
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
let lastUi = 0;
const fpsEl = TEST || params.has('fps') ? document.body.appendChild(h('div', { id: 'fps' })) : null;

function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const dt = Math.min(0.1, timer.getDelta());
  const time = timer.getElapsed();
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc >= 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
    if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · ${G.renderer.info.render.calls} calls`;
  }
  const sim = app.sim;
  if (!sim) return;
  const st = sim.state;

  // --- simulation (fixed tick, independent of frame rate)
  const running = app.mode === 'game' && !app.paused && app.hold === 0 && !st.result;
  if (running && st.started) {
    const ticksPerSec = (app.speed * bal.ticksPerHour) / bal.realSecondsPerSimHour;
    app.acc += dt * ticksPerSec;
    let n = 0;
    while (app.acc >= 1 && n < 400) {
      sim.tick();
      app.acc -= 1;
      n++;
    }
  } else app.acc = 0;
  if (app.mode === 'game') {
    handleEvents(sim.drainEvents());
    timedNudges();
  } else sim.drainEvents();
  schedulePower();

  // --- camera
  if (app.mode === 'game' && !menus.isOpen()) {
    const sp = rig.dist * 0.9 * dt;
    let px = 0;
    let pz = 0;
    if (app.keys.has('a') || app.keys.has('arrowleft')) px -= sp;
    if (app.keys.has('d') || app.keys.has('arrowright')) px += sp;
    if (app.keys.has('w') || app.keys.has('arrowup')) pz -= sp;
    if (app.keys.has('s') || app.keys.has('arrowdown')) pz += sp;
    if (app.mouse.in && !rpan && document.hasFocus()) {
      const m = 6;
      if (app.mouse.x <= m) px -= sp;
      if (app.mouse.x >= window.innerWidth - m) px += sp;
      if (app.mouse.y <= m) pz -= sp;
      if (app.mouse.y >= window.innerHeight - m) pz += sp;
    }
    if (px || pz) rig.pan(px, pz);
  }
  rig.smooth = !cfg.reduceMotion || app.mode !== 'game' ? true : true;
  rig.update(dt, time);
  hud.setCompass(rig.northDeg());

  // --- lighting
  const tod = app.mode === 'game' ? st.clock % 1440 : app.mode === 'ending' ? 22 * 60 : 19.6 * 60;
  const { dayW } = G.setTimeOfDay(tod, app.mode === 'ending' ? 'night' : null);
  const nightK = 1 - dayW * 0.7;

  // --- visuals
  net.sync(st);
  net.update(st, { overlay: app.mode === 'game' ? app.overlay : 'flow', time, dt, reduceMotion: cfg.reduceMotion, cb: cfg.cbPatterns, bal });
  world.update(dt, time, nightK, cfg.reduceMotion);
  people.update(st, dt, time, nightK, cfg.reduceMotion, siteOf);
  const g = st.gen;
  const genOn = g.status === 'running' || g.status === 'starting';
  smoke.rate = genOn ? 3 + (st.flow.genKW / 100) * 9 : 0;
  smoke.on = genOn;
  world.generator.fan.rotation.y += dt * (genOn ? 6 + st.flow.genKW / 6 : 0);
  world.generator.beaconMat.color.setRGB(...(g.status === 'running' ? (g.servicing ? [2.4, 1.4, 0.2] : [0.3, 2.4, 0.8]) : g.status === 'starting' ? [2.4, 1.4, 0.2] : [2.4, 0.25, 0.2]));
  fx.update(dt, { time });
  const sp = selPos(app.mode === 'game' ? app.selected : null);
  fx.select(sp ? sp.x : null, sp?.z, sp?.r);

  // --- audio
  audio.setHum(genOn ? 0.3 + (st.flow.genKW / 100) * 0.7 : 0);
  let maxLoad = 0;
  for (const id in st.nodes) if (st.nodes[id].kind === 'xfmr') maxLoad = Math.max(maxLoad, st.nodes[id].loadPct || 0);
  audio.setBuzz(maxLoad / 100);
  audio.setNight(nightK);
  if (app.mode === 'game') audio.setWarmth(st.flow.powered, st.fault.phase === 'active' || Object.values(st.nodes).some((n) => n.state === 'trip') ? 'tense' : 'normal');
  else if (app.mode === 'menu' || app.mode === 'intro') audio.setWarmth(0);

  // --- UI (throttled)
  if (app.mode === 'game') {
    updateHover();
    if (time - lastUi > 0.12) {
      lastUi = time;
      hud.update(st, { paused: app.paused || app.hold > 0, speed: app.speed, muted: !cfg.sound });
      refreshInspector(false);
      updateTutorial();
    }
    buildLabels();
  }

  composer.render(dt);
}

// ------------------------------------------------------------------ test hooks (?test=1)
if (TEST) {
  window.__gf = {
    get mode() {
      return app.mode;
    },
    sim: () => app.sim,
    state: () => app.sim.state,
    hash: () => app.sim.hash(),
    cmd: (c) => app.sim.cmd(c),
    fps: () => fps,
    app,
    world,
    rig,
    focusAt: (x, z, d) => rig.flyTo(x, z, d),
    worldToScreen(target) {
      let p;
      if (typeof target === 'string') {
        if (target === 'gen') p = { x: map.generator.x, z: map.generator.z };
        else if (target === 'depot') p = map.depot;
        else p = custOf(target) || app.sim.state.nodes[target];
      } else p = target;
      return rig.toScreen(p.x, 0, p.z);
    },
    setSpeed,
    setTool,
    skipHours(hrs) {
      for (let i = 0; i < hrs * 60 && !app.sim.state.result; i++) app.sim.tick();
    },
    startGame: () => startGame(null),
    jumpToEnding,
  };
}

// ------------------------------------------------------------------ go
requestAnimationFrame(frame);
if (params.has('skipintro') || TEST) startMenu();
else startIntro();
