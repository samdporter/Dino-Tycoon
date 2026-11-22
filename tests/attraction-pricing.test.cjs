const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript } = require('./game-scripts.cjs');

function park(zoo) {
  const ctx = vm.createContext({});
  const files = ['00-data.js', zoo ? 'zoo-config.js' : 'dino-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js'];
  for (const file of files) {
    let source = readScript(file, zoo);
    if (file === '20-sim.js') {
      // Exercise the live decision functions with matched guests and random draws.
      source = source.replace('  function pickBuilding(',
        '  Z.testAttractionChoice = { pickBuilding: pickBuilding, chooseGoal: chooseGoal, gxGrid: gxGrid };\n  function pickBuilding(');
    }
    vm.runInContext(source, ctx, { filename: file });
  }
  const z = ctx.Z, { Sim, Coaster, N } = z;
  const s = Sim.newGame({ seed: 2004, money: 300000 });
  const tile = (i, j) => i + j * N;
  for (let j = 28; j <= 44; j++) for (let i = 16; i <= 34; i++) {
    Sim.bulldoze(i, j);
    s.path[tile(i, j)] = 0;
    s.terrain[tile(i, j)] = 0;
  }
  s.elev.fill(0);
  for (let i = 20; i <= 28; i++) Sim.placePath(i, 37, 'paved');
  for (let j = 37; j <= 44; j++) Sim.placePath(27, j, 'paved');
  const ride = Sim.placeObject('coaster_wooden', 20, 35, 0);
  const route = [[23,35],[24,35],[24,34],[24,33],[24,32],[23,32],[22,32],
    [21,32],[20,32],[19,32],[19,33],[19,34],[19,35],[20,35]];
  assert.ok(ride.ok && Coaster.buildTrack(route.map(([i, j]) => tile(i, j))).ok);
  assert.ok(Coaster.stationReady(ride.id));
  const arcade = Sim.placeObject('ring_toss_stand', 24, 36, 0);
  assert.ok(arcade.ok);
  Sim._rt().speciesCount = 2;
  z.testAttractionChoice.gxGrid();
  const venues = [ride.id, arcade.id].map(id => s.objects.find(o => o.id === id));
  const guest = () => ({
    ti: tile(21, 37), x: 43, z: 75, tol: 1.6, money: 20, seenB: {}, seenEnc: {},
    al: { act: 3, shop: 0, treat: 0, meal: 0, drink: 0 },
    nbuy: 0, nSeen: 0, done: 1, hunger: 0, thirst: 0, bladder: 0, energy: 90, fun: 70
  });
  return { z, s, ride, venues, guest };
}

test('affordable coaster discounts improve consideration and selection in both games', () => {
  for (const zoo of [false, true]) {
    const { z, ride, venues, guest } = park(zoo);
    const { Sim, rng, testAttractionChoice: choice } = z;
    function choices(price, pick) {
      Sim.setPrice(ride.id, price);
      let selected = 0;
      for (let i = 0; i < 400; i++) {
        rng.seed(Math.imul(i + 17, 2654435761) >>> 0);
        const g = guest();
        pick(g);
        if (g.gid === ride.id) selected++;
      }
      return selected;
    }
    const rank = g => choice.pickBuilding(g, venues, 'act');
    assert.ok(choices(1, rank) > choices(8, rank));
    assert.ok(choices(1, choice.chooseGoal) > choices(8, choice.chooseGoal));
    assert.equal(choices(24, rank), 0);
    assert.ok(Sim.attractionDemand(ride.id).priceRejected > 0);
  }
});

test('ride demand expires and fare changes clear the previous fare observations', () => {
  for (const zoo of [false, true]) {
    const { z, s, ride, venues, guest } = park(zoo);
    const { Sim, testAttractionChoice: choice } = z;
    const [station] = venues;
    const consider = () => choice.pickBuilding(guest(), [station], 'act');
    Sim.setPrice(ride.id, 24);
    assert.equal(consider(), false);
    assert.equal(Sim.attractionDemand(ride.id).priceRejected, 1);
    Sim.setPrice(ride.id, 24);
    assert.equal(Sim.attractionDemand(ride.id).priceRejected, 1);
    Sim.setPrice(ride.id, 0);
    assert.equal(Sim.attractionDemand(ride.id).priceRejected, 0);
    assert.equal(consider(), true);
    assert.equal(Sim.attractionDemand(ride.id).selected, 1);
    s.day += 1;
    assert.equal(Sim.attractionDemand(ride.id).selected, 0);

    Sim._rt().bq[ride.id] = { q: Array(40).fill(-1), use: 0 };
    assert.equal(consider(), false);
    assert.equal(Sim.attractionDemand(ride.id).queueRejected, 1);
  }
});

test('coaster mechanics only target stations in their reachable staff network', () => {
  for (const zoo of [false, true]) {
    const { z, venues, guest } = park(zoo);
    const station = venues[0], staff = { ti: guest().ti };
    const rt = z.coasterCtx.getRT();
    const staffNetwork = rt.scomp || rt.comp;
    station.broken = true;
    const comp = staffNetwork[staff.ti];
    assert.ok(comp > 0);
    assert.equal(z.Coaster.pickMechanicTarget(staff, comp).station.id, station.id);
    assert.equal(z.Coaster.pickMechanicTarget(staff, comp + z.N * z.N), null);
    assert.equal(z.Coaster.hasUrgentMechanicWork(staff, comp + z.N * z.N), false);
  }
});
