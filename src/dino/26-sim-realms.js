// ===== 26-sim-realms.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - realms package, sim side (DOM-free, runs under node).  See notes/realms.md.
   Makes sea and air real. Enclosure kinds (enc.kind; missing = ordinary fenced land paddock):
     'tank'    lagoon tank: dug basin on land with acrylic walls, depth level, needs salt water (sea intake or filtration plant)       realm 'sea'
     'pen'     sea pen: auto-detected water region closed by net fences (D.fences style 'net') and the shore                           realm 'sea'
     'dome'    the Aviary: tall clear-view geodesic dome over a land/cliff/water footprint, height level, mesh strength                realm 'air'
     'virtual' painted zone (land | sea | sky band) held by electronic tags + a powered Tagging control tower; no physical barrier   realm land|sea|air
   SAVED: S.realms {defs[] (tank/dome/virtual definitions: id (= enclosure id), kind, realm, tiles[], params), stats, forced, show}; enclosure fields kind/realm/... are stamped on the
   enclosure objects each recompute; per animal: a.tag (1 = tagged), a.er (escape info), a.wb (absolute water surface for sea animals). Walks (tunnel, mesh walk, pier, skywalk) are
   path ids with D.paths[].walk. Hooks in 20-sim.js are marked "realms package" and guarded with `Z.Realms &&`. */
(function () {
  'use strict';
  var C = Z.realmCtx; if (!C) return;
  var N = Z.N, NN = N * N, TILE = Z.TILE, D = Z.DATA, RD = D.realms, bus = Z.bus, rng = Z.rng, clamp = C.clamp, fail = C.fail, okr = C.okr, PI = Math.PI;
  if (bus && bus.on) bus.on('gridsize', function (n) { N = n; NN = n * n; FERRY.x = n * TILE / 2 + 30; FERRY.z = n * TILE + 8; });
  var R = Z.Realms = {};
  if (Z.Sim) Z.Sim.realms = R;
  var SEA_Y = -0.1, ES = Z.ELEV_STEP || 0.5, HOUR = C.DAY_SECONDS / 24;
  function S() { return C.S(); }
  function RT() { return C.RT(); }
  function SPt() { return C.SP(); }
  function BD() { return C.BD(); }
  function WATER() { return D.terrain.findIndex(function (q) { return q.id === 'water'; }); }
  var WI = -1; function wi() { if (WI < 0) WI = WATER(); return WI; }
  function tileOf(x, z) { return C.tileOf(x, z); }
  function fmt(n) { return C.fmt(n); }
  function lc(s) { return s.toLowerCase(); }

  // ============================================================ state
  function newRS() { return { v: 1, defs: [], stats: { tunnelGuests: 0, shows: 0, escapes: 0, virtualBest: 0, tagsFitted: 0, tagFails: 0, marineEver: 0, pteroEver: 0 }, forced: false, show: null, showDay: 0, showSlot: 0, pierAlert: 0 }; }
  function RS() {
    var s = S(); if (!s.realms) s.realms = newRS();
    var r = s.realms, d = newRS(), k;
    if (!r.defs) r.defs = []; if (!r.stats) r.stats = d.stats; for (k in d.stats) if (r.stats[k] === undefined) r.stats[k] = 0;
    return r;
  }
  function X() {
    var rt = RT(); if (!rt.rl) rt.rl = { towers: [], plants: [], boats: 0, drones: 0, sec: 0, ver: 0, vstat: {}, pend: [] };
    return rt.rl;
  }
  R.afterLoad = function () { RS(); };
  R.reset = function () { };

  // ============================================================ species needs
  var needCache = {};
  function realmOf(sp) { return (sp && sp.realm) || 'land'; }
  R.live = function (sp) { if (typeof sp === 'string') sp = SPt()[sp]; return !!sp && realmOf(sp) === 'sea' && !sp.modern && !!R.needs(sp).live; };
  R.realmOf = function (spId) { var sp = SPt()[spId]; return realmOf(sp); };
  R.needs = function (sp) {
    if (typeof sp === 'string') sp = SPt()[sp]; if (!sp) return null;
    var key = sp.id + '|' + sp.size + '|' + sp.minFence + '|' + (sp.realm || ''), c = needCache[key]; if (c) return c;
    var o = (RD.species && RD.species[sp.id]) || {}, rl = realmOf(sp), sz = sp.size || 1;
    var n = { realm: rl, depth: o.depth || clamp(0.45 + 0.22 * sz, 0.5, 1.3), fresh: !!o.fresh, live: o.live !== undefined ? !!o.live : (rl === 'sea' && !sp.modern && sp.id !== 'archelon'),
      breach: !!o.breach, school: !!o.school, haul: !!o.haul, needH: o.needH || clamp(2 + 2 * sz, 2.5, 8), minStr: Math.max(sp.minFence || 1, o.minFence || 0),
      tagResist: o.tagResist || clamp(0.3 + (sp.danger || 0) * 0.4 + sz * 0.25 + (sp.predator ? 0.15 : 0), 0.3, 2.2) };
    n.tagCost = Math.round((RD.virtual.tagBase + (sp.cost || 500) * RD.virtual.tagK) / 10) * 10;
    return (needCache[key] = n);
  };
  var KIND_NAME = { tank: 'lagoon tank', pen: 'sea pen', dome: 'aviary', virtual: 'virtual zone' };
  R.kindName = function (enc) { return enc.kind ? (enc.kind === 'virtual' ? (enc.realm === 'sea' ? 'virtual sea zone' : enc.realm === 'air' ? 'virtual sky zone' : 'virtual land zone') : KIND_NAME[enc.kind]) : 'paddock'; };
  function encIsRealm(enc) { return !!(enc && enc.kind); }

  // ============================================================ helpers: tiles, objects, power
  function ij(t) { var i = t % N; return [i, (t - i) / N]; }
  function cornerElev(i, j) { return S().elev[i + j * (N + 1)] * ES; }
  function tileFloor(t) { var i = t % N, j = (t - i) / N; return Math.min(cornerElev(i, j), cornerElev(i + 1, j), cornerElev(i, j + 1), cornerElev(i + 1, j + 1)); }
  function tileAvg(t) { var i = t % N, j = (t - i) / N; return (cornerElev(i, j) + cornerElev(i + 1, j) + cornerElev(i, j + 1) + cornerElev(i + 1, j + 1)) / 4; }
  function tileHi(t) { var i = t % N, j = (t - i) / N; return Math.max(cornerElev(i, j), cornerElev(i + 1, j), cornerElev(i, j + 1), cornerElev(i + 1, j + 1)); }
  function objTiles(o) { var fp = C.objFootprint(o), out = []; for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) out.push((fp.i0 + a) + (fp.j0 + b) * N); return out; }
  function objCentre(o) { var fp = C.objFootprint(o); return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE }; }
  // power contract (25-sim-power.js): Z.Sim.power.objPowered(objId). Without it everything is powered. R.forced (onPower(false)) cuts all of ours.
  function powered(o) {
    if (RS().forced) return false;
    var P = Z.Sim && Z.Sim.power; if (P && P.objPowered) { try { return !!P.objPowered(o.id); } catch (e) { } }
    return !o.off;
  }
  R.powered = powered;
  function objsOf(type) { var s = S(), out = [], k; for (k = 0; k < s.objects.length; k++) if (s.objects[k].type === type) out.push(s.objects[k]); return out; }
  function walkAt(t) { var p = S().path[t]; return p ? (D.paths[p - 1].walk || null) : null; }
  R.walkAt = walkAt;
  function defById(id) { var d = RS().defs; for (var k = 0; k < d.length; k++) if (d[k].id === id) return d[k]; return null; }
  // highest enclosure id still referenced by realm state: definitions and a running feeding show
  R.maxEncId = function () {
    var r = RS(), max = 0, k;
    for (k = 0; k < r.defs.length; k++) if (r.defs[k] && r.defs[k].id > max) max = r.defs[k].id;
    if (r.show && r.show.enc > max) max = r.show.enc;
    return max;
  };
  function isSea(t) { return !!C.seaMask()[t]; }
  function dist2(x0, z0, x1, z1) { var dx = x0 - x1, dz = z0 - z1; return dx * dx + dz * dz; }

  // ============================================================ enclosure construction (hooks from recomputeEnclosures)
  // tiles of tank/dome/virtual definitions and of detected sea pens are barrier tiles for the fence flood fill; pens become ordinary regions with .kind = 'pen'
  R.markBarrier = function (lab, regions) {
    var rs = RS(), k, q, t;
    for (k = 0; k < rs.defs.length; k++) { var tl = rs.defs[k].tiles; for (q = 0; q < tl.length; q++) lab[tl[q]] = -2; }
    var pens = detectPens(lab);
    for (k = 0; k < pens.length; k++) { for (q = 0; q < pens[k].length; q++) lab[pens[k][q]] = -2; regions.push(pens[k]); }
  };
  function netAt(i, j, d) {   // fence id on edge d (0 N, 1 E, 2 S, 3 W) of tile (i,j)
    var s = S(), f = d === 0 ? s.fenceX[i + j * N] : d === 2 ? s.fenceX[i + (j + 1) * N] : d === 3 ? s.fenceZ[i + j * (N + 1)] : s.fenceZ[(i + 1) + j * (N + 1)];
    return f;
  }
  function detectPens(lab) {
    var s = S(), out = [], seen = new Uint8Array(NN), stack = [], W = wi(), t0, mx = RD.pen.maxTiles, any = false;
    for (t0 = 0; t0 < NN; t0++) if (s.fenceX[t0] && D.fences[s.fenceX[t0] - 1].style === 'net') { any = true; break; }
    if (!any) for (t0 = 0; t0 < s.fenceZ.length; t0++) if (s.fenceZ[t0] && D.fences[s.fenceZ[t0] - 1].style === 'net') { any = true; break; }
    if (!any) return out;
    for (t0 = 0; t0 < NN; t0++) {
      if (seen[t0] || lab[t0] || s.terrain[t0] !== W) continue;
      var tiles = [], leak = false, nets = 0, sp = 0; stack[sp++] = t0; seen[t0] = 1;
      while (sp > 0) {
        var t = stack[--sp], i = t % N, j = (t - i) / N; tiles.push(t);
        for (var d = 0; d < 4; d++) {
          var f = netAt(i, j, d), ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
          if (f) { if (D.fences[f - 1].style === 'net') nets++; continue; }
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) { leak = true; continue; }
          var nt = ni + nj * N;
          if (s.terrain[nt] !== W) continue;        // the shore: land closes a pen
          if (lab[nt]) continue;
          if (!seen[nt]) { seen[nt] = 1; stack[sp++] = nt; }
        }
        if (tiles.length > mx + 200) leak = true;
        if (leak) { /* keep flooding so the whole open body is marked seen */ }
      }
      if (!leak && nets > 0 && tiles.length <= mx) { tiles.kind = 'pen'; out.push(tiles); }
    }
    return out;
  }
  var NAMEC = { tank: 'Lagoon tank', dome: 'Aviary', virtual: 'Virtual zone', pen: 'Sea pen' };
  function nextName(kind, encs) {
    var base = NAMEC[kind], max = 0, re = new RegExp('^' + base + ' (\\d+)$');
    for (var k = 0; k < encs.length; k++) { var m = re.exec(encs[k].name || ''); if (m) max = Math.max(max, +m[1]); }
    return base + ' ' + (max + 1);
  }
  // add the enclosures of tank / dome / virtual definitions (they bypass the fence regions)
  R.defEncs = function (newEncs, oldById) {
    var rs = RS(), k, q;
    for (k = 0; k < rs.defs.length; k++) {
      var def = rs.defs[k], enc = oldById[def.id], tiles = def.tiles, sx = 0, sz = 0, t;
      if (!enc) enc = { id: def.id, name: null, auto: false, poop: 0, foodLevel: 1, waterLevel: 1, breach: 0 };
      if (!enc.name || /^Enclosure \d+$/.test(enc.name)) enc.name = nextName(def.kind, newEncs.concat(S().enclosures));
      enc.kind = def.kind; enc.realm = def.realm; enc.lvl = def.lvl || 1; enc.wall = def.wall || 0; enc.mesh = def.mesh || 0; enc.band = def.band || 0; enc.paid = def.paid || 0;
      enc.tiles = tiles.slice(); enc.area = tiles.length;
      for (q = 0; q < tiles.length; q++) { t = tiles[q]; S().tileEnc[t] = enc.id; sx += C.cxOf(t); sz += C.czOf(t); }
      enc.cx = tiles.length ? sx / tiles.length : N * TILE / 2;
      enc.cz = tiles.length ? sz / tiles.length : N * TILE / 2;
      enc.animals = []; enc.species = []; enc.suitability = enc.suitability || {};
      newEncs.push(enc);
    }
  };
  R.stampPen = function (enc, tiles) {
    enc.kind = 'pen'; enc.realm = 'sea';
    if (!enc.name || /^Enclosure \d+$/.test(enc.name)) enc.name = nextName('pen', S().enclosures.concat([]));
  };
  // clean fields of an enclosure that stopped being a realm enclosure (e.g. nets removed)
  R.unstamp = function (enc) { if (enc.kind) { enc.kind = undefined; enc.realm = undefined; enc.vol = undefined; enc.depth = undefined; enc.H = undefined; enc.surf = undefined; enc.salt = undefined; } };

  // ------------------------------------------------------------ geometry (called at the end of buildEncGeom)
  function supplyOf(enc) {
    var s = S(), plants = X().plants, intake = false, k, t, best = null, bd = 1e9;
    for (k = 0; k < enc.tiles.length && !intake; k++) {
      t = enc.tiles[k]; var i = t % N, j = (t - i) / N;
      if ((i > 0 && isSea(t - 1) && s.tileEnc[t - 1] !== enc.id) || (i < N - 1 && isSea(t + 1) && s.tileEnc[t + 1] !== enc.id) || (j > 0 && isSea(t - N) && s.tileEnc[t - N] !== enc.id) || (j < N - 1 && isSea(t + N) && s.tileEnc[t + N] !== enc.id)) intake = true;
    }
    for (k = 0; k < plants.length; k++) {
      var p = plants[k], c = objCentre(p.o), d = dist2(c.x, c.z, enc.cx, enc.cz);
      if (d <= RD.plant.radius * RD.plant.radius * TILE * TILE && d < bd) { bd = d; best = p; }
    }
    return { intake: intake, plant: best };
  }
  R.encGeom = function (enc, E, cnt, seeSum) {
    var k, t, rl = E.rl = { feeders: [], kelp: 0, reef: 0, perch: [], pools: [], rocks: 0, trees: 0, shelters: 0, dep: null, vb: {}, ground: [] };
    if (!enc.kind) return;
    var s = S(), kind = enc.kind;
    enc.see = 1;
    // scenery that counts for the realm (aquatic items, perches, pools)
    for (k = 0; k < enc.tiles.length; k++) {
      t = enc.tiles[k]; var oid = s.tileObj[t]; if (!oid) continue;
      var o = RT().oById.get(oid); if (!o || o.kind !== 'scenery') continue;
      var fp = C.objFootprint(o); if ((fp.i0 + fp.j0 * N) !== t) continue;
      var sd = C.SC()[o.type];
      if (sd.marine === 'kelp') rl.kelp++; else if (sd.marine === 'reef') rl.reef++; else if (sd.marine === 'feeder') rl.feeders.push(t);
      if (sd.air === 'perch') rl.perch.push(t); else if (sd.air === 'pool') rl.pools.push(t);
      if (sd.kind === 'rock') rl.rocks++; if (sd.kind === 'tree') rl.trees++; if (sd.kind === 'shelter') rl.shelters++;
    }
    if (kind === 'tank') {
      var tk = RD.tank, lv = tk.levels[clamp(enc.lvl, 1, 3) - 1], wl = tk.walls[clamp(enc.wall || 1, 1, 3) - 1], by = -99;
      for (k = 0; k < enc.tiles.length; k++) { t = enc.tiles[k]; by = Math.max(by, tileHi(t)); }
      enc.depth = lv.depth; enc.sink = Math.round(lv.depth * tk.sinkK * 100) / 100; enc.by = by; enc.floor = by - enc.sink; enc.surf = enc.floor + lv.depth;
      enc.minFence = wl.strength; enc.vol = Math.round(enc.area * lv.depth * 10) / 10; enc.salt = true;
      var sup = supplyOf(enc); enc.intake = sup.intake; enc.plantId = sup.plant ? sup.plant.o.id : 0;
    } else if (kind === 'pen') {
      var fresh = 0, sea = 0, sum = 0, mxf = -99; rl.dep = new Float32Array(NN);
      for (k = 0; k < enc.tiles.length; k++) { t = enc.tiles[k]; if (isSea(t)) sea++; else fresh++; mxf = Math.max(mxf, tileFloor(t)); }
      enc.salt = sea >= fresh; enc.surf = enc.salt ? SEA_Y : mxf + SEA_Y;
      for (k = 0; k < enc.tiles.length; k++) { t = enc.tiles[k]; var dd = Math.max(0.25, enc.surf - tileAvg(t)); rl.dep[t] = dd; sum += dd; }
      enc.depth = Math.round(sum / enc.tiles.length * 100) / 100; enc.vol = Math.round(sum * 10) / 10;
    } else if (kind === 'dome') {
      var dh = RD.dome.heights[clamp(enc.lvl, 1, 3) - 1], ms = RD.dome.meshes[clamp(enc.mesh || 1, 1, 3) - 1];
      enc.H = dh.h; enc.minFence = ms.strength; enc.vol = Math.round(enc.area * dh.h * 10) / 10;
    } else if (kind === 'virtual') {
      if (enc.realm === 'air') { var bd = RD.virtual.bands[clamp(enc.band || 1, 1, 3) - 1]; enc.H = bd.h1; enc.vol = Math.round(enc.area * bd.h1 * 10) / 10; }
      if (enc.realm === 'sea') {
        var sm = 0, mf = -99; rl.dep = new Float32Array(NN);
        for (k = 0; k < enc.tiles.length; k++) { t = enc.tiles[k]; var d2 = Math.max(0.25, SEA_Y - tileAvg(t)); rl.dep[t] = d2; sm += d2; }
        enc.surf = SEA_Y; enc.salt = true; enc.depth = Math.round(sm / enc.tiles.length * 100) / 100; enc.vol = Math.round(sm * 10) / 10;
      }
      // minFence of a virtual zone is the tower's strength while the geofence is up (refreshed every second by R.secondly)
      var vs = X().vstat[enc.id]; enc.minFence = vs && vs.ok ? vs.strength : (enc.minFence || 0);
    }
    // ground tiles animals can stand on (flyers): not blocked, not cliff, not water
    if (enc.realm === 'air') for (k = 0; k < enc.tiles.length; k++) { t = enc.tiles[k]; if (!RT().block[t] && !C.cliffT(t) && s.terrain[t] !== wi()) rl.ground.push(t); }
    // fresh water counts as drinking/fish water in a dome
    if (enc.realm === 'air') { rl.waterN = E.water.length + rl.pools.length * 3; }
    // the feeding spot: the middle of the enclosure
    var best = -1, bdd = 1e9;
    for (k = 0; k < enc.tiles.length; k++) { t = enc.tiles[k]; var dx = C.cxOf(t) - enc.cx, dz = C.czOf(t) - enc.cz, d3 = dx * dx + dz * dz; if (d3 < bdd) { bdd = d3; best = t; } }
    if (best >= 0) E.feed = best;
    if (rl.ground.length) { var gb = -1, gd = 1e9; for (k = 0; k < rl.ground.length; k++) { t = rl.ground[k]; var gx = C.cxOf(t) - enc.cx, gz = C.czOf(t) - enc.cz, gq = gx * gx + gz * gz; if (gq < gd) { gd = gq; gb = t; } } E.feed = gb; }
  };
  // viewing: tunnels / walks inside or next to the enclosure are perfect viewing spots (E.plat), with a viewing multiplier E.rl.vb
  var WALKVB = { tunnel: 1.75, pier: 1.4, mesh: 1.55, sky: 1.7 };
  R.encView = function (enc, vt, E) {
    var rl = E.rl; if (!rl || !enc.kind) return;
    var s = S(), seen = {}, k, d, t, w, st = RT();
    function add(t2) {
      w = walkAt(t2); if (!w) return; var m = enc.kind, ok = false;
      if (w === 'tunnel') ok = m === 'tank' || m === 'pen' || (m === 'virtual' && enc.realm === 'sea');
      else if (w === 'pier') ok = m === 'pen' || (m === 'virtual' && enc.realm === 'sea') || m === 'tank';
      else if (w === 'mesh') ok = m === 'dome' || (m === 'virtual' && enc.realm === 'air');
      else if (w === 'sky') ok = m === 'virtual' || m === 'dome';
      if (!ok) return;
      E.plat[t2] = 1; rl.vb[t2] = Math.max(rl.vb[t2] || 0, WALKVB[w] || 1.4); if (vt.indexOf(t2) < 0) vt.push(t2);
    }
    for (k = 0; k < enc.tiles.length; k++) {
      t = enc.tiles[k]; add(t); var i = t % N, j = (t - i) / N;
      if (i > 0) add(t - 1); if (i < N - 1) add(t + 1); if (j > 0) add(t - N); if (j < N - 1) add(t + N);
    }
    // platform-type buildings (galleries, grandstands, towers) near the enclosure
    for (k = 0; k < st.platforms.length; k++) {
      var pl = st.platforms[k], def = BD()[pl.o.type], vb = def && def.realm === 'gallery' ? 1.6 : def && def.realm === 'grandstand' ? 1.4 : def && def.realm === 'tower' ? 1.55 : 0;
      if (!vb) continue;
      for (d = 0; d < pl.front.length; d++) if (E.plat[pl.front[d]]) rl.vb[pl.front[d]] = Math.max(rl.vb[pl.front[d]] || 0, vb);
    }
  };
  R.viewMul = function (e, E, g) {
    var vb = E.rl && E.rl.vb && E.rl.vb[g.ti], m = vb || 1;
    if (e.kind === 'virtual') m *= 1.12;   // no fence in the way
    return m;
  };

  R.watchThought = function (g, e, E) {
    if (g.thoughtT > 0 || g.tcool > 0 || !rng.chance(0.08)) return;
    var w = walkAt(g.ti), key = w === 'tunnel' || w === 'pier' ? 'tunnel' : w === 'mesh' ? 'aviary' : w === 'sky' ? 'virtual' : e.kind === 'virtual' ? 'virtual' : E.plat[g.ti] && E.rl && E.rl.vb[g.ti] >= 1.5 ? 'gallery' : e.kind === 'dome' ? 'aviary' : 'tunnel';
    C.say(g, key, e.species[0]);
  };

  // ============================================================ update (after the enclosures are rebuilt)
  R.update = function () {
    var x = X(), k, s = S();
    x.plants = []; x.towers = []; x.boats = 0; x.drones = 0;
    for (k = 0; k < s.objects.length; k++) {
      var o = s.objects[k]; if (o.kind !== 'building') continue;
      var d = BD()[o.type]; if (!d || !d.realm) continue;
      if (d.realm === 'plant') x.plants.push({ o: o, cap: RD.plant.capacity });
      else if (o.type === 'tagging_tower') { if (!o.lvl) o.lvl = 1; x.towers.push({ o: o, lvl: o.lvl }); }
      else if (d.realm === 'boat') x.boats++; else if (d.realm === 'drone') x.drones++;
    }
    x.ver++;
    R.refresh();
    bus.emit('realms');
  };

  // ============================================================ tanks: supply & water quality, towers: coverage & power
  R.refresh = function () {
    var s = S(), x = X(), k, q, encs = s.enclosures, plantLoad = {};
    // plants: nearest plant within radius serves a tank until its capacity is used
    var tanks = encs.filter(function (e) { return e.kind === 'tank'; });
    for (k = 0; k < tanks.length; k++) {
      var e = tanks[k], sup = supplyOf(e), P = sup.plant;
      e.intake = sup.intake; e.plantId = P ? P.o.id : 0; e.over = false; e.filter = 'none';
      if (P) {
        plantLoad[P.o.id] = (plantLoad[P.o.id] || 0) + (e.vol || 0);
        if (plantLoad[P.o.id] > P.cap) e.over = true;
        e.filter = powered(P.o) ? (e.over ? 'over' : 'ok') : 'off';
      }
      e.supplied = !!(e.intake || (P && e.filter !== 'off') || (P && e.filter === 'off' && e.intake));
    }
    // towers: pick one that covers every tile of each virtual zone, or combine multiple overlapping towers for massive connected zones
    var used = {}, vz = encs.filter(function (e) { return e.kind === 'virtual'; });
    for (k = 0; k < vz.length; k++) {
      var z = vz[k], best = null, bc = -1, bdist = 1e9, ov = [];
      for (q = 0; q < x.towers.length; q++) {
        var tw = x.towers[q], td = RD.virtual.towers[clamp(tw.o.lvl || 1, 1, 3) - 1], c = objCentre(tw.o), r2 = td.radius * td.radius * TILE * TILE, inn = 0;
        for (var u = 0; u < z.tiles.length; u++) { var tt = z.tiles[u]; if (dist2(C.cxOf(tt), C.czOf(tt), c.x, c.z) <= r2) inn++; }
        var cov = z.tiles.length ? inn / z.tiles.length : 0, dd = dist2(c.x, c.z, z.cx, z.cz);
        if (inn > 0) ov.push({ tw: tw, td: td, c: c, r2: r2, cov: cov, dd: dd, pw: powered(tw.o) });
        if (cov > bc + 1e-6 || (Math.abs(cov - bc) < 1e-6 && dd < bdist)) { bc = cov; bdist = dd; best = tw; }
      }
      var st = { tower: best ? best.o.id : 0, towers: best ? [best.o.id] : [], towerCount: best ? 1 : 0, cover: bc < 0 ? 0 : bc, ok: false, reasons: [], powered: false, strength: 0, cap: 0 };
      if (!best) st.reasons.push('No tagging tower in range');
      else if (bc >= 0.999 || ov.length <= 1) {
        var td2 = RD.virtual.towers[clamp(best.o.lvl || 1, 1, 3) - 1];
        st.strength = td2.strength; st.cap = td2.capacity; st.lvl = best.o.lvl || 1; st.powered = powered(best.o);
        used[best.o.id] = (used[best.o.id] || 0) + z.animals.length;
        st.used = used[best.o.id];
        if (!st.powered) st.reasons.push('The tagging tower has no power: the geofence is down');
        if (st.cover < 0.999) st.reasons.push('The tower range does not cover the whole zone (' + Math.round((1 - st.cover) * 100) + '% outside)');
        if (st.used > td2.capacity) st.reasons.push('The tower can only tag ' + td2.capacity + ' animals');
        st.ok = st.powered && st.cover >= 0.999 && st.used <= td2.capacity;
      } else {
        // Multi-tower union coverage for massive connected zones
        var allInn = 0, pwrInn = 0, pwrOv = ov.filter(function (v) { return v.pw; });
        for (var u2 = 0; u2 < z.tiles.length; u2++) {
          var t2 = z.tiles[u2], tx = C.cxOf(t2), tz = C.czOf(t2), hitAll = false, hitPwr = false;
          for (q = 0; q < ov.length; q++) {
            if (dist2(tx, tz, ov[q].c.x, ov[q].c.z) <= ov[q].r2) { hitAll = true; if (ov[q].pw) { hitPwr = true; break; } }
          }
          if (hitAll) allInn++;
          if (hitPwr) pwrInn++;
        }
        var allCov = z.tiles.length ? allInn / z.tiles.length : 0;
        var pwrCov = z.tiles.length ? pwrInn / z.tiles.length : 0;
        var active = (pwrCov >= 0.999 && pwrOv.length) ? pwrOv : ov;
        var minStr = 99, minLvl = 99, capSum = 0, usedSum = 0, share = Math.ceil(z.animals.length / active.length);
        st.towers = [];
        for (q = 0; q < active.length; q++) {
          var av = active[q];
          st.towers.push(av.tw.o.id);
          if (av.td.strength < minStr) minStr = av.td.strength;
          if ((av.tw.o.lvl || 1) < minLvl) minLvl = av.tw.o.lvl || 1;
          capSum += av.td.capacity;
          used[av.tw.o.id] = (used[av.tw.o.id] || 0) + share;
          usedSum += used[av.tw.o.id];
        }
        st.tower = active[0].tw.o.id;
        st.towerCount = active.length;
        st.cover = allCov;
        st.strength = minStr < 99 ? minStr : 0;
        st.lvl = minLvl < 99 ? minLvl : 1;
        st.cap = capSum;
        st.used = usedSum;
        st.powered = pwrOv.length > 0 && (pwrCov >= 0.999 || allCov < 0.999 && pwrOv.length === ov.length);
        if (!st.powered) st.reasons.push('A tagging tower has no power: the geofence is down');
        if (st.cover < 0.999) st.reasons.push('The tower range does not cover the whole zone (' + Math.round((1 - st.cover) * 100) + '% outside)');
        if (st.used > st.cap) st.reasons.push('The towers can only tag ' + st.cap + ' animals');
        st.ok = st.powered && pwrCov >= 0.999 && st.cover >= 0.999 && st.used <= st.cap;
      }
      x.vstat[z.id] = st; z.minFence = st.ok ? st.strength : 0; z.down = !st.ok;
    }
  };

  // ============================================================ containment status API
  function strengthOf(enc) { return enc.minFence || 0; }
  R.holds = function (enc, a) {
    if (!enc.kind) return true;
    var n = R.needs(C.SP()[a.species]), need = Math.max(C.aMinFence(a), n.minStr);
    if (enc.kind === 'virtual') { var vs = X().vstat[enc.id]; return !!(vs && vs.ok && a.tag && vs.strength >= need + (n.tagResist > 1.2 ? 1 : 0)); }
    if (enc.breach > 0) return false;
    return strengthOf(enc) >= need;
  };
  // {ok, reasons[], kind, powered, strength}  (UI and other agents: news, tutorial)
  R.containmentStatus = function (encId) {
    var enc = C.encById(encId); if (!enc) return { ok: false, reasons: ['No such enclosure'], kind: null };
    var reasons = [], kind = enc.kind || 'land', sp, k, n, a, ok = true, pw = true;
    if (!enc.kind) { return { ok: true, reasons: [], kind: 'land', powered: true, strength: enc.minFence }; }
    var x = X();
    if (kind === 'virtual') {
      var vs = x.vstat[enc.id] || { ok: false, reasons: ['No tagging tower in range'], powered: false };
      pw = !!vs.powered; ok = !!vs.ok; for (k = 0; k < vs.reasons.length; k++) reasons.push(vs.reasons[k]);
      var un = 0; for (k = 0; k < enc.animals.length; k++) { a = RT().aById.get(enc.animals[k]); if (a && !a.tag) un++; }
      if (un) { ok = false; reasons.push(un + ' animal' + (un > 1 ? 's' : '') + ' without a working tag'); }
    } else {
      if (enc.breach > 0) { ok = false; reasons.push('The barrier is damaged'); }
      if (kind === 'tank') { pw = enc.filter !== 'off'; if (enc.filter === 'off') reasons.push('Filtration is off: the water quality is falling'); if (!enc.supplied) { reasons.push('No salt water supply'); } if (enc.wq !== undefined && enc.wq < 0.4) reasons.push('Poor water quality'); }
      if (kind === 'dome' && RS().forced) { reasons.push('Door locks are on battery: a small escape risk at the airlock'); pw = false; }
      for (k = 0; k < enc.species.length; k++) {
        sp = C.SP()[enc.species[k]]; n = R.needs(sp);
        if (strengthOf(enc) < Math.max(sp.minFence, n.minStr)) { ok = false; reasons.push('The ' + (kind === 'dome' ? 'mesh' : kind === 'tank' ? 'wall' : 'net') + ' is too weak for ' + lc(sp.name) + ' (needs strength ' + Math.max(sp.minFence, n.minStr) + ')'); }
      }
    }
    return { ok: ok, reasons: reasons, kind: kind, powered: pw, strength: enc.minFence || 0 };
  };
  R.zoneInfo = function (encId) { var enc = C.encById(encId); return enc ? X().vstat[enc.id] || null : null; };

  // rules for putting an animal into an enclosure. undefined = ordinary land rules apply, string = refusal, null = fine (realm rules replace the land rules)
  R.spotCheck = function (sp, enc, t) {
    var rl = realmOf(sp), kind = enc.kind;
    var nm = lc(sp.name), n = R.needs(sp);
    if (!kind) {
      if (rl === 'land') return undefined;
      return rl === 'sea' ? 'Marine animals need a lagoon tank, a sea pen or a virtual sea zone (' + nm + ')' : 'Flying animals need an Aviary or a virtual sky zone (' + nm + ')';
    }
    if (rl === 'land') {
      if (kind === 'virtual' && enc.realm === 'land') { var m0 = virtualAdmit(enc, sp); return m0 || undefined; }
      return 'Land animals cannot live in a ' + R.kindName(enc) + '. Use a fenced paddock or a virtual land zone';
    }
    if (rl !== enc.realm) return (rl === 'sea' ? 'Marine animals live in tanks, sea pens and virtual sea zones' : 'Flying animals live in the Aviary and virtual sky zones') + ': a ' + R.kindName(enc) + ' is not right for ' + nm;
    var msg;
    if (kind === 'virtual') { msg = virtualAdmit(enc, sp); if (msg) return msg; }
    if (rl === 'sea') {
      if (kind === 'tank' && !enc.supplied) return 'This tank has no salt water yet: put it beside the sea or within reach of a filtration plant';
      if (!enc.salt && !n.fresh) return 'This is fresh water and ' + nm + ' need salt water';
      if (kind === 'tank' && enc.filter === 'off') return 'The filtration plant has no power';
    }
    var cmp = C.compatible(enc, sp.id); if (cmp) return cmp;
    var am = C.animalMetrics(sp);
    if (enc.inscribedSpan !== undefined && enc.inscribedSpan < am.minSpan) return 'Enclosure is too narrow for ' + nm + ' (needs at least ' + am.minSpan + '×' + am.minSpan + ' open tiles)';
    if (rl === 'air' && kind === 'dome' && enc.H < n.needH * 0.55) return 'The dome is too low for ' + nm;
    if (kind !== 'virtual' && strengthOf(enc) < Math.max(sp.minFence, n.minStr) - 1) return 'The ' + (kind === 'dome' ? 'mesh' : kind === 'tank' ? 'tank wall' : 'net') + ' is far too weak for ' + nm + ' (strength ' + Math.max(sp.minFence, n.minStr) + ' needed)';
    if (rl === 'sea' && kind === 'pen' && S().terrain[t] !== wi()) return 'Pick a water tile of the pen';
    return null;
  };
  function virtualAdmit(enc, sp) {
    var vs = X().vstat[enc.id];
    if (!vs || !vs.tower) return 'This virtual zone has no tagging tower in range: build one first';
    if (!vs.powered) return 'The tagging tower has no power';
    if (vs.cover < 0.999) return 'The tower does not reach the whole zone';
    if (vs.used + 1 > vs.cap) return 'The tagging tower is at capacity (' + vs.cap + ' animals): upgrade it';
    var tag = R.needs(sp).tagCost; if (S().money < tag) return 'Fitting a tag costs ' + fmt(tag);
    return null;
  }
  // moving an animal between enclosures: same enclosure is always fine for its realm; otherwise the full spot check
  R.moveCheck = function (sp, enc, t, same) {
    var rl = realmOf(sp);
    if (same) { if (!enc.kind && rl === 'land') return undefined; if (rl === 'land' && enc.kind !== 'virtual') return undefined; return rl === 'land' && enc.realm === 'land' ? undefined : null; }
    var r = R.spotCheck(sp, enc, t);
    if (r === undefined && enc.kind === 'virtual') return undefined;
    return r;
  };
  // an escaped animal that settled in an enclosure again: clear the escape flags
  R.landed = function (a) { a.er = null; a.wb = undefined; a.bolt = 0; a.btx = undefined; a.bp = 0; if (realmOf(C.SP()[a.species]) === 'land') a.y = 0; };
  // wrong realm for this enclosure? (re-homing and recapture must not put a swimmer in a paddock)
  R.realmOK = function (enc, spId) { var sp = C.SP()[spId], rl = realmOf(sp); if (!enc.kind) return rl === 'land'; if (rl === 'land') return enc.kind === 'virtual' && enc.realm === 'land'; return rl === enc.realm; };
  R.homeOK = function (a, enc) { return R.realmOK(enc, a.species); };
  R.noBreach = function (enc) { return !!(enc.kind === 'tank' || enc.kind === 'dome' || enc.kind === 'virtual'); };   // storms cannot breach these (physical walls / no barrier)
  // tunnel / mesh walks etc. are never inside land paddocks
  R.pathCheck = function (t) {
    var enc = C.encOfTile(t);
    if (enc && enc.kind) return 'Walkways through ' + R.kindName(enc) + 's are built with the special Tunnel and Walk tools';
    return null;
  };

  // ============================================================ placement of tanks, domes, virtual zones
  function params(kind, realm, p) { p = p || {}; return kind + '|' + realm + '|' + (p.lvl || 1) + '|' + (p.wall || 0) + '|' + (p.mesh || 0) + '|' + (p.band || 0); }
  function defKey(d) { return params(d.kind, d.realm, d); }
  function tileBad(kind, realm, t, tset) {
    var s = S(), rt = RT(), i = t % N, j = (t - i) / N, W = wi();
    if (!C.inMap(i, j)) return 'Outside your land';
    if (C.entranceTile(i, j) && (kind !== 'virtual' || realm === 'land')) return 'Keep the entrance plaza clear';
    if (s.path[t]) return 'Clear the path first';
    if (rt.block[t] && kind !== 'dome' && kind !== 'virtual') return 'Something is in the way';
    var oid = s.tileObj[t];
    if (oid) {
      var o = rt.oById.get(oid);
      if (o) {
        if (o.kind === 'building') {
          var bdef = BD()[o.type];
          if (!(bdef && bdef.inEnclosure && (kind === 'virtual' || kind === 'dome'))) return 'Clear the ' + (bdef ? bdef.name.toLowerCase() : 'building') + ' first';
        } else if (kind === 'tank') {
          return 'Clear the scenery first';
        } else {
          var sdef = C.SC()[o.type];
          if (sdef && sdef.inEnclosure === false) return 'Clear the ' + sdef.name.toLowerCase() + ' first';
        }
      }
    }
    if (s.ditch[t]) return 'Fill the ditch in first';
    for (var d = 0; d < 4; d++) { if (netAt(i, j, d)) return 'Remove the fence along this tile first'; }
    if (s.tileEnc[t] && !(tset && tset[t])) return 'Already inside an enclosure';
    var sea = isSea(t);
    if (kind === 'tank' && (s.terrain[t] === W || sea)) return 'A lagoon tank needs dry land';
    if (kind === 'virtual' && realm === 'sea' && !sea) return 'A sea zone must be painted on sea water';
    if (kind === 'virtual' && realm === 'land' && sea) return 'A land zone cannot be painted on the sea';
    if (kind === 'virtual' && realm === 'land' && C.cliffT(t) && false) return 'Too steep';
    if (kind === 'dome' && sea) return 'The Aviary stands on land or fresh water';
    return null;
  }
  function paramsCost(kind, realm, p, n, edges) {
    if (kind === 'tank') { var lv = RD.tank.levels[p.lvl - 1], wl = RD.tank.walls[p.wall - 1]; return Math.round(n * lv.cost + edges * wl.cost); }
    if (kind === 'dome') { var h = RD.dome.heights[p.lvl - 1], m = RD.dome.meshes[p.mesh - 1]; return Math.round(n * h.cost * m.mult + edges * 20); }
    var vz = RD.virtual, mul = realm === 'air' ? vz.bands[(p.band || 1) - 1].mul : 1;
    return Math.round(n * vz.tileCost[realm === 'air' ? 'sky' : realm] * mul);
  }
  function starNeeded(kind, realm) { return kind === 'tank' ? 2 : kind === 'dome' ? 3 : realm === 'air' ? 4 : 3; }
  R.starNeeded = starNeeded;
  // plan: tiles = [t...]; p = {lvl, wall, mesh, band}
  R.place = function (kind, realm, tiles, p, opts) {
    var dry = C.dryOf(arguments), s = S(), rs = RS(), k, q;
    p = p || {};
    if (kind === 'tank') { p.lvl = clamp(p.lvl || 1, 1, 3); p.wall = clamp(p.wall || 1, 1, 3); realm = 'sea'; }
    else if (kind === 'dome') { p.lvl = clamp(p.lvl || 2, 1, 3); p.mesh = clamp(p.mesh || 1, 1, 3); realm = 'air'; }
    else { kind = 'virtual'; realm = realm || 'land'; p.band = realm === 'air' ? clamp(p.band || 1, 1, 3) : 0; p.lvl = 1; }
    var need = starNeeded(kind, realm); if (need > s.unlocked.star) return fail('Needs a ' + need + '-star park');
    var seen = {}, nt = []; for (k = 0; k < tiles.length; k++) { if (!seen[tiles[k]]) { seen[tiles[k]] = 1; nt.push(tiles[k]); } }
    tiles = nt; if (!tiles.length) return fail('Nothing selected');
    // merge target: an adjacent definition of the same kind and parameters
    var want = params(kind, realm, p), merge = [], own = {}, qd, m;
    for (k = 0; k < rs.defs.length; k++) {
      var df = rs.defs[k]; if (defKey(df) !== want) continue;
      var set = {}; for (q = 0; q < df.tiles.length; q++) set[df.tiles[q]] = 1;
      var touch = false;
      for (q = 0; q < tiles.length && !touch; q++) { var tq = tiles[q], i = tq % N, j = (tq - i) / N; if (set[tq] || (i > 0 && set[tq - 1]) || (i < N - 1 && set[tq + 1]) || (j > 0 && set[tq - N]) || (j < N - 1 && set[tq + N])) touch = true; }
      if (touch) { merge.push(df); for (q = 0; q < df.tiles.length; q++) own[df.tiles[q]] = 1; }
    }
    var fresh = [], bad = null;
    for (k = 0; k < tiles.length; k++) {
      if (own[tiles[k]]) continue;
      var b = tileBad(kind, realm, tiles[k], own); if (b) { bad = b; break; } fresh.push(tiles[k]);
    }
    if (bad) return fail(bad);
    if (!fresh.length) return fail('Already built here');
    var total = fresh.length; for (k = 0; k < merge.length; k++) total += merge[k].tiles.length;
    var cap = kind === 'tank' ? RD.tank.maxTiles : kind === 'dome' ? RD.dome.maxTiles : RD.virtual.maxTiles;
    if (total > cap) return fail('Too large: at most ' + cap + ' tiles');
    if (kind === 'tank') {   // flat ground: the tank floor is level
      var mn = 99, mx = -99; var all = fresh.slice(); for (k = 0; k < merge.length; k++) all = all.concat(merge[k].tiles);
      for (k = 0; k < all.length; k++) { mn = Math.min(mn, tileFloor(all[k])); mx = Math.max(mx, tileHi(all[k])); }
      if (mx - mn > 1.6) return fail('Too uneven: level the ground first (within about 3 levels)');
    }
    var fset = {}; for (k = 0; k < fresh.length; k++) fset[fresh[k]] = 1;
    var edges = 0; for (k = 0; k < fresh.length; k++) { var te = fresh[k], ie = te % N, je = (te - ie) / N; if (!(ie > 0 && (fset[te - 1] || own[te - 1]))) edges++; if (!(ie < N - 1 && (fset[te + 1] || own[te + 1]))) edges++; if (!(je > 0 && (fset[te - N] || own[te - N]))) edges++; if (!(je < N - 1 && (fset[te + N] || own[te + N]))) edges++; }
    var cost = paramsCost(kind, realm, p, fresh.length, edges);
    if (S().money < cost) return fail('Not enough money (' + fmt(cost) + ' needed)');
    var info = { n: fresh.length, merged: merge.length, edges: edges, total: total };
    if (dry) return okr(cost, info);
    var before = JSON.stringify(rs.defs), box = [N, N, 0, 0];
    var def;
    if (merge.length) {
      def = merge[0]; for (k = 1; k < merge.length; k++) { def.tiles = def.tiles.concat(merge[k].tiles); def.paid += merge[k].paid; rs.defs.splice(rs.defs.indexOf(merge[k]), 1); }
      def.tiles = def.tiles.concat(fresh); def.paid += cost;
    } else { def = { id: C.newEncId(), kind: kind, realm: realm, tiles: fresh.slice(), lvl: p.lvl, wall: p.wall || 0, mesh: p.mesh || 0, band: p.band || 0, paid: cost }; rs.defs.push(def); }
    for (k = 0; k < def.tiles.length; k++) { var tb = def.tiles[k], bi = tb % N, bj = (tb - bi) / N; box[0] = Math.min(box[0], bi); box[1] = Math.min(box[1], bj); box[2] = Math.max(box[2], bi); box[3] = Math.max(box[3], bj); }
    C.spend(cost, 'construction');
    var after = JSON.stringify(rs.defs);
    C.jBegin('Build ' + NAMEC[kind].toLowerCase());
    C.jOp({ k: 'x', net: cost, chk: function () { return JSON.stringify(RS().defs) === after ? null : 'That area has changed since, so this cannot be undone'; }, ap: function () { RS().defs = JSON.parse(before); bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] }); } });
    C.jEnd();
    bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] });
    C.world(false);
    info.id = def.id;
    return okr(cost, info);
  };
  R.removeDef = function (encId, opts) {
    var dry = C.dryOf(arguments), rs = RS(), def = defById(encId); if (!def) return fail('Nothing to remove here');
    var enc = C.encById(encId); if (enc && enc.animals.length) return fail('Move the animals out first');
    for (var k = 0; k < S().research.eggs.length; k++) { var eg = S().research.eggs[k]; if (S().tileEnc[eg.i + eg.j * N] === encId) return fail('An egg is waiting in there'); }
    for (k = 0; k < def.tiles.length; k++) if (S().path[def.tiles[k]] && walkAt(def.tiles[k])) return fail('Remove the walkway first');
    var refund = Math.floor((def.paid || 0) * 0.5);
    if (dry) return okr(-refund);
    var before = JSON.stringify(rs.defs), box = [N, N, 0, 0];
    for (k = 0; k < def.tiles.length; k++) { var tb = def.tiles[k], bi = tb % N, bj = (tb - bi) / N; box[0] = Math.min(box[0], bi); box[1] = Math.min(box[1], bj); box[2] = Math.max(box[2], bi); box[3] = Math.max(box[3], bj); }
    rs.defs.splice(rs.defs.indexOf(def), 1); C.earn(refund, 'construction');
    var after = JSON.stringify(rs.defs);
    C.jBegin('Remove ' + def.kind); C.jOp({ k: 'x', net: -refund, chk: function () { return JSON.stringify(RS().defs) === after ? null : 'Changed since'; }, ap: function () { RS().defs = JSON.parse(before); bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] }); } }); C.jEnd();
    bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] });
    C.world(false);
    return okr(-refund);
  };
  // bulldozer on a tile of a tank / dome / zone (called from bulldoze when nothing else is there)
  R.bulldozeTile = function (i, j, dry) {
    var t = i + j * N, enc = C.encOfTile(t); if (!enc || !enc.kind || enc.kind === 'pen') return null;
    return R.removeDef(enc.id, dry ? { dry: true } : null);
  };
  // scenery with aquatic: true lives in sea realms; everything else needs dry land. returns an error string or null
  R.sceneryCheck = function (def, t) {
    var enc = C.encOfTile(t), onWater = S().terrain[t] === wi();
    if (def.aquatic) { if (!enc || enc.realm !== 'sea') return 'Kelp, reefs and feeders go inside a tank, sea pen or virtual sea zone'; return null; }
    if (def.air) { if (!enc || enc.realm !== 'air') return 'This belongs in an Aviary or a virtual sky zone'; return null; }
    return undefined;
  };

  // ============================================================ walks: tunnels, mesh walks, piers, skywalks
  var WALKID = { tunnel: 'acrylic_tunnel', mesh: 'mesh_walk', pier: 'glass_pier', sky: 'skywalk' };
  R.walkTypes = function () { return ['tunnel', 'mesh', 'pier', 'sky'].map(function (w) { var d = D.paths.filter(function (p) { return p.walk === w; })[0]; return { walk: w, id: d.id, name: d.name, cost: d.cost, blurb: d.blurb }; }); };
  function walkTileBad(w, t, inside) {
    var s = S(), rt = RT(), i = t % N, j = (t - i) / N, enc = C.encOfTile(t), W = wi();
    if (!C.inMap(i, j)) return 'Outside your land';
    if (s.path[t] && walkAt(t) === w) return null;
    if (s.path[t]) return 'There is already a path here';
    if (s.tileObj[t]) { var o = rt.oById.get(s.tileObj[t]); if (o && (o.kind === 'building' || rt.block[t])) return 'Something is in the way'; }
    if (s.ditch[t]) return 'Fill the ditch in first';
    if (C.cliffT(t)) return 'Too steep';
    var sea = isSea(t);
    if (enc) {
      if (!enc.kind) return 'Not inside a land paddock';
      var ok = false;
      if (w === 'tunnel') ok = enc.kind === 'tank' || enc.kind === 'pen' || (enc.kind === 'virtual' && enc.realm === 'sea');
      else if (w === 'pier') ok = enc.kind === 'pen' || (enc.kind === 'virtual' && enc.realm === 'sea');
      else if (w === 'mesh') ok = enc.kind === 'dome' || (enc.kind === 'virtual' && enc.realm === 'air');
      else if (w === 'sky') ok = enc.kind === 'virtual' && enc.realm !== 'sea' || enc.kind === 'dome';
      if (!ok) return 'This walkway cannot cross a ' + R.kindName(enc);
      return null;
    }
    if (s.terrain[t] === W) return 'Open water: the walkway can only cross a tank, pen or sea zone';
    if (s.tileEnc[t]) return 'Already inside an enclosure';
    return null;
  }
  // tiles: ordered list of tile indices (a straight run). returns cost info; walkId = 'tunnel' | 'mesh' | 'pier' | 'sky'
  R.placeWalk = function (tiles, w, opts) {
    var dry = C.dryOf(arguments), s = S(), pid = 0, k, def = D.paths.filter(function (p) { return p.walk === w; })[0];
    if (!def) return fail('Unknown walkway'); pid = D.paths.indexOf(def) + 1;
    var inEnc = 0, newT = [], cost = 0;
    var star = w === 'tunnel' ? 2 : w === 'pier' ? 2 : w === 'mesh' ? 3 : 3; if (star > s.unlocked.star) return fail('Needs a ' + star + '-star park');
    for (k = 0; k < tiles.length; k++) {
      var t = tiles[k], bad = walkTileBad(w, t); if (bad) return fail(bad);
      var enc = C.encOfTile(t); if (enc && enc.kind) inEnc++;
      if (s.path[t] !== pid) { newT.push(t); cost += def.cost; }
    }
    if (!inEnc) return fail(w === 'tunnel' ? 'A tunnel must run through a lagoon tank, sea pen or virtual sea zone' : w === 'mesh' ? 'A mesh walk must run through an Aviary or sky zone' : w === 'pier' ? 'A pier must cross a sea pen' : 'A skywalk must run through a virtual zone');
    if (!newT.length) return fail('Already built');
    if (s.money < cost) return fail('Not enough money (' + fmt(cost) + ' needed)');
    // connection hint: does the run touch an ordinary path at an end?
    var touch = false, ends = [tiles[0], tiles[tiles.length - 1]];
    for (k = 0; k < ends.length; k++) { var e = ends[k], ei = e % N, ej = (e - ei) / N; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) { var x = ei + dd[0], y = ej + dd[1]; if (Z.inb(x, y) && s.path[x + y * N] && !walkAt(x + y * N) && s.tileEnc[x + y * N] === 0) touch = true; }); }
    var info = { n: newT.length, inside: inEnc, warn: touch ? '' : 'Not joined to a path yet: join both ends to a normal path' };
    if (dry) return okr(cost, info);
    var before = {}, afterV = {}; for (k = 0; k < newT.length; k++) { before[newT[k]] = s.path[newT[k]]; afterV[newT[k]] = pid; s.path[newT[k]] = pid; }
    C.spend(cost, 'construction');
    var box = [N, N, 0, 0]; for (k = 0; k < newT.length; k++) { var bi = newT[k] % N, bj = (newT[k] - bi) / N; box[0] = Math.min(box[0], bi); box[1] = Math.min(box[1], bj); box[2] = Math.max(box[2], bi); box[3] = Math.max(box[3], bj); }
    C.jBegin('Build ' + def.name.toLowerCase());
    C.jOp({ k: 'x', net: cost, chk: function (W) { for (var q = 0; q < newT.length; q++) if (W.path[newT[q]] !== pid) return 'The walkway has changed since, so this cannot be undone'; for (q = 0; q < newT.length; q++) W.path[newT[q]] = before[newT[q]]; return null; },
      ap: function () { for (var q = 0; q < newT.length; q++) { S().path[newT[q]] = before[newT[q]]; S().dirt[newT[q]] = 0; } bus.emit('path', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] }); bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] }); } });
    C.jEnd();
    bus.emit('path', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] }); bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] });
    C.world(true);
    return okr(cost, info);
  };
  // safe tiles: guests may stand here inside enclosures. Later agents (safari vehicles, boats) mark vehicle routes with markSafe(tiles, 'owner').
  R.safeTiles = function () {
    var s = S(), out = [], t, x = X(); if (!x.safeExtra) x.safeExtra = {};
    for (t = 0; t < NN; t++) if (s.path[t] && walkAt(t) && s.tileEnc[t]) out.push(t);
    for (var key in x.safeExtra) { var arr = x.safeExtra[key]; for (var k = 0; k < arr.length; k++) out.push(arr[k]); }
    return out;
  };
  R.isSafe = function (t) { var x = X(); if (S().path[t] && walkAt(t)) return true; if (x.safeExtra) for (var key in x.safeExtra) if (x.safeExtra[key].indexOf(t) >= 0) return true; return false; };
  R.markSafe = function (owner, tiles) { var x = X(); if (!x.safeExtra) x.safeExtra = {}; if (tiles && tiles.length) x.safeExtra[owner] = tiles.slice(); else delete x.safeExtra[owner]; bus.emit('realms'); };
  R.pathAllowed = function (t) { return R.pathCheck(t); };
  R.tunnelTiles = function () { var s = S(), out = []; for (var t = 0; t < NN; t++) if (s.path[t] && walkAt(t)) out.push(t); return out; };

  // ============================================================ placement helpers for objects (tower upgrade, plant range)
  R.upgradeTower = function (objId, opts) {
    var dry = C.dryOf(arguments), o = RT().oById.get(objId); if (!o || o.type !== 'tagging_tower') return fail('Not a tagging tower');
    var lvl = o.lvl || 1; if (lvl >= 3) return fail('Already at the highest level');
    var td = RD.virtual.towers[lvl]; if (S().money < td.upgrade) return fail('Not enough money (' + fmt(td.upgrade) + ' needed)');
    if (dry) return okr(td.upgrade, { lvl: lvl + 1, radius: td.radius, capacity: td.capacity, strength: td.strength });
    o.lvl = lvl + 1; C.spend(td.upgrade, 'construction'); C.msg('The tagging tower was upgraded: range ' + td.radius + ' tiles, ' + td.capacity + ' animals, strength ' + td.strength + '.', 'good');
    R.update(); return okr(td.upgrade, { lvl: o.lvl });
  };
  R.towerInfo = function (objId) {
    var o = RT().oById.get(objId); if (!o || o.type !== 'tagging_tower') return null;
    var lvl = o.lvl || 1, td = RD.virtual.towers[lvl - 1], next = lvl < 3 ? RD.virtual.towers[lvl] : null, zones = [], used = 0;
    S().enclosures.forEach(function (e) { if (e.kind === 'virtual') { var vs = X().vstat[e.id]; if (vs && (vs.tower === objId || (vs.towers && vs.towers.indexOf(objId) >= 0))) { zones.push({ id: e.id, name: e.name, animals: e.animals.length, ok: vs.ok }); used += e.animals.length; } } });
    return { lvl: lvl, radius: td.radius, capacity: td.capacity, strength: td.strength, used: used, powered: powered(o), zones: zones, next: next ? { cost: next.upgrade, radius: next.radius, capacity: next.capacity, strength: next.strength } : null };
  };
  R.plantInfo = function (objId) {
    var o = RT().oById.get(objId); if (!o || o.type !== 'filtration_plant') return null;
    var tanks = S().enclosures.filter(function (e) { return e.kind === 'tank' && e.plantId === objId; }), vol = 0; tanks.forEach(function (e) { vol += e.vol || 0; });
    return { powered: powered(o), radius: RD.plant.radius, capacity: RD.plant.capacity, load: Math.round(vol), tanks: tanks.map(function (e) { return { id: e.id, name: e.name, vol: e.vol, wq: e.wq === undefined ? 1 : e.wq }; }) };
  };
  R.objectInfo = function (objId) { return R.towerInfo(objId) || R.plantInfo(objId); };
  R.tagCost = function (spId) { return R.needs(spId).tagCost; };

  // ============================================================ power events
  // on: boolean or the bus event {on, cause, tiles}; false drops every geofence at once and cuts filtration (call onPower(true) to restore). Also re-checks after a real power change.
  R.onPower = function (on) {
    var ev = on && typeof on === 'object' ? on : null, state = ev ? ev.on : !!on, rs = RS();
    if (!ev) rs.forced = !state;
    R.refresh();
    var down = S().enclosures.filter(function (e) { return e.kind === 'virtual' && e.down && e.animals.length; });
    if (!state && down.length) C.msg('Power loss: the geofence of ' + down.map(function (e) { return e.name; }).join(', ') + ' is down. The animals can walk out!', 'bad');
    else if (state && !ev) C.msg('Power restored: the tagging towers and filtration plants are back on.', 'good', false);
    bus.emit('realmPower', { on: state, down: down.map(function (e) { return e.id; }) });
    R.secondly(true);
  };
  bus.on('power', function (ev) { if (ev && ev.on !== undefined && typeof ev.on === 'boolean') { R.refresh(); R.secondly(true); } });

  R.helpers = { tileFloor: tileFloor, tileAvg: tileAvg, isSea: isSea, defById: defById, supplyOf: supplyOf, objTiles: objTiles, objCentre: objCentre };

  // ============================================================ suitability for sea and air enclosures (replaces the land rules; same result shape)
  var HWS = { depth: 0.22, room: 0.24, water: 0.16, enrich: 0.12, feeder: 0.08, social: 0.10, clean: 0.08 };
  function metres(u) { return Math.round(u * 16) / 10; }
  R.suit = function (enc, E, spId, n) {
    if (!enc.kind) return undefined;
    var sp = C.SP()[spId], rl = realmOf(sp); if (rl === 'land' || rl !== enc.realm) return undefined;
    if (n < 1) n = 1;
    var nd = R.needs(sp), el = E.rl || {}, iss = [], area = enc.area, k;
    var minStr = Math.max(sp.minFence, nd.minStr), clean = clamp(1 - enc.poop / (area / 3 + 3), 0, 1);
    var social, mn = sp.social[0], mx = sp.social[1];
    if (n >= mn && n <= mx) social = 1;
    else if (n < mn) { social = 0.4 + 0.6 * (n / mn); iss.push('Needs more of its own kind (at least ' + mn + ')'); }
    else { social = Math.max(0.3, 1 - 0.2 * (n - mx)); iss.push('Too many of this species (max ' + mx + ')'); }
    var out, space = C.enclosureSpaceComfort(enc, E);
    if (space < 1) iss.push('Enclosure is overcrowded');
    if (rl === 'sea') {
      var depth = clamp((enc.depth || 0.5) / nd.depth, 0, 1);
      if (depth < 0.85) iss.push('Needs deeper water (about ' + metres(nd.depth) + ' m, this is ' + metres(enc.depth || 0.5) + ' m)');
      var room = space;
      if (room < 0.8) iss.push(room < 0.5 ? 'Needs far more water (volume per animal)' : 'Needs more water volume per animal');
      var am = C.animalMetrics(sp);
      if (enc.inscribedSpan !== undefined && enc.inscribedSpan < am.minSpan) {
        room *= clamp(enc.inscribedSpan / am.minSpan, 0.25, 1);
        iss.push('Enclosure is too narrow (needs at least ' + am.minSpan + '×' + am.minSpan + ' wide)');
      }
      var water = 1, q = enc.wq === undefined ? 1 : enc.wq;
      if (!enc.salt && !nd.fresh) { water = 0.15; iss.push('Fresh water: needs salt water'); }
      if (enc.kind === 'tank') {
        if (!enc.supplied) { water = 0; iss.push('The tank has no water supply'); }
        if (enc.filter === 'off') iss.push('Filtration plant has no power: the water is going stale');
        else if (enc.filter === 'over') iss.push('The filtration plant is overloaded');
        else if (enc.filter === 'none' && enc.supplied) iss.push('No filtration plant: rangers must clean it by hand');
        water *= 0.4 + 0.6 * q; if (q < 0.6) iss.push('Water quality is poor');
        clean = Math.min(clean, 0.3 + 0.7 * q);
      }
      var enr = clamp(((el.kelp || 0) * 1 + (el.reef || 0) * 1.5) / Math.max(1, Math.ceil(area / 12)), 0, 1);
      if (enr < 0.5) iss.push('Would enjoy kelp or a reef block');
      var fdW = 0, fd = 1;
      if (sp.predator || sp.diet === 'piscivore') { fdW = HWS.feeder; fd = el.feeders && el.feeders.length ? 1 : 0.35; if (fd < 1) iss.push('Needs a fish feeder'); }
      if (clean < 0.6) iss.push('The water is dirty');
      if (enc.kind !== 'virtual' && enc.minFence < minStr) iss.push((enc.kind === 'tank' ? 'Tank wall' : 'Net') + ' is too weak (needs strength ' + minStr + ')');
      var wts = HWS.depth + HWS.room + HWS.water + HWS.enrich + fdW + HWS.social + HWS.clean;
      var v = (depth * HWS.depth + room * HWS.room + water * HWS.water + enr * HWS.enrich + fd * fdW + social * HWS.social + clean * HWS.clean) / wts;
      out = { value: clamp(v, 0, 1), terrain: depth, space: room, foliage: enr, water: water, shelter: 1, rocks: 1, social: social, clean: clean, carcass: fd, enrichment: enr, minFence: minStr, issues: iss };
    } else {
      var H = enc.H || 6, hs = clamp(H / nd.needH, 0, 1);
      if (hs < 0.85) iss.push('The dome is too low (about ' + metres(nd.needH) + ' m wanted)');
      var rm = space;
      if (rm < 0.8) iss.push(rm < 0.5 ? 'Needs a much bigger aviary' : 'Needs a bigger aviary');
      var am2 = C.animalMetrics(sp);
      if (enc.inscribedSpan !== undefined && enc.inscribedSpan < am2.minSpan) {
        rm *= clamp(enc.inscribedSpan / am2.minSpan, 0.25, 1);
        iss.push('Enclosure is too narrow (needs at least ' + am2.minSpan + '×' + am2.minSpan + ' wide)');
      }
      var perches = (el.perch ? el.perch.length : 0) + (el.rocks || 0) * 0.8 + (el.trees || 0) * 0.5 + (E.cliffs || 0) * 0.3, needP = Math.max(2, n + 1);
      var perch = clamp(perches / needP, 0, 1); if (perch < 0.7) iss.push('Needs perches: crags, poles, rocks or cliffs');
      var wN = 1, wW = 0;
      if (sp.needsWater) { wW = 0.14; wN = clamp((el.waterN || 0) / Math.max(1, Math.ceil(area * 0.04)), 0, 1); if (wN < 0.8) iss.push(el.waterN ? 'Needs a bigger fish pool' : 'Needs a fish pool or water'); }
      var shel = 1, sW = 0; if (sp.needsShelter) { sW = 0.1; shel = clamp((el.shelters || 0) / Math.max(1, Math.ceil(area / 30)), 0, 1); if (shel < 1) iss.push('Needs a wind shelter'); }
      var rk = 1, rW = 0; if (sp.needsRocks) { rW = 0.06; rk = clamp(((el.rocks || 0) + (el.perch ? el.perch.length * 0.7 : 0) + (E.cliffs || 0) * 0.5) / Math.max(1, Math.ceil(area / 24)), 0, 1); if (rk < 1) iss.push('Needs rocks or crags'); }
      if (clean < 0.6) iss.push('The aviary is dirty');
      if (enc.kind === 'dome' && enc.minFence < minStr) iss.push('Mesh is too weak (needs strength ' + minStr + ')');
      var toy = clamp((E.toy ? E.toy.length : 0) / Math.max(1, Math.ceil(area / 40)), 0, 1);
      var wt2 = HWS.depth + HWS.room + 0.14 + wW + sW + rW + HWS.social + 0.06 + 0.04;
      var v2 = (hs * HWS.depth + rm * HWS.room + perch * 0.14 + wN * wW + shel * sW + rk * rW + social * HWS.social + clean * 0.06 + toy * 0.04) / wt2;
      out = { value: clamp(v2, 0, 1), terrain: hs, space: rm, foliage: perch, water: wN, shelter: shel, rocks: rk, social: social, clean: clean, carcass: 1, enrichment: toy, minFence: minStr, issues: iss };
    }
    if (enc.kind === 'virtual') {
      var vs = X().vstat[enc.id];
      if (!vs || !vs.ok) { out.value *= 0.75; if (vs) vs.reasons.forEach(function (r) { iss.unshift(r); }); else iss.unshift('No tagging tower in range'); }
    }
    return out;
  };
  // land animals in a virtual land zone use the paddock rules; swap the fence line for the geofence's real reasons
  R.fixIssues = function (enc, iss) {
    if (enc.kind !== 'virtual') return 1;
    for (var k = iss.length - 1; k >= 0; k--) if (/^Fence is too weak/.test(iss[k])) iss.splice(k, 1);
    var vs = X().vstat[enc.id];
    if (!vs) { iss.unshift('No tagging tower in range'); return 0.75; }
    if (!vs.ok) { vs.reasons.slice().reverse().forEach(function (r) { iss.unshift(r); }); return 0.75; }
    return 1;
  };


  // ============================================================ movement of sea and air animals
  function inEnc(enc, x, z) { return S().tileEnc[tileOf(x, z)] === enc.id; }
  function pickTile(enc, a, near) {
    var tl = enc.tiles, rt = RT(), k, n = tl.length;
    if (!n) return 0;
    var sp = C.SP()[a.species], m = sp ? C.animalMetrics(sp, a) : null;
    var needClear = m ? Math.min(m.prefClear, enc.maxWallDist || 0) : 0;
    var best = -1, bestScore = -1;
    for (k = 0; k < 12; k++) {
      var t = tl[Math.floor(rng.next() * n)];
      var cd = rt.clearDist ? rt.clearDist[t] : 0, wd = rt.wallDist ? rt.wallDist[t] : 0;
      var score = cd * 2 + wd;
      if (near && k < 7) {
        var dx = C.cxOf(t) - a.x, dz = C.czOf(t) - a.z;
        if (dx * dx + dz * dz > near * near) {
          if (best < 0 || score > bestScore) { best = t; bestScore = score; }
          continue;
        }
      }
      if (cd >= needClear) return t;
      if (k >= 9 && wd >= needClear) return t;
      if (score > bestScore) { best = t; bestScore = score; }
    }
    if (needClear > 0 && best >= 0 && (rt.clearDist ? rt.clearDist[best] : 0) < needClear) {
      var pool = [], maxC = -1;
      for (k = 0; k < n; k++) {
        var qt = tl[k], qd = rt.clearDist ? rt.clearDist[qt] : 0;
        if (qd >= needClear) pool.push(qt);
        else if (qd > maxC) maxC = qd;
      }
      if (pool.length) return pool[Math.floor(rng.next() * pool.length)];
      if (maxC > (rt.clearDist ? rt.clearDist[best] : 0)) {
        var deep = [];
        for (k = 0; k < n; k++) if ((rt.clearDist ? rt.clearDist[tl[k]] : 0) === maxC) deep.push(tl[k]);
        if (deep.length) return deep[Math.floor(rng.next() * deep.length)];
      }
    }
    return best >= 0 ? best : tl[Math.floor(rng.next() * n)];
  }
  function setTarget(a, t, jit) {
    var s = S(), eid = a.enc || s.tileEnc[t], i = t % N, j = (t - i) / N, cx = C.cxOf(t), cz = C.czOf(t);
    var sp = C.SP()[a.species], m = sp ? C.animalMetrics(sp, a) : null;
    var pad = m ? clamp(m.bodyRad * 0.45, 0.2, 0.82) : 0.2, half = TILE * 0.5;
    var bN = j === 0 || s.tileEnc[t - N] !== eid, bS = j === N - 1 || s.tileEnc[t + N] !== eid;
    var bW = i === 0 || s.tileEnc[t - 1] !== eid, bE = i === N - 1 || s.tileEnc[t + 1] !== eid;
    var padX = (bW && bE) ? Math.min(pad, 0.35) : pad, padZ = (bN && bS) ? Math.min(pad, 0.35) : pad;
    var loX = Math.max(-jit, bW ? -(half - padX) : -jit), hiX = Math.min(jit, bE ? (half - padX) : jit);
    var loZ = Math.max(-jit, bN ? -(half - padZ) : -jit), hiZ = Math.min(jit, bS ? (half - padZ) : jit);
    if (loX > hiX) { var mx = (loX + hiX) * 0.5; loX = hiX = mx; }
    if (loZ > hiZ) { var mz = (loZ + hiZ) * 0.5; loZ = hiZ = mz; }
    a.tx = cx + rng.range(loX, hiX); a.tz = cz + rng.range(loZ, hiZ);
  }
  function steer(a, dt, spd, enc, free, turnK, arriveD) {
    if (!isFinite(a.tx) || !isFinite(a.tz)) { a.speed = 0; return 1; }
    var dx = a.tx - a.x, dz = a.tz - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (!isFinite(d) || d < (arriveD || 0.35)) { a.speed = 0; return 1; }
    a.heading = C.turn(a.heading, Math.atan2(dx, dz), dt * (turnK || 3));
    var step = Math.min(spd * dt, d), nx = a.x + dx / d * step, nz = a.z + dz / d * step;
    if (!free && S().tileEnc[tileOf(nx, nz)] !== enc.id) {
      if (S().tileEnc[tileOf(nx, a.z)] === enc.id && Math.abs(nx - a.x) > 1e-4) { a.x = nx; a.speed = spd; return 0; }
      if (S().tileEnc[tileOf(a.x, nz)] === enc.id && Math.abs(nz - a.z) > 1e-4) { a.z = nz; a.speed = spd; return 0; }
      a.speed = 0; return 2;
    }
    a.x = nx; a.z = nz; a.speed = spd; return 0;
  }
  function settleY(a, dt, vy) { var d = (a.ty === undefined ? a.y : a.ty) - a.y, m = vy * dt; a.y += d > m ? m : d < -m ? -m : d; }
  function seaDepth(enc, E, t) { return enc.kind === 'tank' ? enc.depth : (E.rl && E.rl.dep && E.rl.dep[t]) || 0.8; }
  function eatDone(a, enc, E, sp) {
    a.hunger = Math.max(0, a.hunger - 65);
    var fdr = E.rl && E.rl.feeders && E.rl.feeders.length;
    enc.foodLevel = Math.max(0, enc.foodLevel - (sp.predator ? (fdr ? 0.06 : 0.2) : 0.1));
  }
  function seaMove(a, dt, enc, E, sp) {
    var n = R.needs(sp), t = tileOf(a.x, a.z), dep = seaDepth(enc, E, t), s = S();
    a.thirst = 0; a.wb = enc.surf; a.er = null;
    var low = -Math.max(0.2, dep - 0.35 - 0.25 * Math.min(1.6, sp.size)), spd0 = sp.speed * C.fxOf(a).speed * (a.baby ? 0.8 : 1);
    if (a.ty === undefined || isNaN(a.ty)) a.ty = a.y;
    if (a.show > 0) a.show -= dt;
    if (!a.bolt && s.tileEnc[t] !== enc.id) { var rt = pickTile(enc, a, 0); a.x = C.cxOf(rt); a.z = C.czOf(rt); a.state = 'idle'; a.st = 0.5; t = rt; }
    if (a.bolt) { seaBolt(a, dt, enc, E, sp, spd0); return; }
    if (a.sick) { a.state = 'sick'; a.speed = 0; a.ty = -0.15; settleY(a, dt, 0.5); return; }
    if (a.bp > 0) {   // breaching: an arc through the surface
      a.bp += dt / 1.9;
      var u = Math.min(1, a.bp), fs = spd0 * 2.2;
      a.ty = a.y = -0.7 + 2.0 * Math.sin(PI * u);
      var nx = a.x + Math.sin(a.heading) * fs * dt, nz = a.z + Math.cos(a.heading) * fs * dt;
      if (inEnc(enc, nx, nz)) { a.x = nx; a.z = nz; a.speed = fs; } else a.bp = 1;
      a.state = 'swim';
      if (a.bp >= 1) { a.bp = 0; a.y = -0.6; a.ty = -0.4; a.state = 'idle'; a.st = rng.range(0.2, 1.5); a.speed = 0; }
      return;
    }
    switch (a.state) {
      case 'sick': if (!a.sick) { a.state = 'idle'; a.st = 1; } a.speed = 0; break;
      case 'sleep': a.speed = 0; a.ty = -0.18; if (!C.isNight() && a.energy >= 60) { a.state = 'idle'; a.st = rng.range(0.5, 3); } break;
      case 'eat': a.speed = 0; a.ty = -0.2; a.st -= dt; if (a.st <= 0) { eatDone(a, enc, E, sp); a.state = 'idle'; a.st = rng.range(1, 3); } break;
      case 'drink': a.state = 'idle'; a.st = 1; break;
      case 'idle': a.speed = 0; a.st -= dt; if (a.st <= 0) decideSea(a, enc, E, sp, n, dep, low); break;
      case 'swim': case 'walk': case 'run': {
        var r = steer(a, dt, spd0 * (a.tg === 'eat' || a.show > 0 ? 1.7 : 1.4), enc, false, 2.4);
        if (r) {
          if (a.tg === 'eat') { a.state = 'eat'; a.st = rng.range(3.5, 6); a.speed = 0; }
          else { a.state = 'idle'; a.st = rng.chance(0.4) ? 0 : rng.range(0.5, 3); a.speed = 0; }
          a.tg = '';
        } else a.state = 'swim';
        break;
      }
      default: a.state = 'idle'; a.st = 0.5; break;
    }
    settleY(a, dt, 0.55);
    if (a.y > 0.25 && !(a.bp > 0)) a.y = 0.25;
    C.pushFromWalls(a, enc, C.animalMetrics(sp, a), dt);
  }
  function decideSea(a, enc, E, sp, n, dep, low) {
    var rl = E.rl || {};
    if (C.isNight() || a.energy < 18) { a.state = 'sleep'; a.tg = ''; a.speed = 0; return; }
    if (a.hunger > 55 && enc.foodLevel > 0.02) {
      a.tg = 'eat'; var ft = rl.feeders && rl.feeders.length ? rl.feeders[Math.floor(rng.next() * rl.feeders.length)] : E.feed;
      setTarget(a, ft, 0.4); a.ty = -0.2; a.state = 'swim'; return;
    }
    if (n.breach && !a.baby && dep >= 1.0 && enc.area >= 8 && rng.chance(a.show > 0 ? 0.7 : 0.1)) { a.bp = 0.001; a.state = 'swim'; return; }
    if (n.school && !a.baby && enc.animals.length > 1 && rng.chance(0.55)) {
      var p = RT().aById.get(enc.animals[Math.floor(rng.next() * enc.animals.length)]);
      if (p && p !== a && p.species === a.species) { a.tx = p.x + rng.range(-3, 3); a.tz = p.z + rng.range(-3, 3); if (!inEnc(enc, a.tx, a.tz)) setTarget(a, pickTile(enc, a, 0), 0.6); a.tg = 'wander'; a.ty = -rng.range(0.25, Math.max(0.3, -low)); a.state = 'swim'; return; }
    }
    setTarget(a, pickTile(enc, a, 12), 0.7); a.tg = 'wander';
    var surfaceBias = a.show > 0 ? 0.6 : 0;
    a.ty = -(0.25 + rng.next() * (1 - surfaceBias) * Math.max(0, -low - 0.25)); a.state = 'swim';
  }
  // a downed geofence: swim out of the zone into open water
  function seaBolt(a, dt, enc, E, sp, spd0) {
    if (!(a.btx !== undefined) || rng.chance(dt * 0.1)) { var o = outsideSea(enc, a); if (o) { a.btx = o.x; a.btz = o.z; } }
    a.tx = a.btx !== undefined ? a.btx : a.x + 4; a.tz = a.btz !== undefined ? a.btz : a.z;
    a.state = 'swim'; a.ty = -0.35;
    if (steer(a, dt, spd0 * 1.8, enc, true, 2.4)) { a.btx = undefined; }
    settleY(a, dt, 0.5);
  }
  function outsideSea(enc, a) {
    var t0 = tileOf(a.x, a.z), i0 = t0 % N, j0 = (t0 - i0) / N, best = null, bd = 1e9, s = S();
    for (var r = 2; r <= 9; r++) {
      for (var q = 0; q < 12; q++) {
        var ang = rng.next() * PI * 2, i = Math.round(i0 + Math.cos(ang) * r), j = Math.round(j0 + Math.sin(ang) * r);
        if (!Z.inb(i, j)) continue; var tt = i + j * N;
        if (s.tileEnc[tt] === enc.id || !isSea(tt) || s.tileEnc[tt]) continue;
        var d = dist2(C.cxOf(tt), C.czOf(tt), a.x, a.z); if (d < bd) { bd = d; best = { x: C.cxOf(tt), z: C.czOf(tt) }; }
      }
      if (best) return best;
    }
    return null;
  }

  function perchY(E, t) { return E.rl && E.rl.perch && E.rl.perch.indexOf(t) >= 0 ? 0.45 : 0; }
  function walkableTile(t) { var s = S(); return !RT().block[t] && s.terrain[t] !== wi(); }
  function finishAirTarget(a) {
    if (a.tg === 'eat') { a.state = 'eat'; a.st = rng.range(3.5, 6); }
    else if (a.tg === 'drink') { a.state = 'drink'; a.st = rng.range(2.5, 4.5); }
    else if (a.tg === 'sleep') { a.state = 'sleep'; a.tg = ''; }
    else { a.state = 'idle'; a.st = rng.range(3, 11); a.tg = ''; }
    a.speed = 0; a.stuck = 0;
  }
  function airMove(a, dt, enc, E, sp) {
    var n = R.needs(sp), rl = E.rl || {}, s = S(), t = tileOf(a.x, a.z);
    a.wb = undefined; a.er = null;
    var ceil = Math.max(1.6, (enc.H || 6) - 0.9), spd0 = sp.speed * C.fxOf(a).speed * (a.baby ? 0.8 : 1);
    if (a.ty === undefined || isNaN(a.ty)) a.ty = a.y;
    if (!a.bolt && s.tileEnc[t] !== enc.id) { var rt = pickTile(enc, a, 0); a.x = C.cxOf(rt); a.z = C.czOf(rt); a.state = 'idle'; a.st = 0.5; a.y = 0; a.stuck = 0; t = rt; }
    if (a.bolt) { airBolt(a, dt, enc, spd0); return; }
    if (a.sick) { a.state = 'sick'; a.speed = 0; a.ty = 0; a.stuck = 0; settleY(a, dt, 2.4); return; }
    switch (a.state) {
      case 'sick': if (!a.sick) { a.state = 'idle'; a.st = 1; } a.speed = 0; a.ty = 0; a.stuck = 0; break;
      case 'sleep': a.speed = 0; a.ty = perchY(E, t); a.stuck = 0; if (!C.isNight() && a.energy >= 60) { a.state = 'idle'; a.st = rng.range(0.5, 3); } break;
      case 'eat': a.speed = 0; a.ty = 0; a.stuck = 0; a.st -= dt; if (a.st <= 0) { a.hunger = Math.max(0, a.hunger - 65); enc.foodLevel = Math.max(0, enc.foodLevel - (sp.predator ? 0.15 : 0.1)); a.tg = ''; a.state = 'idle'; a.st = rng.range(1, 3); } break;
      case 'drink': a.speed = 0; a.ty = 0; a.stuck = 0; a.st -= dt; if (a.st <= 0) { a.thirst = 0; if (!rl.waterN) enc.waterLevel = Math.max(0, enc.waterLevel - 0.08); a.tg = ''; a.state = 'idle'; a.st = rng.range(1, 3); } break;
      case 'idle': a.speed = 0; a.ty = perchY(E, t); a.stuck = 0; if (C.cliffT(t)) { decideAir(a, enc, E, sp, n, ceil); break; } a.st -= dt; if (a.st <= 0) decideAir(a, enc, E, sp, n, ceil); break;
      case 'walk': case 'fly': case 'run': {
        var overCliff = C.cliffT(t);
        if (overCliff && !a.baby) { a.state = 'fly'; a.ty = a.cruise = a.cruise || 2.5; }
        var fly = a.state === 'fly' || a.ty > 0.6 || a.y > 0.6, sp2 = fly ? spd0 * 2.8 : spd0 * 1.1;
        var land = a.tg !== 'tour';
        if (land && fly) { var dl = Math.sqrt(dist2(a.tx, a.tz, a.x, a.z)); a.ty = (dl < 5.5 && !overCliff) ? 0 : (a.cruise || 2.5); }
        var tgtT = isFinite(a.tx) && isFinite(a.tz) ? tileOf(a.tx, a.tz) : -1;
        var arriveD = (a.tg === 'eat' || a.tg === 'drink') && tgtT >= 0 && !walkableTile(tgtT) ? 1.25 : 0.35;
        var px0 = a.x, pz0 = a.z;
        var r = steer(a, dt, sp2, enc, false, fly ? 2.6 : 5, arriveD);
        if (r === 2) {   // hit the boundary: turn back to the middle
          a.stuck = (a.stuck || 0) + dt;
          if (a.tg !== 'eat' && a.tg !== 'drink') setTarget(a, pickTile(enc, a, 0), 0.5);
          else if (a.stuck > 1.5) { a.state = 'idle'; a.st = 0.5; a.tg = ''; a.stuck = 0; }
        } else if (r === 1) {
          a.stuck = 0;
          if (a.tg === 'tour') {
            a.ft -= 1;
            if (a.ft > 0) { setTarget(a, pickTile(enc, a, 0), 0.8); a.ty = a.cruise = rng.range(Math.min(1.8, ceil * 0.5), ceil); }
            else { a.tg = 'land'; var lt = landTile(enc, E); setTarget(a, lt, 0.3); a.ty = a.cruise; }
          } else if (a.y > 0.55) { a.speed = 0; a.ty = perchY(E, tileOf(a.x, a.z)); }   // hover down onto the spot
          else {
            finishAirTarget(a);
          }
        } else {
          var moved = Math.sqrt(dist2(a.x, a.z, px0, pz0));
          if (moved < Math.max(0.02, sp2 * 0.15) * dt) a.stuck = (a.stuck || 0) + dt;
          else a.stuck = Math.max(0, (a.stuck || 0) - dt * 0.5);
          if (a.stuck > 1.5) {
            var dRem = Math.sqrt(dist2(a.tx, a.tz, a.x, a.z));
            if ((a.tg === 'eat' || a.tg === 'drink' || a.tg === 'sleep') && dRem < TILE * 1.5) {
              if (a.y > 0.55) { a.speed = 0; a.ty = perchY(E, tileOf(a.x, a.z)); }
              else finishAirTarget(a);
            } else if (!a.baby && !fly) {
              // caught on a cliff edge or obstacle while walking: take off and fly over it
              a.state = 'fly'; a.cruise = a.cruise || 2.5; a.ty = a.cruise; a.stuck = 0;
            } else if (a.stuck > 2.5) {
              a.state = 'idle'; a.st = rng.range(0.5, 2); a.tg = ''; a.speed = 0; a.stuck = 0;
            }
          }
        }
        break;
      }
      default: a.state = 'idle'; a.st = 0.5; a.stuck = 0; break;
    }
    settleY(a, dt, a.ty > a.y ? 1.7 : 2.2);
    if (a.y > 0.6 && (a.state === 'walk' || a.state === 'idle')) { if (a.state === 'walk' || a.speed > 0.1) a.state = 'fly'; }
    if (a.y <= 0.6 && a.state === 'fly' && a.speed > 0.05 && a.ty < 0.6) a.state = 'walk';
    if (a.state === 'fly' && a.y < 0.02 && a.ty === 0 && a.speed < 0.05) { finishAirTarget(a); }
    C.pushFromWalls(a, enc, C.animalMetrics(sp, a), dt);
  }
  function landTile(enc, E) {
    var rl = E.rl, k; if (rl.perch.length && rng.chance(0.6)) return rl.perch[Math.floor(rng.next() * rl.perch.length)];
    for (k = 0; k < 8; k++) { var t = rl.ground.length ? rl.ground[Math.floor(rng.next() * rl.ground.length)] : enc.tiles[Math.floor(rng.next() * enc.tiles.length)]; if (walkableTile(t)) return t; }
    return E.feed >= 0 ? E.feed : enc.tiles[0];
  }
  function decideAir(a, enc, E, sp, n, ceil) {
    var rl = E.rl || {}, t;
    a.stuck = 0;
    if (C.isNight() || a.energy < 18) { a.tg = 'sleep'; t = landTile(enc, E); setTarget(a, t, 0.3); goTo(a, t, ceil); return; }
    if (a.hunger > 55 && enc.foodLevel > 0.02) {
      a.tg = 'eat'; t = rl.pools && rl.pools.length ? rl.pools[Math.floor(rng.next() * rl.pools.length)] : E.water.length ? E.water[Math.floor(rng.next() * E.water.length)] : E.feed;
      if (!(t >= 0)) t = landTile(enc, E);
      setTarget(a, t, 0.4); goTo(a, t, ceil); return;
    }
    if (a.thirst > 55 && (sp.needsWater || a.thirst > 80)) {
      a.tg = 'drink'; t = rl.pools && rl.pools.length ? rl.pools[Math.floor(rng.next() * rl.pools.length)] : E.drink.length ? E.drink[Math.floor(rng.next() * E.drink.length)] : E.feed;
      if (!(t >= 0)) t = landTile(enc, E);
      setTarget(a, t, 0.4); goTo(a, t, ceil); return;
    }
    if (!a.baby && rng.chance(0.55)) {
      a.tg = 'tour'; a.ft = 2 + Math.floor(rng.next() * 5); a.cruise = rng.range(Math.min(1.8, ceil * 0.5), ceil); setTarget(a, pickTile(enc, a, 0), 0.8); a.ty = a.cruise; a.state = 'fly'; return;
    }
    a.tg = 'wander'; t = landTile(enc, E); setTarget(a, t, 0.4); goTo(a, t, ceil);
  }
  function goTo(a, t, ceil) {
    var d = Math.sqrt(dist2(a.tx, a.tz, a.x, a.z));
    if (a.baby || d < 6.5) { a.state = 'walk'; a.ty = 0; }
    else { a.state = 'fly'; a.cruise = a.cruise || rng.range(Math.min(1.8, ceil * 0.5), ceil); a.ty = a.cruise; }
    if (!a.baby && !walkableTile(t)) { a.state = 'fly'; a.cruise = a.cruise || 2.2; a.ty = a.cruise; }
  }
  // a downed geofence: climb and leave the zone
  function airBolt(a, dt, enc, spd0) {
    if (a.btx === undefined || rng.chance(dt * 0.08)) { var ang = rng.next() * PI * 2, r = 18 + rng.next() * 14; a.btx = clamp(enc.cx + Math.cos(ang) * r, 2, N * TILE - 2); a.btz = clamp(enc.cz + Math.sin(ang) * r, 2, N * TILE - 2); }
    a.tx = a.btx; a.tz = a.btz; a.state = 'fly'; a.ty = rng.range(3, 6);
    if (steer(a, dt, spd0 * 2.8, enc, true, 2.6)) a.btx = undefined;
    settleY(a, dt, 1.7);
  }

  // a land animal in a zone whose geofence is down walks out of it
  function landBolt(a, dt, enc, sp) {
    var s = S(), spd = sp.speed * C.fxOf(a).speed * 1.8;
    if (a.state === 'sleep' || a.state === 'eat' || a.state === 'drink' || a.state === 'idle' || a.state === 'sick' || a.state === 'play') a.state = 'walk';
    if (!isFinite(a.tx) || !isFinite(a.tz)) { var ang0 = rng.next() * PI * 2, r0 = 8 + rng.next() * 12; a.tx = clamp(enc.cx + Math.cos(ang0) * r0, 2, N * TILE - 2); a.tz = clamp(enc.cz + Math.sin(ang0) * r0, 2, N * TILE - 2); return; }
    var dx = a.tx - a.x, dz = a.tz - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (!isFinite(d) || d < 0.8) { var ang = rng.next() * PI * 2, r = 8 + rng.next() * 12; a.tx = clamp(enc.cx + Math.cos(ang) * r, 2, N * TILE - 2); a.tz = clamp(enc.cz + Math.sin(ang) * r, 2, N * TILE - 2); return; }
    var nx = a.x + dx / d * spd * dt, nz = a.z + dz / d * spd * dt, nt = tileOf(nx, nz), cur = tileOf(a.x, a.z);
    var ne = s.tileEnc[nt];
    if (nt !== cur && (RT().block[nt] || C.cliffT(nt) || s.terrain[nt] === wi() || (ne && ne !== enc.id) || s.ditch[nt])) { a.tx = undefined; a.speed = 0; return; }
    a.x = nx; a.z = nz; a.speed = spd; a.heading = C.turn(a.heading, Math.atan2(dx, dz), dt * 5); a.y = 0; a.state = 'walk'; a.tg = 'bolt';
  }

  // hook from animalStep: returns true when the realm AI handled the animal this tick
  R.move = function (a, dt, enc, E, sp) {
    if (!enc.kind) return false;
    var rl = realmOf(sp);
    if (rl === 'land') { if (a.bolt && enc.kind === 'virtual') { landBolt(a, dt, enc, sp); return true; } return false; }
    if (rl === 'sea' && enc.realm === 'sea') { seaMove(a, dt, enc, E, sp); return true; }
    if (rl === 'air' && enc.realm === 'air') { airMove(a, dt, enc, E, sp); return true; }
    return false;
  };

  // ============================================================ escapes
  var HOW = { tank: 'smashed out of', pen: 'broken through the net of', dome: 'torn through the mesh of', virtual: 'crossed the geofence of' };
  var FERRY = { x: Z.N * TILE / 2 + 30, z: Z.N * TILE + 8 };
  function outsideTile(enc, a, wantSea) {
    var t0 = tileOf(a.x, a.z), i0 = t0 % N, j0 = (t0 - i0) / N, s = S(), best = -1, bd = 1e9;
    for (var r = 1; r <= 7 && best < 0; r++) for (var j = j0 - r; j <= j0 + r; j++) for (var i = i0 - r; i <= i0 + r; i++) {
      if (!Z.inb(i, j) || (Math.abs(i - i0) !== r && Math.abs(j - j0) !== r)) continue; var t = i + j * N;
      if (s.tileEnc[t]) continue;
      if (wantSea ? !isSea(t) : (s.terrain[t] === wi() || RT().block[t])) continue;
      var d = dist2(C.cxOf(t), C.czOf(t), a.x, a.z); if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function realmEscape(a, enc, how, cause) {
    var sp = C.SP()[a.species], rl = realmOf(sp), s = S(), rs = RS();
    var info = { realm: rl, kind: enc.kind, encId: enc.id, encName: enc.name, how: how || '', cause: cause || '', day: s.day, danger: C.aDanger(a), where: rl === 'sea' ? 'sea' : rl === 'air' ? 'air' : 'land', species: a.species };
    a.er = info;
    a.home = enc.id; a.enc = 0; a.state = 'escaped'; a.tg = ''; a.esc = 0; a.claim = 0; a.bolt = 0; a.rm = 0; a.bp = 0; a.btx = undefined; a.speed = 0;
    if (rl === 'sea') {
      var tt = enc.kind === 'tank' ? outsideTile(enc, a, false) : outsideTile(enc, a, true);
      if (enc.kind === 'tank') { info.where = 'land'; a.wb = undefined; a.y = 0; } else { info.where = 'sea'; a.wb = SEA_Y; a.y = -0.3; }
      if (tt >= 0) { a.x = C.cxOf(tt) + rng.range(-0.5, 0.5); a.z = C.czOf(tt) + rng.range(-0.5, 0.5); }
    } else if (rl === 'air') { a.y = Math.max(a.y, 2.2); a.wb = undefined; info.where = 'air'; }
    a.tx = a.x; a.tz = a.z;
    C.refreshEncAnimals(); C.encStats(enc);
    S().stats.escapes++;
    var name = lc(sp.name);
    C.msg('Escape! ' + a.name + ' the ' + name + ' has ' + (how || 'broken out of') + ' ' + enc.name + '!' + (info.danger >= 2 ? ' Guests are in danger.' : '') + (rl === 'sea' && info.where === 'sea' ? ' It has reached the open sea: you will need a recovery boat.' : rl === 'air' ? ' It is flying free: you will need a net-gun drone team.' : ''), 'bad');
    C.onEscape(a); bus.emit('escape', a);
    fin();
    function fin() {
      rs.stats.escapes++; enc.hold = 0; enc.lastEsc = s.day;
      bus.emit('realmEscape', { animal: a, species: a.species, name: a.name, realm: rl, kind: enc.kind, enc: enc.id, encName: enc.name, how: how, cause: cause || '', danger: info.danger, where: info.where, day: s.day, x: a.x, z: a.z });
    }
  }
  R.realmEscape = realmEscape;
  function nearestGuest(a, maxD) {
    var gs = S().guests, best = null, bd = maxD * maxD;
    for (var k = 0; k < gs.length; k++) { var g = gs[k]; if (g.shel) continue; var d = dist2(g.x, g.z, a.x, a.z); if (d < bd) { bd = d; best = g; } }
    return best;
  }
  function nearestSeaTo(x, z, rad) {
    var t0 = tileOf(x, z), i0 = t0 % N, j0 = (t0 - i0) / N, best = -1, bd = 1e9, s = S();
    for (var j = j0 - rad; j <= j0 + rad; j++) for (var i = i0 - rad; i <= i0 + rad; i++) {
      if (!Z.inb(i, j)) continue; var t = i + j * N; if (!isSea(t) || s.tileEnc[t]) continue;
      var d = dist2(C.cxOf(t), C.czOf(t), x, z); if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  R.escapedStep = function (a, dt, sp) {
    var er = a.er; if (!er || er.realm === 'land') return false;
    var s = S(), x = X(), rt = RT(), W = Z.N * TILE;
    a.esc = (a.esc || 0) + dt; a.hunger = Math.min(100, a.hunger + 0.1 * dt);
    if (a.held) { a.speed = 0; return true; }
    if (a.hurtT > 0) a.hurtT -= dt;
    var ad = C.aDanger(a), staff = rt.secCount > 0 || rt.keeperCount > 0, lim, spd = sp.speed * C.fxOf(a).speed * 1.8;
    if (er.realm === 'sea') {
      if (er.where === 'land') {
        a.speed = 0; a.state = 'idle'; a.y = 0; a.wb = undefined; a.health -= 0.3 * dt; lim = staff ? 70 : 150;
        if (a.health <= 0) { C.msg(a.name + ' the ' + lc(sp.name) + ' could not survive out of the water.', 'bad'); s.stats.deaths++; bus.emit('death', a); C.removeAnimal(a); return true; }
      } else {
        a.wb = SEA_Y; lim = x.boats > 0 ? 100 : 420;
        a.lk = (a.lk || 0) - dt;
        if (a.lk <= 0) {
          a.lk = 1.2; var g = ad >= 1 ? nearestGuest(a, 30) : null, tt = -1;
          if (g) { tt = nearestSeaTo(g.x, g.z, 4); if (tt >= 0) a.lg = g.id; }
          if (tt < 0) { var t0 = tileOf(a.x, a.z), i0 = t0 % N, j0 = (t0 - i0) / N, ang = rng.next() * PI * 2, r = 4 + rng.next() * 8, i = Math.round(i0 + Math.cos(ang) * r), j = Math.round(j0 + Math.sin(ang) * r); if (Z.inb(i, j) && isSea(i + j * N) && !s.tileEnc[i + j * N]) tt = i + j * N; }
          if (tt >= 0) { a.tx = C.cxOf(tt); a.tz = C.czOf(tt); }
        }
        a.state = 'swim'; a.ty = -0.3; a.y += (-0.3 - a.y) * Math.min(1, dt * 2);
        var dx = a.tx - a.x, dz = a.tz - a.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.4) { var nx = a.x + dx / d * spd * dt, nz = a.z + dz / d * spd * dt, nt = tileOf(nx, nz); if (isSea(nt) && !s.tileEnc[nt] && nx > 0 && nz > 0 && nx < W && nz < W) { a.x = nx; a.z = nz; a.speed = spd; a.heading = C.turn(a.heading, Math.atan2(dx, dz), dt * 3); } else { a.speed = 0; a.lk = 0; } } else a.speed = 0;
        if (ad >= 1 && a.lg && a.hurtT <= 0) { var gg = rt.gById.get(a.lg); if (gg && dist2(gg.x, gg.z, a.x, a.z) < 7.5 && rng.chance(0.25 * dt * 2)) { C.hurtGuest(gg, a); a.hurtT = 6; } }
        if (!er.pier && dist2(a.x, a.z, FERRY.x, FERRY.z) < 34 * 34) {
          er.pier = true; C.msg(a.name + ' the ' + lc(sp.name) + ' is loose near the ferry pier!', 'bad');
          bus.emit('realmThreat', { animal: a, species: a.species, kind: 'ferry', realm: 'sea', danger: ad });
        }
      }
    } else {
      a.wb = undefined; lim = x.drones > 0 ? 90 : (staff ? 200 : 300);
      a.lk = (a.lk || 0) - dt;
      if (a.lk <= 0) {
        a.lk = 1.5; var g2 = ad >= 1 ? nearestGuest(a, 36) : null;
        if (g2) { a.tx = g2.x; a.tz = g2.z; a.lg = g2.id; a.cruise = 1.2; } else { a.lg = 0; a.tx = rng.range(6, W - 6); a.tz = rng.range(6, W - 6); a.cruise = rng.range(3, 7); }
      }
      var dx2 = a.tx - a.x, dz2 = a.tz - a.z, d2 = Math.sqrt(dx2 * dx2 + dz2 * dz2), sp3 = sp.speed * C.fxOf(a).speed * 2.8 * (a.lg ? 1.3 : 1);
      a.state = 'fly'; a.ty = a.cruise || 4; a.y += clamp(a.ty - a.y, -2 * dt, 2 * dt);
      if (d2 > 0.5) { a.x += dx2 / d2 * sp3 * dt; a.z += dz2 / d2 * sp3 * dt; a.speed = sp3; a.heading = C.turn(a.heading, Math.atan2(dx2, dz2), dt * 2.5); } else { a.speed = 0; a.lk = 0; }
      if (ad >= 1 && a.lg && a.hurtT <= 0) { var g3 = rt.gById.get(a.lg); if (g3 && dist2(g3.x, g3.z, a.x, a.z) < 7 && rng.chance(0.3 * dt * 2)) { C.hurtGuest(g3, a); a.hurtT = 6; } }
    }
    if (a.esc > lim) {
      var by = er.realm === 'sea' ? (x.boats > 0 ? 'The recovery boat crew' : 'The coastguard') : (x.drones > 0 ? 'The net-gun drone team' : 'The response team');
      if (er.realm === 'sea' && er.where === 'sea' && !(x.boats > 0)) { var fee = Math.round(C.SP()[a.species].cost * 0.2); C.spend(fee, 'other'); C.msg('The coastguard recovered ' + a.name + ' for a fee of ' + fmt(fee) + '.', 'info'); }
      C.recapture(a, by);
      if (a.enc) { a.er = null; a.wb = undefined; a.y = 0; a.ty = 0; a.rm = 0; a.bolt = 0; a.btx = undefined; }
    }
    return true;
  };

  // hourly roll for every realm enclosure (replaces the paddock roll)
  R.escapeRoll = function (enc) {
    if (!enc.animals.length) return;
    var x = X(), maint = clamp((RT().keeperCount + RT().vetCount) / 3, 0, 1), rs = RS();
    for (var k = enc.animals.length - 1; k >= 0; k--) {
      var a = RT().aById.get(enc.animals[k]); if (!a || a.baby || a.state === 'escaped') continue;
      var sp = C.SP()[a.species], n = R.needs(sp), need = Math.max(C.aMinFence(a), n.minStr);
      if (enc.kind === 'virtual') {
        var vs = x.vstat[enc.id];
        if (a.tag && vs && vs.ok) {
          if (rng.chance(0.0015 * n.tagResist * (1 - 0.6 * maint) * (a.state === 'sleep' ? 0.4 : 1))) {
            a.tag = 0; a.tagWait = 0; rs.stats.tagFails++; a.tagFix = RT().keeperCount + RT().vetCount > 0 ? HOUR : 1e9;
            C.msg('The tag on ' + a.name + ' the ' + lc(sp.name) + ' has failed' + (a.tagFix < 1e8 ? ': a technician is on the way.' : '! Hire a ranger or vet to fit a new one.'), 'bad');
            bus.emit('tagFail', { animal: a, enc: enc.id });
          } else {
            var def = need - vs.strength;
            if (def > 0 && rng.chance((1 - Math.pow(1 - Math.min(0.9, 0.18 + 0.17 * def), 1 / 24)) * (1.25 - a.happiness / 150))) realmEscape(a, enc, HOW.virtual, 'strong');
          }
        }
        continue;
      }
      var eff = enc.breach > 0 ? 0 : enc.minFence, def2 = need - eff;
      if (enc.kind === 'dome' && RS().forced && rng.chance(0.03)) { realmEscape(a, enc, 'slipped through the airlock of', 'power'); continue; }
      if (def2 <= 0) continue;
      var pd = Math.min(0.9, 0.18 + 0.17 * def2) * (1.25 - a.happiness / 150), ph = 1 - Math.pow(1 - pd, 1 / 24);
      if (a.state === 'sleep') ph *= 0.3; ph *= C.WX().escape;
      if (rng.next() < ph) realmEscape(a, enc, HOW[enc.kind], 'weak');
    }
  };

  // ============================================================ per second: water quality, tags, geofence, guests, shows
  var legacyWarned = {};
  R.secondly = function (quick) {
    var s = S(), rs = RS(), rt = RT(), x = X(), k, q, encs = s.enclosures, a;
    R.refresh();
    var now = s.day + s.time;
    for (k = 0; k < encs.length; k++) {
      var e = encs[k], n = e.animals.length; if (!e.kind) continue;
      if (e.kind === 'tank' || e.kind === 'pen' || (e.kind === 'virtual' && e.realm === 'sea')) {
        if (e.wq === undefined) e.wq = 1;
        if (e.kind === 'tank') {
          var filt = e.filter === 'ok', load = 1 + e.poop / (e.area / 3 + 3);
          if (filt) { e.poop = Math.max(0, e.poop - 0.05); e.wq = Math.min(1, e.wq + 0.0035); }
          else if (n > 0) e.wq = clamp(e.wq - 0.00035 * load + (e.intake ? 0.0005 : 0), 0, 1);   // filtration stopped: slow decline; a sea intake only refreshes it a little
          else if (e.intake) e.wq = Math.min(1, e.wq + 0.001);
          if (!e.supplied) e.wq = Math.max(0, e.wq - 0.004);
        } else { e.poop = Math.max(0, e.poop - 0.012); e.wq = Math.min(1, e.wq + 0.01); }
        if (e.wq < 0.3 && n) for (q = 0; q < e.animals.length; q++) { a = rt.aById.get(e.animals[q]); if (a) a.health -= (0.3 - e.wq) * 0.25; }
      } else if (e.kind === 'dome') { e.poop = Math.max(0, e.poop - 0.004); }
      if (quick) continue;
    }
    // tags, geofence and bolting
    for (k = 0; k < encs.length; k++) {
      var z = encs[k]; if (z.kind !== 'virtual') continue;
      var vs = x.vstat[z.id];
      for (q = z.animals.length - 1; q >= 0; q--) {
        a = rt.aById.get(z.animals[q]); if (!a || a.state === 'escaped') continue;
        var sp = C.SP()[a.species], nd = R.needs(sp);
        if (!a.tag) {
          if (vs && vs.ok) {
            var fresh = !(a.tagFix > 0), fixing = a.tagFix !== undefined && a.tagFix < 1e8 && a.tagFix > 0;
            if (a.tagFix > 0 && a.tagFix < 1e8) a.tagFix--;
            if ((a.tagFix === undefined || a.tagFix <= 0 || fresh) && s.money >= nd.tagCost) {
              a.tag = 1; a.tagFix = 0; a.tagWait = 0; C.spend(nd.tagCost, 'animals'); rs.stats.tagsFitted++;
              C.msg('A tag was fitted to ' + a.name + ' the ' + lc(sp.name) + ' (' + fmt(nd.tagCost) + ').', 'info', false); bus.emit('tagged', { animal: a, enc: z.id });
            } else a.tagWait = (a.tagWait || 0) + 1;
          } else a.tagWait = (a.tagWait || 0) + 1;
        }
        var held = !!(a.tag && vs && vs.ok);
        var shouldBolt = (!held && (a.tagWait || 0) > HOUR * 4) || (!(vs && vs.ok) && !!a.tag);
        if (shouldBolt && !a.bolt) { a.bolt = 1; a.btx = undefined; if (z.animals.length && !z._warned) { z._warned = true; } }
        if (held && a.bolt) { a.bolt = 0; a.btx = undefined; }
        if (a.bolt) {
          var rl2 = realmOf(sp);
          if (rl2 === 'land') {
            if (a.tg !== 'bolt' || a.state === 'idle' || a.state === 'sleep') {
              var ang = rng.next() * PI * 2, r = 6 + rng.next() * 12, bx = clamp(z.cx + Math.cos(ang) * r, 2, N * TILE - 2), bz = clamp(z.cz + Math.sin(ang) * r, 2, N * TILE - 2);
              a.tx = bx; a.tz = bz; a.tg = 'bolt'; a.state = 'walk'; a.stuck = 0; a.sleepOff = 1;
            }
          }
          if (s.tileEnc[tileOf(a.x, a.z)] !== z.id) realmEscape(a, z, vs && !vs.powered ? 'walked out of' : 'strayed out of', 'geofence');
        }
      }
      if (z.animals.length === 0) z.hold = 0;
      z.vdown = !(vs && vs.ok);
    }
    // legacy sea / air animals in land paddocks: warn once
    if (!quick) for (k = 0; k < s.animals.length; k++) {
      a = s.animals[k]; if (!a.enc || legacyWarned[a.id]) continue;
      var en = rt.eMap[a.enc]; if (!en) continue; var spx = C.SP()[a.species];
      if (realmOf(spx) !== 'land' && !en.kind) { legacyWarned[a.id] = 1; C.msg(a.name + ' the ' + lc(spx.name) + ' lives in a paddock. ' + (realmOf(spx) === 'sea' ? 'Marine animals belong in a lagoon tank or sea pen.' : 'Flying animals belong in an Aviary.') + ' Move it soon.', 'bad', false); }
    }
    if (quick) return;
    // guests inside walks: counted once, happy
    var gs = s.guests;
    for (k = 0; k < gs.length; k++) {
      var g = gs[k], t = g.ti; if (t === undefined || t < 0) continue;
      var w = s.path[t] ? walkAt(t) : null; if (!w) continue;
      var en2 = s.tileEnc[t] ? rt.eMap[s.tileEnc[t]] : null; if (!en2 || !en2.kind) continue;
      var E2 = rt.encx[en2.id];
      if (w !== 'pier' && !g.tv) { g.tv = 1; rs.stats.tunnelGuests++; }
      if (E2 && E2.nAn > 0) {
        g.mood += 1.4; g.fun = Math.min(100, (g.fun || 0) + 1.8);
        if (rng.chance(0.06)) C.say(g, w === 'mesh' ? 'aviary' : w === 'sky' ? 'virtual' : 'tunnel', en2.species[0]);
      }
    }
    // feeding shows
    runShows(now);
  };
  function runShows(now) {
    var s = S(), rs = RS(), rt = RT(), tt = s.time;
    if (rs.show && rs.show.until < now) { rs.show = null; bus.emit('realmShow', null); }
    var slot = tt >= 0.45 && tt < 0.47 ? 1 : tt >= 0.65 && tt < 0.67 ? 2 : 0;
    if (!slot || rs.showDay === s.day * 4 + slot) return;
    rs.showDay = s.day * 4 + slot;
    var stands = objsOf('feeding_grandstand'), done = 0;
    stands.forEach(function (o) {
      var c = objCentre(o), best = null, bd = 12 * 12 * TILE * TILE;
      s.enclosures.forEach(function (e) { if ((e.kind === 'tank' || e.kind === 'pen') && e.animals.length) { var d = dist2(e.cx, e.cz, c.x, c.z); if (d < bd) { bd = d; best = e; } } });
      if (!best || !s.open) return;
      var n = 0, gs = s.guests;
      for (var k = 0; k < gs.length; k++) { var g = gs[k]; if (dist2(g.x, g.z, c.x, c.z) < 7 * 7 * TILE * TILE / 4 * 1.6) { n++; g.mood += 12; g.fun = Math.min(100, (g.fun || 0) + 20); C.say(g, 'show', best.species[0]); if (g.money > 3) { var amt = Math.min(g.money, 4); g.money -= amt; g.spent += amt; C.earn(amt, 'shops', g.x, g.z); } } }
      for (k = 0; k < best.animals.length; k++) { var an = rt.aById.get(best.animals[k]); if (an) { an.show = 24; an.happiness = Math.min(100, an.happiness + 3); } }
      rs.show = { obj: o.id, enc: best.id, from: s.day + s.time, until: s.day + s.time + 26 / C.DAY_SECONDS, x: c.x, z: c.z, tx: best.cx, tz: best.cz }; done++; rs.stats.shows++;
      C.msg('Feeding show at ' + best.name + ': ' + n + ' guests watched!', 'good', false);
      bus.emit('realmShow', rs.show);
    });
  }
  R.show = function () { var r = S().realms; return r && r.show ? r.show : null; };

  // ============================================================ daily upkeep and goal counters
  R.newDay = function () {
    var s = S(), rs = RS(), cost = 0, tags = 0, k;
    for (k = 0; k < s.enclosures.length; k++) {
      var e = s.enclosures[k]; if (!e.kind) continue;
      var tc = e.kind === 'tank' ? RD.tank.upkeepTile : e.kind === 'dome' ? RD.dome.upkeepTile : e.kind === 'virtual' ? RD.virtual.upkeepTile : RD.pen.upkeepTile;
      cost += e.area * tc;
      if (e.kind === 'virtual') {
        for (var q = 0; q < e.animals.length; q++) { var a = RT().aById.get(e.animals[q]); if (a && a.tag) tags++; }
        var ok = e.animals.length >= 5 && !e.vdown && e.lastEsc !== s.day;
        e.hold = ok ? (e.hold || 0) + 1 : 0;
        if (e.hold > rs.stats.virtualBest) rs.stats.virtualBest = e.hold;
      }
    }
    cost += tags * RD.virtual.tagUpkeep;
    cost = Math.round(cost * 0.6);
    if (cost > 0) C.spend(cost, 'upkeep');
  };

  // ============================================================ goals and statistics
  R.counts = function () {
    var s = S(), c = { tank: 0, pen: 0, dome: 0, virtual: 0, marine: 0, ptero: 0, tagged: 0, walks: 0 }, k;
    for (k = 0; k < s.enclosures.length; k++) if (s.enclosures[k].kind) c[s.enclosures[k].kind]++;
    for (k = 0; k < s.animals.length; k++) {
      var a = s.animals[k], sp = C.SP()[a.species]; if (a.tag) c.tagged++;
      if (!a.enc || a.state === 'escaped' || sp.modern) continue; var en = RT().eMap[a.enc]; if (!en || !en.kind) continue;
      if (realmOf(sp) === 'sea' && en.realm === 'sea') c.marine++; else if (realmOf(sp) === 'air' && en.realm === 'air') c.ptero++;
    }
    for (k = 0; k < NN; k++) if (s.path[k] && walkAt(k)) c.walks++;
    return c;
  };
  R.goalMet = function (gl) {
    var rs = RS(), c = R.counts();
    switch (gl.what) {
      case 'marine': return c.marine >= gl.target || rs.stats.marineEver >= gl.target;
      case 'ptero': return c.ptero >= gl.target || rs.stats.pteroEver >= gl.target;
      case 'tunnel': return rs.stats.tunnelGuests >= gl.target;
      case 'virtual': return rs.stats.virtualBest >= 5;
    }
    return false;
  };

  // ============================================================ reports for the UI
  var DEPTHN = function (u) { return metres(u) + ' m'; };
  R.report = function (enc, issues) {
    if (!enc.kind) return null;
    var st = R.containmentStatus(enc.id), x = X(), rep = { kind: enc.kind, realm: enc.realm, label: R.kindName(enc), status: st, area: enc.area, vol: enc.vol, depth: enc.depth, strength: enc.minFence, powered: st.powered, wq: enc.wq };
    if (enc.kind === 'tank') { rep.level = RD.tank.levels[clamp(enc.lvl, 1, 3) - 1]; rep.wall = RD.tank.walls[clamp(enc.wall || 1, 1, 3) - 1]; rep.supply = { intake: !!enc.intake, plant: !!enc.plantId, filter: enc.filter, supplied: !!enc.supplied }; }
    if (enc.kind === 'dome') { rep.height = RD.dome.heights[clamp(enc.lvl, 1, 3) - 1]; rep.mesh = RD.dome.meshes[clamp(enc.mesh || 1, 1, 3) - 1]; rep.H = enc.H; }
    if (enc.kind === 'pen') { rep.salt = enc.salt; }
    if (enc.kind === 'virtual') {
      var vs = x.vstat[enc.id] || {}; rep.zone = { tower: vs.tower, towerCount: vs.towerCount || (vs.tower ? 1 : 0), lvl: vs.lvl, cover: vs.cover, cap: vs.cap, used: vs.used, powered: vs.powered, band: enc.realm === 'air' ? RD.virtual.bands[clamp(enc.band || 1, 1, 3) - 1] : null, hold: enc.hold || 0 };
      rep.tags = enc.animals.map(function (id) { var a = RT().aById.get(id); return a ? { id: a.id, name: a.name, species: a.species, tag: !!a.tag } : null; }).filter(Boolean);
    }
    if (issues && !st.ok) st.reasons.forEach(function (r) { issues.unshift(r); });
    return rep;
  };
  R.requirements = function (sp) {
    if (typeof sp === 'string') sp = C.SP()[sp]; if (!sp) return [];
    var n = R.needs(sp), rl = realmOf(sp), out = [];
    if (rl === 'sea') {
      out.push('Home: lagoon tank, sea pen or virtual sea zone');
      out.push('Water: ' + (n.fresh ? 'salt or fresh' : 'salt only') + ', at least ' + metres(n.depth) + ' m deep');
      out.push('Volume: about ' + Math.round(sp.space * n.depth) + ' water units each (tiles × depth)');
      out.push('Barrier: strength ' + n.minStr + '+ (net, tank wall or tower)');
      out.push('Extras: ' + (sp.predator || sp.diet === 'piscivore' ? 'fish feeder, ' : '') + 'kelp or reef' + (n.breach ? ' (breaches: keep it deep)' : ''));
      out.push(n.live ? 'Gives birth to live young (gestation pool, no egg)' : 'Lays eggs');
    } else if (rl === 'air') {
      out.push('Home: Aviary or virtual sky zone');
      out.push('Air: at least ' + metres(n.needH) + ' m of height, ' + sp.space + ' tiles each');
      out.push('Barrier: mesh strength ' + n.minStr + '+');
      out.push('Extras: perches (crags, poles, trees)' + (sp.needsWater ? ', a fish pool' : '') + (sp.needsShelter ? ', a wind shelter' : '') + (sp.needsRocks ? ', rocks' : ''));
    } else {
      out.push('Home: fenced paddock, or a virtual land zone (tagged, no fence)');
      out.push('Virtual zone tag: ' + fmt(n.tagCost) + ' each, ' + (n.tagResist > 1.2 ? 'tests the geofence hard (needs a stronger tower)' : n.tagResist > 0.7 ? 'moderate geofence stress' : 'gentle on the geofence'));
    }
    return out;
  };
  R.table = function () {
    return C.D.animals.filter(function (sp) { return realmOf(sp) !== 'land'; }).map(function (sp) {
      var n = R.needs(sp); return { id: sp.id, name: sp.name, realm: realmOf(sp), modern: !!sp.modern, depth: n.depth, needH: n.needH, minStr: n.minStr, space: sp.space, fresh: n.fresh, tagCost: n.tagCost, live: n.live };
    });
  };
  // species that can be put in an enclosure of this kind, with reasons for the Hatch UI
  R.fitsEnc = function (spId, enc) {
    var sp = C.SP()[spId]; if (!sp) return { ok: false, why: 'Unknown species' };
    var t = enc.tiles[0], m = R.spotCheck(sp, enc, t);
    if (m === undefined) return { ok: !enc.kind && realmOf(sp) === 'land' ? true : realmOf(sp) === 'land', why: '' };
    return { ok: !m, why: m || '' };
  };
  R.stats = function () { var rs = RS(); return Object.assign({}, rs.stats, R.counts()); };
  R.encName = R.kindName;
})();
