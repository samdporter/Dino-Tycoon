"""End-to-end browser coverage for Dino Tycoon persistence and core UI."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8765/"
@pytest.fixture(scope="session")
def server():
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--port", "8765"],
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
        raise RuntimeError("server.py did not become ready on port 8765")
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


def open_game(browser, *, mobile=False, init_script=None):
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
    page.goto(BASE, wait_until="load", timeout=60000)
    page.wait_for_function("window.Z && Z.Main && Z.Storage && !document.querySelector('#boot:not(.gone)')", timeout=60000)
    return context, page, problems


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
