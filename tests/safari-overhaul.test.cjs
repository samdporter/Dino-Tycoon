const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');

function game() {
  const ctx = {
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout,
    performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const file of simulationScripts()) {
    vm.runInContext(readScript(file), ctx, { filename: file });
  }
  return ctx.Z;
}

function fenceRect(z, i0, j0, i1, j1, kind) {
  let placed = 0;
  for (let i = i0; i <= i1; i++) {
    if (z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok) placed++;
    if (z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok) placed++;
  }
  for (let j = j0; j <= j1; j++) {
    if (z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok) placed++;
    if (z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok) placed++;
  }
  return placed;
}

function tile(z, i, j) { return i + j * z.N; }

function clearFlat(z, i0, j0, i1, j1) {
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      z.Sim.bulldoze(i, j);
      z.state.terrain[tile(z, i, j)] = 0;
    }
  }
}

test('safari depot exits out the back across all 4 rotations and blocks crossing guest paths', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, money: 150000 });
  z.state.unlocked.star = 5;
  z.state.elev.fill(0);
  clearFlat(z, 10, 10, 42, 42);

  // Check all 4 rotations of safari_depot
  for (let rot = 0; rot < 4; rot++) {
    const dep = z.Sim.placeObject('safari_depot', 14 + rot * 6, 14, rot);
    assert.equal(dep.ok, true, dep.msg);
    const ends = z.Sim.safari.depotEnds(dep.id);
    assert.ok(ends, 'depotEnds should return orientation info');
    assert.equal(ends.backDir[0], -ends.frontDir[0]);
    assert.equal(ends.backDir[1], -ends.frontDir[1]);
    assert.ok(ends.backTiles.length >= 2, 'depot should have rear exit tiles');
    for (const bt of ends.backTiles) {
      assert.equal(ends.frontTiles.includes(bt), false, 'rear exit tiles must be opposite front path');
    }
  }

  // Test rejecting a land route that crosses a guest path in front of the depot
  clearFlat(z, 10, 24, 30, 38);
  const dep0 = z.Sim.placeObject('safari_depot', 15, 28, 0); // rot=0 => front is j=30, back is j=27
  assert.equal(dep0.ok, true, dep0.msg);
  for (let i = 14; i <= 18; i++) assert.equal(z.Sim.placePath(i, 30, 'paved').ok, true);
  // Attempt to drag out the front across the path at j=30
  const frontDrag = [tile(z, 16, 30), tile(z, 16, 31), tile(z, 16, 32), tile(z, 16, 33)];
  const badPlan = z.Sim.safari.planSegment(dep0.id, frontDrag);
  assert.equal(badPlan.ok, false, 'Should reject route starting across the front guest path');
  assert.match(badPlan.msg, /rear bay|guest path/i);
});

test('piece-by-piece safari route building, partial rendering, undo, and tile trimming work like coaster/monorail', () => {
  const z = game();
  z.Sim.newGame({ seed: 7, money: 200000 });
  z.state.unlocked.star = 5;
  z.state.elev.fill(0);
  clearFlat(z, 10, 10, 34, 34);

  // Build enclosure at i: 12..24, j: 12..20 (13x9 = 117 tiles)
  fenceRect(z, 12, 12, 24, 20, 'reinforced');
  assert.equal(z.Sim.placeFence({ axis: 'x', i: 16, j: 21 }, 'safari_gate').ok, true);
  assert.equal(z.Sim.placeFence({ axis: 'x', i: 20, j: 21 }, 'safari_gate').ok, true);

  // Place depot at (15, 24, rot=0) => front path at j=26, back exit at j=23!
  assert.equal(z.Sim.placePath(16, 26, 'paved').ok, true);
  const dep = z.Sim.placeObject('safari_depot', 15, 24, 0);
  assert.equal(dep.ok, true, dep.msg);

  const sf = z.Sim.safari;

  // Segment 1: drag just 2 tiles out the back (partial route!)
  const seg1 = [tile(z, 16, 23), tile(z, 16, 22)];
  const r1 = sf.addSegment(dep.id, seg1, { mode: 'outback' });
  assert.equal(r1.ok, true, r1.msg);
  assert.equal(r1.partial, true, 'Segment 1 should be saved as an in-progress partial route');
  assert.equal(r1.complete, false);
  const rtAfter1 = sf.routeOfDepot(dep.id);
  assert.equal(rtAfter1.tiles.length, 2);
  assert.ok(sf.route(rtAfter1.id).pts.length >= 2, 'Partial route should expose polyline points for 3D rendering');

  // Segment 2: extend straight through the airlock gate at j=21 into the enclosure
  const seg2 = [tile(z, 16, 22), tile(z, 16, 21), tile(z, 16, 20), tile(z, 16, 19), tile(z, 16, 18)];
  const r2 = sf.addSegment(dep.id, seg2, { mode: 'outback' });
  assert.equal(r2.ok, true, r2.msg);
  assert.equal(r2.partial, true, 'Still needs >= 7 tiles inside zone');

  // Segment 3: extend 5 more tiles inside the enclosure to complete Out & Back!
  const seg3 = [tile(z, 16, 18), tile(z, 16, 17), tile(z, 16, 16), tile(z, 17, 16), tile(z, 18, 16), tile(z, 19, 16)];
  const r3 = sf.addSegment(dep.id, seg3, { mode: 'outback' });
  assert.equal(r3.ok, true, r3.msg);
  assert.equal(r3.complete, true, 'Route should now be complete and ready!');
  assert.equal(r3.loop, false, 'Out & Back mode must not loop');
  assert.equal(sf.route(sf.routeOfDepot(dep.id).id).ok, true);

  // Trim 2 tiles off the tail with piece-by-piece removeTiles
  const beforeLen = sf.routeOfDepot(dep.id).tiles.length;
  const rm = sf.removeTiles([tile(z, 18, 16)]);
  assert.equal(rm.ok, true);
  assert.equal(rm.n, 2, 'Should trim from (18,16) to end (2 tiles)');
  assert.equal(sf.routeOfDepot(dep.id).tiles.length, beforeLen - 2);

  // Undo restores the trimmed tiles!
  assert.equal(z.Sim.undo().ok, true);
  assert.equal(sf.routeOfDepot(dep.id).tiles.length, beforeLen);

  // Now switch mode to Round Trip (loop) — should tell us to close the loop first
  assert.equal(sf.setRouteMode(dep.id, 'loop').ok, true);
  assert.equal(sf.route(sf.routeOfDepot(dep.id).id).ok, false, 'Unclosed Round Trip route must wait for closure');

  // Extend the loop out the second gate at i=20 and back to the depot rear bay!
  const seg4 = [
    tile(z, 19, 16), tile(z, 20, 16), tile(z, 20, 17), tile(z, 20, 18),
    tile(z, 20, 19), tile(z, 20, 20), tile(z, 20, 21), tile(z, 20, 22),
    tile(z, 20, 23), tile(z, 19, 23), tile(z, 18, 23), tile(z, 17, 23)
  ];
  const r4 = sf.addSegment(dep.id, seg4, { mode: 'loop' });
  assert.equal(r4.ok, true, r4.msg);
  assert.equal(r4.complete, true, 'Loop should now be closed and ready!');
  assert.equal(r4.loop, true);
  const P = sf.route(sf.routeOfDepot(dep.id).id);
  assert.equal(P.ok, true);
  assert.equal(P.loop, true);

  // Toggling between Round Trip and Out & Back on a closed loop works cleanly
  assert.equal(sf.setRouteMode(dep.id, 'outback').ok, true);
  assert.equal(sf.route(sf.routeOfDepot(dep.id).id).loop, false);
  assert.equal(sf.setRouteMode(dep.id, 'loop').ok, true);
  assert.equal(sf.route(sf.routeOfDepot(dep.id).id).loop, true);
});

test('virtual game sweep: guests love the safari (even with monorail), boost park rating, and book Game Reserve tent camps', () => {
  const z = game();
  z.Sim.newGame({ seed: 108, money: 500000 });
  z.state.unlocked.star = 5;
  z.state.elev.fill(0);
  z.DATA.safari.breakdownPerHour = 0;

  // Find entrance tile on the south edge (where main path starts)
  const N = z.N;
  let entI = Math.floor(N / 2), entJ = N - 2;
  for (let j = N - 1; j >= 0; j--) {
    for (let i = 0; i < N; i++) {
      if (z.state.path[i + j * N]) { entI = i; entJ = j; break; }
    }
    if (z.state.path[entI + entJ * N]) break;
  }

  // Clear a large flat area north of the entrance for park + safari reserve
  const baseI = Math.max(8, entI - 14);
  const baseJ = Math.max(8, entJ - 28);
  clearFlat(z, baseI, baseJ, baseI + 28, entJ - 1);

  // Connect main path north from entrance up to the safari depot
  for (let j = entJ; j >= baseJ + 16; j--) {
    z.Sim.placePath(entI, j, 'paved');
  }
  for (let i = entI - 5; i <= entI + 6; i++) {
    z.Sim.placePath(i, baseJ + 16, 'paved');
  }

  // Build essential guest facilities + power
  let pRes = z.Sim.placeObject('michelin_restaurant', entI - 4, baseJ + 17, 2);
  assert.equal(pRes.ok, true, 'restaurant: ' + pRes.msg);
  pRes = z.Sim.placeObject('champagne_lounge', entI + 1, baseJ + 17, 2);
  assert.equal(pRes.ok, true, 'champagne: ' + pRes.msg);
  const toiletDef = z.DATA.buildings.find(b => b.type === 'toilet');
  if (toiletDef) {
    pRes = z.Sim.placeObject(toiletDef.id, entI + 4, baseJ + 17, 2);
    assert.equal(pRes.ok, true, 'toilet: ' + pRes.msg);
  }

  // Build a huge dinosaur Safari Reserve north of the depot!
  const encI0 = baseI + 2, encJ0 = baseJ + 1, encI1 = baseI + 24, encJ1 = baseJ + 11;
  fenceRect(z, encI0, encJ0, encI1, encJ1, 'reinforced');
  const gateI = entI;
  assert.equal(z.Sim.placeFence({ axis: 'x', i: gateI, j: encJ1 + 1 }, 'safari_gate').ok, true);

  // Populate the reserve with iconic dinosaurs!
  assert.ok(z.Sim.spawnAnimal('tyrannosaurus', encI0 + 4, encJ0 + 4, { sex: 'F' }));
  assert.ok(z.Sim.spawnAnimal('triceratops', encI0 + 9, encJ0 + 5, { sex: 'F' }));
  assert.ok(z.Sim.spawnAnimal('triceratops', encI0 + 11, encJ0 + 5, { sex: 'M' }));
  assert.ok(z.Sim.spawnAnimal('brachiosaurus', encI0 + 15, encJ0 + 4, { sex: 'F' }));
  assert.ok(z.Sim.spawnAnimal('stegosaurus', encI0 + 7, encJ0 + 7, { sex: 'F' }));

  // Place Safari Depot facing south onto the paved path at j = baseJ + 16, launching trucks OUT THE BACK (north)!
  const dep = z.Sim.placeObject('safari_depot', gateI - 1, baseJ + 14, 0);
  assert.equal(dep.ok, true, dep.msg);

  // Build an Out & Back Safari track leading out the back (j = baseJ + 13) through the airlock gate into the reserve
  const sf = z.Sim.safari;
  const routeTiles = [];
  for (let j = baseJ + 13; j >= encJ0 + 4; j--) routeTiles.push(tile(z, gateI, j));
  for (let i = gateI - 1; i >= encI0 + 4; i--) routeTiles.push(tile(z, i, encJ0 + 4));
  const rBuild = sf.addSegment(dep.id, routeTiles, { mode: 'outback' });
  assert.equal(rBuild.ok, true, rBuild.msg);
  assert.equal(rBuild.complete, true, rBuild.msg);

  // Buy 3 safari trucks
  for (let k = 0; k < 3; k++) assert.equal(sf.buyVehicle(dep.id).ok, true);

  // Place a Game Reserve Tent Camp DIRECTLY INSIDE the dinosaur reserve (no path touching it — connected via Safari shuttle!)
  const camp = z.Sim.placeObject('safari_tent_camp', gateI + 2, encJ0 + 4, 0);
  assert.equal(camp.ok, true, camp.msg);
  const campObj = z.state.objects.find(o => o.id === camp.id);
  assert.equal(sf.campConnected(campObj), true, 'Tent camp inside reserve should be connected via Safari shuttle');

  // Hire an extra bodyguard so camp is fully protected against the T-Rex
  assert.equal(sf.hireCampGuard(camp.id).ok, true);
  const cInfo = sf.campInfo(camp.id);
  assert.equal(cInfo.guards, 2);
  assert.equal(cInfo.safe, true, 'Camp with 2 bodyguards should be protected with 1 predator');
  assert.ok(cInfo.nightlyPrice > cInfo.basePrice, `Reserve wildlife should boost nightly price (${cInfo.nightlyPrice} > ${cInfo.basePrice})`);
  assert.ok(cInfo.nightlyPrice >= 700, `Expected premium reserve nightly price >= 700, got ${cInfo.nightlyPrice}`);

  // Verify securityAura protects the tent camp area
  const campCtr = { x: (campObj.i + 1.5) * z.TILE, z: (campObj.j + 1.5) * z.TILE };
  const aura = z.Resort.securityAura(campCtr.x, campCtr.z);
  assert.equal(aura.protected, true, 'Camp bodyguards should project VIP safe perimeter');
  assert.ok(aura.safetyBonus >= 4);

  // Verify safari excitement & rating hooks before simulation
  const dInfo0 = sf.depotInfo(dep.id);
  assert.ok(dInfo0.route.excitement >= 60, `Expected high excitement for dino-packed safari, got ${dInfo0.route.excitement}`);
  assert.ok(sf.funCount() > 1, 'Safari should contribute to fun service rating');
  assert.ok(sf.arrivalBonus() > 20, 'Safari should contribute to guest arrivals');

  // Simulate 2 full park days at dt = 0.25s
  const stepsPerDay = Math.ceil(z.Sim.DAY_SECONDS / 0.25);
  for (let step = 0; step < stepsPerDay * 2; step++) {
    z.Sim._step(0.25);
  }

  const stats = sf.stats();
  const dInfo = sf.depotInfo(dep.id);
  assert.ok(stats.riders >= 15, `Expected strong safari ridership over 2 days, got ${stats.riders}`);
  assert.ok(dInfo.income > 0, `Expected safari fare revenue > 0, got ${dInfo.income}`);
  assert.ok(dInfo.sat === null || dInfo.sat >= 65, `Expected happy safari riders (>=65%), got ${dInfo.sat}`);
  assert.ok(sf.ratingBonus() > 0, 'Completed safari rides should grant a park rating bonus');

  // Test VIP guest booking the Game Reserve Tent Camp overnight
  const vip = z.state.guests.find(g => g.state === 'walk');
  if (vip) {
    vip.vip = true;
    vip.money = 5000;
    const booked = z.Resort.tryBookOvernight(vip);
    assert.equal(booked, true, 'VIP guest should book the Game Reserve Tent Camp');
    assert.equal(vip.resortLodging, camp.id);
  }

  // Test save/load round-trip preserves route mode and camp bodyguards
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.Sim.safari.routeModeOf(dep.id), 'outback');
  assert.equal(z.Sim.safari.campInfo(camp.id).guards, 2);
});

test('adversarial fixes: multi-vehicle dispatch, lockdown alight, mid-board save/load, power/portals, balloons, adjacent gates, and undo', () => {
  const z = game();
  z.Sim.newGame({ seed: 202, money: 500000 });
  z.state.unlocked.star = 5;
  z.state.elev.fill(0);
  z.DATA.safari.breakdownPerHour = 0;

  const N = z.N;
  let entI = Math.floor(N / 2), entJ = N - 2;
  for (let j = N - 1; j >= 0; j--) {
    for (let i = 0; i < N; i++) {
      if (z.state.path[i + j * N]) { entI = i; entJ = j; break; }
    }
    if (z.state.path[entI + entJ * N]) break;
  }

  const baseI = Math.max(8, entI - 14);
  const baseJ = Math.max(8, entJ - 28);
  clearFlat(z, baseI, baseJ, baseI + 28, entJ - 1);

  for (let j = entJ; j >= baseJ + 16; j--) z.Sim.placePath(entI, j, 'paved');
  for (let i = entI - 4; i <= entI + 4; i++) z.Sim.placePath(i, baseJ + 16, 'paved');

  // Build two adjacent enclosures sharing a wall at j = baseJ + 6 (leaving 2 straight tiles between depot rear bay at baseJ+13 and gate at baseJ+12)
  const encI0 = baseI + 2, encI1 = baseI + 22;
  fenceRect(z, encI0, baseJ + 1, encI1, baseJ + 5, 'reinforced');
  fenceRect(z, encI0, baseJ + 6, encI1, baseJ + 11, 'reinforced');
  const gateI = entI;
  assert.equal(z.Sim.placeFence({ axis: 'x', i: gateI, j: baseJ + 12 }, 'safari_gate').ok, true);
  assert.equal(z.Sim.placeFence({ axis: 'x', i: gateI, j: baseJ + 6 }, 'safari_gate').ok, true);

  assert.ok(z.Sim.spawnAnimal('triceratops', encI0 + 4, baseJ + 8, { sex: 'F' }));
  assert.ok(z.Sim.spawnAnimal('tyrannosaurus', encI0 + 5, baseJ + 3, { sex: 'F' }));

  const dep = z.Sim.placeObject('safari_depot', gateI - 1, baseJ + 14, 0);
  assert.equal(dep.ok, true, dep.msg);

  const sf = z.Sim.safari;
  const routeTiles = [];
  for (let j = baseJ + 13; j >= baseJ + 3; j--) routeTiles.push(tile(z, gateI, j));
  for (let i = gateI - 1; i >= encI0 + 4; i--) routeTiles.push(tile(z, i, baseJ + 3));
  const rBuild = sf.addSegment(dep.id, routeTiles, { mode: 'outback' });
  assert.equal(rBuild.ok, true, rBuild.msg);
  assert.equal(rBuild.complete, true, rBuild.msg);

  // Verify adjacent-enclosure gate has opposite `ent` on outbound vs inbound crossings and accurate sg
  const P = sf.route(sf.routeOfDepot(dep.id).id);
  const sharedKey = 'x' + gateI + ',' + (baseJ + 6);
  const sharedCrossings = P.gates.filter(g => g.key === sharedKey);
  assert.equal(sharedCrossings.length, 2, 'Out-and-back should cross shared gate twice');
  assert.notEqual(sharedCrossings[0].ent, sharedCrossings[1].ent, 'Outbound and inbound crossings of shared gate must open opposite doors first');
  const sharedGate = sf.gates().find(g => g.key === sharedKey);
  for (const gc of sharedCrossings) {
    const pt = sf.sample(P.id, gc.sg);
    const err = Math.hypot(pt.x - sharedGate.cx, pt.z - sharedGate.cz);
    assert.ok(err < 0.9, `Expected gate sg near gate center (<0.9m), got ${err.toFixed(2)}m`);
  }

  // Buy 3 trucks and verify ALL 3 leave the bay and never double-board simultaneously
  for (let k = 0; k < 3; k++) assert.equal(sf.buyVehicle(dep.id).ok, true);
  const moved = new Set();
  let doubleBoard = false;
  for (let step = 0; step < 2400; step++) {
    z.Sim._step(0.25);
    const vehs = sf.vehiclesOf(dep.id);
    const boarding = vehs.filter(v => v.st === 'board').length;
    if (boarding > 1) doubleBoard = true;
    for (const v of vehs) {
      if (v.s > 2) moved.add(v.id);
    }
  }
  assert.equal(doubleBoard, false, 'Two vehicles must never board simultaneously at the bay');
  assert.ok(moved.size >= 2, `Expected multiple safari vehicles to leave the bay (not just vehicle 1), got ${moved.size}`);

  // Verify save/load mid-boarding does NOT flip rt.alight = true and eject fresh riders
  const v0 = sf.vehiclesOf(dep.id)[0];
  let savedMidBoard = null;
  for (let step = 0; step < 2000; step++) {
    z.Sim._step(0.25);
    const rt0 = sf.vehRt(v0.id);
    if (v0.st === 'board' && !rt0.alight && rt0.pax.length > 0) {
      savedMidBoard = z.Sim.save();
      break;
    }
  }
  if (savedMidBoard) {
    assert.equal(z.Sim.load(savedMidBoard), true);
    const rtAfter = z.Sim.safari.vehRt(v0.id);
    assert.equal(rtAfter.alight, false, 'Mid-boarding load must not flip rt.alight to true');
  }

  // Verify lockdown while boarding with passengers cleanly alights them instead of trapping them
  const vNow = z.Sim.safari.vehiclesOf(dep.id)[0];
  for (let step = 0; step < 2000; step++) {
    z.Sim._step(0.25);
    const rt0 = z.Sim.safari.vehRt(vNow.id);
    if (vNow.st === 'board' && !rt0.alight && rt0.pax.length > 0) {
      assert.equal(z.Sim.safari.setLockdown(true).ok, true);
      for (let k = 0; k < 80; k++) z.Sim._step(0.25);
      assert.equal(z.Sim.safari.vehRt(vNow.id).pax.length, 0, 'Lockdown during boarding must alight passengers instead of trapping them');
      assert.equal(vNow.st, 'idle', 'Vehicle should return to idle after lockdown alighting');
      z.Sim.safari.setLockdown(false);
      break;
    }
  }

  // Verify backup generator keeps gates powered during a cable outage (mainsOK fix)
  assert.equal(z.Sim.placeObject('backup_gen', baseI + 1, baseJ + 16, 0).ok, true);
  z.Sim.power.cut('storm', 4, 'cable');
  for (let k = 0; k < 200; k++) z.Sim._step(0.25);
  assert.equal(z.Sim.safari.gatesPowered(), true, 'Backup generator should keep safari gates powered during a cable outage');

  // Verify Air Safari (balloon) can fly over fenced enclosures without needing a gate
  const pad = z.Sim.placeObject('safari_balloon', encI0 + 2, baseJ + 14, 0);
  assert.equal(pad.ok, true, pad.msg);
  const airTiles = [];
  for (let j = baseJ + 13; j >= baseJ + 6; j--) airTiles.push(tile(z, encI0 + 2, j));
  for (let i = encI0 + 3; i <= encI0 + 6; i++) airTiles.push(tile(z, i, baseJ + 6));
  const airRes = z.Sim.safari.addSegment(pad.id, airTiles, { mode: 'outback' });
  assert.equal(airRes.ok, true, 'Balloon should fly over fenced enclosure: ' + airRes.msg);
  assert.equal(airRes.complete, true, airRes.msg);
  const airP = z.Sim.safari.route(z.Sim.safari.routeOfDepot(pad.id).id);
  assert.equal(airP.gates.length, 0, 'Balloon route should not attach ground airlock gates');

  // Verify removeRoute + undo restores BOTH route and vehicles
  const vehCountBefore = z.Sim.safari.vehiclesOf(dep.id).length;
  assert.ok(vehCountBefore >= 1);
  assert.equal(z.Sim.safari.removeRoute(dep.id).ok, true);
  assert.equal(z.Sim.safari.vehiclesOf(dep.id).length, 0);
  assert.equal(z.Sim.undo().ok, true);
  assert.ok(z.Sim.safari.routeOfDepot(dep.id), 'Undo should restore removed safari route');
  assert.equal(z.Sim.safari.vehiclesOf(dep.id).length, vehCountBefore, 'Undo should restore vehicles removed with the route');
});
