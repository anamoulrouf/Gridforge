# Gridforge Stage 1 — Review rubric (10 points)

Weights follow GDD §21 "Gameplay loop grading". A row scores full marks only if **every** criterion holds; half if most hold; zero otherwise.

| Step (pts) | Full-mark criteria |
|---|---|
| Assess (0.5) | Generator and every customer inspectable; demand total visible; objective clear in under 10 s |
| Build (1.5) | Route-drag/click with visible ghost, cost preview and invalid reasons; tier rejection explained; delete/refund works |
| Connect (1.0) | Drops visible; "touching ≠ powered" holds; the inspector says *why* a building is dark |
| Generate (1.0) | Start, ramp, fuel use visible; first-light sequence (pulse wave → windows) plays uninterrupted |
| Balance (1.5) | Demand/supply/capacity readable; peak overload telegraphed; splitting load fixes it |
| Revenue (1.0) | kW vs kWh bill moment; credits change visibly; fuel resupply works |
| Maintain (1.0) | Condition visible; Service action with cost and brief outage/cap |
| Respond (1.5) | Telegraphed fault; Alert → Focus → Isolate → Repair → Restore → Review chain works and teaches |
| Complete (0.5) | All 13 powered; 24 h stability tracked in the rail |
| Victory & ending (0.5) | Metrics screen; separate ending scene; returns to menu |

## Hard gates (any failure caps the score at 7)
1. All 15 GDD §21 acceptance criteria pass.
2. Zero console errors/warnings from game code.
3. Zero network requests.
4. ≥ 55 fps at 1440×900.
5. Restart and replay of the same command log give an identical `hash()`.
6. Screenshots judged on-style against the reference video (dark navy miniature, cyan network with bright nodes, warm windows).
7. `dist/gridforge.html` under 1.5 MB and runs from `file://`.
