# Verification report — 16 November 2026

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
