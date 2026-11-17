// Grid graph: nodes (generator, poles, transformers), edges (lines, service drops),
// tier inference and construction validation (GDD §7.3, §9.2, §14 UX rules).
// Pure functions over the sim state — no DOM, no Three.

export const SNAP_R = 5;

/** Voltage tiers, highest first. HV = transmission (lattice towers), MV = 11 kV, LV = 400 V. */
export const TIERS = ['HV', 'MV', 'LV'];
/** Transformer ratios: upper tier / lower tier. A substation is an HV/MV transformer. */
export const RATIO = { 'MV/LV': ['MV', 'LV'], 'HV/MV': ['HV', 'MV'] };
export const ratioOf = (n) => RATIO[n.ratio || 'MV/LV'];
const per = (v, tier) => (v && typeof v === 'object' ? v[tier] : v);

/** Map source definition (generator / plant / farm) for a gen node. */
export function sourceDef(state, id) {
  const m = state.map;
  return (m.sources || []).find((s) => s.id === id) || (state.built && state.built[id]) || (id === 'gen' && m.generator ? { id: 'gen', ...m.generator, tier: 'MV' } : null);
}

export function rectDist(px, pz, r) {
  const dx = Math.max(Math.abs(px - r.x) - r.w / 2, 0);
  const dz = Math.max(Math.abs(pz - r.z) - r.d / 2, 0);
  return Math.hypot(dx, dz);
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Connection point of a node (the generator uses its output port). */
export function nodePos(state, id) {
  const n = state.nodes[id];
  if (!n) return null;
  if (n.kind === 'gen') {
    const s = sourceDef(state, id);
    return s?.port || n;
  }
  return n;
}

/** What tier a new line starting at `node` carries. */
export function startTier(node, override) {
  if (node.kind === 'gen') return node.tier || 'MV';
  if (node.kind === 'pole') return node.tier;
  if (node.kind === 'xfmr') {
    const [up, lo] = ratioOf(node);
    return override === up || override === 'up' ? up : lo;
  }
  if (node.kind === 'switch') return node.tier;
  return null;
}

/** Can `node` accept an edge of `tier`? Returns null if ok, else reason key. */
export function acceptTier(node, tier) {
  if (node.kind === 'gen') return tier === (node.tier || 'MV') ? null : node.tier === 'HV' ? 'tierGenHV' : node.tier === 'LV' ? 'tierGenLVOnly' : 'tierGenLV';
  if (node.kind === 'pole' || node.kind === 'switch') return node.tier === tier ? null : 'tierMismatch';
  if (node.kind === 'xfmr') return ratioOf(node).includes(tier) ? null : node.ratio === 'HV/MV' ? 'tierSubLV' : 'tierXfmrHV';
  return 'badTarget';
}

/** Reason key if a support (pole/transformer) can't stand at (x,z), else null. */
export function siteBlocked(state, x, z, ignoreIds = []) {
  const m = state.map;
  const b = m.bounds;
  if (x < b.minX + 4 || x > b.maxX - 4 || z < b.minZ + 4 || z > b.maxZ - 4) return 'outOfBounds';
  for (const r of m.roads) if (rectDist(x, z, r) < 0.6) return 'onRoad';
  for (const c of m.customers) if (rectDist(x, z, c) < 1.5) return 'onBuilding';
  if (m.generator && rectDist(x, z, m.generator) < 1.5) return 'onBuilding';
  for (const s of m.sources || []) if (s.w && rectDist(x, z, s) < 1.5) return 'onBuilding';
  for (const s of m.sites || []) if (rectDist(x, z, s) < 1.0) return 'onSite';
  for (const w of m.water || []) if (rectDist(x, z, w) < 0.5) return 'onWater';
  if (rectDist(x, z, m.depot) < 1.5) return 'onBuilding';
  for (const id in state.nodes) {
    if (ignoreIds.includes(id)) continue;
    const n = state.nodes[id];
    if (n.kind === 'gen') continue;
    if (dist(n, { x, z }) < 3) return 'tooClose';
  }
  return null;
}

/** Find an existing network node near a point. */
export function nodeAt(state, x, z, r = SNAP_R) {
  let best = null;
  let bd = r;
  for (const id in state.nodes) {
    const p = nodePos(state, id);
    const n = state.nodes[id];
    const sd = n.kind === 'gen' ? sourceDef(state, id) : null;
    const d = n.kind === 'gen' ? Math.min(dist(p, { x, z }), sd && sd.w ? rectDist(x, z, sd) : Infinity) : dist(p, { x, z });
    if (d <= bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

export function buildingAt(state, x, z) {
  for (const c of state.map.customers) if (rectDist(x, z, c) < 0.01) return c.id;
  return null;
}

export function edgeBetween(state, a, b) {
  for (const id in state.edges) {
    const e = state.edges[id];
    if (e.kind === 'line' && ((e.a === a && e.b === b) || (e.a === b && e.b === a))) return id;
  }
  return null;
}

/**
 * Plan a line from node `fromId` to `to` (node id or {x,z}).
 * Returns { ok, reason, tier, points:[{x,z}], newPoles, meters, cost, toId, endNew }.
 * `points` includes start and end; interior points are auto-placed poles.
 */
export function planLine(state, bal, fromId, to, tierOverride) {
  const from = state.nodes[fromId];
  const res = { ok: false, reason: null, tier: null, points: [], newPoles: 0, meters: 0, cost: 0, toId: null, endNew: false };
  if (!from) return { ...res, reason: 'noStart' };
  const tier = startTier(from, tierOverride);
  res.tier = tier;
  const a = nodePos(state, fromId);

  let toId = null;
  let end;
  if (typeof to === 'string') {
    toId = to;
  } else {
    toId = nodeAt(state, to.x, to.z);
    if (toId === fromId) toId = null;
  }
  if (toId) {
    if (toId === fromId) return { ...res, reason: 'sameNode' };
    const tn = state.nodes[toId];
    if (!tn) return { ...res, reason: 'badTarget' };
    const r = acceptTier(tn, tier);
    if (r) return { ...res, reason: r, toId };
    if (edgeBetween(state, fromId, toId)) return { ...res, reason: 'alreadyConnected', toId };
    end = nodePos(state, toId);
  } else {
    end = { x: Math.round(to.x * 2) / 2, z: Math.round(to.z * 2) / 2 };
    if (buildingAt(state, end.x, end.z)) return { ...res, reason: 'endOnBuilding', points: [a, end] };
    const blk = siteBlocked(state, end.x, end.z);
    if (blk) return { ...res, reason: blk, points: [a, end] };
    res.endNew = true;
  }
  res.toId = toId;

  const L = dist(a, end);
  if (L < 3) return { ...res, reason: 'tooShort', points: [a, end] };
  const maxSpan = per(bal.network.maxSpan, tier);
  let spans = Math.max(1, Math.ceil(L / maxSpan - 1e-9));
  let points = null;
  // Try equal spacing; if an interior pole lands on a road/building, add a span and retry.
  for (let extra = 0; extra < 4 && !points; extra++) {
    const n = spans + extra;
    const pts = [a];
    let bad = false;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const p = { x: a.x + (end.x - a.x) * f, z: a.z + (end.z - a.z) * f };
      if (siteBlocked(state, p.x, p.z, [fromId, toId].filter(Boolean))) {
        bad = true;
        break;
      }
      pts.push(p);
    }
    if (!bad) {
      pts.push(end);
      points = pts;
    }
  }
  if (!points) return { ...res, reason: 'interiorBlocked', points: [a, end] };

  res.points = points;
  res.newPoles = points.length - 2 + (res.endNew ? 1 : 0);
  res.meters = Math.ceil(L);
  res.cost = res.newPoles * per(bal.costs.pole, tier) + res.meters * per(bal.costs.cablePerM, tier);

  const inv = state.inv;
  if (tier === 'HV') {
    // HV towers and conductor are procured per project (credits only), not from pole/cable stock
    res.hv = true;
  } else {
    if (inv.poles < res.newPoles) return { ...res, reason: 'noPoles' };
    if (inv.cable < res.meters) return { ...res, reason: 'noCable' };
  }
  if (state.credits < res.cost) return { ...res, reason: 'noCredits' };
  res.ok = true;
  return res;
}

/** Can a service drop hang from this node? (400 V poles and MV/LV transformers) */
export const isLVNode = (n) => (n.kind === 'pole' && n.tier === 'LV') || (n.kind === 'xfmr' && (n.ratio || 'MV/LV') === 'MV/LV');
/** Large customers (industry) connect at 11 kV: to an MV pole or a substation's 11 kV side. */
export const isMVNode = (n) => (n.kind === 'pole' && n.tier === 'MV') || (n.kind === 'xfmr' && n.ratio === 'HV/MV');
/** Connection tier of a customer (LV unless its type says MV). */
export const custTier = (state, c) => (state.map.mvTypes || []).includes(c.type) ? 'MV' : 'LV';
const canFeed = (state, n, c) => (custTier(state, c) === 'MV' ? isMVNode(n) : isLVNode(n));
const reachOf = (state, bal, c) => (custTier(state, c) === 'MV' ? bal.network.mvDropReach ?? 30 : bal.network.dropReach);

/** LV-capable nodes (LV poles and transformers) within reach of building footprint, nearest first. */
export function lvNodesInReach(state, bal, buildingId) {
  const c = state.map.customers.find((b) => b.id === buildingId);
  const out = [];
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (!canFeed(state, n, c)) continue;
    const d = rectDist(n.x, n.z, c);
    if (d <= reachOf(state, bal, c)) out.push({ id, d });
  }
  out.sort((p, q) => p.d - q.d || (p.id < q.id ? -1 : 1));
  return out;
}

export function dropOf(state, buildingId) {
  for (const id in state.edges) {
    const e = state.edges[id];
    if (e.kind === 'drop' && e.b === buildingId) return id;
  }
  return null;
}

export function planDrop(state, bal, buildingId, fromId) {
  const c = state.map.customers.find((b) => b.id === buildingId);
  if (!c) return { ok: false, reason: 'badTarget' };
  if (state.cust[buildingId] && state.cust[buildingId].active === false) return { ok: false, reason: 'notBuiltYet' };
  if (dropOf(state, buildingId)) return { ok: false, reason: 'alreadyDropped' };
  let src = null;
  if (fromId) {
    const n = state.nodes[fromId];
    if (!n || !canFeed(state, n, c)) return { ok: false, reason: custTier(state, c) === 'MV' ? 'dropNeedsMV' : 'dropNeedsLV' };
    if (rectDist(n.x, n.z, c) > reachOf(state, bal, c)) return { ok: false, reason: 'dropOutOfReach' };
    src = fromId;
  } else {
    const list = lvNodesInReach(state, bal, buildingId);
    if (!list.length) return { ok: false, reason: custTier(state, c) === 'MV' ? 'noMVInReach' : 'noLVInReach' };
    src = list[0].id;
  }
  if (state.credits < bal.costs.drop) return { ok: false, reason: 'noCredits' };
  return { ok: true, from: src, cost: bal.costs.drop };
}

/** Plan converting a pole/tower (or empty ground) into a transformer (MV/LV) or substation (HV/MV). */
export function planTransformer(state, bal, at, sub = false) {
  const invKey = sub ? 'substations' : 'transformers';
  const cost = sub ? bal.costs.substation : bal.costs.transformer;
  const upper = sub ? 'HV' : 'MV';
  if (!((state.inv[invKey] || 0) >= 1)) return { ok: false, reason: sub ? 'noSubstations' : 'noTransformers' };
  if (state.credits < cost) return { ok: false, reason: 'noCredits' };
  if (typeof at === 'string') {
    const n = state.nodes[at];
    if (!n) return { ok: false, reason: 'badTarget' };
    if (n.kind === 'xfmr') return { ok: false, reason: 'alreadyXfmr' };
    if (n.kind === 'gen') return { ok: false, reason: 'xfmrOnGen' };
    if (n.tier !== upper) return { ok: false, reason: sub ? 'subOnLower' : n.tier === 'HV' ? 'xfmrOnHV' : 'xfmrOnLV' };
    return { ok: true, node: at, cost, ratio: sub ? 'HV/MV' : 'MV/LV' };
  }
  const near = nodeAt(state, at.x, at.z);
  if (near) return planTransformer(state, bal, near, sub);
  const blk = siteBlocked(state, at.x, at.z);
  if (blk) return { ok: false, reason: blk };
  return { ok: true, point: { x: Math.round(at.x * 2) / 2, z: Math.round(at.z * 2) / 2 }, cost, ratio: sub ? 'HV/MV' : 'MV/LV' };
}

/** Bus id for an edge endpoint: transformers have an upper (:hv) and a lower (:lv) bus. */
export function busOf(state, nodeId, tier) {
  const n = state.nodes[nodeId];
  if (n.kind === 'xfmr') return nodeId + (tier === ratioOf(n)[0] ? ':hv' : ':lv');
  return nodeId;
}

/** Rating (kW) of a line of `tier`, or of a transformer node. */
export function lineRating(bal, tier) {
  return per(bal.network.ratingKW, tier) ?? (tier === 'MV' ? bal.network.mvRatingKW : bal.network.lvRatingKW);
}
export function xfmrRating(bal, n) {
  return n.ratingKW || (n.ratio === 'HV/MV' ? bal.substation.ratingKW : bal.transformer.ratingKW);
}

export function xfmrAvailable(n) {
  return n.state === 'ok';
}
