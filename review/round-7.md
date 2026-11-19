# Round 7: solar homes and more activity

## What the player reported
1. **Solar houses look wrong:** the panels ran off the roof in a long strip.
2. **More activity in all stages.**

## Solar homes
- **Cause:** one panel per 3 kWp in a single row, so a 60 kWp street drew 20 panels and a 150 kWp street drew 50, far past the roof. They also showed before the street joined the solar programme.
- **Fix:** a framed array of modules (new cell texture) that fits the street-facing roof slope, clear of the ridge and the eaves, plus an inverter with a green light and a conduit on the side wall. It is merged into one draw call. Panels appear (with a small burst of light) only when the street is enrolled; Aurora's streets start enrolled. Screenshots: `review/solar-s4.jpg`, `review/solar-s5.jpg`.

## More activity
Events per run went from about 1.5 to 2.5 in Stage 1 and from about 3.5 to 5.4 in Stages 2–5.

| New event | What happens | Your response |
|---|---|---|
| **Thunderstorm** (all stages) | Warned 3 h ahead. Rain, dark sky and lightning; may bring down one or two lines; solar drops. | Hire contractors, then Repair. |
| **Heat wave** (Stages 3, 4) | Warned 14 h ahead. Homes and businesses use 15% more power all afternoon. Included in transformer forecasts. | Check spare capacity, ready backup supply. Keeping everyone lit earns reputation. |
| **Safety inspection** (all stages) | Warned 10 h ahead. Anything broken, tripped or over its limit counts against you. | A clean report earns a grant (200–2,000 ¢) and reputation. |
| **Cable thieves** (Stages 2–5) | A police warning card 6 h ahead names the area. | Hire night guards, or take the risk and lose a line. |
| **Offers and requests** | Market or bank sponsorship (+money, small reputation cost), college apprentices, a film crew at the wind farm, free charging for electric buses. | Choice cards with real costs and effects. |

## Fairness fixes found along the way
| Problem | Fix |
|---|---|
| The crew drove back to the depot between queued repairs, so three broken lines in a row took 6 h and the hospital failed. | The crew drives straight to the next job. Repairs that bring a hospital, clinic or pump back come first. |
| "Wind farm trip" tripped whatever was biggest, which at the evening peak was the national link (most of Aurora dark for 3 h). | Blackout events only trip the source they're named after (wind farms, coal unit, national link). |

## Verification
| Check | Result |
|---|---|
| `npm test` | **55 / 55**, including the reference winning on 20 seeds × 5 stages and new tests for theft, inspection, storms, heat waves and crew routing. |
| `tests/playthrough.js` | Victory, 91 · sustainable. It now presses "Service it now" and "Send the crew" on event alerts, as a player would. 0 errors. |
| `tests/paths.js` | All true. Restart hash `8ddf1a78` equals a fresh seed-1337 game. |
| `tests/campaign.js`, `tests/line-overload.js` | All true, 0 errors, 0 requests. |
| `tests/stages-visual.js` | 18/18, 15/15, 17/17, 18/18 powered; 56–60 fps. |
| `tests/events.js` | 13 scenarios, including the storm, cable theft card, heat wave and inspection. 0 errors, 0 requests. |
| `tests/solar.js` (new) | Panels hidden on a fresh Stage 4, shown once enrolled. |
