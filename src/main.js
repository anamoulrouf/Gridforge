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
import { h, icon, esc } from './ui/dom.js';
import { createAudio } from './audio/synth.js';
import { createSim, loadSim } from './sim/sim.js';
import { rectDist, dist as d2, lineRating } from './sim/grid.js';
import { S, fmt } from './data/strings.js';
import { STAGES } from './missions/index.js';
import { srcType, ratedKW, lineContributors } from './sim/power.js';
import { windFrac } from './sim/weather.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SET_KEY = 'gridforge.settings.v1';
const CAMPAIGN_KEY = 'gridforge.campaign.v1';
// Stage 1 keeps the original save key so existing saves still load.
const saveKey = (m) => (m.n === 1 ? 'gridforge.save.v1' : `gridforge.save.${m.key}.v1`);
let M = STAGES[0];
let map = M.map;
let bal = M.bal;
let LINES = M.ui.lines;
let TUTORIAL = M.ui.tutorial;
let SAVE_KEY = saveKey(M);

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
  unlockAll: false,
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
let world = createWorld(scene, map);
let net = createNetworkView(scene, map);
const fx = createFx(scene);
let people = createPeople(scene, map);
rig.setMap(map.bounds, M.camera);
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
  xfmrName: (id) => xfmrName(id),
  srcName: (id) => srcName(id),
  onPanel: (k) => select({ kind: k }),
  onFocusObjective: (f) => {
    audio.play('click');
    if (f.sel) focus(f.sel);
    else rig.flyTo(f.x, f.z, Math.min(rig.distGoal, 200));
  },
});
const inspector = createInspector(uiEl, { onAction: (a) => doAction(a) });
const menus = createMenus(uiEl);
hud.setMission(M);
menus.setLearn(M.ui.learn);
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
/** Definition of a generation source (map source, built site, or the Stage 1 generator). */
const srcDef = (id) => (map.sources || []).find((s) => s.id === id) || app.sim?.state.built?.[id] || (id === 'gen' && map.generator ? { id: 'gen', type: 'diesel', ...map.generator } : null);
const srcPort = (id) => srcDef(id)?.port || srcDef(id) || S_().nodes[id];
const siteOf = (id) => (S_().gens?.[id] ? srcPort(id) : S_().nodes[id] || (S_().edges[id] ? app.sim.siteOf(id) : null));
const srcName = (id) => {
  const d = srcDef(id);
  return d?.name || S.srcName?.[d?.type] || 'Generator';
};
/** First dispatchable unit (the "generator" of early stages). */
const mainGen = () => Object.keys(S_().gens).find((id) => srcType(bal, S_().gens[id].type).dispatch) || null;
const tierName = (t) => S.tierName[t] || t;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));

/** Plain-language explanation of an overloaded line: who loads it and fixes that work in this
 *  model (supply follows the shortest route, so a second line beside it would carry nothing). */
const adviceCache = new Map();
function lineAdvice(id) {
  const st = S_();
  const e = st.edges[id];
  if (!e) return null;
  // a tripped line carries nothing: explain it with the flow it had when it overloaded
  if (e.state === 'trip' && adviceCache.has(id)) return adviceCache.get(id);
  const kb = (x) => `<kbd>${x}</kbd>`;
  const rating = e.ratingKW || lineRating(bal, e.tier);
  const tier = tierName(e.tier);
  const list = lineContributors(st, id);
  const name = (c) => esc(custOf(c.id)?.name || 'a customer');
  const top = list.slice(0, 2).map((c) => `<b>${name(c)}</b> (${fmt.kw(c.kw)})`);
  const more = list.length - top.length;
  const who = list.length ? `${top.join(list.length === 2 ? ' and ' : ', ')}${more > 0 ? ` and ${more} other customer${more === 1 ? '' : 's'}` : ''} ${list.length === 1 ? 'is' : 'are'} fed through it.` : '';
  const big = list.find((c) => c.kw > rating);
  const has = (t) => M.tools.includes(t);
  const hvBuilt = Object.values(st.nodes).some((n) => n.kind === 'pole' && n.tier === 'HV');
  const hvSrc = (map.sources || []).find((s) => s.tier === 'HV' && !st.gens[s.id]?.retired);
  const hvFrom = hvBuilt ? 'your 66 kV towers' : hvSrc ? `the <b>${esc(hvSrc.name)}</b>` : 'a 66 kV source';
  const fixes = [];
  if (e.tier === 'MV' && has('sub')) {
    if (big) fixes.push(`<b>${name(big)}</b> alone needs ${fmt.kw(big.kw)}, more than any ${tier} line can carry. Give it a direct supply: remove its service drop (${kb('X')}), then connect it (${kb('C')}) straight to a substation within ${bal.network.mvDropReach ?? 30} m.`);
    fixes.push(`Bring the power closer at 66 kV: press ${kb('L')}, start from ${hvFrom} and run towers up to the load. Press ${kb('B')} on the last tower to build a substation, and feed the load from there.`);
    fixes.push(`Or split the load: run a second ${tier} feeder out of the substation and move some of these customers onto it (${kb('X')} their drop, then ${kb('C')} to the new feeder), so no line carries more than ${fmt.kw(rating)}.`);
  } else if (e.tier === 'LV') {
    fixes.push(`Split the load: mount another transformer (${kb('T')}) on an ${tierName('MV')} pole near these customers, then move some of them to it (${kb('X')} their drop, then ${kb('C')}).`);
    fixes.push(`Bring the ${tierName('MV')} line closer to them before stepping down, so the ${tier} runs are short.`);
  } else {
    fixes.push(`Split the load: build a separate route from another source or substation to some of these customers, and move them onto it (${kb('X')} their drop, then ${kb('C')}).`);
  }
  if (M.ui?.programsPanel) fixes.push('To buy time, lower demand beyond the line (Supply panel → Programs).');
  const A = {
    load: fmt.kw(e.loadKW),
    rating: fmt.kw(rating),
    tier,
    who,
    fixes,
    why: 'Power reaches each customer along one route, the shortest from a source. Everything beyond this line draws through it, so a second line built beside it carries nothing. The fix is a different route, or a higher voltage.',
  };
  if (list.length) adviceCache.set(id, A);
  return A;
}
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
  if (sel && sel.kind === 'gen') cmd({ type: 'inspect', target: sel.id || 'gen' }, true);
  if (sel && ['finance', 'trust', 'mix'].includes(sel.kind)) cmd({ type: 'inspect', target: sel.kind }, true);
  if (sel) audio.play('select');
  refreshInspector(true);
}
function selPos(sel) {
  if (!sel) return null;
  if (sel.kind === 'gen') {
    const d = srcDef(sel.id || 'gen');
    return d ? { x: d.x, z: d.z, r: Math.max(d.w || 14, d.d || 10) * 0.75 } : null;
  }
  if (sel.kind === 'site') {
    const d = (map.sites || []).find((x) => x.id === sel.id);
    return d ? { x: d.x, z: d.z, r: Math.max(d.w, d.d) * 0.6 } : null;
  }
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
  inspector.render(app.mode === 'game' ? app.selected : null, S_(), { bal, mission: M, xfmrName, srcName, srcDef, crewJob: crewJobText, crewBusy, lineAdvice, dropOf: (b) => app.sim.dropOf(b) });
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
  if (r.ok && !quiet && ['startGen', 'order', 'repair', 'maintain', 'reset', 'policy', 'stopGen', 'tariff', 'contract', 'battery', 'dispatchOrder', 'upgrade', 'program', 'switch', 'begin'].includes(c.type)) audio.play('confirm');
  if (r.ok && !quiet && c.type === 'build') audio.play('build');
  refreshInspector(true);
  return r;
}
function doAction(a) {
  if (a.type === 'deselect') return select(null);
  if (a.type === 'openPanel') return select({ kind: a.kind });
  if (a.type === 'confirmRemove') return confirmRemove(a.target);
  const r = cmd(a);
  if (r.ok && a.type === 'transformer') audio.play('build');
  if (r.ok && a.type === 'drop') audio.play('build');
  if (r.ok && a.type === 'dropAll') audio.play('build');
  if (r.ok && a.type === 'remove' && app.selected && (app.selected.id === a.target || app.selected.kind === 'building')) refreshInspector(true);
}
function confirmRemove(id) {
  const st = S_();
  const n0 = st.nodes[id];
  const what = n0 ? (n0.kind === 'xfmr' ? `${n0.ratio === 'HV/MV' ? 'substation' : 'transformer'} ${xfmrName(id)}` : n0.kind === 'gen' ? srcName(id) : n0.tier === 'HV' ? 'this tower and its lines' : 'this pole and its lines') : st.edges[id]?.kind === 'drop' ? 'this service drop' : 'this line';
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
    const n = st.nodes[id];
    if (n.kind === 'gen') continue;
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < bd) {
      bd = d;
      best = { kind: 'node', id };
    }
  }
  if (best) return best;
  for (const id of Object.keys(st.gens)) {
    const g = srcDef(id);
    if (!g) continue;
    const port = g.port || g;
    if (rectDist(p.x, p.z, { x: g.x, z: g.z, w: g.w || 12, d: g.d || 10 }) < 3 || Math.hypot(p.x - port.x, p.z - port.z) < 4) return { kind: 'gen', id };
  }
  for (const s0 of map.sites || []) if (!st.gens[s0.id] && rectDist(p.x, p.z, s0) < 1) return { kind: 'site', id: s0.id };
  if (rectDist(p.x, p.z, map.depot) < 2) return { kind: 'depot', id: 'depot' };
  for (const c of map.customers) if (rectDist(p.x, p.z, c) < 0.8 && st.cust[c.id].active !== false) return { kind: 'building', id: c.id };
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
canvas.addEventListener('pointerenter', (e) => {
  app.mouse.in = true;
  app.mouse.x = e.clientX;
  app.mouse.y = e.clientY;
  app.mouse.moved = false;
});
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
  // Line tool: pressing on a pole/transformer/generator starts a line (drag-to-build stays).
  if (app.tool === 'line' && !app.lineStart && pickNodeId(pk)) {
    app.lineStart = pickNodeId(pk);
    app.dragging = true;
    app.downPt = p;
    audio.play('select');
    return;
  }
  // Everything else is decided on release: a drag pans the map, a click acts.
  lpan = { x: e.clientX, y: e.clientY, moved: false, g: p, p, pk };
  canvas.setPointerCapture(e.pointerId);
});
let lpan = null;
/** Left-click action for the current tool (runs on release if the mouse didn't drag). */
function primaryClick(p, pk) {
  switch (app.tool) {
    case 'select':
      select(pk && pk.kind !== 'node' && pk.kind !== 'edge' ? (pk.kind === 'gen' ? { kind: 'gen' } : pk) : pk);
      break;
    case 'line': {
      if (!app.lineStart) {
        audio.play('error');
        lockTip(`<b>${S.reasons.noStart}</b>`, true);
        return;
      }
      commitLine(p);
      break;
    }
    case 'build':
      if (pk?.kind === 'site') select(pk);
      else {
        audio.play('error');
        lockTip('<b>Click a marked build site.</b>', true);
      }
      break;
    case 'sub':
    case 'xfmr': {
      const id = pickNodeId(pk);
      const r = cmd({ type: app.tool === 'sub' ? 'substation' : 'transformer', at: id || { x: p.x, z: p.z } }, true);
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
}
canvas.addEventListener('pointermove', (e) => {
  app.mouse.x = e.clientX;
  app.mouse.y = e.clientY;
  app.mouse.moved = true;
  for (const pan of [rpan, lpan]) {
    if (!pan) continue;
    const p = rig.groundAt(e.clientX, e.clientY);
    if (Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 5) pan.moved = true;
    if (pan.moved && p && pan.g) {
      canvas.classList.add('panning');
      rig.goal.x += pan.g.x - p.x;
      rig.goal.z += pan.g.z - p.z;
      rig.target.x += pan.g.x - p.x;
      rig.target.z += pan.g.z - p.z;
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
    canvas.classList.remove('panning');
    return;
  }
  canvas.classList.remove('panning');
  if (lpan && e.button === 0) {
    const pan = lpan;
    lpan = null;
    if (!pan.moved && app.mode === 'game' && !menus.isOpen()) primaryClick(pan.p, pan.pk);
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
  const r = cmd({ type: 'line', from: app.lineStart, to, tier: app.shift && start?.kind === 'xfmr' ? 'up' : undefined }, true);
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
  if (app.mode !== 'game') {
    if (e.key === 'Escape' && menus.isOpen()) menus.closeTop();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (menus.isOpen()) return void menus.closeTop();
    if (hud.closeObjCard()) return;
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
  const toolKeys = { v: 'select', l: 'line', t: 'xfmr', b: 'sub', c: 'drop', g: 'build', x: 'remove' };
  if (toolKeys[k] && M.tools.includes(toolKeys[k])) return setTool(toolKeys[k]);
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
  canvas.style.cursor = rpan?.moved || lpan?.moved ? 'grabbing' : app.tool !== 'select' ? 'crosshair' : pk ? 'pointer' : 'grab';
  if (performance.now() < app.tipLock) return;
  const st = S_();
  let tip = null;
  let bad = false;
  if (app.tool === 'line') {
    if (app.lineStart && p) {
      const start = st.nodes[app.lineStart];
      const pl = app.sim.preview({ type: 'line', from: app.lineStart, to: lineTarget(p), tier: app.shift && start?.kind === 'xfmr' ? 'up' : undefined });
      const pts = pl.points && pl.points.length ? pl.points : [st.nodes[app.lineStart].kind === 'gen' ? srcPort(app.lineStart) : start, p];
      net.showGhost(pts, pl.ok, performance.now() / 1000, pl.tier || 'LV');
      const tierLabel = `${tierName(pl.tier || 'LV')} line`;
      if (pl.ok) tip = `<b>${tierLabel}</b> · ${pl.newPoles} ${pl.tier === 'HV' ? 'tower' : 'pole'}${pl.newPoles === 1 ? '' : 's'} · ${pl.meters} m<br><span class="cost">${fmt.cr(pl.cost)}</span> <span style="color:var(--muted)">· click to build</span>`;
      else {
        tip = `<b>${tierLabel}</b><br>${S.reasons[pl.reason] || pl.reason}${pl.cost ? ` <span class="cost">${fmt.cr(pl.cost)}</span>` : ''}`;
        bad = true;
      }
    } else {
      net.showGhost(null);
      const id = pickNodeId(pk);
      const nn = id ? st.nodes[id] : null;
      tip = id ? `Start a line from <b>${nn.kind === 'gen' ? `${srcName(id)} (${tierName(nn.tier || 'MV')})` : nn.kind === 'xfmr' ? `${xfmrName(id)} (${tierName(nn.ratio === 'HV/MV' ? 'MV' : 'LV')} out${nn.ratio === 'HV/MV' ? '' : ''})` : `this ${tierName(nn.tier)} ${nn.tier === 'HV' ? 'tower' : 'pole'}`}</b>` : 'Click a generator, a pole or a transformer';
    }
  } else if (app.tool === 'xfmr' || app.tool === 'sub') {
    const id = pickNodeId(pk);
    const sub = app.tool === 'sub';
    const pl = app.sim.preview({ type: sub ? 'substation' : 'transformer', at: id || (p ? { x: p.x, z: p.z } : null) });
    tip = pl.ok ? (sub ? `<b>Build substation</b> · ${tierName('HV')} → ${tierName('MV')}, ${fmt.kw(bal.substation.ratingKW)}` : `<b>Mount transformer</b> · ${tierName('MV')} → ${tierName('LV')}, ${fmt.kw(bal.transformer.ratingKW)}`) + `<br><span class="cost">${fmt.cr(pl.cost)}</span>` : `<b>${sub ? 'Substation' : 'Transformer'}</b><br>${S.reasons[pl.reason] || pl.reason}`;
    bad = !pl.ok;
  } else if (app.tool === 'build') {
    if (pk?.kind === 'site') {
      const site = map.sites.find((x) => x.id === pk.id);
      const opt = site.options?.[0] || site;
      tip = `<b>${site.name || 'Build site'}</b> · ${(site.options || [opt]).map((o) => `${S.srcName[o.type]} ${fmt.kw(o.kw)}`).join(' / ')}<br><span class="cost">${fmt.cr(opt.cost)}</span> <span style="color:var(--muted)">· click for options</span>`;
    } else tip = 'Click a marked build site';
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
    const nn = pk.kind === 'node' ? st.nodes[pk.id] : null;
    const name = pk.kind === 'gen' ? srcName(pk.id) : pk.kind === 'site' ? map.sites.find((x) => x.id === pk.id)?.name || 'Build site' : pk.kind === 'depot' ? 'Grid Ops depot' : pk.kind === 'building' ? custOf(pk.id).name : nn ? (nn.kind === 'xfmr' ? `${nn.ratio === 'HV/MV' ? 'Substation' : 'Transformer'} ${xfmrName(pk.id)}` : `${tierName(nn.tier)} ${nn.tier === 'HV' ? 'tower' : 'pole'}`) : st.edges[pk.id]?.kind === 'drop' ? 'Service drop' : `${tierName(st.edges[pk.id]?.tier)} line`;
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
const learnQ = [];
let learnOpen = false;
function learnOnce(key, vars = {}) {
  if (app.learnSeen.has(key)) return;
  app.learnSeen.add(key);
  learnQ.push([key, vars]);
  if (!learnOpen) setTimeout(nextLearn, 350);
}
/** Show a learning card now (even if seen before), e.g. from an alert's "How to fix". */
function learnNow(key, vars = {}) {
  learnQ.push([key, vars]);
  if (!learnOpen) setTimeout(nextLearn, 0);
}
function nextLearn() {
  if (learnOpen || !learnQ.length) return;
  if (app.mode !== 'game' || S_().result) {
    learnQ.length = 0;
    return;
  }
  const [key, vars] = learnQ.shift();
  const pausing = cfg.autoPause;
  if (pausing) hold(+1);
  learnOpen = true;
  menus.learn(key, vars, () => {
    learnOpen = false;
    if (pausing) hold(-1);
    setTimeout(nextLearn, 400);
  });
}
function focusAct(id) {
  return { label: 'Focus', fn: () => focus(S_().gens[id] ? { kind: 'gen', id } : S_().edges[id] ? { kind: 'edge', id } : { kind: 'node', id }) };
}
function assetName(id, cap = false) {
  const st = S_();
  if (st.gens[id]) return id === 'gen' && map.generator ? (cap ? 'The generator' : 'the generator') : srcName(id);
  if (st.edges[id]) return `the ${tierName(st.edges[id].tier)} line`;
  if (st.nodes[id]?.kind === 'xfmr') return xfmrName(id);
  return id;
}
/** Small API the missions use for their own event feedback and nudges. */
const uiApi = {
  get state() {
    return S_();
  },
  get bal() {
    return bal;
  },
  get map() {
    return map;
  },
  get app() {
    return app;
  },
  get hud() {
    return hud;
  },
  audio,
  fmt,
  say,
  learnOnce: (k, v) => learnOnce(k, v),
  cmd: (c, q) => cmd(c, q),
  focus: (sel) => focus(sel),
  focusAct,
  select: (sel) => select(sel),
  xfmrName: (id) => xfmrName(id),
  srcName: (id) => srcName(id),
  custOf: (id) => custOf(id),
  burst: (x, y, z, k, n) => fx.burst(x, y, z, k, n),
};
function handleEvents(evs) {
  const st = S_();
  for (const e of evs) {
    if (M.ui.handles?.includes(e.type)) {
      M.ui.onEvent(e, uiApi);
      continue;
    }
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
        const lastStart = Math.max(-999, ...Object.values(st.gens).map((g) => g.startT ?? -999));
        if (shed.length && e.t - lastStart > (bal.generator?.rampH ?? 0.25) * 60 + 1) hud.alert({ id: 'shed', level: 'warn', title: 'Supply short — load shed', text: `${shed.slice(0, 3).join(', ')}${shed.length > 3 ? ` +${shed.length - 3}` : ''} disconnected by your policy.`, ttl: 8000 });
        break;
      }
      case 'genStart':
        audio.play('genStart');
        forecastCheck(true);
        break;
      case 'genRunning':
        say('genRunning', { name: srcName(e.id), kw: fmt.kw(ratedKW(bal, st.gens[e.id] || {})) });
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
        hud.alert({ id: 'ovl-' + e.target, level: 'warn', title: `${xfmrName(e.target)} overloaded — ${fmt.pct(e.pct)}`, text: `Carrying ${fmt.kw(n.loadKW)} on a ${fmt.kw(n.ratingKW)} rating. It trips in ~60 min unless its load drops.`, actions: [focusAct(e.target)] });
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
        if (!st.gen && e.id) {
          audio.play('warn');
          hud.alert({ id: 'fuel', level: 'warn', title: `${srcName(e.id)}: fuel below 30 units`, text: 'Order a delivery now.', actions: [{ label: `Order fuel · ${bal.procurement.fuel.cost} ¢`, primary: true, fn: () => cmd({ type: 'order', item: 'fuel', target: e.id }) && hud.dismiss('fuel') }] });
          break;
        }
        audio.play('warn');
        say('fuelLow', { h: Math.floor(((st.gens[e.id || mainGen()]?.fuel ?? 0) * 20) / Math.max(1, st.flow.genKW)) });
        hud.alert({ id: 'fuel', level: 'warn', title: 'Fuel below 30 units', text: 'A delivery takes 6 hours. Order now to avoid a blackout.', actions: [{ label: 'Order fuel · 250 ¢', primary: true, fn: () => cmd({ type: 'order', item: 'fuel' }) && hud.dismiss('fuel') }, focusAct('gen')] });
        break;
      case 'noFuel':
        if (!st.gen && e.id) {
          audio.play('critical');
          hud.alert({ id: 'fuel', level: 'critical', title: `${srcName(e.id)} out of fuel`, text: 'Order fuel now.', actions: [{ label: `Order fuel · ${bal.procurement.fuel.cost} ¢`, primary: true, fn: () => cmd({ type: 'order', item: 'fuel', target: e.id }) && hud.dismiss('fuel') }] });
          break;
        }
        audio.play('critical');
        say('noFuel', { name: srcName(e.id || mainGen()) });
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
        say('crewDispatched', { name: assetName(e.target), eta: fmt.dur(e.etaMin) });
        break;
      case 'repairStart':
        audio.play('repair');
        say('repairStart', { name: assetName(e.target) });
        break;
      case 'repaired': {
        audio.play('objective');
        hud.dismiss('fault-' + e.target);
        say('repaired', { name: assetName(e.target) });
        if (st.fault.target === e.target) learnOnce('restored', { name: xfmrName(e.target), dur: fmt.dur(st.fault.restoredT - st.fault.tripT) });
        break;
      }
      case 'maintStart':
        say('maintStart', { name: assetName(e.target) });
        break;
      case 'maintained':
        audio.play('confirm');
        say('maintained', { name: assetName(e.target, true) });
        break;
      case 'objective':
        audio.play('objective');
        hud.alert({ id: 'obj-' + e.id, level: 'good', title: 'Objective complete', text: M.objectives.find((o) => o.id === e.id)?.label || e.id, ttl: 5000 });
        break;
      case 'newCustomer': {
        const c = custOf(e.id);
        world.setActive(e.id, true);
        fx.burst(c.x, 0, c.z, 'build', 18);
        audio.play('connect');
        break;
      }
      case 'lineOverload':
        audio.play('warn');
        const A = lineAdvice(e.target);
        const showFix = () => learnNow('congestion', { ...A, fix1: A.fixes[0], fix2: A.fixes[1], fix3: A.fixes[2], fix4: A.fixes[3], mins: e.inMin, focus: () => focus({ kind: 'edge', id: e.target }) });
        hud.alert({ id: 'lovl-' + e.target, level: 'warn', title: `${A.tier} line overloaded: ${A.load} on a ${A.rating} line`, text: `${A.who} It switches off in ~${e.inMin} min unless the load drops.<br><b>Fix:</b> ${A.fixes[0]}`, actions: [{ label: 'How to fix', primary: true, fn: showFix }, { label: 'Focus', fn: () => focus({ kind: 'edge', id: e.target }) }] });
        if (!app.learnSeen.has('congestion')) {
          app.learnSeen.add('congestion');
          showFix();
        }
        break;
      case 'lineTrip': {
        const sp = siteOf(e.target);
        audio.play('trip');
        if (sp) fx.burst(sp.x, 8, sp.z, 'sparks', 40);
        hud.dismiss('lovl-' + e.target);
        hud.alert({ id: 'ltrip-' + e.target, level: 'critical', title: `${tierName(st.edges[e.target]?.tier)} line tripped on overload`, text: `Customers beyond it are dark. You can Reset it after ${bal.lineProtection?.coolMin ?? 30} min, but it will trip again until the load on it is lower.`, actions: [{ label: 'How to fix', primary: true, fn: () => { const A = lineAdvice(e.target); learnNow('congestion', { ...A, fix1: A.fixes[0], fix2: A.fixes[1], fix3: A.fixes[2], fix4: A.fixes[3], mins: bal.lineProtection?.delayMin ?? 30, focus: () => focus({ kind: 'edge', id: e.target }) }); } }, { label: 'Focus', fn: () => focus({ kind: 'edge', id: e.target }) }] });
        break;
      }
      case 'statement': {
        audio.play('bill');
        const net0 = e.net;
        hud.alert({ id: 'bill', level: net0 >= 0 ? 'good' : 'warn', title: `Day ${e.day} statement: ${net0 >= 0 ? '+' : '−'}${fmt.cr(Math.abs(net0))}`, text: `Revenue ${fmt.cr(e.revenue)} · energy & fuel −${fmt.cr(e.energyCost + e.fuelBought)} · overhead −${fmt.cr(e.overhead)}${e.penalties ? ` · penalties −${fmt.cr(e.penalties)}` : ''}${e.programs ? ` · programs −${fmt.cr(e.programs)}` : ''}`, ttl: 9000, actions: [{ label: 'Details', fn: () => select({ kind: 'finance' }) }] });
        learnOnce('statement', { rev: fmt.cr(e.revenue), net: fmt.cr(net0) });
        break;
      }
      case 'retired':
        audio.play('warn');
        hud.alert({ id: 'ret-' + e.id, level: 'info', title: `${srcName(e.id)} retired`, text: 'It no longer produces power.', ttl: 9000 });
        break;
      case 'failWarn': {
        const crit = e.id ? custOf(e.id)?.name : 'The clinic';
        const t = { fuel: ['Fuel out — mission at risk', 'Order fuel now. Without a delivery on its way the mission fails in'], clinic: [`${crit} dark — mission at risk`, `Restore power to ${crit}. The mission fails in`], bankrupt: ['Credits nearly gone', 'Without income the mission fails in'], deadline: ['Final day', 'The mission must be complete by midnight — time left:'], trust: [`Public trust collapsing (${S.clsName?.[e.cls] || e.cls})`, 'The regulator will revoke your licence in'], ...(M.ui.failWarn || {}) }[e.cause] || ['Mission at risk', 'Time left:'];
        audio.play('critical');
        hud.alert({ id: 'fail-' + e.cause, level: 'critical', title: t[0], text: `${t[1]} ${fmt.dur(e.minutesLeft)}.`, actions: e.cause === 'fuel' ? [{ label: `Order fuel · ${bal.procurement.fuel.cost} ¢`, primary: true, fn: () => cmd({ type: 'order', item: 'fuel' }) }] : e.cause === 'clinic' ? [{ label: 'Focus', fn: () => focus({ kind: 'building', id: e.id || 'clinic' }) }] : [] });
        if (e.cause === 'clinic') say('clinicWarn', { h: Math.round((st.cust[e.id || 'clinic']?.outMin || 0) / 60) });
        break;
      }
      case 'stableReset':
        hud.alert({ id: 'stable', level: 'warn', title: 'Stability clock restarted', text: 'Every customer must stay fully powered for 24 h in a row.', ttl: 6000 });
        break;
      case 'victory':
      case 'fail':
        showResult();
        break;
      default:
        break;
    }
    M.ui.onEvent?.(e, uiApi);
  }
}
function forecastCheck(force) {
  const st = S_();
  for (const id in st.nodes) {
    const n = st.nodes[id];
    if (n.kind !== 'xfmr' || n.state !== 'ok') continue;
    if (n.forecastPeakKW > (n.ratingKW || bal.transformer.ratingKW) + 0.01) {
      const key = 'fc' + id + Math.floor(st.clock / 1440);
      if (app.nudges[key] && !force) continue;
      app.nudges[key] = true;
      say('forecast', { name: xfmrName(id), kw: fmt.kw(n.forecastPeakKW), rating: fmt.kw(n.ratingKW || bal.transformer.ratingKW) });
      hud.alert({ id: 'fc-' + id, level: 'warn', title: `${xfmrName(id)} forecast: ${fmt.kw(n.forecastPeakKW)} at the evening peak`, text: `Its rating is ${fmt.kw(n.ratingKW || bal.transformer.ratingKW)}. ${bal.upgrades?.xfmr100 && !n.upgraded && n.ratio !== 'HV/MV' ? 'Upgrade it or split' : 'Split'} its customers across another transformer before ${n.forecastPeakHour}:00.`, actions: [focusAct(id)], ttl: 15000 });
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
  if (st.gen && st.gen.condition < 85 && !app.nudges.service && !st.objectives.service) {
    app.nudges.service = true;
    say('serviceNudge', { name: srcName(mainGen()) });
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
    if (!st.cust[c.id]) return;
    const s = st.cust[c.id].status;
    const on = s === 'on' || s === 'partial';
    const was = app.shown[c.id];
    if (was === s) continue;
    const wasOn = was === 'on' || was === 'partial';
    if (on && !wasOn) {
      const src = Object.keys(st.gens).map(srcPort).filter(Boolean);
      const dmin = src.length ? Math.min(...src.map((q) => Math.hypot(c.x - q.x, c.z - q.z))) : 0;
      const delay = cfg.reduceMotion ? 0 : Math.min(2.8, (dmin * 1.25) / 90) + 0.25;
      if (!app.pending.has(c.id)) app.pending.set(c.id, now + delay);
    } else {
      app.pending.delete(c.id);
      world.setPower(c.id, s);
      app.shown[c.id] = s;
    }
  }
  for (const [id, at] of app.pending) {
    if (!st.cust[id]) {
      app.pending.delete(id);
      continue;
    }
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
  const zc = map.townCenterZ ?? 0;
  const frac = (pred) => {
    const cs = map.customers.filter(pred);
    return cs.length ? cs.filter((c) => ['on', 'partial'].includes(app.shown[c.id])).length / cs.length : 0;
  };
  const dark = app.mode !== 'game' || app.nightK > 0.55;
  world.setGroupLevel('street-n', dark && frac((c) => c.z < zc) >= 0.5 ? 1 : 0);
  world.setGroupLevel('street-s', dark && frac((c) => c.z > zc) >= 0.5 ? 1 : 0);
}

// ------------------------------------------------------------------ tutorial
function tutDone(step) {
  const st = S_();
  if (step.done) return step.done(st, app);
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
  document.getElementById('hint').style.visibility = app.tut >= 0 && app.mode === 'game' ? 'hidden' : '';
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
  const tp = tutPoint(t);
  if (tp) fx.marker(tp.x, tp.z, tp.r);
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
/** World point for a tutorial target: generator, a customer, a site, a node or a marker. */
function tutPoint(t) {
  if (!t?.world) return null;
  if (t.world === 'gen') {
    const d = srcDef(t.id || 'gen');
    return d && { x: d.x, z: d.z, r: 13, y: 12, label: t.label || 'Generator' };
  }
  if (t.world === 'clinic' || t.world === 'cust') {
    const c = custOf(t.id || 'clinic');
    return c && { x: c.x, z: c.z, r: Math.max(c.w, c.d) * 0.8, y: 14, label: t.label || c.name };
  }
  if (t.world === 'site') {
    const d = map.sites.find((x) => x.id === t.id);
    return d && { x: d.x, z: d.z, r: Math.max(d.w, d.d) * 0.6, y: 10, label: t.label || d.name };
  }
  if (t.world === 'node') {
    const n = typeof t.find === 'function' ? t.find(S_()) : S_().nodes[t.id];
    return n && { x: n.x, z: n.z, r: 7, y: 14, label: t.label || 'Here' };
  }
  return { x: t.x, z: t.z, r: t.r || 6, y: 8, label: t.label || 'Run the line to here' };
}
function tutLabel() {
  if (app.tut < 0) return null;
  const p = tutPoint(TUTORIAL[app.tut]?.target);
  if (!p) return null;
  return { key: 'tut', x: p.x, y: p.y, z: p.z, html: `${icon('target')}${p.label}`, cls: 'tut' };
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
      html = `${icon(n.loadPct >= 85 ? 'warn' : 'gauge')}${name} · ${fmt.kw(n.loadKW)}/${fmt.kw(n.ratingKW)}`;
    }
    if (notable || band !== 'planning') L.push({ key: 'x' + id, x: n.x, y: n.ratio === 'HV/MV' ? 14 : n.onPole ? 12.5 : 4.5, z: n.z, html, cls: cls + (notable ? '' : ' mini') });
  }
  for (const c of map.customers) {
    const cs = st.cust[c.id];
    const b = world.buildings[c.id];
    if (cs.active === false) continue;
    const showAll = app.overlay === 'outages';
    if (cs.status === 'on' && !showAll) continue;
    if (cs.status === 'unconnected' && !showAll && !(c.type === 'clinic' && st.started) && !(cs.appearedT != null)) continue;
    if (!showAll && band === 'planning' && cs.status !== 'xfmrDown' && c.type !== 'clinic') continue;
    const ok = cs.status === 'on';
    const short = { unconnected: 'not connected', nopath: 'no route', xfmrDown: 'transformer out', lineDown: 'line down', noFuel: 'no fuel', genOff: 'no supply', shed: 'shed', partial: 'low supply', on: 'powered' }[cs.status];
    L.push({ key: 'b' + c.id, x: c.x, y: b.height + 3.5, z: c.z, html: `${icon(ok ? 'bolt' : 'dark')}${c.type === 'home' ? '' : c.name.split(' ').slice(-1)[0] + ' · '}${short}`, cls: (ok ? 'good' : cs.status === 'unconnected' ? '' : 'bad') + ' mini' });
  }
  const j = st.crew.job;
  if (j) {
    const tp = people.truck.position;
    L.push({ key: 'crew', x: tp.x, y: 5, z: tp.z, html: `${icon('truck')}Crew · ${j.phase === 'travel' ? 'ETA ' + fmt.dur(j.remain) : j.phase === 'work' ? fmt.dur(j.remain) + ' left' : j.phase === 'standby' ? 'standing by' : 'returning'}`, cls: 'crew' });
  }
  for (const gid of Object.keys(st.gens)) {
    const g = st.gens[gid];
    const T = srcType(bal, g.type);
    const d = srcDef(gid);
    if (!d || !T.dispatch || g.status === 'running' || band === 'planning' || g.retired) continue;
    if (app.tut >= 0 && TUTORIAL[app.tut]?.target?.world === 'gen') continue;
    L.push({ key: 'gen' + gid, x: d.x, y: 9, z: d.z, html: `${icon('gen')}${gid === 'gen' && map.generator ? 'Generator' : srcName(gid)} · ${S.genState[g.status]}`, cls: g.status === 'nofuel' ? 'bad' : g.status === 'starting' ? 'warn' : '' });
  }
  if (app.tool === 'build' || band !== 'planning')
    for (const s0 of map.sites || []) {
      if (st.gens[s0.id] || (s0.unlockAt != null && st.clock < s0.unlockAt)) continue;
      if (app.tool !== 'build' && band === 'planning') continue;
      L.push({ key: 'site' + s0.id, x: s0.x, y: 3, z: s0.z, html: `${icon('plus')}${s0.name || 'Build site'}`, cls: app.tool === 'build' ? 'tut mini' : 'mini' });
    }
  M.ui.labels?.(L, uiApi, band);
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
  app.sim = createSim({ seed: 1337, mission: M });
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
  if (!app.sim || app.sim.state.started || app.sim.mission !== M) {
    app.sim = createSim({ seed: 1337, mission: M });
    resetVisuals();
  }
  const t0 = performance.now() / 1000;
  rig.cinematic = (t) => ({ target: new THREE.Vector3(10, 0, 0), yaw: 0.8 + (t - t0) * 0.025, pitch: 0.62, dist: 250 });
  const last = lastSave();
  const m = menus.mainMenu({
    hasSave: !!last,
    continueLabel: last ? `Continue · ${last.m.stageName}` : null,
    onContinue: () => (audio.play('confirm'), startGame(last.m, last.save)),
    onNew: () => (audio.play('confirm'), startGame(STAGES[0], null)),
    onCampaign: () => (audio.play('click'), openCampaign()),
    onHow: () => menus.howTo(),
    onSettings: () => openSettings(true),
    onCredits: () => menus.credits(),
  });
  app.menuEl = m.el;
  fade(false);
}

// ------------------------------------------------------------------ campaign
function campaign() {
  const c = store.get(CAMPAIGN_KEY) || {};
  return { unlocked: c.unlocked || 1, best: c.best || {}, last: c.last || null };
}
function unlockedCount() {
  return cfg.unlockAll ? STAGES.length : Math.min(STAGES.length, campaign().unlocked);
}
function lastSave() {
  const c = campaign();
  const order = c.last ? [STAGES.find((x) => x.key === c.last), ...STAGES] : STAGES;
  for (const m of order) {
    if (!m) continue;
    const save = store.get(saveKey(m));
    if (save && save.mission === m.id) return { m, save };
  }
  return null;
}
function recordVictory(m, score) {
  const c = campaign();
  c.best[m.key] = Math.max(c.best[m.key] || 0, score);
  c.unlocked = Math.max(c.unlocked, Math.min(STAGES.length, m.n + 1));
  store.set(CAMPAIGN_KEY, c);
}
function openCampaign() {
  const c = campaign();
  menus.campaign({
    stages: STAGES.map((m, i) => ({ n: m.n, key: m.key, name: m.name, stageName: m.stageName, region: m.region, blurb: m.blurb, learns: m.learns, best: c.best[m.key] || null, unlocked: i < unlockedCount(), hasSave: !!store.get(saveKey(m)) })),
    onPick: (key, resume) => {
      const m = STAGES.find((x) => x.key === key);
      audio.play('confirm');
      startGame(m, resume ? store.get(saveKey(m)) : null);
    },
  });
}

/** Swap the 3D world to another stage's map. */
function buildStage(m) {
  if (m === M && world) return;
  for (const e of stageEmitters) fx.removeEmitter(e);
  stageEmitters.length = 0;
  fx.clearParticles();
  world.dispose();
  net.dispose();
  people.dispose();
  M = m;
  map = m.map;
  bal = m.bal;
  LINES = m.ui.lines;
  TUTORIAL = m.ui.tutorial;
  SAVE_KEY = saveKey(m);
  world = createWorld(scene, map);
  net = createNetworkView(scene, map);
  people = createPeople(scene, map);
  builtViews.clear();
  rig.setMap(map.bounds, m.camera);
  setupEmitters();
  hud.setMission(m);
  menus.setLearn(m.ui.learn);
  if (window.__gf) window.__gf.world = world;
}

function openSettings(fromMenu) {
  hold(+1);
  menus.settings(
    cfg,
    () => applySettings(),
    () => hold(-1),
    { onJumpEnding: () => (menus.closeAll(), (app.hold = 0), jumpToEnding()), stageName: M.stageName },
  );
  void fromMenu;
}

function resetVisuals() {
  app.shown = {};
  app.pending.clear();
  for (const id of [...builtViews.keys()]) {
    world.removeSource(id);
    builtViews.delete(id);
  }
  for (const c of map.customers) {
    world.setPower(c.id, 'off');
    world.setActive(c.id, c.appearAt == null || app.sim?.state.cust[c.id]?.active !== false);
  }
  world.setGroupLevel('street-n', 0);
  world.setGroupLevel('street-s', 0);
  for (const id of [...map.customers.map((c) => c.id), 'street-n', 'street-s']) if (world.groups[id]) world.groups[id].level = 0;
}

/** A fresh run seed: events and weather differ each playthrough (tests pin it with ?seed=). */
const newSeed = () => (TEST ? Number(params.get('seed')) || 1337 : crypto.getRandomValues(new Uint32Array(1))[0] || 1);

function startGame(m, save, opts = {}) {
  clearScreens();
  fade(true);
  setTimeout(() => {
    buildStage(m || M);
    const c = campaign();
    c.last = M.key;
    store.set(CAMPAIGN_KEY, c);
    let sim = null;
    if (save) {
      try {
        sim = loadSim(save, { mission: M });
      } catch (e) {
        console.warn('Save incompatible, starting new game', e);
        store.del(SAVE_KEY);
      }
    }
    app.sim = sim || createSim({ seed: opts.seed ?? newSeed(), mission: M });
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
    learnQ.length = 0;
    learnOpen = false;
    tutKey = '';
    resetVisuals();
    hud.clearAlerts();
    hud.show(true);
    hud.setLegend('flow');
    setTool('select');
    rig.cinematic = null;
    const cam = M.camera || {};
    rig.target.set(cam.x ?? -22, 0, cam.z ?? 8);
    rig.goal.set(cam.x ?? -22, 0, cam.z ?? 8);
    rig.yaw = rig.yawGoal = Math.PI / 4;
    rig.dist = rig.distGoal = cam.dist ?? 310;
    rig.pitch = rig.pitchGoal = 0.92;
    app.sim.drainEvents();
    syncBuilt();
    schedulePower();
    if (!sim) {
      if (M.n > 1) menus.briefing(M, () => say('intro'));
      else say('intro');
    }
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
      startGame(M, null, { seed: app.sim.state.seed }); // same run, same events
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
  learnQ.length = 0;
  setTimeout(() => {
    menus.closeAll();
    learnOpen = false;
    app.hold = 1;
    if (r.outcome === 'victory') {
      audio.play('victory');
      recordVictory(M, r.score.total);
      menus.victory(r, {
        mission: M,
        onContinue: () => startEnding(app.sim),
        onReplay: () => startGame(M, null),
        onMenu: () => startMenu(),
      });
    } else {
      audio.play('fail');
      menus.fail(r, { mission: M, onRetry: () => startGame(M, null, { seed: app.sim.state.seed }), onMenu: () => startMenu() });
    }
  }, 1400);
}

function jumpToEnding(m = M) {
  // Review-build shortcut: play the mission's reference strategy to victory, then show the ending.
  buildStage(m);
  const sim = createSim({ seed: 1337, mission: M });
  M.autoplay(sim);
  if (sim.state.result?.outcome === 'victory') recordVictory(M, sim.state.result.score.total);
  app.sim = sim;
  resetVisuals();
  syncBuilt();
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
  for (const c of map.customers) {
    world.setActive(c.id, sim.state.cust[c.id].active !== false);
    world.setPower(c.id, sim.state.cust[c.id].active === false ? 'off' : 'on');
  }
  world.setGroupLevel('street-n', 1);
  world.setGroupLevel('street-s', 1);
  const t0 = performance.now() / 1000;
  rig.cinematic = (t) => {
    // close orbit over the lit town, then pull back to reveal the whole diorama and the
    // neighbouring islands (wind farm, power station, next town) that later stages unlock.
    const d = t - t0;
    const k = d / 60;
    const out = Math.min(1, Math.max(0, (d - 18) / 16));
    const e = out * out * (3 - 2 * out);
    const E = M.ending || {};
    const cx = E.x ?? 20;
    const cz = E.z ?? 4;
    return {
      target: new THREE.Vector3(cx - k * 10 + e * (E.outDX ?? 10), 0, cz + e * (E.outDZ ?? -40)),
      yaw: 2.3 + d * (cfg.reduceMotion ? 0.006 : 0.03),
      pitch: 0.62 - Math.min(0.2, k * 0.4) + e * 0.32,
      dist: (E.dist ?? 260) - Math.min(90, d * 3) + e * (E.outDist ?? 560),
    };
  };
  fireflies.on = true;
  const score = sim.state.result?.score || { ending: 'reliable', total: 0 };
  const MET = sim.state.result?.metrics;
  const ENDING = M.ui.ending;
  const lines = [...ENDING.common, ENDING[score.ending]];
  if (MET?.decisions) for (const k of Object.keys(ENDING.decisions || {})) if (MET.decisions[k] && lines.length < 5) lines.push(ENDING.decisions[k]);
  const isLast = M.n === STAGES.length;
  if (isLast) {
    // Campaign finale: look back across every region the player electrified.
    const best = campaign().best;
    lines.push(`Your grid, region by region — ${STAGES.map((m) => `${m.region} ${best[m.key] ? best[m.key] : '—'}`).join(' · ')}.`);
  }
  lines.push(ENDING.next);
  audio.setWarmth(13);
  app.ending = menus.ending({
    kicker: `${M.stageName.split('·')[0].trim()} complete · ${S.endings[score.ending]}`,
    title: M.ui.endTitle,
    lines,
    nextLabel: !isLast && STAGES[M.n] ? `Next: ${STAGES[M.n].stageName}` : null,
    onNext: !isLast && STAGES[M.n] ? () => {
      fireflies.on = false;
      startGame(STAGES[M.n], null);
    } : null,
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
// smoke from every stack (generators, plants, mills) and steam from cooling towers
const stageEmitters = [];
const builtViews = new Map(); // site-built sources currently shown
const puff = (q, big) => ({ puff: true, x: q.x + (Math.random() - 0.5) * (big ? 1.2 : 0.6), y: q.y, z: q.z + (Math.random() - 0.5) * (big ? 1.2 : 0.6), vx: 0.7 + Math.random() * 0.6, vy: 2.4 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.6, g: 0, life: big ? 6 : 4.2, s0: big ? 3 : 1.8, s1: big ? 11 : 6.5, c: new THREE.Color(0.86, 0.84, 0.8), opacity: 0.9, fade: 0 });
function addStackEmitter(id, meta) {
  if (!meta.stacks?.length) return;
  const big = meta.type === 'coal' || meta.customer;
  const e = fx.addEmitter({ rate: 0, make: () => puff(meta.stacks[Math.floor(Math.random() * meta.stacks.length)], big) });
  e.src = id;
  e.meta = meta;
  stageEmitters.push(e);
}
function addSteam(ct, src) {
  const e = fx.addEmitter({
    rate: 6,
    make: () => ({ puff: true, x: ct.x + (Math.random() - 0.5) * ct.r, y: ct.top, z: ct.z + (Math.random() - 0.5) * ct.r, vx: 1.4, vy: 3.5 + Math.random() * 2, vz: 0.3, g: 0, life: 7, s0: ct.r, s1: ct.r * 2.8, c: new THREE.Color(0.92, 0.91, 0.88), opacity: 0.92, fade: 0 }),
  });
  e.steamSrc = src;
  stageEmitters.push(e);
}
function setupEmitters() {
  for (const id in world.sources) {
    addStackEmitter(id, world.sources[id]);
    for (const ct of world.sources[id].coolingTowers || []) addSteam(ct, id);
  }
  for (const ct of world.coolingTowers) if (!Object.values(world.sources).some((m) => m.coolingTowers?.includes(ct))) addSteam(ct, null);
}
/** Show site-built sources (solar farms, turbines, batteries…) as the player builds them. */
function syncBuilt() {
  const st = S_();
  for (const id in st.built) {
    if (builtViews.has(id) || world.sources[id]) continue;
    const meta = world.buildSource(st.built[id]);
    builtViews.set(id, meta);
    addStackEmitter(id, meta);
    if (app.mode === 'game') fx.burst(st.built[id].x, 0, st.built[id].z, 'build', 30);
  }
  for (const id of [...builtViews.keys()]) {
    if (!st.built[id]) {
      for (const e of stageEmitters.filter((x) => x.src === id)) fx.removeEmitter(e);
      world.removeSource(id);
      builtViews.delete(id);
    }
  }
}
setupEmitters();
const fireflies = fx.addEmitter({
  rate: 18,
  make: () => {
    const c = map.customers[Math.floor(Math.random() * map.customers.length)];
    const warm = Math.random() < 0.5;
    return { x: c.x + (Math.random() - 0.5) * 30, y: 1 + Math.random() * 3, z: c.z + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.6, g: 0, life: 4, s0: 1.1, s1: 0.3, c: warm ? new THREE.Color(2.2, 1.4, 0.5) : new THREE.Color(2.0, 1.8, 0.7), fade: 0 };
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
    if (app.mouse.in && app.mouse.moved && !rpan && document.hasFocus()) {
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
  app.nightK = nightK;

  // --- visuals
  net.sync(st);
  net.update(st, { overlay: app.mode === 'game' ? app.overlay : 'flow', time, dt, reduceMotion: cfg.reduceMotion, cb: cfg.cbPatterns, bal, night: app.nightK });
  world.update(dt, time, nightK, cfg.reduceMotion);
  people.update(st, dt, time, nightK, cfg.reduceMotion, siteOf);
  if (Object.keys(st.built || {}).length !== builtViews.size) syncBuilt();
  let fossilOut = 0;
  let fossilRated = 0;
  for (const e of stageEmitters) {
    if (e.steamSrc !== undefined) {
      const sg = e.steamSrc ? st.gens[e.steamSrc] : null;
      e.on = !e.steamSrc || (sg && sg.outKW > 0);
      continue;
    }
    const sg = st.gens[e.src];
    if (sg) {
      const on = sg.status === 'running' || sg.status === 'starting';
      const r = sg.outKW / Math.max(1, sg.kw ?? srcType(bal, sg.type).maxKW ?? 100);
      e.on = on && !sg.retired;
      e.rate = e.on ? 3 + r * 9 : 0;
    } else {
      const cs = st.cust[e.src];
      e.on = !!cs && cs.status === 'on';
      e.rate = e.on ? 4 : 0;
    }
  }
  for (const id in st.gens) {
    const g = st.gens[id];
    const T = srcType(bal, g.type);
    const meta = world.sources[id];
    const on = g.status === 'running' || g.status === 'starting';
    if (T.dispatch && !T.reservoir) {
      fossilOut += g.outKW || 0;
      fossilRated += g.kw ?? T.maxKW ?? 100;
    }
    if (!meta) continue;
    if (meta.fan) meta.fan.rotation.y += dt * (on ? 6 + (g.outKW || 0) / 6 : 0);
    if (meta.beaconMat) meta.beaconMat.color.setRGB(...(g.status === 'running' ? (g.servicing ? [2.4, 1.4, 0.2] : [0.3, 2.4, 0.8]) : g.status === 'starting' ? [2.4, 1.4, 0.2] : [2.4, 0.25, 0.2]));
    for (const t of meta.turbines || []) t.speed = g.damaged ? 0 : 0.3 + 2.2 * windFrac(st.weather || { wind: 6 });
    if (meta.ledMat) meta.ledMat.emissiveIntensity = 0.3 + (g.soc / Math.max(1, g.kwh)) * 1.2;
  }
  const genOn = fossilOut > 0;
  const g = { status: genOn ? 'running' : 'off' };
  void g;
  fx.update(dt, { time });
  const sp = selPos(app.mode === 'game' ? app.selected : null);
  fx.select(sp ? sp.x : null, sp?.z, sp?.r);

  // --- audio
  audio.setHum(genOn ? 0.3 + Math.min(1, fossilOut / Math.max(1, fossilRated)) * 0.7 : 0);
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
      hud.update(st, { paused: app.paused || app.hold > 0, speed: app.speed, muted: !cfg.sound, bal });
      refreshInspector(false);
      updateTutorial();
    }
    buildLabels();
  }

  G.renderer.info.reset();
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
    scene: () => scene,
    G: () => G,
    renderStats: () => ({ ...G.renderer.info.render, programs: G.renderer.info.programs?.length, geometries: G.renderer.info.memory.geometries }),
    app,
    world,
    rig,
    stages: STAGES,
    get mission() {
      return M;
    },
    startStage: (n, save = null) => startGame(STAGES[n - 1], save),
    refBuild: () => M.refBuild?.(app.sim),
    panel: (k) => select({ kind: k }),
    jumpToEnding: (n) => jumpToEnding(n ? STAGES[n - 1] : M),
    focusAt: (x, z, d) => rig.flyTo(x, z, d),
    worldToScreen(target) {
      let p;
      if (typeof target === 'string') {
        if (app.sim.state.gens[target]) p = srcDef(target);
        else if (target === 'depot') p = map.depot;
        else p = custOf(target) || app.sim.state.nodes[target] || (map.sites || []).find((x) => x.id === target);
      } else p = target;
      return rig.toScreen(p.x, 0, p.z);
    },
    setSpeed,
    setTool,
    skipHours(hrs) {
      for (let i = 0; i < hrs * 60 && !app.sim.state.result; i++) app.sim.tick();
    },
    startGame: () => startGame(M, null),
  };
}

// ------------------------------------------------------------------ go
hud.show(false);
requestAnimationFrame(frame);
if (params.has('skipintro') || TEST) startMenu();
else startIntro();
