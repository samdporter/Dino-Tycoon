// Run with: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');
function game() {
  const ctx = vm.createContext({ console, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') });
  const simFiles = simulationScripts(false, true);
  for (const f of simFiles) vm.runInContext(readScript(f), ctx, { filename: f });
  return ctx.Z;
}

// A flat park with two lakes: lake A (x 10..20, y 20..30) and lake B (x 40..48, y 20..28).
// The gate paths join the main shore path at (22..27, 26); everything else is built by each test.
function world() {
  const z = game(), N = z.N;
  z.Sim.newGame({ seed: 5, difficulty: 'easy' });
  const S = z.state, water = z.DATA.terrain.findIndex(t => t.id === 'water');
  S.objects.length = 0; S.tileObj.fill(0); S.terrain.fill(0); S.elev.fill(0); S.map = { id: 'fern_meadow', i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
  for (let j = 20; j <= 30; j++) for (let i = 10; i <= 20; i++) S.terrain[i + j * N] = water;
  for (let j = 20; j <= 28; j++) for (let i = 40; i <= 48; i++) S.terrain[i + j * N] = water;
  S.money = 400000; S.unlocked.star = 5; S.open = true; S.time = 0.45; S.ticketPrice = 0;
  assert.equal(z.Sim.load(z.Sim.save()), true);
  for (let j = 26; j <= 39; j++) assert.ok(z.Sim.placePath(27, j, 'paved').ok);
  for (let i = 22; i <= 26; i++) assert.ok(z.Sim.placePath(i, 26, 'paved').ok);
  return z;
}
function lay(z, tiles, type = 'paved') { for (const [i, j] of tiles) assert.ok(z.Sim.placePath(i, j, type).ok, `path ${i},${j}`); }
function row(i0, i1, j) { const out = []; for (let i = i0; i <= i1; i++) out.push([i, j]); return out; }
function comp(z, i, j) { return z.Sim._rt().comp[i + j * z.N]; }
function step(z, seconds, dt = 0.25) { for (let n = 0; n < seconds / dt; n++) z.Sim._step(dt); }
// main park pier on lake A, a second pier on the west shore with its own path patch
function twoShores(z) {
  lay(z, row(8, 9, 26));
  lay(z, [[8, 27], [8, 28]]);
  assert.ok(z.Sim.placeObject('guest_pier', 21, 24, 0).ok);
  assert.ok(z.Sim.placeObject('guest_pier', 8, 24, 0).ok);
}
function guestAt(z, i, j) {
  const g = z.monoCtx.spawnGuest(1, false);
  const t = i + j * z.N; g.x = (i + 0.5) * z.TILE; g.z = (j + 0.5) * z.TILE; g.ti = t; g.ni = -1; g.money = 100; g.tol = 2; g.stay = 999; g.gt = ''; g.dk = '';
  return g;
}

test('pontoons float on any water, ignore the bridge span limit and join paths', () => {
  const z = world(), N = z.N;
  assert.equal(z.Sim.placePath(5, 5, 'pontoon').ok, false, 'not on land');
  assert.equal(z.Sim.placePath(21, 26, 'pontoon').ok, false, 'a pontoon needs water (21,26 is land)');
  lay(z, [[21, 26]]);
  const before = z.state.money;
  assert.equal(z.Sim.placePath(20, 26, 'pontoon').cost, z.DATA.paths.find(p => p.id === 'pontoon').cost);
  assert.ok(z.DATA.paths.find(p => p.id === 'pontoon').cost > z.DATA.paths.find(p => p.id === 'paved').cost);
  assert.equal(z.state.money, before - 60);
  assert.equal(comp(z, 20, 26), comp(z, 22, 26), 'the pontoon joins the shore path');
  lay(z, row(10, 19, 26), 'pontoon');   // ten tiles of lake: far beyond the five-tile bridge limit
  lay(z, row(8, 9, 26));
  assert.equal(comp(z, 8, 26), comp(z, 27, 30), 'a long pontoon links both shores');
});

test('guest piers link components on the same water and not across separate water', () => {
  const z = world(); twoShores(z);
  const A = comp(z, 27, 30), W = comp(z, 8, 27), rt = z.Sim._rt();
  assert.notEqual(A, W);
  assert.equal(z.Boats.canReachComp(A, W), true);
  assert.equal(z.Boats.canReachComp(W, A), true);
  assert.equal(rt.reachComp[W], 1, 'the far shore counts as connected to the park');
  lay(z, row(49, 50, 26)); lay(z, [[50, 27], [50, 28]]);
  assert.ok(z.Sim.placeObject('guest_pier', 49, 24, 0).ok);   // lake B east shore
  const B = comp(z, 50, 28);
  assert.equal(z.Boats.canReachComp(A, B), false);
  assert.equal(z.Boats.canReachComp(B, W), false);
  assert.notEqual(rt.reachComp[B], 1);
});

test('piers need a shore and an entrance path', () => {
  const z = world();
  assert.match(z.Sim.placeObject('guest_pier', 8, 24, 0).msg, /path/);
  lay(z, row(30, 31, 38));
  assert.match(z.Sim.placeObject('guest_pier', 30, 36, 0).msg, /touch open water/);
  lay(z, row(8, 9, 26));
  assert.equal(z.Sim.placeObject('guest_pier', 8, 24, 0).ok, true);
});

test('a guest with no walking route takes the boat, pays the fare and arrives at the far pier', () => {
  const z = world(); twoShores(z);
  const S = z.state, W = comp(z, 8, 27), pier = S.objects.find(o => o.type === 'guest_pier' && o.i === 21);
  assert.equal(pier.fare === undefined ? z.DATA.boats.fare : pier.fare, 6);
  const g = guestAt(z, 27, 30), money = g.money;
  const spot = 8 + 28 * z.N, f = z.Sim._rt().fields;
  assert.equal(z.Boats.shortcut(g, spot, { id: 999 }, null), true);
  assert.equal(g.gid, pier.id);
  let aboard = false;
  for (let n = 0; n < 600 && !aboard; n++) { z.Sim._step(0.25); aboard = g.state === 'boat'; }
  assert.ok(aboard, 'guest boards at the pier');
  assert.equal(g.money, money - 6);
  assert.equal(S.boats.stats.income, 6);
  assert.equal(S.boats.stats.riders, 1);
  assert.equal(pier.minc, 6);
  assert.equal(z.Boats.trips().length, 1);
  step(z, 40);
  assert.notEqual(g.state, 'boat');
  assert.equal(z.Sim._rt().comp[g.ti], W, 'the guest stepped off on the far shore');
});

test('a free pier charges nothing and guests refuse an unaffordable fare', () => {
  const z = world(); twoShores(z);
  const S = z.state, pier = S.objects.find(o => o.type === 'guest_pier' && o.i === 21), spot = 8 + 28 * z.N;
  z.Boats.setFree(pier.id, true);
  let g = guestAt(z, 27, 30);
  assert.equal(z.Boats.shortcut(g, spot, { id: 999 }, null), true);
  for (let n = 0; n < 600 && g.state !== 'boat'; n++) z.Sim._step(0.25);
  assert.equal(S.boats.stats.income, 0);
  assert.equal(S.boats.stats.riders, 1);
  z.Boats.setFree(pier.id, false); z.Boats.setFare(pier.id, 25);
  g = guestAt(z, 27, 30); g.money = 10;
  assert.equal(z.Boats.shortcut(g, spot, { id: 999 }, null), false);
});

test('guests never use a service pier, but staff do', () => {
  const z = world();
  lay(z, row(8, 9, 26)); lay(z, [[8, 27], [8, 28]]);
  assert.ok(z.Sim.placeObject('service_pier', 21, 24, 0).ok);
  assert.ok(z.Sim.placeObject('service_pier', 8, 24, 0).ok);
  const A = comp(z, 27, 30), W = comp(z, 8, 27), S = z.state;
  assert.equal(z.Boats.canReachComp(A, W), false);
  assert.notEqual(z.Sim._rt().reachComp[W], 1);
  const g = guestAt(z, 27, 30);
  assert.equal(z.Boats.shortcut(g, 8 + 28 * z.N, { id: 999 }, null), false);
  assert.ok(z.Boats.staffComps(A)[W], 'staff reach the far shore');
  S.dirt.fill(0); S.dirt[8 + 28 * z.N] = 200;
  assert.ok(z.Sim.hireStaff('cleaner').ok);
  step(z, 120);
  assert.equal(S.dirt[8 + 28 * z.N], 0, 'the cleaner crossed the water and swept the far shore');
  assert.ok(S.boats.stats.staffTrips >= 1);
});

test('staff cannot cross without a link', () => {
  const z = world(); lay(z, row(8, 9, 26)); lay(z, [[8, 27], [8, 28]]);
  z.state.dirt.fill(0); z.state.dirt[8 + 28 * z.N] = 200;
  assert.ok(z.Sim.hireStaff('cleaner').ok);
  step(z, 60);
  assert.equal(z.state.dirt[8 + 28 * z.N], 200);
});

test('any two staff helipads link their paths for staff, over land', () => {
  const z = world(), S = z.state;
  lay(z, row(38, 40, 36)); lay(z, row(38, 40, 37));
  assert.ok(z.Sim.placeObject('staff_helipad', 28, 29, 3).ok, 'pad beside the main path');
  assert.ok(z.Sim.placeObject('staff_helipad', 41, 35, 3).ok, 'pad beside the island path');
  const A = comp(z, 27, 30), I = comp(z, 38, 36);
  assert.notEqual(A, I);
  assert.equal(z.Boats.canReachComp(A, I), false, 'guests never fly');
  assert.ok(z.Boats.staffComps(A)[I]);
  S.dirt.fill(0); S.dirt[39 + 37 * z.N] = 200;
  assert.ok(z.Sim.hireStaff('cleaner').ok);
  step(z, 120);
  assert.equal(S.dirt[39 + 37 * z.N], 0);
});

test('a VIP helipad flies in VIP guests who pay an arrival fee, and flies them out', () => {
  const z = world(), S = z.state;
  lay(z, row(28, 34, 36));
  assert.equal(z.Sim.placeObject('vip_helipad', 30, 31, 0).ok, true);
  const cash = S.money;
  S.boats.vipT = 0;
  step(z, 30);
  const vips = S.guests.filter(g => g.vip);
  assert.ok(vips.length >= 1, 'a VIP arrived');
  assert.ok(S.boats.stats.vip >= vips.length);
  assert.equal(S.boats.stats.vipIncome, S.boats.stats.vip * z.DATA.boats.vip.fee);
  assert.ok(S.money > cash, 'the arrival fee is income');
  assert.ok(vips[0].money > 40, 'VIPs carry far more money');
  const v = vips[0];
  z.Sim._rt().escaped.length = 0;
  v.stay = 0; z.monoCtx.startLeaving(v);
  step(z, 90);
  assert.equal(S.guests.includes(v), false, 'the VIP left by helicopter');
});

test('boats state survives save/load and old saves load with defaults', () => {
  const z = world(); twoShores(z);
  const g = guestAt(z, 27, 30);
  z.Boats.shortcut(g, 8 + 28 * z.N, { id: 999 }, null);
  for (let n = 0; n < 600 && g.state !== 'boat'; n++) z.Sim._step(0.25);
  assert.equal(g.state, 'boat');
  const saved = z.Sim.save(), data = JSON.parse(saved);
  assert.equal(data.s.boats.stats.income, 6);
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.state.boats.stats.income, 6);
  assert.equal(z.state.guests.some(x => x.state === 'boat'), false, 'nobody is left aboard after a load');
  assert.equal(z.Boats.pierInfo(z.state.objects.find(o => o.type === 'guest_pier').id).linked, 1);
  assert.equal(z.Boats.canReachComp(comp(z, 27, 30), comp(z, 8, 27)), true);
  delete data.s.boats;
  assert.equal(z.Sim.load(JSON.stringify(data)), true);
  assert.equal(z.state.boats.stats.riders, 0);
  assert.equal(z.state.boats.vipT > 0, true);
  assert.equal(z.Boats.canReachComp(comp(z, 27, 30), comp(z, 8, 27)), true);
});
