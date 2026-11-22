const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const THREE = require('../vendor/three.r128.min.js');
const { readScript } = require('./game-scripts.cjs');

test('Dino and Zoo rebuild model geometry when graphics detail changes', () => {
  for (const zoo of [false, true]) {
    const ctx = vm.createContext({ THREE });
    vm.runInContext('var window = globalThis;', ctx);
    for (const file of ['00-data.js', '30-models-toilets.js', '30-models-common.js', '30-models.js']) {
      vm.runInContext(readScript(file, zoo), ctx, { filename: file });
    }
    const models = ctx.Z.Models;
    const vertexCount = detail => {
      models.setDetail(detail);
      const builder = models.kit.B();
      builder.sph(1, 1, 1, 0, 0, 0, 0xffffff, { s: [10, 8] });
      return builder.build().attributes.position.count;
    };
    const low = vertexCount(0.85);
    const high = vertexCount(2);
    assert.ok(high > low, `${zoo ? 'Zoo' : 'Dino'} high detail should add vertices`);
    assert.equal(vertexCount(0.85), low, 'returning to low detail should restore its geometry');
  }
});
