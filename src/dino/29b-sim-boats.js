// ===== 29b-sim-boats.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - boats package, sim side (DOM-free, runs under node): floating pontoons, guest piers, service piers, staff and VIP helipads.
   SAVED state:  S.boats { stats{riders,income,staffTrips,vip,vipIncome}, vipT }; pier and pad objects (D.buildings with def.boats = guest|service|staff|vip) carry fare, mfree, mrides, minc.
                 pontoons are a path type (D.paths 'pontoon') on water tiles.
   DERIVED (rebuilt by updateGraph() from terrain, paths and objects): water bodies, terminals, links between path components.
   RUNTIME only (never saved): trips in progress (guest/staff on a boat or staff helicopter hop), helicopters at VIP pads.  Guests aboard are in state 'boat'.
   Hooks in 20-sim.js call into Z.Boats (guarded with `Z.Boats &&`). */
(function () {
  'use strict';
  var C = Z.monoCtx; if (!C) return;
  var N = Z.N, NN = N * N, TILE = Z.TILE, D = Z.DATA, BC = D.boats, rng = Z.rng, clamp = C.clamp, INF = C.INF;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; NN = n * n; X = emptyX(); });
  var B = Z.Boats = {};
  if (Z.Sim) Z.Sim.boats = B;
  function S() { return C.S(); }
  function RT() { return C.RT(); }
  var WIDX = -2;
  function waterIdx() { if (WIDX === -2) WIDX = D.terrain.findIndex(function (q) { return q.id === 'water'; }); return WIDX; }
  function tcx(t) { return (t % N + 0.5) * TILE; }
  function tcz(t) { return (((t - (t % N)) / N) + 0.5) * TILE; }
  function now() { var s = S(); return s.day + s.time; }
  function fareOf(o) { return o.mfree ? 0 : (o.fare === undefined ? BC.fare : o.fare); }
  B.fareOf = fareOf;

  var X = emptyX();
  function emptyX() {
    return { body: new Int16Array(NN), prev: new Int32Array(NN), terms: [], gEdges: [], sLinks: [], sCache: {}, trips: [], helis: [], plans: {}, staffTrip: {}, ver: 0 };
  }

  // ============================================================ derived graph
  function labelWater() {
    var s = S(), W = waterIdx(), body = X.body, q = RT().queue, nb = 0, t, h, tl;
    body.fill(0);
    for (t = 0; t < NN; t++) {
      if (s.terrain[t] !== W || s.path[t] || body[t]) continue;
      nb++; body[t] = nb; h = 0; tl = 0; q[tl++] = t;
      while (h < tl) {
        var u = q[h++], i = u % N;
        if (u >= N && s.terrain[u - N] === W && !s.path[u - N] && !body[u - N]) { body[u - N] = nb; q[tl++] = u - N; }
        if (u < NN - N && s.terrain[u + N] === W && !s.path[u + N] && !body[u + N]) { body[u + N] = nb; q[tl++] = u + N; }
        if (i > 0 && s.terrain[u - 1] === W && !s.path[u - 1] && !body[u - 1]) { body[u - 1] = nb; q[tl++] = u - 1; }
        if (i < N - 1 && s.terrain[u + 1] === W && !s.path[u + 1] && !body[u + 1]) { body[u + 1] = nb; q[tl++] = u + 1; }
      }
    }
  }
  // a free water tile touching the building's footprint
  function dockOf(fp) {
    var body = X.body, a, b, x, y, t;
    for (a = -1; a <= fp.w; a++) for (b = -1; b <= fp.h; b++) {
      if ((a >= 0 && a < fp.w) === (b >= 0 && b < fp.h)) continue;
      x = fp.i0 + a; y = fp.j0 + b;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      t = x + y * N; if (body[t]) return t;
    }
    return -1;
  }
  function pushEdge(list, a, b) { if (a && b && a !== b) list.push([a, b]); }
  B.updateGraph = function () {
    var s = S(), rt = RT(), comp = rt.comp, defs = C.BD(), k, j;
    X = X.body.length === NN ? X : emptyX();
    X.terms = []; X.gEdges = []; X.sLinks = []; X.sCache = {}; X.ver++;
    labelWater();
    for (k = 0; k < s.objects.length; k++) {
      var o = s.objects[k], def = o.kind === 'building' && defs[o.type]; if (!def || !def.boats) continue;
      var fr = C.frontPathTiles(o), term = { o: o, kind: def.boats, front: fr.length ? fr[0] : -1, comp: fr.length ? comp[fr[0]] : 0, dock: -1, body: 0 };
      if (def.boats === 'guest' || def.boats === 'service') { term.dock = dockOf(C.objFootprint(o)); term.body = term.dock >= 0 ? X.body[term.dock] : 0; }
      X.terms.push(term);
    }
    var T = X.terms;
    for (k = 0; k < T.length; k++) for (j = 0; j < T.length; j++) {
      var a = T[k], b = T[j]; if (a === b || !a.comp || !b.comp || a.comp === b.comp) continue;
      var water = a.body && a.body === b.body, air = a.kind === 'staff' && b.kind === 'staff';
      if (water && a.kind === 'guest' && b.kind === 'guest') pushEdge(X.gEdges, a.comp, b.comp);
      if ((water && a.kind !== 'vip' && b.kind !== 'vip') || air) X.sLinks.push({ a: a.front, b: b.front, ta: a, tb: b, air: air });
    }
  };

  // ============================================================ reachability
  function closure(from, edges) {
    var reach = {}, queue = [from], h = 0, q; reach[from] = true;
    while (h < queue.length) {
      var c = queue[h++];
      for (q = 0; q < edges.length; q++) if (edges[q][0] === c && !reach[edges[q][1]]) { reach[edges[q][1]] = true; queue.push(edges[q][1]); }
    }
    return reach;
  }
  B.markReachable = function (reachComp, comp) {
    var changed = true, q;
    while (changed) {
      changed = false;
      for (q = 0; q < X.gEdges.length; q++) {
        var e = X.gEdges[q]; if (reachComp[e[0]] && !reachComp[e[1]]) { reachComp[e[1]] = 1; changed = true; }
      }
    }
  };
  // guests: one boat hop
  B.canReachComp = function (fromComp, toComp) {
    for (var q = 0; q < X.gEdges.length; q++) if (X.gEdges[q][0] === fromComp && X.gEdges[q][1] === toComp) return true;
    return false;
  };
  B.addReachable = function (fromComp, map) {
    for (var q = 0; q < X.gEdges.length; q++) if (X.gEdges[q][0] === fromComp) map[X.gEdges[q][1]] = true;
  };
  // staff: any number of hops over piers and helipads
  B.staffComps = function (c) {
    if (!X.sLinks.length) return null;
    if (!X.sCache[c]) {
      var comp = RT().comp, edges = X.sLinks.map(function (l) { return [comp[l.a], comp[l.b]]; });
      X.sCache[c] = closure(c, edges);
    }
    return X.sCache[c];
  };
  // find(from, pred) is the caller's in-component route search; returns a route over components joined by links (the jump is two non-adjacent tiles in a row)
  B.linkRoute = function (from, goal, find) {
    if (!X.sLinks.length) return null;
    var comp = RT().comp, seen = {}, queue = [{ tile: from, route: [] }], h = 0, q;
    seen[comp[from]] = true;
    while (h < queue.length) {
      var cur = queue[h++], cc = comp[cur.tile];
      for (q = 0; q < X.sLinks.length; q++) {
        var L = X.sLinks[q]; if (comp[L.a] !== cc || seen[comp[L.b]]) continue;
        seen[comp[L.b]] = true;
        var r1 = find(cur.tile, function (t) { return t === L.a; }); if (!r1) continue;
        var route = cur.route.concat(r1, [L.b]), r2 = find(L.b, goal);
        if (r2) return route.concat(r2);
        queue.push({ tile: L.b, route: route });
      }
    }
    return null;
  };

  // ============================================================ placement
  B.placeCheck = function (type, fp) {
    var s = S(), def = C.BD()[type]; if (!def || !def.boats) return null;
    var front = [], k, rot = fp.rot;
    for (k = 0; k < (rot & 1 ? fp.h : fp.w); k++) {
      var x, y;
      if (rot === 0) { x = fp.i0 + k; y = fp.j0 + fp.h; } else if (rot === 2) { x = fp.i0 + k; y = fp.j0 - 1; } else if (rot === 1) { x = fp.i0 + fp.w; y = fp.j0 + k; } else { x = fp.i0 - 1; y = fp.j0 + k; }
      if (x >= 0 && y >= 0 && x < N && y < N) front.push(x + y * N);
    }
    if (!front.some(function (t) { return s.path[t]; })) return { msg: 'The ' + def.name.toLowerCase() + ' needs a path touching its entrance' };
    if ((def.boats === 'guest' || def.boats === 'service') && dockOf(fp) < 0) return { msg: 'A pier must touch open water on the shore' };
    return null;
  };

  // ============================================================ fares and settings
  B.setFare = function (id, fare) {
    var o = RT().oById.get(id); if (!o) return C.fail('No such pier');
    o.fare = clamp(Math.round((+fare || 0) * 2) / 2, 0, BC.fareMax); return C.okr(0);
  };
  B.setFree = function (id, on) {
    var o = RT().oById.get(id); if (!o) return C.fail('No such pier');
    o.mfree = on ? 1 : 0; return C.okr(0);
  };
  function fareOK(g, o) {
    var fare = fareOf(o);
    return fare <= 0 || !(fare > g.money * 0.85 || fare > BC.fareRef * g.tol * clamp(C.WX().spend, 0.5, 1.6) * 1.2);
  }

  // ============================================================ trips (boats and staff helicopter hops)
  function waterRoute(A, Bt) {
    var s = S(), body = X.body, prev = X.prev, q = RT().queue, h = 0, tl = 0, seen = RT().stamp, st = ++RT().stampN, from = A.dock, to = Bt.dock, t;
    if (from < 0 || to < 0 || body[from] !== body[to]) return null;
    q[tl++] = from; seen[from] = st; prev[from] = -1;
    while (h < tl && seen[to] !== st) {
      var u = q[h++], i = u % N, nbrs = [u >= N ? u - N : -1, u < NN - N ? u + N : -1, i > 0 ? u - 1 : -1, i < N - 1 ? u + 1 : -1];
      for (var d = 0; d < 4; d++) {
        t = nbrs[d]; if (t < 0 || seen[t] === st || body[t] !== body[from]) continue;
        seen[t] = st; prev[t] = u; q[tl++] = t;
      }
    }
    if (seen[to] !== st) return null;
    var tiles = []; for (t = to; t !== -1; t = prev[t]) tiles.push(t);
    tiles.reverse();
    return tiles.map(function (u2) { return { x: tcx(u2), z: tcz(u2) }; });
  }
  function padCentre(o) { var fp = C.objFootprint(o); return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE }; }
  function startTrip(e, isGuest, A, Bt, plan) {
    var air = A.kind === 'staff', pts;
    if (air) pts = [padCentre(A.o), padCentre(Bt.o)];
    else pts = waterRoute(A, Bt);
    if (!pts) return null;
    var cum = [0], k;
    for (k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
    var trip = { e: e, guest: isGuest, from: A, to: Bt, plan: plan || null, pts: pts, cum: cum, len: cum[cum.length - 1], d: 0, air: air, x: pts[0].x, z: pts[0].z, h: 0 };
    e.absY = air ? -6 : 0.1;
    X.trips.push(trip);
    if (!isGuest) X.staffTrip[e.id] = trip;
    poseTrip(trip);
    return trip;
  }
  function poseTrip(t) {
    var k = 1, d = Math.min(t.d, t.len);
    while (k < t.pts.length - 1 && t.cum[k] < d) k++;
    var a = t.pts[k - 1], b = t.pts[k] || a, seg = t.cum[k] - t.cum[k - 1], f = seg > 0 ? (d - t.cum[k - 1]) / seg : 0;
    t.x = a.x + (b.x - a.x) * f; t.z = a.z + (b.z - a.z) * f;
    if (b !== a) t.h = Math.atan2(b.x - a.x, b.z - a.z);
    t.e.x = t.x; t.e.z = t.z; t.e.heading = t.h;
  }
  function tripLength(t) { return Math.max(t.len, t.air ? 0 : BC.minTrip); }
  function landAt(e, term, tile) {
    e.x = tcx(tile) + rng.range(-0.4, 0.4); e.z = tcz(tile) + rng.range(-0.4, 0.4); e.ti = tile; e.ni = -1; e.absY = null; e.speed = 0;
  }
  function finishTrip(t) {
    var e = t.e, tile = t.to.front, plan = t.plan;
    if (!t.guest) {
      landAt(e, t.to, tile);
      if (e.route && e.route[e.ri] === tile) e.ri++;
      delete X.staffTrip[e.id];
      S().boats.stats.staffTrips++;
      return;
    }
    landAt(e, t.to, tile); e.state = 'walk'; e.glide = 0; e.gt = ''; e.dk = ''; e.gAge = 0; e.idle = 0; e.pv = 0; e.mood += 2; e.rn = now() + 0.3;
    C.say(e, 'boat');
    var enc = plan && C.encById(plan.gid), f = plan && C.getField('t' + plan.spot);
    if (enc && f && f[e.ti] < INF) { e.gt = 'enc'; e.gid = plan.gid; e.dk = 't' + plan.spot; e.spot = plan.spot; RT().gtarg[plan.spot]++; }
  }
  function stepTrips(dt) {
    var rt = RT(), k;
    for (k = X.trips.length - 1; k >= 0; k--) {
      var t = X.trips[k], alive = t.guest ? rt.gById.get(t.e.id) === t.e : rt.sById.get(t.e.id) === t.e;
      if (!alive) { X.trips.splice(k, 1); if (!t.guest) delete X.staffTrip[t.e.id]; continue; }
      t.d += (t.air ? BC.airSpeed : BC.speed) * dt;
      poseTrip(t);
      if (t.d >= tripLength(t)) { X.trips.splice(k, 1); finishTrip(t); }
    }
  }
  B.trips = function () { return X.trips; };
  B.release = function (g) {
    for (var k = 0; k < X.trips.length; k++) if (X.trips[k].e === g) { X.trips.splice(k, 1); break; }
    for (var q = 0; q < X.helis.length; q++) if (X.helis[q].e === g) X.helis[q].e = null;
    g.absY = null;
  };

  // ---- staff
  B.staffTravelling = function (s) { return !!X.staffTrip[s.id]; };
  B.staffJump = function (s, a, b) {
    if (X.staffTrip[s.id]) return true;
    for (var k = 0; k < X.sLinks.length; k++) {
      var L = X.sLinks[k]; if (L.a !== a || L.b !== b) continue;
      s.state = 'idle'; s.speed = 0;
      return !!startTrip(s, false, L.ta, L.tb, null);
    }
    return false;
  };

  // ---- guests
  // a guest who cannot walk to an exhibit is taken by boat: walk to a pier on the same water as a pier beside the exhibit's paths
  B.shortcut = function (g, spot, e, f) {
    if (g.state !== 'walk' || !X.gEdges.length || (f && f[g.ti] < INF)) return false;
    var comp = RT().comp, fromC = comp[g.ti], toC = comp[spot]; if (!fromC || !toC || fromC === toC) return false;
    var best = null, bd = INF, T = X.terms, k, j;
    for (k = 0; k < T.length; k++) {
      var A = T[k]; if (A.kind !== 'guest' || A.comp !== fromC || !A.body || !fareOK(g, A.o)) continue;
      var fa = C.getField('b' + A.o.id); if (!fa || !(fa[g.ti] < INF)) continue;
      for (j = 0; j < T.length; j++) {
        var Bt = T[j]; if (Bt.kind !== 'guest' || Bt.comp !== toC || Bt.body !== A.body) continue;
        var d = fa[g.ti] + Math.abs(Bt.dock % N - A.dock % N) + Math.abs(((Bt.dock / N) | 0) - ((A.dock / N) | 0));
        if (d < bd) { bd = d; best = { A: A, B: Bt }; }
      }
    }
    if (!best) return false;
    g.gt = 'bld'; g.gid = best.A.o.id; g.dk = 'b' + g.gid; g.ni = -1; g.wt = 0; g.gAge = 0;
    X.plans[g.id] = { to: best.B.o.id, gid: e.id, spot: spot };
    return true;
  };
  function termOf(o) { for (var k = 0; k < X.terms.length; k++) if (X.terms[k].o === o) return X.terms[k]; return null; }
  // guest reaches a pier (to board) or a VIP pad (to fly home)
  B.arrive = function (g, o) {
    var plan = X.plans[g.id], A = termOf(o); delete X.plans[g.id];
    if (g.vip && g.hleave && o.type === 'vip_helipad') { departVip(g, o); return; }
    g.gt = ''; g.dk = '';
    if (!A || A.kind !== 'guest' || !plan) return;
    var Bt = termOf(RT().oById.get(plan.to));
    if (!Bt || Bt.body !== A.body || !fareOK(g, o)) { g.mood -= 1.5; C.say(g, 'expensive'); return; }
    var fare = fareOf(o);
    if (fare > 0) { g.money -= fare; g.spent = (g.spent || 0) + fare; C.earn(fare, 'shops', g.x, g.z); o.minc = (o.minc || 0) + fare; S().boats.stats.income += fare; }
    o.mrides = (o.mrides || 0) + 1; S().boats.stats.riders++;
    if (startTrip(g, true, A, Bt, plan)) { g.state = 'boat'; g.speed = 0; g.glide = 0; }
  };

  // ============================================================ VIP helipad
  function padBusy(o) { return X.helis.some(function (h) { return h.pad === o.id; }); }
  function vipPads() { return X.terms.filter(function (t) { return t.kind === 'vip' && t.front >= 0; }); }
  function startArrival(term) {
    X.helis.push({ pad: term.o.id, kind: 'in', t: 0, dur: BC.vip.flyIn, e: null });
  }
  function touchdown(term) {
    var s = S(), g = C.spawnGuest(RT().nextGroup++, false, term.front);
    if (!g) return;
    g.vip = 1; g.money = Math.round(g.money * BC.vip.spend); g.tol *= 1.6;
    C.earn(BC.vip.fee, 'tickets', g.x, g.z);
    s.boats.stats.vip++; s.boats.stats.vipIncome += BC.vip.fee;
    C.say(g, 'vip');
  }
  B.leaveByHeli = function (g) {
    var best = null, bd = INF, k, T = vipPads();
    for (k = 0; k < T.length; k++) {
      var f = C.getField('b' + T[k].o.id); if (!f || !(f[g.ti] < INF) || f[g.ti] >= bd) continue;
      bd = f[g.ti]; best = T[k];
    }
    if (!best) return false;
    g.state = 'walk'; g.glide = 0; g.gt = 'bld'; g.gid = best.o.id; g.dk = 'b' + g.gid; g.ni = -1; g.wt = 0; g.fleeT = 0; g.rleave = 1; g.hleave = 1;
    return true;
  };
  function departVip(g, o) {
    g.gt = ''; g.dk = ''; g.state = 'boat'; g.speed = 0; g.glide = 0; g.absY = -6;
    X.helis.push({ pad: o.id, kind: 'out', t: 0, dur: BC.vip.flyOut, e: g });
  }
  function stepHelis(dt) {
    var s = S(), k, T = vipPads();
    for (k = X.helis.length - 1; k >= 0; k--) {
      var h = X.helis[k], term = null, q;
      for (q = 0; q < T.length; q++) if (T[q].o.id === h.pad) term = T[q];
      h.t += dt;
      if (!term) { X.helis.splice(k, 1); if (h.e) C.removeGuest(h.e); continue; }
      if (h.t < h.dur) continue;
      X.helis.splice(k, 1);
      if (h.kind === 'in') touchdown(term); else if (h.e) C.removeGuest(h.e);
    }
    if (!T.length || !C.openNow()) return;
    s.boats.vipT -= dt;
    if (s.boats.vipT > 0) return;
    s.boats.vipT = rng.range(BC.vip.every[0], BC.vip.every[1]) / (0.6 + 0.2 * s.rating);
    var free = T.filter(function (t) { return !padBusy(t.o); });
    if (free.length) startArrival(free[Math.floor(rng.next() * free.length)]);
  }
  B.helis = function () { return X.helis; };

  B.step = function (dt) {
    var s = S(); if (!s || !s.boats) return;
    stepTrips(dt); stepHelis(dt);
  };

  // ============================================================ lifecycle and queries
  function defaults(s) {
    var b = s.boats = s.boats || {};
    b.stats = Object.assign({ riders: 0, income: 0, staffTrips: 0, vip: 0, vipIncome: 0 }, b.stats);
    if (typeof b.vipT !== 'number') b.vipT = 20;
  }
  B.afterLoad = function () {
    var s = S(); if (!s) return;
    defaults(s);
    X = emptyX();
    s.guests.forEach(function (g) { g.absY = null; });
    s.staff.forEach(function (m) { m.absY = null; });
    B.updateGraph();
    C.refreshConnectivity();
  };
  B.pierInfo = function (id) {
    var o = RT().oById.get(id), t = o && termOf(o); if (!t) return null;
    var peers = X.terms.filter(function (p) { return p !== t && (t.body ? p.body === t.body : t.kind === 'staff' && p.kind === 'staff'); }).length;
    return { kind: t.kind, fare: fareOf(o), free: !!o.mfree, rides: o.mrides || 0, income: o.minc || 0, linked: peers, connected: t.front >= 0, onWater: t.dock >= 0 };
  };
  B.stats = function () { return S().boats.stats; };
  B.version = function () { return X.ver; };
})();
