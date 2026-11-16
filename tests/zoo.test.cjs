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
  const ctx = vm.createContext({ console, setTimeout, clearTimeout,
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

