// ===== 64-portrait.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - live 3D animal portraits (species sheet, inspect panel, reveal cards).
   Z.UI.Portrait.mount(containerEl, {species, animal?, size?}) -> {destroy()}
   - One shared renderer (the thumbnail renderer from Z.Models.thumbRenderer, so no extra WebGL context) draws every visible portrait
     one after another into its own small 2D canvas. Nothing renders while a portrait is hidden / disconnected; disconnected portraits
     destroy themselves, and the render loop stops when none are left.
   - Fit: camera distance comes from the model's real vertex bounding sphere (Z.Models.measure) so no rotation or tilt can crop it.
   - Controls: drag to spin / tilt, pinch or wheel to zoom (limited), double-tap or double-click to reset; auto-spin pauses while touching.
   - Any species id that Z.Models knows works; anything else leaves the container's static content untouched. */
(function () {
  'use strict';
  var UI = Z.UI, T = window.THREE;
  var Portrait = UI.Portrait = {};
  var PX = 256, FOV = 30, SINH = Math.sin(FOV * Math.PI / 360), AUTO = 0.45, TILT0 = 0.3, TILT_MIN = 0.02, TILT_MAX = 0.75, ZMIN = 0.55, ZMAX = 1.15, RESUME = 1.6;
  var R = null, scene = null, cam = null, discGeo = null, discMat = null, failed = false, list = [], raf = 0, last = 0, cache = {};
  var IDLE = { state: 'idle', speed: 0 };

  var css = document.createElement('style');
  css.textContent = '.p3d-w{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}' +
    '.p3d-w canvas{width:100%;height:auto;max-height:100%;display:block;touch-action:none;-webkit-tap-highlight-color:transparent}' +
    '.sil .p3d-w canvas{filter:brightness(0) opacity(.55)}' +
    '#panel .pth.p3d{width:108px;height:108px;border-radius:14px}';
  document.head.appendChild(css);

  function init() {
    if (R) return true; if (failed) return false;
    try {
      R = Z.Models && Z.Models.thumbRenderer ? Z.Models.thumbRenderer() : null;
      if (!R || !T) throw new Error('no renderer');
      scene = new T.Scene();
      scene.add(new T.HemisphereLight(0xffffff, 0x8a9070, 0.85));
      var d = new T.DirectionalLight(0xfff2dc, 0.8); d.position.set(-3, 6, 5); scene.add(d);
      cam = new T.PerspectiveCamera(FOV, 1, 0.1, 100);
      discGeo = new T.CylinderGeometry(1, 1, 0.05, 40);
      discMat = new T.MeshLambertMaterial({ color: 0xc4b080 });
      R.domElement.addEventListener('webglcontextlost', function () { teardownAll(); R = null; failed = true; }, false);
    } catch (e) { R = null; failed = true; return false; }
    return true;
  }

  // model + framing info, cached per species/age/sex (measured in the neutral idle pose)
  function tsig(tr) { return tr && tr.length ? tr.slice().sort().join(',') : ''; }
  function build(species, baby, sex, tr, seed) {
    var m = Z.Models.createAnimal(species, { baby: baby, sex: sex, traits: tr, seed: seed });   // individual trait looks and hybrid mods (32-models-mods.js) come through here
    if (!m || !m.group) return null;
    for (var i = 0; i < 8; i++) m.update(0.05, IDLE);
    return m;
  }
  function infoFor(species, baby, sex, m, tr) {
    var key = species + '|' + (baby ? 1 : 0) + '|' + sex + '|' + tsig(tr), c = cache[key];
    if (c) return c;
    var ms = Z.Models.measure(m.group), dy = ms.cy - ms.minY, rd = ms.rh * 1.08;
    var rr = Math.max(ms.r, Math.sqrt(rd * rd + dy * dy)) * 1.07;      // 7% margin for idle motion and perspective
    c = { cx: ms.cx, cy: ms.cy, cz: ms.cz, R: rr, rd: rd, dy: dy, hx: rd, hz: rd, hy: Math.max(0.01, ms.maxY - ms.minY) / 2 };
    try {                                                            // box half extents about the centre: lets long animals be fitted to their silhouette at the current angle
      var bx = new T.Box3().setFromObject(m.group), sz = bx.getSize(new T.Vector3());
      if (isFinite(sz.x + sz.y + sz.z) && sz.x > 0 && sz.z > 0) { c.hx = Math.max(0.05, sz.x / 2) * 1.04; c.hz = Math.max(0.05, sz.z / 2) * 1.04; c.hy = Math.max(0.05, sz.y / 2) * 1.04; }
    } catch (e) { }
    var lo = Math.min(c.hx, c.hz), hi = Math.max(c.hx, c.hz);
    c.wide = !baby && hi / Math.max(lo, 0.01) > 1.9 && hi / Math.max(c.hy, 0.01) > 1.7 ? Math.min(1.7, 0.9 + hi / Math.max(c.hy * 2.6, 0.01) * 0.35) : 1;   // aspect of the picture: long, low animals get a wider frame
    if (baby) {                                                      // babies are framed against the adult so they look small
      var am = build(species, false, sex, tr, undefined);
      if (am) { var ai = infoFor(species, false, sex, am, tr); c.R = Math.max(c.R, ai.R * 0.62); }
    }
    return (cache[key] = c);
  }

  Portrait.supported = function (species) {
    try { return !!(Z.Models && Z.Models.speciesIds && Z.Models.speciesIds().indexOf(species) >= 0 && Z.Models.measure && Z.Models.thumbRenderer); } catch (e) { return false; }
  };

  Portrait.mount = function (box, opts) {
    var noop = { destroy: function () { } };
    try {
      opts = opts || {}; var species = opts.species || (opts.animal && opts.animal.species);
      if (!box || !species || !Portrait.supported(species) || !init()) return noop;
      var an = opts.animal || {}, baby = !!(opts.baby !== undefined ? opts.baby : an.baby), sex = (opts.sex || an.sex) === 'f' ? 'f' : 'm';
      var tr = opts.traits || an.traits, seed = opts.seed !== undefined ? opts.seed : an.id;
      var m = build(species, baby, sex, tr, seed); if (!m) return noop;
      var info = infoFor(species, baby, sex, m, tr);
      var pivot = new T.Group(), model = m.group, disc = new T.Mesh(discGeo, discMat);
      model.position.set(-info.cx, -info.cy, -info.cz); pivot.add(model);
      disc.scale.set(info.wide > 1 ? info.hx * 1.04 : info.rd, 1, info.wide > 1 ? info.hz * 1.04 : info.rd); disc.position.y = -info.dy - 0.025; pivot.add(disc);
      pivot.visible = false; scene.add(pivot);
      var dpr = Math.min(2, window.devicePixelRatio || 1), css = opts.size || box.clientWidth || 96;
      var cv = document.createElement('canvas'); cv.width = Math.max(32, Math.min(PX, Math.round(css * dpr))); cv.height = Math.max(24, Math.round(cv.width / info.wide));
      var wrap = document.createElement('div'); wrap.className = 'p3d-w'; wrap.appendChild(cv);
      var saved = [], k, ch = box.children, pth = box.closest ? box.closest('.pth') : null;
      for (k = 0; k < ch.length; k++) { saved.push([ch[k], ch[k].style.display]); ch[k].style.display = 'none'; }
      box.appendChild(wrap); if (pth) pth.classList.add('p3d');
      var g2 = cv.getContext('2d');
      var p = {
        cv: cv, g2: g2, pivot: pivot, dcur: 0, upd: m.update, info: info, yaw: 0.6, tilt: TILT0, zoom: 1, vel: 0, drag: false, resume: 0, ptr: [], np: 0,
        px0: 0, py0: 0, pd0: 0, z0: 1, moved: 0, tapT: 0, dead: false, sig: cv.width
      };
      var pts = [{ id: -1, x: 0, y: 0 }, { id: -1, x: 0, y: 0 }];
      function idx(id) { return pts[0].id === id ? 0 : pts[1].id === id ? 1 : -1; }
      function count() { return (pts[0].id >= 0 ? 1 : 0) + (pts[1].id >= 0 ? 1 : 0); }
      function pdist() { var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y; return Math.sqrt(dx * dx + dy * dy) + 1; }
      p.cnt = function () { return [pts[0].id, pts[1].id, count()]; };
      function reset() { p.yaw = 0.6; p.tilt = TILT0; p.zoom = 1; p.vel = 0; p.resume = 0; }
      cv.addEventListener('pointerdown', function (e) {
        var s = idx(-1); if (s < 0) return; pts[s].id = e.pointerId; pts[s].x = e.clientX; pts[s].y = e.clientY;
        try { cv.setPointerCapture(e.pointerId); } catch (x) { }
        p.drag = true; p.vel = 0; p.moved = count() === 1 ? 0 : p.moved;
        if (count() === 2) { p.pd0 = pdist(); p.z0 = p.zoom; }
        e.preventDefault(); e.stopPropagation();
      });
      cv.addEventListener('pointermove', function (e) {
        var s = idx(e.pointerId); if (s < 0) return;
        var dx = e.clientX - pts[s].x, dy = e.clientY - pts[s].y; pts[s].x = e.clientX; pts[s].y = e.clientY;
        if (count() === 2) { p.zoom = Math.max(ZMIN, Math.min(ZMAX, p.z0 * p.pd0 / pdist())); p.moved += 99; }
        else { p.yaw += dx * 0.011; p.vel = dx * 0.011 * 30; p.tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, p.tilt + dy * 0.006)); p.moved += Math.abs(dx) + Math.abs(dy); }   // touch-action none: a swipe on the portrait spins/tilts it and never scrolls the panel; swipes elsewhere scroll
        e.preventDefault();
      });
      function up(e) {
        var s = idx(e.pointerId); if (s < 0) return; pts[s].id = -1;
        try { cv.releasePointerCapture(e.pointerId); } catch (x) { }
        if (count() === 0) {
          p.drag = false; p.resume = performance.now() / 1000 + RESUME;
          if (p.moved < 8) { var t = performance.now(); if (t - p.tapT < 380) { reset(); p.tapT = 0; } else p.tapT = t; }
        } else { var o = pts[0].id >= 0 ? 0 : 1; p.moved += 99; pts[o].x = pts[o].x; }
        e.preventDefault();
      }
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', function (e) { p.moved += 99; up(e); });
      cv.addEventListener('dblclick', function (e) { reset(); e.preventDefault(); });
      cv.addEventListener('wheel', function (e) { p.zoom = Math.max(ZMIN, Math.min(ZMAX, p.zoom * Math.exp(e.deltaY * 0.0015))); p.resume = performance.now() / 1000 + RESUME; e.preventDefault(); }, { passive: false });
      p.destroy = function () {
        if (p.dead) return; p.dead = true;
        var i = list.indexOf(p); if (i >= 0) list.splice(i, 1);
        scene.remove(pivot);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        for (var j = 0; j < saved.length; j++) saved[j][0].style.display = saved[j][1];
        if (pth) pth.classList.remove('p3d');
      };
      list.push(p); if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      render(p, 0.016, performance.now() / 1000);
      return { destroy: p.destroy };
    } catch (e) { try { console.warn('portrait: ' + e.message); } catch (x) { } return noop; }
  };

  Portrait._dbg = function () { return list.map(function (p) { var r = p.cv.getBoundingClientRect(); return { yaw: p.yaw, tilt: p.tilt, zoom: p.zoom, pts: p.cnt && p.cnt(), dcur: p.dcur, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }; }); };   // test hook
  Portrait._set = function (i, o) { var p = list[i]; if (!p) return false; if (o.yaw !== undefined) p.yaw = o.yaw; if (o.tilt !== undefined) p.tilt = o.tilt; if (o.zoom !== undefined) p.zoom = o.zoom; p.resume = performance.now() / 1000 + 100; p.dcur = 0; return true; };   // test hook
  function teardownAll() { for (var i = list.length - 1; i >= 0; i--) list[i].destroy(); }

  // camera distance: never farther than the bounding-sphere fit (nothing can crop), but closer when the silhouette at the current angle is smaller (long animals seen end-on)
  var TANH = Math.tan(FOV * Math.PI / 360);
  function fitDist(p) {
    var i = p.info, dS = i.R / SINH;
    if (!(i.hx > 0)) return dS;
    var c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw)), w = i.hx * c + i.hz * s, dep = i.hx * s + i.hz * c;
    var dd = i.wide > 1 ? dep * 1.06 : Math.max(dep, i.rd || 0), hgt = i.hy * Math.cos(p.tilt) + (dd + 0.04 * i.R) * Math.sin(p.tilt) + 0.03 * i.R, wd = i.wide || 1;
    var ct = Math.cos(p.tilt), st = Math.sin(p.tilt), dF = Math.max((w * 1.16) / TANH + dep * 0.55, (hgt * wd * 1.1) / TANH + dd * ct - i.hy * st);   // width fit, and height fit measured to the nearest bottom point of the disc (perspective)
    var tgt = wd > 1 ? Math.max(dF, dS * 0.4) : Math.min(dS, Math.max(dF, dS * 0.55));   // wide canvas shows only a centre band: the sphere cap would crop it
    p.dcur = p.dcur ? p.dcur + (tgt - p.dcur) * 0.18 : tgt;      // eased so the picture does not pump while it spins
    return p.dcur;
  }
  function render(p, dt, now) {
    p.upd(dt, IDLE);
    if (!p.drag && now > p.resume) p.yaw += (UI.reducedMotion && UI.reducedMotion() ? 0 : AUTO) * dt;   // reduced motion: no auto-spin (drag still works)
    if (!p.drag && p.vel !== 0) { p.yaw += p.vel * dt; p.vel *= Math.max(0, 1 - 4 * dt); if (Math.abs(p.vel) < 0.01) p.vel = 0; }
    p.pivot.rotation.y = p.yaw;
    var d = fitDist(p) * p.zoom;
    cam.position.set(0, Math.sin(p.tilt) * d, Math.cos(p.tilt) * d); cam.near = d * 0.1; cam.far = d * 4; cam.updateProjectionMatrix(); cam.lookAt(0, 0, 0);
    for (var i = 0; i < list.length; i++) list[i].pivot.visible = list[i] === p;
    if (R.domElement.width !== PX) R.setSize(PX, PX, false);
    R.render(scene, cam);
    var cv = p.cv; p.g2.clearRect(0, 0, cv.width, cv.height);
    if (p.info.wide > 1) { var bh = PX / p.info.wide; p.g2.drawImage(R.domElement, 0, (PX - bh) / 2, PX, bh, 0, 0, cv.width, cv.height); }   // centre band of the square render
    else p.g2.drawImage(R.domElement, 0, 0, cv.width, cv.height);
    p.pivot.visible = false;
  }

  function tick(now) {
    raf = 0; if (!list.length || !R) return;
    raf = requestAnimationFrame(tick);
    if (now - last < 30) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    if (document.hidden) return;
    var t = now / 1000;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      if (!p.cv.isConnected) { p.destroy(); continue; }
      if (!p.cv.getClientRects().length) continue;               // panel closed / tab hidden: paused
      render(p, dt, t);
    }
  }
})();
