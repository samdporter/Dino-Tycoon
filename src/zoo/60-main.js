// ===== 60-main.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - bootstrap, main loop, title screen, saving, quality management. */
(function () {
  'use strict';
  var Main = Z.Main = { playing: false }, UI = Z.UI, h = UI.h, ic = UI.ic, N = Z.N;
  var SAVE_KEY = 'wildacres.save.v1', SET_KEY = 'wildacres.settings.v1';
  var mem = {}, settings = { sound: true, quality: 'auto' }, titleEl, last = 0, saveT = 0, orbit = 0.4, saveFailed = false;
  var ema = 0.016, slowT = 0, prCap = 2, budget = 240, QUAL = { low: [1, 140], med: [1.5, 320], high: [2, 600] };

  // ---------------------------------------------------------------- storage (localStorage may be blocked)
  function sget(k) { try { var v = localStorage.getItem(k); if (v !== null) return v; } catch (e) { } return mem[k] || null; }
  function sset(k, v) { mem[k] = v; try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  Main.hasSave = function () { return !!sget(SAVE_KEY); };
  Main.save = function () {
    if (!Main.playing || (Z.state && Z.state.gameOver)) return false;
    try { var s = Z.Sim.save(); mem[SAVE_KEY] = s; try { localStorage.setItem(SAVE_KEY, s); return true; } catch (e) { return false; } } catch (e) { console.error('save failed', e); return false; }
  };
  Main.saveSettings = function () { settings.sound = Z.Audio.enabled(); sset(SET_KEY, JSON.stringify(settings)); };
  function loadSettings() { try { var s = JSON.parse(sget(SET_KEY) || '{}'); if (s.quality) settings.quality = s.quality; if (s.sound === false) settings.sound = false; } catch (e) { } Z.Audio.setEnabled(settings.sound); }

  // ---------------------------------------------------------------- quality
  Main.getQuality = function () { return settings.quality; };
  Main.setQuality = function (q) {
    settings.quality = q; sset(SET_KEY, JSON.stringify(settings)); ema = 0.016; slowT = 0;
    if (q === 'auto') { var dpr = window.devicePixelRatio || 1; prCap = Math.min(dpr, UI.touch() ? 1.5 : 2); budget = UI.touch() ? 340 : 520; }
    else { prCap = QUAL[q][0]; budget = QUAL[q][1]; }
    applyQuality();
  };
  function applyQuality() { if (Z.World.setQuality) Z.World.setQuality(prCap, budget); else Z.World.resize(); }

  // ---------------------------------------------------------------- demo zoo for the title backdrop
  function buildDemo() {
    Z.Sim.newGame({ seed: 7, money: 5e6 });
    var S = Z.state, Sim = Z.Sim;
    S.unlocked.star = 5; S.money = 5e6;
    function R(r) { return r; }
    function rect(i0, j0, i1, j1, t) { for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) Sim.paintTerrain(i, j, t, 0); }
    function fence(i0, j0, i1, j1, f) { var i, j; for (i = i0; i <= i1; i++) { Sim.placeFence({ axis: 'x', i: i, j: j0 }, f); Sim.placeFence({ axis: 'x', i: i, j: j1 + 1 }, f); } for (j = j0; j <= j1; j++) { Sim.placeFence({ axis: 'z', i: i0, j: j }, f); Sim.placeFence({ axis: 'z', i: i1 + 1, j: j }, f); } }
    function path(i0, j0, i1, j1, p) { for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) Sim.placePath(i, j, p); }
    function obj(t, i, j, r) { Sim.placeObject(t, i, j, r || 0); }
    path(27, 33, 28, 39, 'paved'); path(12, 33, 44, 34, 'paved'); path(34, 35, 34, 39, 'cobble');
    rect(14, 22, 21, 31, 'savannah'); fence(14, 22, 21, 31, 'chainlink');
    rect(23, 22, 30, 31, 'sand'); fence(23, 22, 30, 31, 'chainlink');
    rect(32, 22, 39, 31, 'forest'); fence(32, 22, 39, 31, 'reinforced');
    rect(41, 22, 47, 31, 'rainforest'); fence(41, 22, 47, 31, 'glass');
    rect(15, 36, 21, 42, 'grass'); fence(15, 36, 21, 42, 'post_rail');
    rect(16, 24, 18, 26, 'water');
    [['acacia', 15, 24], ['acacia', 20, 29], ['tall_grass', 17, 29], ['bush', 19, 23], ['palm', 24, 24], ['cactus', 28, 29], ['bush', 26, 26], ['pine', 33, 24], ['oak', 37, 29], ['wooden_shelter', 36, 25], ['bush', 34, 29], ['jungle_tree', 42, 24], ['jungle_tree', 46, 29], ['fern', 44, 26], ['bush', 17, 40]]
      .forEach(function (a) { obj(a[0], a[1], a[2]); });
    [['lamp', 26, 35], ['lamp', 30, 35], ['lamp', 20, 35], ['lamp', 38, 35], ['bench', 24, 35], ['bench', 33, 35], ['bin', 25, 36], ['bin', 31, 36], ['flower_bed', 24, 52], ['flower_bed', 31, 52], ['fountain', 24, 38], ['oak', 22, 38], ['pine', 12, 36]].forEach(function (a) { obj(a[0], a[1], a[2]); });
    [['burger_stand', 30, 37], ['ice_cream', 26, 37], ['toilets', 36, 37], ['gift_shop', 39, 36], ['drinks_stall', 22, 36]].forEach(function (a) { obj(a[0], a[1], a[2]); });
    function an(sp, i, j, n) { for (var k = 0; k < n; k++) Sim.addAnimal(sp, i + (k % 3), j + ((k / 3) | 0)); }
    an('zebra', 16, 27, 3); an('camel', 25, 26, 3); an('wolf', 34, 26, 3); an('gorilla', 43, 27, 3); an('kangaroo', 17, 38, 3);
    Sim.hireStaff('keeper'); Sim.hireStaff('cleaner'); Sim.hireStaff('guide');
    S.rating = 3.4; S.time = 0.38; S.speed = 4;
    for (var k = 0; k < 220; k++) Sim.tick(0.1);
    S.speed = 1; S.time = 0.46; S.gameOver = false;
  }

  // ---------------------------------------------------------------- title screen
  function buildTitle() {
    titleEl = document.getElementById('title'); titleEl.innerHTML = '';
    var has = Main.hasSave();
    titleEl.appendChild(h('nav.tycoon-choice', { 'aria-label': 'Choose your tycoon' },
      h('a', { href: 'index.html', text: 'Dino Tycoon' }),
      h('a', { href: 'zoo.html', text: 'Zoo Tycoon', 'aria-current': 'page' })));
    titleEl.appendChild(h('div.emblem', { html: ic('paw') }));
    titleEl.appendChild(h('div.logo', h('small', { text: 'a zoo-keeping adventure' }), 'Wild Acres', h('br'), 'Zoo'));
    titleEl.appendChild(h('div.tag', { text: 'Fence it, plant it, fill it with wonderful animals, and open the gates.' }));
    var tb = h('div.tb');
    if (has) tb.appendChild(h('button.btn.gold', { html: ic('play') + 'Continue', on: { click: function () { UI.snd('unlock'); UI.snd('click'); Main.continueGame(); } } }));
    tb.appendChild(h('button.btn' + (has ? '.alt' : ''), { html: ic('plus') + 'New game', on: { click: function () { UI.snd('unlock'); UI.snd('click'); if (has && !tb.confirmNew) { tb.confirmNew = true; this.innerHTML = 'Replace saved zoo? Tap again'; var b = this; setTimeout(function () { tb.confirmNew = false; b.innerHTML = ic('plus') + 'New game'; }, 3000); } else Main.newGame(); } } }));
    titleEl.appendChild(tb);
    titleEl.appendChild(h('div.ver', { text: 'Wild Acres Zoo' }));
  }
  Main.showTitle = function () {
    UI.titleOpen = true; Main.playing = false; buildTitle(); titleEl.classList.add('on'); document.getElementById('ui').style.display = 'none';
    var c = Z.World.cam; c.dist = 88; c.pitch = 0.5; c.target.x = 62; c.target.z = 54;
  };
  function enterGame() {
    UI.titleOpen = false; titleEl.classList.remove('on'); document.getElementById('ui').style.display = ''; Main.playing = true; saveT = 0;
    UI.reset(); UI.cat = null; UI.markTabs && UI.markTabs(); UI.el.cards.className = 'empty';
    UI.snd('unlock');
  }
  function startCam() { var c = Z.World.cam; c.target.x = 56; c.target.z = 68; c.dist = UI.narrow() ? 76 : 70; c.yaw = 0.15; c.pitch = 0.9; }
  Main.newGame = function () {
    Z.Sim.newGame(); Z.state.speed = 1; startCam(); enterGame();
    if (UI.Panel) UI.Panel.closeSheet(); UI.closeModal();
    UI.Tutorial.restart();
  };
  Main.continueGame = function () {
    var s = sget(SAVE_KEY), ok = false;
    try { ok = s && Z.Sim.load(s); } catch (e) { console.error(e); ok = false; }
    if (!ok) { UI.toast('That save could not be loaded. Starting fresh.', 'bad'); Main.newGame(); return; }
    Z.state.speed = 1; startCam(); enterGame(); UI.closeModal();
    UI.toast('Welcome back! Day ' + Z.state.day + '.', 'good');
  };
  Main.demo = function () { buildDemo(); Z.bus.emit('reset'); UI.reset(); };
  Main.toTitle = function () {
    Main.save(); UI.closeModal(); if (UI.Tutorial) UI.Tutorial.active() && UI.el.tut.classList.remove('on');
    if (UI.Panel) UI.Panel.hide(true); if (UI.Tools) UI.Tools.cancel(true);
    buildDemo(); Z.bus.emit('reset'); Main.showTitle();
  };

  // ---------------------------------------------------------------- main loop
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    var raw = Math.max(0.001, (now - last) / 1000); last = now; var dt = Math.min(0.1, raw);
    try {
      if (Main.playing) {
        Z.Sim.tick(dt);
        UI.update(dt); Z.Audio.update(dt);
        saveT += dt; if (saveT >= 30) { saveT = 0; if (!Main.save() && !saveFailed) { saveFailed = true; UI.toast('Autosave is unavailable in this browser.', 'info'); } }
      } else { Z.Sim.tick(dt); var c = Z.World.cam; c.yaw += dt * 0.07; }
      Z.World.frame(dt);
    } catch (e) { console.error('frame error', e); }
    // adaptive quality
    ema += (Math.min(raw, 0.25) - ema) * 0.05;
    if (settings.quality === 'auto' && Z.World.setQuality) {
      if (ema > 0.042) { slowT += raw; if (slowT > 2.5) { slowT = 0; if (prCap > 0.7) { prCap = Math.max(0.65, prCap * 0.8); budget = Math.max(140, budget - 40); applyQuality(); ema = 0.03; } } } else slowT = Math.max(0, slowT - raw * 0.5);
    }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    var cont = document.getElementById('world');
    try {
      buildDemo();
      Z.World.init(cont);
      UI.init();
      loadSettings();
      var dpr = window.devicePixelRatio || 1; prCap = Math.min(dpr, UI.touch() ? 1.5 : 2); budget = UI.touch() ? 340 : 520; applyQuality();
      Z.bus.emit('reset');
      Main.showTitle();
    } catch (e) { console.error('boot failed', e); var b = document.getElementById('boot'); if (b) b.innerHTML = '<div class="boot-in"><div class="boot-logo">Something went wrong</div><div class="boot-sub">' + String(e && e.message || e) + '</div></div>'; return; }
    window.addEventListener('resize', function () { Z.World.resize(); applyQuality(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { Z.World.resize(); applyQuality(); }, 200); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { Main.save(); } else last = performance.now(); });
    window.addEventListener('pagehide', function () { Main.save(); });
    window.addEventListener('pointerdown', function () { UI.snd('unlock'); }, { passive: true, once: false });
    last = performance.now(); requestAnimationFrame(frame);
    setTimeout(function () { var b = document.getElementById('boot'); if (b) { b.classList.add('gone'); setTimeout(function () { b.remove(); }, 700); } }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
