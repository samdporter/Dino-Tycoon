// Save-key isolation for the extracted Zoo game, without a renderer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/zoo', file), 'utf8'), ctx);
  ['00-data.js', '10-core.js', '20-sim.js'].forEach(load);
  const z = ctx.Z;
  z.UI = { h: node, ic: () => '', snd() {}, toast() {}, reset() {}, closeModal() {}, narrow: () => false,
    Tutorial: { restart() {} }, el: { cards: node() } };
  z.World = { cam: { target: { x: 0, z: 0 } }, resize() {} };
  z.Audio = { enabled: () => true, setEnabled() {} };
  load('60-main.js');
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
  const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/zoo', file), 'utf8'), ctx);
  ['00-data.js', '10-core.js', '20-sim.js'].forEach(load);
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
  load('60-main.js');
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

  const dinoSrcFiles = fs.readdirSync(path.join(__dirname, '../src')).filter(f => f.endsWith('.js'));
  for (const file of dinoSrcFiles) {
    const content = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
    assert.ok(!content.includes('PlayTimer') && !content.includes('timerchip'), `Dino script ${file} must not include PlayTimer`);
  }
  const dinoCss = fs.readFileSync(path.join(__dirname, '../styles/game.css'), 'utf8');
  assert.ok(!dinoCss.includes('timerchip') && !dinoCss.includes('timerpop'), 'styles/game.css must not include PlayTimer styles');
});
