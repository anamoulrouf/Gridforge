# Review round 1 — score 6.5 / 10 (capped by gate 6)

Build: first complete build. Evidence: `node --test` 14/14; Playwright playthrough `tests/playthrough.js` reached victory (score 96) → ending → main menu with **0 console errors, 0 network requests**, 60 fps.

## Rubric
| Step | Score | Notes |
|---|---|---|
| Assess | 0.5/0.5 | Inspector for generator, clinic and the demand curve panel all work. |
| Build | 0.75/1.5 | Route tool works and validates, but the **ghost ribbon was invisible** (back-face culled), so players saw only ghost poles. |
| Connect | 0.5/1.0 | Drops and "why it's dark" text work; drop ribbons were invisible (same culling bug). |
| Generate | 0.5/1.0 | First-light panel popped up 2.6 s after Start and paused the ramp, freezing the lights half-on. |
| Balance | 0.75/1.5 | Forecast alert + overload learning panel exist; the single-transformer overload path is not yet verified through the UI. |
| Revenue | 1.0/1.0 | Bill panel with kW vs kWh, fuel ordering from the alert and inspector both work. |
| Maintain | 0.5/1.0 | Service action exists, but not yet exercised through the UI. |
| Respond | 1.5/1.5 | Warning → fault → alert "Send repair crew" → truck → repair → restored panel all observed. |
| Complete | 0.5/0.5 | 24 h stability counter visible in the rail. |
| Victory & ending | 0.5/0.5 | Metrics + score breakdown; ending with narration; returns to menu. |
| **Sum** | **7.5** | capped to 6.5 by gate 6 |

## Gates
1. §21 criteria — partially verified (intro skip, pause/Esc, fail → Retry, restart not yet exercised in UI).
2. Console — pass after fixes (Clock → Timer, PCFSoft → PCF, favicon 404 removed).
3. Network — pass.
4. FPS — pass (60).
5. Determinism — pass at sim level; UI restart unverified.
6. **Visual match — FAIL**: energised network nearly invisible (culled ribbons); once fixed it was blown out to white; ground light pools too orange; node dots render as half-buried domes at low angles.
7. Size 774 KB — pass; file:// unverified.

## Defects found and fixed this round
- `[hidden]` overridden by `display:flex` → HUD showed behind the menu.
- Tutorial card covered the town centre → moved bottom-right, inspector height adapts.
- Ribbon geometry winding culled → `DoubleSide`; then tone-mapped down from HDR white to crisp cyan.
- Dead lines invisible → brighter slate, dashed.
- First-light learning panel deferred until the generator reaches full output.
- Spurious "load shed" alert during the generator ramp suppressed.
- Modals focus the primary action instead of the first button.

## Next round
Flat ground node dots; calmer light pools; verify overload/maintain/fail/restart/pause/intro/How-to/file:// through the UI.
