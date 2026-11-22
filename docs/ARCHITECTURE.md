# Architecture

This refactor extracts the original game's existing sections, preserves their dependency order and save version, and adds a dedicated storage service. The simulation and renderer remain large files; this is a conservative first separation, rather than a rewrite of their internals.

## Loading and ownership

`index.html` and `zoo.html` explicitly list classic deferred scripts. They run in document order after HTML parsing. Game-specific scripts live in `src/dino/` or `src/zoo/`, with common dependencies in `src/shared/`. No bundler, package registry, CDN, or runtime network API is required. Keep this order when adding files. Do not change individual scripts to ES modules without also replacing their shared `Z` namespace references.

- `dino/00-data.js`: definitions, island maps, species (dinosaurs, marine reptiles, pterosaurs, modern safari animals, donor traits), costs, research and news content.
- `shared/10-core.js`: grid utilities, random number generator, event bus, and typed-array serialization. `dino/dino-config.js` and `zoo/zoo-config.js` supply the park state schemas and storage identifiers.
- `shared/15-storage.js`: localStorage checkpoints, IndexedDB records, startup selection, and storage status for both games.
- `dino/20-sim.js` and `dino/22` through `dino/29` (`dino/22-sim-dna.js`, `dino/23-sim-moats.js`, `dino/24-sim-monorail.js`, `dino/25-sim-power.js`, `dino/26-sim-realms.js`, `dino/27-sim-news.js`, `dino/28-sim-director.js`, `dino/29-sim-safari.js`, `dino/29b-sim-boats.js`): own live simulation state and game actions; export `Z.Sim` and internal context bridges (`Z.simCtx`, `Z.moatCtx`, `Z.monoCtx`, `Z.powerCtx`, `Z.realmCtx`, `Z.safariCtx`). `dino/29b-sim-boats.js` (`Z.Boats`) holds floating pontoons (a path type), guest and service piers, staff and VIP helipads: it derives water bodies and component links, ferries guests and staff as runtime trips, and spawns VIP guests; it persists only `S.boats` and per-building fares. Prefer changing state through public `Z.Sim` actions rather than editing `Z.state` from the UI.
- `dino/30-models.js` through `dino/36-models-boats.js` and `dino/40-world.js` through `dino/49-world-boats.js`: 3D models, realm/moat/monorail/power/safari meshes, overlay patterns and presentation. Do not move authoritative simulation state into scene objects.
- `dino/50` through `dino/78`: UI, construction tools, panels, modal screens (`dino/53-screens.js`), audio, 14-step tutorial, research and DNA lab (`dino/56-research.js`, `dino/61-minigames.js`, `dino/62-research-dna.js`), guide, street view, weather HUD, 3D portrait (`dino/64-portrait.js`), moat/monorail/realm/power/news/safari/boats UI (`dino/65`–`dino/69`, `dino/74`, `dino/79-ui-boats.js`), Masterclass example games and UI (`dino/70`–`dino/73`), two-level build groups (`dino/75-ui-groups.js`), mobile HUD (`dino/76-ui-mobile.js`), unlock hints (`dino/77-ui-hints.js`) and overlay legend (`dino/78-ui-legend.js`).
- `dino/90-main.js`: lifecycle, title/setup screens, timing, adaptive quality, save coordination (including Masterclass save protection) and JSON import/export.

Rendering and UI observe `Z.state` and the `Z.bus` event bus. A `reset` event follows simulation resets/loads; renderer and UI rebuild their derived views. Runtime simulation caches are recreated by `Sim.load`, so serialized JSON need not be byte-identical after a load.

## Shared modules and Zoo entry point

`zoo.html` loads Wild Acres Zoo from the ordered classic scripts in `src/zoo/` and `src/shared/`. Both entry points load `styles/tycoon.css` before their game-specific styles. They reuse the bundled Three.js library in independent `Z` namespaces. `styles/tycoon-menu.css` styles the title-screen links between the two entry points.

Shared scripts implement custom coaster simulation, rendering and controls, plus the weather HUD, street view and detailed toilet model. Coasters use the active game's `Z.coasterCtx`. The shared simulation code also handles animal movement and weather transitions and effects. Both renderers use common mesh builders, guest and staff animation, procedural textures, atmosphere and camera math. Shared UI modules handle input, the modal shell, common tabs and audio. Both games use the same backup-file validation, save candidate loading and graphics settings logic.

Each game's data controls the items it offers, their prices and their footprints. Species, park mechanics, save schemas and features such as Dino's DNA lab and Zoo's play timer live in their respective game folders.

Zoo uses `wildacres.save.v1`, `wildacres.settings.v1`, the `wildacres` IndexedDB database, and the `wazoo_tut` tutorial key. Dino uses its own keys and the `amberacres` database. The v2 save contract below describes Dino.

## Save contract

`Z.Sim.save()` returns the original raw v2 JSON string. `Z.Sim.load(raw)` returns a boolean, with legacy elevation/map defaults retained. The persisted park key remains `amberacres.save.v2`, and the settings key remains `amberacres.settings.v1`. Old raw localStorage saves at the same origin are readable without a conversion step. Browser data at another origin is not accessible; use a JSON backup to move saves when available.

`Z.Storage.init()` finishes before boot constructs the Continue button. Startup reads both backends, preferring the record with the later timestamp. Saves write localStorage synchronously, then complete an IndexedDB transaction. `Z.Main.save()` now returns `Promise<boolean>` and is true only when at least one backend reports a successful write. Every caller that displays success must await this promise. Cached memory alone never counts as a successful save.

New games save immediately. Foreground autosaves use 10 seconds of real frame elapsed time, independently of simulation speed. Hidden/pagehide handlers checkpoint before suspension. If localStorage fails, IndexedDB writes still need time to complete before browser termination; an abrupt OS kill can lose the last changes. Background events are not a substitute for regular checkpoints or backups.

Import accepts the same raw v2 format as export. It validates the format, attempts the normal simulation load, and restores the previous simulation if loading fails. Import errors leave the stored save untouched. Continue errors preserve the bad save for export rather than silently starting and autosaving a fresh park.

## Simulation contracts worth preserving

- `WX` is updated by weather/day logic and consumed by guests, animals and staff. Arrival, speed, thirst, hunger, energy, fun, spend, shelter, mood, sickness, escape and dirt modifiers belong to this shared calculation.
- `DIFF` is updated by `applyDifficulty()` and read by economy and arrivals.
- Typed terrain/path/fence/object arrays use `Z.N` and the existing pack/unpack helpers. Changing array lengths or state schemas needs a tested save migration.
- Research state (`genomes`, `stats`, traits and unlocks) is shared by simulation and research screens.

A later refactor could extract economy, guest AI, research and map generation from `dino/20-sim.js`, and terrain rendering from the world scripts. Those sections currently share closure variables. Give each a deliberate interface and regression tests before extracting it further.
