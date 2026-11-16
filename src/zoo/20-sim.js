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
    return {
      fields: {}, pathVer: 1, nb: new Uint8Array(NN), pathTiles: [], block: new Uint8Array(NN), shelter: new Uint8Array(NN),
      gById: new Map(), aById: new Map(), sById: new Map(), oById: new Map(),
      encx: {}, bq: {}, benchOcc: {}, byType: { food: [], drink: [], toilet: [], fun: [], bench: [], bin: [] },
      t1: 0, t2: 0, escAcc: 0, arrAcc: 0, rate: 0.3, arrMul: 1, arrMulT: 0, pendingSpawn: 0,
      escaped: [], guides: [], secCount: 0, keeperCount: 0, vetCount: 0, hasHut: false, hasVet: false, hasEdu: false,
      advice: {}, claim: {}, groupLead: new Map(), nextGroup: 1, dirtyCount: 0, ghEMA: 65, value: 10,
      queue: new Int32Array(NN), prev: new Int32Array(NN), stamp: new Int32Array(NN), stampN: 0, binVer: 0,
      pathMask: null, gh: 65, accSim: 0, eMap: {}, guestCrowd: 0, speciesCount: 0
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
    S.money += amount; S.finance.today[cat] = (S.finance.today[cat] || 0) + amount;
    bus.emit('money', x !== undefined ? { delta: amount, x: x, z: z } : { delta: amount });
  }
  function spend(amount, cat) {
    if (!amount) return;
    S.money -= amount; S.finance.today[cat] = (S.finance.today[cat] || 0) - amount;
    bus.emit('money', { delta: -amount });
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

  function rebuildNav() {
    var nb = RT.nb, pt = RT.pathTiles; pt.length = 0;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var t = i + j * N, m = 0;
      if (S.path[t]) {
        pt.push(t);
        if (j > 0 && S.path[t - N] && !S.fenceX[t]) m |= 1;
        if (i < N - 1 && S.path[t + 1] && !S.fenceZ[(i + 1) + j * (N + 1)]) m |= 2;
        if (j < N - 1 && S.path[t + N] && !S.fenceX[t + N]) m |= 4;
        if (i > 0 && S.path[t - 1] && !S.fenceZ[i + j * (N + 1)]) m |= 8;
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
    if (rot & 1) { var tmp = w; w = h; h = tmp; }
    return { i0: i, j0: j, w: w, h: h };
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
    S.tileObj.fill(0);
    for (var k = 0; k < S.objects.length; k++) {
      var o = S.objects[k]; RT.oById.set(o.id, o);
      var fp = objFootprint(o), def, solid = false, shelter = false;
      if (o.kind === 'building') {
        def = BD[o.type]; solid = true;
        if (def.type === 'food') bt.food.push(o); else if (def.type === 'drink') bt.drink.push(o);
        else if (def.type === 'toilet') bt.toilet.push(o);
        else if (def.type === 'shop' || def.type === 'ride' || def.type === 'info') bt.fun.push(o);
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
    var f = getField('exit'); if (!f) return false;
    var adj = adjacentPathTiles(o);
    for (var k = 0; k < adj.length; k++) if (f[adj[k]] < INF) return true;
    return false;
  }

  // ---- enclosures ----
  function encById(id) { return (RT.eMap && RT.eMap[id]) || null; }
  function encOfTile(t) { var id = S.tileEnc[t]; return id ? encById(id) : null; }

  function recomputeEnclosures() {
    var oldTE = S.tileEnc.slice(), oldById = {}, k, t;
    for (k = 0; k < S.enclosures.length; k++) oldById[S.enclosures[k].id] = S.enclosures[k];
    var lab = new Int16Array(NN), regions = [], stack = RT.queue;
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
      enc.cx = sx / tiles2.length; enc.cz = sz / tiles2.length;
      enc.animals = []; enc.species = []; enc.suitability = enc.suitability || {};
      newEncs.push(enc);
    }
    S.enclosures = newEncs;
    RT.eMap = {}; for (k = 0; k < newEncs.length; k++) RT.eMap[newEncs[k].id] = newEncs[k];
    for (r = 0; r < newEncs.length; r++) buildEncGeom(newEncs[r]);
    // re-home animals
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k], at = tileOf(a.x, a.z), ne = S.tileEnc[at];
      if (a.state === 'escaped' || !a.enc) {
        if (ne) { a.enc = ne; a.state = 'idle'; a.tg = ''; a.st = 1; }
      } else if (ne !== a.enc) {
        if (ne) a.enc = ne;
        else {
          var oldE = a.enc; a.home = oldE; a.enc = 0; a.state = 'escaped'; a.esc = 0; a.claim = 0; a.tg = '';
          S.stats.escapes++; msg('The ' + SP[a.species].name.toLowerCase() + ' ' + a.name + ' has wandered out of its enclosure!', 'bad');
          bus.emit('escape', a);
        }
      }
    }
    refreshEncAnimals();
    for (r = 0; r < newEncs.length; r++) encStats(newEncs[r]);
    RT.fields = {};
    bus.emit('enclosures');
  }

  function buildEncGeom(enc) {
    var E = { feed: -1, drink: [], water: [], shelter: [], toy: [], out: [], terr: new Array(D.terrain.length), fol: {}, trees: 0, rocks: 0, shelters: 0, aes: 0, blocked: 0,
      vis: 0, happy: 60, babies: 0, appeal: 0, nAn: 0, bySp: {} };
    var k, t, d, tiles = enc.tiles;
    for (k = 0; k < E.terr.length; k++) E.terr[k] = 0;
    var minS = 99, seeSum = 0, cnt = 0;
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
            E.fol[o.type] = (E.fol[o.type] || 0) + 1; E.aes += sd.aesthetic;
            if (sd.kind === 'tree' || sd.kind === 'bush') E.trees++;
            if (sd.kind === 'rock') E.rocks++;
            if (sd.kind === 'shelter') E.shelters++;
            if (sd.kind === 'toy') E.toy.push(t);
          }
        }
      }
      if (RT.block[t]) E.blocked++;
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
      if (!RT.block[t] && S.terrain[t] !== WATER && dd < best) { best = dd; bi = t; }
    }
    E.feed = bi >= 0 ? bi : tiles[0];
    // drinking tiles: land tiles next to water
    if (E.water.length) {
      for (k = 0; k < tiles.length; k++) {
        t = tiles[k]; if (S.terrain[t] === WATER || RT.block[t]) continue;
        var ii = t % N, jj = (t - ii) / N;
        if ((ii > 0 && S.terrain[t - 1] === WATER) || (ii < N - 1 && S.terrain[t + 1] === WATER) || (jj > 0 && S.terrain[t - N] === WATER) || (jj < N - 1 && S.terrain[t + N] === WATER)) E.drink.push(t);
      }
    }
    enc.minFence = minS === 99 ? 5 : minS;
    enc.see = cnt ? seeSum / cnt : 1;
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
      E.nAn++; E.happy += a.happiness; E.appeal += SP[a.species].appeal * (a.baby ? 1.5 : 1);
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

  function afterWorldChange(navChanged) {
    if (navChanged) rebuildNav();
    rebuildObjects();
    RT.fields = {};
    recomputeEnclosures();
    RT.rbDirty = true;
  }

  function paintTerrain(i, j, terrainId, radius, opts) {
    opts = opts || {}; var dry = dryOf(arguments);
    var ti = TI[terrainId]; if (ti === undefined) return fail('Unknown terrain');
    radius = +radius || 0;
    var cost = 0, n = 0, i0 = 999, j0 = 999, i1 = -1, j1 = -1, di, dj, list = [];
    var r2 = radius <= 0 ? 0 : radius * radius + 1;
    var rr = Math.ceil(radius);
    for (dj = -rr; dj <= rr; dj++) for (di = -rr; di <= rr; di++) {
      if (radius > 0 && di * di + dj * dj > r2) continue;
      var x = i + di, y = j + dj;
      if (!Z.inb(x, y)) continue;
      var t = x + y * N;
      if (S.terrain[t] === ti) continue;
      if (ti === WATER && (S.path[t] || (S.tileObj[t] && RT.oById.get(S.tileObj[t]) && RT.oById.get(S.tileObj[t]).type !== 'ice_floe'))) continue;
      list.push(t); cost += D.terrain[ti].cost; n++;
      if (x < i0) i0 = x; if (y < j0) j0 = y; if (x > i1) i1 = x; if (y > j1) j1 = y;
    }
    if (!n) return fail(ti === WATER ? 'Nothing to change here (paths and objects block water)' : 'Already that terrain');
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    for (var k = 0; k < list.length; k++) S.terrain[list[k]] = ti;
    spend(cost, 'construction');
    bus.emit('terrain', { i0: i0, j0: j0, i1: i1, j1: j1 });
    afterWorldChange(false);
    return okr(cost);
  }

  function placePath(i, j, pathId, opts) {
    var dry = dryOf(arguments);
    var pid = PI_[pathId]; if (!pid) return fail('Unknown path type');
    if (!Z.inb(i, j)) return fail('Outside the zoo');
    var t = i + j * N;
    if (S.terrain[t] === WATER) return fail("Can't build a path on water");
    if (S.tileObj[t]) return fail('Something is in the way');
    if (S.tileEnc[t]) return fail("Can't lay paths inside an enclosure");
    if (S.path[t] === pid) return fail('Already paved');
    var cost = D.paths[pid - 1].cost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost);
    S.path[t] = pid; spend(cost, 'construction');
    bus.emit('path', { i0: i, j0: j, i1: i, j1: j });
    afterWorldChange(true);
    return okr(cost);
  }

  function fenceCheck(edge) {
    if (!edgeValid(edge)) return 'Outside the zoo';
    var a, b;
    if (edge.axis === 'x') { a = edge.j > 0 ? edge.i + (edge.j - 1) * N : -1; b = edge.j < N ? edge.i + edge.j * N : -1; }
    else { a = edge.i > 0 ? (edge.i - 1) + edge.j * N : -1; b = edge.i < N ? edge.i + edge.j * N : -1; }
    if (a >= 0 && b >= 0 && S.path[a] && S.path[b]) return "Can't fence across a path";
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
    arr[ix] = fid; spend(cost, 'construction');
    bus.emit('fence', { axis: edge.axis, i: edge.i, j: edge.j });
    afterWorldChange(true);
    return okr(cost);
  }
  function removeFence(edge, opts) {
    var dry = dryOf(arguments);
    if (!edgeValid(edge)) return fail('Outside the zoo');
    var arr = edge.axis === 'x' ? S.fenceX : S.fenceZ, ix = edgeIndex(edge);
    if (!arr[ix]) return fail('No fence here');
    var refund = Math.floor(D.fences[arr[ix] - 1].cost * 0.5);
    if (dry) return okr(-refund);
    arr[ix] = 0; earn(refund, 'construction');
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
  function placeObject(type, i, j, rot, opts) {
    var dry = dryOf(arguments);
    if (typeof rot !== 'number') rot = 0; rot = ((rot % 4) + 4) % 4;
    var dk = defOf(type); if (!dk) return fail('Unknown item');
    var def = dk.def, fp = footprint(def, i, j, rot);
    if (def.star > S.unlocked.star) return fail('Needs a ' + def.star + '-star zoo');
    var a, b, inEnc = false, warn = null;
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var x = fp.i0 + a, y = fp.j0 + b;
      if (!Z.inb(x, y)) return fail('Outside the zoo');
      var t = x + y * N;
      if (S.tileObj[t]) return fail('Something is already here');
      if (S.path[t]) return fail('Clear the path first');
      if (S.terrain[t] === WATER && type !== 'ice_floe') return fail("Can't build on water");
      if (S.tileEnc[t]) inEnc = true;
    }
    if (dk.kind === 'building') {
      if (inEnc) return fail("Buildings can't go inside an enclosure");
      if (!adjacentPathExists(fp)) warn = 'Not connected to a path yet';
    } else {
      if (inEnc && def.inEnclosure === false) return fail("Can't place that inside an enclosure");
      if ((type === 'bench' || type === 'bin') && !adjacentPathExists(fp)) return fail('Place it next to a path');
    }
    var cost = def.cost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost, warn ? { warn: warn } : null);
    var o = { id: newId(), kind: dk.kind, type: type, i: i, j: j, rot: rot };
    if (dk.kind === 'building') { o.price = def.price; o.uses = 0; o.income = 0; o.stock = 100; }
    if (type === 'bin') o.fill = 0;
    S.objects.push(o); spend(cost, 'construction');
    afterWorldChange(false);
    bus.emit('objectAdded', o);
    var r = okr(cost, { id: o.id }); if (warn) r.warn = warn;
    return r;
  }

  function removeObjectInternal(o) {
    var k = S.objects.indexOf(o); if (k >= 0) S.objects.splice(k, 1);
    // release guests tied to it
    for (var g = 0; g < S.guests.length; g++) {
      var gu = S.guests[g];
      if (gu.gid === o.id && (gu.gt === 'bld')) { releaseGuest(gu); gu.gt = ''; gu.dk = ''; gu.ni = -1; if (gu.state === 'queue' || gu.state === 'use') gu.state = 'walk'; }
      if (gu.bid === o.id) { releaseGuest(gu); if (gu.state === 'sit') { gu.state = 'walk'; gu.gt = ''; } }
    }
    delete RT.bq[o.id];
    bus.emit('objectRemoved', o);
  }
  function bulldoze(i, j, opts) {
    var dry = dryOf(arguments);
    if (!Z.inb(i, j)) return fail('Outside the zoo');
    var t = i + j * N;
    if (S.tileObj[t]) {
      var o = RT.oById.get(S.tileObj[t]); if (!o) return fail('Nothing here');
      var def = o.kind === 'building' ? BD[o.type] : SC[o.type], refund = Math.floor(def.cost * 0.5);
      if (dry) return okr(-refund);
      removeObjectInternal(o); earn(refund, 'construction');
      afterWorldChange(false);
      return okr(-refund);
    }
    if (S.path[t]) {
      if (isGateTile(i, j)) return fail('The entrance gate must stay open');
      var refund2 = Math.floor(D.paths[S.path[t] - 1].cost * 0.5);
      if (dry) return okr(-refund2);
      S.path[t] = 0; S.dirt[t] = 0; earn(refund2, 'construction');
      bus.emit('path', { i0: i, j0: j, i1: i, j1: j });
      afterWorldChange(true);
      return okr(-refund2);
    }
    return fail('Nothing to remove here');
  }

  // ---- animals ----
  function compatible(enc, spId) {
    var sp = SP[spId];
    for (var k = 0; k < enc.species.length; k++) {
      var o = enc.species[k]; if (o === spId) continue;
      var os = SP[o];
      if (sp.diet === 'carnivore' || os.diet === 'carnivore') return "Predators can't share an enclosure with other species";
    }
    return null;
  }
  function pickAnimalName() {
    var used = {}, k; for (k = 0; k < S.animals.length; k++) used[S.animals[k].name] = 1;
    for (k = 0; k < 20; k++) { var n = rng.pick(D.animalNames); if (!used[n]) return n; }
    return rng.pick(D.animalNames);
  }
  function makeAnimal(spId, enc, x, z, baby, sex) {
    var sp = SP[spId];
    var a = {
      id: newId(), species: spId, name: pickAnimalName(), sex: sex || (rng.chance(0.5) ? 'm' : 'f'),
      age: baby ? 0 : sp.lifespan * rng.range(0.05, 0.4) + 3, baby: !!baby, x: x, z: z, y: 0, heading: rng.range(-PI, PI), speed: 0,
      state: 'idle', enc: enc ? enc.id : 0, hunger: rng.range(10, 35), thirst: rng.range(5, 30), health: 100, happiness: 60, energy: rng.range(70, 100),
      pregnant: 0, tx: x, tz: z, st: rng.range(0.5, 3), tg: '', pt: rng.range(30, 80), stuck: 0, sick: false
    };
    return a;
  }
  function insertAnimal(a) {
    S.animals.push(a); RT.aById.set(a.id, a);
    refreshEncAnimals();
    var e = a.enc ? encById(a.enc) : null; if (e) encStats(e);
    bus.emit('animalAdded', a);
  }
  function adultAge(sp) { return clamp(sp.lifespan * 0.02, 3, 10); }
  function addAnimal(speciesId, i, j, opts) {
    var dry = dryOf(arguments);
    var sp = SP[speciesId]; if (!sp) return fail('Unknown species');
    if (sp.star > S.unlocked.star) return fail('Needs a ' + sp.star + '-star zoo');
    if (!Z.inb(i, j)) return fail('Outside the zoo');
    var t = i + j * N, enc = encOfTile(t);
    if (!enc) return fail('Animals must be placed inside a fenced enclosure');
    if (RT.block[t]) return fail('Something is in the way');
    if (S.terrain[t] === WATER && !sp.needsWater) return fail("That animal can't swim");
    var bad = compatible(enc, speciesId); if (bad) return fail(bad);
    var n = 0; for (var k = 0; k < enc.animals.length; k++) if (RT.aById.get(enc.animals[k]).species === speciesId) n++;
    if (enc.area / (n + 1) < sp.space * 0.5) return fail('Too cramped for another ' + sp.name.toLowerCase());
    if (S.money < sp.cost) return fail('Not enough money');
    if (dry) return okr(sp.cost);
    var cm = 0, cf = 0; for (k = 0; k < enc.animals.length; k++) { var o = RT.aById.get(enc.animals[k]); if (o.species === speciesId) { if (o.sex === 'm') cm++; else cf++; } }
    var a = makeAnimal(speciesId, enc, cxOf(t) + rng.range(-0.5, 0.5), czOf(t) + rng.range(-0.5, 0.5), false, cm > cf ? 'f' : cm < cf ? 'm' : null);
    spend(sp.cost, 'animals');
    insertAnimal(a);
    var E = RT.encx[enc.id], br = E && E.breakdown && E.breakdown[speciesId];
    if (br && br.issues.length) msg('The ' + plural(sp).toLowerCase() + ' might not be happy here: ' + br.issues[0].toLowerCase() + '.', 'info');
    return okr(sp.cost, { id: a.id });
  }
  function sellAnimal(id, opts) {
    var dry = dryOf(arguments);
    var a = RT.aById.get(id); if (!a) return fail('No such animal');
    var sp = SP[a.species], price = Math.round(sp.cost * (a.baby ? 0.3 : 0.5) * (0.5 + a.health / 200));
    if (dry) return okr(-price);
    earn(price, 'animals');
    removeAnimal(a, true);
    return okr(-price);
  }
  function removeAnimal(a, quiet) {
    var k = S.animals.indexOf(a); if (k >= 0) { S.animals[k] = S.animals[S.animals.length - 1]; S.animals.pop(); }
    RT.aById.delete(a.id);
    refreshEncAnimals();
    var e = a.enc ? encById(a.enc) : null; if (e) encStats(e);
    bus.emit('animalRemoved', a);
  }
  function moveAnimal(id, i, j, opts) {
    var dry = dryOf(arguments);
    var a = RT.aById.get(id); if (!a) return fail('No such animal');
    if (!Z.inb(i, j)) return fail('Outside the zoo');
    var t = i + j * N, enc = encOfTile(t); if (!enc) return fail('Animals must be placed inside a fenced enclosure');
    if (RT.block[t]) return fail('Something is in the way');
    var sp = SP[a.species];
    if (S.terrain[t] === WATER && !sp.needsWater) return fail("That animal can't swim");
    if (enc.id !== a.enc) {
      var bad = compatible(enc, a.species); if (bad) return fail(bad);
      var n = 0; for (var k = 0; k < enc.animals.length; k++) if (RT.aById.get(enc.animals[k]).species === a.species) n++;
      if (enc.area / (n + 1) < sp.space * 0.5) return fail('Too cramped');
    }
    if (dry) return okr(0);
    var oldE = a.enc ? encById(a.enc) : null;
    a.x = cxOf(t); a.z = czOf(t); a.enc = enc.id; a.state = 'idle'; a.tg = ''; a.st = 1; a.speed = 0; a.tx = a.x; a.tz = a.z;
    refreshEncAnimals(); encStats(enc); if (oldE) encStats(oldE);
    return okr(0);
  }

  // ---- staff ----
  function hireStaff(type, i, j, opts) {
    var dry = dryOf(arguments);
    var def = STF[type]; if (!def) return fail('Unknown staff type');
    if (S.staff.length >= 40) return fail('Staff limit reached');
    if (typeof i !== 'number') { i = GATE_I0; j = N - 4; }
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
  function fireStaff(id, opts) {
    var dry = dryOf(arguments);
    var s = RT.sById.get(id); if (!s) return fail('No such staff member');
    if (dry) return okr(0);
    var k = S.staff.indexOf(s); S.staff.splice(k, 1); RT.sById.delete(id);
    for (var q in RT.claim) if (RT.claim[q] && RT.claim[q].by === id) delete RT.claim[q];
    for (k = 0; k < S.animals.length; k++) if (S.animals[k].claim === id) { S.animals[k].claim = 0; S.animals[k].held = 0; }
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
  function takeLoan(n, opts) {
    n = Math.round(+n); if (!(n > 0)) return fail('Invalid amount');
    if (S.loan + n > 100000) return fail('The bank will not lend that much');
    if (dryOf(arguments)) return okr(0);
    S.loan += n; earn(n, 'other'); return okr(0);
  }
  function repayLoan(n, opts) {
    n = Math.min(Math.round(+n), S.loan); if (!(n > 0)) return fail('Nothing to repay');
    if (S.money < n) return fail('Not enough money');
    if (dryOf(arguments)) return okr(n);
    S.loan -= n; spend(n, 'other'); return okr(n);
  }
  var MARKETING_COST = 600;
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
      stay: rng.range(45, 85), pv: RT.pathVer, last: 0, bid: 0, fleeT: 0, nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0
    };
    g.px += g.lo * 0.5; g.pz = czOf(t);
    g.money -= 0; // guests arrive with budget; ticket paid below
    var pay = Math.min(S.ticketPrice, g.money);
    S.guests.push(g); RT.gById.set(g.id, g);
    earn(pay, 'tickets', g.x, N * TILE - 1); g.money -= pay;
    S.stats.guestsTotal++; S.stats.guestsToday = (S.stats.guestsToday || 0) + 1;
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
    // final happiness feeds reputation
    RT.ghEMA += (g.happiness - RT.ghEMA) * 0.06;
    S.reputation += (g.happiness - S.reputation) * 0.03;
    S.stats.guestsLeft = (S.stats.guestsLeft || 0) + 1;
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

  function pickBuilding(g, list) {
    var best = null, bs = 1e9, k;
    for (k = 0; k < list.length; k++) {
      var o = list[k], def = BD[o.type], price = o.price === undefined ? def.price : o.price;
      if (price > 0 && g.money < price) continue;
      if (def.price > 0 && price > def.price * 2.4) continue;
      var c = objCentre(o), dx = c.x - g.x, dz = c.z - g.z;
      var q = RT.bq[o.id], sc = Math.sqrt(dx * dx + dz * dz) + rng.next() * 10 + (q ? q.q.length * 5 : 0);
      if (sc < bs) {
        var f = getField('b' + o.id);
        if (f && f[g.ti] < INF) { bs = sc; best = o; }
      }
    }
    if (!best) return false;
    g.gt = 'bld'; g.gid = best.id; g.dk = 'b' + best.id; g.ni = -1; g.wt = 0;
    return true;
  }
  function pickExhibit(g) {
    var encs = S.enclosures, tot = 0, k, w = RT.wbuf || (RT.wbuf = []);
    var lead = RT.groupLead.get(g.group);
    if (lead && lead !== g.id) {
      var lg = RT.gById.get(lead);
      if (lg && lg.gt === 'enc' && lg.gid !== g.last && rng.chance(0.7)) {
        var le = encById(lg.gid); var lf = le && getField('e' + le.id);
        if (lf && lf[g.ti] < INF) { g.gt = 'enc'; g.gid = le.id; g.dk = 'e' + le.id; g.ni = -1; return true; }
      }
    }
    for (k = 0; k < encs.length; k++) {
      var e = encs[k], E = RT.encx[e.id], wt = 0;
      if (E && E.nAn > 0 && e.viewTiles.length) {
        wt = (10 + E.appeal) * (0.15 + 0.85 * e.see);
        var newSp = 0; for (var s = 0; s < e.species.length; s++) if (!g.seen[e.species[s]]) newSp++;
        wt *= 1 + newSp * 0.6;
        var dx = e.cx - g.x, dz = e.cz - g.z; wt /= 1 + Math.sqrt(dx * dx + dz * dz) / 40;
        if (e.id === g.last) wt *= 0.1;
        if (E.vis === 0) wt *= 0.3;
      }
      w[k] = wt; tot += wt;
    }
    if (tot <= 0) return false;
    for (var tries = 0; tries < 3; tries++) {
      var r = rng.next() * tot, acc = 0, pick = -1;
      for (k = 0; k < encs.length; k++) { acc += w[k]; if (r <= acc && w[k] > 0) { pick = k; break; } }
      if (pick < 0) return false;
      var f = getField('e' + encs[pick].id);
      if (f && f[g.ti] < INF) { g.gt = 'enc'; g.gid = encs[pick].id; g.dk = 'e' + encs[pick].id; g.ni = -1; return true; }
      tot -= w[pick]; w[pick] = 0; if (tot <= 0) break;
    }
    return false;
  }

  function chooseGoal(g) {
    var bt = RT.byType;
    if (g.bladder > 70) { if (pickBuilding(g, bt.toilet)) return; if (g.bladder > 90) say(g, 'toilet'); }
    if (g.thirst > 65) { if (pickBuilding(g, bt.drink)) return; if (g.thirst > 80) say(g, 'thirsty'); }
    if (g.hunger > 60) { if (pickBuilding(g, bt.food)) return; if (g.hunger > 80) say(g, 'hungry'); }
    if (g.energy < 32 && g.nbt <= 0) {
      var f = getField('bench');
      if (f && f[g.ti] < INF) { g.gt = 'bench'; g.dk = 'bench'; g.ni = -1; return; }
      g.nbt = 25; say(g, 'noBench');
    }
    if (g.lit) {
      var fb = getField('bin');
      if (fb && fb[g.ti] < 10) { g.gt = 'bin'; g.dk = 'bin'; g.ni = -1; return; }
      if (rng.chance(0.5)) { S.dirt[g.ti] = Math.min(255, S.dirt[g.ti] + 40); g.lit = false; }
    }
    var r = rng.next();
    if (g.fun < 55 && r < 0.35) { if (pickBuilding(g, bt.fun)) return; }
    if (r < 0.85 && pickExhibit(g)) return;
    if (g.fun < 40) say(g, 'bored');
    g.gt = 'wander'; g.dk = ''; g.wt = rng.int(5, 14); g.ni = -1;
  }

  function startUse(g, o) {
    var def = BD[o.type], price = o.price === undefined ? def.price : o.price;
    var q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] });
    if (price > 0) {
      if (g.money < price) { g.gt = ''; g.state = 'walk'; say(g, 'expensive'); return; }
      if (def.price > 0 && price > def.price * 1.5) {
        say(g, 'expensive'); g.mood -= 3;
        if (rng.chance(Math.min(0.9, (price / def.price - 1.4) * 0.6))) { g.gt = ''; g.state = 'walk'; return; }
      } else if (def.price > 0 && price < def.price * 0.6) say(g, 'cheap');
      g.money -= price;
      var cat = (def.type === 'food' || def.type === 'drink') ? 'food' : (def.type === 'toilet' ? 'other' : 'shops');
      earn(price, cat, g.x, g.z); o.income = (o.income || 0) + price;
    }
    q.use++; g.state = 'use'; g.ubid = o.id; g.speed = 0;
    g.wt = def.type === 'ride' ? 12 : def.type === 'food' ? 6 : def.type === 'toilet' ? 5 : def.type === 'drink' ? 3 : 4;
    var c = objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
  }
  function finishUse(g) {
    var o = RT.oById.get(g.ubid), q = RT.bq[g.ubid];
    if (q && q.use > 0) q.use--; g.ubid = 0;
    g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1;
    if (!o) return;
    var def = BD[o.type], s = def.satisfies || {};
    if (s.hunger) g.hunger = Math.max(0, g.hunger - s.hunger * 100);
    if (s.thirst) g.thirst = Math.max(0, g.thirst - s.thirst * 100);
    if (s.bladder) g.bladder = Math.max(0, g.bladder - s.bladder * 100);
    if (s.energy) g.energy = Math.min(100, g.energy + s.energy * 100);
    if (s.fun) { g.fun = Math.min(100, g.fun + s.fun * 100); g.mood += s.fun * 22; }
    if (def.type === 'ride') g.mood += 6;
    if (def.type === 'food' || def.type === 'drink') { g.mood += 3; if (rng.chance(0.8)) g.lit = true; }
    o.uses = (o.uses || 0) + 1;
    if (def.type === 'info' && RT.hasEdu) g.mood += 2;
    if (rng.chance(0.25)) say(g, 'happy');
  }

  function arriveAtGoal(g) {
    if (g.state === 'flee') return;
    var gt = g.gt;
    if (gt === 'bld') {
      var o = RT.oById.get(g.gid);
      if (!o) { g.gt = ''; return; }
      var q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] }), def = BD[o.type];
      var c = objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
      if (q.use < def.capacity && q.q.length === 0) startUse(g, o);
      else if (q.q.length > def.capacity * 3 + 4) { g.gt = ''; say(g, 'crowded'); g.mood -= 2; }
      else { g.state = 'queue'; g.wt = 0; q.q.push(g.id); g.speed = 0; }
    } else if (gt === 'enc') {
      var e = encById(g.gid);
      if (!e) { g.gt = ''; return; }
      g.state = 'watch'; g.wt = rng.range(6, 15); g.speed = 0;
      var best = 1e9, bx = e.cx, bz = e.cz;
      for (var k = 0; k < e.tiles.length; k++) {
        var t = e.tiles[k], dx = cxOf(t) - g.x, dz = czOf(t) - g.z, d = dx * dx + dz * dz;
        if (d < best) { best = d; bx = cxOf(t); bz = czOf(t); }
      }
      g.hd = Math.atan2(bx - g.x, bz - g.z);
    } else if (gt === 'bench') {
      var found = null, benches = RT.byType.bench;
      for (var b = 0; b < benches.length; b++) {
        var bo = benches[b], bx2 = bo.i, bz2 = bo.j, ti = g.ti % N, tj = (g.ti - ti) / N;
        if (Math.abs(bx2 - ti) + Math.abs(bz2 - tj) === 1 && (RT.benchOcc[bo.id] || 0) < 2) { found = bo; break; }
      }
      if (!found) { g.gt = ''; g.nbt = 20; say(g, 'noBench'); return; }
      RT.benchOcc[found.id] = (RT.benchOcc[found.id] || 0) + 1;
      g.bid = found.id; g.state = 'sit'; g.wt = 20; g.speed = 0;
      var bcx = (found.i + 0.5) * TILE, bcz = (found.j + 0.5) * TILE, tcx = cxOf(g.ti), tcz = czOf(g.ti);
      var dxx = bcx - tcx, dzz = bcz - tcz, sl = 0.5 + (RT.benchOcc[found.id] - 1) * 0.0;
      g.x = tcx + dxx * 0.55 + (-dzz) * 0.15 * (RT.benchOcc[found.id] === 1 ? -1 : 1);
      g.z = tcz + dzz * 0.55 + dxx * 0.15 * (RT.benchOcc[found.id] === 1 ? 1 : -1);
      g.hd = Math.atan2(dxx, dzz) + PI * 0 + PI; // face away from the bench, back to it
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
    } else if (gt === 'exit') {
      g.gt = 'out'; g.dk = ''; g.px = g.x + rng.range(-0.5, 0.5); g.pz = N * TILE + 3; g.ni = -2;
    } else g.gt = '';
    g.dk = (g.state === 'walk' && !g.gt) ? '' : g.dk;
  }

  // movement: returns 1 when the guest stands on its goal tile (field distance 0) or finished a wander
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
        // wander: random neighbour, prefer not to reverse
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
    return 0;
  }

  function revalidateGuest(g) {
    g.pv = RT.pathVer;
    var t = tileOf(g.x, g.z);
    if (g.gt === 'out' || g.state === 'sit') return;
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
    g.x = cxOf(best); g.z = czOf(best); g.ti = best; g.ni = -1; g.state = g.state === 'leave' ? 'leave' : 'walk'; if (g.state !== 'leave') { g.gt = ''; g.dk = ''; }
  }

  function guestThink(g, a) {
    var k;
    g.hunger = Math.min(100, g.hunger + 1.05 * a); g.thirst = Math.min(100, g.thirst + 1.35 * a); g.bladder = Math.min(100, g.bladder + 0.95 * a);
    if (g.state !== 'sit') g.energy = Math.max(0, g.energy - 0.85 * a);
    g.fun = Math.max(0, g.fun - 0.8 * a);
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
    var target = 72 + g.mood - pen;
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
      // stuck check
      var fx = getField('exit');
      if (fx && fx[g.ti] === INF) { g.isl += a; if (g.isl > 12) { removeGuest(g); return false; } }
      return;
    }
    // stranded
    var fx2 = getField('exit');
    if (!fx2 || fx2[g.ti] === INF) { g.isl += a; if (g.isl > 25) { removeGuest(g); return false; } } else g.isl = 0;
    // escaped animals
    if (g.state !== 'flee' && RT.escaped.length) {
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
    var e = encById(g.gid), E = e && RT.encx[e.id];
    if (!e || !E || E.nAn === 0) { g.wt = 0; return; }
    if (E.vis === 0) { say(g, 'cantSee'); g.mood -= 2 * a; g.wt = Math.min(g.wt, 1.5); return; }
    if (e.see < 0.35) { say(g, 'cantSee'); g.mood -= 1.5 * a; g.wt = Math.min(g.wt, 2); return; }
    var q = (E.happy / 100) * 0.6 + 0.4 * Math.min(1, E.vis / Math.max(1, E.nAn));
    q *= 0.6 + 0.4 * e.see;
    g.fun = Math.min(100, g.fun + 9 * a * q); g.mood += 3 * a * q;
    for (var s = 0; s < e.species.length; s++) {
      var sp = e.species[s];
      if (!g.seen[sp]) { g.seen[sp] = 1; g.mood += 6; if (rng.chance(0.5)) say(g, 'happy', sp); }
    }
    if (E.happy < 35) { say(g, 'animalsUnhappy'); g.mood -= 3 * a; }
    else {
      if (E.babies > 0 && rng.chance(0.12)) say(g, 'baby', e.species[0]);
      if (q > 0.7) {
        if (rng.chance(0.1)) say(g, 'greatExhibit', e.species[0]);
        if (g.money > 2 && rng.chance(0.03 * a * (RT.hasEdu ? 1.6 : 1))) {
          var amt = Math.min(g.money, Math.round((1 + Math.floor(rng.next() * 4)) * (RT.hasEdu ? 1.5 : 1)));
          g.money -= amt; earn(amt, 'donations', g.x, g.z); S.stats.donations += amt; g.mood += 2;
        }
      }
    }
  }

  function guestStep(g, dt) {
    if (g.pv !== RT.pathVer) { if (revalidateGuest(g) === false) return; }
    var st = g.state;
    if (st === 'walk' || st === 'leave' || st === 'flee') {
      if (g.gt || st === 'flee') {
        var r = guestMove(g, dt);
        if (r === 1) {
          if (st === 'leave') arriveAtGoal(g); else arriveAtGoal(g);
          if (g.gt === 'wander') g.gt = '';
        } else if (r === 2) { removeGuest(g); return; }
      } else g.speed = 0;
    } else {
      g.speed = 0;
      if (st === 'watch') { g.heading = turn(g.heading, g.hd, dt * 6); g.wt -= dt; if (g.wt <= 0) { g.last = g.gid; g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; } }
      else if (st === 'use') { g.heading = turn(g.heading, g.hd, dt * 6); g.wt -= dt; if (g.wt <= 0) finishUse(g); }
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
    for (var id in RT.bq) {
      var q = RT.bq[id], o = RT.oById.get(+id);
      if (!o) { delete RT.bq[id]; continue; }
      var cap = BD[o.type].capacity;
      while (q.q.length && q.use < cap) {
        var g = RT.gById.get(q.q.shift());
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
    return base * priceF * rep * mk * an;
  }

  // ====================== ANIMALS ======================
  function swimmer(sp) { return !!sp.needsWater; }
  function aok(a, t) {
    if (RT.block[t]) return false;
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
  // moves toward (tx,tz); returns true when arrived or given up
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
  function randomEncTile(a, enc, near) {
    for (var k = 0; k < 8; k++) {
      var t = enc.tiles[Math.floor(rng.next() * enc.tiles.length)];
      if (!aok(a, t)) continue;
      if (near && k < 5) { var dx = cxOf(t) - a.x, dz = czOf(t) - a.z; if (dx * dx + dz * dz > near * near) continue; }
      return t;
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

  function decide(a, enc, E, sp) {
    var t = tileOf(a.x, a.z);
    if (!aok(a, t)) { relocateAnimal(a, enc); t = tileOf(a.x, a.z); }
    if (a.sick) { a.state = 'sick'; a.speed = 0; return; }
    var target = -1;
    if (isNight() || a.energy < 18) {
      a.tg = 'sleep';
      if (E.shelter.length && (sp.needsShelter || rng.chance(0.6))) target = E.shelter[Math.floor(rng.next() * E.shelter.length)];
      if (target < 0 || (tileOf(a.x, a.z) === target)) { a.state = 'sleep'; a.speed = 0; a.tg = ''; return; }
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
      a.happiness += (tgt - a.happiness) * 0.05; a.happiness = clamp(a.happiness, 0, 100);
    }
    a.pt -= dt;
    if (a.pt <= 0 && !a.baby) { a.pt = rng.range(55, 95); enc.poop = Math.min(enc.poop + 1, Math.floor(enc.area * 0.5) + 4); }
    var inWater = S.terrain[tileOf(a.x, a.z)] === WATER;
    a.y = inWater ? -0.3 : 0;
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
        a.speed = 0; a.st -= dt; a.happiness = Math.min(100, a.happiness + 1.5 * dt);
        if (a.st <= 0) { a.state = 'idle'; a.st = rng.range(1, 3); }
        break;
    }
  }

  // ---- escapes ----
  function doEscape(a, enc) {
    var E = RT.encx[enc.id], sp = SP[a.species], k, t = -1;
    for (k = 0; k < 6 && E.out.length; k++) {
      var c = E.out[Math.floor(rng.next() * E.out.length)];
      if (!RT.block[c] && !S.tileEnc[c] && S.terrain[c] !== WATER) { t = c; break; }
    }
    if (t < 0 && RT.pathTiles.length) t = RT.pathTiles[Math.floor(rng.next() * RT.pathTiles.length)];
    if (t < 0) return;
    a.home = enc.id; a.enc = 0; a.state = 'escaped'; a.tg = ''; a.esc = 0; a.claim = 0; a.y = 0;
    a.x = cxOf(t) + rng.range(-0.5, 0.5); a.z = czOf(t) + rng.range(-0.5, 0.5); a.tx = a.x; a.tz = a.z; a.speed = 0;
    refreshEncAnimals(); encStats(enc);
    S.stats.escapes++;
    msg('Escape! ' + a.name + ' the ' + sp.name.toLowerCase() + ' has broken out of ' + enc.name + '!' + (sp.danger >= 2 ? ' Guests are in danger.' : ''), 'bad');
    bus.emit('escape', a);
  }
  function recapture(a, by) {
    var enc = a.home ? RT.eMap[a.home] : null;
    if (!enc) {
      var bd = 1e9; for (var k = 0; k < S.enclosures.length; k++) {
        var e = S.enclosures[k], dx = e.cx - a.x, dz = e.cz - a.z, d = dx * dx + dz * dz;
        if (d < bd && !compatible(e, a.species)) { bd = d; enc = e; }
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
    a.esc = (a.esc || 0) + dt;
    a.hunger = Math.min(100, a.hunger + 0.1 * dt); a.thirst = Math.min(100, a.thirst + 0.1 * dt);
    if (a.held) { a.speed = 0; return; }
    var limit = RT.secCount > 0 || RT.keeperCount > 0 ? 300 : 150;
    if (a.esc > limit) { recapture(a, 'Animal control'); return; }
    var arrived = animalMove(a, dt, sp.speed * 1.1);
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
  function staffOnPath(s) {
    var t = tileOf(s.x, s.z);
    if (S.path[t]) { s.ti = t; return true; }
    var i = t % N, j = (t - i) / N, best = -1, bd = 1e9;
    for (var r = 1; r <= 10 && best < 0; r++) for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
      var x = i + di, y = j + dj; if (!Z.inb(x, y) || !S.path[x + y * N]) continue;
      var d = di * di + dj * dj; if (d < bd) { bd = d; best = x + y * N; }
    }
    if (best < 0) return false;
    s.x = cxOf(best); s.z = czOf(best); s.ti = best; s.tk = null; s.route = null;
    return true;
  }

  function startPatrol(s) {
    var pt = RT.pathTiles; if (!pt.length) return false;
    var tgt = pt[Math.floor(rng.next() * pt.length)], hi = s.home % N, hj = (s.home - hi) / N;
    for (var k = 0; k < 4; k++) {
      var c = pt[Math.floor(rng.next() * pt.length)], ci = c % N, cj = (c - ci) / N;
      if (Math.abs(ci - hi) + Math.abs(cj - hj) < 26) { tgt = c; break; }
    }
    var r = findRoute(s.ti, function (t) { return t === tgt; });
    if (!r) return false;
    s.tk = { k: 'patrol', ph: 'go', t: 0 }; s.route = r; s.ri = 0; s.task = s.type === 'guide' ? 'Leading a tour' : s.type === 'security' ? 'On patrol' : 'Walking the paths';
    return true;
  }

  function claimed(key, s) { var c = RT.claim[key]; return c && c.by !== s.id && c.until > S.day + S.time && RT.sById.has(c.by); }

  function tryRecapture(s) {
    for (var k = 0; k < RT.escaped.length; k++) {
      var a = RT.escaped[k];
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

  function assignTask(s) {
    if (!staffOnPath(s)) return;
    var k, a, e;
    if (RT.escaped.length && (s.type === 'security' || (s.type === 'keeper' && RT.secCount === 0))) { if (tryRecapture(s)) return; }
    if (s.type === 'keeper') {
      var range = (RT.hasHut ? 48 : 32) * TILE, hx = cxOf(s.home), hz = czOf(s.home), best = null, bs = 0;
      for (k = 0; k < S.enclosures.length; k++) {
        e = S.enclosures[k]; if (!e.animals.length || !e.viewTiles.length) continue;
        if (claimed('e' + e.id, s)) continue;
        var need = (1 - e.foodLevel) * 1.2 + (1 - e.waterLevel) + e.poop * 0.25;
        if (!(e.foodLevel < 0.6 || e.waterLevel < 0.5 || e.poop >= 2)) continue;
        var dx = e.cx - hx, dz = e.cz - hz, dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > range) continue;
        var sc = need - dist * 0.01; if (!best || sc > bs) { best = e; bs = sc; }
      }
      if (best) {
        var vs = new Set(best.viewTiles), r = findRoute(s.ti, function (t) { return vs.has(t); });
        if (r) {
          RT.claim['e' + best.id] = { by: s.id, until: S.day + S.time + 0.4 };
          s.tk = { k: 'enc', enc: best.id, ph: 'go', t: 0, stage: 0, cleaned: 0, ex: 0, ez: 0, tx: 0, tz: 0 }; s.route = r; s.ri = 0;
          s.task = 'Caring for ' + best.name; return;
        }
      }
    } else if (s.type === 'vet') {
      for (k = 0; k < S.animals.length; k++) {
        a = S.animals[k]; if (!a.sick || !a.enc || (a.claim && a.claim !== s.id && RT.sById.has(a.claim))) continue;
        e = RT.eMap[a.enc]; if (!e || !e.viewTiles.length) continue;
        var vs2 = new Set(e.viewTiles), r2 = findRoute(s.ti, function (t) { return vs2.has(t); });
        if (r2) { a.claim = s.id; s.tk = { k: 'vet', a: a.id, ph: 'go', t: 0, ex: 0, ez: 0 }; s.route = r2; s.ri = 0; s.task = 'Treating ' + a.name; return; }
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
      for (k = 0; k < S.enclosures.length; k++) if (S.enclosures[k].animals.length && S.enclosures[k].viewTiles.length) cands.push(S.enclosures[k]);
      if (cands.length) {
        e = cands[Math.floor(rng.next() * cands.length)];
        var vs3 = new Set(e.viewTiles), r3 = findRoute(s.ti, function (t) { return vs3.has(t); });
        if (r3) { s.tk = { k: 'tour', ph: 'go', t: rng.range(8, 14) }; s.route = r3; s.ri = 0; s.task = 'Guiding visitors at ' + e.name; return; }
      }
    }
    if (!startPatrol(s)) { s.tk = null; s.state = 'idle'; s.speed = 0; s.task = 'Waiting for work'; }
  }

  function staffStep(s, dt) {
    var tk = s.tk, a, enc, E;
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
        if (!enc || !E) { s.tk = null; break; }
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
            if (tk.stage === 0) { enc.foodLevel = 1; enc.waterLevel = 1; tk.stage = 1; tk.t = 1.2; if (enc.poop <= 0) tk.ph = 'out'; }
            else {
              enc.poop = Math.max(0, enc.poop - 1); tk.cleaned++; encStats(enc);
              if (enc.poop <= 0 || tk.cleaned >= 10) tk.ph = 'out'; else tk.t = 1.2;
            }
          }
        } else if (walkTo(s, tk.ex, tk.ez, dt, 2.0)) { delete RT.claim['e' + enc.id]; s.tk = null; s.wt = 0.3; }
        break;
      case 'vet':
        a = RT.aById.get(tk.a);
        if (!a || !a.sick) { s.tk = null; if (a) a.claim = 0; break; }
        if (tk.ph === 'go') { if (walkRoute(s, dt)) { tk.ph = 'in'; tk.ex = s.x; tk.ez = s.z; } }
        else if (tk.ph === 'in') { if (walkTo(s, a.x, a.z, dt, 2.2)) { tk.ph = 'work'; tk.t = 4; } }
        else if (tk.ph === 'work') {
          s.state = 'work'; s.speed = 0; tk.t -= dt;
          if (tk.t <= 0) {
            a.sick = false; a.health = Math.min(100, a.health + 45); a.claim = 0; tk.ph = 'out';
            msg(s.name + ' treated ' + a.name + ' the ' + SP[a.species].name.toLowerCase() + '. It is on the mend.', 'good', false);
          }
        } else if (walkTo(s, tk.ex, tk.ez, dt, 2.2)) { s.tk = null; s.wt = 0.3; }
        break;
      case 'cap':
        a = RT.aById.get(tk.a);
        if (!a || a.state !== 'escaped') { s.tk = null; break; }
        if (tk.ph === 'go') {
          if (s.route && walkRoute(s, dt)) tk.ph = 'chase';
          else if (!s.route) tk.ph = 'chase';
          tk.rr -= dt; if (tk.rr <= 0 && tk.ph === 'go') { tk.rr = 4; var dx = s.x - a.x, dz = s.z - a.z; if (dx * dx + dz * dz > 100) planCapRoute(s, a); }
        } else if (tk.ph === 'chase') {
          if (walkTo(s, a.x, a.z, dt, staffSpeed(s) * 1.1)) { tk.ph = 'work'; tk.t = s.type === 'security' ? 2 : 3.5; a.held = 1; }
        } else {
          s.state = 'work'; s.speed = 0; tk.t -= dt;
          if (tk.t <= 0) { a.held = 0; var who = s.type === 'security' ? 'Security' : s.name + ' the keeper'; s.tk = null; s.wt = 0.5; recapture(a, who); }
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
      A += sp.appeal * (a.baby ? 1.5 : 1) * (a.happiness > 40 ? 1 : 0.5); hs += a.happiness;
    }
    var animalsC = n ? 0.55 * Math.min(1, nSp / 9) + 0.45 * Math.min(1, A / 700) : 0;
    var welfare = n ? clamp((hs / n - 40) / 50, 0, 1) : 0;
    var gNow = S.guests.length > 5 ? (S.guestHappiness || 65) : RT.ghEMA;
    var guests = clamp(((gNow * 0.5 + RT.ghEMA * 0.5) - 40) / 50, 0, 1);
    var ref = Math.max(20, S.stats.peakGuests || 0), bt = RT.byType;
    var fac = (Math.min(1, bt.food.length / Math.ceil(ref / 40)) + Math.min(1, bt.drink.length / Math.ceil(ref / 50)) + Math.min(1, bt.toilet.length / Math.ceil(ref / 40)) +
      Math.min(1, bt.bench.length / Math.ceil(ref / 30)) + Math.min(1, bt.bin.length / Math.ceil(ref / 25)) + Math.min(1, bt.fun.length / (1 + Math.floor(ref / 80)))) / 6;
    var pathN = RT.pathTiles.length, dirtyFrac = RT.dirtyCount / Math.max(8, pathN * 0.3);
    var cleanP = 1 - Math.min(1, dirtyFrac), cleanE = 1, ce = 0;
    for (k = 0; k < S.enclosures.length; k++) { var e = S.enclosures[k]; if (e.animals.length) { cleanE += 0; ce += clamp(1 - e.poop / (e.area / 3 + 3), 0, 1); } }
    var nEncA = 0; for (k = 0; k < S.enclosures.length; k++) if (S.enclosures[k].animals.length) nEncA++;
    var clean = nEncA ? 0.5 * cleanP + 0.5 * ce / nEncA : cleanP;
    var aes = 0; for (k = 0; k < S.objects.length; k++) { var o = S.objects[k]; if (o.kind === 'scenery') aes += SC[o.type].aesthetic; }
    var scenery = Math.min(1, aes / 120);
    var stars = 5 * (0.42 * animalsC + 0.13 * welfare + 0.13 * guests + 0.12 * fac + 0.08 * clean + 0.10 * scenery);
    return { animals: animalsC, welfare: welfare, guests: guests, facilities: fac, cleanliness: clean, scenery: scenery, stars: clamp(stars, 0, 5), rating: S.rating };
  }
  function ratingBreakdown() { return computeRating(); }

  function isUnlocked(kind, id) {
    var def = null;
    if (kind === 'animal' || kind === 'animals') def = SP[id];
    else if (kind === 'building' || kind === 'buildings') def = BD[id];
    else if (kind === 'scenery') def = SC[id];
    else if (kind === 'staff') def = STF[id];
    else if (kind === 'terrain' || kind === 'fence' || kind === 'path') return true;
    if (!def) return false;
    return (def.star || 0) <= S.unlocked.star;
  }

  function checkUnlocks() {
    var now = Math.floor(S.rating + 0.0001);
    if (now > S.unlocked.star) {
      var old = S.unlocked.star; S.unlocked.star = now;
      var names = [];
      D.animals.forEach(function (a) { if (a.star > old && a.star <= now) names.push(a.name); });
      D.buildings.forEach(function (a) { if (a.star > old && a.star <= now) names.push(a.name); });
      msg('Your zoo is now rated ' + now + ' star' + (now > 1 ? 's' : '') + '!' + (names.length ? ' New unlocks: ' + names.join(', ') + '.' : ''), 'good');
    }
  }

  function goalDone(gl) {
    switch (gl.type) {
      case 'guests': return S.stats.guestsTotal >= gl.target;
      case 'animals': return S.animals.length >= gl.target;
      case 'rating': return S.rating >= gl.target;
      case 'money': return S.money >= gl.target;
      case 'species': { var s = {}, c = 0; for (var k = 0; k < S.animals.length; k++) if (!s[S.animals[k].species]) { s[S.animals[k].species] = 1; c++; } return c >= gl.target; }
      case 'babies': return S.stats.babiesBorn >= gl.target;
      case 'happiness': return S.guests.length >= 10 && (S.guestHappiness || 0) >= gl.target;
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

  function secondly() {
    var k, a, e;
    refreshEncAnimals();
    RT.escaped.length = 0; RT.guides.length = 0; RT.secCount = 0; RT.keeperCount = 0; RT.vetCount = 0;
    for (k = 0; k < S.animals.length; k++) if (S.animals[k].state === 'escaped') RT.escaped.push(S.animals[k]);
    for (k = 0; k < S.staff.length; k++) {
      var st = S.staff[k];
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
        if (e.minFence < sp.minFence && RT.advice['f' + key] !== S.day) {
          RT.advice['f' + key] = S.day;
          msg('The ' + lc(plural(sp)) + ' could escape! Their fence is too weak (needs strength ' + sp.minFence + ').', 'bad');
        }
      }
      if (e.foodLevel < 0.2 && RT.keeperCount === 0 && RT.advice['food' + e.id] !== S.day) { RT.advice['food' + e.id] = S.day; msg('Food is running out at ' + e.name + '. Hire a keeper to refill it.', 'bad'); }
    }
    RT.t2++;
    if (RT.t2 % 2 === 0) checkGoals();
    if (S.money < -5000 && !S.gameOver) {
      S.gameOver = true; S.speed = 0;
      msg('The bank has called in your debts. Game over!', 'bad');
      bus.emit('gameOver');
    }
  }

  function fireEvent() {
    var ev = rng.pick(D.events), eff = ev.effect || {}, k;
    var kind = 'info';
    switch (eff.type) {
      case 'guestThirst': for (k = 0; k < S.guests.length; k++) S.guests[k].thirst = Math.min(100, S.guests[k].thirst + eff.amount); break;
      case 'guests': if (eff.amount > 0) RT.pendingSpawn += eff.amount; else { RT.arrMul = 0.3; RT.arrMulT = 45; } break;
      case 'money': earn(eff.amount, 'donations'); kind = 'money'; break;
      case 'cleanliness': for (k = 0; k < RT.pathTiles.length; k++) if (rng.chance(0.35)) S.dirt[RT.pathTiles[k]] = Math.min(255, S.dirt[RT.pathTiles[k]] + Math.abs(eff.amount) * 5); break;
      case 'animalHealth': for (k = 0; k < S.animals.length; k++) S.animals[k].health = Math.min(100, S.animals[k].health + eff.amount); kind = 'good'; break;
      case 'fenceDamage': {
        var cand = S.enclosures.filter(function (e) { return e.animals.length; });
        if (cand.length) { var e = rng.pick(cand); e.breach = 1; ev = { text: ev.text + ' The fence at ' + e.name + ' is damaged and being repaired. Animals might slip out!' }; kind = 'bad'; }
        break;
      }
    }
    msg(ev.text, kind);
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
      var baby = makeAnimal(a.species, e, a.x + rng.range(-0.8, 0.8), a.z + rng.range(-0.8, 0.8), true);
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
          if (rng.chance(sp.breedChance * 0.4 * (0.5 + suit))) fem[z].pregnant = 2;
        }
      }
    }
  }

  function newDay() {
    var k, a, up = 0;
    // costs
    for (k = 0; k < S.animals.length; k++) up += SP[SP[S.animals[k].species] ? S.animals[k].species : 'meerkat'].upkeep * (S.animals[k].baby ? 0.5 : 1);
    for (k = 0; k < S.objects.length; k++) if (S.objects[k].kind === 'building') up += BD[S.objects[k].type].upkeep;
    var wages = 0; for (k = 0; k < S.staff.length; k++) wages += STF[S.staff[k].type].wage;
    up = Math.round(up);
    if (up) spend(up, 'upkeep'); if (wages) spend(wages, 'wages');
    if (S.loan > 0) { var intr = Math.round(S.loan * 0.004); if (intr) spend(intr, 'other'); }
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
    // animals: growth, illness, old age
    for (k = S.animals.length - 1; k >= 0; k--) {
      a = S.animals[k]; var sp = SP[a.species];
      if (a.baby && a.age >= adultAge(sp) * 0.6) { a.baby = false; if (a.enc) msg(a.name + ' the ' + sp.name.toLowerCase() + ' has grown up.', 'info', false); }
      if (a.age > sp.lifespan && rng.chance(0.3)) { animalDie(a, 'peacefully of old age'); continue; }
      if (a.sick) {
        if (RT.vetCount === 0 && rng.chance(0.25)) { a.sick = false; }
      } else if (!a.baby && a.enc) {
        var enc = RT.eMap[a.enc], dirty = enc && enc.poop > enc.area * 0.3 + 2;
        var p = 0.03 * (1.5 - a.happiness / 100) + (dirty ? 0.04 : 0) + (a.hunger > 80 ? 0.05 : 0);
        if (rng.chance(p)) { a.sick = true; a.health = Math.max(20, a.health - 15); msg(a.name + ' the ' + sp.name.toLowerCase() + ' is unwell.' + (RT.vetCount ? '' : ' A vet could help.'), 'bad'); }
      }
    }
    breedingAndBirths();
    if (rng.chance(0.4)) fireEvent();
    if (S.money < 0) msg('You are in the red. Raise ticket prices or cut costs before the bank steps in.', 'bad');
    bus.emit('newDay');
  }

  // ====================== SIM LOOP ======================
  function step(dt) {
    var k;
    S.time += dt / DAY_SECONDS;
    if (S.time >= 1) { S.time -= 1; newDay(); }
    // arrivals
    if (RT.arrMulT > 0) { RT.arrMulT -= dt; if (RT.arrMulT <= 0) RT.arrMul = 1; }
    if (openNow()) {
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
    rebuildNav(); rebuildObjects();
  }

  function newGame(opts) {
    opts = opts || {};
    rng.seed(opts.seed || (Date.now() & 0x7fffffff));
    S = Z.newState(); Z.state = S; RT = newRT();
    var paved = PI_.paved || 1;
    S.money = opts.money || 25000;
    var i, j;
    for (j = N - 4; j < N; j++) for (i = 25; i <= 30; i++) S.path[i + j * N] = paved;
    for (j = N - 16; j < N - 4; j++) { S.path[27 + j * N] = paved; S.path[28 + j * N] = paved; }
    rebuildNav();
    S.speed = 1;
    initDerived();
    [['oak', 23, 49], ['oak', 32, 48], ['oak', 24, 41], ['pine', 33, 42], ['oak', 22, 45], ['pine', 31, 39], ['bush', 25, 49], ['bush', 30, 49], ['bush', 25, 44], ['bush', 30, 45],
      ['flower_bed', 24, 52], ['flower_bed', 31, 52], ['lamp', 26, 51], ['lamp', 29, 51]].forEach(function (p) { rawPlace(p[0], p[1], p[2], 0); });
    rebuildObjects();
    recomputeEnclosures();
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
      if (!obj || obj.v !== VERSION || !obj.s) return false;
      ns = obj.s;
      for (var f in ARR_FIELDS) {
        var v = ns[f];
        if (v && v.__t) v = Z.unpackArray(v);
        if (!v || v.length !== ARR_LEN[f]) return false;
        ns[f] = v;
      }
      var tpl = Z.newState();
      for (var key in tpl) if (ns[key] === undefined) ns[key] = tpl[key];
      ns.stats = Object.assign(tpl.stats, ns.stats);
      ns.unlocked = Object.assign({ star: 0 }, ns.unlocked);
    } catch (e) { return false; }
    S = ns; Z.state = S; RT = newRT();
    rng.seed(obj.rng || 1); RT.ghEMA = obj.ghEMA || 65; RT.nextGroup = obj.nextGroup || 1;
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
      species: {}, suitability: {}, issues: [], animals: e.animals.length, viewTiles: e.viewTiles.length };
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
    var q = RT.bq[o.id];
    return { id: o.id, kind: o.kind, type: o.type, name: def.name, connected: connected, issues: issues, price: o.price, defaultPrice: def.price, uses: o.uses || 0, income: o.income || 0,
      queue: q ? q.q.length : 0, users: q ? q.use : 0, fill: o.fill, upkeep: def.upkeep || 0 };
  }
  function footprintOf(type, i, j, rot) {
    var dk = defOf(type); if (!dk) return null;
    var fp = footprint(dk.def, i, j, rot || 0);
    return { i0: fp.i0, j0: fp.j0, w: fp.w, h: fp.h, cx: (fp.i0 + fp.w / 2) * TILE, cz: (fp.j0 + fp.h / 2) * TILE };
  }
  function suitabilityFor(encId, speciesId) {
    var e = encById(encId), E = e && RT.encx[encId]; if (!e || !SP[speciesId]) return null;
    return suitFor(e, E, speciesId, (E.bySp[speciesId] || 0) + 1);
  }

  Z.Sim = {
    newGame: newGame, tick: tick, save: save, load: load,
    paintTerrain: paintTerrain, placePath: placePath, placeFence: placeFence, removeFence: removeFence, placeObject: placeObject, bulldoze: bulldoze,
    addAnimal: addAnimal, sellAnimal: sellAnimal, moveAnimal: moveAnimal, hireStaff: hireStaff, fireStaff: fireStaff,
    setTicketPrice: setTicketPrice, setPrice: setPrice, takeLoan: takeLoan, repayLoan: repayLoan, startMarketing: startMarketing, renameEnclosure: renameEnclosure, setSpeed: setSpeed,
    enclosureAt: enclosureAt, enclosureReport: enclosureReport, animalReport: animalReport, ratingBreakdown: ratingBreakdown, isUnlocked: isUnlocked, walkable: walkable,
    // extras
    objectReport: objectReport, guestReport: guestReport, footprint: footprintOf, suitabilityFor: suitabilityFor, setOpen: setOpen, isOpenNow: function () { return openNow(); },
    arrivalRate: function () { return RT.rate; }, adultAge: function (id) { return adultAge(SP[id]); }, MARKETING_COST: MARKETING_COST, MAX_GUESTS: MAX_GUESTS, DAY_SECONDS: DAY_SECONDS,
    _rt: function () { return RT; }, _step: function (dt) { step(dt); }
  };
  // headless safety: create a game on load if Z.DATA exists so Z.state is never null
  newGame({ seed: 1 });
})();
