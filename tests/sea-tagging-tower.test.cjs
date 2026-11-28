// Run with: node --test tests/sea-tagging-tower.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { gameScripts, readScript, simulationScripts } = require('./game-scripts.cjs');

const root = path.resolve(__dirname, '..');

function game() {
  const ctx = vm.createContext({
    console,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  for (const f of simulationScripts()) vm.runInContext(readScript(f), ctx, { filename: f });
  return ctx.Z;
}

function uiGame() {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {};
    const style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1,
      tagName: String(tag || 'div').toUpperCase(),
      style, children,
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); },
        remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || ''); children.length = 0;
        const stack = [node];
        const re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
        let m;
        while ((m = re.exec(_html))) {
          if (m[4]) { stack[stack.length - 1].children.push({ nodeType: 3, textContent: m[4], children: [] }); continue; }
          if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
          const ch = mkEl(m[2]), rawAttr = m[3] || '', selfClose = /\/\s*$/.test(rawAttr);
          let am; const are = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
          while ((am = are.exec(rawAttr))) if (am[1] && am[1] !== '/') ch.setAttribute(am[1], am[2] || '');
          stack[stack.length - 1].appendChild(ch);
          if (!selfClose) stack.push(ch);
        }
      },
      get innerHTML() { return _html; },
      set textContent(v) { _text = String(v == null ? '' : v); _html = ''; children.length = 0; },
      get textContent() { return children.length ? children.map(c => c.textContent).join(' ') : (_text || _html.replace(/<[^>]+>/g, ' ')); },
      setAttribute(k, v) { if (k === 'class') node.className = v; else attrs[k] = String(v); },
      getAttribute(k) { return k === 'class' ? node.className : (attrs[k] ?? null); },
      removeAttribute(k) { delete attrs[k]; },
      appendChild(c) { if (c) { c.parentNode = node; children.push(c); } return c; },
      insertBefore(c, ref) { if (!c) return c; c.parentNode = node; const idx = children.indexOf(ref); if (idx >= 0) children.splice(idx, 0, c); else children.push(c); return c; },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      click() { (listeners.click || []).forEach(fn => fn({ stopPropagation() {}, preventDefault() {} })); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const matchOne = (el, part) => {
          let s = part.trim(), m;
          const attrM = s.match(/\[([^\]=]+)="([^"]*)"\]/g) || [];
          for (const a of attrM) {
            const p = a.slice(1, -1).split('=');
            if (el.getAttribute(p[0]) !== p[1].replace(/^"|"$/g, '')) return false;
            s = s.replace(a, '');
          }
          if ((m = s.match(/#([a-zA-Z0-9_-]+)/))) { if (el.getAttribute('id') !== m[1]) return false; s = s.replace(m[0], ''); }
          const clsM = s.match(/\.[a-zA-Z0-9_-]+/g) || [];
          for (const c of clsM) { if (!el.classList.contains(c.slice(1))) return false; s = s.replace(c, ''); }
          if (s && el.tagName.toLowerCase() !== s.toLowerCase()) return false;
          return true;
        };
        const parts = sel.trim().split(/\s+/);
        let scope = [node];
        for (const part of parts) {
          const next = [];
          const walk = (el) => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk);
          scope = next;
        }
        return scope;
      },
      focus() {}, blur() {}, scrollLeft: 0, scrollTop: 0, offsetWidth: 80, offsetHeight: 40,
      getContext() { return { fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {}, fill() {}, arc() {}, clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, fillText() {}, createLinearGradient() { return { addColorStop() {} }; } }; },
      getBoundingClientRect() { return { left: 0, top: 0, bottom: 40, right: 80, width: 80, height: 40 }; }
    };
    return node;
  }

  const rootUi = mkEl('div'), body = mkEl('body'), head = mkEl('head'), worldEl = mkEl('div');
  rootUi.setAttribute('id', 'ui'); worldEl.setAttribute('id', 'world');
  const document = {
    head, body,
    createElement: mkEl,
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t == null ? '' : t), children: [] }),
    getElementById: (id) => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: (s) => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: (s) => rootUi.querySelectorAll(s),
    addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document, window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  const load = f => vm.runInContext(readScript(f), ctx, { filename: f });
  simulationScripts().forEach(load);
  const z = ctx.Z;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview() {}, highlightEnclosure() {}, thumb: () => null, focus() {} };
  z.RealmsWorld = { overlayOn: () => false, setOverlay() {}, showRange() {} };
  z.MoatsWorld = { overlayOn: () => false, setOverlay() {} };
  z.MonoWorld = { overlayOn: false, setOverlay() {} };
  z.SafariWorld = { overlayOn: false, setOverlay() {} };
  ['50-ui-dom.js', '50-ui.js', '51-input.js', '51-tools.js', '52-panels.js', '65-ui-moats.js', '66-ui-monorail.js', '67-ui-realms.js', '68-ui-power.js', '74-ui-safari.js', '75-ui-groups.js', '76-ui-mobile.js'].forEach(load);
  z.UI.init();
  return z;
}

function findRect(z, w, h, pred) {
  const N = z.N;
  for (let j = 1; j < N - h; j++) {
    for (let i = 1; i < N - w; i++) {
      let ok = true;
      for (let dj = 0; dj < h && ok; dj++) {
        for (let di = 0; di < w && ok; di++) {
          if (!pred(i + di, j + dj, i + di + (j + dj) * N)) ok = false;
        }
      }
      if (ok) return { i, j };
    }
  }
  return null;
}

function waterIndex(z) {
  return z.DATA.terrain.findIndex(t => t.id === 'water');
}

function isFlatDry(z, i, j, w, h) {
  const N = z.N, W = waterIndex(z), s = z.state;
  const e0 = s.elev[i + j * (N + 1)];
  for (let dj = 0; dj <= h; dj++) {
    for (let di = 0; di <= w; di++) {
      if (s.elev[(i + di) + (j + dj) * (N + 1)] !== e0) return false;
    }
  }
  for (let dj = 0; dj < h; dj++) {
    for (let di = 0; di < w; di++) {
      const t = (i + di) + (j + dj) * N;
      if (!z.Sim.inMap(i + di, j + dj) || s.terrain[t] === W || s.tileObj[t] || s.path[t] || s.ditch[t] || s.tileEnc[t]) return false;
    }
  }
  return true;
}

test('tagging_tower and power_pylon deploy at sea and on dry land, while rejecting mixed sea/land and freshwater', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy', money: 500000 });
  z.state.unlocked.star = 5;
  const N = z.N, W = waterIndex(z), sm = z.Sim.seaMask();

  const seaSpot2x2 = findRect(z, 2, 2, (i, j, t) =>
    z.Sim.inMap(i, j) && sm[t] > 0 && !z.state.tileObj[t] && !z.state.path[t] && !z.state.tileEnc[t]
  );
  assert.ok(seaSpot2x2, 'expected a 2x2 sea footprint on fern_meadow');

  const seaTower = z.Sim.placeObject('tagging_tower', seaSpot2x2.i, seaSpot2x2.j, 0);
  assert.equal(seaTower.ok, true, seaTower.msg);

  const seaSpot1x1 = findRect(z, 1, 1, (i, j, t) =>
    z.Sim.inMap(i, j) && sm[t] > 0 && !z.state.tileObj[t] && !z.state.path[t] && !z.state.tileEnc[t]
  );
  assert.ok(seaSpot1x1, 'expected a 1x1 sea tile on fern_meadow');

  const seaPylon = z.Sim.placeObject('power_pylon', seaSpot1x1.i, seaSpot1x1.j, 0);
  assert.equal(seaPylon.ok, true, seaPylon.msg);

  // Land placement for tagging_tower and power_pylon still works
  let landSpot = null;
  for (let j = 20; j < N - 8 && !landSpot; j++) {
    for (let i = 20; i < N - 8 && !landSpot; i++) {
      if (isFlatDry(z, i, j, 2, 2)) landSpot = { i, j };
    }
  }
  assert.ok(landSpot, 'expected a flat 2x2 dry land spot');
  const landTower = z.Sim.placeObject('tagging_tower', landSpot.i, landSpot.j, 0);
  assert.equal(landTower.ok, true, landTower.msg);

  // Mixed sea/land 2x2 footprint is rejected with expected error
  let mixedSpot = null;
  for (let j = 2; j < N - 3 && !mixedSpot; j++) {
    for (let i = 2; i < N - 3 && !mixedSpot; i++) {
      let seaN = 0, landN = 0, clean = true;
      for (let dj = 0; dj < 2; dj++) {
        for (let di = 0; di < 2; di++) {
          const t = (i + di) + (j + dj) * N;
          if (!z.Sim.inMap(i + di, j + dj) || z.state.tileObj[t] || z.state.path[t] || z.state.ditch[t]) { clean = false; break; }
          if (z.state.terrain[t] === W) {
            if (sm[t] > 0) seaN++; else clean = false;
          } else {
            landN++;
          }
        }
      }
      if (clean && seaN > 0 && landN > 0) mixedSpot = { i, j };
    }
  }
  assert.ok(mixedSpot, 'expected a mixed sea/land 2x2 boundary on fern_meadow');
  const mixedRes = z.Sim.placeObject('tagging_tower', mixedSpot.i, mixedSpot.j, 0);
  assert.equal(mixedRes.ok, false);
  assert.equal(mixedRes.msg, 'Place either on dry land or at sea');

  // Freshwater pond (not connected to seaMask) is rejected with expected error
  let freshSpot = null;
  for (let j = 22; j < N - 10 && !freshSpot; j++) {
    for (let i = 22; i < N - 10 && !freshSpot; i++) {
      if (isFlatDry(z, i, j, 2, 2)) {
        // Ensure surrounding ring is dry land so seaOf does not treat it as sea
        let surroundedByLand = true;
        for (let dj = -1; dj <= 2 && surroundedByLand; dj++) {
          for (let di = -1; di <= 2 && surroundedByLand; di++) {
            const t = (i + di) + (j + dj) * N;
            if (z.state.terrain[t] === W) surroundedByLand = false;
          }
        }
        if (surroundedByLand) freshSpot = { i, j };
      }
    }
  }
  assert.ok(freshSpot, 'expected an inland spot for a freshwater test');
  for (let dj = 0; dj < 2; dj++) {
    for (let di = 0; di < 2; di++) {
      z.state.terrain[(freshSpot.i + di) + (freshSpot.j + dj) * N] = W;
    }
  }
  // Force seaMask refresh by starting a rebuild check via terraform/recompute if cached
  const freshTower = z.Sim.placeObject('tagging_tower', freshSpot.i, freshSpot.j, 0);
  assert.equal(freshTower.ok, false);
  assert.equal(freshTower.msg, 'Needs flat dry land or open sea');

  const freshPylon = z.Sim.placeObject('power_pylon', freshSpot.i, freshSpot.j, 0);
  assert.equal(freshPylon.ok, false);
  assert.equal(freshPylon.msg, 'Needs flat dry land or open sea');
});

test('coastal substation + sea power_pylon chain powers offshore tagging_tower covering a virtual sea zone and persists across save/load', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy', money: 500000 });
  z.state.unlocked.star = 5;
  const N = z.N, W = waterIndex(z), sm = z.Sim.seaMask();
  const cableCi = Math.floor(N / 2) - 0.5, cableCj = N - 0.5, cableR = z.DATA.power.cable.radius;

  // Find a 2x2 offshore sea location well outside the mainland cable radius
  const offshoreTowerSpot = findRect(z, 2, 2, (i, j, t) => {
    if (!z.Sim.inMap(i, j) || !sm[t] || z.state.tileObj[t] || z.state.path[t] || z.state.tileEnc[t]) return false;
    const dCable = Math.hypot((i + 0.5) - cableCi, (j + 0.5) - cableCj);
    return j <= 20 && dCable > cableR + 6;
  });
  assert.ok(offshoreTowerSpot, 'expected an offshore 2x2 sea spot beyond mainland cable radius');

  // Find a coastal flat dry 2x2 spot for a substation outside direct 11-tile range of the offshore tower
  let coastSubSpot = null;
  for (let j = 4; j < N - 6 && !coastSubSpot; j++) {
    for (let i = 4; i < N - 6 && !coastSubSpot; i++) {
      if (!isFlatDry(z, i, j, 2, 2)) continue;
      const distToTower = Math.hypot((i + 1) - (offshoreTowerSpot.i + 1), (j + 1) - (offshoreTowerSpot.j + 1));
      if (distToTower >= 13 && distToTower <= 22) {
        // Check there is a sea tile between them for a relay pylon
        coastSubSpot = { i, j };
      }
    }
  }
  assert.ok(coastSubSpot, 'expected a coastal 2x2 dry land spot for substation');

  const sub = z.Sim.placeObject('substation', coastSubSpot.i, coastSubSpot.j, 0);
  assert.equal(sub.ok, true, sub.msg);

  // Place offshore tagging_tower (initially out of substation and cable range)
  const tower = z.Sim.placeObject('tagging_tower', offshoreTowerSpot.i, offshoreTowerSpot.j, 0);
  assert.equal(tower.ok, true, tower.msg);
  assert.equal(z.Power.objPowered(tower.id), false, 'offshore tagging_tower should start unpowered');

  // Paint an offshore virtual sea zone adjacent to / around the offshore tagging_tower
  const zoneTiles = [];
  for (let dj = -3; dj <= 4; dj++) {
    for (let di = -3; di <= 4; di++) {
      const ti = offshoreTowerSpot.i + di, tj = offshoreTowerSpot.j + dj;
      if (!z.inb(ti, tj) || !z.Sim.inMap(ti, tj)) continue;
      const t = ti + tj * N;
      if (!sm[t] || z.state.terrain[t] !== W) continue;
      if (z.state.tileObj[t] || z.state.path[t] || z.state.ditch[t] || z.state.tileEnc[t]) continue;
      zoneTiles.push(t);
    }
  }
  assert.ok(zoneTiles.length >= 12, `expected >= 12 offshore sea tiles for virtual sea zone, got ${zoneTiles.length}`);
  const zone = z.Sim.realms.place('virtual', 'sea', zoneTiles);
  assert.equal(zone.ok, true, zone.msg);

  // Before pylon relay: virtual sea zone is covered geographically, but unpowered
  let status = z.Sim.realms.containmentStatus(zone.id);
  assert.equal(status.ok, false);
  assert.equal(status.powered, false);

  // Build sea-deployed power_pylon chain from the coastal substation to within 6 tiles of the offshore tagging_tower
  const tx = offshoreTowerSpot.i + 1, tz = offshoreTowerSpot.j + 1;
  const sx = coastSubSpot.i + 1, sz = coastSubSpot.j + 1;
  const placedPylons = [];
  // Place a relay pylon at ~5 tiles from tower along the vector toward the substation, plus intermediate relays if >10 tiles
  for (const frac of [0.45, 0.8]) {
    const pi = Math.round(sx + (tx - sx) * frac), pj = Math.round(sz + (tz - sz) * frac);
    let pylonTile = null;
    for (let r = 0; r <= 4 && !pylonTile; r++) {
      for (let dj = -r; dj <= r && !pylonTile; dj++) {
        for (let di = -r; di <= r && !pylonTile; di++) {
          const ci = pi + di, cj = pj + dj;
          if (!z.inb(ci, cj) || !z.Sim.inMap(ci, cj)) continue;
          const t = ci + cj * N;
          if (!sm[t] || z.state.tileObj[t] || z.state.path[t] || z.state.ditch[t]) continue;
          if (frac > 0.7 && Math.hypot((ci + 0.5) - tx, (cj + 0.5) - tz) > 5.5) continue;
          pylonTile = { i: ci, j: cj };
        }
      }
    }
    if (pylonTile) {
      const py = z.Sim.placeObject('power_pylon', pylonTile.i, pylonTile.j, 0);
      assert.equal(py.ok, true, py.msg);
      placedPylons.push({ id: py.id, i: pylonTile.i, j: pylonTile.j });
    }
  }
  assert.ok(placedPylons.length >= 1, 'expected at least one sea-deployed power_pylon');

  // Verify the final sea pylon covers the offshore tagging_tower (within 6-tile radius)
  assert.equal(z.Power.objPowered(tower.id), true, 'sea power_pylon should power offshore tagging_tower');

  // Step briefly so realms secondly() refreshes virtual zone containment
  z.Sim.realms.refresh();
  status = z.Sim.realms.containmentStatus(zone.id);
  assert.equal(status.ok, true, `expected sea zone to be contained, reasons: ${status.reasons.join(', ')}`);
  assert.equal(status.powered, true);
  assert.equal(status.kind, 'virtual');
  const zInfo = z.Sim.realms.zoneInfo(zone.id);
  assert.ok(zInfo && zInfo.cover >= 0.999 && zInfo.powered === true);

  // Verify save/load preserves sea-deployed tagging_tower, power_pylon, and power/tower state
  const saved = z.Sim.save();
  z.Sim.newGame({ seed: 99, map: 'crater_lake' });
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.state.map.id, 'fern_meadow');

  const loadedTower = z.state.objects.find(o => o.id === tower.id);
  assert.ok(loadedTower, 'sea tagging_tower should persist across save/load');
  assert.equal(loadedTower.type, 'tagging_tower');
  assert.equal(loadedTower.i, offshoreTowerSpot.i);
  assert.equal(loadedTower.j, offshoreTowerSpot.j);

  for (const py of placedPylons) {
    const loadedPy = z.state.objects.find(o => o.id === py.id);
    assert.ok(loadedPy, `sea power_pylon ${py.id} should persist across save/load`);
    assert.equal(loadedPy.type, 'power_pylon');
    assert.equal(loadedPy.i, py.i);
    assert.equal(loadedPy.j, py.j);
    assert.ok(z.Power.nodes().some(n => n.id === py.id), 'power_pylon should remain registered as a power node');
  }

  assert.equal(z.Power.objPowered(tower.id), true, 'offshore tagging_tower should remain powered after load');
  const loadedStatus = z.Sim.realms.containmentStatus(zone.id);
  assert.equal(loadedStatus.ok, true, `expected sea zone containment after load, reasons: ${loadedStatus.reasons.join(', ')}`);
  assert.equal(loadedStatus.powered, true);
  const loadedTowerInfo = z.Sim.realms.towerInfo(tower.id);
  assert.ok(loadedTowerInfo && loadedTowerInfo.powered === true && loadedTowerInfo.zones.some(zz => zz.id === zone.id));
});

test('UI PLAN.building reports ok: true and green tileOk for tagging_tower and power_pylon on sea tiles', () => {
  const z = uiGame();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy', name: 'Sea UI Test' });
  z.state.money = 500000;
  z.state.unlocked.star = 5;
  const sm = z.Sim.seaMask();

  const sea2x2 = findRect(z, 2, 2, (i, j, t) =>
    z.Sim.inMap(i, j) && sm[t] > 0 && !z.state.tileObj[t] && !z.state.path[t] && !z.state.tileEnc[t]
  );
  assert.ok(sea2x2, 'expected 2x2 sea tiles for UI plan test');

  z.UI.openCat('tagging', true);
  const towerCard = z.UI.el.cards.querySelector('.card[data-id="tagging_tower"]');
  assert.ok(towerCard, 'tagging_tower card should render');
  towerCard.click();
  const gpTower = { i: sea2x2.i, j: sea2x2.j, x: (sea2x2.i + 1) * z.TILE, z: (sea2x2.j + 1) * z.TILE };
  const towerPlan = z.UI.Tools.PLAN.building({ a: gpTower, b: gpTower });
  assert.equal(towerPlan.ok, true, towerPlan.msg);
  assert.deepEqual(Array.from(towerPlan.spec.tileOk), [true, true, true, true]);
  z.UI.Tools.cancel();

  z.UI.openCat('power', true);
  const pylonCard = z.UI.el.cards.querySelector('.card[data-id="power_pylon"]');
  assert.ok(pylonCard, 'power_pylon card should render');
  pylonCard.click();
  const gpPylon = { i: sea2x2.i, j: sea2x2.j, x: (sea2x2.i + 0.5) * z.TILE, z: (sea2x2.j + 0.5) * z.TILE };
  const pylonPlan = z.UI.Tools.PLAN.building({ a: gpPylon, b: gpPylon });
  assert.equal(pylonPlan.ok, true, pylonPlan.msg);
  assert.deepEqual(Array.from(pylonPlan.spec.tileOk), [true]);
  z.UI.Tools.cancel();
});

test('3D sea and land models for tagging_tower and power_pylon build finite geometry and animate cleanly', () => {
  const THREE = require(path.join(root, 'vendor/three.r128.min.js'));
  const ctx = {
    THREE,
    console, Math, Array, Object, Number, String, Boolean, RegExp, Date, JSON,
    Float32Array, Uint16Array, Uint32Array, Int32Array,
    document: { createElement: () => ({ width: 256, height: 64, getContext: () => ({ fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '', fillRect() {}, strokeRect() {}, fillText() {} }) }) },
    Z: {}
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const files = Array.from(gameScripts().keys()).filter(f => /^(0\d|3\d)-/.test(f));
  for (const f of files) vm.runInContext(readScript(f), ctx, { filename: f });

  const checkFiniteModel = (obj, label) => {
    let verts = 0;
    obj.traverse((ch) => {
      if (ch.isMesh && ch.geometry) {
        const pos = ch.geometry.attributes.position;
        assert.ok(pos && pos.count > 0, `${label}: empty geometry`);
        for (let i = 0; i < pos.array.length; i++) assert.ok(Number.isFinite(pos.array[i]), `${label}: non-finite vertex`);
        const norm = ch.geometry.attributes.normal;
        if (norm) for (let i = 0; i < norm.array.length; i++) assert.ok(Number.isFinite(norm.array[i]), `${label}: non-finite normal`);
        verts += pos.count;
      }
    });
    assert.ok(verts > 0, `${label}: zero vertices`);
  };

  const findGroup = (obj, name) => {
    let found = null;
    obj.traverse((ch) => { if (ch.name === name) found = ch; });
    return found;
  };

  const M = ctx.Z.Models;
  for (const id of ['tagging_tower', 'power_pylon']) {
    const seaModel = M.createBuilding(id, { sea: true });
    assert.ok(seaModel, `missing sea model for ${id}`);
    checkFiniteModel(seaModel, `${id}:sea`);
    const seaBob = findGroup(seaModel, 'bob');
    assert.ok(seaBob, `sea ${id} should have a bob group`);
    assert.equal(typeof seaModel.userData.update, 'function', `sea ${id} should have userData.update`);

    for (let k = 0; k < 20; k++) {
      seaModel.userData.update(0.05, k * 0.25, seaModel, { id: 17 });
      assert.ok(Number.isFinite(seaBob.position.y));
      assert.ok(Number.isFinite(seaBob.rotation.x));
      assert.ok(Number.isFinite(seaBob.rotation.z));
    }
    assert.ok(seaBob.position.y !== 0 || seaBob.rotation.x !== 0 || seaBob.rotation.z !== 0, `sea ${id} bob group should animate`);

    const landModel = M.createBuilding(id);
    assert.ok(landModel, `missing land model for ${id}`);
    checkFiniteModel(landModel, `${id}:land`);
    assert.equal(findGroup(landModel, 'bob'), null, `land ${id} should not have a bob group`);
    if (typeof landModel.userData.update === 'function') {
      landModel.userData.update(0.05, 0.5, landModel, { id: 17 });
    }
  }
});
