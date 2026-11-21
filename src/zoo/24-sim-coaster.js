// Wild Acres Zoo — Custom Rollercoaster Simulation (Zoo Tycoon only)
// Track graph, 3D centerline with vertical loops & corkscrews, height & special piece tools,
// gravity physics, dynamic excitement/intensity ratings, guest boarding/riding & breakdowns.
(function () {
  'use strict';
  var Z = window.Z, C = Z && Z.coasterCtx, D = Z && Z.DATA;
  if (!Z || !C || !D || !D.coaster) return;

  var CD = D.coaster;
  var TYPES = CD.types;
  var SPECIALS = CD.specials;
  var SPEC_BY_ID = {};
  for (var si = 0; si < SPECIALS.length; si++) SPEC_BY_ID[SPECIALS[si].id] = SPECIALS[si];

  var TILE = C.TILE;
  var ELEV_UNIT = Z.ELEV_UNIT || 0.75;
  var WATER = C.WATER;
  var clamp = Z.clamp || function (v, a, b) { return v < a ? a : v > b ? b : v; };

  // 4-bit orthogonal connection masks: 1=N(-z), 2=E(+x), 4=S(+z), 8=W(-x)
  var DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0], BIT = [1, 2, 4, 8], OPP = [4, 8, 1, 2];

  // Derived graph + runtime train state (never serialized)
  var X = emptyX();
  var TR = {}; // trainId -> runtime { s, v, state, dwell, fix, eng, riders[], loopDone, seenLoop, seenSplash, seenEncs }
  var VER = 0;

  function emptyX() {
    return {
      ver: 0,
      stations: [],    // [{ obj, def, typeDef, fp, tiles, fd, bd, endF, endB, deck, lineIdx }]
      stById: {},      // objId -> station
      stAt: null,      // Int16Array(N*N) -> station index or -1
      lineAt: null,    // Int16Array(N*N) -> line index or -1
      lines: [],       // [{ idx, station, typeDef, nodes, loop, branch, bad, px,py,pz, tx,ty,tz, ux,uy,uz, sSpec, sLen, totalLen, pylons, overlooks, excitement, intensity, maxHeight, totalDrop, peakSpeed, specs, recPrice, ready }]
      bad: {}          // tile -> reason
    };
  }

  function ensureArrays(s) {
    var N = C.getN(), nn = N * N;
    if (!s.coasterRail || s.coasterRail.length !== nn) s.coasterRail = new Uint8Array(nn);
    if (!s.coasterElev || s.coasterElev.length !== nn) s.coasterElev = new Int8Array(nn);
    if (!s.coasterSpec || s.coasterSpec.length !== nn) s.coasterSpec = new Uint8Array(nn);
    if (!s.coaster) s.coaster = { trains: [], nextTrain: 1, stats: { riders: 0, income: 0, boardings: 0, breakdowns: 0, maxExcitement: 0 } };
    if (!s.coaster.trains) s.coaster.trains = [];
    if (!s.coaster.nextTrain) s.coaster.nextTrain = 1;
    if (!s.coaster.stats) s.coaster.stats = { riders: 0, income: 0, boardings: 0, breakdowns: 0, maxExcitement: 0 };
  }

  function cmax(t) {
    var N = C.getN(), i = t % N, j = (t - i) / N;
    var e0 = C.cornerElev(i, j), e1 = C.cornerElev(i + 1, j), e2 = C.cornerElev(i, j + 1), e3 = C.cornerElev(i + 1, j + 1);
    return Math.max(e0, e1, e2, e3) * ELEV_UNIT;
  }
  function cmean(t) {
    var N = C.getN(), i = t % N, j = (t - i) / N;
    return (C.cornerElev(i, j) + C.cornerElev(i + 1, j) + C.cornerElev(i, j + 1) + C.cornerElev(i + 1, j + 1)) * 0.25 * ELEV_UNIT;
  }
  function isWater(s, t) { return s.terrain[t] === WATER; }

  function stationList(s) {
    var N = C.getN(), out = [];
    for (var k = 0; k < s.objects.length; k++) {
      var o = s.objects[k];
      if (o.kind !== 'building') continue;
      var def = C.BD[o.type];
      if (!def || !def.coasterStation) continue;
      var td = TYPES[def.coasterType] || TYPES.wooden;
      var fp = C.footprint(def, o.i, o.j, o.rot);
      var tiles = [], mx = -1e9;
      for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
        var ti = fp.i0 + a, tj = fp.j0 + b, t = ti + tj * N;
        tiles.push(t);
        var cm = cmax(t);
        if (cm > mx) mx = cm;
      }
      // Long axis direction: rot 0 or 2 -> E/W (w=4,h=2); rot 1 or 3 -> N/S (w=2,h=4)
      // Track runs along row b=0 (or col a=0) of station
      var fd = (o.rot === 0) ? 1 : (o.rot === 1) ? 2 : (o.rot === 2) ? 3 : 0;
      var bd = (fd + 2) % 4;
      var trackTiles = [];
      if (o.rot === 0) { // E: left to right along j0
        for (a = 0; a < fp.w; a++) trackTiles.push((fp.i0 + a) + fp.j0 * N);
      } else if (o.rot === 2) { // W: right to left along j0 + h - 1
        for (a = fp.w - 1; a >= 0; a--) trackTiles.push((fp.i0 + a) + (fp.j0 + fp.h - 1) * N);
      } else if (o.rot === 1) { // S: top to bottom along i0 + w - 1
        for (b = 0; b < fp.h; b++) trackTiles.push((fp.i0 + fp.w - 1) + (fp.j0 + b) * N);
      } else { // N: bottom to top along i0
        for (b = fp.h - 1; b >= 0; b--) trackTiles.push(fp.i0 + (fp.j0 + b) * N);
      }
      out.push({
        obj: o, def: def, typeDef: td, fp: fp, tiles: tiles,
        trackTiles: trackTiles,
        fd: fd, bd: bd,
        endF: trackTiles[trackTiles.length - 1],
        endB: trackTiles[0],
        deck: mx + CD.stationDeck,
        lineIdx: -1
      });
    }
    return out;
  }

  function stepTile(t, d) {
    var N = C.getN(), i = t % N, j = (t - i) / N;
    var ni = i + DX[d], nj = j + DZ[d];
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return -1;
    return ni + nj * N;
  }

  function dirBetween(t1, t2) {
    var N = C.getN(), i1 = t1 % N, j1 = (t1 - i1) / N, i2 = t2 % N, j2 = (t2 - i2) / N;
    var di = i2 - i1, dj = j2 - j1;
    if (di === 0 && dj === -1) return 0;
    if (di === 1 && dj === 0) return 1;
    if (di === 0 && dj === 1) return 2;
    if (di === -1 && dj === 0) return 3;
    return -1;
  }

  function hasEdge(rail, x, t, d) {
    var nt = stepTile(t, d);
    if (nt < 0) return false;
    var si1 = x.stAt[t], si2 = x.stAt[nt];
    if (si1 >= 0 && si2 >= 0) {
      if (si1 !== si2) return false;
      var st = x.stations[si1], idx1 = st.trackTiles.indexOf(t), idx2 = st.trackTiles.indexOf(nt);
      return idx1 >= 0 && idx2 >= 0 && Math.abs(idx1 - idx2) === 1;
    }
    if (si1 >= 0) {
      var st1 = x.stations[si1];
      if (t === st1.endF && d === st1.fd) return !!(rail[nt] & OPP[d]);
      if (t === st1.endB && d === st1.bd) return !!(rail[nt] & OPP[d]);
      return false;
    }
    if (si2 >= 0) {
      var st2 = x.stations[si2];
      if (nt === st2.endF && d === st2.bd) return !!(rail[t] & BIT[d]);
      if (nt === st2.endB && d === st2.fd) return !!(rail[t] & BIT[d]);
      return false;
    }
    return !!(rail[t] & BIT[d]) && !!(rail[nt] & OPP[d]);
  }

  function canBase(s, x, t) {
    if (x.stAt[t] >= 0) return false;
    if (s.tileObj[t]) return false;
    if (s.path[t]) return false;
    if (isWater(s, t) && cmean(t) < -1.0) return false;
    return true;
  }

  function obstacleClearance(s, t) {
    var oid = s.tileObj[t];
    if (!oid) return 0;
    var RT = C.getRT(), o = RT && RT.oById ? RT.oById.get(oid) : null;
    if (!o) return 0;
    return o.kind === 'building' ? 3.8 : 2.2;
  }

  function vecNorm(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / l, y / l, z / l];
  }
  function vecCross(ax, ay, az, bx, by, bz) {
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  }

  // Build 3D spline, pylons, overlooks, and excitement/intensity ratings for a coaster circuit
  function buildLine(s, x, st, nodes, loop, branch, li) {
    var N = C.getN(), td = st.typeDef, k, m = nodes.length;
    var elev = s.coasterElev, spec = s.coasterSpec;

    // 1. Per-node target heights
    var h = new Float32Array(m);
    for (k = 0; k < m; k++) {
      var t = nodes[k];
      if (x.stAt[t] >= 0) {
        h[k] = st.deck;
      } else {
        var base = Math.max(cmax(t), isWater(s, t) ? 0.35 : -1e9) + obstacleClearance(s, t) + CD.clearance;
        var extra = clamp(elev[t] || 0, 0, td.maxHeight) * CD.elevStep;
        h[k] = base + extra;
      }
    }
    // Slope limiting passes (3 forward + 3 backward), preserving station deck level
    var maxS = CD.maxSlope;
    for (var pass = 0; pass < 3; pass++) {
      for (k = 0; k < m; k++) {
        var nk = (k + 1) % m;
        if (!loop && nk === 0) continue;
        if (x.stAt[nodes[nk]] < 0 && h[nk] > h[k] + maxS) h[nk] = h[k] + maxS;
        if (x.stAt[nodes[k]] < 0 && h[k] > h[nk] + maxS) h[k] = h[nk] + maxS;
      }
      for (k = m - 1; k >= 0; k--) {
        var pk = (k - 1 + m) % m;
        if (!loop && k === 0) continue;
        if (x.stAt[nodes[pk]] < 0 && h[pk] > h[k] + maxS) h[pk] = h[k] + maxS;
        if (x.stAt[nodes[k]] < 0 && h[k] > h[pk] + maxS) h[k] = h[pk] + maxS;
      }
    }
    // Gentle smoothing on non-station nodes
    for (var spass = 0; spass < 2; spass++) {
      var h2 = h.slice();
      for (k = 0; k < m; k++) {
        if (x.stAt[nodes[k]] >= 0) continue;
        var p1 = (k - 1 + m) % m, n1 = (k + 1) % m;
        if (!loop && (k === 0 || k === m - 1)) continue;
        h2[k] = Math.max(h[k] * 0.72 + (h[p1] + h[n1]) * 0.14, cmax(nodes[k]) + CD.clearance * 0.85);
      }
      h = h2;
    }

    // 2. Support pylons (skip station tiles; check maxSpan)
    var pylons = [], bad = {}, span = 0;
    for (k = 0; k < m; k++) {
      var tk = nodes[k];
      if (x.stAt[tk] >= 0) { span = 0; continue; }
      var okBase = canBase(s, x, tk);
      if (okBase && (span >= CD.prefSpan - 1 || k === m - 1 || (elev[tk] || 0) >= 2 || (spec[tk] || 0) >= 4)) {
        pylons.push({ t: tk, x: C.cxOf(tk), z: C.czOf(tk), yTop: h[k], yBot: Math.min(cmean(tk) - 0.3, h[k] - 0.5) });
        span = 0;
      } else if (okBase && span >= CD.maxSpan - 1) {
        pylons.push({ t: tk, x: C.cxOf(tk), z: C.czOf(tk), yTop: h[k], yBot: Math.min(cmean(tk) - 0.3, h[k] - 0.5) });
        span = 0;
      } else {
        span++;
        if (span > CD.maxSpan) bad[tk] = 'No room for coaster supports here';
      }
    }

    // 3. Build 3D control points with Bezier corners + parametric Loops & Corkscrews
    var pts = []; // { x, y, z, spec, ux, uy, uz, hasUp }
    var specsCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    var maxH = 0, totalDrop = 0;

    for (k = 0; k < m; k++) {
      var tc = nodes[k], hc = h[k];
      var cx = C.cxOf(tc), cz = C.czOf(tc);
      var prevK = (k - 1 + m) % m, nextK = (k + 1) % m;
      var tp = nodes[prevK], tn = nodes[nextK];
      var hasPrev = loop || k > 0, hasNext = loop || k < m - 1;
      var gH = hc - cmax(tc);
      if (gH > maxH) maxH = gH;
      if (hasPrev && h[prevK] > hc) totalDrop += (h[prevK] - hc);

      var spc = x.stAt[tc] >= 0 ? 0 : (spec[tc] || 0);
      if (spc && specsCount[spc] !== undefined) specsCount[spc]++;

      if (hasPrev && hasNext) {
        var d1x = cx - C.cxOf(tp), d1z = cz - C.czOf(tp);
        var d2x = C.cxOf(tn) - cx, d2z = C.czOf(tn) - cz;
        var isCorner = Math.abs(d1x * d2z - d1z * d2x) >= 1e-4;
        if (isCorner) {
          var m1x = (C.cxOf(tp) + cx) * 0.5, m1z = (C.czOf(tp) + cz) * 0.5, m1h = (h[prevK] + hc) * 0.5;
          var m2x = (cx + C.cxOf(tn)) * 0.5, m2z = (cz + C.czOf(tn)) * 0.5, m2h = (hc + h[nextK]) * 0.5;
          for (var q = 0; q <= 8; q++) {
            var u = q / 8, iu = 1 - u;
            pts.push({
              x: iu * iu * m1x + 2 * iu * u * cx + u * u * m2x,
              y: iu * iu * m1h + 2 * iu * u * hc + u * u * m2h,
              z: iu * iu * m1z + 2 * iu * u * cz + u * u * m2z,
              spec: spc, hasUp: false
            });
          }
          continue;
        }
        // Straight tile: check for Loop-de-Loop (4) or Corkscrew (5)
        if (spc === 4 || spc === 5) {
          var fl = Math.sqrt(d1x * d1x + d1z * d1z) || 1;
          var fx = d1x / fl, fz = d1z / fl;
          var rx = -fz, rz = fx;
          var steps = spc === 4 ? 28 : 24;
          var R = spc === 4 ? 2.4 : 1.15;
          if (spc === 4) maxH = Math.max(maxH, gH + R * 2);
          for (var j = 0; j <= steps; j++) {
            var th = (j / steps) * Math.PI * 2;
            var px, py, pz, ux, uy, uz;
            if (spc === 4) {
              // Vertical 360° loop with gentle lateral offset so rails don't intersect
              var lin = -1.0 + 2.0 * (j / steps);
              var fwdOff = lin + R * Math.sin(th) * 0.85;
              var latOff = 0.42 * Math.sin(th * 0.5);
              px = cx + fx * fwdOff + rx * latOff;
              py = hc + R * (1 - Math.cos(th));
              pz = cz + fz * fwdOff + rz * latOff;
              var nu = vecNorm(-fx * Math.sin(th), Math.cos(th), -fz * Math.sin(th));
              ux = nu[0]; uy = nu[1]; uz = nu[2];
            } else {
              // 360° barrel-roll corkscrew
              var lin2 = -1.0 + 2.0 * (j / steps);
              px = cx + fx * lin2 + rx * (R * Math.sin(th));
              py = hc + R * (1 - Math.cos(th));
              pz = cz + fz * lin2 + rz * (R * Math.sin(th));
              var nu2 = vecNorm(-rx * Math.sin(th), Math.cos(th), -rz * Math.sin(th));
              ux = nu2[0]; uy = nu2[1]; uz = nu2[2];
            }
            pts.push({ x: px, y: py, z: pz, spec: spc, ux: ux, uy: uy, uz: uz, hasUp: true });
          }
          continue;
        }
      }
      pts.push({ x: cx, y: hc, z: cz, spec: spc, hasUp: false });
    }

    // 4. Resample uniformly along arc length
    var rawN = pts.length;
    var segs = loop ? rawN : Math.max(0, rawN - 1);
    var cum = new Float32Array(segs + 1);
    var totalLen = 0;
    for (k = 0; k < segs; k++) {
      var p0 = pts[k], p1 = pts[(k + 1) % rawN];
      var ddx = p1.x - p0.x, ddy = p1.y - p0.y, ddz = p1.z - p0.z;
      totalLen += Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      cum[k + 1] = totalLen;
    }

    var stepLen = 0.65;
    var nS = Math.max(4, Math.round(totalLen / stepLen));
    var pxA = new Float32Array(nS), pyA = new Float32Array(nS), pzA = new Float32Array(nS);
    var txA = new Float32Array(nS), tyA = new Float32Array(nS), tzA = new Float32Array(nS);
    var uxA = new Float32Array(nS), uyA = new Float32Array(nS), uzA = new Float32Array(nS);
    var spA = new Uint8Array(nS);
    var hasUpA = new Uint8Array(nS);

    var cur = 0;
    for (k = 0; k < nS; k++) {
      var dist = (k / (loop ? nS : Math.max(1, nS - 1))) * totalLen;
      while (cur < segs - 1 && cum[cur + 1] < dist) cur++;
      var lenSeg = cum[cur + 1] - cum[cur];
      var f = lenSeg > 1e-6 ? clamp((dist - cum[cur]) / lenSeg, 0, 1) : 0;
      var a0 = pts[cur], a1 = pts[(cur + 1) % rawN];
      pxA[k] = a0.x + (a1.x - a0.x) * f;
      pyA[k] = a0.y + (a1.y - a0.y) * f;
      pzA[k] = a0.z + (a1.z - a0.z) * f;
      spA[k] = f < 0.5 ? a0.spec : a1.spec;
      if (a0.hasUp || a1.hasUp) {
        var u0x = a0.hasUp ? a0.ux : 0, u0y = a0.hasUp ? a0.uy : 1, u0z = a0.hasUp ? a0.uz : 0;
        var u1x = a1.hasUp ? a1.ux : 0, u1y = a1.hasUp ? a1.uy : 1, u1z = a1.hasUp ? a1.uz : 0;
        var nu3 = vecNorm(u0x + (u1x - u0x) * f, u0y + (u1y - u0y) * f, u0z + (u1z - u0z) * f);
        uxA[k] = nu3[0]; uyA[k] = nu3[1]; uzA[k] = nu3[2];
        hasUpA[k] = 1;
      }
    }

    // Compute tangents & orthonormal up vectors (with gentle curve banking for non-inverted segments)
    for (k = 0; k < nS; k++) {
      var kp = loop ? (k - 1 + nS) % nS : Math.max(0, k - 1);
      var kn = loop ? (k + 1) % nS : Math.min(nS - 1, k + 1);
      var tn3 = vecNorm(pxA[kn] - pxA[kp], pyA[kn] - pyA[kp], pzA[kn] - pzA[kp]);
      txA[k] = tn3[0]; tyA[k] = tn3[1]; tzA[k] = tn3[2];
      if (!hasUpA[k]) {
        // Right = T x (0,1,0), Up = R x T
        var rr = vecCross(tn3[0], tn3[1], tn3[2], 0, 1, 0);
        var rn = vecNorm(rr[0], rr[1], rr[2]);
        var uu = vecCross(rn[0], rn[1], rn[2], tn3[0], tn3[1], tn3[2]);
        var un = vecNorm(uu[0], uu[1], uu[2]);
        uxA[k] = un[0]; uyA[k] = un[1]; uzA[k] = un[2];
      } else {
        // Orthogonalize prescribed up against tangent
        var dot = uxA[k] * tn3[0] + uyA[k] * tn3[1] + uzA[k] * tn3[2];
        var un2 = vecNorm(uxA[k] - dot * tn3[0], uyA[k] - dot * tn3[1], uzA[k] - dot * tn3[2]);
        uxA[k] = un2[0]; uyA[k] = un2[1]; uzA[k] = un2[2];
      }
    }

    // Station center arc-length (station tiles are at start of nodes: 0..trackTiles.length-1)
    var stMidS = (st.trackTiles.length * 0.5) * TILE;

    // 5. Overlooked animal enclosures (within viewRadius of any track tile)
    var overlooks = [], seenE = {};
    var rad = CD.viewRadius;
    for (k = 0; k < m; k++) {
      var nt2 = nodes[k], ti2 = nt2 % N, tj2 = (nt2 - ti2) / N;
      for (var di = -rad; di <= rad; di++) for (var dj = -rad; dj <= rad; dj++) {
        if (di * di + dj * dj > rad * rad) continue;
        var xi = ti2 + di, xj = tj2 + dj;
        if (xi < 0 || xj < 0 || xi >= N || xj >= N) continue;
        var eid = s.tileEnc[xi + xj * N];
        if (eid && !seenE[eid]) {
          var enc = C.encById(eid);
          if (enc && enc.animals && enc.animals.length > 0) {
            seenE[eid] = 1;
            overlooks.push(eid);
          }
        }
      }
    }

    // 6. Dynamic Excitement, Intensity & Recommended Ticket Price
    var trackTilesCount = Math.max(0, m - st.trackTiles.length);
    var specExc = 0, specInt = 0;
    for (var sid in specsCount) {
      var cnt = specsCount[sid];
      if (!cnt) continue;
      var sdef = SPEC_BY_ID[sid];
      if (!sdef) continue;
      // Diminishing returns after 2 of the same special
      var eff = cnt <= 2 ? cnt : 2 + (cnt - 2) * 0.4;
      var flumeBonus = (td.id === 'flume' && +sid === 3) ? 1.5 : 1.0;
      specExc += sdef.excitement * eff * flumeBonus;
      specInt += sdef.intensity * eff;
    }
    var peakSpeed = clamp(td.baseSpeed + Math.sqrt(Math.max(0, totalDrop)) * 1.4 + (specsCount[2] ? 4.0 : 0), td.baseSpeed, td.maxSpeed * 1.15);
    var excRaw = (1.6 + Math.min(3.0, trackTilesCount * 0.085) + Math.min(2.4, totalDrop * 0.18) + Math.min(1.2, maxH * 0.1) + specExc + Math.min(2.0, overlooks.length * 0.45)) * td.excMul;
    var intRaw = (1.1 + Math.min(2.8, totalDrop * 0.2) + Math.min(2.2, peakSpeed * 0.1) + specInt) * (0.85 + 0.15 * td.excMul);
    var excitement = Math.round(clamp(excRaw, 1.0, 10.0) * 10) / 10;
    var intensity = Math.round(clamp(intRaw, 1.0, 10.0) * 10) / 10;
    var recPrice = Math.round(clamp(4 + excitement * 2.2, 5, CD.fareMax));
    var hasBad = Object.keys(bad).length > 0;
    var ready = loop && !branch && !hasBad && trackTilesCount >= 4;

    return {
      idx: li,
      station: st,
      typeDef: td,
      nodes: nodes,
      loop: loop,
      branch: branch,
      bad: bad,
      px: pxA, py: pyA, pz: pzA,
      tx: txA, ty: tyA, tz: tzA,
      ux: uxA, uy: uyA, uz: uzA,
      sSpec: spA,
      nS: nS,
      totalLen: totalLen,
      stMidS: stMidS,
      pylons: pylons,
      overlooks: overlooks,
      trackLen: trackTilesCount,
      maxHeight: Math.round(maxH * 10) / 10,
      totalDrop: Math.round(totalDrop * 10) / 10,
      peakSpeed: Math.round(peakSpeed * 10) / 10,
      specs: specsCount,
      excitement: excitement,
      intensity: intensity,
      recPrice: recPrice,
      ready: ready
    };
  }

  function compute(s, rail, elev, spec) {
    var N = C.getN(), nn = N * N;
    var x = emptyX();
    x.ver = ++VER;
    x.stations = stationList(s);
    x.stAt = new Int16Array(nn).fill(-1);
    x.lineAt = new Int16Array(nn).fill(-1);

    var k, i;
    for (k = 0; k < x.stations.length; k++) {
      var st = x.stations[k];
      x.stById[st.obj.id] = st;
      for (i = 0; i < st.tiles.length; i++) x.stAt[st.tiles[i]] = k;
    }

    // For each station, trace out from endF until we either return to endB (closed loop!) or hit dead end / branch
    var usedStation = {};
    for (k = 0; k < x.stations.length; k++) {
      if (usedStation[k]) continue;
      var st0 = x.stations[k];
      var nodes = st0.trackTiles.slice();
      var visited = {};
      for (i = 0; i < nodes.length; i++) visited[nodes[i]] = 1;

      var cur = st0.endF, prev = st0.trackTiles[st0.trackTiles.length - 2];
      var loop = false, branch = false, steps = 0;

      // Step out from endF in direction fd
      var firstOut = stepTile(st0.endF, st0.fd);
      if (firstOut >= 0 && hasEdge(rail, x, st0.endF, st0.fd)) {
        prev = cur;
        cur = firstOut;
        while (steps++ < nn) {
          if (cur === st0.endB) {
            // Completed the closed loop!
            loop = true;
            break;
          }
          if (x.stAt[cur] >= 0 && x.stAt[cur] !== k) {
            branch = true;
            break;
          }
          if (visited[cur]) { branch = true; break; }
          visited[cur] = 1;
          nodes.push(cur);

          // Find all connected neighbors of cur
          var nbrs = [];
          for (var d = 0; d < 4; d++) {
            if (hasEdge(rail, x, cur, d)) {
              var nt = stepTile(cur, d);
              if (nt >= 0) nbrs.push(nt);
            }
          }
          if (nbrs.length > 2) { branch = true; break; }
          var nextT = -1;
          for (i = 0; i < nbrs.length; i++) if (nbrs[i] !== prev) { nextT = nbrs[i]; break; }
          if (nextT < 0) break;
          prev = cur;
          cur = nextT;
        }
      }

      var li = x.lines.length;
      st0.lineIdx = li;
      usedStation[k] = 1;
      var L = buildLine(s, x, st0, nodes, loop, branch, li);
      x.lines.push(L);
      for (i = 0; i < nodes.length; i++) x.lineAt[nodes[i]] = li;
      for (var bt in L.bad) x.bad[bt] = L.bad[bt];
    }

    // Track max excitement in stats
    if (s.coaster && s.coaster.stats) {
      var mxE = s.coaster.stats.maxExcitement || 0;
      for (k = 0; k < x.lines.length; k++) {
        if (x.lines[k].ready && x.lines[k].excitement > mxE) mxE = x.lines[k].excitement;
      }
      s.coaster.stats.maxExcitement = mxE;
    }
    return x;
  }

  // Sample spline position, tangent, up vector at arc-length s
  function sample(L, s, out) {
    out = out || {};
    var n = L.nS, total = L.totalLen || 1;
    if (L.loop) s = ((s % total) + total) % total;
    else s = clamp(s, 0, total);
    var pos = (s / total) * (L.loop ? n : Math.max(1, n - 1));
    var i0 = Math.floor(pos) % n;
    var i1 = L.loop ? (i0 + 1) % n : Math.min(n - 1, i0 + 1);
    var f = pos - Math.floor(pos);
    out.x = L.px[i0] + (L.px[i1] - L.px[i0]) * f;
    out.y = L.py[i0] + (L.py[i1] - L.py[i0]) * f;
    out.z = L.pz[i0] + (L.pz[i1] - L.pz[i0]) * f;
    var t = vecNorm(L.tx[i0] + (L.tx[i1] - L.tx[i0]) * f, L.ty[i0] + (L.ty[i1] - L.ty[i0]) * f, L.tz[i0] + (L.tz[i1] - L.tz[i0]) * f);
    var u = vecNorm(L.ux[i0] + (L.ux[i1] - L.ux[i0]) * f, L.uy[i0] + (L.uy[i1] - L.uy[i0]) * f, L.uz[i0] + (L.uz[i1] - L.uz[i0]) * f);
    out.tx = t[0]; out.ty = t[1]; out.tz = t[2];
    out.ux = u[0]; out.uy = u[1]; out.uz = u[2];
    out.spec = L.sSpec[i0];
    out.s = s;
    return out;
  }

  function lineForStation(stationId) {
    var st = X.stById[stationId];
    return st && st.lineIdx >= 0 ? X.lines[st.lineIdx] : null;
  }

  function carPose(T, k, out) {
    var L = lineForStation(T.stationId);
    if (!L) return null;
    var rt = TR[T.id];
    var sHead = rt ? rt.s : (T.s || L.stMidS);
    var offset = k * (CD.carLen + CD.carGap);
    return sample(L, sHead - offset, out || {});
  }

  // ---- Track Planning, Building, Height & Special Pieces ----
  function findStationNearTile(t) {
    if (X.stAt[t] >= 0) return X.stations[X.stAt[t]];
    for (var d = 0; d < 4; d++) {
      var nt = stepTile(t, d);
      if (nt >= 0 && X.stAt[nt] >= 0) return X.stations[X.stAt[nt]];
    }
    return null;
  }

  function typeForRoute(route) {
    for (var k = 0; k < route.length; k++) {
      var li = X.lineAt[route[k]];
      if (li >= 0 && X.lines[li]) return X.lines[li].typeDef;
      var st = findStationNearTile(route[k]);
      if (st) return st.typeDef;
    }
    return TYPES.wooden;
  }

  function planTrack(route, opts) {
    var s = C.getS(); ensureArrays(s);
    if (!route || route.length < 2) return C.fail('Drag at least 2 tiles from a coaster station');
    var N = C.getN(), rail = s.coasterRail.slice();
    var td = typeForRoute(route);
    var cost = 0, added = 0, tiles = [];

    for (var k = 0; k < route.length; k++) {
      var t = route[k], i = t % N, j = (t - i) / N;
      if (!C.inMap(i, j)) return C.fail('Outside your land');
    }

    for (k = 0; k + 1 < route.length; k++) {
      var t1 = route[k], t2 = route[k + 1];
      if (t1 === t2) continue;
      var d = dirBetween(t1, t2);
      if (d < 0) return C.fail('Track tiles must be adjacent');
      var s1 = X.stAt[t1], s2 = X.stAt[t2];
      if (s1 >= 0 && s2 >= 0) continue; // inside station
      if (s1 >= 0) {
        var st1 = X.stations[s1];
        if (!((t1 === st1.endF && d === st1.fd) || (t1 === st1.endB && d === st1.bd))) {
          return C.fail('Connect track to the front or back end of the station');
        }
      }
      if (s2 >= 0) {
        var st2 = X.stations[s2];
        if (!((t2 === st2.endF && d === st2.bd) || (t2 === st2.endB && d === st2.fd))) {
          return C.fail('Connect track to the front or back end of the station');
        }
      }
      if (s1 < 0) {
        var had1 = rail[t1] !== 0;
        var next1 = rail[t1] | BIT[d];
        if (popcount4(next1) > 2) return C.fail('Coaster tracks cannot branch or cross');
        if (next1 !== rail[t1]) {
          rail[t1] = next1;
          if (!had1) { cost += td.trackCost + (isWater(s, t1) ? td.waterExtra : 0); added++; }
          if (tiles.indexOf(t1) < 0) tiles.push(t1);
        }
      }
      if (s2 < 0) {
        var had2 = rail[t2] !== 0;
        var next2 = rail[t2] | OPP[d];
        if (popcount4(next2) > 2) return C.fail('Coaster tracks cannot branch or cross');
        if (next2 !== rail[t2]) {
          rail[t2] = next2;
          if (!had2) { cost += td.trackCost + (isWater(s, t2) ? td.waterExtra : 0); added++; }
          if (tiles.indexOf(t2) < 0) tiles.push(t2);
        }
      }
    }
    if (!tiles.length) return C.fail('Track is already built here');
    if (s.money < cost) return C.fail('Not enough money');
    var simX = compute(s, rail, s.coasterElev, s.coasterSpec);
    for (var b in simX.bad) return C.fail(simX.bad[b]);
    return C.okr(cost, { tiles: tiles, rail: rail, added: added, typeDef: td });
  }

  function popcount4(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }

  function buildTrack(route, opts) {
    var dry = opts && opts.dry;
    var p = planTrack(route, opts);
    if (!p.ok || dry) return p;
    var s = C.getS();
    var oldMask = [];
    for (var k = 0; k < p.tiles.length; k++) oldMask.push(s.coasterRail[p.tiles[k]]);
    for (k = 0; k < p.tiles.length; k++) s.coasterRail[p.tiles[k]] = p.rail[p.tiles[k]];
    C.spend(p.cost, 'construction');
    var ts = p.tiles.slice();
    C.jBegin('Build coaster track');
    C.jOp({
      k: 'x', net: p.cost,
      undo: function () {
        var st = C.getS();
        for (var q = 0; q < ts.length; q++) {
          st.coasterRail[ts[q]] = oldMask[q];
          if (!oldMask[q]) { st.coasterElev[ts[q]] = 0; st.coasterSpec[ts[q]] = 0; }
        }
        updateGraph();
      }
    });
    C.jEnd();
    updateGraph();
    // Auto-spawn 1 free starter train on newly completed coaster loop!
    var autoSpawned = false;
    for (k = 0; k < X.lines.length; k++) {
      var L = X.lines[k];
      if (L.ready && trainsOnStation(L.station.obj.id).length === 0) {
        spawnTrainInternal(L.station.obj.id, L.typeDef.minCars);
        autoSpawned = true;
        C.msg(L.typeDef.name + ' circuit complete! Excitement ' + L.excitement.toFixed(1) + '/10 — first train launched!', 'good');
      }
    }
    C.afterWorldChange(false);
    C.bus.emit('coasterChanged', X.ver);
    return C.okr(p.cost, { tiles: ts, autoSpawned: autoSpawned });
  }

  function hasTrack(t) {
    var s = C.getS();
    return !!(s && s.coasterRail && s.coasterRail[t]);
  }

  function removeTiles(tiles, opts) {
    var s = C.getS(); ensureArrays(s);
    var dry = opts && opts.dry;
    var rem = [], refund = 0;
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      if (!s.coasterRail[t]) continue;
      if (rem.indexOf(t) >= 0) continue;
      rem.push(t);
      var li = X.lineAt[t], td = (li >= 0 && X.lines[li]) ? X.lines[li].typeDef : TYPES.wooden;
      var sc = s.coasterSpec[t] ? (SPEC_BY_ID[s.coasterSpec[t]] ? SPEC_BY_ID[s.coasterSpec[t]].cost : 0) : 0;
      refund += Math.floor((td.trackCost + sc) * CD.refund);
    }
    if (!rem.length) return C.fail('No coaster track here');
    if (dry) return C.okr(-refund, { tiles: rem });

    var saved = [];
    var affected = {};
    for (k = 0; k < rem.length; k++) {
      var rt = rem[k];
      affected[rt] = 1;
      for (var d = 0; d < 4; d++) {
        var nt = stepTile(rt, d);
        if (nt >= 0 && s.coasterRail[nt]) affected[nt] = 1;
      }
    }
    for (var at in affected) {
      var ti = +at;
      saved.push({ t: ti, r: s.coasterRail[ti], e: s.coasterElev[ti], sp: s.coasterSpec[ti] });
    }
    for (k = 0; k < rem.length; k++) {
      var t2 = rem[k];
      s.coasterRail[t2] = 0; s.coasterElev[t2] = 0; s.coasterSpec[t2] = 0;
      for (var d2 = 0; d2 < 4; d2++) {
        var nt2 = stepTile(t2, d2);
        if (nt2 >= 0) s.coasterRail[nt2] &= ~OPP[d2];
      }
    }
    C.earn(refund, 'construction');
    C.jBegin('Remove coaster track');
    C.jOp({
      k: 'x', net: -refund,
      undo: function () {
        var st = C.getS();
        for (var q = 0; q < saved.length; q++) {
          st.coasterRail[saved[q].t] = saved[q].r;
          st.coasterElev[saved[q].t] = saved[q].e;
          st.coasterSpec[saved[q].t] = saved[q].sp;
        }
        updateGraph();
      }
    });
    C.jEnd();
    updateGraph();
    C.afterWorldChange(false);
    C.bus.emit('coasterChanged', X.ver);
    return C.okr(-refund, { tiles: rem });
  }

  // Raise (+1) or Lower (-1) track height on existing track tiles
  function changeHeight(tiles, delta, opts) {
    var s = C.getS(); ensureArrays(s);
    var dry = opts && opts.dry;
    var changed = [], cost = 0;
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      if (!s.coasterRail[t] || X.stAt[t] >= 0) continue;
      var li = X.lineAt[t], td = (li >= 0 && X.lines[li]) ? X.lines[li].typeDef : TYPES.wooden;
      var cur = s.coasterElev[t] || 0;
      var nxt = clamp(cur + delta, 0, td.maxHeight);
      if (nxt !== cur) {
        changed.push({ t: t, old: cur, nw: nxt });
        if (delta > 0) cost += 15;
      }
    }
    if (!changed.length) return C.fail(delta > 0 ? 'Track is already at max height (or click on track)' : 'Track is already at minimum height');
    if (cost > 0 && s.money < cost) return C.fail('Not enough money');
    if (dry) return C.okr(cost, { tiles: changed.map(function (c) { return c.t; }) });

    for (k = 0; k < changed.length; k++) s.coasterElev[changed[k].t] = changed[k].nw;
    if (cost > 0) C.spend(cost, 'construction');
    C.jBegin(delta > 0 ? 'Raise coaster track' : 'Lower coaster track');
    C.jOp({
      k: 'x', net: cost,
      undo: function () {
        var st = C.getS();
        for (var q = 0; q < changed.length; q++) st.coasterElev[changed[q].t] = changed[q].old;
        updateGraph();
      }
    });
    C.jEnd();
    updateGraph();
    C.afterWorldChange(false);
    C.bus.emit('coasterChanged', X.ver);
    return C.okr(cost, { tiles: changed.map(function (c) { return c.t; }) });
  }

  // Stamp a special piece (1=lift, 2=boost, 3=splash, 4=loop, 5=corkscrew) onto straight track tiles
  function placeSpecial(tiles, specId, opts) {
    var s = C.getS(); ensureArrays(s);
    var dry = opts && opts.dry;
    var sdef = SPEC_BY_ID[specId];
    if (!sdef) return C.fail('Unknown track special');
    if ((sdef.star || 0) > s.unlocked.star) return C.fail(sdef.name + ' unlocks at ' + sdef.star + ' stars');

    var changed = [], cost = 0, lastErr = 'Click on straight coaster track';
    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      if (!s.coasterRail[t] || X.stAt[t] >= 0) continue;
      var mask = s.coasterRail[t];
      // Must be straight track (N+S = 5 or E+W = 10) for loops/corkscrews/boosts/splashes
      var isStraight = (mask === 5 || mask === 10);
      if (!isStraight) { lastErr = sdef.name + ' must be placed on straight track'; continue; }
      var li = X.lineAt[t], td = (li >= 0 && X.lines[li]) ? X.lines[li].typeDef : TYPES.wooden;
      if (td.allowedSpecs.indexOf(specId) < 0) {
        lastErr = sdef.name + ' requires a higher-tier coaster (e.g. Steel or Hyper)';
        continue;
      }
      if (s.coasterSpec[t] === specId) { lastErr = sdef.name + ' is already here'; continue; }
      changed.push({ t: t, old: s.coasterSpec[t], nw: specId });
      cost += sdef.cost;
    }
    if (!changed.length) return C.fail(lastErr);
    if (s.money < cost) return C.fail('Not enough money');
    if (dry) return C.okr(cost, { tiles: changed.map(function (c) { return c.t; }) });

    for (k = 0; k < changed.length; k++) s.coasterSpec[changed[k].t] = changed[k].nw;
    C.spend(cost, 'construction');
    C.jBegin('Add ' + sdef.name);
    C.jOp({
      k: 'x', net: cost,
      undo: function () {
        var st = C.getS();
        for (var q = 0; q < changed.length; q++) st.coasterSpec[changed[q].t] = changed[q].old;
        updateGraph();
      }
    });
    C.jEnd();
    updateGraph();
    C.afterWorldChange(false);
    C.bus.emit('coasterChanged', X.ver);
    return C.okr(cost, { tiles: changed.map(function (c) { return c.t; }) });
  }

  function placeCheck(type, fp) {
    var s = C.getS();
    if (!s || !s.coasterRail) return null;
    var N = C.getN();
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var t = (fp.i0 + a) + (fp.j0 + b) * N;
      if (s.coasterRail[t]) return 'Clear the coaster track here first';
    }
    return null;
  }

  // ---- Trains, Boarding, Physics & Breakdowns ----
  function trainsOnStation(stationId) {
    var s = C.getS(), out = [];
    if (!s || !s.coaster) return out;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      if (s.coaster.trains[k].stationId === stationId) out.push(s.coaster.trains[k]);
    }
    return out;
  }

  function spawnTrainInternal(stationId, cars) {
    var s = C.getS(); ensureArrays(s);
    var L = lineForStation(stationId);
    if (!L) return null;
    var td = L.typeDef;
    cars = clamp(cars || td.minCars, td.minCars, td.maxCars);
    var T = {
      id: s.coaster.nextTrain++,
      stationId: stationId,
      type: td.id,
      cars: cars,
      s: L.stMidS,
      v: 0,
      state: 'dwell', // 'dwell' | 'run' | 'broken'
      dwell: 2.0,
      fix: 0,
      eng: false
    };
    s.coaster.trains.push(T);
    TR[T.id] = { s: T.s, v: 0, state: 'dwell', dwell: 2.0, fix: 0, eng: false, riders: [], seenLoop: false, seenSplash: false, seenEncs: {} };
    C.bus.emit('coasterChanged', X.ver);
    return T;
  }

  function buyTrain(stationId, cars, opts) {
    var s = C.getS(); ensureArrays(s);
    var dry = opts && opts.dry;
    var L = lineForStation(stationId);
    if (!L) return C.fail('Coaster station not found');
    if (!L.ready) return C.fail('Complete the coaster track loop first');
    var td = L.typeDef;
    var existing = trainsOnStation(stationId);
    if (existing.length >= td.maxTrains) return C.fail('Maximum ' + td.maxTrains + ' trains per coaster');
    cars = clamp(cars || td.minCars, td.minCars, td.maxCars);
    var cost = td.trainCost + (cars - td.minCars) * td.carCost;
    if (s.money < cost) return C.fail('Not enough money');
    if (dry) return C.okr(cost);
    C.spend(cost, 'construction');
    var T = spawnTrainInternal(stationId, cars);
    // Space out multiple trains along track
    if (existing.length > 0 && T) {
      var off = (L.totalLen / (existing.length + 1)) * existing.length;
      T.s = (L.stMidS + off) % L.totalLen;
      TR[T.id].s = T.s;
      T.state = 'run'; TR[T.id].state = 'run';
      T.v = td.baseSpeed * 0.6; TR[T.id].v = T.v;
    }
    return C.okr(cost, { id: T.id });
  }

  function ejectAll(T, emergency) {
    var rt = TR[T.id];
    if (!rt || !rt.riders.length) return;
    var L = lineForStation(T.stationId);
    var st = L ? L.station : X.stById[T.stationId];
    var s = C.getS(), RT = C.getRT();
    var riders = rt.riders.slice();
    rt.riders.length = 0;
    for (var k = 0; k < riders.length; k++) {
      var g = RT.gById ? RT.gById.get(riders[k]) : null;
      if (!g) continue;
      disembarkGuest(g, L, st, rt, emergency);
    }
  }

  function disembarkGuest(g, L, st, rt, emergency) {
    var s = C.getS(), N = C.getN();
    g.state = 'walk'; g.gt = ''; g.dk = ''; g.gid = 0; g.ni = -1; g.glide = 0;
    g.coasterTrain = 0; g.coasterSeat = 0; g.absY = null; g.y = 0;
    // Place guest on a path adjacent to station (or station front)
    var placed = false;
    if (st) {
      var fp = st.fp;
      for (var a = -1; a <= fp.w && !placed; a++) for (var b = -1; b <= fp.h && !placed; b++) {
        if (a >= 0 && a < fp.w && b >= 0 && b < fp.h) continue;
        var xi = fp.i0 + a, xj = fp.j0 + b;
        if (xi >= 0 && xj >= 0 && xi < N && xj < N && s.path[xi + xj * N]) {
          var pt = xi + xj * N;
          g.ti = pt; g.x = C.cxOf(pt) + C.rng.range(-0.4, 0.4); g.z = C.czOf(pt) + C.rng.range(-0.4, 0.4);
          placed = true;
        }
      }
    }
    if (!placed) {
      g.ti = C.tileOf(g.x, g.z);
    }
    if (!emergency && L) {
      var exc = L.excitement || 4;
      g.fun = Math.min(100, g.fun + 40 + exc * 6);
      g.mood = Math.min(35, g.mood + 4 + exc * 0.9);
      g.happiness = Math.min(100, g.happiness + 6 + exc * 0.8);
      if (L.typeDef.id === 'flume') g.thirst = Math.max(0, g.thirst - 12);
      if (rt && rt.seenLoop && C.rng.chance(0.75)) C.say(g, 'coasterLoop');
      else if (rt && rt.seenSplash && C.rng.chance(0.6)) C.say(g, 'coasterSplash');
      else if (L.overlooks.length && C.rng.chance(0.5)) C.say(g, 'coasterOverlook');
      else if (C.rng.chance(0.65)) C.say(g, 'coasterCustom');
    }
  }

  function sellTrain(trainId, opts) {
    var s = C.getS(); ensureArrays(s);
    var dry = opts && opts.dry;
    var idx = -1;
    for (var k = 0; k < s.coaster.trains.length; k++) if (s.coaster.trains[k].id === trainId) { idx = k; break; }
    if (idx < 0) return C.fail('Train not found');
    var T = s.coaster.trains[idx], td = TYPES[T.type] || TYPES.wooden;
    var refund = Math.floor((td.trainCost + (T.cars - td.minCars) * td.carCost) * CD.refundTrain);
    if (dry) return C.okr(-refund);
    ejectAll(T, true);
    s.coaster.trains.splice(idx, 1);
    delete TR[T.id];
    C.earn(refund, 'construction');
    C.bus.emit('coasterChanged', X.ver);
    return C.okr(-refund);
  }

  function onStationRemoved(o) {
    var s = C.getS();
    if (!s || !s.coaster) return;
    for (var k = s.coaster.trains.length - 1; k >= 0; k--) {
      var T = s.coaster.trains[k];
      if (T.stationId === o.id) {
        ejectAll(T, true);
        s.coaster.trains.splice(k, 1);
        delete TR[T.id];
      }
    }
  }

  function breakdown(trainId) {
    var s = C.getS();
    if (!s || !s.coaster) return false;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      if (T.id === trainId) {
        var rt = TR[T.id]; if (!rt || rt.state === 'broken') return false;
        rt.state = T.state = 'broken';
        rt.v = T.v = 0;
        rt.fix = T.fix = CD.fixTime;
        rt.eng = T.eng = false;
        s.coaster.stats.breakdowns = (s.coaster.stats.breakdowns || 0) + 1;
        var L = lineForStation(T.stationId);
        var nm = L ? L.typeDef.name : 'Rollercoaster';
        C.msg(nm + ' train #' + T.id + ' has broken down! Call a mechanic from its panel for a faster repair.', 'bad');
        C.bus.emit('coasterBroken', { trainId: T.id, stationId: T.stationId, name: nm });
        return true;
      }
    }
    return false;
  }

  function callEngineer(trainId) {
    var s = C.getS();
    if (!s || !s.coaster) return C.fail('Train not found');
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      if (T.id === trainId) {
        var rt = TR[T.id];
        if (!rt || rt.state !== 'broken') return C.fail('Train is running fine');
        if (rt.eng) return C.fail('Mechanic already on the way');
        var fee = CD.engineerFee;
        if (s.money < fee) return C.fail('Need ' + C.fmt(fee) + ' for mechanic');
        C.spend(fee, 'upkeep');
        rt.eng = T.eng = true;
        rt.fix = T.fix = Math.min(rt.fix, CD.engineerTime);
        C.msg('Mechanic dispatched to Coaster Train #' + T.id + ' (' + C.fmt(fee) + ').', 'info');
        return C.okr(fee);
      }
    }
    return C.fail('Train not found');
  }

  function setPaused(stationId, paused) {
    var RT = C.getRT(), o = RT && RT.oById ? RT.oById.get(stationId) : null;
    if (!o) return false;
    o.paused = !!paused;
    return true;
  }

  // ---- Guest Hooks ----
  function stationReady(stationId) {
    var L = lineForStation(stationId);
    if (!L || !L.ready) return false;
    if (L.station.obj.paused) return false;
    return trainsOnStation(stationId).length > 0;
  }

  function stationExcitement(stationId) {
    var L = lineForStation(stationId);
    return L ? L.excitement : 2;
  }

  function recommendedPrice(stationId) {
    var L = lineForStation(stationId);
    return L ? L.recPrice : 8;
  }

  function arrive(g, o) {
    if (!stationReady(o.id)) return false;
    var RT = C.getRT(), q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] });
    var cap = (C.BD[o.type].capacity || 20) * 2;
    if (q.q.length >= cap) {
      C.say(g, 'crowded'); g.mood -= 1; g.nbuy = C.gxHr() * 0.2;
      return false;
    }
    g.state = 'queue'; g.wt = 0; g.speed = 0;
    if (q.q.indexOf(g.id) < 0) q.q.push(g.id);
    C.gxPlace(g, false);
    return true;
  }

  function boardFromQueue(T, L) {
    var s = C.getS(), RT = C.getRT(), rt = TR[T.id];
    var o = L.station.obj;
    if (o.paused) return;
    var q = RT.bq[o.id];
    if (!q || !q.q.length) return;
    var td = L.typeDef;
    var cap = T.cars * td.capacity;
    var price = o.price === undefined ? o.def ? o.def.price : L.recPrice : o.price;
    var WX = C.getWX(), hr = C.gxHr();

    while (q.q.length && rt.riders.length < cap) {
      var gid = q.q.shift();
      var g = RT.gById ? RT.gById.get(gid) : null;
      if (!g || g.state !== 'queue' || g.gid !== o.id) continue;
      if (price > 0) {
        var tolE = g.tol * clamp(WX.spend || 1, 0.5, 1.6);
        if (g.money < price || price > L.recPrice * tolE * 1.15) {
          g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; C.say(g, 'expensive'); g.mood -= 1.5; g.nbuy = hr * 0.35;
          continue;
        }
        g.money -= price; g.spent = (g.spent || 0) + price; g.nbuy = hr * 0.7;
        if (g.al && g.al.act > 0) g.al.act--;
        C.earn(price, 'shops', g.x, g.z);
        o.income = (o.income || 0) + price;
        s.coaster.stats.income = (s.coaster.stats.income || 0) + price;
      }
      o.uses = (o.uses || 0) + 1;
      s.coaster.stats.riders = (s.coaster.stats.riders || 0) + 1;
      s.coaster.stats.boardings = (s.coaster.stats.boardings || 0) + 1;
      if (s.stats) s.stats.ridesTaken = (s.stats.ridesTaken || 0) + 1;
      g.state = 'ride'; g.seenB[o.id] = 1; g.coasterTrain = T.id; g.coasterSeat = rt.riders.length;
      rt.riders.push(g.id);
    }
  }

  function placeRiders(T, L) {
    var RT = C.getRT(), rt = TR[T.id];
    if (!rt || !rt.riders.length) return;
    var td = L.typeDef, capPerCar = td.capacity;
    var pose = {};
    for (var k = 0; k < rt.riders.length; k++) {
      var g = RT.gById ? RT.gById.get(rt.riders[k]) : null;
      if (!g) continue;
      var carIdx = Math.floor(k / capPerCar);
      var seatInCar = k % capPerCar;
      carPose(T, carIdx, pose);
      // Right vector = T x U
      var r = vecCross(pose.tx, pose.ty, pose.tz, pose.ux, pose.uy, pose.uz);
      var rn = vecNorm(r[0], r[1], r[2]);
      var lat = (seatInCar % 2 === 0 ? -0.24 : 0.24);
      var fwd = (seatInCar < 2 ? 0.3 : -0.3);
      var upOff = 0.42;
      g.x = pose.x + pose.tx * fwd + rn[0] * lat + pose.ux * upOff;
      g.z = pose.z + pose.tz * fwd + rn[2] * lat + pose.uz * upOff;
      g.absY = pose.y + pose.ty * fwd + rn[1] * lat + pose.uy * upOff;
      g.heading = Math.atan2(pose.tx, pose.tz);
    }
  }

  function release(g) {
    if (g.state === 'ride' && g.coasterTrain) {
      var rt = TR[g.coasterTrain];
      if (rt) {
        var idx = rt.riders.indexOf(g.id);
        if (idx >= 0) rt.riders.splice(idx, 1);
      }
      g.coasterTrain = 0; g.coasterSeat = 0; g.absY = null; g.y = 0;
    }
  }

  function rideTick(g, a) {
    g.fun = Math.min(100, g.fun + 12 * a);
    g.energy = Math.min(100, g.energy + 2 * a);
    var rt = g.coasterTrain ? TR[g.coasterTrain] : null;
    if (rt && rt.state === 'broken' && C.rng.chance(0.08)) {
      C.say(g, 'coasterStuck');
      g.mood -= 1.2 * a;
    }
  }

  // ---- Simulation Step ----
  function stepTrain(T, L, dt) {
    var rt = TR[T.id], td = L.typeDef;
    if (!rt) return;

    if (rt.state === 'broken') {
      rt.fix -= dt;
      T.fix = rt.fix;
      if (rt.fix <= 0) {
        rt.state = T.state = 'run';
        rt.fix = T.fix = 0;
        rt.eng = T.eng = false;
        rt.v = T.v = td.baseSpeed * 0.65;
        C.msg(td.name + ' train #' + T.id + ' is back up and running!', 'good');
        C.bus.emit('coasterFixed', { trainId: T.id, stationId: T.stationId });
      }
      placeRiders(T, L);
      return;
    }

    if (rt.state === 'dwell') {
      rt.v = T.v = 0;
      boardFromQueue(T, L);
      rt.dwell -= dt;
      T.dwell = rt.dwell;
      if (rt.dwell <= 0 && !L.station.obj.paused) {
        rt.state = T.state = 'run';
        rt.v = T.v = td.baseSpeed * 0.7;
        rt.seenLoop = false; rt.seenSplash = false;
        rt.leftStation = false;
      }
      placeRiders(T, L);
      return;
    }

    // Running along closed loop with gravity + special pieces
    var pose = sample(L, rt.s);
    var grav = -14.0 * pose.ty; // downhill accelerates, uphill decelerates
    var v = rt.v + grav * dt;

    // Gentle drag toward cruise speed on flat
    if (Math.abs(pose.ty) < 0.08) v += (td.baseSpeed - v) * Math.min(1, dt * 0.35);

    // Special pieces
    if (pose.spec === 1) { // Chain lift
      if (v < 7.8) v = Math.min(7.8, v + 8.0 * dt);
    } else if (pose.spec === 2) { // Boost launch
      v = Math.min(td.maxSpeed * 1.15, v + 22.0 * dt);
    } else if (pose.spec === 3) { // Water splash
      if (!rt.seenSplash) {
        rt.seenSplash = true;
        C.bus.emit('coasterSplash', { x: pose.x, y: pose.y, z: pose.z, trainId: T.id });
      }
      v = Math.max(5.5, v - 4.0 * dt);
    } else if (pose.spec === 4 || pose.spec === 5) { // Loop / Corkscrew
      rt.seenLoop = true;
      if (v < 11.5) v = 11.5; // ensure smooth inversion momentum
    }

    // Anti-stall minimum speed
    v = clamp(v, 4.8, td.maxSpeed * 1.15);

    // Prevent overtaking another train on the same coaster
    var peers = trainsOnStation(T.stationId);
    for (var p = 0; p < peers.length; p++) {
      var O = peers[p];
      if (O.id === T.id) continue;
      var ort = TR[O.id]; if (!ort) continue;
      var gap = ((ort.s - rt.s) % L.totalLen + L.totalLen) % L.totalLen;
      var minGap = T.cars * (CD.carLen + CD.carGap) + 3.5;
      if (gap < minGap) { v = Math.min(v, ort.v * 0.5); if (gap < minGap * 0.75) v = 0; }
    }

    var prevS = rt.s;
    rt.s = (rt.s + v * dt) % L.totalLen;
    rt.v = T.v = v;
    T.s = rt.s;

    // Detect leaving & returning to station
    var distFromSt = Math.abs(rt.s - L.stMidS);
    if (distFromSt > 4.5 && distFromSt < L.totalLen - 4.5) rt.leftStation = true;

    if (rt.leftStation) {
      // Did we cross stMidS?
      var d0 = ((L.stMidS - prevS) % L.totalLen + L.totalLen) % L.totalLen;
      var d1 = ((rt.s - prevS) % L.totalLen + L.totalLen) % L.totalLen;
      if (d0 <= d1 + 0.05 && d0 < L.totalLen * 0.5) {
        rt.s = T.s = L.stMidS;
        rt.v = T.v = 0;
        rt.state = T.state = 'dwell';
        rt.dwell = T.dwell = CD.dwell;
        rt.leftStation = false;
        ejectAll(T, false);
        boardFromQueue(T, L);
      }
    }

    // Rare random breakdown while running outside station
    if (rt.state === 'run' && rt.leftStation && CD.breakdownPerHour > 0) {
      var pBreak = (CD.breakdownPerHour / (C.DAY_SECONDS / 24)) * dt;
      if (C.rng.chance(pBreak)) breakdown(T.id);
    }

    placeRiders(T, L);
  }

  function step(dt) {
    var s = C.getS();
    if (!s || !s.coaster || !s.coaster.trains.length) return;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      var L = lineForStation(T.stationId);
      if (!L || !L.ready) continue;
      if (!TR[T.id]) TR[T.id] = { s: T.s || L.stMidS, v: T.v || 0, state: T.state || 'dwell', dwell: T.dwell || 2, fix: T.fix || 0, eng: !!T.eng, riders: [] };
      stepTrain(T, L, dt);
    }
  }

  function newDay() {
    var s = C.getS();
    if (!s || !s.coaster || !s.coaster.trains.length) return;
    var up = 0;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k], td = TYPES[T.type] || TYPES.wooden;
      up += td.trainUpkeep + T.cars * td.carUpkeep;
    }
    var DIFF = C.getDIFF();
    up = Math.round(up * (DIFF.costs || 1));
    if (up > 0) C.spend(up, 'upkeep');
  }

  function valueBonus() {
    var bonus = 0;
    for (var k = 0; k < X.lines.length; k++) {
      var L = X.lines[k];
      if (L.ready && C.buildingConnected(L.station.obj) && trainsOnStation(L.station.obj.id).length > 0) {
        bonus += 0.8 + L.excitement * 0.25;
      }
    }
    return Math.min(8, bonus);
  }

  function updateGraph() {
    var s = C.getS();
    if (!s) return;
    ensureArrays(s);
    X = compute(s, s.coasterRail, s.coasterElev, s.coasterSpec);
    // Validate trains against updated graph
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      var L = lineForStation(T.stationId);
      if (!L || !L.ready) {
        ejectAll(T, true);
        if (TR[T.id]) { TR[T.id].v = 0; TR[T.id].state = 'dwell'; }
      } else if (TR[T.id]) {
        TR[T.id].s = ((TR[T.id].s % L.totalLen) + L.totalLen) % L.totalLen;
        T.s = TR[T.id].s;
      }
    }
    C.bus.emit('coasterChanged', X.ver);
  }

  function afterLoad() {
    var s = C.getS();
    if (!s) return;
    ensureArrays(s);
    TR = {};
    X = compute(s, s.coasterRail, s.coasterElev, s.coasterSpec);
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      var L = lineForStation(T.stationId);
      var sPos = L ? (((T.s || L.stMidS) % L.totalLen) + L.totalLen) % L.totalLen : 0;
      TR[T.id] = { s: sPos, v: T.v || 0, state: T.state || 'dwell', dwell: T.dwell || 2, fix: T.fix || 0, eng: !!T.eng, riders: [] };
    }
    // Re-attach riding guests
    for (k = 0; k < s.guests.length; k++) {
      var g = s.guests[k];
      if (g.state === 'ride') {
        var rt = g.coasterTrain ? TR[g.coasterTrain] : null;
        if (rt) rt.riders.push(g.id);
        else { g.state = 'walk'; g.gt = ''; g.dk = ''; g.coasterTrain = 0; g.absY = null; }
      }
    }
    for (k = 0; k < s.coaster.trains.length; k++) {
      var T2 = s.coaster.trains[k], L2 = lineForStation(T2.stationId);
      if (L2 && L2.ready) placeRiders(T2, L2);
    }
    C.bus.emit('coasterChanged', X.ver);
  }

  // ---- Info Queries for UI & World ----
  function stationInfo(stationId) {
    var st = X.stById[stationId];
    if (!st) return null;
    var L = st.lineIdx >= 0 ? X.lines[st.lineIdx] : null;
    var trains = trainsOnStation(stationId);
    var RT = C.getRT(), q = RT.bq[stationId];
    return {
      station: st.obj,
      def: st.def,
      typeDef: st.typeDef,
      line: L,
      ready: !!(L && L.ready),
      loop: !!(L && L.loop),
      branch: !!(L && L.branch),
      trackLen: L ? L.trackLen : 0,
      maxHeight: L ? L.maxHeight : 0,
      totalDrop: L ? L.totalDrop : 0,
      peakSpeed: L ? L.peakSpeed : 0,
      excitement: L ? L.excitement : 0,
      intensity: L ? L.intensity : 0,
      recPrice: L ? L.recPrice : st.def.price,
      overlooks: L ? L.overlooks : [],
      specs: L ? L.specs : {},
      trains: trains,
      queueLen: q ? q.q.length : 0,
      connected: C.buildingConnected(st.obj),
      paused: !!st.obj.paused
    };
  }

  function trainInfo(trainId) {
    var s = C.getS();
    if (!s || !s.coaster) return null;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      if (T.id === trainId) {
        var rt = TR[T.id] || { v: 0, state: 'dwell', riders: [], fix: 0, eng: false };
        var L = lineForStation(T.stationId);
        var td = TYPES[T.type] || TYPES.wooden;
        return {
          train: T,
          typeDef: td,
          line: L,
          speed: rt.v,
          state: rt.state,
          riders: rt.riders.length,
          capacity: T.cars * td.capacity,
          fix: rt.fix,
          eng: rt.eng
        };
      }
    }
    return null;
  }

  Z.Coaster = {
    state: function () { return X; },
    lines: function () { return X.lines; },
    updateGraph: updateGraph,
    update: function () {},
    afterLoad: afterLoad,
    step: step,
    newDay: newDay,
    valueBonus: valueBonus,
    placeCheck: placeCheck,
    onStationRemoved: onStationRemoved,
    planTrack: planTrack,
    buildTrack: buildTrack,
    hasTrack: hasTrack,
    removeTiles: removeTiles,
    changeHeight: changeHeight,
    placeSpecial: placeSpecial,
    buyTrain: buyTrain,
    sellTrain: sellTrain,
    breakdown: breakdown,
    callEngineer: callEngineer,
    setPaused: setPaused,
    stationReady: stationReady,
    stationExcitement: stationExcitement,
    recommendedPrice: recommendedPrice,
    arrive: arrive,
    release: release,
    rideTick: rideTick,
    sample: sample,
    carPose: carPose,
    stationInfo: stationInfo,
    trainInfo: trainInfo,
    trainsOnStation: trainsOnStation,
    SPEC_BY_ID: SPEC_BY_ID,
    TYPES: TYPES
  };
  Z.Sim.coaster = Z.Coaster;
  updateGraph();
})();
