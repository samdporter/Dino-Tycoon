// Attraction and facility rating behavior for both games.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');

function loadGame(zooGame) {
  function node() { return { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {}, innerHTML: '', className: '' }; }
  const values = new Map(), title = node(), ui = node();
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, URL: globalThis.URL || {}, Blob: globalThis.Blob || {},
    document: { readyState: 'loading', hidden: false, addEventListener() {}, getElementById: id => id === 'title' ? title : ui },
    location: { protocol: 'http:' }, performance: { now: () => 0 }, localStorage: { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) } });
  vm.runInContext('var window=globalThis', ctx);
  const load = file => vm.runInContext(readScript(file, zooGame), ctx);
  const simFiles = simulationScripts(zooGame);
  simFiles.forEach(load);
  const z = ctx.Z;
  z.UI = { h: node, ic: () => '', snd() {}, toast() {}, reset() {}, closeModal() {}, narrow: () => false, Tutorial: { restart() {} }, el: { cards: node() } };
  z.World = { cam: { target: { x: 0, z: 0 } }, resize() {} }; z.Audio = { enabled: () => true, setEnabled() {} };
  z.Sim.newGame(zooGame ? 123 : { seed: 123, map: 'meadow', money: 500000 });
  return z;
}

test('Dino and Zoo rating breakdowns expose normalized weights and current demand', () => {
  for (const zooGame of [false, true]) {
    const z = loadGame(zooGame), rb = z.Sim.ratingBreakdown();
    for (const k of ['animals', 'welfare', 'guests', 'facilities', 'cleanliness', 'scenery']) assert.ok(rb[k] >= 0 && rb[k] <= 1);
    assert.ok(rb.serviceDemand >= z.state.guests.length);
    assert.equal(rb.animalCount, z.state.animals.length);
    assert.equal(rb.speciesCount, new Set(z.state.animals.map(a => a.species)).size);
    assert.equal(typeof rb.baseStars, 'number');
    assert.equal(typeof rb.attractionBonus, 'number');
    assert.equal(rb.collectionCap, zooGame ? 0.5 : null);
    for (const k of ['food', 'drink', 'toilet', 'bench', 'bin', 'fun']) assert.deepEqual(Object.keys(rb.services[k]).sort(), ['capacity', 'needed']);
  }
});

test('Dino attraction bonus needs completed rides and stays bounded', () => {
  const z = loadGame(false), before = z.Sim.ratingBreakdown(); let S = z.state;
  S.stats.ridesTaken = 100000;
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0);
  const N = z.N, area = new Set();
  for (let j = 30; j <= 42; j++) for (let i = 20; i <= 32; i++) area.add(i + j * N);
  const remove = new Set();
  for (const t of area) { const id = S.tileObj[t]; if (id) remove.add(id); S.path[t] = 0; S.terrain[t] = 0; }
  for (const id of remove) { const o = S.objects.find(x => x.id === id); if (o) z.Sim.bulldoze(o.i, o.j); }
  z.Sim.load(z.Sim.save());
  S = z.state; S.unlocked.star = 3;
  for (let j = 37; j <= 55; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 20; i <= 27; i++) z.Sim.placePath(i, 37, 'paved');
  let venue = null;
  let placement = null;
  placement = z.Sim.placeObject('ring_toss_stand', 26, 36, 0);
  if (placement && placement.ok) venue = z.state.objects.find(o => o.type === 'ring_toss_stand');
  assert.ok(venue, 'a real ride can be placed on the starting map: ' + (placement && (placement.msg || placement.why)));
  assert.equal(z.Sim.objectReport(venue.id).connected, true);
  z.coasterCtx.recordRatingRide(venue.id, 10);
  const after = z.Sim.ratingBreakdown();
  assert.ok(after.attractionBonus > 0);
  assert.ok(after.attractionBonus <= 0.35);
  assert.ok(after.stars > before.stars);
  venue.paused = true;
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0);
  venue.paused = false;
  venue.broken = true;
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0);
  venue.broken = false;
  S.ratingRideDays = [{ day: S.day - 4, rides: [{ venue: venue.id, count: 1000, quality: 10 }] }];
  assert.equal(z.Sim.ratingBreakdown().attractionBonus, 0);
});

test('old saves without demand or ride history rate safely in both games', () => {
  for (const zooGame of [false, true]) {
    const z = loadGame(zooGame), save = JSON.parse(z.Sim.save());
    delete save.s.ratingDemandDays; delete save.s.ratingTodayPeak; delete save.s.ratingRideDays;
    assert.equal(z.Sim.load(JSON.stringify(save)), true);
    const rb = z.Sim.ratingBreakdown();
    assert.ok(Number.isFinite(rb.stars));
    assert.equal(rb.attractionBonus, 0);
    assert.ok(rb.serviceDemand >= z.state.guests.length);
  }
});

test('facility rating counts connected drink service against recent attendance in both games', () => {
  for (const zooGame of [false, true]) {
    const z = loadGame(zooGame);
    const { Sim, state: s, N } = z;
    s.elev.fill(0);
    const clear = (i, j) => {
      Sim.bulldoze(i, j);
      s.terrain[i + j * N] = 0;
    };
    clear(14, 23);
    clear(26, 50);
    const remote = Sim.placeObject('drinks_stall', 14, 23, 0);
    const connected = Sim.placeObject('drinks_stall', 26, 50, 1);
    clear(26, 49);
    const bin = Sim.placeObject('bin', 26, 49, 1);
    assert.ok(remote.ok && connected.ok);
    assert.equal(Sim.objectReport(remote.id).connected, false);
    assert.equal(Sim.objectReport(connected.id).connected, true);

    s.stats.peakGuests = 340;
    s.ratingDemandDays = [60, 60, 60];
    let rating = Sim.ratingBreakdown();
    assert.equal(rating.serviceDemand, 60);
    assert.equal(rating.services.drink.capacity, 1);
    assert.equal(rating.services.drink.needed, 2);
    assert.equal(rating.services.bin.capacity, 1);
    s.objects.find(o => o.id === bin.id).fill = 15;
    assert.equal(Sim.ratingBreakdown().services.bin.capacity, 0);

    assert.equal(Sim.bulldoze(27, 50).ok, true);
    rating = Sim.ratingBreakdown();
    assert.equal(rating.services.drink.capacity, 0);
  }
});

test('Zoo collection cap can be lifted once by strong attraction use', () => {
  const z = loadGame(true);
  const { Sim, state: s, N } = z;
  s.elev.fill(0);
  Sim.bulldoze(26, 50);
  s.terrain[26 + 50 * N] = 0;
  const venue = Sim.placeObject('ring_toss_stand', 26, 50, 1);
  assert.equal(venue.ok, true);

  const species = ['panda', 'tiger', 'elephant', 'cheetah', 'orangutan',
    'komodo_dragon', 'jaguar', 'koala', 'gorilla', 'lion'];
  s.animals = Array.from({ length: 28 }, (_, i) => ({ species: species[i % species.length], happiness: 100 }));
  for (let i = 0; i < 60; i++) s.objects.push({ kind: 'scenery', type: 'fountain' });
  s.guests = Array.from({ length: 25 }, () => ({ happiness: 100 }));
  s.stats.guestsTotal = 120;
  s.guestHappiness = 100;
  Sim._rt().ghEMA = 100;

  const before = Sim.ratingBreakdown();
  assert.ok(before.baseStars >= 4);
  assert.equal(before.attractionBonus, 0);
  assert.ok(Math.abs(before.stars - 3.71) < 1e-9);

  for (let i = 0; i < 40; i++) z.coasterCtx.recordRatingRide(venue.id, 10);
  const after = Sim.ratingBreakdown();
  assert.equal(after.attractionBonus, 0.35);
  assert.ok(Math.abs(after.stars - 4.06) < 1e-9);
  for (let i = 0; i < 40; i++) z.coasterCtx.recordRatingRide(venue.id, 2);
  assert.equal(Sim.ratingBreakdown().attractionBonus, 0.35);
});
