# Campaign rubric (all ten stages): 10 points

From round 6, each run deals the player a seeded hand of events, so the rubric judges the event system and its social side as well as each stage.

| Points | Criterion | Met when… |
|---|---|---|
| **2** | **Stages work and teach** | Each stage's system behaves as documented (unit tests), its reference wins with margin, a careless plan fails, and a tutorial and learning cards explain it. Every objective can be completed in time: no "one bad hour ruins it forever" metrics (rolling windows for contract and reliability targets). |
| **2** | **Events: fair and varied** | A seeded deck per run that differs between seeds and is identical on replay/save. Every hazard except earthquakes is announced at least 1 hour ahead, with an alert, an advisor line and a map marker, and comes with a one-click response (Protect, Service it now, Hire contractors, Repair all). The reference wins on 20 seeds per stage. |
| **1.5** | **Disasters and surprises read clearly** | Floods, tsunamis, cyclones, earthquakes, blackouts, transformer failures, new neighbours, markets and localities each have visuals (water, rain, storm light, shake, lanterns, new buildings) and a plain explanation of what happened and what to do. |
| **1.5** | **Social dynamics** | Reputation chip and Community panel; Gazette headlines, also quoted in the ending; community requests with real costs and effects; protests (towers beside homes, long outages) with reroute, compensate or ignore; festivals that reward keeping a district lit; a Community part in every score. |
| **1** | **Copy is human-friendly** | Follows `review/COPY-STYLE.md`: plain words, a fix with every problem, no em-dashes in `dist/gridforge.html` (unit test). |
| **1** | **Campaign flow / unlocks / saves** | Verified by `tests/campaign.js` through the real UI. |
| **(gate)** | **Activity (round 8)** | Busier towns (traffic by hour, people outside powered buildings, boats, birds, cranes, stalls) at no measurable frame cost; 7–9 events per run in Stages 2–5 and 3–4 in Stage 1, still won by the reference on 20 seeds; daily side tasks that are seeded, replay-safe and pay out; story beats with named local characters. Checked by `tests/activity.test.mjs` and `tests/events.js`. |
| **1** | **No regressions / performance** | Stage 1 playthrough wins, paths all pass, Restart is deterministic; every stage at least 55 fps settled at 1440×900, including during floods, cyclones and tsunamis. |

## Hard gates (any failure caps the score at 7)
1. 0 console errors or warnings and 0 network requests in every Playwright suite.
2. All tests green: `npm test` (including `tests/activity.test.mjs`, `tests/stage6.test.mjs` and `tests/chapter2.test.mjs`), `tests/playthrough.js`, `tests/paths.js`, `tests/campaign.js`, `tests/stages-visual.js`, `tests/line-overload.js`, `tests/events.js`.
3. At least 55 fps (settled) on every stage.
4. `dist/gridforge.html` is under 1.5 MB and runs from `file://`.
5. Deterministic: same seed and commands give the same state; Restart gives a fresh hash for the same seed.
