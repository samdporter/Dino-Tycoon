const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript } = require('./game-scripts.cjs');

function zoo(seed) {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, URL: globalThis.URL || {}, Blob: globalThis.Blob || {}, FileReader: globalThis.FileReader || {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { protocol: 'http:' }, performance: { now: () => 0 } });
  for (const file of ['00-data.js', 'zoo-config.js', '10-core.js', '19-sim-common.js', '20-sim.js', '21-sim-coaster.js']) {
    vm.runInContext(readScript(file, true), ctx, { filename: file });
  }
  const z = ctx.Z;
  z.Sim.newGame({ seed, map: 'meadow', money: 250000 });
  z.state.unlocked.star = 3;
  return z;
}

function buildWooden(z) {
  const { Sim, Coaster, N } = z;
  for (let j = 31; j <= 38; j++) for (let i = 18; i <= 26; i++) {
    const id = z.state.tileObj[i + j * N];
    if (id) { const o = z.state.objects.find(x => x.id === id); if (o) Sim.bulldoze(o.i, o.j); }
    z.state.terrain[i + j * N] = 0;
    z.state.path[i + j * N] = 0;
    z.state.elev[i + j * (N + 1)] = 0;
    z.state.elev[(i + 1) + j * (N + 1)] = 0;
    z.state.elev[i + (j + 1) * (N + 1)] = 0;
    z.state.elev[(i + 1) + (j + 1) * (N + 1)] = 0;
  }
  const station = Sim.placeObject('coaster_wooden', 20, 35, 0);
  assert.ok(station.ok, station.msg);
  const t = (i, j) => i + j * N;
  const route = [t(23,35),t(24,35),t(24,34),t(24,33),t(24,32),t(23,32),t(22,32),t(21,32),t(20,32),t(19,32),t(19,33),t(19,34),t(19,35),t(20,35)];
  assert.ok(Coaster.buildTrack(route).ok);
  return { station, route };
}

test('a custom coaster does not create extra guest wallet cash', () => {
  const z = zoo(2026), { Sim, state: S } = z;
  buildWooden(z);
  for (let i = 20; i <= 28; i++) Sim.placePath(i, 37, 'paved');
  for (let j = 37; j <= 44; j++) Sim.placePath(27, j, 'paved');
  let count = 0, maxWallet = 0;
  z.bus.on('guestAdded', g => { count++; maxWallet = Math.max(maxWallet, g.money); });
  for (let k = 0; k < 600 && count < 20; k++) Sim._step(0.5);
  assert.ok(count > 0, 'seeded game should admit guests');
  assert.ok(maxWallet <= 45, `guest wallet ${maxWallet} should reflect the standard budget without ride gifts`);
});

test('an included starter train cannot be resold after rebuilding its circuit or save/load', () => {
  const z = zoo(2027), { state: S, Coaster, Sim } = z;
  const { station, route } = buildWooden(z);
  assert.equal(Coaster.valueBonus(), 0, 'a disconnected station adds no admission value');
  for (let i = 20; i <= 28; i++) Sim.placePath(i, 37, 'paved');
  for (let j = 37; j <= 44; j++) Sim.placePath(27, j, 'paved');
  assert.ok(Coaster.valueBonus() > 0, 'a connected operating coaster adds admission value');
  Coaster.setPaused(station.id, true);
  assert.equal(Coaster.valueBonus(), 0, 'a paused coaster adds no admission value');
  Coaster.setPaused(station.id, false);
  const starter = Coaster.trainsOnStation(station.id)[0];
  const persisted = JSON.parse(JSON.stringify(S));
  assert.equal(persisted.objects.find(o => o.id === station.id).starterTrainGranted, true);
  const beforeSale = S.money;
  const starterSale = Coaster.sellTrain(starter.id);
  assert.ok(starterSale.ok);
  assert.equal(S.money, beforeSale);
  Coaster.removeTiles(route);
  assert.ok(Coaster.buildTrack(route).ok);
  assert.equal(Coaster.trainsOnStation(station.id).length, 0);
  const saved = Sim.save();
  Sim.newGame({ seed: 9001, map: 'meadow', money: 250000 });
  assert.equal(Sim.load(saved), true);
  Coaster.removeTiles(route);
  assert.ok(Coaster.buildTrack(route).ok);
  assert.equal(Coaster.trainsOnStation(station.id).length, 0);
  const purchase = Coaster.buyTrain(station.id, 3);
  assert.ok(purchase.ok, purchase.msg);
  const paidSale = Coaster.sellTrain(purchase.id);
  assert.ok(paidSale.ok);
  assert.ok(paidSale.cost < 0, 'purchased train and paid extra car retain their refund');
  const legacyPurchase = Coaster.buyTrain(station.id, 2);
  assert.ok(legacyPurchase.ok, legacyPurchase.msg);
  const legacyTrain = z.state.coaster.trains.find(t => t.id === legacyPurchase.id);
  delete legacyTrain.starter;
  assert.equal(Coaster.sellTrain(legacyTrain.id).cost, -Math.floor(Coaster.TYPES.wooden.trainCost * 0.6),
    'unknown legacy provenance preserves the train base refund');
});
