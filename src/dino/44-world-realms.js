// ===== 44-world-realms.js =====
// Realms package, world side: sunk tank basins (vertex hook in 40-world calcVertex), glass tank walls + water volumes, sea-bed trenches under sea tunnels, the walk structures
// (acrylic tunnel, mesh walk, glass pier, armoured skywalk), the tall clear-view Aviary dome with storm crackle, virtual-zone geofence shimmer + beacon posts, tower range rings,
// animal tags, and the underwater tint for street view inside tunnels. Hooks in 40-world.js call Z.RealmsWorld.{vtx, isWalk, deckY, preRender}; sea nets are the 'net' fence style.
(function () {
  'use strict';
  var N = Z.N, T = Z.TILE, NN = N * N, D = Z.DATA, RD = D.realms, PI = Math.PI;
  var RW = Z.RealmsWorld = {};
  var SEA_Y = -0.1, PY = 0.045, PIER_Y = 0.42, TRENCH_Y = -3.1, ARCH = 0.95, WALLH = 1.0, TUN_H = WALLH + ARCH;   // QA visual: tunnels are tall enough to stand in (guests are about 1.4 high)
  var scene = null, root = null, dirty = true, zoneSig = '', overlayOn = false, rangeObj = 0, t0 = 0;
  var tunLow = new Float32Array(NN), floorOf = new Float32Array(NN), tankId = new Int32Array(NN), walkOf = new Uint8Array(NN), trenchOf = new Uint8Array(NN), anyTank = false, anyTrench = false, anyWalk = false;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) {
    N = n; NN = n * n;
    tunLow = new Float32Array(NN); floorOf = new Float32Array(NN); tankId = new Int32Array(NN); walkOf = new Uint8Array(NN); trenchOf = new Uint8Array(NN);
    dirty = true;
  });
  var pathWalk = [];   // path id -> walk code
  function S() { return Z.state; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function gy(x, z) { return Z.World.groundY(x, z); }
  var WCODE = { tunnel: 1, mesh: 2, pier: 3, sky: 4 };
  function buildPathWalk() { pathWalk = []; (D.paths || []).forEach(function (p, k) { pathWalk[k + 1] = p.walk ? WCODE[p.walk] : 0; }); }
  buildPathWalk();

  // ---------------------------------------------------------------- per-tile caches
  function refreshCache() {
    var s = S(); anyTank = anyTrench = anyWalk = false;
    floorOf.fill(NaN); tunLow.fill(NaN); tankId.fill(0); walkOf.fill(0); trenchOf.fill(0);
    if (!s || !s.path) return;
    var k, t, e, sim = Z.Sim;
    for (k = 0; k < s.enclosures.length; k++) {
      e = s.enclosures[k]; if (e.kind !== 'tank' || e.floor === undefined) continue;
      for (t = 0; t < e.tiles.length; t++) { floorOf[e.tiles[t]] = e.floor; tankId[e.tiles[t]] = e.id; anyTank = true; }
    }
    for (t = 0; t < NN; t++) {
      var pv = s.path[t]; if (!pv) continue; var w = pathWalk[pv]; if (!w) continue;
      walkOf[t] = w; anyWalk = true;
      if (w === 1 && tankId[t]) { var te = s.enclosures.filter(function (q) { return q.id === tankId[t]; })[0]; if (te && te.surf !== undefined) tunLow[t] = te.surf - TUN_H - 0.35; }   // a tunnel through a tank sits in a deeper channel
      if (w === 1 && sim && sim.isSea && sim.isSea(t % N, (t / N) | 0)) { trenchOf[t] = 1; anyTrench = true; }
    }
  }
  var OUT = { drop: 0, k: 0.9, r: 0.8, g: 0.74, b: 0.55 };
  var SAND = [0.82, 0.76, 0.58], SEABED = [0.5, 0.55, 0.5];
  var _tl = [0, 0, 0, 0];
  // the tiles around vertex (a,b) of the half-tile grid; returns the count (tiles outside the grid are skipped)
  function around(a, b) {
    var ea = a & 1, eb = b & 1, n = 0, i, j;
    if (ea && eb) { _tl[n++] = ((a - 1) >> 1) + ((b - 1) >> 1) * N; }
    else if (ea) { i = (a - 1) >> 1; j = b >> 1; if (j > 0) _tl[n++] = i + (j - 1) * N; if (j < N) _tl[n++] = i + j * N; }
    else if (eb) { i = a >> 1; j = (b - 1) >> 1; if (i > 0) _tl[n++] = (i - 1) + j * N; if (i < N) _tl[n++] = i + j * N; }
    else { i = a >> 1; j = b >> 1; if (i > 0 && j > 0) _tl[n++] = (i - 1) + (j - 1) * N; if (j > 0 && i < N) _tl[n++] = i + (j - 1) * N; if (i > 0 && j < N) _tl[n++] = (i - 1) + j * N; if (i < N && j < N) _tl[n++] = i + j * N; }
    return n;
  }
  RW.vtx = function (a, b, hgt) {
    if (!anyTank && !anyTrench) return null;
    var n = around(a, b), k, all = true, cnt = 0, id = 0;
    if (anyTank) {
      for (k = 0; k < n; k++) { var f = floorOf[_tl[k]]; if (f !== f) { all = false; break; } if (!id) id = tankId[_tl[k]]; else if (tankId[_tl[k]] !== id) { all = false; break; } }
      if (all && n > 0) {
        var fl = floorOf[_tl[0]], nt = 0, tm = 99; for (k = 0; k < n; k++) { var tl2 = tunLow[_tl[k]]; if (tl2 === tl2) { nt++; if (tl2 < tm) tm = tl2; } }
        if (nt && tm < fl) fl = tm;
        var d = hgt - fl; if (d > 0.01) { OUT.drop = d; OUT.k = 0.88; OUT.r = SAND[0]; OUT.g = SAND[1]; OUT.b = SAND[2]; return OUT; }
        return null;
      }
    }
    if (anyTrench) {
      for (k = 0; k < n; k++) if (trenchOf[_tl[k]]) cnt++;
      if (cnt) { var d2 = hgt - TRENCH_Y; if (d2 > 0.01) { OUT.drop = d2; OUT.k = 0.7; OUT.r = SEABED[0]; OUT.g = SEABED[1]; OUT.b = SEABED[2]; return OUT; } }
    }
    return null;
  };
  RW.isWalk = function (i, j) { return anyWalk && walkOf[i + j * N] > 0; };
  RW.walkAt = function (i, j) { return walkOf[i + j * N] || 0; };
  RW.tunnelY = function (x, z) {   // floor of an acrylic tunnel (street view stands on it, not on the water above)
    if (!anyWalk) return null; var i = (x / T) | 0, j = (z / T) | 0; if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return walkOf[i + j * N] === 1 ? gy(x, z) + PY : null;
  };
  RW.tunnelTop = function (x, z) {   // roof height of an acrylic tunnel (sea animals swim over it, never through it)
    if (!anyWalk) return null; var i = (x / T) | 0, j = (z / T) | 0; if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return walkOf[i + j * N] === 1 ? gy((i + 0.5) * T, (j + 0.5) * T) + PY + TUN_H : null;
  };
  RW.deckY = function (x, z) {
    if (!anyWalk) return null; var i = (x / T) | 0, j = (z / T) | 0; if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return walkOf[i + j * N] === 3 ? PIER_Y : null;
  };

  // ---------------------------------------------------------------- tiny geometry builder (flat colours)
  function GB() { this.p = []; this.c = []; }
  GB.prototype.tri = function (a, b, c, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); var r = (col >> 16 & 255) / 255, g = (col >> 8 & 255) / 255, bl = (col & 255) / 255; this.c.push(r, g, bl, r, g, bl, r, g, bl); };
  GB.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  GB.prototype.box = function (x0, y0, z0, x1, y1, z1, col) {
    var a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y0, z1], d = [x0, y0, z1], e = [x0, y1, z0], f = [x1, y1, z0], g = [x1, y1, z1], h = [x0, y1, z1];
    this.quad(e, h, g, f, col); this.quad(a, e, f, b, shade(col, 0.8)); this.quad(d, c, g, h, shade(col, 0.85)); this.quad(a, d, h, e, shade(col, 0.75)); this.quad(b, f, g, c, shade(col, 0.9));
  };
  GB.prototype.empty = function () { return !this.p.length; };
  GB.prototype.geo = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  };
  function shade(col, f) { var r = Math.min(255, (col >> 16 & 255) * f) | 0, g = Math.min(255, (col >> 8 & 255) * f) | 0, b = Math.min(255, (col & 255) * f) | 0; return (r << 16) | (g << 8) | b; }
  var mats = {};
  function lam() { return mats.lam || (mats.lam = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); }
  function glass(op) { var k = 'g' + op; return mats[k] || (mats[k] = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })); }
  function glow() { return mats.glow || (mats.glow = new THREE.MeshBasicMaterial({ vertexColors: true })); }
  var built = [];   // meshes to dispose on rebuild
  function add(geoBuilder, mat, order) {
    if (geoBuilder.empty()) return null;
    var m = new THREE.Mesh(geoBuilder.geo(), mat); m.frustumCulled = false; if (order) m.renderOrder = order; root.add(m); built.push(m); return m;
  }
  function clearBuilt() { built.forEach(function (m) { root.remove(m); if (m.geometry) m.geometry.dispose(); }); built.length = 0; if (domeLines) { domeLines.forEach(function (l) { root.remove(l); l.geometry.dispose(); }); } domeLines = []; sparkPool = []; zoneMats = []; }

  // ---------------------------------------------------------------- tanks: glass walls, rim, water
  function tileIn(enc, i, j) { return i >= 0 && j >= 0 && i < N && j < N && S().tileEnc[i + j * N] === enc.id; }
  function buildTank(enc) {
    var fr = new GB(), gl = new GB(), wtSurf = new GB(), wtWall = new GB(), s = S(), floor = enc.floor, top = enc.surf + 0.32, wallCol = enc.wall >= 3 ? 0x6e7b86 : enc.wall === 2 ? 0x8a9aa6 : 0xa9b6bf;
    var surfCol = 0x2fa3b8;
    enc.tiles.forEach(function (t) {
      var i = t % N, j = (t - i) / N, x0 = i * T, z0 = j * T, x1 = x0 + T, z1 = z0 + T;
      wtSurf.quad([x0, enc.surf, z0], [x0, enc.surf, z1], [x1, enc.surf, z1], [x1, enc.surf, z0], surfCol);
      var dirs = [[0, -1, x0, z0, x1, z0], [0, 1, x0, z1, x1, z1], [-1, 0, x0, z0, x0, z1], [1, 0, x1, z0, x1, z1]];
      dirs.forEach(function (d) {
        var ni = i + d[0], nj = j + d[1]; if (tileIn(enc, ni, nj)) return;
        var nt = ni + nj * N, hasOut = ni >= 0 && nj >= 0 && ni < N && nj < N && (walkOf[nt] === 1 || s.path[nt] > 0);
        var tw = walkOf[t] === 1;
        var ax = d[2], az = d[3], bx = d[4], bz = d[5], ya = floor - 0.25;
        if (tw && hasOut) {   // portal: frame above the opening only on the edge meeting an outside tunnel/path
          var cx = (ax + bx) / 2, cz = (az + bz) / 2, hw = 0.95;
          var ox = d[0] ? 0 : 1, oz = d[0] ? 1 : 0;   // along the wall
          var p0 = [cx - ox * T / 2, 0, cz - oz * T / 2], p1 = [cx + ox * T / 2, 0, cz + oz * T / 2];
          var tlow = tunLow[t], fb = tlow === tlow ? Math.min(floor, tlow) : floor, yo = fb + TUN_H + 0.1;
          gl.quad([p0[0], yo, p0[2]], [p1[0], yo, p1[2]], [p1[0], top, p1[2]], [p0[0], top, p0[2]], 0xbfe9f3);
          fr.box(Math.min(p0[0], p1[0]) - 0.04, fb - 0.2, Math.min(p0[2], p1[2]) - 0.04, Math.max(p0[0], p1[0]) + 0.04, yo, Math.max(p0[2], p1[2]) + 0.04, 0x8d9aa3);
          return;
        }
        gl.quad([ax, ya, az], [bx, ya, bz], [bx, top, bz], [ax, top, az], 0xbfe9f3);
        // water-side tint just inside the glass
        var inx = -d[0] * 0.03, inz = -d[1] * 0.03;
        wtWall.quad([ax + inx, floor, az + inz], [bx + inx, floor, bz + inz], [bx + inx, enc.surf, bz + inz], [ax + inx, enc.surf, az + inz], 0x1f8aa6);
        // plinth and rim bar
        fr.box(Math.min(ax, bx) - 0.06 + (d[1] ? 0 : -d[0] * 0.02), floor - 0.3, Math.min(az, bz) - 0.06 + (d[0] ? 0 : -d[1] * 0.02), Math.max(ax, bx) + 0.06, floor + 0.2, Math.max(az, bz) + 0.06, shade(wallCol, 0.8));
        fr.box(Math.min(ax, bx) - 0.07, top - 0.1, Math.min(az, bz) - 0.07, Math.max(ax, bx) + 0.07, top + 0.05, Math.max(az, bz) + 0.07, wallCol);
      });
      // corner mullions
      [[x0, z0, -1, -1], [x1, z0, 1, -1], [x0, z1, -1, 1], [x1, z1, 1, 1]].forEach(function (c) {
        var ai = (c[0] / T) | 0, aj = (c[1] / T) | 0, n = 0;
        [[-1, -1], [0, -1], [-1, 0], [0, 0]].forEach(function (o) { if (tileIn(enc, ai + o[0], aj + o[1])) n++; });
        if (n === 1 || n === 3) fr.box(c[0] - 0.06, floor - 0.3, c[1] - 0.06, c[0] + 0.06, top + 0.05, c[1] + 0.06, wallCol);
      });
    });
    add(fr, lam()); add(wtWall, glass(0.34), 3); add(wtSurf, glass(0.34), 4); add(gl, glass(0.13), 4);
  }
  RW.tankWater = function () { return true; };

  // ---------------------------------------------------------------- walks
  function wAt(i, j) { return i >= 0 && j >= 0 && i < N && j < N ? walkOf[i + j * N] : 0; }
  function buildWalks() {
    var fr = new GB(), gl = new GB(), dk = new GB(), lt = new GB(), pg = new GB(), t, s = S();
    for (t = 0; t < NN; t++) {
      var w = walkOf[t]; if (!w) continue;
      var i = t % N, j = (t - i) / N, x0 = i * T, z0 = j * T, cx = x0 + T / 2, cz = z0 + T / 2, base = gy(cx, cz) + PY;
      // orientation: along x when a walk neighbour is east/west, otherwise along z
      var hx = wAt(i - 1, j) === w || wAt(i + 1, j) === w, hz = wAt(i, j - 1) === w || wAt(i, j + 1) === w, alongX = hx || !hz;
      var endA = alongX ? wAt(i - 1, j) !== w : wAt(i, j - 1) !== w, endB = alongX ? wAt(i + 1, j) !== w : wAt(i, j + 1) !== w;
      function P(u, v, y) { return alongX ? [cx + u, y, cz + v] : [cx + v, y, cz + u]; }
      var h = T / 2;
      if (w === 3) {   // glass-bottom pier: planks either side, a glass strip down the middle, posts to the sea bed
        var y = PIER_Y, wood = 0x9b7a52, wood2 = 0x8a6a45;
        [-1, 1].forEach(function (sd) {
          var v0 = sd < 0 ? -0.95 : 0.4, v1 = sd < 0 ? -0.4 : 0.95, a = P(-h, v0, y), b = P(h, v1, y);
          dk.box(Math.min(a[0], b[0]), y - 0.1, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y, Math.max(a[2], b[2]), (i + j) & 1 ? wood : wood2);
          var r0 = P(-h, sd * 0.92, y), r1 = P(h, sd * 0.97, y + 0.9);
          fr.box(Math.min(r0[0], r1[0]) - 0.02, y, Math.min(r0[2], r1[2]) - 0.02, Math.max(r0[0], r1[0]) + 0.02, y + 0.06, Math.max(r0[2], r1[2]) + 0.02, 0xcdd6dc);   // rail foot (thin)
          var rp = P(0, sd * 0.94, y); fr.box(rp[0] - 0.04, y, rp[2] - 0.04, rp[0] + 0.04, y + 0.85, rp[2] + 0.04, 0xdde3e6);
          var ra = P(-h, sd * 0.94, y + 0.85), rb = P(h, sd * 0.94, y + 0.9); fr.box(Math.min(ra[0], rb[0]) - 0.03, y + 0.82, Math.min(ra[2], rb[2]) - 0.03, Math.max(ra[0], rb[0]) + 0.03, y + 0.9, Math.max(ra[2], rb[2]) + 0.03, 0xdde3e6);
          var pp = P(h * 0.7, sd * 0.85, y), bed = gy(pp[0], pp[2]); fr.box(pp[0] - 0.07, bed, pp[2] - 0.07, pp[0] + 0.07, y - 0.1, pp[2] + 0.07, 0x6b5a45);
        });
        var g0 = P(-h, -0.4, y - 0.03), g1 = P(h, 0.4, y - 0.03), g2 = P(-h, 0.4, y - 0.03), g3 = P(h, -0.4, y - 0.03);
        pg.quad([g0[0], y - 0.03, g0[2]], [g2[0], y - 0.03, g2[2]], [g1[0], y - 0.03, g1[2]], [g3[0], y - 0.03, g3[2]], 0xbdf3ff);   // the glass floor panel
        [-h + 0.03, 0, h - 0.03].forEach(function (u2) { var f0 = P(u2 - 0.04, -0.43, y - 0.07), f1 = P(u2 + 0.04, 0.43, y); fr.box(Math.min(f0[0], f1[0]), y - 0.07, Math.min(f0[2], f1[2]), Math.max(f0[0], f1[0]), y, Math.max(f0[2], f1[2]), 0xe8eef0); });   // frame bars
        [-1, 1].forEach(function (sd2) { var f2 = P(-h, sd2 * 0.43 - 0.03, y - 0.07), f3 = P(h, sd2 * 0.43 + 0.03, y); fr.box(Math.min(f2[0], f3[0]), y - 0.07, Math.min(f2[2], f3[2]), Math.max(f2[0], f3[0]), y, Math.max(f2[2], f3[2]), 0xe8eef0); });
        continue;
      }
      if (w === 1 || w === 2) {   // acrylic tunnel (water around) or mesh walk (dome): an arch of hoops with glass / mesh panels
        var R = w === 1 ? ARCH : 1.05, steps = 8, frCol = w === 1 ? 0xe4eaee : 0x7d8a8f, glCol = w === 1 ? 0xbfeaf5 : 0xdfe9e4;
        var WH = w === 1 ? WALLH : 0.9;   // straight side walls, then a half-round roof: tall enough to stand in
        function arc(u, k) { var a = PI * k / steps, v = -Math.cos(a) * R, y = base + WH + Math.sin(a) * R; return P(u, v, y); }
        for (var k = 0; k < steps; k++) {
          gl.quad(arc(-h, k), arc(h, k), arc(h, k + 1), arc(-h, k + 1), glCol);
        }
        [-1, 1].forEach(function (sd) { gl.quad(P(-h, sd * R, base), P(h, sd * R, base), P(h, sd * R, base + WH), P(-h, sd * R, base + WH), glCol); });
        var hoops = [-h + 0.02, -h / 2, 0, h / 2, h - 0.02];
        hoops.forEach(function (u, hi) {
          if ((hi === 1 || hi === 3) && w === 2) return;
          for (var q = 0; q < steps; q++) {
            var a0 = arc(u - 0.04, q), a1 = arc(u + 0.04, q), b0 = arc(u - 0.04, q + 1), b1 = arc(u + 0.04, q + 1), up = [0, 0.05, 0];
            fr.quad(a0, a1, b1, b0, frCol); fr.quad([a0[0], a0[1] + 0.04, a0[2]], [a1[0], a1[1] + 0.04, a1[2]], [b1[0], b1[1] + 0.04, b1[2]], [b0[0], b0[1] + 0.04, b0[2]], shade(frCol, 0.9));
          }
          [-1, 1].forEach(function (sd) { var q0 = P(u - 0.04, sd * R, base), q1 = P(u + 0.04, sd * R, base), q2 = P(u + 0.04, sd * R, base + WH), q3 = P(u - 0.04, sd * R, base + WH); fr.quad(q0, q1, q2, q3, frCol); fr.quad([q0[0], q0[1] + 0.03, q0[2]], [q1[0], q1[1] + 0.03, q1[2]], [q2[0], q2[1] + 0.03, q2[2]], [q3[0], q3[1] + 0.03, q3[2]], shade(frCol, 0.9)); });
        });
        var f0 = P(-h, -R, base - 0.01), f1 = P(h, R, base - 0.01);
        dk.box(Math.min(f0[0], f1[0]), base - 0.12, Math.min(f0[2], f1[2]), Math.max(f0[0], f1[0]), base - 0.02, Math.max(f0[2], f1[2]), w === 1 ? 0x56707f : 0x8a8f86);
        if (w === 1) { var a0r = P(-h, -0.07, base + TUN_H - 0.05), a1r = P(h, 0.07, base + TUN_H); lt.box(Math.min(a0r[0], a1r[0]), base + TUN_H - 0.06, Math.min(a0r[2], a1r[2]), Math.max(a0r[0], a1r[0]), base + TUN_H, Math.max(a0r[2], a1r[2]), 0xe6fcff); }   // roof light strip
        if (w === 1) {   // floor lights and a portal slab at open ends
          for (var sd = -1; sd <= 1; sd += 2) { var l0 = P(-h, sd * (R - 0.08), base + 0.02), l1 = P(h, sd * (R - 0.02), base + 0.07); lt.box(Math.min(l0[0], l1[0]), base, Math.min(l0[2], l1[2]), Math.max(l0[0], l1[0]), base + 0.07, Math.max(l0[2], l1[2]), 0x8fe9ff); }
          [[endA, -h], [endB, h]].forEach(function (e) { if (!e[0]) return; var a = P(e[1], -R - 0.25, base - 0.1), b = P(e[1] + (e[1] < 0 ? -0.2 : 0.2), R + 0.25, base + TUN_H * 1.1); fr.box(Math.min(a[0], b[0]), base - 0.1, Math.min(a[2], b[2]), Math.max(a[0], b[0]), base + TUN_H * 1.1, Math.max(a[2], b[2]), 0x8d9aa3); });
        }
        if (w === 2) { for (var sd2 = -1; sd2 <= 1; sd2 += 2) { var m0 = P(-h, sd2 * R, base), m1 = P(h, sd2 * R, base + 0.4); fr.box(Math.min(m0[0], m1[0]) - 0.03, base, Math.min(m0[2], m1[2]) - 0.03, Math.max(m0[0], m1[0]) + 0.03, base + 0.4, Math.max(m0[2], m1[2]) + 0.03, 0x6c7a70); } }
        continue;
      }
      if (w === 4) {   // armoured skywalk: a steel corridor with narrow windows and a flat roof
        var hw = 0.92, ht = 2.05, steel = 0x5b6770;
        [-1, 1].forEach(function (sd) {
          var a = P(-h, sd * hw, base), b = P(h, sd * hw + sd * 0.12, base + ht);
          fr.box(Math.min(a[0], b[0]), base, Math.min(a[2], b[2]), Math.max(a[0], b[0]), base + 1.0, Math.max(a[2], b[2]), steel);
          var c0 = P(-h, sd * hw, base + 1.0), c1 = P(h, sd * hw + sd * 0.12, base + 1.5);
          gl.quad([c0[0], base + 1.0, c0[2]], [c1[0], base + 1.0, c1[2]], [c1[0], base + 1.5, c1[2]], [c0[0], base + 1.5, c0[2]], 0x9bd6e8);
          fr.box(Math.min(c0[0], c1[0]), base + 1.5, Math.min(c0[2], c1[2]), Math.max(c0[0], c1[0]), base + ht, Math.max(c0[2], c1[2]), steel);
        });
        var r0 = P(-h, -hw - 0.15, base + ht), r1 = P(h, hw + 0.15, base + ht + 0.14); fr.box(Math.min(r0[0], r1[0]), base + ht, Math.min(r0[2], r1[2]), Math.max(r0[0], r1[0]), base + ht + 0.14, Math.max(r0[2], r1[2]), 0x46525b);
        var f2 = P(-h, -hw, base - 0.01), f3 = P(h, hw, base - 0.01); dk.box(Math.min(f2[0], f3[0]), base - 0.1, Math.min(f2[2], f3[2]), Math.max(f2[0], f3[0]), base - 0.02, Math.max(f2[2], f3[2]), 0x7c8790);
        var s0 = P(0, -hw + 0.1, base + 1.9), s1 = P(0, hw - 0.1, base + 1.96); lt.box(Math.min(s0[0], s1[0]) - 0.04, base + 1.9, Math.min(s0[2], s1[2]) - 0.04, Math.max(s0[0], s1[0]) + 0.04, base + 1.96, Math.max(s0[2], s1[2]) + 0.04, 0xfff2c0);
      }
    }
    add(dk, lam()); add(fr, lam()); add(lt, glow()); add(gl, glass(0.17), 4); add(pg, glass(0.5), 4);
  }

  // ---------------------------------------------------------------- the Aviary (tall, clear-view geodesic dome)
  var domeLines = [], domeData = [], sparkPool = [], zoneMats = [], flash = 0, sparkT = 0, sparkHold = 0;
  function domeColour(enc) { return enc.mesh >= 3 ? 0xe0b56c : enc.mesh === 2 ? 0xdde8ee : 0xeef5f8; }
  function domeFrameCol(enc) { return enc.mesh >= 3 ? 0x5c666e : enc.mesh === 2 ? 0x76858f : 0x9aa8b0; }
  function buildDome(enc) {
    var s = S(), tiles = enc.tiles, set = {}, k, H = enc.H || 10.5, Hw = H * 0.58;
    tiles.forEach(function (t) { set[t] = 1; });
    var cdist = {}, queue = [], inDome = function (i, j) { return i >= 0 && j >= 0 && i < N && j < N && set[i + j * N]; };
    function ckey(ci, cj) { return ci + cj * (N + 1); }
    var corners = {};
    tiles.forEach(function (t) { var i = t % N, j = (t - i) / N; [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (o) { corners[ckey(i + o[0], j + o[1])] = [i + o[0], j + o[1]]; }); });
    for (var key in corners) {
      var c = corners[key], ci = c[0], cj = c[1], bnd = !(inDome(ci - 1, cj - 1) && inDome(ci, cj - 1) && inDome(ci - 1, cj) && inDome(ci, cj));
      if (bnd) { cdist[key] = 0; queue.push(key); }
    }
    var qh = 0, rmax = 0;
    while (qh < queue.length) {
      var kk = queue[qh++], cc = corners[kk], d = cdist[kk];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { var nk = ckey(cc[0] + o[0], cc[1] + o[1]); if (corners[nk] !== undefined && cdist[nk] === undefined) { cdist[nk] = d + 1; if (d + 1 > rmax) rmax = d + 1; queue.push(nk); } });
    }
    var Rm = Math.max(rmax, 2.5);
    function hAt(ci, cj) { var d = cdist[ckey(ci, cj)]; if (d === undefined) d = 0; var u = clamp(d / Rm, 0, 1); return Hw + (H - Hw) * Math.sqrt(1 - (1 - u) * (1 - u)); }
    function P(ci, cj) { var x = ci * T, z = cj * T; return [x, gy(x, z) + hAt(ci, cj), z]; }
    function G(ci, cj) { var x = ci * T, z = cj * T; return [x, gy(x, z), z]; }
    var lines = [], gf = new GB(), fr = new GB(), colr = domeColour(enc), fcol = domeFrameCol(enc), plinthCol = shade(fcol, 0.78);
    function seg(a, b) { lines.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    var postDone = {};
    function addPost(ci, cj, thick) {
      var pk = ckey(ci, cj); if (postDone[pk]) return; postDone[pk] = 1;
      var g0 = G(ci, cj), p0 = P(ci, cj), hw = thick ? 0.11 : 0.065;
      fr.box(g0[0] - hw, g0[1] - 0.15, g0[2] - hw, g0[0] + hw, p0[1] + 0.08, g0[2] + hw, fcol);
    }
    tiles.forEach(function (t) {
      var i = t % N, j = (t - i) / N, a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      var even = (i + j) & 1;
      // Ultra-clear glazing panels so flying animals are clearly visible from outside and inside
      gf.tri(a, d, c, 0xe4f3f8); gf.tri(a, c, b, 0xe4f3f8);
      // Clean open geodesic vault ribs: perimeter eaves + every-other-tile structural ribs + open diamond diagonals
      if (!inDome(i, j - 1)) seg(a, b);
      if (!inDome(i - 1, j)) seg(a, d);
      if (!inDome(i, j + 1)) seg(d, c);
      if (!inDome(i + 1, j)) seg(b, c);
      if (inDome(i, j - 1) && (j % 2 === 0)) seg(a, b);
      if (inDome(i - 1, j) && (i % 2 === 0)) seg(a, d);
      if (even) seg(a, c); else seg(b, d);
      // Perimeter walls: sleek low plinth, slender columns at corners & every 3 tiles, crisp eave beam, open see-through glass
      var edges = [[!inDome(i, j - 1), [i, j], [i + 1, j]], [!inDome(i, j + 1), [i, j + 1], [i + 1, j + 1]], [!inDome(i - 1, j), [i, j], [i, j + 1]], [!inDome(i + 1, j), [i + 1, j], [i + 1, j + 1]]];
      edges.forEach(function (e) {
        if (!e[0]) return;
        var c0 = e[1], c1 = e[2], g0 = G(c0[0], c0[1]), g1 = G(c1[0], c1[1]), p0 = P(c0[0], c0[1]), p1 = P(c1[0], c1[1]);
        gf.quad(g0, g1, p1, p0, 0xdcf0f7);
        // Low architectural base plinth & eave ring beam
        var minX = Math.min(g0[0], g1[0]) - 0.08, maxX = Math.max(g0[0], g1[0]) + 0.08;
        var minZ = Math.min(g0[2], g1[2]) - 0.08, maxZ = Math.max(g0[2], g1[2]) + 0.08;
        var baseY = Math.min(g0[1], g1[1]), topY = Math.max(g0[1], g1[1]) + 0.24;
        fr.box(minX, baseY - 0.15, minZ, maxX, topY, maxZ, plinthCol);
        var eaveY = (p0[1] + p1[1]) * 0.5;
        fr.box(minX, eaveY - 0.08, minZ, maxX, eaveY + 0.08, maxZ, fcol);
        // Subtle mid-height transom line & corner/periodic columns
        var m0 = [g0[0], g0[1] + (p0[1] - g0[1]) * 0.5, g0[2]], m1 = [g1[0], g1[1] + (p1[1] - g1[1]) * 0.5, g1[2]];
        seg(m0, m1);
        seg(g0, p0); seg(g1, p1);
        [c0, c1].forEach(function (pt) {
          var ci2 = pt[0], cj2 = pt[1], cnt = 0;
          if (inDome(ci2 - 1, cj2 - 1)) cnt++; if (inDome(ci2, cj2 - 1)) cnt++; if (inDome(ci2 - 1, cj2)) cnt++; if (inDome(ci2, cj2)) cnt++;
          if (cnt === 1 || cnt === 3) addPost(ci2, cj2, true);
          else if ((ci2 + cj2) % 3 === 0) addPost(ci2, cj2, false);
        });
      });
    });
    var pos = new Float32Array(lines);
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var baseOp = enc.mesh >= 3 ? 0.34 : 0.26;
    var lm = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: colr, transparent: true, opacity: baseOp, depthWrite: false })); lm.frustumCulled = false; lm.renderOrder = 6; root.add(lm); domeLines.push(lm);
    var fm = new THREE.Mesh(gf.geo(), glass(enc.mesh >= 3 ? 0.042 : 0.026)); fm.frustumCulled = false; fm.renderOrder = 5; root.add(fm); built.push(fm);
    // airlock door: a small frame on the first boundary edge that touches a path
    var door = null;
    tiles.forEach(function (t) {
      if (door) return; var i = t % N, j = (t - i) / N;
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (o) { if (door) return; var ni = i + o[0], nj = j + o[1]; if (inDome(ni, nj) || ni < 0 || nj < 0 || ni >= N || nj >= N) return; if (s.path[ni + nj * N]) door = { i: i, j: j, o: o }; });
    });
    if (door) {
      var dx = (door.i + 0.5 + door.o[0] * 0.5) * T, dz = (door.j + 0.5 + door.o[1] * 0.5) * T, gyd = gy(dx, dz), ax = door.o[0] ? 0.12 : 0.55, az = door.o[0] ? 0.55 : 0.12, locked = !!RW.locked;
      fr.box(dx - ax, gyd, dz - az, dx + ax, gyd + 1.9, dz + az, 0x4a555e); fr.box(dx - ax * 0.7, gyd, dz - az * 0.7, dx + ax * 0.7, gyd + 1.7, dz + az * 0.7, locked ? 0xa33a2c : 0x3a8f55);
    }
    add(fr, lam());
    domeData.push({ enc: enc.id, lines: lm, n: lines.length / 6, pos: pos, baseOp: baseOp });
  }
  function makeSparks() {
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    var m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf4faff, transparent: true, opacity: 1, depthWrite: false, depthTest: false })); m.frustumCulled = false; m.renderOrder = 8; m.visible = false; root.add(m); sparkPool.push(m); return m;
  }
  function crackle(dt) {
    if (!domeData.length) return;
    var wi = Z.World.weatherInfo && Z.World.weatherInfo(), stormy = wi && wi.type === 'storm';
    flash = Math.max(0, flash - dt * 4);
    if (wi && wi.flash > 0.5) flash = 1;
    domeData.forEach(function (dd) {
      var mat = dd.lines.material, bop = dd.baseOp || 0.26;
      mat.opacity = bop + (stormy ? 0.08 : 0) + flash * 0.35; mat.color.setHex(flash > 0.2 ? 0xdff0ff : domeColour(S().enclosures.filter(function (e) { return e.id === dd.enc; })[0] || {}));
    });
    if (!stormy) { sparkPool.forEach(function (m) { m.visible = false; }); return; }
    sparkT -= dt; sparkHold -= dt; if (sparkHold < 0 && sparkPool[0]) sparkPool[0].visible = false;
    if (sparkT > 0) return; sparkT = 0.35 + Math.random() * 0.5;
    var dd = domeData[(Math.random() * domeData.length) | 0], m = sparkPool[0] || makeSparks();
    var arr = m.geometry.attributes.position.array, w = 0;   // QA: three bolts at once, each line doubled so it reads as thicker than 1 px, and the whole dome flickers brighter
    for (var bolt = 0; bolt < 3; bolt++) {
      var base = (Math.random() * dd.n) | 0;
      for (var k = 0; k < 9; k++) {
        var s0 = ((base + k * 3) % dd.n) * 6, jx = (Math.random() - 0.5) * 0.8, jz = (Math.random() - 0.5) * 0.8;
        for (var cp = 0; cp < 2; cp++) {
          var o = cp * 0.07, a = w * 6; w++;
          arr[a] = dd.pos[s0] + jx + o; arr[a + 1] = dd.pos[s0 + 1]; arr[a + 2] = dd.pos[s0 + 2] + jz;
          arr[a + 3] = dd.pos[s0 + 3] + jx * 1.8 + o; arr[a + 4] = dd.pos[s0 + 4] + Math.random() * 0.3; arr[a + 5] = dd.pos[s0 + 5] + jz * 1.8;
        }
      }
    }
    for (; w < 64; w++) { var q = w * 6; arr[q] = arr[q + 1] = arr[q + 2] = arr[q + 3] = arr[q + 4] = arr[q + 5] = 0; }
    flash = Math.max(flash, 0.7); sparkHold = 0.12;
    m.geometry.attributes.position.needsUpdate = true; m.visible = true;
  }

  // ---------------------------------------------------------------- virtual zones: shimmering geofence curtain, ground stipple, beacon posts
  var ZVS = 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }';
  var ZFS = 'uniform float uTime; uniform vec3 uCol; uniform float uA; uniform float uDown; uniform vec3 uAn[6]; varying vec3 vP; void main(){ float gl0 = 0.0; for (int q = 0; q < 6; q++) { gl0 += uAn[q].y * smoothstep(4.5, 0.6, distance(vP.xz, uAn[q].xz)); } gl0 = min(gl0, 1.0); float st = 0.5+0.5*sin(vP.y*7.0 + uTime*2.2 + sin((vP.x+vP.z)*1.7 + uTime)*1.6); float sp = 0.5+0.5*sin((vP.x+vP.z)*3.1 - uTime*1.3); float fl = uDown > 0.5 ? (0.35+0.65*step(0.5, fract(uTime*3.0+vP.x))) : 1.0; gl_FragColor = vec4(mix(uCol, vec3(1.0), gl0*0.45), min(1.0, uA*(0.25+0.55*st*sp)*fl + gl0*0.5*uA*2.0)); }';
  var nearArr = []; for (var nq = 0; nq < 6; nq++) nearArr.push(new THREE.Vector3(0, 0, 0));   // QA: tagged animals close to the camera focus; the curtain brightens near them (the approach warning)
  function zoneMat(down) {
    var m = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(down ? 0xff5a3a : 0x59e1ff) }, uA: { value: down ? 0.5 : 0.34 }, uDown: { value: down ? 1 : 0 }, uAn: { value: nearArr } }, vertexShader: ZVS, fragmentShader: ZFS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    zoneMats.push(m); return m;
  }
  function buildZone(enc) {
    var s = S(), set = {}, tiles = enc.tiles, down = !!enc.vdown, curtain = new GB(), top = new GB(), post = new GB(), glw = new GB();
    tiles.forEach(function (t) { set[t] = 1; });
    var band = enc.realm === 'air' ? RD.virtual.bands[clamp(enc.band || 1, 1, 3) - 1] : null, hh = enc.realm === 'land' ? 3.2 : 2.6, count = 0;
    var inZ = function (i, j) { return i >= 0 && j >= 0 && i < N && j < N && set[i + j * N]; };
    tiles.forEach(function (t) {
      var i = t % N, j = (t - i) / N;
      [[0, -1, i, j, i + 1, j], [0, 1, i, j + 1, i + 1, j + 1], [-1, 0, i, j, i, j + 1], [1, 0, i + 1, j, i + 1, j + 1]].forEach(function (e) {
        if (inZ(i + e[0], j + e[1])) return;
        var ax = e[2] * T, az = e[3] * T, bx = e[4] * T, bz = e[5] * T, ya, yb;
        if (enc.realm === 'sea') { ya = SEA_Y - 1.3; yb = SEA_Y + 2.1; }
        else if (enc.realm === 'air') { var g0 = (gy(ax, az) + gy(bx, bz)) / 2; ya = g0 + band.h0; yb = g0 + band.h1; }
        else { ya = Math.min(gy(ax, az), gy(bx, bz)); yb = Math.max(gy(ax, az), gy(bx, bz)) + hh; }
        curtain.quad([ax, ya, az], [bx, ya, bz], [bx, yb, bz], [ax, yb, az], 0xffffff);
        count++;
        if (count % 4 === 1) {   // a beacon post at the start of every fourth boundary edge
          var gp = enc.realm === 'sea' ? SEA_Y : enc.realm === 'air' ? gy(ax, az) : gy(ax, az), ph = enc.realm === 'air' ? 1.6 : 2.2;
          post.box(ax - 0.06, enc.realm === 'sea' ? SEA_Y - 0.5 : gp, az - 0.06, ax + 0.06, gp + ph, az + 0.06, 0x4a555e);
          if (down) glw.box(ax - 0.07, gp + ph, az - 0.07, ax + 0.07, gp + ph + 0.85, az + 0.07, 0xff3b2a); else glw.box(ax - 0.14, gp + ph, az - 0.14, ax + 0.14, gp + ph + 0.26, az + 0.14, 0x4aff9a);   // power lost: a tall thin red spike, not just a colour change
        }
      });
      if (enc.realm === 'air') {   // top and bottom of the band
        var x0 = i * T, z0 = j * T, x1 = x0 + T, z1 = z0 + T, gm = gy(x0 + T / 2, z0 + T / 2);
        top.quad([x0, gm + band.h1, z0], [x0, gm + band.h1, z1], [x1, gm + band.h1, z1], [x1, gm + band.h1, z0], 0xffffff);
        top.quad([x0, gm + band.h0, z0], [x0, gm + band.h0, z1], [x1, gm + band.h0, z1], [x1, gm + band.h0, z0], 0xffffff);
      } else if (enc.realm === 'land' || overlayOn) {
        var x2 = i * T + 0.14, z2 = j * T + 0.14, x3 = (i + 1) * T - 0.14, z3 = (j + 1) * T - 0.14, yy = enc.realm === 'sea' ? SEA_Y + 0.075 : Math.max(gy(x2, z2), gy(x3, z2), gy(x2, z3), gy(x3, z3)) + 0.08;
        top.quad([x2, yy, z2], [x2, yy, z3], [x3, yy, z3], [x3, yy, z2], 0xffffff);
      }
    });
    var cm = zoneMat(down); var cmesh = new THREE.Mesh(curtain.geo(), cm); cmesh.frustumCulled = false; cmesh.renderOrder = 7; root.add(cmesh); built.push(cmesh);
    if (!top.empty()) { var tm = zoneMat(down); tm.uniforms.uA.value = overlayOn ? 0.3 : 0.14; var tmesh = new THREE.Mesh(top.geo(), tm); tmesh.frustumCulled = false; tmesh.renderOrder = 6; root.add(tmesh); built.push(tmesh); }
    add(post, lam()); add(glw, glow());
  }

  // ---------------------------------------------------------------- tower range rings, tags
  var ringMesh = null, tagMesh = null, tagN = 0, _mat4 = null, _q = null, _sc = null, _pp = null;
  function buildRings() {
    var s = S(), gb = new GB(), list = [];
    if (overlayOn) s.objects.forEach(function (o) { if (o.type === 'tagging_tower') list.push(o); }); else if (rangeObj) s.objects.forEach(function (o) { if (o.id === rangeObj) list.push(o); });
    list.forEach(function (o) {
      var lv = RD.virtual.towers[clamp(o.lvl || 1, 1, 3) - 1], c = Z.Sim.realms && Z.Sim.realms.helpers ? Z.Sim.realms.helpers.objCentre(o) : { x: (o.i + 1) * T, z: (o.j + 1) * T }, R = lv.radius * T, n = 72;
      for (var k = 0; k < n; k++) {
        var a0 = k / n * PI * 2, a1 = (k + 1) / n * PI * 2, x0 = c.x + Math.cos(a0) * R, z0 = c.z + Math.sin(a0) * R, x1 = c.x + Math.cos(a1) * R, z1 = c.z + Math.sin(a1) * R;
        var y0 = Math.max(gy(x0, z0), SEA_Y) + 0.14, y1 = Math.max(gy(x1, z1), SEA_Y) + 0.14, nx = Math.cos(a0) * 0.1, nz = Math.sin(a0) * 0.1;
        gb.quad([x0 - nx, y0, z0 - nz], [x0 + nx, y0, z0 + nz], [x1 + nx, y1, z1 + nz], [x1 - nx, y1, z1 - nz], k & 1 ? 0x59e1ff : 0xa6f0ff);
      }
    });
    if (ringMesh) { root.remove(ringMesh); ringMesh.geometry.dispose(); ringMesh = null; }
    if (gb.empty()) return;
    ringMesh = new THREE.Mesh(gb.geo(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })); ringMesh.frustumCulled = false; ringMesh.renderOrder = 9; root.add(ringMesh);
  }
  function nearFill(s) {
    var cam = Z.World.cam, cx = cam && cam.target ? cam.target.x : 0, cz = cam && cam.target ? cam.target.z : 0, k, q, best = [];
    for (q = 0; q < 6; q++) nearArr[q].y = 0;
    for (k = 0; k < s.animals.length; k++) {
      var a = s.animals[k]; if (!a.tag || a.bolt) continue;
      var d = (a.x - cx) * (a.x - cx) + (a.z - cz) * (a.z - cz), at = best.length;
      if (best.length === 6 && d >= best[5].d) continue;
      while (at > 0 && best[at - 1].d > d) at--;
      best.splice(at, 0, { d: d, a: a }); if (best.length > 6) best.length = 6;
    }
    for (q = 0; q < best.length; q++) { nearArr[q].set(best[q].a.x, 1, best[q].a.z); }
  }
  function updateTags() {
    var s = S(); if (!s) return;
    if (!tagMesh) {
      var g = new THREE.IcosahedronGeometry(0.17, 0); tagMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), 96); tagMesh.frustumCulled = false; tagMesh.renderOrder = 8;
      tagMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3); root.add(tagMesh);
      _mat4 = new THREE.Matrix4(); _q = new THREE.Quaternion(); _sc = new THREE.Vector3(1, 1, 1); _pp = new THREE.Vector3();
    }
    var n = 0, col = new THREE.Color(), pulse = 0.65 + 0.35 * Math.sin(t0 * 5);
    for (var k = 0; k < s.animals.length && n < 96; k++) {
      var a = s.animals[k]; if (!a.tag) continue;
      var rec = Z.World.entityPos ? Z.World.entityPos('animal', a.id) : null; if (!rec) continue;
      var enc = s.enclosures.filter ? null : null, ok = !(a.bolt);
      _pp.set(rec.x, rec.y + (rec.h || 1.2) + 0.45 + 0.06 * Math.sin(t0 * 3 + a.id), rec.z);
      _sc.setScalar(a.bolt ? 1.35 : 1); _mat4.compose(_pp, _q, _sc); tagMesh.setMatrixAt(n, _mat4);
      col.setHex(ok ? 0x59e1ff : 0xff5a3a).multiplyScalar(ok ? pulse : 1); tagMesh.setColorAt(n, col); n++;
    }
    nearFill(s);
    tagMesh.count = n; tagMesh.visible = n > 0; tagMesh.instanceMatrix.needsUpdate = true; if (tagMesh.instanceColor) tagMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- street view inside a tunnel: water tint and fog, cheap caustics overlay
  var uw = 0, uwEl = null, baseFog = null;
  function uwElement() {
    if (uwEl) return uwEl;
    var st = document.createElement('style');
    st.textContent = '#uwfx{position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:4;opacity:0;transition:opacity .25s;background:radial-gradient(ellipse at 50% 40%,rgba(120,220,240,.06),rgba(8,60,86,.34));mix-blend-mode:normal}' +
      '#uwfx i{position:absolute;inset:-20%;background-image:radial-gradient(circle at 20% 30%,rgba(190,250,255,.28) 0 1.5%,transparent 5%),radial-gradient(circle at 70% 20%,rgba(190,250,255,.22) 0 1.2%,transparent 4.5%),radial-gradient(circle at 50% 70%,rgba(190,250,255,.2) 0 1.6%,transparent 5.5%),radial-gradient(circle at 85% 65%,rgba(190,250,255,.24) 0 1.2%,transparent 4.5%);background-size:130px 110px;animation:uwc 7s linear infinite;mix-blend-mode:screen;opacity:.55}' +
      '#uwfx i+i{background-size:90px 80px;animation-duration:11s;animation-direction:reverse;opacity:.45}@keyframes uwc{from{background-position:0 0}to{background-position:130px 110px}}';
    document.head.appendChild(st);
    uwEl = document.createElement('div'); uwEl.id = 'uwfx'; uwEl.innerHTML = '<i></i><i></i>'; document.body.appendChild(uwEl);
    return uwEl;
  }
  function tunnelBlend(SV) {
    if (!SV || !SV.on || SV.blend < 0.5) return 0;
    var i = (SV.x / T) | 0, j = (SV.z / T) | 0; if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    var w = walkOf[i + j * N]; if (w === 1) return 1; var enc = S().tileEnc[i + j * N]; return 0;
  }
  RW.underwater = function () { return uw; };
  // inside a tunnel the sky is replaced by a lit water surface seen from below, the horizon fades into the water colour
  var hemiL = null, hemiOrig = null, skyM = null, ceil = null, bgCol = null, hidSky = false;
  function underwaterScene(k, SV) {
    if (!skyM) for (var q = 0; q < scene.children.length; q++) if (scene.children[q].renderOrder === -100) { skyM = scene.children[q]; break; }
    var on = k > 0.5;
    if (on) {
      if (!ceil) {
        ceil = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ color: 0xa8f0fa, transparent: true, opacity: 0.8, side: THREE.BackSide, depthWrite: false, fog: false }));
        ceil.rotation.x = -PI / 2; ceil.renderOrder = -50; ceil.frustumCulled = false; scene.add(ceil); bgCol = new THREE.Color();
      }
      var i = (SV.x / T) | 0, j = (SV.z / T) | 0, enc = S().tileEnc[i + j * N], sf = SEA_Y;
      if (enc) { var e = S().enclosures.filter(function (q) { return q.id === enc; })[0]; if (e && e.kind === 'tank' && e.surf !== undefined) sf = e.surf; }
      if (sf === SEA_Y) { var wl = Z.World.waterLevelAt ? Z.World.waterLevelAt(SV.x, SV.z) : -99; if (wl > -50) sf = wl; }
      ceil.position.set(SV.x, sf, SV.z); ceil.visible = true;
      if (skyM) skyM.visible = false; hidSky = true;
      bgCol.set(0x2b8fae); scene.background = bgCol;
      if (!hemiL) for (var q2 = 0; q2 < scene.children.length; q2++) if (scene.children[q2].isHemisphereLight) { hemiL = scene.children[q2]; hemiOrig = { i: 0.7, g: hemiL.groundColor.clone() }; break; }
      if (hemiL) { if (!hidSky) hemiOrig.g.copy(hemiL.groundColor); hemiL.intensity = 1.25; hemiL.groundColor.setHex(0x6fc4d8); }
    } else if (hidSky) {
      if (ceil) ceil.visible = false; if (skyM) skyM.visible = true; scene.background = null; hidSky = false;
      if (hemiL) { hemiL.intensity = 0.7; hemiL.groundColor.copy(hemiOrig.g); }   // the atmosphere step sets the exact values again within a frame or two
    }
  }

  // ---------------------------------------------------------------- build / frame
  function rebuild() {
    if (!scene) return;
    clearBuilt(); domeData = [];
    var s = S(); if (!s || !s.enclosures) return;
    s.enclosures.forEach(function (e) {
      if (e.kind === 'tank' && e.floor !== undefined) buildTank(e);
      else if (e.kind === 'dome') buildDome(e);
      else if (e.kind === 'virtual') buildZone(e);
    });
    buildWalks(); buildRings();
    zoneSig = sig();
  }
  function sig() { var s = S(), r = ''; if (s && s.enclosures) s.enclosures.forEach(function (e) { if (e.kind === 'virtual') r += (e.vdown ? 'd' : 'u'); if (e.kind === 'dome') r += RW.locked ? 'L' : 'o'; }); return r; }
  var lastCache = -1;
  function dirtyAll() { dirty = true; }
  Z.bus.on('enclosures', function () { dirty = true; cacheDirty = true; }); Z.bus.on('terrain', function () { dirty = true; cacheDirty = true; }); Z.bus.on('reset', function () { dirty = true; cacheDirty = true; });
  Z.bus.on('path', function () { dirty = true; cacheDirty = true; }); Z.bus.on('realms', function () { dirty = true; }); Z.bus.on('power', function () { dirty = true; });
  var cacheDirty = true, accT = 0;
  // tank/trench caches must be current BEFORE the terrain mesh is recomputed (the 'terrain' event fires first); refresh them lazily in vtx callers too
  var _oldVtx = RW.vtx;
  RW.vtx = function (a, b, hgt) { if (cacheDirty) { cacheDirty = false; refreshCache(); } return _oldVtx(a, b, hgt); };
  var _oldIs = RW.isWalk; RW.isWalk = function (i, j) { if (cacheDirty) { cacheDirty = false; refreshCache(); } return _oldIs(i, j); };
  var _oldDeck = RW.deckY; RW.deckY = function (x, z) { if (cacheDirty) { cacheDirty = false; refreshCache(); } return _oldDeck(x, z); };
  RW.setOverlay = function (on) { overlayOn = !!on; dirty = true; };
  RW.overlayOn = function () { return overlayOn; };
  RW.showRange = function (objId) { rangeObj = objId || 0; dirty = true; };
  RW.setLocked = function (on) { RW.locked = !!on; };
  RW.preRender = function (dt, SV) {
    if (!scene) { try { scene = Z.World.scene(); } catch (e) { scene = null; } if (!scene) return; root = new THREE.Group(); root.name = 'realms'; scene.add(root); }
    t0 += dt || 0.016; accT += dt || 0;
    if (cacheDirty) { cacheDirty = false; refreshCache(); dirty = true; }
    if (accT > 0.5) { accT = 0; var sg = sig(); if (sg !== zoneSig) dirty = true; }
    if (dirty) { dirty = false; rebuild(); }
    zoneMats.forEach(function (m) { m.uniforms.uTime.value = t0; });
    crackle(dt || 0.016); updateTags(); splashes(dt || 0.016);
    var target = tunnelBlend(SV); uw += (target - uw) * Math.min(1, (dt || 0.016) * 4);
    underwaterScene(uw, SV);
    if (uw > 0.01 || (uwEl && uwEl.style.opacity !== '0')) {
      var el = uwElement(); el.style.opacity = String(Math.min(1, uw));
      if (uw > 0.01 && scene.fog) { scene.fog.color.lerp(new THREE.Color(0.05, 0.36, 0.5), 0.88 * uw); scene.fog.near = scene.fog.near * (1 - uw) + 0.4 * uw; scene.fog.far = scene.fog.far * (1 - uw) + 18 * uw; }
    }
  };
  // ---------------------------------------------------------------- splashes: breaching marine reptiles and feeding shows (a ring that spreads and a few droplets)
  var SPN = 6, spl = [], splMap = {}, splT = 0, splInit = false;
  function splashInit() {
    splInit = true;
    var ringG = new THREE.RingGeometry(0.55, 0.7, 28); ringG.rotateX(-PI / 2);
    for (var q = 0; q < SPN; q++) {
      var ringM = new THREE.MeshBasicMaterial({ color: 0xf4fcff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }), ring = new THREE.Mesh(ringG, ringM); ring.visible = false; ring.renderOrder = 7; ring.frustumCulled = false; root.add(ring);
      var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
      var pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0, depthWrite: false, fog: false })); pts.visible = false; pts.frustumCulled = false; pts.renderOrder = 7; root.add(pts);
      var vel = new Float32Array(18 * 3); spl.push({ ring: ring, pts: pts, vel: vel, t: 9, x: 0, y: 0, z: 0, big: 1 });
    }
  }
  function splash(x, y, z, big) {
    if (!splInit) splashInit(); var best = null, k;
    for (k = 0; k < SPN; k++) if (!best || spl[k].t > best.t) best = spl[k];
    best.t = 0; best.x = x; best.y = y; best.z = z; best.big = big || 1; best.ring.visible = best.pts.visible = true;
    var p = best.pts.geometry.attributes.position.array, v = best.vel;
    for (k = 0; k < 18; k++) { var a = (k / 18) * PI * 2 + k * 0.7, r = 0.15 + (k % 3) * 0.12; p[k * 3] = x + Math.cos(a) * r; p[k * 3 + 1] = y; p[k * 3 + 2] = z + Math.sin(a) * r; v[k * 3] = Math.cos(a) * (0.8 + (k % 4) * 0.35) * best.big; v[k * 3 + 1] = (2.4 + (k % 5) * 0.55) * Math.sqrt(best.big); v[k * 3 + 2] = Math.sin(a) * (0.8 + (k % 4) * 0.35) * best.big; }
  }
  RW.splash = splash;
  function splashes(dt) {
    var s = S(), k, an;
    if (s && s.animals && anyWater()) {
      for (k = 0; k < s.animals.length; k++) {
        an = s.animals[k]; if (!(an.bp > 0)) { if (splMap[an.id]) delete splMap[an.id]; continue; }
        var st = splMap[an.id] || (splMap[an.id] = { a: false, b: false });
        if (!st.a && an.bp > 0.09) { st.a = true; splash(an.x, an.wb !== undefined ? an.wb : SEA_Y, an.z, 1.3); }
        if (!st.b && an.bp > 0.9) { st.b = true; splash(an.x, an.wb !== undefined ? an.wb : SEA_Y, an.z, 1.6); }
      }
      var sh = Z.Sim.realms && Z.Sim.realms.show && Z.Sim.realms.show();
      if (sh) {   // feeding show: splashes around the surfacing animals
        splT -= dt; if (splT <= 0) { splT = 0.6 + (s.animals.length % 3) * 0.1; for (k = 0; k < s.animals.length; k++) { an = s.animals[k]; if (an.show > 0 && an.wb !== undefined && (k + ((t0 * 3) | 0)) % 3 === 0) { splash(an.x + Math.sin(an.heading || 0) * 1.5, an.wb, an.z + Math.cos(an.heading || 0) * 1.5, 1.0); break; } } }
      }
    }
    if (!splInit) return;
    for (k = 0; k < SPN; k++) {
      var sp = spl[k]; if (sp.t > 2.2) { if (sp.ring.visible) sp.ring.visible = sp.pts.visible = false; continue; }
      sp.t += dt; var u = sp.t / 1.6;
      sp.ring.position.set(sp.x, sp.y + 0.04, sp.z); var sc = (0.6 + u * 5.5) * sp.big; sp.ring.scale.set(sc, 1, sc); sp.ring.material.opacity = Math.max(0, 0.75 * (1 - u));
      var p = sp.pts.geometry.attributes.position.array, v = sp.vel;
      for (var q = 0; q < 18; q++) { v[q * 3 + 1] -= 7.5 * dt; p[q * 3] += v[q * 3] * dt; p[q * 3 + 1] += v[q * 3 + 1] * dt; p[q * 3 + 2] += v[q * 3 + 2] * dt; if (p[q * 3 + 1] < sp.y) { p[q * 3 + 1] = sp.y - 5; } }
      sp.pts.geometry.attributes.position.needsUpdate = true; sp.pts.material.opacity = Math.max(0, 1 - sp.t / 1.1);
    }
  }
  function anyWater() { return anyTank || anyTrench || true; }
  RW.info = function () { return { tanks: anyTank, trench: anyTrench, walks: anyWalk, domes: domeData.length, built: built.length, uw: uw }; };
})();
