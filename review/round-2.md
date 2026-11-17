# Review round 2 — score 10 / 10 (all gates pass)

Evidence:
- `node --test tests/*.test.mjs` → 14/14 pass (sim rules, balance numbers, determinism, save/load, victory and fail paths).
- `tests/playthrough.js` (real mouse/keyboard through the tutorial) → victory 96 "Sustainable Grid" → ending → main menu; 0 console errors/warnings; 0 network requests.
- `tests/paths.js` (every §21 path through the UI) → all checks true; 0 errors; 60 fps.
- `tests/showcase.js` → night, close-up, capacity overlay and day art shots (`review/show-*.jpg`).
- `file://` load → menu + game run with 0 errors and 0 requests.

## Rubric
| Step | Score | Verified by |
|---|---|---|
| Assess | 0.5/0.5 | Generator, clinic and demand-curve inspectors; objective rail + tutorial step 1–3 |
| Build | 1.5/1.5 | Green dashed ghost + ghost poles + "2 poles · 69 m · 229 ¢" tip; road reason; tier rejection (unit test); click-chain and drag both build; Delete → confirm → 50 % refund + pole returned |
| Connect | 1.0/1.0 | Drop ribbons visible; "touching ≠ powered" unit test; inspector "Why it's dark" per status |
| Generate | 1.0/1.0 | Start → "Starting… 28/80 kW" ramp → power wave → staggered window light-up; first-light panel waits for full output |
| Balance | 1.5/1.5 | Forecast alert at Start; overload learning panel; trip at the 18:00 peak; Reset after cooling; two-transformer layout never trips (unit test) |
| Revenue | 1.0/1.0 | Midnight bill panel (kW vs kWh with real numbers); fuel ordering from alert + inspector; deliveries |
| Maintain | 1.0/1.0 | Condition meters; Service charges 150 ¢, caps output at 50 kW for 1 h, restores 100 % |
| Respond | 1.5/1.5 | Overheat warning → fault → alert "Send repair crew" → truck drives → crew on site → restored → review panel |
| Complete | 0.5/0.5 | 24 h stability bar in the rail; stability reset alert |
| Victory & ending | 0.5/0.5 | Score breakdown + §25 metrics; letterboxed ending with narration that cites the player's decisions; returns to menu |
| **Total** | **10.0** | |

## Gates
1. **§21 acceptance (15/15)** — intro skippable ✓; menu has New Game/How to Play/Settings ✓; controls in How to Play ✓; Settings sound on/off + "Play ending" review shortcut ✓; Esc pauses and time freezes ✓; pause menu Resume/Sound/Restart/Main menu ✓; fail screen Retry/Main menu only ✓; separate ending → menu ✓; buildings light only on valid delivery ✓; disconnected/tripped/unsupplied stay dark ✓; construction validates cost/stock/placement/tier ✓; alerts state cause + impact + action ✓; victory and failure reached by play ✓; mute + captions/visual twins ✓; Restart reproduces the fresh-start hash `3a259b43` ✓.
2. Console errors/warnings: 0 ✓
3. Network requests: 0 (http and file://) ✓
4. FPS: 60 at 1440×900 ✓ (measured in Playwright Chromium; the in-app pane was hidden, so not measured there)
5. Determinism: restart hash = fresh hash; replay/save-load hash equality in unit tests ✓
6. Visual match: dark-navy miniature, crisp cyan network with travelling pulses and bright junction dots, warm staggered windows, hi-vis crew, turbines/cooling towers on the horizon ✓
7. Size 768 KB, runs from file:// ✓

## Defects fixed this round
- Esc did nothing in menu dialogs (key handler only ran in-game).
- Learning panels could stack; now queued one at a time and cleared on mission end.
- Stale cursor caused edge-pan drift after closing overlays.
- Day lighting indistinguishable from night; street lights stayed on at noon.
- Ground light pools too strong; node dots were half-buried billboards (now flat ground glows).
- HUD compass visible during the intro; hint bar under the tutorial card; 720p overlap of objectives and comms.

## Known limits (honest notes, not rubric failures)
- Audio is procedural WebAudio and was exercised without errors, but not listened to in this headless review.
- Numbers are illustrative placeholders per GDD §20 and labelled as a simplified model in-game.
