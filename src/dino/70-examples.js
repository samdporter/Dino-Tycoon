// ===== 70-examples.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - Masterclass engine: a scripted director that plays a real park with the real simulation while captions explain what it does and why.
   DOM-free (runs under plain node, see tools/examples-test.js). The camera, captions and controls live in 73-examples-ui.js and plug in as `Ex.stage`.
   Games are data: see src/71-examples-*.js and notes/examples.md.  Time model: a step lasts `hold` presentation seconds (the sim runs at 1x for those)
   or, with `until`, runs the sim `rate` times faster (a time-lapse) until the condition holds or `timeout` presentation seconds have passed. */
(function () {
  'use strict';
  var Sim = Z.Sim, Dr = Z.Director, Ex = Z.Examples = { games: [], _ref: {} };
  var QUANT = 0.05;            // game seconds per sim step
  var LAPSE = 24;              // default time-lapse factor for steps that wait on a condition
  var SELF = Ex;

  // ------------------------------------------------------------------ stage (presentation hooks; the UI replaces these)
  function noop() { }
  Ex.stage = { step: noop, chapter: noop, results: function () { return false; }, end: noop, begin: noop, tick: noop, status: noop };

  // ------------------------------------------------------------------ registry
  Ex.register = function (g) { var k = Ex.games.map(function (x) { return x.id; }).indexOf(g.id); if (k >= 0) Ex.games[k] = g; else Ex.games.push(g); return g; };
  Ex.get = function (id) { return Ex.games.filter(function (g) { return g.id === id; })[0] || null; };
  Ex.active = function () { return !!Ex.run && Ex.run.live; };

  function words(s) { return String(s || '').split(/\s+/).filter(Boolean).length; }
  function sayOf(st) { var s = st.say; if (!s) return null; if (Array.isArray(s)) return { t: s[0], x: s[1], why: s[2] || '' }; return s; }
  function holdOf(st) {
    if (typeof st.hold === 'number') return st.hold;
    var s = sayOf(st); if (!s) return 1.5;
    return Math.max(4.5, Math.min(11, (words(s.x) + words(s.why)) / 3.3 + 1.5));
  }
  function estOf(st) { return st.until ? Math.max(holdOf(st), st.est || 10) : holdOf(st); }
  Ex.estimate = function (g) { var t = 0; g.chapters.filter(function (c) { return !c.when || c.when(); }).forEach(function (c) { c.steps.forEach(function (st) { t += estOf(st); }); }); return t; };

  // ------------------------------------------------------------------ run creation
  function makeRun(g, o) {
    var run = { game: g, chapters: g.chapters.filter(function (c) { return !c.when || c.when(); }), ci: 0, si: -1, cur: null, built: [], fails: [], timeouts: [], series: [], daily: {}, results: {}, t: 0, paused: false, speed: 1, skip: false, state: 'play', live: true,
      rate: 1, opts: o || {}, quiet: !!(o && o.quiet), untilDay: o && o.untilDay || 0, pacc: 0, lastHour: -1, lastDay: 0, log: [], watchedAt: null, freeCam: false, headless: !!(o && o.headless), tickAcc: 0, stepCount: 0 };
    run.fail = function (what, msg) { var ch = run.chapters[run.ci], f = { game: g.id, chapter: ch && ch.id, step: run.si, what: what, msg: msg || '' }; run.fails.push(f); try { console.warn('[masterclass]', g.id, f.chapter, 'step ' + f.step, what, f.msg); } catch (e) { } };
    run.V = Dr.make(run);
    var wts = [], tot = 0; run.chapters.forEach(function (c) { var a = 0; c.steps.forEach(function (st) { a += estOf(st); }); wts.push(a); tot += a; });
    run.wts = wts; run.total = tot;
    return run;
  }

  // Start a game: builds the park from the game's start block and begins the first chapter.
  Ex.start = function (id, o) {
    o = o || {}; var g = Ex.get(id); if (!g) return null;
    if (g.compare && !o.noRef) Ex.reference(g.compare.game, g.compare.day);
    var st = g.start || {};
    Sim.newGame({ seed: st.seed || 101, map: st.map || 'fern_meadow', difficulty: st.difficulty || 'normal', money: st.money });
    Z.state.speed = 0;
    var run = Ex.run = makeRun(g, o);
    run.live = true;
    try { if (g.setup) g.setup(run.V, run); } catch (e) { run.fail('setup', e && e.message || String(e)); }
    run.built = [];
    run.lastDay = Z.state.day; run.lastHour = Math.floor(run.V.hours());
    Ex.stage.begin(run, !!o.headless);
    nextStep(run);
    return run;
  };

  // ------------------------------------------------------------------ steps
  function acts(run, st) {
    var a = st.act; if (!a) return;
    if (typeof a === 'function') a = [a]; else if (typeof a[0] === 'string') a = [a];
    a.forEach(function (c) {
      try {
        var r;
        if (typeof c === 'function') r = c(run.V, run); else { var fn = run.V[c[0]]; if (!fn) { run.fail('verb ' + c[0], 'unknown verb'); return; } r = fn.apply(run.V, c.slice(1)); }
        if (r && r.ok === false && !c.quiet) { /* verbs log their own failures; a custom function returning a failure is logged here */ if (typeof c === 'function') run.fail('act', r.msg); }
      } catch (e) { run.fail('act ' + (typeof c === 'function' ? 'fn' : c[0]), e && e.message || String(e)); }
    });
  }

  function resolveCam(run, st) {
    var c = st.cam; if (!c) return null; if (typeof c === 'function') { try { c = c(run.V); } catch (e) { return null; } } if (!c) return null;
    var T = Z.TILE || 2, out = { yaw: c.yaw, pitch: c.pitch, dist: c.d, follow: null, fit: null, keep: false };
    if (c === 'keep') { out.keep = true; return out; }
    if (c.rect) { var r = c.rect, pd = c.pad === undefined ? 2 : c.pad; out.x = (r[0] + r[2] + 1) * T / 2; out.z = (r[1] + r[3] + 1) * T / 2; out.fit = { w: (r[2] - r[0] + 1 + pd * 2) * T, h: (r[3] - r[1] + 1 + pd * 2) * T }; }
    else if (c.enc) {
      var e = run.V.encAt(c.enc[0], c.enc[1]);
      if (e && e.tiles && e.tiles.length) { var i0 = 99, j0 = 99, i1 = -1, j1 = -1; e.tiles.forEach(function (t) { var i = t % Z.N, j = Math.floor(t / Z.N); if (i < i0) i0 = i; if (j < j0) j0 = j; if (i > i1) i1 = i; if (j > j1) j1 = j; }); out.x = (i0 + i1 + 1) * T / 2; out.z = (j0 + j1 + 1) * T / 2; out.fit = { w: (i1 - i0 + 1 + (c.pad === undefined ? 3 : c.pad) * 2) * T, h: (j1 - j0 + 1 + (c.pad === undefined ? 3 : c.pad) * 2) * T }; }
      else { var q = Dr.tileXZ(c.enc[0], c.enc[1]); out.x = q.x; out.z = q.z; out.dist = c.d || 34; }
    }
    else if (c.follow && !c.follow.train) { var an = c.follow.at ? run.V.animalIn(c.follow.sp, c.follow.at[0], c.follow.at[1]) : null; if (!an) { var cand = Z.state.animals.filter(function (a) { return a.species === c.follow.sp; }); an = cand.filter(function (a) { return a.state === 'escaped'; })[0] || cand[0]; } if (an) { out.follow = { kind: 'animal', id: an.id }; out.x = an.x; out.z = an.z; out.dist = c.d || 18; } }
    else if (c.follow && c.follow.train) { var trs = run.V.trains(); if (trs.length) { out.follow = { kind: 'train', id: trs[0].id }; out.dist = c.d || 22; var st0 = Z.state.objects.filter(function (o) { return o.type === 'monorail_station'; })[0]; if (st0) { var q0 = Dr.tileXZ(st0.i, st0.j); out.x = q0.x; out.z = q0.z; } } }
    else if (c.guest) { var gs = Z.state.guests[0]; if (gs) { out.follow = { kind: 'guest', id: gs.id }; out.x = gs.x; out.z = gs.z; out.dist = c.d || 18; } }
    else if (c.tile) { var p = Dr.tileXZ(c.tile[0], c.tile[1]); out.x = p.x; out.z = p.z; out.dist = c.d || 34; }
    else if (typeof c.x === 'number') { out.x = c.x; out.z = c.z; out.dist = c.d || 40; }
    else return null;
    return out;
  }

  function nextStep(run) {
    var g = run.game;
    for (;;) {
      var ch = run.chapters[run.ci];
      if (!ch) { finishGame(run); return; }
      run.si++;
      if (run.si === 0) Ex.stage.chapter(run, ch, run.ci);
      if (run.si >= ch.steps.length) { finishChapter(run); return; }
      break;
    }
    var chap = run.chapters[run.ci], st = chap.steps[run.si];
    run.built = []; run.stepCount++;
    acts(run, st);
    var cam = resolveCam(run, st);
    var rate = st.until ? 1 : (st.rate || 1);   // a step that waits on a condition reads at 1x first, then time-lapses
    run.rate = rate;
    run.cur = { st: st, t: 0, lt: 0, phase: 'hold', lapseRate: st.rate || LAPSE, hold: holdOf(st), timeout: st.timeout || 60, say: sayOf(st), cam: cam };
    Ex.stage.step(run, { chapter: chap, ci: run.ci, si: run.si, say: run.cur.say, cam: cam, tiles: run.built.slice(), panel: st.panel, rate: rate, hl: st.hl, instant: run.skip, lapse: rate > 1.5, willLapse: !!st.until });
  }

  function money(v) { return Math.round(v); }
  function finishChapter(run) {
    var g = run.game, chap = run.chapters[run.ci], V = run.V, s = V.snap();
    var card = { game: g, chapter: chap, ci: run.ci, last: run.ci === run.chapters.length - 1, snap: s, series: (function () { var a = run.series.slice(), now = Math.round(s.money - s.loan); if (a.length < 2) a.push({ h: (a.length ? a[a.length - 1].h : 0) + 1, v: now }); if (a.length < 2) a.unshift({ h: a[0].h - 1, v: now }); return a; })(), headlines: V.headlines(3), lessons: chap.lessons || [], day: s.day };
    if (chap.compare && g.compare) card.compare = compareRows(run, g.compare);
    if (chap.stats) { try { card.extra = chap.stats(V, run); } catch (e) { card.extra = null; } }
    run.results[chap.id] = card;
    run.state = 'results'; run.cur = null; run.skip = false;
    var handled = false;
    if (!(run.seekTo !== undefined && run.ci < run.seekTo)) { try { handled = Ex.stage.results(run, card); } catch (e) { handled = false; } }
    if (!handled) Ex.continueFrom(run);
  }
  // after the results card: next chapter (or the end)
  Ex.continueFrom = function (run) {
    run = run || Ex.run; if (!run || run.state !== 'results') return;
    run.state = 'play'; run.ci++; run.si = -1; run.series = run.series.slice(-1);
    if (run.ci >= run.chapters.length) finishGame(run); else nextStep(run);
  };
  Ex.continue = function () { Ex.continueFrom(Ex.run); };
  function finishGame(run) { run.state = 'done'; run.cur = null; run.skip = false; Ex.stage.end(run); }

  function compareRows(run, cmp) {
    var ref = Ex._ref[cmp.game + '@' + cmp.day], mine = run.daily[cmp.day] || run.V.snap(); if (!ref) return null;
    var other = Ex.get(cmp.game);
    var rows = [['Money (net of loan)', 'net', 1], ['Star rating', 'rating', 1], ['Animals', 'animals', 1], ['Guests so far', 'guestsTotal', 1], ['Escapes', 'escapes', -1], ['Animal deaths', 'deaths', -1]].map(function (r) {
      var a = mine[r[1]], b = ref[r[1]], better = a === b ? null : ((a > b) === (r[2] > 0) ? 'mine' : 'ref'); return { label: r[0], key: r[1], mine: a, ref: b, better: better };
    });
    return { day: cmp.day, refTitle: other ? other.title : cmp.game, rows: rows };
  }

  // Reference numbers: play another example headlessly up to a day (cached), then restore nothing: callers start their own game afterwards.
  Ex.reference = function (id, day) {
    var key = id + '@' + day; if (Ex._ref[key]) return Ex._ref[key];
    var prev = Ex.run, r = Ex.runToEnd(id, { untilDay: day + 1, quiet: true, noRef: true, reference: true });
    Ex._ref[key] = r.daily[day] || r.V.snap();
    Ex.run = prev; return Ex._ref[key];
  };

  // ------------------------------------------------------------------ the clock
  // One quantum: QUANT game seconds of simulation, QUANT/rate presentation seconds.
  function quantum(run) {
    var cur = run.cur, V = run.V, st = cur.st, q = QUANT / run.rate, lapsing = cur.phase === 'lapse';
    Sim._step(QUANT); if (lapsing) cur.lt += q; else cur.t += q; run.t += q;
    var s = Z.state, hr = Math.floor(V.hours());
    if (s.day !== run.lastDay) { var snap = V.snap(); snap.day = run.lastDay; run.daily[run.lastDay] = snap; run.lastDay = s.day; }
    if (hr !== run.lastHour) { run.lastHour = hr; run.series.push({ h: hr, v: Math.round(s.money - s.loan) }); }
    if (st.force) { var rf = Sim._rt().force || (Sim._rt().force = {}); rf.keep = true; for (var fk in st.force) if (rf[fk] === null || rf[fk] === undefined) Sim.forceNext(fk, st.force[fk]); }
    if (st.tick) { run.tickAcc += QUANT; if (run.tickAcc >= 37.5) { run.tickAcc = 0; try { var r = st.tick(V, run); if (r && r.ok === false) run.fail('tick', r.msg); } catch (e) { run.fail('tick', e && e.message || String(e)); } } }
    if (s.gameOver) { run.timeouts.push({ chapter: run.chapters[run.ci].id, step: run.si, why: 'game over' }); endStep(run); return; }
    var cond = true;
    if (st.until) { try { cond = !!st.until(V, run); } catch (e) { cond = true; run.fail('until', e && e.message || String(e)); } }
    if (!lapsing) {
      if (cur.t < cur.hold) { if (run.untilDay && s.day >= run.untilDay) endStep(run); return; }
      if (cond) { endStep(run); return; }
      cur.phase = 'lapse'; run.rate = cur.lapseRate; Ex.stage.status(run, 'lapse'); return;
    }
    if (cond) { endStep(run); return; }
    if (cur.lt >= cur.timeout) { if (!st.soft) run.timeouts.push({ chapter: run.chapters[run.ci].id, step: run.si, say: cur.say && cur.say.t }); endStep(run); return; }
    if (run.untilDay && s.day >= run.untilDay) endStep(run);
  }
  function endStep(run) {
    var st = run.cur.st;
    if (st.force) for (var fk in st.force) { var rf = Sim._rt().force; if (rf) { rf.keep = false; if (rf[fk] === st.force[fk]) Sim.forceNext(fk, null); } }
    if (st.after) { try { st.after(run.V, run); } catch (e) { run.fail('after', e && e.message || String(e)); } }
    if (run.untilDay && Z.state.day >= run.untilDay) { run.state = 'done'; run.cur = null; return; }
    nextStep(run);
  }

  // Frame hook (90-main): dtReal real seconds. Returns nothing. Budgeted so a phone never stalls; unspent time carries over (capped).
  Ex.tick = function (dtReal) {
    var run = Ex.run; if (!run || !run.live || run.paused || run.state !== 'play' || !run.cur) { if (run && run.live) Ex.stage.tick(run, dtReal); return; }
    run.pacc = Math.min(run.pacc + dtReal * run.speed, 1.2);
    var t0 = (typeof performance !== 'undefined') ? performance.now() : 0, lim = run.skip ? 30 : 11, guard = 0, ci = run.ci;
    if (run.skip) run.pacc = 1e9;
    while (run.state === 'play' && run.cur && guard++ < 4000) {
      var q = QUANT / run.rate; if (!run.skip && run.pacc < q) break;
      if (!run.skip) run.pacc -= q; quantum(run);
      if (run.skip && run.ci !== ci && !(run.seekTo !== undefined && run.ci < run.seekTo)) break;
      if (t0 && (guard & 15) === 0 && performance.now() - t0 > lim) break;
    }
    if (run.skip && run.state === 'play' && run.ci === ci && run.cur && !t0) { /* headless skip: keep going next call */ }
    if (run.skip && run.ci !== ci && !(run.seekTo !== undefined && run.ci < run.seekTo)) { run.skip = false; run.seekTo = undefined; }
    Ex.stage.tick(run, dtReal);
  };
  // jump to chapter n: forward by fast-forwarding, backward by replaying from the start at full speed
  Ex.seek = function (n) {
    var run = Ex.run; if (!run || !run.live) return;
    if (n <= run.ci) { var id = run.game.id, o = run.opts; Ex.start(id, o); run = Ex.run; if (n === 0) return; }
    run.seekTo = n; run.skip = true; if (run.state === 'results') Ex.continueFrom(run);
  };
  Ex.restart = function () { var r = Ex.run; if (!r) return null; var id = r.game.id, o = r.opts; Ex.stop(); return Ex.start(id, o); };
  Ex._est = estOf;
  Ex.skipChapter = function () { var r = Ex.run; if (r && r.live && r.state === 'play') { r.skip = true; if (r.cur) Ex.stage.status(r, 'skip'); } };

  // Headless: play a whole game as fast as the CPU allows. Returns the run (fails, timeouts, results, daily, t).
  var NOSTAGE = function () { return { step: noop, chapter: noop, results: function () { return false; }, end: noop, begin: noop, tick: noop, status: noop }; };
  function pump(run, maxMs, maxSteps) {   // advance a headless run; true when finished
    var t0 = (typeof performance !== 'undefined') ? performance.now() : 0, n = 0;
    while (run.live && run.state !== 'done' && n++ < maxSteps) {
      if (run.state === 'results') { Ex.continueFrom(run); continue; }
      if (!run.cur) { nextStep(run); continue; }
      quantum(run);
      if (maxMs && t0 && (n & 63) === 0 && performance.now() - t0 > maxMs) return false;
    }
    return !run.live || run.state === 'done';
  }
  Ex.runToEnd = function (id, o) {
    o = o || {}; var prevStage = Ex.stage; Ex.stage = o.stage || NOSTAGE();
    var run;
    try {
      run = Ex.start(id, { headless: true, quiet: o.quiet, untilDay: o.untilDay, noRef: o.noRef });
      if (run && !pump(run, 0, o.maxSteps || 4e6)) run.fail('runToEnd', 'did not finish');
    } finally { Ex.stage = prevStage; }
    if (run) run.live = false; Ex.run = null;
    return run;
  };
  // Browser: compute a reference in slices (a few ms a frame) so the page never freezes; cb() when ready.
  Ex.referenceAsync = function (id, day, cb, progress) {
    var key = id + '@' + day; if (Ex._ref[key]) { cb(); return; }
    var prevStage = Ex.stage, prevRun = Ex.run; Ex.stage = NOSTAGE();
    var run = Ex.start(id, { headless: true, quiet: true, untilDay: day + 1, noRef: true });
    function tick() {
      var fin = true; try { fin = pump(run, 22, 4e5); } catch (e) { fin = true; }
      if (progress) progress(Math.min(1, (run.daily[day] ? 1 : Z.state.day / (day + 1))));
      if (fin) { Ex._ref[key] = run.daily[day] || run.V.snap(); run.live = false; Ex.stage = prevStage; Ex.run = prevRun; cb(); }
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };
  Ex.stop = function () { if (Ex.run) { Ex.run.live = false; } };

  // Hand the current park over as an ordinary game: clears the scripted-event hooks.
  Ex.releaseSim = function () { ['extract', 'splice', 'hatch', 'hybrid', 'species', 'keep'].forEach(function (k) { Sim.forceNext(k, null); }); if (Z.state) { Z.state.speed = 1; Z.state.gameOver = false; } };

  Ex.fmtTime = function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
})();
