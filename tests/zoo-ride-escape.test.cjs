// Regression coverage for the Zoo tools' installed keyboard handler.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript } = require('./game-scripts.cjs');

test('Escape ends an active Zoo coaster ride through the tools keyboard handler', () => {
  const listeners = {};
  const world = { addEventListener() {} };
  let rideActive = true;
  let timerOpen = true;
  let ended = 0;
  const ui = {
    held: {}, titleOpen: false,
    h() {}, ic() {}, fmt() {},
    modalOpen: () => false,
    PlayTimer: { isOpen: () => timerOpen, open(value) { timerOpen = value; } },
    Panel: { isOpen: () => false },
    snd() {}
  };
  const z = {
    UI: ui,
    DATA: {}, N: 0, TILE: 1,
    bus: { on() {} },
    CoasterWorld: { isRiding: () => rideActive, endRide() { rideActive = false; ended++; } },
    state: {}
  };
  const window = { Z: z, addEventListener(type, fn) { listeners[type] = fn; }, innerHeight: 1000 };
  const ctx = vm.createContext({ window, document: { getElementById: id => id === 'world' ? world : null }, console });
  for (const file of ['51-input.js', '51-tools.js']) {
    vm.runInContext(readScript(file, true), ctx, { filename: file });
  }
  z.UI.Tools.init();

  let prevented = false;
  listeners.keydown({ key: 'Escape', target: null, preventDefault() { prevented = true; } });

  assert.equal(ended, 1);
  assert.equal(prevented, true);
  assert.equal(timerOpen, true);

  listeners.keydown({ key: 'Escape', target: null, preventDefault() {} });

  assert.equal(ended, 1);
  assert.equal(timerOpen, false);
});
