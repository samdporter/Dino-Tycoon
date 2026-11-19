// ===== 55-tutorial.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - guided tutorial that advances by detecting what the player actually does. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, N = Z.N;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; });
  var Tut = UI.Tutorial = {}, userMin = null, effMin = false, el, on = false, step = 0, hlEls = [], base = {}, doneAll = false;

  function S() { return Z.state; }
  function encWithAnimals() { return S().enclosures.filter(function (e) { return e.animals.length; })[0] || null; }
  function lastEnc() { var e = S().enclosures; return e.length ? e[e.length - 1] : null; }
  function tab(id) { var b = el.tabs.querySelector('[data-cat="' + id + '"]'); if (b && b.offsetParent === null && UI.groupBtn) b = UI.groupBtn(id) || b; return b; }   // chip hidden inside a closed group: point at the group
  function card(id) { return el.cards.querySelector('[data-id="' + id + '"]'); }
  function ifCat(c, cardId) { return UI.cat === c ? (card(cardId) || null) : tab(c); }

  var flags = {};
  function resOpen() { return UI.modalOpen && UI.modalOpen() && UI.Research && document.querySelector('.rsubs'); }
  function qs(sel) { return document.querySelector(sel); }
  function terrainCount(e, ids) { var n = 0, T = S().terrain; e.tiles.forEach(function (t) { var d = Z.DATA.terrain[T[t]]; if (d && ids.indexOf(d.id) >= 0) n++; }); return n; }
  var FOLIAGE = ['fern', 'horsetail', 'ginkgo', 'cycad', 'tree_fern'];

  var STEPS = [
    { t: 'Visit the lab', x: 'Amber Acres is an island and it runs on science. Tap the glowing <b>flask</b> button (or tap the lab building) to open <b>Research</b>.',
      hl: function () { return resOpen() ? null : el.bRes; }, done: function () { return !!flags.lab; } },
    { t: 'Run your first extraction', x: 'You start with three amber samples. Pick one, press <b>Run extraction</b>, check the odds, then <b>Start</b>: your first one always works. It gives DNA <b>fragments</b>, not a genome. Free scientists <b>sequence</b> them in the background, and <b>Help sequence</b> plays a short puzzle for a boost.',
      hl: function () { if (!resOpen()) return el.bRes; return qs('.rflow .btn.gold') || qs('.rcard.smp .btn') || qs('.rsubs button'); },
      done: function () { return S().research.stats.experiments + S().research.jobs.filter(function (j) { return j.kind === 'extract'; }).length > (base.exp || 0); } },
    { t: 'Build a home', x: 'Close the lab and open <b>Fences</b>. Pick <b>Chain-link</b> (strength 3; a Dryosaurus needs 2), keep <b>Enclosure</b> mode on, then <b>drag a small rectangle</b>, about six tiles square, on land beside the path.',
      hl: function () { var t = UI.tool; if (t && t.kind === 'fence') return t.mode === 'rect' ? null : el.strip.querySelector('.seg button'); return ifCat('fences', 'chainlink'); },
      done: function () { return S().enclosures.length > (base.enc || 0); } },
    { t: 'Paint a forest floor', x: 'Dryosaurus loves <b>forest</b> and grass. Open <b>Terrain</b>, pick <b>Forest</b> and paint over most of your enclosure.',
      hl: function () { var t = UI.tool; if (t && t.kind === 'terrain') return null; return ifCat('terrain', 'forest'); },
      done: function () { var e = lastEnc(); return !!e && terrainCount(e, ['forest', 'grass']) >= e.tiles.length * 0.6 && terrainCount(e, ['forest']) >= e.tiles.length * 0.3; } },
    { t: 'Plant some ferns', x: 'It also nibbles <b>ferns</b> and <b>horsetails</b>. Open <b>Plants &amp; rocks</b> and plant two or three inside the fence. Other species need a pond or a shelter: the Guide lists what each one wants.',
      hl: function () { var t = UI.tool; if (t) return null; return ifCat('plants', 'fern'); },
      done: function () { var e = lastEnc(); if (!e) return false; var n = 0, s = S(); s.objects.forEach(function (o) { if (o.kind === 'scenery' && FOLIAGE.indexOf(o.type) >= 0 && s.tileEnc[o.i + o.j * N] === e.id) n++; }); return n >= 2; } },
    { t: 'Hatch a Dryosaurus', x: 'Open <b>Hatch</b>, tap <b>Dryosaurus</b> (its genome is already above 50%), and press <b>Hatch</b> inside your enclosure. Your first two hatches are guaranteed.',
      hl: function () { if (document.getElementById('sheet').classList.contains('on')) return null; return ifCat('hatch', 'dryosaurus'); },
      done: function () { var r = S().research; return r.eggs.length > 0 || S().animals.some(function (a) { return a.species === 'dryosaurus'; }); } },
    { t: 'Lay a path', x: 'Guests only see dinosaurs from a path. Use <b>Paths</b> to run one from the walkway <b>right beside your fence</b>.',
      hl: function () { if (UI.tool) return null; return ifCat('paths', 'paved'); },
      done: function () { var e = lastEnc(); return !!e && e.viewTiles && e.viewTiles.length > 0; } },
    { t: 'Hire a ranger', x: 'Rangers feed the dinosaurs and clean up. Open <b>Staff</b>, choose <b>Ranger</b> and tap a path tile.',
      hl: function () { if (UI.tool) return null; return ifCat('staff', 'keeper'); },
      done: function () { return S().staff.some(function (s) { return s.type === 'keeper'; }); } },
    { t: 'Toilets and bins', x: 'Guests need somewhere to go before anything else. Open <b>Facilities</b> and place <b>Toilets</b> on the path. The amber <b>ENTRANCE</b> marker must face the path (press <b>R</b> or <b>Rotate</b>). Add a <b>Litter bin</b> from Decor beside the path too: inspectors fine parks without one.',
      hl: function () { if (UI.tool) return null; return ifCat('fac', 'toilets'); },
      done: function () { return S().objects.some(function (o) { return o.kind === 'building' && o.type === 'toilets'; }); } },
    { t: 'Feed your guests', x: 'Now a <b>Burger stand</b> or <b>Drinks stall</b> from <b>Facilities</b>, again with the entrance facing a path. Hungry guests spend.',
      hl: function () { if (UI.tool) return null; return ifCat('fac', 'burger_stand'); },
      done: function () { return S().objects.some(function (o) { return o.kind === 'building' && /^(burger_stand|pizza_hut|ice_cream|drinks_stall|coffee_cart)$/.test(o.type); }); } },
    { t: 'Keep the lights on', x: 'The lab, shops and electric fences run on one cable from the mainland, and storms can cut it. Open the <b>menu</b> and look at the <b>Power</b> tab. A backup generator and a battery bank keep fences live.',
      hl: function () { return UI.modalOpen && UI.modalOpen() ? null : el.menu; }, done: function () { return !!flags.power; } },
    { t: 'Reinvest in amber', x: 'Press play and let the gates open. When cash comes in, open <b>Research</b> then <b>Amber</b> and buy a new sample: more species mean more guests.',
      hl: function () { if (resOpen()) return qs('.rcard.lot .btn') || qs('.rsubs button:nth-child(2)'); return el.bRes; },
      done: function () { return !!flags.bought; } },
    { t: 'Fix mistakes', x: 'Placed something in the wrong spot? Place anything (a bench will do), then tap <b>Undo</b> (the amber button above the build bar) or press <b>Z</b>. It gives your money back.',
      hl: function () { return el.undo && el.undo.style.display !== 'none' ? el.undo : null; },
      done: function () { return !!flags.undo; } },
    { t: 'Watch the Masterclass', x: 'Want to see a whole park played well and badly? <b>Masterclass</b> has example games with captions on every move. Find it on the title screen or in the <b>Guide</b> tab.',
      btn: { t: 'Open Masterclass', fn: function () { flags.mc = true; if (UI.Masterclass) UI.Masterclass.open(); } },
      hl: function () { return null; }, done: function () { return !!flags.mc; } }
  ];

  Tut.init = function () {
    el = UI.el;
    Z.bus.on('reset', function () { if (on) stop(); });
  };
  Tut.active = function () { return on; };
  Tut.wantsUndo = function () { return on && !!STEPS[step] && STEPS[step].t === 'Fix mistakes'; };
  function mute() { try { return localStorage.getItem('amberacres_tut') === '1'; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem('amberacres_tut', '1'); } catch (e) { } }
  Tut.startIfNew = function () { if (!mute()) Tut.restart(); };
  Tut.restart = function () {
    on = true; step = 0; doneAll = false; userMin = null; el.tut.classList.add('on');
    flags = {}; base = { enc: S().enclosures.length, guests: S().stats.guestsTotal, exp: S().research.stats.experiments + S().research.jobs.filter(function (j) { return j.kind === 'extract'; }).length };
    render(); Tut.update();
  };
  function stop() { on = false; el.tut.classList.remove('on'); clearHl(); }
  function clearHl() { hlEls.forEach(function (e) { e.classList.remove('hl'); }); hlEls = []; }
  function wantMin() { return userMin === null ? (UI.narrow() && !!UI.tool) : userMin; }
  function render() {
    var s = STEPS[step]; el.tut.innerHTML = ''; var min = wantMin(); effMin = min;
    var dots = h('div.dots'); STEPS.forEach(function (_, i) { dots.appendChild(h('i' + (i < step ? '.d' : i === step ? '.c' : ''))); });
    el.tut.classList.toggle('min', min);
    el.tut.appendChild(h('div.th', h('span', { text: 'Step ' + (step + 1) + '/' + STEPS.length + (min ? ': ' + s.t : '') }), dots, h('button.tx', { html: ic(min ? 'down' : 'up'), 'aria-label': 'Collapse tips', on: { click: function () { userMin = !min; render(); highlight(); } } }), h('button.tx', { html: ic('close'), 'aria-label': 'Close tutorial', on: { click: function () { remember(); stop(); UI.toast('Tutorial closed. Replay it from Settings any time.', 'info'); } } })));
    if (!min) { el.tut.appendChild(h('p', { html: '<b>' + s.t + '.</b> ' + s.x })); el.tut.appendChild(h('div.tr', s.btn ? h('button.btn.sm.gold', { text: s.btn.t, on: { click: function () { UI.snd('click'); s.btn.fn(); advance(false); } } }) : null, h('button.btn.sm.alt', { text: step === STEPS.length - 1 ? 'Finish' : 'Skip step', on: { click: function () { UI.snd('click'); advance(true); } } }))); }
  }
  function advance(skipped) {
    if (!on) return;
    if (!skipped) { UI.toast(step === STEPS.length - 1 ? 'Tutorial complete! Check Goals in the menu for what to do next.' : 'Nice work! Next step.', 'good'); }
    step++;
    if (step >= STEPS.length) { remember(); stop(); if (!skipped) { UI.confetti(60); } return; }
    render(); highlight();
  }
  function highlight() {
    clearHl(); if (!on) return;
    var t = null; try { t = STEPS[step].hl(); } catch (e) { }
    if (t) { t.classList.add('hl'); hlEls.push(t); }
  }
  Tut.update = function () {
    if (!on) return;
    var guard = 0;
    while (on && guard++ < 4 && STEPS[step].done()) { advance(false); }
    if (on && wantMin() !== effMin) render();
    if (on && UI.updateUndo) UI.updateUndo();   // the Undo button stays up while its step is current
    if (on) highlight();
  };
  Tut.onResearch = function () { flags.lab = true; Tut.onCat(); };
  Tut.onBuyAmber = function () { flags.bought = true; Tut.onCat(); };
  Tut.onExtract = function () { setTimeout(Tut.update, 30); };
  Tut.onUndo = function () { flags.undo = true; setTimeout(Tut.update, 30); };
  Tut.onModal = function (t) { if (t === 'power') flags.power = true; if (on) setTimeout(function () { Tut.update(); }, 30); };
  Tut.onCat = Tut.onTool = Tut.onSheet = Tut.onBuilt = function () { if (on) setTimeout(function () { Tut.update(); }, 30); };
})();


