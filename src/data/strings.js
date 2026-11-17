// All player-facing UI text, by key (GDD §17 localization-ready).
export const S = {
  title: 'GRIDFORGE',
  tagline: 'Build the grid. Power the people. Shape the future.',
  stageName: 'Stage 1 · The Beginning',
  missionName: 'Light the First District',
  skip: 'Press any key or click to skip',

  menu: { continue: 'Continue', newGame: 'New Game', howTo: 'How to Play', settings: 'Settings', credits: 'Credits', quit: 'Quit' },

  reasons: {
    noStart: 'Start from the generator, a pole or a transformer.',
    sameNode: 'Pick a different end point.',
    badTarget: 'That can’t be connected here.',
    tierGenLV: 'The generator outputs 11 kV — it can only take an 11 kV (MV) line.',
    tierMismatch: '11 kV (MV) and 400 V (LV) can’t join directly — put a transformer in between.',
    alreadyConnected: 'These two are already connected.',
    endOnBuilding: 'Lines don’t attach to buildings — use the Service drop tool (C) from a 400 V pole.',
    outOfBounds: 'Outside the service area.',
    onRoad: 'Poles can’t stand on the road — place it on the verge.',
    onBuilding: 'Too close to a building for a pole.',
    tooClose: 'Too close to another pole — click the pole itself to connect to it.',
    tooShort: 'Too short — drag further.',
    interiorBlocked: 'A support pole would land on a road or building. Add a waypoint first.',
    noPoles: 'Out of poles — order more from the depot.',
    noCable: 'Not enough cable — order more from the depot.',
    noCredits: 'Not enough credits.',
    alreadyDropped: 'This building already has a service drop.',
    dropNeedsLV: 'Service drops come from a 400 V (LV) pole or a transformer.',
    dropOutOfReach: 'That pole is too far from the building (max 22 m).',
    noLVInReach: 'No 400 V pole within 22 m. Run a 400 V line closer first.',
    noTransformers: 'No transformers left in stock.',
    alreadyXfmr: 'There is already a transformer here.',
    xfmrOnGen: 'Place the transformer on an 11 kV pole, not on the generator.',
    xfmrOnLV: 'Transformers step 11 kV down to 400 V — place it on an 11 kV (MV) pole.',
    cantRemoveGen: 'The generator can’t be removed.',
    crewOnSite: 'The crew is working on this asset.',
    alreadyRunning: 'The generator is already running.',
    noFuel: 'No fuel — order a delivery first.',
    alreadyOff: 'The generator is already off.',
    tankFull: 'The fuel tank can’t hold that much (max 150 units incl. deliveries).',
    notTripped: 'This transformer isn’t tripped.',
    cooling: 'Still cooling down after the trip.',
    nothingToRepair: 'Nothing to repair.',
    alreadyDispatched: 'The crew is already assigned to this.',
    noKits: 'No repair kits — order one from the depot.',
    useRepair: 'This unit is failing — send a repair crew instead.',
    noneInReach: 'No unconnected buildings within 22 m of this pole.',
    missionOver: 'The mission is over.',
    unknownCommand: 'Unknown action.',
  },

  status: {
    unconnected: { label: 'Not connected', why: 'No service drop. Use Service drop (C) from a 400 V pole within 22 m.' },
    nopath: { label: 'No route to supply', why: 'Its 400 V line doesn’t reach the generator through a transformer and the 11 kV network.' },
    xfmrDown: { label: 'Transformer out', why: 'The transformer feeding it is out of service.' },
    noFuel: { label: 'Generator out of fuel', why: 'The generator has run dry. Order fuel at the generator.' },
    genOff: { label: 'Generator off', why: 'The network is connected but the generator isn’t running.' },
    shed: { label: 'Load shed', why: 'Not enough supply right now — your load-shed policy disconnected it.' },
    partial: { label: 'Under-supplied', why: 'Supply is short, so everyone is getting a reduced share.' },
    on: { label: 'Powered', why: 'Receiving full power through a valid path.' },
  },

  xfmrState: { ok: 'In service', trip: 'Tripped (overload)', fault: 'FAULT', maint: 'Maintenance' },
  genState: { off: 'Off', starting: 'Starting…', running: 'Running', nofuel: 'Out of fuel' },

  tools: {
    select: { name: 'Select', key: 'V', hint: 'Click anything to inspect it. Drag with right mouse or WASD to pan, wheel to zoom, Q/E to rotate.' },
    line: { name: 'Line', key: 'L', hint: 'Click the generator, a pole or a transformer, then click where the line goes — poles are added every ≤40 m. Keep clicking to extend; right-click to stop.' },
    xfmr: { name: 'Transformer', key: 'T', hint: 'Click an 11 kV (MV) pole to mount a transformer (600 ¢). Lines drawn from it carry 400 V.' },
    drop: { name: 'Service drop', key: 'C', hint: 'Click a building to connect it to the nearest 400 V pole within 22 m (15 ¢) — or click a 400 V pole to connect every building in reach.' },
    remove: { name: 'Remove', key: 'X', hint: 'Click a pole, line, drop or transformer to remove it. Refunds 50% of credits and returns materials.' },
    overlay: { name: 'Overlay', key: 'O', hint: 'Cycle map overlays: Flow · Capacity · Voltage · Condition · Outages.' },
  },
  overlays: { flow: 'Power flow', capacity: 'Capacity / load %', tier: 'Voltage tier', condition: 'Asset condition', outages: 'Outages & reasons' },

  objectives: {
    inspect: 'Inspect the generator and total demand',
    route: 'Build an 11 kV route from the generator',
    xfmr: 'Place and connect a transformer',
    connect: 'Connect school, clinic, market and homes',
    start: 'Start the generator and meet demand',
    revenue: 'Earn your first day of revenue',
    fault: 'Respond to the transformer fault',
    stable: 'Keep all 13 customers powered for 24 h',
    service: 'Optional · Service the generator',
    losses: 'Optional · Keep losses under 5%',
  },

  failCause: {
    fuel: { title: 'The generator ran dry', body: 'Fuel ran out and no delivery was on its way for 3 hours, so the town stayed dark.', tip: 'Watch the fuel gauge and order a delivery (6 h lead time) when it drops below ~40 units.' },
    clinic: { title: 'The clinic lost power for too long', body: 'The Community Clinic was without power for 6 hours. Critical services need priority.', tip: 'Restore the clinic first: repair or reset its transformer, or check its route and fuel.' },
    bankrupt: { title: 'Out of money', body: 'Credits ran out before the network could earn revenue.', tip: 'Plan the shortest route first and power customers early so billing starts.' },
    deadline: { title: 'Out of time', body: 'The district wasn’t stable by the end of day 5.', tip: 'Connect everyone early, split load across transformers, and respond to faults quickly.' },
  },

  endings: {
    sustainable: 'Sustainable Grid',
    reliable: 'Reliable Grid',
    hardwon: 'Hard-won Grid',
  },

  help: {
    controls: [
      ['Left click', 'Select · place · confirm'],
      ['Right click', 'Cancel current tool (right-drag pans)'],
      ['W A S D / arrows / screen edge', 'Pan camera'],
      ['Mouse wheel', 'Zoom'],
      ['Q / E', 'Rotate camera 90°'],
      ['Home', 'Reset camera'],
      ['Space', 'Pause / resume time'],
      ['1 / 2 / 3', 'Speed ×1 / ×2 / ×3'],
      ['Esc', 'Pause menu (closes dialogs first)'],
      ['Delete / Backspace', 'Remove selected asset (asks first)'],
      ['V L T C X O', 'Select · Line · Transformer · Service drop · Remove · Overlay'],
    ],
    building: [
      'The generator outputs <b>11 kV</b> (medium voltage, MV). Homes use <b>400 V</b> (low voltage, LV).',
      'Use the <b>Line</b> tool from the generator to bring 11 kV toward town. Poles are added automatically every 40 m or less.',
      'Mount a <b>Transformer</b> on an 11 kV pole. Lines drawn out of a transformer carry 400 V.',
      'Connect each building with a <b>Service drop</b> from a 400 V pole within 22 m.',
      'A line touching a building does nothing — a building lights up only when real power reaches it.',
      'Each transformer is rated <b>40 kW</b>. Split the town between transformers so none is overloaded at the evening peak.',
    ],
    basics: [
      '<b>Power (kW)</b> is how fast electricity is used right now. <b>Energy (kWh)</b> is power over time — customers are billed for kWh.',
      '<b>Demand</b> changes through the day: homes peak in the evening, the school and market by day, the clinic never stops.',
      '<b>Capacity</b> is the most an asset can safely carry. Overloaded transformers heat up and trip to protect themselves.',
      '<b>Losses</b>: some energy turns to heat in lines and transformers (a simplified model in this game).',
      '<b>Fuel</b>: the diesel generator burns 1 unit per ~20 kWh. Deliveries take 6 hours.',
    ],
    objectives: [
      'Connect all 13 customers and start the generator.',
      'Earn revenue — bills are paid each midnight at 0.40 ¢/kWh.',
      'Maintain your assets and respond to faults: find, isolate, repair, restore.',
      'Win by keeping all 13 powered for 24 hours after the fault is repaired (by the end of day 5).',
      'You fail if the clinic is dark for 6 h, fuel runs out with nothing on order for 3 h, or money runs out before you can earn.',
    ],
  },

  credits: [
    ['Design & development', 'Gridforge team'],
    ['Built with', 'Three.js (MIT) · WebAudio · hand-written simulation'],
    ['Art & audio', 'Procedurally generated in the browser — no external assets'],
    ['Note', 'Numbers are simplified, illustrative values (GDD §20) — not engineering data.'],
  ],
};

export const fmt = {
  kw: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} kW`,
  kwh: (v) => `${v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')} kWh`,
  cr: (v) => `${Math.round(v).toLocaleString('en-US')} ¢`,
  pct: (v) => `${Math.round(v)}%`,
  clock: (c) => {
    const d = Math.floor(c / 1440) + 1;
    const h = Math.floor((c % 1440) / 60);
    const m = Math.floor(c % 60);
    return { day: d, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  },
  dur: (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`),
};
