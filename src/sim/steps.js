// Scripted command steps with references: '@last' (last node built) and '@node:x,z' (node near a point).
// Used for pre-built networks and reference strategies (tests, review "Play ending").
export function runSteps(cmd, state, steps) {
  let last = null;
  const at = (x, z) => Object.keys(state.nodes).find((id) => Math.hypot(state.nodes[id].x - x, state.nodes[id].z - z) < 1.5);
  const failed = [];
  for (const s of steps) {
    const ref = (v) => (v === '@last' ? last : typeof v === 'string' && v.startsWith('@node:') ? at(...v.slice(6).split(',').map(Number)) : v);
    const c = { ...s };
    for (const k of ['from', 'at', 'target', 'node']) if (typeof c[k] === 'string') c[k] = ref(c[k]);
    if (c.to && typeof c.to === 'string') c.to = ref(c.to);
    if (s.type === 'line' && (c.to == null || c.from == null)) {
      failed.push({ step: s, reason: 'badRef' });
      continue;
    }
    const r = cmd(c);
    if (s.type === 'line' && r.ok) last = r.last;
    if ((s.type === 'transformer' || s.type === 'substation' || s.type === 'build') && r.ok) last = r.id;
    if (!r.ok) failed.push({ step: s, reason: r.reason });
  }
  return failed;
}
