// ===== 44-world-realms.js =====
// Realms package, world side: sunk tank basins (vertex hook in 40-world calcVertex), glass tank walls + water volumes, sea-bed trenches under sea tunnels, the walk structures
// (acrylic tunnel, mesh walk, glass pier, armoured skywalk), the tall clear-view Aviary dome with storm crackle, virtual-zone perimeter posts/buoys/overhead masts, tower range rings,
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
  function clearBuilt() {
    built.forEach(function (m) { root.remove(m); if (m.geometry) m.geometry.dispose(); }); built.length = 0;
    if (domeLines) { domeLines.forEach(function (l) { root.remove(l); l.geometry.dispose(); }); } domeLines = [];
    if (zoneLines) { zoneLines.forEach(function (l) { root.remove(l); if (l.geometry) l.geometry.dispose(); if (l.material) l.material.dispose(); }); } zoneLines = [];
    sparkPool = []; zoneBeacons = [];
    if (beaconMesh) { beaconMesh.count = 0; beaconMesh.visible = false; }
  }

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
  function pAt(s, i, j) { return i >= 0 && j >= 0 && i < N && j < N && s && s.path && s.path[i + j * N] > 0; }
  function buildWalks() {
    var fr = new GB(), gl = new GB(), sgl = new GB(), dk = new GB(), lt = new GB(), pg = new GB(), t, s = S();
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
      if (w === 4) {   // armoured skywalk: 4-way neighbour-aware, terrain-following panoramic glass corridor
        var x1 = x0 + T, z1 = z0 + T, hw = 0.88, ht = 2.02;
        var nS = wAt(i, j - 1) === 4, sS = wAt(i, j + 1) === 4, wS = wAt(i - 1, j) === 4, eS = wAt(i + 1, j) === 4;
        var nP = pAt(s, i, j - 1), sP = pAt(s, i, j + 1), wP = pAt(s, i - 1, j), eP = pAt(s, i + 1, j);
        var nOpen = nS || nP, sOpen = sS || sP, wOpen = wS || wP, eOpen = eS || eP;
        var y00 = gy(x0, z0) + PY, y10 = gy(x1, z0) + PY, y01 = gy(x0, z1) + PY, y11 = gy(x1, z1) + PY;
        var yAt = function (x, z) {
          var u = (x - x0) / T, v = (z - z0) / T;
          return (y00 * (1 - u) + y10 * u) * (1 - v) + (y01 * (1 - u) + y11 * u) * v;
        };
        var sbox = function (gb, xa, za, xb, zb, dy0, dy1, col) {
          var xA = Math.min(xa, xb), xB = Math.max(xa, xb), zA = Math.min(za, zb), zB = Math.max(za, zb);
          var c00 = yAt(xA, zA), c10 = yAt(xB, zA), c11 = yAt(xB, zB), c01 = yAt(xA, zB);
          var a = [xA, c00 + dy0, zA], b = [xB, c10 + dy0, zA], c = [xB, c11 + dy0, zB], d = [xA, c01 + dy0, zB];
          var e = [xA, c00 + dy1, zA], f = [xB, c10 + dy1, zA], g = [xB, c11 + dy1, zB], q = [xA, c01 + dy1, zB];
          gb.quad(e, q, g, f, col);
          gb.quad(a, b, c, d, shade(col, 0.7));
          gb.quad(a, e, f, b, shade(col, 0.8));
          gb.quad(d, c, g, q, shade(col, 0.85));
          gb.quad(a, d, q, e, shade(col, 0.75));
          gb.quad(b, f, g, c, shade(col, 0.9));
        };
        var addDeck = function (xa, za, xb, zb) {
          sbox(dk, xa, za, xb, zb, -0.04, -0.005, 0xa2aeb8);
          sbox(dk, xa, za, xb, zb, -0.10, -0.04, 0x5b6770);
        };
        var addSky = function (xa, za, xb, zb) {
          sgl.quad(
            [xa, yAt(xa, za) + 1.96, za],
            [xa, yAt(xa, zb) + 1.96, zb],
            [xb, yAt(xb, zb) + 1.96, zb],
            [xb, yAt(xb, za) + 1.96, za],
            0xc8eef8
          );
        };
        var wallX = function (sz, xa, xb) {
          var zw = cz + sz * (hw + 0.04);
          sbox(fr, xa, cz + sz * hw, xb, cz + sz * (hw + 0.10), -0.04, 0.36, 0x53606a);
          sgl.quad([xa, yAt(xa, zw) + 0.36, zw], [xb, yAt(xb, zw) + 0.36, zw], [xb, yAt(xb, zw) + 1.88, zw], [xa, yAt(xa, zw) + 1.88, zw], 0xc8eef8);
          sbox(fr, xa, cz + sz * hw, xb, cz + sz * (hw + 0.12), 1.88, ht, 0x46525b);
        };
        var wallZ = function (sx, za, zb, trimEave) {
          var xw = cx + sx * (hw + 0.04);
          sbox(fr, cx + sx * hw, za, cx + sx * (hw + 0.10), zb, -0.04, 0.36, 0x53606a);
          sgl.quad([xw, yAt(xw, za) + 0.36, za], [xw, yAt(xw, zb) + 0.36, zb], [xw, yAt(xw, zb) + 1.88, zb], [xw, yAt(xw, za) + 1.88, za], 0xc8eef8);
          sbox(fr, cx + sx * hw, za, cx + sx * (hw + (trimEave ? 0.105 : 0.12)), zb, 1.88, ht, 0x46525b);
        };

        var sideZ = function (sz, open, portal) {
          var zIn = cz + sz * hw, zOut = cz + sz * h;
          if (open) {
            addDeck(cx - hw, zIn, cx + hw, zOut);
            addSky(cx - hw, zIn, cx + hw, zOut);
            wallZ(-1, zOut, wOpen ? cz + sz * (hw + 0.105) : zIn, wOpen);
            wallZ(1, zOut, eOpen ? cz + sz * (hw + 0.105) : zIn, eOpen);
            sbox(fr, cx - hw, zIn - 0.04, cx + hw, zIn + 0.04, 1.94, 2.03, 0x46525b);
          } else {
            wallX(sz, cx - hw, cx + hw);
            sbox(lt, cx - hw + 0.02, zIn, cx + hw - 0.02, zIn - sz * 0.04, 0.04, 0.09, 0xfff3cc);
          }
          if (portal) {
            var zp0 = zOut + (sz < 0 ? -0.02 : -0.07), zp1 = zOut + (sz < 0 ? 0.07 : 0.02);
            sbox(fr, cx - hw - 0.11, zp0, cx + hw + 0.11, zp1, 1.88, 2.04, 0x46525b);
            sbox(fr, cx - hw - 0.11, zp0, cx - hw + 0.01, zp1, -0.04, 1.88, 0x46525b);
            sbox(fr, cx + hw - 0.01, zp0, cx + hw + 0.11, zp1, -0.04, 1.88, 0x46525b);
          }
        };
        var sideX = function (sx, open, portal) {
          var xIn = cx + sx * hw, xOut = cx + sx * h;
          if (open) {
            addDeck(xIn, cz - hw, xOut, cz + hw);
            addSky(xIn, cz - hw, xOut, cz + hw);
            wallX(-1, xOut, nOpen ? cx + sx * (hw + 0.105) : xIn);
            wallX(1, xOut, sOpen ? cx + sx * (hw + 0.105) : xIn);
            sbox(fr, xIn - 0.04, cz - hw, xIn + 0.04, cz + hw, 1.94, 2.03, 0x46525b);
          } else {
            wallZ(sx, cz - hw, cz + hw, false);
            sbox(lt, xIn, cz - hw + 0.02, xIn - sx * 0.04, cz + hw - 0.02, 0.04, 0.09, 0xfff3cc);
          }
          if (portal) {
            var xp0 = xOut + (sx < 0 ? -0.02 : -0.07), xp1 = xOut + (sx < 0 ? 0.07 : 0.02);
            sbox(fr, xp0, cz - hw - 0.11, xp1, cz + hw + 0.11, 1.88, 2.04, 0x46525b);
            sbox(fr, xp0, cz - hw - 0.11, xp1, cz - hw + 0.01, -0.04, 1.88, 0x46525b);
            sbox(fr, xp0, cz + hw - 0.01, xp1, cz + hw + 0.11, -0.04, 1.88, 0x46525b);
          }
        };

        // Central bay deck & clear skylight roof
        addDeck(cx - hw, cz - hw, cx + hw, cz + hw);
        addSky(cx - hw, cz - hw, cx + hw, cz + hw);

        // 4 cardinal sides: open stubs, closed panoramic walls + LED strips, and path portals
        sideZ(-1, nOpen, nP && !nS);
        sideZ(1, sOpen, sP && !sS);
        sideX(-1, wOpen, wP && !wS);
        sideX(1, eOpen, eP && !eS);

        // 4 corner armoured steel pillars (0.11 x 0.11)
        [-1, 1].forEach(function (sx) {
          [-1, 1].forEach(function (sz) {
            sbox(fr, cx + sx * (hw - 0.005), cz + sz * (hw - 0.005), cx + sx * (hw + 0.105), cz + sz * (hw + 0.105), -0.10, ht + 0.02, 0x46525b);
          });
        });
      }
    }
    add(dk, lam()); add(fr, lam()); add(lt, glow()); add(gl, glass(0.17), 4); add(sgl, glass(0.11), 4); add(pg, glass(0.5), 4);
  }

  // ---------------------------------------------------------------- the Aviary (tall, clear-view geodesic dome)
  var domeLines = [], domeData = [], sparkPool = [], zoneLines = [], zoneBeacons = [], beaconMesh = null, beaconCap = 0, flash = 0, sparkT = 0, sparkHold = 0;
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

  // ---------------------------------------------------------------- virtual zones: electric-collar boundary posts, marine buoys, overhead sky masts (optional blueprint overlay)
  function beamBox(gb, cx, cz, dx, dz, s0, s1, hw, y0, y1, col) {
    var px = -dz * hw, pz = dx * hw;
    var ax = cx + dx * s0, az = cz + dz * s0, bx = cx + dx * s1, bz = cz + dz * s1;
    var a0 = [ax - px, y0, az - pz], a1 = [ax + px, y0, az + pz], b1 = [bx + px, y0, bz + pz], b0 = [bx - px, y0, bz - pz];
    var c0 = [ax - px, y1, az - pz], c1 = [ax + px, y1, az + pz], d1 = [bx + px, y1, bz + pz], d0 = [bx - px, y1, bz - pz];
    gb.quad(c0, c1, d1, d0, col); gb.quad(a0, b0, b1, a1, shade(col, 0.7));
    gb.quad(a0, c0, d0, b0, shade(col, 0.85)); gb.quad(a1, b1, d1, c1, shade(col, 0.9));
    gb.quad(b0, d0, d1, b1, shade(col, 0.8)); gb.quad(a0, a1, c1, c0, shade(col, 0.75));
  }
  function strut(gb, x0, y0, z0, x1, y1, z1, r, col) {
    var a = [x0 - r, y0, z0 - r], b = [x0 + r, y0, z0 - r], c = [x0 + r, y0, z0 + r], d = [x0 - r, y0, z0 + r];
    var e = [x1 - r, y1, z1 - r], f = [x1 + r, y1, z1 - r], g = [x1 + r, y1, z1 + r], h = [x1 - r, y1, z1 + r];
    gb.quad(a, b, f, e, col); gb.quad(b, c, g, f, shade(col, 0.85)); gb.quad(c, d, h, g, shade(col, 0.9)); gb.quad(d, a, e, h, shade(col, 0.78));
  }
  function buildZone(enc) {
    var set = {}, tiles = enc.tiles, down = !!(enc.vdown || enc.down), post = new GB(), glw = new GB(), ov = new GB();
    tiles.forEach(function (t) { set[t] = 1; });
    var band = enc.realm === 'air' ? RD.virtual.bands[clamp(enc.band || 1, 1, 3) - 1] : null;
    var inZ = function (i, j) { return i >= 0 && j >= 0 && i < N && j < N && set[i + j * N]; };
    var edges = [], cablePos = [], vMap = {}, vList = [];
    var step = enc.realm === 'air' ? 3 : 2;
    function vkey(ci, cj) { return ci + cj * (N + 1); }
    function considerVertex(ci, cj) {
      var k = vkey(ci, cj); if (vMap[k]) return; vMap[k] = 1;
      var tl = inZ(ci - 1, cj - 1) ? 1 : 0, tr = inZ(ci, cj - 1) ? 1 : 0, bl = inZ(ci - 1, cj) ? 1 : 0, br = inZ(ci, cj) ? 1 : 0;
      var cnt = tl + tr + bl + br;
      if (cnt === 0 || cnt === 4) return;
      var isCorner = cnt === 1 || cnt === 3 || (cnt === 2 && tl === br && tl !== tr);
      if (!isCorner && ((ci + cj) % step !== 0)) return;
      var ix = (tr + br) * 0.5 - (tl + bl) * 0.5;
      var iz = (bl + br) * 0.5 - (tl + tr) * 0.5;
      var len = Math.sqrt(ix * ix + iz * iz);
      if (len > 0.001) { ix /= len; iz /= len; } else { ix = 1; iz = 0; }
      vList.push({ ci: ci, cj: cj, x: ci * T, z: cj * T, inX: ix, inZ: iz });
    }
    tiles.forEach(function (t) {
      var i = t % N, j = (t - i) / N;
      [[0, -1, i, j, i + 1, j], [0, 1, i, j + 1, i + 1, j + 1], [-1, 0, i, j, i, j + 1], [1, 0, i + 1, j, i + 1, j + 1]].forEach(function (e) {
        if (inZ(i + e[0], j + e[1])) return;
        var c0 = [e[2], e[3]], c1 = [e[4], e[5]];
        edges.push({ c0: c0, c1: c1 });
        considerVertex(c0[0], c0[1]);
        considerVertex(c1[0], c1[1]);
      });
      if (overlayOn) {
        var x2 = i * T + 0.1, z2 = j * T + 0.1, x3 = (i + 1) * T - 0.1, z3 = (j + 1) * T - 0.1;
        var yy = enc.realm === 'sea' ? SEA_Y + 0.075 : Math.max(gy(x2, z2), gy(x3, z2), gy(x2, z3), gy(x3, z3), SEA_Y) + 0.08;
        ov.quad([x2, yy, z2], [x2, yy, z3], [x3, yy, z3], [x3, yy, z2], down ? 0xff5a3a : 0x59e1ff);
      }
    });
    vList.forEach(function (v) {
      var vx = v.x, vz = v.z, ph = (v.ci * 0.73 + v.cj * 1.19) % 1;
      if (enc.realm === 'sea') {
        post.box(vx - 0.26, SEA_Y - 0.35, vz - 0.26, vx + 0.26, SEA_Y - 0.05, vz + 0.26, 0x2b363d);
        post.box(vx - 0.36, SEA_Y - 0.06, vz - 0.36, vx + 0.36, SEA_Y + 0.34, vz + 0.36, 0xf06a24);
        post.box(vx - 0.375, SEA_Y + 0.14, vz - 0.375, vx + 0.375, SEA_Y + 0.24, vz + 0.375, 0xf4f7f8);
        post.box(vx - 0.22, SEA_Y + 0.34, vz - 0.22, vx + 0.22, SEA_Y + 0.40, vz + 0.22, 0x38434b);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (sc) {
          strut(post, vx + sc[0] * 0.16, SEA_Y + 0.39, vz + sc[1] * 0.16, vx + sc[0] * 0.10, SEA_Y + 0.75, vz + sc[1] * 0.10, 0.028, 0x38434b);
        });
        post.box(vx - 0.14, SEA_Y + 0.74, vz - 0.14, vx + 0.14, SEA_Y + 0.80, vz + 0.14, 0x38434b);
        zoneBeacons.push({ x: vx, y: SEA_Y + 0.93, z: vz, realm: 'sea', down: down, phase: ph, scale: 1.25 });
      } else if (enc.realm === 'air') {
        var gp = gy(vx, vz), topY = gp + band.h1;
        post.box(vx - 0.12, gp - 0.15, vz - 0.12, vx + 0.12, gp + 0.22, vz + 0.12, 0x374149);
        post.box(vx - 0.055, gp - 0.15, vz - 0.055, vx + 0.055, topY + 0.08, vz + 0.055, 0x46535d);
        post.box(vx - 0.068, topY - 0.55, vz - 0.068, vx + 0.068, topY - 0.35, vz + 0.068, 0xf06a24);
        beamBox(post, vx, vz, v.inX, v.inZ, 0, 1.04, 0.045, topY - 0.05, topY + 0.05, 0x55646f);
        strut(post, vx, topY - 0.46, vz, vx + v.inX * 0.52, topY - 0.04, vz + v.inZ * 0.52, 0.028, 0x46535d);
        beamBox(post, vx, vz, v.inX, v.inZ, 0.82, 1.02, 0.075, topY - 0.24, topY - 0.05, 0x36424a);
        beamBox(glw, vx, vz, v.inX, v.inZ, 0.85, 1.00, 0.05, topY - 0.27, topY - 0.24, down ? 0xff5a3a : 0x59e1ff);
        zoneBeacons.push({ x: vx, y: topY + 0.18, z: vz, realm: 'air', down: down, phase: ph, scale: 1.15 });
      } else {
        var gp2 = gy(vx, vz);
        post.box(vx - 0.13, gp2 - 0.15, vz - 0.13, vx + 0.13, gp2 + 0.18, vz + 0.13, 0x3a434a);
        post.box(vx - 0.06, gp2, vz - 0.06, vx + 0.06, gp2 + 1.95, vz + 0.06, 0x9aa6b0);
        post.box(vx - 0.072, gp2 + 1.48, vz - 0.072, vx + 0.072, gp2 + 1.64, vz + 0.072, 0xe8b931);
        post.box(vx - 0.11, gp2 + 1.84, vz - 0.11, vx + 0.11, gp2 + 2.02, vz + 0.11, 0x46525c);
        post.box(vx - 0.02, gp2 + 2.02, vz - 0.02, vx + 0.02, gp2 + 2.38, vz + 0.02, 0x7c8a94);
        zoneBeacons.push({ x: vx, y: gp2 + 2.44, z: vz, realm: 'land', down: down, phase: ph, scale: 0.85 });
      }
    });
    if (enc.realm === 'air') {
      edges.forEach(function (e) {
        var x0 = e.c0[0] * T, z0 = e.c0[1] * T, x1 = e.c1[0] * T, z1 = e.c1[1] * T;
        var y0 = gy(x0, z0) + band.h1, y1 = gy(x1, z1) + band.h1;
        cablePos.push(x0, y0, z0, x1, y1, z1);
        if ((e.c0[0] + e.c0[1]) % 2 === 0) {
          var mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5, mz = (z0 + z1) * 0.5;
          post.box(mx - 0.11, my - 0.11, mz - 0.11, mx + 0.11, my + 0.11, mz + 0.11, 0xf06a24);
        }
      });
      if (cablePos.length) {
        var cgeo = new THREE.BufferGeometry();
        cgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cablePos), 3));
        var clines = new THREE.LineSegments(cgeo, new THREE.LineBasicMaterial({ color: 0x5a6872, transparent: true, opacity: 0.55, depthWrite: false }));
        clines.frustumCulled = false; clines.renderOrder = 7; root.add(clines); zoneLines.push(clines);
      }
    }
    if (overlayOn) add(ov, glass(0.18), 6);
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
    tagMesh.count = n; tagMesh.visible = n > 0; tagMesh.instanceMatrix.needsUpdate = true; if (tagMesh.instanceColor) tagMesh.instanceColor.needsUpdate = true;
  }
  function updateBeacons() {
    var n = zoneBeacons.length;
    if (!n) { if (beaconMesh) { beaconMesh.count = 0; beaconMesh.visible = false; } return; }
    if (!beaconMesh || n > beaconCap) {
      if (beaconMesh) { root.remove(beaconMesh); beaconMesh.geometry.dispose(); beaconMesh.material.dispose(); }
      beaconCap = Math.max(512, n);
      var bg = new THREE.IcosahedronGeometry(0.11, 1);
      beaconMesh = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff }), beaconCap);
      beaconMesh.frustumCulled = false; beaconMesh.renderOrder = 8;
      beaconMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(beaconCap * 3), 3);
      root.add(beaconMesh);
      if (!_mat4) { _mat4 = new THREE.Matrix4(); _q = new THREE.Quaternion(); _sc = new THREE.Vector3(1, 1, 1); _pp = new THREE.Vector3(); }
    }
    var col = new THREE.Color();
    for (var k = 0; k < n; k++) {
      var b = zoneBeacons[k], sMul = 1.0, ph;
      if (b.realm === 'sea') {
        if (b.down) {
          ph = ((t0 * 3.2 + b.phase) % 1 + 1) % 1;
          var sOn = ph < 0.48;
          col.setHex(sOn ? 0xff2e22 : 0x4a120e);
          sMul = sOn ? 1.18 : 0.9;
        } else {
          ph = ((t0 * 0.85 + b.phase) % 1 + 1) % 1;
          var bOn = ph < 0.22;
          col.setHex(bOn ? (ph < 0.09 ? 0xfff2a6 : 0x66ffbb) : 0x20483e);
          sMul = bOn ? 1.2 : 0.88;
        }
      } else if (b.realm === 'air') {
        if (b.down) {
          ph = ((t0 * 3.4 + b.phase) % 1 + 1) % 1;
          var aDownOn = ph < 0.22 || (ph >= 0.34 && ph < 0.54);
          col.setHex(aDownOn ? 0xff2e22 : 0x4a120e);
          sMul = aDownOn ? 1.2 : 0.9;
        } else {
          ph = ((t0 * 1.1 + b.phase) % 1 + 1) % 1;
          var s1 = ph < 0.11, s2 = ph >= 0.18 && ph < 0.28;
          col.setHex(s1 ? 0xffe066 : s2 ? 0x66e8ff : 0x223844);
          sMul = (s1 || s2) ? 1.18 : 0.88;
        }
      } else {
        if (b.down) {
          ph = ((t0 * 3.0 + b.phase) % 1 + 1) % 1;
          var lOn = ph < 0.5;
          col.setHex(lOn ? 0xff3b2a : 0x4a1410);
          sMul = lOn ? 1.12 : 0.9;
        } else {
          var gp = 0.68 + 0.32 * Math.sin(t0 * 2.2 + b.phase * 6.283);
          col.setHex(0x4aff9a).multiplyScalar(gp);
        }
      }
      _pp.set(b.x, b.y, b.z);
      _sc.setScalar(b.scale * sMul);
      _mat4.compose(_pp, _q, _sc);
      beaconMesh.setMatrixAt(k, _mat4);
      beaconMesh.setColorAt(k, col);
    }
    beaconMesh.count = n; beaconMesh.visible = true;
    beaconMesh.instanceMatrix.needsUpdate = true;
    if (beaconMesh.instanceColor) beaconMesh.instanceColor.needsUpdate = true;
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
  function sig() { var s = S(), r = ''; if (s && s.enclosures) s.enclosures.forEach(function (e) { if (e.kind === 'virtual') r += ((e.vdown || e.down) ? 'd' : 'u') + (e.band || 1); if (e.kind === 'dome') r += RW.locked ? 'L' : 'o'; }); return r; }
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
    crackle(dt || 0.016); updateTags(); updateBeacons(); splashes(dt || 0.016);
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
