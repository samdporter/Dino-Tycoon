// Zoo water transport and helipads. Run with: node --test tests/zoo-boats.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript } = require('./game-scripts.cjs');

function game() {
  const ctx = vm.createContext({ console, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') });
  vm.runInContext('var window=globalThis', ctx);
  for (const f of ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js', '25-sim-boats.js']) {
    vm.runInContext(readScript(f, true), ctx, { filename: f });
  }
  return ctx.Z;
}

// West land joins the gate walkway, a river runs north-south at i 38..42, east land is cut off,
// and a separate lake with its own landing sits on the far west.
const ROW = 42, RIVER = [38, 42], WEST_PIER = [36, 40], EAST_PIER = [43, 40], LAKE_PIER = [20, 44];

function setup() {
  const z = game();
  z.Sim.newGame(1, { money: 1000000 });
  const S = z.state, N = z.N, D = z.DATA;
  S.unlocked.star = 4;
  const land = D.terrain.findIndex(t => t.id !== 'water' && t.id === 'grass');
  const water = D.terrain.findIndex(t => t.id === 'water');
  S.objects.length = 0;
  for (let j = 30; j < 52; j++) for (let i = 10; i < 54; i++) {
    const t = i + j * N;
    S.terrain[t] = land; S.path[t] = 0; S.dirt[t] = 0;
    if (i >= RIVER[0] && i <= RIVER[1]) S.terrain[t] = water;
    if (i >= 14 && i <= 19 && j >= 44 && j <= 48) S.terrain[t] = water;
  }
  for (let j = 30; j <= 53; j++) for (let i = 10; i <= 54; i++) {
    S.elev[i + j * (N + 1)] = 0;
  }
  const lay = (i0, i1, j, id) => { for (let i = i0; i <= i1; i++) z.Sim.placePath(i, j, id || 'paved'); };
  for (let j = 40; j < 52; j++) lay(27, 28, j);
  return { z, S, N, water, lay, tile: (i, j) => i + j * N, rt: () => z.Sim._rt() };
}
function build(z, type, at) {
  const r = z.Sim.placeObject(type, at[0], at[1], 0);
  assert.equal(r.ok, true, type + ': ' + r.msg);
  return r.id;
}
function landLayout(h) {
  h.lay(27, 37, ROW); h.lay(43, 50, ROW); h.lay(20, 24, 46);
}
function addGuest(z, tile) {
  const N = z.N, S = z.state, rt = z.Sim._rt();
  const g = {
    id: 9000 + S.guests.length, name: 'Test', seed: 1, x: (tile % N + 0.5) * z.TILE, z: (Math.floor(tile / N) + 0.5) * z.TILE, heading: 0, speed: 0, state: 'walk',
    hunger: 10, thirst: 10, bladder: 10, energy: 90, happiness: 70, money: 80, thought: '', thoughtT: 0, seen: {}, seenEnc: {}, seenB: {}, group: 9000 + S.guests.length,
    ti: tile, ni: -1, lo: 0, lo2: 0, bs: 3, gt: '', gid: 0, dk: '', wt: 0, nt: 0.5, acc: 0, tcool: 0, fun: 40, mood: 0, lit: false, stay: 1e5, stay0: 1e5, pv: 0,
    tol: 1.6, thor: 0.8, al: { meal: 0, drink: 0, treat: 0, shop: 0, act: 0 }, nbuy: 1e5
  };
  g.px = g.x; g.pz = g.z;
  S.guests.push(g); rt.gById.set(g.id, g);
  return g;
}
function run(z, seconds, until) {
  for (let t = 0; t < seconds; t += 0.1) { z.Sim._step(0.1); if (until && until()) return true; }
  return false;
}

test('pontoons float on water only and join paths on either shore', () => {
  const h = setup(), { z } = h;
  landLayout(h);
  const rt = h.rt();
  assert.notEqual(rt.comp[h.tile(30, ROW)], rt.comp[h.tile(45, ROW)]);
  assert.equal(z.Sim.placePath(30, 50, 'pontoon').ok, false);
  assert.equal(z.Sim.placePath(RIVER[0], 38, 'paved').ok, false);
  const cost = z.Sim.placePath(RIVER[0], ROW, 'pontoon');
  assert.equal(cost.ok, true);
  assert.ok(cost.cost > z.DATA.paths.find(p => p.id === 'cobble').cost);
  for (let i = RIVER[0] + 1; i <= RIVER[1]; i++) assert.equal(z.Sim.placePath(i, ROW, 'pontoon').ok, true);
  const rt2 = h.rt();
  assert.equal(rt2.comp[h.tile(30, ROW)], rt2.comp[h.tile(45, ROW)]);
});

test('guest piers link path networks on the same water only', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const west = h.tile(30, ROW), east = h.tile(45, ROW), lake = h.tile(22, 46);
  assert.equal(z.Sim.canGuestReach(west, east), false);
  build(z, 'guest_pier', WEST_PIER);
  assert.equal(z.Sim.canGuestReach(west, east), false);
  build(z, 'guest_pier', EAST_PIER);
  assert.equal(z.Sim.canGuestReach(west, east), true);
  assert.equal(z.Sim.canGuestReach(east, west), true);
  build(z, 'guest_pier', LAKE_PIER);
  assert.equal(z.Sim.canGuestReach(west, lake), false);
  assert.equal(z.Sim.canGuestReach(east, lake), false);
  assert.equal(h.rt().comp[west] !== h.rt().comp[east], true);
  assert.equal(S.objects.filter(o => o.type === 'guest_pier').length, 3);
});

test('only pontoons and guest piers are available at the start', () => {
  const z = game();
  z.Sim.newGame(1);
  const stars = Object.fromEntries(z.DATA.buildings.map(b => [b.id, b.star]));
  assert.equal(stars.guest_pier, 0);
  assert.ok(stars.service_pier > 0 && stars.staff_helipad > 0 && stars.vip_helipad > 0);
  assert.equal(z.DATA.paths.find(p => p.id === 'pontoon').star || 0, 0);
});

test('piers need water beside them and a path in front', () => {
  const h = setup(), { z } = h;
  landLayout(h);
  assert.equal(z.Sim.placeObject('guest_pier', 30, 36, 0).ok, false);
  assert.equal(z.Sim.placeObject('guest_pier', EAST_PIER[0], 35, 0).ok, false);
  assert.equal(z.Sim.placeObject('guest_pier', EAST_PIER[0], EAST_PIER[1], 0).ok, true);
});

test('a guest crossing by boat pays the fare and arrives on the far shore', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const west = build(z, 'guest_pier', WEST_PIER), east = build(z, 'guest_pier', EAST_PIER);
  S.time = 0.5;
  const rt = h.rt(), g = addGuest(z, h.tile(30, ROW)), target = h.tile(47, ROW);
  assert.equal(z.Sim.setPrice(west, 6).ok, true);
  const before = g.money, p = z.Boats.plan(g, 't' + target);
  assert.ok(p, 'a route exists');
  g.gt = 'enc'; g.dk = 't' + target; g.spot = target;
  z.Boats.start(g, p);
  let boated = false;
  const arrived = run(z, 120, () => { boated = boated || g.state === 'boat'; return boated && g.state !== 'boat'; });
  assert.ok(arrived && boated);
  assert.equal(rt.comp[g.ti], rt.comp[target]);
  assert.equal(g.money, before - 6);
  assert.equal(S.finance.today.boats, 6);
  assert.equal(S.boats.income, 6);
  assert.equal(S.objects.find(o => o.id === west).income, 6);
  assert.equal(S.objects.find(o => o.id === east).income || 0, 0);
});

test('a free pier charges nothing and an unaffordable fare is refused', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const west = build(z, 'guest_pier', WEST_PIER); build(z, 'guest_pier', EAST_PIER);
  const g = addGuest(z, h.tile(30, ROW)), target = h.tile(47, ROW);
  z.Sim.setPrice(west, 30);
  assert.equal(z.Boats.plan(g, 't' + target), null);
  z.Sim.setPrice(west, 0);
  assert.ok(z.Boats.plan(g, 't' + target));
});

test('service piers are never used by guests but let staff reach other networks', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const west = h.tile(30, ROW), east = h.tile(45, ROW);
  S.time = 0.5; S.dirt[east] = 200;
  const cleaner = z.Sim.hireStaff('cleaner', 30, ROW);
  assert.equal(cleaner.ok, true);
  assert.equal(run(z, 60, () => S.dirt[east] < 40), false, 'cleaner cannot cross without a link');
  build(z, 'service_pier', [37, 40]); build(z, 'service_pier', EAST_PIER);
  assert.equal(z.Sim.canGuestReach(west, east), false);
  assert.equal(z.Boats.plan(addGuest(z, west), 't' + east), null);
  assert.equal(run(z, 400, () => S.dirt[east] < 40), true, 'cleaner crossed and swept');
  assert.equal(S.finance.today.boats || 0, 0);
});

test('staff may ride guest piers for free', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const east = h.tile(45, ROW);
  build(z, 'guest_pier', WEST_PIER); build(z, 'guest_pier', EAST_PIER);
  S.time = 0.5; S.dirt[east] = 200;
  z.Sim.hireStaff('cleaner', 30, ROW);
  assert.equal(run(z, 400, () => S.dirt[east] < 40), true);
  assert.equal(S.finance.today.boats || 0, 0);
});

test('two staff helipads link networks for staff without water', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const east = h.tile(45, ROW), west = h.tile(30, ROW);
  for (let i = RIVER[0]; i <= RIVER[1]; i++) for (let j = 30; j < 52; j++) S.terrain[i + j * h.N] = S.terrain[10 + j * h.N];
  S.time = 0.5; S.dirt[east] = 200;
  z.Sim.hireStaff('cleaner', 30, ROW);
  build(z, 'staff_helipad', [34, 40]);
  assert.equal(run(z, 30, () => S.dirt[east] < 40), false);
  build(z, 'staff_helipad', [44, 40]);
  assert.equal(z.Sim.canGuestReach(west, east), false);
  assert.equal(run(z, 400, () => S.dirt[east] < 40), true);
});

test('a VIP helipad flies in VIPs who pay the arrival fee, spend more and leave by air', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const pad = build(z, 'vip_helipad', [30, 38]);
  assert.equal(z.Sim.placeObject('vip_helipad', 12, 33, 0).ok, false, 'must touch a path');
  S.time = 0.5; S.boats.vipT = 0;
  const fee = S.objects.find(o => o.id === pad).price, tickets = S.finance.today.tickets;
  assert.equal(run(z, 30, () => S.boats.vips > 0), true);
  assert.ok(S.finance.today.tickets - tickets >= fee);
  const vip = S.guests.find(g => g.vip);
  assert.ok(vip);
  assert.equal(S.boats.vipIncome, fee);
  assert.ok(vip.money > 17 * 2);
  z.Sim.setOpen && z.Sim.setOpen(false);
  assert.equal(run(z, 200, () => !S.guests.some(g => g.vip)), true);
});

test('piers and boat income survive save and load, and old saves still load', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  build(z, 'guest_pier', WEST_PIER); build(z, 'guest_pier', EAST_PIER);
  S.boats.income = 42; S.boats.trips = 7;
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  const west = h.tile(30, ROW), east = h.tile(45, ROW);
  assert.equal(z.Sim.canGuestReach(west, east), true);
  assert.equal(z.state.boats.income, 42);
  assert.equal(z.state.boats.trips, 7);
  assert.equal(z.state.path[h.tile(RIVER[0], 30)], 0);

  const old = JSON.parse(saved);
  delete old.s.boats; delete old.s.finance.today.boats;
  assert.equal(z.Sim.load(JSON.stringify(old)), true);
  assert.equal(z.state.boats.trips, 0);
  assert.equal(z.Sim.canGuestReach(west, east), true);
});

test('pontoons persist through save and load', () => {
  const h = setup(), { z } = h;
  landLayout(h);
  for (let i = RIVER[0]; i <= RIVER[1]; i++) z.Sim.placePath(i, ROW, 'pontoon');
  assert.equal(z.Sim.load(z.Sim.save()), true);
  const rt = h.rt();
  assert.equal(rt.comp[h.tile(30, ROW)], rt.comp[h.tile(45, ROW)]);
});

test('multiple guests queue at a guest pier and share one big ferry with dwell and distinct deck seats', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  const west = build(z, 'guest_pier', WEST_PIER), east = build(z, 'guest_pier', EAST_PIER);
  z.Sim.setPrice(west, 4);
  S.time = 0.5;
  const rt = h.rt(), target = h.tile(47, ROW);
  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'ferry').length, 1);

  const guests = [];
  for (let i = 0; i < 5; i++) {
    const g = addGuest(z, h.tile(35, ROW));
    g.gt = 'enc'; g.dk = 't' + target; g.spot = target;
    const p = z.Boats.plan(g, 't' + target);
    assert.ok(p);
    z.Boats.start(g, p);
    guests.push(g);
  }

  // Advance until all 5 reach pier queue or board the ferry
  assert.equal(run(z, 15, () => guests.every(g => g.state === 'queue' || g.state === 'boat')), true);
  // Check queue limit helpers
  const sampleQ = { gt: 'pier', pend: { state: 'walk' } };
  assert.equal(z.Boats.queueLimit(sampleQ), z.Boats.PIER_QUEUE_LIMIT);
  assert.equal(z.Boats.queueLimit({ gt: 'pier', pend: { state: 'leave' } }), Infinity);
  assert.equal(z.Boats.queueLimit({ gt: 'bld' }), 22);

  // Ferry should still be a single vessel and passengers should have distinct deck seat coordinates while aboard
  let sawAllAboard = false, distinctCoords = 0;
  const arrived = run(z, 40, () => {
    const ferries = z.Boats.vehicles().filter(v => v.kind === 'ferry');
    assert.equal(ferries.length, 1);
    if (guests.every(g => g.state === 'boat')) {
      sawAllAboard = true;
      const pts = new Set(guests.map(g => `${g.x.toFixed(2)},${g.z.toFixed(2)}`));
      distinctCoords = Math.max(distinctCoords, pts.size);
    }
    return sawAllAboard && guests.every(g => g.state !== 'boat' && g.state !== 'queue');
  });
  assert.equal(arrived, true);
  assert.equal(sawAllAboard, true);
  assert.equal(distinctCoords, 5, 'each guest sits at a distinct ferry deck offset');
  for (const g of guests) assert.equal(rt.comp[g.ti], rt.comp[target]);
  assert.equal(S.boats.income, 20);
  assert.equal(S.boats.trips, 5);
});

test('ferry departs immediately at full capacity without waiting full dwell', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  build(z, 'guest_pier', WEST_PIER); build(z, 'guest_pier', EAST_PIER);
  S.time = 0.5;
  const target = h.tile(47, ROW);
  const guests = [];
  for (let i = 0; i < z.Boats.FERRY_CAP; i++) {
    const g = addGuest(z, h.tile(36, ROW));
    g.gt = 'enc'; g.dk = 't' + target; g.spot = target;
    const p = z.Boats.plan(g, 't' + target);
    z.Boats.start(g, p);
    guests.push(g);
  }
  assert.equal(run(z, 5, () => {
    const f = z.Boats.vehicles().find(v => v.kind === 'ferry');
    return f && f.state === 'sail' && f.pax.length === z.Boats.FERRY_CAP;
  }), true, 'full ferry departs immediately before dwell expires');
});

test('ferry count is adjustable up to FERRY_MAX and persists through save and load', () => {
  const h = setup(), { z } = h;
  landLayout(h);
  const west = build(z, 'guest_pier', WEST_PIER);
  const east = build(z, 'guest_pier', EAST_PIER);
  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'ferry').length, 1);

  assert.equal(z.Boats.setFerries(west, 3).ok, true);
  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'ferry').length, 3);
  assert.equal(z.Boats.pierStats(z.state.objects.find(o => o.id === east)).ferries, 3);

  z.Boats.setFerries(west, 99);
  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'ferry').length, z.Boats.FERRY_MAX);

  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'ferry').length, z.Boats.FERRY_MAX);

  z.Boats.setFerries(west, 0);
  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'ferry').length, 1);
});

test('ferries keep operating after closing time so leaving guests on islands can exit', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  build(z, 'guest_pier', WEST_PIER); build(z, 'guest_pier', EAST_PIER);
  S.time = 0.5;
  const g = addGuest(z, h.tile(46, ROW));
  z.Sim.setOpen(false);
  let boated = false;
  const returned = run(z, 60, () => {
    boated = boated || g.state === 'boat';
    return boated && g.state === 'leave' && h.rt().comp[g.ti] === h.rt().comp[h.tile(30, ROW)];
  });
  assert.equal(returned, true, 'leaving guest ferried back to mainland after closing');
});

test('service piers cap service boats and extra staff wait and cross once a boat frees up', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  // 1 service pier on west + 1 guest pier on east => 2 service boats total
  build(z, 'service_pier', [37, 40]);
  build(z, 'guest_pier', EAST_PIER);
  S.time = 0.5;
  const east = h.tile(45, ROW);
  for (let i = 45; i <= 48; i++) S.dirt[h.tile(i, ROW)] = 240;

  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'service').length, 2);

  // Hire 4 cleaners simultaneously on west shore
  for (let k = 0; k < 4; k++) assert.equal(z.Sim.hireStaff('cleaner', 35, ROW).ok, true);

  let sawCapRespected = false;
  const cleaned = run(z, 120, () => {
    const svcs = z.Boats.vehicles().filter(v => v.kind === 'service');
    assert.ok(svcs.length <= 2, 'service boats never exceed cap of 2');
    const riding = S.staff.filter(s => s.state === 'boat').length;
    assert.ok(riding <= 2, 'at most 2 staff ride service boats simultaneously');
    if (riding === 2) sawCapRespected = true;
    return [45, 46, 47, 48].every(i => S.dirt[h.tile(i, ROW)] < 40);
  });
  assert.equal(sawCapRespected, true);
  assert.equal(cleaned, true);

  // Adding more service piers caps at SERVICE_MAX_PER_NET (6)
  h.lay(27, 37, 38); h.lay(27, 37, 47); h.lay(43, 50, 38);
  build(z, 'service_pier', [37, 36]);
  build(z, 'service_pier', [37, 45]);
  build(z, 'service_pier', [43, 36]);
  assert.equal(z.Boats.vehicles().filter(v => v.kind === 'service').length, z.Boats.SERVICE_MAX_PER_NET);
});

test('demolishing a pier cleans up queuing and aboard guests safely', () => {
  const h = setup(), { z, S } = h;
  landLayout(h);
  build(z, 'guest_pier', WEST_PIER);
  build(z, 'guest_pier', EAST_PIER);
  S.time = 0.5;
  const target = h.tile(47, ROW);
  const gSail = addGuest(z, h.tile(36, ROW));
  gSail.gt = 'enc'; gSail.dk = 't' + target; gSail.spot = target;
  z.Boats.start(gSail, z.Boats.plan(gSail, 't' + target));

  // Wait until ferry actually departs and is sailing mid-water
  assert.equal(run(z, 20, () => {
    const f = z.Boats.vehicles().find(v => v.kind === 'ferry');
    return f && f.state === 'sail' && gSail.state === 'boat';
  }), true);

  // Now queue a second guest at WEST_PIER while the sole ferry is out on the water
  const gQueue = addGuest(z, h.tile(36, ROW));
  gQueue.gt = 'enc'; gQueue.dk = 't' + target; gQueue.spot = target;
  z.Boats.start(gQueue, z.Boats.plan(gQueue, 't' + target));
  assert.equal(run(z, 4, () => gQueue.state === 'queue'), true);

  // Demolish destination pier while gSail is mid-water and gQueue is waiting for it
  assert.equal(z.Sim.bulldoze(EAST_PIER[0], EAST_PIER[1]).ok, true);

  assert.equal(run(z, 30, () => gSail.state !== 'boat' && gQueue.state !== 'boat' && gQueue.state !== 'queue'), true);
  assert.equal(gSail.pend, null);
  assert.equal(gQueue.pend, null);
  assert.ok(S.path[gSail.ti] > 0, 'returning guest landed on a valid path tile');
  assert.ok(S.path[gQueue.ti] > 0, 'queuing guest remains on a valid path tile');

  // Also test demolishing the departure pier while a guest is queued at it (with 2 other piers remaining)
  S.time = 0.5;
  h.lay(43, 50, 36);
  build(z, 'guest_pier', EAST_PIER);
  build(z, 'guest_pier', [43, 34]);
  // Fill the ferry with 16 guests so it departs immediately, leaving gQueue2 queuing at WEST_PIER
  for (let i = 0; i < z.Boats.FERRY_CAP; i++) {
    const fg = addGuest(z, h.tile(36, ROW));
    fg.gt = 'enc'; fg.dk = 't' + target; fg.spot = target;
    z.Boats.start(fg, z.Boats.plan(fg, 't' + target));
  }
  const gQueue2 = addGuest(z, h.tile(35, ROW));
  gQueue2.gt = 'enc'; gQueue2.dk = 't' + target; gQueue2.spot = target;
  z.Boats.start(gQueue2, z.Boats.plan(gQueue2, 't' + target));
  assert.equal(run(z, 5, () => gQueue2.state === 'queue'), true);
  assert.equal(z.Sim.bulldoze(WEST_PIER[0], WEST_PIER[1]).ok, true);
  assert.notEqual(gQueue2.state, 'queue');
  assert.equal(gQueue2.pend, null);
  assert.ok(S.path[gQueue2.ti] > 0);
});
