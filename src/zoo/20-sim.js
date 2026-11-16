// ===== 20-sim.js =====
var window = typeof window!=='undefined' ? window : globalThis; window.Z = window.Z || {}; var Z = window.Z;
(function () {
  'use strict';
  var N = Z.N, TILE = Z.TILE, NN = N * N, bus = Z.bus, rng = Z.rng;
  var D = Z.DATA;
  var DAY_SECONDS = 150, OPEN_T = 8 / 24, CLOSE_T = 20 / 24, MAX_GUESTS = 340, MAX_ENC_TILES = 600, VERSION = 1;
  var INF = 65535;
  var PI = Math.PI, TAU = Math.PI * 2;
  var DT4 = [-N, 1, N, -1];
  var GATE_I0 = 27, GATE_J = N - 1;

  // Live weather/difficulty modifiers.
  var WX = {
    type: 'clear', intensity: 0.6,
    arrivals: 1, adm: 1,
    thirst: 1, hunger: 1, energy: 1,
    guestSpeed: 1, speed: 1,
    fun: 0, spend: 1,
    shelter: false, wet: false,
    animalMood: 0, sick: 1, escape: 1, dirt: 1
  };
  // Difficulty modifiers.
  var DIFF = { id: 'normal', income: 1, costs: 1, arrivals: 1, interest: 0.004, money: 22000 };
  var EV = { amber: 1, income: 1, feedCost: 1 };

  function diff(key) {
    if (key) return DIFF[key] !== undefined ? DIFF[key] : 1;
    return DIFF;
  }

  // ---- lookups ----
  var TI = {}, FI = {}, PI_ = {}, SP = {}, SC = {}, BD = {}, STF = {};
  function reindex() {
    D = Z.DATA; TI = {}; FI = {}; PI_ = {}; SP = {}; SC = {}; BD = {}; STF = {};
    D.terrain.forEach(function (t, k) { TI[t.id] = k; });
    D.fences.forEach(function (t, k) { FI[t.id] = k + 1; });
    D.paths.forEach(function (t, k) { PI_[t.id] = k + 1; });
    D.animals.forEach(function (a) { a.upkeep = a.upkeep !== undefined ? a.upkeep : a['upkeep/day']; SP[a.id] = a; });
    D.scenery.forEach(function (a) { SC[a.id] = a; });
    D.buildings.forEach(function (a) { BD[a.id] = a; });
    D.staff.forEach(function (a) { a.wage = a.wage !== undefined ? a.wage : a['wage/day']; STF[a.id] = a; });
  }
  reindex();
  var WATER = TI.water;

  var S = null;           // current state (== Z.state)
  var RT = null;          // runtime (non-serialised) data

  function newRT() {
    var undoStack = [];
    return {
      fields: {}, pathVer: 1, nb: new Uint8Array(NN), pathTiles: [], block: new Uint8Array(NN), shelter: new Uint8Array(NN),
      gById: new Map(), aById: new Map(), sById: new Map(), oById: new Map(),
      encx: {}, bq: {}, benchOcc: {}, byType: { food: [], drink: [], toilet: [], fun: [], bench: [], bin: [] },
      t1: 0, t2: 0, escAcc: 0, arrAcc: 0, rate: 0.3, arrMul: 1, arrMulT: 0, pendingSpawn: 0,
      escaped: [], guides: [], secCount: 0, keeperCount: 0, vetCount: 0, hasHut: false, hasVet: false, hasEdu: false,
      advice: {}, claim: {}, groupLead: new Map(), nextGroup: 1, dirtyCount: 0, ghEMA: 65, value: 10,
      queue: new Int32Array(NN), prev: new Int32Array(NN), stamp: new Int32Array(NN), stampN: 0, binVer: 0,
      pathMask: null, gh: 65, accSim: 0, eMap: {}, guestCrowd: 0, speciesCount: 0,
      undo: undoStack, undoStack: undoStack, stroke: null, curEntry: null, strokeDepth: 0,
      bunkers: [], allBunkers: [], dangerEsc: 0, lockdown: false, hunters: {}, undoBusy: false,
      gstand: new Uint8Array(NN), gtarg: new Uint8Array(NN), gvd: {}, wbuf: [], gload: {}
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
  function openNow() { return S.open && S.time >= OPEN_T && S.time < CLOSE_T; }
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
    if (cat === 'tickets' || cat === 'food' || cat === 'shops' || cat === 'donations') {
      var incMul = (DIFF.income || 1) * (EV.income || 1);
      if (incMul !== 1) amount = Math.round(amount * incMul * 100) / 100;
    }
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
    var m = S && S.map; if (!m) return Z.inb(i, j);
    return i >= m.i0 && i <= m.i1 && j >= m.j0 && j <= m.j1;
  }
  function mapBounds() {
    var m = S && S.map;
    if (m && typeof m.i0 === 'number') return { i0: m.i0, j0: m.j0, i1: m.i1, j1: m.j1, w: m.i1 - m.i0 + 1, h: m.j1 - m.j0 + 1 };
    return { i0: 0, j0: 0, i1: N - 1, j1: N - 1, w: N, h: N };
  }
  function slopeOfT(t, E) {
    if (!E) return 0;
    var i = t % N, j = (t - i) / N, c = i + j * EW, a = E[c], b = E[c + 1], d = E[c + EW], e = E[c + EW + 1];
    var mx = a > b ? a : b, mn = a < b ? a : b;
    if (d > mx) mx = d; if (d < mn) mn = d; if (e > mx) mx = e; if (e < mn) mn = e;
    return mx - mn;
  }
  function tileSlope(i, j) { return Z.inb(i, j) && S.elev ? slopeOfT(i + j * N, S.elev) : 0; }
  function isCliff(i, j) { return tileSlope(i, j) >= 3; }
  function cliffT(t) { return S.elev ? slopeOfT(t, S.elev) >= 3 : false; }
  function cornerElev(i, j) { return S && S.elev && i >= 0 && j >= 0 && i <= N && j <= N ? S.elev[j * (N + 1) + i] : 0; }
  function heightAt(x, z) {
    var u = x / TILE, v = z / TILE;
    if (u < 0) u = 0; else if (u > N) u = N; if (v < 0) v = 0; else if (v > N) v = N;
    var i = Math.min(N - 1, Math.floor(u)), j = Math.min(N - 1, Math.floor(v)), fu = u - i, fv = v - j, E = S.elev, c = i + j * EW;
    if (!E) return 0;
    var h = E[c] * (1 - fu) * (1 - fv) + E[c + 1] * fu * (1 - fv) + E[c + EW] * (1 - fu) * fv + E[c + EW + 1] * fu * fv;
    return h * Z.ELEV_STEP;
  }
  function entranceTile(i, j) { return i >= 22 && i <= 33 && j >= 39; }
  function footprintFlat(fp, maxSlope) {
    if (!S.elev) return true;
    var mn = 99, mx = -99;
    for (var b = 0; b <= fp.h; b++) for (var a = 0; a <= fp.w; a++) {
      var h = S.elev[(fp.i0 + a) + (fp.j0 + b) * EW]; if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return mx - mn <= maxSlope;
  }
  function aDanger(a) {
    if (!a || !SP[a.species]) return 0;
    return SP[a.species].danger || 0;
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
  function edgeTiles(edge) {
    var a, b;
    if (edge.axis === 'x') { a = edge.j > 0 ? edge.i + (edge.j - 1) * N : -1; b = edge.j < N ? edge.i + edge.j * N : -1; }
    else { a = edge.i > 0 ? (edge.i - 1) + edge.j * N : -1; b = edge.i < N ? edge.i + edge.j * N : -1; }
    return [a, b];
  }

  function rebuildNav() {
    var nb = RT.nb, pt = RT.pathTiles; pt.length = 0;
    var pp = RT.navP || (RT.navP = new Uint8Array(NN)), E = S.elev;
    for (var q = 0; q < NN; q++) pp[q] = S.path[q] && slopeOfT(q, E) < 3 ? 1 : 0;   // cliff tiles are impassable
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var t = i + j * N, m = 0;
      if (pp[t]) {
        pt.push(t);
        if (j > 0 && pp[t - N] && !S.fenceX[t]) m |= 1;
        if (i < N - 1 && pp[t + 1] && !S.fenceZ[(i + 1) + j * (N + 1)]) m |= 2;
        if (j < N - 1 && pp[t + N] && !S.fenceX[t + N]) m |= 4;
        if (i > 0 && pp[t - 1] && !S.fenceZ[i + j * (N + 1)]) m |= 8;
      }
      nb[t] = m;
    }
    RT.pathVer++; RT.fields = {};
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
    if (ch === 'b') { o = RT.oById.get(+key.slice(1)); return o ? adjacentPathTiles(o) : null; }
    if (ch === 'e') { var e = encById(+key.slice(1)); return e ? e.viewTiles : null; }
    if (ch === 't') { var tt = +key.slice(1); return S.path[tt] ? [tt] : null; }
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
    RT.hasHut = false; RT.hasVet = false; RT.hasEdu = false;
    RT.bunkers = []; RT.allBunkers = [];
    S.tileObj.fill(0);
    for (var k = 0; k < S.objects.length; k++) {
      var o = S.objects[k]; RT.oById.set(o.id, o);
      var fp = objFootprint(o), def, solid = false, shelter = false;
      if (o.kind === 'building') {
        def = BD[o.type]; solid = true;
        if (def.type === 'food') bt.food.push(o); else if (def.type === 'drink') bt.drink.push(o);
        else if (def.type === 'toilet') bt.toilet.push(o);
        else if (def.type === 'shop' || def.type === 'ride' || def.type === 'info') { if (o.type !== 'emergency_bunker') bt.fun.push(o); }
        if (o.type === 'emergency_bunker') { RT.bunkers.push(o); RT.allBunkers.push(o); }
        if (o.type === 'keeper_hut') RT.hasHut = true; if (o.type === 'vet_clinic') RT.hasVet = true; if (o.type === 'education_centre') RT.hasEdu = true;
      } else {
        def = SC[o.type];
        solid = def.kind === 'tree' || def.kind === 'rock' || o.type === 'climbing_frame' || o.type === 'tyre_swing';
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
    var ap = adjacentPathTiles(o);
    if (!ap.length) return false;
    var f = getField('exit');
    if (!f) return false;
    for (var k = 0; k < ap.length; k++) if (f[ap[k]] < INF) return true;
    return false;
  }

  // ---- enclosures ----
  function encById(id) { return RT.eMap[id] || null; }
  function encOfTile(t) { var id = S.tileEnc[t]; return id ? encById(id) : null; }

  function recomputeEnclosures() {
    var old = S.enclosures || [], oldMap = {}, k;
    for (k = 0; k < old.length; k++) oldMap[old[k].id] = old[k];
    var visited = new Uint8Array(NN), newEncs = [], nextEncId = 1;
    for (k = 0; k < old.length; k++) if (old[k].id >= nextEncId) nextEncId = old[k].id + 1;
    S.tileEnc.fill(0);
    RT.encx = {}; RT.eMap = {};

    var stack = [];
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var start = i + j * N;
      if (visited[start] || S.path[start]) continue;
      // flood fill candidate region bounded by fences
      stack.length = 0; stack.push(start); visited[start] = 1;
      var tiles = [], leaks = false;
      while (stack.length) {
        var t = stack.pop(); tiles.push(t);
        if (tiles.length > MAX_ENC_TILES) { leaks = true; break; }
        var ti = t % N, tj = (t - ti) / N, n;
        // north (j - 1)
        if (tj === 0) { if (!S.fenceX[t]) leaks = true; }
        else if (!S.fenceX[t]) { n = t - N; if (!visited[n] && !S.path[n]) { visited[n] = 1; stack.push(n); } }
        // south (j + 1)
        if (tj === N - 1) { if (!S.fenceX[t + N]) leaks = true; }
        else if (!S.fenceX[t + N]) { n = t + N; if (!visited[n] && !S.path[n]) { visited[n] = 1; stack.push(n); } }
        // west (i - 1)
        if (ti === 0) { if (!S.fenceZ[ti + tj * (N + 1)]) leaks = true; }
        else if (!S.fenceZ[ti + tj * (N + 1)]) { n = t - 1; if (!visited[n] && !S.path[n]) { visited[n] = 1; stack.push(n); } }
        // east (i + 1)
        if (ti === N - 1) { if (!S.fenceZ[(ti + 1) + tj * (N + 1)]) leaks = true; }
        else if (!S.fenceZ[(ti + 1) + tj * (N + 1)]) { n = t + 1; if (!visited[n] && !S.path[n]) { visited[n] = 1; stack.push(n); } }
      }
      if (leaks || tiles.length < 9) continue;
      // find existing matching enclosure
      var match = null;
      for (k = 0; k < tiles.length; k++) {
        var prevId = oldMap ? 0 : 0; // look for overlap with old enclosures
        for (var oid in oldMap) {
          var oe = oldMap[oid];
          if (oe && oe.tiles && oe.tiles.indexOf(tiles[k]) >= 0) { match = oe; delete oldMap[oid]; break; }
        }
        if (match) break;
      }
      var eid = match ? match.id : nextEncId++;
      var name = match ? match.name : ('Enclosure ' + eid);
      var enc = { id: eid, name: name, tiles: tiles, area: tiles.length, minFence: 99, see: 1, poop: match ? match.poop : 0, foodLevel: match ? match.foodLevel : 1, waterLevel: match ? match.waterLevel : 1, breach: match ? match.breach : 0, animals: [], species: [], suitability: {}, viewTiles: [] };
      for (k = 0; k < tiles.length; k++) S.tileEnc[tiles[k]] = eid;
      newEncs.push(enc); RT.eMap[eid] = enc;
    }
    S.enclosures = newEncs;
    // build geometry
    for (var r = 0; r < newEncs.length; r++) {
      var e = newEncs[r];
      var E = buildEncGeom(e);
      RT.encx[e.id] = E;
      e.minFence = E.minS === 99 ? 1 : E.minS;
      e.see = E.cnt ? E.seeSum / E.cnt : 0.5;
      // view tiles
      var seenV = {}, vt = [];
      for (k = 0; k < E.out.length; k++) {
        var ot = E.out[k];
        if (S.path[ot] && !seenV[ot]) { seenV[ot] = 1; vt.push(ot); }
      }
      e.viewTiles = vt;
    }
    refreshEncAnimals();
    for (r = 0; r < newEncs.length; r++) encStats(newEncs[r]);
    RT.fields = {};
    bus.emit('enclosures');
  }

  // does a plant thrive where it stands? true / false for trees and bushes, null for everything else
  function plantThrives(o, sd) {
    if (!sd) sd = SC[o.type];
    if (!sd || (sd.kind !== 'tree' && sd.kind !== 'bush') || !sd.terrains) return null;
    var t = o.i + o.j * N, tid = S.terrain[t], tn = D.terrain[tid] ? D.terrain[tid].id : null;
    if (!tn || sd.terrains.indexOf(tn) < 0) return false;
    if (sd.waterEdge) {
      var i = o.i, j = o.j;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
        var x = i + di, y = j + dj; if (Z.inb(x, y) && S.terrain[x + y * N] === WATER) return true;
      }
      return false;
    }
    return true;
  }
  function plantOk(o, enc) {
    if (!o) return true;
    if (typeof o === 'number') o = RT.oById.get(o);
    if (!o) return true;
    var th = plantThrives(o, SC[o.type] || o);
    return th !== false;
  }

  function buildEncGeom(enc) {
    var E = { feed: -1, drink: [], water: [], shelter: [], toy: [], out: [], terr: new Array(D.terrain.length), fol: {}, trees: 0, rocks: 0, shelters: 0, aes: 0, blocked: 0,
      cliffs: 0, relief: 0, thrive: 0, struggle: 0, vis: 0, happy: 60, babies: 0, appeal: 0, nAn: 0, bySp: {} };
    enc.badPlants = 0;
    var k, t, d, tiles = enc.tiles;
    for (k = 0; k < E.terr.length; k++) E.terr[k] = 0;
    var minS = 99, seeSum = 0, cnt = 0, slopeSum = 0;
    var best = 1e9, bi = -1;
    for (k = 0; k < tiles.length; k++) {
      t = tiles[k]; var i = t % N, j = (t - i) / N;
      E.terr[S.terrain[t]]++;
      if (S.terrain[t] === WATER) E.water.push(t);
      if (RT.shelter[t]) E.shelter.push(t);
      var oid = S.tileObj[t];
      if (oid) {
        var o = RT.oById.get(oid);
        if (o && o.kind === 'scenery') {
          var sd = SC[o.type];
          if (o.i === i && o.j === j) {
            var th = plantThrives(o, sd);   // liked plants count 1.0 where they thrive, 0.5 where they struggle
            E.fol[o.type] = (E.fol[o.type] || 0) + (th === false ? 0.5 : 1);
            E.aes += sd.aesthetic;
            if (th === true) E.thrive++;
            else if (th === false) { E.struggle++; enc.badPlants = (enc.badPlants || 0) + 1; }
            if (sd.kind === 'tree' || sd.kind === 'bush') E.trees++;
            if (sd.kind === 'rock') E.rocks++;
            if (sd.kind === 'shelter') E.shelters++;
            if (sd.kind === 'toy') E.toy.push(t);
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
        var fd = D.fences[f - 1];
        if (fd.strength < minS) minS = fd.strength;
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
        t = tiles[k]; if (S.terrain[t] === WATER || RT.block[t]) continue;
        var ii = t % N, jj = (t - ii) / N;
        if ((ii > 0 && S.terrain[t - 1] === WATER) || (ii < N - 1 && S.terrain[t + 1] === WATER) || (jj > 0 && S.terrain[t - N] === WATER) || (jj < N - 1 && S.terrain[t + N] === WATER)) E.drink.push(t);
      }
    }
    E.minS = minS; E.seeSum = seeSum; E.cnt = cnt;
    return E;
  }

  function refreshEncAnimals() {
    for (var k = 0; k < S.enclosures.length; k++) { S.enclosures[k].animals.length = 0; S.enclosures[k].species.length = 0; }
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k];
      if (a.state === 'escaped') { a.enc = 0; continue; }
      var t = tileOf(a.x, a.z), eid = S.tileEnc[t];
      a.enc = eid;
      if (eid && RT.eMap[eid]) {
        var enc = RT.eMap[eid];
        enc.animals.push(a.id);
        if (enc.species.indexOf(a.species) < 0) enc.species.push(a.species);
      }
    }
  }

  var HW = { terrain: 0.22, space: 0.2, foliage: 0.12, water: 0.14, shelter: 0.1, rocks: 0.06, social: 0.1, clean: 0.06 };
  var ISSUE_TERR = {};
  function suitFor(enc, E, spId, n) {
    var sp = SP[spId], area = enc.area, k, iss = [];
    if (n < 1) n = 1;
    // terrain
    var prefs = sp.terrainPrefs, hasWaterPref = prefs.water > 0, tot = 0, tcounts = E.terr;
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
    if (terrain < 0.7) {
      var top = '', tv = 0; for (id in prefs) if (prefs[id] > tv) { tv = prefs[id]; top = id; }
      iss.push('Prefers ' + (D.terrain[TI[top]] ? D.terrain[TI[top]].name.toLowerCase() : top) + ' terrain');
    }
    // space
    var per = Math.max(0, area - E.blocked * 0.5) / n, space = clamp(per / sp.space, 0, 1);
    if (space < 0.8) iss.push(space < 0.5 ? 'Needs a much bigger enclosure' : 'Needs a bigger enclosure');
    // foliage
    var liked = 0; for (k = 0; k < sp.foliage.length; k++) liked += E.fol[sp.foliage[k]] || 0;
    var need = Math.max(2, Math.ceil(area / 16));
    var foliage = clamp(Math.min(1, liked / need) * 0.8 + Math.min(1, E.trees / need) * 0.2, 0, 1);
    if (foliage < 0.6) iss.push('Needs more of its favourite plants (' + sp.foliage.slice(0, 2).map(function (f) { return SC[f] ? SC[f].name.toLowerCase() : f; }).join(', ') + ')');
    if (E.struggle && foliage < 0.9) iss.push('Some plants are struggling on the wrong terrain');
    // water
    var water = 1, wN = 0, wW = 0;
    if (sp.needsWater) {
      wN = Math.max(2, Math.ceil(area * 0.06)); water = clamp(E.water.length / wN, 0, 1); wW = 0.14;
      if (water < 0.8) iss.push(E.water.length ? 'Needs more water' : 'Needs water');
    }
    var shelter = 1, sW = 0;
    if (sp.needsShelter) {
      sW = 0.1; shelter = clamp(E.shelters / Math.max(1, Math.ceil(area / 30)), 0, 1);
      if (shelter < 1) iss.push('Needs a shelter');
    }
    var rocks = 1, rW = 0;
    if (sp.needsRocks) {
      rW = 0.06; rocks = clamp(E.rocks / Math.max(1, Math.ceil(area / 24)), 0, 1);
      if (rocks < 1) iss.push('Needs rocks');
    }
    // social
    var social, mn = sp.social[0], mx = sp.social[1];
    if (n >= mn && n <= mx) social = 1;
    else if (n < mn) { social = 0.4 + 0.6 * (n / mn); iss.push('Needs more of its own kind (at least ' + mn + ')'); }
    else { social = Math.max(0.3, 1 - 0.2 * (n - mx)); iss.push('Too many of this species (max ' + mx + ')'); }
    var clean = clamp(1 - enc.poop / (area / 3 + 3), 0, 1);
    if (clean < 0.6) iss.push('Enclosure is dirty');
    var wts = 0.22 + 0.2 + 0.12 + wW + sW + rW + 0.1 + 0.06;
    var v = (terrain * 0.22 + space * 0.2 + foliage * 0.12 + water * wW + shelter * sW + rocks * rW + social * 0.1 + clean * 0.06) / wts;
    v = clamp(v, 0, 1);
    if (enc.minFence < sp.minFence) iss.push('Fence is too weak (needs strength ' + sp.minFence + ')');
    return { value: v, terrain: terrain, space: space, foliage: foliage, water: water, shelter: shelter, rocks: rocks, social: social, clean: clean, issues: iss };
  }

  function encStats(enc) {
    var E = RT.encx[enc.id]; if (!E) return;
    var bySp = {}, k;
    E.vis = 0; E.babies = 0; E.appeal = 0; E.happy = 0; E.nAn = 0;
    for (k = 0; k < enc.animals.length; k++) {
      var a = RT.aById.get(enc.animals[k]); if (!a) continue;
      bySp[a.species] = (bySp[a.species] || 0) + 1;
      E.nAn++; E.happy += a.happiness; E.appeal += a.appeal || (SP[a.species] ? SP[a.species].appeal * (a.baby ? 1.5 : 1) : 30);
      if (a.baby) E.babies++;
      if (a.state !== 'sleep' && a.state !== 'sick' && !RT.shelter[tileOf(a.x, a.z)]) E.vis++;
    }
    E.happy = E.nAn ? E.happy / E.nAn : 60;
    E.bySp = bySp;
    enc.badPlants = E.struggle || 0;
    enc.suitability = {};
    E.breakdown = {};
    for (var sp in bySp) {
      var r = suitFor(enc, E, sp, bySp[sp]);
      enc.suitability[sp] = r.value; E.breakdown[sp] = r;
    }
  }

  // ====================== ACTIONS ======================
  function isGateTile(i, j) { return j === GATE_J && (i === GATE_I0 || i === GATE_I0 + 1); }

  function afterWorldChange(navChanged) {
    if (navChanged) rebuildNav();
    rebuildObjects();
    RT.fields = {};
    recomputeEnclosures();
  }

  // ---- undo journal ----
  var UNDO_MAX = 40;
  function jBegin(label) {
    if (RT.undoBusy) return;
    if (!RT.stroke && !RT.curEntry) {
      RT.stroke = RT.curEntry = { label: label || 'Change', ops: [], net: 0 };
      RT.strokeDepth = 0;
    }
    RT.strokeDepth++;
  }
  function jEnd() {
    if (RT.undoBusy || (!RT.stroke && !RT.curEntry)) return;
    if (--RT.strokeDepth > 0) return;
    RT.strokeDepth = 0;
    var st = RT.stroke || RT.curEntry;
    RT.stroke = RT.curEntry = null;
    var stack = RT.undoStack || RT.undo;
    if (st.ops.length) {
      stack.push(st);
      if (stack.length > UNDO_MAX) stack.shift();
      bus.emit('undo:change', canUndo());
    }
  }
  function jOp(op) {
    var st = RT.stroke || RT.curEntry;
    if (RT.undoBusy || !st) return;
    st.ops.push(op);
    st.net += op.net || 0;
  }
  function beginStroke(label) { jBegin(label); }
  function endStroke() { jEnd(); }
  function canUndo() {
    var stack = (RT && (RT.undoStack || RT.undo)) || [];
    var n = stack.length;
    return { count: n, label: n ? stack[n - 1].label : '', refund: n ? Math.round(stack[n - 1].net || 0) : 0 };
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
  function terraform(a1, a2, a3, a4, a5, a6) {
    var dry = dryOf(arguments);
    var i, j, mode, radius, opts = {};
    if (typeof a3 === 'string') {
      i = a1; j = a2; mode = a3; radius = a4;
      opts = (a5 && typeof a5 === 'object') ? a5 : {};
    } else {
      i = a1 >= N ? Math.floor(a1 / TILE) : Math.floor(a1);
      j = a2 >= N ? Math.floor(a2 / TILE) : Math.floor(a2);
      radius = a3; mode = a4;
      opts = { target: a5, sharp: !!a6 };
      if (a5 && typeof a5 === 'object') opts = a5;
      else if (a6 && typeof a6 === 'object') opts = a6;
    }
    if (mode !== 'raise' && mode !== 'lower' && mode !== 'level' && mode !== 'smooth') return fail('Unknown terrain tool');
    if (!Z.inb(i, j) || !inMap(i, j)) return fail('Outside your land');
    radius = Math.max(0, +radius || 0);
    var E = S.elev, m = S.map || { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }, sharp = !!opts.sharp || radius <= 0, reach = radius + 0.8, cx = i + 0.5, cy = j + 0.5;
    var amp = radius >= 2 ? 2 : 1, rr = Math.ceil(reach) + 1, di, dj, k, c;
    var target = 0;
    if (mode === 'level') {
      if (typeof opts.target === 'number') target = opts.target;
      else target = Math.round((E[i + j * EW] + E[i + 1 + j * EW] + E[i + (j + 1) * EW] + E[i + 1 + (j + 1) * EW]) / 4);
      target = clamp(Math.round(target), ELEV_MIN, ELEV_MAX);
    }
    function locked(ci, cj) {
      if (ci < m.i0 || cj < m.j0 || ci > m.i1 + 1 || cj > m.j1 + 1) return true;
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
      if (h1 !== h0) { cs.push(c); old[c] = h0; nw[c] = h1; }
    }
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
    bus.emit('elev:change', { i0: i0, j0: j0, i1: i1, j1: j1 });
    afterWorldChange(true);
    return okr(cost);
  }

  function placePath(i, j, pathId, opts) {
    var dry = dryOf(arguments);
    var pid = PI_[pathId]; if (!pid) return fail('Unknown path type');
    if (!inMap(i, j)) return fail('Outside your land');
    var t = i + j * N;
    if (S.terrain[t] === WATER) return fail('Needs flat dry land');
    if (cliffT(t)) return fail('Too steep — level the ground first');
    if (S.tileObj[t]) return fail('Something is in the way');
    if (S.tileEnc[t]) return fail("Can't lay paths inside an enclosure");
    if (S.path[t] === pid) return fail('Already paved');
    var cost = D.paths[pid - 1].cost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    var oldp = S.path[t];
    S.path[t] = pid; spend(cost, 'construction');
    jBegin('Path'); jOp({ k: 'path', t: t, old: oldp, nw: pid, net: cost }); jEnd();
    bus.emit('path', { i0: i, j0: j, i1: i, j1: j });
    afterWorldChange(true);
    return okr(cost);
  }

  function fenceCheck(edge) {
    if (!edgeValid(edge)) return 'Outside the zoo';
    var ab = edgeTiles(edge), a = ab[0], b = ab[1];
    if (!((a >= 0 && inMap(a % N, Math.floor(a / N))) || (b >= 0 && inMap(b % N, Math.floor(b / N))))) return 'Outside your land';
    if (a >= 0 && b >= 0 && S.path[a] && S.path[b]) return "Can't fence across a path";
    if (a >= 0 && b >= 0 && S.tileObj[a] && S.tileObj[a] === S.tileObj[b]) return 'Blocked by a building';
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
    if (!edgeValid(edge)) return fail('Outside the zoo');
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
  function fenceInside(fp) {
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      if (a > 0 && S.fenceZ[i + j * (N + 1)]) return true;
      if (b > 0 && S.fenceX[i + j * N]) return true;
    }
    return false;
  }

  function placeObject(type, i, j, rot, opts) {
    var dry = dryOf(arguments);
    if (typeof rot !== 'number') rot = 0; rot = ((rot % 4) + 4) % 4;
    var dk = defOf(type); if (!dk) return fail('Unknown item');
    var def = dk.def, fp = footprint(def, i, j, rot);
    if (def.star > S.unlocked.star) return fail('Needs a ' + def.star + '-star zoo');
    var a, b, inEnc = false, warn = null;
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var x = fp.i0 + a, y = fp.j0 + b;
      if (!Z.inb(x, y) || !inMap(x, y)) return fail('Outside your land');
    }
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var t = (fp.i0 + a) + (fp.j0 + b) * N;
      if (S.tileObj[t]) return fail('Something is already here');
      if (S.path[t]) return fail('Clear the path first');
      if (S.terrain[t] === WATER && type !== 'ice_floe') return fail('Needs flat dry land');
      if (S.tileEnc[t]) inEnc = true;
    }
    if ((fp.w > 1 || fp.h > 1) && fenceInside(fp)) return fail('Blocked by a fence');
    if (dk.kind === 'building') {
      if (!footprintFlat(fp, 1)) return fail('Too steep — level the ground first');
      if (inEnc) return fail("Buildings can't go inside an enclosure");
      if (!adjacentPathExists(fp)) warn = 'Not connected to a path yet';
    } else {
      if (inEnc && def.inEnclosure === false) return fail("Can't place that inside an enclosure");
      if ((type === 'bench' || type === 'bin') && !adjacentPathExists(fp)) return fail('Place it next to a path');
    }
    var cost = def.cost;
    if (S.money < cost) return fail('Not enough money');
    var extra = {}; if (warn) extra.warn = warn;
    if (dry) return okr(cost, extra);
    var o = { id: newId(), kind: dk.kind, type: type, i: i, j: j, rot: rot };
    if (dk.kind === 'building') { o.price = def.price; o.uses = 0; o.income = 0; o.stock = 100; }
    if (type === 'bin') o.fill = 0;
    S.objects.push(o); spend(cost, 'construction');
    jBegin('Build ' + def.name); jOp({ k: 'obj+', id: o.id, net: cost }); jEnd();
    afterWorldChange(false);
    bus.emit('objectAdded', o);
    extra.id = o.id;
    return okr(cost, extra);
  }

  function removeObjectInternal(o) {
    var k = S.objects.indexOf(o); if (k >= 0) S.objects.splice(k, 1);
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
      var def = o.kind === 'building' ? BD[o.type] : SC[o.type], refund = Math.floor(def.cost * 0.5);
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
          if (W.terrain[t] === WATER) return 'That tile is now water';
          if (S.tileEnc[t]) return 'That tile is inside an enclosure now';
          if (slopeOfT(t, W.elev) > 2) return 'That ground is too steep now';
          var ti = t % N, tj = (t - ti) / N;
          if ((ti > 0 && W.path[t - 1] && W.fenceZ[ti + tj * (N + 1)]) || (ti < N - 1 && W.path[t + 1] && W.fenceZ[ti + 1 + tj * (N + 1)]) ||
              (tj > 0 && W.path[t - N] && W.fenceX[t]) || (tj < N - 1 && W.path[t + N] && W.fenceX[t + N])) return 'A fence is in the way';
        }
        W.path[t] = op.old; return null;
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
    var stack = RT.undoStack || RT.undo;
    if (RT.stroke || RT.curEntry) return fail('Finish the current action first');
    var n = stack.length; if (!n) return fail('Nothing to undo');
    var st = stack[n - 1], k;
    if (st.net < 0 && S.money < -st.net) return fail('Not enough money to undo that (' + fmt(-st.net) + ' needed)');
    var W = { elev: S.elev.slice(), terrain: S.terrain.slice(), path: S.path.slice(), fenceX: S.fenceX.slice(), fenceZ: S.fenceZ.slice(), occ: S.tileObj.slice(), gone: {} };
    var bad = null, hasFence = false;
    for (k = st.ops.length - 1; k >= 0 && !bad; k--) { bad = undoCheck(st.ops[k], W); if (st.ops[k].k === 'fence') hasFence = true; }
    if (!bad && hasFence) {
      var seen = {};
      for (k = 0; k < S.animals.length && !bad; k++) {
        var a = S.animals[k]; if (!a.enc || a.state === 'escaped') continue;
        var at = tileOf(a.x, a.z); if (seen[S.tileEnc[at]]) continue; seen[S.tileEnc[at]] = 1;
        if (floodLeaks(at, W)) bad = 'Animals are inside - moving that fence would let them out';
      }
    }
    if (bad) return fail(bad);
    // apply
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
        case 'path': S.path[op.t] = op.old; if (!op.old) S.dirt[op.t] = 0; navChanged = true; bus.emit('path', { i0: op.t % N, j0: Math.floor(op.t / N), i1: op.t % N, j1: Math.floor(op.t / N) }); break;
        case 'fence': (op.axis === 'x' ? S.fenceX : S.fenceZ)[op.ix] = op.old; navChanged = true; fenceEv.push({ axis: op.axis, i: op.i, j: op.j }); break;
        case 'obj+': {
          var o = null; for (var q2 = 0; q2 < S.objects.length; q2++) if (S.objects[q2].id === op.id) { o = S.objects[q2]; break; }
          if (o) removeObjectInternal(o);
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
    stack.pop();
    if (st.net > 0) earn(st.net, 'construction'); else if (st.net < 0) spend(-st.net, 'construction');
    if (box) bus.emit('terrain', { i0: box[0], j0: box[1], i1: box[2], j1: box[3] });
    if (ebox) {
      bus.emit('elev', { i0: ebox[0], j0: ebox[1], i1: ebox[2], j1: ebox[3] });
      bus.emit('elev:change', { i0: ebox[0], j0: ebox[1], i1: ebox[2], j1: ebox[3] });
    }
    for (k = 0; k < fenceEv.length; k++) bus.emit('fence', fenceEv[k]);
    afterWorldChange(navChanged);
    for (k = 0; k < added.length; k++) bus.emit('objectAdded', added[k]);
    bus.emit('undo:change', canUndo());
    var res = { ok: true, msg: 'Undid: ' + st.label, refund: st.net };
    bus.emit('undo', { label: st.label, refund: st.net });
    return res;
  }

  // ---- animals ----
  function compatible(enc, spId) {
    var sp = SP[spId];
    for (var k = 0; k < enc.species.length; k++) {
      var o = enc.species[k]; if (o === spId) continue;
      var os = SP[o];
      if (sp.diet === 'carnivore' || os.diet === 'carnivore' || sp.predator || os.predator) {
        return "Predators can't share an enclosure with other animals - they will hunt them";
      }
    }
    return null;
  }
  function pickAnimalName() {
    var used = {}, k; for (k = 0; k < S.animals.length; k++) used[S.animals[k].name] = 1;
    var cand = D.animalNames.filter(function (n) { return !used[n]; });
    return cand.length ? rng.pick(cand) : (rng.pick(D.animalNames) + ' II');
  }
  function makeAnimal(spId, enc, x, z, baby, sex) {
    var sp = SP[spId];
    return {
      id: newId(), species: spId, name: pickAnimalName(), sex: sex || (rng.chance(0.5) ? 'm' : 'f'),
      age: baby ? 0 : adultAge(sp), baby: !!baby, enc: enc ? enc.id : 0, state: 'idle',
      x: x, z: z, y: 0, heading: rng.range(-PI, PI), speed: 0,
      hunger: rng.range(10, 40), thirst: rng.range(10, 40), energy: rng.range(60, 95), health: 100, happiness: 75,
      stuck: 0, st: rng.range(1, 3), tx: x, tz: z, tg: '', sick: false, pregnant: 0, esc: 0, pt: rng.range(30, 90)
    };
  }
  function insertAnimal(a) {
    S.animals.push(a); RT.aById.set(a.id, a);
    refreshEncAnimals();
    for (var k = 0; k < S.enclosures.length; k++) encStats(S.enclosures[k]);
    bus.emit('animalAdded', a);
  }
  function adultAge(sp) { return Math.max(30, Math.floor((sp.lifespan || 720) * 0.15)); }
  function addAnimal(speciesId, i, j, opts) {
    opts = opts || {}; var dry = dryOf(arguments);
    var sp = SP[speciesId]; if (!sp) return fail('Unknown animal species');
    if (sp.star > S.unlocked.star) return fail('Needs a ' + sp.star + '-star zoo');
    if (!Z.inb(i, j)) return fail('Outside the zoo');
    var t = i + j * N, enc = encOfTile(t);
    if (!enc) return fail('Place animals inside an enclosure');
    var badComp = compatible(enc, speciesId);
    if (badComp) return fail(badComp);
    var cost = sp.cost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    var a = makeAnimal(speciesId, enc, cxOf(t), czOf(t), !!opts.baby, opts.sex);
    spend(cost, 'animals');
    insertAnimal(a);
    msg(a.name + ' the ' + sp.name.toLowerCase() + ' arrived at ' + enc.name + '.', 'good');
    return okr(cost, { id: a.id });
  }
  function sellAnimal(id, opts) {
    var dry = dryOf(arguments);
    var a = RT.aById.get(id); if (!a) return fail('Animal not found');
    var sp = SP[a.species], refund = Math.floor(sp.cost * 0.45 * (a.happiness / 100) * (a.baby ? 0.6 : 1));
    if (dry) return okr(-refund);
    earn(refund, 'animals');
    removeAnimal(a);
    return okr(-refund);
  }
  function removeAnimal(a) {
    var k = S.animals.indexOf(a); if (k >= 0) S.animals.splice(k, 1);
    RT.aById.delete(a.id);
    refreshEncAnimals();
    for (k = 0; k < S.enclosures.length; k++) encStats(S.enclosures[k]);
    bus.emit('animalRemoved', a);
  }
  function moveAnimal(id, i, j, opts) {
    var dry = dryOf(arguments);
    var a = RT.aById.get(id); if (!a) return fail('Animal not found');
    if (!Z.inb(i, j)) return fail('Outside the zoo');
    var t = i + j * N, enc = encOfTile(t);
    if (!enc) return fail('Place animals inside an enclosure');
    var badComp = compatible(enc, a.species);
    if (badComp) return fail(badComp);
    if (dry) return okr(0);
    a.x = cxOf(t); a.z = czOf(t); a.tx = a.x; a.tz = a.z;
    a.state = 'idle'; a.st = 1; a.tg = ''; a.esc = 0;
    refreshEncAnimals();
    for (var k = 0; k < S.enclosures.length; k++) encStats(S.enclosures[k]);
    msg(a.name + ' was moved to ' + enc.name + '.', 'info');
    return okr(0);
  }

  // ---- staff ----
  function hireStaff(type, i, j, opts) {
    opts = opts || {}; var dry = dryOf(arguments);
    var stf = STF[type]; if (!stf) return fail('Unknown staff role');
    var cost = stf.hireCost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    var sx = (i !== undefined && Z.inb(i, j)) ? cxOf(i + j * N) : cxOf(GATE_I0 + GATE_J * N);
    var sz = (j !== undefined && Z.inb(i, j)) ? czOf(i + j * N) : czOf(GATE_I0 + GATE_J * N);
    var s = {
      id: newId(), type: type, name: rng.pick(D.guestNames), x: sx, z: sz,
      heading: PI, speed: 0, state: 'idle', task: 'Ready for duty',
      wage: stf.wage, ti: tileOf(sx, sz), tk: null, route: null, ri: 0, wt: 0, lo: rng.range(-0.4, 0.4)
    };
    S.staff.push(s); RT.sById.set(s.id, s);
    spend(cost, 'wages');
    bus.emit('staffAdded', s);
    return okr(cost, { id: s.id });
  }
  function fireStaff(id) {
    var k = -1; for (var q = 0; q < S.staff.length; q++) if (S.staff[q].id === id) { k = q; break; }
    if (k < 0) return fail('Staff member not found');
    var s = S.staff.splice(k, 1)[0]; RT.sById.delete(id);
    bus.emit('staffRemoved', s);
    return okr(0);
  }

  // ---- economy ----
  var MARKETING_COST = 500;
  function setTicketPrice(p) { p = clamp(Math.round(p), 0, 50); S.ticketPrice = p; bus.emit('ticketPrice', p); }
  function setPrice(objId, p) {
    var o = RT.oById.get(objId); if (!o || o.kind !== 'building') return fail('Not a shop');
    o.price = clamp(Math.round(p), 0, 100);
    return okr(0);
  }
  function takeLoan(amt) {
    amt = Math.round(amt); if (amt <= 0) return fail('Invalid amount');
    if (S.loan + amt > 30000) return fail('Loan limit reached (£30,000 max)');
    S.loan += amt; earn(amt, 'other');
    return okr(amt);
  }
  function repayLoan(amt) {
    amt = Math.min(S.loan, Math.round(amt)); if (amt <= 0) return fail('No loan to repay');
    if (S.money < amt) return fail('Not enough money');
    spend(amt, 'other'); S.loan -= amt;
    return okr(amt);
  }
  function startMarketing() {
    if (S.marketing.active) return fail('Campaign already running');
    if (S.money < MARKETING_COST) return fail('Not enough money');
    spend(MARKETING_COST, 'marketing');
    S.marketing.active = true; S.marketing.daysLeft = 5;
    msg('Marketing campaign launched! Gate traffic will increase for 5 days.', 'good');
    return okr(MARKETING_COST);
  }
  function renameEnclosure(id, name) {
    var e = encById(id); if (!e) return fail('Enclosure not found');
    name = (name || '').trim().slice(0, 24); if (!name) return fail('Name too short');
    e.name = name;
    bus.emit('enclosureRenamed', e);
    return okr(0);
  }
  function setSpeed(s) { S.speed = clamp(s, 0, 5); bus.emit('speed', S.speed); }
  function setOpen(o) { S.open = !!o; bus.emit('open', S.open); }

  // ---- guests ----
  function say(g, thoughtKey, spId) {
    var list = D.guestThoughts[thoughtKey]; if (!list || !list.length) return;
    var text = rng.pick(list);
    if (/{animal}/.test(text)) {
      var nm = 'animal';
      if (spId && SP[spId]) nm = lc(plural(SP[spId]));
      else if (S.animals.length) { var an = S.animals[Math.floor(rng.next() * S.animals.length)]; nm = lc(plural(SP[an.species])); }
      text = text.replace(/{animal}/g, nm);
    }
    g.thought = text; g.thoughtT = 4.5; g.tcool = 7;
  }

  function arrivalValue() {
    var spCount = 0, seen = {};
    for (var k = 0; k < S.animals.length; k++) { var a = S.animals[k]; if (!seen[a.species] && a.enc) { seen[a.species] = 1; spCount++; } }
    RT.speciesCount = spCount;
    var ap = 0; for (k = 0; k < S.animals.length; k++) { var q = S.animals[k]; if (q.enc && q.happiness > 40) ap += SP[q.species].appeal * (q.baby ? 1.5 : 1); } RT.appeal = ap;
    return 6 + S.rating * 3.5 + Math.min(8, spCount) * 0.9;
  }

  function spawnGuest(group, first) {
    var gi = GATE_I0 + (rng.chance(0.5) ? 1 : 0), t = gi + GATE_J * N;
    if (!S.path[t]) { t = GATE_I0 + GATE_J * N; if (!S.path[t]) return null; }
    var price = S.ticketPrice, mood = clamp(12 - Math.max(0, price - RT.value) * 1.5, -25, 12);
    var g = {
      id: newId(), name: rng.pick(D.guestNames), seed: Math.floor(rng.next() * 1e9), x: cxOf(t) + rng.range(-0.8, 0.8), z: N * TILE + rng.range(0.3, 1.4),
      heading: PI, speed: 0, state: 'walk', hunger: rng.range(0, 35), thirst: rng.range(0, 35), bladder: rng.range(0, 30), energy: rng.range(70, 100),
      happiness: 70, money: Math.round(rng.range(25, 90) + S.rating * 8), thought: '', thoughtT: 0, seen: {}, group: group,
      ti: t, ni: t, px: cxOf(t), pz: czOf(t), lo: rng.range(-0.55, 0.55), lo2: rng.range(-0.5, 0.5), bs: rng.range(1.5, 2.0),
      gt: '', gid: 0, dk: '', wt: 0, nt: rng.range(0.1, 0.9), acc: 0, tcool: rng.range(0, 3), fun: rng.range(50, 90), mood: mood, lit: false,
      stay: rng.range(45, 85), pv: RT.pathVer, last: 0, bid: 0, fleeT: 0, nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0, shel: 0, ubid: 0
    };
    g.px += g.lo * 0.5; g.pz = czOf(t);
    var pay = Math.min(S.ticketPrice, g.money);
    S.guests.push(g); RT.gById.set(g.id, g);
    earn(pay, 'tickets', g.x, N * TILE - 1); g.money -= pay;
    S.stats.guestsTotal++;
    if (!RT.groupLead.has(group)) RT.groupLead.set(group, g.id);
    bus.emit('guestAdded', g);
    return g;
  }

  function releaseGuest(g) {
    if (g.state === 'use' && g.ubid) { var q = RT.bq[g.ubid]; if (q && q.use > 0) q.use--; g.ubid = 0; }
    if (g.state === 'queue' && g.gid) { var q2 = RT.bq[g.gid]; if (q2) { var k = q2.q.indexOf(g.id); if (k >= 0) q2.q.splice(k, 1); } }
    if (g.state === 'sit' && g.bid) { if (RT.benchOcc[g.bid] > 0) RT.benchOcc[g.bid]--; g.x = cxOf(g.ti) + g.lo * 0.5; g.z = czOf(g.ti); }
  }
  function removeGuest(g) {
    releaseGuest(g);
    var k = S.guests.indexOf(g); if (k >= 0) { S.guests[k] = S.guests[S.guests.length - 1]; S.guests.pop(); }
    RT.gById.delete(g.id);
    if (RT.groupLead.get(g.group) === g.id) RT.groupLead.delete(g.group);
    RT.ghEMA += (g.happiness - RT.ghEMA) * 0.06;
    S.reputation += (g.happiness - S.reputation) * 0.03;
    bus.emit('guestRemoved', g);
  }
  function startLeaving(g) {
    if (g.state === 'leave') return;
    releaseGuest(g);
    g.state = 'leave'; g.gt = 'exit'; g.dk = 'exit'; g.ni = -1; g.fleeT = 0; g.wt = 0;
    g.thoughtT = 0; g.tcool = 0; say(g, 'leaving');
  }

  function objCentre(o) {
    var fp = objFootprint(o);
    return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE };
  }

  function pickBunker(g, an) {
    var best = null, bd = 25;
    var bunkers = RT.bunkers || [];
    for (var k = 0; k < bunkers.length; k++) {
      var o = bunkers[k], f = getField('b' + o.id);
      if (!f || !(f[g.ti] < bd)) continue;
      if (an) {
        var c = objCentre(o), dg = Math.sqrt((c.x - g.x) * (c.x - g.x) + (c.z - g.z) * (c.z - g.z)), dt = Math.sqrt((c.x - an.x) * (c.x - an.x) + (c.z - an.z) * (c.z - an.z));
        if (dt < dg * 1.3 + 3) continue;
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
    spend(comp, 'other');
    if (!S.stats) S.stats = {};
    S.stats.injuries = (S.stats.injuries || 0) + 1;
    S.stats.compensation = (S.stats.compensation || 0) + comp;
    S.panic = Math.min(2, (S.panic || 0) + 0.3);
    S.reputation = clamp(S.reputation - 3, 0, 100);
    g.mood -= 40; g.happiness = Math.min(g.happiness, 8);
    msg('A guest was hurt by ' + an.name + ' the ' + lc(SP[an.species].name) + '! The zoo paid ' + fmt(comp) + ' in compensation.', 'bad');
    bus.emit('injury', { guest: g, animal: an, compensation: comp });
    startLeaving(g);
  }

  function pickBuilding(g, list, kind) {
    var best = null, bs = 1e9, k;
    for (k = 0; k < list.length; k++) {
      var o = list[k], def = BD[o.type];
      var price = o.price === undefined ? def.price : o.price;
      if (price > g.money) continue;
      var f = getField('b' + o.id);
      if (!f || !(f[g.ti] < INF)) continue;
      var q = RT.bq[o.id], ql = q ? q.q.length : 0;
      if (ql >= def.capacity * 2) continue;
      var sc = f[g.ti] + ql * 3 + (price > def.price * 1.5 ? 20 : 0);
      if (sc < bs) { bs = sc; best = o; }
    }
    if (!best) return false;
    g.gt = 'bld'; g.gid = best.id; g.dk = 'b' + best.id; g.ni = -1; g.wt = 0;
    return true;
  }

  function pickExhibit(g) {
    var encs = S.enclosures; if (!encs.length) return false;
    var best = null, bs = 1e9, k;
    for (k = 0; k < encs.length; k++) {
      var e = encs[k]; if (!e.animals.length || !e.viewTiles.length) continue;
      var f = getField('e' + e.id); if (!f || !(f[g.ti] < INF)) continue;
      var seen = g.seen[e.id] || 0;
      var sc = f[g.ti] * 0.7 + seen * 12 + rng.next() * 5;
      if (sc < bs) { bs = sc; best = e; }
    }
    if (!best) return false;
    g.gt = 'enc'; g.gid = best.id; g.dk = 'e' + best.id; g.ni = -1; g.wt = 0;
    return true;
  }

  function chooseGoal(g) {
    if (g.state === 'leave') { g.gt = 'exit'; g.dk = 'exit'; g.ni = -1; return; }
    var bt = RT.byType;
    if (g.hunger > 60 && bt.food.length && pickBuilding(g, bt.food, 'food')) return;
    if (g.thirst > 60 && bt.drink.length && pickBuilding(g, bt.drink, 'drink')) return;
    if (g.bladder > 70 && bt.toilet.length && pickBuilding(g, bt.toilet, 'toilet')) return;
    if (g.energy < 30 && bt.bench.length) {
      var fb = getField('bench');
      if (fb && fb[g.ti] < 15) { g.gt = 'bench'; g.dk = 'bench'; g.ni = -1; return; }
    }
    if (g.fun < 50 && bt.fun.length && rng.chance(0.5) && pickBuilding(g, bt.fun, 'fun')) return;
    if (pickExhibit(g)) return;
    // fallback wander
    g.gt = 'wander'; g.dk = ''; g.ni = -1; g.wt = rng.range(2, 6);
  }

  function startUse(g, o) {
    var def = BD[o.type], q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] });
    q.use++; g.state = 'use'; g.ubid = o.id; g.wt = def.type === 'ride' ? 10 : def.type === 'food' ? 6 : 4; g.speed = 0;
    var price = o.price === undefined ? def.price : o.price;
    if (price > 0 && g.money >= price) {
      g.money -= price; earn(price, def.type === 'food' || def.type === 'drink' ? 'food' : 'shops', g.x, g.z);
      o.uses = (o.uses || 0) + 1; o.income = (o.income || 0) + price;
      if (price > def.price * 1.35) { g.mood -= 2; say(g, 'expensive'); }
      else if (price < def.price * 0.8) say(g, 'cheap');
    }
    if (def.satisfies) {
      if (def.satisfies.hunger) g.hunger = Math.max(0, g.hunger - def.satisfies.hunger * 100);
      if (def.satisfies.thirst) g.thirst = Math.max(0, g.thirst - def.satisfies.thirst * 100);
      if (def.satisfies.bladder) g.bladder = Math.max(0, g.bladder - def.satisfies.bladder * 100);
      if (def.satisfies.fun) g.fun = Math.min(100, g.fun + def.satisfies.fun * 60);
      if (def.satisfies.energy) g.energy = Math.min(100, g.energy + def.satisfies.energy * 60);
    }
    if (def.type === 'food' || def.type === 'drink') g.lit = true;
  }
  function finishUse(g) {
    releaseGuest(g);
    g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1;
  }

  function arriveAtGoal(g) {
    if (g.state === 'flee') {
      if (g.gt === 'bunker') {
        var bo = RT.oById.get(g.gid);
        if (bo) { g.state = 'use'; g.shel = 1; g.ubid = 0; g.gt = ''; g.dk = ''; g.wt = 6; g.speed = 0; var bc = objCentre(bo); g.hd = Math.atan2(bc.x - g.x, bc.z - g.z); g.ni = -1; }
        else { g.state = 'walk'; g.gt = ''; g.dk = ''; }
      }
      return;
    }
    var gt = g.gt;
    if (gt === 'bld') {
      var o = RT.oById.get(g.gid); if (!o) { g.gt = ''; return; }
      var q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] }), def = BD[o.type];
      if (q.use < def.capacity && q.q.length === 0) startUse(g, o);
      else { g.state = 'queue'; q.q.push(g.id); g.speed = 0; }
    } else if (gt === 'enc') {
      var e = encById(g.gid);
      if (e && e.animals.length) {
        g.state = 'watch'; g.wt = rng.range(6, 14); g.speed = 0; g.seen[e.id] = (g.seen[e.id] || 0) + 1;
        var app = 0, hpp = 0;
        for (var k = 0; k < e.animals.length; k++) {
          var a = RT.aById.get(e.animals[k]); if (a) { app += SP[a.species].appeal * (a.baby ? 1.5 : 1); hpp += a.happiness; }
        }
        var avgH = e.animals.length ? hpp / e.animals.length : 50;
        var see = e.see;
        g.fun = Math.min(100, g.fun + app * 0.12 * see);
        g.mood += (avgH > 65 ? 2 : avgH < 40 ? -3 : 0);
        if (avgH < 40) say(g, 'animalsUnhappy', e.species[0]);
        else if (see < 0.3) say(g, 'cantSee');
        else if (app > 80 && rng.chance(0.3)) say(g, 'greatExhibit');
        // donations
        if (g.money >= 5 && avgH > 70 && rng.chance(0.25)) {
          var don = Math.min(g.money, Math.round(rng.range(2, 6)));
          g.money -= don; earn(don, 'donations', g.x, g.z); S.stats.donations = (S.stats.donations || 0) + don;
        }
      } else { g.gt = ''; }
    } else if (gt === 'bench') {
      var list = RT.byType.bench, found = null;
      for (var b = 0; b < list.length; b++) {
        var bn = list[b];
        if (Math.abs(bn.i - (g.ti % N)) + Math.abs(bn.j - Math.floor(g.ti / N)) === 1) {
          if ((RT.benchOcc[bn.id] || 0) < 2) { found = bn; break; }
        }
      }
      if (found) {
        RT.benchOcc[found.id] = (RT.benchOcc[found.id] || 0) + 1;
        g.state = 'sit'; g.bid = found.id; g.wt = rng.range(15, 30); g.speed = 0;
      } else { g.gt = ''; g.nbt = 20; say(g, 'noBench'); }
    } else if (gt === 'bin') {
      var bins = RT.byType.bin;
      for (var bi = 0; bi < bins.length; bi++) {
        var bin = bins[bi];
        if (Math.abs(bin.i - (g.ti % N)) + Math.abs(bin.j - Math.floor(g.ti / N)) === 1 && (bin.fill || 0) < 15) {
          bin.fill = (bin.fill || 0) + 1; g.lit = false; g.mood += 1;
          if (bin.fill >= 15) delete RT.fields.bin;
          break;
        }
      }
      if (g.lit) { S.dirt[g.ti] = Math.min(255, S.dirt[g.ti] + Math.round(40 * WX.dirt)); g.lit = false; }
      g.gt = '';
    } else if (gt === 'exit') {
      g.gt = 'out'; g.dk = ''; g.px = g.x + rng.range(-0.5, 0.5); g.pz = N * TILE + 3; g.ni = -2;
    } else g.gt = '';
  }

  function guestMove(g, dt) {
    var spd = g.bs, m = 1;
    if (g.ni < 0 && g.gt !== 'out') {
      var ti = g.ti, nb = RT.nb[ti], best = -1, d;
      if (g.state === 'flee') {
        var bd2 = -1; spd *= 1.9;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) {
          var n = ti + DT4[d], dx = cxOf(n) - g.fx, dz = czOf(n) - g.fz, dd = dx * dx + dz * dz + rng.next() * 4;
          if (dd > bd2) { bd2 = dd; best = n; }
        }
      } else if (g.dk) {
        var f = getField(g.dk);
        if (!f) { g.gt = ''; g.dk = ''; g.speed = 0; return 0; }
        var d0 = f[ti];
        if (d0 === 0) { g.speed = 0; return 1; }
        if (d0 === INF) { g.gt = ''; g.dk = ''; g.speed = 0; g.unr++; return 0; }
        var bdv = d0;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) { var n2 = ti + DT4[d]; if (f[n2] < bdv) { bdv = f[n2]; best = n2; } }
      } else {
        var cnt = 0, cand = -1;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) {
          var n3 = ti + DT4[d]; if (n3 === g.prevT && (nb & (nb - 1))) continue;
          cnt++; if (rng.next() * cnt < 1) cand = n3;
        }
        if (cand < 0) for (d = 0; d < 4; d++) if (nb & (1 << d)) cand = ti + DT4[d];
        best = cand;
        if (--g.wt <= 0) { g.gt = ''; g.speed = 0; return 1; }
      }
      if (best < 0) { g.speed = 0; if (g.state === 'flee') return 0; g.gt = ''; g.dk = ''; return 0; }
      g.ni = best; g.prevT = ti;
      var ddx = best - ti, sx = 0, sz = 0;
      if (ddx === 1) sx = 1; else if (ddx === -1) sx = -1; else if (ddx === N) sz = 1; else sz = -1;
      g.px = cxOf(best) + (-sz) * g.lo + sx * g.lo2 * 0.6;
      g.pz = czOf(best) + sx * g.lo + sz * g.lo2 * 0.6;
    } else if (g.state === 'flee') spd *= 1.9;
    var pm = g.ti >= 0 && S.path[g.ti] ? D.paths[S.path[g.ti] - 1].speed : 1;
    spd *= pm * (WX.guestSpeed || 1);
    var dx2 = g.px - g.x, dz2 = g.pz - g.z, dist = Math.sqrt(dx2 * dx2 + dz2 * dz2), step = spd * dt;
    if (dist <= step + 0.01) {
      g.x = g.px; g.z = g.pz;
      if (g.gt === 'out') return 2;
      g.ti = g.ni; g.ni = -1; g.speed = spd;
      return 0;
    }
    g.x += dx2 / dist * step; g.z += dz2 / dist * step; g.speed = spd;
    g.heading = turn(g.heading, Math.atan2(dx2, dz2), dt * 10);
    return 0;
  }

  function revalidateGuest(g) {
    if (g.pv === RT.pathVer) return;
    g.pv = RT.pathVer;
    if (!S.path[g.ti]) {
      var nbs = [g.ti - 1, g.ti + 1, g.ti - N, g.ti + N], cand = -1;
      for (var k = 0; k < 4; k++) if (S.path[nbs[k]]) { cand = nbs[k]; break; }
      if (cand >= 0) { g.ti = cand; g.x = cxOf(cand); g.z = czOf(cand); g.ni = -1; }
    }
    g.ni = -1;
  }

  function guestThink(g, a) {
    var k;
    g.hunger = Math.min(100, g.hunger + 1.05 * a * WX.hunger);
    g.thirst = Math.min(100, g.thirst + 1.35 * a * WX.thirst);
    g.bladder = Math.min(100, g.bladder + 0.95 * a);
    if (g.state !== 'sit') g.energy = Math.max(0, g.energy - 0.85 * a * WX.energy);
    g.fun = Math.max(0, g.fun - 0.8 * a + WX.fun * a * 10);
    g.stay -= a; g.thoughtT -= a; g.tcool -= a; g.nbt -= a;
    if (g.thoughtT <= 0 && g.thought) g.thought = '';
    g.mood -= g.mood * 0.02 * a;
    // tile dirt
    if (S.dirt[g.ti] > 110 && rng.chance(0.15)) { say(g, 'dirty'); g.mood -= 1.5; }
    if (g.state === 'walk' && S.dirt[g.ti] > 200) g.mood -= 0.5 * a;
    // happiness
    var pen = 0;
    if (g.hunger > 60) pen += (g.hunger - 60) * 0.7;
    if (g.thirst > 60) pen += (g.thirst - 60) * 0.7;
    if (g.bladder > 60) pen += (g.bladder - 60) * 0.6;
    if (g.energy < 35) pen += (35 - g.energy) * 0.7;
    if (g.fun < 30) pen += (30 - g.fun) * 0.4;
    var target = 72 + g.mood - pen + WX.fun * 10;
    // guides nearby
    for (k = 0; k < RT.guides.length; k++) {
      var gd = RT.guides[k], dx = gd.x - g.x, dz = gd.z - g.z;
      if (dx * dx + dz * dz < 144) { target += 8; g.fun = Math.min(100, g.fun + 1 * a); break; }
    }
    if (RT.guestCrowd > 1.1) target -= (RT.guestCrowd - 1.1) * 6;
    g.happiness += (clamp(target, 0, 100) - g.happiness) * Math.min(1, 0.35 * a);
    if (g.happiness > 100) g.happiness = 100; else if (g.happiness < 0) g.happiness = 0;
    if (g.happiness > 85 && rng.chance(0.03)) say(g, 'happy');
    if (g.energy < 20 && g.state !== 'sit') say(g, 'tired');
    if (RT.guestCrowd > 1.3 && rng.chance(0.02)) say(g, 'crowded');
    // closing time / leaving
    if (g.state !== 'leave') {
      var leave = false;
      if (!S.open || S.time >= CLOSE_T - 0.004) leave = true;
      else if (g.stay <= 0) leave = true;
      else if (g.happiness < 10 && g.stay < 60) leave = true;
      else if (S.time > CLOSE_T - 0.14) {
        var fe = getField('exit'), de = fe ? fe[g.ti] : 0; if (de === INF) de = 0;
        if (S.time + (de * TILE / (g.bs * 1.2)) / DAY_SECONDS > CLOSE_T - 0.01) leave = true;
      }
      if (leave) { startLeaving(g); return; }
    } else {
      var fx = getField('exit');
      if (fx && fx[g.ti] === INF) { g.isl += a; if (g.isl > 12) { removeGuest(g); return false; } }
      return;
    }
    var fx2 = getField('exit');
    if (!fx2 || fx2[g.ti] === INF) { g.isl += a; if (g.isl > 25) { removeGuest(g); return false; } } else g.isl = 0;

    // bunker flee in lockdown
    if (RT.dangerEsc > 0 && !g.shel && g.state !== 'leave' && g.state !== 'flee' && RT.bunkers.length) {
      for (k = 0; k < RT.escaped.length; k++) {
        var an2 = RT.escaped[k]; if (aDanger(an2) < 2) continue;
        var ex2 = an2.x - g.x, ez2 = an2.z - g.z;
        if (ex2 * ex2 + ez2 * ez2 < 1600) {
          var bk2 = pickBunker(g, an2);
          if (bk2) {
            releaseGuest(g); g.state = 'flee'; g.gt = 'bunker'; g.gid = bk2.id; g.dk = 'b' + bk2.id; g.ni = -1; g.fleeT = 25; g.fx = an2.x; g.fz = an2.z;
            break;
          }
        }
      }
    }
    // injuries from dangerous animals
    if (!g.shel && RT.escaped.length) {
      for (k = 0; k < RT.escaped.length; k++) {
        var an3 = RT.escaped[k], ad3 = aDanger(an3);
        if (ad3 < 2 || an3.hurtT > 0) continue;
        var ex3 = an3.x - g.x, ez3 = an3.z - g.z;
        if (ex3 * ex3 + ez3 * ez3 < 7 && rng.chance(0.22 * ad3)) { hurtGuest(g, an3); return false; }
      }
    }
    // escaped animals panic reaction
    if (g.state !== 'flee' && !g.shel && RT.escaped.length) {
      for (k = 0; k < RT.escaped.length; k++) {
        var an = RT.escaped[k], asp = SP[an.species];
        var ex = an.x - g.x, ez = an.z - g.z, dd = ex * ex + ez * ez;
        if (asp.danger >= 2 && dd < 144 || asp.danger === 1 && dd < 25) {
          say(g, 'escaped', an.species);
          if (asp.danger >= 2) {
            releaseGuest(g);
            g.state = 'flee'; g.fleeT = 7; g.fx = an.x; g.fz = an.z; g.ni = -1; g.gt = ''; g.dk = '';
            g.mood -= RT.secCount > 0 ? 6 : 12; g.happiness -= 6;
          }
          break;
        }
      }
    }
    if (g.state === 'flee') {
      g.fleeT -= a;
      if (g.fleeT <= 0) { g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; }
      return;
    }
    // state specific
    if (g.state === 'watch') watchTick(g, a);
    else if (g.state === 'queue') {
      g.wt += a;
      if (g.wt > 28) {
        var q = RT.bq[g.gid]; if (q) { var qi = q.q.indexOf(g.id); if (qi >= 0) q.q.splice(qi, 1); }
        g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; g.mood -= 3; say(g, 'crowded');
      }
    } else if (g.state === 'sit') {
      g.energy = Math.min(100, g.energy + 6 * a); g.mood += 0.3 * a;
    } else if (g.state === 'walk' && !g.gt) chooseGoal(g);
  }

  function watchTick(g, a) {
    g.wt -= a;
    if (g.wt <= 0) { g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; }
  }

  function guestStep(g, dt) {
    revalidateGuest(g);
    var st = g.state;
    if (st === 'walk' || st === 'flee' || st === 'leave') {
      var res = guestMove(g, dt);
      if (res === 1) arriveAtGoal(g);
      else if (res === 2) { removeGuest(g); return; }
    } else {
      g.speed = 0;
      if (st === 'watch') watchTick(g, dt);
      else if (st === 'use') {
        if (g.shel && RT.dangerEsc > 0) g.wt = Math.max(g.wt, 3);
        g.wt -= dt;
        if (g.wt <= 0) {
          if (g.shel) { g.shel = 0; g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; }
          else finishUse(g);
        }
      } else if (st === 'sit') {
        g.wt -= dt;
        if (g.wt <= 0 || g.energy >= 95) {
          if (RT.benchOcc[g.bid] > 0) RT.benchOcc[g.bid]--; g.bid = 0;
          g.x = cxOf(g.ti) + g.lo * 0.5; g.z = czOf(g.ti); g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1;
        }
      }
    }
    g.acc += dt; g.nt -= dt;
    if (g.nt <= 0) {
      var a = g.acc; g.acc = 0; g.nt = 0.7 + rng.next() * 0.3;
      guestThink(g, a);
    }
  }

  function updateQueues() {
    for (var id in RT.bq) {
      var q = RT.bq[id], o = RT.oById.get(+id);
      if (!o || o.kind !== 'building') continue;
      var def = BD[o.type];
      while (q.use < def.capacity && q.q.length > 0) {
        var gid = q.q.shift(), g = RT.gById.get(gid);
        if (g && g.state === 'queue') startUse(g, o);
      }
    }
  }

  function arrivalRate() {
    var spc = RT.speciesCount || 0, rating = S.rating;
    var nAn = S.animals.length;
    var base = 1.6 * (0.10 + 0.20 * rating + 0.04 * spc + 0.0016 * (RT.appeal || 0));
    var ratio = S.ticketPrice / Math.max(1, RT.value);
    var priceF = clamp(1.6 - ratio, 0.05, 1.3);
    var rep = 0.6 + clamp(S.reputation, 0, 100) / 100 * 0.8;
    var mk = S.marketing.active ? 1.7 : 1;
    var an = nAn > 0 ? 1 : 0.2;
    return base * priceF * rep * mk * an * (WX.arrivals || 1) * (DIFF.arrivals || 1);
  }

  // ====================== ANIMALS ======================
  function swimmer(sp) { return !!sp.needsWater; }
  function aok(a, t) {
    if (RT.block[t]) return false;
    if (cliffT(t)) return false;
    if (a.enc) { if (S.tileEnc[t] !== a.enc) return false; }
    else if (S.tileEnc[t]) return false;
    if (S.terrain[t] === WATER && !swimmer(SP[a.species])) return false;
    return true;
  }
  function canGo(a, x0, z0, x1, z1) {
    if (x1 < 0 || z1 < 0 || x1 >= N * TILE || z1 >= N * TILE) return false;
    var i0 = Math.floor(x0 / TILE), j0 = Math.floor(z0 / TILE), i1 = Math.floor(x1 / TILE), j1 = Math.floor(z1 / TILE);
    if (i0 === i1 && j0 === j1) return true;
    if (!aok(a, i1 + j1 * N)) return false;
    if (a.enc) {
      if (i1 !== i0) { if (S.fenceZ[Math.max(i0, i1) + j0 * (N + 1)]) return false; }
      else if (j1 !== j0) { if (S.fenceX[i0 + Math.max(j0, j1) * N]) return false; }
    }
    return true;
  }
  function animalMove(a, dt, spd) {
    var dx = a.tx - a.x, dz = a.tz - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.3) { a.speed = 0; return true; }
    var step = Math.min(spd * dt, d), nx = a.x + dx / d * step, nz = a.z + dz / d * step, moved = false;
    if (nx !== a.x && canGo(a, a.x, a.z, nx, a.z)) { a.x = nx; moved = true; }
    if (nz !== a.z && canGo(a, a.x, a.z, a.x, nz)) { a.z = nz; moved = true; }
    if (!moved) { a.stuck += dt; a.speed = 0; if (a.stuck > 1.2) { a.stuck = 0; return true; } return false; }
    a.stuck = 0; a.speed = spd;
    a.heading = turn(a.heading, Math.atan2(dx, dz), dt * 5);
    return false;
  }
  function setTargetTile(a, t) {
    a.tx = cxOf(t) + rng.range(-0.6, 0.6); a.tz = czOf(t) + rng.range(-0.6, 0.6);
  }
  function relocateAnimal(a, enc) {
    var best = -1, bd = 1e9, k;
    for (k = 0; k < enc.tiles.length; k++) {
      var t = enc.tiles[k]; if (!aok(a, t)) continue;
      var dx = cxOf(t) - a.x, dz = czOf(t) - a.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = t; }
    }
    if (best >= 0) { a.x = cxOf(best); a.z = czOf(best); a.tx = a.x; a.tz = a.z; }
  }
  function randomEncTile(a, enc, tries) {
    tries = tries || 10;
    for (var k = 0; k < tries; k++) {
      var t = enc.tiles[Math.floor(rng.next() * enc.tiles.length)];
      if (aok(a, t)) return t;
    }
    return -1;
  }
  function animalDie(a, cause) {
    var sp = SP[a.species];
    msg(a.name + ' the ' + sp.name.toLowerCase() + ' has died ' + cause + '.', 'bad');
    S.stats.deaths++;
    bus.emit('death', a);
    removeAnimal(a);
  }

  // hunting
  function findPrey(a, enc) {
    var sp = SP[a.species], best = null, bd = 1e9;
    for (var k = 0; k < enc.animals.length; k++) {
      var p = RT.aById.get(enc.animals[k]); if (!p || p === a || p.state === 'escaped') continue;
      var ps = SP[p.species];
      if (ps.diet === 'carnivore' || ps.size > (sp.size || 1) * 1.5) continue;
      var dx = p.x - a.x, dz = p.z - a.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function killPrey(pred, prey) {
    var ps = SP[prey.species], ks = SP[pred.species];
    msg(prey.name + ' the ' + lc(ps.name) + ' was caught and eaten by ' + pred.name + ' the ' + lc(ks.name) + '!', 'bad');
    S.stats.deaths++; S.stats.predations = (S.stats.predations || 0) + 1;
    bus.emit('death', prey); bus.emit('predation', { predator: pred, prey: prey });
    removeAnimal(prey);
    pred.hunger = Math.max(0, pred.hunger - 70); pred.state = 'eat'; pred.st = rng.range(5, 7); pred.tg = ''; pred.speed = 0; pred.hid = 0; pred.kill = 1;
  }
  function huntStep(a, dt, enc, E, sp) {
    var pr = RT.aById.get(a.hid);
    if (!pr || pr.enc !== a.enc || pr.state === 'escaped') { a.tg = ''; a.state = 'idle'; a.st = 1; a.speed = 0; return; }
    a.hunt = (a.hunt || 0) + dt; a.tx = pr.x; a.tz = pr.z;
    var dx = pr.x - a.x, dz = pr.z - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.3 + (sp.size || 1) * 0.12) { killPrey(a, pr); return; }
    if (a.hunt > 40) { a.tg = ''; a.state = 'idle'; a.st = rng.range(3, 6); a.speed = 0; return; }
    a.state = 'run';
    animalMove(a, dt, sp.speed * 1.7 * 1.12);
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

  function decide(a, enc, E, sp) {
    var t = tileOf(a.x, a.z);
    if (!aok(a, t)) { relocateAnimal(a, enc); t = tileOf(a.x, a.z); }
    if (a.sick) { a.state = 'sick'; a.speed = 0; return; }
    var target = -1, pry = null;
    if (isNight() || a.energy < 18) {
      a.tg = 'sleep';
      if (E.shelter.length && (sp.needsShelter || rng.chance(0.6))) target = E.shelter[Math.floor(rng.next() * E.shelter.length)];
      if (target < 0 || (tileOf(a.x, a.z) === target)) { a.state = 'sleep'; a.speed = 0; a.tg = ''; return; }
    } else if ((sp.diet === 'carnivore' || sp.predator) && !a.baby && a.hunger > 45 && E.nAn > 1 && (pry = findPrey(a, enc)) && rng.chance(0.85)) {
      a.tg = 'hunt'; a.hid = pry.id; a.hunt = 0; a.state = 'run'; a.tx = pry.x; a.tz = pry.z; a.stuck = 0; return;
    } else if (a.hunger > 55 && enc.foodLevel > 0.02) { a.tg = 'eat'; target = E.feed; }
    else if (a.thirst > 55 && (E.water.length || enc.waterLevel > 0.02)) {
      a.tg = 'drink';
      target = E.drink.length ? E.drink[Math.floor(rng.next() * E.drink.length)] : (E.water.length && swimmer(sp) ? E.water[Math.floor(rng.next() * E.water.length)] : E.feed);
    } else if (E.toy.length && rng.chance(0.12)) { a.tg = 'play'; target = E.toy[Math.floor(rng.next() * E.toy.length)]; }
    else if (E.water.length && swimmer(sp) && rng.chance(0.18)) { a.tg = 'swim'; target = E.water[Math.floor(rng.next() * E.water.length)]; }
    else { a.tg = 'wander'; target = randomEncTile(a, enc, 14); }
    if (target < 0) { a.state = 'idle'; a.st = rng.range(1.5, 4); a.tg = ''; return; }
    setTargetTile(a, target);
    a.state = (a.tg === 'wander' && rng.chance(0.06)) || (a.baby && rng.chance(0.15)) ? 'run' : 'walk';
    a.stuck = 0;
  }

  function animalStep(a, dt) {
    var sp = SP[a.species];
    if (a.state === 'escaped') { escapedStep(a, dt, sp); return; }
    var enc = RT.eMap[a.enc], E = enc && RT.encx[a.enc];
    if (!enc || !E) return;
    var sleeping = a.state === 'sleep';
    a.hunger = Math.min(100, a.hunger + (sleeping ? 0.08 : 0.22) * dt);
    a.thirst = Math.min(100, a.thirst + (sleeping ? 0.12 : 0.3) * dt);
    a.energy = clamp(a.energy + (sleeping ? 1.2 : -0.12) * dt, 0, 100);
    if (a.hunger >= 95 || a.thirst >= 95) a.health -= (a.thirst >= 95 ? 0.12 : 0.08) * dt;
    else if (a.sick) a.health -= 0.05 * dt;
    else if (a.health < 100 && a.hunger < 70 && a.thirst < 70) a.health = Math.min(100, a.health + 0.04 * dt);
    if (enc.poop > enc.area * 0.4 + 3) a.health -= 0.01 * dt;
    if (a.health <= 0) {
      animalDie(a, a.sick ? 'of illness' : (a.thirst >= 95 ? 'of thirst' : a.hunger >= 95 ? 'of hunger' : 'of neglect'));
      return;
    }
    a.ht = (a.ht || 0) - dt;
    if (a.ht <= 0) {
      a.ht = 1;
      var suit = enc.suitability[a.species]; if (suit === undefined) suit = 0.5;
      var tgt = 12 + suit * 50 + (100 - a.hunger) * 0.12 + (100 - a.thirst) * 0.12 + a.health * 0.08 + a.energy * 0.06;
      if (a.sick) tgt *= 0.6;
      if (enc.minFence < sp.minFence) tgt -= 6;
      tgt += (WX.animalMood || 0);
      a.happiness += (tgt - a.happiness) * 0.05; a.happiness = clamp(a.happiness, 0, 100);
    }
    a.pt -= dt;
    if (a.pt <= 0 && !a.baby) { a.pt = rng.range(55, 95); enc.poop = Math.min(enc.poop + 1, Math.floor(enc.area * 0.5) + 4); }
    var inWater = S.terrain[tileOf(a.x, a.z)] === WATER;
    a.y = inWater ? -0.3 : 0;

    // prey reactions when hunted
    if (E.nAn > 1 && sp.diet !== 'carnivore' && !sp.predator) {
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
        if (a.tg === 'hunt') { huntStep(a, dt, enc, E, sp); break; }
        var spd = sp.speed * (a.baby ? 0.8 : 1) * (a.state === 'run' ? 1.7 : a.state === 'swim' ? 0.6 : 0.75);
        if (inWater && a.state !== 'swim') spd *= 0.7;
        if (animalMove(a, dt, spd)) {
          var tg = a.tg;
          if (tg === 'eat') { a.state = 'eat'; a.st = rng.range(3.5, 6); }
          else if (tg === 'drink') { a.state = 'drink'; a.st = rng.range(2.5, 4.5); }
          else if (tg === 'play') { a.state = 'play'; a.st = rng.range(4, 8); }
          else if (tg === 'swim') { a.state = 'swim'; a.st = rng.range(5, 10); setTargetTile(a, E.water[Math.floor(rng.next() * E.water.length)]); a.tg = 'swimming'; }
          else if (tg === 'swimming') { a.state = 'idle'; a.st = 1; }
          else if (tg === 'sleep') { a.state = 'sleep'; a.tg = ''; a.speed = 0; }
          else { a.state = 'idle'; a.st = rng.range(1.5, 6); }
          if (a.state !== 'swim' && a.state !== 'walk') a.speed = 0;
          if (a.state === 'swim' && tg === 'swimming') a.state = 'idle';
        }
        break;
      }
      case 'eat':
        a.speed = 0; a.st -= dt;
        if (a.st <= 0) { a.hunger = Math.max(0, a.hunger - 65); enc.foodLevel = Math.max(0, enc.foodLevel - 0.1); a.state = 'idle'; a.st = rng.range(1, 3); }
        break;
      case 'drink':
        a.speed = 0; a.st -= dt;
        if (a.st <= 0) {
          a.thirst = 0; if (!E.water.length) enc.waterLevel = Math.max(0, enc.waterLevel - 0.08);
          a.state = 'idle'; a.st = rng.range(1, 3);
        }
        break;
      case 'play':
        a.speed = 0; a.st -= dt;
        if (a.st <= 0) { a.happiness = Math.min(100, a.happiness + 15); a.state = 'idle'; a.st = rng.range(1, 3); }
        break;
    }
  }

  // ---- escapes ----
  function doEscape(a, enc) {
    a.state = 'escaped'; a.enc = 0; a.tg = ''; a.esc = 0;
    // place outside enclosure
    var E = RT.encx[enc.id];
    if (E && E.out.length) {
      var t = E.out[Math.floor(rng.next() * E.out.length)];
      a.x = cxOf(t); a.z = czOf(t); a.tx = a.x; a.tz = a.z;
    }
    S.stats.escapes++; S.panic = Math.min(2, (S.panic || 0) + 0.5);
    msg(a.name + ' the ' + SP[a.species].name.toLowerCase() + ' has escaped from ' + enc.name + '! Security guards should recapture it.', 'bad');
    bus.emit('escape', a);
  }
  function recapture(a, by) {
    a.state = 'idle'; a.st = 2; a.tg = ''; a.held = 0; a.claim = 0;
    var encs = S.enclosures; if (!encs.length) return;
    var enc = null;
    for (var k = 0; k < encs.length; k++) if (encs[k].species.indexOf(a.species) >= 0) { enc = encs[k]; break; }
    if (!enc) enc = encs[0];
    var t = enc.tiles[Math.floor(rng.next() * enc.tiles.length)];
    a.x = cxOf(t); a.z = czOf(t); a.tx = a.x; a.tz = a.z; a.enc = enc.id;
    a.happiness = Math.max(10, a.happiness - 15);
    refreshEncAnimals(); encStats(enc);
    msg((by || 'Staff') + ' recaptured ' + a.name + ' the ' + SP[a.species].name.toLowerCase() + ' and returned it to ' + enc.name + '.', 'good');
    bus.emit('recapture', a);
  }
  function escapedStep(a, dt, sp) {
    a.esc = (a.esc || 0) + dt;
    a.hunger = Math.min(100, a.hunger + 0.1 * dt); a.thirst = Math.min(100, a.thirst + 0.1 * dt);
    if (a.held) { a.speed = 0; return; }
    var adg = aDanger(a), limit = adg >= 2 ? (RT.secCount > 0 ? 100 : 200) : (RT.secCount > 0 || RT.keeperCount > 0 ? 300 : 150);
    if (a.hurtT > 0) a.hurtT -= dt;
    if (a.esc > limit) { recapture(a, 'Animal control'); return; }
    var spdE = sp.speed * 1.1;
    if (adg >= 2) {
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
      if (tg && !tg.shel) { a.tx = tg.x; a.tz = tg.z; spdE = sp.speed * 1.35; a.state = 'escaped'; animalMove(a, dt, spdE); return; }
    }
    // Loose carnivore hunting loose prey on paths
    if ((sp.diet === 'carnivore' || sp.predator) && RT.escaped.length > 1) {
      for (var ek = 0; ek < RT.escaped.length; ek++) {
        var ep = RT.escaped[ek];
        if (ep === a || ep.state !== 'escaped') continue;
        var eps = SP[ep.species];
        if (eps && eps.diet !== 'carnivore' && !eps.predator) {
          var edx = ep.x - a.x, edz = ep.z - a.z, ed = edx * edx + edz * edz;
          if (ed < 100) {
            a.tx = ep.x; a.tz = ep.z; spdE = sp.speed * 1.35;
            if (ed < 2.5) { killPrey(a, ep); return; }
            a.state = 'escaped'; animalMove(a, dt, spdE); return;
          }
        }
      }
    }
    var arrived = animalMove(a, dt, spdE);
    if (arrived) {
      if (RT.pathTiles.length) {
        var t = RT.pathTiles[Math.floor(rng.next() * RT.pathTiles.length)];
        a.tx = cxOf(t) + rng.range(-2.5, 2.5); a.tz = czOf(t) + rng.range(-2.5, 2.5);
      }
    }
    a.state = 'escaped';
  }

  function escapeRoll() {
    for (var e = 0; e < S.enclosures.length; e++) {
      var enc = S.enclosures[e]; if (!enc.animals.length) continue;
      var eff = enc.breach > 0 ? 0 : enc.minFence;
      for (var k = enc.animals.length - 1; k >= 0; k--) {
        var a = RT.aById.get(enc.animals[k]); if (!a || a.baby) continue;
        var sp = SP[a.species], def = sp.minFence - eff;
        if (def <= 0) continue;
        var pd = Math.min(0.9, 0.18 + 0.17 * def) * (1.25 - a.happiness / 150);
        var ph = 1 - Math.pow(1 - pd, 1 / 24);
        if (a.state === 'sleep') ph *= 0.3;
        ph *= (WX.escape || 1);
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
    return false;
  }
  function walkTo(s, target, dt) {
    var dx = target.x - s.x, dz = target.z - s.z, d = Math.sqrt(dx * dx + dz * dz), spd = staffSpeed(s), step = spd * dt;
    s.state = 'walk';
    if (d <= step + 0.02) { s.x = target.x; s.z = target.z; s.speed = 0; return true; }
    s.x += dx / d * step; s.z += dz / d * step; s.speed = spd;
    s.heading = turn(s.heading, Math.atan2(dx, dz), dt * 10);
    return false;
  }
  function staffOnPath(s) {
    var ti = s.ti;
    if (!S.path[ti]) {
      var nbs = [ti - 1, ti + 1, ti - N, ti + N], cand = -1;
      for (var k = 0; k < 4; k++) if (S.path[nbs[k]]) { cand = nbs[k]; break; }
      if (cand >= 0) { s.ti = cand; s.x = cxOf(cand); s.z = czOf(cand); }
      else if (RT.pathTiles.length) { var p = RT.pathTiles[0]; s.ti = p; s.x = cxOf(p); s.z = czOf(p); }
    }
  }
  function startPatrol(s) {
    s.state = 'idle'; s.speed = 0; s.wt = rng.range(0.5, 2); s.tk = null; s.task = 'Patrolling';
    if (!RT.pathTiles.length) return;
    var r = findRoute(s.ti, function () { return rng.chance(0.08); }, 8);
    if (r && r.length) { s.route = r; s.ri = 0; s.state = 'walk'; }
  }

  function claimed(key) { return RT.claim[key] && RT.claim[key] !== 0; }

  function tryRecapture(s, dt) {
    var a = RT.aById.get(s.tk.id);
    if (!a || a.state !== 'escaped') { s.tk = null; s.state = 'idle'; s.task = 'Ready'; return; }
    s.task = 'Chasing ' + a.name;
    var dx = a.x - s.x, dz = a.z - s.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.2) {
      recapture(a, s.name);
      delete RT.claim['a' + a.id];
      s.tk = null; s.state = 'idle'; s.wt = 2; s.task = 'Animal secured';
      return;
    }
    walkTo(s, { x: a.x, z: a.z }, dt);
  }

  function planCapRoute(s, an) {
    var at = tileOf(an.x, an.z), bestPt = -1, bd = 1e9;
    for (var k = 0; k < RT.pathTiles.length; k++) {
      var pt = RT.pathTiles[k], dx = (pt % N) - (at % N), dz = Math.floor(pt / N) - Math.floor(at / N), dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; bestPt = pt; }
    }
    if (bestPt < 0) return null;
    return findRoute(s.ti, function (t) { return t === bestPt; });
  }

  function assignTask(s) {
    var k, enc, a;
    staffOnPath(s);
    if (s.type === 'security') {
      if (RT.escaped.length) {
        for (k = 0; k < RT.escaped.length; k++) {
          a = RT.escaped[k]; if (claimed('a' + a.id)) continue;
          RT.claim['a' + a.id] = s.id; s.tk = { k: 'cap', id: a.id }; s.task = 'Responding to escape';
          var r0 = planCapRoute(s, a); if (r0) { s.route = r0; s.ri = 0; }
          return;
        }
      }
    }
    if (s.type === 'keeper') {
      for (k = 0; k < S.enclosures.length; k++) {
        enc = S.enclosures[k];
        if (enc.foodLevel < 0.35 && !claimed('f' + enc.id) && enc.viewTiles.length) {
          RT.claim['f' + enc.id] = s.id; s.tk = { k: 'feed', id: enc.id }; s.task = 'Refilling ' + enc.name;
          var r = findRoute(s.ti, function (t) { return enc.viewTiles.indexOf(t) >= 0; });
          if (r) { s.route = r; s.ri = 0; return; }
          delete RT.claim['f' + enc.id]; s.tk = null;
        }
      }
      for (k = 0; k < S.enclosures.length; k++) {
        enc = S.enclosures[k];
        if (enc.poop > 2 && !claimed('p' + enc.id) && enc.viewTiles.length) {
          RT.claim['p' + enc.id] = s.id; s.tk = { k: 'poop', id: enc.id }; s.task = 'Mucking out ' + enc.name;
          var r2 = findRoute(s.ti, function (t) { return enc.viewTiles.indexOf(t) >= 0; });
          if (r2) { s.route = r2; s.ri = 0; return; }
          delete RT.claim['p' + enc.id]; s.tk = null;
        }
      }
      if (RT.escaped.length && RT.secCount === 0) {
        for (k = 0; k < RT.escaped.length; k++) {
          a = RT.escaped[k]; if (claimed('a' + a.id)) continue;
          RT.claim['a' + a.id] = s.id; s.tk = { k: 'cap', id: a.id }; s.task = 'Helping catch ' + a.name;
          var r3 = planCapRoute(s, a); if (r3) { s.route = r3; s.ri = 0; }
          return;
        }
      }
    }
    if (s.type === 'vet') {
      for (k = 0; k < S.animals.length; k++) {
        a = S.animals[k];
        if (a.sick && a.enc && !claimed('v' + a.id)) {
          enc = RT.eMap[a.enc];
          if (enc && enc.viewTiles.length) {
            RT.claim['v' + a.id] = s.id; s.tk = { k: 'vet', id: a.id, encId: enc.id }; s.task = 'Treating ' + a.name;
            var r4 = findRoute(s.ti, function (t) { return enc.viewTiles.indexOf(t) >= 0; });
            if (r4) { s.route = r4; s.ri = 0; return; }
            delete RT.claim['v' + a.id]; s.tk = null;
          }
        }
      }
    }
    if (s.type === 'cleaner') {
      var bins = RT.byType.bin;
      for (k = 0; k < bins.length; k++) {
        var bin = bins[k];
        if ((bin.fill || 0) >= 8 && !claimed('b' + bin.id)) {
          RT.claim['b' + bin.id] = s.id; s.tk = { k: 'bin', id: bin.id, i: bin.i, j: bin.j }; s.task = 'Emptying litter bin';
          var r5 = findRoute(s.ti, function (t) { return Math.abs((t % N) - bin.i) + Math.abs(Math.floor(t / N) - bin.j) === 1; });
          if (r5) { s.route = r5; s.ri = 0; return; }
          delete RT.claim['b' + bin.id]; s.tk = null;
        }
      }
      var rc = findRoute(s.ti, function (t) { return S.dirt[t] >= 40 && !claimed('t' + t); });
      if (rc) {
        var dt = rc.length ? rc[rc.length - 1] : s.ti;
        RT.claim['t' + dt] = s.id; s.tk = { k: 'dirt', t: dt }; s.task = 'Sweeping path';
        s.route = rc; s.ri = 0; return;
      }
    }
    startPatrol(s);
  }

  function staffStep(s, dt) {
    if (s.sickUntil > S.day + S.time) { s.state = 'idle'; s.speed = 0; s.task = 'Off sick'; return; }
    if (s.tk && s.tk.k === 'cap') {
      var an = RT.aById.get(s.tk.id);
      if (an && an.state === 'escaped') {
        var dx = an.x - s.x, dz = an.z - s.z;
        if (dx * dx + dz * dz < 64) { tryRecapture(s, dt); return; }
      }
    }
    if (s.route && s.ri < s.route.length) {
      if (walkRoute(s, dt)) {
        s.route = null;
        if (s.tk) {
          var tk = s.tk;
          if (tk.k === 'feed') {
            s.state = 'work'; s.wt = 3; s.task = 'Feeding animals';
          } else if (tk.k === 'poop') {
            s.state = 'work'; s.wt = 4; s.task = 'Cleaning enclosure';
          } else if (tk.k === 'vet') {
            s.state = 'work'; s.wt = 5; s.task = 'Administering treatment';
          } else if (tk.k === 'bin') {
            s.state = 'work'; s.wt = 2; s.task = 'Emptying bin';
          } else if (tk.k === 'dirt') {
            s.state = 'work'; s.wt = 2.5; s.task = 'Sweeping';
          }
        } else startPatrol(s);
      }
      return;
    }
    if (s.state === 'work') {
      s.wt -= dt; s.speed = 0;
      if (s.wt <= 0) {
        var done = s.tk;
        if (done) {
          if (done.k === 'feed') { var e = encById(done.id); if (e) { e.foodLevel = 1; delete RT.claim['f' + e.id]; } }
          else if (done.k === 'poop') { var e2 = encById(done.id); if (e2) { e2.poop = 0; delete RT.claim['p' + e2.id]; } }
          else if (done.k === 'vet') { var a2 = RT.aById.get(done.id); if (a2) { a2.sick = false; a2.health = Math.min(100, a2.health + 40); delete RT.claim['v' + a2.id]; msg(a2.name + ' was treated and is feeling better.', 'good'); } }
          else if (done.k === 'bin') { var b = RT.oById.get(done.id); if (b) { b.fill = 0; delete RT.claim['b' + b.id]; } }
          else if (done.k === 'dirt') {
            S.dirt[done.t] = 0;
            delete RT.claim['t' + done.t];
          }
        }
        s.tk = null; s.state = 'idle'; s.wt = 1; s.task = 'Ready';
      }
      return;
    }
    s.wt -= dt;
    if (s.wt <= 0) assignTask(s);
  }

  // ---- rating & goals ----
  function computeRating() {
    var stars = 0, clean = 0, animalWelfare = 0, facilities = 0, scenery = 0;
    var dc = 0; for (var k = 0; k < RT.pathTiles.length; k++) if (S.dirt[RT.pathTiles[k]] >= 80) dc++;
    clean = clamp(1 - dc / Math.max(1, RT.pathTiles.length * 0.25), 0, 1);
    var hsum = 0, nAn = S.animals.length;
    for (k = 0; k < nAn; k++) hsum += S.animals[k].happiness;
    animalWelfare = nAn ? clamp(hsum / nAn / 100, 0, 1) : 0.5;
    var bt = RT.byType, hasF = bt.food.length > 0, hasD = bt.drink.length > 0, hasT = bt.toilet.length > 0;
    facilities = (hasF ? 0.35 : 0) + (hasD ? 0.35 : 0) + (hasT ? 0.3 : 0);
    var aes = 0; for (k = 0; k < S.objects.length; k++) if (S.objects[k].kind === 'scenery') aes += (SC[S.objects[k].type] || {}).aesthetic || 0;
    scenery = clamp(aes / 80, 0, 1);
    var spc = clamp(RT.speciesCount / 6, 0, 1);
    stars = clean * 1.0 + animalWelfare * 1.5 + facilities * 1.0 + scenery * 0.8 + spc * 0.7;
    stars = clamp(stars, 0, 5);
    return { stars: stars, cleanliness: clean, welfare: animalWelfare, facilities: facilities, scenery: scenery, diversity: spc };
  }
  function ratingBreakdown() { return computeRating(); }
  function isUnlocked(type, id) {
    var def = type === 'animal' ? SP[id] : type === 'building' ? BD[id] : null;
    return def ? def.star <= S.unlocked.star : true;
  }
  function checkUnlocks() {
    var st = Math.floor(S.rating);
    if (st > S.unlocked.star) {
      S.unlocked.star = st;
      msg('Congratulations! You have reached a ' + st + '-star zoo rating! New species and facilities are unlocked.', 'good');
      bus.emit('unlock', st);
    }
  }

  function goalDone(g) {
    if (S.goals[g.id]) return true;
    switch (g.type) {
      case 'guests': return S.stats.guestsTotal >= g.target;
      case 'animals': return S.animals.length >= g.target;
      case 'rating': return S.rating >= g.target;
      case 'money': return S.money >= g.target;
      case 'species': return RT.speciesCount >= g.target;
      case 'babies': return S.stats.babiesBorn >= g.target;
      case 'happiness': return S.guestHappiness >= g.target;
    }
    return false;
  }
  function checkGoals() {
    for (var k = 0; k < D.goals.length; k++) {
      var g = D.goals[k];
      if (!S.goals[g.id] && goalDone(g)) {
        S.goals[g.id] = true;
        earn(g.reward, 'other');
        msg('Goal complete: ' + g.text + '! Awarded ' + fmt(g.reward) + '.', 'good');
        bus.emit('goal', g);
      }
    }
  }

  // ====================== DIFFICULTY ======================
  var DEBT_LIMIT = -5000, DEBT_GRACE = 0.12;
  function difficultyDef(id) { for (var k = 0; k < D.difficulties.length; k++) if (D.difficulties[k].id === id) return D.difficulties[k]; return null; }
  function applyDifficulty(id, fresh) {
    var def = difficultyDef(id || (S && S.difficulty) || 'normal') || difficultyDef('normal') || { id: 'normal', income: 1, costs: 1, arrivals: 1, interest: 0.004, money: 22000 };
    S.difficulty = def.id; DIFF.id = def.id; DIFF.income = def.income; DIFF.costs = def.costs; DIFF.arrivals = def.arrivals; DIFF.interest = def.interest || 0.004; DIFF.money = def.money || 22000;
    if (fresh) S.money = def.money;
    return def;
  }

  // ====================== WEATHER ======================
  var WXT = {
    clear:    { arrivals: 1,    thirst: 1,   hunger: 1,   energy: 1,   guestSpeed: 1,    fun: 0.03,  spend: 1,    shelter: false, animalMood: 1,    sick: 1,   escape: 1,    dirt: 1,   dur: [7, 14],  notable: false },
    cloudy:   { arrivals: 1,    thirst: 1,   hunger: 1,   energy: 1,   guestSpeed: 1,    fun: 0,     spend: 1,    shelter: false, animalMood: 0,    sick: 1,   escape: 1,    dirt: 1,   dur: [4, 9],   notable: false },
    rain:     { arrivals: 0.55, thirst: 0.9, hunger: 1.05, energy: 1,  guestSpeed: 0.9,  fun: -0.05, spend: 1.1,  shelter: true,  animalMood: -1.5, sick: 1.1, escape: 1.1,  dirt: 1.6, dur: [3, 7],   notable: true },
    storm:    { arrivals: 0.25, thirst: 0.9, hunger: 1,   energy: 1.1, guestSpeed: 0.85, fun: -0.15, spend: 0.85, shelter: true,  animalMood: -6,   sick: 1.15, escape: 1.8, dirt: 2,   dur: [2, 4],   notable: true },
    heatwave: { arrivals: 1,    thirst: 1.8, hunger: 0.9, energy: 1.3, guestSpeed: 0.95, fun: -0.04, spend: 1.15, shelter: false, animalMood: -3,   sick: 1.3, escape: 1,    dirt: 1.1, dur: [6, 12],  notable: true },
    fog:      { arrivals: 0.85, thirst: 1,   hunger: 1,   energy: 1,   guestSpeed: 0.95, fun: -0.03, spend: 1,    shelter: false, animalMood: 0,    sick: 1,   escape: 1.15, dirt: 1,   dur: [3, 6],   notable: true }
  };
  WXT.heat = WXT.heatwave;
  var WX_TRANS = {
    clear: [['cloudy', 0.65], ['heatwave', 0.18], ['fog', 0.17]],
    cloudy: [['clear', 0.3], ['rain', 0.42], ['fog', 0.08], ['storm', 0.08], ['heatwave', 0.12]],
    rain: [['cloudy', 0.5], ['storm', 0.2], ['clear', 0.2], ['fog', 0.1]],
    storm: [['rain', 0.45], ['cloudy', 0.45], ['clear', 0.1]],
    heatwave: [['clear', 0.45], ['cloudy', 0.35], ['storm', 0.2]],
    fog: [['clear', 0.5], ['cloudy', 0.4], ['rain', 0.1]]
  };
  function wxDef(type) {
    if (type === 'heatwave') { for (var q = 0; q < D.weather.length; q++) if (D.weather[q].id === 'heat' || D.weather[q].id === 'heatwave') return D.weather[q]; }
    for (var k = 0; k < D.weather.length; k++) if (D.weather[k].id === type) return D.weather[k];
    return D.weather[0] || { id: type, name: type, emoji: '☀️', blurb: '', effects: '' };
  }
  function wxPick(type) {
    var list = WX_TRANS[type] || WX_TRANS.clear, r = rng.next(), acc = 0;
    for (var k = 0; k < list.length; k++) { acc += list[k][1]; if (r < acc) return list[k][0]; }
    return list[list.length - 1][0];
  }
  function wxIntensity(type) { return Math.round(((WXT[type] && WXT[type].notable) ? rng.range(0.7, 1) : rng.range(0.5, 1)) * 100) / 100; }
  function wxHours(type) { var d = (WXT[type] && WXT[type].dur) || [4, 8]; return Math.round(rng.range(d[0], d[1]) * 2) / 2; }
  function wxScale(v, i, add) { return add ? v * i : 1 + (v - 1) * i; }

  function recomputeWX() {
    var w = S.weather || { type: 'clear', intensity: 0.6 }, t = WXT[w.type] || WXT.cloudy, i = w.intensity === undefined ? 1 : w.intensity, k, f, ea = 1, es = 1, am = 1, einc = 1, efc = 1;
    WX.type = w.type; WX.intensity = i;
    WX.arrivals = WX.adm = wxScale(t.arrivals, i);
    WX.thirst = wxScale(t.thirst, i);
    WX.hunger = wxScale(t.hunger, i);
    WX.energy = wxScale(t.energy, i);
    WX.guestSpeed = WX.speed = wxScale(t.guestSpeed, i);
    WX.fun = wxScale(t.fun, i, true);
    WX.spend = wxScale(t.spend, i);
    WX.shelter = WX.wet = !!t.shelter && i >= 0.4;
    WX.animalMood = wxScale(t.animalMood, i, true);
    WX.sick = wxScale(t.sick, i);
    WX.escape = wxScale(t.escape, i);
    WX.dirt = wxScale(t.dirt, i);
    var ae = S.activeEvents || [];
    for (k = 0; k < ae.length; k++) {
      f = ae[k].fx || {};
      if (f.arrivals) ea *= f.arrivals;
      if (f.sick) es *= f.sick;
      if (f.amber) am *= f.amber;
      if (f.income) einc *= f.income;
      if (f.feedCost) efc *= f.feedCost;
    }
    WX.arrivals *= ea; WX.adm = WX.arrivals; WX.sick *= es;
    EV.amber = am; EV.income = einc; EV.feedCost = efc;
  }
  function pctTxt(v) { return Math.round(Math.abs(v - 1) * 100) + '%'; }
  function wxEffectText(type, i) {
    var t = WXT[type] || WXT.cloudy, out = [], v;
    v = wxScale(t.arrivals, i); if (v < 0.97) out.push('about ' + pctTxt(v) + ' fewer guests arrive'); else if (v > 1.03) out.push('about ' + pctTxt(v) + ' more guests arrive');
    v = wxScale(t.thirst, i); if (v > 1.03) out.push('guests will be about ' + pctTxt(v) + ' thirstier');
    v = wxScale(t.energy, i); if (v > 1.15) out.push('they tire ' + pctTxt(v) + ' faster');
    if (t.shelter) out.push('they look for shelter');
    v = wxScale(t.spend, i); if (v > 1.05) out.push('spending is up about ' + pctTxt(v)); else if (v < 0.95) out.push('spending is down about ' + pctTxt(v));
    v = wxScale(t.dirt, i); if (v > 1.15) out.push('paths get ' + pctTxt(v) + ' dirtier');
    v = wxScale(t.sick, i); if (v > 1.12) out.push('illness is ' + pctTxt(v) + ' more likely');
    v = wxScale(t.escape, i); if (v > 1.12) out.push('escape risk is ' + pctTxt(v) + ' higher');
    if (t.animalMood * i < -2) out.push('the animals are stressed');
    if (t.fun * i < -0.01) out.push('guests enjoy the zoo less'); else if (t.fun * i > 0.01) out.push('guests are a little happier');
    if (type === 'heatwave' || type === 'heat') out.push('animals without water suffer');
    if (!out.length) return '';
    var last = out.pop(), txt = out.length ? out.join(', ') + ' and ' + last : last;
    return txt.charAt(0).toUpperCase() + txt.slice(1) + '.';
  }
  function wxHoursTxt(h) { return h >= 1.5 ? 'about ' + Math.round(h) + ' hours' : 'about an hour'; }
  function setWeather(type, intensity, hours, cause) {
    var w = S.weather, old = w.type, def = wxDef(type), t = WXT[type] || WXT.cloudy;
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
    return { type: w.type, name: def.name, emoji: def.emoji, effects: (WXT[w.type] && WXT[w.type].notable) ? wxEffectText(w.type, w.intensity) : def.effects, blurb: def.blurb, intensity: w.intensity, hoursLeft: Math.round(w.hoursLeft * 10) / 10,
      next: w.next, nextName: nd.name, nextEmoji: nd.emoji, forecast: fc, activeEvents: S.activeEvents ? S.activeEvents.slice() : [] };
  }
  function weatherForecast() { return weatherInfo().forecast; }
  function weatherReport() { return weatherInfo(); }

  function hourlyWeather() {
    var w = S.weather;
    if (w.type === 'storm' && rng.chance(0.12 * w.intensity)) {
      var cand = S.enclosures.filter(function (e) { return e.animals.length && !(e.breach > 0); });
      if (cand.length) { var e = rng.pick(cand); e.breach = 1; msg('Lightning has brought down a fence panel at ' + e.name + '. It is open to the elements until repaired, so animals could slip out!', 'bad'); }
    }
  }
  function stepWeather(dt) {
    var dh = dt / DAY_SECONDS * 24;
    S.weather.hoursLeft -= dh;
    if (S.weather.hoursLeft <= 0) advanceWeather();
    RT.wxAcc = (RT.wxAcc || 0) + dh; if (RT.wxAcc >= 1) { RT.wxAcc -= 1; hourlyWeather(); }
  }

  // ====================== EVENTS ======================
  function addActive(ev, kind, text, hours, fx, extra) {
    var rec = { id: ev.id, name: ev.name, emoji: ev.emoji, text: text, until: hours === 'day' ? S.day + 1 : S.day + S.time + hours / 24, kind: kind, fx: fx || {} };
    if (extra) for (var k in extra) rec[k] = extra[k];
    S.activeEvents.push(rec); recomputeWX(); bus.emit('events', S.activeEvents);
    return rec;
  }
  function endEvent(ev) {
    if (ev.kind === 'staff') {
      var s = RT.sById.get(ev.staffId); if (s) { s.sickUntil = 0; msg(s.name + ' is back at work.', 'good', false); }
    } else msg(ev.name + ' is over.', 'info', false);
  }
  function expireEvents() {
    var now = S.day + S.time, list = S.activeEvents, changed = false;
    for (var k = list.length - 1; k >= 0; k--) if (list[k].until <= now) { var ev = list.splice(k, 1)[0]; endEvent(ev); changed = true; }
    if (changed) { recomputeWX(); bus.emit('events', list); }
  }
  function evActive(id) { for (var k = 0; k < S.activeEvents.length; k++) if (S.activeEvents[k].id === id) return true; return false; }
  function ilStaff() { return S.staff.filter(function (s) { return !(s.sickUntil > S.day + S.time); }); }
  function eventOk(ev) {
    var eff = ev.effect || {}, hasA = S.animals.length > 0;
    if (evActive(ev.id)) return false;
    switch (eff.type) {
      case 'weather': return S.weather.type !== eff.weather && (!eff.breach || S.enclosures.some(function (e) { return e.animals.length; }));
      case 'celebrity': case 'schoolTrip': case 'viral': case 'inspection': return hasA && S.open;
      case 'donation': return S.rating >= 0.5;
      case 'binFire': return RT.pathTiles.length > 0;
      case 'vaccine': return hasA;
      case 'staffIllness': return ilStaff().length > 0;
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
    if (forceId && typeof forceId === 'object') ev = forceId;
    else if (forceId) { for (k = 0; k < D.events.length; k++) if (D.events[k].id === forceId) ev = D.events[k]; }
    else ev = pickEvent();
    if (!ev) return null;
    var eff = ev.effect || {}, text = ev.text, kind = 'info', hrs = eff.hours !== undefined ? eff.hours : eff.dur;
    switch (eff.type) {
      case 'weather': {
        var wt = eff.weather === 'heat' ? 'heatwave' : eff.weather;
        var inten = Math.round(rng.range(0.85, 1) * 100) / 100, wh = hrs || (wt === 'heatwave' ? rng.range(9, 13) : wt === 'storm' ? rng.range(3, 4.5) : rng.range(4, 6.5));
        wh = Math.round(wh * 2) / 2;
        var e1 = null;
        if (eff.breach) { var cand = S.enclosures.filter(function (e) { return e.animals.length; }); if (cand.length) { e1 = rng.pick(cand); e1.breach = 1; } }
        if (S.weather.type === wt) setWeather(wt, inten, wh);
        else setWeather(wt, inten, wh, text);
        if (e1) msg('A fence panel at ' + e1.name + ' has been knocked down. Its animals could slip out until the repair crew finishes at midnight.', 'bad');
        return ev;
      }
      case 'celebrity': {
        var repG = eff.reputation || 5, arrB = eff.arrivals || 1.6;
        S.reputation = Math.min(100, S.reputation + repG);
        addActive(ev, 'celebrity', 'Arrivals about ' + Math.round((arrB - 1) * 100) + '% higher for the rest of the day.', 'day', { arrivals: arrB });
        text += ' Arrivals will be about ' + Math.round((arrB - 1) * 100) + '% higher for the rest of the day and your reputation rises by ' + repG + '.'; kind = 'good';
        break;
      }
      case 'schoolTrip': {
        var nGuests = eff.guests || 32;
        RT.pendingSpawn += nGuests;
        var extra = eff.amount ? ' It brings ' + fmt(eff.amount * DIFF.income) + '.' : ' ' + nGuests + ' extra guests are on their way through the gate.';
        text += extra; kind = 'good';
        if (eff.amount) earn(eff.amount, 'tickets');
        break;
      }
      case 'donation': {
        var amt = eff.amount ? eff.amount : Math.round(((eff.base || 500) + (eff.perStar || 250) * Math.round(S.rating)) / 50) * 50;
        earn(amt, 'donations'); text += ' It contains ' + fmt(amt * DIFF.income) + '.'; kind = 'money';
        break;
      }
      case 'binFire': {
        var bins = RT.byType.bin, bo = bins.length ? rng.pick(bins) : null, cx, cz, n = 0, g;
        if (bo) { cx = bo.i; cz = bo.j; bo.fill = 0; delete RT.fields.bin; } else { var rt0 = rng.pick(RT.pathTiles); cx = rt0 % N; cz = Math.floor(rt0 / N); }
        var rad = eff.radius || 5, dirtAmt = eff.dirt || 150;
        for (k = 0; k < RT.pathTiles.length; k++) {
          var pt = RT.pathTiles[k], dx = (pt % N) - cx, dz = Math.floor(pt / N) - cz;
          if (dx * dx + dz * dz <= rad * rad) { S.dirt[pt] = Math.min(255, S.dirt[pt] + dirtAmt); n++; }
        }
        var upset = 0;
        for (k = 0; k < S.guests.length; k++) { g = S.guests[k]; var gx = g.x / TILE - cx, gz = g.z / TILE - cz; if (gx * gx + gz * gz < 64) { g.happiness = Math.max(0, g.happiness - 8); upset++; } }
        text += ' ' + n + ' path tiles are filthy and need sweeping' + (upset ? ', and ' + upset + ' nearby guests are put out' : '') + '. Cleaners can fix it.'; kind = 'bad';
        break;
      }
      case 'vaccine': {
        var cured = 0, hlth = eff.health || 10, sk = eff.sick !== undefined ? eff.sick : 0.5;
        for (k = 0; k < S.animals.length; k++) { var a = S.animals[k]; if (a.sick) { a.sick = false; cured++; } a.health = Math.min(100, a.health + hlth); }
        addActive(ev, 'vaccine', 'Illness half as likely for two days.', hrs || 48, { sick: sk });
        text += ' Every animal gains +' + hlth + ' health' + (cured ? ', ' + cured + ' sick animal' + (cured > 1 ? 's are' : ' is') + ' cured' : '') + ' and illness is ' + Math.round((1 - sk) * 100) + '% less likely for two days.'; kind = 'good';
        break;
      }
      case 'inspection': {
        var rb = computeRating(), bt = RT.byType, pass = rb.cleanliness >= 0.6 && bt.toilet.length > 0 && bt.bin.length > 0 && RT.dirtyCount <= Math.max(4, RT.pathTiles.length * 0.12);
        var rew = eff.reward || 400, fn = eff.fine || 600;
        if (pass) { earn(rew, 'other'); S.reputation = Math.min(100, S.reputation + 4); text += ' The zoo passes with flying colours: a ' + fmt(rew) + ' award and +4 reputation.'; kind = 'good'; }
        else { spend(fn, 'other'); S.reputation = Math.max(0, S.reputation - 4); text += ' The zoo is fined ' + fmt(fn) + ' and loses 4 reputation: ' + (!bt.toilet.length ? 'there are no toilets' : !bt.bin.length ? 'there are no bins' : 'the paths are too dirty') + '.'; kind = 'bad'; }
        break;
      }
      case 'viral': {
        var vrep = eff.reputation || 3, varr = eff.arrivals || 1.4;
        S.reputation = Math.min(100, S.reputation + vrep);
        addActive(ev, 'viral', 'Arrivals about ' + Math.round((varr - 1) * 100) + '% higher for two days.', hrs || 48, { arrivals: varr });
        text += ' Arrivals will be about ' + Math.round((varr - 1) * 100) + '% higher for the next two days and reputation rises by ' + vrep + '.'; kind = 'good';
        break;
      }
      case 'grant': {
        var gmult = eff.mult || 1.35;
        addActive(ev, 'grant', 'Operating conservation grant boosting revenue +35% for 3 days.', hrs || 72, { income: gmult });
        text += ' Park income boosted by ' + Math.round((gmult - 1) * 100) + '% for three days.'; kind = 'good';
        break;
      }
      case 'feedShortage': {
        var fmult = eff.mult || 1.25;
        addActive(ev, 'feedShortage', 'Feed shortage increasing feed costs +25% for 3 days.', hrs || 72, { feedCost: fmult });
        text += ' Animal feed and supplier costs are ' + Math.round((fmult - 1) * 100) + '% higher for the next three days.'; kind = 'bad';
        break;
      }
      case 'staffIllness': {
        var stCandidate = ilStaff();
        if (stCandidate.length) {
          var st = rng.pick(stCandidate), role = STF[st.type] ? STF[st.type].name.toLowerCase() : 'staff member';
          var sHrs = hrs || 24;
          st.sickUntil = S.day + S.time + sHrs / 24; st.tk = null; st.route = null; st.state = 'idle'; st.speed = 0; st.task = 'Off sick';
          addActive(ev, 'staff', st.name + ' (' + role + ') is off sick for a day.', sHrs, {}, { staffId: st.id });
          text = st.name + ', one of your ' + role + 's, has gone home with a stomach bug and is off sick for about a day. Their duties will go undone.'; kind = 'bad';
        }
        break;
      }
      case 'powerCut': {
        var pHrs = hrs || 8;
        addActive(ev, 'powerCut', 'Power cut for ' + pHrs + ' hours.', pHrs, {});
        text += ' Power is out for about ' + pHrs + ' hours.'; kind = 'bad';
        break;
      }
    }
    msg(text, kind);
    return ev;
  }
  function triggerEvent(id) { return fireEvent(id); }
  function scheduleEvent() { S.eventAt = rng.chance(0.55) ? Math.round(rng.range(0.36, 0.72) * 1000) / 1000 : -1; }
  function stepEvents(dt) {
    expireEvents();
    if (S.eventAt >= 0 && S.time >= S.eventAt) { S.eventAt = -1; fireEvent(); }
  }

  function debtCheck() {
    if (S.money >= 0) { S.debtWarn = 0; return; }
    if (S.money <= DEBT_LIMIT) {
      if (!S.debtWarn) { S.debtWarn = S.day + S.time; msg('CRITICAL DEBT: The bank will step in soon unless you cut costs or raise cash.', 'bad'); }
    } else if (S.money <= -1000 && !S.debtWarn) {
      S.debtWarn = -1;
      msg('You are in debt. The bank is watching your account.', 'bad');
    }
  }

  function secondly() {
    var k, a, e;
    if (!RT.wxInit) ensureInit();
    refreshEncAnimals();
    RT.escaped.length = 0; RT.guides.length = 0; RT.secCount = 0; RT.keeperCount = 0; RT.vetCount = 0; RT.dangerEsc = 0;
    for (k = 0; k < S.animals.length; k++) {
      if (S.animals[k].state === 'escaped') {
        RT.escaped.push(S.animals[k]);
        if (aDanger(S.animals[k]) >= 2) RT.dangerEsc++;
      }
    }
    if (S.panic > 0) S.panic = Math.max(0, S.panic - 0.003);
    if (RT.dangerEsc > 0 && !RT.lockdown) {
      RT.lockdown = true;
      msg('The gates are closed to new visitors until the dangerous animal is back in its enclosure.', 'bad', false);
      bus.emit('lockdown', { lockdown: true });
    } else if (RT.dangerEsc === 0 && RT.lockdown) {
      RT.lockdown = false;
      msg('The animal is secure. The gates are open again.', 'good', false);
      bus.emit('lockdown', { lockdown: false });
    }
    for (k = 0; k < S.staff.length; k++) {
      var st = S.staff[k];
      if (st.sickUntil > S.day + S.time) continue;
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
    if (!openNow() && RT.pendingSpawn > 0) RT.pendingSpawn = 0;
    if (WX.type === 'storm' && gs.length) { var pl = 0.02 * WX.intensity; for (k = gs.length - 1; k >= 0; k--) if (gs[k].state !== 'leave' && rng.chance(pl)) startLeaving(gs[k]); }
    var rb = computeRating(); S.rating += (rb.stars - S.rating) * 0.015; S.rating = clamp(S.rating, 0, 5);
    checkUnlocks();
    var t = S.time;
    if (t >= CLOSE_T + 0.08 || t < OPEN_T - 0.03) { for (k = gs.length - 1; k >= 0; k--) removeGuest(gs[k]); }
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
      }
      if (e.foodLevel < 0.2 && RT.keeperCount === 0 && RT.advice['food' + e.id] !== S.day) { RT.advice['food' + e.id] = S.day; msg('Food is running out at ' + e.name + '. Hire a keeper to refill it.', 'bad'); }
    }
    RT.t2++;
    if (RT.t2 % 2 === 0) checkGoals();
    debtCheck();
  }

  function breedingAndBirths() {
    for (var k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k];
      for (var s = 0; s < e.species.length; s++) {
        var spId = e.species[s], sp = SP[spId], ad = adultAge(sp);
        var list = [], hasM = false, fem = [];
        for (var a = 0; a < e.animals.length; a++) {
          var an2 = RT.aById.get(e.animals[a]);
          if (an2 && an2.species === spId) list.push(an2);
        }
        for (var z = 0; z < list.length; z++) {
          var an = list[z]; if (an.baby || an.age < ad) continue;
          if (an.sex === 'm') hasM = true; else if (!an.pregnant && !an.sick && an.happiness > 55) fem.push(an);
        }
        var suit = e.suitability[spId] || 0;
        if (!hasM || suit < 0.55 || list.length > sp.social[1]) continue;
        for (z = 0; z < fem.length; z++) {
          if (rng.chance(sp.breedChance * 0.4 * (0.5 + suit))) fem[z].pregnant = 2;
        }
      }
    }
  }

  function newDay() {
    var k, a, up = 0;
    for (k = 0; k < S.animals.length; k++) up += SP[SP[S.animals[k].species] ? S.animals[k].species : 'meerkat'].upkeep * (S.animals[k].baby ? 0.5 : 1);
    for (k = 0; k < S.objects.length; k++) if (S.objects[k].kind === 'building') up += BD[S.objects[k].type].upkeep;
    var wages = 0; for (k = 0; k < S.staff.length; k++) wages += STF[S.staff[k].type].wage;
    up = Math.round(up * (DIFF.costs || 1) * (EV.feedCost || 1));
    wages = Math.round(wages * (DIFF.costs || 1));
    if (up) spend(up, 'upkeep'); if (wages) spend(wages, 'wages');
    if (S.loan > 0) { var intr = Math.round(S.loan * (DIFF.interest || 0.004)); if (intr) spend(intr, 'other'); }
    var t = S.finance.today;
    var income = t.tickets + t.food + t.shops + t.donations, costs = -(t.upkeep + t.wages + t.marketing);
    var profit = income - costs;
    var rec = {}; for (var c in t) rec[c] = Math.round(t[c]);
    rec.day = S.day; rec.balance = Math.round(S.money); rec.income = Math.round(income); rec.costs = Math.round(costs); rec.profit = Math.round(profit);
    S.finance.history.push(rec); if (S.finance.history.length > 30) S.finance.history.shift();
    msg('Day ' + S.day + ' report: takings ' + fmt(income) + ', running costs ' + fmt(costs) + ', ' + (profit >= 0 ? 'profit ' : 'loss ') + fmt(Math.abs(profit)) + '.', profit >= 0 ? 'good' : 'bad');
    S.finance.today = Z.emptyFinance();
    S.day++; S.stats.guestsToday = 0;
    if (S.marketing.active) { S.marketing.daysLeft--; if (S.marketing.daysLeft <= 0) { S.marketing.active = false; msg('Your marketing campaign has ended.', 'info'); } }
    for (k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k]; if (e.breach > 0) { e.breach--; if (e.breach <= 0) msg('The fence at ' + e.name + ' has been repaired.', 'good', false); }
    }
    for (k = S.animals.length - 1; k >= 0; k--) {
      a = S.animals[k]; var sp = SP[a.species];
      if (a.baby && a.age >= adultAge(sp) * 0.6) { a.baby = false; if (a.enc) msg(a.name + ' the ' + sp.name.toLowerCase() + ' has grown up.', 'info', false); }
      if (a.age > sp.lifespan && rng.chance(0.3)) { animalDie(a, 'peacefully of old age'); continue; }
      if (a.sick) {
        if (RT.vetCount === 0 && rng.chance(0.25)) { a.sick = false; }
      } else if (!a.baby && a.enc) {
        var enc = RT.eMap[a.enc], dirty = enc && enc.poop > enc.area * 0.3 + 2;
        var p = (0.03 * (1.5 - a.happiness / 100) + (dirty ? 0.04 : 0) + (a.hunger > 80 ? 0.05 : 0)) * (WX.sick || 1);
        if (rng.chance(p)) { a.sick = true; a.health = Math.max(20, a.health - 15); msg(a.name + ' the ' + sp.name.toLowerCase() + ' is unwell.' + (RT.vetCount ? '' : ' A vet could help.'), 'bad'); }
      }
    }
    breedingAndBirths();
    expireEvents();
    if (rng.chance(0.4)) fireEvent();
    if (S.money < 0) msg('You are in the red. Raise ticket prices or cut costs before the bank steps in.', 'bad');
  }

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
    stepWeather(dt);
    stepEvents(dt);
    if (RT.arrMulT > 0) { RT.arrMulT -= dt; if (RT.arrMulT <= 0) RT.arrMul = 1; }
    if (openNow() && !RT.lockdown && !RT.dangerEsc) {
      var add = RT.rate * dt * RT.arrMul;
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
    var an = S.animals;
    for (k = an.length - 1; k >= 0; k--) { if (k < an.length) { var a = an[k]; a.age += dt / DAY_SECONDS; animalStep(a, dt); } }
    var sf = S.staff;
    for (k = 0; k < sf.length; k++) staffStep(sf[k], dt);
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

  function rawPlace(type, i, j, rot) {
    var dk = defOf(type); if (!dk) return null;
    var fp = footprint(dk.def, i, j, rot || 0);
    var a, b;
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var t = (i + a) + (j + b) * N;
      if (S.tileObj[t]) return null;
    }
    var o = { id: newId(), kind: dk.kind, type: type, i: i, j: j, rot: rot || 0 };
    if (dk.kind === 'building') { o.price = dk.def.price; o.uses = 0; o.income = 0; }
    if (type === 'bin') o.fill = 0;
    S.objects.push(o);
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) S.tileObj[(i + a) + (j + b) * N] = o.id;
    return o;
  }

  function initDerived() {
    RT.aById.clear(); RT.gById.clear(); RT.sById.clear();
    S.animals.forEach(function (a) { RT.aById.set(a.id, a); });
    S.guests.forEach(function (g) { RT.gById.set(g.id, g); if (!RT.groupLead.has(g.group)) RT.groupLead.set(g.group, g.id); });
    S.staff.forEach(function (s) { RT.sById.set(s.id, s); });
    rebuildNav(); rebuildObjects();
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
    return ms[0] || { id: 'meadow', name: 'Grassland Sanctuary', bounds: { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }, gen: { base: 'grass' } };
  }
  function ramp(i, rs, wid) { var f = 0; if (rs) for (var k = 0; k < rs.length; k++) f = Math.max(f, 1 - Math.abs(i - rs[k]) / wid); return f < 0 ? 0 : f; }
  function genMap(md, seed) {
    var g = md.gen || {}, b = md.bounds || { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }, sd = (seed | 0) % 100003, ci, cj, k, i, j, t;
    var baseT = TI[g.base || 'grass']; if (baseT === undefined) baseT = 0;
    var lakes = [], mesas = [], tries;
    var near = function (x, y, r) {
      var dx = Math.max(22 - x, 0, x - 34), dy = Math.max(39 - y, 0);
      return Math.sqrt(dx * dx + dy * dy) > r;
    };
    if (g.lakes) for (k = 0, tries = 0; k < g.lakes.n && tries < 200; tries++) {
      var lr = rng.range(g.lakes.r[0], g.lakes.r[1]), lx = rng.range(b.i0 + lr + 1, b.i1 - lr), ly = rng.range(b.j0 + lr + 1, b.j1 - lr), ok = near(lx, ly, lr + 4);
      for (var q = 0; q < lakes.length && ok; q++) { var ddx = lakes[q].x - lx, ddy = lakes[q].y - ly; if (Math.sqrt(ddx * ddx + ddy * ddy) < lakes[q].r + lr + 3) ok = false; }
      if (ok) { lakes.push({ x: lx, y: ly, r: lr }); k++; }
    }
    if (g.mesas) for (k = 0, tries = 0; k < g.mesas.n && tries < 200; tries++) {
      var mr = g.mesas.r * rng.range(0.8, 1.2), mx = rng.range(b.i0 + mr + 2, b.i1 - mr - 1), my = rng.range(b.j0 + mr + 2, b.j1 - mr - 1), mok = near(mx, my, mr + 5);
      if (g.canyon && Math.abs(my - g.canyon.j) < mr + g.canyon.w + 3) mok = false;
      for (var q2 = 0; q2 < mesas.length && mok; q2++) { var mdx = mesas[q2].x - mx, mdy = mesas[q2].y - my; if (Math.sqrt(mdx * mdx + mdy * mdy) < mesas[q2].r + mr + 3) mok = false; }
      if (mok) { mesas.push({ x: mx, y: my, r: mr, a: rng.range(-PI, PI) }); k++; }
    }
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
      for (k = 0; k < lakes.length; k++) {
        var l = lakes[k], ld = Math.sqrt((ci - l.x) * (ci - l.x) + (cj - l.y) * (cj - l.y)) / l.r;
        if (ld < 1.2) h -= g.lakes.depth * 1.6 * (1 - sstep(ld / 1.2));
      }
      var pdx = Math.max(22 - ci, 0, ci - 34), pdy = Math.max(39 - cj, 0), pf = sstep(Math.sqrt(pdx * pdx + pdy * pdy) / 5);
      var ef = sstep(Math.min(ci, cj, N - ci, N - cj) / 4);
      HF[ci + cj * (N + 1)] = h * pf * ef;
    }
    for (k = 0; k < HF.length; k++) S.elev[k] = clamp(Math.round(HF[k]), -4, 12);
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
        var lk = lakes[k], dl = Math.sqrt((i + 0.5 - lk.x) * (i + 0.5 - lk.x) + (j + 0.5 - lk.y) * (j + 0.5 - lk.y)) / lk.r;
        if (dl < 0.72) ter = WATER; else if (dl < 0.98 && ter !== WATER) ter = TI.dirt;
      }
      if (i >= 21 && i <= 34 && j >= 38) ter = TI.grass;
      S.terrain[t] = ter;
    }
    // starting plants and rocks
    var total = 0, sc = g.scatter || [];
    for (k = 0; k < sc.length && total < 120; k++) {
      var scat = sc[k], want = scat[1], got = 0, allowed = scat[2] || [], opt = scat[3] || {};
      for (tries = 0; tries < want * 30 && got < want && total < 120; tries++) {
        i = rng.int(b.i0, b.i1); j = rng.int(b.j0, b.j1); t = i + j * N;
        if (i >= 21 && i <= 34 && j >= 38) continue;
        if (S.tileObj[t] || S.path[t] || tileSlope(i, j) > 2) continue;
        var tn = D.terrain[S.terrain[t]] ? D.terrain[S.terrain[t]].id : '';
        if (allowed.length && allowed.indexOf(tn) < 0) continue;
        if (opt.nearWater) {
          var nw = false;
          for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) if (Z.inb(i + di, j + dj) && S.terrain[(i + di) + (j + dj) * N] === WATER) nw = true;
          if (!nw) continue;
        }
        if (rawPlace(scat[0], i, j, rng.int(0, 3))) { got++; total++; }
      }
    }
  }

  function applyMap(mapId, seed) {
    var md = mapDef(mapId), bb = md.bounds || { i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
    S.map = { id: md.id, name: md.name, i0: bb.i0, j0: bb.j0, i1: bb.i1, j1: bb.j1 };
    genMap(md, seed !== undefined ? seed : rng.getSeed());
    rebuildNav(); rebuildObjects(); recomputeEnclosures();
    bus.emit('terrain', { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
    bus.emit('elev', { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
    bus.emit('elev:change', { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
  }

  // ---- habitat guide ----
  function habitatGuide() {
    var plants = [], additions = [], species = [];
    D.scenery.forEach(function (sc) {
      var likedBy = D.animals.filter(function (a) { return (a.foliage || []).indexOf(sc.id) >= 0; }).map(function (a) { return a.name; });
      if (sc.terrains) {
        plants.push({
          id: sc.id, name: sc.name,
          terrains: sc.terrains.map(function (id) { return (D.terrain[TI[id]] && D.terrain[TI[id]].name) || id; }),
          likedBy: likedBy, waterEdge: !!sc.waterEdge, emoji: sc.emoji, info: sc.info || ''
        });
      }
      if (sc.inEnclosure !== false && (sc.info || sc.kind === 'shelter' || sc.kind === 'rock' || sc.kind === 'toy')) {
        var needed = [];
        D.animals.forEach(function (a) {
          if ((sc.kind === 'shelter' && a.needsShelter) ||
              (sc.kind === 'rock' && a.needsRocks && sc.id !== 'ice_floe') ||
              (sc.id === 'ice_floe' && a.needsRocks) ||
              ((sc.id === 'carcass_feeder' || sc.id === 'meat_feeder') && (a.predator || a.diet === 'carnivore'))) {
            needed.push(a.name);
          }
        });
        additions.push({
          id: sc.id, name: sc.name, kind: sc.kind, info: sc.info || sc.name,
          neededBy: needed, likedBy: likedBy, emoji: sc.emoji, cost: sc.cost
        });
      }
    });
    D.animals.forEach(function (a) {
      var prefs = [], psum = 0, id;
      for (id in a.terrainPrefs) {
        if (id !== 'water' || a.needsWater) { psum += a.terrainPrefs[id]; prefs.push([id, a.terrainPrefs[id]]); }
      }
      prefs.sort(function (x, y) { return y[1] - x[1]; });
      var needs = [];
      if (a.needsWater) needs.push('Water (6% of enclosure)');
      if (a.needsShelter) needs.push('Shelter (1 per 30 tiles)');
      if (a.needsRocks) needs.push('Rocks (1 per 24 tiles; rugged ground helps)');
      if (a.diet === 'carnivore' || a.predator) needs.push('Meat/Carcass feeder');
      if (a.social) needs.push('Herd of ' + a.social[0] + '-' + a.social[1]);
      needs.push('Enrichment toys (1 per 40 tiles)');
      species.push({
        id: a.id, name: a.name, emoji: a.emoji, predator: !!(a.predator || a.diet === 'carnivore'),
        terrain: prefs.map(function (p) {
          var tn = D.terrain[TI[p[0]]] ? D.terrain[TI[p[0]]].name : p[0];
          return tn + ' ' + Math.round(p[1] / (psum || 1) * 100) + '%';
        }).join(', '),
        plants: (a.foliage || []).map(function (f) { return SC[f] ? SC[f].name : f; }),
        plantIds: (a.foliage || []).slice(),
        needs: needs, space: a.space, minFence: a.minFence
      });
    });
    return { weights: JSON.parse(JSON.stringify(HW)), plants: plants, additions: additions, species: species };
  }

  function newGame(seedOrOpts, maybeOpts) {
    var opts = {};
    if (typeof seedOrOpts === 'number' || typeof seedOrOpts === 'string') {
      opts = maybeOpts || {};
      opts.seed = +seedOrOpts;
    } else if (seedOrOpts && typeof seedOrOpts === 'object') {
      opts = Object.assign({}, seedOrOpts, maybeOpts);
    }
    rng.seed(opts.seed || (Date.now() & 0x7fffffff));
    S = Z.newState(); Z.state = S; RT = newRT();
    var paved = PI_.paved || 1;
    applyDifficulty(opts.difficulty, true);
    if (opts.money) S.money = opts.money;
    var md = mapDef(opts.map), bb = md.bounds || { i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
    S.map = { id: md.id, name: md.name, i0: bb.i0, j0: bb.j0, i1: bb.i1, j1: bb.j1 };
    var i, j;
    for (j = N - 4; j < N; j++) for (i = 25; i <= 30; i++) S.path[i + j * N] = paved;
    for (j = N - 16; j < N - 4; j++) { S.path[27 + j * N] = paved; S.path[28 + j * N] = paved; }
    S.speed = 1;
    genMap(md, rng.getSeed());
    rebuildNav();
    initDerived();
    [['oak', 23, 49], ['oak', 32, 48], ['oak', 24, 41], ['pine', 33, 42], ['oak', 22, 45], ['pine', 31, 39], ['bush', 25, 49], ['bush', 30, 49], ['bush', 25, 44], ['bush', 30, 45],
      ['flower_bed', 24, 52], ['flower_bed', 31, 52], ['lamp', 26, 51], ['lamp', 29, 51]].forEach(function (p) { rawPlace(p[0], p[1], p[2], 0); });
    rebuildObjects();
    recomputeEnclosures();
    ensureInit();
    RT.value = arrivalValue(); RT.rate = arrivalRate();
    msg('Welcome to your new zoo! Build an enclosure, add some animals, and open the gates.', 'info', false);
    bus.emit('reset');
    return S;
  }

  function save() {
    return JSON.stringify({ v: VERSION, rng: rng.getSeed(), ghEMA: RT.ghEMA, nextGroup: RT.nextGroup, s: S }, function (k, v) {
      if (v && typeof v === 'object' && ArrayBuffer.isView(v)) return Z.packArray(v);
      return v;
    });
  }
  var ARR_FIELDS = { terrain: Uint8Array, path: Uint8Array, fenceX: Uint8Array, fenceZ: Uint8Array, tileObj: Int32Array, tileEnc: Int16Array, dirt: Uint8Array };
  var ARR_LEN = { terrain: NN, path: NN, fenceX: N * (N + 1), fenceZ: (N + 1) * N, tileObj: NN, tileEnc: NN, dirt: NN };
  function load(str) {
    var obj, ns;
    try {
      obj = JSON.parse(str);
      if (!obj || (obj.v !== 1 && obj.v !== 2) || !obj.s) return false;
      ns = obj.s;
      for (var f in ARR_FIELDS) {
        var v = ns[f];
        if (v && v.__t) v = Z.unpackArray(v);
        if (!v || v.length !== ARR_LEN[f]) return false;
        ns[f] = v;
      }
      var tpl = Z.newState();
      var ev = ns.elev;
      if (ev && ev.__t) ev = Z.unpackArray(ev);
      if (ev !== undefined && ev !== null) {
        if (ev.length !== (N + 1) * (N + 1)) return false;
        ns.elev = ev;
      } else {
        ns.elev = tpl.elev || new Int8Array((N + 1) * (N + 1));
      }
      if (!ns.map || typeof ns.map.i0 !== 'number') ns.map = tpl.map;
      if (!ns.weather || !ns.weather.type) ns.weather = tpl.weather || { type: 'clear', intensity: 0.6, hoursLeft: 9, next: 'cloudy' };
      if (!ns.activeEvents) ns.activeEvents = [];
      if (!ns.difficulty) ns.difficulty = 'normal';
      if (ns.panic === undefined) ns.panic = 0;
      if (ns.eventAt === undefined) ns.eventAt = tpl.eventAt !== undefined ? tpl.eventAt : -1;
      if (ns.debtWarn === undefined) ns.debtWarn = 0;
      for (var key in tpl) if (ns[key] === undefined) ns[key] = tpl[key];
      ns.stats = Object.assign(tpl.stats, ns.stats);
      if (ns.stats.injuries === undefined) ns.stats.injuries = 0;
      if (ns.stats.compensation === undefined) ns.stats.compensation = 0;
      ns.unlocked = Object.assign({ star: 0 }, ns.unlocked);
    } catch (e) { return false; }
    S = ns; Z.state = S; RT = newRT();
    rng.seed(obj.rng || 1); RT.ghEMA = obj.ghEMA || 65; RT.nextGroup = obj.nextGroup || 1;
    applyDifficulty(S.difficulty);
    recomputeWX();
    var k;
    for (k = 0; k < S.guests.length; k++) {
      var g = S.guests[k];
      g.ti = tileOf(g.x, g.z); g.ni = -1; g.pv = 0; g.ubid = 0; g.bid = 0; g.wt = 0; g.speed = 0; g.nt = rng.next();
      if (g.state === 'leave') { g.gt = 'exit'; g.dk = 'exit'; } else { g.state = 'walk'; g.gt = ''; g.dk = ''; }
      if (g.gt === 'out') g.gt = 'exit';
    }
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k]; a.held = 0; a.claim = 0; a.stuck = 0; a.tg = '';
      if (a.state !== 'escaped' && a.state !== 'sleep' && a.state !== 'sick') a.state = 'idle';
      a.st = rng.range(0.5, 3); a.tx = a.x; a.tz = a.z; a.speed = 0;
    }
    for (k = 0; k < S.staff.length; k++) { var s = S.staff[k]; s.tk = null; s.route = null; s.ri = 0; s.wt = rng.next(); s.speed = 0; s.state = 'idle'; s.ti = tileOf(s.x, s.z); }
    initDerived();
    recomputeEnclosures();
    secondly();
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
      relief: E.relief || 0, cliffTiles: E.cliffs || 0, plantsThriving: E.thrive || 0, plantsStruggling: E.struggle || 0, badPlants: E.struggle || 0 };
    var bySp = {}, k; for (k in E.bySp) bySp[k] = E.bySp[k];
    if (extraSpecies && SP[extraSpecies] && !bySp[extraSpecies]) bySp[extraSpecies] = 0;
    if (extraSpecies && bySp[extraSpecies] !== undefined && E.bySp[extraSpecies]) bySp[extraSpecies] = E.bySp[extraSpecies] + 1;
    for (var sp in bySp) {
      var r = suitFor(e, E, sp, bySp[sp] || 1), name = SP[sp].name;
      out.species[sp] = { suitability: r.value, count: E.bySp[sp] || 0, breakdown: { terrain: r.terrain, space: r.space, foliage: r.foliage, water: r.water, shelter: r.shelter, rocks: r.rocks, social: r.social, clean: r.clean }, issues: r.issues };
      out.suitability[sp] = r.value;
      for (k = 0; k < r.issues.length; k++) out.issues.push(name + ': ' + r.issues[k]);
    }
    var cm = compatibleReport(e); if (cm) out.issues.push(cm);
    return out;
  }
  function compatibleReport(e) {
    if (e.species.length > 1) for (var k = 0; k < e.species.length; k++) if (SP[e.species[k]].diet === 'carnivore') return 'Predators are sharing with other species!';
    return null;
  }
  function animalReport(id) {
    var a = RT.aById.get(id); if (!a) return null;
    var sp = SP[a.species], iss = [];
    if (a.state === 'escaped') iss.push('Escaped! Security or keepers must recapture it');
    if (a.sick) iss.push('Unwell and needs a vet');
    if (a.hunger > 70) iss.push('Hungry'); if (a.thirst > 70) iss.push('Thirsty'); if (a.energy < 25) iss.push('Tired');
    if (a.health < 40) iss.push('Poor health');
    var enc = a.enc ? RT.eMap[a.enc] : null;
    if (enc) {
      var E = RT.encx[enc.id], r = suitFor(enc, E, a.species, E.bySp[a.species] || 1);
      for (var k = 0; k < r.issues.length; k++) iss.push(r.issues[k]);
      if (enc.foodLevel < 0.15) iss.push('Food has run out');
      if (enc.waterLevel < 0.15 && !E.water.length) iss.push('Water has run out');
    }
    return { id: a.id, name: a.name, species: a.species, speciesName: sp.name, sex: a.sex, age: a.age, baby: a.baby, state: a.state, enclosure: enc ? enc.name : null,
      needs: { hunger: a.hunger, thirst: a.thirst, energy: a.energy, health: a.health, happiness: a.happiness }, suitability: enc ? (enc.suitability[a.species] || 0) : 0, issues: iss, fact: sp.fact };
  }
  function guestReport(id) {
    var g = RT.gById.get(id); if (!g) return null;
    return { id: g.id, name: g.name, state: g.state, thought: g.thought, money: g.money, happiness: g.happiness, needs: { hunger: g.hunger, thirst: g.thirst, bladder: g.bladder, energy: g.energy, fun: g.fun } };
  }
  function objectReport(id) {
    var o = RT.oById.get(id); if (!o) return null;
    var def = o.kind === 'building' ? BD[o.type] : SC[o.type], issues = [], connected = true;
    if (o.kind === 'building') {
      connected = buildingConnected(o);
      if (!connected) issues.push('Not connected to a path');
      if (def.type === 'staff') connected = connected;
    }
    var q = RT.bq[o.id], thriving = null, thrivesOn = null, hereName = null;
    if (o.kind === 'scenery' && def.terrains) {
      thriving = plantThrives(o, def);
      thrivesOn = def.terrains.map(function (tid) { return (D.terrain[TI[tid]] && D.terrain[TI[tid]].name) || tid; });
      var t = o.i + o.j * N, hereId = S.terrain[t];
      hereName = D.terrain[hereId] ? D.terrain[hereId].name : 'unknown';
      if (thriving === false) issues.push('Struggling on ' + hereName.toLowerCase() + ' - needs ' + thrivesOn.join('/'));
    }
    return { id: o.id, kind: o.kind, type: o.type, name: def.name, connected: connected, issues: issues, price: o.price, defaultPrice: def.price, uses: o.uses || 0, income: o.income || 0,
      queue: q ? q.q.length : 0, users: q ? q.use : 0, fill: o.fill, upkeep: def.upkeep || 0,
      thriving: thriving, thrivesOn: thrivesOn, terrainHere: hereName, info: def.info || '' };
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
    terraform: terraform, heightAt: heightAt, tileSlope: tileSlope, isCliff: isCliff, inMap: inMap, cornerElev: cornerElev, mapBounds: mapBounds, maps: function () { return D.maps; }, applyMap: applyMap,
    habitatGuide: habitatGuide, plantOk: plantOk,
    paintTerrain: paintTerrain, placePath: placePath, placeFence: placeFence, removeFence: removeFence, placeObject: placeObject, bulldoze: bulldoze,
    undo: undo, canUndo: canUndo, beginStroke: beginStroke, endStroke: endStroke,
    addAnimal: addAnimal, sellAnimal: sellAnimal, moveAnimal: moveAnimal, hireStaff: hireStaff, fireStaff: fireStaff,
    spawnAnimal: function (speciesId, i, j, opts) { opts = opts || {}; var t = i + j * N, enc = encOfTile(t); var a = makeAnimal(speciesId, enc, cxOf(t), czOf(t), !!opts.baby, opts.sex); insertAnimal(a); return a; },
    setTicketPrice: setTicketPrice, setPrice: setPrice, takeLoan: takeLoan, repayLoan: repayLoan, startMarketing: startMarketing, renameEnclosure: renameEnclosure, setSpeed: setSpeed,
    enclosureAt: enclosureAt, enclosureReport: enclosureReport, animalReport: animalReport, ratingBreakdown: ratingBreakdown, isUnlocked: isUnlocked, walkable: walkable,
    // extras
    isLockdown: function () { return !!(RT && RT.lockdown); },
    lockdown: function () { return !!(RT && RT.lockdown); },
    weatherReport: weatherReport, weatherInfo: weatherReport, weatherForecast: weatherForecast, stepWeather: stepWeather, stepEvents: stepEvents,
    activeEvents: function () { return S.activeEvents ? S.activeEvents.slice() : []; },
    triggerEvent: triggerEvent, _fireEvent: triggerEvent,
    diff: diff, _wx: function () { return WX; },
    applyDifficulty: function (id, fresh) { return applyDifficulty(id, fresh); },
    difficultyInfo: function () { return { id: S.difficulty, income: DIFF.income, costs: DIFF.costs, arrivals: DIFF.arrivals, interest: DIFF.interest }; },
    objectReport: objectReport, guestReport: guestReport, footprint: footprintOf, suitabilityFor: suitabilityFor, setOpen: setOpen, isOpenNow: function () { return openNow(); },
    arrivalRate: function () { return RT.rate; }, adultAge: function (id) { return adultAge(SP[id]); }, MARKETING_COST: MARKETING_COST, MAX_GUESTS: MAX_GUESTS, DAY_SECONDS: DAY_SECONDS,
    _rt: function () { return RT; }, _step: function (dt) { step(dt); }
  };
  // headless safety: create a game on load if Z.DATA exists so Z.state is never null
  newGame({ seed: 1 });
})();
