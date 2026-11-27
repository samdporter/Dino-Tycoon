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

test('Dino overnight clock advances 3x faster after exit window and returns to 1x at opening', () => {
  const z = loadGame(false, false);
  z.Sim.newGame({ seed: 505, map: 'fern_meadow', difficulty: 'normal', money: 500000 });
  assert.equal(z.Sim.NIGHT_SPEED, 3);

  const S = z.state;
  const D = z.Sim.DAY_SECONDS;
  const OPEN_T = 8 / 24;
  const CLOSE_T = 20 / 24;
  const dt = 0.5;
  const step1x = dt / D;
  const step3x = (3 * dt) / D;
  const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: got ${a}, expected ${b}`);

  // 1x during open park hours (08:00 - 20:00)
  for (const t of [OPEN_T, 0.5, CLOSE_T - 0.01]) {
    S.time = t;
    z.Sim._step(dt);
    approx(S.time - t, step1x, `open hours at t=${t}`);
  }

  // 1x during evening exit window (CLOSE_T 20:00 to CLOSE_T + 0.08 21:55)
  for (const t of [CLOSE_T, CLOSE_T + 0.04, CLOSE_T + 0.079]) {
    S.time = t;
    z.Sim._step(dt);
    approx(S.time - t, step1x, `evening exit window at t=${t}`);
  }

  // 3x during overnight closed hours (S.time >= CLOSE_T + 0.08 and S.time < OPEN_T)
  for (const t of [CLOSE_T + 0.08, 0.95, 0.0, 0.15, OPEN_T - 0.01]) {
    S.time = t;
    z.Sim._step(dt);
    approx(S.time - t, step3x, `overnight closed hours at t=${t}`);
  }

  // Day rollover (S.time >= 1) stays at 3x until OPEN_T
  const dayBefore = S.day;
  S.time = 1 - (1.5 / D);
  z.Sim._step(1.0); // 3 * 1.0 / D = 3.0 / D -> wraps to 1.5 / D
  assert.equal(S.day, dayBefore + 1, 'midnight rollover increments S.day');
  approx(S.time, 1.5 / D, 'midnight rollover wraps S.time cleanly at 3x');
  const tAfterMidnight = S.time;
  z.Sim._step(dt);
  approx(S.time - tAfterMidnight, step3x, 'post-midnight before OPEN_T stays at 3x');

  // Morning opening (S.time >= OPEN_T) transitions cleanly back to 1x
  S.time = OPEN_T - step3x;
  z.Sim._step(dt); // advances 3x -> reaches OPEN_T
  approx(S.time, OPEN_T, 'step reaches OPEN_T cleanly at 3x');
  z.Sim._step(dt); // now >= OPEN_T -> must advance at 1x
  approx(S.time - OPEN_T, step1x, 'morning opening transitions cleanly back to 1x');
});

test('land dinosaurs walk and run at lively full speed independent of DAY_SECONDS', () => {
  const z = loadGame(false, false);
  z.Sim.newGame({ seed: 606, map: 'fern_meadow', difficulty: 'easy', money: 500000 });
  const S = z.state;
  const N = z.N;
  S.unlocked.star = 5;
  S.time = 0.45;
  clearFlatArea(z, 8, 8, 28, 28);

  // Build two 16x6 fenced paddocks so each species walks freely without interacting
  const buildBox = (i0, j0, i1, j1) => {
    for (let i = i0; i <= i1; i++) {
      assert.ok(z.Sim.placeFence({ axis: 'x', i, j: j0 }, 'reinforced').ok);
      assert.ok(z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, 'reinforced').ok);
    }
    for (let j = j0; j <= j1; j++) {
      assert.ok(z.Sim.placeFence({ axis: 'z', i: i0, j }, 'reinforced').ok);
      assert.ok(z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, 'reinforced').ok);
    }
  };
  buildBox(10, 10, 25, 15);
  buildBox(10, 18, 25, 23);

  for (const [speciesId, spawnJ] of [['triceratops', 12], ['tyrannosaurus', 20]]) {
    const sp = z.DATA.animals.find(s => s.id === speciesId);
    const dino = z.Sim.spawnAnimal(speciesId, 13, spawnJ);
    assert.ok(dino, `spawned ${speciesId}`);
    dino.baby = false;
    dino.injured = false;
    dino.sick = false;
    dino.traits = [];
    dino.hunger = 10;
    dino.thirst = 10;
    dino.energy = 90;
    dino.x = 13.5 * z.TILE;
    dino.z = (spawnJ + 0.5) * z.TILE;
    dino.heading = Math.PI / 2;
    dino.state = 'walk';
    dino.tg = 'wander';
    dino.tx = 23.5 * z.TILE;
    dino.tz = (spawnJ + 0.5) * z.TILE;
    dino.wx = 0; dino.wz = 0; dino.aroute = null; dino.detours = 0; dino.stuck = 0;

    const x0 = dino.x, z0 = dino.z;
    for (let k = 0; k < 20; k++) { // 5 seconds at 1x sim time
      dino.tx = 23.5 * z.TILE;
      dino.tz = (spawnJ + 0.5) * z.TILE;
      dino.state = 'walk';
      z.Sim._step(0.25);
    }
    const distWalk = Math.hypot(dino.x - x0, dino.z - z0);
    assert.ok(dino.speed >= sp.speed * 1.5, `${speciesId} walk speed (${dino.speed.toFixed(2)}) should be >= ${(sp.speed * 1.5).toFixed(2)}`);
    assert.ok(distWalk >= sp.speed * 1.5 * 4.5, `${speciesId} should traverse >= ${(sp.speed * 1.5 * 4.5).toFixed(2)}u in 5s, got ${distWalk.toFixed(2)}u`);

    // Check run speed as well
    dino.x = 13.5 * z.TILE;
    dino.z = (spawnJ + 0.5) * z.TILE;
    dino.state = 'run';
    dino.tx = 23.5 * z.TILE;
    dino.tz = (spawnJ + 0.5) * z.TILE;
    z.Sim._step(0.25);
    assert.ok(dino.speed >= sp.speed * 2.5, `${speciesId} run speed (${dino.speed.toFixed(2)}) should be >= ${(sp.speed * 2.5).toFixed(2)}`);
  }
});

test('marine and flying creatures move at full cruising and flight speeds', () => {
  const z = loadGame(false, false);
  z.Sim.newGame({ seed: 707, map: 'fern_meadow', difficulty: 'easy', money: 500000 });
  const S = z.state;
  const N = z.N;
  S.unlocked.star = 5;
  S.time = 0.45;
  clearFlatArea(z, 6, 6, 36, 36);

  // Sea tank (10x10)
  const tankTiles = [];
  for (let j = 8; j < 18; j++) for (let i = 8; i < 18; i++) tankTiles.push(i + j * N);
  assert.equal(z.Sim.realms.place('tank', 'sea', tankTiles, { lvl: 2, wall: 5 }).ok, true);
  const mosaSp = z.DATA.animals.find(s => s.id === 'mosasaurus');
  const mosa = z.Sim.spawnAnimal('mosasaurus', 10, 13);
  assert.ok(mosa);
  mosa.baby = false;
  mosa.traits = [];
  mosa.x = 10.5 * z.TILE;
  mosa.z = 13.5 * z.TILE;
  mosa.tx = 16.5 * z.TILE;
  mosa.tz = 13.5 * z.TILE;
  mosa.ty = -0.5;
  mosa.y = -0.5;
  mosa.bp = 0;
  mosa.show = 0;
  mosa.tg = 'wander';
  mosa.state = 'swim';

  const mx0 = mosa.x, mz0 = mosa.z;
  for (let k = 0; k < 12; k++) { // 3 seconds
    mosa.tx = 16.5 * z.TILE;
    mosa.tz = 13.5 * z.TILE;
    mosa.state = 'swim';
    mosa.bp = 0;
    z.Sim._step(0.25);
  }
  const distSea = Math.hypot(mosa.x - mx0, mosa.z - mz0);
  assert.ok(mosa.speed >= mosaSp.speed * 1.35, `mosasaurus swim speed (${mosa.speed.toFixed(2)}) should be >= ${(mosaSp.speed * 1.35).toFixed(2)}`);
  assert.ok(distSea >= mosaSp.speed * 1.35 * 2.5, `mosasaurus should swim meaningfully in 3s, moved ${distSea.toFixed(2)}u`);

  // Air dome (16x10)
  const domeTiles = [];
  for (let j = 22; j < 32; j++) for (let i = 8; i < 24; i++) domeTiles.push(i + j * N);
  assert.equal(z.Sim.realms.place('dome', 'air', domeTiles, { lvl: 2, mesh: 3 }).ok, true);
  const pteroSp = z.DATA.animals.find(s => s.id === 'pteranodon');
  const ptero = z.Sim.spawnAnimal('pteranodon', 10, 27);
  assert.ok(ptero);
  ptero.baby = false;
  ptero.traits = [];
  ptero.x = 10.5 * z.TILE;
  ptero.z = 27.5 * z.TILE;
  ptero.y = 2.5;
  ptero.ty = 2.5;
  ptero.cruise = 2.5;
  ptero.tg = 'tour';
  ptero.ft = 5;
  ptero.state = 'fly';
  ptero.tx = 22.5 * z.TILE;
  ptero.tz = 27.5 * z.TILE;

  const px0 = ptero.x, pz0 = ptero.z;
  for (let k = 0; k < 8; k++) { // 2 seconds (~13.4u < 24u span)
    ptero.tx = 22.5 * z.TILE;
    ptero.tz = 27.5 * z.TILE;
    ptero.tg = 'tour';
    ptero.state = 'fly';
    z.Sim._step(0.25);
  }
  const distAir = Math.hypot(ptero.x - px0, ptero.z - pz0);
  assert.ok(ptero.speed >= pteroSp.speed * 2.5, `pteranodon flight speed (${ptero.speed.toFixed(2)}) should be >= ${(pteroSp.speed * 2.5).toFixed(2)}`);
  assert.ok(distAir >= pteroSp.speed * 2.5 * 1.5, `pteranodon should fly meaningfully in 2s, moved ${distAir.toFixed(2)}u`);
});

test('dinosaur daytime energy drain is scaled for 900s days and night sleep recovers fully', () => {
  const z = loadGame(false, false);
  z.Sim.newGame({ seed: 808, map: 'fern_meadow', difficulty: 'easy', money: 500000 });
  const S = z.state;
  clearFlatArea(z, 10, 10, 22, 22);
  for (let i = 12; i <= 19; i++) {
    assert.ok(z.Sim.placeFence({ axis: 'x', i, j: 12 }, 'reinforced').ok);
    assert.ok(z.Sim.placeFence({ axis: 'x', i, j: 20 }, 'reinforced').ok);
  }
  for (let j = 12; j <= 19; j++) {
    assert.ok(z.Sim.placeFence({ axis: 'z', i: 12, j }, 'reinforced').ok);
    assert.ok(z.Sim.placeFence({ axis: 'z', i: 20, j }, 'reinforced').ok);
  }

  const dino = z.Sim.spawnAnimal('triceratops', 15, 15);
  assert.ok(dino);
  dino.energy = 100;
  dino.hunger = 0;
  dino.thirst = 0;

  // Simulate full open park day: 08:00 -> 20:00 (450 sim-seconds at 1x)
  S.time = 8 / 24;
  for (let k = 0; k < 900; k++) {
    z.Sim._step(0.5);
  }
  assert.ok(dino.energy >= 65, `healthy dino should retain >= 65 energy after full open day (got ${dino.energy.toFixed(1)})`);
  assert.notEqual(dino.state, 'sleep', 'healthy dino should remain active rather than collapsing mid-day');

  // Verify overnight sleep recovery remains brisk and restores energy to 100
  dino.energy = 20;
  dino.state = 'sleep';
  S.time = 0.92; // early night (0.90..1.00..0.24 = 102s at 3x)
  for (let k = 0; k < 160; k++) { // 80s sim time (stays night the entire time)
    z.Sim._step(0.5);
  }
  assert.equal(dino.energy, 100, `overnight sleep should fully restore energy to 100, got ${dino.energy}`);
});
