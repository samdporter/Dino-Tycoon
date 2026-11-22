# Dino Tycoon

A browser game built with plain HTML, CSS, JavaScript and Three.js. No build or install step is needed to play.

**[Play Dino Tycoon](https://samdporter.github.io/Dino-Tycoon/)**

On iPhone, open the link in Safari and choose **Share → Add to Home Screen** for a home-screen shortcut.

Choose **Dino Tycoon** (Amber Acres) or **Zoo Tycoon** (Wild Acres Zoo) on either title screen. Each game keeps its own park and settings.

## Saves

Parks autosave in your browser. Saves stay with that browser and site address; they do not sync between devices or transfer automatically from localhost to the hosted game. Browser data can be cleared, private browsing may make saves temporary or unavailable, and abruptly closing the game can lose recent changes.

In Dino Tycoon, use **Export save** on the title screen or in Settings to keep a JSON backup or move a park. **Import save** restores it, asking before replacing an existing park. Back up before changing devices or addresses. For regular play, use the hosted link in the same browser rather than a downloaded HTML file.

Original v2 saves at the same site address remain compatible. The hosted game cannot read saves from a downloaded HTML file or recover lost progress.

## Run locally

With Python 3.10 or newer:

```sh
python3 server.py
```

Open **http://localhost:8000/**. Use `--port 8080` for another port, or `--lan` to play over trusted home Wi-Fi at `http://COMPUTER-IP:8000/`.

## Development

Pushes to `main` deploy the game through [GitHub Actions](https://github.com/samdporter/Dino-Tycoon/actions/workflows/pages.yml). Only `index.html`, `zoo.html`, `styles/`, `src/` and `vendor/` are published.

Run the logic and HTTP tests (Node.js 20+ and Python):

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p test_server.py
```

Run browser tests in a virtual environment:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install chromium webkit
python3 -m pytest -q tests/test_browser.py
TEST_BROWSER=webkit python3 -m pytest -q tests/test_browser.py
```

Add `-n 4` to run the browser tests in parallel locally. CI runs them serially, because parallel WebGL games overload its software-rendered runners.

On Windows, activate with `.venv\Scripts\activate`. On Linux, add `--with-deps` to the Playwright install command if browser system dependencies are missing.

See [architecture and save contracts](docs/ARCHITECTURE.md) and [test results and limitations](docs/TESTING.md).

## Licensing

Three.js is bundled under the [MIT License](vendor/THREE-LICENSE.txt). No licence is specified for the game code.
