# DESERT STRIKE — Mobile AAA FPS Overhaul Plan (Gauntlet Loop)

## Goal
Take the existing Desert Strike browser FPS (audited live at the novita sandbox URL) and iteratively rebuild it toward AAA mobile quality on the Vivo T4x (Dimensity 7300, 120Hz, 2408×1080, 8GB RAM). Landscape-only, Chrome Android / WebGL2, target 60 FPS (45 floor). Offline bot Team Deathmatch (user-confirmed). Deployed via this session's port-3000 preview URL (user-confirmed it appears).

Reference visual bible (from user's images description): desert/sand arena, wooden fortifications, corrugated shipping containers, adobe hillside village, warm hazy sun + dusty atmosphere, slight bloom; HUD = green RANGERS vs red MILITIA score top-center with timer, AK-47 viewmodel with black-gloved hands, "VITALS 100" bar bottom-left, ammo "30/150" bottom-right. Palette: tan/brown/olive/rust orange/military green, slightly desaturated cinematic warm tones.

## Baseline Audit (existing build — keep architecture, upgrade in place)
Stack: single `index.html` + `/static/css/game.css` + ES modules (`main`, `world`, `weapon`, `controls`, `soldiers`, `audio`, `textures`) + Three r160 via jsdelivr importmap. Proven flow: menu → loading → TDM (player + 4 ranger bots vs 5 militia bots, score limit 50, 10 min) → death/respawn → end screen.

Defects/gaps found:
1. AI has no pathfinding — bots hug walls, get stuck on obstacles during patrol.
2. Ground mesh is visually undulating but collision treats Y=0 flat → floating/clipping feet.
3. Impact FX are untextured spheres; no bullet-hole decals, blood, smoke, shell casings.
4. Tracers are 2-point lines; muzzle flash minimal; no surface-type hit reactions.
5. Audio is thin (basic synth blips); no ambience, footsteps, spatialization.
6. No pause menu, settings (sensitivity/invert/quality), scoreboard, compass/minimap.
7. Fixed pixel-ratio cap 1.6, no adaptive resolution or thermal guard; shadow map fixed 1024 whole-map.
8. No sprint/crouch, no health regen choice, no grenades/second weapon, no killstreak/MVP moments.

## Tech Decisions
- Same proven stack, zero build step: Three.js **vendored locally** (`three.module.min.js` served from `/static/js/lib/`) so the phone never depends on a CDN. Sandbox has internet to vendor it once.
- Node 22 present: `node --check` for syntax gates; tiny `server.js` static server on port 3000 (preview URL).
- 100% procedural assets: canvas textures, WebAudio-synthesized SFX. No runtime downloads.
- Perf budgets (hard gates per gauntlet review): ≤110 visible draw calls, ≤160k tris, GPU textures ≤24MB, JS heap <300MB, adaptive DPR 0.75–1.6, zero allocations in per-frame hot paths (pooled vectors/meshes).

## New File Architecture (build in workspace root)
```
index.html                  — shell: menu/loading/HUD/screens (upgraded)
package.json                — {"type":"module"} so node --check parses ESM
server.js                   — static file server, port 3000
static/css/game.css         — full UI styling
static/js/lib/three.module.min.js
static/js/config.js         — all tuning constants (weapons/AI/perf presets)
static/js/main.js           — orchestrator: states, match flow, pools wiring
static/js/textures.js       — upgraded procedural texture library
static/js/sky.js            — gradient skydome, sun glow sprite, haze layers
static/js/world.js          — map v2, colliders, waypoint nav graph, cover points
static/js/effects.js        — pooled particles, decals, tracers, shells, blood
static/js/weapon.js         — AK-47 viewmodel + gunfeel
static/js/player.js         — movement/collision/camera controller
static/js/controls.js       — touch + mouse/keyboard input layer
static/js/soldier.js        — bot body builder + animation
static/js/ai.js             — perception, A* nav, cover combat state machine
static/js/hud.js            — DOM HUD, killfeed, compass, scoreboard, banners
static/js/audio.js          — WebAudio synth engine (weapons/UI/ambience)
```

## Phase Roadmap — GAUNTLET LOOP (build → review → fix-loop before next phase)
Every phase ends with a **GAUNTLET REVIEW**: `node --check` all files; curl all routes 200 on :3000; log draw calls/tris/FPS via built-in stats overlay; explicit bug list resolved before proceeding. User playtests the preview link after each phase; feedback feeds the next loop.

### Phase 1 — Core Rebuild + World Fidelity
- Scaffold all files above; vendor three.js; server.js running on :3000; fullscreen request + orientation lock attempt on DEPLOY; rotate prompt kept.
- World v2: heightfield disabled inside R=60 (flat, matches physics); canyon ring + distant mesas outside; merge static geometry per material; InstancedMesh for shrubs/boulders/barrels/crates/sandbags; richer procedural textures (sand wind-ripples, adobe with baked edge AO, corrugated container ridges, plank wood grain); sky gradient dome + sun glow + warm ACES tone mapping; fog matched to sky horizon color.
- Waypoint nav graph (~40 nodes + visibility edges) and auto-tagged cover points from colliders (used by AI in Phase 3).
- Stats overlay (FPS / draws / tris) toggled by triple-tapping the timer.
- Review gate: budgets met in code accounting; no collider/visual mismatches.

### Phase 2 — Gunfeel, Player Systems, Effects, Audio
- Weapon: recoil pattern (vertical climb + horizontal drift recovering), spread bloom driving crosshair expansion, ADS blend (FOV + pose + sway reduction), animated reload (mag drop/insert), muzzle flash sprite + point light, brass ejection, damage falloff, headshot ×2 with distinct hitmarker/audio.
- Player: sprint (stick double-push or button), jump retained, landing dip, fire/damage camera shake, directional damage indicators, optional health regen (5s no-damage delay), footstep-synced bob.
- Effects module (fully pooled): surface-type impact puffs (sand/spark/wood/dust), bullet-hole decal ring buffer (~24), blood mist on flesh hits, stretched-quad tracers, lingering smoke wisps, death fall + sink/fade.
- Audio engine: layered gunshot (noise crack + body + environment tail), stereo-panned distance-filtered enemy shots, sand footsteps, reload clicks, hit ticks, headshot ding, ambient wind + distant battle rumble, UI/deploy sounds.

### Phase 3 — AI Overhaul
- Perception: FOV cone + LOS raycasts staggered across frames, shot-hearing alerts, last-seen memory.
- Navigation: A* over waypoint graph, steering with obstacle slide, stuck detection + recovery hop.
- Combat SM: PATROL → ADVANCE → COMBAT (burst-fire, strafe, peek) → SEEK_COVER (reload/low HP) → HUNT (last-seen). Cover usage via tagged points. Difficulty director rubber-bands bot accuracy to match player performance.
- Allies fully simulated fighting militia (bot-vs-bot kills feed scoreboard/killfeed already).

### Phase 4 — HUD/UX + Match Flow
- Compass strip with fire-ping enemy markers; minimap optional (default off, perf).
- Pause menu: resume, sensitivity slider, ADS sens multiplier, invert Y, auto-fire toggle, graphics preset Low/Med/High (DPR cap, shadow res, particle density), volumes.
- Full scoreboard (all 10 K/D), killstreak banners, end-match MVP card + detailed stats, rematch without page reload (proper dispose/reset).
- Death-cam glance toward killer, low-HP heartbeat vignette.

### Phase 5 — Mobile Hardening (FINAL GAUNTLET)
- Adaptive resolution: EMA frame time steps DPR between 0.75–1.6; thermal guard lowers sim detail first.
- Shadow: tight ortho frustum following player, 1024 default, off on Low.
- Hot-path allocation audit; context-loss restore handler; visibilitychange auto-pause; memory dispose audit on rematch (<300MB heap).
- Ship with desktop-Chrome touch-emulation instructions so the user can sanity-test before phone playtest.

### Phase 6+ — Infinity Polish Loop (repeat until "AAA" sign-off)
Grenades (arc throw), pistol sidearm + swap, weapon skin variants, second map layout, day/dusk variant, local best-stats via localStorage, haptics (navigator.vibrate on hit/damage).

## Validation Plan
- Per-module: `node --check static/js/<file>.js` immediately after writing each.
- Integration: start server.js, curl `/`, css, every js route → 200; importmap resolves locally (no external URLs in HTML).
- Runtime: stats overlay numbers reported by user's phone playtest drive the gauntlet verdicts (this sandbox has no GPU/device — noted limitation).
- Acceptance per phase: user plays preview URL and confirms improvements; unresolved items become next-loop tasks.

## Risks & Mitigations
- No physical T4x access → conservative budgets + adaptive scaler + Low preset guaranteed playable.
- Preview URL lifetime unknown → after each phase the build is complete/runnable; final deliverable can additionally be bundled into one self-contained HTML on request.
- WebAudio autoplay policies → init/resume strictly on first user gesture (DEPLOY tap).

## Out of Scope
Real online multiplayer/accounts, store packaging, iOS Safari guarantee, non-English localization.
