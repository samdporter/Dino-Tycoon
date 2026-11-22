// ===== 51-input.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Shared pointer math and keyboard dispatch for the game tools. */
(function () {
  'use strict';
  Z.GestureMath = {
    points: function (ptrs) { var a = []; for (var k in ptrs) a.push(ptrs[k]); return a; },
    distance: function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },
    angle: function (a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
  };
  Z.handleGameKey = function (e, options) {
    var UI = options.UI, Tools = options.Tools, keys = options.keys;
    var tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) { if (e.key === 'Escape') tg.blur(); return; }
    if (UI.titleOpen) return;
    var k = e.key.toLowerCase();
    if (options.beforeKey && options.beforeKey(e, k)) return;
    UI.snd('unlock');
    if ((e.ctrlKey || e.metaKey) && k === 'z') { if (!(UI.modalOpen && UI.modalOpen())) { UI.doUndo(); e.preventDefault(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var S = Z.state;
    if (k === 'escape') { options.escape(); e.preventDefault(); return; }
    if (UI.modalOpen && UI.modalOpen()) return;
    if (k === ' ') { UI.setSpeed(S.speed === 0 ? (UI.lastSpeed || 1) : 0); if (S.speed) UI.lastSpeed = S.speed; e.preventDefault(); return; }
    if (k === '1') UI.setSpeed(1); else if (k === '2') UI.setSpeed(2); else if (k === '3') UI.setSpeed(4);
    else if (k === 'r') Tools.rotate();
    else if (k === 'z') UI.doUndo();
    else if (k === 'b') UI.openCat('bull', true);
    else if (k === 'h') UI.hideUI(!UI.el.root_hidden && !document.getElementById('ui').classList.contains('ui-hidden'));
    else if (k === '+' || k === '=') Z.World.zoom(0.8); else if (k === '-' || k === '_') Z.World.zoom(1.25);
    else if (k === 'm') Tools.toggleMove();
    else if ('wasdqe'.indexOf(k) >= 0 || k.indexOf('arrow') === 0) { keys[k] = 1; e.preventDefault(); }
  };
})();
