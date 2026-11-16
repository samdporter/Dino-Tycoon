# Dino Tycoon

A no-build browser game. The app is plain HTML, CSS, and JavaScript, with Three.js r128 vendored locally. There are no Node packages or install step.

## Run on your computer

Use Python 3.10 or newer from the extracted project directory:

```sh
python3 server.py
```

Open **http://localhost:8000/** in your browser. The development server listens on `127.0.0.1` and port `8000` by default. To choose another port, use `python3 server.py --port 8080` and open `http://localhost:8080/`.

## Play on a phone over your home network

1. Connect the phone and computer to the same Wi-Fi network.
2. On the computer, run `python3 server.py --lan`. This listens on all network interfaces; keep it running while playing.
3. Find the computer's local network IP address, then open **http://COMPUTER-IP:8000/** on the phone (for example, `http://192.168.1.20:8000/`). Allow the connection through the computer's firewall if prompted.

The LAN server is intended for a trusted home network. It serves only `index.html` and files under `src/`, `styles/`, and `vendor/`; it does not expose project docs, tests, Git metadata, or arbitrary filesystem paths.

For an installable iPhone home-screen shortcut, deploy the site to GitHub Pages and open its **HTTPS** URL in Safari. In Safari, tap **Share → Add to Home Screen**. The local LAN address uses HTTP and is for testing; use the HTTPS Pages address for the home-screen version.

## GitHub Pages

The browser/logic test workflow is `.github/workflows/tests.yml`. The deployment workflow in `.github/workflows/pages.yml` deploys on pushes to `main` and can also be started manually from the repository's Actions tab. It stages only `index.html`, `styles/`, `src/`, and `vendor/`, so development files and project notes are not published. In the repository settings, enable GitHub Pages with **GitHub Actions** as the build and deployment source.

To put this folder in a new GitHub repository, create an empty repository on GitHub, then run these commands from this project directory (replace the URL with the repository's HTTPS or SSH URL):

```sh
git init
git add .
git commit -m "Initial Dino Tycoon release"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Git and a GitHub account are required to publish. After the first push, enable Pages as described above. Later updates can be published with `git add .`, `git commit -m "Describe the change"`, and `git push`.

## Tests

Fast logic tests (Node.js 20 or newer, no packages to install) and Python HTTP checks:

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p test_server.py
```

For real browser tests, create a virtual environment, install the test dependencies and Playwright's Chromium browser:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install chromium
python3 -m pytest -q tests/test_browser.py
```

On Windows, activate with `.venv\Scripts\activate` instead. The suite uses a system `chromium`/`chromium-browser` when available, otherwise Playwright's managed browser. Set `CHROMIUM_EXECUTABLE_PATH` to choose another installed Chromium executable. Test dependencies are development-only; playing requires no packages.

To test WebKit separately:

```sh
python3 -m playwright install webkit
TEST_BROWSER=webkit python3 -m pytest -q tests/test_browser.py
```

On Linux you may need `python3 -m playwright install --with-deps chromium webkit` for browser system dependencies. WebKit testing is useful but does not replace checking a real iPhone. See [test results and limitations](docs/TESTING.md).

## Project layout

The browser loads the scripts in `index.html` in this order; their numeric prefixes indicate the intended dependency order:

| File | Responsibility |
| --- | --- |
| `vendor/three.r128.min.js` | Three.js renderer library |
| `src/00-data.js` | Game definitions and content |
| `src/10-core.js` | Shared state, helpers, and random number generator |
| `src/15-storage.js` | Browser persistence using localStorage and IndexedDB |
| `src/20-sim.js` | Simulation, actions, economy, research data, save/load, and map generation |
| `src/30-models.js` | Dinosaur, scenery, and building models |
| `src/40-world.js` | Three.js scene, terrain, entities, camera, and picking |
| `src/50-ui.js` | Shared interface and HUD |
| `src/51-tools.js` | Input handling and construction tools |
| `src/52-panels.js` | Inspect panels and adoption sheet |
| `src/53-screens.js` | Management screens and settings |
| `src/54-audio.js` | Synthesized sound |
| `src/55-tutorial.js` | Guided tutorial |
| `src/56-research.js` | Research interface |
| `src/57-guide.js` | In-game guide |
| `src/58-streetview.js` | First-person street view controls |
| `src/59-weather-hud.js` | Weather display |
| `src/60-main.js` | Title, startup, main loop, and autosave |

The `src/15-storage.js` module owns browser persistence and is loaded before the simulation. Save export/import controls are available in Settings and on the title screen. See [architecture and save contracts](docs/ARCHITECTURE.md) for extension points.

## Saves and browser storage

The original game was a single HTML file; this version must be served as a folder, with all source and vendor files alongside `index.html`.

The game stores saves and settings in browser `localStorage` and IndexedDB. It writes a new park immediately, autosaves every 10 seconds while playing, and attempts a checkpoint when the page is hidden or closed. Abrupt termination can still lose recent changes, especially when only IndexedDB is available. Use **Export save** from the title screen or Settings to download a JSON backup; **Import save** restores one, with confirmation before replacing an existing park. Browser storage is scoped to a site origin and browser profile, so a save made at `http://localhost:8000` is separate from one made at the GitHub Pages address, and neither automatically moves to another device. Browser storage has quotas and may be cleared by users or browsers; private browsing can make storage unavailable or temporary. Export backups before changing devices or addresses, and avoid private browsing for a park you want to keep.

Keep the same hostname, port, protocol, and browser when continuing a park. For example, `localhost` and `127.0.0.1` are different addresses for browser storage. A changing home-network IP also changes the save origin. For regular iPhone play, a stable HTTPS Pages URL avoids that problem. Open the hosted address directly in Safari, rather than a downloaded HTML preview.

Original v2 localStorage saves at the same origin remain compatible. Saves from an original downloaded HTML file cannot be automatically read by the hosted site. If the old game no longer has a persistent save, this refactor cannot reconstruct that lost progress.

The simulation and renderer remain larger files; the original feature boundaries have been preserved to limit gameplay changes. No GitHub repository has been created or published by this refactor.

Storage behavior and limits vary by browser. See the primary browser documentation:

- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN: Using the Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API)
- [WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/) (persistence is requested, not guaranteed)
- [MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) (direct file URLs have undefined storage behaviour)
- [WebKit: Tracking Prevention](https://webkit.org/tracking-prevention/) (Safari private browsing uses ephemeral storage)

## Further documentation

- [GitHub: publishing with GitHub Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Apple: adding a website to the iPhone Home Screen](https://support.apple.com/en-gb/guide/iphone/iphea86e5236/ios)
- [Playwright: installing browser engines](https://playwright.dev/python/docs/browsers)

## Licensing

The bundled Three.js library is distributed under the MIT License; its copyright and permission notice are preserved in [`vendor/THREE-LICENSE.txt`](vendor/THREE-LICENSE.txt). No license for the Dino Tycoon application code is specified here. Do not assume the app code carries the Three.js license.
