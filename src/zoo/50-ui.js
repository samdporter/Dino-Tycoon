// ===== 50-ui.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - UI core: helpers, icons, HUD, build bar, toasts, banners, confetti, side controls. */
(function () {
  'use strict';
  var D = Z.DATA, UI = Z.UI = { held: {}, tool: null, sel: null, cat: null, prefs: {} };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  // ------------------------------------------------------------------ helpers
  function h(sel, a) {
    var m = /^([a-z0-9]*)((?:[.#][\w-]+)*)/i.exec(sel), el = document.createElement(m[1] || 'div'), k, i;
    (m[2].match(/[.#][\w-]+/g) || []).forEach(function (t) { if (t[0] === '#') el.id = t.slice(1); else el.classList.add(t.slice(1)); });
    var kids = Array.prototype.slice.call(arguments, 1);
    if (a && a.constructor === Object) {
      kids.shift();
      for (k in a) {
        if (k === 'html') el.innerHTML = a[k]; else if (k === 'text') el.textContent = a[k];
        else if (k === 'on') { for (var ev in a.on) el.addEventListener(ev, a.on[ev]); }
        else if (k === 'style') el.style.cssText = a[k];
        else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]);
      }
    }
    (function add(list) {
      for (i = 0; i < list.length; i++) {
        var c = list[i]; if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c); else el.appendChild(c.nodeType ? c : document.createTextNode(c));
      }
    })(kids);
    return el;
  }
  UI.h = h; UI.$ = $;
  function fmt(n) { n = Math.round(n || 0); return (n < 0 ? '-' : '') + '£' + Math.abs(n).toLocaleString('en-GB'); }
  function fmt2(n) { return '£' + (Math.round(n * 100) / 100).toFixed(2); }
  UI.fmt = fmt; UI.fmt2 = fmt2;
  UI.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  UI.pct = function (v) { return Math.round(UI.clamp(v, 0, 1) * 100); };
  UI.byId = function (arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; };
  UI.sp = function (id) { return UI.byId(D.animals, id); };
  UI.narrow = function () { return window.innerWidth < 820; };
  UI.touch = function () { return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); };
  UI.snd = function (n, a, b) { try { if (Z.Audio && Z.Audio[n]) Z.Audio[n](a, b); } catch (e) { } };

  // ------------------------------------------------------------------ icons
  var P = {
    menu: 'M4 7h16M4 12h16M4 17h16', close: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l5 5L19 7',
    pause: 'M8 5v14M16 5v14',
    play: ['f', 'M7 4.5l12 7.5-12 7.5z'], play2: ['f', 'M3 5l8.5 7L3 19zM12 5l8.5 7-8.5 7z'], play3: ['f', 'M2 6.5l6.3 5.5L2 17.5zM8.5 6.5l6.3 5.5-6.3 5.5zM15 6.5l6.3 5.5L15 17.5z'],
    star: ['f', 'M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z'],
    sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8',
    moon: 'M20 14.5A8.2 8.2 0 119.5 4a6.6 6.6 0 0010.5 10.5z',
    guests: 'M9 11a3.4 3.4 0 100-6.800 3.4 3.4 0 000 6.800zM2.8 20c0-3.600 2.900-6 6.200-6s6.200 2.400 6.200 6M16.500 11a2.700 2.700 0 100-5.400M17.500 14.200c2.200.5 3.700 2.500 3.700 5.300',
    rotl: 'M3.500 12a8.500 8.500 0 102.800-6.300M3 3.800v4.700h4.700', rotr: 'M20.500 12a8.500 8.500 0 11-2.800-6.300M21 3.800v4.700h-4.700',
    zin: 'M10.500 18a7.500 7.500 0 100-15 7.500 7.500 0 000 15zM16 16l5 5M7.500 10.500h6M10.500 7.500v6',
    zout: 'M10.500 18a7.500 7.500 0 100-15 7.500 7.500 0 000 15zM16 16l5 5M7.500 10.500h6',
    hand: 'M8 13.500V5.800a1.500 1.500 0 013 0V11M11 10.500V4.300a1.500 1.500 0 013 0v6.200M14 10.500V5.800a1.500 1.500 0 013 0v8.200c0 4.200-2.600 7-6 7-3 0-4.500-1.600-6-4.200l-2-3.400a1.500 1.500 0 012.500-1.600L8 13.500',
    eye: 'M2 12s3.800-7 10-7 10 7 10 7-3.800 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
    eyeoff: 'M3 3l18 18M10.500 6.200A9.800 9.800 0 0112 6c6.200 0 10 6 10 6a17 17 0 01-3.200 3.800M6.500 7.500A16.500 16.500 0 002 12s3.800 7 10 7a9.500 9.500 0 004-.9M9.900 9.900a3 3 0 004.200 4.200',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    paw: 'M7 10a1.900 2.400 0 100-4.800 1.900 2.400 0 000 4.800zM17 10a1.900 2.400 0 100-4.800 1.900 2.400 0 000 4.800zM3.500 14.500a1.800 2.200 0 100-.01zM20.500 14.500a1.800 2.200 0 100-.01zM12 12c-3.200 0-5.500 3.400-5.500 5.800C6.500 20 8.800 20.200 12 20.200s5.500-.2 5.500-2.400C17.500 15.400 15.200 12 12 12z',
    tree: 'M12 22v-6M12 16c-4.200 0-6.500-3.200-5.200-6.200C4.800 8 5.800 3.800 9.200 4c1.200-2 5.400-2 6.600 0 3.400-.2 4.400 4 2.400 5.800 1.300 3-1 6.200-5.200 6.200z',
    fence: 'M5 21V6M12 21V6M19 21V6M3 10h18M3 16h18',
    path: 'M8 21l1.500-18M16 21l-1.500-18M12 20v-3M12 13v-3M12 6V4',
    mount: 'M2 20l7-12 4 6 3-4 6 10z',
    house: 'M3 11.500L12 4l9 7.500M5.500 10v10h13V10M10 20v-6h4v6',
    person: 'M12 11a3.600 3.600 0 100-7.200 3.600 3.600 0 000 7.200zM5 21c0-4.600 3-7.200 7-7.200s7 2.600 7 7.200',
    lamp: 'M12 3a5 5 0 013 9v3H9v-3a5 5 0 013-9zM10 19h4M11 22h2',
    rock: 'M3 19.500l3.500-8.500 5-4.500 6.500 3.500 3 9.500z',
    tent: 'M2.500 20L12 4l9.500 16zM12 20v-7',
    cart: 'M3 4h3l3 11h9.500l2.500-8H7M10 20.500a.8.800 0 100-.01M17 20.500a.8.800 0 100-.01',
    chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6',
    list: 'M8 6h13M8 12h13M8 18h13M3.500 6h.01M3.500 12h.01M3.500 18h.01',
    gear: 'M12 8.500a3.500 3.500 0 100 7 3.500 3.500 0 000-7zM12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M19.100 4.900L17 7M7 17l-2.100 2.100',
    flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
    bell: 'M6 17h12l-2-3v-4a4 4 0 00-8 0v4zM10 20a2 2 0 004 0',
    tilt: 'M3 9l9-5 9 5-9 5zM3 14l9 5 9-5',
    rot: 'M20 12a8 8 0 11-2.600-5.900M20 3.500v5h-5',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
    heart: 'M12 20s-8-5-8-11a4.500 4.500 0 018-2.600A4.500 4.500 0 0120 9c0 6-8 11-8 11z',
    sell: 'M12 3v18M16.500 7.500c-.8-1.400-2.400-2-4.500-2-2.600 0-4 1.200-4 3 0 4.400 8.500 2 8.500 6.500 0 1.800-1.800 3-4.500 3-2.200 0-3.800-.8-4.600-2.200',
    pencil: 'M4 20l1-4.500L16.500 4a2 2 0 012.900 0l.6.600a2 2 0 010 2.900L8.500 19zM14 6.500l3.500 3.500',
    move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
    plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
    rect: 'M4 6h16v12H4z', line: 'M4 18L20 6',
    coin: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9 12h6M9.500 9.500h5M9.500 14.500h5',
    target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.500v1',
    sound: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4 4 0 010 6M18 6.500a8 8 0 010 11',
    mute: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9.500l5 5M21 9.500l-5 5',
    save: 'M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    home: 'M3 11.500L12 4l9 7.500M5.500 10v10h13V10',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.500v.01',
    up: 'M6 14l6-6 6 6', down: 'M6 10l6 6 6-6',
    leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8'
  };
  function ic(n, cls) {
    var d = P[n]; if (!d) return '';
    var fill = Array.isArray(d); if (fill) d = d[1];
    return '<svg class="ic' + (fill ? ' fill' : '') + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  UI.ic = ic;

  // ------------------------------------------------------------------ DOM skeleton
  var root, el = {};
  function buildDOM() {
    root = $('#ui'); root.innerHTML = '';
    el.cash = h('button#cash.pill.hud-cell.num', { 'aria-label': 'Finances', on: { click: function () { UI.openModal('fin'); UI.snd('click'); } } });
    el.cashTxt = h('span'); el.cash.appendChild(el.cashTxt);
    el.guests = h('div#gstat.pill.hud-cell', { html: ic('guests') + '<span class="num">0</span>', title: 'Guests in the zoo' });
    el.guestsN = $('span', el.guests);
    el.stars = h('button#stars.pill.hud-cell', { 'aria-label': 'Zoo rating', on: { click: function () { UI.openModal('ov'); UI.snd('click'); } } });
    el.starEls = []; for (var i = 0; i < 5; i++) { var s = h('span.star', { text: '★' }); el.starEls.push(s); el.stars.appendChild(s); }
    el.menu = h('button#menuBtn.pill.hud-cell', { html: ic('menu') + '<i id="menudot" style="display:none;position:absolute;width:10px;height:10px;border-radius:50%;background:#c4553a;margin:-26px -26px 0 0;"></i>', 'aria-label': 'Menu', on: { click: function () { UI.openModal('ov'); UI.snd('click'); } } });
    el.menuDot = $('#menudot', el.menu);
    el.clock = h('div#clock.pill.hud-cell', { html: '<span class="sunmoon">' + ic('sun') + '</span><span>Day <b class="num">1</b></span><b class="num tm">08:00</b><span class="open">Open</span>' });
    el.sunmoon = $('.sunmoon', el.clock); el.dayN = $('b', el.clock); el.tm = $('.tm', el.clock); el.open = $('.open', el.clock);
    el.speed = h('div#speed.pill');
    [[0, 'pause', 'Pause'], [1, 'play', 'Normal speed'], [2, 'play2', 'Fast'], [4, 'play3', 'Fastest']].forEach(function (s) {
      var b = h('button', { html: ic(s[1]), 'aria-label': s[2], 'data-s': s[0], on: { click: function () { UI.setSpeed(s[0]); } } }); el.speed.appendChild(b);
    });
    el.hide = h('button.hbtn.pill', { html: ic('eyeoff'), 'aria-label': 'Hide interface', on: { click: function () { UI.hideUI(true); } } });
    var r1 = h('div.hud-row.r1', el.cash, el.guests, el.stars, el.menu), r2 = h('div.hud-row.r2', el.clock, el.speed, el.hide);
    el.hud = h('div#hud', r1, r2);
    el.goal = h('button#goalchip.pill', { on: { click: function () { UI.openModal('goals'); UI.snd('click'); } } });
    el.pause = h('div#pausebadge', { text: 'PAUSED' });
    el.side = h('div#side');
    function cb(icon, label, cls) { return h('button.cbtn.pill' + (cls ? '.' + cls : ''), { html: ic(icon), 'aria-label': label }); }
    el.bRotL = cb('rotl', 'Rotate view left'); el.bRotR = cb('rotr', 'Rotate view right');
    el.bZin = cb('zin', 'Zoom in'); el.bZout = cb('zout', 'Zoom out'); el.bTilt = cb('tilt', 'Change camera angle');
    el.bRotObj = cb('rot', 'Rotate item'); el.bRotObj.style.display = 'none';
    el.bMove = cb('hand', 'Move the camera instead of using the tool'); el.bMove.style.display = 'none';
    [el.bMove, el.bRotObj, el.bRotL, el.bRotR, el.bZin, el.bZout, el.bTilt].forEach(function (b) { el.side.appendChild(b); });
    UI.hold(el.bRotL, function (dt) { Z.World.rotate(-1.7 * dt, 0); });
    UI.hold(el.bRotR, function (dt) { Z.World.rotate(1.7 * dt, 0); });
    UI.hold(el.bZin, function (dt) { Z.World.zoom(Math.exp(-1.6 * dt)); });
    UI.hold(el.bZout, function (dt) { Z.World.zoom(Math.exp(1.6 * dt)); });
    el.bTilt.addEventListener('click', function () {
      var c = Z.World.cam, p = c.pitch; c.pitch = p > 1.15 ? 0.88 : p > 0.7 ? 0.5 : 1.3; UI.snd('click');
    });
    el.bMove.addEventListener('click', function () { UI.Tools && UI.Tools.toggleMove(); UI.snd('click'); });
    el.bRotObj.addEventListener('click', function () { UI.Tools && UI.Tools.rotate(); UI.snd('click'); });
    el.toasts = h('div#toasts'); el.banner = h('div#banner');
    el.follow = h('div#follow.pill', h('div.ft', h('b'), h('span')),
      h('button.btn.sm.alt', { text: 'Info', on: { click: function () { UI.followInfo(); } } }),
      h('button.btn.sm', { html: ic('close') + 'Exit follow', on: { click: function () { UI.exitFollow(); } } }));
    el.fName = $('b', el.follow); el.fTxt = $('span', el.follow);
    el.build = h('div#build');
    el.strip = h('div#toolstrip.pill');
    el.dock = h('div#dock'); el.tabs = h('div#tabs'); el.cards = h('div#cards.empty');
    el.dock.appendChild(el.tabs); el.dock.appendChild(el.cards);
    el.build.appendChild(el.strip); el.build.appendChild(el.dock);
    el.panel = h('div#panel'); el.modal = h('div#modal'); el.cost = h('div#costtip'); el.tut = h('div#tut.pill');
    el.unhide = h('button#unhide.pill', { html: ic('eye'), 'aria-label': 'Show interface', on: { click: function () { UI.hideUI(false); } } });
    el.stack = h('div#stack', el.pause, el.goal, el.follow, el.tut, el.toasts, el.banner);
    [el.hud, el.stack, el.side, el.build, el.panel, el.modal, el.unhide].forEach(function (e) { root.appendChild(e); });
    document.body.appendChild(el.cost);
    el.conf = h('canvas#confetti'); document.body.appendChild(el.conf);
    UI.el = el;
  }

  // press-and-hold buttons
  UI.hold = function (btn, fn) {
    var id = 'h' + Math.random();
    function down(e) { e.preventDefault(); UI.held[id] = fn; btn.setPointerCapture && e.pointerId != null && btn.setPointerCapture(e.pointerId); UI.snd('click'); }
    function up() { delete UI.held[id]; }
    btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  };

  UI.hideUI = function (on) { root.classList.toggle('ui-hidden', !!on); if (on) UI.toast('Tap the eye to bring the controls back', 'info'); };
  UI.setSpeed = function (n) { Z.Sim.setSpeed(n); UI.snd('click'); lastHud.speed = -1; };

  // ------------------------------------------------------------------ HUD
  var lastHud = {}, cashShown = null, cashAnim = 0, hudT = 0, lastStar = null, lastMsgCount = 0;
  function setTxt(node, key, v) { if (lastHud[key] !== v) { lastHud[key] = v; node.textContent = v; } }
  function updateCash(dt) {
    var S = Z.state, target = S.money;
    if (cashShown === null) cashShown = target;
    if (cashShown !== target) {
      var d = target - cashShown;
      cashShown += Math.abs(d) < 1 ? d : d * Math.min(1, dt * 7); if (Math.abs(target - cashShown) < 1) cashShown = target;
      setTxt(el.cashTxt, 'cash', fmt(cashShown));
    } else setTxt(el.cashTxt, 'cash', fmt(target));
    el.cash.classList.toggle('neg', target < 0);
  }
  var cashFlashT = 0;
  function flashCash(delta) {
    if (!delta || Math.abs(delta) < 1) return;
    el.cash.classList.remove('up', 'down'); el.cash.classList.add(delta > 0 ? 'up' : 'down');
    clearTimeout(cashFlashT); cashFlashT = setTimeout(function () { el.cash.classList.remove('up', 'down'); }, 600);
  }
  var cashAcc = 0, cashAccT = 0;
  function onMoney(m) { if (!m) return; cashAcc += m.delta; if (!cashAccT) cashAccT = setTimeout(function () { flashCash(cashAcc); cashAcc = 0; cashAccT = 0; }, 120); }

  function updateHud(force) {
    var S = Z.state; if (!S) return;
    setTxt(el.guestsN, 'g', String(S.guests.length));
    var r = UI.clamp(S.rating, 0, 5), key = Math.round(r * 20);
    if (lastHud.rate !== key) { lastHud.rate = key; for (var i = 0; i < 5; i++) el.starEls[i].style.setProperty('--f', Math.round(UI.clamp(r - i, 0, 1) * 100) + '%'); el.stars.title = 'Zoo rating ' + r.toFixed(1); }
    var t = S.time * 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    setTxt(el.tm, 'tm', (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm);
    setTxt(el.dayN, 'day', String(S.day));
    var night = S.time < 0.25 || S.time >= 0.78;
    if (lastHud.night !== night) { lastHud.night = night; el.sunmoon.innerHTML = ic(night ? 'moon' : 'sun'); el.sunmoon.classList.toggle('night', night); }
    var open = Z.Sim.isOpenNow();
    if (lastHud.open !== open) { lastHud.open = open; el.open.textContent = open ? 'Open' : 'Closed'; el.open.classList.toggle('closed', !open); }
    if (lastHud.speed !== S.speed) {
      lastHud.speed = S.speed;
      Array.prototype.forEach.call(el.speed.children, function (b) { b.classList.toggle('on', +b.getAttribute('data-s') === S.speed); });
      el.pause.classList.toggle('on', S.speed === 0 && !S.gameOver);
    }
    // star-up celebration
    var us = S.unlocked ? S.unlocked.star : 0;
    if (lastStar === null) lastStar = us;
    if (us > lastStar && us >= 2) {
      lastStar = us;
      var names = [];
      D.animals.forEach(function (a) { if (a.star === us) names.push(a.name); }); D.buildings.forEach(function (a) { if (a.star === us) names.push(a.name); });
      UI.banner({ title: us + '-star zoo!', text: names.length ? 'Unlocked: ' + names.join(', ') : 'Your zoo is growing nicely.', kind: 'good', stars: us });
      UI.confetti(); UI.snd('fanfare');
    } else lastStar = us;
    // goal chip
    var g = null, k; for (k = 0; k < D.goals.length; k++) if (!S.goals[D.goals[k].id]) { g = D.goals[k]; break; }
    var gp = g ? UI.goalProgress(g) : null, gkey = g ? g.id + ':' + Math.round(gp.frac * 50) : 'none';
    if (lastHud.goal !== gkey) {
      lastHud.goal = gkey;
      if (g) el.goal.innerHTML = '<div class="gt">' + ic('target') + ' ' + g.text + '</div><div class="mini"><i style="width:' + Math.round(gp.frac * 100) + '%"></i></div>';
    }
    var tutOn = UI.Tutorial && UI.Tutorial.active();
    el.goal.style.display = (g && !(tutOn && UI.narrow())) ? '' : 'none';
    // unread messages dot
    var mc = S.messages.length ? S.messages[S.messages.length - 1].day * 1000 + S.messages.length : 0;
    el.menuDot.style.display = (UI.unread > 0) ? 'block' : 'none';
    // follow pill
    updateFollow();
    // build bar state
    var hideBuild = UI.narrow() && el.panel.classList.contains('on');
    el.build.classList.toggle('hide', hideBuild);
    el.side.classList.toggle('nopanel', !el.panel.classList.contains('on'));
  }
  UI.unread = 0;

  UI.goalProgress = function (g) {
    var S = Z.state, v = 0, cur = '';
    switch (g.type) {
      case 'guests': v = S.stats.guestsTotal; break;
      case 'animals': v = S.animals.length; break;
      case 'rating': v = S.rating; break;
      case 'money': v = S.money; break;
      case 'species': { var s = {}; S.animals.forEach(function (a) { s[a.species] = 1; }); v = Object.keys(s).length; break; }
      case 'babies': v = S.stats.babiesBorn; break;
      case 'happiness': v = S.guests.length >= 10 ? (S.guestHappiness || 0) : 0; break;
    }
    return { value: v, frac: UI.clamp(v / g.target, 0, 1), text: g.type === 'money' ? fmt(v) + ' / ' + fmt(g.target) : g.type === 'rating' ? v.toFixed(1) + ' / ' + g.target : Math.floor(v) + ' / ' + g.target };
  };

  // ------------------------------------------------------------------ follow pill
  function updateFollow() {
    var f = Z.World.isFollowing && Z.World.isFollowing();
    if (!f) { if (UI.following) { UI.following = null; el.follow.classList.remove('on'); } return; }
    UI.following = f; el.follow.classList.add('on');
    var S = Z.state, e = null, name = '', txt = '';
    if (f.kind === 'animal') {
      e = S.animals.filter(function (a) { return a.id === f.id; })[0];
      if (e) { var sp = UI.sp(e.species); name = e.name + ' the ' + sp.name.toLowerCase(); var rep = Z.Sim.animalReport(e.id); txt = UI.stateText(e.state) + (rep && rep.issues.length ? ' - ' + rep.issues[0] : ''); }
    } else if (f.kind === 'guest') {
      e = S.guests.filter(function (a) { return a.id === f.id; })[0];
      if (e) { name = e.name; txt = e.thought ? '“' + e.thought + '”' : UI.stateText(e.state); }
    } else if (f.kind === 'staff') {
      e = S.staff.filter(function (a) { return a.id === f.id; })[0];
      if (e) { name = e.name + ' the ' + e.type; txt = e.task || ''; }
    }
    if (!e) { Z.World.follow(null); return; }
    setTxt(el.fName, 'fn', name); setTxt(el.fTxt, 'ft', txt);
  }
  UI.stateText = function (s) {
    return ({ idle: 'Relaxing', walk: 'Wandering about', run: 'Running', eat: 'Eating', drink: 'Drinking', sleep: 'Sleeping', play: 'Playing', swim: 'Swimming', sick: 'Feeling poorly', escaped: 'Escaped!', watch: 'Watching the animals', queue: 'Queueing', use: 'Using a facility', sit: 'Resting on a bench', flee: 'Running away!', leave: 'Heading home', work: 'Working' })[s] || s;
  };
  UI.exitFollow = function () { Z.World.follow(null); el.follow.classList.remove('on'); UI.following = null; UI.snd('click'); };
  UI.followInfo = function () { Z.World.follow(null); el.follow.classList.remove('on'); UI.following = null; if (UI.sel) UI.Panel.open(UI.sel.kind, UI.sel.id); };
  UI.startFollow = function (kind, id) {
    Z.World.follow(kind, id); if (UI.Panel) UI.Panel.hide(true); UI.snd('click');
    if (kind === 'animal') UI.callFor(id);
  };
  UI.callFor = function (id) { var a = Z.state.animals.filter(function (x) { return x.id === id; })[0]; if (a) UI.snd('call', a.species); };

  // ------------------------------------------------------------------ toasts, ticker, banners
  var recentToast = {};
  UI.toast = function (text, kind) {
    var now = Date.now(); if (recentToast[text] && now - recentToast[text] < 2500) return; recentToast[text] = now;
    var t = h('div.toast' + (kind ? '.' + kind : ''), { text: text });
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 3) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 3600 + Math.min(2500, text.length * 25));
    if (kind === 'bad') UI.snd('bad'); else if (kind === 'good') UI.snd('good');
  };
  UI.banner = function (o) {
    var b = h('div.bn' + (o.kind ? '.' + o.kind : '') + (o.jump ? '.compact' : ''), h('div.bt', h('h3', { text: o.title }), o.text ? h('p', { text: o.text }) : null));
    if (o.stars) { var st = h('div', { style: 'font-size:26px;color:#f0a410;letter-spacing:3px;margin-top:2px', text: '★'.repeat(o.stars) }); b.insertBefore(st, b.firstChild); }
    if (o.jump) {
      b.appendChild(h('div.row', h('button.btn.sm.gold', { html: ic('target') + ' Go', 'aria-label': 'Jump to', on: { click: function (e) { e.stopPropagation(); o.jump(); close(); } } }), h('button.btn.sm.alt', { html: ic('close'), 'aria-label': 'Dismiss', on: { click: function (e) { e.stopPropagation(); close(); } } })));
    }
    function close() { b.classList.add('out'); setTimeout(function () { b.remove(); }, 450); }
    b.addEventListener('click', close);
    el.banner.appendChild(b);
    while (el.banner.children.length > 2) el.banner.removeChild(el.banner.firstChild);
    setTimeout(close, o.ms || (o.jump ? 9000 : 6500));
  };

  // confetti
  var parts = [], confOn = false;
  UI.confetti = function (n) {
    var W = window.innerWidth, cols = ['#f0b332', '#c4553a', '#3f8650', '#3f8fb5', '#f8f0da', '#e56b9a'];
    n = n || (UI.narrow() ? 90 : 160);
    for (var i = 0; i < n; i++) parts.push({ x: W * (0.2 + Math.random() * 0.6), y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 380, vy: 120 + Math.random() * 280, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 6 + Math.random() * 7, c: cols[i % cols.length], life: 2.6 + Math.random() * 1.2 });
    confOn = true;
  };
  function stepConfetti(dt) {
    var cv = el.conf; if (!confOn) return;
    var W = window.innerWidth, H = window.innerHeight, dpr = 1;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    var c = cv.getContext('2d'); c.clearRect(0, 0, W, H);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.life -= dt; p.vy += 520 * dt; p.vx *= (1 - dt * 0.6); p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.life <= 0 || p.y > H + 20) { parts.splice(i, 1); continue; }
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.min(1, p.life); c.fillStyle = p.c; c.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); c.restore();
    }
    if (!parts.length) { confOn = false; c.clearRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------------ build bar
  var SW = {};
  function terrainSwatch(def) {
    var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
    g.fillStyle = def.colour; g.fillRect(0, 0, 64, 64);
    var seed = def.id.length * 7 + def.cost;
    for (var i = 0; i < 60; i++) { seed = (seed * 9301 + 49297) % 233280; var x = seed / 233280 * 64; seed = (seed * 9301 + 49297) % 233280; var y = seed / 233280 * 64; g.fillStyle = (i & 1) ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.12)'; g.fillRect(x, y, 3, 3); }
    if (def.id === 'water') { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; for (i = 0; i < 3; i++) { g.beginPath(); g.moveTo(6, 18 + i * 18); g.quadraticCurveTo(20, 10 + i * 18, 32, 18 + i * 18); g.quadraticCurveTo(44, 26 + i * 18, 58, 18 + i * 18); g.stroke(); } }
    return c;
  }
  function pathSwatch(def) {
    var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
    g.fillStyle = '#7fae5a'; g.fillRect(0, 0, 64, 64); g.fillStyle = def.colour; g.fillRect(12, 0, 40, 64);
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1.5;
    if (def.id === 'cobble') { for (var j = 0; j < 8; j++) for (var i = 0; i < 4; i++) { g.beginPath(); g.arc(17 + i * 10 + (j & 1) * 5, 4 + j * 8, 3.6, 0, 7); g.stroke(); } }
    else if (def.id === 'paved') { for (j = 1; j < 4; j++) { g.beginPath(); g.moveTo(12, j * 16); g.lineTo(52, j * 16); g.stroke(); } g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke(); }
    else { g.fillStyle = 'rgba(0,0,0,.18)'; for (i = 0; i < 18; i++) g.fillRect(14 + (i * 37 % 36), (i * 23) % 62, 3, 2); }
    return c;
  }
  function fenceSwatch(def) {
    var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
    g.fillStyle = '#9ccc72'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(4, 52, 56, 5);
    var s = def.style, i;
    if (s === 'wood' || s === 'rail') { g.fillStyle = s === 'wood' ? '#a0723f' : '#c79a62'; var ph = s === 'wood' ? 26 : 32; for (i = 0; i < 3; i++) g.fillRect(8 + i * 22, 52 - ph, 6, ph); g.fillRect(6, 52 - ph + 4, 52, 5); if (s === 'rail') g.fillRect(6, 52 - ph + 16, 52, 5); else g.fillRect(6, 52 - ph + 14, 52, 5); }
    else if (s === 'chain') { g.fillStyle = def.strength > 3 ? '#4d545a' : '#8d979f'; g.fillRect(6, 14, 4, 40); g.fillRect(54, 14, 4, 40); g.fillRect(6, 14, 52, 3); g.strokeStyle = def.strength > 3 ? '#667078' : '#b8c1c8'; g.lineWidth = 1.5; for (i = -40; i < 70; i += 8) { g.beginPath(); g.moveTo(8 + i, 17); g.lineTo(8 + i + 36, 53); g.moveTo(8 + i + 36, 17); g.lineTo(8 + i, 53); g.stroke(); } g.save(); g.globalCompositeOperation = 'destination-over'; g.restore(); }
    else if (s === 'glass') { g.fillStyle = 'rgba(160,215,235,.75)'; g.fillRect(8, 16, 48, 38); g.strokeStyle = '#6a8ea0'; g.lineWidth = 2; g.strokeRect(8, 16, 48, 38); g.strokeStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.moveTo(16, 46); g.lineTo(30, 22); g.stroke(); }
    else if (s === 'concrete') { g.fillStyle = '#a8a39a'; g.fillRect(4, 14, 56, 40); g.strokeStyle = '#7d786f'; g.lineWidth = 1.5; g.strokeRect(4, 14, 56, 40); g.beginPath(); g.moveTo(32, 14); g.lineTo(32, 54); g.moveTo(4, 34); g.lineTo(60, 34); g.stroke(); }
    else if (s === 'hedge') { g.fillStyle = '#2f7a3a'; for (i = 0; i < 5; i++) { g.beginPath(); g.arc(12 + i * 10, 38 - (i % 2) * 3, 12, 0, 7); g.fill(); } g.fillStyle = '#3f9a4a'; for (i = 0; i < 4; i++) { g.beginPath(); g.arc(17 + i * 10, 32, 7, 0, 7); g.fill(); } }
    return c;
  }
  UI.swatch = function (kind, def) { return kind === 'terrain' ? terrainSwatch(def) : kind === 'path' ? pathSwatch(def) : fenceSwatch(def); };

  var thumbQ = [], thumbBusy = false;
  UI.thumbData = function (kind, id, size) {
    try { return Z.Models && Z.Models.thumbnail ? Z.Models.thumbnail(kind, id, size || 96) : null; } catch (e) { return null; }
  };
  function lazyThumb(holder, kind, id, fallback, size, prio) {
    var cached = Z.Models && Z.Models.thumbnail && thumbCacheGet(kind, id, size);
    if (cached) { holder.innerHTML = ''; holder.appendChild(h('img', { src: cached, alt: '', draggable: 'false' })); return; }
    holder.textContent = fallback || '';
    var job = { holder: holder, kind: kind, id: id, size: size || 96, fb: fallback }; if (prio) thumbQ.unshift(job); else thumbQ.push(job);
    if (!thumbBusy) { thumbBusy = true; setTimeout(pumpThumbs, 10); }
  }
  var tcache = {};
  function thumbCacheGet(kind, id, size) { return tcache[kind + id + (size || 96)] || null; }
  function pumpThumbs() {
    var t = thumbQ.shift(); if (!t) { thumbBusy = false; return; }
    if (document.body.contains(t.holder)) {
      var url = UI.thumbData(t.kind, t.id, t.size);
      if (url) { tcache[t.kind + t.id + t.size] = url; t.holder.innerHTML = ''; t.holder.appendChild(h('img', { src: url, alt: '', draggable: 'false' })); }
    }
    setTimeout(pumpThumbs, 12);
  }
  UI.lazyThumb = lazyThumb;

  var CATS;
  function defCats() {
    function sc(ids, kind) { return function () { return ids.map(function (id) { var d = UI.byId(D.scenery, id); return { kind: 'scenery', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: 0 }; }); }; }
    function bd(ids) { return function () { return ids.map(function (id) { var d = UI.byId(D.buildings, id); return { kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star }; }); }; }
    CATS = [
      { id: 'paths', name: 'Paths', icon: 'path', items: function () { return D.paths.map(function (p) { return { kind: 'path', id: p.id, name: p.name, cost: p.cost, unit: '/tile', def: p, star: 0 }; }); }, hint: 'Drag to lay a straight path. Guests only walk on paths.' },
      { id: 'terrain', name: 'Terrain', icon: 'mount', items: function () { return D.terrain.map(function (p) { return { kind: 'terrain', id: p.id, name: p.name, cost: p.cost, unit: '/tile', def: p, star: 0 }; }); } },
      { id: 'fences', name: 'Fences', icon: 'fence', items: function () { return D.fences.map(function (p) { return { kind: 'fence', id: p.id, name: p.name, cost: p.cost, unit: '/panel', def: p, star: 0, sub: 'Str ' + p.strength }; }); } },
      { id: 'animals', name: 'Animals', icon: 'paw', items: function () { return D.animals.slice().sort(function (a, b) { return a.star - b.star || a.cost - b.cost; }).map(function (p) { return { kind: 'animal', id: p.id, name: p.name, cost: p.cost, def: p, star: p.star, emoji: p.emoji }; }); } },
      { id: 'plants', name: 'Plants & rocks', icon: 'tree', items: sc(['oak', 'pine', 'acacia', 'palm', 'bamboo', 'baobab', 'cactus', 'snow_pine', 'jungle_tree', 'bush', 'fern', 'tall_grass', 'boulder', 'rock_pile', 'ice_floe']) },
      { id: 'encl', name: 'Enclosure', icon: 'tent', items: sc(['wooden_shelter', 'cave_shelter', 'heat_rock', 'log', 'climbing_frame', 'tyre_swing', 'ball']) },
      { id: 'fac', name: 'Facilities', icon: 'cart', items: function () { return bd(['burger_stand', 'pizza_hut', 'ice_cream', 'drinks_stall', 'coffee_cart', 'toilets', 'gift_shop', 'balloon_stand', 'carousel', 'info_kiosk', 'restaurant', 'education_centre'])().concat(sc(['bench', 'bin'])()); } },
      { id: 'decor', name: 'Scenery', icon: 'lamp', items: sc(['lamp', 'flower_bed', 'fountain', 'statue', 'picnic_table', 'sign']) },
      { id: 'staff', name: 'Staff', icon: 'person', items: function () { return D.staff.map(function (s) { return { kind: 'staff', id: s.id, name: s.name, cost: s.hireCost, unit: '+ £' + (s['wage/day'] || s.wage) + '/day', def: s, star: 0, emoji: s.emoji }; }).concat(bd(['keeper_hut', 'vet_clinic'])()); } },
      { id: 'bull', name: 'Bulldoze', icon: 'trash', tool: { kind: 'bulldoze' } }
    ];
    UI.CATS = CATS;
  }

  function buildTabs() {
    el.tabs.innerHTML = '';
    CATS.forEach(function (c) {
      var b = h('button.tab', { html: ic(c.icon) + '<span>' + c.name + '</span>', 'data-cat': c.id, on: { click: function () { UI.snd('click'); UI.openCat(c.id); } } });
      el.tabs.appendChild(b);
    });
  }
  UI.openCat = function (id, noToggle) {
    var c = UI.byId(CATS, id); if (!c) return;
    if (c.tool) { UI.cat = id; markTabs(); el.cards.className = 'empty'; UI.Tools.start(c.tool); return; }
    if (UI.cat === id && !noToggle) { UI.cat = null; markTabs(); el.cards.className = 'empty'; return; }
    if (UI.cat !== id && UI.tool) UI.Tools.cancel();
    UI.cat = id; markTabs(); renderCards(c);
    if (UI.Tutorial) UI.Tutorial.onCat(id);
  };
  function markTabs() { Array.prototype.forEach.call(el.tabs.children, function (b) { b.classList.toggle('on', b.getAttribute('data-cat') === UI.cat); }); }
  function itemPriceText(it) { return fmt(it.cost) + (it.unit ? '<small style="font:500 9.5px var(--sans);color:var(--ink2)"> ' + it.unit + '</small>' : ''); }
  function renderCards(c) {
    var cards = el.cards, items = c.items(), S = Z.state; cards.innerHTML = ''; cards.className = '';
    cards.scrollLeft = 0;
    items.forEach(function (it) {
      var locked = it.star > S.unlocked.star;
      var card = h('button.card' + (locked ? '.lock' : ''), { 'data-id': it.id, 'data-kind': it.kind, title: it.name });
      var th = h('div.th'); card.appendChild(th);
      card.appendChild(h('div.nm', { text: it.name })); card.appendChild(h('div.pr', { html: itemPriceText(it) }));
      if (locked) card.appendChild(h('span.lk', { html: ic('lock') + '★' + it.star }));
      if (it.kind === 'terrain' || it.kind === 'path' || it.kind === 'fence') th.appendChild(UI.swatch(it.kind, it.def));
      else lazyThumb(th, it.kind === 'animal' ? 'animal' : it.kind === 'staff' ? 'staff' : it.kind, it.id, it.emoji || '', 96);
      card.addEventListener('click', function () { UI.snd('click'); UI.onCard(it, locked); });
      cards.appendChild(card);
    });
    markSelected();
  }
  UI.refreshCards = function () { var c = UI.cat && UI.byId(CATS, UI.cat); if (c && !c.tool && el.cards.className === '') { var sl = el.cards.scrollLeft; renderCards(c); el.cards.scrollLeft = sl; } };
  UI.onCard = function (it, locked) {
    if (locked) { UI.toast('Needs a ' + it.star + '-star zoo. Keep improving your rating!', 'info'); return; }
    if (it.kind === 'animal') { UI.Panel.species(it.id); return; }
    UI.Tools.start({ kind: it.kind, id: it.id, name: it.name, def: it.def });
  };
  function markSelected() {
    var t = UI.tool;
    Array.prototype.forEach.call(el.cards.children, function (c) { c.classList.toggle('sel', !!t && c.getAttribute('data-id') === t.id && c.getAttribute('data-kind') === t.kind); });
  }
  UI.markSelected = markSelected;
  // affordability colouring, cheap
  function updateAfford() {
    var m = Z.state.money; Array.prototype.forEach.call(el.cards.children, function (c) {
      var id = c.getAttribute('data-id'), k = c.getAttribute('data-kind'), cost = UI.costOf(k, id);
      c.classList.toggle('poor', cost > m);
    });
  }
  UI.costOf = function (k, id) {
    var d = k === 'path' ? D.paths : k === 'terrain' ? D.terrain : k === 'fence' ? D.fences : k === 'animal' ? D.animals : k === 'scenery' ? D.scenery : k === 'building' ? D.buildings : D.staff;
    var x = UI.byId(d, id); return x ? (x.cost !== undefined ? x.cost : x.hireCost) : 0;
  };

  // ------------------------------------------------------------------ bus
  function hookBus() {
    var b = Z.bus;
    b.on('toast', function (t) { if (t && /^(Goal complete|Your zoo is now rated|Escape!)/.test(t.text)) { if (pendingTicker && pendingTicker.text === t.text) pendingTicker.toasted = true; return; } if (t) { UI.toast(t.text, t.kind); if (pendingTicker && pendingTicker.text === t.text) pendingTicker.toasted = true; } });
    var pendingTicker = null;
    b.on('message', function (m) { UI.unread++; pendingTicker = { text: m.text, toasted: false }; });
    b.on('money', onMoney);
    b.on('goal', function (g) {
      UI.banner({ title: 'Goal complete!', text: g.text + '  Reward ' + fmt(g.reward), kind: 'good' }); UI.confetti(); UI.snd('fanfare'); lastHud.goal = '';
    });
    b.on('escape', function (a) {
      if (!a) return; var sp = UI.sp(a.species);
      UI.banner({ title: 'Escape!', text: (a.name || 'An animal') + ' the ' + (sp ? sp.name.toLowerCase() : 'animal') + ' has got out!', kind: 'alert', jump: function () { UI.jumpTo('animal', a.id); } });
      UI.snd('alarm');
    });
    b.on('birth', function (a) {
      if (!a) return; var sp = UI.sp(a.species);
      UI.banner({ title: 'A baby ' + (sp ? sp.name.toLowerCase() : 'animal') + '!', text: (a.name || 'It') + ' was born. Congratulations!', kind: 'good', jump: function () { UI.jumpTo('animal', a.id); } }); UI.snd('good');
    });
    b.on('death', function (a) {
      if (!a) return; var sp = UI.sp(a.species);
      UI.banner({ title: 'Sad news', text: (a.name || 'An animal') + ' the ' + (sp ? sp.name.toLowerCase() : 'animal') + ' has died.', kind: 'alert', ms: 5000 });
    });
    b.on('gameOver', function () { UI.gameOver(); });
    b.on('reset', function () {
      lastHud = {}; cashShown = null; lastStar = null; UI.unread = 0;
      if (UI.Panel) UI.Panel.hide(true); if (UI.Tools) UI.Tools.cancel(true); UI.refreshCards();
      UI.exitFollowQuiet && UI.exitFollowQuiet();
    });
    // ticker: messages that were not toasted
    setInterval(function () {
      if (pendingTicker && !pendingTicker.toasted) { UI.toast(pendingTicker.text, 'info'); }
      pendingTicker = null;
    }, 400);
  }
  UI.exitFollowQuiet = function () { UI.following = null; el.follow.classList.remove('on'); };
  UI.jumpTo = function (kind, id) {
    var p = Z.World.entityPos(kind, id);
    if (!p) { var arr = kind === 'animal' ? Z.state.animals : kind === 'guest' ? Z.state.guests : Z.state.staff, e = arr.filter(function (x) { return x.id === id; })[0]; if (e) p = { x: e.x, z: e.z }; }
    if (!p) return; Z.World.focus(p.x, p.z, Math.min(Z.World.cam.dist, 26));
    if (UI.Panel && !UI.tool) UI.Panel.open(kind, id);
  };
  UI.gameOver = function () {
    var S = Z.state;
    var m = h('div.bn.alert', { style: 'position:fixed;left:50%;top:30%;transform:translateX(-50%);width:min(88vw,360px);z-index:40;pointer-events:auto' },
      h('h3', { text: 'The bank has called in your debts' }), h('p', { text: 'You reached day ' + S.day + ' with ' + S.stats.guestsTotal + ' guests through the gates. Every zookeeper has a rough season.' }),
      h('div.row', h('button.btn.gold', { text: 'Try again', on: { click: function () { m.remove(); Z.Main.newGame(); } } }), h('button.btn.alt', { text: 'Keep looking', on: { click: function () { m.remove(); } } })));
    document.body.appendChild(m);
  };

  // ------------------------------------------------------------------ public update / init
  var upT = 0;
  UI.update = function (dt) {
    stepConfetti(dt);
    for (var k in UI.held) UI.held[k](dt);
    if (cashShown !== null && cashShown !== Z.state.money) updateCash(dt);
    upT += dt;
    if (upT >= 0.25) {
      upT = 0; updateCash(0.25); updateHud(); updateAfford();
      if (UI.Panel) UI.Panel.update(); if (UI.Screens) UI.Screens.update(); if (UI.Tutorial) UI.Tutorial.update(); if (UI.Tools) UI.Tools.update();
    }
  };
  UI.init = function () {
    buildDOM(); defCats(); buildTabs(); hookBus();
    if (UI.Tools) UI.Tools.init(); if (UI.Panel) UI.Panel.init(); if (UI.Screens) UI.Screens.init(); if (UI.Tutorial) UI.Tutorial.init();
    UI.reset();
  };
  UI.reset = function () { lastHud = {}; cashShown = null; updateHud(); updateCash(1); };
  UI.setBuildHidden = function (b) { el.build.classList.toggle('hide', b); };
})();
