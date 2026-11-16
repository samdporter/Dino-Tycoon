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
