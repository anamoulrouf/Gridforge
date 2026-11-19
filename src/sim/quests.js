// Daily side quests: each in-game morning a resident asks for one or two small favours with a
// reward ("Light the market by 18:00", "Keep the café lit for the match tonight").
// Pure and deterministic: the draw depends only on the run seed, the mission and the day, so saves
// and replays stay identical. Missing a quest costs nothing; finishing one pays credits and goodwill.
import { rng, fnv } from './rng.js';
import { srcType } from './power.js';
import { rep, news } from './events.js';

const D = 1440;
const lit = (cs) => cs && (cs.status === 'on' || cs.status === 'partial');
const hh = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:00`;

export function initQuests(state, mission) {
  if (!mission.quests?.pool?.length) return;
  state.q = { list: [], day: 0, n: 0, done: 0, failed: 0, seen: [] };
}

const custName = (map, id) => map.customers.find((c) => c.id === id)?.name || id;
const isRenew = (bal, g) => {
  const T = srcType(bal, g.type);
  return !!(T.renewable || T.variable);
};
const isFossil = (bal, g) => {
  const T = srcType(bal, g.type);
  return !T.storage && !T.renewable && !T.variable && (T.co2 ?? (g.type === 'diesel' || g.type === 'gas' || g.type === 'coal' || g.type === 'import' ? 1 : 0)) > 0;
};
const storages = (state, bal) => Object.keys(state.gens).filter((id) => srcType(bal, state.gens[id].type).storage && !state.gens[id].retired).sort();
const countBuilt = (state, kind) => {
  if (kind === 'drop') return Object.values(state.edges).filter((e) => e.kind === 'drop').length;
  if (kind === 'xfmr') return Object.values(state.nodes).filter((n) => n.kind === 'xfmr' && !n.legacy).length;
  return Object.values(state.nodes).filter((n) => n.kind === 'pole' && !n.legacy).length;
};

/** Can this quest be offered right now? (no "connect X" if X is already lit, no window already past) */
function eligible(state, api, bal, p, hm) {
  const g = p.goal;
  const cust = (id) => state.cust[id];
  const exists = (id) => cust(id) && cust(id).active !== false;
  switch (g.type) {
    case 'poweredBy':
      return exists(g.id) && !lit(cust(g.id)) && hm < g.hour * 60 - 60;
    case 'keepLit':
      return g.ids.some((id) => exists(id) && cust(id).dropped) && hm < g.fromH * 60;
    case 'noShed':
      return hm < g.fromH * 60 && Object.values(state.cust).some((c) => c.dropped);
    case 'socAt':
      return storages(state, bal).length > 0 && hm < g.hour * 60 - 120;
    case 'renewShare':
      return Object.values(state.gens).some((x) => isRenew(bal, x) && !x.retired) || !!state.prosumers;
    case 'fossilUnder':
      return Object.values(state.gens).some((x) => isFossil(bal, x) && !x.retired);
    case 'build':
      if (g.kind === 'drop') return api.map.customers.filter((c) => exists(c.id) && !cust(c.id).dropped).length >= g.n && hm < g.hour * 60 - 60;
      return hm < g.hour * 60 - 60;
  }
  return false;
}

function draw(state, api, bal, mission, day, hm) {
  const Q = state.q;
  const P = mission.quests;
  const r = rng((state.seed ^ parseInt(fnv(`${mission.id}:q${day}`), 16)) >>> 0);
  const [lo, hi] = P.perDay || [1, 2];
  const n = lo + Math.floor(r() * (hi - lo + 1));
  let cands = P.pool.filter((p) => !Q.seen.includes(p.key) && eligible(state, api, bal, p, hm));
  if (cands.length < n) cands = P.pool.filter((p) => eligible(state, api, bal, p, hm) && !cands.includes(p)).concat(cands);
  const picked = [];
  while (picked.length < n && cands.length) {
    const tot = cands.reduce((s, p) => s + (p.weight ?? 1), 0);
    let x = r() * tot;
    let i = 0;
    while (i < cands.length - 1 && (x -= cands[i].weight ?? 1) > 0) i++;
    picked.push(cands.splice(i, 1)[0]);
  }
  const d0 = (day - 1) * D;
  for (const p of picked) {
    const g = p.goal;
    const until = d0 + (g.hour ?? g.toH ?? 23.98) * 60;
    const q = { id: 'q' + ++Q.n, key: p.key, day, who: p.who || 'maya', title: p.title, text: p.text, goal: { ...g }, reward: p.reward || {}, news: p.news, status: 'open', from: state.clock, until: Math.round(until), at: p.at || null, prog: {} };
    if (g.type === 'build') q.prog.base = countBuilt(state, g.kind);
    if (g.id) q.name = custName(api.map, g.id);
    Q.list.push(q);
    Q.seen.push(p.key);
    api.emit('questNew', { id: q.id });
  }
  // keep the list short: today's quests and anything still open
  Q.list = Q.list.filter((q) => q.day >= day - 1);
}

function finish(state, api, q, ok) {
  q.status = ok ? 'done' : 'failed';
  q.endT = state.t;
  const Q = state.q;
  if (ok) {
    Q.done++;
    if (q.reward.credits) state.credits += q.reward.credits;
    if (q.reward.rep && state.ev) rep(state, q.reward.rep, true);
    if (q.news && state.ev) news(state, api, q.news, 'good');
    api.emit('questDone', { id: q.id });
  } else {
    Q.failed++;
    api.emit('questFailed', { id: q.id });
  }
}

export function questsTick(state, api, bal, mission) {
  const Q = state.q;
  if (!Q || state.result) return;
  const day = Math.floor(state.clock / D) + 1;
  const hm = state.clock % D;
  if (Q.day < day && hm >= 6 * 60 && hm < 20 * 60 && day >= (mission.quests.fromDay ?? 1)) {
    Q.day = day;
    draw(state, api, bal, mission, day, hm);
  }
  for (const q of Q.list) {
    if (q.status !== 'open') continue;
    const g = q.goal;
    const P = q.prog;
    const d0 = (q.day - 1) * D;
    const inWin = (a, b) => state.clock >= d0 + a * 60 && state.clock < d0 + b * 60;
    switch (g.type) {
      case 'poweredBy':
        if (lit(state.cust[g.id])) finish(state, api, q, true);
        break;
      case 'keepLit':
        if (inWin(g.fromH, g.toH)) {
          for (const id of g.ids) {
            const cs = state.cust[id];
            if (!cs || cs.active === false || !cs.dropped) continue;
            P.all = (P.all || 0) + 1;
            if (lit(cs)) P.on = (P.on || 0) + 1;
          }
          if (P.exp == null) P.exp = g.ids.filter((id) => state.cust[id]?.dropped && state.cust[id].active !== false).length * (g.toH - g.fromH) * 60;
          if (P.all && P.all - (P.on || 0) > Math.max(3, P.exp * 0.02)) finish(state, api, q, false);
        }
        if (state.clock >= q.until && q.status === 'open') finish(state, api, q, !!P.all && (P.on || 0) / P.all >= 0.98);
        break;
      case 'noShed':
        if (inWin(g.fromH, g.toH) && Object.values(state.cust).some((c) => c.dropped && c.active !== false && c.status === 'shed')) finish(state, api, q, false);
        else if (state.clock >= q.until) finish(state, api, q, true);
        break;
      case 'socAt': {
        const ids = storages(state, bal);
        const pct = ids.length ? (ids.reduce((s, id) => {
          const x = state.gens[id];
          return s + x.soc / Math.max(1, x.kwh ?? srcType(bal, x.type).kwh ?? 1);
        }, 0) / ids.length) * 100 : 0;
        P.pct = pct;
        if (pct >= g.pct - 1e-9 && state.clock >= q.until - 60) finish(state, api, q, true);
        else if (state.clock >= q.until) finish(state, api, q, pct >= g.pct - 1e-9);
        break;
      }
      case 'renewShare':
      case 'fossilUnder': {
        let ren = 0;
        let all = 0;
        let fos = 0;
        for (const x of Object.values(state.gens)) {
          const T = srcType(bal, x.type);
          if (T.storage) continue;
          all += x.outKW || 0;
          if (isRenew(bal, x)) ren += x.outKW || 0;
          if (isFossil(bal, x)) fos += x.outKW || 0;
        }
        const ex = state.flow?.exportKW || 0;
        P.ren = (P.ren || 0) + (ren + ex) / 60;
        P.all = (P.all || 0) + (all + ex) / 60;
        P.fos = (P.fos || 0) + fos / 60;
        if (g.type === 'fossilUnder' && P.fos > g.kWh) finish(state, api, q, false);
        else if (state.clock >= q.until) finish(state, api, q, g.type === 'fossilUnder' ? true : P.all > 0 && (P.ren / P.all) * 100 >= g.pct);
        break;
      }
      case 'build': {
        P.n = countBuilt(state, g.kind) - P.base;
        if (P.n >= g.n) finish(state, api, q, true);
        else if (state.clock >= q.until) finish(state, api, q, false);
        break;
      }
    }
    if (q.status === 'open' && state.clock >= q.until + 1) finish(state, api, q, false);
  }
}

/** Player-facing view of a quest: label, how-to steps and live progress (shared by HUD and tests). */
export function questView(state, q, bal) {
  const g = q.goal;
  const P = q.prog;
  const left = Math.max(0, q.until - state.clock);
  const now = [];
  let how = [];
  switch (g.type) {
    case 'poweredBy':
      how = [`Connect ${q.name} with a service drop (C) from a pole that has spare capacity.`, `It must have power before ${hh(g.hour)}.`];
      now.push(lit(state.cust[g.id]) ? { cls: 'ok', html: `${q.name} has power` } : { cls: 'todo', html: `${q.name} is still dark` });
      break;
    case 'keepLit': {
      const off = g.ids.filter((id) => state.cust[id]?.dropped && !lit(state.cust[id])).length;
      how = [`Keep the buildings lit from ${hh(g.fromH)} to ${hh(g.toH)}.`, 'Check the transformers feeding them have spare capacity (O for the capacity overlay).', 'Make sure your supply covers the evening peak.'];
      now.push(off ? { cls: 'warn', html: `${off} of them ${off === 1 ? 'is' : 'are'} dark right now` } : { cls: 'ok', html: 'All lit right now' });
      if (P.all) now.push({ cls: 'info', html: `Lit ${Math.round(((P.on || 0) / P.all) * 100)}% of the time so far` });
      break;
    }
    case 'noShed':
      how = [`Don’t let supply run short between ${hh(g.fromH)} and ${hh(g.toH)}.`, 'Start backup supply before the evening peak.'];
      now.push({ cls: 'info', html: 'No one switched off so far' });
      break;
    case 'socAt':
      how = [`Charge your batteries to ${g.pct}% by ${hh(g.hour)}.`, 'Spare solar or wind charges them. In the Supply panel you can hold a battery so it doesn’t discharge.'];
      now.push({ cls: (P.pct || 0) >= g.pct ? 'ok' : 'todo', html: `Batteries at ${Math.round(P.pct || 0)}%` });
      break;
    case 'renewShare':
      how = [`Make at least ${g.pct}% of today’s electricity from sun, wind and water.`, 'Put clean sources first in the generation order (Supply panel).'];
      now.push({ cls: P.all && (P.ren / P.all) * 100 >= g.pct ? 'ok' : 'todo', html: `So far ${P.all ? Math.round((P.ren / P.all) * 100) : 0}% clean` });
      break;
    case 'fossilUnder':
      how = [`Burn less than ${Math.round(g.kWh).toLocaleString('en-US')} kWh of fossil power today.`, 'Run clean sources first and keep fossil units for the peak.'];
      now.push({ cls: (P.fos || 0) < g.kWh ? 'ok' : 'warn', html: `${Math.round(P.fos || 0).toLocaleString('en-US')} kWh used so far` });
      break;
    case 'build':
      how = g.kind === 'drop' ? [`Connect ${g.n} more buildings with service drops (C).`] : [`Build ${g.n} more ${g.kind === 'xfmr' ? 'transformers (T)' : 'poles'}.`];
      now.push({ cls: (P.n || 0) >= g.n ? 'ok' : 'todo', html: `${P.n || 0} of ${g.n} done` });
      break;
  }
  const reward = [q.reward.credits ? `${q.reward.credits.toLocaleString('en-US')} ¢` : null, q.reward.rep ? `+${q.reward.rep} reputation` : null].filter(Boolean).join(' and ');
  return { title: q.title, text: q.text, how, now, left, reward };
}
