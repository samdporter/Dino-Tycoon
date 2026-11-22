// ===== 42-world-moats.js =====
// Moats package, world side: trenches cut into the terrain mesh (vertex hook in 40-world calcVertex), wet ditches drawn by the map water
// (hook in rebuildWater), bridge decks (own merged mesh, path chunks skip bridge tiles), keeper gates, moat overlay, flow hint.
// Hooks in 40-world.js call Z.MoatsWorld.{vtx, hasWater, water, isBridge, deckY, svBlocked}.  Needs Z.World.scene()/groundY().
(function () {
  'use strict';
  var N = Z.N, T = Z.TILE, NN = N * N, D = Z.DATA, MD = D.moats;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; NN = n * n; runOf = new Int16Array(NN).fill(-1); runs = []; });
  var MW = Z.MoatsWorld = {};
  var DW = MD.depths.map(function (d) { return d.world; });
  var dcount = 0, bdirty = true, odirty = true, overlayOn = false;
  var scene = null, bridgeMesh = null, overlayMesh = null, bmat = null, omat = null, flow = null;
  function S() { return Z.state; }
  function recount() { var s = S(), c = 0; if (s && s.ditch) for (var t = 0; t < NN; t++) if (s.ditch[t]) c++; dcount = c; }

  // ---------------------------------------------------------------- terrain: trench shape (half-tile vertex grid, a,b in 0..2N)
  var OUT = { drop: 0, k: 0, r: 0.3, g: 0.2, b: 0.11 };
  function dAt(dt, i, j) { return i < 0 || j < 0 || i >= N || j >= N ? 0 : dt[i + j * N]; }
  MW.vtx = function (a, b) {
    if (!dcount) return null;
    var s = S(), dt = s && s.ditch; if (!dt) return null;
    var ea = a & 1, eb = b & 1, drop = 0, full = 0, i, j, d0, d1;
    if (ea && eb) { i = (a - 1) >> 1; j = (b - 1) >> 1; d0 = dAt(dt, i, j); if (!d0) return null; full = DW[d0 - 1]; drop = full; }
    else if (ea) {       // edge between tiles (i, j-1) and (i, j)
      i = (a - 1) >> 1; j = b >> 1; d0 = dAt(dt, i, j - 1); d1 = dAt(dt, i, j);
      if (!d0 && !d1) return null;
      if (d0 && d1) { full = DW[Math.min(d0, d1) - 1]; drop = full; } else { full = DW[Math.max(d0, d1) - 1]; drop = full * 0.18; }
    } else if (eb) {     // edge between tiles (i-1, j) and (i, j)
      i = a >> 1; j = (b - 1) >> 1; d0 = dAt(dt, i - 1, j); d1 = dAt(dt, i, j);
      if (!d0 && !d1) return null;
      if (d0 && d1) { full = DW[Math.min(d0, d1) - 1]; drop = full; } else { full = DW[Math.max(d0, d1) - 1]; drop = full * 0.18; }
    } else {             // corner of four tiles
      i = a >> 1; j = b >> 1; d0 = dAt(dt, i - 1, j - 1); var q1 = dAt(dt, i, j - 1), q2 = dAt(dt, i - 1, j), q3 = dAt(dt, i, j);
      if (!d0 && !q1 && !q2 && !q3) return null;
      var mn = Math.min(d0 || 9, q1 || 9, q2 || 9, q3 || 9), mx = Math.max(d0, q1, q2, q3);
      full = DW[mx - 1];
      drop = d0 && q1 && q2 && q3 ? DW[mn - 1] : 0;
      if (!drop) return null;
    }
    OUT.drop = drop; OUT.k = Math.min(0.92, 0.1 + 0.85 * drop / full); return OUT;
  };
  MW.hasWater = function () { return !!(dcount && Z.Moats && Z.Moats.state().wet && wetAny()); };
  function wetAny() { var st = Z.Moats.state(), f = st.fill; for (var t = 0; t < NN; t++) if (st.ditch[t] && f[t]) return true; return false; }

  // wet ditches feed the shared water mesh: set per-vertex surface levels (WLV), sea flag (WLS) and tile level (WLT)
  MW.water = function (WLV, WLS, WLT, S2, elevAt) {
    if (!dcount || !Z.Moats) return;
    var st = Z.Moats.state(), dt = st.ditch, t, i, j, k, pass;
    function top(i, j) { return (elevAt(i, j) + elevAt(i + 1, j) + elevAt(i, j + 1) + elevAt(i + 1, j + 1)) * 0.25; }
    var rawLvl = new Float32Array(NN), minLvl = new Float32Array(NN), maxLvl = new Float32Array(NN), nextLvl = new Float32Array(NN);
    rawLvl.fill(-99);
    for (t = 0; t < NN; t++) {
      if (!dt[t] || !st.fill[t]) continue; i = t % N; j = (t - i) / N;
      var tp = top(i, j), dw = DW[dt[t] - 1], floor = tp - dw, target = tp - 0.28 * dw;
      var contactMin = floor + Math.min(0.35, 0.45 * dw);
      minLvl[t] = floor + (st.wet[t] > 0 ? 0.45 * dw : 0.04);
      maxLvl[t] = target;
      var lvl = target;
      // clamp against adjacent lakes/rivers, or sea when near sea level, without draining below ditch bed
      var nb = [i > 0 ? t - 1 : -1, i < N - 1 ? t + 1 : -1, j > 0 ? t - N : -1, j < N - 1 ? t + N : -1];
      for (k = 0; k < 4; k++) {
        var nq = nb[k];
        if (nq >= 0 && WLT[nq] > -50 && !dt[nq]) {
          var isSeaNb = WLS[2 * (nq % N) + 1 + (2 * ((nq / N) | 0) + 1) * S2] === 1;
          if (!isSeaNb || Math.abs(lvl - WLT[nq]) < 0.6) lvl = Math.min(lvl, Math.max(contactMin, WLT[nq]));
        }
      }
      rawLvl[t] = lvl;
    }
    for (pass = 0; pass < 3; pass++) {
      for (t = 0; t < NN; t++) {
        if (rawLvl[t] <= -50) { nextLvl[t] = -99; continue; }
        i = t % N; j = (t - i) / N;
        var sum = rawLvl[t], cnt = 1;
        if (i > 0 && rawLvl[t - 1] > -50) { sum += rawLvl[t - 1]; cnt++; }
        if (i < N - 1 && rawLvl[t + 1] > -50) { sum += rawLvl[t + 1]; cnt++; }
        if (j > 0 && rawLvl[t - N] > -50) { sum += rawLvl[t - N]; cnt++; }
        if (j < N - 1 && rawLvl[t + N] > -50) { sum += rawLvl[t + N]; cnt++; }
        var v = sum / cnt;
        if (v < minLvl[t]) v = minLvl[t];
        if (v > maxLvl[t]) v = maxLvl[t];
        nextLvl[t] = v;
      }
      var tmp = rawLvl; rawLvl = nextLvl; nextLvl = tmp;
    }
    var vSum = new Float32Array(S2 * S2), vCnt = new Uint8Array(S2 * S2);
    for (t = 0; t < NN; t++) {
      if (!dt[t] || !st.fill[t]) continue; i = t % N; j = (t - i) / N;
      var tp2 = top(i, j), dw2 = DW[dt[t] - 1], floor2 = tp2 - dw2, lvl2 = rawLvl[t], fr = st.fill[t] / 255;
      if (st.wet[t] > 0 && lvl2 < floor2 + 0.45 * dw2) lvl2 = floor2 + 0.45 * dw2;
      if (fr < 1) lvl2 = floor2 + 0.04 + fr * (lvl2 - floor2 - 0.04);
      WLT[t] = lvl2;
      for (var bb = 2 * j; bb <= 2 * j + 2; bb++) for (var aa = 2 * i; aa <= 2 * i + 2; aa++) {
        var vq = aa + bb * S2;
        vSum[vq] += lvl2; vCnt[vq]++;
        if (st.wet[t] === 2) WLS[vq] = 1;
      }
    }
    for (var vq2 = 0; vq2 < S2 * S2; vq2++) {
      if (!vCnt[vq2]) continue;
      var avg = vSum[vq2] / vCnt[vq2];
      WLV[vq2] = WLV[vq2] < 1e8 ? Math.max(WLV[vq2], avg) : avg;
    }
  };

  // ---------------------------------------------------------------- bridges
  var runOf = new Int16Array(NN).fill(-1), runs = [];
  function isSpanTile(s, t) {
    var pd = D.paths[s.path[t] - 1]; if (pd && (pd.walk || pd.pontoon)) return false;
    if (s.ditch[t] > 0) return true;
    if (s.terrain[t] === WI()) {
      if (Z.Sim && Z.Sim.isSea && Z.Sim.isSea(t % N, (t / N) | 0)) return false;
      return true;
    }
    return false;
  }   // QA visual: tunnels, piers, walks and open sea tiles are not bridges
  var wiC = -1; function WI() { if (wiC < 0) wiC = D.terrain.findIndex(function (q) { return q.id === 'water'; }); return wiC; }
  MW.isBridge = function (i, j) { return !!(dcount || bridgeAny) && bridgeSet(i, j); };
  var bridgeAny = true;
  function bridgeSet(i, j) { var s = S(); if (!s || !s.path) return false; var t = i + j * N; return s.path[t] > 0 && isSpanTile(s, t); }
  MW.deckY = function (x, z) {
    var i = (x / T) | 0, j = (z / T) | 0; if (i < 0 || j < 0 || i >= N || j >= N) return null;
    var r = runOf[i + j * N]; if (r < 0 || bdirty) return null;
    var run = runs[r], u = run.axis === 0 ? x - run.x0 : z - run.z0;
    return profile(run, clamp(u / (run.L * T), 0, 1)) + 0.05;
  };
  MW.svBlocked = function (x, z) {
    var s = S(), i = (x / T) | 0, j = (z / T) | 0; if (!s || !s.ditch || i < 0 || j < 0 || i >= N || j >= N) return false;
    var t = i + j * N; return s.ditch[t] > 0 && !s.path[t];
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function profile(run, s) {   // deck height at fraction s along the span
    var base = run.y0 + (run.y1 - run.y0) * s + 0.22, sn = Math.sin(Math.PI * s);
    if (run.style === 2) return base + Math.min(1.1, 0.22 * run.L + 0.35) * sn;        // stone arch
    if (run.style === 0) return base - Math.min(0.45, 0.07 * run.L + 0.05) * sn;       // rope bridge sags
    return base + Math.min(0.75, 0.12 * run.L + 0.12) * sn;                            // wooden arch
  }
  function findRuns() {
    var s = S(), gy = Z.World.groundY; runs = []; runOf.fill(-1);
    if (!s || !s.path) return;
    var seen = new Uint8Array(NN), t, i, j;
    for (t = 0; t < NN; t++) {
      if (seen[t] || !s.path[t] || !isSpanTile(s, t)) continue;
      i = t % N; j = (t - i) / N;
      var axis = (i > 0 && s.path[t - 1] && isSpanTile(s, t - 1)) || (i < N - 1 && s.path[t + 1] && isSpanTile(s, t + 1)) ? 0 : (j > 0 && s.path[t - N] && isSpanTile(s, t - N)) || (j < N - 1 && s.path[t + N] && isSpanTile(s, t + N)) ? 1 : -1;
      if (axis < 0) {   // a single tile: lie along the axis whose far tiles are land paths
        axis = (i > 0 && i < N - 1 && !isSpanTile(s, t - 1) && !isSpanTile(s, t + 1) && (s.path[t - 1] || s.path[t + 1])) ? 0 : 1;
        if (axis === 1 && !(j > 0 && j < N - 1 && (s.path[t - N] || s.path[t + N]))) axis = 0;
      }
      var dx = axis === 0 ? 1 : 0, dy = axis === 0 ? 0 : 1, a = i, b = j;
      while (a - dx >= 0 && b - dy >= 0 && s.path[(a - dx) + (b - dy) * N] && isSpanTile(s, (a - dx) + (b - dy) * N)) { a -= dx; b -= dy; }
      var L = 0, x = a, y = b;
      while (x < N && y < N && s.path[x + y * N] && isSpanTile(s, x + y * N)) { seen[x + y * N] = 1; L++; x += dx; y += dy; }
      var run = { axis: axis, i0: a, j0: b, L: L, x0: a * T, z0: b * T, style: 1, y0: 0, y1: 0, gate0: false, gate1: false, pid: s.path[a + b * N] };
      var pid = D.paths[run.pid - 1] ? D.paths[run.pid - 1].id : 'paved';
      run.style = pid === 'dirt_path' ? 0 : pid === 'cobble' ? 2 : 1;
      var ex0 = a - dx, ey0 = b - dy, ex1 = a + dx * L, ey1 = b + dy * L;
      var cx0 = axis === 0 ? a * T : (b * T), cz0 = 0;
      run.y0 = axis === 0 ? gy(a * T, (b + 0.5) * T) : gy((a + 0.5) * T, b * T);
      run.y1 = axis === 0 ? gy((a + L) * T, (b + 0.5) * T) : gy((a + 0.5) * T, (b + L) * T);
      // keeper gate where the bridge lands inside an enclosure
      if (ex0 >= 0 && ey0 >= 0 && s.tileEnc[ex0 + ey0 * N]) run.gate0 = true;
      if (ex1 < N && ey1 < N && s.tileEnc[ex1 + ey1 * N]) run.gate1 = true;
      var idx = runs.length; runs.push(run);
      for (var q = 0; q < L; q++) runOf[(a + dx * q) + (b + dy * q) * N] = idx;
    }
  }
  // tiny merged-geometry builder (flat normals, vertex colours)
  function GB() { this.p = []; this.c = []; }
  GB.prototype.tri = function (a, b, c, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); var r = (col >> 16 & 255) / 255, g = (col >> 8 & 255) / 255, bl = (col & 255) / 255; this.c.push(r, g, bl, r, g, bl, r, g, bl); };
  GB.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  GB.prototype.geo = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeVertexNormals(); return g;
  };
  function shade(col, f) { var r = Math.min(255, (col >> 16 & 255) * f) | 0, g = Math.min(255, (col >> 8 & 255) * f) | 0, b = Math.min(255, (col & 255) * f) | 0; return (r << 16) | (g << 8) | b; }
  function buildBridges() {
    var gb = new GB(), gy = Z.World.groundY;
    runs.forEach(function (run) {
      var L = run.L, steps = Math.max(4, L * 4), wood = run.style === 1, stone = run.style === 2, rope = run.style === 0;
      var wd = stone ? 1.9 : wood ? 1.7 : 1.15, th = rope ? 0.07 : 0.14;
      var cA = rope ? 0x9a7a4a : wood ? 0x9b6b3f : 0xa6a29a, rail = rope ? 0xb8a070 : wood ? 0x6d4a2a : 0x8f8a80;
      function P(u, v, dy) {   // u: 0..L tiles along the span, v: across (-1..1 tile fraction * wd/2 given in world units)
        var s = u / L, y = profile(run, s) + (dy || 0), uw = u * T, vc = (axis0() ? run.z0 + T / 2 : run.x0 + T / 2) + v;
        return run.axis === 0 ? [run.x0 + uw, y, vc] : [vc, y, run.z0 + uw];
      }
      function axis0() { return run.axis === 0; }
      var k, hw = wd / 2;
      for (k = 0; k < steps; k++) {
        var u0 = k / steps * L, u1 = (k + 1) / steps * L, col = shade(cA, 0.92 + 0.12 * ((k * 7) % 5) / 4);
        gb.quad(P(u0, -hw, 0), P(u0, hw, 0), P(u1, hw, 0), P(u1, -hw, 0), col);                       // deck top
        gb.quad(P(u0, -hw, -th), P(u1, -hw, -th), P(u1, hw, -th), P(u0, hw, -th), shade(cA, 0.55));      // underside
        for (var sd = -1; sd <= 1; sd += 2) {                                                         // side faces
          var vv = sd * hw; if (sd < 0) gb.quad(P(u0, vv, -th), P(u0, vv, 0), P(u1, vv, 0), P(u1, vv, -th), shade(cA, 0.7)); else gb.quad(P(u0, vv, -th), P(u1, vv, -th), P(u1, vv, 0), P(u0, vv, 0), shade(cA, 0.7));
        }
        if (stone) {   // parapet walls with an arch under them
          for (sd = -1; sd <= 1; sd += 2) {
            var v1 = sd * hw, v0 = sd * (hw - 0.3), wallTop = 0.5;
            function lowY(u) { var s = u / L, w = Math.pow(Math.sin(Math.PI * s), 0.55); var ground = run.y0 + (run.y1 - run.y0) * s - 0.35; return ground * (1 - w) + (profile(run, s) - 0.55) * w; }
            function Q(u, v, y) { var p = P(u, v, 0); p[1] = y; return p; }
            var l0 = lowY(u0), l1 = lowY(u1), t0 = profile(run, u0 / L) + wallTop, t1 = profile(run, u1 / L) + wallTop;
            var sCol = shade(0x9a958b, 0.9 + 0.2 * ((k * 3) % 4) / 3);
            gb.quad(Q(u0, v1, l0), Q(u1, v1, l1), Q(u1, v1, t1), Q(u0, v1, t0), sCol);
            gb.quad(Q(u0, v0, l0), Q(u0, v0, t0), Q(u1, v0, t1), Q(u1, v0, l1), shade(sCol, 0.85));
            gb.quad(Q(u0, v0, t0), Q(u0, v1, t0), Q(u1, v1, t1), Q(u1, v0, t1), shade(sCol, 1.15));   // coping
          }
        }
      }
      // rails / ropes and posts
      var posts = Math.max(2, Math.round(L * 2) + 1), pk;
      for (pk = 0; pk < posts; pk++) {
        var up = pk / (posts - 1) * L;
        for (var sd2 = -1; sd2 <= 1; sd2 += 2) {
          if (stone) continue;
          var pv = sd2 * hw, ph = rope ? 1.05 : 0.95, pw = rope ? 0.06 : 0.07, p0 = P(up, pv, -th), p1 = P(up, pv, ph);
          gb.quad([p0[0] - pw, p0[1], p0[2] - pw], [p0[0] + pw, p0[1], p0[2] - pw], [p1[0] + pw, p1[1], p1[2] - pw], [p1[0] - pw, p1[1], p1[2] - pw], rail);
          gb.quad([p0[0] + pw, p0[1], p0[2] - pw], [p0[0] + pw, p0[1], p0[2] + pw], [p1[0] + pw, p1[1], p1[2] + pw], [p1[0] + pw, p1[1], p1[2] - pw], shade(rail, 0.8));
          gb.quad([p0[0] - pw, p0[1], p0[2] + pw], [p1[0] - pw, p1[1], p1[2] + pw], [p1[0] + pw, p1[1], p1[2] + pw], [p0[0] + pw, p0[1], p0[2] + pw], shade(rail, 0.9));
        }
      }
      if (!stone) {
        for (k = 0; k < steps; k++) {
          var ua = k / steps * L, ub = (k + 1) / steps * L;
          for (var sd3 = -1; sd3 <= 1; sd3 += 2) {
            for (var lv = 0; lv < (rope ? 1 : 2); lv++) {
              var hh = rope ? 1.0 : (lv ? 0.95 : 0.5), tk = rope ? 0.035 : (lv ? 0.06 : 0.04), vv2 = sd3 * hw;
              gb.quad(P(ua, vv2 - tk, hh), P(ua, vv2 + tk, hh), P(ub, vv2 + tk, hh), P(ub, vv2 - tk, hh), rail);
              gb.quad(P(ua, vv2 - tk, hh - 2 * tk), P(ub, vv2 - tk, hh - 2 * tk), P(ub, vv2 + tk, hh - 2 * tk), P(ua, vv2 + tk, hh - 2 * tk), shade(rail, 0.6));
              gb.quad(P(ua, vv2 + (sd3 > 0 ? tk : -tk), hh - 2 * tk), P(ub, vv2 + (sd3 > 0 ? tk : -tk), hh - 2 * tk), P(ub, vv2 + (sd3 > 0 ? tk : -tk), hh), P(ua, vv2 + (sd3 > 0 ? tk : -tk), hh), shade(rail, 0.85));
            }
          }
        }
      }
      // piers (wood) down to the bed every 3 tiles, abutments at the ends (all)
      if (wood && L >= 3) for (var pi = 1; pi * 3 < L + 0.5; pi++) {
        var upr = pi * 3 < L ? pi * 3 : L / 2;
        for (var sd4 = -1; sd4 <= 1; sd4 += 2) {
          var q0 = P(upr, sd4 * (hw - 0.15), -th), bx = q0[0], bz = q0[2], by = gy(bx, bz) - 0.2, pw2 = 0.12;
          gb.quad([bx - pw2, by, bz - pw2], [bx + pw2, by, bz - pw2], [bx + pw2, q0[1], bz - pw2], [bx - pw2, q0[1], bz - pw2], shade(rail, 0.8));
          gb.quad([bx + pw2, by, bz - pw2], [bx + pw2, by, bz + pw2], [bx + pw2, q0[1], bz + pw2], [bx + pw2, q0[1], bz - pw2], shade(rail, 0.65));
          gb.quad([bx - pw2, by, bz + pw2], [bx - pw2, q0[1], bz + pw2], [bx + pw2, q0[1], bz + pw2], [bx + pw2, by, bz + pw2], shade(rail, 0.9));
          gb.quad([bx - pw2, by, bz - pw2], [bx - pw2, q0[1], bz - pw2], [bx - pw2, q0[1], bz + pw2], [bx - pw2, by, bz + pw2], shade(rail, 0.75));
        }
      }
      // keeper gates: a pair of posts, a lintel and a closed gate leaf where the bridge lands inside an enclosure
      [[run.gate0, 0], [run.gate1, L]].forEach(function (g) {
        if (!g[0]) return;
        var u = g[1] === 0 ? 0.04 : L - 0.04, gc = 0xc9a24a, gp = 0x3f4a52;
        for (var sd5 = -1; sd5 <= 1; sd5 += 2) {
          var a1 = P(u, sd5 * hw, -th), a2 = P(u, sd5 * hw, 1.35), pw3 = 0.09;
          gb.quad([a1[0] - pw3, a1[1], a1[2] - pw3], [a1[0] + pw3, a1[1], a1[2] - pw3], [a2[0] + pw3, a2[1], a2[2] - pw3], [a2[0] - pw3, a2[1], a2[2] - pw3], gp);
          gb.quad([a1[0] + pw3, a1[1], a1[2] - pw3], [a1[0] + pw3, a1[1], a1[2] + pw3], [a2[0] + pw3, a2[1], a2[2] + pw3], [a2[0] + pw3, a2[1], a2[2] - pw3], shade(gp, 0.8));
          gb.quad([a1[0] - pw3, a1[1], a1[2] + pw3], [a2[0] - pw3, a2[1], a2[2] + pw3], [a2[0] + pw3, a2[1], a2[2] + pw3], [a1[0] + pw3, a1[1], a1[2] + pw3], shade(gp, 0.9));
        }
        for (var bar = 0; bar < 4; bar++) {
          var hbar = 0.3 + bar * 0.3, pa = P(u, -hw, hbar), pb = P(u, hw, hbar), tk2 = 0.035;
          gb.quad([pa[0], pa[1] - tk2, pa[2]], [pb[0], pb[1] - tk2, pb[2]], [pb[0], pb[1] + tk2, pb[2]], [pa[0], pa[1] + tk2, pa[2]], gc);
          gb.quad([pa[0] + (run.axis === 0 ? tk2 : 0), pa[1] - tk2, pa[2] + (run.axis === 0 ? 0 : tk2)], [pa[0] + (run.axis === 0 ? tk2 : 0), pa[1] + tk2, pa[2] + (run.axis === 0 ? 0 : tk2)], [pb[0] + (run.axis === 0 ? tk2 : 0), pb[1] + tk2, pb[2] + (run.axis === 0 ? 0 : tk2)], [pb[0] + (run.axis === 0 ? tk2 : 0), pb[1] - tk2, pb[2] + (run.axis === 0 ? 0 : tk2)], shade(gc, 0.8));
        }
        var hinge = P(u, 0, 1.45), pl = P(u, -hw, 1.45), pr = P(u, hw, 1.45);
        gb.quad([pl[0], pl[1] - 0.05, pl[2]], [pr[0], pr[1] - 0.05, pr[2]], [pr[0], pr[1] + 0.07, pr[2]], [pl[0], pl[1] + 0.07, pl[2]], gp);
      });
    });
    if (bridgeMesh) { scene.remove(bridgeMesh); bridgeMesh.geometry.dispose(); bridgeMesh = null; }
    if (!gb.p.length) return;
    if (!bmat) bmat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    bridgeMesh = new THREE.Mesh(gb.geo(), bmat); bridgeMesh.frustumCulled = false; scene.add(bridgeMesh);
  }

  // ---------------------------------------------------------------- overlay: wet / dry / partial / inadequate
  MW.setOverlay = function (on) { overlayOn = !!on; odirty = true; if (overlayMesh) overlayMesh.visible = overlayOn; };
  MW.overlayOn = function () { return overlayOn; };
  function buildOverlay() {
    if (overlayMesh) { scene.remove(overlayMesh); overlayMesh.geometry.dispose(); overlayMesh = null; }
    if (!overlayOn || !Z.Moats) return;
    var st = Z.Moats.state(), bad = Z.Moats.inadequateTiles(), gb = new GB(), gy = Z.World.groundY;
    for (var t = 0; t < NN; t++) {
      if (!st.ditch[t]) continue; var i = t % N, j = (t - i) / N, x0 = i * T + 0.12, z0 = j * T + 0.12, x1 = (i + 1) * T - 0.12, z1 = (j + 1) * T - 0.12;
      var y = Math.max(gy(x0, z0), gy(x1, z0), gy(x0, z1), gy(x1, z1)) + 0.1;
      var col = bad[t] ? 0xe0453a : st.wet[t] === 2 ? 0x2fb8b0 : st.wet[t] ? 0x3a8fe0 : st.fill[t] ? 0x7fc4f0 : 0xe0a030;
      gb.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], col);
      if (Z.OvPat) Z.OvPat.mark(gb, t, bad[t] ? 'x' : st.wet[t] === 2 ? 's3' : st.wet[t] ? 's2' : st.fill[t] ? 's1' : 'dots', y);   // not colour alone: X inadequate, dots dry, 1-3 stripes = water level
    }
    if (!gb.p.length) return;
    if (!omat) omat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
    overlayMesh = new THREE.Mesh(gb.geo(), omat); overlayMesh.frustumCulled = false; overlayMesh.renderOrder = 5; scene.add(overlayMesh);
  }

  // ---------------------------------------------------------------- flow hint: foam flecks drift along wet ditches away from the source
  var flowN = 0, FL = null;
  function buildFlow() {
    if (flow) { scene.remove(flow); flow.geometry.dispose(); flow = null; }
    if (!Z.Moats) return;
    var st = Z.Moats.state(), tiles = [], t;
    for (t = 0; t < NN; t++) if (st.ditch[t] && st.wet[t] === 1) tiles.push(t);
    if (!tiles.length) { FL = null; return; }
    flowN = Math.min(160, tiles.length * 2);
    var g = new THREE.PlaneGeometry(0.34, 0.14); g.rotateX(-Math.PI / 2);
    flow = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xe8f6f8, transparent: true, opacity: 0.5, depthWrite: false }), flowN);
    flow.frustumCulled = false; flow.renderOrder = 3; scene.add(flow);
    FL = []; for (var k = 0; k < flowN; k++) { var tt = tiles[(k * 7919) % tiles.length]; FL.push({ t: tt, u: (k * 0.37) % 1, v: ((k * 53) % 17) / 17 - 0.5, ax: (k & 1) }); }
  }
  var _m = null, _q = null, _s = null, _p = null, _up = null;
  function updateFlow(time) {
    if (!flow || !FL) return;
    if (!_m) { _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _s = new THREE.Vector3(1, 1, 1); _p = new THREE.Vector3(); _up = new THREE.Vector3(0, 1, 0); }
    var st = Z.Moats.state();
    for (var k = 0; k < FL.length; k++) {
      var f = FL[k], i = f.t % N, j = (f.t - i) / N, u = (f.u + time * 0.08) % 1;
      var x = (i + (f.ax ? u : 0.5 + f.v * 0.6)) * T, z = (j + (f.ax ? 0.5 + f.v * 0.6 : u)) * T;
      var lvl = Z.World.waterLevelAt ? Z.World.waterLevelAt(x, z) : -99;
      _p.set(x, (lvl > -50 ? lvl : Z.World.groundY(x, z)) + 0.04, z);
      _q.setFromAxisAngle(_up, f.ax ? 0 : Math.PI / 2);
      _m.compose(_p, _q, _s); flow.setMatrixAt(k, _m);
    }
    flow.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- per frame
  var t0 = 0;
  function frame(dt) {
    if (!scene) { try { scene = Z.World.scene(); } catch (e) { scene = null; } if (!scene) return; }
    t0 += dt || 0.016;
    if (bdirty) { bdirty = false; findRuns(); buildBridges(); }
    if (odirty) { odirty = false; buildOverlay(); }
    if (fdirty) { fdirty = false; buildFlow(); }
    updateFlow(t0);
  }
  var fdirty = true;
  function dirtyAll() { recount(); bdirty = true; odirty = true; fdirty = true; }
  Z.bus.on('terrain', dirtyAll); Z.bus.on('reset', dirtyAll); Z.bus.on('moats', function () { odirty = true; fdirty = true; });
  Z.bus.on('path', function () { bdirty = true; }); Z.bus.on('enclosures', function () { bdirty = true; odirty = true; }); Z.bus.on('elev', function () { bdirty = true; odirty = true; fdirty = true; });
  if (Z.World && Z.World.frame) { var ofr = Z.World.frame; Z.World.frame = function (dt) { try { frame(dt); } catch (e) { if (!MW._err) { MW._err = 1; console.error('moats world', e); } } return ofr.apply(this, arguments); }; }
  MW.info = function () { return { runs: runs.length, ditch: dcount, overlay: overlayOn }; };
})();
