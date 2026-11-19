# Round 8 (A): more activity in every stage, ready for ten stages

## What the player asked for
"Need to increase 5 more stages and need more activity in all stages."

Their choices:
- **Stages 6–10:** a world tour of grids.
  - 6: Kalani Island microgrid.
  - 7: Highvale mountain valley.
  - 8: Dunefield desert hydrogen.
  - 9: Twin Cities power market.
  - 10: Continental supergrid.
- **More activity:** all four kinds, i.e. busier towns, more events, daily side tasks and story beats.
- **Delivery:** one stage at a time.

This round (A) delivers the activity for Stages 1–5. Stage 6 follows in round B.

## What was built

### 1. Busier towns (`src/render/life.js`, render only)

| Feature | Detail |
|---|---|
| Traffic | Cars, vans and buses drive both lanes of every road. Density follows the hour: quiet nights, rush at 07–10 and 16–20. Headlights come on after dark, and buses stop every 120 m. Rural Riverside has a few cars; Aurora about 75. |
| People | People walk the pavement outside **buildings that have power** and disappear from dark ones, so power shows in street life. |
| Boats and birds | Boats on open water (Saltmarsh, Aurora). A flock of birds circles by day. |
| Crane | A tower crane stands over a plot while new neighbours are on the way. |
| Market stalls | Stalls with striped awnings line the road during festivals and VIP visits. |
| Draw calls | About 14 instanced draw calls. |
| Frame cost | No measurable cost. Aurora at 08:00 with 47 vehicles, 58 people and 6 boats measures 60 fps with life on and 60 fps with it off. |

Screenshots: `ev-life-rush.jpg`, `r8-vip.jpg`.

### 2. More events per run
- **Decks:** Stage 1 deals 3–4 events (was 2–3). Stages 2–5 deal 7–9 (was 5–6).
- **Gap:** at least 6 h between events.
- **New kinds** (`src/sim/events.js`), each with an alert, an advisor line, a response button and a headline:

| Event | Stages | What happens | Player response |
|---|---|---|---|
| **VIP visit** | All | The mayor, a minister or the prime minister tours a district inside a dashed ring for 3 h. Market stalls go up. | Keep everyone lit: grant and +6 reputation. A cut: −6 and a bad headline. |
| **Wildfire** | 3, 4 | Flames and scorched ground in the zone. Lines and live transformers burn. | **Protect them**: switched-off equipment survives, as in a flood. |
| **Landslide** | 3 | One hour of "rain on the slopes", then up to 2 lines or poles come down. Small camera shake, mud. | Repair. |
| **Cyber alert** | 5 | A security warning card. | Patch now (cost), or risk it: a substation switches off until you **Reset it**. |
| **Dust storm** | 4 | Sand streaks across the screen. Solar parks lose 30% (Saltmarsh) and stay dirty. | **Wash the panels** (a new crew job). |

### 3. Daily side tasks (`src/sim/quests.js`)
- **When:** each morning at 06:00, one or two residents ask a favour. Riverside starts on day 2, after the tutorial.
- **Determinism:** the draw is seeded by run, stage and day, so saves replay exactly.
- **Goal types:**
  - light a building by an hour;
  - keep buildings lit through a window;
  - an evening without cuts;
  - batteries charged by 17:00;
  - a share of clean power;
  - connect N more buildings.
- **Pools:** 5–6 per stage, written for each place, for example:
  - the vaccination day at Millbrook Clinic;
  - the fish auction at Saltmarsh Port;
  - the taxi drivers' charging night in Aurora.
- **Rewards:** credits plus reputation, with a Gazette headline. A missed task is only a gentle note.
- **UI:** a **Today's tasks** section under the objectives, with reward and hours left. Hovering a task opens the same how-to card as an objective, with live progress.

Screenshots: `ev-quests.jpg`, `ev-quest-card.jpg`.

### 4. Story beats
- **Size:** each stage has 5–7 scripted moments over its days.
- **Moments:** some are spoken lines, some are decisions on the existing choice card, labelled "Your decision". For example:
  - the Gazette interview;
  - naming the generator;
  - the line crews' night bonus;
  - the coal workers' last shift;
  - promising a 100% clean day.
- **New recurring cast:** a mayor, Leila the reporter, Tom the union rep, Amira the head teacher, Ravi the shopkeeper and an elder.
- **Local faces:** each stage has its own mayor (Okafor, Dahl, Pritchard, Mensah, Varga) through a per-stage `cast` override.

### 5. Ready for ten stages
- **Campaign screen:** shows "Chapter I · Building the grid" and "Chapter II · Grids of the world" headers once there are more than five stages. The tile grid scrolls.
- **Tests:** the campaign test checks numbering, ids and keys for any number of stages.
- **Still to change:** Stage 5's ending still says the campaign is complete. That line changes in round B, when Stage 6 exists to follow it.

## Verification

| Check | Result |
|---|---|
| `npm test` | **64 / 64.** Includes the new `tests/activity.test.mjs` (9 tests: each new event kind, deck sizes, side-task determinism and replay, reward payout, story beats) and the existing 20-seed reference wins on every stage with the denser decks. |
| `tests/playthrough.js` | Victory, 96 (sustainable), 0 errors, 0 requests. |
| `tests/paths.js` | All true. Restart hash `93fbc202` equals a fresh seed-1337 game. |
| `tests/campaign.js` | All true, 0 errors, 0 requests. |
| `tests/line-overload.js` | Alert, card and fix verified. 0 errors. |
| `tests/stages-visual.js` | Powers 18/18, 15/15, 17/17 and 18/18. 0 errors. |
| `tests/events.js` | All 18 scenarios found and played. They include the 5 new kinds, a story decision, today's tasks and town life. 0 errors, 0 requests. |
| Size / em-dash | 1,150 KB (limit 1.5 MB). 0 em-dashes in the build. |

### Performance note
This Mac was also running Brave and QuickTime during the browser runs, so absolute frame rates were lower than in earlier rounds.

- **Like-for-like comparison:** the committed build from before this round, measured in the same view (Aurora during the cyclone, wide shot), gives the same 41–46 fps as the new build.
- **Town life:** toggling it on and off changes nothing measurable.
- **Settled close and mid views:** 55–60 fps.
- **Conclusion:** this round adds no frame cost. The wide-shot Aurora storm figure should be re-checked on an idle machine.
