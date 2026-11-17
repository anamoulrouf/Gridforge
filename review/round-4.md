# Round 4: review of the diorama restyle + objective guide (rubric: `RUBRIC-r3.md`)

Evidence script: `tests/review3.js` (building close-ups by day, every objective card in every phase,
1280×720 layout, keyboard focus / pin / Esc). Regression: `npm test`, `tests/playthrough.js`, `tests/paths.js`.

## Pass 1: score 8.0 / 10
| Row | Score | Defects found |
|---|---|---|
| A1 Diorama & void | 1.0/1.0 | — |
| A2 Buildings | 0.75/1.5 | Market's big gable roof hid every stall from the game camera; clinic roof was a solid white slab (parapet modelled as a block); depot roof z-fought with its parapet (streaks); lit windows by day read as flat cream squares instead of blue glass in white frames; roofs untextured |
| A3 Nature & roads | 1.0/1.0 | — |
| A4 Power infrastructure | 0.5/1.0 | 11 kV cables glowed near-white and bloomed into "light beams" when seen end-on; junction dots and route ribbons blew out to white glare by day |
| A5 Light & palette | 0.5/0.5 | — |
| B1 Coverage | 1.0/1.0 | — |
| B2 Accuracy | 0.5/1.0 | During generator ramp-up the Start card said "Supply short — customers being shed" (alarming and wrong; the ramp is expected); Service card at 17:xx said "during the evening peak" though the peak starts at 18:00; "Connect early" tip still shown after the objective was done |
| B3 Interaction | 1.0/1.0 | — |
| B4 Discoverability & a11y | 1.0/1.0 | — |
| C1 No regressions | 1.0/1.0 | — |

## Fixes
- Market rebuilt as an open-air square: five stalls with striped pitched canopies visible from above, a corner shop with awning, produce, crates, festoon lights.
- Clinic: parapet ring, darker roof deck, skylight, plant units. Depot: parapet ring + deck (no coplanar faces), skylight, AC unit.
- Clay roof-tile texture on every gable roof (homes, school, shop, church, barn, neighbour town).
- Windows: blue glass by day with a hint of warmth when powered, full warm glow at night.
- 11 kV energised colour is now gold (not white); cable glow, junction dots and route ribbons scale with daylight so nothing blooms by day.
- Card text: ramp-up shows "Ramping up — X of 100 kW available"; Service distinguishes "peak starts at 18:00" vs "during the peak" vs "near the cap"; tips hidden once an objective is done.

## Pass 2: score 10 / 10
| Row | Score | Verified by |
|---|---|---|
| A1 | 1.0 | Ending reveal shows the rounded tile + soil edge in the void, wind-farm and farm islands |
| A2 | 1.5 | `r3x-home/school/clinic/market/gen/depot.jpg`: tiled gable roofs, chimneys, framed windows, doors, signs; distinct silhouettes; no clipping or z-fighting |
| A3 | 1.0 | Round trees + pines with trunks, olive lawn, asphalt/dashes/sidewalks/zebras; nothing on roads |
| A4 | 1.0 | `r3x-xfmr.jpg`: wooden pole, insulators, grey can with hazard decal, gold/yellow cables, no glare |
| A5 | 0.5 | Warm upper-left key with soft shadows by day; readable warm night; UI palette matches |
| B1 | 1.0 | 10/10 cards with steps + live status; Show me on every objective tied to a place |
| B2 | 1.0 | Card read-outs checked in 29 states (empty, MV only, built, off/starting/running, billed, noon, fault pending/warn/active/crew, stable counting) — all correct |
| B3 | 1.0 | Hover → card; moving into card keeps it; Enter/click pins; Esc closes without opening pause; Show me flies + selects; card fits at 1280×720 and 1440×900 |
| B4 | 1.0 | "Hover an objective for step-by-step help" line; rows are focusable buttons with visible focus; card has role=tooltip + aria-describedby |
| C1 | 1.0 | `npm test` 14/14; playthrough victory 96 "Sustainable"; all §21 paths true; restart hash `3a259b43`; 0 errors, 0 requests; 59–60 fps |
| **Total** | **10.0** | |
