# Round 3: diorama art style + objective guide cards

## Requests
1. Follow the art style of `reso/graphic/` (72 reference renders).
2. "I feel lost": show full how-to-complete info when hovering any milestone.

## Style read-out (from the 72 references) → what changed in the game
| Reference trait | Game now |
|---|---|
| Rounded grass tile, brown soil skirt, floating in a dark void | District sits on a 448 m rounded tile (grass top, soil strata edge); dark warm void + fog |
| Warm golden key light from the upper left, soft shadows | New palette: warm key from the upper left of the default view, sky/ground hemi fill; cool readable night |
| Chunky gable houses: terracotta roofs, cream/peach/brick walls, chimneys, framed windows | Rounded-box homes with overhanging gable roofs, chimneys, doors, steps, cream window frames, footpaths, bushes |
| Brick school with clock pediment + SCHOOL sign | Brick school with portico, clock, sign, yellow flag |
| Market with striped awnings | Timber market hall, striped awnings, produce, crates |
| Brick power house with cream chimneys + puffy white smoke (img 102) | Generator is now a brick power house with two cream chimneys; smoke/steam are soft white puffs |
| Wooden poles, ceramic insulators, grey can transformer, hazard sign (img 48–51) | Wooden poles + crossarms, cream insulators, grey can/pad transformers with yellow hazard decal |
| Round broadleaf trees + stacked-cone conifers | Instanced sphere-cluster trees, 3-tier pines, bushes |
| Dark asphalt, white dashes, beige sidewalks, zebra crossings | Same |
| Wind turbines, cooling towers, lake, farm, church town | Satellite islands: wind farm + solar, power station, neighbouring town with church, lake/pine forest, farm with barn + silo |
| Toy cars (red / yellow / blue) | Rounded toy cars + white crew van with orange stripe |
| UI (not in refs) | Warm walnut panels, cream text, sunflower-yellow actions/energy, rounded font |

Energised network: dark cables glow sunflower yellow (matches the refs' hazard-yellow accent); a soft route ribbon on the lawn keeps routes readable from the planning zoom and carries the overlays.

## Objective guide card
Hover, focus (Tab) or click any objective → card with: what it means, numbered "How to complete" steps (with keys), a live "Right now" read-out (e.g. which buildings are ready to connect / need a closer 400 V line, generator state and deficit, next bill countdown, fault phase + crew progress, transformer peak forecasts, fuel vs time left), tips, and a **Show me** button that flies the camera to the relevant asset and selects it. Click pins the card; Esc or clicking elsewhere closes it.

## Verification
- `npm test` 14/14.
- `tests/playthrough.js` → victory 96 "Sustainable Grid", 0 errors, 0 network requests.
- `tests/paths.js` → all §21 checks true, restart hash `3a259b43` unchanged, 60 fps.
- Screenshots: `review/r3-*.jpg` (menu, start, planning, objective cards, dusk/night/day close-ups, ending reveal).
- Test fix: objective rows are now focusable buttons, so test locators for the generator's Start button are scoped to `#inspector`.
