// Run with: node --test tests/coaster.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');


function game() {
  const ctx = vm.createContext({
    console,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  const simFiles = simulationScripts();
  for (const f of simFiles) {
    vm.runInContext(readScript(f), ctx, { filename: f });
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

function makeTestGuest(id, ti, x, zPos, gid) {
  return {
    id,
    name: 'Test Rider ' + id,
    seed: id,
    x,
    z: zPos,
    heading: 0,
    speed: 0,
    state: 'walk',
    hunger: 10,
    thirst: 10,
    bladder: 10,
    energy: 90,
    happiness: 70,
    money: 80,
    thought: '',
    thoughtT: 0,
    seen: {},
    seenEnc: {},
    seenB: {},
    group: 900 + id,
    ti,
    ni: -1,
    px: x,
    pz: zPos,
    lo: 0,
    lo2: 0,
    bs: 3,
    gt: 'bld',
    gid: gid || 0,
    dk: '',
    wt: 0,
    nt: 0.5,
    acc: 0,
    tcool: 0,
    fun: 40,
    mood: 0,
    lit: false,
    stay: 200,
    stay0: 200,
    pv: 0,
    tol: 1.6,
    thor: 0.8,
    al: { meal: 1, drink: 1, treat: 1, shop: 1, act: 3 }
  };
}

test('Dino Coasters: star unlocks and higher maxHeight progression (wooden:5 .. hyper:18)', () => {
  const z = game();
  const D = z.DATA;
  z.Sim.newGame({ seed: 2001, money: 500000 });
  assert.ok(z.Coaster, 'Z.Coaster should exist in Dino Tycoon');

  // Verify building star progression: wooden (0) through hyper (4)
  const bMap = Object.fromEntries(D.buildings.map(b => [b.id, b]));
  assert.equal(bMap.coaster_wooden.star, 0);
  assert.equal(bMap.coaster_mine.star, 1);
  assert.equal(bMap.coaster_flume.star, 2);
  assert.equal(bMap.coaster_steel.star, 3);
  assert.equal(bMap.coaster_hyper.star, 4);

  // Verify maxHeight progression in D.coaster.types
  assert.equal(D.coaster.types.wooden.maxHeight, 5);
  assert.equal(D.coaster.types.mine.maxHeight, 7);
  assert.equal(D.coaster.types.flume.maxHeight, 8);
  assert.equal(D.coaster.types.steel.maxHeight, 12);
  assert.equal(D.coaster.types.hyper.maxHeight, 18);

  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 16, 28, 34, 42);

  // At 0 stars: wooden is buildable, mine/flume/steel/hyper are locked
  assert.equal(z.state.unlocked.star, 0);
  assert.equal(z.Sim.placeObject('coaster_steel', 20, 35, 0).ok, false, 'Steel coaster locked at 0 stars');
  assert.equal(z.Sim.placeObject('coaster_hyper', 20, 35, 0).ok, false, 'Hyper coaster locked at 0 stars');
  const wdRes = z.Sim.placeObject('coaster_wooden', 20, 35, 0);
  assert.equal(wdRes.ok, true, wdRes.msg);

  // Build wooden loop and verify coasterElev clamps at 5
  const wdLoop = [
    tidx(23, 35), tidx(24, 35), tidx(25, 35),
    tidx(25, 34), tidx(25, 33), tidx(25, 32),
    tidx(24, 32), tidx(23, 32), tidx(22, 32), tidx(21, 32), tidx(20, 32), tidx(19, 32),
    tidx(19, 33), tidx(19, 34), tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(wdLoop).ok, true);
  const wdPeak = tidx(22, 32);
  for (let step = 0; step < 8; step++) {
    z.Coaster.changeHeight([wdPeak], 1);
  }
  assert.equal(z.state.coasterElev[wdPeak], 5, 'Wooden coaster height must clamp at maxHeight=5');
  assert.equal(z.Coaster.changeHeight([wdPeak], 1).ok, false, 'Wooden coaster cannot raise past 5');

  // Now unlock star 4, clear, and test Hyper Coaster up to 14 and clamping at 18
  z.Sim.newGame({ seed: 2002, money: 500000 });
  z.state.unlocked.star = 4;
  clearFlatArea(z, 16, 26, 34, 42);

  const hyRes = z.Sim.placeObject('coaster_hyper', 20, 35, 0);
  assert.equal(hyRes.ok, true, hyRes.msg);
  const hyLoop = [
    tidx(23, 35), tidx(24, 35), tidx(25, 35), tidx(26, 35),
    tidx(26, 34), tidx(26, 33), tidx(26, 32), tidx(26, 31), tidx(26, 30),
    tidx(25, 30), tidx(24, 30), tidx(23, 30), tidx(22, 30), tidx(21, 30), tidx(20, 30), tidx(19, 30), tidx(18, 30),
    tidx(18, 31), tidx(18, 32), tidx(18, 33), tidx(18, 34), tidx(18, 35),
    tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(hyLoop).ok, true);
  const hyPeak = tidx(22, 30);

  for (let h = 0; h < 14; h++) {
    const r = z.Coaster.changeHeight([hyPeak], 1);
    assert.equal(r.ok, true, `Hyper raise step ${h + 1}: ${r.msg}`);
  }
  assert.equal(z.state.coasterElev[hyPeak], 14, 'Hyper coaster should raise past old limit of 8 to 14');

  for (let h = 14; h < 22; h++) {
    z.Coaster.changeHeight([hyPeak], 1);
  }
  assert.equal(z.state.coasterElev[hyPeak], 18, 'Hyper coaster height must clamp at maxHeight=18');
  assert.equal(z.Coaster.changeHeight([hyPeak], 1).ok, false, 'Hyper coaster cannot raise past 18');
});

test('Dino Coasters: track loop, hills, gravity physics, specials, excitement, undo, save/load & legacy save', () => {
  const z = game();
  z.Sim.newGame({ seed: 2003, money: 300000 });
  z.state.unlocked.star = 4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 16, 28, 32, 42);

  // Station at (20, 35) rot=0 -> track row j=35, endF=(23,35), endB=(20,35)
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
  assert.equal(trRes.autoSpawned, true, 'Completing loop should auto-spawn starter train');

  let info = z.Coaster.stationInfo(stRes.id);
  assert.equal(info.ready, true);
  assert.equal(info.loop, true);
  assert.equal(info.trains.length, 1);
  const baseExc = info.excitement;
  assert.ok(baseExc >= 1.5 && baseExc <= 3.0, `Flat oval should have modest excitement (1.5..3.0), got ${baseExc}`);

  // Raise hill without Chain Lift or Boost -> stalls due to gravity!
  const hillTiles = [tidx(20, 31), tidx(21, 31), tidx(22, 31), tidx(23, 31)];
  for (let h = 0; h < 3; h++) {
    const rH = z.Coaster.changeHeight(hillTiles, 1);
    assert.equal(rH.ok, true, rH.msg);
  }
  info = z.Coaster.stationInfo(stRes.id);
  assert.equal(info.energyOk, false, 'Tall hill without Chain Lift or Boost should fail gravity energy check');
  assert.equal(info.ready, false, 'Coaster must not be ready while stalling');
  assert.match(info.stallReason, /Chain Lift|Launch Boost/i);
  const hillExc = info.excitement;
  assert.ok(hillExc > baseExc, 'Raising hill increases excitement');

  // Add Chain Lift + Launch Boost + Loop-de-Loop + Corkscrew + Water Splash
  assert.equal(z.Coaster.placeSpecial([tidx(25, 34), tidx(25, 33), tidx(25, 32)], 1).ok, true); // Chain Lift
  assert.equal(z.Coaster.placeSpecial([tidx(24, 35)], 1).ok, true); // Chain Lift
  assert.equal(z.Coaster.placeSpecial([tidx(19, 35)], 2).ok, true); // Launch Boost
  assert.equal(z.Coaster.placeSpecial([tidx(21, 31)], 4).ok, true); // Loop-de-Loop
  assert.equal(z.Coaster.placeSpecial([tidx(19, 31)], 5).ok, true); // Corkscrew
  assert.equal(z.Coaster.placeSpecial([tidx(18, 33)], 3).ok, true); // Water Splash

  info = z.Coaster.stationInfo(stRes.id);
  assert.equal(info.energyOk, true, `Chain Lift + Boost should clear energy check, got: ${info.stallReason}`);
  assert.equal(info.ready, true);
  assert.ok(info.excitement > hillExc, 'Specials should increase excitement');
  assert.equal(info.specs[4], 1);
  assert.equal(info.specs[5], 1);
  assert.equal(info.specs[3], 1);

  // Verify Loop-de-Loop creates inverted uy < -0.5 on spline
  let minUy = 1;
  for (let k = 0; k < info.line.nS; k++) {
    if (info.line.uy[k] < minUy) minUy = info.line.uy[k];
  }
  assert.ok(minUy < -0.5, `Expected inverted uy < -0.5 on spline, got ${minUy}`);

  // Undo last special (Water Splash)
  assert.equal(z.Sim.undo().ok, true);
  assert.equal(z.state.coasterSpec[tidx(18, 33)], 0, 'Undo should revert Water Splash');

  // Save/load round-trip preserves track, heights, specials, and trains
  const saved = z.Sim.save();
  const savedElevPeak = z.state.coasterElev[tidx(21, 31)];
  z.Sim.newGame({ seed: 9999 });
  assert.equal(z.Sim.load(saved), true);

  const infoAfter = z.Coaster.stationInfo(stRes.id);
  assert.ok(infoAfter, 'Station should exist after load');
  assert.equal(infoAfter.ready, true);
  assert.equal(infoAfter.specs[4], 1);
  assert.equal(infoAfter.specs[5], 1);
  assert.equal(infoAfter.trains.length, 1);
  assert.equal(z.state.coasterElev[tidx(21, 31)], savedElevPeak);
  assert.ok(z.state.coasterRail[tidx(25, 33)] > 0);

  // Legacy save without coasterRail/coasterElev/coasterSpec/coaster loads cleanly
  const legacy = JSON.parse(saved);
  delete legacy.s.coasterRail;
  delete legacy.s.coasterElev;
  delete legacy.s.coasterSpec;
  delete legacy.s.coaster;
  // Remove coaster station objects from legacy save to represent pre-coaster park
  legacy.s.objects = legacy.s.objects.filter(o => o.type !== 'coaster_steel');
  assert.equal(z.Sim.load(JSON.stringify(legacy)), true, 'Legacy save without coaster fields must load cleanly');
  assert.equal(z.state.coasterRail.constructor.name, 'Uint8Array');
  assert.equal(z.state.coasterElev.constructor.name, 'Int8Array');
  assert.equal(z.state.coasterSpec.constructor.name, 'Uint8Array');
  assert.ok(z.state.coaster && Array.isArray(z.state.coaster.trains));
});

test('Dino Coasters: guests ride, earn revenue, breakdowns stop all trains, engineer & Mechanic + Z.Power coexistence', () => {
  const z = game();
  z.Sim.newGame({ seed: 2004, money: 300000 });
  z.state.time = 0.4;
  z.state.unlocked.star = 3;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 16, 28, 34, 44);

  // Connect path from gate walkway to coaster station front (j=37)
  for (let i = 20; i <= 28; i++) z.Sim.placePath(i, 37, 'paved');
  for (let j = 37; j <= 44; j++) z.Sim.placePath(27, j, 'paved');

  const stRes = z.Sim.placeObject('coaster_wooden', 20, 35, 0);
  assert.equal(stRes.ok, true, stRes.msg);
  const loopRoute = [
    tidx(23, 35), tidx(24, 35), tidx(24, 34), tidx(24, 33), tidx(24, 32),
    tidx(23, 32), tidx(22, 32), tidx(21, 32), tidx(20, 32), tidx(19, 32),
    tidx(19, 33), tidx(19, 34), tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(loopRoute).ok, true);

  // Buy a second train so we can verify breakdown stops ALL trains on the station
  const buy2 = z.Coaster.buyTrain(stRes.id, 3);
  assert.equal(buy2.ok, true, buy2.msg);
  assert.equal(z.Coaster.trainsOnStation(stRes.id).length, 2);

  // Spawn guest at station front and direct to board via Coaster.arrive
  const g = makeTestGuest(9501, tidx(21, 37), 21.5 * 2, 37.5 * 2, stRes.id);
  z.state.guests.push(g);
  z.Sim._rt().gById.set(g.id, g);
  const stObj = z.state.objects.find(o => o.id === stRes.id);
  assert.equal(z.Coaster.arrive(g, stObj), true);
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0, 'Queueing earns no rating credit');

  let sawRiding = false, maxY = -1;
  for (let step = 0; step < 300; step++) {
    z.Sim._step(0.2);
    if (g.state === 'ride') {
      sawRiding = true;
      if (typeof g.absY === 'number' && g.absY > maxY) maxY = g.absY;
    }
  }
  assert.equal(sawRiding, true, 'Guest should board and ride the coaster');
  assert.ok(maxY > 1.5, `Riding guest absY should exceed 1.5m, got ${maxY}`);
  assert.ok(z.state.stats.ridesTaken >= 1, 'stats.ridesTaken should increment');
  assert.ok(z.state.coaster.stats.income > 0, 'coaster.stats.income should increase');
  assert.ok(z.Sim.ratingBreakdown().attractionBonus > 0, 'Completing the circuit earns attraction credit');

  // Breakdown stops ALL trains on the station; emergency callEngineer repairs it
  const train1Id = z.state.coaster.trains[0].id;
  const train2Id = z.state.coaster.trains[1].id;
  assert.equal(z.Coaster.breakdown(train1Id), true);
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, true);
  assert.equal(z.Coaster.stationReady(stRes.id), false);
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0, 'A broken station stops contributing');
  assert.equal(z.Coaster.trainInfo(train1Id).state, 'broken');
  assert.equal(z.Coaster.trainInfo(train2Id).state, 'broken', 'All trains on the station must stop on breakdown');
  assert.equal(z.Coaster.trainInfo(train1Id).speed, 0);

  const engRes = z.Coaster.callEngineer(train1Id);
  assert.equal(engRes.ok, true, engRes.msg);
  assert.equal(z.Coaster.trainInfo(train1Id).eng, true);
  for (let step = 0; step < 40; step++) z.Sim._step(0.2);
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, false, 'Emergency callEngineer should repair coaster');
  assert.equal(z.Coaster.stationInfo(stRes.id).condition, 100, 'Emergency callEngineer should restore condition to 100%');
  assert.notEqual(z.Coaster.trainInfo(train1Id).state, 'broken');
  assert.notEqual(z.Coaster.trainInfo(train2Id).state, 'broken');

  // Safety Override (without mechanic or callEngineer) resets condition to 80% (>= 60% threshold)
  assert.equal(z.Coaster.breakdown(train1Id), true);
  for (let step = 0; step < 340; step++) {
    z.Sim._step(0.2);
    if (!z.Coaster.stationInfo(stRes.id).broken) break;
  }
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, false, 'Safety Override should reset broken coaster after fixTime');
  assert.equal(z.Coaster.stationInfo(stRes.id).condition, 80, 'Safety Override should restore condition to 80% (above 60% wear threshold)');

  // Multi-train condition decay does not stack across trains & stays reliable over a full day
  stObj.condition = 100;
  const bdBefore = z.state.coaster.stats.breakdowns || 0;
  for (let step = 0; step < 500; step++) z.Sim._step(0.2); // 100s with 2 trains running
  const condAfter100s = stObj.condition;
  assert.ok(condAfter100s >= 97, `2-train coaster condition after 100s should be >= 97% (no per-train stacking), got ${condAfter100s}`);
  assert.ok((z.state.coaster.stats.breakdowns || 0) - bdBefore <= 1, 'Breakdowns over 100s must be rare (<= 1)');

  // Hire Mechanic staff: counted by Z.Power AND automatically repairs broken coaster via radio dispatch
  const powerBefore = z.Power.report();
  assert.equal(powerBefore.mechanics, 0);
  const hireMech = z.Sim.hireStaff('mechanic', 25, 37);
  assert.equal(hireMech.ok, true, hireMech.msg);
  assert.equal(z.Power.report().mechanics, 1, 'Z.Power must count hired mechanic staff');

  // Let mechanic begin patrolling, then trigger breakdown to test radio dispatch interrupt
  for (let step = 0; step < 15; step++) z.Sim._step(0.2);
  assert.equal(z.Coaster.breakdown(stRes.id), true);
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, true);
  for (let step = 0; step < 100; step++) {
    z.Sim._step(0.2);
    if (!z.Coaster.stationInfo(stRes.id).broken) break;
  }
  assert.equal(z.Coaster.stationInfo(stRes.id).broken, false, 'Hired Mechanic should auto-repair via radio dispatch');
  assert.equal(z.Coaster.stationInfo(stRes.id).condition, 100);
  assert.equal(z.Power.report().mechanics, 1, 'Z.Power still counts mechanic after coaster repair');
});

test('Dino Coasters: Monorail & Moat ditch coexistence without pylon or guest ride conflicts', () => {
  const z = game();
  z.Sim.newGame({ seed: 2005, money: 500000 });
  z.state.time = 0.4;
  z.state.unlocked.star = 4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 12, 16, 42, 44);

  // Connect paths to both a Coaster station and a Monorail station
  for (let j = 28; j <= 44; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 16; i <= 36; i++) z.Sim.placePath(i, 37, 'paved');

  // Dig a 2-tile-wide moat ditch across i=22..23, j=31..33 (North straight of coaster will cross j=31)
  const digRes = z.Sim.moats.dig([
    tidx(22, 31), tidx(23, 31),
    tidx(22, 32), tidx(23, 32)
  ], 1);
  assert.equal(digRes.ok, true, digRes.msg);
  assert.ok(z.state.ditch[tidx(22, 31)] > 0 && z.state.ditch[tidx(23, 31)] > 0);

  const polyRoute = (pts) => {
    const out = [];
    for (let k = 0; k < pts.length - 1; k++) {
      let [ci, cj] = pts[k], [ti, tj] = pts[k + 1];
      if (out.length === 0) out.push(tidx(ci, cj));
      while (ci !== ti || cj !== tj) {
        if (ci < ti) ci++;
        else if (ci > ti) ci--;
        else if (cj < tj) cj++;
        else if (cj > tj) cj--;
        out.push(tidx(ci, cj));
      }
    }
    return out;
  };

  // Place Coaster Station at (20, 35) rot=0 and span across the dug ditch at (22..23, 31)
  const cSt = z.Sim.placeObject('coaster_wooden', 20, 35, 0);
  assert.equal(cSt.ok, true, cSt.msg);
  const cRoute = polyRoute([[23, 35], [25, 35], [25, 31], [19, 31], [19, 35], [20, 35]]);
  const cBuild = z.Coaster.buildTrack(cRoute);
  assert.equal(cBuild.ok, true, cBuild.msg);
  const cInfo = z.Coaster.stationInfo(cSt.id);
  assert.equal(cInfo.ready, true, 'Coaster spanning a 2-tile moat ditch should be ready');

  // Verify NO coaster pylon base was placed inside any dug ditch tile
  const ditchSet = new Set([tidx(22, 31), tidx(23, 31), tidx(22, 32), tidx(23, 32)]);
  for (const py of cInfo.line.pylons) {
    assert.equal(ditchSet.has(py.t), false, `Coaster pylon must not be placed inside ditch tile ${py.t}`);
  }

  // Now build a working Monorail station + powered loop in the same park
  const mSt = z.Sim.placeObject('monorail_station', 30, 35, 0);
  assert.equal(mSt.ok, true, mSt.msg);
  assert.equal(z.Sim.placeObject('diesel_gen', 35, 35, 0).ok, true);
  assert.equal(z.Sim.placeObject('substation', 35, 33, 0).ok, true);

  const mRoute = polyRoute([[33, 35], [34, 35], [34, 30], [29, 30], [29, 35], [30, 35]]);
  const mBuild = z.Sim.monorail.buildTrack(mRoute);
  assert.equal(mBuild.ok, true, mBuild.msg);
  const mBuy = z.Sim.monorail.buyTrain(mSt.id, 2);
  assert.equal(mBuy.ok, true, mBuy.msg);

  // Put one guest on the Coaster and one guest on the Monorail simultaneously
  const gCoaster = makeTestGuest(9601, tidx(21, 37), 21.5 * 2, 37.5 * 2, cSt.id);
  const gMono = makeTestGuest(9602, tidx(31, 37), 31.5 * 2, 37.5 * 2, mSt.id);
  z.state.guests.push(gCoaster, gMono);
  z.Sim._rt().gById.set(gCoaster.id, gCoaster);
  z.Sim._rt().gById.set(gMono.id, gMono);

  const cObj = z.state.objects.find(o => o.id === cSt.id);
  const mObj = z.state.objects.find(o => o.id === mSt.id);
  assert.equal(z.Coaster.arrive(gCoaster, cObj), true);
  z.Sim.monorail.arrive(gMono, mObj);

  let coasterRode = false, monoRode = false;
  let bothRidingAtOnce = false;
  for (let step = 0; step < 300; step++) {
    z.Sim._step(0.2);
    if (gCoaster.state === 'ride' && gCoaster.coasterTrain) coasterRode = true;
    if (gMono.state === 'ride' && gMono.rtr) monoRode = true;
    if (gCoaster.state === 'ride' && gCoaster.coasterTrain && gMono.state === 'ride' && gMono.rtr) {
      bothRidingAtOnce = true;
    }
    if (coasterRode && monoRode && bothRidingAtOnce) break;
  }
  assert.equal(coasterRode, true, 'Coaster guest should board and ride while monorail is active');
  assert.equal(monoRode, true, 'Monorail guest should board and ride while coaster is active');
  assert.equal(bothRidingAtOnce, true, 'Both riders should coexist in state=ride without rideTick conflict');

  // Save/load while both riders are in state='ride' must preserve both riders cleanly!
  const snapWhileRiding = z.Sim.save();
  assert.equal(z.Sim.load(snapWhileRiding), true);
  const gCAfter = z.state.guests.find(x => x.id === 9601);
  const gMAfter = z.state.guests.find(x => x.id === 9602);
  assert.equal(gCAfter.state, 'ride');
  assert.ok(gCAfter.coasterTrain > 0);
  assert.equal(gMAfter.state, 'ride');
  assert.ok(gMAfter.rtr > 0);

  // Tick more steps after reload -> neither rider crashes or corrupts state
  for (let step = 0; step < 60; step++) z.Sim._step(0.2);
  assert.ok(Number.isFinite(gCAfter.x) && Number.isFinite(gCAfter.z));
  assert.ok(Number.isFinite(gMAfter.x) && Number.isFinite(gMAfter.z));

  // Bulldozing Coaster station releases only Coaster rider cleanly via releaseGuest, leaving Monorail rider intact
  const bzCoaster = z.Sim.bulldoze(20, 35);
  assert.equal(bzCoaster.ok, true, bzCoaster.msg);
  assert.notEqual(gCAfter.state, 'ride', 'Coaster rider should be released when coaster station is removed');
  assert.equal(gMAfter.state, 'ride', 'Monorail rider must remain riding when coaster is removed');
  assert.ok(gMAfter.rtr > 0);
});

test('Dino Coasters: 3D Z.CoasterWorld renderer, 4-rotation arrows, overlay sync & Street View coordination', () => {
  const THREE = require('../vendor/three.r128.min.js');
  const rootGrp = new THREE.Group();
  const cam = { target: { x: 0, z: 0 } };
  const ctx = vm.createContext({
    console,
    THREE,
    Math,
    Float32Array,
    Uint8Array,
    Int8Array,
    Int16Array,
    Int32Array
  });
  vm.runInContext('var window = globalThis;', ctx);

  const load = f => vm.runInContext(readScript(f), ctx, { filename: f });
  ['00-data.js', 'dino-config.js', '10-core.js', '20-sim.js', '21-sim-coaster.js'].forEach(load);
  const z = ctx.Z;
  z.Models = { createBuilding: () => new THREE.Group() };
  z.World = {
    root: () => rootGrp,
    groundY: () => 0,
    cam,
    _G: { t: 1 },
    isStreetView: () => false,
    setStreetView() {}
  };
  load('48-world-coaster.js');

  assert.ok(z.CoasterWorld, 'Z.CoasterWorld should initialize');

  // All 5 station models build cleanly and buildingFootprint returns { w: 4, h: 2 }
  ['coaster_wooden', 'coaster_mine', 'coaster_flume', 'coaster_steel', 'coaster_hyper'].forEach(id => {
    const m = z.Models.createBuilding(id);
    assert.ok(m && m.children.length > 5, `${id} 3D station model should build cleanly`);
    const fp = z.Models.buildingFootprint(id);
    assert.equal(fp.w, 4, `${id} footprint.w should be 4`);
    assert.equal(fp.h, 2, `${id} footprint.h should be 2`);
  });

  z.Sim.newGame({ seed: 2006, money: 300000 });
  z.state.unlocked.star = 4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 18, 30, 28, 40);

  const st = z.Sim.placeObject('coaster_hyper', 20, 35, 0);
  assert.equal(st.ok, true, st.msg);
  const route = [
    tidx(23, 35), tidx(24, 35), tidx(24, 34), tidx(24, 33), tidx(24, 32),
    tidx(23, 32), tidx(22, 32), tidx(21, 32), tidx(20, 32), tidx(19, 32),
    tidx(19, 33), tidx(19, 34), tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(route).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(24, 34)], 2).ok, true); // Boost
  assert.equal(z.Coaster.placeSpecial([tidx(24, 33)], 1).ok, true); // Chain Lift
  assert.equal(z.Coaster.placeSpecial([tidx(22, 32)], 4).ok, true); // Loop-de-Loop
  assert.equal(z.Coaster.placeSpecial([tidx(20, 32)], 5).ok, true); // Corkscrew

  // Overlay sync
  assert.equal(z.CoasterWorld.overlayOn, false);
  z.CoasterWorld.setOverlay(true);
  assert.equal(z.CoasterWorld.overlayOn, true);
  assert.equal(z.CoasterWorld.isOverlay(), true);
  z.CoasterWorld.setOverlay(false);
  assert.equal(z.CoasterWorld.overlayOn, false);
  assert.equal(z.CoasterWorld.isOverlay(), false);

  // Render frames + Ride Along camera
  const trainId = z.state.coaster.trains[0].id;
  assert.equal(z.CoasterWorld.rideAlong(trainId), true);
  assert.equal(z.CoasterWorld.isRiding(), trainId);
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 500);
  for (let f = 0; f < 30; f++) {
    z.Sim._step(0.1);
    z.CoasterWorld.frame(0.016, 0.016);
    const applied = z.CoasterWorld.applyCamera(camera, 0.016);
    assert.equal(applied, true);
    assert.ok(
      Number.isFinite(camera.position.x) &&
      Number.isFinite(camera.position.y) &&
      Number.isFinite(camera.position.z),
      'Ride Along camera position must stay finite'
    );
  }

  // Emitting streetview=true cleanly exits ride-along
  z.bus.emit('streetview', true);
  assert.equal(z.CoasterWorld.isRiding(), 0, 'streetview=true must exit CoasterWorld ride-along');

  // All 4 station rotations (rot = 0..3) align endF with green launch arrow and endB with orange return arrow
  for (let rot = 0; rot < 4; rot++) {
    z.Sim.newGame({ seed: 2010 + rot, money: 250000 });
    clearFlatArea(z, 18, 28, 28, 38);
    const rSt = z.Sim.placeObject('coaster_wooden', 22, 32, rot);
    assert.equal(rSt.ok, true, `rot=${rot}: ${rSt.msg}`);
    const stEntry = z.Coaster.state().stById[rSt.id];
    const fp = stEntry.fp;
    const cx = (fp.i0 + fp.w / 2) * 2;
    const cz = (fp.j0 + fp.h / 2) * 2;
    const m = z.Models.createBuilding('coaster_wooden');
    m.position.set(cx, 0, cz);
    m.rotation.y = rot * Math.PI / 2;
    m.updateMatrixWorld(true);

    // Green launch arrow at local (+4.15, y, -1.0); orange return arrow at local (-4.15, y, -1.0)
    const greenWorld = new THREE.Vector3(4.15, 0, -1.0).applyMatrix4(m.matrixWorld);
    const orangeWorld = new THREE.Vector3(-4.15, 0, -1.0).applyMatrix4(m.matrixWorld);
    const endFx = ((stEntry.endF % N) + 0.5) * 2;
    const endFz = (Math.floor(stEntry.endF / N) + 0.5) * 2;
    const endBx = ((stEntry.endB % N) + 0.5) * 2;
    const endBz = (Math.floor(stEntry.endB / N) + 0.5) * 2;

    const dGreenToF = Math.hypot(greenWorld.x - endFx, greenWorld.z - endFz);
    const dGreenToB = Math.hypot(greenWorld.x - endBx, greenWorld.z - endBz);
    const dOrangeToB = Math.hypot(orangeWorld.x - endBx, orangeWorld.z - endBz);
    assert.ok(dGreenToF < dGreenToB && dGreenToF < 1.5, `rot=${rot}: endF should align with green launch arrow (d=${dGreenToF})`);
    assert.ok(dOrangeToB < 1.5, `rot=${rot}: endB should align with orange return arrow (d=${dOrangeToB})`);
  }
});

test('Dino Coasters: Large Loop-de-Loop (6), Large Corkscrew (7) & 3D rendering', () => {
  const THREE = require('../vendor/three.r128.min.js');
  const rootGrp = new THREE.Group();
  const cam = { target: { x: 0, z: 0 } };
  const ctx = vm.createContext({
    console,
    THREE,
    Math,
    Float32Array,
    Uint8Array,
    Int8Array,
    Int16Array,
    Int32Array
  });
  vm.runInContext('var window = globalThis;', ctx);
  const load = f => vm.runInContext(readScript(f), ctx, { filename: f });
  ['00-data.js', 'dino-config.js', '10-core.js', '20-sim.js', '21-sim-coaster.js'].forEach(load);
  const z = ctx.Z;
  z.Models = { createBuilding: () => new THREE.Group() };
  z.World = {
    root: () => rootGrp,
    groundY: () => 0,
    cam,
    _G: { t: 1 },
    isStreetView: () => false,
    setStreetView() {}
  };
  load('48-world-coaster.js');

  assert.deepEqual(Array.from(z.DATA.coaster.types.steel.allowedSpecs), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(Array.from(z.DATA.coaster.types.hyper.allowedSpecs), [1, 2, 3, 4, 5, 6, 7]);

  z.Sim.newGame({ seed: 2020, money: 500000 });
  z.state.unlocked.star = 4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 14, 24, 34, 42);

  // Wooden coaster cannot place Large Loop (6) or Large Corkscrew (7)
  const wdSt = z.Sim.placeObject('coaster_wooden', 20, 39, 0);
  assert.equal(wdSt.ok, true);
  assert.equal(z.Coaster.buildTrack([
    tidx(23, 39), tidx(24, 39), tidx(24, 38), tidx(24, 37),
    tidx(23, 37), tidx(22, 37), tidx(21, 37), tidx(20, 37), tidx(19, 37),
    tidx(19, 38), tidx(19, 39), tidx(20, 39)
  ]).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(22, 37)], 6).ok, false, 'Wooden coaster must reject Large Loop-de-Loop');
  assert.equal(z.Coaster.placeSpecial([tidx(21, 37)], 7).ok, false, 'Wooden coaster must reject Large Corkscrew');
  assert.equal(z.Sim.bulldoze(20, 39).ok, true);

  // Hyper coaster with Lift hill -> Drop -> Large Loop-de-Loop (6) & Large Corkscrew (7)
  const hySt = z.Sim.placeObject('coaster_hyper', 20, 35, 0);
  assert.equal(hySt.ok, true);
  const route = [
    tidx(23, 35), tidx(24, 35), tidx(25, 35), tidx(26, 35),
    tidx(26, 34), tidx(26, 33), tidx(26, 32), tidx(26, 31), tidx(26, 30), tidx(26, 29),
    tidx(25, 29), tidx(24, 29), tidx(23, 29), tidx(22, 29), tidx(21, 29), tidx(20, 29), tidx(19, 29), tidx(18, 29),
    tidx(18, 30), tidx(18, 31), tidx(18, 32), tidx(18, 33), tidx(18, 34), tidx(18, 35),
    tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(route).ok, true);
  for (let h = 0; h < 6; h++) {
    assert.equal(z.Coaster.changeHeight([tidx(26, 30), tidx(26, 29), tidx(25, 29)], 1).ok, true);
  }
  assert.equal(z.Coaster.placeSpecial([tidx(25, 35), tidx(26, 35), tidx(26, 34), tidx(26, 33), tidx(26, 32), tidx(26, 31), tidx(26, 30)], 1).ok, true);
  const baseHillInfo = z.Coaster.stationInfo(hySt.id);
  assert.equal(baseHillInfo.energyOk, true, baseHillInfo.stallReason);
  const baseExc = baseHillInfo.excitement;

  assert.equal(z.Coaster.placeSpecial([tidx(22, 29)], 6).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(20, 29)], 7).ok, true);

  const info = z.Coaster.stationInfo(hySt.id);
  assert.equal(info.ready, true, info.stallReason);
  assert.equal(info.specs[6], 1);
  assert.equal(info.specs[7], 1);
  assert.ok(info.excitement > baseExc, `Large Loop + Large Corkscrew should boost excitement (${info.excitement} > ${baseExc})`);
  assert.ok(info.maxHeight >= 10.5, `Large Loop (9.0m tall) should raise maxHeight, got ${info.maxHeight}`);

  // Spline must invert cleanly through both Large Loop (6) and Large Corkscrew (7)
  let minUy6 = 1, minUy7 = 1;
  for (let k = 0; k < info.line.nS; k++) {
    if (info.line.sSpec[k] === 6 && info.line.uy[k] < minUy6) minUy6 = info.line.uy[k];
    if (info.line.sSpec[k] === 7 && info.line.uy[k] < minUy7) minUy7 = info.line.uy[k];
  }
  assert.ok(minUy6 < -0.9, `Large Loop-de-Loop must invert (uy < -0.9), got ${minUy6}`);
  assert.ok(minUy7 < -0.9, `Large Corkscrew must invert (uy < -0.9), got ${minUy7}`);

  // 3D renderer builds track + A-frame inversion towers + extended chain lift links cleanly
  z.CoasterWorld.frame(0.016, 0.016);
  assert.ok(rootGrp.children.length > 0, '3D CoasterWorld root group should populate track & tower meshes');
  for (let f = 0; f < 10; f++) {
    z.Sim._step(0.1);
    z.CoasterWorld.frame(0.016, 0.016);
  }
});

test('Dino Coasters: overhauled gravity physics — drop acceleration, unpowered climb deceleration, and uphill rollback', () => {
  const z = game();
  z.Sim.newGame({ seed: 2021, money: 500000 });
  z.state.unlocked.star = 4;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 14, 24, 34, 42);

  // 1) Chain Lift hill (6 steps) -> steep drop -> second unpowered hill (3 steps):
  //    Train must exceed 2.5 * CHAIN_SPEED (4.2 * 2.5 = 10.5 m/s) on drop and decelerate naturally up second hill.
  const st1 = z.Sim.placeObject('coaster_hyper', 20, 35, 0);
  assert.equal(st1.ok, true);
  const route = [
    tidx(23, 35), tidx(24, 35), tidx(25, 35), tidx(26, 35),
    tidx(26, 34), tidx(26, 33), tidx(26, 32), tidx(26, 31), tidx(26, 30), tidx(26, 29),
    tidx(25, 29), tidx(24, 29), tidx(23, 29), tidx(22, 29), tidx(21, 29), tidx(20, 29), tidx(19, 29), tidx(18, 29),
    tidx(18, 30), tidx(18, 31), tidx(18, 32), tidx(18, 33), tidx(18, 34), tidx(18, 35),
    tidx(19, 35), tidx(20, 35)
  ];
  assert.equal(z.Coaster.buildTrack(route).ok, true);
  for (let h = 0; h < 6; h++) {
    assert.equal(z.Coaster.changeHeight([tidx(26, 30), tidx(26, 29), tidx(25, 29)], 1).ok, true);
  }
  for (let h = 0; h < 3; h++) {
    assert.equal(z.Coaster.changeHeight([tidx(20, 29), tidx(19, 29)], 1).ok, true);
  }
  assert.equal(z.Coaster.placeSpecial([tidx(25, 35), tidx(26, 35), tidx(26, 34), tidx(26, 33), tidx(26, 32), tidx(26, 31), tidx(26, 30)], 1).ok, true);

  const info1 = z.Coaster.stationInfo(st1.id);
  assert.equal(info1.ready, true, info1.stallReason);
  assert.ok(info1.peakSpeed > 2.5 * 4.2, `Drop speed must exceed 2.5 * CHAIN_SPEED (10.5 m/s), got ${info1.peakSpeed}`);

  const tr1 = z.state.coaster.trains[0].id;
  let maxLiveSpeed = 0, sawDropSpeed = false, sawClimbDecel = false, prevSpeed = null;
  let sawStationReturn = false;
  for (let step = 0; step < 300; step++) {
    z.Sim._step(0.1);
    const ti = z.Coaster.trainInfo(tr1);
    if (ti.state === 'run') {
      if (ti.speed > maxLiveSpeed) maxLiveSpeed = ti.speed;
      if (ti.speed > 10.5) sawDropSpeed = true;
      if (sawDropSpeed && prevSpeed !== null && ti.speed < prevSpeed - 0.1) sawClimbDecel = true;
      prevSpeed = ti.speed;
    } else if (sawDropSpeed && ti.state === 'dwell') {
      sawStationReturn = true;
      break;
    }
  }
  assert.ok(maxLiveSpeed > 2.5 * 4.2, `Live train must reach > 2.5 * CHAIN_SPEED (10.5 m/s), got ${maxLiveSpeed}`);
  assert.equal(sawClimbDecel, true, 'Train must decelerate climbing unpowered hill after drop');
  assert.equal(sawStationReturn, true, 'Train must complete full circuit and return to station');

  // 2) Unpowered hill without Chain Lift or Boost: train stalls and rolls backward (v < 0) under gravity, then resets to station
  z.Sim.newGame({ seed: 2022, money: 500000 });
  z.state.unlocked.star = 4;
  clearFlatArea(z, 14, 24, 34, 42);
  const st2 = z.Sim.placeObject('coaster_steel', 20, 35, 0);
  assert.equal(st2.ok, true);
  assert.equal(z.Coaster.buildTrack(route).ok, true);
  for (let h = 0; h < 4; h++) {
    assert.equal(z.Coaster.changeHeight([tidx(26, 30), tidx(26, 29), tidx(25, 29)], 1).ok, true);
  }
  const info2 = z.Coaster.stationInfo(st2.id);
  assert.equal(info2.energyOk, false);

  // Place a temporary chain lift so the train dispatches, then undo it mid-run so the train hits the unpowered hill
  const trainObj = z.state.coaster.trains[0];
  assert.equal(z.Coaster.placeSpecial([tidx(25, 35), tidx(26, 35), tidx(26, 34), tidx(26, 33), tidx(26, 32), tidx(26, 31), tidx(26, 30)], 1).ok, true);
  assert.equal(z.Coaster.stationInfo(st2.id).ready, true);
  let dispatched = false;
  for (let step = 0; step < 100; step++) {
    z.Sim._step(0.1);
    if (z.Coaster.trainInfo(trainObj.id).state === 'run') { dispatched = true; break; }
  }
  assert.equal(dispatched, true, 'Train should dispatch');
  // Undo the chain lift mid-run so the train faces an unpowered uphill climb!
  assert.equal(z.Sim.undo().ok, true);
  assert.equal(z.Coaster.stationInfo(st2.id).energyOk, false);

  let sawNegativeRollback = false, sawStalledState = false, sawConstant22 = false, sawWinchReset = false;
  let consecutive22 = 0;
  for (let step = 0; step < 200; step++) {
    z.Sim._step(0.1);
    const ti = z.Coaster.trainInfo(trainObj.id);
    if (ti.state === 'run' || ti.state === 'stalled') {
      if (ti.state === 'stalled') sawStalledState = true;
      if (ti.speed < -0.05) sawNegativeRollback = true;
      if (Math.abs(ti.speed - 2.2) < 1e-4) {
        consecutive22++;
        if (consecutive22 >= 3) sawConstant22 = true;
      } else {
        consecutive22 = 0;
      }
    } else if (sawNegativeRollback && ti.state === 'dwell') {
      sawWinchReset = true;
      break;
    }
  }
  assert.equal(sawConstant22, false, 'Train must never climb an unpowered hill at clamped constant 2.2 m/s');
  assert.equal(sawStalledState, true, 'Train stalling on unpowered uphill must enter stalled state');
  assert.equal(sawNegativeRollback, true, 'Train stalling on unpowered uphill must roll backward (v < 0) under gravity');
  assert.equal(sawWinchReset, true, 'Stalled train must winch back to station dwell after > 4s');
});

test('Dino Coasters: Chain Lift engages on elev>=1 hills from station exit, tall hills, and emits status toasts', () => {
  const z = game();
  z.Sim.newGame({ seed: 2023, money: 500000 });
  z.state.unlocked.star = 5;
  const N = z.N;
  const tidx = (i, j) => i + j * N;
  clearFlatArea(z, 10, 20, 42, 42);

  // Capture coasterCtx toast messages
  const msgs = [];
  const origMsg = z.coasterCtx.msg;
  z.coasterCtx.msg = (text, kind) => { msgs.push({ text, kind }); if (origMsg) origMsg(text, kind); };

  const stRes = z.Sim.placeObject('coaster_steel', 18, 25, 0);
  assert.equal(stRes.ok, true, stRes.msg);
  // Station occupies (18..21, 25..26); endF is (21,25), endB is (18,25)
  const route = [
    tidx(21, 25), tidx(22, 25), tidx(23, 25), tidx(24, 25), tidx(25, 25), tidx(26, 25),
    tidx(27, 25), tidx(28, 25), tidx(29, 25), tidx(30, 25), tidx(31, 25),
    tidx(31, 24), tidx(31, 23), tidx(31, 22), tidx(31, 21),
    tidx(30, 21), tidx(29, 21), tidx(28, 21), tidx(27, 21), tidx(26, 21), tidx(25, 21),
    tidx(24, 21), tidx(23, 21), tidx(22, 21), tidx(21, 21), tidx(20, 21), tidx(19, 21), tidx(18, 21), tidx(17, 21),
    tidx(17, 22), tidx(17, 23), tidx(17, 24), tidx(17, 25), tidx(18, 25)
  ];
  const bRes = z.Coaster.buildTrack(route);
  assert.equal(bRes.ok, true, bRes.msg);

  // Raise a tall hill (elev = 8) peaking at (29,25) so auto-ramp reaches right outside station endF at (22,25)
  msgs.length = 0;
  for (let lv = 0; lv < 8; lv++) {
    assert.equal(z.Coaster.changeHeight([tidx(29, 25)], 1).ok, true);
  }
  const infoAfterHill = z.Coaster.stationInfo(stRes.id);
  assert.equal(infoAfterHill.ready, false, 'Unpowered hill must still stall');
  assert.ok(msgs.some((m) => m.kind === 'bad' && /Chain Lift/i.test(m.text)), 'Raising an unpowered hill must notify the player why it stalls');

  // Stamp Chain Lift ONLY on the first raised tile immediately outside station (22,25)
  msgs.length = 0;
  assert.equal(z.Coaster.placeSpecial([tidx(22, 25)], 1).ok, true);
  const infoAfterLift = z.Coaster.stationInfo(stRes.id);
  assert.equal(infoAfterLift.ready, true, `Chain Lift on elev>=1 right outside station must engage and carry continuously to crest (reason: ${infoAfterLift.stallReason})`);
  assert.ok(msgs.some((m) => m.kind === 'good' && /ready/i.test(m.text)), 'Fixing the circuit with Chain Lift must notify the player');

  // Verify train actually dispatches and runs
  const train = z.state.coaster.trains.find((t) => t.stationId === stRes.id);
  let dispatched = false;
  for (let step = 0; step < 80; step++) {
    z.Sim._step(0.1);
    if (z.Coaster.trainInfo(train.id).state === 'run') { dispatched = true; break; }
  }
  assert.equal(dispatched, true, 'Train must dispatch once Chain Lift is placed');

  // Also test a long flat loop with a lift hill too far on the backstretch -> clear error message
  const st2Res = z.Sim.placeObject('coaster_wooden', 18, 36, 0);
  assert.equal(st2Res.ok, true, st2Res.msg);
  const longRoute = [];
  for (let i = 21; i <= 38; i++) longRoute.push(tidx(i, 36));
  for (let j = 35; j >= 31; j--) longRoute.push(tidx(38, j));
  for (let i = 37; i >= 17; i--) longRoute.push(tidx(i, 31));
  for (let j = 32; j <= 36; j++) longRoute.push(tidx(17, j));
  longRoute.push(tidx(18, 36));
  assert.equal(z.Coaster.buildTrack(longRoute).ok, true);
  assert.equal(z.Coaster.changeHeight([tidx(28, 31)], 1).ok, true);
  assert.equal(z.Coaster.placeSpecial([tidx(29, 31)], 1).ok, true);
  const infoLong = z.Coaster.stationInfo(st2Res.id);
  assert.equal(infoLong.ready, false);
  assert.match(infoLong.stallReason || '', /before reaching your Chain Lift/i);
});
