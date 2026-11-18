# Round 6: events, disasters, social life, contract fix, copy pass

Rubric: `review/RUBRIC-campaign.md` (rewritten for this round). Build: `dist/gridforge.html` 1,112 KB.

## What the player reported
1. **Stage 3:** "Deliver 99% contract availability for 2 days" climbs too slowly and always times out.
2. **Too little happens:** they asked for transformer failures, cyclones, earthquakes, tsunamis, blackouts and flash floods.
3. **Copy:** make it human-friendly and remove the em-dashes.
4. **Surprises:** new neighbours, a new market, a new locality.
5. **Social dynamics:** the player chose all four of requests, protests, festivals, and news with reputation.

## Problems found and fixed during the round
| Problem | Cause | Fix |
|---|---|---|
| Stage 3 contract could not be met | The contract clock started at signing, so every hour spent building counted as the mill being dark. 87% after 48 h would need about 600 h of clean running. | The clock starts at the mill's first power, over a rolling 48 h window. The target is now 98%, and the best window counts. A unit test signs early, builds for 10 h, and still completes by day 4. |
| Stage 5 reliability could never recover | The same trap: one early blackout fixed the figure below 99.5% for good. | Rolling 48 h reliability (`rollingRel`). |
| Following the flood alert failed the mission | "Switch off now" four hours ahead kept the clinic dark for 7 h, past its 6 h limit. | A new **Protect** order: the crew switches equipment off as the water arrives and back on when it goes down. |
| A festival tripped a transformer with no warning | Transformer forecasts ignored festivals. | Forecasts include upcoming festivals. The Stage 1 wedding is milder (×1.3). |
| Stage 4/5 references failed on other seeds | The weather came from the run seed. | Each stage keeps its designed weather. The seed varies only the events. |
| Unbuilt surprise buildings blocked objectives | "Everyone powered" checks counted them. | Checks skip customers who haven't arrived, or have arrived but aren't connected yet. Totals use the active count. |
| A disaster left the player broke | Repairs need labour money. | Disaster repairs are paid by the emergency fund, and the depot sends missing kits free. |
| A request card opened under a learning card | Both queues opened modals independently. | Choice cards wait until no other card is open. |
| Alert listed "11 kV line and 11 kV line" | Names were not grouped. | Counted lists: "two 11 kV lines". |

## What was built
- **Event engine** (`src/sim/events.js`): pure and seeded. Each run draws 2-4 events per stage (1-2 in Stage 1) from a region-fitting pool, kept clear of each stage's scripted complications. Every event goes through warn, hit, active, end, then a restoration score. New games get a fresh seed; Restart and Retry keep it, and saves replay exactly.
- **Disasters and failures:**

  | Stage | Region | Events |
  |---|---|---|
  | 1 | Riverside | Transformer failure |
  | 2 | Millbrook | Flash flood, transformer failure |
  | 3 | Ironvale | Earthquake, coal-unit blackout, transformer failure |
  | 4 | Saltmarsh | Tsunami, river flood, interconnector trip, transformer failure |
  | 5 | Aurora | Cyclone Mira, earthquake, wind-farm trip, transformer failure |

  Each has a one-click response:
  - **Protect them** for floods;
  - **Service it now** for a humming transformer;
  - **Repair all** and **Hire contractors** (12 h at double speed) after damage;
  - **Supply panel** for blackouts.
- **Surprises:**
  - new families on the east lane (Stage 1);
  - a school annexe (Stage 2);
  - mill workers' flats (Stage 3);
  - a fishing village with rooftop solar (Stage 4);
  - Nova tech campus (Stage 5).
- **Festivals:**
  - the Adeyemi wedding;
  - the Friday bazaar;
  - the cup final;
  - the harbour festival;
  - the festival of lights.

  Each raises demand in a district for an evening.
- **Social:**
  - **Reputation** chip and **Community** panel.
  - **The Gazette** headlines, with an unread badge; the ending quotes the best and worst headline.
  - **Community requests:** street lights, a night tariff, a hospital backup, shore power, solar roofs.
  - **Protests:** 66 kV towers within 25 m of homes, or 4 or more buildings dark for 3 h. Choices are Move the line (checked after 12 h), Pay compensation, or Go ahead.
  - Reputation adjusts bill collection by ±5%, and adds a **Community** part (10 points) to every score.
- **Visuals** (`src/render/hazards.js`):
  - dashed warning rings and storm paths;
  - rising flood and tsunami water;
  - rain;
  - darker lighting in storms;
  - earthquake camera shake;
  - festival lanterns;
  - protest crowds with placards;
  - surprise buildings appearing.
- **Copy:** `review/COPY-STYLE.md`. About 270 em-dashes were rewritten across 13 files, and jargon was replaced: energised → live, headroom → spare capacity, curtailed → going to waste, ≈ and ~ → about. A unit test fails if an em-dash reaches the built game.

## Verification
| Check | Result |
|---|---|
| `npm test` | **50 / 50**. Includes the reference winning on **20 seeds × 5 stages**, deck determinism, telegraphing, Protect/isolate, festivals, requests, reputation, save replay, the rolling contract window and no em-dashes. |
| `tests/playthrough.js` (Stage 1, real UI) | Victory, **90 · sustainable** (96 before; the score now includes Community). 0 errors, 0 requests. |
| `tests/paths.js` | All true. The restart hash `10960217` equals a fresh seed-1337 game. 0 errors. |
| `tests/campaign.js` | All true. 0 errors, 0 requests. Stage 1 best is 90, Stage 5 is 91. |
| `tests/line-overload.js` | Alert, guide and fix verified. 0 errors. |
| `tests/stages-visual.js` | Reference builds power 18/18, 15/15, 17/17, 18/18. 60 fps. 0 errors. |
| `tests/events.js` (new, real UI) | 9 scenarios: arrivals, wedding, request card, flood + Protect, earthquake, blackout, tsunami, cyclone, festival. Protest and request cards captured. Gazette and Community panels open. **60 fps during every event**, 0 errors, 0 requests. |
| Size / `file://` | 1,112 KB. Loads from `file://` with 0 errors and 0 requests. |

## Score: **10 / 10**
- **Stages work and teach (2/2):** every primary objective can be recovered (rolling windows), and the references win across seeds.
- **Events fair and varied (2/2):** 20-seed wins, ≥ 1 h warnings (earthquakes excepted, with damage capped and paid for), a response button on every alert.
- **Disasters and surprises read clearly (1.5/1.5):** screenshots `review/ev-*.jpg` and `review/r6-flood-*.jpg`.
- **Social dynamics (1.5/1.5):** all four systems are live and tested.
- **Copy (1/1):** style guide and no-em-dash gate.
- **Campaign flow (1/1)** and **no regressions / performance (1/1).**

All hard gates pass.

## Deviations from the plan (recorded)
- **Contractor crew:** "a second crew" became contractors who make your crew twice as fast for 12 h. The effect on play is the same, and the crew model stays simple.
- **Stage 1 flood:** Stage 1 has no river, so its pool is a transformer failure, new neighbours and a wedding instead.
- **Reputation effects:** high reputation does not bring growth sooner. Reputation changes bill collection (±5%) and the score instead. Protests come from specific behaviour (towers beside homes, long outages), not from a reputation threshold.
- **Weather:** it no longer varies per run, which keeps each stage's designed storm and calm days.
