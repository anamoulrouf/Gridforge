// Characters, learning panels (GDD §12 template), reactive lines and ending narration (§13).

export const CAST = {
  advisor: { name: 'Grid Advisor', role: 'AI operations assistant', color: '#7cc4f0', initials: 'GA' },
  sofia: { name: 'Sofia Reyes', role: 'Chief grid engineer', color: '#ff9f3a', initials: 'SR' },
  daniel: { name: 'Daniel Carter', role: 'Financial advisor', color: '#74d36b', initials: 'DC' },
  maya: { name: 'Maya Rahman', role: 'Community representative', color: '#ff7eb6', initials: 'MR' },
  mayor: { name: 'Grace Okafor', role: 'Mayor', color: '#b48cf2', initials: 'GO' },
  leila: { name: 'Leila Haddad', role: 'Reporter, the local Gazette', color: '#f2d15c', initials: 'LH' },
  tom: { name: 'Tom Brennan', role: 'Union representative', color: '#e2734e', initials: 'TB' },
  amira: { name: 'Amira Khan', role: 'Head teacher', color: '#5fd3c6', initials: 'AK' },
  ravi: { name: 'Ravi Patel', role: 'Shopkeeper and market trader', color: '#9bd36b', initials: 'RP' },
  nana: { name: 'Nana Adjei', role: 'Oldest resident', color: '#d9b38c', initials: 'NA' },
};

// Learning panel: What happened · Why · What can I do · Real-world connection
export const LEARN = {
  congestion: { title: 'A line is overloaded', what: 'This {tier} line is carrying {load}, but it is rated for {rating}. {who} Protection switches it off after about {mins} min so it doesn’t overheat, and everyone beyond it goes dark.', why: '{why}', todo: ['{fix1}', '{fix2}', '{fix3}', '{fix4}'], real: 'Grid “congestion” is why new factories and power plants often wait years for a connection: the lines to them have to be reinforced first.' },
  firstLight: {
    title: 'First light',
    what: 'Electricity is flowing from the generator, through 11 kV lines and a transformer, into homes at 400 V.',
    why: 'A building lights up only when a complete, working path reaches it and the generator has power to spare.',
    todo: ['Connect the remaining customers (Service drop, C).', 'Open the Capacity overlay (O) to see how loaded each transformer is.', 'Press Space to pause time while you build.'],
    real: 'Real grids work the same way: generation → transmission → distribution, with voltage stepped down near customers.',
  },
  overload: {
    title: 'Transformer overloaded',
    what: '{name} is carrying {kw}, more than its 40 kW limit. If this goes on, it will switch itself off in about an hour.',
    why: 'The evening peak: people come home, so homes use 2.5× their daytime power while the market is still open.',
    todo: ['Split the load: mount a 2nd transformer and move some service drops to it.', 'Remove a few drops for now (those customers go dark, and people notice).', 'Do nothing: it trips, everyone it feeds goes dark, and you reset it after it cools.'],
    real: 'Transformers heat up with load. Protection relays disconnect them before the insulation is damaged.',
  },
  trip: {
    title: 'Protective trip',
    what: '{name} disconnected itself after running above its rating.',
    why: 'Sustained overload heats the windings. The protection opened the circuit to save the transformer.',
    todo: ['Wait about 30 min for it to cool, then press Reset in its panel.', 'Before you reset it, move some of its load. Otherwise it will trip again at the next peak.'],
    real: 'Operators restore service in stages after a trip, so the load doesn’t immediately overload the equipment again.',
  },
  bill: {
    title: 'Your first bill: kW vs kWh',
    what: 'Midnight billing: customers used {kwh} today and paid {rev} at 0.40 ¢ per kWh. Right now demand is {kw}.',
    why: 'kW is a rate (how hard the network works right now). kWh is an amount (how much energy was delivered over time). Bills are for kWh; equipment is sized for peak kW.',
    todo: ['Keep customers powered. Every powered hour earns money.', 'Watch fuel: each kWh costs fuel, and deliveries take 6 hours.'],
    real: 'A 1 kW heater running for 3 hours uses 3 kWh. Utilities bill energy but must build for the peak.',
  },
  fault: {
    title: 'Transformer fault',
    what: '{name} has failed. {count} customers it feeds are without power{clinic}.',
    why: 'Something broke inside: insulation that had been overheating finally gave way. Its safety switch cut it off so the rest of the network stays safe.',
    todo: ['Focus on the transformer and send the repair crew (1 kit + 200 ¢).', 'The crew needs to drive from the depot, then 2 hours on site.', 'The clinic must not be dark for more than 6 hours.'],
    real: 'Outage response: Alert → Locate → Isolate → Repair → Restore → Review. Utilities track restoration time closely.',
  },
  restored: {
    title: 'Power is back: what happened?',
    what: '{name} is repaired and back in service. Restoration took {dur}.',
    why: 'The fault stayed inside one transformer, so only its customers lost power. The rest of the network kept running.',
    todo: ['Preventive maintenance lowers wear-related risk.', 'Pre-dispatching the crew when a unit overheats shortens outages.', 'Keep all 13 customers powered for 24 hours to complete the mission.'],
    real: 'A second route or spare capacity lets grid operators send power around broken equipment.',
  },
  noFuel: {
    title: 'Out of fuel',
    what: 'The generator has stopped: the fuel tank is empty.',
    why: 'Diesel generators burn fuel for every unit of energy they make: here, about 1 unit of fuel per 20 kWh.',
    todo: ['Order fuel from the generator panel (50 units, 250 ¢, arrives in 6 h).', 'The generator restarts automatically when fuel arrives.'],
    real: 'Getting fuel delivered is a real risk for remote towns on diesel. It’s one reason they invest in solar, wind and batteries.',
  },
};

// Reactive comms lines keyed by event.
export const LINES = {
  intro: [['advisor', 'You’re the new operator. 13 customers, 0 powered. Let’s change that.']],
  tutorialDone: [['advisor', 'You know the basics. Connect everyone, and keep an eye on transformer loads before the evening peak.']],
  firstLight: [['maya', 'The clinic’s lights just came on. People are cheering outside!'], ['advisor', 'First power delivered! Every hour with the lights on now earns money.']],
  genRunning: [['sofia', 'Generator at full output. 100 kW available.']],
  forecast: [['sofia', '{name} will hit {kw} this evening, but it’s only built for 40 kW. I’d split that load.']],
  xfmrWarn: [['sofia', '{name} is at {pct} of rating. Keep an eye on it.']],
  trip: [['sofia', '{name} tripped on overload. It needs 30 minutes to cool before we can reset it.'], ['maya', 'Families on that street are in the dark again. What happened?']],
  reset: [['sofia', '{name} is back in service.']],
  bill: [['daniel', 'First day’s takings are in: {rev}. Fuel and staff cost money too, so keep customers powered and the tank topped up.']],
  fuelLow: [['daniel', 'Fuel is under 30 units: about {h} hours left. A delivery takes 6 hours.']],
  noFuel: [['sofia', 'The generator has stopped. It’s out of fuel! Order a delivery now.']],
  delivery: [['sofia', 'Delivery arrived: {qty} {item}.']],
  ordered: [['daniel', 'Order placed: {qty} {item}, arriving in {h} hours.']],
  faultWarn: [['sofia', '{name} is overheating at {temp}. That’s not from load. Something is failing inside. Let’s send the crew now so they’re there when it goes.']],
  fault: [['sofia', '{name} has failed! Its customers are dark. Send the crew.'], ['maya', 'The clinic needs power back. Please hurry.']],
  faultNoClinic: [['sofia', '{name} has failed! Its customers are dark. Send the crew.'], ['maya', 'Those families need their lights back tonight.']],
  crewDispatched: [['sofia', 'Crew on the way to {name}. ETA {eta}.']],
  repairStart: [['sofia', 'Crew on site at {name}. Repair takes about 2 hours.']],
  repaired: [['sofia', '{name} is fixed and back on.'], ['maya', 'The lights are back. Thank you for being so quick.']],
  maintStart: [['sofia', 'Crew servicing {name}. Expect reduced service for an hour.']],
  maintained: [['sofia', '{name} serviced. It’s as good as new.']],
  serviceNudge: [['sofia', 'The generator’s condition is slipping below 85%. A service (150 ¢) keeps it efficient.']],
  marginNudge: [['daniel', 'Revenue is about 0.40 ¢ per kWh; fuel costs about 0.25 ¢. Keep losses low and outages short to stay in the black.']],
  stableStart: [['advisor', 'All 13 customers powered. Hold it for 24 hours to complete the mission.']],
  stableReset: [['advisor', 'Someone lost power, so the 24-hour clock starts again.']],
  clinicWarn: [['maya', 'The clinic has been dark for {h} hours. We’re running out of time.']],
};

export const TUTORIAL = [
  { id: 'gen', title: 'Inspect the generator', body: 'Click the diesel generator at the west edge of town. It can produce up to 100 kW, but it’s off.', target: { world: 'gen' } },
  { id: 'clinic', title: 'Inspect the clinic', body: 'Click the Community Clinic. It needs 12 kW day and night. It’s your most important customer.', target: { world: 'clinic' } },
  { id: 'demand', title: 'Check total demand', body: 'Click the Demand readout in the top bar. Your 13 customers want about 40 kW, and more at the evening peak.', target: { ui: '#chip-demand' } },
  { id: 'tool', title: 'Pick the Line tool', body: 'Press L or click Line in the toolbar.', target: { ui: '#tool-line' } },
  { id: 'mv', title: 'Run 11 kV toward town', body: 'Click the generator, then click near the marker. Poles are added every ≤40 m. Keep clicking to extend the line. Time stands still until you start the generator, so take your time.', target: { world: 'marker', x: -24, z: -8 } },
  { id: 'xfmr', title: 'Mount a transformer', body: 'Press T, then click your last 11 kV pole. It steps 11 kV down to 400 V for buildings.', target: { ui: '#tool-xfmr' } },
  { id: 'lv', title: 'Reach the clinic at 400 V', body: 'With the Line tool, click the transformer and draw toward the clinic. Then press C and click the clinic to add a service drop.', target: { world: 'clinic' } },
  { id: 'start', title: 'Start the generator', body: 'Select the generator and press Start. Watch the power travel.', target: { world: 'gen' } },
  { id: 'rest', title: 'Connect everyone', body: 'Connect the school, market and all homes. Tip: Space pauses time while you build; open the Capacity overlay (O) to check transformer loads before the 18:00 peak.', target: null },
];

export const ENDING = {
  common: [
    'Five days ago this valley went dark at sunset.',
    'Tonight, every window from the school to the market is lit, because your network reaches every one of them.',
  ],
  sustainable: 'You built a grid people can count on: reliable, affordable, and ready to grow.',
  reliable: 'The lights stay on and the books balance. A solid start for what comes next.',
  hardwon: 'It wasn’t easy, and the town noticed the dark nights. But the network stands, and you learned where it bends.',
  decisions: {
    split: 'You split the load before the evening peak, so no transformer was overloaded.',
    preDispatch: 'You sent the crew before the fault, and that cut the outage short.',
    serviced: 'You serviced the generator before wear could cost you.',
    ordered: 'You kept fuel on the way, so the generator never ran dry.',
  },
  next: 'Next: Growing Demand. Prices, different kinds of customers, and a town that won’t stop growing.',
};

// Shared comms for Stages 2–5: Stage 1's lines with the Stage-1-specific numbers generalised.
export const LINES_BASE = {
  ...LINES,
  firstLight: [['advisor', 'First power delivered! Every hour with the lights on now earns money.']],
  genRunning: [['sofia', '{name} is running flat out: {kw} available.']],
  forecast: [['sofia', '{name} will hit {kw} this evening, but it’s only built for {rating}. I’d split that load.']],
  noFuel: [['sofia', '{name} has stopped. It’s out of fuel! Order a delivery now.']],
  serviceNudge: [['sofia', '{name}’s condition is slipping below 85%. A service keeps it efficient.']],
  marginNudge: [],
  stableStart: [],
  stableReset: [],
};
