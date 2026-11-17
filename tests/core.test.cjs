// Run with: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function game() {
  const ctx = vm.createContext({ console, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') });
  const simFiles = fs.readdirSync(path.join(root, 'src')).filter(f => /^(00|10|2\d)-.*\.js$/.test(f)).sort();
  for (const f of simFiles) vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
  return ctx.Z;
}
test('simulation actions and typed terrain survive saving/loading', () => {
  const z = game();
  z.Sim.newGame({ seed: 123, difficulty: 'easy' });
  let placed = false;
  for (let j = 1; j < z.N - 1 && !placed; j++)
    for (let i = 1; i < z.N - 1 && !placed; i++) placed = z.Sim.placePath(i, j, 'paved').ok;
  assert.equal(placed, true);
  assert.equal(z.Sim.hireStaff('keeper').ok, true);
  const animal = z.Sim.spawnAnimal('dryosaurus', 27, 50, {sex:'F'});
  animal.name = 'Persistence test';
  for (let n = 0; n < 300; n++) z.Sim.tick(0.1);
  const before = JSON.parse(z.Sim.save());
  z.Sim.newGame({ seed: 999 });
  assert.equal(z.Sim.load(JSON.stringify(before)), true);
  const after = JSON.parse(z.Sim.save());
  assert.equal(after.s.money, before.s.money);
  assert.deepEqual(after.s.terrain, before.s.terrain);
  assert.deepEqual(after.s.path, before.s.path);
  assert.deepEqual(after.s.elev, before.s.elev);
  assert.equal(after.s.staff.length, before.s.staff.length);
  assert.equal(after.s.animals[0].name, 'Persistence test');
  assert.equal(after.s.day, before.s.day);
});
test('invalid JSON/version/truncated arrays rejected before replacing state', () => {
  const z = game(), before = z.state;
  for (const raw of ['broken', '{"v":99,"s":{}}', '{"v":2,"s":{"research":{"genomes":{},"stats":{}}}}']) {
    assert.equal(z.Sim.load(raw), false); assert.equal(z.state, before);
  }
});
test('same seed and action sequence are deterministic', () => {
  const a = game(), b = game();
  for (const z of [a,b]) {
    z.Sim.newGame({seed:6789}); z.Sim.hireStaff('keeper');
    for (let n=0;n<100;n++) z.Sim.tick(0.1);
  }
  assert.equal(a.Sim.save(), b.Sim.save());
});
test('v3 island maps, moats, power, realms, monorail, safari and DNA persist across save/load', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy' });
  assert.equal(Boolean(z.Sim.isIsland()), true);
  assert.ok(z.Sim.seaMask().some(v => v > 0));
  assert.ok(z.Sim.moats && z.Sim.monorail && z.Sim.power && z.Sim.realms && z.Sim.news && z.Sim.safari);
  const saved = z.Sim.save();
  z.Sim.newGame({ seed: 99, map: 'crater_lake' });
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.state.map.id, 'fern_meadow');
  assert.equal(Boolean(z.Sim.isIsland()), true);
});
test('legacy v2 save without v3 arrays loads cleanly and keeps inland map', () => {
  const z = game();
  z.Sim.newGame({ seed: 101 });
  const v2Like = JSON.parse(z.Sim.save());
  delete v2Like.s.ditch;
  delete v2Like.s.moatTip;
  delete v2Like.s.rail;
  delete v2Like.s.mono;
  delete v2Like.s.safari;
  delete v2Like.s.power;
  delete v2Like.s.realms;
  delete v2Like.s.news;
  if (v2Like.s.map) delete v2Like.s.map.island;
  v2Like.s.money = 54321;
  assert.equal(z.Sim.load(JSON.stringify(v2Like)), true);
  assert.equal(z.state.money, 54321);
  assert.equal(Boolean(z.Sim.isIsland()), false);
});
test('dinosaurs detour around rocks, trees, and cliffs, and walk through bushes', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, money: 100000 });
  // Clear starting objects inside an enclosure area [10..16, 20..26]
  for (let j = 19; j <= 27; j++) for (let i = 9; i <= 17; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
  }
  for (let i = 10; i <= 16; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 20 }, 'reinforced');
    z.Sim.placeFence({ axis: 'x', i, j: 27 }, 'reinforced');
  }
  for (let j = 20; j <= 26; j++) {
    z.Sim.placeFence({ axis: 'z', i: 10, j }, 'reinforced');
    z.Sim.placeFence({ axis: 'z', i: 17, j }, 'reinforced');
  }
  // Place a wall of boulders, trees, and a cliff across j=23 (from i=11 to i=15), leaving i=10 and i=16 open
  assert.equal(z.Sim.placeObject('boulder', 12, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('ginkgo', 13, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('rock_pile', 14, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('pine', 15, 23, 0).ok, true);
  // Make tile (11, 23) a steep cliff using corner (12, 23) so tile (10, 23) stays flat
  z.state.elev[12 + 23 * (z.N + 1)] = 5;
  z.state.elev[12 + 24 * (z.N + 1)] = 5;
  // Place walkable bushes on the open pass at (10, 23) and (16, 23)
  assert.equal(z.Sim.placeObject('bush', 10, 23, 0).ok, true);
  assert.equal(z.Sim.placeObject('fern', 16, 23, 0).ok, true);

  // Place a carcass feeder at (13, 25) south of the obstacle wall, and spawn a raptor at (13, 21) north of the wall
  assert.equal(z.Sim.placeObject('carcass_feeder', 13, 25, 0).ok, true);
  const dino = z.Sim.spawnAnimal('velociraptor', 13, 21);
  dino.hunger = 80;
  dino.st = 0;

  let reachedEat = false;
  for (let step = 0; step < 400; step++) {
    z.Sim.tick(0.05);
    const ti = Math.floor(dino.x / z.TILE), tj = Math.floor(dino.z / z.TILE);
    // Must never enter the boulder, tree, rock_pile, or cliff tiles
    assert.notEqual(`${ti},${tj}`, '11,23');
    assert.notEqual(`${ti},${tj}`, '12,23');
    assert.notEqual(`${ti},${tj}`, '13,23');
    assert.notEqual(`${ti},${tj}`, '14,23');
    if (dino.state === 'eat') { reachedEat = true; break; }
  }
  assert.equal(reachedEat, true, 'Dinosaur should detour around rock/tree/cliff wall through bushes to eat');
});

function setupFlatZone(z, i0, j0, i1, j1) {
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * z.N] = 0;
  }
}

test('monorail train leaves station and completes laps on a 1-station ring network', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy' });
  z.state.money = 200000;
  z.state.unlocked.star = 5;
  setupFlatZone(z, 14, 14, 34, 34);
  for (let i = 20; i <= 27; i++) z.Sim.placePath(i, 22, 'paved');
  for (let j = 22; j <= 39; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 29; i <= 32; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 29 }, 'steel');
    z.Sim.placeFence({ axis: 'x', i, j: 33 }, 'steel');
  }
  for (let j = 29; j <= 32; j++) {
    z.Sim.placeFence({ axis: 'z', i: 29, j }, 'steel');
    z.Sim.placeFence({ axis: 'z', i: 33, j }, 'steel');
  }
  z.Sim.spawnAnimal('triceratops', 30, 30);

  const st = z.Sim.placeObject('monorail_station', 20, 20, 0);
  assert.equal(st.ok, true);
  assert.equal(z.Sim.placeObject('diesel_gen', 23, 23, 2).ok, true);
  assert.equal(z.Sim.placeObject('substation', 20, 23, 2).ok, true);
  assert.equal(z.Sim.monorail.stationInfo(st.id).powered, true);

  const route = [];
  for (let i = 23; i <= 26; i++) route.push(i + 20 * z.N);
  for (let j = 19; j >= 15; j--) route.push(26 + j * z.N);
  for (let i = 25; i >= 17; i--) route.push(i + 15 * z.N);
  for (let j = 16; j <= 20; j++) route.push(17 + j * z.N);
  route.push(18 + 20 * z.N, 19 + 20 * z.N, 20 + 20 * z.N);
  const tr = z.Sim.monorail.buildTrack(route);
  assert.equal(tr.ok, true);

  const state = z.Sim.monorail.state();
  assert.equal(state.lines.length, 1);
  const line = state.lines[0];
  assert.equal(line.loop, true);
  assert.equal(line.stops.length, 1);
  // Stop s must be near the station center, not on the opposite side of the loop
  const stopPose = z.Sim.monorail.sample(line, line.stops[0].s);
  assert.ok(stopPose.x >= 20 * z.TILE && stopPose.x <= 24 * z.TILE);
  assert.ok(stopPose.z >= 20 * z.TILE && stopPose.z <= 22 * z.TILE);

  assert.equal(z.Sim.monorail.buyTrain(st.id, 2).ok, true);
  z.state.time = 0.35;
  for (let k = 0; k < 200 && !z.state.guests.length; k++) z.Sim.tick(0.1);
  const guest = z.state.guests[0];
  assert.ok(guest);
  const stObj = z.state.objects.find(o => o.id === st.id);
  guest.gt = 'bld'; guest.gid = st.id; guest.rdst = 0; guest.rfrom = st.id; guest.money = 100;
  z.Sim.monorail.arrive(guest, stObj);

  const s0 = z.Sim.monorail.trains()[0].s;
  let maxDist = 0, leftStation = false, returned = false, boarded = false, rode = false, alighted = false;
  for (let k = 0; k < 1000; k++) {
    z.Sim.tick(0.05);
    const T = z.Sim.monorail.trains()[0];
    const d = Math.min(Math.abs(T.s - s0), line.len - Math.abs(T.s - s0));
    if (d > maxDist) maxDist = d;
    if (guest.state === 'ride') boarded = true;
    if (T.st === 'run' && d > 5) { leftStation = true; if (boarded) rode = true; }
    if (leftStation && T.st === 'dwell') {
      returned = true;
      if (guest.state === 'walk') { alighted = true; break; }
    }
  }
  assert.equal(leftStation, true, 'Train must leave station on a 1-station loop');
  assert.ok(maxDist > 20, 'Train must travel around the loop');
  assert.equal(returned, true, 'Train must return to station dwell');
  assert.equal(boarded && rode && alighted, true, 'Guest must board, ride the loop, and alight');
});

test('monorail 2-station loop and keepers crossing moat bridges work properly', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy' });
  z.state.money = 200000;
  z.state.unlocked.star = 5;
  setupFlatZone(z, 12, 12, 34, 34);
  for (let i = 16; i <= 27; i++) z.Sim.placePath(i, 22, 'paved');
  for (let j = 22; j <= 39; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 18; i <= 27; i++) z.Sim.placePath(i, 26, 'paved');

  const st1 = z.Sim.placeObject('monorail_station', 18, 20, 0);
  const st2 = z.Sim.placeObject('monorail_station', 18, 27, 2);
  assert.equal(st1.ok && st2.ok, true);
  assert.equal(z.Sim.placeObject('diesel_gen', 14, 24, 0).ok, true);
  assert.equal(z.Sim.placeObject('substation', 16, 23, 2).ok, true);

  const route = [];
  for (let i = 21; i <= 24; i++) route.push(i + 20 * z.N);
  for (let j = 21; j <= 28; j++) route.push(24 + j * z.N);
  for (let i = 23; i >= 18; i--) route.push(i + 28 * z.N);
  route.push(17 + 28 * z.N, 16 + 28 * z.N);
  for (let j = 27; j >= 20; j--) route.push(16 + j * z.N);
  route.push(17 + 20 * z.N, 18 + 20 * z.N);
  assert.equal(z.Sim.monorail.buildTrack(route).ok, true);
  assert.equal(z.Sim.monorail.buyTrain(st1.id, 2).ok, true);

  z.state.time = 0.35;
  const visitedStops = new Set();
  for (let k = 0; k < 1000; k++) {
    z.Sim.tick(0.05);
    const T = z.Sim.monorail.trains()[0];
    if (T.st === 'dwell') visitedStops.add(T.at);
    if (visitedStops.size === 2) break;
  }
  assert.equal(visitedStops.size, 2, 'Train must travel between both stations on a 2-station loop');

  // Moat + bridge enclosure check
  const ditch = [];
  for (let j = 13; j <= 19; j++) for (let i = 28; i <= 34; i++) {
    if (i >= 30 && i <= 32 && j >= 15 && j <= 17) continue;
    ditch.push({ i, j });
  }
  assert.equal(z.Sim.moats.dig(ditch, 2).ok, true);
  for (let j = 20; j <= 22; j++) z.Sim.placePath(31, j, 'paved');
  for (let i = 27; i <= 31; i++) z.Sim.placePath(i, 22, 'paved');
  assert.equal(z.Sim.placePath(31, 19, 'paved').bridge, true);
  assert.equal(z.Sim.placePath(31, 18, 'paved').bridge, true);
  z.Sim.spawnAnimal('triceratops', 31, 16);
  const enc = z.state.enclosures[0];
  enc.foodLevel = 0.2;
  enc.poop = 4;
  assert.equal(z.Sim.hireStaff('keeper', 27, 22).ok, true);
  for (let k = 0; k < 400; k++) z.Sim.tick(0.1);
  assert.equal(enc.foodLevel, 1);
  assert.equal(enc.poop, 0);
});

test('building info includes specific outputs and utility buildings do not require paths', () => {
  const z = game();
  z.Sim.newGame({ seed: 3333, map: 'green', difficulty: 'easy', name: 'Info Test' });
  z.state.money = 200000;
  z.state.unlocked.star = 5;

  // Every building has non-empty info; generators state their kW output
  for (const b of z.DATA.buildings) {
    assert.ok(b.info && b.info.length > 10, `Missing info for building ${b.id}`);
    if (b.gen) {
      assert.ok(b.info.includes(String(b.gen.kw)) && /kW/i.test(b.info), `Generator ${b.id} info should state ${b.gen.kw} kW`);
    }
    if (b.battery) {
      assert.ok(b.info.includes(String(b.battery.kwh)) && /kWh/i.test(b.info), `Battery ${b.id} info should state ${b.battery.kwh} kWh`);
    }
    if (b.powerNode) {
      assert.ok(b.info.includes(String(b.powerNode.radius)), `Power node ${b.id} info should state radius ${b.powerNode.radius}`);
    }
    if (b.moat) {
      assert.ok(b.info.includes(String(b.moat.cap)), `Moat source ${b.id} info should state cap ${b.moat.cap}`);
    }
  }

  // Place utility buildings away from any path
  for (let j = 10; j <= 16; j++) for (let i = 10; i <= 20; i++) {
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * z.N] = 0;
  }
  const gen = z.Sim.placeObject('diesel_gen', 10, 10, 0);
  const batt = z.Sim.placeObject('battery_bank', 13, 10, 0);
  const sub = z.Sim.placeObject('substation', 16, 10, 0);
  assert.equal(gen.ok, true);
  assert.equal(gen.warn, undefined);
  assert.equal(batt.ok, true);
  assert.equal(sub.ok, true);

  const genRep = z.Sim.objectReport(gen.id);
  assert.equal(genRep.utility, true);
  assert.equal(genRep.issues.length, 0);

  const genInfo = z.Sim.power.objectInfo(gen.id);
  assert.equal(genInfo.kind, 'gen');
  assert.equal(genInfo.kw, 45);
  assert.equal(typeof genInfo.out, 'number');

  const battInfo = z.Sim.power.objectInfo(batt.id);
  assert.equal(battInfo.kind, 'battery');
  assert.equal(battInfo.kwh, 120);
  assert.equal(battInfo.rate, 40);

  const subInfo = z.Sim.power.objectInfo(sub.id);
  assert.equal(subInfo.kind, 'node');
  assert.equal(subInfo.radius, 11);
  assert.equal(subInfo.alive, true);

  // Regular path-requiring building off-path warns & reports disconnected
  const stall = z.Sim.placeObject('burger_stand', 10, 14, 0);
  assert.equal(stall.ok, true);
  assert.match(stall.warn, /Entrance not on a path/i);
  const stallRep = z.Sim.objectReport(stall.id);
  assert.equal(stallRep.utility, false);
  assert.equal(stallRep.connected, false);
  assert.ok(stallRep.issues.some((x) => /path/i.test(x)));

  const stallPw = z.Sim.power.objectInfo(stall.id);
  assert.equal(stallPw.kind, 'consumer');
  assert.equal(stallPw.kw, 1.5);
  assert.equal(stallPw.connected, true);
});

test('UI cards, toolstrip, placement plan, and inspect panel render building specs and skip path prompts for utilities', () => {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {};
    const style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1,
      tagName: String(tag || 'div').toUpperCase(),
      style, children,
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); },
        remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || ''); children.length = 0;
        const stack = [node];
        const re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
        let m;
        while ((m = re.exec(_html))) {
          if (m[4]) { stack[stack.length - 1].children.push({ nodeType: 3, textContent: m[4], children: [] }); continue; }
          if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
          const ch = mkEl(m[2]), rawAttr = m[3] || '', selfClose = /\/\s*$/.test(rawAttr);
          let am; const are = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
          while ((am = are.exec(rawAttr))) if (am[1] && am[1] !== '/') ch.setAttribute(am[1], am[2] || '');
          stack[stack.length - 1].appendChild(ch);
          if (!selfClose) stack.push(ch);
        }
      },
      get innerHTML() { return _html; },
      set textContent(v) { _text = String(v == null ? '' : v); _html = ''; children.length = 0; },
      get textContent() { return children.length ? children.map(c => c.textContent).join(' ') : (_text || _html.replace(/<[^>]+>/g, ' ')); },
      setAttribute(k, v) { if (k === 'class') node.className = v; else attrs[k] = String(v); },
      getAttribute(k) { return k === 'class' ? node.className : (attrs[k] ?? null); },
      removeAttribute(k) { delete attrs[k]; },
      appendChild(c) { if (c) { c.parentNode = node; children.push(c); } return c; },
      insertBefore(c, ref) { if (!c) return c; c.parentNode = node; const idx = children.indexOf(ref); if (idx >= 0) children.splice(idx, 0, c); else children.push(c); return c; },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      click() { (listeners.click || []).forEach(fn => fn({ stopPropagation() {}, preventDefault() {} })); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const matchOne = (el, part) => {
          let s = part.trim(), m;
          const attrM = s.match(/\[([^\]=]+)="([^"]*)"\]/g) || [];
          for (const a of attrM) {
            const p = a.slice(1, -1).split('=');
            if (el.getAttribute(p[0]) !== p[1].replace(/^"|"$/g, '')) return false;
            s = s.replace(a, '');
          }
          if ((m = s.match(/#([a-zA-Z0-9_-]+)/))) { if (el.getAttribute('id') !== m[1]) return false; s = s.replace(m[0], ''); }
          const clsM = s.match(/\.[a-zA-Z0-9_-]+/g) || [];
          for (const c of clsM) { if (!el.classList.contains(c.slice(1))) return false; s = s.replace(c, ''); }
          if (s && el.tagName.toLowerCase() !== s.toLowerCase()) return false;
          return true;
        };
        const parts = sel.trim().split(/\s+/);
        let scope = [node];
        for (const part of parts) {
          const next = [];
          const walk = (el) => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk);
          scope = next;
        }
        return scope;
      },
      focus() {}, blur() {}, scrollLeft: 0, scrollTop: 0, offsetWidth: 80, offsetHeight: 40,
      getContext() { return { fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {}, fill() {}, arc() {}, clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, fillText() {}, createLinearGradient() { return { addColorStop() {} }; } }; },
      getBoundingClientRect() { return { left: 0, top: 0, bottom: 40, right: 80, width: 80, height: 40 }; }
    };
    return node;
  }

  const rootUi = mkEl('div'), body = mkEl('body'), head = mkEl('head'), worldEl = mkEl('div');
  rootUi.setAttribute('id', 'ui'); worldEl.setAttribute('id', 'world');
  const document = {
    head, body,
    createElement: mkEl,
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t == null ? '' : t), children: [] }),
    getElementById: (id) => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: (s) => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: (s) => rootUi.querySelectorAll(s),
    addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document,
    window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx;
  ctx.addEventListener = () => {};

  const load = f => vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
  fs.readdirSync(path.join(root, 'src')).filter(f => /^(00|10|2\d)-.*\.js$/.test(f)).sort().forEach(load);
  const z = ctx.Z;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview() {}, highlightEnclosure() {}, thumb: () => null, focus() {} };
  load('50-ui.js');
  load('51-tools.js');
  load('52-panels.js');
  load('68-ui-power.js');

  z.UI.init();
  z.Sim.newGame({ seed: 4444, map: 'green', difficulty: 'easy', name: 'UI Test' });
  z.state.money = 250000;
  z.state.unlocked.star = 5;
  for (let j = 10; j <= 18; j++) for (let i = 10; i <= 20; i++) {
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * z.N] = 0;
  }

  // 1. Power cards show specific kW/kWh/range badges, tooltips, and no entrance bar
  z.UI.openCat('power', true);
  const cardsEl = z.UI.el.cards;
  const genCard = cardsEl.querySelector('.card[data-id="diesel_gen"]');
  assert.ok(genCard, 'diesel_gen card rendered');
  assert.equal(genCard.querySelector('.spb').textContent, '45kW');
  assert.match(genCard.getAttribute('title'), /45 kW/);
  assert.equal(genCard.querySelector('.fpb').innerHTML.includes('#f2a81d'), false);
  assert.equal(cardsEl.querySelector('.card[data-id="solar_field"] .spb').textContent, '38kW');
  assert.equal(cardsEl.querySelector('.card[data-id="wind_turbine"] .spb').textContent, '26kW');
  assert.equal(cardsEl.querySelector('.card[data-id="battery_bank"] .spb').textContent, '120kWh');
  assert.equal(cardsEl.querySelector('.card[data-id="geothermal_plant"] .spb').textContent, '120kW');
  assert.equal(cardsEl.querySelector('.card[data-id="substation"] .spb').textContent, '11t');

  // 2. Selecting diesel_gen opens toolstrip with 45 kW and placement plan has door: false and no path prompt
  genCard.click();
  assert.match(z.UI.el.strip.textContent, /45 kW/);
  const gpGen = { i: 12, j: 12, x: 12 * z.TILE, z: 12 * z.TILE };
  const genPlan = z.UI.Tools.PLAN.building({ a: gpGen, b: gpGen });
  assert.equal(genPlan.ok, true);
  assert.equal(genPlan.spec.door, false);
  assert.match(genPlan.warn, /45 kW/);
  assert.doesNotMatch(genPlan.warn, /path|entrance/i);
  z.UI.Tools.cancel();

  // 3. Regular path-requiring building still sets door: true and entrance needs a path
  z.UI.openCat('fac', true);
  cardsEl.querySelector('.card[data-id="burger_stand"]').click();
  const gpStall = { i: 12, j: 16, x: 12 * z.TILE, z: 16 * z.TILE };
  const stallPlan = z.UI.Tools.PLAN.building({ a: gpStall, b: gpStall });
  assert.equal(stallPlan.spec.door, true);
  assert.match(stallPlan.warn, /entrance needs a path/i);
  z.UI.Tools.cancel();

  // 4. Inspecting placed generator, battery, substation shows specific power info & omits path status
  const g = z.Sim.placeObject('diesel_gen', 10, 10, 0);
  const b = z.Sim.placeObject('battery_bank', 13, 10, 0);
  const s = z.Sim.placeObject('substation', 16, 10, 0);
  const st = z.Sim.placeObject('burger_stand', 10, 15, 0);

  z.UI.Panel.open('object', g.id);
  let txt = z.UI.el.panel.textContent;
  assert.match(txt, /Power generator/);
  assert.match(txt, /45 kW/);
  assert.match(txt, /Generating now/);
  assert.doesNotMatch(txt, /Connected to a path/);
  assert.doesNotMatch(txt, /Visitors served/);

  z.UI.Panel.open('object', b.id);
  txt = z.UI.el.panel.textContent;
  assert.match(txt, /Power storage/);
  assert.match(txt, /120 kWh/);
  assert.doesNotMatch(txt, /Connected to a path/);

  z.UI.Panel.open('object', s.id);
  txt = z.UI.el.panel.textContent;
  assert.match(txt, /Power relay/);
  assert.match(txt, /11 tiles/);
  assert.doesNotMatch(txt, /Connected to a path/);

  z.UI.Panel.open('object', st.id);
  txt = z.UI.el.panel.textContent;
  assert.match(txt, /Visitors served/);
  assert.match(txt, /Its entrance \(front\) must touch a path/);
  assert.match(txt, /hunger/i);
});

test('bank loans specify circumstance-based interest rates and charge interest every day', () => {
  const z = game();
  z.Sim.newGame({ seed: 5555, map: 'green', difficulty: 'normal', name: 'Loan Test' });

  // Healthy high-rated park gets a lower rate than an overdrawn low-reputation park
  z.state.rating = 4.2;
  z.state.reputation = 85;
  z.state.money = 30000;
  z.state.finance.history.push({ day: 1, income: 5000, costs: 2000, profit: 3000, balance: 30000 });
  const goodQuote = z.Sim.loanQuote(5000);
  assert.equal(goodQuote.ok, true);
  assert.ok(goodQuote.factors.some((f) => /Established park/i.test(f.label)));

  z.state.rating = 1.0;
  z.state.reputation = 25;
  z.state.money = -2500;
  z.state.stats.escapes = 2;
  z.state.finance.history.push({ day: 2, income: 500, costs: 2000, profit: -1500, balance: -2500 });
  const badQuote = z.Sim.loanQuote(5000);
  assert.equal(badQuote.ok, true);
  assert.ok(badQuote.rate > goodQuote.rate + 0.015, `Expected distressed rate (${badQuote.rate}) >> healthy rate (${goodQuote.rate})`);
  assert.ok(badQuote.factors.some((f) => /overdrawn/i.test(f.label)));
  assert.ok(badQuote.factors.some((f) => /reputation/i.test(f.label)));

  // Take two loans under different circumstances -> each locks in its own specified rate
  const r1 = z.Sim.takeLoan(5000);
  assert.equal(r1.ok, true);
  assert.equal(r1.rate, badQuote.rate);

  z.state.rating = 4.2;
  z.state.reputation = 85;
  z.state.stats.escapes = 0;
  z.state.finance.history.push({ day: 3, income: 6000, costs: 2000, profit: 4000, balance: 10000 });
  const r2 = z.Sim.takeLoan(10000);
  assert.equal(r2.ok, true);
  assert.ok(r2.rate < r1.rate, `Second loan in good conditions (${r2.rate}) should be cheaper than first (${r1.rate})`);

  const sum = z.Sim.loanSummary();
  assert.equal(sum.total, 15000);
  assert.equal(sum.loans.length, 2);
  const expectedDaily = Math.round(5000 * r1.rate) + Math.round(10000 * r2.rate);
  assert.equal(sum.dailyInterest, expectedDaily);

  // Save/load preserves individual loans and migrates legacy loan-only saves
  const saved = JSON.parse(z.Sim.save());
  assert.equal(z.Sim.load(JSON.stringify(saved)), true);
  assert.equal(z.Sim.loanSummary().loans.length, 2);
  assert.equal(z.Sim.loanSummary().dailyInterest, expectedDaily);

  const legacy = JSON.parse(JSON.stringify(saved));
  delete legacy.s.loans;
  legacy.s.loan = 8000;
  assert.equal(z.Sim.load(JSON.stringify(legacy)), true);
  assert.equal(z.Sim.loanSummary().total, 8000);
  assert.equal(z.Sim.loanSummary().loans.length, 1);

  // Reload the two-loan save and advance past midnight: daily interest is paid and recorded in costs/profit
  assert.equal(z.Sim.load(JSON.stringify(saved)), true);
  z.state.guests = [];
  const moneyBefore = z.state.money;
  const startDay = z.state.day;
  z.state.time = 0.998;
  for (let k = 0; k < 20 && z.state.day === startDay; k++) z.Sim.tick(0.1);
  assert.equal(z.state.day, startDay + 1);
  const lastRec = z.state.finance.history[z.state.finance.history.length - 1];
  assert.equal(lastRec.interest, -expectedDaily);
  assert.ok(lastRec.costs >= expectedDaily, `Daily costs (${lastRec.costs}) must include interest (${expectedDaily})`);
  assert.equal(lastRec.profit, lastRec.income - lastRec.costs);
  assert.equal(moneyBefore - z.state.money, lastRec.costs, 'Bank balance must drop by daily costs including interest');
  assert.ok(z.state.messages.some((m) => m.text.includes('loan interest')), 'Day report should mention loan interest');

  // Repaying partial amount pays down highest-rate loan first
  z.state.money = 50000;
  assert.equal(z.Sim.repayLoan(5000).ok, true);
  const afterRepay = z.Sim.loanSummary();
  assert.equal(afterRepay.total, 10000);
  assert.equal(afterRepay.loans.length, 1);
  assert.equal(afterRepay.loans[0].rate, r2.rate);
});

test('Finances modal shows offered loan rate, circumstance factors, active loans, and daily interest', () => {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {};
    const style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1, tagName: String(tag || 'div').toUpperCase(), style, children,
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); },
        remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || ''); children.length = 0;
        const stack = [node], re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
        let m;
        while ((m = re.exec(_html))) {
          if (m[4]) { stack[stack.length - 1].children.push({ nodeType: 3, textContent: m[4], children: [] }); continue; }
          if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
          const ch = mkEl(m[2]), rawAttr = m[3] || '', selfClose = /\/\s*$/.test(rawAttr);
          let am; const are = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
          while ((am = are.exec(rawAttr))) if (am[1] && am[1] !== '/') ch.setAttribute(am[1], am[2] || '');
          stack[stack.length - 1].appendChild(ch);
          if (!selfClose) stack.push(ch);
        }
      },
      get innerHTML() { return _html; },
      set textContent(v) { _text = String(v == null ? '' : v); _html = ''; children.length = 0; },
      get textContent() { return children.length ? children.map(c => c.textContent).join(' ') : (_text || _html.replace(/<[^>]+>/g, ' ')); },
      setAttribute(k, v) { if (k === 'class') node.className = v; else attrs[k] = String(v); },
      getAttribute(k) { return k === 'class' ? node.className : (attrs[k] ?? null); },
      removeAttribute(k) { delete attrs[k]; },
      appendChild(c) { if (c) { c.parentNode = node; children.push(c); } return c; },
      insertBefore(c, ref) { if (!c) return c; c.parentNode = node; const idx = children.indexOf(ref); if (idx >= 0) children.splice(idx, 0, c); else children.push(c); return c; },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      click() { (listeners.click || []).forEach(fn => fn({ stopPropagation() {}, preventDefault() {} })); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const matchOne = (el, part) => {
          let s = part.trim(), m;
          const attrM = s.match(/\[([^\]=]+)="([^"]*)"\]/g) || [];
          for (const a of attrM) { const p = a.slice(1, -1).split('='); if (el.getAttribute(p[0]) !== p[1].replace(/^"|"$/g, '')) return false; s = s.replace(a, ''); }
          if ((m = s.match(/#([a-zA-Z0-9_-]+)/))) { if (el.getAttribute('id') !== m[1]) return false; s = s.replace(m[0], ''); }
          const clsM = s.match(/\.[a-zA-Z0-9_-]+/g) || [];
          for (const c of clsM) { if (!el.classList.contains(c.slice(1))) return false; s = s.replace(c, ''); }
          if (s && el.tagName.toLowerCase() !== s.toLowerCase()) return false;
          return true;
        };
        let scope = [node];
        for (const part of sel.trim().split(/\s+/)) {
          const next = [];
          const walk = (el) => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk); scope = next;
        }
        return scope;
      },
      focus() {}, blur() {}, scrollLeft: 0, scrollTop: 0, offsetWidth: 80, offsetHeight: 40, clientWidth: 300, clientHeight: 170,
      getContext() { return { setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, fillText() {}, createLinearGradient() { return { addColorStop() {} }; } }; },
      getBoundingClientRect() { return { left: 0, top: 0, bottom: 40, right: 80, width: 80, height: 40 }; }
    };
    return node;
  }

  const rootUi = mkEl('div'), body = mkEl('body'), head = mkEl('head'), worldEl = mkEl('div');
  rootUi.setAttribute('id', 'ui'); worldEl.setAttribute('id', 'world');
  const document = {
    head, body, createElement: mkEl,
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t == null ? '' : t), children: [] }),
    getElementById: (id) => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: (s) => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: (s) => rootUi.querySelectorAll(s),
    addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document, window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  const load = f => vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
  fs.readdirSync(path.join(root, 'src')).filter(f => /^(00|10|2\d)-.*\.js$/.test(f)).sort().forEach(load);
  const z = ctx.Z;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview() {}, highlightEnclosure() {}, thumb: () => null, focus() {} };
  load('50-ui.js'); load('53-screens.js');
  z.UI.init();
  z.Sim.newGame({ seed: 6666, map: 'green', difficulty: 'normal', name: 'Fin Tab Test' });

  z.UI.openModal('fin');
  let modalText = z.UI.el.modal.textContent;
  assert.match(modalText, /Offered daily interest/);
  assert.match(modalText, /Rate factors:/);
  assert.match(modalText, /Borrow £5,000 at/);

  // Click Borrow button in modal
  const borrowBtn = z.UI.el.modal.querySelectorAll('button').find((b) => /Borrow £5,000/.test(b.textContent));
  assert.ok(borrowBtn);
  borrowBtn.click();
  modalText = z.UI.el.modal.textContent;
  assert.match(modalText, /Interest due each day/);
  assert.match(modalText, /Daily loan interest/);
  assert.match(modalText, /£5,000/);
});

test('paths disconnected from entrance but connected via monorail work for buildings, facilities, and guests', () => {
  const z = game();
  z.Sim.newGame({ seed: 42, map: 'fern_meadow', difficulty: 'easy' });
  z.state.money = 300000;
  z.state.unlocked.star = 5;
  setupFlatZone(z, 10, 10, 42, 39);

  // Mainland path from gate (27..28, 40..55) up to (27, 34)
  for (let j = 34; j <= 40; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 20; i <= 27; i++) z.Sim.placePath(i, 34, 'paved');

  // Completely disconnected island path around j=18..25, i=16..26 (no walking path to entrance!)
  for (let i = 18; i <= 26; i++) z.Sim.placePath(i, 18, 'paved');
  for (let j = 18; j <= 25; j++) z.Sim.placePath(26, j, 'paved');
  for (let i = 16; i <= 26; i++) z.Sim.placePath(i, 25, 'paved');

  // Truly isolated path with NO monorail connection
  for (let i = 36; i <= 38; i++) z.Sim.placePath(i, 18, 'paved');
  const isoShop = z.Sim.placeObject('burger_stand', 36, 17, 0);
  assert.equal(isoShop.ok, true);

  // Island buildings & facilities on the disconnected island path
  const stMain = z.Sim.placeObject('monorail_station', 20, 32, 0); // front at (20..23, 34)
  const stIsl = z.Sim.placeObject('monorail_station', 20, 16, 0);  // front at (20..23, 18)
  const islShop = z.Sim.placeObject('burger_stand', 16, 24, 0);    // 1x1, front at (16, 25)
  const islLab = z.Sim.placeObject('research_lab', 18, 22, 0);     // 4x3, front at (18..21, 25)
  const islHatch = z.Sim.placeObject('hatchery', 23, 23, 0);       // 3x2, front at (23..25, 25)
  assert.equal(stMain.ok && stIsl.ok && islShop.ok && islLab.ok && islHatch.ok, true);

  // Power both stations
  assert.equal(z.Sim.placeObject('diesel_gen', 16, 32, 0).ok, true);
  assert.equal(z.Sim.placeObject('substation', 18, 32, 0).ok, true);
  assert.equal(z.Sim.placeObject('diesel_gen', 16, 16, 0).ok, true);
  assert.equal(z.Sim.placeObject('substation', 18, 16, 0).ok, true);

  // Before monorail track connects them: mainland station is connected, island buildings are not
  assert.equal(z.Sim.objectReport(stMain.id).connected, true);
  assert.equal(z.Sim.objectReport(stIsl.id).connected, false);
  assert.equal(z.Sim.objectReport(islShop.id).connected, false);
  assert.equal(z.Sim.objectReport(isoShop.id).connected, false);
  const rt0 = z.Sim._rt();
  assert.equal(rt0.labs.length, 1);
  assert.equal(rt0.hatcheries.length, 1);

  // Connect stMain <-> stIsl with track (open 2-station line)
  const route = [];
  for (let i = 23; i <= 30; i++) route.push(i + 32 * z.N);
  for (let j = 31; j >= 16; j--) route.push(30 + j * z.N);
  for (let i = 29; i >= 23; i--) route.push(i + 16 * z.N);
  assert.equal(z.Sim.monorail.buildTrack(route).ok, true);

  // Island buildings and facilities are now connected via monorail; truly isolated shop remains disconnected
  assert.equal(z.Sim.objectReport(stIsl.id).connected, true);
  assert.equal(z.Sim.objectReport(islShop.id).connected, true);
  assert.equal(z.Sim.objectReport(islLab.id).connected, true);
  assert.equal(z.Sim.objectReport(islHatch.id).connected, true);
  assert.equal(z.Sim.objectReport(isoShop.id).connected, false);
  assert.equal(z.Sim._rt().labs.length, 2);
  assert.equal(z.Sim._rt().hatcheries.length, 2);

  // Removing a track tile drops connectivity back to false; rebuilding restores it
  assert.equal(z.Sim.monorail.removeTiles([30 + 25 * z.N]).ok, true);
  assert.equal(z.Sim.objectReport(stIsl.id).connected, false);
  assert.equal(z.Sim.objectReport(islShop.id).connected, false);
  assert.equal(z.Sim._rt().labs.length, 1);
  assert.equal(z.Sim.monorail.buildTrack([30 + 26 * z.N, 30 + 25 * z.N, 30 + 24 * z.N]).ok, true);
  assert.equal(z.Sim.objectReport(islShop.id).connected, true);

  // Add an enclosure on the island (no mainland enclosures!) and buy a train
  for (let i = 28; i <= 32; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 19 }, 'reinforced');
    z.Sim.placeFence({ axis: 'x', i, j: 23 }, 'reinforced');
  }
  for (let j = 19; j <= 22; j++) {
    z.Sim.placeFence({ axis: 'z', i: 28, j }, 'reinforced');
    z.Sim.placeFence({ axis: 'z', i: 33, j }, 'reinforced');
  }
  z.Sim.spawnAnimal('triceratops', 30, 21);
  const enc = z.state.enclosures[0];
  assert.ok(enc.viewTiles.length > 0);
  assert.equal(z.Sim.monorail.setFree(stMain.id, true).ok, true);
  assert.equal(z.Sim.monorail.buyTrain(stMain.id, 2).ok, true);

  // Guests arrive at entrance, ride monorail to island, view the enclosure without being deleted as stranded, and leave via monorail
  z.state.time = 0.35;
  for (let k = 0; k < 200 && z.state.guests.length < 3; k++) z.Sim.tick(0.1);
  assert.ok(z.state.guests.length >= 1);

  let guestVisitedIsland = false;
  let islandGuestId = 0;
  for (let k = 0; k < 2500; k++) {
    z.Sim.tick(0.1);
    for (const g of z.state.guests) {
      const gj = Math.floor(g.ti / z.N);
      if (g.state === 'walk' && gj <= 25 && g.seenEnc[enc.id]) {
        guestVisitedIsland = true;
        islandGuestId = g.id;
        assert.equal(g.isl, 0, 'Guest on monorail-connected island path must not be marked stranded');
      }
    }
    if (guestVisitedIsland) break;
  }
  assert.equal(guestVisitedIsland, true, 'Guest should ride monorail to island and see the island enclosure');

  // Now simulate the guest finishing their visit while on the island: they should ride the monorail back and exit the park
  const gIsl = z.state.guests.find(g => g.id === islandGuestId);
  assert.ok(gIsl);
  gIsl.stay = -1; // visit time over -> triggers startLeaving on next guestThink
  const leftBefore = z.state.stats.guestsLeft || 0;
  let rodeBack = false, reachedMainland = false, exitedViaMonorail = false;
  for (let k = 0; k < 2500; k++) {
    z.Sim.tick(0.1);
    const cur = z.state.guests.find(g => g.id === islandGuestId);
    if (!cur) {
      assert.ok((z.state.stats.guestsLeft || 0) > leftBefore);
      exitedViaMonorail = true;
      break;
    }
    if (cur.state === 'ride' && cur.rfrom === stIsl.id) rodeBack = true;
    if (cur.state === 'leave' && Math.floor(cur.ti / z.N) >= 34) reachedMainland = true;
    assert.ok(cur.isl < 5, `Guest leaving via monorail must not time out as stranded (isl=${cur.isl}, state=${cur.state})`);
  }
  assert.equal(rodeBack, true, 'Guest must ride monorail back from island station');
  assert.equal(reachedMainland, true, 'Guest must alight on mainland to walk out the gate');
  assert.equal(exitedViaMonorail, true, 'Guest on monorail-connected island must ride back and exit cleanly');

  // Save/load preserves monorail-connected island building/facility connectivity
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.Sim.objectReport(islShop.id).connected, true);
  assert.equal(z.Sim.objectReport(islLab.id).connected, true);
  assert.equal(z.Sim._rt().labs.length, 2);

  // Safari depot on the monorail-connected island reports connected
  const islDepot = z.Sim.placeObject('safari_depot', 23, 26, 2); // 3x2, front at (23..25, 25)
  assert.equal(islDepot.ok, true);
  assert.equal(z.Sim.safari.depotInfo(islDepot.id).conn, true);

  // Keeper on mainland skips unreachable island enclosure and feeds reachable mainland enclosure
  for (let i = 30; i <= 33; i++) {
    z.Sim.placeFence({ axis: 'x', i, j: 34 }, 'reinforced');
    z.Sim.placeFence({ axis: 'x', i, j: 38 }, 'reinforced');
  }
  for (let j = 34; j <= 37; j++) {
    z.Sim.placeFence({ axis: 'z', i: 30, j }, 'reinforced');
    z.Sim.placeFence({ axis: 'z', i: 34, j }, 'reinforced');
  }
  for (let i = 27; i <= 33; i++) z.Sim.placePath(i, 39, 'paved');
  z.Sim.spawnAnimal('dryosaurus', 31, 36);
  const islEnc = z.state.enclosures.find(e => e.id === enc.id);
  const mainEnc = z.state.enclosures.find(e => e.id !== enc.id);
  assert.ok(islEnc && mainEnc && mainEnc.viewTiles.length > 0);
  islEnc.foodLevel = 0.1;   // island enclosure is hungrier, but unreachable from mainland
  mainEnc.foodLevel = 0.3;  // mainland enclosure is reachable
  assert.equal(z.Sim.hireStaff('keeper', 27, 39).ok, true);
  for (let k = 0; k < 400; k++) z.Sim.tick(0.1);
  assert.equal(mainEnc.foodLevel, 1, 'Mainland keeper must feed reachable mainland enclosure rather than stalling on unreachable island enclosure');
  assert.ok(islEnc.foodLevel < 0.2, 'Island enclosure remains unfed until an island keeper cares for it');
  assert.equal(z.Sim.hireStaff('keeper', 26, 21).ok, true);
  for (let k = 0; k < 400; k++) z.Sim.tick(0.1);
  assert.equal(islEnc.foodLevel, 1, 'Keeper hired on island path feeds island enclosure');
});

test('all build categories including aviary and tagging render all cards at 5 stars', () => {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {};
    const style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1, tagName: String(tag || 'div').toUpperCase(), style, children,
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); },
        remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || ''); children.length = 0;
        const stack = [node], re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
        let m;
        while ((m = re.exec(_html))) {
          if (m[4]) { stack[stack.length - 1].children.push({ nodeType: 3, textContent: m[4], children: [] }); continue; }
          if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
          const ch = mkEl(m[2]), rawAttr = m[3] || '', selfClose = /\/\s*$/.test(rawAttr);
          let am; const are = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
          while ((am = are.exec(rawAttr))) if (am[1] && am[1] !== '/') ch.setAttribute(am[1], am[2] || '');
          stack[stack.length - 1].appendChild(ch);
          if (!selfClose) stack.push(ch);
        }
      },
      get innerHTML() { return _html; },
      set textContent(v) { _text = String(v == null ? '' : v); _html = ''; children.length = 0; },
      get textContent() { return children.length ? children.map(c => c.textContent).join(' ') : (_text || _html.replace(/<[^>]+>/g, ' ')); },
      setAttribute(k, v) { if (k === 'class') node.className = v; else attrs[k] = String(v); },
      getAttribute(k) { return k === 'class' ? node.className : (attrs[k] ?? null); },
      removeAttribute(k) { delete attrs[k]; },
      appendChild(c) { if (c) { c.parentNode = node; children.push(c); } return c; },
      insertBefore(c, ref) { if (!c) return c; c.parentNode = node; const idx = children.indexOf(ref); if (idx >= 0) children.splice(idx, 0, c); else children.push(c); return c; },
      removeChild(c) { const idx = children.indexOf(c); if (idx >= 0) children.splice(idx, 1); return c; },
      remove() { if (node.parentNode) node.parentNode.removeChild(node); },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      click() { (listeners.click || []).forEach(fn => fn({ stopPropagation() {}, preventDefault() {} })); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const matchOne = (el, part) => {
          let s = part.trim(), m;
          const attrM = s.match(/\[([^\]=]+)="([^"]*)"\]/g) || [];
          for (const a of attrM) { const p = a.slice(1, -1).split('='); if (el.getAttribute(p[0]) !== p[1].replace(/^"|"$/g, '')) return false; s = s.replace(a, ''); }
          if ((m = s.match(/#([a-zA-Z0-9_-]+)/))) { if (el.getAttribute('id') !== m[1]) return false; s = s.replace(m[0], ''); }
          const clsM = s.match(/\.[a-zA-Z0-9_-]+/g) || [];
          for (const c of clsM) { if (!el.classList.contains(c.slice(1))) return false; s = s.replace(c, ''); }
          if (s && el.tagName.toLowerCase() !== s.toLowerCase()) return false;
          return true;
        };
        let scope = [node];
        for (const part of sel.trim().split(/\s+/)) {
          const next = [];
          const walk = (el) => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk); scope = next;
        }
        return scope;
      },
      focus() {}, blur() {}, scrollLeft: 0, scrollTop: 0, offsetWidth: 80, offsetHeight: 40, clientWidth: 300, clientHeight: 170,
      getContext() { return { fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {}, fill() {}, arc() {}, clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, fillText() {}, createLinearGradient() { return { addColorStop() {} }; } }; },
      getBoundingClientRect() { return { left: 0, top: 0, bottom: 40, right: 80, width: 80, height: 40 }; }
    };
    return node;
  }

  const rootUi = mkEl('div'), body = mkEl('body'), head = mkEl('head'), worldEl = mkEl('div');
  rootUi.setAttribute('id', 'ui'); worldEl.setAttribute('id', 'world');
  const document = {
    head, body, createElement: mkEl,
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t == null ? '' : t), children: [] }),
    getElementById: (id) => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: (s) => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: (s) => rootUi.querySelectorAll(s),
    addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document, window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  const load = f => vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
  fs.readdirSync(path.join(root, 'src')).filter(f => /^(00|10|2\d)-.*\.js$/.test(f)).sort().forEach(load);
  const z = ctx.Z;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview() {}, highlightEnclosure() {}, thumb: () => null, focus() {} };
  z.RealmsWorld = { overlayOn: () => false, setOverlay() {}, showRange() {} };
  z.MoatsWorld = { overlayOn: () => false, setOverlay() {} };
  z.MonoWorld = { overlayOn: false, setOverlay() {} };
  z.SafariWorld = { overlayOn: false, setOverlay() {} };
  ['50-ui.js', '51-tools.js', '52-panels.js', '65-ui-moats.js', '66-ui-monorail.js', '67-ui-realms.js', '68-ui-power.js', '74-ui-safari.js', '75-ui-groups.js', '76-ui-mobile.js'].forEach(load);

  z.UI.init();
  z.Sim.newGame({ seed: 7777, map: 'green', difficulty: 'easy', name: 'Realms UI Test' });
  z.state.money = 500000;
  z.state.unlocked.star = 5;
  for (let j = 10; j <= 18; j++) for (let i = 10; i <= 20; i++) {
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * z.N] = 0;
  }

  // Every non-tool category renders all of its items cleanly at 5 stars
  z.UI.CATS.forEach((cat) => {
    if (cat.tool) return;
    z.UI.openCat(cat.id, true);
    assert.equal(z.UI.el.cards.children.length >= cat.items().length, true, `category ${cat.id} rendered all cards`);
  });

  // Aviary renders all 7 items; canopy_tower does not show a tagging radius badge
  z.UI.openCat('aviary', true);
  const aviaryIds = z.UI.el.cards.children.map((c) => c.getAttribute('data-id'));
  assert.deepEqual(aviaryIds, ['dome', 'mesh', 'canopy_tower', 'drone_hangar', 'perch_crag', 'perch_pole', 'fish_pool']);
  const canopyCard = z.UI.el.cards.querySelector('.card[data-id="canopy_tower"]');
  assert.equal(canopyCard.querySelector('.spb'), null);

  // Tagging renders all 6 items; tagging_tower shows 10t range badge and no entrance bar
  z.UI.openCat('tagging', true);
  const tagIds = z.UI.el.cards.children.map((c) => c.getAttribute('data-id'));
  assert.deepEqual(tagIds, ['tagging_tower', 'zl', 'zs', 'za', 'sky', 'overlay']);
  const towerCard = z.UI.el.cards.querySelector('.card[data-id="tagging_tower"]');
  assert.equal(towerCard.querySelector('.spb').textContent, '10t');
  assert.equal(towerCard.querySelector('.fpb').innerHTML.includes('#f2a81d'), false);

  // Tagging tower placement plan shows 10-tile range and skips path prompt
  towerCard.click();
  const gp = { i: 12, j: 12, x: 12 * z.TILE, z: 12 * z.TILE };
  const towerPlan = z.UI.Tools.PLAN.building({ a: gp, b: gp });
  assert.equal(towerPlan.ok, true);
  assert.equal(towerPlan.spec.door, false);
  assert.match(towerPlan.warn, /10-tile range/);
  assert.doesNotMatch(towerPlan.warn, /entrance needs a path/i);
  z.UI.Tools.cancel();

  // Inspect panels distinguish tagging_tower from canopy_tower
  const tw = z.Sim.placeObject('tagging_tower', 10, 10, 0);
  const cp = z.Sim.placeObject('canopy_tower', 14, 10, 0);
  assert.equal(tw.ok && cp.ok, true);
  z.UI.Panel.open('object', tw.id);
  assert.match(z.UI.el.panel.textContent, /Containment tower/);
  z.UI.Panel.open('object', cp.id);
  assert.match(z.UI.el.panel.textContent, /Information/);
  assert.doesNotMatch(z.UI.el.panel.textContent, /Containment tower/);
});

test('enclosure centroids, realm bolting, and animal movement stay finite under edge cases', () => {
  const z = game();
  z.Sim.newGame({ seed: 19, map: 'green', money: 500000 });
  z.state.unlocked.star = 5;
  for (let j = 10; j <= 16; j++) for (let i = 10; i <= 16; i++) {
    z.Sim.bulldoze(i, j);
    z.Sim.terraform(i, j, 'level', 0, { sharp: true, target: 0 });
    z.state.terrain[i + j * z.N] = 0;
  }
  const vTiles = [];
  for (let j = 10; j <= 14; j++) for (let i = 10; i <= 14; i++) vTiles.push(i + j * z.N);
  assert.equal(z.Sim.realms.place('virtual', 'land', vTiles, { band: 1 }).ok, true);

  // Empty realm definition tiles must fall back to a finite center instead of 0/0 NaN
  z.state.realms.defs.push({ id: 9999, kind: 'virtual', realm: 'land', tiles: [], lvl: 1, wall: 0, mesh: 0, band: 1, paid: 0 });
  const saved = z.Sim.save();
  assert.equal(z.Sim.load(saved), true);
  for (const e of z.state.enclosures) {
    assert.ok(Number.isFinite(e.cx) && Number.isFinite(e.cz), `enclosure ${e.id} centroid should be finite`);
  }

  // Missing target coordinates during landBolt or animalMove must not produce NaN positions
  const a = z.Sim.spawnAnimal('dryosaurus', 12, 12);
  a.bolt = 1;
  a.tx = a.x + 4;
  a.tz = undefined;
  for (let k = 0; k < 20; k++) z.Sim._step(0.05);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));

  a.bolt = 0;
  a.state = 'walk';
  a.tx = undefined;
  a.tz = undefined;
  for (let k = 0; k < 10; k++) z.Sim._step(0.05);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
});

function fenceRect(z, i0, j0, i1, j1, kind) {
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    if (z.Sim.placeFence({ axis: 'x', i, j: j0 }, kind).ok) n++;
    if (z.Sim.placeFence({ axis: 'x', i, j: j1 + 1 }, kind).ok) n++;
  }
  for (let j = j0; j <= j1; j++) {
    if (z.Sim.placeFence({ axis: 'z', i: i0, j }, kind).ok) n++;
    if (z.Sim.placeFence({ axis: 'z', i: i1 + 1, j }, kind).ok) n++;
  }
  return n;
}

test('rangers interrupt patrols immediately via radio to feed, clean, and repair breached enclosures', () => {
  const z = game();
  z.Sim.newGame({ seed: 901, map: 'fern_meadow', money: 200000 });
  setupFlatZone(z, 18, 22, 34, 39);
  for (let j = 24; j <= 39; j++) assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
  for (let i = 20; i <= 26; i++) assert.equal(z.Sim.placePath(i, 24, 'paved').ok, true);
  assert.ok(fenceRect(z, 21, 25, 25, 29, 'chainlink') > 0);
  const a1 = z.Sim.spawnAnimal('dryosaurus', 23, 27);
  assert.ok(a1 && a1.enc);
  const enc = z.state.enclosures.find(e => e.id === a1.enc);
  assert.ok(enc && enc.viewTiles.length > 0);

  // Hire ranger while enclosure is completely clean & full so patrol starts immediately
  const hk = z.Sim.hireStaff('keeper', 27, 38);
  assert.equal(hk.ok, true);
  const keeper = z.state.staff.find(s => s.id === hk.id);
  for (let t = 0; t < 15 && (!keeper.tk || keeper.tk.k !== 'patrol'); t++) z.Sim._step(0.5);
  assert.equal(keeper.tk.k, 'patrol');
  assert.match(keeper.task, /Patrol/i);

  // Lowered food threshold (0.7 < 0.75) + breach must pull patrolling ranger off patrol within ~2s
  enc.foodLevel = 0.7;
  enc.poop = 1;
  enc.breach = 1;
  for (let t = 0; t < 5; t++) z.Sim._step(0.5);
  assert.equal(keeper.tk.k, 'enc', 'ranger must interrupt patrol via radio right away');
  assert.equal(keeper.tk.enc, enc.id);
  assert.match(keeper.task, /Securing/);

  // Step until ranger reaches feeder and finishes work
  for (let t = 0; t < 60 && (enc.breach > 0 || enc.foodLevel < 1 || enc.poop > 0); t++) z.Sim._step(0.5);
  assert.equal(enc.breach, 0, 'ranger repaired breached fence');
  assert.equal(enc.foodLevel, 1, 'ranger refilled food');
  assert.equal(enc.poop, 0, 'ranger cleaned single poop pile');
});

test('ranger station radio hubs extend gate-hired ranger reach and enclosureReport flags out-of-range', () => {
  const z = game();
  z.Sim.newGame({ seed: 902, map: 'highland_ridge', money: 300000 });
  setupFlatZone(z, 26, 8, 46, 39);
  setupFlatZone(z, 35, 3, 46, 9);
  for (let j = 8; j <= 39; j++) assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
  for (let i = 28; i <= 42; i++) assert.equal(z.Sim.placePath(i, 8, 'paved').ok, true);
  for (let j = 3; j <= 7; j++) assert.equal(z.Sim.placePath(42, j, 'paved').ok, true);
  assert.ok(fenceRect(z, 37, 3, 40, 6, 'chainlink') > 0);
  const aFar = z.Sim.spawnAnimal('dryosaurus', 38, 4);
  assert.ok(aFar && aFar.enc);
  const farEnc = z.state.enclosures.find(e => e.id === aFar.enc);
  assert.ok(farEnc && farEnc.viewTiles.length > 0);
  farEnc.foodLevel = 0.25;
  farEnc.poop = 3;

  // Gate-hired ranger (home at 27, 52) is > 48 tiles from (37..40, 3..6)
  const hk = z.Sim.hireStaff('keeper');
  assert.equal(hk.ok, true);
  const keeper = z.state.staff.find(s => s.id === hk.id);
  const repBefore = z.Sim.enclosureReport(farEnc.id);
  assert.equal(repBefore.outOfRange, true);
  assert.ok(repBefore.issues.some(x => /Out of ranger range/i.test(x)));

  for (let t = 0; t < 20; t++) z.Sim._step(0.5);
  assert.ok(!keeper.tk || keeper.tk.enc !== farEnc.id, 'out-of-range enclosure must not be assigned before station');

  // Build Ranger station at (43, 6) facing west onto the path at i=42 (rot=3)
  const hutRes = z.Sim.placeObject('keeper_hut', 43, 6, 3);
  assert.equal(hutRes.ok, true);
  const cov = z.Sim.rangerCoverage();
  assert.equal(cov.hasHut, true);
  assert.equal(cov.baseTiles, 48);
  assert.equal(cov.huts.length, 1);
  assert.equal(cov.enclosuresCoveredByHut(hutRes.id), 1);

  const repAfter = z.Sim.enclosureReport(farEnc.id);
  assert.ok(!repAfter.outOfRange, 'enclosureReport clears outOfRange once covered by Ranger station');

  // Gate-hired ranger immediately interrupts patrol via station relay and walks to feed/clean farEnc
  for (let t = 0; t < 10 && (!keeper.tk || keeper.tk.enc !== farEnc.id); t++) z.Sim._step(0.5);
  assert.equal(keeper.tk.k, 'enc');
  assert.equal(keeper.tk.enc, farEnc.id);
  for (let t = 0; t < 180 && (farEnc.foodLevel < 1 || farEnc.poop > 0); t++) z.Sim._step(0.5);
  assert.equal(farEnc.foodLevel, 1);
  assert.equal(farEnc.poop, 0);
});

test('sick ranger claim release, off-path recovery, and sea-pen pier walkway access', () => {
  const z = game();
  z.Sim.newGame({ seed: 903, map: 'fern_meadow', money: 250000 });
  setupFlatZone(z, 20, 22, 32, 39);
  for (let j = 25; j <= 39; j++) assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
  fenceRect(z, 22, 25, 25, 29, 'chainlink');
  const a1 = z.Sim.spawnAnimal('dryosaurus', 23, 27);
  assert.ok(a1 && a1.enc);
  const enc = z.state.enclosures.find(e => e.id === a1.enc);
  enc.foodLevel = 0.2;

  const h1 = z.Sim.hireStaff('keeper', 27, 27);
  const h2 = z.Sim.hireStaff('keeper', 27, 32);
  assert.equal(h1.ok && h2.ok, true);
  const k1 = z.state.staff.find(s => s.id === h1.id);
  const k2 = z.state.staff.find(s => s.id === h2.id);

  for (let t = 0; t < 10 && (!k1.tk || k1.tk.enc !== enc.id); t++) z.Sim._step(0.5);
  assert.equal(k1.tk && k1.tk.enc, enc.id);

  // K1 falls sick mid-claim -> must release claim so K2 picks up immediately
  k1.sickUntil = z.state.day + z.state.time + 0.5;
  z.Sim._step(0.1);
  assert.equal(z.Sim._rt().claim['e' + enc.id], undefined);
  for (let t = 0; t < 10 && (!k2.tk || k2.tk.enc !== enc.id); t++) z.Sim._step(0.5);
  assert.equal(k2.tk && k2.tk.enc, enc.id, 'second ranger immediately takes released enclosure');

  // Off-path stranding > 12 tiles from any path recovers cleanly
  enc.foodLevel = 1; enc.poop = 0;
  k2.tk = null; k2.route = null; k2.wt = 0;
  k2.x = 2; k2.z = 2;
  z.Sim._step(0.1);
  const tile = Math.floor(k2.x / z.TILE) + Math.floor(k2.z / z.TILE) * z.N;
  assert.ok(z.state.path[tile] > 0, 'ranger stranded far off-path recovers onto nearest path');

  // Sea pen with glass_pier crossing sea_net must connect path components for keepers
  const zp = game();
  zp.Sim.newGame({ seed: 904, map: 'lakeland', money: 300000 });
  zp.state.unlocked.star = 5;
  const sm = zp.Sim.seaMask();
  let shoreI = -1, shoreJ = -1;
  for (let j = 10; j < zp.N - 12 && shoreI < 0; j++) {
    for (let i = 10; i < zp.N - 14; i++) {
      const landOk = !sm[i + j * zp.N] && !sm[(i - 1) + j * zp.N] && zp.Sim.inMap(i, j);
      let seaOk = landOk;
      for (let dj = 0; dj < 3 && seaOk; dj++) for (let di = 1; di <= 3 && seaOk; di++) {
        if (!sm[(i + di) + (j + dj) * zp.N] || !zp.Sim.inMap(i + di, j + dj)) seaOk = false;
      }
      if (seaOk) { shoreI = i; shoreJ = j; break; }
    }
  }
  assert.ok(shoreI > 0, 'found flat coast cell beside 3x3 sea block');
  for (let di = 1; di <= 3; di++) {
    zp.Sim.placeFence({ axis: 'x', i: shoreI + di, j: shoreJ }, 'sea_net');
    zp.Sim.placeFence({ axis: 'x', i: shoreI + di, j: shoreJ + 3 }, 'sea_net');
  }
  for (let dj = 0; dj < 3; dj++) {
    zp.Sim.placeFence({ axis: 'z', i: shoreI + 1, j: shoreJ + dj }, 'sea_net');
    zp.Sim.placeFence({ axis: 'z', i: shoreI + 4, j: shoreJ + dj }, 'sea_net');
  }
  const pathTile = shoreI + shoreJ * zp.N;
  zp.Sim.bulldoze(shoreI, shoreJ);
  zp.Sim.terraform(shoreI, shoreJ, 'level', 0, { sharp: true, target: 0 });
  zp.state.terrain[pathTile] = 0;
  assert.equal(zp.Sim.placePath(shoreI, shoreJ, 'paved').ok, true);
  const walkRes = zp.Sim.realms.placeWalk([(shoreI + 1) + shoreJ * zp.N, (shoreI + 2) + shoreJ * zp.N], 'pier');
  assert.equal(walkRes.ok, true);
  const comp = zp.Sim._rt().comp;
  assert.ok(comp[pathTile] > 0 && comp[(shoreI + 1) + shoreJ * zp.N] === comp[pathTile], 'glass_pier across sea_net shares connected nav component with shore path');
});

test('UI displays ranger and ranger station range badges, placement preview rings, and inspect stats', () => {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {};
    const style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1, tagName: String(tag || 'div').toUpperCase(), style, children,
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); },
        remove(...a) { a.forEach(c => c && cls.delete(c)); },
        toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
        contains(c) { return cls.has(c); }
      },
      set className(v) { cls.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
      get className() { return Array.from(cls).join(' '); },
      set innerHTML(v) {
        _html = String(v || ''); children.length = 0;
        const stack = [node], re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
        let m;
        while ((m = re.exec(_html))) {
          if (m[4]) { stack[stack.length - 1].children.push({ nodeType: 3, textContent: m[4], children: [] }); continue; }
          if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
          const ch = mkEl(m[2]), rawAttr = m[3] || '', selfClose = /\/\s*$/.test(rawAttr);
          let am; const are = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
          while ((am = are.exec(rawAttr))) if (am[1] && am[1] !== '/') ch.setAttribute(am[1], am[2] || '');
          stack[stack.length - 1].appendChild(ch);
          if (!selfClose) stack.push(ch);
        }
      },
      get innerHTML() { return _html; },
      set textContent(v) { _text = String(v == null ? '' : v); _html = ''; children.length = 0; },
      get textContent() { return children.length ? children.map(c => c.textContent).join(' ') : (_text || _html.replace(/<[^>]+>/g, ' ')); },
      setAttribute(k, v) { if (k === 'class') node.className = v; else attrs[k] = String(v); },
      getAttribute(k) { return k === 'class' ? node.className : (attrs[k] ?? null); },
      removeAttribute(k) { delete attrs[k]; },
      appendChild(c) { if (c) { c.parentNode = node; children.push(c); } return c; },
      insertBefore(c, ref) { if (!c) return c; c.parentNode = node; const idx = children.indexOf(ref); if (idx >= 0) children.splice(idx, 0, c); else children.push(c); return c; },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      click() { (listeners.click || []).forEach(fn => fn({ stopPropagation() {}, preventDefault() {} })); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const matchOne = (el, part) => {
          let s = part.trim(), m;
          const attrM = s.match(/\[([^\]=]+)="([^"]*)"\]/g) || [];
          for (const a of attrM) {
            const p = a.slice(1, -1).split('=');
            if (el.getAttribute(p[0]) !== p[1].replace(/^"|"$/g, '')) return false;
            s = s.replace(a, '');
          }
          if ((m = s.match(/#([a-zA-Z0-9_-]+)/))) { if (el.getAttribute('id') !== m[1]) return false; s = s.replace(m[0], ''); }
          const clsM = s.match(/\.[a-zA-Z0-9_-]+/g) || [];
          for (const c of clsM) { if (!el.classList.contains(c.slice(1))) return false; s = s.replace(c, ''); }
          if (s && el.tagName.toLowerCase() !== s.toLowerCase()) return false;
          return true;
        };
        const parts = sel.trim().split(/\s+/);
        let scope = [node];
        for (const part of parts) {
          const next = [];
          const walk = (el) => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk);
          scope = next;
        }
        return scope;
      },
      focus() {}, blur() {}, scrollLeft: 0, scrollTop: 0, offsetWidth: 80, offsetHeight: 40,
      getContext() { return { fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {}, fill() {}, arc() {}, clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, fillText() {}, createLinearGradient() { return { addColorStop() {} }; } }; },
      getBoundingClientRect() { return { left: 0, top: 0, bottom: 40, right: 80, width: 80, height: 40 }; }
    };
    return node;
  }
  const rootUi = mkEl('div'), body = mkEl('body'), head = mkEl('head'), worldEl = mkEl('div');
  rootUi.setAttribute('id', 'ui'); worldEl.setAttribute('id', 'world');
  const document = {
    head, body, createElement: mkEl, createTextNode: t => ({ nodeType: 3, textContent: String(t ?? ''), children: [] }),
    getElementById: id => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: s => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: s => rootUi.querySelectorAll(s), addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document, window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  const load = f => vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), ctx, { filename: f });
  fs.readdirSync(path.join(root, 'src')).filter(f => /^(00|10|2\d)-.*\.js$/.test(f)).sort().forEach(load);
  const z = ctx.Z;
  let lastPreview = null;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview(s) { lastPreview = s; }, highlightEnclosure() {}, thumb: () => null, focus() {} };
  load('50-ui.js'); load('51-tools.js'); load('52-panels.js'); load('53-screens.js');
  z.UI.init();
  z.Sim.newGame({ seed: 905, map: 'fern_meadow', money: 200000 });
  setupFlatZone(z, 20, 20, 32, 32);
  assert.equal(z.Sim.placePath(22, 24, 'paved').ok, true);
  assert.equal(z.Sim.placePath(22, 25, 'paved').ok, true);

  // 1. Staff category cards display 32t for Ranger and 48t for Ranger station
  z.UI.openCat('staff', true);
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="keeper"] .spb').textContent, '32t');
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="keeper_hut"] .spb').textContent, '48t');

  // 2. Selecting Ranger tool populates strip hint + PLAN.staff 32-tile range ring
  z.UI.el.cards.querySelector('.card[data-id="keeper"]').click();
  assert.match(z.UI.el.strip.textContent, /32-tile base range/);
  const kpPlan = z.UI.Tools.PLAN.staff({ a: { i: 22, j: 24 }, b: { i: 22, j: 24 } });
  assert.equal(kpPlan.ok, true);
  assert.match(kpPlan.label, /32-tile range/);
  assert.equal(kpPlan.spec.ranges.length, 1);
  assert.equal(kpPlan.spec.ranges[0].r, 32 * z.TILE);
  z.UI.Tools.cancel();

  // 3. Placing & inspecting Ranger station + Ranger shows station/base range rings and stats
  z.UI.el.cards.querySelector('.card[data-id="keeper_hut"]').click();
  const hutPlan = z.UI.Tools.PLAN.building({ a: { i: 23, j: 24 }, b: { i: 23, j: 24 } });
  assert.match(hutPlan.warn, /48-tile radio range/);
  assert.equal(hutPlan.spec.ranges[0].r, 48 * z.TILE);
  z.UI.Tools.cancel();

  const hut = z.Sim.placeObject('keeper_hut', 23, 24, 3);
  assert.equal(hut.ok, true);
  const kh = z.Sim.hireStaff('keeper', 22, 24);
  assert.equal(kh.ok, true);

  z.UI.Panel.open('object', hut.id);
  assert.match(z.UI.el.panel.textContent, /Radio range.*48 tiles/);
  assert.ok(lastPreview && lastPreview.ranges && lastPreview.ranges[0].r === 48 * z.TILE);

  z.UI.Panel.open('staff', kh.id);
  assert.match(z.UI.el.panel.textContent, /Radio range.*48 tiles/);
  assert.equal(lastPreview.type, 'ranges');
  assert.equal(lastPreview.ranges.length, 2);

  z.UI.Panel.hide();
  z.UI.openModal('stf');
  assert.match(z.UI.el.mbody.textContent, /48t range/);
  z.UI.closeModal();

  // 4. Vet & Vet clinic show 48t triage zone badges, preview ring, and dispatch info
  z.state.unlocked.star = 5;
  z.UI.openCat('staff', true);
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="vet_clinic"] .spb').textContent, '48t');
  z.UI.el.cards.querySelector('.card[data-id="vet_clinic"]').click();
  const vcPlan = z.UI.Tools.PLAN.building({ a: { i: 23, j: 24 }, b: { i: 23, j: 24 } });
  assert.match(vcPlan.warn, /48-tile triage zone/);
  assert.equal(vcPlan.spec.ranges[0].r, 48 * z.TILE);
  z.UI.Tools.cancel();

  const vc = z.Sim.placeObject('vet_clinic', 26, 24, 3);
  assert.equal(vc.ok, true);
  const vh = z.Sim.hireStaff('vet', 22, 24);
  assert.equal(vh.ok, true);
  z.UI.Panel.open('object', vc.id);
  assert.match(z.UI.el.panel.textContent, /Clinic triage zone.*48 tiles/);
  z.UI.Panel.open('staff', vh.id);
  assert.match(z.UI.el.panel.textContent, /Radio on call.*reachable paths/);
});

test('dino vets interrupt patrols via radio, heal low-health & sick animals faster with vet_clinic, and report unreachable enclosures', () => {
  const z = game();
  z.Sim.newGame({ seed: 906, map: 'fern_meadow', money: 300000 });
  z.state.unlocked.star = 5;
  setupFlatZone(z, 18, 22, 34, 39);
  for (let j = 24; j <= 39; j++) assert.equal(z.Sim.placePath(27, j, 'paved').ok, true);
  for (let i = 20; i <= 26; i++) assert.equal(z.Sim.placePath(i, 24, 'paved').ok, true);
  fenceRect(z, 21, 25, 25, 29, 'chainlink');
  const a1 = z.Sim.spawnAnimal('dryosaurus', 23, 27);
  assert.ok(a1 && a1.enc);

  const vh = z.Sim.hireStaff('vet', 27, 38);
  assert.equal(vh.ok, true);
  const vet = z.state.staff.find(s => s.id === vh.id);
  for (let t = 0; t < 15 && (!vet.tk || vet.tk.k !== 'patrol'); t++) z.Sim._step(0.5);
  assert.equal(vet.tk.k, 'patrol');

  // Animal injured (health=40, !sick) must pull patrolling vet off patrol right away
  a1.health = 40;
  for (let t = 0; t < 5; t++) z.Sim._step(0.5);
  assert.equal(vet.tk.k, 'vet', 'vet must interrupt patrol via radio for injured/sick animal');
  assert.equal(vet.tk.a, a1.id);

  // Build Vet clinic inside 48 tiles -> vet heals to full health quickly and returns cleanly to path
  assert.equal(z.Sim.placeObject('vet_clinic', 28, 28, 3).ok, true);
  for (let t = 0; t < 60 && (a1.health < 100 || (vet.tk && vet.tk.k === 'vet')); t++) z.Sim._step(0.5);
  assert.equal(a1.health, 100, 'vet_clinic nearby enables full clinic recovery');
  assert.equal(a1.claim, 0);

  // Sick animal on disconnected path network reports noVetRoute & animalReport warning
  setupFlatZone(z, 14, 14, 19, 19);
  fenceRect(z, 15, 15, 18, 18, 'chainlink');
  assert.equal(z.Sim.placePath(15, 14, 'paved').ok, true);
  assert.equal(z.Sim.placePath(16, 14, 'paved').ok, true); // disconnected from mainland at 27,24
  const aIso = z.Sim.spawnAnimal('dryosaurus', 16, 16);
  aIso.sick = true;
  const encRep = z.Sim.enclosureReport(aIso.enc);
  const anRep = z.Sim.animalReport(aIso.id);
  assert.equal(encRep.noVetRoute, true);
  assert.ok(encRep.issues.some(x => /Vets cannot reach/i.test(x)));
  assert.ok(anRep.issues.some(x => /Vets cannot reach/i.test(x)));
});
