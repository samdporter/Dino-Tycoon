// ===== 50-ui.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - UI core: helpers, icons, HUD, build bar, toasts, banners, confetti, side controls. */
(function () {
  'use strict';
  var D = Z.DATA, UI = Z.UI = { held: {}, tool: null, sel: null, cat: null, prefs: {} };
  var $ = Z.sharedUI.$, h = Z.sharedUI.h;

  // ------------------------------------------------------------------ helpers
  UI.h = h; UI.$ = $;
  function fmt(n) { n = Math.round(n || 0); return (n < 0 ? '-' : '') + '£' + Math.abs(n).toLocaleString('en-GB'); }
  function fmt2(n) { return '£' + (Math.round(n * 100) / 100).toFixed(2); }
  UI.fmt = fmt; UI.fmt2 = fmt2;
  UI.clamp = function (v, a, b) { if (typeof v !== 'number' || !isFinite(v)) return a; return v < a ? a : v > b ? b : v; };
  UI.pct = function (v) { return Math.round(UI.clamp(v, 0, 1) * 100); };
  UI.byId = function (arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; };
  UI.sp = function (id) { return UI.byId(D.animals, id); };
  UI.narrow = function () { return window.innerWidth < 820; };
  UI.touch = function () { return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); };
  UI.snd = function (n, a, b) { try { if (Z.Audio && Z.Audio[n]) Z.Audio[n](a, b); } catch (e) { } };

  // ------------------------------------------------------------------ icons
  var P = {
    wave: 'M2 9c3-3 5 3 8 0s5-3 8 0 3 3 4 0M2 15c3-3 5 3 8 0s5-3 8 0 3 3 4 0M2 20h20',   // realms package icons
    wing: 'M3 14c4-1 6-5 9-9 3 4 5 8 9 9-3 0-5 1-9 5-4-4-6-5-9-5zM12 5v14',
    radar: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M7 7a7 7 0 000 10M17 7a7 7 0 010 10M4 4a11 11 0 000 16M20 4a11 11 0 010 16',
    ditch: 'M2 8h5l2 10h6l2-10h5M4 21h16',   // moats package icon
    monorail: 'M5 4h14a2 2 0 012 2v7H3V6a2 2 0 012-2zM7 8h3.500M13.500 8H17M3 16h18M7 16v5M17 16v5',   // monorail package icon
    boat: 'M3 15h18l-2.500 4h-13zM12 3v9M12 4l6 7h-6M3 21c3-1.500 5 1.500 9 0s6-1.500 9 0',   // boats package icon
    safari: 'M3 15h2.500l1.500-4h8l2 4H21v3H3zM8 18.500a1.500 1.500 0 100 .1M16 18.500a1.500 1.500 0 100 .1M9 11V8h5',   // safari package icon
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
    flask: 'M9 3h6M10 3v6L4.500 18.500A2 2 0 006.200 21.500h11.600a2 2 0 001.700-3L14 9V3M7.500 15h9',
    dna: 'M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12M8 7h8M8 17h8M9 12h6',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
    egg: 'M12 3c-4 0-7 6-7 11a7 7 0 0014 0c0-5-3-11-7-11z',
    gem: 'M6 4h12l4 6-10 11L2 10zM2 10h20M9 4l-2 6 5 11 5-11-2-6',
    vial: 'M9 3h6M10 3v14a2 2 0 004 0V3M10 10h4',
    leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8',
    bolt: ['fill', 'M13.500 2L5 13.500h5.500L9.500 22 19 10h-5.800z'],
    paper: 'M4 5h13v14H6a2 2 0 01-2-2zM17 8h3v9a2 2 0 01-2 2M7 8.500h7M7 12h7M7 15.500h4',
    coaster: 'M3 19h18M5 19V11c2-5 5-5 7 0s5 5 7-2v10M8 15v4M12 11v8M16 14v5'
  };
  function ic(n, cls) {
    var d = P[n]; if (!d) return '';
    var fill = Array.isArray(d); if (fill) d = d[1];
    return '<svg class="ic' + (fill ? ' fill' : '') + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  UI.ic = ic;
  UI.amberSvg = function (n) {
    return '<svg viewBox="0 0 64 80" width="' + n + '" height="' + Math.round(n * 1.25) + '"><defs><radialGradient id="amg" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".55" stop-color="#f2a81d"/><stop offset="1" stop-color="#b86a0a"/></radialGradient></defs>' +
      '<path d="M32 4C32 4 6 34 6 52a26 26 0 0 0 52 0C58 34 32 4 32 4z" fill="url(#amg)" stroke="#5a3306" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M32 70c-8 0-14-6-14-14 0-3 1-6 3-10" fill="none" stroke="#fff3c4" stroke-width="3" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M24 46c4-6 6-1 9-5s4 2 7 4M28 56c3-3 6 1 9-2" fill="none" stroke="#6b3d08" stroke-width="2.2" stroke-linecap="round" opacity=".75"/></svg>';
  };

  // ------------------------------------------------------------------ DOM skeleton
  var root, el = {};
  function buildDOM() {
    root = $('#ui'); root.innerHTML = '';
    el.cash = h('button#cash.pill.hud-cell.num', { 'aria-label': 'Finances', on: { click: function () { UI.openModal('fin'); UI.snd('click'); } } });
    el.cashTxt = h('span'); el.cash.appendChild(el.cashTxt);
    el.guests = h('div#gstat.pill.hud-cell', { html: ic('guests') + '<span class="num">0</span>', title: 'Guests in the park' });
    el.guestsN = $('span', el.guests);
    el.stars = h('button#stars.pill.hud-cell', { 'aria-label': 'Park rating', on: { click: function () { UI.openModal('ov'); UI.snd('click'); } } });
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
    el.lock = h('div#lockbar', { html: ic('bell') + '<b>LOCKDOWN</b><span>A dangerous dinosaur is loose. Guests are sheltering.</span>' });
    el.side = h('div#side');
    function cb(icon, label, cls) { return h('button.cbtn.pill' + (cls ? '.' + cls : ''), { html: ic(icon), 'aria-label': label }); }
    el.bRotL = cb('rotl', 'Rotate view left'); el.bRotR = cb('rotr', 'Rotate view right');
    el.bZin = cb('zin', 'Zoom in'); el.bZout = cb('zout', 'Zoom out'); el.bTilt = cb('tilt', 'Change camera angle');
    el.bRotObj = cb('rot', 'Rotate item'); el.bRotObj.style.display = 'none';
    el.bRes = cb('flask', 'Research lab'); el.bRes.classList.add('resbtn'); el.bResBadge = h('small', { text: '' }); el.bResBadge.style.display = 'none'; el.bRes.appendChild(el.bResBadge);
    el.bRes.addEventListener('click', function () { UI.snd('click'); UI.Research && UI.Research.open(); });
    el.bMove = cb('hand', 'Move the camera instead of using the tool'); el.bMove.style.display = 'none';
    el.bSV = cb('eye', 'Street view'); el.bSV.title = 'Street view - walk through your park'; el.bSV.classList.add('svbtn');
    el.bSV.addEventListener('click', function () { UI.snd('click'); UI.SV && UI.SV.enter(); });
    el.bGfx = cb('gear', 'Graphics & settings', 'gfxbtn'); el.bGfx.title = 'Graphics & settings';
    el.bGfxBadge = h('small', { text: 'AUTO' }); el.bGfx.appendChild(el.bGfxBadge);
    el.bGfx.addEventListener('click', function () { UI.snd('click'); UI.openModal('set'); });
    [el.bRes, el.bMove, el.bRotObj, el.bRotL, el.bRotR, el.bZin, el.bZout, el.bTilt, el.bSV, el.bGfx].forEach(function (b) { el.side.appendChild(b); });
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
    el.undo = h('button#undoBtn.pill', { 'aria-label': 'Undo', on: { click: function () { UI.doUndo(); } } });
    el.build.appendChild(el.undo);
    el.strip = h('div#toolstrip.pill');
    el.dock = h('div#dock'); el.tabs = h('div#tabs'); el.cards = h('div#cards.empty');
    el.dock.appendChild(el.tabs); el.dock.appendChild(el.cards);
    el.build.appendChild(el.strip); el.build.appendChild(el.dock);
    el.panel = h('div#panel'); el.modal = h('div#modal'); el.cost = h('div#costtip'); el.tut = h('div#tut.pill');
    el.unhide = h('button#unhide.pill', { html: ic('eye'), 'aria-label': 'Show interface', on: { click: function () { UI.hideUI(false); } } });
    el.stack = h('div#stack', el.pause, el.lock, el.goal, el.follow, el.tut, el.toasts, el.banner);
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

  // ------------------------------------------------------------------ undo
  var undoShownUntil = 0, undoKey = '';
  UI.updateUndo = function (bump) {
    if (!el.undo || !Z.Sim) return;
    var u = Z.Sim.canUndo(), now = Date.now();
    if (bump) undoShownUntil = now + 20000;
    var show = (UI.tool || now < undoShownUntil || (u.count && UI.Tutorial && UI.Tutorial.wantsUndo && UI.Tutorial.wantsUndo())) && !UI.titleOpen;
    var key = show + '|' + u.count + '|' + u.label + '|' + u.refund;
    if (key === undoKey) return; undoKey = key;
    el.undo.style.display = show ? 'flex' : 'none';
    el.undo.classList.toggle('dis', !u.count);
    el.undo.innerHTML = ic('undo') + '<span><b>Undo</b>' + (u.count ? '<small>' + u.label + (u.refund ? ' (' + (u.refund > 0 ? '+' : '-') + fmt(Math.abs(u.refund)) + ')' : '') + '</small>' : '<small>nothing to undo</small>') + '</span>' + '<kbd>Z</kbd>';
  };
  UI.doUndo = function () {
    var u = Z.Sim.canUndo(); if (!u.count) { UI.snd('bad'); UI.toast('Nothing to undo', 'info'); return; }
    var r = Z.Sim.undo();
    if (r && r.ok) { UI.snd('build'); UI.toast('Undone: ' + u.label + (r.refund ? ' (' + (r.refund > 0 ? '+' : '-') + fmt(Math.abs(r.refund)) + ')' : ''), 'good'); undoShownUntil = Date.now() + 20000; if (UI.Tutorial && UI.Tutorial.onUndo) UI.Tutorial.onUndo(); }
    else { UI.snd('bad'); UI.toast((r && r.msg) || 'Cannot undo that', 'bad'); }
    undoKey = ''; UI.updateUndo();
  };

  UI.hideUI = function (on) { root.classList.toggle('ui-hidden', !!on); if (on) UI.toast('Tap the eye to bring the controls back', 'info'); };
  UI.updateGfxBadge = function () {
    if (!el.bGfxBadge || !Z.Main || !Z.Main.getQuality) return;
    var q = Z.Main.getQuality();
    var lbl = q === 'med' ? 'MED' : String(q || 'auto').toUpperCase();
    el.bGfxBadge.textContent = lbl;
  };
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
      setTxt(el.cashTxt, 'cash', UI.hudMoney ? UI.hudMoney(cashShown) : fmt(cashShown));
    } else setTxt(el.cashTxt, 'cash', UI.hudMoney ? UI.hudMoney(target) : fmt(target));
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
    if (lastHud.rate !== key) { lastHud.rate = key; for (var i = 0; i < 5; i++) el.starEls[i].style.setProperty('--f', Math.round(UI.clamp(r - i, 0, 1) * 100) + '%'); el.stars.title = 'Park rating ' + r.toFixed(1); }
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
      UI.banner({ title: us + '-star park!', text: names.length ? 'Unlocked: ' + names.join(', ') : 'Your park is growing nicely.', kind: 'good', stars: us });
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
    // lockdown
    var ld = Z.Sim.lockdown(); if (lastHud.ld !== ld) { lastHud.ld = ld; el.lock.classList.toggle('on', ld); document.body.classList.toggle('lockdown', ld); if (Z.World.setLockdown) Z.World.setLockdown(ld); if (ld) UI.snd('alarm'); }
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
      case 'star': v = S.unlocked.star; break;
      case 'extractions': v = S.research.stats.successes; break;
      case 'experiments': v = S.research.stats.experiments; break;
      case 'hatched': v = S.research.stats.hatched; break;
      case 'predators': { v = 0; S.animals.forEach(function (a) { var spd = UI.sp(a.species); if (spd && spd.predator && a.enc && a.state !== 'escaped') { var r = Z.Sim.animalReport(a.id); if (r && r.enclosureFence >= r.minFence) v++; else if (r && !('enclosureFence' in r)) v++; } }); break; }
      case 'genome100': { v = 0; for (var k1 in S.research.genomes) if (S.research.genomes[k1] >= 99.95) v++; break; }
      case 'genome': { v = 0; for (var k2 in S.research.genomes) v = Math.max(v, S.research.genomes[k2]); break; }
      case 'unlocked': { v = 0; for (var k3 in S.research.genomes) if (S.research.genomes[k3] >= 50) v++; break; }
      case 'traits': { v = 0; for (var k4 in S.research.traits) v += S.research.traits[k4].length; break; }
      case 'themepark': v = S.objects.filter(function (o) { var d = o.kind === 'building' && UI.byId(D.buildings, o.type); return d && (d.type === 'ride' || d.type === 'arcade'); }).length; break;
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
      if (e) { var sdef = UI.byId(D.staff, e.type); name = e.name + ' the ' + (sdef ? sdef.name : e.type).toLowerCase(); txt = e.task || ''; }
    }
    if (!e) { Z.World.follow(null); return; }
    setTxt(el.fName, 'fn', name); setTxt(el.fTxt, 'ft', txt);
  }
  UI.stateText = function (s) {
    return ({ idle: 'Relaxing', walk: 'Wandering about', run: 'Running', eat: 'Eating', drink: 'Drinking', sleep: 'Sleeping', play: 'Playing', swim: 'Swimming', sick: 'Feeling poorly', escaped: 'Escaped!', watch: 'Watching the animals', queue: 'Queueing', use: 'Using a facility', sit: 'Resting on a bench', flee: 'Running away!', fly: 'Flying', leave: 'Heading home', work: 'Working' })[s] || s;
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
    else if (s === 'electric') { var hv = def.strength > 4; g.fillStyle = hv ? '#3d4348' : '#9a9d98'; g.fillRect(6, hv ? 8 : 16, 4, hv ? 46 : 38); g.fillRect(54, hv ? 8 : 16, 4, hv ? 46 : 38); g.strokeStyle = '#8fd0ff'; g.lineWidth = 2; for (i = 0; i < (hv ? 5 : 3); i++) { var wy = (hv ? 14 : 22) + i * (hv ? 9 : 13); g.beginPath(); g.moveTo(8, wy); g.lineTo(56, wy); g.stroke(); } g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(34, 20); g.lineTo(28, 33); g.lineTo(33, 33); g.lineTo(30, 45); g.lineTo(39, 29); g.lineTo(34, 29); g.fill(); }
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

  // ---- terrain sculpting cards (Raise / Lower / Level / Smooth / Cliff / Dig lake) ----
  var SCULPT_DEFS = [
    { id: 'raise', name: 'Raise (hill)', mode: 'raise', tip: 'Press and hold to build a hill, one level at a time.' },
    { id: 'lower', name: 'Lower (dip)', mode: 'lower', tip: 'Press and hold to dig a dip, one level at a time.' },
    { id: 'level', name: 'Level', mode: 'level', tip: 'Flattens the ground to the height you first press on.' },
    { id: 'smooth', name: 'Smooth', mode: 'smooth', tip: 'Softens bumps and steep slopes.' },
    { id: 'cliff', name: 'Cliff / plateau', mode: 'raise', sharp: true, tip: 'Raises ground with sharp edges. Steep cliffs cannot be built on or walked over.' },
    { id: 'lake', name: 'Dig lake', mode: 'lower', lake: true, tip: 'Digs down and floods the brush area with water.' }
  ];
  UI.SCULPT = SCULPT_DEFS;
  function sculptIcon(id) {
    var g = '#79a95a', g2 = '#5d8a43', br = '#8a6a43', bl = '#4aa3c8', ar = '#2c5e3a', s = '';
    var sv = function (x) { return '<svg viewBox="0 0 48 48" width="100%" height="100%">' + x + '</svg>'; };
    var arrow = function (up, x) { return '<path d="M' + x + ' ' + (up ? 14 : 8) + 'v' + (up ? -9 : 9) + 'm-4 ' + (up ? 4 : -4) + 'l4 ' + (up ? -4 : 4) + 'l4 ' + (up ? 4 : -4) + '" fill="none" stroke="' + ar + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 ' + (up ? 6 : 2) + ')"/>'; };
    if (id === 'raise') s = '<path d="M2 40 H46 V46 H2Z" fill="' + br + '"/><path d="M2 40 C14 40 16 18 24 18 C32 18 34 40 46 40 Z" fill="' + g + '"/>' + arrow(true, 24);
    else if (id === 'lower') s = '<path d="M2 24 H46 V46 H2Z" fill="' + br + '"/><path d="M2 24 C14 24 14 38 24 38 C34 38 34 24 46 24 V28 H2Z" fill="' + g2 + '"/><path d="M2 24 C14 24 14 38 24 38 C34 38 34 24 46 24" fill="none" stroke="' + g + '" stroke-width="4"/>' + arrow(false, 24);
    else if (id === 'level') s = '<path d="M2 30 L14 22 L26 34 L46 24 V46 H2Z" fill="' + br + '" opacity=".55"/><path d="M2 28 H46 V46 H2Z" fill="' + br + '"/><rect x="2" y="26" width="44" height="5" rx="2" fill="' + g + '"/><path d="M8 16 H40 M8 20 H40" stroke="' + ar + '" stroke-width="2.6" stroke-linecap="round"/>';
    else if (id === 'smooth') s = '<path d="M2 46 V30 H46 V46Z" fill="' + br + '"/><path d="M2 32 L10 22 L16 32 L24 20 L30 32 L38 22 L46 32" fill="none" stroke="' + g2 + '" stroke-width="2" stroke-dasharray="3 3"/><path d="M2 30 C12 18 18 18 24 24 S38 30 46 22 V46 H2Z" fill="' + g + '"/><path d="M2 30 C12 18 18 18 24 24 S38 30 46 22" fill="none" stroke="' + g2 + '" stroke-width="2.4"/>';
    else if (id === 'cliff') s = '<path d="M2 42 H46 V46 H2Z" fill="' + br + '"/><path d="M2 42 V32 H14 V16 H34 V32 H46 V42Z" fill="#a8998a"/><path d="M14 16 H34 L38 20 H10Z" fill="' + g + '"/><path d="M14 20 V32 M34 20 V32 M24 20 V32" stroke="#8a7a6a" stroke-width="1.5"/><path d="M2 32 H14 L16 30 H2Z M34 32 H46 V30 H36Z" fill="' + g + '"/>';
    else s = '<path d="M2 20 H46 V46 H2Z" fill="' + br + '"/><path d="M2 20 H8 C12 20 12 36 24 36 C36 36 36 20 40 20 H46 V22 H2Z" fill="' + g + '"/><path d="M8 22 C12 22 12 36 24 36 C36 36 36 22 40 22Z" fill="' + bl + '"/><path d="M16 28 Q20 26 24 28 T32 28" fill="none" stroke="#bfe6f5" stroke-width="1.6" stroke-linecap="round"/>';
    return sv(s);
  }
  var SCULPT_PROBE = { i: 20, j: 40 };
  function sculptPriceOf(d) {
    var T = Z.Sim && Z.Sim.terraform; if (!T) return null;
    try {
      var r = T(SCULPT_PROBE.i, SCULPT_PROBE.j, d.mode, 0, { sharp: !!d.sharp, dry: true }), c = r && typeof r.cost === 'number' ? r.cost : null;
      if (c === null) return null;
      if (d.lake && Z.Sim.paintTerrain) { var w = Z.Sim.paintTerrain(SCULPT_PROBE.i, SCULPT_PROBE.j, 'water', 0, { dry: true }); if (w && w.ok && w.cost) c += w.cost; }
      return c;
    } catch (e) { return null; }
  }
  function sculptItems() {
    var has = !!(Z.Sim && Z.Sim.terraform);
    return SCULPT_DEFS.map(function (d, k) {
      var c = has ? sculptPriceOf(d) : null;
      return { kind: 'sculpt', id: d.id, name: d.name, cost: c || 0, def: d, star: 0, sculpt: true, first: k === 0, off: !has, tip: d.tip,
        priceHtml: !has ? '<small style="font:600 10px var(--sans);color:var(--ink3)">soon</small>' : c === null ? '<small style="font:600 10px var(--sans);color:var(--ink2)">per level</small>' : fmt(c) + '<small style="font:500 9.5px var(--sans);color:var(--ink2)"> /level</small>' };
    });
  }
  // names of terrains for a list of ids ('Fern meadow, Jungle')
  UI.terrainNames = function (ids) {
    return (ids || []).map(function (id) { var t = UI.byId(D.terrain, id); return t ? t.name.toLowerCase() : null; }).filter(function (x) { return x; }).join(', ');
  };
  UI.itemInfo = function (def, short) {
    if (!def) return '';
    var out = [], plant = def.terrains && def.terrains.length && (def.kind === 'tree' || def.kind === 'bush');
    if (plant) out.push('Best on: ' + UI.terrainNames(def.terrains) + '.');
    if (def.info && !(short && plant)) out.push(def.info);
    if (!short && def.w !== undefined) {
      if (def.needsPower && def.powerDraw && !/kW/i.test(def.info || '')) out.push('Draws ' + def.powerDraw + ' kW.');
      if (def.upkeep > 0 && !/upkeep|\/day/i.test(def.info || '')) out.push('Upkeep ' + fmt(def.upkeep) + '/day.');
    }
    return out.join(' ');
  };

  var CATS;
  function defCats() {
    function sc(ids, tpCat) { return function () { return ids.map(function (id) { var d = UI.byId(D.scenery, id); return { kind: 'scenery', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, tpCat: tpCat }; }); }; }
    function bd(ids, tpCat) { return function () { return ids.map(function (id) { var d = UI.byId(D.buildings, id); return { kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, fp: [d.w || 1, d.h || 1], tpCat: tpCat }; }); }; }
    CATS = [
      { id: 'paths', name: 'Paths', icon: 'path', items: function () { return D.paths.filter(function (p) { return !p.special; }).map(function (p) { return { kind: 'path', id: p.id, name: p.name, cost: p.cost, unit: '/tile', def: p, star: 0 }; }); }, hint: 'Drag to lay a straight path. Guests and staff only walk on paths.' },
      { id: 'terrain', name: 'Terrain', icon: 'mount', items: function () { return D.terrain.map(function (p) { return { kind: 'terrain', id: p.id, name: p.name, cost: p.cost, unit: '/tile', def: p, star: 0 }; }).concat(sculptItems()); } },
      { id: 'fences', name: 'Fences', icon: 'fence', items: function () { return D.fences.filter(function (p) { return !p.special; }).map(function (p) { return { kind: 'fence', id: p.id, name: p.name, cost: p.cost, unit: '/panel', def: p, star: 0, sub: 'Str ' + p.strength }; }); } },
      { id: 'hatch', name: 'Hatch', icon: 'egg', items: function () {
        var R = Z.Sim.research; return D.animals.filter(function (p) { return !p.modern && (!UI.Realms || UI.Realms.hatchShows(p)); }).map(function (p) { var gi = R.genomeInfo(p.id), ho = R.hatchOdds(p.id); return { kind: 'animal', id: p.id, name: p.name, cost: ho.cost, def: p, star: 0, genome: gi.genome, chance: ho.chance, locked: gi.genome < 50, odds: ho, rarity: p.rarity, realm: UI.Realms ? UI.Realms.realmOf(p) : 'land', tip: UI.Realms ? UI.Realms.hatchTip(p) : undefined }; })
          .sort(function (a, b) { return (a.locked - b.locked) || b.genome - a.genome; }).concat(UI.Realms && UI.Realms.hatchMore ? UI.Realms.hatchMore() : []); } },
      { id: 'plants', name: 'Plants & rocks', icon: 'tree', items: sc(['ginkgo', 'pine', 'monkey_puzzle', 'cycad', 'horsetail', 'tree_fern', 'dead_tree', 'snow_pine', 'jungle_tree', 'bush', 'fern', 'reed_clump', 'boulder', 'rock_pile', 'ice_floe']) },
      { id: 'encl', name: 'Enclosure extras', icon: 'tent', items: sc(['wooden_shelter', 'cave_shelter', 'heat_rock', 'log', 'scratching_post', 'mud_wallow', 'carcass_feeder']) },
      { id: 'sci', name: 'Science', icon: 'flask', items: bd(['research_lab', 'hatchery', 'emergency_bunker', 'viewing_platform']) },
      { id: 'fac', name: 'Facilities', icon: 'cart', items: function () { return bd(['burger_stand', 'pizza_hut', 'ice_cream', 'drinks_stall', 'coffee_cart', 'toilets', 'gift_shop', 'balloon_stand', 'carousel', 'info_kiosk', 'restaurant', 'education_centre'])().concat(sc(['bench', 'bin'])()); } },
      { id: 'themepark', name: 'Theme Park', icon: 'coaster', items: function () {
        return bd(['mine_coaster', 'carousel', 'ferris_wheel', 'wooden_coaster', 'log_flume', 'loop_coaster'], 'rides')()
          .concat(bd(['rubber_duck_stand', 'ring_toss_stand', 'high_striker', 'whack_a_mole', 'air_rifle_stand'], 'arcade')())
          .concat(bd(['candy_floss', 'popcorn_stand', 'hot_dog_stand', 'slushie_bar', 'balloon_stand', 'ice_cream'], 'food')())
          .concat(sc(['themepark_arch', 'bunting_poles', 'funhouse_mirror', 'balloon_arch', 'circus_lamp', 'clown_statue'], 'scenery')());
      } },
      { id: 'decor', name: 'Scenery', icon: 'lamp', items: sc(['lamp', 'flower_bed', 'fountain', 'picnic_table', 'sign', 'fossil_skeleton']) },
      { id: 'staff', name: 'Staff', icon: 'person', items: function () { return D.staff.filter(function (s) { return s.id !== 'scientist'; }).map(function (s) { return { kind: 'staff', id: s.id, name: s.name, cost: s.hireCost, unit: '+ £' + (s['wage/day'] || s.wage) + '/day', def: s, star: 0, emoji: s.emoji }; }).concat(bd(['keeper_hut', 'vet_clinic'])()); } },
      { id: 'coasters', name: 'Coasters', icon: 'coaster', items: function () { return UI.Coaster ? UI.Coaster.items(bd) : []; } },
      { id: 'bull', name: 'Bulldoze', icon: 'trash', tool: { kind: 'bulldoze' } }
    ];
    if (UI.extraCats) UI.extraCats.forEach(function (c) { CATS.splice(CATS.length - 1, 0, c); });   // other packages (moats) add build categories
    UI.CATS = CATS;
  }

  function buildTabs() {
    if (UI.buildGroups) { UI.buildGroups(CATS); return; }   // two-level build bar (75-ui-groups.js)
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
  function markTabs() { if (UI.groupMark) { UI.groupMark(); return; } Array.prototype.forEach.call(el.tabs.children, function (b) { b.classList.toggle('on', b.getAttribute('data-cat') === UI.cat); }); }
  function itemPriceText(it) { return fmt(it.cost) + (it.unit ? '<small style="font:500 9.5px var(--sans);color:var(--ink2)"> ' + it.unit + '</small>' : ''); }
  function fpIcon(w, hh, noDoor) {
    var u = 5, W = w * u + 2, H = hh * u + 2, r = '';
    for (var j = 0; j < hh; j++) for (var i = 0; i < w; i++) r += '<rect x="' + (1 + i * u) + '" y="' + (1 + j * u) + '" width="' + (u - 0.8) + '" height="' + (u - 0.8) + '" rx="1" fill="#6a9a52"/>';
    if (!noDoor) r += '<rect x="1" y="' + (H - 2.6) + '" width="' + (W - 2) + '" height="1.8" fill="#f2a81d"/>';
    return '<svg class="fpi" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + r + '</svg>';
  }
  function cardSpec(it) {
    var d = it.def; if (!d) return '';
    if (it.kind === 'staff' && d.id === 'keeper') {
      var baseT = Z.Sim && Z.Sim.rangerCoverage ? Z.Sim.rangerCoverage().baseTiles : 32;
      return baseT + 't';
    }
    if (it.kind === 'fence' && d.strength) return 'Str ' + d.strength;
    if (it.kind !== 'building') return '';
    if (d.id === 'keeper_hut' || d.id === 'vet_clinic') {
      var cov = Z.Sim && Z.Sim.rangerCoverage ? Z.Sim.rangerCoverage() : { stationTiles: 48, vetClinicTiles: 48 };
      return (d.id === 'vet_clinic' ? (cov.vetClinicTiles || 48) : cov.stationTiles) + 't';
    }
    if (d.gen) return d.gen.kw + 'kW';
    if (d.battery) return d.battery.kwh + 'kWh';
    if (d.powerNode) return d.powerNode.radius + 't';
    if (d.moat) return d.moat.cap + 'u';
    if (d.realm === 'plant' && D.realms && D.realms.plant) return D.realms.plant.capacity + 'u';
    if (d.id === 'tagging_tower' && D.realms && D.realms.virtual && D.realms.virtual.towers && D.realms.virtual.towers[0]) return D.realms.virtual.towers[0].radius + 't';
    return '';
  }
  function renderCards(c) {
    var cards = el.cards, items = c.items(), S = Z.state; cards.innerHTML = ''; cards.className = '';
    cards.scrollLeft = 0;
    if (c.id === 'coasters') {
      var cSeg = h('div.seg.drawer-mode', { style: 'margin: 0 4px 6px 4px;' });
      var cMode = UI.coasterDrawerMode || 'all';
      [['all', 'All'], ['stations', 'Stations'], ['track', 'Track & Height'], ['specials', 'Specials']].forEach(function (m) {
        cSeg.appendChild(h('button' + (cMode === m[0] ? '.on' : ''), {
          text: m[1],
          on: { click: function () { UI.coasterDrawerMode = m[0]; UI.refreshCards(); } }
        }));
      });
      cards.appendChild(cSeg);
      if (cMode !== 'all') items = items.filter(function (it) { return it.tpCat === cMode; });
    } else if (c.id === 'themepark') {
      var tpSeg = h('div.seg.drawer-mode', { style: 'margin: 0 4px 6px 4px;' });
      var tpMode = UI.themeparkDrawerMode || 'all';
      [['all', 'All'], ['rides', 'Rides & Coasters'], ['arcade', 'Arcade & Stands'], ['food', 'Food & Drink'], ['scenery', 'Scenery']].forEach(function (m) {
        tpSeg.appendChild(h('button' + (tpMode === m[0] ? '.on' : ''), {
          text: m[1],
          on: {
            click: function () {
              UI.themeparkDrawerMode = m[0];
              UI.refreshCards();
            }
          }
        }));
      });
      cards.appendChild(tpSeg);
      if (tpMode !== 'all') items = items.filter(function (it) { return it.tpCat === tpMode; });
    }
    items.forEach(function (it) {
      var locked = it.star > S.unlocked.star || !!it.locked;
      if (it.first) cards.appendChild(h('div.cgrp', { html: '<span>Sculpt</span>' }));
      var card = h('button.card' + (locked ? '.lock' : '') + (it.kind === 'animal' ? '.dino' : '') + (it.sculpt ? '.sculpt' : '') + (it.off ? '.off' : ''), { 'data-id': it.id, 'data-kind': it.kind, title: it.tip || (it.def && (it.kind === 'scenery' || it.kind === 'building') && UI.itemInfo(it.def)) || (it.def && it.def.effect) || it.name });
      var th = h('div.th'); card.appendChild(th);
      if (it.kind === 'animal') {
        card.appendChild(h('div.nm', { text: it.genome > 0 ? it.name : '???' }));
        card.appendChild(h('div.gbar', h('i', { style: 'width:' + Math.min(100, it.genome) + '%' }), h('b', { style: 'left:50%' })));
        card.appendChild(h('div.pr', { html: locked ? '<small style="font:700 10.5px var(--sans);color:var(--ink2)">' + Math.round(it.genome) + '/50%</small>' : '<span style="font-size:11px">' + Math.round(it.chance * 100) + '% · ' + fmt(it.cost) + '</span>' }));
        if (it.genome <= 0) th.classList.add('sil');
        if (it.realm && it.realm !== 'land') card.appendChild(h('span.rbadge.' + it.realm, { text: it.realm === 'sea' ? 'SEA' : 'AIR' }));
      } else {
        card.appendChild(h('div.nm', { text: it.name })); card.appendChild(h('div.pr', { html: it.priceHtml || itemPriceText(it) }));
      }
      if (it.fp) card.appendChild(h('span.fpb', { html: fpIcon(it.fp[0], it.fp[1], !!(it.def && it.def.utility)) + it.fp[0] + '×' + it.fp[1] }));
      if (locked && it.kind !== 'animal') card.appendChild(h('span.lk', { html: ic('lock') + '★' + it.star }));
      else if (!locked) { var sp = cardSpec(it); if (sp) card.appendChild(h('span.spb', { text: sp })); }
      if (it.iconHtml) th.innerHTML = it.iconHtml;
      else if (it.sculpt) th.innerHTML = sculptIcon(it.id);
      else if (it.coasterTool) { th.innerHTML = '<span style="font-size:26px;line-height:1">' + (it.emoji || '🎢') + '</span>'; }
      else if (it.kind === 'terrain' || it.kind === 'path' || it.kind === 'fence') th.appendChild(UI.swatch(it.kind, it.def));
      else lazyThumb(th, it.kind === 'animal' ? 'animal' : it.kind === 'staff' ? 'staff' : it.kind, it.id, it.emoji || '', 96);
      card.addEventListener('click', function () { UI.snd('click'); UI.onCard(it, locked); });
      cards.appendChild(card);
    });
    markSelected();
  }
  UI.refreshCards = function () { var c = UI.cat && UI.byId(CATS, UI.cat); if (c && !c.tool && el.cards.className === '') { var sl = el.cards.scrollLeft; renderCards(c); el.cards.scrollLeft = sl; } };
  UI.onCard = function (it, locked) {
    if (it.kind === 'animal') { UI.Panel.species(it.id); return; }
    if (it.kind === 'sculpt' && !(Z.Sim && Z.Sim.terraform)) { UI.toast('Terrain sculpting is not available yet.', 'info'); return; }
    if (locked) { UI.toast('Needs a ' + it.star + '-star park. Keep improving your rating!', 'info'); return; }
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
    if (k === 'animal') return Z.Sim.research.hatchOdds(id).cost;
    if (k === 'sculpt' || k === 'moatview' || k === 'clower' || k === 'ctrackrm' || k === 'cview') return 0;
    if (k === 'ctrack') return 35;
    if (k === 'craise') return 15;
    if (k === 'cspec' && D.coaster) {
      var sid = Number(String(id).replace('cspec_', ''));
      for (var q = 0; q < D.coaster.specials.length; q++) if (D.coaster.specials[q].id === sid) return D.coaster.specials[q].cost;
      return 0;
    }
    if (UI.Realms && UI.Realms.costOf && UI.Realms.costOf(k, id) !== undefined) return UI.Realms.costOf(k, id);
    if (k === 'ditch') return Z.DATA.moats.depths[(+id || 1) - 1].cost;
    var x = UI.byId(d, id); return x ? (x.cost !== undefined ? x.cost : x.hireCost) : 0;
  };

  // ------------------------------------------------------------------ bus
  function hookBus() {
    var b = Z.bus;
    b.on('toast', function (t) { if (t && /^(Goal complete|Your park is now rated|Escape!)/.test(t.text)) { if (pendingTicker && pendingTicker.text === t.text) pendingTicker.toasted = true; return; } if (t) { UI.toast(t.text, t.kind); if (pendingTicker && pendingTicker.text === t.text) pendingTicker.toasted = true; } });
    var pendingTicker = null;
    b.on('message', function (m) { UI.unread++; pendingTicker = { text: m.text, toasted: false }; });
    b.on('money', onMoney);
    b.on('goal', function (g) {
      UI.banner({ title: 'Goal complete!', text: g.text + '  Reward ' + fmt(g.reward), kind: 'good' }); UI.confetti(); UI.snd('fanfare'); lastHud.goal = '';
    });
    b.on('escape', function (a) {
      if (!a) return; var sp = UI.sp(a.species);
      UI.banner({ title: 'Escape!', text: (a.name || 'An animal') + ' the ' + (sp ? sp.name.toLowerCase() : 'animal') + ' has broken out!', kind: 'alert', jump: function () { UI.jumpTo('animal', a.id); } });
      UI.snd('alarm');
    });
    b.on('fenceBreach', function (ev) {
      if (!ev) return;
      UI.banner({ title: '⚠️ Fence Broken!', text: (ev.name || 'An enclosure') + ' has a broken fence panel!', kind: 'alert', jump: function () { if (isFinite(ev.x) && isFinite(ev.z)) Z.World.focus(ev.x, ev.z, 24); if (UI.Panel) UI.Panel.open('enclosure', ev.encId); } });
      UI.snd('alarm');
    });
    b.on('fenceFixed', function (ev) {
      if (!ev) return;
      UI.toast((ev.name ? ev.name + ' fence repaired' : 'Fence repaired') + (ev.by ? ' (' + ev.by + ')' : '') + '.', 'good');
    });
    b.on('birth', function (a) {
      if (!a) return; var sp = UI.sp(a.species);
      UI.banner({ title: 'A baby ' + (sp ? sp.name.toLowerCase() : 'animal') + '!', text: (a.name || 'It') + ' was born. Congratulations!', kind: 'good', jump: function () { UI.jumpTo('animal', a.id); } }); UI.snd('good');
    });
    b.on('predation', function (e) { if (e && e.prey) UI.toast('A predator has caught its prey!', 'bad'); });
    b.on('injury', function (e) { UI.snd('alarm'); });
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
    if (!p) return;
    if (isFinite(p.x) && isFinite(p.z)) Z.World.focus(p.x, p.z, Math.min(Z.World.cam.dist, 26));
    if (UI.Panel && !UI.tool) UI.Panel.open(kind, id);
  };
  UI.gameOver = function () {
    var S = Z.state;
    var m = h('div.bn.alert', { style: 'position:fixed;left:50%;top:30%;transform:translateX(-50%);width:min(88vw,360px);z-index:40;pointer-events:auto' },
      h('h3', { text: 'The bank has called in your debts' }), h('p', { text: 'You reached day ' + S.day + ' with ' + S.stats.guestsTotal + ' guests through the gates. Every park owner has a rough season.' }),
      h('div.row', h('button.btn.gold', { text: 'Try again', on: { click: function () { m.remove(); if (Z.Main.openSetup) Z.Main.openSetup(); else Z.Main.newGame(); } } }), h('button.btn.alt', { text: 'Keep looking', on: { click: function () { m.remove(); } } })));
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
      upT = 0; updateCash(0.25); updateHud(); updateAfford(); UI.updateUndo(); if (UI.Research && UI.Research.tick) UI.Research.tick();
      if (UI.Panel) UI.Panel.update(); if (UI.Screens) UI.Screens.update(); if (UI.Tutorial) UI.Tutorial.update(); if (UI.Tools) UI.Tools.update();
    }
  };
  UI.init = function () {
    buildDOM(); defCats(); buildTabs(); hookBus();
    if (UI.Tools) UI.Tools.init(); if (UI.Panel) UI.Panel.init(); if (UI.Screens) UI.Screens.init(); if (UI.Tutorial) UI.Tutorial.init(); if (UI.Research) UI.Research.init();
    UI.reset();
  };
  UI.reset = function () { lastHud = {}; cashShown = null; updateHud(); updateCash(1); };
  UI.setBuildHidden = function (b) { el.build.classList.toggle('hide', b); };
})();


