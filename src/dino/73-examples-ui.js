// ===== 73-examples-ui.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - Masterclass UI: library, caption card, camera director, controls, chapter results, take-over.
   The engine (70-examples.js) is DOM-free; this file is its `stage`.  Touch-first: everything fits a 390 px wide phone. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, Ex = Z.Examples, Mc = UI.Masterclass = { on: false };
  var root = null, lib = null, resEl = null, cap = null, els = {}, keep = null, fromTitle = false, cam = null, hlUntil = 0, panelOpen = null, lastBox = 0, curInfo = null;

  // ------------------------------------------------------------------ css
  var css = [
    '#mc{position:fixed;inset:0;z-index:40;pointer-events:none;font-family:var(--sans);color:var(--ink)}#mc>*{pointer-events:auto}',
    'body.mc-on #tut,body.mc-on #build,body.mc-on #side,body.mc-on #goalchip,body.mc-on #follow,body.mc-on #lockbar,body.mc-on #unhide,body.mc-on #reveal,body.mc-on #banner,body.mc-on #newsflash,body.mc-on #toasts{display:none!important}',
    'body.mc-on #modal{pointer-events:none;padding-top:var(--mct,46px);padding-bottom:calc(var(--mcb,200px) + 10px)}',
    '.mc-top{position:absolute;left:6px;right:6px;display:flex;gap:6px;align-items:center;pointer-events:none}.mc-top>*{pointer-events:auto}',
    '.mc-tag{flex:1 1 auto;min-width:0;padding:5px 10px;background:rgba(44,94,58,.95);color:var(--paper);border:2px solid rgba(20,50,30,.8);border-radius:12px;box-shadow:var(--shadow);font:700 12px/1.25 var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mc-tag small{display:block;font:600 10.5px var(--sans);letter-spacing:.8px;text-transform:uppercase;opacity:.85}',
    '.mc-x{flex:none;width:42px;height:42px;border-radius:12px;background:var(--paper);border:2px solid rgba(58,42,26,.55);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;font-size:18px}',
    '.mc-bot{position:absolute;left:6px;right:6px;bottom:calc(6px + var(--sab));max-width:640px;margin:0 auto}',
    '.mc-cap{background:rgba(248,240,218,.97);border:2px solid rgba(58,42,26,.55);border-radius:14px;box-shadow:var(--shadow);padding:8px 12px 9px;animation:mcin .35s ease-out}',
    '@keyframes mcin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '.mc-ch{display:flex;gap:6px;align-items:center;font:700 10.5px var(--sans);letter-spacing:1px;text-transform:uppercase;color:var(--moss)}',
    '.mc-lapse{margin-left:auto;background:var(--sun);color:var(--ink);border-radius:8px;padding:1px 7px;letter-spacing:.3px}',
    '.mc-ct{font:700 16px/1.2 var(--serif);margin:3px 0 2px}',
    '.mc-cx{font-size:13.5px;line-height:1.36}',
    '.mc-why{margin-top:5px;font-size:12.5px;line-height:1.32;color:var(--ink2)}.mc-why b{display:inline-block;background:var(--moss);color:var(--paper);border-radius:6px;padding:0 6px;margin-right:5px;font:700 10.5px/17px var(--sans);letter-spacing:.8px;text-transform:uppercase}',
    '.mc-prog{height:7px;border-radius:4px;background:rgba(248,240,218,.55);border:1px solid rgba(58,42,26,.5);position:relative;margin:6px 2px 0;overflow:hidden}.mc-pf{position:absolute;left:0;top:0;bottom:0;background:var(--sun);width:0}.mc-pt{position:absolute;top:0;bottom:0;width:2px;background:rgba(58,42,26,.55)}',
    '.mc-bar{display:flex;gap:5px;margin-top:6px;align-items:stretch}',
    '.mc-b{flex:1 1 0;min-width:40px;height:44px;border-radius:12px;background:var(--paper);border:2px solid rgba(58,42,26,.55);box-shadow:0 3px 0 rgba(58,42,26,.2);display:flex;flex-direction:column;align-items:center;justify-content:center;font:700 10px/1 var(--sans);color:var(--ink);gap:2px;padding:0;overflow:hidden}',
    '@media(max-width:420px){.mc-b{font-size:9px}}',
    '.mc-b svg{width:20px;height:20px}.mc-b:active{transform:translateY(2px)}.mc-b.on{background:var(--sun)}.mc-b.gold{background:var(--sun);flex:1.7 1 0;font-size:11px}',
    '.mc-sheet{position:fixed;inset:0;z-index:46;background:rgba(14,30,18,.78);display:flex;align-items:center;justify-content:center;padding:calc(10px + var(--sat)) 10px calc(10px + var(--sab))}',
    '.mc-box{width:100%;max-width:560px;max-height:100%;overflow:auto;background:var(--paper);border:3px solid rgba(58,42,26,.7);border-radius:18px;box-shadow:var(--shadow);padding:14px 14px 12px;-webkit-overflow-scrolling:touch;touch-action:pan-y}',
    '.mc-box h2{margin:0 0 2px;font:700 21px/1.15 var(--serif)}.mc-box .mc-sub{color:var(--ink2);font-size:13px;margin-bottom:8px}',
    '.mc-gc{background:var(--paper2);border:2px solid rgba(58,42,26,.35);border-radius:14px;padding:10px 11px;margin:9px 0}',
    '.mc-gt{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mc-gt b{font:700 16.5px var(--serif)}',
    '.mc-bd{font:700 10.5px var(--sans);letter-spacing:.7px;text-transform:uppercase;border-radius:8px;padding:2px 8px;color:#fff}.mc-bd.good{background:var(--good)}.mc-bd.bad{background:var(--bad)}.mc-bd.mixed{background:var(--sky)}',
    '.mc-len{font:600 12px var(--sans);color:var(--ink2)}.mc-seen{font:700 11px var(--sans);color:var(--good)}',
    '.mc-gb{font-size:13px;line-height:1.34;margin:5px 0}.mc-tp{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0 7px}.mc-tp i{font:600 11px var(--sans);font-style:normal;background:rgba(58,42,26,.1);border-radius:8px;padding:2px 7px;color:var(--ink2)}',
    '.mc-g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0}.mc-n{background:var(--paper2);border-radius:10px;padding:6px 8px;text-align:center}.mc-n b{display:block;font:700 17px var(--serif)}.mc-n span{font:600 10.5px var(--sans);color:var(--ink2);letter-spacing:.4px;text-transform:uppercase}',
    '.mc-h4{font:700 11px var(--sans);letter-spacing:1px;text-transform:uppercase;color:var(--moss);margin:10px 0 3px}',
    '.mc-hl{font:700 13px/1.25 var(--serif);padding:5px 8px;border-left:4px solid var(--ink3);background:rgba(58,42,26,.06);border-radius:0 8px 8px 0;margin:3px 0}.mc-hl.bad{border-color:var(--bad)}.mc-hl.good{border-color:var(--good)}.mc-hl small{display:block;font:600 11px var(--sans);color:var(--ink2)}',
    '.mc-ls{margin:2px 0 4px 18px;padding:0;font-size:13.5px;line-height:1.38}',
    '.mc-cmp{width:100%;border-collapse:collapse;font-size:13px}.mc-cmp td,.mc-cmp th{padding:5px 6px;border-bottom:1px solid rgba(58,42,26,.15);text-align:right}.mc-cmp th{font:700 10.5px var(--sans);text-transform:uppercase;letter-spacing:.5px;color:var(--ink2)}.mc-cmp td:first-child,.mc-cmp th:first-child{text-align:left}.mc-cmp .w{color:var(--good);font-weight:700}.mc-cmp .l{color:var(--bad)}',
    '.mc-act{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.mc-act .btn{flex:1 1 130px}',
    '.mc-chap{display:flex;gap:9px;align-items:center;padding:10px;border-radius:12px;border:2px solid rgba(58,42,26,.3);margin:6px 0;background:var(--paper2);width:100%;text-align:left;font:700 14px var(--sans)}.mc-chap.cur{border-color:var(--moss);background:#e3edc8}.mc-chap small{display:block;font:600 11px var(--sans);color:var(--ink2)}',
    '.mc-wait{position:fixed;inset:0;z-index:9999;background:#0e1e12;color:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:30px}.mc-wait .bar{width:min(260px,70vw);height:10px;border-radius:6px;background:rgba(255,255,255,.2);overflow:hidden}.mc-wait .bar i{display:block;height:100%;width:0;background:var(--sun)}',
    '@media (min-width:820px){.mc-ct{font-size:18px}.mc-cx{font-size:15px}.mc-why{font-size:13.5px}}',
    '@media (max-height:560px){.mc-cx{font-size:12.5px}.mc-why{font-size:11.5px}.mc-ct{font-size:14.5px}}'
  ].join('\n');
  var st0 = document.createElement('style'); st0.setAttribute('data-mc', '1'); st0.textContent = css; document.head.appendChild(st0);

  // ------------------------------------------------------------------ small helpers
  function svg(d, fill) { return '<svg viewBox="0 0 24 24" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'; }
  var I = {
    play: svg('M7 4.500l12 7.500-12 7.500z', 1), pause: svg('M7 5h3.500v14H7zM13.500 5H17v14h-3.500z', 1), next: svg('M5 5l9 7-9 7zM17 5v14', 0), list: svg('M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'),
    cam: svg('M3 7h4l2-2.500h6L17 7h4v12H3zM12 16.500a3.500 3.500 0 100-7 3.500 3.500 0 000 7z'), redo: svg('M20 12a8 8 0 11-2.500-5.800M20 4v5h-5'), close: svg('M6 6l12 12M18 6L6 18'), hand: svg('M8 13V6a1.500 1.500 0 013 0v5M11 11V4.500a1.500 1.500 0 013 0V11M14 11V6.500a1.500 1.500 0 013 0V15c0 4-2.500 6-6 6-3.500 0-5-2.500-6-5l-1-3a1.500 1.500 0 012.500-1.500L8 14')
  };
  function pref() { return (Z.Main && Z.Main.pref('watched')) || {}; }
  function markWatched(id) { if (!Z.Main) return; var w = pref(); if (w[id]) return; w[id] = 1; Z.Main.pref('watched', w); }
  function fmtMoney(v) { return (v < 0 ? '-' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB'); }
  function nowMs() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
  function badgeText(b) { return b === 'good' ? 'Good strategy' : b === 'bad' ? 'Bad strategy' : 'Good and bad'; }
  function lengthOf(g) { return '≈' + (g.minutes || 4) + ' min'; }
  function usable(g) { return !g.when || g.when(); }

  // ------------------------------------------------------------------ library (title screen, Guide tab)
  function gameCard(g, close) {
    var seen = !!pref()[g.id];
    return h('div.mc-gc', h('div.mc-gt', h('b', { text: g.title }), h('span.mc-bd.' + g.badge, { text: badgeText(g.badge) }), h('span.mc-len', { text: lengthOf(g) }), seen ? h('span.mc-seen', { text: '✓ Watched' }) : null),
      h('div.mc-gb', { text: g.blurb }), h('div.mc-tp', (g.topics || []).map(function (t) { return h('i', { text: t }); })),
      h('button.btn.gold.block', { html: I.play.replace('<svg', '<svg style="width:1.2em;height:1.2em;vertical-align:-.2em"') + ' Watch this game', on: { click: function () { UI.snd('click'); if (close) close(); Mc.start(g.id); } } }));
  }
  Mc.list = function (container, close) { (Ex.games || []).forEach(function (g) { container.appendChild(gameCard(g, close)); }); return container; };
  Mc.open = function () {
    Mc.closeLib();
    var box = h('div.mc-box', h('h2', { text: 'Masterclass' }), h('div.mc-sub', { text: 'Watch a scripted example park played on the real game, with a caption on every move and a note on why. Good, bad and mixed strategy, each in a few minutes.' }));
    Mc.list(box, Mc.closeLib);
    box.appendChild(h('div.mc-act', h('button.btn.alt', { text: 'Back', on: { click: function () { UI.snd('click'); Mc.closeLib(); } } })));
    lib = h('div.mc-sheet', box); document.body.appendChild(lib);
  };
  Mc.closeLib = function () { if (lib) { lib.remove(); lib = null; } };
  Mc.watchedCount = function () { var w = pref(), n = 0; Ex.games.forEach(function (g) { if (w[g.id]) n++; }); return n; };

  // ------------------------------------------------------------------ starting and leaving
  function copyCam() { var c = Z.World.cam; return { x: c.target.x, z: c.target.z, dist: c.dist, yaw: c.yaw, pitch: c.pitch }; }
  Mc.start = function (id) {
    if (Mc.on) return; var g = Ex.get(id); if (!g) return;
    var M = Z.Main; fromTitle = !!UI.titleOpen; keep = null;
    if (!fromTitle && M.playing) { try { keep = { save: Z.Sim.save(), cam: copyCam(), speed: Z.state.speed }; } catch (e) { keep = null; } }
    Mc.closeLib();
    function go() {
      try { UI.closeModal(); if (UI.Panel) UI.Panel.hide(true); if (UI.Tools) UI.Tools.cancel(true); } catch (e) { }
      M.watching = true; Ex.stage = stage;
      Mc.on = true; build(); document.body.classList.add('mc-on');
      var run = Ex.start(id, {});
      if (!run) { Mc.on = false; if (root) { root.remove(); root = null; } document.body.classList.remove('mc-on'); M.watching = false; Ex.stage = null; return; }
      var t = document.getElementById('title'); if (t) t.classList.remove('on');
      M.internals.enterGame(); M.playing = true; Z.state.speed = 1;
      if (UI.Tutorial && UI.Tutorial.active && UI.Tutorial.active()) { /* hidden by css */ }
      layout();
    }
    if (g.compare && !Ex._ref[g.compare.game + '@' + g.compare.day]) {
      if (!fromTitle && M.playing) M.save();   // persist the player's park first: the headless reference run below borrows Z.state
      M.hold = true;   // QA: no ticking / autosave while the reference run owns Z.state
      var wait = h('div.mc-wait', h('div.serif', { style: 'font-size:20px', text: 'Preparing the comparison' }), h('div', { text: 'Playing the Careful Keeper in the background so the two can be set side by side.' }), h('div.bar', h('i')));
      document.body.appendChild(wait);
      Ex.referenceAsync(g.compare.game, g.compare.day, function () { wait.remove(); M.hold = false; go(); }, function (p) { wait.querySelector('i').style.width = Math.round(p * 100) + '%'; });
    } else go();
  };

  function teardown() {
    Mc.on = false; if (root) { root.remove(); root = null; } if (resEl) { resEl.remove(); resEl = null; } var s = document.querySelector('.mc-sheet.mc-tmp'); if (s) s.remove();
    document.body.classList.remove('mc-on'); try { UI.closeModal(); Z.World.setPreview(null); if (Z.World.follow) Z.World.follow(null); } catch (e) { }
    panelOpen = null; cam = null; curInfo = null;
  }
  Mc.exit = function () {
    if (!Mc.on) return; var M = Z.Main; Ex.stop(); Ex.stage = null; teardown();
    var restored = false;
    if (keep) {
      try { restored = Z.Sim.load(keep.save); } catch (e) { restored = false; }
      if (restored) {
        M.internals.enterGame(); M.playing = true; Z.state.speed = keep.speed; M.watching = false;
        var c = Z.World.cam; c.target.x = keep.cam.x; c.target.z = keep.cam.z; c.dist = keep.cam.dist; c.yaw = keep.cam.yaw; c.pitch = keep.cam.pitch; Z.World.snapCamera();
        UI.toast('Back in your own park.', 'info');
      }
    }
    if (!restored) { M.toTitle(); M.watching = false; }   // toTitle runs while `watching` still blocks the autosave
    keep = null;
  };
  Mc.takeOver = function () {
    var M = Z.Main;
    function go() {
      var run = Ex.run; Ex.stop(); Ex.stage = null; Ex.releaseSim(); teardown(); keep = null;
      M.watching = false; M.playing = true; Z.state.speed = 1; M.internals.enterGame(); M.playing = true; Z.state.speed = 1;
      var c = Z.World.cam; c.dist = Math.max(c.dist, 40); M.save();
      UI.toast('This park is now yours. Play on!', 'good');
    }
    if (M.hasSave()) {
      var box = h('div.mc-box', h('h2', { text: 'Take over this park?' }), h('div.mc-sub', { text: 'You already have a saved park. Taking this one over replaces it with this park when the game next saves, which is straight away.' }),
        h('div.mc-act', h('button.btn.alt', { text: 'Keep watching', on: { click: function () { UI.snd('click'); sheet.remove(); } } }), h('button.btn.warn', { text: 'Replace my save', on: { click: function () { UI.snd('click'); sheet.remove(); go(); } } })));
      var sheet = h('div.mc-sheet.mc-tmp', box); document.body.appendChild(sheet);
    } else go();
  };

  // ------------------------------------------------------------------ overlay
  function build() {
    root = h('div#mc'); els = {};
    els.tag = h('div.mc-tag'); els.top = h('div.mc-top', els.tag, h('button.mc-x', { html: I.close, 'aria-label': 'Exit the Masterclass', on: { click: function () { UI.snd('click'); Mc.exit(); } } }));
    els.ch = h('span'); els.lapse = h('span.mc-lapse'); els.t = h('div.mc-ct'); els.x = h('div.mc-cx'); els.why = h('div.mc-why');
    cap = h('div.mc-cap', h('div.mc-ch', els.ch, els.lapse), els.t, els.x, els.why);
    els.pf = h('div.mc-pf'); els.prog = h('div.mc-prog', els.pf);
    function btn(icon, label, fn, cls) { var b = h('button.mc-b' + (cls ? '.' + cls : ''), { html: icon + '<span>' + label + '</span>', on: { click: function () { UI.snd('click'); fn(b); } } }); return b; }
    els.play = btn(I.pause, 'Pause', function () { var r = Ex.run; if (!r) return; r.paused = !r.paused; refreshBar(); });
    els.speed = btn('<b style="font-size:15px;line-height:20px">1x</b>', 'Speed', function () { var r = Ex.run; if (!r) return; r.speed = r.speed === 1 ? 2 : r.speed === 2 ? 4 : 1; refreshBar(); });
    els.next = btn(I.next, 'Next', function () { Ex.skipChapter(); });
    els.list = btn(I.list, 'Chapters', function () { openChapters(); });
    els.free = btn(I.cam, 'Camera', function () { var r = Ex.run; if (!r) return; r.freeCam = !r.freeCam; refreshBar(); UI.toast(r.freeCam ? 'Free camera: drag to look around. The director will stay put.' : 'The director has the camera again.', 'info'); });
    els.redo = btn(I.redo, 'Restart', function () { closeRes(); Ex.restart(); Z.state.speed = 1; refreshBar(); });
    els.take = btn(I.hand, 'Take over', function () { Mc.takeOver(); }, 'gold');
    var bar = h('div.mc-bar', els.play, els.speed, els.next, els.list, els.free, els.redo, els.take);
    els.bot = h('div.mc-bot', cap, els.prog, bar);
    root.appendChild(els.top); root.appendChild(els.bot); document.body.appendChild(root);
    window.addEventListener('resize', layout);
  }
  function layout() {
    if (!root) return;
    var hud = document.getElementById('hud'), top = hud ? Math.round(hud.getBoundingClientRect().bottom) + 5 : 56;
    els.top.style.top = top + 'px';
    document.body.style.setProperty('--mct', Math.round(top + els.top.getBoundingClientRect().height + 6) + 'px');   // panels opened by a step start below the chapter tag, not under it
    var bh = els.bot.getBoundingClientRect().height; root.style.setProperty('--mcb', Math.round(bh) + 'px'); document.body.style.setProperty('--mcb', Math.round(bh) + 'px'); lastBox = bh;
  }
  function refreshBar() {
    var r = Ex.run; if (!r || !els.play) return;
    els.play.innerHTML = (r.paused ? I.play : I.pause) + '<span>' + (r.paused ? 'Play' : 'Pause') + '</span>';
    els.speed.innerHTML = '<b style="font-size:15px;line-height:20px">' + r.speed + 'x</b><span>Speed</span>';
    els.free.classList.toggle('on', !!r.freeCam);
  }
  function setProgress(run) {
    if (!run || !els.pf) return;
    var tot = run.total || 1, done = 0, k, chs = run.chapters;
    for (k = 0; k < run.ci; k++) done += run.wts[k];
    if (run.ci < chs.length) { for (k = 0; k < run.si && k < chs[run.ci].steps.length; k++) done += Ex._est(chs[run.ci].steps[k]); if (run.cur) done += Math.min(Ex._est(run.cur.st), run.cur.t + run.cur.lt * 0.5); }
    if (run.state === 'results' && run.ci < chs.length) done = 0; // results: recomputed below
    var p = run.state === 'results' ? (function () { var d = 0; for (var q = 0; q <= run.ci; q++) d += run.wts[q]; return d / tot; })() : done / tot;
    els.pf.style.width = Math.round(Math.min(1, p) * 1000) / 10 + '%';
    if (!els.ticks) { els.ticks = 1; var acc = 0; run.chapters.forEach(function (c, i) { acc += run.wts[i]; if (i < run.chapters.length - 1) els.prog.appendChild(h('i.mc-pt', { style: 'left:' + (acc / tot * 100) + '%' })); }); }
  }

  // ------------------------------------------------------------------ chapter list
  function openChapters() {
    var r = Ex.run; if (!r) return; var was = r.paused; r.paused = true; refreshBar();
    var box = h('div.mc-box', h('h2', { text: r.game.title }), h('div.mc-sub', { text: 'Jump to a chapter. Going back replays from the start at full speed.' }));
    r.chapters.forEach(function (c, i) {
      box.appendChild(h('button.mc-chap' + (i === r.ci ? '.cur' : ''), { on: { click: function () { UI.snd('click'); sh.remove(); r.paused = was; refreshBar(); closeRes(); Ex.seek(i); Z.state.speed = 1; } } },
        h('span', { text: (i + 1) + '.' }), h('span', h('span', { text: c.title }), h('small', { text: i < r.ci ? 'Seen' : i === r.ci ? 'Playing now' : 'Ahead' }))));
    });
    box.appendChild(h('div.mc-act', h('button.btn.alt', { text: 'Close', on: { click: function () { UI.snd('click'); sh.remove(); r.paused = was; refreshBar(); } } })));
    var sh = h('div.mc-sheet.mc-tmp', box); document.body.appendChild(sh);
  }

  // ------------------------------------------------------------------ results card
  function graph(series) {
    if (!series || series.length < 2) return h('div');
    var W = 300, H = 90, min = Infinity, max = -Infinity;
    series.forEach(function (p) { if (p.v < min) min = p.v; if (p.v > max) max = p.v; });
    if (max === min) return h('div');   // nothing moved in this chapter: no graph
    if (max === min) { max += 1; min -= 1; }
    var x0 = series[0].h, x1 = series[series.length - 1].h, dx = Math.max(1, x1 - x0), pts = series.map(function (p) { return (((p.h - x0) / dx) * (W - 8) + 4).toFixed(1) + ',' + (H - 6 - ((p.v - min) / (max - min)) * (H - 14)).toFixed(1); }).join(' ');
    var zero = min < 0 && max > 0 ? '<line x1="0" x2="' + W + '" y1="' + (H - 6 - ((0 - min) / (max - min)) * (H - 14)).toFixed(1) + '" y2="' + (H - 6 - ((0 - min) / (max - min)) * (H - 14)).toFixed(1) + '" stroke="#c4553a" stroke-dasharray="4 3" stroke-width="1"/>' : '';
    var el = h('div', { html: '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:' + H + 'px;background:rgba(58,42,26,.06);border-radius:10px">' + zero + '<polyline fill="none" stroke="#2c5e3a" stroke-width="2.4" stroke-linejoin="round" points="' + pts + '"/></svg>' });
    return h('div', h('div.mc-h4', { text: 'Money over the chapter (net of any loan)' }), el, h('div.mc-len', { text: fmtMoney(series[0].v) + ' to ' + fmtMoney(series[series.length - 1].v) }));
  }
  function showResults(run, card) {
    closeRes(); var s = card.snap, g = run.game, box = h('div.mc-box');
    box.appendChild(h('div.mc-ch', { text: 'Chapter ' + (card.ci + 1) + ' of ' + run.chapters.length + ' complete' }));
    box.appendChild(h('h2', { text: card.chapter.title }));
    box.appendChild(h('div.mc-sub', { text: g.title + ' · day ' + s.day }));
    var nums = [['Money', fmtMoney(s.money)], ['Rating', s.rating.toFixed(1) + ' stars'], ['Guests', s.guestsTotal], ['Animals', s.animals], ['Escapes', s.escapes], ['Deaths', s.deaths]];
    if (s.loan) nums.splice(1, 0, ['Loan owed', fmtMoney(s.loan)]);
    if (card.extra) Object.keys(card.extra).forEach(function (k) { if (nums.length < 9) nums.push([k, card.extra[k]]); });
    box.appendChild(h('div.mc-g', nums.slice(0, 9).map(function (n) { return h('div.mc-n', h('b', { text: String(n[1]) }), h('span', { text: n[0] })); })));
    box.appendChild(graph(card.series));
    if (card.compare) {
      var cp = card.compare, tb = h('table.mc-cmp', h('tr', h('th', { text: 'Day ' + cp.day }), h('th', { text: 'This park' }), h('th', { text: cp.refTitle })));
      cp.rows.forEach(function (r) { var f = function (v) { return r.key === 'net' ? fmtMoney(v) : r.key === 'rating' ? (+v).toFixed(1) : v; }; tb.appendChild(h('tr', h('td', { text: r.label }), h('td' + (r.better === 'mine' ? '.w' : r.better === 'ref' ? '.l' : ''), { text: f(r.mine) }), h('td' + (r.better === 'ref' ? '.w' : r.better === 'mine' ? '.l' : ''), { text: f(r.ref) }))); });
      box.appendChild(h('div.mc-h4', { text: 'Side by side' })); box.appendChild(tb);
    }
    if (card.headlines && card.headlines.length) { box.appendChild(h('div.mc-h4', { text: 'In the news' })); card.headlines.forEach(function (n) { box.appendChild(h('div.mc-hl' + (n.mood === 'bad' ? '.bad' : n.mood === 'good' ? '.good' : ''), { text: n.head }, h('small', { text: n.outlet + ', day ' + n.day }))); }); }
    if (card.lessons && card.lessons.length) { box.appendChild(h('div.mc-h4', { text: 'Lessons' })); box.appendChild(h('ul.mc-ls', card.lessons.slice(0, 5).map(function (l) { return h('li', { text: l }); }))); }
    var acts = h('div.mc-act');
    if (card.last) {
      markWatched(g.id);
      acts.appendChild(h('button.btn.gold', { text: 'Take over this park', on: { click: function () { UI.snd('click'); Mc.takeOver(); } } }));
      acts.appendChild(h('button.btn.alt', { text: 'Watch again', on: { click: function () { UI.snd('click'); closeRes(); Ex.restart(); Z.state.speed = 1; } } }));
      acts.appendChild(h('button.btn', { text: 'Finish', on: { click: function () { UI.snd('click'); Mc.exit(); } } }));
    } else acts.appendChild(h('button.btn.gold', { text: 'Continue to chapter ' + (card.ci + 2), on: { click: function () { UI.snd('click'); closeRes(); Ex.continue(); } } }));
    box.appendChild(acts);
    resEl = h('div.mc-sheet', { style: 'z-index:44' }, box); document.body.appendChild(resEl);
    try { UI.snd('fanfare'); } catch (e) { }
  }
  function closeRes() { if (resEl) { resEl.remove(); resEl = null; } }

  // ------------------------------------------------------------------ camera director
  function viewMetrics() {
    var W = window.innerWidth, H = window.innerHeight, hud = document.getElementById('hud'), top = hud ? hud.getBoundingClientRect().bottom + 40 : 70, bot = H - (els.bot ? els.bot.getBoundingClientRect().top : H * 0.7);
    var us = Math.max(0.3, (H - top - bot) / H), centre = (top + (H - bot)) / 2 / H;   // usable fraction of the height and where its centre is (0.5 = middle)
    return { W: W, H: H, aspect: W / H, usable: us, off: 0.5 - centre };
  }
  function poseFor(c) {
    var World = Z.World, camera = World.camera ? World.camera() : null, fov = camera ? camera.fov : 45, vm = viewMetrics(), tf = Math.tan(fov * Math.PI / 360);
    var pitch = c.pitch || 0.95, yaw = c.yaw === undefined ? (cam ? cam.to.yaw : 0.15) : c.yaw, dist = c.dist;
    if (c.fit) {
      var dH = (c.fit.h * Math.sin(pitch)) / (2 * tf * vm.usable), dW = c.fit.w / (2 * tf * vm.aspect), dD = Math.sqrt(c.fit.w * c.fit.w + c.fit.h * c.fit.h) * 0.45 / (2 * tf * Math.max(vm.usable, vm.aspect * 0.8));
      dist = Math.max(dH, dW, dD * 0.8, 16);
    }
    dist = Math.min(140, Math.max(8, dist || 40));
    var gh = 2 * dist * tf / Math.max(0.3, Math.sin(pitch)), shift = vm.off * gh * 1.05;   // look-at point nearer the camera so the subject sits in the open part of the screen
    return { x: c.x + Math.sin(yaw) * shift, z: c.z + Math.cos(yaw) * shift, dist: dist, yaw: yaw, pitch: pitch };
  }
  function wrapPI(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function aim(info, instant) {
    var run = Ex.run, World = Z.World, c = info.cam; if (!c || c.keep || !run || run.freeCam) return;
    try { World.follow(null); if (Z.MonoWorld && Z.MonoWorld.endRide) { /* ride-along is never started here */ } } catch (e) { }
    var to = poseFor(c), cc = World.cam;
    if (c.follow) {
      to.dist = c.follow.kind === 'train' ? 24 : Math.max(10, c.dist || 20); to.pitch = 0.62; to.yaw = c.yaw === undefined ? cc.yaw : c.yaw;
    }
    cam = { t0: nowMs(), dur: instant ? 1 : 1700, from: { x: cc.target.x, z: cc.target.z, dist: cc.dist, yaw: cc.yaw, pitch: cc.pitch }, to: to, follow: c.follow || null };
    if (instant) { applyCam(1); finishCam(); }
  }
  function finishCam() {
    var World = Z.World; if (!cam) return;
    if (cam.follow) { try { if (cam.follow.kind === 'train') { if (Z.MonoWorld && Z.MonoWorld.follow) Z.MonoWorld.follow(cam.follow.id); } else World.follow(cam.follow.kind, cam.follow.id); } catch (e) { } }
    cam.done = true; if (cam.instant !== false && World.snapCamera) { /* eased by the world */ }
  }
  function applyCam(k) {
    var cc = Z.World.cam, f = cam.from, t = cam.to, e = k * k * (3 - 2 * k);
    if (!cam.follow) { cc.target.x = f.x + (t.x - f.x) * e; cc.target.z = f.z + (t.z - f.z) * e; }
    cc.dist = f.dist + (t.dist - f.dist) * e; cc.yaw = f.yaw + wrapPI(t.yaw - f.yaw) * e; cc.pitch = f.pitch + (t.pitch - f.pitch) * e;
  }

  // ------------------------------------------------------------------ panels
  function openPanel(spec) {
    var name = Array.isArray(spec) ? spec[0] : spec, sub = Array.isArray(spec) ? spec[1] : null;
    try {
      if (name === 'res' && UI.Research && UI.Research.open) { UI.Research.open(sub || 'lab'); } else UI.openModal(name);
      panelOpen = name;
    } catch (e) { panelOpen = null; }
  }
  function closePanel() { if (panelOpen) { try { UI.closeModal(); } catch (e) { } panelOpen = null; } }

  // ------------------------------------------------------------------ the stage the engine drives
  var stage = {
    begin: function (run) { Z.state.speed = 1; closeRes(); closePanel(); cam = null; els.ticks = 0; if (els.prog) { Array.prototype.slice.call(els.prog.querySelectorAll('.mc-pt')).forEach(function (n) { n.remove(); }); } },
    chapter: function (run, ch, ci) { curInfo = curInfo || {}; curInfo.chapter = ch; curInfo.ci = ci; if (els.ch) els.ch.textContent = 'Chapter ' + (ci + 1) + '/' + run.chapters.length + ' · ' + ch.title; if (els.tag) els.tag.innerHTML = '<small>' + run.game.title + '</small>' + ch.title; },
    step: function (run, info) {
      curInfo = info; var instant = !!info.instant;
      if (els.ch) els.ch.textContent = 'Chapter ' + (info.ci + 1) + '/' + run.chapters.length + ' · ' + info.chapter.title;
      if (els.tag) els.tag.innerHTML = '<small>' + run.game.title + '</small>' + info.chapter.title;
      if (info.say && !instant) {
        els.t.textContent = info.say.t; els.x.textContent = info.say.x; els.why.innerHTML = info.say.why ? '<b>Why</b>' : ''; if (info.say.why) els.why.appendChild(document.createTextNode(info.say.why));
        cap.style.animation = 'none'; void cap.offsetWidth; cap.style.animation = '';
      }
      els.lapse.textContent = '';
      closePanel(); if (info.panel && !instant) openPanel(info.panel);
      aim(info, instant);
      if (info.tiles && info.tiles.length && !instant) { try { Z.World.setPreview({ type: 'tiles', tiles: info.tiles.slice(0, 1100), ok: true }); hlUntil = nowMs() + 3200; } catch (e) { } } else if (!instant) { try { Z.World.setPreview(null); } catch (e) { } }
      refreshBar(); setTimeout(layout, 30);
    },
    status: function (run, what) {
      if (what === 'lapse' && els.lapse) { els.lapse.textContent = 'Time passes · day ' + Z.state.day; }
    },
    results: function (run, card) { closePanel(); try { Z.World.setPreview(null); } catch (e) { } showResults(run, card); return true; },
    end: function (run) { markWatched(run.game.id); },
    tick: function (run, dt) {
      if (!Mc.on || !run) return;
      if (cam && !cam.done) { var k = Math.min(1, (nowMs() - cam.t0) / cam.dur); applyCam(k); if (k >= 1) finishCam(); }
      if (hlUntil && nowMs() > hlUntil) { hlUntil = 0; try { Z.World.setPreview(null); } catch (e) { } }
      if (panelOpen && run.cur && run.cur.t >= Math.min(6.5, run.cur.hold)) closePanel();
      if (run.state === 'play' && run.cur) { if (curInfo && els.lapse && run.rate > 1.5) els.lapse.textContent = (run.skip ? 'Skipping' : 'Time passes') + ' · day ' + Z.state.day; else if (els.lapse && run.skip) els.lapse.textContent = 'Skipping · day ' + Z.state.day; else if (els.lapse) els.lapse.textContent = ''; }
      setProgress(run);
      if (els.bot) { var bh = els.bot.getBoundingClientRect().height; if (Math.abs(bh - lastBox) > 2) layout(); }
    }
  };
  Mc._stage = stage;

  // Guide tab and tutorial link
  Mc.guideBlock = function () { var box = h('div'); box.appendChild(h('div.mc-sub', { text: 'Watch scripted example games on the real simulation, with captions that explain each move.' })); Mc.list(box); return box; };
})();
