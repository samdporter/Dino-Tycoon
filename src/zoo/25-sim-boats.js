// Wild Acres Zoo — Water transport & helipads (Zoo Tycoon only)
// Guest and service piers form boat networks over connected water; staff helipads link any two pads.
// Both extend path-component reachability. VIP helipads fly in wealthy guests who pay an arrival fee.
(function () {
  'use strict';
  var Z = window.Z, C = Z && Z.boatsCtx;
  if (!Z || !C) return;

  var TILE = C.TILE, INF = C.INF, BD = C.BD;
  var BOAT_SPEED = 7, HELI_SPEED = 12;
  var LAND_T = 4, WAIT_T = 3, BOARD_T = 1.5, CLIMB_T = 4, HELI_ALT = 14, PAD_Y = 0.35;
  var VIP_MAX_PER_PAD = 3;

  var piers = [], pads = [], routes = {}, edges = {};
  var trips = [], helis = [], nextVid = 1, scanT = 0;

  function fareOf(o) { return o.price === undefined ? BD[o.type].price : o.price; }
  function oById(id) { return C.getRT().oById.get(id); }
  function centreOf(o) {
    var fp = C.objFootprint(o);
    return { x: (fp.i0 + fp.w / 2) * TILE, z: (fp.j0 + fp.h / 2) * TILE };
  }
  function frontTile(o) {
    var RT = C.getRT(), list = C.frontPathTiles(o, []);
    for (var k = 0; k < list.length; k++) if (RT.comp[list[k]]) return list[k];
    return -1;
  }
  function waterBeside(o) {
    var S = C.getS(), N = C.getN(), fp = C.objFootprint(o), out = [];
    for (var a = 0; a < fp.w; a++) for (var b = 0; b < fp.h; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var ni = i + d[0], nj = j + d[1];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) return;
        var t = ni + nj * N;
        if (S.terrain[t] === C.WATER && out.indexOf(t) < 0) out.push(t);
      });
    }
    return out;
  }

  function placeCheck(type, fp) {
    var def = BD[type];
    if (!def || !(def.boatPier || def.helipad)) return null;
    var S = C.getS(), N = C.getN();
    if (def.helipad) return C.adjacentPathExists(fp) ? null : 'Must touch a path';
    var wet = false;
    for (var a = 0; a < fp.w && !wet; a++) for (var b = 0; b < fp.h && !wet; b++) {
      var i = fp.i0 + a, j = fp.j0 + b;
      wet = (i > 0 && S.terrain[i - 1 + j * N] === C.WATER) || (i < N - 1 && S.terrain[i + 1 + j * N] === C.WATER) ||
        (j > 0 && S.terrain[i + (j - 1) * N] === C.WATER) || (j < N - 1 && S.terrain[i + (j + 1) * N] === C.WATER);
    }
    if (!wet) return 'Must be on the shore, touching water';
    var front = C.frontList(fp).some(function (c) { return S.path[c.i + c.j * N]; });
    return front ? null : 'Needs a path beside it';
  }

  function rebuild() {
    var S = C.getS(), RT = C.getRT(), N = C.getN(), NN = N * N, k, o, def;
    piers = []; pads = []; routes = {}; edges = {};
    for (k = 0; k < S.objects.length; k++) {
      o = S.objects[k]; if (o.kind !== 'building') continue;
      def = BD[o.type]; if (!def || !(def.boatPier || def.helipad)) continue;
      var front = frontTile(o);
      if (front < 0) continue;
      if (def.boatPier) {
        var water = waterBeside(o);
        if (water.length) piers.push({ o: o, guest: def.boatPier === 'guest', front: front, water: water, net: -1 });
      } else pads.push({ o: o, vip: def.helipad === 'vip', front: front });
    }
    RT.scomp = RT.comp; RT.gcomp = null; RT.jump = null;
    if (!piers.length && pads.length < 2) return;

    var lab = new Int16Array(NN).fill(-1), nets = 0, stack, t, i, j;
    for (k = 0; k < piers.length; k++) {
      var w0 = piers[k].water[0];
      if (lab[w0] < 0) {
        lab[w0] = nets; stack = [w0];
        while (stack.length) {
          t = stack.pop(); i = t % N; j = (t - i) / N;
          [i > 0 ? t - 1 : -1, i < N - 1 ? t + 1 : -1, j > 0 ? t - N : -1, j < N - 1 ? t + N : -1].forEach(function (n) {
            if (n >= 0 && lab[n] < 0 && S.terrain[n] === C.WATER) { lab[n] = nets; stack.push(n); }
          });
        }
        nets++;
      }
      piers[k].net = lab[w0];
    }

    var gParent = [], sParent = [];
    for (k = 0; k <= RT.compN; k++) { gParent[k] = k; sParent[k] = k; }
    function find(par, c) { while (par[c] !== c) { par[c] = par[par[c]]; c = par[c]; } return c; }
    function join(par, a, b) { a = find(par, a); b = find(par, b); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } }
    function link(a, b, kind, onlyStaff) {
      var ca = RT.comp[a.front], cb = RT.comp[b.front];
      if (ca === cb) return;
      if (!onlyStaff) join(gParent, ca, cb);
      join(sParent, ca, cb);
      var key = a.front + '>' + b.front;
      edges[key] = { kind: kind, a: a, b: b };
      (RT.jump || (RT.jump = {}))[a.front] = (RT.jump[a.front] || []).concat([b.front]);
    }
    var any = false;
    piers.forEach(function (a) {
      piers.forEach(function (b) {
        if (a === b || a.net !== b.net) return;
        link(a, b, 'boat', !(a.guest && b.guest));
      });
    });
    var staffPads = pads.filter(function (p) { return !p.vip; });
    staffPads.forEach(function (a) { staffPads.forEach(function (b) { if (a !== b) link(a, b, 'heli', true); }); });

    if (!RT.jump) return;
    var gc = new Uint16Array(RT.compN + 1), sc = new Uint16Array(NN);
    for (k = 1; k <= RT.compN; k++) { gc[k] = find(gParent, k); any = any || gc[k] !== k; }
    if (any) RT.gcomp = gc;
    for (t = 0; t < NN; t++) if (RT.comp[t]) sc[t] = find(sParent, RT.comp[t]);
    RT.scomp = sc;
  }

  function route(a, b) {
    var key = a.o.id + '>' + b.o.id;
    if (key in routes) return routes[key];
    var S = C.getS(), N = C.getN(), NN = N * N, prev = new Int32Array(NN).fill(-2), goal = {}, q = [], h = 0, found = -1, k;
    b.water.forEach(function (t) { goal[t] = true; });
    for (k = 0; k < a.water.length; k++) { prev[a.water[k]] = -1; q.push(a.water[k]); }
    while (h < q.length && found < 0) {
      var t = q[h++];
      if (goal[t]) { found = t; break; }
      var i = t % N, j = (t - i) / N;
      [i > 0 ? t - 1 : -1, i < N - 1 ? t + 1 : -1, j > 0 ? t - N : -1, j < N - 1 ? t + N : -1].forEach(function (n) {
        if (n >= 0 && prev[n] === -2 && S.terrain[n] === C.WATER) { prev[n] = t; q.push(n); }
      });
    }
    var r = null;
    if (found >= 0) {
      r = [];
      for (var c = found; c >= 0; c = prev[c]) r.push(c);
      r.reverse();
    }
    routes[key] = r;
    return r;
  }

  function plan(g, key) {
    if (!piers.length) return null;
    var RT = C.getRT(), tiles = C.sourcesFor(key), dest = {};
    if (!tiles) return null;
    tiles.forEach(function (t) { dest[RT.comp[t]] = true; });
    var leaving = g.state === 'leave', best = null;
    piers.forEach(function (a) {
      if (!a.guest) return;
      var fare = leaving ? 0 : fareOf(a.o), f = C.getField('t' + a.front);
      if (!f || !(f[g.ti] < INF)) return;
      if (fare > 0 && (fare > g.money * 0.6 || fare > Math.max(1, BD[a.o.type].price) * g.tol * 1.5)) return;
      piers.forEach(function (b) {
        if (b === a || !b.guest || b.net !== a.net || !dest[RT.comp[b.front]] || RT.comp[b.front] === RT.comp[a.front]) return;
        var r = route(a, b); if (!r) return;
        var dist = f[g.ti] + r.length;
        if (!best || dist < best.dist) best = { a: a.o.id, b: b.o.id, dist: dist };
      });
    });
    return best;
  }

  function start(g, p) {
    var A = oById(p.a), pa = null;
    piers.forEach(function (x) { if (x.o === A) pa = x; });
    g.pend = { state: g.state, gt: g.gt, gid: g.gid, dk: g.dk, spot: g.spot, pk: g.pk, b: p.b };
    g.gt = 'pier'; g.gid = A.id; g.dk = 't' + pa.front; g.ni = -1; g.gAge = 0;
  }

  function leave(g) {
    if (g.pend || g.state !== 'leave') return false;
    var p = plan(g, 'exit');
    if (!p) return false;
    g.gt = 'exit'; g.dk = 'exit';
    start(g, p);
    return true;
  }

  function newTrip(pts, seg, kind) {
    var tr = { id: nextVid++, kind: kind, pts: pts, seg: seg, d: 0, len: seg * (pts.length - 1), x: pts[0].x, z: pts[0].z, heading: 0, y: 0 };
    trips.push(tr);
    return tr;
  }
  function place(tr) {
    var n = tr.pts.length - 1, f = Math.min(tr.d / tr.seg, n), i = Math.min(Math.floor(f), n - 1), u = f - i, a = tr.pts[i], b = tr.pts[i + 1];
    tr.x = a.x + (b.x - a.x) * u; tr.z = a.z + (b.z - a.z) * u;
    if (a.x !== b.x || a.z !== b.z) tr.heading = Math.atan2(b.x - a.x, b.z - a.z);
    if (tr.kind === 'heli') tr.y = C.heightAt(tr.x, tr.z) + 1 + 6 * Math.sin(Math.PI * f / n);
  }
  function waterPoints(r) {
    var N = C.getN(), pts = r.map(function (t) { return { x: C.cxOf(t), z: C.czOf(t) }; });
    if (pts.length < 2) pts.push(pts[0]);
    return pts;
  }

  function board(g) {
    var S = C.getS(), pend = g.pend, A = oById(g.gid), B = pend && oById(pend.b), pa = null, pb = null;
    piers.forEach(function (x) { if (x.o === A) pa = x; if (x.o === B) pb = x; });
    var r = pa && pb && route(pa, pb);
    var fare = pend && pend.state === 'leave' ? 0 : A && fareOf(A);
    if (!r || g.money < fare) {
      g.gt = pend && pend.state === 'leave' ? 'exit' : ''; g.dk = g.gt ? 'exit' : ''; g.pend = null; g.ni = -1;
      return;
    }
    if (fare > 0) {
      g.money -= fare; g.spent += fare;
      C.earn(fare, 'boats', g.x, g.z);
      A.income = (A.income || 0) + fare;
      S.boats.income += fare;
    }
    A.uses = (A.uses || 0) + 1;
    S.boats.trips++;
    var tr = newTrip(waterPoints(r), TILE, 'boat');
    tr.gid = g.id; tr.b = B.id;
    g.state = 'boat'; g.gt = ''; g.dk = ''; g.speed = 0; g.glide = 0; g.ni = -1;
    g.x = tr.x; g.z = tr.z;
  }

  function land(g, tr) {
    var RT = C.getRT(), pend = g.pend || { state: 'walk', gt: '', gid: 0, dk: '', spot: 0, pk: '' }, B = oById(tr.b), ft = B ? frontTile(B) : -1;
    g.pend = null;
    g.state = pend.state; g.gt = pend.gt; g.gid = pend.gid; g.dk = pend.dk; g.spot = pend.spot; g.pk = pend.pk;
    g.ni = -1; g.glide = 0; g.gAge = 0;
    if (ft >= 0) { g.x = C.cxOf(ft); g.z = C.czOf(ft); g.ti = ft; g.pv = RT.pathVer; }
    else { g.pv = -1; g.gt = ''; g.dk = ''; if (g.state !== 'leave') g.state = 'walk'; }
  }

  function staffHop(s, t, dt) {
    var N = C.getN(), from = s.ti, di = Math.abs((t % N) - (from % N)), dj = Math.abs(Math.floor(t / N) - Math.floor(from / N));
    if (di + dj <= 1) { s.hop = null; s.absY = null; return false; }
    var e = edges[from + '>' + t];
    if (!e) { s.ti = t; s.x = C.cxOf(t); s.z = C.czOf(t); s.ri++; s.hop = null; return true; }
    var tr = s.hop;
    if (!tr || tr.from !== from || tr.to !== t) {
      var pts;
      if (e.kind === 'boat') pts = waterPoints(route(e.a, e.b) || [from, t]);
      else {
        var ca = centreOf(e.a.o), cb = centreOf(e.b.o);
        pts = [ca, cb];
      }
      tr = s.hop = newTrip(pts, e.kind === 'boat' ? TILE : Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z)), e.kind === 'boat' ? 'boat' : 'heli');
      tr.from = from; tr.to = t; tr.staff = true; tr.age = 0;
    }
    tr.age = 0; tr.d += (e.kind === 'boat' ? BOAT_SPEED : HELI_SPEED) * dt; place(tr);
    s.x = tr.x; s.z = tr.z; s.heading = tr.heading; s.speed = 0;
    s.state = e.kind === 'boat' ? 'boat' : 'fly';
    s.absY = e.kind === 'heli' ? tr.y : null;
    if (tr.d >= tr.len) {
      s.x = C.cxOf(t); s.z = C.czOf(t); s.ti = t; s.ri++; s.hop = null; s.absY = null; s.state = 'walk';
      trips.splice(trips.indexOf(tr), 1);
    }
    return true;
  }

  function padPos(p) {
    var c = centreOf(p.o);
    return { x: c.x, z: c.z, y: C.heightAt(c.x, c.z) + PAD_Y };
  }
  function addHeli(p, extra) {
    var pos = padPos(p), h = { id: nextVid++, pad: p.o.id, x: pos.x, z: pos.z, baseY: pos.y, y: pos.y + HELI_ALT, heading: 0, t: 0, gid: 0 };
    for (var k in extra) h[k] = extra[k];
    helis.push(h);
    return h;
  }
  function padOf(id) {
    for (var k = 0; k < pads.length; k++) if (pads[k].o.id === id) return pads[k];
    return null;
  }

  function vipLeave(g) {
    var best = null, bd = INF;
    pads.forEach(function (p) {
      if (!p.vip) return;
      var f = C.getField('t' + p.front);
      if (f && f[g.ti] < bd) { bd = f[g.ti]; best = p; }
    });
    if (!best) return;
    g.gt = 'pad'; g.gid = best.o.id; g.dk = 't' + best.front; g.padT = 0;
  }
  function liftOff(g) {
    var p = padOf(g.gid);
    if (!p) { g.gt = 'exit'; g.dk = 'exit'; return; }
    var h = addHeli(p, { phase: 'board', gid: g.id, y: padPos(p).y });
    g.state = 'fly'; g.gt = ''; g.dk = ''; g.speed = 0; g.ni = -1;
    g.x = h.x; g.z = h.z; g.absY = h.y;
  }

  function vipCount() {
    var n = 0, gs = C.getS().guests;
    for (var k = 0; k < gs.length; k++) if (gs[k].vip) n++;
    return n;
  }
  function stepHelis(dt) {
    var S = C.getS(), RT = C.getRT();
    for (var k = helis.length - 1; k >= 0; k--) {
      var h = helis[k], g = h.gid ? RT.gById.get(h.gid) : null;
      h.t += dt;
      if (h.phase === 'land') {
        h.y = h.baseY + HELI_ALT * Math.max(0, 1 - h.t / LAND_T);
        if (h.t >= LAND_T) {
          var p = padOf(h.pad), v = p && C.spawnGuest(RT.nextGroup++, false, { t: p.front, x: h.x, z: h.z, fee: fareOf(p.o) });
          if (v) { p.o.uses = (p.o.uses || 0) + 1; p.o.income = (p.o.income || 0) + fareOf(p.o); S.boats.vips++; S.boats.vipIncome += fareOf(p.o); }
          h.phase = 'wait'; h.t = 0;
        }
      } else if (h.phase === 'wait') {
        if (h.t >= WAIT_T) { h.phase = 'climb'; h.t = 0; }
      } else if (h.phase === 'board') {
        if (!g || g.state !== 'fly') { helis.splice(k, 1); continue; }
        if (h.t >= BOARD_T) { h.phase = 'climb'; h.t = 0; }
      } else if (h.phase === 'climb') {
        h.y = h.baseY + HELI_ALT * Math.min(1, h.t / CLIMB_T);
        if (g && g.state === 'fly') g.absY = h.y;
        if (h.t >= CLIMB_T) {
          if (g && g.state === 'fly') C.removeGuest(g);
          helis.splice(k, 1);
        }
      }
      h.heading += dt * 0.3;
    }
  }

  function step(dt) {
    var S = C.getS(), RT = C.getRT(), k;
    for (k = trips.length - 1; k >= 0; k--) {
      var tr = trips[k];
      if (tr.staff) { tr.age += dt; if (tr.age > 1) trips.splice(k, 1); continue; }
      var g = RT.gById.get(tr.gid);
      if (!g || g.state !== 'boat') { trips.splice(k, 1); continue; }
      tr.d += BOAT_SPEED * dt; place(tr);
      g.x = tr.x; g.z = tr.z; g.heading = tr.heading;
      if (tr.d >= tr.len) { trips.splice(k, 1); land(g, tr); }
    }
    stepHelis(dt);

    scanT += dt;
    if (scanT >= 1) {
      scanT = 0;
      for (k = 0; k < S.guests.length; k++) {
        var vg = S.guests[k];
        if (vg.vip && vg.gt === 'pad' && ++vg.padT > 90) { vg.gt = 'exit'; vg.dk = 'exit'; }
      }
    }

    var open = pads.filter(function (p) { return p.vip && C.isParkConnected(p.front); });
    if (!open.length || !C.openNow()) return;
    S.boats.vipT -= dt;
    if (S.boats.vipT > 0) return;
    S.boats.vipT = C.gxHr() * C.rng.range(2.5, 4.5);
    if (vipCount() + helis.length >= VIP_MAX_PER_PAD * open.length) return;
    var pad = open[Math.floor(C.rng.next() * open.length)];
    addHeli(pad, { phase: 'land' });
  }

  function afterLoad() {
    var S = C.getS();
    trips = []; helis = [];
    S.guests.forEach(function (g) { g.pend = null; g.absY = null; });
    S.staff.forEach(function (s) { s.hop = null; s.absY = null; });
    rebuild();
  }

  function connected(o) {
    return piers.some(function (p) { return p.o === o; }) ||
      pads.some(function (p) { return p.o === o && (!p.vip || C.isParkConnected(p.front)); });
  }

  Z.Boats = {
    rebuild: rebuild, placeCheck: placeCheck, plan: plan, start: start, board: board, leave: leave,
    staffHop: staffHop, vipLeave: vipLeave, liftOff: liftOff, step: step, afterLoad: afterLoad, connected: connected,
    vehicles: function () { return trips.concat(helis); },
    linkedCount: function (o) {
      var n = 0, p = null;
      piers.forEach(function (x) { if (x.o === o) p = x; });
      if (p) piers.forEach(function (x) { if (x !== p && x.net === p.net && (x.guest || !p.guest)) n++; });
      else pads.forEach(function (x) { if (x.o !== o && !x.vip && BD[o.type].helipad === 'staff') n++; });
      return n;
    }
  };
})();
