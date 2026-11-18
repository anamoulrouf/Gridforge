// Mission 1 — "Light the First District" map (GDD §25). Units are metres; north is -z.
// Playable area 320 × 320 m centred on the origin.

export const MISSION1 = {
  id: 'stage1-first-district',
  bounds: { minX: -160, maxX: 160, minZ: -160, maxZ: 160 },

  roads: [
    // axis-aligned rectangles { x, z, w (along x), d (along z) } — centre + size
    { id: 'main', x: 0, z: 0, w: 340, d: 8 },
    { id: 'cross', x: 40, z: 0, w: 7, d: 190 },
    { id: 'yard', x: -103, z: -9, w: 6, d: 10 }, // generator access
    { id: 'depot', x: 112, z: 13, w: 8, d: 18 }, // depot access
  ],

  generator: { id: 'gen', x: -106, z: -22, w: 14, d: 10, port: { x: -98, z: -14 } },
  depot: { id: 'depot', x: 114, z: 28, w: 18, d: 12 },

  customers: [
    // North cluster
    { id: 'h1', type: 'home', name: 'Okafor home', x: -12, z: -18, w: 8, d: 8 },
    { id: 'h2', type: 'home', name: 'Lindqvist home', x: 4, z: -18, w: 8, d: 8 },
    { id: 'h3', type: 'home', name: 'Haddad home', x: 20, z: -18, w: 8, d: 8 },
    { id: 'h4', type: 'home', name: 'Mbeki home', x: 56, z: -20, w: 8, d: 8 },
    { id: 'h5', type: 'home', name: 'Castillo home', x: 56, z: -38, w: 8, d: 8 },
    { id: 'school', type: 'school', name: 'Riverside School', x: 4, z: -42, w: 26, d: 12 },
    // South cluster
    { id: 'clinic', type: 'clinic', name: 'Community Clinic', x: 8, z: 22, w: 16, d: 12 },
    { id: 'market', type: 'market', name: 'Town Market', x: 60, z: 24, w: 18, d: 12 },
    { id: 'h6', type: 'home', name: 'Nguyen home', x: -14, z: 20, w: 8, d: 8 },
    { id: 'h7', type: 'home', name: 'Rahman home', x: -14, z: 38, w: 8, d: 8 },
    { id: 'h8', type: 'home', name: 'Kowalski home', x: 10, z: 42, w: 8, d: 8 },
    { id: 'h9', type: 'home', name: 'Adeyemi home', x: 58, z: 48, w: 8, d: 8 },
    { id: 'h10', type: 'home', name: 'Sato home', x: 80, z: 24, w: 8, d: 8 },
    // surprise: new neighbours on the east lane (appear during some runs)
    { id: 'n1', type: 'home', name: 'Nakamura home (new)', x: 84, z: -20, w: 8, d: 8, surprise: 'lane' },
    { id: 'n2', type: 'home', name: 'Petrov home (new)', x: 100, z: -20, w: 8, d: 8, surprise: 'lane' },
    { id: 'n3', type: 'home', name: 'Silva home (new)', x: 84, z: -38, w: 8, d: 8, surprise: 'lane' },
  ],

  // Reference solution used by tests (and documented in the plan): 13 poles, ~333 m, 2 transformers.
  reference: [
    { type: 'line', from: 'gen', to: { x: -62, z: -8 } },
    { type: 'line', from: '@last', to: { x: -24, z: -8 } },
    { type: 'line', from: '@last', to: { x: 4, z: -8 } },
    { type: 'transformer', at: '@last' },
    { type: 'line', from: '@node:-24,-8', to: { x: -2, z: 10 } },
    { type: 'transformer', at: '@last' },
    // North LV
    { type: 'line', from: '@node:4,-8', to: { x: 28, z: -8 } },
    { type: 'line', from: '@last', to: { x: 50, z: -12 } },
    { type: 'line', from: '@last', to: { x: 50, z: -30 } },
    { type: 'line', from: '@node:4,-8', to: { x: 4, z: -28 } },
    // South LV
    { type: 'line', from: '@node:-2,10', to: { x: -2, z: 30 } },
    { type: 'line', from: '@node:-2,10', to: { x: 24, z: 10 } },
    { type: 'line', from: '@last', to: { x: 48, z: 12 } },
    { type: 'line', from: '@last', to: { x: 72, z: 12 } },
    { type: 'line', from: '@node:48,12', to: { x: 50, z: 36 } },
    // Drops
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'school', 'clinic', 'market', 'h6', 'h7', 'h8', 'h9', 'h10'].map((b) => ({ type: 'drop', building: b })),
  ],
};
