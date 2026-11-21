// Wild Acres Zoo — Custom Rollercoaster Simulation (Zoo Tycoon only)
// Track graph (traces all closed loops, open partial station tracks & standalone segments),
// 3D centerline with smooth hills, Bezier corners, vertical loops & corkscrews,
// gravitational potential energy + rolling friction/air-drag + chain-lift/boost physics,
// dynamic excitement/intensity ratings, guest boarding/riding & breakdowns.
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

  // Physics constants: gravitational acceleration, rolling friction, curve drag, air drag, station push & chain speed
  var GRAV = 18.0;          // m/s^2 along track slope
  var FRIC_ACCEL = 0.22;    // base rolling resistance (m/s^2)
  var CURVE_DRAG = 0.28;    // extra flange/lateral-G friction in horizontal turns (m/s^2)
  var AIR_DRAG = 0.0018;    // quadratic aerodynamic drag coefficient (v^2)
  var CHAIN_SPEED = 4.2;    // deliberate, steady mechanical chain-lift climb speed (m/s)
  var STATION_PUSH = 5.4;   // modest station dispatch push (m/s)
  var BOOST_ACCEL = 24.0;   // strong launch boost linear thrust (m/s^2)

  // Derived graph + runtime train state (never serialized)
  var X = emptyX();
  var TR = {}; // trainId -> runtime { s, v, state, dwell, fix, eng, riders[], seenLoop, seenSplash, stalled, stallMsg }
  var VER = 0;

  function emptyX() {
    return {
      ver: 0,
      stations: [],    // [{ obj, def, typeDef, fp, tiles, trackTiles, fd, bd, endF, endB, deck, lineIdx }]
      stById: {},      // objId -> station
      stAt: null,      // Int16Array(N*N) -> station index or -1
      lineAt: null,    // Int16Array(N*N) -> line index or -1
      lines: [],       // closed, partial & standalone lines (all get full smooth 3D twin-rail spline!)
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
      // Match 3D model rotation (g.rotation.y = rot * PI/2, local rails at z = -1.0, entrance at +z, launch +x, return -x):
      // rot 0: entrance +z (j0+h), rails on j0 running W->E (fd=1, bd=3)
      // rot 1: entrance +x (i0+w), rails on i0 running S->N (fd=0, bd=2)
      // rot 2: entrance -z (j0-1), rails on j0+h-1 running E->W (fd=3, bd=1)
      // rot 3: entrance -x (i0-1), rails on i0+w-1 running N->S (fd=2, bd=0)
      var rot = ((o.rot | 0) % 4 + 4) % 4;
      var fd = (rot === 0) ? 1 : (rot === 1) ? 0 : (rot === 2) ? 3 : 2;
      var bd = (fd + 2) % 4;
      var trackTiles = [];
      if (rot === 0) {
        for (a = 0; a < fp.w; a++) trackTiles.push((fp.i0 + a) + fp.j0 * N);
      } else if (rot === 1) {
        for (b = fp.h - 1; b >= 0; b--) trackTiles.push(fp.i0 + (fp.j0 + b) * N);
      } else if (rot === 2) {
        for (a = fp.w - 1; a >= 0; a--) trackTiles.push((fp.i0 + a) + (fp.j0 + fp.h - 1) * N);
      } else {
        for (b = 0; b < fp.h; b++) trackTiles.push((fp.i0 + fp.w - 1) + (fp.j0 + b) * N);
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

  // Shared unified coaster physics step used by both circuit validation (simulateCircuit) and live runtime trains (stepTrain)
  function stepCoasterPhysics(v, ds, dt, ty, sp, isLift, curv, td, poweredCircuit) {
    var dragMag = FRIC_ACCEL + CURVE_DRAG * (curv || 0) + AIR_DRAG * v * v;
    var signV = v >= 0 ? 1 : -1;
    var aDrag = -signV * dragMag;

    if (isLift === 1 && sp <= 1) {
      if (v > CHAIN_SPEED) {
        var v2c = v * v + 2 * (-GRAV * ty + aDrag) * ds;
        v = Math.max(CHAIN_SPEED, v2c > 0 ? Math.sqrt(v2c) : CHAIN_SPEED);
      } else {
        v = Math.min(CHAIN_SPEED, Math.max(1.8, v) + 7.5 * dt);
      }
    } else if (sp === 2) {
      var v2b = v * v + 2 * (BOOST_ACCEL - GRAV * ty + aDrag) * ds;
      v = Math.min(td.maxSpeed * 1.15, Math.sqrt(Math.max(0, v2b)));
    } else if (sp === 3) {
      var splashDrag = v > 3.8 ? (3.5 + 0.08 * v * v) : 0.35;
      var v2s = v * v + 2 * (-GRAV * ty - splashDrag) * ds;
      v = v2s > 0 ? Math.sqrt(v2s) : 0;
    } else if (sp >= 4 && sp <= 7) {
      var Rinv = sp === 6 ? 4.5 : sp === 7 ? 2.45 : sp === 4 ? 2.4 : 1.2;
      if (!poweredCircuit) {
        var v2u = v * v + 2 * (-GRAV * ty + aDrag) * ds;
        v = v2u > 0 ? Math.sqrt(v2u) : 0;
      } else {
        var aGrav = ty > 0 ? -Math.max(0.55, (0.32 * v * v) / Rinv) * ty : -(GRAV * 0.55) * ty;
        var v2i = v * v + 2 * (aGrav + aDrag * 0.45) * ds;
        v = v2i > 0 ? Math.sqrt(v2i) : 0;
      }
    } else {
      var aNet = -GRAV * ty + aDrag;
      if (v > 0.6 && ds > 0) {
        var v2n = v * v + 2 * aNet * ds;
        v = v2n > 0 ? Math.sqrt(v2n) : (v + aNet * dt);
      } else {
        v = v + aNet * dt;
      }
    }

    return Math.min(v, td.maxSpeed * 1.18);
  }

  // Simulate gravitational potential energy + rolling/curve/air drag + chain lift/boost around a closed circuit
  function simulateCircuit(pxA, pyA, pzA, tyA, spA, liftA, avgTyA, curvA, nS, totalLen, stMidS, td, nodes, stLen) {
    if (nS < 4 || totalLen <= 1) return { ok: false, peakSpeed: 0, minSpeed: 0, reason: 'Track is too short' };
    var ds = totalLen / nS;
    var startIdx = Math.floor((stMidS / totalLen) * nS) % nS;
    var y0 = pyA[startIdx];
    var v = STATION_PUSH;
    var peakV = v, minV = v;
    var hasHill = false, seenAnyLift = false, seenAnyBoost = false;

    for (var k = 0; k < nS; k++) {
      if (spA[k] === 1) seenAnyLift = true;
      if (spA[k] === 2) seenAnyBoost = true;
    }
    var poweredCircuit = seenAnyLift || seenAnyBoost;

    // Specific kinetic + potential energy simulation around the loop from station departure back to station arrival
    for (var step = 0; step < nS; step++) {
      var i = (startIdx + step) % nS;
      var sp = spA[i];
      var ty = avgTyA[i];
      var isLift = liftA[i];
      var hRel = Math.max(0, pyA[i] - y0);

      if (hRel > 1.25) hasHill = true;

      v = stepCoasterPhysics(v, ds, ds / Math.max(v, 1.0), ty, sp, isLift, curvA[i], td, poweredCircuit);
      if (isLift && sp <= 1 && v < CHAIN_SPEED) v = CHAIN_SPEED;

      if (v > peakV) peakV = v;
      if (v < minV) minV = v;

      if (v <= 0.45) {
        var reason;
        if (sp >= 4 && sp <= 7) {
          reason = 'Train stalls inside the loop! Build a taller hill drop with a Chain Lift or add a Launch Boost before the loop.';
        } else if (hasHill && !seenAnyLift && !seenAnyBoost) {
          reason = 'Train stalls climbing the hill! Stamp a Chain Lift Hill (⛓️) on the uphill track (or add a Launch Boost).';
        } else if (ty > 0.06 && !isLift) {
          reason = 'Train stalls climbing a hill! Stamp a Chain Lift Hill (⛓️) on the uphill slope or make your first lift hill taller.';
        } else if (hasHill) {
          reason = 'Train loses momentum before finishing the circuit! Make your first Chain Lift hill taller or add a Launch Boost.';
        } else {
          reason = 'Track is too long without a hill or boost — train slows to a stop from friction! Raise a hill with a Chain Lift (⛓️) or add a Launch Boost.';
        }
        return { ok: false, peakSpeed: Math.round(peakV * 10) / 10, minSpeed: 0, reason: reason, stallSample: i };
      }
    }
    return { ok: true, peakSpeed: Math.round(peakV * 10) / 10, minSpeed: Math.round(minV * 10) / 10, reason: null, stallSample: -1 };
  }

  // Build 3D spline, pylons, overlooks, physics check, and excitement/intensity ratings for any track line (closed, partial, or standalone)
  function buildLine(s, x, st, td, nodes, loop, branch, li) {
    var N = C.getN(), k, m = nodes.length;
    td = td || (st ? st.typeDef : TYPES.wooden);
    var elev = s.coasterElev, spec = s.coasterSpec;
    var stDeck = st ? st.deck : (cmax(nodes[0]) + CD.stationDeck);

    // 1. Per-node target heights
    var h = new Float32Array(m);
    for (k = 0; k < m; k++) {
      var t = nodes[k];
      if (x.stAt[t] >= 0) {
        var stHere = x.stations[x.stAt[t]];
        h[k] = stHere ? stHere.deck : stDeck;
      } else {
        var base = Math.max(cmax(t), isWater(s, t) ? 0.35 : -1e9) + obstacleClearance(s, t) + CD.clearance;
        var extra = clamp(elev[t] || 0, 0, td.maxHeight) * CD.elevStep;
        h[k] = base + extra;
      }
    }

    // Upward ramp propagation from raised peaks (like Dino monorail!) so raising 1 tile automatically forms a smooth hill instead of getting squashed!
    var maxS = CD.maxSlope;
    for (var pass = 0; pass < 4; pass++) {
      for (k = 0; k < m; k++) {
        var nk = (k + 1) % m;
        if (!loop && nk === 0) continue;
        if (x.stAt[nodes[nk]] < 0 && h[nk] < h[k] - maxS) h[nk] = h[k] - maxS;
      }
      for (k = m - 1; k >= 0; k--) {
        var pk = (k - 1 + m) % m;
        if (!loop && k === 0) continue;
        if (x.stAt[nodes[pk]] < 0 && h[pk] < h[k] - maxS) h[pk] = h[k] - maxS;
      }
    }
    // Clamp track adjacent to stations so station transitions are always gentle
    for (pass = 0; pass < 3; pass++) {
      for (k = 0; k < m; k++) {
        var nk2 = (k + 1) % m;
        if (!loop && nk2 === 0) continue;
        if (x.stAt[nodes[k]] >= 0 && x.stAt[nodes[nk2]] < 0 && h[nk2] > h[k] + maxS) h[nk2] = h[k] + maxS;
        if (x.stAt[nodes[nk2]] >= 0 && x.stAt[nodes[k]] < 0 && h[k] > h[nk2] + maxS) h[k] = h[nk2] + maxS;
      }
    }
    // Node-level hill crest/valley smoothing on non-station nodes
    for (var spass = 0; spass < 1; spass++) {
      var h2 = h.slice();
      for (k = 0; k < m; k++) {
        if (x.stAt[nodes[k]] >= 0) continue;
        var p1 = (k - 1 + m) % m, n1 = (k + 1) % m;
        if (!loop && (k === 0 || k === m - 1)) continue;
        h2[k] = Math.max(h[k] * 0.76 + (h[p1] + h[n1]) * 0.12, cmax(nodes[k]) + CD.clearance * 0.85);
      }
      h = h2;
    }

    // 2. Support pylons (skip station tiles; check maxSpan)
    var pylons = [], bad = {}, span = 0;
    for (k = 0; k < m; k++) {
      var tk = nodes[k];
      if (x.stAt[tk] >= 0) { span = 0; continue; }
      var okBase = canBase(s, x, tk);
      var prevT = nodes[(k - 1 + m) % m], nextT = nodes[(k + 1) % m];
      var pdx = C.cxOf(nextT) - C.cxOf(prevT), pdz = C.czOf(nextT) - C.czOf(prevT);
      var plen = Math.sqrt(pdx * pdx + pdz * pdz) || 1;
      var prx = -(pdz / plen), prz = pdx / plen;
      if (okBase && (span >= CD.prefSpan - 1 || k === m - 1 || (elev[tk] || 0) >= 1 || (spec[tk] || 0) >= 4)) {
        pylons.push({ t: tk, x: C.cxOf(tk), z: C.czOf(tk), rx: prx, rz: prz, yTop: h[k], yBot: Math.min(cmean(tk) - 0.3, h[k] - 0.5), spec: spec[tk] || 0 });
        span = 0;
      } else if (okBase && span >= CD.maxSpan - 1) {
        pylons.push({ t: tk, x: C.cxOf(tk), z: C.czOf(tk), rx: prx, rz: prz, yTop: h[k], yBot: Math.min(cmean(tk) - 0.3, h[k] - 0.5), spec: spec[tk] || 0 });
        span = 0;
      } else {
        span++;
        if (span > CD.maxSpan) bad[tk] = 'No room for coaster supports here';
      }
    }

    // Node-level Chain Lift active ramp: carries up to 3 connected uphill nodes to crest, never across flat or into specials
    var nodeLift = new Uint8Array(m);
    for (k = 0; k < m; k++) {
      if (x.stAt[nodes[k]] < 0 && spec[nodes[k]] === 1) nodeLift[k] = 1;
    }
    for (k = 0; k < m; k++) {
      if (x.stAt[nodes[k]] < 0 && spec[nodes[k]] === 1) {
        for (var step = 1; step <= 3; step++) {
          if (!loop && k + step >= m) break;
          var nk3 = (k + step) % m;
          if (x.stAt[nodes[nk3]] < 0 && (spec[nodes[nk3]] || 0) === 0 && h[nk3] > h[(nk3 - 1 + m) % m] + 0.03) {
            nodeLift[nk3] = 1;
          } else {
            break;
          }
        }
      }
    }

    // 3. Build 3D control points with Bezier corners + parametric Loops & Corkscrews
    var pts = []; // { x, y, z, spec, lift, ux, uy, uz, hasUp, st }
    var specsCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    var maxH = 0, totalDrop = 0;

    function pushPt(pt) {
      if (pts.length) {
        var last = pts[pts.length - 1];
        var dx = pt.x - last.x, dy = pt.y - last.y, dz = pt.z - last.z;
        if (dx * dx + dy * dy + dz * dz < 1e-5) return;
      }
      pts.push(pt);
    }

    for (k = 0; k < m; k++) {
      var tc = nodes[k], hc = h[k], isSt = x.stAt[tc] >= 0;
      var cx = C.cxOf(tc), cz = C.czOf(tc);
      var prevK = (k - 1 + m) % m, nextK = (k + 1) % m;
      var tp = nodes[prevK], tn = nodes[nextK];
      var hasPrev = loop || k > 0, hasNext = loop || k < m - 1;
      var gH = hc - cmax(tc);
      if (gH > maxH) maxH = gH;
      if (hasPrev && h[prevK] > hc) totalDrop += (h[prevK] - hc);

      var spc = isSt ? 0 : (spec[tc] || 0);
      var lft = nodeLift[k] ? 1 : 0;
      if (spc && specsCount[spc] !== undefined) specsCount[spc]++;

      // Open line endpoints: extend out to the tile edge if only 1 neighbor, or tile center
      if (hasPrev && hasNext) {
        var d1x = cx - C.cxOf(tp), d1z = cz - C.czOf(tp);
        var d2x = C.cxOf(tn) - cx, d2z = C.czOf(tn) - cz;
        var isCorner = Math.abs(d1x * d2z - d1z * d2x) >= 1e-4;
        if (isCorner) {
          var m1x = (C.cxOf(tp) + cx) * 0.5, m1z = (C.czOf(tp) + cz) * 0.5, m1h = (h[prevK] + hc) * 0.5;
          var m2x = (cx + C.cxOf(tn)) * 0.5, m2z = (cz + C.czOf(tn)) * 0.5, m2h = (hc + h[nextK]) * 0.5;
          for (var q = 0; q <= 10; q++) {
            var u = q / 10, iu = 1 - u;
            pushPt({
              x: iu * iu * m1x + 2 * iu * u * cx + u * u * m2x,
              y: iu * iu * m1h + 2 * iu * u * hc + u * u * m2h,
              z: iu * iu * m1z + 2 * iu * u * cz + u * u * m2z,
              spec: spc, lift: lft, hasUp: false, st: isSt
            });
          }
          continue;
        }
        // Straight tile: check for Loop-de-Loop (4), Corkscrew (5), Large Loop-de-Loop (6), or Large Corkscrew (7)
        if (spc >= 4 && spc <= 7) {
          var fl = Math.sqrt(d1x * d1x + d1z * d1z) || 1;
          var fx = d1x / fl, fz = d1z / fl;
          var rx = -fz, rz = fx;
          var steps = spc === 6 ? 52 : spc === 7 ? 48 : spc === 4 ? 34 : 30;
          var R = spc === 6 ? 4.5 : spc === 7 ? 2.45 : spc === 4 ? 2.4 : 1.2;
          maxH = Math.max(maxH, gH + R * 2);
          for (var j = 0; j <= steps; j++) {
            var th = (j / steps) * Math.PI * 2;
            var px, py, pz, ux, uy, uz;
            if (spc === 4 || spc === 6) {
              var lin = -1.0 + 2.0 * (j / steps);
              var fwdOff = lin + R * Math.sin(th) * 0.85;
              var latScale = spc === 6 ? 1.25 : 0.55;
              var latOff = latScale * ((th / Math.PI) - 1) * Math.sin(th * 0.5);
              px = cx + fx * fwdOff + rx * latOff;
              py = hc + R * (1 - Math.cos(th));
              pz = cz + fz * fwdOff + rz * latOff;
              var nu = vecNorm(-fx * Math.sin(th), Math.cos(th), -fz * Math.sin(th));
              ux = nu[0]; uy = nu[1]; uz = nu[2];
            } else if (spc === 5) {
              var lin2 = -1.0 + 2.0 * (j / steps);
              px = cx + fx * lin2 + rx * (R * Math.sin(th));
              py = hc + R * (1 - Math.cos(th));
              pz = cz + fz * lin2 + rz * (R * Math.sin(th));
              var nu2 = vecNorm(-rx * Math.sin(th), Math.cos(th), -rz * Math.sin(th));
              ux = nu2[0]; uy = nu2[1]; uz = nu2[2];
            } else {
              var lin3 = -1.0 + 2.0 * (j / steps);
              var fwdC = lin3 + 1.55 * Math.sin(th);
              var latC = R * Math.sin(th) + 0.85 * ((th / Math.PI) - 1) * Math.sin(th * 0.5);
              px = cx + fx * fwdC + rx * latC;
              py = hc + R * (1 - Math.cos(th));
              pz = cz + fz * fwdC + rz * latC;
              var nu3l = vecNorm(-(fx * 0.42 + rx * 0.91) * Math.sin(th), Math.cos(th), -(fz * 0.42 + rz * 0.91) * Math.sin(th));
              ux = nu3l[0]; uy = nu3l[1]; uz = nu3l[2];
            }
            pushPt({ x: px, y: py, z: pz, spec: spc, lift: 0, ux: ux, uy: uy, uz: uz, hasUp: true, st: false });
          }
          continue;
        }
        // Subdivide straight segments at entry midpoint, center, and exit midpoint so vertical hills curve smoothly!
        var sm1x = (C.cxOf(tp) + cx) * 0.5, sm1z = (C.czOf(tp) + cz) * 0.5, sm1h = (h[prevK] + hc) * 0.5;
        var sm2x = (cx + C.cxOf(tn)) * 0.5, sm2z = (cz + C.czOf(tn)) * 0.5, sm2h = (hc + h[nextK]) * 0.5;
        pushPt({ x: sm1x, y: sm1h, z: sm1z, spec: spc, lift: lft, hasUp: false, st: isSt });
        pushPt({ x: cx, y: hc, z: cz, spec: spc, lift: lft, hasUp: false, st: isSt });
        pushPt({ x: sm2x, y: sm2h, z: sm2z, spec: spc, lift: lft, hasUp: false, st: isSt });
        continue;
      }
      pushPt({ x: cx, y: hc, z: cz, spec: spc, lift: lft, hasUp: false, st: isSt });
    }

    // 4. Resample uniformly along arc length at fine resolution (0.36m) for silky smooth curves & hills
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

    var stepLen = 0.36;
    var nS = Math.max(4, Math.round(totalLen / stepLen));
    var pxA = new Float32Array(nS), pyA = new Float32Array(nS), pzA = new Float32Array(nS);
    var txA = new Float32Array(nS), tyA = new Float32Array(nS), tzA = new Float32Array(nS);
    var uxA = new Float32Array(nS), uyA = new Float32Array(nS), uzA = new Float32Array(nS);
    var spA = new Uint8Array(nS);
    var liftA = new Uint8Array(nS);
    var hasUpA = new Uint8Array(nS);
    var stSampleA = new Uint8Array(nS);

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
      liftA[k] = (f < 0.5 ? a0.lift : a1.lift) ? 1 : 0;
      if (spA[k] >= 2) liftA[k] = 0;
      stSampleA[k] = (a0.st || a1.st) ? 1 : 0;
      if (a0.hasUp || a1.hasUp) {
        var u0x = a0.hasUp ? a0.ux : 0, u0y = a0.hasUp ? a0.uy : 1, u0z = a0.hasUp ? a0.uz : 0;
        var u1x = a1.hasUp ? a1.ux : 0, u1y = a1.hasUp ? a1.uy : 1, u1z = a1.hasUp ? a1.uz : 0;
        var nu3 = vecNorm(u0x + (u1x - u0x) * f, u0y + (u1y - u0y) * f, u0z + (u1z - u0z) * f);
        uxA[k] = nu3[0]; uyA[k] = nu3[1]; uzA[k] = nu3[2];
        hasUpA[k] = 1;
      }
    }

    // Smooth vertical profile (pyA) across samples (skipping station samples and loops/corkscrews) so hill crests and valleys are gracefully rounded
    for (var vpass = 0; vpass < 2; vpass++) {
      var pyTmp = pyA.slice();
      for (k = 0; k < nS; k++) {
        if (stSampleA[k] || hasUpA[k]) continue;
        if (!loop && (k === 0 || k === nS - 1)) continue;
        var kp0 = loop ? (k - 1 + nS) % nS : k - 1;
        var kn0 = loop ? (k + 1) % nS : k + 1;
        pyTmp[k] = pyA[k] * 0.5 + (pyA[kp0] + pyA[kn0]) * 0.25;
      }
      pyA = pyTmp;
    }

    // Compute tangents & orthonormal up vectors (with realistic curve banking on turns!)
    for (k = 0; k < nS; k++) {
      var kp = loop ? (k - 1 + nS) % nS : Math.max(0, k - 1);
      var kn = loop ? (k + 1) % nS : Math.min(nS - 1, k + 1);
      var tn3 = vecNorm(pxA[kn] - pxA[kp], pyA[kn] - pyA[kp], pzA[kn] - pzA[kp]);
      txA[k] = tn3[0]; tyA[k] = tn3[1]; tzA[k] = tn3[2];
      if (!hasUpA[k]) {
        var rr = vecCross(tn3[0], tn3[1], tn3[2], 0, 1, 0);
        var rn = vecNorm(rr[0], rr[1], rr[2]);
        var uu = vecCross(rn[0], rn[1], rn[2], tn3[0], tn3[1], tn3[2]);
        var un = vecNorm(uu[0], uu[1], uu[2]);
        uxA[k] = un[0]; uyA[k] = un[1]; uzA[k] = un[2];
      } else {
        var dot = uxA[k] * tn3[0] + uyA[k] * tn3[1] + uzA[k] * tn3[2];
        var un2 = vecNorm(uxA[k] - dot * tn3[0], uyA[k] - dot * tn3[1], uzA[k] - dot * tn3[2]);
        uxA[k] = un2[0]; uyA[k] = un2[1]; uzA[k] = un2[2];
      }
    }

    // Precompute train center-of-mass slope (avgTyA) and horizontal curvature (curvA)
    var dsSample = totalLen / Math.max(1, nS);
    var avgTyA = new Float32Array(nS), curvA = new Float32Array(nS);
    for (k = 0; k < nS; k++) {
      if (spA[k] >= 4) {
        avgTyA[k] = tyA[k];
        curvA[k] = 0;
      } else {
        var tySum = 0;
        for (var off = -2; off <= 2; off++) {
          var ko = loop ? (k + off + nS) % nS : clamp(k + off, 0, nS - 1);
          tySum += tyA[ko];
        }
        avgTyA[k] = tySum / 5;
        var kpC = loop ? (k - 1 + nS) % nS : Math.max(0, k - 1);
        var knC = loop ? (k + 1) % nS : Math.min(nS - 1, k + 1);
        var dtx = txA[knC] - txA[kpC], dtz = tzA[knC] - tzA[kpC];
        curvA[k] = Math.min(1.5, Math.sqrt(dtx * dtx + dtz * dtz) / (2 * Math.max(0.2, dsSample)));
      }
    }

    var stTileLen = st ? st.trackTiles.length : 0;
    var stMidS = (stTileLen * 0.5) * TILE;

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

    // 6. Physics Energy & Friction Simulation + Dynamic Excitement/Intensity
    var trackTilesCount = Math.max(0, m - stTileLen);
    var hasBad = Object.keys(bad).length > 0;
    var closedValid = !!(st && loop && !branch && !hasBad && trackTilesCount >= 4);
    var sim = closedValid
      ? simulateCircuit(pxA, pyA, pzA, tyA, spA, liftA, avgTyA, curvA, nS, totalLen, stMidS, td, nodes, stTileLen)
      : {
        ok: false,
        peakSpeed: 0,
        minSpeed: 0,
        reason: branch
          ? 'Track cannot branch or cross'
          : (loop && hasBad)
            ? 'No room for coaster supports under part of the track — clear obstacles under long spans'
            : 'Drag track in a complete loop from one end of the station back to the other end',
        stallSample: -1
      };

    var specExc = 0, specInt = 0;
    for (var sid in specsCount) {
      var cnt = specsCount[sid];
      if (!cnt) continue;
      var sdef = SPEC_BY_ID[sid];
      if (!sdef) continue;
      if (+sid === 1) {
        // Chain Lift is mandatory for hills; give a small capped bonus rather than scaling per lift tile
        specExc += Math.min(0.25, cnt * 0.10);
        specInt += Math.min(0.15, cnt * 0.05);
      } else {
        var eff = 1 + Math.min(0.7, (cnt - 1) * 0.35);
        var flumeBonus = (td.id === 'flume' && +sid === 3) ? 1.4 : 1.0;
        specExc += sdef.excitement * 0.38 * eff * flumeBonus;
        specInt += sdef.intensity * 0.55 * eff;
      }
    }
    specExc = Math.min(1.8, specExc);
    specInt = Math.min(3.5, specInt);

    var peakSpeed = sim.peakSpeed || clamp(td.baseSpeed + Math.sqrt(Math.max(0, totalDrop)) * 1.4 + (specsCount[2] ? 4.0 : 0), td.baseSpeed, td.maxSpeed * 1.15);
    var rideH = Math.max(0, maxH - CD.clearance);
    var lenScore = Math.min(1.35, trackTilesCount * 0.03);
    var dropScore = Math.min(1.8, totalDrop * 0.09);
    var heightScore = Math.min(0.8, rideH * 0.07);
    var speedScore = Math.min(1.1, Math.max(0, peakSpeed - 6.5) * 0.09);
    var overlookScore = Math.min(1.6, overlooks.length * 0.45);
    var tierBonus = (td.excMul - 1.0) * 1.2;

    var excRaw = 1.45 + lenScore + dropScore + heightScore + speedScore + specExc + overlookScore + tierBonus;
    var intRaw = (0.9 + Math.min(2.6, totalDrop * 0.10) + Math.min(2.3, Math.max(0, peakSpeed - 6.5) * 0.14) + specInt) * (0.9 + 0.1 * td.excMul);
    var excitement = Math.round(clamp(excRaw, 1.0, 10.0) * 10) / 10;
    var intensity = Math.round(clamp(intRaw, 1.0, 10.0) * 10) / 10;
    var recPrice = Math.round(clamp(4 + excitement * 2.2, 5, CD.fareMax));
    var ready = closedValid && sim.ok;

    return {
      idx: li,
      station: st,
      typeDef: td,
      nodes: nodes,
      loop: loop,
      branch: branch,
      bad: bad,
      hasBad: hasBad,
      px: pxA, py: pyA, pz: pzA,
      tx: txA, ty: tyA, tz: tzA,
      ux: uxA, uy: uyA, uz: uzA,
      sSpec: spA,
      sLift: liftA,
      avgTy: avgTyA,
      curv: curvA,
      powered: !!(specsCount[1] || specsCount[2]),
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
      energyOk: sim.ok,
      stallReason: sim.reason,
      stallSample: sim.stallSample,
      ready: ready
    };
  }

  // Trace a chain of track tiles starting from `startTile` with previous tile `prevTile`
  function traceChain(rail, x, startTile, prevTile, stopAtStationIdx, visited, maxSteps) {
    var chain = [], cur = startTile, prev = prevTile, loop = false, branch = false, steps = 0;
    while (cur >= 0 && steps++ < maxSteps) {
      if (stopAtStationIdx >= 0 && cur === x.stations[stopAtStationIdx].endB) {
        loop = true;
        break;
      }
      if (x.stAt[cur] >= 0) {
        if (stopAtStationIdx >= 0 && x.stAt[cur] !== stopAtStationIdx) branch = true;
        break;
      }
      if (visited[cur]) { branch = true; break; }
      visited[cur] = 1;
      chain.push(cur);

      var nbrs = [];
      for (var d = 0; d < 4; d++) {
        if (hasEdge(rail, x, cur, d)) {
          var nt = stepTile(cur, d);
          if (nt >= 0) nbrs.push(nt);
        }
      }
      if (nbrs.length > 2) { branch = true; break; }
      var nextT = -1;
      for (var i = 0; i < nbrs.length; i++) if (nbrs[i] !== prev) { nextT = nbrs[i]; break; }
      if (nextT < 0) break;
      prev = cur;
      cur = nextT;
    }
    return { chain: chain, loop: loop, branch: branch };
  }

  function nearestStationType(x, t) {
    var N = C.getN(), ti = t % N, tj = (t - ti) / N;
    var best = TYPES.wooden, bestD = 1e9;
    for (var k = 0; k < x.stations.length; k++) {
      var st = x.stations[k], d = Math.abs(st.obj.i - ti) + Math.abs(st.obj.j - tj);
      if (d < bestD) { bestD = d; best = st.typeDef; }
    }
    return best;
  }

  function compute(s, rail, elev, spec) {
    var N = C.getN(), nn = N * N;
    var x = emptyX();
    x.ver = ++VER;
    x.stations = stationList(s);
    x.stAt = new Int16Array(nn).fill(-1);
    x.lineAt = new Int16Array(nn).fill(-1);

    var k, i, visited = {};
    for (k = 0; k < x.stations.length; k++) {
      var st = x.stations[k];
      x.stById[st.obj.id] = st;
      for (i = 0; i < st.tiles.length; i++) {
        x.stAt[st.tiles[i]] = k;
        visited[st.tiles[i]] = 1;
      }
    }

    // 1. Trace station-connected tracks (from endF, and also from endB if not yet closed into a loop!)
    for (k = 0; k < x.stations.length; k++) {
      var st0 = x.stations[k];
      var nodes = st0.trackTiles.slice();
      var loop = false, branch = false;

      var firstOutF = stepTile(st0.endF, st0.fd);
      if (firstOutF >= 0 && hasEdge(rail, x, st0.endF, st0.fd)) {
        var trF = traceChain(rail, x, firstOutF, st0.endF, k, visited, nn);
        for (i = 0; i < trF.chain.length; i++) nodes.push(trF.chain[i]);
        loop = trF.loop;
        if (trF.branch) branch = true;
      }

      // If not a closed loop yet, also check if the player built track out of endB (back of station)!
      if (!loop) {
        var firstOutB = stepTile(st0.endB, st0.bd);
        if (firstOutB >= 0 && hasEdge(rail, x, st0.endB, st0.bd) && !visited[firstOutB]) {
          var trB = traceChain(rail, x, firstOutB, st0.endB, -1, visited, nn);
          if (trB.branch) branch = true;
          // Prepend reversed trB.chain before station tiles so the open line is one continuous smooth spline!
          var revB = trB.chain.slice().reverse();
          nodes = revB.concat(nodes);
        }
      }

      var li = x.lines.length;
      st0.lineIdx = li;
      var L = buildLine(s, x, st0, st0.typeDef, nodes, loop, branch, li);
      x.lines.push(L);
      for (i = 0; i < nodes.length; i++) x.lineAt[nodes[i]] = li;
      for (var bt in L.bad) x.bad[bt] = L.bad[bt];
    }

    // 2. Trace any standalone / unattached partial track segments (so they ALSO get smooth curves, hills & twin rails while building!)
    for (var t = 0; t < nn; t++) {
      if (!rail[t] || visited[t]) continue;
      // Find an endpoint (degree <= 1) of this standalone component if one exists
      var comp = [], q = [t], seenComp = {};
      seenComp[t] = 1;
      var endTile = -1;
      while (q.length) {
        var u = q.pop();
        comp.push(u);
        var deg = 0;
        for (var d = 0; d < 4; d++) {
          if (hasEdge(rail, x, u, d)) {
            var v = stepTile(u, d);
            if (v >= 0 && x.stAt[v] < 0) {
              deg++;
              if (!seenComp[v]) { seenComp[v] = 1; q.push(v); }
            }
          }
        }
        if (deg <= 1 && endTile < 0) endTile = u;
      }
      var startT = endTile >= 0 ? endTile : comp[0];
      var trS = traceChain(rail, x, startT, -1, -1, visited, nn);
      for (i = 0; i < comp.length; i++) visited[comp[i]] = 1;
      if (trS.chain.length >= 2) {
        var li2 = x.lines.length;
        var td2 = nearestStationType(x, startT);
        var L2 = buildLine(s, x, null, td2, trS.chain, false, trS.branch, li2);
        x.lines.push(L2);
        for (i = 0; i < trS.chain.length; i++) x.lineAt[trS.chain[i]] = li2;
      }
    }

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
    out.lift = L.sLift ? L.sLift[i0] : 0;
    out.avgTy = L.avgTy ? L.avgTy[i0] : out.ty;
    out.curv = L.curv ? L.curv[i0] : 0;
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
    return nearestStationType(X, route[0] || 0);
  }

  function popcount4(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }

  function planTrack(route, opts) {
    var s = C.getS(); ensureArrays(s);
    if (!route || route.length < 2) return C.fail('Drag from a coaster station or track end');
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
      if (s1 >= 0 && s2 >= 0) continue;
      if (s1 >= 0) {
        var st1 = X.stations[s1];
        if (!((t1 === st1.endF && d === st1.fd) || (t1 === st1.endB && d === st1.bd))) {
          return C.fail('Connect track straight out of the station ends (follow the arrows)');
        }
      }
      if (s2 >= 0) {
        var st2 = X.stations[s2];
        if (!((t2 === st2.endF && d === st2.bd) || (t2 === st2.endB && d === st2.fd))) {
          return C.fail('Connect track straight into the station ends (follow the arrows)');
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
    var autoSpawned = false;
    for (k = 0; k < X.lines.length; k++) {
      var L = X.lines[k];
      if (!L.station) continue;
      if (L.loop && !L.branch && trainsOnStation(L.station.obj.id).length === 0) {
        spawnTrainInternal(L.station.obj.id, L.typeDef.minCars);
        autoSpawned = true;
        if (L.ready) {
          C.msg(L.typeDef.name + ' circuit complete! Excitement ' + L.excitement.toFixed(1) + '/10 — first train launched!', 'good');
        } else if (L.stallReason) {
          C.msg(L.typeDef.name + ' loop closed, but: ' + L.stallReason, 'bad');
        }
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
      var li = X.lineAt[t], td = (li >= 0 && X.lines[li]) ? X.lines[li].typeDef : nearestStationType(X, t);
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

  // Raise (+1) or Lower (-1) track height on existing track tiles (with smooth hill auto-ramping along connected track!)
  function changeHeight(tiles, delta, opts) {
    var s = C.getS(); ensureArrays(s);
    var dry = opts && opts.dry;
    var changedMap = {}, changed = [], cost = 0, peakLv = 0;

    for (var k = 0; k < tiles.length; k++) {
      var t = tiles[k];
      if (!s.coasterRail[t] || X.stAt[t] >= 0) continue;
      var li = X.lineAt[t], td = (li >= 0 && X.lines[li]) ? X.lines[li].typeDef : nearestStationType(X, t);
      var cur = s.coasterElev[t] || 0;
      var nxt = clamp(cur + delta, 0, td.maxHeight);
      if (nxt !== cur) {
        changedMap[t] = nxt;
        if (nxt > peakLv) peakLv = nxt;
      }
    }

    // Smooth hill auto-ramp: if raising a tile to level H, ensure neighbor track tiles ramp up smoothly (>= H-1, >= H-2) so hills are never disconnected spikes!
    if (delta > 0) {
      var queue = Object.keys(changedMap).map(Number);
      while (queue.length) {
        var u = queue.shift();
        var hu = changedMap[u] !== undefined ? changedMap[u] : (s.coasterElev[u] || 0);
        if (hu <= 1) continue;
        for (var d = 0; d < 4; d++) {
          if (!hasEdge(s.coasterRail, X, u, d)) continue;
          var v = stepTile(u, d);
          if (v < 0 || !s.coasterRail[v] || X.stAt[v] >= 0) continue;
          var hv = changedMap[v] !== undefined ? changedMap[v] : (s.coasterElev[v] || 0);
          if (hv < hu - 1) {
            changedMap[v] = hu - 1;
            queue.push(v);
          }
        }
      }
    }

    for (var tk in changedMap) {
      var ti = +tk, oldE = s.coasterElev[ti] || 0, newE = changedMap[tk];
      if (newE !== oldE) {
        changed.push({ t: ti, old: oldE, nw: newE });
        if (newE > oldE) cost += 15 * (newE - oldE);
      }
    }

    if (!changed.length) return C.fail(delta > 0 ? 'Track is already at max height (or click on track)' : 'Track is already at minimum height');
    if (cost > 0 && s.money < cost) return C.fail('Not enough money');
    var outTiles = changed.map(function (c) { return c.t; });
    if (dry) return C.okr(cost, { tiles: outTiles, peakLv: peakLv });

    for (k = 0; k < changed.length; k++) s.coasterElev[changed[k].t] = changed[k].nw;
    if (cost > 0) C.spend(cost, 'construction');
    C.jBegin(delta > 0 ? 'Raise coaster hill' : 'Lower coaster track');
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
    return C.okr(cost, { tiles: outTiles, peakLv: peakLv });
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
      // Chain Lift (specId === 1) can go on any non-station track tile; inversions/boosts/splashes require straight track
      var isStraight = (specId === 1) ? (mask !== 0) : (mask === 5 || mask === 10);
      if (!isStraight) { lastErr = sdef.name + ' must be placed on straight track'; continue; }
      var li = X.lineAt[t], td = (li >= 0 && X.lines[li]) ? X.lines[li].typeDef : nearestStationType(X, t);
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
    if (!L.loop || L.branch) return C.fail('Complete the coaster track loop first');
    if (!L.energyOk) return C.fail(L.stallReason || 'Train cannot complete the circuit without a Chain Lift or Boost');
    var td = L.typeDef;
    var existing = trainsOnStation(stationId);
    if (existing.length >= td.maxTrains) return C.fail('Maximum ' + td.maxTrains + ' trains per coaster');
    cars = clamp(cars || td.minCars, td.minCars, td.maxCars);
    var cost = td.trainCost + (cars - td.minCars) * td.carCost;
    if (s.money < cost) return C.fail('Not enough money');
    if (dry) return C.okr(cost);
    C.spend(cost, 'construction');
    var T = spawnTrainInternal(stationId, cars);
    if (existing.length > 0 && T) {
      var off = (L.totalLen / (existing.length + 1)) * existing.length;
      T.s = (L.stMidS + off) % L.totalLen;
      TR[T.id].s = T.s;
      T.state = 'run'; TR[T.id].state = 'run';
      T.v = STATION_PUSH; TR[T.id].v = T.v;
    }
    return C.okr(cost, { id: T.id });
  }

  function ejectAll(T, emergency) {
    var rt = TR[T.id];
    if (!rt || !rt.riders.length) return;
    var L = lineForStation(T.stationId);
    var st = L ? L.station : X.stById[T.stationId];
    var RT = C.getRT();
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
    if (!placed) g.ti = C.tileOf(g.x, g.z);
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

  function adjPathTilesForStation(st) {
    var s = C.getS(), N = C.getN(), fp = st.fp, out = [];
    for (var a = -1; a <= fp.w; a++) for (var b = -1; b <= fp.h; b++) {
      if (a >= 0 && a < fp.w && b >= 0 && b < fp.h) continue;
      if ((a < 0 || a >= fp.w) && (b < 0 || b >= fp.h)) continue; // orthogonal neighbors only
      var xi = fp.i0 + a, xj = fp.j0 + b;
      if (xi >= 0 && xj >= 0 && xi < N && xj < N && s.path[xi + xj * N]) out.push(xi + xj * N);
    }
    return out;
  }

  // Whole-coaster breakdown: stops ALL trains on the coaster station and marks the station broken until repaired by a Mechanic!
  function breakdown(idOrStationId) {
    var s = C.getS();
    if (!s || !s.coaster) return false;
    var stationId = 0, trigTrain = null;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      if (T.id === idOrStationId) { stationId = T.stationId; trigTrain = T; break; }
    }
    if (!stationId && X.stById[idOrStationId]) stationId = idOrStationId;
    if (!stationId) return false;

    var st = X.stById[stationId];
    var o = st ? st.obj : null;
    var peers = trainsOnStation(stationId);
    if (!peers.length && !o) return false;
    var alreadyBroken = o && o.broken;
    for (k = 0; k < peers.length; k++) {
      var rtk = TR[peers[k].id];
      if (rtk && rtk.state === 'broken') alreadyBroken = true;
    }
    if (o) {
      o.broken = true;
      o.condition = Math.min(o.condition === undefined ? 100 : o.condition, 20);
    }
    for (k = 0; k < peers.length; k++) {
      var Tk = peers[k], rt = TR[Tk.id];
      if (!rt) rt = TR[Tk.id] = { s: Tk.s || 0, v: 0, state: 'broken', dwell: 0, fix: CD.fixTime, eng: false, riders: [] };
      rt.state = Tk.state = 'broken';
      rt.v = Tk.v = 0;
      if (!alreadyBroken) {
        rt.fix = Tk.fix = CD.fixTime;
        rt.eng = Tk.eng = false;
      }
    }
    if (alreadyBroken) return true;
    if (!trigTrain && peers.length) trigTrain = peers[0];
    s.coaster.stats.breakdowns = (s.coaster.stats.breakdowns || 0) + 1;
    var L = lineForStation(stationId);
    var nm = L ? L.typeDef.name : 'Rollercoaster';
    var RT = C.getRT();
    var hasMech = RT && RT.mechCount > 0;
    C.msg(nm + ' has broken down and stopped! ' + (hasMech ? 'A Mechanic is responding by radio.' : 'Hire a Mechanic in Staff or click Call Mechanic on its panel.'), 'bad');
    C.bus.emit('coasterBroken', { trainId: trigTrain ? trigTrain.id : 0, stationId: stationId, name: nm });
    return true;
  }

  function onMechanicRepair(stationId, mechName, targetCond) {
    var s = C.getS();
    if (!s || !s.coaster) return false;
    var st = X.stById[stationId], o = st ? st.obj : null;
    var L = lineForStation(stationId);
    var nm = L ? L.typeDef.name : 'Rollercoaster';
    var wasBroken = !!(o && o.broken);
    var newCond = targetCond === undefined ? 100 : targetCond;
    if (o) {
      o.broken = false;
      o.condition = newCond;
    }
    var peers = trainsOnStation(stationId);
    for (var k = 0; k < peers.length; k++) {
      var T = peers[k], rt = TR[T.id];
      if (rt && rt.state === 'broken') {
        wasBroken = true;
        rt.state = T.state = 'run';
        rt.fix = T.fix = 0;
        rt.eng = T.eng = false;
        rt.v = T.v = STATION_PUSH;
      }
    }
    if (wasBroken) {
      C.msg((mechName ? mechName + ' repaired ' : 'Repaired ') + nm + ' — rollercoaster is back up and running at ' + newCond + '% condition!', 'good');
      C.bus.emit('coasterFixed', { stationId: stationId, trainId: peers[0] ? peers[0].id : 0 });
    } else if (o) {
      C.msg((mechName || 'Mechanic') + ' serviced ' + nm + ' back to ' + newCond + '% condition.', 'info', false);
    }
    return true;
  }

  function callEngineer(idOrStationId) {
    var s = C.getS();
    if (!s || !s.coaster) return C.fail('Coaster not found');
    var stationId = 0;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      if (T.id === idOrStationId) { stationId = T.stationId; break; }
    }
    if (!stationId && X.stById[idOrStationId]) stationId = idOrStationId;
    if (!stationId) return C.fail('Coaster not found');

    var st = X.stById[stationId], o = st ? st.obj : null;
    var peers = trainsOnStation(stationId);
    var isBroken = !!(o && o.broken);
    var alreadyEng = false;
    for (k = 0; k < peers.length; k++) {
      var rt = TR[peers[k].id];
      if (rt && rt.state === 'broken') isBroken = true;
      if (rt && rt.eng) alreadyEng = true;
    }
    if (!isBroken) {
      // Preventative tune-up service if not broken but worn
      if (o && (o.condition === undefined ? 100 : o.condition) < 95) {
        var srvFee = CD.callOutFee || 60;
        if (s.money < srvFee) return C.fail('Need ' + C.fmt(srvFee) + ' for service');
        C.spend(srvFee, 'upkeep');
        o.condition = 100;
        C.msg('Serviced ' + st.typeDef.name + ' back to 100% condition (' + C.fmt(srvFee) + ').', 'good');
        return C.okr(srvFee);
      }
      return C.fail('Coaster is running fine');
    }
    if (alreadyEng) return C.fail('Emergency mechanic already on the way');
    var fee = CD.engineerFee;
    if (s.money < fee) return C.fail('Need ' + C.fmt(fee) + ' for emergency mechanic');
    C.spend(fee, 'upkeep');
    for (k = 0; k < peers.length; k++) {
      var Tk = peers[k], rtk = TR[Tk.id];
      if (rtk) {
        rtk.eng = Tk.eng = true;
        rtk.fix = Tk.fix = Math.min(rtk.fix || CD.engineerTime, CD.engineerTime);
      }
    }
    C.msg('Emergency mechanic dispatched to ' + (st ? st.typeDef.name : 'Rollercoaster') + ' (' + C.fmt(fee) + ').', 'info');
    return C.okr(fee);
  }

  function hasUrgentMechanicWork(staff, sc0, claimedFn) {
    var RT = C.getRT();
    for (var k = 0; k < X.stations.length; k++) {
      var st = X.stations[k], o = st.obj;
      if (!o.broken && (o.condition === undefined ? 100 : o.condition) >= 50) continue;
      if (claimedFn && claimedFn('c' + o.id, staff)) continue;
      var pts = adjPathTilesForStation(st);
      for (var i = 0; i < pts.length; i++) {
        if (!sc0 || !RT.comp || RT.comp[pts[i]] === sc0) return true;
      }
    }
    return false;
  }

  function pickMechanicTarget(staff, sc0, claimedFn) {
    var RT = C.getRT(), best = null, bestScore = 1e9;
    for (var k = 0; k < X.stations.length; k++) {
      var st = X.stations[k], o = st.obj;
      var cond = o.condition === undefined ? 100 : o.condition;
      var isBroken = !!o.broken;
      var peers = trainsOnStation(o.id);
      for (var p = 0; p < peers.length; p++) if (TR[peers[p].id] && TR[peers[p].id].state === 'broken') isBroken = true;
      if (!isBroken && cond >= 75) continue;
      if (claimedFn && claimedFn('c' + o.id, staff)) continue;
      var pts = adjPathTilesForStation(st);
      var reach = [];
      for (var i = 0; i < pts.length; i++) {
        if (!sc0 || !RT.comp || RT.comp[pts[i]] === sc0) reach.push(pts[i]);
      }
      if (!reach.length) continue;
      var dist = Math.abs(o.i - (staff.ti % C.getN())) + Math.abs(o.j - Math.floor(staff.ti / C.getN()));
      var score = (isBroken ? -1000 : cond * 2) + dist;
      if (score < bestScore) {
        bestScore = score;
        best = { station: o, tiles: reach, broken: isBroken };
      }
    }
    return best;
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
    if (L.station && (L.station.obj.paused || L.station.obj.broken)) return false;
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
    if (o.paused || !L.ready) return;
    var q = RT.bq[o.id];
    if (!q || !q.q.length) return;
    var td = L.typeDef;
    var cap = T.cars * td.capacity;
    var price = o.price === undefined ? (o.def ? o.def.price : L.recPrice) : o.price;
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
    if (rt && (rt.state === 'broken' || rt.stalled) && C.rng.chance(0.08)) {
      C.say(g, 'coasterStuck');
      g.mood -= 1.2 * a;
    }
  }

  // ---- Simulation Step (Real Gravitational Potential + Friction + Chain Lift Physics) ----
  function stepTrain(T, L, dt) {
    var rt = TR[T.id], td = L.typeDef, stObj = L.station ? L.station.obj : null;
    if (!rt) return;

    if (stObj && stObj.condition === undefined) stObj.condition = 100;

    if (rt.state === 'broken' || (stObj && stObj.broken)) {
      rt.state = T.state = 'broken';
      rt.v = T.v = 0;
      rt.fix -= dt;
      T.fix = rt.fix;
      if (rt.fix <= 0) {
        var wasEng = !!rt.eng;
        onMechanicRepair(T.stationId, wasEng ? 'Emergency Mechanic' : 'Safety Override', wasEng ? 100 : 80);
      }
      placeRiders(T, L);
      return;
    }

    if (rt.state === 'dwell') {
      rt.v = T.v = 0;
      rt.stalled = false;
      if (L.ready && (!stObj || !stObj.broken)) boardFromQueue(T, L);
      rt.dwell -= dt;
      T.dwell = rt.dwell;
      if (rt.dwell <= 0 && L.ready && (!stObj || (!stObj.paused && !stObj.broken))) {
        rt.state = T.state = 'run';
        rt.v = T.v = STATION_PUSH;
        rt.seenLoop = false; rt.seenSplash = false;
        rt.leftStation = false;
      }
      placeRiders(T, L);
      return;
    }

    // Running along closed loop with unified substepped physics (gravitational potential, rolling/curve/air drag, chain lift, boost & inversions)
    var subSteps = 4, subDt = dt / subSteps;
    for (var si = 0; si < subSteps; si++) {
      var pose = sample(L, rt.s);
      if (pose.spec === 3 && !rt.seenSplash) {
        rt.seenSplash = true;
        C.bus.emit('coasterSplash', { x: pose.x, y: pose.y, z: pose.z, trainId: T.id });
      }
      if (pose.spec >= 4 && pose.spec <= 7) rt.seenLoop = true;

      var dsStep = Math.abs(rt.v) * subDt;
      rt.v = stepCoasterPhysics(rt.v, dsStep, subDt, pose.avgTy, pose.spec, pose.lift, pose.curv, td, !!L.powered);

      if (rt.v <= 0.15) {
        if (pose.avgTy > 0.015 && !pose.lift && pose.spec !== 2) {
          // Unpowered uphill climb ran out of kinetic energy — let real gravity pull rt.v negative (rollback)
          rt.stalled = true;
        } else if (L.energyOk && pose.avgTy <= 0.015) {
          rt.v = Math.min(2.0, Math.max(0.4, rt.v) + 3.5 * subDt);
          rt.stalled = false;
        } else if (!L.energyOk) {
          rt.stalled = true;
        }
      } else if (rt.v > 0.5 && (L.energyOk || pose.lift || pose.spec === 2)) {
        rt.stalled = false;
      }

      // Prevent overtaking another train on the same coaster
      if (rt.v > 0) {
        var peers = trainsOnStation(T.stationId);
        for (var p = 0; p < peers.length; p++) {
          var O = peers[p];
          if (O.id === T.id) continue;
          var ort = TR[O.id]; if (!ort) continue;
          var gap = ((ort.s - rt.s) % L.totalLen + L.totalLen) % L.totalLen;
          var minGap = T.cars * (CD.carLen + CD.carGap) + 3.5;
          if (gap < minGap) { rt.v = Math.min(rt.v, Math.max(0, ort.v) * 0.5); if (gap < minGap * 0.75) rt.v = 0; }
        }
      }

      // Smoothly brake as the train enters the station platform approach before docking at L.stMidS
      if (rt.leftStation && rt.v > 0) {
        var dToSt = ((L.stMidS - rt.s) % L.totalLen + L.totalLen) % L.totalLen;
        if (dToSt < 4.5) {
          var approachTarget = Math.max(2.0, 2.0 + dToSt * 1.6);
          if (rt.v > approachTarget) rt.v = Math.max(approachTarget, rt.v - 14.0 * subDt);
        }
      }

      var subPrevS = rt.s;
      rt.s = ((rt.s + rt.v * subDt) % L.totalLen + L.totalLen) % L.totalLen;

      var distFromSt = Math.abs(rt.s - L.stMidS);
      if (distFromSt > 4.5 && distFromSt < L.totalLen - 4.5) rt.leftStation = true;

      if (rt.leftStation && rt.v > 0) {
        var d0 = ((L.stMidS - subPrevS) % L.totalLen + L.totalLen) % L.totalLen;
        var d1 = ((rt.s - subPrevS) % L.totalLen + L.totalLen) % L.totalLen;
        if (d0 <= d1 + 0.05 && d0 < L.totalLen * 0.5) {
          rt.s = T.s = L.stMidS;
          rt.v = T.v = 0;
          rt.state = T.state = 'dwell';
          rt.dwell = T.dwell = CD.dwell;
          rt.leftStation = false;
          rt.stalled = false;
          rt.stallT = 0;
          ejectAll(T, false);
          boardFromQueue(T, L);
          placeRiders(T, L);
          return;
        }
      }
    }

    T.s = rt.s;
    T.v = rt.v;
    if (rt.stalled) {
      rt.stallT = (rt.stallT || 0) + dt;
      if (rt.stallT > 4.0) {
        // Winch train back to station safely
        rt.stallT = 0; rt.stalled = false;
        rt.s = T.s = L.stMidS; rt.v = T.v = 0;
        rt.state = T.state = 'dwell'; rt.dwell = T.dwell = CD.dwell;
        ejectAll(T, true);
        placeRiders(T, L);
        return;
      }
    } else {
      rt.stallT = 0;
    }

    placeRiders(T, L);
  }

  function step(dt) {
    var s = C.getS();
    if (!s || !s.coaster || !s.coaster.trains.length) return;
    var activeStations = [], seenStation = {};
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      var L = lineForStation(T.stationId);
      if (!L || !L.loop || L.branch) continue;
      if (!TR[T.id]) TR[T.id] = { s: T.s || L.stMidS, v: T.v || 0, state: T.state || 'dwell', dwell: T.dwell || 2, fix: T.fix || 0, eng: !!T.eng, riders: [] };
      stepTrain(T, L, dt);
      var rt = TR[T.id];
      var stObj = L.station ? L.station.obj : null;
      if (stObj && rt && rt.state === 'run' && !stObj.broken) {
        var entry = seenStation[T.stationId];
        if (!entry) {
          entry = seenStation[T.stationId] = { stObj: stObj, outTrainId: 0 };
          activeStations.push(entry);
        }
        if (rt.leftStation && !entry.outTrainId) entry.outTrainId = T.id;
      }
    }
    // Per-station wear & tear + breakdown check (does not stack across multiple trains on the same coaster)
    var RT = C.getRT();
    var mechMul = (RT && RT.mechCount > 0) ? 0.5 : 1.0;
    for (k = 0; k < activeStations.length; k++) {
      var stInfo = activeStations[k], so = stInfo.stObj;
      so.condition = Math.max(0, (so.condition === undefined ? 100 : so.condition) - dt * 0.015);
      if (stInfo.outTrainId && CD.breakdownPerHour > 0) {
        var wearMul = so.condition < 35 ? 4.0 : so.condition < 60 ? 2.0 : 1.0;
        var pBreak = (CD.breakdownPerHour * wearMul * mechMul / (C.DAY_SECONDS / 24)) * dt;
        if (so.condition <= 8 || C.rng.chance(pBreak)) breakdown(stInfo.outTrainId);
      }
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
      if (L.ready && L.station && C.buildingConnected(L.station.obj) && trainsOnStation(L.station.obj.id).length > 0) {
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
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      var L = lineForStation(T.stationId);
      if (!L || !L.loop || L.branch) {
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
      if (L2 && L2.loop) placeRiders(T2, L2);
    }
    C.bus.emit('coasterChanged', X.ver);
  }

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
      energyOk: !!(L && L.energyOk),
      stallReason: L ? L.stallReason : null,
      loop: !!(L && L.loop),
      branch: !!(L && L.branch),
      hasBad: !!(L && L.hasBad),
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
      paused: !!st.obj.paused,
      broken: !!st.obj.broken || trains.some(function (t) { return TR[t.id] && TR[t.id].state === 'broken'; }),
      condition: Math.round(st.obj.condition === undefined ? 100 : st.obj.condition),
      eng: trains.some(function (t) { return TR[t.id] && TR[t.id].eng; })
    };
  }

  function trainInfo(trainId) {
    var s = C.getS();
    if (!s || !s.coaster) return null;
    for (var k = 0; k < s.coaster.trains.length; k++) {
      var T = s.coaster.trains[k];
      if (T.id === trainId) {
        var rt = TR[T.id] || { v: 0, state: 'dwell', riders: [], fix: 0, eng: false, stalled: false };
        var L = lineForStation(T.stationId);
        var td = TYPES[T.type] || TYPES.wooden;
        return {
          train: T,
          typeDef: td,
          line: L,
          speed: rt.v,
          state: rt.stalled ? 'stalled' : rt.state,
          stalled: !!rt.stalled,
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
    onMechanicRepair: onMechanicRepair,
    hasUrgentMechanicWork: hasUrgentMechanicWork,
    pickMechanicTarget: pickMechanicTarget,
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
