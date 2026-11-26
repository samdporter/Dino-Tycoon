// Wild Acres Zoo — Water transport & helipads (Zoo Tycoon only)
// Guest ferries & capped service boats form fleets over connected water; staff helipads link any two pads.
// Both extend path-component reachability. VIP helipads fly in wealthy guests who pay an arrival fee.
(function () {
  'use strict';
  var Z = window.Z, C = Z && Z.boatsCtx;
  if (!Z || !C) return;

  var TILE = C.TILE, INF = C.INF, BD = C.BD;
  var FERRY_SPEED = 6.5, LARGE_FERRY_SPEED = 8.0, SERVICE_SPEED = 7.5, HELI_SPEED = 12;
  var FERRY_CAP = 16, LARGE_FERRY_CAP = 48, FERRY_DWELL = 6, FERRY_MAX = 4, LARGE_FERRY_MAX = 6;
  var SERVICE_PER_PIER = 2, SERVICE_MAX_PER_NET = 6;
  var PIER_QUEUE_LIMIT = 75;
  var LAND_T = 4, WAIT_T = 3, BOARD_T = 1.5, CLIMB_T = 4, HELI_ALT = 14, PAD_Y = 0.35;
  var VIP_MAX_PER_PAD = 3;

  // 16 distinct deck seats across 2 columns x 8 rows inside the ferry deck (~2.4m x 5.8m)
  var FERRY_SEATS = [];
  (function () {
    for (var r = 0; r < 8; r++) {
      var z = 1.65 - r * 0.48;
      FERRY_SEATS.push({ x: -0.55, z: z, y: 0.3 }, { x: 0.55, z: z, y: 0.3 });
    }
  })();

  // 48 distinct seats for double-deck large ferries: 24 lower deck (y=0.3) + 24 upper deck (y=1.35)
  var LARGE_FERRY_SEATS = [];
  (function () {
    var cols = [-1.05, -0.35, 0.35, 1.05], r, c;
    for (r = 0; r < 6; r++) {
      var zr = 1.5 - r * 0.70;
      for (c = 0; c < cols.length; c++) {
        LARGE_FERRY_SEATS.push({ x: cols[c], z: zr, y: 0.3 });
        LARGE_FERRY_SEATS.push({ x: cols[c], z: zr, y: 1.35 });
      }
    }
  })();

  var piers = [], pads = [], routes = {}, edges = {};
  var ferries = [], serviceBoats = [], ferryStaffQueue = [], serviceQueue = [];
  var trips = [], helis = [], nextVid = 1, scanT = 0;

  function fareOf(o) { return o.price === undefined ? BD[o.type].price : o.price; }
  function oById(id) { return C.getRT().oById.get(id); }
  function pierById(id) {
    for (var k = 0; k < piers.length; k++) if (piers[k].o.id === id) return piers[k];
    return null;
  }
  function netHasLargePier(net) {
    for (var k = 0; k < piers.length; k++) {
      var p = piers[k];
      if (p.guest && p.net === net && BD[p.o.type] && BD[p.o.type].largePier) return true;
    }
    return false;
  }
  function ferryCapForNet(net) { return netHasLargePier(net) ? LARGE_FERRY_CAP : FERRY_CAP; }
  function ferryMaxForNet(net) { return netHasLargePier(net) ? LARGE_FERRY_MAX : FERRY_MAX; }
  function ferrySpeedForNet(net) { return netHasLargePier(net) ? LARGE_FERRY_SPEED : FERRY_SPEED; }
  function centreOf(o) {
    var fp = C.objFootprint(o);
    return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE };
  }
  function frontTile(o) {
    var RT = C.getRT(), list = C.frontPathTiles(o, []);
    for (var k = 0; k < list.length; k++) if (RT.comp[list[k]]) return list[k];
    return -1;
  }
  function nearestPathTile(x, z) {
    var S = C.getS(), N = C.getN();
    var ci = Math.max(0, Math.min(N - 1, Math.floor(x / TILE)));
    var cj = Math.max(0, Math.min(N - 1, Math.floor(z / TILE)));
    for (var r = 0; r <= 12; r++) {
      var best = -1, bd = 1e9;
      for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
        var ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        var t = ni + nj * N;
        if (!S.path[t]) continue;
        var d = di * di + dj * dj;
        if (d < bd) { bd = d; best = t; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  function waterBeside(o) {
    var S = C.getS(), N = C.getN(), fp = C.objFootprint(o), out = [];
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var ni = i + d[0], nj = j + d[1];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) return;
        var t = ni + nj * N;
        if (S.terrain[t] === C.WATER && out.indexOf(t) < 0) out.push(t);
      });
    }
    return out;
  }

  function placeCheck(type, fp) {
    var def = BD[type];
    if (!def || !(def.boatPier || def.helipad)) return null;
    if (def.helipad) return null;
    var S = C.getS(), N = C.getN();
    var wet = false;
    for (var a = 0; a < fp.w && !wet; a++) for (var b = 0; b < fp.h && !wet; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      wet = (i > 0 && S.terrain[i - 1 + j * N] === C.WATER) || (i < N - 1 && S.terrain[i + 1 + j * N] === C.WATER) ||
        (j > 0 && S.terrain[i + (j - 1) * N] === C.WATER) || (j < N - 1 && S.terrain[i + (j + 1) * N] === C.WATER);
    }
    return wet ? null : 'Must be on the shore, touching water';
  }

  function route(a, b) {
    var key = a.o.id + '>' + b.o.id;
    if (key in routes) return routes[key];
    var S = C.getS(), N = C.getN(), NN = N * N, prev = new Int32Array(NN).fill(-2), goal = {}, q = [], h = 0, found = -1, k;
    b.water.forEach(function (t) { goal[t] = true; });
    for (k = 0; k < a.water.length; k++) { prev[a.water[k]] = -1; q.push(a.water[k]); }
    while (h < q.length && found < 0) {
      var t = q[h++];
      if (goal[t]) { found = t; break; }
      var i = t % N, j = (t - i) / N;
      [i > 0 ? t - 1 : -1, i < N - 1 ? t + 1 : -1, j > 0 ? t - N : -1, j < N - 1 ? t + N : -1].forEach(function (n) {
        if (n >= 0 && prev[n] === -2 && S.terrain[n] === C.WATER) { prev[n] = t; q.push(n); }
      });
    }
    var r = null;
    if (found >= 0) {
      r = [];
      for (var c = found; c >= 0; c = prev[c]) r.push(c);
      r.reverse();
    }
    routes[key] = r;
    return r;
  }

  function waterPoints(r) {
    var pts = r.map(function (t) { return { x: C.cxOf(t), z: C.czOf(t) }; });
    if (pts.length < 2) pts.push(pts[0]);
    return pts;
  }

  function place(tr) {
    var n = tr.pts.length - 1, f = n > 0 ? Math.min(tr.d / tr.seg, n) : 0, i = Math.min(Math.floor(f), Math.max(0, n - 1)), u = f - i, a = tr.pts[i], b = tr.pts[i + 1] || a;
    tr.x = a.x + (b.x - a.x) * u; tr.z = a.z + (b.z - a.z) * u;
    if (a.x !== b.x || a.z !== b.z) tr.heading = Math.atan2(b.x - a.x, b.z - a.z);
    if (tr.kind === 'heli') tr.y = C.heightAt(tr.x, tr.z) + 1 + 6 * Math.sin(Math.PI * f / Math.max(1, n));
  }

  function reversePathFromCurrent(v, targetPier) {
    var r = route(v.fromPier && pierById(v.fromPier.o.id) ? v.fromPier : targetPier, targetPier);
    var cur = { x: v.x, z: v.z };
    var pts = [cur];
    if (v.pts && v.pts.length) {
      var n = v.pts.length - 1, idx = Math.min(Math.floor(v.d / v.seg), n);
      for (var k = idx; k >= 0; k--) pts.push({ x: v.pts[k].x, z: v.pts[k].z });
    } else if (r) {
      var wp = waterPoints(r);
      for (var j = wp.length - 1; j >= 0; j--) pts.push(wp[j]);
    } else {
      var w0 = targetPier.water[0];
      pts.push({ x: C.cxOf(w0), z: C.czOf(w0) });
    }
    if (pts.length < 2) pts.push(pts[0]);
    // Compute total length using exact segment distances by resampling into uniform TILE steps or variable pts
    // Since place() assumes uniform tr.seg, resample or set seg per segment? Keep uniform TILE points via route or build simple polyline step:
    // Actually let's compute uniform-friendly pts: if we only need current -> targetPier.water[0], interpolate at TILE steps!
    var dest = pts[pts.length - 1], dx = dest.x - cur.x, dz = dest.z - cur.z, dist = Math.hypot(dx, dz);
    var steps = Math.max(1, Math.ceil(dist / TILE)), uni = [];
    for (var s = 0; s <= steps; s++) uni.push({ x: cur.x + dx * (s / steps), z: cur.z + dz * (s / steps) });
    if (uni.length < 2) uni.push(uni[0]);
    v.pts = uni;
    v.seg = Math.max(0.1, dist / steps);
    v.d = 0;
    v.len = v.seg * (uni.length - 1);
  }

  function landGuest(g, pierId, fallbackTile) {
    if (!g) return;
    var RT = C.getRT(), pend = g.pend || { state: 'walk', gt: '', gid: 0, dk: '', spot: 0, pk: '' };
    var B = pierId ? oById(pierId) : null;
    var ft = B ? frontTile(B) : -1;
    if (ft < 0 && fallbackTile >= 0 && C.getS().path[fallbackTile]) ft = fallbackTile;
    if (ft < 0) ft = nearestPathTile(g.x, g.z);
    g.pend = null; g.absY = null; g.boatY = 0;
    g.state = pend.state; g.gt = pend.gt; g.gid = pend.gid; g.dk = pend.dk; g.spot = pend.spot; g.pk = pend.pk;
    g.ni = -1; g.glide = 0; g.gAge = 0;
    if (ft >= 0) { g.x = C.cxOf(ft); g.z = C.czOf(ft); g.ti = ft; g.pv = RT.pathVer; }
    else { g.pv = -1; g.gt = ''; g.dk = ''; if (g.state !== 'leave') g.state = 'walk'; }
  }

  function landStaff(s, tile, advanceRoute, fallbackTile) {
    if (!s) return;
    var S = C.getS();
    var ft = (tile >= 0 && S.path[tile]) ? tile : -1;
    if (ft < 0 && fallbackTile >= 0 && S.path[fallbackTile]) ft = fallbackTile;
    if (ft < 0) ft = nearestPathTile(s.x, s.z);
    if (ft >= 0) {
      s.x = C.cxOf(ft); s.z = C.czOf(ft); s.ti = ft;
      if (advanceRoute) s.ri++;
      else { C.releaseClaims(s); s.tk = null; s.route = null; }
    } else {
      C.releaseClaims(s); s.tk = null; s.route = null;
    }
    s.hop = null; s.absY = null; s.boatY = 0; s.state = advanceRoute ? 'walk' : 'idle'; s.speed = 0;
  }

  function moorPos(pier, idx, count, isFerry) {
    var w = pier.water[idx % pier.water.length];
    var wx = C.cxOf(w), wz = C.czOf(w), c = centreOf(pier.o);
    var dx = wx - c.x, dz = wz - c.z, dl = Math.hypot(dx, dz) || 1;
    var nx = dx / dl, nz = dz / dl;
    var tx = -nz, tz = nx;
    var row = Math.floor(idx / pier.water.length);
    var spacing = isFerry ? 2.6 : 1.3;
    var lateral = (count > 1 && pier.water.length === 1) ? (idx - (count - 1) / 2) * spacing : 0;
    var outShift = row * (isFerry ? 2.4 : 1.4);
    return {
      x: wx + tx * lateral + nx * outShift,
      z: wz + tz * lateral + nz * outShift,
      heading: Math.atan2(tx, tz)
    };
  }

  function layoutDockedFleet() {
    var byPier = {}, k, f, sb;
    for (k = 0; k < ferries.length; k++) {
      f = ferries[k];
      if (f.state !== 'wait' || !f.atPier) continue;
      (byPier[f.atPier.o.id] || (byPier[f.atPier.o.id] = [])).push(f);
    }
    for (var pid in byPier) {
      var list = byPier[pid];
      for (k = 0; k < list.length; k++) {
        f = list[k];
        var mp = moorPos(f.atPier, k, list.length, true);
        f.x = mp.x; f.z = mp.z; f.heading = mp.heading;
        placeFerryRiders(f);
      }
    }
    byPier = {};
    for (k = 0; k < serviceBoats.length; k++) {
      sb = serviceBoats[k];
      if (sb.state !== 'idle' || !sb.atPier) continue;
      (byPier[sb.atPier.o.id] || (byPier[sb.atPier.o.id] = [])).push(sb);
    }
    for (pid in byPier) {
      var slist = byPier[pid];
      for (k = 0; k < slist.length; k++) {
        sb = slist[k];
        var smp = moorPos(sb.atPier, k, slist.length, false);
        sb.x = smp.x; sb.z = smp.z; sb.heading = smp.heading;
      }
    }
  }

  function placeFerryRiders(f) {
    var c = Math.cos(f.heading), s = Math.sin(f.heading), k, seat;
    var seats = f.large ? LARGE_FERRY_SEATS : FERRY_SEATS;
    for (k = 0; k < f.pax.length; k++) {
      var px = f.pax[k], g = px.g;
      if (!g || g.state !== 'boat') continue;
      seat = seats[px.seat % seats.length];
      g.x = f.x + seat.x * c + seat.z * s;
      g.z = f.z - seat.x * s + seat.z * c;
      g.boatY = seat.y || 0.3;
      g.heading = f.heading;
    }
    for (k = 0; k < f.staffPax.length; k++) {
      var sp = f.staffPax[k], st = sp.s;
      if (!st || st.state !== 'boat') continue;
      seat = seats[sp.seat % seats.length];
      st.x = f.x + seat.x * c + seat.z * s;
      st.z = f.z - seat.x * s + seat.z * c;
      st.boatY = seat.y || 0.3;
      st.heading = f.heading;
    }
  }

  function nextFreeSeat(f) {
    var used = {}, k, cap = f.cap || ferryCapForNet(f.net);
    for (k = 0; k < f.pax.length; k++) used[f.pax[k].seat] = true;
    for (k = 0; k < f.staffPax.length; k++) used[f.staffPax[k].seat] = true;
    for (k = 0; k < cap; k++) if (!used[k]) return k;
    return 0;
  }

  function spawnFerryAt(pier) {
    var mp = moorPos(pier, 0, 1, true);
    var isLarge = netHasLargePier(pier.net);
    var f = {
      id: nextVid++, kind: 'ferry', net: pier.net, state: 'wait',
      large: isLarge, cap: isLarge ? LARGE_FERRY_CAP : FERRY_CAP,
      atPier: pier, fromPier: null, toPier: null, dwell: FERRY_DWELL,
      pax: [], staffPax: [], pts: null, seg: TILE, d: 0, len: 0,
      x: mp.x, z: mp.z, heading: mp.heading, y: 0, retire: false
    };
    ferries.push(f);
    return f;
  }

  function spawnServiceAt(pier) {
    var mp = moorPos(pier, 0, 1, false);
    var sb = {
      id: nextVid++, kind: 'service', net: pier.net, state: 'idle',
      atPier: pier, fromPier: null, toPier: null, staffId: 0,
      pickPier: null, destPier: null, fromTile: -1, toTile: -1,
      pts: null, seg: TILE, d: 0, len: 0,
      x: mp.x, z: mp.z, heading: mp.heading, y: 0, retire: false
    };
    serviceBoats.push(sb);
    return sb;
  }

  function targetFerriesForNet(net, guestPiers) {
    if (guestPiers.length < 2) return 0;
    var maxF = ferryMaxForNet(net);
    var best = 0;
    for (var k = 0; k < guestPiers.length; k++) {
      var fv = guestPiers[k].o.ferries;
      if (typeof fv === 'number' && fv >= 1) best = Math.max(best, Math.min(maxF, Math.round(fv)));
    }
    var n = best || 1;
    if (best > 0) {
      for (k = 0; k < guestPiers.length; k++) guestPiers[k].o.ferries = n;
    }
    return n;
  }

  function reconcileFleets() {
    var S = C.getS(), RT = C.getRT(), k;
    var guestNets = {}, svcNets = {}, allNets = {};
    for (k = 0; k < piers.length; k++) {
      var p = piers[k];
      allNets[p.net] = true;
      if (p.guest) (guestNets[p.net] || (guestNets[p.net] = [])).push(p);
      else (svcNets[p.net] || (svcNets[p.net] = [])).push(p);
    }

    // 1. Reconcile ferries
    var keptFerries = [];
    for (k = 0; k < ferries.length; k++) {
      var f = ferries[k];
      if (f.state === 'wait') {
        var atP = f.atPier ? pierById(f.atPier.o.id) : null;
        if (atP && atP.guest && guestNets[atP.net] && guestNets[atP.net].length >= 2) {
          f.atPier = atP; f.net = atP.net;
          f.large = netHasLargePier(f.net);
          f.cap = ferryCapForNet(f.net);
          // Ensure riders' destinations are still valid on this net
          for (var i = f.pax.length - 1; i >= 0; i--) {
            var px = f.pax[i], dp = pierById(px.b);
            if (!dp || !dp.guest || dp.net !== f.net) {
              landGuest(px.g, atP.o.id, atP.front);
              f.pax.splice(i, 1);
            }
          }
          for (i = f.staffPax.length - 1; i >= 0; i--) {
            var sp = f.staffPax[i], sdp = pierById(sp.toPierId);
            if (!sdp || !sdp.guest || sdp.net !== f.net) {
              landStaff(sp.s, atP.front, false, atP.front);
              f.staffPax.splice(i, 1);
            }
          }
          placeFerryRiders(f);
          keptFerries.push(f);
        } else {
          var fb = atP ? atP.front : nearestPathTile(f.x, f.z);
          for (i = 0; i < f.pax.length; i++) landGuest(f.pax[i].g, atP ? atP.o.id : 0, fb);
          for (i = 0; i < f.staffPax.length; i++) landStaff(f.staffPax[i].s, fb, false, fb);
        }
      } else {
        var fromP = f.fromPier ? pierById(f.fromPier.o.id) : null;
        var toP = f.toPier ? pierById(f.toPier.o.id) : null;
        if (toP && toP.guest && guestNets[toP.net] && guestNets[toP.net].length >= 2) {
          f.toPier = toP; f.fromPier = (fromP && fromP.net === toP.net) ? fromP : toP; f.net = toP.net;
          f.large = netHasLargePier(f.net);
          f.cap = ferryCapForNet(f.net);
          for (i = f.pax.length - 1; i >= 0; i--) {
            var px2 = f.pax[i], dp2 = pierById(px2.b);
            if (!dp2 || !dp2.guest || dp2.net !== f.net) px2.b = toP.o.id;
          }
          for (i = f.staffPax.length - 1; i >= 0; i--) {
            var sp2 = f.staffPax[i], sdp2 = pierById(sp2.toPierId);
            if (!sdp2 || !sdp2.guest || sdp2.net !== f.net) { sp2.toPierId = toP.o.id; sp2.to = toP.front; }
          }
          placeFerryRiders(f);
          keptFerries.push(f);
        } else if (fromP && fromP.guest && guestNets[fromP.net] && guestNets[fromP.net].length >= 2) {
          f.toPier = fromP; f.fromPier = fromP; f.net = fromP.net;
          f.large = netHasLargePier(f.net);
          f.cap = ferryCapForNet(f.net);
          reversePathFromCurrent(f, fromP);
          for (i = f.pax.length - 1; i >= 0; i--) {
            var px3 = f.pax[i], dp3 = pierById(px3.b);
            if (!dp3 || !dp3.guest || dp3.net !== f.net) px3.b = fromP.o.id;
          }
          for (i = f.staffPax.length - 1; i >= 0; i--) {
            var sp3 = f.staffPax[i], sdp3 = pierById(sp3.toPierId);
            if (!sdp3 || !sdp3.guest || sdp3.net !== f.net) { sp3.toPierId = fromP.o.id; sp3.to = fromP.front; }
          }
          placeFerryRiders(f);
          keptFerries.push(f);
        } else {
          var fb2 = toP ? toP.front : (fromP ? fromP.front : nearestPathTile(f.x, f.z));
          for (i = 0; i < f.pax.length; i++) landGuest(f.pax[i].g, toP ? toP.o.id : (fromP ? fromP.o.id : 0), fb2);
          for (i = 0; i < f.staffPax.length; i++) landStaff(f.staffPax[i].s, fb2, false, fb2);
        }
      }
    }
    ferries = keptFerries;

    for (var net in guestNets) {
      var gps = guestNets[net];
      var maxF = ferryMaxForNet(+net);
      if (gps.length < 2) {
        for (k = 0; k < gps.length; k++) {
          if (typeof gps[k].o.ferries === 'number') gps[k].o.ferries = Math.max(1, Math.min(maxF, Math.round(gps[k].o.ferries)));
        }
        continue;
      }
      var target = targetFerriesForNet(+net, gps);
      var cur = ferries.filter(function (x) { return x.net === +net && !x.retire; });
      if (cur.length < target) {
        while (cur.length < target) {
          // Pick guest pier with fewest docked ferries
          var counts = {};
          for (k = 0; k < gps.length; k++) counts[gps[k].o.id] = 0;
          for (k = 0; k < cur.length; k++) if (cur[k].atPier) counts[cur[k].atPier.o.id] = (counts[cur[k].atPier.o.id] || 0) + 1;
          var pick = gps[0];
          for (k = 1; k < gps.length; k++) if (counts[gps[k].o.id] < counts[pick.o.id]) pick = gps[k];
          cur.push(spawnFerryAt(pick));
        }
      } else if (cur.length > target) {
        var excess = cur.length - target;
        // First remove empty waiting ferries
        for (k = cur.length - 1; k >= 0 && excess > 0; k--) {
          if (cur[k].state === 'wait' && cur[k].pax.length === 0 && cur[k].staffPax.length === 0) {
            ferries.splice(ferries.indexOf(cur[k]), 1);
            cur.splice(k, 1);
            excess--;
          }
        }
        // Mark remaining excess to retire once empty
        for (k = cur.length - 1; k >= 0 && excess > 0; k--) {
          cur[k].retire = true;
          excess--;
        }
      }
    }

    // 2. Reconcile service boats
    var keptSvc = [];
    for (k = 0; k < serviceBoats.length; k++) {
      var sb = serviceBoats[k];
      if (sb.state === 'idle') {
        var satP = sb.atPier ? pierById(sb.atPier.o.id) : null;
        if (satP && svcNets[satP.net] && svcNets[satP.net].length > 0) {
          sb.atPier = satP; sb.net = satP.net;
          keptSvc.push(sb);
        }
      } else if (sb.state === 'fetch') {
        var sfromP = sb.fromPier ? pierById(sb.fromPier.o.id) : null;
        var spickP = sb.pickPier ? pierById(sb.pickPier.o.id) : null;
        if (spickP && svcNets[spickP.net] && svcNets[spickP.net].length > 0) {
          sb.pickPier = spickP; sb.toPier = spickP;
          sb.fromPier = (sfromP && sfromP.net === spickP.net) ? sfromP : spickP;
          sb.destPier = sb.destPier ? pierById(sb.destPier.o.id) : null;
          sb.net = spickP.net;
          keptSvc.push(sb);
        } else if (sfromP && svcNets[sfromP.net] && svcNets[sfromP.net].length > 0) {
          sb.pickPier = sfromP; sb.toPier = sfromP; sb.fromPier = sfromP; sb.staffId = 0; sb.net = sfromP.net;
          reversePathFromCurrent(sb, sfromP);
          keptSvc.push(sb);
        }
      } else { // 'sail'
        var stoP = sb.toPier ? pierById(sb.toPier.o.id) : null;
        var sfromP2 = sb.fromPier ? pierById(sb.fromPier.o.id) : null;
        var stf = sb.staffId ? RT.sById.get(sb.staffId) : null;
        if (stoP && svcNets[stoP.net] && svcNets[stoP.net].length > 0) {
          sb.toPier = stoP; sb.fromPier = (sfromP2 && sfromP2.net === stoP.net) ? sfromP2 : stoP;
          sb.toTile = stoP.front; sb.net = stoP.net;
          keptSvc.push(sb);
        } else if (sfromP2 && svcNets[sfromP2.net] && svcNets[sfromP2.net].length > 0) {
          sb.toPier = sfromP2; sb.fromPier = sfromP2; sb.toTile = sfromP2.front; sb.net = sfromP2.net;
          reversePathFromCurrent(sb, sfromP2);
          keptSvc.push(sb);
        } else {
          if (stf) landStaff(stf, -1, false, nearestPathTile(sb.x, sb.z));
        }
      }
    }
    serviceBoats = keptSvc;

    for (net in svcNets) {
      var sps = svcNets[net];
      var sTarget = Math.min(SERVICE_MAX_PER_NET, sps.length * SERVICE_PER_PIER);
      var sCur = serviceBoats.filter(function (x) { return x.net === +net && !x.retire; });
      if (sCur.length < sTarget) {
        while (sCur.length < sTarget) {
          var sCounts = {};
          for (k = 0; k < sps.length; k++) sCounts[sps[k].o.id] = 0;
          for (k = 0; k < sCur.length; k++) if (sCur[k].atPier) sCounts[sCur[k].atPier.o.id] = (sCounts[sCur[k].atPier.o.id] || 0) + 1;
          var spick = sps[0];
          for (k = 1; k < sps.length; k++) if (sCounts[sps[k].o.id] < sCounts[spick.o.id]) spick = sps[k];
          sCur.push(spawnServiceAt(spick));
        }
      } else if (sCur.length > sTarget) {
        var sExcess = sCur.length - sTarget;
        for (k = sCur.length - 1; k >= 0 && sExcess > 0; k--) {
          if (sCur[k].state === 'idle') {
            serviceBoats.splice(serviceBoats.indexOf(sCur[k]), 1);
            sCur.splice(k, 1);
            sExcess--;
          }
        }
        for (k = sCur.length - 1; k >= 0 && sExcess > 0; k--) {
          sCur[k].retire = true;
          sExcess--;
        }
      }
    }

    // Reconcile queued waiting staff references
    for (k = ferryStaffQueue.length - 1; k >= 0; k--) {
      var fq = ferryStaffQueue[k], fa = pierById(fq.a.o.id), fb = pierById(fq.b.o.id);
      if (!fa || !fb || fa.net !== fb.net || !fa.guest || !fb.guest) {
        if (fq.s && fq.s.hop && fq.s.hop.kind === 'ferry') fq.s.hop = null;
        ferryStaffQueue.splice(k, 1);
      } else {
        fq.a = fa; fq.b = fb;
      }
    }
    for (k = serviceQueue.length - 1; k >= 0; k--) {
      var sq = serviceQueue[k], sa = pierById(sq.a.o.id), sb2 = pierById(sq.b.o.id);
      if (!sa || !sb2 || sa.net !== sb2.net || !svcNets[sa.net] || !svcNets[sa.net].length) {
        if (sq.s && sq.s.hop && sq.s.hop.kind === 'service') sq.s.hop = null;
        serviceQueue.splice(k, 1);
      } else {
        sq.a = sa; sq.b = sb2; sq.net = sa.net;
      }
    }

    layoutDockedFleet();
  }

  function rebuild() {
    var S = C.getS(), RT = C.getRT(), N = C.getN(), NN = N * N, k, o, def;
    piers = []; pads = []; routes = {}; edges = {};
    for (k = 0; k < S.objects.length; k++) {
      o = S.objects[k]; if (o.kind !== 'building') continue;
      def = BD[o.type]; if (!def || !(def.boatPier || def.helipad)) continue;
      var front = frontTile(o);
      if (front < 0) continue;
      if (def.boatPier) {
        var water = waterBeside(o);
        if (water.length) piers.push({ o: o, guest: def.boatPier === 'guest', front: front, water: water, net: -1 });
      } else pads.push({ o: o, vip: def.helipad === 'vip', front: front });
    }
    RT.scomp = RT.comp; RT.gcomp = null; RT.jump = null;
    if (!piers.length && pads.length < 2) {
      reconcileFleets();
      return;
    }

    var lab = new Int16Array(NN).fill(-1), nets = 0, stack, t, i, j;
    for (k = 0; k < piers.length; k++) {
      var w0 = piers[k].water[0];
      if (lab[w0] < 0) {
        lab[w0] = nets; stack = [w0];
        while (stack.length) {
          t = stack.pop(); i = t % N; j = (t - i) / N;
          [i > 0 ? t - 1 : -1, i < N - 1 ? t + 1 : -1, j > 0 ? t - N : -1, j < N - 1 ? t + N : -1].forEach(function (n) {
            if (n >= 0 && lab[n] < 0 && S.terrain[n] === C.WATER) { lab[n] = nets; stack.push(n); }
          });
        }
        nets++;
      }
      piers[k].net = lab[w0];
    }

    var gParent = [], sParent = [];
    for (k = 0; k <= RT.compN; k++) { gParent[k] = k; sParent[k] = k; }
    function find(par, c) { while (par[c] !== c) { par[c] = par[par[c]]; c = par[c]; } return c; }
    function join(par, a, b) { a = find(par, a); b = find(par, b); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } }
    function link(a, b, kind, onlyStaff) {
      var ca = RT.comp[a.front], cb = RT.comp[b.front];
      if (ca === cb) return;
      if (!onlyStaff) join(gParent, ca, cb);
      join(sParent, ca, cb);
      var key = a.front + '>' + b.front;
      edges[key] = { kind: kind, a: a, b: b };
      (RT.jump || (RT.jump = {}))[a.front] = (RT.jump[a.front] || []).concat([b.front]);
    }
    var any = false;
    piers.forEach(function (a) {
      piers.forEach(function (b) {
        if (a === b || a.net !== b.net) return;
        link(a, b, 'boat', !(a.guest && b.guest));
      });
    });
    var staffPads = pads.filter(function (p) { return !p.vip; });
    staffPads.forEach(function (a) { staffPads.forEach(function (b) { if (a !== b) link(a, b, 'heli', true); }); });

    if (RT.jump) {
      var gc = new Uint16Array(RT.compN + 1), sc = new Uint16Array(NN);
      for (k = 1; k <= RT.compN; k++) { gc[k] = find(gParent, k); any = any || gc[k] !== k; }
      if (any) RT.gcomp = gc;
      for (t = 0; t < NN; t++) if (RT.comp[t]) sc[t] = find(sParent, RT.comp[t]);
      RT.scomp = sc;
    }

    reconcileFleets();
  }

  function plan(g, key) {
    if (!piers.length) return null;
    var RT = C.getRT(), tiles = C.sourcesFor(key), dest = {};
    if (!tiles) return null;
    tiles.forEach(function (t) { dest[RT.comp[t]] = true; });
    var leaving = g.state === 'leave', best = null;
    piers.forEach(function (a) {
      if (!a.guest) return;
      var fare = leaving ? 0 : fareOf(a.o), f = C.getField('t' + a.front);
      if (!f || !(f[g.ti] < INF)) return;
      if (fare > 0 && (fare > g.money * 0.6 || fare > Math.max(1, BD[a.o.type].price) * g.tol * 1.5)) return;
      piers.forEach(function (b) {
        if (b === a || !b.guest || b.net !== a.net || !dest[RT.comp[b.front]] || RT.comp[b.front] === RT.comp[a.front]) return;
        var r = route(a, b); if (!r) return;
        var dist = f[g.ti] + r.length;
        if (!best || dist < best.dist) best = { a: a.o.id, b: b.o.id, dist: dist };
      });
    });
    return best;
  }

  function start(g, p) {
    var A = oById(p.a), pa = pierById(p.a);
    g.pend = { state: g.state, gt: g.gt, gid: g.gid, dk: g.dk, spot: g.spot, pk: g.pk, b: p.b };
    g.gt = 'pier'; g.gid = A.id; g.dk = 't' + pa.front; g.ni = -1; g.gAge = 0;
  }

  function leave(g) {
    if (g.pend || g.state !== 'leave') return false;
    var p = plan(g, 'exit');
    if (!p) return false;
    g.gt = 'exit'; g.dk = 'exit';
    start(g, p);
    return true;
  }

  function board(g) {
    var RT = C.getRT(), pend = g.pend, A = oById(g.gid), B = pend && oById(pend.b);
    var pa = A ? pierById(A.id) : null, pb = B ? pierById(B.id) : null;
    var r = pa && pb && pa.guest && pb.guest && pa.net === pb.net && route(pa, pb);
    var fare = pend && pend.state === 'leave' ? 0 : (A ? fareOf(A) : 0);
    if (!r || g.money < fare) {
      g.gt = pend && pend.state === 'leave' ? 'exit' : '';
      g.dk = g.gt ? 'exit' : '';
      g.state = pend && pend.state === 'leave' ? 'leave' : 'walk';
      g.pend = null; g.ni = -1;
      return;
    }
    var q = RT.bq[A.id] || (RT.bq[A.id] = { use: 0, q: [] });
    if (q.q.indexOf(g.id) < 0) q.q.push(g.id);
    g.state = 'queue'; g.gt = 'pier'; g.gid = A.id; g.dk = '';
    g.wt = 0; g.speed = 0; g.glide = 0; g.ni = -1;
  }

  function queueLimit(g) {
    if (g && g.gt === 'pier') return (g.pend && g.pend.state === 'leave') ? Infinity : PIER_QUEUE_LIMIT;
    return 22;
  }

  function release(g) {
    if (!g) return;
    var RT = C.getRT(), k, i;
    for (k = 0; k < ferries.length; k++) {
      var f = ferries[k];
      for (i = f.pax.length - 1; i >= 0; i--) if (f.pax[i].g === g || f.pax[i].g.id === g.id) f.pax.splice(i, 1);
    }
    if (g.gt === 'pier' && g.gid) {
      var q = RT.bq[g.gid];
      if (q) { var qi = q.q.indexOf(g.id); if (qi >= 0) q.q.splice(qi, 1); }
    }
    g.pend = null; g.absY = null; g.boatY = 0;
  }

  function onPierRemoved(o) {
    if (!o) return;
    var S = C.getS(), RT = C.getRT(), k, i;
    var ftO = frontTile(o);
    for (k = 0; k < S.guests.length; k++) {
      var gu = S.guests[k];
      if (gu.state === 'boat') continue;
      if ((gu.gt === 'pier' && gu.gid === o.id) || (gu.pend && gu.pend.b === o.id)) {
        if (gu.state === 'queue' && gu.gid && RT.bq[gu.gid]) {
          var qi = RT.bq[gu.gid].q.indexOf(gu.id);
          if (qi >= 0) RT.bq[gu.gid].q.splice(qi, 1);
        }
        var wasLeave = gu.pend && gu.pend.state === 'leave';
        gu.pend = null;
        gu.state = wasLeave ? 'leave' : 'walk';
        gu.gt = wasLeave ? 'exit' : '';
        gu.dk = wasLeave ? 'exit' : '';
        gu.gid = 0; gu.ni = -1; gu.glide = 0;
      }
    }
    for (k = ferryStaffQueue.length - 1; k >= 0; k--) {
      var fq = ferryStaffQueue[k];
      if (fq.a.o === o || fq.b.o === o) {
        landStaff(fq.s, fq.from, false, ftO);
        ferryStaffQueue.splice(k, 1);
      }
    }
    for (k = serviceQueue.length - 1; k >= 0; k--) {
      var sq = serviceQueue[k];
      if (sq.a.o === o || sq.b.o === o) {
        landStaff(sq.s, sq.from, false, ftO);
        serviceQueue.splice(k, 1);
      }
    }
    for (k = ferries.length - 1; k >= 0; k--) {
      var f = ferries[k];
      if (f.state === 'wait') {
        if (f.atPier && f.atPier.o === o) {
          for (i = 0; i < f.pax.length; i++) landGuest(f.pax[i].g, 0, ftO);
          for (i = 0; i < f.staffPax.length; i++) landStaff(f.staffPax[i].s, ftO, false, ftO);
          f.pax = []; f.staffPax = [];
          ferries.splice(k, 1);
        } else if (f.atPier) {
          for (i = f.pax.length - 1; i >= 0; i--) {
            if (f.pax[i].b === o.id) {
              landGuest(f.pax[i].g, f.atPier.o.id, f.atPier.front);
              f.pax.splice(i, 1);
            }
          }
          for (i = f.staffPax.length - 1; i >= 0; i--) {
            if (f.staffPax[i].toPierId === o.id) {
              landStaff(f.staffPax[i].s, f.atPier.front, false, f.atPier.front);
              f.staffPax.splice(i, 1);
            }
          }
        }
      } else if (f.state === 'sail') {
        if (f.toPier && f.toPier.o === o) {
          if (f.fromPier && f.fromPier.o !== o && frontTile(f.fromPier.o) >= 0) {
            var retPier = f.fromPier;
            reversePathFromCurrent(f, retPier);
            f.toPier = retPier;
            for (i = 0; i < f.pax.length; i++) {
              if (f.pax[i].b === o.id) {
                f.pax[i].b = retPier.o.id;
                if (f.pax[i].g && f.pax[i].g.pend && f.pax[i].g.pend.state !== 'leave') {
                  f.pax[i].g.pend = { state: 'walk', gt: '', gid: 0, dk: '', spot: 0, pk: '', b: retPier.o.id };
                }
              }
            }
            for (i = 0; i < f.staffPax.length; i++) {
              if (f.staffPax[i].toPierId === o.id) {
                f.staffPax[i].toPierId = retPier.o.id;
                f.staffPax[i].to = retPier.front;
              }
            }
          } else {
            for (i = 0; i < f.pax.length; i++) landGuest(f.pax[i].g, 0, ftO);
            for (i = 0; i < f.staffPax.length; i++) landStaff(f.staffPax[i].s, ftO, false, ftO);
            f.pax = []; f.staffPax = [];
            ferries.splice(k, 1);
          }
        } else if (f.toPier) {
          for (i = 0; i < f.pax.length; i++) if (f.pax[i].b === o.id) f.pax[i].b = f.toPier.o.id;
          for (i = 0; i < f.staffPax.length; i++) if (f.staffPax[i].toPierId === o.id) { f.staffPax[i].toPierId = f.toPier.o.id; f.staffPax[i].to = f.toPier.front; }
        }
      }
    }
    for (k = serviceBoats.length - 1; k >= 0; k--) {
      var sb = serviceBoats[k];
      if (sb.state === 'idle' && sb.atPier && sb.atPier.o === o) {
        serviceBoats.splice(k, 1);
      } else if (sb.state === 'fetch' && ((sb.pickPier && sb.pickPier.o === o) || (sb.fromPier && sb.fromPier.o === o))) {
        sb.staffId = 0;
        serviceBoats.splice(k, 1);
      } else if (sb.state === 'sail' && ((sb.toPier && sb.toPier.o === o) || (sb.fromPier && sb.fromPier.o === o))) {
        var stf = sb.staffId ? RT.sById.get(sb.staffId) : null;
        if (sb.toPier && sb.toPier.o === o && sb.fromPier && sb.fromPier.o !== o && frontTile(sb.fromPier.o) >= 0) {
          if (stf) landStaff(stf, sb.fromPier.front, false, sb.fromPier.front);
        } else if (stf) {
          landStaff(stf, ftO, false, ftO);
        }
        sb.staffId = 0;
        serviceBoats.splice(k, 1);
      }
    }
  }

  function countFerryStaffAt(pier) {
    var n = 0;
    for (var k = 0; k < ferryStaffQueue.length; k++) if (ferryStaffQueue[k].a === pier) n++;
    return n;
  }

  function ferryQueueSize(pier) {
    var RT = C.getRT(), q = RT.bq[pier.o.id];
    return (q ? q.q.length : 0) + countFerryStaffAt(pier);
  }

  function departFerry(f, toPier) {
    var r = route(f.atPier, toPier);
    if (!r) return false;
    f.state = 'sail';
    f.fromPier = f.atPier;
    f.toPier = toPier;
    f.atPier = null;
    f.pts = waterPoints(r);
    f.seg = TILE;
    f.d = 0;
    f.len = TILE * (f.pts.length - 1);
    place(f);
    placeFerryRiders(f);
    return true;
  }

  function stepFerries(dt) {
    var S = C.getS(), RT = C.getRT(), k, i;

    // Clean stale staff in ferryStaffQueue
    for (k = ferryStaffQueue.length - 1; k >= 0; k--) {
      var fq = ferryStaffQueue[k], s = fq.s;
      if (!s || !RT.sById.has(s.id) || s.sickUntil > S.day + S.time || !s.route || s.ri >= s.route.length || s.route[s.ri] !== fq.to || s.ti !== fq.from) {
        if (s && s.hop && s.hop.kind === 'ferry') s.hop = null;
        ferryStaffQueue.splice(k, 1);
      }
    }

    for (k = ferries.length - 1; k >= 0; k--) {
      var f = ferries[k];
      // Prune invalid passengers/staff
      for (i = f.pax.length - 1; i >= 0; i--) {
        var g = f.pax[i].g;
        if (!g || !RT.gById.has(g.id) || g.state !== 'boat') f.pax.splice(i, 1);
      }
      for (i = f.staffPax.length - 1; i >= 0; i--) {
        var sp = f.staffPax[i];
        if (!sp.s || !RT.sById.has(sp.s.id) || sp.s.state !== 'boat') f.staffPax.splice(i, 1);
      }

      if (f.state === 'wait') {
        var atP = f.atPier;
        if (!atP) { ferries.splice(k, 1); continue; }
        if (f.retire && f.pax.length === 0 && f.staffPax.length === 0) {
          ferries.splice(k, 1);
          continue;
        }
        var hadRiders = (f.pax.length + f.staffPax.length) > 0;
        var cap = f.cap || ferryCapForNet(f.net);
        if (!f.retire) {
          // Board queuing guests FIFO up to cap
          var q = RT.bq[atP.o.id];
          while ((f.pax.length + f.staffPax.length) < cap && q && q.q.length) {
            var gid = q.q.shift();
            var qg = RT.gById.get(gid);
            if (!qg || qg.state !== 'queue' || qg.gt !== 'pier' || qg.gid !== atP.o.id) continue;
            var pend = qg.pend, B = pend && oById(pend.b), pb = B ? pierById(B.id) : null;
            var r = pb && pb !== atP && pb.guest && pb.net === f.net && route(atP, pb);
            var fare = pend && pend.state === 'leave' ? 0 : fareOf(atP.o);
            if (!r || qg.money < fare) {
              qg.gt = pend && pend.state === 'leave' ? 'exit' : '';
              qg.dk = qg.gt ? 'exit' : '';
              qg.state = pend && pend.state === 'leave' ? 'leave' : 'walk';
              qg.pend = null; qg.gid = 0; qg.ni = -1; qg.glide = 0; qg.boatY = 0;
              continue;
            }
            if (fare > 0) {
              qg.money -= fare; qg.spent += fare;
              C.earn(fare, 'boats', qg.x, qg.z);
              atP.o.income = (atP.o.income || 0) + fare;
              S.boats.income += fare;
            }
            atP.o.uses = (atP.o.uses || 0) + 1;
            S.boats.trips++;
            var seat = nextFreeSeat(f);
            qg.state = 'boat'; qg.gt = ''; qg.dk = ''; qg.speed = 0; qg.glide = 0; qg.ni = -1;
            f.pax.push({ g: qg, b: B.id, seat: seat });
          }

          // Board waiting staff at this guest pier for free
          for (i = 0; i < ferryStaffQueue.length && (f.pax.length + f.staffPax.length) < cap; ) {
            var item = ferryStaffQueue[i];
            if (item.a === atP && item.b && item.b.guest && item.b.net === f.net) {
              ferryStaffQueue.splice(i, 1);
              var sSeat = nextFreeSeat(f);
              item.s.state = 'boat'; item.s.speed = 0; item.s.absY = null; item.s.boatY = 0;
              f.staffPax.push({ s: item.s, from: item.from, to: item.to, toPierId: item.b.o.id, seat: sSeat });
            } else {
              i++;
            }
          }
        }

        var total = f.pax.length + f.staffPax.length;
        if (!hadRiders && total > 0) f.dwell = FERRY_DWELL;

        if (total >= cap) {
          var destId = f.pax.length ? f.pax[0].b : f.staffPax[0].toPierId;
          var destP = pierById(destId);
          if (destP && destP !== atP) departFerry(f, destP);
        } else if (total > 0) {
          f.dwell -= dt;
          if (f.dwell <= 0) {
            var destId2 = f.pax.length ? f.pax[0].b : f.staffPax[0].toPierId;
            var destP2 = pierById(destId2);
            if (destP2 && destP2 !== atP) departFerry(f, destP2);
          }
        } else if (!f.retire) {
          // Empty idle ferry: check if another guest pier on this net needs pickup
          var bestPier = null, bestQ = 0;
          for (i = 0; i < piers.length; i++) {
            var p = piers[i];
            if (!p.guest || p.net !== f.net || p === atP) continue;
            var pq = ferryQueueSize(p);
            if (pq <= 0) continue;
            var served = false;
            for (var j = 0; j < ferries.length; j++) {
              var other = ferries[j];
              if (other === f || other.net !== f.net) continue;
              if ((other.state === 'wait' && other.atPier === p) || (other.state === 'sail' && other.toPier === p)) {
                served = true; break;
              }
            }
            if (!served && pq > bestQ) { bestQ = pq; bestPier = p; }
          }
          if (bestPier) departFerry(f, bestPier);
        }
      } else { // 'sail'
        f.d += ferrySpeedForNet(f.net) * dt;
        place(f);
        placeFerryRiders(f);
        if (f.d >= f.len) {
          var toP = f.toPier;
          for (i = f.pax.length - 1; i >= 0; i--) {
            if (f.pax[i].b === toP.o.id) {
              landGuest(f.pax[i].g, toP.o.id, toP.front);
              f.pax.splice(i, 1);
            }
          }
          for (i = f.staffPax.length - 1; i >= 0; i--) {
            var sp2 = f.staffPax[i];
            if (sp2.toPierId === toP.o.id || sp2.to === toP.front) {
              landStaff(sp2.s, sp2.to, true, toP.front);
              f.staffPax.splice(i, 1);
            }
          }
          f.state = 'wait';
          f.atPier = toP; f.fromPier = null; f.toPier = null;
          f.dwell = FERRY_DWELL; f.pts = null; f.seg = TILE; f.d = 0; f.len = 0;
          if (f.retire && f.pax.length === 0 && f.staffPax.length === 0) {
            ferries.splice(k, 1);
          }
        }
      }
    }

    layoutDockedFleet();
  }

  function serviceBoatsInNet(net) {
    var out = [];
    for (var k = 0; k < serviceBoats.length; k++) if (serviceBoats[k].net === net) out.push(serviceBoats[k]);
    return out;
  }

  function boardServiceBoat(sb, s, aPier, bPier, fromTile, toTile) {
    var r = route(aPier, bPier);
    if (!r) return false;
    sb.state = 'sail';
    sb.atPier = null;
    sb.fromPier = aPier;
    sb.toPier = bPier;
    sb.pickPier = null;
    sb.destPier = null;
    sb.staffId = s.id;
    sb.fromTile = fromTile;
    sb.toTile = toTile;
    sb.pts = waterPoints(r);
    sb.seg = TILE;
    sb.d = 0;
    sb.len = TILE * (sb.pts.length - 1);
    place(sb);
    s.state = 'boat'; s.x = sb.x; s.z = sb.z; s.heading = sb.heading; s.speed = 0; s.absY = null; s.boatY = 0;
    return true;
  }

  function dispatchServiceFetch(sb, pickPier, staffId) {
    var r = route(sb.atPier, pickPier);
    if (!r) return false;
    sb.state = 'fetch';
    sb.fromPier = sb.atPier;
    sb.toPier = pickPier;
    sb.pickPier = pickPier;
    sb.destPier = null;
    sb.atPier = null;
    sb.staffId = staffId || 0;
    sb.pts = waterPoints(r);
    sb.seg = TILE;
    sb.d = 0;
    sb.len = TILE * (sb.pts.length - 1);
    place(sb);
    return true;
  }

  function isStaffBeingFetched(staffId) {
    for (var k = 0; k < serviceBoats.length; k++) {
      var sb = serviceBoats[k];
      if (sb.state === 'fetch' && sb.staffId === staffId) return true;
    }
    return false;
  }

  function assignNextServiceTask(sb) {
    var atP = sb.atPier, k, item;
    if (!atP) return;
    // Prefer waiting staff at current pier (FIFO)
    for (k = 0; k < serviceQueue.length; k++) {
      item = serviceQueue[k];
      if (item.net === sb.net && item.a === atP) {
        serviceQueue.splice(k, 1);
        if (boardServiceBoat(sb, item.s, item.a, item.b, item.from, item.to)) return;
      }
    }
    // Otherwise fetch any waiting staff on this net not already being fetched
    for (k = 0; k < serviceQueue.length; k++) {
      item = serviceQueue[k];
      if (item.net === sb.net && item.a !== atP && !isStaffBeingFetched(item.s.id)) {
        if (dispatchServiceFetch(sb, item.a, item.s.id)) return;
      }
    }
    sb.state = 'idle'; sb.staffId = 0; sb.pickPier = null; sb.destPier = null;
  }

  function stepServiceBoats(dt) {
    var S = C.getS(), RT = C.getRT(), k;

    // Clean stale waiting staff in serviceQueue
    for (k = serviceQueue.length - 1; k >= 0; k--) {
      var sq = serviceQueue[k], s = sq.s;
      if (!s || !RT.sById.has(s.id) || s.sickUntil > S.day + S.time || !s.route || s.ri >= s.route.length || s.route[s.ri] !== sq.to || s.ti !== sq.from || s.state === 'boat') {
        if (s && s.hop && s.hop.kind === 'service' && s.state !== 'boat') s.hop = null;
        serviceQueue.splice(k, 1);
      }
    }

    for (k = serviceBoats.length - 1; k >= 0; k--) {
      var sb = serviceBoats[k];
      if (sb.state === 'idle') {
        if (sb.retire) { serviceBoats.splice(k, 1); continue; }
        assignNextServiceTask(sb);
      } else if (sb.state === 'fetch') {
        sb.d += SERVICE_SPEED * dt;
        place(sb);
        if (sb.d >= sb.len) {
          sb.atPier = sb.pickPier;
          sb.fromPier = null; sb.toPier = null; sb.pickPier = null; sb.destPier = null;
          sb.pts = null; sb.seg = TILE; sb.d = 0; sb.len = 0;
          if (sb.retire) { serviceBoats.splice(k, 1); continue; }
          assignNextServiceTask(sb);
        }
      } else { // 'sail'
        var stf = sb.staffId ? RT.sById.get(sb.staffId) : null;
        if (!stf) sb.staffId = 0;
        sb.d += SERVICE_SPEED * dt;
        place(sb);
        if (stf && stf.state === 'boat') {
          stf.x = sb.x; stf.z = sb.z; stf.heading = sb.heading; stf.speed = 0; stf.absY = null; stf.boatY = 0;
        }
        if (sb.d >= sb.len) {
          var toP = sb.toPier;
          if (stf) landStaff(stf, sb.toTile, true, toP.front);
          sb.staffId = 0; sb.atPier = toP;
          sb.fromPier = null; sb.toPier = null; sb.pts = null; sb.seg = TILE; sb.d = 0; sb.len = 0;
          if (sb.retire) { serviceBoats.splice(k, 1); continue; }
          assignNextServiceTask(sb);
        }
      }
    }

    layoutDockedFleet();
  }

  function newTrip(pts, seg, kind) {
    var tr = { id: nextVid++, kind: kind, pts: pts, seg: seg, d: 0, len: seg * (pts.length - 1), x: pts[0].x, z: pts[0].z, heading: 0, y: 0 };
    trips.push(tr);
    return tr;
  }

  function staffHop(s, t, dt) {
    var N = C.getN(), from = s.ti, di = Math.abs((t % N) - (from % N)), dj = Math.abs(Math.floor(t / N) - Math.floor(from / N));
    if (di + dj <= 1) { s.hop = null; s.absY = null; return false; }
    var e = edges[from + '>' + t];
    if (!e) { C.releaseClaims(s); s.tk = null; s.route = null; s.state = 'idle'; s.wt = 0; s.x = C.cxOf(from); s.z = C.czOf(from); s.hop = null; s.absY = null; return true; }

    if (e.kind === 'heli') {
      var tr = s.hop;
      if (!tr || tr.kind !== 'heli' || tr.from !== from || tr.to !== t) {
        var ca = centreOf(e.a.o), cb = centreOf(e.b.o), pts = [ca, cb];
        tr = s.hop = newTrip(pts, Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z)), 'heli');
        tr.from = from; tr.to = t; tr.staff = true; tr.age = 0;
      }
      tr.age = 0; tr.d += HELI_SPEED * dt; place(tr);
      s.x = tr.x; s.z = tr.z; s.heading = tr.heading; s.speed = 0;
      s.state = 'fly'; s.absY = tr.y;
      if (tr.d >= tr.len) {
        s.x = C.cxOf(t); s.z = C.czOf(t); s.ti = t; s.ri++; s.hop = null; s.absY = null; s.state = 'walk';
        trips.splice(trips.indexOf(tr), 1);
      }
      return true;
    }

    // e.kind === 'boat'
    if (s.state === 'boat') return true;
    var svcs = serviceBoatsInNet(e.a.net);
    if (e.a.guest && e.b.guest && svcs.length === 0) {
      if (!s.hop || s.hop.kind !== 'ferry' || s.hop.from !== from || s.hop.to !== t) {
        s.hop = { kind: 'ferry', from: from, to: t, a: e.a, b: e.b };
        var alreadyF = false;
        for (var fk = 0; fk < ferryStaffQueue.length; fk++) if (ferryStaffQueue[fk].s === s) { alreadyF = true; break; }
        if (!alreadyF) ferryStaffQueue.push({ s: s, a: e.a, b: e.b, from: from, to: t });
      }
      s.state = 'idle'; s.speed = 0; s.x = C.cxOf(from); s.z = C.czOf(from); s.absY = null;
      return true;
    }

    // Use capped service boat fleet
    if (s.hop && s.hop.kind === 'service' && s.hop.from === from && s.hop.to === t) {
      s.state = 'idle'; s.speed = 0; s.x = C.cxOf(from); s.z = C.czOf(from); s.absY = null;
      return true;
    }
    s.hop = { kind: 'service', from: from, to: t, a: e.a, b: e.b };
    var k, idleHere = null, idleOther = null;
    for (k = 0; k < svcs.length; k++) {
      if (svcs[k].state === 'idle' && !svcs[k].retire) {
        if (svcs[k].atPier === e.a) { idleHere = svcs[k]; break; }
        if (!idleOther) idleOther = svcs[k];
      }
    }
    if (idleHere) {
      boardServiceBoat(idleHere, s, e.a, e.b, from, t);
      return true;
    }
    for (k = serviceQueue.length - 1; k >= 0; k--) if (serviceQueue[k].s === s) serviceQueue.splice(k, 1);
    serviceQueue.push({ s: s, a: e.a, b: e.b, from: from, to: t, net: e.a.net });
    if (idleOther) dispatchServiceFetch(idleOther, e.a, s.id);
    s.state = 'idle'; s.speed = 0; s.x = C.cxOf(from); s.z = C.czOf(from); s.absY = null;
    return true;
  }

  function padPos(p) {
    var c = centreOf(p.o);
    return { x: c.x, z: c.z, y: C.heightAt(c.x, c.z) + PAD_Y };
  }
  function addHeli(p, extra) {
    var pos = padPos(p), h = { id: nextVid++, kind: 'vip', pad: p.o.id, x: pos.x, z: pos.z, baseY: pos.y, y: pos.y + HELI_ALT, heading: 0, t: 0, gid: 0 };
    for (var k in extra) h[k] = extra[k];
    helis.push(h);
    return h;
  }
  function padOf(id) {
    for (var k = 0; k < pads.length; k++) if (pads[k].o.id === id) return pads[k];
    return null;
  }

  function vipLeave(g) {
    var best = null, bd = INF;
    pads.forEach(function (p) {
      if (!p.vip) return;
      var f = C.getField('t' + p.front);
      if (f && f[g.ti] < bd) { bd = f[g.ti]; best = p; }
    });
    if (!best) return;
    g.gt = 'pad'; g.gid = best.o.id; g.dk = 't' + best.front; g.padT = 0;
  }
  function liftOff(g) {
    var p = padOf(g.gid);
    if (!p) { g.gt = 'exit'; g.dk = 'exit'; return; }
    var h = addHeli(p, { phase: 'board', gid: g.id, y: padPos(p).y });
    g.state = 'fly'; g.gt = ''; g.dk = ''; g.speed = 0; g.ni = -1;
    g.x = h.x; g.z = h.z; g.absY = h.y;
  }

  function vipCount() {
    var n = 0, gs = C.getS().guests;
    for (var k = 0; k < gs.length; k++) if (gs[k].vip) n++;
    return n;
  }
  function stepHelis(dt) {
    var S = C.getS(), RT = C.getRT();
    for (var k = helis.length - 1; k >= 0; k--) {
      var h = helis[k], g = h.gid ? RT.gById.get(h.gid) : null;
      h.t += dt;
      if (h.phase === 'land') {
        h.y = h.baseY + HELI_ALT * Math.max(0, 1 - h.t / LAND_T);
        if (h.t >= LAND_T) {
          var p = padOf(h.pad), v = p && C.spawnGuest(RT.nextGroup++, false, { t: p.front, x: h.x, z: h.z, fee: fareOf(p.o) });
          if (v) { p.o.uses = (p.o.uses || 0) + 1; p.o.income = (p.o.income || 0) + fareOf(p.o); S.boats.vips++; S.boats.vipIncome += fareOf(p.o); }
          h.phase = 'wait'; h.t = 0;
        }
      } else if (h.phase === 'wait') {
        if (h.t >= WAIT_T) { h.phase = 'climb'; h.t = 0; }
      } else if (h.phase === 'board') {
        if (!g || g.state !== 'fly') { helis.splice(k, 1); continue; }
        if (h.t >= BOARD_T) { h.phase = 'climb'; h.t = 0; }
      } else if (h.phase === 'climb') {
        h.y = h.baseY + HELI_ALT * Math.min(1, h.t / CLIMB_T);
        if (g && g.state === 'fly') g.absY = h.y;
        if (h.t >= CLIMB_T) {
          if (g && g.state === 'fly') C.removeGuest(g);
          helis.splice(k, 1);
        }
      }
      h.heading += dt * 0.3;
    }
  }

  function step(dt) {
    var S = C.getS(), k;
    stepFerries(dt);
    stepServiceBoats(dt);
    for (k = trips.length - 1; k >= 0; k--) {
      var tr = trips[k];
      if (tr.staff) { tr.age += dt; if (tr.age > 1) trips.splice(k, 1); continue; }
      trips.splice(k, 1);
    }
    stepHelis(dt);

    scanT += dt;
    if (scanT >= 1) {
      scanT = 0;
      for (k = 0; k < S.guests.length; k++) {
        var vg = S.guests[k];
        if (vg.vip && vg.gt === 'pad' && ++vg.padT > 90) { vg.gt = 'exit'; vg.dk = 'exit'; }
      }
    }

    var open = pads.filter(function (p) { return p.vip && C.isParkConnected(p.front); });
    if (!open.length || !C.openNow()) return;
    S.boats.vipT -= dt;
    if (S.boats.vipT > 0) return;
    S.boats.vipT = C.gxHr() * C.rng.range(2.5, 4.5);
    if (vipCount() + helis.length >= VIP_MAX_PER_PAD * open.length) return;
    var pad = open[Math.floor(C.rng.next() * open.length)];
    addHeli(pad, { phase: 'land' });
  }

  function afterLoad() {
    var S = C.getS();
    ferries = []; serviceBoats = []; ferryStaffQueue = []; serviceQueue = []; trips = []; helis = [];
    S.guests.forEach(function (g) { g.pend = null; g.absY = null; g.boatY = 0; });
    S.staff.forEach(function (s) { s.hop = null; s.absY = null; s.boatY = 0; });
    rebuild();
  }

  function connected(o) {
    return piers.some(function (p) { return p.o === o; }) ||
      pads.some(function (p) { return p.o === o && (!p.vip || C.isParkConnected(p.front)); });
  }

  function setFerries(pierId, n) {
    var p = pierById(pierId);
    if (!p || !p.guest) return { ok: false, msg: 'Guest pier not found' };
    var maxF = ferryMaxForNet(p.net);
    var count = Math.max(1, Math.min(maxF, Math.round(+n || 1)));
    for (var k = 0; k < piers.length; k++) {
      if (piers[k].guest && piers[k].net === p.net) piers[k].o.ferries = count;
    }
    reconcileFleets();
    return { ok: true, ferries: count };
  }

  function linkedCount(o) {
    var n = 0, p = null;
    piers.forEach(function (x) { if (x.o === o) p = x; });
    if (p) piers.forEach(function (x) { if (x !== p && x.net === p.net && (x.guest || !p.guest)) n++; });
    else pads.forEach(function (x) { if (x.o !== o && !x.vip && BD[o.type].helipad === 'staff') n++; });
    return n;
  }

  function pierStats(o) {
    var RT = C.getRT(), p = o ? pierById(o.id) : null, linked = linkedCount(o);
    var isLargePier = !!(o && BD[o.type] && BD[o.type].largePier);
    if (!p) {
      var defMax = isLargePier ? LARGE_FERRY_MAX : FERRY_MAX;
      return {
        linked: linked, ferries: o && o.ferries ? Math.max(1, Math.min(defMax, o.ferries)) : 1,
        ferryMax: defMax, maxFerries: defMax,
        capacity: isLargePier ? LARGE_FERRY_CAP : FERRY_CAP,
        largeNet: isLargePier, isLargePier: isLargePier,
        queueing: 0, serviceAvail: 0, serviceTotal: 0, staffWaiting: 0,
        serviceMax: SERVICE_MAX_PER_NET, servicePerPier: SERVICE_PER_PIER
      };
    }
    if (p.guest) {
      var maxF = ferryMaxForNet(p.net), cap = ferryCapForNet(p.net), largeNet = netHasLargePier(p.net);
      var q = RT.bq[o.id];
      var fCount = 0;
      for (var k = 0; k < ferries.length; k++) if (ferries[k].net === p.net && !ferries[k].retire) fCount++;
      var configured = Math.max(1, Math.min(maxF, o.ferries || (fCount > 0 ? fCount : 1)));
      return {
        linked: linked, ferries: fCount || configured, configuredFerries: configured,
        ferryMax: maxF, maxFerries: maxF, capacity: cap, largeNet: largeNet, isLargePier: isLargePier,
        queueing: q ? q.q.length : 0,
        serviceAvail: 0, serviceTotal: 0, staffWaiting: 0,
        serviceMax: SERVICE_MAX_PER_NET, servicePerPier: SERVICE_PER_PIER
      };
    }
    var svcs = serviceBoatsInNet(p.net), avail = 0, total = 0, waiting = 0;
    for (var i = 0; i < svcs.length; i++) {
      if (svcs[i].retire) continue;
      total++;
      if (svcs[i].state === 'idle') avail++;
    }
    for (i = 0; i < serviceQueue.length; i++) if (serviceQueue[i].a === p) waiting++;
    return {
      linked: linked, ferries: 0, ferryMax: FERRY_MAX, maxFerries: FERRY_MAX, capacity: FERRY_CAP,
      largeNet: false, isLargePier: false, queueing: 0,
      serviceAvail: avail, serviceTotal: total, staffWaiting: waiting,
      serviceMax: SERVICE_MAX_PER_NET, servicePerPier: SERVICE_PER_PIER
    };
  }

  Z.Boats = {
    FERRY_SPEED: FERRY_SPEED, LARGE_FERRY_SPEED: LARGE_FERRY_SPEED, SERVICE_SPEED: SERVICE_SPEED,
    FERRY_CAP: FERRY_CAP, LARGE_FERRY_CAP: LARGE_FERRY_CAP,
    FERRY_DWELL: FERRY_DWELL, FERRY_MAX: FERRY_MAX, LARGE_FERRY_MAX: LARGE_FERRY_MAX,
    SERVICE_PER_PIER: SERVICE_PER_PIER, SERVICE_MAX_PER_NET: SERVICE_MAX_PER_NET, PIER_QUEUE_LIMIT: PIER_QUEUE_LIMIT,
    rebuild: rebuild, placeCheck: placeCheck, plan: plan, start: start, board: board, leave: leave,
    queueLimit: queueLimit, release: release, onPierRemoved: onPierRemoved,
    staffHop: staffHop, vipLeave: vipLeave, liftOff: liftOff, step: step, afterLoad: afterLoad,
    connected: connected, setFerries: setFerries, pierStats: pierStats,
    vehicles: function () { return ferries.concat(serviceBoats, trips, helis); },
    linkedCount: linkedCount
  };
})();
