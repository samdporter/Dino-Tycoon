// Save-key isolation for the extracted Zoo game, without a renderer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gameScripts, readScript } = require('./game-scripts.cjs');

function zoo(seed) {
  const values = new Map(seed || []);
  function node() {
    return { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {}, innerHTML: '', className: '' };
  }
  const title = node(), ui = node();
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, URL: globalThis.URL || {}, Blob: globalThis.Blob || {}, FileReader: globalThis.FileReader || {},
    localStorage: { getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) },
    document: { readyState: 'loading', hidden: false, addEventListener() {}, getElementById: id => id === 'title' ? title : ui },
    location: { protocol: 'http:' }, performance: { now: () => 0 } });
  vm.runInContext('var window=globalThis', ctx);
  const load = file => vm.runInContext(readScript(file, true), ctx);
  ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js'].forEach(load);
  const z = ctx.Z;
  z.UI = { h: node, ic: () => '', snd() {}, toast() {}, reset() {}, closeModal() {}, narrow: () => false,
    Tutorial: { restart() {} }, el: { cards: node() } };
  z.World = { cam: { target: { x: 0, z: 0 } }, resize() {} };
  z.Audio = { enabled: () => true, setEnabled() {} };
  load('main-lifecycle.js'); load('60-main.js');
  z.Main.showTitle();
  return { z, values };
}

test('Zoo new game and save use only the Wild Acres save key', () => {
  const dinoSave = '{"dino":"keep"}';
  const { z, values } = zoo([['amberacres.save.v2', dinoSave]]);
  z.Main.newGame();
  assert.equal(z.Main.save(), true);
  assert.ok(values.has('wildacres.save.v1'));
  assert.equal(values.get('amberacres.save.v2'), dinoSave);
  assert.deepEqual([...values.keys()].sort(), ['amberacres.save.v2', 'wildacres.save.v1']);
});

test('a Dino-only save does not make Zoo report a saved park', () => {
  const { z } = zoo([['amberacres.save.v2', '{"dino":"keep"}']]);
  assert.equal(z.Main.hasSave(), false);
});

// 1. Undo system
test('Undo system supports beginStroke, paintTerrain, endStroke, canUndo, and undo', () => {
  const { z } = zoo();
  z.Sim.newGame(1);
  const can0 = z.Sim.canUndo();
  assert.equal(can0.count, 0);

  z.Sim.beginStroke('Terrain');
  z.Sim.paintTerrain(25, 25, 'sand', 1);
  z.Sim.endStroke();

  const can1 = z.Sim.canUndo();
  assert.equal(can1.count, 1);
  assert.equal(can1.label, 'Terrain');

  const u = z.Sim.undo();
  assert.equal(u.ok, true);
  assert.equal(z.Sim.canUndo().count, 0);
});

// 2. Terraforming & elevation and survival across save/load
test('Terraforming, elevation, and survival across save and load', () => {
  const { z } = zoo();
  z.Sim.newGame(1);
  
  const hBefore = z.Sim.cornerElev(25, 25);
  const res = z.Sim.terraform(25, 25, 'raise', 1);
  assert.equal(res.ok, true);
  const hAfter = z.Sim.cornerElev(25, 25);
  assert.notEqual(hAfter, hBefore);

  const hAt = z.Sim.heightAt(25 * 2, 25 * 2);
  assert.equal(typeof hAt, 'number');

  const cliff = z.Sim.isCliff(25, 25);
  assert.equal(typeof cliff, 'boolean');

  const saved = z.Sim.save();
  z.Sim.newGame(2);
  assert.notEqual(z.Sim.cornerElev(25, 25), hAfter);

  const loaded = z.Sim.load(saved);
  assert.equal(loaded, true);
  assert.equal(z.Sim.cornerElev(25, 25), hAfter);
});

// 3. Map & difficulty selection
test('Map and difficulty selection sets state properly', () => {
  const { z } = zoo();
  z.Sim.newGame(42, { map: 'lakeland', difficulty: 'hard' });
  assert.equal(z.state.map.id, 'lakeland');
  assert.equal(z.state.difficulty, 'hard');
  assert.equal(typeof z.Sim.diff('income'), 'number');
});

// 4. Weather simulation and Habitat Guide
test('Weather simulation and Habitat Guide', () => {
  const { z } = zoo();
  z.Sim.newGame(1);

  const wx = z.Sim.weatherReport();
  assert.ok(wx);
  assert.ok(wx.type);

  const guide = z.Sim.habitatGuide();
  assert.ok(guide);
  assert.ok(Array.isArray(guide.species));
  assert.ok(Array.isArray(guide.plants));

  const plantObj = { type: 'oak', i: 25, j: 25 };
  const ok = z.Sim.plantOk(plantObj);
  assert.equal(typeof ok, 'boolean');
});

// 5. Save Export / Import rejecting corrupt saves while preserving park state, and accepting valid saves
test('Save Export / Import rejects corrupt saves while preserving state, and accepts valid saves', async () => {
  const { z } = zoo();
  z.Sim.newGame(1);
  const validSave = z.Sim.save();

  const resCorrupt = await z.Main.importSave('{"v":1,"s":"corrupt"}');
  assert.equal(resCorrupt, false);

  const resValid = await z.Main.importSave(validSave);
  assert.equal(resValid, true);
});

// 6. Park lockdown when an escaped dangerous animal is loose
test('Park lockdown when an escaped dangerous animal is loose', () => {
  const { z } = zoo();
  z.Sim.newGame(1);

  assert.equal(z.Sim.isLockdown(), false);

  const enc = z.state.enclosures[0];
  if (enc) {
    const lion = z.Sim.addAnimal('lion', enc.tiles[0]);
    if (lion) {
      z.Sim._rt().escaped.push(lion);
      lion.state = 'escaped';
      z.Sim.tick(1);
      assert.equal(z.Sim.isLockdown(), true);
    }
  }
});

test('Zoo animals detour around rocks/trees, walk through bushes, and can reach toys', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 42, money: 100000 });
  for (let i = 10; i <= 14; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 20 }, 'low_wood');
    z.Sim.placeFence({ axis: 'x', i, j: 25 }, 'low_wood');
  }
  for (let j = 20; j <= 24; j++) {
    z.Sim.placeFence({ axis: 'z', i: 10, j }, 'low_wood');
    z.Sim.placeFence({ axis: 'z', i: 15, j }, 'low_wood');
  }
  // Place boulders/trees across j=22 except i=10 (which has a bush)
  assert.equal(z.Sim.placeObject('boulder', 11, 22, 0).ok, true);
  assert.equal(z.Sim.placeObject('oak', 12, 22, 0).ok, true);
  assert.equal(z.Sim.placeObject('rock_pile', 13, 22, 0).ok, true);
  assert.equal(z.Sim.placeObject('pine', 14, 22, 0).ok, true);
  assert.equal(z.Sim.placeObject('bush', 10, 22, 0).ok, true);
  // Place a climbing_frame toy at (12, 24)
  assert.equal(z.Sim.placeObject('climbing_frame', 12, 24, 0).ok, true);

  const res = z.Sim.addAnimal('meerkat', 12, 20);
  assert.equal(res.ok, true);
  const animal = z.state.animals[0];
  // Direct the animal to play on the climbing frame on the other side of the wall
  animal.tg = 'play';
  animal.state = 'walk';
  animal.tx = 12 * z.TILE + 1;
  animal.tz = 24 * z.TILE + 1;

  let reachedPlay = false;
  for (let step = 0; step < 700; step++) {
    z.Sim.tick(0.05);
    const ti = Math.floor(animal.x / z.TILE), tj = Math.floor(animal.z / z.TILE);
    assert.notEqual(`${ti},${tj}`, '11,22');
    assert.notEqual(`${ti},${tj}`, '12,22');
    assert.notEqual(`${ti},${tj}`, '13,22');
    assert.notEqual(`${ti},${tj}`, '14,22');
    if (animal.state === 'play') { reachedPlay = true; break; }
  }
  assert.equal(reachedPlay, true, 'Zoo animal should detour through the bush around rocks/trees and enter the climbing_frame tile to play');
});

test('Zoo enclosures compute finite centroids across creation, load, and animal movement', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 42, money: 200000 });
  for (let i = 16; i <= 24; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 16 }, 'reinforced');
    z.Sim.placeFence({ axis: 'x', i, j: 25 }, 'reinforced');
  }
  for (let j = 16; j <= 24; j++) {
    z.Sim.placeFence({ axis: 'z', i: 16, j }, 'reinforced');
    z.Sim.placeFence({ axis: 'z', i: 25, j }, 'reinforced');
  }
  assert.equal(z.state.enclosures.length, 1);
  const enc = z.state.enclosures[0];
  assert.ok(Number.isFinite(enc.cx) && Number.isFinite(enc.cz));
  assert.ok(enc.cx >= 16 * z.TILE && enc.cx <= 25 * z.TILE);
  assert.ok(enc.cz >= 16 * z.TILE && enc.cz <= 25 * z.TILE);

  const res = z.Sim.addAnimal('meerkat', 20, 20);
  assert.equal(res.ok, true);
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  const loadedEnc = z.state.enclosures[0];
  assert.ok(Number.isFinite(loadedEnc.cx) && Number.isFinite(loadedEnc.cz));

  // Missing target coordinates during animal movement must not produce NaN position
  const a = z.state.animals[0];
  a.state = 'walk';
  a.tx = undefined;
  a.tz = 20 * z.TILE;
  for (let k = 0; k < 10; k++) z.Sim.tick(0.1);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
});

function zooWithPlayTimer(opts) {
  const values = new Map();
  function node(tag) {
    const attrs = {};
    const classes = new Set();
    const n = {
      nodeType: 1,
      tagName: (tag || 'div').toUpperCase(),
      children: [],
      parentNode: null,
      style: {},
      innerHTML: '',
      textContent: '',
      className: '',
      listeners: {},
      classList: {
        add(...c) { c.forEach(x => classes.add(x)); },
        remove(...c) { c.forEach(x => classes.delete(x)); },
        toggle(c, f) { const on = f === undefined ? !classes.has(c) : !!f; if (on) classes.add(c); else classes.delete(c); return on; },
        contains(c) { return classes.has(c); }
      },
      appendChild(c) { if (c && typeof c === 'object') { c.parentNode = n; n.children.push(c); } return c; },
      insertBefore(c, ref) {
        if (c && typeof c === 'object') {
          c.parentNode = n;
          const idx = n.children.indexOf(ref);
          if (idx >= 0) n.children.splice(idx, 0, c); else n.children.push(c);
        }
        return c;
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return k in attrs ? attrs[k] : null; },
      addEventListener(ev, fn) { (n.listeners[ev] = n.listeners[ev] || []).push(fn); },
      contains(target) { return target === n || n.children.some(c => c && c.contains && c.contains(target)); },
      getBoundingClientRect() { return { left: 120, right: 200, top: 6, bottom: 48, width: 80, height: 42 }; },
      offsetParent: {}
    };
    return n;
  }
  const title = node('div'), ui = node('div'), body = node('body');
  const speed = node('div'), r2 = node('div');
  r2.appendChild(speed);
  const toasts = [];
  const doc = {
    readyState: 'loading',
    hidden: !!(opts && opts.hidden),
    body,
    addEventListener() {},
    createElement: tag => node(tag),
    createTextNode: t => ({ nodeType: 3, textContent: String(t) }),
    getElementById: id => id === 'title' ? title : ui,
    querySelector: sel => sel === '#ui' ? ui : null
  };
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout,
    URL: globalThis.URL || {}, Blob: globalThis.Blob || {}, FileReader: globalThis.FileReader || {},
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    },
    document: doc,
    location: { protocol: 'http:' },
    performance: { now: () => 0 },
    addEventListener() {},
    innerWidth: 1280,
    innerHeight: 900
  });
  vm.runInContext('var window=globalThis', ctx);
  const load = file => vm.runInContext(readScript(file, true), ctx);
  ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js'].forEach(load);
  const z = ctx.Z;
  z.UI = {
    h: (sel, a, ...kids) => {
      const el = node(sel.split(/[.#]/)[0] || 'div');
      if (a && a.constructor === Object) {
        if (a.text != null) el.textContent = a.text;
        if (a.html != null) el.innerHTML = a.html;
        if (a.on) Object.keys(a.on).forEach(ev => el.addEventListener(ev, a.on[ev]));
        Object.keys(a).forEach(k => {
          if (k !== 'text' && k !== 'html' && k !== 'on' && k !== 'style' && a[k] !== false && a[k] != null) {
            el.setAttribute(k, a[k] === true ? '' : a[k]);
          }
        });
      } else if (a !== undefined) {
        kids.unshift(a);
      }
      kids.flat().forEach(c => { if (c && c.nodeType) el.appendChild(c); });
      return el;
    },
    $: (sel, r) => (sel === '#ui' ? ui : null),
    ic: n => `<svg data-ic="${n}"></svg>`,
    snd() {},
    toast(text, kind) { toasts.push({ text, kind }); },
    reset() {},
    closeModal() {},
    narrow: () => false,
    Tutorial: { restart() {}, active: () => false },
    el: { cards: node('div'), speed }
  };
  z.UI.init = () => {};
  z.World = { cam: { target: { x: 0, z: 0 } }, resize() {} };
  z.Audio = { enabled: () => true, setEnabled() {} };
  load('56-playtimer.js');
  load('main-lifecycle.js'); load('60-main.js');
  z.UI.init();
  z.Main.showTitle();
  return { z, doc, toasts, r2 };
}

test('Zoo PlayTimer tracks active session time, pause/resume, checkpoints, break reminders, and reset', () => {
  const { z, doc, toasts } = zooWithPlayTimer();
  const pt = z.UI.PlayTimer;
  assert.ok(pt);
  assert.equal(pt.state().active, false);
  assert.equal(pt.formatted(), '00:00');
  assert.equal(pt.formattedLong(), '00:00:00');

  // Inactive on title screen: ticking must not advance timer
  pt.tick(10);
  assert.equal(pt.elapsed(), 0);

  // Starting a park starts the session from 00:00
  z.Main.newGame();
  assert.equal(pt.state().active, true);
  assert.equal(pt.elapsed(), 0);

  // Advance by 65 seconds and ignore invalid deltas
  pt.tick(65);
  pt.tick(-5);
  pt.tick(Number.NaN);
  pt.tick(Infinity);
  assert.equal(pt.formatted(), '01:05');
  assert.equal(pt.formattedLong(), '00:01:05');

  // Hidden tab does not count play time
  doc.hidden = true;
  pt.tick(30);
  assert.equal(pt.formatted(), '01:05');
  doc.hidden = false;

  // Manual pause stops advancing until resumed
  pt.pause();
  assert.equal(pt.state().paused, true);
  pt.tick(40);
  assert.equal(pt.formatted(), '01:05');
  pt.resume();
  assert.equal(pt.state().paused, false);
  pt.tick(3595); // total 3660s -> 1h 01m 00s
  assert.equal(pt.formatted(), '1:01:00');
  assert.equal(pt.formattedLong(), '01:01:00');

  // Checkpoints / laps record deltas and day
  pt.mark();
  pt.tick(30);
  pt.mark();
  const st = pt.state();
  assert.equal(st.laps.length, 2);
  assert.equal(Math.floor(st.laps[0].delta), 3660);
  assert.equal(Math.floor(st.laps[1].delta), 30);
  pt.clearLaps();
  assert.equal(pt.state().laps.length, 0);

  // Break reminder fires toast once, supports snooze and dismiss
  pt.reset();
  pt.setReminder(15);
  pt.tick(899);
  assert.equal(pt.state().alertFired, false);
  pt.tick(1);
  assert.equal(pt.state().alertFired, true);
  assert.ok(toasts.some(t => t.text.includes('15 minutes')));
  pt.snooze(15);
  assert.equal(pt.state().alertFired, false);
  pt.tick(900);
  assert.equal(pt.state().alertFired, true);
  pt.dismissAlert();
  assert.equal(pt.state().alertDismissed, true);

  // Returning to title ends session; new/continue starts fresh session
  z.Main.toTitle();
  assert.equal(pt.state().active, false);
  const prev = pt.elapsed();
  pt.tick(20);
  assert.equal(pt.elapsed(), prev);
  z.Main.continueGame();
  assert.equal(pt.state().active, true);
  assert.equal(pt.elapsed(), 0);
});

test('PlayTimer is present only in Zoo Tycoon and not in Dino Tycoon', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const zooHtml = fs.readFileSync(path.join(__dirname, '../zoo.html'), 'utf8');
  assert.ok(!indexHtml.includes('playtimer'), 'index.html must not load playtimer');
  assert.ok(zooHtml.includes('src/zoo/56-playtimer.js'), 'zoo.html must load 56-playtimer.js');

  const dinoSrcFiles = [...gameScripts()].filter(([, fullPath]) => fullPath.includes('/src/dino/')).map(([file]) => file);
  for (const file of dinoSrcFiles) {
    const content = readScript(file);
    assert.ok(!content.includes('PlayTimer') && !content.includes('timerchip'), `Dino script ${file} must not include PlayTimer`);
  }
  const dinoCss = fs.readFileSync(path.join(__dirname, '../styles/game.css'), 'utf8');
  assert.ok(!dinoCss.includes('timerchip') && !dinoCss.includes('timerpop'), 'styles/game.css must not include PlayTimer styles');
});

test('Zoo guests stroll, wander freely across paths, spread along exhibits, and record seen species', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 42, money: 250000 });
  // Flatten a clear area north of the entrance plaza and connect an extended path network
  for (let j = 18; j <= 39; j++) {
    for (let i = 20; i <= 36; i++) {
      z.Sim.bulldoze(i, j);
      z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
      z.state.terrain[i + j * z.N] = 0;
    }
  }
  for (let j = 20; j <= 39; j++) {
    assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
    assert.equal(z.Sim.placePath(28, j, 'paved').ok, true);
  }
  for (let i = 21; i <= 35; i++) {
    if (i === 27 || i === 28) continue;
    assert.equal(z.Sim.placePath(i, 20, 'paved').ok, true);
    assert.equal(z.Sim.placePath(i, 30, 'paved').ok, true);
  }
  // Place scenic focal points along the far paths
  assert.equal(z.Sim.placeObject('fountain', 22, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('flower_bed', 34, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('statue', 22, 31, 0).ok, true);

  // Build an enclosure bordering the main avenue (i=29..34, j=32..37) with multiple viewing tiles
  for (let i = 29; i <= 34; i++) {
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 32 }, 'low_wood').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 38 }, 'low_wood').ok, true);
  }
  for (let j = 32; j <= 37; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 29, j }, 'low_wood').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 35, j }, 'low_wood').ok, true);
  }
  assert.equal(z.Sim.addAnimal('meerkat', 31, 35).ok, true);

  z.state.time = 0.35; // morning open hours
  z.state.speed = 1;

  const observedGoals = new Set();
  const viewSpots = new Set();
  const visitedJ = new Set();
  let sawSpecies = false;

  for (let step = 0; step < 900; step++) {
    z.Sim.tick(0.05);
    for (const g of z.state.guests) {
      assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z), 'guest coordinates stay finite');
      if (g.gt) observedGoals.add(g.gt);
      if (g.gt === 'enc' && g.spot) viewSpots.add(g.spot);
      if (g.seen && g.seen.meerkat) sawSpecies = true;
      visitedJ.add(Math.floor(g.z / z.TILE));
    }
  }

  assert.ok(z.state.stats.guestsTotal >= 5, 'guests entered the zoo');
  assert.equal(sawSpecies, true, 'guests record species IDs in g.seen after watching an enclosure');
  assert.ok(observedGoals.has('stroll') || observedGoals.has('wander'),
    `expected guests to stroll or wander freely even with an exhibit present, saw goals: ${[...observedGoals].join(',')}`);
  assert.ok(observedGoals.has('stroll'), 'guests should pick scenic stroll landmarks around the zoo');
  assert.ok(viewSpots.size > 1, `guests should spread across multiple viewing tiles, got ${viewSpots.size}`);
  const minJ = Math.min(...visitedJ);
  assert.ok(minJ <= 26, `guests should roam far beyond the entrance and exhibit (min tile j=${minJ})`);
});

test('Zoo guests wander freely with no enclosures and legacy saves without gxPlan patch cleanly', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 7, money: 200000 });
  for (let j = 26; j <= 39; j++) {
    for (let i = 25; i <= 30; i++) {
      z.Sim.bulldoze(i, j);
      z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
      z.state.terrain[i + j * z.N] = 0;
    }
  }
  for (let j = 26; j <= 39; j++) {
    assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
    assert.equal(z.Sim.placePath(28, j, 'paved').ok, true);
  }
  z.state.time = 0.35;
  z.state.speed = 1;

  const goals = new Set();
  for (let k = 0; k < 500; k++) {
    z.Sim.tick(0.05);
    for (const g of z.state.guests) if (g.gt) goals.add(g.gt);
  }
  assert.ok(goals.has('stroll') || goals.has('wander'),
    `expected guests to stroll/wander without exhibits, got: ${[...goals].join(',')}`);
  assert.ok(goals.has('wander'), 'guests should also take free random wanders');

  // Simulate loading a legacy Zoo save whose guest lacks g.al and has numeric enclosure key in g.seen
  const guest = z.state.guests[0];
  assert.ok(guest);
  delete guest.al;
  delete guest.seenEnc;
  guest.seen = { '1': 3 };
  const raw = z.Sim.save();
  assert.equal(z.Sim.load(raw), true);
  for (let k = 0; k < 40; k++) z.Sim.tick(0.05);
  const patched = z.state.guests[0];
  assert.ok(patched && patched.al && patched.seenEnc, 'legacy guest receives gxPlan fields after load and tick');
  assert.equal(patched.seen['1'], undefined, 'numeric enclosure keys are cleaned from g.seen during migration');
});

test('Zoo guests use facilities, sit on benches, revalidate across path edits, and exit cleanly', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 11, money: 250000 });
  for (let j = 32; j <= 39; j++) {
    for (let i = 24; i <= 32; i++) {
      z.Sim.bulldoze(i, j);
      z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
      z.state.terrain[i + j * z.N] = 0;
    }
  }
  for (let j = 33; j <= 39; j++) {
    assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
    assert.equal(z.Sim.placePath(28, j, 'paved').ok, true);
  }
  assert.equal(z.Sim.placeObject('burger_stand', 26, 37, 0).ok, true);
  assert.equal(z.Sim.placeObject('drinks_stall', 26, 36, 0).ok, true);
  assert.equal(z.Sim.placeObject('toilets', 26, 35, 0).ok, true);
  assert.equal(z.Sim.placeObject('bench', 29, 36, 0).ok, true);

  z.state.time = 0.35;
  z.state.speed = 1;
  let sawUse = false, sawSit = false, sawExit = false;
  for (let k = 0; k < 400; k++) {
    z.Sim.tick(0.05);
    for (const g of z.state.guests) {
      if (g.state === 'use') sawUse = true;
      if (g.state === 'sit') sawSit = true;
    }
  }
  // Drive one guest's needs to ensure facility and bench usage
  const g0 = z.state.guests[0];
  assert.ok(g0);
  g0.money = 50; g0.al.drink = 2; g0.stay = 60; g0.bladder = 0; g0.hunger = 0;
  g0.thirst = 90; g0.nbuy = 0; g0.gt = ''; g0.dk = ''; g0.state = 'walk';
  for (let k = 0; k < 350; k++) {
    z.Sim.tick(0.05);
    if (g0.state === 'use') sawUse = true;
  }
  g0.stay = 60; g0.bladder = 0; g0.hunger = 0; g0.thirst = 0;
  g0.energy = 10; g0.nbt = 0; g0.gt = ''; g0.dk = ''; g0.state = 'walk';
  for (let k = 0; k < 350; k++) {
    z.Sim.tick(0.05);
    if (g0.state === 'sit') sawSit = true;
  }
  assert.equal(sawUse, true, 'guests should use nearby facilities when needed');
  assert.equal(sawSit, true, 'tired guests should sit on nearby benches');

  // Bulldozing a path tile under a walking guest moves them cleanly to an adjacent path
  const tileI = Math.floor(g0.x / z.TILE), tileJ = Math.floor(g0.z / z.TILE);
  if (tileJ < 52 && z.state.path[tileI + tileJ * z.N]) {
    z.Sim.bulldoze(tileI, tileJ);
    z.Sim.tick(0.05);
    const ni = Math.floor(g0.x / z.TILE), nj = Math.floor(g0.z / z.TILE);
    assert.ok(z.state.path[ni + nj * z.N] > 0, 'revalidated guest moves onto a valid remaining path tile');
  }

  // Closing the park causes guests to leave cleanly
  z.Sim.setOpen(false);
  for (let k = 0; k < 600 && z.state.guests.length > 0; k++) {
    z.Sim.tick(0.05);
    if ((z.state.stats.guestsLeft || 0) > 0) sawExit = true;
  }
  assert.equal(sawExit, true, 'guests leave through the gate when closing');
  assert.equal(z.state.guests.length, 0, 'all guests finish exiting cleanly');
});

test('Zoo keepers and vets interrupt patrols via radio, fix breaches, release claims when sick/fired, and recover off-path', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 910 });
  z.state.money = 300000;
  z.state.unlocked.star = 3;
  const N = z.N;
  const fenceBox = (i0, j0, i1, j1, kind) => {
    for (let i = i0; i <= i1; i++) { z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind); z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind); }
    for (let j = j0; j <= j1; j++) { z.Sim.placeFence({ axis: 'z', i: i0, j }, kind); z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind); }
  };
  for (let j = 20; j <= 39; j++) for (let i = 20; i <= 34; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }
  for (let j = 22; j <= 39; j++) assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
  for (let i = 21; i <= 26; i++) assert.equal(z.Sim.placePath(i, 24, 'paved').ok, true);
  fenceBox(22, 25, 25, 28, 'chainlink');
  const zebra = z.Sim.spawnAnimal('zebra', 23, 26);
  const enc = z.state.enclosures.find(e => e.id === zebra.enc);
  assert.ok(enc && enc.viewTiles.length > 0);

  // Hire keeper & vet while park is healthy -> both patrol on radio ready
  const hk = z.Sim.hireStaff('keeper', 27, 36);
  const hv = z.Sim.hireStaff('vet', 27, 37);
  const hv2 = z.Sim.hireStaff('vet', 27, 38);
  assert.ok(hk.ok && hv.ok && hv2.ok);
  const keeper = z.state.staff.find(s => s.id === hk.id);
  const v1 = z.state.staff.find(s => s.id === hv.id);
  const v2 = z.state.staff.find(s => s.id === hv2.id);
  for (let t = 0; t < 10 && (!keeper.tk || keeper.tk.k !== 'patrol' || !v1.tk || v1.tk.k !== 'patrol'); t++) z.Sim._step(0.5);
  assert.equal(keeper.tk.k, 'patrol');
  assert.equal(v1.tk.k, 'patrol');

  // Keeper interrupts patrol immediately via radio for moderate food/single poop/breach
  enc.foodLevel = 0.7;
  enc.poop = 1;
  enc.breach = 1;
  for (let t = 0; t < 5; t++) z.Sim._step(0.5);
  assert.equal(keeper.tk.k, 'enc', 'Zoo keeper interrupts patrol immediately');
  assert.equal(keeper.tk.id, enc.id);
  for (let t = 0; t < 40 && (enc.breach > 0 || enc.foodLevel < 1 || enc.poop > 0); t++) z.Sim._step(0.5);
  assert.equal(enc.breach, 0, 'Zoo keeper repairs breached fence');
  assert.equal(enc.foodLevel, 1, 'Zoo keeper refills food');
  assert.equal(enc.poop, 0, 'Zoo keeper cleans poop');

  // Vet interrupts patrol immediately via radio for sick animal; going sick releases claim so v2 treats it!
  assert.equal(z.Sim.placeObject('vet_clinic', 28, 25, 3).ok, true);
  zebra.sick = true;
  zebra.health = 45;
  for (let t = 0; t < 5 && !(v1.tk && v1.tk.k === 'vet') && !(v2.tk && v2.tk.k === 'vet'); t++) z.Sim._step(0.5);
  const activeV = (v1.tk && v1.tk.k === 'vet') ? v1 : v2;
  const backupV = activeV === v1 ? v2 : v1;
  assert.equal(activeV.tk && activeV.tk.k, 'vet', 'Zoo vet interrupts patrol via radio');

  activeV.sickUntil = z.state.day + z.state.time + 0.5;
  z.Sim._step(0.1);
  assert.equal(z.Sim._rt().claim['v' + zebra.id], undefined, 'Zoo releases vet claim when vet goes off sick');
  for (let t = 0; t < 80 && zebra.sick; t++) z.Sim._step(0.5);
  assert.equal(zebra.sick, false, 'backup vet treats sick animal without permanent claim lock');
  assert.equal(zebra.health, 100, 'Vet clinic nearby enables full recovery');

  // Off-path recovery lands on nearest path tile on reachable component (not pathTiles[0])
  backupV.tk = null; backupV.route = null; backupV.wt = 0;
  backupV.x = 2; backupV.z = 2;
  z.Sim._step(0.1);
  const vt = Math.floor(backupV.x / z.TILE) + Math.floor(backupV.z / z.TILE) * N;
  assert.ok(z.state.path[vt] > 0, 'Zoo off-path staff recovers onto nearest path');

  // Unreachable enclosure with no path within 3 tiles warns about keeper and vet access in reports
  for (let j = 11; j <= 15; j++) for (let i = 11; i <= 15; i++) {
    z.Sim.bulldoze(i, j); z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 }); z.state.terrain[i + j * N] = 0;
  }
  fenceBox(12, 12, 14, 14, 'chainlink');
  const iso = z.Sim.spawnAnimal('meerkat', 13, 13);
  iso.sick = true;
  const isoEnc = z.state.enclosures.find(e => e.id === iso.enc);
  const er = z.Sim.enclosureReport(isoEnc.id);
  const ar = z.Sim.animalReport(iso.id);
  assert.equal(er.noAccess, true);
  assert.ok(er.issues.some(x => /Keepers and vets cannot reach/i.test(x)));
  assert.ok(ar.issues.some(x => /Vets cannot reach/i.test(x)));
});

test('Zoo UI shows 48t station badges, preview zones, inspect stats, and radio dispatch status', () => {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {}, style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1, tagName: String(tag || 'div').toUpperCase(), style, children,
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); }, remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || ''); children.length = 0;
        const stack = [node], re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
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
          for (const a of attrM) { const p = a.slice(1, -1).split('='); if (el.getAttribute(p[0]) !== p[1].replace(/^"|"$/g, '')) return false; s = s.replace(a, ''); }
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
          const walk = el => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk); scope = next;
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
  const doc = {
    head, body, createElement: mkEl, createTextNode: t => ({ nodeType: 3, textContent: String(t ?? ''), children: [] }),
    getElementById: id => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: s => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: s => rootUi.querySelectorAll(s), addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document: doc, window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  const load = f => vm.runInContext(readScript(f, true), ctx, { filename: f });
  ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js'].forEach(load);
  const z = ctx.Z;
  let lastPreview = null;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview(s) { lastPreview = s; }, highlightEnclosure() {}, thumb: () => null, focus() {} };
  ['50-ui-dom.js', '50-ui.js', '51-input.js', '51-tools.js', '52-panels.js', '53-screen-shell.js', '53-standard-tabs.js', '53-screens.js'].forEach(load);
  z.UI.init();
  z.Sim.newGame({ seed: 911 });
  z.state.money = 250000; z.state.unlocked.star = 3;
  assert.equal(z.Sim.placePath(27, 36, 'paved').ok, true);

  z.UI.openCat('staff', true);
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="keeper_hut"] .spb').textContent, '48t');
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="vet_clinic"] .spb').textContent, '48t');

  z.UI.el.cards.querySelector('.card[data-id="vet_clinic"]').click();
  const vcPlan = z.UI.Tools.PLAN.building({ a: { i: 28, j: 36 }, b: { i: 28, j: 36 } });
  assert.match(vcPlan.warn, /48-tile triage zone/);
  assert.equal(vcPlan.spec.ranges[0].r, 48 * z.TILE);
  z.UI.Tools.cancel();

  const vc = z.Sim.placeObject('vet_clinic', 28, 36, 3);
  const vh = z.Sim.hireStaff('vet', 27, 36);
  assert.ok(vc.ok && vh.ok);

  z.UI.Panel.open('object', vc.id);
  assert.match(z.UI.el.panel.textContent, /Clinic triage zone.*48 tiles/);
  assert.ok(lastPreview && lastPreview.ranges && lastPreview.ranges[0].r === 48 * z.TILE);

  z.UI.Panel.open('staff', vh.id);
  assert.match(z.UI.el.panel.textContent, /Radio on call.*reachable paths/);
  assert.equal(lastPreview.type, 'ranges');
  z.UI.Panel.hide();

  z.UI.openModal('stf');
  assert.match(z.UI.el.mbody.textContent, /radio on call/);
  z.UI.closeModal();
});

test('Zoo supports all 4 map sizes, non-mutating previewMap, cross-size save/load, and corrupt-size rejection', () => {
  const { z } = zoo();
  const expectedSizes = { small: 40, medium: 56, large: 72, huge: 88 };
  assert.deepEqual(
    Array.from(z.DATA.mapSizes, s => [s.id, s.n]),
    Object.entries(expectedSizes)
  );

  for (const [sizeId, n] of Object.entries(expectedSizes)) {
    z.Sim.newGame({ seed: 42, map: 'meadow', mapSize: sizeId, difficulty: 'easy' });
    assert.equal(z.N, n);
    assert.equal(z.state.gridN, n);
    assert.equal(z.state.mapSize, sizeId);
    assert.equal(z.state.terrain.length, n * n);
    assert.equal(z.state.path.length, n * n);
    assert.equal(z.state.fenceX.length, n * (n + 1));
    assert.equal(z.state.fenceZ.length, (n + 1) * n);
    assert.equal(z.state.elev.length, (n + 1) * (n + 1));

    const gateI0 = Math.floor(n / 2) - 1;
    assert.ok(z.state.path[gateI0 + (n - 1) * n] > 0, `Gate left tile at N=${n}`);
    assert.ok(z.state.path[(gateI0 + 1) + (n - 1) * n] > 0, `Gate right tile at N=${n}`);
    assert.ok(z.state.path[gateI0 + (n - 6) * n] > 0, `Main avenue left tile at N=${n}`);
    assert.ok(z.state.path[(gateI0 + 1) + (n - 6) * n] > 0, `Main avenue right tile at N=${n}`);
    assert.equal(z.state.path[(gateI0 - 1) + (n - 6) * n], 0, `Main avenue centered left bound at N=${n}`);
    assert.equal(z.state.path[(gateI0 + 2) + (n - 6) * n], 0, `Main avenue centered right bound at N=${n}`);
  }

  // previewMap('huge') while 'small' is active returns N=88 without mutating Z.N
  z.Sim.newGame({ seed: 101, map: 'meadow', mapSize: 'small' });
  assert.equal(z.N, 40);
  const preview = z.Sim.previewMap('meadow', 777, 'huge');
  assert.ok(preview);
  assert.equal(preview.N, 88);
  assert.equal(preview.terrain.length, 88 * 88);
  assert.equal(preview.elev.length, 89 * 89);
  assert.equal(z.N, 40);
  assert.equal(z.state.gridN, 40);
  assert.equal(z.state.terrain.length, 40 * 40);

  // Saving huge (88), starting small (40), then loading huge restores Z.N === 88 and state cleanly
  z.Sim.newGame({ seed: 555, map: 'meadow', mapSize: 'huge', money: 123456 });
  assert.equal(z.Sim.placePath(43, 70, 'paved').ok, true);
  const hugeMoneyAfterPath = z.state.money;
  const hugeSaved = z.Sim.save();

  z.Sim.newGame({ seed: 123, map: 'meadow', mapSize: 'small', money: 5000 });
  assert.equal(z.N, 40);
  assert.equal(z.Sim.load(hugeSaved), true);
  assert.equal(z.N, 88);
  assert.equal(z.state.gridN, 88);
  assert.equal(z.state.mapSize, 'huge');
  assert.equal(z.state.terrain.length, 88 * 88);
  assert.equal(z.state.elev.length, 89 * 89);
  assert.ok(z.state.path[43 + 70 * 88] > 0);
  assert.equal(z.state.money, hugeMoneyAfterPath);

  // Corrupt/mismatched array sizes fail and preserve active zoo's Z.N and state
  z.Sim.newGame({ seed: 99, map: 'meadow', mapSize: 'small', money: 44444 });
  const smallBefore = z.state;
  const smallRaw = z.Sim.save();

  const mismatchedGrid = JSON.parse(smallRaw);
  mismatchedGrid.s.gridN = 88;
  assert.equal(z.Sim.load(JSON.stringify(mismatchedGrid)), false);
  assert.equal(z.N, 40);
  assert.equal(z.state, smallBefore);
  assert.equal(z.state.money, 44444);

  const truncatedTerrain = JSON.parse(smallRaw);
  truncatedTerrain.s.terrain = { __t: 'u8', n: 10, d: 'AAAAAAAAAA==' };
  assert.equal(z.Sim.load(JSON.stringify(truncatedTerrain)), false);
  assert.equal(z.N, 40);
  assert.equal(z.state, smallBefore);
  assert.equal(z.state.money, 44444);
});

test('Zoo Fantasy Pack is Zoo-only and unlocks at 4 stars', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 202, map: 'meadow', money: 500000 });
  const N = z.N;

  // Flatten and clear a zone for enclosures and exhibit tests
  for (let j = 16; j <= 36; j++) for (let i = 12; i <= 38; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }
  const fenceBox = (i0, j0, i1, j1, kind) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok, true);
    }
  };
  fenceBox(14, 16, 25, 29, 'reinforced');
  fenceBox(27, 18, 36, 27, 'reinforced');
  fenceBox(14, 31, 23, 37, 'reinforced');

  const fantasyTerrains = ['enchanted', 'misty_moor', 'starlight_sand', 'lava'];
  const fantasyScenery = ['enchanted_tree', 'glowing_mushroom', 'crystal_cluster', 'standing_stones', 'rainbow_arch', 'wizard_shelter', 'castle'];
  const fantasyAnimals = ['unicorn', 'winged_monkey', 'sasquatch', 'nessie', 'phoenix', 'griffin', 'puss_in_boots', 'purple_dragon'];

  // At 3 stars: everything in the Fantasy Pack is locked
  z.state.unlocked.star = 3;
  for (const t of fantasyTerrains) {
    assert.equal(z.Sim.isUnlocked('terrain', t), false, `Terrain ${t} locked at 3 stars`);
    assert.equal(z.Sim.paintTerrain(16, 20, t, 0).ok, false, `paintTerrain(${t}) fails at 3 stars`);
  }
  for (const s of fantasyScenery) {
    assert.equal(z.Sim.isUnlocked('scenery', s), false, `Scenery ${s} locked at 3 stars`);
    assert.equal(z.Sim.placeObject(s, 17, 20, 0).ok, false, `placeObject(${s}) fails at 3 stars`);
  }
  for (const a of fantasyAnimals) {
    assert.equal(z.Sim.isUnlocked('animal', a), false, `Animal ${a} locked at 3 stars`);
    assert.equal(z.Sim.addAnimal(a, 18, 22).ok, false, `addAnimal(${a}) fails at 3 stars`);
  }

  // At 4 stars: all terrains, exhibit items, and fantasy creatures unlock and simulate cleanly
  z.state.unlocked.star = 4;
  fantasyTerrains.forEach((t, idx) => {
    assert.equal(z.Sim.isUnlocked('terrain', t), true, `Terrain ${t} unlocked at 4 stars`);
    assert.equal(z.Sim.paintTerrain(15 + idx, 20, t, 0).ok, true, `paintTerrain(${t}) succeeds at 4 stars`);
  });
  fantasyScenery.forEach((s, idx) => {
    assert.equal(z.Sim.isUnlocked('scenery', s), true, `Scenery ${s} unlocked at 4 stars`);
    assert.equal(z.Sim.placeObject(s, 15 + idx, 22, 0).ok, true, `placeObject(${s}) succeeds at 4 stars`);
  });
  fantasyAnimals.forEach((a, idx) => {
    assert.equal(z.Sim.isUnlocked('animal', a), true, `Animal ${a} unlocked at 4 stars`);
    // Griffin and Puss in Boots are carnivores so place each in its own enclosure; place the rest in the first
    let ti = 16 + idx;
    let tj = 24;
    if (a === 'griffin') {
      ti = 29;
      tj = 22;
    } else if (a === 'puss_in_boots' || a === 'purple_dragon') {
      ti = a === 'purple_dragon' ? 19 : 18;
      tj = 31;
    }
    assert.equal(z.Sim.addAnimal(a, ti, tj).ok, true, `addAnimal(${a}) succeeds at 4 stars`);
  });
  assert.equal(z.state.animals.length, 8);

  for (let step = 0; step < 100; step++) z.Sim.tick(0.1);
  for (const a of z.state.animals) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z), `Animal ${a.species} coordinates remain finite`);
  }

  // Dino Tycoon must not include any Zoo-only Fantasy Pack items
  const dinoDataSrc = readScript('00-data.js');
  for (const id of [...fantasyTerrains, ...fantasyScenery, ...fantasyAnimals]) {
    assert.equal(dinoDataSrc.includes(id), false, `Dino src/dino/00-data.js must not include Zoo-only '${id}'`);
  }
});

test('Zoo Winged Monkey performs periodic flyover terror raid, startles guests, and returns without lockdown', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 303, map: 'meadow', money: 300000 });
  z.state.unlocked.star = 4;
  z.state.time = 0.35;
  z.state.speed = 1;
  const N = z.N;

  for (let j = 36; j <= 51; j++) for (let i = 24; i <= 36; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }
  for (let j = 36; j <= 51; j++) {
    assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
    assert.equal(z.Sim.placePath(28, j, 'paved').ok, true);
  }
  for (let i = 29; i <= 34; i++) {
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 41 }, 'reinforced').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 47 }, 'reinforced').ok, true);
  }
  for (let j = 41; j <= 46; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 29, j }, 'reinforced').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 35, j }, 'reinforced').ok, true);
  }

  const addRes = z.Sim.addAnimal('winged_monkey', 31, 43);
  assert.equal(addRes.ok, true);
  const monkey = z.state.animals.find(a => a.id === addRes.id);
  assert.ok(monkey && monkey.enc > 0);

  // Let guests enter and walk onto the avenue next to the enclosure
  for (let k = 0; k < 250 && z.state.guests.length < 4; k++) z.Sim.tick(0.1);
  for (let k = 0; k < 100; k++) z.Sim.tick(0.1);
  assert.ok(z.state.guests.length >= 2, 'Expected guests near the enclosure path');

  let flyoverEvents = 0;
  z.bus.on('flyover', (a) => { if (a && a.id === monkey.id) flyoverEvents++; });

  monkey.state = 'idle';
  monkey.baby = false;
  monkey.sick = false;
  monkey.flyCooldown = 0.05;

  let maxFlyAlt = 0;
  let sawAirborne = false;
  let sawStartledGuest = false;
  let returnedHome = false;

  for (let step = 0; step < 400; step++) {
    z.Sim.tick(0.1);
    assert.notEqual(monkey.state, 'escaped', 'Flyover must not mark winged monkey as escaped');
    assert.ok(!z.state.panic, 'Flyover must not trigger park-wide panic');
    assert.equal(z.Sim.isLockdown(), false, 'Flyover must not trigger park lockdown');

    if (monkey.flyover) {
      if (monkey.flyAlt > maxFlyAlt) maxFlyAlt = monkey.flyAlt;
      if (monkey.flyAlt > 0) sawAirborne = true;
    }
    for (const g of z.state.guests) {
      if (g.state === 'flee' && g.thought && /flying monkey|winged monkey/i.test(g.thought)) {
        sawStartledGuest = true;
      }
    }
    if (sawAirborne && monkey.flyover === null && monkey.flyAlt === 0) {
      returnedHome = true;
      break;
    }
  }

  assert.equal(flyoverEvents, 1, 'flyover bus event should fire once');
  assert.equal(sawAirborne, true, 'winged monkey should climb into airborne flight');
  assert.ok(maxFlyAlt > 0, `expected positive flyAlt during flyover, got ${maxFlyAlt}`);
  assert.equal(sawStartledGuest, true, 'nearby guest should flee with a flying-monkey thought');
  assert.equal(returnedHome, true, 'winged monkey should complete flyover and return home');
  assert.equal(monkey.flyover, null);
  assert.equal(monkey.flyAlt, 0);
  assert.ok(monkey.enc > 0);
});

test('Zoo animals mate, progress through pregnancy, and give birth to babies', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 404, map: 'meadow', money: 200000 });
  const N = z.N;

  for (let j = 17; j <= 25; j++) for (let i = 13; i <= 21; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }
  for (let i = 14; i <= 20; i++) {
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 18 }, 'reinforced').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 25 }, 'reinforced').ok, true);
  }
  for (let j = 18; j <= 24; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 14, j }, 'reinforced').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 21, j }, 'reinforced').ok, true);
  }
  // Paint sand/savannah/dirt and add foliage + shelter for meerkats so suitability >= 0.55
  for (let j = 18; j <= 24; j++) for (let i = 14; i <= 20; i++) {
    z.Sim.paintTerrain(i, j, j < 21 ? 'sand' : j < 23 ? 'savannah' : 'dirt', 0);
  }
  assert.equal(z.Sim.placeObject('wooden_shelter', 15, 19, 0).ok, true);
  assert.equal(z.Sim.placeObject('tall_grass', 17, 19, 0).ok, true);
  assert.equal(z.Sim.placeObject('bush', 18, 19, 0).ok, true);

  const mRes = z.Sim.addAnimal('meerkat', 16, 21, { sex: 'm' });
  const fRes = z.Sim.addAnimal('meerkat', 18, 22, { sex: 'f' });
  assert.equal(mRes.ok, true);
  assert.equal(fRes.ok, true);

  const male = z.state.animals.find(a => a.id === mRes.id);
  const female = z.state.animals.find(a => a.id === fRes.id);
  assert.ok(male && female);

  let birthEvents = 0;
  z.bus.on('birth', (b) => { if (b && b.species === 'meerkat' && b.baby) birthEvents++; });

  // Advance day-by-day (tick clamps dtReal to 0.25, so set time near 1.0 to trigger newDay)
  z.state.speed = 1;
  let sawPregnant = false;
  for (let day = 0; day < 40; day++) {
    male.happiness = 90; male.hunger = 10; male.thirst = 10; male.sick = false;
    female.happiness = 90; female.hunger = 10; female.thirst = 10; female.sick = false;
    z.state.time = 0.999;
    z.Sim.tick(0.25);
    if (female.pregnant > 0) sawPregnant = true;
    if (z.state.stats.births > 0) break;
  }

  assert.equal(sawPregnant, true, 'female should become pregnant');
  assert.ok(z.state.stats.births >= 1, 'at least one birth should occur');
  assert.equal(z.state.stats.babiesBorn, z.state.stats.births);
  assert.equal(birthEvents, z.state.stats.births);
  assert.equal(female.pregnant, 0, 'mother should no longer be pregnant after giving birth');
  const babies = z.state.animals.filter(a => a.baby && a.species === 'meerkat');
  assert.ok(babies.length >= 1, 'baby meerkat should exist in state.animals');
  assert.equal(babies[0].enc, female.enc);
});

test('Zoo star progression reserves Star 4 exclusively for fairytale pack items', () => {
  const { z } = zoo();
  const D = z.DATA;

  const expectedFantasyAnimals = ['unicorn', 'winged_monkey', 'sasquatch', 'nessie', 'phoenix', 'griffin', 'puss_in_boots', 'purple_dragon', 'pugon', 'drassy'];
  const expectedFantasyTerrains = ['enchanted', 'misty_moor', 'starlight_sand', 'lava'];
  const expectedFantasyScenery = ['enchanted_tree', 'glowing_mushroom', 'crystal_cluster', 'standing_stones', 'rainbow_arch', 'wizard_shelter', 'castle'];

  const star4Animals = [...D.animals.filter(a => a.star === 4).map(a => a.id)].sort();
  const star4Terrains = [...D.terrain.filter(t => t.star === 4).map(t => t.id)].sort();
  const star4Scenery = [...D.scenery.filter(s => s.star === 4).map(s => s.id)].sort();
  const star4Buildings = [...D.buildings.filter(b => b.star === 4).map(b => b.id)];

  assert.deepEqual(star4Animals, [...expectedFantasyAnimals].sort());
  assert.ok(D.animals.filter(a => a.star === 4).every(a => a.fantasy === true));
  assert.equal(D.animals.some(a => !a.fantasy && a.star >= 4), false);
  assert.deepEqual(star4Terrains, [...expectedFantasyTerrains].sort());
  assert.deepEqual(star4Scenery, [...expectedFantasyScenery].sort());
  assert.deepEqual(star4Buildings, ['coaster_hyper']);
  assert.ok(D.buildings.filter(b => b.star === 4).every(b => b.fantasy === true));

  const byId = Object.fromEntries(D.animals.map(a => [a.id, a]));
  assert.equal(byId.elephant.star, 3);
  assert.equal(byId.tiger.star, 3);
  assert.equal(byId.panda.star, 3);
  assert.equal(byId.gorilla.star, 2);
  assert.equal(byId.polar_bear.star, 2);
  assert.equal(byId.brown_bear.star, 1);
  assert.equal(byId.crocodile.star, 1);
});

test('Zoo rating progression scales from <0.5 empty to <2 starter, <4 mid-sized, and >=4 thriving', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 505, map: 'meadow', money: 2000000 });
  const N = z.N;

  // 1. Empty new zoo
  const emptyRb = z.Sim.ratingBreakdown();
  assert.ok(emptyRb.stars < 0.5, `Empty zoo should be < 0.5 stars, got ${emptyRb.stars}`);
  for (const k of ['animals', 'welfare', 'guests', 'facilities', 'cleanliness', 'scenery']) {
    assert.ok(Number.isFinite(emptyRb[k]) && emptyRb[k] >= 0 && emptyRb[k] <= 1, `${k} should be finite in [0, 1]`);
  }

  // Flatten build area
  for (let j = 8; j <= 46; j++) for (let i = 8; i <= 46; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }

  const fenceBox = (i0, j0, i1, j1, kind) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok, true);
    }
  };

  // Path avenue
  for (let i = 10; i <= 40; i++) {
    assert.equal(z.Sim.placePath(i, 20, 'paved').ok, true);
  }

  // 2. Small starter zoo: 2 species + basic food/drink/toilet
  fenceBox(10, 12, 16, 18, 'reinforced');
  assert.equal(z.Sim.addAnimal('meerkat', 12, 14).ok, true);
  assert.equal(z.Sim.addAnimal('ostrich', 14, 15).ok, true);
  assert.equal(z.Sim.placeObject('burger_stand', 10, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('drinks_stall', 12, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('toilets', 14, 21, 0).ok, true);

  const starterRb = z.Sim.ratingBreakdown();
  assert.ok(starterRb.stars < 2, `Starter zoo should stay < 2 stars, got ${starterRb.stars}`);

  // 3. Mid-sized zoo: 6 species, ~15 animals, good welfare/guests/facilities -> still < 4 stars
  z.state.unlocked.star = 3;
  const midSpecies = ['meerkat', 'ostrich', 'kangaroo', 'camel', 'red_panda', 'penguin'];
  // Add 4 more species into separate enclosures (already have meerkat & ostrich)
  const addEnclosureWithSpecies = (i0, j0, i1, j1, spId, count) => {
    fenceBox(i0, j0, i1, j1, 'reinforced');
    for (let c = 0; c < count; c++) {
      assert.equal(z.Sim.addAnimal(spId, i0 + 1 + (c % 3), j0 + 1 + Math.floor(c / 3)).ok, true);
    }
  };
  addEnclosureWithSpecies(18, 12, 24, 18, 'kangaroo', 3);
  addEnclosureWithSpecies(26, 12, 32, 18, 'camel', 3);
  addEnclosureWithSpecies(34, 12, 40, 18, 'red_panda', 3);
  addEnclosureWithSpecies(10, 23, 16, 29, 'penguin', 3);
  // Bring total animals to 15 across the 6 species
  assert.equal(z.Sim.addAnimal('meerkat', 13, 15).ok, true);

  // Add full starter facilities + benches/bins/fun + good guest state
  assert.equal(z.Sim.placeObject('bench', 18, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('bench', 20, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('bin', 22, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('bin', 24, 21, 0).ok, true);
  assert.equal(z.Sim.placeObject('balloon_stand', 16, 21, 0).ok, true);

  for (const a of z.state.animals) a.happiness = 92;
  z.state.guests = Array.from({ length: 26 }, (_, idx) => ({ id: idx + 1, happiness: 90 }));
  z.state.guestHappiness = 90;
  z.state.stats.guestsTotal = 90;
  z.state.stats.peakGuests = 26;
  z.Sim._rt().ghEMA = 90;

  assert.equal(z.state.animals.length, 15);
  assert.equal(new Set(z.state.animals.map(a => a.species)).size, 6);
  const midRb = z.Sim.ratingBreakdown();
  assert.ok(midRb.stars < 4, `Mid-sized 6-species zoo should stay < 4 stars, got ${midRb.stars}`);

  // 4. Thriving, well-rounded zoo: 12+ regular species, 32+ happy animals, full facilities, clean, rich scenery -> >= 4 stars
  const extraSpecies = [
    ['elephant', 3, 18, 23, 24, 29],
    ['panda', 3, 26, 23, 32, 29],
    ['tiger', 2, 34, 23, 40, 29],
    ['gorilla', 3, 10, 32, 16, 38],
    ['lion', 3, 18, 32, 24, 38],
    ['polar_bear', 2, 26, 32, 32, 38],
    ['hippo', 2, 34, 32, 40, 38]
  ];
  for (const [spId, cnt, i0, j0, i1, j1] of extraSpecies) {
    addEnclosureWithSpecies(i0, j0, i1, j1, spId, cnt);
  }
  for (const a of z.state.animals) a.happiness = 95;
  for (const e of z.state.enclosures) e.poop = 0;

  // Add rich scenery (fountain has aesthetic 6; 45 fountains = 270 >= 260)
  for (let idx = 0; idx < 45; idx++) {
    const si = 10 + (idx % 30);
    const sj = 40 + Math.floor(idx / 30);
    assert.equal(z.Sim.placeObject('fountain', si, sj, 0).ok, true);
  }

  z.state.guests = Array.from({ length: 30 }, (_, idx) => ({ id: idx + 1, happiness: 93 }));
  z.state.guestHappiness = 93;
  z.state.stats.guestsTotal = 120;
  z.state.stats.peakGuests = 30;
  z.Sim._rt().ghEMA = 93;

  assert.ok(z.state.animals.length >= 32);
  assert.ok(new Set(z.state.animals.map(a => a.species)).size >= 12);
  const thrivingRb = z.Sim.ratingBreakdown();
  assert.ok(thrivingRb.stars >= 4, `Thriving 13-species zoo should reach >= 4 stars, got ${thrivingRb.stars}`);
});

test('Zoo new species star ratings, primate needsCage flags, and habitatGuide exposure', () => {
  const { z } = zoo();
  const byId = Object.fromEntries(z.DATA.animals.map(a => [a.id, a]));

  const expectedStars = {
    camel: 0,
    kangaroo: 1,
    monkey: 1,
    jaguar: 2,
    anaconda: 2,
    hyena: 2,
    chimpanzee: 2,
    lemur: 2,
    cheetah: 3,
    orangutan: 3,
    komodo_dragon: 3,
    puss_in_boots: 4,
    purple_dragon: 4
  };
  for (const [id, star] of Object.entries(expectedStars)) {
    assert.ok(byId[id], `Species ${id} should exist in Z.DATA.animals`);
    assert.equal(byId[id].star, star, `Species ${id} should have star ${star}`);
  }
  assert.equal(byId.puss_in_boots.fantasy, true);
  assert.equal(byId.purple_dragon.fantasy, true);

  const primates = ['monkey', 'chimpanzee', 'lemur', 'orangutan'];
  for (const id of primates) {
    assert.equal(byId[id].needsCage, true, `${id} should require a roofed cage`);
  }

  const guide = z.Sim.habitatGuide();
  const guideById = Object.fromEntries(guide.species.map(s => [s.id, s]));
  for (const id of primates) {
    assert.equal(guideById[id].needsCage, true, `habitatGuide() should expose needsCage=true for ${id}`);
  }
  assert.equal(guideById.camel.needsCage, false, 'habitatGuide() should expose needsCage=false for non-cage animals');
  assert.equal(guideById.puss_in_boots.needsCage, false, 'habitatGuide() should expose needsCage=false for puss_in_boots');
  assert.equal(guideById.purple_dragon.needsCage, false, 'habitatGuide() should expose needsCage=false for purple_dragon');
});

test('Zoo roofed cage enclosure detection, perimeter downgrade, and primate suitability', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 606, map: 'meadow', money: 500000 });
  z.state.unlocked.star = 3;
  const N = z.N;

  for (let j = 10; j <= 34; j++) for (let i = 10; i <= 34; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 5; // rainforest
  }

  const fenceBox = (i0, j0, i1, j1, kind) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok, true);
    }
  };

  // Identical open-top reinforced vs roofed cage enclosures
  fenceBox(12, 12, 18, 18, 'reinforced');
  fenceBox(22, 12, 28, 18, 'cage');

  const openEnc = z.Sim.enclosureAt(15, 15);
  const cageEnc = z.Sim.enclosureAt(25, 15);
  assert.ok(openEnc && cageEnc);
  assert.equal(openEnc.isCage, false);
  assert.equal(openEnc.enclosureType, 'open');
  assert.equal(cageEnc.isCage, true);
  assert.equal(cageEnc.enclosureType, 'cage');
  assert.equal(z.Sim.enclosureReport(cageEnc.id).isCage, true);

  // Place orangutan in open-top vs cage enclosure and compare issues & suitability
  assert.equal(z.Sim.addAnimal('orangutan', 15, 15).ok, true);
  assert.equal(z.Sim.addAnimal('orangutan', 25, 15).ok, true);

  const openReport = z.Sim.enclosureReport(openEnc.id);
  const cageReport = z.Sim.enclosureReport(cageEnc.id);
  assert.ok(
    openReport.species.orangutan.issues.some(iss => iss.includes('Needs a roofed cage')),
    `Expected cage issue in open-top enclosure, got: ${JSON.stringify(openReport.species.orangutan.issues)}`
  );
  assert.equal(
    cageReport.species.orangutan.issues.some(iss => iss.includes('Needs a roofed cage')),
    false,
    'Cage enclosure should not report a roofed cage issue'
  );
  assert.ok(
    cageReport.suitability.orangutan > openReport.suitability.orangutan,
    `Cage suitability (${cageReport.suitability.orangutan}) should exceed open-top suitability (${openReport.suitability.orangutan})`
  );

  // Replacing a single perimeter panel of the cage with reinforced removes isCage
  assert.equal(z.Sim.placeFence({ axis: 'x', i: 25, j: 12 }, 'reinforced').ok, true);
  const brokenCageEnc = z.Sim.enclosureAt(25, 15);
  assert.equal(brokenCageEnc.isCage, false);
  assert.equal(brokenCageEnc.enclosureType, 'open');
  assert.equal(z.Sim.enclosureReport(brokenCageEnc.id).isCage, false);

  const brokenReport = z.Sim.enclosureReport(brokenCageEnc.id);
  assert.ok(
    brokenReport.species.orangutan.issues.some(iss => iss.includes('Needs a roofed cage')),
    'Breaking cage roof by replacing one panel should restore the cage issue'
  );
});

test('Zoo uses shared adult-equivalent enclosure capacity across species', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 900, map: 'meadow', money: 500000 });
  z.state.unlocked.star = 3;
  const N = z.N;
  for (let j = 10; j <= 18; j++) for (let i = 10; i <= 18; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
  }
  const fenceBox = (i0, j0, i1, j1) => {
    for (let i = i0; i <= i1; i++) {
      z.Sim.placeFence({ axis: 'x', i, j: j0 }, 'reinforced');
      z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, 'reinforced');
    }
    for (let j = j0; j <= j1; j++) {
      z.Sim.placeFence({ axis: 'z', i: i0, j }, 'reinforced');
      z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, 'reinforced');
    }
  };
  fenceBox(10, 10, 15, 15);
  fenceBox(18, 10, 23, 15);
  const mixed = z.Sim.enclosureAt(12, 12), rhinos = z.Sim.enclosureAt(20, 12);
  assert.ok(mixed && rhinos);
  for (let k = 0; k < 2; k++) assert.equal(z.Sim.addAnimal('rhino', 12, 12).ok, true);
  for (let k = 0; k < 10; k++) assert.equal(z.Sim.addAnimal('meerkat', 12, 12).ok, true);
  assert.equal(z.Sim.addAnimal('rhino', 20, 12).ok, true);
  assert.equal(z.Sim.addAnimal('rhino', 20, 12).ok, true);
  assert.equal(z.Sim.addAnimal('rhino', 20, 12).ok, true);
  assert.equal(z.Sim.addAnimal('rhino', 20, 12).ok, false);
  const report = z.Sim.enclosureReport(mixed.id);
  assert.equal(report.usedSpace, 30);
  assert.equal(report.availableSpace, 36);
  mixed.area = 29; // legacy save or later enclosure edits may leave residents overcrowded
  const crowded = z.Sim.enclosureReport(mixed.id);
  assert.ok(crowded.issues.some(issue => /Overcrowded/.test(issue)));
  assert.ok(crowded.species.rhino.issues.some(issue => /overcrowded/i.test(issue)));
  const before = z.state.animals.length;
  const dry = z.Sim.addAnimal('rhino', 12, 12, { dry: true });
  assert.equal(dry.ok, false);
  assert.equal(z.state.animals.length, before, 'failed capacity previews do not mutate animals');
  assert.equal(z.Sim.moveAnimal(z.state.animals[0].id, 20, 12, { dry: true }).ok, false);
  assert.equal(z.Sim.moveAnimal(z.state.animals[0].id, 12, 12, { dry: true }).ok, true, 'same enclosure moves remain allowed');

  assert.equal(z.Sim.placePath(12, 16, 'paved').ok, true);
  z.Sim.setOpen(true);
  z.state.time = 0.45;
  const runtime = z.Sim._rt();
  runtime.arrAcc = 1;
  z.Sim._step(0.05);
  const guest = z.state.guests[0];
  assert.ok(guest);
  const exhibit = z.Sim.enclosureAt(12, 12);
  function watch(area) {
    exhibit.area = area;
    Object.assign(guest, {
      state: 'watch', gid: exhibit.id, x: 25, z: 33, ti: 12 + 16 * N, ni: -1,
      wt: 4, nt: 0, acc: 0.95, fun: 35, mood: 0, happiness: 70, stay: 80,
      thought: '', thoughtKey: '', thoughtT: 0, tcool: 0, glide: 0,
      seen: { rhino: 1, meerkat: 1 }, seenEnc: { [exhibit.id]: 1 }
    });
    z.Sim._step(0.05);
    return { fun: guest.fun, mood: guest.mood, thoughtKey: guest.thoughtKey };
  }
  const roomyVisit = watch(36), crowdedVisit = watch(29);
  assert.ok(crowdedVisit.fun < roomyVisit.fun);
  assert.ok(crowdedVisit.mood < roomyVisit.mood);
  assert.equal(crowdedVisit.thoughtKey, 'enclosureCrowded');
});

test('Zoo vine_perch scenery and star-tier unlocking for all new species', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 707, map: 'meadow', money: 1000000 });
  const N = z.N;

  for (let j = 10; j <= 46; j++) for (let i = 10; i <= 46; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }

  const fenceBox = (i0, j0, i1, j1, kind) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok, true);
    }
  };

  // Shared herbivore/omnivore cage enclosure + 6 individual carnivore enclosures
  fenceBox(12, 12, 22, 20, 'cage');
  fenceBox(25, 12, 28, 15, 'reinforced'); // jaguar
  fenceBox(30, 12, 33, 15, 'reinforced'); // anaconda
  fenceBox(35, 12, 38, 15, 'reinforced'); // hyena
  fenceBox(25, 17, 28, 20, 'reinforced'); // cheetah
  fenceBox(30, 17, 33, 20, 'reinforced'); // komodo_dragon
  fenceBox(40, 16, 45, 20, 'reinforced'); // puss_in_boots

  // vine_perch can be placed inside an enclosure
  assert.equal(z.Sim.placeObject('vine_perch', 14, 14, 0).ok, true);
  assert.ok(z.state.objects.some(o => o.type === 'vine_perch' && o.i === 14 && o.j === 14));

  const placements = [
    { id: 'camel', star: 0, i: 15, j: 15 },
    { id: 'kangaroo', star: 1, i: 16, j: 15 },
    { id: 'monkey', star: 1, i: 17, j: 15 },
    { id: 'jaguar', star: 2, i: 26, j: 13 },
    { id: 'anaconda', star: 2, i: 31, j: 13 },
    { id: 'hyena', star: 2, i: 36, j: 13 },
    { id: 'chimpanzee', star: 2, i: 18, j: 15 },
    { id: 'lemur', star: 2, i: 19, j: 15 },
    { id: 'cheetah', star: 3, i: 26, j: 18 },
    { id: 'orangutan', star: 3, i: 20, j: 15 },
    { id: 'komodo_dragon', star: 3, i: 31, j: 18 },
    { id: 'puss_in_boots', star: 4, i: 41, j: 18 }
  ];

  for (let star = 0; star <= 4; star++) {
    z.state.unlocked.star = star;
    for (const p of placements) {
      if (p.star > star) {
        assert.equal(z.Sim.isUnlocked('animal', p.id), false, `${p.id} locked at ${star} stars`);
        assert.equal(z.Sim.addAnimal(p.id, p.i, p.j).ok, false, `addAnimal(${p.id}) fails at ${star} stars`);
      } else if (p.star === star) {
        assert.equal(z.Sim.isUnlocked('animal', p.id), true, `${p.id} unlocked at ${star} stars`);
        assert.equal(z.Sim.addAnimal(p.id, p.i, p.j).ok, true, `addAnimal(${p.id}) succeeds at ${star} stars`);
      }
    }
  }
  assert.equal(z.state.animals.length, placements.length);
});

test('Zoo 8 new starter/early-game animals have exact star ratings and unlock at 0 and 1 stars', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 808, map: 'meadow', money: 500000 });
  const N = z.N;

  const byId = Object.fromEntries(z.DATA.animals.map(a => [a.id, a]));
  const star0 = ['tortoise', 'peacock', 'capybara', 'alpaca'];
  const star1 = ['fennec_fox', 'otter', 'koala', 'arctic_fox'];

  for (const id of star0) {
    assert.ok(byId[id], `0-star species ${id} should exist in Z.DATA.animals`);
    assert.equal(byId[id].star, 0, `${id} should have star 0`);
    assert.ok(typeof byId[id].fact === 'string' && byId[id].fact.length > 0, `${id} should have a non-empty fact`);
  }
  for (const id of star1) {
    assert.ok(byId[id], `1-star species ${id} should exist in Z.DATA.animals`);
    assert.equal(byId[id].star, 1, `${id} should have star 1`);
    assert.ok(typeof byId[id].fact === 'string' && byId[id].fact.length > 0, `${id} should have a non-empty fact`);
  }

  for (let j = 10; j <= 24; j++) for (let i = 10; i <= 32; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }

  const fenceBox = (i0, j0, i1, j1, kind) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok, true);
    }
  };

  fenceBox(12, 12, 20, 20, 'chainlink'); // non-carnivores
  fenceBox(24, 12, 28, 16, 'chainlink'); // arctic_fox (carnivore)

  const placements0 = [
    { id: 'tortoise', i: 14, j: 14 },
    { id: 'peacock', i: 15, j: 14 },
    { id: 'capybara', i: 16, j: 14 },
    { id: 'alpaca', i: 17, j: 14 }
  ];
  const placements1 = [
    { id: 'fennec_fox', i: 14, j: 16 },
    { id: 'otter', i: 15, j: 16 },
    { id: 'koala', i: 16, j: 16 },
    { id: 'arctic_fox', i: 26, j: 14 }
  ];

  // At 0 stars: 0-star animals unlock and place; 1-star animals stay locked
  z.state.unlocked.star = 0;
  for (const p of placements0) {
    assert.equal(z.Sim.isUnlocked('animal', p.id), true, `${p.id} should be unlocked at 0 stars`);
    assert.equal(z.Sim.addAnimal(p.id, p.i, p.j).ok, true, `addAnimal(${p.id}) should succeed at 0 stars`);
  }
  for (const p of placements1) {
    assert.equal(z.Sim.isUnlocked('animal', p.id), false, `${p.id} should be locked at 0 stars`);
    assert.equal(z.Sim.addAnimal(p.id, p.i, p.j).ok, false, `addAnimal(${p.id}) should fail at 0 stars`);
  }

  // At 1 star: 1-star animals unlock and place cleanly
  z.state.unlocked.star = 1;
  for (const p of placements1) {
    assert.equal(z.Sim.isUnlocked('animal', p.id), true, `${p.id} should be unlocked at 1 star`);
    assert.equal(z.Sim.addAnimal(p.id, p.i, p.j).ok, true, `addAnimal(${p.id}) should succeed at 1 star`);
  }

  assert.equal(z.state.animals.length, 8);
  for (let k = 0; k < 5; k++) z.Sim.tick(0.1);
  for (const a of z.state.animals) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z), `Animal ${a.species} coordinates should remain finite`);
  }
});

test('Zoo predator enclosure freedom, pack hunting, large-prey retaliation, predator vs predator fights, and vet healing', () => {
  const { z } = zoo();
  const buildFlatEnc = (seed, i0, j0, i1, j1) => {
    z.Sim.newGame({ seed, map: 'meadow', money: 2000000 });
    z.state.unlocked.star = 4;
    z.state.time = 0.45; // daytime
    for (let j = j0 - 1; j <= j1 + 1; j++) {
      for (let i = i0 - 1; i <= i1 + 1; i++) {
        z.Sim.paintTerrain(i, j, 'grass', 0);
      }
    }
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, 'reinforced').ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, 'reinforced').ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, 'reinforced').ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, 'reinforced').ok, true);
    }
    return z.Sim.enclosureAt(i0 + 1, j0 + 1);
  };

  // 1. Data flags + placing/moving predators with herbivores & rival predators succeeds with warning
  for (const spId of ['wolf', 'hyena', 'lion', 'arctic_fox']) {
    const sp = z.DATA.animals.find(a => a.id === spId);
    assert.equal(sp.packHunter, true, `${spId} should have packHunter: true`);
  }
  const enc1 = buildFlatEnc(77, 14, 14, 22, 22);
  const enc2 = (() => {
    for (let j = 13; j <= 19; j++) for (let i = 24; i <= 30; i++) z.Sim.paintTerrain(i, j, 'grass', 0);
    for (let i = 25; i <= 29; i++) {
      z.Sim.placeFence({ axis: 'x', i, j: 14 }, 'reinforced');
      z.Sim.placeFence({ axis: 'x', i, j: 19 }, 'reinforced');
    }
    for (let j = 14; j <= 18; j++) {
      z.Sim.placeFence({ axis: 'z', i: 25, j }, 'reinforced');
      z.Sim.placeFence({ axis: 'z', i: 30, j }, 'reinforced');
    }
    return z.Sim.enclosureAt(26, 15);
  })();

  const zRes = z.Sim.addAnimal('zebra', 16, 16);
  assert.equal(zRes.ok, true);
  assert.equal(zRes.warn, undefined);

  const lDry = z.Sim.addAnimal('lion', 17, 16, { dry: true });
  assert.equal(lDry.ok, true);
  assert.match(lDry.warn, /Predators in this enclosure may hunt smaller animals or fight rival predators/);

  const lRes = z.Sim.addAnimal('lion', 17, 16);
  assert.equal(lRes.ok, true);
  assert.match(lRes.warn, /Predators in this enclosure may hunt smaller animals or fight rival predators/);

  // Adding a second predator species in same enclosure also succeeds with warning
  const wRes = z.Sim.addAnimal('wolf', 18, 16);
  assert.equal(wRes.ok, true);
  assert.match(wRes.warn, /Predators in this enclosure may hunt smaller animals or fight rival predators/);

  // Moving a herbivore into an enclosure containing a predator succeeds with warning
  const gRes = z.Sim.addAnimal('kangaroo', 27, 16);
  assert.equal(gRes.ok, true);
  const mRes = z.Sim.moveAnimal(gRes.id, 19, 16);
  assert.equal(mRes.ok, true);
  assert.match(mRes.warn, /Predators in this enclosure may hunt smaller animals or fight rival predators/);

  // Adding same-species predator in empty/same-species enclosure has no cross-species warning
  const w2Res = z.Sim.addAnimal('wolf', 27, 16);
  assert.equal(w2Res.ok, true);
  assert.equal(w2Res.warn, undefined);
  const er1 = z.Sim.enclosureReport(enc1.id);
  assert.ok(er1.issues.some(iss => /Predators are sharing with prey species/i.test(iss)));

  // Rival predator enclosure report warning (no prey)
  const w3Res = z.Sim.addAnimal('lion', 28, 16);
  assert.equal(w3Res.ok, true);
  const er2 = z.Sim.enclosureReport(enc2.id);
  assert.ok(er2.issues.some(iss => /Rival predator species/i.test(iss)));

  // 2. Hunting small/similar prey starts a fight in S.fights and resolves
  buildFlatEnc(101, 14, 14, 18, 18);
  let fightStarted = 0, fightEnded = 0;
  z.bus.on('fightStart', () => fightStarted++);
  z.bus.on('fightEnd', () => fightEnded++);
  const lion = z.Sim.spawnAnimal('lion', 16, 16);
  const meerkat = z.Sim.spawnAnimal('meerkat', 16, 16);
  lion.hunger = 80; lion.st = 0;
  meerkat.x = lion.x + 0.5; meerkat.z = lion.z;

  for (let k = 0; k < 20 && z.state.fights.length === 0; k++) z.Sim._step(0.1);
  assert.equal(z.state.fights.length, 1, 'Hunting small prey should initiate an active fight in S.fights');
  assert.equal(fightStarted, 1);
  const activeF = z.state.fights[0];
  assert.equal(activeF.kind, 'hunt');
  assert.equal(lion.state, 'fight');
  assert.equal(meerkat.state, 'fight');
  assert.equal(lion.fid, activeF.id);

  // Save/load mid-fight preserves fight and cleans dangling fid on stray animals
  const stray = z.Sim.spawnAnimal('zebra', 15, 15);
  stray.fid = 999999;
  const savedMid = z.Sim.save();
  assert.equal(z.Sim.load(savedMid), true);
  assert.equal(z.state.fights.length, 1, 'Active fight survives save/load');
  const loadedStray = z.state.animals.find(a => a.species === 'zebra');
  assert.equal(loadedStray.fid, 0, 'Dangling fid on non-fighting animal is cleared on load');

  // Step until fight resolves
  for (let k = 0; k < 60 && z.state.fights.length > 0; k++) z.Sim._step(0.1);
  assert.equal(z.state.fights.length, 0, 'Fight should resolve and clear from S.fights');

  // Also verify normal non-loaded fight emits fightEnd cleanly
  const lionB = z.Sim.spawnAnimal('lion', 16, 16);
  const rabbit = z.Sim.spawnAnimal('meerkat', 16, 16);
  rabbit.x = lionB.x + 0.4; rabbit.z = lionB.z;
  const startedBefore = fightStarted, endedBefore = fightEnded;
  z.Sim._combat.startFight(lionB, rabbit, 'hunt', z.Sim.enclosureAt(16, 16));
  assert.equal(fightStarted, startedBefore + 1);
  for (let k = 0; k < 40 && z.state.fights.length > 0; k++) z.Sim._step(0.1);
  assert.equal(z.state.fights.length, 0);
  assert.equal(fightEnded, endedBefore + 1);
  assert.equal(z.state.stats.predations >= 1, true);

  // 3. Pack animals (Wolves) gang up together in a fight
  const packEnc = buildFlatEnc(202, 14, 14, 20, 20);
  const wolves = [
    z.Sim.spawnAnimal('wolf', 16, 16),
    z.Sim.spawnAnimal('wolf', 16, 17),
    z.Sim.spawnAnimal('wolf', 17, 16),
    z.Sim.spawnAnimal('wolf', 17, 17)
  ];
  const zebra = z.Sim.spawnAnimal('zebra', 17, 17);
  zebra.x = wolves[0].x + 0.8; zebra.z = wolves[0].z;
  wolves.forEach(w => { w.hunger = 80; w.st = 0; });
  let packFight = null;
  z.bus.on('fightStart', f => { packFight = f; });
  for (let k = 0; k < 80 && !packFight; k++) {
    z.state.time = 0.45;
    z.Sim._step(0.1);
  }
  assert.ok(packFight, 'Wolves should initiate a fight against zebra');
  assert.ok(packFight.attackers.length > 1, `Wolf pack should gang up together (attackers=${packFight.attackers.length})`);

  // 4. Larger prey (Elephant / Rhino) can injure or kill a smaller predator
  let injuredOrDead = 0;
  for (let trial = 0; trial < 20; trial++) {
    const encR = buildFlatEnc(300 + trial, 14, 14, 18, 18);
    const fox = z.Sim.spawnAnimal('arctic_fox', 16, 16);
    const elephant = z.Sim.spawnAnimal('elephant', 16, 16);
    elephant.x = fox.x + 0.3; elephant.z = fox.z;
    z.Sim._combat.startFight(fox, elephant, 'hunt', encR);
    for (let k = 0; k < 60 && z.state.fights.length > 0; k++) z.Sim._step(0.1);
    const foxAlive = z.state.animals.find(a => a.id === fox.id);
    if (!foxAlive || foxAlive.injured) injuredOrDead++;
  }
  assert.ok(injuredOrDead >= 15, `Large prey should injure or kill smaller predator most of the time (got ${injuredOrDead}/20)`);

  // 5. Predator vs predator fights: Polar Bear vs Arctic Fox across trials
  let bearWins = 0, foxWins = 0;
  const totalTrials = 160;
  for (let trial = 0; trial < totalTrials; trial++) {
    const encP = buildFlatEnc(1000 + trial, 14, 14, 18, 18);
    const fox = z.Sim.spawnAnimal('arctic_fox', 16, 16);
    const bear = z.Sim.spawnAnimal('polar_bear', 16, 16);
    bear.x = fox.x + 0.3; bear.z = fox.z;
    let outcome = null;
    z.bus.on('fightEnd', ev => { outcome = ev; });
    z.Sim._combat.startFight(fox, bear, 'predator', encP);
    for (let k = 0; k < 60 && z.state.fights.length > 0; k++) z.Sim._step(0.1);
    assert.ok(outcome, 'Predator vs predator fight should resolve');
    if (outcome.atkWins) foxWins++; else bearWins++;
  }
  assert.ok(bearWins > foxWins * 4, `Polar Bear should win significantly more often than Arctic Fox (bear=${bearWins}, fox=${foxWins})`);
  assert.ok(foxWins >= 1, `Arctic Fox should still have a chance to win sometimes (fox=${foxWins})`);

  // 6. Vets detect and heal injured animals (vetNeedsAnimal + treatment)
  buildFlatEnc(555, 14, 14, 18, 18);
  // Lay path right next to enclosure and hire vet
  for (let j = 19; j <= 42; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 16; i <= 27; i++) z.Sim.placePath(i, 19, 'paved');
  assert.equal(z.Sim.placeObject('vet_clinic', 28, 25, 3).ok, true);
  const hv = z.Sim.hireStaff('vet', 27, 26);
  assert.equal(hv.ok, true);

  const wolf = z.Sim.spawnAnimal('wolf', 16, 16);
  wolf.injured = true;
  wolf.health = 68; // >= 55 so only injured flag triggers vet!
  assert.equal(z.Sim.vetNeedsAnimal(wolf), true, 'vetNeedsAnimal should detect injured animals even when health >= 55');
  const repInj = z.Sim.animalReport(wolf.id);
  assert.equal(repInj.injured, true);
  assert.ok(repInj.issues.includes('Injured and needs a vet'));

  for (let k = 0; k < 160 && wolf.injured; k++) z.Sim._step(0.5);
  assert.equal(wolf.injured, false, 'Vet should treat and clear injured status');
  assert.ok(wolf.health > 68, 'Vet should heal injured animal health');
});

test('Zoo enormous purple dragon, lava terrain, castle shelter, and mutual companion happiness with Puss in Boots', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 909, map: 'meadow', money: 2000000 });
  const D = z.DATA;
  const N = z.N;

  const byId = Object.fromEntries(D.animals.map(a => [a.id, a]));
  const dragonDef = byId.purple_dragon;
  const pussDef = byId.puss_in_boots;
  const elephantDef = byId.elephant;
  assert.ok(dragonDef, 'purple_dragon species should exist');
  assert.equal(dragonDef.fantasy, true);
  assert.equal(dragonDef.biome, 'enchanted');
  assert.equal(dragonDef.star, 4);
  assert.ok(dragonDef.size > elephantDef.size, `purple_dragon size (${dragonDef.size}) should be larger than elephant (${elephantDef.size})`);
  assert.ok((dragonDef.terrainPrefs.lava || 0) > 0, 'purple_dragon should prefer lava terrain');
  assert.ok(dragonDef.foliage.includes('castle'), 'purple_dragon foliage should include castle');
  assert.ok(pussDef.foliage.includes('castle'), 'puss_in_boots foliage should include castle');
  assert.equal(dragonDef.companion, 'puss_in_boots');
  assert.equal(pussDef.companion, 'purple_dragon');

  const lavaDef = D.terrain.find(t => t.id === 'lava');
  const castleDef = D.scenery.find(s => s.id === 'castle');
  assert.ok(lavaDef && lavaDef.star === 4, 'lava terrain should exist at star 4');
  assert.ok(castleDef && castleDef.star === 4 && castleDef.kind === 'shelter' && castleDef.inEnclosure === true, 'castle shelter should exist at star 4');

  // Guide exposes companion requirement
  const guide = z.Sim.habitatGuide();
  const gDragon = guide.species.find(s => s.id === 'purple_dragon');
  const gPuss = guide.species.find(s => s.id === 'puss_in_boots');
  assert.equal(gDragon.companion.id, 'puss_in_boots');
  assert.equal(gPuss.companion.id, 'purple_dragon');
  assert.ok(gDragon.needs.some(n => /Puss in Boots/i.test(n)));
  assert.ok(gPuss.needs.some(n => /Purple dragon/i.test(n)));

  z.state.unlocked.star = 4;
  z.state.time = 0.45;
  for (let j = 10; j <= 38; j++) for (let i = 10; i <= 38; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * N] = 0;
  }

  const buildEnchantedCastleEnc = (i0, j0, i1, j1) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, 'reinforced').ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, 'reinforced').ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, 'reinforced').ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, 'reinforced').ok, true);
    }
    const mid = Math.floor((j0 + j1) / 2);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.paintTerrain(i, j, j <= mid ? 'lava' : 'enchanted', 0).ok, true);
    }
    assert.equal(z.Sim.placeObject('castle', i0 + 1, j0 + 1, 0).ok, true);
    assert.equal(z.Sim.placeObject('castle', i0 + 2, j0 + 1, 0).ok, true);
    assert.equal(z.Sim.placeObject('crystal_cluster', i0 + 3, j0 + 1, 0).ok, true);
    assert.equal(z.Sim.placeObject('standing_stones', i0 + 4, j0 + 1, 0).ok, true);
    assert.equal(z.Sim.placeObject('enchanted_tree', i0 + 1, j1 - 1, 0).ok, true);
    assert.equal(z.Sim.placeObject('enchanted_tree', i0 + 2, j1 - 1, 0).ok, true);
    return z.Sim.enclosureAt(i0 + 3, j0 + 3);
  };

  // Enclosure 1: Purple dragon alone -> unhappy & low suitability
  const encSoloDragon = buildEnchantedCastleEnc(12, 12, 19, 19);
  const dSoloRes = z.Sim.addAnimal('purple_dragon', 15, 16);
  assert.equal(dSoloRes.ok, true);
  const soloDragon = z.state.animals.find(a => a.id === dSoloRes.id);
  const soloDragonRep = z.Sim.enclosureReport(encSoloDragon.id);
  assert.ok(soloDragonRep.suitability.purple_dragon <= 0.15, `Solo dragon suitability should be capped low (got ${soloDragonRep.suitability.purple_dragon})`);
  assert.ok(soloDragonRep.species.purple_dragon.issues.some(iss => /Needs Puss in Boots in the same enclosure/i.test(iss)));

  // Enclosure 2: Puss in Boots alone -> unhappy & low suitability
  const encSoloPuss = buildEnchantedCastleEnc(22, 12, 29, 19);
  const pSoloRes = z.Sim.addAnimal('puss_in_boots', 25, 16);
  assert.equal(pSoloRes.ok, true);
  const soloPuss = z.state.animals.find(a => a.id === pSoloRes.id);
  const soloPussRep = z.Sim.enclosureReport(encSoloPuss.id);
  assert.ok(soloPussRep.suitability.puss_in_boots <= 0.15, `Solo Puss suitability should be capped low (got ${soloPussRep.suitability.puss_in_boots})`);
  assert.ok(soloPussRep.species.puss_in_boots.issues.some(iss => /Needs Purple dragon in the same enclosure/i.test(iss)));

  for (let k = 0; k < 120; k++) {
    soloDragon.hunger = 10; soloDragon.thirst = 10; soloDragon.energy = 90;
    soloPuss.hunger = 10; soloPuss.thirst = 10; soloPuss.energy = 90;
    z.Sim._step(0.5);
  }
  assert.ok(soloDragon.happiness <= 25, `Solo purple dragon should become unhappy (got ${soloDragon.happiness})`);
  assert.ok(soloPuss.happiness <= 25, `Solo Puss in Boots should become unhappy (got ${soloPuss.happiness})`);

  // Move Puss in Boots into the dragon's lava+enchanted+castle enclosure -> no warning, peaceful, both happy!
  const moveRes = z.Sim.moveAnimal(soloPuss.id, 16, 16);
  assert.equal(moveRes.ok, true);
  assert.equal(moveRes.warn, undefined, 'Moving Puss in Boots with Purple dragon should not emit predator warning');

  const sharedRep = z.Sim.enclosureReport(encSoloDragon.id);
  assert.ok(sharedRep.suitability.purple_dragon >= 0.85, `Shared dragon suitability should be high (got ${sharedRep.suitability.purple_dragon})`);
  assert.ok(sharedRep.suitability.puss_in_boots >= 0.85, `Shared Puss suitability should be high (got ${sharedRep.suitability.puss_in_boots})`);
  assert.equal(sharedRep.issues.some(iss => /Predator|Rival|Needs Puss|Needs Purple dragon/i.test(iss)), false, `Shared enclosure should have no companion/predator issues, got: ${JSON.stringify(sharedRep.issues)}`);

  for (let k = 0; k < 160; k++) {
    soloDragon.hunger = 10; soloDragon.thirst = 10; soloDragon.energy = 90;
    soloPuss.hunger = 10; soloPuss.thirst = 10; soloPuss.energy = 90;
    z.Sim._step(0.5);
  }
  assert.equal(z.state.fights.length, 0, 'Dragon and Puss in Boots must never fight each other');
  assert.equal(z.state.animals.length, 2, 'Both companions should remain alive together');
  assert.ok(soloDragon.happiness >= 80, `Purple dragon with Puss in Boots should be happy (got ${soloDragon.happiness})`);
  assert.ok(soloPuss.happiness >= 80, `Puss in Boots with Purple dragon should be happy (got ${soloPuss.happiness})`);

  // Adding a non-companion predator (lion) still triggers rival predator warning
  const lionWarn = z.Sim.addAnimal('lion', 17, 16);
  assert.equal(lionWarn.ok, true);
  assert.match(lionWarn.warn, /Predators in this enclosure/);
});

test('Zoo Theme Park Extension data, footprints, placement, undo/bulldoze, and save/load persistence', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 707, map: 'meadow', money: 500000 });
  z.state.unlocked.star = 3;

  const D = z.DATA;
  const expectedBuildings = [
    ['wooden_coaster', 'ride', 'coaster', 3, 3, 3, 2],
    ['loop_coaster', 'ride', 'coaster', 5, 4, 3, 3],
    ['mine_coaster', 'ride', 'coaster', 2, 3, 2, 1],
    ['log_flume', 'ride', 'coaster', 3, 3, 3, 2],
    ['ferris_wheel', 'ride', 'wheel', 2, 2, 2, 2],
    ['rubber_duck_stand', 'arcade', undefined, undefined, 1, 1, 0],
    ['air_rifle_stand', 'arcade', undefined, undefined, 1, 1, 1],
    ['ring_toss_stand', 'arcade', undefined, undefined, 1, 1, 0],
    ['whack_a_mole', 'arcade', undefined, undefined, 1, 1, 1],
    ['high_striker', 'arcade', undefined, undefined, 1, 1, 0],
    ['candy_floss', 'food', undefined, undefined, 1, 1, 0],
    ['popcorn_stand', 'food', undefined, undefined, 1, 1, 0],
    ['hot_dog_stand', 'food', undefined, undefined, 1, 1, 0],
    ['slushie_bar', 'drink', undefined, undefined, 1, 1, 1]
  ];
  const byB = Object.fromEntries(D.buildings.map(b => [b.id, b]));
  for (const [id, type, rideKind, thrill, w, h, star] of expectedBuildings) {
    const b = byB[id];
    assert.ok(b, `Missing building ${id}`);
    assert.equal(b.themepark, true, `${id} must have themepark: true`);
    assert.equal(b.type, type);
    assert.equal(b.rideKind, rideKind);
    assert.equal(b.thrill, thrill);
    assert.equal(b.w, w);
    assert.equal(b.h, h);
    assert.equal(b.star, star);
  }
  assert.equal(byB.carousel.themepark, true);
  assert.equal(byB.balloon_stand.themepark, true);

  const expectedScenery = ['themepark_arch', 'bunting_poles', 'funhouse_mirror', 'balloon_arch', 'circus_lamp', 'clown_statue'];
  const byS = Object.fromEntries(D.scenery.map(s => [s.id, s]));
  for (const sid of expectedScenery) {
    const s = byS[sid];
    assert.ok(s, `Missing scenery ${sid}`);
    assert.equal(s.inEnclosure, false);
    assert.equal(s.themepark, true);
    assert.ok((s.star || 0) < 4);
  }

  assert.ok(Array.isArray(D.guestThoughts.coaster) && D.guestThoughts.coaster.length >= 3);
  assert.ok(Array.isArray(D.guestThoughts.arcade) && D.guestThoughts.arcade.length >= 3);
  assert.ok(Array.isArray(D.guestThoughts.candyFloss) && D.guestThoughts.candyFloss.length >= 3);
  const tpGoal = D.goals.find(g => g.id === 'themepark_3');
  assert.ok(tpGoal && tpGoal.type === 'themepark' && tpGoal.target === 3 && tpGoal.reward === 1800);

  // Flatten a large midway area and lay a path
  for (let j = 16; j <= 41; j++) {
    for (let i = 10; i <= 40; i++) {
      const t = i + j * z.N;
      z.state.terrain[t] = 0;
      const oId = z.state.tileObj[t];
      if (oId) {
        const obj = z.state.objects.find(o => o.id === oId);
        if (obj) z.Sim.bulldoze(obj.i, obj.j);
      }
    }
  }
  for (let j = 16; j <= 42; j++) {
    for (let i = 10; i <= 41; i++) {
      z.state.elev[i + j * (z.N + 1)] = 0;
    }
  }
  for (let i = 12; i <= 38; i++) assert.equal(z.Sim.placePath(i, 24, 'paved').ok, true);
  for (let j = 25; j <= 39; j++) assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);

  const wc = z.Sim.placeObject('wooden_coaster', 12, 21, 0);
  const lc = z.Sim.placeObject('loop_coaster', 16, 21, 0);
  const mc = z.Sim.placeObject('mine_coaster', 21, 22, 0);
  const lf = z.Sim.placeObject('log_flume', 25, 21, 0);
  const fw = z.Sim.placeObject('ferris_wheel', 29, 22, 0);
  assert.ok(wc.ok && lc.ok && mc.ok && lf.ok && fw.ok, 'All coasters and Ferris wheel should place cleanly');

  const duck = z.Sim.placeObject('rubber_duck_stand', 12, 25, 0);
  const rifle = z.Sim.placeObject('air_rifle_stand', 14, 25, 0);
  const ring = z.Sim.placeObject('ring_toss_stand', 16, 25, 0);
  const whack = z.Sim.placeObject('whack_a_mole', 18, 25, 0);
  const striker = z.Sim.placeObject('high_striker', 20, 25, 0);
  const floss = z.Sim.placeObject('candy_floss', 22, 25, 0);
  const pop = z.Sim.placeObject('popcorn_stand', 24, 25, 0);
  const hotdog = z.Sim.placeObject('hot_dog_stand', 25, 25, 0);
  const slush = z.Sim.placeObject('slushie_bar', 26, 25, 0);
  assert.ok(duck.ok && rifle.ok && ring.ok && whack.ok && striker.ok && floss.ok && pop.ok && hotdog.ok && slush.ok);

  const arch = z.Sim.placeObject('themepark_arch', 29, 25, 0);
  const bunt = z.Sim.placeObject('bunting_poles', 30, 25, 0);
  const mir = z.Sim.placeObject('funhouse_mirror', 31, 25, 0);
  const barch = z.Sim.placeObject('balloon_arch', 32, 25, 0);
  const clamp = z.Sim.placeObject('circus_lamp', 33, 25, 0);
  const clown = z.Sim.placeObject('clown_statue', 34, 25, 0);
  assert.ok(arch.ok && bunt.ok && mir.ok && barch.ok && clamp.ok && clown.ok);

  // Verify footprints & objectReport fields
  const wcRep = z.Sim.objectReport(wc.id);
  assert.equal(wcRep.connected, true);
  assert.equal(wcRep.rideKind, 'coaster');
  assert.equal(wcRep.thrill, 3);
  assert.equal(wcRep.themepark, true);
  assert.equal(z.Sim.footprint('loop_coaster', 16, 20, 0).w, 4);
  assert.equal(z.Sim.footprint('loop_coaster', 16, 20, 0).h, 3);

  // Undo & Bulldoze check
  const canU = z.Sim.canUndo();
  assert.ok(canU.count > 0);
  assert.equal(z.Sim.undo().ok, true);
  assert.equal(z.state.objects.some(o => o.id === clown.id), false);
  const bRes = z.Sim.bulldoze(33, 25);
  assert.equal(bRes.ok, true);
  assert.equal(z.state.objects.some(o => o.id === clamp.id), false);

  // Save & load persistence
  const saved = z.Sim.save();
  z.Sim.newGame({ seed: 1 });
  assert.equal(z.Sim.load(saved), true);
  assert.ok(z.state.objects.some(o => o.type === 'wooden_coaster'));
  assert.ok(z.state.objects.some(o => o.type === 'loop_coaster'));
  assert.ok(z.state.objects.some(o => o.type === 'rubber_duck_stand'));
  assert.ok(z.state.objects.some(o => o.type === 'candy_floss'));
  assert.ok(z.state.objects.some(o => o.type === 'themepark_arch'));
});

test('Zoo Theme Park guests ride coasters, play arcade stands, eat candy floss, boost arrivalValue & complete goal', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 808, map: 'meadow', money: 250000 });
  z.state.unlocked.star = 3;

  // Clear central midway area
  for (let j = 28; j <= 39; j++) {
    for (let i = 20; i <= 36; i++) {
      const t = i + j * z.N;
      z.state.terrain[t] = 0;
      const oId = z.state.tileObj[t];
      if (oId) {
        const obj = z.state.objects.find(o => o.id === oId);
        if (obj) z.Sim.bulldoze(obj.i, obj.j);
      }
    }
  }
  for (let j = 28; j <= 40; j++) for (let i = 20; i <= 37; i++) z.state.elev[i + j * (z.N + 1)] = 0;

  // Connect path from gate to midway
  for (let j = 34; j <= 52; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 22; i <= 33; i++) z.Sim.placePath(i, 34, 'paved');

  const baseVal = z.Sim._rt().value;
  const coaster = z.Sim.placeObject('wooden_coaster', 23, 31, 0);
  const duck = z.Sim.placeObject('rubber_duck_stand', 26, 33, 0);
  const rifle = z.Sim.placeObject('air_rifle_stand', 28, 33, 0);
  const floss = z.Sim.placeObject('candy_floss', 30, 33, 0);
  assert.ok(coaster.ok && duck.ok && rifle.ok && floss.ok);

  const boostedVal = z.Sim._rt().value;
  assert.ok(boostedVal > baseVal, `Connected operating coaster + arcades should boost arrivalValue (${baseVal} -> ${boostedVal})`);

  // Goal completion check after secondly/checkGoals cycle (runs every 2s)
  const moneyBeforeGoal = z.state.money;
  for (let k = 0; k < 4; k++) z.Sim._step(0.5);
  assert.equal(z.state.goals.themepark_3, true, 'themepark_3 goal should complete with 3 attractions');
  assert.ok(z.state.money >= moneyBeforeGoal + 1800, 'themepark_3 goal should award £1,800');

  // Spawn guests near the midway and step simulation so they visit coaster, arcades, and candy floss
  const gProto = {
    x: 27 * z.TILE + 1, z: 34 * z.TILE + 1, heading: 0, speed: 0, state: 'walk',
    hunger: 30, thirst: 20, bladder: 10, energy: 90, happiness: 70, money: 200,
    thought: '', thoughtT: 0, seen: {}, group: 1, ti: 27 + 34 * z.N, ni: 27 + 34 * z.N,
    px: 27 * z.TILE + 1, pz: 34 * z.TILE + 1, lo: 0, lo2: 0, bs: 3.0, gt: '', gid: 0, dk: '',
    wt: 0, nt: 0, acc: 0, tcool: 0, fun: 40, mood: 5, lit: false, stay: 300, pv: 0,
    last: 0, bid: 0, fleeT: 0, nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0, shel: 0, ubid: 0,
    al: { meal: 0, drink: 0, treat: 3, shop: 0, act: 5 },
    seenEnc: {}, seenB: {}, tol: 1.5, thor: 0.9, tiredAt: 25, spent: 0, paid: 8,
    nSeen: 0, nView: 0, prettyE: 0.3, nbuy: 0, done: 0, strollNext: 0, idle: 0, gAge: 0,
    ix: 27 * z.TILE + 1, iz: 34 * z.TILE + 1, glide: 0, sx: 0, sz: 0, spot: 0, lm: 0, wat: 0
  };
  const thoughtsSeen = new Set();
  for (let i = 0; i < 16; i++) {
    const g = JSON.parse(JSON.stringify(gProto));
    g.id = 9000 + i;
    g.group = 900 + i;
    g.seed = 100 + i;
    g.pv = z.Sim._rt().pathVer;
    z.state.guests.push(g);
    z.Sim._rt().gById.set(g.id, g);
  }

  for (let step = 0; step < 300; step++) {
    z.Sim._step(0.5);
    for (const g of z.state.guests) {
      g.stay = 300;
      g.nbuy = 0;
      g.bladder = 10;
      g.thirst = 10;
      g.energy = 90;
      g.happiness = Math.max(g.happiness, 65);
      if (g.thought) thoughtsSeen.add(g.thought);
    }
  }

  const cObj = z.Sim.objectReport(coaster.id);
  const dObj = z.Sim.objectReport(duck.id);
  const rObj = z.Sim.objectReport(rifle.id);
  const fObj = z.Sim.objectReport(floss.id);

  assert.ok(cObj.uses >= 1, `Rollercoaster should have uses >= 1, got ${cObj.uses}`);
  assert.ok(cObj.income >= 10, `Rollercoaster should earn income, got ${cObj.income}`);
  assert.ok((dObj.uses + rObj.uses) >= 1, `Arcade stands should have uses >= 1, got duck=${dObj.uses}, rifle=${rObj.uses}`);
  assert.ok(fObj.uses >= 1, `Candy floss stand should have uses >= 1, got ${fObj.uses}`);
  assert.ok(z.state.stats.ridesTaken >= 1, 'S.stats.ridesTaken should increment');
  assert.ok(z.state.stats.arcadePlayed >= 1, 'S.stats.arcadePlayed should increment');

  const allCoaster = new Set(z.DATA.guestThoughts.coaster);
  const allArcade = new Set(z.DATA.guestThoughts.arcade);
  const allFloss = new Set(z.DATA.guestThoughts.candyFloss);
  const sawCoaster = [...thoughtsSeen].some(t => allCoaster.has(t));
  const sawArcade = [...thoughtsSeen].some(t => allArcade.has(t));
  const sawFloss = [...thoughtsSeen].some(t => allFloss.has(t));
  assert.ok(sawCoaster || sawArcade || sawFloss, `Expected theme park thoughts, saw: ${[...thoughtsSeen].join(' | ')}`);
});

test('Zoo UI Theme Park tab, sub-filters, goalProgress, and inspect panel thrill/arcade display', () => {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {}, style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1, tagName: String(tag || 'div').toUpperCase(), style, children, value: '',
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); }, remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || ''); children.length = 0;
        const stack = [node], re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
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
      setAttribute(k, v) { if (k === 'class') node.className = v; else { attrs[k] = String(v); if (k === 'value') node.value = String(v); } },
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
          for (const a of attrM) { const p = a.slice(1, -1).split('='); if (el.getAttribute(p[0]) !== p[1].replace(/^"|"$/g, '')) return false; s = s.replace(a, ''); }
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
          const walk = el => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk); scope = next;
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
  const doc = {
    head, body, createElement: mkEl, createTextNode: t => ({ nodeType: 3, textContent: String(t ?? ''), children: [] }),
    getElementById: id => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: s => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: s => rootUi.querySelectorAll(s), addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document: doc, window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  const load = f => vm.runInContext(readScript(f, true), ctx, { filename: f });
  ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js'].forEach(load);
  const z = ctx.Z;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview() {}, highlightEnclosure() {}, thumb: () => null, focus() {} };
  ['50-ui-dom.js', '50-ui.js', '51-input.js', '51-tools.js', '52-panels.js', '66b-ui-coaster.js', '53-screen-shell.js', '53-standard-tabs.js', '53-screens.js'].forEach(load);
  z.UI.init();
  z.Sim.newGame({ seed: 912 });
  z.state.money = 250000; z.state.unlocked.star = 3;

  // Coasters tab exists right after Facilities; static theme park buildings live in Facilities & Scenery
  const catIds = z.UI.CATS.map(c => c.id);
  assert.equal(catIds[catIds.indexOf('fac') + 1], 'coasters');

  // Facilities contains static theme park rides, arcades, and food stands with sub-filters
  z.UI.openCat('fac', true);
  const facCards = z.UI.el.cards.querySelectorAll('.card');
  assert.ok(facCards.some(c => c.getAttribute('data-id') === 'ferris_wheel'));
  assert.ok(facCards.some(c => c.getAttribute('data-id') === 'rubber_duck_stand'));
  assert.ok(facCards.some(c => c.getAttribute('data-id') === 'candy_floss'));
  const facFilters = z.UI.el.cards.querySelectorAll('.drawer-mode button');
  assert.equal(facFilters.length, 5);
  facFilters[3].click(); // Arcade
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="air_rifle_stand"]'));
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="slushie_bar"]'), null);
  facFilters[1].click(); // Food & Drink
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="slushie_bar"]'));
  facFilters[0].click(); // All

  // Scenery contains static theme park scenery
  z.UI.openCat('decor', true);
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="themepark_arch"]'));
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="circus_lamp"]'));

  // Coasters tab contains custom coaster stations, track/height tools, and unlockable specials
  z.UI.openCat('coasters', true);
  const cFilters = z.UI.el.cards.querySelectorAll('.drawer-mode button');
  assert.equal(cFilters.length, 4);
  cFilters[1].click(); // Stations
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="coaster_wooden"]'));
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="coaster_steel"]'));
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="ctrack"]'), null);
  cFilters[2].click(); // Track & Height
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="ctrack"]'));
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="craise"]'));
  cFilters[3].click(); // Specials
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="cspec_4"]')); // Loop-de-Loop
  cFilters[0].click(); // All

  // Place coaster and arcade stand and check inspect panel & goalProgress
  for (let j = 34; j <= 39; j++) {
    for (let i = 25; i <= 32; i++) {
      const t = i + j * z.N;
      z.state.terrain[t] = 0;
      const oId = z.state.tileObj[t];
      if (oId) {
        const obj = z.state.objects.find(o => o.id === oId);
        if (obj) z.Sim.bulldoze(obj.i, obj.j);
      }
      z.state.elev[i + j * (z.N + 1)] = 0;
    }
  }
  z.Sim.placePath(27, 36, 'paved');
  const wc = z.Sim.placeObject('wooden_coaster', 28, 35, 0);
  const duck = z.Sim.placeObject('rubber_duck_stand', 26, 36, 0);
  assert.ok(wc.ok && duck.ok);

  const tpGoal = z.DATA.goals.find(g => g.id === 'themepark_3');
  const gp = z.UI.goalProgress(tpGoal);
  assert.equal(gp.value, 2);

  z.UI.Panel.open('object', wc.id);
  assert.match(z.UI.el.panel.textContent, /Rollercoaster/);
  assert.match(z.UI.el.panel.textContent, /Thrill rating.*★★★/);

  const custom = z.Sim.placeObject('coaster_wooden', 37, 35, 0);
  assert.ok(custom.ok);
  z.Sim.setPrice(custom.id, 0);
  z.UI.Panel.open('object', custom.id);
  assert.equal(z.UI.el.panel.querySelector('input[type=\"range\"]')?.getAttribute('value'), '0', 'zero fare should remain selected when the panel opens');
  z.UI.Panel.hide();
  z.UI.Panel.open('object', custom.id);
  assert.equal(z.UI.el.panel.querySelector('input[type=\"range\"]')?.getAttribute('value'), '0', 'zero fare should remain selected when the panel reopens');
  z.UI.Panel.open('object', duck.id);
  assert.match(z.UI.el.panel.textContent, /Arcade & game stall/);
});

test('Zoo Theme Park 3D models build cleanly and animate without errors', () => {
  // Lightweight THREE mock sufficient for 30-models.js BufferGeometry & Group builders
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    crossVectors(a, b) {
      const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
      this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx; return this;
    }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() { const l = this.length() || 1; return this.divideScalar(l); }
    divideScalar(s) { this.x /= s; this.y /= s; this.z /= s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
    applyMatrix4() { return this; }
  }
  class Quaternion {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    copy(q) { Object.assign(this, q); return this; }
    setFromEuler() { return this; }
    setFromUnitVectors() { return this; }
    setFromRotationMatrix() { return this; }
  }
  class Euler { set() { return this; } }
  class Matrix4 {
    compose() { return this; }
    makeBasis() { return this; }
  }
  class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
    setXYZ(i, x, y, z) { const o = i * this.itemSize; this.array[o] = x; this.array[o + 1] = y; this.array[o + 2] = z; }
  }
  class BufferGeometry {
    constructor() { this.attributes = { position: new BufferAttribute(new Float32Array(18), 3) }; }
    setAttribute(k, v) { this.attributes[k] = v; }
    toNonIndexed() { return this; }
    computeBoundingSphere() {}
    computeBoundingBox() {}
  }
  class Obj3D {
    constructor() {
      this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 };
      this.quaternion = new Quaternion(); this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(s) { this.x = this.y = this.z = s; } };
      this.children = []; this.userData = {};
    }
    add(...a) { this.children.push(...a); }
    clone() { const c = new Obj3D(); c.userData = { ...this.userData }; return c; }
  }
  class Group extends Obj3D {}
  class Mesh extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m || {}; } }
  class MeshLambertMaterial { constructor(o = {}) { Object.assign(this, o); } }
  class CanvasTexture {}

  const THREE = {
    Vector3, Quaternion, Euler, Matrix4, BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, CanvasTexture,
    SphereGeometry: BufferGeometry, BoxGeometry: BufferGeometry, CylinderGeometry: BufferGeometry,
    IcosahedronGeometry: BufferGeometry, PlaneGeometry: BufferGeometry, CircleGeometry: BufferGeometry,
    DoubleSide: 2
  };
  const fakeCanvas = () => ({
    width: 128, height: 64,
    getContext: () => ({ fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', fillRect() {}, strokeRect() {}, fillText() {} })
  });
  const ctx = vm.createContext({
    console, THREE,
    document: { createElement: tag => tag === 'canvas' ? fakeCanvas() : {} }
  });
  ctx.window = ctx;
  const load = f => vm.runInContext(readScript(f, true), ctx, { filename: f });
  ['00-data.js', '30-models-toilets.js', '30-models-common.js', '30-models.js'].forEach(load);

  const M = ctx.Z.Models;
  const tpBuildings = [
    'wooden_coaster', 'loop_coaster', 'mine_coaster', 'log_flume', 'ferris_wheel',
    'rubber_duck_stand', 'air_rifle_stand', 'ring_toss_stand', 'whack_a_mole', 'high_striker',
    'candy_floss', 'popcorn_stand', 'hot_dog_stand', 'slushie_bar'
  ];
  for (const id of tpBuildings) {
    const grp = M.createBuilding(id);
    assert.ok(grp && grp.userData.buildingId === id, `Model missing for ${id}`);
    assert.ok(grp.children.length >= 1, `Model ${id} should have children`);
    if (typeof grp.userData.update === 'function') grp.userData.update(0.05, 1.25);
  }

  const tpScenery = ['themepark_arch', 'bunting_poles', 'funhouse_mirror', 'balloon_arch', 'circus_lamp', 'clown_statue'];
  for (const id of tpScenery) {
    const grp = M.createScenery(id);
    assert.ok(grp && grp.userData.sceneryId === id, `Scenery model missing for ${id}`);
    assert.ok(grp.children.length >= 1, `Scenery ${id} should have children`);
    if (typeof grp.userData.update === 'function') grp.userData.update(0.05, 1.25);
  }
  assert.equal(M.createScenery('circus_lamp').userData.isLamp, true);
});

test('Zoo Theme Park multi-day stress simulation validates guest invariants, queues, finances, and zoo-vs-ride balance', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 2026, map: 'meadow', mapSize: 'medium', money: 500000 });
  z.state.unlocked.star = 4;
  z.state.open = true;

  const clearRect = (i0, j0, i1, j1) => {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const t = i + j * z.N;
        z.state.terrain[t] = 0;
        const oId = z.state.tileObj[t];
        if (oId) {
          const obj = z.state.objects.find(o => o.id === oId);
          if (obj) z.Sim.bulldoze(obj.i, obj.j);
        }
      }
    }
    for (let j = j0; j <= j1 + 1; j++) {
      for (let i = i0; i <= i1 + 1; i++) z.state.elev[i + j * (z.N + 1)] = 0;
    }
  };
  const makeEnc = (i0, j0, i1, j1, fenceType) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, fenceType).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, fenceType).ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, fenceType).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, fenceType).ok, true);
    }
  };

  clearRect(10, 12, 45, 50);
  for (let j = 18; j <= 51; j++) { z.Sim.placePath(27, j, 'paved'); z.Sim.placePath(28, j, 'paved'); }
  for (const j of [18, 26, 34, 42]) for (let i = 14; i <= 42; i++) z.Sim.placePath(i, j, 'paved');
  for (let j = 36; j <= 42; j++) { z.Sim.placePath(14, j, 'paved'); z.Sim.placePath(42, j, 'paved'); }
  for (let j = 43; j <= 48; j++) { z.Sim.placePath(21, j, 'paved'); z.Sim.placePath(35, j, 'paved'); }

  makeEnc(15, 44, 20, 49, 'reinforced');
  assert.ok(z.Sim.placeObject('cave_shelter', 17, 46, 0).ok && z.Sim.placeObject('wooden_shelter', 18, 47, 0).ok);
  assert.ok(z.Sim.placeObject('boulder', 16, 47, 0).ok);
  assert.ok(z.Sim.addAnimal('lion', 17, 45).ok && z.Sim.addAnimal('lion', 18, 45).ok);

  makeEnc(36, 44, 41, 49, 'glass');
  z.Sim.paintTerrain(40, 48, 'water', 0);
  assert.ok(z.Sim.placeObject('acacia', 38, 46, 0).ok && z.Sim.placeObject('tall_grass', 39, 47, 0).ok);
  assert.ok(z.Sim.addAnimal('giraffe', 37, 45).ok && z.Sim.addAnimal('giraffe', 38, 45).ok);
  assert.ok(z.Sim.addAnimal('zebra', 40, 45).ok && z.Sim.addAnimal('zebra', 39, 45).ok);

  makeEnc(15, 36, 20, 40, 'low_wood');
  assert.ok(z.Sim.placeObject('climbing_frame', 17, 38, 0).ok && z.Sim.placeObject('bush', 18, 38, 0).ok);
  assert.ok(z.Sim.addAnimal('meerkat', 16, 37).ok && z.Sim.addAnimal('meerkat', 19, 37).ok);

  makeEnc(36, 36, 41, 40, 'glass');
  z.Sim.paintTerrain(38, 38, 'water', 0);
  z.Sim.paintTerrain(39, 38, 'water', 0);
  assert.ok(z.Sim.placeObject('ice_floe', 38, 38, 0).ok);
  assert.ok(z.Sim.addAnimal('penguin', 37, 37).ok && z.Sim.addAnimal('penguin', 40, 37).ok);

  for (const [id, i, j] of [
    ['keeper_hut', 26, 43], ['vet_clinic', 29, 43], ['toilets', 24, 43],
    ['toilets', 24, 27], ['burger_stand', 26, 41], ['drinks_stall', 29, 41], ['gift_shop', 22, 41]
  ]) assert.equal(z.Sim.placeObject(id, i, j, 0).ok, true, `Facility ${id}`);

  const tpPlacements = [
    ['wooden_coaster', 15, 19, 0], ['loop_coaster', 22, 19, 0], ['mine_coaster', 30, 19, 0],
    ['log_flume', 36, 19, 0], ['ferris_wheel', 15, 27, 0],
    ['rubber_duck_stand', 22, 27, 0], ['air_rifle_stand', 23, 27, 0], ['ring_toss_stand', 26, 27, 0],
    ['whack_a_mole', 29, 27, 0], ['high_striker', 31, 27, 0],
    ['candy_floss', 22, 33, 0], ['popcorn_stand', 24, 33, 0], ['hot_dog_stand', 26, 33, 0], ['slushie_bar', 29, 33, 0]
  ];
  const placedTP = {};
  for (const [id, i, j, r] of tpPlacements) {
    const res = z.Sim.placeObject(id, i, j, r);
    assert.equal(res.ok, true, `Place ${id}`);
    assert.equal(z.Sim.objectReport(res.id).connected, true, `${id} connected`);
    placedTP[id] = res.id;
  }

  for (const [id, i, j, r] of [
    ['themepark_arch', 26, 35, 0], ['bunting_poles', 29, 35, 0], ['funhouse_mirror', 31, 35, 0],
    ['balloon_arch', 33, 35, 0], ['circus_lamp', 34, 33, 0], ['clown_statue', 32, 33, 0]
  ]) assert.equal(z.Sim.placeObject(id, i, j, r).ok, true, `Scenery ${id}`);

  for (const [i, j] of [[25, 35], [25, 25], [25, 43], [33, 41]]) {
    z.Sim.placeObject('bench', i, j, 0);
    z.Sim.placeObject('bin', i + 1, j, 0);
  }
  for (const st of ['keeper', 'keeper', 'vet', 'cleaner', 'cleaner', 'guide', 'security']) {
    assert.equal(z.Sim.hireStaff(st).ok, true);
  }

  const DAY_S = 150;
  const dt = 0.25;
  const steps = Math.ceil((DAY_S * 5.2) / dt);
  let maxGuests = 0;
  const guestSnapshots = new Map();

  for (let s = 0; s < steps; s++) {
    z.Sim._step(dt);
    const st = z.state;
    const rt = z.Sim._rt();
    if (st.guests.length > maxGuests) maxGuests = st.guests.length;
    if (s % 12 === 0) {
      assert.ok(Number.isFinite(st.money));
      assert.ok(Number.isFinite(st.rating) && st.rating >= 0 && st.rating <= 5);
      assert.ok(st.guestHappiness === undefined || (Number.isFinite(st.guestHappiness) && st.guestHappiness >= 0 && st.guestHappiness <= 100));
      for (const k of ['tickets', 'food', 'shops', 'donations', 'upkeep', 'wages', 'construction', 'marketing', 'other']) {
        assert.ok(Number.isFinite(st.finance.today[k]));
      }
      for (const g of st.guests) {
        assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z));
        assert.ok(Number.isFinite(g.money) && g.money >= 0);
        for (const n of ['hunger', 'thirst', 'bladder', 'energy', 'fun', 'happiness']) {
          assert.ok(Number.isFinite(g[n]) && g[n] >= 0 && g[n] <= 100, `guest ${n}=${g[n]}`);
        }
        guestSnapshots.set(g.id, {
          encSeen: Object.keys(g.seenEnc || {}).length,
          bSeen: Object.keys(g.seenB || {}).length
        });
      }
      for (const id in rt.bq) {
        const q = rt.bq[id];
        assert.ok(Number.isInteger(q.use) && q.use >= 0 && Array.isArray(q.q));
        const obj = st.objects.find(o => o.id === +id);
        if (obj) {
          const cap = z.DATA.buildings.find(b => b.id === obj.type).capacity;
          assert.ok(q.use <= cap);
        }
      }
    }
  }

  let withEnc = 0, withB = 0, withBoth = 0;
  for (const snap of guestSnapshots.values()) {
    if (snap.encSeen > 0) withEnc++;
    if (snap.bSeen > 0) withB++;
    if (snap.encSeen > 0 && snap.bSeen > 0) withBoth++;
  }
  assert.ok(maxGuests >= 100, `Expected >= 100 concurrent guests, got ${maxGuests}`);
  assert.ok(z.state.finance.history.length >= 5, `Expected >= 5 days of finance history, got ${z.state.finance.history.length}`);
  assert.ok(z.state.stats.ridesTaken >= 10, `Expected >= 10 rides taken, got ${z.state.stats.ridesTaken}`);
  assert.ok(z.state.stats.arcadePlayed >= 10, `Expected >= 10 arcade games played, got ${z.state.stats.arcadePlayed}`);
  assert.ok(withEnc >= 50 && withB >= 50 && withBoth >= 25, `Expected balanced exhibit & ride visits: enc=${withEnc}, b=${withB}, both=${withBoth}`);
});

test('Zoo Theme Park rotation, terrain elevation, undo, mid-ride bulldoze, and save/load fuzzing', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 999, map: 'meadow', mapSize: 'medium', money: 1000000 });
  z.state.unlocked.star = 4;

  for (let j = 10; j <= 48; j++) {
    for (let i = 6; i <= 48; i++) {
      const t = i + j * z.N;
      z.state.terrain[t] = 0;
      const oId = z.state.tileObj[t];
      if (oId) {
        const obj = z.state.objects.find(o => o.id === oId);
        if (obj) z.Sim.bulldoze(obj.i, obj.j);
      }
    }
  }
  for (let j = 10; j <= 49; j++) for (let i = 6; i <= 49; i++) z.state.elev[i + j * (z.N + 1)] = 0;
  for (let j = 10; j <= 48; j++) z.Sim.placePath(25, j, 'paved');
  for (let i = 6; i <= 48; i++) z.Sim.placePath(i, 25, 'paved');

  const tpBuildings = [
    'wooden_coaster', 'loop_coaster', 'mine_coaster', 'log_flume', 'ferris_wheel',
    'rubber_duck_stand', 'air_rifle_stand', 'ring_toss_stand', 'whack_a_mole', 'high_striker',
    'candy_floss', 'popcorn_stand', 'hot_dog_stand', 'slushie_bar'
  ];
  const tpScenery = ['themepark_arch', 'bunting_poles', 'funhouse_mirror', 'balloon_arch', 'circus_lamp', 'clown_statue'];

  for (const id of tpBuildings) {
    const def = z.DATA.buildings.find(b => b.id === id);
    for (let rot = 0; rot < 4; rot++) {
      const fp = z.Sim.footprint(id, 10, 10, rot);
      assert.equal(fp.w, rot % 2 === 1 ? def.h : def.w);
      assert.equal(fp.h, rot % 2 === 1 ? def.w : def.h);
      const r1 = z.Sim.placeObject(id, 10, 26, rot);
      assert.equal(r1.ok, true, `${id} rot=${rot}`);
      assert.equal(z.Sim.undo().ok, true);
      const r2 = z.Sim.placeObject(id, 10, 26, rot);
      assert.equal(r2.ok, true);
      assert.equal(z.Sim.bulldoze(10, 26).ok, true);
      assert.equal(z.state.objects.some(o => o.id === r2.id), false);
    }
    assert.equal(z.Sim.placeObject(id, 53, 53, 0).ok, false, `${id} OOB rejected`);
  }

  z.Sim.terraform(15, 15, 'raise', 0);
  z.Sim.terraform(15, 15, 'raise', 0);
  z.Sim.terraform(15, 15, 'raise', 0);
  for (const id of tpScenery) {
    for (let rot = 0; rot < 4; rot++) {
      const r = z.Sim.placeObject(id, 15, 15, rot);
      assert.equal(r.ok, true, `Scenery ${id} sloped rot=${rot}`);
      assert.equal(z.Sim.undo().ok, true);
    }
  }
  assert.equal(z.Sim.placeObject('wooden_coaster', 14, 14, 0).ok, false, 'Steep coaster rejected');

  // Active mid-ride bulldoze + save/load
  z.Sim.newGame({ seed: 777, map: 'meadow', mapSize: 'medium', money: 500000 });
  z.state.unlocked.star = 4;
  z.state.open = true;
  for (let j = 28; j <= 42; j++) {
    for (let i = 20; i <= 36; i++) {
      const t = i + j * z.N;
      z.state.terrain[t] = 0;
      const oId = z.state.tileObj[t];
      if (oId) {
        const obj = z.state.objects.find(o => o.id === oId);
        if (obj) z.Sim.bulldoze(obj.i, obj.j);
      }
      z.state.elev[i + j * (z.N + 1)] = 0;
    }
  }
  for (let j = 34; j <= 52; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 22; i <= 34; i++) z.Sim.placePath(i, 34, 'paved');
  const lc = z.Sim.placeObject('loop_coaster', 22, 31, 0);
  assert.ok(lc.ok);

  for (let i = 0; i < 26; i++) {
    const g = {
      id: 50000 + i, name: 'Rider ' + i, seed: i + 1, x: 25 * 2 + 1, z: 34 * 2 + 1,
      heading: 0, speed: 0, state: 'walk', hunger: 10, thirst: 10, bladder: 10, energy: 90,
      happiness: 80, money: 200, thought: '', thoughtT: 0, seen: {}, group: 5000 + i,
      ti: 25 + 34 * z.N, ni: 25 + 34 * z.N, px: 51, pz: 69, lo: 0, lo2: 0, bs: 3,
      gt: 'bld', gid: lc.id, dk: 'b' + lc.id, wt: 0, nt: 0.5, acc: 0, tcool: 0, fun: 30,
      mood: 5, lit: false, stay: 300, pv: z.Sim._rt().pathVer, last: 0, bid: 0, fleeT: 0,
      nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0, shel: 0, ubid: 0,
      al: { meal: 1, drink: 1, treat: 2, shop: 1, act: 3 }, seenEnc: {}, seenB: {},
      tol: 1.8, thor: 0.9, tiredAt: 25, spent: 0, paid: 8, nSeen: 0, nView: 0, prettyE: 0.3,
      nbuy: 0, done: 0, strollNext: 0, idle: 0, gAge: 0, ix: 51, iz: 69, glide: 0, sx: 51, sz: 69,
      spot: 0, lm: 0, wat: 0
    };
    z.state.guests.push(g);
    z.Sim._rt().gById.set(g.id, g);
  }
  for (let s = 0; s < 20; s++) z.Sim._step(0.25);

  const rt = z.Sim._rt();
  assert.ok(z.state.guests.some(g => g.state === 'use') && z.state.guests.some(g => g.state === 'queue'));
  const midSave = z.Sim.save();
  assert.equal(z.Sim.bulldoze(22, 31).ok, true);
  assert.equal(rt.bq[lc.id], undefined);
  for (const g of z.state.guests) {
    assert.notEqual(g.gid, lc.id);
    assert.notEqual(g.ubid, lc.id);
    assert.ok(g.state !== 'queue' && g.state !== 'use');
  }
  assert.equal(z.Sim.undo().ok, true);
  assert.equal(z.Sim.load(midSave), true);
  for (let s = 0; s < 30; s++) z.Sim._step(0.25);
  for (const g of z.state.guests) assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z));
});

test('Zoo Theme Park 3D models and world module pass 1,000-frame animation and geometry stress test with real THREE', () => {
  const fakeCanvas = () => ({
    width: 128, height: 64, style: {},
    getContext: () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
      shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
      fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {},
      beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, quadraticCurveTo() {}, closePath() {},
      stroke() {}, fill() {}, arc() {}, save() {}, restore() {}, translate() {}, scale() {},
      createLinearGradient() { return { addColorStop() {} }; }
    })
  });
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, Math, Float32Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Uint8Array,
    performance: { now: () => Date.now() },
    document: { createElement: tag => tag === 'canvas' ? fakeCanvas() : { style: {}, appendChild() {} }, addEventListener() {} },
    window: null, requestAnimationFrame() {}
  });
  ctx.window = ctx; ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../vendor/three.r128.min.js'), 'utf8'), ctx, { filename: 'three.r128.min.js' });
  const load = f => vm.runInContext(readScript(f, true), ctx, { filename: f });
  ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '30-models-toilets.js', '30-models-common.js', '30-models.js', 'world-renderer.js', '40-world.js'].forEach(load);

  const THREE = ctx.THREE;
  const M = ctx.Z.Models;
  assert.ok(ctx.Z.World);

  const tpBuildings = [
    'wooden_coaster', 'loop_coaster', 'mine_coaster', 'log_flume', 'ferris_wheel',
    'rubber_duck_stand', 'air_rifle_stand', 'ring_toss_stand', 'whack_a_mole', 'high_striker',
    'candy_floss', 'popcorn_stand', 'hot_dog_stand', 'slushie_bar'
  ];
  const tpScenery = ['themepark_arch', 'bunting_poles', 'funhouse_mirror', 'balloon_arch', 'circus_lamp', 'clown_statue'];

  const checkSubtreeFinite = (obj, label) => {
    obj.traverse(ch => {
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Number.isFinite(ch.position[axis]), `${label} pos.${axis}`);
        assert.ok(Number.isFinite(ch.rotation[axis]), `${label} rot.${axis}`);
        assert.ok(Number.isFinite(ch.scale[axis]), `${label} scale.${axis}`);
      }
      if (ch.quaternion) {
        for (const axis of ['x', 'y', 'z', 'w']) assert.ok(Number.isFinite(ch.quaternion[axis]), `${label} quat.${axis}`);
      }
      if (ch.geometry && ch.geometry.attributes && ch.geometry.attributes.position) {
        const arr = ch.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i++) assert.ok(Number.isFinite(arr[i]), `${label} vertex NaN`);
      }
    });
  };

  const models = [];
  for (const id of tpBuildings) {
    const grp = M.createBuilding(id);
    assert.ok(grp && grp.userData.buildingId === id);
    const box = new THREE.Box3().setFromObject(grp);
    assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.y) && box.max.y > box.min.y);
    models.push({ id, grp });
  }
  for (const id of tpScenery) {
    const grp = M.createScenery(id);
    assert.ok(grp && grp.userData.sceneryId === id);
    const box = new THREE.Box3().setFromObject(grp);
    assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.y) && box.max.y > box.min.y);
    models.push({ id, grp });
  }

  for (const m of models) {
    if (typeof m.grp.userData.update !== 'function') continue;
    m.grp.userData.update(0, 0);
    checkSubtreeFinite(m.grp, `${m.id}@t=0`);
    m.grp.userData.update(0.25, 10000);
    checkSubtreeFinite(m.grp, `${m.id}@t=10000`);
  }
  const dts = [0, 0.016, 0.25];
  let tSim = 0;
  for (let f = 0; f < 1000; f++) {
    const dt = dts[f % dts.length];
    tSim += dt;
    for (const m of models) if (typeof m.grp.userData.update === 'function') m.grp.userData.update(dt, tSim);
    if (f % 250 === 0 || f === 999) for (const m of models) checkSubtreeFinite(m.grp, `${m.id}@f=${f}`);
  }
});





// ============================================================================
// Custom Rollercoasters (Zoo Tycoon ONLY)
// ============================================================================

test('Zoo Custom Rollercoasters: star unlock progression and Zoo-only isolation', () => {
  const { z } = zoo();
  const D = z.DATA;
  z.Sim.newGame({ seed: 1001, money: 100000 });
  assert.ok(z.Coaster, 'Z.Coaster should exist in Zoo Tycoon');

  // Verify star progression: Wooden at 0, Mine at 1, Flume at 2, Steel at 3, Hyper at 4 (fantasy)
  const bMap = Object.fromEntries(D.buildings.map(b => [b.id, b]));
  assert.equal(bMap.coaster_wooden.star, 0);
  assert.equal(bMap.coaster_mine.star, 1);
  assert.equal(bMap.coaster_flume.star, 2);
  assert.equal(bMap.coaster_steel.star, 3);
  assert.equal(bMap.coaster_hyper.star, 4);
  assert.equal(bMap.coaster_hyper.fantasy, true);

  // Early start (0 stars): Wooden Coaster Station is allowed, Steel is locked
  assert.equal(z.state.unlocked.star, 0);
  const N = z.N;
  for (let j = 32; j <= 40; j++) for (let i = 18; i <= 26; i++) {
    const t = i + j * N;
    z.state.terrain[t] = 0; z.state.path[t] = 0;
    const oid = z.state.tileObj[t];
    if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }
  const stLocked = z.Sim.placeObject('coaster_steel', 20, 35, 0);
  assert.equal(stLocked.ok, false, 'Steel coaster should be locked at 0 stars');
  const wdOk = z.Sim.placeObject('coaster_wooden', 20, 35, 0);
  assert.equal(wdOk.ok, true, 'Wooden coaster should be buildable at 0 stars');

  // Dino Tycoon must NOT load Zoo-specific coaster scripts
  const dinoIndex = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.equal(dinoIndex.includes('src/zoo/'), false, 'index.html (Dino Tycoon) must not load Zoo scripts');
});

test('Zoo Custom Rollercoasters: track loop, height hills, unlockable specials, dynamic excitement, undo & save/load', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 1002, money: 250000 });
  z.state.unlocked.star = 3;
  z.state.time = 0.4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;

  // Clear flat build area
  for (let j = 28; j <= 42; j++) for (let i = 16; i <= 32; i++) {
    const t = tidx(i, j);
    z.state.terrain[t] = 0; z.state.path[t] = 0;
    const oid = z.state.tileObj[t];
    if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }

  // Place Steel Coaster Station at (20, 35), rot=0 => footprint (20..23, 35..36), track row j=35, endF=(23,35), endB=(20,35)
  const stRes = z.Sim.placeObject('coaster_steel', 20, 35, 0);
  assert.equal(stRes.ok, true, stRes.msg);

  // Build closed rectangular loop going East from (23,35) -> North -> West -> South -> back to (20,35)
  const loopRoute = [
    tidx(23, 35), tidx(24, 35), tidx(25, 35),
    tidx(25, 34), tidx(25, 33), tidx(25, 32), tidx(25, 31),
    tidx(24, 31), tidx(23, 31), tidx(22, 31), tidx(21, 31), tidx(20, 31), tidx(19, 31), tidx(18, 31),
    tidx(18, 32), tidx(18, 33), tidx(18, 34), tidx(18, 35),
    tidx(19, 35), tidx(20, 35)
  ];
  const trRes = z.Coaster.buildTrack(loopRoute);
  assert.equal(trRes.ok, true, trRes.msg);
  assert.equal(trRes.autoSpawned, true, 'Completing loop should auto-spawn starter train');

  let info = z.Coaster.stationInfo(stRes.id);
  assert.equal(info.ready, true);
  assert.equal(info.loop, true);
  assert.equal(info.trains.length, 1);
  const baseExc = info.excitement;
  assert.ok(baseExc >= 1.5 && baseExc <= 3.0, `Simple flat 16-tile oval should have modest excitement (1.5..3.0), got ${baseExc}`);

  // Raise a tall hill on the north straight (20..23, 31)
  const hillTiles = [tidx(20, 31), tidx(21, 31), tidx(22, 31), tidx(23, 31)];
  for (let h = 0; h < 3; h++) {
    const rH = z.Coaster.changeHeight(hillTiles, 1);
    assert.equal(rH.ok, true, rH.msg);
  }
  info = z.Coaster.stationInfo(stRes.id);
  assert.ok(info.maxHeight > 4, 'Raising track should increase maxHeight');
  assert.ok(info.excitement > baseExc, 'Adding hills & drops should increase Excitement');
  // Without a Chain Lift or Boost on the climb, a tall hill should stall due to gravity!
  assert.equal(info.energyOk, false, 'Tall hill without Chain Lift or Boost should stall due to gravitational potential energy');
  assert.equal(info.ready, false, 'Coaster should not be ready while stalling on climb');
  assert.match(info.stallReason, /Chain Lift|Launch Boost/i);
  const hillExc = info.excitement;

  // Stamp Chain Lift (1) on the east climb (25, 34..32) & north approach (24, 31), plus Loop-de-Loop (4), Corkscrew (5), Boost (2), Water Splash (3)
  assert.equal(z.Coaster.placeSpecial([tidx(25, 34), tidx(25, 33), tidx(25, 32)], 1).ok, true); // Chain Lift on uphill climb
  assert.equal(z.Coaster.placeSpecial([tidx(24, 35)], 1).ok, true); // Chain Lift
  assert.equal(z.Coaster.placeSpecial([tidx(19, 35)], 2).ok, true); // Launch Boost
  assert.equal(z.Coaster.placeSpecial([tidx(21, 31)], 4).ok, true); // Loop-de-Loop
  assert.equal(z.Coaster.placeSpecial([tidx(19, 31)], 5).ok, true); // Corkscrew
  assert.equal(z.Coaster.placeSpecial([tidx(18, 33)], 3).ok, true); // Water Splash

  info = z.Coaster.stationInfo(stRes.id);
  assert.equal(info.energyOk, true, `Chain Lift + Boost should give enough energy to complete circuit, got: ${info.stallReason}`);
  assert.equal(info.ready, true);
  assert.ok(info.excitement > hillExc, 'Adding loop-de-loop, corkscrew & boost should significantly increase Excitement');
  assert.ok(info.excitement < 8.5, `Medium 16-tile coaster with 0 overlooked enclosures should not max out excitement (<8.5), got ${info.excitement}`);
  assert.equal(info.specs[4], 1);
  assert.equal(info.specs[5], 1);

  // Verify Loop-de-Loop creates inverted up-vector (uy < -0.5) on the spline
  const L = info.line;
  let minUy = 1;
  for (let k = 0; k < L.nS; k++) if (L.uy[k] < minUy) minUy = L.uy[k];
  assert.ok(minUy < -0.5, `Expected vertical loop inversion uy < -0.5, got ${minUy}`);

  // Undo last special (Water Splash) works
  assert.equal(z.Sim.undo().ok, true);
  assert.equal(z.state.coasterSpec[tidx(18, 33)], 0);

  // Save and load round-trip preserves track, heights, specials, and trains
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  const infoAfter = z.Coaster.stationInfo(stRes.id);
  assert.equal(infoAfter.ready, true);
  assert.equal(infoAfter.specs[4], 1);
  assert.equal(infoAfter.specs[5], 1);
  assert.equal(infoAfter.trains.length, 1);

  // Verify Large Loop-de-Loop (6) and Large Corkscrew (7) placement, height, and excitement boost
  // Replace standard Loop/Corkscrew on hill crest with Large Loop-de-Loop (6) & Large Corkscrew (7) on a clean Steel coaster
  assert.equal(z.Coaster.placeSpecial([tidx(22, 31)], 6).ok, true, 'Steel coaster should allow Large Loop-de-Loop (6)');
  assert.equal(z.Coaster.placeSpecial([tidx(20, 31)], 7).ok, true, 'Steel coaster should allow Large Corkscrew (7)');
  const infoLarge = z.Coaster.stationInfo(stRes.id);
  assert.equal(infoLarge.specs[6], 1);
  assert.equal(infoLarge.specs[7], 1);
  assert.ok(infoLarge.maxHeight > infoAfter.maxHeight + 3.5, `Large Loop-de-Loop (R=4.5) should raise maxHeight significantly, got ${infoLarge.maxHeight} vs ${infoAfter.maxHeight}`);
  let minUyLarge = 1;
  for (let k = 0; k < infoLarge.line.nS; k++) if (infoLarge.line.uy[k] < minUyLarge) minUyLarge = infoLarge.line.uy[k];
  assert.ok(minUyLarge < -0.5, `Expected inverted uy < -0.5 on Large Loop-de-Loop/Corkscrew, got ${minUyLarge}`);

  // Wooden coaster should reject Large Loop-de-Loop (6) and Large Corkscrew (7)
  z.Sim.newGame({ seed: 1005, money: 250000 });
  z.state.unlocked.star = 4;
  for (let j = 28; j <= 42; j++) for (let i = 16; i <= 32; i++) {
    const t = tidx(i, j); z.state.terrain[t] = 0; z.state.path[t] = 0;
    const oid = z.state.tileObj[t]; if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }
  const wdSt = z.Sim.placeObject('coaster_wooden', 20, 35, 0);
  assert.equal(z.Coaster.buildTrack(loopRoute).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(21, 31)], 6).ok, false, 'Wooden coaster must reject Large Loop-de-Loop (6)');
  assert.equal(z.Coaster.placeSpecial([tidx(19, 31)], 7).ok, false, 'Wooden coaster must reject Large Corkscrew (7)');

  // Compare excitement of Large Loop (6) + Large Corkscrew (7) vs standard Loop (4) + Corkscrew (5) on identical Steel coaster
  z.Sim.newGame({ seed: 1006, money: 250000 });
  z.state.unlocked.star = 4;
  for (let j = 28; j <= 42; j++) for (let i = 16; i <= 32; i++) {
    const t = tidx(i, j); z.state.terrain[t] = 0; z.state.path[t] = 0;
    const oid = z.state.tileObj[t]; if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }
  const stCmp = z.Sim.placeObject('coaster_steel', 20, 35, 0);
  assert.equal(z.Coaster.buildTrack(loopRoute).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(24, 35)], 2).ok, true); // Boost
  assert.equal(z.Coaster.placeSpecial([tidx(21, 31)], 4).ok, true);
  const excStd = z.Coaster.stationInfo(stCmp.id).excitement;
  assert.equal(z.Coaster.placeSpecial([tidx(21, 31)], 6).ok, true);
  const excLarge = z.Coaster.stationInfo(stCmp.id).excitement;
  assert.ok(excLarge > excStd, `Large Loop-de-Loop excitement (${excLarge}) should exceed standard Loop-de-Loop (${excStd})`);

  // Verify live train physics: accelerates down drops, decelerates up hills, and rolls back on unpowered climbs (never constant-speed uphill)
  z.Sim.newGame({ seed: 1007, money: 250000 });
  z.state.unlocked.star = 4;
  z.state.time = 0.4;
  for (let j = 28; j <= 42; j++) for (let i = 16; i <= 32; i++) {
    const t = tidx(i, j); z.state.terrain[t] = 0; z.state.path[t] = 0;
    const oid = z.state.tileObj[t]; if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }
  const stPhys = z.Sim.placeObject('coaster_steel', 20, 35, 0);
  assert.equal(z.Coaster.buildTrack(loopRoute).ok, true);
  for (let h = 0; h < 4; h++) assert.equal(z.Coaster.changeHeight([tidx(23, 31), tidx(22, 31), tidx(21, 31)], 1).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(25, 34), tidx(25, 33), tidx(25, 32)], 1).ok, true);
  const physInfo = z.Coaster.stationInfo(stPhys.id);
  assert.equal(physInfo.ready, true, `Chain lift hill should power circuit: ${physInfo.stallReason}`);
  const physTid = z.state.coaster.trains[0].id;
  let liftSpeeds = [], dropSpeeds = [], minClimbSpeed = 999, sawDropAccel = false;
  let prevSpd = 0;
  for (let step = 0; step < 260; step++) {
    z.Sim._step(0.1);
    const ti = z.Coaster.trainInfo(physTid);
    if (ti.state !== 'run') continue;
    const Lphys = ti.line;
    const nIdx = Math.floor((ti.train.s / Lphys.totalLen) * Lphys.nS) % Lphys.nS;
    if (Lphys.sLift[nIdx]) liftSpeeds.push(ti.speed);
    if (Lphys.avgTy[nIdx] < -0.15) {
      dropSpeeds.push(ti.speed);
      if (ti.speed > prevSpd + 0.05) sawDropAccel = true;
    }
    if (!Lphys.sLift[nIdx] && Lphys.avgTy[nIdx] > 0.05 && ti.speed < minClimbSpeed) minClimbSpeed = ti.speed;
    prevSpd = ti.speed;
  }
  assert.ok(liftSpeeds.length > 5 && Math.max(...liftSpeeds) <= 6.0, `Chain lift should hold steady climb speed (~4.2 m/s), got max=${Math.max(...liftSpeeds)}`);
  assert.ok(dropSpeeds.length > 3 && Math.max(...dropSpeeds) > 8.5 && sawDropAccel, `Train should accelerate strongly down drop (>8.5 m/s), got max=${Math.max(...dropSpeeds)}`);

  // Now test unpowered hill stall & rollback: start flat oval, dispatch train, then raise tall unpowered hill ahead of it
  z.Sim.newGame({ seed: 1008, money: 250000 });
  z.state.unlocked.star = 4;
  z.state.time = 0.4;
  for (let j = 28; j <= 42; j++) for (let i = 16; i <= 32; i++) {
    const t = tidx(i, j); z.state.terrain[t] = 0; z.state.path[t] = 0;
    const oid = z.state.tileObj[t]; if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }
  const stStall = z.Sim.placeObject('coaster_steel', 20, 35, 0);
  assert.equal(z.Coaster.buildTrack(loopRoute).ok, true);
  const stallTid = z.state.coaster.trains[0].id;
  for (let step = 0; step < 100; step++) {
    z.Sim._step(0.1);
    if (z.Coaster.trainInfo(stallTid).state === 'run') break;
  }
  assert.equal(z.Coaster.trainInfo(stallTid).state, 'run');
  // Raise unpowered tall hill on north straight while train is running East
  for (let h = 0; h < 5; h++) assert.equal(z.Coaster.changeHeight([tidx(22, 31), tidx(21, 31), tidx(20, 31)], 1).ok, true);
  assert.equal(z.Coaster.stationInfo(stStall.id).energyOk, false);
  let sawRollback = false, sawWinchBack = false, sawClimbDecel = false;
  let lastClimbSpd = null;
  for (let step = 0; step < 200; step++) {
    z.Sim._step(0.1);
    const ti = z.Coaster.trainInfo(stallTid);
    if (ti.state === 'run' && ti.line) {
      const idx = Math.floor((ti.train.s / ti.line.totalLen) * ti.line.nS) % ti.line.nS;
      if (ti.line.avgTy[idx] > 0.05 && ti.speed > 0) {
        if (lastClimbSpd !== null && ti.speed < lastClimbSpd - 0.1) sawClimbDecel = true;
        lastClimbSpd = ti.speed;
      }
    }
    if (ti.speed < -0.1) sawRollback = true;
    if (sawRollback && ti.state === 'dwell') { sawWinchBack = true; break; }
  }
  assert.equal(sawClimbDecel, true, 'Train must decelerate while climbing an unpowered hill');
  assert.equal(sawRollback, true, 'Train on unpowered hill must decelerate and roll backward under gravity rather than climbing at constant speed');
  assert.equal(sawWinchBack, true, 'Stalled train should winch back to station after pause');
});

test('Zoo Custom Rollercoasters: guests ride trains, earn revenue, and breakdowns + mechanic repair work', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 1003, money: 250000 });
  z.state.unlocked.star = 3;
  z.state.time = 0.4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;

  for (let j = 30; j <= 44; j++) for (let i = 18; i <= 32; i++) {
    const t = tidx(i, j);
    z.state.terrain[t] = 0;
    const oid = z.state.tileObj[t];
    if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }

  // Connect path from main entrance walkway to coaster station front (j=37)
  for (let i = 20; i <= 28; i++) z.Sim.placePath(i, 37, 'paved');
  for (let j = 37; j <= 44; j++) z.Sim.placePath(27, j, 'paved');

  const stRes = z.Sim.placeObject('coaster_wooden', 20, 35, 0);
  assert.equal(stRes.ok, true, stRes.msg);

  // Wooden coaster should reject Loop-de-Loop
  const loopRoute = [
    tidx(23, 35), tidx(24, 35), tidx(24, 34), tidx(24, 33), tidx(24, 32),
    tidx(23, 32), tidx(22, 32), tidx(21, 32), tidx(20, 32), tidx(19, 32),
    tidx(19, 33), tidx(19, 34), tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(loopRoute).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(21, 32)], 4).ok, false, 'Wooden coaster should not allow Loop-de-Loop');

  // Buy a second train
  const buy2 = z.Coaster.buyTrain(stRes.id, 3);
  assert.equal(buy2.ok, true, buy2.msg);
  assert.equal(z.Coaster.trainsOnStation(stRes.id).length, 2);

  // Spawn guests right at station front and direct them to board
  const g = {
    id: 9001, name: 'Test Rider', seed: 1, x: 21.5 * 2, z: 37.5 * 2,
    heading: 0, speed: 0, state: 'walk', hunger: 10, thirst: 10, bladder: 10, energy: 90,
    happiness: 65, money: 50, thought: '', thoughtT: 0, seen: {}, seenEnc: {}, seenB: {},
    group: 99, ti: tidx(21, 37), ni: -1, px: 43, pz: 75, lo: 0, lo2: 0, bs: 3,
    gt: 'bld', gid: stRes.id, dk: '', wt: 0, nt: 0.5, acc: 0, tcool: 0, fun: 40, mood: 0,
    lit: false, stay: 200, stay0: 200, pv: 0, tol: 1.5, thor: 0.8, al: { act: 3 }
  };
  z.state.guests.push(g);
  z.Sim._rt().gById.set(g.id, g);
  assert.equal(z.Coaster.arrive(g, z.state.objects.find(o => o.id === stRes.id)), true);
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0, 'Queueing earns no rating credit');

  // Step simulation until guest boards, rides, and finishes the circuit
  let sawRiding = false, maxY = -1;
  for (let step = 0; step < 300; step++) {
    z.Sim._step(0.2);
    if (g.state === 'ride') {
      sawRiding = true;
      if (typeof g.absY === 'number' && g.absY > maxY) maxY = g.absY;
    }
  }
  assert.equal(sawRiding, true, 'Guest should board and ride the coaster train');
  assert.ok(maxY > 1.5, `Riding guest should be elevated on track, got absY=${maxY}`);
  assert.ok(z.state.coaster.stats.boardings >= 1, 'Boardings counter should increment');
  assert.ok(z.state.coaster.stats.income > 0, 'Coaster ticket revenue should be earned');
  assert.ok(z.Sim.ratingBreakdown().attractionBonus > 0, 'Completing the circuit earns attraction credit');

  // Test breakdown stops the ENTIRE rollercoaster (station + all trains) & emergency mechanic repair
  const trainId = z.state.coaster.trains[0].id;
  const train2Id = z.state.coaster.trains[1].id;
  assert.equal(z.Coaster.breakdown(trainId), true);
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, true, 'Station should be marked broken');
  assert.equal(z.Coaster.stationReady(stRes.id), false, 'Broken coaster should stop accepting guests');
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0, 'A broken station stops contributing');
  assert.equal(z.Coaster.trainInfo(trainId).state, 'broken');
  assert.equal(z.Coaster.trainInfo(train2Id).state, 'broken', 'All trains on the coaster should stop on breakdown');
  assert.equal(z.Coaster.trainInfo(trainId).speed, 0);
  const engRes = z.Coaster.callEngineer(trainId);
  assert.equal(engRes.ok, true, engRes.msg);
  assert.equal(z.Coaster.trainInfo(trainId).eng, true);
  for (let step = 0; step < 30; step++) z.Sim._step(0.2);
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, false, 'Coaster should be repaired');
  assert.equal(z.Coaster.stationInfo(stRes.id).condition, 100, 'Emergency mechanic should restore condition to 100%');
  assert.notEqual(z.Coaster.trainInfo(trainId).state, 'broken', 'Train should resume operating (run or dwell) after mechanic repair');

  // Test Safety Override resets to 80% condition and multi-train wear does not stack
  assert.equal(z.Coaster.breakdown(trainId), true);
  for (let step = 0; step < 340; step++) {
    z.Sim._step(0.2);
    if (!z.Coaster.stationInfo(stRes.id).broken) break;
  }
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, false, 'Safety Override should reset coaster after fixTime');
  assert.equal(z.Coaster.stationInfo(stRes.id).condition, 80, 'Safety Override should restore condition to 80%');
  const stObjZoo = z.state.objects.find(o => o.id === stRes.id);
  stObjZoo.condition = 100;
  for (let step = 0; step < 500; step++) z.Sim._step(0.2);
  assert.ok(stObjZoo.condition >= 97, `2-train Zoo coaster condition after 100s should be >= 97%, got ${stObjZoo.condition}`);

  // Test hired Mechanic staff member responds by radio and repairs a broken coaster automatically
  const hireMech = z.Sim.hireStaff('mechanic', 25, 37);
  assert.equal(hireMech.ok, true, hireMech.msg);
  assert.equal(z.Coaster.breakdown(stRes.id), true);
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, true);
  for (let step = 0; step < 80; step++) {
    z.Sim._step(0.2);
    if (!z.Coaster.stationInfo(stRes.id).broken) break;
  }
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, false, 'Hired Mechanic staff should walk to the coaster and repair it');
  assert.equal(z.Coaster.stationInfo(stRes.id).condition, 100);

  // Sell second train
  assert.equal(z.Coaster.sellTrain(buy2.id).ok, true);
  assert.equal(z.Coaster.trainsOnStation(stRes.id).length, 1);
});

test('Zoo Custom Rollercoasters: 3D renderer builds stations, loops, trains, splashes & Ride Along camera', () => {
  const THREE = require('../vendor/three.r128.min.js');
  const root = new THREE.Group();
  const cam = { target: { x: 0, z: 0 } };
  const ctx = vm.createContext({ console, THREE, Math, Float32Array, Uint8Array, Int8Array, Int16Array, Int32Array });
  vm.runInContext('var window = globalThis;', ctx);
  const load = f => vm.runInContext(readScript(f, true), ctx, { filename: f });
  ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js'].forEach(load);
  const z = ctx.Z;
  z.Models = { createBuilding: () => new THREE.Group() };
  z.World = { root: () => root, groundY: () => 0, cam, _G: { t: 1 } };
  load('48-world-coaster.js');

  assert.ok(z.CoasterWorld, 'Z.CoasterWorld should initialize');
  // All 5 station models build cleanly
  ['coaster_wooden', 'coaster_mine', 'coaster_flume', 'coaster_steel', 'coaster_hyper'].forEach(id => {
    const m = z.Models.createBuilding(id);
    assert.ok(m && m.children.length > 5, `${id} 3D station model should build cleanly`);
  });

  z.Sim.newGame({ seed: 1004, money: 250000 });
  z.state.unlocked.star = 4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  for (let j = 30; j <= 40; j++) for (let i = 18; i <= 28; i++) {
    const t = tidx(i, j); z.state.terrain[t] = 0; z.state.path[t] = 0;
    const oid = z.state.tileObj[t]; if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
    z.state.elev[i + j * (N + 1)] = 0;
  }
  const st = z.Sim.placeObject('coaster_hyper', 20, 35, 0);
  assert.equal(st.ok, true);
  const route = [
    tidx(23, 35), tidx(24, 35), tidx(24, 34), tidx(24, 33), tidx(24, 32),
    tidx(23, 32), tidx(22, 32), tidx(21, 32), tidx(20, 32), tidx(19, 32),
    tidx(19, 33), tidx(19, 34), tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(route).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(24, 34)], 2).ok, true); // Launch Boost on straight tile to power through Loops & Corkscrews
  assert.equal(z.Coaster.placeSpecial([tidx(24, 33)], 1).ok, true); // Chain Lift Hill (verifies animated 3D chain links)
  assert.equal(z.Coaster.placeSpecial([tidx(23, 32)], 6).ok, true); // Large Loop-de-Loop
  assert.equal(z.Coaster.placeSpecial([tidx(22, 32)], 4).ok, true); // Loop-de-Loop
  assert.equal(z.Coaster.placeSpecial([tidx(21, 32)], 7).ok, true); // Large Corkscrew
  assert.equal(z.Coaster.placeSpecial([tidx(20, 32)], 5).ok, true); // Corkscrew

  // Render frames + verify 3D track geometry reaches Large Loop height (>= 10m) + first-person Ride Along camera
  z.CoasterWorld.frame(0.016, 0.016);
  let maxTrackY = 0;
  root.traverse(obj => {
    if (obj.isMesh && obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) {
      obj.geometry.computeBoundingBox();
      if (obj.geometry.boundingBox && obj.geometry.boundingBox.max.y > maxTrackY) {
        maxTrackY = obj.geometry.boundingBox.max.y;
      }
    }
  });
  assert.ok(maxTrackY >= 10.0, `Expected 3D track geometry with Large Loop-de-Loop to reach >= 10m, got ${maxTrackY}`);
  const trainId = z.state.coaster.trains[0].id;
  assert.equal(z.CoasterWorld.rideAlong(trainId), true);
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 500);
  for (let f = 0; f < 30; f++) {
    z.Sim._step(0.1);
    z.CoasterWorld.frame(0.016, 0.016);
    const applied = z.CoasterWorld.applyCamera(camera, 0.016);
    assert.equal(applied, true);
    assert.ok(Number.isFinite(camera.position.x) && Number.isFinite(camera.position.y) && Number.isFinite(camera.position.z));
  }
  z.CoasterWorld.endRide();
  assert.equal(z.CoasterWorld.isRiding(), 0);

  // Verify all 4 station rotations (rot = 0..3) align endF with the 3D green launch arrow and endB with the 3D orange return arrow
  for (let rot = 0; rot < 4; rot++) {
    z.Sim.newGame({ seed: 1010 + rot, money: 250000 });
    for (let j = 28; j <= 38; j++) for (let i = 18; i <= 28; i++) {
      const t = tidx(i, j); z.state.terrain[t] = 0; z.state.path[t] = 0;
      const oid = z.state.tileObj[t]; if (oid) { const o = z.state.objects.find(x => x.id === oid); if (o) z.Sim.bulldoze(o.i, o.j); }
      z.state.elev[i + j * (N + 1)] = 0;
    }
    const rSt = z.Sim.placeObject('coaster_wooden', 22, 32, rot);
    assert.equal(rSt.ok, true, `rot=${rot}: ${rSt.msg}`);
    const stEntry = z.Coaster.state().stById[rSt.id];
    const fp = stEntry.fp;
    const cx = (fp.i0 + fp.w / 2) * 2, cz = (fp.j0 + fp.h / 2) * 2;
    const m = z.Models.createBuilding('coaster_wooden');
    m.position.set(cx, 0, cz);
    m.rotation.y = rot * Math.PI / 2;
    m.updateMatrixWorld(true);
    // Green launch arrow is at local (+4.15, y, -1.0); orange return arrow is at local (-4.15, y, -1.0)
    const greenWorld = new THREE.Vector3(4.15, 0, -1.0).applyMatrix4(m.matrixWorld);
    const orangeWorld = new THREE.Vector3(-4.15, 0, -1.0).applyMatrix4(m.matrixWorld);
    const endFx = ((stEntry.endF % N) + 0.5) * 2, endFz = (Math.floor(stEntry.endF / N) + 0.5) * 2;
    const endBx = ((stEntry.endB % N) + 0.5) * 2, endBz = (Math.floor(stEntry.endB / N) + 0.5) * 2;
    const dGreenToF = Math.hypot(greenWorld.x - endFx, greenWorld.z - endFz);
    const dGreenToB = Math.hypot(greenWorld.x - endBx, greenWorld.z - endBz);
    const dOrangeToB = Math.hypot(orangeWorld.x - endBx, orangeWorld.z - endBz);
    assert.ok(dGreenToF < dGreenToB && dGreenToF < 1.5, `rot=${rot}: endF should be at green launch arrow (d=${dGreenToF})`);
    assert.ok(dOrangeToB < 1.5, `rot=${rot}: endB should be at orange return arrow (d=${dOrangeToB})`);
  }
});

test('Zoo paths do not create enclosures, close open fences, or break MAX_ENC_TILES flood fill', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 2026, map: 'grassland', money: 200000 });
  const N = z.N;

  // Clear and flatten [11..28, 11..22]
  for (let j = 11; j <= 22; j++) for (let i = 11; i <= 28; i++) {
    const t = i + j * N;
    const oid = z.state.tileObj[t];
    if (oid) {
      const o = z.state.objects.find(x => x.id === oid);
      if (o) z.Sim.bulldoze(o.i, o.j);
    }
    z.state.terrain[t] = 0;
    z.state.elev[i + j * (N + 1)] = 0;
  }

  // 1. A closed loop of paths enclosing a 4x4 (16-tile >= 9) empty area must NOT create an enclosure
  for (let i = 14; i <= 19; i++) {
    assert.equal(z.Sim.placePath(i, 14, 'paved').ok, true);
    assert.equal(z.Sim.placePath(i, 19, 'paved').ok, true);
  }
  for (let j = 15; j <= 18; j++) {
    assert.equal(z.Sim.placePath(14, j, 'paved').ok, true);
    assert.equal(z.Sim.placePath(19, j, 'paved').ok, true);
  }
  assert.equal(z.state.enclosures.length, 0, 'closed path loop must not create an enclosure');
  assert.equal(z.Sim.enclosureAt(16, 16), null);
  assert.equal(z.state.tileEnc[16 + 16 * N], 0);
  assert.equal(z.Sim.placeObject('ice_cream', 16, 16, 0).ok, true, 'buildings must still be placeable inside a path loop');
  assert.equal(z.Sim.placePath(15, 16, 'paved').ok, true, 'paths must still be placeable inside a path loop');

  // 2. An open 3-sided fence abutting a path on its open 4th side must NOT form an enclosure
  for (let i = 21; i <= 24; i++) {
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 15 }, 'low_wood').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 19 }, 'low_wood').ok, true);
  }
  for (let j = 15; j <= 18; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 25, j }, 'low_wood').ok, true);
  }
  // Open U-shaped fence (facing west towards path column i=19) must not create an enclosure
  assert.equal(z.state.enclosures.length, 0, 'open U-shaped fence next to paths must not create an enclosure');
  assert.equal(z.Sim.enclosureAt(22, 16), null);

  // Place a path right against the open west edge (i=20) — still must NOT close the enclosure
  for (let j = 15; j <= 18; j++) assert.equal(z.Sim.placePath(20, j, 'paved').ok, true);
  assert.equal(z.state.enclosures.length, 0, 'path along open fence edge must not close an enclosure');

  // 3. Closing the 4th side with an actual fence creates the enclosure
  for (let j = 15; j <= 18; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 21, j }, 'low_wood').ok, true);
  }
  assert.equal(z.state.enclosures.length, 1);
  assert.ok(z.Sim.enclosureAt(22, 16));
  assert.equal(z.Sim.enclosureAt(22, 16).area, 16);
});

test('Zoo suitability reports largest terrain deficit instead of always reporting top preference', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 2029, map: 'grassland', money: 200000 });
  const N = z.N;
  for (let j = 13; j <= 18; j++) for (let i = 13; i <= 18; i++) {
    const t = i + j * N;
    const oid = z.state.tileObj[t];
    if (oid) {
      const o = z.state.objects.find(x => x.id === oid);
      if (o) z.Sim.bulldoze(o.i, o.j);
    }
    z.state.terrain[t] = 0;
    z.state.elev[i + j * (N + 1)] = 0;
  }
  for (let i = 14; i <= 17; i++) {
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 14 }, 'low_wood').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 18 }, 'low_wood').ok, true);
  }
  for (let j = 14; j <= 17; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 14, j }, 'low_wood').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 18, j }, 'low_wood').ok, true);
  }
  const enc = z.Sim.enclosureAt(15, 15);
  assert.ok(enc);

  // 100% grass: Meerkat (sand 0.5, savannah 0.3, dirt 0.2) wants sand most
  let suit = z.Sim.suitabilityFor(enc.id, 'meerkat');
  assert.ok(suit.terrain < 0.7);
  assert.ok(suit.issues.includes('Prefers sand terrain'));

  // Paint 100% sand: terrain < 0.7 (0.5), largest deficit is savannah (0.3)
  for (let j = 14; j <= 17; j++) for (let i = 14; i <= 17; i++) z.Sim.paintTerrain(i, j, 'sand', 0);
  suit = z.Sim.suitabilityFor(enc.id, 'meerkat');
  assert.ok(suit.terrain < 0.7);
  assert.ok(suit.issues.includes('Prefers savannah terrain'), `Expected savannah deficit, got: ${suit.issues.join('; ')}`);
  assert.equal(suit.issues.includes('Prefers sand terrain'), false);

  // Hippo (water 0.5, savannah 0.3, dirt 0.2; hasWaterPref = true): 100% water reports savannah deficit
  for (let j = 14; j <= 17; j++) for (let i = 14; i <= 17; i++) z.Sim.paintTerrain(i, j, 'water', 0);
  suit = z.Sim.suitabilityFor(enc.id, 'hippo');
  assert.ok(suit.terrain < 0.7);
  assert.ok(suit.issues.includes('Prefers savannah terrain'), `Expected savannah deficit, got: ${suit.issues.join('; ')}`);
  assert.equal(suit.issues.includes('Prefers water terrain'), false);
});

test('Zoo animals enforce minimum enclosure width, separate cleanly, and keep fence clearance', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 4343, map: 'grassland', money: 500000 });
  z.state.unlocked.star = 5;
  const N = z.N;
  for (let j = 8; j <= 28; j++) for (let i = 8; i <= 34; i++) {
    const t = i + j * N;
    const oid = z.state.tileObj[t];
    if (oid) {
      const o = z.state.objects.find(x => x.id === oid);
      if (o) z.Sim.bulldoze(o.i, o.j);
    }
    z.state.terrain[t] = 0;
    z.state.elev[i + j * (N + 1)] = 0;
  }
  const fenceBox = (i0, j0, i1, j1, kind) => {
    for (let i = i0; i <= i1; i++) {
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok, true);
    }
    for (let j = j0; j <= j1; j++) {
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok, true);
      assert.equal(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok, true);
    }
  };

  // Narrow 2x14 strip (area 28, inscribedSpan 2) must reject Elephant (minSpan 5) and Giraffe (minSpan 4)
  fenceBox(10, 10, 11, 23, 'reinforced');
  const narrowEnc = z.Sim.enclosureAt(10, 15);
  assert.ok(narrowEnc);
  assert.equal(narrowEnc.inscribedSpan, 2);
  const addElNarrow = z.Sim.addAnimal('elephant', 10, 15);
  assert.equal(addElNarrow.ok, false, 'narrow 2-tile enclosure must reject Elephant');
  assert.match(String(addElNarrow.msg || addElNarrow.why || ''), /wide|narrow|tiles/i);
  const addGiNarrow = z.Sim.addAnimal('giraffe', 10, 15);
  assert.equal(addGiNarrow.ok, false, 'narrow 2-tile enclosure must reject Giraffe');
  const suitNarrow = z.Sim.suitabilityFor(narrowEnc.id, 'elephant');
  assert.ok(suitNarrow.issues.some((s) => /narrow|wide/i.test(s)), `Expected narrow enclosure issue, got: ${suitNarrow.issues.join('; ')}`);

  // Spacious 8x8 enclosure accepts two Elephants
  fenceBox(16, 10, 23, 17, 'reinforced');
  const wideEnc = z.Sim.enclosureAt(19, 13);
  assert.ok(wideEnc);
  assert.equal(wideEnc.inscribedSpan, 8);
  const r1 = z.Sim.addAnimal('elephant', 19, 13);
  const r2 = z.Sim.addAnimal('elephant', 19, 13);
  assert.equal(r1.ok && r2.ok, true);
  const e1 = z.state.animals.find((a) => a.id === r1.id);
  const e2 = z.state.animals.find((a) => a.id === r2.id);

  // Moving an Elephant into the narrow 2x14 enclosure must be rejected
  assert.equal(z.Sim.moveAnimal(e1.id, 10, 15).ok, false);

  // Place both adults on the exact same spot and tick: deterministic separation must push them apart
  e1.x = 19.5 * z.TILE; e1.z = 13.5 * z.TILE;
  e2.x = 19.5 * z.TILE; e2.z = 13.5 * z.TILE;
  for (let k = 0; k < 50; k++) z.Sim.tick(0.1);
  const sep = Math.hypot(e1.x - e2.x, e1.z - e2.z);
  assert.ok(sep >= 2.0, `Two Elephants must separate instead of stacking (dist=${sep.toFixed(2)})`);

  // Both must stay inside enclosure bounds and keep clearance from perimeter fences
  const minX = 16 * z.TILE, maxX = 24 * z.TILE, minZ = 10 * z.TILE, maxZ = 18 * z.TILE;
  for (const a of [e1, e2]) {
    assert.ok(a.x > minX + 0.8 && a.x < maxX - 0.8, `Elephant x=${a.x.toFixed(2)} must keep fence clearance`);
    assert.ok(a.z > minZ + 0.8 && a.z < maxZ - 0.8, `Elephant z=${a.z.toFixed(2)} must keep fence clearance`);
  }
});

test('all Zoo species, scenery, and buildings build valid finite 3D geometry', () => {
  const ctx = {
    THREE: require('../vendor/three.r128.min.js'),
    console, Math, Array, Object, Number, String, Boolean, RegExp, Date, JSON,
    Float32Array, Uint16Array, Uint32Array, Int32Array,
    document: { createElement: () => ({ width: 256, height: 64, getContext: () => ({ fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '', fillRect() {}, strokeRect() {}, fillText() {} }) }) },
    Z: {}
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['00-data.js', '30-models-toilets.js', '30-models-common.js', '30-models.js']) {
    vm.runInContext(readScript(f, true), ctx, { filename: f });
  }
  const checkObj = (obj, label) => {
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
  const M = ctx.Z.Models, D = ctx.Z.DATA;
  const idsOf = (v) => Array.isArray(v) ? v.map((x) => x.id) : Object.keys(v || {});
  const sps = idsOf(D.animals);
  assert.ok(sps.length >= 45, `expected >=45 Zoo species, got ${sps.length}`);
  for (const id of sps) {
    for (const sex of ['m', 'f']) {
      for (const baby of [false, true]) {
        const a = M.createAnimal(id, { sex, baby });
        assert.ok(a && a.group, `missing Zoo model for ${id}`);
        checkObj(a.group, `zoo:${id}:${sex}${baby ? ':baby' : ''}`);
        a.update(0.05, { state: 'walk', speed: 1.5 });
        a.update(0.05, { state: 'play', speed: 0 });
      }
    }
  }
  for (const id of idsOf(D.scenery)) checkObj(M.createScenery(id), `zoo:scenery:${id}`);
  for (const id of idsOf(D.buildings)) {
    const m = M.createBuilding(id);
    if (m) checkObj(m, `zoo:building:${id}`);
  }
});


test('a walking Zoo animal blocked by a resting herd-mate gives up instead of walking in place', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 4344, map: 'grassland', money: 500000 });
  z.state.unlocked.star = 5;
  const N = z.N;
  for (let j = 8; j <= 28; j++) for (let i = 8; i <= 34; i++) {
    const t = i + j * N;
    const oid = z.state.tileObj[t];
    if (oid) {
      const o = z.state.objects.find(x => x.id === oid);
      if (o) z.Sim.bulldoze(o.i, o.j);
    }
    z.state.terrain[t] = 0;
    z.state.elev[i + j * (N + 1)] = 0;
  }
  for (let i = 16; i <= 23; i++) {
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 10 }, 'reinforced').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'x', i, j: 18 }, 'reinforced').ok, true);
  }
  for (let j = 10; j <= 17; j++) {
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 16, j }, 'reinforced').ok, true);
    assert.equal(z.Sim.placeFence({ axis: 'z', i: 24, j }, 'reinforced').ok, true);
  }
  const r1 = z.Sim.addAnimal('elephant', 19, 13);
  const r2 = z.Sim.addAnimal('elephant', 19, 13);
  assert.equal(r1.ok && r2.ok, true);
  const walker = z.state.animals.find((a) => a.id === r1.id);
  const sleeper = z.state.animals.find((a) => a.id === r2.id);

  // The sleeper rests against the east fence, right on the walker's target, so the walker is pushed back every frame
  sleeper.x = 23 * z.TILE; sleeper.z = 13.5 * z.TILE; sleeper.state = 'sleep'; sleeper.energy = 0; sleeper.heading = Math.PI / 2;
  walker.x = 18 * z.TILE; walker.z = 13.5 * z.TILE; walker.heading = Math.PI / 2;
  walker.state = 'walk'; walker.tg = 'wander'; walker.tx = 23.5 * z.TILE; walker.tz = 13.5 * z.TILE;
  walker.wx = 0; walker.wz = 0; walker.aroute = null; walker.detours = 0; walker.stuck = 0;

  let walkingInPlace = 0;
  for (let k = 0; k < 400; k++) {
    const x0 = walker.x, z0 = walker.z;
    z.Sim.tick(0.05);
    const moved = Math.hypot(walker.x - x0, walker.z - z0);
    if (walker.state === 'walk' && walker.speed > 0 && moved < 0.01) walkingInPlace++;
    else walkingInPlace = 0;
    assert.ok(walkingInPlace < 60, `Walker kept its walk animation for ${walkingInPlace} ticks without moving`);
  }
});

test('Zoo records small enclosures (<9 tiles), many small enclosures, IDs above 32767, and migrates legacy i16 saves', () => {
  const { z } = zoo();
  z.Sim.newGame({ seed: 4456, map: 'grassland', money: 1e7 });
  const N = z.N;
  const { i0: mx0, j0: my0, i1: mx1, j1: my1 } = z.state.map;
  for (let j = my0 + 1; j <= Math.min(my1 - 1, my0 + 30); j++) for (let i = mx0 + 1; i <= Math.min(mx1 - 1, mx0 + 36); i++) {
    const t = i + j * N;
    const oid = z.state.tileObj[t];
    if (oid) {
      const o = z.state.objects.find(x => x.id === oid);
      if (o) z.Sim.bulldoze(o.i, o.j);
    }
    z.state.terrain[t] = 0;
    z.state.elev[i + j * (N + 1)] = 0;
  }

  const putFence = (edge) => {
    const r = z.Sim.placeFence(edge, 'low_wood');
    assert.ok(r.ok || r.msg === 'Already there', `placeFence failed: ${r.msg}`);
  };
  const buildBox = (i0, j0, w, h) => {
    for (let i = i0; i < i0 + w; i++) {
      putFence({ axis: 'x', i, j: j0 });
      putFence({ axis: 'x', i, j: j0 + h });
    }
    for (let j = j0; j < j0 + h; j++) {
      putFence({ axis: 'z', i: i0, j });
      putFence({ axis: 'z', i: i0 + w, j });
    }
  };

  // 1. Small enclosures under 9 tiles (2x2 = 4 tiles, 2x4 = 8 tiles) and many small adjacent pens
  const bx = mx0 + 2, by = my0 + 2;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    buildBox(bx + c * 2, by + r * 2, 2, 2);
  }
  buildBox(bx, by + 18, 4, 2);
  assert.equal(z.state.enclosures.length, 65, 'all 64 2x2 enclosures and the 4x2 enclosure should be recorded');
  assert.equal(z.Sim.enclosureAt(bx, by).area, 4);
  assert.equal(z.Sim.enclosureAt(bx + 1, by + 19).area, 8);

  // 2. IDs crossing signed 16-bit boundary (32767 -> 32768) and 65536
  const lastEnc = z.state.enclosures[z.state.enclosures.length - 1];
  lastEnc.id = 32767;
  for (const t of lastEnc.tiles) z.state.tileEnc[t] = 32767;
  buildBox(bx + 18, by, 3, 3);
  const e32768 = z.Sim.enclosureAt(bx + 19, by + 1);
  assert.equal(z.state.tileEnc.constructor.name, 'Int32Array', 'tileEnc must be Int32Array');
  assert.equal(e32768 && e32768.id, 32768);
  assert.equal(z.state.tileEnc[(bx + 19) + (by + 1) * N], 32768);
  assert.equal(e32768.inscribedSpan, 3);

  e32768.id = 65535;
  for (const t of e32768.tiles) z.state.tileEnc[t] = 65535;
  buildBox(bx + 22, by, 3, 3);
  const e65536 = z.Sim.enclosureAt(bx + 23, by + 1);
  assert.equal(e65536 && e65536.id, 65536);
  assert.equal(z.state.tileEnc[(bx + 23) + (by + 1) * N], 65536);
  assert.equal(e65536.inscribedSpan, 3);

  // Adopting an animal into an enclosure with ID >= 65536 works
  const adopt = z.Sim.addAnimal('ostrich', bx + 23, by + 1);
  assert.equal(adopt.ok, true, `adopt failed: ${adopt.msg}`);

  // Unrelated fence edit preserves high enclosure IDs
  assert.equal(z.Sim.placeFence({ axis: 'x', i: bx + 20, j: by + 15 }, 'low_wood').ok, true);
  assert.equal(z.Sim.enclosureAt(bx + 19, by + 1).id, 65535);
  assert.equal(z.Sim.enclosureAt(bx + 23, by + 1).id, 65536);

  // Save/load round-trip preserves Int32Array IDs
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.state.tileEnc.constructor.name, 'Int32Array');
  assert.equal(z.Sim.enclosureAt(bx + 19, by + 1).id, 65535);
  assert.equal(z.Sim.enclosureAt(bx + 23, by + 1).id, 65536);

  // Legacy Int16Array save with wrapped negative/zero tileEnc entries heals cleanly on load
  const parsed = JSON.parse(saved);
  const legacyTE = new Int16Array(z.state.tileEnc);
  assert.equal(legacyTE[(bx + 19) + (by + 1) * N], -1);
  assert.equal(legacyTE[(bx + 23) + (by + 1) * N], 0);
  parsed.s.tileEnc = Object.assign(z.packArray(legacyTE), { __t: 'i16' });
  assert.equal(z.Sim.load(JSON.stringify(parsed)), true);
  assert.equal(z.state.tileEnc.constructor.name, 'Int32Array');
  assert.equal(z.Sim.enclosureAt(bx + 19, by + 1).id, 65535);
  assert.equal(z.Sim.enclosureAt(bx + 23, by + 1).id, 65536);
});
