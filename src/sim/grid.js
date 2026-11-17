// Grid graph: nodes (generator, poles, transformers), edges (lines, service drops),
// tier inference and construction validation (GDD §7.3, §9.2, §14 UX rules).
// Pure functions over the sim state — no DOM, no Three.

export const SNAP_R = 5;

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
  return n.kind === 'gen' ? state.map.generator.port : n;
}

/** What tier a new line starting at `node` carries. */
export function startTier(node, override) {
  if (node.kind === 'gen') return 'MV';
  if (node.kind === 'pole') return node.tier;
  if (node.kind === 'xfmr') return override === 'MV' ? 'MV' : 'LV';
  return null;
}

/** Can `node` accept an edge of `tier`? Returns null if ok, else reason key. */
export function acceptTier(node, tier) {
  if (node.kind === 'gen') return tier === 'MV' ? null : 'tierGenLV';
  if (node.kind === 'pole') return node.tier === tier ? null : 'tierMismatch';
  if (node.kind === 'xfmr') return null;
  return 'badTarget';
}

/** Reason key if a support (pole/transformer) can't stand at (x,z), else null. */
export function siteBlocked(state, x, z, ignoreIds = []) {
  const m = state.map;
  const b = m.bounds;
  if (x < b.minX + 4 || x > b.maxX - 4 || z < b.minZ + 4 || z > b.maxZ - 4) return 'outOfBounds';
  for (const r of m.roads) if (rectDist(x, z, r) < 0.6) return 'onRoad';
  for (const c of m.customers) if (rectDist(x, z, c) < 1.5) return 'onBuilding';
  if (rectDist(x, z, m.generator) < 1.5) return 'onBuilding';
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
    const d = n.kind === 'gen' ? Math.min(dist(p, { x, z }), rectDist(x, z, state.map.generator)) : dist(p, { x, z });
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
  const maxSpan = bal.network.maxSpan;
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
  res.cost = res.newPoles * bal.costs.pole + res.meters * bal.costs.cablePerM;

  const inv = state.inv;
  if (inv.poles < res.newPoles) return { ...res, reason: 'noPoles' };
  if (inv.cable < res.meters) return { ...res, reason: 'noCable' };
  if (state.credits < res.cost) return { ...res, reason: 'noCredits' };
  res.ok = true;
  return res;
}

/** LV-capable nodes (LV poles and transformers) within reach of building footprint, nearest first. */
export function lvNodesInReach(state, bal, buildingId) {
  const c = state.map.customers.find((b) => b.id === buildingId);
  const out = [];
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (!((n.kind === 'pole' && n.tier === 'LV') || n.kind === 'xfmr')) continue;
    const d = rectDist(n.x, n.z, c);
    if (d <= bal.network.dropReach) out.push({ id, d });
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
  if (dropOf(state, buildingId)) return { ok: false, reason: 'alreadyDropped' };
  let src = null;
  if (fromId) {
    const n = state.nodes[fromId];
    if (!n || !((n.kind === 'pole' && n.tier === 'LV') || n.kind === 'xfmr')) return { ok: false, reason: 'dropNeedsLV' };
    if (rectDist(n.x, n.z, c) > bal.network.dropReach) return { ok: false, reason: 'dropOutOfReach' };
    src = fromId;
  } else {
    const list = lvNodesInReach(state, bal, buildingId);
    if (!list.length) return { ok: false, reason: 'noLVInReach' };
    src = list[0].id;
  }
  if (state.credits < bal.costs.drop) return { ok: false, reason: 'noCredits' };
  return { ok: true, from: src, cost: bal.costs.drop };
}

/** Plan converting a pole (or empty ground) into a transformer. */
export function planTransformer(state, bal, at) {
  if (state.inv.transformers < 1) return { ok: false, reason: 'noTransformers' };
  if (state.credits < bal.costs.transformer) return { ok: false, reason: 'noCredits' };
  if (typeof at === 'string') {
    const n = state.nodes[at];
    if (!n) return { ok: false, reason: 'badTarget' };
    if (n.kind === 'xfmr') return { ok: false, reason: 'alreadyXfmr' };
    if (n.kind === 'gen') return { ok: false, reason: 'xfmrOnGen' };
    if (n.tier !== 'MV') return { ok: false, reason: 'xfmrOnLV' };
    return { ok: true, node: at, cost: bal.costs.transformer };
  }
  const near = nodeAt(state, at.x, at.z);
  if (near) return planTransformer(state, bal, near);
  const blk = siteBlocked(state, at.x, at.z);
  if (blk) return { ok: false, reason: blk };
  return { ok: true, point: { x: Math.round(at.x * 2) / 2, z: Math.round(at.z * 2) / 2 }, cost: bal.costs.transformer };
}

/** Bus id for an edge endpoint: transformers have HV and LV buses. */
export function busOf(state, nodeId, tier) {
  const n = state.nodes[nodeId];
  if (n.kind === 'xfmr') return nodeId + (tier === 'MV' ? ':hv' : ':lv');
  return nodeId;
}

export function xfmrAvailable(n) {
  return n.state === 'ok';
}
