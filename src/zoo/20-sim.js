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
  var GATE_I0 = Math.floor(N / 2) - 1, GATE_J = N - 1;
  var SIZE_MAP = { small: 40, medium: 56, large: 72, huge: 88 };
  function resolveSizeN(mapSize) {
    if (typeof mapSize === 'number' && isFinite(mapSize) && mapSize >= 32 && mapSize <= 128) return Math.round(mapSize);
    if (typeof mapSize === 'string') {
      var k = mapSize.toLowerCase();
      if (SIZE_MAP[k]) return SIZE_MAP[k];
    }
    return 56;
  }
  function sizeIdOfN(n) {
    for (var k in SIZE_MAP) if (SIZE_MAP[k] === n) return k;
    return 'medium';
  }
  function syncGridVars(n) {
    N = n; NN = N * N; EW = N + 1;
    DT4 = [-N, 1, N, -1];
    GATE_I0 = Math.floor(N / 2) - 1;
    GATE_J = N - 1;
    if (RT) {
      if (!RT.wallDist || RT.wallDist.length !== NN) RT.wallDist = new Uint8Array(NN);
      if (!RT.clearDist || RT.clearDist.length !== NN) RT.clearDist = new Uint8Array(NN);
      if (!RT.dpBuf || RT.dpBuf.length !== N + 1) RT.dpBuf = new Int16Array(N + 1);
      if (!RT.queue || RT.queue.length !== NN) { RT.queue = new Int32Array(NN); RT.prev = new Int32Array(NN); RT.stamp = new Int32Array(NN); }
    }
  }
  bus.on('gridsize', syncGridVars);

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
    var rt = {
      fields: {}, pathVer: 1, nb: new Uint8Array(NN), pathTiles: [], block: new Uint8Array(NN), shelter: new Uint8Array(NN),
      wallDist: new Uint8Array(NN), clearDist: new Uint8Array(NN), dpBuf: new Int16Array(N + 1),
      gById: new Map(), aById: new Map(), sById: new Map(), oById: new Map(),
      encx: {}, bq: {}, benchOcc: {}, byType: { food: [], drink: [], toilet: [], fun: [], bench: [], bin: [] },
      t1: 0, t2: 0, escAcc: 0, arrAcc: 0, rate: 0.3, arrMul: 1, arrMulT: 0, pendingSpawn: 0,
      escaped: [], guides: [], secCount: 0, keeperCount: 0, vetCount: 0, mechCount: 0, handyCount: 0, elecCount: 0, hasHut: false, huts: [], hasVet: false, vets: [], hasEdu: false,
      advice: {}, claim: {}, groupLead: new Map(), nextGroup: 1, dirtyCount: 0, ghEMA: 65, value: 10,
      queue: new Int32Array(NN), prev: new Int32Array(NN), stamp: new Int32Array(NN), stampN: 0, binVer: 0,
      pathMask: null, gh: 65, accSim: 0, eMap: {}, guestCrowd: 0, speciesCount: 0,
      undo: undoStack, undoStack: undoStack, stroke: null, curEntry: null, strokeDepth: 0,
      bunkers: [], allBunkers: [], dangerEsc: 0, lockdown: false, hunters: {}, undoBusy: false,
      rides: [], arcades: [], coasters: [],
      attractionDemand: new Map(),
      gstand: new Uint8Array(NN), gtarg: new Uint8Array(NN), gvd: {}, wbuf: [], gload: {},
      comp: new Uint16Array(NN), compN: 0, reachComp: null, gateComps: []
    };
    rt.scomp = rt.comp; rt.gcomp = null; rt.jump = null;
    return rt;
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
    if (cat === 'tickets' || cat === 'food' || cat === 'shops' || cat === 'boats' || cat === 'donations') {
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
  function tileSlope(i, j) { return (i >= 0 && j >= 0 && i < N && j < N) && S.elev ? slopeOfT(i + j * N, S.elev) : 0; }
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
  function entranceTile(i, j) { return i >= Math.floor(N / 2) - 6 && i <= Math.floor(N / 2) + 5 && j >= Math.max(Math.floor(N * 0.68), N - 17); }
  function footprintFlat(fp, maxSlope) {
    if (!S.elev) return true;
    var mn = 99, mx = -99;
    for (var b = 0; b <= fp.h; b++) for (var a = 0; a <= fp.w; a++) {
      var h = S.elev[(fp.i0 + a) + (fp.j0 + b) * EW]; if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return mx - mn <= maxSlope;
  }
  // flatness over only the corners of the dry tiles of a footprint (dry = bool per tile, row-major a + b*w)
  function footprintFlatDry(fp, maxSlope, dry) {
    if (!S.elev) return true;
    var mn = 99, mx = -99;
    for (var b = 0; b < fp.h; b++) for (var a = 0; a < fp.w; a++) {
      if (!dry[a + b * fp.w]) continue;
      for (var db = 0; db <= 1; db++) for (var da = 0; da <= 1; da++) {
        var h = S.elev[(fp.i0 + a + da) + (fp.j0 + b + db) * EW]; if (h < mn) mn = h; if (h > mx) mx = h;
      }
    }
    return mx - mn <= maxSlope;
  }
  // Ferry piers may overhang water along ONE edge strip (depth 1; large terminals depth 2).
  // wet = bool per tile. Returns null when the water pattern is legal, else an error message.
  function pierOverhangCheck(def, fp, wet) {
    var maxD = def.largePier ? 2 : 1, w = fp.w, h = fp.h, a, b, side, d, ok, any = false;
    for (a = 0; a < wet.length; a++) if (wet[a]) { any = true; break; }
    if (!any) return null;
    for (side = 0; side < 4; side++) for (d = 1; d <= maxD; d++) {
      var span = side < 2 ? w : h;
      if (d >= span) continue;
      ok = true;
      for (b = 0; b < h && ok; b++) for (a = 0; a < w; a++) {
        var inStrip = side === 0 ? a < d : side === 1 ? a >= w - d : side === 2 ? b < d : b >= h - d;
        if (!!wet[a + b * w] !== inStrip) { ok = false; break; }
      }
      if (ok) return null;
    }
    return 'Only the seaward edge of a pier may overhang water (max ' + maxD + ' tile' + (maxD > 1 ? 's' : '') + ' deep, keep some land)';
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
    for (var q = 0; q < NN; q++) pp[q] = S.path[q] && (slopeOfT(q, E) < 3 || S.terrain[q] === WATER) ? 1 : 0;   // cliff tiles are impassable; pontoons float
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
    RT.scomp = comp; RT.gcomp = null; RT.jump = null;
    if (Z.Boats) Z.Boats.rebuild();
    refreshReach();
    RT.pathVer++; RT.fields = {};
  }

  function refreshReach() {
    var cn = RT.compN || 0;
    if (!RT.reachComp || RT.reachComp.length <= cn) RT.reachComp = new Uint8Array(cn + 16);
    else RT.reachComp.fill(0);
    var gc = RT.gateComps || [];
    for (var k = 0; k < gc.length; k++) RT.reachComp[gc[k]] = 1;
    if (RT.gcomp) {
      for (var c = 1; c <= cn; c++) for (k = 0; k < gc.length; k++) if (RT.gcomp[c] === RT.gcomp[gc[k]]) RT.reachComp[c] = 1;
    }
  }
  function isParkConnected(t) {
    if (t < 0 || t >= NN) return false;
    if (!RT.reachComp) refreshReach();
    var c = RT.comp[t];
    return !!(c && RT.reachComp && RT.reachComp[c]);
  }
  function canGuestReach(fromT, toT) {
    var fc = fromT >= 0 && fromT < NN ? RT.comp[fromT] : 0;
    var tc = toT >= 0 && toT < NN ? RT.comp[toT] : 0;
    if (!fc || !tc) return false;
    return fc === tc || !!(RT.gcomp && RT.gcomp[fc] === RT.gcomp[tc]);
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
      var jl = RT.jump && RT.jump[t], nd = 4 + (jl ? jl.length : 0);
      for (var d = 0; d < nd; d++) {
        if (d < 4 && !(m & (1 << d))) continue;
        var n = d < 4 ? t + DT4[d] : jl[d - 4];
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
    RT.bunkers = []; RT.allBunkers = [];
    RT.rides = []; RT.arcades = []; RT.coasters = [];
    S.tileObj.fill(0);
    for (var k = 0; k < S.objects.length; k++) {
      var o = S.objects[k]; RT.oById.set(o.id, o);
      var fp = objFootprint(o), def, solid = false, shelter = false;
      if (o.kind === 'building') {
        def = BD[o.type]; solid = true;
        if (def.type === 'food') bt.food.push(o); else if (def.type === 'drink') bt.drink.push(o);
        else if (def.type === 'toilet') bt.toilet.push(o);
        else if (def.type === 'shop' || def.type === 'ride' || def.type === 'arcade' || def.type === 'info') { if (o.type !== 'emergency_bunker') bt.fun.push(o); }
        if (def.type === 'ride') { RT.rides.push(o); if (def.rideKind === 'coaster') RT.coasters.push(o); }
        else if (def.type === 'arcade') RT.arcades.push(o);
        if (o.type === 'emergency_bunker') { RT.bunkers.push(o); RT.allBunkers.push(o); }
        if (o.type === 'keeper_hut') { RT.hasHut = true; RT.huts.push(o); } if (o.type === 'vet_clinic') { RT.hasVet = true; RT.vets.push(o); } if (o.type === 'education_centre') RT.hasEdu = true;
      } else {
        def = SC[o.type];
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
    if (S && S.enclosures && S.enclosures.length) computeEncClearance();
  }

  // Computes wallDist, clearDist, maxWallDist, and inscribedSpan for every enclosure.
  function computeEncClearance() {
    if (!RT.wallDist || RT.wallDist.length !== NN) RT.wallDist = new Uint8Array(NN);
    if (!RT.clearDist || RT.clearDist.length !== NN) RT.clearDist = new Uint8Array(NN);
    if (!RT.queue || RT.queue.length !== NN) { RT.queue = new Int32Array(NN); RT.prev = new Int32Array(NN); RT.stamp = new Int32Array(NN); }
    RT.wallDist.fill(0);
    RT.clearDist.fill(0);
    var q = RT.queue, stamp = RT.stamp, k, d, t, i, j, ni, nj, nt;
    for (var ei = 0; ei < S.enclosures.length; ei++) {
      var e = S.enclosures[ei], tiles = e.tiles;
      if (!tiles || !tiles.length) { e.maxWallDist = 0; e.inscribedSpan = 0; continue; }
      var eid = e.id, minI = N, maxI = -1, minJ = N, maxJ = -1;
      var st1 = ++RT.stampN, qh = 0, qt = 0;
      for (k = 0; k < tiles.length; k++) {
        t = tiles[k]; i = t % N; j = (t - i) / N;
        if (i < minI) minI = i; if (i > maxI) maxI = i;
        if (j < minJ) minJ = j; if (j > maxJ) maxJ = j;
        var isZero = cliffT(t) || i === 0 || j === 0 || i === N - 1 || j === N - 1;
        if (!isZero) {
          for (d = 0; d < 4; d++) {
            if (fenceAt(i, j, d)) { isZero = true; break; }
            ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0);
            nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
            if (S.tileEnc[ni + nj * N] !== eid) { isZero = true; break; }
          }
        }
        if (isZero) { RT.wallDist[t] = 0; stamp[t] = st1; q[qt++] = t; }
      }
      var maxWD = 0;
      while (qh < qt) {
        t = q[qh++]; i = t % N; j = (t - i) / N;
        var nd = RT.wallDist[t] < 255 ? RT.wallDist[t] + 1 : 255;
        for (d = 0; d < 4; d++) {
          ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0);
          nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          nt = ni + nj * N;
          if (S.tileEnc[nt] !== eid || stamp[nt] === st1) continue;
          stamp[nt] = st1; RT.wallDist[nt] = nd;
          if (nd > maxWD) maxWD = nd;
          q[qt++] = nt;
        }
      }
      e.maxWallDist = maxWD;

      var st2 = ++RT.stampN; qh = 0; qt = 0;
      for (k = 0; k < tiles.length; k++) {
        t = tiles[k];
        if (RT.wallDist[t] === 0 || RT.block[t]) { RT.clearDist[t] = 0; stamp[t] = st2; q[qt++] = t; }
      }
      while (qh < qt) {
        t = q[qh++]; i = t % N; j = (t - i) / N;
        var nd2 = RT.clearDist[t] < 255 ? RT.clearDist[t] + 1 : 255;
        for (d = 0; d < 4; d++) {
          ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0);
          nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          nt = ni + nj * N;
          if (S.tileEnc[nt] !== eid || stamp[nt] === st2) continue;
          stamp[nt] = st2; RT.clearDist[nt] = nd2;
          q[qt++] = nt;
        }
      }

      var w = maxI - minI + 1;
      if (!RT.dpBuf || RT.dpBuf.length < w) RT.dpBuf = new Int16Array(Math.max(N + 1, w));
      var dp = RT.dpBuf, maxSpan = 0;
      for (var c = 0; c < w; c++) dp[c] = 0;
      for (j = minJ; j <= maxJ; j++) {
        var prevDiag = 0;
        for (i = minI; i <= maxI; i++) {
          var col = i - minI, old = dp[col];
          t = i + j * N;
          if (S.tileEnc[t] === eid && !cliffT(t)) {
            var v = (col === 0 || j === minJ) ? 1 : 1 + Math.min(dp[col - 1], old, prevDiag);
            dp[col] = v;
            if (v > maxSpan) maxSpan = v;
          } else {
            dp[col] = 0;
          }
          prevDiag = old;
        }
      }
      e.inscribedSpan = maxSpan;
    }
  }

  function buildingConnected(o) {
    var ap = adjacentPathTiles(o);
    if (!ap.length) return false;
    for (var k = 0; k < ap.length; k++) if (isParkConnected(ap[k])) return true;
    return false;
  }

  // ---- enclosures ----
  var FENCE_CREW_FEE = 120, POWER_CREW_FEE = 150;
  function encById(id) { return RT.eMap[id] || null; }
  function encOfTile(t) { var id = S.tileEnc[t]; return id ? encById(id) : null; }

  function findEncFenceEdges(enc) {
    if (!enc || !enc.tiles || !enc.tiles.length) return [];
    var edges = [], seen = {};
    for (var k = 0; k < enc.tiles.length; k++) {
      var t = enc.tiles[k], i = t % N, j = (t - i) / N;
      var checks = [
        ['x', i, j, j === 0 || S.tileEnc[t - N] !== enc.id, S.fenceX[i + j * N]],
        ['x', i, j + 1, j === N - 1 || S.tileEnc[t + N] !== enc.id, S.fenceX[i + (j + 1) * N]],
        ['z', i, j, i === 0 || S.tileEnc[t - 1] !== enc.id, S.fenceZ[i + j * (N + 1)]],
        ['z', i + 1, j, i === N - 1 || S.tileEnc[t + 1] !== enc.id, S.fenceZ[(i + 1) + j * (N + 1)]]
      ];
      for (var c = 0; c < 4; c++) {
        var ch = checks[c];
        if (!ch[3] || !ch[4]) continue;
        var key = ch[0] + ':' + ch[1] + ':' + ch[2];
        if (seen[key]) continue; seen[key] = 1;
        edges.push({ axis: ch[0], i: ch[1], j: ch[2] });
      }
    }
    return edges;
  }
  function isValidEncFenceEdge(enc, edge) {
    if (!enc || !edge) return false;
    var v = edge.axis === 'x' ? S.fenceX[edge.i + edge.j * N] : S.fenceZ[edge.i + edge.j * (N + 1)];
    if (!v) return false;
    var edges = findEncFenceEdges(enc);
    for (var k = 0; k < edges.length; k++) {
      if (edges[k].axis === edge.axis && edges[k].i === edge.i && edges[k].j === edge.j) return true;
    }
    return false;
  }
  function pickBreachEdgeDet(enc, edges) {
    if (!edges || !edges.length) return null;
    var h = ((enc.id * 2654435761) ^ ((S.day || 1) * 2246822519) ^ (Math.floor((S.time || 0) * 10000) * 3266489917)) >>> 0;
    return edges[h % edges.length];
  }
  function ensureBreachEdge(enc) {
    if (!enc) return;
    if (enc.breach > 0) {
      if (!isValidEncFenceEdge(enc, enc.breachEdge)) {
        var edges = findEncFenceEdges(enc);
        enc.breachEdge = pickBreachEdgeDet(enc, edges);
      }
    } else {
      enc.breachEdge = null;
      enc.breachCrew = false;
      enc.breachFix = 0;
    }
  }
  function breachEdgeWorldPos(enc) {
    var ed = enc && enc.breachEdge;
    if (!ed) return { x: enc ? enc.cx : 0, z: enc ? enc.cz : 0 };
    return ed.axis === 'x' ? { x: (ed.i + 0.5) * TILE, z: ed.j * TILE } : { x: ed.i * TILE, z: (ed.j + 0.5) * TILE };
  }
  function breachEnclosure(encOrId) {
    var enc = typeof encOrId === 'object' ? encOrId : encById(encOrId);
    if (!enc) return null;
    enc.breach = 1;
    enc.breachCrew = false;
    enc.breachFix = 0;
    var edges = findEncFenceEdges(enc);
    enc.breachEdge = pickBreachEdgeDet(enc, edges);
    if (enc.breachEdge) bus.emit('fence', enc.breachEdge);
    else bus.emit('fences');
    var wp = breachEdgeWorldPos(enc);
    bus.emit('fenceBreach', { encId: enc.id, name: enc.name, edge: enc.breachEdge, x: wp.x, z: wp.z });
    return enc.breachEdge;
  }
  function repairEnclosureBreach(enc, byName) {
    if (!enc) return;
    var oldEdge = enc.breachEdge;
    enc.breach = 0;
    enc.breachEdge = null;
    enc.breachCrew = false;
    enc.breachFix = 0;
    if (oldEdge) bus.emit('fence', oldEdge);
    else bus.emit('fences');
    bus.emit('fenceFixed', { encId: enc.id, name: enc.name, by: byName || 'Repair crew' });
  }
  function callFenceCrew(encId) {
    var enc = encById(encId);
    if (!enc) return fail('Enclosure not found.');
    if (!(enc.breach > 0)) return fail('This enclosure fence is not broken.');
    if (enc.breachCrew) return fail('Emergency fence crew is already on the way.');
    if (S.money < FENCE_CREW_FEE) return fail('Not enough money (' + fmt(FENCE_CREW_FEE) + ' needed).');
    spend(FENCE_CREW_FEE, 'upkeep');
    enc.breachCrew = true;
    enc.breachFix = 4.5;
    msg('Emergency fence repair crew dispatched to ' + enc.name + ' (' + fmt(FENCE_CREW_FEE) + ').', 'info');
    return okr(FENCE_CREW_FEE);
  }
  function stepBreachCrews(dt) {
    for (var k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k];
      if (e.breach > 0 && e.breachCrew) {
        e.breachFix = Math.max(0, (e.breachFix || 0) - dt);
        if (e.breachFix <= 0) {
          repairEnclosureBreach(e, 'Emergency Fence Crew');
          msg('Emergency fence crew repaired the broken fence panel at ' + e.name + '.', 'good');
        }
      }
    }
  }
  function powerCutEvent() {
    if (!S || !S.activeEvents) return null;
    for (var k = 0; k < S.activeEvents.length; k++) if (S.activeEvents[k].kind === 'powerCut') return S.activeEvents[k];
    return null;
  }
  function powerCutActive() { return !!powerCutEvent(); }
  function callPowerCrew() {
    var ev = powerCutEvent();
    if (!ev) return fail('Power is currently on.');
    if (ev.crew) return fail('Emergency electrician is already on the way.');
    if (S.money < POWER_CREW_FEE) return fail('Not enough money (' + fmt(POWER_CREW_FEE) + ' needed).');
    spend(POWER_CREW_FEE, 'upkeep');
    ev.crew = true;
    ev.until = Math.min(ev.until, S.day + S.time + 4.5 / DAY_SECONDS);
    ev.text = 'Emergency electrician restoring power...';
    msg('Emergency electrician dispatched to restore zoo power (' + fmt(POWER_CREW_FEE) + ').', 'info');
    bus.emit('events', S.activeEvents);
    return okr(POWER_CREW_FEE);
  }
  function resolvePowerCut(byName) {
    if (!S || !S.activeEvents) return false;
    var removed = false;
    for (var k = S.activeEvents.length - 1; k >= 0; k--) {
      if (S.activeEvents[k].kind === 'powerCut') {
        S.activeEvents.splice(k, 1);
        removed = true;
      }
    }
    if (!removed) return false;
    recomputeWX();
    bus.emit('events', S.activeEvents);
    msg((byName || 'Staff') + ' restored zoo power!', 'good');
    return true;
  }

  function recomputeEnclosures() {
    var old = S.enclosures || [], oldTE = S.tileEnc.slice(), oldMap = {}, k;
    for (k = 0; k < old.length; k++) oldMap[old[k].id] = old[k];
    var visited = new Uint8Array(NN), regions = [], newEncs = [], nextEncId = 1;
    for (k = 0; k < old.length; k++) if (old[k].id >= nextEncId) nextEncId = old[k].id + 1;
    S.tileEnc.fill(0);
    RT.encx = {}; RT.eMap = {};

    var stack = [];
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var start = i + j * N;
      if (visited[start]) continue;
      // flood fill candidate region bounded by fences
      stack.length = 0; stack.push(start); visited[start] = 1;
      var tiles = [], leaks = false;
      while (stack.length) {
        var t = stack.pop(); tiles.push(t);
        var ti = t % N, tj = (t - ti) / N, n;
        // north (j - 1)
        if (tj === 0) { if (!S.fenceX[t]) leaks = true; }
        else if (!S.fenceX[t]) { n = t - N; if (!visited[n]) { visited[n] = 1; stack.push(n); } }
        // south (j + 1)
        if (tj === N - 1) { if (!S.fenceX[t + N]) leaks = true; }
        else if (!S.fenceX[t + N]) { n = t + N; if (!visited[n]) { visited[n] = 1; stack.push(n); } }
        // west (i - 1)
        if (ti === 0) { if (!S.fenceZ[ti + tj * (N + 1)]) leaks = true; }
        else if (!S.fenceZ[ti + tj * (N + 1)]) { n = t - 1; if (!visited[n]) { visited[n] = 1; stack.push(n); } }
        // east (i + 1)
        if (ti === N - 1) { if (!S.fenceZ[(ti + 1) + tj * (N + 1)]) leaks = true; }
        else if (!S.fenceZ[(ti + 1) + tj * (N + 1)]) { n = t + 1; if (!visited[n]) { visited[n] = 1; stack.push(n); } }
      }
      if (leaks || tiles.length > MAX_ENC_TILES) continue;
      regions.push(tiles);
    }
    // match existing enclosures by largest tile overlap
    var pairs = [];
    for (var r = 0; r < regions.length; r++) {
      var cnt = {}, tl = regions[r];
      for (k = 0; k < tl.length; k++) { var o = oldTE[tl[k]]; if (o) cnt[o] = (cnt[o] || 0) + 1; }
      for (var oid in cnt) pairs.push([cnt[oid], r, +oid]);
    }
    pairs.sort(function (a, b) { return b[0] - a[0]; });
    var assigned = new Array(regions.length), used = {};
    for (k = 0; k < pairs.length; k++) {
      var pr = pairs[k];
      if (assigned[pr[1]] !== undefined || used[pr[2]]) continue;
      assigned[pr[1]] = pr[2]; used[pr[2]] = 1;
    }
    for (r = 0; r < regions.length; r++) {
      var tiles2 = regions[r];
      var match = assigned[r] !== undefined ? oldMap[assigned[r]] : null;
      var eid = match ? match.id : nextEncId++;
      var name = match ? match.name : ('Enclosure ' + eid);
      var enc = { id: eid, name: name, tiles: tiles2, area: tiles2.length, minFence: 99, see: 1, poop: match ? match.poop : 0, foodLevel: match ? match.foodLevel : 1, waterLevel: match ? match.waterLevel : 1, breach: match ? match.breach : 0, breachEdge: match ? (match.breachEdge || null) : null, breachCrew: match ? !!match.breachCrew : false, breachFix: match ? (match.breachFix || 0) : 0, animals: [], species: [], suitability: {}, viewTiles: [] };
      var sx = 0, sz = 0;
      for (k = 0; k < tiles2.length; k++) { var et = tiles2[k]; S.tileEnc[et] = eid; sx += cxOf(et); sz += czOf(et); }
      enc.cx = tiles2.length ? sx / tiles2.length : N * TILE / 2;
      enc.cz = tiles2.length ? sz / tiles2.length : N * TILE / 2;
      newEncs.push(enc); RT.eMap[eid] = enc;
    }
    S.enclosures = newEncs;
    computeEncClearance();
    // build geometry & interior clearance fields
    for (var r = 0; r < newEncs.length; r++) {
      var e = newEncs[r];
      var E = buildEncGeom(e);
      RT.encx[e.id] = E;
      e.minFence = E.minS === 99 ? 1 : E.minS;
      e.see = E.cnt ? E.seeSum / E.cnt : 0.5;
      e.isCage = !!E.isCage;
      e.enclosureType = e.isCage ? 'cage' : 'open';
      // view tiles
      var seenV = {}, vt = [];
      for (k = 0; k < E.out.length; k++) {
        var ot = E.out[k];
        if (S.path[ot] && !seenV[ot]) { seenV[ot] = 1; vt.push(ot); }
      }
      e.viewTiles = vt;
      ensureBreachEdge(e);
    }
    // re-home animals
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k], at = tileOf(a.x, a.z), ne = S.tileEnc[at];
      if (a.flyover) {
        var ht = tileOf(a.flyover.hx, a.flyover.hz), hne = S.tileEnc[ht];
        if (hne) a.enc = hne;
        else if (!RT.eMap[a.enc]) { a.flyover = null; a.flyAlt = 0; a.enc = 0; }
        continue;
      }
      if (a.state === 'escaped' || !a.enc) {
        if (ne) { a.enc = ne; a.homeEnc = ne; a.state = 'idle'; a.tg = ''; a.st = 1; a.wx = 0; a.wz = 0; a.aroute = null; }
      } else if (ne !== a.enc) {
        if (ne) { a.enc = ne; a.homeEnc = ne; }
        else {
          var oldE = a.enc; a.home = oldE; a.homeEnc = oldE; a.enc = 0; a.state = 'escaped'; a.esc = 0; a.claim = 0; a.tg = ''; a.wx = 0; a.wz = 0; a.aroute = null;
          S.stats.escapes++; msg('The ' + SP[a.species].name.toLowerCase() + ' ' + a.name + ' has wandered out of its enclosure!', 'bad');
          bus.emit('escape', a);
        }
      }
      if (a.enc && !aok(a, at)) { var he = RT.eMap[a.enc]; if (he) relocateAnimal(a, he); }
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
    var minS = 99, seeSum = 0, cnt = 0, slopeSum = 0, allCage = true;
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
        if (!fd.cage) allCage = false;
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
    E.minS = minS; E.seeSum = seeSum; E.cnt = cnt; E.isCage = cnt > 0 && allCage;
    return E;
  }

  function refreshEncAnimals() {
    for (var k = 0; k < S.enclosures.length; k++) { S.enclosures[k].animals.length = 0; S.enclosures[k].species.length = 0; }
    for (k = 0; k < S.animals.length; k++) {
      var a = S.animals[k];
      if (a.state === 'escaped') { a.enc = 0; continue; }
      var t = tileOf(a.x, a.z), eid = (a.flyover && a.enc && RT.eMap[a.enc]) ? a.enc : S.tileEnc[t];
      a.enc = eid;
      if (eid && RT.eMap[eid]) {
        a.homeEnc = eid;
        var enc = RT.eMap[eid];
        enc.animals.push(a.id);
        if (enc.species.indexOf(a.species) < 0) enc.species.push(a.species);
      }
    }
  }

  var HW = { terrain: 0.22, space: 0.2, foliage: 0.12, water: 0.14, shelter: 0.1, rocks: 0.06, social: 0.1, clean: 0.06 };
  function usableEncSpace(enc, E) { return Math.max(0, enc.area - E.blocked * 0.5); }
  function encSpaceDemand(enc, extraSpecies, E) {
    E = E || RT.encx[enc.id];
    return (E ? E.usedSpace || 0 : 0) + (extraSpecies && SP[extraSpecies] ? SP[extraSpecies].space || 0 : 0);
  }
  var ISSUE_TERR = {};
  function animalMetrics(sp, a) {
    if (typeof sp === 'string') sp = SP[sp];
    if (!sp) sp = { id: '', size: 1 };
    var babySc = (a && a.baby) || a === true ? 0.5 : 1;
    var bodyRad = clamp(0.28 + sp.size * 0.56, 0.35, 2.8) * babySc;
    var sepRad = clamp(bodyRad * 0.92, 0.38, 2.5);
    var halfLen = clamp(bodyRad * (sp.id === 'crocodile' || sp.id === 'anaconda' || sp.id === 'nessie' || sp.id === 'purple_dragon' ? 1.8 : 1.3), bodyRad, 4.5);
    var prefClear = bodyRad < 1.0 ? 0 : (bodyRad < 2.2 ? 1 : 2);
    var minSpan = sp.size >= 3.6 ? 6 : sp.size >= 2.2 ? 4 : sp.size >= 1.0 ? 3 : 2;
    return { bodyRad: bodyRad, sepRad: sepRad, halfLen: halfLen, prefClear: prefClear, minSpan: minSpan };
  }
  function suitFor(enc, E, spId, n, projectedDemand) {
    var sp = SP[spId], area = enc.area, k, iss = [];
    if (n < 1) n = 1;
    // terrain
    var prefs = sp.terrainPrefs, hasWaterPref = prefs.water > 0, tot = 0, tcounts = E.terr;
    for (k = 0; k < tcounts.length; k++) { if (k === WATER && !hasWaterPref) continue; tot += tcounts[k]; }
    var l1 = 0, psum = 0, id, top = '', bestDef = 0;
    for (id in prefs) if (id !== 'water' || hasWaterPref) psum += prefs[id];
    if (tot < 1) tot = 1; if (psum <= 0) psum = 1;
    for (k = 0; k < tcounts.length; k++) {
      if (k === WATER && !hasWaterPref) continue;
      var tid = D.terrain[k].id, want = (prefs[tid] || 0) / psum, have = tcounts[k] / tot, diff = want - have;
      l1 += Math.abs(diff);
      if (diff > bestDef) { bestDef = diff; top = tid; }
    }
    var terrain = clamp(1 - l1 / 2, 0, 1);
    if (terrain < 0.7) {
      if (!top) { var tv = 0; for (id in prefs) if (prefs[id] > tv) { tv = prefs[id]; top = id; } }
      iss.push('Prefers ' + (D.terrain[TI[top]] ? D.terrain[TI[top]].name.toLowerCase() : top) + ' terrain');
    }
    // space
    var available = usableEncSpace(enc, E), demand = projectedDemand === undefined ? E.usedSpace : projectedDemand;
    var space = demand > 0 ? clamp(available / demand, 0, 1) : 1;
    if (demand > available) iss.push('Enclosure is overcrowded');
    if (space < 0.8) iss.push(space < 0.5 ? 'Needs a much bigger enclosure' : 'Needs a bigger enclosure');
    var m = animalMetrics(sp);
    if (enc.inscribedSpan !== undefined && enc.inscribedSpan < m.minSpan) {
      space *= clamp(enc.inscribedSpan / m.minSpan, 0.25, 1);
      iss.push('Enclosure is too narrow (needs at least ' + m.minSpan + '×' + m.minSpan + ' wide)');
    }
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
    var companion = 1;
    if (sp.companion) {
      var compSp = SP[sp.companion];
      if (!hasRequiredCompanion(E, sp)) {
        companion = 0;
        iss.push('Needs ' + (compSp ? compSp.name : sp.companion) + ' in the same enclosure');
      }
    }
    var clean = clamp(1 - enc.poop / (area / 3 + 3), 0, 1);
    if (clean < 0.6) iss.push('Enclosure is dirty');
    var wts = 0.22 + 0.2 + 0.12 + wW + sW + rW + 0.1 + 0.06;
    var v = (terrain * 0.22 + space * 0.2 + foliage * 0.12 + water * wW + shelter * sW + rocks * rW + social * 0.1 + clean * 0.06) / wts;
    v = clamp(v, 0, 1);
    var luxB = Z.Resort ? Z.Resort.enclosureBonus(enc) : null;
    if (luxB && luxB.isLuxury && luxB.welfareBonus) v = clamp(v + luxB.welfareBonus, 0, 1);
    if (enc.minFence < sp.minFence) iss.push('Fence is too weak (needs strength ' + sp.minFence + ')');
    if (sp.needsCage && !enc.isCage) {
      iss.push('Needs a roofed cage enclosure (use Primate cage fences)');
      v *= 0.65;
    }
    if (!companion) v = Math.min(v * 0.2, 0.15);
    return { value: v, terrain: terrain, space: space, foliage: foliage, water: water, shelter: shelter, rocks: rocks, social: social, companion: companion, clean: clean, issues: iss };
  }

  function encStats(enc) {
    var E = RT.encx[enc.id]; if (!E) return;
    var bySp = {}, k;
    E.vis = 0; E.babies = 0; E.appeal = 0; E.happy = 0; E.nAn = 0; E.usedSpace = 0;
    for (k = 0; k < enc.animals.length; k++) {
      var a = RT.aById.get(enc.animals[k]); if (!a) continue;
      bySp[a.species] = (bySp[a.species] || 0) + 1;
      E.usedSpace += (SP[a.species] && SP[a.species].space) || 0;
      E.nAn++; E.happy += a.happiness; E.appeal += a.appeal || (SP[a.species] ? SP[a.species].appeal * (a.baby ? 1.5 : 1) : 30);
      if (a.baby) E.babies++;
      if (a.state !== 'sleep' && a.state !== 'sick' && !RT.shelter[tileOf(a.x, a.z)]) E.vis++;
    }
    E.happy = E.nAn ? E.happy / E.nAn : 60;
    var luxB = Z.Resort ? Z.Resort.enclosureBonus(enc) : null;
    if (luxB && luxB.isLuxury) {
      if (luxB.appealMul) E.appeal *= luxB.appealMul;
      if (luxB.welfareBonus) E.happy = clamp(E.happy + luxB.welfareBonus * 100, 0, 100);
    }
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
    RT.gaesT = 0;
    RT.glmPv = -1;
    if (Z.Boats) { Z.Boats.rebuild(); refreshReach(); }
    recomputeEnclosures();
    if (Z.Coaster) Z.Coaster.updateGraph();
    if (Z.Coaster) Z.Coaster.update();
    if (Z.Resort) Z.Resort.recompute();
    RT.value = arrivalValue();
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
    var tdef = D.terrain[ti];
    if ((tdef.star || 0) > S.unlocked.star) return fail('Unlocks at ' + tdef.star + ' stars');
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
      if (ti !== WATER && S.path[t] && D.paths[S.path[t] - 1].pontoon) continue;
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
    var floating = !!D.paths[pid - 1].pontoon;
    if (floating !== (S.terrain[t] === WATER)) return fail(floating ? 'Pontoons need open water' : 'Needs flat dry land');
    if (!floating && cliffT(t)) return fail('Too steep — level the ground first');
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
    if ((def.star || 0) > S.unlocked.star) return fail('Unlocks at ' + def.star + ' stars');
    var a, b, inEnc = false, warn = null, isPier = !!(def.boatPier), wet = null, anyWet = false;
    if (isPier) wet = [];
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var x = fp.i0 + a, y = fp.j0 + b;
      if (!Z.inb(x, y) || !inMap(x, y)) return fail('Outside your land');
    }
    for (a = 0; a < fp.w; a++) for (b = 0; b < fp.h; b++) {
      var t = (fp.i0 + a) + (fp.j0 + b) * N;
      if (S.tileObj[t]) return fail('Something is already here');
      if (S.path[t]) return fail('Clear the path first');
      if (S.terrain[t] === WATER && type !== 'ice_floe' && !isPier) return fail('Needs flat dry land');
      if (S.tileEnc[t]) inEnc = true;
    }
    if (isPier) {
      for (b = 0; b < fp.h; b++) for (a = 0; a < fp.w; a++) {
        var wt = S.terrain[(fp.i0 + a) + (fp.j0 + b) * N] === WATER; wet[a + b * fp.w] = wt; if (wt) anyWet = true;
      }
      var oc = pierOverhangCheck(def, fp, wet); if (oc) return fail(oc);
    }
    if ((fp.w > 1 || fp.h > 1) && fenceInside(fp)) return fail('Blocked by a fence');
    if (dk.kind === 'building') {
      var dryFlat = anyWet ? footprintFlatDry(fp, 1, wet.map(function (v) { return !v; })) : footprintFlat(fp, 1);
      if (!dryFlat) return fail('Too steep — level the ground first');
      if (inEnc) return fail("Buildings can't go inside an enclosure");
      if (Z.Coaster) { var cr = Z.Coaster.placeCheck(type, fp); if (cr) return fail(cr); }
      if (Z.Boats) { var br = Z.Boats.placeCheck(type, fp); if (br) return fail(br); }
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
    RT.attractionDemand.delete(o.id);
    var k = S.objects.indexOf(o); if (k >= 0) S.objects.splice(k, 1);
    for (var g = 0; g < S.guests.length; g++) {
      var gu = S.guests[g];
      if ((gu.gid === o.id && (gu.gt === 'bld' || gu.gt === 'bunker' || gu.shel)) || gu.ubid === o.id) {
        releaseGuest(gu); gu.gt = ''; gu.gid = 0; gu.dk = ''; gu.pk = ''; gu.ni = -1; gu.glide = 0;
        if (gu.state === 'queue' || gu.state === 'use') gu.state = 'walk';
        gu.shel = 0; gu.ubid = 0;
      }
      if (gu.bid === o.id) { releaseGuest(gu); gu.glide = 0; if (gu.state === 'sit') { gu.state = 'walk'; gu.gt = ''; gu.gid = 0; } }
    }
    delete RT.bq[o.id];
    if (Z.Coaster && o.kind === 'building' && BD[o.type] && BD[o.type].coasterStation) Z.Coaster.onStationRemoved(o);
    if (Z.Boats && o.kind === 'building' && BD[o.type] && BD[o.type].boatPier) Z.Boats.onPierRemoved(o);
    if (Z.Resort) Z.Resort.onObjectRemoved(o);
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
    if (Z.Coaster && Z.Coaster.hasTrack(t)) return Z.Coaster.removeTiles([t], opts);
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
          if (W.terrain[t] === WATER && !D.paths[op.old - 1].pontoon) return 'That tile is now water';
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
          if (W.terrain[t] === WATER && op.o.type !== 'ice_floe' && !(sn.def && sn.def.boatPier)) return 'That spot is now water';
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
      case 'x': return op.check ? op.check(W) : null;
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
        case 'x': if (op.undo) op.undo(); break;
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
  function isPredator(sp) { return !!(sp && (sp.predator || sp.diet === 'carnivore')); }
  function isPackHunter(sp) { return !!(sp && isPredator(sp) && (sp.packHunter || (sp.social && sp.social[0] >= 2))); }
  function animalBulk(a) { var sp = SP[a.species]; return ((sp && sp.size) || 1) * (a.baby ? 0.45 : 1); }
  function combatPower(a) {
    var sp = SP[a.species], d = (sp && sp.danger) || 0;
    var p = animalBulk(a) * (1 + d * 0.28) * (isPredator(sp) ? 1.18 : 1.0);
    var hm = 0.4 + 0.6 * clamp(a.health / 100, 0, 1);
    if (a.injured) hm *= 0.72;
    if (a.sick) hm *= 0.65;
    return Math.max(0.15, p * hm);
  }
  function gatherPack(leader, enc) {
    if (!enc || !isPackHunter(SP[leader.species])) return [leader];
    var mates = [], k;
    for (k = 0; k < enc.animals.length; k++) {
      var m = RT.aById.get(enc.animals[k]);
      if (!m || m === leader || m.species !== leader.species || m.baby || m.sick || m.injured ||
          m.state === 'escaped' || m.state === 'sleep' || m.state === 'fight') continue;
      var dx = m.x - leader.x, dz = m.z - leader.z;
      mates.push({ a: m, d2: dx * dx + dz * dz });
    }
    mates.sort(function (u, v) { return u.d2 - v.d2; });
    var pack = [leader], lim = Math.min(3, mates.length);
    for (k = 0; k < lim; k++) pack.push(mates[k].a);
    return pack;
  }
  function packPower(pack) {
    if (!pack || !pack.length) return 0;
    var tot = combatPower(pack[0]);
    for (var i = 1; i < pack.length; i++) tot += 0.65 * combatPower(pack[i]);
    return tot;
  }
  function isCompanionPair(aId, bId) {
    var a = SP[aId], b = SP[bId];
    if (!a || !b) return false;
    if (a.companion === bId || b.companion === aId) return true;
    if (a.companionGroup && b.companionGroup && a.companionGroup === b.companionGroup) return true;
    return false;
  }
  function hasRequiredCompanion(E, sp) {
    if (!sp || !sp.companion) return true;
    return !!(E && E.bySp && E.bySp[sp.companion] > 0);
  }
  function compatible(enc, spId) {
    return null;
  }
  function mixWarn(enc, spId) {
    var sp = SP[spId], isP = isPredator(sp);
    for (var k = 0; k < enc.species.length; k++) {
      var o = enc.species[k]; if (o === spId) continue;
      if (isCompanionPair(spId, o)) continue;
      if (isP || isPredator(SP[o])) return 'Predators in this enclosure may hunt smaller animals or fight rival predators.';
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
    var fixedSex = sp && sp.fixedSex;
    return {
      id: newId(), species: spId, name: pickAnimalName(), sex: fixedSex || sex || (rng.chance(0.5) ? 'm' : 'f'),
      age: baby ? 0 : adultAge(sp), baby: !!baby, enc: enc ? enc.id : 0, homeEnc: enc ? enc.id : 0, state: 'idle',
      x: x, z: z, y: 0, heading: rng.range(-PI, PI), speed: 0,
      hunger: rng.range(10, 40), thirst: rng.range(10, 40), energy: rng.range(60, 95), health: 100, happiness: 75,
      stuck: 0, st: rng.range(1, 3), tx: x, tz: z, tg: '', sick: false, injured: false, fid: 0, fightCd: 0,
      pregnant: 0, esc: 0, pt: rng.range(30, 90),
      flyCooldown: sp && sp.canFlyOver ? rng.range(40, 90) : 0, flyover: null, flyAlt: 0
    };
  }
  function countSpeciesInZoo(spId) {
    var n = 0;
    for (var k = 0; k < S.animals.length; k++) if (S.animals[k].species === spId) n++;
    return n;
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
    if (sp.breedOnly) return fail(sp.name + ' cannot be adopted — breed Puss in Boots + Purple Dragon instead');
    if (sp.star > S.unlocked.star) return fail('Needs a ' + sp.star + '-star zoo');
    if (sp.maxCount && countSpeciesInZoo(speciesId) >= sp.maxCount) return fail('You can only have ' + sp.maxCount + ' ' + sp.name + ' in the zoo at a time');
    if (!Z.inb(i, j)) return fail('Outside the zoo');
    var t = i + j * N, enc = encOfTile(t);
    if (!enc) return fail('Place animals inside an enclosure');
    if (RT.block[t]) return fail('Something is in the way');
    if (cliffT(t)) return fail('Too steep for animals');
    if (S.terrain[t] === WATER && !sp.needsWater) return fail("That animal can't swim");
    var badComp = compatible(enc, speciesId);
    if (badComp) return fail(badComp);
    var m = animalMetrics(sp, opts && opts.baby);
    if (enc.inscribedSpan !== undefined && enc.inscribedSpan < m.minSpan) return fail('Enclosure is too narrow for ' + lc(sp.name) + ' (needs at least ' + m.minSpan + '×' + m.minSpan + ' open tiles)');
    var used = encSpaceDemand(enc, speciesId), available = usableEncSpace(enc, RT.encx[enc.id]);
    if (used > available) return fail('This enclosure does not have enough space for another ' + lc(sp.name) + ' (' + Math.ceil(used - available) + ' tiles over capacity)');
    var warn = mixWarn(enc, speciesId);
    var cost = sp.cost;
    if (S.money < cost) return fail('Not enough money');
    if (dry) return okr(cost, warn ? { warn: warn } : undefined);
    var a = makeAnimal(speciesId, enc, cxOf(t), czOf(t), !!opts.baby, opts.sex);
    spend(cost, 'animals');
    insertAnimal(a);
    msg(a.name + ' the ' + sp.name.toLowerCase() + ' arrived at ' + enc.name + '.', 'good');
    var extra = { id: a.id };
    if (warn) extra.warn = warn;
    return okr(cost, extra);
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
  function stripFromFights(id) {
    if (!S || !S.fights || !S.fights.length) return;
    for (var k = S.fights.length - 1; k >= 0; k--) {
      var f = S.fights[k], ai = f.attackers.indexOf(id), di = f.defenders.indexOf(id);
      if (ai >= 0) f.attackers.splice(ai, 1);
      if (di >= 0) f.defenders.splice(di, 1);
    }
  }
  function removeAnimal(a) {
    stripFromFights(a.id);
    a.fid = 0;
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
    if (RT.block[t]) return fail('Something is in the way');
    if (cliffT(t)) return fail('Too steep for animals');
    var sp = SP[a.species];
    if (S.terrain[t] === WATER && !sp.needsWater) return fail("That animal can't swim");
    var badComp = compatible(enc, a.species);
    if (badComp) return fail(badComp);
    if (enc.id !== a.enc) {
      var m = animalMetrics(sp, a);
      if (enc.inscribedSpan !== undefined && enc.inscribedSpan < m.minSpan) return fail('Enclosure is too narrow for ' + lc(sp.name) + ' (needs at least ' + m.minSpan + '×' + m.minSpan + ' open tiles)');
      var used = encSpaceDemand(enc, a.species), available = usableEncSpace(enc, RT.encx[enc.id]);
      if (used > available) return fail('This enclosure does not have enough space for another ' + lc(sp.name) + ' (' + Math.ceil(used - available) + ' tiles over capacity)');
    }
    var warn = mixWarn(enc, a.species);
    if (dry) return okr(0, warn ? { warn: warn } : undefined);
    stripFromFights(a.id);
    a.x = cxOf(t); a.z = czOf(t); a.tx = a.x; a.tz = a.z;
    a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0;
    a.enc = enc.id; a.homeEnc = enc.id;
    a.state = 'idle'; a.st = 1; a.tg = ''; a.hid = 0; a.fid = 0; a.esc = 0; a.flyover = null; a.flyAlt = 0;
    refreshEncAnimals();
    for (var k = 0; k < S.enclosures.length; k++) encStats(S.enclosures[k]);
    msg(a.name + ' was moved to ' + enc.name + '.', 'info');
    return okr(0, warn ? { warn: warn } : undefined);
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
    var stTile = tileOf(sx, sz);
    var s = {
      id: newId(), type: type, name: rng.pick(D.guestNames), x: sx, z: sz,
      heading: PI, speed: 0, state: 'idle', task: 'Ready for duty',
      wage: stf.wage, ti: stTile, home: stTile, tk: null, route: null, ri: 0, wt: 0, lo: rng.range(-0.4, 0.4)
    };
    S.staff.push(s); RT.sById.set(s.id, s);
    spend(cost, 'wages');
    bus.emit('staffAdded', s);
    return okr(cost, { id: s.id });
  }
  function releaseClaims(s) {
    if (!s) return;
    for (var q in RT.claim) if (RT.claim[q] === s.id || (RT.claim[q] && RT.claim[q].by === s.id)) delete RT.claim[q];
  }
  function fireStaff(id) {
    var k = -1; for (var q = 0; q < S.staff.length; q++) if (S.staff[q].id === id) { k = q; break; }
    if (k < 0) return fail('Staff member not found');
    var s = S.staff.splice(k, 1)[0]; RT.sById.delete(id);
    releaseClaims(s);
    bus.emit('staffRemoved', s);
    return okr(0);
  }

  // ---- economy ----
  var MARKETING_COST = 500;
  function setTicketPrice(p) { p = clamp(Math.round(p), 0, 50); S.ticketPrice = p; bus.emit('ticketPrice', p); }
  function setPrice(objId, p) {
    var o = RT.oById.get(objId); if (!o || o.kind !== 'building') return fail('Not a shop');
    var price = clamp(Math.round(p), 0, 100);
    if (o.price !== price) RT.attractionDemand.delete(objId);
    o.price = price;
    return okr(0);
  }
  // Keep the current and previous two in-game hours of observed choices.
  function attractionHour() { return Math.floor((S.day + S.time) * 24); }
  function recordAttractionDemand(id, field) {
    var now = attractionHour(), buckets = RT.attractionDemand.get(id);
    if (!buckets) { buckets = []; RT.attractionDemand.set(id, buckets); }
    var bucket = buckets[buckets.length - 1];
    if (!bucket || bucket.hour !== now) {
      while (buckets.length && buckets[0].hour < now - 2) buckets.shift();
      bucket = { hour: now, selected: 0, priceRejected: 0, queueRejected: 0 };
      buckets.push(bucket);
    }
    bucket[field]++;
  }
  function attractionDemand(id) {
    var out = { selected: 0, priceRejected: 0, queueRejected: 0 }, buckets = RT && RT.attractionDemand.get(id);
    if (!buckets) return out;
    var oldest = attractionHour() - 2;
    buckets.forEach(function (b) {
      if (b.hour < oldest) return;
      out.selected += b.selected; out.priceRejected += b.priceRejected; out.queueRejected += b.queueRejected;
    });
    return out;
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
    if (g.thoughtT > 0 || g.tcool > 0) return;
    var list = D.guestThoughts[thoughtKey]; if (!list || !list.length) return;
    var text = rng.pick(list);
    if (/{animal}/.test(text)) {
      var nm = 'animals';
      if (spId && SP[spId]) nm = lc(plural(SP[spId]));
      else if (S.animals.length) { var an = S.animals[Math.floor(rng.next() * S.animals.length)]; nm = lc(plural(SP[an.species])); }
      text = text.replace(/{animal}/g, nm);
    }
    g.thought = text; g.thoughtKey = thoughtKey; g.thoughtT = 4.5; g.tcool = 7;
  }

  function arrivalValue() {
    var spCount = 0, seen = {};
    for (var k = 0; k < S.animals.length; k++) { var a = S.animals[k]; if (!seen[a.species] && a.enc) { seen[a.species] = 1; spCount++; } }
    RT.speciesCount = spCount;
    var ap = 0; for (k = 0; k < S.animals.length; k++) { var q = S.animals[k]; if (q.enc && q.happiness > 40) ap += SP[q.species].appeal * (q.baby ? 1.5 : 1); } RT.appeal = ap;
    var attr = gxAttractionInfo(true), rideCount = attr.rides, arcadeCount = attr.arcades;
    var cb = Z.Coaster ? Z.Coaster.valueBonus() : 0;
    var rideRaw = rideCount * 0.8 + arcadeCount * 0.35 + cb;
    var rideValue = 4.5 * (1 - Math.exp(-rideRaw / 4.5));
    return 6 + S.rating * 3.5 + Math.min(8, spCount) * 0.9 + rideValue;
  }

  // ---- visit-plan helpers (all durations are in GAME hours, derived from DAY_SECONDS) ----
  function gxHr() { return DAY_SECONDS / 24; }
  function gxRideOperating(o) {
    var d = BD[o.type];
    if (!buildingConnected(o) || o.paused || o.broken) return false;
    if (d.coasterStation) return !!(Z.Coaster && Z.Coaster.stationReady(o.id));
    return true;
  }
  function gxAttractionInfo(force) {
    if (!force && RT.gxAttrInfo && Math.abs(S.time - RT.gxAttrStamp) < 1 / DAY_SECONDS) return RT.gxAttrInfo;
    var n = 0, rides = 0, arcades = 0, coaster = false, k;
    if (RT.rides) for (k = 0; k < RT.rides.length; k++) if (gxRideOperating(RT.rides[k])) { n++; if (BD[RT.rides[k].type].coasterStation) coaster = true; else rides++; }
    if (RT.arcades) for (k = 0; k < RT.arcades.length; k++) if (gxRideOperating(RT.arcades[k])) { n++; arcades++; }
    RT.gxAttrStamp = S.time; RT.gxAttrInfo = { count: n, rides: rides, arcades: arcades, coaster: coaster };
    return RT.gxAttrInfo;
  }
  function gxGrid() {
    if (RT.gocc) return;
    RT.gocc = new Uint8Array(NN); RT.gstand = new Uint8Array(NN); RT.gtarg = new Uint8Array(NN); RT.ghead = new Int16Array(NN).fill(-1); RT.gnext = new Int16Array(MAX_GUESTS + 16); RT.gaesInit = 0;
    RT.gaes = new Float32Array(NN); RT.gaesT = 0; RT.gload = {}; RT.glm = []; RT.glmPv = -1; RT.gvd = {}; RT.gqt = 0;
  }
  function gxKind(o) {
    var def = BD[o.type];
    if (def.type === 'food') return (def.satisfies && def.satisfies.hunger > 0.25) ? 'meal' : 'treat';
    if (def.type === 'drink') return 'drink';
    if (def.type === 'toilet') return 'toilet';
    if (def.type === 'shop') return 'shop';
    if (def.type === 'arcade') return 'act';
    if (def.type === 'ride' || def.type === 'info') return 'act';
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
  function gxPlan(g, hr, ticket) {
    if (!g.al && g.seen) {
      for (var sk in g.seen) if (/^\d+$/.test(sk)) delete g.seen[sk];
    }
    var left = Math.max(0, (CLOSE_T - S.time) * DAY_SECONDS);
    var attr = gxAttractionInfo(), hasTP = attr.count > 0;
    var h = rng.range(4.0, 5.6); if (rng.chance(0.2)) h += rng.range(0.6, 1.6);
    if (hasTP) h += rng.range(1.2, 2.2);
    g.stay0 = Math.min(h * hr, Math.max(hr * 0.5, left - rng.range(0.3, 3.2) * hr));
    g.stay = g.stay0;
    g.tol = rng.range(1.05, 1.9);
    g.thor = rng.range(0.75, 1.0);
    g.tiredAt = rng.range(28, 46);
    g.al = {
      meal: rng.chance(0.7) ? 1 + (rng.chance(0.1) ? 1 : 0) : 0,
      drink: rng.chance(0.97) ? 1 + (rng.chance(0.5) ? 1 : 0) : 0,
      treat: hasTP ? (rng.chance(0.55) ? 1 + (rng.chance(0.25) ? 1 : 0) : 0) : (rng.chance(0.2) ? 1 : 0),
      shop: rng.chance(0.13) ? 1 : 0,
      act: hasTP ? (2 + (rng.chance(0.55) ? 1 : 0) + (attr.coaster ? 1 : 0)) : (rng.chance(0.25) ? 1 : 0)
    };
    g.seenEnc = g.seenEnc || {}; g.seenB = g.seenB || {};
    g.spent = g.spent || 0; g.paid = ticket || 0; g.nSeen = 0; g.nView = 0;
    g.prettyE = 0.3; g.nbuy = 0; g.done = 0; g.strollNext = 0; g.idle = 0; g.gAge = 0; g.ix = g.x; g.iz = g.z; g.glide = 0; g.sx = g.x; g.sz = g.z; g.spot = 0; g.lm = 0; g.wat = 0;
  }

  function spawnGuest(group, first, pad) {
    gxGrid();
    var gi = GATE_I0 + (rng.chance(0.5) ? 1 : 0), t = gi + GATE_J * N;
    if (pad) t = pad.t;
    else if (!S.path[t]) { t = GATE_I0 + GATE_J * N; if (!S.path[t]) return null; }
    var price = S.ticketPrice, mood = clamp(12 - Math.max(0, price - RT.value) * 1.5, -25, 12), hr = gxHr();
    var budget = rng.range(0.55, 1.45) * rng.range(0.6, 1.5) * 17 * (0.85 + 0.06 * S.rating);
    if (pad) { budget *= 3.5; mood = 12; }
    var g = {
      id: newId(), name: rng.pick(D.guestNames), seed: Math.floor(rng.next() * 1e9), x: pad ? pad.x : cxOf(t) + rng.range(-0.8, 0.8), z: pad ? pad.z : N * TILE + rng.range(0.3, 1.4),
      heading: PI, speed: 0, state: 'walk', hunger: rng.range(6, 38), thirst: rng.range(4, 36), bladder: rng.range(0, 34), energy: rng.range(72, 100),
      happiness: 70, money: Math.round(budget), thought: '', thoughtT: 0, seen: {}, group: group,
      ti: t, ni: t, px: cxOf(t), pz: czOf(t), lo: rng.range(-0.7, 0.7), lo2: rng.range(-0.5, 0.5), bs: rng.range(2.6, 3.4),
      gt: '', gid: 0, dk: '', wt: 0, nt: rng.range(0.1, 0.9), acc: 0, tcool: rng.range(0, 3), fun: rng.range(50, 90), mood: mood, lit: false,
      stay: 60, pv: RT.pathVer, last: 0, bid: 0, fleeT: 0, nbt: 0, isl: 0, hd: 0, fx: 0, fz: 0, unr: 0, shel: 0, ubid: 0
    };
    g.px += g.lo * 0.5; g.pz = czOf(t);
    var pay = pad ? pad.fee : S.ticketPrice;
    gxPlan(g, hr, pay);
    if (pad) { g.vip = 1; g.tol *= 1.5; g.al.shop = 1; g.al.treat = 1; g.al.act += 1; g.stay += hr; g.stay0 += hr; }
    S.guests.push(g); RT.gById.set(g.id, g);
    earn(pay, 'tickets', g.x, pad ? g.z : N * TILE - 1);
    S.stats.guestsTotal++; S.stats.guestsToday = (S.stats.guestsToday || 0) + 1;
    if (!RT.groupLead.has(group)) RT.groupLead.set(group, g.id);
    bus.emit('guestAdded', g);
    return g;
  }

  function releaseGuest(g) {
    if (Z.Coaster) Z.Coaster.release(g);
    if (Z.Boats) Z.Boats.release(g);
    if (g.state === 'use' && g.ubid) { var q = RT.bq[g.ubid]; if (q && q.use > 0) q.use--; g.ubid = 0; }
    if (g.state === 'queue' && g.gid) { var q2 = RT.bq[g.gid]; if (q2) { var k = q2.q.indexOf(g.id); if (k >= 0) q2.q.splice(k, 1); } }
    if (g.state === 'sit' && g.bid) { if (RT.benchOcc[g.bid] > 0) RT.benchOcc[g.bid]--; g.bid = 0; g.x = cxOf(g.ti) + g.lo * 0.5; g.z = czOf(g.ti); }
  }
  function removeGuest(g) {
    releaseGuest(g);
    var k = S.guests.indexOf(g); if (k >= 0) { S.guests[k] = S.guests[S.guests.length - 1]; S.guests.pop(); }
    RT.gById.delete(g.id);
    if (RT.groupLead.get(g.group) === g.id) RT.groupLead.delete(g.group);
    RT.ghEMA += (g.happiness - RT.ghEMA) * 0.06;
    S.reputation += (g.happiness - S.reputation) * 0.03;
    S.stats.guestsLeft = (S.stats.guestsLeft || 0) + 1;
    bus.emit('guestRemoved', g);
  }
  function startLeaving(g) {
    if (g.state === 'leave') return;
    releaseGuest(g);
    g.state = 'leave'; g.glide = 0; g.gt = 'exit'; g.dk = 'exit'; g.ni = -1; g.fleeT = 0; g.wt = 0;
    g.thoughtT = 0; g.tcool = 0; say(g, 'leaving');
    if (g.vip && Z.Boats) Z.Boats.vipLeave(g);
  }

  function objCentre(o) {
    var fp = objFootprint(o);
    return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE };
  }

  function pickBunker(g, an) {
    var best = null, bd = 21;
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
    var aura = Z.Resort ? Z.Resort.securityAura(g.x, g.z) : null;
    var damp = aura && aura.protected ? aura.panicDamp : 1;
    an.hurtT = 5;
    spend(comp, 'other');
    if (!S.stats) S.stats = {};
    S.stats.injuries = (S.stats.injuries || 0) + 1;
    S.stats.compensation = (S.stats.compensation || 0) + comp;
    S.panic = Math.min(2, (S.panic || 0) + 0.3 * damp);
    S.reputation = clamp(S.reputation - 3 * damp, 0, 100);
    g.mood -= 40 * damp; g.happiness = Math.min(g.happiness, aura && aura.protected ? 25 : 8);
    msg('A guest was hurt by ' + an.name + ' the ' + lc(SP[an.species].name) + '! The zoo paid ' + fmt(comp) + ' in compensation.', 'bad');
    bus.emit('injury', { guest: g, animal: an, compensation: comp });
    startLeaving(g);
  }

  function pickBuilding(g, list, kind, bargainMin) {
    var bargainOnly = bargainMin !== undefined, bestAttraction = false;
    var best = null, bestPlan = null, bs = 1e9, k, rejected = 0, cand = 0, tolE = g.tol * clamp(WX.spend, 0.5, 1.6);
    for (k = 0; k < list.length; k++) {
      var o = list[k], def = BD[o.type];
      if (def.resortRole === 'lodging') continue;
      if (kind === 'cover') { if (!gxIndoor(o)) continue; }
      else if (gxKind(o) !== kind) continue;
      if (def.coasterStation) { if (!Z.Coaster || !Z.Coaster.stationReady(o.id)) continue; }
      if (kind === 'act' && g.seenB[o.id]) continue;
      var attraction = kind === 'act' && (def.type === 'ride' || def.type === 'arcade');
      if (attraction && (o.paused || o.broken)) continue;
      var price = o.price === undefined ? def.price : o.price;
      var refPrice = (def.coasterStation && Z.Coaster) ? Z.Coaster.recommendedPrice(o.id) : def.price;
      var discount = attraction && refPrice > 0 ? clamp(1 - price / refPrice, 0, 1) : 0;
      if (bargainOnly && (discount <= 0 || discount <= bargainMin)) continue;
      if (price > 0 && g.al[kind] !== undefined && g.al[kind] <= 0) continue;
      var f = getField('b' + o.id), plan = null, walkD;
      if (f && f[g.ti] < INF) walkD = f[g.ti];
      else {
        plan = kind === 'act' && Z.Boats && Z.Boats.plan(g, 'b' + o.id);
        if (!plan) continue;
        walkD = plan.dist;
      }
      cand++;
      if (price > 0 && (price > g.money * (kind === 'act' ? 0.9 : 0.8) || (refPrice > 0 && price > refPrice * tolE))) {
        rejected++;
        if (attraction && !bargainOnly) recordAttractionDemand(o.id, 'priceRejected');
        continue;
      }
      var q = RT.bq[o.id], ql = q ? q.q.length : 0;
      var cap = Math.max(5, Math.ceil(def.capacity * 1.5) + 2);
      if (ql >= cap) {
        if (attraction && !bargainOnly) recordAttractionDemand(o.id, 'queueRejected');
        continue;
      }
      var sc = walkD * (kind === 'act' ? 0.85 : 1.6) + rng.next() * (kind === 'act' ? 24 : 12) + ql * 5 + (q ? q.use / Math.max(1, def.capacity) * 8 : 0);
      var effThrill = (def.coasterStation && Z.Coaster) ? Z.Coaster.stationExcitement(o.id) * 0.7 : (def.thrill || 0);
      if (kind === 'act') sc -= effThrill * 1.8 + (def.type === 'ride' ? 7 : 1) + discount * 4;
      if (sc < bs) { bs = sc; best = o; bestAttraction = attraction; bestPlan = plan; }
    }
    if (!best) {
      if (!bargainOnly && cand > 0 && rejected === cand && kind !== 'cover') {
        say(g, 'expensive'); g.mood -= 1.5;
        if (g.al[kind] !== undefined) g.al[kind] = 0;
      }
      if (!bargainOnly) g.nbuy = gxHr() * 0.35;
      return false;
    }
    if (bestAttraction) recordAttractionDemand(best.id, 'selected');
    g.gt = 'bld'; g.gid = best.id; g.dk = 'b' + best.id; g.ni = -1; g.wt = 0; g.gAge = 0; g.pk = kind;
    if (bestPlan) Z.Boats.start(g, bestPlan);
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
  function gxPickSpot(g, e) {
    var vt = e.viewTiles, best = -1, bs = 1e9, gi = g.ti % N, gj = (g.ti - gi) / N, k;
    for (k = 0; k < vt.length; k++) {
      var t = vt[k]; if (!canGuestReach(g.ti, t)) continue;
      var ti = t % N, tj = (t - ti) / N, occ = RT.gstand[t] + RT.gtarg[t], cap = 2;
      var sc = (Math.abs(ti - gi) + Math.abs(tj - gj)) * 0.45 + gxEncDist(e, t) * 2.2 + occ * 4 + rng.next() * 3.5 + (occ >= cap ? 60 : 0);
      if (g.lastSpot === t) sc += 5;
      if (sc < bs) { bs = sc; best = t; }
    }
    return best;
  }
  function gxGoExhibit(g, e) {
    var t = gxPickSpot(g, e);
    if (t < 0) return false;
    var f = getField('t' + t), plan = null;
    if (!f || !(f[g.ti] < INF)) {
      plan = Z.Boats && Z.Boats.plan(g, 't' + t);
      if (!plan) return false;
    }
    g.gt = 'enc'; g.gid = e.id; g.dk = 't' + t; g.spot = t; g.ni = -1; g.gAge = 0; RT.gtarg[t]++;
    if (plan) Z.Boats.start(g, plan);
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
      reachMap = {}; reachMap[gc] = true;
      if (RT.gcomp) for (var rc = 1; rc <= RT.compN; rc++) if (RT.gcomp[rc] === RT.gcomp[gc]) reachMap[rc] = true;
    }
    for (k = 0; k < encs.length; k++) {
      var e = encs[k], E = RT.encx[e.id], wt = 0;
      var okR = false;
      if (E && E.nAn > 0 && e.viewTiles.length && reachMap) {
        for (var vi = 0; vi < e.viewTiles.length; vi++) if (reachMap[RT.comp[e.viewTiles[vi]]]) { okR = true; break; }
      }
      if (okR) {
        wt = (8 + E.appeal) * (0.2 + 0.8 * e.see);
        var newSp = 0; for (var s = 0; s < e.species.length; s++) if (!g.seen[e.species[s]]) newSp++;
        wt *= g.seenEnc[e.id] ? 0.1 : 5 + newSp * 0.5;
        var dx = e.cx - g.x, dz = e.cz - g.z; wt /= 1 + Math.sqrt(dx * dx + dz * dz) / 30;
        wt /= 1 + (load[e.id] || 0) / 5;
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
  }
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
    if (WX.thirst > 1.25 && g.thirst > 75 && al.drink <= 0 && !g.hot && g.money > 5) { g.hot = 1; al.drink = 1; }
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
      if (rng.chance(0.5)) { S.dirt[g.ti] = Math.min(255, S.dirt[g.ti] + Math.round(40 * (WX.dirt || 1))); g.lit = false; }
    }
    if (WX.shelter && !g.cov) { g.cov = 1; if (rng.chance(0.5) && pickBuilding(g, bt.food.concat(bt.fun), 'cover')) return; }
    if (g.nbuy <= 0) {
      var hasTP = gxAttractionInfo().count > 0;
      var sawEx = g.nSeen > 0 || !RT.speciesCount;
      if (al.shop > 0 && (g.done || g.stay < 1.4 * hr || rng.chance(0.06)) && pickBuilding(g, bt.fun, 'shop')) return;
      if (al.treat > 0 && g.happiness > 50 && rng.chance(hasTP ? (sawEx ? 0.24 : 0.12) : 0.12) && pickBuilding(g, bt.food, 'treat')) return;
      if (al.act > 0 || rng.chance(0.1)) {
        var baseActChance = hasTP ? (sawEx ? 0.5 : 0.25) : 0.3, actRoll = rng.next();
        var bargainChance = 0.12; // A free ride can add at most 12 percentage points to this decision.
        if (actRoll < baseActChance) {
          if (pickBuilding(g, bt.fun, 'act')) return;
        } else if (hasTP && actRoll < baseActChance + bargainChance &&
          pickBuilding(g, bt.fun, 'act', (actRoll - baseActChance) / bargainChance)) return;
      }
    }
    if (g.strollNext) { g.strollNext = 0; if (gxStroll(g)) return; }
    if (!g.done && pickExhibit(g)) return;
    if (g.fun < 40) say(g, 'bored');
    if (rng.chance(0.6) && gxStroll(g)) return;
    g.gt = 'wander'; g.dk = ''; g.wt = rng.int(5, 12); g.ni = -1;
  }

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
      if (g.money < price || (def.price > 0 && price > def.price * tolE)) {
        g.gt = ''; g.dk = ''; g.state = 'walk'; g.glide = 0; g.ni = -1; say(g, 'expensive'); g.mood -= 1.5; g.nbuy = hr * 0.35;
        if (g.al[kind] !== undefined) g.al[kind] = 0;
        return;
      }
      if (def.price > 0 && price < def.price * 0.6) say(g, 'cheap');
      g.money -= price; g.spent += price; g.nbuy = hr * 0.7;
      if (g.al[kind] > 0) g.al[kind]--;
      var cat = (def.type === 'food' || def.type === 'drink') ? 'food' : (def.type === 'toilet' ? 'other' : 'shops');
      earn(price, cat, g.x, g.z); o.income = (o.income || 0) + price;
      if (def.resort && Z.Resort) Z.Resort.recordSpend(o, price);
    }
    q.use++; g.state = 'use'; g.ubid = o.id; g.speed = 0; g.seenB[o.id] = 1;
    g.wt = def.rideKind === 'coaster' ? 11 : def.type === 'ride' ? 9 : def.type === 'arcade' ? 5 : def.type === 'food' ? (kind === 'treat' ? 3 : 6) : def.type === 'toilet' ? 4 : def.type === 'drink' ? 3 : 4;
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
    if (def.rideKind === 'coaster') { g.mood += 5; g.happiness = Math.min(100, g.happiness + 8); if (rng.chance(0.55)) say(g, 'coaster'); }
    else if (def.type === 'ride') { g.mood += 3.5; g.happiness = Math.min(100, g.happiness + 5); if (rng.chance(0.35)) say(g, 'coaster'); }
    else if (def.type === 'arcade') { g.mood += 2.5; g.happiness = Math.min(100, g.happiness + 4); if (rng.chance(0.5)) say(g, 'arcade'); }
    if (o.type === 'candy_floss' || o.type === 'popcorn_stand') { if (rng.chance(0.45)) say(g, 'candyFloss'); }
    if (def.type === 'food' || def.type === 'drink') { g.mood += 1; if (rng.chance(0.6)) g.lit = true; }
    o.uses = (o.uses || 0) + 1;
    if (S.stats) {
      S.stats.ridesTaken = (S.stats.ridesTaken || 0) + (def.type === 'ride' ? 1 : 0);
      S.stats.arcadePlayed = (S.stats.arcadePlayed || 0) + (def.type === 'arcade' ? 1 : 0);
    }
    if (def.type === 'ride' || def.type === 'arcade') recordRatingRide(o.id, def.type === 'ride' ? (def.thrill || 4) : 4);
    if (def.type === 'info' && RT.hasEdu) g.mood += 2;
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
      var o = RT.oById.get(g.gid); if (!o) { g.gt = ''; return; }
      var q = RT.bq[o.id] || (RT.bq[o.id] = { use: 0, q: [] }), def = BD[o.type];
      var c = objCentre(o); g.hd = Math.atan2(c.x - g.x, c.z - g.z);
      if (def.coasterStation && Z.Coaster) {
        if (!Z.Coaster.arrive(g, o)) { g.gt = ''; g.dk = ''; }
      } else if (q.use < def.capacity && q.q.length === 0) { gxPlace(g, false); startUse(g, o); }
      else if (q.q.length >= Math.max(5, Math.ceil(def.capacity * 1.5) + 2)) { g.gt = ''; g.dk = ''; say(g, 'crowded'); g.mood -= 1; g.nbuy = gxHr() * 0.2; }
      else { g.state = 'queue'; g.wt = 0; q.q.push(g.id); g.speed = 0; gxPlace(g, false); }
    } else if (gt === 'enc') {
      var e = encById(g.gid);
      if (!e || !e.animals.length) { g.gt = ''; return; }
      var hr = gxHr();
      g.state = 'watch'; g.wt = clamp(hr * rng.range(0.25, 0.45), 4, 8) + rng.range(0, 2.5); g.speed = 0; g.wat = 0; g.lastSpot = g.spot;
      gxPlace(g, true);
      gxFaceEnc(g, e);
    } else if (gt === 'bench') {
      var found = null, benches = RT.byType.bench;
      for (var b = 0; b < benches.length; b++) {
        var bo2 = benches[b], bx2 = bo2.i, bz2 = bo2.j, ti = g.ti % N, tj = (g.ti - ti) / N;
        if (Math.abs(bx2 - ti) + Math.abs(bz2 - tj) === 1 && (RT.benchOcc[bo2.id] || 0) < 2) { found = bo2; break; }
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
          if (bn.fill >= 15) delete RT.fields.bin;
          break;
        }
      }
      if (g.lit) { S.dirt[g.ti] = Math.min(255, S.dirt[g.ti] + Math.round(40 * (WX.dirt || 1))); g.lit = false; }
      g.gt = '';
    } else if (gt === 'stroll') {
      g.mood += 0.6 + 2 * g.prettyE; g.gt = ''; g.dk = '';
    } else if (gt === 'pier') {
      Z.Boats.board(g);
    } else if (gt === 'pad') {
      Z.Boats.liftOff(g);
    } else if (gt === 'exit') {
      g.gt = 'out'; g.dk = ''; g.px = g.x + rng.range(-0.5, 0.5); g.pz = N * TILE + 3; g.ni = -2;
    } else g.gt = '';
    g.dk = (g.state === 'walk' && !g.gt) ? '' : g.dk;
  }

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

  function guestMove(g, dt) {
    var spd = g.bs * (WX.guestSpeed || 1) * (g.state === 'leave' ? 1.12 : 1);
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
        if (!f) { if (g.state !== 'leave') { g.gt = ''; g.dk = ''; } g.speed = 0; if (g.state === 'flee') g.state = 'walk'; return 0; }
        var d0 = f[ti];
        if (d0 === 0) { g.speed = 0; return 1; }
        if (d0 === INF) { if (g.state !== 'leave') { g.gt = ''; g.dk = ''; } g.speed = 0; g.unr++; return 0; }
        var bsc = 1e9;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) {
          var n2 = ti + DT4[d]; if (f[n2] >= d0) continue;
          var sc = occ[n2] * 1.4 + rng.next() * 2.2; if (sc < bsc) { bsc = sc; best = n2; }
        }
        if (best >= 0 && occ[best] >= 5 && g.state === 'walk') {
          var alt = -1, ao = occ[best];
          for (d = 0; d < 4; d++) if (nb & (1 << d)) { var n5 = ti + DT4[d]; if (f[n5] <= d0 && n5 !== g.prevT && occ[n5] < ao && occ[n5] < 5) { alt = n5; ao = occ[n5]; } }
          if (alt >= 0) best = alt;
          else if ((g.hold = (g.hold || 0) + dt) < 3) { g.speed = 0; return 0; }
        }
        if (g.sc > 0) g.sc--;
        else if (occ[ti] >= 3 && g.state !== 'flee') {
          for (d = 0; d < 4; d++) if (nb & (1 << d)) {
            var n4 = ti + DT4[d];
            if (f[n4] === d0 && n4 !== g.prevT && occ[n4] + 2 <= occ[ti] && occ[n4] < occ[best < 0 ? ti : best]) { best = n4; g.sc = 2; break; }
          }
        }
      } else {
        var cand = -1, tw = 0, A = RT.gaes;
        for (d = 0; d < 4; d++) if (nb & (1 << d)) {
          var n3 = ti + DT4[d]; if (n3 === g.prevT && (nb & (nb - 1))) continue;
          var w3 = 1 + (A ? A[n3] * 0.25 : 0) + 1 / (1 + occ[n3]); tw += w3; if (rng.next() * tw < w3) cand = n3;
        }
        if (cand < 0) for (d = 0; d < 4; d++) if (nb & (1 << d)) cand = ti + DT4[d];
        best = cand;
        if (--g.wt <= 0) { g.gt = ''; g.speed = 0; return 1; }
      }
      if (best < 0) { g.speed = 0; if (g.state === 'flee') return 0; if (g.state !== 'leave') { g.gt = ''; g.dk = ''; } return 0; }
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
      if (g.gt === 'out') return 2;
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
    if (g.gt === 'out' || g.state === 'sit' || g.state === 'boat' || g.state === 'fly') return;
    if (S.path[t]) { if (g.ti !== t && g.ni < 0) g.ti = t; if (g.ni >= 0 && !S.path[g.ni]) g.ni = -1; if (!S.path[g.ti]) g.ti = t; g.ni = g.ni >= 0 && S.path[g.ni] ? g.ni : -1; return; }
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
    if (g.state === 'ride' || g.state === 'boat' || g.state === 'fly') {
      g.thoughtT -= a; g.tcool -= a; g.stay -= a;
      if (g.thoughtT <= 0 && g.thought) g.thought = '';
      if (g.state === 'ride' && Z.Coaster) Z.Coaster.rideTick(g, a);
      return;
    }
    var k, hr = gxHr(), ah = a / hr, st0 = g.state, still = st0 === 'watch' || st0 === 'queue' || st0 === 'use';
    if (!g.al) gxPlan(g, hr, 0);
    g.hunger = Math.min(100, g.hunger + 7.5 * WX.hunger * ah);
    g.thirst = Math.min(100, g.thirst + 10.5 * WX.thirst * ah);
    g.bladder = Math.min(100, g.bladder + 10 * ah);
    if (st0 !== 'sit') g.energy = Math.max(0, g.energy - (still ? 5 : 9) * WX.energy * ah);
    g.fun = Math.max(0, g.fun - 6 * ah);
    g.stay -= a; g.thoughtT -= a; g.tcool -= a; g.nbt -= a; g.nbuy -= a;
    if (g.thoughtT <= 0 && g.thought) g.thought = '';
    g.mood -= g.mood * Math.min(0.5, 0.25 * ah); if (g.mood > 35) g.mood = 35; else if (g.mood < -40) g.mood = -40;
    if (S.dirt[g.ti] > 110 && rng.chance(0.15)) { say(g, 'dirty'); g.mood -= 1.5; }
    if (g.state === 'walk' && S.dirt[g.ti] > 200) g.mood -= 0.5 * a;
    var pretty = Math.min(1, RT.gaes[g.ti] / 4) * (1 - Math.min(1, S.dirt[g.ti] / 160));
    g.prettyE += (pretty - g.prettyE) * Math.min(1, a * 0.12);
    var vc = gxViewCount(g), frac = vc ? g.nSeen / vc : 0, pen = 0, al = g.al;
    if (g.hunger > 60) pen += (g.hunger - 60) * (al.meal > 0 ? 0.6 : 0.3);
    if (g.thirst > 60) pen += (g.thirst - 60) * (al.drink > 0 ? 0.6 : 0.3);
    if (g.bladder > 60) pen += (g.bladder - 60) * 0.6;
    if (g.energy < 35) pen += (35 - g.energy) * 0.6;
    if (g.fun < 30) pen += (30 - g.fun) * 0.35;
    var target = 44 + 22 * frac + 9 * g.prettyE + Math.min(6, (g.nsp || 0) * 1.2) + g.mood - pen - (g.vip ? 10 : 0);
    for (k = 0; k < RT.guides.length; k++) {
      var gd = RT.guides[k], dx = gd.x - g.x, dz = gd.z - g.z;
      if (dx * dx + dz * dz < 144) { target += 8; g.fun = Math.min(100, g.fun + 1 * a); break; }
    }
    var secAura = Z.Resort ? Z.Resort.securityAura(g.x, g.z) : null;
    if (secAura && secAura.protected && secAura.safetyBonus) target += secAura.safetyBonus;
    if (RT.guestCrowd > 1.1) target -= (RT.guestCrowd - 1.1) * 6;
    g.happiness += (clamp(target, 0, 100) - g.happiness) * Math.min(1, 0.35 * a);
    if (WX.fun) g.happiness += WX.fun * a;
    if (g.happiness > 100) g.happiness = 100; else if (g.happiness < 0) g.happiness = 0;
    if (g.happiness > 85 && rng.chance(0.03)) say(g, 'happy');
    if (g.energy < 20 && g.state !== 'sit') say(g, 'tired');
    if (RT.guestCrowd > 1.3 && rng.chance(0.02)) say(g, 'crowded');
    if (WX.shelter) {
      if (!g.wxd) {
        g.wxd = 1;
        var cv = RT.byType.food.concat(RT.byType.fun), anyCover = false;
        for (k = 0; k < cv.length; k++) if (gxIndoor(cv[k])) { anyCover = true; break; }
        if (!anyCover || rng.chance(0.2)) g.stay = Math.min(g.stay, hr * rng.range(0.1, 0.7));
      }
    } else { g.wxd = 0; g.cov = 0; }
    if (g.state !== 'leave' && !(g.pend && g.pend.state === 'leave')) {
      var inUse = g.state === 'use' && !g.shel;
      var staysOvernight = S.open && Z.Resort && Z.Resort.shouldStayOvernight(g);
      var leave = false;
      if (!S.open || (!staysOvernight && S.time >= CLOSE_T + (inUse ? 0.04 : -0.004))) leave = true;
      else if (!inUse && g.stay <= 0) {
        if (staysOvernight) { g.stay += hr; g.stay0 += hr; }
        else if (!g.done && (g.ext || 0) < 2 && g.nSeen < Math.ceil(g.thor * vc) && g.happiness > 45 && g.energy > 15 && S.time < CLOSE_T - 0.06) { g.ext = (g.ext || 0) + 1; g.stay += hr * 1.3; g.stay0 += hr * 1.3; }
        else leave = true;
      } else if (!inUse) {
        if (!g.done && vc > 0 && g.nSeen >= Math.ceil(g.thor * vc)) { g.done = 1; g.stay = Math.min(g.stay, Math.max(hr * rng.range(0.35, 1.0), rng.range(6, 14))); }
        if (g.happiness < 14 && g.stay < g.stay0 * 0.85) leave = true;
        else if ((g.hunger > 94 || g.thirst > 97) && g.stay < g.stay0 * 0.8) leave = true;
        else if (g.energy < 6 && g.nbt > 0) leave = true;
        else if (!staysOvernight && S.time > CLOSE_T - 0.14) {
          var fe = getField('exit'), de = fe ? fe[g.ti] : 0; if (de === INF) de = isParkConnected(g.ti) ? 35 : 0;
          if (S.time + (de * TILE / (g.bs * 1.2)) / DAY_SECONDS > CLOSE_T - 0.01 - (g.lj === undefined ? (g.lj = rng.range(0, 0.07)) : g.lj)) leave = true;
        }
      }
      if (leave) { startLeaving(g); return; }
    } else {
      var fx = getField('exit');
      if (!fx || fx[g.ti] === INF) {
        if (g.gt === 'pier' || (Z.Boats && Z.Boats.leave(g))) { g.isl = 0; gxWatchdog(g, a); return; }
        g.isl += a; if (g.isl > 12) { removeGuest(g); return false; }
      }
      else { g.isl = 0; if (!g.gt) { g.gt = 'exit'; g.dk = 'exit'; g.ni = -1; } }
      gxWatchdog(g, a);
      return;
    }
    var fx2 = getField('exit');
    if (!isParkConnected(g.ti) && (!fx2 || fx2[g.ti] === INF)) { g.isl += a; if (g.isl > 25) { removeGuest(g); return false; } } else g.isl = 0;
    if (g.state !== 'flee' && !g.shel && RT.escaped.length) {
      for (k = 0; k < RT.escaped.length; k++) {
        var an = RT.escaped[k], ad = aDanger(an);
        var ex = an.x - g.x, ez = an.z - g.z, dd = ex * ex + ez * ez;
        if (ad >= 2 && dd < 144 || ad === 1 && dd < 25) {
          say(g, 'escaped', an.species);
          if (ad >= 2) {
            releaseGuest(g);
            var bk = RT.bunkers.length ? pickBunker(g, an) : null;
            var damp = secAura && secAura.protected ? secAura.panicDamp : 1;
            g.state = 'flee'; g.glide = 0; g.fx = an.x; g.fz = an.z; g.ni = -1;
            if (bk) { g.gt = 'bunker'; g.gid = bk.id; g.dk = 'b' + bk.id; g.fleeT = 25; g.mood -= 2 * damp; }
            else { g.gt = ''; g.dk = ''; g.fleeT = 7; g.mood -= (RT.secCount > 0 ? 6 : 12) * damp; g.happiness -= 6 * damp; }
          }
          break;
        }
      }
    }
    if (RT.dangerEsc > 0 && !g.shel && g.state !== 'leave' && g.state !== 'flee' && RT.bunkers.length) {
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
    if (g.state === 'watch') { g.idle = 0; watchTick(g, a); }
    else if (g.state === 'queue') {
      g.idle = 0; g.wt += a;
      var qLim = (Z.Boats && Z.Boats.queueLimit) ? Z.Boats.queueLimit(g) : 22;
      if (g.wt > qLim) {
        var q = RT.bq[g.gid]; if (q) { var qi = q.q.indexOf(g.id); if (qi >= 0) q.q.splice(qi, 1); }
        g.pend = null;
        g.state = 'walk'; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1; g.mood -= 2; g.nbuy = hr * 0.2; say(g, 'crowded');
      }
    } else if (g.state === 'sit') {
      g.idle = 0; g.energy = Math.min(100, g.energy + 6 * a); g.mood += 0.2 * a;
    } else if (g.state === 'walk') {
      if (!g.gt) chooseGoal(g); else gxWatchdog(g, a);
    } else g.idle = 0;
  }

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
    var see = e.see;
    if (E.vis === 0) { say(g, 'cantSee'); g.mood -= 1.5 * a; g.wt = Math.min(g.wt, 1.5); return; }
    if (see < 0.35) { say(g, 'cantSee'); g.mood -= 1.2 * a; g.wt = Math.min(g.wt, 2); return; }
    var q = (E.happy / 100) * 0.6 + 0.4 * Math.min(1, E.vis / Math.max(1, E.nAn));
    q *= 0.6 + 0.4 * see;
    var overCapacity = encSpaceDemand(e, null, E) > usableEncSpace(e, E);
    if (overCapacity) { q *= 0.55; say(g, 'enclosureCrowded', e.species[0]); g.mood -= 2.5 * a; }
    g.fun = Math.min(100, g.fun + 7 * a * q); g.mood += 2.4 * a * q;
    g.wat += a;
    if (!g.seenEnc[e.id] && g.wat >= 1.5) { g.seenEnc[e.id] = 1; g.nSeen++; g.mood += 4; }
    for (var s = 0; s < e.species.length; s++) {
      var sp = e.species[s];
      if (!g.seen[sp]) { g.seen[sp] = 1; g.nsp = (g.nsp || 0) + 1; g.mood += 3; if (rng.chance(0.5)) say(g, 'happy', sp); }
    }
    if (E.happy < 35) { if (!overCapacity) say(g, 'animalsUnhappy', e.species[0]); g.mood -= 2.5 * a; }
    else {
      if (E.babies > 0 && rng.chance(0.12)) say(g, 'baby', e.species[0]);
      if (q > 0.7) {
        if (rng.chance(0.1)) say(g, 'greatExhibit', e.species[0]);
        if (g.money > 2 && rng.chance(0.008 * a * (RT.hasEdu ? 1.6 : 1))) {
          var amt = Math.min(g.money, Math.round((1 + Math.floor(rng.next() * 3)) * (RT.hasEdu ? 1.5 : 1)));
          g.money -= amt; g.spent += amt; earn(amt, 'donations', g.x, g.z); S.stats.donations = (S.stats.donations || 0) + amt; g.mood += 1.5;
        }
      }
    }
  }

  function guestStep(g, dt) {
    if (g.state === 'resort_sleep') { g.speed = 0; g.glide = 0; return; }
    if (!RT.gocc) gxGrid();
    if (!g.al) gxPlan(g, gxHr(), 0);
    if (g.pv !== RT.pathVer) { if (revalidateGuest(g) === false) return; }
    var st = g.state;
    if (st === 'ride' || st === 'boat' || st === 'fly') {
      g.speed = 0; g.glide = 0;
    } else if (st === 'walk' || st === 'leave' || st === 'flee') {
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
      } else if (st === 'use') {
        g.heading = turn(g.heading, g.hd, dt * 6);
        if (g.shel && RT.dangerEsc > 0) g.wt = Math.max(g.wt, 3);
        g.wt -= dt;
        if (g.wt <= 0) {
          if (g.shel) { g.shel = 0; g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1; }
          else finishUse(g);
        }
      } else if (st === 'queue') g.heading = turn(g.heading, g.hd, dt * 6);
      else if (st === 'sit') {
        g.heading = turn(g.heading, g.hd, dt * 6); g.wt -= dt;
        if (g.wt <= 0 || g.energy >= 90) {
          if (RT.benchOcc[g.bid] > 0) RT.benchOcc[g.bid]--; g.bid = 0;
          g.x = cxOf(g.ti) + g.lo * 0.5; g.z = czOf(g.ti); g.state = 'walk'; g.gt = ''; g.dk = ''; g.ni = -1;
        }
      }
    }
    g.acc += dt; g.nt -= dt;
    if (g.nt <= 0) {
      var a = g.acc; g.acc = 0; g.nt = 0.7 + rng.next() * 0.3;
      if (guestThink(g, a) === false) return;
    }
  }

  function updateQueues() {
    gxGrid();
    var gs = S.guests, k, occ = RT.gocc, stand = RT.gstand, targ = RT.gtarg, head = RT.ghead, nxt = RT.gnext, load = RT.gload = {};
    if (gs.length > nxt.length) nxt = RT.gnext = new Int16Array(gs.length + 32);
    occ.fill(0); stand.fill(0); targ.fill(0); head.fill(-1);
    for (k = 0; k < gs.length; k++) {
      var g = gs[k], t = tileOf(g.x, g.z), s = g.state;
      if (s === 'ride' || s === 'boat' || s === 'fly' || s === 'resort_sleep') continue;
      if (occ[t] < 255) occ[t]++;
      nxt[k] = head[t]; head[t] = k;
      if (s === 'watch' || s === 'queue' || s === 'use' || s === 'sit') { if (stand[t] < 255) stand[t]++; }
      if (g.gt === 'enc' && s === 'walk' && g.spot) targ[g.spot]++;
      if ((g.gt === 'enc' && s === 'walk') || s === 'watch') load[g.gid] = (load[g.gid] || 0) + 1;
    }
    if (--RT.gaesT <= 0) { RT.gaesT = 60; gxAes(); RT.gaesInit = 1; }
    for (var id in RT.bq) {
      var q = RT.bq[id], o = RT.oById.get(+id);
      if (!o || o.kind !== 'building') { delete RT.bq[id]; continue; }
      if (BD[o.type].coasterStation || BD[o.type].boatPier) continue;
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
    var base = 1.6 * (0.10 + 0.20 * rating + 0.04 * spc + 0.0016 * (RT.appeal || 0));
    var ratio = S.ticketPrice / Math.max(1, RT.value);
    var priceF = clamp(1.6 - ratio, 0.05, 1.3);
    var rep = 0.6 + clamp(S.reputation, 0, 100) / 100 * 0.8;
    var mk = S.marketing.active ? 1.7 : 1;
    var an = nAn > 0 ? 1 : 0.2;
    return base * priceF * rep * mk * an * (WX.arrivals || 1) * (DIFF.arrivals || 1);
  }

  // ====================== ANIMALS ======================
  function swimmer(sp) { return !!(sp && sp.needsWater); }
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
  function wallEdge(a, enc, i, j, d) {
    var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0);
    var nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return true;
    if (fenceAt(i, j, d)) return true;
    var nt = ni + nj * N;
    if (enc) { if (S.tileEnc[nt] !== enc.id) return true; }
    else if (S.tileEnc[nt]) return true;
    if (cliffT(nt) || RT.block[nt]) return true;
    var sp = SP[a.species];
    if (S.terrain[nt] === WATER && !swimmer(sp)) return true;
    return false;
  }
  function tileSafeBounds(a, t) {
    var m = animalMetrics(SP[a.species], a);
    var pad = clamp(m.bodyRad * 0.45, 0.2, 0.82);
    var i = t % N, j = (t - i) / N, cx = cxOf(t), cz = czOf(t), half = TILE * 0.5;
    var enc = a.enc ? RT.eMap[a.enc] : null;
    var bN = wallEdge(a, enc, i, j, 0), bE = wallEdge(a, enc, i, j, 1);
    var bS = wallEdge(a, enc, i, j, 2), bW = wallEdge(a, enc, i, j, 3);
    var padX = (bW && bE) ? Math.min(pad, 0.35) : pad;
    var padZ = (bN && bS) ? Math.min(pad, 0.35) : pad;
    return {
      minX: bW ? cx - (half - padX) : cx - half,
      maxX: bE ? cx + (half - padX) : cx + half,
      minZ: bN ? cz - (half - padZ) : cz - half,
      maxZ: bS ? cz + (half - padZ) : cz + half,
      bN: bN, bE: bE, bS: bS, bW: bW, pad: pad
    };
  }
  function tilePt(a, t, jit) {
    var cx = cxOf(t), cz = czOf(t), b = tileSafeBounds(a, t);
    var loX = Math.max(-jit, b.minX - cx), hiX = Math.min(jit, b.maxX - cx);
    var loZ = Math.max(-jit, b.minZ - cz), hiZ = Math.min(jit, b.maxZ - cz);
    if (loX > hiX) { var mx = (loX + hiX) * 0.5; loX = hiX = mx; }
    if (loZ > hiZ) { var mz = (loZ + hiZ) * 0.5; loZ = hiZ = mz; }
    return { x: cx + rng.range(loX, hiX), z: cz + rng.range(loZ, hiZ) };
  }
  function pushFromWalls(a, enc, m, dt) {
    if (!enc || a.flyover || a.state === 'escaped' || a.state === 'fight') return;
    var t = tileOf(a.x, a.z);
    if (S.tileEnc[t] !== enc.id) return;
    var b = tileSafeBounds(a, t);
    var cx = cxOf(t), cz = czOf(t), half = TILE * 0.5;
    var nx = a.x, nz = a.z;
    var blend = Math.min(1, Math.max(0.25, dt * 12));
    if (b.bW && b.bE) nx += (cx - nx) * Math.min(1, dt * 4);
    if (b.bN && b.bS) nz += (cz - nz) * Math.min(1, dt * 4);
    if (nx < b.minX) nx += (b.minX - nx) * blend;
    else if (nx > b.maxX) nx += (b.maxX - nx) * blend;
    if (nz < b.minZ) nz += (b.minZ - nz) * blend;
    else if (nz > b.maxZ) nz += (b.maxZ - nz) * blend;
    var i = t % N, j = (t - i) / N, cPad = b.pad * 0.78;
    var nonSwim = !swimmer(SP[a.species]);
    for (var sx = -1; sx <= 1; sx += 2) {
      if ((sx < 0 && b.bW) || (sx > 0 && b.bE)) continue;
      for (var sz = -1; sz <= 1; sz += 2) {
        if ((sz < 0 && b.bN) || (sz > 0 && b.bS)) continue;
        var ci = i + sx, cj = j + sz;
        if (ci < 0 || cj < 0 || ci >= N || cj >= N) continue;
        var ct = ci + cj * N;
        if (S.tileEnc[ct] !== enc.id || cliffT(ct) || RT.block[ct] || (nonSwim && S.terrain[ct] === WATER)) {
          var kx = cx + sx * half, kz = cz + sz * half;
          var cdx = nx - kx, cdz = nz - kz, cd = Math.sqrt(cdx * cdx + cdz * cdz);
          if (cd < cPad && cd > 1e-5) {
            var pushC = (cPad - cd) * blend;
            nx += (cdx / cd) * pushC; nz += (cdz / cd) * pushC;
          }
        }
      }
    }
    if (nx !== a.x || nz !== a.z) {
      if (canGo(a, a.x, a.z, nx, nz)) { a.x = nx; a.z = nz; }
      else if (canGo(a, a.x, a.z, nx, a.z)) { a.x = nx; }
      else if (canGo(a, a.x, a.z, a.x, nz)) { a.z = nz; }
    }
    var minD = 1e9;
    if (b.bW) minD = Math.min(minD, a.x - (cx - half));
    if (b.bE) minD = Math.min(minD, (cx + half) - a.x);
    if (b.bN) minD = Math.min(minD, a.z - (cz - half));
    if (b.bS) minD = Math.min(minD, (cz + half) - a.z);
    a._wallNear = minD < half ? clamp(1 - minD / half, 0, 1) : 0;

    if (m.bodyRad >= 1.2 && a.tg === 'wander' && RT.wallDist[t] === 0 && (enc.maxWallDist || 0) >= 1) {
      var ti = t % N, tj = (t - ti) / N, bestN = -1, bestW = 0, bestC = -1;
      for (var d = 0; d < 4; d++) {
        var dni = ti + (d === 1 ? 1 : d === 3 ? -1 : 0), dnj = tj + (d === 2 ? 1 : d === 0 ? -1 : 0);
        if (dni < 0 || dnj < 0 || dni >= N || dnj >= N) continue;
        var dnt = dni + dnj * N;
        if (S.tileEnc[dnt] !== enc.id || fenceAt(ti, tj, d) || !aok(a, dnt)) continue;
        var wd = RT.wallDist[dnt], cd2 = RT.clearDist[dnt];
        if (wd > bestW || (wd === bestW && cd2 > bestC)) { bestW = wd; bestC = cd2; bestN = dnt; }
      }
      if (bestN >= 0 && bestW > 0) {
        var bx = cxOf(bestN) - a.x, bz = czOf(bestN) - a.z, bd = Math.sqrt(bx * bx + bz * bz);
        if (bd > 1e-4) {
          var nudge = Math.min(bd, 0.7 * dt);
          var gx = a.x + (bx / bd) * nudge, gz = a.z + (bz / bd) * nudge;
          if (canGo(a, a.x, a.z, gx, gz)) { a.x = gx; a.z = gz; }
        }
        if (isFinite(a.tx) && isFinite(a.tz) && RT.wallDist[tileOf(a.tx, a.tz)] === 0 && !a.aroute) {
          var inT = randomEncTile(a, enc, 12);
          if (inT >= 0 && RT.wallDist[inT] > 0) setTargetTile(a, inT);
        }
      }
    }
  }
  var animalMovement = Z.SimCommon.createAnimalMovement({
    tileOf: tileOf, getDT4: function () { return DT4; }, rng: rng, tilePt: tilePt,
    getRT: function () { return RT; }, cxOf: cxOf, czOf: czOf, canStepTile: canStepTile,
    canGo: canGo, pushFromWalls: pushFromWalls, animalMetrics: animalMetrics, getSP: function () { return SP; }, turn: turn
  });
  var animalMove = animalMovement.animalMove;
  function setTargetTile(a, t) {
    var pt = tilePt(a, t, 0.6);
    a.tx = pt.x; a.tz = pt.z;
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
    if (!enc || !enc.tiles || !enc.tiles.length) return -1;
    var sp = SP[a.species], m = sp ? animalMetrics(sp, a) : null;
    var needClear = m ? Math.min(m.prefClear, enc.maxWallDist || 0) : 0;
    var tl = enc.tiles, n = tl.length, best = -1, bestScore = -1, q;
    if (needClear > 0 && n <= 64) {
      var nearPool = [], pool = [], maxC = -1, deep = [];
      for (q = 0; q < n; q++) {
        var qt = tl[q]; if (!aok(a, qt)) continue;
        var qd = RT.clearDist[qt];
        if (qd >= needClear) {
          pool.push(qt);
          if (near && a.x !== undefined) {
            var qdx = cxOf(qt) - a.x, qdz = czOf(qt) - a.z;
            if (qdx * qdx + qdz * qdz <= near * near) nearPool.push(qt);
          }
        } else {
          if (qd > maxC) { maxC = qd; deep.length = 0; deep.push(qt); }
          else if (qd === maxC) deep.push(qt);
        }
      }
      if (nearPool.length) return nearPool[Math.floor(rng.next() * nearPool.length)];
      if (pool.length) return pool[Math.floor(rng.next() * pool.length)];
      if (deep.length) return deep[Math.floor(rng.next() * deep.length)];
      return -1;
    }
    for (var k = 0; k < 14; k++) {
      var t = tl[Math.floor(rng.next() * n)];
      if (!aok(a, t)) continue;
      var cd = RT.clearDist[t], wd = RT.wallDist[t], score = cd * 2 + wd;
      if (near && a.x !== undefined && k < 8) {
        var dx = cxOf(t) - a.x, dz = czOf(t) - a.z;
        if (dx * dx + dz * dz > near * near) {
          if (best < 0 || score > bestScore) { best = t; bestScore = score; }
          continue;
        }
      }
      if (cd >= needClear) return t;
      if (k >= 10 && wd >= needClear) return t;
      if (score > bestScore) { best = t; bestScore = score; }
    }
    if (needClear > 0 && best >= 0 && RT.clearDist[best] < needClear) {
      var pool2 = [], maxC2 = -1;
      for (q = 0; q < n; q++) {
        var qt2 = tl[q]; if (!aok(a, qt2)) continue;
        var qd2 = RT.clearDist[qt2];
        if (qd2 >= needClear) pool2.push(qt2);
        else if (qd2 > maxC2) maxC2 = qd2;
      }
      if (pool2.length) return pool2[Math.floor(rng.next() * pool2.length)];
      if (maxC2 > RT.clearDist[best]) {
        var deep2 = [];
        for (q = 0; q < n; q++) if (aok(a, tl[q]) && RT.clearDist[tl[q]] === maxC2) deep2.push(tl[q]);
        if (deep2.length) return deep2[Math.floor(rng.next() * deep2.length)];
      }
    }
    return best;
  }
  function animalDie(a, cause) {
    var sp = SP[a.species];
    msg(a.name + ' the ' + sp.name.toLowerCase() + ' has died ' + cause + '.', 'bad');
    S.stats.deaths++;
    bus.emit('death', a);
    removeAnimal(a);
  }

  // hunting & fights
  function findPrey(a, enc) {
    var pack = gatherPack(a, enc), pPow = packPower(pack);
    var best = null, bestTier = 99, bd = 1e9;
    for (var k = 0; k < enc.animals.length; k++) {
      var p = RT.aById.get(enc.animals[k]);
      if (!p || p === a || p.state === 'escaped' || p.state === 'fight' || p.flyover) continue;
      var ps = SP[p.species];
      if (!ps || isPredator(ps) || isCompanionPair(a.species, p.species)) continue;
      var ratio = combatPower(p) / pPow, tier;
      if (ratio <= 1.15) {
        tier = 0;
      } else if (ratio <= 2.3) {
        if (!(a.hunger > 50 && rng.chance(clamp(0.32 - (ratio - 1.15) * 0.24, 0.04, 0.32)))) continue;
        tier = 1;
      } else if (a.hunger > 80 && ratio <= 3.2 && rng.chance(0.05)) {
        tier = 1;
      } else {
        continue;
      }
      var dx = p.x - a.x, dz = p.z - a.z, d = dx * dx + dz * dz;
      if (!best || tier < bestTier || (tier === bestTier && d < bd)) { best = p; bestTier = tier; bd = d; }
    }
    return best;
  }
  function findRivalPredator(a, enc) {
    var pPow = packPower(gatherPack(a, enc));
    var best = null, bestTier = 99, bd = 1e9;
    for (var k = 0; k < enc.animals.length; k++) {
      var p = RT.aById.get(enc.animals[k]);
      if (!p || p === a || p.baby || p.state === 'escaped' || p.state === 'fight' || p.sick) continue;
      var ps = SP[p.species];
      if (!ps || !isPredator(ps) || isCompanionPair(a.species, p.species)) continue;
      if (p.species === a.species && !(a.happiness < 45 && rng.chance(0.15))) continue;
      var ratio = combatPower(p) / pPow;
      if (ratio > 1.25 && !rng.chance(clamp(0.45 / ratio, 0.08, 0.4))) continue;
      var tier = p.species !== a.species ? 0 : 1;
      var dx = p.x - a.x, dz = p.z - a.z, d = dx * dx + dz * dz;
      if (!best || tier < bestTier || (tier === bestTier && d < bd)) { best = p; bestTier = tier; bd = d; }
    }
    return best;
  }
  function rallyPack(leader, enc, target, tg) {
    if (!enc || !target) return;
    var cands = [], k;
    for (k = 0; k < enc.animals.length; k++) {
      var m = RT.aById.get(enc.animals[k]);
      if (!m || m === leader || m.species !== leader.species || m.baby || m.sick || m.injured || (m.fightCd || 0) > 0 || m.health <= 35) continue;
      if (m.state === 'idle' || (m.state === 'walk' && m.tg === 'wander')) {
        var dx = m.x - leader.x, dz = m.z - leader.z;
        cands.push({ a: m, d2: dx * dx + dz * dz });
      }
    }
    cands.sort(function (u, v) { return u.d2 - v.d2; });
    var lim = Math.min(3, cands.length);
    for (k = 0; k < lim; k++) {
      var pm = cands[k].a;
      pm.tg = tg; pm.hid = target.id; pm.hunt = 0; pm.state = 'run'; pm.tx = target.x; pm.tz = target.z; pm.stuck = 0;
    }
  }
  function killPrey(pred, prey) {
    var ps = SP[prey.species], ks = SP[pred.species];
    msg(prey.name + ' the ' + lc(ps.name) + ' was caught and eaten by ' + pred.name + ' the ' + lc(ks.name) + '!', 'bad');
    S.stats.deaths++; S.stats.predations = (S.stats.predations || 0) + 1;
    bus.emit('death', prey); bus.emit('predation', { predator: pred, prey: prey });
    removeAnimal(prey);
    pred.hunger = Math.max(0, pred.hunger - 70); pred.state = 'eat'; pred.st = rng.range(5, 7); pred.tg = ''; pred.speed = 0; pred.hid = 0; pred.kill = 1;
  }
  function startFight(attacker, defender, kind, enc) {
    if (!attacker || !defender || attacker === defender) return null;
    if (attacker.state === 'fight' || defender.state === 'fight') return null;
    if (!S.fights) S.fights = [];
    var fx = (attacker.x + defender.x) * 0.5, fz = (attacker.z + defender.z) * 0.5;
    var attackers = [attacker], k;
    if (isPackHunter(SP[attacker.species]) && enc) {
      for (k = 0; k < enc.animals.length; k++) {
        var m = RT.aById.get(enc.animals[k]);
        if (!m || m === attacker || m === defender) continue;
        if (m.species === attacker.species && m.state !== 'fight' && m.state !== 'escaped' && !m.baby && !m.sick && !m.injured) {
          if ((m.tg === 'hunt' || m.tg === 'fight_rival') && m.hid === defender.id) {
            var mdx = m.x - fx, mdz = m.z - fz;
            if (mdx * mdx + mdz * mdz <= 4.5 * 4.5) attackers.push(m);
          }
        }
      }
    }
    var dur = (combatPower(defender) < packPower(attackers) * 0.3 && ((SP[defender.species] && SP[defender.species].danger) || 0) === 0)
      ? 1.6 : rng.range(3.0, 4.5);
    var size = clamp(Math.max(SP[attacker.species].size || 1, SP[defender.species].size || 1) * 1.1 + attackers.length * 0.25, 0.9, 3.8);
    var fight = {
      id: newId(), x: fx, z: fz, y: 0, enc: enc ? enc.id : (attacker.enc || 0), kind: kind || 'hunt',
      attackers: attackers.map(function (u) { return u.id; }),
      defenders: [defender.id],
      t: 0, dur: dur, size: size
    };
    for (k = 0; k < attackers.length; k++) {
      attackers[k].state = 'fight'; attackers[k].fid = fight.id; attackers[k].tg = ''; attackers[k].hid = 0; attackers[k].speed = 0;
    }
    defender.state = 'fight'; defender.fid = fight.id; defender.tg = ''; defender.hid = 0; defender.speed = 0;
    S.fights.push(fight);
    bus.emit('fightStart', fight);
    return fight;
  }
  function resolveFight(f) {
    var atks = [], defs = [], k, u;
    for (k = 0; k < f.attackers.length; k++) { u = RT.aById.get(f.attackers[k]); if (u) { u.fid = 0; u.tg = ''; u.hid = 0; atks.push(u); } }
    for (k = 0; k < f.defenders.length; k++) { u = RT.aById.get(f.defenders[k]); if (u) { u.fid = 0; u.tg = ''; u.hid = 0; defs.push(u); } }
    if (!atks.length || !defs.length) {
      for (k = 0; k < atks.length; k++) { atks[k].state = 'idle'; atks[k].st = 1; atks[k].speed = 0; }
      for (k = 0; k < defs.length; k++) { defs[k].state = 'idle'; defs[k].st = 1; defs[k].speed = 0; }
      return;
    }
    var enc = f.enc ? RT.eMap[f.enc] : null;
    var lead = atks[0], def = defs[0];
    var leadSp = SP[lead.species], defSp = SP[def.species];
    var atkPow = packPower(atks), defPow = packPower(defs);
    var winChance = clamp(Math.pow(atkPow, 1.35) / (Math.pow(atkPow, 1.35) + Math.pow(defPow, 1.35)), 0.08, 0.94);
    var atkWins = rng.chance(winChance);
    if (f.kind === 'hunt') {
      if (atkWins) {
        msg(def.name + ' the ' + lc(defSp.name) + ' was caught and eaten by ' + lead.name + ' the ' + lc(leadSp.name) + (atks.length > 1 ? ' and its pack!' : '!'), 'bad');
        S.stats.deaths++;
        S.stats.predations = (S.stats.predations || 0) + 1;
        bus.emit('death', def);
        bus.emit('predation', { predator: lead, prey: def, pack: atks.length });
        removeAnimal(def);
        var dangerousPrey = (defPow / atkPow > 0.5) || ((defSp.danger || 0) >= 1);
        for (k = 0; k < atks.length; k++) {
          var au = atks[k];
          au.hunger = Math.max(0, au.hunger - 70);
          au.state = 'eat'; au.st = rng.range(5, 7); au.tg = ''; au.hid = 0; au.speed = 0; au.kill = 1;
          au.fightCd = rng.range(18, 28);
          if (dangerousPrey) {
            au.health -= rng.range(10, 35) * (k === 0 ? 1 : 0.65);
            if (au.health <= 0) {
              animalDie(au, 'fighting ' + def.name + ' the ' + lc(defSp.name));
              continue;
            }
            if (au.health < 70) au.injured = true;
          }
        }
      } else {
        var dmg = rng.range(25, 80) * clamp(defPow / atkPow, 0.7, 2.2);
        lead.health -= dmg;
        if (lead.health <= 0) {
          animalDie(lead, 'fighting ' + def.name + ' the ' + lc(defSp.name));
        } else {
          lead.injured = true; lead.state = 'idle'; lead.st = 1; lead.fightCd = 32;
          if (enc) fleeFrom(lead, enc, def.x, def.z);
          msg(def.name + ' the ' + lc(defSp.name) + ' fought off and injured ' + lead.name + ' the ' + lc(leadSp.name) + '!', 'info');
        }
        for (k = 1; k < atks.length; k++) {
          var pm = atks[k];
          pm.health -= rng.range(8, 22);
          if (pm.health <= 0) {
            animalDie(pm, 'fighting ' + def.name + ' the ' + lc(defSp.name));
          } else {
            if (pm.health < 70) pm.injured = true;
            pm.state = 'idle'; pm.st = 1; pm.fightCd = 32;
            if (enc) fleeFrom(pm, enc, def.x, def.z);
          }
        }
        def.health -= rng.range(8, 24);
        if (def.health <= 0) {
          animalDie(def, 'of injuries');
        } else {
          if (def.health < 65) def.injured = true;
          def.state = 'idle'; def.st = 1;
          if (enc) fleeFrom(def, enc, lead.x, lead.z);
        }
      }
    } else {
      var winners = atkWins ? atks : defs, losers = atkWins ? defs : atks;
      var winLead = winners[0], loseLead = losers[0];
      for (k = 0; k < winners.length; k++) {
        var wu = winners[k];
        wu.health -= rng.range(10, 30) * (k === 0 ? 1 : 0.65);
        if (wu.health <= 0) {
          animalDie(wu, 'fighting ' + loseLead.name + ' the ' + lc(SP[loseLead.species].name));
        } else {
          if (wu.health < 65) wu.injured = true;
          wu.state = 'idle'; wu.st = rng.range(1, 3); wu.speed = 0; wu.fightCd = rng.range(28, 38);
        }
      }
      for (k = 0; k < losers.length; k++) {
        var lu = losers[k];
        lu.health -= rng.range(35, 75) * (k === 0 ? 1 : 0.7);
        if (lu.health <= 0 || (k === 0 && rng.chance(0.4))) {
          animalDie(lu, 'fighting ' + winLead.name + ' the ' + lc(SP[winLead.species].name));
        } else {
          lu.injured = true;
          lu.health = clamp(lu.health, 12, 45);
          lu.state = 'idle'; lu.st = 1; lu.speed = 0; lu.fightCd = rng.range(28, 38);
          if (enc) fleeFrom(lu, enc, winLead.x, winLead.z);
          if (k === 0) msg(lu.name + ' the ' + lc(SP[lu.species].name) + ' was injured in a fight with ' + winLead.name + ' the ' + lc(SP[winLead.species].name) + '!', 'bad');
        }
      }
    }
    bus.emit('fightEnd', { fight: f, atkWins: atkWins, x: f.x, z: f.z });
  }
  function stepFights(dt) {
    if (!S.fights || !S.fights.length) return;
    for (var i = S.fights.length - 1; i >= 0; i--) {
      var f = S.fights[i];
      var parts = [], k, pa;
      var hasAtk = false, hasDef = false;
      for (k = 0; k < f.attackers.length; k++) {
        pa = RT.aById.get(f.attackers[k]);
        if (pa && pa.state === 'fight' && pa.fid === f.id) { parts.push(pa); hasAtk = true; }
      }
      for (k = 0; k < f.defenders.length; k++) {
        pa = RT.aById.get(f.defenders[k]);
        if (pa && pa.state === 'fight' && pa.fid === f.id) { parts.push(pa); hasDef = true; }
      }
      if (!hasAtk || !hasDef) {
        for (k = 0; k < parts.length; k++) { parts[k].state = 'idle'; parts[k].fid = 0; parts[k].st = 1; parts[k].speed = 0; }
        S.fights.splice(i, 1);
        continue;
      }
      f.t += dt;
      var rad = Math.min(0.85, 0.3 + f.size * 0.18) * 0.65;
      for (k = 0; k < parts.length; k++) {
        pa = parts[k];
        var ang = f.t * 8.5 + (k * TAU / parts.length);
        pa.x = clamp(f.x + Math.cos(ang) * rad, 1, N * TILE - 1);
        pa.z = clamp(f.z + Math.sin(ang) * rad, 1, N * TILE - 1);
        pa.heading = ang + PI * 0.5;
        pa.speed = 0;
      }
      if (f.t >= f.dur) {
        S.fights.splice(i, 1);
        resolveFight(f);
      }
    }
  }
  function huntStep(a, dt, enc, E, sp) {
    var pr = RT.aById.get(a.hid);
    if (!pr || pr.enc !== a.enc || pr.state === 'escaped' || pr.flyover) {
      a.tg = ''; a.hid = 0; a.state = 'idle'; a.st = 1; a.speed = 0; return;
    }
    var dx = pr.x - a.x, dz = pr.z - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (pr.state === 'fight' && pr.fid) {
      var f = null;
      if (S.fights) for (var fk = 0; fk < S.fights.length; fk++) if (S.fights[fk].id === pr.fid) { f = S.fights[fk]; break; }
      if (f && isPackHunter(sp) && f.defenders.indexOf(pr.id) >= 0 && f.attackers.length > 0) {
        var leadAtk = RT.aById.get(f.attackers[0]);
        if (leadAtk && leadAtk.species === a.species) {
          if (f.attackers.indexOf(a.id) < 0 && d < 2.2 + (sp.size || 1) * 0.25) {
            f.attackers.push(a.id);
            a.state = 'fight'; a.fid = f.id; a.tg = ''; a.hid = 0; a.speed = 0;
            return;
          }
        } else {
          a.tg = ''; a.hid = 0; a.state = 'idle'; a.st = 1; a.speed = 0; return;
        }
      } else {
        a.tg = ''; a.hid = 0; a.state = 'idle'; a.st = 1; a.speed = 0; return;
      }
    }
    a.hunt = (a.hunt || 0) + dt; a.tx = pr.x; a.tz = pr.z;
    if (d < 1.3 + (sp.size || 1) * 0.25) {
      startFight(a, pr, a.tg === 'fight_rival' ? 'predator' : 'hunt', enc);
      return;
    }
    if (a.hunt > 40) { a.tg = ''; a.hid = 0; a.state = 'idle'; a.st = rng.range(3, 6); a.speed = 0; return; }
    a.state = 'run';
    animalMove(a, dt, sp.speed * 1.7 * 1.12 * (a.injured ? 0.65 : 1));
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
    if (a.state === 'fight') return;
    var t = tileOf(a.x, a.z);
    if (!aok(a, t)) { relocateAnimal(a, enc); t = tileOf(a.x, a.z); }
    if (a.sick) { a.state = 'sick'; a.speed = 0; return; }
    var target = -1, pry = null, rival = null;
    if (isNight() || a.energy < 18) {
      a.tg = 'sleep';
      if (E.shelter.length && (sp.needsShelter || rng.chance(0.6))) target = pickPassable(a, E.shelter);
      if (target < 0 || (tileOf(a.x, a.z) === target)) { a.state = 'sleep'; a.speed = 0; a.tg = ''; return; }
    } else {
      if (isPredator(sp) && !a.baby && !a.injured && a.health > 35 && (a.fightCd || 0) <= 0) {
        var hasOtherPred = false;
        for (var pk = 0; pk < enc.animals.length; pk++) {
          var pa = RT.aById.get(enc.animals[pk]);
          if (pa && pa !== a && !pa.baby && isPredator(SP[pa.species]) && !isCompanionPair(a.species, pa.species)) { hasOtherPred = true; break; }
        }
        if (hasOtherPred && rng.chance(a.hunger > 55 ? 0.32 : 0.18) && (rival = findRivalPredator(a, enc))) {
          a.tg = 'fight_rival'; a.hid = rival.id; a.hunt = 0; a.state = 'run'; a.tx = rival.x; a.tz = rival.z; a.stuck = 0;
          if (isPackHunter(sp)) rallyPack(a, enc, rival, 'fight_rival');
          return;
        }
        if (a.hunger > 35 && E.nAn > 1 && (pry = findPrey(a, enc)) && rng.chance(a.hunger > 55 ? 0.85 : 0.45)) {
          a.tg = 'hunt'; a.hid = pry.id; a.hunt = 0; a.state = 'run'; a.tx = pry.x; a.tz = pry.z; a.stuck = 0;
          if (isPackHunter(sp)) rallyPack(a, enc, pry, 'hunt');
          return;
        }
      }
      if (a.hunger > 55 && enc.foodLevel > 0.02) { a.tg = 'eat'; target = E.feed; }
      else if (a.thirst > 55 && (E.water.length || enc.waterLevel > 0.02)) {
        a.tg = 'drink';
        target = E.drink.length ? pickPassable(a, E.drink) : (E.water.length && swimmer(sp) ? pickPassable(a, E.water) : E.feed);
      } else if (E.toy.length && rng.chance(0.12)) { a.tg = 'play'; target = pickPassable(a, E.toy); }
      else if (E.water.length && swimmer(sp) && rng.chance(0.18)) { a.tg = 'swim'; target = pickPassable(a, E.water); }
      else { a.tg = 'wander'; target = randomEncTile(a, enc, 14); }
    }
    if (target < 0 || !aok(a, target)) { a.state = 'idle'; a.st = rng.range(1.5, 4); a.tg = ''; return; }
    setTargetTile(a, target);
    var mDec = animalMetrics(sp, a);
    if (mDec.bodyRad >= 1.05 && (a.tg === 'eat' || a.tg === 'drink' || a.tg === 'play' || a.tg === 'sleep')) {
      var standOff = clamp(mDec.bodyRad * 0.55, 0.45, 1.8);
      var baseAng = Math.atan2(a.z - czOf(target), a.x - cxOf(target)) + rng.range(-0.9, 0.9);
      for (var ak = 0; ak < 6; ak++) {
        var ang = baseAng + (ak === 0 ? 0 : ((ak % 2 ? 1 : -1) * Math.ceil(ak / 2) * (PI / 3)));
        var px = cxOf(target) + Math.cos(ang) * standOff, pz = czOf(target) + Math.sin(ang) * standOff;
        if (px < 0 || pz < 0 || px >= N * TILE || pz >= N * TILE) continue;
        var pt = tileOf(px, pz);
        if (aok(a, pt)) {
          var sb = tileSafeBounds(a, pt);
          a.tx = clamp(px, sb.minX, sb.maxX);
          a.tz = clamp(pz, sb.minZ, sb.maxZ);
          break;
        }
      }
    }
    a.state = (a.tg === 'wander' && rng.chance(0.06)) || (a.baby && rng.chance(0.15)) ? 'run' : 'walk';
    a.stuck = 0;
  }

  var FLYING_MONKEY_THOUGHTS = [
    'Watch out — winged monkeys overhead!',
    'A flying monkey swooped right past my hat!',
    'Eek! Flying monkeys from the exhibit!'
  ];
  function pickFlyoverTarget(a) {
    var maxR2 = (28 * TILE) * (28 * TILE), k, cands = [];
    for (k = 0; k < S.guests.length; k++) {
      var g = S.guests[k];
      if (g.shel || g.gt === 'out') continue;
      var gt = tileOf(g.x, g.z);
      if (!S.path[gt] || S.tileEnc[gt] === a.enc) continue;
      var dx = g.x - a.x, dz = g.z - a.z;
      if (dx * dx + dz * dz <= maxR2) cands.push({ x: g.x, z: g.z });
    }
    if (cands.length) return rng.pick(cands);
    for (k = 0; k < RT.pathTiles.length; k++) {
      var pt = RT.pathTiles[k];
      if (S.tileEnc[pt] === a.enc) continue;
      var px = cxOf(pt), pz = czOf(pt), dx2 = px - a.x, dz2 = pz - a.z;
      if (dx2 * dx2 + dz2 * dz2 <= maxR2) cands.push({ x: px, z: pz });
    }
    if (cands.length) return rng.pick(cands);
    var ai = Math.floor(a.x / TILE), aj = Math.floor(a.z / TILE);
    for (var tr = 0; tr < 16; tr++) {
      var ang = rng.range(0, TAU), dist = rng.range(4, 12);
      var ni = clamp(Math.round(ai + Math.cos(ang) * dist), 1, N - 2);
      var nj = clamp(Math.round(aj + Math.sin(ang) * dist), 1, N - 2);
      var nt = ni + nj * N;
      if (S.tileEnc[nt] !== a.enc) return { x: cxOf(nt), z: czOf(nt) };
    }
    return null;
  }
  function launchFlyover(a) {
    var tgt = pickFlyoverTarget(a);
    if (!tgt) { a.flyCooldown = 6; return false; }
    a.flyover = { phase: 'out', t: 0, dur: 12 + rng.next() * 6, hx: a.x, hz: a.z, tx: tgt.x, tz: tgt.z, alt: 0, scared: {} };
    a.flyAlt = 0;
    a.wx = 0; a.wz = 0; a.aroute = null; a.tg = '';
    bus.emit('flyover', a);
    msg('🦇 ' + a.name + ' the Winged Monkey flew over its fence for a cheeky terror raid!', 'info', false);
    return true;
  }
  function startleGuestsNear(a, fo) {
    var r2 = (7 * TILE) * (7 * TILE), k;
    for (k = 0; k < S.guests.length; k++) {
      var g = S.guests[k];
      if (g.shel || g.gt === 'out') continue;
      var dx = g.x - a.x, dz = g.z - a.z;
      if (dx * dx + dz * dz > r2) continue;
      if (!fo.scared[g.id]) {
        fo.scared[g.id] = 1;
        g.mood = Math.max(-40, (g.mood || 0) - 0.08);
        g.thought = rng.pick(FLYING_MONKEY_THOUGHTS);
        g.thoughtT = 4.5;
        g.tcool = 7;
      }
      if (g.state !== 'leave' && g.state !== 'flee' && g.state !== 'use' && g.state !== 'queue') {
        releaseGuest(g);
        g.state = 'flee'; g.glide = 0; g.gt = ''; g.dk = ''; g.ni = -1;
        g.fx = a.x; g.fz = a.z; g.fleeT = rng.range(2.2, 3.8);
      } else if (g.state === 'flee' && g.gt !== 'bunker') {
        g.fx = a.x; g.fz = a.z;
      }
    }
  }
  function stepFlyover(a, dt, sp) {
    var fo = a.flyover; if (!fo) { a.flyAlt = 0; return; }
    var outDur = fo.dur * 0.28, swoopDur = fo.dur * 0.44, retDur = fo.dur * 0.28;
    a.y = 0;
    if (fo.phase === 'out') {
      fo.t += dt;
      var u = clamp(fo.t / outDur, 0, 1), s = u * u * (3 - 2 * u);
      a.x = fo.hx + (fo.tx - fo.hx) * s;
      a.z = fo.hz + (fo.tz - fo.hz) * s;
      a.heading = Math.atan2(fo.tx - fo.hx, fo.tz - fo.hz);
      fo.alt = Math.sin(u * PI * 0.5) * 3.4 + Math.sin(u * PI) * 1.6;
      a.state = 'run'; a.speed = sp.speed * 1.5;
      if (u >= 1) { fo.phase = 'swoop'; fo.t = 0; }
    } else if (fo.phase === 'swoop') {
      fo.t += dt;
      var u2 = clamp(fo.t / swoopDur, 0, 1), ang = u2 * TAU * 1.5;
      var px = a.x, pz = a.z;
      a.x = clamp(fo.tx + Math.cos(ang) * 3.2, 1, N * TILE - 1);
      a.z = clamp(fo.tz + Math.sin(ang) * 3.2, 1, N * TILE - 1);
      a.heading = Math.atan2(a.x - px, a.z - pz);
      fo.alt = 3.0 + Math.sin(u2 * TAU * 2) * 0.75;
      a.state = 'run'; a.speed = sp.speed * 1.6;
      startleGuestsNear(a, fo);
      if (u2 >= 1) { fo.phase = 'return'; fo.t = 0; fo.sx = a.x; fo.sz = a.z; fo.salt = fo.alt; }
    } else {
      fo.t += dt;
      var u3 = clamp(fo.t / retDur, 0, 1), s3 = u3 * u3 * (3 - 2 * u3);
      var sx = fo.sx !== undefined ? fo.sx : fo.tx, sz = fo.sz !== undefined ? fo.sz : fo.tz;
      var salt = fo.salt !== undefined ? fo.salt : 3.0;
      a.x = sx + (fo.hx - sx) * s3;
      a.z = sz + (fo.hz - sz) * s3;
      a.heading = Math.atan2(fo.hx - sx, fo.hz - sz);
      fo.alt = salt * (1 - s3);
      a.state = 'run'; a.speed = sp.speed * 1.5;
      if (u3 >= 1) {
        a.x = fo.hx; a.z = fo.hz; a.tx = fo.hx; a.tz = fo.hz;
        a.flyover = null; a.flyAlt = 0;
        var hap01 = clamp((a.happiness || 0) / 100, 0, 1);
        a.flyCooldown = 55 + hap01 * 95 + rng.next() * 40;
        a.state = 'idle'; a.st = rng.range(1.5, 3); a.speed = 0;
        return;
      }
    }
    a.flyAlt = a.flyover ? a.flyover.alt : 0;
  }

  function animalStep(a, dt) {
    var sp = SP[a.species];
    if (a.fightCd > 0) a.fightCd = Math.max(0, a.fightCd - dt);
    if (a.state === 'escaped') { a.flyAlt = 0; escapedStep(a, dt, sp); return; }
    var enc = RT.eMap[a.enc], E = enc && RT.encx[a.enc];
    if (!enc || !E) { a.flyAlt = a.flyover ? a.flyover.alt : 0; return; }
    var sleeping = a.state === 'sleep';
    a.hunger = Math.min(100, a.hunger + (sleeping ? 0.08 : 0.22) * dt);
    a.thirst = Math.min(100, a.thirst + (sleeping ? 0.12 : 0.3) * dt);
    a.energy = clamp(a.energy + (sleeping ? 1.2 : -0.12) * dt, 0, 100);
    if (a.hunger >= 95 || a.thirst >= 95) a.health -= (a.thirst >= 95 ? 0.12 : 0.08) * dt;
    else if (a.sick) a.health -= 0.05 * dt;
    else if (a.injured) a.health -= 0.03 * dt;
    else if (a.health < 100 && a.hunger < 70 && a.thirst < 70) a.health = Math.min(100, a.health + 0.04 * dt);
    if (enc.poop > enc.area * 0.4 + 3) a.health -= 0.01 * dt;
    if (a.health <= 0) {
      animalDie(a, a.sick ? 'of illness' : a.injured ? 'of injuries' : (a.thirst >= 95 ? 'of thirst' : a.hunger >= 95 ? 'of hunger' : 'of neglect'));
      return;
    }
    a.ht = (a.ht || 0) - dt;
    if (a.ht <= 0) {
      a.ht = 1;
      var suit = enc.suitability[a.species]; if (suit === undefined) suit = 0.5;
      var tgt = 12 + suit * 50 + (100 - a.hunger) * 0.12 + (100 - a.thirst) * 0.12 + a.health * 0.08 + a.energy * 0.06;
      if (a.sick) tgt *= 0.6;
      if (a.injured) tgt *= 0.72;
      if (enc.minFence < sp.minFence) tgt -= 6;
      if (sp.needsCage && !enc.isCage) tgt -= 10;
      tgt += (WX.animalMood || 0);
      if (!hasRequiredCompanion(E, sp)) tgt = Math.min(tgt * 0.3, 18);
      a.happiness += (tgt - a.happiness) * 0.05; a.happiness = clamp(a.happiness, 0, 100);
    }
    a.pt -= dt;
    if (a.pt <= 0 && !a.baby) { a.pt = rng.range(55, 95); enc.poop = Math.min(enc.poop + 1, Math.floor(enc.area * 0.5) + 4); }
    if (sp.canFlyOver && a.enc > 0) {
      if (a.flyover) {
        stepFlyover(a, dt, sp);
        return;
      }
      if (a.flyCooldown === undefined) a.flyCooldown = rng.range(40, 90);
      a.flyCooldown -= dt;
      if (a.flyCooldown <= 0 && !a.baby && !a.sick && a.state !== 'sleep' && a.state !== 'fight') {
        if (launchFlyover(a)) { stepFlyover(a, 0, sp); return; }
      }
    }
    a.flyAlt = a.flyover ? a.flyover.alt : 0;
    var inWater = S.terrain[tileOf(a.x, a.z)] === WATER;
    a.y = inWater ? -0.3 : 0;

    // prey reactions when hunted
    if (E.nAn > 1 && !isPredator(sp) && a.state !== 'fight') {
      a.fl = (a.fl || 0) - dt;
      if (a.fl <= 0) {
        a.fl = 0.6;
        for (var hk = 0; hk < enc.animals.length; hk++) {
          var hp = RT.aById.get(enc.animals[hk]);
          if (hp && (hp.tg === 'hunt' || hp.tg === 'fight_rival') && hp.hid === a.id) {
            var hdx = hp.x - a.x, hdz = hp.z - a.z;
            if (hdx * hdx + hdz * hdz < 100) { if (a.tg !== 'flee' || a.state !== 'run') fleeFrom(a, enc, hp.x, hp.z); break; }
          }
        }
      }
    }

    switch (a.state) {
      case 'fight':
        a.speed = 0;
        if (!a.fid || !S.fights || !S.fights.some(function (f) { return f.id === a.fid; })) {
          a.state = 'idle'; a.fid = 0; a.st = 1;
        }
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
        var spd = sp.speed * (a.baby ? 0.8 : 1) * (a.state === 'run' ? 1.7 : a.state === 'swim' ? 0.6 : 0.75) * (a.injured ? 0.65 : 1);
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
        if (a.st <= 0) { if (hasRequiredCompanion(E, sp)) a.happiness = Math.min(100, a.happiness + 15); a.state = 'idle'; a.st = rng.range(1, 3); }
        break;
    }
  }

  // ---- escapes ----
  function doEscape(a, enc) {
    var homeId = (enc && enc.id) || a.enc || a.homeEnc;
    if (homeId) a.homeEnc = homeId;
    a.state = 'escaped'; a.enc = 0; a.tg = ''; a.esc = 0;
    // place outside enclosure
    var E = enc ? RT.encx[enc.id] : null;
    if (E && E.out.length) {
      var t = E.out[Math.floor(rng.next() * E.out.length)];
      a.x = cxOf(t); a.z = czOf(t); a.tx = a.x; a.tz = a.z;
    }
    S.stats.escapes++; S.panic = Math.min(2, (S.panic || 0) + 0.5);
    msg(a.name + ' the ' + SP[a.species].name.toLowerCase() + ' has escaped from ' + (enc ? enc.name : 'its enclosure') + '! Security guards should recapture it.', 'bad');
    bus.emit('escape', a);
  }
  function recapture(a, by) {
    a.state = 'idle'; a.st = 2; a.tg = ''; a.held = 0; a.claim = 0;
    var encs = S.enclosures; if (!encs.length) return;
    var homeId = a.homeEnc || a.home;
    var enc = (homeId && RT.eMap[homeId] && RT.eMap[homeId].tiles && RT.eMap[homeId].tiles.length) ? RT.eMap[homeId] : null;
    if (!enc) {
      for (var k = 0; k < encs.length; k++) if (encs[k].species.indexOf(a.species) >= 0 && encs[k].tiles && encs[k].tiles.length) { enc = encs[k]; break; }
    }
    if (!enc) enc = encs[0];
    if (!enc || !enc.tiles || !enc.tiles.length) return;
    var t = randomEncTile(a, enc, 10);
    if (t < 0) t = enc.tiles[Math.floor(rng.next() * enc.tiles.length)];
    a.x = cxOf(t); a.z = czOf(t); a.tx = a.x; a.tz = a.z; a.enc = enc.id; a.homeEnc = enc.id;
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
        if (eps && eps.diet !== 'carnivore' && !eps.predator && !isCompanionPair(a.species, ep.species)) {
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
        setTargetTile(a, t);
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
        var needCageEscape = sp.needsCage && !enc.isCage;
        if (needCageEscape) def = Math.max(def, 2);
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
  function staffSpeed(s) { return s.type === 'resort_guard' ? 2.7 * 1.25 : s.type === 'security' ? 2.7 : s.type === 'electrician' ? 2.6 : s.type === 'mechanic' ? 2.5 : s.type === 'cleaner' ? 1.9 : s.type === 'handyman' ? 1.85 : 2.2; }
  function walkRoute(s, dt) {
    var r = s.route;
    if (!r || s.ri >= r.length) { s.speed = 0; return true; }
    var t = r[s.ri];
    if (Z.Boats && Z.Boats.staffHop(s, t, dt)) return false;
    var tx = cxOf(t) + s.lo * (((t % N) & 1) ? 1 : -1), tz = czOf(t) + s.lo * 0.5;
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
  var STATION_TILES = 48;
  function objCenter(o) {
    var fp = objFootprint(o);
    return { x: (fp.i0 + fp.w * 0.5) * TILE, z: (fp.j0 + fp.h * 0.5) * TILE };
  }
  function inStationZone(x, z, list, rTiles) {
    var r2 = (rTiles * TILE) * (rTiles * TILE);
    for (var k = 0; k < list.length; k++) {
      var c = objCenter(list[k]), dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }
  function encReachesComp(e, c) {
    if (!c) return true;
    for (var k = 0; k < e.viewTiles.length; k++) if (RT.scomp[e.viewTiles[k]] === c) return true;
    return false;
  }
  function encNeedsKeeper(e) {
    return e.breach > 0 || e.foodLevel < 0.75 || (e.waterLevel !== undefined && e.waterLevel < 0.6) || e.poop >= 1;
  }
  function vetNeedsAnimal(a) { return !!(a && a.enc && (a.sick || a.injured || a.health < 55)); }
  function claimed(key, s) {
    var c = RT.claim[key];
    return !!(c && (!s || c !== s.id) && RT.sById.has(c));
  }
  function pickKeeperEnc(s, sc0) {
    var best = null, bs = -1e9;
    for (var k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k];
      if (!e.animals.length || !e.viewTiles.length || !encReachesComp(e, sc0)) continue;
      if (claimed('e' + e.id, s) || claimed('f' + e.id, s) || claimed('p' + e.id, s) || !encNeedsKeeper(e)) continue;
      var wl = e.waterLevel === undefined ? 1 : e.waterLevel;
      var need = (e.breach > 0 ? 5 : 0) + (e.foodLevel < 0.35 ? 2 : 0) + (1 - e.foodLevel) * 1.4 + (1 - wl) * 1.1 + e.poop * 0.35;
      var dx = e.cx - s.x, dz = e.cz - s.z, dist = Math.sqrt(dx * dx + dz * dz);
      var sc = need - dist * 0.01;
      if (!best || sc > bs) { best = e; bs = sc; }
    }
    return best;
  }
  function pickVetAnimal(s, sc0) {
    var best = null, bs = -1e9;
    for (var k = 0; k < S.animals.length; k++) {
      var a = S.animals[k];
      if (!vetNeedsAnimal(a) || claimed('v' + a.id, s)) continue;
      var enc = RT.eMap[a.enc]; if (!enc || !enc.viewTiles.length || !encReachesComp(enc, sc0)) continue;
      var dist = Math.hypot(a.x - s.x, a.z - s.z);
      var sc = (a.sick ? 4 : 0) + (a.injured ? 3.5 : 0) + Math.max(0, 80 - a.health) * 0.05 + (inStationZone(a.x, a.z, RT.vets, STATION_TILES) ? 0.4 : 0) - dist * 0.01;
      if (!best || sc > bs) { best = a; bs = sc; }
    }
    return best;
  }
  function hasCleanerWork(s, sc0) {
    var bins = RT.byType.bin;
    for (var k = 0; k < bins.length; k++) {
      var bin = bins[k]; if ((bin.fill || 0) < 8 || claimed('b' + bin.id, s)) continue;
      for (var d = 0; d < 4; d++) {
        var ni = bin.i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = bin.j + (d === 2 ? 1 : d === 0 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        var nt = ni + nj * N;
        if (S.path[nt] && (!sc0 || RT.scomp[nt] === sc0)) return true;
      }
    }
    var pt = RT.pathTiles;
    for (k = 0; k < pt.length; k++) {
      var t = pt[k];
      if ((!sc0 || RT.scomp[t] === sc0) && S.dirt[t] >= 40 && !claimed('t' + t, s)) return true;
    }
    return false;
  }
  function hasEscapeeToCatch(s) {
    for (var k = 0; k < RT.escaped.length; k++) {
      var a = RT.escaped[k];
      if (!claimed('a' + a.id, s)) return true;
    }
    return false;
  }
  function pickBreachedEnc(s, sc0) {
    var best = null, bd = 1e9;
    for (var k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k];
      if (!(e.breach > 0) || !e.viewTiles.length || !encReachesComp(e, sc0) || claimed('e' + e.id, s)) continue;
      var dist = Math.hypot(e.cx - s.x, e.cz - s.z);
      if (dist < bd) { bd = dist; best = e; }
    }
    return best;
  }
  function hasCoasterWork(s, sc0) {
    return !!(Z.Coaster && Z.Coaster.hasUrgentMechanicWork && Z.Coaster.hasUrgentMechanicWork(s, sc0, claimed));
  }
  function hasPowerCutWork(s) {
    return powerCutActive() && !claimed('pwcut', s);
  }
  function urgentTaskReady(s) {
    var t = tileOf(s.x, s.z), sc0 = RT.scomp[S.path[t] ? t : s.ti];
    if (s.type === 'security' || s.type === 'resort_guard') return hasEscapeeToCatch(s);
    if (s.type === 'keeper') return !!pickKeeperEnc(s, sc0) || (RT.secCount === 0 && hasEscapeeToCatch(s));
    if (s.type === 'vet') return !!pickVetAnimal(s, sc0);
    if (s.type === 'cleaner') return hasCleanerWork(s, sc0);
    if (s.type === 'electrician') return hasPowerCutWork(s) || !!pickBreachedEnc(s, sc0);
    if (s.type === 'mechanic') return hasCoasterWork(s, sc0) || !!pickBreachedEnc(s, sc0);
    if (s.type === 'handyman') return !!pickBreachedEnc(s, sc0) || hasCoasterWork(s, sc0) || hasPowerCutWork(s) || hasCleanerWork(s, sc0);
    return false;
  }
  function staffCoverage() {
    var huts = RT.huts.map(function (o) { var c = objCenter(o); return { id: o.id, i: o.i, j: o.j, x: c.x, z: c.z, radius: STATION_TILES }; });
    var clinics = RT.vets.map(function (o) { var c = objCenter(o); return { id: o.id, i: o.i, j: o.j, x: c.x, z: c.z, radius: STATION_TILES }; });
    return {
      keeperHutTiles: STATION_TILES,
      vetClinicTiles: STATION_TILES,
      stationTiles: STATION_TILES,
      hasHut: RT.hasHut,
      hasVet: RT.hasVet,
      huts: huts,
      clinics: clinics,
      enclosuresInRadius: function (hx, hz, radiusTiles) {
        var r = (radiusTiles || STATION_TILES) * TILE, n = 0;
        for (var k = 0; k < S.enclosures.length; k++) {
          var e = S.enclosures[k]; if (!e.viewTiles.length) continue;
          var best = Math.hypot(e.cx - hx, e.cz - hz);
          for (var v = 0; v < e.viewTiles.length; v++) {
            var d = Math.hypot(cxOf(e.viewTiles[v]) - hx, czOf(e.viewTiles[v]) - hz);
            if (d < best) best = d;
          }
          if (best <= r) n++;
        }
        return n;
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
      for (var k = 0; k < pt.length; k++) {
        var c = pt[k], ci = c % N, cj = (c - ci) / N, dx = ci - i, dy = cj - j, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = c; }
      }
    }
    if (best < 0) return false;
    s.ti = best; s.x = cxOf(best); s.z = czOf(best); s.tk = null; s.route = null; releaseClaims(s);
    return true;
  }
  function startPatrol(s) {
    s.state = 'idle'; s.speed = 0; s.wt = rng.range(0.5, 1.2); s.tk = null; s.route = null;
    s.task = (s.type === 'keeper' || s.type === 'vet' || s.type === 'security' || s.type === 'resort_guard' || s.type === 'cleaner' || s.type === 'mechanic' || s.type === 'handyman' || s.type === 'electrician') ? 'Patrolling (radio ready)' : 'Patrolling';
    var pt = RT.pathTiles; if (!pt.length || !S.path[s.ti]) return;
    var sc0 = RT.scomp[s.ti], pool = sc0 ? pt.filter(function (c) { return RT.scomp[c] === sc0; }) : pt;
    if (!pool.length) return;
    var homeT = s.home >= 0 ? s.home : s.ti, hi = homeT % N, hj = (homeT - hi) / N;
    var tgt = pool[Math.floor(rng.next() * pool.length)];
    var rPatrol = false;
    if (s.type === 'resort_guard') {
      var rSpots = [];
      for (var ri = 0; ri < S.objects.length; ri++) {
        var ro = S.objects[ri], rdef = ro && ro.kind === 'building' ? BD[ro.type] : null;
        if (rdef && rdef.resort && buildingConnected(ro)) {
          var apt = adjacentPathTiles(ro);
          for (var ai = 0; ai < apt.length; ai++) if (!sc0 || RT.scomp[apt[ai]] === sc0) rSpots.push(apt[ai]);
        }
      }
      if (rSpots.length) { tgt = rSpots[Math.floor(rng.next() * rSpots.length)]; rPatrol = true; }
    }
    if (!rPatrol) {
      for (var k = 0; k < 6; k++) {
        var c = pool[Math.floor(rng.next() * pool.length)], ci = c % N, cj = (c - ci) / N;
        if (Math.abs(ci - hi) + Math.abs(cj - hj) < 26) { tgt = c; break; }
      }
    }
    var r = findRoute(s.ti, function (t) { return t === tgt; });
    if (r && r.length) { s.tk = { k: 'patrol', chk: 1 }; s.route = r; s.ri = 0; s.state = 'walk'; }
  }

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

  function assignCleanerTask(s, durBin, durDirt) {
    var bins = RT.byType.bin;
    for (var k = 0; k < bins.length; k++) {
      var bin = bins[k];
      if ((bin.fill || 0) >= 8 && !claimed('b' + bin.id, s)) {
        var r5 = findRoute(s.ti, function (t) { return Math.abs((t % N) - bin.i) + Math.abs(Math.floor(t / N) - bin.j) === 1; });
        if (r5) { RT.claim['b' + bin.id] = s.id; s.tk = { k: 'bin', id: bin.id, i: bin.i, j: bin.j, dur: durBin }; s.task = 'Emptying litter bin'; s.route = r5; s.ri = 0; return true; }
      }
    }
    var rc = findRoute(s.ti, function (t) { return S.dirt[t] >= 40 && !claimed('t' + t, s); });
    if (rc) {
      var dt = rc.length ? rc[rc.length - 1] : s.ti;
      RT.claim['t' + dt] = s.id; s.tk = { k: 'dirt', t: dt, dur: durDirt }; s.task = 'Sweeping path';
      s.route = rc; s.ri = 0; return true;
    }
    return false;
  }
  function assignFenceTask(s, sc0, dur) {
    var enc = pickBreachedEnc(s, sc0);
    if (!enc) return false;
    var vs = new Set(enc.viewTiles), rf = findRoute(s.ti, function (t) { return vs.has(t); });
    if (!rf) return false;
    RT.claim['e' + enc.id] = s.id;
    s.tk = { k: 'fence', id: enc.id, dur: dur };
    s.task = 'Repairing fence at ' + enc.name;
    s.route = rf; s.ri = 0;
    return true;
  }
  function assignCoasterTask(s, sc0, dur, targetCond) {
    if (!(Z.Coaster && Z.Coaster.pickMechanicTarget)) return false;
    var mt = Z.Coaster.pickMechanicTarget(s, sc0, claimed);
    if (!mt) return false;
    var mSet = new Set(mt.tiles), rm = findRoute(s.ti, function (t) { return mSet.has(t); });
    if (!rm) return false;
    RT.claim['c' + mt.station.id] = s.id;
    s.tk = { k: 'coaster', id: mt.station.id, broken: mt.broken, dur: dur, targetCond: targetCond };
    s.task = (mt.broken ? 'Repairing ' : 'Servicing ') + BD[mt.station.type].name;
    s.route = rm; s.ri = 0;
    return true;
  }
  function assignPowerCutTask(s, dur) {
    if (!hasPowerCutWork(s)) return false;
    RT.claim['pwcut'] = s.id;
    s.tk = { k: 'powerCut', dur: dur };
    s.task = 'Restoring zoo power';
    s.route = null; s.state = 'work'; s.wt = dur;
    return true;
  }

  function assignTask(s) {
    var k, enc, a;
    if (!staffOnPath(s)) { s.state = 'idle'; s.speed = 0; s.wt = 1; s.task = 'Waiting for path'; return; }
    var sc0 = RT.scomp[s.ti];
    if (s.type === 'security' || s.type === 'resort_guard') {
      if (RT.escaped.length) {
        for (k = 0; k < RT.escaped.length; k++) {
          a = RT.escaped[k]; if (claimed('a' + a.id, s)) continue;
          RT.claim['a' + a.id] = s.id; s.tk = { k: 'cap', id: a.id }; s.task = 'Responding to escape';
          var r0 = planCapRoute(s, a); if (r0) { s.route = r0; s.ri = 0; }
          return;
        }
      }
    }
    if (s.type === 'keeper') {
      var bestEnc = pickKeeperEnc(s, sc0);
      if (bestEnc) {
        var vs = new Set(bestEnc.viewTiles), rk = findRoute(s.ti, function (t) { return vs.has(t); });
        if (rk) {
          RT.claim['e' + bestEnc.id] = s.id; s.tk = { k: 'enc', id: bestEnc.id };
          s.task = (bestEnc.breach > 0 ? 'Securing ' : 'Caring for ') + bestEnc.name;
          s.route = rk; s.ri = 0; return;
        }
      }
      if (RT.escaped.length && RT.secCount === 0) {
        for (k = 0; k < RT.escaped.length; k++) {
          a = RT.escaped[k]; if (claimed('a' + a.id, s)) continue;
          RT.claim['a' + a.id] = s.id; s.tk = { k: 'cap', id: a.id }; s.task = 'Helping catch ' + a.name;
          var r3 = planCapRoute(s, a); if (r3) { s.route = r3; s.ri = 0; }
          return;
        }
      }
    }
    if (s.type === 'vet') {
      var bestAn = pickVetAnimal(s, sc0);
      if (bestAn) {
        enc = RT.eMap[bestAn.enc];
        var vs2 = new Set(enc.viewTiles), r4 = findRoute(s.ti, function (t) { return vs2.has(t); });
        if (r4) {
          RT.claim['v' + bestAn.id] = s.id; s.tk = { k: 'vet', id: bestAn.id, encId: enc.id };
          s.task = (bestAn.sick || bestAn.injured ? 'Treating ' : 'Checking ') + bestAn.name;
          s.route = r4; s.ri = 0; return;
        }
      }
    }
    if (s.type === 'cleaner' && assignCleanerTask(s, 2, 2.5)) return;
    if (s.type === 'electrician') {
      if (assignPowerCutTask(s, 2.2)) return;
      if (assignFenceTask(s, sc0, 2.2)) return;
    }
    if (s.type === 'mechanic') {
      if (assignCoasterTask(s, sc0, 2.4, 100)) return;
      if (assignFenceTask(s, sc0, 2.5)) return;
    }
    if (s.type === 'handyman') {
      if (assignFenceTask(s, sc0, 5.5)) return;
      if (assignCoasterTask(s, sc0, 5.5, 90)) return;
      if (assignPowerCutTask(s, 8.0)) return;
      if (assignCleanerTask(s, 2.5, 2.5)) return;
    }
    startPatrol(s);
  }

  function staffStep(s, dt) {
    var airborne = s.state === 'boat' || s.state === 'fly';
    if (s.sickUntil > S.day + S.time && !airborne) { if (s.tk || s.route || s.task !== 'Off sick') releaseClaims(s); s.tk = null; s.route = null; s.state = 'idle'; s.speed = 0; s.task = 'Off sick'; return; }
    if (s.tk && s.tk.k === 'patrol' && !airborne) {
      s.tk.chk = (s.tk.chk === undefined ? 1 : s.tk.chk) - dt;
      if (s.tk.chk <= 0) {
        s.tk.chk = s.type === 'cleaner' ? 1.5 : 1.0;
        if (urgentTaskReady(s)) { s.tk = null; s.route = null; s.state = 'idle'; s.wt = 0; assignTask(s); return; }
      }
    }
    if (s.tk && s.tk.k === 'cap') {
      var an = RT.aById.get(s.tk.id);
      if (an && an.state === 'escaped') {
        var dx = an.x - s.x, dz = an.z - s.z;
        if (dx * dx + dz * dz < 64) { tryRecapture(s, dt); return; }
      }
    }
    if (s.route) {
      if (!airborne && s.tk && s.tk.k === 'vet') {
        var va = RT.aById.get(s.tk.id);
        if (!va || (!va.sick && !va.injured && va.health >= 65)) { releaseClaims(s); s.tk = null; s.route = null; s.state = 'idle'; s.wt = 0; return; }
      }
      if (!airborne && (s.tk && (s.tk.k === 'enc' || s.tk.k === 'feed' || s.tk.k === 'poop' || s.tk.k === 'fence')) && (!encById(s.tk.id) || (s.tk.k === 'fence' && !(encById(s.tk.id).breach > 0)))) {
        releaseClaims(s); s.tk = null; s.route = null; s.state = 'idle'; s.wt = 0; return;
      }
      if (!airborne && s.tk && s.tk.k === 'powerCut' && !powerCutActive()) {
        releaseClaims(s); s.tk = null; s.route = null; s.state = 'idle'; s.wt = 0; return;
      }
      if (walkRoute(s, dt)) {
        s.route = null;
        if (s.tk) {
          var tk = s.tk;
          if (tk.k === 'patrol') {
            s.tk = null; s.state = 'idle'; s.wt = rng.range(0.6, 1.2); s.task = 'Ready';
          } else if (tk.k === 'enc' || tk.k === 'feed' || tk.k === 'poop') {
            var inHut = inStationZone(s.x, s.z, RT.huts, STATION_TILES);
            s.state = 'work'; s.wt = RT.hasHut ? (inHut ? 1.8 : 2.3) : 3.2; s.task = 'Tending animals';
          } else if (tk.k === 'fence') {
            s.state = 'work'; s.wt = tk.dur || 2.5; s.task = 'Repairing fence';
          } else if (tk.k === 'powerCut') {
            s.state = 'work'; s.wt = tk.dur || 2.2; s.task = 'Restoring zoo power';
          } else if (tk.k === 'vet') {
            var pa = RT.aById.get(tk.id);
            s.state = 'work'; s.wt = RT.hasVet ? (pa && inStationZone(pa.x, pa.z, RT.vets, STATION_TILES) ? 1.8 : 2.5) : 4.2; s.task = 'Administering treatment';
          } else if (tk.k === 'bin') {
            s.state = 'work'; s.wt = tk.dur || 2; s.task = 'Emptying bin';
          } else if (tk.k === 'dirt') {
            s.state = 'work'; s.wt = tk.dur || 2.5; s.task = 'Sweeping';
          } else if (tk.k === 'coaster') {
            s.state = 'work'; s.wt = tk.dur || 2.4; s.task = tk.broken ? 'Repairing rollercoaster' : 'Servicing rollercoaster';
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
          if (done.k === 'enc' || done.k === 'feed' || done.k === 'poop') {
            var e = encById(done.id);
            if (e) {
              var hadBreach = e.breach > 0;
              e.foodLevel = 1; e.waterLevel = 1; e.poop = 0;
              if (hadBreach) { repairEnclosureBreach(e, s.name); msg(s.name + ' secured the damaged fence at ' + e.name + '.', 'good', false); }
              encStats(e);
            }
            delete RT.claim['e' + done.id]; delete RT.claim['f' + done.id]; delete RT.claim['p' + done.id];
          }
          else if (done.k === 'fence') {
            var ef = encById(done.id);
            if (ef && ef.breach > 0) {
              repairEnclosureBreach(ef, s.name);
              msg(s.name + ' repaired the damaged fence at ' + ef.name + '.', 'good', false);
            }
            delete RT.claim['e' + done.id];
          }
          else if (done.k === 'powerCut') {
            resolvePowerCut(s.name);
            delete RT.claim['pwcut'];
          }
          else if (done.k === 'vet') {
            var a2 = RT.aById.get(done.id);
            if (a2) {
              var heal = RT.hasVet ? (inStationZone(a2.x, a2.z, RT.vets, STATION_TILES) ? 100 : 70) : 45;
              a2.sick = false; a2.injured = false; a2.health = Math.min(100, a2.health + heal);
              msg(a2.name + ' was treated and is feeling better.', 'good');
            }
            delete RT.claim['v' + done.id];
          }
          else if (done.k === 'bin') { var b = RT.oById.get(done.id); if (b) { b.fill = 0; } delete RT.claim['b' + done.id]; }
          else if (done.k === 'dirt') {
            S.dirt[done.t] = 0;
            delete RT.claim['t' + done.t];
          }
          else if (done.k === 'coaster') {
            if (Z.Coaster && Z.Coaster.onMechanicRepair) Z.Coaster.onMechanicRepair(done.id, s.name, done.targetCond || 100);
            delete RT.claim['c' + done.id];
          }
        }
        s.tk = null; s.state = 'idle'; s.wt = 0.6; s.task = 'Ready';
      }
      return;
    }
    s.wt -= dt;
    if (s.wt <= 0) assignTask(s);
  }

  // ---- rating & goals ----
  function demandReference() {
    var history = Array.isArray(S.ratingDemandDays) ? S.ratingDemandDays : [];
    var recent = history.filter(function (v) { return isFinite(v) && v >= 0; }).slice(-3);
    var avg = recent.length ? recent.reduce(function (a, b) { return a + b; }, 0) / recent.length : 0;
    return Math.max(S.guests.length, avg, S.ratingTodayPeak || 0, 30);
  }
  function ratingServices(ref) {
    var b = { food: 0, drink: 0, toilet: 0, bench: 0, bin: 0, fun: 0 }, bt = RT.byType;
    function add(key, list, unit, operating) {
      for (var i = 0; i < list.length; i++) {
        var o = list[i], def = BD[o.type] || SC[o.type] || {};
        if (o.paused || o.broken || !buildingConnected(o) || (operating && !operating(o))) continue;
        var capacity = def.capacity || unit;
        if (def.coasterStation) {
          var station = Z.Coaster.stationInfo(o.id);
          capacity = station.trains.reduce(function (seats, train) { return seats + train.cars * station.typeDef.capacity; }, 0);
        }
        b[key] += capacity / unit;
      }
    }
    add('food', bt.food.filter(function (o) { var f = BD[o.type].satisfies || {}; return (f.hunger || 0) > 0.25; }), 4);
    add('drink', bt.drink, 4); add('toilet', bt.toilet, 6); add('bench', bt.bench, 1); add('bin', bt.bin, 1, function (o) { return (o.fill || 0) < 15; });
    add('fun', bt.fun.filter(function (o) { var d = BD[o.type]; return d.type === 'ride' || d.type === 'arcade' || d.type === 'shop' || d.type === 'info'; }), 4, function (o) {
      var d = BD[o.type]; if (d.coasterStation) return !!(Z.Coaster && Z.Coaster.stationReady(o.id));
      return !Z.Power || Z.Power.usable(o);
    });
    var needed = { food: Math.ceil(ref / 35), drink: Math.ceil(ref / 45), toilet: Math.ceil(ref / 35), bench: Math.ceil(ref / 25), bin: Math.ceil(ref / 20), fun: Math.max(1, Math.ceil(ref / 50)) };
    var out = {}, sum = 0;
    Object.keys(b).forEach(function (key) { out[key] = { capacity: b[key], needed: needed[key] }; sum += Math.min(1, b[key] / needed[key]); });
    return { services: out, facilities: sum / 6 };
  }
  function recordRatingRide(venueId, quality) {
    if (!S || !isFinite(quality) || !venueId) return;
    var rows = Array.isArray(S.ratingRideDays) ? S.ratingRideDays : (S.ratingRideDays = []), day = S.day || 1;
    var row = rows.length && rows[rows.length - 1].day === day ? rows[rows.length - 1] : null;
    if (!row) { row = { day: day, rides: [] }; rows.push(row); }
    row.rides = Array.isArray(row.rides) ? row.rides : [];
    var ride = row.rides.filter(function (r) { return r.venue === venueId; })[0];
    if (!ride) { ride = { venue: venueId, count: 0, quality: 0 }; row.rides.push(ride); }
    ride.count = Math.min(10000, (ride.count || 0) + 1); ride.quality = Math.min(10000, (ride.quality || 0) + clamp(quality, 0, 10));
    row.rides = row.rides.slice(-100);
    S.ratingRideDays = rows.filter(function (r) { return r.day >= day - 2 && r.day <= day; }).slice(-3);
  }
  function attractionRatingBonus(ref) {
    var rows = Array.isArray(S.ratingRideDays) ? S.ratingRideDays : [], weightedRiders = 0, day = S.day || 1;
    for (var i = 0; i < rows.length; i++) if (rows[i].day >= day - 2 && rows[i].day <= day) {
      var rides = rows[i].rides || [];
      for (var j = 0; j < rides.length; j++) {
        var venue = RT.oById.get(rides[j].venue), def = venue && BD[venue.type];
        if (!venue || !def || (def.type !== 'ride' && def.type !== 'arcade') || venue.paused || venue.broken || !buildingConnected(venue) || (def.coasterStation && (!Z.Coaster || !Z.Coaster.stationReady(venue.id)))) continue;
        var count = rides[j].count || 0;
        var quality = clamp((rides[j].quality || 0) / 8, 0, count);
        weightedRiders += 0.35 * count + 0.65 * quality;
      }
    }
    var completion = Math.min(1, weightedRiders / (ref * 0.35));
    return 0.35 * (1 - Math.exp(-2.2 * completion)) / (1 - Math.exp(-2.2));
  }
  var RATING_WEIGHTS = Object.freeze({ animals: 0.38, welfare: 0.16, guests: 0.16, facilities: 0.12, cleanliness: 0.10, scenery: 0.08 });
  function computeRating() {
    var n = S.animals.length, spSeen = {}, nSp = 0, hsum = 0, A = 0, k;
    for (k = 0; k < n; k++) {
      var a = S.animals[k];
      if (!spSeen[a.species]) { spSeen[a.species] = 1; nSp++; }
      hsum += a.happiness;
      A += (SP[a.species] ? SP[a.species].appeal : 0) * (a.baby ? 1.35 : 1) * (a.happiness > 40 ? 1 : 0.4);
    }
    var animalsC = n ? 0.55 * Math.min(1, nSp / 14) + 0.45 * Math.min(1, A / 1400) : 0;
    var animalWelfare = n ? clamp((hsum / n - 45) / 48, 0, 1) : 0;

    var guestScale = Math.min(1, Math.max(S.guests.length / 25, (S.stats.guestsTotal || 0) / 80));
    var gNow = S.guests.length > 5 ? (S.guestHappiness || 65) : RT.ghEMA;
    var guests = clamp(((gNow * 0.5 + RT.ghEMA * 0.5) - 45) / 47, 0, 1) * guestScale;

    var ref = demandReference(), facility = ratingServices(ref), facilities = facility.facilities;

    var dc = 0;
    for (k = 0; k < RT.pathTiles.length; k++) if (S.dirt[RT.pathTiles[k]] >= 80) dc++;
    var cleanP = 1 - Math.min(1, dc / Math.max(6, RT.pathTiles.length * 0.2));
    var nEncA = 0, ce = 0;
    for (k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k];
      if (e.animals.length > 0) {
        nEncA++;
        ce += clamp(1 - e.poop / (e.area / 3 + 3), 0, 1);
      }
    }
    var clean = nEncA ? 0.5 * cleanP + 0.5 * (ce / nEncA) : (S.guests.length > 0 ? cleanP : 0);

    var aes = 0;
    for (k = 0; k < S.objects.length; k++) if (S.objects[k].kind === 'scenery') aes += (SC[S.objects[k].type] || {}).aesthetic || 0;
    var scenery = n ? clamp(aes / 260, 0, 1) : 0;

    var w = RATING_WEIGHTS, raw = w.animals * animalsC + w.welfare * animalWelfare + w.guests * guests + w.facilities * facilities + w.cleanliness * clean + w.scenery * scenery;
    var baseStars = 5 * Math.pow(clamp(raw, 0, 1), 1.15);
    var spCap = n === 0 ? 0.5 : (0.55 + Math.min(4.45, nSp * 0.26 + Math.min(n, 35) * 0.02));
    var resortBonus = Z.Resort ? Z.Resort.ratingBonus() : 0;
    var attractionBonus = attractionRatingBonus(ref), stars = clamp(Math.min(baseStars, spCap) + attractionBonus + resortBonus - 0.6 * (S.panic || 0), 0, 5);

    return { stars: stars, animals: animalsC, welfare: animalWelfare, guests: guests, facilities: facilities, cleanliness: clean, scenery: scenery, diversity: clamp(nSp / 14, 0, 1), panic: S.panic || 0, rating: S.rating,
      weights: w, baseStars: baseStars, collectionCap: spCap, attractionBonus: attractionBonus, resortBonus: resortBonus,
      speciesCount: nSp, animalCount: n, serviceDemand: ref, services: facility.services,
      cleanPaths: cleanP, cleanEnclosures: nEncA ? ce / nEncA : 1 };
  }
  function ratingBreakdown() { return computeRating(); }
  function isUnlocked(type, id) {
    var def = type === 'animal' ? SP[id]
      : type === 'building' ? BD[id]
      : type === 'scenery' ? SC[id]
      : type === 'terrain' ? (TI[id] !== undefined ? D.terrain[TI[id]] : null)
      : null;
    return def ? (def.star || 0) <= S.unlocked.star : true;
  }
  function checkUnlocks() {
    var st = Math.floor(S.rating);
    if (st > S.unlocked.star) {
      S.unlocked.star = st;
      if (st === 4) msg('✨ 4 Stars! Mythical Fantasy creatures, enchanted terrain & magical exhibit items unlocked!', 'good');
      else msg('Congratulations! You have reached a ' + st + '-star zoo rating! New species and facilities are unlocked.', 'good');
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
      case 'themepark': {
        var tpCount = 0;
        for (var k = 0; k < S.objects.length; k++) {
          var o = S.objects[k];
          if (o.kind === 'building' && BD[o.type] && (BD[o.type].type === 'ride' || BD[o.type].type === 'arcade')) tpCount++;
        }
        return tpCount >= g.target;
      }
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
  var wxScale = Z.SimCommon.wxScale;

  function recomputeWX() {
    var w = S.weather || { type: 'clear', intensity: 0.6 }, t = WXT[w.type] || WXT.cloudy, i = w.intensity === undefined ? 1 : w.intensity, k, f, ea = 1, es = 1, am = 1, einc = 1, efc = 1;
    Z.SimCommon.applyWeatherBase(WX, w.type, i, t);
    WX.adm = WX.arrivals; WX.speed = WX.guestSpeed; WX.wet = WX.shelter;
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
  var wxHoursTxt = Z.SimCommon.wxHoursTxt;
  function setWeather(type, intensity, hours, cause) {
    var w = S.weather, transition = Z.SimCommon.transitionWeather(w, type, intensity, hours, function () { return wxPick(type); }), old = transition.old, def = wxDef(type), t = WXT[type] || WXT.cloudy;
    if (!transition.changed) { recomputeWX(); bus.emit('weather', w); return; }
    recomputeWX();
    if (t.notable) msg((cause ? cause + ' ' : '') + def.name + ' for ' + wxHoursTxt(hours) + '. ' + wxEffectText(type, intensity), type === 'fog' ? 'info' : 'bad');
    else if (WXT[old] && WXT[old].notable) msg('The ' + wxDef(old).name.toLowerCase() + ' has passed. ' + (type === 'clear' ? 'Clear skies again.' : 'It is ' + def.name.toLowerCase() + ' now.'), 'good', false);
    bus.emit('weather', w);
  }
  function advanceWeather() { var w = S.weather, nt = w.next && WXT[w.next] ? w.next : wxPick(w.type); setWeather(nt, wxIntensity(nt), wxHours(nt)); }
  function weatherInfo() {
    var w = S.weather, def = wxDef(w.type), nd = wxDef(w.next || 'cloudy'), nw = WXT[w.next] && WXT[w.next].notable;
    var fc = Z.SimCommon.forecastText(w.hoursLeft, def.name, nd.name, nw);
    return { type: w.type, name: def.name, emoji: def.emoji, effects: (WXT[w.type] && WXT[w.type].notable) ? wxEffectText(w.type, w.intensity) : def.effects, blurb: def.blurb, intensity: w.intensity, hoursLeft: Math.round(w.hoursLeft * 10) / 10,
      next: w.next, nextName: nd.name, nextEmoji: nd.emoji, forecast: fc, activeEvents: S.activeEvents ? S.activeEvents.slice() : [] };
  }
  function weatherForecast() { return weatherInfo().forecast; }
  function weatherReport() { return weatherInfo(); }

  function hourlyWeather() {
    var w = S.weather;
    if (w.type === 'storm' && rng.chance(0.12 * w.intensity)) {
      var cand = S.enclosures.filter(function (e) { return e.animals.length && !(e.breach > 0); });
      if (cand.length) { var e = rng.pick(cand); breachEnclosure(e); msg('Lightning has brought down a fence panel at ' + e.name + '. It is open to the elements until repaired, so animals could slip out!', 'bad'); }
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
        if (eff.breach) { var cand = S.enclosures.filter(function (e) { return e.animals.length; }); if (cand.length) { e1 = rng.pick(cand); breachEnclosure(e1); } }
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
          st.sickUntil = S.day + S.time + sHrs / 24; st.tk = null; st.route = null; st.state = 'idle'; st.speed = 0; st.task = 'Off sick'; releaseClaims(st);
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
    RT.escaped.length = 0; RT.guides.length = 0; RT.secCount = 0; RT.keeperCount = 0; RT.vetCount = 0; RT.mechCount = 0; RT.handyCount = 0; RT.elecCount = 0; RT.dangerEsc = 0;
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
      if (st.type === 'guide') RT.guides.push(st); else if (st.type === 'security' || st.type === 'resort_guard') RT.secCount++; else if (st.type === 'keeper') RT.keeperCount++; else if (st.type === 'vet') RT.vetCount++; else if (st.type === 'mechanic') RT.mechCount++; else if (st.type === 'handyman') RT.handyCount++; else if (st.type === 'electrician') RT.elecCount++;
    }
    for (k = 0; k < S.enclosures.length; k++) encStats(S.enclosures[k]);
    var dc = 0; for (k = 0; k < RT.pathTiles.length; k++) if (S.dirt[RT.pathTiles[k]] >= 80) dc++;
    RT.dirtyCount = dc;
    var gs = S.guests, hsum = 0; for (k = 0; k < gs.length; k++) hsum += gs[k].happiness;
    S.guestHappiness = gs.length ? hsum / gs.length : RT.ghEMA;
    S.ratingTodayPeak = Math.max(S.ratingTodayPeak || 0, gs.length);
    RT.guestCrowd = gs.length / (RT.pathTiles.length * 1.2 + 30);
    if (gs.length > S.stats.peakGuests) S.stats.peakGuests = gs.length;
    RT.value = arrivalValue(); RT.rate = arrivalRate();
    expireEvents();
    if (!openNow() && RT.pendingSpawn > 0) RT.pendingSpawn = 0;
    if (WX.type === 'storm' && gs.length) { var pl = 0.02 * WX.intensity; for (k = gs.length - 1; k >= 0; k--) if (gs[k].state !== 'leave' && rng.chance(pl)) startLeaving(gs[k]); }
    var rb = computeRating(); S.rating += (rb.stars - S.rating) * 0.015; S.rating = clamp(S.rating, 0, 5);
    checkUnlocks();
    var t = S.time;
    if (t >= CLOSE_T + 0.08 || t < OPEN_T - 0.03) {
      for (k = gs.length - 1; k >= 0; k--) {
        if (Z.Resort && Z.Resort.shouldStayOvernight(gs[k])) continue;
        removeGuest(gs[k]);
      }
    }
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
        if (sp.needsCage && !e.isCage && RT.advice['c' + key] !== S.day) {
          RT.advice['c' + key] = S.day;
          msg('The ' + lc(plural(sp)) + ' at ' + e.name + ' need a roofed Primate cage enclosure, or they may climb out!', 'bad');
        }
      }
      if (e.foodLevel < 0.2 && RT.keeperCount === 0 && RT.advice['food' + e.id] !== S.day) { RT.advice['food' + e.id] = S.day; msg('Food is running out at ' + e.name + '. Hire a keeper to refill it.', 'bad'); }
    }
    RT.t2++;
    if (RT.t2 % 2 === 0) checkGoals();
    debtCheck();
  }

  function breedingAndBirths() {
    var k, a, sp, e;
    // pregnancies progress / births
    var births = [];
    for (k = 0; k < S.animals.length; k++) {
      a = S.animals[k];
      if (a.pregnant > 0) { a.pregnant--; if (a.pregnant <= 0 && a.enc) births.push(a); }
    }
    for (k = 0; k < births.length; k++) {
      a = births[k]; sp = SP[a.species]; e = RT.eMap[a.enc]; if (!e) continue;
      var babySpId = a.species === 'purple_dragon' ? (rng.chance(0.5) ? 'pugon' : 'drassy') : a.species;
      var babySp = SP[babySpId] || sp;
      if (encSpaceDemand(e, babySpId) > usableEncSpace(e, RT.encx[e.id])) { a.pregnant = 1; continue; }
      var baby = makeAnimal(babySpId, e, a.x + rng.range(-0.8, 0.8), a.z + rng.range(-0.8, 0.8), true);
      var bt = tileOf(baby.x, baby.z);
      if (bt < 0 || !aok(baby, bt)) { baby.x = a.x; baby.z = a.z; }
      insertAnimal(baby);
      S.stats.babiesBorn++; S.stats.births++;
      msg('A baby ' + babySp.name.toLowerCase() + ' has been born at ' + e.name + '! Say hello to ' + baby.name + '.', 'good');
      bus.emit('birth', baby);
    }
    // new pregnancies
    for (k = 0; k < S.enclosures.length; k++) {
      e = S.enclosures[k];
      for (var s = 0; s < e.species.length; s++) {
        var spId = e.species[s];
        sp = SP[spId];
        if (!sp || sp.breedOnly || !sp.breedChance) continue;
        var ad = adultAge(sp);
        var list = [], hasM = false, fem = [];
        for (var i = 0; i < e.animals.length; i++) {
          var an2 = RT.aById.get(e.animals[i]);
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
      // Hybrid breeding: Puss in Boots (adult male) + Purple Dragon (adult female)
      if (e.species.indexOf('puss_in_boots') >= 0 && e.species.indexOf('purple_dragon') >= 0) {
        var spP = SP.puss_in_boots, spD = SP.purple_dragon;
        var adP = adultAge(spP), adD = adultAge(spD);
        var hasAdultPuss = false, dragonFem = null;
        for (var hi = 0; hi < e.animals.length; hi++) {
          var ha = RT.aById.get(e.animals[hi]);
          if (!ha || ha.baby) continue;
          if (ha.species === 'puss_in_boots' && ha.age >= adP && ha.sex === 'm') hasAdultPuss = true;
          else if (ha.species === 'purple_dragon' && ha.age >= adD && ha.sex === 'f' && !ha.pregnant && !ha.sick && ha.happiness > 55) dragonFem = ha;
        }
        var suitP = e.suitability.puss_in_boots || 0, suitD = e.suitability.purple_dragon || 0;
        if (hasAdultPuss && dragonFem && suitP >= 0.55 && suitD >= 0.55) {
          var hybridChance = Math.max(spD.breedChance || 0.04, spP.breedChance || 0.06) * 0.4 * (0.5 + suitD);
          if (rng.chance(hybridChance)) dragonFem.pregnant = 2;
        }
      }
    }
  }

  function newDay() {
    var k, a, up = 0;
    S.ratingDemandDays = Array.isArray(S.ratingDemandDays) ? S.ratingDemandDays : [];
    S.ratingDemandDays.push(Math.max(0, S.ratingTodayPeak || S.guests.length || 0));
    if (S.ratingDemandDays.length > 3) S.ratingDemandDays.shift();
    S.ratingTodayPeak = 0;
    for (k = 0; k < S.animals.length; k++) up += SP[SP[S.animals[k].species] ? S.animals[k].species : 'meerkat'].upkeep * (S.animals[k].baby ? 0.5 : 1);
    for (k = 0; k < S.objects.length; k++) if (S.objects[k].kind === 'building') up += BD[S.objects[k].type].upkeep;
    var wages = 0; for (k = 0; k < S.staff.length; k++) wages += STF[S.staff[k].type].wage;
    up = Math.round(up * (DIFF.costs || 1) * (EV.feedCost || 1));
    wages = Math.round(wages * (DIFF.costs || 1));
    if (up) spend(up, 'upkeep'); if (wages) spend(wages, 'wages');
    if (Z.Coaster) Z.Coaster.newDay();
    if (Z.Resort) Z.Resort.onNewDay();
    if (S.loan > 0) { var intr = Math.round(S.loan * (DIFF.interest || 0.004)); if (intr) spend(intr, 'other'); }
    var t = S.finance.today;
    var income = t.tickets + t.food + t.shops + (t.boats || 0) + t.donations, costs = -(t.upkeep + t.wages + t.marketing);
    var profit = income - costs;
    var rec = {}; for (var c in t) rec[c] = Math.round(t[c]);
    rec.day = S.day; rec.balance = Math.round(S.money); rec.income = Math.round(income); rec.costs = Math.round(costs); rec.profit = Math.round(profit);
    S.finance.history.push(rec); if (S.finance.history.length > 30) S.finance.history.shift();
    msg('Day ' + S.day + ' report: takings ' + fmt(income) + ', running costs ' + fmt(costs) + ', ' + (profit >= 0 ? 'profit ' : 'loss ') + fmt(Math.abs(profit)) + '.', profit >= 0 ? 'good' : 'bad');
    S.finance.today = Z.emptyFinance();
    S.day++; S.stats.guestsToday = 0;
    if (S.marketing.active) { S.marketing.daysLeft--; if (S.marketing.daysLeft <= 0) { S.marketing.active = false; msg('Your marketing campaign has ended.', 'info'); } }
    for (k = 0; k < S.enclosures.length; k++) {
      var e = S.enclosures[k]; if (e.breach > 0) { e.breach--; if (e.breach <= 0) { repairEnclosureBreach(e, 'Overnight crew'); msg('The fence at ' + e.name + ' has been repaired.', 'good', false); } }
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

  function canPushTo(u, enc, nx, nz) {
    if (!isFinite(nx) || !isFinite(nz) || nx < 0 || nz < 0 || nx >= N * TILE || nz >= N * TILE) return false;
    return canGo(u, u.x, u.z, nx, nz);
  }
  function separateAnimals(dt) {
    if (!(dt > 0)) return;
    var encs = S.enclosures;
    for (var ei = 0; ei < encs.length; ei++) {
      var enc = encs[ei], list = enc.animals;
      if (!list || list.length < 2) continue;
      for (var i = 0; i < list.length; i++) {
        var a = RT.aById.get(list[i]);
        if (!a || a.state === 'escaped' || a.flyover) continue;
        var spA = SP[a.species], ma = animalMetrics(spA, a);
        var aElong = ma.halfLen > ma.bodyRad * 1.15;
        var aOff = aElong ? Math.max(0, ma.halfLen - ma.sepRad * 0.65) : 0;
        var afx = aElong ? Math.sin(a.heading || 0) * aOff : 0, afz = aElong ? Math.cos(a.heading || 0) * aOff : 0;
        var wA = a.state === 'fight' ? 0 : 1 / Math.max(0.2, animalBulk(a));
        for (var j = i + 1; j < list.length; j++) {
          var b = RT.aById.get(list[j]);
          if (!b || b.state === 'escaped' || b.flyover) continue;
          if (a.fid && a.fid === b.fid) continue;
          if (((a.tg === 'hunt' || a.tg === 'fight_rival') && a.hid === b.id) || ((b.tg === 'hunt' || b.tg === 'fight_rival') && b.hid === a.id)) continue;
          if (Math.abs((a.y || 0) - (b.y || 0)) > 1.8) continue;
          if (Math.abs(a.x - b.x) > 14 || Math.abs(a.z - b.z) > 14) continue;
          var wB = b.state === 'fight' ? 0 : 1 / Math.max(0.2, animalBulk(b));
          var wSum = wA + wB; if (wSum <= 0) continue;
          var spB = SP[b.species], mb = animalMetrics(spB, b);
          var req = ma.sepRad + mb.sepRad;
          var bElong = mb.halfLen > mb.bodyRad * 1.15;
          var bOff = bElong ? Math.max(0, mb.halfLen - mb.sepRad * 0.65) : 0;
          var bfx = bElong ? Math.sin(b.heading || 0) * bOff : 0, bfz = bElong ? Math.cos(b.heading || 0) * bOff : 0;
          var minD2 = 1e9, bestDx = 0, bestDz = 0;
          var aN = aElong ? 2 : 1, bN = bElong ? 2 : 1;
          for (var ai = 0; ai < aN; ai++) {
            var pax = aElong ? (ai === 0 ? a.x + afx : a.x - afx) : a.x;
            var paz = aElong ? (ai === 0 ? a.z + afz : a.z - afz) : a.z;
            for (var bi = 0; bi < bN; bi++) {
              var pbx = bElong ? (bi === 0 ? b.x + bfx : b.x - bfx) : b.x;
              var pbz = bElong ? (bi === 0 ? b.z + bfz : b.z - bfz) : b.z;
              var ddx = pbx - pax, ddz = pbz - paz, d2 = ddx * ddx + ddz * ddz;
              if (d2 < minD2) { minD2 = d2; bestDx = ddx; bestDz = ddz; }
            }
          }
          if (minD2 >= req * req) continue;
          var dist = Math.sqrt(minD2), nx, nz;
          var cdx = b.x - a.x, cdz = b.z - a.z, cd2 = cdx * cdx + cdz * cdz;
          if (cd2 < 1e-6) {
            var loId = a.id < b.id ? a.id : b.id, hiId = a.id < b.id ? b.id : a.id;
            var ang = (((loId * 73856093) ^ (hiId * 19349663)) & 1023) * (TAU / 1024);
            var sgn = a.id < b.id ? -1 : 1;
            nx = Math.cos(ang) * sgn; nz = Math.sin(ang) * sgn; dist = 0;
          } else if (dist < 1e-5 || (bestDx * cdx + bestDz * cdz) <= 0) {
            var cdist = Math.sqrt(cd2);
            nx = cdx / cdist; nz = cdz / cdist;
          } else {
            nx = bestDx / dist; nz = bestDz / dist;
          }
          var overlap = req - dist;
          var push = Math.min(overlap * 0.45, 3.2 * dt);
          var tx = 0, tz = 0;
          if ((a.speed || 0) > 0.05 && (b.speed || 0) > 0.05) {
            var cross = Math.sin(a.heading || 0) * nz - Math.cos(a.heading || 0) * nx;
            var slideSgn = Math.abs(cross) > 0.05 ? (cross > 0 ? 1 : -1) : (((a.id ^ b.id) & 1) ? 1 : -1);
            var slide = push * 0.32 * slideSgn;
            tx = -nz * slide; tz = nx * slide;
          }
          var fA = wA / wSum, fB = wB / wSum;
          if (fA > 0) {
            var nax = a.x + (-nx * push + tx) * fA, naz = a.z + (-nz * push + tz) * fA;
            if (canPushTo(a, enc, nax, naz)) { a.x = nax; a.z = naz; }
          }
          if (fB > 0) {
            var nbx = b.x + (nx * push - tx) * fB, nbz = b.z + (nz * push - tz) * fB;
            if (canPushTo(b, enc, nbx, nbz)) { b.x = nbx; b.z = nbz; }
          }
        }
      }
    }
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
    if (Z.Coaster) Z.Coaster.step(dt);
    if (Z.Boats) Z.Boats.step(dt);
    if (Z.Resort) Z.Resort.step(dt);
    updateQueues();
    var an = S.animals;
    for (k = an.length - 1; k >= 0; k--) { if (k < an.length) { var a = an[k]; a.age += dt / DAY_SECONDS; animalStep(a, dt); } }
    separateAnimals(dt);
    stepFights(dt);
    var sf = S.staff;
    for (k = 0; k < sf.length; k++) staffStep(sf[k], dt);
    stepBreachCrews(dt);
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
  function scaleBounds(b, gn) {
    if (!b) return { i0: 0, j0: 0, i1: gn - 1, j1: gn - 1 };
    if (gn === 56) return { i0: b.i0, j0: b.j0, i1: b.i1, j1: b.j1 };
    var s = gn / 56;
    return {
      i0: b.i0 === 0 ? 0 : Math.max(0, Math.round(b.i0 * s)),
      j0: b.j0 === 0 ? 0 : Math.max(0, Math.round(b.j0 * s)),
      i1: b.i1 === 55 ? gn - 1 : Math.min(gn - 1, Math.round((b.i1 + 1) * s) - 1),
      j1: b.j1 === 55 ? gn - 1 : Math.min(gn - 1, Math.round((b.j1 + 1) * s) - 1)
    };
  }
  function scaleGen(g, gn) {
    if (!g || gn === 56) return g || {};
    var s = gn / 56, out = {};
    for (var k in g) out[k] = g[k];
    if (g.hills) out.hills = { amp: g.hills.amp, scale: g.hills.scale * s };
    if (g.lakes) out.lakes = { n: g.lakes.n, r: [Math.max(1.5, g.lakes.r[0] * s), Math.max(2.5, g.lakes.r[1] * s)], depth: g.lakes.depth };
    if (g.mesas) out.mesas = { n: g.mesas.n, r: g.mesas.r * s, h: g.mesas.h };
    if (g.ridge) out.ridge = { j: g.ridge.j * s, wave: g.ridge.wave * s, h: g.ridge.h, ramps: g.ridge.ramps ? g.ridge.ramps.map(function (x) { return x * s; }) : undefined };
    if (g.canyon) out.canyon = { j: g.canyon.j * s, wave: g.canyon.wave * s, w: Math.max(1.5, g.canyon.w * s), depth: g.canyon.depth, ramps: g.canyon.ramps ? g.canyon.ramps.map(function (x) { return x * s; }) : undefined };
    if (g.paint) out.paint = g.paint.map(function (p) { var np = {}; for (var pk in p) np[pk] = p[pk]; if (np.s !== undefined) np.s = np.s * s; return np; });
    if (g.scatter) out.scatter = g.scatter.map(function (sc) { return [sc[0], Math.max(1, Math.round(sc[1] * s * s)), sc[2], sc[3]]; });
    return out;
  }
  function genMap(md, seed, gn, scaledB) {
    var gridN = gn || N, s = gridN / 56;
    var g = scaleGen(md.gen, gridN), b = scaledB || scaleBounds(md.bounds, gridN), sd = (seed | 0) % 100003, ci, cj, k, i, j, t;
    var baseT = TI[g.base || 'grass']; if (baseT === undefined) baseT = 0;
    var lakes = [], mesas = [], tries;
    var entI0 = Math.floor(gridN / 2) - 6, entI1 = Math.floor(gridN / 2) + 6, entJ0 = Math.max(Math.floor(gridN * 0.68), gridN - 17);
    var near = function (x, y, r) {
      var dx = Math.max(entI0 - x, 0, x - entI1), dy = Math.max(entJ0 - y, 0);
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
    var phase = rng.range(0, 6.28), HF = new Float32Array((gridN + 1) * (gridN + 1));
    for (cj = 0; cj <= gridN; cj++) for (ci = 0; ci <= gridN; ci++) {
      var h = 0;
      if (g.hills && g.hills.amp) h += g.hills.amp * (fbm(ci / g.hills.scale, cj / g.hills.scale, sd + 11) - 0.5) * 2.2;
      if (g.ridge) {
        var rl = g.ridge.j + g.ridge.wave * Math.sin(ci * 0.13 / s + phase) + 1.5 * s * Math.sin(ci * 0.37 / s + phase * 2), rw = 1.1 + 6 * ramp(ci, g.ridge.ramps, 4 * s);
        h += g.ridge.h * sstep((rl - cj + rw / 2) / rw);
      }
      if (g.canyon) {
        var cl = g.canyon.j + g.canyon.wave * Math.sin(ci * 0.15 / s + phase) + 2 * s * Math.sin(ci * 0.41 / s + phase * 3), rp = ramp(ci, g.canyon.ramps, 3.5 * s), cw = g.canyon.w * (1 - 0.5 * rp), dd = cw - Math.abs(cj - cl);
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
      var pdx = Math.max(entI0 - ci, 0, ci - entI1), pdy = Math.max(entJ0 - cj, 0), pf = sstep(Math.sqrt(pdx * pdx + pdy * pdy) / 5);
      var ef = sstep(Math.min(ci, cj, gridN - ci, gridN - cj) / 4);
      HF[ci + cj * (gridN + 1)] = h * pf * ef;
    }
    for (k = 0; k < HF.length; k++) S.elev[k] = clamp(Math.round(HF[k]), -4, 12);
    // terrain
    var paint = g.paint || [], pr;
    for (j = 0; j < gridN; j++) for (i = 0; i < gridN; i++) {
      t = i + j * gridN; var c0 = i + j * (gridN + 1), hv = (HF[c0] + HF[c0 + 1] + HF[c0 + gridN + 1] + HF[c0 + gridN + 2]) / 4, ter = baseT;
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
      if (i >= entI0 - 1 && i <= entI1 && j >= entJ0 - 1) ter = TI.grass;
      S.terrain[t] = ter;
    }
    // starting plants and rocks
    var total = 0, maxTotal = Math.round(120 * s * s), sc = g.scatter || [];
    for (k = 0; k < sc.length && total < maxTotal; k++) {
      var scat = sc[k], want = scat[1], got = 0, allowed = scat[2] || [], opt = scat[3] || {};
      for (tries = 0; tries < want * 30 && got < want && total < maxTotal; tries++) {
        i = rng.int(b.i0, b.i1); j = rng.int(b.j0, b.j1); t = i + j * gridN;
        if (i >= entI0 - 1 && i <= entI1 && j >= entJ0 - 1) continue;
        if (S.tileObj[t] || S.path[t] || tileSlope(i, j) > 2) continue;
        var tn = D.terrain[S.terrain[t]] ? D.terrain[S.terrain[t]].id : '';
        if (allowed.length && allowed.indexOf(tn) < 0) continue;
        if (opt.nearWater) {
          var nw = false;
          for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) if (i + di >= 0 && j + dj >= 0 && i + di < gridN && j + dj < gridN && S.terrain[(i + di) + (j + dj) * gridN] === WATER) nw = true;
          if (!nw) continue;
        }
        if (rawPlace(scat[0], i, j, rng.int(0, 3))) { got++; total++; }
      }
    }
  }

  function applyMap(mapId, seed) {
    var md = mapDef(mapId), bb = scaleBounds(md.bounds, N);
    S.map = { id: md.id, name: md.name, i0: bb.i0, j0: bb.j0, i1: bb.i1, j1: bb.j1 };
    genMap(md, seed !== undefined ? seed : rng.getSeed(), N, bb);
    rebuildNav(); rebuildObjects(); recomputeEnclosures();
    bus.emit('terrain', { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
    bus.emit('elev', { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
    bus.emit('elev:change', { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
  }
  function previewMap(mapId, seed, mapSize) {
    var sizeN = resolveSizeN(mapSize);
    var sS = S, sR = RT, sZ = Z.state, rs = rng.getSeed(), prevN = N, out = null;
    try {
      syncGridVars(sizeN);
      S = Z.newState(undefined, sizeN); RT = newRT(); Z.state = S;
      rng.seed(seed || 1);
      var md = mapDef(mapId), bb = scaleBounds(md.bounds, sizeN);
      S.map = { id: md.id, name: md.name, i0: bb.i0, j0: bb.j0, i1: bb.i1, j1: bb.j1 };
      genMap(md, seed || 1, sizeN, bb);
      out = { terrain: S.terrain, elev: S.elev, bounds: bb, N: sizeN };
    } catch (e) { out = null; }
    syncGridVars(prevN);
    S = sS; RT = sR; Z.state = sZ; rng.seed(rs);
    return out;
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
      if (a.companion && SP[a.companion]) needs.push('Companion: ' + SP[a.companion].name);
      if (a.breedOnly) needs.push('Breed Puss in Boots + Purple Dragon');
      needs.push('Enrichment toys (1 per 40 tiles)');
      species.push({
        id: a.id, name: a.name, emoji: a.emoji, predator: !!(a.predator || a.diet === 'carnivore'),
        terrain: prefs.map(function (p) {
          var tn = D.terrain[TI[p[0]]] ? D.terrain[TI[p[0]]].name : p[0];
          return tn + ' ' + Math.round(p[1] / (psum || 1) * 100) + '%';
        }).join(', '),
        plants: (a.foliage || []).map(function (f) { return SC[f] ? SC[f].name : f; }),
        plantIds: (a.foliage || []).slice(),
        needs: needs, space: a.space, minFence: a.minFence, minSpan: animalMetrics(a).minSpan, needsCage: !!a.needsCage,
        companion: a.companion ? { id: a.companion, name: (SP[a.companion] && SP[a.companion].name) || a.companion } : null
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
    var sizeId = (opts.mapSize && typeof opts.mapSize === 'string') ? opts.mapSize.toLowerCase() : 'medium';
    var sizeN = resolveSizeN(opts.mapSize !== undefined ? opts.mapSize : 'medium');
    if (sizeN !== Z.N || N !== sizeN) Z.setGridSize(sizeN);
    rng.seed(opts.seed || (Date.now() & 0x7fffffff));
    S = Z.newState(undefined, sizeN); Z.state = S; RT = newRT();
    S.fights = [];
    S.gridN = sizeN;
    S.mapSize = SIZE_MAP[sizeId] ? sizeId : sizeIdOfN(sizeN);
    var paved = PI_.paved || 1;
    applyDifficulty(opts.difficulty, true);
    if (opts.money) S.money = opts.money;
    var md = mapDef(opts.map), bb = scaleBounds(md.bounds, N);
    S.map = { id: md.id, name: md.name, i0: bb.i0, j0: bb.j0, i1: bb.i1, j1: bb.j1 };
    var i, j, walkJ0 = N - Math.round(16 * Math.min(1, N / 56));
    for (j = N - 4; j < N; j++) for (i = GATE_I0 - 2; i <= GATE_I0 + 3; i++) S.path[i + j * N] = paved;
    for (j = walkJ0; j < N - 4; j++) { S.path[GATE_I0 + j * N] = paved; S.path[(GATE_I0 + 1) + j * N] = paved; }
    S.speed = 1;
    genMap(md, rng.getSeed(), N, bb);
    rebuildNav();
    initDerived();
    var di0 = GATE_I0 - 27, dj0 = N - 56;
    [['oak', 23, 49], ['oak', 32, 48], ['oak', 24, 41], ['pine', 33, 42], ['oak', 22, 45], ['pine', 31, 39], ['bush', 25, 49], ['bush', 30, 49], ['bush', 25, 44], ['bush', 30, 45],
      ['flower_bed', 24, 52], ['flower_bed', 31, 52], ['lamp', 26, 51], ['lamp', 29, 51]].forEach(function (p) {
        var px = p[1] + di0, py = p[2] + dj0;
        if (inMap(px, py) && !S.path[px + py * N]) rawPlace(p[0], px, py, 0);
      });
    rebuildObjects();
    recomputeEnclosures();
    ensureInit();
    if (Z.Coaster) Z.Coaster.afterLoad();
    if (Z.Boats) Z.Boats.afterLoad();
    if (Z.Resort) Z.Resort.afterLoad();
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
  var ARR_FIELDS = { terrain: Uint8Array, path: Uint8Array, fenceX: Uint8Array, fenceZ: Uint8Array, tileObj: Int32Array, tileEnc: Int32Array, dirt: Uint8Array };
  var ARR_OPTIONAL = { coasterRail: Uint8Array, coasterElev: Int8Array, coasterSpec: Uint8Array };
  function migrateTileEnc(v, enclosures) {
    if (v instanceof Int32Array) return v;
    var out = new Int32Array(v);
    if (Array.isArray(enclosures)) {
      for (var ei = 0; ei < enclosures.length; ei++) {
        var enc = enclosures[ei];
        if (!enc || !(enc.id > 0) || !Array.isArray(enc.tiles)) continue;
        var wrapped = (enc.id << 16) >> 16;
        if (wrapped === enc.id) continue;
        for (var ti = 0; ti < enc.tiles.length; ti++) {
          var t = enc.tiles[ti];
          if (t >= 0 && t < out.length && out[t] === wrapped) out[t] = enc.id;
        }
      }
    }
    return out;
  }
  function expectedArrLen(f, gn) {
    if (f === 'fenceX') return gn * (gn + 1);
    if (f === 'fenceZ') return (gn + 1) * gn;
    return gn * gn;
  }
  function load(str) {
    var obj, ns, prevN = N;
    try {
      obj = JSON.parse(str);
      if (!obj || (obj.v !== 1 && obj.v !== 2) || !obj.s) return false;
      ns = obj.s;
      var gn = resolveSizeN(ns.gridN !== undefined ? ns.gridN : (ns.mapSize || 56));
      if (ns.gridN !== undefined) {
        var rawGn = Math.round(+ns.gridN);
        if (!isFinite(rawGn) || rawGn < 32 || rawGn > 128) return false;
        gn = rawGn;
      }
      for (var f in ARR_FIELDS) {
        var v = ns[f];
        if (v && v.__t) v = Z.unpackArray(v);
        if (!v || v.length !== expectedArrLen(f, gn)) return false;
        if (f === 'tileEnc') v = migrateTileEnc(v, ns.enclosures);
        ns[f] = v;
      }
      for (var fo in ARR_OPTIONAL) {
        var vo = ns[fo];
        if (vo && vo.__t) vo = Z.unpackArray(vo);
        if (vo !== undefined && vo !== null) {
          if (vo.length !== gn * gn) return false;
          ns[fo] = vo;
        } else {
          ns[fo] = new ARR_OPTIONAL[fo](gn * gn);
        }
      }
      var ev = ns.elev;
      if (ev && ev.__t) ev = Z.unpackArray(ev);
      if (ev !== undefined && ev !== null) {
        if (ev.length !== (gn + 1) * (gn + 1)) return false;
        ns.elev = ev;
      } else {
        ns.elev = new Int8Array((gn + 1) * (gn + 1));
      }
      if (Z.N !== gn || N !== gn) Z.setGridSize(gn);
      var tpl = Z.newState(undefined, gn);
      ns.gridN = gn;
      if (!ns.mapSize) ns.mapSize = sizeIdOfN(gn);
      if (!ns.map || typeof ns.map.i0 !== 'number') ns.map = tpl.map;
      if (!ns.weather || !ns.weather.type) ns.weather = tpl.weather || { type: 'clear', intensity: 0.6, hoursLeft: 9, next: 'cloudy' };
      if (!ns.activeEvents) ns.activeEvents = [];
      if (!ns.fights) ns.fights = [];
      if (!ns.difficulty) ns.difficulty = 'normal';
      if (ns.panic === undefined) ns.panic = 0;
      if (ns.eventAt === undefined) ns.eventAt = tpl.eventAt !== undefined ? tpl.eventAt : -1;
      if (ns.debtWarn === undefined) ns.debtWarn = 0;
      for (var key in tpl) if (ns[key] === undefined) ns[key] = tpl[key];
      ns.stats = Object.assign(tpl.stats, ns.stats);
      if (ns.stats.injuries === undefined) ns.stats.injuries = 0;
      if (ns.stats.compensation === undefined) ns.stats.compensation = 0;
      if (ns.stats.ridesTaken === undefined) ns.stats.ridesTaken = 0;
      if (ns.stats.arcadePlayed === undefined) ns.stats.arcadePlayed = 0;
      ns.unlocked = Object.assign({ star: 0 }, ns.unlocked);
    } catch (e) {
      if (Z.N !== prevN) Z.setGridSize(prevN);
      return false;
    }
    try {
      S = ns; Z.state = S; RT = newRT();
      rng.seed(obj.rng || 1); RT.ghEMA = obj.ghEMA || 65; RT.nextGroup = obj.nextGroup || 1;
      applyDifficulty(S.difficulty);
      recomputeWX();
      var k;
      for (k = 0; k < S.guests.length; k++) {
        var g = S.guests[k];
        g.ti = tileOf(g.x, g.z); g.ni = -1; g.pv = 0; g.ubid = 0; g.bid = 0; g.wt = 0; g.speed = 0; g.glide = 0; g.spot = 0; g.shel = 0; g.nt = rng.next();
        if (g.state === 'ride' && g.coasterTrain) { /* re-attached by Z.Coaster.afterLoad */ }
        else if (g.state === 'resort_sleep') { /* re-attached by Z.Resort.afterLoad */ }
        else if (g.state === 'boat' || g.state === 'fly') { g.state = g.vip ? 'leave' : 'walk'; g.gt = g.vip ? 'exit' : ''; g.dk = g.vip ? 'exit' : ''; }
        else if (g.state === 'leave') { g.gt = 'exit'; g.dk = 'exit'; }
        else { g.state = 'walk'; g.gt = ''; g.dk = ''; }
        if (g.gt === 'out') g.gt = 'exit';
      }
      var fightIds = {};
      for (k = 0; k < S.fights.length; k++) fightIds[S.fights[k].id] = 1;
      for (k = 0; k < S.animals.length; k++) {
        var a = S.animals[k]; a.held = 0; a.claim = 0; a.stuck = 0; a.tg = ''; a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0;
        if (!isFinite(a.x)) a.x = N * TILE / 2; if (!isFinite(a.z)) a.z = N * TILE / 2;
        if (!isFinite(a.heading)) a.heading = 0;
        if (a.injured === undefined) a.injured = false;
        if (a.fightCd === undefined) a.fightCd = 0;
        var aSp = SP[a.species];
        if (aSp && aSp.fixedSex) a.sex = aSp.fixedSex;
        if (!a.homeEnc && a.home) a.homeEnc = a.home;
        if (a.state === 'fight' && (!a.fid || !fightIds[a.fid])) { a.state = 'idle'; a.fid = 0; }
        else if (a.state !== 'fight') a.fid = 0;
        if (a.state !== 'escaped' && a.state !== 'sleep' && a.state !== 'sick' && a.state !== 'fight') a.state = 'idle';
        a.st = rng.range(0.5, 3); a.tx = a.x; a.tz = a.z; a.speed = 0;
        a.flyAlt = a.flyover ? (a.flyover.alt || 0) : 0;
      }
      for (k = 0; k < S.staff.length; k++) { var s = S.staff[k]; s.tk = null; s.route = null; s.ri = 0; s.wt = rng.next(); s.speed = 0; s.state = 'idle'; s.ti = tileOf(s.x, s.z); }
      initDerived();
      recomputeEnclosures();
      if (Z.Coaster) Z.Coaster.afterLoad();
      if (Z.Boats) Z.Boats.afterLoad();
      if (Z.Resort) Z.Resort.afterLoad();
      secondly();
      bus.emit('reset');
      return true;
    } catch (e2) {
      if (Z.N !== prevN) Z.setGridSize(prevN);
      return false;
    }
  }

  // ====================== QUERIES ======================
  function enclosureAt(i, j) { return Z.inb(i, j) ? encOfTile(i + j * N) : null; }
  function walkable(i, j) { return Z.inb(i, j) && S.path[i + j * N] > 0; }

  function enclosureReport(encId, extraSpecies) {
    var e = encById(encId); if (!e) return null;
    var E = RT.encx[e.id], out = { id: e.id, name: e.name, area: e.area, minFence: e.minFence, isCage: !!e.isCage, see: e.see, poop: e.poop, foodLevel: e.foodLevel, waterLevel: e.waterLevel,
      breach: e.breach || 0, breachEdge: e.breachEdge || null, breachCrew: !!e.breachCrew, breachFix: Math.max(0, e.breachFix || 0), fenceCrewFee: FENCE_CREW_FEE,
      species: {}, suitability: {}, issues: [], animals: e.animals.length, viewTiles: e.viewTiles.length,
      relief: E.relief || 0, cliffTiles: E.cliffs || 0, plantsThriving: E.thrive || 0, plantsStruggling: E.struggle || 0, badPlants: E.struggle || 0 };
    if (e.breach > 0) out.issues.push(e.breachCrew ? 'Fence panel broken — emergency repair crew on site (' + Math.max(1, Math.ceil(e.breachFix || 0)) + 's).' : 'Fence panel broken! Animals may escape until repaired by a keeper or emergency crew.');
    var bySp = {}, k; for (k in E.bySp) bySp[k] = E.bySp[k];
    out.usedSpace = encSpaceDemand(e, extraSpecies); out.availableSpace = usableEncSpace(e, E);
    if (out.usedSpace > out.availableSpace) out.issues.push('Overcrowded: animals need ' + (Math.round(out.usedSpace * 10) / 10) + ' tiles, with ' + (Math.round(out.availableSpace * 10) / 10) + ' available. Expand the enclosure or move animals.');
    if (extraSpecies && SP[extraSpecies]) bySp[extraSpecies] = (bySp[extraSpecies] || 0) + 1;
    for (var sp in bySp) {
      var r = suitFor(e, E, sp, bySp[sp], out.usedSpace), name = SP[sp].name;
      out.species[sp] = { suitability: r.value, count: E.bySp[sp] || 0, breakdown: { terrain: r.terrain, space: r.space, foliage: r.foliage, water: r.water, shelter: r.shelter, rocks: r.rocks, social: r.social, clean: r.clean }, issues: r.issues };
      out.suitability[sp] = r.value;
      for (k = 0; k < r.issues.length; k++) out.issues.push(name + ': ' + r.issues[k]);
    }
    var cm = compatibleReport(e); if (cm) out.issues.push(cm);
    if (e.animals.length && !e.viewTiles.length) {
      out.noAccess = true;
      out.issues.unshift('Keepers and vets cannot reach this enclosure: no path within 3 tiles. Lay a path beside it.');
    } else if (e.animals.length && e.viewTiles.length) {
      var keepersZ = S.staff.filter(function (st) { return st.type === 'keeper'; });
      if (keepersZ.length && !keepersZ.some(function (ks) { return encReachesComp(e, RT.scomp[ks.ti]); })) {
        out.noKeeperRoute = true;
        out.issues.unshift('Keepers cannot reach this enclosure from their paths. Hire a keeper on this path network or connect it.');
      }
      var vetsZ = S.staff.filter(function (st) { return st.type === 'vet'; });
      if (vetsZ.length && e.animals.some(function (aid) { return vetNeedsAnimal(RT.aById.get(aid)); }) && !vetsZ.some(function (v) { return encReachesComp(e, RT.scomp[v.ti]); })) {
        out.noVetRoute = true;
        out.issues.unshift('Vets cannot reach this enclosure from their paths. Hire a vet on this path network or connect it.');
      }
    }
    return out;
  }
  function compatibleReport(e) {
    if (e.species.length > 1) {
      var hasPred = false, hasPrey = false, predCount = 0;
      for (var k = 0; k < e.species.length; k++) {
        var spId = e.species[k];
        if (isPredator(SP[spId])) {
          hasPred = true;
          var paired = false;
          for (var j = 0; j < k; j++) if (isCompanionPair(spId, e.species[j])) { paired = true; break; }
          if (!paired) predCount++;
        }
        else hasPrey = true;
      }
      if (hasPred && hasPrey) return 'Predators are sharing with prey species and may hunt them!';
      if (predCount > 1) return 'Rival predator species are sharing an enclosure and may fight!';
    }
    return null;
  }
  function animalReport(id) {
    var a = RT.aById.get(id); if (!a) return null;
    var sp = SP[a.species], iss = [];
    if (a.state === 'escaped') iss.push('Escaped! Security or keepers must recapture it');
    if (a.state === 'fight') iss.push('In a fight!');
    if (a.sick) iss.push('Unwell and needs a vet');
    if (a.injured) iss.push('Injured and needs a vet');
    if (a.hunger > 70) iss.push('Hungry'); if (a.thirst > 70) iss.push('Thirsty'); if (a.energy < 25) iss.push('Tired');
    if (a.health < 40) iss.push('Poor health');
    var enc = a.enc ? RT.eMap[a.enc] : null;
    if (enc) {
      if (vetNeedsAnimal(a)) {
        var vetsA = S.staff.filter(function (st) { return st.type === 'vet'; });
        if (vetsA.length && (!enc.viewTiles.length || !vetsA.some(function (v) { return encReachesComp(enc, RT.scomp[v.ti]); }))) {
          iss.push('Vets cannot reach this enclosure (missing or disconnected path)');
        }
      }
      var E = RT.encx[enc.id], r = suitFor(enc, E, a.species, E.bySp[a.species] || 1);
      for (var k = 0; k < r.issues.length; k++) iss.push(r.issues[k]);
      if (enc.foodLevel < 0.15) iss.push('Food has run out');
      if (enc.waterLevel < 0.15 && !E.water.length) iss.push('Water has run out');
    }
    return { id: a.id, name: a.name, species: a.species, speciesName: sp.name, sex: a.sex, age: a.age, baby: a.baby, state: a.state, injured: !!a.injured, enclosure: enc ? enc.name : null,
      needs: { hunger: a.hunger, thirst: a.thirst, energy: a.energy, health: a.health, happiness: a.happiness }, suitability: enc ? (enc.suitability[a.species] || 0) : 0, issues: iss, fact: sp.fact };
  }
  function guestReport(id) {
    var g = RT.gById.get(id); if (!g) return null;
    return { id: g.id, name: g.name, vip: !!g.vip, state: g.state, thought: g.thought, money: g.money, happiness: g.happiness, needs: { hunger: g.hunger, thirst: g.thirst, bladder: g.bladder, energy: g.energy, fun: g.fun } };
  }
  function objectReport(id) {
    var o = RT.oById.get(id); if (!o) return null;
    var def = o.kind === 'building' ? BD[o.type] : SC[o.type], issues = [], connected = true;
    if (o.kind === 'building') {
      connected = (def.boatPier || def.helipad) && Z.Boats ? Z.Boats.connected(o) : buildingConnected(o);
      if (!connected) issues.push(def.boatPier ? 'Needs water beside it and a path in front' : def.helipad === 'vip' ? 'Must connect to the zoo entrance by path' : 'Not connected to a path');
      if (def.type === 'staff') connected = connected;
    }
    if (o.type === 'bench' || o.type === 'bin') {
      connected = buildingConnected(o);
      if (!connected) issues.push('Not connected to a path');
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
      rideKind: def.rideKind || null, thrill: def.thrill || 0, themepark: !!def.themepark,
      thriving: thriving, thrivesOn: thrivesOn, terrainHere: hereName, info: def.info || '' };
  }
  function footprintOf(type, i, j, rot) {
    var dk = defOf(type); if (!dk) return null;
    var fp = footprint(dk.def, i, j, rot || 0);
    return { i0: fp.i0, j0: fp.j0, w: fp.w, h: fp.h, rot: fp.rot, cx: (fp.i0 + fp.w / 2) * TILE, cz: (fp.j0 + fp.h / 2) * TILE, front: frontList(fp) };
  }
  function suitabilityFor(encId, speciesId) {
    var e = encById(encId), E = e && RT.encx[encId]; if (!e || !SP[speciesId]) return null;
    return suitFor(e, E, speciesId, (E.bySp[speciesId] || 0) + 1, encSpaceDemand(e, speciesId, E));
  }

  Z.coasterCtx = {
    getS: function () { return S; },
    getRT: function () { return RT; },
    getN: function () { return N; },
    getWX: function () { return WX; },
    getDIFF: function () { return DIFF; },
    BD: BD, SP: SP, WATER: WATER, TILE: TILE, DAY_SECONDS: DAY_SECONDS,
    bus: bus, rng: rng, fmt: fmt,
    inMap: inMap, cxOf: cxOf, czOf: czOf, tileOf: tileOf,
    cornerElev: cornerElev, heightAt: heightAt,
    footprint: footprint, buildingConnected: buildingConnected,
    encById: encById, gxHr: gxHr, gxPlace: gxPlace,
    earn: earn, spend: spend, msg: msg, say: say, recordRatingRide: recordRatingRide,
    jBegin: jBegin, jOp: jOp, jEnd: jEnd,
    afterWorldChange: afterWorldChange,
    fail: fail, okr: okr, dryOf: dryOf
  };

  Z.boatsCtx = {
    releaseClaims: releaseClaims,
    getS: function () { return S; },
    getRT: function () { return RT; },
    getN: function () { return N; },
    BD: BD, WATER: WATER, TILE: TILE, INF: INF,
    rng: rng, earn: earn, msg: msg, say: say, newId: newId,
    cxOf: cxOf, czOf: czOf, heightAt: heightAt, gxHr: gxHr,
    objFootprint: objFootprint, frontPathTiles: frontPathTiles, frontList: frontList, adjacentPathExists: adjacentPathExists,
    sourcesFor: sourcesFor, getField: getField, isParkConnected: isParkConnected,
    spawnGuest: spawnGuest, removeGuest: removeGuest, openNow: openNow
  };

  function objFront(o) {
    if (!o) return { x: 0, z: 0 };
    var fpt = frontPathTiles(o);
    if (fpt && fpt.length) {
      var t = fpt[Math.floor(fpt.length / 2)];
      return { x: cxOf(t), z: czOf(t) };
    }
    var fl = frontList(objFootprint(o));
    if (fl && fl.length) {
      var f0 = fl[Math.floor(fl.length / 2)];
      return { x: (f0.i + 0.5) * TILE, z: (f0.j + 0.5) * TILE };
    }
    return objCenter(o);
  }

  Z.resortCtx = {
    S: function () { return S; },
    RT: function () { return RT; },
    D: function () { return D; },
    BD: function () { return BD; },
    SD: function () { return SC; },
    FD: function () { return D.fences; },
    OPEN_T: OPEN_T,
    CLOSE_T: CLOSE_T,
    DAY_SECONDS: DAY_SECONDS,
    TILE: TILE,
    MAX_GUESTS: MAX_GUESTS,
    getN: function () { return N; },
    earn: earn,
    spawnGuest: spawnGuest,
    objCenter: objCenter,
    objFront: objFront,
    isConnected: buildingConnected,
    msg: msg,
    rng: rng
  };

  Z.Sim = {
    newGame: newGame, tick: tick, save: save, load: load,
    terraform: terraform, heightAt: heightAt, tileSlope: tileSlope, isCliff: isCliff, inMap: inMap, cornerElev: cornerElev, mapBounds: mapBounds, maps: function () { return D.maps; }, applyMap: applyMap, previewMap: previewMap, resolveSizeN: resolveSizeN,
    habitatGuide: habitatGuide, plantOk: plantOk,
    paintTerrain: paintTerrain, placePath: placePath, placeFence: placeFence, removeFence: removeFence, placeObject: placeObject, bulldoze: bulldoze,
    undo: undo, canUndo: canUndo, beginStroke: beginStroke, endStroke: endStroke,
    addAnimal: addAnimal, sellAnimal: sellAnimal, moveAnimal: moveAnimal, hireStaff: hireStaff, fireStaff: fireStaff, staffCoverage: staffCoverage,
    callFenceCrew: callFenceCrew, breachEnclosure: breachEnclosure, powerCutActive: powerCutActive, callPowerCrew: callPowerCrew, FENCE_CREW_FEE: FENCE_CREW_FEE, POWER_CREW_FEE: POWER_CREW_FEE,
    spawnAnimal: function (speciesId, i, j, opts) { opts = opts || {}; var t = i + j * N, enc = encOfTile(t); var a = makeAnimal(speciesId, enc, cxOf(t), czOf(t), !!opts.baby, opts.sex); insertAnimal(a); return a; },
    setTicketPrice: setTicketPrice, setPrice: setPrice, attractionDemand: attractionDemand, takeLoan: takeLoan, repayLoan: repayLoan, startMarketing: startMarketing, renameEnclosure: renameEnclosure, setSpeed: setSpeed,
    enclosureAt: enclosureAt, enclosureReport: enclosureReport, animalReport: animalReport, vetNeedsAnimal: vetNeedsAnimal, ratingBreakdown: ratingBreakdown, isUnlocked: isUnlocked, walkable: walkable, canGuestReach: canGuestReach,
    // extras
    _combat: { isPredator: isPredator, isPackHunter: isPackHunter, animalBulk: animalBulk, combatPower: combatPower, packPower: packPower, gatherPack: gatherPack, findPrey: findPrey, findRivalPredator: findRivalPredator, startFight: startFight, resolveFight: resolveFight },
    isLockdown: function () { return !!(RT && RT.lockdown); },
    lockdown: function () { return !!(RT && RT.lockdown); },
    weatherReport: weatherReport, weatherInfo: weatherReport, weatherForecast: weatherForecast, stepWeather: stepWeather, stepEvents: stepEvents,
    activeEvents: function () { return S.activeEvents ? S.activeEvents.slice() : []; },
    triggerEvent: triggerEvent, _fireEvent: triggerEvent,
    diff: diff, _wx: function () { return WX; },
    applyDifficulty: function (id, fresh) { return applyDifficulty(id, fresh); },
    difficultyInfo: function () { return { id: S.difficulty, income: DIFF.income, costs: DIFF.costs, arrivals: DIFF.arrivals, interest: DIFF.interest }; },
    objectReport: objectReport, guestReport: guestReport, footprint: footprintOf, suitabilityFor: suitabilityFor, setOpen: setOpen, isOpenNow: function () { return openNow(); },
    arrivalRate: function () { return RT.rate; }, adultAge: function (id) { return adultAge(SP[id]); }, animalMetrics: function (speciesId, baby) { return animalMetrics(typeof speciesId === 'string' ? SP[speciesId] : speciesId, baby); }, MARKETING_COST: MARKETING_COST, MAX_GUESTS: MAX_GUESTS, DAY_SECONDS: DAY_SECONDS,
    _rt: function () { return RT; }, _step: function (dt) { step(dt); }
  };
  // headless safety: create a game on load if Z.DATA exists so Z.state is never null
  newGame({ seed: 1 });
})();
