# Campaign rubric (Stages 2–5) — 10 points

Each of Stages 2–5 is worth **2 points**, split evenly (0.5 each) across:

| Criterion | 0.5 = met when… |
|---|---|
| **System works & teaches** | The stage's new system behaves as documented (unit tests on its rules), its reference strategy wins with margin, a careless plan fails, and a tutorial + learning panels explain it in the player's terms. |
| **Guide cards accurate** | Every objective's hover card renders at any point in the run; its steps match the real controls/keys; its "Right now" lines reflect live state; numbers in the text match the balance data. |
| **Complication fair & telegraphed** | Each mid-mission complication is announced ≥ 1 sim-hour ahead (alert + advisor line), has a documented counter-play, and the reference strategy survives it. |
| **Art matches refs** | New assets read in the `reso/graphic` toy-diorama vocabulary (warm palette, chunky rounded forms, soft shadows); no placeholder geometry, z-fighting, floating or clipping objects at the review camera positions; day and night both readable. |

Plus:

| Points | Criterion |
|---|---|
| **1** | **Campaign flow / unlocks / saves** — locked tiles explain their requirement; victory unlocks the next stage; ending offers "Next"; Continue resumes the latest stage; per-stage saves; "Unlock all stages" works; finale has no "Next" and recaps the campaign. Verified by `tests/campaign.js` through the real UI. |
| **1** | **No regressions / performance** — Stage 1 unchanged (unit tests, `tests/playthrough.js` victory 96, `tests/paths.js` all true); all stages ≥ 55 fps settled at 1440×900, day and night. |

## Hard gates (any failure caps the score at 7)

1. 0 console errors/warnings and 0 network requests in every Playwright suite.
2. All tests green (`npm test`, `tests/playthrough.js`, `tests/paths.js`, `tests/campaign.js`, `tests/stages-visual.js`).
3. ≥ 55 fps (settled median) on every stage.
4. `dist/gridforge.html` < 1.5 MB and runs from `file://`.
5. Stage 1 unchanged (victory 96, deterministic restart).
