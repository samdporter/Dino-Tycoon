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
  function sget(k) {
    if (Z.Storage && Z.Storage.get) {
      var v = Z.Storage.get(k);
      if (v !== null && v !== undefined) return v;
    }
    try { var lv = localStorage.getItem(k); if (lv !== null) return lv; } catch (e) { }
    return mem[k] || null;
  }
  function sset(k, v) {
    mem[k] = v;
    var ok = true;
    try { localStorage.setItem(k, v); } catch (e) { ok = false; }
    return ok;
  }
  Main.hasSave = function () { return !!sget(SAVE_KEY); };
  Main.save = function () {
    if (!Main.playing || !Z.state || Z.state.gameOver) return false;
    try {
      var raw = Z.Sim.save();
      var ok = sset(SAVE_KEY, raw);
      if (Z.Storage && Z.Storage.set) {
        var p = Z.Storage.set(SAVE_KEY, raw);
        if (p && typeof p.then === 'function') {
          p.then(saveNotice).catch(function () { saveNotice(false); });
        }
      }
      return true;
    } catch (e) {
      console.error('save failed', e);
      return false;
    }
  };
  Main.saveSettings = function () { settings.sound = Z.Audio.enabled(); if (UI.PlayTimer && UI.PlayTimer.hudVisible) settings.timerHud = UI.PlayTimer.hudVisible(); sset(SET_KEY, JSON.stringify(settings)); };
  Main.setTimerHud = function (on) { settings.timerHud = !!on; Main.saveSettings(); };
  function loadSettings() { try { var s = JSON.parse(sget(SET_KEY) || '{}'); if (QUAL[s.quality] || s.quality === 'auto') settings.quality = s.quality; if (s.sound === false) settings.sound = false; if (s.timerHud === false) settings.timerHud = false; else if (s.timerHud === true) settings.timerHud = true; } catch (e) { } Z.Audio.setEnabled(settings.sound); if (settings.timerHud === false && UI.PlayTimer && UI.PlayTimer.setHudVisible) UI.PlayTimer.setHudVisible(false, true); }
  function saveNotice(ok) {
    if (!ok && !saveFailed) { saveFailed = true; UI.toast('Saving failed. Export a backup in Settings before closing.', 'bad'); }
    if (ok) saveFailed = false;
  }
  Main.exportSave = function () {
    var raw = Main.playing ? Z.Sim.save() : sget(SAVE_KEY);
    if (!raw) { UI.toast('No park to export yet.', 'info'); return; }
    var url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'wild-acres-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  };
  Main.importSave = function (raw) {
    var previous = Z.Sim.save(), parsed;
    try {
      parsed = JSON.parse(raw);
      if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !parsed.s || !Array.isArray(parsed.s.animals) || !Array.isArray(parsed.s.guests) || !Array.isArray(parsed.s.staff)) throw new Error('Invalid save');
      if (!Z.Sim.load(raw)) throw new Error('Unsupported save');
    } catch (e) {
      Z.Sim.load(previous); UI.toast('Invalid or unsupported save. Your park was kept.', 'bad'); return Promise.resolve(false);
    }
    Z.state.speed = 1; startCam(); enterGame(); UI.closeModal(); closeSetup();
    var ok = Main.save();
    UI.toast(ok ? 'Park imported and saved.' : 'Park imported, but saving failed. Export a backup.', ok ? 'good' : 'bad');
    return Promise.resolve(!!ok);
  };
  Main.chooseImport = function () {
    if ((Main.playing || Main.hasSave()) && !window.confirm('Import a park and replace the current save? Export a backup first if you want to keep it.')) return;
    var input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = function () {
      var file = input.files[0]; if (!file) return;
      if (file.size > 20 * 1024 * 1024) { UI.toast('Save file is too large (maximum 20 MB).', 'bad'); return; }
      var reader = new FileReader(); reader.onload = function () { Main.importSave(reader.result); };
      reader.onerror = function () { UI.toast('Could not read this file.', 'bad'); }; reader.readAsText(file);
    };
    input.click();
  };

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
    tb.appendChild(h('button.btn.alt', { html: ic('gear') + 'Park setup', on: { click: function () { UI.snd('unlock'); UI.snd('click'); Main.openSetup(); } } }));
    titleEl.appendChild(tb);
    var backups = h('div.tb');
    if (has) backups.appendChild(h('button.btn.sm.alt', { text: 'Export save', on: { click: Main.exportSave } }));
    backups.appendChild(h('button.btn.sm.alt', { text: 'Import save', on: { click: Main.chooseImport } }));
    titleEl.appendChild(backups);
    if (location.protocol === 'file:') titleEl.appendChild(h('div.tag', { text: 'Run the included server or use your hosted site for reliable saving.' }));
    titleEl.appendChild(h('div.ver', { text: 'Wild Acres Zoo' }));
  }
  Main.showTitle = function () {
    UI.titleOpen = true; Main.playing = false; buildTitle(); titleEl.classList.add('on'); document.getElementById('ui').style.display = 'none';
    var c = Z.World.cam; c.dist = 88; c.pitch = 0.5; c.target.x = 62; c.target.z = 54;
  };
  function enterGame() {
    UI.titleOpen = false; titleEl.classList.remove('on'); document.getElementById('ui').style.display = ''; Main.playing = true; saveT = 0;
    if (Z.Storage && Z.Storage.requestPersistence) Z.Storage.requestPersistence();
    UI.reset(); UI.cat = null; UI.markTabs && UI.markTabs(); if (UI.el && UI.el.cards) UI.el.cards.className = 'empty';
    if (UI.PlayTimer && UI.PlayTimer.startSession) UI.PlayTimer.startSession();
    UI.snd('unlock');
  }
  function startCam() {
    var c = Z.World.cam, m = Z.state && Z.state.map, T = Z.TILE || 2;
    var i0 = m ? m.i0 : 0, j0 = m ? m.j0 : 0, i1 = m ? m.i1 : N - 1, j1 = m ? m.j1 : N - 1, w = i1 - i0 + 1, hh = j1 - j0 + 1, big = Math.max(w, hh, 24) / 56;
    if (c.target) { c.target.x = (i0 + w / 2) * T; c.target.z = (j0 + hh * 0.6) * T; }
    c.dist = Math.min(150, (UI.narrow && UI.narrow() ? 76 : 70) * Math.max(0.6, big)); c.yaw = 0.15; c.pitch = 0.9;
  }
  Main.newGame = function (o) {
    o = o || {}; var maps = Z.DATA.maps, args = { seed: o.seed || ((Math.random() * 0x7ffffff) | 0) + 1, difficulty: o.difficulty || 'normal' };
    if (o.map || (maps && maps.length)) args.map = o.map || maps[0].id;
    Z.Sim.newGame(args); Z.state.speed = 1; startCam(); enterGame();
    if (Z.World.snapCamera) Z.World.snapCamera();
    if (UI.Panel) UI.Panel.closeSheet(); UI.closeModal(); closeSetup();
    if (UI.Tutorial) UI.Tutorial.restart();
    Main.save();
  };

  // ---------------------------------------------------------------- new-game setup sheet
  var setupEl = null, setupSel = null;
  var FALLBACK_MAPS = [{ id: 'default', name: 'Starter meadow', size: 'Medium', blurb: 'A friendly plot to learn on.', bounds: { i0: 0, j0: 0, i1: N - 1, j1: N - 1 } }];
  var FALLBACK_DIFFS = [{ id: 'easy', name: 'Relaxed', blurb: 'Generous funds and patient guests.', money: 45000 }, { id: 'normal', name: 'Normal', blurb: 'The intended experience.', money: 30000 }, { id: 'hard', name: 'Challenging', blurb: 'Tight budget, picky guests.', money: 20000 }];
  function closeSetup() { if (setupEl) { setupEl.remove(); setupEl = null; } }
  Main.closeSetup = closeSetup;
  function drawMapThumb(cv, m, seed) {
    var W = cv.width, g = cv.getContext('2d'), b = m.bounds || { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }, px = W / N, p = null, i, j;
    try { if (Z.Sim.previewMap) p = Z.Sim.previewMap(m.id, seed); } catch (e) { p = null; }
    if (p && p.bounds) b = p.bounds;
    g.fillStyle = '#5b6e4e'; g.fillRect(0, 0, W, W);
    if (p && p.terrain) {
      var cols = Z.DATA.terrain.map(function (t) { return t.colour || '#6fae4a'; });
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var inb = i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1, e = p.elev ? (p.elev[i + j * (N + 1)] || 0) : 0;
        g.fillStyle = cols[p.terrain[i + j * N]] || '#6fae4a'; g.fillRect(i * px, j * px, px + 0.6, px + 0.6);
        if (e) { g.fillStyle = e > 0 ? 'rgba(255,255,255,' + Math.min(0.5, e * 0.07) + ')' : 'rgba(10,30,60,' + Math.min(0.5, -e * 0.09) + ')'; g.fillRect(i * px, j * px, px + 0.6, px + 0.6); }
        if (!inb) { g.fillStyle = 'rgba(20,28,16,.62)'; g.fillRect(i * px, j * px, px + 0.6, px + 0.6); }
      }
    } else {
      // schematic from the map's gen hints, seeded so Reroll changes it
      var gen = m.gen || {}, cl = function (id, d) { var t = UI.byId(Z.DATA.terrain, id); return t ? t.colour : d; };
      var sd = (seed || 1) * 7919 + m.id.length * 131, rnd = function () { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
      var bw = (b.i1 - b.i0 + 1) * px, bh = (b.j1 - b.j0 + 1) * px, bx = b.i0 * px, by = b.j0 * px, k, blob = function (col, r) { g.fillStyle = col; g.beginPath(); g.arc(bx + rnd() * bw, by + rnd() * bh, r * (0.7 + rnd() * 0.6), 0, 7); g.fill(); };
      g.fillStyle = cl(gen.base, '#7fb25a'); g.fillRect(bx, by, bw, bh);
      g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
      (gen.paint || []).forEach(function (pt) { for (k = 0; k < 5; k++) blob(cl(pt.t, '#8b6a45'), bw * 0.1); });
      if (gen.hills && gen.hills.amp) for (k = 0; k < 3 + gen.hills.amp; k++) blob('rgba(255,255,255,' + Math.min(0.28, 0.08 + gen.hills.amp * 0.04) + ')', bw * 0.12);
      if (gen.mesas) for (k = 0; k < gen.mesas.n; k++) blob('rgba(120,95,70,.8)', bw * 0.06);
      if (gen.lakes) for (k = 0; k < gen.lakes.n; k++) blob('#4aa3c8', gen.lakes.r ? (gen.lakes.r[0] + gen.lakes.r[1]) / 2 * px * 0.8 : bw * 0.07);
      var line = function (j, w, col) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (var x = 0; x <= 8; x++) { var yy = by + (j - b.j0) * px + Math.sin(x * 1.3 + (seed || 0)) * 2; if (x) g.lineTo(bx + bw * x / 8, yy); else g.moveTo(bx, yy); } g.stroke(); };
      if (gen.ridge) line(gen.ridge.j, 3, '#6d5f52');
      if (gen.canyon) line(gen.canyon.j, Math.max(3, gen.canyon.w * px * 0.8), '#4a3a2c');
      g.restore();
    }
    g.strokeStyle = '#ffe08a'; g.lineWidth = 1.5; g.strokeRect(b.i0 * px + 0.75, b.j0 * px + 0.75, (b.i1 - b.i0 + 1) * px - 1.5, (b.j1 - b.j0 + 1) * px - 1.5);
    g.fillStyle = '#c4553a'; g.fillRect(27 * px, (N - 2) * px, 2 * px + 1, 2 * px);
  }
  Main.openSetup = function () {
    closeSetup();
    var maps = (Z.DATA.maps && Z.DATA.maps.length) ? Z.DATA.maps : FALLBACK_MAPS, diffs = (Z.DATA.difficulties && Z.DATA.difficulties.length) ? Z.DATA.difficulties : FALLBACK_DIFFS;
    var sel = setupSel = setupSel || {}; sel.map = maps.filter(function (m) { return m.id === sel.map; }).length ? sel.map : maps[0].id;
    sel.diff = diffs.filter(function (d) { return d.id === sel.diff; }).length ? sel.diff : (diffs.filter(function (d) { return d.id === 'normal'; })[0] || diffs[0]).id;
    sel.seed = sel.seed || ((Math.random() * 99999) | 0) + 1;
    var root = setupEl = h('div#setup'), box = h('div.sbox'), mapRow = h('div.smaps'), dRow = h('div.sdiffs'), seedTxt = h('span.sseed');
    var thumbs = {};
    function mark() {
      Array.prototype.forEach.call(mapRow.children, function (c) { c.classList.toggle('sel', c.getAttribute('data-id') === sel.map); });
      Array.prototype.forEach.call(dRow.children, function (c) { c.classList.toggle('sel', c.getAttribute('data-id') === sel.diff); });
      seedTxt.textContent = 'Terrain seed ' + sel.seed;
    }
    function draw() { maps.forEach(function (m) { drawMapThumb(thumbs[m.id], m, sel.seed); }); }
    maps.forEach(function (m) {
      var cv = h('canvas', { width: 112, height: 112 }); thumbs[m.id] = cv;
      mapRow.appendChild(h('button.smap', { 'data-id': m.id, on: { click: function () { UI.snd('click'); sel.map = m.id; mark(); } } }, h('div.sth', cv),
        h('div.snm', h('b', { text: m.name }), h('span.badge', { text: m.size || '' })), h('div.sbl', { text: m.blurb || '' })));
    });
    diffs.forEach(function (d) {
      dRow.appendChild(h('button.sdiff', { 'data-id': d.id, on: { click: function () { UI.snd('click'); sel.diff = d.id; mark(); } } }, h('b', { text: d.name }), h('span.sm', { text: UI.fmt(d.money || 0) }), h('small', { text: d.blurb || '' })));
    });
    box.appendChild(h('h2', { text: 'Choose your land' })); box.appendChild(mapRow);
    box.appendChild(h('div.srow', seedTxt, h('button.btn.sm.alt', { html: ic('rot') + 'Reroll terrain', on: { click: function () { UI.snd('click'); sel.seed = ((Math.random() * 99999) | 0) + 1; mark(); draw(); } } })));
    box.appendChild(h('h2', { text: 'Starting funds' })); box.appendChild(dRow);
    box.appendChild(h('div.sact', h('button.btn.alt', { text: 'Back', on: { click: function () { UI.snd('click'); closeSetup(); } } }),
      h('button.btn.gold', { html: ic('play') + 'Start park', on: { click: function () { UI.snd('click'); var s0 = { map: sel.map, difficulty: sel.diff, seed: sel.seed }; sel.seed = 0; Main.newGame(s0); } } })));
    root.appendChild(box); document.body.appendChild(root); mark(); draw();
  };
  Main.continueGame = function () {
    var s = sget(SAVE_KEY), options = (Z.Storage && Z.Storage.getCandidates) ? Z.Storage.getCandidates(SAVE_KEY) : (s ? [s] : []), previous = Z.Sim.save(), loaded = -1;
    if (!options || !options.length) options = s ? [s] : [];
    for (var i = 0; i < options.length; i++) {
      try { if (options[i] && Z.Sim.load(options[i])) { loaded = i; break; } } catch (e) {}
      try { Z.Sim.load(previous); } catch (e) {}
    }
    if (loaded < 0) { UI.toast('This save could not be loaded. Export it before starting a new park, or import a backup.', 'bad'); return; }
    Z.state.speed = 1; startCam(); enterGame(); UI.closeModal();
    UI.toast((loaded > 0 ? 'Recovered an older saved zoo. ' : '') + 'Welcome back! Day ' + Z.state.day + '.', 'good');
  };
  Main.demo = function () { buildDemo(); Z.bus.emit('reset'); UI.reset(); };
  Main.toTitle = function () {
    Main.save(); UI.closeModal(); if (UI.Tutorial) UI.Tutorial.active() && UI.el.tut.classList.remove('on');
    if (UI.Panel) UI.Panel.hide(true); if (UI.Tools) UI.Tools.cancel(true);
    if (UI.PlayTimer && UI.PlayTimer.endSession) UI.PlayTimer.endSession();
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
        if (UI.PlayTimer && UI.PlayTimer.tick) UI.PlayTimer.tick(Math.min(raw, 2));
        saveT += raw; if (saveT >= 10) { saveT = 0; Main.save(); }
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
      Main.setQuality(settings.quality);
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
  function start() {
    if (Z.Storage && Z.Storage.init) {
      Z.Storage.init().then(boot).catch(function (e) { console.error('Storage startup failed', e); boot(); });
    } else {
      boot();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
