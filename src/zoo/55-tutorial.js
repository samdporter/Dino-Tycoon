// ===== 55-tutorial.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - guided tutorial that advances by detecting what the player actually does. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, N = Z.N;
  Z.bus.on('gridsize', function (n) { N = n; });
  var Tut = UI.Tutorial = {}, userMin = null, effMin = false, el, on = false, step = 0, hlEls = [], base = {}, doneAll = false;

  function S() { return Z.state; }
  function encWithAnimals() { return S().enclosures.filter(function (e) { return e.animals.length; })[0] || null; }
  function lastEnc() { var e = S().enclosures; return e.length ? e[e.length - 1] : null; }
  function tab(id) { return el.tabs.querySelector('[data-cat="' + id + '"]'); }
  function card(id) { return el.cards.querySelector('[data-id="' + id + '"]'); }
  function ifCat(c, cardId) { return UI.cat === c ? (card(cardId) || null) : tab(c); }

  var STEPS = [
    { t: 'Build a home', x: 'Open <b>Fences</b> and pick <b>Chain-link</b> (strong enough for most animals). Keep <b>Enclosure</b> mode on, then <b>drag a rectangle</b> on the grass next to the path.',
      hl: function () { var t = UI.tool; if (t && t.kind === 'fence') return t.mode === 'rect' ? null : el.strip.querySelector('.seg button'); return ifCat('fences', 'chainlink'); },
      done: function () { return S().enclosures.length > (base.enc || 0); } },
    { t: 'Paint the ground', x: 'Animals feel at home on the right ground. Open <b>Terrain</b>, pick <b>Savannah</b> and paint over your enclosure. Drag to paint, and pick a bigger brush to go faster.',
      hl: function () { var t = UI.tool; if (t && t.kind === 'terrain') return null; return ifCat('terrain', 'savannah'); },
      done: function () { var e = lastEnc(); if (!e) return false; var n = 0, T = S().terrain; e.tiles.forEach(function (t) { if (T[t] !== 0) n++; }); return n >= e.tiles.length * 0.5; } },
    { t: 'Adopt animals', x: 'Open <b>Animals</b>, tap an <b>Ostrich</b> (an easy starter), then press <b>Adopt</b> beside your enclosure. Two or more keeps them company.',
      hl: function () { if (document.getElementById('sheet').classList.contains('on')) return null; return ifCat('animals', 'ostrich'); },
      done: function () { return S().animals.some(function (a) { return a.enc; }); } },
    { t: 'Make it comfy', x: 'Tap your <b>enclosure</b> (the ground inside the fence) to read its report, then add what it asks for from <b>Plants &amp; rocks</b> or <b>Enclosure</b>. Try a couple of acacia trees.',
      hl: function () { var t = UI.tool; if (t) return null; return ifCat('plants', 'acacia'); },
      done: function () {
        var e = encWithAnimals(); if (!e) return false; var n = 0, s = S();
        s.objects.forEach(function (o) { if (o.kind === 'scenery' && s.tileEnc[o.i + o.j * N] === e.id) n++; });
        var best = 0; for (var k in e.suitability) best = Math.max(best, e.suitability[k]);
        return n >= 2 || best >= 0.75;
      } },
    { t: 'Connect a path', x: 'Guests only see animals from a path. Use <b>Paths</b> to lay a path from the main walkway so it runs <b>right beside your fence</b>.',
      hl: function () { if (UI.tool) return null; return ifCat('paths', 'paved'); },
      done: function () { var e = encWithAnimals(); return !!e && e.viewTiles && e.viewTiles.length > 0; } },
    { t: 'Hire a keeper', x: 'Keepers feed the animals and clean up. Open <b>Staff</b>, choose <b>Keeper</b>, then tap any path tile.',
      hl: function () { if (UI.tool) return null; return ifCat('staff', 'keeper'); },
      done: function () { return S().staff.some(function (s) { return s.type === 'keeper'; }); } },
    { t: 'Feed your guests', x: 'Hungry guests spend money! Open <b>Facilities</b> and place a <b>Burger stand</b> or <b>Drinks stall</b> right next to a path.',
      hl: function () { if (UI.tool) return null; return ifCat('fac', 'burger_stand'); },
      done: function () { return S().objects.some(function (o) { return o.kind === 'building' && /^(burger_stand|pizza_hut|ice_cream|drinks_stall|coffee_cart)$/.test(o.type); }); } },
    { t: 'Open the gates', x: 'The zoo opens at <b>08:00</b>. Press the fast-forward button and watch your first guests arrive. Tap one to see what they think.',
      hl: function () { return el.speed; },
      done: function () { return S().stats.guestsTotal >= (base.guests || 0) + 4; } }
  ];

  Tut.init = function () {
    el = UI.el;
    Z.bus.on('reset', function () { if (on) stop(); });
  };
  Tut.active = function () { return on; };
  function mute() { try { return localStorage.getItem('wazoo_tut') === '1'; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem('wazoo_tut', '1'); } catch (e) { } }
  Tut.startIfNew = function () { if (!mute()) Tut.restart(); };
  Tut.restart = function () {
    on = true; step = 0; doneAll = false; userMin = null; el.tut.classList.add('on');
    base = { enc: S().enclosures.length, guests: S().stats.guestsTotal };
    render(); Tut.update();
  };
  function stop() { on = false; el.tut.classList.remove('on'); clearHl(); }
  function clearHl() { hlEls.forEach(function (e) { e.classList.remove('hl'); }); hlEls = []; }
  function wantMin() { return userMin === null ? (UI.narrow() && !!UI.tool) : userMin; }
  function render() {
    var s = STEPS[step]; el.tut.innerHTML = ''; var min = wantMin(); effMin = min;
    var dots = h('div.dots'); STEPS.forEach(function (_, i) { dots.appendChild(h('i' + (i < step ? '.d' : i === step ? '.c' : ''))); });
    el.tut.classList.toggle('min', min);
    el.tut.appendChild(h('div.th', h('span', { text: 'Step ' + (step + 1) + ' of ' + STEPS.length + (min ? ': ' + s.t : '') }), dots, h('button.tx', { html: ic(min ? 'down' : 'up'), 'aria-label': 'Collapse tips', on: { click: function () { userMin = !min; render(); highlight(); } } }), h('button.tx', { html: ic('close'), 'aria-label': 'Close tutorial', on: { click: function () { remember(); stop(); UI.toast('Tutorial closed. Replay it from Settings any time.', 'info'); } } })));
    if (!min) { el.tut.appendChild(h('p', { html: '<b>' + s.t + '.</b> ' + s.x })); el.tut.appendChild(h('div.tr', h('button.btn.sm.alt', { text: step === STEPS.length - 1 ? 'Finish' : 'Skip step', on: { click: function () { UI.snd('click'); advance(true); } } }))); }
  }
  function advance(skipped) {
    if (!on) return;
    if (!skipped) { UI.toast(step === STEPS.length - 1 ? 'Tutorial complete! Check Goals in the menu for what to do next.' : 'Nice work! Next step.', 'good'); }
    step++;
    if (step >= STEPS.length) { remember(); stop(); if (!skipped) { UI.confetti(60); } return; }
    if (step === STEPS.length - 1) base.guests = S().stats.guestsTotal;
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
    if (on) highlight();
  };
  Tut.onCat = Tut.onTool = Tut.onSheet = Tut.onModal = Tut.onBuilt = function () { if (on) setTimeout(function () { Tut.update(); }, 30); };
})();
