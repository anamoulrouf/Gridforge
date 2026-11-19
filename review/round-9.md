# Round 9: Chapter II, Stages 6–10

## What the player asked for
"Need to increase 5 more stages." After Stage 6 they asked to go straight on with 7, 8, 9 and 10. Every new stage includes the round-8 activity systems: 7–9 events per run, daily side tasks, story beats with local characters, and busy towns.

## The new stages

| Stage | Region | What it teaches | Primary goals | Scripted challenge |
|---|---|---|---|---|
| 6 · Island Power | Kalani Island | Fast reserve against the biggest unit; frequency falls and protection switches customers off when reserve is short; grid-forming batteries; engines that burn fuel idling | Grid-forming battery · biggest unit covered for 24 h · lights on through the tanker delay · a 60% sun-and-wind day | Day-2 evening unit trip; fuel tanker held in port on day 3 |
| 7 · Mountain Power | Highvale | Pumped storage (a water battery); run-of-river hydro that follows the snowmelt; ice on lines (current melts it); heating demand in the cold; an electric railway | Pumped storage over the pass at 66 kV · trains and hospital through the cold snap · 36 h without diesel | Day-3 cold snap with freezing rain on the pass |
| 8 · Desert Sun | Dunefield | Green hydrogen (electrolyser, tank, turbine, about 40% round trip); a steel plant's hourly hydrogen contract; heat derating of lines and transformers; dust and panel washing | Hydrogen plant · 95% of the contract over 48 h · two nights without gas · pumps and clinic through the heat record | Day-2 sandstorm; day-4 heat record (about 46 °C) |
| 9 · Power Market | Twin Cities | Hourly wholesale prices; selling surplus abroad; a battery in **Trade** mode (buys below 0.12 ¢, sells above 0.30 ¢); congestion on a full link; price spikes | Sell 12,000 ¢ · a 1,500 ¢ trading day · second market link · reliability ≥ 99.5% | Seeded daily price curve plus spikes |
| 10 · The Supergrid | Continental (Meridian) | HVDC converters bring in Kalani's sun, Highvale's water, Dunefield's early sun and Aurora's wind; geographic smoothing; compound disasters | Four regions connected · 48 h of a clean continent · both hospitals lit through the perfect storm · reliability ≥ 99% | Day 4: cyclone, heat wave and cyber attack together |

Each stage has its own map, buildings, cast (mayor and locals), tutorial, learning cards, briefing, ending, quests, story and event pool.

## Engine additions (shared, opt-in per stage)

### Power solver (`src/sim/power.js`)
- **Reserve:** reports fast reserve and the biggest single unit, and powers the Reserve chip.
- **Under-frequency shedding:** customers can be switched off for a time (`cs.uflsUntil`).
- **Profile sources:** regional HVDC hubs and run-of-river hydro, whose output follows a function of hour, day and weather.
- **Storage limits:** separate charge and discharge rates (`chargeMaxKW`, `dischargeKW`), used for hydrogen.
- **Charging from the grid:** "Charge only" can pump with any power on the grid (`chargeFromGrid`, Highvale).
- **Heat derating:** `heatDerate`, 1% per degree above 35 °C.
- **Market:**
  - `bal.market` gives the price;
  - a market source imports at that hour's price and exports surplus up to its link limit;
  - a Trade battery buys cheap from the grid and sells everything it can when the price is high.
- **Source spur flow:** used for de-icing (`e.srcFlowKW`). It doesn't change overload protection.

### Events (`src/sim/events.js`)
- **Fixed entries:** scripted hazards placed in every run (`events.fixed`).
- **Ice storm:** ice builds on idle lines and melts off lines carrying a quarter of their limit.
- **Price spike:** a new event kind.

### Rendering and UI
- **New renderers:** palm trees, snow caps, a railway with an electric train (it stops when the traction supply is dark), desert ground, the resort and desalination plant, a run-of-river weir, pumped storage, a hydrogen plant and HVDC converter halls.
- **HUD:** Reserve and Diesel chips.
- **Campaign screen:** Chapter I and II headers. Stage 5's ending now leads on to Chapter II, and Stage 10 is the finale.

## Balance: every reference wins on 20 seeds

| Stage | Wins | Score range | Careless plan |
|---|---|---|---|
| 6 | 20 / 20 | 95–97 | Doing nothing and "run every engine" both fail. Wind and sun without the battery miss. |
| 7 | 20 / 20 | 84–91 | Doing nothing fails. |
| 8 | 20 / 20 | 88–90 | Doing nothing fails (the clinic goes dark in the heat). |
| 9 | 20 / 20 | 74–78 | Doing nothing fails. |
| 10 | 20 / 20 | 93–100 | Doing nothing fails. |

Tuning found along the way:
- Kalani's 400 V town trunk tripped every evening; its rating was raised.
- Highvale's snapped pass line was never repaired by the reference, so the responder now handles `iceSnap`. Its clean goal became 36 h and counts only supply shortfalls, not storm damage.
- Dunefield's battery reference pointed at a removed node.
- The trading battery only covered local demand until it was allowed to export.
- The Supergrid's Highvale link was capacity-limited, not energy-limited.

## Verification

| Check | Result |
|---|---|
| `npm test` | **85 / 85.** New files: `tests/stage6.test.mjs` (7 tests) and `tests/chapter2.test.mjs` (9 tests). The 20-seed, telegraphing and save-replay tests now cover all 10 stages. |
| `tests/stages-visual.js` | Stages 2–10: all fully powered by their references. 60 fps settled at 1440×900. 0 errors. |
| `tests/campaign.js` | 10 tiles in two chapters, unlocks in order. Stage 5 → "Next: Stage 6". Stage 10 has no Next. 0 errors, 0 requests. |
| `tests/playthrough.js` | Stage 1 victory, 96 (sustainable). |
| `tests/paths.js` | All true. The restart hash `95472293` equals a fresh seed-1337 game. |
| `tests/events.js`, `tests/line-overload.js` | All scenarios found, 0 errors, 0 requests. |
| Size / em-dash | 1.30 MB (limit 1.5 MB). 0 em-dashes in the build. |

Screenshots: `review/s6-*.jpg` to `review/s10-*.jpg`, `review/camp-11-chapters.jpg` and `review/camp-10-finale.jpg`.
