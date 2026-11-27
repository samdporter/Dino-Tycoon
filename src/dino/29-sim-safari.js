// ===== 29-sim-safari.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - safari package, sim side (DOM-free, runs under node).  See notes/safari.md.
   SAVED  S.safari { routes:[{id,kind,depot,tiles[]}], veh:[{id,route,kind,s,v,st,dw,brk,why,paid,rank}], nextRoute,nextVeh, zones:{encId:{corr}}, away:[{id,animal,day,...}], lockdown, cleanDays, stats{...} }.
   Fence ids with def.safariGate are the airlock gates (a fence edge, so enclosures stay sealed); buildings with def.safari = depot|harbour|balloon pad; def.safariPortal = geofence portal.
   DERIVED (X, rebuilt by update()): gates, portals, routes (smoothed polylines, gates on them, validity), zones (safari status, connection), BFS field to the causeway.
   RUNTIME (never saved): VR vehicle riders/poses, GS gate controllers, W wild visitors (a separate list: they are NOT in S.animals; ids >= 1000000).
   Public API on Z.Safari == Z.Sim.safari; hooks in 20-sim.js are guarded with `Z.Safari &&`. */
(function () {
  'use strict';
  var C = Z.monoCtx, X0 = Z.safariCtx; if (!C || !X0) return;
  var N = Z.N, NN = N * N, TILE = Z.TILE, D = Z.DATA, SD = D.safari, bus = Z.bus, rng = Z.rng, clamp = C.clamp, fail = C.fail, okr = C.okr, INF = C.INF;
  if (bus && bus.on) bus.on('gridsize', function (n) { N = n; NN = n * n; });
  var PI = Math.PI, TAU = PI * 2, SEA_Y = -0.1;
  var A = Z.Safari = {};
  if (Z.Sim) Z.Sim.safari = A;
  function S() { return C.S(); }
  function RT() { return C.RT(); }
  function BD() { return C.BD(); }
  function SP() { return C.SP(); }
  function ST() { var s = S(); return s && s.safari; }
  function now() { var s = S(); return s.day + s.time; }
  function ti(t) { return t % N; }
  function tj(t) { return (t - (t % N)) / N; }
  function tcx(t) { return (t % N + 0.5) * TILE; }
  function tcz(t) { return (((t - (t % N)) / N) + 0.5) * TILE; }
  function dist(ax, az, bx, bz) { return Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz)); }
  function waterIdx() { return A._wi === undefined ? (A._wi = D.terrain.findIndex(function (q) { return q.id === 'water'; })) : A._wi; }
  function isWater(t) { return S().terrain[t] === waterIdx(); }
  function fenceDef(v) { return v ? D.fences[v - 1] : null; }
  function ensure() {
    var s = S(); if (!s) return null;
    if (!s.safari) s.safari = Z.newState().safari;
    var o = s.safari; if (!o.routes) o.routes = []; if (!o.veh) o.veh = []; if (!o.zones) o.zones = {}; if (!o.away) o.away = [];
    if (!o.stats) o.stats = {}; var d = Z.newState().safari.stats; for (var k in d) if (o.stats[k] === undefined) o.stats[k] = d[k];
    if (!o.nextRoute) o.nextRoute = 1; if (!o.nextVeh) o.nextVeh = 1; if (o.cleanDays === undefined) o.cleanDays = 0; if (o.lockdown === undefined) o.lockdown = 0;
    return o;
  }
  var X = { ver: 0, gates: {}, gateList: [], portals: [], routes: {}, zones: {}, field: null, rangers: [] };
  var VR = {};          // vehicle runtime: {pax:[], x,z,y,h, ov:[], ovT, blk, nudgeT, stuckT, rescueT}
  var GS = {};          // gate controller runtime by key: {out:0..1, 'in':0..1, owner, crossing, phase, manual}
  var W = { list: [], by: {}, seq: 1000000, acc: 0, bt: 0, spawnT: 0, today: 0 };
  A.wildList = function () { return W.list; };
  A.wildById = function (id) { return W.by[id] || null; };
  A.state = function () { return X; };
  A.version = function () { return X.ver; };
  function defOf(o) { return BD()[o.type] || null; }
  function objById(id) { return RT().oById.get(id) || null; }

  // ------------------------------------------------------------------ power
  function mainsOK() {
    if (!Z.Power) return true;
    var p = Z.Power.status();
    return !!(p.supply > 0 || p.onBattery || (p.stored > 0 && p.capacity > 0) || p.backup === 'running' || p.backup === 'idle');
  }
  function gateKeyOf(axis, i, j) { return (axis === 'x' ? 'x' : 'z') + i + ',' + j; }
  function portalCanOpen(o, gs) { return gs.manual > 0 || !Z.Power || Z.Power.objPowered(o.id); }
  function gatePowered(g) { var gs = GS[g.key]; return mainsOK() || (gs && gs.manual > 0); }
  A.gatesPowered = function () { return mainsOK(); };
  function zonePowered(enc) {
    if (!enc) return true;
    if (Z.Realms && enc.kind) { var cs = Z.Realms.containmentStatus(enc.id); if (cs && cs.powered === false) return false; }
    return mainsOK() || (Z.Power && Z.Power.hasBackup());
  }

  // ------------------------------------------------------------------ derive: gates, portals
  function scanGates() {
    var s = S(), list = [], by = {}, i, j, v, f;
    for (j = 0; j <= N; j++) for (i = 0; i < N; i++) {          // fenceX: along the north side of (i,j)
      v = s.fenceX[i + j * N]; f = v && fenceDef(v); if (!f || !f.safariGate) continue;
      list.push(mkGate('x', i, j, f));
    }
    for (j = 0; j < N; j++) for (i = 0; i <= N; i++) {          // fenceZ: along the west side of (i,j)
      v = s.fenceZ[i + j * (N + 1)]; f = v && fenceDef(v); if (!f || !f.safariGate) continue;
      list.push(mkGate('z', i, j, f));
    }
    list.forEach(function (g) { by[g.key] = g; if (!GS[g.key]) GS[g.key] = { out: 0, 'in': 0, owner: 0, phase: 0, manual: 0, t: 0 }; });
    X.gateList = list; X.gates = by;
    for (var k in GS) if (k.charAt(0) !== 'p' && !by[k]) delete GS[k];
  }
  function mkGate(axis, i, j, f) {
    var s = S(), tA, tB;     // tA: the tile on the lower side, tB: the higher side (north/west first)
    if (axis === 'x') { tA = (j > 0 ? i + (j - 1) * N : -1); tB = (j < N ? i + j * N : -1); } else { tA = (i > 0 ? (i - 1) + j * N : -1); tB = (i < N ? i + j * N : -1); }
    var eA = tA >= 0 ? s.tileEnc[tA] : 0, eB = tB >= 0 ? s.tileEnc[tB] : 0;
    var inside = eA && !eB ? tA : eB && !eA ? tB : eA ? tA : tB;      // the tile on the zone side
    var outside = inside === tA ? tB : tA;
    var cx = axis === 'x' ? (i + 0.5) * TILE : i * TILE, cz = axis === 'x' ? j * TILE : (j + 0.5) * TILE;
    var ux = 0, uz = 0;    // unit vector from outside to inside
    if (inside >= 0 && outside >= 0) { ux = Math.sign(tcx(inside) - tcx(outside)); uz = Math.sign(tcz(inside) - tcz(outside)); }
    else if (inside >= 0) { ux = axis === 'z' ? (inside === tB ? 1 : -1) : 0; uz = axis === 'x' ? (inside === tB ? 1 : -1) : 0; }
    var half = 2.0;
    return { key: gateKeyOf(axis, i, j), axis: axis, i: i, j: j, kind: f.safariGate, enc: s.tileEnc[inside] || 0, inside: inside, outside: outside, cx: cx, cz: cz, ux: ux, uz: uz,
      pOut: { x: cx - ux * half, z: cz - uz * half }, pIn: { x: cx + ux * half, z: cz + uz * half }, ang: Math.atan2(ux, uz), f: f };
  }
  function scanPortals() {
    var s = S(), out = [], pBy = {};
    s.objects.forEach(function (o) { var d = defOf(o); if (d && d.safariPortal) { var c = C.objCentre(o); out.push({ id: o.id, o: o, x: c.x, z: c.z, i: o.i, j: o.j }); pBy['p' + o.id] = 1; } });
    X.portals = out;
    for (var k in GS) if (k.charAt(0) === 'p' && !pBy[k]) delete GS[k];
  }
  function portalNear(x, z, r) {
    for (var k = 0; k < X.portals.length; k++) { var p = X.portals[k]; if (dist(p.x, p.z, x, z) <= r * TILE) return p; }
    return null;
  }
  // the fence value on the edge between two adjacent tiles
  function edgeBetween(a, b) {
    var s = S(), d = b - a;
    if (d === 1) return { axis: 'z', i: ti(b), j: tj(b), v: s.fenceZ[ti(b) + tj(b) * (N + 1)] };
    if (d === -1) return { axis: 'z', i: ti(a), j: tj(a), v: s.fenceZ[ti(a) + tj(a) * (N + 1)] };
    if (d === N) return { axis: 'x', i: ti(b), j: tj(b), v: s.fenceX[ti(b) + tj(b) * N] };
    if (d === -N) return { axis: 'x', i: ti(a), j: tj(a), v: s.fenceX[ti(a) + tj(a) * N] };
    return null;
  }

  // ------------------------------------------------------------------ derive: routes & depot orientation
  function depotOf(r) { var o = objById(r.depot), d = o && defOf(o); return o && d && d.safari === r.kind ? o : null; }
  function adjacent(a, b) { var d = Math.abs(a - b); return d === N || (d === 1 && tj(a) === tj(b)); }
  function realmOfEnc(enc) { return enc ? (enc.realm || 'land') : 'land'; }
  // Front (+z at rot=0) is the guest path entrance; Back (-z at rot=0) is where safari vehicles launch & return.
  function depotEnds(o) {
    if (!o) return null;
    var fp = C.objFootprint(o), rot = (o.rot | 0) & 3;
    var fd = rot === 0 ? [0, 1] : rot === 1 ? [1, 0] : rot === 2 ? [0, -1] : [-1, 0];
    var bd = [-fd[0], -fd[1]];
    var backTiles = [], backRow = [], frontRow = [], k, x, y;
    if (rot === 0) {
      for (k = 0; k < fp.w; k++) { x = fp.i0 + k; y = fp.j0 - 1; if (x >= 0 && x < N && y >= 0 && y < N) backTiles.push(x + y * N); backRow.push(x + fp.j0 * N); y = fp.j0 + fp.h; if (x >= 0 && x < N && y >= 0 && y < N) frontRow.push(x + y * N); }
    } else if (rot === 1) {
      for (k = 0; k < fp.h; k++) { x = fp.i0 - 1; y = fp.j0 + k; if (x >= 0 && x < N && y >= 0 && y < N) backTiles.push(x + y * N); backRow.push(fp.i0 + y * N); x = fp.i0 + fp.w; if (x >= 0 && x < N && y >= 0 && y < N) frontRow.push(x + y * N); }
    } else if (rot === 2) {
      for (k = 0; k < fp.w; k++) { x = fp.i0 + k; y = fp.j0 + fp.h; if (x >= 0 && x < N && y >= 0 && y < N) backTiles.push(x + y * N); backRow.push(x + (fp.j0 + fp.h - 1) * N); y = fp.j0 - 1; if (x >= 0 && x < N && y >= 0 && y < N) frontRow.push(x + y * N); }
    } else {
      for (k = 0; k < fp.h; k++) { x = fp.i0 + fp.w; y = fp.j0 + k; if (x >= 0 && x < N && y >= 0 && y < N) backTiles.push(x + y * N); backRow.push((fp.i0 + fp.w - 1) + y * N); x = fp.i0 - 1; if (x >= 0 && x < N && y >= 0 && y < N) frontRow.push(x + y * N); }
    }
    var mid = Math.floor(backTiles.length / 2);
    return { fp: fp, rot: rot, frontDir: fd, backDir: bd, backTiles: backTiles, backRow: backRow, frontTiles: frontRow, backCenter: backTiles.length ? backTiles[mid] : -1 };
  }
  A.depotEnds = function (idOrObj) { var o = typeof idOrObj === 'object' ? idOrObj : objById(idOrObj); return o ? depotEnds(o) : null; };
  function isBackAnchor(o, t) {
    var de = depotEnds(o); if (!de) return false;
    return de.backTiles.indexOf(t) >= 0 || de.backRow.indexOf(t) >= 0;
  }
  function isFrontTile(o, t) {
    var de = depotEnds(o); if (!de) return false;
    return de.frontTiles.indexOf(t) >= 0;
  }
  // validate a tile list for a kind; opts: { partial, mode: 'loop'|'outback'|null }
  function checkTiles(kind, tiles, depotObj, opts) {
    var s = S(), partial = !!(opts && opts.partial), mode = opts && opts.mode || null;
    var res = { why: '', partialWhy: '', cross: [], inside: {}, loop: false, canLoop: false, hardErr: false }, k, t;
    if (!tiles || tiles.length < (partial ? 1 : 4)) { res.why = 'The route needs at least 4 tiles'; return res; }
    var seen = {};
    for (k = 0; k < tiles.length; k++) {
      t = tiles[k]; if (seen[t]) { res.why = 'The route crosses itself'; res.hardErr = true; return res; } seen[t] = 1;
      if (k && !adjacent(tiles[k - 1], t)) { res.why = 'The route has a gap'; res.hardErr = true; return res; }
    }
    if (depotObj) {
      var fp = C.objFootprint(depotObj), a = tiles[0], ai = ti(a), aj = tj(a);
      var reach = kind === 'sea' ? 2 : 1;
      if (ai < fp.i0 - reach || ai > fp.i0 + fp.w - 1 + reach || aj < fp.j0 - reach || aj > fp.j0 + fp.h - 1 + reach) {
        res.why = 'Start the route at the rear bay of the ' + (kind === 'land' ? 'depot' : kind === 'sea' ? 'harbour' : 'pad'); res.hardErr = true; return res;
      }
      // For land depots, ensure the route leads out the BACK (not across the front guest path), while preserving legacy routes whose tile[1] enters the depot
      if (kind === 'land' && isFrontTile(depotObj, a) && !(tiles.length > 1 && s.tileObj[tiles[1]] === depotObj.id)) {
        res.why = 'Start the safari track from the rear bay (behind the depot), not across the front path'; res.hardErr = true; return res;
      }
    }
    for (k = 0; k < tiles.length; k++) {
      t = tiles[k];
      var own = s.tileObj[t] === (depotObj && depotObj.id);
      var enc = s.tileEnc[t] ? RT().eMap[s.tileEnc[t]] : null;
      if (kind === 'land') {
        if (isWater(t)) { res.why = 'A truck cannot drive through water'; res.hardErr = true; return res; }
        if (C.cliffT(t)) { res.why = 'Too steep for a truck'; res.hardErr = true; return res; }
        if (s.ditch[t]) { res.why = 'A ditch is in the way'; res.hardErr = true; return res; }
        if (s.path[t] && !(k === 0 && tiles.length > 1 && depotObj && s.tileObj[tiles[1]] === depotObj.id)) { res.why = 'Safari track cannot cross a guest path — lead it out the back of the depot'; res.hardErr = true; return res; }
        if (!own && s.tileObj[t] && !(objById(s.tileObj[t]) && (defOf(objById(s.tileObj[t])) || {}).safariPortal)) { res.why = 'A building is in the way'; res.hardErr = true; return res; }
        if (enc && enc.realm === 'sea') { res.why = 'That is a sea enclosure'; res.hardErr = true; return res; }
        if (enc && enc.kind === 'tank') { res.why = 'Trucks cannot enter a tank'; res.hardErr = true; return res; }
      } else if (kind === 'sea') {
        if (!isWater(t) && !(k < 2 && depotObj && !S().tileEnc[t])) { res.why = 'Boats stay on the water'; res.hardErr = true; return res; }
        if (!isWater(t)) {
          if (C.cliffT(t)) { res.why = 'Too steep for a harbour launch'; res.hardErr = true; return res; }
          if (s.ditch[t]) { res.why = 'A ditch is in the way'; res.hardErr = true; return res; }
          if (s.path[t]) { res.why = 'Safari route cannot cross a guest path'; res.hardErr = true; return res; }
          if (!own && s.tileObj[t]) { res.why = 'A building is in the way'; res.hardErr = true; return res; }
        }
        if (enc && enc.realm !== 'sea') { res.why = 'That is a land enclosure'; res.hardErr = true; return res; }
        if (enc && enc.kind === 'tank') { res.why = 'Boats cannot enter a tank'; res.hardErr = true; return res; }
      } else {
        if (!own && s.tileObj[t] && (BD()[(objById(s.tileObj[t]) || {}).type] || {}).type === 'science') { res.why = 'Keep the flight path clear of the lab'; res.hardErr = true; return res; }
      }
      if (enc) res.inside[enc.id] = (res.inside[enc.id] || 0) + 1;
      if (k && kind !== 'air') {
        var p = tiles[k - 1], e0 = s.tileEnc[p] || 0, e1 = s.tileEnc[t] || 0;
        var ed = edgeBetween(p, t), f = ed && fenceDef(ed.v);
        if (e0 !== e1) {
          if (f && f.safariGate) {
            if (f.safariGate !== kind) { res.why = (kind === 'sea' ? 'Boats need a boat lock gate' : 'Trucks need an airlock gate'); res.hardErr = true; return res; }
            res.cross.push({ k: k - 1, key: gateKeyOf(ed.axis, ed.i, ed.j), ent: e1 !== 0 });
          } else if (f) { res.why = 'A fence is in the way: use a safari gate there'; res.hardErr = true; return res; }
          else {
            var en0 = e0 ? RT().eMap[e0] : null, en1 = e1 ? RT().eMap[e1] : null, virt = (en0 && en0.kind === 'virtual') || (en1 && en1.kind === 'virtual');
            if (virt && kind === 'land') {
              var pm = (tcx(p) + tcx(t)) / 2, pz = (tcz(p) + tcz(t)) / 2, por = portalNear(pm, pz, 4);
              if (!por) { res.why = 'A zone edge needs a geofence portal within 4 tiles'; res.hardErr = true; return res; }
              res.cross.push({ k: k - 1, key: 'p' + por.id, portal: por.id, ent: e1 !== 0 });
            } else if (virt && kind === 'sea') { res.cross.push({ k: k - 1, key: 'v', ent: e1 !== 0, virt: true }); }
            else if (e0 && e1) { res.why = 'The route crosses between two zones without a gate'; res.hardErr = true; return res; }
            else { res.why = 'The route crosses a barrier without a gate'; res.hardErr = true; return res; }
          }
        } else if (f) {
          if (f.safariGate) {
            if (f.safariGate !== kind) { res.why = (kind === 'sea' ? 'Boats need a boat lock gate' : 'Trucks need an airlock gate'); res.hardErr = true; return res; }
            res.cross.push({ k: k - 1, key: gateKeyOf(ed.axis, ed.i, ed.j), ent: true });
          } else { res.why = 'A fence is in the way: use a safari gate there'; res.hardErr = true; return res; }
        }
      }
    }
    // gate approaches must be straight (two tiles either side)
    for (k = 0; k < res.cross.length; k++) {
      var c = res.cross[k]; if (c.virt || c.portal) continue;
      var a0 = tiles[c.k - 1], a1 = tiles[c.k], a2 = tiles[c.k + 1], a3 = tiles[c.k + 2];
      // while laying partial track right through a gate, allow a3 to be undefined until extended
      if (partial && a3 === undefined && a0 !== undefined && (a1 - a0) === (a2 - a1)) continue;
      if (a0 === undefined || a3 === undefined || (a1 - a0) !== (a2 - a1) || (a3 - a2) !== (a2 - a1)) { res.why = 'Keep the track straight for two tiles either side of a gate'; res.hardErr = true; return res; }
    }
    var last = tiles[tiles.length - 1];
    res.canLoop = tiles.length >= 6 && (adjacent(last, tiles[0]) || (!!depotObj && isBackAnchor(depotObj, last) && last !== tiles[0]));
    res.loop = mode === 'outback' ? false : mode === 'loop' ? res.canLoop : res.canLoop;
    var nIn = 0, ea = null; for (var id in res.inside) { if (res.inside[id] > nIn) { nIn = res.inside[id]; ea = +id; } }
    if (!ea || nIn < SD.minInside) {
      res.why = 'Extend into a dinosaur zone (' + nIn + '/' + SD.minInside + ' tiles inside)';
      if (partial) { res.partialWhy = res.why; res.why = ''; }
      return res;
    }
    var encM = RT().eMap[ea];
    if (kind !== 'air' && encM && encM.area < SD.minZone) { res.why = 'That zone is too small for a safari (needs ' + SD.minZone + ' tiles)'; return res; }
    if (kind === 'land' && encM && encM.realm === 'air') { res.why = 'Use a balloon for sky zones'; return res; }
    if (kind === 'air' && encM && encM.realm === 'sea') { res.why = 'Balloons fly over land or sky zones'; return res; }
    res.main = ea;
    if (mode === 'loop' && !res.canLoop) {
      res.why = 'Bring the track back to the depot rear bay to close the Round Trip loop (or switch to Out & Back)';
      if (partial) { res.partialWhy = res.why; res.why = ''; }
      return res;
    }
    return res;
  }
  function chaikin(pts, closed, n) {
    for (var it = 0; it < n; it++) {
      var out = [], len = pts.length;
      for (var k = 0; k < len; k++) {
        var a = pts[k], b = pts[(k + 1) % len];
        if (!closed && k === len - 1) break;
        out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
      }
      pts = out;
    }
    return pts;
  }
  function buildPath(r, chk, depotObj) {
    var tiles = r.tiles, cyc, loop = chk.loop, k;
    if (loop) {
      cyc = tiles.slice();
      // If the loop closes across the rear bay (e.g. left bay to right bay, 2 tiles apart), bridge via the middle rear tile
      var first = tiles[0], last = tiles[tiles.length - 1];
      if (!adjacent(last, first) && depotObj) {
        var de = depotEnds(depotObj);
        if (de && de.backTiles.length >= 3 && de.backCenter >= 0 && cyc.indexOf(de.backCenter) < 0 && adjacent(last, de.backCenter) && adjacent(de.backCenter, first)) cyc.push(de.backCenter);
      }
    } else { cyc = tiles.slice(); for (k = tiles.length - 2; k >= 1; k--) cyc.push(tiles[k]); }
    var raw = cyc.map(function (t) { return { x: tcx(t), z: tcz(t) }; });
    var pts = chaikin(raw, true, 2);
    if (!loop) {            // drive on the right: shift the out-and-back lanes apart
      var m = pts.length, sh = [];
      for (k = 0; k < m; k++) {
        var p0 = pts[(k + m - 1) % m], p1 = pts[(k + 1) % m], dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
        sh.push({ x: pts[k].x + (-dz / l) * 0.62, z: pts[k].z + (dx / l) * 0.62 });
      }
      pts = sh;
    }
    var cum = [0], m2 = pts.length;
    for (k = 1; k <= m2; k++) { var a = pts[k - 1], b = pts[k % m2]; cum.push(cum[k - 1] + dist(a.x, a.z, b.x, b.z)); }
    var P = { id: r.id, kind: r.kind, mode: r.mode || (loop ? 'loop' : 'outback'), ok: true, why: '', loop: loop, pts: pts, cum: cum, len: cum[m2], tiles: tiles, cyc: cyc, depot: depotObj, gates: [], inside: chk.inside, main: chk.main, zones: Object.keys(chk.inside).map(Number), appeal: 0, excitement: 0, speciesCount: 0, animalCount: 0 };
    // start: the point nearest to the first tile (the depot bay)
    var best = 0, bd = 1e9;
    for (k = 0; k < m2; k++) { var dd = dist(pts[k].x, pts[k].z, tcx(tiles[0]), tcz(tiles[0])); if (dd < bd) { bd = dd; best = k; } }
    P.pts = pts.slice(best).concat(pts.slice(0, best));
    cum = [0]; m2 = P.pts.length; for (k = 1; k <= m2; k++) { var a2 = P.pts[k - 1], b2 = P.pts[k % m2]; cum.push(cum[k - 1] + dist(a2.x, a2.z, b2.x, b2.z)); }
    P.cum = cum; P.len = cum[m2];
    // gates on the cyclic path: every crossing of the tile list (and, for out-and-back, the return pass)
    var nCyc = cyc.length;
    if (r.kind !== 'air') for (var q = 0; q < nCyc; q++) {
      var ta = cyc[q], tb = cyc[(q + 1) % nCyc]; if (!adjacent(ta, tb)) continue;
      var e0 = S().tileEnc[ta] || 0, e1 = S().tileEnc[tb] || 0;
      var ed = edgeBetween(ta, tb), f = ed && fenceDef(ed.v), key = null, kindG = null;
      if (f && f.safariGate) { key = gateKeyOf(ed.axis, ed.i, ed.j); kindG = f.safariGate; }
      else if (e0 !== e1) {
        var en0 = e0 ? RT().eMap[e0] : null, en1 = e1 ? RT().eMap[e1] : null;
        if ((en0 && en0.kind === 'virtual') || (en1 && en1.kind === 'virtual')) { var pm = (tcx(ta) + tcx(tb)) / 2, pz = (tcz(ta) + tcz(tb)) / 2, por = portalNear(pm, pz, 4); if (por && r.kind === 'land') { key = 'p' + por.id; kindG = 'portal'; } }
      }
      if (!key) continue;
      var mx = (tcx(ta) + tcx(tb)) / 2, mz = (tcz(ta) + tcz(tb)) / 2, bi = 0, bdist = 1e9;
      for (k = 0; k < P.pts.length; k++) { var dd2 = dist(P.pts[k].x, P.pts[k].z, mx, mz); if (dd2 < bdist) { bdist = dd2; bi = k; } }
      // out-and-back paths pass each crossing twice: pick the point nearest to (mx,mz) within the exact edge's Chaikin window
      var rawIdx = Math.round(((q + 0.5) * P.pts.length / nCyc) - best);
      var idx = ((rawIdx % P.pts.length) + P.pts.length) % P.pts.length;
      var win = Math.max(2, Math.round(P.pts.length / nCyc));
      var cand = -1, cd = 1e9;
      for (k = 0; k < P.pts.length; k++) {
        var dd4 = Math.min(Math.abs(k - idx), P.pts.length - Math.abs(k - idx));
        if (dd4 > win) continue;
        var d3 = dist(P.pts[k].x, P.pts[k].z, mx, mz);
        if (d3 < cd) { cd = d3; cand = k; }
      }
      if (cand >= 0) bi = cand;
      var gObj = X.gates[key];
      var ent = gObj ? (tb === gObj.inside) : (e1 !== 0);
      P.gates.push({ key: key, kind: kindG, sg: P.cum[bi], sA: P.cum[bi] - 2.0, sB: P.cum[bi] + 2.0, ent: ent, e: e1 || e0 });
    }
    P.gates.sort(function (a, b) { return a.sg - b.sg; });
    scoreRoute(P);
    return P;
  }
  function scoreRoute(P) {
    if (!P || !P.zones || !P.zones.length) { if (P) { P.appeal = 0; P.excitement = 0; P.speciesCount = 0; P.animalCount = 0; } return; }
    var s = S(), spSet = {}, nAn = 0, appSum = 0, dangerMax = 0, zSet = {};
    P.zones.forEach(function (zid) { zSet[zid] = 1; });
    for (var k = 0; k < s.animals.length; k++) {
      var a = s.animals[k]; if (!zSet[a.enc] || a.state === 'escaped') continue;
      var sp = SP()[a.species]; if (!sp) continue;
      nAn++;
      var baseA = sp.appeal || 10;
      if (!spSet[a.species]) { spSet[a.species] = 1; appSum += baseA * 1.4; }
      else appSum += baseA * 0.25;
      var d = C.aDanger(a); if (d > dangerMax) dangerMax = d;
    }
    var nSp = Object.keys(spSet).length;
    var kindBonus = P.kind === 'air' ? 14 : P.kind === 'sea' ? 12 : 10;
    var lenBonus = Math.min(18, P.tiles.length * 0.55) + (P.loop ? 6 : 0) + Math.min(12, (P.zones.length - 1) * 6);
    var exc = nAn ? clamp(Math.round(28 + kindBonus + lenBonus + Math.min(34, appSum * 0.35) + dangerMax * 5 + Math.min(12, nSp * 3)), 0, 100) : Math.min(25, Math.round(10 + lenBonus * 0.5));
    P.speciesCount = nSp; P.animalCount = nAn; P.appeal = appSum; P.excitement = exc;
  }
  function buildPartialPts(tiles) {
    if (!tiles || tiles.length < 2) return [];
    var raw = tiles.map(function (t) { return { x: tcx(t), z: tcz(t) }; });
    return chaikin(raw, false, 1);
  }
  function deriveRoutes() {
    var o = ST(), out = {}, safe = [];
    o.routes.forEach(function (r) {
      var dep = depotOf(r), chk;
      if (!dep) { out[r.id] = { id: r.id, kind: r.kind, mode: r.mode || 'outback', ok: false, why: 'The ' + (r.kind === 'sea' ? 'harbour' : r.kind === 'air' ? 'pad' : 'depot') + ' is gone', tiles: r.tiles, gates: [], zones: [], inside: {}, pts: [], len: 0, cum: [0], appeal: 0, excitement: 0, speciesCount: 0, animalCount: 0 }; return; }
      chk = checkTiles(r.kind, r.tiles, dep, { mode: r.mode || null });
      if (chk.why) {
        var ppts = buildPartialPts(r.tiles);
        out[r.id] = { id: r.id, kind: r.kind, mode: r.mode || (chk.canLoop ? 'loop' : 'outback'), ok: false, partial: !chk.hardErr, why: chk.why, tiles: r.tiles, gates: [], zones: Object.keys(chk.inside || {}).map(Number), inside: chk.inside || {}, pts: ppts, len: r.tiles.length * TILE, cum: [0], depot: dep, loop: false, appeal: 0, excitement: 0, speciesCount: 0, animalCount: 0 };
        return;
      }
      var P = buildPath(r, chk, dep); out[r.id] = P;
      for (var k = 0; k < P.gates.length; k++) { var g = P.gates[k]; if (g.key.charAt(0) !== 'p' && g.key !== 'v' && !X.gates[g.key]) { P.ok = false; P.why = 'A gate is missing'; } }
      if (r.kind === 'land' && P.ok) r.tiles.forEach(function (t) { safe.push(t); });
    });
    X.routes = out;
    if (Z.Realms && Z.Realms.markSafe) { var cur = A._safeSig, sig = safe.length + ':' + (safe[0] || 0) + ':' + (safe[safe.length - 1] || 0); if (cur !== sig) { A._safeSig = sig; Z.Realms.markSafe('safari', safe); } }
  }
  A.route = function (id) { return X.routes[id] || null; };
  A.routes = function () { return ST().routes.map(function (r) { var P = X.routes[r.id]; return { id: r.id, kind: r.kind, mode: r.mode || (P && P.loop ? 'loop' : 'outback'), depot: r.depot, ok: !!(P && P.ok), partial: !!(P && P.partial), why: P ? P.why : '', len: P ? Math.round(P.len / TILE) : 0, tiles: r.tiles.length, zones: P ? P.zones : [], loop: !!(P && P.loop), excitement: P ? P.excitement : 0, speciesCount: P ? P.speciesCount : 0, animalCount: P ? P.animalCount : 0 }; }); };

  // ------------------------------------------------------------------ derive: zones (safari status, connection, corridor markers, deterrents), walking field to the causeway
  function zoneCfg(id) { var o = ST(); return o.zones[id] || (o.zones[id] = { corr: 1 }); }
  function deriveZones() {
    var s = S(), o = ST(), zs = {}, rm = RT().eMap || {}, k;
    function zone(id) { var e = rm[id]; if (!e) return null; return zs[id] || (zs[id] = { id: id, enc: e, realm: e.realm || 'land', routes: [], safari: false, marker: null, det: 0, eligible: false, connected: false, exits: [], dinos: 0 }); }
    for (var rid in X.routes) { var P = X.routes[rid]; if (!P.ok) continue; for (var q = 0; q < P.zones.length; q++) { if ((P.inside[P.zones[q]] || 0) >= SD.minInside) { var z = zone(P.zones[q]); if (z) { z.safari = true; z.routes.push(P.id); } } } }
    X.rangers = [];
    s.objects.forEach(function (ob) {
      var d = s.objects && (D.scenery.filter(function (q) { return q.id === ob.type; })[0] || BD()[ob.type]); if (!d) return;
      if (d.safariRanger) { X.rangers.push(ob); return; }
      if (ob.kind !== 'scenery') return;
      var t = ob.i + ob.j * N, eid = s.tileEnc[t]; if (!eid) return;
      if (d.safariCorridor) { var z2 = zone(eid); if (z2) z2.marker = { x: (ob.i + 0.5) * TILE, z: (ob.j + 0.5) * TILE, t: t, id: ob.id }; }
      else if (d.safariDeter) { var z3 = zone(eid); if (z3 && z3.realm === ({ land: 'land', sea: 'sea', air: 'air' })[d.safariDeter]) z3.det++; }
    });
    var lock = !!o.lockdown;
    for (var id in zs) {
      var z4 = zs[id], e = z4.enc, cfg = zoneCfg(+id);
      z4.eligible = (e.kind === 'virtual') || !!z4.marker;
      z4.open = cfg.corr !== 0;
      z4.connected = z4.eligible && z4.open && !lock && (z4.safari || !!z4.marker);
      z4.virtual = e.kind === 'virtual';
      var seenT = {};
      for (k = 0; k < e.tiles.length; k++) {
        var t2 = e.tiles[k], i = ti(t2), j = tj(t2), nb = [i > 0 ? t2 - 1 : -1, i < N - 1 ? t2 + 1 : -1, j > 0 ? t2 - N : -1, j < N - 1 ? t2 + N : -1];
        for (var n = 0; n < 4; n++) { var nt = nb[n]; if (nt >= 0 && !s.tileEnc[nt] && !seenT[nt] && !RT().block[nt] && (z4.realm === 'sea' ? isWater(nt) : !isWater(nt) && !C.cliffT(nt))) { seenT[nt] = 1; z4.exits.push(nt); } }
        if (z4.exits.length > 90) break;
      }
    }
    X.zones = zs;
  }
  A.zone = function (id) { return X.zones[id] || null; };
  A.zones = function () { return Object.keys(X.zones).map(function (k) { return X.zones[k]; }); };
  A.isSafari = function (id) { var z = X.zones[id]; return !!(z && z.safari); };
  A.isConnected = function (id) { var z = X.zones[id]; return !!(z && z.connected); };
  A.connectedCount = function () { var n = 0; for (var k in X.zones) if (X.zones[k].connected) n++; return n; };
  A.setCorridor = function (encId, open) { var z = X.zones[encId]; if (!z) return fail('Not a safari or corridor zone'); zoneCfg(encId).corr = open ? 1 : 0; A.update(); return okr(0); };
  // walking distance field from the causeway gate over open ground (loose animals follow it downhill)
  function computeField() {
    var s = S(), f = new Int16Array(NN).fill(INF > 30000 ? 9999 : 9999), q = [], t, h = 0;
    var g0 = (N - 1) * N + (Math.floor(N / 2) - 1);
    [g0, g0 + 1].forEach(function (x) { f[x] = 0; q.push(x); });
    var rt = RT();
    while (h < q.length) {
      t = q[h++]; var i = ti(t), j = tj(t), d = f[t] + 1, nb = [i > 0 ? t - 1 : -1, i < N - 1 ? t + 1 : -1, j > 0 ? t - N : -1, j < N - 1 ? t + N : -1];
      for (var n = 0; n < 4; n++) { var u = nb[n]; if (u < 0 || f[u] <= d) continue; if (s.tileEnc[u] || rt.block[u] || s.ditch[u] || C.cliffT(u) || isWater(u)) continue; f[u] = d; q.push(u); }
    }
    X.field = f;
  }
  A.update = function () {
    var o = ensure(); if (!o || !RT() || !RT().eMap) return;
    X.ver++; scanGates(); scanPortals(); deriveRoutes(); deriveZones(); fixVehicles(); computeField();
    bus.emit('safari');
  };

  // ------------------------------------------------------------------ vehicles: pose along a route
  function sample(P, s, out) {
    var L = P.len; if (!(L > 0)) { out.x = 0; out.z = 0; out.h = 0; return out; }
    s = ((s % L) + L) % L;
    var lo = 0, hi = P.pts.length;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (P.cum[mid] <= s) lo = mid; else hi = mid; }
    var a = P.pts[lo], b = P.pts[(lo + 1) % P.pts.length], seg = P.cum[lo + 1] - P.cum[lo] || 1, f = (s - P.cum[lo]) / seg;
    out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.h = Math.atan2(b.x - a.x, b.z - a.z);
    return out;
  }
  A.sample = function (rid, s, out) { var P = X.routes[rid]; return P && P.ok ? sample(P, s, out || {}) : null; };
  function fd(from, to, L) { return (((to - from) % L) + L) % L; }
  function sd(from, to, L) { var d = fd(from, to, L); return d > L / 2 ? d - L : d; }
  function vrt(v) { return VR[v.id] || (VR[v.id] = { pax: [], x: 0, z: 0, y: 0, h: 0, ov: [], ovT: 0, blkT: 0, blk: 0, stuckT: 0, rescueT: 0, nudgeT: 0, bT: 0, aT: 0, seq: 0, tilt: 0 }); }
  function refreshRanks(o) {
    var byR = {}; o.veh.forEach(function (v) { (byR[v.route] = byR[v.route] || []).push(v); });
    for (var rid in byR) { var n = 0; byR[rid].forEach(function (v) { v.rank = v.st === 'idle' ? n++ : 0; }); }
  }
  function fixVehicles() {
    var o = ST(), keep = [];
    o.veh.forEach(function (v) {
      var P = X.routes[v.route], r = o.routes.filter(function (q) { return q.id === v.route; })[0];
      if (!r || !depotOf(r)) { var rt = VR[v.id]; if (rt) ejectAll(v, true); delete VR[v.id]; var ref = Math.round((v.paid || 0) * SD.refundVeh); if (ref) { C.earn(ref, 'construction'); C.msg('A safari vehicle was sold off with its depot (' + C.fmt(ref) + ' recovered).', 'info', false); } return; }
      keep.push(v); vrt(v);
      if (P && P.ok && P.len > 0 && v.s >= P.len) v.s = Math.max(0, P.len - 0.5);
    });
    o.veh = keep;
    refreshRanks(o);
  }

  // ------------------------------------------------------------------ gate controller
  function stepGates(dt) {
    var gt = SD.gateTime, list = X.gateList, k, g, gs, pw;
    function mv(cur, tg) { var d = tg - cur, m = dt / gt; return Math.abs(d) <= m ? tg : cur + (d > 0 ? m : -m); }
    for (var key in GS) {
      gs = GS[key];
      if (!gs.owner || gs.phase === 6) continue;
      var v = vehById(gs.owner), P = v && X.routes[v.route];
      if (!P || !P.ok || v.st === 'idle' || v.st === 'board' ||
          !P.gates.some(function (c) { return c.key === key && c.sg === gs.crossing; })) gs.phase = 6;
    }
    for (k = 0; k < list.length; k++) {
      g = list[k]; gs = GS[g.key]; if (!gs) continue; pw = gatePowered(g);
      gate(gs, pw, false, mv);
    }
    for (k = 0; k < X.portals.length; k++) { var p = X.portals[k]; key = 'p' + p.id; gs = GS[key] || (GS[key] = { out: 0, 'in': 0, owner: 0, phase: 0, manual: 0, t: 0 }); gate(gs, portalCanOpen(p.o, gs), true, mv); }
  }
  function gate(gs, pw, single, mv) {
    var first = gs.first || 'out', second = first === 'out' ? 'in' : 'out', tF = 0, tS = 0, ph = gs.phase;
    if (pw || gs.manual > 0) {
      if (ph === 1 || ph === 2) tF = 1;
      else if (ph === 4 || ph === 5) tS = 1;
      if (single && (ph === 1 || ph === 2 || ph === 5 || ph === 4)) { tF = 1; tS = 0; }
    }
    gs[first] = mv(gs[first] || 0, tF);
    if (!single) gs[second] = mv(gs[second] || 0, tS); else gs[second] = 0;
    if (ph === 1 && gs[first] >= 0.99) gs.phase = 2;
    else if (ph === 3 && gs[first] === 0) gs.phase = single ? 0 : 4;
    else if (ph === 4 && gs[second] >= 0.99) gs.phase = 5;
    else if (ph === 6 && gs.out === 0 && gs['in'] === 0) { gs.phase = 0; gs.owner = 0; gs.manual = 0; }
    if (gs.phase === 0 && (gs.out > 0.01 || gs['in'] > 0.01)) { gs.out = mv(gs.out, 0); gs['in'] = mv(gs['in'], 0); }
    if (single && ph === 6) { gs[first] = mv(gs[first], 0); }
  }
  A.gateState = function (key) { return GS[key] || null; };
  A.gates = function () { return X.gateList; };
  A.portals = function () { return X.portals; };
  A.doorMaxBoth = function () { var m = 0; for (var k in GS) m = Math.max(m, Math.min(GS[k].out, GS[k]['in'])); return m; };
  function vehById(id) { var v = ST().veh; for (var k = 0; k < v.length; k++) if (v[k].id === id) return v[k]; return null; }
  A.vehicle = vehById;
  A.vehRt = function (id) { return VR[id] || null; };

  // ------------------------------------------------------------------ vehicles: driving
  function cruise(v) {
    var w = C.WX(), wk = ({ storm: 0.6, rain: 0.85, fog: 0.8 })[S().weather && S().weather.type] || 1;
    return SD.speed[v.kind] * wk;
  }
  function blockers(v, P) {
    // anything standing on the track just ahead (animals cross the road; the truck waits)
    var s = S(), ahead = [3.4, 6.2], k, hit = null, tmp = {}, pts = [];
    for (k = 0; k < ahead.length; k++) { sample(P, v.s + ahead[k], tmp); pts.push({ x: tmp.x, z: tmp.z }); }
    var list = s.animals, n = list.length, an;
    for (k = 0; k < n; k++) {
      an = list[k]; if (an.state === 'escaped' && v.kind !== 'land') continue;
      if (v.kind === 'air') continue;
      var sp = SP()[an.species], r = Math.min(2.7, 1.2 + (sp.length || 1) * 0.16), rl = sp.realm || 'land';
      if (v.kind === 'land' && rl !== 'land') continue; if (v.kind === 'sea' && rl !== 'sea') continue;
      for (var q = 0; q < 2; q++) if (dist(an.x, an.z, pts[q].x, pts[q].z) < r) { hit = an; break; }
      if (hit) break;
    }
    if (!hit) for (k = 0; k < W.list.length; k++) {
      var w = W.list[k]; if (v.kind === 'land' && w.kind !== 'land') continue; if (v.kind === 'sea' && w.kind !== 'sea') continue; if (v.kind === 'air') continue;
      for (q = 0; q < 2; q++) if (dist(w.x, w.z, pts[q].x, pts[q].z) < 1.5) { hit = w; break; }
      if (hit) break;
    }
    return hit;
  }
  function bayBusy(o, routeId, exceptId) {
    for (var k = 0; k < o.veh.length; k++) {
      var w = o.veh[k];
      if (w.route !== routeId || w.id === exceptId || w.st === 'idle') continue;
      if (w.st === 'board' || w.s < 5.4) return true;
    }
    return false;
  }
  function stepVehicles(dt) {
    var o = ST(); if (!o.veh.length) return;
    var open = C.openNow(), L, k;
    refreshRanks(o);
    for (var vi = 0; vi < o.veh.length; vi++) {
      var v = o.veh[vi], P = X.routes[v.route], rt = vrt(v);
      if (!P || !P.ok) { if (v.st !== 'idle') ejectAll(v); v.st = 'idle'; v.v = 0; v.s = 0; v.al = 0; poseOf(v, P, rt); continue; }
      L = P.len;
      var q = RT().bq[P.depot.id], qn = q ? q.q.length : 0;
      if (v.st === 'idle') {
        v.v = 0; v.s = 0; v.al = 0;
        if (v.rank === 0 && open && !o.lockdown && qn > 0 && routeGo(P) && !bayBusy(o, v.route, v.id)) {
          v.st = 'board'; v.dw = 0; rt.aT = 0; rt.bT = 0; rt.alight = false; v.al = 0;
          refreshRanks(o);
        }
      } else if (v.st === 'board') {
        v.v = 0; v.s = 0; v.dw += dt; rt.bT -= dt;
        var canRun = open && !o.lockdown && routeGo(P);
        if (!canRun && rt.pax.length && !rt.alight) { rt.alight = true; v.al = 1; rt.aT = 0; }
        if (rt.pax.length && rt.alight) { rt.aT -= dt; if (rt.aT <= 0) { rt.aT = 0.35; alightOne(v, P); } }
        else {
          rt.alight = false; v.al = 0;
          if (canRun && rt.bT <= 0 && rt.pax.length < SD.capacity[v.kind] && boardOne(v, P)) rt.bT = 0.4;
          var full = rt.pax.length >= SD.capacity[v.kind], pend = pendingQ(P);
          if (rt.pax.length && canRun && v.dw >= SD.dwell && (full || pend === 0 || v.dw >= SD.dwell + 5)) {
            v.st = 'run'; v.v = 0.2; v.why = ''; rt.nudged = false; rt.nudgeT = 0;
          }
          else if (!rt.pax.length && ((v.dw >= SD.dwell + 5 && pend === 0) || !canRun)) { v.st = 'idle'; v.al = 0; refreshRanks(o); }
        }
      } else if (v.st === 'broken') {
        v.v = 0; v.brk -= dt; rt.stuckT += dt; if (v.brk <= 0) { v.st = 'run'; v.why = ''; rt.stuckT = 0; C.msg('The ' + vName(v) + ' is moving again.', 'good', false); }
      } else {
        // ---- running
        var tgtV = cruise(v), trafficLimit = Infinity, lim = Infinity, why = '', stuck = false;
        // vehicles ahead (cyclic along the route, including vehicles boarding/stopped at the bay)
        for (k = 0; k < o.veh.length; k++) {
          var w = o.veh[k]; if (w === v || w.route !== v.route || w.st === 'idle') continue;
          var dd = fd(v.s, w.s, L);
          if (dd === 0 && (w.st === 'board' || k < vi)) { trafficLimit = Math.min(trafficLimit, v.s); continue; }
          if (dd > 0) trafficLimit = Math.min(trafficLimit, v.s + dd - 5.4);
        }
        if (trafficLimit < v.s + 12 - 5.4) { lim = trafficLimit; why = 'Queuing behind another vehicle'; }
        var gsLim = gateLimit(v, P, trafficLimit);
        if (gsLim.lim < lim) { lim = gsLim.lim; why = gsLim.why; stuck = gsLim.stuck; }
        // animals on the road
        rt.blkT -= dt;
        if (rt.blkT <= 0) {
          rt.blkT = 0.25;
          var blocker = blockers(v, P);
          if (blocker !== rt.blk) { rt.blk = blocker; rt.blkWait = 0; rt.blkSide = 0; }
        }
        if (rt.nudgeT > 0) { rt.nudgeT -= dt; tgtV = 0; if (!stuck) why = 'A ' + C.lc(SP()[rt.nudgeSp || 'trex'] ? SP()[rt.nudgeSp].name : 'animal') + ' is investigating the vehicle'; }
        else if (rt.blk) {
          tgtV = 0; if (!stuck) why = 'Waiting for ' + (rt.blk.name || 'a wild animal') + ' to cross'; rt.blkWait = (rt.blkWait || 0) + dt;
          if (rt.blkWait > 1.5) pushAside(rt.blk, rt, dt, P, v);
          if (rt.blkWait > 12) { shoo(rt.blk, P, v); rt.blkWait = 6; }
        } else rt.blkWait = 0;
        // brake for the limit
        var room = lim === Infinity ? 99 : lim - v.s;
        if (lim !== Infinity && room < 0) room = 0;
        var vmax = lim === Infinity ? tgtV : Math.min(tgtV, Math.sqrt(2 * SD.accel * Math.max(0, room - 0.02)) + 0.05);
        if (room < 0.06 && lim !== Infinity) vmax = 0;
        v.v += clamp(vmax - v.v, -SD.accel * 1.6 * dt, SD.accel * dt);
        if (v.v < 0) v.v = 0;
        var adv = v.v * dt; if (lim !== Infinity) adv = Math.min(adv, Math.max(0, room));
        var s0 = v.s; v.s += adv;
        v.st = (v.v < 0.05 && (why || rt.blk)) ? (stuck ? 'stuck' : 'wait') : 'run'; v.why = v.st === 'run' ? '' : why;
        if (v.st === 'stuck') { rt.stuckT += dt; if (rt.stuckT > 40 && !rt.stranded) strand(v, rt); stuckTick(v, P, rt, dt); } else if (v.st === 'wait' && why.indexOf('Waiting') < 0) { rt.stuckT = Math.max(0, rt.stuckT - dt); } else if (v.st === 'run') { rt.stuckT = 0; rt.stranded = false; rt.rescueT = 0; }
        // back at the start: arrive
        if (v.s >= L) { v.s = 0; v.st = 'board'; v.v = 0; v.dw = 0; rt.aT = 0; rt.bT = 0.8; rt.alight = rt.pax.length > 0; v.al = rt.alight ? 1 : 0; }
        if (v.s < s0 - L / 2) { v.s = 0; v.st = 'board'; v.v = 0; v.dw = 0; rt.aT = 0; rt.bT = 0.8; rt.alight = rt.pax.length > 0; v.al = rt.alight ? 1 : 0; }
        // breakdowns (a game hour is DAY_SECONDS/24 s)
        if (rng.next() < SD.breakdownPerHour * dt / (C.DAY_SECONDS / 24) && v.st === 'run') { v.st = 'broken'; v.brk = rng.range(SD.fixTime[0], SD.fixTime[1]); v.why = 'Broken down: engineers on the way'; rt.stuckT = 0; }
        rt.nudgeChk = (rt.nudgeChk || 0) - dt;
        if (rt.nudgeChk <= 0) {
          rt.nudgeChk = 0.5;
          if (v.st === 'run' && v.v >= 0.05 && !rt.blk) nudgeCheck(rt);
        }
      }
      poseOf(v, P, rt);
      for (var pq = 0; pq < rt.pax.length; pq++) placeRider(v, rt, rt.pax[pq]);
      rt.ovT -= dt; if (rt.ovT <= 0 && rt.pax.length) { rt.ovT = 0.5; viewScan(v, rt); }
    }
  }
  function routeGo(P) {
    for (var k = 0; k < P.gates.length; k++) {
      var g = P.gates[k];
      if (g.key === 'v') continue;
      if (g.key.charAt(0) === 'p') {
        var po = objById(+g.key.slice(1));
        if (po && !portalCanOpen(po, GS[g.key] || {})) return false;
        continue;
      }
      var G = X.gates[g.key]; if (G && !gatePowered(G)) return false;
    }
    return !ST().lockdown;
  }
  function pendingQ(P) { var q = RT().bq[P.depot.id]; if (!q) return 0; var n = 0; for (var k = 0; k < q.q.length; k++) { var g = RT().gById.get(q.q[k]); if (g && g.state === 'queue') n++; } return n; }
  function vName(v) { return v.kind === 'sea' ? 'tour boat' : v.kind === 'air' ? 'balloon' : 'safari truck'; }
  function poseOf(v, P, rt) {
    var tmp = {};
    if (P && P.ok) {
      sample(P, v.s, tmp);
      if (v.st === 'idle') { var r = v.rank || 0, sd2 = (r % 2 ? 1 : -1) * (1 + Math.floor(r / 2) * 1.0) * 2.6; tmp.x += Math.cos(tmp.h) * sd2; tmp.z += -Math.sin(tmp.h) * sd2; }
      rt.x = tmp.x; rt.z = tmp.z; rt.h = tmp.h;
    } else {
      var dep = P && P.depot;
      if (!dep) { var rr = ST().routes.filter(function (q) { return q.id === v.route; })[0]; dep = rr && depotOf(rr); }
      if (dep) {
        var de = depotEnds(dep), bt = de && de.backCenter >= 0 ? de.backCenter : -1;
        var cx = bt >= 0 ? tcx(bt) : C.objCentre(dep).x, cz = bt >= 0 ? tcz(bt) : C.objCentre(dep).z;
        var h0 = de ? Math.atan2(de.backDir[0], de.backDir[1]) : 0;
        var r2 = v.rank || 0, sd3 = (r2 % 2 ? 1 : -1) * (1 + Math.floor(r2 / 2) * 1.0) * 2.6;
        rt.x = cx + Math.cos(h0) * sd3; rt.z = cz - Math.sin(h0) * sd3; rt.h = h0;
      }
    }
    var gy = C.heightAt(rt.x, rt.z);
    rt.y = v.kind === 'sea' ? SEA_Y + 0.05 * Math.sin(now() * 900 + v.id) : v.kind === 'air' ? gy + 7.5 + 1.2 * Math.sin(now() * 300 + v.id) : gy;
    rt.gy = gy;
  }
  A.pose = function (id) { var v = vehById(id), rt = VR[id]; return v && rt ? { x: rt.x, z: rt.z, y: rt.y, h: rt.h, st: v.st, kind: v.kind, v: v.v } : null; };
  function placeRider(v, rt, g) {
    var k = v.kind, seat = g.sfs || 0, lx, lz, sy;
    if (k === 'land') { lx = (seat & 1 ? 1 : -1) * 0.58; lz = -1.1 + (seat >> 1) * 0.78; sy = 0.55; }
    else if (k === 'sea') { lx = (seat & 1 ? 1 : -1) * 0.62; lz = -1.9 + (seat >> 1) * 0.82; sy = 0.35; }
    else { var an = seat / SD.capacity.air * TAU; lx = Math.cos(an) * 0.85; lz = Math.sin(an) * 0.85; sy = 0.9; }
    var ch = Math.cos(rt.h), sh = Math.sin(rt.h);
    g.x = rt.x + ch * lx + sh * lz; g.z = rt.z - sh * lx + ch * lz;
    g.y = rt.y + sy - C.heightAt(g.x, g.z); g.heading = rt.h + (lx > 0 ? PI / 2 : -PI / 2); g.hd = g.heading; g.speed = 0;
  }
  function pushAside(an, rt, dt, P, v) {   // the horn encourages the animal to move out of the lane
    var road = sample(P, v.s + 4.5, {}), rx = Math.cos(road.h), rz = -Math.sin(road.h);
    var offset = (an.x - road.x) * rx + (an.z - road.z) * rz;
    var side = rt.blkSide || (offset < 0 ? -1 : 1);
    for (var tries = 0; tries < 2; tries++, side = -side) {
      var nx = an.x + rx * side * 2.4 * dt, nz = an.z + rz * side * 2.4 * dt;
      if (v.kind === 'sea' && !isWater(C.tileOf(nx, nz))) continue;
      if (!X0.canGo(an, an.x, an.z, nx, nz)) continue;
      an.x = nx; an.z = nz; rt.blkSide = side;
      return;
    }
  }
  function shoo(an, P, v) {
    var rt = vrt(v), dx = an.x - rt.x, dz = an.z - rt.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    an.tx = an.x + dx / l * 7; an.tz = an.z + dz / l * 7; if (an.wild) { an.state = v.kind === 'sea' ? 'swim' : 'run'; an.fleeT = 2.5; } else { an.tg = 'wander'; an.state = v.kind === 'sea' ? 'swim' : 'walk'; }
  }
  function gateOccupied(P, key, excludeId) {
    var veh = ST().veh;
    for (var j = 0; j < P.gates.length; j++) {
      var og = P.gates[j]; if (og.key !== key) continue;
      for (var m = 0; m < veh.length; m++) {
        var ov = veh[m]; if (ov.id === excludeId || ov.route !== P.id || ov.st === 'idle' || ov.st === 'board') continue;
        if (Math.abs(ov.s - og.sg) < 3.6) return true;
      }
    }
    return false;
  }
  // gate logic for a vehicle: returns {lim (route position the vehicle may not pass), why, stuck}
  function gateLimit(v, P, trafficLimit) {
    var out = { lim: Infinity, why: '', stuck: false };
    for (var k = 0; k < P.gates.length; k++) {
      var g = P.gates[k], key = g.key; if (key === 'v') continue;
      var gs = GS[key]; if (!gs) { if (key.charAt(0) === 'p') gs = GS[key] = { out: 0, 'in': 0, owner: 0, phase: 0, manual: 0, t: 0 }; else continue; }
      var single = key.charAt(0) === 'p', hold = Math.max(0.1, g.sA - 2.2), d = hold - v.s;
      var clearS = g.sB + 1.2;
      // An out-and-back route uses the same controller for two distinct crossings.
      var ownsCrossing = gs.owner === v.id && gs.crossing === g.sg;
      if (gs.owner === v.id && !ownsCrossing && (g.sg < gs.crossing || gs.phase !== 6)) continue;
      if (!ownsCrossing && (d > 16 || v.s >= g.sB)) continue;
      var pw = single ? portalCanOpen(objById(+key.slice(1)) || {}, gs) : gatePowered(X.gates[key]);
      if (!ownsCrossing) {
        if (!gs.owner && pw && d < 12 && trafficLimit >= clearS && !gateOccupied(P, key, v.id)) {
          gs.owner = v.id;
          gs.crossing = g.sg;
          gs.first = single ? 'out' : (g.ent ? 'out' : 'in');
          gs.phase = v.s >= g.sg ? (single ? 2 : 4) : 1;
        }
        else {
          if (hold < out.lim) { out.lim = hold; out.why = pw ? 'Waiting for the airlock' : 'Gates locked: no power'; out.stuck = !pw; }
          continue;
        }
      }
      // we own this gate
      var ph = gs.phase, first = gs.first || 'out', second = first === 'out' ? 'in' : 'out', lim, why = '', stk = false;
      if (single) {
        lim = ph <= 1 ? hold : Infinity; if (ph <= 1) { why = pw ? 'Opening the barrier' : 'Barrier locked: no power'; stk = !pw; } else if (v.s >= g.sg + 1.8) { gs.phase = 6; }
        if (ph >= 2 && gs.out < 0.9 && v.s < g.sg + 1) { lim = hold; why = 'Barrier locked: no power'; stk = !pw; }
      } else {
        if (ph <= 1) { lim = hold; why = pw ? 'Waiting for the airlock' : 'Gates locked: no power'; stk = !pw; }
        else if (ph === 2) { lim = gs[first] >= 0.9 ? g.sg : hold; if (gs[first] < 0.9) { why = 'Gates locked: no power'; stk = !pw; } if (g.sg - v.s <= 0.25 && v.v < 0.35) gs.phase = 3; }
        else if (ph === 3 || ph === 4) { lim = g.sg; why = 'Airlock cycling'; }
        else if (ph === 5) { lim = gs[second] >= 0.9 ? Infinity : g.sg; if (gs[second] < 0.9) { why = pw ? 'Airlock cycling' : 'Gates locked: no power'; stk = !pw; } if (v.s >= clearS) gs.phase = 6; }
        else { lim = Infinity; }
        if (ph >= 1 && ph <= 5 && !pw) { why = 'Gates locked: no power'; stk = true; if (lim === Infinity) lim = g.sg; }
      }
      if (lim < out.lim) { out.lim = lim; out.why = why; out.stuck = stk; }
    }
    return out;
  }

  // ------------------------------------------------------------------ guests: queueing, boarding, riding, alighting
  function frontTiles(o) { return C.frontPathTiles(o); }
  function guestById(id) { return RT().gById.get(id); }
  function fareOf(o) { return o.mfree ? 0 : (o.fare === undefined ? SD.fare : o.fare); }
  A.fareOf = fareOf;
  function depotConnected(o) {
    var fr = frontTiles(o);
    if (C.isParkConnected) { for (var k = 0; k < fr.length; k++) if (C.isParkConnected(fr[k])) return true; return false; }
    var f = C.getField('exit'); if (!f) return false;
    for (var k2 = 0; k2 < fr.length; k2++) if (f[fr[k2]] < INF) return true;
    return false;
  }
  function routesOfDepot(o) { return Object.keys(X.routes).map(function (k) { return X.routes[k]; }).filter(function (P) { return P.depot && P.depot.id === o.id && P.ok; }); }
  function serving(o) { var P = routesOfDepot(o)[0]; return P && ST().veh.some(function (v) { return v.route === P.id; }) && routeGo(P); }
  A.queueLimit = function (g) { var o = RT().oById.get(g.gid); return o && (BD()[o.type] || {}).safari ? 110 : 0; };
  A.arrive = function (g, o) {
    var q = RT().bq[o.id] || (RT().bq[o.id] = { use: 0, q: [] });
    if (!serving(o) || ST().lockdown) { g.gt = ''; g.dk = ''; return; }
    if (q.q.length >= 32) { g.gt = ''; g.dk = ''; C.say(g, 'crowded'); g.mood -= 1; return; }
    g.state = 'queue'; g.wt = 0; q.q.push(g.id); g.speed = 0; C.gxPlace(g, false);
    var c = C.objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
    if (q.q.length > 8 && rng.chance(0.2)) C.say(g, 'safariQueue');
  };
  A.choose = function (g) {
    var o = ST(); if (!o || !o.veh.length || g.state !== 'walk' || o.lockdown) return false;
    // Own safari cooldown (g.sfCd) so Monorail shortcuts/rides never lock guests out of the Safari!
    if (g.sfCd && now() < g.sfCd) return false;
    if (!C.openNow() || g.stay < C.gxHr() * 0.9) return false;
    var best = null, bs = 1e9, bestExc = 0, WX = C.WX();
    S().objects.forEach(function (ob) {
      var d = BD()[ob.type]; if (!d || !d.safari) return;
      var fare = fareOf(ob);
      if (fare > 0 && (fare > g.money * 0.75 || fare > SD.fareRef * g.tol * clamp(WX.spend, 0.5, 1.6) * 1.45)) return;
      if (!serving(ob) || !depotConnected(ob)) return;
      var f = C.getField('b' + ob.id); if (!f || !(f[g.ti] < INF) || f[g.ti] > 160) return;
      var q = RT().bq[ob.id];
      var P = routesOfDepot(ob)[0]; if (!P) return;
      var exc = P.excitement || 35;
      if (q && q.q.length > (exc >= 75 ? 28 : 22)) return;
      var qPen = q ? q.q.length * 1.2 : 0;
      var farePen = fare > 0 ? (fare / Math.max(1, SD.fareRef)) * 5 : -8;
      var sc = f[g.ti] * 0.8 + qPen + farePen + rng.next() * 10 - exc * 0.8 - (P.speciesCount || 0) * 6 - (g.seen && g.seen.__sf ? 0 : 22);
      if (sc < bs) { bs = sc; best = ob; bestExc = exc; }
    });
    if (!best) return false;
    // Safari is the star attraction of the park: guests go crazy for a great dinosaur-packed safari!
    var needPen = (g.hunger > 75 || g.thirst > 78 || g.bladder > 75 ? 0.14 : 0);
    var excBoost = clamp(bestExc / 100, 0.15, 1) * 0.40 + (bestExc >= 75 ? 0.10 : 0);
    var p = 0.36 + excBoost + (g.thrill ? 0.12 : 0.04) + (g.vip ? 0.10 : 0) - needPen;
    var repMul = g.sfr ? (bestExc >= 75 ? 0.55 : 0.40) : 1;
    if (rng.next() > clamp(p * repMul, 0.05, 0.94)) return false;
    g.gt = 'bld'; g.gid = best.id; g.dk = 'b' + best.id; g.ni = -1; g.wt = 0; g.gAge = 0; g.pk = 'ride'; g.sfCd = now() + 0.08; g.sfr = (g.sfr || 0) + 1;
    return true;
  };
  A._why = function (g) {   // diagnostics for tests: why does this guest not choose a ride?
    var out = [], o = ST(); if (!o.veh.length) out.push('no vehicles'); if (g.state !== 'walk') out.push('state ' + g.state); if (!C.openNow()) out.push('closed'); if (g.stay < C.gxHr() * 0.9) out.push('stay ' + g.stay + ' < ' + C.gxHr() * 0.9);
    S().objects.forEach(function (ob) { var d = BD()[ob.type]; if (!d || !d.safari) return; var f = C.getField('b' + ob.id); out.push('depot ' + ob.id + ' serving ' + serving(ob) + ' conn ' + depotConnected(ob) + ' field ' + (f ? f[g.ti] : 'none') + ' fare ' + fareOf(ob) + ' money ' + g.money + ' tol ' + g.tol); });
    return out;
  };
  function pendingFor(P) { return pendingQ(P); }
  function boardOne(v, P) {
    var rt = vrt(v), o = P.depot, q = RT().bq[o.id]; if (!q || !q.q.length || rt.pax.length >= SD.capacity[v.kind]) return false;
    for (var k = 0; k < q.q.length; k++) {
      var g = guestById(q.q[k]);
      if (!g || g.state !== 'queue') { q.q.splice(k, 1); k--; continue; }
      var fare = fareOf(o), WX = C.WX();
      q.q.splice(k, 1);
      if (fare > 0 && (fare > g.money * 0.88 || fare > SD.fareRef * g.tol * clamp(WX.spend, 0.5, 1.6) * 1.55)) { g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1; g.mood -= 1.5; g.sfCd = now() + 0.12; C.say(g, 'expensive'); return true; }
      if (fare > 0) { g.money -= fare; g.spent = (g.spent || 0) + fare; C.earn(fare, 'shops', g.x, g.z); o.minc = (o.minc || 0) + fare; ST().stats.income += fare; }
      o.mrides = (o.mrides || 0) + 1; o.mtoday = (o.mtoday || 0) + 1;
      var used = {}, z, seat = 0; for (z = 0; z < rt.pax.length; z++) used[rt.pax[z].sfs] = 1; while (used[seat]) seat++;
      g.state = 'ride'; g.sfv = v.id; g.sfs = seat; g.speed = 0; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1; g.wt = 0; g.sft = now(); g.sfn = 0; g.sfd = {}; g.sfw = {};
      g.mood += 3; C.say(g, 'safari'); rt.pax.push(g);
      var stt = ST().stats; stt.riders++; if (v.kind === 'sea') stt.sea++; else if (v.kind === 'air') stt.air++;
      placeRider(v, rt, g);
      return true;
    }
    return false;
  }
  function alightOne(v, P) {
    var rt = vrt(v); if (!rt.pax.length) return false;
    var g = rt.pax.shift(); stepOff(g, P.depot); return true;
  }
  function stepOff(g, o) {
    var fr = frontTiles(o), t = fr.length ? fr[Math.floor(rng.next() * fr.length)] : -1;
    if (t < 0) { var fp = C.objFootprint(o), s = S(); outer: for (var r = 1; r <= 6; r++) for (var dj = -r; dj <= fp.h + r; dj++) for (var di = -r; di <= fp.w + r; di++) { var x = fp.i0 + di, y = fp.j0 + dj; if (x >= 0 && y >= 0 && x < N && y < N && s.path[x + y * N]) { t = x + y * N; break outer; } } }
    if (t < 0) { C.removeGuest(g); return; }
    g.x = tcx(t) + rng.range(-0.5, 0.5); g.z = tcz(t) + rng.range(-0.5, 0.5); g.y = 0; g.ti = t; g.ni = -1; g.state = 'walk'; g.glide = 0; g.speed = 0; g.gt = ''; g.dk = ''; g.gAge = 0; g.idle = 0; g.pv = 0;
    g.heading = rng.range(-PI, PI);
    var sawAny = (g.sfn || 0) > 0;
    g.mood += sawAny ? 8 : 3;
    g.happiness = Math.min(100, g.happiness + (sawAny ? 9 : 2));
    g.sfCd = now() + 0.14; g.sfv = 0; g.sfd = null; g.sfw = null;
    g.seen.__sf = 1;
    var rideSat = clamp(g.happiness * 0.45 + (g.fun || 50) * 0.4 + Math.min(20, (g.sfn || 0) * 6), 0, 100);
    o.msat = o.msat === undefined ? rideSat : o.msat + (rideSat - o.msat) * 0.2;
    if (rng.chance(0.55) && !g.thoughtT) C.say(g, 'safari');
  }
  function ejectAll(v, quiet) {
    var rt = VR[v.id]; if (!rt) return; var pax = rt.pax.slice(); rt.pax.length = 0;
    var P = X.routes[v.route], dep = P && P.depot || (function () { var r = ST().routes.filter(function (q) { return q.id === v.route; })[0]; return r && objById(r.depot); })();
    pax.forEach(function (g) { if (dep) stepOff(g, dep); else C.removeGuest(g); });
  }
  A.release = function (g) {
    var v = vehById(g.sfv), rt = v && VR[v.id]; if (rt) { var k = rt.pax.indexOf(g); if (k >= 0) rt.pax.splice(k, 1); }
    g.y = 0; g.sfv = 0;
  };
  function viewScan(v, rt) {
    var out = rt.ov, k, n = 0; out.length = 0;
    var R = SD.viewR, an, sp, d, s = S();
    for (k = 0; k < s.animals.length; k++) {
      an = s.animals[k]; d = dist(an.x, an.z, rt.x, rt.z); if (d > R) continue;
      sp = SP()[an.species]; var rl = sp.realm || 'land';
      if (v.kind === 'land' && rl !== 'land') { if (!(rl === 'air' && d < 7)) continue; }
      if (v.kind === 'sea' && rl === 'air' && an.y < 1) continue;
      out.push({ e: an, d: d, sp: an.species, danger: C.aDanger(an), pred: !!sp.predator, wild: false });
    }
    for (k = 0; k < W.list.length; k++) { var w = W.list[k]; d = dist(w.x, w.z, rt.x, rt.z); if (d > R) continue; out.push({ e: w, d: d, sp: w.species, danger: 0, pred: false, wild: true }); }
    out.sort(function (a, b) { return a.d - b.d; }); if (out.length > 14) out.length = 14;
  }
  A.rideTick = function (g, a) {
    var v = vehById(g.sfv), rt = v && VR[v.id];
    if (!v || !rt || rt.pax.indexOf(g) < 0) { var dep = nearestDepot(g); if (dep) stepOff(g, dep); else C.removeGuest(g); return; }
    var st = ST().stats, list = rt.ov, closeR = SD.closeR, nsp = 0, seenHere = {}, danger = 0, dsp = '', k;
    g.energy = Math.min(100, g.energy + 0.55 * a); g.mood += 0.35 * a; g.happiness = Math.min(100, g.happiness + 1.15 * a);
    if (v.st === 'stuck' || v.st === 'broken') { g.mood -= 0.9 * a; if (rng.chance(0.12)) C.say(g, 'safariStuck', list.length ? list[0].sp : undefined); }
    for (k = 0; k < list.length; k++) {
      var it = list[k]; if (!seenHere[it.sp]) { seenHere[it.sp] = 1; nsp++; }
      // Credit enclosure sighting (g.seenEnc / g.nSeen) just like Monorail so safari boosts guest happiness target & stay!
      if (!it.wild && it.e && it.e.enc && g.seenEnc && !g.seenEnc[it.e.enc]) { g.seenEnc[it.e.enc] = 1; g.nSeen = (g.nSeen || 0) + 1; }
      if (!g.seen[it.sp]) { g.seen[it.sp] = 1; g.nsp = (g.nsp || 0) + 1; g.sfn = (g.sfn || 0) + 1; g.mood += 4.5; }
      if (it.d < closeR && it.danger >= 2 && it.danger > danger) { danger = it.danger; dsp = it.sp; }
      if (it.wild && !g.sfw[it.e.id]) { g.sfw[it.e.id] = 1; g.sfn = (g.sfn || 0) + 1; st.wildSeen++; if (rng.chance(0.5)) C.say(g, 'safariWild', it.sp); }
    }
    var q = nsp ? clamp(0.6 + 0.25 * nsp + (danger >= 2 ? 0.65 : 0), 0, 2.8) : 0.16;
    var crowdedItem = list.find(function (it) { return !it.wild && it.e.enc && C.enclosureCrowded(it.e.enc); });
    if (crowdedItem) { q *= 0.65; g.mood -= 0.8 * a; C.say(g, 'enclosureCrowded', crowdedItem.sp); }
    var P = v && X.routes[v.route], excMul = P && P.excitement >= 75 ? 1.25 : 1.0;
    g.fun = Math.min(100, g.fun + 9 * a * q * excMul); g.mood += 2.4 * a * q * excMul;
    if (danger >= 2) {
      var okA = !(v.st === 'stuck' && rt.stuckT > 30); g.mood += (okA ? 1.8 : -0.5) * danger * a;
      var key = dsp; if (!g.sfd[key] && rng.chance(0.28 * a + 0.05)) { g.sfd[key] = 1; C.say(g, 'safariDanger', dsp); st.close++; }
    } else {
      for (k = 0; k < list.length; k++) { var it2 = list[k]; if (it2.d < closeR && !it2.pred && it2.danger <= 1 && !g.sfd['f' + it2.sp] && rng.chance(0.08 * a)) { g.sfd['f' + it2.sp] = 1; g.mood += 5; C.say(g, 'safariFeed', it2.sp); st.fed++; if (g.money > 1) { var amt = Math.min(g.money, 2 + Math.floor(rng.next() * 4)); g.money -= amt; C.earn(amt, 'donations', g.x, g.z); S().stats.donations += amt; } break; } }
      if (!list.length && rng.chance(0.01)) C.say(g, 'safari');
    }
    if (g.stay <= 0) g.stay = 0;
  };
  function nearestDepot(g) {
    var best = null, bd = 1e18;
    S().objects.forEach(function (o) {
      var d = BD()[o.type]; if (!d || !d.safari) return;
      var c = C.objCentre(o), dd = (c.x - g.x) * (c.x - g.x) + (c.z - g.z) * (c.z - g.z);
      if (dd < bd) { bd = dd; best = o; }
    });
    return best;
  }
  // Park rating, fun service, and guest arrival hooks (called from 20-sim.js)
  A.funCount = function () {
    var o = ST(); if (!o || o.lockdown) return 0;
    var sum = 0;
    o.routes.forEach(function (r) {
      var P = X.routes[r.id]; if (!P || !P.ok || !P.depot || !serving(P.depot)) return;
      sum += 1.2 + clamp((P.excitement || 30) / 50, 0.3, 1.8);
    });
    return sum;
  };
  A.arrivalBonus = function () {
    var o = ST(); if (!o || o.lockdown) return 0;
    var sum = 0;
    o.routes.forEach(function (r) {
      var P = X.routes[r.id]; if (!P || !P.ok || !P.depot || !serving(P.depot)) return;
      sum += 14 + (P.excitement || 0) * 0.42 + Math.min(16, (P.speciesCount || 0) * 4);
    });
    return sum;
  };
  A.ratingBonus = function () {
    var o = ST(); if (!o || o.lockdown) return 0;
    var best = 0;
    o.routes.forEach(function (r) {
      var P = X.routes[r.id]; if (!P || !P.ok || !P.depot || !serving(P.depot)) return;
      var rides = (P.depot.mrides || 0) + (P.depot.mtoday || 0);
      if (rides < 1) return;
      var score = Math.min(0.45, 0.15 + (P.excitement || 0) * 0.0025 + Math.min(0.12, rides * 0.004));
      if (score > best) best = score;
    });
    return best;
  };

  // ------------------------------------------------------------------ nudges, strandings, injuries
  function nudgeCheck(rt) {
    if (rt.nudged || !rt.pax.length || !rt.ov.length) return;
    for (var k = 0; k < rt.ov.length; k++) {
      var it = rt.ov[k]; if (it.wild || it.danger < 2 || it.d > 4.2) continue;
      if (rng.next() < SD.nudgeChance * 60 * 0.5) {
        rt.nudged = true;
        rt.nudgeT = rng.range(2.5, 4.5); rt.nudgeSp = it.sp; ST().stats.nudges++;
        rt.pax.forEach(function (g) { g.mood += 4; if (rng.chance(0.6)) C.say(g, 'safariDanger', it.sp); });
        if (Z.News && rng.chance(0.3)) { var s2 = Z.News.post({ kind: 'safari_nudge', severity: 1, data: { species: it.sp } }); if (s2) Z.News.addEffect('thrill', 1.05, 3, 'Viral safari clip', true); }
        return;
      }
    }
  }
  function strand(v, rt) {
    rt.stranded = true; ST().stats.stranded++;
    var n = rt.pax.length; if (!n) return;
    C.msg('The ' + vName(v) + ' is stranded with ' + n + ' guest' + (n > 1 ? 's' : '') + ' aboard: ' + (v.why || 'stuck') + '. Send rangers or restore the power.', 'bad');
    bus.emit('safariStranded', { vehicle: v, n: n });
    if (Z.News && n >= 3) Z.News.post({ kind: 'safari_stuck', severity: n >= 6 ? 3 : 2, data: { n: n }, force: false });
  }
  function rangersN() { return Math.min(3, X.rangers.length); }
  function stuckTick(v, P, rt, dt) {
    if (!rt.pax.length) { rt.rescueT += dt; if (rt.rescueT > 60) manualCycle(v, P); return; }
    rt.rescueT += dt;
    var limit = rangersN() ? 55 : 190; if (rt.manualCall) limit = 22;
    if (rt.rescueT > limit) { manualCycle(v, P); rt.rescueT = 0; rt.manualCall = false; return; }
    // the real danger: a big animal near a vehicle that is stuck in a zone that has lost its barrier
    if (rt.stuckT > 40) {
      var enc = zoneAt(rt.x, rt.z), bad = enc && (!zonePowered(enc) || (Z.Realms && enc.kind && !Z.Realms.containmentStatus(enc.id).ok));
      for (var k = 0; k < rt.ov.length; k++) {
        var it = rt.ov[k]; if (it.wild || it.danger < 2 || it.d > 7) continue;
        if (rng.next() < SD.injuryChance * dt * (bad ? 5 : 1) * (1 + it.danger * 0.4) && rt.pax.length) {
          var g = rt.pax[Math.floor(rng.next() * rt.pax.length)]; ST().stats.injuries++; X0.hurtGuest(g, it.e); return;
        }
      }
    }
  }
  function zoneAt(x, z) { var t = C.tileOf(x, z), id = S().tileEnc[t]; return id ? RT().eMap[id] : null; }
  function manualCycle(v, P) {
    // rangers open the lock by hand for this vehicle (and break ownership cycles if another stuck vehicle holds the gate)
    for (var k = 0; k < P.gates.length; k++) { var g = P.gates[k], gs = GS[g.key]; if (gs && gs.owner === v.id) gs.manual = 1; }
    for (k = 0; k < P.gates.length; k++) {
      g = P.gates[k]; gs = GS[g.key];
      if (!gs || Math.abs(sd(v.s, g.sA, P.len)) >= 20) continue;
      if (gs.owner === 0) gs.manual = 1;
      else if (gs.owner !== v.id) {
        var ov = vehById(gs.owner);
        if (!ov || ov.st === 'idle' || ov.st === 'board' || Math.abs(ov.s - gs.crossing) > 3.6) { gs.phase = 6; gs.manual = 1; }
      }
    }
    v.why = ''; ST().stats.rescued = (ST().stats.rescued || 0) + 1;
  }
  A.callRescue = function (vid) { var v = vehById(vid), rt = v && VR[v.id]; if (!v) return fail('No such vehicle'); if (v.st !== 'stuck' && v.st !== 'wait') return fail('That vehicle is not stuck'); if (S().money < 150) return fail('Not enough money'); C.spend(150, 'other'); rt.manualCall = true; rt.rescueT = Math.max(rt.rescueT, 1); return okr(150); };
  A.callEngineer = function (vid) { var v = vehById(vid); if (!v || v.st !== 'broken') return fail('That vehicle is not broken down'); if (S().money < 160) return fail('Not enough money'); C.spend(160, 'other'); v.brk = Math.min(v.brk, 9); return okr(160); };

  // ------------------------------------------------------------------ building routes and vehicles
  function adjPath(fp) {
    var s = S();
    for (var a = -1; a <= fp.w; a++) for (var b = -1; b <= fp.h; b++) {
      if ((a >= 0 && a < fp.w) && (b >= 0 && b < fp.h)) continue;
      var x = fp.i0 + a, y = fp.j0 + b; if (x < 0 || y < 0 || x >= N || y >= N) continue;
      if (s.path[x + y * N] && ((a < 0 || a >= fp.w) !== (b < 0 || b >= fp.h))) return true;
    }
    return false;
  }
  A.placeCheck = function (type, fp) {
    var d = BD()[type]; if (!d || !d.safari) return null;
    if (d.safari === 'sea') {
      var near = false; for (var a = -2; a <= fp.w + 1 && !near; a++) for (var b = -2; b <= fp.h + 1; b++) { var x = fp.i0 + a, y = fp.j0 + b; if (x >= 0 && y >= 0 && x < N && y < N && isWater(x + y * N)) { near = true; break; } }
      if (!near) return { msg: 'The harbour must be on the shore, within two tiles of open water' };
    }
    return null;
  };
  function dedupe(tiles) { var out = []; for (var k = 0; k < tiles.length; k++) { if (out.length && out[out.length - 1] === tiles[k]) continue; out.push(tiles[k]); } return out; }
  function routeCostOf(kind, n) { return Math.round(n * (kind === 'sea' ? SD.waterTrackCost : kind === 'air' ? (SD.airTrackCost || 3) : SD.trackCost)); }
  function orthoBridge(a, b) {
    var out = [], ai = ti(a), aj = tj(a), bi = ti(b), bj = tj(b);
    while (ai !== bi) { ai += Math.sign(bi - ai); out.push(ai + aj * N); }
    while (aj !== bj) { aj += Math.sign(bj - aj); out.push(ai + aj * N); }
    return out;
  }
  A.routeOfDepot = function (depotId) { var r = ST().routes.filter(function (q) { return q.depot === depotId; })[0]; return r || null; };
  A.setRouteMode = function (depotId, mode) {
    if (mode !== 'loop' && mode !== 'outback') return fail('Invalid route mode');
    var o = objById(depotId), r = A.routeOfDepot(depotId);
    if (!o) return fail('No depot');
    o.sfMode = mode;
    if (r) { r.mode = mode; A.update(); }
    else bus.emit('safari');
    return okr(0);
  };
  A.routeModeOf = function (depotId) {
    var r = A.routeOfDepot(depotId), o = objById(depotId);
    if (r && (r.mode === 'loop' || r.mode === 'outback')) return r.mode;
    if (o && (o.sfMode === 'loop' || o.sfMode === 'outback')) return o.sfMode;
    if (r) { var P = X.routes[r.id]; if (P && P.loop) return 'loop'; }
    return 'outback';
  };
  A.planRoute = function (depotId, tiles, opts) {
    var o = objById(depotId), d = o && defOf(o), r = { ok: false, cost: 0, n: 0, msg: '', ghost: { tiles: [], bad: {} } };
    if (!d || !d.safari) { r.msg = 'Pick a depot, harbour or pad first'; return r; }
    tiles = dedupe(tiles || []); r.ghost.tiles = tiles;
    if (tiles.length < 2) { r.msg = 'Drag from the rear bay of the ' + (d.safari === 'sea' ? 'harbour' : d.safari === 'air' ? 'pad' : 'depot'); return r; }
    var mode = (opts && opts.mode) || (o.sfMode || null);
    var chk = checkTiles(d.safari, tiles, o, { mode: mode });
    r.n = tiles.length; r.cost = routeCostOf(d.safari, tiles.length);
    var old = A.routeOfDepot(depotId); if (old) r.cost -= Math.round(routeCostOf(old.kind, old.tiles.length) * SD.refund);
    if (chk.why) { r.msg = chk.why; r.partial = !chk.hardErr; return r; }
    if (S().money < r.cost) { r.msg = 'Not enough money'; return r; }
    r.ok = true; r.loop = chk.loop; r.mode = mode || (chk.loop ? 'loop' : 'outback'); r.inside = chk.inside;
    return r;
  };
  A.buildRoute = function (depotId, tiles, opts) {
    var dry = !!(opts && opts.dry), r = A.planRoute(depotId, tiles, opts);
    if (!r.ok) return r; if (dry) return r;
    var o = ST(), dep = objById(depotId), kind = defOf(dep).safari, old = A.routeOfDepot(depotId), oldTiles = old ? old.tiles.slice() : null, oldMode = old ? old.mode : null, oldId = old ? old.id : 0;
    if (old) o.routes.splice(o.routes.indexOf(old), 1);
    var mode = (opts && opts.mode) || dep.sfMode || (r.loop ? 'loop' : 'outback');
    var rt = { id: oldId || o.nextRoute++, kind: kind, mode: mode, depot: depotId, tiles: dedupe(tiles) }; o.routes.push(rt);
    C.spend(Math.max(0, r.cost), 'construction'); if (r.cost < 0) C.earn(-r.cost, 'construction');
    C.jBegin('Safari route');
    C.jOp({ k: 'x', net: r.cost, chk: function () { return null; }, ap: function () { var q = ST(); q.routes = q.routes.filter(function (z) { return z.id !== rt.id; }); if (oldTiles) q.routes.push({ id: rt.id, kind: kind, mode: oldMode, depot: depotId, tiles: oldTiles }); A.update(); } });
    C.jEnd();
    A.update();
    return r;
  };
  // Piece-by-piece route builder: merges a new drag segment onto the depot's existing route (or starts one snapped to the rear bay)
  A.planSegment = function (depotId, segTiles, opts) {
    var o = objById(depotId), d = o && defOf(o), res = { ok: false, complete: false, partial: false, cost: 0, n: 0, msg: '', mode: 'outback', loop: false, mergedTiles: [], newTiles: [], ghost: { tiles: [], bad: {} } };
    if (!d || !d.safari) { res.msg = 'Pick a depot, harbour or pad first'; return res; }
    var kind = d.safari, seg = dedupe(segTiles || []);
    if (!seg.length) { res.msg = 'Drag from the rear bay or end of the track'; return res; }
    var old = A.routeOfDepot(depotId), mode = (opts && opts.mode) || A.routeModeOf(depotId);
    res.mode = mode;
    var merged = null, de = depotEnds(o);
    if (!old || !old.tiles || !old.tiles.length) {
      // Starting a brand-new route: snap to rear bay if user starts on/near depot
      var first = seg[0];
      if (de && de.backTiles.length) {
        var onBack = de.backTiles.indexOf(first) >= 0;
        var inDepot = S().tileObj[first] === o.id;
        if (!onBack) {
          // Pick closest rear-bay tile to seg[0] (or backCenter)
          var bestB = de.backCenter >= 0 ? de.backCenter : de.backTiles[0], bd = 1e9;
          de.backTiles.forEach(function (bt) { var dd = dist(tcx(bt), tcz(bt), tcx(first), tcz(first)); if (dd < bd) { bd = dd; bestB = bt; } });
          if (inDepot) {
            // Strip any leading tiles inside the depot and anchor cleanly at the rear bay
            var k0 = 0; while (k0 < seg.length && S().tileObj[seg[k0]] === o.id) k0++;
            var rest = seg.slice(k0);
            if (!rest.length) merged = [bestB];
            else if (rest[0] === bestB) merged = rest;
            else if (adjacent(bestB, rest[0])) merged = [bestB].concat(rest);
            else merged = [bestB].concat(orthoBridge(bestB, rest[0])).concat(rest.slice(1));
          } else if (Math.abs(ti(first) - ti(bestB)) + Math.abs(tj(first) - tj(bestB)) <= 2) {
            merged = [bestB].concat(orthoBridge(bestB, first)).concat(seg.slice(1));
          } else {
            merged = seg.slice();
          }
        } else merged = seg.slice();
      } else merged = seg.slice();
    } else {
      var base = old.tiles.slice(), tail = base[base.length - 1];
      // Check if drag starts at or adjacent to the current tail (extending!)
      var atIdx = base.indexOf(seg[0]);
      if (seg[0] === tail) {
        merged = base.concat(seg.slice(1));
      } else if (adjacent(tail, seg[0])) {
        merged = base.concat(seg);
      } else if (atIdx >= 0) {
        // Branch/re-route cleanly from an existing tile along the track
        merged = base.slice(0, atIdx + 1).concat(seg.slice(1));
      } else if (Math.abs(ti(tail) - ti(seg[0])) + Math.abs(tj(tail) - tj(seg[0])) <= 2) {
        // Close to tail: smoothly bridge 1-2 tiles from tail
        merged = base.concat(orthoBridge(tail, seg[0])).concat(seg.slice(1));
      } else {
        res.msg = 'Start dragging from the end of the track (or any existing track tile) to extend it';
        res.ghost.tiles = seg;
        return res;
      }
      // If dragging back onto tiles[0] to close a Round Trip loop, stop on the tile just before tiles[0] (so it's adjacent to tiles[0] without self-crossing!)
      if (merged.length >= 7 && merged[merged.length - 1] === merged[0]) {
        merged.pop();
        if (mode !== 'outback') mode = 'loop';
      }
      // Trim any accidental overlap with existing tiles except closing onto rear bay
      var seen = {}, clean = [];
      for (var k = 0; k < merged.length; k++) {
        var t = merged[k];
        if (seen[t]) {
          // If closing back onto tile 0 with >= 6 tiles, stop before tile 0 to form a clean loop
          if (t === clean[0] && clean.length >= 6) break;
          // Otherwise reject self-crossing
          res.msg = 'The route crosses itself'; res.ghost.tiles = merged.slice(0, k + 1); return res;
        }
        seen[t] = 1; clean.push(t);
      }
      merged = clean;
    }
    merged = dedupe(merged);
    // Validate with partial=true so players can build bit by bit!
    var chkP = checkTiles(kind, merged, o, { partial: true, mode: mode });
    var chkFull = checkTiles(kind, merged, o, { partial: false, mode: mode });
    res.mergedTiles = merged;
    var oldSet = {}; if (old) old.tiles.forEach(function (t) { oldSet[t] = 1; });
    var newTiles = merged.filter(function (t) { return !oldSet[t]; });
    var removedCount = old ? old.tiles.filter(function (t) { return merged.indexOf(t) < 0; }).length : 0;
    res.newTiles = newTiles;
    res.n = newTiles.length || merged.length;
    res.cost = routeCostOf(kind, newTiles.length) - Math.round(routeCostOf(kind, removedCount) * SD.refund);
    res.ghost.tiles = newTiles.length ? newTiles : merged;
    if (chkP.why) {
      res.msg = chkP.why;
      res.ok = false;
      res.partial = false;
      return res;
    }
    if (S().money < res.cost) { res.msg = 'Not enough money'; return res; }
    res.ok = true;
    res.complete = !chkFull.why;
    res.partial = !res.complete;
    res.loop = chkFull.loop;
    res.inside = chkFull.inside;
    res.msg = res.complete ? '' : (chkFull.why || chkP.partialWhy || 'Keep extending the route');
    return res;
  };
  A.addSegment = function (depotId, segTiles, opts) {
    var dry = !!(opts && opts.dry), r = A.planSegment(depotId, segTiles, opts);
    if (!r.ok) return r; if (dry) return r;
    var o = ST(), dep = objById(depotId), kind = defOf(dep).safari, old = A.routeOfDepot(depotId);
    var oldTiles = old ? old.tiles.slice() : null, oldMode = old ? old.mode : null, oldId = old ? old.id : 0;
    var mode = (opts && opts.mode) || r.mode || A.routeModeOf(depotId);
    dep.sfMode = mode;
    if (old) o.routes.splice(o.routes.indexOf(old), 1);
    var rt = { id: oldId || o.nextRoute++, kind: kind, mode: mode, depot: depotId, tiles: r.mergedTiles.slice() };
    o.routes.push(rt);
    if (r.cost > 0) C.spend(r.cost, 'construction'); else if (r.cost < 0) C.earn(-r.cost, 'construction');
    C.jBegin('Safari track');
    C.jOp({ k: 'x', net: r.cost, chk: function () { return null; }, ap: function () {
      var q = ST(); q.routes = q.routes.filter(function (z) { return z.id !== rt.id; });
      if (oldTiles) q.routes.push({ id: rt.id, kind: kind, mode: oldMode, depot: depotId, tiles: oldTiles });
      A.update();
    } });
    C.jEnd();
    A.update();
    return r;
  };
  // Piece-by-piece tile removal: trims the route from the earliest erased tile back to the end (or removes all if tile 0 is hit)
  A.planRemoveTiles = function (rmTiles) {
    var set = {}; (rmTiles || []).forEach(function (t) { set[t] = 1; });
    var hit = null, firstIdx = -1;
    ST().routes.forEach(function (r) {
      if (hit) return;
      for (var k = 0; k < r.tiles.length; k++) {
        if (set[r.tiles[k]]) { hit = r; firstIdx = k; break; }
      }
    });
    if (!hit) return { ok: false, cost: 0, n: 0, msg: 'No safari track here', depot: 0, removed: [], keep: [] };
    var removed = hit.tiles.slice(firstIdx), keep = hit.tiles.slice(0, firstIdx);
    var refund = Math.round(routeCostOf(hit.kind, removed.length) * SD.refund);
    return { ok: true, cost: -refund, n: removed.length, depot: hit.depot, routeId: hit.id, removed: removed, keep: keep, ghost: { tiles: removed } };
  };
  A.removeTiles = function (rmTiles, opts) {
    var plan = A.planRemoveTiles(rmTiles);
    if (!plan.ok) return fail(plan.msg);
    var o = ST(), r = A.routeOfDepot(plan.depot); if (!r) return fail('No route');
    var vehSnaps = !plan.keep.length ? o.veh.filter(function (v) { return v.route === r.id; }).map(function (v) { return { id: v.id, route: v.route, kind: v.kind, s: 0, v: 0, st: 'idle', dw: 0, brk: -1, why: '', paid: v.paid, rank: v.rank || 0 }; }) : [];
    var vehRef = vehSnaps.reduce(function (acc, v) { return acc + Math.round((v.paid || 0) * SD.refundVeh); }, 0);
    if (opts && opts.dry) return Object.assign({}, plan, { cost: plan.cost - vehRef });
    var oldTiles = r.tiles.slice(), oldMode = r.mode, rid = r.id, kind = r.kind, depId = r.depot;
    if (!plan.keep.length) {
      o.veh.filter(function (v) { return v.route === r.id; }).forEach(function (v) { ejectAll(v); delete VR[v.id]; });
      o.veh = o.veh.filter(function (v) { return v.route !== r.id; });
      o.routes.splice(o.routes.indexOf(r), 1);
    } else {
      r.tiles = plan.keep.slice();
    }
    var refund = -plan.cost + vehRef;
    if (refund > 0) C.earn(refund, 'construction');
    C.jBegin('Remove safari track');
    C.jOp({ k: 'x', net: -refund, chk: function () { return null; }, ap: function () {
      var q = ST(); q.routes = q.routes.filter(function (z) { return z.id !== rid; });
      q.routes.push({ id: rid, kind: kind, mode: oldMode, depot: depId, tiles: oldTiles });
      vehSnaps.forEach(function (sn) { if (!vehById(sn.id)) { q.veh.push(Object.assign({}, sn)); vrt(sn); } });
      A.update();
    } });
    C.jEnd();
    A.update();
    return Object.assign({}, plan, { cost: -refund });
  };
  A.removeRoute = function (depotId, opts) {
    var o = ST(), r = A.routeOfDepot(depotId); if (!r) return fail('No route to remove');
    var vehSnaps = o.veh.filter(function (v) { return v.route === r.id; }).map(function (v) { return { id: v.id, route: v.route, kind: v.kind, s: 0, v: 0, st: 'idle', dw: 0, brk: -1, why: '', paid: v.paid, rank: v.rank || 0 }; });
    var vehRef = vehSnaps.reduce(function (acc, v) { return acc + Math.round((v.paid || 0) * SD.refundVeh); }, 0);
    var refund = Math.round(routeCostOf(r.kind, r.tiles.length) * SD.refund) + vehRef;
    if (opts && opts.dry) return okr(-refund);
    var oldTiles = r.tiles.slice(), oldMode = r.mode, rid = r.id, kind = r.kind;
    o.veh.filter(function (v) { return v.route === r.id; }).forEach(function (v) { ejectAll(v); delete VR[v.id]; });
    o.veh = o.veh.filter(function (v) { return v.route !== r.id; });
    o.routes.splice(o.routes.indexOf(r), 1); C.earn(refund, 'construction');
    C.jBegin('Remove safari route');
    C.jOp({ k: 'x', net: -refund, chk: function () { return null; }, ap: function () {
      var q = ST(); q.routes = q.routes.filter(function (z) { return z.id !== rid; });
      q.routes.push({ id: rid, kind: kind, mode: oldMode, depot: depotId, tiles: oldTiles });
      vehSnaps.forEach(function (sn) { if (!vehById(sn.id)) { q.veh.push(Object.assign({}, sn)); vrt(sn); } });
      A.update();
    } });
    C.jEnd();
    A.update();
    return okr(-refund);
  };
  A.vehicleCost = function (kind) { return kind === 'sea' ? SD.boatCost : kind === 'air' ? SD.balloonCost : SD.truckCost; };
  A.buyVehicle = function (depotId, opts) {
    var o = ST(), r = A.routeOfDepot(depotId), dep = objById(depotId);
    if (!dep || !(defOf(dep) || {}).safari) return fail('No depot');
    var P = r && X.routes[r.id]; if (!P || !P.ok) return fail(r ? 'Fix the route first: ' + (P ? P.why : '') : 'Draw a route first');
    var n = o.veh.filter(function (v) { return v.route === r.id; }).length; if (n >= SD.maxVeh) return fail('A route takes up to ' + SD.maxVeh + ' vehicles');
    var cost = A.vehicleCost(r.kind); if (S().money < cost) return fail('Not enough money');
    if (opts && opts.dry) return okr(cost);
    var v = { id: o.nextVeh++, route: r.id, kind: r.kind, s: 0, v: 0, st: 'idle', dw: 0, brk: -1, why: '', paid: cost, rank: 0 };
    o.veh.push(v); C.spend(cost, 'construction'); vrt(v);
    C.jBegin('Buy safari vehicle'); C.jOp({ k: 'x', net: cost, chk: function () { return vehById(v.id) ? null : 'The vehicle is gone'; }, ap: function () { sellNow(v.id); } }); C.jEnd();
    fixVehicles(); bus.emit('safari');
    return okr(cost, { id: v.id });
  };
  function sellNow(id) { var o = ST(), v = vehById(id); if (!v) return false; ejectAll(v); o.veh.splice(o.veh.indexOf(v), 1); delete VR[id]; fixVehicles(); bus.emit('safari'); return true; }
  A.sellVehicle = function (id, opts) {
    var v = vehById(id); if (!v) return fail('No such vehicle');
    var refund = Math.round((v.paid || A.vehicleCost(v.kind)) * SD.refundVeh); if (opts && opts.dry) return okr(-refund);
    var snap = { id: v.id, route: v.route, kind: v.kind, s: 0, v: 0, st: 'idle', dw: 0, brk: -1, why: '', paid: v.paid, rank: v.rank || 0 };
    sellNow(id); C.earn(refund, 'construction');
    C.jBegin('Sell safari vehicle');
    C.jOp({ k: 'x', net: -refund, chk: function () { return null; }, ap: function () { var q = ST(); if (!vehById(snap.id)) { q.veh.push(snap); vrt(snap); fixVehicles(); bus.emit('safari'); } } });
    C.jEnd();
    return okr(-refund);
  };
  A.setFare = function (depotId, fare) { var o = objById(depotId); if (!o) return fail('No depot'); o.fare = clamp(Math.round((+fare || 0) * 2) / 2, 0, SD.fareMax); return okr(0); };
  A.setFree = function (depotId, on) { var o = objById(depotId); if (!o) return fail('No depot'); o.mfree = on ? 1 : 0; return okr(0); };
  A.vehiclesOf = function (depotId) { var r = A.routeOfDepot(depotId); return r ? ST().veh.filter(function (v) { return v.route === r.id; }) : []; };
  A.depotInfo = function (id) {
    var o = objById(id), d = o && defOf(o); if (!o || !d || !d.safari) return null;
    var r = A.routeOfDepot(id), P = r && X.routes[r.id], q = RT().bq[id], veh = A.vehiclesOf(id);
    if (P && P.ok) scoreRoute(P);
    var gates = P ? P.gates.filter(function (g, k, arr) { return arr.findIndex(function (z) { return z.key === g.key; }) === k; }) : [];
    return { id: id, name: d.name, kind: d.safari, mode: A.routeModeOf(id), fare: fareOf(o), free: !!o.mfree, queue: q ? q.q.length : 0, today: o.mtoday || 0, yesterday: o.mday || 0, rides: o.mrides || 0, income: Math.round(o.minc || 0), sat: o.msat === undefined ? null : Math.round(o.msat),
      route: r ? { id: r.id, ok: !!(P && P.ok), partial: !!(P && P.partial), mode: r.mode || (P && P.loop ? 'loop' : 'outback'), why: P ? P.why : '', length: P ? Math.round(P.len / TILE) : 0, tiles: r.tiles.length, loop: !!(P && P.loop), zones: P ? P.zones : [], gates: gates.length, powered: P ? routeGo(P) : true, excitement: P ? (P.excitement || 0) : 0, speciesCount: P ? (P.speciesCount || 0) : 0, animalCount: P ? (P.animalCount || 0) : 0 } : null,
      vehicles: veh.map(function (v) { var rt = VR[v.id] || {}; return { id: v.id, st: v.st, why: v.why, pax: rt.pax ? rt.pax.length : 0, cap: SD.capacity[v.kind], sell: Math.round((v.paid || 0) * SD.refundVeh), brk: Math.max(0, Math.round(v.brk)), kind: v.kind, stuck: rt.stuckT || 0 }; }),
      canBuy: !!(P && P.ok) && veh.length < SD.maxVeh, maxVeh: SD.maxVeh, cost: A.vehicleCost(d.safari), conn: depotConnected(o) };
  };

  // ------------------------------------------------------------------ lockdown
  A.setLockdown = function (on) {
    var o = ST(); on = !!on; if (!!o.lockdown === on) return okr(0);
    if (on) { if (S().money < SD.escape.lockdownCost) return fail('Not enough money'); C.spend(SD.escape.lockdownCost, 'other'); o.lockdown = 1; C.msg('LOCKDOWN: corridors shuttered, safari rides suspended, wildlife kept out.', 'info'); }
    else { o.lockdown = 0; C.msg('Lockdown lifted: safari rides and corridors resume.', 'good', false); }
    A.update(); return okr(on ? SD.escape.lockdownCost : 0);
  };

  // ------------------------------------------------------------------ wildlife visitors (a separate list: never in S.animals)
  var WSP = { land: [['deer', 0.4], ['boar', 0.2], ['goat', 0.15], ['rabbit', 0.25]], sea: [['seal', 0.35], ['dolphin', 0.15], ['fish_shoal', 0.5]], air: [['seagull', 0.6], ['heron', 0.4]] };
  var PROTECTED = { heron: 1, dolphin: 1, seal: 1 };
  function pickSp(realm) { var l = WSP[realm] || WSP.land, r = rng.next(), c = 0; for (var k = 0; k < l.length; k++) { c += l[k][1]; if (r <= c) return l[k][0]; } return l[0][0]; }
  function wildCount(realm) { var n = 0; for (var k = 0; k < W.list.length; k++) if (W.list[k].kind === realm) n++; return n; }
  function tileOK(w, x, z, allowOut) {
    var t = C.tileOf(x, z); if (x < 0 || z < 0 || x >= N * TILE || z >= N * TILE) return false;
    var s = S(), enc = s.tileEnc[t];
    if (enc && enc !== w.zone) return false;
    if (!enc && !allowOut) return false;
    if (w.kind === 'land') { if (isWater(t) || RT().block[t] || s.ditch[t] || C.cliffT(t)) return false; }
    else if (w.kind === 'sea') { if (!isWater(t)) return false; }
    return true;
  }
  function spawnWild(z, species) {
    var enc = z.enc, sp = SP()[species]; if (!sp) return null;
    var kind = z.realm, w = { id: W.seq++, species: species, kind: kind, zone: z.id, enc: 0, wild: true, x: 0, z: 0, y: 0, heading: rng.range(-PI, PI), speed: 0, state: 'idle', baby: false, sex: rng.chance(0.5) ? 'm' : 'f', traits: [], name: 'Wild ' + C.lc(sp.name),
      st: rng.range(0.5, 2), tx: 0, tz: 0, phase: 'enter', until: now() + rng.range(SD.wild.stayHours[0], SD.wild.stayHours[1]) / 24, fearT: 0, fleeT: 0, born: now(), hp: 1 };
    var ex = z.exits.length ? z.exits[Math.floor(rng.next() * z.exits.length)] : -1;
    if (z.marker && !z.virtual) { w.x = z.marker.x + rng.range(-1, 1); w.z = z.marker.z + rng.range(-1, 1); w.phase = 'in'; }
    else if (ex >= 0) { w.x = tcx(ex) + rng.range(-0.6, 0.6); w.z = tcz(ex) + rng.range(-0.6, 0.6); }
    else { var t0 = enc.tiles[Math.floor(rng.next() * enc.tiles.length)]; w.x = tcx(t0); w.z = tcz(t0); w.phase = 'in'; }
    if (kind === 'air') { w.y = rng.range(3, 6); w.state = 'fly'; }
    if (kind === 'sea') { w.y = -0.4; w.state = 'swim'; }
    if (!tileOK(w, w.x, w.z, true) && kind !== 'air') { var t1 = enc.tiles[Math.floor(rng.next() * enc.tiles.length)]; w.x = tcx(t1); w.z = tcz(t1); w.phase = 'in'; if (!tileOK(w, w.x, w.z, true)) return null; }
    pickTarget(w, z);
    W.list.push(w); W.by[w.id] = w; ST().stats.wildIn++;
    bus.emit('wildlife', { wild: w, zone: z.id, kind: 'arrive' });
    return w;
  }
  function pickTarget(w, z) {
    var tiles = z.enc.tiles, k, t;
    for (k = 0; k < 8; k++) {
      t = tiles[Math.floor(rng.next() * tiles.length)];
      if (w.kind === 'land' && (isWater(t) || RT().block[t] || C.cliffT(t) || S().ditch[t])) continue;
      if (w.kind === 'sea' && !isWater(t)) continue;
      w.tx = tcx(t) + rng.range(-0.8, 0.8); w.tz = tcz(t) + rng.range(-0.8, 0.8); return;
    }
    w.tx = w.x; w.tz = w.z;
  }
  function removeWild(w, why) {
    var k = W.list.indexOf(w); if (k >= 0) { W.list[k] = W.list[W.list.length - 1]; W.list.pop(); }
    delete W.by[w.id]; w.dead = 1; bus.emit('wildlife', { wild: w, kind: why || 'gone' });
  }
  function scanFear(w, z) {
    var s = S(), best = null, bd = SD.wild.fearR * SD.wild.fearR, rl = w.kind;
    for (var k = 0; k < s.animals.length; k++) {
      var a = s.animals[k]; if (a.enc !== w.zone) continue;
      var sp = SP()[a.species]; if (!sp.predator && C.aDanger(a) < 2) continue; if ((sp.realm || 'land') !== rl) continue;
      var dx = a.x - w.x, dz = a.z - w.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = a; }
    }
    if (best) { var ax = w.x - best.x, az = w.z - best.z, l = Math.sqrt(ax * ax + az * az) || 1; w.tx = w.x + ax / l * 9; w.tz = w.z + az / l * 9; w.fleeT = 2.2; w.state = rl === 'air' ? 'fly' : rl === 'sea' ? 'swim' : 'run'; }
  }
  function stepWild(w, dt) {
    var z = X.zones[w.zone]; if (!z || !z.enc) { removeWild(w, 'gone'); return; }
    var sp = SP()[w.species], kind = w.kind, spd0 = (sp.speed || 1.5) * (kind === 'air' ? 1.9 : 1.0);
    var t = C.tileOf(w.x, w.z); w.enc = S().tileEnc[t] === w.zone ? w.zone : 0;
    if (w.phase !== 'leave' && now() >= w.until) {
      w.phase = 'leave'; var ex = z.marker && !z.virtual ? { x: z.marker.x, z: z.marker.z } : null;
      if (!ex && z.exits.length) { var bt = z.exits[0], bd = 1e9; for (var k = 0; k < z.exits.length; k++) { var d2 = dist(z.exits[k] % N * TILE, tj(z.exits[k]) * TILE, w.x, w.z); if (d2 < bd) { bd = d2; bt = z.exits[k]; } } ex = { x: tcx(bt), z: tcz(bt) }; }
      if (ex) { w.tx = ex.x; w.tz = ex.z; } else { removeWild(w, 'left'); return; }
    }
    if (w.phase === 'leave') {
      if (dist(w.x, w.z, w.tx, w.tz) < 1.6 || (!w.enc && w.phase === 'leave' && dist(w.x, w.z, w.tx, w.tz) < 4)) { removeWild(w, 'left'); return; }
    }
    w.fearT -= dt; if (w.fearT <= 0 && w.phase !== 'leave') { w.fearT = 0.5; scanFear(w, z); }
    if (w.fleeT > 0) w.fleeT -= dt;
    var dx = w.tx - w.x, dz = w.tz - w.z, d = Math.sqrt(dx * dx + dz * dz);
    if (w.state === 'eat' || (w.state === 'idle' && kind === 'land')) {
      w.speed = 0; w.st -= dt; if (w.st <= 0) { if (rng.chance(0.55)) { w.state = 'eat'; w.st = rng.range(3, 6); } else { pickTarget(w, z); w.state = 'walk'; } }
      return;
    }
    if (kind === 'air' && w.state === 'idle') { w.speed = 0; w.st -= dt; w.y += (0 - w.y) * Math.min(1, dt * 2); if (w.st <= 0) { w.state = 'fly'; pickTarget(w, z); } return; }
    var run = w.fleeT > 0, spd = spd0 * (run ? 1.9 : 0.8) * (kind === 'sea' ? 1.1 : 1);
    if (d < 0.9) {
      if (w.phase === 'enter') w.phase = 'in';
      if (kind === 'air' && rng.chance(0.25) && w.phase === 'in') { w.state = 'idle'; w.st = rng.range(3, 8); w.speed = 0; return; }
      if (kind === 'land') { w.state = 'idle'; w.st = rng.range(0.5, 3); w.speed = 0; return; }
      pickTarget(w, z); return;
    }
    var step = Math.min(d, spd * dt), nx = w.x + dx / d * step, nz = w.z + dz / d * step;
    if (!tileOK(w, nx, nz, w.phase !== 'in') && kind !== 'air') { if (w.phase === 'leave') { removeWild(w, 'left'); return; } pickTarget(w, z); w.speed = 0; w.state = kind === 'land' ? 'idle' : 'swim'; w.st = 0.4; return; }
    w.x = nx; w.z = nz; w.speed = spd; w.heading = Math.atan2(dx, dz);
    w.state = kind === 'air' ? 'fly' : kind === 'sea' ? 'swim' : run ? 'run' : 'walk';
    if (kind === 'air') w.y += ((run ? 5.5 : 3.8) - w.y) * Math.min(1, dt * 0.8); else if (kind === 'sea') w.y = -0.4;
  }
  function spawnTick() {
    var o = ST(), zs = [], k, id;
    for (id in X.zones) if (X.zones[id].connected && X.zones[id].enc.area >= 8) zs.push(X.zones[id]);
    if (!zs.length) return;
    var perSec = SD.wild.perHour / (C.DAY_SECONDS / 24);
    var z = zs[Math.floor(rng.next() * zs.length)];
    var m = (X0.isNight() ? 0.6 : 1) * Math.pow(SD.wild.scareMul, Math.min(2, z.det));
    if (!rng.chance(clamp(perSec * m * Math.min(2, Math.sqrt(zs.length)), 0, 1))) return;
    var tot = 0; for (k in WSP) tot += wildCount(k); if (tot >= 12) return;
    if (wildCount(z.realm) >= SD.wild.cap[z.realm]) return;
    var inZ = 0; W.list.forEach(function (w) { if (w.zone === z.id) inZ++; }); if (inZ >= Math.max(2, Math.floor(z.enc.area / 14))) return;
    spawnWild(z, pickSp(z.realm));
  }
  A.spawnWild = function (encId, species) { var z = X.zones[encId]; if (!z) return null; return spawnWild(z, species || pickSp(z.realm)); };

  // ------------------------------------------------------------------ predation on visitors
  A.findPrey = function (a, enc) {
    if (!W.list.length) return null;
    var sp = SP()[a.species]; if (sp.modern || a.state === 'escaped') return null;
    var rl = sp.realm || 'land', best = null, bd = 28 * 28;
    for (var k = 0; k < W.list.length; k++) {
      var w = W.list[k]; if (w.enc !== enc.id || w.kind !== rl || w.dead) continue;
      var ps = SP()[w.species]; if (ps.length > sp.length * 1.5) continue;
      var dx = w.x - a.x, dz = w.z - a.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = w; }
    }
    return best;
  };
  A.hunt = function (a, dt, enc, E, sp) {
    if (!W.list.length && a.tg !== 'whunt') return false;
    if (sp.modern || !sp.predator || a.baby || a.state === 'escaped' || a.bolt || a.sick) return false;
    var rl = sp.realm || 'land'; if (rl === 'land') return false;
    if (a.tg !== 'whunt') {
      a.wh = (a.wh || 0) - dt; if (a.wh > 0) return false; a.wh = rng.range(2, 4);
      if (a.hunger < 42 || a.state === 'sleep' || a.state === 'eat') return false;
      var pr = A.findPrey(a, enc); if (!pr || !rng.chance(0.6)) return false;
      a.tg = 'whunt'; a.hid = pr.id; a.hunt = 0;
    }
    var w = W.by[a.hid];
    if (!w || w.enc !== a.enc || a.hunt > 40) { a.tg = ''; a.state = 'idle'; a.st = 1; a.speed = 0; return false; }
    a.hunt += dt;
    var dx = w.x - a.x, dz = w.z - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.5 + sp.length * 0.12) { a.tg = ''; A.killWild(a, w); if (rl === 'sea') { a.state = 'idle'; a.st = rng.range(3, 6); } else { a.state = 'idle'; a.st = rng.range(3, 6); } a.speed = 0; return true; }
    var spd = (sp.speed || 2) * X0.fxOf(a).speed * 2.0;
    var step = Math.min(d, spd * dt), nx = a.x + dx / d * step, nz = a.z + dz / d * step;
    if (S().tileEnc[C.tileOf(nx, nz)] !== a.enc) { a.tg = ''; a.state = 'idle'; a.st = 1; a.speed = 0; return false; }   // never leave the zone to chase
    a.x = nx; a.z = nz; a.heading = Math.atan2(dx, dz); a.speed = spd; a.tx = w.x; a.tz = w.z;
    a.state = rl === 'sea' ? 'swim' : 'fly';
    var ty = rl === 'sea' ? -0.45 : Math.max(0.8, w.y); a.y += (ty - a.y) * Math.min(1, dt * 2.2);
    return true;
  };
  A.killWild = function (pred, w) {
    if (w.dead) return; var o = ST(), st = o.stats, sp = SP()[w.species], ps = SP()[pred.species], enc = RT().eMap[pred.enc];
    removeWild(w, 'killed');
    pred.hunger = Math.max(0, pred.hunger - 55); pred.happiness = Math.min(100, pred.happiness + 10); pred.kill = 1; pred.hid = 0; pred.hunt = 0;
    if (pred.state !== 'idle') { pred.state = 'eat'; pred.st = rng.range(4, 6); } pred.tg = ''; pred.speed = 0;
    if (enc) { enc.foodLevel = Math.min(1, (enc.foodLevel || 0) + 0.03); }
    st.kills++; if (PROTECTED[w.species]) { st.prot[w.species] = (st.prot[w.species] || 0) + 1; o.protDay = o.protDay || 0; }
    // who saw it?
    var wit = 0, thrill = 0, fam = 0, s = S();
    for (var k = 0; k < s.guests.length; k++) {
      var g = s.guests[k]; if (g.state === 'leave') continue; var d = dist(g.x, g.z, w.x, w.z); if (d > 26) continue;
      wit++; if (g.thrill) { thrill++; g.mood += 8; g.fun = Math.min(100, g.fun + 14); if (rng.chance(0.5)) C.say(g, 'safariKill', w.species); } else { fam++; if (rng.chance(0.5)) { g.mood -= 6; if (rng.chance(0.6)) C.say(g, 'safariKillSad', w.species); } else g.mood += 3; }
    }
    if (wit) st.seenKills++;
    C.msg('The ' + C.lc(ps.name) + ' ' + pred.name + ' caught a wild ' + C.lc(sp.name) + ' in ' + (enc ? enc.name : 'the zone') + '.' + (wit ? ' ' + wit + ' guest' + (wit > 1 ? 's' : '') + ' watched.' : ''), 'info', false);
    bus.emit('wildlifeKilled', { safari: true, species: w.species, animal: w, predator: pred, zone: pred.enc, count: 1, witnesses: wit, thrill: thrill, family: fam });
    var N_ = Z.News; if (N_) {
      o.killsToday = (o.killsToday || 0) + (wit ? 1 : 0);
      var posted = false;
      if (wit >= 2 && thrill >= fam && rng.chance(0.4) || (st.kills === 1 && wit >= 1)) { if (N_.post({ kind: 'safari_doc', severity: 2, data: { species: w.species }, force: true })) { posted = true; N_.addEffect('thrill', 1.1, 3, 'Safari documentary buzz', true); N_.addEffect('family', 0.97, 3, 'Families unsettled by the hunt', false); } }
      if (st.kills === 1 && !posted) N_.post({ kind: 'safari_wild', severity: 1, data: { species: w.species }, force: true });
      if (o.killsToday >= 4 && !o.protestDay) { o.protestDay = S().day; if (N_.post({ kind: 'safari_protest', severity: 3, data: { species: w.species }, force: true })) { N_.addEffect('protest', 3, 5, 'Animal welfare protest', false); N_.addEffect('arrivals', 0.94, 4, 'Safari hunts criticised', false); } }
      if (PROTECTED[w.species] && st.prot[w.species] >= 3) { st.prot[w.species] = 0; var fine = Math.round(SD.escape.finePer * 0.5 / 50) * 50; C.spend(fine, 'other'); if (N_.post({ kind: 'safari_fine', severity: 3, data: { species: w.species, amt: fine }, force: true })) C.msg('Conservation fine: ' + C.fmt(fine) + ' for repeatedly taking a protected ' + C.lc(sp.name) + '. Close the corridor or fit deterrents.', 'bad'); }
    }
    // a carcass near the lab can be sampled
    if ((w.species === 'deer' || w.species === 'seal' || w.species === 'seagull') && RT().labs && RT().labs.length && rng.chance(0.4) && Z.Sim.research && Z.Sim.research.addDonor) {
      var rr = Z.Sim.research.addDonor(w.species, 1, 'wild carcass recovered from the safari zone'); if (rr && rr.ok !== false) C.msg('Rangers recovered a tissue sample from the ' + C.lc(sp.name) + ' for the lab.', 'good', false);
    }
  };
  // tag the wild so guests can pick them (UI)
  A.wildInfo = function (id) { var w = W.by[id]; if (!w) return null; var sp = SP()[w.species]; return { id: id, species: w.species, name: sp.name, kind: w.kind, zone: w.zone, protected: !!PROTECTED[w.species], phase: w.phase }; };

  // ------------------------------------------------------------------ the outside world: leaks, escapes, the mainland
  var SH = {};        // shutter timers by enc id (seconds of battery-held closure left); -1 = mains on
  function shuttersClosed(z) { var t = SH[z.id]; return !!(ST().lockdown || (t !== undefined && t > 0 && !zonePowered(z.enc))); }
  A.shuttersClosed = function (encId) { var z = X.zones[encId]; return !!(z && shuttersClosed(z)); };
  A.shutterLeft = function (encId) { var t = SH[encId]; return t > 0 ? Math.round(t) : 0; };
  function leakTick() {
    var o = ST(), id;
    for (id in X.zones) {
      var z = X.zones[id], enc = z.enc;
      if (!z.eligible || !z.open) { SH[id] = -1; continue; }
      var pw = zonePowered(enc);
      if (pw) { SH[id] = -1; continue; }
      if (SH[id] === undefined || SH[id] < 0) { SH[id] = (Z.Power && Z.Power.status().onBattery) ? SD.escape.shutterSec : 0; if (SH[id] > 0) C.msg(enc.name + ': corridor shutters closed on battery.', 'info', false); }
      else SH[id] = Math.max(0, SH[id] - 1);
      if (o.lockdown || SH[id] > 0) continue;
      // the connection cuts both ways: residents walk out of the open corridor
      var res = S().animals.filter(function (a) { return a.enc === enc.id && a.state !== 'sleep' && !a.baby && !a.sick; });
      if (!res.length) continue;
      if (!rng.chance(0.07 * Math.min(3, res.length))) continue;
      var a = res[Math.floor(rng.next() * res.length)];
      leakOut(a, z);
    }
  }
  function leakOut(a, z) {
    var enc = z.enc;
    if (Z.Realms && enc.kind) Z.Realms.realmEscape(a, enc, ({ sea: 'swum out of', air: 'flown out of', land: 'walked out of' })[z.realm] || 'walked out of', 'corridor');
    else {
      var t = -1, bd = 1e9, mk = z.marker;
      z.exits.forEach(function (e) { var d = mk ? dist(tcx(e), tcz(e), mk.x, mk.z) : rng.next() * 100; if (d < bd) { bd = d; t = e; } });
      X0.doEscape(a, enc, { t: t, how: 'walked out of' });
    }
    a.sfOut = 1; a.sfT = 0; ST().cleanDays = 0; o_escToday = 1;
  }
  var o_escToday = 0;
  bus.on('escape', function (a) {
    if (!a || !ST()) return; o_escToday = 1;
    var z = X.zones[a.home]; a.sfOut = z && z.eligible && z.open && !ST().lockdown ? 1 : 0; a.sfT = 0;
    if (a.sfOut) { var d = C.aDanger(a); if (d >= 2) C.msg('Warning: ' + a.name + ' escaped from a connected zone and may reach the causeway or the open sea. Rangers and a lockdown can stop it.', 'bad'); }
  });
  function fx(a) { return X0.fxOf(a).speed || 1; }
  A.outStep = function (a, dt, sp) {
    if (a.state !== 'escaped' || !ST()) return false;
    var rl = sp.realm || 'land', er = a.er, o = ST();
    a.sfT = (a.sfT || 0) + dt;
    if (rl === 'sea' || rl === 'air') {
      if (er && er.where === 'land') return false;
      var lim = rl === 'sea' ? 60 : 50; if (RT().boathouses && rl === 'sea') lim += 25;
      if (a.sfT > lim) { goMainland(a, rl); return true; }
      return false;
    }
    var f = X.field, t = C.tileOf(a.x, a.z); if (!f) return false;
    if (a.held) return false;
    var rN = rangersN(), cover = (RT().secCount || 0) + (RT().keeperCount || 0) + rN;
    if (cover && rng.next() < 0.012 * Math.min(4, cover) * dt * (1 + (rN ? 1.2 : 0))) { a.sfOut = 0; X0.recapture(a, rN ? 'The rangers' : 'The response team'); return true; }
    if (f[t] >= 9999) return false;
    if (f[t] === 0) { goMainland(a, 'land'); return true; }
    var i = ti(t), j = tj(t), best = t, bv = f[t], nb = [i > 0 ? t - 1 : -1, i < N - 1 ? t + 1 : -1, j > 0 ? t - N : -1, j < N - 1 ? t + N : -1];
    for (var n = 0; n < 4; n++) { var u = nb[n]; if (u >= 0 && f[u] < bv) { bv = f[u]; best = u; } }
    var tx = tcx(best), tz = tcz(best), dx = tx - a.x, dz = tz - a.z, d = Math.sqrt(dx * dx + dz * dz) || 1, spd = (sp.speed || 1.5) * fx(a) * 1.5;
    var st = Math.min(d, spd * dt); a.x += dx / d * st; a.z += dz / d * st; a.heading = Math.atan2(dx, dz); a.speed = spd; a.state = 'escaped'; a.y = 0; a.tx = tx; a.tz = tz; a.esc = (a.esc || 0) + dt * 0.4;
    return true;
  };
  function goMainland(a, how) {
    var o = ST(), sp = SP()[a.species], d = C.aDanger(a), s = S(), N_ = Z.News, E = SD.escape;
    var copy = JSON.parse(JSON.stringify(a)); copy.er = null; copy.sfOut = 0; copy.state = 'idle';
    o.away.push({ id: a.id, animal: copy, species: a.species, name: a.name, day: s.day, home: a.home, danger: d, state: 'missing', until: 0, lostDay: s.day + 6, how: how });
    X0.removeAnimal(a); o.stats.mainland++; o.cleanDays = 0; o_escToday = 1;
    var fine = Math.round(E.finePer * (1 + d) / 50) * 50; C.spend(fine, 'other'); s.stats.compensation += fine;
    s.reputation = clamp(s.reputation - E.mainlandLossRep * (0.6 + d * 0.3), 0, 100); s.panic = Math.min(2, (s.panic || 0) + 0.5 + 0.2 * d);
    C.msg('MAINLAND SIGHTING: ' + a.name + ' the ' + C.lc(sp.name) + ' has ' + (how === 'sea' ? 'swum out to the open sea' : how === 'air' ? 'flown off over the mainland' : 'crossed the causeway') + '! Fine: ' + C.fmt(fine) + '. Send a recapture expedition from the Safari panel.', 'bad');
    if (N_) {
      var st = N_.post({ kind: 'mainland', severity: 5, data: { species: a.species, name: a.name, amt: fine }, force: true });
      if (st) { N_.addEffect('arrivals', 0.72, 6, 'Mainland sighting: guests stay home', false); N_.addEffect('family', 0.9, 6, 'Families frightened', false); N_.addEffect('protest', 4, 6, 'Protesters and press at the gate', false); }
      if (rng.chance(d >= 2 ? 0.8 : 0.35) && s.news) { s.news.closedUntil = Math.max(s.news.closedUntil || 0, s.day + E.closeDays); C.msg('The authorities have closed the park for ' + E.closeDays + ' days after the sighting.', 'bad'); }
    }
    bus.emit('mainlandSighting', { animal: a, species: a.species, how: how, fine: fine });
    bus.emit('safari');
  }
  // highest enclosure id still referenced by safari state: zone configs and mainland ("away") animals
  A.maxEncId = function () {
    var o = ST(), max = 0, k, e;
    if (!o) return 0;
    if (o.zones) for (var zid in o.zones) if (+zid > max) max = +zid;
    if (o.away) for (k = 0; k < o.away.length; k++) {
      e = o.away[k]; if (!e) continue;
      if (e.home > max) max = e.home;
      if (e.animal && e.animal.enc > max) max = e.animal.enc;
      if (e.animal && e.animal.home > max) max = e.animal.home;
    }
    return max;
  };
  A.awayList = function () { return ST().away.map(function (e) { return { id: e.id, species: e.species, name: e.name, day: e.day, state: e.state, until: e.until, lostDay: e.lostDay, danger: e.danger, how: e.how }; }); };
  A.sendExpedition = function (id, opts) {
    var o = ST(), e = o.away.filter(function (q) { return q.id === id; })[0]; if (!e || e.state !== 'missing') return fail('No missing animal to search for');
    var cost = SD.escape.reconCost; if (S().money < cost) return fail('Not enough money'); if (opts && opts.dry) return okr(cost);
    C.spend(cost, 'other'); e.state = 'searching'; e.until = now() + SD.escape.reconDays; C.msg('Recapture expedition sent after ' + e.name + '. Back in ' + SD.escape.reconDays + ' days.', 'info'); bus.emit('safari'); return okr(cost);
  };
  function awayDaily() {
    var o = ST(), s = S(), N_ = Z.News, keep = [];
    o.away.forEach(function (e) {
      if (e.state === 'searching' && now() >= e.until) {
        var ok = rng.chance(0.82 + 0.05 * rangersN());
        if (ok) {
          var a = e.animal; a.er = null; a.sfOut = 0; a.hunger = 40; a.thirst = 40; a.state = 'escaped'; a.enc = 0; a.held = 0; a.x = (Math.floor(N / 2) - 0.5) * TILE; a.z = (N - 2) * TILE; a.tx = a.x; a.tz = a.z; a.home = e.home; a.speed = 0; a.esc = 0;
          X0.addBack(a); X0.recapture(a, 'The expedition'); o.stats.returned++;
          if (N_) N_.post({ kind: 'mainland_recovered', severity: 3, data: { species: e.species, name: e.name }, force: true });
          if (N_) N_.addEffect('arrivals', 1.06, 3, 'Heroic recapture', true);
          return;
        }
        e.state = 'lost';
      }
      if (e.state === 'missing' && s.day >= e.lostDay) e.state = 'lost';
      if (e.state === 'lost') { o.stats.lost++; C.msg(e.name + ' the ' + C.lc(SP()[e.species].name) + ' has been lost for good.', 'bad'); if (N_) N_.post({ kind: 'mainland_lost', severity: 3, data: { species: e.species, name: e.name }, force: true }); return; }
      keep.push(e);
    });
    o.away = keep;
  }

  // ------------------------------------------------------------------ Game Reserve Tent Camp & Bodyguards
  var CAMP_GUARD_COST = 1200, CAMP_GUARD_UPKEEP = 90, CAMP_MAX_GUARDS = 4;
  function campGuardsOf(o) { return o.campGuards === undefined ? 1 : clamp(o.campGuards | 0, 0, CAMP_MAX_GUARDS); }
  function campNearRoute(o) {
    var c = C.objCentre(o), rMax = 6.5 * TILE, routes = ST().routes;
    for (var k = 0; k < routes.length; k++) {
      var P = X.routes[routes[k].id]; if (!P || !P.ok || !P.depot || !serving(P.depot)) continue;
      for (var j = 0; j < P.tiles.length; j++) {
        if (dist(tcx(P.tiles[j]), tcz(P.tiles[j]), c.x, c.z) <= rMax) return P;
      }
    }
    return null;
  }
  function campScanWildlife(o) {
    var s = S(), c = C.objCentre(o), fp = C.objFootprint(o);
    var campEnc = s.tileEnc[fp.i0 + fp.j0 * N] || 0;
    var rScan = 14 * TILE, dinos = 0, preds = 0, spSet = {}, appSum = 0, topSp = '';
    for (var k = 0; k < s.animals.length; k++) {
      var a = s.animals[k]; if (a.state === 'escaped') continue;
      var inSame = campEnc && a.enc === campEnc;
      var d = dist(a.x, a.z, c.x, c.z);
      if (!inSame && d > rScan) continue;
      var sp = SP()[a.species]; if (!sp) continue;
      dinos++;
      if (!spSet[a.species]) { spSet[a.species] = 1; appSum += (sp.appeal || 10) * 1.3; }
      else appSum += (sp.appeal || 10) * 0.2;
      if (sp.predator) { preds++; if (!topSp) topSp = a.species; }
      else if (!topSp) topSp = a.species;
    }
    var nSp = Object.keys(spSet).length;
    var rangerNear = X.rangers.some(function (r) { return dist(r.x, r.z, c.x, c.z) <= 16 * TILE; });
    var guards = campGuardsOf(o) + (rangerNear ? 1 : 0);
    var needed = preds >= 3 ? 3 : preds >= 1 ? 2 : 1;
    var bonusPct = clamp(Math.round(Math.min(100, appSum * 0.65 + nSp * 8 + preds * 12 + (campEnc ? 15 : 0))), 0, 100);
    return { encId: campEnc, dinos: dinos, species: nSp, predators: preds, topSp: topSp, guards: campGuardsOf(o), totalGuards: guards, neededGuards: needed, rangerNear: rangerNear, safe: guards >= needed || (guards > 0 && preds === 0), bonusPct: bonusPct };
  }
  A.campConnected = function (o) {
    if (!o) return false;
    var d = defOf(o); if (!d || !d.safariReserve) return false;
    if (depotConnected(o)) return true;
    return !!campNearRoute(o);
  };
  A.campPrice = function (o) {
    var d = defOf(o); if (!d) return 550;
    var base = o.price != null ? o.price : (d.price || 550);
    var w = campScanWildlife(o);
    return Math.round(base * (1 + w.bonusPct / 100) / 10) * 10;
  };
  A.campInfo = function (id) {
    var o = objById(id), d = o && defOf(o); if (!o || !d || !d.safariReserve) return null;
    var w = campScanWildlife(o), viaPath = depotConnected(o), viaSafari = !!campNearRoute(o);
    var campers = 0; S().guests.forEach(function (g) { if (g.resortLodging === o.id) campers++; });
    return {
      id: id, name: d.name, connected: viaPath || viaSafari, viaPath: viaPath, viaSafari: viaSafari,
      basePrice: o.price != null ? o.price : (d.price || 550), nightlyPrice: A.campPrice(o),
      capacity: d.capacity || 6, campers: campers, nightsSold: o.nightsSold || 0, income: Math.round(o.income || 0),
      guards: w.guards, maxGuards: CAMP_MAX_GUARDS, neededGuards: w.neededGuards, rangerNear: w.rangerNear, safe: w.safe,
      guardCost: CAMP_GUARD_COST, guardUpkeep: CAMP_GUARD_UPKEEP,
      dinos: w.dinos, species: w.species, predators: w.predators, bonusPct: w.bonusPct, inReserve: !!w.encId
    };
  };
  A.hireCampGuard = function (id) {
    var o = objById(id), d = o && defOf(o); if (!o || !d || !d.safariReserve) return fail('No reserve camp');
    var cur = campGuardsOf(o); if (cur >= CAMP_MAX_GUARDS) return fail('Maximum bodyguards already stationed');
    if (S().money < CAMP_GUARD_COST) return fail('Not enough money');
    C.spend(CAMP_GUARD_COST, 'staff'); o.campGuards = cur + 1;
    C.msg('Bodyguard assigned to ' + d.name + ' (' + o.campGuards + ' on duty).', 'good', false);
    bus.emit('safari'); return okr(CAMP_GUARD_COST);
  };
  A.dismissCampGuard = function (id) {
    var o = objById(id), d = o && defOf(o); if (!o || !d || !d.safariReserve) return fail('No reserve camp');
    var cur = campGuardsOf(o); if (cur <= 0) return fail('No bodyguards to dismiss');
    o.campGuards = cur - 1; bus.emit('safari'); return okr(0);
  };
  function stepCamps() {
    var s = S(), objs = s.objects;
    for (var k = 0; k < objs.length; k++) {
      var o = objs[k], d = defOf(o); if (!d || !d.safariReserve) continue;
      var c = C.objCentre(o), w = campScanWildlife(o), guards = w.totalGuards;
      // Bodyguards calmly deter dinosaurs that wander too close to the tent perimeter
      if (guards > 0 && w.dinos > 0) {
        var rPerim = 6.2;
        for (var j = 0; j < s.animals.length; j++) {
          var a = s.animals[j]; if (a.state === 'escaped') continue;
          var dx = a.x - c.x, dz = a.z - c.z, dd = Math.sqrt(dx * dx + dz * dz);
          if (dd > 0.1 && dd < rPerim && (C.aDanger(a) >= 2 || dd < 4.4)) {
            a.tx = c.x + (dx / dd) * (rPerim + 4); a.tz = c.z + (dz / dd) * (rPerim + 4);
            if (a.state === 'idle' || a.state === 'walk') { a.tg = 'wander'; a.state = 'walk'; }
          }
        }
      }
      // Reward or warn campers staying at this reserve camp
      for (var gi = 0; gi < s.guests.length; gi++) {
        var g = s.guests[gi]; if (g.resortLodging !== o.id) continue;
        if (w.safe && w.dinos > 0) {
          g.mood = Math.min(100, (g.mood || 50) + 0.35);
          g.happiness = Math.min(100, (g.happiness || 50) + 0.25);
          if (rng.chance(0.015) && w.topSp) C.say(g, 'safariCamp', w.topSp);
        } else if (!w.safe && w.predators > 0) {
          g.mood = Math.max(0, (g.mood || 50) - 0.9);
          if (rng.chance(0.04) && w.topSp) C.say(g, 'safariCampDanger', w.topSp);
        }
      }
    }
  }

  // ------------------------------------------------------------------ per-step / per-second / per-day
  A.step = function (dt) {
    var o = ST(); if (!o) return;
    if (!X.gateList.length && !X.portals.length && !o.veh.length && !W.list.length) return;
    if (dt > 0.25) dt = 0.25;
    stepGates(dt); stepVehicles(dt);
    for (var k = W.list.length - 1; k >= 0; k--) { var w = W.list[k]; if (w && !w.dead) stepWild(w, dt); }
  };
  A.secondly = function () {
    var o = ensure(); if (!o) return;
    for (var rid in X.routes) { var pr = X.routes[rid]; if (pr && pr.ok) scoreRoute(pr); }
    stepCamps();
    if (X.zones && Object.keys(X.zones).length) { spawnTick(); leakTick(); }
    else for (var q in SH) delete SH[q];
    for (var k = W.list.length - 1; k >= 0; k--) { var w = W.list[k]; if (!X.zones[w.zone]) removeWild(w, 'gone'); }
    if (!o.stats.opened && o.stats.riders >= 3 && Z.News) { o.stats.opened = 1; Z.News.post({ kind: 'safari_open', severity: 2, data: {}, force: true }); }
    o.advT = (o.advT || 0) - 1;
    if (o.advT <= 0) {
      o.advT = 120;
      if (Z.Power && !Z.Power.hasBackup()) {
        for (var id in X.zones) { var z = X.zones[id]; if (z.connected && S().animals.some(function (a) { return a.enc === z.id && C.aDanger(a) >= 1; })) { C.msg('Advisor: ' + z.enc.name + ' is connected to the outside world but there is no backup power. A cut will open the corridor to the mainland. Build a generator and batteries, or close the corridor.', 'bad', false); break; } }
      }
    }
  };
  A.newDay = function () {
    var o = ensure(); if (!o) return;
    var up = 0; o.veh.forEach(function (v) { up += SD.upkeep[v.kind] || 20; });
    S().objects.forEach(function (ob) { var d = defOf(ob); if (d && d.safariReserve) { var eg = Math.max(0, campGuardsOf(ob) - 1); up += eg * CAMP_GUARD_UPKEEP; } });
    if (up) C.spend(Math.round(up), 'upkeep');
    if (o.lockdown) C.spend(150, 'upkeep');
    S().objects.forEach(function (ob) { if (ob.mtoday !== undefined && (BD()[ob.type] || {}).safari) { ob.mday = ob.mtoday; ob.mtoday = 0; } });
    var anyConn = false; for (var id in X.zones) if (X.zones[id].connected && S().animals.some(function (a) { return a.enc === +id; })) anyConn = true;
    if (o_escToday) o.cleanDays = 0; else if (anyConn) o.cleanDays++;
    o_escToday = 0; o.killsToday = 0; o.protestDay = 0;
    awayDaily();
  };
  A.afterLoad = function (fresh) {
    var o = ensure(); if (!o) return;
    VR = {}; GS = {}; SH = {}; W.list.length = 0; W.by = {}; W.seq = 1000000; o_escToday = 0;
    var s = S();
    o.veh.forEach(function (v) { v.v = 0; if (v.st === 'wait' || v.st === 'stuck') v.st = 'run'; vrt(v); });
    A.update();
    var gs = s.guests, k;
    for (k = gs.length - 1; k >= 0; k--) {
      var g = gs[k]; if (g.state !== 'ride' || !g.sfv) continue;
      var v = vehById(g.sfv), P = v && X.routes[v.route], rt = v && VR[v.id];
      if (v && P && P.ok && rt && v.st !== 'idle') { rt.pax.push(g); g.sfd = {}; g.sfw = {}; }
      else { var dep = P && P.depot || nearestDepot(g); if (dep) stepOff(g, dep); else { g.state = 'walk'; g.y = 0; g.gt = ''; g.dk = ''; g.sfv = 0; } }
    }
    o.veh.forEach(function (v) { var P = X.routes[v.route], rt = VR[v.id]; if (P && P.ok) { if (v.st === 'board' && rt.pax.length) rt.alight = !!v.al; poseOf(v, P, rt); rt.pax.forEach(function (g) { placeRider(v, rt, g); }); } });
  };

  // ------------------------------------------------------------------ goals and queries for the UI
  A.goalMet = function (gl) {
    var st = ST().stats;
    if (gl.what === 'rides') return st.riders >= gl.target;
    if (gl.what === 'sea') return st.sea >= gl.target;
    if (gl.what === 'week') return ST().cleanDays >= gl.target;
    return false;
  };
  A.stats = function () { return ST().stats; };
  A.lockdown = function () { return !!ST().lockdown; };
  A.rangers = function () { return rangersN(); };
  A.zoneInfo = function (encId) {
    var z = X.zones[encId], enc = RT().eMap[encId]; if (!enc) return null;
    var cs = Z.Realms && enc.kind ? Z.Realms.containmentStatus(encId) : { ok: true, reasons: [], powered: true, kind: 'land' };
    var wn = 0; W.list.forEach(function (w) { if (w.zone === encId) wn++; });
    var riders = 0, routes = []; ST().routes.forEach(function (r) { var P = X.routes[r.id]; if (P && P.ok && P.zones.indexOf(encId) >= 0) { routes.push(r.id); ST().veh.forEach(function (v) { if (v.route === r.id && VR[v.id]) riders += VR[v.id].pax.length; }); } });
    return { id: encId, safari: !!(z && z.safari), eligible: !!(z && z.eligible), virtual: enc.kind === 'virtual', marker: !!(z && z.marker), connected: !!(z && z.connected), open: !z || z.open, det: z ? z.det : 0, wild: wn, realm: z ? z.realm : (enc.realm || 'land'),
      routes: routes, onboard: riders, containment: cs, powered: zonePowered(enc), shutters: z ? shuttersClosed(z) : false, shutLeft: A.shutterLeft(encId), lockdown: !!ST().lockdown, backup: !!(Z.Power && Z.Power.hasBackup()), stats: ST().stats };
  };
  A.canConnect = function (encId) { var enc = RT().eMap[encId]; if (!enc) return false; return enc.kind === 'virtual' || !!(X.zones[encId] && X.zones[encId].marker); };
  A.wildCount = function () { return W.list.length; };
})();
