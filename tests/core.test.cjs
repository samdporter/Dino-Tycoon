// Run with: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function game() {
  const ctx = vm.createContext({ console, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') });
  for (const f of ['00-data.js', '10-core.js', '20-sim.js']) vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
  return ctx.Z;
}
test('simulation actions and typed terrain survive saving/loading', () => {
  const z = game();
  z.Sim.newGame({ seed: 123, difficulty: 'easy' });
  let placed = false;
  for (let j = 1; j < z.N - 1 && !placed; j++)
    for (let i = 1; i < z.N - 1 && !placed; i++) placed = z.Sim.placePath(i, j, 'paved').ok;
  assert.equal(placed, true);
  assert.equal(z.Sim.hireStaff('keeper').ok, true);
  const animal = z.Sim.spawnAnimal('dryosaurus', 27, 50, {sex:'F'});
  animal.name = 'Persistence test';
  for (let n = 0; n < 300; n++) z.Sim.tick(0.1);
  const before = JSON.parse(z.Sim.save());
  z.Sim.newGame({ seed: 999 });
  assert.equal(z.Sim.load(JSON.stringify(before)), true);
  const after = JSON.parse(z.Sim.save());
  assert.equal(after.s.money, before.s.money);
  assert.deepEqual(after.s.terrain, before.s.terrain);
  assert.deepEqual(after.s.path, before.s.path);
  assert.deepEqual(after.s.elev, before.s.elev);
  assert.equal(after.s.staff.length, before.s.staff.length);
  assert.equal(after.s.animals[0].name, 'Persistence test');
  assert.equal(after.s.day, before.s.day);
});
test('invalid JSON/version/truncated arrays rejected before replacing state', () => {
  const z = game(), before = z.state;
  for (const raw of ['broken', '{"v":99,"s":{}}', '{"v":2,"s":{"research":{"genomes":{},"stats":{}}}}']) {
    assert.equal(z.Sim.load(raw), false); assert.equal(z.state, before);
  }
});
test('same seed and action sequence are deterministic', () => {
  const a = game(), b = game();
  for (const z of [a,b]) {
    z.Sim.newGame({seed:6789}); z.Sim.hireStaff('keeper');
    for (let n=0;n<100;n++) z.Sim.tick(0.1);
  }
  assert.equal(a.Sim.save(), b.Sim.save());
});
test('dinosaurs detour around rocks, trees, and cliffs, and walk through bushes', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, money: 100000 });
  // Clear starting objects inside an enclosure area [10..16, 20..26]
  for (let j = 19; j <= 27; j++) for (let i = 9; i <= 17; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
  }
  for (let i = 10; i <= 16; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 20 }, 'reinforced');
    z.Sim.placeFence({ axis: 'x', i, j: 27 }, 'reinforced');
  }
  for (let j = 20; j <= 26; j++) {
    z.Sim.placeFence({ axis: 'z', i: 10, j }, 'reinforced');
    z.Sim.placeFence({ axis: 'z', i: 17, j }, 'reinforced');
  }
  // Place a wall of boulders, trees, and a cliff across j=23 (from i=11 to i=15), leaving i=10 and i=16 open
  assert.equal(z.Sim.placeObject('boulder', 12, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('ginkgo', 13, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('rock_pile', 14, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('pine', 15, 23, 0).ok, true);
  // Make tile (11, 23) a steep cliff using corner (12, 23) so tile (10, 23) stays flat
  z.state.elev[12 + 23 * (z.N + 1)] = 5;
  z.state.elev[12 + 24 * (z.N + 1)] = 5;
  // Place walkable bushes on the open pass at (10, 23) and (16, 23)
  assert.equal(z.Sim.placeObject('bush', 10, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('fern', 16, 23, 0).ok, true);

  // Place a carcass feeder at (13, 25) south of the obstacle wall, and spawn a raptor at (13, 21) north of the wall
  assert.equal(z.Sim.placeObject('carcass_feeder', 13, 25, 0).ok, true);
  const dino = z.Sim.spawnAnimal('velociraptor', 13, 21);
  dino.hunger = 80;
  dino.st = 0;

  let reachedEat = false;
  for (let step = 0; step < 400; step++) {
    z.Sim.tick(0.05);
    const ti = Math.floor(dino.x / z.TILE), tj = Math.floor(dino.z / z.TILE);
    // Must never enter the boulder, tree, rock_pile, or cliff tiles
    assert.notEqual(`${ti},${tj}`, '11,23');
    assert.notEqual(`${ti},${tj}`, '12,23');
    assert.notEqual(`${ti},${tj}`, '13,23');
    assert.notEqual(`${ti},${tj}`, '14,23');
    if (dino.state === 'eat') { reachedEat = true; break; }
  }
  assert.equal(reachedEat, true, 'Dinosaur should detour around rock/tree/cliff wall through bushes to eat');
});

