// Run with: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function game() {
  const ctx = vm.createContext({ console, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') });
  const simFiles = fs.readdirSync(path.join(root, 'src')).filter(f => /^(00|10|2\d)-.*\.js$/.test(f)).sort();
  for (const f of simFiles) vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
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
test('v3 island maps, moats, power, realms, monorail, safari and DNA persist across save/load', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy' });
  assert.equal(Boolean(z.Sim.isIsland()), true);
  assert.ok(z.Sim.seaMask().some(v => v > 0));
  assert.ok(z.Sim.moats && z.Sim.monorail && z.Sim.power && z.Sim.realms && z.Sim.news && z.Sim.safari);
  const saved = z.Sim.save();
  z.Sim.newGame({ seed: 99, map: 'crater_lake' });
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.state.map.id, 'fern_meadow');
  assert.equal(Boolean(z.Sim.isIsland()), true);
});
test('legacy v2 save without v3 arrays loads cleanly and keeps inland map', () => {
  const z = game();
  z.Sim.newGame({ seed: 101 });
  const v2Like = JSON.parse(z.Sim.save());
  delete v2Like.s.ditch;
  delete v2Like.s.moatTip;
  delete v2Like.s.rail;
  delete v2Like.s.mono;
  delete v2Like.s.safari;
  delete v2Like.s.power;
  delete v2Like.s.realms;
  delete v2Like.s.news;
  if (v2Like.s.map) delete v2Like.s.map.island;
  v2Like.s.money = 54321;
  assert.equal(z.Sim.load(JSON.stringify(v2Like)), true);
  assert.equal(z.state.money, 54321);
  assert.equal(Boolean(z.Sim.isIsland()), false);
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

function setupFlatZone(z, i0, j0, i1, j1) {
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * z.N] = 0;
  }
}

test('monorail train leaves station and completes laps on a 1-station ring network', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy' });
  z.state.money = 200000;
  z.state.unlocked.star = 5;
  setupFlatZone(z, 14, 14, 34, 34);
  for (let i = 20; i <= 27; i++) z.Sim.placePath(i, 22, 'paved');
  for (let j = 22; j <= 39; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 29; i <= 32; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 29 }, 'steel');
    z.Sim.placeFence({ axis: 'x', i, j: 33 }, 'steel');
  }
  for (let j = 29; j <= 32; j++) {
    z.Sim.placeFence({ axis: 'z', i: 29, j }, 'steel');
    z.Sim.placeFence({ axis: 'z', i: 33, j }, 'steel');
  }
  z.Sim.spawnAnimal('triceratops', 30, 30);

  const st = z.Sim.placeObject('monorail_station', 20, 20, 0);
  assert.equal(st.ok, true);
  assert.equal(z.Sim.placeObject('diesel_gen', 23, 23, 2).ok, true);
  assert.equal(z.Sim.placeObject('substation', 20, 23, 2).ok, true);
  assert.equal(z.Sim.monorail.stationInfo(st.id).powered, true);

  const route = [];
  for (let i = 23; i <= 26; i++) route.push(i + 20 * z.N);
  for (let j = 19; j >= 15; j--) route.push(26 + j * z.N);
  for (let i = 25; i >= 17; i--) route.push(i + 15 * z.N);
  for (let j = 16; j <= 20; j++) route.push(17 + j * z.N);
  route.push(18 + 20 * z.N, 19 + 20 * z.N, 20 + 20 * z.N);
  const tr = z.Sim.monorail.buildTrack(route);
  assert.equal(tr.ok, true);

  const state = z.Sim.monorail.state();
  assert.equal(state.lines.length, 1);
  const line = state.lines[0];
  assert.equal(line.loop, true);
  assert.equal(line.stops.length, 1);
  // Stop s must be near the station center, not on the opposite side of the loop
  const stopPose = z.Sim.monorail.sample(line, line.stops[0].s);
  assert.ok(stopPose.x >= 20 * z.TILE && stopPose.x <= 24 * z.TILE);
  assert.ok(stopPose.z >= 20 * z.TILE && stopPose.z <= 22 * z.TILE);

  assert.equal(z.Sim.monorail.buyTrain(st.id, 2).ok, true);
  z.state.time = 0.35;
  for (let k = 0; k < 200 && !z.state.guests.length; k++) z.Sim.tick(0.1);
  const guest = z.state.guests[0];
  assert.ok(guest);
  const stObj = z.state.objects.find(o => o.id === st.id);
  guest.gt = 'bld'; guest.gid = st.id; guest.rdst = 0; guest.rfrom = st.id; guest.money = 100;
  z.Sim.monorail.arrive(guest, stObj);

  const s0 = z.Sim.monorail.trains()[0].s;
  let maxDist = 0, leftStation = false, returned = false, boarded = false, rode = false, alighted = false;
  for (let k = 0; k < 1000; k++) {
    z.Sim.tick(0.05);
    const T = z.Sim.monorail.trains()[0];
    const d = Math.min(Math.abs(T.s - s0), line.len - Math.abs(T.s - s0));
    if (d > maxDist) maxDist = d;
    if (guest.state === 'ride') boarded = true;
    if (T.st === 'run' && d > 5) { leftStation = true; if (boarded) rode = true; }
    if (leftStation && T.st === 'dwell') {
      returned = true;
      if (guest.state === 'walk') { alighted = true; break; }
    }
  }
  assert.equal(leftStation, true, 'Train must leave station on a 1-station loop');
  assert.ok(maxDist > 20, 'Train must travel around the loop');
  assert.equal(returned, true, 'Train must return to station dwell');
  assert.equal(boarded && rode && alighted, true, 'Guest must board, ride the loop, and alight');
});

test('monorail 2-station loop and keepers crossing moat bridges work properly', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy' });
  z.state.money = 200000;
  z.state.unlocked.star = 5;
  setupFlatZone(z, 12, 12, 34, 34);
  for (let i = 16; i <= 27; i++) z.Sim.placePath(i, 22, 'paved');
  for (let j = 22; j <= 39; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 18; i <= 27; i++) z.Sim.placePath(i, 26, 'paved');

  const st1 = z.Sim.placeObject('monorail_station', 18, 20, 0);
  const st2 = z.Sim.placeObject('monorail_station', 18, 27, 2);
  assert.equal(st1.ok && st2.ok, true);
  assert.equal(z.Sim.placeObject('diesel_gen', 14, 24, 0).ok, true);
  assert.equal(z.Sim.placeObject('substation', 16, 23, 2).ok, true);

  const route = [];
  for (let i = 21; i <= 24; i++) route.push(i + 20 * z.N);
  for (let j = 21; j <= 28; j++) route.push(24 + j * z.N);
  for (let i = 23; i >= 18; i--) route.push(i + 28 * z.N);
  route.push(17 + 28 * z.N, 16 + 28 * z.N);
  for (let j = 27; j >= 20; j--) route.push(16 + j * z.N);
  route.push(17 + 20 * z.N, 18 + 20 * z.N);
  assert.equal(z.Sim.monorail.buildTrack(route).ok, true);
  assert.equal(z.Sim.monorail.buyTrain(st1.id, 2).ok, true);

  z.state.time = 0.35;
  const visitedStops = new Set();
  for (let k = 0; k < 1000; k++) {
    z.Sim.tick(0.05);
    const T = z.Sim.monorail.trains()[0];
    if (T.st === 'dwell') visitedStops.add(T.at);
    if (visitedStops.size === 2) break;
  }
  assert.equal(visitedStops.size, 2, 'Train must travel between both stations on a 2-station loop');

  // Moat + bridge enclosure check
  const ditch = [];
  for (let j = 13; j <= 19; j++) for (let i = 28; i <= 34; i++) {
    if (i >= 30 && i <= 32 && j >= 15 && j <= 17) continue;
    ditch.push({ i, j });
  }
  assert.equal(z.Sim.moats.dig(ditch, 2).ok, true);
  for (let j = 20; j <= 22; j++) z.Sim.placePath(31, j, 'paved');
  for (let i = 27; i <= 31; i++) z.Sim.placePath(i, 22, 'paved');
  assert.equal(z.Sim.placePath(31, 19, 'paved').bridge, true);
  assert.equal(z.Sim.placePath(31, 18, 'paved').bridge, true);
  z.Sim.spawnAnimal('triceratops', 31, 16);
  const enc = z.state.enclosures[0];
  enc.foodLevel = 0.2;
  enc.poop = 4;
  assert.equal(z.Sim.hireStaff('keeper', 27, 22).ok, true);
  for (let k = 0; k < 400; k++) z.Sim.tick(0.1);
  assert.equal(enc.foodLevel, 1);
  assert.equal(enc.poop, 0);
});
