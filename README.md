# Gridforge — Stage 1 "Light the First District"

A 3D electricity-network strategy game built from `reso/Gridforge_Game_Design_Document.html`, in the warm toy-diorama art style of `reso/graphic/`. Hover any objective in the left rail for step-by-step help and a live status read-out.

**Play:** open `dist/gridforge.html` in a modern browser. It's a single offline file (no network, no external assets).

## Build & test
```bash
npm install
node build.mjs          # → dist/gridforge.html
npm test                # simulation unit tests (node:test)
```
Browser regression scripts (`tests/playthrough.js`, `tests/paths.js`, `tests/showcase.js`) are Playwright functions; serve `dist/` on port 4173 (`.claude/launch.json`) and run them with `?test=1`.

## Layout
- `src/sim/` — deterministic simulation (grid graph, power solver, mission rules), no DOM/Three.
- `src/render/` — Three.js scene, network visuals, world, people, particles.
- `src/ui/`, `src/audio/` — HUD, inspector, menus, procedural audio.
- `src/data/` — balance numbers, map, strings, dialogue.
- `review/` — rubric and review rounds with screenshots.
