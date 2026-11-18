# Gridforge — a five-stage electricity-network campaign

A 3D electricity-network strategy game built from `reso/Gridforge_Game_Design_Document.html`, in the warm toy-diorama art style of `reso/graphic/`. Hover any objective in the left rail for step-by-step help and a live status read-out. Left-drag pans the map; the wheel zooms; Q/E rotate.

**Play:** open `dist/gridforge.html` in a modern browser. It's a single offline file (no network, no external assets). **Campaign** on the main menu lists the stages; each unlocks when you finish the one before it (Settings → *Unlock all stages* opens them all).

| Stage | Region | New systems |
|---|---|---|
| 1 · Light the First District | Riverside | Generation → distribution, kW vs kWh, transformer capacity, faults and repairs |
| 2 · Millbrook Grows | Millbrook | Customer classes and tariffs, trust, affordability, daily statements, growth, heat wave, storm damage |
| 3 · The Ironvale Corridor | Ironvale | 66 kV transmission, substations, congestion, an industrial contract with penalties, coal vs gas dispatch, inspections |
| 4 · Saltmarsh Coast | Saltmarsh | Solar, wind, hydro and batteries driven by the weather, prosumers, emissions, coal retirement, storm and calm days |
| 5 · Aurora | Aurora | Smart EV charging, V2G, demand response, efficiency, self-healing feeders, a full day of 100 % clean power |

## Build & test
```bash
npm install
node build.mjs          # → dist/gridforge.html
npm test                # simulation unit tests (node:test): Stage 1 + campaign
```
Browser regression scripts are Playwright functions run with the page at `?test=1`. Serve `dist/` first with `node serve.mjs` (http://localhost:4173/gridforge.html, local only).
- `tests/playthrough.js` and `tests/paths.js` cover Stage 1.
- `tests/campaign.js` drives the campaign shell and each stage's new tools through the real UI.
- `tests/stages-visual.js` captures review screenshots and fps for Stages 2–5.

## Layout
- `src/sim/` — deterministic simulation: grid graph, power solver, weather, economy, and replayable step scripts. No DOM or Three.js.
- `src/missions/` — one file per stage. Each holds the map, balance, objectives with guide cards, the director (scripted events), tutorial, dialogue, ending and reference strategy.
- `src/render/` — Three.js scene, network visuals, world builders (statically batched), people and particles.
- `src/ui/`, `src/audio/` — HUD, inspector panels, menus and campaign screen, procedural audio.
- `src/data/` — shared balance numbers, strings and dialogue.
- `review/` — rubrics, review rounds and screenshots. The latest round is `review/round-5.md`.
