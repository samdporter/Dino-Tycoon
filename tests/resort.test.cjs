// Tests for Luxury Resort feature across BOTH Dino Tycoon and Zoo Tycoon.
// Run with: node --test tests/resort.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../vendor/three.r128.min.js');
const { gameScripts, readScript, simulationScripts } = require('./game-scripts.cjs');

const root = path.resolve(__dirname, '..');

const RESORT_BUILDINGS = [
  'private_villa', 'luxury_hotel', 'sky_lodge',
  'michelin_restaurant', 'champagne_lounge',
  'infinity_pool', 'luxury_spa',
  'vip_viewing_lounge', 'grand_conservatory',
  'vip_gatehouse', 'valet_concierge'
];
const RESORT_FENCES = ['gilded_glass', 'royal_marble'];
const RESORT_PATHS = ['marble_promenade'];
const RESORT_SCENERY = [
  'heated_oasis_pool', 'marble_pavilion_shelter', 'golden_enrichment',
  'cabana_lounger', 'gold_fountain', 'palm_colonnade'
];
const RESORT_STAFF = ['resort_guard'];

const RESORT_TABS = {
  stays: ['private_villa', 'luxury_hotel', 'sky_lodge'],
  dining: ['michelin_restaurant', 'champagne_lounge', 'infinity_pool', 'luxury_spa'],
  enclosures: [
    'vip_viewing_lounge', 'grand_conservatory',
    'gilded_glass', 'royal_marble',
    'heated_oasis_pool', 'marble_pavilion_shelter', 'golden_enrichment'
  ],
  security: ['vip_gatehouse', 'valet_concierge', 'resort_guard'],
  decor: ['marble_promenade', 'cabana_lounger', 'gold_fountain', 'palm_colonnade']
};

function createSimGame(zoo = false) {
  const values = new Map();
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URL: globalThis.URL || {},
    Blob: globalThis.Blob || {},
    FileReader: globalThis.FileReader || {},
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    },
    document: { readyState: 'loading', hidden: false, addEventListener() {}, getElementById: () => ({}) },
    location: { protocol: 'http:' },
    performance: { now: () => 0 },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  vm.runInContext('var window=globalThis', ctx);
  for (const f of simulationScripts(zoo, false)) {
    vm.runInContext(readScript(f, zoo), ctx, { filename: `${zoo ? 'zoo' : 'dino'}/${f}` });
  }
  return ctx.Z;
}

function newFlatPark(z, zoo = false, seed = 707) {
  z.Sim.newGame({ seed, map: 'meadow', mapSize: 'medium', money: 1000000 });
  z.state.unlocked.star = 4;
  clearFlatArea(z, 6, 10, 48, 39);
  const gateI = Math.floor(z.N / 2) - 1;
  // Connect main walkway north from entrance (j=40..51) up to boulevard j=28
  for (let j = 28; j <= 42; j++) {
    z.Sim.placePath(gateI, j, 'marble_promenade');
    z.Sim.placePath(gateI + 1, j, 'marble_promenade');
  }
  // Horizontal resort boulevards at j=28 and j=20, linked at i=44 so i=10..42 stays path-free
  for (let i = 10; i <= 44; i++) {
    z.Sim.placePath(i, 28, 'marble_promenade');
    z.Sim.placePath(i, 20, 'marble_promenade');
  }
  for (let j = 20; j <= 28; j++) {
    z.Sim.placePath(44, j, 'marble_promenade');
  }
  return { gateI };
}

function clearFlatArea(z, i0, j0, i1, j1) {
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const t = tidx(i, j);
      z.state.terrain[t] = 0;
      z.state.path[t] = 0;
      if (z.state.ditch) z.state.ditch[t] = 0;
      const oid = z.state.tileObj[t];
      if (oid) {
        const o = z.state.objects.find(x => x.id === oid);
        if (o) z.Sim.bulldoze(o.i, o.j);
      }
      z.state.elev[i + j * (N + 1)] = 0;
      z.state.elev[(i + 1) + j * (N + 1)] = 0;
      z.state.elev[i + (j + 1) * (N + 1)] = 0;
      z.state.elev[(i + 1) + (j + 1) * (N + 1)] = 0;
    }
  }
}

function buildFencedBox(z, i0, j0, i1, j1, fenceId) {
  for (let i = i0; i < i1; i++) {
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, fenceId).ok, true, `north fence ${fenceId}`);
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 }, fenceId).ok, true, `south fence ${fenceId}`);
  }
  for (let j = j0; j < j1; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, fenceId).ok, true, `west fence ${fenceId}`);
    assert.equal(z.Sim.placeFence({ axis: 'z', i: i1, j }, fenceId).ok, true, `east fence ${fenceId}`);
  }
  const enc = z.Sim.enclosureAt(i0, j0);
  assert.ok(enc, `Expected enclosure at (${i0}, ${j0})`);
  return enc;
}

function createModelsHarness(zoo = false) {
  const fakeCanvas = () => ({
    width: 128, height: 64, style: {},
    getContext: () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
      fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, clearRect() {}, createLinearGradient() { return { addColorStop() {} }; }
    })
  });
  const ctx = vm.createContext({
    console,
    THREE,
    setTimeout,
    clearTimeout,
    Math,
    Float32Array,
    Uint16Array,
    Uint32Array,
    Int16Array,
    Int32Array,
    Uint8Array,
    performance: { now: () => 0 },
    document: {
      createElement: tag => tag === 'canvas' ? fakeCanvas() : { style: {}, appendChild() {} },
      addEventListener() {}
    },
    window: null,
    requestAnimationFrame() {}
  });
  ctx.window = ctx;
  ctx.self = ctx;
  const files = ['00-data.js', '30-models-toilets.js', '30-models-common.js', '30-models.js', '31-models-resort.js'];
  for (const f of files) {
    const fullPath = gameScripts(zoo).get(f);
    assert.ok(fullPath, `${f} missing from ${zoo ? 'zoo' : 'dino'} scripts`);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), ctx, { filename: `${zoo ? 'zoo' : 'dino'}/${f}` });
  }
  return ctx.Z;
}

function checkSubtreeFinite(obj, label) {
  let meshCount = 0;
  let vertexCount = 0;
  obj.traverse(ch => {
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Number.isFinite(ch.position[axis]), `${label} pos.${axis} not finite`);
      assert.ok(Number.isFinite(ch.rotation[axis]), `${label} rot.${axis} not finite`);
      assert.ok(Number.isFinite(ch.scale[axis]), `${label} scale.${axis} not finite`);
    }
    if (ch.quaternion) {
      for (const axis of ['x', 'y', 'z', 'w']) {
        assert.ok(Number.isFinite(ch.quaternion[axis]), `${label} quat.${axis} not finite`);
      }
    }
    if (ch.isMesh) meshCount++;
    if (ch.geometry && ch.geometry.attributes) {
      if (ch.geometry.attributes.position) {
        const arr = ch.geometry.attributes.position.array;
        assert.ok(arr.length > 0, `${label} empty position buffer`);
        vertexCount += ch.geometry.attributes.position.count;
        for (let i = 0; i < arr.length; i++) {
          assert.ok(Number.isFinite(arr[i]), `${label} position[${i}] is NaN/Inf`);
        }
      }
      if (ch.geometry.attributes.normal) {
        const arr = ch.geometry.attributes.normal.array;
        for (let i = 0; i < arr.length; i++) {
          assert.ok(Number.isFinite(arr[i]), `${label} normal[${i}] is NaN/Inf`);
        }
      }
    }
  });
  assert.ok(meshCount > 0, `${label} should produce at least one mesh`);
  assert.ok(vertexCount > 0, `${label} should produce vertices`);
}

function createDomStub() {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {}, style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1,
      tagName: String(tag || 'div').toUpperCase(),
      style,
      children,
      get firstChild() { return children[0] || null; },
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); },
        remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || '');
        children.length = 0;
        const stack = [node], re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
        let m;
        while ((m = re.exec(_html))) {
          if (m[4]) { stack[stack.length - 1].children.push({ nodeType: 3, textContent: m[4], children: [] }); continue; }
          if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
          const ch = mkEl(m[2]), rawAttr = m[3] || '', selfClose = /\/\s*$/.test(rawAttr);
          let am;
          const are = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
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
      remove() {
        if (node.parentNode) {
          const idx = node.parentNode.children.indexOf(node);
          if (idx >= 0) node.parentNode.children.splice(idx, 1);
          node.parentNode = null;
        }
      },
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
          if ((m = s.match(/#([a-zA-Z0-9_-]+)/))) {
            if (el.getAttribute('id') !== m[1]) return false;
            s = s.replace(m[0], '');
          }
          const clsM = s.match(/\.[a-zA-Z0-9_-]+/g) || [];
          for (const c of clsM) {
            if (!el.classList.contains(c.slice(1))) return false;
            s = s.replace(c, '');
          }
          if (s && el.tagName.toLowerCase() !== s.toLowerCase()) return false;
          return true;
        };
        const parts = sel.trim().split(/\s+/);
        let scope = [node];
        for (const part of parts) {
          const next = [];
          const walk = el => {
            for (const ch of el.children) {
              if (ch.tagName) {
                if (matchOne(ch, part)) next.push(ch);
                walk(ch);
              }
            }
          };
          scope.forEach(walk);
          scope = next;
        }
        return scope;
      },
      focus() {},
      blur() {},
      scrollLeft: 0,
      scrollTop: 0,
      offsetWidth: 80,
      offsetHeight: 40,
      getContext() {
        return {
          fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
          quadraticCurveTo() {}, stroke() {}, fill() {}, arc() {}, clearRect() {},
          save() {}, restore() {}, translate() {}, scale() {}, fillText() {},
          createLinearGradient() { return { addColorStop() {} }; }
        };
      },
      getBoundingClientRect() { return { left: 0, top: 0, bottom: 40, right: 80, width: 80, height: 40 }; }
    };
    return node;
  }

  const rootUi = mkEl('div'), body = mkEl('body'), head = mkEl('head'), worldEl = mkEl('div');
  rootUi.setAttribute('id', 'ui');
  worldEl.setAttribute('id', 'world');
  const doc = {
    head,
    body,
    createElement: mkEl,
    createTextNode: t => ({ nodeType: 3, textContent: String(t ?? ''), children: [] }),
    getElementById: id => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: s => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: s => rootUi.querySelectorAll(s),
    addEventListener() {}
  };
  return { mkEl, doc, rootUi };
}

function createUiGame(zoo = false) {
  const { doc, rootUi, mkEl } = createDomStub();
  const ctx = vm.createContext({
    console,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame() {},
    document: doc,
    window: null,
    innerWidth: 1280,
    innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx;
  ctx.addEventListener = () => {};

  for (const f of simulationScripts(zoo, false)) {
    vm.runInContext(readScript(f, zoo), ctx, { filename: `${zoo ? 'zoo' : 'dino'}/${f}` });
  }
  const uiFiles = [
    '50-ui-dom.js', '50-ui.js', '51-input.js', '51-tools.js', '52-panels.js',
    '53-screen-shell.js', '53-standard-tabs.js', '53-screens.js',
    '66b-ui-coaster.js', '68-ui-resort.js', '68-ui-power.js', '75-ui-groups.js'
  ];
  for (const f of uiFiles) {
    const fullPath = gameScripts(zoo).get(f);
    if (fullPath) {
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), ctx, { filename: `${zoo ? 'zoo' : 'dino'}/${f}` });
    }
  }
  const z = ctx.Z;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview() {}, highlightEnclosure() {}, thumb: () => null, focus() {} };
  z.UI.init();
  return { z, mkEl, rootUi };
}

// ============================================================================
// 1. Data, Placement & 3D Models (Dino & Zoo)
// ============================================================================
for (const zoo of [false, true]) {
  const label = zoo ? 'Zoo' : 'Dino';

  test(`${label}: Resort data definitions and placement of all buildings, fences, paths, scenery & guard`, () => {
    const z = createSimGame(zoo);
    newFlatPark(z, zoo, 707);
    const D = z.DATA;

    const byB = Object.fromEntries(D.buildings.map(b => [b.id, b]));
    const byF = Object.fromEntries(D.fences.map(f => [f.id, f]));
    const byP = Object.fromEntries(D.paths.map(p => [p.id, p]));
    const byS = Object.fromEntries(D.scenery.map(s => [s.id, s]));
    const bySt = Object.fromEntries(D.staff.map(st => [st.id, st]));

    for (const id of RESORT_BUILDINGS) {
      assert.ok(byB[id], `${label}: missing building ${id}`);
      assert.equal(byB[id].resort, true, `${label}: ${id} should have resort: true`);
    }
    for (const id of RESORT_FENCES) {
      assert.ok(byF[id], `${label}: missing fence ${id}`);
      assert.equal(byF[id].resort, true, `${label}: ${id} should have resort: true`);
    }
    for (const id of RESORT_PATHS) {
      assert.ok(byP[id], `${label}: missing path ${id}`);
      assert.equal(byP[id].resort, true, `${label}: ${id} should have resort: true`);
    }
    for (const id of RESORT_SCENERY) {
      assert.ok(byS[id], `${label}: missing scenery ${id}`);
      assert.equal(byS[id].resort, true, `${label}: ${id} should have resort: true`);
    }
    for (const id of RESORT_STAFF) {
      assert.ok(bySt[id], `${label}: missing staff ${id}`);
      assert.equal(bySt[id].resort, true, `${label}: ${id} should have resort: true`);
    }

    // Place all 11 resort buildings with fronts facing j=28 or j=20
    let cursorI = 10;
    let rowPathJ = 28;
    for (const id of RESORT_BUILDINGS) {
      const b = byB[id];
      if (cursorI + b.w > 42) {
        cursorI = 10;
        rowPathJ = 20;
      }
      const placeJ = rowPathJ - b.h;
      const res = z.Sim.placeObject(id, cursorI, placeJ, 0);
      assert.equal(res.ok, true, `${label}: placeObject(${id}) failed: ${res.msg || res.why}`);
      cursorI += b.w + 1;
    }

    // Place outside decor scenery on open ground
    assert.equal(z.Sim.placeObject('cabana_lounger', 10, 29, 0).ok, true);
    assert.equal(z.Sim.placeObject('gold_fountain', 12, 29, 0).ok, true);
    assert.equal(z.Sim.placeObject('palm_colonnade', 14, 29, 0).ok, true);

    // Build luxury enclosure fenced with gilded_glass & royal_marble + place enclosure luxury scenery
    const enc = buildFencedBox(z, 34, 29, 39, 34, 'gilded_glass');
    assert.equal(z.Sim.placeFence({ axis: 'x', i: 35, j: 29 }, 'royal_marble').ok, true);
    assert.equal(z.Sim.placeObject('heated_oasis_pool', 35, 30, 0).ok, true);
    assert.equal(z.Sim.placeObject('marble_pavilion_shelter', 36, 30, 0).ok, true);
    assert.equal(z.Sim.placeObject('golden_enrichment', 37, 30, 0).ok, true);
    assert.ok(enc.tiles.length >= 25);

    // Hire resort_guard on connected marble_promenade
    const hire = z.Sim.hireStaff('resort_guard', 20, 28);
    assert.equal(hire.ok, true, `${label}: hireStaff(resort_guard) failed: ${hire.msg}`);
  });

  test(`${label}: All 18 Resort 3D models build finite BufferGeometry at detail 0.85 and 2.0`, () => {
    const z = createModelsHarness(zoo);
    const M = z.Models;
    const D = z.DATA;

    for (const detail of [0.85, 2.0]) {
      M.setDetail(detail);

      for (const id of RESORT_BUILDINGS) {
        const bDef = D.buildings.find(b => b.id === id);
        if (typeof M.buildingFootprint === 'function') {
          const fp = M.buildingFootprint(id);
          assert.ok(fp, `${label}: missing buildingFootprint(${id})`);
          assert.equal(fp.w, bDef.w, `${label}: ${id} width mismatch`);
          assert.equal(fp.h, bDef.h, `${label}: ${id} height mismatch`);
        }

        const grp = M.createBuilding(id);
        assert.ok(grp, `${label}: missing building model ${id} @ detail=${detail}`);
        assert.equal(grp.userData.footprint.w, bDef.w, `${label}: ${id} userData.footprint.w mismatch`);
        assert.equal(grp.userData.footprint.h, bDef.h, `${label}: ${id} userData.footprint.h mismatch`);
        checkSubtreeFinite(grp, `${label}:building:${id}@${detail}`);
        if (typeof grp.userData.update === 'function') {
          grp.userData.update(0.016, 1.5);
          grp.userData.update(0.033, 5.0);
          checkSubtreeFinite(grp, `${label}:building:${id}:anim@${detail}`);
        }
      }

      for (const id of RESORT_SCENERY) {
        const grp = M.createScenery(id);
        assert.ok(grp, `${label}: missing scenery model ${id} @ detail=${detail}`);
        checkSubtreeFinite(grp, `${label}:scenery:${id}@${detail}`);
        if (typeof grp.userData.update === 'function') {
          grp.userData.update(0.016, 1.5);
          checkSubtreeFinite(grp, `${label}:scenery:${id}:anim@${detail}`);
        }
      }

      const guard = M.createStaff('resort_guard');
      assert.ok(guard && guard.group, `${label}: missing resort_guard model @ detail=${detail}`);
      checkSubtreeFinite(guard.group, `${label}:staff:resort_guard@${detail}`);
      if (typeof guard.update === 'function') {
        guard.update(0.05, { state: 'walk', speed: 2.5 });
        checkSubtreeFinite(guard.group, `${label}:staff:resort_guard:walk@${detail}`);
      }
    }
  });
}

// ============================================================================
// 2. Overnight Stays, VIP Arrivals & Mid-Stay Bulldoze (Dino & Zoo)
// ============================================================================
for (const zoo of [false, true]) {
  const label = zoo ? 'Zoo' : 'Dino';

  test(`${label}: VIP arrivals, overnight bookings, night retention past CLOSE_T+0.08, morning wakeup & mid-stay bulldoze`, () => {
    const z = createSimGame(zoo);
    const { gateI } = newFlatPark(z, zoo, 808);
    const { OPEN_T, CLOSE_T } = z.resortCtx;

    // Build connected Luxury Resort cluster along j=28
    const villa = z.Sim.placeObject('private_villa', 16, 25, 0);        // 3x3 -> front at j=28
    const dining = z.Sim.placeObject('michelin_restaurant', 20, 26, 0); // 3x2 -> front at j=28
    const pool = z.Sim.placeObject('infinity_pool', 24, 25, 0);         // 4x3 -> front at j=28
    const gate = z.Sim.placeObject('vip_gatehouse', 29, 26, 0);         // 2x2 -> front at j=28
    assert.ok(villa.ok && dining.ok && pool.ok && gate.ok, `${label}: cluster placement failed`);

    // Open park during daytime (scaled by DAY_SECONDS so VIP arrival timer scales cleanly)
    z.state.open = true;
    z.state.time = 0.40;
    const daySteps = Math.ceil((35 * (z.Sim.DAY_SECONDS / 420)) / 0.25);
    for (let s = 0; s < daySteps; s++) z.Sim._step(0.25);

    const vips = z.state.guests.filter(g => g.resortVip === 1);
    const bookedVips = z.state.guests.filter(g => g.resortLodging);
    assert.ok(vips.length >= 1, `${label}: expected at least 1 VIP arrival, got ${vips.length}`);
    assert.ok(bookedVips.length >= 1, `${label}: expected at least 1 VIP with overnight booking`);
    assert.ok(z.state.resort.vipArrivals >= 1, `${label}: vipArrivals should be >= 1`);
    assert.ok(z.state.resort.roomRevenue > 0, `${label}: roomRevenue should be > 0`);
    assert.ok(z.state.resort.prestige > 0, `${label}: prestige should be > 0`);
    assert.ok(z.Resort.ratingBonus() > 0, `${label}: ratingBonus should be > 0`);

    // Ensure at least one guest is booked with >= 2 nights for multi-night + wakeup checks,
    // and add a non-overnight day guest to verify closing eviction still evicts non-resort guests.
    const dayGuest = z.resortCtx.spawnGuest(99999, false);
    assert.ok(dayGuest && !dayGuest.resortLodging, `${label}: regular day guest should not have lodging`);
    dayGuest.resortLodging = 0;
    const dayGuestId = dayGuest.id;
    const bookedIds = new Set(bookedVips.map(g => g.id));

    // Advance past CLOSE_T so booked VIPs check into resort_sleep
    z.state.time = CLOSE_T + 0.01;
    for (let s = 0; s < 8; s++) z.Sim._step(0.25);

    const sleepersBeforeClose = z.state.guests.filter(g => bookedIds.has(g.id) && g.state === 'resort_sleep');
    assert.ok(sleepersBeforeClose.length >= 1, `${label}: expected booked VIPs in resort_sleep after closing`);
    for (const g of sleepersBeforeClose) {
      assert.equal(z.Resort.shouldStayOvernight(g), true, `${label}: shouldStayOvernight must be true`);
      // Tire the guest slightly to verify sleep restoration
      g.energy = 30;
      g.happiness = 42;
    }

    // Advance past CLOSE_T + 0.08 so secondly() closing eviction runs
    z.state.time = CLOSE_T + 0.09;
    for (let s = 0; s < 12; s++) z.Sim._step(0.25); // 3 sim seconds -> triggers secondly()

    assert.equal(z.state.guests.some(g => g.id === dayGuestId), false, `${label}: non-overnight guest should be evicted past CLOSE_T + 0.08`);
    const sleepersAfterEvict = z.state.guests.filter(g => bookedIds.has(g.id));
    assert.equal(sleepersAfterEvict.length, bookedVips.length, `${label}: overnight VIP guests must NOT be evicted`);
    for (const g of sleepersAfterEvict) {
      assert.equal(g.state, 'resort_sleep', `${label}: retained guest should remain in resort_sleep`);
      assert.equal(z.Resort.shouldStayOvernight(g), true);
      assert.ok(g.energy > 30, `${label}: sleep should begin restoring energy`);
      assert.ok(g.happiness > 42, `${label}: sleep should begin restoring happiness`);
    }

    // Roll over midnight -> newDay() runs Z.Resort.onNewDay()
    const dayBefore = z.state.day;
    z.state.time = 0.998;
    for (let s = 0; s < 6; s++) z.Sim._step(0.5); // 3 sim seconds pushes time >= 1 -> newDay()
    assert.equal(z.state.day, dayBefore + 1, `${label}: expected day rollover`);
    assert.ok(z.state.resort.overnightStays >= 1, `${label}: overnightStays should increment on newDay`);

    // Advance to morning open hours -> sleepers wake up in 'walk' state
    z.state.time = OPEN_T + 0.03;
    for (let s = 0; s < 4; s++) z.Sim._step(0.25);

    for (const g of sleepersAfterEvict) {
      assert.equal(g.state, 'walk', `${label}: sleeping guest should wake up in walk state`);
      assert.equal(g.inObj, 0, `${label}: woken guest should exit lodge`);
      assert.ok(g.energy >= 50, `${label}: woken guest energy should be restored, got ${g.energy}`);
      assert.ok(g.happiness >= 50, `${label}: woken guest happiness should be restored, got ${g.happiness}`);
    }

    // Mid-stay bulldoze test: get a guest sleeping inside the villa, then demolish the villa
    const extraVip = z.resortCtx.spawnGuest(99998, true);
    extraVip.resortVip = 1;
    extraVip.budget = 2000;
    extraVip.money = 2000;
    extraVip.resortLodging = 0;
    assert.equal(z.Resort.tryBookOvernight(extraVip), true, `${label}: extra VIP should book villa`);
    const targetLodgeId = extraVip.resortLodging;
    const targetLodge = z.state.objects.find(o => o.id === targetLodgeId);
    assert.ok(targetLodge, `${label}: booked lodge must exist`);

    z.state.time = CLOSE_T + 0.01;
    for (let s = 0; s < 4; s++) z.Sim._step(0.25);
    assert.equal(extraVip.state, 'resort_sleep', `${label}: VIP should be sleeping before bulldoze`);

    const bRes = z.Sim.bulldoze(targetLodge.i, targetLodge.j);
    assert.equal(bRes.ok, true, `${label}: bulldoze occupied lodge failed`);
    assert.equal(z.state.objects.some(o => o.id === targetLodgeId), false);
    for (const g of z.state.guests) {
      assert.notEqual(g.resortLodging, targetLodgeId, `${label}: stale resortLodging after bulldoze`);
      assert.notEqual(g.inObj, targetLodgeId, `${label}: stale inObj after bulldoze`);
      assert.notEqual(g.state, 'resort_sleep', `${label}: guest left in resort_sleep after bulldoze`);
      assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z));
    }
    assert.ok(gateI >= 0);
  });
}

// ============================================================================
// 3. Private Luxury Enclosures (Dino & Zoo)
// ============================================================================
for (const zoo of [false, true]) {
  const label = zoo ? 'Zoo' : 'Dino';

  test(`${label}: Private luxury enclosures via gilded_glass, royal_marble, luxury scenery & vip_viewing_lounge`, () => {
    const z = createSimGame(zoo);
    newFlatPark(z, zoo, 909);

    // 1. Plain enclosure is NOT luxury
    const plainEnc = buildFencedBox(z, 10, 10, 14, 14, 'reinforced');
    assert.equal(z.Resort.isLuxuryEnclosure(plainEnc), false);
    const plainBonus = z.Resort.enclosureBonus(plainEnc);
    assert.equal(plainBonus.isLuxury, false);
    assert.equal(plainBonus.appealMul, 1);
    assert.equal(plainBonus.welfareBonus, 0);

    // 2. Gilded glass enclosure with luxury scenery
    const luxEnc1 = buildFencedBox(z, 16, 10, 21, 15, 'gilded_glass');
    assert.equal(z.Sim.placeObject('heated_oasis_pool', 17, 11, 0).ok, true);
    assert.equal(z.Sim.placeObject('marble_pavilion_shelter', 18, 11, 0).ok, true);
    assert.equal(z.Sim.placeObject('golden_enrichment', 19, 11, 0).ok, true);

    z.Resort.recompute();
    assert.equal(z.Resort.isLuxuryEnclosure(luxEnc1), true);
    const bonus1 = z.Resort.enclosureBonus(luxEnc1);
    assert.equal(bonus1.isLuxury, true);
    assert.ok(bonus1.appealMul > 1.25, `${label}: expected appealMul > 1.25, got ${bonus1.appealMul}`);
    assert.ok(bonus1.welfareBonus > 0, `${label}: expected welfareBonus > 0, got ${bonus1.welfareBonus}`);

    // 3. Royal marble enclosure adjacent to a connected vip_viewing_lounge
    const luxEnc2 = buildFencedBox(z, 30, 14, 35, 19, 'royal_marble');
    const lounge = z.Sim.placeObject('vip_viewing_lounge', 36, 18, 0);
    assert.equal(lounge.ok, true, `${label}: vip_viewing_lounge placement failed`);
    z.Resort.recompute();
    assert.equal(z.Resort.isLuxuryEnclosure(luxEnc2), true);
    const bonus2 = z.Resort.enclosureBonus(luxEnc2);
    assert.ok(bonus2.appealMul > 1.25, `${label}: royal_marble appealMul should be > 1.25`);
    assert.ok(bonus2.welfareBonus > 0, `${label}: royal_marble welfareBonus should be > 0`);

    assert.ok(z.state.resort.luxuryEncCount >= 2, `${label}: expected luxuryEncCount >= 2, got ${z.state.resort.luxuryEncCount}`);
  });
}

// ============================================================================
// 4. Security Guards & VIP Safe Zone (Dino & Zoo)
// ============================================================================
for (const zoo of [false, true]) {
  const label = zoo ? 'Zoo' : 'Dino';

  test(`${label}: resort_guard and vip_gatehouse provide VIP Safe Zone securityAura and security counts`, () => {
    const z = createSimGame(zoo);
    newFlatPark(z, zoo, 1010);

    // Initially no security
    assert.equal(z.state.resort.securityScore, 0);
    const farBefore = z.Resort.securityAura(0, 0);
    assert.equal(farBefore.protected, false);
    assert.equal(farBefore.panicDamp, 1);
    assert.equal(farBefore.safetyBonus, 0);

    // Place vip_gatehouse (2x2) with front on j=28
    const gate = z.Sim.placeObject('vip_gatehouse', 22, 26, 0);
    assert.equal(gate.ok, true, `${label}: vip_gatehouse placement failed`);

    // Hire resort_guard near the gatehouse on j=28 path
    const hire = z.Sim.hireStaff('resort_guard', 22, 28);
    assert.equal(hire.ok, true, `${label}: hireStaff(resort_guard) failed`);

    // Step >1s so secondly() updates RT.secCount and Resort.step recomputes securityScore
    z.Sim._step(1.2);
    z.Resort.recompute();

    assert.ok(z.state.resort.securityScore > 0, `${label}: securityScore should be > 0`);
    const summary = z.Resort.summary();
    assert.equal(summary.guardCount, 1, `${label}: summary.guardCount should be 1`);
    assert.equal(summary.securityCount, 1, `${label}: summary.securityCount should be 1`);
    assert.ok(z.Sim._rt().secCount >= 1, `${label}: RT.secCount should recognize resort_guard`);

    const gateObj = z.state.objects.find(o => o.id === gate.id);
    const ctr = z.resortCtx.objCenter(gateObj);
    const aura = z.Resort.securityAura(ctr.x, ctr.z);
    assert.equal(aura.protected, true, `${label}: VIP safe zone should be protected`);
    assert.ok(aura.panicDamp < 0.5, `${label}: panicDamp should be < 0.5, got ${aura.panicDamp}`);
    assert.ok(aura.safetyBonus > 0, `${label}: safetyBonus should be > 0, got ${aura.safetyBonus}`);

    const outsideAura = z.Resort.securityAura(0, 0);
    assert.equal(outsideAura.protected, false, `${label}: far corner should not be protected`);
  });
}

// ============================================================================
// 5. UI Resort Tab, Filter Chips & Inspect Blocks (Dino & Zoo)
// ============================================================================
for (const zoo of [false, true]) {
  const label = zoo ? 'Zoo' : 'Dino';

  test(`${label}: UI.Resort catDef, filter chips, and objectBlock / enclosureBlock rendering`, () => {
    const { z, mkEl } = createUiGame(zoo);
    z.Sim.newGame({ seed: 1111, map: 'meadow', mapSize: 'medium', money: 1000000 });
    z.state.unlocked.star = 4;

    const D = z.DATA;
    assert.ok(z.UI.Resort, `${label}: UI.Resort missing`);
    assert.ok(z.UI.CATS.some(c => c.id === 'resort'), `${label}: UI.CATS missing 'resort'`);

    const catDef = z.UI.Resort.catDef(D);
    assert.equal(catDef.id, 'resort');

    // Verify all 21 resort items in 'all' mode
    z.UI.Resort.drawerMode = 'all';
    const allItems = catDef.items();
    const expectedAllIds = [
      ...RESORT_BUILDINGS, ...RESORT_FENCES, ...RESORT_PATHS, ...RESORT_SCENERY, ...RESORT_STAFF
    ];
    assert.equal(allItems.length, expectedAllIds.length, `${label}: expected ${expectedAllIds.length} resort items`);
    for (const id of expectedAllIds) {
      assert.ok(allItems.some(it => it.id === id), `${label}: catDef missing item ${id}`);
    }

    // Open Resort tab and test all 6 filter chips via DOM clicks
    z.UI.openCat('resort', true);
    const chips = z.UI.el.cards.querySelectorAll('.tp-chip');
    assert.equal(chips.length, 6, `${label}: expected 6 filter chips`);

    const chipOrder = ['all', 'stays', 'dining', 'enclosures', 'security', 'decor'];
    for (let idx = 0; idx < chipOrder.length; idx++) {
      const mode = chipOrder[idx];
      chips[idx].click();
      assert.equal(z.UI.Resort.drawerMode, mode);
      const cards = z.UI.el.cards.querySelectorAll('.card');
      const renderedIds = cards.map(c => c.getAttribute('data-id')).sort();
      const expected = (mode === 'all' ? expectedAllIds : RESORT_TABS[mode]).slice().sort();
      assert.deepEqual(renderedIds, expected, `${label}: filter '${mode}' mismatch`);
    }

    // Reset filter to all
    chips[0].click();

    // Place a resort lodge and a luxury enclosure, then test objectBlock, enclosureBlock & Panel.open
    clearFlatArea(z, 10, 12, 36, 36);
    const gateI = Math.floor(z.N / 2) - 1;
    for (let j = 28; j <= 42; j++) {
      z.Sim.placePath(gateI, j, 'marble_promenade');
      z.Sim.placePath(gateI + 1, j, 'marble_promenade');
    }
    for (let i = 12; i <= 34; i++) z.Sim.placePath(i, 28, 'marble_promenade');

    const villa = z.Sim.placeObject('private_villa', 16, 25, 0);
    const gate = z.Sim.placeObject('vip_gatehouse', 20, 26, 0);
    assert.ok(villa.ok && gate.ok);
    const enc = buildFencedBox(z, 14, 15, 19, 20, 'gilded_glass');
    z.Resort.recompute();

    const villaObj = z.state.objects.find(o => o.id === villa.id);
    const villaDef = D.buildings.find(b => b.id === 'private_villa');
    const gateObj = z.state.objects.find(o => o.id === gate.id);
    const gateDef = D.buildings.find(b => b.id === 'vip_gatehouse');

    const objBody = mkEl('div');
    z.UI.Resort.objectBlock(villaObj, villaDef, objBody);
    assert.match(objBody.textContent, /Luxury Resort/);
    assert.match(objBody.textContent, /Beds Occupied/);
    assert.match(objBody.textContent, /Resort Prestige/);

    const gateBody = mkEl('div');
    z.UI.Resort.objectBlock(gateObj, gateDef, gateBody);
    assert.match(gateBody.textContent, /Luxury Resort/);
    assert.match(gateBody.textContent, /Protected Radius/);

    const encBody = mkEl('div');
    z.UI.Resort.enclosureBlock(enc, encBody);
    assert.match(encBody.textContent, /Luxury Enclosure/);
    assert.match(encBody.textContent, /Prestige Score/);

    // Verify full inspect panel renders cleanly for both object and enclosure
    z.UI.Panel.open('object', villa.id);
    assert.match(z.UI.el.panel.textContent, /Luxury Resort/);
    z.UI.Panel.open('enclosure', enc.id);
    assert.match(z.UI.el.panel.textContent, /Luxury Enclosure/);
  });
}

// ============================================================================
// 6. Save/Load Round-Trip & Legacy Save Compatibility (Dino & Zoo)
// ============================================================================
for (const zoo of [false, true]) {
  const label = zoo ? 'Zoo' : 'Dino';

  test(`${label}: Save/load round-trip preserves S.resort, overnight sleepers & luxury enclosures, and handles legacy saves`, () => {
    const z = createSimGame(zoo);
    newFlatPark(z, zoo, 1212);
    const { CLOSE_T } = z.resortCtx;

    const villa = z.Sim.placeObject('private_villa', 16, 25, 0);
    const dining = z.Sim.placeObject('michelin_restaurant', 20, 26, 0);
    const gate = z.Sim.placeObject('vip_gatehouse', 24, 26, 0);
    assert.ok(villa.ok && dining.ok && gate.ok);
    const enc = buildFencedBox(z, 12, 13, 17, 18, 'royal_marble');
    assert.equal(z.Sim.hireStaff('resort_guard', 20, 28).ok, true);

    z.state.open = true;
    z.state.time = 0.4;
    for (let s = 0; s < 120; s++) z.Sim._step(0.25);

    // Ensure a VIP guest is sleeping overnight in the villa
    let sleeper = z.state.guests.find(g => g.resortLodging);
    if (!sleeper) {
      sleeper = z.resortCtx.spawnGuest(88888, true);
      sleeper.resortVip = 1;
      sleeper.budget = 2000;
      sleeper.money = 2000;
      assert.equal(z.Resort.tryBookOvernight(sleeper), true);
    }
    const sleeperId = sleeper.id;
    const lodgeId = sleeper.resortLodging;

    z.state.time = CLOSE_T + 0.01;
    for (let s = 0; s < 4; s++) z.Sim._step(0.25);
    assert.equal(sleeper.state, 'resort_sleep');
    z.Resort.recompute();

    const beforeResort = { ...z.state.resort };
    assert.ok(beforeResort.roomRevenue > 0);
    assert.ok(beforeResort.prestige > 0);
    assert.ok(beforeResort.securityScore > 0);
    assert.ok(beforeResort.luxuryEncCount >= 1);

    const saved = z.Sim.save();

    // Reset to fresh game, then load saved state
    z.Sim.newGame({ seed: 1, map: 'meadow', mapSize: 'medium' });
    assert.equal(z.Sim.load(saved), true, `${label}: Sim.load(saved) failed`);

    assert.equal(z.state.resort.roomRevenue, beforeResort.roomRevenue);
    assert.equal(z.state.resort.vipArrivals, beforeResort.vipArrivals);
    assert.equal(z.state.resort.prestige, beforeResort.prestige);
    assert.equal(z.state.resort.securityScore, beforeResort.securityScore);
    assert.equal(z.state.resort.luxuryEncCount, beforeResort.luxuryEncCount);

    const loadedSleeper = z.state.guests.find(g => g.id === sleeperId);
    assert.ok(loadedSleeper, `${label}: overnight sleeper missing after load`);
    assert.equal(loadedSleeper.state, 'resort_sleep');
    assert.equal(loadedSleeper.resortLodging, lodgeId);
    assert.equal(loadedSleeper.inObj, lodgeId);
    assert.equal(z.Resort.shouldStayOvernight(loadedSleeper), true);

    const loadedEnc = z.Sim.enclosureAt(12, 13);
    assert.ok(loadedEnc, `${label}: enclosure missing after load`);
    assert.equal(z.Resort.isLuxuryEnclosure(loadedEnc), true);

    // Legacy save compatibility: strip s.resort from serialized JSON
    const parsed = JSON.parse(saved);
    delete parsed.s.resort;
    if (Array.isArray(parsed.s.enclosures)) {
      for (const e of parsed.s.enclosures) {
        delete e.isLuxury;
        delete e.luxuryPrestige;
      }
    }
    const legacyJson = JSON.stringify(parsed);

    z.Sim.newGame({ seed: 2, map: 'meadow', mapSize: 'medium' });
    assert.equal(z.Sim.load(legacyJson), true, `${label}: Sim.load(legacyJson) failed`);

    assert.ok(z.state.resort && typeof z.state.resort === 'object', `${label}: S.resort should be initialized with defaults`);
    assert.equal(z.state.resort.roomRevenue, 0);
    assert.equal(z.state.resort.vipArrivals, 0);
    assert.equal(z.state.resort.overnightStays, 0);
    assert.ok(Number.isFinite(z.state.resort.prestige) && z.state.resort.prestige > 0);
    assert.ok(Number.isFinite(z.state.resort.securityScore) && z.state.resort.securityScore > 0);
    assert.ok(z.state.resort.luxuryEncCount >= 1);
  });
}
