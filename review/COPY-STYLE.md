# Gridforge copy style

All player-facing text: alerts, advisor lines, guide cards, learning cards, panels, tooltips, briefings and endings.

## Rules
- **Talk to the player.** Use "you" and "your", everyday words and short sentences. Aim for one idea per sentence.
- **No em-dashes (—).** Use a full stop, a comma, a colon or brackets instead. `tests/events.test.mjs` fails if one reaches `dist/gridforge.html`.
- **Explain a term when it first appears, or swap it for a plain word:**

  | Instead of | Write |
  |---|---|
  | rated / rating | built for / limit |
  | energised | live |
  | headroom | spare capacity |
  | curtailed | going to waste |
  | load shed | switched off to save power |
  | interconnector | regional link / national link |

  Keep the real unit (kW, kWh, kV), because it's what the game teaches.
- **Numbers carry units.** Write "about 48 kW", not "≈ 48". Keep "%" next to the number.
- **Every problem comes with a fix.** An alert names what happened, why it matters, and the button or key that fixes it.
- **Encourage, don't scold.** For example: "Breakdown avoided", "A night to remember", "People felt let down".
- **Names come from the map.** Use real names ("T2", "Ironvale Hospital", "the harbour front"). Don't use internal ids.
- **Counted lists, not repeats.** Write "two 11 kV lines", not "11 kV line and 11 kV line".
