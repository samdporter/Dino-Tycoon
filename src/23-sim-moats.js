// ===== 23-sim-moats.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - moats package, sim side (DOM-free, runs under node).  See notes/moats.md.
   State: S.ditch (Uint8Array N*N, 0 none, 1..3 depth), pump / borehole buildings (data flag needsPower, runtime flag o.off = unpowered).
   Everything else is DERIVED (never saved): ditch networks, which tiles are wet, water supply, per-enclosure boundary lines.
   Hooks in 20-sim.js call into Z.Moats (guarded with `Z.Moats &&`): afterWorldChange -> update, buildEncGeom -> encGeom/encView,
   suitFor/secondly -> advice, escapeRoll -> escapeCheck (+ doEscape via), placePath -> bridgeCheck/bridgeCost, bulldoze -> fill, placeObject -> placeCheck.
   Containment model (per species, per boundary segment):
     a boundary "line" is a straight run of ditch tiles seen from an enclosure tile: width w (tiles in the run), depth d (shallowest tile), wet (every tile filled).
     req = reqFor(species, animal) -> { leap (tiles it can jump), climb (depth level it can climb out of), swims, air }
     dry ditch holds it if  w >= leap + 1  and  d >= climb (+1 for swimmers)
     wet moat  holds a non-swimmer if  w >= max(1, leap)  and  d >= max(1, climb - 1)   (one tile less width: deep water)
     swimmers are never held by water; fliers are never held by a ditch.
   Another barrier type plugs in by pushing a function onto M.lineSources (see notes/moats.md). */
(function () {
  'use strict';
  var C = Z.moatCtx; if (!C) return;
  var N = Z.N, NN = N * N, D = Z.DATA, MD = D.moats, bus = Z.bus, rng = Z.rng, clamp = C.clamp, fail = C.fail, okr = C.okr;
  var M = Z.Moats = {};
  if (Z.Sim) Z.Sim.moats = M;
  var DN = ['', 'shallow', 'medium', 'deep'], DNC = ['', 'Shallow', 'Medium', 'Deep'];
  function S() { return C.S(); }
  function SPt() { return C.SP(); }
  function BD() { return C.BD(); }
  function WI() { return D.terrain.findIndex(function (q) { return q.id === 'water'; }); }

  // ============================================================ species requirements
  var reqCache = {};
  function realmOf(sp) { return sp.realm || 'land'; }
  function deriveSwims(sp, depth) {
    var o = MD.species && MD.species[sp.id];
    if (o && o.swims !== undefined) return !!o.swims;
    if (sp.swims !== undefined) return !!sp.swims;
    var r = realmOf(sp);
    if (r === 'sea') return true;
    if (sp.hybrid && sp.parents && (depth || 0) < 3) {
      var P = SPt();
      for (var k = 0; k < sp.parents.length; k++) { var p = P[sp.parents[k]]; if (p && deriveSwims(p, (depth || 0) + 1)) return true; }
    }
    return sp.diet === 'piscivore' && r !== 'air';
  }
  // base requirement of a species (cached by the numbers it is derived from)
  function reqFor(sp) {
    var key = sp.id + '|' + sp.length + '|' + sp.speed + '|' + sp.size + '|' + (sp.realm || '') + '|' + sp.diet + '|' + (sp.ditchWidth || '') + (sp.ditchDepth || '');
    var c = reqCache[key]; if (c) return c;
    var o = (MD.species && MD.species[sp.id]) || {}, L = sp.length || 2, spd = sp.speed || 1, sz = sp.size || 1;
    var agi = clamp(spd / 1.3, 0.6, 1.4);                       // quick animals jump further than their length alone suggests
    var leap = o.ditchWidth !== undefined ? o.ditchWidth : sp.ditchWidth !== undefined ? sp.ditchWidth : clamp(Math.round(L * 0.4 * agi / Z.TILE), 0, 4);
    var climb = o.ditchDepth !== undefined ? o.ditchDepth : sp.ditchDepth !== undefined ? sp.ditchDepth : (sz < 0.45 ? 1 : sz < 1.8 ? 2 : 3);
    var r = { leap: leap, climb: clamp(climb, 1, 3), swims: deriveSwims(sp), air: realmOf(sp) === 'air', realm: realmOf(sp) };
    return (reqCache[key] = r);
  }
  // requirement of one animal (donor genes: swimming, "tests every fence" = one tile more leap)
  function reqOf(sp, a) {
    var b = reqFor(sp);
    if (!a || !a.traits || !a.traits.length) return b;
    var fx = C.fxOf(a), leap = b.leap + (fx.fence > 0 ? 1 : 0), sw = b.swims || !!fx.swim;
    if (leap === b.leap && sw === b.swims) return b;
    return { leap: leap, climb: b.climb, swims: sw, air: b.air, realm: b.realm };
  }
  // what a dry ditch / a wet moat must be to hold this requirement
  function needs(r) {
    var dry = r.air ? null : { w: r.leap + 1, d: r.climb + (r.swims ? 1 : 0) };
    var wet = r.air || r.swims ? null : { w: Math.max(1, r.leap), d: Math.max(1, r.climb - 1) };
    if (dry && dry.d > 3) dry = null;                           // no ditch is deep enough
    return { dry: dry, wet: wet };
  }
  function judge(r, g) {
    if (r.air) return { holds: false, score: 9, why: 'air' };
    var nd = needs(r);
    if (g.wet && r.swims) return { holds: false, score: 8, why: 'swim-wet', wet: true };
    var need = g.wet ? nd.wet : nd.dry;
    if (!need) return { holds: false, score: 7, why: 'impossible', wet: g.wet };
    var dw = Math.max(0, need.w - g.w), dd = Math.max(0, need.d - g.d);
    return { holds: dw === 0 && dd === 0, score: dw + dd, need: need, dw: dw, dd: dd, wet: g.wet, why: dw && dd ? 'both' : dw ? 'narrow' : 'shallow' };
  }
  function explain(sp, r, g, jd) {
    var nm = sp.name;
    if (jd.why === 'air') return nm + ' can fly - a moat or ditch will not hold it';
    if (jd.why === 'swim-wet') return nm + ' swims - a moat will not hold it. Keep this ditch dry (and deeper) or use a fence';
    var noun = g.wet ? 'Moat' : 'Ditch';
    if (jd.why === 'impossible') return nm + ' swims and climbs too well - no ditch is deep enough to hold it. Use a strong fence';
    var tail = ': needs ' + jd.need.w + ' wide and ' + DN[jd.need.d] + '; this one is ' + g.w + ' wide, ' + DN[g.d];
    var what = jd.why === 'both' ? 'too narrow and shallow' : jd.why === 'narrow' ? 'too narrow' : 'too shallow';
    return noun + ' ' + what + ' for ' + nm + tail + (r.swims && !g.wet ? ' (it swims, so a dry ditch needs one level more depth)' : '');
  }

  // ============================================================ derived world state
  var X = null;          // result of the last compute() for the live state
  function inb(i, j) { return i >= 0 && j >= 0 && i < N && j < N; }
  function emptyResult() {
    return { ver: 0, net: new Int16Array(NN), nets: [], wet: new Uint8Array(NN), fill: new Uint8Array(NN), srcs: [], bodies: [], enc: {}, wetN: 0, dryN: 0, saltN: 0 };
  }

  // label fresh-water bodies (8-way, like the world). river = the body contains a generated river point
  function labelBodies(s, sea) {
    var T = s.terrain, W = WI(), lab = new Int16Array(NN).fill(-1), bodies = [], st = [], q, k;
    for (q = 0; q < NN; q++) {
      if (T[q] !== W || sea[q] || lab[q] >= 0) continue;
      var b = { id: bodies.length, n: 0, river: false }; lab[q] = b.id; st.push(q);
      while (st.length) {
        var t = st.pop(), i = t % N, j = (t - i) / N; b.n++;
        for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
          var x = i + di, y = j + dj; if (!inb(x, y)) continue;
          var nq = x + y * N; if (T[nq] === W && !sea[nq] && lab[nq] < 0) { lab[nq] = b.id; st.push(nq); }
        }
      }
      bodies.push(b);
    }
    var rv = s.map && s.map.rivers;
    if (rv) for (k = 0; k < rv.length; k++) for (var p = 0; p < rv[k].length; p++) {
      var pt = rv[k][p], cx = Math.round(pt[0]), cy = Math.round(pt[1]);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (inb(cx + dx, cy + dy)) { var l = lab[(cx + dx) + (cy + dy) * N]; if (l >= 0) bodies[l].river = true; } }
    }
    for (k = 0; k < bodies.length; k++) bodies[k].cap = bodies[k].river ? MD.supply.riverCap : bodies[k].n * MD.supply.lakeCap;
    return { lab: lab, bodies: bodies };
  }

  // Pure: networks, sources and water from a ditch array (so tools can preview "what if").
  function compute(ditch) {
    var s = S(), sea = C.seaMask(), res = emptyResult(), net = res.net, k, t, d, i, j, Wt = WI();
    // 1. networks (4-way)
    var st = [], nid = 0;
    for (t = 0; t < NN; t++) {
      if (!ditch[t] || net[t]) continue;
      var nw = { id: ++nid, tiles: [], units: 0, srcs: [], seeds: [], cap: 0, used: 0, wetN: 0, partN: 0, salt: false, state: 'dry', warnings: [] };
      net[t] = nw.id; st.push(t);
      while (st.length) {
        var c = st.pop(); nw.tiles.push(c); nw.units += ditch[c];
        var ci = c % N, cj = (c - ci) / N;
        if (ci > 0 && ditch[c - 1] && !net[c - 1]) { net[c - 1] = nw.id; st.push(c - 1); }
        if (ci < N - 1 && ditch[c + 1] && !net[c + 1]) { net[c + 1] = nw.id; st.push(c + 1); }
        if (cj > 0 && ditch[c - N] && !net[c - N]) { net[c - N] = nw.id; st.push(c - N); }
        if (cj < N - 1 && ditch[c + N] && !net[c + N]) { net[c + N] = nw.id; st.push(c + N); }
      }
      res.nets.push(nw);
    }
    if (!nid) return res;
    // 2. sources: lakes/rivers touching, pump stations, boreholes
    var bl = labelBodies(s, sea), srcOfBody = {}, objs = s.objects;
    res.bodies = bl.bodies;
    function addSrc(nw, src, seeds) {
      var sr = nw.srcs.indexOf(src);
      if (sr < 0) { nw.srcs.push(src); nw.seeds.push([]); sr = nw.srcs.length - 1; }
      for (var q = 0; q < seeds.length; q++) if (nw.seeds[sr].indexOf(seeds[q]) < 0) nw.seeds[sr].push(seeds[q]);
    }
    for (k = 0; k < res.nets.length; k++) {
      var n2 = res.nets[k];
      for (var q2 = 0; q2 < n2.tiles.length; q2++) {
        t = n2.tiles[q2]; i = t % N; j = (t - i) / N;
        for (d = 0; d < 4; d++) {
          var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0); if (!inb(ni, nj)) continue;
          var nt = ni + nj * N;
          if (s.terrain[nt] === Wt && !sea[nt] && bl.lab[nt] >= 0) {
            var bd = bl.bodies[bl.lab[nt]], key = 'b' + bd.id, src = srcOfBody[key];
            if (!src) { src = srcOfBody[key] = { type: 'body', id: bd.id, name: bd.river ? 'River' : 'Lake', cap: bd.cap, rem: bd.cap, used: 0, salt: false, powered: true, river: bd.river, tiles: bd.n }; res.srcs.push(src); }
            addSrc(n2, src, [t]);
          }
        }
      }
    }
    for (k = 0; k < objs.length; k++) {
      var o = objs[k]; if (o.kind !== 'building') continue;
      var def = BD()[o.type]; if (!def || !def.moat) continue;
      var fp = C.objFootprint(o), seeds = [], netIds = {}, water = 0, salty = false, a, b;
      for (a = -1; a <= fp.w; a++) for (b = -1; b <= fp.h; b++) {
        var inside = a >= 0 && a < fp.w && b >= 0 && b < fp.h, x = fp.i0 + a, y = fp.j0 + b; if (inside || !inb(x, y)) continue;
        var tt = x + y * N, corner = (a < 0 || a >= fp.w) && (b < 0 || b >= fp.h);
        if (s.terrain[tt] === Wt) { if (sea[tt]) salty = true; else water = 1; }
        if (!corner && ditch[tt]) { seeds.push(tt); netIds[net[tt]] = 1; }
      }
      var isPump = def.moat.source === 'pump', powered = !o.off, hasW = isPump ? !!(water || salty) : true;
      var sr2 = { type: def.moat.source, id: o.id, name: def.name, cap: powered && hasW ? def.moat.cap : 0, used: 0, salt: isPump && !water && salty, powered: powered, hasWater: hasW, obj: o.id };
      sr2.rem = sr2.cap; res.srcs.push(sr2);
      var ids = Object.keys(netIds).map(Number);
      sr2.nets = ids;
      for (var m = 0; m < ids.length; m++) {
        var nn = res.nets[ids[m] - 1], mine = seeds.filter(function (z) { return net[z] === nn.id; });
        addSrc(nn, sr2, mine);
      }
    }
    // 3. fill: breadth-first from the source contact tiles; each tile takes its depth in units from the pools
    for (k = 0; k < res.nets.length; k++) {
      var nw2 = res.nets[k], order = [], seen = {}, owner = {}, head = 0, sIdx;
      if (!nw2.srcs.length) { nw2.state = 'dry'; nw2.warnings.push('No water source: a dry ditch (ha-ha)'); continue; }
      for (sIdx = 0; sIdx < nw2.srcs.length; sIdx++) {
        var sd = nw2.seeds[sIdx]; for (q2 = 0; q2 < sd.length; q2++) if (!seen[sd[q2]]) { seen[sd[q2]] = 1; owner[sd[q2]] = sIdx; order.push(sd[q2]); }
      }
      while (head < order.length) {
        var c2 = order[head++], ci2 = c2 % N, cj2 = (c2 - ci2) / N, ow = owner[c2];
        var nbs = [ci2 > 0 ? c2 - 1 : -1, ci2 < N - 1 ? c2 + 1 : -1, cj2 > 0 ? c2 - N : -1, cj2 < N - 1 ? c2 + N : -1];
        for (d = 0; d < 4; d++) { var z = nbs[d]; if (z >= 0 && ditch[z] && !seen[z]) { seen[z] = 1; owner[z] = ow; order.push(z); } }
      }
      var wetN = 0, partN = 0;
      for (q2 = 0; q2 < order.length; q2++) {
        var tile = order[q2], need = ditch[tile], got = 0, pref = owner[tile], pi, pickSalt = nw2.srcs[pref].salt;
        for (pi = 0; pi < nw2.srcs.length && got < need - 1e-6; pi++) {
          var sx = nw2.srcs[(pref + pi) % nw2.srcs.length], take = Math.min(sx.rem, need - got);
          if (take > 0) { sx.rem -= take; sx.used += take; got += take; }
        }
        if (got >= need - 1e-6) { res.wet[tile] = pickSalt ? 2 : 1; res.fill[tile] = 255; wetN++; if (pickSalt) nw2.salt = true; }
        else if (got > 0) { res.fill[tile] = Math.max(1, Math.round(255 * got / need)); partN++; }
        nw2.used += got;
      }
      nw2.wetN = wetN; nw2.partN = partN;
      for (sIdx = 0; sIdx < nw2.srcs.length; sIdx++) nw2.cap += nw2.srcs[sIdx].cap;
      nw2.state = wetN === nw2.tiles.length ? 'wet' : (wetN + partN > 0 ? 'partial' : 'dry');
      if (nw2.state !== 'wet') {
        var off = nw2.srcs.filter(function (z2) { return z2.type !== 'body' && !z2.powered; }).length, nowat = nw2.srcs.filter(function (z3) { return z3.type === 'pump' && !z3.hasWater; }).length;
        if (off) nw2.warnings.push('A pump or borehole is switched off');
        else if (nowat && nw2.cap === 0) nw2.warnings.push('The pump has no water to draw from');
        else nw2.warnings.push('Not enough water: ' + (Math.round(nw2.used * 10) / 10) + ' of ' + nw2.units + ' units needed, the rest stays dry. Add a pump or borehole, or dig a shorter moat');
      }
    }
    for (t = 0; t < NN; t++) if (ditch[t]) { if (res.wet[t]) { res.wetN++; if (res.wet[t] === 2) res.saltN++; } else res.dryN++; }
    return res;
  }

  M.update = function () {
    var s = S(); if (!s || !s.ditch) return;
    var prev = X, res = compute(s.ditch);
    res.ver = prev ? prev.ver + 1 : 1;
    var changed = !prev;
    if (prev) for (var t = 0; t < NN; t++) if (prev.wet[t] !== res.wet[t] || prev.fill[t] !== res.fill[t]) { changed = true; break; }
    X = res; if (changed) bus.emit('moats', { ver: X.ver });
  };
  function ensure() { if (!X) M.update(); return X; }
  M.state = function () { var x = ensure(); return { ditch: S().ditch, wet: x.wet, fill: x.fill, net: x.net, ver: x.ver }; };
  M.wetAt = function (i, j) { return inb(i, j) ? ensure().wet[i + j * N] : 0; };
  M.fillAt = function (i, j) { return inb(i, j) ? ensure().fill[i + j * N] / 255 : 0; };
  M.depthAt = function (i, j) { return inb(i, j) ? S().ditch[i + j * N] : 0; };
  function netPublic(n) {
    return { id: n.id, tiles: n.tiles.length, units: n.units, cap: Math.round(n.cap), used: Math.round(n.used * 10) / 10, wet: n.wetN, partial: n.partN, state: n.state, salt: n.salt, warnings: n.warnings.slice(),
      sources: n.srcs.map(function (z) { return { type: z.type, id: z.id, name: z.name, cap: Math.round(z.cap), used: Math.round(z.used * 10) / 10, salt: z.salt, powered: z.powered, river: !!z.river }; }) };
  }
  M.networks = function () { return ensure().nets.map(netPublic); };
  M.networkAt = function (i, j) { var x = ensure(), id = inb(i, j) ? x.net[i + j * N] : 0; return id ? netPublic(x.nets[id - 1]) : null; };
  M.aesthetic = function () { var x = ensure(); return Math.min(16, (x.wetN - x.saltN) * 0.12 + x.saltN * 0.1 + x.dryN * 0.03); };

  // ============================================================ digging
  function animalTiles() { var set = {}, a = S().animals; for (var k = 0; k < a.length; k++) set[C.tileOf(a[k].x, a[k].z)] = 1; return set; }
  function digCost(depth) { return MD.depths[depth - 1].cost; }
  M.digCost = digCost;
  // dig (or deepen) ditch tiles. tiles: [{i,j}] or [tile indices]. Returns {ok, cost, n, msg}.
  M.dig = function (tiles, depth, opts) {
    var s = S(), dry = !!(opts && opts.dry);
    if (!(depth >= 1 && depth <= 3)) return fail('Pick a depth');
    var Wt = WI(), sea = C.seaMask(), ts = [], old = [], cost = 0, msg = '', skip = 0, at = null, i0 = 999, j0 = 999, i1 = -1, j1 = -1, seen = {};
    for (var k = 0; k < tiles.length; k++) {
      var q = tiles[k], i = typeof q === 'number' ? q % N : q.i, j = typeof q === 'number' ? (q - i) / N : q.j, t = i + j * N;
      if (!inb(i, j) || seen[t]) continue; seen[t] = 1;
      var why = null;
      if (!C.inMap(i, j)) why = 'Outside your land';
      else if (s.terrain[t] === Wt) why = sea[t] ? 'Cannot dig in the sea' : 'That is already water';
      else if (s.path[t]) why = 'A path is in the way';
      else if (s.tileObj[t]) why = 'Something is in the way';
      else if (C.cliffT(t)) why = 'Too steep to dig';
      else if (C.entranceTile(i, j)) why = 'Keep the entrance plaza clear';
      else if (s.ditch[t] >= depth) { skip++; continue; }
      if (!why && s.tileEnc[t]) { at = at || animalTiles(); if (at[t]) why = 'An animal is standing there'; }
      if (why) { if (!msg) msg = why; continue; }
      ts.push(t); old.push(s.ditch[t]); cost += digCost(depth) - (s.ditch[t] ? digCost(s.ditch[t]) : 0);
      if (i < i0) i0 = i; if (j < j0) j0 = j; if (i > i1) i1 = i; if (j > j1) j1 = j;
    }
    if (!ts.length) return fail(msg || (skip ? 'Already dug to that depth' : 'Nothing to dig here'));
    if (s.money < cost) return fail('Not enough money');
    if (dry) return okr(cost, { n: ts.length });
    var nw = ts.map(function () { return depth; });
    for (k = 0; k < ts.length; k++) s.ditch[ts[k]] = depth;
    C.spend(cost, 'construction');
    C.jBegin('Ditch'); C.jOp({ k: 'ditch', ts: ts, old: old, nw: nw, net: cost, box: [i0, j0, i1, j1] }); C.jEnd();
    bus.emit('terrain', { i0: i0, j0: j0, i1: i1, j1: j1 });
    C.world(false);
    if (!s.moatTip) {
      s.moatTip = 1;
      C.msg('Tip: a ditch holds an animal only if it is wide and deep enough for it. Small animals manage with one narrow, shallow ditch; big ones need width, tall ones need depth. Water helps against non-swimmers, but swimmers such as Spinosaurus cross a moat as if it were not there.', 'info');
    }
    return okr(cost, { n: ts.length });
  };
  // fill one ditch tile in (bulldoze hook); 50% refund of the dig cost
  M.fill = function (i, j, opts) {
    var s = S(), dry = !!(opts && opts.dry), t = i + j * N, dp = s.ditch[t];
    if (!dp) return fail('No ditch here');
    if (!C.inMap(i, j)) return fail('Outside your land');
    if (s.path[t]) return fail('Remove the bridge first');
    var refund = Math.floor(digCost(dp) * 0.5);
    if (dry) return okr(-refund);
    s.ditch[t] = 0; C.earn(refund, 'construction');
    C.jBegin('Fill ditch'); C.jOp({ k: 'ditch', ts: [t], old: [dp], nw: [0], net: -refund, box: [i, j, i, j] }); C.jEnd();
    bus.emit('terrain', { i0: i, j0: j, i1: i, j1: j });
    C.world(false);
    return okr(-refund);
  };
  // what-if for the ditch tool: how would the water end up if these tiles were dug to `depth`?
  M.preview = function (tiles, depth) {
    var s = S(), tmp = s.ditch.slice(), ids = [], k;
    for (k = 0; k < tiles.length; k++) { var q = tiles[k], t = typeof q === 'number' ? q : q.i + q.j * N; if (t >= 0 && t < NN) { tmp[t] = Math.max(tmp[t], depth); ids.push(t); } }
    var r = compute(tmp), seen = {}, out = null;
    for (k = 0; k < ids.length; k++) { var id = r.net[ids[k]]; if (id && !seen[id]) { seen[id] = 1; var nn = r.nets[id - 1]; if (!out || nn.tiles.length > out.tiles) out = netPublic(nn); } }
    return out;
  };

  // ============================================================ bridges
  function isSpan(s, sea, Wt, x, y) { if (!inb(x, y)) return false; var t = x + y * N; return s.ditch[t] > 0 || (s.terrain[t] === Wt && !sea[t]); }
  // null when (i,j) is not ditch/fresh water; {msg} when a bridge cannot go here; {ok, len} otherwise
  M.bridgeCheck = function (i, j) {
    var s = S(), t = i + j * N, Wt = WI(), sea = C.seaMask();
    if (!(s.ditch[t] > 0 || s.terrain[t] === Wt)) return null;
    if (s.terrain[t] === Wt && sea[t]) return { msg: 'Bridges cannot cross the open sea' };
    var best = null, tooLong = false, ax;
    for (ax = 0; ax < 2; ax++) {
      var dx = ax === 0 ? 1 : 0, dy = ax === 0 ? 0 : 1, a = 0, b = 0;
      while (isSpan(s, sea, Wt, i - (a + 1) * dx, j - (a + 1) * dy) && a < 12) a++;
      while (isSpan(s, sea, Wt, i + (b + 1) * dx, j + (b + 1) * dy) && b < 12) b++;
      var len = a + b + 1, ex1 = i - (a + 1) * dx, ey1 = j - (a + 1) * dy, ex2 = i + (b + 1) * dx, ey2 = j + (b + 1) * dy;
      var okEnds = inb(ex1, ey1) && inb(ex2, ey2) && s.terrain[ex1 + ey1 * N] !== Wt && s.terrain[ex2 + ey2 * N] !== Wt && C.inMap(ex1, ey1) && C.inMap(ex2, ey2);
      if (len > MD.bridge.maxSpan) { tooLong = true; continue; }
      if (okEnds && (!best || len < best.len)) best = { ok: true, len: len, axis: ax };
    }
    if (best) return best;
    return { msg: tooLong ? 'Too wide to bridge (a bridge spans at most ' + MD.bridge.maxSpan + ' tiles)' : 'A bridge needs solid ground at both ends' };
  };
  M.bridgeCost = function (pid) { return Math.round(D.paths[pid - 1].cost * MD.bridge.mult + MD.bridge.flat); };
  M.isBridge = function (i, j) { var s = S(), t = i + j * N; if (!inb(i, j) || !s.path[t]) return false; return s.ditch[t] > 0 || s.terrain[t] === WI(); };

  // ============================================================ pumps and boreholes
  function ringHasWater(fp) {
    var s = S(), sea = C.seaMask(), Wt = WI(), fresh = false, salt = false;
    for (var a = -1; a <= fp.w; a++) for (var b = -1; b <= fp.h; b++) {
      var inside = a >= 0 && a < fp.w && b >= 0 && b < fp.h, x = fp.i0 + a, y = fp.j0 + b; if (inside || !inb(x, y)) continue;
      if (s.terrain[x + y * N] === Wt) { if (sea[x + y * N]) salt = true; else fresh = true; }
    }
    return { fresh: fresh, salt: salt };
  }
  function touchesDitch(fp) {
    var s = S();
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var x = fp.i0 + a, y = fp.j0 + b;
      for (var d = 0; d < 4; d++) {
        var nx = x + (d === 1 ? 1 : d === 3 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 0 ? -1 : 0);
        if (nx >= fp.i0 && nx < fp.i0 + fp.w && ny >= fp.j0 && ny < fp.j0 + fp.h) continue;
        if (inb(nx, ny) && s.ditch[nx + ny * N]) return true;
      }
    }
    return false;
  }
  M.placeCheck = function (type, fp) {
    var def = BD()[type], s = S(); if (!def || !def.moat) return null;
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) if (s.ditch[(fp.i0 + a) + (fp.j0 + b) * N]) return { msg: 'Fill the ditch in first' };
    if (def.moat.source === 'pump') {
      var w = ringHasWater(fp);
      if (!w.fresh && !w.salt) return { msg: 'A pump station must stand right beside a lake, river or the sea' };
      if (!touchesDitch(fp)) return { warn: 'Not touching a ditch yet' };
      return w.salt && !w.fresh ? { warn: 'Sea water: fine as a barrier, not drinkable' } : null;
    }
    return touchesDitch(fp) ? null : { warn: 'Not touching a ditch yet' };
  };
  // runtime info for the object panel: capacity used / available, power, warnings
  M.objectInfo = function (id) {
    var x = ensure(), s = S(), o = null, k;
    for (k = 0; k < s.objects.length; k++) if (s.objects[k].id === id) { o = s.objects[k]; break; }
    var def = o && BD()[o.type]; if (!def || !def.moat) return null;
    var src = null; for (k = 0; k < x.srcs.length; k++) if (x.srcs[k].obj === id) src = x.srcs[k];
    var issues = [], cap = def.moat.cap, used = src ? Math.round(src.used * 10) / 10 : 0;
    if (o.off) issues.push('Switched off: no power');
    else if (src && def.moat.source === 'pump' && !src.hasWater) issues.push('No lake, river or sea beside it to draw from');
    else if (src && !src.nets.length) issues.push('Not touching a ditch: place it beside one');
    else if (src && src.nets.length && used >= cap - 0.01) issues.push('At full capacity: the moat is longer or deeper than this can fill');
    return { kind: def.moat.source, cap: cap, used: used, powered: !o.off, needsPower: !!def.needsPower, salt: !!(src && src.salt), nets: src ? src.nets.slice() : [], issues: issues };
  };
  // POWER HOOK for the power-grid package: switch a pump / borehole off or on. The network dries / refills at once.
  M.setSourcePowered = function (objId, on) {
    var s = S(), o = null; for (var k = 0; k < s.objects.length; k++) if (s.objects[k].id === objId) { o = s.objects[k]; break; }
    if (!o || !BD()[o.type] || !BD()[o.type].moat) return false;
    var off = !on; if (!!o.off === off) return true;
    if (off) o.off = 1; else delete o.off;
    C.world(false);
    return true;
  };

  // ============================================================ boundary lines per enclosure
  // M.lineSources: other barrier packages (marine tanks, aviary domes, geofences) push fn(enc, X) -> [line] ; a line is {w, d, wet, salt, n, from[], to[]} and is judged with the same rules.
  M.lineSources = [];
  M.encGeom = function (enc, E, fenceN, seeSum) {
    var x = ensure(), s = S(), groups = {}, order = [], shore = {}, shoreList = [], moat = {}, ditchEdges = 0, land = {}, Wt = WI(), tiles = enc.tiles, k, d;
    for (k = 0; k < tiles.length; k++) {
      var t = tiles[k], i = t % N, j = (t - i) / N;
      for (d = 0; d < 4; d++) {
        var dx = d === 1 ? 1 : d === 3 ? -1 : 0, dy = d === 2 ? 1 : d === 0 ? -1 : 0, ni = i + dx, nj = j + dy;
        if (!inb(ni, nj) || !s.ditch[ni + nj * N]) continue;
        if (d === 0 ? s.fenceX[t] : d === 2 ? s.fenceX[t + N] : d === 3 ? s.fenceZ[i + j * (N + 1)] : s.fenceZ[(i + 1) + j * (N + 1)]) continue;   // QA: a fence stands on this very edge (ditch just outside it): the fence is the boundary there, not the ditch
        ditchEdges++;
        var w = 0, dmin = 9, allWet = true, salt = false, cx = ni, cy = nj;
        while (inb(cx, cy) && s.ditch[cx + cy * N]) {
          var ct = cx + cy * N; w++; if (s.ditch[ct] < dmin) dmin = s.ditch[ct];
          if (!x.wet[ct]) allWet = false; else if (x.wet[ct] === 2) salt = true;
          cx += dx; cy += dy;
        }
        var nt = ni + nj * N;
        if (x.wet[nt] === 1) {
          moat[nt] = 1;
          if (!shore[t] && !C.RT().block[t] && s.terrain[t] !== Wt) { shore[t] = 1; shoreList.push(t); }
        }
        if (!inb(cx, cy)) continue;                                  // the ditch runs to the edge of the world: nothing to land on
        var lt = cx + cy * N;
        if (s.terrain[lt] === Wt || s.tileEnc[lt] === enc.id) continue;   // cannot land in water / back in the same enclosure
        land[lt] = 1;
        var key = w + '|' + dmin + '|' + (allWet ? (salt ? 2 : 1) : 0), g = groups[key];
        if (!g) { g = groups[key] = { w: w, d: dmin, wet: allWet, salt: allWet && salt, n: 0, from: [], to: [] }; order.push(g); }
        g.n++; if (g.to.length < 24) { g.from.push(t); g.to.push(lt); }
      }
    }
    var all = order.slice();
    for (k = 0; k < M.lineSources.length; k++) { try { var ex = M.lineSources[k](enc, x); if (ex) for (var q = 0; q < ex.length; q++) all.push(ex[q]); } catch (e) { if (typeof console !== 'undefined') console.error('moat line source', e); } }
    x.enc[enc.id] = { groups: all, ditchEdges: ditchEdges, fenceEdges: fenceN, landings: Object.keys(land).map(Number), moatN: Object.keys(moat).length };
    if (ditchEdges) {
      E.moatN = Object.keys(moat).length;
      for (k = 0; k < shoreList.length; k++) E.drink.push(shoreList[k]);
      if (E.moatN && !E.drink.length) E.drink.push(E.feed);
      enc.see = (seeSum + ditchEdges * 1.25) / (fenceN + ditchEdges);   // an unobstructed view across a ditch: better than glass (1.0)
    } else E.moatN = 0;
  };
  // path tiles that can see over a moat: from the far bank, up to 2 more steps (a fence gives 3 tiles of range as well)
  M.encView = function (enc, vt) {
    var ge = X && X.enc[enc.id]; if (!ge || !ge.landings.length) return;
    var s = S(), rt = C.RT(), seen = new Uint8Array(NN), q = [], dep = [], h = 0, k, d;
    for (k = 0; k < ge.landings.length; k++) { q.push(ge.landings[k]); dep.push(1); seen[ge.landings[k]] = 1; }
    while (h < q.length) {
      var t = q[h], dp = dep[h++];
      if (s.path[t] && s.tileEnc[t] !== enc.id && rt.nb[t] && vt.indexOf(t) < 0) vt.push(t);
      if (dp >= 3) continue;
      var i = t % N, j = (t - i) / N;
      for (d = 0; d < 4; d++) {
        var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0); if (!inb(ni, nj)) continue;
        var nt = ni + nj * N; if (seen[nt] || s.ditch[nt]) continue; seen[nt] = 1; q.push(nt); dep.push(dp + 1);
      }
    }
  };
  M.fenceless = function (enc) { var g = X && X.enc[enc.id]; return !!(g && g.fenceEdges === 0 && g.ditchEdges > 0); };

  // ============================================================ containment queries
  function worstGroup(enc, req) {
    var g = X && X.enc[enc.id]; if (!g) return null;
    var best = null, bj = null;
    for (var k = 0; k < g.groups.length; k++) {
      var jd = judge(req, g.groups[k]);
      if (!jd.holds && (!best || jd.score > bj.score)) { best = g.groups[k]; bj = jd; }
    }
    return best ? { g: best, jd: bj } : null;
  }
  // message for a species in this enclosure (null when every ditch segment holds it)
  M.advice = function (enc, spId) {
    if (!enc || !X) return null;
    var sp = SPt()[spId]; if (!sp) return null;
    var req = reqFor(sp), w = worstGroup(enc, req);
    return w ? explain(sp, req, w.g, w.jd) : null;
  };
  // does every ditch segment hold this animal?
  M.holds = function (enc, a) { if (!X) return true; var sp = SPt()[a.species]; return !worstGroup(enc, reqOf(sp, a)); };
  // for escapeRoll: {t: landing tile, how, p: hourly escape chance} or null
  M.escapeCheck = function (enc, a) {
    if (!X) return null;
    var g0 = X.enc[enc.id]; if (!g0 || !g0.groups.length) return null;
    var sp = SPt()[a.species], req = reqOf(sp, a), w = worstGroup(enc, req); if (!w) return null;
    var g = w.g, jd = w.jd, to = g.to.length ? g.to[Math.floor(rng.next() * g.to.length)] : -1;
    if (to < 0) return null;
    var noun = g.wet ? 'moat' : 'ditch', how, p;
    if (req.air) { how = 'flown over the ' + noun + ' around'; p = 0.5; }
    else if (g.wet && req.swims) { how = 'swum across the moat around'; p = 0.5; }
    else if (g.wet) { how = 'waded through the moat around'; p = 0.2 + 0.08 * Math.min(3, jd.score); }
    else { how = (req.swims ? 'scrambled across the ditch around' : 'leapt the ditch around'); p = 0.2 + 0.08 * Math.min(3, jd.score); }
    return { t: to, how: how, p: p, wet: g.wet };
  };
  M.warnFor = function (enc, spId) { return M.advice(enc, spId); };

  // ============================================================ reports
  M.report = function (enc) {
    var ge = X && X.enc[enc.id]; if (!ge) return null;
    var out = { fenceEdges: ge.fenceEdges, ditchEdges: ge.ditchEdges, boundary: ge.ditchEdges ? (ge.fenceEdges ? 'mixed' : 'ditch') : 'fence', groups: [], species: {}, drinking: ge.moatN > 0, networks: [] };
    ge.groups.forEach(function (g) { out.groups.push({ w: g.w, d: g.d, wet: g.wet, salt: g.salt, n: g.n }); });
    if (ge.ditchEdges) {
      var s = S(), ids = {};
      for (var k = 0; k < enc.tiles.length; k++) {
        var t = enc.tiles[k], i = t % N, j = (t - i) / N;
        for (var d = 0; d < 4; d++) { var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0); if (inb(ni, nj) && s.ditch[ni + nj * N]) ids[X.net[ni + nj * N]] = 1; }
      }
      out.networks = Object.keys(ids).map(function (id) { return netPublic(X.nets[+id - 1]); });
    }
    (enc.species || []).forEach(function (spId) {
      var sp = SPt()[spId]; if (!sp) return;
      var req = reqFor(sp), w = worstGroup(enc, req);
      out.species[spId] = { ok: !w, msg: w ? explain(sp, req, w.g, w.jd) : null };
    });
    return out;
  };
  // ditch tiles next to an enclosure whose residents are not all held (overlay: red)
  M.inadequateTiles = function () {
    var s = S(), out = new Uint8Array(NN); if (!X) return out;
    for (var k = 0; k < s.enclosures.length; k++) {
      var e = s.enclosures[k], bad = false; if (!e.animals.length) continue;
      for (var q = 0; q < e.species.length && !bad; q++) { var sp = SPt()[e.species[q]]; if (sp && worstGroup(e, reqFor(sp))) bad = true; }
      if (!bad) continue;
      for (var m = 0; m < e.tiles.length; m++) {
        var t = e.tiles[m], i = t % N, j = (t - i) / N;
        for (var d = 0; d < 4; d++) { var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0); if (inb(ni, nj) && s.ditch[ni + nj * N]) out[ni + nj * N] = 1; }
      }
    }
    return out;
  };
  M.goalMet = function () {
    var s = S(); if (!X) return false;
    for (var k = 0; k < s.enclosures.length; k++) {
      var e = s.enclosures[k], g = X.enc[e.id]; if (!e.animals.length || !g || g.fenceEdges || !g.ditchEdges) continue;
      var good = true;
      for (var q = 0; q < e.animals.length; q++) { var a = C.RT().aById.get(e.animals[q]); if (!a || a.state === 'escaped' || !M.holds(e, a)) { good = false; break; } }
      if (good) return true;
    }
    return false;
  };

  // ============================================================ tables for the UI / Guide
  M.reqFor = reqFor; M.reqOf = reqOf; M.needs = needs; M.depthName = function (d) { return DNC[d]; };
  // {dry:{w,d}|null, wet:{w,d}|null, swims, air, leap, climb}
  M.requirement = function (spOrId) {
    var sp = typeof spOrId === 'string' ? SPt()[spOrId] : spOrId; if (!sp) return null;
    var r = reqFor(sp), n = needs(r);
    return { dry: n.dry, wet: n.wet, swims: r.swims, air: r.air, leap: r.leap, climb: r.climb };
  };
  M.reqText = function (spOrId) {
    var sp = typeof spOrId === 'string' ? SPt()[spOrId] : spOrId, q = M.requirement(sp); if (!q) return [];
    if (q.air) return ['Flies: a moat or ditch will not hold it'];
    return [q.dry ? 'Dry ditch: ' + q.dry.w + ' wide, ' + DN[q.dry.d] + ' or deeper' : 'Dry ditch: cannot hold it (too deep to climb out of)',
      q.wet ? 'Wet moat: ' + q.wet.w + ' wide, ' + DN[q.wet.d] + ' or deeper' : 'Wet moat: no barrier at all (it swims)'];
  };
  M.table = function () {
    return D.animals.map(function (sp) { var q = M.requirement(sp); return { id: sp.id, name: sp.name, emoji: sp.emoji, hybrid: !!sp.hybrid, realm: realmOf(sp), dry: q.dry, wet: q.wet, swims: q.swims, air: q.air }; });
  };
})();
