// ===== 25-sim-power.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - power package, sim side (DOM-free, runs under node).  See notes/power.md.
   MODEL: the whole island is one grid. Supply = mainland cable (landing at the gate quay) + generators; every consumer needs a node (the cable landing or a
   substation / pylon) within its radius. Demand above supply sheds the lowest priority class first (player-set order). Nothing is routed by hand.
   SAVED  S.power  { prio[5 class ids], cover{cls:1|0} (backup generator), cut{cause,scope,since,eta}|null, nodes{objId:{cause,since,eta}}, broken{objId:{since,eta}}, stored (kWh),
                     wind, bkWait, bkOn, over, fuelDue, fuelCut, hist[], stats{}, fired[], warnDay }
   DERIVED (X, rebuilt by update() from objects, fences and state): nodes, node coverage per tile, consumer entries (objects, fence groups, plug-in sources), generators.
   Public: Z.Sim.power (== Z.Power): poweredAt(i,j) objPowered(id) status() report() ...; bus 'power' {on,cause,tiles}; Z.Sim.realms.onPower(ev) if present. */
(function () {
  'use strict';
  var C = Z.powerCtx; if (!C) return;
  var N = Z.N, NN = N * N, D = Z.DATA, PD = D.power, bus = Z.bus, clamp = C.clamp;
  var P = Z.Power = {};
  if (Z.Sim) Z.Sim.power = P;
  function S() { return C.S(); }
  function RT() { return C.RT(); }
  var CLS = PD.classes.map(function (c) { return c.id; });
  var CLSN = {}; PD.classes.forEach(function (c) { CLSN[c.id] = c; });
  var HPS = 24 / C.DAY_SECONDS;   // game hours per sim second
  function now() { var s = S(); return s.day + s.time; }
  function hoursOf(d) { return d * 24; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function plug() { return Z.News; }

  // private random stream (state saved in rs): keeps the shared sim rng sequence identical to a game without this package
  var R = {
    next: function () { var o = ensure(); var t = (o.rs = (o.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    range: function (a, b) { return a + (b - a) * R.next(); }, chance: function (p) { return R.next() < p; }, pick: function (arr) { return arr[Math.floor(R.next() * arr.length)]; }
  };

  // ------------------------------------------------------------------ state
  function newPS() {
    return { v: 1, rs: ((Z.rng.getSeed() ^ 0x2545F491) | 1), prio: CLS.slice(), cover: { containment: 1, life: 1, research: 0, transport: 0, guest: 0 }, cut: null, nodes: {}, broken: {}, stored: 0, wind: 0.45, bkWait: 0, bkOn: false, bkIdle: 0,
      over: 0, fuelDue: 0, fuelCut: false, hist: [], stats: { outages: 0, hoursOut: 0, trips: 0, breakdowns: 0, fuel: 0, tests: 0, cutEscapes: 0, sabotage: 0 }, fired: [], warnDay: 0, cutEsc: 0, backupUsed: false, lastCutDay: 0 };
  }
  function ensure() {
    var s = S(); if (!s) return null;
    var d = newPS(), k;
    if (!s.power || typeof s.power !== 'object') s.power = d;
    else {
      for (k in d) if (s.power[k] === undefined) s.power[k] = d[k];
      for (k in d.stats) if (s.power.stats[k] === undefined) s.power.stats[k] = d.stats[k];
      for (k in d.cover) if (s.power.cover[k] === undefined) s.power.cover[k] = d.cover[k];
      var okp = Array.isArray(s.power.prio) && s.power.prio.length === CLS.length && CLS.every(function (c) { return s.power.prio.indexOf(c) >= 0; });
      if (!okp) s.power.prio = CLS.slice();
    }
    return s.power;
  }

  // ------------------------------------------------------------------ derived
  var X = { nodes: [], nodeOf: new Int8Array(NN).fill(-1), nodeSig: '', entries: [], byKey: {}, fenceGrp: {}, gens: [], batts: 0, cap: 0, prevOn: {}, hAcc: 0, nodeAlive: [], st: null, sources: [],
    sun: 0, windOut: 0, feather: false, backupOut: 0, demand: 0, supply: 0, shedCls: [], mech: 0, lastSig: '', tests: 0, zapT: 0 };
  P.sources = X.sources;   // plug-in consumers: push fn() -> [{key,id,name,cls,kw,i,j}] (virtual enclosures, marine tanks, aviary...)
  P.registerConsumers = function (fn) { if (typeof fn === 'function' && X.sources.indexOf(fn) < 0) X.sources.push(fn); };

  function defOf(o) { return o.kind === 'building' ? C.BD()[o.type] : C.SC()[o.type]; }
  function classFor(o, def) { return PD.classOf[o.type] || def.powerClass || (def.type === 'science' ? 'research' : def.type === 'transport' ? 'transport' : def.type === 'utility' ? 'life' : 'guest'); }
  function centreTile(fp) { return (fp.i0 + (fp.w >> 1)) + (fp.j0 + (fp.h >> 1)) * N; }
  function buildNodes() {
    var s = S(), list = [], k;
    var cb = PD.cable;
    list.push({ id: 0, kind: 'cable', name: cb.name, ci: cb.ci, cj: cb.cj, r: cb.radius, o: null });
    for (k = 0; k < s.objects.length; k++) {
      var o = s.objects[k]; if (o.kind !== 'building') continue;
      var def = C.BD()[o.type]; if (!def || !def.powerNode) continue;
      var fp = C.objFootprint(o);
      list.push({ id: o.id, kind: 'node', name: def.name, ci: fp.i0 + fp.w / 2, cj: fp.j0 + fp.h / 2, r: def.powerNode.radius, o: o });
    }
    X.nodes = list;
  }
  function nodeAliveList() {
    var ps = ensure(), t = now(), out = [];
    for (var k = 0; k < X.nodes.length; k++) { var nd = X.nodes[k], dn = nd.id && ps.nodes[nd.id]; out.push(!(dn && dn.eta > t)); }
    return out;
  }
  function coverMap() {
    var alive = X.nodeAlive = nodeAliveList(), sig = X.nodes.map(function (n, k) { return n.id + ':' + n.ci + ':' + n.cj + ':' + n.r + ':' + (alive[k] ? 1 : 0); }).join('|');
    if (sig === X.nodeSig) return false;
    X.nodeSig = sig;
    var of = X.nodeOf; of.fill(-1);
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var best = -1, bd = 1e9;
      for (var k = 0; k < X.nodes.length; k++) {
        var nd = X.nodes[k], dx = i + 0.5 - nd.ci, dz = j + 0.5 - nd.cj, d2 = dx * dx + dz * dz;
        if (d2 > nd.r * nd.r) continue;
        if (alive[k]) { if (d2 < bd) { bd = d2; best = k; } }
        else if (best < 0) best = -2 - k;       // covered, but only by a dead node
      }
      of[i + j * N] = best < -1 ? -1 : best;
      if (best < -1) X.deadCov[i + j * N] = 1; else X.deadCov[i + j * N] = 0;
    }
    return true;
  }
  X.deadCov = new Uint8Array(NN);
  function nodeIdx(t) { return t >= 0 && t < NN ? X.nodeOf[t] : -1; }

  function buildEntries() {
    var s = S(), list = [], k, bd = C.BD(), by = {};
    for (k = 0; k < s.objects.length; k++) {
      var o = s.objects[k], def = defOf(o); if (!def || !def.needsPower) continue;
      var fp = C.objFootprint(o), t = centreTile(fp), kw = def.powerDraw || PD.draws[o.type] || 2;
      var e = { key: 'o' + o.id, id: o.id, kind: 'obj', type: o.type, name: def.name, emoji: def.emoji, cls: classFor(o, def), kw: kw, node: nodeIdx(t), i: t % N, j: (t - t % N) / N, t: t, on: false, why: '', o: o, def: def };
      list.push(e); by[e.key] = e;
    }
    for (k = 0; k < X.sources.length; k++) {
      var arr = null; try { arr = X.sources[k](); } catch (er) { arr = null; }
      if (!arr) continue;
      for (var q = 0; q < arr.length; q++) {
        var x = arr[q]; if (!x || !x.key) continue;
        var tt = Z.inb(x.i, x.j) ? x.i + x.j * N : -1;
        var e2 = { key: 'x' + x.key, id: x.id || 0, kind: 'ext', type: x.type || 'ext', name: x.name || 'Consumer', emoji: x.emoji || '⚡', cls: CLSN[x.cls] ? x.cls : 'guest', kw: x.kw || 1, node: nodeIdx(tt), i: x.i, j: x.j, t: tt, on: false, why: '', ext: x };
        list.push(e2); by[e2.key] = e2;
      }
    }
    // electric fences: one group per node (a fence line is switched as a whole)
    var grp = {}, fx = s.fenceX, fz = s.fenceZ, i, j, v, fd;
    function addF(v2, ti, tj) {
      fd = D.fences[v2 - 1]; if (!fd || !(fd.needsPower || fd.electric)) return;
      var t2 = ti + tj * N, nd = nodeIdx(t2), g = grp[nd];
      if (!g) g = grp[nd] = { key: 'f' + nd, id: 0, kind: 'fence', type: 'fence', name: 'Electric fences', emoji: '⚡', cls: 'containment', kw: 0, node: nd, i: ti, j: tj, t: t2, n: 0, on: false, why: '' };
      g.kw += fd.powerDraw || 0.15; g.n++;
    }
    for (j = 0; j <= N; j++) for (i = 0; i < N; i++) { v = fx[i + j * N]; if (v) addF(v, i, Math.min(j, N - 1)); }
    for (j = 0; j < N; j++) for (i = 0; i <= N; i++) { v = fz[i + j * (N + 1)]; if (v) addF(v, Math.min(i, N - 1), j); }
    X.fenceGrp = grp;
    for (var gk in grp) { list.push(grp[gk]); by[grp[gk].key] = grp[gk]; }
    // carry the previous on-state so flips are detected
    for (k = 0; k < list.length; k++) { var pv = X.byKey[list[k].key]; if (pv) list[k].on = pv.on; }
    X.entries = list; X.byKey = by;
    // generators and batteries
    var gens = [], nb = 0, cap = 0;
    for (k = 0; k < s.objects.length; k++) {
      var go = s.objects[k]; if (go.kind !== 'building') continue;
      var gd = bd[go.type]; if (!gd) continue;
      if (gd.gen) { var gp = C.objFootprint(go); gens.push({ o: go, id: go.id, kind: gd.gen.kind, kw: gd.gen.kw, noise: gd.gen.noise || 0, name: gd.name, emoji: gd.emoji, def: gd, out: 0, state: 'idle', why: '', i: gp.i0 + gp.w / 2, j: gp.j0 + gp.h / 2, w: gp.w, h: gp.h }); }
      if (gd.battery) { nb++; cap += gd.battery.kwh; }
    }
    X.gens = gens; X.batts = nb; X.cap = cap;
  }

  // ------------------------------------------------------------------ environment
  function sunK() {
    var s = S(), t = s.time, wk = { clear: 1, cloudy: 0.42, rain: 0.22, storm: 0.1, heatwave: 0.93, fog: 0.3 }[s.weather.type];
    if (wk === undefined) wk = 0.6;
    if (t < 0.25 || t > 0.75) return 0;
    return Math.pow(Math.sin(Math.PI * (t - 0.25) / 0.5), 1.1) * wk;
  }
  var WIND_BIAS = { clear: 0.38, cloudy: 0.5, rain: 0.62, storm: 1.12, heatwave: 0.16, fog: 0.1 };
  function windHour() {
    var ps = ensure(), s = S(), b = WIND_BIAS[s.weather.type]; if (b === undefined) b = 0.4;
    ps.wind = clamp(ps.wind + (b - ps.wind) * 0.35 + R.range(-0.1, 0.1), 0.05, 1.25);
  }
  function feathered() { var s = S(); return s.weather.type === 'storm' && s.weather.intensity > 0.86; }
  function mechanics() { var s = S(), n = 0; for (var k = 0; k < s.staff.length; k++) if (s.staff[k].type === 'mechanic' && !(s.staff[k].sickUntil > now())) n++; return Math.min(n, PD.mechanic.max); }

  // ------------------------------------------------------------------ evaluation
  function cutActive() { var ps = ensure(); return !!(ps.cut && ps.cut.eta > now()); }
  function scopeOf() { var ps = ensure(); return cutActive() ? ps.cut.scope : ''; }
  P.outageActive = function () { return cutActive(); };
  P.isOut = P.outageActive;

  function evaluate(fromUpdate, integrate) {
    var s = S(), ps = ensure(), t = now(), k, e, g;
    if (!s || !ps) return;
    if (coverMap()) { /* nodes changed */ }
    // expire outages and repairs
    if (ps.cut && ps.cut.eta <= t) endCut();
    for (var nid in ps.nodes) if (ps.nodes[nid].eta <= t) { delete ps.nodes[nid]; C.msg('The substation has been repaired and power is flowing to its area again.', 'good', false); X.nodeSig = ''; coverMap(); }
    for (var bid in ps.broken) if (ps.broken[bid].eta <= t) { delete ps.broken[bid]; C.msg('A generator has been repaired and is back in service.', 'good', false); }
    var scope = scopeOf(), mainDown = scope === 'main', cableDown = scope === 'cable' || mainDown;
    var fuelOk = !ps.fuelCut;
    // ---- demand (only consumers reached by a live node)
    var demand = 0;
    for (k = 0; k < X.entries.length; k++) { e = X.entries[k]; e.nodeOk = e.node >= 0; if (e.nodeOk) demand += e.kw; }
    // ---- supply
    var cable = cableDown ? 0 : PD.cable.kw, sun = sunK(), wind = ps.wind, feather = feathered(), renew = 0, dieselCap = 0, backupCap = 0;
    X.sun = sun; X.feather = feather;
    for (k = 0; k < X.gens.length; k++) {
      g = X.gens[k]; g.out = 0; g.state = 'idle'; g.why = '';
      var br = ps.broken[g.id];
      if (br && br.eta > t) { g.state = 'broken'; g.why = 'Broken down, repair due in ' + Math.max(1, Math.ceil(hoursOf(br.eta - t))) + ' h'; continue; }
      if (g.kind === 'solar') { g.out = g.kw * sun; g.state = sun > 0.02 ? 'run' : 'idle'; g.why = sun > 0.02 ? '' : 'No sun'; }
      else if (g.kind === 'wind') { if (feather) { g.state = 'feathered'; g.why = 'Blades feathered in the storm'; } else { g.out = g.kw * Math.min(1.15, Math.pow(wind, 1.4)); g.state = g.out > 0.5 ? 'run' : 'idle'; } }
      else if (g.kind === 'geothermal') { g.out = g.kw; g.state = 'run'; }
      else if (g.kind === 'diesel') { if (!fuelOk) { g.state = 'nofuel'; g.why = 'Fuel supplier will not deliver while you are in debt'; } else dieselCap += g.kw; }
      else if (g.kind === 'backup') { if (!fuelOk) { g.state = 'nofuel'; g.why = 'No fuel while in debt'; } else backupCap += g.kw; }
      if (mainDown && g.kind !== 'backup') { g.out = 0; g.state = 'tripped'; g.why = 'Main bus tripped'; }
    }
    if (mainDown) { cable = 0; }
    for (k = 0; k < X.gens.length; k++) if (X.gens[k].kind !== 'diesel' && X.gens[k].kind !== 'backup') renew += X.gens[k].out;
    var free = cable + renew, dieselOut = 0;
    if (!mainDown && demand > free && dieselCap > 0) dieselOut = Math.min(dieselCap, demand - free);
    var mainSupply = free + dieselOut;
    // diesel output spread over the units for display
    var left = dieselOut; for (k = 0; k < X.gens.length; k++) { g = X.gens[k]; if (g.kind === 'diesel' && g.state === 'idle') { var o1 = Math.min(g.kw, left); g.out = o1; left -= o1; g.state = o1 > 0 ? 'run' : 'standby'; } }
    // ---- battery
    var bRate = PD.batteryRate * X.batts, sup = mainSupply, surplus = mainSupply - demand, discharge = 0;
    if (mainDown) { sup = 0; surplus = -demand; }
    if (integrate) {
      if (surplus > 0 && ps.stored < X.cap) { var ch = Math.min(surplus, bRate, (X.cap - ps.stored) / HPS); ps.stored += ch * HPS; }
      else if (surplus < 0 && ps.stored > 0 && !mainDown) { discharge = Math.min(-surplus, bRate, ps.stored / HPS); ps.stored -= discharge * HPS; }
      ps.stored = clamp(ps.stored, 0, X.cap);
    } else if (surplus < 0 && ps.stored > 0 && !mainDown) discharge = Math.min(-surplus, bRate, ps.stored / HPS);
    X.discharge = discharge; X.charging = integrate && surplus > 0 && ps.stored < X.cap;
    sup += discharge;
    // ---- allocation by class priority (strict: once a class cannot be served every lower class is shed)
    var rem = sup + 1e-6, blocked = false, unmet = [], c, ci;
    for (ci = 0; ci < ps.prio.length; ci++) {
      c = ps.prio[ci]; var anyFail = false;
      for (k = 0; k < X.entries.length; k++) {
        e = X.entries[k]; if (e.cls !== c) continue;
        if (!e.nodeOk) { e.on = false; e.why = X.deadCov[e.t] ? 'Its substation is down' : 'Not connected: no substation in range'; continue; }
        if (!blocked && e.kw <= rem) { e.on = true; e.why = ''; e.src = 'main'; rem -= e.kw; }
        else { e.on = false; e.why = 'Shed: not enough power'; unmet.push(e); if (!blocked) anyFail = true; }
      }
      if (anyFail) blocked = true;
    }
    // ---- backup generator: auto-starts after a delay, serves its covered classes in priority order
    var deficit = demand - sup > 0.05;
    if (integrate) {
      if ((deficit || cableDown) && backupCap > 0) { ps.bkWait += HPS; ps.bkIdle = 0; if (ps.bkWait >= PD.backupDelay) ps.bkOn = true; }
      else { ps.bkIdle += HPS; if (ps.bkIdle > 0.5) { ps.bkOn = false; ps.bkWait = 0; } }
    }
    var bkOut = 0;
    if (ps.bkOn && backupCap > 0 && unmet.length) {
      var rb = backupCap;
      for (ci = 0; ci < ps.prio.length; ci++) {
        c = ps.prio[ci]; if (!ps.cover[c]) continue;
        for (k = 0; k < unmet.length; k++) { e = unmet[k]; if (e.cls !== c || e.on) continue; if (e.kw <= rb) { e.on = true; e.why = ''; e.src = 'backup'; rb -= e.kw; bkOut += e.kw; } }
      }
    }
    if (ps.bkOn && backupCap > 0) { ps.backupUsed = ps.backupUsed || bkOut > 0; }
    var lb = bkOut; for (k = 0; k < X.gens.length; k++) { g = X.gens[k]; if (g.kind === 'backup' && g.state === 'idle') { var o2 = Math.min(g.kw, lb); g.out = o2; lb -= o2; g.state = ps.bkOn ? 'run' : 'standby'; if (!ps.bkOn) g.why = 'Standby: starts about ' + Math.round(PD.backupDelay * 60) + ' minutes after a cut'; } }
    X.backupOut = bkOut; X.backupCap = backupCap; X.dieselOut = dieselOut;
    // fuel burn
    if (integrate) { var burn = (dieselOut + bkOut) * HPS * PD.fuelPrice; if (burn > 0) ps.fuelDue += burn; }
    // ---- overload trip: a long heavy shortfall that nothing covers
    var short = demand > 0 ? (demand - sup - bkOut) / demand : 0;
    if (integrate && !fromUpdate) {
      if (short > 0.3 && !cutActive()) { ps.over += HPS; if (ps.over >= PD.shedHours) { ps.over = 0; ps.stats.trips++; startCut('overload', R.range(1, 3), 'main', 'The breakers tripped under the heavy load.'); } }
      else ps.over = Math.max(0, ps.over - HPS * 2);
    }
    // ---- apply flips
    var offTiles = [], onTiles = [], fenceFlip = false, changedObj = false;
    for (k = 0; k < X.entries.length; k++) {
      e = X.entries[k]; var was = X.prevOn[e.key];
      if (was === undefined) { X.prevOn[e.key] = e.on; if (e.kind === 'obj' && e.o) e.o.off = !e.on; if (e.kind === 'obj' && e.def.moat && Z.Sim && Z.Sim.moats && Z.Sim.moats.setSourcePowered) { try { Z.Sim.moats.setSourcePowered(e.id, e.on); } catch (er) { } } continue; }
      if (was === e.on) continue;
      X.prevOn[e.key] = e.on;
      if (e.kind === 'obj' && e.o) { e.o.off = !e.on; changedObj = true; if (e.def.moat && Z.Sim && Z.Sim.moats && Z.Sim.moats.setSourcePowered) { try { Z.Sim.moats.setSourcePowered(e.id, e.on); } catch (er2) { } } }
      if (e.kind === 'fence') fenceFlip = true;
      (e.on ? onTiles : offTiles).push(e.t);
    }
    if (changedObj && Z.Monorail && Z.Monorail.setPowered) { var allOn = true; for (k = 0; k < X.entries.length; k++) if (X.entries[k].kind === 'obj' && X.entries[k].def.mono && !X.entries[k].on) allOn = false; Z.Monorail.setPowered(allOn); }
    // status snapshot
    var shed = [], seen = {};
    for (ci = ps.prio.length - 1; ci >= 0; ci--) { c = ps.prio[ci]; for (k = 0; k < X.entries.length; k++) { e = X.entries[k]; if (e.cls === c && e.nodeOk && !e.on && !seen[c]) { seen[c] = 1; shed.push(c); } } }
    X.shedCls = shed; X.demand = demand; X.supply = sup + bkOut; X.cable = cable; X.renew = renew;
    var out = cutActive() ? { cause: ps.cut.cause, since: ps.cut.since, eta: ps.cut.eta, scope: ps.cut.scope } : null;
    X.st = { supply: r1(sup + bkOut), demand: r1(demand), stored: Math.round(ps.stored), capacity: X.cap, shedding: shed.slice(), outage: out, brownout: shed.length > 0, backup: ps.bkOn && backupCap > 0 ? (bkOut > 0 ? 'running' : 'idle') : (backupCap > 0 ? 'standby' : 'none'), onBattery: discharge > 0.5, cable: cable, renewable: r1(renew), diesel: r1(dieselOut), backupKw: r1(bkOut) };
    if (offTiles.length || onTiles.length) {
      var cause = out ? out.cause : (short > 0 ? 'overload' : 'restored');
      if (shed.length && !out) cause = 'shedding';
      if (offTiles.length) emitPower(false, cause, offTiles);
      if (onTiles.length) emitPower(true, cause, onTiles);
    }
    if (!fromUpdate && (fenceFlip || X.fenceSig !== fenceSig())) { X.fenceSig = fenceSig(); C.refreshEncs(true); }
    else if (fromUpdate) X.fenceSig = fenceSig();
  }
  function fenceSig() { var s = '', gk; for (gk in X.fenceGrp) s += gk + (X.fenceGrp[gk].on ? 1 : 0) + ','; return s; }
  function emitPower(on, cause, tiles) {
    var ev = { on: on, cause: cause, tiles: tiles.slice(0, 60) };
    bus.emit('power', ev);
    var rl = Z.Sim && Z.Sim.realms; if (rl && typeof rl.onPower === 'function') { try { rl.onPower(ev); } catch (er) { if (typeof console !== 'undefined') console.error('realms.onPower', er); } }
  }

  // ------------------------------------------------------------------ outages
  function startCut(cause, hours, scope, text, opts) {
    var ps = ensure(), t = now(); opts = opts || {};
    var mech = mechanics(); hours = Math.max(0.5, hours * (cause === 'sabotage' || cause === 'storm' || cause === 'event' ? 1 - 0.18 * mech : 1 - 0.3 * mech));
    if (cutActive()) { if (ps.cut.eta < t + hours / 24) ps.cut.eta = t + hours / 24; return ps.cut; }
    ps.cut = { cause: cause, scope: scope || 'cable', since: t, eta: t + hours / 24, hours: Math.round(hours * 10) / 10 };
    ps.stats.outages++; ps.cutEsc = 0; ps.backupUsed = false; ps.lastCutDay = S().day;
    var cn = { storm: 'A lightning strike on the mainland cable', overload: 'Overload', sabotage: 'Sabotage', event: 'A fault on the mainland cable', bill: 'The cable company', fuel: 'Fuel shortage' }[cause] || 'A fault';
    C.msg((text || (cn + ' has cut the power.')) + ' Expected back in about ' + Math.max(1, Math.round(hours)) + ' hour' + (Math.round(hours) === 1 ? '' : 's') + '.' + (X.cap || X.backupCap ? ' Batteries and backup power are picking up the load.' : ' Electric fences, pumps and the lab are down!'), 'bad');
    evaluate(false, false);
    if (plug() && !opts.quiet) {
      var sev = clamp((hours >= 6 ? 3 : hours >= 3 ? 2 : 1) + (S().time < 0.27 || S().time > 0.85 ? 1 : 0), 1, 4);
      if (cause === 'sabotage') plug().post({ kind: 'sabotage', severity: Math.max(2, sev), data: { hours: Math.round(hours) } });
      else plug().post({ kind: 'power_cut', severity: sev, data: { hours: Math.max(1, Math.round(hours)), cause: cause } });
    }
    return ps.cut;
  }
  function endCut() {
    var ps = ensure(), c = ps.cut; if (!c) return;
    ps.cut = null;
    var hrs = Math.round(hoursOf(now() - c.since) * 10) / 10;
    ps.stats.hoursOut += hrs;
    ps.hist.unshift({ day: S().day, cause: c.cause, hours: hrs, escapes: ps.cutEsc, backup: !!ps.backupUsed });
    if (ps.hist.length > PD.history) ps.hist.length = PD.history;
    var hn = Math.max(1, Math.round(hrs)); C.msg('Power is back after ' + hn + ' hour' + (hn === 1 ? '' : 's') + '. Fences, pumps and the lab are live again.', 'good');
    if (plug() && ps.backupUsed && ps.cutEsc === 0 && hrs >= 1) plug().post({ kind: 'power_backup', severity: 2, data: { hours: Math.round(hrs) } });
  }
  P.cut = function (cause, hours, scope) { return startCut(cause || 'storm', hours || 4, scope || 'cable'); };   // test hook and plug-in API
  P.eventCut = function (hours) { startCut('event', (hours || 8) * 0.55, 'cable', 'A fault on the mainland cable has cut the power.'); };
  P.restore = function () { var ps = ensure(); if (ps.cut) { ps.cut.eta = now() - 0.0001; evaluate(false, false); } };
  P.breakGenerator = function (objId, hours) { var ps = ensure(); ps.broken[objId] = { since: now(), eta: now() + (hours || 4) / 24 }; evaluate(false, false); };
  P.nodeDown = function (objId, hours, cause) { var ps = ensure(); ps.nodes[objId] = { cause: cause || 'storm', since: now(), eta: now() + (hours || 3) / 24 }; X.nodeSig = ''; evaluate(false, false); };

  // ------------------------------------------------------------------ hourly / daily
  function hourly() {
    var s = S(), ps = ensure(), t = now(), mech = mechanics(), k, g;
    windHour();
    // fuel cut when in debt
    var cutFuel = s.money < 0;
    if (cutFuel !== ps.fuelCut) {
      ps.fuelCut = cutFuel;
      if (cutFuel && X.gens.some(function (q) { return q.kind === 'diesel' || q.kind === 'backup'; })) C.msg('The fuel supplier has stopped deliveries because you are in debt. Diesel and backup generators will not run.', 'bad');
      else if (!cutFuel) C.msg('Fuel deliveries have resumed.', 'good', false);
    }
    // storms: lightning on the cable (and on substations)
    if (s.weather.type === 'storm') {
      var inten = s.weather.intensity || 0.7;
      if (!cutActive() && s.day > 7 && R.chance(0.075 * inten)) startCut('storm', R.range(3, 8), 'cable', 'Lightning has struck the mainland cable and the island is dark.');
      if (R.chance(0.03 * inten)) {
        var subs = X.nodes.filter(function (n) { return n.id && !(ps.nodes[n.id] && ps.nodes[n.id].eta > t); });
        if (subs.length) { var sn = R.pick(subs); ps.nodes[sn.id] = { cause: 'storm', since: t, eta: t + R.range(2, 5) * (1 - 0.2 * mech) / 24 }; X.nodeSig = ''; C.msg('Lightning has struck a ' + sn.name.toLowerCase() + ': everything it feeds is dead until it is repaired.', 'bad'); }
      }
    }
    // generator breakdowns
    for (k = 0; k < X.gens.length; k++) {
      g = X.gens[k]; if (g.state !== 'run' || g.kind === 'solar') continue;
      var p = g.kind === 'wind' ? (s.weather.type === 'storm' ? 0.02 : 0.003) : g.kind === 'geothermal' ? 0.0015 : 0.005;
      p *= Math.pow(PD.mechanic.breakMul, mech);
      if (R.chance(p)) {
        var hrs = R.range(4, 9) * Math.pow(PD.mechanic.repairMul, mech) * (mech ? 1 : 1.25);
        ps.broken[g.id] = { since: t, eta: t + hrs / 24 }; ps.stats.breakdowns++;
        if (!mech && g.kind !== 'wind') { C.spend(PD.mechanic.callOut, 'other'); }
        C.msg('The ' + g.name.toLowerCase() + ' has broken down' + (mech ? '. Your mechanic is on it' : ' and an engineer has been called out (' + C.fmt(PD.mechanic.callOut) + ')') + '. Repair in about ' + Math.max(1, Math.round(hrs)) + ' hours.', 'bad');
      }
    }
    // warnings
    forecastWarning();
  }
  function riskyEnclosures() {   // enclosures whose animals are held by electric fences alone
    var s = S(), rt = RT(), out = 0, k;
    for (k = 0; k < s.enclosures.length; k++) {
      var enc = s.enclosures[k], E = rt.encx[enc.id]; if (!E || !E.elec || !enc.animals.length) continue;
      var worst = 0; for (var q = 0; q < enc.animals.length; q++) { var a = rt.aById.get(enc.animals[q]); if (a) worst = Math.max(worst, C.aMinFence(a)); }
      var cold = Math.min(E.minPlain === undefined ? 99 : E.minPlain, 2);
      if (worst > cold) out++;
    }
    return out;
  }
  function forecastWarning() {
    var s = S(), ps = ensure(), w = s.weather;
    var storm = (w.type === 'storm') || (w.next === 'storm' && w.hoursLeft < 5);
    if (!storm || ps.warnDay === s.day) return;
    var risky = riskyEnclosures(); if (!risky) return;
    if (X.gens.some(function (g) { return g.kind === 'backup'; })) return;
    ps.warnDay = s.day;
    C.msg('Storm ' + (w.type === 'storm' ? 'overhead' : 'forecast') + ' and no backup generator: if the cable is struck, ' + risky + ' electric-fenced enclosure' + (risky > 1 ? 's' : '') + ' will lose their power and the animals will test the dead fences.', 'bad');
  }
  P.newDay = function () {
    var s = S(), ps = ensure(), k;
    if (ps.fuelDue > 1) { var due = Math.round(ps.fuelDue); C.spend(due, 'upkeep'); ps.stats.fuel += due; C.msg('Fuel bill for the generators: ' + C.fmt(due) + '.', 'info', false); }
    ps.fuelDue = 0;
    for (k = ps.fired.length - 1; k >= 0; k--) if (s.day - ps.fired[k] > 10) ps.fired.splice(k, 1);
    // sabotage: a disgruntled ex-employee after sackings, or an activist when the press is hot
    var heat = plug() ? plug().heat() : 0;
    var p = PD.sabotage.perFired * ps.fired.length + PD.sabotage.perHeat * heat * (heat > 55 ? 2 : 0);
    if (!cutActive() && s.day > 6 && R.chance(p)) startCut('sabotage', R.range(5, 10), 'cable', ps.fired.length ? 'A former employee has cut the cable at the landing!' : 'Activists have cut the cable at the landing!');
  };
  bus.on('staffRemoved', function (st) { var s = S(); if (!s || !st) return; var ps = ensure(); if (ps && !P._quiet) { ps.fired.push(s.day); if (ps.fired.length > 12) ps.fired.shift(); } });

  // ------------------------------------------------------------------ fence tests (dead electric fences)
  function deadEdgeOutside(enc) {
    var s = S(), out = [], k, tl = enc.tiles, fx = s.fenceX, fz = s.fenceZ;
    function dead(v) { var fd = v ? D.fences[v - 1] : null; return fd && fd.electric; }
    for (k = 0; k < tl.length; k++) {
      var t = tl[k], i = t % N, j = (t - i) / N;
      if (j > 0 && dead(fx[t]) && s.tileEnc[t - N] !== enc.id) out.push(t - N);
      if (j < N - 1 && dead(fx[t + N]) && s.tileEnc[t + N] !== enc.id) out.push(t + N);
      if (i > 0 && dead(fz[i + j * (N + 1)]) && s.tileEnc[t - 1] !== enc.id) out.push(t - 1);
      if (i < N - 1 && dead(fz[i + 1 + j * (N + 1)]) && s.tileEnc[t + 1] !== enc.id) out.push(t + 1);
    }
    return out;
  }
  P.ownsEscape = function (enc) { var E = RT().encx[enc.id]; return !!(E && E.dead > 0 && enc.minFence === E.minDead); };
  function fenceTests() {
    var s = S(), rt = RT(), k, q, enc, E, a, night = C.isNight();
    for (k = 0; k < s.enclosures.length; k++) {
      enc = s.enclosures[k]; E = rt.encx[enc.id]; if (!E || !E.elec || !enc.animals.length) continue;
      var dead = P.ownsEscape(enc), lit = E.elec > 0 && !E.dead;
      var outs = null;
      for (q = enc.animals.length - 1; q >= 0; q--) {
        a = rt.aById.get(enc.animals[q]); if (!a || a.baby || a.state === 'escaped') continue;
        var need = C.aMinFence(a);
        if (dead && need > enc.minFence) {
          if (!a.pthr) a.pthr = R.range(60, 140);
          var rate = (0.7 + a.hunger / 100 * 0.9 + C.aDanger(a) * 0.22 + (100 - a.happiness) / 220) * (a.state === 'sleep' ? 0.25 : 1) * (night ? 0.8 : 1);
          a.pt = (a.pt || 0) + rate;
          if (a.pt > a.pthr * 0.4 && !a.ptest) { a.ptest = 1; ensure().stats.tests++; bus.emit('fenceTest', { animal: a, x: a.x, z: a.z, live: false, enc: enc.id }); if (!enc._tw || enc._tw !== s.day + ':' + Math.floor(s.time * 4)) { enc._tw = s.day + ':' + Math.floor(s.time * 4); C.msg('The ' + C.lc(C.SP()[a.species].name) + ' in ' + enc.name + ' is pacing the dead fence, testing it.', 'bad', false); } }
          else if (a.ptest && R.chance(0.2)) bus.emit('fenceTest', { animal: a, x: a.x, z: a.z, live: false, enc: enc.id });
          if (a.pt >= a.pthr) {
            outs = outs || deadEdgeOutside(enc);
            var tt = outs.length ? outs[Math.floor(R.next() * outs.length)] : -1;
            var ps = ensure(); ps.stats.cutEscapes++; ps.cutEsc++;
            a.pt = 0; a.pthr = 0; a.ptest = 0;
            C.doEscape(a, enc, { t: tt, how: 'pushed through the dead electric fence of' });
          }
        } else if (a.pt > 0) { a.pt = Math.max(0, a.pt - 3); if (a.pt <= 0) { a.pthr = 0; a.ptest = 0; } }
        else if (lit && need > (E.minPlain === undefined ? 1 : E.minPlain) && R.chance(0.02) && a.hunger > 35) { bus.emit('fenceTest', { animal: a, x: a.x, z: a.z, live: true, enc: enc.id }); a.happiness = Math.max(0, a.happiness - 0.4); }
      }
    }
  }

  // ------------------------------------------------------------------ per second
  P.secondly = function () {
    var s = S(), ps = ensure(); if (!s || !ps) return;
    // entries depend on fences placed since the last world change
    var sig = fenceCountSig(); if (sig !== X.fcSig) { X.fcSig = sig; buildEntries(); }
    evaluate(false, true);
    X.hAcc += HPS; if (X.hAcc >= 1) { X.hAcc -= 1; hourly(); }
    fenceTests();
    // guests dislike the dark
    var dark = cutActive() ? 1 : (X.st && X.st.brownout && X.st.shedding.indexOf('guest') >= 0 ? 0.35 : 0);
    if (dark && C.openNow()) {
      var gs = s.guests, night = C.isNight() || s.time > 0.78, f = dark * (night ? 0.9 : 0.35);
      for (var k = 0; k < gs.length; k++) { var g = gs[k]; g.happiness = Math.max(0, g.happiness - 0.25 * f * 3); g.mood -= 0.05 * f; if (!(g.thoughtT > 0) && !(g.tcool > 0) && R.chance(0.012 * f)) { g.thought = R.pick(D.guestThoughts.blackout); g.thoughtT = 4.5; g.tcool = 7; } }
    }
  };
  function fenceCountSig() {   // changes whenever an electric fence panel is added or removed
    var s = S(), n = 0, i, fx = s.fenceX, fz = s.fenceZ, el = X.elecIds || (X.elecIds = D.fences.map(function (f) { return f.needsPower || f.electric ? 1 : 0; }));
    for (i = 0; i < fx.length; i++) if (fx[i] && el[fx[i] - 1]) n += fx[i] * ((i % 7) + 1);
    for (i = 0; i < fz.length; i++) if (fz[i] && el[fz[i] - 1]) n += fz[i] * ((i % 5) + 2);
    return n;
  }

  // ------------------------------------------------------------------ hooks used by 20-sim.js
  P.update = function () { ensure(); buildNodes(); X.nodeSig = ''; coverMap(); buildEntries(); X.fcSig = fenceCountSig(); evaluate(true, false); };
  P.afterLoad = function (fresh) {
    if (fresh && S()) S().power = newPS();
    ensure(); X.prevOn = {}; X.byKey = {}; X.nodeSig = ''; X.hAcc = 0;
    buildNodes(); coverMap(); buildEntries(); evaluate(true, false);
    X.fenceSig = fenceSig();
  };
  P.fenceStrength = function (fd, i, j) {
    var t = i + j * N, nd = nodeIdx(t), g = X.fenceGrp[nd];
    return g && g.on ? fd.strength : (fd.unpowered || 1);
  };
  P.labDown = function () {
    var any = false, on = false;
    for (var k = 0; k < X.entries.length; k++) { var e = X.entries[k]; if (e.kind === 'obj' && e.type === 'research_lab') { any = true; if (e.on) on = true; } }
    return any && !on;
  };
  P.labWhy = function () { return cutActive() ? 'There is a power cut: the lab is dark until the power is back.' : 'The research lab has no power. ' + (X.st && X.st.brownout ? 'Demand is higher than supply: build a generator or reorder the priorities.' : 'Connect it with a substation.'); };
  P.eggTick = function (eg, dh) {
    var any = false, on = false;
    for (var k = 0; k < X.entries.length; k++) { var e = X.entries[k]; if (e.kind === 'obj' && e.type === 'hatchery') { any = true; if (e.on) on = true; } }
    if (!any || on) { if (eg.cold) eg.cold = Math.max(0, eg.cold - dh); return 0; }
    eg.cold = (eg.cold || 0) + dh;
    if (eg.cold > 8) { eg.ca = (eg.ca || 0) + dh; if (eg.ca >= 1) { eg.ca -= 1; if (R.chance(0.14)) return 2; } }
    return 1;
  };
  P.usable = function (o) {
    var e = X.byKey['o' + o.id]; if (!e) return true;
    var def = e.def, ty = def && def.type;
    if (!(ty === 'food' || ty === 'drink' || ty === 'shop' || ty === 'ride' || o.type === 'education_centre')) return true;
    return e.on;
  };
  P.placeCheck = function (def, fp) {
    if (!def.needsPower || def.powerNode || def.gen || def.battery) return null;
    var t = (fp.i0 + (fp.w >> 1)) + (fp.j0 + (fp.h >> 1)) * N;
    if (nodeIdx(t) >= 0) return null;
    var best = 99; for (var k = 0; k < X.nodes.length; k++) { var n = X.nodes[k], d = Math.sqrt(Math.pow(fp.i0 - n.ci, 2) + Math.pow(fp.j0 - n.cj, 2)) - n.r; if (d < best) best = d; }
    return { warn: 'Outside the power network: it will not work. Build a substation within a few tiles.' };
  };
  P.aesthetic = function () {
    var a = 0; for (var k = 0; k < X.gens.length; k++) { var g = X.gens[k]; if (g.noise) a -= g.noise * (g.state === 'run' ? 1 : 0.35); }
    return a;
  };
  P.gaes = function (A) {
    var s = S();
    for (var k = 0; k < X.gens.length; k++) {
      var g = X.gens[k]; if (!g.noise) continue;
      for (var dj = -4; dj <= 4; dj++) for (var di = -4; di <= 4; di++) {
        var x = Math.round(g.i) + di, y = Math.round(g.j) + dj; if (x < 0 || y < 0 || x >= N || y >= N || !s.path[x + y * N]) continue;
        A[x + y * N] -= g.noise * 0.35 / (1 + Math.abs(di) + Math.abs(dj));
      }
    }
  };
  P.hasBackup = function () { return X.gens.some(function (g) { return g.kind === 'backup'; }) && X.batts > 0; };

  // ------------------------------------------------------------------ public API (contract)
  P.poweredAt = function (i, j) {
    if (!Z.inb(i, j)) return false;
    var t = i + j * N, s = S(), id = s.tileObj[t], e = id ? X.byKey['o' + id] : null;
    if (e) return e.on;
    var nd = nodeIdx(t); if (nd < 0) return false;
    var g = X.fenceGrp[nd]; if (g) return g.on;
    return !!(X.st && X.st.supply > 0);
  };
  P.objPowered = function (id) { var e = X.byKey['o' + id]; if (e) return e.on; var o = RT().oById && RT().oById.get(id); if (!o) return false; var d = defOf(o); return !(d && d.needsPower); };
  P.status = function () { if (!X.st) evaluate(true, false); var st = X.st; return { supply: st.supply, demand: st.demand, stored: st.stored, capacity: st.capacity, shedding: st.shedding.slice(), outage: st.outage ? { cause: st.outage.cause, since: st.outage.since, eta: st.outage.eta } : null,
    brownout: st.brownout, backup: st.backup, onBattery: st.onBattery, cable: st.cable, renewable: st.renewable, diesel: st.diesel, backupKw: st.backupKw }; };
  P.setPriority = function (order) { var ps = ensure(); if (Array.isArray(order) && order.length === CLS.length && CLS.every(function (c) { return order.indexOf(c) >= 0; })) { ps.prio = order.slice(); evaluate(false, false); return true; } return false; };
  P.movePriority = function (cls, dir) { var ps = ensure(), k = ps.prio.indexOf(cls), n = k + dir; if (k < 0 || n < 0 || n >= ps.prio.length) return false; var a = ps.prio.slice(); a.splice(k, 1); a.splice(n, 0, cls); return P.setPriority(a); };
  P.setBackupCover = function (cls, on) { var ps = ensure(); if (CLSN[cls]) { ps.cover[cls] = on ? 1 : 0; evaluate(false, false); return true; } return false; };
  P.windK = function () { return X.feather ? 0 : clamp(ensure().wind, 0, 1.2); };
  P.sunK = function () { return X.sun; };
  P.nodes = function () { var out = []; for (var k = 0; k < X.nodes.length; k++) { var n = X.nodes[k]; out.push({ id: n.id, name: n.name, i: n.ci, j: n.cj, r: n.r, alive: !!X.nodeAlive[k], kind: n.kind }); } return out; };
  P.fenceLive = function (i, j) { var g = X.fenceGrp[nodeIdx(i + j * N)]; return !!(g && g.on); };
  P.lit = function (x, z) {   // world lighting: is the lamp / light at this world position on?
    var i = Math.floor(x / 2), j = Math.floor(z / 2); if (!Z.inb(i, j)) return true;
    var id = S().tileObj[i + j * N], e = id ? X.byKey['o' + id] : null; return e ? e.on : true;
  };
  P.lightFrac = function () { var tot = 0, on = 0; for (var k = 0; k < X.entries.length; k++) { var e = X.entries[k]; if (e.type === 'lamp') { tot++; if (e.on) on++; } } return tot ? on / tot : (cutActive() ? 0 : 1); };
  P.genAt = function (x, z) {   // generator whose footprint covers this world position (models animate from it): {out 0-1, state}
    var best = null, bd = 9, k, g; if (!X.gens) return null;
    for (k = 0; k < X.gens.length; k++) { g = X.gens[k]; var dx = g.i - x / 2, dz = g.j - z / 2, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = g; } }
    return best ? { out: best.kw ? clamp(best.out / best.kw, 0, 1) : 0, state: best.state, kind: best.kind } : null;
  };
  P.entryFor = function (objId) { return X.byKey['o' + objId] || null; };
  P.objectInfo = function (objId) {
    var e = X.byKey['o' + objId];
    if (e) return { kind: 'consumer', powered: e.on, kw: e.kw, cls: e.cls, why: e.why, connected: e.node >= 0 };
    var k, g;
    if (X.gens) for (k = 0; k < X.gens.length; k++) {
      g = X.gens[k];
      if (g.id === objId) return { kind: 'gen', genKind: g.kind, kw: g.kw, out: r1(g.out), state: g.state, why: g.why, noise: g.noise || 0 };
    }
    var o = RT().oById && RT().oById.get(objId), def = o && defOf(o), ps = ensure();
    if (def && def.battery) {
      return { kind: 'battery', kwh: def.battery.kwh, rate: PD.batteryRate, stored: ps ? r1(ps.stored) : 0, totalCap: X.cap, discharging: X.discharge > 0.5, charging: !!X.charging };
    }
    if (def && def.powerNode && X.nodes) {
      for (k = 0; k < X.nodes.length; k++) {
        var nd = X.nodes[k];
        if (nd.id !== objId) continue;
        var dn = ps && ps.nodes[objId], alive = !(dn && dn.eta > now()), etaHours = !alive ? Math.max(1, Math.ceil(hoursOf(dn.eta - now()))) : 0;
        var inRange = 0;
        for (var m = 0; m < X.entries.length; m++) {
          var ce = X.entries[m], dx = ce.i + 0.5 - nd.ci, dz = ce.j + 0.5 - nd.cj;
          if (dx * dx + dz * dz <= nd.r * nd.r) inRange++;
        }
        return { kind: 'node', radius: nd.r, alive: alive, etaHours: etaHours, consumers: inRange };
      }
    }
    return null;
  };
  P.fenceInfo = function (encId) {
    var E = RT().encx[encId]; if (!E || !E.elec) return null;
    var enc = C.encById(encId), s = S(), nodeOk = true, k;
    return { electric: E.elec, dead: E.dead || 0, minLit: E.minLit, minNow: enc ? enc.minFence : 0 };
  };
  // text for the enclosure panel: "Fence unpowered - will not hold Tyrannosaurus"
  P.warnings = function (enc) {
    var E = RT().encx[enc.id], out = [], rt = RT(), seen = {}; if (!E || !E.elec) return out;
    var k, a, SPD = C.SP();
    for (k = 0; k < enc.animals.length; k++) {
      a = rt.aById.get(enc.animals[k]); if (!a || a.baby || seen[a.species]) continue; seen[a.species] = 1;
      var need = C.aMinFence(a);
      if (E.dead && need > enc.minFence && need <= E.minLit) out.push({ bad: true, text: 'Fence unpowered - will not hold ' + SPD[a.species].name });
    }
    if (E.dead && !out.length) out.push({ bad: false, text: 'Electric fence unpowered (' + (cutActive() ? 'power cut' : X.st && X.st.brownout ? 'load shed' : 'not connected') + ')' });
    return out;
  };
  // structured report for the Power screen
  P.report = function () {
    var ps = ensure(), t = now(), s = S(), k, e, g, rep = { status: P.status(), prio: ps.prio.slice(), cover: JSON.parse(JSON.stringify(ps.cover)), classes: PD.classes, sources: [], consumers: {}, nodes: P.nodes(), history: ps.hist.slice(), stats: JSON.parse(JSON.stringify(ps.stats)), mechanics: mechanics(), wind: r1(ps.wind), sun: r1(X.sun), feather: X.feather, fuelDue: Math.round(ps.fuelDue), fuelCut: ps.fuelCut, forecast: '' };
    var cb = PD.cable; rep.sources.push({ id: 0, kind: 'cable', name: cb.name, emoji: '🔌', kw: cb.kw, out: X.cable, state: cutActive() && ps.cut.scope !== '' ? 'cut' : 'run', why: cutActive() ? 'Cut: ' + ps.cut.cause + ', back in ' + Math.max(1, Math.ceil(hoursOf(ps.cut.eta - t))) + ' h' : '', i: 27, j: 54 });
    for (k = 0; k < X.gens.length; k++) { g = X.gens[k]; rep.sources.push({ id: g.id, kind: g.kind, name: g.name, emoji: g.emoji, kw: g.kw, out: r1(g.out), state: g.state, why: g.why, i: Math.round(g.i), j: Math.round(g.j) }); }
    if (X.batts) rep.sources.push({ id: -1, kind: 'battery', name: 'Batteries ×' + X.batts, emoji: '🔋', kw: PD.batteryRate * X.batts, out: r1(X.discharge || 0), state: X.discharge > 0.5 ? 'run' : X.charging ? 'charging' : 'idle', why: Math.round(ps.stored) + ' of ' + X.cap + ' kWh' });
    PD.classes.forEach(function (c) { rep.consumers[c.id] = []; });
    for (k = 0; k < X.entries.length; k++) { e = X.entries[k]; rep.consumers[e.cls].push({ key: e.key, id: e.id, kind: e.kind, name: e.name + (e.kind === 'fence' ? ' (' + e.n + ' panels)' : ''), emoji: e.emoji, kw: r1(e.kw), on: e.on, why: e.why, i: e.i, j: e.j, src: e.src || '' }); }
    var w = s.weather; rep.forecast = w.type === 'storm' ? 'Thunderstorm overhead: lightning can cut the cable.' : (w.next === 'storm' && w.hoursLeft < 6 ? 'Storm forecast within ' + Math.max(1, Math.round(w.hoursLeft)) + ' hours.' : '');
    return rep;
  };
  P.state = function () { return ensure(); };
  P.classes = function () { return PD.classes; };
  P.entries = function () { return X.entries.slice(); };

  // initial derive for the game that 20-sim.js created on load
  if (Z.state) P.afterLoad(true);
})();
