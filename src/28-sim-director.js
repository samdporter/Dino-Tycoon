// ===== 28-sim-director.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - Masterclass director: the verbs a script uses to play the real simulation.
   DOM-free (runs under plain node). Every verb calls the same public Z.Sim actions the UI uses, records what it built (for the highlight)
   and returns the action result; a failed result is logged by the engine (src/70-examples.js), never shown to the player. */
(function () {
  'use strict';
  var Sim = Z.Sim, D = Z.DATA, N = Z.N, T = Z.TILE || 2;
  var Dr = Z.Director = {};

  function S() { return Z.state; }
  function ok(extra) { var r = { ok: true }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function bad(msg) { return { ok: false, msg: msg }; }
  function hash(i, j) { var h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  Dr.hash = hash;
  Dr.tileXZ = function (i, j) { return { x: (i + 0.5) * T, z: (j + 0.5) * T }; };

  // A verb set bound to one run. `run.built` collects the tiles touched by the current step (highlight), `run.fails` the failures.
  Dr.make = function (run) {
    var V = { run: run };
    function note(r, what, tiles) {
      if (tiles && r && r.ok !== false) for (var k = 0; k < tiles.length; k++) run.built.push(tiles[k]);
      if (r && r.ok === false && !run.quiet) run.fail(what, r.msg);
      return r;
    }
    function eachRect(i0, j0, i1, j1, fn) { for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) fn(i, j); }
    V.state = S; V.Sim = Sim;
    V.tile = function (i, j) { return { i: i, j: j }; };

    // ---- terrain and scenery
    V.clear = function (i0, j0, i1, j1) {   // remove scenery (trees, bushes, rocks) from a rectangle so it can be built on
      var n = 0, s = S();
      eachRect(i0, j0, i1, j1, function (i, j) {
        var id = s.tileObj[i + j * N]; if (!id) return;
        var o = Sim._rt().oById.get(id); if (o && o.kind === 'scenery') { var r = Sim.bulldoze(i, j); if (r && r.ok !== false) n++; }
      });
      return ok({ n: n });
    };
    V.paint = function (i0, j0, i1, j1, ids) {   // ids: one terrain id, or an array (picked per tile by a fixed hash so the pattern is repeatable)
      var list = Array.isArray(ids) ? ids : [ids], tiles = [], last = null;
      eachRect(i0, j0, i1, j1, function (i, j) {
        var id = list[Math.floor(hash(i, j) * list.length) % list.length], r = Sim.paintTerrain(i, j, id, 0);
        if (r && r.ok === false && !/same|already/i.test(r.msg || '')) last = r; else tiles.push({ i: i, j: j });
      });
      return note(last || ok(), 'paint ' + list[0], tiles);
    };
    V.pond = function (i0, j0, i1, j1) { return V.paint(i0, j0, i1, j1, 'water'); };
    V.path = function (i0, j0, i1, j1, type) {
      var tiles = [], last = null;
      eachRect(i0, j0, i1, j1, function (i, j) { var r = Sim.placePath(i, j, type || 'paved'); if (r && r.ok === false && !/Already|same/i.test(r.msg || '')) last = r; else tiles.push({ i: i, j: j }); });
      return note(last || ok(), 'path', tiles);
    };
    V.put = function (type, i, j, rot) {
      if (rot === undefined || rot === 'auto') {   // turn the entrance towards a path tile if one is next to the building
        rot = 0; var s0 = S();
        for (var q = 0; q < 4; q++) {
          var f0 = Sim.footprint(type, i, j, q), fl = f0 && f0.front || [], hit = false;
          for (var w = 0; w < fl.length; w++) if (s0.path[fl[w].i + fl[w].j * N]) hit = true;
          if (hit) { rot = q; break; }
        }
      }
      var r = Sim.placeObject(type, i, j, rot || 0), fp = Sim.footprint(type, i, j, rot || 0), tiles = [];
      if (fp) for (var b = 0; b < fp.h; b++) for (var a = 0; a < fp.w; a++) tiles.push({ i: fp.i0 + a, j: fp.j0 + b });
      return note(r, 'place ' + type, tiles.length ? tiles : [{ i: i, j: j }]);
    };
    V.plants = function (type, spots) {
      var last = null, tiles = [];
      spots.forEach(function (p) { var r = Sim.placeObject(type, p[0], p[1], 0); if (r && r.ok === false) last = r; else tiles.push({ i: p[0], j: p[1] }); });
      return note(last || ok(), 'plants ' + type, tiles);
    };
    V.fence = function (i0, j0, i1, j1, fenceId) {   // a rectangular fence round the tiles i0..i1 x j0..j1
      var last = null, tiles = [], f;
      function e(axis, i, j) { var r = Sim.placeFence({ axis: axis, i: i, j: j }, fenceId); if (r && r.ok === false && !/Already|same/i.test(r.msg || '')) last = r; }
      for (f = i0; f <= i1; f++) { e('x', f, j0); e('x', f, j1 + 1); tiles.push({ i: f, j: j0 }, { i: f, j: j1 }); }
      for (f = j0; f <= j1; f++) { e('z', i0, f); e('z', i1 + 1, f); tiles.push({ i: i0, j: f }, { i: i1, j: f }); }
      return note(last || ok(), 'fence ' + fenceId, tiles);
    };
    V.fenceSide = function (axis, a, b, c, fenceId) {   // a straight run: axis 'x' = along i at row c, from a to b; 'z' = along j at column c
      var last = null, tiles = [];
      for (var q = a; q <= b; q++) { var r = Sim.placeFence({ axis: axis, i: axis === 'x' ? q : c, j: axis === 'x' ? c : q }, fenceId); if (r && r.ok === false) last = r; else tiles.push({ i: axis === 'x' ? q : c, j: axis === 'x' ? c : q }); }
      return note(last || ok(), 'fence side', tiles);
    };
    V.dig = function (tiles, depth) {
      var r = Z.Moats ? Z.Moats.dig(tiles, depth) : bad('no moats');
      return note(r, 'dig', tiles.map(function (q) { return typeof q === 'number' ? { i: q % N, j: Math.floor(q / N) } : q; }));
    };
    V.ring = function (i0, j0, i1, j1, w, depth) {   // a ditch ring w tiles wide just outside the rectangle i0..i1 x j0..j1 (the ditch is the boundary)
      var tiles = [];
      eachRect(i0 - w, j0 - w, i1 + w, j1 + w, function (i, j) { if (i < i0 || i > i1 || j < j0 || j > j1) tiles.push({ i: i, j: j }); });
      return V.dig(tiles, depth);
    };

    V.fillRing = function (i0, j0, i1, j1, w) {   // fill the ditch ring dug by V.ring back in
      var s = S(), tiles = [], last = null;
      eachRect(i0 - w, j0 - w, i1 + w, j1 + w, function (i, j) { if ((i < i0 || i > i1 || j < j0 || j > j1) && s.ditch[i + j * N]) tiles.push({ i: i, j: j }); });
      tiles.forEach(function (q) { var r = Z.Moats ? Z.Moats.fill(q.i, q.j) : null; if (r && r.ok === false) last = r; });
      return note(last || ok(), 'fill moat', tiles);
    };

    // ---- animals, staff, research
    V.hatch = function (sp, i, j) { var r = Sim.addAnimal(sp, i, j); return note(r, 'hatch ' + sp, [{ i: i, j: j }]); };
    V.spawn = function (sp, i, j, n, opts) { var out = []; for (var k = 0; k < (n || 1); k++) out.push(Sim.spawnAnimal(sp, i + (k % 3), j + ((k / 3) | 0) * 2, opts)); return ok({ animals: out }); };
    V.hire = function (type, i, j) { return note(Sim.hireStaff(type, i, j), 'hire ' + type, [{ i: i, j: j }]); };
    V.hireScientist = function (minSkill) {
      var R = S().research, best = null;
      R.candidates.forEach(function (c) { if (c.hireCost <= S().money - 3000 && (!best || c.skill > best.skill)) best = c; });
      return best ? note(Sim.research.hireScientist(best.id), 'hire scientist') : bad('No candidate is affordable');
    };
    V.buyAmber = function (pref) {   // pref: site id to prefer, else the cheapest lot
      var R = S().research, lots = R.market.slice().sort(function (a, b) { return a.price - b.price; }), lot = null;
      if (pref) lot = lots.filter(function (l) { return l.site === pref; })[0];
      lot = lot || lots[0]; if (!lot) return bad('No amber on the market');
      return note(Sim.research.buyLot(lot.id), 'buy amber');
    };
    V.extract = function (species) {   // starts an extraction with the best free sample; `species` steers which animal's DNA is found
      var R = S().research, sm = R.samples.slice().sort(function (a, b) { return b.grade - a.grade; })[0];
      if (!sm) return bad('No amber sample to extract');
      if (species) Sim.forceNext('species', species);
      Sim.forceNext('extract', 'success');
      return note(Sim.research.startExtraction(sm.id), 'extract');
    };
    V.extractIfFree = function (species) { var rs = Sim.research.summary(); return rs.freeScientists > 0 && S().research.samples.length ? V.extract(species) : ok({ idle: true }); };
    V.assist = function () {   // the sequencing puzzle result (as if the player had solved it): a boost to the first unfinished batch
      var b = Sim.research.sequencing().batches.filter(function (x) { return !x.done || x.done < 1; })[0]; if (!b) return bad('Nothing to sequence');
      return note(Sim.research.assistSequencing(b.id, { won: true, score: 0.9, stars: 3 }), 'puzzle boost');
    };
    V.focus = function (sp) { return note(Sim.research.setFocus(sp), 'focus'); };
    V.genome = function (sp) { return S().research.genomes[sp] || 0; };
    V.setGenome = function (sp, v) { S().research.genomes[sp] = Math.max(S().research.genomes[sp] || 0, v); return ok(); };   // scenario set-up only
    V.eggs = function () { return S().research.eggs.length; };
    V.count = function (sp, encId) { return S().animals.filter(function (a) { return (!sp || a.species === sp) && (!encId || a.enc === encId); }).length; };
    V.encAt = function (i, j) { return Sim.enclosureAt(i, j); };
    V.animalIn = function (sp, i, j) { var e = Sim.enclosureAt(i, j); return e ? S().animals.filter(function (a) { return a.enc === e.id && (!sp || a.species === sp); })[0] || null : null; };
    V.openLab = function () { return ok(); };

    // ---- monorail, genes, hybrids, realms (each guarded: a missing package is a logged failure, so scripts check `Z.Sim.realms` in a chapter `when`)
    V.station = function (i, j) { return V.put('monorail_station', i, j, 0); };
    V.track = function (i0, j0, i1, j1) {   // a straight line of rail from tile (i0,j0) to (i1,j1)
      if (!Z.Monorail) return bad('no monorail');
      var route = [], i = i0, j = j0, di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
      for (;;) { route.push(i + j * N); if (i === i1 && j === j1) break; if (i !== i1) i += di; else j += dj; }
      var r = Z.Monorail.buildTrack(route); return note(r, 'track', route.map(function (t) { return { i: t % N, j: Math.floor(t / N) }; }));
    };
    V.train = function (i, j, cars) {
      var o = S().objects.filter(function (q) { return q.type === 'monorail_station' && q.i === i && q.j === j; })[0];
      return o && Z.Monorail ? note(Z.Monorail.buyTrain(o.id, cars || 3), 'train') : bad('no station at that tile');
    };
    V.trains = function () { return Z.state.mono ? Z.state.mono.trains : []; };
    V.riders = function () { return Z.state.mono ? Z.state.mono.stats.riders : 0; };
    V.donor = function (id) {   // buy a donor-gene lot from the gene bank (by donor id; otherwise the cheapest)
      var st = Sim.research.donorStock ? Sim.research.donorStock() : [], lot = st.filter(function (l) { return l.donor === id; })[0] || st[0];
      return lot ? note(Sim.research.buyDonor(lot.id), 'buy donor') : bad('Gene bank is empty');
    };
    V.donorDoses = function (id) { var d = S().research.donorDoses || {}; return d[id] || 0; };
    V.scientistId = function () { var sc = S().staff.filter(function (x) { return x.type === 'scientist'; }); return sc.length ? sc[0].id : 0; };
    V.splice = function (sp, trait, guide) { Sim.forceNext('splice', 'success'); return note(Sim.research.startSplice(sp, trait, V.scientistId(), { guide: guide || 0.8 }), 'splice'); };
    V.hybrid = function (a, b, guide) { Sim.forceNext('hybrid', 'success'); return note(Sim.research.startHybrid(a, b, V.scientistId(), { guide: guide || 0.8 }), 'hybrid'); };
    V.hybridId = function () { var h = S().research.hybrids; return h && h.length ? h[h.length - 1].id : null; };
    V.hasTrait = function (sp, trait) { var t = S().research.traits[sp]; return !!t && t.indexOf(trait) >= 0; };
    V.realms = function () { return !!(Sim.realms && Sim.realms.place && Sim.realms.placeWalk); };
    function boxT(i0, j0, i1, j1) { var o = []; eachRect(i0, j0, i1, j1, function (i, j) { o.push(i + j * N); }); return o; }
    V.realm = function (kind, realm, i0, j0, i1, j1, params) {   // tank | dome | virtual
      if (!V.realms()) return bad('no realms');
      var r = Sim.realms.place(kind, realm, boxT(i0, j0, i1, j1), params || {}); return note(r, 'realm ' + kind, boxT(i0, j0, i1, j1).map(function (t) { return { i: t % N, j: Math.floor(t / N) }; }));
    };
    V.walk = function (i0, j0, i1, j1, type) { if (!V.realms()) return bad('no realms'); var r = Sim.realms.placeWalk(boxT(i0, j0, i1, j1), type || 'tunnel'); return note(r, 'walkway', boxT(i0, j0, i1, j1).map(function (t) { return { i: t % N, j: Math.floor(t / N) }; })); };
    V.tower = function (i, j, upgrade) {
      var r = Sim.placeObject('tagging_tower', i, j, 0); note(r, 'tagging tower', [{ i: i, j: j }, { i: i + 1, j: j + 1 }]);
      if (r && r.ok && upgrade && Sim.realms) note(Sim.realms.upgradeTower(r.id), 'upgrade tower'); return r;
    };
    V.zoneOk = function (i, j) { var e = Sim.enclosureAt(i, j); return !!(e && Sim.realms && Sim.realms.containmentStatus(e.id).ok); };

    // ---- safari (guarded: Z.Safari may be absent). Depots are found by the tile of their top-left corner.
    function depotAt(i, j) { return S().objects.filter(function (q) { return /^safari_(depot|harbour|balloon)$/.test(q.type) && q.i === i && q.j === j; })[0] || null; }
    V.safariRoute = function (i, j, pts) {   // pts: corner tiles [[i,j],...] joined by straight lines
      var d = depotAt(i, j); if (!Z.Safari || !d) return bad('no safari depot at that tile');
      var route = [], ci = pts[0][0], cj = pts[0][1]; route.push(ci + cj * N);
      for (var k = 1; k < pts.length; k++) { var di = Math.sign(pts[k][0] - ci), dj = Math.sign(pts[k][1] - cj); while (ci !== pts[k][0] || cj !== pts[k][1]) { if (ci !== pts[k][0]) ci += di; else cj += dj; route.push(ci + cj * N); } }
      return note(Z.Safari.buildRoute(d.id, route), 'safari route', route.map(function (t) { return { i: t % N, j: Math.floor(t / N) }; }));
    };
    V.safariBuy = function (i, j) { var d = depotAt(i, j); return d && Z.Safari ? note(Z.Safari.buyVehicle(d.id), 'safari vehicle') : bad('no safari depot at that tile'); };
    V.safariFare = function (i, j, f) { var d = depotAt(i, j); return d && Z.Safari ? note(Z.Safari.setFare(d.id, f), 'safari fare') : bad('no safari depot at that tile'); };
    V.safariLockdown = function (on) { return Z.Safari ? note(Z.Safari.setLockdown(!!on), 'lockdown') : bad('no safari'); };
    V.safariRiders = function () { return Z.Safari ? (Z.Safari.stats().riders || 0) : 0; };

    // ---- money
    V.ticket = function (n) { return note(Sim.setTicketPrice(n), 'ticket price'); };
    V.price = function (type, n) {
      var last = null, any = false;
      S().objects.forEach(function (o) { if (o.kind === 'building' && o.type === type) { any = true; var r = Sim.setPrice(o.id, n); if (r && r.ok === false) last = r; } });
      return note(last || (any ? ok() : bad('No ' + type + ' to price')), 'price ' + type);
    };
    V.priceType = function (kind, n) {   // every building of a kind (food, drink, shop)
      var any = false; S().objects.forEach(function (o) { if (o.kind === 'building' && D.buildings.filter(function (b) { return b.id === o.type && b.type === kind; })[0]) { any = true; Sim.setPrice(o.id, n); } });
      return any ? ok() : bad('Nothing of kind ' + kind);
    };
    V.loan = function (n) { return note(Sim.takeLoan(n), 'loan'); };
    V.repay = function (n) { return note(Sim.repayLoan(n), 'repay'); };
    V.marketing = function () { return note(Sim.startMarketing(), 'marketing'); };
    V.cash = function (n) { S().money = n; return ok(); };   // scenario set-up only

    // ---- world events (test hooks of the sim, used only to make a scripted day play out the same way every time)
    V.weather = function (type, intensity, hours) { Sim._setWeather(type, intensity === undefined ? 1 : intensity, hours || 6); return ok(); };
    V.powerCut = function (hours) { return Z.Power ? note(Z.Power.cut('storm', hours || 6), 'power cut') : bad('no power'); };
    V.powerBack = function () { if (Z.Power) Z.Power.restore(); return ok(); };
    V.respond = function (how) { var f = Z.News && Z.News.feed(); var st = f && f.filter(function (s) { return s.open; })[0]; return st ? note(Z.News.respond(st.id, how), 'respond') : ok({ none: true }); };
    V.midgame = function (o) { o = o || {}; var s = S(); s.unlocked.star = Math.max(s.unlocked.star, o.star || 5); if (o.money !== undefined) s.money = o.money; s.rating = Math.max(s.rating, o.rating || 3); return ok(); };

    // ---- measurements for `until` conditions and results cards
    V.day = function () { return S().day; };
    V.hours = function () { return (S().day - 1) * 24 + S().time * 24; };
    V.money = function () { return S().money; };
    V.rating = function () { return S().rating; };
    V.escapes = function () { return S().stats.escapes; };
    V.looseCount = function () { return S().animals.filter(function (a) { return a.state === 'escaped'; }).length; };
    V.snap = function () {
      var s = S(), f = s.finance && s.finance.history && s.finance.history.length ? s.finance.history[s.finance.history.length - 1] : null;
      return { day: s.day, money: Math.round(s.money), loan: s.loan, net: Math.round(s.money - s.loan), rating: Math.round(s.rating * 100) / 100, guests: s.guests.length, guestsTotal: s.stats.guestsTotal, animals: s.animals.length,
        escapes: s.stats.escapes, deaths: s.stats.deaths, injuries: s.stats.injuries || 0, predations: s.stats.predations || 0, babies: s.stats.babiesBorn || 0, hatched: s.research.stats.hatched, sequenced: s.research.stats.seqDone || 0, last: f };
    };
    V.headlines = function (n) {
      var f = Z.News ? Z.News.feed() : [], out = [];
      for (var k = 0; k < f.length && out.length < (n || 3); k++) out.push({ head: f[k].headline, mood: f[k].mood, day: f[k].day, outlet: f[k].outlet });
      return out;
    };
    return V;
  };
})();
