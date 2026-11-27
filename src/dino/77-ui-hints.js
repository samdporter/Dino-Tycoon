// ===== 77-ui-hints.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* First-time hints: one banner per new system (moats, marine, aviary, tagging, power, monorail, safari, donors, hybrids), shown once,
   remembered in the settings store (Main.pref('hints')), pointing at the Guide section and the relevant Masterclass.
   Never while a modal, the title, a puzzle, street view or a Masterclass is open; at most one every 30 s so an old save does not get a pile. */
(function () {
  'use strict';
  var UI = Z.UI, SAFE_GAP = 30000;
  var MC1 = 'the Masterclass “Moats, Power and Keeping Giants In”', MC2 = 'the Masterclass “Sea, Sky and the Lab”';
  function guide(k) { return function () { UI.Guide && UI.Guide.openSection(k); }; }
  var HINTS = [
    { id: 'moats', star: 2, title: 'New: moats', text: 'A ditch keeps animals in without a fence, and water makes it stronger. See the Guide, and ' + MC1 + '.', go: guide('moats') },
    { id: 'monorail', star: 2, title: 'New: monorail', text: 'An elevated line carries guests over fences and rivers. See the Guide, and ' + MC2 + '.', go: guide('monorail') },
    { id: 'marine', star: 2, title: 'New: marine reptiles', text: 'Sea animals are not dinosaurs: they need tanks or sea pens. See the Guide, and ' + MC2 + '.', go: guide('sea') },
    { id: 'aviary', star: 3, title: 'New: aviary', text: 'Pterosaurs need an Aviary. See the Guide, and ' + MC2 + '.', go: guide('air') },
    { id: 'tagging', star: 3, title: 'New: tagging', text: 'Virtual zones hold animals with no fence, if the power holds. See the Guide, and ' + MC2 + '.', go: guide('tags') },
    { id: 'safari', star: 3, title: 'New: safari', text: 'Take guests into a zone by truck, boat or balloon. See the Guide, and ' + MC2 + '.', go: guide('safari') },
    { id: 'themepark', star: 1, title: 'New: Theme Park & Coasters', text: 'Build custom rollercoasters, prebuilt rides, arcade stalls and fairground treats from Guests → Theme Park & Coasters.', go: function () { UI.openCat && UI.openCat('themepark'); } },
    { id: 'power', event: 'power', title: 'Power matters', text: 'Fences, labs and tagging towers all need it. Open the Power tab in the menu, and see ' + MC1 + '.', go: function () { UI.openModal('power'); } },
    { id: 'donors', event: 'donorBatch', title: 'Donor DNA', text: 'Modern animals give single traits to a dinosaur. Sequence the sample, then splice it in the Lab. See ' + MC2 + '.', go: function () { UI.Research && UI.Research.open(); } },
    { id: 'hybrids', check: function () { var g = Z.state.research && Z.state.research.genomes, n = 0, k; if (!g) return false; for (k in g) { var sp = UI.sp ? UI.sp(k) : null; if (g[k] >= 80 && sp && !sp.modern) n++; } return n >= 2; }, title: 'New: hybrids', text: 'Two well-sequenced species can be combined into a new one in the Lab. See ' + MC2 + '.', go: function () { UI.Research && UI.Research.open(); } }
  ];
  var queue = [], lastShown = 0, fired = {};
  function seen() { var p = Z.Main && Z.Main.pref && Z.Main.pref('hints'); return p || {}; }
  function mark(id) { var p = seen(); p[id] = 1; if (Z.Main && Z.Main.pref) Z.Main.pref('hints', p); }
  function want(h) { fired[h.id] = 1; if (!seen()[h.id] && queue.indexOf(h) < 0) queue.push(h); }
  function calm() { return Z.Main && Z.Main.playing && !(UI.Tutorial && UI.Tutorial.active && UI.Tutorial.active()) && !Z.Main.watching && !UI.titleOpen && !(UI.modalOpen && UI.modalOpen()) && !(UI.Minigames && UI.Minigames.isOpen && UI.Minigames.isOpen()) && !(UI.SV && UI.SV.active) && !(Z.state && Z.state.gameOver) && !document.querySelector('#banner .bn:not(.out)'); }   // never on top of another banner (star level, story)
  function pump() {
    if (!Z.state || !Z.state.unlocked) return;
    HINTS.forEach(function (h) {
      if (fired[h.id] || seen()[h.id]) return;
      if (h.star && Z.state.unlocked.star >= h.star) want(h);
      else if (h.check) { try { if (h.check()) want(h); } catch (e) { } }
    });
    if (!queue.length || !calm() || Date.now() - lastShown < SAFE_GAP) return;
    var h = queue.shift(); lastShown = Date.now(); mark(h.id);
    UI.banner({ title: h.title, text: h.text, kind: 'good', ms: 12000, jump: function () { try { h.go(); } catch (e) { } } });
  }
  HINTS.forEach(function (h) { if (h.event) Z.bus.on(h.event, function (e) { if (h.id === 'power' && !(e && e.on === false)) return; if (Z.state && Z.state.unlocked && Z.state.unlocked.star >= 1) want(h); else want(h); }); });
  Z.bus.on('reset', function () { fired = {}; queue.length = 0; lastShown = Date.now() - SAFE_GAP + 8000; });
  setInterval(pump, 2000);
  UI.Hints = { list: HINTS, pump: pump, seen: seen, reset: function () { if (Z.Main && Z.Main.pref) Z.Main.pref('hints', {}); fired = {}; queue.length = 0; } };
})();
