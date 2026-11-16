"""End-to-end browser coverage for Dino Tycoon persistence and core UI."""
from __future__ import annotations

import json
import os
import shutil
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
    for p in [8768, 8769, 8770, 8765]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
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
def browser(server):
    with sync_playwright() as p:
        engine = os.environ.get("TEST_BROWSER", "chromium").lower()
        browser_type = getattr(p, engine)
        executable = os.environ.get("CHROMIUM_EXECUTABLE_PATH") if engine == "chromium" else None
        if not executable and engine == "chromium":
            executable = shutil.which("chromium") or shutil.which("chromium-browser")
        kwargs = {"headless": True}
        if executable:
            kwargs["executable_path"] = executable
        if engine == "chromium" and (executable or os.environ.get("CI")):
            kwargs["args"] = ["--no-sandbox", "--enable-unsafe-swiftshader"]
        b = browser_type.launch(**kwargs)
        yield b
        b.close()


def open_game(browser, *, path="", mobile=False, init_script=None):
    context = browser.new_context(
        viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 900},
        device_scale_factor=1, is_mobile=mobile, has_touch=mobile,
        accept_downloads=True,
    )
    if init_script:
        context.add_init_script(init_script)
    page = context.new_page()
    problems = []
    page.on("pageerror", lambda error: problems.append(f"pageerror: {error}"))
    page.on("console", lambda msg: problems.append(f"console error: {msg.text}") if msg.type == "error" else None)
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
        page.get_by_role("button", name="Low").click()
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

