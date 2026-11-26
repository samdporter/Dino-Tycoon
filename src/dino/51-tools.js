// ===== 51-tools.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - input handling (camera gestures, taps) and build tools with live previews. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, fmt = UI.fmt, D = Z.DATA, N = Z.N, T = Z.TILE;
  var gestureMath = Z.GestureMath;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; });
  var Tools = UI.Tools = {}, el, world;
  var ptrs = {}, nptr = 0, g = null, drag = null, hover = null, lastPlan = null, moved = false;
  var POINT = { scenery: 1, building: 1, animal: 1, staff: 1, animalmove: 1 };
  var TAP_PX = 9;

  Tools.init = function () {
    el = UI.el; world = document.getElementById('world');
    world.addEventListener('pointerdown', onDown); world.addEventListener('pointermove', onMove);
    world.addEventListener('pointerup', onUp); world.addEventListener('pointercancel', onCancel);
    world.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !nptr) { hover = null; if (UI.tool && POINT[UI.tool.kind] || UI.tool) clearPreview(); } });
    world.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    world.addEventListener('wheel', function (e) { e.preventDefault(); if (UI.SV && UI.SV.active) return UI.SV.wheel(e); if (typeof e.deltaY === 'number' && isFinite(e.deltaY)) Z.World.zoom(Math.exp(UI.clamp(e.deltaY, -120, 120) * 0.0013)); }, { passive: false });
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', function (e) { delete keys[e.key.toLowerCase()]; });
    window.addEventListener('blur', function () { keys = {}; });
    UI.held.keys = keysFrame;
  };

  // ---------------------------------------------------------------- keyboard
  var keys = {};
  function onKey(e) {
    Z.handleGameKey(e, { UI: UI, Tools: Tools, keys: keys,
      beforeKey: function (e, k) { return !!(UI.SV && UI.SV.active && UI.SV.key(e, k)); },
      escape: function () {
        if (Z.CoasterWorld && Z.CoasterWorld.isRiding && Z.CoasterWorld.isRiding()) Z.CoasterWorld.endRide();
        else if (UI.modalOpen && UI.modalOpen()) UI.closeModal(); else if (UI.tool) Tools.cancel(); else if (UI.Panel && UI.Panel.isOpen()) UI.Panel.hide(); else if (UI.cat) UI.openCat(UI.cat);
      }
    });
  }
  function keysFrame(dt) {
    if (UI.titleOpen) return;
    var v = 620 * dt, dx = 0, dy = 0, r = 0;
    if (keys.a || keys.arrowleft) dx += v; if (keys.d || keys.arrowright) dx -= v;
    if (keys.w || keys.arrowup) dy += v; if (keys.s || keys.arrowdown) dy -= v;
    if (keys.q) r -= 1.5 * dt; if (keys.e) r += 1.5 * dt;
    if (dx || dy) Z.World.pan(dx, dy); if (r) Z.World.rotate(r, 0);
  }

  // ---------------------------------------------------------------- pointer gestures
  function pick(x, y) { return Z.World.pickGround(x, y); }
  function onDown(e) {
    if (UI.titleOpen) return;
    if (UI.SV && UI.SV.active) return UI.SV.down(e, world);
    UI.snd('unlock');
    try { world.setPointerCapture(e.pointerId); } catch (er) { }
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, btn: e.button };
    nptr = Object.keys(ptrs).length;
    if (nptr === 1) {
      moved = false;
      if (e.pointerType === 'mouse' && (e.button === 2 || e.button === 1)) { g = { mode: 'rot' }; return; }
      if (UI.tool && !UI.tool.move) { g = { mode: 'tool' }; toolDown(e.clientX, e.clientY, e.pointerType); }
      else g = { mode: 'pan' };
    } else if (nptr === 2) {
      if (g && g.mode === 'tool') toolAbort();
      var p = gestureMath.points(ptrs); g = { mode: 'multi', cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, d: gestureMath.distance(p[0], p[1]), a: gestureMath.angle(p[0], p[1]) };
    } else g = { mode: 'ignore' };
  }
  function onMove(e) {
    if (UI.SV && UI.SV.active) return UI.SV.move(e);
    var p = ptrs[e.pointerId];
    if (!p) { if (e.pointerType === 'mouse' && !UI.titleOpen) onHover(e.clientX, e.clientY); return; }
    var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (!g) return;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > (p.type === 'mouse' ? 5 : TAP_PX)) moved = true;
    if (g.mode === 'tool') toolMove(p.x, p.y);
    else if (g.mode === 'pan') { if (moved) { Z.World.pan(dx, dy); if (UI.tool) clearPreview(); } }
    else if (g.mode === 'rot') { Z.World.rotate(-dx * 0.008, dy * 0.006); }
    else if (g.mode === 'multi' && nptr >= 2) {
      var q = gestureMath.points(ptrs), cx = (q[0].x + q[1].x) / 2, cy = (q[0].y + q[1].y) / 2, d = gestureMath.distance(q[0], q[1]), a = gestureMath.angle(q[0], q[1]);
      if (isFinite(cx - g.cx) && isFinite(cy - g.cy)) Z.World.pan(cx - g.cx, cy - g.cy);
      if (g.d > 10 && d > 10 && isFinite(g.d / d)) Z.World.zoom(g.d / d);
      var da = a - g.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      if (isFinite(da) && Math.abs(da) < 1.2) Z.World.rotate(da, 0);
      g.cx = cx; g.cy = cy; g.d = d; g.a = a;
    }
  }
  function onUp(e) {
    if (UI.SV && UI.SV.active) return UI.SV.up(e, world);
    var p = ptrs[e.pointerId]; if (!p) return;
    delete ptrs[e.pointerId]; nptr = Object.keys(ptrs).length;
    try { world.releasePointerCapture(e.pointerId); } catch (er) { }
    if (g) {
      if (g.mode === 'tool') toolUp(e.clientX, e.clientY, p.type);
      else if (g.mode === 'pan' && !moved && nptr === 0) onTap(e.clientX, e.clientY, p.type);
      else if (g.mode === 'rot' && !moved && nptr === 0) { /* right click: cancel tool */ if (UI.tool) Tools.cancel(); }
      else if (g.mode === 'multi') g = { mode: 'ignore' };
    }
    if (nptr === 0) g = null;
  }
  function onCancel(e) {
    if (UI.SV && UI.SV.active) return UI.SV.cancel(e);
    delete ptrs[e.pointerId]; nptr = Object.keys(ptrs).length;
    if (g && g.mode === 'tool') toolAbort();
    if (nptr === 0) g = null;
  }

  // ---------------------------------------------------------------- tap = inspect
  function onTap(x, y, type) {
    if (UI.tool || (Z.Examples && Z.Examples.active())) return;   // Masterclass: watching only
    var hit = Z.World.pickEntity(x, y);
    if (hit) { UI.snd('click'); UI.Panel.open(hit.kind, hit.id); if (hit.kind === 'animal') UI.callFor(hit.id); }
    else if (UI.Panel.isOpen()) UI.Panel.hide();
    else if (UI.cat) { /* tapping the world while a category is open keeps it open */ }
  }

  // ---------------------------------------------------------------- tool lifecycle
  var HINTS = {
    path: 'Drag in a straight line. A tap lays one tile.', terrain: 'Paint with your finger. Pick a brush size.', sculpt: 'Press and hold, or drag, to keep going. One level each time.', fence: '', scenery: 'Tap to place. Slide to adjust before you lift.',
    building: 'Tap to place. Slide to adjust. Touch a path edge.', ditch: 'Drag to dig. Width and shape are set on the right.', animal: 'Tap inside an enclosure to place it.', staff: 'Tap a path tile to hire here.', bulldoze: '', animalmove: 'Tap inside an enclosure to move it there.',
    ctrack: 'Drag track from the green station arrow around in a loop back to the amber arrow. Smooth curves & hills form automatically!',
    craise: 'Click or drag over coaster track to raise a smooth hill (+1 level). Remember to stamp a Chain Lift Hill (⛓️) on uphill climbs!',
    clower: 'Click or drag over coaster track to lower its height (-1 level).',
    ctrackrm: 'Click or drag over coaster track tiles to dismantle them (50% refund).',
    cspec: 'Click or drag on straight coaster track to stamp this special piece.'
  };
  Tools.start = function (spec) {
    var prev = UI.tool;
    UI.tool = { kind: spec.kind, id: spec.id, name: spec.name || (spec.kind === 'bulldoze' ? 'Bulldoze' : spec.id), def: spec.def, tip: spec.tip, specId: spec.specId, rot: 0, move: false, brush: spec.kind === 'sculpt' ? (UI.prefs.sbrush || 2) : (UI.prefs.brush || 2), mode: UI.prefs.fenceMode || 'rect', bmode: 'things', aid: spec.aid };
    if (UI.tool.kind === 'scenery' || UI.tool.kind === 'building') rerollRot();
    if (UI.Panel) UI.Panel.hide(true);
    clearPreview(); hover = null; drag = null;
    el.strip.classList.add('on'); buildStrip(); UI.markSelected(); syncSide();
    var isCoasterTool = spec.kind === 'ctrack' || spec.kind === 'craise' || spec.kind === 'clower' || spec.kind === 'ctrackrm' || spec.kind === 'cspec' || (spec.kind === 'building' && spec.def && spec.def.coasterStation);
    if ((UI.narrow() && window.innerHeight < 860 && spec.kind !== 'fence' && spec.kind !== 'terrain' && spec.kind !== 'sculpt' && !isCoasterTool) || window.innerHeight < 520) { el.cards.className = 'empty'; UI.cat = null; UI.markTabs(); }
    if (UI.Tutorial) UI.Tutorial.onTool(UI.tool);
  };
  Tools.cancel = function (quiet) {
    sculptStop(); 
    if (!UI.tool) return;
    UI.tool = null; drag = null; hover = null; g = null; clearPreview();
    el.strip.classList.remove('on'); UI.markSelected(); syncSide();
    if (UI.cat === 'bull') { UI.cat = null; UI.markTabs(); }
  };
  Tools.toggleMove = function () { if (!UI.tool) return; UI.tool.move = !UI.tool.move; clearPreview(); buildStrip(); };
  var RANDOM_ROT = { tree: 1, bush: 1, rock: 1 };
  function rerollRot() {
    var t = UI.tool; if (!t || t.kind !== 'scenery') return;
    var d = t.def; if (d && (RANDOM_ROT[d.kind] || d.id === 'log' || d.id === 'ball' || d.id === 'tall_grass')) t.rot = (Math.random() * 4) | 0;
  }
  function manualRot() { var t = UI.tool; return t && (t.kind === 'building' || (t.kind === 'scenery' && !(t.def && (RANDOM_ROT[t.def.kind] || t.def.id === 'log' || t.def.id === 'ball')))); }
  Tools.rotate = function () {
    var t = UI.tool; if (!t || !(t.kind === 'building' || t.kind === 'scenery')) return;
    t.rot = (t.rot + 1) & 3; refreshPlan();
  };
  function syncSide() {
    var t = UI.tool;
    el.bRotObj.style.display = t && manualRot() ? '' : 'none';
    el.bMove.style.display = 'none';
  }
  function buildStrip() {
    var t = UI.tool, s = el.strip; s.innerHTML = ''; if (!t) return;
    var name = t.kind === 'bulldoze' ? 'Bulldoze' : t.kind === 'animalmove' ? 'Move animal' : (t.kind === 'terrain' ? 'Paint ' : t.kind === 'staff' ? 'Hire ' : '') + t.name;
    var hint = t.kind === 'sculpt' ? (t.def && t.def.tip ? t.def.tip : HINTS.sculpt) : t.kind === 'fence' ? (t.mode === 'rect' ? 'Drag a rectangle to fence it in.' : 'Drag along a line of panels.') : t.kind === 'bulldoze' ? (t.bmode === 'things' ? 'Tap or drag over items and paths. 50% refund.' : 'Tap or drag along fence panels.') : HINTS[t.kind] || '';
    if (t.move) hint = 'Camera mode: drag to look around.';
    else if (t.kind === 'staff') {
      if (t.id === 'keeper' || t.id === 'vet') {
        var covH = Z.Sim.rangerCoverage ? Z.Sim.rangerCoverage() : { baseTiles: 32, stationTiles: 48, vetClinicTiles: 48 };
        hint = t.id === 'keeper'
          ? 'Tap a path to place. Circle shows ' + covH.baseTiles + '-tile base range (+ ' + covH.stationTiles + 't around stations).'
          : 'Tap a path to deploy. Responds park-wide on connected paths (' + (covH.vetClinicTiles || 48) + 't fast clinic zone when a Vet clinic is built).';
      } else if (t.def && (t.def.tagline || t.def.effect)) {
        hint = 'Tap a path to place. ' + (t.def.tagline ? t.def.tagline + (t.def.duties ? ' ' + t.def.duties : '') : t.def.effect);
      }
    }
    else if ((t.kind === 'scenery' || t.kind === 'building') && t.def && UI.itemInfo && UI.itemInfo(t.def, true)) hint = UI.itemInfo(t.def, true);
    else if (t.kind === 'building' && t.def && t.def.utility) hint = 'Tap to place. Slide to adjust.';
    s.appendChild(h('div.tname', { html: name + '<small>' + hint + '</small>' }));
    function seg(opts, cur, fn) {
      var sg = h('div.seg'); opts.forEach(function (o) { sg.appendChild(h('button' + (o[0] === cur ? '.on' : ''), { html: o[2] ? ic(o[2]) + o[1] : o[1], 'aria-label': o[3] || o[1], on: { click: function () { UI.snd('click'); fn(o[0]); buildStrip(); } } })); }); return sg;
    }
    if (Tools.stripHook) Tools.stripHook(t, s, seg);
    if (t.kind === 'fence') s.appendChild(seg([['rect', 'Enclosure', 'rect'], ['line', 'Line', 'line']], t.mode, function (v) { t.mode = UI.prefs.fenceMode = v; clearPreview(); if (UI.Tutorial) UI.Tutorial.onFenceMode && UI.Tutorial.onFenceMode(v); }));
    if (t.kind === 'terrain') s.appendChild(seg([[1, 'S'], [2, 'M'], [3, 'L']], t.brush, function (v) { t.brush = UI.prefs.brush = v; clearPreview(); }));
    if (t.kind === 'sculpt') { var sg2 = seg([[1, '1'], [2, '2'], [3, '3'], [5, '5']], t.brush, function (v) { t.brush = UI.prefs.sbrush = v; clearPreview(); }); sg2.classList.add('sc'); sg2.setAttribute('aria-label', 'Brush size in tiles'); s.appendChild(sg2); }
    if (t.kind === 'bulldoze') s.appendChild(seg([['things', 'Things'], ['fences', 'Fences']], t.bmode, function (v) { t.bmode = v; clearPreview(); }));
    if (t.kind === 'building' || t.kind === 'scenery') { if (manualRot()) s.appendChild(h('button.btn.sm.alt', { html: ic('rot') + 'Rotate<small class="kb">R</small>', on: { click: function () { Tools.rotate(); UI.snd('click'); } } })); }
    s.appendChild(h('button.btn.sm' + (t.move ? '' : '.alt'), { html: ic('hand') + (t.move ? 'Tool' : 'Move'), 'aria-label': 'Move the camera', on: { click: function () { Tools.toggleMove(); UI.snd('click'); } } }));
    s.appendChild(h('button.btn.sm.warn', { html: ic('check') + 'Done', on: { click: function () { Tools.cancel(); UI.snd('click'); } } }));
    if (t.kind === 'animal' || t.kind === 'animalmove') { el.forecast = h('div#forecast', h('div.pct', { text: '--' }), h('div.fi', { text: 'Move over an enclosure to see how happy it would be.' })); s.appendChild(el.forecast); }
    syncSide();
  }

  // ---------------------------------------------------------------- preview helpers
  function clearPreview() { Z.World.setPreview(null); el.cost.style.display = 'none'; lastPlan = null; if (el.forecast) el.forecast.classList.remove('on'); }
  function showCost(x, y, text, sub, ok, touch) {
    var c = el.cost; c.className = ok ? '' : 'bad'; c.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
    c.style.display = 'block';
    var w = c.offsetWidth || 80, xx = UI.clamp(x, w / 2 + 6, window.innerWidth - w / 2 - 6);
    c.style.left = xx + 'px'; c.style.top = Math.max(120, y - (touch ? 62 : 26)) + 'px';
  }
  function flashCost(x, y, text, ok) {
    showCost(x, y, text, '', ok, true); var c = el.cost; clearTimeout(flashCost.t); flashCost.t = setTimeout(function () { if (!drag) c.style.display = 'none'; }, 900);
  }

  // ---------------------------------------------------------------- plans
  function tilesBetween(a, b) {
    var out = [], di = b.i - a.i, dj = b.j - a.j, n = Math.max(Math.abs(di), Math.abs(dj)) || 1;
    for (var k = 0; k <= n; k++) out.push({ i: Math.round(a.i + di * k / n), j: Math.round(a.j + dj * k / n) });
    return out;
  }
  function brushTiles(ci, cj, radius) {
    var out = [], rr = Math.ceil(radius), r2 = radius <= 0 ? 0 : radius * radius + 1;
    for (var dj = -rr; dj <= rr; dj++) for (var di = -rr; di <= rr; di++) { if (radius > 0 && di * di + dj * dj > r2) continue; var i = ci + di, j = cj + dj; if (Z.inb(i, j)) out.push({ i: i, j: j }); }
    return out;
  }
  function failMsg(r) { return r && r.msg ? r.msg : 'Cannot do that here'; }

  var PLAN = {};
  PLAN.path = function (d) {
    var t = UI.tool, a = d.a, b = d.b || d.a, tiles = [];
    if (Math.abs(b.i - a.i) >= Math.abs(b.j - a.j)) { var s = Math.sign(b.i - a.i) || 1; for (var i = a.i; i !== b.i + s; i += s) tiles.push({ i: i, j: a.j }); }
    else { var s2 = Math.sign(b.j - a.j) || 1; for (var j = a.j; j !== b.j + s2; j += s2) tiles.push({ i: a.i, j: j }); }
    var ok = [], cost = 0, msg = '';
    var bridgeN = 0;
    tiles.forEach(function (q) { var r = Z.Sim.placePath(q.i, q.j, t.id, { dry: true }); if (r.ok) { ok.push(q); cost += r.cost; if (r.bridge) bridgeN++; } else if (!msg) msg = failMsg(r); });
    var afford = cost <= Z.state.money;
    return { spec: { type: 'tiles', tiles: ok.length ? ok : tiles, ok: ok.length > 0 && afford }, ok: ok.length > 0 && afford, cost: cost, n: ok.length, msg: !ok.length ? msg : (!afford ? 'Not enough money' : ''),
      label: bridgeN ? 'bridge: ' + bridgeN + ' tile' + (bridgeN > 1 ? 's' : '') + (ok.length > bridgeN ? ' + ' + (ok.length - bridgeN) + ' path tile' + (ok.length - bridgeN > 1 ? 's' : '') : '') : ok.length > 1 ? ok.length + ' tiles' : '', run: function () { var n = 0, c = 0; for (var k = 0; k < ok.length; k++) { var r = Z.Sim.placePath(ok[k].i, ok[k].j, t.id); if (!r.ok) break; n++; c += r.cost; } return { n: n, cost: c }; } };
  };
  PLAN.terrain = function (d) {
    var t = UI.tool, radius = t.brush - 1, centers = d.pts || [d.a], set = {}, list = [], water = t.id === 'water', S = Z.state, ti = -1, k;
    for (k = 0; k < D.terrain.length; k++) if (D.terrain[k].id === t.id) ti = k;
    centers.forEach(function (c) { brushTiles(c.i, c.j, radius).forEach(function (q) { var idx = q.i + q.j * N; if (!set[idx]) { set[idx] = 1; list.push(q); } }); });
    var chg = list.filter(function (q) {
      if (Z.Sim.inMap && !Z.Sim.inMap(q.i, q.j)) return false;
      if (Z.Sim.isSea && Z.Sim.isSea(q.i, q.j)) return false;
      var idx = q.i + q.j * N; if (S.terrain[idx] === ti) return false;
      if (water && ((S.ditch && S.ditch[idx]) || S.path[idx] || S.tileObj[idx])) { return false; } return true;
    });
    var cost = chg.length * D.terrain[ti].cost, afford = cost <= S.money;
    return { spec: { type: 'tiles', tiles: chg.length ? chg : list, ok: chg.length > 0 && afford }, ok: chg.length > 0 && afford, cost: cost, n: chg.length, msg: !chg.length ? (water ? 'Nothing to change (paths and objects block water)' : 'Already that terrain') : (!afford ? 'Not enough money' : ''),
      label: chg.length > 1 ? chg.length + ' tiles' : '', run: function () {
        var seen = {}, n = 0, c = 0, cs = [];
        centers.forEach(function (q) { var key = q.i + ',' + q.j; if (!seen[key]) { seen[key] = 1; cs.push(q); } });
        for (var m = 0; m < cs.length; m++) { var r = Z.Sim.paintTerrain(cs[m].i, cs[m].j, t.id, radius); if (r.ok) { c += r.cost; n++; } else if (r.msg === 'Not enough money') break; }
        return { n: chg.length, cost: c };
      } };
  };
  // ---- terrain sculpting ----
  var SC = {}, SCL = UI.SCULPT || []; for (var sci = 0; sci < SCL.length; sci++) SC[SCL[sci].id] = SCL[sci];
  function elevAt(c) {
    var S = Z.state; if (!S.elev || !Z.eidx) return null;
    var e = S.elev, a = e[Z.eidx(c.i, c.j)], b = e[Z.eidx(c.i + 1, c.j)], d = e[Z.eidx(c.i, c.j + 1)], f = e[Z.eidx(c.i + 1, c.j + 1)];
    if (a === undefined || f === undefined) return null; return Math.round((a + b + d + f) / 4);
  }
  function heightText(c) { var v = elevAt(c); return v === null ? '' : 'Height ' + (v > 0 ? '+' : '') + v; }
  PLAN.sculpt = function (d) {
    var t = UI.tool, c = d.b || d.a, sp = SC[t.id] || SC.raise, radius = t.brush - 1, Sm = Z.Sim;
    var tiles = brushTiles(c.i, c.j, radius).filter(function (q) { return !Sm.inMap || Sm.inMap(q.i, q.j); });
    if (Sm.inMap && !Sm.inMap(c.i, c.j)) return { spec: { type: 'tiles', tiles: tiles.length ? tiles : [c], ok: false }, ok: false, cost: 0, msg: 'Outside your land', label: '' };
    if (!Sm.terraform) return { spec: null, ok: false, cost: 0, msg: 'Terrain sculpting is not available', label: '' };
    var r = Sm.terraform(c.i, c.j, sp.mode, radius, { sharp: !!sp.sharp, dry: true }), cost = r.cost || 0;
    if (r.ok && sp.lake && Sm.paintTerrain) { var w = Sm.paintTerrain(c.i, c.j, 'water', radius, { dry: true }); if (w && w.ok && w.cost) cost += w.cost; }
    return { spec: { type: 'tiles', tiles: tiles.length ? tiles : [c], ok: !!r.ok }, ok: !!r.ok, cost: cost, msg: r.ok ? '' : failMsg(r), warn: heightText(c), label: '', sculpt: true };
  };
  var sculpt = null;
  function sculptStop() {
    if (!sculpt) return; var sc = sculpt; sculpt = null; clearTimeout(sc.timer);
    try { Z.Sim.endStroke(); } catch (e) { }
    if (sc.n) UI.updateUndo && UI.updateUndo(true);
    return sc;
  }
  function sculptApply() {
    var sc = sculpt, t = UI.tool; if (!sc || !drag || !t || t.kind !== 'sculpt') return;
    var c = drag.b || drag.a, sp = SC[t.id] || SC.raise, radius = t.brush - 1, res = Z.Sim.terraform ? Z.Sim.terraform(c.i, c.j, sp.mode, radius, { sharp: !!sp.sharp }) : { ok: false, msg: 'Terrain sculpting is not available' };
    if (res.ok) {
      sc.n++; sc.cost += res.cost || 0;
      if (sp.lake && Z.Sim.paintTerrain) { var w = Z.Sim.paintTerrain(c.i, c.j, 'water', radius); if (w && w.ok) sc.cost += w.cost || 0; }
      UI.snd(sc.n === 1 ? 'build' : 'click'); refreshPlan();
      if (UI.Tutorial && sc.n === 1 && UI.Tutorial.onBuilt) UI.Tutorial.onBuilt(t);
      sc.timer = setTimeout(sculptApply, 180);
    } else {
      sc.failed = true; UI.snd('bad'); var m = failMsg(res); if (!/Already|Nothing/.test(m) || sc.n === 0) UI.toast(m, 'bad'); refreshPlan();
    }
  }
  function sculptDown(x, y, touch) {
    Z.Sim.beginStroke(strokeLabel());
    sculpt = { n: 0, cost: 0, failed: false, timer: setTimeout(sculptApply, touch ? 110 : 0) };
  }
  function sculptUp(x, y, type) {
    var touch = type !== 'mouse', gp = pick(x, y);
    if (gp && drag) { drag.b = gp; drag.cx = x; drag.cy = y; }
    if (sculpt && !sculpt.n && !sculpt.failed) { clearTimeout(sculpt.timer); sculptApply(); }
    var d = drag; drag = null; var sc = sculptStop();
    if (sc && sc.n) flashCost(x, y, (sc.cost ? '-' + fmt(sc.cost) : 'Done') + (sc.n > 1 ? ' (' + sc.n + ' levels)' : ''), true);
    if (!UI.tool) return;
    if (touch) { clearPreview(); hover = null; } else { hover = mkDrag(x, y, false); refreshPlan(); }
  }
  function fenceEdgesRect(a, b) {
    var i0 = Math.min(a.i, b.i), i1 = Math.max(a.i, b.i), j0 = Math.min(a.j, b.j), j1 = Math.max(a.j, b.j), e = [], i, j;
    for (i = i0; i <= i1; i++) { e.push({ axis: 'x', i: i, j: j0 }); e.push({ axis: 'x', i: i, j: j1 + 1 }); }
    for (j = j0; j <= j1; j++) { e.push({ axis: 'z', i: i0, j: j }); e.push({ axis: 'z', i: i1 + 1, j: j }); }
    return { edges: e, w: i1 - i0 + 1, h: j1 - j0 + 1 };
  }
  function edgesLine(a, b) {
    var dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z), e = [], i, j;
    if (dx + dz < 0.5 * T) return [a.edge];
    if (dx >= dz) { j = UI.clamp(Math.round(a.z / T), 0, N); var i0 = Math.min(a.i, b.i), i1 = Math.max(a.i, b.i); for (i = i0; i <= i1; i++) e.push({ axis: 'x', i: i, j: j }); }
    else { i = UI.clamp(Math.round(a.x / T), 0, N); var j0 = Math.min(a.j, b.j), j1 = Math.max(a.j, b.j); for (j = j0; j <= j1; j++) e.push({ axis: 'z', i: i, j: j }); }
    return e;
  }
  PLAN.fence = function (d) {
    var t = UI.tool, a = d.a, b = d.b || d.a, edges, label = '', rectOK = true;
    if (t.mode === 'rect') {
      var rr = fenceEdgesRect(a, b); edges = rr.edges; label = rr.w + '×' + rr.h + ' tiles';
      if (d.moved === false && d.committing) rectOK = false;
    } else edges = edgesLine(a, b);
    var ok = [], cost = 0, msg = '', seen = {};
    edges.forEach(function (e) {
      var key = e.axis + e.i + ',' + e.j; if (seen[key]) return; seen[key] = 1;
      var r = Z.Sim.placeFence(e, t.id, { dry: true }); if (r.ok) { ok.push(e); cost += r.cost; } else if (!msg && r.msg !== 'Already there') msg = failMsg(r);
    });
    var afford = cost <= Z.state.money, small = t.mode === 'rect' && (Math.abs(b.i - a.i) < 1 && Math.abs(b.j - a.j) < 1) && !!d.committing;
    var all = ok.length ? ok : edges.filter(Boolean);
    return { spec: { type: 'edges', edges: all, ok: ok.length > 0 && afford && !small, height: 1.1 }, ok: ok.length > 0 && afford && !small, cost: cost, n: ok.length,
      msg: small ? 'Drag out a rectangle to fence an area' : !ok.length ? (msg || 'Already fenced') : (!afford ? 'Not enough money' : ''), label: t.mode === 'rect' ? label : (ok.length + ' panels'),
      run: function () {
        var n = 0, c = 0, before = Z.state.enclosures.length;
        for (var k = 0; k < ok.length; k++) { var r = Z.Sim.placeFence(ok[k], t.id); if (!r.ok) break; n++; c += r.cost; }
        var S = Z.state; if (S.enclosures.length > before) UI.toast('Enclosure complete! Now give it some terrain, plants and animals.', 'good');
        return { n: n, cost: c };
      } };
  };
  function objRect(type, kind, gp, rot) {
    var fp = Z.Sim.footprint(type, 0, 0, rot), w = fp ? fp.w : 1, hh = fp ? fp.h : 1;
    var i = (w % 2) ? Math.floor(gp.x / T - (w - 1) / 2) : Math.round(gp.x / T - w / 2), j = (hh % 2) ? Math.floor(gp.z / T - (hh - 1) / 2) : Math.round(gp.z / T - hh / 2);
    return { i: i, j: j, w: w, h: hh };
  }
  function tileBlocked(i, j) {
    var S = Z.state; if (!Z.inb(i, j)) return true; var idx = i + j * N;
    return !!S.tileObj[idx] || (D.terrain[S.terrain[idx]] && D.terrain[S.terrain[idx]].id === 'water');
  }
  function rangerRangesFor(px, pz, radTiles, ok, cov) {
    var ranges = [{ x: px, z: pz, r: radTiles * T, col: ok ? 0x42f578 : 0xff5a4a }];
    if (cov && cov.huts) cov.huts.forEach(function (ht) {
      ranges.push({ x: ht.x, z: ht.z, r: ht.radius * T, col: 0x58c7ff, alpha: 0.55 });
    });
    return ranges;
  }
  PLAN.scenery = PLAN.building = function (d) {
    var t = UI.tool, gp = d.b || d.a, r0 = objRect(t.id, t.kind, gp, t.rot), r = Z.Sim.placeObject(t.id, r0.i, r0.j, t.rot, { dry: true });
    var def = t.def || (t.kind === 'building' ? UI.byId(D.buildings, t.id) : UI.byId(D.scenery, t.id));
    var isUtil = t.kind === 'building' && !!(def && def.utility);
    var spec = { type: 'object', kind: t.kind, id: t.id, i: r0.i, j: r0.j, rot: t.rot, ok: r.ok, door: !isUtil }, sub = '';
    if (t.kind === 'building') {
      var tok = [], anyBad = false;
      var pfp = def && def.boats && Z.Boats && Z.Boats.pierOverhang ? Z.Sim.footprint(t.id, r0.i, r0.j, t.rot) : null, poh = pfp ? Z.Boats.pierOverhang(t.id, pfp) : null;   // valid pier overhang water shows green
      for (var jj = 0; jj < r0.h; jj++) for (var ii = 0; ii < r0.w; ii++) {
        var b = tileBlocked(r0.i + ii, r0.j + jj);
        if (b && poh && poh.wet && poh.wet[ii + jj * r0.w] && !Z.state.tileObj[(r0.i + ii) + (r0.j + jj) * N]) b = false;
        if (b) anyBad = true; tok.push(!b);
      }
      if (!r.ok && !anyBad) tok = tok.map(function () { return false; });
      spec.tileOk = r.ok ? tok.map(function () { return true; }) : tok;
      var fp = Z.Sim.footprint(t.id, r0.i, r0.j, t.rot), onPath = fp && fp.front.some(function (q) { return Z.state.path[q.i + q.j * N]; });
      if (fp) {
        if (isUtil) {
          var uSpec = def.gen ? def.gen.kw + ' kW' : def.battery ? def.battery.kwh + ' kWh' : def.powerNode ? def.powerNode.radius + '-tile range' : def.moat ? def.moat.cap + ' water' : def.realm === 'plant' && D.realms && D.realms.plant ? D.realms.plant.capacity + ' water' : def.id === 'tagging_tower' && D.realms && D.realms.virtual && D.realms.virtual.towers && D.realms.virtual.towers[0] ? D.realms.virtual.towers[0].radius + '-tile range' : '';
          sub = (r0.w + '×' + r0.h) + (uSpec ? ' · ' + uSpec : '') + (r.warn ? ' - ' + r.warn : '');
        } else {
          var extraWarn = r.warn ? r.warn.replace(/^Entrance not on a path yet(?:\.\s*)?/, '') : '';
          sub = (r0.w + '×' + r0.h) + ' - entrance ' + (onPath ? 'on a path' : 'needs a path') + (extraWarn ? ' · ' + extraWarn : '');
          if (t.id === 'keeper_hut' || t.id === 'vet_clinic') {
            var isClinic = t.id === 'vet_clinic';
            var covS = Z.Sim.rangerCoverage ? Z.Sim.rangerCoverage() : { stationTiles: 48, vetClinicTiles: 48, huts: [], clinics: [] };
            var stR = isClinic ? (covS.vetClinicTiles || 48) : covS.stationTiles;
            var hitS = Z.Sim.rangerCoverage ? covS.enclosuresInRadius(fp.cx, fp.cz, stR) : 0;
            var hubs = isClinic ? (covS.clinics || []) : (covS.huts || []);
            spec.ranges = [{ x: fp.cx, z: fp.cz, r: stR * T, col: r.ok ? (isClinic ? 0x58c7ff : 0x42f578) : 0xff5a4a }];
            hubs.forEach(function (ht) { spec.ranges.push({ x: ht.x, z: ht.z, r: ht.radius * T, col: 0x58c7ff, alpha: 0.55 }); });
            sub += ' · ' + stR + '-tile ' + (isClinic ? 'triage zone' : 'radio range') + ' (' + hitS + ' enc' + (hitS === 1 ? '' : 's') + ')';
          }
        }
      }
    }
    return { spec: spec, ok: r.ok, cost: r.cost || 0, msg: r.ok ? '' : failMsg(r), warn: sub || r.warn, label: '',
      run: function () {
        var label = (t.name || t.id), rr = Z.Sim.placeObject(t.id, r0.i, r0.j, t.rot);
        if (rr.ok) { rerollRot(); if (rr.warn && t.kind === 'building') UI.toast(/^Entrance not on a path/.test(rr.warn) ? 'Entrance needs a path' : rr.warn, /power|network|substation/i.test(rr.warn) ? 'bad' : 'info'); else if (rr.warn) UI.toast(rr.warn + ' - lay a path next to it.', 'info'); }   // QA: say WHY (unpowered station...), not always 'entrance'
        return { n: rr.ok ? 1 : 0, cost: rr.cost || 0 };
      } };
  };
  function forecastFor(species, i, j, movingId) {
    var enc = Z.Sim.enclosureAt(i, j); if (!enc) return null;
    var f = Z.Sim.suitabilityFor(enc.id, species, movingId); if (!f) return null;
    var iss = f.issues ? f.issues.slice() : [];
    iss.sort(function (a, b) { return (/narrow/i.test(b) ? 1 : 0) - (/narrow/i.test(a) ? 1 : 0); });
    return { enc: enc, value: f.value, issues: iss };
  }
  PLAN.animal = function (d) {
    var t = UI.tool, gp = d.b || d.a, r = Z.Sim.addAnimal(t.id, gp.i, gp.j, { dry: true }), f = forecastFor(t.id, gp.i, gp.j);
    var lab = r.chance !== undefined ? Math.round(r.chance * 100) + '% hatch · ' + Math.round(r.hours) + ' h' : '';
    var fx = !r.ok && UI.whyFix ? UI.whyFix(r.code) : null;
    return { spec: { type: 'object', kind: 'animal', id: t.id, i: gp.i, j: gp.j, rot: 0, ok: r.ok }, ok: r.ok, cost: r.cost || 0, msg: r.ok ? '' : failMsg(r), forecast: f, label: lab, warn: lab,
      run: function () { UI.Panel.confirmEgg(t.id, gp.i, gp.j); return { n: 0, cost: 0, silent: true }; } };
  };
  PLAN.animalmove = function (d) {
    var t = UI.tool, gp = d.b || d.a, a = Z.state.animals.filter(function (x) { return x.id === t.aid; })[0];
    if (!a) return { spec: null, ok: false, msg: 'Animal not found', cost: 0 };
    var r = Z.Sim.moveAnimal(a.id, gp.i, gp.j, { dry: true }), f = forecastFor(a.species, gp.i, gp.j, a.id);
    return { spec: { type: 'object', kind: 'animal', id: a.species, i: gp.i, j: gp.j, rot: 0, ok: r.ok }, ok: r.ok, cost: 0, msg: r.ok ? '' : failMsg(r), forecast: f, label: 'Move here', free: true,
      run: function () { var rr = Z.Sim.moveAnimal(a.id, gp.i, gp.j); if (rr.ok) { UI.toast(a.name + ' has settled in.', 'good'); setTimeout(function () { Tools.cancel(); UI.Panel.open('animal', a.id); }, 50); } return { n: rr.ok ? 1 : 0, cost: 0 }; } };
  };
  PLAN.staff = function (d) {
    var t = UI.tool, gp = d.b || d.a, r = Z.Sim.hireStaff(t.id, gp.i, gp.j, { dry: true }), onPath = Z.Sim.walkable(gp.i, gp.j);
    var ok = r.ok && onPath;
    var spec = { type: 'object', kind: 'staff', id: t.id, i: gp.i, j: gp.j, rot: 0, ok: ok }, label = '', warn = '';
    if (t.id === 'keeper' || t.id === 'vet') {
      var cov = Z.Sim.rangerCoverage ? Z.Sim.rangerCoverage() : { baseTiles: 32, stationTiles: 48, vetClinicTiles: 48, hasHut: false, huts: [], clinics: [] };
      var px = (gp.i + 0.5) * T, pz = (gp.j + 0.5) * T;
      if (t.id === 'keeper') {
        var hitEnc = Z.Sim.rangerCoverage ? cov.enclosuresInRadius(px, pz, cov.baseTiles) : 0;
        spec.ranges = rangerRangesFor(px, pz, cov.baseTiles, ok, cov);
        label = cov.baseTiles + '-tile range' + (cov.huts.length ? ' +' + cov.huts.length + ' station' + (cov.huts.length > 1 ? 's' : '') : '');
        warn = hitEnc + ' enclosure' + (hitEnc === 1 ? '' : 's') + ' covered';
      } else {
        var cl = cov.clinics || [];
        if (cl.length) spec.ranges = cl.map(function (c) { return { x: c.x, z: c.z, r: c.radius * T, col: 0x58c7ff, alpha: 0.55 }; });
        label = 'Radio on call (all reachable paths)';
        warn = cl.length ? cl.length + ' Vet clinic' + (cl.length > 1 ? 's' : '') + ' (' + (cov.vetClinicTiles || 48) + 't fast zone)' : 'No Vet clinic yet';
      }
    }
    return { spec: spec, ok: ok, cost: r.cost || 0, msg: !onPath ? 'Tap a path tile' : r.ok ? '' : failMsg(r), label: label, warn: warn,
      run: function () { var rr = Z.Sim.hireStaff(t.id, gp.i, gp.j); if (rr.ok) { UI.toast(t.name + ' hired. They will start work straight away.', 'good'); setTimeout(Tools.cancel, 30); } return { n: rr.ok ? 1 : 0, cost: rr.cost || 0 }; } };
  };
  PLAN.bulldoze = function (d) {
    var t = UI.tool, S = Z.state;
    if (t.bmode === 'fences') {
      var a = d.a, b = d.b || d.a, edges = edgesLine(a, b), ok = [], refund = 0;
      edges.forEach(function (e) { var r = Z.Sim.removeFence(e, { dry: true }); if (r.ok) { ok.push(e); refund -= r.cost; } });
      return { spec: { type: 'edges', edges: ok.length ? ok : edges, ok: ok.length > 0, height: 1.1 }, ok: ok.length > 0, cost: -refund, n: ok.length, msg: ok.length ? '' : 'No fence here', label: ok.length > 1 ? ok.length + ' panels' : '',
        run: function () { var n = 0, c = 0; ok.forEach(function (e) { var r = Z.Sim.removeFence(e); if (r.ok) { n++; c += r.cost; } }); return { n: n, cost: c }; } };
    }
    var pts = d.pts || [d.a], seen = {}, tiles = [], rm = [], refund2 = 0;
    pts.forEach(function (q) { var k = q.i + ',' + q.j; if (!seen[k]) { seen[k] = 1; tiles.push(q); } });
    tiles.forEach(function (q) { var r = Z.Sim.bulldoze(q.i, q.j, { dry: true }); if (r.ok) { rm.push(q); refund2 -= r.cost; } });
    return { spec: { type: 'tiles', tiles: rm.length ? expandObjTiles(rm) : tiles, ok: rm.length > 0 }, ok: rm.length > 0, cost: -refund2, n: rm.length, msg: rm.length ? '' : 'Nothing to remove here', label: rm.length > 1 ? rm.length + ' tiles' : '',
      run: function () { var n = 0, c = 0; rm.forEach(function (q) { var r = Z.Sim.bulldoze(q.i, q.j); if (r.ok) { n++; c += r.cost; } }); return { n: n, cost: c }; } };
  };
  function expandObjTiles(list) {
    var S = Z.state, out = [], seen = {};
    list.forEach(function (q) {
      var id = S.tileObj[q.i + q.j * N], o = null;
      if (id) { for (var k = 0; k < S.objects.length; k++) if (S.objects[k].id === id) { o = S.objects[k]; break; } }
      if (o) { var fp = Z.Sim.footprint(o.type, o.i, o.j, o.rot); for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) { var kk = (fp.i0 + a) + ',' + (fp.j0 + b); if (!seen[kk]) { seen[kk] = 1; out.push({ i: fp.i0 + a, j: fp.j0 + b }); } } }
      else { var k2 = q.i + ',' + q.j; if (!seen[k2]) { seen[k2] = 1; out.push(q); } }
    });
    return out;
  }

  function planFor(d) {
    var t = UI.tool; if (!t || !d || !d.a) return null;
    var f = PLAN[t.kind]; return f ? f(d) : null;
  }
  Tools.lastPlan = function () { return lastPlan; };   // test hook: the plan behind the preview (ok, msg, cost, label)
  function applyPlan(plan, x, y, touch) {
    lastPlan = plan;
    if (!plan) { clearPreview(); return; }
    if (plan.spec) Z.World.setPreview(plan.spec); else Z.World.setPreview(null);
    var txt = plan.free ? plan.label : (plan.cost ? (plan.cost < 0 ? '+' : '') + fmt(Math.abs(plan.cost)) : (plan.ok ? 'Free' : ''));
    if (UI.tool.kind === 'bulldoze' && plan.ok) txt = '+' + fmt(Math.abs(plan.cost)) + ' back';
    var dd0 = drag || hover, anc = dd0 && (dd0.b || dd0.a);
    if (!plan.ok && anc && Z.Sim.inMap && !Z.Sim.inMap(anc.i, anc.j)) { plan.msg = 'Outside your land'; plan.cost = 0; txt = 'Outside your land'; }
    var sub = plan.ok ? ((plan.label && !plan.free ? plan.label : '') + (plan.warn ? (plan.label ? ' - ' : '') + plan.warn : '')) : plan.msg;
    if (txt === 'Outside your land') sub = '';
    if (!plan.ok && !txt) txt = plan.msg, sub = '';
    else if (!plan.ok && plan.cost) txt = fmt(plan.cost);
    showCost(x, y, txt, sub, plan.ok, touch);
    // animal forecast
    if (el.forecast) {
      var f = plan.forecast;
      if (f) {
        var pct = Math.round(f.value * 100), col = !plan.ok ? 'var(--bad)' : pct >= 70 ? 'var(--good)' : pct >= 45 ? '#c88a10' : 'var(--bad)';
        el.forecast.classList.add('on'); el.forecast.firstChild.textContent = plan.ok ? pct + '%' : '--'; el.forecast.firstChild.style.color = col;
        var detail = el.forecast.lastChild;
        detail.textContent = '';
        detail.appendChild(h('b', { text: f.enc.name }));
        detail.append(!plan.ok ? ' · ' + plan.msg : ' would suit it ' + (pct >= 70 ? 'well' : pct >= 45 ? 'so-so' : 'poorly') + (f.issues.length ? '. ' + f.issues.slice(0, 2).join('. ') + '.' : '. Lovely!'));
      } else { el.forecast.classList.add('on'); el.forecast.firstChild.textContent = '--'; el.forecast.firstChild.style.color = ''; el.forecast.lastChild.textContent = plan.msg || 'Fence an area first.'; }
    }
  }
  function refreshPlan() { if (UI.tool && (drag || hover)) applyPlan(planFor(drag || hover), (drag || hover).cx, (drag || hover).cy, (drag || hover).touch); }

  // ---------------------------------------------------------------- tool pointer handlers
  function mkDrag(x, y, touch) {
    var gp = pick(x, y); if (!gp) return null;
    var q = { a: gp, b: gp, pts: [{ i: gp.i, j: gp.j }], cx: x, cy: y, touch: touch, moved: false };
    return q;
  }
  function toolDown(x, y, type) {
    var touch = type !== 'mouse'; drag = mkDrag(x, y, touch);
    if (!drag) { clearPreview(); return; }
    drag.start = { x: x, y: y }; refreshPlan();
    if (UI.tool && UI.tool.kind === 'sculpt') { sculptStop(); sculptDown(x, y, touch); }
  }
  function toolMove(x, y) {
    if (!drag) { var d0 = mkDrag(x, y, ptrs && Object.keys(ptrs).length && ptrs[Object.keys(ptrs)[0]].type !== 'mouse'); if (d0) { drag = d0; } else return; }
    var gp = pick(x, y); if (!gp) return;
    var last = drag.pts[drag.pts.length - 1];
    if (gp.i !== last.i || gp.j !== last.j) {
      var seg = tilesBetween(last, { i: gp.i, j: gp.j }); for (var k = 1; k < seg.length; k++) drag.pts.push(seg[k]);
      if (drag.pts.length > 4000) drag.pts.splice(0, 1000);
    }
    drag.b = gp; drag.cx = x; drag.cy = y;
    if (Math.hypot(x - drag.start.x, y - drag.start.y) > TAP_PX) drag.moved = true;
    refreshPlan();
  }
  function toolUp(x, y, type) {
    if (!drag) { sculptStop(); return; }
    if (UI.tool && UI.tool.kind === 'sculpt') { sculptUp(x, y, type); return; }
    var touch = type !== 'mouse', gp = pick(x, y);
    if (gp) { drag.b = gp; drag.cx = x; drag.cy = y; }
    drag.committing = true;
    var plan = planFor(drag);
    var d = drag, drag0 = drag; drag = null;
    if (plan && plan.ok) {
      var sl = strokeLabel(); Z.Sim.beginStroke(sl); var res; try { res = plan.run(); } finally { Z.Sim.endStroke(); } var spent = res.cost;
      UI.updateUndo && UI.updateUndo(true);
      if (res.n > 0) {
        UI.snd('build'); flashCost(x, y, (spent < 0 ? '+' : '-') + fmt(Math.abs(spent)) + (res.n > 1 ? '' : ''), true);
        if (UI.Tutorial) UI.Tutorial.onBuilt && UI.Tutorial.onBuilt(UI.tool);
      } else if (!res.silent) { UI.snd('bad'); if (plan.msg) UI.toast(plan.msg, 'bad'); }
    } else if (plan) {
      UI.snd('bad'); if (plan.msg) flashCost(x, y, plan.msg, false);
      if (UI.tool && UI.tool.kind === 'animal' && plan.msg) { var r2 = Z.Sim.addAnimal(UI.tool.id, drag0.b.i, drag0.b.j, { dry: true }); var fx2 = UI.whyFix && UI.whyFix(r2.code); if (fx2) UI.toast(fx2[0] + ' (' + plan.msg + ')', 'info'); }
    }
    // keep a hover preview on mouse, drop it on touch
    if (!UI.tool) return;
    if (touch) { clearPreview(); hover = null; } else { hover = mkDrag(x, y, false); refreshPlan(); }
  }
  function strokeLabel() {
    var t = UI.tool, k = t.kind;
    if (k === 'fence') return t.mode === 'rect' ? 'enclosure fence' : 'fence line';
    if (k === 'path') return 'path';
    if (k === 'terrain') return t.name.toLowerCase() + ' terrain';
    if (k === 'sculpt') return t.name.toLowerCase().replace(/ \(.*\)/, '');
    if (k === 'bulldoze') return 'bulldoze';
    return (t.name || t.id || k).toLowerCase();
  }
  function toolAbort() { sculptStop(); drag = null; clearPreview(); }
  function onHover(x, y) {
    if (!UI.tool || UI.tool.move || nptr) return;
    hover = mkDrag(x, y, false); if (hover) refreshPlan(); else clearPreview();
  }
  Tools.update = function () {
    // keep affordability up to date when idle
    if (UI.tool && hover && !drag && !nptr) refreshPlan();
  };
  Tools.current = function () { return UI.tool; };
  // extension points for other packages (moats): add PLAN kinds and strip controls
  Tools.PLAN = PLAN; Tools.refresh = refreshPlan; Tools.failMsg = failMsg; Tools.tilesBetween = tilesBetween;
  UI.markTabs = function () { if (UI.groupMark) { UI.groupMark(); return; } Array.prototype.forEach.call(el.tabs.children, function (b) { b.classList.toggle('on', b.getAttribute('data-cat') === UI.cat); }); };
})();


