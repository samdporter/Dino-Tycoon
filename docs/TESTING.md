# Verification report — 16 November 2026

## Dino Tycoon v3 integration

Dino Tycoon v3 (`Dino_Tycoon_v3.html` / `Dino_Tycoon_v3_source.zip`) was ported into the multi-file repository layout (`index.html`, `styles/`, and `src/`), preserving the dual-backend `Z.Storage` persistence service (`localStorage` + `IndexedDB`), Export/Import save backup controls, and the Dino Tycoon / Zoo Tycoon title switcher (`styles/tycoon-menu.css`). Both games now load `Z.Storage` from `src/shared/15-storage.js` with separate storage identifiers.

- **Node logic, lifecycle, v3 systems and storage tests (`node --test tests/*.test.cjs`)**: 26 passed (including v3 island maps, moats, power grid, realms, monorail, safari, DNA lab, legacy v2 inland save compatibility, Dino and Zoo animal pathfinding/obstacle detouring, candidate fallback recovery, and Zoo save isolation).
- **Headless v3 simulation suites (`simtest.js`, `examples-test.js`, `soak.js`)**: All passed against the integrated `src/` modules, including all four Masterclass scenarios (`careful`, `reckless`, `moats`, `lab`) and the 15-row build/undo/bulldoze matrix + multi-day soak tests.
- **Python HTTP server tests (`python3 -m unittest discover -s tests -p test_server.py`)**: 3 passed, verifying `/` and `/index.html` (all 55 `src/*.js` scripts, `styles/game.css`, `styles/tycoon-menu.css`, `vendor/three.r128.min.js`), `/zoo.html` (all 12 `src/zoo/*.js` scripts), cache headers, and private-file/traversal blocking.
- **Playwright end-to-end browser tests (`tests/test_browser.py`)**: 16 passed in **Chromium** and 16 passed in **WebKit** across both desktop (`1280×900`) and phone (`390×844` touch emulation) viewports, covering title/setup rendering, save/reload/Continue, JSON export/import and rollback, `pagehide` and 10-second autosave, legacy `localStorage` migration, `IndexedDB` fallback, phone touch emulation and HUD layout bounds, v3 modal tabs (`power`, `news`, `res`, `ani`, `guide`, `set`), 3D portraits, DNA minigames, 14-step tutorial, Masterclass save protection, and Dino/Zoo save separation.

## Dino / Zoo menu update

The updated Wild Acres Zoo was extracted into `styles/zoo.css` and 12 scripts under `src/zoo/`. Comparison against the supplied HTML confirmed identical CSS and game code, with only the approved title navigation added. The embedded Three.js matches the existing vendor library after whitespace removal. All JavaScript files pass syntax checks.

- Node logic/lifecycle/storage checks: 22 passed, including two Zoo save-isolation checks.
- HTTP checks: 3 passed, including both entry points, every declared asset and private-file exclusions.
- Targeted browser checks: 2 passed in Chromium and 2 in WebKit, using desktop and phone viewports. These create a Dino park, switch to Zoo, create/save a zoo, switch back, verify both saves remain separate, and return to Continue the zoo.
- WebKit provides Safari engine coverage; the Safari app and physical iPhones were not tested. The existing full browser suite was not rerun for this change. Pages packaging was updated but no deployment was performed.

The earlier verification record below predates this menu work.

## Checks actually completed

| Check | Result |
| --- | --- |
| Syntax check of all 18 JavaScript files, including bundled Three.js | Passed |
| Node simulation, storage and lifecycle tests | 13 passed |
| Python HTTP integration tests | 2 passed |
| Python source parsing | Passed |
| Extracted HTML asset references point to existing files | Passed |

The Node tests execute the real simulation and serialization logic. They cover deterministic game creation, path/staff/animal persistence, typed terrain round trips, invalid save rejection, immediate new-game saves, backup import rollback, and corrupt Continue preservation. Storage tests model localStorage/IndexedDB backend success and failure; they do not run an actual browser database. Main lifecycle tests use minimal UI stubs rather than a renderer.

The HTTP tests start a real local server and check the entry page, assets, cache headers, private-file exclusions and encoded traversal handling. A separate manual server check also verified that a symlink from a public asset folder into a private project file is denied.

## Browser tests: implemented, not passed here

Seven Playwright scenarios are included for a real browser:

1. Title/setup controls, initial park and canvas smoke check.
2. Save, reload and Continue retaining money, a placed path and hired staff.
3. JSON export/import and invalid-import rollback.
4. Immediate initial save, pagehide checkpoint and 10-second foreground autosave.
5. Legacy same-origin localStorage save loading.
6. IndexedDB-only save/reload and total storage denial reporting.
7. Phone-sized touch emulation and graphics settings.

Chromium launch was attempted but aborted with `socket() failed: Operation not permitted`. The installed Playwright package had no downloaded WebKit executable. A browser download attempt failed. Retrying outside the process sandbox after explicit user authorisation was rejected because the session sets `sandbox_approval: false`.

The cloud browser also refused local-file navigation and could not reach the local HTTP server. No browser run, screenshot inspection, real Safari test, or WebKit test is claimed to have passed. The browser suite is development code awaiting its first successful full run. HTTP and mocked Node tests do not establish browser compatibility.

Run instructions are in the README. The included `tests.yml` GitHub Actions workflow runs Chromium and WebKit separately after dependencies are installed. That workflow has not been submitted to GitHub or executed here. The Pages deployment workflow has likewise not been run.

## Recommended iPhone acceptance check

Use one stable hosted HTTPS address in normal Safari. Start a park, place a path and hire staff, wait at least 10 seconds, reload, and Continue. Then switch apps and return. Export a JSON backup, change the park, and import that backup. Repeat from a Home Screen shortcut if using it. Check the save status in Settings. Test that setup as its own storage context rather than assuming the browser tab's progress has transferred.

Persistence requests can be refused and browser data can still be cleared. Export is the portable backup; there is no cloud synchronisation or server-side save service in this project.
