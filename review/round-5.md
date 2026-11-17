# Round 5 — Campaign (Stages 2–5) review

Rubric: `review/RUBRIC-campaign.md`. Build: `dist/gridforge.html` 1,028 KB.

## Initial score: 7 / 10 (capped — hard gate failed)

| Item | Finding |
|---|---|
| **Gate 3 (fps)** | **Failed.** Stage 5 ran at 51.7 fps (2,096 draw calls incl. shadow pass vs 614 in Stage 1). Stages 3–4 also dipped into the 40s after loading. |
| Stage 2–4 · guide/comms accuracy | The Stage 1 advisor line *“Generator at full output. 100 kW available.”* fired in every later stage, which is wrong there (the gas peaker is 2 MW). The `forecast`, `noFuel` and `serviceNudge` lines also had Stage 1 numbers baked in. The Demand/Powered chip tooltips said “13 customers” in every stage. |
| Stage 2 · system teaches | The Supply panel labelled the diesel generator **“stored”**, the battery wording, instead of its fuel cost. It also showed a sun/wind forecast and “Renewable share 0 %” on a map with no renewables. |
| Stage 5 · complication telegraphed | The day‑3 feeder fault (18:00) arrived **with no warning**. The heat dome was forecast, but nothing tied it to a feeder risk. |
| Campaign flow | No UI-level test of locks/unlock/Continue/Unlock‑all/finale. The finale ending recapped Aurora only, not the campaign. The browser tab title read “Light the First District” in every stage. |

## Fixes

1. **Draw-call batching.** Static meshes are merged by material:
   - World: per building and per source group, and per 160 m cell for scenery. Animated parts (fans, rotors, signs, beacons) are left live.
   - Network: each pole, tower, transformer and substation is baked into ≤ 2 vertex-coloured meshes, cached per shape.
   - Each span's 1–3 conductors are merged into one mesh.
   - Light pools are one additive `InstancedMesh`. Fading by instance colour is identical under additive blending.
2. **Bloom at half resolution.** The glow is soft anyway, and this quarters the mip-chain cost on Retina screens.
3. **Generic comms base.** `LINES_BASE` serves Stages 2–5, with live names and ratings (*“Gas peaker at full output — 2.00 MW available.”*). Chip tooltips are stage-aware. The tab title follows the stage.
4. **Supply panel corrections.**
   - Dispatch rows show the fuel cost per kWh (≈0.25 ¢/kWh fuel for diesel).
   - The sun/wind forecast and renewable share appear only when the map has weather-driven supply.
5. **Stage 5 feeder warning at day 3 15:00, three hours ahead.**
   - Alert: *“Feeder joints running hot”*, plus an advisor line and a Programs button.
   - The self-healing guide card shows the forecast and the outcome.
   - New unit test: *every complication is telegraphed ≥ 60 min before it hits* (Stages 2–5).
6. **Campaign finale recap.** *“Your grid, region by region — Riverside 96 · Millbrook … · Aurora 90.”*
7. **`tests/campaign.js`.** A real-UI flow through every campaign path (below). `worldToScreen` also resolves build sites, for real clicks.

## Verification (after fixes)

| Check | Result |
|---|---|
| `npm test` | **32 / 32 pass** (Stage 1 suite + campaign suite incl. the new telegraph test) |
| `tests/playthrough.js` (Stage 1, real UI) | victory **96 · sustainable**, 0 errors, 0 requests |
| `tests/paths.js` (Stage 1 acceptance paths) | all true, restart hash `21e22c09`, 0 errors |
| `tests/campaign.js` (real UI) | see list below; 0 errors, 0 requests |
| `tests/stages-visual.js` | Stages 2–5 reference builds power 18/18, 15/15, 17/17, 18/18; 0 errors |
| fps, settled, 1440×900, day / night | S1 60/60 · S2 60/60 · S3 60/60 · S4 60/60 · S5 60/60; 0 frames > 25 ms |
| draw calls (Stage 5, day) | 2,096 → **788** (Stage 1: 614 → 334) |
| size / `file://` | 1,028 KB; loads from `file://`, 0 errors, 0 requests |

**`tests/campaign.js` covered:**
- Locked tiles: 4 locked, each saying “Complete Stage N to unlock”.
- Stage 1 victory unlocks Stage 2.
- Ending → “Next: Stage 2 · Growing Demand” → briefing.
- Stage 2 tutorial with real clicks:
  - finance chip → tariff ± → learning card;
  - T1 upgrade to 100 kW;
  - Build tool → gas genset.
- Pause → menu shows “Continue · Stage 2”.
- Campaign screen shows the Stage 1 best (96) and Stage 2 Continue, which resumes the save.
- Unlock all → 0 locked.
- Stage 3: 66 kV line from the coal station plus the Substation tool.
- Stage 4: Build wind, plus the weather forecast.
- Stage 5: Supply → Programs → Smart charging on.
- Finale has no “Next” and shows the campaign recap.

## Final score: **10 / 10**

| Criterion | S2 | S3 | S4 | S5 |
|---|---|---|---|---|
| System works & teaches | 0.5 | 0.5 | 0.5 | 0.5 |
| Guide cards accurate | 0.5 | 0.5 | 0.5 | 0.5 |
| Complication fair & telegraphed | 0.5 | 0.5 | 0.5 | 0.5 |
| Art matches refs | 0.5 | 0.5 | 0.5 | 0.5 |

**System works & teaches**
- Reference wins: S2 81, S3 97, S4 88, S5 90.
- Careless plans fail: S2 clinic dark; S3 congestion trip, contract miss; S4 dark at coal retirement; S5 fossil imports.
- Rule tests: tariffs, HV→LV rejected without a substation chain, battery energy conservation, solar = 0 at night, demand-response shift, self-healing.
- Each stage has a tutorial and learning cards.

**Guide cards accurate**
- Every guide card renders at stage start (unit test).
- Keys and labels match the real controls; the Stage 2 tutorial is exercised by real clicks.
- Stale Stage 1 numbers were removed.

**Complication fair & telegraphed**
- S2: storm forecast before the span falls; heat wave forecast a day ahead.
- S3: “records incomplete” warning 25 h before the hidden fault; the expansion offer states its start time.
- S4: storm and calm forecast a day ahead; coal retirement announced.
- S5: heat-dome forecast, then the new feeder warning 3 h before the fault.

**Art matches refs**
- Toy-diorama palette and forms throughout: coal station with cooling towers, solar rows, wind turbines, substation yards, lattice towers, EV hubs, towers.
- Day and night shots reviewed (`review/s*-*.jpg`); batching changed no visuals (close-ups `review/r5-*.jpg`).

**Campaign flow: 1 / 1.** **No regressions / performance: 1 / 1.** All hard gates pass.

## Recorded deviations (not rubric items)

The plan's extra “Weather / Emissions / Contracts” map overlays were not added as separate overlay modes. That information lives where players already look:
- **Weather:** the weather chip and the 24 h forecast in the Supply panel.
- **Emissions:** the CO₂ and renewable chips and the daily statement.
- **Contracts:** the contract objective with its live availability bar, and penalties in the statement.

The existing Tier overlay distinguishes 66 / 11 kV / 400 V.
