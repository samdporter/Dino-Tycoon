// ===== 53-screen-shell.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Shared modal framing, tabs and refresh lifecycle for Dino and Zoo screens. */
(function () {
  'use strict';
  Z.createScreenShell = function (UI, options) {
    var Screens = options.screens, h = UI.h, ic = UI.ic;
    var el, tabEls = {}, curTab = null, tabUpdate = null, pausedBy = false, pressing = false, tick = 0;
    function init() {
      el = UI.el; var m = el.modal; m.innerHTML = '';
      var tabs = h('div#mtabs');
      options.tabs.forEach(function (t) {
        var b = h('button', { html: ic(t[2]) + '<span>' + t[1] + '</span>', 'data-t': t[0], on: { click: function () { UI.snd('click'); Screens.open(t[0]); } } });
        tabEls[t[0]] = b; tabs.appendChild(b);
      });
      el.mbody = h('div#mbody');
      var box = h('div#mbox', h('div#mhead', tabs, h('button#mclose', { html: ic('close'), 'aria-label': 'Close', on: { click: function () { UI.snd('click'); UI.closeModal(); } } })), el.mbody);
      m.appendChild(box);
      m.addEventListener('pointerdown', function (e) { if (e.target === m) UI.closeModal(); else pressing = true; });
      window.addEventListener('pointerup', function () { pressing = false; });
      window.addEventListener('pointercancel', function () { pressing = false; });
    }
    function modalOpen() { return el && el.modal.classList.contains('on'); }
    function openModal(tab) {
      var S = Z.state;
      if (!modalOpen()) { if (S.speed > 0) { UI.lastSpeed = S.speed; Z.Sim.setSpeed(0); pausedBy = true; } else pausedBy = false; }
      if (UI.Panel) UI.Panel.closeSheet();
      if (options.beforeOpen) options.beforeOpen();
      el.modal.classList.add('on'); UI.unread = 0; Screens.open(tab || 'ov');
    }
    function closeModal() {
      if (!modalOpen()) return;
      el.modal.classList.remove('on'); curTab = null; tabUpdate = null; el.mbody.innerHTML = '';
      if (pausedBy && Z.state.speed === 0 && !Z.state.gameOver) Z.Sim.setSpeed(UI.lastSpeed || 1);
      pausedBy = false;
    }
    function open(tab) {
      curTab = tab; for (var k in tabEls) tabEls[k].classList.toggle('on', k === tab);
      el.mbody.innerHTML = ''; el.mbody.scrollTop = 0; tabUpdate = options.build(tab, el.mbody) || null;
      var b = tabEls[tab]; if (b && b.scrollIntoView) { try { b.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { } }
      if (UI.Tutorial) UI.Tutorial.onModal && UI.Tutorial.onModal(tab);
    }
    function update() {
      if (!modalOpen() || !tabUpdate) return;
      tick++; if (tick % 4 !== 0 || pressing) return;
      var sc = el.mbody.scrollTop; tabUpdate(); el.mbody.scrollTop = sc;
    }
    return { init: init, modalOpen: modalOpen, openModal: openModal, closeModal: closeModal, open: open, update: update };
  };
})();
