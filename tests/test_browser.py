"""End-to-end browser coverage for Dino Tycoon persistence and core UI."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def get_free_port() -> int:
    env_port = os.environ.get("TEST_PORT")
    if env_port:
        return int(env_port)
    xdist_worker = int(os.environ.get("PYTEST_XDIST_WORKER", "gw0")[2:])
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", 8768 + xdist_worker))
            return 8768 + xdist_worker
        except OSError:
            pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PORT = get_free_port()
BASE = f"http://127.0.0.1:{PORT}/"


@pytest.fixture(scope="session")
def server():
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--port", str(PORT)],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    )
    import urllib.request
    for _ in range(100):
        if proc.poll() is not None:
            raise RuntimeError("server.py exited before becoming ready")
        try:
            urllib.request.urlopen(BASE, timeout=0.2).close()
            break
        except Exception:
            time.sleep(0.1)
    else:
        proc.terminate()
        raise RuntimeError(f"server.py did not become ready on port {PORT}")
    yield BASE
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


@pytest.fixture(scope="session")
def browser(server, request):
    if "PLAYWRIGHT_BROWSERS_PATH" not in os.environ and Path("/tmp/dino-playwright-browsers").is_dir():
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/tmp/dino-playwright-browsers"
    with sync_playwright() as p:
        ini_engine = request.config.getini("junit_suite_name").lower()
        engine = (os.environ.get("TEST_BROWSER") or (ini_engine if ini_engine in ("chromium", "webkit", "firefox") else "chromium")).lower()
        browser_type = getattr(p, engine)
        # Only use a system Chromium when asked: GitHub's Ubuntu runners ship /usr/bin/chromium,
        # which renders far slower than Playwright's bundled build and made CI time out.
        executable = os.environ.get("CHROMIUM_EXECUTABLE_PATH") if engine == "chromium" else None
        kwargs = {"headless": True}
        if executable:
            kwargs["executable_path"] = executable
        if engine == "chromium" and (executable or os.environ.get("CI")):
            kwargs["args"] = ["--no-sandbox", "--enable-unsafe-swiftshader"]
        elif engine == "chromium":
            # The headless shell blocks the main thread on WebGL on macOS; full Chromium in new headless mode does not.
            kwargs["channel"] = "chromium"
        b = browser_type.launch(**kwargs)
        yield b
        b.close()


def open_game(browser, *, path="", mobile=False, init_script=None):
    context = browser.new_context(
        viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 900},
        device_scale_factor=1, is_mobile=mobile, has_touch=mobile,
        accept_downloads=True,
    )
    context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
    if init_script:
        context.add_init_script(init_script)
    page = context.new_page()
    problems = []
    page.on("pageerror", lambda error: problems.append(f"pageerror: {error}"))
    page.on("console", lambda msg: problems.append(f"console error: {msg.text}") if msg.type == "error" else None)
    page.on("response", lambda r: problems.append(f"http {r.status}: {r.url}") if r.status >= 400 else None)
    target = f"{BASE}{path}"
    page.goto(target, wait_until="load", timeout=60000)
    page.wait_for_function("window.Z && Z.Main && Z.Storage && !document.querySelector('#boot:not(.gone)')", timeout=60000)
    return context, page, problems


def open_zoo(browser, *, mobile=False, init_script=None):
    return open_game(browser, path="zoo.html", mobile=mobile, init_script=init_script)


def new_park(page, difficulty="normal", expect_save=True):
    page.get_by_role("button", name="New game").click()
    page.get_by_role("button", name="Start park").wait_for()
    page.locator(".sdiff[data-id='" + difficulty + "']").click()
    page.get_by_role("button", name="Start park").click()
    page.wait_for_function("Z.Main.playing && Z.state")
    page.evaluate("Z.state.speed = 0")
    if expect_save:
        page.wait_for_function("!!localStorage.getItem('amberacres.save.v2')", timeout=10000)


def js(page, expr):
    return page.evaluate(expr)


def assert_no_browser_errors(problems):
    assert not problems, "Unexpected browser errors:\n" + "\n".join(problems)


def test_title_setup_and_canvas_render(browser, tmp_path):
    context, page, problems = open_game(browser)
    try:
        assert page.title() == "Amber Acres"
        assert page.get_by_role("button", name="New game").is_visible()
        page.get_by_role("button", name="New game").click()
        assert page.get_by_text("Choose your land").is_visible()
        assert page.locator(".smap").count() >= 1
        assert page.locator(".sdiff").count() == 3
        page.locator(".sdiff[data-id='easy']").click()
        page.get_by_role("button", name="Start park").click()
        page.wait_for_function("Z.Main.playing")
        page.evaluate("Z.state.speed = 0")
        shot = tmp_path / "render.png"
        page.screenshot(path=str(shot))
        assert shot.stat().st_size > 15000
        # Canvas dimensions and the screenshot are smoke checks; inspect the image for visual correctness.
        assert js(page, "!!document.querySelector('#world canvas')")
        assert js(page, "document.querySelector('#world canvas').width > 0")
        assert js(page, "Z.state.money === 35000")
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_reload_continue_retains_money_path_and_staff(browser):
    context, page, problems = open_game(browser)
    try:
        new_park(page)
        saved = js(page, """(() => {
          Z.state.money = 123456;
          let spot = null;
          for (let j = 4; j < Z.N && !spot; j++) for (let i = 4; i < Z.N && !spot; i++)
            if (Z.Sim.placePath(i,j,'paved',{dry:true}).ok) spot = [i,j];
          if (!spot) throw new Error('No available tile for path persistence test');
          const result = Z.Sim.placePath(spot[0],spot[1],'paved');
          if (!result.ok) throw new Error('Path placement failed: ' + result.msg);
          const pathIndex = spot[0] + spot[1] * Z.N;
          if (!Z.Sim.hireStaff('keeper').ok) throw new Error('Staff hiring failed');
          Z.state.speed = 0;
          return { spot, pathIndex, money: Z.state.money };
        })()""")
        assert js(page, "Z.Main.save()") is True
        page.reload(wait_until="load")
        page.wait_for_function("Z.Main && !document.querySelector('#boot:not(.gone)')")
        assert page.get_by_role("button", name="Continue").is_visible()
        page.get_by_role("button", name="Continue").click()
        page.wait_for_function("Z.Main.playing")
        page.evaluate("Z.state.speed = 0")
        assert js(page, "Z.state.money") == saved["money"]
        assert js(page, "Z.state.staff.length") >= 1
        assert js(page, f"Z.state.path[{saved['pathIndex']}]") > 0
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_export_import_and_malformed_import_rollback(browser, tmp_path):
    context, page, problems = open_game(browser)
    try:
        new_park(page)
        js(page, "Z.state.speed = 0; Z.state.money = 76543; Z.Main.save()")
        with page.expect_download() as info:
            js(page, "Z.Main.exportSave()")
        download = info.value
        target = tmp_path / download.suggested_filename
        download.save_as(target)
        exported = json.loads(target.read_text())
        assert exported["v"] == 2 and exported["s"]["money"] == 76543
        raw = json.dumps(exported).replace('"money": 76543', '"money": 22222')
        assert js(page, f"Z.Main.importSave({json.dumps(raw)})") is True
        assert js(page, "Z.state.money") == 22222
        before = js(page, "({money:Z.state.money,staff:Z.state.staff.length,path:Array.from(Z.state.path).filter(Boolean).length,animals:Z.state.animals.length})")
        assert js(page, "Z.Main.importSave('{bad json')") is False
        assert js(page, "({money:Z.state.money,staff:Z.state.staff.length,path:Array.from(Z.state.path).filter(Boolean).length,animals:Z.state.animals.length})") == before
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_immediate_pagehide_and_ten_second_autosave(browser):
    context, page, problems = open_game(browser)
    try:
        new_park(page)
        # New game writes immediately without waiting for the autosave timer.
        assert js(page, "!!localStorage.getItem('amberacres.save.v2')")
        js(page, "Z.state.money = 188888")
        page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        assert json.loads(js(page, "localStorage.getItem('amberacres.save.v2')"))["s"]["money"] == 188888
        js(page, "Z.state.money = 199999")
        # Real wall clock is intentional: requestAnimationFrame elapsed-time accounting.
        page.wait_for_function("JSON.parse(localStorage.getItem('amberacres.save.v2') || '{}').s?.money === 199999", timeout=18000)
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_same_origin_legacy_localstorage_migration(browser):
    context, page, problems = open_game(browser)
    try:
        new_park(page)
        valid = js(page, "JSON.parse(Z.Sim.save())")
        valid["s"]["money"] = 54321
        raw = json.dumps(valid)
        # The following fresh browser context has isolated IndexedDB, so the
        # preseeded localStorage value is the only migration source.
    finally:
        context.close()
    context, page, problems = open_game(browser, init_script="localStorage.setItem('amberacres.save.v2', " + json.dumps(raw) + "); localStorage.removeItem('amberacres.save.v2.time');")
    try:
        assert page.get_by_role("button", name="Continue").is_visible()
        page.get_by_role("button", name="Continue").click()
        page.wait_for_function("Z.Main.playing")
        page.evaluate("Z.state.speed = 0")
        assert js(page, "Z.state.money") == 54321
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_indexeddb_fallback_and_total_storage_denial(browser):
    # Make localStorage writes fail but leave IndexedDB functional.
    context, page, problems = open_game(browser, init_script="Storage.prototype.setItem = function(){ throw new DOMException('blocked','QuotaExceededError') }")
    try:
        new_park(page, expect_save=False)
        js(page, "Z.state.speed = 0; Z.state.money = 77777")
        ok = js(page, "Z.Main.save()")
        assert ok is True
        assert js(page, "!!localStorage.getItem('amberacres.save.v2')") is False
        assert js(page, "Z.Storage.status().startsWith('Saved on this device')")
        page.reload(wait_until="load")
        page.wait_for_function("Z.Main && !document.querySelector('#boot:not(.gone)')")
        assert page.get_by_role("button", name="Continue").is_visible()
        page.get_by_role("button", name="Continue").click()
        page.wait_for_function("Z.Main.playing")
        page.evaluate("Z.state.speed = 0")
        assert js(page, "Z.state.money") == 77777
    finally:
        context.close()
    # Deny both browser persistence mechanisms; Main.save must resolve false.
    denied = "Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError')}; Object.defineProperty(window,'indexedDB',{value:{open:function(){throw new DOMException('blocked','SecurityError')}}});"
    context, page, problems = open_game(browser, init_script=denied)
    try:
        new_park(page, expect_save=False)
        assert js(page, "Z.Main.save()") is False
        assert js(page, "Z.Storage.status().startsWith('Save failed')")
    finally:
        assert_no_browser_errors(problems)
        context.close()


def test_phone_touch_emulation_and_settings(browser):
    context, page, problems = open_game(browser, mobile=True)
    try:
        new_park(page)
        assert js(page, "Z.UI.touch()")
        # Settings route is available through the actual tabbed screen API.
        js(page, "Z.UI.openModal('set')")
        assert page.get_by_text("Sound & picture").is_visible()
        page.get_by_role("button", name="Low", exact=True).click()
        assert js(page, "Z.Main.getQuality()") == "low"
        assert page.locator("#world canvas").is_visible()
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("newest_backend", ["local", "idb"])
@pytest.mark.parametrize("corruption", ["invalid_json", "broken_state"])
def test_phone_continue_recovers_older_backend_copy(browser, newest_backend, corruption):
    context, page, problems = open_game(browser, mobile=True)
    try:
        new_park(page)
        js(page, "Z.state.money = 43210; Z.state.speed = 0")
        valid = js(page, "Z.Sim.save()")
        if corruption == "invalid_json":
            corrupt = "{invalid JSON"
        else:
            broken = json.loads(valid)
            # This passes format checks, then throws after Sim.load assigns state.
            broken["s"]["guests"] = None
            broken["s"]["money"] = 999
            corrupt = json.dumps(broken)
        # Stop lifecycle checkpoints before seeding divergent backend copies.
        js(page, "Z.Main.showTitle()")
        seed_backend_copies(page, valid, corrupt, newest_backend)
        page.reload(wait_until="load")
        page.wait_for_function("Z.Main && !document.querySelector('#boot:not(.gone)')")
        page.get_by_role("button", name="Continue").click()
        page.wait_for_function("Z.Main.playing")
        js(page, "Z.state.speed = 0")
        assert js(page, "Z.state.money") == 43210
        assert js(page, "Z.UI.touch()")
        assert_no_browser_errors(problems)
    finally:
        context.close()


def seed_backend_copies(page, older, newer, newest_backend):
    page.evaluate("""async ({older, newer, newestBackend}) => {
      const key = 'amberacres.save.v2', time = Date.now() + 1000;
      localStorage.setItem(key, newestBackend === 'local' ? newer : older);
      localStorage.setItem(key + '.time', String(newestBackend === 'local' ? time + 1 : time));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('amberacres', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('saves', 'readwrite');
          tx.objectStore('saves').put({
            value: newestBackend === 'idb' ? newer : older,
            updatedAt: newestBackend === 'idb' ? time + 1 : time
          }, key);
          tx.oncomplete = resolve;
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    }""", {"older": older, "newer": newer, "newestBackend": newest_backend})


def test_phone_continue_preserves_both_corrupt_copies(browser):
    context, page, problems = open_game(browser, mobile=True)
    try:
        new_park(page)
        js(page, "Z.Main.showTitle()")
        seed_backend_copies(page, "older corrupt copy", "newer corrupt copy", "idb")
        page.reload(wait_until="load")
        page.wait_for_function("Z.Main && !document.querySelector('#boot:not(.gone)')")
        snapshot = "({money:Z.state.money,day:Z.state.day,animals:Z.state.animals.length,staff:Z.state.staff.length,path:Array.from(Z.state.path)})"
        js(page, "Z.state.speed = 0")
        before = js(page, snapshot)
        page.get_by_role("button", name="Continue").click()
        assert js(page, "Z.Main.playing") is False
        assert js(page, snapshot) == before
        assert js(page, "localStorage.getItem('amberacres.save.v2')") == "older corrupt copy"
        assert js(page, "Z.Storage.get('amberacres.save.v2')") == "newer corrupt copy"
        assert page.get_by_role("button", name="Export save").is_visible()
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize('mobile', [False, True])
def test_choose_tycoon_and_preserve_separate_saves(browser, mobile):
    context, page, problems = open_game(browser, mobile=mobile)
    try:
        assert page.get_by_role('link', name='Dino Tycoon', exact=True).get_attribute('aria-current') == 'page'
        new_park(page)
        page.evaluate('Z.Main.toTitle()')
        dino_save = page.evaluate("localStorage.getItem('amberacres.save.v2')")
        page.get_by_role('link', name='Zoo Tycoon', exact=True).click()
        page.wait_for_function("window.Z && Z.Main && document.querySelector('#title.on') && !document.querySelector('#boot:not(.gone)')")
        assert page.title() == 'Wild Acres Zoo'
        assert page.get_by_role('link', name='Zoo Tycoon', exact=True).get_attribute('aria-current') == 'page'
        assert not page.get_by_role('button', name='Continue', exact=True).count()
        page.get_by_role('button', name='New game', exact=True).click()
        page.wait_for_function("Z.Main.playing")
        assert page.evaluate("Z.Main.save()")
        assert page.evaluate("!!localStorage.getItem('wildacres.save.v1')")
        # Returning to a title checkpoints the running park; compare afterwards.
        page.evaluate('Z.Main.toTitle()')
        assert page.evaluate("localStorage.getItem('amberacres.save.v2')") == dino_save
        dino_before_switch = page.evaluate("localStorage.getItem('amberacres.save.v2')")
        zoo_before_switch = page.evaluate("localStorage.getItem('wildacres.save.v1')")
        page.get_by_role('link', name='Dino Tycoon', exact=True).click()
        page.wait_for_function("window.Z && Z.Main && document.querySelector('#title.on') && !document.querySelector('#boot:not(.gone)')")
        assert page.get_by_role('button', name='Continue', exact=True).is_visible()
        assert page.evaluate("localStorage.getItem('amberacres.save.v2')") == dino_before_switch
        assert page.evaluate("localStorage.getItem('wildacres.save.v1')") == zoo_before_switch
        page.get_by_role('link', name='Zoo Tycoon', exact=True).click()
        page.get_by_role('button', name='Continue', exact=True).click()
        page.wait_for_function('Z.Main.playing')
        assert not problems
    finally:
        context.close()


def new_zoo_park(page, map_id="lakeland", difficulty="hard", expect_save=True):
    page.locator("#title button", has_text="Park setup").click()
    page.locator(f".smap[data-id='{map_id}']").wait_for()
    page.locator(f".smap[data-id='{map_id}']").click()
    page.locator(f".sdiff[data-id='{difficulty}']").click()
    page.get_by_role("button", name="Start park").click()
    page.wait_for_function("Z.Main.playing && Z.state")
    page.evaluate("Z.state.speed = 0")
    if expect_save:
        page.wait_for_function("!!localStorage.getItem('wildacres.save.v1')", timeout=10000)


def seed_zoo_backend_copies(page, older, newer, newest_backend):
    page.evaluate("""async ({older, newer, newestBackend}) => {
      const key = 'wildacres.save.v1', time = Date.now() + 1000;
      localStorage.setItem(key, newestBackend === 'local' ? newer : older);
      localStorage.setItem(key + '.time', String(newestBackend === 'local' ? time + 1 : time));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('wildacres', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('saves', 'readwrite');
          tx.objectStore('saves').put({
            value: newestBackend === 'idb' ? newer : older,
            updatedAt: newestBackend === 'idb' ? time + 1 : time
          }, key);
          tx.oncomplete = resolve;
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    }""", {"older": older, "newer": newer, "newestBackend": newest_backend})


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_park_setup_modal_custom_map_and_difficulty(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        assert page.title() == "Wild Acres Zoo"
        map_choice = "highland" if mobile else "lakeland"
        diff_choice = "easy" if mobile else "hard"
        new_zoo_park(page, map_id=map_choice, difficulty=diff_choice)
        assert js(page, "Z.Main.playing") is True
        assert page.locator("#world canvas").is_visible()
        assert js(page, "document.querySelector('#world canvas').width > 0")
        assert js(page, "Z.state.map.id") == map_choice
        assert js(page, "Z.state.difficulty") == diff_choice
        assert js(page, "Z.UI.touch()") == mobile
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_construction_and_undo(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        new_zoo_park(page, map_id="meadow", difficulty="normal")
        assert js(page, "Z.UI.touch()") == mobile

        # 1. Place a path and undo
        start_money = js(page, "Z.state.money")
        spot = js(page, """(() => {
          for (let j = 12; j < 35; j++) {
            for (let i = 12; i < 35; i++) {
              if (Z.Sim.placePath(i, j, 'paved', {dry: true}).ok) return [i, j];
            }
          }
          return null;
        })()""")
        assert spot is not None
        i, j = spot
        tile_idx = i + j * js(page, "Z.N")
        res = js(page, f"Z.Sim.placePath({i}, {j}, 'paved')")
        assert res.get("ok") is True
        assert js(page, f"Z.state.path[{tile_idx}]") > 0
        assert js(page, "Z.state.money") < start_money
        assert js(page, "Z.Sim.canUndo().count > 0")

        js(page, "Z.UI.updateUndo(true)")
        assert page.locator("#undoBtn").is_visible()
        if mobile:
            js(page, "Z.UI.doUndo()")
        else:
            page.locator("#undoBtn").click()

        assert js(page, f"Z.state.path[{tile_idx}]") == 0
        assert js(page, "Z.state.money") == start_money
        assert js(page, "Z.Sim.canUndo().count == 0")

        # 2. Paint terrain and undo
        target_terr = js(page, """(() => {
          const cur = Z.DATA.terrain[Z.state.terrain[15 + 15 * Z.N]].id;
          return cur === 'grass' ? 'dirt' : 'grass';
        })()""")
        terr_res = js(page, f"Z.Sim.paintTerrain(15, 15, '{target_terr}', 0)")
        assert terr_res.get("ok") is True
        assert js(page, "Z.Sim.canUndo().count > 0")
        js(page, "Z.UI.updateUndo(true)")
        assert page.locator("#undoBtn").is_visible()
        js(page, "Z.UI.doUndo()")
        assert js(page, "Z.Sim.canUndo().count == 0")
        assert js(page, "Z.state.money") == start_money

        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_terraforming_sculpting(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        new_zoo_park(page, map_id="lakeland", difficulty="normal")
        h0 = js(page, "Z.Sim.heightAt(20 * Z.TILE, 20 * Z.TILE)")
        tf_raise = js(page, "Z.Sim.terraform(20, 20, 'raise', 1)")
        assert tf_raise.get("ok") is True
        h1 = js(page, "Z.Sim.heightAt(20 * Z.TILE, 20 * Z.TILE)")
        assert h1 > h0
        tf_lower = js(page, "Z.Sim.terraform(20, 20, 'lower', 1)")
        assert tf_lower.get("ok") is True
        h2 = js(page, "Z.Sim.heightAt(20 * Z.TILE, 20 * Z.TILE)")
        assert h2 < h1
        js(page, "Z.World.snapCamera()")
        assert js(page, "document.querySelector('#world canvas').width > 0")
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_weather_hud(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        new_zoo_park(page, map_id="meadow", difficulty="normal")
        chip = page.locator("#wxchip")
        assert chip.is_visible()
        chip.click()
        page.wait_for_function("document.querySelector('#wxpop.on')")
        assert page.locator("#wxpop.on").is_visible()
        assert page.locator("#wxpop .wxh").is_visible()
        assert page.locator("#wxpop .wxfx").is_visible()
        chip.click()
        page.wait_for_function("!document.querySelector('#wxpop.on')")
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_street_view_mode(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        new_zoo_park(page, map_id="meadow", difficulty="normal")
        js(page, "Z.UI.StreetView.toggle()")
        page.wait_for_function("document.body.classList.contains('sv-on') && document.querySelector('#svbar')")
        assert page.locator("#svbar").is_visible()
        assert page.locator("#svbar .svdial, .svdial, #svdial").is_visible()

        page.locator("#svbar select.svsel").select_option("gate")
        page.wait_for_function("Math.abs(Z.World.svInfo().x - 56) < 2 && Math.abs(Z.World.svInfo().z - 106) < 2", timeout=5000)

        if mobile:
            page.locator(".svexit").click()
        else:
            js(page, "Z.UI.StreetView.toggle()")
        page.wait_for_function("!document.body.classList.contains('sv-on') && !Z.World.svInfo().on")
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_habitat_and_species_guide(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        new_zoo_park(page, map_id="meadow", difficulty="normal")
        js(page, "Z.UI.openModal('guide')")
        page.wait_for_function("document.querySelector('.gd-seg')")

        # Plants section
        assert page.locator(".gd-seg button", has_text="Plants").is_visible()
        assert page.locator(".gd-grid .gd-card").count() > 0

        # Additions section
        page.locator(".gd-seg button", has_text="Additions").click()
        page.wait_for_function("document.querySelector('.gd-intro')?.textContent?.includes('additions')")
        assert page.locator(".gd-grid .gd-card").count() > 0

        # Species & Needs section
        page.locator(".gd-seg button", has_text="Species & Needs").click()
        page.wait_for_function("document.querySelector('.gd-intro')?.textContent?.includes('habitat guide')")
        assert page.locator(".gd-grid .gd-card").count() > 0

        js(page, "Z.UI.closeModal()")
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_save_export_import_and_storage_recovery(browser, mobile, tmp_path):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        new_zoo_park(page, map_id="meadow", difficulty="normal")

        # Settings modal showing Export save and Import save
        js(page, "Z.UI.openModal('set')")
        page.wait_for_function("document.querySelector('#modal.on')")
        assert page.get_by_role("button", name="Export save").is_visible()
        assert page.get_by_role("button", name="Import save").is_visible()

        with page.expect_download() as info:
            page.get_by_role("button", name="Export save").click()
        download = info.value
        export_file = tmp_path / download.suggested_filename
        download.save_as(export_file)
        assert "wild-acres" in download.suggested_filename
        exported_data = json.loads(export_file.read_text())
        assert exported_data.get("v") in (1, 2)
        js(page, "Z.UI.closeModal()")

        # Z.Storage.get('wildacres.save.v1')
        js(page, "Z.state.money = 78910; Z.Main.save()")
        saved_raw = js(page, "Z.Storage.get('wildacres.save.v1')")
        assert saved_raw is not None
        assert json.loads(saved_raw)["s"]["money"] == 78910

        # Z.Main.importSave with modified valid save
        modified_raw = json.dumps(json.loads(saved_raw)).replace('"money": 78910', '"money": 45454')
        import_ok = js(page, f"Z.Main.importSave({json.dumps(modified_raw)})")
        assert import_ok is True
        assert js(page, "Z.state.money") == 45454

        # Rollback on malformed import
        bad_import = js(page, "Z.Main.importSave('{malformed json')")
        assert bad_import is False
        assert js(page, "Z.state.money") == 45454

        # Storage recovery: recover older backend copy when newest backend is corrupt
        valid_state = js(page, "Z.Sim.save()")
        js(page, "Z.Main.showTitle()")
        seed_zoo_backend_copies(page, valid_state, "{corrupt IDB copy", "idb")
        page.reload(wait_until="load")
        page.wait_for_function("Z.Main && !document.querySelector('#boot:not(.gone)')")
        assert page.get_by_role("button", name="Continue").is_visible()
        page.get_by_role("button", name="Continue").click()
        page.wait_for_function("Z.Main.playing")
        js(page, "Z.state.speed = 0")
        assert js(page, "Z.state.money") == 45454
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_park_lockdown(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        new_zoo_park(page, map_id="meadow", difficulty="normal")
        assert js(page, "Z.Sim.isLockdown()") is False
        assert not page.locator("#lockbar.on").count()

        # Spawn an escaped dangerous animal (lion) on a tile without fences
        js(page, """(() => {
          const lion = Z.Sim.spawnAnimal('lion', 20, 20);
          lion.state = 'escaped';
          return lion.id;
        })()""")

        # Advance simulation to trigger lockdown check
        js(page, "Z.Sim._step(1.5)")
        page.wait_for_function("Z.Sim.isLockdown() && document.querySelector('#lockbar.on')", timeout=5000)
        assert page.locator("#lockbar.on").is_visible()
        assert js(page, "Z.Sim.isLockdown()") is True

        # Clear escaped dangerous animal and verify lockdown lifts
        js(page, """(() => {
          const l = Z.state.animals.find(a => a.species === 'lion');
          if (l) Z.Sim.sellAnimal(l.id);
          Z.Sim._step(1.5);
        })()""")
        page.wait_for_function("!Z.Sim.isLockdown() && !document.querySelector('#lockbar.on')", timeout=5000)
        assert not page.locator("#lockbar.on").count()
        assert js(page, "Z.Sim.isLockdown()") is False

        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize('mobile', [False, True])
def test_v3_features_and_phone_ui(browser, mobile):
    context, page, problems = open_game(browser, mobile=mobile)
    try:
        vp_w = 390 if mobile else 1280
        assert page.get_by_role('button', name='Masterclass: watch example games').is_visible()
        nav_box = page.locator('.tycoon-choice').bounding_box()
        assert nav_box and nav_box['x'] >= 0 and nav_box['x'] + nav_box['width'] <= vp_w
        new_park(page)
        assert js(page, 'Boolean(Z.Sim.isIsland()) && Z.Sim.seaMask().some(v => v > 0)')
        assert js(page, "document.querySelector('#tut')?.textContent.includes('1/14')")
        assert js(page, "Z.UI.Portrait.supported('triceratops') === true && Z.UI.Minigames.list.length === 6")
        for sel in ['#hud', '#build']:
            box = page.locator(sel).bounding_box()
            assert box and box['x'] >= -1 and box['x'] + box['width'] <= vp_w + 1, (sel, box)
        js(page, 'Z.state.money = 98765; Z.Main.save()')
        # Verify v3 extra tabs (Power, News, Research DNA, Dinosaurs 3D Portrait)
        for tab in ['power', 'news', 'res', 'ani', 'guide', 'set']:
            js(page, f"Z.UI.openModal('{tab}')")
            assert js(page, 'Z.UI.modalOpen()') is True
        js(page, 'Z.UI.closeModal()')
        # Verify Masterclass does not overwrite the player's saved park
        js(page, "Z.UI.Masterclass.start('careful')")
        assert js(page, 'Z.Main.watching === true && Z.UI.Masterclass.on === true')
        assert js(page, 'Z.Main.save()') is False
        js(page, 'Z.UI.Masterclass.exit()')
        assert js(page, 'Z.Main.watching === false && Z.Main.playing === true')
        assert js(page, 'Z.state.money') == 98765
        assert json.loads(js(page, "localStorage.getItem('amberacres.save.v2')"))['s']['money'] == 98765
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_monorail_single_station_loop_and_moat_bridge_staff(browser):
    context, page, problems = open_game(browser)
    try:
        new_park(page, difficulty="easy")
        setup = js(page, """(() => {
          Z.state.money = 250000;
          Z.state.unlocked.star = 5;
          for (let j = 13; j <= 34; j++) for (let i = 15; i <= 34; i++) {
            Z.Sim.bulldoze(i, j);
            Z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
            Z.state.terrain[i + j * Z.N] = 0;
          }
          for (let i = 20; i <= 27; i++) Z.Sim.placePath(i, 22, 'paved');
          for (let j = 22; j <= 39; j++) Z.Sim.placePath(27, j, 'paved');
          const st = Z.Sim.placeObject('monorail_station', 20, 20, 0);
          const gen = Z.Sim.placeObject('diesel_gen', 23, 23, 2);
          const sub = Z.Sim.placeObject('substation', 20, 23, 2);
          const route = [];
          for (let i = 23; i <= 26; i++) route.push(i + 20 * Z.N);
          for (let j = 19; j >= 15; j--) route.push(26 + j * Z.N);
          for (let i = 25; i >= 17; i--) route.push(i + 15 * Z.N);
          for (let j = 16; j <= 20; j++) route.push(17 + j * Z.N);
          route.push(18 + 20 * Z.N, 19 + 20 * Z.N, 20 + 20 * Z.N);
          const tr = Z.Sim.monorail.buildTrack(route);
          const bt = Z.Sim.monorail.buyTrain(st.id, 2);
          // Moat + bridge enclosure
          const ditch = [];
          for (let j = 14; j <= 20; j++) for (let i = 28; i <= 34; i++) {
            if (i >= 30 && i <= 32 && j >= 16 && j <= 18) continue;
            ditch.push({ i, j });
          }
          const dg = Z.Sim.moats.dig(ditch, 2);
          for (let j = 21; j <= 22; j++) Z.Sim.placePath(31, j, 'paved');
          for (let i = 27; i <= 31; i++) Z.Sim.placePath(i, 22, 'paved');
          const b1 = Z.Sim.placePath(31, 20, 'paved');
          const b2 = Z.Sim.placePath(31, 19, 'paved');
          Z.Sim.spawnAnimal('triceratops', 31, 17);
          const enc = Z.state.enclosures[0];
          enc.foodLevel = 0.2;
          enc.poop = 4;
          const kp = Z.Sim.hireStaff('keeper', 27, 22);
          return {
            stOk: st.ok, genOk: gen.ok, subOk: sub.ok, trOk: tr.ok, btOk: bt.ok,
            dgOk: dg.ok, b1Bridge: !!b1.bridge, b2Bridge: !!b2.bridge, kpOk: kp.ok,
            stationId: st.id, loop: Z.Sim.monorail.state().lines[0].loop
          };
        })()""")
        assert all([setup["stOk"], setup["genOk"], setup["subOk"], setup["trOk"], setup["btOk"],
                    setup["dgOk"], setup["b1Bridge"], setup["b2Bridge"], setup["kpOk"], setup["loop"]])

        # Open station panel and verify train leaves station on 1-station loop
        result = js(page, f"""(() => {{
          Z.UI.Panel.open('object', {setup["stationId"]});
          Z.state.time = 0.35;
          const L = Z.Sim.monorail.state().lines[0];
          const s0 = Z.Sim.monorail.trains()[0].s;
          let maxDist = 0, leftStation = false, returned = false;
          for (let k = 0; k < 1000; k++) {{
            Z.Sim._step(0.05);
            const T = Z.Sim.monorail.trains()[0];
            const d = Math.min(Math.abs(T.s - s0), L.len - Math.abs(T.s - s0));
            if (d > maxDist) maxDist = d;
            if (T.st === 'run' && d > 5) leftStation = true;
            if (leftStation && T.st === 'dwell') {{ returned = true; break; }}
          }}
          for (let k = 0; k < 400; k++) Z.Sim._step(0.1);
          const enc = Z.state.enclosures[0];
          return {{ maxDist, leftStation, returned, food: enc.foodLevel, poop: enc.poop }};
        }})()""")
        assert result["leftStation"] is True
        assert result["maxDist"] > 20
        assert result["returned"] is True
        assert result["food"] == 1
        assert result["poop"] == 0
        # Let a render frame run after building monorail, bridges, and keeper
        page.wait_for_timeout(200)
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_building_info_and_utility_path_ui(browser):
    context, page, problems = open_game(browser)
    try:
        new_park(page, difficulty="easy")
        js(page, """(() => {
          Z.state.money = 250000;
          Z.state.unlocked.star = 5;
          for (let j = 10; j <= 20; j++) for (let i = 10; i <= 24; i++) {
            Z.Sim.bulldoze(i, j);
            Z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
            Z.state.terrain[i + j * Z.N] = 0;
          }
        })()""")

        # 1. Power build cards show kW/kWh/range specs & tooltips and no entrance bar
        js(page, "Z.UI.openCat('power', true)")
        cards = js(page, """(() => {
          return Array.from(document.querySelectorAll('#cards .card[data-kind="building"]')).map(c => ({
            id: c.getAttribute('data-id'),
            spb: c.querySelector('.spb')?.textContent || '',
            fpb: c.querySelector('.fpb')?.textContent || '',
            title: c.getAttribute('title') || '',
            hasDoorRect: !!c.querySelector('.fpb rect[fill="#f2a81d"]')
          }));
        })()""")
        by_id = {c["id"]: c for c in cards}
        assert by_id["diesel_gen"]["spb"] == "45kW"
        assert "45 kW" in by_id["diesel_gen"]["title"]
        assert by_id["diesel_gen"]["hasDoorRect"] is False
        assert by_id["solar_field"]["spb"] == "38kW"
        assert "38 kW" in by_id["solar_field"]["title"]
        assert by_id["wind_turbine"]["spb"] == "26kW"
        assert by_id["battery_bank"]["spb"] == "120kWh"
        assert by_id["geothermal_plant"]["spb"] == "120kW"
        assert by_id["substation"]["spb"] == "11t"

        # 2. Selecting diesel_gen shows kW in toolstrip and NO path requirement in placement plan
        page.locator('#cards .card[data-id="diesel_gen"]').click()
        strip_text = page.locator("#toolstrip .tname small").inner_text()
        assert "45 kW" in strip_text
        gen_plan = js(page, """(() => {
          const gp = { i: 12, j: 12, x: 12 * Z.TILE, z: 12 * Z.TILE };
          const p = Z.UI.Tools.PLAN.building({ a: gp, b: gp });
          return { ok: p.ok, door: p.spec.door, warn: p.warn };
        })()""")
        assert gen_plan["ok"] is True
        assert gen_plan["door"] is False
        assert "45 kW" in gen_plan["warn"]
        assert "path" not in gen_plan["warn"].lower()
        assert "entrance" not in gen_plan["warn"].lower()

        # 3. Selecting burger_stand DOES show entrance/path requirement
        js(page, "Z.UI.Tools.cancel()")
        js(page, "Z.UI.openCat('fac', true)")
        page.locator('#cards .card[data-id="burger_stand"]').click()
        stall_plan = js(page, """(() => {
          const gp = { i: 12, j: 16, x: 12 * Z.TILE, z: 16 * Z.TILE };
          const p = Z.UI.Tools.PLAN.building({ a: gp, b: gp });
          return { ok: p.ok, door: p.spec.door, warn: p.warn };
        })()""")
        assert stall_plan["door"] is True
        assert "entrance needs a path" in stall_plan["warn"].lower()
        js(page, "Z.UI.Tools.cancel()")

        # 4. Inspecting placed generator, battery, substation shows specific power info & NO path status
        ids = js(page, """(() => {
          const g = Z.Sim.placeObject('diesel_gen', 10, 10, 0);
          const b = Z.Sim.placeObject('battery_bank', 13, 10, 0);
          const s = Z.Sim.placeObject('substation', 16, 10, 0);
          const st = Z.Sim.placeObject('burger_stand', 10, 15, 0);
          return { g: g.id, b: b.id, s: s.id, st: st.id };
        })()""")

        js(page, f"Z.UI.Panel.open('object', {ids['g']})")
        gen_panel = page.locator("#panel").inner_text()
        assert "Power generator" in gen_panel
        assert "45 kW" in gen_panel
        assert "Generating now" in gen_panel
        assert "Connected to a path" not in gen_panel
        assert "Visitors served" not in gen_panel

        js(page, f"Z.UI.Panel.open('object', {ids['b']})")
        batt_panel = page.locator("#panel").inner_text()
        assert "Power storage" in batt_panel
        assert "120 kWh" in batt_panel
        assert "Connected to a path" not in batt_panel

        js(page, f"Z.UI.Panel.open('object', {ids['s']})")
        sub_panel = page.locator("#panel").inner_text()
        assert "Power relay" in sub_panel
        assert "11 tiles" in sub_panel
        assert "Connected to a path" not in sub_panel

        # Regular building panel keeps visitors, path issue, and building fact
        js(page, f"Z.UI.Panel.open('object', {ids['st']})")
        stall_panel = page.locator("#panel").inner_text()
        assert "Visitors served" in stall_panel
        assert "Its entrance (front) must touch a path" in stall_panel
        assert "hunger" in stall_panel.lower()

        assert_no_browser_errors(problems)
    finally:
        context.close()


def _sample_center_png_colors(page):
    """Return unique color count and clear-color sky-blue (#8fb6d8) hit count in center viewport."""
    import struct
    import zlib
    raw = page.screenshot(type="png")
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"
    pos = 8
    idat = bytearray()
    w = h = ct = 0
    while pos < len(raw):
        length = struct.unpack(">I", raw[pos:pos + 4])[0]
        ctype = raw[pos + 4:pos + 8]
        data = raw[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            w, h, _bd, ct = struct.unpack(">IIBB", data[:10])
        elif ctype == b"IDAT":
            idat.extend(data)
        elif ctype == b"IEND":
            break
        pos += 12 + length
    decomp = zlib.decompress(bytes(idat))
    bpp = 4 if ct == 6 else 3
    stride = 1 + w * bpp
    rows = []
    prev = bytearray(w * bpp)
    for y in range(h):
        ft = decomp[y * stride]
        row = bytearray(decomp[y * stride + 1:(y + 1) * stride])
        if ft == 1:
            for i in range(bpp, len(row)):
                row[i] = (row[i] + row[i - bpp]) & 0xFF
        elif ft == 2:
            for i in range(len(row)):
                row[i] = (row[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(len(row)):
                a = row[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                row[i] = (row[i] + pr) & 0xFF
        rows.append(row)
        prev = row
    samples = []
    for sy in range(h // 4, 3 * h // 4, 24):
        row = rows[sy]
        for sx in range(w // 4, 3 * w // 4, 24):
            idx = sx * bpp
            samples.append((row[idx], row[idx + 1], row[idx + 2]))
    sky_blue = sum(1 for (r, g, b) in samples if abs(r - 143) <= 5 and abs(g - 182) <= 5 and abs(b - 216) <= 5)
    return {"total": len(samples), "uniq": len(set(samples)), "sky_blue": sky_blue}


def _assert_world_rendered(page):
    state = js(page, """(() => {
      const vi = Z.World.info();
      const c = Z.World.cam;
      const p = Z.World.camera().position;
      return {
        view: vi.view,
        calls: vi.calls,
        tris: vi.tris,
        camPos: [p.x, p.y, p.z],
        cam: [c.target.x, c.target.z, c.dist, c.yaw, c.pitch],
      };
    })()""")
    for v in state["cam"] + state["camPos"] + list(state["view"].values()):
        assert isinstance(v, (int, float)) and -1e6 < v < 1e6 and v == v, f"Non-finite camera state: {state}"
    assert state["calls"] > 0 and state["tris"] > 0, f"Empty WebGL render: {state}"
    shot = _sample_center_png_colors(page)
    assert shot["uniq"] > 20 and shot["sky_blue"] < shot["total"] * 0.5, f"Solid clear-color screen detected: {shot}"


def _exercise_camera_nan_guards(page):
    js(page, """(() => {
      Z.World.focus(undefined, undefined, NaN);
      Z.World.pan(NaN, undefined);
      Z.World.rotate(NaN, NaN);
      Z.World.zoom(NaN);
      Z.World.zoom(0);
      Z.World.svJump(undefined, NaN, NaN, NaN);
      const canvas = document.querySelector('#world');
      if (canvas) {
        const ev = new Event('wheel', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'deltaY', { value: NaN });
        canvas.dispatchEvent(ev);
      }
      if (Z.state && Z.state.animals && Z.state.animals.length) {
        const a = Z.state.animals[0];
        const savedX = a.x, savedZ = a.z;
        a.x = NaN; a.z = undefined;
        Z.World.follow('animal', a.id);
        Z.World.frame(0.016);
        a.x = savedX; a.z = savedZ;
        Z.World.follow(null);
      }
      Z.World.frame(NaN);
    })()""")
    page.wait_for_timeout(150)
    _assert_world_rendered(page)


def test_zoo_adopt_centre_and_camera_resilience(browser):
    context, page, problems = open_zoo(browser)
    try:
        new_zoo_park(page, map_id="lakeland", difficulty="normal")
        enc = js(page, """(() => {
          Z.state.money = 250000;
          Z.state.unlocked.star = 5;
          for (let j = 15; j <= 25; j++) for (let i = 15; i <= 25; i++) {
            Z.Sim.bulldoze(i, j);
            Z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
            Z.state.terrain[i + j * Z.N] = 0;
          }
          for (let i = 16; i <= 23; i++) {
            Z.Sim.placeFence({ axis: 'x', i, j: 16 }, 'reinforced');
            Z.Sim.placeFence({ axis: 'x', i, j: 24 }, 'reinforced');
          }
          for (let j = 16; j <= 23; j++) {
            Z.Sim.placeFence({ axis: 'z', i: 16, j }, 'reinforced');
            Z.Sim.placeFence({ axis: 'z', i: 24, j }, 'reinforced');
          }
          const e = Z.state.enclosures[0];
          return e ? { id: e.id, cx: e.cx, cz: e.cz, area: e.area } : null;
        })()""")
        assert enc and enc["area"] == 64
        assert abs(enc["cx"] - 40) < 1 and abs(enc["cz"] - 40) < 1

        # Adopt new animal via species sheet (previously focused on undefined en.cx/cz -> blue screen)
        js(page, "Z.UI.Panel.species('meerkat')")
        page.get_by_text("Minimum space", exact=True).wait_for()
        page.get_by_text("64 tiles free").wait_for()
        page.locator("#sheet button.btn:not(.dis)", has_text="Adopt").first.click()
        page.wait_for_function("Z.state.animals.length === 1")
        page.wait_for_timeout(250)
        _assert_world_rendered(page)

        # Follow new animal and inspect
        aid = js(page, "Z.state.animals[0].id")
        js(page, f"Z.UI.Panel.open('animal', {aid}); Z.UI.startFollow('animal', {aid});")
        page.wait_for_timeout(150)
        _assert_world_rendered(page)
        js(page, "Z.UI.exitFollow()")

        # Enclosure Centre button
        js(page, f"Z.UI.Panel.open('enclosure', {enc['id']})")
        page.get_by_text("1 / 64 tiles used", exact=True).wait_for()
        page.get_by_role("button", name="Centre").click()
        page.wait_for_timeout(150)
        _assert_world_rendered(page)

        _exercise_camera_nan_guards(page)
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_dino_new_animal_hatch_follow_and_camera_resilience(browser):
    context, page, problems = open_game(browser)
    try:
        new_park(page, difficulty="easy")
        encs = js(page, """(() => {
          Z.state.money = 1000000;
          Z.state.unlocked.star = 5;
          for (const s of Z.DATA.animals) Z.state.research.genomes[s.id] = 100;
          for (let j = 10; j <= 35; j++) for (let i = 10; i <= 20; i++) {
            Z.Sim.bulldoze(i, j);
            Z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
            Z.state.terrain[i + j * Z.N] = 0;
          }
          Z.Sim.placeObject('diesel_gen', 24, 45, 0);
          for (let i = 10; i <= 16; i++) Z.Sim.placePath(i, 9, 'paved');
          for (let i = 10; i <= 16; i++) {
            Z.Sim.placeFence({ axis: 'x', i, j: 10 }, 'reinforced');
            Z.Sim.placeFence({ axis: 'x', i, j: 17 }, 'reinforced');
          }
          for (let j = 10; j <= 16; j++) {
            Z.Sim.placeFence({ axis: 'z', i: 10, j }, 'reinforced');
            Z.Sim.placeFence({ axis: 'z', i: 17, j }, 'reinforced');
          }
          const tank = [], dome = [];
          for (let j = 20; j <= 25; j++) for (let i = 10; i <= 15; i++) tank.push(i + j * Z.N);
          for (let j = 28; j <= 33; j++) for (let i = 10; i <= 15; i++) dome.push(i + j * Z.N);
          Z.Sim.realms.place('tank', 'sea', tank, { lvl: 2, wall: 2 });
          Z.Sim.realms.place('dome', 'air', dome, { lvl: 2, mesh: 2 });
          return Z.state.enclosures.map(e => ({ id: e.id, cx: e.cx, cz: e.cz, kind: e.kind || 'land' }));
        })()""")
        assert len(encs) >= 3

        # Hatch flow -> Lay egg -> Hatch -> Follow across land, sea, and air species
        js(page, "Z.UI.Panel.species('dryosaurus')")
        page.get_by_text("Minimum space", exact=True).wait_for()
        page.get_by_text("49 tiles free", exact=True).wait_for()
        page.locator("#sheet button.btn:not(.dis)", has_text="Hatch").first.click()
        page.get_by_text("4 tiles for this hatchling", exact=True).wait_for()
        page.locator("#sheet button.btn:not(.dis)", has_text="Lay egg").click()
        land = next(enc for enc in encs if enc["kind"] == "land")
        js(page, f"Z.UI.Panel.open('enclosure', {land['id']})")
        page.get_by_text("0 / 49 tiles used · 4 reserved", exact=True).wait_for()

        # Existing overcrowding is visible and a booked egg waits until the habitat can fit it.
        crowded_ids = js(page, f"""(() => {{
          const a = Z.Sim.spawnAnimal('brachiosaurus', 12, 12);
          const b = Z.Sim.spawnAnimal('brachiosaurus', 14, 14);
          Z.UI.Panel.open('enclosure', {land['id']});
          return [a.id, b.id];
        }})()""")
        page.locator(".issues li", has_text="Overcrowded").first.wait_for()
        js(page, "Z.UI.Panel.species('dryosaurus')")
        full = page.locator("#sheet .sp-row", has=page.get_by_text("0 tiles free", exact=True))
        assert full.get_by_role("button", name="Hatch").is_disabled()
        js(page, """Z.UI.Panel.closeSheet(); Z.Sim.forceNext('hatch', true);
          Z.state.research.eggs[0].t = 0; Z.Sim._step(0.1);""")
        assert js(page, "Z.state.research.eggs[0]?.waiting === true")
        js(page, f"{crowded_ids}.forEach(id => Z.Sim.sellAnimal(id))")
        page.wait_for_timeout(150)
        _assert_world_rendered(page)

        js(page, "for (let k = 0; k < 3000 && Z.state.animals.length === 0; k++) Z.Sim._step(0.1);")
        assert js(page, "Z.state.animals.length >= 1") is True
        js(page, """(() => {
          const sea = Z.Sim.spawnAnimal('ichthyosaurus', 13, 22);
          const air = Z.Sim.spawnAnimal('pteranodon', 13, 30);
          for (let k = 0; k < 20; k++) Z.Sim._step(0.05);
          return [sea.id, air.id];
        })()""")
        for aid in js(page, "Z.state.animals.map(a => a.id)"):
            js(page, f"Z.UI.Panel.open('animal', {aid}); Z.UI.startFollow('animal', {aid});")
            page.wait_for_timeout(120)
            _assert_world_rendered(page)
        js(page, "Z.UI.exitFollow()")

        _exercise_camera_nan_guards(page)
        assert_no_browser_errors(problems)
    finally:
        context.close()


@pytest.mark.parametrize("mobile", [False, True])
def test_zoo_play_timer_app(browser, mobile):
    context, page, problems = open_zoo(browser, mobile=mobile)
    try:
        vp_w = 390 if mobile else 1280
        vp_h = 844 if mobile else 900

        # Title screen: session timer is not active yet
        assert js(page, "Boolean(Z.UI.PlayTimer) && Z.UI.PlayTimer.state().active === false") is True

        # Start a park: play timer starts at 00:00 and is visible in HUD without overlapping other HUD items
        new_zoo_park(page, map_id="meadow", difficulty="normal")
        chip = page.locator("#timerchip")
        assert chip.is_visible()
        assert js(page, "Z.UI.PlayTimer.state().active") is True

        # Ensure real time ticks even when simulation speed is paused (speed == 0)
        page.wait_for_function("Z.UI.PlayTimer.elapsed() >= 1.2", timeout=5000)
        assert js(page, "Z.UI.PlayTimer.formatted()") != "00:00"

        # Layout & non-overlap verification on both desktop and mobile
        boxes = js(page, """(() => {
          const get = s => {
            const e = document.querySelector(s);
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
          };
          return {
            timer: get('#timerchip'),
            clock: get('#clock'),
            wx: get('#wxchip'),
            speed: get('#speed'),
            goal: get('#goalchip'),
            side: get('#side')
          };
        })()""")
        tb = boxes["timer"]
        assert tb and tb["w"] > 40 and tb["h"] >= 28
        assert tb["x"] >= 0 and tb["r"] <= vp_w and tb["y"] >= 0 and tb["b"] <= vp_h
        for other_name in ["clock", "wx", "speed", "goal", "side"]:
            ob = boxes[other_name]
            if not ob or ob["w"] == 0 or ob["h"] == 0:
                continue
            overlap = (tb["x"] < ob["r"] - 1 and tb["r"] > ob["x"] + 1 and tb["y"] < ob["b"] - 1 and tb["b"] > ob["y"] + 1)
            assert not overlap, f"#timerchip overlapped #{other_name}: {tb} vs {ob}"

        # Open Play Timer app popover
        chip.click()
        page.wait_for_function("document.querySelector('#timerpop.on')")
        pop = page.locator("#timerpop.on")
        assert pop.is_visible()
        pop_box = pop.bounding_box()
        assert pop_box and pop_box["x"] >= 0 and pop_box["x"] + pop_box["width"] <= vp_w

        # Pause & Resume inside the Play Timer app
        pop.get_by_role("button", name="Pause").click()
        assert js(page, "Z.UI.PlayTimer.state().paused") is True
        paused_at = js(page, "Z.UI.PlayTimer.elapsed()")
        page.wait_for_timeout(350)
        assert js(page, "Z.UI.PlayTimer.elapsed()") == paused_at
        pop.get_by_role("button", name="Resume").click()
        assert js(page, "Z.UI.PlayTimer.state().paused") is False

        # Mark a checkpoint and clear it
        pop.get_by_role("button", name="Mark").click()
        assert page.locator(".pt-lap").count() == 1
        pop.get_by_role("button", name="Clear").click()
        assert page.locator(".pt-lap").count() == 0

        # Break reminder (15m) -> trigger -> snooze -> trigger -> dismiss
        pop.locator(".pt-seg button[data-m='15']").click()
        js(page, "Z.UI.PlayTimer.tick(900)")
        page.wait_for_function("Z.UI.PlayTimer.state().alertFired === true && document.querySelector('#timerpop .pt-banner').style.display !== 'none'")
        assert page.locator("#timerchip.pt-alert").is_visible()
        pop.get_by_role("button", name="Snooze +15m").click()
        assert js(page, "Z.UI.PlayTimer.state().alertFired") is False
        js(page, "Z.UI.PlayTimer.tick(900)")
        page.wait_for_function("Z.UI.PlayTimer.state().alertFired === true")
        pop.get_by_role("button", name="Dismiss").click()
        assert js(page, "Z.UI.PlayTimer.state().alertDismissed") is True

        # Reset (confirm two-step when >= 5s)
        pop.get_by_role("button", name="Reset").click()
        assert "Reset?" in pop.locator(".pt-actions button").nth(2).inner_text()
        pop.get_by_role("button", name="Reset?").click()
        assert js(page, "Z.UI.PlayTimer.elapsed() < 60") is True

        # Close via close button, then reopen and close via Escape key
        pop.get_by_role("button", name="Close play timer").click()
        page.wait_for_function("!document.querySelector('#timerpop.on')")
        chip.click()
        page.wait_for_function("document.querySelector('#timerpop.on')")
        page.keyboard.press("Escape")
        page.wait_for_function("!document.querySelector('#timerpop.on')")

        # Verify Overview and Settings integration
        js(page, "Z.UI.openModal('ov')")
        page.wait_for_function("document.querySelector('#modal.on')")
        assert "Session play time" in page.locator("#mbody").inner_text()

        js(page, "Z.UI.Screens.open('set')")
        assert "Current play session" in page.locator("#mbody").inner_text()
        page.get_by_role("button", name="Show play timer on HUD").click()
        assert js(page, "Z.UI.PlayTimer.hudVisible()") is False
        assert not chip.is_visible()
        page.get_by_role("button", name="Show play timer on HUD").click()
        assert js(page, "Z.UI.PlayTimer.hudVisible()") is True
        assert chip.is_visible()
        page.get_by_role("button", name="Open Play Timer").click()
        page.wait_for_function("!Z.UI.modalOpen() && document.querySelector('#timerpop.on')")
        page.keyboard.press("Escape")
        page.wait_for_function("!document.querySelector('#timerpop.on')")

        # Return to title ends session, Continue starts a new session
        js(page, "Z.Main.toTitle()")
        page.wait_for_function("!Z.Main.playing && Z.UI.PlayTimer.state().active === false")
        page.get_by_role("button", name="Continue").click()
        page.wait_for_function("Z.Main.playing && Z.UI.PlayTimer.state().active === true")
        assert js(page, "Z.UI.PlayTimer.elapsed() < 60") is True
        assert_no_browser_errors(problems)
    finally:
        context.close()


def test_dino_tycoon_has_no_play_timer(browser):
    context, page, problems = open_game(browser)
    try:
        new_park(page)
        assert js(page, "Z.UI.PlayTimer === undefined") is True
        assert page.locator("#timerchip").count() == 0
        assert page.locator("#timerpop").count() == 0
        assert_no_browser_errors(problems)
    finally:
        context.close()
