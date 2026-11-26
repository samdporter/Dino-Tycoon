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

test('multiple guests queue and board a single big ferry that waits at the pier before departing', () => {
  const z = world(); twoShores(z);
  const S = z.state, W = comp(z, 8, 27), spot = 8 + 28 * z.N;
  const ferries = z.Boats.vessels().filter(v => v.kind === 'ferry');
  assert.equal(ferries.length, 1, 'one default ferry per water body');
  assert.equal(ferries[0].state, 'wait');
  const guests = [];
  for (let k = 0; k < 5; k++) {
    const g = guestAt(z, 22, 26);
    assert.equal(z.Boats.shortcut(g, spot, { id: 999 }, null), true);
    guests.push(g);
  }
  for (let n = 0; n < 40 && !guests.every(g => g.state === 'boat'); n++) z.Sim._step(0.25);
  assert.ok(guests.every(g => g.state === 'boat'), 'all 5 guests boarded the ferry');
  assert.equal(z.Boats.trips().length, 1, 'all guests share one ferry trip, not 5 individual boats');
  assert.equal(ferries[0].pax.length, 5);
  assert.equal(ferries[0].state, 'wait', 'ferry waits at the pier for ferryDwell before departing');
  const coords = new Set(guests.map(g => `${g.x.toFixed(2)},${g.z.toFixed(2)}`));
  assert.equal(coords.size, 5, 'passengers sit at distinct deck seats');
  step(z, 30);
  assert.ok(guests.every(g => g.state !== 'boat' && z.Sim._rt().comp[g.ti] === W), 'all 5 guests arrived on the far shore');
  assert.equal(S.boats.stats.riders, 5);
});

test('setFerries adds and trims ferries up to ferryMax and survives save/load', () => {
  const z = world(); twoShores(z);
  const pier = z.state.objects.find(o => o.type === 'guest_pier' && o.i === 21);
  assert.equal(z.Boats.pierInfo(pier.id).ferries, 1);
  assert.equal(z.Boats.setFerries(pier.id, 2).ok, true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, 2);
  assert.equal(z.Boats.pierInfo(pier.id).ferries, 2);
  assert.equal(z.Boats.setFerries(pier.id, 99).ok, true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, z.DATA.boats.ferryMax);
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, z.DATA.boats.ferryMax);
  assert.equal(z.Boats.setFerries(pier.id, 1).ok, true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, 1);
});

test('service piers cap service boats and queue excess waiting staff', () => {
  const z = world();
  lay(z, row(8, 9, 26)); lay(z, [[8, 27], [8, 28]]);
  assert.ok(z.Sim.placeObject('service_pier', 21, 24, 0).ok);
  assert.ok(z.Sim.placeObject('guest_pier', 8, 24, 0).ok);
  const sp = z.state.objects.find(o => o.type === 'service_pier');
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'service').length, 2, '1 service pier gives 2 service boats');
  assert.equal(z.Boats.pierInfo(sp.id).serviceTotal, 2);
  z.state.dirt.fill(0);
  z.state.dirt[8 + 26 * z.N] = 200;
  z.state.dirt[8 + 27 * z.N] = 200;
  z.state.dirt[8 + 28 * z.N] = 200;
  for (let k = 0; k < 3; k++) assert.ok(z.Sim.hireStaff('cleaner').ok);
  let sawWait = false, maxSvc = 0;
  for (let n = 0; n < 240; n++) {
    z.Sim._step(0.25);
    const svcs = z.Boats.vessels().filter(v => v.kind === 'service');
    maxSvc = Math.max(maxSvc, svcs.length);
    if (z.Boats.pierInfo(sp.id).staffWaiting > 0) sawWait = true;
  }
  assert.equal(maxSvc, 2, 'never spawns more than 2 service boats for 1 service pier');
  assert.ok(sawWait, 'the 3rd staff member waited while both service boats were busy');
  step(z, 80);
  assert.equal(z.state.dirt[8 + 28 * z.N], 0, 'waiting staff crossed once a service boat returned');
  assert.equal(z.state.dirt[8 + 26 * z.N], 0);
  assert.equal(z.state.dirt[8 + 27 * z.N], 0);

  // Adding 3 more service piers (4 total) caps at serviceMaxPerBody (6, not 8)
  lay(z, [[21, 30], [22, 30]]);
  assert.ok(z.Sim.placeObject('service_pier', 21, 28, 0).ok);
  lay(z, [[8, 22], [8, 23]]);
  assert.ok(z.Sim.placeObject('service_pier', 8, 20, 0).ok);
  lay(z, [[14, 17], [15, 17]]);
  assert.ok(z.Sim.placeObject('service_pier', 14, 18, 2).ok);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'service').length, z.DATA.boats.serviceMaxPerBody);
});

test('demolishing a pier cleans up queuing and aboard guests without stranding anyone', () => {
  const z = world(); twoShores(z);
  const spot = 8 + 28 * z.N;
  const g1 = guestAt(z, 22, 26), g2 = guestAt(z, 22, 26);
  z.Boats.shortcut(g1, spot, { id: 999 }, null);
  z.Boats.shortcut(g2, spot, { id: 999 }, null);
  for (let n = 0; n < 60 && g1.state !== 'boat'; n++) z.Sim._step(0.25);
  assert.equal(g1.state, 'boat');
  assert.equal(z.Sim.bulldoze(8, 24).ok, true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, 0);
  for (const g of [g1, g2]) {
    assert.notEqual(g.state, 'boat');
    assert.notEqual(g.state, 'queue');
    assert.equal(g.absY, null);
    assert.ok(z.state.path[g.ti] > 0, 'guest landed safely on a path tile');
  }
});

test('unrelated edits do not wipe an active ferry mid-crossing', () => {
  const z = world(); twoShores(z);
  const g = guestAt(z, 22, 26), spot = 8 + 28 * z.N, W = comp(z, 8, 27);
  z.Boats.shortcut(g, spot, { id: 999 }, null);
  for (let n = 0; n < 80; n++) {
    z.Sim._step(0.25);
    if (g.state === 'boat' && z.Boats.vessels()[0].state === 'sail') break;
  }
  assert.equal(z.Boats.vessels()[0].state, 'sail');
  assert.equal(z.Sim.placePath(28, 30, 'paved').ok, true);
  assert.equal(g.state, 'boat', 'guest remains aboard the sailing ferry after unrelated path edit');
  assert.equal(z.Boats.vessels()[0].state, 'sail');
  step(z, 35);
  assert.notEqual(g.state, 'boat');
  assert.equal(z.Sim._rt().comp[g.ti], W, 'ferry still finishes crossing to the far shore');
});

test('large_guest_pier upgrades water body ferries to 48-cap double-deck, max 6, and survives save/load', () => {
  const z = world(); twoShores(z);
  const stdEast = z.state.objects.find(o => o.type === 'guest_pier' && o.i === 21);
  assert.equal(z.Boats.pierInfo(stdEast.id).ferryCap, 16);
  assert.equal(z.Boats.pierInfo(stdEast.id).ferryMax, 4);
  assert.equal(z.Boats.pierInfo(stdEast.id).largeBody, false);
  assert.equal(z.Boats.pierInfo(stdEast.id).isLargePier, false);

  // Place a 3x3 Large Ferry Terminal on the same water body (east shore at 21,27 rot=2 touches path at 22..23,26 and water at i=20)
  const res = z.Sim.placeObject('large_guest_pier', 21, 27, 2);
  assert.equal(res.ok, true, res.msg);
  const largePier = z.state.objects.find(o => o.type === 'large_guest_pier');
  const piLarge = z.Boats.pierInfo(largePier.id);
  const piStd = z.Boats.pierInfo(stdEast.id);
  assert.equal(piLarge.isLargePier, true);
  assert.equal(piLarge.largeBody, true);
  assert.equal(piLarge.ferryCap, 48);
  assert.equal(piLarge.ferryMax, 6);
  assert.equal(piStd.isLargePier, false);
  assert.equal(piStd.largeBody, true);
  assert.equal(piStd.ferryCap, 48);
  assert.equal(piStd.ferryMax, 6);

  // Existing ferry upgraded in place
  let ferries = z.Boats.vessels().filter(v => v.kind === 'ferry');
  assert.equal(ferries.length, 1);
  assert.equal(ferries[0].large, true);
  assert.equal(ferries[0].cap, 48);

  // Board 24 guests onto the single double-deck ferry and verify lower & upper deck seats
  const W = comp(z, 8, 27), spot = 8 + 28 * z.N;
  const guests = [];
  for (let k = 0; k < 24; k++) {
    const g = guestAt(z, 22, 26);
    assert.equal(z.Boats.shortcut(g, spot, { id: 999 }, null), true);
    guests.push(g);
  }
  for (let n = 0; n < 40 && !guests.every(g => g.state === 'boat'); n++) z.Sim._step(0.25);
  assert.ok(guests.every(g => g.state === 'boat'), 'all 24 guests boarded a single double-deck ferry');
  assert.equal(ferries[0].pax.length, 24);
  const heights = new Set(guests.map(g => Number(g.absY.toFixed(2))));
  assert.ok(heights.has(0.35) && heights.has(1.45), 'riders occupy both lower (0.35) and upper (1.45) decks');
  const coords = new Set(guests.map(g => `${g.x.toFixed(2)},${g.z.toFixed(2)},${g.absY.toFixed(2)}`));
  assert.equal(coords.size, 24, 'all 24 passengers sit in distinct 3D positions');

  step(z, 30);
  assert.ok(guests.every(g => g.state !== 'boat' && z.Sim._rt().comp[g.ti] === W), 'all 24 guests arrived on far shore');

  // setFerries allows up to 6 and survives save/load
  assert.equal(z.Boats.setFerries(largePier.id, 6).ok, true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, 6);
  assert.equal(z.Boats.pierInfo(largePier.id).totalCapacity, 6 * 48);
  assert.equal(z.Boats.setFerries(largePier.id, 99).ok, true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, 6);
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, 6);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry')[0].cap, 48);
});

test('demolishing the last large_guest_pier downgrades ferries back to 16 cap / 4 max without stranding guests', () => {
  const z = world(); twoShores(z);
  assert.ok(z.Sim.placeObject('large_guest_pier', 21, 27, 2).ok);
  const largePier = z.state.objects.find(o => o.type === 'large_guest_pier');
  const stdEast = z.state.objects.find(o => o.type === 'guest_pier' && o.i === 21);
  assert.equal(z.Boats.setFerries(largePier.id, 6).ok, true);
  assert.equal(z.Boats.vessels().filter(v => v.kind === 'ferry').length, 6);

  // Put guests aboard a ferry sailing between the standard piers or tied to largePier
  const spot = 8 + 28 * z.N;
  const guests = [];
  for (let k = 0; k < 20; k++) {
    const g = guestAt(z, 22, 26);
    assert.equal(z.Boats.shortcut(g, spot, { id: 999 }, null), true);
    guests.push(g);
  }
  for (let n = 0; n < 40 && guests.filter(g => g.state === 'boat').length < 20; n++) z.Sim._step(0.25);
  assert.ok(guests.some(g => g.state === 'boat'), 'guests boarded before demolition');

  // Demolish the only large_guest_pier
  assert.equal(z.Sim.bulldoze(21, 27).ok, true);
  const ferries = z.Boats.vessels().filter(v => v.kind === 'ferry');
  assert.ok(ferries.length <= 4 && ferries.length >= 1, 'fleet clamped down to max 4');
  assert.equal(ferries.length, 4, '6 ferries clamped to standard max 4');
  assert.ok(ferries.every(f => !f.large && f.cap === 16), 'all remaining ferries downgraded to 16-cap standard');
  const piStd = z.Boats.pierInfo(stdEast.id);
  assert.equal(piStd.largeBody, false);
  assert.equal(piStd.ferryCap, 16);
  assert.equal(piStd.ferryMax, 4);
  assert.equal(piStd.totalCapacity, 4 * 16);

  // Check nobody was stranded off a path and remaining aboard pax are <= 16 on lower deck
  for (const f of ferries) {
    assert.ok(f.pax.length <= 16);
    for (const p of f.pax) assert.equal(p.e.absY, 0.35);
  }
  for (const g of guests) {
    if (g.state !== 'boat' && g.state !== 'queue') {
      assert.equal(g.absY, null);
      assert.ok(z.state.path[g.ti] > 0, 'disembarked guest landed on a valid path tile');
    }
  }
  step(z, 40);
  for (const g of guests) {
    assert.notEqual(g.state, 'boat');
    assert.ok(z.state.path[g.ti] > 0, 'all guests safely on paths after crossing');
  }
});
