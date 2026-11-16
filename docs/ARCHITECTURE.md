# Architecture

This refactor extracts the original game's existing sections, preserves their dependency order and save version, and adds a dedicated storage service. The simulation and renderer remain large files; this is a conservative first separation, rather than a rewrite of their internals.

## Loading and ownership

`index.html` explicitly lists classic deferred scripts. They run in document order after HTML parsing. No bundler, package registry, CDN, or runtime network API is required. Keep this order when adding files. Do not change individual scripts to ES modules without also replacing their shared `Z` namespace references.

- `00-data.js`: definitions, maps, species, costs, research content.
- `10-core.js`: typed state arrays, random number generator, event bus, serialization helpers.
- `15-storage.js`: localStorage checkpoints, IndexedDB records, startup selection, storage status. It does not interpret park contents.
- `20-sim.js`: owns live simulation state and game actions; exports `Z.Sim`. Prefer changing state through those actions rather than editing `Z.state` from the UI.
- `30-models.js` and `40-world.js`: geometry and presentation. Do not move authoritative simulation state into scene objects.
- `50` through `59`: UI, construction tools, panels, audio, tutorial, research, guide, street view, weather.
- `60-main.js`: lifecycle, screens, timing, save coordination and JSON import/export.

Rendering and UI observe `Z.state` and the `Z.bus` event bus. A `reset` event follows simulation resets/loads; renderer and UI rebuild their derived views. Runtime simulation caches are recreated by `Sim.load`, so serialized JSON need not be byte-identical after a load.

## Zoo entry point

`zoo.html` loads Wild Acres Zoo from `styles/zoo.css` and the ordered classic scripts in `src/zoo/`. These files preserve the supplied Zoo game's existing module boundaries and behaviour. Both games reuse the identical bundled Three.js library. Each page loads only its own game scripts, so their `Z` namespaces remain independent. `styles/tycoon-menu.css` styles the title-screen links between the two entry points.

Zoo retains its own localStorage keys: `wildacres.save.v1`, `wildacres.settings.v1` and `wazoo_tut`. Dino's keys remain unchanged. Zoo keeps its original storage implementation; the Dino storage service and backup controls described below apply to Dino.

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

A later refactor could extract economy, animal AI, guest AI, research and map generation from `20-sim.js`; similarly terrain, weather and camera code from `40-world.js`. Those sections currently share closure variables. Give each a deliberate interface and regression tests before extracting them further.
