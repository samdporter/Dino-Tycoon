// Run with: node --test tests/day-pace.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');

function loadGame(zoo = false, boats = false) {
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URL: globalThis.URL || {},
    Blob: globalThis.Blob || {},
    FileReader: globalThis.FileReader || {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: 'http:' },
    performance: { now: () => 0 },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  for (const f of simulationScripts(zoo, boats)) {
    vm.runInContext(readScript(f, zoo), ctx, { filename: f });
  }
  return ctx.Z;
}

function clearFlatArea(z, i0, j0, i1, j1) {
  const N = z.N;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const t = i + j * N;
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

test('Dino DAY_SECONDS is 900 and Zoo DAY_SECONDS is 150, exposed on contexts', () => {
  const dino = loadGame(false, true);
  dino.Sim.newGame({ seed: 101, map: 'fern_meadow' });
  assert.equal(dino.Sim.DAY_SECONDS, 900);
  assert.equal(dino.monoCtx.DAY_SECONDS, 900);
  assert.equal(dino.coasterCtx.DAY_SECONDS, 900);
  assert.equal(dino.resortCtx.DAY_SECONDS, 900);

  const zoo = loadGame(true, true);
  zoo.Sim.newGame({ seed: 101, map: 'meadow' });
  assert.equal(zoo.Sim.DAY_SECONDS, 150);
  assert.equal(zoo.boatsCtx.DAY_SECONDS, 150);
  assert.equal(zoo.coasterCtx.DAY_SECONDS, 150);
  assert.equal(zoo.resortCtx.DAY_SECONDS, 150);
});

test('gxWatchdog allows 90+ sim-second long walks with progress while aborting idle guests after 4s', () => {
  const z = loadGame(false, false);
  z.Sim.newGame({ seed: 202, map: 'fern_meadow', difficulty: 'easy', money: 500000 });
  const S = z.state, N = z.N;
  S.objects.length = 0;
  S.tileObj.fill(0);
  S.terrain.fill(0);
  S.elev.fill(0);
  S.path.fill(0);
  S.map = { id: 'fern_meadow', i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
  S.open = true;
  S.time = 0.4;
  assert.equal(z.Sim.load(z.Sim.save()), true);

  // Lay a connected serpentine path (> 110 tiles long) from gate (27, N-1) to a distant stall
  for (let j = N - 1; j >= 10; j--) assert.ok(z.Sim.placePath(27, j, 'paved').ok);
  for (let i = 26; i >= 8; i--) assert.ok(z.Sim.placePath(i, 10, 'paved').ok);
  for (let j = 11; j <= 50; j++) assert.ok(z.Sim.placePath(8, j, 'paved').ok);
  for (let i = 9; i <= 20; i++) assert.ok(z.Sim.placePath(i, 50, 'paved').ok);
  const stall = z.Sim.placeObject('drinks_stall', 20, 48, 0);
  assert.ok(stall.ok, stall.msg);
  assert.ok(z.Sim.placePath(20, 49, 'paved').ok);
  assert.equal(z.Sim.objectReport(stall.id).connected, true);

  // Spawn a guest at the gate heading to the distant stall (~92 sim-seconds walk)
  const walker = z.monoCtx.spawnGuest(1, true);
  walker.bs = 2.8;
  walker.stay = 999;
  walker.money = 100;
  walker.gt = 'bld';
  walker.gid = stall.id;
  walker.dk = 'b' + stall.id;
  walker.gAge = 0;
  walker.idle = 0;
  walker.unr = 0;

  // After 85 sim-seconds (past old 70s limit), guest is still walking with zero watchdog aborts
  for (let k = 0; k < 340; k++) {
    walker.stay = 999;
    z.Sim._step(0.25);
  }
  assert.equal(walker.gt, 'bld', 'long-distance walker should still have goal past 70s');
  assert.equal(walker.unr, 0, 'long-distance walker should have 0 watchdog resets');
  assert.ok(walker.gAge > 75, `expected gAge > 75 while walking, got ${walker.gAge}`);

  // Step another 15 sim-seconds (100s total) so walker arrives and uses the stall
  for (let k = 0; k < 60; k++) {
    walker.stay = 999;
    z.Sim._step(0.25);
  }
  assert.equal(walker.unr, 0, 'long-distance walker should complete walk without watchdog aborts');
  assert.equal(z.Sim.objectReport(stall.id).uses, 1, 'walker should reach and use the distant stall');

  // Now spawn a truly idle guest pinned in place on an isolated path tile
  z.Sim.placePath(5, 5, 'paved');
  const stuck = z.monoCtx.spawnGuest(2, true);
  stuck.ti = 5 + 5 * N;
  stuck.x = (5 + 0.5) * z.TILE;
  stuck.z = (5 + 0.5) * z.TILE;
  stuck.ix = stuck.x;
  stuck.iz = stuck.z;
  stuck.ni = -1;
  stuck.gt = 'bld';
  stuck.gid = stall.id;
  stuck.dk = 'b' + stall.id;
  stuck.idle = 0;
  stuck.gAge = 0;
  stuck.unr = 0;

  for (let k = 0; k < 24; k++) { // 6 sim-seconds (> 4s)
    stuck.stay = 999;
    stuck.x = (5 + 0.5) * z.TILE;
    stuck.z = (5 + 0.5) * z.TILE;
    z.Sim._step(0.25);
  }
  assert.ok(stuck.unr >= 1, 'idle guest should trigger gxWatchdog after > 4s');
});

test('coaster train daily upkeep stays capped at 2.8x in Dino and 1.0x in Zoo', () => {
  for (const isZoo of [false, true]) {
    const z = loadGame(isZoo, false);
    z.Sim.newGame({ seed: 303, map: isZoo ? 'meadow' : 'fern_meadow', difficulty: 'normal', money: 500000 });
    const S = z.state, N = z.N;
    S.unlocked.star = 3;
    S.animals.length = 0;
    S.staff.length = 0;
    S.guests.length = 0;
    S.loans = [];
    S.marketing.active = false;
    clearFlatArea(z, 18, 31, 26, 38);

    for (const o of [...S.objects]) z.Sim.bulldoze(o.i, o.j);
    assert.equal(S.objects.length, 0);

    const station = z.Sim.placeObject('coaster_wooden', 20, 35, 0);
    assert.ok(station.ok, station.msg);
    const t = (i, j) => i + j * N;
    const route = [
      t(23, 35), t(24, 35), t(24, 34), t(24, 33), t(24, 32), t(23, 32),
      t(22, 32), t(21, 32), t(20, 32), t(19, 32), t(19, 33), t(19, 34),
      t(19, 35), t(20, 35)
    ];
    assert.ok(z.Coaster.buildTrack(route).ok);
    const trains = z.Coaster.trainsOnStation(station.id);
    assert.equal(trains.length, 1);

    const td = z.Coaster.TYPES[trains[0].type];
    const line = z.Coaster.lines().find(l => l.station && l.station.obj.id === station.id);
    const circuitUp = line ? Math.min(24, Math.max(0, (line.trackLen || 0) - 14) * 0.6) : 0;
    const baseTrainUpkeep = td.trainUpkeep + trains[0].cars * td.carUpkeep + circuitUp;
    const stationUpkeep = z.DATA.buildings.find(b => b.id === 'coaster_wooden').upkeep || 0;
    const expectedScale = isZoo ? 1.0 : 2.8;
    const expectedTrainUpkeep = Math.round(baseTrainUpkeep * expectedScale);

    // Advance just past midnight to trigger newDay() and verify recorded daily upkeep
    S.time = 1 - (0.5 / z.Sim.DAY_SECONDS);
    z.Sim._step(1.0);
    const lastRec = S.finance.history[S.finance.history.length - 1];
    assert.ok(lastRec, 'midnight rollover should record daily finance history');
    assert.equal(-lastRec.upkeep, stationUpkeep + expectedTrainUpkeep,
      `${isZoo ? 'Zoo' : 'Dino'} train upkeep should use ${expectedScale}x scale`);
  }
});

test('VIP helicopter respawn interval scales with DAY_SECONDS / 420', () => {
  const z = loadGame(false, true);
  z.Sim.newGame({ seed: 5, difficulty: 'easy', money: 400000 });
  let S = z.state;
  const N = z.N;
  S.objects.length = 0; S.tileObj.fill(0); S.terrain.fill(0); S.elev.fill(0); S.path.fill(0);
  S.map = { id: 'fern_meadow', i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
  S.unlocked.star = 5;
  S.open = true;
  S.time = 0.45;
  assert.equal(z.Sim.load(z.Sim.save()), true);
  S = z.state;
  for (let j = 26; j <= N - 1; j++) assert.ok(z.Sim.placePath(27, j, 'paved').ok);
  for (let i = 28; i <= 36; i++) assert.ok(z.Sim.placePath(i, 36, 'paved').ok);
  assert.equal(z.Sim.placeObject('vip_helipad', 30, 31, 0).ok, true);

  const bc = z.DATA.boats.vip;
  const ratingDenom = 0.6 + 0.2 * S.rating;
  const scale = 900 / 420;
  const minExpected = (bc.every[0] / ratingDenom) * scale;
  const maxExpected = (bc.every[1] / ratingDenom) * scale;
  const maxUnscaled = bc.every[1] / ratingDenom;

  const intervals = [];
  for (let k = 0; k < 12; k++) {
    S.boats.vipT = 0;
    z.Sim._step(0.25);
    intervals.push(S.boats.vipT);
    assert.ok(S.boats.vipT >= minExpected && S.boats.vipT <= maxExpected,
      `vipT=${S.boats.vipT} should be in [${minExpected}, ${maxExpected}]`);
  }
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  assert.ok(mean > maxUnscaled, `mean vipT (${mean.toFixed(1)}) should exceed unscaled max (${maxUnscaled.toFixed(1)})`);
});

test('Dino arrivalRate, gxHr, and guest wallets scale cleanly over a simulated day', () => {
  const z = loadGame(false, false);
  z.Sim.newGame({ seed: 404, map: 'fern_meadow', difficulty: 'normal', money: 500000 });
  const S = z.state;

  // gxHr() = DAY_SECONDS / 24 = 37.5
  assert.equal(z.monoCtx.gxHr(), 37.5);

  S.open = true;
  S.time = 8 / 24;
  z.Sim._step(0.25);
  const rate = z.Sim.arrivalRate();
  assert.ok(rate > 0, 'arrivalRate should be positive when park is open');

  let spawned = 0;
  let maxInitialWallet = 0;
  let minInitialWallet = Infinity;
  z.bus.on('guestAdded', g => {
    spawned++;
    if (g.money > maxInitialWallet) maxInitialWallet = g.money;
    if (g.money < minInitialWallet) minInitialWallet = g.money;
  });

  // Simulate open day (08:00 -> 20:00 = 450 sim-seconds at 1x)
  for (let k = 0; k < 900; k++) {
    z.Sim._step(0.5);
  }
  assert.ok(spawned > 0, 'guests should arrive over the simulated day');
  assert.ok(minInitialWallet >= 4, `min initial wallet (${minInitialWallet}) within standard bounds`);
  assert.ok(maxInitialWallet <= 45, `max initial wallet (${maxInitialWallet}) within standard bounds`);
  for (const g of S.guests) {
    assert.ok(g.money >= 0 && g.money <= 45, `active guest wallet ${g.money} should stay within [0, 45]`);
  }
});
