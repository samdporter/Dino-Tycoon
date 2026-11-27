// ===== 24-sim-monorail.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - monorail package, sim side (DOM-free, runs under node).  See notes/monorail.md.
   SAVED state:  S.rail  Uint8Array(N*N)  connection bits per track tile (1 N(-z), 2 E(+x), 4 S(+z), 8 W(-x)); station tiles store nothing (implicit).
                 S.mono  { trains:[{id,home,cars,s,dir,st,dw,v,brk,why,lane,paid}], nextTrain, nameN, powered, stats{riders,income,boardings,viewSec,breakdowns,lightning,danger} }
                 station objects (D.buildings 'monorail_station', data flags mono:true, needsPower:true) carry fare, mfree, mpause, mname, mrides, minc, mtoday, mday, msat.
                 riding guests: state 'ride' + rtr (train id) rseat rdst rfrom rpass rtour rthen rend.
   DERIVED (never saved, rebuilt by update() from the rail layer + terrain + objects): track graph, lines (open chain or closed loop), heights, pylons, polylines,
   per-node overlooked enclosures.  Hooks in 20-sim.js call into Z.Monorail (guarded with `Z.Monorail &&`).
   Public hooks for later packages (also on Z.Sim.monorail): setPowered(bool)/isPowered(), viewBonus(encId), overlooks(encId), overlookedBy(lineKey), footprintOverlooks(tiles),
   registerOverlook(fn(tile)->encId), lines(), stationInfo(id), trainInfo(id). */
(function () {
  'use strict';
  var C = Z.monoCtx; if (!C) return;
  var N = Z.N, NN = N * N, EW = N + 1, TILE = Z.TILE, D = Z.DATA, MD = D.monorail, bus = Z.bus, rng = Z.rng, clamp = C.clamp, fail = C.fail, okr = C.okr, INF = C.INF;
  var DT4 = [-N, 1, N, -1], PI = Math.PI, TAU = PI * 2;
  if (bus && bus.on) bus.on('gridsize', function (n) { N = n; NN = n * n; EW = n + 1; DT4[0] = -n; DT4[2] = n; });
  var M = Z.Monorail = {};
  if (Z.Sim) Z.Sim.monorail = M;
  function S() { return C.S(); }
  function RT() { return C.RT(); }
  function BD() { return C.BD(); }
  var WIDX = -2;
  function waterIdx() { if (WIDX === -2) WIDX = D.terrain.findIndex(function (q) { return q.id === 'water'; }); return WIDX; }
  var NAMES = ['Amber', 'Fern', 'Ginkgo', 'Cycad', 'Lagoon', 'Ridge', 'Meadow', 'Delta', 'Quarry', 'Summit', 'Harbour', 'Orchard', 'Basin', 'Heath', 'Coppice', 'Estuary', 'Glade', 'Moraine', 'Bluff', 'Spinney'];
  var overlookSources = [];
  M.overlookSources = overlookSources;
  M.registerOverlook = function (fn) { if (typeof fn === 'function' && overlookSources.indexOf(fn) < 0) overlookSources.push(fn); };

  // ============================================================ small helpers
  function ti(t) { return t % N; }
  function tj(t) { return (t - (t % N)) / N; }
  function tcx(t) { return (t % N + 0.5) * TILE; }
  function tcz(t) { return (((t - (t % N)) / N) + 0.5) * TILE; }
  function opp(d) { return (d + 2) & 3; }
  function dirOf(a, b) { var df = b - a; return df === -N ? 0 : df === 1 ? 1 : df === N ? 2 : df === -1 ? 3 : -1; }
  function cmax(t) { var E = S().elev, c = (t % N) + ((t - (t % N)) / N) * EW, a = E[c], b = E[c + 1], d = E[c + EW], e = E[c + EW + 1]; return Math.max(a, b, d, e) * Z.ELEV_STEP; }
  function cmean(t) { var E = S().elev, c = (t % N) + ((t - (t % N)) / N) * EW; return (E[c] + E[c + 1] + E[c + EW] + E[c + EW + 1]) * 0.25 * Z.ELEV_STEP; }
  function isWater(t) { return S().terrain[t] === waterIdx(); }
  function lerpAng(a, b, f) { var d = b - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return a + d * f; }
  function fareOf(o) { return o.mfree ? 0 : (o.fare === undefined ? MD.fare : o.fare); }
  function stationName(o) { return o.mname || ('Station ' + o.id); }
  function now() { var s = S(); return s.day + s.time; }

  // ============================================================ derived graph
  var X = emptyX();
  var TR = {};            // runtime per train id: {line, ov, pax[], anchor, prevAnchor, pose[], ...}
  function emptyX() {
    return { ver: 0, hash: 0, stations: [], stAt: new Int16Array(NN).fill(-1), stPos: new Int8Array(NN), deg: new Uint8Array(NN), h: new Float32Array(NN), nodeLine: new Int16Array(NN).fill(-1),
      nodeK: new Int16Array(NN).fill(-1), lines: [], bad: [], ops: 0 };
  }
  function stationList(s) {
    var out = [], B = BD();
    for (var k = 0; k < s.objects.length; k++) {
      var o = s.objects[k]; if (o.kind !== 'building' || !B[o.type] || !B[o.type].mono) continue;
      var fp = C.objFootprint(o), tiles = [], axis, k2, fd, bd;
      if (!(fp.rot & 1)) { axis = 0; var row = fp.rot === 0 ? fp.j0 : fp.j0 + fp.h - 1; for (k2 = 0; k2 < fp.w; k2++) tiles.push((fp.i0 + k2) + row * N); fd = 1; bd = 3; }
      else { axis = 1; var col = fp.rot === 1 ? fp.i0 : fp.i0 + fp.w - 1; for (k2 = 0; k2 < fp.h; k2++) tiles.push(col + (fp.j0 + k2) * N); fd = 2; bd = 0; }
      var mx = -99;
      for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) mx = Math.max(mx, cmax((fp.i0 + a) + (fp.j0 + b) * N));
      out.push({ o: o, id: o.id, tiles: tiles, axis: axis, fd: fd, bd: bd, deck: mx + MD.stationDeck, fp: fp, line: -1, idx: -1 });
    }
    return out;
  }
  // is there an edge from tile t in direction d?  (rail = candidate/live rail layer, x = station tables)
  function edge(rail, x, t, d) {
    var n = t + DT4[d], i = t % N;
    if (d === 1 && i === N - 1 || d === 3 && i === 0 || n < 0 || n >= NN) return false;
    var st = x.stAt[t], sn = x.stAt[n];
    if (st >= 0 && sn >= 0) {
      if (st !== sn) return false;
      var S0 = x.stations[st], pt = x.stPos[t], pn = x.stPos[n];
      return (d === S0.fd && pn === pt + 1) || (d === S0.bd && pn === pt - 1);
    }
    if (st >= 0) {     // station end -> outside tile
      var S1 = x.stations[st], p = x.stPos[t], last = S1.tiles.length - 1;
      if (!((p === last && d === S1.fd) || (p === 0 && d === S1.bd))) return false;
      return (rail[n] & (1 << opp(d))) !== 0;
    }
    if (sn >= 0) {     // outside tile -> station end
      var S2 = x.stations[sn], pn2 = x.stPos[n], last2 = S2.tiles.length - 1;
      if (!((pn2 === 0 && d === S2.fd) || (pn2 === last2 && d === S2.bd))) return false;
      return (rail[t] & (1 << d)) !== 0;
    }
    return (rail[t] & (1 << d)) !== 0 && (rail[n] & (1 << opp(d))) !== 0;
  }
  var _nbA = [0, 0, 0, 0];
  function nbrs(rail, x, t) {
    var n = 0; for (var d = 0; d < 4; d++) if (edge(rail, x, t, d)) _nbA[n++] = t + DT4[d]; return n;
  }
  function canBase(s, x, t) {
    if (x.stAt[t] >= 0 || s.tileObj[t] || s.path[t] || (s.ditch && s.ditch[t])) return false;
    if (isWater(t) && cmean(t) < -1.0) return false;
    return true;
  }
  var SCK = {};
  function obstacle(s, t) {
    var id = s.tileObj[t]; if (!id) return 0;
    var o = C.RT().oById.get(id); if (!o) return 0;
    if (o.kind === 'building') return 3.8;
    var kd = SCK[o.type]; if (kd === undefined) { var def = D.scenery.filter(function (q) { return q.id === o.type; })[0]; kd = SCK[o.type] = def ? def.kind : ''; }
    return kd === 'tree' ? 2.6 : 0;
  }

  // Pure: derive everything from a rail layer.  Used for the live state and for "what if" planning.
  function compute(s, rail) {
    var x = emptyX(), k, t, d;
    x.stations = stationList(s);
    for (k = 0; k < x.stations.length; k++) { var st = x.stations[k]; for (var q = 0; q < st.tiles.length; q++) { x.stAt[st.tiles[q]] = k; x.stPos[st.tiles[q]] = q; } }
    // nodes and degree
    var isNode = new Uint8Array(NN), nodes = [];
    for (t = 0; t < NN; t++) {
      var n = (rail[t] || x.stAt[t] >= 0) ? nbrs(rail, x, t) : 0;
      x.deg[t] = n;
      if (n > 0 || x.stAt[t] >= 0) { isNode[t] = 1; nodes.push(t); }
    }
    // components -> chains / loops
    var seen = new Uint8Array(NN), clen = 0;
    for (k = 0; k < nodes.length; k++) {
      var start = nodes[k]; if (seen[start]) continue;
      var comp = [], stack = [start]; seen[start] = 1;
      while (stack.length) {
        var u = stack.pop(); comp.push(u);
        var cnt = nbrs(rail, x, u);
        for (d = 0; d < cnt; d++) { var v = _nbA[d]; if (!seen[v]) { seen[v] = 1; stack.push(v); } }
      }
      if (comp.length < 2) continue;
      var ends = [], branch = false;
      for (var c = 0; c < comp.length; c++) { var dg = x.deg[comp[c]]; if (dg === 1) ends.push(comp[c]); else if (dg > 2) branch = true; }
      var L = { key: 0, loop: false, nodes: [], ok: false, why: '', bad: [], stops: [], len: 0, m: 0, ds: 0, px: null, py: null, pz: null, ph: null, pylons: [], paused: false, trains: [], branch: branch, ovE: null, ovW: null, ovD: null };
      if (branch) { L.why = 'Track cannot branch'; for (c = 0; c < comp.length; c++) if (x.deg[comp[c]] > 2) L.bad.push(comp[c]); }
      var first;
      if (ends.length === 2) { first = Math.min(ends[0], ends[1]); }
      else if (ends.length === 0) { first = comp[0]; for (c = 0; c < comp.length; c++) if (x.stAt[comp[c]] >= 0) { first = comp[c]; break; } L.loop = true; }
      else { first = comp[0]; }
      // walk
      var prev = -1, cur = first, guard = 0;
      while (guard++ < comp.length + 2) {
        L.nodes.push(cur);
        var cn = nbrs(rail, x, cur), nxt = -1;
        for (d = 0; d < cn; d++) if (_nbA[d] !== prev) { nxt = _nbA[d]; break; }
        if (nxt < 0 || nxt === first || L.nodes.length >= comp.length) break;
        prev = cur; cur = nxt;
      }
      L.key = first;
      var li = x.lines.length;
      for (c = 0; c < L.nodes.length; c++) { x.nodeLine[L.nodes[c]] = li; x.nodeK[L.nodes[c]] = c; }
      x.lines.push(L);
    }
    for (k = 0; k < x.lines.length; k++) buildLine(s, x, x.lines[k], k);
    // hash of the geometry (so the world only rebuilds when something visible changed)
    var hsh = 17;
    for (t = 0; t < NN; t++) if (x.nodeLine[t] >= 0) hsh = (Math.imul(hsh, 31) + t * 7 + rail[t] + Math.round(x.h[t] * 10)) | 0;
    for (k = 0; k < x.stations.length; k++) hsh = (Math.imul(hsh, 31) + x.stations[k].id * 13 + Math.round(x.stations[k].deck * 10)) | 0;
    x.hash = hsh;
    return x;
  }

  function buildLine(s, x, L, li) {
    var nodes = L.nodes, n = nodes.length, k, t, SL = MD.maxSlope;
    // ---- stations along the line
    var seenSt = {};
    for (k = 0; k < n; k++) {
      var si = x.stAt[nodes[k]]; if (si < 0 || seenSt[si]) continue; seenSt[si] = 1;
      var st = x.stations[si]; st.line = li;
    }
    // ---- heights: ground + clearance, station decks flat, slope-limited, smoothed
    var base = new Float32Array(n), h = new Float32Array(n), isSt = new Uint8Array(n);
    for (k = 0; k < n; k++) {
      t = nodes[k]; var sj = x.stAt[t];
      if (sj >= 0) { base[k] = x.stations[sj].deck; isSt[k] = 1; }
      else { var g = cmax(t); if (isWater(t)) g = Math.max(g, 0.35); base[k] = g + obstacle(s, t) + MD.clearance; }
      h[k] = base[k];
    }
    var it, kk;
    function eqStations() {
      for (var q = 0; q < x.stations.length; q++) {
        var st2 = x.stations[q]; if (st2.line !== li) continue;
        var mx = -99, z; for (z = 0; z < st2.tiles.length; z++) { var ki = x.nodeK[st2.tiles[z]]; if (ki >= 0 && h[ki] > mx) mx = h[ki]; }
        for (z = 0; z < st2.tiles.length; z++) { var kj = x.nodeK[st2.tiles[z]]; if (kj >= 0) h[kj] = mx; }
      }
    }
    for (it = 0; it < 3; it++) {
      for (var rep2 = 0; rep2 < (L.loop ? 2 : 1); rep2++) {
        for (kk = 0; kk < n; kk++) { if (!L.loop && kk === n - 1) break; var nx = (kk + 1) % n; if (h[nx] < h[kk] - SL) h[nx] = h[kk] - SL; }
        for (kk = n - 1; kk >= 0; kk--) { if (!L.loop && kk === 0) break; var pv = (kk - 1 + n) % n; if (h[pv] < h[kk] - SL) h[pv] = h[kk] - SL; }
      }
      eqStations();
    }
    for (it = 0; it < 2; it++) {
      var hc = h.slice();
      for (k = 0; k < n; k++) {
        if (isSt[k]) continue;
        var p0 = L.loop ? (k - 1 + n) % n : Math.max(0, k - 1), p1 = L.loop ? (k + 1) % n : Math.min(n - 1, k + 1);
        var av = (hc[p0] + 2 * hc[k] + hc[p1]) * 0.25; h[k] = Math.max(base[k], av);
      }
    }
    for (k = 0; k < n; k++) x.h[nodes[k]] = h[k];
    L.h = h;
    // ---- pylons (auto): at least one support every maxSpan tiles, usually every prefSpan; never on buildings, paths, deep water
    var sup = new Uint8Array(n);
    for (k = 0; k < n; k++) sup[k] = (isSt[k] || canBase(s, x, nodes[k])) ? 1 : 0;
    var P = [], pref = MD.prefSpan, maxS = MD.maxSpan, last = -1, badK = -1;
    function S_(i) { return sup[((i % n) + n) % n]; }
    if (!L.loop) {
      if (sup[0]) { P.push(0); last = 0; } else if (n > 1 && sup[1]) { P.push(1); last = 1; } else badK = 0;
      while (badK < 0 && last < n - 2) {
        var pick = -1, i;
        for (i = last + pref; i <= Math.min(last + maxS, n - 1); i++) if (sup[i]) { pick = i; break; }
        if (pick < 0) for (i = Math.min(last + pref - 1, n - 1); i > last; i--) if (sup[i]) { pick = i; break; }
        if (pick < 0) { badK = Math.min(n - 1, last + maxS); break; }
        P.push(pick); last = pick;
      }
    } else {
      var s0 = -1; for (k = 0; k < n; k++) if (isSt[k]) { s0 = k; break; }
      if (s0 < 0) { for (k = 0; k < n; k++) if (sup[k]) { s0 = k; break; } }
      if (s0 < 0) badK = 0;
      else {
        P.push(s0); last = s0;
        while (badK < 0) {
          var lim = s0 + n, pk = -1, j;
          if (last + maxS >= lim) { break; }
          for (j = last + pref; j <= last + maxS; j++) if (S_(j) || j === lim) { pk = j; break; }
          if (pk < 0) for (j = last + pref - 1; j > last; j--) if (S_(j)) { pk = j; break; }
          if (pk < 0) { badK = (last + maxS) % n; break; }
          if (pk >= lim) break;
          P.push(pk % n); last = pk;
        }
      }
    }
    if (badK >= 0 && !L.bad.length) L.bad.push(nodes[Math.max(0, Math.min(n - 1, badK))]);
    var gy = function (t2) { var y = cmean(t2); return y; };
    for (k = 0; k < P.length; k++) {
      var pn = nodes[P[k]]; if (x.stAt[pn] >= 0) continue;
      L.pylons.push({ k: P[k], t: pn, x: tcx(pn), z: tcz(pn), y0: gy(pn), y1: h[P[k]] - 0.5 });
    }
    // ---- polyline: straight through nodes, rounded corners (quadratic bezier from edge midpoint to edge midpoint)
    var rx = [], ry = [], rz = [], nodeV = new Int32Array(n).fill(-1);
    function pushP(px, py, pz) { rx.push(px); ry.push(py); rz.push(pz); }
    function C_(kx) { return tcx(nodes[kx]); }
    function Cz(kx) { return tcz(nodes[kx]); }
    var from = L.loop ? 0 : 1, to = L.loop ? n : n - 1;
    if (!L.loop) { pushP(C_(0), h[0], Cz(0)); nodeV[0] = 0; }
    for (k = from; k < to; k++) {
      var pk0 = (k - 1 + n) % n, nk = (k + 1) % n, cx = C_(k), cz = Cz(k), ch = h[k];
      var d1x = cx - C_(pk0), d1z = cz - Cz(pk0), d2x = C_(nk) - cx, d2z = Cz(nk) - cz;
      if (Math.abs(d1x * d2z - d1z * d2x) < 1e-6) { nodeV[k] = rx.length; pushP(cx, ch, cz); }
      else {
        var m1x = (cx + C_(pk0)) / 2, m1z = (cz + Cz(pk0)) / 2, m1h = (ch + h[pk0]) / 2, m2x = (cx + C_(nk)) / 2, m2z = (cz + Cz(nk)) / 2, m2h = (ch + h[nk]) / 2;
        for (var u = 0; u <= 8; u++) {
          var f = u / 8, a1 = (1 - f) * (1 - f), a2 = 2 * f * (1 - f), a3 = f * f;
          pushP(a1 * m1x + a2 * cx + a3 * m2x, a1 * m1h + a2 * ch + a3 * m2h, a1 * m1z + a2 * cz + a3 * m2z);
        }
      }
    }
    if (!L.loop) { nodeV[n - 1] = rx.length; pushP(C_(n - 1), h[n - 1], Cz(n - 1)); }
    else pushP(rx[0], ry[0], rz[0]);
    var rs = new Float32Array(rx.length), tot = 0, v;
    for (v = 1; v < rx.length; v++) { tot += Math.hypot(rx[v] - rx[v - 1], rz[v] - rz[v - 1]); rs[v] = tot; }
    L.len = tot;
    // stops: midpoint of each station's two middle tiles
    for (k = 0; k < x.stations.length; k++) {
      var sx = x.stations[k]; if (sx.line !== li) continue;
      var tl = sx.tiles, a3k = x.nodeK[tl[1]], b3k = x.nodeK[tl[2]];
      if (a3k < 0 || b3k < 0 || nodeV[a3k] < 0 || nodeV[b3k] < 0) continue;
      var sA = rs[nodeV[a3k]], sB = rs[nodeV[b3k]];
      if (L.loop && Math.abs(sB - sA) > tot / 2) { if (sA < sB) sA += tot; else sB += tot; }
      var sm = (sA + sB) / 2;
      if (L.loop && tot > 0) sm = ((sm % tot) + tot) % tot;
      L.stops.push({ si: k, id: sx.id, o: sx.o, s: sm });
    }
    L.stops.sort(function (p, q2) { return p.s - q2.s; });
    for (k = 0; k < L.stops.length; k++) x.stations[L.stops[k].si].idx = k;
    // resample uniformly
    var ds0 = 0.7, m = Math.max(2, Math.ceil(tot / ds0)), ds = tot / m, np = L.loop ? m : m + 1;
    L.ds = ds; L.m = np;
    var px = new Float32Array(np), py = new Float32Array(np), pz = new Float32Array(np), ph = new Float32Array(np), vi = 0;
    for (k = 0; k < np; k++) {
      var sk = k * ds; while (vi < rs.length - 2 && rs[vi + 1] < sk) vi++;
      var seg = rs[vi + 1] - rs[vi], ff = seg > 1e-9 ? (sk - rs[vi]) / seg : 0;
      px[k] = rx[vi] + (rx[vi + 1] - rx[vi]) * ff; py[k] = ry[vi] + (ry[vi + 1] - ry[vi]) * ff; pz[k] = rz[vi] + (rz[vi + 1] - rz[vi]) * ff;
    }
    // soften heights along the beam (keeps station decks exactly flat)
    for (it = 0; it < 3; it++) {
      var yc = py.slice();
      for (k = 0; k < np; k++) {
        var a4 = L.loop ? (k - 1 + np) % np : Math.max(0, k - 1), b4 = L.loop ? (k + 1) % np : Math.min(np - 1, k + 1);
        py[k] = (yc[a4] + 2 * yc[k] + yc[b4]) * 0.25;
      }
    }
    for (k = 0; k < L.stops.length; k++) {
      var sp = L.stops[k], stn = x.stations[sp.si], dk = h[x.nodeK[stn.tiles[0]]];
      for (v = 0; v < np; v++) {
        var ss2 = v * ds, dd = Math.abs(ss2 - sp.s); if (L.loop) dd = Math.min(dd, tot - dd);
        if (dd <= 4.0) py[v] = dk; else if (dd < 6.5) { var bf = (dd - 4) / 2.5; py[v] = dk + (py[v] - dk) * bf; }
      }
    }
    for (k = 0; k < np; k++) {
      var an = L.loop ? (k + 1) % np : Math.min(np - 1, k + 1), bn = L.loop ? (k - 1 + np) % np : Math.max(0, k - 1);
      ph[k] = Math.atan2(px[an] - px[bn], pz[an] - pz[bn]);
    }
    L.px = px; L.py = py; L.pz = pz; L.ph = ph;
    // ---- verdict
    var stations = L.stops.length;
    if (L.bad.length && !L.why) L.why = 'No room for supports near here: keep within ' + MD.maxSpan + ' tiles of firm ground (deep water cannot hold a pylon)';
    else if (!L.why && L.loop && stations < 1) L.why = 'A loop needs at least one station';
    else if (!L.why && !L.loop && stations < 2) L.why = stations === 1 ? 'Needs a second station' : 'Needs two stations';
    L.ok = !L.why;
  }

  // ---------------------------------------------------------------- overlooked enclosures (by tile footprint; works for any enclosure kind that registers tiles)
  function encAt(s, t) {
    var e = s.tileEnc[t]; if (e) return e;
    for (var k = 0; k < overlookSources.length; k++) { var r = overlookSources[k](t); if (r) return r; }
    return 0;
  }
  // tiles = list of tile indices (e.g. the nodes a carriage is over); returns [{enc, d (tiles to the nearest enclosure tile, 0 = directly over), n (tiles seen), w (0..1 viewing quality)}]
  function footprintOverlooks(tiles, radius) {
    var s = S(), R = radius === undefined ? MD.viewRadius : radius, best = {}, ids = [], k;
    for (k = 0; k < tiles.length; k++) {
      var t = tiles[k], i0 = t % N, j0 = (t - i0) / N, cnt = {};
      for (var dj = -R; dj <= R; dj++) {
        var y = j0 + dj; if (y < 0 || y >= N) continue;
        for (var di = -R; di <= R; di++) {
          var xx = i0 + di; if (xx < 0 || xx >= N) continue;
          var e = encAt(s, xx + y * N); if (!e) continue;
          var dd = Math.max(Math.abs(di), Math.abs(dj)), c = cnt[e] || (cnt[e] = { n: 0, d: 99 });
          c.n++; if (dd < c.d) c.d = dd;
        }
      }
      for (var e2 in cnt) {
        var b = best[e2]; if (!b) { b = best[e2] = { enc: +e2, d: 99, n: 0 }; ids.push(e2); }
        if (cnt[e2].d < b.d) b.d = cnt[e2].d; if (cnt[e2].n > b.n) b.n = cnt[e2].n;
      }
    }
    var out = [];
    for (k = 0; k < ids.length; k++) { var q = best[ids[k]]; q.w = clamp(q.n / 5, 0, 1) * (1 - 0.45 * q.d / (R + 1)); out.push(q); }
    out.sort(function (a, b) { return b.w - a.w; });
    return out;
  }
  function computeOverlooks(x) {
    var s = S(), R = MD.viewRadius;
    for (var li = 0; li < x.lines.length; li++) {
      var L = x.lines[li], n = L.nodes.length;
      L.ovE = new Int32Array(n * 3); L.ovW = new Float32Array(n * 3); L.ovD = new Uint8Array(n * 3);
      var over = {};
      for (var k = 0; k < n; k++) {
        var list = footprintOverlooks([L.nodes[k]], R);
        for (var q = 0; q < 3 && q < list.length; q++) {
          L.ovE[k * 3 + q] = list[q].enc; L.ovW[k * 3 + q] = list[q].w; L.ovD[k * 3 + q] = list[q].d;
        }
        for (q = 0; q < list.length; q++) if (list[q].d === 0 && list[q].n >= 1) over[list[q].enc] = 1;
      }
      L.over = Object.keys(over).map(Number);
    }
  }

  // ============================================================ update (called after every world change)
  var _graphOld = null;
  M.updateGraph = function () {
    var s = S(); if (!s) return;
    if (!s.rail || s.rail.length !== NN) s.rail = new Uint8Array(NN);
    if (!s.mono) s.mono = { trains: [], nextTrain: 1, stats: {}, powered: true };
    ensureFields(s);
    var any = false, t, B = BD();
    for (t = 0; t < NN && !any; t++) if (s.rail[t]) any = true;
    if (!any) for (var k = 0; k < s.objects.length; k++) if (s.objects[k].kind === 'building' && B[s.objects[k].type] && B[s.objects[k].type].mono) { any = true; break; }
    var old = X;
    if (!_graphOld) _graphOld = old;
    if (!any) { X = emptyX(); X.ver = old.ver; X.hash = 0; }
    else { X = compute(s, s.rail); X.ver = old.ver; }
  };
  M.update = function (force) {
    var s = S(); if (!s) return;
    if (!s.rail || s.rail.length !== NN) s.rail = new Uint8Array(NN);
    if (!s.mono) s.mono = { trains: [], nextTrain: 1, stats: {}, powered: true };
    ensureFields(s);
    var old = _graphOld; _graphOld = null;
    if (!old) {
      var any = false, t, B = BD();
      for (t = 0; t < NN && !any; t++) if (s.rail[t]) any = true;
      if (!any) for (var k = 0; k < s.objects.length; k++) if (s.objects[k].kind === 'building' && B[s.objects[k].type] && B[s.objects[k].type].mono) { any = true; break; }
      old = X;
      if (!any) { X = emptyX(); X.ver = old.ver; X.hash = 0; }
      else { X = compute(s, s.rail); X.ver = old.ver; }
    }
    if (X.lines.length) computeOverlooks(X);
    if (X.hash !== old.hash || X.lines.length !== old.lines.length) { X.ver = old.ver + 1; bus.emit('rail', { ver: X.ver }); }
    nameStations(s);
    attachTrains(s, old);
    for (var li = 0; li < X.lines.length; li++) { var L = X.lines[li]; L.paused = L.stops.some(function (p) { return !!p.o.mpause; }); }
    if (C.refreshConnectivity) C.refreshConnectivity();
  };
  function nameStations(s) {
    for (var k = 0; k < X.stations.length; k++) {
      var o = X.stations[k].o;
      if (!o.mname) { var nn = s.mono.nameN || 0; s.mono.nameN = nn + 1; o.mname = (NAMES[nn % NAMES.length] + (nn >= NAMES.length ? ' ' + (1 + Math.floor(nn / NAMES.length)) : '')) + ' station'; }
    }
  }
  function ensureFields(s) {
    var m = s.mono;
    if (!m.trains) m.trains = []; if (!m.nextTrain) m.nextTrain = 1; if (m.powered === undefined) m.powered = true;
    m.stats = Object.assign({ riders: 0, income: 0, boardings: 0, viewSec: 0, breakdowns: 0, lightning: 0, danger: 0 }, m.stats || {});
  }
  function lineOfStationId(id) {
    for (var k = 0; k < X.stations.length; k++) if (X.stations[k].id === id) { var li = X.stations[k].line; return li >= 0 ? X.lines[li] : null; }
    return null;
  }
  function stopOf(L, id) { for (var k = 0; k < L.stops.length; k++) if (L.stops[k].id === id) return k; return -1; }
  M.lineOfStation = lineOfStationId;

  // trains keep their place when the layout changes: they are re-anchored on the node they were last over
  function attachTrains(s, old) {
    var trains = s.mono.trains, k, i;
    for (var li = 0; li < X.lines.length; li++) X.lines[li].trains = [];
    for (k = trains.length - 1; k >= 0; k--) {
      var T = trains[k], rt = TR[T.id] || (TR[T.id] = newRt()), L = lineOfStationId(T.home);
      if (!L) {   // home station demolished: the train is sold off
        var sell = Math.round((T.paid || MD.trainCost) * MD.refundTrain);
        ejectAll(T); C.earn(sell, 'construction'); C.msg('Train ' + T.id + ' lost its station and was sold for ' + C.fmt(sell) + '.', 'info', false);
        trains.splice(k, 1); delete TR[T.id]; continue;
      }
      rt.line = L; L.trains.push(T);
      if (!L.ok) { if (T.st !== 'idle') { ejectAll(T); } T.st = 'idle'; T.v = 0; continue; }
      if (T.st === 'idle') { // line is back: park at the home station
        var hk = stopOf(L, T.home); T.s = L.stops[Math.max(0, hk)].s; T.st = 'dwell'; T.dw = 0; T.at = Math.max(0, hk); T.dir = 1; T.v = 0; T.brk = -1; rt.nd = 1; continue;
      }
      if (rt.anchor >= 0 && rt.lineKey !== undefined && (rt.lineKey !== L.key || rt.ver !== X.ver)) {
        var ka = X.nodeK[rt.anchor], kp = rt.prevAnchor >= 0 ? X.nodeK[rt.prevAnchor] : -1;
        if (ka >= 0 && X.nodeLine[rt.anchor] === X.lines.indexOf(L)) {
          var sNew = nodeS(L, ka); if (sNew >= 0) T.s = sNew;
          if (kp >= 0) { T.dir = (L.loop && Math.abs(kp - ka) > 1) ? (kp > ka ? 1 : -1) : (kp < ka ? 1 : -1); if (L.loop) T.dir = 1; }
        } else { T.s = L.stops[0].s; T.st = 'dwell'; T.dw = 0; T.at = 0; T.v = 0; rt.nd = 1; }
      }
      rt.lineKey = L.key; rt.ver = X.ver;
      if (!L.loop) T.s = clamp(T.s, 0, L.len);
      if (T.st === 'dwell' || T.at === undefined || T.at >= L.stops.length) { var nb = 0, nbd = 1e9; for (i = 0; i < L.stops.length; i++) { var dd = Math.abs(L.stops[i].s - T.s); if (L.loop) dd = Math.min(dd, L.len - dd); if (dd < nbd) { nbd = dd; nb = i; } } T.at = nb; if (T.st === 'dwell' && nbd > 1) { T.s = L.stops[nb].s; } if (T.st === 'dwell') { rt.nd = (!L.loop && nb === L.stops.length - 1) ? -1 : (!L.loop && nb === 0) ? 1 : T.dir; } }
    }
  }
  function nodeS(L, k) {   // arclength of a node centre (approximate: nearest sample)
    var tx = tcx(L.nodes[k]), tz = tcz(L.nodes[k]), best = -1, bd = 1e9, np = L.m;
    for (var i = 0; i < np; i++) { var d = (L.px[i] - tx) * (L.px[i] - tx) + (L.pz[i] - tz) * (L.pz[i] - tz); if (d < bd) { bd = d; best = i; } }
    return best * L.ds;
  }
  function newRt() { return { line: null, pax: [], anchor: -1, prevAnchor: -1, ov: [], ovT: 0, pose: [], wear: 0, boardT: 0, alightT: 0, door: 0, nd: 1, strand: 0, lightningT: 0, fixer: '' }; }

  // ============================================================ sampling the beam
  var _P = { x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0, k: 0 };
  function sample(L, s, out) {
    var len = L.len, ds = L.ds, np = L.m;
    if (L.loop) { s = ((s % len) + len) % len; } else s = clamp(s, 0, len);
    var f = s / ds, i0 = Math.floor(f), fr = f - i0, i1;
    if (L.loop) { i0 %= np; i1 = (i0 + 1) % np; } else { if (i0 >= np - 1) { i0 = np - 2; fr = 1; } i1 = i0 + 1; }
    out.x = L.px[i0] + (L.px[i1] - L.px[i0]) * fr; out.y = L.py[i0] + (L.py[i1] - L.py[i0]) * fr; out.z = L.pz[i0] + (L.pz[i1] - L.pz[i0]) * fr;
    out.h = lerpAng(L.ph[i0], L.ph[i1], fr);
    out.pitch = Math.atan2(L.py[i1] - L.py[i0], ds);
    var i2 = L.loop ? (i1 + 1) % np : Math.min(np - 1, i1 + 1), i3 = L.loop ? (i0 - 1 + np) % np : Math.max(0, i0 - 1);
    var dh = L.ph[i2] - L.ph[i3]; while (dh > PI) dh -= TAU; while (dh < -PI) dh += TAU;
    out.k = dh / (ds * 3);
    return out;
  }
  M.sample = function (L, s, out) { return sample(L, s, out || {}); };
  function carPitch(T) { return (MD.carLen + MD.carGap); }
  function carPose(T, k, out) {
    var rt = TR[T.id], L = rt && rt.line; if (!L || !L.px) return null;
    var s = T.s + (k - (T.cars - 1) / 2) * carPitch(T);
    sample(L, s, _P);
    var lane = T.lane || 0, ch = Math.cos(_P.h), sh = Math.sin(_P.h);
    out.x = _P.x + ch * lane; out.z = _P.z - sh * lane; out.y = _P.y; out.h = _P.h; out.pitch = _P.pitch;
    out.roll = clamp(-_P.k * T.v * T.v * 0.045, -0.14, 0.14);
    return out;
  }
  M.carPose = function (T, k, out) { return carPose(T, k, out || {}); };

  // ============================================================ track planning / building
  function cloneRail(s) { return s.rail.slice(); }
  function routeCheck(s, rail, route, x0) {
    // x0 = station tables of the live state (station tiles + axis) - needed to decide where bits go
    var msg = '', newTiles = 0, k;
    var stAt = x0.stAt, stPos = x0.stPos, STN = x0.stations;
    for (k = 0; k < route.length; k++) {
      var t = route[k];
      if (!(t >= 0 && t < NN)) return { msg: 'Outside the map' };
      var i = t % N, j = (t - i) / N;
      if (!C.inMap(i, j)) return { msg: 'Outside your land' };
      if (stAt[t] < 0) {
        var id = s.tileObj[t];
        if (id) { var o = C.RT().oById.get(id); if (o && o.kind === 'building' && BD()[o.type].mono) return { msg: 'Join a station at the ends of its platform' }; }
      }
    }
    for (k = 0; k + 1 < route.length; k++) {
      var a = route[k], b = route[k + 1], d = dirOf(a, b);
      if (d < 0 || ((d === 1 || d === 3) && Math.floor(a / N) !== Math.floor(b / N))) return { msg: 'Track runs in straight lines between tiles' };
      var sa = stAt[a], sb = stAt[b];
      if (sa >= 0 && sb >= 0) {
        if (sa !== sb) return { msg: 'Leave a gap between two stations' };
        var S0 = STN[sa], pa = stPos[a], pb = stPos[b];
        if (!((d === S0.fd && pb === pa + 1) || (d === S0.bd && pb === pa - 1))) return { msg: 'Track goes along the platform' };
        continue;
      }
      if (sa >= 0) {
        var Sa = STN[sa], pp = stPos[a], lt = Sa.tiles.length - 1;
        if (!((pp === lt && d === Sa.fd) || (pp === 0 && d === Sa.bd))) return { msg: 'Join a station at the ends of its platform' };
        rail[b] |= 1 << opp(d); continue;
      }
      if (sb >= 0) {
        var Sb = STN[sb], pq = stPos[b], lq = Sb.tiles.length - 1;
        if (!((pq === 0 && d === Sb.fd) || (pq === lq && d === Sb.bd))) return { msg: 'Join a station at the ends of its platform' };
        rail[a] |= 1 << d; continue;
      }
      rail[a] |= 1 << d; rail[b] |= 1 << opp(d);
    }
    return { msg: msg };
  }
  function tileCost(t) { return MD.trackCost + (isWater(t) ? MD.waterExtra : 0); }
  // route: array of tile indices (4-connected).  opts.dry.  Returns {ok,cost,n,msg,nodes,ghost}
  M.planTrack = function (route, opts) {
    var s = S(), x0 = X;
    if (!x0.stations) x0 = X = emptyX();
    var r = { ok: false, cost: 0, n: 0, msg: '', bad: [], ghost: null };
    if (!route || route.length < 1) { r.msg = 'Drag along the route'; return r; }
    // drop immediate duplicates / back-tracking
    var rt = [];
    for (var k = 0; k < route.length; k++) { if (rt.length && rt[rt.length - 1] === route[k]) continue; rt.push(route[k]); }
    if (rt.length < 2) { r.msg = 'Drag along the route'; r.ghost = { tiles: rt, h: [], bad: {} }; return r; }
    var rail = cloneRail(s), before = s.rail, chk = routeCheck(s, rail, rt, x0);
    if (chk.msg) { r.msg = chk.msg; r.ghost = { tiles: rt, h: [], bad: {} }; return r; }
    var x = compute(s, rail);
    var bad = {}, nBad = 0, h = [], newN = 0, cost = 0;
    for (k = 0; k < rt.length; k++) {
      var t = rt[k]; h.push(x.h[t] || 0);
      var isNew = x.stAt[t] < 0 && !before[t] && rail[t];
      if (isNew) { newN++; cost += tileCost(t); }
      if (x.deg[t] > 2) { bad[t] = 1; nBad++; r.msg = r.msg || 'Track cannot branch or cross here'; }
    }
    for (var li = 0; li < x.lines.length; li++) {
      var L = x.lines[li], touches = false;
      for (var q = 0; q < L.nodes.length; q++) if (rt.indexOf(L.nodes[q]) >= 0) { touches = true; break; }
      if (!touches) continue;
      for (q = 0; q < L.bad.length; q++) { bad[L.bad[q]] = 1; nBad++; if (!r.msg) r.msg = L.branch ? 'Track cannot branch or cross here' : 'No room for pylons here: deep water or buildings leave more than ' + MD.maxSpan + ' tiles unsupported'; }
    }
    r.ghost = { tiles: rt, h: h, bad: bad };
    r.n = newN; r.cost = cost;
    if (!newN && !r.msg) r.msg = 'Track is already there';
    if (r.msg) return r;
    if (s.money < cost) { r.msg = 'Not enough money'; return r; }
    r.ok = true; r.rail = rail;
    return r;
  };
  M.buildTrack = function (route, opts) {
    var dry = !!(opts && opts.dry), r = M.planTrack(route);
    if (!r.ok) return r;
    if (dry) { delete r.rail; return r; }
    var s = S(), old = s.rail.slice(), nw = r.rail, ts = [];
    for (var t = 0; t < NN; t++) if (old[t] !== nw[t]) ts.push(t);
    var cost = r.cost;
    s.rail.set(nw); C.spend(cost, 'construction');
    var olds = ts.map(function (q) { return old[q]; }), news = ts.map(function (q) { return nw[q]; });
    C.jBegin('Monorail track');
    C.jOp({ k: 'x', net: cost, chk: function () { for (var i = 0; i < ts.length; i++) if (S().rail[ts[i]] !== news[i]) return 'The track has changed since, so this cannot be undone'; return null; },
      ap: function () { for (var i = 0; i < ts.length; i++) S().rail[ts[i]] = olds[i]; } });
    C.jEnd();
    M.update();
    delete r.rail;
    return r;
  };
  M.hasTrack = function (t) { var s = S(); return !!(s.rail && s.rail[t]); };
  // remove track pieces (not stations): refund 50%
  M.removeTiles = function (tiles, opts) {
    var dry = !!(opts && opts.dry), s = S(), rail = s.rail, seen = {}, list = [], refund = 0, k;
    for (k = 0; k < tiles.length; k++) { var t = typeof tiles[k] === 'number' ? tiles[k] : tiles[k].i + tiles[k].j * N; if (seen[t] || !rail[t]) continue; seen[t] = 1; list.push(t); refund += Math.floor(tileCost(t) * MD.refund); }
    if (!list.length) return fail('No track here');
    if (dry) return okr(-refund, { n: list.length });
    var ts = {}, olds = {}, d, n;
    list.forEach(function (t2) { ts[t2] = 1; olds[t2] = rail[t2]; });
    for (k = 0; k < list.length; k++) {
      var u = list[k]; for (d = 0; d < 4; d++) { n = u + DT4[d]; if (n >= 0 && n < NN && !ts[n] && (rail[n] & (1 << opp(d))) && ((d === 1 && u % N === N - 1) || (d === 3 && u % N === 0) ? false : true)) { if (!(n in olds)) olds[n] = rail[n]; rail[n] &= ~(1 << opp(d)); } }
      rail[u] = 0;
    }
    var keys = Object.keys(olds).map(Number), news = keys.map(function (q) { return rail[q]; }), olv = keys.map(function (q) { return olds[q]; });
    C.earn(refund, 'construction');
    C.jBegin('Remove track');
    C.jOp({ k: 'x', net: -refund, chk: function () { for (var i = 0; i < keys.length; i++) if (S().rail[keys[i]] !== news[i]) return 'The track has changed since, so this cannot be undone'; return null; },
      ap: function () { for (var i = 0; i < keys.length; i++) S().rail[keys[i]] = olv[i]; } });
    C.jEnd();
    M.update();
    return okr(-refund, { n: list.length });
  };
  // station placement rule (hooked from placeObject)
  M.placeCheck = function (type, fp) {
    var s = S(), B = BD()[type]; if (!B || !B.mono) return null;
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) if (s.rail[(fp.i0 + a) + (fp.j0 + b) * N]) return { msg: 'Remove the monorail track under the station first' };
    return null;
  };

  // ============================================================ trains: buying, selling, state
  function trainLen(T) { return T.cars * MD.carLen + (T.cars - 1) * MD.carGap; }
  function trainsOfLine(L) { return L ? L.trains : []; }
  M.maxTrainsFor = function (stationId) { return MD.maxTrains; };
  M.buyTrain = function (stationId, cars, opts) {
    var s = S(), dry = !!(opts && opts.dry), L = lineOfStationId(stationId);
    cars = clamp(Math.round(+cars || MD.minCars), MD.minCars, MD.maxCars);
    if (!L) return fail('Link this station to track first');
    if (L.trains.length >= MD.maxTrains) return fail('A line can run up to ' + MD.maxTrains + ' trains');
    var cost = MD.trainCost + (cars - MD.minCars) * MD.carCost;
    if (s.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    var stopIdx = Math.max(0, stopOf(L, stationId));
    if (L.ok && L.trains.length && L.stops.length > 1) {   // start at the stop furthest from the trains already running
      var bestK = stopIdx, bd = -1;
      for (var k = 0; k < L.stops.length; k++) {
        var m = 1e9; for (var q = 0; q < L.trains.length; q++) m = Math.min(m, Math.abs(L.trains[q].s - L.stops[k].s));
        if (m > bd + 0.01) { bd = m; bestK = k; }
      }
      stopIdx = bestK;
    }
    var T = { id: s.mono.nextTrain++, home: stationId, cars: cars, s: L.ok ? L.stops[stopIdx].s : 0, dir: 1, st: L.ok ? 'dwell' : 'idle', dw: 0, at: stopIdx, v: 0, brk: -1, why: '', lane: 0, paid: cost };
    s.mono.trains.push(T); C.spend(cost, 'construction');
    C.jBegin('Buy train'); C.jOp({ k: 'x', net: cost, chk: function () { return M.hasTrain(T.id) ? null : 'The train is gone'; }, ap: function () { removeTrainNow(T.id, true); } }); C.jEnd();
    M.update();
    return okr(cost, { id: T.id });
  };
  M.hasTrain = function (id) { return S().mono.trains.some(function (t) { return t.id === id; }); };
  function removeTrainNow(id, silent) {
    var s = S(), tr = s.mono.trains, k;
    for (k = 0; k < tr.length; k++) if (tr[k].id === id) { ejectAll(tr[k]); tr.splice(k, 1); delete TR[id]; M.update(); return true; }
    return false;
  }
  M.sellTrain = function (id, opts) {
    var s = S(), T = s.mono.trains.filter(function (t) { return t.id === id; })[0]; if (!T) return fail('No such train');
    var refund = Math.round((T.paid || MD.trainCost) * MD.refundTrain);
    if (opts && opts.dry) return okr(-refund);
    removeTrainNow(id); C.earn(refund, 'construction');
    return okr(-refund);
  };
  M.setFare = function (stationId, fare, opts) {
    var L = lineOfStationId(stationId), s = S(), fv = clamp(Math.round((+fare || 0) * 2) / 2, 0, MD.fareMax);
    if (opts && opts.dry) return okr(0);
    var done = false;
    s.objects.forEach(function (o) { if (o.id === stationId || (L && L.stops.some(function (p) { return p.id === o.id; }))) { o.fare = fv; done = true; } });
    return done ? okr(0) : fail('No such station');
  };
  M.setFree = function (stationId, on) {
    var L = lineOfStationId(stationId), s = S();
    s.objects.forEach(function (o) { if (o.id === stationId || (L && L.stops.some(function (p) { return p.id === o.id; }))) o.mfree = on ? 1 : 0; });
    return okr(0);
  };
  M.setPaused = function (stationId, on) {
    var L = lineOfStationId(stationId), s = S();
    s.objects.forEach(function (o) { if (o.id === stationId || (L && L.stops.some(function (p) { return p.id === o.id; }))) o.mpause = on ? 1 : 0; });
    M.update();
    return okr(0);
  };
  M.setPowered = function (on) { var s = S(); s.mono.powered = !!on; return okr(0); };
  M.isPowered = function () { return linePowered(); };
  function linePowered() {
    var s = S(); if (s.mono.powered === false) return false;
    return true;
  }
  function stationPowered(o) { return !o.off; }

  // ============================================================ the train state machine
  function weatherK() { var s = S(); return MD.weatherSpeed[s.weather && s.weather.type] || 1; }
  function opHours() { var t = S().time; return t >= C.OPEN_T - 0.03 && t < C.CLOSE_T + 0.07; }
  function nextStop(L, T) {   // {k, dist, dir} of the stop the train will reach next in direction dir
    var n = L.stops.length, s = T.s, dir = T.dir, len = L.len, best = -1, bd = 1e9, rt = TR[T.id], skip = rt && rt.skipK !== undefined ? rt.skipK : -1;
    if (!n) return null;
    if (skip >= 0) {   // far enough from the stop it just left
      var sd = L.stops[skip] ? Math.abs(L.stops[skip].s - s) : 1e9;
      if (L.loop && len > 0) sd = Math.min(sd, len - sd);
      if (sd > 0.8) { skip = -1; if (rt) rt.skipK = -1; }
    }
    for (var k = 0; k < n; k++) {
      var d = (L.stops[k].s - s) * dir;
      // a stop that is only just ahead (or just overshot at the creep speed) still counts, except the one the train is pulling out of: otherwise a train could glide past its platform and turn round without dwelling
      if (L.loop) { d = ((d % len) + len) % len; if (skip === k) { if (d < 0.6) d += len; } else if (d > len - 0.3) d = 0; }
      else { if (d < -0.3 || (skip === k && d < 0.6)) continue; if (d < 0) d = 0; }
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return null;
    return { k: best, dist: bd, dir: dir };
  }
  function obstacleGap(T, L) {   // how far (units) T may advance before it runs into the train ahead of it
    var gap = 1e9, half = trainLen(T) / 2;
    for (var q = 0; q < L.trains.length; q++) {
      var O = L.trains[q]; if (O === T || O.st === 'idle') continue;
      var d = (O.s - T.s) * T.dir;
      if (L.loop) { d = ((d % L.len) + L.len) % L.len; }
      if (d < -0.5) continue;
      if (Math.abs(d) < 0.5) { if (O.id > T.id) continue; d = 0.5; }
      var moving = O.st === 'run';   // (a train held by a signal must not block oncoming traffic: two held trains would wait for each other for ever)
      if (O.dir !== T.dir && moving) continue;    // passing (they slide to opposite lanes)
      if (O.dir !== T.dir && !L.loop && O.st !== 'run') { /* waiting at a terminus: block only if it will leave in our direction */ if (TR[O.id] && TR[O.id].nd !== T.dir) { } }
      var g = d - (half + trainLen(O) / 2 + 2.2);
      if (g < gap) gap = g;
    }
    return gap;
  }
  function enterDwell(T, L, k) {
    var rt = TR[T.id]; T.st = 'dwell'; T.dw = 0; T.at = k; T.v = 0; T.s = L.stops[k].s; rt.boardT = 0; rt.alightT = 0;
    var nd = T.dir;
    if (!L.loop) { if (k === L.stops.length - 1) nd = -1; else if (k === 0) nd = 1; }
    rt.nd = nd;
  }
  function hasPax(T) { var rt = TR[T.id]; return rt && rt.pax.length > 0; }
  function strand(T, why) {
    var s = S(), rt = TR[T.id]; if (T.st === 'stuck' || T.st === 'idle') return;
    T.prevSt = T.st; T.st = 'stuck'; T.why = why;
    var fix = rng.range(MD.fixTime[0], MD.fixTime[1]), who = '', staff = null, bd = 1e9;
    for (var k = 0; k < s.staff.length; k++) {
      var m = s.staff[k]; if (m.type === 'scientist' || m.sickUntil > s.day + s.time) continue;
      var pos = carPose(T, 0, {}), dd = pos ? Math.hypot(m.x - pos.x, m.z - pos.z) : 40; if (dd < bd) { bd = dd; staff = m; }
    }
    if (staff) { fix = clamp(MD.fixTime[0] + bd * 0.35, MD.fixTime[0], MD.fixTime[1]); who = staff.name + ' is on the way'; }
    else { fix = rng.range(MD.engineerTime[0], MD.engineerTime[1]); who = 'No staff free: an engineer has been called'; T.fee = MD.callOutFee; }
    T.brk = fix; rt.fixer = who;
    s.mono.stats.breakdowns++;
    if (why === 'lightning') s.mono.stats.lightning++;
    s.reputation = clamp(s.reputation - 0.8, 0, 100);
    var pos2 = carPose(T, Math.floor(T.cars / 2), {}) || { x: 0, z: 0 };
    var txt = why === 'lightning' ? 'Lightning struck monorail train ' + T.id + ' and it has stopped.' : why === 'power' ? 'Monorail train ' + T.id + ' has stopped: no power.' : 'Monorail train ' + T.id + ' has broken down' + (T.st === 'run' ? ' between stations' : '') + '.';
    C.msg(txt + ' ' + who + '.', 'bad', false);
    bus.emit('monoStuck', { train: T.id, why: why, x: pos2.x, z: pos2.z, text: txt, who: who });
    if (why === 'lightning') bus.emit('monoLightning', { x: pos2.x, y: pos2.y || 8, z: pos2.z, train: T.id });
  }
  function unstick(T, why) {
    var rt = TR[T.id]; T.st = T.prevSt === 'dwell' ? 'dwell' : (T.prevSt === 'run' ? 'run' : 'run'); T.brk = -1; T.why = '';
    if (T.fee) { C.spend(T.fee, 'upkeep'); T.fee = 0; }
    if (T.st === 'dwell') { /* continue where it was */ }
    C.msg('Monorail train ' + T.id + ' is moving again.', 'good', false);
    bus.emit('monoFixed', { train: T.id });
  }
  M.breakdown = function (id, why) { var T = S().mono.trains.filter(function (t) { return t.id === id; })[0]; if (!T || !TR[T.id] || !TR[T.id].line) return false; strand(T, why || 'fault'); return true; };
  M.callEngineer = function (id) {
    var s = S(), T = s.mono.trains.filter(function (t) { return t.id === id; })[0];
    if (!T || T.st !== 'stuck') return fail('That train is not stuck');
    if (s.money < MD.engineerFee) return fail('Not enough money');
    C.spend(MD.engineerFee, 'upkeep'); T.brk = Math.min(T.brk, 10); T.fee = 0; TR[T.id].fixer = 'An engineer is on site';
    return okr(MD.engineerFee);
  };

  function stepTrain(T, dt) {
    var s = S(), rt = TR[T.id]; if (!rt || !rt.line) return;
    var L = rt.line; if (T.st === 'idle' || !L.ok) return;
    var weather = weatherK(), powered = linePowered() && L.stops.every(function (p) { return stationPowered(p.o); });
    var vmax = MD.speed * weather;
    // faults
    rt.faultAcc = (rt.faultAcc || 0) + dt;
    if (rt.faultAcc >= 1) {
      rt.faultAcc -= 1;
      var hourSec = C.DAY_SECONDS / 24, wt = s.weather && s.weather.type;
      if (T.st !== 'stuck') {
        if (!powered && T.st === 'run') strand(T, 'power');
        else if (powered) {
          if (wt === 'storm' && rng.next() < MD.lightningPerHour / hourSec) strand(T, 'lightning');
          else if (T.st === 'run' && rng.next() < MD.breakdownPerHour * (wt === 'storm' ? 2 : 1) / hourSec) strand(T, 'fault');
        }
      }
    }
    if (T.st === 'stuck') {
      T.v = Math.max(0, T.v - MD.decel * 2.5 * dt); T.s += T.dir * T.v * dt; if (L.loop) T.s = ((T.s % L.len) + L.len) % L.len; else T.s = clamp(T.s, 0, L.len);
      if (!powered && T.why === 'power') { if (powered) T.brk = 0; return; }
      T.brk -= dt; rt.stuckT = (rt.stuckT || 0) + dt;
      if (T.why === 'power' && !powered) T.brk = Math.max(T.brk, 3);
      if (T.brk <= 0 && T.v < 0.2) { rt.stuckT = 0; unstick(T); }
      return;
    }
    if (T.st === 'dwell') {
      var stop = L.stops[T.at]; if (!stop) { T.at = 0; stop = L.stops[0]; }
      T.dw += dt; T.v = 0;
      var o = stop.o, maxDw = MD.dwell + 11, paused = !!o.mpause || L.paused;
      rt.door += (((T.dw > 0.8 && !rt.closing && (opHours() || hasPax(T))) ? 1 : 0) - rt.door) * Math.min(1, dt * 3);
      // alight, then board
      rt.alightT -= dt; rt.boardT -= dt;
      var did = false;
      if (T.dw > 0.9 && rt.alightT <= 0) { did = alightOne(T, L, o); if (did) rt.alightT = 0.22; }
      if (T.dw > 1.4 && rt.boardT <= 0 && !paused && powered && opHours()) { if (boardOne(T, L, o)) rt.boardT = 0.22; }   // doors work both ways at once
      var waiting = pendingBoarders(T, L, o);
      var ready = T.dw >= MD.dwell && !did && (T.dw >= maxDw || !(waiting > 0 && freeSeats(T) > 0 && !paused));
      if (!opHours() && !hasPax(T)) ready = false;
      if (paused || !powered) ready = false;
      if (ready) rt.closing = (rt.closing || 0) + dt; else rt.closing = 0;
      if (ready && rt.closing >= 1.1) {
        var gap = obstacleGap(T, L);
        if (gap >= 0.5) {
          T.dir = rt.nd; T.st = 'run'; rt.closing = 0; rt.skipK = T.at;
          for (var q = 0; q < rt.pax.length; q++) rt.pax[q].rpass = (rt.pax[q].rpass || 0) + 1;
        }
      }
      if (T.st === 'dwell') { T.v = 0; return; }
    }
    // running
    rt.door += (0 - rt.door) * Math.min(1, dt * 3);
    var nx = nextStop(L, T);
    if (!nx) { // no stop ahead (open line, at the end): turn round
      T.dir = -T.dir; nx = nextStop(L, T); if (!nx) { T.st = 'dwell'; return; }
    }
    var vt = vmax, dist = nx.dist, decel = MD.decel;
    vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * decel * Math.max(0, dist - 0.02))) + 0.35);
    var gap2 = obstacleGap(T, L);
    if (gap2 < 60) vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * decel * Math.max(0, gap2 - 0.3))));
    if (!powered) vt = 0;
    if (T.v < vt) T.v = Math.min(vt, T.v + MD.accel * dt); else T.v = Math.max(vt, T.v - decel * 1.3 * dt);
    var adv = T.v * dt;
    if (adv >= dist - 0.01 || (dist < 0.06)) { T.s = L.stops[nx.k].s; enterDwell(T, L, nx.k); return; }
    T.s += T.dir * adv;
    if (L.loop) T.s = ((T.s % L.len) + L.len) % L.len; else T.s = clamp(T.s, 0, L.len);
    if (T.v < 0.05 && vt === 0) { /* held by signal / power */ }
    else if (dist - adv < 0.03 && T.v < 0.3) { T.s = L.stops[nx.k].s; enterDwell(T, L, nx.k); }
  }
  function freeSeats(T) { return T.cars * MD.capacity - TR[T.id].pax.length; }

  // ============================================================ guests: boarding, riding, alighting
  function frontTiles(o) { return C.frontPathTiles(o); }
  function frontTile(o) { var f = frontTiles(o); return f.length ? f[0] : -1; }
  function stationConnected(o) {
    var fr = frontTiles(o);
    for (var k = 0; k < fr.length; k++) if (C.isParkConnected ? C.isParkConnected(fr[k]) : (C.getField('exit') && C.getField('exit')[fr[k]] < INF)) return true;
    return false;
  }
  function lineActive(L) {
    if (!L || !L.ok || L.paused || !linePowered()) return false;
    if (!L.trains.some(function (t) { return t.st !== 'idle'; })) return false;
    for (var k = 0; k < L.stops.length; k++) if (!stationPowered(L.stops[k].o)) return false;
    return true;
  }
  function stopComps(o, compAt) {
    var out = [], fr = frontTiles(o);
    for (var k = 0; k < fr.length; k++) {
      var c = compAt(fr[k]);
      if (c && out.indexOf(c) < 0) out.push(c);
    }
    return out;
  }
  function compHopDists(seeds, compAt) {
    var dist = {}, frontier = [], k, li, q;
    for (k = 0; k < seeds.length; k++) if (seeds[k] && dist[seeds[k]] === undefined) { dist[seeds[k]] = 0; frontier.push(seeds[k]); }
    while (frontier.length) {
      var next = [];
      for (li = 0; li < X.lines.length; li++) {
        var L = X.lines[li]; if (!lineActive(L) || L.stops.length < 2) continue;
        var minD = 9999;
        for (k = 0; k < L.stops.length; k++) {
          var cs = stopComps(L.stops[k].o, compAt);
          for (q = 0; q < cs.length; q++) if (dist[cs[q]] !== undefined && dist[cs[q]] < minD) minD = dist[cs[q]];
        }
        if (minD >= 9999) continue;
        for (k = 0; k < L.stops.length; k++) {
          var cs2 = stopComps(L.stops[k].o, compAt);
          for (q = 0; q < cs2.length; q++) if (dist[cs2[q]] === undefined) { dist[cs2[q]] = minD + 1; next.push(cs2[q]); }
        }
      }
      frontier = next;
    }
    return dist;
  }
  M.markReachable = function (reachComp, comp) {
    if (!X.lines.length) return;
    var changed = true;
    while (changed) {
      changed = false;
      for (var li = 0; li < X.lines.length; li++) {
        var L = X.lines[li]; if (!L.ok || L.stops.length < 2) continue;
        var has = false, k, q, fr;
        for (k = 0; k < L.stops.length && !has; k++) {
          fr = frontTiles(L.stops[k].o);
          for (q = 0; q < fr.length; q++) if (comp[fr[q]] && reachComp[comp[fr[q]]]) { has = true; break; }
        }
        if (!has) continue;
        for (k = 0; k < L.stops.length; k++) {
          fr = frontTiles(L.stops[k].o);
          for (q = 0; q < fr.length; q++) {
            var c = comp[fr[q]];
            if (c && !reachComp[c]) { reachComp[c] = 1; changed = true; }
          }
        }
      }
    }
  };
  M.canReachComp = function (fromComp, toComp, comp) {
    if (!fromComp || !toComp) return false;
    if (fromComp === toComp) return true;
    if (!X.lines.length) return false;
    var d = compHopDists([toComp], function (t) { return comp[t]; });
    return d[fromComp] !== undefined;
  };
  M.reachableComps = function (fromComp, comp) {
    var out = {};
    if (!fromComp) return out;
    out[fromComp] = true;
    if (!X.lines.length) return out;
    var d = compHopDists([fromComp], function (t) { return comp[t]; });
    for (var k in d) out[k] = true;
    return out;
  };
  function guestById(id) { return C.RT().gById.get(id); }
  // does guest g want to board this train at this stop (given the direction it will leave in)?
  function eligible(g, T, L, k) {
    var rt = TR[T.id];
    if (g.rdst > 0) {
      var di = stopOf(L, g.rdst); if (di < 0) return false;
      if (L.loop) return true;
      return rt.nd > 0 ? di > k : di < k;
    }
    return true;      // tour or refuge: any train
  }
  function pendingBoarders(T, L, o) {
    var q = C.RT().bq[o.id]; if (!q) return 0;
    var n = 0; for (var k = 0; k < q.q.length; k++) { var g = guestById(q.q[k]); if (g && g.state === 'queue' && eligible(g, T, L, T.at)) n++; }
    return n;
  }
  function boardOne(T, L, o) {
    var rt = TR[T.id], q = C.RT().bq[o.id]; if (!q || !q.q.length || freeSeats(T) <= 0) return false;
    for (var k = 0; k < q.q.length; k++) {
      var g = guestById(q.q[k]);
      if (!g || g.state !== 'queue') { q.q.splice(k, 1); k--; continue; }
      if (!eligible(g, T, L, T.at)) continue;
      var fare = fareOf(o), WX = C.WX(), isLeave = !!(g.rthen && g.rthen.gt === 'leave');
      if (fare > 0 && !isLeave && (fare > g.money * 0.85 || fare > MD.fareRef * g.tol * clamp(WX.spend, 0.5, 1.6) * 1.2)) {
        q.q.splice(k, 1); g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1; g.rdst = 0; g.rthen = null; g.mood -= 1.5; g.nbuy = C.gxHr() * 0.3; g.rn = now() + 0.5; C.say(g, 'expensive'); return true;
      }
      q.q.splice(k, 1);
      if (fare > 0 && isLeave && g.money < fare) fare = 0;
      if (fare > 0) { g.money -= fare; g.spent = (g.spent || 0) + fare; C.earn(fare, 'shops', g.x, g.z); o.minc = (o.minc || 0) + fare; o.mtoday = (o.mtoday || 0); S().mono.stats.income += fare; }
      o.mrides = (o.mrides || 0) + 1; o.mtoday = (o.mtoday || 0) + 1;
      var st = S().mono.stats; st.riders++; st.boardings++;
      // seat
      var used = {}, seat = -1, z; for (z = 0; z < rt.pax.length; z++) used[rt.pax[z].rseat] = 1;
      // spread over the cars: first free seat of the emptiest car
      var bestCar = 0, bc = 99; for (var cc = 0; cc < T.cars; cc++) { var n = 0; for (z = 0; z < MD.capacity; z++) if (used[cc * MD.capacity + z]) n++; if (n < bc && n < MD.capacity) { bc = n; bestCar = cc; } }
      for (z = 0; z < MD.capacity; z++) if (!used[bestCar * MD.capacity + z]) { seat = bestCar * MD.capacity + z; break; }
      g.state = 'ride'; g.rtr = T.id; g.rseat = seat; g.rfrom = o.id; g.rpass = 0; g.rend = 0; g.speed = 0; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1; g.wt = 0; g.rt0 = now(); g.rv = 0;
      g.rdst = g.rdst > 0 ? g.rdst : (g.rdst === -1 ? safeStop(L, T, g) : 0);
      rt.pax.push(g);
      g.mood += 2; C.say(g, 'monorail');
      placeRider(T, g);
      return true;
    }
    return false;
  }
  // the station furthest from any dangerous loose animal (refuge rides)
  function safeStop(L, T, g) {
    var esc = C.RT().escaped, best = -1, bs = -1;
    for (var k = 0; k < L.stops.length; k++) {
      var o = L.stops[k].o; if (o.id === g.rfrom) continue;
      var sc = 0; var cx = (o.i + 2) * TILE, cz = (o.j + 1) * TILE;
      for (var q = 0; q < esc.length; q++) if (C.aDanger(esc[q]) >= 2) { var dd = Math.hypot(esc[q].x - cx, esc[q].z - cz); sc = sc ? Math.min(sc, dd) : dd; }
      if (!stationConnected(o)) sc *= 0.2;
      if (sc > bs) { bs = sc; best = o.id; }
    }
    return best;
  }
  function alightOne(T, L, o) {
    var rt = TR[T.id], WXs = S(), k;
    for (k = 0; k < rt.pax.length; k++) {
      var g = rt.pax[k], off = false;
      if (g.rdst > 0 && g.rdst === o.id) off = true;
      else if (!g.rdst && g.rfrom === o.id && g.rpass >= 1) off = true;
      else if (!g.rleave && g.rend && (g.rpass >= 1 || g.rfrom !== o.id)) off = true;
      else if (g.rdst > 0 && stopOf(L, g.rdst) < 0) off = true;
      if (!off) continue;
      rt.pax.splice(k, 1);
      stepOff(g, o);
      return true;
    }
    return false;
  }
  function stepOff(g, o) {
    var fr = frontTiles(o), t = -1, plan0 = g.rthen;
    if (fr.length) {
      var cand = fr;
      if (plan0 && plan0.gt === 'enc') {
        var fe = C.getField('t' + plan0.spot);
        if (fe) { var m1 = fr.filter(function (q) { return fe[q] < INF; }); if (m1.length) cand = m1; }
      } else if (plan0 && plan0.gt === 'leave') {
        var fx = C.getField('exit');
        if (fx) { var m2 = fr.filter(function (q) { return fx[q] < INF; }); if (m2.length) cand = m2; }
      }
      t = cand[Math.floor(rng.next() * cand.length)];
    } else t = nearestPath(o);
    if (t < 0) { C.removeGuest(g); return; }
    var wasRefuge = g.rrefuge;
    g.x = tcx(t) + rng.range(-0.5, 0.5); g.z = tcz(t) + rng.range(-0.5, 0.5); g.y = 0; g.ti = t; g.ni = -1; g.state = 'walk'; g.glide = 0; g.speed = 0; g.gt = ''; g.dk = ''; g.gAge = 0; g.idle = 0; g.pv = 0;
    g.heading = rng.range(-PI, PI);
    g.mood += 3.5; g.rn = now() + 0.45;
    if (g.rtr !== undefined) { g.rtr = 0; }
    var rt0 = g.rt0 || now(), dur = (now() - rt0) * C.DAY_SECONDS;
    o.msat = o.msat === undefined ? g.happiness : o.msat + (g.happiness - o.msat) * 0.1;
    var plan = g.rthen; g.rthen = null; g.rdst = 0; g.rleave = 0;
    if (plan && plan.gt === 'enc') {
      var e = C.encById(plan.gid), f = C.getField('t' + plan.spot);
      if (e && f && f[g.ti] < INF) { g.gt = 'enc'; g.gid = plan.gid; g.dk = 't' + plan.spot; g.spot = plan.spot; C.RT().gtarg[plan.spot]++; }
      else if (e && f) M.shortcut(g, plan.spot, e, f, true);
    } else if (plan && plan.gt === 'leave') { C.startLeaving(g); }
    else if (wasRefuge) { g.rrefuge = 0; if (!C.getField('exit') || C.getField('exit')[g.ti] === INF) { /* nothing */ } }
    if (rng.chance(0.35) && !g.thoughtT) C.say(g, 'monorail');
  }
  function nearestPath(o) {
    var s = S(), fp = C.objFootprint(o), best = -1, bd = 1e9;
    for (var r = 1; r <= 8 && best < 0; r++) for (var dj = -r; dj <= fp.h + r; dj++) for (var di = -r; di <= fp.w + r; di++) {
      var x = fp.i0 + di, y = fp.j0 + dj; if (x < 0 || y < 0 || x >= N || y >= N || !s.path[x + y * N]) continue;
      var d = di * di + dj * dj; if (d < bd) { bd = d; best = x + y * N; }
    }
    return best;
  }
  function ejectAll(T) {
    var rt = TR[T.id]; if (!rt) return;
    var pax = rt.pax.slice(); rt.pax.length = 0;
    var L = rt.line, hs = null; if (L) for (var k = 0; k < L.stops.length; k++) if (L.stops[k].id === T.home) hs = L.stops[k].o;
    for (var q = 0; q < pax.length; q++) { var g = pax[q]; if (hs) stepOff(g, hs); else C.removeGuest(g); }
  }
  // used by releaseGuest (guest is removed or re-routed while riding)
  M.release = function (g) {
    var rt = TR[g.rtr]; if (rt) { var k = rt.pax.indexOf(g); if (k >= 0) rt.pax.splice(k, 1); }
    g.y = 0; g.rtr = 0;
  };
  function placeRider(T, g) {
    var rt = TR[T.id], car = Math.floor(g.rseat / MD.capacity), slot = g.rseat % MD.capacity, pose = rt.pose[car];
    if (!pose) { pose = rt.pose[car] = {}; carPose(T, car, pose); }
    var side = slot & 1 ? 1 : -1, row = slot >> 1, lx = side * 0.42, lz = -0.95 + row * 0.63 + (g.id % 3) * 0.02, ch = Math.cos(pose.h), sh = Math.sin(pose.h);
    g.x = pose.x + ch * lx + sh * lz; g.z = pose.z - sh * lx + ch * lz;
    g.y = pose.y + 0.12 - C.heightAt(g.x, g.z);
    g.heading = pose.h + (side > 0 ? PI / 2 : -PI / 2); g.hd = g.heading; g.speed = 0;
  }

  // ---- hooks called from the guest code in 20-sim.js
  // ---- ride appeal: where riding genuinely helps. Everything is counted in "tiles of walking" at about 1.5 tiles a second.
  var SEAT_SIT = 0.8;                 // a seated second counts a little less than a walking one
  function viewable(e) { var E = C.RT().encx[e.id]; return !!(E && E.nAn > 0 && e.viewTiles && e.viewTiles.length); }
  function seenFromAbove(e) { var E = C.RT().encx[e.id]; return !!(E && E.nAn > 0); }   // from the carriage no path is needed: a paddock with no viewing tiles is exactly what a line is good for
  function unseenOver(g, L) {         // [new enclosures, new species] that this line passes over or beside
    var ne = 0, ns = 0, seenSp = {}, k, q, e;
    for (k = 0; k < L.over.length; k++) {
      e = C.encById(L.over[k]); if (!e || !seenFromAbove(e)) continue;
      if (!g.seenEnc[e.id]) ne++;
      for (q = 0; q < e.species.length; q++) if (!g.seen[e.species[q]] && !seenSp[e.species[q]]) { seenSp[e.species[q]] = 1; ns++; }
    }
    return { enc: ne, sp: ns };
  }
  function unseenNear(g, o, notNear) {   // unseen exhibits within about 22 tiles of station o (and not that near station notNear)
    var encs = S().enclosures, n = 0, cx = (o.i + 2) * TILE, cz = (o.j + 1) * TILE, R2 = 44 * 44;
    var nx = notNear ? (notNear.i + 2) * TILE : 0, nz = notNear ? (notNear.j + 1) * TILE : 0;
    for (var k = 0; k < encs.length; k++) {
      var e = encs[k]; if (g.seenEnc[e.id] || !viewable(e)) continue;
      var dx = e.cx - cx, dz = e.cz - cz; if (dx * dx + dz * dz > R2) continue;
      if (notNear) { dx = e.cx - nx; dz = e.cz - nz; if (dx * dx + dz * dz <= R2) continue; }
      n++;
    }
    return n;
  }
  function lineTiming(L, a, b) {      // seconds aboard (a -> b) and the average wait for a train, with trains and queue taken into account
    var ds = Math.abs(L.stops[b].s - L.stops[a].s); if (L.loop) ds = L.stops[b].s > L.stops[a].s ? L.stops[b].s - L.stops[a].s : L.len - (L.stops[a].s - L.stops[b].s);
    var period = L.len * (L.loop ? 1 : 2) / MD.speed + L.stops.length * (MD.dwell + 2), run = 0, seats = 0;
    for (var k = 0; k < L.trains.length; k++) if (L.trains[k].st !== 'idle') { run++; seats += L.trains[k].cars * MD.capacity; }
    run = Math.max(1, run); seats = Math.max(MD.capacity * 2, seats / run);
    var q = C.RT().bq[L.stops[a].id], nq = q ? q.q.length : 0;
    var wait = period / run / 2 + Math.floor(nq / seats) * period / run + nq * 0.3;
    return { ride: ds / MD.speed + 4, wait: wait + 2, nq: nq };
  }
  function fareOK(g, o, mulMoney) {
    var fare = fareOf(o); if (fare <= 0) return true;
    return !(fare > g.money * mulMoney || fare > MD.fareRef * g.tol * clamp(C.WX().spend, 0.5, 1.6) * 1.2);
  }
  function farePenalty(o) { var f = fareOf(o); return f <= 0 ? -4 : (f - 2) * 1.6; }   // tiles of walking that a fare is worth: free rides are welcome, 12+ is dear
  function isTired(g) { return g.energy < g.tiredAt + 12; }
  M.queueLimit = function (g) { var o = C.RT().oById.get(g.gid); return o && BD()[o.type].mono ? 85 : 22; };
  // a tour ride (no particular exhibit): the pull of a ride is what it shows (unseen animals below the beam), where it goes (unseen exhibits on the other bank),
  // tired legs, the fare and the queue. A line that shows and serves nothing is only used by the tired and the curious.
  M.choose = function (g) {
    if (!X.lines.length || g.state !== 'walk') return false;
    if (g.rn && now() < g.rn) return false;
    if (!C.openNow() || !linePowered() || g.stay < C.gxHr() * 1.0) return false;
    if (g.hunger > 70 || g.thirst > 75 || g.bladder > 70) return false;
    var best = null, bp = 0, bdest = 0, bscenic = 0, k, li;
    for (li = 0; li < X.lines.length; li++) {
      var L = X.lines[li]; if (!lineActive(L)) continue;
      var sc = unseenOver(g, L);
      for (k = 0; k < L.stops.length; k++) {
        var o = L.stops[k].o; if (!fareOK(g, o, 0.7)) continue;
        var f = C.getField('b' + o.id); if (!f || !(f[g.ti] < INF) || !stationConnected(o)) continue;
        var d = f[g.ti]; if (d > 70) continue;
        var q = C.RT().bq[o.id]; if (q && q.q.length > 14) continue;
        var dest = 0, b2;
        for (b2 = 0; b2 < L.stops.length; b2++) if (b2 !== k && stationConnected(L.stops[b2].o)) dest = Math.max(dest, unseenNear(g, L.stops[b2].o, o));
        var scenic = Math.min(3, sc.enc) * 0.06 + Math.min(3, sc.sp) * 0.03;
        var useful = scenic + dest > 0 ? 1 : 0.2;      // tired or bored guests ride a line that shows and serves nothing far less
        var p = 0.01 + scenic + Math.min(3, dest) * 0.055 + ((isTired(g) ? 0.05 : 0) + (g.fun < 45 ? 0.02 : 0)) * useful;
        var fa = fareOf(o); p += fa <= 0 ? 0.08 : -Math.max(0, fa - 4) * 0.012;
        p -= Math.max(0, (q ? q.q.length : 0) - 3) * 0.02;
        p *= 1 - d / 95;
        if (g.rides) p *= 0.35;
        if (p > bp) { bp = p; best = o; bdest = dest; bscenic = scenic; }
      }
    }
    if (!best || rng.next() > bp) return false;
    var L2 = lineOfStationId(best.id), dst = 0;
    if (L2 && bdest > 0 && bdest * 0.055 >= bscenic) {      // one way, to the exhibits on the far side
      var bd2 = -1; for (k = 0; k < L2.stops.length; k++) if (L2.stops[k].id !== best.id && stationConnected(L2.stops[k].o)) { var n2 = unseenNear(g, L2.stops[k].o, best); if (n2 > bd2) { bd2 = n2; dst = L2.stops[k].id; } }
    }
    g.gt = 'bld'; g.gid = best.id; g.dk = 'b' + best.id; g.ni = -1; g.wt = 0; g.gAge = 0; g.pk = 'ride';
    g.rdst = dst; g.rfrom = best.id; g.rthen = null; g.rn = now() + 0.55; g.rides = (g.rides || 0) + 1;
    S().mono.stats.tours = (S().mono.stats.tours || 0) + 1;
    return true;
  };
  // a long walk to an exhibit (f = walking-distance field of the viewing spot, may be null) replaced by a ride?
  M.shortcut = function (g, spot, e, f, forceTransfer) {
    if (!X.lines.length || g.state !== 'walk' || !C.openNow() || !linePowered()) return false;
    var direct = f ? f[g.ti] : INF;
    if (!forceTransfer && direct < INF && g.rn && now() < g.rn) return false;
    if (direct < 22) return false;
    var compAt = C.compOf, dHop = null, myHop = 1;
    if (direct === INF && compAt) {
      var fromC = compAt(g.ti), toC = compAt(spot);
      if (!fromC || !toC) return false;
      if (fromC !== toC) {
        dHop = compHopDists([toC], compAt);
        myHop = dHop[fromC];
        if (myHop === undefined) return false;
      }
    }
    var walkCost = direct * (isTired(g) ? 1.4 : 1);
    var best = null, bc = 1e9;
    for (var li = 0; li < X.lines.length; li++) {
      var L = X.lines[li]; if (!lineActive(L)) continue;
      var sc = unseenOver(g, L), bonus = Math.min(3, sc.enc) * 4 + Math.min(3, sc.sp) * 2;
      for (var a = 0; a < L.stops.length; a++) {
        var A = L.stops[a].o, fa = C.getField('b' + A.id); if (!fa) continue;
        var dA = fa[g.ti]; if (!(dA < INF) || (direct < INF && dA > 45) || dA > direct * 0.7 || !stationConnected(A)) continue;
        if (!fareOK(g, A, 0.6)) continue;
        var qa = C.RT().bq[A.id]; if (qa && qa.q.length > 14) continue;
        for (var b = 0; b < L.stops.length; b++) {
          if (b === a) continue;
          var B = L.stops[b].o, dB = INF;
          if (f) {
            var frB = frontTiles(B);
            for (var q2 = 0; q2 < frB.length; q2++) if (f[frB[q2]] < dB) dB = f[frB[q2]];
          }
          if (!(dB < INF)) {
            if (!(myHop > 1 && dHop)) continue;
            var csB = stopComps(B, compAt), okHop = false;
            for (var q3 = 0; q3 < csB.length; q3++) if (dHop[csB[q3]] !== undefined && dHop[csB[q3]] < myHop) { okHop = true; dB = dHop[csB[q3]] * 25; break; }
            if (!okHop) continue;
          }
          var tm = lineTiming(L, a, b);
          var tot = dA + dB + (tm.ride + tm.wait) * 1.5 * SEAT_SIT + farePenalty(A) - bonus;
          if (tot < bc) { bc = tot; best = { A: A, B: B }; }
        }
      }
    }
    if (!best || !(bc < walkCost * 0.9)) return false;
    g.gt = 'bld'; g.gid = best.A.id; g.dk = 'b' + best.A.id; g.ni = -1; g.wt = 0; g.gAge = 0; g.pk = 'ride';
    g.rdst = best.B.id; g.rfrom = best.A.id; g.rthen = { gt: 'enc', gid: e.id, spot: spot }; g.rn = now() + 0.2; g.rides = (g.rides || 0) + 1;
    S().mono.stats.shortcuts = (S().mono.stats.shortcuts || 0) + 1;
    return true;
  };
  M.leaveVia = function (g) {
    if (!X.lines.length || !linePowered() || !C.compOf || !C.gateComps) return false;
    var compAt = C.compOf, fromC = compAt(g.ti); if (!fromC) return false;
    var exitDist = compHopDists(C.gateComps(), compAt), myHop = exitDist[fromC];
    if (myHop === undefined || myHop === 0) return false;
    var best = null, bc = 1e9;
    for (var li = 0; li < X.lines.length; li++) {
      var L = X.lines[li]; if (!lineActive(L) || L.stops.length < 2) continue;
      for (var a = 0; a < L.stops.length; a++) {
        var A = L.stops[a].o, fa = C.getField('b' + A.id); if (!fa) continue;
        var dA = fa[g.ti]; if (!(dA < INF)) continue;
        for (var b = 0; b < L.stops.length; b++) {
          if (b === a) continue;
          var B = L.stops[b].o, csB = stopComps(B, compAt), bHop = 9999;
          for (var q = 0; q < csB.length; q++) if (exitDist[csB[q]] !== undefined && exitDist[csB[q]] < bHop) bHop = exitDist[csB[q]];
          if (bHop >= myHop) continue;
          var tm = lineTiming(L, a, b);
          var sc = dA + (tm.ride + tm.wait) * 1.5 + bHop * 25;
          if (sc < bc) { bc = sc; best = { A: A, B: B }; }
        }
      }
    }
    if (!best) return false;
    g.state = 'walk'; g.glide = 0; g.gt = 'bld'; g.gid = best.A.id; g.dk = 'b' + best.A.id; g.ni = -1; g.wt = 0; g.gAge = 0; g.pk = 'ride';
    g.rdst = best.B.id; g.rfrom = best.A.id; g.rthen = { gt: 'leave' }; g.rleave = 1; g.fleeT = 0;
    return true;
  };
  M.arrive = function (g, o) {
    var L = lineOfStationId(o.id), q = C.RT().bq[o.id] || (C.RT().bq[o.id] = { use: 0, q: [] });
    var isLeave = !!(g.rthen && g.rthen.gt === 'leave');
    if (!L || !L.ok || L.paused || !linePowered() || !stationPowered(o) || !L.trains.length) { g.gt = ''; g.dk = ''; g.rdst = 0; g.rthen = null; g.rleave = 0; return; }
    if (q.q.length >= (isLeave ? 80 : 18)) { g.gt = ''; g.dk = ''; g.rdst = 0; g.rthen = null; g.rleave = 0; if (!isLeave) { C.say(g, 'crowded'); g.mood -= 1; } return; }
    g.state = 'queue'; g.wt = 0; q.q.push(g.id); g.speed = 0; C.gxPlace(g, false);
    var c = C.objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
  };
  // dangerous animal loose: guests near a working line go to the nearest station and get out of the park
  M.refuge = function (g) {
    if (g.rrefT && now() < g.rrefT) return false;
    g.rrefT = now() + 0.01;
    if (!X.lines.length || !linePowered()) return false;
    var best = null, bd = 18;
    for (var li = 0; li < X.lines.length; li++) {
      var L = X.lines[li]; if (!L.ok || L.paused || !L.trains.some(function (t) { return t.st === 'run' || t.st === 'dwell'; })) continue;
      for (var k = 0; k < L.stops.length; k++) {
        var o = L.stops[k].o, f = C.getField('b' + o.id); if (!f || !(f[g.ti] < bd)) continue;
        bd = f[g.ti]; best = o;
      }
    }
    if (!best) return false;
    g.gt = 'bld'; g.gid = best.id; g.dk = 'b' + best.id; g.ni = -1; g.wt = 0; g.pk = 'ride'; g.rdst = -1; g.rfrom = best.id; g.rthen = { gt: 'leave' }; g.rrefuge = 1; g.rn = now() + 0.3;
    return true;
  };
  var CAR_OV = [];
  M.rideTick = function (g, a) {
    var T = S().mono.trains.filter(function (t) { return t.id === g.rtr; })[0], rt = T && TR[T.id];
    if (!T || !rt || !rt.line || rt.pax.indexOf(g) < 0) {   // the train is gone: set the guest down
      if (X.stations.length) stepOff(g, X.stations[0].o); else C.removeGuest(g);
      return;
    }
    var D0 = MD, st = S().mono.stats;
    g.energy = Math.min(100, g.energy + 0.55 * a); g.mood += 0.25 * a;
    // closing time or the visit is up: get off at the next stop
    if (!C.openNow() || g.stay <= 0 || S().time >= C.CLOSE_T - 0.004) g.rend = 1;
    if (T.st === 'stuck') {
      g.mood -= 0.9 * a; if (rng.chance(0.15)) C.say(g, 'monorailStuck');
      rt.stuckT = rt.stuckT || 0; if (rt.stuckT > 25 && rng.chance(0.01 * a)) S().reputation = clamp(S().reputation - 0.15, 0, 100);
    }
    // what is under the window?  (the train's overlook list is refreshed twice a second)
    var car = Math.floor(g.rseat / D0.capacity), list = rt.ov, e, E, q, sp, d;
    var viewing = false;
    for (var li = 0; li < list.length && li < 2; li++) {
      var item = list[li]; e = C.encById(item.enc); if (!e) continue; E = C.RT().encx[e.id]; if (!E || E.nAn === 0) continue;
      viewing = true;
      var visF = Math.max(0.85, Math.min(1, E.vis / Math.max(1, E.nAn)));     // from above nothing hides behind a tree
      q = ((E.happy / 100) * 0.6 + 0.4 * visF) * (0.65 + 0.55 * item.w) * D0.viewMul;
      if (C.enclosureCrowded(e.id)) { q *= 0.65; g.mood -= 0.8 * a; C.say(g, 'enclosureCrowded', e.species[0]); }
      g.fun = Math.min(100, g.fun + 7 * a * q); g.mood += 2.4 * a * q;
      st.viewSec += a;
      g.wat = (g.wat || 0) + a;
      if (!g.seenEnc[e.id] && g.wat >= 1.5) {
        g.seenEnc[e.id] = 1; if (e.viewTiles && e.viewTiles.length) g.nSeen++; g.mood += 4;
      }
      var danger = 0, dsp = '';
      for (var s2 = 0; s2 < e.species.length; s2++) {
        sp = e.species[s2];
        if (!g.seen[sp]) { g.seen[sp] = 1; g.nsp = (g.nsp || 0) + 1; g.mood += 3; }
        var dd = C.SP()[sp] ? C.SP()[sp].danger || 0 : 0; if (dd > danger) { danger = dd; dsp = sp; }
      }
      if (danger >= 2) {          // a great predator seen safely from the carriage: a proper thrill
        g.mood += 1.1 * danger * a; g.fun = Math.min(100, g.fun + 3 * a);
        g.dg = g.dg || {};
        if (!g.dg[e.id] && rng.chance(0.3)) { g.dg[e.id] = 1; C.say(g, 'monorailDanger', dsp); st.danger++; }
      } else if (rng.chance(0.04)) C.say(g, 'monorail', e.species[0]);
      if (E.babies > 0 && rng.chance(0.05)) C.say(g, 'baby', e.species[0]);
      if (g.money > 2 && rng.chance(0.007 * a * (420 / (C.DAY_SECONDS || 420)))) { var amt = Math.min(g.money, 1 + Math.floor(rng.next() * 3)); g.money -= amt; g.spent = (g.spent || 0) + amt; C.earn(amt, 'donations', g.x, g.z); S().stats.donations += amt; }
    }
    if (!viewing && rng.chance(0.015)) C.say(g, 'monorail');
    // happiness while riding is lifted: this is the best seat in the park
    g.happiness = Math.min(100, g.happiness + 0.8 * a);
  };
  M.panicRelief = function () {
    var n = 0; for (var k = 0; k < X.lines.length; k++) if (X.lines[k].ok && linePowered() && !X.lines[k].paused && X.lines[k].trains.some(function (t) { return t.st !== 'idle'; })) n++;
    if (!n) return 0;
    var riders = 0, tr = S().mono.trains; for (k = 0; k < tr.length; k++) if (TR[tr[k].id]) riders += TR[tr[k].id].pax.length;
    return 0.0025 + 0.0004 * Math.min(10, riders) + 0.0004 * Math.min(3, n);
  };
  M.funCount = function () {
    if (!linePowered()) return 0;
    var n = 0; for (var k = 0; k < X.lines.length; k++) { var L = X.lines[k]; if (L.ok && !L.paused && L.trains.some(function (t) { return t.st !== 'idle'; })) n += Math.min(2, L.stops.length); }
    return n;
  };
  M.valueBonus = function () {
    var v = 0; for (var k = 0; k < X.lines.length; k++) { var L = X.lines[k]; if (L.ok && L.trains.some(function (t) { return t.st !== 'idle'; })) { v += 0.7 + 0.25 * Math.min(3, L.over.length); if (L.stops.every(function (p) { return p.o.mfree; })) v += 0.8; } }
    return Math.min(4, v);
  };
  M.mostOverlooked = function () { var m = 0; for (var k = 0; k < X.lines.length; k++) if (X.lines[k].ok) m = Math.max(m, X.lines[k].over.length); return m; };

  // ============================================================ per-step / per-day
  var acc = 0;
  M.step = function (dt) {
    var s = S(); if (!s || !s.mono) return;
    var trains = s.mono.trains, k, q, rt;
    if (!X.lines.length && !trains.length) return;
    for (k = 0; k < trains.length; k++) {
      var T = trains[k]; rt = TR[T.id]; if (!rt) continue;
      stepTrain(T, dt);
      // lane (slide aside when another train passes in the other direction)
      var L = rt.line, target = 0;
      if (L && L.ok && L.trains.length > 1) {
        for (q = 0; q < L.trains.length; q++) { var O = L.trains[q]; if (O === T || O.st === 'idle') continue; var dd = Math.abs(O.s - T.s); if (L.loop) dd = Math.min(dd, L.len - dd); if (dd < trainLen(T) / 2 + trainLen(O) / 2 + 6 && O.dir !== T.dir) target = 0.8 * T.dir; }
      }
      T.lane = (T.lane || 0) + (target - (T.lane || 0)) * Math.min(1, dt * 2.5);
      // poses + riders
      if (L && L.ok && T.st !== 'idle') {
        for (var c = 0; c < T.cars; c++) { var po = rt.pose[c] || (rt.pose[c] = {}); carPose(T, c, po); }
        for (q = 0; q < rt.pax.length; q++) placeRider(T, rt.pax[q]);
        // anchor
        var mid = rt.pose[Math.floor(T.cars / 2)], at = C.tileOf(mid.x, mid.z);
        if (at !== rt.anchor) { rt.prevAnchor = rt.anchor; rt.anchor = at; }
        rt.ovT -= dt;
        if (rt.ovT <= 0) { rt.ovT = 0.5; refreshOverlook(T, rt, L); }
      }
    }
  };
  function refreshOverlook(T, rt, L) {
    // enclosures under / beside the carriages (up to 3 cars sampled), best first
    var acc = {}, ids = [], c, q;
    for (c = 0; c < T.cars; c++) {
      var po = rt.pose[c]; if (!po) continue;
      var t = C.tileOf(po.x, po.z), k = X.nodeK[t];
      if (k < 0 || X.nodeLine[t] < 0) { // between nodes (corners): nearest node by tile
        continue;
      }
      var Lx = X.lines[X.nodeLine[t]]; if (Lx !== L) continue;
      for (q = 0; q < 3; q++) {
        var e = L.ovE[k * 3 + q]; if (!e) continue;
        var w = L.ovW[k * 3 + q], cur = acc[e];
        if (cur === undefined) { acc[e] = w; ids.push(e); } else if (w > cur) acc[e] = w;
      }
    }
    var out = rt.ov; out.length = 0;
    ids.sort(function (a, b) { return acc[b] - acc[a]; });
    for (q = 0; q < ids.length; q++) out.push({ enc: ids[q], w: acc[ids[q]] });
  }
  M.newDay = function () {
    var s = S(), up = 0, tr = s.mono.trains;
    for (var k = 0; k < tr.length; k++) up += MD.trainUpkeep + (tr[k].cars) * MD.carUpkeep;
    if (up) C.spend(Math.round(up), 'upkeep');
    for (k = 0; k < s.objects.length; k++) { var o = s.objects[k]; if (o.mtoday !== undefined) { o.mday = o.mtoday; o.mtoday = 0; } }
  };

  // ============================================================ save / load
  M.afterLoad = function () {
    var s = S(); if (!s) return;
    if (!s.rail || s.rail.length !== NN) s.rail = new Uint8Array(NN);
    if (!s.mono) s.mono = { trains: [], nextTrain: 1, stats: {}, powered: true };
    ensureFields(s);
    TR = {}; X = emptyX();
    s.mono.trains.forEach(function (T) { TR[T.id] = newRt(); if (T.s === undefined) T.s = 0; if (!T.dir) T.dir = 1; T.v = T.v || 0; T.lane = T.lane || 0; if (!T.st) T.st = 'dwell'; if (T.brk === undefined) T.brk = -1; });
    M.update();
    // riders re-attach to their trains
    var gs = s.guests, k;
    for (k = gs.length - 1; k >= 0; k--) {
      var g = gs[k]; if (g.state !== 'ride' || g.sfv || g.coasterTrain) continue;   // safari & coaster packages: their riders are relinked by their own afterLoad
      var T = s.mono.trains.filter(function (t) { return t.id === g.rtr; })[0], rt = T && TR[T.id];
      if (T && rt && rt.line && rt.line.ok && T.st !== 'idle') { rt.pax.push(g); }
      else { var o = X.stations.length ? X.stations[0].o : null; if (o) stepOff(g, o); else { g.state = 'walk'; g.y = 0; g.gt = ''; g.dk = ''; } }
    }
    // poses so the first frame is right
    s.mono.trains.forEach(function (T) { var rt = TR[T.id]; if (rt && rt.line && rt.line.ok) for (var c = 0; c < T.cars; c++) { var po = rt.pose[c] || (rt.pose[c] = {}); carPose(T, c, po); } });
    s.mono.trains.forEach(function (T) { var rt = TR[T.id]; if (rt) rt.pax.forEach(function (g) { placeRider(T, g); }); });
  };

  // ============================================================ queries for the UI, the world and later packages
  // Which enclosures does this line overlook?  [{enc, over:true if the beam passes above its tiles}]
  M.overlookedBy = function (lineKey) {
    for (var k = 0; k < X.lines.length; k++) if (X.lines[k].key === lineKey || X.lines[k].stops.some(function (p) { return p.id === lineKey; })) {
      var L = X.lines[k], out = {}, n = L.nodes.length, q, r;
      for (q = 0; q < n; q++) for (r = 0; r < 3; r++) { var e = L.ovE[q * 3 + r]; if (!e) continue; var d = L.ovD[q * 3 + r], w = L.ovW[q * 3 + r]; var cur = out[e] || (out[e] = { enc: e, over: false, w: 0 }); if (d === 0) cur.over = true; if (w > cur.w) cur.w = w; }
      return Object.keys(out).map(function (e2) { return out[e2]; }).sort(function (a, b) { return b.w - a.w; });
    }
    return [];
  };
  // 0..1: how well a RUNNING, powered line shows this enclosure to riders (0 = none).  Use it to weight appeal, safari scores, etc.
  M.viewBonus = function (encId) {
    var best = 0;
    for (var k = 0; k < X.lines.length; k++) {
      var L = X.lines[k]; if (!L.ok || L.paused || !linePowered() || !L.trains.some(function (t) { return t.st === 'run' || t.st === 'dwell'; })) continue;
      for (var q = 0; q < L.ovE.length; q++) if (L.ovE[q] === encId) { var w = L.ovW[q]; if (w > best) best = w; }
    }
    return best;
  };
  M.overlooks = function (encId) {   // lines (keys) that pass over or beside this enclosure
    var out = [];
    for (var k = 0; k < X.lines.length; k++) { var L = X.lines[k]; for (var q = 0; q < L.ovE.length; q++) if (L.ovE[q] === encId) { out.push(L.key); break; } }
    return out;
  };
  M.footprintOverlooks = footprintOverlooks;
  M.state = function () { return X; };
  M.world = function () { return X; };
  M.version = function () { return X.ver; };
  M.trains = function () { return S().mono.trains; };
  M.trainRt = function (id) { return TR[id] || null; };
  M.stationName = stationName;
  M.fareOf = fareOf;
  M.heightAt = function (t) { return X.h[t]; };
  M.stationDeck = function (id) { for (var k = 0; k < X.stations.length; k++) if (X.stations[k].id === id) return X.stations[k].deck; return null; };
  M.lines = function () {
    var out = [], s = S();
    for (var k = 0; k < X.lines.length; k++) {
      var L = X.lines[k], riders = 0, inc = 0, today = 0, sat = 0, ns = 0, cap = 0, onboard = 0;
      for (var q = 0; q < L.stops.length; q++) { var o = L.stops[q].o; inc += o.minc || 0; today += (o.mtoday || 0); riders += o.mrides || 0; if (o.msat !== undefined) { sat += o.msat; ns++; } }
      L.trains.forEach(function (t) { cap += t.cars * MD.capacity; onboard += TR[t.id] ? TR[t.id].pax.length : 0; });
      var fo = L.stops.length ? L.stops[0].o : null;
      out.push({ key: L.key, ok: L.ok, why: L.why, loop: L.loop, length: Math.round(L.len / TILE), stations: L.stops.map(function (p) { return { id: p.id, name: stationName(p.o) }; }), trains: L.trains.map(function (t) { return t.id; }), nTrains: L.trains.length,
        maxTrains: MD.maxTrains, capacity: cap, onboard: onboard, rides: riders, today: today, income: Math.round(inc), sat: ns ? Math.round(sat / ns) : null, over: L.over.slice(), paused: L.paused, fare: fo ? fareOf(fo) : MD.fare, free: !!(fo && fo.mfree),
        stuck: L.trains.filter(function (t) { return t.st === 'stuck'; }).length });
    }
    return out;
  };
  M.stationInfo = function (id) {
    var s = S(), o = s.objects.filter(function (q) { return q.id === id; })[0]; if (!o) return null;
    var L = lineOfStationId(id), li = null, lines = M.lines();
    if (L) for (var k = 0; k < lines.length; k++) if (lines[k].key === L.key) li = lines[k];
    var q = C.RT().bq[id];
    return { id: id, name: stationName(o), line: li, queue: q ? q.q.length : 0, today: o.mtoday || 0, yesterday: o.mday || 0, rides: o.mrides || 0, income: Math.round(o.minc || 0), sat: o.msat === undefined ? null : Math.round(o.msat),
      fare: fareOf(o), free: !!o.mfree, paused: !!o.mpause, powered: stationPowered(o) && linePowered(), needsPower: true, canBuy: !!L && L.trains.length < MD.maxTrains, line_ok: !!(L && L.ok), why: L ? L.why : 'Link this station to track' };
  };
  M.trainInfo = function (id) {
    var s = S(), T = s.mono.trains.filter(function (t) { return t.id === id; })[0]; if (!T) return null;
    var rt = TR[id] || newRt(), L = rt.line, pos = rt.pose[0] || null, ns = L && L.ok && T.st === 'run' ? nextStop(L, T) : null;
    var nm = ns ? stationName(L.stops[ns.k].o) : (L && L.stops[T.at] && T.st === 'dwell' ? stationName(L.stops[T.at].o) : '');
    return { id: id, cars: T.cars, st: T.st, why: T.why, brk: Math.max(0, Math.round(T.brk)), fixer: rt.fixer, pax: rt.pax.length, capacity: T.cars * MD.capacity, speed: T.v, next: nm, home: T.home,
      x: pos ? rt.pose[Math.floor(T.cars / 2)].x : 0, z: pos ? rt.pose[Math.floor(T.cars / 2)].z : 0, y: pos ? rt.pose[Math.floor(T.cars / 2)].y : 0, ok: !!(L && L.ok), sell: Math.round((T.paid || MD.trainCost) * MD.refundTrain), over: rt.ov.slice(0, 2) };
  };
  // trains sorted for rendering; each {T, rt}
  M.trainPoses = function () { return S().mono.trains; };
  M.dir = DT4;
})();
