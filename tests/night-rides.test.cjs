// Regression tests for night / closed-park shutdown of coasters, monorail, and boats across Dino Tycoon and Zoo Tycoon.
// Run with: node --test tests/night-rides.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');

function dinoGame(boats = false) {
  const ctx = vm.createContext({
    console,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  for (const f of simulationScripts(false, boats)) {
    vm.runInContext(readScript(f, false), ctx, { filename: f });
  }
  return ctx.Z;
}

function zooGame(boats = false) {
  const ctx = vm.createContext({
    console,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  vm.runInContext('var window=globalThis', ctx);
  for (const f of simulationScripts(true, boats)) {
    vm.runInContext(readScript(f, true), ctx, { filename: f });
  }
  return ctx.Z;
}

function clearFlatArea(z, i0, j0, i1, j1) {
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const t = tidx(i, j);
      z.state.terrain[t] = 0;
      z.state.path[t] = 0;
      if (z.state.ditch) z.state.ditch[t] = 0;
      const oid = z.state.tileObj[t];
      if (oid) {
        const o = z.state.objects.find(x => x.id === oid);
        if (o) z.Sim.bulldoze(o.i, o.j);
      }
      z.state.elev[i + j * (N + 1)] = 0;
      z.state.elev[(i + 1) + j * (N + 1)] = 0;
      z.state.elev[i + (j + 1) * (N + 1)] = 0;
      z.state.elev[(i + 1) + (j + 1) * (N + 1)] = 0;
    }
  }
}

function buildCoasterLoop(z) {
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 16, 28, 32, 42);
  const stRes = z.Sim.placeObject('coaster_steel', 20, 35, 0);
  assert.equal(stRes.ok, true, stRes.msg);
  const loopRoute = [
    tidx(23, 35), tidx(24, 35), tidx(25, 35),
    tidx(25, 34), tidx(25, 33), tidx(25, 32), tidx(25, 31),
    tidx(24, 31), tidx(23, 31), tidx(22, 31), tidx(21, 31), tidx(20, 31), tidx(19, 31), tidx(18, 31),
    tidx(18, 32), tidx(18, 33), tidx(18, 34), tidx(18, 35),
    tidx(19, 35), tidx(20, 35)
  ];
  const trRes = z.Coaster.buildTrack(loopRoute);
  assert.equal(trRes.ok, true, trRes.msg);
  assert.equal(trRes.autoSpawned, true);
  return { stId: stRes.id, tid: z.state.coaster.trains[0].id };
}

function assertCoasterNightAndClosedBehavior(z) {
  const { stId, tid } = buildCoasterLoop(z);
  const stObj = z.state.objects.find(o => o.id === stId);
  assert.ok(stObj);
  stObj.condition = 100;

  // 1. At night (S.time = 0.95): train stays parked in 'dwell' and does not dispatch or wear down
  z.state.open = true;
  z.state.time = 0.95;
  assert.equal(z.Sim.isOpenNow(), false);
  for (let k = 0; k < 60; k++) z.Sim._step(0.2);
  let ti = z.Coaster.trainInfo(tid);
  assert.equal(ti.state, 'dwell', 'coaster train must stay in dwell at night');
  assert.equal(ti.speed, 0);
  assert.equal(stObj.condition, 100, 'parked coaster must not wear down at night');

  // 2. Closed during the day (S.open = false, S.time = 0.45): train also stays parked in 'dwell'
  z.state.time = 0.45;
  z.Sim.setOpen(false);
  assert.equal(z.Sim.isOpenNow(), false);
  for (let k = 0; k < 60; k++) z.Sim._step(0.2);
  ti = z.Coaster.trainInfo(tid);
  assert.equal(ti.state, 'dwell', 'coaster train must stay in dwell when park is closed');
  assert.equal(ti.speed, 0);
  assert.equal(stObj.condition, 100, 'parked coaster must not wear down when closed');

  // 3. Reopened during the day (S.open = true, S.time = 0.45): train dispatches normally
  z.Sim.setOpen(true);
  assert.equal(z.Sim.isOpenNow(), true);
  let dispatched = false;
  for (let k = 0; k < 60; k++) {
    z.Sim._step(0.2);
    ti = z.Coaster.trainInfo(tid);
    if (ti.state === 'run' && ti.speed > 0) { dispatched = true; break; }
  }
  assert.equal(dispatched, true, 'coaster train should dispatch normally when reopened during the day');
}

test('Dino Custom Coasters: trains stay parked in dwell at night and when closed, then dispatch during open hours', () => {
  const z = dinoGame(false);
  z.Sim.newGame({ seed: 3001, money: 300000 });
  z.state.unlocked.star = 4;
  assertCoasterNightAndClosedBehavior(z);
});

test('Zoo Custom Coasters: trains stay parked in dwell at night and when closed, then dispatch during open hours', () => {
  const z = zooGame(false);
  z.Sim.newGame({ seed: 3002, money: 300000 });
  z.state.unlocked.star = 4;
  assertCoasterNightAndClosedBehavior(z);
});

test('Dino Monorail: empty trains stay parked at night and reject non-leaving guests, while leaving island guests still exit', () => {
  const z = dinoGame(false);
  z.Sim.newGame({ seed: 3003, map: 'fern_meadow', money: 400000 });
  z.state.unlocked.star = 5;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 14, 14, 34, 39);

  // Mainland path from gate walkway (i=27..28, j=40..55) to mainland station front (20..27, 34)
  for (let j = 34; j <= 40; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 20; i <= 27; i++) z.Sim.placePath(i, 34, 'paved');

  // Disconnected island path at j=18..20, i=20..24
  for (let i = 20; i <= 24; i++) z.Sim.placePath(i, 18, 'paved');

  const stMain = z.Sim.placeObject('monorail_station', 20, 32, 0);
  const stIsl = z.Sim.placeObject('monorail_station', 20, 16, 0);
  assert.equal(stMain.ok && stIsl.ok, true);
  assert.equal(z.Sim.placeObject('diesel_gen', 16, 32, 0).ok, true);
  assert.equal(z.Sim.placeObject('substation', 18, 32, 0).ok, true);
  assert.equal(z.Sim.placeObject('diesel_gen', 16, 16, 0).ok, true);
  assert.equal(z.Sim.placeObject('substation', 18, 16, 0).ok, true);

  const route = [];
  for (let i = 23; i <= 30; i++) route.push(tidx(i, 32));
  for (let j = 31; j >= 16; j--) route.push(tidx(30, j));
  for (let i = 29; i >= 23; i--) route.push(tidx(i, 16));
  assert.equal(z.Sim.monorail.buildTrack(route).ok, true);
  assert.equal(z.Sim.monorail.setFree(stMain.id, true).ok, true);
  const buy = z.Sim.monorail.buyTrain(stMain.id, 2);
  assert.equal(buy.ok, true);

  const train = z.state.mono.trains[0];
  assert.equal(train.st, 'dwell');

  // At night: empty train remains parked in 'dwell' and does not dispatch
  z.state.open = true;
  z.state.time = 0.95;
  assert.equal(z.Sim.isOpenNow(), false);
  for (let k = 0; k < 80; k++) z.Sim._step(0.2);
  assert.equal(train.st, 'dwell', 'empty monorail train must stay parked in dwell at night');
  assert.equal(train.v, 0);

  // Non-leaving guest cannot choose, shortcut, or board at night
  const gStay = z.monoCtx.spawnGuest(1, false);
  const mainFront = tidx(21, 34);
  gStay.ti = mainFront; gStay.ni = -1;
  gStay.x = (21 + 0.5) * z.TILE; gStay.z = (34 + 0.5) * z.TILE;
  gStay.stay = 999; gStay.state = 'walk'; gStay.money = 100;
  assert.equal(z.Sim.monorail.choose(gStay), false, 'non-leaving guest cannot choose monorail at night');
  assert.equal(z.Sim.monorail.shortcut(gStay, tidx(21, 18), { id: 999 }, null), false, 'non-leaving guest cannot plan monorail shortcut at night');
  const stMainObj = z.state.objects.find(o => o.id === stMain.id);
  z.Sim.monorail.arrive(gStay, stMainObj);
  assert.notEqual(gStay.state, 'queue', 'non-leaving guest must not queue/board at night');

  // Leaving guest on the island after closing (S.time = 0.85, still closed/!isOpenNow, before late-night straggler purge)
  // still plans, boards, rides to mainland, and exits while non-leaving guests remain barred
  z.state.time = 0.85;
  assert.equal(z.Sim.isOpenNow(), false);
  assert.equal(z.Sim.monorail.choose(gStay), false, 'non-leaving guest still cannot choose monorail after closing');
  const gLeave = z.monoCtx.spawnGuest(1, false);
  const islFront = tidx(21, 18);
  gLeave.ti = islFront; gLeave.ni = -1;
  gLeave.x = (21 + 0.5) * z.TILE; gLeave.z = (18 + 0.5) * z.TILE;
  gLeave.stay = -1; gLeave.state = 'walk'; gLeave.money = 100;
  assert.equal(z.Sim.monorail.leaveVia(gLeave), true, 'leaving guest on island can still take monorail after closing');

  const leftBefore = z.state.stats.guestsLeft || 0;
  let boarded = false, dispatched = false, exited = false;
  for (let k = 0; k < 700; k++) {
    z.Sim._step(0.1);
    if (gLeave.state === 'ride') boarded = true;
    if (train.st === 'run') dispatched = true;
    if (!z.state.guests.includes(gLeave)) { exited = true; break; }
  }
  assert.equal(z.Sim.isOpenNow(), false, 'park remained closed throughout');
  assert.ok(z.state.time < z.monoCtx.CLOSE_T + 0.08, 'guest exited via gate before late-night straggler sweep');
  assert.equal(boarded, true, 'leaving island guest boarded monorail while closed');
  assert.equal(dispatched, true, 'monorail dispatched to carry leaving guest while closed');
  assert.equal(exited, true, 'leaving island guest was delivered to mainland and exited');
  assert.ok((z.state.stats.guestsLeft || 0) > leftBefore);

  // Once delivered and empty again at night (S.time = 0.95), train settles back into dwell and stays parked
  z.state.time = 0.95;
  for (let k = 0; k < 120; k++) z.Sim._step(0.2);
  assert.equal(train.st, 'dwell', 'now-empty monorail train parks again at night');
  assert.equal(train.v, 0);
});

function dinoBoatWorld() {
  const z = dinoGame(true), N = z.N;
  z.Sim.newGame({ seed: 3004, difficulty: 'easy' });
  const S = z.state, water = z.DATA.terrain.findIndex(t => t.id === 'water');
  S.objects.length = 0; S.tileObj.fill(0); S.terrain.fill(0); S.elev.fill(0);
  S.map = { id: 'fern_meadow', i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
  for (let j = 20; j <= 30; j++) for (let i = 10; i <= 20; i++) S.terrain[i + j * N] = water;
  S.money = 400000; S.unlocked.star = 5; S.open = true; S.time = 0.95; S.ticketPrice = 0;
  assert.equal(z.Sim.load(z.Sim.save()), true);
  for (let j = 26; j <= 39; j++) assert.ok(z.Sim.placePath(27, j, 'paved').ok);
  for (let i = 22; i <= 26; i++) assert.ok(z.Sim.placePath(i, 26, 'paved').ok);
  for (let i = 8; i <= 9; i++) assert.ok(z.Sim.placePath(i, 26, 'paved').ok);
  assert.ok(z.Sim.placePath(8, 27, 'paved').ok);
  assert.ok(z.Sim.placePath(8, 28, 'paved').ok);
  return z;
}

test('Dino Boats: non-leaving guests cannot plan or board ferries at night, while staff still cross via guest and service piers', () => {
  // Part A & B: guest piers at night
  const z = dinoBoatWorld();
  const S = z.state, N = z.N;
  assert.ok(z.Sim.placeObject('guest_pier', 21, 24, 0).ok);
  assert.ok(z.Sim.placeObject('guest_pier', 8, 24, 0).ok);
  const westPier = S.objects.find(o => o.type === 'guest_pier' && o.i === 21);

  S.time = 0.95;
  assert.equal(z.Sim.isOpenNow(), false);
  const g = z.monoCtx.spawnGuest(1, false);
  const startT = 27 + 30 * N, spot = 8 + 28 * N;
  g.x = 27.5 * z.TILE; g.z = 30.5 * z.TILE; g.ti = startT; g.ni = -1;
  g.money = 100; g.tol = 2; g.stay = 999; g.state = 'walk'; g.gt = ''; g.dk = '';

  assert.equal(z.Boats.shortcut(g, spot, { id: 999 }, null), false, 'non-leaving guest cannot plan ferry shortcut at night');
  z.Boats.arrive(g, westPier);
  assert.notEqual(g.state, 'queue', 'non-leaving guest cannot queue/board at night');
  for (let k = 0; k < 40; k++) z.Sim._step(0.25);
  const ferries = z.Boats.vessels().filter(v => v.kind === 'ferry');
  assert.equal(ferries.every(f => f.state === 'wait'), true, 'ferries remain docked with no leaving guests or staff');
  assert.equal(S.boats.stats.riders, 0);

  // Staff crossing via guest_pier at night
  S.dirt.fill(0);
  S.dirt[spot] = 200;
  assert.ok(z.Sim.hireStaff('cleaner').ok);
  for (let k = 0; k < 480 && S.dirt[spot] > 0; k++) z.Sim._step(0.25);
  assert.equal(z.Sim.isOpenNow(), false, 'park remained night during staff ferry crossing');
  assert.equal(S.dirt[spot], 0, 'cleaner crossed via guest pier ferry at night and swept far shore');
  assert.ok(S.boats.stats.staffTrips >= 1);

  // Part C: service piers at night
  const z2 = dinoBoatWorld();
  const S2 = z2.state;
  assert.ok(z2.Sim.placeObject('service_pier', 21, 24, 0).ok);
  assert.ok(z2.Sim.placeObject('service_pier', 8, 24, 0).ok);
  S2.time = 0.95;
  S2.dirt.fill(0);
  S2.dirt[spot] = 200;
  assert.ok(z2.Sim.hireStaff('cleaner').ok);
  for (let k = 0; k < 480 && S2.dirt[spot] > 0; k++) z2.Sim._step(0.25);
  assert.equal(z2.Sim.isOpenNow(), false, 'park remained night during service boat crossing');
  assert.equal(S2.dirt[spot], 0, 'cleaner crossed via service pier at night and swept far shore');
  assert.ok(S2.boats.stats.staffTrips >= 1);
});

function zooBoatSetup() {
  const z = zooGame(true);
  z.Sim.newGame(1, { money: 1000000 });
  const S = z.state, N = z.N, D = z.DATA;
  S.unlocked.star = 4;
  const land = D.terrain.findIndex(t => t.id === 'grass');
  const water = D.terrain.findIndex(t => t.id === 'water');
  S.objects.length = 0;
  for (let j = 30; j < 52; j++) for (let i = 10; i < 54; i++) {
    const t = i + j * N;
    S.terrain[t] = (i >= 38 && i <= 42) ? water : land;
    S.path[t] = 0; S.dirt[t] = 0;
  }
  for (let j = 30; j <= 53; j++) for (let i = 10; i <= 54; i++) S.elev[i + j * (N + 1)] = 0;
  const lay = (i0, i1, j) => { for (let i = i0; i <= i1; i++) z.Sim.placePath(i, j, 'paved'); };
  for (let j = 40; j < 52; j++) lay(27, 28, j);
  lay(27, 37, 42);
  lay(43, 50, 42);
  return { z, S, N, tile: (i, j) => i + j * N };
}

test('Zoo Boats: non-leaving guests cannot plan or board ferries at night, while staff still cross via guest and service piers', () => {
  // Part A & B: guest piers at night
  const h = zooBoatSetup(), { z, S } = h;
  const west = z.Sim.placeObject('guest_pier', 36, 40, 0);
  const east = z.Sim.placeObject('guest_pier', 43, 40, 0);
  assert.equal(west.ok && east.ok, true);

  const startTile = h.tile(30, 42), targetTile = h.tile(47, 42), eastTile = h.tile(45, 42);
  const g = {
    id: 9101, name: 'Night Guest', seed: 1,
    x: 30.5 * z.TILE, z: 42.5 * z.TILE, heading: 0, speed: 0, state: 'walk',
    hunger: 10, thirst: 10, bladder: 10, energy: 90, happiness: 70, money: 80,
    thought: '', thoughtT: 0, seen: {}, seenEnc: {}, seenB: {}, group: 9101,
    ti: startTile, ni: -1, px: 30.5 * z.TILE, pz: 42.5 * z.TILE, lo: 0, lo2: 0, bs: 3,
    gt: '', gid: 0, dk: '', wt: 0, nt: 0.5, acc: 0, tcool: 0, fun: 40, mood: 0,
    lit: false, stay: 1e5, stay0: 1e5, pv: 0, tol: 1.6, thor: 0.8,
    al: { meal: 0, drink: 0, treat: 0, shop: 0, act: 0 }, nbuy: 1e5
  };
  S.guests.push(g);
  z.Sim._rt().gById.set(g.id, g);

  // Plan while daytime, then switch to night before boarding -> board() refuses non-leaving guest
  S.time = 0.5;
  const dayPlan = z.Boats.plan(g, 't' + targetTile);
  assert.ok(dayPlan);
  z.Boats.start(g, dayPlan);

  S.time = 0.95;
  assert.equal(z.Sim.isOpenNow(), false);
  assert.equal(z.Boats.plan(g, 't' + targetTile), null, 'non-leaving guest cannot plan a ferry trip at night');
  z.Boats.board(g);
  assert.notEqual(g.state, 'queue', 'non-leaving guest cannot board a ferry at night');
  assert.equal(g.pend, null);
  for (let k = 0; k < 60; k++) z.Sim._step(0.1);
  assert.equal(S.boats.trips, 0, 'ferry must not run trips for non-leaving guests at night');

  // Staff crossing via guest_pier at night
  S.time = 0.95;
  S.dirt[eastTile] = 200;
  assert.equal(z.Sim.hireStaff('cleaner', 30, 42).ok, true);
  for (let k = 0; k < 400 && S.dirt[eastTile] >= 40; k++) z.Sim._step(0.1);
  assert.equal(z.Sim.isOpenNow(), false, 'park remained night during staff ferry crossing');
  assert.ok(S.dirt[eastTile] < 40, 'cleaner crossed via guest pier ferry at night and swept east shore');

  // Part C: service piers at night
  const h2 = zooBoatSetup(), { z: z2, S: S2 } = h2;
  assert.equal(z2.Sim.placeObject('service_pier', 37, 40, 0).ok, true);
  assert.equal(z2.Sim.placeObject('service_pier', 43, 40, 0).ok, true);
  const eastTile2 = h2.tile(45, 42);
  S2.time = 0.95;
  S2.dirt[eastTile2] = 200;
  assert.equal(z2.Sim.hireStaff('cleaner', 30, 42).ok, true);
  for (let k = 0; k < 400 && S2.dirt[eastTile2] >= 40; k++) z2.Sim._step(0.1);
  assert.equal(z2.Sim.isOpenNow(), false, 'park remained night during service boat crossing');
  assert.ok(S2.dirt[eastTile2] < 40, 'cleaner crossed via service pier at night and swept east shore');
});
