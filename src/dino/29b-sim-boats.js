// ===== 29b-sim-boats.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - boats package, sim side (DOM-free, runs under node): floating pontoons, guest ferries at guest piers, capped service boats at service piers, staff and VIP helipads.
   SAVED state:  S.boats { stats{riders,income,staffTrips,vip,vipIncome}, vipT, ferries }; pier and pad objects (D.buildings with def.boats = guest|service|staff|vip) carry fare, mfree, mrides, minc, ferries.
                 pontoons are a path type (D.paths 'pontoon') on water tiles.
   DERIVED (rebuilt by updateGraph() from terrain, paths and objects): water bodies, terminals, links between path components.
   RUNTIME only (never saved): persistent ferries & service boats per water body, staff helicopter hops, helicopters at VIP pads.  Guests aboard are in state 'boat'.
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

  // 16 distinct deck seat offsets (local x, z) across 4 bench rows on the big ferry
  var FERRY_SEATS = [];
  (function () {
    var zs = [2.1, 1.45, 0.8, 0.15], xs = [-0.85, -0.4, 0.4, 0.85], r, c;
    for (r = 0; r < zs.length; r++) for (c = 0; c < xs.length; c++) FERRY_SEATS.push([xs[c], zs[r]]);
  })();
  // 48 distinct seat positions across lower (y: 0.35) and upper (y: 1.45) decks on a double-deck ferry (interleaved so riders spread across both decks)
  var LARGE_FERRY_SEATS = [];
  (function () {
    var lzs = [3.1, 2.35, 1.6, 0.85, 0.1, -0.65], lxs = [-1.25, -0.55, 0.55, 1.25];
    var uzs = [2.5, 1.8, 1.1, 0.4, -0.3, -1.0], uxs = [-1.15, -0.5, 0.5, 1.15];
    var r, c;
    for (r = 0; r < 6; r++) for (c = 0; c < 4; c++) {
      LARGE_FERRY_SEATS.push({ x: lxs[c], z: lzs[r], y: 0.35 });
      LARGE_FERRY_SEATS.push({ x: uxs[c], z: uzs[r], y: 1.45 });
    }
  })();

  var X = emptyX();
  function emptyX() {
    return {
      body: new Int16Array(NN), prev: new Int32Array(NN),
      terms: [], gEdges: [], sLinks: [], sCache: {},
      trips: [], helis: [],
      ferries: [], serviceBoats: [],
      staffServiceQ: [], staffFerryQ: [],
      plans: {}, staffTrip: {},
      nextVid: 1, ver: 0
    };
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
  function termOfId(id) { for (var k = 0; k < X.terms.length; k++) if (X.terms[k].o.id === id) return X.terms[k]; return null; }
  function termOf(o) { if (!o) return null; for (var k = 0; k < X.terms.length; k++) if (X.terms[k].o === o) return X.terms[k]; return null; }

  // ============================================================ pathing & pose helpers
  function waterRoute(A, Bt) {
    var body = X.body, prev = X.prev, q = RT().queue, h = 0, tl = 0, seen = RT().stamp, st = ++RT().stampN, from = A.dock, to = Bt.dock, t;
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
  function buildPath(pts) {
    var cum = [0], k;
    for (k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
    return { pts: pts, cum: cum, len: cum[cum.length - 1] };
  }
  function poseVesselRoute(v) {
    if (!v.pts || !v.pts.length) return;
    var k = 1, d = Math.min(v.d, v.len);
    while (k < v.pts.length - 1 && v.cum[k] < d) k++;
    var a = v.pts[k - 1], b = v.pts[k] || a, seg = v.cum[k] - v.cum[k - 1], f = seg > 0 ? (d - v.cum[k - 1]) / seg : 0;
    v.x = a.x + (b.x - a.x) * f; v.z = a.z + (b.z - a.z) * f;
    if (b !== a) v.h = Math.atan2(b.x - a.x, b.z - a.z);
  }
  function mooredPose(v, pier, slot, total) {
    if (!pier || pier.dock < 0) return;
    var cx = tcx(pier.dock), cz = tcz(pier.dock), pc = C.objCentre(pier.o);
    var dx = cx - pc.x, dz = cz - pc.z, dl = Math.hypot(dx, dz) || 1, nx = dx / dl, nz = dz / dl;
    var tx = -nz, tz = nx, off = total > 1 ? (slot - (total - 1) / 2) * 1.5 : 0;
    v.x = cx + tx * off; v.z = cz + tz * off;
    v.h = Math.atan2(-nz, nx);
  }
  function poseFerryPax(f) {
    var ch = Math.cos(f.h), sh = Math.sin(f.h), k, seats = f.large ? LARGE_FERRY_SEATS : FERRY_SEATS;
    for (k = 0; k < f.pax.length; k++) {
      var p = f.pax[k], seat = seats[p.seat % seats.length];
      var lx = f.large ? seat.x : seat[0], lz = f.large ? seat.z : seat[1], ly = f.large ? seat.y : 0.35;
      p.seatY = ly;
      p.e.x = f.x + lx * ch + lz * sh;
      p.e.z = f.z - lx * sh + lz * ch;
      p.e.heading = f.h;
      p.e.absY = ly;
    }
  }
  function nearestPathTile(x, z) {
    var pt = RT().pathTiles, best = -1, bd = INF * INF, k;
    for (k = 0; k < pt.length; k++) {
      var t = pt[k], dx = tcx(t) - x, dz = tcz(t) - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function landAt(e, tile) {
    if (tile < 0 || !S().path[tile]) tile = nearestPathTile(e.x || 0, e.z || 0);
    if (tile >= 0) {
      e.x = tcx(tile) + rng.range(-0.4, 0.4); e.z = tcz(tile) + rng.range(-0.4, 0.4); e.ti = tile;
    }
    e.ni = -1; e.absY = null; e.speed = 0;
  }
  function landGuestClean(g, tile, plan) {
    delete X.plans[g.id];
    landAt(g, tile);
    g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.gid = 0; g.gAge = 0; g.idle = 0; g.pv = 0;
    if (plan) {
      g.mood += 2; g.rn = now() + 0.3;
      C.say(g, 'boat');
      var enc = C.encById(plan.gid), f = C.getField('t' + plan.spot);
      if (enc && f && f[g.ti] < INF) { g.gt = 'enc'; g.gid = plan.gid; g.dk = 't' + plan.spot; g.spot = plan.spot; RT().gtarg[plan.spot]++; }
    }
  }
  function landStaffClean(s, tile, advanceRoute) {
    landAt(s, tile);
    if (advanceRoute && s.route && s.route[s.ri] === tile) s.ri++;
    delete X.staffTrip[s.id];
    if (advanceRoute) S().boats.stats.staffTrips++;
    else { s.tk = null; s.route = null; s.ri = 0; s.state = 'idle'; }
  }
  function safeShoreTile(preferTerms, fallbackX, fallbackZ) {
    for (var k = 0; k < preferTerms.length; k++) {
      var tm = preferTerms[k];
      if (tm && tm.front >= 0 && S().path[tm.front]) return tm.front;
    }
    return nearestPathTile(fallbackX || 0, fallbackZ || 0);
  }
  function landFerryPax(f, preferTerms) {
    var tile = safeShoreTile(preferTerms, f.x, f.z);
    for (var k = 0; k < f.pax.length; k++) {
      var p = f.pax[k];
      if (p.isStaff) { if (RT().sById.get(p.e.id) === p.e) landStaffClean(p.e, tile, false); }
      else { if (RT().gById.get(p.e.id) === p.e) landGuestClean(p.e, tile, null); }
    }
    f.pax.length = 0;
  }

  // ============================================================ fleet reconciliation
  function bodyHasLargePier(body) {
    if (!body) return false;
    var BD = C.BD(), k, T = X.terms;
    for (k = 0; k < T.length; k++) {
      var t = T[k];
      if (t.kind === 'guest' && t.body === body && t.front >= 0 && BD[t.o.type] && BD[t.o.type].largePier) return true;
    }
    return false;
  }
  function ferryCapForBody(body) { return bodyHasLargePier(body) ? BC.largeFerryCap : BC.ferryCap; }
  function ferryMaxForBody(body) { return bodyHasLargePier(body) ? BC.largeFerryMax : BC.ferryMax; }
  function ferrySpeedForBody(body) { return bodyHasLargePier(body) ? BC.largeFerrySpeed : BC.speed; }

  function guestTermsOnBody(body) {
    var out = [], k, T = X.terms;
    for (k = 0; k < T.length; k++) if (T[k].kind === 'guest' && T[k].body === body && T[k].front >= 0) out.push(T[k]);
    return out;
  }
  function serviceTermsOnBody(body) {
    var out = [], k, T = X.terms;
    for (k = 0; k < T.length; k++) if (T[k].kind === 'service' && T[k].body === body && T[k].front >= 0) out.push(T[k]);
    return out;
  }
  function targetFerriesForBody(body, gTerms) {
    var mx = 0, k, s = S(), maxF = ferryMaxForBody(body);
    for (k = 0; k < gTerms.length; k++) {
      var v = gTerms[k].o.ferries;
      if (typeof v === 'number' && v > mx) mx = v;
    }
    if (!mx && s.boats && s.boats.ferries && typeof s.boats.ferries[body] === 'number') mx = s.boats.ferries[body];
    var target = clamp(Math.round(mx || 1), 1, maxF);
    if (mx > 0) {
      for (k = 0; k < gTerms.length; k++) gTerms[k].o.ferries = target;
      if (s.boats && s.boats.ferries) s.boats.ferries[body] = target;
    }
    return target;
  }
  function makeFerry(body, pier) {
    var isLarge = bodyHasLargePier(body);
    var f = {
      id: X.nextVid++, kind: 'ferry', body: body, state: 'wait',
      large: isLarge, cap: ferryCapForBody(body),
      atPier: pier, fromPier: pier, toPier: null,
      dwell: BC.ferryDwell, pax: [],
      pts: [], cum: [0], len: 0, d: 0, x: 0, z: 0, h: 0
    };
    mooredPose(f, pier, 0, 1);
    return f;
  }
  function makeServiceBoat(body, pier) {
    var b = {
      id: X.nextVid++, kind: 'service', body: body, state: 'idle',
      atPier: pier, fromPier: pier, toPier: null,
      staffId: 0, staff: null, pickPier: null, destPier: null,
      pts: [], cum: [0], len: 0, d: 0, x: 0, z: 0, h: 0
    };
    mooredPose(b, pier, 0, 1);
    return b;
  }
  function poseMooredAtPier(pier) {
    var docked = [], k;
    for (k = 0; k < X.ferries.length; k++) if (X.ferries[k].state === 'wait' && X.ferries[k].atPier === pier) docked.push(X.ferries[k]);
    for (k = 0; k < X.serviceBoats.length; k++) if (X.serviceBoats[k].state === 'idle' && X.serviceBoats[k].atPier === pier) docked.push(X.serviceBoats[k]);
    for (k = 0; k < docked.length; k++) {
      mooredPose(docked[k], pier, k, docked.length);
      if (docked[k].kind === 'ferry') poseFerryPax(docked[k]);
    }
  }

  function reconcileFleets() {
    var rt = RT(), byOid = {}, gByBody = {}, sByBody = {}, bodies = {}, k, b;
    for (k = 0; k < X.terms.length; k++) {
      var tm = X.terms[k]; byOid[tm.o.id] = tm;
      if (!tm.body || tm.front < 0) continue;
      bodies[tm.body] = true;
      if (tm.kind === 'guest') (gByBody[tm.body] || (gByBody[tm.body] = [])).push(tm);
      else if (tm.kind === 'service') (sByBody[tm.body] || (sByBody[tm.body] = [])).push(tm);
    }

    // 1. Reconcile ferries
    for (k = X.ferries.length - 1; k >= 0; k--) {
      var f = X.ferries[k];
      var at = f.atPier && byOid[f.atPier.o.id];
      var fr = f.fromPier && byOid[f.fromPier.o.id];
      var to = f.toPier && byOid[f.toPier.o.id];
      var validWait = f.state === 'wait' && at && at.kind === 'guest' && at.body && at.front >= 0 && gByBody[at.body] && gByBody[at.body].length >= 2;
      var validSail = f.state === 'sail' && fr && to && fr.kind === 'guest' && to.kind === 'guest' && fr.body && fr.body === to.body && fr.front >= 0 && to.front >= 0 && gByBody[fr.body] && gByBody[fr.body].length >= 2;
      if (validWait) {
        f.atPier = at; f.fromPier = at; f.toPier = null; f.body = at.body;
      } else if (validSail) {
        f.fromPier = fr; f.toPier = to; f.atPier = null; f.body = fr.body;
        // check passengers whose destination vanished or split onto another body
        for (var pi = f.pax.length - 1; pi >= 0; pi--) {
          var px = f.pax[pi], dest = byOid[px.to];
          if (!dest || dest.body !== f.body || dest.front < 0) {
            f.pax.splice(pi, 1);
            var st = safeShoreTile([fr, to], f.x, f.z);
            if (px.isStaff) { if (rt.sById.get(px.e.id) === px.e) landStaffClean(px.e, st, false); }
            else { if (rt.gById.get(px.e.id) === px.e) landGuestClean(px.e, st, null); }
          }
        }
      } else {
        landFerryPax(f, [to, fr, at]);
        X.ferries.splice(k, 1);
      }
    }

    // Spawn or trim ferries per body with 2+ guest piers
    for (b in gByBody) {
      var gTerms = gByBody[b];
      if (gTerms.length < 2) continue;
      var bodyNum = +b, target = targetFerriesForBody(bodyNum, gTerms);
      var isLarge = bodyHasLargePier(bodyNum), cap = ferryCapForBody(bodyNum);
      var have = [];
      for (k = 0; k < X.ferries.length; k++) if (X.ferries[k].body === bodyNum) have.push(X.ferries[k]);
      while (have.length < target) {
        // distribute new ferries across piers with fewest docked ferries
        var bestPier = gTerms[0], bestC = INF;
        for (var gi = 0; gi < gTerms.length; gi++) {
          var cnt = 0;
          for (var fi = 0; fi < have.length; fi++) if (have[fi].atPier === gTerms[gi]) cnt++;
          if (cnt < bestC) { bestC = cnt; bestPier = gTerms[gi]; }
        }
        var nf = makeFerry(bodyNum, bestPier);
        X.ferries.push(nf); have.push(nf);
      }
      while (have.length > target) {
        // trim idle wait ferry with 0 pax first, then any wait ferry, then sail ferry
        var victimIdx = -1;
        for (k = 0; k < have.length; k++) if (have[k].state === 'wait' && !have[k].pax.length) { victimIdx = k; break; }
        if (victimIdx < 0) for (k = 0; k < have.length; k++) if (have[k].state === 'wait') { victimIdx = k; break; }
        if (victimIdx < 0) victimIdx = have.length - 1;
        var vf = have.splice(victimIdx, 1)[0];
        landFerryPax(vf, [vf.atPier, vf.fromPier, vf.toPier]);
        var xi = X.ferries.indexOf(vf); if (xi >= 0) X.ferries.splice(xi, 1);
      }
      // Upgrade or downgrade surviving ferries in-place when large terminals are added or removed
      for (k = 0; k < have.length; k++) {
        var hf = have[k];
        hf.large = isLarge;
        hf.cap = cap;
        if (!isLarge) {
          while (hf.pax.length > cap) {
            var ex = hf.pax.pop(), est = safeShoreTile([hf.fromPier, hf.toPier, hf.atPier], hf.x, hf.z);
            if (ex.isStaff) { if (rt.sById.get(ex.e.id) === ex.e) landStaffClean(ex.e, est, false); }
            else { if (rt.gById.get(ex.e.id) === ex.e) landGuestClean(ex.e, est, null); }
          }
          var usedS = {}, pxI;
          for (pxI = 0; pxI < hf.pax.length; pxI++) if (hf.pax[pxI].seat < FERRY_SEATS.length) usedS[hf.pax[pxI].seat] = true;
          for (pxI = 0; pxI < hf.pax.length; pxI++) {
            if (hf.pax[pxI].seat >= FERRY_SEATS.length) {
              var ns = 0; while (ns < FERRY_SEATS.length && usedS[ns]) ns++;
              hf.pax[pxI].seat = ns < FERRY_SEATS.length ? ns : (pxI % FERRY_SEATS.length);
              usedS[hf.pax[pxI].seat] = true;
            }
          }
        }
        if (hf.pax.length) poseFerryPax(hf);
      }
    }

    // 2. Reconcile service boats
    for (k = X.serviceBoats.length - 1; k >= 0; k--) {
      var sb = X.serviceBoats[k];
      var sAt = sb.atPier && byOid[sb.atPier.o.id];
      var sFr = sb.fromPier && byOid[sb.fromPier.o.id];
      var sTo = sb.toPier && byOid[sb.toPier.o.id];
      var sPk = sb.pickPier && byOid[sb.pickPier.o.id];
      var sDs = sb.destPier && byOid[sb.destPier.o.id];
      var bdy = (sAt && sAt.body) || (sFr && sFr.body) || 0;
      var hasSvc = bdy && sByBody[bdy] && sByBody[bdy].length > 0;
      var okIdle = sb.state === 'idle' && sAt && sAt.body === bdy && sAt.front >= 0;
      var okFetch = sb.state === 'fetch' && sFr && sPk && sFr.body === bdy && sPk.body === bdy && sFr.front >= 0 && sPk.front >= 0;
      var okSail = sb.state === 'sail' && sFr && sTo && sFr.body === bdy && sTo.body === bdy && sFr.front >= 0 && sTo.front >= 0;
      if (hasSvc && (okIdle || okFetch || okSail)) {
        sb.body = bdy; sb.atPier = sAt || null; sb.fromPier = sFr || null; sb.toPier = sTo || null; sb.pickPier = sPk || null; sb.destPier = sDs || null;
      } else {
        if (sb.staffId) {
          var sm = rt.sById.get(sb.staffId);
          if (sm) landStaffClean(sm, safeShoreTile([sTo, sFr, sAt], sb.x, sb.z), false);
          delete X.staffTrip[sb.staffId];
        }
        X.serviceBoats.splice(k, 1);
      }
    }

    for (b in sByBody) {
      var sTerms = sByBody[b], sBody = +b;
      var sTarget = Math.min(BC.serviceMaxPerBody, sTerms.length * BC.servicePerPier);
      var sHave = [];
      for (k = 0; k < X.serviceBoats.length; k++) if (X.serviceBoats[k].body === sBody) sHave.push(X.serviceBoats[k]);
      while (sHave.length < sTarget) {
        var sp = sTerms[sHave.length % sTerms.length];
        var nb = makeServiceBoat(sBody, sp);
        X.serviceBoats.push(nb); sHave.push(nb);
      }
      while (sHave.length > sTarget) {
        var sVic = -1;
        for (k = 0; k < sHave.length; k++) if (sHave[k].state === 'idle') { sVic = k; break; }
        if (sVic < 0) for (k = 0; k < sHave.length; k++) if (sHave[k].state === 'fetch') { sVic = k; break; }
        if (sVic < 0) sVic = sHave.length - 1;
        var vsb = sHave.splice(sVic, 1)[0];
        if (vsb.staffId) {
          var vsm = rt.sById.get(vsb.staffId);
          if (vsm) landStaffClean(vsm, safeShoreTile([vsb.toPier, vsb.fromPier, vsb.atPier], vsb.x, vsb.z), false);
          delete X.staffTrip[vsb.staffId];
        }
        var sxi = X.serviceBoats.indexOf(vsb); if (sxi >= 0) X.serviceBoats.splice(sxi, 1);
      }
    }

    // 3. Reconcile waiting staff queues
    for (k = X.staffServiceQ.length - 1; k >= 0; k--) {
      var q = X.staffServiceQ[k], qf = q.fromPier && byOid[q.fromPier.o.id], qt = q.toPier && byOid[q.toPier.o.id];
      if (!qf || !qt || !qf.body || qf.body !== qt.body || qf.front < 0 || qt.front < 0 || !sByBody[qf.body] || !sByBody[qf.body].length) {
        X.staffServiceQ.splice(k, 1); delete X.staffTrip[q.id];
      } else {
        q.fromPier = qf; q.toPier = qt; q.body = qf.body;
      }
    }
    for (k = X.staffFerryQ.length - 1; k >= 0; k--) {
      var fq = X.staffFerryQ[k], fqf = fq.fromPier && byOid[fq.fromPier.o.id], fqt = fq.toPier && byOid[fq.toPier.o.id];
      if (!fqf || !fqt || !fqf.body || fqf.body !== fqt.body || fqf.front < 0 || fqt.front < 0 || !gByBody[fqf.body] || gByBody[fqf.body].length < 2) {
        X.staffFerryQ.splice(k, 1); delete X.staffTrip[fq.id];
      } else {
        fq.fromPier = fqf; fq.toPier = fqt; fq.body = fqf.body;
      }
    }

    // 4. Reconcile guest plans & queues whose destination pier disappeared or split
    for (var gidStr in X.plans) {
      var gid = +gidStr, g = rt.gById.get(gid), pl = X.plans[gidStr];
      var dst = pl && byOid[pl.to];
      if (!g || !dst || !dst.body || dst.front < 0) {
        delete X.plans[gidStr];
        if (g && g.state === 'queue') {
          var bq = g.gid && rt.bq[g.gid]; if (bq) { var qi = bq.q.indexOf(g.id); if (qi >= 0) bq.q.splice(qi, 1); }
          g.state = 'walk'; g.gt = ''; g.dk = ''; g.gid = 0; g.ni = -1; g.glide = 0;
        }
      }
    }

    // Pose all moored vessels neatly
    for (k = 0; k < X.terms.length; k++) if (X.terms[k].dock >= 0) poseMooredAtPier(X.terms[k]);
  }

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
    reconcileFleets();
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

  // ============================================================ fares and fleet settings
  B.setFare = function (id, fare) {
    var o = RT().oById.get(id); if (!o) return C.fail('No such pier');
    o.fare = clamp(Math.round((+fare || 0) * 2) / 2, 0, BC.fareMax); return C.okr(0);
  };
  B.setFree = function (id, on) {
    var o = RT().oById.get(id); if (!o) return C.fail('No such pier');
    o.mfree = on ? 1 : 0; return C.okr(0);
  };
  B.setFerries = function (pierId, n) {
    var o = RT().oById.get(pierId), t = o && termOf(o);
    if (!t || t.kind !== 'guest') return C.fail('No such pier');
    var val = clamp(Math.round(+n || 1), 1, ferryMaxForBody(t.body));
    var s = S(); defaults(s);
    if (t.body) {
      for (var k = 0; k < X.terms.length; k++) if (X.terms[k].kind === 'guest' && X.terms[k].body === t.body) X.terms[k].o.ferries = val;
      s.boats.ferries[t.body] = val;
    } else {
      o.ferries = val;
    }
    reconcileFleets();
    return C.okr(0);
  };
  function fareOK(g, o) {
    var fare = fareOf(o);
    return fare <= 0 || !(fare > g.money * 0.85 || fare > BC.fareRef * g.tol * clamp(C.WX().spend, 0.5, 1.6) * 1.2);
  }

  // ============================================================ ferries
  function freeSeat(f) {
    var used = {}, k, cap = f.cap || ferryCapForBody(f.body), seats = f.large ? LARGE_FERRY_SEATS : FERRY_SEATS;
    for (k = 0; k < f.pax.length; k++) used[f.pax[k].seat] = true;
    for (k = 0; k < cap; k++) if (!used[k]) return k;
    return f.pax.length % seats.length;
  }
  function hasStaffWaitingAt(pierId) {
    for (var k = 0; k < X.staffFerryQ.length; k++) if (X.staffFerryQ[k].fromPier.o.id === pierId) return true;
    return false;
  }
  function countWaitingAtPier(pierId) {
    var q = RT().bq[pierId], n = q ? q.q.length : 0;
    for (var k = 0; k < X.staffFerryQ.length; k++) if (X.staffFerryQ[k].fromPier.o.id === pierId) n++;
    return n;
  }
  function ferryServingPier(body, pier, excludeFerry) {
    for (var k = 0; k < X.ferries.length; k++) {
      var f = X.ferries[k]; if (f === excludeFerry || f.body !== body) continue;
      if (f.state === 'wait' && f.atPier === pier) return true;
      if (f.state === 'sail' && f.toPier === pier) return true;
    }
    return false;
  }
  function departFerryTo(f, toPier) {
    var pts = waterRoute(f.atPier, toPier);
    if (!pts) return false;
    var bp = buildPath(pts);
    f.state = 'sail'; f.fromPier = f.atPier; f.toPier = toPier; f.atPier = null;
    f.pts = bp.pts; f.cum = bp.cum; f.len = bp.len; f.d = 0;
    poseVesselRoute(f); poseFerryPax(f);
    return true;
  }
  function boardFerryFromPier(f) {
    var rt = RT(), pier = f.atPier, q = rt.bq[pier.o.id], cap = f.cap || ferryCapForBody(f.body), seats = f.large ? LARGE_FERRY_SEATS : FERRY_SEATS;
    if (q && q.q.length) {
      while (f.pax.length < cap && q.q.length) {
        var gid = q.q.shift(), g = rt.gById.get(gid);
        if (!g || g.state !== 'queue' || g.gid !== pier.o.id) continue;
        var plan = X.plans[g.id], Bt = plan && termOfId(plan.to);
        if (!Bt || Bt.body !== f.body || Bt.o.id === pier.o.id || !fareOK(g, pier.o)) {
          delete X.plans[g.id];
          g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.gid = 0; g.ni = -1;
          if (Bt && Bt.body === f.body && !fareOK(g, pier.o)) { g.mood -= 1.5; C.say(g, 'expensive'); }
          continue;
        }
        var fare = fareOf(pier.o);
        if (fare > 0) {
          g.money -= fare; g.spent = (g.spent || 0) + fare;
          C.earn(fare, 'shops', g.x, g.z);
          pier.o.minc = (pier.o.minc || 0) + fare;
          S().boats.stats.income += fare;
        }
        pier.o.mrides = (pier.o.mrides || 0) + 1;
        S().boats.stats.riders++;
        delete X.plans[g.id];
        var gSeat = freeSeat(f), gSeatY = f.large ? seats[gSeat % seats.length].y : 0.35;
        g.state = 'boat'; g.gt = ''; g.dk = ''; g.gid = 0; g.speed = 0; g.glide = 0; g.absY = gSeatY;
        f.pax.push({ e: g, isStaff: false, to: Bt.o.id, plan: plan, seat: gSeat, seatY: gSeatY });
        if (f.pax.length === 1) f.dwell = BC.ferryDwell;
      }
    }
    // Staff waiting at this guest_pier board for free
    for (var si = 0; si < X.staffFerryQ.length && f.pax.length < cap; ) {
      var sq = X.staffFerryQ[si];
      if (sq.fromPier.o.id !== pier.o.id) { si++; continue; }
      X.staffFerryQ.splice(si, 1);
      var sm = rt.sById.get(sq.id);
      if (!sm || sm.sickUntil > S().day + S().time || !sm.route || sm.ri >= sm.route.length || sm.route[sm.ri] !== sq.toPier.front) {
        delete X.staffTrip[sq.id];
        continue;
      }
      var sSeat = freeSeat(f), sSeatY = f.large ? seats[sSeat % seats.length].y : 0.35;
      sm.state = 'idle'; sm.speed = 0; sm.absY = sSeatY;
      X.staffTrip[sm.id] = f;
      f.pax.push({ e: sm, isStaff: true, to: sq.toPier.o.id, plan: null, seat: sSeat, seatY: sSeatY });
      if (f.pax.length === 1) f.dwell = BC.ferryDwell;
    }
  }
  function stepFerries(dt) {
    var rt = RT(), s = S(), tNow = s.day + s.time, k, q;
    // Prune invalid staff waiting for ferry
    for (k = X.staffFerryQ.length - 1; k >= 0; k--) {
      var sq = X.staffFerryQ[k], sm = rt.sById.get(sq.id);
      if (!sm || sm.sickUntil > tNow || !sm.route || sm.ri >= sm.route.length || sm.route[sm.ri] !== sq.toPier.front) {
        X.staffFerryQ.splice(k, 1); delete X.staffTrip[sq.id];
      }
    }

    for (k = 0; k < X.ferries.length; k++) {
      var f = X.ferries[k];
      // Prune dead/fired passengers
      for (q = f.pax.length - 1; q >= 0; q--) {
        var px = f.pax[q];
        var ok = px.isStaff ? rt.sById.get(px.e.id) === px.e : rt.gById.get(px.e.id) === px.e;
        if (!ok) { f.pax.splice(q, 1); if (px.isStaff) delete X.staffTrip[px.e.id]; }
      }

      if (f.state === 'wait') {
        if (!f.atPier || f.atPier.dock < 0) continue;
        boardFerryFromPier(f);
        poseFerryPax(f);
        if (f.pax.length >= (f.cap || ferryCapForBody(f.body))) {
          var toFull = termOfId(f.pax[0].to);
          if (toFull && toFull !== f.atPier && toFull.body === f.body) departFerryTo(f, toFull);
        } else if (f.pax.length > 0) {
          f.dwell -= dt;
          if (f.dwell <= 0) {
            var toDwell = null;
            for (q = 0; q < f.pax.length; q++) {
              var cand = termOfId(f.pax[q].to);
              if (cand && cand !== f.atPier && cand.body === f.body) { toDwell = cand; break; }
            }
            if (toDwell) departFerryTo(f, toDwell);
          }
        } else {
          f.dwell = BC.ferryDwell;
          // Empty ferry: check if another guest pier on this body has queued guests/staff and no ferry serving it
          var peers = guestTermsOnBody(f.body), bestPeer = null, bestQ = 0;
          for (q = 0; q < peers.length; q++) {
            var p = peers[q]; if (p === f.atPier) continue;
            var wc = countWaitingAtPier(p.o.id);
            if (wc > bestQ && !ferryServingPier(f.body, p, f)) { bestQ = wc; bestPeer = p; }
          }
          if (bestPeer) departFerryTo(f, bestPeer);
        }
      } else if (f.state === 'sail') {
        f.d += ferrySpeedForBody(f.body) * dt;
        poseVesselRoute(f);
        poseFerryPax(f);
        if (f.d >= Math.max(f.len, BC.minTrip)) {
          var arrPier = f.toPier;
          for (q = f.pax.length - 1; q >= 0; q--) {
            var dp = f.pax[q];
            if (dp.to === arrPier.o.id) {
              f.pax.splice(q, 1);
              if (dp.isStaff) landStaffClean(dp.e, arrPier.front, true);
              else landGuestClean(dp.e, arrPier.front, dp.plan);
            }
          }
          f.state = 'wait'; f.atPier = arrPier; f.fromPier = arrPier; f.toPier = null;
          f.dwell = BC.ferryDwell; f.pts = []; f.cum = [0]; f.len = 0; f.d = 0;
          poseMooredAtPier(arrPier);
        }
      }
    }
    // Keep docked poses aligned for multi-ferry piers
    for (k = 0; k < X.terms.length; k++) if (X.terms[k].kind === 'guest' && X.terms[k].dock >= 0) poseMooredAtPier(X.terms[k]);
  }

  // ============================================================ service boats & staff helis
  function padCentre(o) { var fp = C.objFootprint(o); return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE }; }
  function startAirTrip(e, A, Bt) {
    var pts = [padCentre(A.o), padCentre(Bt.o)], bp = buildPath(pts);
    var trip = { e: e, guest: false, from: A, to: Bt, plan: null, pts: bp.pts, cum: bp.cum, len: bp.len, d: 0, air: true, x: pts[0].x, z: pts[0].z, h: 0 };
    e.absY = -6;
    X.trips.push(trip);
    X.staffTrip[e.id] = trip;
    poseVesselRoute(trip);
    trip.e.x = trip.x; trip.e.z = trip.z; trip.e.heading = trip.h;
    return trip;
  }
  function stepAirTrips(dt) {
    var rt = RT(), k;
    for (k = X.trips.length - 1; k >= 0; k--) {
      var t = X.trips[k];
      if (rt.sById.get(t.e.id) !== t.e) { X.trips.splice(k, 1); delete X.staffTrip[t.e.id]; continue; }
      t.d += BC.airSpeed * dt;
      poseVesselRoute(t);
      t.e.x = t.x; t.e.z = t.z; t.e.heading = t.h;
      if (t.d >= t.len) {
        X.trips.splice(k, 1);
        landStaffClean(t.e, t.to.front, true);
      }
    }
  }

  function serviceBoatsOnBody(body) {
    var out = [], k;
    for (k = 0; k < X.serviceBoats.length; k++) if (X.serviceBoats[k].body === body) out.push(X.serviceBoats[k]);
    return out;
  }
  function startServiceSail(b, s, fromPier, toPier) {
    var pts = waterRoute(fromPier, toPier);
    if (!pts) return false;
    var bp = buildPath(pts);
    b.state = 'sail'; b.fromPier = fromPier; b.toPier = toPier; b.atPier = null;
    b.pickPier = null; b.destPier = null;
    b.staffId = s.id; b.staff = s;
    b.pts = bp.pts; b.cum = bp.cum; b.len = bp.len; b.d = 0;
    s.state = 'idle'; s.speed = 0; s.absY = 0.35;
    X.staffTrip[s.id] = b;
    poseVesselRoute(b);
    s.x = b.x; s.z = b.z; s.heading = b.h;
    return true;
  }
  function startServiceFetch(b, fromPier, pickPier, destPier) {
    var pts = waterRoute(fromPier, pickPier);
    if (!pts) return false;
    var bp = buildPath(pts);
    b.state = 'fetch'; b.fromPier = fromPier; b.toPier = pickPier; b.atPier = null;
    b.pickPier = pickPier; b.destPier = destPier;
    b.staffId = 0; b.staff = null;
    b.pts = bp.pts; b.cum = bp.cum; b.len = bp.len; b.d = 0;
    poseVesselRoute(b);
    return true;
  }
  function countServiceWaitingAt(pier) {
    var n = 0;
    for (var k = 0; k < X.staffServiceQ.length; k++) if (X.staffServiceQ[k].fromPier === pier) n++;
    return n;
  }
  function countFetchingTo(pier) {
    var n = 0;
    for (var k = 0; k < X.serviceBoats.length; k++) if (X.serviceBoats[k].state === 'fetch' && X.serviceBoats[k].pickPier === pier) n++;
    return n;
  }
  function peekWaitingStaff(body, preferPier) {
    var rt = RT(), k;
    if (preferPier) {
      for (k = 0; k < X.staffServiceQ.length; k++) {
        var q = X.staffServiceQ[k];
        if (q.body === body && q.fromPier === preferPier) {
          var s = rt.sById.get(q.id);
          if (s) return { idx: k, s: s, q: q };
          X.staffServiceQ.splice(k, 1); delete X.staffTrip[q.id]; k--;
        }
      }
    }
    for (k = 0; k < X.staffServiceQ.length; k++) {
      var q2 = X.staffServiceQ[k];
      if (q2.body === body) {
        if (q2.fromPier !== preferPier && countFetchingTo(q2.fromPier) >= countServiceWaitingAt(q2.fromPier)) continue;
        var s2 = rt.sById.get(q2.id);
        if (s2) return { idx: k, s: s2, q: q2 };
        X.staffServiceQ.splice(k, 1); delete X.staffTrip[q2.id]; k--;
      }
    }
    return null;
  }
  function assignNextServiceJob(b, atPier) {
    var next = peekWaitingStaff(b.body, atPier);
    if (next) {
      if (next.q.fromPier === atPier) {
        X.staffServiceQ.splice(next.idx, 1);
        if (startServiceSail(b, next.s, atPier, next.q.toPier)) return;
      } else {
        if (startServiceFetch(b, atPier, next.q.fromPier, next.q.toPier)) return;
      }
    }
    b.state = 'idle'; b.atPier = atPier; b.fromPier = atPier; b.toPier = null;
    b.pickPier = null; b.destPier = null; b.staffId = 0; b.staff = null;
    b.pts = []; b.cum = [0]; b.len = 0; b.d = 0;
    poseMooredAtPier(atPier);
  }
  function stepServiceBoats(dt) {
    var rt = RT(), tNow = S().day + S().time, k;
    for (k = X.staffServiceQ.length - 1; k >= 0; k--) {
      var sq = X.staffServiceQ[k], sm = rt.sById.get(sq.id);
      if (!sm || sm.sickUntil > tNow || !sm.route || sm.ri >= sm.route.length || sm.route[sm.ri] !== sq.toPier.front) {
        X.staffServiceQ.splice(k, 1); delete X.staffTrip[sq.id];
      }
    }
    for (k = 0; k < X.serviceBoats.length; k++) {
      var b = X.serviceBoats[k];
      if (b.state === 'idle') {
        if (!b.atPier || b.atPier.dock < 0) continue;
        var next = peekWaitingStaff(b.body, b.atPier);
        if (next) {
          if (next.q.fromPier === b.atPier) {
            X.staffServiceQ.splice(next.idx, 1);
            startServiceSail(b, next.s, b.atPier, next.q.toPier);
          } else {
            startServiceFetch(b, b.atPier, next.q.fromPier, next.q.toPier);
          }
        }
      } else if (b.state === 'fetch') {
        b.d += BC.serviceSpeed * dt;
        poseVesselRoute(b);
        if (b.d >= Math.max(b.len, BC.minTrip)) {
          assignNextServiceJob(b, b.pickPier);
        }
      } else if (b.state === 'sail') {
        var st = b.staffId ? rt.sById.get(b.staffId) : null;
        if (!st) { if (b.staffId) delete X.staffTrip[b.staffId]; b.staffId = 0; b.staff = null; }
        b.d += BC.serviceSpeed * dt;
        poseVesselRoute(b);
        if (st) { st.x = b.x; st.z = b.z; st.heading = b.h; st.absY = 0.35; }
        if (b.d >= Math.max(b.len, BC.minTrip)) {
          if (st) landStaffClean(st, b.toPier.front, true);
          else if (b.staffId) delete X.staffTrip[b.staffId];
          b.staffId = 0; b.staff = null;
          assignNextServiceJob(b, b.toPier);
        }
      }
    }
    for (k = 0; k < X.terms.length; k++) if (X.terms[k].dock >= 0) poseMooredAtPier(X.terms[k]);
  }

  // ============================================================ queries & lifecycle hooks
  B.vessels = function () { return X.ferries.concat(X.serviceBoats); };
  B.trips = function () {
    var out = X.trips.slice(), k;
    for (k = 0; k < X.ferries.length; k++) {
      var f = X.ferries[k];
      if (f.state === 'sail' || f.pax.length > 0) out.push(f);
    }
    for (k = 0; k < X.serviceBoats.length; k++) {
      var b = X.serviceBoats[k];
      if (b.state === 'sail' || b.state === 'fetch') out.push(b);
    }
    return out;
  };
  B.queueLimit = function (g) {
    var o = g.gid ? RT().oById.get(g.gid) : null;
    return o && C.BD()[o.type] && C.BD()[o.type].boats ? BC.queueLimit : 0;
  };
  B.release = function (g) {
    var k, q, changed = false;
    delete X.plans[g.id];
    for (k = 0; k < X.ferries.length; k++) {
      var f = X.ferries[k];
      for (q = f.pax.length - 1; q >= 0; q--) if (f.pax[q].e === g) { f.pax.splice(q, 1); changed = true; }
    }
    for (k = 0; k < X.trips.length; k++) if (X.trips[k].e === g) { X.trips.splice(k, 1); changed = true; break; }
    for (k = 0; k < X.helis.length; k++) if (X.helis[k].e === g) { X.helis[k].e = null; changed = true; }
    if (g.state === 'boat' || changed || typeof g.absY === 'number') g.absY = null;
  };
  B.onPierRemoved = function (o) {
    if (!o) return;
    var rt = RT(), k, q;
    // 1. Release any guests queuing at other piers bound for o
    for (var gidStr in X.plans) {
      var gid = +gidStr, pl = X.plans[gidStr];
      if (pl && pl.to === o.id) {
        delete X.plans[gidStr];
        var g = rt.gById.get(gid);
        if (g && g.state === 'queue') {
          var bq = g.gid && rt.bq[g.gid]; if (bq) { var qi = bq.q.indexOf(g.id); if (qi >= 0) bq.q.splice(qi, 1); }
          g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.gid = 0; g.ni = -1;
        }
      }
    }
    // 2. Release guests who were queuing at o (clean their plans)
    var oq = rt.bq[o.id];
    if (oq && oq.q) {
      for (k = 0; k < oq.q.length; k++) delete X.plans[oq.q[k]];
    }
    // 3. Disembark/relocate passengers on ferries tied to o
    for (k = X.ferries.length - 1; k >= 0; k--) {
      var f = X.ferries[k];
      var hitFerry = (f.atPier && f.atPier.o === o) || (f.fromPier && f.fromPier.o === o) || (f.toPier && f.toPier.o === o);
      if (hitFerry) {
        var survivors = guestTermsOnBody(f.body).filter(function (tm) { return tm.o !== o; });
        var pref = [];
        if (f.fromPier && f.fromPier.o !== o) pref.push(f.fromPier);
        if (f.toPier && f.toPier.o !== o) pref.push(f.toPier);
        if (f.atPier && f.atPier.o !== o) pref.push(f.atPier);
        pref = pref.concat(survivors);
        landFerryPax(f, pref);
        X.ferries.splice(k, 1);
      } else {
        for (q = f.pax.length - 1; q >= 0; q--) {
          var px = f.pax[q];
          if (px.to === o.id) {
            f.pax.splice(q, 1);
            var st = safeShoreTile([f.fromPier, f.toPier, f.atPier], f.x, f.z);
            if (px.isStaff) { if (rt.sById.get(px.e.id) === px.e) landStaffClean(px.e, st, false); }
            else { if (rt.gById.get(px.e.id) === px.e) landGuestClean(px.e, st, null); }
          }
        }
      }
    }
    // 4. Clean staff waiting queues and service boats tied to o
    for (k = X.staffServiceQ.length - 1; k >= 0; k--) {
      var sq = X.staffServiceQ[k];
      if (sq.fromPier.o === o || sq.toPier.o === o) { X.staffServiceQ.splice(k, 1); delete X.staffTrip[sq.id]; }
    }
    for (k = X.staffFerryQ.length - 1; k >= 0; k--) {
      var fq = X.staffFerryQ[k];
      if (fq.fromPier.o === o || fq.toPier.o === o) { X.staffFerryQ.splice(k, 1); delete X.staffTrip[fq.id]; }
    }
    for (k = X.serviceBoats.length - 1; k >= 0; k--) {
      var sb = X.serviceBoats[k];
      if ((sb.atPier && sb.atPier.o === o) || (sb.fromPier && sb.fromPier.o === o) || (sb.toPier && sb.toPier.o === o) || (sb.pickPier && sb.pickPier.o === o) || (sb.destPier && sb.destPier.o === o)) {
        if (sb.staffId) {
          var sm = rt.sById.get(sb.staffId);
          var spref = [];
          if (sb.fromPier && sb.fromPier.o !== o) spref.push(sb.fromPier);
          if (sb.toPier && sb.toPier.o !== o) spref.push(sb.toPier);
          if (sm) landStaffClean(sm, safeShoreTile(spref, sb.x, sb.z), false);
          delete X.staffTrip[sb.staffId];
        }
        X.serviceBoats.splice(k, 1);
      }
    }
  };

  // ---- staff
  B.staffTravelling = function (s) { return !!X.staffTrip[s.id]; };
  B.staffJump = function (s, a, b) {
    if (X.staffTrip[s.id]) return true;
    for (var k = 0; k < X.sLinks.length; k++) {
      var L = X.sLinks[k]; if (L.a !== a || L.b !== b) continue;
      s.state = 'idle'; s.speed = 0;
      if (L.air) return !!startAirTrip(s, L.ta, L.tb);
      var body = L.ta.body, svcs = serviceBoatsOnBody(body);
      if (L.ta.kind === 'guest' && L.tb.kind === 'guest' && svcs.length === 0) {
        if (guestTermsOnBody(body).length < 2) return false;
        X.staffFerryQ.push({ id: s.id, body: body, fromPier: L.ta, toPier: L.tb });
        X.staffTrip[s.id] = { waiting: true, kind: 'ferry', fromPier: L.ta, toPier: L.tb };
        return true;
      }
      if (!svcs.length) return false;
      // Find an idle service boat already at L.ta
      for (var i = 0; i < svcs.length; i++) {
        if (svcs[i].state === 'idle' && svcs[i].atPier === L.ta) {
          return startServiceSail(svcs[i], s, L.ta, L.tb);
        }
      }
      // Queue staff at L.ta and dispatch an idle boat from another pier if needed
      X.staffServiceQ.push({ id: s.id, body: body, fromPier: L.ta, toPier: L.tb });
      X.staffTrip[s.id] = { waiting: true, kind: 'service', fromPier: L.ta, toPier: L.tb };
      if (countFetchingTo(L.ta) < countServiceWaitingAt(L.ta)) {
        for (i = 0; i < svcs.length; i++) {
          if (svcs[i].state === 'idle') {
            startServiceFetch(svcs[i], svcs[i].atPier, L.ta, L.tb);
            break;
          }
        }
      }
      return true;
    }
    return false;
  };

  // ---- guests
  // a guest who cannot walk to an exhibit is taken by ferry: walk to a pier on the same water as a pier beside the exhibit's paths
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
  // guest reaches a pier (to queue & board ferry) or a VIP pad (to fly home)
  B.arrive = function (g, o) {
    var plan = X.plans[g.id], A = termOf(o);
    if (g.vip && g.hleave && o.type === 'vip_helipad') { delete X.plans[g.id]; departVip(g, o); return; }
    if (!A || A.kind !== 'guest' || !plan) { delete X.plans[g.id]; g.gt = ''; g.dk = ''; return; }
    var Bt = termOfId(plan.to);
    if (!Bt || Bt.body !== A.body || !fareOK(g, o)) {
      delete X.plans[g.id]; g.gt = ''; g.dk = '';
      g.mood -= 1.5; C.say(g, 'expensive');
      return;
    }
    var q = RT().bq[o.id] || (RT().bq[o.id] = { use: 0, q: [] });
    if (q.q.indexOf(g.id) < 0) q.q.push(g.id);
    g.state = 'queue'; g.gt = 'bld'; g.gid = o.id; g.dk = ''; g.wt = 0; g.qt = 0; g.speed = 0; g.glide = 0;
    C.gxPlace(g, false);
    var c = C.objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
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
    stepFerries(dt); stepServiceBoats(dt); stepAirTrips(dt); stepHelis(dt);
  };

  // ============================================================ lifecycle and queries
  function defaults(s) {
    var b = s.boats = s.boats || {};
    b.stats = Object.assign({ riders: 0, income: 0, staffTrips: 0, vip: 0, vipIncome: 0 }, b.stats);
    if (typeof b.vipT !== 'number') b.vipT = 20;
    if (!b.ferries || typeof b.ferries !== 'object') b.ferries = {};
  }
  B.afterLoad = function () {
    var s = S(); if (!s) return;
    defaults(s);
    X = emptyX();
    s.guests.forEach(function (g) { g.absY = null; });
    s.staff.forEach(function (m) { m.absY = null; });
    B.updateGraph();
    C.refreshConnectivity();
    // Ensure nobody saved over water (e.g. mid-ferry) is left stranded off a path
    s.guests.forEach(function (g) {
      if (g.state !== 'ride' && g.gt !== 'out' && !s.path[g.ti]) {
        var pt = nearestPathTile(g.x, g.z);
        if (pt >= 0) landGuestClean(g, pt, null);
      }
    });
  };
  B.pierInfo = function (id) {
    var o = RT().oById.get(id), t = o && termOf(o); if (!t) return null;
    var BD = C.BD();
    var peers = X.terms.filter(function (p) { return p !== t && (t.body ? p.body === t.body : t.kind === 'staff' && p.kind === 'staff'); }).length;
    var out = { kind: t.kind, fare: fareOf(o), free: !!o.mfree, rides: o.mrides || 0, income: o.minc || 0, linked: peers, connected: t.front >= 0, onWater: t.dock >= 0 };
    if (t.kind === 'guest') {
      var q = RT().bq[id], fCount = 0, gPeers = 0, k;
      for (k = 0; k < X.ferries.length; k++) if (X.ferries[k].body === t.body) fCount++;
      for (k = 0; k < X.terms.length; k++) if (X.terms[k].kind === 'guest' && X.terms[k].body === t.body && X.terms[k].front >= 0) gPeers++;
      var fCap = ferryCapForBody(t.body), fMax = ferryMaxForBody(t.body);
      out.queueing = q && q.q ? q.q.length : 0;
      out.ferries = fCount;
      out.guestPeers = gPeers;
      out.ferryCap = fCap;
      out.ferryMax = fMax;
      out.largeBody = bodyHasLargePier(t.body);
      out.isLargePier = !!(BD[o.type] && BD[o.type].largePier);
      out.totalCapacity = fCount * fCap;
    } else if (t.kind === 'service') {
      var svcs = t.body ? serviceBoatsOnBody(t.body) : [], avail = 0, wait = 0, k2;
      for (k2 = 0; k2 < svcs.length; k2++) if (svcs[k2].state === 'idle') avail++;
      for (k2 = 0; k2 < X.staffServiceQ.length; k2++) if (X.staffServiceQ[k2].body === t.body) wait++;
      out.serviceAvail = avail;
      out.serviceTotal = svcs.length;
      out.staffWaiting = wait;
      out.serviceMax = BC.serviceMaxPerBody;
      out.servicePerPier = BC.servicePerPier;
    }
    return out;
  };
  B.stats = function () { return S().boats.stats; };
  B.version = function () { return X.ver; };
})();
