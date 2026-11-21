// ===== 20-sim.js =====
var window = typeof window!=='undefined' ? window : globalThis; window.Z = window.Z || {}; var Z = window.Z;
(function () {
  'use strict';
  var N = Z.N, TILE = Z.TILE, NN = N * N, bus = Z.bus, rng = Z.rng;
  var D = Z.DATA;
  var DAY_SECONDS = 420, OPEN_T = 8 / 24, CLOSE_T = 20 / 24, MAX_GUESTS = 340, MAX_ENC_TILES = 600, VERSION = 2;
  var INF = 65535;
  var PI = Math.PI, TAU = Math.PI * 2;
  var DT4 = [-N, 1, N, -1];
  var GATE_I0 = Math.floor(N / 2) - 1, GATE_J = N - 1;
  function syncGridVars(n) {
    N = n; NN = n * n; EW = n + 1;
    DT4[0] = -n; DT4[1] = 1; DT4[2] = n; DT4[3] = -1;
    GATE_I0 = Math.floor(n / 2) - 1; GATE_J = n - 1;
    if (Z.moatCtx) Z.moatCtx.N = n;
    if (Z.realmCtx) Z.realmCtx.N = n;
    if (Z.powerCtx) Z.powerCtx.N = n;
    if (Z.monoCtx) Z.monoCtx.N = n;
  }
  if (bus && bus.on) bus.on('gridsize', syncGridVars);
  // Live weather/difficulty modifiers. Shared weather contract (see docs/ARCHITECTURE.md): written by the day/weather code (20d), read everywhere.
  var WX = { type: 'clear', arrivals: 1, thirst: 1, hunger: 1, energy: 1, guestSpeed: 1, fun: 0, spend: 1, shelter: false, animalMood: 0, sick: 1, escape: 1, dirt: 1 };
  // Difficulty modifiers. SHARED CONTRACT: written by applyDifficulty() (20d), read everywhere.
  var DIFF = { id: 'normal', income: 1, costs: 1, arrivals: 1 };

  // ---- lookups ----
  var TI = {}, FI = {}, PI_ = {}, SP = {}, SC = {}, BD = {}, STF = {}, EQ = {}, TR = {}, SITE = {}, GRADE = {};
  function reindex() {
    D = Z.DATA; TI = {}; FI = {}; PI_ = {}; SP = {}; SC = {}; BD = {}; STF = {}; EQ = {}; TR = {}; SITE = {}; GRADE = {};
    D.terrain.forEach(function (t, k) { TI[t.id] = k; });
    D.fences.forEach(function (t, k) { FI[t.id] = k + 1; });
    D.paths.forEach(function (t, k) { PI_[t.id] = k + 1; });
    D.animals.forEach(function (a) { a.upkeep = a.upkeep !== undefined ? a.upkeep : a['upkeep/day']; SP[a.id] = a; });
    D.scenery.forEach(function (a) { SC[a.id] = a; });
    D.buildings.forEach(function (a) { BD[a.id] = a; });
    D.staff.forEach(function (a) { a.wage = a.wage !== undefined ? a.wage : a['wage/day']; STF[a.id] = a; });
    (D.equipment || []).forEach(function (a) { EQ[a.id] = a; });
    (D.traits || []).forEach(function (a) { TR[a.id] = a; });
    (D.sites || []).forEach(function (a) { SITE[a.id] = a; });
    (D.grades || [{ id: 1, name: 'Cloudy', priceMult: 1 }, { id: 2, name: 'Clear', priceMult: 2.2 }, { id: 3, name: 'Pristine', priceMult: 4.5 }]).forEach(function (a) { GRADE[a.id] = a; });
  }
  reindex();
  var WATER = TI.water;

  var S = null;           // current state (== Z.state)
  var RT = null;          // runtime (non-serialised) data

  function newRT() {
    return {
      fields: {}, pathVer: 1, nb: new Uint8Array(NN), pathTiles: [], block: new Uint8Array(NN), shelter: new Uint8Array(NN),
      gById: new Map(), aById: new Map(), sById: new Map(), oById: new Map(),
      encx: {}, bq: {}, benchOcc: {}, byType: { food: [], drink: [], toilet: [], fun: [], bench: [], bin: [] },
      t1: 0, t2: 0, escAcc: 0, arrAcc: 0, rate: 0.3, arrMul: 1, arrMulT: 0, pendingSpawn: 0,
      escaped: [], guides: [], secCount: 0, keeperCount: 0, vetCount: 0, hasHut: false, huts: [], hasVet: false, vets: [], hasEdu: false,
      advice: {}, claim: {}, groupLead: new Map(), nextGroup: 1, dirtyCount: 0, ghEMA: 65, value: 10,
      queue: new Int32Array(NN), prev: new Int32Array(NN), stamp: new Int32Array(NN), stampN: 0, binVer: 0,
      pathMask: null, gh: 65, accSim: 0, eMap: {}, guestCrowd: 0, speciesCount: 0,
      undo: [], stroke: null, strokeDepth: 0, labs: [], hatcheries: [], bunkers: [], platforms: [], labNear: new Uint8Array(NN), platTile: new Uint8Array(NN),
      dangerEsc: 0, hunters: {}, resAcc: 0, labOnline: false, undoBusy: false,
      allLabs: [], allHatch: [], allBunkers: [], allPlat: [], sea: null, seaNear: null,
      comp: new Uint16Array(NN), compN: 0, reachComp: null, gateComps: [], inWorld: false
    };
  }

  // ---- generic helpers ----
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function turn(h, target, rate) {
    var d = target - h;
    while (d > PI) d -= TAU; while (d < -PI) d += TAU;
    h += d * (rate > 1 ? 1 : rate);
    if (h > PI) h -= TAU; else if (h < -PI) h += TAU;
    return h;
  }
  function tileOf(x, z) {
    var i = Math.floor(x / TILE), j = Math.floor(z / TILE);
    if (i < 0) i = 0; else if (i >= N) i = N - 1;
    if (j < 0) j = 0; else if (j >= N) j = N - 1;
    return i + j * N;
  }
  function cxOf(t) { return (t % N) * TILE + TILE / 2; }
  function czOf(t) { return Math.floor(t / N) * TILE + TILE / 2; }
  function newId() { return S.nextId++; }
  function dryOf(args) { var l = args[args.length - 1]; return !!(l && typeof l === 'object' && l.dry); }
  function fail(msg) { return { ok: false, msg: msg }; }
  function okr(cost, extra) { var r = { ok: true, cost: cost || 0 }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function fmt(n) { n = Math.round(n); return (n < 0 ? '-' : '') + '£' + Math.abs(n).toLocaleString('en-GB'); }
  function isNight() { return S.time < 0.24 || S.time >= 0.9; }
  function openNow() { return S.open && S.time >= OPEN_T && S.time < CLOSE_T && !(Z.News && Z.News.closed()); }   // news package: the authorities can close the park for a day
  function lc(s) { return s.toLowerCase(); }
  function plural(sp) { var n = sp.name; var l = lc(n); if (/s$/.test(l)) return n; if (/ey$/.test(l) || /o$/.test(l) && l === 'hippopotamus') return n + 's'; if (/y$/.test(l)) return n.slice(0, -1) + 'ies'; if (/(ch|sh|x)$/.test(l)) return n + 'es'; if (/^(wolf)$/.test(l)) return 'Wolves'; if (/ish$/.test(l)) return n; return n + 's'; }

  function msg(text, kind, toast) {
    var m = { day: S.day, text: text, kind: kind || 'info' };
    S.messages.push(m); if (S.messages.length > 50) S.messages.shift();
    bus.emit('message', m);
    if (toast !== false) bus.emit('toast', { text: text, kind: kind || 'info' });
  }
  function earn(amount, cat, x, z) {
    if (!amount) return;
    if (cat === 'tickets' || cat === 'food' || cat === 'shops' || cat === 'donations') { if (DIFF.income !== 1) amount = Math.round(amount * DIFF.income * 100) / 100; }   // difficulty: guest income
    if (cat === 'shops' && Z.News) amount = Math.round(amount * Z.News.merchMul() * 100) / 100;   // news package: merchandise spikes after a scare
    S.money += amount; S.finance.today[cat] = (S.finance.today[cat] || 0) + amount;
    bus.emit('money', x !== undefined ? { delta: amount, x: x, z: z } : { delta: amount });
  }
  function spend(amount, cat) {
    if (!amount) return;
    S.money -= amount; S.finance.today[cat] = (S.finance.today[cat] || 0) - amount;
    bus.emit('money', { delta: -amount });
  }

  // ---- elevation / map bounds ----
  var EW = N + 1, ELEV_MIN = -4, ELEV_MAX = 12, ELEV_COST = 15;
  function inMap(i, j) {
    var m = S.map; if (!m) return Z.inb(i, j);
    return i >= m.i0 && i <= m.i1 && j >= m.j0 && j <= m.j1;
  }
  function slopeOfT(t, E) {
    var i = t % N, j = (t - i) / N, c = i + j * EW, a = E[c], b = E[c + 1], d = E[c + EW], e = E[c + EW + 1];
    var mx = a > b ? a : b, mn = a < b ? a : b;
    if (d > mx) mx = d; if (d < mn) mn = d; if (e > mx) mx = e; if (e < mn) mn = e;
    return mx - mn;
  }
  function tileSlope(i, j) { return Z.inb(i, j) && S.elev ? slopeOfT(i + j * N, S.elev) : 0; }
  function isCliff(i, j) { return tileSlope(i, j) >= 3; }
  function cliffT(t) { return slopeOfT(t, S.elev) >= 3; }
  function heightAt(x, z) {
    var u = x / TILE, v = z / TILE;
    if (u < 0) u = 0; else if (u > N) u = N; if (v < 0) v = 0; else if (v > N) v = N;
    var i = Math.min(N - 1, Math.floor(u)), j = Math.min(N - 1, Math.floor(v)), fu = u - i, fv = v - j, E = S.elev, c = i + j * EW;
    var h = E[c] * (1 - fu) * (1 - fv) + E[c + 1] * fu * (1 - fv) + E[c + EW] * (1 - fu) * fv + E[c + EW + 1] * fu * fv;
    return h * Z.ELEV_STEP;
  }
  // the starting plaza (gate, paths, lab, hatchery) is always flat
  function plazaBounds(n) {
    n = n || N;
    var mid = Math.floor(n / 2), j0 = Math.max(Math.floor(n * 0.68), n - 17);
    return { i0: mid - 6, i1: mid + 5, j0: j0 };
  }
  function entranceTile(i, j) { var p = plazaBounds(N); return i >= p.i0 && i <= p.i1 && j >= p.j0; }
  function footprintFlat(fp, maxSlope) {
    var mn = 99, mx = -99;
    for (var b = 0; b <= fp.h; b++) for (var a = 0; a <= fp.w; a++) {
      var h = S.elev[(fp.i0 + a) + (fp.j0 + b) * EW]; if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return mx - mn <= maxSlope;
  }

  // ---- fences / navigation ----
  function fenceAt(i, j, d) {
    if (d === 0) return S.fenceX[i + j * N];
    if (d === 2) return S.fenceX[i + (j + 1) * N];
    if (d === 3) return S.fenceZ[i + j * (N + 1)];
    return S.fenceZ[(i + 1) + j * (N + 1)];
  }
  function edgeIndex(e) { return e.axis === 'x' ? e.i + e.j * N : e.i + e.j * (N + 1); }
  function edgeValid(e) {
    if (!e || (e.axis !== 'x' && e.axis !== 'z')) return false;
    if (e.axis === 'x') return e.i >= 0 && e.i < N && e.j >= 0 && e.j <= N;
    return e.i >= 0 && e.i <= N && e.j >= 0 && e.j < N;
  }

  function canWalkEdge(a, b, fid) {
    if (!fid) return true;
    var fd = D.fences[fid - 1];
    if (!fd || fd.realm !== 'sea') return false;
    var pa = D.paths[S.path[a] - 1], pb = D.paths[S.path[b] - 1];
    return !!((pa && pa.walk) || (pb && pb.walk));
  }
  function rebuildNav() {
    var nb = RT.nb, pt = RT.pathTiles; pt.length = 0;
    var pp = RT.navP || (RT.navP = new Uint8Array(NN)), E = S.elev;
    for (var q = 0; q < NN; q++) pp[q] = S.path[q] && slopeOfT(q, E) < 3 ? 1 : 0;   // cliff tiles are impassable
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var t = i + j * N, m = 0;
      if (pp[t]) {
        pt.push(t);
        if (j > 0 && pp[t - N] && canWalkEdge(t, t - N, S.fenceX[t])) m |= 1;
        if (i < N - 1 && pp[t + 1] && canWalkEdge(t, t + 1, S.fenceZ[(i + 1) + j * (N + 1)])) m |= 2;
        if (j < N - 1 && pp[t + N] && canWalkEdge(t, t + N, S.fenceX[t + N])) m |= 4;
        if (i > 0 && pp[t - 1] && canWalkEdge(t, t - 1, S.fenceZ[i + j * (N + 1)])) m |= 8;
      }
      nb[t] = m;
    }
    var comp = RT.comp; comp.fill(0);
    var cn = 0, bq = RT.queue;
    for (var p = 0; p < pt.length; p++) {
      var st0 = pt[p]; if (comp[st0]) continue;
      cn++; comp[st0] = cn;
      var qh = 0, qt = 0; bq[qt++] = st0;
      while (qh < qt) {
        var u = bq[qh++], m2 = nb[u];
        if ((m2 & 1) && !comp[u - N]) { comp[u - N] = cn; bq[qt++] = u - N; }
        if ((m2 & 2) && !comp[u + 1]) { comp[u + 1] = cn; bq[qt++] = u + 1; }
        if ((m2 & 4) && !comp[u + N]) { comp[u + N] = cn; bq[qt++] = u + N; }
        if ((m2 & 8) && !comp[u - 1]) { comp[u - 1] = cn; bq[qt++] = u - 1; }
      }
    }
    RT.compN = cn;
    var gc = [];
    for (var gk = 0; gk < 2; gk++) {
      var gt = (GATE_I0 + gk) + GATE_J * N;
      if (comp[gt] && gc.indexOf(comp[gt]) < 0) gc.push(comp[gt]);
    }
    RT.gateComps = gc;
    RT.pathVer++; RT.fields = {};
  }

  function refreshReach() {
    var cn = RT.compN || 0;
    if (!RT.reachComp || RT.reachComp.length <= cn) RT.reachComp = new Uint8Array(cn + 16);
    else RT.reachComp.fill(0);
    var gc = RT.gateComps || [];
    for (var k = 0; k < gc.length; k++) RT.reachComp[gc[k]] = 1;
    if (Z.Monorail && Z.Monorail.markReachable) Z.Monorail.markReachable(RT.reachComp, RT.comp);
  }
  function isParkConnected(t) {
    if (t < 0 || t >= NN) return false;
    var c = RT.comp[t];
    return !!(c && RT.reachComp && RT.reachComp[c]);
  }
  function canGuestReach(fromT, toT) {
    var fc = fromT >= 0 && fromT < NN ? RT.comp[fromT] : 0;
    var tc = toT >= 0 && toT < NN ? RT.comp[toT] : 0;
    if (!fc || !tc) return false;
    if (fc === tc) return true;
    return !!(Z.Monorail && Z.Monorail.canReachComp && Z.Monorail.canReachComp(fc, tc, RT.comp));
  }

  function bfs(sources) {
    var f = new Uint16Array(NN); f.fill(INF);
    var q = RT.queue, h = 0, tl = 0, nb = RT.nb, k;
    for (k = 0; k < sources.length; k++) { var s = sources[k]; if (f[s] === INF && S.path[s]) { f[s] = 0; q[tl++] = s; } }
    if (tl === 0) return null;
    while (h < tl) {
      var t = q[h++], m = nb[t], d = f[t] + 1;
      if (m & 1) { if (f[t - N] === INF) { f[t - N] = d; q[tl++] = t - N; } }
      if (m & 2) { if (f[t + 1] === INF) { f[t + 1] = d; q[tl++] = t + 1; } }
      if (m & 4) { if (f[t + N] === INF) { f[t + N] = d; q[tl++] = t + N; } }
      if (m & 8) { if (f[t - 1] === INF) { f[t - 1] = d; q[tl++] = t - 1; } }
    }
    return f;
  }

  function footprint(def, i, j, rot) {
    var w = def.w || 1, h = def.h || 1;
    rot = ((rot | 0) % 4 + 4) % 4;
    if (rot & 1) { var tmp = w; w = h; h = tmp; }
    return { i0: i, j0: j, w: w, h: h, rot: rot };
  }
  // tiles just outside the FRONT edge (front = +Z at rot 0, +X at rot 1, -Z at rot 2, -X at rot 3), in bounds only
  function frontList(fp) {
    var out = [], a;
    for (a = 0; a < (fp.rot & 1 ? fp.h : fp.w); a++) {
      var x, y;
      if (fp.rot === 0) { x = fp.i0 + a; y = fp.j0 + fp.h; }
      else if (fp.rot === 2) { x = fp.i0 + a; y = fp.j0 - 1; }
      else if (fp.rot === 1) { x = fp.i0 + fp.w; y = fp.j0 + a; }
      else { x = fp.i0 - 1; y = fp.j0 + a; }
      if (x >= 0 && y >= 0 && x < N && y < N) out.push({ i: x, j: y });
    }
    return out;
  }
  function frontPathTiles(o, out) {
    var fl = frontList(objFootprint(o)); out = out || [];
    for (var k = 0; k < fl.length; k++) { var t = fl[k].i + fl[k].j * N; if (S.path[t]) out.push(t); }
    return out;
  }
  function objFootprint(o) {
    var def = o.kind === 'building' ? BD[o.type] : SC[o.type];
    return footprint(def, o.i, o.j, o.rot || 0);
  }
  function adjacentPathTiles(o, out) {
    var fp = objFootprint(o), seen = {};
    out = out || [];
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      for (var d = 0; d < 4; d++) {
        var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        var t = ni + nj * N;
        if (S.path[t] && !seen[t]) { seen[t] = 1; out.push(t); }
      }
    }
    return out;
  }

  function sourcesFor(key) {
    var k, o, c;
    if (key === 'exit') {
      var r = []; for (k = 0; k < 2; k++) { c = (GATE_I0 + k) + GATE_J * N; if (S.path[c]) r.push(c); } return r;
    }
    var ch = key.charAt(0);
    if (key === 'bench' || key === 'bin') {
      var res = [], list = RT.byType[key];
      for (k = 0; k < list.length; k++) {
        o = list[k];
        if (key === 'bin' && (o.fill || 0) >= 15) continue;
        adjacentPathTiles(o, res);
      }
      return res;
    }
    if (ch === 'b') { o = RT.oById.get(+key.slice(1)); return o ? (o.kind === 'building' ? frontPathTiles(o) : adjacentPathTiles(o)) : null; }
    if (ch === 'e') { var e = encById(+key.slice(1)); return e ? e.viewTiles : null; }
    if (ch === 't') { var tt = +key.slice(1); return S.path[tt] ? [tt] : null; } // single path tile (guest spots / landmarks)
    return null;
  }
  function getField(key) {
    var f = RT.fields[key];
    if (f) return f; if (f === 0) return null;
    var src = sourcesFor(key);
    f = src && src.length ? bfs(src) : null;
    RT.fields[key] = f || 0;
    return f;
  }

  // generic BFS route over path tiles (staff). pred(tile) -> bool. returns array of tiles (excluding start) or null
  function findRoute(from, pred, maxDepth) {
    if (!S.path[from]) return null;
    if (pred(from)) return [];
    var st = ++RT.stampN, stamp = RT.stamp, q = RT.queue, prev = RT.prev, nb = RT.nb, h = 0, tl = 0;
    q[tl++] = from; stamp[from] = st; prev[from] = -1;
    var found = -1, lim = maxDepth || 99999;
    while (h < tl) {
      var t = q[h++], m = nb[t];
      for (var d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        var n = t + DT4[d];
        if (stamp[n] === st) continue;
        stamp[n] = st; prev[n] = t; q[tl++] = n;
        if (pred(n)) { found = n; h = tl; break; }
      }
    }
    if (found < 0) return null;
    var route = [], c = found;
    while (c !== from) { route.push(c); c = prev[c]; }
    route.reverse();
    return route;
  }

  // ---- object / terrain derived data ----
  function rebuildObjects() {
    RT.oById.clear(); RT.block.fill(0); RT.shelter.fill(0);
    var bt = RT.byType; bt.food = []; bt.drink = []; bt.toilet = []; bt.fun = []; bt.bench = []; bt.bin = [];
    RT.hasHut = false; RT.huts.length = 0; RT.hasVet = false; RT.vets.length = 0; RT.hasEdu = false;
    RT.allLabs = []; RT.allHatch = []; RT.allBunkers = []; RT.allPlat = []; RT.skeletons = 0;
    S.tileObj.fill(0);
    for (var k = 0; k < S.objects.length; k++) {
      var o = S.objects[k]; RT.oById.set(o.id, o);
      var fp = objFootprint(o), def, solid = false, shelter = false;
      if (o.kind === 'building') {
        def = BD[o.type]; solid = true;
        if (def.type === 'food') bt.food.push(o); else if (def.type === 'drink') bt.drink.push(o);
        else if (def.type === 'toilet') bt.toilet.push(o);
        else if (def.type === 'shop' || def.type === 'ride' || def.type === 'info' || def.type === 'science') { if (o.type !== 'emergency_bunker') bt.fun.push(o); }
        if (o.type === 'research_lab') RT.allLabs.push(o); else if (o.type === 'hatchery') RT.allHatch.push(o);
        else if (o.type === 'emergency_bunker') RT.allBunkers.push(o); else if (o.type === 'viewing_platform' || def.plat) RT.allPlat.push(o);   // realms package: galleries, grandstand, canopy tower
        if (o.type === 'keeper_hut') { RT.hasHut = true; RT.huts.push(o); } if (o.type === 'vet_clinic') { RT.hasVet = true; RT.vets.push(o); } if (o.type === 'education_centre') RT.hasEdu = true;
      } else {
        def = SC[o.type]; if (o.type === 'fossil_skeleton') RT.skeletons++;
        solid = def.kind === 'tree' || def.kind === 'rock';
        shelter = def.kind === 'shelter';
        if (o.type === 'bench') bt.bench.push(o); else if (o.type === 'bin') bt.bin.push(o);
        else if (def.inEnclosure === false) solid = true;
      }
      for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
        var t = (fp.i0 + a) + (fp.j0 + b) * N;
        S.tileObj[t] = o.id;
        if (solid) RT.block[t] = 1;
        if (shelter) RT.shelter[t] = 1;
      }
    }
  }
  function buildingConnected(o) {
    if (!RT.reachComp) refreshReach();
    var adj = o.kind === 'building' ? frontPathTiles(o) : adjacentPathTiles(o);
    for (var k = 0; k < adj.length; k++) if (isParkConnected(adj[k])) return true;
    return false;
  }

  // connected science / safety facilities (needs the path network and the object lists to be current)
  function refreshFacilities() {
    var k, o, a, b;
    RT.labs = []; RT.hatcheries = []; RT.bunkers = []; RT.platforms = [];
    RT.labNear.fill(0); RT.platTile.fill(0);
    if (!RT.reachComp) refreshReach();
    function conn(ob) { var fr = frontPathTiles(ob); for (var q = 0; q < fr.length; q++) if (isParkConnected(fr[q])) return true; return false; }
    for (k = 0; k < RT.allLabs.length; k++) {
      o = RT.allLabs[k]; if (!conn(o)) continue;
      RT.labs.push(o);
      var fr = frontPathTiles(o);
      for (var q = 0; q < fr.length; q++) {
        var fi = fr[q] % N, fj = (fr[q] - fi) / N;
        for (b = -3; b <= 3; b++) for (a = -3; a <= 3; a++) {
          if (Math.abs(a) + Math.abs(b) > 3) continue;
          var x = fi + a, y = fj + b; if (Z.inb(x, y) && S.path[x + y * N]) RT.labNear[x + y * N] = 1;
        }
      }
    }
    for (k = 0; k < RT.allHatch.length; k++) { o = RT.allHatch[k]; if (conn(o)) RT.hatcheries.push(o); }
    for (k = 0; k < RT.allBunkers.length; k++) { o = RT.allBunkers[k]; if (conn(o)) RT.bunkers.push(o); }
    for (k = 0; k < RT.allPlat.length; k++) {
      o = RT.allPlat[k]; if (!conn(o)) continue;
      var fp = objFootprint(o), tl = [];
      for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) tl.push((fp.i0 + a) + (fp.j0 + b) * N);
      var front = frontPathTiles(o); for (a = 0; a < front.length; a++) RT.platTile[front[a]] = 1;
      RT.platforms.push({ o: o, tiles: tl, front: front });
    }
  }

  // reputation / panic cost of a dangerous animal getting loose
  function onEscape(a) {
    var d = aDanger(a);
    if (d >= 2) {
      var f = (RT.bunkers.length ? 0.4 : 1) * (RT.secCount ? 0.7 : 1);
      S.panic = Math.min(2, (S.panic || 0) + 0.25 * d * f);
      S.reputation = clamp(S.reputation - 2.5 * d * f, 0, 100);
    } else if (d === 1) S.panic = Math.min(2, (S.panic || 0) + 0.04);
  }

  // ---- enclosures ----
  function encById(id) { return (RT.eMap && RT.eMap[id]) || null; }
  function encOfTile(t) { var id = S.tileEnc[t]; return id ? encById(id) : null; }

  function recomputeEnclosures() {
    var oldTE = S.tileEnc.slice(), oldById = {}, k, t;
    for (k = 0; k < S.enclosures.length; k++) oldById[S.enclosures[k].id] = S.enclosures[k];
    var lab = new Int16Array(NN), regions = [], stack = RT.queue;
    if (S.ditch) for (t = 0; t < NN; t++) if (S.ditch[t]) lab[t] = -2;   // ditch tiles are barrier tiles: never part of an enclosure
    if (Z.Realms) Z.Realms.markBarrier(lab, regions);   // realms package: tank/dome/zone tiles and sea pens
    for (var s0 = 0; s0 < NN; s0++) {
      if (lab[s0]) continue;
      var sp = 0, leak = false, tiles = [];
      stack[sp++] = s0; lab[s0] = -1;
      while (sp > 0) {
        t = stack[--sp]; tiles.push(t);
        var i = t % N, j = (t - i) / N;
        // north
        if (j === 0) { if (!S.fenceX[t]) leak = true; } else if (!S.fenceX[t] && !lab[t - N]) { lab[t - N] = -1; stack[sp++] = t - N; }
        // south
        if (j === N - 1) { if (!S.fenceX[t + N]) leak = true; } else if (!S.fenceX[t + N] && !lab[t + N]) { lab[t + N] = -1; stack[sp++] = t + N; }
        // west
        if (i === 0) { if (!S.fenceZ[i + j * (N + 1)]) leak = true; } else if (!S.fenceZ[i + j * (N + 1)] && !lab[t - 1]) { lab[t - 1] = -1; stack[sp++] = t - 1; }
        // east
        if (i === N - 1) { if (!S.fenceZ[(i + 1) + j * (N + 1)]) leak = true; } else if (!S.fenceZ[(i + 1) + j * (N + 1)] && !lab[t + 1]) { lab[t + 1] = -1; stack[sp++] = t + 1; }
      }
      if (!leak && tiles.length <= MAX_ENC_TILES) regions.push(tiles);
    }
    // match ids by overlap
    var pairs = [];
    for (var r = 0; r < regions.length; r++) {
      var cnt = {}, tl = regions[r];
      for (k = 0; k < tl.length; k++) { var o = oldTE[tl[k]]; if (o) cnt[o] = (cnt[o] || 0) + 1; }
      for (var id in cnt) pairs.push([cnt[id], r, +id]);
    }
    pairs.sort(function (a, b) { return b[0] - a[0]; });
    var assigned = new Array(regions.length), used = {};
    for (k = 0; k < pairs.length; k++) {
      var pr = pairs[k];
      if (assigned[pr[1]] !== undefined || used[pr[2]]) continue;
      assigned[pr[1]] = pr[2]; used[pr[2]] = 1;
    }
    var newEncs = [], encCounter = 0;
    S.tileEnc.fill(0);
    RT.encx = {};
    var maxNum = 0;
    for (k = 0; k < S.enclosures.length; k++) { var nm = /^Enclosure (\d+)$/.exec(S.enclosures[k].name || ''); if (nm) maxNum = Math.max(maxNum, +nm[1]); }
    for (r = 0; r < regions.length; r++) {
      var tiles2 = regions[r], oe = assigned[r] !== undefined ? oldById[assigned[r]] : null, enc;
      if (oe) enc = oe;
      else {
        enc = { id: newId(), name: 'Enclosure ' + (++maxNum), auto: true, poop: 0, foodLevel: 1, waterLevel: 1, breach: 0 };
      }
      enc.tiles = tiles2; enc.area = tiles2.length;
      var sx = 0, sz = 0;
      for (k = 0; k < tiles2.length; k++) { t = tiles2[k]; S.tileEnc[t] = enc.id; sx += cxOf(t); sz += czOf(t); }
      enc.cx = tiles2.length ? sx / tiles2.length : N * TILE / 2;
      enc.cz = tiles2.length ? sz / tiles2.length : N * TILE / 2;
      if (Z.Realms) { if (tiles2.kind) Z.Realms.stampPen(enc, tiles2); else Z.Realms.unstamp(enc); }   // realms package
      enc.animals = []; enc.species = []; enc.suitability = enc.suitability || {};
      newEncs.push(enc);
    }
    if (Z.Realms) Z.Realms.defEncs(newEncs, oldById);   // realms package
    S.enclosures = newEncs;
    RT.eMap = {}; for (k = 0; k < newEncs.length; k++) RT.eMap[newEncs[k].id] = newEncs[k];
    for (r = 0; r < newEncs.length; r++) buildEncGeom(newEncs[r]);
    // re-home animals
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k], at = tileOf(a.x, a.z), ne = S.tileEnc[at];
      if (a.state === 'escaped' || !a.enc) {
        if (ne && (!Z.Realms || Z.Realms.homeOK(a, RT.eMap[ne]))) { a.enc = ne; a.state = 'idle'; a.tg = ''; a.st = 1; a.wx = 0; a.wz = 0; a.aroute = null; if (Z.Realms) Z.Realms.landed(a); }
      } else if (ne !== a.enc) {
        if (ne && Z.Realms && !Z.Realms.homeOK(a, RT.eMap[ne])) ne = 0;   // realms package: a sea/air animal never settles in the wrong kind of enclosure
        if (ne) a.enc = ne;
        else {
          var oldE = a.enc; a.home = oldE; a.enc = 0; a.state = 'escaped'; a.esc = 0; a.claim = 0; a.tg = ''; a.wx = 0; a.wz = 0; a.aroute = null;
          S.stats.escapes++; msg('The ' + SP[a.species].name.toLowerCase() + ' ' + a.name + ' has wandered out of its enclosure!', 'bad');
          onEscape(a); bus.emit('escape', a);
        }
      }
      if (a.enc && !aok(a, at)) { var he = RT.eMap[a.enc]; if (he && (!Z.Realms || !he.kind)) relocateAnimal(a, he); }
    }
    refreshEncAnimals();
    for (r = 0; r < newEncs.length; r++) encStats(newEncs[r]);
    RT.fields = {};
    bus.emit('enclosures');
  }

  // does a plant thrive where it stands? true / false for trees and bushes, null for everything else
  function plantThrives(o, sd) {
    if (!sd || (sd.kind !== 'tree' && sd.kind !== 'bush') || !sd.terrains) return null;
    var t = o.i + o.j * N, tn = D.terrain[S.terrain[t]].id;
    if (sd.terrains.indexOf(tn) < 0) return false;
    if (sd.waterEdge) {
      var i = o.i, j = o.j;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
        var x = i + di, y = j + dj; if (Z.inb(x, y) && S.terrain[x + y * N] === WATER && !seaMask()[x + y * N]) return true;
      }
      return false;
    }
    return true;
  }
  function buildEncGeom(enc) {
    var E = { feed: -1, drink: [], water: [], shelter: [], toy: [], carc: [], out: [], pred: 0, tr: {}, plat: {}, terr: new Array(D.terrain.length), fol: {}, trees: 0, rocks: 0, shelters: 0, aes: 0, blocked: 0, cliffs: 0, relief: 0, thrive: 0, struggle: 0,
      vis: 0, happy: 60, babies: 0, appeal: 0, nAn: 0, bySp: {} };
    var k, t, d, tiles = enc.tiles, SEA = seaMask();
    for (k = 0; k < E.terr.length; k++) E.terr[k] = 0;
    var minS = 99, minLit = 99, seeSum = 0, cnt = 0, slopeSum = 0;
    var best = 1e9, bi = -1;
    for (k = 0; k < tiles.length; k++) {
      t = tiles[k]; var i = t % N, j = (t - i) / N;
      E.terr[S.terrain[t]]++;
      if (S.terrain[t] === WATER && !SEA[t]) E.water.push(t);   // island: only fresh water counts for drinking (see notes/island.md)
      if (RT.shelter[t]) E.shelter.push(t);
      var oid = S.tileObj[t];
      if (oid) {
        var o = RT.oById.get(oid);
        if (o && o.kind === 'scenery') {
          var sd = SC[o.type];
          if (o.i === i && o.j === j) {
            var th = plantThrives(o, sd);   // liked plants count 1.0 where they thrive, 0.5 where they struggle
            E.fol[o.type] = (E.fol[o.type] || 0) + (th === false ? 0.5 : 1); E.aes += sd.aesthetic;
            if (th === true) E.thrive++; else if (th === false) E.struggle++;
            if (sd.kind === 'tree' || sd.kind === 'bush') E.trees++;
            if (sd.kind === 'rock') E.rocks++;
            if (sd.kind === 'shelter') E.shelters++;
            if (o.type === 'carcass_feeder') E.carc.push(t); else if (sd.kind === 'toy') E.toy.push(t);
          }
        }
      }
      if (RT.block[t]) E.blocked++;
      var sl = slopeOfT(t, S.elev); slopeSum += sl; if (sl >= 3) E.cliffs++;
      for (d = 0; d < 4; d++) {
        var f = fenceAt(i, j, d);
        if (!f) continue;
        var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
        var nt = (ni < 0 || nj < 0 || ni >= N || nj >= N) ? -1 : ni + nj * N;
        if (nt >= 0 && S.tileEnc[nt] === enc.id) continue;
        var fd = D.fences[f - 1], fsr = fd.strength;
        if (fd.electric && Z.Power) { fsr = Z.Power.fenceStrength(fd, i, j); E.elec = (E.elec || 0) + 1; if (fsr < fd.strength) { E.dead = (E.dead || 0) + 1; if (fsr < (E.minDead === undefined ? 99 : E.minDead)) E.minDead = fsr; } else if (fsr < (E.minLive === undefined ? 99 : E.minLive)) E.minLive = fsr; }   // power package: electric fences are strong only while powered
        else if (fd.strength < (E.minPlain === undefined ? 99 : E.minPlain)) E.minPlain = fd.strength;
        if (fd.strength < minLit) minLit = fd.strength;
        if (fsr < minS) minS = fsr;
        seeSum += fd.seeThrough ? 1 : (fd.height <= 1.3 ? 0.5 : 0.05); cnt++;
        if (nt >= 0) E.out.push(nt);
      }
      var dx = cxOf(t) - enc.cx, dz = czOf(t) - enc.cz, dd = dx * dx + dz * dz;
      if (!RT.block[t] && S.terrain[t] !== WATER && sl < 3 && dd < best) { best = dd; bi = t; }
    }
    E.relief = tiles.length ? slopeSum / tiles.length : 0;
    E.feed = bi >= 0 ? bi : tiles[0];
    // drinking tiles: land tiles next to water
    if (E.water.length) {
      for (k = 0; k < tiles.length; k++) {
        t = tiles[k]; if (S.terrain[t] === WATER || RT.block[t] || cliffT(t)) continue;
        var ii = t % N, jj = (t - ii) / N;
        if ((ii > 0 && S.terrain[t - 1] === WATER && !SEA[t - 1]) || (ii < N - 1 && S.terrain[t + 1] === WATER && !SEA[t + 1]) || (jj > 0 && S.terrain[t - N] === WATER && !SEA[t - N]) || (jj < N - 1 && S.terrain[t + N] === WATER && !SEA[t + N])) E.drink.push(t);
      }
    }
    enc.minFence = minS === 99 ? 5 : minS;
    E.minLit = minLit === 99 ? 5 : minLit;   // power package: strength if every electric fence were live
    enc.see = cnt ? seeSum / cnt : 1;
    if (Z.Moats) Z.Moats.encGeom(enc, E, cnt, seeSum);
    if (Z.Realms) Z.Realms.encGeom(enc, E, cnt, seeSum);   // realms package: tank/pen/dome/zone geometry   // moats package: ditch boundary lines, moat drinking water, view bonus (may adjust enc.see)
    // view tiles: path tiles within 3 tiles of the enclosure
    var st = ++RT.stampN, stamp = RT.stamp, q = RT.queue, prev = RT.prev, qh = 0, qt = 0, vt = [];
    for (k = 0; k < tiles.length; k++) { stamp[tiles[k]] = st; prev[tiles[k]] = 0; q[qt++] = tiles[k]; }
    while (qh < qt) {
      t = q[qh++]; var dep = prev[t];
      if (dep >= 3) continue;
      var ti2 = t % N, tj2 = (t - ti2) / N;
      for (d = 0; d < 4; d++) {
        var ai = ti2 + (d === 1 ? 1 : d === 3 ? -1 : 0), aj = tj2 + (d === 2 ? 1 : d === 0 ? -1 : 0);
        if (ai < 0 || aj < 0 || ai >= N || aj >= N) continue;
        var at = ai + aj * N;
        if (stamp[at] === st) continue;
        stamp[at] = st; prev[at] = dep + 1; q[qt++] = at;
        if (S.path[at] && S.tileEnc[at] !== enc.id && RT.nb[at]) vt.push(at);
      }
    }
    E.plat = {}; enc.platform = false;
    for (k = 0; k < RT.platforms.length; k++) {
      var pl = RT.platforms[k], near = false;
      for (d = 0; d < pl.tiles.length; d++) if (stamp[pl.tiles[d]] === st) { near = true; break; }
      if (!near) continue;
      enc.platform = true;
      for (d = 0; d < pl.front.length; d++) { E.plat[pl.front[d]] = 1; if (vt.indexOf(pl.front[d]) < 0) vt.push(pl.front[d]); }
    }
    if (Z.Moats) Z.Moats.encView(enc, vt);   // guests can watch across a moat
    if (Z.Realms) Z.Realms.encView(enc, vt, E);   // realms package: tunnels, galleries, grandstand
    enc.viewTiles = vt;
    RT.encx[enc.id] = E;
  }

  function refreshEncAnimals() {
    var k, e;
    for (k = 0; k < S.enclosures.length; k++) { e = S.enclosures[k]; e.animals.length = 0; e.species.length = 0; }
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k]; if (!a.enc) continue;
      e = encById(a.enc); if (!e) continue;
      e.animals.push(a.id);
      if (e.species.indexOf(a.species) < 0) e.species.push(a.species);
    }
  }

  var ISSUE_TERR = {};
  // suitability weights (relative; water/shelter/rocks/carcass apply only to species that need them)
  var HW = { terrain: 0.22, space: 0.2, foliage: 0.12, water: 0.14, shelter: 0.1, rocks: 0.06, social: 0.1, clean: 0.06, carcass: 0.05, enrichment: 0.05 };
  // donor genes shift what a species needs from its enclosure: extra liked ground (arctic coat) and stronger fences (fx.fence). Applies when every animal of the species here carries the gene.
  var GT_CACHE = {};
  function geneTerrain(sp, trs, nHere) {
    if (!trs) return sp.terrainPrefs;
    var key = '', add = null, id, x, t;
    for (id in trs) { x = TR[id] && TR[id].fx; if (x && x.terrain && trs[id] >= nHere) { key += id + ','; add = add || {}; for (t in x.terrain) add[t] = (add[t] || 0) + x.terrain[t]; } }
    if (!add) return sp.terrainPrefs;
    key = sp.id + '|' + key; if (GT_CACHE[key]) return GT_CACHE[key];
    var out = {}; for (t in sp.terrainPrefs) out[t] = sp.terrainPrefs[t]; for (t in add) out[t] = (out[t] || 0) + add[t];
    return (GT_CACHE[key] = out);
  }
  function geneFence(trs, nHere) { var d = 0, id; if (trs) for (id in trs) if (trs[id] >= nHere && TR[id] && TR[id].fx && TR[id].fx.fence) d += TR[id].fx.fence; return d; }
  function suitFor(enc, E, spId, n) {
    if (Z.Realms && enc.kind) { var rsu = Z.Realms.suit(enc, E, spId, n); if (rsu) return rsu; }   // realms package: sea and air rules
    var sp = SP[spId], area = enc.area, k, iss = [];
    if (n < 1) n = 1;
    // terrain
    var prefs = geneTerrain(sp, E.tr[spId], E.bySp[spId] || 1), hasWaterPref = prefs.water > 0, tot = 0, tcounts = E.terr;
    for (k = 0; k < tcounts.length; k++) { if (k === WATER && !hasWaterPref) continue; tot += tcounts[k]; }
    var l1 = 0, psum = 0, id;
    for (id in prefs) if (id !== 'water' || hasWaterPref) psum += prefs[id];
    if (tot < 1) tot = 1; if (psum <= 0) psum = 1;
    for (k = 0; k < tcounts.length; k++) {
      if (k === WATER && !hasWaterPref) continue;
      var tid = D.terrain[k].id, want = (prefs[tid] || 0) / psum, have = tcounts[k] / tot;
      l1 += Math.abs(want - have);
    }
    var terrain = clamp(1 - l1 / 2, 0, 1);
    var trs = E.tr[spId], nHere = E.bySp[spId] || 1, hf = trs ? Math.min(1, (trs.hardy || 0) / nHere) : 0;
    if (hf) terrain += (1 - terrain) * 0.45 * hf;
    if (terrain < 0.7) {
      var top = '', tv = 0; for (id in prefs) if (prefs[id] > tv) { tv = prefs[id]; top = id; }
      iss.push('Prefers ' + (D.terrain[TI[top]] ? D.terrain[TI[top]].name.toLowerCase() : top) + ' terrain');
    }
    // space
    var per = Math.max(0, area - E.blocked * 0.5 - (E.cliffs || 0)) / n, space = clamp(per / sp.space, 0, 1);
    if (space < 0.8) iss.push(space < 0.5 ? 'Needs a much bigger enclosure' : 'Needs a bigger enclosure');
    // foliage
    var liked = 0; for (k = 0; k < sp.foliage.length; k++) liked += E.fol[sp.foliage[k]] || 0;
    var need = Math.max(2, Math.ceil(area / 16));
    var foliage = clamp(Math.min(1, liked / need) * 0.8 + Math.min(1, E.trees / need) * 0.2, 0, 1);
    if (hf) foliage += (1 - foliage) * 0.45 * hf;
    if (E.struggle && foliage < 0.9) iss.push('Some plants are struggling on the wrong terrain');
    if (foliage < 0.6) iss.push('Needs more of its favourite plants (' + sp.foliage.slice(0, 2).map(function (f) { return SC[f] ? SC[f].name.toLowerCase() : f; }).join(', ') + ')');
    // water
    var water = 1, wN = 0, wW = 0;
    if (sp.needsWater) {
      wN = Math.max(2, Math.ceil(area * 0.06)); water = clamp((E.water.length + (E.moatN || 0)) / wN, 0, 1); wW = HW.water;
      if (water < 0.8) iss.push(E.water.length + (E.moatN || 0) ? 'Needs more water' : 'Needs water');
    }
    var shelter = 1, sW = 0;
    if (sp.needsShelter) {
      sW = HW.shelter; shelter = clamp(E.shelters / Math.max(1, Math.ceil(area / 30)), 0, 1);
      if (shelter < 1) iss.push('Needs a shelter');
    }
    var rocks = 1, rW = 0;
    if (sp.needsRocks) {
      rW = HW.rocks; var rugged = Math.min(0.4, (E.relief || 0) * 0.25);   // rugged ground stands in for some rocks
      rocks = clamp(E.rocks / Math.max(1, Math.ceil(area / 24)) + rugged, 0, 1);
      if (rocks < 1) iss.push(rugged > 0.05 ? 'Needs more rocks (rugged ground helps)' : 'Needs rocks');
    }
    // enrichment: toys such as scratching posts and mud wallows
    var enrich = clamp(E.toy.length / Math.max(1, Math.ceil(area / 40)), 0, 1);
    if (enrich < 0.5) iss.push('Would enjoy some enrichment (mud wallow, scratching post)');
    // social
    var social, mn = sp.social[0], mx = sp.social[1];
    if (n >= mn && n <= mx) social = 1;
    else if (n < mn) { social = 0.4 + 0.6 * (n / mn); iss.push('Needs more of its own kind (at least ' + mn + ')'); }
    else { social = Math.max(0.3, 1 - 0.2 * (n - mx)); iss.push('Too many of this species (max ' + mx + ')'); }
    var clean = clamp(1 - enc.poop / (area / 3 + 3), 0, 1);
    if (clean < 0.6) iss.push('Enclosure is dirty');
    var carc = 1, cW = 0;
    if (sp.predator) { cW = HW.carcass; carc = E.carc.length ? 1 : 0.3; if (carc < 1) iss.push('Needs a carcass feeder'); }
    var wts = HW.terrain + HW.space + HW.foliage + wW + sW + rW + HW.social + HW.clean + cW + HW.enrichment;
    var v = (terrain * HW.terrain + space * HW.space + foliage * HW.foliage + water * wW + shelter * sW + rocks * rW + social * HW.social + clean * HW.clean + carc * cW + enrich * HW.enrichment) / wts;
    v = clamp(v, 0, 1);
    var mf = Math.min(5, sp.minFence + geneFence(trs, nHere)) - (trs && trs.docile >= nHere ? 1 : 0);
    if (enc.minFence < mf) iss.push('Fence is too weak (needs strength ' + mf + ')');
    if (Z.Moats) { var mw = Z.Moats.advice(enc, spId, trs, nHere); if (mw) iss.unshift(mw); }   // moats package: ditch too narrow / shallow / swimmer
    if (Z.Realms && enc.kind) v = clamp(v * Z.Realms.fixIssues(enc, iss), 0, 1);   // realms package: virtual land zones
    return { value: v, terrain: terrain, space: space, foliage: foliage, water: water, shelter: shelter, rocks: rocks, social: social, clean: clean, carcass: carc, enrichment: enrich, minFence: mf, issues: iss };
  }

  function encStats(enc) {
    var E = RT.encx[enc.id]; if (!E) return;
    var bySp = {}, k;
    E.vis = 0; E.babies = 0; E.appeal = 0; E.happy = 0; E.nAn = 0; E.pred = 0; E.tr = {};
    for (k = 0; k < enc.animals.length; k++) {
      var a = RT.aById.get(enc.animals[k]); if (!a) continue;
      bySp[a.species] = (bySp[a.species] || 0) + 1;
      if (isPredator(SP[a.species])) E.pred++;
      if (a.traits && a.traits.length) { var tt = E.tr[a.species] || (E.tr[a.species] = {}); for (var q = 0; q < a.traits.length; q++) tt[a.traits[q]] = (tt[a.traits[q]] || 0) + 1; }
      E.nAn++; E.happy += a.happiness; E.appeal += aAppeal(a);
      if (a.baby) E.babies++;
      if (a.state !== 'sleep' && a.state !== 'sick' && !RT.shelter[tileOf(a.x, a.z)]) E.vis++;
    }
    E.happy = E.nAn ? E.happy / E.nAn : 60;
    E.bySp = bySp;
    enc.suitability = {};
    E.breakdown = {};
    for (var sp in bySp) {
      var r = suitFor(enc, E, sp, bySp[sp]);
      enc.suitability[sp] = r.value; E.breakdown[sp] = r;
    }
  }

  // ====================== ACTIONS ======================
  function isGateTile(i, j) { return j === GATE_J && (i === GATE_I0 || i === GATE_I0 + 1); }

  function refreshConnectivity() {
    if (RT.inWorld) return;
    var prevPlat = RT.platforms.map(function (p) { return p.o.id; }).join(',');
    refreshReach();
    refreshFacilities();
    var nextPlat = RT.platforms.map(function (p) { return p.o.id; }).join(',');
    if (nextPlat !== prevPlat) {
      recomputeEnclosures();
      if (Z.Realms) Z.Realms.update();
    }
    RT.rbDirty = true;
  }

  function afterWorldChange(navChanged) {
    RT.inWorld = true;
    try {
      RT.sea = null;   // island: sea mask is derived from terrain + elev
      if (navChanged) rebuildNav();
      rebuildObjects();
      RT.fields = {};
      if (Z.Monorail && Z.Monorail.updateGraph) Z.Monorail.updateGraph();   // monorail graph before reach/facilities
      refreshReach();
      refreshFacilities();
      if (Z.Power) Z.Power.update();   // power package: nodes, generators, consumers, coverage (before moats and enclosures: pumps & electric fences read it)
      if (Z.Moats) Z.Moats.update();   // moats package: ditch networks, water supply (before enclosures are rebuilt)
      recomputeEnclosures();
      if (Z.Realms) Z.Realms.update();   // realms package: towers, plants, tank supply, zone cover (after enclosures are known)
      if (Z.Monorail) Z.Monorail.update();   // monorail package: track graph, lines, pylons, enclosures overlooked (after enclosures are known)
      if (Z.Safari) Z.Safari.update();   // safari package: zones, routes, gates (after enclosures and realms are known)
      RT.rbDirty = true;
    } finally {
      RT.inWorld = false;
    }
  }

  // ---- undo journal ----
  var UNDO_MAX = 40;
  function jBegin(label) {
    if (RT.undoBusy) return;
    if (!RT.stroke) { RT.stroke = { label: label || 'Change', ops: [], net: 0 }; RT.strokeDepth = 0; }
    RT.strokeDepth++;
  }
  function jEnd() {
    if (RT.undoBusy || !RT.stroke) return;
    if (--RT.strokeDepth > 0) return;
    RT.strokeDepth = 0;
    var st = RT.stroke; RT.stroke = null;
    if (st.ops.length) { RT.undo.push(st); if (RT.undo.length > UNDO_MAX) RT.undo.shift(); }
  }
  function jOp(op) { if (RT.undoBusy || !RT.stroke) return; RT.stroke.ops.push(op); RT.stroke.net += op.net || 0; }
  function beginStroke(label) { jBegin(label); }
  function endStroke() { jEnd(); }
  function canUndo() {
    var n = RT.undo.length;
    return { count: n, label: n ? RT.undo[n - 1].label : '', refund: n ? Math.round(RT.undo[n - 1].net || 0) : 0 };
  }

  function paintTerrain(i, j, terrainId, radius, opts) {
    opts = opts || {}; var dry = dryOf(arguments);
    var ti = TI[terrainId]; if (ti === undefined) return fail('Unknown terrain');
    radius = +radius || 0;
    var cost = 0, n = 0, i0 = 999, j0 = 999, i1 = -1, j1 = -1, di, dj, list = [];
    var r2 = radius <= 0 ? 0 : radius * radius + 1, outside = 0;
    var rr = Math.ceil(radius);
    for (dj = -rr; dj <= rr; dj++) for (di = -rr; di <= rr; di++) {
      if (radius > 0 && di * di + dj * dj > r2) continue;
      var x = i + di, y = j + dj;
      if (!Z.inb(x, y)) continue;
      if (!inMap(x, y)) { outside++; continue; }
      var t = x + y * N;
      if (S.terrain[t] === ti) continue;
      if (seaMask()[t]) continue;   // the open sea cannot be painted over
      if (ti === WATER && S.ditch[t]) continue;   // fill a ditch in before flooding it
      if (ti === WATER && (S.path[t] || (S.tileObj[t] && RT.oById.get(S.tileObj[t]) && RT.oById.get(S.tileObj[t]).type !== 'ice_floe'))) continue;
      list.push(t); cost += D.terrain[ti].cost; n++;
      if (x < i0) i0 = x; if (y < j0) j0 = y; if (x > i1) i1 = x; if (y > j1) j1 = y;
    }
    if (!n && outside) return fail('Outside your land');
    if (!n) return fail(ti === WATER ? 'Nothing to change here (paths and buildings block water)' : 'Already that terrain');
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    var old = [], k;
    for (k = 0; k < list.length; k++) { old.push(S.terrain[list[k]]); S.terrain[list[k]] = ti; }
    spend(cost, 'construction');
    jBegin('Terrain'); jOp({ k: 'terr', ts: list, old: old, nw: ti, net: cost, box: [i0, j0, i1, j1] }); jEnd();
    bus.emit('terrain', { i0: i0, j0: j0, i1: i1, j1: j1 });
    afterWorldChange(false);
    return okr(cost);
  }

  // ---- terraforming ----
  // brush over tile corners; mode raise|lower|level|smooth; opts.sharp = no falloff (plateaus / cliffs); opts.target = level height; trailing {dry:true} = cost only
  function terraform(i, j, mode, radius, opts) {
    var dry = dryOf(arguments);
    opts = (opts && typeof opts === 'object') ? opts : {};
    if (mode !== 'raise' && mode !== 'lower' && mode !== 'level' && mode !== 'smooth') return fail('Unknown terrain tool');
    if (!Z.inb(i, j)) return fail('Outside your land');
    if (!inMap(i, j)) return fail('Outside your land');
    radius = Math.max(0, +radius || 0);
    var E = S.elev, m = S.map, sharp = !!opts.sharp || radius <= 0, reach = radius + 0.8, cx = i + 0.5, cy = j + 0.5;
    var amp = radius >= 2 ? 2 : 1, rr = Math.ceil(reach) + 1, di, dj, k, c;
    // level target: given, else the mean height of the clicked tile's corners
    var target = 0;
    if (mode === 'level') {
      if (typeof opts.target === 'number') target = opts.target;
      else target = Math.round((E[i + j * EW] + E[i + 1 + j * EW] + E[i + (j + 1) * EW] + E[i + 1 + (j + 1) * EW]) / 4);
      target = clamp(Math.round(target), ELEV_MIN, ELEV_MAX);
    }
    // locked corners: next to a building, the entrance plaza, or outside the land
    var SEAN = seaNear(), SEAM = seaMask();
    function locked(ci, cj) {
      if (ci < m.i0 || cj < m.j0 || ci > m.i1 + 1 || cj > m.j1 + 1) return true;
      if (cornerSea(ci, cj, SEAM)) return true;   // island: the sea floor is not editable
      for (var b = -1; b <= 0; b++) for (var a = -1; a <= 0; a++) {
        var x = ci + a, y = cj + b; if (!Z.inb(x, y)) continue;
        if (entranceTile(x, y)) return true;
        var oid = S.tileObj[x + y * N];
        if (oid) { var ob = RT.oById.get(oid); if (ob && ob.kind === 'building') return true; }
      }
      return false;
    }
    var cs = [], nw = {}, old = {};
    for (dj = -rr; dj <= rr + 1; dj++) for (di = -rr; di <= rr + 1; di++) {
      var ci = i + di, cj = j + dj;
      if (ci < 0 || cj < 0 || ci > N || cj > N) continue;
      var d = Math.sqrt((ci - cx) * (ci - cx) + (cj - cy) * (cj - cy));
      if (d > reach) continue;
      if (locked(ci, cj)) continue;
      var w = 1;
      if (!sharp) { var tt = d / reach; w = 1 - tt * tt * (3 - 2 * tt); }
      c = ci + cj * EW; var h0 = E[c], h1 = h0;
      if (mode === 'raise') h1 = h0 + Math.round(w * amp);
      else if (mode === 'lower') h1 = h0 - Math.round(w * amp);
      else if (mode === 'level') h1 = sharp ? target : Math.round(h0 + (target - h0) * Math.min(1, w * 1.5));
      else {
        var sum = 0, cn = 0;
        for (var b2 = -1; b2 <= 1; b2++) for (var a2 = -1; a2 <= 1; a2++) { var x2 = ci + a2, y2 = cj + b2; if (x2 < 0 || y2 < 0 || x2 > N || y2 > N) continue; sum += E[x2 + y2 * EW]; cn++; }
        h1 = Math.round(h0 + (sum / cn - h0) * (sharp ? 1 : Math.min(1, 0.4 + w)));
      }
      h1 = clamp(h1, ELEV_MIN, ELEV_MAX);
      if (h1 < 0 && cornerSea(ci, cj, SEAN)) h1 = Math.min(h0, 0) < 0 ? h0 : 0;   // island: land beside the sea never drops below sea level
      if (h1 !== h0) { cs.push(c); old[c] = h0; nw[c] = h1; }
    }
    // paths may never be steeper than slope 2: drop corner changes that would do it (repeat until stable)
    function badPath(c0) {
      var ci = c0 % EW, cj = (c0 - ci) / EW;
      for (var b = -1; b <= 0; b++) for (var a = -1; a <= 0; a++) {
        var x = ci + a, y = cj + b; if (x < 0 || y < 0 || x >= N || y >= N || !S.path[x + y * N]) continue;
        var cc = x + y * EW, hs = [nw[cc] !== undefined ? nw[cc] : E[cc], nw[cc + 1] !== undefined ? nw[cc + 1] : E[cc + 1], nw[cc + EW] !== undefined ? nw[cc + EW] : E[cc + EW], nw[cc + EW + 1] !== undefined ? nw[cc + EW + 1] : E[cc + EW + 1]];
        if (Math.max(hs[0], hs[1], hs[2], hs[3]) - Math.min(hs[0], hs[1], hs[2], hs[3]) > 2) return true;
      }
      return false;
    }
    for (var pass = 0, chg = true; chg && pass < 8; pass++) {
      chg = false;
      for (k = 0; k < cs.length; k++) { c = cs[k]; if (nw[c] !== undefined && badPath(c)) { delete nw[c]; chg = true; } }
    }
    var list = [], olds = [], news = [], cost = 0, i0 = 999, j0 = 999, i1 = -1, j1 = -1;
    for (k = 0; k < cs.length; k++) {
      c = cs[k]; if (nw[c] === undefined) continue;
      list.push(c); olds.push(old[c]); news.push(nw[c]); cost += Math.abs(nw[c] - old[c]) * (D.terraformCost || ELEV_COST);
      var cci = c % EW, ccj = (c - cci) / EW;
      i0 = Math.min(i0, Math.max(0, cci - 1)); j0 = Math.min(j0, Math.max(0, ccj - 1)); i1 = Math.max(i1, Math.min(N - 1, cci)); j1 = Math.max(j1, Math.min(N - 1, ccj));
    }
    if (!list.length) return fail('Nothing to change here (buildings, paths, the entrance and the edge of your land stay put)');
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    for (k = 0; k < list.length; k++) E[list[k]] = news[k];
    spend(cost, 'construction');
    jBegin('Terraform'); jOp({ k: 'elev', cs: list, old: olds, nw: news, net: cost, box: [i0, j0, i1, j1] }); jEnd();
    bus.emit('elev', { i0: i0, j0: j0, i1: i1, j1: j1 });
    afterWorldChange(true);
    return okr(cost);
  }

  function placePath(i, j, pathId, opts) {
    var dry = dryOf(arguments);
    var pid = PI_[pathId]; if (!pid) return fail('Unknown path type');
    if (!inMap(i, j)) return fail('Outside your land');
    if (Z.Realms && D.paths[pid - 1].walk) return fail('Use the Marine, Aviary or Tagging build tabs for that walkway');   // realms package
    var t = i + j * N, bridge = Z.Moats ? Z.Moats.bridgeCheck(i, j) : null;   // moats package: a path over a ditch or fresh water is a bridge (max span, higher cost)
    if (bridge && bridge.msg) return fail(bridge.msg);
    if (S.terrain[t] === WATER && !bridge) return fail('Needs flat dry land');
    if (cliffT(t) && !bridge) return fail('Too steep \u2014 level the ground first');
    if (S.tileObj[t]) return fail('Something is in the way');
    if (S.tileEnc[t]) return fail("Can't lay paths inside an enclosure");
    if (S.path[t] === pid) return fail('Already paved');
    var cost = bridge ? Z.Moats.bridgeCost(pid) : D.paths[pid - 1].cost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost, bridge ? { bridge: true } : null);
    var oldp = S.path[t];
    S.path[t] = pid; spend(cost, 'construction');
    jBegin('Path'); jOp({ k: 'path', t: t, old: oldp, nw: pid, net: cost }); jEnd();
    bus.emit('path', { i0: i, j0: j, i1: i, j1: j });
    afterWorldChange(true);
    return okr(cost, bridge ? { bridge: true } : null);
  }

  function edgeTiles(edge) {
    var a, b;
    if (edge.axis === 'x') { a = edge.j > 0 ? edge.i + (edge.j - 1) * N : -1; b = edge.j < N ? edge.i + edge.j * N : -1; }
    else { a = edge.i > 0 ? (edge.i - 1) + edge.j * N : -1; b = edge.i < N ? edge.i + edge.j * N : -1; }
    return [a, b];
  }
  function fenceCheck(edge) {
    if (!edgeValid(edge)) return 'Outside the park';
    var ab = edgeTiles(edge), a = ab[0], b = ab[1];
    if (!((a >= 0 && inMap(a % N, Math.floor(a / N))) || (b >= 0 && inMap(b % N, Math.floor(b / N))))) return 'Outside your land';
    if (a >= 0 && b >= 0 && S.path[a] && S.path[b]) return "Can't fence across a path";
    if (a >= 0 && b >= 0 && S.tileObj[a] && S.tileObj[a] === S.tileObj[b]) return 'Blocked by a building';
    if (a >= 0 && b >= 0 && S.ditch[a] && S.ditch[b]) return "Can't fence inside a ditch";
    return null;
  }
  function placeFence(edge, fenceId, opts) {
    var dry = dryOf(arguments);
    var fid = FI[fenceId]; if (!fid) return fail('Unknown fence type');
    var bad = fenceCheck(edge); if (bad) return fail(bad);
    var arr = edge.axis === 'x' ? S.fenceX : S.fenceZ, ix = edgeIndex(edge);
    if (arr[ix] === fid) return fail('Already there');
    var cost = D.fences[fid - 1].cost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    var oldf = arr[ix];
    arr[ix] = fid; spend(cost, 'construction');
    jBegin('Fence'); jOp({ k: 'fence', axis: edge.axis, i: edge.i, j: edge.j, ix: ix, old: oldf, nw: fid, net: cost }); jEnd();
    bus.emit('fence', { axis: edge.axis, i: edge.i, j: edge.j });
    afterWorldChange(true);
    return okr(cost);
  }
  function removeFence(edge, opts) {
    var dry = dryOf(arguments);
    if (!edgeValid(edge)) return fail('Outside the park');
    var arr = edge.axis === 'x' ? S.fenceX : S.fenceZ, ix = edgeIndex(edge);
    if (!arr[ix]) return fail('No fence here');
    var rab = edgeTiles(edge);
    if (!((rab[0] >= 0 && inMap(rab[0] % N, Math.floor(rab[0] / N))) || (rab[1] >= 0 && inMap(rab[1] % N, Math.floor(rab[1] / N))))) return fail('Outside your land');
    var oldf = arr[ix], refund = Math.floor(D.fences[oldf - 1].cost * 0.5);
    if (dry) return okr(-refund);
    arr[ix] = 0; earn(refund, 'construction');
    jBegin('Remove fence'); jOp({ k: 'fence', axis: edge.axis, i: edge.i, j: edge.j, ix: ix, old: oldf, nw: 0, net: -refund }); jEnd();
    bus.emit('fence', { axis: edge.axis, i: edge.i, j: edge.j });
    afterWorldChange(true);
    return okr(-refund);
  }

  function defOf(type) { return BD[type] ? { def: BD[type], kind: 'building' } : SC[type] ? { def: SC[type], kind: 'scenery' } : null; }
  function adjacentPathExists(fp) {
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      if ((i > 0 && S.path[i - 1 + j * N]) || (i < N - 1 && S.path[i + 1 + j * N]) || (j > 0 && S.path[i + (j - 1) * N]) || (j < N - 1 && S.path[i + (j + 1) * N])) return true;
    }
    return false;
  }
  function frontHasPath(fp) {
    var fl = frontList(fp);
    for (var k = 0; k < fl.length; k++) if (S.path[fl[k].i + fl[k].j * N]) return true;
    return false;
  }
  function frontPayload(fp) { return frontList(fp); }
  // is any fence edge strictly inside the footprint?
  function fenceInside(fp) {
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      if (a > 0 && S.fenceZ[i + j * (N + 1)]) return true;
      if (b > 0 && S.fenceX[i + j * N]) return true;
    }
    return false;
  }
  function fossilCredit(type) { return type === 'fossil_skeleton' && S.research && S.research.fossilCredits > 0; }
  function placeObject(type, i, j, rot, opts) {
    var dry = dryOf(arguments);
    if (typeof rot !== 'number') rot = 0; rot = ((rot % 4) + 4) % 4;
    var dk = defOf(type); if (!dk) return fail('Unknown item');
    var def = dk.def, fp = footprint(def, i, j, rot);
    if (def.star > S.unlocked.star) return fail('Needs a ' + def.star + '-star park');
    var a, b, inEnc = false, warn = null;
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var x = fp.i0 + a, y = fp.j0 + b;
      if (!Z.inb(x, y) || !inMap(x, y)) return fail('Outside your land');
    }
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var t = (fp.i0 + a) + (fp.j0 + b) * N;
      if (S.tileObj[t]) return fail('Something is already here');
      if (S.path[t]) return fail('Clear the path first');
      if (S.ditch[t]) return fail('Fill the ditch in first');
      if (S.terrain[t] === WATER && type !== 'ice_floe' && !(def.aquatic && S.tileEnc[t])) return fail('Needs flat dry land');   // realms package: kelp, reefs and feeders go in the water
      if (Z.Realms && dk.kind === 'scenery') { var rsc = Z.Realms.sceneryCheck(def, t); if (rsc) return fail(rsc); }   // realms package
      if (S.tileEnc[t]) inEnc = true;
    }
    if ((fp.w > 1 || fp.h > 1) && fenceInside(fp)) return fail('Blocked by a fence');
    if (dk.kind === 'building') {
      if (!footprintFlat(fp, def.realm === 'gallery' ? 3.2 : 1)) return fail('Too steep \u2014 level the ground first');
      if (inEnc) return fail("Buildings can't go inside an enclosure");
      if (!def.utility && !frontHasPath(fp)) warn = 'Entrance not on a path yet';
      if (def.mono && Z.Monorail) { var mn = Z.Monorail.placeCheck(type, fp); if (mn && mn.msg) return fail(mn.msg); if (mn && mn.warn) warn = mn.warn; }   // monorail package: a station needs a path at its entrance
      if (def.moat && Z.Moats) { var mc = Z.Moats.placeCheck(type, fp); if (mc && mc.msg) return fail(mc.msg); if (mc && mc.warn) warn = mc.warn; }   // moats package: pump beside water, ditch contact
      if (def.safari && Z.Safari) { var sfc = Z.Safari.placeCheck(type, fp); if (sfc && sfc.msg) return fail(sfc.msg); if (sfc && sfc.warn && !warn) warn = sfc.warn; }   // safari package: depot needs a path, harbour needs water
      if (def.needsPower && Z.Power) { var pc = Z.Power.placeCheck(def, fp); if (pc && pc.warn) warn = (warn ? warn + '. ' : '') + (def.mono ? 'Not on the power grid: the station and its trains stay stopped until a substation or cable covers it' : pc.warn); }   // power package: outside every substation's radius (QA: also when the entrance warning is showing; monorail wording)
    } else {
      if (inEnc && def.inEnclosure === false) return fail("Can't place that inside an enclosure");
      if ((type === 'bench' || type === 'bin') && !adjacentPathExists(fp)) return fail('Place it next to a path');
    }
    var credit = fossilCredit(type), cost = credit ? 0 : def.cost;
    if (S.money < cost) return fail('Not enough money');
    var extra = { front: frontPayload(fp) }; if (warn) extra.warn = warn; if (credit) extra.free = true;
    if (dry) return okr(cost, extra);
    var o = { id: newId(), kind: dk.kind, type: type, i: i, j: j, rot: rot };
    if (dk.kind === 'building') { o.price = def.price; o.uses = 0; o.income = 0; o.stock = 100; }
    if (type === 'bin') o.fill = 0;
    if (credit) { o.free = true; S.research.fossilCredits--; }
    S.objects.push(o); spend(cost, 'construction');
    jBegin('Build ' + def.name); jOp({ k: 'obj+', id: o.id, net: cost, credit: credit }); jEnd();
    afterWorldChange(false);
    bus.emit('objectAdded', o);
    if (credit) bus.emit('research');
    extra.id = o.id;
    return okr(cost, extra);
  }

  function removeObjectInternal(o) {
    var k = S.objects.indexOf(o); if (k >= 0) S.objects.splice(k, 1);
    // release guests tied to it
    for (var g = 0; g < S.guests.length; g++) {
      var gu = S.guests[g];
      if (gu.gid === o.id && (gu.gt === 'bld' || gu.gt === 'bunker')) {
        releaseGuest(gu); gu.gt = ''; gu.dk = ''; gu.ni = -1;
        if (gu.state === 'queue' || gu.state === 'use') gu.state = 'walk';
        gu.shel = 0; gu.ubid = 0;
      }
      if (gu.bid === o.id) { releaseGuest(gu); if (gu.state === 'sit') { gu.state = 'walk'; gu.gt = ''; } }
    }
    delete RT.bq[o.id];
    bus.emit('objectRemoved', o);
  }
  function bulldoze(i, j, opts) {
    var dry = dryOf(arguments);
    if (!inMap(i, j)) return fail('Outside your land');
    var t = i + j * N;
    if (S.tileObj[t]) {
      var o = RT.oById.get(S.tileObj[t]); if (!o) return fail('Nothing here');
      var def = o.kind === 'building' ? BD[o.type] : SC[o.type], refund = o.free ? 0 : Math.floor(def.cost * 0.5);
      if (o.type === 'hatchery' && S.research && S.research.eggs.length) {
        var other = RT.allHatch.length > 1;
        if (!other) return fail('Eggs are incubating - the hatchery cannot be removed yet');
      }
      if (dry) return okr(-refund);
      var snap = JSON.parse(JSON.stringify(o));
      removeObjectInternal(o); earn(refund, 'construction');
      jBegin('Bulldoze ' + def.name); jOp({ k: 'obj-', o: snap, net: -refund }); jEnd();
      afterWorldChange(false);
      return okr(-refund);
    }
    if (S.path[t]) {
      if (isGateTile(i, j)) return fail('The entrance gate must stay open');
      var oldp = S.path[t], refund2 = Math.floor(D.paths[oldp - 1].cost * 0.5);
      if (dry) return okr(-refund2);
      S.path[t] = 0; S.dirt[t] = 0; earn(refund2, 'construction');
      jBegin('Remove path'); jOp({ k: 'path', t: t, old: oldp, nw: 0, net: -refund2 }); jEnd();
      bus.emit('path', { i0: i, j0: j, i1: i, j1: j });
      afterWorldChange(true);
      return okr(-refund2);
    }
    if (Z.Realms && S.tileEnc[t]) { var rbz = Z.Realms.bulldozeTile(i, j, dry); if (rbz) return rbz; }   // realms package: remove a tank / dome / zone
    if (S.rail[t] && Z.Monorail && Z.Monorail.hasTrack(t)) return Z.Monorail.removeTiles([t], dry ? { dry: true } : null);   // monorail package: remove a bare piece of track
    if (S.ditch[t] && Z.Moats) return Z.Moats.fill(i, j, dry ? { dry: true } : null);   // moats package: fill the ditch in (50% refund)
    return fail('Nothing to remove here');
  }

  // ---- undo ----
  function floodLeaks(start, W) {
    var st = new Uint8Array(NN), stack = [start], cnt = 0; st[start] = 1;
    while (stack.length) {
      var t = stack.pop(); cnt++; if (cnt > MAX_ENC_TILES) return true;
      var i = t % N, j = (t - i) / N, n;
      if (j === 0) { if (!W.fenceX[t]) return true; } else if (!W.fenceX[t]) { n = t - N; if (!st[n]) { st[n] = 1; stack.push(n); } }
      if (j === N - 1) { if (!W.fenceX[t + N]) return true; } else if (!W.fenceX[t + N]) { n = t + N; if (!st[n]) { st[n] = 1; stack.push(n); } }
      if (i === 0) { if (!W.fenceZ[i + j * (N + 1)]) return true; } else if (!W.fenceZ[i + j * (N + 1)]) { n = t - 1; if (!st[n]) { st[n] = 1; stack.push(n); } }
      if (i === N - 1) { if (!W.fenceZ[(i + 1) + j * (N + 1)]) return true; } else if (!W.fenceZ[(i + 1) + j * (N + 1)]) { n = t + 1; if (!st[n]) { st[n] = 1; stack.push(n); } }
    }
    return false;
  }
  function snapTiles(snap) {
    var def = snap.kind === 'building' ? BD[snap.type] : SC[snap.type], fp = footprint(def, snap.i, snap.j, snap.rot || 0), out = [];
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) out.push((fp.i0 + a) + (fp.j0 + b) * N);
    return { fp: fp, tiles: out, def: def };
  }
  function undoCheck(op, W) {
    var k, t;
    switch (op.k) {
      case 'terr':
        for (k = 0; k < op.ts.length; k++) {
          t = op.ts[k];
          if (seaMask()[t]) return 'That tile is now part of the sea';
          if (W.terrain[t] !== op.nw) return 'The ground has changed since, so this cannot be undone';
          if (op.old[k] === WATER && (W.path[t] || W.occ[t])) return 'Something now stands where the water would return';
          W.terrain[t] = op.old[k];
        }
        return null;
      case 'elev':
        for (k = 0; k < op.cs.length; k++) {
          if (W.elev[op.cs[k]] !== op.nw[k]) return 'The ground has changed since, so this cannot be undone';
          W.elev[op.cs[k]] = op.old[k];
        }
        for (k = 0; k < op.cs.length; k++) {
          var ec = op.cs[k] % EW, ej = (op.cs[k] - ec) / EW;
          for (var eb = -1; eb <= 0; eb++) for (var ea = -1; ea <= 0; ea++) {
            var ex = ec + ea, ey = ej + eb; if (ex < 0 || ey < 0 || ex >= N || ey >= N) continue;
            var et = ex + ey * N, es = slopeOfT(et, W.elev);
            if (W.path[et] && es > 2) return 'A path now runs across that slope';
            if (W.occ[et]) { var eo = RT.oById.get(W.occ[et]); if (eo && eo.kind === 'building' && es > 1) return 'A building now stands on that ground'; }
          }
        }
        return null;
      case 'path':
        t = op.t;
        if (W.path[t] !== op.nw) return 'The path has changed since, so this cannot be undone';
        if (op.old > 0) {
          if (W.occ[t]) return 'Something now stands on that tile';
          if (W.terrain[t] === WATER && seaMask()[t]) return 'That tile is now sea';
          if (S.tileEnc[t]) return 'That tile is inside an enclosure now';
          if (slopeOfT(t, W.elev) > 2) return 'That ground is too steep now';
          var ti = t % N, tj = (t - ti) / N;
          if ((ti > 0 && W.path[t - 1] && W.fenceZ[ti + tj * (N + 1)]) || (ti < N - 1 && W.path[t + 1] && W.fenceZ[ti + 1 + tj * (N + 1)]) ||
              (tj > 0 && W.path[t - N] && W.fenceX[t]) || (tj < N - 1 && W.path[t + N] && W.fenceX[t + N])) return 'A fence is in the way';
        }
        W.path[t] = op.old; return null;
      case 'x': return op.chk ? op.chk(W) : null;   // generic plug-in op {k:'x', chk(W), ap(), net} (monorail package)
      case 'ditch':   // moats package
        for (k = 0; k < op.ts.length; k++) {
          t = op.ts[k];
          if (W.ditch[t] !== op.nw[k]) return 'The ditch has changed since, so this cannot be undone';
          if (op.old[k] > 0 && (W.occ[t] || W.path[t])) return 'Something now stands where the ditch would return';
          W.ditch[t] = op.old[k];
        }
        return null;
      case 'fence': {
        var arr = op.axis === 'x' ? W.fenceX : W.fenceZ;
        if (arr[op.ix] !== op.nw) return 'The fence has changed since, so this cannot be undone';
        if (op.old) {
          var ab = edgeTiles(op), a = ab[0], b = ab[1];
          if (a >= 0 && b >= 0 && W.path[a] && W.path[b]) return 'A path now crosses that fence line';
          if (a >= 0 && b >= 0 && W.occ[a] && W.occ[a] === W.occ[b]) return 'A building now stands there';
        }
        arr[op.ix] = op.old; return null;
      }
      case 'obj+': {
        var o = null; for (k = 0; k < S.objects.length; k++) if (S.objects[k].id === op.id) { o = S.objects[k]; break; }
        if (!o || W.gone[op.id]) return 'That item no longer exists';
        if (o.type === 'hatchery' && S.research && S.research.eggs.length && RT.allHatch.length <= 1) return 'Eggs are incubating in that hatchery';
        var tl = snapTiles(o).tiles;
        for (k = 0; k < tl.length; k++) if (W.occ[tl[k]] === o.id) W.occ[tl[k]] = 0;
        W.gone[op.id] = 1; return null;
      }
      case 'obj-': {
        var sn = snapTiles(op.o), inEnc = false;
        for (k = 0; k < sn.tiles.length; k++) {
          t = sn.tiles[k];
          if (W.occ[t]) return 'Something now stands where that was';
          if (W.path[t]) return 'A path now covers that spot';
          if (W.terrain[t] === WATER && op.o.type !== 'ice_floe') return 'That spot is now water';
          if (S.tileEnc[t]) inEnc = true;
        }
        if (op.o.kind === 'building' && inEnc) return 'That spot is now inside an enclosure';
        if (op.o.kind === 'scenery' && inEnc && sn.def.inEnclosure === false) return 'That spot is now inside an enclosure';
        var fp = sn.fp;
        for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
          var x = fp.i0 + a, y = fp.j0 + b;
          if ((a > 0 && W.fenceZ[x + y * (N + 1)]) || (b > 0 && W.fenceX[x + y * N])) return 'A fence now runs through that spot';
        }
        for (k = 0; k < sn.tiles.length; k++) W.occ[sn.tiles[k]] = op.o.id;
        return null;
      }
    }
    return null;
  }
  function undo() {
    if (RT.stroke) return fail('Finish the current action first');
    var n = RT.undo.length; if (!n) return fail('Nothing to undo');
    var st = RT.undo[n - 1], k, t;
    if (st.net < 0 && S.money < -st.net) return fail('Not enough money to undo that (' + fmt(-st.net) + ' needed)');
    var W = { elev: S.elev.slice(), terrain: S.terrain.slice(), path: S.path.slice(), fenceX: S.fenceX.slice(), fenceZ: S.fenceZ.slice(), occ: S.tileObj.slice(), ditch: S.ditch.slice(), gone: {} };
    var bad = null, hasFence = false;
    for (k = st.ops.length - 1; k >= 0 && !bad; k--) { bad = undoCheck(st.ops[k], W); if (st.ops[k].k === 'fence') hasFence = true; }
    if (!bad && hasFence) {
      var seen = {};
      for (k = 0; k < S.animals.length && !bad; k++) {
        var a = S.animals[k]; if (!a.enc || a.state === 'escaped') continue;
        var at = tileOf(a.x, a.z); if (seen[S.tileEnc[at]]) continue; seen[S.tileEnc[at]] = 1;
        if (floodLeaks(at, W)) bad = 'Dinosaurs are inside - moving that fence would let them out';
      }
      for (k = 0; k < S.research.eggs.length && !bad; k++) {
        var eg = S.research.eggs[k]; if (floodLeaks(eg.i + eg.j * N, W)) bad = 'An egg is waiting in that enclosure';
      }
    }
    if (bad) return fail(bad);
    // apply for real
    RT.undoBusy = true;
    var navChanged = false, added = [], box = null, ebox = null, fenceEv = [];
    for (k = st.ops.length - 1; k >= 0; k--) {
      var op = st.ops[k];
      switch (op.k) {
        case 'terr': {
          for (var q = 0; q < op.ts.length; q++) S.terrain[op.ts[q]] = op.old[q];
          var b0 = op.box; box = box ? [Math.min(box[0], b0[0]), Math.min(box[1], b0[1]), Math.max(box[2], b0[2]), Math.max(box[3], b0[3])] : b0.slice();
          break;
        }
        case 'elev': {
          for (var q4 = 0; q4 < op.cs.length; q4++) S.elev[op.cs[q4]] = op.old[q4];
          var e0 = op.box; ebox = ebox ? [Math.min(ebox[0], e0[0]), Math.min(ebox[1], e0[1]), Math.max(ebox[2], e0[2]), Math.max(ebox[3], e0[3])] : e0.slice();
          navChanged = true; break;
        }
        case 'x': { if (op.ap) op.ap(); navChanged = true; break; }   // monorail package
        case 'ditch': {
          for (var q5 = 0; q5 < op.ts.length; q5++) S.ditch[op.ts[q5]] = op.old[q5];
          var d0 = op.box; box = box ? [Math.min(box[0], d0[0]), Math.min(box[1], d0[1]), Math.max(box[2], d0[2]), Math.max(box[3], d0[3])] : d0.slice();
          break;
        }
        case 'path': S.path[op.t] = op.old; if (!op.old) S.dirt[op.t] = 0; navChanged = true; bus.emit('path', { i0: op.t % N, j0: Math.floor(op.t / N), i1: op.t % N, j1: Math.floor(op.t / N) }); break;
        case 'fence': (op.axis === 'x' ? S.fenceX : S.fenceZ)[op.ix] = op.old; navChanged = true; fenceEv.push({ axis: op.axis, i: op.i, j: op.j }); break;
        case 'obj+': {
          var o = null; for (var q2 = 0; q2 < S.objects.length; q2++) if (S.objects[q2].id === op.id) { o = S.objects[q2]; break; }
          if (o) { removeObjectInternal(o); if (op.credit && S.research) S.research.fossilCredits++; }
          break;
        }
        case 'obj-': {
          var no = JSON.parse(JSON.stringify(op.o));
          for (var q3 = 0; q3 < S.objects.length; q3++) if (S.objects[q3].id === no.id) { no.id = newId(); break; }
          op.o.id = no.id;
          S.objects.push(no); added.push(no); break;
        }
      }
    }
    RT.undoBusy = false;
    RT.undo.pop();
    if (st.net > 0) earn(st.net, 'construction'); else if (st.net < 0) spend(-st.net, 'construction');
    if (box) bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] });
    if (ebox) bus.emit('elev', { i0: ebox[0], j0: ebox[1], i1: ebox[2], j1: ebox[3] });
    for (k = 0; k < fenceEv.length; k++) bus.emit('fence', fenceEv[k]);
    afterWorldChange(navChanged);
    for (k = 0; k < added.length; k++) bus.emit('objectAdded', added[k]);
    bus.emit('research');
    var res = { ok: true, msg: 'Undid: ' + st.label, refund: st.net };
    bus.emit('undo', { label: st.label, refund: st.net });
    return res;
  }

  // ---- animals ----
  function isPredator(sp) { return !!(sp && (sp.predator || sp.diet === 'carnivore')); }
  function isPackHunter(sp) { return !!(sp && isPredator(sp) && (sp.packHunter || (sp.social && sp.social[0] >= 2))); }
  function compatible(enc, spId) { return null; }
  function compatibleWarn(enc, spId) {
    if (!enc || !enc.species || !enc.species.length) return null;
    var sp = SP[spId], spPred = isPredator(sp);
    for (var k = 0; k < enc.species.length; k++) {
      var o = enc.species[k]; if (o === spId) continue;
      if (spPred || isPredator(SP[o])) return 'Predators in this enclosure may hunt smaller animals or fight rival predators.';
    }
    return null;
  }
  function pickAnimalName() {
    var used = {}, k; for (k = 0; k < S.animals.length; k++) used[S.animals[k].name] = 1;
    for (k = 0; k < 20; k++) { var n = rng.pick(D.animalNames); if (!used[n]) return n; }
    return rng.pick(D.animalNames);
  }
  function hasTrait(a, id) { return !!(a.traits && a.traits.indexOf(id) >= 0); }
  // Donor-gene effects (D.traits[].fx, see 00-data.js DNA package), aggregated once per animal and cached on a non-enumerable property (never saved).
  var FX0 = { appeal: 0, nightAppeal: 0, q: 0, sick: 1, life: 1, speed: 1, upkeep: 1, breed: 1, fence: 0, danger: 0, sterile: false, swim: false };
  function fxOf(a) {
    var tr = a.traits; if (!tr || !tr.length) return FX0;
    if (a._fx && a._fxn === tr.length) return a._fx;
    var f = { appeal: 0, nightAppeal: 0, q: 0, sick: 1, life: 1, speed: 1, upkeep: 1, breed: 1, fence: 0, danger: 0, sterile: false, swim: false }, k, x;
    for (k = 0; k < tr.length; k++) {
      x = TR[tr[k]] && TR[tr[k]].fx; if (!x) continue;
      f.appeal += x.appeal || 0; f.nightAppeal += x.nightAppeal || 0; f.q += x.q || 0; f.fence += x.fence || 0; f.danger += x.danger || 0;
      f.sick *= x.sick || 1; f.life *= x.life || 1; f.speed *= x.speed || 1; f.upkeep *= x.upkeep || 1; f.breed *= x.breed || 1;
      if (x.sterile) f.sterile = true; if (x.swim) f.swim = true;
    }
    Object.defineProperty(a, '_fx', { value: f, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(a, '_fxn', { value: tr.length, writable: true, configurable: true, enumerable: false });
    return f;
  }
  // 0 by day .. 1 in full dark (same curve as the world's sky: sun elevation from the time of day)
  function nightK() { var t = S.time - Math.floor(S.time), e = Math.sin((t - 0.25) * TAU), u = clamp((e + 0.22) / 0.26, 0, 1); return 1 - u * u * (3 - 2 * u); }
  function aQ(a) { var q = a.genomeQ === undefined ? 100 : a.genomeQ; return a.traits && a.traits.length ? clamp(q + fxOf(a).q, 0, 100) : q; }
  function aDanger(a) { var d = SP[a.species].danger + (a.traits && a.traits.length ? fxOf(a).danger : 0); d = hasTrait(a, 'docile') ? d - 1 : d; return clamp(d, 0, 4); }
  function aMinFence(a) { var m = Math.min(5, SP[a.species].minFence + (a.traits && a.traits.length ? fxOf(a).fence : 0)); return hasTrait(a, 'docile') ? Math.max(1, m - 1) : m; }
  function aLife(a) { return SP[a.species].lifespan * (0.7 + 0.005 * aQ(a)) * (hasTrait(a, 'robust') ? 1.2 : 1) * fxOf(a).life; }
  function aAppeal(a) { var f = fxOf(a); return SP[a.species].appeal * (a.baby ? 1.5 : 1) * (0.8 + 0.004 * aQ(a)) * (hasTrait(a, 'vivid') ? 1.25 : 1) * Math.max(0.3, 1 + f.appeal + (f.nightAppeal ? f.nightAppeal * nightK() : 0)); }
  function aSickMul(a) { return (1.5 - aQ(a) / 100) * (hasTrait(a, 'robust') ? 0.7 : 1) * fxOf(a).sick; }
  function aBreedMul(a) { var f = fxOf(a); return f.sterile ? 0 : (0.5 + aQ(a) / 100) * (hasTrait(a, 'fertile') ? 1.5 : 1) * f.breed; }
  function makeAnimal(spId, enc, x, z, baby, sex, q, traits) {
    var sp = SP[spId];
    var a = {
      id: newId(), species: spId, name: pickAnimalName(), sex: sex || (rng.chance(0.5) ? 'm' : 'f'),
      age: baby ? 0 : sp.lifespan * rng.range(0.05, 0.4) + 3, baby: !!baby, x: x, z: z, y: 0, heading: rng.range(-PI, PI), speed: 0,
      state: 'idle', enc: enc ? enc.id : 0, hunger: rng.range(10, 35), thirst: rng.range(5, 30), health: 100, happiness: 60, energy: rng.range(70, 100),
      pregnant: 0, tx: x, tz: z, st: rng.range(0.5, 3), tg: '', pt: rng.range(30, 80), stuck: 0, sick: false,
      injured: false, fid: 0, fightCd: 0,
      genomeQ: q === undefined ? 100 : q, traits: traits ? traits.slice() : []
    };
    return a;
  }
  function insertAnimal(a) {
    S.animals.push(a); RT.aById.set(a.id, a);
    refreshEncAnimals();
    var e = a.enc ? encById(a.enc) : null; if (e) encStats(e);
    bus.emit('animalAdded', a);
  }
  function adultAge(sp) { return clamp(sp.lifespan * 0.02, 3, 10) * 0.5; }   // days are 2.8x longer than the original 150 s, so maturity takes half as many days

  // can a new animal of this species be put on tile t (enclosure rules only)?
  function animalSpotCheck(sp, t, ignoreId) {
    var enc = encOfTile(t);
    if (!enc) return 'Dinosaurs must be placed inside a fenced enclosure';
    if (RT.block[t]) return 'Something is in the way';
    if (Z.Realms) { var rsc = Z.Realms.spotCheck(sp, enc, t); if (rsc !== undefined) return rsc; }   // realms package: sea/air/virtual rules replace the land rules
    if (cliffT(t)) return 'Too steep for dinosaurs';
    if (S.terrain[t] === WATER && !sp.needsWater) return "That dinosaur can't swim";
    var bad = compatible(enc, sp.id); if (bad) return bad;
    var n = 0, k; for (k = 0; k < enc.animals.length; k++) if (RT.aById.get(enc.animals[k]).species === sp.id) n++;
    for (k = 0; k < S.research.eggs.length; k++) { var eg = S.research.eggs[k]; if (eg.species === sp.id && S.tileEnc[eg.i + eg.j * N] === enc.id) n++; }
    if (enc.area / (n + 1) < sp.space * 0.5) return 'Too cramped for another ' + lc(sp.name);
    return null;
  }
  function eggCost(sp) { return Math.round(sp.cost * RC.eggCostMul / 10) * 10; }
  function genomeOf(spId) { return (S.research && S.research.genomes[spId]) || 0; }
  function addAnimal(speciesId, i, j, opts) {
    var dry = dryOf(arguments);
    var sp = SP[speciesId]; if (!sp) return fail('Unknown species');
    if (sp.modern) return fail('Modern animals cannot be hatched');
    var R = S.research, g = genomeOf(speciesId);
    function bad(code, m) { var r = fail(m); r.code = code; r.why = m; return r; }
    if (g < 50) return bad('genome', 'The lab has only pieced together ' + Math.floor(g) + '% of the ' + sp.name + ' genome. It needs 50% to attempt a hatch.');
    if (!RT.hatcheries.length) return bad('no_hatchery', RT.allHatch.length ? "The hatchery isn't connected to a path (its front must touch one)" : 'You need a hatchery to incubate eggs');
    var slots = RT.hatcheries.length * RC.eggSlots;
    if (R.eggs.length >= slots) return bad('no_slot', 'All egg slots are in use. Wait for a hatch or build another hatchery.');
    if (typeof i === 'number' && Z.inb(i, j) && !inMap(i, j)) return bad('enclosure', 'Outside your land');
    if (typeof i !== 'number' || !Z.inb(i, j)) return bad('enclosure', 'Pick a spot inside an enclosure');
    var t = i + j * N, spot = animalSpotCheck(sp, t); if (spot) return bad('enclosure', spot);
    var ecost = eggCost(sp);
    if (S.money < ecost) return bad('money', 'Not enough money (' + fmt(ecost) + ' needed)');
    var od = hatchOdds(speciesId);
    var extra = { chance: od.chance, hours: od.hours, egg: true };
    if (Z.Moats) { var mwn = Z.Moats.advice(encOfTile(t), speciesId); if (mwn) extra.warn = mwn; }
    { var ee = encOfTile(t); if (ee && ee.viewTiles && !ee.viewTiles.length && !extra.warn) extra.warn = 'No path or pier within 3 tiles: keepers could not reach this enclosure to feed it. Lay one first.'; }   // QA   // moats package: warn before the egg is laid
    if (!extra.warn) { var cwn = compatibleWarn(encOfTile(t), speciesId); if (cwn) extra.warn = cwn; }
    if (dry) return okr(ecost, extra);
    var egg = { id: newId(), species: speciesId, i: i, j: j, t: od.hours, total: od.hours, chance: od.chance, paid: ecost, guaranteed: !!od.guaranteed };
    if (od.guaranteed) R.guaranteed--;
    R.eggs.push(egg);
    spend(ecost, 'animals');
    if (Z.Realms && Z.Realms.live(sp)) msg('A ' + sp.name + ' is gestating in the hatchery pool (it gives birth to live young). Birth in ' + Math.round(od.hours) + ' hours.', 'good', false); else   // realms package: live-bearers
      msg('An egg has been set in the incubator: ' + sp.name + '. Hatching in ' + Math.round(od.hours) + ' hours.', 'good', false);
    bus.emit('eggLaid', egg); bus.emit('research');
    extra.id = egg.id; extra.eggId = egg.id;
    return okr(ecost, extra);
  }
  function sellAnimal(id, opts) {
    var dry = dryOf(arguments);
    var a = RT.aById.get(id); if (!a) return fail('No such dinosaur');
    var sp = SP[a.species], price = Math.round(sp.cost * (a.baby ? 0.3 : 0.5) * (0.5 + a.health / 200));
    if (dry) return okr(-price);
    earn(price, 'animals');
    removeAnimal(a, true);
    return okr(-price);
  }
  function stripFromFights(id) {
    if (!S.fights || !S.fights.length) return;
    for (var fk = S.fights.length - 1; fk >= 0; fk--) {
      var fl = S.fights[fk], ai = fl.attackers.indexOf(id), di = fl.defenders.indexOf(id);
      if (ai >= 0) fl.attackers.splice(ai, 1);
      if (di >= 0) fl.defenders.splice(di, 1);
      if (!fl.attackers.length || !fl.defenders.length) {
        var rem = fl.attackers.concat(fl.defenders);
        for (var ri = 0; ri < rem.length; ri++) {
          var ra = RT.aById.get(rem[ri]);
          if (ra) { ra.fid = 0; if (ra.state === 'fight') { ra.state = 'idle'; ra.st = 1; } }
        }
        S.fights.splice(fk, 1);
      }
    }
  }
  function removeAnimal(a, quiet) {
    stripFromFights(a.id);
    var k = S.animals.indexOf(a); if (k >= 0) { S.animals[k] = S.animals[S.animals.length - 1]; S.animals.pop(); }
    RT.aById.delete(a.id);
    refreshEncAnimals();
    var e = a.enc ? encById(a.enc) : null; if (e) encStats(e);
    bus.emit('animalRemoved', a);
  }
  function moveAnimal(id, i, j, opts) {
    var dry = dryOf(arguments);
    var a = RT.aById.get(id); if (!a) return fail('No such dinosaur');
    if (!Z.inb(i, j)) return fail('Outside the park');
    if (!inMap(i, j)) return fail('Outside your land');
    var t = i + j * N, enc = encOfTile(t); if (!enc) return fail('Dinosaurs must be placed inside a fenced enclosure');
    if (RT.block[t]) return fail('Something is in the way');
    var sp = SP[a.species];
    var rmc = Z.Realms ? Z.Realms.moveCheck(sp, enc, t, enc.id === a.enc) : undefined;   // realms package
    if (typeof rmc === 'string') return fail(rmc);
    if (rmc === undefined && cliffT(t)) return fail('Too steep for dinosaurs');
    if (rmc === undefined && S.terrain[t] === WATER && !sp.needsWater) return fail("That dinosaur can't swim");
    var extra = {};
    if (rmc === undefined && enc.id !== a.enc) {
      var bad = compatible(enc, a.species); if (bad) return fail(bad);
      var n = 0; for (var k = 0; k < enc.animals.length; k++) if (RT.aById.get(enc.animals[k]).species === a.species) n++;
      if (enc.area / (n + 1) < sp.space * 0.5) return fail('Too cramped');
      var cwn = compatibleWarn(enc, a.species); if (cwn) extra.warn = cwn;
    }
    if (dry) return okr(0, extra.warn ? extra : undefined);
    stripFromFights(a.id);
    var oldE = a.enc ? encById(a.enc) : null;
    a.x = cxOf(t); a.z = czOf(t); a.enc = enc.id; a.state = 'idle'; a.fid = 0; a.tg = ''; a.st = 1; a.speed = 0; a.tx = a.x; a.tz = a.z;
    if (Z.Realms) Z.Realms.landed(a);   // realms package
    refreshEncAnimals(); encStats(enc); if (oldE) encStats(oldE);
    return okr(0, extra.warn ? extra : undefined);
  }

  // ---- staff ----
  function hireStaff(type, i, j, opts) {
    var dry = dryOf(arguments);
    var def = STF[type]; if (!def) return fail('Unknown staff type');
    if (type === 'scientist') return fail('Scientists are hired from the Team tab in Research (candidates change every few days)');
    if (S.staff.length >= 40) return fail('Staff limit reached');
    if (typeof i !== 'number') { i = GATE_I0; j = N - 4; }
    else if (Z.inb(i, j) && !inMap(i, j)) return fail('Outside your land');
    var t = Z.inb(i, j) ? i + j * N : -1;
    if (t < 0 || !S.path[t]) {
      t = -1; var best = 99;
      for (var dj = -4; dj <= 4; dj++) for (var di = -4; di <= 4; di++) {
        var x = i + di, y = j + dj; if (!Z.inb(x, y) || !S.path[x + y * N]) continue;
        var d = Math.abs(di) + Math.abs(dj); if (d < best) { best = d; t = x + y * N; }
      }
      if (t < 0) return fail('Staff must start on a path');
    }
    if (S.money < def.hireCost) return fail('Not enough money');
    if (dry) return okr(def.hireCost);
    var s = {
      id: newId(), type: type, name: rng.pick(D.guestNames).split(' ')[0], x: cxOf(t), z: czOf(t), heading: 0, speed: 0, state: 'idle', task: 'Getting started',
      ti: t, home: t, tk: null, route: null, ri: 0, wt: rng.range(0.5, 2), lo: rng.range(-0.3, 0.3)
    };
    S.staff.push(s); RT.sById.set(s.id, s);
    spend(def.hireCost, 'other');
    bus.emit('staffAdded', s);
    return okr(def.hireCost, { id: s.id });
  }
  function releaseClaims(s) {
    if (!s) return;
    for (var q in RT.claim) if (RT.claim[q] && RT.claim[q].by === s.id) delete RT.claim[q];
    for (var k = 0; k < S.animals.length; k++) if (S.animals[k].claim === s.id) { S.animals[k].claim = 0; S.animals[k].held = 0; }
  }
  function fireStaff(id, opts) {
    var dry = dryOf(arguments);
    var s = RT.sById.get(id); if (!s) return fail('No such staff member');
    if (dry) return okr(0);
    if (s.type === 'scientist') releaseScientistJobs(s);
    var k = S.staff.indexOf(s); S.staff.splice(k, 1); RT.sById.delete(id);
    releaseClaims(s);
    bus.emit('staffRemoved', s);
    return okr(0);
  }

  // ---- economy ----
  function setTicketPrice(n, opts) {
    n = Math.round(+n); if (!(n >= 0)) return fail('Invalid price'); n = Math.min(n, 100);
    if (dryOf(arguments)) return okr(0);
    S.ticketPrice = n; return okr(0);
  }
  function setPrice(objectId, n, opts) {
    var o = RT.oById.get(objectId); if (!o || o.kind !== 'building') return fail('Not a shop or stall');
    n = Math.round(+n * 100) / 100; if (!(n >= 0)) return fail('Invalid price');
    var def = BD[o.type]; n = Math.min(n, Math.max(10, def.price * 8));
    if (dryOf(arguments)) return okr(0);
    o.price = n; return okr(0);
  }
  var MAX_LOAN = 100000;
  function ensureLoans() {
    if (!Array.isArray(S.loans)) {
      S.loans = S.loan > 0 ? [{ id: 1, principal: Math.round(S.loan), rate: DIFF.interest || 0.01, takenDay: S.day || 1 }] : [];
    }
    var sum = 0;
    for (var k = 0; k < S.loans.length; k++) sum += Math.max(0, Math.round(S.loans[k].principal || 0));
    S.loan = sum;
    return S.loans;
  }
  function loanQuote(n) {
    ensureLoans();
    n = Math.round(+n);
    var maxBorrow = Math.max(0, MAX_LOAN - S.loan);
    if (!(n > 0)) return { ok: false, msg: 'Invalid amount', amount: 0, rate: 0, dailyInterest: 0, maxBorrow: maxBorrow, factors: [] };
    if (S.loan + n > MAX_LOAN) return { ok: false, msg: 'The bank will not lend that much (limit ' + fmt(MAX_LOAN) + ')', amount: n, rate: 0, dailyInterest: 0, maxBorrow: maxBorrow, factors: [] };
    var ddef = difficultyDef(S.difficulty) || { name: 'Standard', interest: 0.01 };
    var base = DIFF.interest || ddef.interest || 0.01;
    var rate = base, factors = [{ label: ddef.name + ' base rate', delta: base }];
    var star = S.rating || 1;
    if (star >= 3.5) { rate -= 0.004; factors.push({ label: 'Established park (' + star.toFixed(1) + '★)', delta: -0.004 }); }
    else if (star >= 2.5) { rate -= 0.002; factors.push({ label: 'Growing park (' + star.toFixed(1) + '★)', delta: -0.002 }); }
    else if (star < 1.5) { rate += 0.003; factors.push({ label: 'Early park risk (' + star.toFixed(1) + '★)', delta: 0.003 }); }
    if (S.money < -2000) { rate += 0.012; factors.push({ label: 'Deeply overdrawn', delta: 0.012 }); }
    else if (S.money < 0) { rate += 0.008; factors.push({ label: 'Bank account in the red', delta: 0.008 }); }
    var debtAdd = Math.round(((S.loan / MAX_LOAN) * 0.015 + (n / MAX_LOAN) * 0.006) * 1000) / 1000;
    if (debtAdd > 0) { rate += debtAdd; factors.push({ label: S.loan > 0 ? 'Existing debt & loan size' : 'Loan size', delta: debtAdd }); }
    var rep = S.reputation !== undefined ? S.reputation : 50;
    if (rep >= 70) { rate -= 0.002; factors.push({ label: 'Strong reputation', delta: -0.002 }); }
    else if (rep < 35) { rate += 0.005; factors.push({ label: 'Poor reputation', delta: 0.005 }); }
    if (RT.escaped && RT.escaped.length > 0) { rate += 0.01; factors.push({ label: 'Active dinosaur escape', delta: 0.01 }); }
    else if (S.stats && S.stats.escapes > 0) { rate += 0.003; factors.push({ label: 'Past escape record', delta: 0.003 }); }
    var hist = S.finance && S.finance.history;
    if (hist && hist.length) {
      var last = hist[hist.length - 1];
      if (last.profit > 0) { rate -= 0.001; factors.push({ label: 'Profitable yesterday', delta: -0.001 }); }
      else if (last.profit < 0) { rate += 0.003; factors.push({ label: 'Operating at a loss', delta: 0.003 }); }
    }
    rate = Math.round(clamp(rate, 0.004, 0.05) * 1000) / 1000;
    return { ok: true, amount: n, rate: rate, dailyInterest: Math.max(1, Math.round(n * rate)), maxBorrow: maxBorrow, factors: factors };
  }
  function loanSummary() {
    var list = ensureLoans(), daily = 0, out = [];
    for (var k = 0; k < list.length; k++) {
      var ln = list[k]; if (!(ln.principal > 0)) continue;
      var intr = Math.max(1, Math.round(ln.principal * ln.rate));
      daily += intr;
      out.push({ id: ln.id, principal: ln.principal, rate: ln.rate, dailyInterest: intr, takenDay: ln.takenDay || 1 });
    }
    return { total: S.loan, max: MAX_LOAN, dailyInterest: daily, avgRate: S.loan > 0 ? daily / S.loan : 0, loans: out };
  }
  function takeLoan(n, opts) {
    var q = loanQuote(n);
    if (!q.ok) return fail(q.msg);
    if (dryOf(arguments)) return okr(0, { rate: q.rate, dailyInterest: q.dailyInterest, factors: q.factors });
    var list = ensureLoans(), maxId = 0;
    for (var k = 0; k < list.length; k++) if (list[k].id > maxId) maxId = list[k].id;
    var loanObj = { id: maxId + 1, principal: q.amount, rate: q.rate, takenDay: S.day };
    list.push(loanObj);
    ensureLoans();
    earn(q.amount, 'other');
    return okr(0, { id: loanObj.id, rate: q.rate, dailyInterest: q.dailyInterest, factors: q.factors });
  }
  function repayLoan(n, opts) {
    var list = ensureLoans();
    var targetId = opts && typeof opts === 'object' ? opts.loanId : 0;
    if (targetId && (n === undefined || n === null)) {
      for (var ti = 0; ti < list.length; ti++) if (list[ti].id === targetId) { n = list[ti].principal; break; }
    }
    n = Math.min(Math.round(+n), S.loan); if (!(n > 0)) return fail('Nothing to repay');
    if (S.money < n) return fail('Not enough money');
    if (dryOf(arguments)) return okr(n);
    var rem = n, order = list.slice().sort(function (a, b) {
      if (targetId && a.id === targetId) return -1;
      if (targetId && b.id === targetId) return 1;
      return (b.rate - a.rate) || (a.id - b.id);
    });
    for (var k = 0; k < order.length && rem > 0; k++) {
      var pay = Math.min(rem, order[k].principal);
      order[k].principal -= pay;
      rem -= pay;
    }
    S.loans = list.filter(function (x) { return x.principal > 0; });
    ensureLoans();
    spend(n, 'other');
    return okr(n);
  }
  var MARKETING_COST = 1800;   // was 600: with 2.8x longer days a +70% visitor campaign pays back far more per day
  function startMarketing(opts) {
    if (S.marketing.active) return fail('A campaign is already running');
    if (S.money < MARKETING_COST) return fail('Not enough money');
    if (dryOf(arguments)) return okr(MARKETING_COST);
    S.marketing.active = true; S.marketing.daysLeft = 5; spend(MARKETING_COST, 'marketing');
    msg('Marketing campaign launched. Expect more visitors for the next five days.', 'good');
    return okr(MARKETING_COST);
  }
  function renameEnclosure(id, name, opts) {
    var e = encById(id); if (!e) return fail('No such enclosure');
    name = String(name || '').trim().slice(0, 28); if (!name) return fail('Needs a name');
    if (dryOf(arguments)) return okr(0);
    e.name = name; e.auto = false; return okr(0);
  }
  function setSpeed(n) {
    n = +n; if (n !== 0 && n !== 1 && n !== 2 && n !== 4) n = n <= 0 ? 0 : n < 1.5 ? 1 : n < 3 ? 2 : 4;
    S.speed = n; return okr(0);
  }
  function setOpen(b) { S.open = !!b; return okr(0); }

  // ====================== GUESTS ======================
  function say(g, key, sp) {
    if (g.thoughtT > 0 || g.tcool > 0) return;
    var arr = D.guestThoughts[key]; if (!arr || !arr.length) return;
    var text = rng.pick(arr);
    if (text.indexOf('{animal}') >= 0) {
      var nm = 'animals';
      if (sp) nm = SP[sp] ? lc(plural(SP[sp])) : sp;
      else if (S.animals.length) { var an = S.animals[Math.floor(rng.next() * S.animals.length)]; nm = lc(plural(SP[an.species])); }
      text = text.replace(/\{animal\}/g, nm);
    }
    g.thought = text; g.thoughtT = 4.5; g.tcool = 7;
  }

  function arrivalValue() {
    var spCount = 0, seen = {};
    for (var k = 0; k < S.animals.length; k++) { var a = S.animals[k]; if (!seen[a.species] && a.enc) { seen[a.species] = 1; spCount++; } }
    RT.speciesCount = spCount;
    var ap = 0; for (k = 0; k < S.animals.length; k++) { var q = S.animals[k]; if (q.enc && q.happiness > 40) ap += aAppeal(q); } RT.appeal = ap;
    return 6 + S.rating * 3.5 + Math.min(8, spCount) * 0.9 + (Z.Monorail ? Z.Monorail.valueBonus() : 0);   // monorail package: a working line adds to what a ticket is worth
  }

  // ---- visit-plan helpers (all durations are in GAME hours, derived from DAY_SECONDS) ----
  function gxHr() { return DAY_SECONDS / 24; }       // real seconds in one game hour
  function gxGrid() {
    if (RT.gocc) return;
    RT.gocc = new Uint8Array(NN); RT.gstand = new Uint8Array(NN); RT.gtarg = new Uint8Array(NN); RT.ghead = new Int16Array(NN).fill(-1); RT.gnext = new Int16Array(MAX_GUESTS + 16); RT.gaesInit = 0;
    RT.gaes = new Float32Array(NN); RT.gaesT = 0; RT.gload = {}; RT.glm = []; RT.glmPv = -1; RT.gvd = {}; RT.gqt = 0;
  }
  // what kind of purchase a building is (null = free to enter / not a purchase)
  function gxKind(o) {
    var def = BD[o.type];
    if (def.type === 'food') return (def.satisfies && def.satisfies.hunger > 0.25) ? 'meal' : 'treat';
    if (def.type === 'drink') return 'drink';
    if (def.type === 'toilet') return 'toilet';
    if (def.type === 'shop') return 'shop';
    if (def.type === 'ride' || def.type === 'info' || def.type === 'science') return 'act';
    return 'act';
  }
  function gxIndoor(o) { var d = BD[o.type]; return d.type !== 'ride' && d.w * d.h >= 4; }
  function gxViewable(e) { var E = RT.encx[e.id]; return !!(E && E.nAn > 0 && e.viewTiles && e.viewTiles.length); }
  function gxViewCount(g) {
    var n = 0, seen = 0, encs = S.enclosures;
    for (var k = 0; k < encs.length; k++) if (gxViewable(encs[k])) { n++; if (g.seenEnc[encs[k].id]) seen++; }
    g.nView = n; g.nSeen = seen;
    return n;
  }
  // plan for a visit: how long, how much to spend, what to see. Also used to patch guests from old saves.
  function gxPlan(g, hr, ticket) {
    var left = Math.max(0, (CLOSE_T - S.time) * DAY_SECONDS);
    var h = rng.range(4.0, 5.6); if (rng.chance(0.2)) h += rng.range(0.6, 1.6);
    g.stay0 = Math.min(h * hr, Math.max(hr * 0.5, left - rng.range(0.3, 3.2) * hr));
    g.stay = g.stay0;
    g.tol = rng.range(1.05, 1.9);                  // highest price multiple (vs the standard price) they will pay
    g.thor = rng.range(0.75, 1.0);                 // fraction of the exhibits they want to see
    g.tiredAt = rng.range(28, 46);
    g.al = { meal: rng.chance(0.7) ? 1 + (rng.chance(0.1) ? 1 : 0) : 0, drink: rng.chance(0.97) ? 1 + (rng.chance(0.5) ? 1 : 0) : 0, treat: rng.chance(0.2) ? 1 : 0, shop: rng.chance(0.13) ? 1 : 0, act: rng.chance(0.25) ? 1 : 0 };
    g.seenEnc = g.seenEnc || {}; g.seenB = g.seenB || {};
    g.spent = g.spent || 0; g.paid = ticket || 0; g.nSeen = 0; g.nView = 0;
    g.prettyE = 0.3; g.nbuy = 0; g.done = 0; g.strollNext = 0; g.idle = 0; g.gAge = 0; g.ix = g.x; g.iz = g.z; g.glide = 0; g.sx = g.x; g.sz = g.z; g.spot = 0; g.lm = 0; g.wat = 0;
  }

  function spawnGuest(group, first) {
    gxGrid();
    var gi = GATE_I0 + (rng.chance(0.5) ? 1 : 0), t = gi + GATE_J * N;
    if (!S.path[t]) { t = GATE_I0 + GATE_J * N; if (!S.path[t]) return null; }
    var price = S.ticketPrice, mood = clamp(12 - Math.max(0, price - RT.value) * 1.5, -25, 12), hr = gxHr();
    // spending money for the visit (after the ticket): varied, a few big spenders, a few tight wallets
    var budget = rng.range(0.55, 1.45) * rng.range(0.6, 1.5) * 17 * (0.85 + 0.06 * S.rating);
    var g = {
      id: newId(), name: rng.pick(D.guestNames), seed: Math.floor(rng.next() * 1e9), x: cxOf(t) + rng.range(-0.8, 0.8), z: N * TILE + rng.range(0.3, 1.4),
      heading: PI, speed: 0, state: 'walk', hunger: rng.range(6, 38), thirst: rng.range(4, 36), bladder: rng.range(0, 34), energy: rng.range(72, 100),
      happiness: 70, money: Math.round(budget), thought: '', thoughtT: 0, seen: {}, group: group,
      ti: t, ni: t, px: cxOf(t), pz: czOf(t), lo: rng.range(-0.7, 0.7), lo2: rng.range(-0.5, 0.5), bs: rng.range(2.6, 3.4),
      gt: '', gid: 0, dk: '', wt: 0, nt: rng.range(0.1, 0.9), acc: 0, tcool: rng.range(0, 3), fun: rng.range(50, 90), mood: mood, lit: false,
      stay: 60, pv: RT.pathVer, last: 0, bid: 0, fleeT: 0, nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0
    };
    g.px += g.lo * 0.5; g.pz = czOf(t);
    var pay = S.ticketPrice;
    gxPlan(g, hr, pay);
    if (Z.News) Z.News.tagGuest(g);   // news package: thrill-seekers vs families
    S.guests.push(g); RT.gById.set(g.id, g);
    earn(pay, 'tickets', g.x, N * TILE - 1);
    S.stats.guestsTotal++; S.stats.guestsToday = (S.stats.guestsToday || 0) + 1;
    if (!RT.groupLead.has(group)) RT.groupLead.set(group, g.id);
    bus.emit('guestAdded', g);
    return g;
  }

  function releaseGuest(g) {
    if (g.state === 'ride' && g.sfv && Z.Safari) Z.Safari.release(g);   // safari package: step off the truck or boat
    else if (g.state === 'ride' && Z.Monorail) Z.Monorail.release(g);   // monorail package: step off the train (alights at the nearest path)
    if (g.state === 'use' && g.ubid) { var q = RT.bq[g.ubid]; if (q && q.use > 0) q.use--; g.ubid = 0; }
    if (g.state === 'queue' && g.gid) { var q2 = RT.bq[g.gid]; if (q2) { var k = q2.q.indexOf(g.id); if (k >= 0) q2.q.splice(k, 1); } }
    if (g.state === 'sit' && g.bid) { if (RT.benchOcc[g.bid] > 0) RT.benchOcc[g.bid]--; g.x = cxOf(g.ti) + g.lo * 0.5; g.z = czOf(g.ti); }
    g.rleave = 0;
  }
  function removeGuest(g) {
    releaseGuest(g);
    var k = S.guests.indexOf(g); if (k >= 0) { S.guests[k] = S.guests[S.guests.length - 1]; S.guests.pop(); }
    RT.gById.delete(g.id);
    if (RT.groupLead.get(g.group) === g.id) RT.groupLead.delete(g.group);
    // final happiness feeds reputation
    RT.ghEMA += (g.happiness - RT.ghEMA) * 0.06;
    S.reputation += (g.happiness - S.reputation) * 0.03;
    S.stats.guestsLeft = (S.stats.guestsLeft || 0) + 1;
    bus.emit('guestRemoved', g);
  }
  function startLeaving(g) {
    if (g.state === 'leave') return;
    releaseGuest(g);
    g.thoughtT = 0; g.tcool = 0; say(g, 'leaving');
    var fx = getField('exit');
    if (fx && fx[g.ti] < INF) {
      g.state = 'leave'; g.glide = 0; g.gt = 'exit'; g.dk = 'exit'; g.ni = -1; g.fleeT = 0; g.wt = 0;
      return;
    }
    if (Z.Monorail && Z.Monorail.leaveVia && Z.Monorail.leaveVia(g)) return;
    g.state = 'leave'; g.glide = 0; g.gt = 'exit'; g.dk = 'exit'; g.ni = -1; g.fleeT = 0; g.wt = 0;
  }

  function objCentre(o) {
    var fp = objFootprint(o);
    return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE };
  }

  // nearest bunker that does not mean running towards the threat
  function pickBunker(g, an) {
    var best = null, bd = 21;
    for (var k = 0; k < RT.bunkers.length; k++) {
      var o = RT.bunkers[k], f = getField('b' + o.id);
      if (!f || !(f[g.ti] < bd)) continue;
      if (an) {
        var c = objCentre(o), dg = Math.sqrt((c.x - g.x) * (c.x - g.x) + (c.z - g.z) * (c.z - g.z)), dt = Math.sqrt((c.x - an.x) * (c.x - an.x) + (c.z - an.z) * (c.z - an.z));
        if (dt < dg * 1.3 + 3) continue;
        // the dash to the bunker must not pass close to the threat
        var sx = c.x - g.x, sz = c.z - g.z, sl = sx * sx + sz * sz, tt = sl > 0 ? clamp(((an.x - g.x) * sx + (an.z - g.z) * sz) / sl, 0, 1) : 0;
        var px = g.x + sx * tt - an.x, pz = g.z + sz * tt - an.z;
        if (px * px + pz * pz < 81) continue;
      }
      bd = f[g.ti]; best = o;
    }
    return best;
  }
  function hurtGuest(g, an) {
    var d = aDanger(an), comp = Math.round(350 * d * rng.range(0.8, 1.4));
    an.hurtT = 5;
    spend(comp, 'other'); S.stats.injuries++; S.stats.compensation += comp;
    S.panic = Math.min(2, (S.panic || 0) + 0.3); S.reputation = clamp(S.reputation - 3, 0, 100);
    g.mood -= 40; g.happiness = Math.min(g.happiness, 8);
    msg('A guest was hurt by ' + an.name + ' the ' + lc(SP[an.species].name) + '! The park paid ' + fmt(comp) + ' in compensation.', 'bad');
    bus.emit('injury', { guest: g, animal: an, compensation: comp });
    startLeaving(g);
  }

  // choose a building of the wanted kind. `kind` is the purchase kind (meal/treat/drink/toilet/shop/act) or 'cover' (shelter from the weather)
  function pickBuilding(g, list, kind) {
    var best = null, bs = 1e9, k, rejected = 0, cand = 0, tolE = g.tol * clamp(WX.spend, 0.5, 1.6), ft = null;
    for (k = 0; k < list.length; k++) {
      var o = list[k], def = BD[o.type];
      if (kind === 'cover') { if (!gxIndoor(o) || def.type === 'science') continue; }
      else if (gxKind(o) !== kind) continue;
      if (Z.Power && !Z.Power.usable(o)) continue;   // power package: dark shops and stopped rides lose their customers
      if (kind === 'act' && g.seenB[o.id]) continue;
      var price = o.price === undefined ? def.price : o.price;
      if (price > 0 && g.al[kind] !== undefined && g.al[kind] <= 0) continue;
      var f = getField('b' + o.id);
      if (!f || !(f[g.ti] < INF)) continue;
      cand++;
      if (price > 0 && (price > g.money * 0.7 || (def.price > 0 && price > def.price * tolE))) { rejected++; continue; }
      var q = RT.bq[o.id], ql = q ? q.q.length : 0;
      var cap = Math.max(5, Math.ceil(def.capacity * 1.5) + 2);
      if (ql >= cap) continue;
      var sc = f[g.ti] * 1.6 + rng.next() * 12 + ql * 5 + (q ? q.use / Math.max(1, def.capacity) * 6 : 0);
      if (sc < bs) { bs = sc; best = o; }
    }
    if (!best) {
      if (cand > 0 && rejected === cand && kind !== 'cover') {            // all too dear: they forgo it
        say(g, 'expensive'); g.mood -= 1.5;
        if (g.al[kind] !== undefined) g.al[kind] = 0;
      }
      g.nbuy = gxHr() * 0.35;
      return false;
    }
    g.gt = 'bld'; g.gid = best.id; g.dk = 'b' + best.id; g.ni = -1; g.wt = 0; g.gAge = 0; g.pk = kind;
    return true;
  }

  function gxEncDist(e, t) {
    var c = RT.gvd[e.id];
    if (!c || c.pv !== RT.pathVer || c.nt !== e.tiles.length) c = RT.gvd[e.id] = { pv: RT.pathVer, nt: e.tiles.length, m: {} };
    var d = c.m[t];
    if (d === undefined) {
      var ti = t % N, tj = (t - ti) / N; d = 99;
      for (var k = 0; k < e.tiles.length; k++) { var u = e.tiles[k], ui = u % N, uj = (u - ui) / N, m = Math.abs(ui - ti) + Math.abs(uj - tj); if (m < d) d = m; }
      c.m[t] = d;
    }
    return d;
  }
  // pick one viewing tile along the fence line: close to the guest and the enclosure, but not already crowded
  function gxPickSpot(g, e) {
    var vt = e.viewTiles, best = -1, bs = 1e9, gi = g.ti % N, gj = (g.ti - gi) / N, k;
    for (k = 0; k < vt.length; k++) {
      var t = vt[k]; if (!canGuestReach(g.ti, t)) continue;
      var ti = t % N, tj = (t - ti) / N, occ = RT.gstand[t] + RT.gtarg[t], cap = RT.platTile[t] ? 6 : 2;
      var sc = (Math.abs(ti - gi) + Math.abs(tj - gj)) * 0.45 + gxEncDist(e, t) * 2.2 + occ * 4 + rng.next() * 3.5 + (occ >= cap ? 60 : 0) - (RT.platTile[t] ? 6 : 0);
      if (g.lastSpot === t) sc += 5;
      if (sc < bs) { bs = sc; best = t; }
    }
    return best;
  }
  function gxGoExhibit(g, e) {
    var t = gxPickSpot(g, e);
    if (t < 0) return false;
    var f = getField('t' + t);
    if (Z.Monorail && Z.Monorail.shortcut(g, t, e, f)) return true;   // monorail package: a long walk is replaced by a ride
    if (!f || !(f[g.ti] < INF)) return false;
    g.gt = 'enc'; g.gid = e.id; g.dk = 't' + t; g.spot = t; g.ni = -1; g.gAge = 0; RT.gtarg[t]++;
    return true;
  }
  function pickExhibit(g) {
    var encs = S.enclosures, tot = 0, k, w = RT.wbuf || (RT.wbuf = []), load = RT.gload;
    var lead = RT.groupLead.get(g.group);
    if (lead && lead !== g.id) {
      var lg = RT.gById.get(lead);
      if (lg && lg.gt === 'enc' && lg.gid !== g.last && !g.seenEnc[lg.gid] && rng.chance(0.45)) {
        var le = encById(lg.gid); if (le && gxGoExhibit(g, le)) return true;
      }
    }
    var gc = RT.comp[g.ti], reachMap = null;
    if (gc) {
      if (Z.Monorail && Z.Monorail.reachableComps) reachMap = Z.Monorail.reachableComps(gc, RT.comp);
      else { reachMap = {}; reachMap[gc] = true; }
    }
    for (k = 0; k < encs.length; k++) {
      var e = encs[k], E = RT.encx[e.id], wt = 0;
      var okR = false;
      if (E && E.nAn > 0 && e.viewTiles.length && reachMap) {
        for (var vi = 0; vi < e.viewTiles.length; vi++) if (reachMap[RT.comp[e.viewTiles[vi]]]) { okR = true; break; }
      }
      if (okR) {
        wt = (8 + E.appeal) * (0.2 + 0.8 * (e.platform ? 1 : e.see));
        var newSp = 0; for (var s = 0; s < e.species.length; s++) if (!g.seen[e.species[s]]) newSp++;
        wt *= g.seenEnc[e.id] ? 0.1 : 5 + newSp * 0.5;
        var dx = e.cx - g.x, dz = e.cz - g.z; wt /= 1 + Math.sqrt(dx * dx + dz * dz) / 30;     // mostly work outwards from where they are, but far ones still get their turn
        wt /= 1 + (load[e.id] || 0) / 5;                                                      // spread the crowd over the exhibits
        if (e.id === g.last) wt *= 0.05;
        if (E.vis === 0) wt *= 0.3;
      }
      w[k] = wt; tot += wt;
    }
    if (tot <= 0) return false;
    for (var tries = 0; tries < 4; tries++) {
      var r = rng.next() * tot, acc = 0, pick = -1;
      for (k = 0; k < encs.length; k++) { acc += w[k]; if (r <= acc && w[k] > 0) { pick = k; break; } }
      if (pick < 0) return false;
      if (gxGoExhibit(g, encs[pick])) return true;
      tot -= w[pick]; w[pick] = 0; if (tot <= 0) break;
    }
    return false;
  }

  // scenery score for every path tile (cheap, refreshed every few seconds)
  function gxAes() {
    var A = RT.gaes, k, o, sd, fp, ci, cj, di, dj, x, y;
    A.fill(0);
    for (k = 0; k < S.objects.length; k++) {
      o = S.objects[k]; if (o.kind !== 'scenery') continue;
      sd = SC[o.type]; if (!sd || !sd.aesthetic) continue;
      fp = objFootprint(o); ci = fp.i0 + (fp.w - 1) / 2; cj = fp.j0 + (fp.h - 1) / 2;
      for (dj = -3; dj <= 3; dj++) for (di = -3; di <= 3; di++) {
        x = Math.round(ci) + di; y = Math.round(cj) + dj;
        if (x < 0 || y < 0 || x >= N || y >= N || !S.path[x + y * N]) continue;
        A[x + y * N] += sd.aesthetic / (1 + Math.abs(di) + Math.abs(dj));
      }
    }
    if (Z.Power) Z.Power.gaes(A);   // power package: diesel generators are noisy and ugly
  }
  // a handful of pleasant spots around the park for strolling guests
  function gxLandmarks() {
    var pt = RT.pathTiles, lm = RT.glm = [], k, n = Math.min(60, pt.length), cands = [];
    RT.glmPv = RT.pathVer;
    for (k = 0; k < n; k++) { var t = pt[Math.floor(rng.next() * pt.length)]; if (!isParkConnected(t)) continue; cands.push({ t: t, s: RT.gaes[t] + rng.next() * 4 }); }
    cands.sort(function (a, b) { return b.s - a.s; });
    for (k = 0; k < cands.length && lm.length < 14; k++) {
      var ti = cands[k].t % N, tj = (cands[k].t - ti) / N, ok = true;
      for (var j = 0; j < lm.length; j++) { var li = lm[j] % N, lj = (lm[j] - li) / N; if (Math.abs(li - ti) + Math.abs(lj - tj) < 5) { ok = false; break; } }
      if (ok) lm.push(cands[k].t);
    }
  }
  function gxStroll(g) {
    if (RT.glmPv !== RT.pathVer) { if (!RT.gaesInit) { gxAes(); RT.gaesInit = 1; } gxLandmarks(); }
    var lm = RT.glm, gi = g.ti % N, gj = (g.ti - gi) / N;
    for (var tries = 0; tries < 5 && lm.length; tries++) {
      var t = lm[Math.floor(rng.next() * lm.length)]; if (t === g.lm) continue;
      var ti = t % N, tj = (t - ti) / N; if (Math.abs(ti - gi) + Math.abs(tj - gj) < 5) continue;
      var f = getField('t' + t); if (!f || !(f[g.ti] < INF)) continue;
      g.gt = 'stroll'; g.dk = 't' + t; g.lm = t; g.ni = -1; g.gAge = 0; return true;
    }
    return false;
  }

  function chooseGoal(g) {
    var bt = RT.byType, hr = gxHr(), al = g.al;
    g.gAge = 0;
    if (g.bladder > 68) { if (pickBuilding(g, bt.toilet, 'toilet')) return; if (g.bladder > 90) say(g, 'toilet'); }
    if (WX.thirst > 1.25 && g.thirst > 75 && al.drink <= 0 && !g.hot && g.money > 5) { g.hot = 1; al.drink = 1; }   // heatwave: an extra cold drink
    if (g.nbuy <= 0) {
      if (g.thirst > 40 && al.drink > 0) { if (pickBuilding(g, bt.drink, 'drink')) return; if (g.thirst > 80) say(g, 'thirsty'); }
      if (g.hunger > 42 && al.meal > 0) { if (pickBuilding(g, bt.food, 'meal')) return; if (g.hunger > 80) say(g, 'hungry'); }
    }
    if (g.energy < g.tiredAt && g.nbt <= 0) {
      var f = getField('bench');
      if (f && f[g.ti] < INF) { g.gt = 'bench'; g.dk = 'bench'; g.ni = -1; return; }
      g.nbt = 25; say(g, 'noBench');
    }
    if (g.lit) {
      var fb = getField('bin');
      if (fb && fb[g.ti] < 10) { g.gt = 'bin'; g.dk = 'bin'; g.ni = -1; return; }
      if (rng.chance(0.5)) { S.dirt[g.ti] = Math.min(255, S.dirt[g.ti] + 40); g.lit = false; }
    }
    // bad weather: head for somewhere under cover
    if (WX.shelter && !g.cov) { g.cov = 1; if (rng.chance(0.5) && pickBuilding(g, bt.food.concat(bt.fun), 'cover')) return; }
    if (g.nbuy <= 0) {
      // souvenir near the end of the visit, a treat when they are enjoying themselves
      if (al.shop > 0 && (g.done || g.stay < 1.4 * hr || rng.chance(0.06)) && pickBuilding(g, bt.fun, 'shop')) return;
      if (al.treat > 0 && g.happiness > 55 && rng.chance(0.12) && pickBuilding(g, bt.food, 'treat')) return;
      if ((al.act > 0 || rng.chance(0.1)) && rng.chance(0.3) && pickBuilding(g, bt.fun, 'act')) return;
    }
    if (Z.Monorail && Z.Monorail.choose(g)) return;   // monorail package: tour ride
    if (Z.Safari && Z.Safari.choose(g)) return;   // safari package: truck or boat ride
    if (g.strollNext) { g.strollNext = 0; if (gxStroll(g)) return; }
    if (!g.done && pickExhibit(g)) return;
    if (g.fun < 40) say(g, 'bored');
    if (rng.chance(0.6) && gxStroll(g)) return;
    g.gt = 'wander'; g.dk = ''; g.wt = rng.int(5, 12); g.ni = -1;
  }

  // stand on a tile in one of a few slots so that people never share a single point; spills onto connected neighbour tiles
  function gxPlace(g, own) {
    var t = g.ti, best = t, bc = RT.gstand[t], nbm = RT.nb[t], d;
    if (!own && bc >= 2) {
      for (d = 0; d < 4; d++) if (nbm & (1 << d)) { var n = t + DT4[d]; if (RT.gstand[n] < bc) { bc = RT.gstand[n]; best = n; } }
    }
    var s = RT.gstand[best]++, ring = s >> 2, off = [[-0.5, -0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5]][s & 3], sc = ring > 0 ? 0.55 : 1;
    g.sx = clamp(cxOf(best) + off[0] * sc + rng.range(-0.2, 0.2), cxOf(best) - 0.85, cxOf(best) + 0.85);
    g.sz = clamp(czOf(best) + off[1] * sc + rng.range(-0.2, 0.2), czOf(best) - 0.85, czOf(best) + 0.85);
    g.glide = 1; g.ti = best; g.ni = -1;
  }
  function gxFaceEnc(g, e) {
    var best = 1e9, bx = e.cx, bz = e.cz;
    for (var k = 0; k < e.tiles.length; k++) {
      var t = e.tiles[k], dx = cxOf(t) - g.x, dz = czOf(t) - g.z, d = dx * dx + dz * dz;
      if (d < best) { best = d; bx = cxOf(t); bz = czOf(t); }
    }
    g.hd = Math.atan2(bx - g.x, bz - g.z);
  }

  function startUse(g, o) {
    var def = BD[o.type], price = o.price === undefined ? def.price : o.price, kind = gxKind(o), hr = gxHr();
    var q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] });
    if (price > 0) {
      var tolE = g.tol * clamp(WX.spend, 0.5, 1.6);
      if (g.money < price || (def.price > 0 && price > def.price * tolE)) {  // too dear for this guest
        g.gt = ''; g.dk = ''; g.state = 'walk'; g.glide = 0; g.ni = -1; say(g, 'expensive'); g.mood -= 1.5; g.nbuy = hr * 0.35;
        if (g.al[kind] !== undefined) g.al[kind] = 0;
        return;
      }
      if (def.price > 0 && price < def.price * 0.6) say(g, 'cheap');
      g.money -= price; g.spent += price; g.nbuy = hr * 0.7;   // no back-to-back buying
      if (g.al[kind] > 0) g.al[kind]--;
      var cat = (def.type === 'food' || def.type === 'drink') ? 'food' : (def.type === 'toilet' ? 'other' : 'shops');
      earn(price, cat, g.x, g.z); o.income = (o.income || 0) + price;
    }
    q.use++; g.state = 'use'; g.ubid = o.id; g.speed = 0; g.seenB[o.id] = 1;
    g.wt = def.type === 'ride' ? 9 : def.type === 'food' ? (kind === 'treat' ? 3 : 6) : def.type === 'toilet' ? 4 : def.type === 'drink' ? 3 : 4;
    if (g.pk === 'cover' && WX.shelter) g.wt = clamp(hr * 0.6, 8, 16);
    var c = objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
  }
  function finishUse(g) {
    var o = RT.oById.get(g.ubid), q = RT.bq[g.ubid];
    if (q && q.use > 0) q.use--; g.ubid = 0;
    g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; g.glide = 0;
    if (!o) return;
    var def = BD[o.type], s = def.satisfies || {};
    if (s.hunger) g.hunger = Math.max(0, g.hunger - s.hunger * 100);
    if (s.thirst) g.thirst = Math.max(0, g.thirst - s.thirst * 100);
    if (s.bladder) g.bladder = Math.max(0, g.bladder - s.bladder * 100);
    if (s.energy) g.energy = Math.min(100, g.energy + s.energy * 100);
    if (s.fun) { g.fun = Math.min(100, g.fun + s.fun * 100); g.mood += s.fun * 8; }
    if (def.type === 'ride') g.mood += 3;
    if (def.type === 'food' || def.type === 'drink') { g.mood += 1; if (rng.chance(0.6)) g.lit = true; }
    o.uses = (o.uses || 0) + 1;
    if (def.type === 'info' && RT.hasEdu) g.mood += 2;
    if (def.type === 'science') { g.fun = Math.min(100, g.fun + 25); g.mood += 3; }
    if (o.type === 'research_lab' || o.type === 'hatchery' || o.type === 'education_centre') {
      var un = 0, rg = S.research.genomes; for (var gid in rg) if (rg[gid] >= RC.unlockGenome) un++;
      var amt = o.type === 'education_centre' ? Math.round(rng.range(2, 5) * (1 + 0.1 * un + 0.08 * RT.skeletons)) : o.type === 'research_lab' ? rng.int(2, 5) : rng.int(1, 4);
      amt = Math.min(amt, Math.floor(g.money)); if (amt > 0) { g.money -= amt; g.spent += amt; labFunding(amt); g.mood += 1; }
    }
    if (rng.chance(0.2)) say(g, 'happy');
  }

  function arriveAtGoal(g) {
    if (g.state === 'flee') {
      if (g.gt === 'bunker') {
        var bo = RT.oById.get(g.gid);
        if (bo) { g.state = 'use'; g.shel = 1; g.ubid = 0; g.gt = ''; g.dk = ''; g.wt = 6; g.speed = 0; var bc = objCentre(bo); g.hd = Math.atan2(bc.x - g.x, bc.z - g.z); g.ni = -1; gxPlace(g, false); }
        else { g.state = 'walk'; g.gt = ''; g.dk = ''; }
      }
      return;
    }
    var gt = g.gt;
    if (gt === 'bld') {
      var o = RT.oById.get(g.gid);
      if (!o) { g.gt = ''; return; }
      if (BD[o.type].safari && Z.Safari) { Z.Safari.arrive(g, o); return; }   // safari package: queue at the depot or jetty
      if (BD[o.type].mono && Z.Monorail) { Z.Monorail.arrive(g, o); return; }   // monorail package: queue on the platform
      var q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] }), def = BD[o.type];
      var c = objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
      if (q.use < def.capacity && q.q.length === 0) { gxPlace(g, false); startUse(g, o); }
      else if (q.q.length >= Math.max(5, Math.ceil(def.capacity * 1.5) + 2)) { g.gt = ''; g.dk = ''; say(g, 'crowded'); g.mood -= 1; g.nbuy = gxHr() * 0.2; }
      else { g.state = 'queue'; g.wt = 0; q.q.push(g.id); g.speed = 0; gxPlace(g, false); }
    } else if (gt === 'enc') {
      var e = encById(g.gid);
      if (!e) { g.gt = ''; return; }
      var hr = gxHr();
      g.state = 'watch'; g.wt = clamp(hr * rng.range(0.25, 0.45), 4, 8) + rng.range(0, 2.5); g.speed = 0; g.wat = 0; g.lastSpot = g.spot;
      gxPlace(g, true);
      gxFaceEnc(g, e);
    } else if (gt === 'bench') {
      var found = null, benches = RT.byType.bench;
      for (var b = 0; b < benches.length; b++) {
        var bo = benches[b], bx2 = bo.i, bz2 = bo.j, ti = g.ti % N, tj = (g.ti - ti) / N;
        if (Math.abs(bx2 - ti) + Math.abs(bz2 - tj) === 1 && (RT.benchOcc[bo.id] || 0) < 2) { found = bo; break; }
      }
      if (!found) { g.gt = ''; g.nbt = 20; say(g, 'noBench'); return; }
      RT.benchOcc[found.id] = (RT.benchOcc[found.id] || 0) + 1;
      g.bid = found.id; g.state = 'sit'; g.wt = clamp(gxHr() * 0.6, 8, 20); g.speed = 0; g.glide = 0;
      var bcx = (found.i + 0.5) * TILE, bcz = (found.j + 0.5) * TILE, tcx = cxOf(g.ti), tcz = czOf(g.ti);
      var dxx = bcx - tcx, dzz = bcz - tcz;
      g.x = tcx + dxx * 0.55 + (-dzz) * 0.15 * (RT.benchOcc[found.id] === 1 ? -1 : 1);
      g.z = tcz + dzz * 0.55 + dxx * 0.15 * (RT.benchOcc[found.id] === 1 ? 1 : -1);
      g.hd = Math.atan2(-dxx, -dzz); g.heading = g.hd;
    } else if (gt === 'bin') {
      var bins = RT.byType.bin, tti = g.ti % N, ttj = (g.ti - tti) / N;
      for (var bb = 0; bb < bins.length; bb++) {
        var bn = bins[bb];
        if (Math.abs(bn.i - tti) + Math.abs(bn.j - ttj) === 1 && (bn.fill || 0) < 15) {
          bn.fill = (bn.fill || 0) + 1; g.lit = false; g.mood += 1;
          if (bn.fill >= 15) { delete RT.fields.bin; }
          break;
        }
      }
      if (g.lit) { S.dirt[g.ti] = Math.min(255, S.dirt[g.ti] + 40); g.lit = false; }
      g.gt = '';
    } else if (gt === 'stroll') {
      g.mood += 0.6 + 2 * g.prettyE; g.gt = ''; g.dk = '';
    } else if (gt === 'exit') {
      g.gt = 'out'; g.dk = ''; g.px = g.x + rng.range(-0.5, 0.5); g.pz = N * TILE + 3; g.ni = -2;
    } else g.gt = '';
    g.dk = (g.state === 'walk' && !g.gt) ? '' : g.dk;
  }

  // soft personal space: sidestep people sharing the tile, never leaving the tile (so never into fences/buildings)
  function gxSep(g, dt) {
    var t = tileOf(g.x, g.z), i = RT.ghead[t], px = 0, pz = 0, n = 0, gs = S.guests;
    for (; i >= 0; i = RT.gnext[i]) {
      var o = gs[i]; if (!o || o === g) continue;
      var dx = g.x - o.x, dz = g.z - o.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.5) {
        var d = Math.sqrt(d2);
        if (d < 0.03) { dx = rng.range(-1, 1); dz = rng.range(-1, 1); d = 1; }
        px += dx / d * (0.7 - d); pz += dz / d * (0.7 - d); if (++n > 5) break;
      }
    }
    if (!n) return;
    var nx = g.x + px * dt * 1.6, nz = g.z + pz * dt * 1.6, cx = cxOf(t), cz = czOf(t);
    if (nx < cx - 0.9 || nx > cx + 0.9 || nz < cz - 0.9 || nz > cz + 0.9) return;
    g.x = nx; g.z = nz;
  }

  // movement: returns 1 when the guest stands on its goal tile (field distance 0) or finished a wander
  function guestMove(g, dt) {
    var spd = g.bs * WX.guestSpeed * (g.state === 'leave' ? 1.12 : 1), m = 1;
    if (g.ni < 0 && g.gt !== 'out') {
      var ti = g.ti, nb = RT.nb[ti], best = -1, d, occ = RT.gocc;
      if (g.state === 'flee' && g.gt !== 'bunker') {
        var bd2 = -1; spd *= 1.9;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) {
          var n = ti + DT4[d], dx = cxOf(n) - g.fx, dz = czOf(n) - g.fz, dd = dx * dx + dz * dz + rng.next() * 4;
          if (dd > bd2) { bd2 = dd; best = n; }
        }
      } else if (g.dk) {
        var f = getField(g.dk);
        if (g.state === 'flee') spd *= 1.9;
        if (!f) { g.gt = ''; g.dk = ''; g.speed = 0; if (g.state === 'flee') g.state = 'walk'; return 0; }
        var d0 = f[ti];
        if (d0 === 0) { g.speed = 0; return 1; }
        if (d0 === INF) { g.gt = ''; g.dk = ''; g.speed = 0; g.unr++; return 0; }
        // of the neighbours that are closer to the goal, take the least crowded one (spreads people over wide paths and junctions)
        var bsc = 1e9;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) {
          var n2 = ti + DT4[d]; if (f[n2] >= d0) continue;
          var sc = occ[n2] * 1.4 + rng.next() * 2.2; if (sc < bsc) { bsc = sc; best = n2; }
        }
        // soft cap: do not walk into a packed tile; take an emptier equal-distance neighbour or wait a moment
        if (best >= 0 && occ[best] >= 5 && g.state === 'walk') {
          var alt = -1, ao = occ[best];
          for (d = 0; d < 4; d++) if (nb & (1 << d)) { var n5 = ti + DT4[d]; if (f[n5] <= d0 && n5 !== g.prevT && occ[n5] < ao && occ[n5] < 5) { alt = n5; ao = occ[n5]; } }
          if (alt >= 0) best = alt;
          else if ((g.hold = (g.hold || 0) + dt) < 3) { g.speed = 0; return 0; }
        }
        // in a crowd, slide across to a much emptier parallel tile of a wide path (at most every few tiles)
        if (g.sc > 0) g.sc--;
        else if (occ[ti] >= 3 && g.state !== 'flee') {
          for (d = 0; d < 4; d++) if (nb & (1 << d)) {
            var n4 = ti + DT4[d];
            if (f[n4] === d0 && n4 !== g.prevT && occ[n4] + 2 <= occ[ti] && occ[n4] < occ[best < 0 ? ti : best]) { best = n4; g.sc = 2; break; }
          }
        }
      } else {
        // wander: random neighbour, prefer not to reverse, prefer pretty and quiet tiles
        var cand = -1, tw = 0, A = RT.gaes;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) {
          var n3 = ti + DT4[d]; if (n3 === g.prevT && (nb & (nb - 1))) continue;
          var w3 = 1 + (A ? A[n3] * 0.25 : 0) + 1 / (1 + occ[n3]); tw += w3; if (rng.next() * tw < w3) cand = n3;
        }
        if (cand < 0) for (d = 0; d < 4; d++) if (nb & (1 << d)) cand = ti + DT4[d];
        best = cand;
        if (--g.wt <= 0) { g.gt = ''; g.speed = 0; return 1; }
      }
      if (best < 0) { g.speed = 0; if (g.state === 'flee') return 0; g.gt = ''; g.dk = ''; return 0; }
      g.ni = best; g.prevT = ti; g.hold = 0;
      var ddx = best - ti, sx = 0, sz = 0;
      if (ddx === 1) sx = 1; else if (ddx === -1) sx = -1; else if (ddx === N) sz = 1; else sz = -1;
      g.lo = clamp(g.lo + rng.range(-0.35, 0.35), -0.8, 0.8); g.lo2 = clamp(g.lo2 + rng.range(-0.4, 0.4), -0.7, 0.7);
      g.px = cxOf(best) + (-sz) * g.lo + sx * g.lo2 * 0.6;
      g.pz = czOf(best) + sx * g.lo + sz * g.lo2 * 0.6;
    } else if (g.state === 'flee') spd *= 1.9;
    var pm = g.ti >= 0 && S.path[g.ti] ? D.paths[S.path[g.ti] - 1].speed : 1;
    spd *= pm;
    var dx2 = g.px - g.x, dz2 = g.pz - g.z, dist = Math.sqrt(dx2 * dx2 + dz2 * dz2), step = spd * dt;
    if (dist <= step + 0.01) {
      g.x = g.px; g.z = g.pz;
      if (g.gt === 'out') { return 2; }
      g.ti = g.ni; g.ni = -1; g.speed = spd;
      return 0;
    }
    g.x += dx2 / dist * step; g.z += dz2 / dist * step; g.speed = spd;
    g.heading = turn(g.heading, Math.atan2(dx2, dz2), dt * 10);
    if (g.gt !== 'out' && g.state !== 'flee') gxSep(g, dt);
    return 0;
  }

  function revalidateGuest(g) {
    g.pv = RT.pathVer;
    var t = tileOf(g.x, g.z);
    if (g.gt === 'out' || g.state === 'sit' || g.state === 'ride') return;
    if (S.path[t]) { if (g.ti !== t && g.ni < 0) g.ti = t; if (g.ni >= 0 && !S.path[g.ni]) g.ni = -1; if (!S.path[g.ti]) g.ti = t; g.ni = g.ni >= 0 && S.path[g.ni] ? g.ni : -1; return; }
    // nearest path tile
    var i = t % N, j = (t - i) / N, best = -1, bd = 1e9;
    for (var r = 1; r <= 8 && best < 0; r++) {
      for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
        var x = i + di, y = j + dj; if (!Z.inb(x, y) || !S.path[x + y * N]) continue;
        var d = di * di + dj * dj; if (d < bd) { bd = d; best = x + y * N; }
      }
    }
    if (best < 0) { removeGuest(g); return false; }
    releaseGuest(g);
    g.x = cxOf(best); g.z = czOf(best); g.ti = best; g.ni = -1; g.glide = 0; g.state = g.state === 'leave' ? 'leave' : 'walk'; if (g.state !== 'leave') { g.gt = ''; g.dk = ''; }
  }

  function guestThink(g, a) {
    var k, hr = gxHr(), ah = a / hr, st0 = g.state, still = st0 === 'watch' || st0 === 'queue' || st0 === 'use';
    if (!g.al) gxPlan(g, hr, 0);                       // guest from an older save: give them a visit plan
    // needs rise slowly: per GAME hour, so purchases stay occasional however long the day is
    g.hunger = Math.min(100, g.hunger + 7.5 * WX.hunger * ah); g.thirst = Math.min(100, g.thirst + 10.5 * WX.thirst * ah); g.bladder = Math.min(100, g.bladder + 10 * ah);
    if (st0 !== 'sit') g.energy = Math.max(0, g.energy - (still ? 5 : 9) * WX.energy * ah);
    g.fun = Math.max(0, g.fun - 6 * ah);
    g.stay -= a; g.thoughtT -= a; g.tcool -= a; g.nbt -= a; g.nbuy -= a;
    if (g.thoughtT <= 0 && g.thought) g.thought = '';
    g.mood -= g.mood * Math.min(0.5, 0.25 * ah); if (g.mood > 35) g.mood = 35; else if (g.mood < -40) g.mood = -40;
    // tile dirt
    if (S.dirt[g.ti] > 110 && rng.chance(0.15)) { say(g, 'dirty'); g.mood -= 1.5; }
    // passing the lab window: small donations to the research fund
    if (RT.labNear[g.ti] && g.state === 'walk' && g.money > 3 && rng.chance(0.02)) { var da = rng.int(1, 3); g.money -= da; g.spent += da; labFunding(da); }
    if (g.state === 'walk' && S.dirt[g.ti] > 200) g.mood -= 0.5 * a;
    // scenery: walking through a pretty, clean park is a pleasure in itself
    var pretty = Math.min(1, RT.gaes[g.ti] / 4) * (1 - Math.min(1, S.dirt[g.ti] / 160));
    g.prettyE += (pretty - g.prettyE) * Math.min(1, a * 0.12);
    // happiness: mostly the exhibits seen, a pretty clean park and variety; unmet needs and crowds pull it down
    var vc = gxViewCount(g), frac = vc ? g.nSeen / vc : 0, pen = 0, al = g.al;
    if (g.hunger > 60) pen += (g.hunger - 60) * (al.meal > 0 ? 0.6 : 0.3);
    if (g.thirst > 60) pen += (g.thirst - 60) * (al.drink > 0 ? 0.6 : 0.3);
    if (g.bladder > 60) pen += (g.bladder - 60) * 0.6;
    if (g.energy < 35) pen += (35 - g.energy) * 0.6;
    if (g.fun < 30) pen += (30 - g.fun) * 0.35;
    var target = 44 + 22 * frac + 9 * g.prettyE + Math.min(6, (g.nsp || 0) * 1.2) + g.mood - pen;
    // guides nearby
    for (k = 0; k < RT.guides.length; k++) {
      var gd = RT.guides[k], dx = gd.x - g.x, dz = gd.z - g.z;
      if (dx * dx + dz * dz < 144) { target += 8; g.fun = Math.min(100, g.fun + 1 * a); break; }
    }
    if (RT.guestCrowd > 1.1) target -= (RT.guestCrowd - 1.1) * 6;
    g.happiness += (clamp(target, 0, 100) - g.happiness) * Math.min(1, 0.35 * a);
    if (WX.fun) g.happiness += WX.fun * a;
    if (g.happiness > 100) g.happiness = 100; else if (g.happiness < 0) g.happiness = 0;
    if (g.happiness > 85 && rng.chance(0.03)) say(g, 'happy');
    if (g.energy < 20 && g.state !== 'sit') say(g, 'tired');
    if (RT.guestCrowd > 1.3 && rng.chance(0.02)) say(g, 'crowded');
    // weather: bad weather sends people for cover, or home
    if (WX.shelter) {
      if (!g.wxd) {
        g.wxd = 1;
        var cv = RT.byType.food.concat(RT.byType.fun), anyCover = false;
        for (k = 0; k < cv.length; k++) if (gxIndoor(cv[k]) && BD[cv[k].type].type !== 'science') { anyCover = true; break; }
        if (!anyCover || rng.chance(0.2)) g.stay = Math.min(g.stay, hr * rng.range(0.1, 0.7));
      }
    } else { g.wxd = 0; g.cov = 0; }
    if (g.state === 'ride') { if (g.sfv) { if (Z.Safari) Z.Safari.rideTick(g, a); } else if (Z.Monorail) Z.Monorail.rideTick(g, a); return; }   // monorail package: viewing, resting, getting off
    // closing time / leaving
    if (g.state !== 'leave') {
      if (g.rleave) {
        if (g.state === 'walk' && !g.gt) { g.rleave = 0; startLeaving(g); return; }
      } else {
        var leave = false;
        if (!S.open || S.time >= CLOSE_T - 0.004) leave = true;
        else if (g.stay <= 0) {
          // still keen and still things unseen: stay a little longer (twice at most, never past closing)
          if (!g.done && (g.ext || 0) < 2 && g.nSeen < Math.ceil(g.thor * vc) && g.happiness > 45 && g.energy > 15 && S.time < CLOSE_T - 0.06) { g.ext = (g.ext || 0) + 1; g.stay += hr * 1.3; g.stay0 += hr * 1.3; }
          else leave = true;
        } else {
          if (!g.done && vc > 0 && g.nSeen >= Math.ceil(g.thor * vc)) { g.done = 1; g.stay = Math.min(g.stay, hr * rng.range(0.35, 1.0)); }
          if (g.happiness < 14 && g.stay < g.stay0 * 0.85) leave = true;
          else if ((g.hunger > 94 || g.thirst > 97) && g.stay < g.stay0 * 0.8) leave = true;      // went home hungry
          else if (g.energy < 6 && g.nbt > 0) leave = true;
          else if (S.time > CLOSE_T - 0.14) {
            var fe = getField('exit'), de = fe ? fe[g.ti] : 0; if (de === INF) de = isParkConnected(g.ti) ? 35 : 0;
            if (S.time + (de * TILE / (g.bs * 1.2)) / DAY_SECONDS > CLOSE_T - 0.01 - (g.lj === undefined ? (g.lj = rng.range(0, 0.07)) : g.lj)) leave = true;
          }
        }
        if (leave) { startLeaving(g); return; }
      }
    } else {
      // stuck check
      var fx = getField('exit');
      if (!fx || fx[g.ti] === INF) {
        if (Z.Monorail && Z.Monorail.leaveVia && Z.Monorail.leaveVia(g)) return;
        g.isl += a; if (g.isl > 12) { removeGuest(g); return false; }
      } else g.isl = 0;
      gxWatchdog(g, a);
      return;
    }
    // stranded
    var fx2 = getField('exit');
    if (!isParkConnected(g.ti) && (!fx2 || fx2[g.ti] === INF)) { g.isl += a; if (g.isl > 25) { removeGuest(g); return false; } } else g.isl = 0;
    if (RT.dangerEsc > 0 && g.state === 'walk' && Z.Monorail && Z.Monorail.refuge(g)) return;   // monorail package: a working line is the safe way out
    // escaped animals
    if (g.state !== 'flee' && !g.shel && RT.escaped.length) {
      for (k = 0; k < RT.escaped.length; k++) {
        var an = RT.escaped[k], ad = aDanger(an);
        var ex = an.x - g.x, ez = an.z - g.z, dd = ex * ex + ez * ez;
        if (ad >= 2 && dd < 144 || ad === 1 && dd < 25) {
          say(g, 'escaped', an.species);
          if (ad >= 2) {
            releaseGuest(g);
            var bk = RT.bunkers.length ? pickBunker(g, an) : null;
            g.state = 'flee'; g.glide = 0; g.fx = an.x; g.fz = an.z; g.ni = -1;
            if (bk) { g.gt = 'bunker'; g.gid = bk.id; g.dk = 'b' + bk.id; g.fleeT = 25; g.mood -= 2; }
            else { g.gt = ''; g.dk = ''; g.fleeT = 7; g.mood -= RT.secCount > 0 ? 6 : 12; g.happiness -= 6; }
          }
          break;
        }
      }
    }
    if (RT.dangerEsc > 0 && !g.shel && g.state !== 'leave' && g.state !== 'flee' && RT.bunkers.length) {
      // guests near a bunker take cover while a dangerous dinosaur is loose
      for (k = 0; k < RT.escaped.length; k++) {
        var an2 = RT.escaped[k]; if (aDanger(an2) < 2) continue;
        var ex2 = an2.x - g.x, ez2 = an2.z - g.z;
        if (ex2 * ex2 + ez2 * ez2 < 1600) {
          var bk2 = pickBunker(g, an2);
          if (bk2) { releaseGuest(g); g.state = 'flee'; g.glide = 0; g.gt = 'bunker'; g.gid = bk2.id; g.dk = 'b' + bk2.id; g.ni = -1; g.fleeT = 25; g.fx = an2.x; g.fz = an2.z; }
          break;
        }
      }
    }
    // injuries
    if (!g.shel && RT.escaped.length) {
      for (k = 0; k < RT.escaped.length; k++) {
        var an3 = RT.escaped[k], ad3 = aDanger(an3);
        if (ad3 < 2 || an3.hurtT > 0) continue;
        var ex3 = an3.x - g.x, ez3 = an3.z - g.z;
        if (ex3 * ex3 + ez3 * ez3 < 7 && rng.chance(0.22 * ad3)) { hurtGuest(g, an3); return; }
      }
    }
    if (g.state === 'flee') {
      if (g.gt !== 'bunker') {
        for (k = 0; k < RT.escaped.length; k++) {
          var an4 = RT.escaped[k]; if (aDanger(an4) < 2) continue;
          var ex4 = an4.x - g.x, ez4 = an4.z - g.z;
          if (ex4 * ex4 + ez4 * ez4 < 324) { g.fx = an4.x; g.fz = an4.z; if (g.fleeT < 3) g.fleeT = 3; break; }
        }
      }
      g.fleeT -= a;
      if (g.fleeT <= 0) { g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; }
      return;
    }
    // state specific
    if (g.state === 'watch') { g.idle = 0; watchTick(g, a); }
    else if (g.state === 'queue') {
      g.idle = 0; g.wt += a;
      if (g.wt > Math.max(Z.Monorail ? Z.Monorail.queueLimit(g) : 22, Z.Safari ? Z.Safari.queueLimit(g) : 0)) {   // monorail package: platforms are allowed a longer wait
        var q = RT.bq[g.gid]; if (q) { var qi = q.q.indexOf(g.id); if (qi >= 0) q.q.splice(qi, 1); }
        g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1; g.mood -= 2; g.nbuy = hr * 0.2; say(g, 'crowded');
      }
    } else if (g.state === 'sit') {
      g.idle = 0; g.energy = Math.min(100, g.energy + 6 * a); g.mood += 0.2 * a;
    } else if (g.state === 'walk') {
      if (!g.gt) chooseGoal(g); else gxWatchdog(g, a);
    } else g.idle = 0;
  }

  // a walking guest that has made no progress for a few seconds (or has dawdled on one goal far too long) re-plans
  function gxWatchdog(g, a) {
    var dx = g.x - g.ix, dz = g.z - g.iz;
    if (dx * dx + dz * dz < 0.25) g.idle += a; else g.idle = 0;
    g.ix = g.x; g.iz = g.z; g.gAge += a;
    if (g.idle > 4 || g.gAge > 70) {
      g.idle = 0; g.gAge = 0; g.ni = -1; g.unr++;
      var t = tileOf(g.x, g.z); if (S.path[t]) { g.ti = t; }
      if (g.state !== 'leave') { g.gt = ''; g.dk = ''; g.nbuy = 0; }
    }
  }

  function watchTick(g, a) {
    var e = encById(g.gid), E = e && RT.encx[e.id];
    if (!e || !E || E.nAn === 0) { g.wt = 0; return; }
    var onPlat = !!E.plat[g.ti], see = onPlat ? 1 : e.see;
    if (E.vis === 0) { say(g, 'cantSee'); g.mood -= 1.5 * a; g.wt = Math.min(g.wt, 1.5); return; }
    if (see < 0.35) { say(g, 'cantSee'); g.mood -= 1.2 * a; g.wt = Math.min(g.wt, 2); return; }
    var q = (E.happy / 100) * 0.6 + 0.4 * Math.min(1, E.vis / Math.max(1, E.nAn));
    q *= 0.6 + 0.4 * see;
    if (onPlat) { q = Math.min(1.3, q * 1.3); g.mood += 1.2 * a; }
    if (Z.Realms && e.kind) { q = Math.min(1.8, q * Z.Realms.viewMul(e, E, g)); Z.Realms.watchThought(g, e, E); }   // realms package: tunnels, galleries, zones
    g.fun = Math.min(100, g.fun + 7 * a * q); g.mood += 2.4 * a * q;
    g.wat += a;
    if (!g.seenEnc[e.id] && g.wat >= 1.5) { g.seenEnc[e.id] = 1; g.nSeen++; g.mood += 4; }
    for (var s = 0; s < e.species.length; s++) {
      var sp = e.species[s];
      if (!g.seen[sp]) { g.seen[sp] = 1; g.nsp = (g.nsp || 0) + 1; g.mood += 3; if (rng.chance(0.5)) say(g, 'happy', sp); }
    }
    if (E.happy < 35) { say(g, 'animalsUnhappy'); g.mood -= 2.5 * a; }
    else {
      if (E.babies > 0 && rng.chance(0.12)) say(g, 'baby', e.species[0]);
      if (q > 0.7) {
        if (rng.chance(0.1)) say(g, 'greatExhibit', e.species[0]);
        if (g.money > 2 && rng.chance(0.008 * a * (RT.hasEdu ? 1.6 : 1) * (onPlat ? 1.5 : 1))) {
          var amt = Math.min(g.money, Math.round((1 + Math.floor(rng.next() * 3)) * (RT.hasEdu ? 1.5 : 1)));
          g.money -= amt; g.spent += amt; earn(amt, 'donations', g.x, g.z); S.stats.donations += amt; g.mood += 1.5;
        }
      }
    }
  }

  function guestStep(g, dt) {
    if (!RT.gocc) gxGrid();
    if (!g.al) gxPlan(g, gxHr(), 0);                       // guest from an older save: give them a visit plan
    if (g.pv !== RT.pathVer) { if (revalidateGuest(g) === false) return; }
    var st = g.state;
    if (st === 'walk' || st === 'leave' || st === 'flee') {
      g.glide = 0;
      if (g.gt || st === 'flee') {
        var r = guestMove(g, dt);
        if (r === 1) {
          arriveAtGoal(g);
          if (g.gt === 'wander') g.gt = '';
        } else if (r === 2) { removeGuest(g); return; }
      } else g.speed = 0;
    } else {
      g.speed = 0;
      if (g.glide) {
        var gx = g.sx - g.x, gz = g.sz - g.z, gd = Math.sqrt(gx * gx + gz * gz), gs = 1.7 * dt;
        if (gd <= gs) { g.x = g.sx; g.z = g.sz; g.glide = 0; } else { g.x += gx / gd * gs; g.z += gz / gd * gs; g.speed = 1.2; }
      }
      if (st === 'watch') {
        g.heading = turn(g.heading, g.hd, dt * 6); g.wt -= dt;
        if (g.wt <= 0) { g.last = g.gid; g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1; g.strollNext = rng.chance(0.4) ? 1 : 0; }
      }
      else if (st === 'use') {
        g.heading = turn(g.heading, g.hd, dt * 6);
        if (g.shel && RT.dangerEsc > 0) g.wt = Math.max(g.wt, 3);
        g.wt -= dt;
        if (g.wt <= 0) { if (g.shel) { g.shel = 0; g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; } else finishUse(g); }
      }
      else if (st === 'queue') g.heading = turn(g.heading, g.hd, dt * 6);
      else if (st === 'sit') {
        g.heading = turn(g.heading, g.hd, dt * 6); g.wt -= dt;
        if (g.wt <= 0 || g.energy >= 90) {
          if (RT.benchOcc[g.bid] > 0) RT.benchOcc[g.bid]--; g.bid = 0;
          g.x = cxOf(g.ti) + g.lo * 0.5; g.z = czOf(g.ti); g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1;
        }
      }
    }
    g.acc += dt; g.nt -= dt;
    if (g.nt <= 0) { var a = g.acc; g.acc = 0; g.nt = 0.7 + rng.next() * 0.3; if (guestThink(g, a) === false) return; }
  }

  function updateQueues() {
    gxGrid();
    var gs = S.guests, k, occ = RT.gocc, stand = RT.gstand, targ = RT.gtarg, head = RT.ghead, nxt = RT.gnext, load = RT.gload = {};
    occ.fill(0); stand.fill(0); targ.fill(0); head.fill(-1);
    for (k = 0; k < gs.length && k < nxt.length; k++) {
      var g = gs[k], t = tileOf(g.x, g.z), s = g.state;
      if (s === 'ride') continue;   // monorail package: riders are up in the carriages
      if (occ[t] < 255) occ[t]++;
      nxt[k] = head[t]; head[t] = k;
      if (s === 'watch' || s === 'queue' || s === 'use' || s === 'sit') { if (stand[t] < 255) stand[t]++; }
      if (g.gt === 'enc' && s === 'walk' && g.spot) targ[g.spot]++;
      if ((g.gt === 'enc' && s === 'walk') || s === 'watch') load[g.gid] = (load[g.gid] || 0) + 1;
    }
    if (--RT.gaesT <= 0) { RT.gaesT = 60; gxAes(); RT.gaesInit = 1; }
    for (var id in RT.bq) {
      var q = RT.bq[id], o = RT.oById.get(+id);
      if (!o) { delete RT.bq[id]; continue; }
      var cap = BD[o.type].capacity;
      while (q.q.length && q.use < cap) {
        var gq = RT.gById.get(q.q.shift());
        if (gq && gq.state === 'queue') startUse(gq, o);
      }
    }
  }

  function arrivalRate() {
    var spc = RT.speciesCount || 0, rating = S.rating;
    var nAn = S.animals.length;
    var base = 1.6 * RC.arrivalMul * (0.10 + 0.20 * rating + 0.04 * spc + 0.0016 * (RT.appeal || 0));
    var ratio = S.ticketPrice / Math.max(1, RT.value);
    var priceF = clamp(1.6 - ratio, 0.05, 1.3);
    var rep = 0.6 + clamp(S.reputation, 0, 100) / 100 * 0.8;
    var mk = S.marketing.active ? 1.7 : 1;
    var an = nAn > 0 ? 1 : 0.2;
    // per real second; scaled so the number of visitors per GAME day does not change with the length of the day
    return base * priceF * rep * mk * an * (150 / DAY_SECONDS) * WX.arrivals * DIFF.arrivals * (Z.News ? Z.News.arrivalMul() : 1);   // news package: stories raise or sink arrivals
  }

  // ====================== ANIMALS ======================
  function swimmer(sp, a) { return !!sp.needsWater || !!(a && a.traits && a.traits.length && fxOf(a).swim); }
  function aok(a, t) {
    if (RT.block[t] || S.ditch[t]) return false;   // ditches (and guest bridges over them) are never walkable by animals
    if (cliffT(t)) return false;
    if (a.enc) { if (S.tileEnc[t] !== a.enc && !a.bolt) return false; }   // realms package: a bolting animal leaves a downed geofence
    else if (S.tileEnc[t]) return false;
    if (S.terrain[t] === WATER && !swimmer(SP[a.species], a)) return false;
    return true;
  }
  function canGo(a, x0, z0, x1, z1) {
    if (x1 < 0 || z1 < 0 || x1 >= N * TILE || z1 >= N * TILE) return false;
    var i0 = Math.floor(x0 / TILE), j0 = Math.floor(z0 / TILE), i1 = Math.floor(x1 / TILE), j1 = Math.floor(z1 / TILE);
    if (i0 === i1 && j0 === j1) return true;
    if (!aok(a, i1 + j1 * N)) return false;
    if (i1 !== i0) { if (S.fenceZ[Math.max(i0, i1) + j0 * (N + 1)]) return false; }
    else if (j1 !== j0) { if (S.fenceX[i0 + Math.max(j0, j1) * N]) return false; }
    return true;
  }
  function canStepTile(a, t, d) {
    var i = t % N, j = (t - i) / N;
    var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return false;
    if (fenceAt(i, j, d)) return false;
    return aok(a, ni + nj * N);
  }
  function pickPassable(a, arr) {
    if (!arr || !arr.length) return -1;
    for (var k = 0; k < 6; k++) {
      var t = arr[Math.floor(rng.next() * arr.length)];
      if (aok(a, t)) return t;
    }
    for (var q = 0; q < arr.length; q++) if (aok(a, arr[q])) return arr[q];
    return -1;
  }
  function steerAnimal(a) {
    var t0 = tileOf(a.x, a.z), d, nt;
    if (a.tg === 'wander' || (a.state === 'escaped' && !a.lg)) {
      var cur = t0, prev = a.prevT >= 0 ? a.prevT : -1, wroute = [];
      for (var s = 0; s < 3; s++) {
        var cands = [], fall = [];
        for (d = 0; d < 4; d++) {
          if (!canStepTile(a, cur, d)) continue;
          nt = cur + DT4[d];
          if (nt !== prev) cands.push(nt); else fall.push(nt);
        }
        var pool = cands.length ? cands : fall;
        if (!pool.length) break;
        var nxt = pool[Math.floor(rng.next() * pool.length)];
        wroute.push(nxt);
        prev = cur; cur = nxt;
      }
      if (!wroute.length) return false;
      a.prevT = t0;
      var lastW = wroute[wroute.length - 1];
      a.tx = cxOf(lastW) + rng.range(-0.4, 0.4);
      a.tz = czOf(lastW) + rng.range(-0.4, 0.4);
      var firstW = wroute[0];
      a.wx = cxOf(firstW) + rng.range(-0.35, 0.35);
      a.wz = czOf(firstW) + rng.range(-0.35, 0.35);
      a.aroute = wroute.length > 1 ? wroute.slice(1) : null;
      return true;
    }
    var goalT = tileOf(a.tx, a.tz);
    var st = ++RT.stampN, stamp = RT.stamp, q = RT.queue, prevArr = RT.prev, h = 0, tl = 0;
    q[tl++] = t0; stamp[t0] = st; prevArr[t0] = -1;
    var bestT = -1, bestD = 1e9;
    while (h < tl && tl < 160) {
      var t = q[h++];
      if (t === goalT) { bestT = t; break; }
      if (t !== t0) {
        var bdx = cxOf(t) - a.tx, bdz = czOf(t) - a.tz, bdd = bdx * bdx + bdz * bdz;
        if (t === a.prevT) bdd += 64;
        if (bdd < bestD) { bestD = bdd; bestT = t; }
      }
      for (d = 0; d < 4; d++) {
        if (!canStepTile(a, t, d)) continue;
        nt = t + DT4[d];
        if (stamp[nt] === st) continue;
        stamp[nt] = st; prevArr[nt] = t; q[tl++] = nt;
      }
    }
    if (bestT < 0 || bestT === t0) return false;
    var route = [], c = bestT;
    while (c !== t0 && prevArr[c] >= 0) { route.push(c); c = prevArr[c]; }
    if (!route.length) return false;
    route.reverse();
    a.prevT = t0;
    var first = route[0];
    a.wx = cxOf(first) + rng.range(-0.35, 0.35);
    a.wz = czOf(first) + rng.range(-0.35, 0.35);
    var chasing = a.tg === 'hunt' || (a.state === 'escaped' && a.lg);
    a.aroute = (!chasing && route.length > 1) ? route.slice(1) : null;
    if (!chasing && bestT !== goalT) {
      var last = route[route.length - 1];
      a.tx = cxOf(last) + rng.range(-0.4, 0.4);
      a.tz = czOf(last) + rng.range(-0.4, 0.4);
    }
    return true;
  }
  // moves toward (tx,tz); returns true when arrived or given up
  function animalMove(a, dt, spd) {
    var ct = tileOf(a.x, a.z);
    if (a.curT !== ct) { a.prevT = a.curT !== undefined ? a.curT : ct; a.curT = ct; }
    var gx = a.wx ? a.wx : a.tx, gz = a.wz ? a.wz : a.tz;
    var dx = gx - a.x, dz = gz - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (!isFinite(d) || d < 0.3) {
      if (!isFinite(d)) { a.wx = 0; a.wz = 0; a.aroute = null; a.tx = a.x; a.tz = a.z; a.speed = 0; a.detours = 0; return true; }
      if (a.wx) {
        if (a.aroute && a.aroute.length) {
          var nt = a.aroute.shift();
          a.wx = cxOf(nt) + rng.range(-0.35, 0.35);
          a.wz = czOf(nt) + rng.range(-0.35, 0.35);
        } else { a.wx = 0; a.wz = 0; }
        gx = a.wx ? a.wx : a.tx; gz = a.wz ? a.wz : a.tz;
        dx = gx - a.x; dz = gz - a.z; d = Math.sqrt(dx * dx + dz * dz);
        if (!isFinite(d) || d < 0.3) { a.speed = 0; a.detours = 0; return true; }
      } else { a.speed = 0; a.detours = 0; return true; }
    }
    var step = Math.min(spd * dt, d), ox = a.x, oz = a.z;
    var vx = dx / d * step, vz = dz / d * step;
    var okX = Math.abs(dx) > 1e-4 && canGo(a, ox, oz, ox + vx, oz);
    var nx = okX ? ox + vx : ox;
    var okZ = Math.abs(dz) > 1e-4 && canGo(a, nx, oz, nx, oz + vz);
    if (okX && okZ) {
      a.x = nx; a.z = oz + vz;
    } else if (okX && Math.abs(dx) > 0.25) {
      var sx = ox + (dx > 0 ? 1 : -1) * Math.min(step, Math.abs(dx));
      if (canGo(a, ox, oz, sx, oz)) a.x = sx; else a.x = nx;
    } else if (okZ && Math.abs(dz) > 0.25) {
      var sz = oz + (dz > 0 ? 1 : -1) * Math.min(step, Math.abs(dz));
      if (canGo(a, ox, oz, ox, sz)) a.z = sz; else a.z = oz + vz;
    }
    var mx = a.x - ox, mz = a.z - oz, md = Math.sqrt(mx * mx + mz * mz);
    if (md < step * 0.35 && step > 1e-4) {
      a.stuck += dt;
      if (a.stuck > 0.08) {
        a.stuck = 0;
        a.detours = (a.detours || 0) + 1;
        if (a.detours <= 8 && steerAnimal(a)) {
          a.speed = spd;
          a.heading = turn(a.heading, Math.atan2((a.wx || a.tx) - a.x, (a.wz || a.tz) - a.z), dt * 8);
          return false;
        }
        a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0; a.speed = 0;
        return true;
      }
      a.speed = 0;
      return false;
    }
    a.stuck = 0; a.speed = spd;
    a.heading = turn(a.heading, Math.atan2(mx, mz), dt * 6);
    return false;
  }
  function setTargetTile(a, t) {
    a.tx = cxOf(t) + rng.range(-0.6, 0.6); a.tz = czOf(t) + rng.range(-0.6, 0.6);
    a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0;
  }
  function relocateAnimal(a, enc) {
    var best = -1, bd = 1e9, k;
    for (k = 0; k < enc.tiles.length; k++) {
      var t = enc.tiles[k]; if (!aok(a, t)) continue;
      var dx = cxOf(t) - a.x, dz = czOf(t) - a.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = t; }
    }
    if (best >= 0) { a.x = cxOf(best); a.z = czOf(best); a.tx = a.x; a.tz = a.z; a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0; }
  }
  function randomEncTile(a, enc, near) {
    for (var k = 0; k < 8; k++) {
      var t = enc.tiles[Math.floor(rng.next() * enc.tiles.length)];
      if (!aok(a, t)) continue;
      if (near && k < 5) { var dx = cxOf(t) - a.x, dz = czOf(t) - a.z; if (dx * dx + dz * dz > near * near) continue; }
      return t;
    }
    return -1;
  }
  function animalBulk(a) {
    var sp = SP[a.species];
    return (sp.size * 0.7 + (sp.length || sp.size * 2) * 0.15) * (a.baby ? 0.45 : 1);
  }
  function combatPower(a) {
    var sp = SP[a.species], d = aDanger(a);
    var p = animalBulk(a) * (1 + d * 0.28) * (isPredator(sp) ? 1.18 : 1.0);
    var hm = 0.4 + 0.6 * clamp(a.health / 100, 0, 1);
    if (a.injured) hm *= 0.72;
    if (a.sick) hm *= 0.65;
    return Math.max(0.15, p * hm);
  }
  function gatherPack(leader, enc) {
    if (!enc || !isPackHunter(SP[leader.species])) return [leader];
    var mates = [];
    for (var k = 0; k < enc.animals.length; k++) {
      var m = RT.aById.get(enc.animals[k]);
      if (!m || m === leader || m.species !== leader.species || m.baby || m.sick || m.injured || m.state === 'escaped' || m.state === 'sleep' || m.state === 'fight') continue;
      var dx = m.x - leader.x, dz = m.z - leader.z;
      mates.push({ a: m, d2: dx * dx + dz * dz });
    }
    mates.sort(function (u, v) { return u.d2 - v.d2; });
    var pack = [leader];
    for (var i = 0; i < mates.length && i < 3; i++) pack.push(mates[i].a);
    return pack;
  }
  function packPower(pack) {
    if (!pack || !pack.length) return 0;
    var sum = combatPower(pack[0]);
    for (var i = 1; i < pack.length; i++) sum += 0.65 * combatPower(pack[i]);
    return sum;
  }
  function fightById(fid) {
    if (!fid || !S.fights) return null;
    for (var k = 0; k < S.fights.length; k++) if (S.fights[k].id === fid) return S.fights[k];
    return null;
  }
  function findPrey(a, enc) {
    var pack = gatherPack(a, enc), pPow = packPower(pack);
    var bestNorm = null, bdNorm = 1e9, bestBig = null, bdBig = 1e9;
    for (var k = 0; k < enc.animals.length; k++) {
      var p = RT.aById.get(enc.animals[k]);
      if (!p || p === a || p.state === 'escaped' || p.state === 'fight') continue;
      if (isPredator(SP[p.species])) continue;
      var ratio = combatPower(p) / pPow;
      var dx = p.x - a.x, dz = p.z - a.z, d = dx * dx + dz * dz;
      if (ratio <= 1.15) {
        if (d < bdNorm) { bdNorm = d; bestNorm = p; }
      } else if (ratio <= 2.3) {
        if (a.hunger > 50 && rng.chance(clamp(0.32 - (ratio - 1.15) * 0.24, 0.04, 0.32))) {
          if (d < bdBig) { bdBig = d; bestBig = p; }
        }
      } else if (a.hunger > 80 && ratio <= 3.2 && rng.chance(0.05)) {
        if (d < bdBig) { bdBig = d; bestBig = p; }
      }
    }
    return bestNorm || bestBig;
  }
  function findRivalPredator(a, enc) {
    var pPow = packPower(gatherPack(a, enc));
    var bestDiff = null, bdDiff = 1e9, bestSame = null, bdSame = 1e9;
    for (var k = 0; k < enc.animals.length; k++) {
      var p = RT.aById.get(enc.animals[k]);
      if (!p || p === a || p.baby || p.state === 'escaped' || p.state === 'fight' || p.sick) continue;
      if (!isPredator(SP[p.species])) continue;
      var same = p.species === a.species;
      if (same && !(a.happiness < 45 && rng.chance(0.15))) continue;
      var ratio = combatPower(p) / pPow;
      if (ratio > 1.25 && !rng.chance(clamp(0.45 / ratio, 0.08, 0.4))) continue;
      var dx = p.x - a.x, dz = p.z - a.z, d = dx * dx + dz * dz;
      if (!same) { if (d < bdDiff) { bdDiff = d; bestDiff = p; } }
      else { if (d < bdSame) { bdSame = d; bestSame = p; } }
    }
    return bestDiff || bestSame;
  }
  function startChase(a, tg, target) {
    a.tg = tg; a.hid = target.id; a.hunt = 0; a.state = 'run';
    a.tx = target.x; a.tz = target.z; a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0; a.stuck = 0;
  }
  function rallyPack(leader, enc, tg, target) {
    if (!isPackHunter(SP[leader.species])) return;
    var pack = gatherPack(leader, enc);
    for (var i = 1; i < pack.length; i++) {
      var m = pack[i];
      if ((m.state === 'idle' || (m.state === 'walk' && m.tg === 'wander')) && !m.injured && m.health > 35 && (m.fightCd || 0) <= 0) {
        startChase(m, tg, target);
      }
    }
  }
  function startFight(attacker, defender, kind, enc) {
    if (!attacker || !defender || attacker === defender || attacker.state === 'fight' || defender.state === 'fight') return null;
    if (!enc) enc = RT.eMap[attacker.enc || defender.enc];
    var attackers = [attacker];
    if (enc && isPackHunter(SP[attacker.species])) {
      for (var k = 0; k < enc.animals.length && attackers.length < 4; k++) {
        var m = RT.aById.get(enc.animals[k]);
        if (!m || m === attacker || m === defender || m.species !== attacker.species || m.baby || m.sick || m.injured) continue;
        if (m.state === 'escaped' || m.state === 'fight') continue;
        if ((m.tg === 'hunt' || m.tg === 'fight_rival') && m.hid === defender.id) {
          var mdx = m.x - defender.x, mdz = m.z - defender.z;
          if (mdx * mdx + mdz * mdz <= 4.5 * 4.5) attackers.push(m);
        }
      }
    }
    var atkSp = SP[attacker.species], defSp = SP[defender.species];
    var tiny = kind === 'hunt' && combatPower(defender) < packPower(attackers) * 0.3 && aDanger(defender) === 0;
    var dur = tiny ? 1.6 : rng.range(3.0, 4.5);
    var size = clamp(Math.max(atkSp.size, defSp.size) * 0.9 + attackers.length * 0.25, 0.9, 4.2);
    var fx = (attacker.x + defender.x) * 0.5, fz = (attacker.z + defender.z) * 0.5, fy = Math.max(attacker.y || 0, defender.y || 0);
    var fight = {
      id: newId(), x: fx, z: fz, y: fy, enc: enc ? enc.id : (attacker.enc || defender.enc || 0),
      kind: kind || 'hunt',
      attackers: attackers.map(function (u) { return u.id; }),
      defenders: [defender.id],
      t: 0, dur: dur, size: size
    };
    for (var i = 0; i < attackers.length; i++) {
      attackers[i].state = 'fight'; attackers[i].fid = fight.id; attackers[i].tg = ''; attackers[i].speed = 0;
    }
    defender.state = 'fight'; defender.fid = fight.id; defender.tg = ''; defender.speed = 0;
    if (!S.fights) S.fights = [];
    S.fights.push(fight);
    bus.emit('fightStart', fight);
    return fight;
  }
  function resolveFight(f, atks, defs) {
    var i, all = atks.concat(defs);
    for (i = 0; i < all.length; i++) all[i].fid = 0;
    var lead = atks[0], def = defs[0];
    var enc = RT.eMap[f.enc];
    var atkPow = packPower(atks), defPow = packPower(defs);
    var ap = Math.pow(atkPow, 1.35), dp = Math.pow(defPow, 1.35);
    var winChance = clamp(ap / (ap + dp), 0.08, 0.94);
    var atkWins = rng.chance(winChance);
    var defSp = SP[def.species], leadSp = SP[lead.species];
    if (f.kind === 'hunt') {
      if (atkWins) {
        msg(def.name + ' the ' + lc(defSp.name) + ' was caught and eaten by ' + (atks.length > 1 ? 'a pack of ' + lc(plural(leadSp)) : lead.name + ' the ' + lc(leadSp.name)) + '!', 'bad');
        S.stats.deaths++; S.stats.predations++;
        bus.emit('death', def);
        bus.emit('predation', { predator: lead, prey: def, pack: atks.length });
        removeAnimal(def);
        var retal = (defPow / atkPow > 0.5) || aDanger(def) >= 1;
        for (i = 0; i < atks.length; i++) {
          var aa = atks[i];
          aa.hunger = Math.max(0, aa.hunger - (atks.length > 1 ? 55 : 70));
          aa.state = 'eat'; aa.st = rng.range(4, 6.5); aa.tg = ''; aa.speed = 0; aa.hid = 0; aa.kill = 1;
          aa.fightCd = rng.range(18, 28);
          if (retal && (i === 0 || rng.chance(0.45))) {
            aa.health = Math.max(5, aa.health - rng.range(10, 35));
            if (aa.health < 70) aa.injured = true;
          }
        }
      } else {
        var dmg = rng.range(25, 80) * clamp(defPow / atkPow, 0.7, 2.2);
        lead.health -= dmg;
        if (lead.health <= 0) {
          animalDie(lead, 'fighting ' + def.name + ' the ' + lc(defSp.name));
        } else {
          lead.injured = true; lead.fightCd = 32; lead.happiness = Math.max(5, lead.happiness - 15);
          if (enc) fleeFrom(lead, enc, def.x, def.z); else { lead.state = 'idle'; lead.st = 2; }
          msg(def.name + ' the ' + lc(defSp.name) + ' fought off and injured ' + lead.name + ' the ' + lc(leadSp.name) + '!', 'info');
        }
        for (i = 1; i < atks.length; i++) {
          var pm = atks[i];
          pm.health = Math.max(10, pm.health - rng.range(8, 22));
          if (pm.health < 70) pm.injured = true;
          pm.fightCd = 32;
          if (enc) fleeFrom(pm, enc, def.x, def.z); else { pm.state = 'idle'; pm.st = 2; }
        }
        def.health = Math.max(10, def.health - rng.range(8, 24));
        if (def.health < 65) def.injured = true;
        def.fightCd = 20;
        if (enc) fleeFrom(def, enc, lead.x, lead.z); else { def.state = 'idle'; def.st = 2; }
      }
    } else {
      var winners = atkWins ? atks : defs, losers = atkWins ? defs : atks;
      var winLead = winners[0], loseLead = losers[0];
      for (i = 0; i < winners.length; i++) {
        var w = winners[i];
        w.health = Math.max(8, w.health - rng.range(10, 30));
        if (w.health < 65) w.injured = true;
        w.fightCd = rng.range(28, 38);
        w.state = 'idle'; w.tg = ''; w.st = rng.range(1.5, 3); w.speed = 0;
      }
      for (i = 0; i < losers.length; i++) {
        var l = losers[i];
        l.health -= rng.range(35, 75);
        if (l === loseLead && (l.health <= 0 || rng.chance(0.4))) {
          animalDie(l, 'in a fight with ' + winLead.name + ' the ' + lc(SP[winLead.species].name));
        } else {
          l.health = l.health <= 0 ? rng.range(12, 30) : clamp(l.health, 12, 45);
          l.injured = true; l.fightCd = rng.range(28, 38); l.happiness = Math.max(5, l.happiness - 18);
          if (enc) fleeFrom(l, enc, winLead.x, winLead.z); else { l.state = 'idle'; l.st = 2; }
        }
      }
      if (RT.aById.has(loseLead.id)) {
        msg(winLead.name + ' the ' + lc(SP[winLead.species].name) + ' defeated ' + loseLead.name + ' the ' + lc(SP[loseLead.species].name) + ' in a fight!', 'bad');
      }
    }
    bus.emit('fightEnd', { fight: f, atkWins: atkWins, x: f.x, z: f.z });
  }
  function stepFights(dt) {
    if (!S.fights || !S.fights.length) return;
    for (var k = S.fights.length - 1; k >= 0; k--) {
      var f = S.fights[k];
      f.t += dt;
      var atks = [], defs = [], i, a;
      for (i = 0; i < f.attackers.length; i++) { a = RT.aById.get(f.attackers[i]); if (a && a.state !== 'escaped') atks.push(a); }
      for (i = 0; i < f.defenders.length; i++) { a = RT.aById.get(f.defenders[i]); if (a && a.state !== 'escaped') defs.push(a); }
      if (!atks.length || !defs.length) {
        var rem = atks.concat(defs);
        for (i = 0; i < rem.length; i++) { rem[i].fid = 0; rem[i].state = 'idle'; rem[i].st = 1; }
        S.fights.splice(k, 1);
        continue;
      }
      var all = atks.concat(defs), rad = clamp(f.size * 0.32, 0.25, 1.1);
      for (i = 0; i < all.length; i++) {
        var p = all[i], ang = f.t * 9 + i * (TAU / all.length);
        p.x = f.x + Math.cos(ang) * rad;
        p.z = f.z + Math.sin(ang) * rad;
        p.heading = turn(p.heading, Math.atan2(f.x - p.x, f.z - p.z) + PI * 0.35, 1);
        p.state = 'fight'; p.fid = f.id; p.speed = 0;
      }
      if (f.t >= f.dur) {
        S.fights.splice(k, 1);
        resolveFight(f, atks, defs);
      }
    }
  }
  function huntStep(a, dt, enc, E, sp) {
    var pr = RT.aById.get(a.hid) || (a.hid >= 1000000 && Z.Safari ? Z.Safari.wildById(a.hid) : null);   // safari package: the prey may be a wild visitor
    if (!pr || pr.enc !== a.enc || pr.state === 'escaped') { a.tg = ''; a.state = 'idle'; a.st = 1; a.speed = 0; return; }
    a.hunt = (a.hunt || 0) + dt; a.tx = pr.x; a.tz = pr.z;
    var dx = pr.x - a.x, dz = pr.z - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (pr.state === 'fight' && pr.fid) {
      var f = fightById(pr.fid);
      var isMate = f && f.attackers.some(function (id) { var m = RT.aById.get(id); return m && m.species === a.species; });
      if (isMate) {
        if (d < 2.2 + sp.length * 0.12) {
          if (f.attackers.indexOf(a.id) < 0 && f.defenders.indexOf(a.id) < 0) f.attackers.push(a.id);
          a.state = 'fight'; a.fid = f.id; a.tg = ''; a.speed = 0;
        } else {
          a.state = 'run'; animalMove(a, dt, sp.speed * fxOf(a).speed * (a.injured ? 0.65 : 1) * 1.7 * 1.12);
        }
        return;
      }
      a.tg = ''; a.state = 'idle'; a.st = rng.range(1, 2.5); a.speed = 0; return;
    }
    if (d < 1.3 + sp.length * 0.12) {
      if (pr.wild) Z.Safari.killWild(a, pr);
      else startFight(a, pr, a.tg === 'fight_rival' ? 'predator' : 'hunt', enc);
      return;
    }
    if (a.hunt > 40) { a.tg = ''; a.state = 'idle'; a.st = rng.range(3, 6); a.speed = 0; return; }
    a.state = 'run';
    animalMove(a, dt, sp.speed * fxOf(a).speed * (a.injured ? 0.65 : 1) * 1.7 * 1.12);
  }
  function fleeFrom(a, enc, hx, hz) {
    var best = -1, bd = -1;
    for (var k = 0; k < 6; k++) {
      var t = randomEncTile(a, enc, 0); if (t < 0) continue;
      var dx = cxOf(t) - hx, dz = czOf(t) - hz, d = dx * dx + dz * dz; if (d > bd) { bd = d; best = t; }
    }
    if (best < 0) return;
    a.tg = 'flee'; a.state = 'run'; a.stuck = 0; setTargetTile(a, best);
  }
  function animalDie(a, cause) {
    var sp = SP[a.species];
    msg(a.name + ' the ' + sp.name.toLowerCase() + ' has died ' + cause + '.', 'bad');
    S.stats.deaths++;
    bus.emit('death', a);
    removeAnimal(a);
  }

  function decide(a, enc, E, sp) {
    if (a.state === 'fight') return;
    var t = tileOf(a.x, a.z);
    if (!aok(a, t)) { relocateAnimal(a, enc); t = tileOf(a.x, a.z); }
    if (a.sick) { a.state = 'sick'; a.speed = 0; return; }
    var target = -1, pry = null, rival = null;
    if (isNight() || a.energy < 18) {
      a.tg = 'sleep';
      if (E.shelter.length && (sp.needsShelter || rng.chance(0.6))) target = pickPassable(a, E.shelter);
      if (target < 0 || (tileOf(a.x, a.z) === target)) { a.state = 'sleep'; a.speed = 0; a.tg = ''; return; }
    } else if (isPredator(sp) && !a.baby && !a.injured && a.health > 35 && (a.fightCd || 0) <= 0) {
      if (a.hunger > 45 && Z.Safari && (pry = Z.Safari.findPrey(a, enc)) && rng.chance(0.85)) {   // safari package: wild animals that wandered into a connected zone
        startChase(a, 'hunt', pry); return;
      } else if (E.pred > 1 && rng.chance(a.hunger > 55 ? 0.32 : 0.18) && (rival = findRivalPredator(a, enc))) {
        startChase(a, 'fight_rival', rival); rallyPack(a, enc, 'fight_rival', rival); return;
      } else if (a.hunger > 35 && E.nAn > 1 && E.pred < E.nAn && (pry = findPrey(a, enc)) && rng.chance(a.hunger > 55 ? 0.85 : 0.45)) {
        startChase(a, 'hunt', pry); rallyPack(a, enc, 'hunt', pry); return;
      }
    }
    if (a.hunger > 55 && enc.foodLevel > 0.02) { a.tg = 'eat'; target = isPredator(sp) && E.carc.length ? pickPassable(a, E.carc) : E.feed; }
    else if (a.thirst > 55 && (E.water.length || enc.waterLevel > 0.02)) {
      a.tg = 'drink';
      target = E.drink.length ? pickPassable(a, E.drink) : (E.water.length && swimmer(sp, a) ? pickPassable(a, E.water) : E.feed);
    } else if (E.toy.length && rng.chance(0.12)) { a.tg = 'play'; target = pickPassable(a, E.toy); }
    else if (E.water.length && swimmer(sp, a) && rng.chance(0.18)) { a.tg = 'swim'; target = pickPassable(a, E.water); }
    else { a.tg = 'wander'; target = randomEncTile(a, enc, 14); }
    if (target < 0 || !aok(a, target)) { a.state = 'idle'; a.st = rng.range(1.5, 4); a.tg = ''; return; }
    setTargetTile(a, target);
    a.state = (a.tg === 'wander' && rng.chance(0.06)) || (a.baby && rng.chance(0.15)) ? 'run' : 'walk';
    a.stuck = 0;
  }

  function animalStep(a, dt) {
    var sp = SP[a.species];
    if (a.fightCd > 0) a.fightCd = Math.max(0, a.fightCd - dt);
    if (a.state === 'escaped') { escapedStep(a, dt, sp); return; }
    var enc = RT.eMap[a.enc], E = enc && RT.encx[a.enc];
    if (!enc || !E) return;
    var sleeping = a.state === 'sleep';
    a.hunger = Math.min(100, a.hunger + (sleeping ? 0.08 : 0.22) * dt);
    a.thirst = Math.min(100, a.thirst + (sleeping ? 0.12 : 0.3) * dt);
    a.energy = clamp(a.energy + (sleeping ? 1.2 : -0.12) * dt, 0, 100);
    if (a.hunger >= 95 || a.thirst >= 95) a.health -= (a.thirst >= 95 ? 0.12 : 0.08) * dt;
    else if (a.sick) a.health -= 0.05 * dt;
    else if (a.injured) a.health -= 0.03 * dt;
    else if (a.health < 100 && a.hunger < 70 && a.thirst < 70) a.health = Math.min(100, a.health + 0.04 * dt * (0.6 + 0.4 * aQ(a) / 100));
    if (enc.poop > enc.area * 0.4 + 3) a.health -= 0.01 * dt;
    if (a.health <= 0) {
      animalDie(a, a.sick ? 'of illness' : (a.injured ? 'of injuries' : (a.thirst >= 95 ? 'of thirst' : a.hunger >= 95 ? 'of hunger' : 'of neglect')));
      return;
    }
    a.ht = (a.ht || 0) - dt;
    if (a.ht <= 0) {
      a.ht = 1;
      var suit = enc.suitability[a.species]; if (suit === undefined) suit = 0.5;
      var tgt = 12 + suit * 50 + (100 - a.hunger) * 0.12 + (100 - a.thirst) * 0.12 + a.health * 0.08 + a.energy * 0.06;
      if (a.sick) tgt *= 0.6;
      if (a.injured) tgt *= 0.72;
      tgt += WX.animalMood;   // weather: storms stress, heat hurts when there is nothing to drink
      if (WX.type === 'heatwave' && !E.water.length && !E.drink.length) tgt -= 5 * WX.intensity;
      if (enc.minFence < aMinFence(a)) tgt -= 6;
      a.happiness += (tgt - a.happiness) * 0.05; a.happiness = clamp(a.happiness, 0, 100);
    }
    a.pt -= dt;
    if (a.pt <= 0 && !a.baby) { a.pt = rng.range(55, 95); enc.poop = Math.min(enc.poop + 1, Math.floor(enc.area * 0.5) + 4); }
    if (a.state !== 'fight' && Z.Safari && enc.kind && Z.Safari.hunt(a, dt, enc, E, sp)) return;   // safari package: sea and air predators hunting wild visitors
    if (a.state !== 'fight' && Z.Realms && enc.kind && Z.Realms.move(a, dt, enc, E, sp)) return;   // realms package: sea and air AI, bolting from a downed geofence
    var inWater = S.terrain[tileOf(a.x, a.z)] === WATER;
    a.y = inWater ? -0.3 : 0;
    if (E.pred && !isPredator(sp) && !a.baby && a.state !== 'fight') {
      a.fl = (a.fl || 0) - dt;
      if (a.fl <= 0) {
        a.fl = 0.6;
        for (var hk = 0; hk < enc.animals.length; hk++) {
          var hp = RT.aById.get(enc.animals[hk]);
          if (hp && hp.tg === 'hunt' && hp.hid === a.id) {
            var hdx = hp.x - a.x, hdz = hp.z - a.z;
            if (hdx * hdx + hdz * hdz < 100) { if (a.tg !== 'flee' || a.state !== 'run') fleeFrom(a, enc, hp.x, hp.z); break; }
          }
        }
      }
    }
    switch (a.state) {
      case 'fight':
        a.speed = 0;
        if (!a.fid || !fightById(a.fid)) { a.fid = 0; a.state = 'idle'; a.st = 1; }
        break;
      case 'sleep':
        a.speed = 0;
        if (!isNight() && a.energy >= 60) { a.state = 'idle'; a.st = rng.range(0.5, 3); }
        break;
      case 'sick':
        a.speed = 0; if (!a.sick) { a.state = 'idle'; a.st = 1; }
        break;
      case 'idle':
        a.speed = 0; a.st -= dt;
        if (a.sick) { a.state = 'sick'; break; }
        if (a.st <= 0) decide(a, enc, E, sp);
        break;
      case 'walk': case 'run': case 'swim': {
        if (a.tg === 'hunt' || a.tg === 'fight_rival') { huntStep(a, dt, enc, E, sp); break; }
        var spd = sp.speed * fxOf(a).speed * (a.baby ? 0.8 : 1) * (a.injured ? 0.65 : 1) * (a.state === 'run' ? 1.7 : a.state === 'swim' ? 0.6 : 0.75);
        if (inWater && a.state !== 'swim') spd *= 0.7;
        if (animalMove(a, dt, spd)) {
          var tg = a.tg;
          if (tg === 'eat') { a.state = 'eat'; a.st = rng.range(3.5, 6); }
          else if (tg === 'drink') { a.state = 'drink'; a.st = rng.range(2.5, 4.5); }
          else if (tg === 'play') { a.state = 'play'; a.st = rng.range(4, 8); }
          else if (tg === 'swim') {
            var wt = pickPassable(a, E.water);
            if (wt >= 0) { a.state = 'swim'; a.st = rng.range(5, 10); setTargetTile(a, wt); a.tg = 'swimming'; }
            else { a.state = 'idle'; a.st = 1; }
          }
          else if (tg === 'swimming') { a.state = 'idle'; a.st = 1; }
          else if (tg === 'sleep') { a.state = 'sleep'; a.tg = ''; a.speed = 0; }
          else if (tg === 'wander' && !isNight() && a.energy > 30 && rng.chance(0.4)) {
            var nt2 = randomEncTile(a, enc, 10);
            if (nt2 >= 0) { setTargetTile(a, nt2); a.state = 'walk'; }
            else { a.state = 'idle'; a.st = rng.range(1.5, 6); }
          }
          else { a.state = 'idle'; a.st = rng.range(1.5, 6); }
          if (a.state !== 'swim' && a.state !== 'walk') a.speed = 0;
          if (a.state === 'swim' && tg === 'swimming') a.state = 'idle';
        }
        break;
      }
      case 'eat':
        a.speed = 0; a.st -= dt;
        if (a.st <= 0) {
          if (a.kill) a.kill = 0;
          else { a.hunger = Math.max(0, a.hunger - 65); enc.foodLevel = Math.max(0, enc.foodLevel - (sp.predator ? (E.carc.length ? 0.06 : 0.2) : 0.1)); }
          a.state = 'idle'; a.st = rng.range(1, 3);
        }
        break;
      case 'drink':
        a.speed = 0; a.st -= dt;
        if (a.st <= 0) {
          a.thirst = 0; if (!E.water.length && !E.moatN) enc.waterLevel = Math.max(0, enc.waterLevel - 0.08);
          a.state = 'idle'; a.st = rng.range(1, 3);
        }
        break;
      case 'play':
        a.speed = 0; a.st -= dt; a.happiness = Math.min(100, a.happiness + 1.5 * dt);
        if (a.st <= 0) { a.state = 'idle'; a.st = rng.range(1, 3); }
        break;
    }
  }

  // ---- escapes ----
  // via (moats package): {t: landing tile on the far side of the ditch, how: 'leapt'|'waded through'|'swum across'} - the animal crosses the moat at that spot
  function doEscape(a, enc, via) {
    var E = RT.encx[enc.id], sp = SP[a.species], k, t = -1;
    if (via && via.t >= 0) t = via.t;
    for (k = 0; t < 0 && k < 6 && E.out.length; k++) {
      var c = E.out[Math.floor(rng.next() * E.out.length)];
      if (!RT.block[c] && !S.tileEnc[c] && S.terrain[c] !== WATER) { t = c; break; }
    }
    if (t < 0 && RT.pathTiles.length) t = RT.pathTiles[Math.floor(rng.next() * RT.pathTiles.length)];
    if (t < 0) return;
    stripFromFights(a.id);
    a.home = enc.id; a.enc = 0; a.state = 'escaped'; a.fid = 0; a.tg = ''; a.esc = 0; a.claim = 0; a.y = 0;
    a.x = cxOf(t) + rng.range(-0.5, 0.5); a.z = czOf(t) + rng.range(-0.5, 0.5); a.tx = a.x; a.tz = a.z; a.speed = 0;
    refreshEncAnimals(); encStats(enc);
    S.stats.escapes++;
    msg('Escape! ' + a.name + ' the ' + sp.name.toLowerCase() + (via && via.how ? ' has ' + via.how + ' ' : ' has broken out of ') + enc.name + '!' + (aDanger(a) >= 2 ? ' Guests are in danger.' : ''), 'bad');
    onEscape(a);
    bus.emit('escape', a);
  }
  function recapture(a, by) {
    var enc = a.home ? RT.eMap[a.home] : null;
    if (!enc) {
      var bd = 1e9; for (var k = 0; k < S.enclosures.length; k++) {
        var e = S.enclosures[k], dx = e.cx - a.x, dz = e.cz - a.z, d = dx * dx + dz * dz;
        if (d < bd && !compatible(e, a.species) && (!Z.Realms || Z.Realms.realmOK(e, a.species))) { bd = d; enc = e; }
      }
    }
    if (!enc) {
      msg(a.name + ' the ' + SP[a.species].name.toLowerCase() + ' was caught, but there is nowhere to house it. It has been sent to a rescue centre.', 'info');
      removeAnimal(a); return;
    }
    a.enc = enc.id; a.state = 'idle'; a.st = 2; a.tg = ''; a.esc = 0; a.claim = 0; a.home = 0;
    var t = randomEncTile(a, enc, 0);
    if (t < 0) t = RT.encx[enc.id].feed;
    a.x = cxOf(t); a.z = czOf(t); a.tx = a.x; a.tz = a.z; a.speed = 0;
    a.happiness = Math.max(10, a.happiness - 15);
    refreshEncAnimals(); encStats(enc);
    msg((by || 'Staff') + ' recaptured ' + a.name + ' the ' + SP[a.species].name.toLowerCase() + ' and returned it to ' + enc.name + '.', 'good');
    bus.emit('recapture', a);
  }
  function escapedStep(a, dt, sp) {
    if (Z.Safari && a.sfOut && Z.Safari.outStep(a, dt, sp)) return;   // safari package: heading for the causeway, the open sea or the sky
    if (Z.Realms && a.er && Z.Realms.escapedStep(a, dt, sp)) return;   // realms package: loose marine/flying animals
    a.esc = (a.esc || 0) + dt;
    a.hunger = Math.min(100, a.hunger + 0.1 * dt); a.thirst = Math.min(100, a.thirst + 0.1 * dt);
    if (a.held) { a.speed = 0; return; }
    var adg = aDanger(a), limit = adg >= 2 ? (RT.secCount > 0 ? 100 : 200) : (RT.secCount > 0 || RT.keeperCount > 0 ? 300 : 150);
    if (a.hurtT > 0) a.hurtT -= dt;
    if (a.esc > limit) { recapture(a, 'The response team'); return; }
    var spdE = sp.speed * fxOf(a).speed * 1.1;
    if (adg >= 2) {
      // a loose big predator picks out the nearest guest who has not taken cover and runs them down
      a.lk = (a.lk || 0) - dt;
      if (a.lk <= 0) {
        a.lk = 0.5; var bg = null, bd = 484;
        for (var gk = 0; gk < S.guests.length; gk++) {
          var gg = S.guests[gk]; if (gg.shel) continue;
          var gx = gg.x - a.x, gz = gg.z - a.z, gd = gx * gx + gz * gz; if (gd < bd) { bd = gd; bg = gg; }
        }
        a.lg = bg ? bg.id : 0;
      }
      var tg = a.lg ? RT.gById.get(a.lg) : null;
      if (tg && !tg.shel) { a.tx = tg.x; a.tz = tg.z; spdE = sp.speed * fxOf(a).speed * 1.35; a.state = 'escaped'; animalMove(a, dt, spdE); return; }
    }
    var arrived = animalMove(a, dt, spdE);
    if (arrived) {
      if (RT.pathTiles.length) {
        var t = RT.pathTiles[Math.floor(rng.next() * RT.pathTiles.length)];
        setTargetTile(a, t);
      }
    }
    a.state = 'escaped';
  }

  function escapeRoll() {
    for (var e = 0; e < S.enclosures.length; e++) {
      var enc = S.enclosures[e]; if (!enc.animals.length) continue;
      if (Z.Realms && enc.kind) { Z.Realms.escapeRoll(enc); continue; }   // realms package: tank/pen/dome/zone rolls
      var eff = enc.breach > 0 ? 0 : enc.minFence;
      for (var k = enc.animals.length - 1; k >= 0; k--) {
        var a = RT.aById.get(enc.animals[k]); if (!a || a.baby) continue;
        var sp = SP[a.species], def = aMinFence(a) - eff;
        if (Z.Moats) {   // moats package: per species, the weakest ditch segment decides; a crossing is a physical leap/wade/swim at that spot
          var mx = Z.Moats.escapeCheck(enc, a);
          if (mx && rng.next() < mx.p * (1.3 - a.happiness / 160) * (a.state === 'sleep' ? 0.3 : 1) * WX.escape) { doEscape(a, enc, mx); continue; }
        }
        if (def <= 0) continue;
        if (Z.Power && Z.Power.ownsEscape(enc)) continue;   // power package: a dead electric fence is tested animal by animal (Power.secondly), not by this roll
        var pd = Math.min(0.9, 0.18 + 0.17 * def) * (1.25 - a.happiness / 150);
        var ph = 1 - Math.pow(1 - pd, 1 / 24);
        if (a.state === 'sleep') ph *= 0.3;
        ph *= WX.escape;
        if (rng.next() < ph) { doEscape(a, enc); }
      }
    }
  }

  // ====================== STAFF ======================
  function staffSpeed(s) { return s.type === 'security' ? 2.7 : s.type === 'cleaner' ? 1.9 : 2.2; }
  function walkRoute(s, dt) {
    var r = s.route;
    if (!r || s.ri >= r.length) { s.speed = 0; return true; }
    var t = r[s.ri], tx = cxOf(t) + s.lo * (((t % N) & 1) ? 1 : -1), tz = czOf(t) + s.lo * 0.5;
    var dx = tx - s.x, dz = tz - s.z, d = Math.sqrt(dx * dx + dz * dz), spd = staffSpeed(s), step = spd * dt;
    s.state = 'walk';
    if (d <= step + 0.01) { s.x = tx; s.z = tz; s.ti = t; s.ri++; s.speed = spd; }
    else { s.x += dx / d * step; s.z += dz / d * step; s.speed = spd; s.heading = turn(s.heading, Math.atan2(dx, dz), dt * 10); }
    return s.ri >= r.length;
  }
  function walkTo(s, x, z, dt, spd) {
    var dx = x - s.x, dz = z - s.z, d = Math.sqrt(dx * dx + dz * dz), step = spd * dt;
    s.state = 'walk';
    if (d <= Math.max(step, 0.25)) { s.speed = 0; return true; }
    s.x += dx / d * step; s.z += dz / d * step; s.speed = spd; s.heading = turn(s.heading, Math.atan2(dx, dz), dt * 10);
    return false;
  }
  var RANGER_BASE_TILES = 32, RANGER_HUT_TILES = 48;
  function objCenter(o) {
    var def = BD[o.type], fp = def && footprint(def, o.i, o.j, o.rot || 0);
    if (!fp) return { x: cxOf(o.i + o.j * N), z: czOf(o.i + o.j * N) };
    return { x: (fp.i0 + fp.w * 0.5) * TILE, z: (fp.j0 + fp.h * 0.5) * TILE };
  }
  function keeperBaseRangeTiles() { return RT.hasHut ? RANGER_HUT_TILES : RANGER_BASE_TILES; }
  function hubDistToEnc(e, hx, hz) {
    var best = Math.hypot(e.cx - hx, e.cz - hz);
    if (e.viewTiles) for (var k = 0; k < e.viewTiles.length; k++) {
      var v = e.viewTiles[k], d = Math.hypot(cxOf(v) - hx, czOf(v) - hz);
      if (d < best) best = d;
    }
    return best;
  }
  function keeperCoversEnc(s, e) {
    var rWorld = keeperBaseRangeTiles() * TILE, hWorld = RANGER_HUT_TILES * TILE;
    if (hubDistToEnc(e, cxOf(s.home), czOf(s.home)) <= rWorld) return true;
    for (var k = 0; k < RT.huts.length; k++) {
      var hc = objCenter(RT.huts[k]);
      if (hubDistToEnc(e, hc.x, hc.z) <= hWorld) return true;
    }
    return false;
  }
  function encNeedsKeeper(e) {
    return e.foodLevel < 0.75 || e.waterLevel < 0.6 || e.poop >= 1 || e.breach > 0;
  }
  function pickKeeperEnc(s, sc0) {
    var best = null, bs = -1e9;
    for (var k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k];
      if (!e.animals.length || !e.viewTiles.length || !encReachesComp(e, sc0)) continue;
      if (claimed('e' + e.id, s) || !encNeedsKeeper(e) || !keeperCoversEnc(s, e)) continue;
      var need = (e.breach > 0 ? 5 : 0) + (e.foodLevel < 0.25 ? 2 : 0) + (1 - e.foodLevel) * 1.4 + (1 - e.waterLevel) * 1.1 + e.poop * 0.35;
      var dx = e.cx - s.x, dz = e.cz - s.z, dist = Math.sqrt(dx * dx + dz * dz);
      var sc = need - dist * 0.01;
      if (!best || sc > bs) { best = e; bs = sc; }
    }
    return best;
  }
  function hasRecaptureTarget(s) {
    for (var k = 0; k < RT.escaped.length; k++) {
      var a = RT.escaped[k];
      if (a.er && a.er.realm !== 'land') continue;
      if (s.type !== 'security' && aDanger(a) >= 2) continue;
      if (a.claim && a.claim !== s.id && RT.sById.has(a.claim)) continue;
      return true;
    }
    return false;
  }
  var VET_CLINIC_TILES = 48;
  function vetNeedsAnimal(a) { return !!(a && a.enc && (a.sick || a.injured || a.health < 55)); }
  function vetNearClinic(a) {
    if (!a) return false;
    var r2 = (VET_CLINIC_TILES * TILE) * (VET_CLINIC_TILES * TILE);
    for (var k = 0; k < RT.vets.length; k++) {
      var c = objCenter(RT.vets[k]), dx = a.x - c.x, dz = a.z - c.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }
  function pickVetAnimal(s, sc0) {
    var best = null, bs = -1e9;
    for (var k = 0; k < S.animals.length; k++) {
      var a = S.animals[k];
      if (!vetNeedsAnimal(a) || (a.claim && a.claim !== s.id && RT.sById.has(a.claim))) continue;
      var e = RT.eMap[a.enc]; if (!e || !e.viewTiles.length || !encReachesComp(e, sc0)) continue;
      var d = Math.hypot(a.x - s.x, a.z - s.z);
      var sc = (a.sick ? 4 : 0) + (a.injured ? 3 : 0) + Math.max(0, 80 - a.health) * 0.05 + (vetNearClinic(a) ? 0.4 : 0) - d * 0.01;
      if (!best || sc > bs) { best = a; bs = sc; }
    }
    return best;
  }
  function hasCleanerWork(sc0) {
    var bins = RT.byType.bin, ad = [];
    for (var k = 0; k < bins.length; k++) {
      if ((bins[k].fill || 0) < 10) continue;
      ad.length = 0; adjacentPathTiles(bins[k], ad);
      for (var q = 0; q < ad.length; q++) if ((!sc0 || RT.comp[ad[q]] === sc0) && !RT.claim['t' + ad[q]]) return true;
    }
    var pt = RT.pathTiles;
    for (k = 0; k < pt.length; k++) {
      var t = pt[k];
      if ((!sc0 || RT.comp[t] === sc0) && S.dirt[t] >= 40 && !RT.claim['t' + t]) return true;
    }
    return false;
  }
  function keeperHasUrgentTask(s) {
    var t = tileOf(s.x, s.z), sc0 = RT.comp[S.path[t] ? t : s.ti];
    if (RT.escaped.length && RT.secCount === 0 && hasRecaptureTarget(s)) return true;
    return !!pickKeeperEnc(s, sc0);
  }
  function rangerCoverage() {
    var baseTiles = keeperBaseRangeTiles();
    var huts = RT.huts.map(function (o) {
      var c = objCenter(o);
      return { id: o.id, i: o.i, j: o.j, x: c.x, z: c.z, radius: RANGER_HUT_TILES };
    });
    var clinics = RT.vets.map(function (o) {
      var c = objCenter(o);
      return { id: o.id, i: o.i, j: o.j, x: c.x, z: c.z, radius: VET_CLINIC_TILES };
    });
    var keepers = S.staff.filter(function (s) { return s.type === 'keeper'; }).map(function (s) {
      var hi = s.home % N, hj = (s.home - hi) / N;
      return { id: s.id, name: s.name, home: s.home, hi: hi, hj: hj, x: cxOf(s.home), z: czOf(s.home), radius: baseTiles };
    });
    function countEncs(hx, hz, radiusTiles, requireAnimals) {
      var n = 0, r = radiusTiles * TILE;
      for (var k = 0; k < S.enclosures.length; k++) {
        var e = S.enclosures[k];
        if (e.viewTiles.length && (!requireAnimals || e.animals.length) && hubDistToEnc(e, hx, hz) <= r) n++;
      }
      return n;
    }
    return {
      baseTiles: baseTiles,
      stationTiles: RANGER_HUT_TILES,
      vetClinicTiles: VET_CLINIC_TILES,
      hasHut: RT.hasHut,
      hasVet: RT.hasVet,
      huts: huts,
      clinics: clinics,
      keepers: keepers,
      enclosuresCoveredByHut: function (objId) {
        var o = RT.oById.get(objId); if (!o) return 0;
        var hc = objCenter(o);
        return countEncs(hc.x, hc.z, RANGER_HUT_TILES, true);
      },
      enclosuresInRadius: function (hx, hz, radiusTiles) {
        return countEncs(hx, hz, radiusTiles, false);
      }
    };
  }

  function staffOnPath(s) {
    var t = tileOf(s.x, s.z);
    if (S.path[t]) { s.ti = t; return true; }
    var i = t % N, j = (t - i) / N, best = -1, bd = 1e9;
    for (var r = 1; r <= 10 && best < 0; r++) for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
      var x = i + di, y = j + dj; if (!Z.inb(x, y) || !S.path[x + y * N]) continue;
      var d = di * di + dj * dj; if (d < bd) { bd = d; best = x + y * N; }
    }
    if (best < 0) {
      var pt = RT.pathTiles;
      for (var p = 0; p < pt.length; p++) {
        var c = pt[p], cx = c % N, cy = (c - cx) / N, dx = cx - i, dy = cy - j, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = c; }
      }
    }
    if (best < 0) return false;
    s.x = cxOf(best); s.z = czOf(best); s.ti = best; s.tk = null; s.route = null;
    return true;
  }

  function startPatrol(s) {
    var pt = RT.pathTiles; if (!pt.length) return false;
    var sc0 = RT.comp[s.ti], pool = sc0 ? pt.filter(function (c) { return RT.comp[c] === sc0; }) : pt;
    if (!pool.length) return false;
    var tgt = pool[Math.floor(rng.next() * pool.length)], hi = s.home % N, hj = (s.home - hi) / N;
    for (var k = 0; k < 6; k++) {
      var c = pool[Math.floor(rng.next() * pool.length)], ci = c % N, cj = (c - ci) / N;
      if (Math.abs(ci - hi) + Math.abs(cj - hj) < 26) { tgt = c; break; }
    }
    var r = findRoute(s.ti, function (t) { return t === tgt; });
    if (!r) return false;
    s.tk = { k: 'patrol', ph: 'go', t: 0, chk: 1 }; s.route = r; s.ri = 0; s.task = s.type === 'guide' ? 'Leading a tour' : s.type === 'security' ? 'On patrol' : (s.type === 'keeper' || s.type === 'vet' || s.type === 'cleaner') ? 'Patrolling (radio ready)' : 'Walking the paths';
    return true;
  }

  function claimed(key, s) { var c = RT.claim[key]; return c && c.by !== s.id && c.until > S.day + S.time && RT.sById.has(c.by); }

  function tryRecapture(s) {
    for (var k = 0; k < RT.escaped.length; k++) {
      var a = RT.escaped[k];
      if (a.er && a.er.realm !== 'land') continue;   // realms package: boats and drone teams handle these
      if (s.type !== 'security' && aDanger(a) >= 2) continue;
      if (a.claim && a.claim !== s.id && RT.sById.has(a.claim)) continue;
      a.claim = s.id;
      s.tk = { k: 'cap', a: a.id, ph: 'go', t: 0, rr: 0 };
      if (!planCapRoute(s, a)) { s.tk = { k: 'cap', a: a.id, ph: 'chase', t: 0, rr: 0 }; s.route = null; }
      s.task = 'Chasing ' + a.name;
      return true;
    }
    return false;
  }
  function planCapRoute(s, a) {
    var r = findRoute(s.ti, function (t) { var dx = cxOf(t) - a.x, dz = czOf(t) - a.z; return dx * dx + dz * dz < 36; });
    if (!r) return false;
    s.route = r; s.ri = 0; return true;
  }

  function encReachesComp(e, c) {
    if (!c) return true;
    for (var k = 0; k < e.viewTiles.length; k++) if (RT.comp[e.viewTiles[k]] === c) return true;
    return false;
  }

  function assignTask(s) {
    if (!staffOnPath(s)) return;
    var k, a, e, sc0 = RT.comp[s.ti];
    if (RT.escaped.length && (s.type === 'security' || (s.type === 'keeper' && RT.secCount === 0))) { if (tryRecapture(s)) return; }
    if (s.type === 'keeper') {
      var best = pickKeeperEnc(s, sc0);
      if (best) {
        var vs = new Set(best.viewTiles), r = findRoute(s.ti, function (t) { return vs.has(t); });
        if (r) {
          RT.claim['e' + best.id] = { by: s.id, until: S.day + S.time + 0.4 };
          s.tk = { k: 'enc', enc: best.id, ph: 'go', t: 0, stage: 0, cleaned: 0, ex: 0, ez: 0, tx: 0, tz: 0 }; s.route = r; s.ri = 0;
          s.task = (best.breach > 0 ? 'Securing ' : 'Caring for ') + best.name; return;
        }
      }
    } else if (s.type === 'vet') {
      var bestA = pickVetAnimal(s, sc0);
      if (bestA) {
        e = RT.eMap[bestA.enc];
        var vs2 = new Set(e.viewTiles), r2 = findRoute(s.ti, function (t) { return vs2.has(t); });
        if (r2) {
          bestA.claim = s.id;
          s.tk = { k: 'vet', a: bestA.id, ph: 'go', t: 0, ex: 0, ez: 0 }; s.route = r2; s.ri = 0;
          s.task = (bestA.sick ? 'Treating ' : 'Checking ') + bestA.name; return;
        }
      }
    } else if (s.type === 'cleaner') {
      var mask = RT.binMask || (RT.binMask = new Uint8Array(NN)); mask.fill(0);
      var bins = RT.byType.bin, ad = [];
      for (k = 0; k < bins.length; k++) if ((bins[k].fill || 0) >= 10) { ad.length = 0; adjacentPathTiles(bins[k], ad); for (var q = 0; q < ad.length; q++) mask[ad[q]] = 1; }
      var rc = findRoute(s.ti, function (t) { return (S.dirt[t] >= 40 || mask[t]) && !RT.claim['t' + t]; });
      if (rc) {
        var tgt = rc.length ? rc[rc.length - 1] : s.ti;
        RT.claim['t' + tgt] = { by: s.id, until: S.day + S.time + 0.1 };
        s.tk = { k: 'clean', ph: 'go', t: 0, tile: tgt }; s.route = rc; s.ri = 0; s.task = 'Sweeping the paths'; return;
      }
    } else if (s.type === 'guide') {
      var cands = [];
      for (k = 0; k < S.enclosures.length; k++) if (S.enclosures[k].animals.length && S.enclosures[k].viewTiles.length && encReachesComp(S.enclosures[k], sc0)) cands.push(S.enclosures[k]);
      if (cands.length) {
        e = cands[Math.floor(rng.next() * cands.length)];
        var vs3 = new Set(e.viewTiles), r3 = findRoute(s.ti, function (t) { return vs3.has(t); });
        if (r3) { s.tk = { k: 'tour', ph: 'go', t: rng.range(8, 14) }; s.route = r3; s.ri = 0; s.task = 'Guiding visitors at ' + e.name; return; }
      }
    }
    if (!startPatrol(s)) { s.tk = null; s.state = 'idle'; s.speed = 0; s.task = 'Waiting for work'; }
  }

  function staffStep(s, dt) {
    if (s.type === 'scientist') { scientistStep(s, dt); return; }
    var tk = s.tk, a, enc, E;
    if (s.sickUntil > S.day + S.time) { if (s.tk || s.route || s.task !== 'Off sick') releaseClaims(s); s.tk = null; s.route = null; s.speed = 0; s.state = 'idle'; s.task = 'Off sick'; return; }
    if (tk && s.type === 'security' && RT.escaped.length && (tk.k === 'patrol' || tk.k === 'tour')) { s.tk = null; tk = null; s.wt = 0; }
    if (tk && tk.k === 'patrol' && (s.type === 'keeper' || s.type === 'vet' || s.type === 'cleaner')) {
      tk.chk = (tk.chk === undefined ? 1 : tk.chk) - dt;
      if (tk.chk <= 0) {
        tk.chk = s.type === 'cleaner' ? 1.5 : 1.0;
        var st0 = tileOf(s.x, s.z), scP = RT.comp[S.path[st0] ? st0 : s.ti];
        var urgent = s.type === 'keeper' ? keeperHasUrgentTask(s)
          : s.type === 'vet' ? !!pickVetAnimal(s, scP)
          : hasCleanerWork(scP);
        if (urgent) { s.tk = null; tk = null; s.route = null; s.wt = 0; }
      }
    }
    if (!tk) {
      s.speed = 0; if (s.state !== 'idle') s.state = 'idle';
      s.wt -= dt;
      if (s.wt <= 0) { s.wt = 0.8 + rng.next(); assignTask(s); }
      return;
    }
    switch (tk.k) {
      case 'patrol':
        if (tk.ph === 'go') { if (walkRoute(s, dt)) { tk.ph = 'wait'; tk.t = rng.range(1, 5); } }
        else { s.state = 'idle'; s.speed = 0; tk.t -= dt; if (tk.t <= 0) { s.tk = null; s.wt = 0; } }
        break;
      case 'tour':
        if (tk.ph === 'go') { if (walkRoute(s, dt)) tk.ph = 'wait'; }
        else { s.state = 'work'; s.speed = 0; tk.t -= dt; if (tk.t <= 0) { s.tk = null; s.wt = 0; } }
        break;
      case 'clean':
        if (tk.ph === 'go') { if (walkRoute(s, dt)) { tk.ph = 'work'; tk.t = 1.6; } }
        else {
          s.state = 'work'; s.speed = 0; tk.t -= dt;
          if (tk.t <= 0) {
            var t = s.ti; S.dirt[t] = 0;
            var m = RT.nb[t];
            for (var d = 0; d < 4; d++) if (m & (1 << d)) { var n = t + DT4[d]; S.dirt[n] = S.dirt[n] >> 2; }
            var bins = RT.byType.bin;
            for (var b = 0; b < bins.length; b++) {
              var bo = bins[b]; if (!bo.fill) continue;
              if (Math.abs(bo.i - (t % N)) + Math.abs(bo.j - Math.floor(t / N)) === 1) { bo.fill = 0; delete RT.fields.bin; }
            }
            delete RT.claim['t' + tk.tile]; s.tk = null; s.wt = 0;
          }
        }
        break;
      case 'enc':
        enc = RT.eMap[tk.enc]; E = enc && RT.encx[tk.enc];
        if (!enc || !E) { delete RT.claim['e' + tk.enc]; s.tk = null; break; }
        RT.claim['e' + enc.id] = { by: s.id, until: S.day + S.time + 0.4 };
        if (tk.ph === 'go') {
          if (walkRoute(s, dt)) {
            tk.ph = 'in'; tk.ex = s.x; tk.ez = s.z;
            var ft = E.feed; tk.tx = cxOf(ft); tk.tz = czOf(ft);
          }
        } else if (tk.ph === 'in') {
          if (walkTo(s, tk.tx, tk.tz, dt, 2.0)) { tk.ph = 'work'; tk.t = 3; tk.stage = 0; }
        } else if (tk.ph === 'work') {
          s.state = 'work'; s.speed = 0; tk.t -= dt;
          if (tk.t <= 0) {
            if (tk.stage === 0) {
              var hadBreach = enc.breach > 0;
              enc.foodLevel = 1; enc.waterLevel = 1;
              if (hadBreach) { enc.breach = 0; msg(s.name + ' secured the damaged fence at ' + enc.name + '.', 'good', false); }
              encStats(enc);
              tk.stage = 1; tk.t = 1.0; if (enc.poop <= 0) tk.ph = 'out';
            }
            else {
              enc.poop = Math.max(0, enc.poop - 1); tk.cleaned++; encStats(enc);
              if (enc.poop <= 0) tk.ph = 'out'; else tk.t = 1.0;
            }
          }
        } else if (walkTo(s, tk.ex, tk.ez, dt, 2.0)) { delete RT.claim['e' + enc.id]; s.tk = null; s.wt = 0.3; }
        break;
      case 'vet':
        a = RT.aById.get(tk.a);
        if (tk.ph !== 'out' && (!a || (!a.sick && !a.injured && a.health >= 65))) { if (a && a.claim === s.id) a.claim = 0; s.tk = null; break; }
        if (tk.ph === 'go') { if (walkRoute(s, dt)) { tk.ph = 'in'; tk.ex = s.x; tk.ez = s.z; } }
        else if (tk.ph === 'in') { if (walkTo(s, a.x, a.z, dt, 2.2)) { tk.ph = 'work'; tk.t = RT.hasVet ? (vetNearClinic(a) ? 1.8 : 2.5) : 4; } }
        else if (tk.ph === 'work') {
          s.state = 'work'; s.speed = 0; tk.t -= dt;
          if (tk.t <= 0) {
            var clinicBoost = RT.hasVet ? (vetNearClinic(a) ? 100 : 70) : 45;
            a.sick = false; a.injured = false; a.health = Math.min(100, a.health + clinicBoost); a.claim = 0; tk.ph = 'out';
            msg(s.name + ' treated ' + a.name + ' the ' + SP[a.species].name.toLowerCase() + '. It is on the mend.', 'good', false);
          }
        } else if (walkTo(s, tk.ex, tk.ez, dt, 2.2)) { s.tk = null; s.wt = 0.3; }
        break;
      case 'cap':
        a = RT.aById.get(tk.a);
        if (!a || a.state !== 'escaped') { if (a && a.claim === s.id) { a.claim = 0; a.held = 0; } s.tk = null; break; }
        if (tk.ph === 'go') {
          if (s.route && walkRoute(s, dt)) tk.ph = 'chase';
          else if (!s.route) tk.ph = 'chase';
          tk.rr -= dt; if (tk.rr <= 0 && tk.ph === 'go') { tk.rr = 4; var dx = s.x - a.x, dz = s.z - a.z; if (dx * dx + dz * dz > 100) planCapRoute(s, a); }
        } else if (tk.ph === 'chase') {
          if (walkTo(s, a.x, a.z, dt, staffSpeed(s) * 1.1)) { tk.ph = 'work'; tk.t = s.type === 'security' ? 2 : 3.5; a.held = 1; }
        } else {
          s.state = 'work'; s.speed = 0; tk.t -= dt;
          if (tk.t <= 0) { a.held = 0; var who = s.type === 'security' ? 'Security' : s.name + ' the ranger'; s.tk = null; s.wt = 0.5; recapture(a, who); }
        }
        break;
      default: s.tk = null;
    }
    if (!s.tk) { s.speed = 0; }
  }

  // ====================== RATING / GOALS / DAY ======================
  function computeRating() {
    var k, nSp = 0, seen = {}, A = 0, hs = 0, n = S.animals.length;
    for (k = 0; k < n; k++) {
      var a = S.animals[k], sp = SP[a.species];
      if (!seen[a.species]) { seen[a.species] = 1; nSp++; }
      A += aAppeal(a) * (a.happiness > 40 ? 1 : 0.5); hs += a.happiness;
    }
    var animalsC = n ? 0.55 * Math.min(1, nSp / 9) + 0.45 * Math.min(1, A / 700) : 0;
    var welfare = n ? clamp((hs / n - 40) / 50, 0, 1) : 0;
    var gNow = S.guests.length > 5 ? (S.guestHappiness || 65) : RT.ghEMA;
    var guests = clamp(((gNow * 0.5 + RT.ghEMA * 0.5) - 40) / 50, 0, 1);
    var ref = Math.max(20, S.stats.peakGuests || 0), bt = RT.byType;
    var fac = (Math.min(1, bt.food.length / Math.ceil(ref / 40)) + Math.min(1, bt.drink.length / Math.ceil(ref / 50)) + Math.min(1, bt.toilet.length / Math.ceil(ref / 40)) +
      Math.min(1, bt.bench.length / Math.ceil(ref / 30)) + Math.min(1, bt.bin.length / Math.ceil(ref / 25)) + Math.min(1, (bt.fun.length + (Z.Monorail ? Z.Monorail.funCount() : 0)) / (1 + Math.floor(ref / 80)))) / 6;   // monorail package: a working line counts as a ride
    var pathN = RT.pathTiles.length, dirtyFrac = RT.dirtyCount / Math.max(8, pathN * 0.3);
    var cleanP = 1 - Math.min(1, dirtyFrac), cleanE = 1, ce = 0;
    for (k = 0; k < S.enclosures.length; k++) { var e = S.enclosures[k]; if (e.animals.length) { cleanE += 0; ce += clamp(1 - e.poop / (e.area / 3 + 3), 0, 1); } }
    var nEncA = 0; for (k = 0; k < S.enclosures.length; k++) if (S.enclosures[k].animals.length) nEncA++;
    var clean = nEncA ? 0.5 * cleanP + 0.5 * ce / nEncA : cleanP;
    var aes = (Z.Moats ? Z.Moats.aesthetic() : 0) + (Z.Power ? Z.Power.aesthetic() : 0); for (k = 0; k < S.objects.length; k++) { var o = S.objects[k]; if (o.kind === 'scenery') aes += SC[o.type].aesthetic; }
    var scenery = Math.min(1, aes / 120);
    var stars = 5 * (0.42 * animalsC + 0.13 * welfare + 0.13 * guests + 0.12 * fac + 0.08 * clean + 0.10 * scenery);
    stars -= 0.6 * (S.panic || 0);
    return { animals: animalsC, welfare: welfare, guests: guests, facilities: fac, cleanliness: clean, scenery: scenery, panic: S.panic || 0, stars: clamp(stars, 0, 5), rating: S.rating };
  }
  function ratingBreakdown() { return computeRating(); }

  function isUnlocked(kind, id) {
    var def = null;
    if (kind === 'animal' || kind === 'animals') return !!SP[id] && genomeOf(id) >= RC.unlockGenome;
    else if (kind === 'building' || kind === 'buildings') def = BD[id];
    else if (kind === 'scenery') def = SC[id];
    else if (kind === 'staff') def = STF[id];
    else if (kind === 'site' || kind === 'sites') def = SITE[id];
    else if (kind === 'equipment') {
      var parts = String(id).split(':'), eq = EQ[parts[0]], lv = parts[1] ? +parts[1] : 1;
      if (!eq || !eq.levels[lv - 1]) return false;
      return (eq.levels[lv - 1].star || 0) <= S.unlocked.star;
    }
    else if (kind === 'terrain' || kind === 'fence' || kind === 'path') return true;
    if (!def) return false;
    return (def.star || 0) <= S.unlocked.star;
  }

  function checkUnlocks() {
    var now = Math.floor(S.rating + 0.0001);
    if (now > S.unlocked.star) {
      var old = S.unlocked.star; S.unlocked.star = now;
      var names = [];
      D.buildings.forEach(function (a) { if (a.star > old && a.star <= now) names.push(a.name); });
      (D.sites || []).forEach(function (a) { if (a.star > old && a.star <= now) names.push('the ' + a.name + ' dig site'); });
      (D.equipment || []).forEach(function (e) { e.levels.forEach(function (l, k) { if (l.star > old && l.star <= now) names.push(e.name + ' ' + roman(k + 1)); }); });
      msg('Your park is now rated ' + now + ' star' + (now > 1 ? 's' : '') + '!' + (names.length ? ' New unlocks: ' + names.join(', ') + '.' : ''), 'good');
      bus.emit('research');
    }
  }

  function goalDone(gl) {
    var R = S.research, k;
    switch (gl.type) {
      case 'guests': return S.stats.guestsTotal >= gl.target;
      case 'animals': return S.animals.length >= gl.target;
      case 'rating': return S.rating >= gl.target;
      case 'realm': return !!Z.Realms && Z.Realms.goalMet(gl);   // realms package
      case 'money': return S.money >= gl.target;
      case 'species': { var s = {}, c = 0; for (k = 0; k < S.animals.length; k++) if (!s[S.animals[k].species]) { s[S.animals[k].species] = 1; c++; } return c >= gl.target; }
      case 'babies': return S.stats.babiesBorn >= gl.target;
      case 'happiness': return S.guests.length >= 10 && (S.guestHappiness || 0) >= gl.target;
      case 'star': return S.unlocked.star >= gl.target;
      case 'extractions': return R.stats.successes >= gl.target;
      case 'experiments': return R.stats.experiments >= gl.target;
      case 'hatched': return R.stats.hatched >= gl.target;
      case 'predators': {
        var pc = 0;
        for (k = 0; k < S.animals.length; k++) {
          var a = S.animals[k], sp = SP[a.species]; if (!sp.predator || !a.enc || a.state === 'escaped') continue;
          var e = RT.eMap[a.enc]; if (e && e.minFence >= aMinFence(a) && (!Z.Moats || Z.Moats.holds(e, a))) pc++;
        }
        return pc >= gl.target;
      }
      case 'genome100': { var n = 0; for (var id in R.genomes) if (R.genomes[id] >= 99.95) n++; return n >= gl.target; }
      case 'genome': { var mx = 0; for (var id2 in R.genomes) mx = Math.max(mx, R.genomes[id2]); return mx >= gl.target; }
      case 'unlocked': { var u = 0; for (var id3 in R.genomes) if (R.genomes[id3] >= RC.unlockGenome) u++; return u >= gl.target; }
      case 'traits': { var tt = 0; for (var id4 in R.traits) tt += R.traits[id4].length; return tt >= gl.target; }
      case 'sequenced': return (R.stats.seqDone || 0) >= gl.target;
      case 'puzzles': return (R.stats.puzzles || 0) >= gl.target;
      case 'genes': return (R.stats.genes || 0) >= gl.target;
      case 'hybrids': return (R.hybrids ? R.hybrids.length : 0) >= gl.target;
      case 'moat': return !!(Z.Moats && Z.Moats.goalMet());
      case 'safari': return !!Z.Safari && Z.Safari.goalMet(gl);   // safari package
      case 'monoRiders': return S.mono.stats.riders >= gl.target;   // monorail package
      case 'powerBackup': return !!Z.Power && Z.Power.hasBackup();   // power package
      case 'monoEnclosures': return !!Z.Monorail && Z.Monorail.mostOverlooked() >= gl.target;
    }
    return false;
  }
  function checkGoals() {
    for (var k = 0; k < D.goals.length; k++) {
      var gl = D.goals[k];
      if (S.goals[gl.id]) continue;
      if (goalDone(gl)) {
        S.goals[gl.id] = true;
        earn(gl.reward, 'other');
        msg('Goal complete: ' + gl.text + '. Reward ' + fmt(gl.reward) + '!', 'good');
        bus.emit('goal', gl);
      }
    }
  }

  // ====================== COST SCALING ======================
  // Days are now 2.8x longer, so a day holds far more guest-hours while upkeep and wages are still charged once a day. To keep profit per game day
  // tight (not trivially positive) the daily running costs in the data are scaled once, in place, at load time, so every UI that reads
  // D.animals[].upkeep, D.buildings[].upkeep and D.staff[].wage shows the real figure.
  var UPKEEP_SCALE = 1.5, WAGE_SCALE = 1.5;
  (function scaleRunningCosts() {
    if (D._costScaled) return; D._costScaled = true;
    D.animals.forEach(function (a) { a.upkeep = Math.round(a.upkeep * UPKEEP_SCALE); if (a['upkeep/day'] !== undefined) a['upkeep/day'] = a.upkeep; });
    D.buildings.forEach(function (b) { if (b.upkeep) b.upkeep = Math.round(b.upkeep * UPKEEP_SCALE); });
    D.staff.forEach(function (st) { st.wage = Math.round(st.wage * WAGE_SCALE); if (st['wage/day'] !== undefined) st['wage/day'] = st.wage; });
  })();

  // ====================== DIFFICULTY ======================
  var DEBT_LIMIT = -5000, DEBT_GRACE = 0.12;   // the bank calls in debts below -5000, after a grace period of 0.12 days (about 50 s at 1x)
  var EV = { amber: 1 };                        // multipliers from active events that are not part of WX
  function difficultyDef(id) { for (var k = 0; k < D.difficulties.length; k++) if (D.difficulties[k].id === id) return D.difficulties[k]; return null; }
  // Sets S.difficulty and fills DIFF. With a truthy `fresh` (new game only) also sets the starting money.
  function applyDifficulty(id, fresh) {
    var def = difficultyDef(id || (S && S.difficulty) || 'normal') || difficultyDef('normal');
    S.difficulty = def.id; DIFF.id = def.id; DIFF.income = def.income; DIFF.costs = def.costs; DIFF.arrivals = def.arrivals; DIFF.interest = def.interest; DIFF.money = def.money;
    if (fresh) S.money = def.money;
    return def;
  }

  // ====================== WEATHER ======================
  // Full-strength multipliers; each is scaled by the weather's intensity (1 + (v - 1) * intensity; fun and animalMood are additive: v * intensity).
  var WXT = {
    clear:    { arrivals: 1,    thirst: 1,   hunger: 1,   energy: 1,   guestSpeed: 1,    fun: 0.03,  spend: 1,    shelter: false, animalMood: 1,    sick: 1,   escape: 1,    dirt: 1,   dur: [7, 14],  notable: false },
    cloudy:   { arrivals: 1,    thirst: 1,   hunger: 1,   energy: 1,   guestSpeed: 1,    fun: 0,     spend: 1,    shelter: false, animalMood: 0,    sick: 1,   escape: 1,    dirt: 1,   dur: [4, 9],   notable: false },
    rain:     { arrivals: 0.55, thirst: 0.9, hunger: 1.05, energy: 1,  guestSpeed: 0.9,  fun: -0.05, spend: 1.1,  shelter: true,  animalMood: -1.5, sick: 1.1, escape: 1.1,  dirt: 1.6, dur: [3, 7],   notable: true },
    storm:    { arrivals: 0.25, thirst: 0.9, hunger: 1,   energy: 1.1, guestSpeed: 0.85, fun: -0.15, spend: 0.85, shelter: true,  animalMood: -6,   sick: 1.15, escape: 1.8, dirt: 2,   dur: [2, 4],   notable: true },
    heatwave: { arrivals: 1,    thirst: 1.8, hunger: 0.9, energy: 1.3, guestSpeed: 0.95, fun: -0.04, spend: 1.15, shelter: false, animalMood: -3,   sick: 1.3, escape: 1,    dirt: 1.1, dur: [6, 12],  notable: true },
    fog:      { arrivals: 0.85, thirst: 1,   hunger: 1,   energy: 1,   guestSpeed: 0.95, fun: -0.03, spend: 1,    shelter: false, animalMood: 0,    sick: 1,   escape: 1.15, dirt: 1,   dur: [3, 6],   notable: true }
  };
  var WX_TRANS = {
    clear: [['cloudy', 0.65], ['heatwave', 0.18], ['fog', 0.17]],
    cloudy: [['clear', 0.3], ['rain', 0.42], ['fog', 0.08], ['storm', 0.08], ['heatwave', 0.12]],
    rain: [['cloudy', 0.5], ['storm', 0.2], ['clear', 0.2], ['fog', 0.1]],
    storm: [['rain', 0.45], ['cloudy', 0.45], ['clear', 0.1]],
    heatwave: [['clear', 0.45], ['cloudy', 0.35], ['storm', 0.2]],
    fog: [['clear', 0.5], ['cloudy', 0.4], ['rain', 0.1]]
  };
  function wxDef(type) { for (var k = 0; k < D.weather.length; k++) if (D.weather[k].id === type) return D.weather[k]; return D.weather[0]; }
  function wxPick(type) {
    var list = WX_TRANS[type] || WX_TRANS.clear, r = rng.next(), acc = 0;
    for (var k = 0; k < list.length; k++) { acc += list[k][1]; if (r < acc) return list[k][0]; }
    return list[list.length - 1][0];
  }
  function wxIntensity(type) { return Math.round((WXT[type].notable ? rng.range(0.7, 1) : rng.range(0.5, 1)) * 100) / 100; }
  function wxHours(type) { return Math.round(rng.range(WXT[type].dur[0], WXT[type].dur[1]) * 2) / 2; }
  function wxScale(v, i, add) { return add ? v * i : 1 + (v - 1) * i; }
  // writes the weather (and active-event) multipliers into WX. Called on every weather/event change and on load.
  function recomputeWX() {
    var w = S.weather, t = WXT[w.type] || WXT.cloudy, i = w.intensity === undefined ? 1 : w.intensity, k, f, ea = 1, es = 1, am = 1;
    WX.type = w.type; WX.intensity = i;
    WX.arrivals = wxScale(t.arrivals, i); WX.thirst = wxScale(t.thirst, i); WX.hunger = wxScale(t.hunger, i); WX.energy = wxScale(t.energy, i); WX.guestSpeed = wxScale(t.guestSpeed, i);
    WX.fun = wxScale(t.fun, i, true); WX.spend = wxScale(t.spend, i); WX.shelter = !!t.shelter && i >= 0.4; WX.animalMood = wxScale(t.animalMood, i, true);
    WX.sick = wxScale(t.sick, i); WX.escape = wxScale(t.escape, i); WX.dirt = wxScale(t.dirt, i);
    var ae = S.activeEvents || [];
    for (k = 0; k < ae.length; k++) { f = ae[k].fx || {}; if (f.arrivals) ea *= f.arrivals; if (f.sick) es *= f.sick; if (f.amber) am *= f.amber; }
    WX.arrivals *= ea; WX.sick *= es; EV.amber = am;
  }
  function pctTxt(v) { return Math.round(Math.abs(v - 1) * 100) + '%'; }
  function wxEffectText(type, i) {
    var t = WXT[type], out = [], v;
    v = wxScale(t.arrivals, i); if (v < 0.97) out.push('about ' + pctTxt(v) + ' fewer guests arrive'); else if (v > 1.03) out.push('about ' + pctTxt(v) + ' more guests arrive');
    v = wxScale(t.thirst, i); if (v > 1.03) out.push('guests will be about ' + pctTxt(v) + ' thirstier');
    v = wxScale(t.energy, i); if (v > 1.15) out.push('they tire ' + pctTxt(v) + ' faster');
    if (t.shelter) out.push('they look for shelter');
    v = wxScale(t.spend, i); if (v > 1.05) out.push('food and shop spending is up about ' + pctTxt(v)); else if (v < 0.95) out.push('spending is down about ' + pctTxt(v));
    v = wxScale(t.dirt, i); if (v > 1.15) out.push('paths get ' + pctTxt(v) + ' dirtier');
    v = wxScale(t.sick, i); if (v > 1.12) out.push('illness is ' + pctTxt(v) + ' more likely');
    v = wxScale(t.escape, i); if (v > 1.12) out.push('escape risk is ' + pctTxt(v) + ' higher');
    if (t.animalMood * i < -2) out.push('the dinosaurs are stressed');
    if (t.fun * i < -0.01) out.push('guests enjoy the park less'); else if (t.fun * i > 0.01) out.push('guests are a little happier');
    if (type === 'heatwave') out.push('dinosaurs without water suffer');
    if (!out.length) return '';
    var last = out.pop(), txt = out.length ? out.join(', ') + ' and ' + last : last;
    return txt.charAt(0).toUpperCase() + txt.slice(1) + '.';
  }
  function wxHoursTxt(h) { return h >= 1.5 ? 'about ' + Math.round(h) + ' hours' : 'about an hour'; }
  function setWeather(type, intensity, hours, cause) {
    var w = S.weather, old = w.type, def = wxDef(type), t = WXT[type];
    if (old === type) { w.hoursLeft = Math.max(w.hoursLeft, hours); w.intensity = Math.max(w.intensity, intensity); recomputeWX(); bus.emit('weather', w); return; }
    w.type = type; w.intensity = intensity; w.hoursLeft = hours; w.next = wxPick(type);
    if (w.next === type) w.next = 'cloudy';
    recomputeWX();
    if (t.notable) msg((cause ? cause + ' ' : '') + def.name + ' for ' + wxHoursTxt(hours) + '. ' + wxEffectText(type, intensity), type === 'fog' ? 'info' : 'bad');
    else if (WXT[old] && WXT[old].notable) msg('The ' + wxDef(old).name.toLowerCase() + ' has passed. ' + (type === 'clear' ? 'Clear skies again.' : 'It is ' + def.name.toLowerCase() + ' now.'), 'good', false);
    bus.emit('weather', w);
  }
  function advanceWeather() { var w = S.weather, nt = w.next && WXT[w.next] ? w.next : wxPick(w.type); setWeather(nt, wxIntensity(nt), wxHours(nt)); }
  function weatherInfo() {
    var w = S.weather, def = wxDef(w.type), nd = wxDef(w.next || 'cloudy'), nw = WXT[w.next] && WXT[w.next].notable;
    var fc = w.hoursLeft < 0.5 ? nd.name + ' arriving now.' : (nw ? nd.name + ' expected in ' + wxHoursTxt(w.hoursLeft) + '.' : def.name + ' for ' + wxHoursTxt(w.hoursLeft) + ', then ' + nd.name.toLowerCase() + '.');
    return { type: w.type, name: def.name, emoji: def.emoji, effects: WXT[w.type].notable ? wxEffectText(w.type, w.intensity) : def.effects, blurb: def.blurb, intensity: w.intensity, hoursLeft: Math.round(w.hoursLeft * 10) / 10,
      next: w.next, nextName: nd.name, nextEmoji: nd.emoji, forecast: fc };
  }
  function hourlyWeather() {
    var w = S.weather;
    if (w.type === 'storm' && rng.chance(0.12 * w.intensity)) {
      var cand = S.enclosures.filter(function (e) { return e.animals.length && !(e.breach > 0) && !(Z.Moats && Z.Moats.fenceless(e)) && !(Z.Realms && Z.Realms.noBreach(e)); });
      if (cand.length) { var e = rng.pick(cand); e.breach = 1; msg('Lightning has brought down a fence panel at ' + e.name + '. It is open to the elements until repaired, so the dinosaurs could slip out!', 'bad'); }
    }
  }

  // ====================== EVENTS ======================
  function addActive(ev, kind, text, hours, fx, extra) {
    var rec = { id: ev.id, name: ev.name, emoji: ev.emoji, text: text, until: hours === 'day' ? S.day + 1 : S.day + S.time + hours / 24, kind: kind, fx: fx || {} };
    if (extra) for (var k in extra) rec[k] = extra[k];
    S.activeEvents.push(rec); recomputeWX(); bus.emit('events', S.activeEvents);
    return rec;
  }
  function endEvent(ev) {
    var k;
    if (ev.kind === 'amber') {
      for (k = 0; k < S.research.market.length; k++) S.research.market[k].price = Math.round(S.research.market[k].price / ev.fx.amber / 10) * 10;
      bus.emit('market'); bus.emit('research');
      msg('Amber prices have returned to normal.', 'info', false);
    } else if (ev.kind === 'staff') {
      var s = RT.sById.get(ev.staffId); if (s) { s.sickUntil = 0; msg(s.name + ' is back at work.', 'good', false); }
    } else if (ev.kind === 'powerCut') { /* the lab announces its own restart */ }
    else msg(ev.name + ' is over.', 'info', false);
  }
  function expireEvents() {
    var now = S.day + S.time, list = S.activeEvents, changed = false;
    for (var k = list.length - 1; k >= 0; k--) if (list[k].until <= now) { var ev = list.splice(k, 1)[0]; endEvent(ev); changed = true; }
    if (changed) { recomputeWX(); bus.emit('events', list); }
  }
  function evActive(id) { for (var k = 0; k < S.activeEvents.length; k++) if (S.activeEvents[k].id === id) return true; return false; }
  function ilStaff() { return S.staff.filter(function (s) { return s.type !== 'scientist' && !(s.sickUntil > S.day + S.time); }); }
  function eventOk(ev) {
    var eff = ev.effect || {}, hasA = S.animals.length > 0;
    if (evActive(ev.id)) return false;
    switch (eff.type) {
      case 'weather': return S.weather.type !== eff.weather && (!eff.breach || S.enclosures.some(function (e) { return e.animals.length && !(Z.Moats && Z.Moats.fenceless(e)) && !(Z.Realms && Z.Realms.noBreach(e)); }));
      case 'celebrity': case 'schoolTrip': case 'viral': case 'inspection': return hasA && S.open;
      case 'donation': return S.rating >= 0.5;
      case 'binFire': return RT.pathTiles.length > 0;
      case 'vaccine': return hasA;
      case 'amber': return !evActive('amber_boom') && !evActive('amber_slump') && S.research.market.length > 0;
      case 'staffIllness': return ilStaff().length > 0;
      case 'powerCut': return S.day > 7 && RT.labs.length > 0 && S.research.labOffline <= 0 && !(Z.Power && Z.Power.outageActive());
    }
    return true;
  }
  function pickEvent() {
    var pool = [], tot = 0, k;
    for (k = 0; k < D.events.length; k++) if (eventOk(D.events[k])) { pool.push(D.events[k]); tot += D.events[k].weight || 1; }
    if (!pool.length) return null;
    var r = rng.next() * tot, acc = 0;
    for (k = 0; k < pool.length; k++) { acc += pool[k].weight || 1; if (r < acc) return pool[k]; }
    return pool[pool.length - 1];
  }
  function fireEvent(forceId) {
    var ev = null, k;
    if (forceId) { for (k = 0; k < D.events.length; k++) if (D.events[k].id === forceId) ev = D.events[k]; } else ev = pickEvent();
    if (!ev) return null;
    var eff = ev.effect || {}, text = ev.text, kind = 'info', hrs = eff.hours;
    switch (eff.type) {
      case 'weather': {
        var wt = eff.weather, inten = Math.round(rng.range(0.85, 1) * 100) / 100, wh = wt === 'heatwave' ? rng.range(9, 13) : wt === 'storm' ? rng.range(3, 4.5) : rng.range(4, 6.5);
        wh = Math.round(wh * 2) / 2;
        var e1 = null;
        if (eff.breach) { var cand = S.enclosures.filter(function (e) { return e.animals.length && !(Z.Moats && Z.Moats.fenceless(e)) && !(Z.Realms && Z.Realms.noBreach(e)); }); if (cand.length) { e1 = rng.pick(cand); e1.breach = 1; } }
        if (S.weather.type === wt) { setWeather(wt, inten, wh); }
        else setWeather(wt, inten, wh, text);
        if (e1) msg('A fence panel at ' + e1.name + ' has been knocked down. Its dinosaurs could slip out until the repair crew finishes at midnight.', 'bad');
        return ev;
      }
      case 'celebrity':
        S.reputation = Math.min(100, S.reputation + eff.reputation);
        addActive(ev, 'celebrity', 'Arrivals about ' + Math.round((eff.arrivals - 1) * 100) + '% higher for the rest of the day.', 'day', { arrivals: eff.arrivals });
        text += ' Arrivals will be about ' + Math.round((eff.arrivals - 1) * 100) + '% higher for the rest of the day and your reputation rises by ' + eff.reputation + '.'; kind = 'good'; break;
      case 'schoolTrip': {
        RT.pendingSpawn += eff.guests;
        text += ' ' + eff.guests + ' extra guests are on their way through the gate, worth about ' + fmt(eff.guests * S.ticketPrice * DIFF.income) + ' in tickets.'; kind = 'good'; break;
      }
      case 'donation': {
        var amt = Math.round((eff.base + eff.perStar * Math.round(S.rating)) / 50) * 50;
        earn(amt, 'donations'); text += ' It contains ' + fmt(amt * DIFF.income) + '.'; kind = 'money'; break;
      }
      case 'binFire': {
        var bins = RT.byType.bin, bo = bins.length ? rng.pick(bins) : null, cx, cz, n = 0, g;
        if (bo) { cx = bo.i; cz = bo.j; bo.fill = 0; delete RT.fields.bin; } else { var rt0 = rng.pick(RT.pathTiles); cx = rt0 % N; cz = Math.floor(rt0 / N); }
        for (k = 0; k < RT.pathTiles.length; k++) {
          var pt = RT.pathTiles[k], dx = (pt % N) - cx, dz = Math.floor(pt / N) - cz;
          if (dx * dx + dz * dz <= eff.radius * eff.radius) { S.dirt[pt] = Math.min(255, S.dirt[pt] + eff.dirt); n++; }
        }
        var upset = 0; for (k = 0; k < S.guests.length; k++) { g = S.guests[k]; var gx = g.x / TILE - cx, gz = g.z / TILE - cz; if (gx * gx + gz * gz < 64) { g.happiness = Math.max(0, g.happiness - 8); upset++; } }
        text += ' ' + n + ' path tiles are filthy and need sweeping' + (upset ? ', and ' + upset + ' nearby guests are put out' : '') + '. Cleaners can fix it.'; kind = 'bad'; break;
      }
      case 'vaccine': {
        var cured = 0;
        for (k = 0; k < S.animals.length; k++) { var a = S.animals[k]; if (a.sick) { a.sick = false; cured++; } a.health = Math.min(100, a.health + eff.health); }
        addActive(ev, 'vaccine', 'Illness half as likely for two days.', eff.hours, { sick: eff.sick });
        text += ' Every dinosaur gains +' + eff.health + ' health' + (cured ? ', ' + cured + ' sick dinosaur' + (cured > 1 ? 's are' : ' is') + ' cured' : '') + ' and illness is ' + Math.round((1 - eff.sick) * 100) + '% less likely for two days.'; kind = 'good'; break;
      }
      case 'inspection': {
        var rb = computeRating(), bt = RT.byType, pass = rb.cleanliness >= 0.6 && bt.toilet.length > 0 && bt.bin.length > 0 && RT.dirtyCount <= Math.max(4, RT.pathTiles.length * 0.12);
        if (pass) { earn(eff.reward, 'other'); S.reputation = Math.min(100, S.reputation + 4); text += ' The park passes with flying colours: a ' + fmt(eff.reward) + ' community award and +4 reputation.'; kind = 'good'; }
        else { spend(eff.fine, 'other'); S.reputation = Math.max(0, S.reputation - 4); text += ' The park is fined ' + fmt(eff.fine) + ' and loses 4 reputation: ' + (!bt.toilet.length ? 'there are no toilets' : !bt.bin.length ? 'there are no bins' : 'the paths are too dirty') + '.'; kind = 'bad'; }
        break;
      }
      case 'viral':
        S.reputation = Math.min(100, S.reputation + eff.reputation);
        addActive(ev, 'viral', 'Arrivals about ' + Math.round((eff.arrivals - 1) * 100) + '% higher for two days.', eff.hours, { arrivals: eff.arrivals });
        text += ' Arrivals will be about ' + Math.round((eff.arrivals - 1) * 100) + '% higher for the next two days and reputation rises by ' + eff.reputation + '.'; kind = 'good'; break;
      case 'amber': {
        var R = S.research;
        for (k = 0; k < R.market.length; k++) R.market[k].price = Math.round(R.market[k].price * eff.mult / 10) * 10;
        addActive(ev, 'amber', 'Amber prices ' + (eff.mult > 1 ? '+' : '-') + Math.round(Math.abs(eff.mult - 1) * 100) + '% for three days.', eff.hours, { amber: eff.mult });
        text += ' Amber on the market is now ' + Math.round(Math.abs(eff.mult - 1) * 100) + '% ' + (eff.mult > 1 ? 'dearer' : 'cheaper') + ' for the next three days.'; kind = eff.mult > 1 ? 'bad' : 'good';
        bus.emit('market'); bus.emit('research'); break;
      }
      case 'staffIllness': {
        var st = rng.pick(ilStaff()), role = STF[st.type] ? STF[st.type].name.toLowerCase() : 'staff member';
        st.sickUntil = S.day + S.time + eff.hours / 24; st.tk = null; st.route = null; st.state = 'idle'; st.speed = 0; st.task = 'Off sick'; releaseClaims(st); 
        addActive(ev, 'staff', st.name + ' (' + role + ') is off sick for a day.', eff.hours, {}, { staffId: st.id });
        text = st.name + ', one of your ' + role + 's, has gone home with a stomach bug and is off sick for about a day. Their duties will go undone.'; kind = 'bad'; break;
      }
      case 'powerCut': {
        if (Z.Power) { Z.Power.eventCut(eff.hours); text += ' Everything on the island is on the cable: fences, pumps, lab and lights. A backup generator and batteries keep the essentials running.'; kind = 'bad'; break; }   // power package: a real grid outage
        var R2 = S.research; R2.labOffline = Math.max(R2.labOffline, eff.hours); R2.labNote = 'power cut';
        addActive(ev, 'powerCut', 'Research lab offline for ' + eff.hours + ' hours.', eff.hours, {});
        text += ' It will be offline for about ' + eff.hours + ' hours and running experiments are on hold.'; kind = 'bad';
        bus.emit('research'); break;
      }
    }
    if (Z.News) Z.News.onEvent(ev, eff, kind);   // news package: celebrity, donation, inspection, viral... can make the papers
    msg(text, kind);
    return ev;
  }
  function scheduleEvent() { S.eventAt = rng.chance(0.55) ? Math.round(rng.range(0.36, 0.72) * 1000) / 1000 : -1; }

  function secondly() {
    var k, a, e;
    if (!RT.wxInit) ensureInit();
    refreshEncAnimals();
    RT.escaped.length = 0; RT.guides.length = 0; RT.secCount = 0; RT.keeperCount = 0; RT.vetCount = 0; RT.dangerEsc = 0;
    for (k = 0; k < S.animals.length; k++) if (S.animals[k].state === 'escaped') { RT.escaped.push(S.animals[k]); if (aDanger(S.animals[k]) >= 2) RT.dangerEsc++; }
    if (S.panic > 0) S.panic = Math.max(0, S.panic - 0.003 - (Z.Monorail ? Z.Monorail.panicRelief() : 0));   // monorail package: a working line calms the park faster
    if (RT.dangerEsc > 0 && !RT.lockdown) { RT.lockdown = true; msg('The gates are closed to new visitors until the dangerous dinosaur is back in its enclosure.', 'bad', false); }
    else if (RT.dangerEsc === 0 && RT.lockdown) { RT.lockdown = false; msg('The dinosaur is secure. The gates are open again.', 'good', false); }
    for (k = 0; k < S.staff.length; k++) {
      var st = S.staff[k];
      if (st.sickUntil > S.day + S.time) continue;   // off sick
      if (st.type === 'guide') RT.guides.push(st); else if (st.type === 'security') RT.secCount++; else if (st.type === 'keeper') RT.keeperCount++; else if (st.type === 'vet') RT.vetCount++;
    }
    for (k = 0; k < S.enclosures.length; k++) encStats(S.enclosures[k]);
    var dc = 0; for (k = 0; k < RT.pathTiles.length; k++) if (S.dirt[RT.pathTiles[k]] >= 80) dc++;
    RT.dirtyCount = dc;
    var gs = S.guests, hsum = 0; for (k = 0; k < gs.length; k++) hsum += gs[k].happiness;
    S.guestHappiness = gs.length ? hsum / gs.length : RT.ghEMA;
    RT.guestCrowd = gs.length / (RT.pathTiles.length * 1.2 + 30);
    if (gs.length > S.stats.peakGuests) S.stats.peakGuests = gs.length;
    RT.value = arrivalValue(); RT.rate = arrivalRate();
    expireEvents();
    if (Z.Power) Z.Power.secondly();   // power package: supply, demand, shedding, outages, fence tests
    if (Z.Realms) Z.Realms.secondly();   // realms package: water quality, tags, geofence, shows, tunnel guests
    if (Z.Safari) Z.Safari.secondly();   // safari package: connected zones, wildlife arrivals, escapes to the mainland
    if (Z.News) Z.News.secondly();   // news package: effects expire, heat decays, watchers
    if (!openNow() && RT.pendingSpawn > 0) RT.pendingSpawn = 0;
    // thunderstorm: guests head for the exit
    if (WX.type === 'storm' && gs.length) { var pl = 0.02 * WX.intensity; for (k = gs.length - 1; k >= 0; k--) if (gs[k].state !== 'leave' && rng.chance(pl)) startLeaving(gs[k]); }
    // rating eases toward target
    var rb = computeRating(); S.rating += (rb.stars - S.rating) * 0.015; S.rating = clamp(S.rating, 0, 5);
    checkUnlocks();
    // closing: tidy up stragglers
    var t = S.time;
    if (t >= CLOSE_T + 0.08 || t < OPEN_T - 0.03) { for (k = gs.length - 1; k >= 0; k--) removeGuest(gs[k]); }
    // dirt decay on unused tiles is none; bins fill message
    // advice
    for (k = 0; k < S.enclosures.length; k++) {
      e = S.enclosures[k]; var E = RT.encx[e.id]; if (!e.animals.length || !E) continue;
      for (var spId in E.breakdown) {
        var br = E.breakdown[spId], sp = SP[spId], key = e.id + spId;
        if (br.value < 0.5 && RT.advice[key] !== S.day) {
          RT.advice[key] = S.day;
          var issue = br.space < 0.6 ? 'need a bigger enclosure' : br.issues.length ? br.issues[0].charAt(0).toLowerCase() + br.issues[0].slice(1) : 'are not happy';
          msg('The ' + lc(plural(sp)) + (br.space < 0.6 ? ' ' + issue + '.' : ' are unhappy: ' + issue + '.'), 'info');
        }
        if (e.minFence < br.minFence && RT.advice['f' + key] !== S.day) {
          RT.advice['f' + key] = S.day;
          msg('The ' + lc(plural(sp)) + ' could escape! Their fence is too weak (needs strength ' + br.minFence + ').', 'bad');
        }
        if (Z.Moats && RT.advice['m' + key] !== S.day) { var ma = Z.Moats.advice(e, spId); if (ma) { RT.advice['m' + key] = S.day; msg(ma + ' (' + e.name + ')', 'bad'); } }
      }
      if (!e.viewTiles.length && RT.advice['na' + e.id] !== S.day && (!RT.advice['na' + e.id] || S.day - RT.advice['na' + e.id] >= 3)) { RT.advice['na' + e.id] = S.day; msg(e.name + ': keepers cannot reach it (no path' + (e.kind || e.realm === 'sea' ? ', pier or walkway' : '') + ' within 3 tiles), so its animals will starve. Lay a path beside it.', 'bad'); }
      if (e.foodLevel < 0.2 && RT.keeperCount === 0 && RT.advice['food' + e.id] !== S.day) { RT.advice['food' + e.id] = S.day; msg('Food is running out at ' + e.name + '. Hire a ranger to refill it.', 'bad'); }
    }
    RT.t2++;
    if (RT.t2 % 2 === 0) checkGoals();
    debtCheck();
  }

  // Fair-warning bankruptcy: warnings at -1000 and -3500, then a grace period once below the limit before the bank steps in.
  function debtCheck() {
    if (S.gameOver) return;
    var m = S.money, now = S.day + S.time;
    if (m >= 0) { S.debtWarn = 0; RT.debtSince = 0; return; }
    if (m < -1000 && !(S.debtWarn >= 1)) { S.debtWarn = 1; msg('You are ' + fmt(-m) + ' overdrawn. The bank will call in your debts at -' + fmt(-DEBT_LIMIT).replace('-', '') + '. Raise prices, sell something or take a loan.', 'bad'); }
    if (m < -3500 && !(S.debtWarn >= 2)) { S.debtWarn = 2; if (S.speed > 1) S.speed = 1; msg('Final warning! You are ' + fmt(-m) + ' overdrawn. At -' + fmt(-DEBT_LIMIT).replace('-', '') + ' the bank closes the park. Act now.', 'bad'); }
    if (m < DEBT_LIMIT) {
      if (!RT.debtSince) { RT.debtSince = now; if (S.speed > 1) S.speed = 1; msg('The bank is calling in your debts! Get back above -' + fmt(-DEBT_LIMIT).replace('-', '') + ' within the next few hours or it is game over. Sell something, take a loan or cut costs now.', 'bad'); }
      else if (now - RT.debtSince >= DEBT_GRACE) {
        S.gameOver = true; S.speed = 0;
        msg('The bank has called in your debts. Game over!', 'bad');
        bus.emit('gameOver');
      }
    } else RT.debtSince = 0;
  }

  function breedingAndBirths() {
    var e, k, sp, a;
    // pregnancies progress / births
    var births = [];
    for (k = 0; k < S.animals.length; k++) {
      a = S.animals[k];
      if (a.pregnant > 0) { a.pregnant--; if (a.pregnant <= 0 && a.enc) births.push(a); }
    }
    for (k = 0; k < births.length; k++) {
      a = births[k]; sp = SP[a.species]; e = RT.eMap[a.enc]; if (!e) continue;
      var n = 0; for (var q = 0; q < e.animals.length; q++) if (RT.aById.get(e.animals[q]).species === a.species) n++;
      if (e.area / (n + 1) < sp.space * 0.7) { a.pregnant = 1; continue; }
      var sire = null;
      for (var q3 = 0; q3 < e.animals.length; q3++) { var cand = RT.aById.get(e.animals[q3]); if (cand.species === a.species && cand.sex === 'm' && !cand.baby) { sire = cand; break; } }
      var bq = Math.round(((aQ(a) + (sire ? aQ(sire) : aQ(a))) / 2) * 10) / 10;
      var baby = makeAnimal(a.species, e, a.x + rng.range(-0.8, 0.8), a.z + rng.range(-0.8, 0.8), true, null, bq, a.traits);
      if (!aok(baby, tileOf(baby.x, baby.z))) { baby.x = a.x; baby.z = a.z; }
      insertAnimal(baby);
      S.stats.babiesBorn++; S.stats.births++;
      msg('A baby ' + sp.name.toLowerCase() + ' has been born at ' + e.name + '! Say hello to ' + baby.name + '.', 'good');
      bus.emit('birth', baby);
    }
    // new pregnancies
    for (k = 0; k < S.enclosures.length; k++) {
      e = S.enclosures[k];
      var by = {};
      for (var q2 = 0; q2 < e.animals.length; q2++) { a = RT.aById.get(e.animals[q2]); (by[a.species] = by[a.species] || []).push(a); }
      for (var spId in by) {
        sp = SP[spId]; var list = by[spId], hasM = false, fem = [], ad = adultAge(sp);
        for (var z = 0; z < list.length; z++) {
          var an = list[z]; if (an.baby || an.age < ad) continue;
          if (an.sex === 'm') hasM = true; else if (!an.pregnant && !an.sick && an.happiness > 55) fem.push(an);
        }
        var suit = e.suitability[spId] || 0;
        if (!hasM || suit < 0.55 || list.length > sp.social[1]) continue;
        for (z = 0; z < fem.length; z++) {
          if (rng.chance(sp.breedChance * 0.4 * (0.5 + suit) * aBreedMul(fem[z]))) fem[z].pregnant = 1;
        }
      }
    }
  }

  function newDay() {
    var k, a, up = 0;
    // costs
    for (k = 0; k < S.animals.length; k++) up += (SP[S.animals[k].species] ? SP[S.animals[k].species].upkeep : 10) * (S.animals[k].baby ? 0.5 : 1) * fxOf(S.animals[k]).upkeep;
    for (k = 0; k < S.objects.length; k++) if (S.objects[k].kind === 'building') up += BD[S.objects[k].type].upkeep;
    var wages = 0; for (k = 0; k < S.staff.length; k++) wages += S.staff[k].type === 'scientist' ? (S.staff[k].wage || 40) : STF[S.staff[k].type].wage;
    up = Math.round(up * DIFF.costs); wages = Math.round(wages * DIFF.costs * (Z.News ? Z.News.wageMul() : 1));   // news package: wage demands after bad press
    if (up) spend(up, 'upkeep'); if (wages) spend(wages, 'wages');
    if (Z.Power) Z.Power.newDay();   // power package: fuel bill, cable fee, sabotage roll
    if (Z.Realms) Z.Realms.newDay();   // realms package: tank/dome/zone upkeep, tag upkeep, zone hold counter
    if (Z.News) Z.News.newDay();   // news package: insurance, sponsors, inspections, awards, daily stories
    var intr = loanSummary().dailyInterest;
    if (intr > 0) spend(intr, 'interest');
    if (Z.Monorail) Z.Monorail.newDay();   // monorail package: train upkeep, daily station figures
    if (Z.Safari) Z.Safari.newDay();   // safari package: vehicle upkeep, daily figures
    var t = S.finance.today;
    var income = t.tickets + t.food + t.shops + t.donations, costs = -(t.upkeep + t.wages + t.marketing + (t.interest || 0));
    var profit = income - costs;
    var rec = {}; for (var c in t) rec[c] = Math.round(t[c]);
    rec.day = S.day; rec.balance = Math.round(S.money); rec.income = Math.round(income); rec.costs = Math.round(costs); rec.profit = Math.round(profit);
    S.finance.history.push(rec); if (S.finance.history.length > 30) S.finance.history.shift();
    msg('Day ' + S.day + ' report: takings ' + fmt(income) + ', running costs ' + fmt(costs) + (intr > 0 ? ' (incl. ' + fmt(intr) + ' loan interest)' : '') + ', ' + (profit >= 0 ? 'profit ' : 'loss ') + fmt(Math.abs(profit)) + '.', profit >= 0 ? 'good' : 'bad');
    S.finance.today = Z.emptyFinance();
    S.day++; S.stats.guestsToday = 0;
    if (S.marketing.active) { S.marketing.daysLeft--; if (S.marketing.daysLeft <= 0) { S.marketing.active = false; msg('Your marketing campaign has ended.', 'info'); } }
    for (k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k]; if (e.breach > 0) { e.breach--; if (e.breach <= 0) msg('The fence at ' + e.name + ' has been repaired.', 'good', false); }
    }
    // animals: growth, illness, old age
    for (k = S.animals.length - 1; k >= 0; k--) {
      a = S.animals[k]; var sp = SP[a.species];
      if (a.baby && a.age >= adultAge(sp) * 0.6) { a.baby = false; if (a.enc) msg(a.name + ' the ' + sp.name.toLowerCase() + ' has grown up.', 'info', false); }
      if (a.age > aLife(a) && rng.chance(0.3)) { animalDie(a, 'peacefully of old age'); continue; }
      if (a.sick) {
        if (RT.vetCount === 0 && rng.chance(0.5)) { a.sick = false; }   // days are long, so untreated animals recover sooner per day
      } else if (!a.baby && a.enc) {
        var enc = RT.eMap[a.enc], dirty = enc && enc.poop > enc.area * 0.3 + 2;
        var p = (0.03 * (1.5 - a.happiness / 100) + (dirty ? 0.04 : 0) + (a.hunger > 80 ? 0.05 : 0)) * (1.5 - aQ(a) / 100) * (hasTrait(a, 'robust') ? 0.7 : 1) * WX.sick;
        if (rng.chance(p)) { a.sick = true; a.health = Math.max(20, a.health - 15); msg(a.name + ' the ' + sp.name.toLowerCase() + ' is unwell.' + (RT.vetCount ? '' : ' A vet could help.'), 'bad'); }
      }
    }
    breedingAndBirths();
    researchDaily();
    scheduleEvent();
    if (S.money < 0) msg('You are ' + fmt(-S.money) + ' in the red. Raise ticket prices, cut costs or take a loan. The bank steps in at -' + fmt(-DEBT_LIMIT).replace('-', '') + '.', 'bad');
    bus.emit('newDay');
  }

  // ====================== SIM LOOP ======================
  // first step after newGame()/load(): bring DIFF, WX and the weather/event state in line with the saved state
  function ensureInit() {
    RT.wxInit = true;
    if (!S.weather || !WXT[S.weather.type]) S.weather = { type: 'clear', intensity: 0.6, hoursLeft: 9, next: 'cloudy' };
    if (!S.activeEvents) S.activeEvents = [];
    if (S.eventAt === undefined) S.eventAt = -1;
    if (!WXT[S.weather.next]) S.weather.next = wxPick(S.weather.type);
    applyDifficulty(S.difficulty);
    recomputeWX();
  }

  function step(dt) {
    var k;
    if (!RT.wxInit) ensureInit();
    S.time += dt / DAY_SECONDS;
    if (S.time >= 1) { S.time -= 1; newDay(); }
    // weather evolves in game hours
    var dh = dt / DAY_SECONDS * 24;
    S.weather.hoursLeft -= dh;
    if (S.weather.hoursLeft <= 0) advanceWeather();
    RT.wxAcc = (RT.wxAcc || 0) + dh; if (RT.wxAcc >= 1) { RT.wxAcc -= 1; hourlyWeather(); }
    if (S.eventAt >= 0 && S.time >= S.eventAt) { S.eventAt = -1; fireEvent(); }
    if (S.time >= 0.5 && RT.midDay !== S.day) { RT.midDay = S.day; refreshMarket(false, true); }   // a second amber delivery at midday (days are long)
    // arrivals
    if (RT.arrMulT > 0) { RT.arrMulT -= dt; if (RT.arrMulT <= 0) RT.arrMul = 1; }
    if (openNow() && !RT.dangerEsc) {
      var add = RT.rate * dt * RT.arrMul;   // arrivalRate() (20b) already includes WX.arrivals, DIFF.arrivals and the day-length factor
      if (RT.pendingSpawn > 0) { var pp = Math.min(RT.pendingSpawn, 2 * dt); RT.pendingSpawn -= pp; add += pp; }
      RT.arrAcc += add;
      while (RT.arrAcc >= 1 && S.guests.length < MAX_GUESTS) {
        var size = Math.min(1 + Math.floor(rng.next() * rng.next() * 4), Math.floor(RT.arrAcc), MAX_GUESTS - S.guests.length), grp = RT.nextGroup++;
        if (size < 1) break;
        for (k = 0; k < size; k++) spawnGuest(grp);
        RT.arrAcc -= size;
      }
      if (S.guests.length >= MAX_GUESTS && RT.arrAcc > 1) RT.arrAcc = 1;
    } else RT.arrAcc = 0;
    var gs = S.guests;
    for (k = gs.length - 1; k >= 0; k--) { if (k < gs.length) guestStep(gs[k], dt); }
    updateQueues();
    if (Z.Monorail) Z.Monorail.step(dt);   // monorail package: trains, boarding, riders
    if (Z.Safari) Z.Safari.step(dt);   // safari package: vehicles, gates, wildlife
    var an = S.animals;
    for (k = an.length - 1; k >= 0; k--) { if (k < an.length) { var a = an[k]; a.age += dt / DAY_SECONDS; animalStep(a, dt); } }
    stepFights(dt);
    var sf = S.staff;
    for (k = 0; k < sf.length; k++) staffStep(sf[k], dt);
    researchStep(dt);
    RT.t1 += dt;
    if (RT.t1 >= 1) { RT.t1 -= 1; secondly(); }
    RT.escAcc += dt;
    if (RT.escAcc >= DAY_SECONDS / 24) { RT.escAcc = 0; escapeRoll(); }
  }

  function tick(dtReal) {
    if (!S || S.gameOver) return;
    var sp = S.speed;
    if (!(sp > 0) || !(dtReal > 0)) return;
    var rem = Math.min(dtReal, 0.25) * sp, n = 0;
    while (rem > 1e-6 && n < 40) { var h = rem < 0.05 ? rem : 0.05; step(h); rem -= h; n++; }
  }

  // ====================== RESEARCH ======================
  var RC = {
    unlockGenome: 50, eggSlots: 2, labCap: 2, baseSampleCap: 8, maxLevel: 3,
    baseChance: 0.40, gradeAdj: [-0.10, 0.02, 0.14], skillPerPoint: 0.07, seqBonus: [0, 0.035, 0.07, 0.10], contamination: 0.08,
    critBase: 0.07, cleanMul: [1, 0.65, 0.4, 0.2], salvagePerLevel: 0.15,
    hours: [3, 4.5, 6.5], hoursMul: [1, 0.85, 0.72, 0.6], reagent: [150, 250, 400], reagentSiteStar: 0.12,
    gain: [18, 30, 42], gainDiminish: 200, rarityExp: [1.2, 0.95, 0.7], catchUp: 0.6, focus: 6, doneMul: 0.5, focusPick: 4, arrivalMul: 1.3, eggCostMul: 0.6, cryoCap: 4,
    hatchBase: 0.55, hatchPerGenome: 0.007, incBonus: [0, 0.03, 0.05, 0.07], incHours: [1, 0.88, 0.76, 0.65], hatchRefund: 0.3,
    spliceMinGenome: 80, spliceBase: 0.25, spliceGenomeSlope: 0.01, spliceTraitPenalty: 0.06, spliceCrit: 0.12, spliceHours: 18,
    gradeOdds: [0.62, 0.28, 0.10], marketLots: 6, lotLife: [1, 3],
    expCost: 4.2, expDays: [2, 3], expSamples: [3, 5], expGrades: [0.55, 0.35, 0.10], expFossil: 0.10, expPristine: 0.08, expMax: 2,
    candDays: 2, pityStep: 0.05, pityCap: 0.2, grantCash: 2500, grantCooldown: 3, fieldCap: 85, fieldRate: 0.28, fieldPerAnimal: 0.04, xpOk: 14, xpFail: 5, xpCont: 6, xpSalv: 7, xpCrit: 3
  };
  function R_() { return S.research; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function roman(n) { return n === 1 ? 'I' : n === 2 ? 'II' : n === 3 ? 'III' : String(n); }
  function eqLevel(id) { var R = S.research; return R && R.equipment[id] || 0; }
  function scientists() { var o = []; for (var k = 0; k < S.staff.length; k++) if (S.staff[k].type === 'scientist') o.push(S.staff[k]); return o; }
  function labCapacity() { return RT.labs.length * (RC.labCap + eqLevel('lab_bench')); }
  function sampleCap() { return RC.baseSampleCap + RC.cryoCap * eqLevel('cryo_store'); }
  function labOnline() { return RT.labs.length > 0 && S.research.labOffline <= 0 && !(Z.Power && Z.Power.labDown()); }   // power package: no power, no lab
  function rlog(text, kind, toast) {
    var R = S.research; R.log.push({ day: S.day, text: text, kind: kind || 'info' }); if (R.log.length > 60) R.log.shift();
    msg(text, kind || 'info', toast);
  }
  function sciWorkers() { return scientists().slice(0, labCapacity()); }
  function jobOfStaff(id) { var R = S.research; for (var k = 0; k < R.jobs.length; k++) if (R.jobs[k].staffId === id) return R.jobs[k]; return null; }
  function freeScientists() { return sciWorkers().filter(function (s) { return !jobOfStaff(s.id); }); }
  function sciPick(staffId) {
    if (staffId) { var s = RT.sById.get(staffId); return s && s.type === 'scientist' ? s : null; }
    var f = freeScientists(), best = null;
    for (var k = 0; k < f.length; k++) if (!best || f[k].skill > best.skill) best = f[k];
    return best;
  }
  // pay science costs: donated research funding first, then cash
  function payScience(amount) {
    var R = S.research, fu = Math.min(R.funding, amount), cash = amount - fu;
    R.funding -= fu; R.stats.fundingUsed += fu; R.stats.spent += amount;
    if (cash > 0) spend(cash, 'research');
    return { funding: fu, cash: cash };
  }
  function canPay(amount) { return S.research.funding + S.money >= amount; }
  function cashNeed(amount) { return Math.max(0, amount - S.research.funding); }

  function newResearch() {
    var g = {}, tr = {}, eq = {};
    D.animals.forEach(function (a) { g[a.id] = 0; tr[a.id] = []; });
    (D.equipment || []).forEach(function (e) { eq[e.id] = 0; });
    return { genomes: g, traits: tr, samples: [], market: [], candidates: [], equipment: eq, jobs: [], eggs: [], funding: 0, log: [],
      stats: { experiments: 0, successes: 0, failures: 0, contaminated: 0, criticals: 0, salvaged: 0, hatched: 0, eggsLost: 0, spliced: 0, expeditions: 0, fieldGain: 0, spent: 0, fundingUsed: 0 },
      labOffline: 0, labNote: '', firstDone: false, guaranteed: 2, fossilCredits: 0, pity: 0, focusSp: null, lastGrant: -99, priceIdx: {}, nextCandidateDay: 1, marketDay: 0 };
  }

  // ---- genome ----
  function addGenome(spId, gain) {
    var R = S.research, old = R.genomes[spId] || 0, nv = clamp(old + gain, 0, 100);
    nv = Math.round(nv * 100) / 100; R.genomes[spId] = nv;
    if (old < RC.unlockGenome && nv >= RC.unlockGenome) {
      var sp = SP[spId];
      msg('The lab has pieced together enough of the ' + sp.name + ' genome to attempt a hatch!', 'good');
      R.log.push({ day: S.day, text: 'Genome unlocked: ' + sp.name, kind: 'good' }); if (R.log.length > 60) R.log.shift();
      bus.emit('unlock', { species: spId });
    }
    if (old < 99.95 && nv >= 99.95) { var sp2 = SP[spId]; msg('The ' + sp2.name + ' genome is now 100% complete. Every hatchling will be a perfect specimen!', 'good'); }
    return nv;
  }

  // ---- amber sources ----
  function siteList() { return (D.sites || []).filter(function (s) { return s.star <= S.unlocked.star; }); }
  function siteOdds(siteId, grade) {
    var site = SITE[siteId]; if (!site) return [];
    grade = grade || 1;
    var k, w = [], tot = 0, R = S.research, ex = RC.rarityExp[grade - 1];
    var open = site.species.filter(function (id) { return R.genomes[id] < 99.5; });
    var pool = open.length ? open : site.species;
    for (k = 0; k < pool.length; k++) {
      var gk = R.genomes[pool[k]], sp = SP[pool[k]], v = Math.pow(sp.rarity || 1, -ex) * (1 - RC.catchUp * Math.min(1, gk / 100)) * (gk > 0 && gk < RC.unlockGenome ? 1 + RC.focus * gk / RC.unlockGenome : gk >= RC.unlockGenome ? RC.doneMul : 1);
      if (R.focusSp === pool[k]) v *= RC.focusPick;
      w.push(v); tot += v;
    }
    return pool.map(function (id, i) { return { species: id, name: SP[id].name, rarity: SP[id].rarity, share: w[i] / tot, genome: R.genomes[id], focus: R.focusSp === id }; });
  }
  function drawSpecies(siteId, grade) {
    if (RT.force && RT.force.species && SP[RT.force.species]) { var fsp = RT.force.species; RT.force.species = null; rng.next(); return fsp; }   // test hook (Masterclass scripts): forceNext('species', id)
    var od = siteOdds(siteId, grade), r = rng.next(), acc = 0;
    for (var k = 0; k < od.length; k++) { acc += od[k].share; if (r < acc) return od[k].species; }
    return od[od.length - 1].species;
  }
  function priceFor(siteId, grade) {
    var R = S.research, site = SITE[siteId], idx = R.priceIdx[siteId] || 1;
    return Math.round(site.basePrice * GRADE[grade].priceMult * idx * (EV.amber || 1) / 10) * 10;
  }
  function rollGrade(odds) { var r = rng.next(), acc = 0; for (var k = 0; k < odds.length; k++) { acc += odds[k]; if (r < acc) return k + 1; } return 1; }
  function refreshMarket(initial, mid) {
    var R = S.research, k, sites = siteList(); if (!sites.length) return;
    for (k = 0; !mid && k < sites.length; k++) {
      var id = sites[k].id, idx = R.priceIdx[id] || 1;
      idx = clamp(idx + (1 - idx) * 0.25 + rng.range(-0.12, 0.12), 0.8, 1.3); R.priceIdx[id] = round3(idx);
    }
    R.market = R.market.filter(function (l) { return l.exp > S.day && SITE[l.site].star <= S.unlocked.star && !(rng.chance(mid ? 0.2 : 0.15) && !initial); });
    var target = RC.marketLots + (S.unlocked.star >= 2 ? 1 : 0) + (S.unlocked.star >= 4 ? 1 : 0);
    while (R.market.length < target) {
      var site = rng.pick(sites), grade = rollGrade(RC.gradeOdds);
      R.market.push({ id: newId(), site: site.id, grade: grade, price: Math.round(priceFor(site.id, grade) * rng.range(0.94, 1.08) / 10) * 10, exp: S.day + rng.int(RC.lotLife[0], RC.lotLife[1]) });
    }
    R.market.sort(function (a, b) { return a.exp - b.exp || a.id - b.id; });
    R.marketDay = S.day;
    bus.emit('market'); bus.emit('research');
  }
  function buyLot(lotId, opts) {
    var dry = dryOf(arguments), R = S.research, k, lot = null;
    for (k = 0; k < R.market.length; k++) if (R.market[k].id === lotId) { lot = R.market[k]; break; }
    if (!lot) return fail('That lot has been sold');
    if (R.samples.length >= sampleCap()) return fail('The sample store is full (' + sampleCap() + '). Use some samples or upgrade the cryo store.');
    if (S.money < lot.price) return fail('Not enough money');
    if (dry) return okr(lot.price);
    var sample = { id: newId(), site: lot.site, grade: lot.grade, day: S.day };
    R.market.splice(k, 1); R.samples.push(sample);
    spend(lot.price, 'research'); R.stats.spent += lot.price;
    msg('Bought ' + GRADE[lot.grade].name.toLowerCase() + ' amber from ' + SITE[lot.site].name + ' for ' + fmt(lot.price) + '.', 'info', false);
    bus.emit('market'); bus.emit('research');
    return okr(lot.price, { sampleId: sample.id });
  }

  // ---- extraction ----
  function reagentCost(site, grade) { return Math.round(RC.reagent[grade - 1] * (1 + RC.reagentSiteStar * (SITE[site] ? SITE[site].star : 0)) / 10) * 10; }
  function jobHours(base, sci) {
    var h = base * RC.hoursMul[eqLevel('centrifuge')] * (1 - 0.04 * ((sci ? sci.skill : 1) - 1));
    return Math.max(2, Math.round(h * 2) / 2);
  }
  function labWhy() {
    if (!RT.allLabs.length) return 'You need a research lab';
    if (!RT.labs.length) return "The research lab isn't connected to a path (its front must touch one)";
    if (Z.Power && Z.Power.labDown()) return Z.Power.labWhy();
    if (S.research.labOffline > 0) return (S.research.labNote === 'power cut' ? 'A power cut has knocked out the lab (' : 'The lab is being decontaminated (') + Math.ceil(S.research.labOffline) + ' hours left)';
    return null;
  }
  function pityBonus() { var R = S.research; return R && R.pity > 0 ? Math.min(RC.pityCap, R.pity * RC.pityStep) : 0; }
  function sampleById(id) { var R = S.research; for (var k = 0; k < R.samples.length; k++) if (R.samples[k].id === id) return R.samples[k]; return null; }
  function extractionOdds(sampleId, staffId) {
    var smp = sampleById(sampleId); if (!smp) return { success: 0, critical: 0, salvage: 0, contaminated: 0, fail: 1, hours: 0, cost: 0, canStart: false, why: 'No such sample', breakdown: [], scientist: null };
    var sci = sciPick(staffId), skill = sci ? sci.skill : 1, g = smp.grade, bd = [], why = null;
    var seqL = eqLevel('sequencer'), cleanL = eqLevel('clean_room'), cryoL = eqLevel('cryo_store');
    var pity = pityBonus();
    var pS = RC.baseChance + RC.gradeAdj[g - 1] + RC.skillPerPoint * (skill - 1) + RC.seqBonus[seqL] + pity;
    pS = clamp(pS, 0.05, 0.95);
    var first = !R_().firstDone, cont = pS * RC.contamination, ok = pS - cont;
    if (first) { pS = 1; cont = 0; ok = 1; }
    bd.push({ label: 'Base chance', value: RC.baseChance });
    bd.push({ label: GRADE[g].name + ' amber', value: RC.gradeAdj[g - 1] });
    bd.push({ label: 'Scientist skill ' + skill.toFixed(1), value: round3(RC.skillPerPoint * (skill - 1)) });
    if (seqL) bd.push({ label: 'Genome sequencer ' + roman(seqL), value: RC.seqBonus[seqL] });
    if (pity > 0) bd.push({ label: 'Lessons learned (' + R_().pity + ' miss' + (R_().pity === 1 ? '' : 'es') + ' in a row)', value: round3(pity) });
    var sumRaw = RC.baseChance + RC.gradeAdj[g - 1] + RC.skillPerPoint * (skill - 1) + RC.seqBonus[seqL] + pity;
    if (pS !== sumRaw) bd.push({ label: 'Limits', value: round3(pS - sumRaw) });
    bd.push({ label: 'Insect-DNA contamination', value: -round3(cont) });
    var critRaw = RC.critBase * RC.cleanMul[cleanL] * (1.15 - 0.15 * (skill - 1)), crit = Math.min(critRaw, 1 - pS);
    if (first) { bd.length = 0; bd.push({ label: 'Your first extraction always works', value: 1 }); }
    var cbd = [{ label: 'Base risk', value: RC.critBase }, { label: 'Scientist skill ' + skill.toFixed(1), value: round3(RC.critBase * (1.15 - 0.15 * (skill - 1)) - RC.critBase) }];
    if (cleanL) cbd.push({ label: 'Clean room ' + roman(cleanL), value: round3(critRaw - RC.critBase * (1.15 - 0.15 * (skill - 1))) });
    var salvRate = cryoL * RC.salvagePerLevel * (g === 1 ? 0.5 : 1), salv = (1 - pS - crit) * salvRate;
    if (first) { crit = 0; salv = 0; }
    var cost = reagentCost(smp.site, g), fundingUsed = Math.min(S.research.funding, cost), cashCost = cost - fundingUsed;
    var lw = labWhy();
    if (lw) why = lw;
    else if (!sci) why = freeScientists().length ? 'That scientist is busy' : (scientists().length ? 'All scientists are busy' : 'Hire a scientist first');
    else if (S.money < cashCost) why = 'Not enough money for reagents (' + fmt(cost) + ')';
    else if (Z.DNA && Z.DNA.queueFull()) why = 'The sequencing backlog is full (' + Z.DNA.queueCap() + ' batches). Let the team catch up first.';
    var hours = jobHours(RC.hours[g - 1], sci);
    return { success: round3(ok), contaminated: round3(cont), critical: round3(crit), salvage: round3(salv), fail: round3(1 - ok - cont - crit - salv), hours: hours, cost: cost, fundingUsed: fundingUsed, cashCost: cashCost,
      canStart: !why, why: why || '', breakdown: bd, criticalBreakdown: cbd, workChance: round3(pS), gainTypical: RC.gain[g - 1], pity: round3(pity), site: smp.site, grade: g,
      scientist: sci ? { id: sci.id, name: sci.name, skill: sci.skill } : null, pool: siteOdds(smp.site, g), guaranteed: first,
      _raw: { ok: ok, cont: cont, crit: crit, salv: salv } };
  }
  function pubOdds(o) { var c = {}; for (var k in o) if (k.charAt(0) !== '_') c[k] = o[k]; return c; }
  function startExtraction(sampleId, staffId, opts) {
    var dry = dryOf(arguments); if (typeof staffId === 'object') staffId = undefined;
    var R = S.research, od = extractionOdds(sampleId, staffId);
    if (!od.canStart) return fail(od.why);
    if (dry) return okr(od.cost);
    var smp = sampleById(sampleId), sci = RT.sById.get(od.scientist.id);
    R.samples.splice(R.samples.indexOf(smp), 1);
    payScience(od.cost);
    var job = { id: newId(), kind: 'extract', sampleId: smp.id, site: smp.site, grade: smp.grade, degraded: !!smp.degraded, staffId: sci.id, t: od.hours, total: od.hours, chance: od.success, cost: od.cost,
      odds: { ok: od._raw.ok, cont: od._raw.cont, crit: od._raw.crit, salv: od._raw.salv }, skill: sci.skill };
    R.jobs.push(job); R.stats.experiments++;
    bus.emit('research');
    return okr(od.cost, { jobId: job.id, hours: od.hours });
  }
  function xpUp(sci, x) {
    if (!sci) return;
    sci.xp = (sci.xp || 0) + x;
    for (;;) {
      var need = 36 + 22 * (sci.skill - 1);
      if (sci.skill >= 5 || sci.xp < need) break;
      sci.xp -= need;
      var before = sci.skill; sci.skill = Math.min(5, Math.round((sci.skill + 0.25) * 100) / 100);
      sci.wage = Math.round(STF.scientist.wage * sci.skill);
      if (Math.floor(sci.skill * 2) > Math.floor(before * 2)) msg(sci.name + ' has gained experience: skill now ' + sci.skill.toFixed(1) + '. Their pay rises to ' + fmt(sci.wage) + ' a day.', 'good');
      bus.emit('research');
    }
    if (sci.skill >= 5) sci.xp = 0;
  }
  function resolveExtract(job) {
    var R = S.research, sci = RT.sById.get(job.staffId), nm = sci ? sci.name : 'The scientist', o = job.odds, u = rng.next(), outcome, res = { job: job };
    var site = SITE[job.site];
    if (RT.force && RT.force.extract) { var fo = RT.force.extract; RT.force.extract = null; u = fo === 'success' ? 0 : fo === 'contaminated' ? o.ok + 0.0001 : fo === 'critical' ? o.ok + o.cont + 0.0001 : fo === 'salvaged' ? o.ok + o.cont + o.crit + 0.0001 : 0.99999; if (fo === 'salvaged' && o.salv <= 0) u = 0.99999; }
    if (u < o.ok) outcome = 'success';
    else if (u < o.ok + o.cont) outcome = 'contaminated';
    else if (u < o.ok + o.cont + o.crit) outcome = 'critical';
    else if (u < o.ok + o.cont + o.crit + o.salv) outcome = 'salvaged';
    else outcome = 'fail';
    res.outcome = outcome; R.firstDone = true;
    if (outcome === 'success') {
      var spId = drawSpecies(job.site, job.grade), g0 = R.genomes[spId];
      if (g0 >= 99.95) { spId = drawSpecies(job.site, job.grade); g0 = R.genomes[spId]; }   // bad-luck protection: never waste a success on a finished genome
      var gain = Math.max(1, RC.gain[job.grade - 1] * (1 - g0 / RC.gainDiminish) * rng.range(0.8, 1.2)); gain = Math.min(gain, 100 - g0);
      gain = Math.round(gain * 10) / 10;
      if (g0 >= 99.95) { gain = 0; var sold = Math.round(priceFor(job.site, job.grade) * 0.5); R.funding += sold; res.sold = sold; }   // whole site already sequenced: the data is sold to museums
      var batch = null, ng = g0;
      if (Z.DNA && !res.sold) batch = Z.DNA.makeBatch({ species: spId, site: job.site, grade: job.grade, outcome: 'success', skill: sci ? sci.skill : 1 });   // DNA package: fragments wait for sequencing
      else ng = addGenome(spId, gain);
      R.stats.successes++; res.species = spId; res.gain = batch ? batch.gain : gain; res.genome = ng; res.batch = batch; R.pity = 0;
      var lines = ['Eureka! ' + nm + ' recovered ' + SP[spId].name + ' DNA from the amber', 'Success! ' + nm + ' extracted clean ' + SP[spId].name + ' sequences', nm + ' has decoded fresh ' + SP[spId].name + ' genes'];
      if (res.sold) rlog('Every species from ' + site.name + ' is already fully sequenced, so ' + nm + ' sold the data to museums for ' + fmt(res.sold) + ' of research funding.', 'good');
      else if (batch) rlog(nm + ' recovered ' + batch.frags + ' ' + SP[spId].name + ' DNA fragments' + (batch.quality === 'excellent' ? ' of superb quality' : '') + '. They are queued for sequencing.', 'good');
      else rlog(rng.pick(lines) + ': genome +' + gain.toFixed(1) + '% (now ' + Math.floor(ng) + '%).', 'good');
      xpUp(sci, RC.xpOk + job.grade * 2);
    } else if (outcome === 'contaminated') {
      R.pity = (R.pity || 0) + 1; R.stats.contaminated++; R.stats.failures++;
      if (Z.DNA) {
        var cb = Z.DNA.makeBatch({ species: drawSpecies(job.site, job.grade), site: job.site, grade: job.grade, outcome: 'contaminated', skill: sci ? sci.skill : 1 }); res.batch = cb; res.species = cb.species;
        rlog(nm + "'s sample was mostly insect DNA (the mosquito is very well documented), but " + cb.frags + ' ' + SP[cb.species].name + ' fragments were rescued. Their integrity is poor.', 'info');
      } else rlog(nm + "'s sample turned out to be almost entirely insect DNA. Nothing usable, but at least the mosquito is well documented.", 'info');
      xpUp(sci, RC.xpCont);
    } else if (outcome === 'critical') {
      R.pity = (R.pity || 0) + 1; R.stats.criticals++; R.stats.failures++;
      R.labOffline = 12; R.labNote = ''; var bill = 400 + 200 * job.grade; spend(bill, 'research'); R.stats.spent += bill; res.bill = bill;
      rlog('Contamination! The sample from ' + site.name + ' ruined the clean bench. The lab is sealed for half a day and the clean-up costs ' + fmt(bill) + '.', 'bad');
      xpUp(sci, RC.xpCrit);
    } else if (outcome === 'salvaged') {
      var ng2 = Math.max(1, job.grade - 1);
      var sm = { id: newId(), site: job.site, grade: ng2, day: S.day, degraded: true };
      if (R.samples.length < sampleCap()) R.samples.push(sm); else sm = null;
      R.pity = (R.pity || 0) + 1; R.stats.salvaged++; R.stats.failures++; res.salvaged = sm;
      rlog('The extraction failed, but the cryo store kept a degraded fragment (' + GRADE[ng2].name.toLowerCase() + ') from the ' + site.name + ' amber.', 'info');
      xpUp(sci, RC.xpSalv);
    } else {
      R.pity = (R.pity || 0) + 1; R.stats.failures++;
      rlog(nm + "'s extraction failed - the amber crumbled and the sample is lost.", 'info');
      xpUp(sci, RC.xpFail);
    }
    bus.emit('experiment', { job: job, outcome: outcome, species: res.species, gain: res.gain, genome: res.genome, bill: res.bill, sold: res.sold, pity: R.pity || 0, batch: res.batch || null });
  }

  // ---- splicing ----
  function spliceOdds(speciesId, traitId, staffId, opts) {
    var R = S.research, sp = SP[speciesId], tr = TR[traitId], guide = opts && typeof opts.guide === 'number' ? clamp(opts.guide, 0, 1) : 0;
    var empty = { success: 0, critical: 0, fail: 1, hours: 0, cost: 0, canStart: false, why: '', breakdown: [], genomeLoss: [3, 6] };
    if (!sp) { empty.why = 'Unknown species'; return empty; }
    if (!tr) { empty.why = 'Unknown trait'; return empty; }
    var sci = sciPick(staffId), skill = sci ? sci.skill : 1, g = R.genomes[speciesId], owned = R.traits[speciesId].length;
    var seqL = eqLevel('sequencer'), cleanL = eqLevel('clean_room'), bd = [];
    var gb = clamp((g - RC.spliceMinGenome) * RC.spliceGenomeSlope, 0, 0.2);
    var raw = RC.spliceBase + gb + RC.skillPerPoint * (skill - 1) + RC.seqBonus[seqL] - RC.spliceTraitPenalty * owned + 0.14 * guide;
    var pS = clamp(raw, 0.05, 0.85);
    bd.push({ label: 'Base chance', value: RC.spliceBase });
    bd.push({ label: 'Genome ' + Math.floor(g) + '% complete', value: round3(gb) });
    bd.push({ label: 'Scientist skill ' + skill.toFixed(1), value: round3(RC.skillPerPoint * (skill - 1)) });
    if (seqL) bd.push({ label: 'Genome sequencer ' + roman(seqL), value: RC.seqBonus[seqL] });
    if (owned) bd.push({ label: owned + ' trait' + (owned > 1 ? 's' : '') + ' already spliced', value: -round3(RC.spliceTraitPenalty * owned) });
    if (guide > 0) bd.push({ label: 'Guided by your splicing puzzle', value: round3(0.14 * guide) });
    if (pS !== raw) bd.push({ label: 'Limits', value: round3(pS - raw) });
    var crit = Math.min(RC.spliceCrit * RC.cleanMul[cleanL] * (1.25 - 0.15 * (skill - 1)) * (1 - 0.4 * guide), 1 - pS);
    var cost = tr.cost, fundingUsed = Math.min(R.funding, cost), why = '';
    var lw = labWhy();
    if (g < RC.spliceMinGenome) why = 'Needs a genome of at least ' + RC.spliceMinGenome + '% (currently ' + Math.floor(g) + '%)';
    else if (sp.modern) why = 'Modern animals cannot be spliced';
    else if (R.traits[speciesId].indexOf(traitId) >= 0) why = 'This species already has the ' + tr.name + ' trait';
    else if (tr.donor && Z.DNA && Z.DNA.doses(tr.donor) < 1) why = 'You need sequenced ' + Z.DNA.donorName(tr.donor) + ' DNA. Buy a sample in the Gene bank.';
    else if (lw) why = lw;
    else if (!sci) why = scientists().length ? 'All scientists are busy' : 'Hire a scientist first';
    else if (S.money < cost - fundingUsed) why = 'Not enough money (' + fmt(cost) + ')';
    return { success: round3(pS), critical: round3(crit), fail: round3(1 - pS - crit), hours: jobHours(RC.spliceHours, sci), cost: cost, fundingUsed: fundingUsed, cashCost: cost - fundingUsed,
      canStart: !why, why: why, breakdown: bd, genomeLoss: [3, 6], species: speciesId, trait: traitId, scientist: sci ? { id: sci.id, name: sci.name, skill: sci.skill } : null };
  }
  function startSplice(speciesId, traitId, staffId, opts) {
    var dry = dryOf(arguments), op = staffId && typeof staffId === 'object' ? staffId : opts; if (typeof staffId === 'object') staffId = undefined;
    var R = S.research, od = spliceOdds(speciesId, traitId, staffId, op);
    if (!od.canStart) return fail(od.why);
    if (dry) return okr(od.cost);
    payScience(od.cost);
    var tr0 = TR[traitId], usedDonor = null;
    if (tr0.donor && Z.DNA) { Z.DNA.useDose(tr0.donor); usedDonor = tr0.donor; }
    var job = { id: newId(), kind: 'splice', species: speciesId, trait: traitId, staffId: od.scientist.id, t: od.hours, total: od.hours, chance: od.success, cost: od.cost, odds: { ok: od.success, crit: od.critical }, guide: op && typeof op.guide === 'number' ? clamp(op.guide, 0, 1) : 0, donor: usedDonor };
    R.jobs.push(job); R.stats.experiments++;
    bus.emit('research');
    return okr(od.cost, { jobId: job.id, hours: od.hours });
  }
  function resolveSplice(job) {
    var R = S.research, sci = RT.sById.get(job.staffId), nm = sci ? sci.name : 'The scientist', sp = SP[job.species], tr = TR[job.trait], u = rng.next(), outcome;
    if (RT.force && RT.force.splice) { var fs_ = RT.force.splice; RT.force.splice = null; u = fs_ === 'success' ? 0 : fs_ === 'critical' ? job.odds.ok + 0.0001 : 0.99999; }
    if (u < job.odds.ok) outcome = 'success'; else if (u < job.odds.ok + job.odds.crit) outcome = 'critical'; else outcome = 'fail';
    var res = { job: job, outcome: outcome, species: job.species };
    if (outcome === 'success') {
      R.traits[job.species].push(job.trait); R.stats.spliced++; R.stats.successes++; if (tr.donor) R.stats.genes = (R.stats.genes || 0) + 1;
      rlog(nm + ' has spliced the ' + tr.name + (tr.donor ? ' gene' : ' trait') + ' into the ' + sp.name + ' line! Every future hatchling will carry it.', 'good');
      xpUp(sci, 30);
    } else if (outcome === 'critical') {
      var loss = Math.round(rng.range(3, 6) * 10) / 10; R.genomes[job.species] = Math.max(0, round1(R.genomes[job.species] - loss)); res.loss = loss; R.stats.criticals++; R.stats.failures++;
      rlog('The ' + tr.name + ' splice went badly wrong and damaged the ' + sp.name + ' sequence: genome -' + loss.toFixed(1) + '%.', 'bad');
      xpUp(sci, 5);
    } else {
      R.stats.failures++;
      rlog(nm + "'s " + tr.name + ' splice did not take. The cells were lost and the reagents are gone.', 'info');
      xpUp(sci, 10);
    }
    res.genome = R.genomes[job.species];
    bus.emit('experiment', { job: job, outcome: outcome, species: job.species, trait: job.trait, genome: res.genome, loss: res.loss });
  }

  // ---- expeditions ----
  function expeditionInfo(siteId) {
    var R = S.research, site = SITE[siteId], base = { cost: 0, days: 0, canStart: false, why: '', samples: RC.expSamples.slice() };
    if (!site) { base.why = 'Unknown dig site'; return base; }
    var lvl = site.star, days = Math.round((RC.expDays[0] + RC.expDays[1]) / 2) + (lvl >= 2 ? 1 : 0), cost = Math.round(site.basePrice * RC.expCost * (R.priceIdx[siteId] || 1) / 10) * 10;
    var active = R.jobs.filter(function (j) { return j.kind === 'expedition'; });
    base.cost = cost; base.days = days; base.minDays = RC.expDays[0] + (lvl >= 2 ? 1 : 0); base.maxDays = RC.expDays[1] + (lvl >= 2 ? 1 : 0);
    base.site = siteId; base.fundingUsed = Math.min(R.funding, cost); base.cashCost = cost - base.fundingUsed;
    if (site.star > S.unlocked.star) base.why = 'Needs a ' + site.star + '-star park';
    else if (active.some(function (j) { return j.site === siteId; })) base.why = 'A team is already digging there';
    else if (active.length >= RC.expMax) base.why = 'Both dig teams are already in the field';
    else if (sampleCap() - R.samples.length < RC.expSamples[0] + active.length * RC.expSamples[0]) base.why = 'The sample store would be too full for the returning samples';
    else if (S.money < base.cashCost) base.why = 'Not enough money (' + fmt(cost) + ')';
    base.canStart = !base.why;
    return base;
  }
  function startExpedition(siteId, opts) {
    var dry = dryOf(arguments), R = S.research, info = expeditionInfo(siteId);
    if (!info.canStart) return fail(info.why);
    if (dry) return okr(info.cost);
    payScience(info.cost);
    var days = rng.int(info.minDays, info.maxDays);
    var job = { id: newId(), kind: 'expedition', site: siteId, t: days * 24, total: days * 24, days: days, cost: info.cost };
    R.jobs.push(job);
    rlog('A dig team has left for ' + SITE[siteId].name + '. They should be back in about ' + days + ' days.', 'info');
    bus.emit('research');
    return okr(info.cost, { jobId: job.id, days: days });
  }
  function resolveExpedition(job) {
    var R = S.research, n = rng.int(RC.expSamples[0], RC.expSamples[1]), out = [], bonus = {}, k, lost = 0;
    var star = SITE[job.site].star;
    for (k = 0; k < n; k++) out.push(rollGrade(RC.expGrades));
    if (rng.chance(RC.expPristine)) { out.push(3); bonus.pristine = true; }
    if (rng.chance(RC.expFossil)) { R.fossilCredits++; bonus.fossil = true; }
    if (Z.DNA) { var dn = Z.DNA.expeditionFind(job.site); if (dn) bonus.donor = dn; }
    var got = [];
    out.forEach(function (g) {
      if (R.samples.length < sampleCap()) { var sm = { id: newId(), site: job.site, grade: g, day: S.day }; R.samples.push(sm); got.push(sm); }
      else { lost++; var f = Math.round(priceFor(job.site, g) * 0.4); R.funding += f; }
    });
    R.stats.expeditions++;
    var txt = 'The dig team is back from ' + SITE[job.site].name + ' with ' + got.length + ' amber sample' + (got.length === 1 ? '' : 's') + '.';
    if (bonus.pristine) txt += ' One piece is pristine!';
    if (bonus.fossil) txt += ' They also brought a fossil skeleton for the park (free to place).';
    if (bonus.donor) txt += ' Local vets also traded a sample of ' + bonus.donor + ' DNA for sequencing.';
    if (lost) txt += ' ' + lost + ' could not be stored and were loaned to museums for research funding.';
    rlog(txt, 'good');
    bus.emit('expedition', { site: job.site, samples: got, bonus: bonus, lost: lost });
    bus.emit('research');
  }

  // ---- equipment ----
  function equipmentInfo(id) {
    var eq = EQ[id]; if (!eq) return null;
    var L = eqLevel(id), nxt = eq.levels[L] || null, why = '';
    if (!nxt) why = 'Fully upgraded';
    else if (nxt.star > S.unlocked.star) why = 'Needs a ' + nxt.star + '-star park';
    else if (S.money < nxt.cost) why = 'Not enough money';
    var eff = {
      sequencer: ['+' + Math.round(RC.seqBonus[1] * 100) + '% / +' + Math.round(RC.seqBonus[2] * 100) + '% / +' + Math.round(RC.seqBonus[3] * 100) + '% extraction and splice success'],
      centrifuge: ['Jobs ' + Math.round((1 - RC.hoursMul[1]) * 100) + '% / ' + Math.round((1 - RC.hoursMul[2]) * 100) + '% / ' + Math.round((1 - RC.hoursMul[3]) * 100) + '% faster'],
      clean_room: ['Contamination risk ×' + RC.cleanMul[1] + ' / ×' + RC.cleanMul[2] + ' / ×' + RC.cleanMul[3]],
      cryo_store: ['Salvage chance ' + Math.round(RC.salvagePerLevel * 100) + '% per level; sample store +' + RC.cryoCap + ' per level'],
      incubator: ['Hatch success +' + Math.round(RC.incBonus[1] * 100) + '% / +' + Math.round(RC.incBonus[2] * 100) + '% / +' + Math.round(RC.incBonus[3] * 100) + '%, incubation 12% / 24% / 35% faster'],
      lab_bench: ['+1 scientist desk per lab per level']
    }[id] || [eq.effect];
    return { id: id, name: eq.name, emoji: eq.emoji, effect: eq.effect, detail: eff[0], level: L, max: eq.levels.length, levels: eq.levels, next: nxt, canBuy: !why, why: why };
  }
  function buyEquipment(id, opts) {
    var dry = dryOf(arguments), R = S.research, info = equipmentInfo(id);
    if (!info) return fail('Unknown equipment');
    if (!info.canBuy) return fail(info.why);
    if (dry) return okr(info.next.cost);
    R.equipment[id] = info.level + 1;
    spend(info.next.cost, 'research'); R.stats.spent += info.next.cost;
    rlog(info.name + ' ' + roman(info.level + 1) + ' installed in the lab.', 'good');
    bus.emit('research');
    return okr(info.next.cost, { level: info.level + 1 });
  }

  // ---- scientists ----
  function makeCandidates() {
    var R = S.research, n = rng.int(3, 4), out = [], used = {}, k;
    for (k = 0; k < S.staff.length; k++) used[S.staff[k].name] = 1;
    for (k = 0; k < n; k++) {
      var skill = Math.round((1 + 3.5 * Math.pow(rng.next(), 1.7)) * 10) / 10, nm = null;
      for (var t = 0; t < 20; t++) { nm = rng.pick(D.scientistNames || D.guestNames); if (!used[nm]) break; }
      used[nm] = 1;
      out.push({ id: newId(), name: nm, skill: skill, wage: Math.round(STF.scientist.wage * skill), hireCost: Math.round(STF.scientist.hireCost * skill / 50) * 50 });
    }
    R.candidates = out; R.nextCandidateDay = S.day + RC.candDays;
    bus.emit('research');
  }
  function placeScientist(s, idx) {
    var lab = RT.labs.length ? RT.labs[idx % RT.labs.length] : null;
    if (!lab) return;
    var fr = frontPathTiles(lab); if (!fr.length) return;
    var t = fr[idx % fr.length], slot = Math.floor(idx / fr.length);
    s.x = cxOf(t) + (slot % 2 ? 0.5 : -0.5) * 0.6; s.z = czOf(t) + 0.1; s.ti = t;
    var c = objCentre(lab); s.heading = Math.atan2(c.x - s.x, c.z - s.z);
  }
  function hireScientist(candId, opts) {
    var dry = dryOf(arguments), R = S.research, c = null, k;
    for (k = 0; k < R.candidates.length; k++) if (R.candidates[k].id === candId) { c = R.candidates[k]; break; }
    if (!c) return fail('That candidate has taken another job');
    var lw = labWhy();
    if (!RT.labs.length) return fail(lw || 'You need a research lab');
    if (scientists().length >= labCapacity()) return fail('No free desks in the lab (' + labCapacity() + '). Build another lab or add lab benches.');
    if (S.money < c.hireCost) return fail('Not enough money');
    if (dry) return okr(c.hireCost);
    var s = { id: newId(), type: 'scientist', name: c.name, x: 0, z: 0, heading: 0, speed: 0, state: 'idle', task: 'Waiting for samples', skill: c.skill, xp: 0, wage: c.wage, ti: 0, home: 0, tk: null, route: null, ri: 0, wt: 0, lo: 0 };
    S.staff.push(s); RT.sById.set(s.id, s);
    R.candidates.splice(k, 1);
    placeScientist(s, scientists().length - 1);
    spend(c.hireCost, 'other');
    bus.emit('staffAdded', s); bus.emit('research');
    return okr(c.hireCost, { id: s.id });
  }
  function releaseScientistJobs(s) {
    var R = S.research, k;
    for (k = R.jobs.length - 1; k >= 0; k--) {
      var j = R.jobs[k]; if (j.staffId !== s.id) continue;
      if (j.kind === 'extract' && R.samples.length < sampleCap()) R.samples.push({ id: j.sampleId, site: j.site, grade: j.grade, day: S.day, degraded: j.degraded });
      R.jobs.splice(k, 1);
    }
    bus.emit('research');
  }
  function scientistStep(s, dt) {
    var R = S.research, job = jobOfStaff(s.id), idx = scientists().indexOf(s);
    s.speed = 0;
    if (s.pv !== RT.pathVer || s.pl !== RT.labs.length) { s.pv = RT.pathVer; s.pl = RT.labs.length; placeScientist(s, Math.max(0, idx)); }
    var sq = !job && Z.DNA ? Z.DNA.sciTask(s) : null;
    if (job && labOnline()) { s.state = 'work'; s.task = job.kind === 'hybrid' ? 'Cross-splicing a hybrid' : job.kind === 'splice' ? 'Splicing ' + TR[job.trait].name + ' into ' + SP[job.species].name : 'Extracting DNA (' + Math.ceil(job.t) + 'h left)'; }
    else if (sq && labOnline()) { s.state = 'work'; s.task = sq; }
    else { s.state = 'idle'; s.task = job ? 'Waiting for the lab to reopen' : (R.samples.length ? 'Ready for the next sample' : 'Waiting for samples'); }
  }
  function cancelJob(jobId, opts) {
    var dry = dryOf(arguments), R = S.research, k, j = null;
    for (k = 0; k < R.jobs.length; k++) if (R.jobs[k].id === jobId) { j = R.jobs[k]; break; }
    if (!j) return fail('No such job');
    if (j.kind === 'expedition') return fail('The dig team is already in the field');
    if (dry) return okr(0);
    R.jobs.splice(k, 1);
    if (j.kind === 'extract') {
      R.samples.push({ id: j.sampleId, site: j.site, grade: j.grade, day: S.day, degraded: j.degraded });
      rlog('Experiment cancelled. The sample went back into the store, but the reagents are gone.', 'info', false);
    } else { if (j.donor && Z.DNA) Z.DNA.returnDose(j.donor); rlog((j.kind === 'hybrid' ? 'Hybrid splice' : 'Splice') + ' cancelled. The reagents are gone' + (j.donor ? ', but the donor sample was kept.' : '.'), 'info', false); }
    bus.emit('research');
    return okr(0);
  }

  // ---- hatchery ----
  function hatchOdds(speciesId) {
    var R = S.research, sp = SP[speciesId];
    if (!sp) return { chance: 0, hours: 0, cost: 0, canStart: false, why: 'Unknown species', breakdown: [] };
    var g = R.genomes[speciesId], incL = eqLevel('incubator'), bd = [], chance, guaranteed = R.guaranteed > 0;
    var gb = (g - 50) * RC.hatchPerGenome;
    var hyb = sp.hybrid ? 0.08 : 0;
    chance = clamp(RC.hatchBase + gb + RC.incBonus[incL] - hyb, 0.05, 0.99);
    if (guaranteed) { bd.push({ label: 'First hatches are guaranteed', value: 1 }); }
    else {
      bd.push({ label: 'Base chance', value: RC.hatchBase });
      bd.push({ label: 'Genome ' + Math.floor(g) + '% complete', value: round3(gb) });
      if (incL) bd.push({ label: 'Incubator ' + roman(incL), value: RC.incBonus[incL] });
      if (hyb) bd.push({ label: 'Hybrid instability', value: -hyb });
      var lim = chance - (RC.hatchBase + gb + RC.incBonus[incL] - hyb); if (Math.abs(lim) > 1e-6) bd.push({ label: 'Limits', value: round3(lim) });
    }
    var hours = Math.max(4, Math.round((8 + 3 * Math.sqrt(sp.length)) * RC.incHours[incL]));
    var why = '';
    if (g < RC.unlockGenome) why = 'The genome is only ' + Math.floor(g) + '% complete (needs ' + RC.unlockGenome + '%)';
    else if (!RT.hatcheries.length) why = RT.allHatch.length ? "The hatchery isn't connected to a path" : 'You need a hatchery';
    else if (R.eggs.length >= RT.hatcheries.length * RC.eggSlots) why = 'All egg slots are in use';
    else if (S.money < eggCost(sp)) why = 'Not enough money (' + fmt(eggCost(sp)) + ')';
    return { chance: guaranteed ? 1 : round3(chance), hours: hours, cost: eggCost(sp), canStart: !why, why: why, breakdown: bd, guaranteed: guaranteed, genome: g, slots: RT.hatcheries.length * RC.eggSlots, eggs: R.eggs.length };
  }
  function hatchEgg(eg) {
    var R = S.research, sp = SP[eg.species], t = eg.i + eg.j * N, enc = encOfTile(t), ok = true;
    var bad = enc ? (compatible(enc, eg.species) || (RT.block[t] ? 'blocked' : null)) : 'no enclosure';
    if (bad) {
      // try another tile in the same original enclosure, else wait
      var alt = -1;
      if (enc && !compatible(enc, eg.species)) alt = randomEncTile({ enc: enc.id, species: eg.species }, enc, 0);
      if (alt >= 0) { eg.i = alt % N; eg.j = Math.floor(alt / N); t = alt; }
      else {
        if (!eg.waiting) { eg.waiting = true; eg.wait = 0; msg('The ' + sp.name + ' egg is ready to hatch, but its enclosure is no longer suitable! Fix it within a day and a half.', 'bad'); }
        eg.t = 0; return false;
      }
    }
    enc = encOfTile(t);
    var success = eg.guaranteed ? true : rng.chance(eg.chance);
    if (RT.force && RT.force.hatch !== undefined && RT.force.hatch !== null) { success = !!RT.force.hatch; if (!RT.force.keep) RT.force.hatch = null; }   // forceNext('keep', true) (Masterclass) keeps the outcome for every egg that hatches at the same moment
    R.eggs.splice(R.eggs.indexOf(eg), 1);
    if (success) {
      var g = R.genomes[eg.species], q = Math.round(g * 10) / 10;
      var a = makeAnimal(eg.species, enc, cxOf(t) + rng.range(-0.5, 0.5), czOf(t) + rng.range(-0.5, 0.5), true, null, q, R.traits[eg.species]);
      insertAnimal(a); R.stats.hatched++;
      msg('A ' + sp.name + (Z.Realms && Z.Realms.live(sp) ? ' has been born! Say hello to ' : ' has hatched! Say hello to ') + a.name + (q < 70 ? ' (a rather fragile specimen: genome quality ' + Math.floor(q) + '%)' : q >= 95 ? ' (a magnificent specimen)' : '') + '.', 'good');
      bus.emit('hatch', { egg: eg, ok: true, animal: a });
    } else {
      R.stats.eggsLost++;
      var refund = Math.round(eg.paid * RC.hatchRefund); earn(refund, 'animals');
      msg('The ' + sp.name + (Z.Realms && Z.Realms.live(sp) ? ' pregnancy was lost. The hatchery' : ' egg failed to hatch. The incubator') + ' staff recovered ' + fmt(refund) + ' of the cost.', 'bad');
      bus.emit('hatch', { egg: eg, ok: false, refund: refund });
    }
    bus.emit('research');
    return true;
  }

  // ---- progression per sim step ----
  function researchStep(dt) {
    var R = S.research, dh = dt / DAY_SECONDS * 24, k, j;
    if (R.labOffline > 0) { R.labOffline = Math.max(0, R.labOffline - dh); if (R.labOffline <= 0) { msg(R.labNote === 'power cut' ? 'The power is back on and the lab is running again.' : 'The lab has been decontaminated and is open again.', 'good'); R.labNote = ''; bus.emit('research'); } }
    var on = labOnline();
    for (k = R.jobs.length - 1; k >= 0; k--) {
      j = R.jobs[k];
      if (j.kind === 'expedition') { j.t -= dh; if (j.t <= 0) { R.jobs.splice(k, 1); resolveExpedition(j); } continue; }
      var sci = RT.sById.get(j.staffId);
      if (!sci) { R.jobs.splice(k, 1); continue; }
      if (!on) continue;
      j.t -= dh;
      if (j.t <= 0) { R.jobs.splice(k, 1); if (j.kind === 'extract') resolveExtract(j); else if (j.kind === 'hybrid' && Z.DNA) Z.DNA.resolveHybrid(j); else resolveSplice(j); bus.emit('research'); }
    }
    if (Z.DNA) Z.DNA.step(dt, dh);   // background sequencing of queued DNA batches by free scientists
    if (R.eggs.length && RT.hatcheries.length) {
      for (k = R.eggs.length - 1; k >= 0; k--) {
        var eg = R.eggs[k];
        if (Z.Power) { var pe = Z.Power.eggTick(eg, dh); if (pe === 1) continue; if (pe === 2) { R.eggs.splice(k, 1); R.stats.eggsLost++; var rfp = Math.round(eg.paid * RC.hatchRefund); earn(rfp, 'animals'); msg('The ' + SP[eg.species].name + ' egg went cold in the dead incubator and was lost. ' + fmt(rfp) + ' was recovered.', 'bad'); bus.emit('eggLost', { egg: eg }); bus.emit('research'); continue; } }   // power package: an unpowered hatchery stops incubating; long cuts spoil eggs
        if (eg.t > 0) { eg.t -= dh; if (eg.t > 0) continue; }
        if (eg.t <= 0) {
          if (!hatchEgg(eg)) { eg.wait = (eg.wait || 0) + dh; if (eg.wait > 36) { R.eggs.splice(k, 1); R.stats.eggsLost++; var rf = Math.round(eg.paid * RC.hatchRefund); earn(rf, 'animals'); msg('The ' + SP[eg.species].name + ' egg spoiled while waiting for a valid enclosure. ' + fmt(rf) + ' was recovered.', 'bad'); bus.emit('hatch', { egg: eg, ok: false, refund: rf }); bus.emit('research'); } }
        }
      }
    }
  }
  function researchDaily() {
    var R = S.research, k;
    if (R.nextCandidateDay <= S.day || !R.candidates.length) makeCandidates();
    refreshMarket(false);
    // field observations: good husbandry advances the science
    if (RT.keeperCount > 0 && RT.vetCount > 0) {
      var per = {}, cnt = 0;
      for (k = 0; k < S.animals.length; k++) {
        var a = S.animals[k]; if (!a.enc || a.state === 'escaped') continue;
        var e = RT.eMap[a.enc]; if (!e || (e.suitability[a.species] || 0) < 0.75) continue;
        per[a.species] = (per[a.species] || 0) + 1;
      }
      var tot = 0;
      for (var id in per) {
        var g = R.genomes[id]; if (g >= RC.fieldCap) continue;
        var gain = Math.min(RC.fieldCap - g, RC.fieldRate + RC.fieldPerAnimal * Math.min(4, per[id]));
        R.genomes[id] = Math.round((g + gain) * 100) / 100; tot += gain; R.stats.fieldGain += gain; cnt++;
      }
      if (cnt && S.day % 5 === 0) rlog('Field notes: observing healthy dinosaurs has added ' + tot.toFixed(1) + '% to the genome records across ' + cnt + ' species.', 'info', false);
    }
    researchGrant();
    if (Z.DNA) Z.DNA.daily();
    bus.emit('research');
  }
  // dead-end protection: nothing to extract, no money for the cheapest lot, fewer than two species in reach
  function researchGrant() {
    var R = S.research, un = 0, id;
    for (id in R.genomes) if (R.genomes[id] >= RC.unlockGenome) un++;
    if (un >= 2 || R.samples.length || (R.batches && R.batches.length) || R.jobs.some(function (j) { return j.kind === 'extract' || j.kind === 'expedition'; })) return;
    if (S.day - R.lastGrant < RC.grantCooldown) return;
    var cheapest = 1e9; for (var k = 0; k < R.market.length; k++) cheapest = Math.min(cheapest, R.market[k].price);
    if (!R.market.length) cheapest = 0;
    if (S.money >= cheapest + reagentCost('morrison', 1)) return;
    R.lastGrant = S.day; earn(RC.grantCash, 'donations'); R.funding += 0;
    rlog('A national science council has awarded the park a research grant of ' + fmt(RC.grantCash) + ' to keep the lab running.', 'good');
    bus.emit('grant', { amount: RC.grantCash });
  }
  function labFunding(amount) {
    var R = S.research; R.funding += amount; S.stats.fundingTotal += amount;
  }

  function summary() {
    var R = S.research, sc = scientists(), cap = labCapacity(), free = freeScientists().length, un = 0, id, avg = 0;
    for (id in R.genomes) { if (R.genomes[id] >= RC.unlockGenome) un++; avg += R.genomes[id]; }
    var ex = R.jobs.filter(function (j) { return j.kind === 'expedition'; }).length, nSp = 0;
    D.animals.forEach(function (a) { if (!a.modern) nSp++; });
    return { labs: RT.labs.length, labsBuilt: RT.allLabs.length, labOnline: labOnline(), labOfflineHours: R.labOffline, scientists: sc.length, capacity: cap, freeScientists: free, busyScientists: sciWorkers().length - free,
      hatcheries: RT.hatcheries.length, eggSlots: RT.hatcheries.length * RC.eggSlots, freeEggSlots: Math.max(0, RT.hatcheries.length * RC.eggSlots - R.eggs.length), eggs: R.eggs.length,
      sampleCap: sampleCap(), samples: R.samples.length, funding: R.funding, jobs: R.jobs.length, expeditions: ex, unlockedSpecies: un, totalSpecies: nSp, genomeAvg: avg / Math.max(1, nSp),
      guaranteedHatches: R.guaranteed, focus: R.focusSp || null, pity: R.pity || 0, fossilCredits: R.fossilCredits, equipment: Object.assign({}, R.equipment), candidates: R.candidates.length, nextCandidateDay: R.nextCandidateDay };
  }
  function genomeInfo(spId) {
    var R = S.research, sp = SP[spId]; if (!sp) return null;
    var g = R.genomes[spId];
    return { species: spId, name: sp.name, genome: g, focus: R.focusSp === spId, unlocked: g >= RC.unlockGenome, canSplice: g >= RC.spliceMinGenome, traits: R.traits[spId].slice(), site: sp.site, rarity: sp.rarity,
      quality: g >= 95 ? 'Magnificent' : g >= 80 ? 'Excellent' : g >= 65 ? 'Good' : g >= 50 ? 'Fragile' : 'Incomplete' };
  }

  function setFocus(spId) {
    var R = S.research; if (spId && !SP[spId]) return fail('Unknown species');
    R.focusSp = spId || null; bus.emit('research'); return okr(0, { focus: R.focusSp });
  }
  var researchAPI = {
    buyLot: buyLot, setFocus: setFocus,
    extractionOdds: function (sampleId, staffId) { return pubOdds(extractionOdds(sampleId, staffId)); },
    startExtraction: startExtraction,
    spliceOdds: spliceOdds, startSplice: startSplice,
    expeditionInfo: expeditionInfo, startExpedition: startExpedition,
    buyEquipment: buyEquipment, equipmentInfo: equipmentInfo,
    equipment: function () { return (D.equipment || []).map(function (e) { return equipmentInfo(e.id); }); },
    hireScientist: hireScientist, hatchOdds: hatchOdds, cancelJob: cancelJob, summary: summary,
    siteOdds: siteOdds, genomeInfo: genomeInfo, sites: function () { return (D.sites || []).map(function (s) { return { id: s.id, name: s.name, blurb: s.blurb, star: s.star, basePrice: s.basePrice, species: s.species.slice(), unlocked: s.star <= S.unlocked.star }; }); },
    CONST: RC
  };


  // Context for the DNA package (src/22-sim-dna.js): getters for the closure-private state/lookups and the research helpers it builds on.
  Z.simCtx = {
    S: function () { return S; }, RT: function () { return RT; }, SP: function () { return SP; }, TR: function () { return TR; }, SITE: function () { return SITE; }, EQ: function () { return EQ; },
    D: D, RC: RC, DAY_SECONDS: DAY_SECONDS, newId: newId, msg: msg, rlog: rlog, fmt: fmt, earn: earn, spend: spend, clamp: clamp, round1: round1, round3: round3, fail: fail, okr: okr, dryOf: dryOf,
    scientists: scientists, freeScientists: freeScientists, jobOfStaff: jobOfStaff, labOnline: labOnline, labWhy: labWhy, eqLevel: eqLevel, payScience: payScience, xpUp: xpUp, jobHours: jobHours,
    sciPick: sciPick, addGenome: addGenome, priceFor: priceFor, siteList: siteList, genomeOf: genomeOf, aliveCount: function () { return S.animals.length; }, researchAPI: researchAPI
  };

  // Context for the moats package (src/23-sim-moats.js): closure-private state, helpers and the undo journal.
  Z.moatCtx = {
    S: function () { return S; }, RT: function () { return RT; }, SP: function () { return SP; }, BD: function () { return BD; }, D: function () { return D; }, N: N, rng: rng, bus: bus,
    msg: msg, fmt: fmt, spend: spend, earn: earn, clamp: clamp, fail: fail, okr: okr, dryOf: dryOf,
    jBegin: jBegin, jOp: jOp, jEnd: jEnd, world: afterWorldChange, inMap: inMap, cliffT: cliffT, entranceTile: entranceTile, seaMask: seaMask, waterKind: waterKind,
    objFootprint: objFootprint, encById: encById, encOfTile: encOfTile, fxOf: fxOf, aDanger: aDanger, tileOf: tileOf, cxOf: cxOf, czOf: czOf, plural: plural, lc: lc, DT4: DT4, WX: function () { return WX; }
  };

  // Context for the realms package (src/26-sim-realms.js). Hooks into this file are marked "realms package" and guarded with `Z.Realms &&`.
  Z.realmCtx = {
    S: function () { return S; }, RT: function () { return RT; }, SP: function () { return SP; }, BD: function () { return BD; }, SC: function () { return SC; }, D: D, N: N, rng: rng, bus: bus,
    msg: msg, fmt: fmt, spend: spend, earn: earn, clamp: clamp, fail: fail, okr: okr, dryOf: dryOf,
    jBegin: jBegin, jOp: jOp, jEnd: jEnd, world: afterWorldChange, inMap: inMap, cliffT: cliffT, entranceTile: entranceTile, seaMask: seaMask, heightAt: heightAt,
    objFootprint: objFootprint, encById: encById, encOfTile: encOfTile, fxOf: fxOf, aDanger: aDanger, aMinFence: aMinFence, tileOf: tileOf, cxOf: cxOf, czOf: czOf, plural: plural, lc: lc,
    WX: function () { return WX; }, isNight: isNight, DAY_SECONDS: DAY_SECONDS, turn: turn, newId: newId, say: say, hurtGuest: hurtGuest, removeAnimal: removeAnimal,
    recapture: recapture, doEscape: doEscape, onEscape: onEscape, compatible: compatible, refreshEncAnimals: refreshEncAnimals, encStats: encStats
  };

  // Context for the power and news packages (src/25-sim-power.js, src/27-sim-news.js). Hooks into this file are marked "power package" / "news package".
  Z.powerCtx = {
    S: function () { return S; }, RT: function () { return RT; }, SP: function () { return SP; }, BD: function () { return BD; }, SC: function () { return SC; }, D: function () { return D; }, N: N, rng: rng, bus: bus,
    msg: msg, fmt: fmt, spend: spend, earn: earn, clamp: clamp, plural: plural, lc: lc, world: afterWorldChange, objFootprint: objFootprint, tileOf: tileOf, cxOf: cxOf, czOf: czOf,
    aMinFence: aMinFence, aDanger: aDanger, doEscape: doEscape, encById: encById, openNow: openNow, isNight: isNight, DAY_SECONDS: DAY_SECONDS, OPEN_T: OPEN_T, CLOSE_T: CLOSE_T,
    WX: function () { return WX; }, DIFF: function () { return DIFF; }, startLeaving: startLeaving, computeRating: computeRating, recomputeWX: recomputeWX, onEscape: onEscape,
    refreshEncs: function (onlyElectric) {   // rebuild the geometry/strength of enclosures (cheap; no flood fill)
      for (var q = 0; q < S.enclosures.length; q++) { var en = S.enclosures[q], Eo = RT.encx[en.id]; if (onlyElectric && !(Eo && Eo.elec)) continue; buildEncGeom(en); encStats(en); }
      bus.emit('enclosures');
    },
    say: say, fireStaff: fireStaff, setOpen: setOpen, thought: function (g, key) { say(g, key); }
  };

  // Context for the monorail package (src/24-sim-monorail.js): closure-private state, guest helpers, undo journal. Hooks into this file are marked "monorail package".
  Z.monoCtx = {
    S: function () { return S; }, RT: function () { return RT; }, SP: function () { return SP; }, BD: function () { return BD; }, D: function () { return D; }, N: N, rng: rng, bus: bus,
    msg: msg, fmt: fmt, spend: spend, earn: earn, clamp: clamp, fail: fail, okr: okr, dryOf: dryOf, say: say, plural: plural, lc: lc,
    jBegin: jBegin, jOp: jOp, jEnd: jEnd, world: afterWorldChange, inMap: inMap, seaMask: seaMask, heightAt: heightAt, cliffT: cliffT,
    objFootprint: objFootprint, footprint: footprint, frontPathTiles: frontPathTiles, encById: encById, aDanger: aDanger, tileOf: tileOf, cxOf: cxOf, czOf: czOf, getField: getField, INF: INF,
    startLeaving: startLeaving, gxPlace: gxPlace, gxHr: gxHr, objCentre: objCentre, removeGuest: removeGuest, DAY_SECONDS: DAY_SECONDS, OPEN_T: OPEN_T, CLOSE_T: CLOSE_T,
    openNow: openNow, WX: function () { return WX; }, isUnlocked: function (k, id) { return isUnlocked(k, id); },
    isParkConnected: isParkConnected, compOf: function (t) { return RT.comp[t]; }, gateComps: function () { return RT.gateComps; }, refreshConnectivity: refreshConnectivity
  };

  Z.safariCtx = {   // safari package: what the sim needs beyond Z.monoCtx
    removeAnimal: removeAnimal, hurtGuest: hurtGuest, doEscape: doEscape, recapture: recapture, onEscape: onEscape, newId: newId, isNight: isNight, refreshEncAnimals: refreshEncAnimals, encStats: encStats,
    addBack: function (an) { S.animals.push(an); RT.aById.set(an.id, an); }, addAnimal: addAnimal, cliffT: cliffT, cxOf: cxOf, czOf: czOf, fxOf: fxOf, spawnGuestHook: null, lc: lc, gateTile: function () { return GATE_I0 + GATE_J * N; }
  };

  // ====================== NEW GAME / SAVE / LOAD ======================
  function rawPlace(type, i, j, rot) {
    var dk = defOf(type); if (!dk) return null;
    var fp = footprint(dk.def, i, j, rot || 0);
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var x = i + a, y = j + b; if (!Z.inb(x, y)) return null;
      var t = x + y * N; if (S.path[t] || S.tileObj[t]) return null;
    }
    var o = { id: newId(), kind: dk.kind, type: type, i: i, j: j, rot: rot || 0 };
    if (dk.kind === 'building') { o.price = dk.def.price; o.uses = 0; o.income = 0; }
    if (type === 'bin') o.fill = 0;
    S.objects.push(o);
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) S.tileObj[(i + a) + (j + b) * N] = o.id;
    return o;
  }

  function resetRuntime() {
    var keepSeed = RT ? 0 : 0;
    RT = newRT();
  }

  function initDerived() {
    RT.aById.clear(); RT.gById.clear(); RT.sById.clear();
    S.animals.forEach(function (a) { RT.aById.set(a.id, a); });
    S.guests.forEach(function (g) { RT.gById.set(g.id, g); if (!RT.groupLead.has(g.group)) RT.groupLead.set(g.group, g.id); });
    S.staff.forEach(function (s) { RT.sById.set(s.id, s); });
    rebuildNav(); rebuildObjects(); refreshReach(); refreshFacilities();
  }

  // ====================== MAP GENERATION ======================
  function hash2(x, y, sd) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(sd | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, sd) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hash2(x0, y0, sd), b = hash2(x0 + 1, y0, sd), c = hash2(x0, y0 + 1, sd), d = hash2(x0 + 1, y0 + 1, sd);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, sd) { return (vnoise(x, y, sd) * 0.57 + vnoise(x * 2.1, y * 2.1, sd + 7) * 0.29 + vnoise(x * 4.3, y * 4.3, sd + 13) * 0.14); }
  function sstep(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function mapDef(id) {
    var ms = D.maps || [], k;
    for (k = 0; k < ms.length; k++) if (ms[k].id === id) return ms[k];
    return ms[0] || { id: 'fern_meadow', bounds: { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }, gen: { base: 'grass' } };
  }
  function ramp(i, rs, wid) { var f = 0; if (rs) for (var k = 0; k < rs.length; k++) f = Math.max(f, 1 - Math.abs(i - rs[k]) / wid); return f < 0 ? 0 : f; }
  // ====================== ISLAND: sea / fresh water, coast helpers ======================
  // Sea = water tiles connected (8-way) to the grid edge through water tiles whose lowest corner is at or below sea level (elev <= 0).
  // Everything else that is water is fresh (lakes, rivers: their bed corners sit at elev >= 1). Derived, never saved.
  function seaOf(terr, E) {
    var sea = new Uint8Array(NN), st = [], t, i, j, k, di, dj, EWd = N + 1;
    function low(q) { var x = q % N, y = (q - x) / N, c = x + y * EWd; return E[c] <= 0 || E[c + 1] <= 0 || E[c + EWd] <= 0 || E[c + EWd + 1] <= 0; }
    for (t = 0; t < NN; t++) {
      i = t % N; j = (t - i) / N;
      if ((i === 0 || j === 0 || i === N - 1 || j === N - 1) && terr[t] === WATER && low(t)) { sea[t] = 1; st.push(t); }
    }
    while (st.length) {
      t = st.pop(); i = t % N; j = (t - i) / N;
      for (dj = -1; dj <= 1; dj++) for (di = -1; di <= 1; di++) {
        var x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= N || y >= N) continue;
        k = x + y * N; if (!sea[k] && terr[k] === WATER && low(k)) { sea[k] = 1; st.push(k); }
      }
    }
    return sea;
  }
  function seaMask(force) { if (force || !RT.sea) { RT.sea = seaOf(S.terrain, S.elev); RT.seaNear = null; } return RT.sea; }
  // tiles within 2 tiles of the sea (land that must stay at or above sea level)
  function seaNear() {
    var sea = seaMask();
    if (RT.seaNear) return RT.seaNear;
    var nr = new Uint8Array(NN), i, j, a, b;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      if (!sea[i + j * N]) continue;
      for (b = -2; b <= 2; b++) for (a = -2; a <= 2; a++) { var x = i + a, y = j + b; if (x >= 0 && y >= 0 && x < N && y < N) nr[x + y * N] = 1; }
    }
    RT.seaNear = nr; return nr;
  }
  // does any tile around the tile-corner (ci,cj) belong to the mask?
  function cornerSea(ci, cj, mask) {
    for (var b = -1; b <= 0; b++) for (var a = -1; a <= 0; a++) { var x = ci + a, y = cj + b; if (x >= 0 && y >= 0 && x < N && y < N && mask[x + y * N]) return true; }
    return false;
  }
  function waterKind(i, j) {
    if (!Z.inb(i, j) || S.terrain[i + j * N] !== WATER) return null;
    return seaMask()[i + j * N] ? 'sea' : 'fresh';
  }
  // distance (tiles) to the nearest tile of the mask (0 on it); Float32Array(NN)
  function chamfer(src) {
    var d = new Float32Array(NN), i, j, t, v, BIG = 999;
    for (t = 0; t < NN; t++) d[t] = src[t] ? 0 : BIG;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      t = i + j * N; v = d[t]; if (v === 0) continue;
      if (i > 0 && d[t - 1] + 1 < v) v = d[t - 1] + 1;
      if (j > 0) { if (d[t - N] + 1 < v) v = d[t - N] + 1; if (i > 0 && d[t - N - 1] + 1.414 < v) v = d[t - N - 1] + 1.414; if (i < N - 1 && d[t - N + 1] + 1.414 < v) v = d[t - N + 1] + 1.414; }
      d[t] = v;
    }
    for (j = N - 1; j >= 0; j--) for (i = N - 1; i >= 0; i--) {
      t = i + j * N; v = d[t]; if (v === 0) continue;
      if (i < N - 1 && d[t + 1] + 1 < v) v = d[t + 1] + 1;
      if (j < N - 1) { if (d[t + N] + 1 < v) v = d[t + N] + 1; if (i < N - 1 && d[t + N + 1] + 1.414 < v) v = d[t + N + 1] + 1.414; if (i > 0 && d[t + N - 1] + 1.414 < v) v = d[t + N - 1] + 1.414; }
      d[t] = v;
    }
    return d;
  }
  // signed shore distance per tile for the CURRENT state: + = land (1 = first tile inland of the water), - = sea (-1 = first sea tile off the beach). Not cached.
  function shoreDist() {
    var sea = seaMask(), land = new Uint8Array(NN), t, dl, ds, out = new Float32Array(NN);
    for (t = 0; t < NN; t++) land[t] = sea[t] ? 0 : 1;
    dl = chamfer(sea); ds = chamfer(land);
    for (t = 0; t < NN; t++) out[t] = sea[t] ? -ds[t] : dl[t];
    return out;
  }
  var SIZE_MAP = { small: 40, medium: 56, large: 72, huge: 88 };
  function resolveSizeN(mapSize) {
    if (typeof mapSize === 'number' && isFinite(mapSize)) {
      var rn = Math.round(mapSize);
      return (rn >= 32 && rn <= 128) ? rn : 56;
    }
    if (typeof mapSize === 'string' && SIZE_MAP[mapSize]) return SIZE_MAP[mapSize];
    return 56;
  }
  function sizeIdForN(n) { return n === 40 ? 'small' : n === 72 ? 'large' : n === 88 ? 'huge' : 'medium'; }
  function scaleMapDef(md, n) {
    var ob = (md && md.bounds) || { i0: 0, j0: 0, i1: n - 1, j1: n - 1 }, og = (md && md.gen) || {};
    if (n === 56) return { bounds: ob, gen: og };
    var s = n / 56, mid = n / 2;
    var ow = ob.i1 - ob.i0 + 1, nw = Math.max(12, Math.round(ow * s));
    var i0 = clamp(Math.round(mid - nw / 2), 0, n - 1), i1 = clamp(i0 + nw - 1, i0, n - 1);
    var j0 = clamp(Math.round(ob.j0 * s), 0, n - 1), j1 = n - 1;
    var nb = { i0: i0, j0: j0, i1: i1, j1: j1 };
    var ng = Object.assign({}, og);
    if (og.ridge) ng.ridge = Object.assign({}, og.ridge, { j: og.ridge.j * s, ramps: og.ridge.ramps ? og.ridge.ramps.map(function (r) { return r * s; }) : undefined });
    if (og.canyon) ng.canyon = Object.assign({}, og.canyon, { j: og.canyon.j * s, ramps: og.canyon.ramps ? og.canyon.ramps.map(function (r) { return r * s; }) : undefined });
    if (og.island) {
      var I = og.island, nI = Object.assign({}, I, { cx: I.cx * s, cy: I.cy * s, rx: I.rx * s, ry: I.ry * s });
      if (I.tongueJ !== undefined) nI.tongueJ = I.tongueJ * s;
      if (I.capes) nI.capes = I.capes.map(function (c) { return [c[0] * s, c[1] * s, c[2] * s]; });
      if (I.islets) nI.islets = I.islets.map(function (c) { return [c[0] * s, c[1] * s, c[2] * s]; });
      if (I.lagoon) nI.lagoon = { x: I.lagoon.x * s, y: I.lagoon.y * s, r: I.lagoon.r * s, ang: I.lagoon.ang };
      ng.island = nI;
    }
    if (og.lakes) ng.lakes = Object.assign({}, og.lakes, { n: og.lakes.n ? Math.max(1, Math.round(og.lakes.n * s)) : 0 });
    if (og.mesas) ng.mesas = Object.assign({}, og.mesas, { n: og.mesas.n ? Math.max(1, Math.round(og.mesas.n * s)) : 0 });
    if (og.scatter) ng.scatter = og.scatter.map(function (sc) { var c = sc.slice(); c[1] = Math.max(1, Math.round(sc[1] * s)); return c; });
    return { bounds: nb, gen: ng };
  }
  // land mask of an island description (see D.maps[].gen.island)
  function isleMask(I, sd) {
    var land = new Uint8Array(NN), i, j, k, x, y, H = I.harm || [], B = I.bays || [], wob = I.wob === undefined ? 0.22 : I.wob;
    var pb = plazaBounds(N), mid = Math.floor(N / 2);
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      x = i + 0.5; y = j + 0.5;
      var u = (x - I.cx) / I.rx, v = (y - I.cy) / I.ry, r = Math.sqrt(u * u + v * v), a = Math.atan2(v, u), R = 1 + (fbm(x / 8, y / 8, sd + 3) - 0.5) * wob;
      for (k = 0; k < H.length; k++) R += H[k][1] * Math.cos(H[k][0] * a + H[k][2]);
      for (k = 0; k < B.length; k++) { var da = a - B[k][0]; while (da > PI) da -= TAU; while (da < -PI) da += TAU; R -= B[k][2] * Math.exp(-(da * da) / (B[k][1] * B[k][1])); }
      if (r < R) land[i + j * N] = 1;
    }
    function disc(cx, cy, r, val) {
      for (j = Math.max(0, Math.floor(cy - r - 1)); j <= Math.min(N - 1, Math.ceil(cy + r + 1)); j++) for (i = Math.max(0, Math.floor(cx - r - 1)); i <= Math.min(N - 1, Math.ceil(cx + r + 1)); i++) {
        var dx = i + 0.5 - cx, dy = j + 0.5 - cy, rr = r * (1 + (fbm(i / 3, j / 3, sd + 9) - 0.5) * 0.35);
        if (dx * dx + dy * dy < rr * rr) land[i + j * N] = val;
      }
    }
    (I.capes || []).forEach(function (c) { disc(c[0], c[1], c[2], 1); });
    // the gate peninsula: always land from the plaza down to the south edge, wider than the plaza so beaches flank it
    var tj = I.tongueJ !== undefined ? Math.round(I.tongueJ) : (pb.j0 - 3);
    var tL0 = mid - 10, tR0 = mid + 9, lagLim = 40 * Math.max(1, N / 56);
    for (j = tj; j < N; j++) {
      var tl = tL0 - Math.round((fbm(j / 5, 3.3, sd + 51) - 0.3) * 6), tr = tR0 + Math.round((fbm(j / 5, 8.8, sd + 52) - 0.3) * 6);
      for (i = Math.min(tL0, tl); i <= Math.max(tR0, tr); i++) if (i >= 0 && i < N) land[i + j * N] = 1;
    }
    if (I.lagoon) {
      var L = I.lagoon; disc(L.x, L.y, L.r, 0);
      for (var s = 0; s < lagLim; s += 0.7) { var px = L.x + Math.cos(L.ang) * s, py = L.y + Math.sin(L.ang) * s; if (px < 0 || py < 0 || px > N || py > N) break; disc(px, py, 1.5, 0); }
    }
    (I.islets || []).forEach(function (c) { disc(c[0], c[1], c[2], 1); });
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var tg = j >= tj && i >= mid - 14 && i <= mid + 13;
      if (!tg && (i < 2 || j < 2 || i > N - 3 || j > N - 3)) land[i + j * N] = 0;
    }
    // sea pockets that do not reach the edge become land
    var seen = new Uint8Array(NN), st = [], t;
    for (t = 0; t < NN; t++) { i = t % N; j = (t - i) / N; if ((i === 0 || j === 0 || i === N - 1 || j === N - 1) && !land[t]) { seen[t] = 1; st.push(t); } }
    while (st.length) {
      t = st.pop(); i = t % N; j = (t - i) / N;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x2 = i + d[0], y2 = j + d[1]; if (x2 < 0 || y2 < 0 || x2 >= N || y2 >= N) return; var q = x2 + y2 * N; if (!seen[q] && !land[q]) { seen[q] = 1; st.push(q); } });
    }
    for (t = 0; t < NN; t++) if (!land[t] && !seen[t]) land[t] = 1;
    return land;
  }
  // elevation (in elev steps) of the island profile at signed shore distance s (tiles; + inland): sea floor shelves, beach ramp, then the inland plain at +2
  function isleProfile(s) {
    if (s >= 0) return 2 * sstep(s / 4.6);
    if (s > -2.4) return 0;
    if (s > -4.8) return -1;
    if (s > -8) return -2;
    return -3;
  }
  // Z.Sim.previewMap(mapId, seed, mapSize) -> {terrain, elev, sea, bounds, N} for the new-game sheet (own state, never touches the live game)
  function previewMap(id, seed, mapSize) {
    var sS = S, sR = RT, sZ = Z.state, rs = rng.getSeed(), prevN = N, sizeN = resolveSizeN(mapSize), out = null;
    try {
      if (sizeN !== prevN) { Z.N = sizeN; syncGridVars(sizeN); }
      S = Z.newState(); RT = newRT(); Z.state = S;
      var md = mapDef(id), sm = scaleMapDef(md, sizeN);
      S.map = { id: md.id, i0: sm.bounds.i0, j0: sm.bounds.j0, i1: sm.bounds.i1, j1: sm.bounds.j1 };
      var r = genMap(md, seed || 1, true);
      out = { terrain: S.terrain, elev: S.elev, sea: seaOf(S.terrain, S.elev), bounds: r && r.bounds || sm.bounds, N: sizeN };
    } catch (e) { out = null; }
    finally {
      if (Z.N !== prevN) { Z.N = prevN; syncGridVars(prevN); }
      S = sS; RT = sR; Z.state = sZ; rng.seed(rs);
    }
    return out;
  }

  // fills S.terrain / S.elev for the whole grid (outside the bounds too, so the surroundings look natural) and scatters starting plants and rocks inside the bounds
  function genMap(md, seed, previewOnly) {
    var sm = scaleMapDef(md, N), g = sm.gen || {}, b = sm.bounds, sd = (seed | 0) % 100003, ci, cj, k, i, j, t;
    var pb = plazaBounds(N), scale = N / 56;
    rng.seed((seed | 0) * 2654435761 + 12345);   // map generation depends on the seed only (so previewMap matches the real thing)
    var baseT = TI[g.base || 'grass']; if (baseT === undefined) baseT = 0;
    var lakes = [], mesas = [], tries, I = g.island || null, land = null, dl = null, ds = null, sdT = null, ELEVB = N + 1;
    if (I) {
      land = isleMask(I, sd);
      var seaM0 = new Uint8Array(NN), landM = new Uint8Array(NN);
      for (t = 0; t < NN; t++) { seaM0[t] = land[t] ? 0 : 1; landM[t] = land[t]; }
      dl = chamfer(seaM0); ds = chamfer(landM); sdT = new Float32Array(NN);
      for (t = 0; t < NN; t++) sdT[t] = land[t] ? dl[t] : -ds[t];
      // owned land = everything from the first beach to the last beach tile, plus a tile of shallows; always down to the south edge
      var bi0 = N, bj0 = N, bi1 = 0, bj1 = N - 1;
      for (t = 0; t < NN; t++) if (land[t]) { i = t % N; j = (t - i) / N; if (i < bi0) bi0 = i; if (i > bi1) bi1 = i; if (j < bj0) bj0 = j; }
      b = { i0: Math.max(0, bi0 - 1), j0: Math.max(0, bj0 - 1), i1: Math.min(N - 1, bi1 + 1), j1: N - 1 };
    }
    var inland = function (x, y) { return !I ? 99 : (Z.inb(x | 0, y | 0) ? sdT[(x | 0) + (y | 0) * N] : -1); };
    var near = function (x, y, r) { // keep features off the entrance plaza
      var dx = Math.max(pb.i0 - x, 0, x - (pb.i1 + 1)), dy = Math.max(pb.j0 - y, 0);
      return Math.sqrt(dx * dx + dy * dy) > r;
    };
    if (g.lakes) for (k = 0, tries = 0; k < g.lakes.n && tries < 300; tries++) {
      var lr = rng.range(g.lakes.r[0], g.lakes.r[1]), lx = rng.range(b.i0 + lr + 1, b.i1 - lr), ly = rng.range(b.j0 + lr + 1, b.j1 - lr), ok = near(lx, ly, lr + 4);
      if (I && ok) ok = inland(lx, ly) > lr + 4.5 && ly < N - 6 && !(lx + lr > pb.i0 + 1 && lx - lr < pb.i1 && ly + lr > Math.round(22 * scale));   // keep the central corridor from the gate free of lakes
      for (var q = 0; q < lakes.length && ok; q++) { var ddx = lakes[q].x - lx, ddy = lakes[q].y - ly; if (Math.sqrt(ddx * ddx + ddy * ddy) < lakes[q].r + lr + 3) ok = false; }
      if (ok) { lakes.push({ x: lx, y: ly, r: lr }); k++; }
    }
    if (g.mesas) for (k = 0, tries = 0; k < g.mesas.n && tries < 300; tries++) {
      var mr = g.mesas.r * rng.range(0.8, 1.2), mx = rng.range(b.i0 + mr + 2, b.i1 - mr - 1), my = rng.range(b.j0 + mr + 2, b.j1 - mr - 1), mok = near(mx, my, mr + 5);
      if (I && mok) mok = inland(mx, my) > mr + 4;
      if (g.canyon && Math.abs(my - g.canyon.j) < mr + g.canyon.w + 3) mok = false;
      for (var q2 = 0; q2 < mesas.length && mok; q2++) { var mdx = mesas[q2].x - mx, mdy = mesas[q2].y - my; if (Math.sqrt(mdx * mdx + mdy * mdy) < mesas[q2].r + mr + 3) mok = false; }
      for (var q3 = 0; q3 < lakes.length && mok; q3++) { var ldx = lakes[q3].x - mx, ldy = lakes[q3].y - my; if (Math.sqrt(ldx * ldx + ldy * ldy) < lakes[q3].r + mr + 3) mok = false; }
      if (mok) { mesas.push({ x: mx, y: my, r: mr, a: rng.range(-PI, PI) }); k++; }
    }
    // rivers: meandering stream from a lake (or an inland spring) towards the coast in direction `to`, stamped as fresh-water tiles
    var fresh = new Uint8Array(NN), riverPts = [];
    function stampRiver(rd, src, wide) {
      if (!I || !rd) return;
      var x = src.x, y = src.y, dirA = Math.atan2(Math.sin(rd.to) * I.ry, Math.cos(rd.to) * I.rx), hx = Math.cos(dirA), hy = Math.sin(dirA), ph = rng.range(0, 6.28), pts = [], steps = 0, maxSteps = Math.round(90 * Math.max(1, scale));
      var tgx = I.cx + Math.cos(rd.to) * I.rx * 1.3, tgy = I.cy + Math.sin(rd.to) * I.ry * 1.3, ax = tgx - x, ay = tgy - y, al = Math.sqrt(ax * ax + ay * ay) || 1;
      hx = ax / al; hy = ay / al;
      while (steps++ < maxSteps) {
        var wob = Math.sin(steps * 0.33 + ph) * 0.55 + Math.sin(steps * 0.11 + ph * 2) * 0.5;
        x += hx + (-hy) * wob * 0.55; y += hy + hx * wob * 0.55;
        if (x < 2 || y < 2 || x > N - 2 || y > N - 2) break;
        var tt = (x | 0) + (y | 0) * N, rw = 1.15 + (sdT[tt] < 5 ? 0.55 : 0) + (wide ? 0.25 : 0);
        pts.push([+x.toFixed(1), +y.toFixed(1), rw]);
        if (sdT[tt] <= 0) break;
        for (var jj = Math.floor(y - rw - 1); jj <= Math.ceil(y + rw + 1); jj++) for (var ii = Math.floor(x - rw - 1); ii <= Math.ceil(x + rw + 1); ii++) {
          if (ii < 0 || jj < 0 || ii >= N || jj >= N || !land[ii + jj * N]) continue;
          if (ii >= pb.i0 - 2 && ii <= pb.i1 + 2 && jj >= pb.j0 - 3) continue;   // never across the entrance plaza
          var rx2 = ii + 0.5 - x, ry2 = jj + 0.5 - y; if (rx2 * rx2 + ry2 * ry2 < rw * rw) fresh[ii + jj * N] = 1;
        }
      }
      riverPts.push(pts);
    }
    var srcOf = function (n, rd) {
      if (lakes[n]) return { x: lakes[n].x, y: lakes[n].y };
      var a = rd.to + PI + 0.5 * (n ? -1 : 1);
      return { x: clamp(I.cx + Math.cos(a) * I.rx * 0.45, 4, N - 5), y: clamp(I.cy + Math.sin(a) * I.ry * 0.45, 4, N - 12) };
    };
    if (I && I.river) stampRiver(I.river, srcOf(0, I.river), false);
    if (I && I.river2) stampRiver(I.river2, srcOf(1, I.river2), true);
    var phase = rng.range(0, 6.28), HF = new Float32Array((N + 1) * (N + 1));
    for (cj = 0; cj <= N; cj++) for (ci = 0; ci <= N; ci++) {
      var h = 0;
      if (g.hills && g.hills.amp) h += g.hills.amp * (fbm(ci / g.hills.scale, cj / g.hills.scale, sd + 11) - 0.5) * 2.2;
      if (g.ridge) {
        var rl = g.ridge.j + g.ridge.wave * Math.sin(ci * 0.13 + phase) + 1.5 * Math.sin(ci * 0.37 + phase * 2), rw = 1.1 + 6 * ramp(ci, g.ridge.ramps, 4);
        h += g.ridge.h * sstep((rl - cj + rw / 2) / rw);
      }
      if (g.canyon) {
        var cl = g.canyon.j + g.canyon.wave * Math.sin(ci * 0.15 + phase) + 2 * Math.sin(ci * 0.41 + phase * 3), rp = ramp(ci, g.canyon.ramps, 3.5), cw = g.canyon.w * (1 - 0.5 * rp), dd = cw - Math.abs(cj - cl);
        h -= g.canyon.depth * (1 - 0.7 * rp) * sstep((dd + 0.6) / 1.2);
      }
      for (k = 0; k < mesas.length; k++) {
        var m = mesas[k], mdx2 = ci - m.x, mdy2 = cj - m.y, md2 = Math.sqrt(mdx2 * mdx2 + mdy2 * mdy2), ang = Math.atan2(mdy2, mdx2), da = Math.abs(ang - m.a); if (da > PI) da = TAU - da;
        var mw = da < 0.6 ? 5 : 1.1;
        h += g.mesas.h * sstep((m.r - md2 + mw / 2) / mw);
      }
      if (!I) for (k = 0; k < lakes.length; k++) {
        var l = lakes[k], ld = Math.sqrt((ci - l.x) * (ci - l.x) + (cj - l.y) * (cj - l.y)) / l.r;
        if (ld < 1.2) h -= g.lakes.depth * 1.6 * (1 - sstep(ld / 1.2));
      }
      // keep the plaza and the outer rim of the grid flat
      var pdx = Math.max(pb.i0 - ci, 0, ci - (pb.i1 + 1)), pdy = Math.max(pb.j0 - cj, 0), pf = sstep(Math.sqrt(pdx * pdx + pdy * pdy) / 5);
      var ef = I ? 1 : sstep(Math.min(ci, cj, N - ci, N - cj) / 4);
      HF[ci + cj * (N + 1)] = h * pf * ef;
    }
    // elevation: island = shore profile + the inland relief faded in from the beach; legacy (no island) = the raw field
    var cornerS = null;
    if (I) {
      cornerS = new Float32Array((N + 1) * (N + 1));
      for (cj = 0; cj <= N; cj++) for (ci = 0; ci <= N; ci++) {
        var sS = 0;
        for (var bb = -1; bb <= 0; bb++) for (var aa = -1; aa <= 0; aa++) sS += sdT[clamp(ci + aa, 0, N - 1) + clamp(cj + bb, 0, N - 1) * N];
        sS = sS / 4 + (fbm(ci / 5, cj / 5, sd + 21) - 0.5) * 1.1 * (sS > -3 ? 1 : 0);
        cornerS[ci + cj * ELEVB] = sS;
        var e = isleProfile(sS); if (sS > 0) e += HF[ci + cj * ELEVB] * sstep((sS - 1.8) / 6);
        S.elev[ci + cj * ELEVB] = clamp(Math.round(e), -4, 12);
      }
      // the entrance plaza and its approach are flat at the inland level
      for (cj = pb.j0 - 1; cj <= N; cj++) for (ci = pb.i0 - 1; ci <= pb.i1 + 2; ci++) S.elev[ci + cj * ELEVB] = 2;
    } else for (k = 0; k < HF.length; k++) S.elev[k] = clamp(Math.round(HF[k]), -4, 12);
    // terrain
    var paint = g.paint || [], pr;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      t = i + j * N; var c0 = i + j * (N + 1), hv = (HF[c0] + HF[c0 + 1] + HF[c0 + N + 1] + HF[c0 + N + 2]) / 4, ter = baseT;
      for (k = 0; k < paint.length; k++) {
        pr = paint[k];
        if (pr.n !== undefined && fbm(i / pr.s, j / pr.s, sd + 31 + k * 5) < pr.n) continue;
        if (pr.hi !== undefined && hv < pr.hi) continue;
        if (pr.lo !== undefined && hv > pr.lo) continue;
        if (TI[pr.t] !== undefined) ter = TI[pr.t];
      }
      for (k = 0; k < lakes.length; k++) {
        var lk = lakes[k], dlk = Math.sqrt((i + 0.5 - lk.x) * (i + 0.5 - lk.x) + (j + 0.5 - lk.y) * (j + 0.5 - lk.y)) / lk.r;
        if (dlk < 0.72) { ter = WATER; if (I) fresh[t] = 1; } else if (dlk < 0.98 && ter !== WATER) ter = TI.dirt;
      }
      if (I) {
        var bw = 2.5 + 2.1 * fbm(i / 6, j / 6, sd + 41);
        if (!land[t]) ter = WATER;
        else if (fresh[t]) ter = WATER;
        else if (dl[t] <= bw && !(ter === WATER)) ter = TI.sand;
      }
      if (i >= pb.i0 - 1 && i <= pb.i1 + 1 && j >= pb.j0 - 1) ter = TI.grass;   // the plaza is always meadow
      S.terrain[t] = ter;
    }
    if (I) {
      // fresh water beds: every lake/river tile corner sits at elev 1 (surface half a step above the sea), dropping to the sea level where a river meets the beach
      var fdist = chamfer(fresh);
      for (t = 0; t < NN; t++) if (fresh[t] && S.terrain[t] !== WATER) S.terrain[t] = WATER;
      for (cj = 0; cj <= N; cj++) for (ci = 0; ci <= N; ci++) {
        var c = ci + cj * ELEVB, wd = 99, fw = false;
        for (var b2 = -1; b2 <= 0; b2++) for (var a2 = -1; a2 <= 0; a2++) {
          var xx = ci + a2, yy = cj + b2; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          if (fresh[xx + yy * N]) fw = true; if (fdist[xx + yy * N] < wd) wd = fdist[xx + yy * N];
        }
        if (fw) S.elev[c] = clamp(Math.round(isleProfile(cornerS[c])), 0, 1);
        else if (wd < 6 && cornerS[c] > 1.5) S.elev[c] = clamp(S.elev[c], 1, 2 + Math.ceil(wd));
      }
    }
    if (previewOnly) return { bounds: b };
    // starting plants and rocks (inside the bounds, never on the plaza)
    var total = 0, maxTotal = Math.round(120 * Math.max(1, scale)), sc = g.scatter || [], sea0 = I ? seaOf(S.terrain, S.elev) : null;
    for (k = 0; k < sc.length && total < maxTotal; k++) {
      var sp = sc[k], want = sp[1], got = 0, allowed = sp[2] || [], opt = sp[3] || {};
      for (tries = 0; tries < want * 30 && got < want && total < maxTotal; tries++) {
        i = rng.int(b.i0, b.i1); j = rng.int(b.j0, b.j1); t = i + j * N;
        if (i >= pb.i0 - 1 && i <= pb.i1 + 1 && j >= pb.j0 - 1) continue;
        if (S.tileObj[t] || S.path[t] || tileSlope(i, j) > 2) continue;
        if (sea0 && sea0[t] && sp[0] !== 'ice_floe') continue;
        var tn = D.terrain[S.terrain[t]].id; if (allowed.length && allowed.indexOf(tn) < 0) continue;
        if (opt.nearWater) {
          var nw = false;
          for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) if (Z.inb(i + di, j + dj) && S.terrain[(i + di) + (j + dj) * N] === WATER && (!sea0 || !sea0[(i + di) + (j + dj) * N])) nw = true;
          if (!nw) continue;
        }
        if (rawPlace(sp[0], i, j, rng.int(0, 3))) { got++; total++; }
      }
    }
    return { bounds: b, island: !!I, lakes: lakes.map(function (l) { return [+l.x.toFixed(1), +l.y.toFixed(1), +l.r.toFixed(1)]; }), rivers: riverPts.map(function (p) { return p.filter(function (_, n) { return n % 3 === 0; }); }) };
  }

  function newGame(opts) {
    opts = opts || {};
    var gseed = opts.seed || (Date.now() & 0x7fffffff);
    var sizeN = resolveSizeN(opts.mapSize);
    Z.setGridSize(sizeN);
    rng.seed(gseed);
    S = Z.newState(); S.fights = []; Z.state = S; RT = newRT(); EV.amber = 1;   // (an amber price event of the previous game must not price this game's first market)
    S.gridN = sizeN;
    S.mapSize = (typeof opts.mapSize === 'string' && SIZE_MAP[opts.mapSize]) ? opts.mapSize : sizeIdForN(sizeN);
    var paved = PI_.paved || 1;
    applyDifficulty(opts.difficulty, true);
    if (opts.money) S.money = opts.money;
    var md = mapDef(opts.map), bb = scaleMapDef(md, sizeN).bounds;
    S.map = { id: md.id, i0: bb.i0, j0: bb.j0, i1: bb.i1, j1: bb.j1 };
    S.rating = 0.9;
    if (Z.DNA) Z.DNA.beforeReset();   // forget the previous game's hybrid species before the genome table is built
    S.research = newResearch();
    var i, j, ox = GATE_I0 - 27, oz = N - 56;
    for (j = N - 4; j < N; j++) for (i = GATE_I0 - 2; i <= GATE_I0 + 3; i++) S.path[i + j * N] = paved;
    for (j = N - 16; j < N - 4; j++) { S.path[GATE_I0 + j * N] = paved; S.path[(GATE_I0 + 1) + j * N] = paved; }
    S.speed = 1;
    var gm = genMap(md, gseed);
    if (gm && gm.island) { S.map = { id: md.id, i0: gm.bounds.i0, j0: gm.bounds.j0, i1: gm.bounds.i1, j1: gm.bounds.j1, island: 1, lakes: gm.lakes, rivers: gm.rivers }; }
    rebuildNav();
    initDerived();
    [['ginkgo', 22, 47], ['pine', 32, 48], ['ginkgo', 23, 39], ['pine', 33, 41], ['tree_fern', 22, 50], ['pine', 31, 39], ['bush', 25, 49], ['bush', 30, 49], ['fern', 24, 47], ['fern', 31, 46],
      ['flower_bed', 24, 52], ['flower_bed', 31, 52], ['lamp', 26, 51], ['lamp', 29, 51]].forEach(function (p) { rawPlace(p[0], p[1] + ox, p[2] + oz, 0); });
    // the founding laboratory and hatchery, both facing the main path
    rawPlace('research_lab', 24 + ox, 42 + oz, 1);
    rawPlace('hatchery', 29 + ox, 43 + oz, 3);
    rebuildObjects(); refreshFacilities();
    var R = S.research;
    R.genomes.dryosaurus = 60; R.genomes.compsognathus = 40;
    R.samples.push({ id: newId(), site: 'morrison', grade: 1, day: 1 }, { id: newId(), site: 'european', grade: 1, day: 1 }, { id: newId(), site: 'european', grade: 2, day: 1 });
    var nm = rng.pick(D.scientistNames || D.guestNames);
    var sci = { id: newId(), type: 'scientist', name: nm, x: 0, z: 0, heading: 0, speed: 0, state: 'idle', task: 'Waiting for samples', skill: 1.5, xp: 0, wage: Math.round(STF.scientist.wage * 1.5), ti: 0, home: 0, tk: null, route: null, ri: 0, wt: 0, lo: 0 };
    S.staff.push(sci); RT.sById.set(sci.id, sci); placeScientist(sci, 0);
    makeCandidates(); refreshMarket(true);
    if (Z.DNA) Z.DNA.afterReset();
    if (Z.Power) Z.Power.afterLoad(true);   // power package: fresh grid state (before moats and enclosures)
    if (Z.Moats) Z.Moats.afterLoad ? Z.Moats.afterLoad(true) : Z.Moats.update();   // moats package: fresh ditch/water state
    recomputeEnclosures();
    if (Z.Monorail) Z.Monorail.afterLoad();   // monorail package
    if (Z.Realms) { Z.Realms.reset(); Z.Realms.update(); }   // realms package
    if (Z.Safari) Z.Safari.afterLoad(true);   // safari package
    if (Z.News) Z.News.afterLoad(true);   // news package: empty feed
    RT.value = arrivalValue(); RT.rate = arrivalRate();
    msg('Welcome to Amber Acres! Your lab is ready: run an extraction, hatch a Dryosaurus and open the gates.', 'info', false);
    bus.emit('reset');
    return S;
  }

  function save() {
    return JSON.stringify({ v: VERSION, rng: rng.getSeed(), ghEMA: RT.ghEMA, nextGroup: RT.nextGroup, s: S }, function (k, v) {
      if (v && typeof v === 'object' && ArrayBuffer.isView(v)) return Z.packArray(v);
      return v;
    });
  }
  var ARR_FIELDS = { terrain: Uint8Array, path: Uint8Array, fenceX: Uint8Array, fenceZ: Uint8Array, tileObj: Int32Array, tileEnc: Int16Array, dirt: Uint8Array, ditch: Uint8Array, rail: Uint8Array };
  function arrLenFor(n) {
    var nn = n * n;
    return { terrain: nn, path: nn, fenceX: n * (n + 1), fenceZ: (n + 1) * n, tileObj: nn, tileEnc: nn, dirt: nn, ditch: nn, rail: nn };
  }
  var ARR_OPTIONAL = { ditch: 1, rail: 1 };   // moats package: old saves have no ditch layer (defaults to none)
  function load(str) {
    var obj, ns, prevN = N, gridN = 56;
    try {
      obj = JSON.parse(str);
      if (!obj || obj.v !== VERSION || !obj.s) return false;
      ns = obj.s;
      if (!ns.research || !ns.research.genomes || !ns.research.stats) return false;
      gridN = (typeof ns.gridN === 'number' && isFinite(ns.gridN) && ns.gridN >= 32 && ns.gridN <= 128) ? Math.round(ns.gridN) : 56;
      var expLen = arrLenFor(gridN);
      for (var f in ARR_FIELDS) {
        var v = ns[f];
        if (v && v.__t) v = Z.unpackArray(v);
        if (!v && ARR_OPTIONAL[f]) v = new ARR_FIELDS[f](expLen[f]);
        if (!v || v.length !== expLen[f]) return false;
        ns[f] = v;
      }
      Z.setGridSize(gridN);
      var tpl = Z.newState();
      var ev = ns.elev; if (ev && ev.__t) ev = Z.unpackArray(ev);
      ns.elev = ev && ev.length === (gridN + 1) * (gridN + 1) ? ev : tpl.elev;   // old saves: flat land, full-size map
      if (!ns.map || typeof ns.map.i0 !== 'number') ns.map = tpl.map;
      for (var key in tpl) if (ns[key] === undefined) ns[key] = tpl[key];
      ns.gridN = gridN;
      if (!ns.mapSize) ns.mapSize = sizeIdForN(gridN);
      ns.stats = Object.assign(tpl.stats, ns.stats);
      ns.unlocked = Object.assign({ star: 0 }, ns.unlocked);
    } catch (e) {
      if (N !== prevN) Z.setGridSize(prevN);
      return false;
    }
    S = ns; Z.state = S; RT = newRT();
    if (S.loan > 0 && (!Array.isArray(S.loans) || !S.loans.length)) {
      var ldDef = difficultyDef(S.difficulty) || { interest: 0.01 };
      S.loans = [{ id: 1, principal: Math.round(S.loan), rate: ldDef.interest || 0.01, takenDay: S.day || 1 }];
    }
    ensureLoans();
    if (S.finance && S.finance.today && S.finance.today.interest === undefined) S.finance.today.interest = 0;
    rng.seed(obj.rng || 1); RT.ghEMA = obj.ghEMA || 65; RT.nextGroup = obj.nextGroup || 1;
    if (Z.DNA) Z.DNA.afterLoad();   // re-register saved hybrid species and default the DNA fields of old saves
    var k;
    for (k = 0; k < S.guests.length; k++) {
      var g = S.guests[k];
      g.ti = tileOf(g.x, g.z); g.ni = -1; g.pv = 0; g.ubid = 0; g.bid = 0; g.wt = 0; g.speed = 0; g.nt = rng.next();
      if (g.state === 'ride') { g.gt = ''; g.dk = ''; }   // monorail package: riders stay on their train (relinked in Monorail.afterLoad)
      else if (g.state === 'leave') { g.gt = 'exit'; g.dk = 'exit'; } else { g.state = 'walk'; g.gt = ''; g.dk = ''; }
      if (g.gt === 'out') g.gt = 'exit';
    }
    if (!S.panic) S.panic = 0;
    if (!S.weather || !S.weather.type) S.weather = { type: 'clear', intensity: 0.6, hoursLeft: 9, next: 'cloudy' };
    if (!S.activeEvents) S.activeEvents = [];
    if (!Array.isArray(S.fights)) S.fights = [];
    if (!S.difficulty) S.difficulty = 'normal';
    if (S.eventAt === undefined) S.eventAt = -1;
    if (S.research.firstDone === undefined) S.research.firstDone = (S.research.stats.successes + S.research.stats.failures) > 0;   // old saves with a finished extraction skip the guarantee
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k]; a.held = 0; a.claim = 0; a.stuck = 0; a.tg = ''; a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0;
      if (!isFinite(a.x)) a.x = N * TILE / 2; if (!isFinite(a.z)) a.z = N * TILE / 2;
      if (!isFinite(a.heading)) a.heading = 0;
      if (a.genomeQ === undefined) a.genomeQ = 100; if (!a.traits) a.traits = [];
      if (a.injured === undefined) a.injured = false;
      if (a.fightCd === undefined) a.fightCd = 0;
      if (!a.fid || !fightById(a.fid)) { a.fid = 0; if (a.state === 'fight') a.state = 'idle'; }
      if (a.state !== 'escaped' && a.state !== 'sleep' && a.state !== 'sick' && a.state !== 'fight') a.state = 'idle';
      a.st = rng.range(0.5, 3); a.tx = a.x; a.tz = a.z; a.speed = 0;
    }
    initDerived();
    if (Z.Power) Z.Power.afterLoad();   // power package: default state of old saves, derive the grid (before moats and enclosures)
    if (Z.Moats) Z.Moats.afterLoad ? Z.Moats.afterLoad() : Z.Moats.update();   // moats package: derive ditch networks & water supply (before enclosures)
    recomputeEnclosures();
    // drop any fights whose participants no longer exist after loading
    for (k = S.fights.length - 1; k >= 0; k--) {
      var lf = S.fights[k];
      lf.attackers = (lf.attackers || []).filter(function (id) { return RT.aById.has(id); });
      lf.defenders = (lf.defenders || []).filter(function (id) { return RT.aById.has(id); });
      if (!lf.attackers.length || !lf.defenders.length) {
        lf.attackers.concat(lf.defenders).forEach(function (id) { var ra = RT.aById.get(id); if (ra) { ra.fid = 0; if (ra.state === 'fight') ra.state = 'idle'; } });
        S.fights.splice(k, 1);
      }
    }
    for (k = 0; k < S.staff.length; k++) { var s = S.staff[k]; s.tk = null; s.route = null; s.ri = 0; s.wt = rng.next(); s.speed = 0; s.state = 'idle'; s.ti = tileOf(s.x, s.z); }
    if (Z.Monorail) Z.Monorail.afterLoad();   // monorail package: default fields of old saves, relink riders, derive the track graph
    if (Z.Realms) { Z.Realms.afterLoad(); Z.Realms.update(); }   // realms package: default state of old saves, derive towers and zones
    if (Z.Safari) Z.Safari.afterLoad();   // safari package: riders relink, derived routes and zones (after realms and enclosures)
    if (Z.News) Z.News.afterLoad();   // news package
    secondly();
    S.staff.forEach(function (s) { if (s.type === 'scientist') s.pv = -1; });
    bus.emit('reset');
    return true;
  }

  // ====================== QUERIES ======================
  function enclosureAt(i, j) { return Z.inb(i, j) ? encOfTile(i + j * N) : null; }
  function walkable(i, j) { return Z.inb(i, j) && S.path[i + j * N] > 0; }

  function enclosureReport(encId, extraSpecies) {
    var e = encById(encId); if (!e) return null;
    var E = RT.encx[e.id], out = { id: e.id, name: e.name, area: e.area, minFence: e.minFence, see: e.see, poop: e.poop, foodLevel: e.foodLevel, waterLevel: e.waterLevel,
      species: {}, suitability: {}, issues: [], animals: e.animals.length, viewTiles: e.viewTiles.length,
      relief: E.relief || 0, cliffTiles: E.cliffs || 0, plantsThriving: E.thrive || 0, plantsStruggling: E.struggle || 0 };
    var bySp = {}, k; for (k in E.bySp) bySp[k] = E.bySp[k];
    if (extraSpecies && SP[extraSpecies] && !bySp[extraSpecies]) bySp[extraSpecies] = 0;
    if (extraSpecies && bySp[extraSpecies] !== undefined && E.bySp[extraSpecies]) bySp[extraSpecies] = E.bySp[extraSpecies] + 1;
    for (var sp in bySp) {
      var r = suitFor(e, E, sp, bySp[sp] || 1), name = SP[sp].name;
      out.species[sp] = { suitability: r.value, count: E.bySp[sp] || 0, breakdown: { terrain: r.terrain, space: r.space, foliage: r.foliage, water: r.water, shelter: r.shelter, rocks: r.rocks, social: r.social, clean: r.clean, carcass: r.carcass, enrichment: r.enrichment }, issues: r.issues };
      out.suitability[sp] = r.value;
      for (k = 0; k < r.issues.length; k++) out.issues.push(name + ': ' + r.issues[k]);
    }
    var cm = compatibleReport(e); if (cm) out.issues.push(cm);
    if (e.animals.length && !e.viewTiles.length) { out.noAccess = true; out.issues.unshift(noAccessMsg(e)); }   // QA: keepers need a path (or pier / walkway) within 3 tiles
    else if (e.animals.length && e.viewTiles.length) {
      var keepers = S.staff.filter(function (st) { return st.type === 'keeper'; });
      if (keepers.length) {
        var anyReach = false, anyCover = false;
        for (k = 0; k < keepers.length; k++) {
          var ks = keepers[k], kc = RT.comp[ks.ti];
          if (encReachesComp(e, kc)) { anyReach = true; if (keeperCoversEnc(ks, e)) { anyCover = true; break; } }
        }
        if (!anyReach) { out.noRangerRoute = true; out.issues.unshift('Keepers cannot reach this enclosure from their paths. Hire a ranger on this path network or connect it.'); }
        else if (!anyCover) { out.outOfRange = true; out.issues.unshift('Out of ranger range (' + keeperBaseRangeTiles() + ' tiles): hire a ranger closer or build a Ranger station within ' + RANGER_HUT_TILES + ' tiles.'); }
      }
      var vets = S.staff.filter(function (st) { return st.type === 'vet'; });
      if (vets.length && e.animals.some(function (id) { return vetNeedsAnimal(RT.aById.get(id)); })) {
        if (!vets.some(function (v) { return encReachesComp(e, RT.comp[v.ti]); })) {
          out.noVetRoute = true;
          out.issues.unshift('Vets cannot reach this enclosure from their paths. Hire a vet on this path network or connect it.');
        }
      }
    }
    if (Z.Moats) out.moat = Z.Moats.report(e, out.issues);
    if (Z.Realms) out.realm = Z.Realms.report(e, out.issues);   // realms package: kind, containment status, tank/dome/zone details   // moats package: boundary mix, per-species containment
    return out;
  }
  function noAccessMsg(e) {
    var water = e.kind === 'tank' || e.realm === 'sea' || e.kind === 'pen';
    return 'Keepers cannot reach this enclosure: no path' + (water ? ', pier or walkway' : '') + ' within 3 tiles. Its animals will not be fed, watered or cleaned for' + ' and will starve. Lay a path' + (water ? ', pier or tunnel' : '') + ' beside it.';
  }
  function compatibleReport(e) {
    if (!e || !e.species || e.species.length <= 1) return null;
    var preds = 0, prey = 0;
    for (var k = 0; k < e.species.length; k++) {
      if (isPredator(SP[e.species[k]])) preds++; else prey++;
    }
    if (!preds) return null;
    if (prey && preds > 1) return 'Predators are sharing with prey and rival predators — hunts and territorial fights may occur!';
    if (prey) return 'Predators are sharing with smaller or non-predator species — they may hunt!';
    return 'Rival predator species are sharing this enclosure — territorial fights may occur!';
  }
  function animalReport(id) {
    var a = RT.aById.get(id); if (!a) return null;
    var sp = SP[a.species], iss = [];
    if (a.state === 'escaped') iss.push('Escaped! Security or rangers must recapture it');
    if (a.state === 'fight') iss.push('In a fight!');
    if (a.sick) iss.push('Unwell and needs a vet');
    if (a.injured) iss.push('Injured and needs a vet');
    if (a.hunger > 70) iss.push('Hungry'); if (a.thirst > 70) iss.push('Thirsty'); if (a.energy < 25) iss.push('Tired');
    if (a.health < 40) iss.push('Poor health');
    var enc = a.enc ? RT.eMap[a.enc] : null;
    if (enc) {
      if (vetNeedsAnimal(a)) {
        var vetsA = S.staff.filter(function (st) { return st.type === 'vet'; });
        if (vetsA.length && (!enc.viewTiles.length || !vetsA.some(function (v) { return encReachesComp(enc, RT.comp[v.ti]); }))) {
          iss.push('Vets cannot reach this enclosure (check path, pier or bridge access)');
        }
      }
      var E = RT.encx[enc.id], r = suitFor(enc, E, a.species, E.bySp[a.species] || 1);
      for (var k = 0; k < r.issues.length; k++) iss.push(r.issues[k]);
      if (enc.foodLevel < 0.15) iss.push('Food has run out');
      if (enc.waterLevel < 0.15 && !E.water.length && !E.moatN) iss.push('Water has run out');
    }
    return { id: a.id, name: a.name, species: a.species, speciesName: sp.name, sex: a.sex, age: a.age, baby: a.baby, state: a.state, injured: !!a.injured, enclosure: enc ? enc.name : null,
      needs: { hunger: a.hunger, thirst: a.thirst, energy: a.energy, health: a.health, happiness: a.happiness }, suitability: enc ? (enc.suitability[a.species] || 0) : 0, issues: iss, fact: sp.fact,
      genomeQ: aQ(a), traits: (a.traits || []).slice(), lifespan: aLife(a), appeal: aAppeal(a), danger: aDanger(a), minFence: aMinFence(a), sickMul: aSickMul(a), breedMul: aBreedMul(a),
      quality: aQ(a) >= 95 ? 'Magnificent' : aQ(a) >= 80 ? 'Excellent' : aQ(a) >= 65 ? 'Good' : 'Fragile' };
  }
  function guestReport(id) {
    var g = RT.gById.get(id); if (!g) return null;
    return { id: g.id, name: g.name, state: g.state, thought: g.thought, money: g.money, happiness: g.happiness, needs: { hunger: g.hunger, thirst: g.thirst, bladder: g.bladder, energy: g.energy, fun: g.fun } };
  }
  function objectReport(id) {
    var o = RT.oById.get(id); if (!o) return null;
    var def = o.kind === 'building' ? BD[o.type] : SC[o.type], issues = [], connected = true, moatInfo = null;
    if (o.kind === 'building') {
      connected = def.utility ? true : buildingConnected(o);
      if (!connected) issues.push('Its entrance (front) must touch a path');
      if (def.moat && Z.Moats) { var mi = Z.Moats.objectInfo(o.id); if (mi) { moatInfo = mi; for (var mk = 0; mk < mi.issues.length; mk++) issues.push(mi.issues[mk]); } }
      if (o.type === 'hatchery' && S.research.eggs.length) issues.push(S.research.eggs.length + ' egg(s) incubating');
    }
    var q = RT.bq[o.id], thriving = null, thrivesOn = null, hereName = null;
    if (o.kind === 'scenery' && def.terrains) {
      thriving = plantThrives(o, def); thrivesOn = def.terrains.map(function (id) { return D.terrain[TI[id]].name; });
      hereName = D.terrain[S.terrain[o.i + o.j * N]].name;
      if (thriving === false) issues.push('Struggling on ' + hereName.toLowerCase() + ' - ' + (def.waterEdge ? 'prefers mud or meadow beside water' : 'prefers ' + thrivesOn.join(', ').toLowerCase()));
    }
    return { thriving: thriving, thrivesOn: thrivesOn, terrainHere: hereName, info: def.info || '', id: o.id, kind: o.kind, type: o.type, name: def.name, utility: !!def.utility, connected: connected, issues: issues, front: frontList(objFootprint(o)), price: o.price, defaultPrice: def.price, uses: o.uses || 0, income: o.income || 0,
      queue: q ? q.q.length : 0, users: q ? q.use : 0, fill: o.fill, upkeep: def.upkeep || 0, moat: moatInfo, needsPower: !!def.needsPower };
  }
  // structured, code-derived habitat facts for the Guide screen
  function habitatGuide() {
    var plants = [], additions = [], species = [], k, sp;
    function names(list) { return list.map(function (id) { return SP[id].name; }); }
    D.scenery.forEach(function (sc) {
      var likedBy = D.animals.filter(function (a) { return a.foliage.indexOf(sc.id) >= 0; }).map(function (a) { return a.name; });
      if (sc.terrains) plants.push({ id: sc.id, name: sc.name, terrains: sc.terrains.map(function (id) { return D.terrain[TI[id]].name; }), likedBy: likedBy, waterEdge: !!sc.waterEdge, emoji: sc.emoji, info: sc.info || '' });
      if (sc.inEnclosure !== false && sc.info) {
        var needed = [];
        D.animals.forEach(function (a) {
          if ((sc.kind === 'shelter' && a.needsShelter) || (sc.kind === 'rock' && a.needsRocks && sc.id !== 'ice_floe') || (sc.id === 'ice_floe' && a.needsRocks) || (sc.id === 'carcass_feeder' && a.predator)) needed.push(a.name);
        });
        additions.push({ id: sc.id, name: sc.name, kind: sc.kind, info: sc.info, neededBy: needed, likedBy: likedBy, emoji: sc.emoji, cost: sc.cost });
      }
    });
    D.animals.forEach(function (a) {
      var prefs = [], psum = 0, id;
      for (id in a.terrainPrefs) if (id !== 'water' || a.needsWater) { psum += a.terrainPrefs[id]; prefs.push([id, a.terrainPrefs[id]]); }
      prefs.sort(function (x, y) { return y[1] - x[1]; });
      var needs = [];
      if (a.needsWater) needs.push('Water (6% of enclosure)');
      if (a.needsShelter) needs.push('Shelter (1 per 30 tiles)');
      if (a.needsRocks) needs.push('Rocks (1 per 24 tiles; rugged ground helps)');
      if (a.predator) needs.push('Carcass feeder');
      needs.push('Herd of ' + a.social[0] + '-' + a.social[1]);
      needs.push('Enrichment toys (1 per 40 tiles)');
      species.push({
        id: a.id, name: a.name, emoji: a.emoji, predator: !!a.predator,
        terrain: prefs.map(function (p) { return D.terrain[TI[p[0]]].name + ' ' + Math.round(p[1] / (psum || 1) * 100) + '%'; }).join(', '),
        plants: a.foliage.map(function (f) { return SC[f] ? SC[f].name : f; }), plantIds: a.foliage.slice(),
        needs: needs, space: a.space, minFence: a.minFence
      });
    });
    return { weights: JSON.parse(JSON.stringify(HW)), plants: plants, additions: additions, species: species };
  }
  function footprintOf(type, i, j, rot) {
    var dk = defOf(type); if (!dk) return null;
    var fp = footprint(dk.def, i, j, rot || 0);
    return { i0: fp.i0, j0: fp.j0, w: fp.w, h: fp.h, rot: fp.rot, cx: (fp.i0 + fp.w / 2) * TILE, cz: (fp.j0 + fp.h / 2) * TILE, front: frontList(fp) };
  }
  function suitabilityFor(encId, speciesId) {
    var e = encById(encId), E = e && RT.encx[encId]; if (!e || !SP[speciesId]) return null;
    return suitFor(e, E, speciesId, (E.bySp[speciesId] || 0) + 1);
  }

  Z.Sim = {
    newGame: newGame, tick: tick, save: save, load: load,
    terraform: terraform, heightAt: heightAt, tileSlope: tileSlope, isCliff: isCliff, inMap: inMap, maps: function () { return D.maps; }, habitatGuide: habitatGuide,
    paintTerrain: paintTerrain, placePath: placePath, placeFence: placeFence, removeFence: removeFence, placeObject: placeObject, bulldoze: bulldoze,
    undo: undo, canUndo: canUndo, beginStroke: beginStroke, endStroke: endStroke, research: researchAPI,
    addAnimal: addAnimal, sellAnimal: sellAnimal, moveAnimal: moveAnimal, hireStaff: hireStaff, fireStaff: fireStaff, rangerCoverage: rangerCoverage,
    setTicketPrice: setTicketPrice, setPrice: setPrice, takeLoan: takeLoan, repayLoan: repayLoan, loanQuote: loanQuote, loanSummary: loanSummary, startMarketing: startMarketing, renameEnclosure: renameEnclosure, setSpeed: setSpeed,
    enclosureAt: enclosureAt, enclosureReport: enclosureReport, animalReport: animalReport, ratingBreakdown: ratingBreakdown, isUnlocked: isUnlocked, walkable: walkable,
    // extras
    lockdown: function () { return !!(RT && RT.lockdown); },
    forceNext: function (kind, v) { RT.force = RT.force || {}; RT.force[kind] = v; },
    spawnAnimal: function (speciesId, i, j, opts) { opts = opts || {}; var t = i + j * N, enc = encOfTile(t); var a = makeAnimal(speciesId, enc, cxOf(t), czOf(t), !!opts.baby, opts.sex, opts.q === undefined ? Math.max(50, genomeOf(speciesId)) : opts.q, S.research.traits[speciesId]); insertAnimal(a); return a; },
    objectReport: objectReport, guestReport: guestReport, footprint: footprintOf, suitabilityFor: suitabilityFor, setOpen: setOpen, isOpenNow: function () { return openNow(); },
    isSea: function (i, j) { return Z.inb(i, j) && !!seaMask()[i + j * N]; }, waterKind: waterKind, seaMask: seaMask, shoreDist: shoreDist, previewMap: previewMap,
    resolveSizeN: resolveSizeN, mapBounds: function (mapId, mapSize) { return scaleMapDef(mapDef(mapId), resolveSizeN(mapSize)).bounds; },
    isFresh: function (i, j) { return waterKind(i, j) === 'fresh'; }, isIsland: function () { return !!(S.map && S.map.island); },
    arrivalRate: function () { return RT.rate; }, adultAge: function (id) { return adultAge(SP[id]); }, MARKETING_COST: MARKETING_COST, MAX_GUESTS: MAX_GUESTS, DAY_SECONDS: DAY_SECONDS,
    weatherInfo: function () { return weatherInfo(); }, activeEvents: function () { return S.activeEvents.slice(); }, applyDifficulty: function (id, fresh) { return applyDifficulty(id, fresh); },
    difficultyInfo: function () { return { id: S.difficulty, income: DIFF.income, costs: DIFF.costs, arrivals: DIFF.arrivals, interest: DIFF.interest }; },
    _fireEvent: function (id) { return fireEvent(id); }, _setWeather: function (type, intensity, hours) { setWeather(type, intensity === undefined ? 1 : intensity, hours || 6); }, _wx: function () { return WX; },
    _rt: function () { return RT; }, _step: function (dt) { step(dt); },
    _combat: {
      isPredator: isPredator, isPackHunter: isPackHunter, animalBulk: animalBulk, combatPower: combatPower,
      gatherPack: gatherPack, packPower: packPower, findPrey: findPrey, findRivalPredator: findRivalPredator,
      startFight: startFight, vetNeedsAnimal: vetNeedsAnimal
    }
  };
  // headless safety: create a game on load if Z.DATA exists so Z.state is never null
  newGame({ seed: 1 });
})();


