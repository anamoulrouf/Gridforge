# Rubric — art style (reso/graphic) + objective guidance

Full marks for a row only if every criterion holds; otherwise half or zero.

## A. Art-style fidelity to reso/graphic (5.0)
| Row | Pts | Full-mark criteria |
|---|---|---|
| A1 Diorama & void | 1.0 | District on a rounded grass tile with a visible soil edge; dark void around it; satellite islands share the same tile language |
| A2 Buildings | 1.5 | Every customer type and both service buildings read as the reference vocabulary (gable roofs with overhang, chimneys, framed windows, doors, signs); no floating/clipping parts; silhouettes distinct per type |
| A3 Nature & roads | 1.0 | Round broadleaf trees and stacked-cone pines with trunks; olive-green lawn; asphalt + white dashes + beige sidewalks; nothing grows on roads/buildings |
| A4 Power infrastructure | 1.0 | Wooden poles + crossarms + ceramic insulators; grey can transformer with hazard decal; cables sag and read clearly by day and night |
| A5 Light & palette | 0.5 | Warm key from the upper left with soft shadows by day; readable night with warm windows; UI palette harmonises with the scene |

## B. Objective guidance ("I feel lost") (4.0)
| Row | Pts | Full-mark criteria |
|---|---|---|
| B1 Coverage | 1.0 | All 10 objectives have a card: meaning, numbered steps with keys, live "Right now", Show me where a place exists |
| B2 Accuracy | 1.0 | Live read-outs are correct in every phase (before/after building, generator off/starting/running, fault pending/warn/active/repaired, stability counting) |
| B3 Interaction | 1.0 | Hover opens, moving into the card keeps it open, click pins, Esc / outside click closes, Show me flies + selects; card never clips off-screen or covers the rail at 1280×720 and 1440×900 |
| B4 Discoverability & a11y | 1.0 | Visible hint that hovering helps; rows keyboard-focusable with visible focus; card is announced (role/aria); the current objective is obvious |

## C. No regressions (1.0)
| Row | Pts | Full-mark criteria |
|---|---|---|
| C1 | 1.0 | `npm test` green; playthrough victory; §21 paths all true; 0 console errors/warnings; 0 network requests; ≥ 55 fps at 1440×900 |

Hard gate: any console error, failed test or fps < 55 caps the score at 7.
