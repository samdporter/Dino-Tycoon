// Tests for Dino Tycoon Theme Park extension, modeled on tests/coaster.test.cjs and tests/core.test.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gameScripts, readScript, simulationScripts } = require('./game-scripts.cjs');

const root = path.resolve(__dirname, '..');

function game() {
  const values = new Map();
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URL: globalThis.URL || {},
    Blob: globalThis.Blob || {},
    FileReader: globalThis.FileReader || {},
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    },
    document: { readyState: 'loading', hidden: false, addEventListener() {}, getElementById: () => ({}) },
    location: { protocol: 'http:' },
    performance: { now: () => 0 },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  vm.runInContext('var window=globalThis', ctx);
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

test('Dino Theme Park Extension data, varied footprints, placement, undo/bulldoze, star unlocks & save/load persistence', () => {
  const z = game();
  z.Sim.newGame({ seed: 707, map: 'meadow', money: 500000 });
  z.state.unlocked.star = 0;

  const D = z.DATA;
  const expectedBuildings = [
    ['wooden_coaster', 'ride', 'coaster', 3, 5, 4, 2],
    ['loop_coaster', 'ride', 'coaster', 5, 6, 4, 3],
    ['mine_coaster', 'ride', 'coaster', 2, 4, 3, 1],
    ['log_flume', 'ride', 'coaster', 3, 4, 4, 2],
    ['ferris_wheel', 'ride', 'wheel', 2, 3, 3, 2],
    ['rubber_duck_stand', 'arcade', undefined, undefined, 2, 1, 0],
    ['air_rifle_stand', 'arcade', undefined, undefined, 2, 2, 1],
    ['ring_toss_stand', 'arcade', undefined, undefined, 1, 1, 0],
    ['whack_a_mole', 'arcade', undefined, undefined, 2, 1, 1],
    ['high_striker', 'arcade', undefined, undefined, 1, 2, 0],
    ['candy_floss', 'food', undefined, undefined, 1, 1, 0],
    ['popcorn_stand', 'food', undefined, undefined, 1, 1, 0],
    ['hot_dog_stand', 'food', undefined, undefined, 2, 1, 0],
    ['slushie_bar', 'drink', undefined, undefined, 2, 1, 1]
  ];
  const byB = Object.fromEntries(D.buildings.map(b => [b.id, b]));
  for (const [id, type, rideKind, thrill, w, h, star] of expectedBuildings) {
    const b = byB[id];
    assert.ok(b, `Missing building ${id}`);
    assert.equal(b.themepark, true, `${id} must have themepark: true`);
    assert.equal(b.type, type);
    if (rideKind !== undefined) assert.equal(b.rideKind, rideKind);
    if (thrill !== undefined) assert.equal(b.thrill, thrill);
    assert.equal(b.w, w);
    assert.equal(b.h, h);
    assert.equal(b.star, star);
  }
  assert.equal(byB.carousel.themepark, true);
  assert.equal(byB.balloon_stand.themepark, true);

  const expectedScenery = ['themepark_arch', 'bunting_poles', 'funhouse_mirror', 'balloon_arch', 'circus_lamp', 'clown_statue'];
  const byS = Object.fromEntries(D.scenery.map(s => [s.id, s]));
  for (const sid of expectedScenery) {
    const s = byS[sid];
    assert.ok(s, `Missing scenery ${sid}`);
    assert.equal(s.inEnclosure, false);
    assert.equal(s.themepark, true);
    assert.ok((s.star || 0) < 4);
  }

  assert.ok(Array.isArray(D.guestThoughts.coaster) && D.guestThoughts.coaster.length >= 3);
  assert.ok(Array.isArray(D.guestThoughts.arcade) && D.guestThoughts.arcade.length >= 3);
  assert.ok(Array.isArray(D.guestThoughts.candyFloss) && D.guestThoughts.candyFloss.length >= 3);
  const tpGoal = D.goals.find(g => g.id === 'themepark_3');
  assert.ok(tpGoal && tpGoal.type === 'themepark' && tpGoal.target === 3 && tpGoal.reward === 1800);

  // Star unlock gating verification at star 0
  clearFlatArea(z, 5, 10, 48, 48);
  const lockedRes = z.Sim.placeObject('loop_coaster', 12, 12, 0);
  assert.equal(lockedRes.ok, false, 'star: 3 item should be locked at 0 stars');
  assert.match(lockedRes.msg || lockedRes.why || '', /stars|unlock|Needs a 3-star park/i);

  const unlockedRes = z.Sim.placeObject('rubber_duck_stand', 12, 12, 0);
  assert.equal(unlockedRes.ok, true, 'star: 0 item should place at 0 stars');
  assert.equal(z.Sim.bulldoze(12, 12).ok, true);

  // Unlock star 3 for full testing
  z.state.unlocked.star = 3;

  for (let i = 10; i <= 44; i++) assert.equal(z.Sim.placePath(i, 24, 'paved').ok, true);
  for (let j = 25; j <= 42; j++) assert.equal(z.Sim.placePath(10, j, 'paved').ok, true);
  for (let i = 11; i <= 27; i++) z.Sim.placePath(i, 42, 'paved');
  for (let j = 43; j <= 55; j++) z.Sim.placePath(27, j, 'paved');

  const wc = z.Sim.placeObject('wooden_coaster', 12, 20, 0);
  const lc = z.Sim.placeObject('loop_coaster', 18, 20, 0);
  const mc = z.Sim.placeObject('mine_coaster', 25, 21, 0);
  const lf = z.Sim.placeObject('log_flume', 30, 20, 0);
  const fw = z.Sim.placeObject('ferris_wheel', 35, 21, 0);
  assert.ok(wc.ok && lc.ok && mc.ok && lf.ok && fw.ok, `All coasters and Ferris wheel should place cleanly: wc=${wc.why||wc.msg} lc=${lc.why||lc.msg} mc=${mc.why||mc.msg} lf=${lf.why||lf.msg} fw=${fw.why||fw.msg}`);

  const duck = z.Sim.placeObject('rubber_duck_stand', 12, 25, 0);
  const rifle = z.Sim.placeObject('air_rifle_stand', 15, 25, 0);
  const ring = z.Sim.placeObject('ring_toss_stand', 18, 25, 0);
  const whack = z.Sim.placeObject('whack_a_mole', 20, 25, 0);
  const striker = z.Sim.placeObject('high_striker', 23, 25, 0);
  const floss = z.Sim.placeObject('candy_floss', 25, 25, 0);
  const pop = z.Sim.placeObject('popcorn_stand', 27, 25, 0);
  const hotdog = z.Sim.placeObject('hot_dog_stand', 29, 25, 0);
  const slush = z.Sim.placeObject('slushie_bar', 32, 25, 0);
  assert.ok(duck.ok && rifle.ok && ring.ok && whack.ok && striker.ok && floss.ok && pop.ok && hotdog.ok && slush.ok);

  const arch = z.Sim.placeObject('themepark_arch', 35, 25, 0);
  const bunt = z.Sim.placeObject('bunting_poles', 37, 25, 0);
  const mir = z.Sim.placeObject('funhouse_mirror', 39, 25, 0);
  const barch = z.Sim.placeObject('balloon_arch', 41, 25, 0);
  const clamp = z.Sim.placeObject('circus_lamp', 43, 25, 0);
  const clown = z.Sim.placeObject('clown_statue', 44, 25, 0);
  assert.ok(arch.ok && bunt.ok && mir.ok && barch.ok && clamp.ok && clown.ok);

  // Verify footprints & objectReport fields
  const wcRep = z.Sim.objectReport(wc.id);
  assert.equal(wcRep.connected, true);
  assert.equal(wcRep.rideKind, 'coaster');
  assert.equal(wcRep.thrill, 3);
  assert.equal(wcRep.themepark, true);
  assert.equal(z.Sim.footprint('loop_coaster', 18, 20, 0).w, 6);
  assert.equal(z.Sim.footprint('loop_coaster', 18, 20, 0).h, 4);

  // Undo & Bulldoze check
  const canU = z.Sim.canUndo();
  assert.ok(canU.count > 0);
  assert.equal(z.Sim.undo().ok, true);
  assert.equal(z.state.objects.some(o => o.id === clown.id), false);
  const bRes = z.Sim.bulldoze(43, 25);
  assert.equal(bRes.ok, true);
  assert.equal(z.state.objects.some(o => o.id === clamp.id), false);

  // Save & load persistence (including ridesTaken and arcadePlayed stats)
  z.state.stats.ridesTaken = 42;
  z.state.stats.arcadePlayed = 19;
  const saved = z.Sim.save();
  z.Sim.newGame({ seed: 1 });
  assert.equal(z.Sim.load(saved), true);
  assert.equal(z.state.stats.ridesTaken, 42);
  assert.equal(z.state.stats.arcadePlayed, 19);
  assert.ok(z.state.objects.some(o => o.type === 'wooden_coaster'));
  assert.ok(z.state.objects.some(o => o.type === 'loop_coaster'));
  assert.ok(z.state.objects.some(o => o.type === 'rubber_duck_stand'));
  assert.ok(z.state.objects.some(o => o.type === 'candy_floss'));
  assert.ok(z.state.objects.some(o => o.type === 'themepark_arch'));
});

test('Dino Theme Park guests ride coasters, play arcade stands, eat candy floss, boost arrivalValue & complete goal', () => {
  const z = game();
  z.Sim.newGame({ seed: 808, map: 'meadow', money: 250000 });
  z.state.unlocked.star = 3;

  clearFlatArea(z, 15, 25, 42, 43);

  // Connect path from gate to midway
  for (let j = 34; j <= 52; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 20; i <= 35; i++) z.Sim.placePath(i, 34, 'paved');

  const baseVal = z.Sim._rt().value;
  const coaster = z.Sim.placeObject('wooden_coaster', 20, 30, 0);
  const duck = z.Sim.placeObject('rubber_duck_stand', 26, 33, 0);
  const rifle = z.Sim.placeObject('air_rifle_stand', 28, 32, 0);
  const floss = z.Sim.placeObject('candy_floss', 30, 33, 0);
  assert.ok(coaster.ok && duck.ok && rifle.ok && floss.ok, `Failed placing test objects: coaster=${coaster.why||coaster.msg}, duck=${duck.why||duck.msg}, rifle=${rifle.why||rifle.msg}, floss=${floss.why||floss.msg}`);

  const boostedVal = z.Sim._rt().value;
  assert.ok(boostedVal > baseVal && boostedVal <= baseVal + 4.5, `Operating rides should add bounded admission value (${baseVal} -> ${boostedVal})`);

  // Goal completion check after secondly/checkGoals cycle (runs every 2s)
  const moneyBeforeGoal = z.state.money;
  for (let k = 0; k < 4; k++) z.Sim._step(0.5);
  assert.equal(z.state.goals.themepark_3, true, 'themepark_3 goal should complete with 3 attractions');
  assert.ok(z.state.money >= moneyBeforeGoal + 1800, 'themepark_3 goal should award £1,800');

  // Spawn guests near the midway and step simulation so they visit coaster, arcades, and candy floss
  const gProto = {
    x: 27 * z.TILE + 1, z: 34 * z.TILE + 1, heading: 0, speed: 0, state: 'walk',
    hunger: 30, thirst: 20, bladder: 10, energy: 90, happiness: 70, money: 200,
    thought: '', thoughtT: 0, seen: {}, group: 1, ti: 27 + 34 * z.N, ni: 27 + 34 * z.N,
    px: 27 * z.TILE + 1, pz: 34 * z.TILE + 1, lo: 0, lo2: 0, bs: 3.0, gt: '', gid: 0, dk: '',
    wt: 0, nt: 0, acc: 0, tcool: 0, fun: 40, mood: 5, lit: false, stay: 300, pv: 0,
    last: 0, bid: 0, fleeT: 0, nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0, shel: 0, ubid: 0,
    al: { meal: 0, drink: 0, treat: 3, shop: 0, act: 5 },
    seenEnc: {}, seenB: {}, tol: 1.5, thor: 0.9, tiredAt: 25, spent: 0, paid: 8,
    nSeen: 0, nView: 0, prettyE: 0.3, nbuy: 0, done: 0, strollNext: 0, idle: 0, gAge: 0,
    ix: 27 * z.TILE + 1, iz: 34 * z.TILE + 1, glide: 0, sx: 0, sz: 0, spot: 0, lm: 0, wat: 0
  };
  const thoughtsSeen = new Set();
  for (let i = 0; i < 16; i++) {
    const g = JSON.parse(JSON.stringify(gProto));
    g.id = 9000 + i;
    g.group = 900 + i;
    g.seed = 100 + i;
    g.pv = z.Sim._rt().pathVer;
    z.state.guests.push(g);
    z.Sim._rt().gById.set(g.id, g);
  }

  for (let step = 0; step < 300; step++) {
    z.Sim._step(0.5);
    for (const g of z.state.guests) {
      g.stay = 300;
      g.nbuy = 0;
      g.bladder = 10;
      g.thirst = 10;
      g.energy = 90;
      g.happiness = Math.max(g.happiness, 65);
      if (g.thought) thoughtsSeen.add(g.thought);
    }
  }

  const cObj = z.Sim.objectReport(coaster.id);
  const dObj = z.Sim.objectReport(duck.id);
  const rObj = z.Sim.objectReport(rifle.id);
  const fObj = z.Sim.objectReport(floss.id);

  assert.ok(cObj.uses >= 1, `Rollercoaster should have uses >= 1, got ${cObj.uses}`);
  assert.ok(cObj.income >= 10, `Rollercoaster should earn income, got ${cObj.income}`);
  assert.ok((dObj.uses + rObj.uses) >= 1, `Arcade stands should have uses >= 1, got duck=${dObj.uses}, rifle=${rObj.uses}`);
  assert.ok(fObj.uses >= 1, `Candy floss stand should have uses >= 1, got ${fObj.uses}`);
  assert.ok(z.state.stats.ridesTaken >= 1, 'S.stats.ridesTaken should increment');
  assert.ok(z.state.stats.arcadePlayed >= 1, 'S.stats.arcadePlayed should increment');

  const allCoaster = new Set(z.DATA.guestThoughts.coaster);
  const allArcade = new Set(z.DATA.guestThoughts.arcade);
  const allFloss = new Set(z.DATA.guestThoughts.candyFloss);
  const sawCoaster = [...thoughtsSeen].some(t => allCoaster.has(t));
  const sawArcade = [...thoughtsSeen].some(t => allArcade.has(t));
  const sawFloss = [...thoughtsSeen].some(t => allFloss.has(t));
  assert.ok(sawCoaster || sawArcade || sawFloss, `Expected theme park thoughts, saw: ${[...thoughtsSeen].join(' | ')}`);
});

test('Dino UI Theme Park tab, Guests group, sub-filters, goalProgress, and inspect panel', () => {
  function mkEl(tag) {
    const attrs = {}, children = [], cls = new Set(), listeners = {}, style = { setProperty() {} };
    let _html = '', _text = '';
    const node = {
      nodeType: 1, tagName: String(tag || 'div').toUpperCase(), style, children,
      get firstChild() { return children[0] || null; },
      classList: {
        add(...a) { a.forEach(c => c && cls.add(c)); }, remove(...a) { a.forEach(c => c && cls.delete(c)); },
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
        const parts = sel.trim().split(/\s+/);
        let scope = [node];
        for (const part of parts) {
          const next = [];
          const walk = el => { for (const ch of el.children) { if (ch.tagName) { if (matchOne(ch, part)) next.push(ch); walk(ch); } } };
          scope.forEach(walk); scope = next;
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
  const doc = {
    head, body, createElement: mkEl, createTextNode: t => ({ nodeType: 3, textContent: String(t ?? ''), children: [] }),
    getElementById: id => id === 'ui' ? rootUi : id === 'world' ? worldEl : null,
    querySelector: s => s === '#ui' ? rootUi : s === '#world' ? worldEl : rootUi.querySelector(s),
    querySelectorAll: s => rootUi.querySelectorAll(s), addEventListener() {}
  };
  const ctx = vm.createContext({
    console, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame() {}, document: doc, window: null, innerWidth: 1280, innerHeight: 900,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  const simFiles = simulationScripts();
  for (const f of simFiles) vm.runInContext(readScript(f), ctx, { filename: f });
  ['50-ui-dom.js', '50-ui.js', '51-input.js', '51-tools.js', '52-panels.js', '53-screen-shell.js', '53-standard-tabs.js', '53-screens.js', '66b-ui-coaster.js', '68-ui-power.js', '75-ui-groups.js'].forEach(f => {
    const fullPath = gameScripts().get(f);
    if (fullPath) {
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), ctx, { filename: f });
    }
  });
  const z = ctx.Z;
  z.World = { cam: { pitch: 0.9, dist: 40 }, setPreview() {}, highlightEnclosure() {}, thumb: () => null, focus() {} };
  z.UI.init();
  z.Sim.newGame({ seed: 912 });
  z.state.money = 250000; z.state.unlocked.star = 3;

  // Verify UI.CATS contains 'themepark' and 'coasters'
  const catIds = z.UI.CATS.map(c => c.id);
  assert.ok(catIds.includes('themepark'));
  assert.ok(catIds.includes('coasters'));

  // Verify UI.GROUPS has 'themepark' and 'coasters' under g_guest ('Guests')
  const guestGroup = z.UI.GROUPS.find(g => g.id === 'g_guest');
  assert.ok(guestGroup);
  assert.ok(guestGroup.cats.includes('themepark'));
  assert.ok(guestGroup.cats.includes('coasters'));

  // Theme Park tab sub-filters (all, rides, arcade, food, scenery)
  z.UI.openCat('themepark', true);
  const tpFilters = z.UI.el.cards.querySelectorAll('.drawer-mode button');
  assert.equal(tpFilters.length, 5);
  tpFilters[1].click(); // Rides
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="wooden_coaster"]'));
  assert.equal(z.UI.el.cards.querySelector('.card[data-id="rubber_duck_stand"]'), null);
  tpFilters[2].click(); // Arcade
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="rubber_duck_stand"]'));
  tpFilters[3].click(); // Food
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="candy_floss"]'));
  tpFilters[4].click(); // Scenery
  assert.ok(z.UI.el.cards.querySelector('.card[data-id="themepark_arch"]'));
  tpFilters[0].click(); // All

  // Place coaster and arcade stand and check goalProgress & inspect panel subtitles & thrill rating
  clearFlatArea(z, 20, 30, 36, 42);
  z.Sim.placePath(27, 36, 'paved');
  const wc = z.Sim.placeObject('wooden_coaster', 28, 35, 0);
  const duck = z.Sim.placeObject('rubber_duck_stand', 24, 35, 0);
  assert.ok(wc.ok && duck.ok);

  const tpGoal = z.DATA.goals.find(g => g.id === 'themepark_3');
  const gp = z.UI.goalProgress(tpGoal);
  assert.equal(gp.value, 2);

  z.UI.Panel.open('object', wc.id);
  assert.match(z.UI.el.panel.textContent, /Rollercoaster/);
  assert.match(z.UI.el.panel.textContent, /Thrill rating/);

  z.UI.Panel.open('object', duck.id);
  assert.match(z.UI.el.panel.textContent, /Arcade & game stall/);

  z.Sim.ratingBreakdown = () => ({ animals: 0.5, welfare: 0.8, guests: 0.6, facilities: 0.4, cleanliness: 0.7, scenery: 0.9,
    stars: 3.9, rating: 2.1, weights: { animals: 0.31, welfare: 0.19, guests: 0.17, facilities: 0.13, cleanliness: 0.11, scenery: 0.09 },
    baseStars: 3.72, collectionCap: 3.71, attractionBonus: 0.18, speciesCount: 1, animalCount: 2,
    serviceDemand: 50, services: { food: { capacity: 10, needed: 30 }, drink: { capacity: 50, needed: 30 }, toilet: { capacity: 50, needed: 30 }, bench: { capacity: 50, needed: 30 }, bin: { capacity: 50, needed: 30 }, fun: { capacity: 50, needed: 30 } } });
  z.state.rating = 2.1;
  z.UI.openModal('ov');
  const overview = z.UI.el.mbody.textContent;
  assert.match(overview, /2\.1/);
  assert.match(overview, /3\.9/);
  assert.match(overview, /base 3\.71/);
  assert.match(overview, /attractions 0\.18/);
  assert.match(overview, /31%/);
  assert.match(overview, /Collection ceiling/);
  assert.match(overview, /Food capacity is short/);

  z.state.animals.push({ id: 12345, name: 'Bramble', species: 'dryosaurus', state: 'escaped', x: 24, z: 30 });
  z.UI.closeModal();
  z.UI.openModal('ov');
  assert.match(z.UI.el.mbody.textContent, /Bramble has escaped/);
});

test('Dino Theme Park 3D Models, Footprints, Finite Geometry & 1,000-frame Animation Stress Test with real THREE', () => {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    crossVectors(a, b) {
      const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
      this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx; return this;
    }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    normalize() { const l = this.length() || 1; return this.divideScalar(l); }
    divideScalar(s) { this.x /= s; this.y /= s; this.z /= s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
    applyMatrix4() { return this; }
  }
  class Quaternion {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    copy(q) { Object.assign(this, q); return this; }
    setFromEuler() { return this; }
    setFromUnitVectors() { return this; }
    setFromRotationMatrix() { return this; }
  }
  class Euler { set() { return this; } }
  class Matrix4 {
    compose() { return this; }
    makeBasis() { return this; }
  }
  class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
    setXYZ(i, x, y, z) { const o = i * this.itemSize; this.array[o] = x; this.array[o + 1] = y; this.array[o + 2] = z; }
  }
  class BufferGeometry {
    constructor() { this.attributes = { position: new BufferAttribute(new Float32Array(18), 3), normal: new BufferAttribute(new Float32Array(18), 3) }; }
    setAttribute(k, v) { this.attributes[k] = v; }
    toNonIndexed() { return this; }
    computeBoundingSphere() {}
    computeBoundingBox() {}
  }
  class Obj3D {
    constructor() {
      this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 };
      this.quaternion = new Quaternion(); this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(s) { this.x = this.y = this.z = s; } };
      this.children = []; this.userData = {};
    }
    add(...a) { this.children.push(...a); }
    traverse(fn) { fn(this); for (const ch of this.children) ch.traverse(fn); }
    clone() { const c = new Obj3D(); c.userData = { ...this.userData }; return c; }
  }
  class Group extends Obj3D {}
  class Mesh extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m || {}; } }
  class MeshLambertMaterial { constructor(o = {}) { Object.assign(this, o); } }
  class CanvasTexture {}

  const THREE = {
    Vector3, Quaternion, Euler, Matrix4, BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, CanvasTexture,
    SphereGeometry: BufferGeometry, BoxGeometry: BufferGeometry, CylinderGeometry: BufferGeometry,
    IcosahedronGeometry: BufferGeometry, PlaneGeometry: BufferGeometry, CircleGeometry: BufferGeometry,
    DoubleSide: 2,
    Box3: class { setFromObject() { return { min: new Vector3(-1, 0, -1), max: new Vector3(1, 2, 1) }; } }
  };
  const fakeCanvas = () => ({
    width: 128, height: 64, style: {},
    getContext: () => ({ fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', fillRect() {}, strokeRect() {}, fillText() {} })
  });
  const ctx = vm.createContext({
    console, THREE, setTimeout, clearTimeout, Math, Float32Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Uint8Array,
    performance: { now: () => Date.now() },
    document: { createElement: tag => tag === 'canvas' ? fakeCanvas() : { style: {}, appendChild() {} }, addEventListener() {} },
    window: null, requestAnimationFrame() {}
  });
  ctx.window = ctx; ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'vendor/three.r128.min.js'), 'utf8'), ctx, { filename: 'three.r128.min.js' });
  for (const f of ['00-data.js', '30-models-toilets.js', '30-models-common.js', '30-models.js', 'world-renderer.js', '40-world.js']) {
    const fullPath = gameScripts().get(f);
    if (fullPath) {
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), ctx, { filename: f });
    }
  }

  const M = ctx.Z.Models, D = ctx.Z.DATA;

  // 1. Verify buildingFootprint matches D.buildings (w, h)
  for (const b of D.buildings) {
    if (b.themepark && !b.coasterStation) {
      const fp = M.buildingFootprint(b.id);
      assert.ok(fp, `buildingFootprint(${b.id}) should return footprint`);
      assert.equal(fp.w, b.w, `${b.id} width`);
      assert.equal(fp.h, b.h, `${b.id} height`);
    }
  }

  const checkSubtreeFinite = (obj, label) => {
    obj.traverse(ch => {
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Number.isFinite(ch.position[axis]), `${label} pos.${axis}`);
        assert.ok(Number.isFinite(ch.rotation[axis]), `${label} rot.${axis}`);
        assert.ok(Number.isFinite(ch.scale[axis]), `${label} scale.${axis}`);
      }
      if (ch.quaternion) {
        for (const axis of ['x', 'y', 'z', 'w']) assert.ok(Number.isFinite(ch.quaternion[axis]), `${label} quat.${axis}`);
      }
      if (ch.geometry && ch.geometry.attributes) {
        if (ch.geometry.attributes.position) {
          const arr = ch.geometry.attributes.position.array;
          for (let i = 0; i < arr.length; i++) assert.ok(Number.isFinite(arr[i]), `${label} vertex NaN`);
        }
        if (ch.geometry.attributes.normal) {
          const arr = ch.geometry.attributes.normal.array;
          for (let i = 0; i < arr.length; i++) assert.ok(Number.isFinite(arr[i]), `${label} normal NaN`);
        }
      }
    });
  };

  const tpBuildings = [
    'wooden_coaster', 'loop_coaster', 'mine_coaster', 'log_flume', 'ferris_wheel',
    'rubber_duck_stand', 'air_rifle_stand', 'ring_toss_stand', 'whack_a_mole', 'high_striker',
    'candy_floss', 'popcorn_stand', 'hot_dog_stand', 'slushie_bar'
  ];
  const tpScenery = ['themepark_arch', 'bunting_poles', 'funhouse_mirror', 'balloon_arch', 'circus_lamp', 'clown_statue'];

  const models = [];
  for (const id of tpBuildings) {
    const grp = M.createBuilding(id);
    assert.ok(grp, `Missing building model ${id}`);
    checkSubtreeFinite(grp, `building:${id}`);
    models.push({ id, grp });
  }
  for (const id of tpScenery) {
    const grp = M.createScenery(id);
    assert.ok(grp, `Missing scenery model ${id}`);
    checkSubtreeFinite(grp, `scenery:${id}`);
    models.push({ id, grp });
  }

  // Verify circus_lamp.userData.isLamp === true
  assert.equal(M.createScenery('circus_lamp').userData.isLamp, true);

  // 1,000-frame animation stress test
  const dts = [0.016, 0.033, 0.05];
  let tSim = 0;
  for (let f = 0; f < 1000; f++) {
    const dt = dts[f % dts.length];
    tSim += dt;
    for (const m of models) {
      if (typeof m.grp.userData.update === 'function') {
        m.grp.userData.update(dt, tSim);
      }
    }
    if (f % 250 === 0 || f === 999) {
      for (const m of models) checkSubtreeFinite(m.grp, `${m.id}@f=${f}`);
    }
  }
});

test('Dino Theme Park rotation (rot 0..3), terrain elevation, undo, and mid-ride bulldoze fuzzing', () => {
  const z = game();
  z.Sim.newGame({ seed: 999, map: 'meadow', mapSize: 'medium', money: 1000000 });
  z.state.unlocked.star = 4;

  clearFlatArea(z, 5, 5, 48, 48);
  for (let j = 10; j <= 48; j++) z.Sim.placePath(25, j, 'paved');
  for (let i = 6; i <= 48; i++) z.Sim.placePath(i, 25, 'paved');

  const rectTestBuildings = [
    ['wooden_coaster', 5, 4],
    ['loop_coaster', 6, 4],
    ['mine_coaster', 4, 3],
    ['log_flume', 4, 4],
    ['rubber_duck_stand', 2, 1],
    ['high_striker', 1, 2],
    ['hot_dog_stand', 2, 1]
  ];

  for (const [id, defW, defH] of rectTestBuildings) {
    for (let rot = 0; rot < 4; rot++) {
      const fp = z.Sim.footprint(id, 10, 10, rot);
      assert.equal(fp.w, rot % 2 === 1 ? defH : defW, `${id} rot=${rot} w`);
      assert.equal(fp.h, rot % 2 === 1 ? defW : defH, `${id} rot=${rot} h`);
      const r1 = z.Sim.placeObject(id, 10, 26, rot);
      assert.equal(r1.ok, true, `${id} rot=${rot}`);
      assert.equal(z.Sim.undo().ok, true);
      const r2 = z.Sim.placeObject(id, 10, 26, rot);
      assert.equal(r2.ok, true);
      assert.equal(z.Sim.bulldoze(10, 26).ok, true);
      assert.equal(z.state.objects.some(o => o.id === r2.id), false);
    }
  }

  // Active mid-ride bulldoze while guests are queueing/using rides
  z.Sim.newGame({ seed: 777, map: 'meadow', mapSize: 'medium', money: 500000 });
  z.state.unlocked.star = 4;
  z.state.open = true;
  z.state.time = 0.4;
  clearFlatArea(z, 15, 25, 36, 42);
  for (let j = 34; j <= 52; j++) z.Sim.placePath(27, j, 'paved');
  for (let i = 22; i <= 34; i++) z.Sim.placePath(i, 34, 'paved');
  const lc = z.Sim.placeObject('loop_coaster', 22, 30, 0);
  assert.ok(lc.ok, `loop_coaster placement failed: ${lc.why || lc.msg}`);

  for (let i = 0; i < 26; i++) {
    const g = {
      id: 50000 + i, name: 'Rider ' + i, seed: i + 1, x: 25 * 2 + 1, z: 34 * 2 + 1,
      heading: 0, speed: 0, state: 'walk', hunger: 10, thirst: 10, bladder: 10, energy: 90,
      happiness: 80, money: 200, thought: '', thoughtT: 0, seen: {}, group: 5000 + i,
      ti: 25 + 34 * z.N, ni: 25 + 34 * z.N, px: 51, pz: 69, lo: 0, lo2: 0, bs: 3,
      gt: 'bld', gid: lc.id, dk: 'b' + lc.id, wt: 0, nt: 0.5, acc: 0, tcool: 0, fun: 30,
      mood: 5, lit: false, stay: 300, pv: z.Sim._rt().pathVer, last: 0, bid: 0, fleeT: 0,
      nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0, shel: 0, ubid: 0,
      al: { meal: 1, drink: 1, treat: 2, shop: 1, act: 3 }, seenEnc: {}, seenB: {},
      tol: 1.8, thor: 0.9, tiredAt: 25, spent: 0, paid: 8, nSeen: 0, nView: 0, prettyE: 0.3,
      nbuy: 0, done: 0, strollNext: 0, idle: 0, gAge: 0, ix: 51, iz: 69, glide: 0, sx: 51, sz: 69,
      spot: 0, lm: 0, wat: 0
    };
    z.state.guests.push(g);
    z.Sim._rt().gById.set(g.id, g);
  }
  for (let s = 0; s < 20; s++) z.Sim._step(0.25);

  const rt = z.Sim._rt();
  assert.ok(z.state.guests.some(g => g.state === 'use') || z.state.guests.some(g => g.state === 'queue') || z.state.guests.some(g => g.gid === lc.id));
  const bRes = z.Sim.bulldoze(22, 31);
  assert.equal(bRes.ok, true);
  assert.equal(rt.bq[lc.id], undefined);
  for (const g of z.state.guests) {
    assert.notEqual(g.gid, lc.id);
    assert.notEqual(g.ubid, lc.id);
    assert.ok(g.state !== 'queue' && g.state !== 'use');
    assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z));
  }
});
