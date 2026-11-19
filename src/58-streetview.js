// ===== 58-streetview.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - street view UI: slim overlay bar, controls routing (look / walk / tap-to-walk), jump list. World side: Z.World.setStreetView. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, N = Z.N, T = Z.TILE;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; });
  var SV = UI.SV = { active: false }, el = {}, keys = {}, ptr = {}, np = 0, pinch = 0, multi = false, fwdHeld = false, lastBearing = -999, hintT = 0, world = null, wasHidden = false;
  var CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  function bearingOf(yaw) { var b = 180 - yaw * 180 / Math.PI; b = ((b % 360) + 360) % 360; return b; }
  SV.build = function () {
    var root = UI.$('#ui'); if (!root || el.bar) return;
    el.sel = h('select.svsel', { 'aria-label': 'Jump to', on: { change: onJump, focus: fillJump, mousedown: fillJump } });
    el.dial = h('div.svdial', { html: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="rgba(255,255,255,.35)" stroke="currentColor" stroke-width="1.6"/><g class="dg"><path d="M20 4.5l4.2 15.5h-8.4z" fill="#c4553a"/><path d="M20 35.5l4.2-15.5h-8.4z" fill="#6b5a40"/><circle cx="20" cy="20" r="2" fill="#f8f0da"/></g></svg>' });
    el.dg = UI.$('.dg', el.dial); el.head = h('span.svhead', { text: 'N 0°' });
    el.exit = h('button.btn.sm.warn.svexit', { html: ic('close') + '<span>Exit</span>', 'aria-label': 'Exit street view', on: { click: function () { UI.snd('click'); SV.exit(); } } });
    el.bar = h('div#svbar.pill', h('div.svt', { html: ic('eye') + '<b>Street view</b>' }), h('div.svcomp', el.dial, el.head), el.sel, el.exit);
    el.hint = h('div#svhint', { text: UI.touch() ? 'Drag to look around  ·  Tap the ground to walk there  ·  Hold the arrow to walk' : 'Drag to look  ·  W A S D to walk, Shift to run  ·  Click the ground to walk there  ·  Scroll to zoom  ·  Esc to exit' });
    el.fwd = h('button#svfwd.pill', { html: ic('up'), 'aria-label': 'Walk forward (hold)' });
    ['pointerdown'].forEach(function (t) { el.fwd.addEventListener(t, function (e) { e.preventDefault(); fwdHeld = true; try { el.fwd.setPointerCapture(e.pointerId); } catch (er) { } el.fwd.classList.add('on'); }); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { el.fwd.addEventListener(t, function () { fwdHeld = false; el.fwd.classList.remove('on'); }); });
    el.flash = h('div#svflash');
    [el.bar, el.hint, el.fwd, el.flash].forEach(function (e) { root.appendChild(e); });
    world = document.getElementById('world');
  };

  // ------------------------------------------------------------ enter / exit
  SV.enter = function (x, z, yaw) {
    if (SV.active || UI.titleOpen || !Z.state || !Z.World.setStreetView) return;
    if (UI.tool && UI.Tools) UI.Tools.cancel(true);
    if (UI.Panel && UI.Panel.hide) UI.Panel.hide(true);
    if (UI.modalOpen && UI.modalOpen() && UI.closeModal) UI.closeModal();
    Z.World.setStreetView(true, x, z, yaw);
  };
  SV.exit = function () { if (SV.active) Z.World.setStreetView(false); };
  function activate(on) {
    if (on === SV.active) return;
    var root = UI.$('#ui');
    SV.active = on; ptr = {}; np = 0; keys = {}; fwdHeld = false; multi = false;
    document.body.classList.toggle('sv-on', on);
    if (on) {
      if (UI.Tools && UI.tool) UI.Tools.cancel(true);
      wasHidden = root.classList.contains('ui-hidden'); root.classList.remove('ui-hidden');
      fillJump(); lastBearing = -999; hintT = 9; el.hint.classList.add('on');
    } else {
      if (wasHidden) root.classList.add('ui-hidden');
      el.hint.classList.remove('on');
    }
  }

  // ------------------------------------------------------------ jump list
  function fillJump() {
    var S = Z.state, cur = el.sel.value; el.sel.innerHTML = '';
    el.sel.appendChild(h('option', { value: '', text: 'Jump to…' }));
    el.sel.appendChild(h('option', { value: 'gate', text: 'Park entrance' }));
    if (S && S.enclosures) S.enclosures.forEach(function (e) {
      var n = (e.animals && e.animals.length) || 0;
      el.sel.appendChild(h('option', { value: 'enc:' + e.id, text: (e.name || 'Enclosure') + (n ? ' (' + n + ' animal' + (n > 1 ? 's' : '') + ')' : ' (empty)') }));
    });
    el.sel.value = '';
  }
  // a spot on the viewing side of an enclosure: the nearest path tile within 3 tiles of it (else any free neighbouring tile)
  function encCenter(enc) {
    var cx = enc.cx, cz = enc.cz, tl = enc.tiles;
    if ((!isFinite(cx) || !isFinite(cz)) && tl && tl.length) {
      var sx = 0, sz = 0;
      for (var k = 0; k < tl.length; k++) { sx += ((tl[k] % N) + 0.5) * T; sz += (((tl[k] / N) | 0) + 0.5) * T; }
      cx = sx / tl.length; cz = sz / tl.length;
    }
    return { x: isFinite(cx) ? cx : N * T / 2, z: isFinite(cz) ? cz : N * T / 2 };
  }
  function viewSpot(enc) {
    var S = Z.state, tiles = enc.tiles || [], i0 = N, j0 = N, i1 = 0, j1 = 0, k;
    if (!tiles.length) return null;
    for (k = 0; k < tiles.length; k++) { var ti = tiles[k] % N, tj = (tiles[k] / N) | 0; if (ti < i0) i0 = ti; if (ti > i1) i1 = ti; if (tj < j0) j0 = tj; if (tj > j1) j1 = tj; }
    var ctr = encCenter(enc), best = null, bd = 1e9, R = 3, cx = ctr.x, cz = ctr.z;
    for (var j = Math.max(0, j0 - R); j <= Math.min(N - 1, j1 + R); j++) for (var i = Math.max(0, i0 - R); i <= Math.min(N - 1, i1 + R); i++) {
      var idx = i + j * N; if (S.tileEnc[idx] === enc.id) continue;
      var isPath = !!S.path[idx]; if (!isPath && (S.tileObj && S.tileObj[idx])) continue;
      var near = 99;
      for (var dj = -R; dj <= R; dj++) for (var di = -R; di <= R; di++) { var a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue; if (S.tileEnc[a + b * N] === enc.id) near = Math.min(near, Math.max(Math.abs(di), Math.abs(dj))); }
      if (near > R) continue;
      var x = (i + 0.5) * T, z = (j + 0.5) * T, sc = (isPath ? 0 : 6) + Math.abs(near - 2) * 3 + Math.hypot(x - cx, z - cz) * 0.1;
      if (Z.Sim && Z.Sim.inMap && !Z.Sim.inMap(i, j)) continue;
      if (sc < bd) { bd = sc; best = { x: x, z: z }; }
    }
    return best ? { x: best.x, z: best.z, lx: cx, lz: cz } : null;
  }
  function onJump() {
    var v = el.sel.value, S = Z.state; el.sel.blur();
    if (!v) return;
    var spot = null;
    if (v === 'gate') spot = { x: Z.N, z: Z.N * 2 - 6, lx: Z.N, lz: Z.N * 2 - 52 };
    else if (v.indexOf('enc:') === 0) {
      var id = +v.slice(4), enc = null; (S.enclosures || []).forEach(function (e) { if (e.id === id || String(e.id) === v.slice(4)) enc = e; });
      if (enc) { var ec = encCenter(enc); spot = viewSpot(enc) || { x: ec.x, z: ec.z + 2, lx: ec.x, lz: ec.z }; }
    }
    el.sel.value = '';
    if (!spot) { UI.toast('Could not find a spot there', 'info'); return; }
    el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go');
    setTimeout(function () { Z.World.svJump(spot.x, spot.z, spot.lx, spot.lz); }, 120);
    UI.snd('click');
  }

  // ------------------------------------------------------------ keyboard
  SV.key = function (e, k) {
    if (k === 'escape') { SV.exit(); e.preventDefault(); return true; }
    if (k === ' ' || k === '1' || k === '2' || k === '3') return false;
    if (UI.modalOpen && UI.modalOpen()) return false;
    if (k === 'shift') { keys.shift = 1; return true; }
    if ((k.length === 1 && 'wasdqe'.indexOf(k) >= 0) || k.indexOf('arrow') === 0) { keys[k] = 1; keys.shift = e.shiftKey ? 1 : 0; e.preventDefault(); return true; }
    return true;
  };
  window.addEventListener('keyup', function (e) { if (!SV.active) return; var k = e.key.toLowerCase(); delete keys[k]; keys.shift = e.shiftKey ? 1 : 0; });
  window.addEventListener('blur', function () { keys = {}; fwdHeld = false; });

  // ------------------------------------------------------------ pointer
  function pdist() { var a = []; for (var k in ptr) a.push(ptr[k]); return a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0; }
  SV.down = function (e, w) {
    try { w.setPointerCapture(e.pointerId); } catch (er) { }
    ptr[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, type: e.pointerType };
    np = Object.keys(ptr).length;
    if (np === 2) { pinch = pdist(); multi = true; } else if (np === 1) multi = false;
    document.body.classList.add('sv-drag');
  };
  SV.move = function (e) {
    var p = ptr[e.pointerId]; if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > (p.type === 'mouse' ? 4 : 9)) p.moved = true;
    var zi = Z.World.svInfo().zoom;
    if (np === 1) { if (p.moved) Z.World.svLook(dx * 0.0055 * zi, dy * 0.0045 * zi); }
    else if (np >= 2) { var d = pdist(); if (pinch > 10 && d > 10) Z.World.svZoom(pinch / d); pinch = d; }
  };
  SV.up = function (e) {
    var p = ptr[e.pointerId]; if (!p) return;
    delete ptr[e.pointerId]; np = Object.keys(ptr).length;
    try { world.releasePointerCapture(e.pointerId); } catch (er) { }
    if (!p.moved && !multi && performance.now() - p.t < 700) tap(e.clientX, e.clientY);
    if (np === 0) { multi = false; document.body.classList.remove('sv-drag'); }
  };
  SV.cancel = function (e) { delete ptr[e.pointerId]; np = Object.keys(ptr).length; if (!np) { multi = false; document.body.classList.remove('sv-drag'); } };
  SV.wheel = function (e) { Z.World.svZoom(Math.exp(UI.clamp(e.deltaY, -120, 120) * 0.0009)); };
  function tap(x, y) {
    var info = Z.World.svInfo(), hit = Z.World.pickEntity(x, y);
    if (hit && (hit.kind === 'animal' || hit.kind === 'guest' || hit.kind === 'staff')) {
      var p = Z.World.entityPos(hit.kind, hit.id);
      if (p) { var dx = p.x - info.x, dz = p.z - info.z, d = Math.hypot(dx, dz) || 1, stop = hit.kind === 'animal' ? 6 : 2.4; if (d > stop) { Z.World.svGoto(p.x - dx / d * stop, p.z - dz / d * stop); UI.snd('click'); } return; }
    }
    var gp = Z.World.pickGround(x, y); if (!gp) return;
    if (Math.hypot(gp.x - info.x, gp.z - info.z) > 140) return;
    Z.World.svGoto(gp.x, gp.z); UI.snd('click');
  }

  // ------------------------------------------------------------ per-frame
  function frame(dt) {
    if (!SV.active) return;
    var f = 0, s = 0, t = 0;
    if (keys.w || keys.arrowup || fwdHeld) f += 1; if (keys.s || keys.arrowdown) f -= 1;
    if (keys.d) s += 1; if (keys.a) s -= 1;
    if (keys.arrowleft || keys.q) t += 1; if (keys.arrowright || keys.e) t -= 1;
    Z.World.svInput(f, s, !!keys.shift, t);
    var b = Math.round(bearingOf(Z.World.svInfo().yaw));
    if (b !== lastBearing) { lastBearing = b; el.dg.setAttribute('transform', 'rotate(' + (-b) + ' 20 20)'); el.head.textContent = CARD[Math.round(b / 45) % 8] + ' ' + b + '°'; }
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) el.hint.classList.remove('on'); }
    else if (f || s) { }
  }
  SV.init = function () {
    SV.build();
    UI.held.sv = frame;
    Z.bus.on('streetview', function (on) { activate(!!on); });
    Z.bus.on('reset', function () { if (SV.active) Z.World.setStreetView(false); });
    Z.bus.on('enclosures', function () { if (SV.active && document.activeElement !== el.sel) fillJump(); });
  };
  var oinit = UI.init;
  UI.init = function () { oinit.apply(this, arguments); SV.init(); };
})();
