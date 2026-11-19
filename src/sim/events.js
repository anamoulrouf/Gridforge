// Run events: disasters, equipment failures, surprises (new neighbours, markets, localities),
// festivals, community requests and protests, plus reputation and a local newspaper.
// Pure and deterministic: everything depends on the run seed, the mission and the command log.
// Each mission lists an `events` pool; a seeded draw picks a few of them per run, so every
// playthrough is different while saves and replays stay identical.
import { rng, fnv } from './rng.js';
import { typeDef } from './power.js';

const H = 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ setup
export function initEvents(state, mission, bal) {
  const E = mission.events || {};
  const ev = {
    rep: E.repStart ?? 60,
    repLast: 0,
    news: [],
    deck: [],
    choices: {},
    protests: {},
    boostUntil: 0,
    stats: { hits: 0, avoided: 0, restoredFast: 0, restoredSlow: 0, festivalsLit: 0, festivalsDark: 0, requestsYes: 0, requestsNo: 0, protests: 0 },
  };
  state.ev = ev;
  // story beats: fixed moments in each stage's script (lines from a named character, or a choice)
  ev.beats = (mission.story || []).map((b, i) => ({ id: 'story' + (i + 1), i, at: (b.day - 1) * 1440 + b.hour * 60, done: (b.day - 1) * 1440 + b.hour * 60 <= state.clock }));
  const pool = (E.pool || []).filter(Boolean);
  if (!pool.length && !(E.fixed || []).length) return;
  const r = rng((state.seed ^ parseInt(fnv(mission.id), 16)) >>> 0);
  const [lo, hi] = E.count || [2, 3];
  const n = lo + Math.floor(r() * (hi - lo + 1));
  const startH = Math.ceil(state.clock / H) + 1;
  const gapH = E.minGapH ?? 8;
  const avoid = E.avoidH || [];
  const left = pool.map((p) => ({ ...p }));
  const placed = [];
  for (let k = 0; k < n && left.length; k++) {
    // weighted draw without replacement
    const tot = left.reduce((s, p) => s + (p.weight ?? 1), 0);
    let x = r() * tot;
    let i = 0;
    while (i < left.length - 1 && (x -= left[i].weight ?? 1) > 0) i++;
    const p = left.splice(i, 1)[0];
    // entries sharing an `excl` tag are alternatives (e.g. an early or a late tsunami)
    if (p.excl) for (let j = left.length - 1; j >= 0; j--) if (left[j].excl === p.excl) left.splice(j, 1);
    for (let tries = 0; tries < 40; tries++) {
      const [a, b] = p.windowH;
      let hitH = Math.max(startH + (p.warnH ?? 0), a) + Math.floor(r() * Math.max(1, b - Math.max(startH + (p.warnH ?? 0), a)));
      if (p.atHour != null) hitH = Math.floor(hitH / 24) * 24 + p.atHour; // e.g. festivals start at 18:00
      if (hitH < startH + (p.warnH ?? 0) || hitH > b + 24) continue;
      const clash = placed.some((q) => Math.abs(q.hitH - hitH) < gapH) || avoid.some(([x0, x1]) => hitH >= x0 - 2 && hitH <= x1 + 2);
      if (clash) continue;
      placed.push({ ...p, hitH });
      break;
    }
  }
  // scripted entries every run gets (e.g. Highvale's ice storm on the pass)
  for (const f of E.fixed || []) placed.push({ ...f, hitH: f.hitH, fixed: true });
  placed.sort((a, b) => a.hitH - b.hitH);
  ev.deck = placed.map((p, i) => ({
    id: 'ev' + (i + 1),
    key: p.key,
    kind: p.kind,
    p: p.params || {},
    warnAt: (p.hitH - (p.warnH ?? 0)) * H,
    hitAt: p.hitH * H,
    endAt: (p.hitH + (p.durH ?? 0)) * H,
    phase: 'pending',
    damaged: [],
    ...(p.fixed ? { fixed: true } : {}),
  }));
}

// ------------------------------------------------------------------ helpers
const isHome = (bal, c) => c.type === 'home' || (bal.types && ['home', 'lowincome'].includes(typeDef(bal, c.type).cls));
const near = (a, x, z, r) => Math.hypot(a.x - x, a.z - z) <= r;
const mid = (state, e) => {
  const a = state.nodes[e.a];
  const b = state.nodes[e.b];
  return a && b ? { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } : a || b;
};
export const inZone = (pt, z) => (z.poly ? pointInPoly(pt, z.poly) : near(pt, z.x, z.z, z.r));
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p.z !== zj > p.z && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const distToSeg = (p, [x1, z1, x2, z2]) => {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const t = clamp(((p.x - x1) * dx + (p.z - z1) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - (x1 + t * dx), p.z - (z1 + t * dz));
};

export function rep(state, d, why) {
  const ev = state.ev;
  if (!ev) return;
  ev.rep = clamp(ev.rep + d, 0, 100);
  if (why) ev.repLast = d;
}

export function news(state, api, text, tone = 'info') {
  state.ev.news.push({ t: state.t, clock: state.clock, text, tone });
  if (state.ev.news.length > 30) state.ev.news.shift();
  api.emit('news', { text, tone });
}

/** Demand multiplier from active events (festivals) for one customer. */
export function eventDemandMult(state, c) {
  const ev = state.ev;
  if (!ev) return 1;
  let m = 1;
  for (const d of ev.deck) if (d.phase === 'active' && (d.kind === 'festival' || d.kind === 'heat') && d.ids?.includes(c.id)) m *= d.p.mult ?? 1.6;
  return m;
}

/** Crew speed-up while contractors are on site. */
export const crewFactor = (state) => (state.ev && state.ev.boostUntil > state.t ? 0.5 : 1);

/** Repair kits sent free from the regional depot when a disaster breaks more than you hold. */
function emergencyKits(state, api, n) {
  const short = n - state.inv.kits;
  if (short > 0) {
    state.inv.kits += short;
    api.emit('emergencyKits', { n: short });
  }
}

// ------------------------------------------------------------------ effects
function damage(state, api, d, list) {
  for (const id of list) {
    const n = state.nodes[id];
    const e = state.edges[id];
    if (n && n.state !== 'fault') n.state = 'fault';
    else if (e && e.state !== 'fault') e.state = 'fault';
    else continue;
    (n || e).disaster = d.kind !== 'xfmrFail'; // the emergency fund pays labour for disaster repairs
    d.damaged.push(id);
  }
  if (d.damaged.length) emergencyKits(state, api, d.damaged.length);
}

/** Seeded pick of up to `max` assets, each hit with probability `p` (HV resists). */
function pickDamage(state, d, cands, p, max) {
  const r = rng((state.seed + d.hitAt * 7 + 13) >>> 0);
  const hit = [];
  for (const id of cands.sort()) {
    const e = state.edges[id];
    const pp = e && e.tier === 'HV' ? p * 0.4 : p;
    if (r() < pp) hit.push(id);
    if (hit.length >= max) break;
  }
  return hit;
}

const liveXfmrs = (state, zone) => Object.keys(state.nodes).filter((id) => {
  const n = state.nodes[id];
  return n.kind === 'xfmr' && n.state === 'ok' && inZone(n, zone);
});
const linesIn = (state, test) => Object.keys(state.edges).filter((id) => {
  const e = state.edges[id];
  if (e.kind !== 'line' || e.state === 'fault') return false;
  const m = mid(state, e);
  return m && test(m);
});

// ------------------------------------------------------------------ phases
const KINDS = {
  xfmrFail: {
    warn(state, api, d) {
      // the busiest player-built pole transformer starts humming and running hot
      const ids = Object.keys(state.nodes).filter((id) => {
        const n = state.nodes[id];
        return n.kind === 'xfmr' && n.ratio !== 'HV/MV' && n.state === 'ok' && n.energized;
      });
      ids.sort((a, b) => (state.nodes[b].loadPct || 0) - (state.nodes[a].loadPct || 0) || (a < b ? -1 : 1));
      if (!ids.length) return false;
      d.target = ids[0];
      state.nodes[d.target].hum = true;
      d.servicedFrom = state.t;
      api.emit('evWarn', { id: d.id, kind: d.kind, target: d.target, inMin: d.hitAt - state.clock });
    },
    hit(state, api, d) {
      const n = state.nodes[d.target];
      if (!n) return;
      n.hum = false;
      if (n.lastServicedT != null && n.lastServicedT >= d.servicedFrom) {
        state.ev.stats.avoided++;
        rep(state, 3, true);
        api.emit('evAvoided', { id: d.id, kind: d.kind, target: d.target });
        news(state, api, 'Quick check-up saves a failing transformer. No one lost power.', 'good');
        d.noDamage = true;
        return;
      }
      if (n.state === 'maint') return; // crew on site: it fails safely during the service
      damage(state, api, d, [d.target]);
      api.emit('evHit', { id: d.id, kind: d.kind, damaged: d.damaged, target: d.target });
    },
  },
  flood: {
    warn(state, api, d) {
      api.emit('evWarn', { id: d.id, kind: d.kind, zone: d.p.zone, inMin: d.hitAt - state.clock, at: liveXfmrs(state, d.p.zone) });
    },
    hit(state, api, d) {
      // protected equipment is switched off by the crew as the water arrives
      d.autoIso = [];
      for (const id of liveXfmrs(state, d.p.zone)) {
        const n = state.nodes[id];
        if (n.protect) {
          n.state = 'isolated';
          n.protect = false;
          d.autoIso.push(id);
        }
      }
      damage(state, api, d, liveXfmrs(state, d.p.zone));
      if (d.kind === 'tsunami' || d.kind === 'wildfire') damage(state, api, d, pickDamage(state, d, linesIn(state, (m) => inZone(m, d.p.zone)), d.kind === 'wildfire' ? 0.35 : 0.5, d.p.maxLines ?? (d.kind === 'wildfire' ? 2 : 3)));
      api.emit('evHit', { id: d.id, kind: d.kind, damaged: d.damaged, zone: d.p.zone, saved: Object.keys(state.nodes).filter((id) => state.nodes[id].state === 'isolated' && inZone(state.nodes[id], d.p.zone)), auto: d.autoIso });
    },
    end(state, api, d) {
      const back = (d.autoIso || []).filter((id) => state.nodes[id]?.state === 'isolated');
      for (const id of back) state.nodes[id].state = 'ok';
      api.emit('evEnd', { id: d.id, kind: d.kind, zone: d.p.zone, back });
    },
  },
  quake: {
    hit(state, api, d) {
      const z = d.p.zone;
      const cands = [...linesIn(state, (m) => inZone(m, z)), ...Object.keys(state.nodes).filter((id) => state.nodes[id].kind === 'xfmr' && state.nodes[id].state === 'ok' && inZone(state.nodes[id], z))];
      damage(state, api, d, pickDamage(state, d, cands, d.p.p ?? 0.35, d.p.max ?? 3));
      api.emit('evHit', { id: d.id, kind: d.kind, damaged: d.damaged, zone: z });
    },
  },
  cyclone: {
    warn(state, api, d) {
      api.emit('evWarn', { id: d.id, kind: d.kind, track: d.p.track, inMin: d.hitAt - state.clock });
    },
    hit(state, api, d) {
      const w = d.p.width ?? 90;
      damage(state, api, d, pickDamage(state, d, linesIn(state, (m) => distToSeg(m, d.p.track) <= w), d.p.p ?? 0.45, d.p.max ?? 3));
      api.emit('evHit', { id: d.id, kind: d.kind, damaged: d.damaged, track: d.p.track });
    },
    tick(state) {
      // storm-force wind (turbines cut out above 25 m/s) and thick cloud
      if (state.weather) state.weather = { ...state.weather, wind: 30, cloud: 1, storm: true };
    },
    end(state, api, d) {
      api.emit('evEnd', { id: d.id, kind: d.kind });
    },
  },
  blackout: {
    warn(state, api, d) {
      const ids = Object.keys(state.gens).filter((id) => {
        const g = state.gens[id];
        return !g.retired && (g.status === 'running' || g.status === 'starting') && (g.outKW || 0) > 0;
      });
      ids.sort((a, b) => (state.gens[b].outKW || 0) - (state.gens[a].outKW || 0) || (a < b ? -1 : 1));
      // a named event (e.g. "wind farm trip") only trips the sources it is about
      const pick = d.p.targets ? ids.filter((id) => d.p.targets.includes(id)) : ids;
      if (!pick.length) return false;
      d.target = pick[0];
      api.emit('evWarn', { id: d.id, kind: d.kind, target: d.target, inMin: d.hitAt - state.clock });
    },
    hit(state, api, d) {
      const g = state.gens[d.target];
      if (!g || g.retired || !(g.status === 'running' || g.status === 'starting')) {
        d.noDamage = true;
        return;
      }
      g.prevStatus = g.status;
      g.status = 'tripped';
      g.tripUntil = d.endAt;
      d.tripped = true;
      api.emit('evHit', { id: d.id, kind: d.kind, target: d.target, damaged: [] });
    },
    end(state, api, d) {
      const g = state.gens[d.target];
      if (g && g.status === 'tripped') {
        g.status = 'starting';
        g.rampMin = 0;
      }
      if (g) g.tripUntil = 0;
      api.emit('evEnd', { id: d.id, kind: d.kind, target: d.target });
    },
  },
  arrivals: {
    warn(state, api, d) {
      api.emit('evWarn', { id: d.id, kind: d.kind, group: d.p.group, inMin: d.hitAt - state.clock });
    },
    hit(state, api, d) {
      d.ids = api.map.customers.filter((c) => c.surprise === d.p.group && state.cust[c.id].active === false).map((c) => c.id);
      for (const id of d.ids) {
        state.cust[id].active = true;
        state.cust[id].appearedT = state.t;
      }
      api.emit('evHit', { id: d.id, kind: d.kind, ids: d.ids, group: d.p.group, damaged: [] });
      for (const id of d.ids) api.emit('newCustomer', { id, surprise: true });
    },
    end(state, api, d) {
      const on = d.ids.filter((id) => ['on', 'partial'].includes(state.cust[id].status)).length;
      const ok = d.ids.length && on / d.ids.length >= 0.75;
      rep(state, ok ? 5 : -4, true);
      news(state, api, ok ? d.p.goodNews || 'New neighbours get power on their first day.' : d.p.badNews || 'Newcomers still waiting for a connection.', ok ? 'good' : 'bad');
      api.emit('evEnd', { id: d.id, kind: d.kind, ok, on, total: d.ids.length });
    },
  },
  festival: {
    warn(state, api, d) {
      d.ids = api.map.customers.filter((c) => (d.p.ids ? d.p.ids.includes(c.id) : c.festival === d.p.group) && state.cust[c.id].active !== false).map((c) => c.id);
      api.emit('evWarn', { id: d.id, kind: d.kind, ids: d.ids, inMin: d.hitAt - state.clock });
    },
    hit(state, api, d) {
      d.ids = d.ids || [];
      d.onMin = 0;
      d.allMin = 0;
      api.emit('evHit', { id: d.id, kind: d.kind, ids: d.ids, damaged: [] });
    },
    tick(state, api, d) {
      for (const id of d.ids) {
        const cs = state.cust[id];
        if (!cs.dropped) continue;
        d.allMin++;
        if (cs.status === 'on' || cs.status === 'partial') d.onMin++;
      }
    },
    end(state, api, d) {
      const frac = d.allMin ? d.onMin / d.allMin : 0;
      const ok = frac >= 0.95;
      state.ev.stats[ok ? 'festivalsLit' : 'festivalsDark']++;
      rep(state, ok ? 8 : -6, true);
      if (state.trust) for (const k in state.trust) state.trust[k] = clamp(state.trust[k] + (ok ? 3 : -3), 0, 100);
      news(state, api, ok ? d.p.goodNews : d.p.badNews, ok ? 'good' : 'bad');
      api.emit('evEnd', { id: d.id, kind: d.kind, ok, pct: Math.round(frac * 100) });
    },
  },
  request: {
    hit(state, api, d) {
      state.ev.choices[d.id] = { id: d.id, kind: 'request', who: d.p.who, title: d.p.title, text: d.p.text, options: d.p.options, until: state.t + (d.p.waitH ?? 8) * H };
      api.emit('choice', { id: d.id });
    },
  },
};

// ------------------------------------------------------------------ choices (requests, protests)
export function choose(state, api, bal, c) {
  const ch = state.ev?.choices[c.ev];
  if (!ch || ch.done) return { ok: false, reason: 'badTarget' };
  const o = ch.options[c.opt];
  if (!o) return { ok: false, reason: 'badTarget' };
  if ((o.cost || 0) > state.credits) return { ok: false, reason: 'noCredits' };
  applyOption(state, api, bal, ch, o);
  return { ok: true };
}

function applyOption(state, api, bal, ch, o) {
  ch.done = true;
  ch.picked = o.label;
  if (o.cost) api.spend(o.cost);
  if (o.gain) state.credits += o.gain;
  if (o.guard && ch.ev) {
    const dd = state.ev.deck.find((x) => x.id === ch.ev);
    if (dd) dd.guarded = true;
  }
  if (o.rep) rep(state, o.rep, true);
  if (o.trust && state.trust) for (const k of Object.keys(state.trust)) if (!o.cls || o.cls.includes(k)) state.trust[k] = clamp(state.trust[k] + o.trust, 0, 100);
  if (o.activate) for (const c of api.map.customers) if (c.surprise === o.activate && state.cust[c.id].active === false) {
    state.cust[c.id].active = true;
    state.cust[c.id].appearedT = state.t;
    api.emit('newCustomer', { id: c.id, surprise: true });
  }
  if (o.tariff && state.tariffs) for (const [k, v] of Object.entries(o.tariff)) if (state.tariffs[k] != null) state.tariffs[k] = Math.round(clamp(state.tariffs[k] + v, bal.tariffs?.[k]?.min ?? 0.01, bal.tariffs?.[k]?.max ?? 9) * 100) / 100;
  if (o.recheckH) ch.recheckAt = state.t + o.recheckH * H;
  if (ch.kind === 'request') state.ev.stats[o.yes ? 'requestsYes' : 'requestsNo']++;
  if (o.news) news(state, api, o.news, o.rep >= 0 ? 'good' : 'bad');
  api.emit('choiceMade', { id: ch.id, label: o.label });
}

function protestRules(state, api, bal) {
  const ev = state.ev;
  const R = api.mission.events?.protests;
  if (!R) return;
  // 1. 66 kV towers right beside homes
  if (R.hvNearHomes && !ev.protests.hv) {
    const homes = api.map.customers.filter((c) => state.cust[c.id].active !== false && isHome(bal, c));
    const pole = Object.values(state.nodes).find((n) => n.kind === 'pole' && n.tier === 'HV' && !n.legacy && homes.some((c) => near(c, n.x, n.z, R.hvNearHomes)));
    if (pole) {
      ev.protests.hv = { pole: pole.id, t: state.t };
      ev.stats.protests++;
      const home = homes.find((c) => near(c, pole.x, pole.z, R.hvNearHomes));
      ev.choices.protestHV = {
        id: 'protestHV',
        kind: 'protest',
        who: 'residents',
        title: 'Residents object to the 66 kV towers',
        text: `People on ${home.name} say the new 66 kV towers are too close to their homes, about ${Math.round(Math.hypot(home.x - pole.x, home.z - pole.z))} m away. They want them moved.`,
        at: { x: pole.x, z: pole.z },
        options: [
          { label: 'Move the line', note: 'Remove the towers near the homes and rebuild further away within 12 h. Most of the cost comes back.', recheckH: 12, rep: 1, news: 'Utility agrees to move towers away from homes.' },
          { label: `Pay compensation · ${(R.compensation ?? 1500).toLocaleString('en-US')} ¢`, cost: R.compensation ?? 1500, rep: -1, note: 'The towers stay. Neighbours accept a payment.', news: 'Tower neighbours accept compensation.' },
          { label: 'Go ahead anyway', rep: -10, trust: -6, cls: ['home', 'lowincome'], note: 'The towers stay and people are upset.', news: 'Anger as towers go up beside homes.' },
        ],
        until: state.t + 8 * H,
      };
      api.emit('choice', { id: 'protestHV', at: { x: pole.x, z: pole.z } });
    }
  }
  // 2. a neighbourhood left dark for hours
  if (R.outages && !ev.protests.dark) {
    const dark = api.map.customers.filter((c) => state.cust[c.id].active !== false && state.cust[c.id].everPowered && state.cust[c.id].outMin >= 180);
    if (dark.length >= (R.outages ?? 4)) {
      ev.protests.dark = { t: state.t };
      ev.stats.protests++;
      const c0 = dark[0];
      ev.choices.protestDark = {
        id: 'protestDark',
        kind: 'protest',
        who: 'residents',
        title: 'Residents march on the utility office',
        text: `${dark.length} buildings, including ${c0.name}, have been without power for over 3 hours. People want answers.`,
        at: { x: c0.x, z: c0.z },
        options: [
          { label: `Apologise and credit their bills · ${(R.credit ?? 800).toLocaleString('en-US')} ¢`, cost: R.credit ?? 800, rep: 2, trust: 4, note: 'Calms things down. Still fix the fault!', news: 'Utility apologises and credits bills after long outage.' },
          { label: 'Say nothing', rep: -8, trust: -4, note: 'People feel ignored.', news: 'Silence from the utility as streets stay dark.' },
        ],
        until: state.t + 6 * H,
      };
      api.emit('choice', { id: 'protestDark', at: { x: c0.x, z: c0.z } });
    }
  }
  // follow-up: did they actually move the towers?
  const hv = ev.choices.protestHV;
  if (hv?.recheckAt && state.t >= hv.recheckAt && !hv.rechecked) {
    hv.rechecked = true;
    const homes = api.map.customers.filter((c) => state.cust[c.id].active !== false && isHome(bal, c));
    const still = Object.values(state.nodes).some((n) => n.kind === 'pole' && n.tier === 'HV' && homes.some((c) => near(c, n.x, n.z, R.hvNearHomes)));
    rep(state, still ? -10 : 4, true);
    news(state, api, still ? 'Residents say the utility broke its promise to move the towers.' : 'Towers moved: residents thank the utility.', still ? 'bad' : 'good');
    api.emit('protestOutcome', { ok: !still });
  }
}

// ------------------------------------------------------------------ per-minute tick
export function eventsTick(state, api, bal) {
  const ev = state.ev;
  if (!ev) return false;
  let changed = false;
  for (const d of ev.deck) {
    const K = KINDS[d.kind] || {};
    if (d.phase === 'pending' && state.clock >= d.warnAt && d.warnAt < d.hitAt) {
      const r = K.warn?.(state, api, d);
      if (r === false) {
        d.phase = 'skipped';
        continue;
      }
      d.phase = 'warned';
    }
    if ((d.phase === 'pending' || d.phase === 'warned') && state.clock >= d.hitAt) {
      if (d.phase === 'pending' && K.warn && d.warnAt < d.hitAt && K.warn(state, api, d) === false) {
        d.phase = 'skipped';
        continue;
      }
      ev.stats.hits++;
      K.hit?.(state, api, d);
      d.phase = d.endAt > d.hitAt ? 'active' : 'done';
      changed = true;
      if (d.damaged.length) d.restoreFrom = state.t;
    }
    if (d.phase === 'active') {
      K.tick?.(state, api, d);
      if (state.clock >= d.endAt) {
        d.phase = 'done';
        K.end?.(state, api, d);
        changed = true;
      }
    }
    // restoration after damage: fast repairs earn trust, slow ones cost it
    if (d.damaged.length && d.restoreFrom != null && d.restoredAt == null) {
      const broken = d.damaged.filter((id) => state.nodes[id]?.state === 'fault' || state.edges[id]?.state === 'fault');
      if (!broken.length) {
        d.restoredAt = state.t;
        const hrs = (d.restoredAt - d.restoreFrom) / H;
        const fast = hrs <= (d.p.fastH ?? 6);
        ev.stats[fast ? 'restoredFast' : 'restoredSlow']++;
        rep(state, fast ? 5 : -3, true);
        news(state, api, fast ? `Power restored ${hrs < 1.5 ? 'within the hour' : `in ${Math.round(hrs)} hours`} after the ${LABEL[d.kind] || 'damage'}.` : `Repairs took ${Math.round(hrs)} hours after the ${LABEL[d.kind] || 'damage'}.`, fast ? 'good' : 'bad');
        api.emit('evRestored', { id: d.id, kind: d.kind, hours: hrs });
      }
    }
  }
  for (const b of ev.beats || []) {
    if (b.done || state.clock < b.at) continue;
    b.done = true;
    const B = api.mission.story?.[b.i];
    if (!B || (B.when && !B.when(state))) continue;
    if (B.options) {
      ev.choices[b.id] = { id: b.id, kind: 'story', who: B.who, title: B.title, text: B.text, options: B.options, until: state.t + (B.waitH ?? 6) * H };
      api.emit('choice', { id: b.id });
    } else api.emit('beat', { id: b.id, who: B.who, lines: B.lines });
  }
  // choices that were never answered count as "ignored"
  for (const ch of Object.values(ev.choices)) {
    if (!ch.done && state.t >= ch.until) {
      const ig = ch.options[ch.options.length - 1];
      applyOption(state, api, bal, ch, ig);
      api.emit('choiceExpired', { id: ch.id });
    }
  }
  if (state.clock % H === 0) {
    protestRules(state, api, bal);
    // hourly reputation drift from service quality
    const act = api.map.customers.filter((c) => state.cust[c.id].active !== false && state.cust[c.id].everPowered);
    if (act.length) {
      const on = act.filter((c) => ['on', 'partial'].includes(state.cust[c.id].status)).length / act.length;
      rep(state, on >= 0.98 ? 0.3 : on >= 0.9 ? 0 : -0.8);
    }
    if (state.affordPct > 6) rep(state, -0.2);
  }
  return changed;
}

// thunderstorm: forecast a few hours ahead; lightning and falling branches bring down a line or two
KINDS.storm = {
  warn(state, api, d) {
    api.emit('evWarn', { id: d.id, kind: d.kind, inMin: d.hitAt - state.clock });
  },
  hit(state, api, d) {
    const cands = linesIn(state, (m) => !d.p.zone || inZone(m, d.p.zone)).filter((id) => state.edges[id].energized);
    damage(state, api, d, pickDamage(state, d, cands, d.p.p ?? 0.15, d.p.max ?? 1));
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: d.damaged });
  },
  tick(state) {
    if (state.weather) state.weather = { ...state.weather, cloud: Math.max(state.weather.cloud, 0.95), storm: true, label: 'Thunderstorm' };
  },
  end(state, api, d) {
    api.emit('evEnd', { id: d.id, kind: d.kind });
  },
};

// heat wave: everyone turns on fans and air conditioning for an afternoon
KINDS.heat = {
  warn(state, api, d) {
    d.ids = api.map.customers.filter((c) => state.cust[c.id].active !== false && (!d.p.cls || d.p.cls.includes(typeDef(api.bal, c.type).cls))).map((c) => c.id);
    api.emit('evWarn', { id: d.id, kind: d.kind, ids: d.ids, inMin: d.hitAt - state.clock });
  },
  hit: KINDS.festival.hit,
  tick(state, api, d) {
    KINDS.festival.tick(state, api, d);
    if (state.weather) state.weather = { ...state.weather, temp: Math.max(state.weather.temp, 36), heat: true, label: 'Heat wave' };
  },
  end(state, api, d) {
    const frac = d.allMin ? d.onMin / d.allMin : 0;
    const ok = frac >= 0.95;
    rep(state, ok ? 4 : -4, true);
    news(state, api, ok ? d.p.goodNews || 'Fans keep spinning as the town beats the heat.' : d.p.badNews || 'Homes swelter as power fails in the heat.', ok ? 'good' : 'bad');
    api.emit('evEnd', { id: d.id, kind: d.kind, ok, pct: Math.round(frac * 100) });
  },
};

// safety inspection: the regulator checks the network at a set hour; overloads and broken kit count against you
KINDS.inspection = {
  warn(state, api, d) {
    api.emit('evWarn', { id: d.id, kind: d.kind, inMin: d.hitAt - state.clock });
  },
  hit(state, api, d) {
    const bad = (x) => x.state === 'fault' || x.state === 'trip' || (x.energized && (x.loadPct || 0) > 100);
    const issues = [
      ...Object.keys(state.nodes).filter((id) => state.nodes[id].kind === 'xfmr' && bad(state.nodes[id])),
      ...Object.keys(state.edges).filter((id) => state.edges[id].kind === 'line' && bad(state.edges[id])),
    ];
    const ok = issues.length === 0;
    const grant = ok ? d.p.grant ?? 400 : 0;
    if (grant) state.credits += grant;
    rep(state, ok ? 5 : -4, true);
    news(state, api, ok ? 'Inspectors give the local grid a clean bill of health.' : `Inspectors find ${issues.length} problem${issues.length === 1 ? '' : 's'} on the local grid.`, ok ? 'good' : 'bad');
    d.issues = issues;
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: [], ok, issues, grant });
  },
};

// cable theft: the police warn you; night guards keep the thieves away, otherwise a line is cut
KINDS.theft = {
  warn(state, api, d) {
    const cands = linesIn(state, (m) => !d.p.zone || inZone(m, d.p.zone)).filter((id) => state.edges[id].tier !== 'HV' && state.edges[id].energized).sort();
    if (!cands.length) return false;
    const r = rng((state.seed + d.hitAt * 3 + 5) >>> 0);
    d.target = cands[Math.floor(r() * cands.length)];
    const at = mid(state, state.edges[d.target]);
    const cost = d.p.cost ?? 300;
    state.ev.choices[d.id] = {
      id: d.id,
      ev: d.id,
      kind: 'warning',
      who: 'sofia',
      title: 'Cable thieves are about',
      text: `The police say a gang is stealing copper cable ${d.p.area ? `around ${d.p.area}` : 'in the area'}. One of your lines there looks like an easy target in about ${Math.max(1, Math.round((d.hitAt - state.clock) / 60))} hours. Night guards would keep them away.`,
      at,
      options: [
        { label: `Hire night guards · ${cost.toLocaleString('en-US')} ¢`, cost, guard: true, note: 'The line stays safe.' },
        { label: 'Take the risk', note: 'If they strike, the line goes down until your crew fixes it.' },
      ],
      until: state.t + Math.max(30, d.hitAt - state.clock - 5),
    };
    api.emit('evWarn', { id: d.id, kind: d.kind, target: d.target, inMin: d.hitAt - state.clock, at });
    api.emit('choice', { id: d.id, at });
  },
  hit(state, api, d) {
    if (d.guarded) {
      state.ev.stats.avoided++;
      rep(state, 2, true);
      news(state, api, 'Night guards scare off cable thieves.', 'good');
      d.noDamage = true;
      api.emit('evAvoided', { id: d.id, kind: d.kind, target: d.target });
      return;
    }
    if (state.edges[d.target]?.state === 'ok') damage(state, api, d, [d.target]);
    if (d.damaged.length) news(state, api, 'Thieves cut a power line overnight.', 'bad');
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: d.damaged, target: d.target });
  },
};

// VIP visit: a minister or the mayor tours a district; keep it lit the whole time for a grant
KINDS.vipVisit = {
  warn(state, api, d) {
    const z = d.p.zone;
    d.ids = api.map.customers.filter((c) => state.cust[c.id].active !== false && state.cust[c.id].dropped && inZone(c, z)).map((c) => c.id);
    if (!d.ids.length) return false; // nothing of yours to show off there yet
    api.emit('evWarn', { id: d.id, kind: d.kind, ids: d.ids, inMin: d.hitAt - state.clock });
  },
  hit: KINDS.festival.hit,
  tick: KINDS.festival.tick,
  end(state, api, d) {
    const frac = d.allMin ? d.onMin / d.allMin : 0;
    const ok = frac >= 0.95;
    const grant = ok ? d.p.grant ?? 300 : 0;
    if (grant) state.credits += grant;
    rep(state, ok ? 6 : -6, true);
    news(state, api, ok ? d.p.goodNews || `${d.p.name || 'The minister'} praises the local grid on a visit.` : d.p.badNews || `Power cut during ${d.p.name ? d.p.name.replace(/^The /, 'the ') : 'the minister'}’s visit.`, ok ? 'good' : 'bad');
    api.emit('evEnd', { id: d.id, kind: d.kind, ok, pct: Math.round(frac * 100), grant });
  },
};

// wildfire: like a flood on dry land; switched-off equipment survives, live kit and lines burn
KINDS.wildfire = KINDS.flood;

// landslide: an hour of warning (heavy rain on the slopes), then lines and poles in the zone come down
KINDS.landslide = {
  warn(state, api, d) {
    api.emit('evWarn', { id: d.id, kind: d.kind, zone: d.p.zone, inMin: d.hitAt - state.clock });
  },
  hit(state, api, d) {
    const z = d.p.zone;
    const cands = [...linesIn(state, (m) => inZone(m, z)), ...liveXfmrs(state, z)];
    damage(state, api, d, pickDamage(state, d, cands, d.p.p ?? 0.6, d.p.max ?? 2));
    if (d.damaged.length) news(state, api, `Landslide brings down power lines ${d.p.area ? `near ${d.p.area}` : 'on the hillside'}.`, 'bad');
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: d.damaged, zone: z });
  },
  end(state, api, d) {
    api.emit('evEnd', { id: d.id, kind: d.kind });
  },
};

// cyber alert: the regulator warns of hackers probing control systems; patch now, or risk a remote trip
KINDS.cyberAlert = {
  warn(state, api, d) {
    const subs = Object.keys(state.nodes).filter((id) => {
      const n = state.nodes[id];
      return n.kind === 'xfmr' && n.state === 'ok' && n.energized;
    });
    if (!subs.length) return false;
    subs.sort((a, b) => (state.nodes[a].ratio === 'HV/MV' ? 0 : 1) - (state.nodes[b].ratio === 'HV/MV' ? 0 : 1) || (state.nodes[b].loadKW || 0) - (state.nodes[a].loadKW || 0) || (a < b ? -1 : 1));
    d.target = subs[0];
    const n = state.nodes[d.target];
    const cost = d.p.cost ?? 600;
    state.ev.choices[d.id] = {
      id: d.id,
      ev: d.id,
      kind: 'warning',
      label: 'Security warning',
      who: 'advisor',
      title: 'Hackers are probing the control system',
      text: `The national cyber team says hackers are trying to switch off substations by remote control in this region. Your busiest one looks exposed. They expect an attempt in about ${Math.max(1, Math.round((d.hitAt - state.clock) / 60))} hours.`,
      at: { x: n.x, z: n.z },
      options: [
        { label: `Patch the systems · ${cost.toLocaleString('en-US')} ¢`, cost, guard: true, note: 'Security updates close the gap. Nothing switches off.' },
        { label: 'Take the risk', note: 'If they get in, it switches off until you reset it.' },
      ],
      until: state.t + Math.max(30, d.hitAt - state.clock - 5),
    };
    api.emit('evWarn', { id: d.id, kind: d.kind, target: d.target, inMin: d.hitAt - state.clock, at: { x: n.x, z: n.z } });
    api.emit('choice', { id: d.id, at: { x: n.x, z: n.z } });
  },
  hit(state, api, d) {
    const n = state.nodes[d.target];
    if (d.guarded || !n || n.state !== 'ok') {
      if (d.guarded) {
        state.ev.stats.avoided++;
        rep(state, 2, true);
        news(state, api, 'Hackers fail to break into the local grid.', 'good');
        api.emit('evAvoided', { id: d.id, kind: d.kind, target: d.target });
      }
      d.noDamage = true;
      return;
    }
    n.state = 'trip';
    n.coolUntil = state.t + (d.p.coolMin ?? 15);
    n.overMin = 0;
    rep(state, -3, true);
    news(state, api, 'Hackers switch off a substation by remote control.', 'bad');
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: [], target: d.target, tripped: true });
  },
};

// dust or sand storm: panels get covered and lose output until the crew washes them
KINDS.dustStorm = {
  warn(state, api, d) {
    api.emit('evWarn', { id: d.id, kind: d.kind, inMin: d.hitAt - state.clock });
  },
  hit(state, api, d) {
    d.dusty = [];
    for (const id of Object.keys(state.gens).sort()) {
      const g = state.gens[id];
      if (g.type !== 'solar' || g.retired) continue;
      g.dust = Math.max(g.dust || 0, d.p.loss ?? 0.6);
      d.dusty.push(id);
    }
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: [], dusty: d.dusty });
  },
  tick(state) {
    if (state.weather) state.weather = { ...state.weather, cloud: Math.max(state.weather.cloud, 0.7), dust: true, label: 'Dust storm' };
  },
  end(state, api, d) {
    const dusty = Object.keys(state.gens).filter((id) => (state.gens[id].dust || 0) > 0).sort();
    api.emit('evEnd', { id: d.id, kind: d.kind, dusty });
  },
};

// price spike: a heat wave abroad sends wholesale prices up for a few hours (Stage 9)
KINDS.priceSpike = {
  warn(state, api, d) {
    api.emit('evWarn', { id: d.id, kind: d.kind, inMin: d.hitAt - state.clock });
  },
  hit(state, api, d) {
    d.bought = 0;
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: [] });
  },
  tick(state, api, d) {
    for (const g of Object.values(state.gens)) if (api.bal.sourceTypes?.[g.type]?.market) d.bought += (g.outKW || 0) / 60;
  },
  end(state, api, d) {
    const ok = d.bought < 50;
    rep(state, ok ? 2 : -1, true);
    if (ok) news(state, api, 'Utility dodges the price spike: no expensive imports.', 'good');
    api.emit('evEnd', { id: d.id, kind: d.kind, ok, bought: Math.round(d.bought) });
  },
};

// ice storm: freezing rain coats lines in a zone; ice builds on lightly loaded lines and melts off
// lines carrying at least 60% of their limit (the current warms them). Fully iced lines snap.
KINDS.iceStorm = {
  warn(state, api, d) {
    api.emit('evWarn', { id: d.id, kind: d.kind, zone: d.p.zone, inMin: d.hitAt - state.clock });
  },
  hit(state, api, d) {
    d.lines = linesIn(state, (m) => inZone(m, d.p.zone)).filter((id) => (d.p.tiers || ['HV', 'MV']).includes(state.edges[id].tier));
    for (const id of d.lines) state.edges[id].ice = state.edges[id].ice || 0;
    api.emit('evHit', { id: d.id, kind: d.kind, damaged: [], lines: d.lines.slice() });
  },
  tick(state, api, d) {
    if (state.weather) state.weather = { ...state.weather, cloud: Math.max(state.weather.cloud, 0.9), snow: true, label: 'Freezing rain' };
    const build = 1 / ((d.p.buildH ?? 4) * 60);
    for (const id of d.lines || []) {
      const e = state.edges[id];
      if (!e || e.state === 'fault') continue;
      const warm = e.energized && (Math.max(e.loadKW || 0, e.srcFlowKW || 0) / (e.ratingKW || 1)) * 100 >= (d.p.meltPct ?? 60);
      e.ice = Math.max(0, Math.min(1, (e.ice || 0) + (warm ? -build * 1.5 : build)));
      if (e.ice >= 1) {
        e.ice = 0;
        damage(state, api, d, [id]);
        d.snapped = (d.snapped || 0) + 1;
        news(state, api, 'Ice snaps a power line on the pass.', 'bad');
        api.emit('iceSnap', { id: d.id, target: id });
      } else if (e.ice >= 0.75 && !e.iceWarned) {
        e.iceWarned = true;
        api.emit('iceHeavy', { id: d.id, target: id, ice: e.ice });
      }
    }
  },
  end(state, api, d) {
    for (const id of d.lines || []) if (state.edges[id]) {
      state.edges[id].ice = 0;
      state.edges[id].iceWarned = false;
    }
    if (!d.snapped) {
      rep(state, 3, true);
      news(state, api, 'Lines on the pass ride out the ice storm.', 'good');
    }
    api.emit('evEnd', { id: d.id, kind: d.kind, snapped: d.snapped || 0 });
  },
};

export const LABEL = { xfmrFail: 'transformer failure', flood: 'flood', tsunami: 'tsunami', quake: 'earthquake', cyclone: 'cyclone', blackout: 'blackout', arrivals: 'new arrivals', festival: 'festival', request: 'request', storm: 'thunderstorm', heat: 'heat wave', inspection: 'inspection', theft: 'cable theft', vipVisit: 'VIP visit', wildfire: 'wildfire', landslide: 'landslide', cyberAlert: 'cyber attack', dustStorm: 'dust storm', iceStorm: 'ice storm', priceSpike: 'price spike' };
KINDS.tsunami = KINDS.flood;
/** Hazards that cover an area and spare switched-off equipment. */
export const isWet = (kind) => kind === 'flood' || kind === 'tsunami' || kind === 'wildfire';

// ------------------------------------------------------------------ commands
export function eventCommands(api) {
  const { state, bal } = api;
  return {
    /** Switch a transformer or substation off ahead of a flood (or back on afterwards). */
    isolate(c) {
      const n = state.nodes[c.target];
      if (!n || n.kind !== 'xfmr') return { ok: false, reason: 'badTarget' };
      if (c.on) {
        if (n.state !== 'isolated') return { ok: false, reason: 'notIsolated' };
        const wet = state.ev?.deck.some((d) => isWet(d.kind) && d.phase === 'active' && inZone(n, d.p.zone));
        if (wet) return { ok: false, reason: 'stillFlooded' };
        n.state = 'ok';
      } else {
        if (n.state !== 'ok') return { ok: false, reason: 'notInService' };
        n.state = 'isolated';
      }
      api.emit('isolated', { target: n.id, on: !!c.on });
      api.resolve();
      return { ok: true };
    },
    /** Ask the crew to switch a transformer off as flood water arrives (and back on after). */
    protect(c) {
      const n = state.nodes[c.target];
      if (!n || n.kind !== 'xfmr') return { ok: false, reason: 'badTarget' };
      const ahead = state.ev?.deck.some((d) => isWet(d.kind) && d.phase === 'warned' && inZone(n, d.p.zone));
      if (!ahead) return { ok: false, reason: 'noFloodComing' };
      n.protect = c.off ? false : true;
      api.emit('protected', { target: n.id, on: n.protect });
      return { ok: true };
    },
    /** Call in a contractor crew: repairs and travel take half the time for 12 hours. */
    contractors() {
      const cost = bal.costs.contractors ?? 1200;
      if (state.ev.boostUntil > state.t) return { ok: false, reason: 'alreadyHired' };
      if (state.credits < cost) return { ok: false, reason: 'noCredits' };
      api.spend(cost);
      state.ev.boostUntil = state.t + 12 * H;
      api.emit('contractors', { until: state.ev.boostUntil, cost });
      return { ok: true };
    },
    /** Send the crew to wash dust off a solar park after a dust storm. */
    cleanPanels(c) {
      const g = state.gens[c.target];
      if (!g || !(g.dust > 0)) return { ok: false, reason: 'badTarget' };
      if (api.crewBusyWith(c.target)) return { ok: false, reason: 'crewBusy' };
      return api.dispatchCrew({ type: 'clean', target: c.target });
    },
    choose(c) {
      const r = choose(state, api, bal, c);
      if (r.ok) api.resolve();
      return r;
    },
  };
}

/** Each stage's score gains a Community part (reputation); other parts are scaled to 90 %. */
export function withCommunity(score, state, defaultSpec) {
  if (!state.ev || !score) return score;
  const spec = (score.spec || defaultSpec).map(([k, l, mx]) => [k, l, Math.round(mx * 0.9 * 10) / 10]);
  const parts = Object.fromEntries(Object.entries(score.parts).map(([k, v]) => [k, Math.round(v * 0.9 * 10) / 10]));
  parts.community = Math.round(state.ev.rep / 10);
  spec.push(['community', 'Community', 10]);
  const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { ...score, parts, spec, total, ending: total >= 85 ? 'sustainable' : total >= 65 ? 'reliable' : 'hardwon', rep: Math.round(state.ev.rep) };
}

/** Reference responses to run events (tests and the review "Play ending" shortcut). */
export function autoRespond(sim, e) {
  const st = sim.state;
  const d = e.id ? st.ev?.deck.find((x) => x.id === e.id) : null;
  if (e.type === 'evWarn' && e.kind === 'xfmrFail') sim.cmd({ type: 'maintain', target: e.target });
  if (e.type === 'evWarn' && isWet(e.kind)) for (const id of e.at || []) sim.cmd({ type: 'protect', target: id });
  if (e.type === 'evWarn' && e.kind === 'blackout') for (const id in st.gens) if (id !== e.target && st.gens[id].status === 'off') sim.cmd({ type: 'startGen', target: id });
  if (e.type === 'evHit') {
    if ((e.damaged || []).length > 1) sim.cmd({ type: 'contractors' });
    for (const id of e.damaged || []) sim.cmd({ type: 'repair', target: id });
    for (const id of e.ids || []) if (e.kind === 'arrivals') sim.cmd({ type: 'drop', building: id });
  }
  if (e.type === 'iceSnap') sim.cmd({ type: 'repair', target: e.target });
  if (e.type === 'evEnd' && e.kind === 'dustStorm') for (const id of e.dusty || []) sim.cmd({ type: 'cleanPanels', target: id });
  if (e.type === 'choice') {
    const ch = st.ev.choices[e.id];
    const ok = ch.options.findIndex((o) => (o.cost || 0) <= st.credits * 0.25 && !o.recheckH);
    sim.cmd({ type: 'choose', ev: e.id, opt: ok >= 0 ? ok : ch.options.length - 1 });
  }
  void d;
}

/** Drain a sim's events, letting the reference strategy respond to run events. */
export function drainAndRespond(sim) {
  const evs = sim.drainEvents();
  for (const e of evs) autoRespond(sim, e);
  // reset anything protection tripped once it has cooled
  const st = sim.state;
  if (st.t % 15 === 0) {
    for (const id in st.nodes) if (st.nodes[id].state === 'trip' && st.t >= (st.nodes[id].coolUntil || 0)) sim.cmd({ type: 'reset', target: id });
    for (const id in st.edges) if (st.edges[id].state === 'trip' && st.t >= (st.edges[id].coolUntil || 0)) sim.cmd({ type: 'reset', target: id });
  }
  return evs;
}
