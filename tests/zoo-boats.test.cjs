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
