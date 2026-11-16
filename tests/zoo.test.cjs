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
