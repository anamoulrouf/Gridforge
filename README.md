# Gridforge: a ten-stage electricity-network campaign

A 3D electricity-network strategy game built from `reso/Gridforge_Game_Design_Document.html`, in the warm toy-diorama art style of `reso/graphic/`. Hover any objective in the left rail for step-by-step help and a live status read-out. Left-drag pans the map; the wheel zooms; Q/E rotate.

**Play:** open `dist/gridforge.html` in a modern browser. It's a single offline file (no network, no external assets). **Campaign** on the main menu lists the stages; each unlocks when you finish the one before it (Settings → *Unlock all stages* opens them all).

| Stage | Region | New systems |
|---|---|---|
| 1 · Light the First District | Riverside | Generation → distribution, kW vs kWh, transformer capacity, faults and repairs |
| 2 · Millbrook Grows | Millbrook | Customer classes and tariffs, trust, affordability, daily statements, growth, heat wave, storm damage |
| 3 · The Ironvale Corridor | Ironvale | 66 kV transmission, substations, congestion, an industrial contract with penalties, coal vs gas dispatch, inspections |
| 4 · Saltmarsh Coast | Saltmarsh | Solar, wind, hydro and batteries driven by the weather, prosumers, emissions, coal retirement, storm and calm days |
| 5 · Aurora | Aurora | Smart EV charging, V2G, demand response, efficiency, self-healing feeders, a full day of 100 % clean power |
| 6 · Kalani Island | Kalani | Fast reserve and the biggest unit, frequency and automatic load shedding, grid-forming batteries, a delayed fuel tanker |
| 7 · Highvale | Highvale | Pumped hydro storage, run-of-river hydro, ice on lines and de-icing with current, an electric railway, a cold snap |
| 8 · Dunefield | Dunefield | Green hydrogen (electrolyser, tank, turbine), a hydrogen supply contract, heat derating, dust storms |
| 9 · Twin Cities | Twin Cities | Hourly market prices, selling surplus abroad, battery trading, congestion on a full link, price spikes |
| 10 · Continental | Meridian | HVDC links to every region, geographic smoothing, a two-day clean continent, the "perfect storm" finale |

Stages 1–5 are Chapter I (building the grid); Stages 6–10 are Chapter II (grids of the world).

## Every run is different
Each playthrough draws its own events from the region (3–4 in Stage 1, 7–9 in later stages): floods, a tsunami, earthquakes, a cyclone, wildfires, landslides, dust storms, thunderstorms, heat waves, blackouts, failing transformers, cable thieves, hackers, safety inspections, VIP visits, new neighbours and whole new localities, festivals, sponsorship offers, community requests and protests. Dangers are announced ahead of time (earthquakes excepted) with a one-click response. A **Reputation** chip, the **Community** panel and **The Gazette** show what people think of you, and it counts towards your score. Restart keeps the same events; New Game deals new ones.

Every morning residents ask for one or two **side tasks** ("Light the market by 18:00", "Keep the clinic lit tonight"), shown under *Today's tasks* with a reward in credits and reputation. Each stage also has a short **story** told by its people (the mayor, a reporter, a union rep, the head teacher, a shopkeeper), some with decisions. Towns are alive: traffic follows the hour, people walk outside buildings that have power, boats cross the water, birds circle, and cranes rise over plots about to be built.

## Build & test
```bash
npm install
node build.mjs          # → dist/gridforge.html
npm test                # unit tests: every stage, run events, activity (about 15 min)
node serve.mjs          # http://localhost:4173/gridforge.html
```
Browser regression scripts are Playwright functions run with the page at `?test=1`. Serve `dist/` first with `node serve.mjs` (http://localhost:4173/gridforge.html, local only).
- `tests/playthrough.js` and `tests/paths.js` cover Stage 1.
- `tests/campaign.js` drives the campaign shell and each stage's new tools through the real UI.
- `tests/stages-visual.js` captures review screenshots and fps for Stages 2–10.
- `tests/events.js` plays a disaster, surprise, request and festival in every stage, every round-8 event kind, today's tasks and town life.
- `tests/line-overload.js` checks the overload explanation and its fix.

## Layout
- `src/sim/`: deterministic simulation: grid graph, power solver, weather, economy, run events (`events.js`), daily side tasks (`quests.js`), and replayable step scripts. No DOM or Three.js.
- `src/missions/`: one file per stage. Each holds the map, balance, objectives with guide cards, the director (scripted events), tutorial, dialogue, ending and reference strategy.
- `src/render/`: Three.js scene, network visuals, world builders (statically batched), people, town life (`life.js`), hazards and particles.
- `src/ui/`, `src/audio/`: HUD, inspector panels, menus and campaign screen, procedural audio.
- `src/data/`: shared balance numbers, strings and dialogue.
- `review/`: rubrics, review rounds and screenshots. The latest round is `review/round-9.md`. Copy rules: `review/COPY-STYLE.md`.
