// ===== 61-minigames.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - DNA side puzzles: Base Match, Codon Cracker, Strand Link, Fragment Fit, Helix Memory (sequencing) and Gene Splice (splicing).
   Self-contained full-screen modal. API: Z.UI.Minigames.{list, open, isOpen, debugMenu}; see notes/minigames.md. DOM only, no sim state. */
(function () {
  'use strict';
  var UI = Z.UI, M = UI.Minigames = {}, cur = null, dbg = null, FAST = false;
  var h = function () { return UI.h.apply(null, arguments); };
  var BASES = ['A', 'T', 'C', 'G'];
  var COL = { A: '#009E73', T: '#D55E00', C: '#0072B2', G: '#E6A100' };   // Okabe-Ito: colour-blind safe, and each base also has its own shape + letter
  var COMP = { A: 'T', T: 'A', C: 'G', G: 'C' };
  var SHAPE = {
    A: '<circle cx="20" cy="20" r="16.5"/>', T: '<path d="M20 3L37.500 35.500H2.500z" stroke-linejoin="round"/>',
    C: '<rect x="4.500" y="4.500" width="31" height="31" rx="6"/>', G: '<path d="M20 2l15.500 9v18L20 38 4.500 29V11z" stroke-linejoin="round"/>'
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function bsvg(b, cls) {
    return '<svg class="mgs ' + (cls || '') + '" viewBox="0 0 40 40" aria-label="' + b + '"><g fill="' + COL[b] + '" stroke="rgba(30,20,10,.6)" stroke-width="2.200">' + SHAPE[b] + '</g>' +
      '<text x="20" y="' + (b === 'T' ? 30.500 : 26.500) + '" text-anchor="middle" font-size="17" font-weight="800" font-family="sans-serif" fill="#fff" stroke="rgba(30,20,10,.65)" stroke-width="2.800" paint-order="stroke">' + b + '</text></svg>';
  }
  function rc(s) { var o = ''; for (var i = s.length - 1; i >= 0; i--) o += COMP[s[i]]; return o; }
  function cmp(s) { var o = ''; for (var i = 0; i < s.length; i++) o += COMP[s[i]]; return o; }
  function rgba(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return 'rgba(120,120,120,' + a + ')';
    var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function luma(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return 0.4; var n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
  function mkRng(seed) {
    var s = (seed >>> 0) || 1;
    var r = {
      next: function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
      int: function (a, b) { return a + Math.floor(r.next() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(r.next() * arr.length)]; },
      base: function () { return BASES[Math.floor(r.next() * 4)]; },
      shuffle: function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r.next() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    };
    return r;
  }
  function snd(n) { try { UI.snd(n); } catch (e) { } }
  function seqStr(rng, n) { var s = ''; for (var i = 0; i < n; i++) s += rng.base(); return s; }
  function mq(l) { return Math.max(1, l | 0); }

  // =================================================================== GAMES
  var GAMES = {}, ORDER = [];
  function reg(id, name, blurb, kind, make) { GAMES[id] = { id: id, name: name, blurb: blurb, kind: kind, make: make }; ORDER.push(id); }

  // ------------------------------------------------------------------ 1. Base Match (match-3)
  reg('base-match', 'Base Match', 'Swap neighbouring bases to line up three or more and fill the sequencing meter.', 'sequence', function (ctx) {
    var L = ctx.level, R = L <= 2 ? 6 : 7, C = R, rng = ctx.rng;
    var moves = [16, 16, 15, 15, 14][L - 1], target = [36, 42, 48, 54, 58][L - 1], left = moves, meter = 0, busy = false, sel = null, hintTimer = null;
    ctx.setHow('Swap two neighbouring bases (drag or tap, tap) to line up 3 or more of the same. Four in a row makes a primer piece that wipes its whole row.');
    ctx.setGoal('Sequence ' + target + ' bases in ' + moves + ' moves.');
    ctx.stat('moves', 'Moves', left); ctx.bar(0, '0 / ' + target);
    var board = h('div.mg-b3', { style: '--cs:min(58px,calc((100vw - 36px)/' + C + '),calc((100dvh - 330px)/' + R + '));--n:' + C + ';--m:' + R });
    ctx.el.appendChild(board);
    var g = new Array(R * C), cs = 1;
    function newTile(b, i, r0) {
      var t = { b: b, sp: 0, el: h('div.mg-t.b-' + b, { html: bsvg(b) }) };
      t.el.style.setProperty('--r', r0 != null ? r0 : Math.floor(i / C)); t.el.style.setProperty('--c', i % C); board.appendChild(t.el); return t;
    }
    function setPos(t, i) { t.el.style.setProperty('--r', Math.floor(i / C)); t.el.style.setProperty('--c', i % C); }
    function genGrid() {
      for (var tries = 0; tries < 200; tries++) {
        var a = [];
        for (var i = 0; i < R * C; i++) {
          var r = Math.floor(i / C), c = i % C, ok = [];
          BASES.forEach(function (b) {
            if (c >= 2 && a[i - 1] === b && a[i - 2] === b) return;
            if (r >= 2 && a[i - C] === b && a[i - 2 * C] === b) return; ok.push(b);
          });
          a.push(rng.pick(ok));
        }
        var tmp = a.map(function (b) { return { b: b, sp: 0 }; });
        if (hasMoveIn(tmp)) return a;
      }
      return a;
    }
    function runsIn(gr) {
      var res = [], r, c, e, b;
      for (r = 0; r < R; r++) for (c = 0; c < C;) { b = gr[r * C + c].b; e = c + 1; while (e < C && gr[r * C + e].b === b) e++; if (e - c >= 3) { var a = []; for (var k = c; k < e; k++) a.push(r * C + k); res.push(a); } c = e; }
      for (c = 0; c < C; c++) for (r = 0; r < R;) { b = gr[r * C + c].b; e = r + 1; while (e < R && gr[e * C + c].b === b) e++; if (e - r >= 3) { var a2 = []; for (var k2 = r; k2 < e; k2++) a2.push(k2 * C + c); res.push(a2); } r = e; }
      return res;
    }
    function swapIn(gr, i, j) { var t = gr[i]; gr[i] = gr[j]; gr[j] = t; }
    function hasMoveIn(gr) {
      for (var i = 0; i < R * C; i++) {
        var r = Math.floor(i / C), c = i % C;
        if (c < C - 1) { swapIn(gr, i, i + 1); var m = runsIn(gr).length; swapIn(gr, i, i + 1); if (m) return true; }
        if (r < R - 1) { swapIn(gr, i, i + C); var m2 = runsIn(gr).length; swapIn(gr, i, i + C); if (m2) return true; }
      }
      return false;
    }
    function plan(sw) {
      var rs = runsIn(g); if (!rs.length) return null;
      var clear = {}, spawn = [];
      rs.forEach(function (run) {
        run.forEach(function (i) { clear[i] = 1; });
        if (run.length >= 4) { var s = null; if (sw) run.forEach(function (i) { if (sw.indexOf(i) >= 0) s = i; }); if (s == null) s = run[Math.floor(run.length / 2)]; spawn.push(s); }
      });
      var q = Object.keys(clear).map(Number), qi = 0;
      while (qi < q.length) {
        var i = q[qi++];
        if (g[i].sp) { var row = Math.floor(i / C); for (var c = 0; c < C; c++) { var j = row * C + c; if (!clear[j]) { clear[j] = 1; q.push(j); } } }
      }
      spawn.forEach(function (s) { delete clear[s]; });
      return { clear: Object.keys(clear).map(Number), spawn: spawn };
    }
    function evalMove(a, b) {
      swapIn(g, a, b); var p = plan([a, b]), v = 0;
      if (p) { v = p.clear.length + p.spawn.length * 4; }
      swapIn(g, a, b); return v;
    }
    function bestMove() {
      var best = null, bv = 0;
      for (var i = 0; i < R * C; i++) {
        var r = Math.floor(i / C), c = i % C, cand = [];
        if (c < C - 1) cand.push(i + 1); if (r < R - 1) cand.push(i + C);
        cand.forEach(function (j) { var v = evalMove(i, j); if (v > bv) { bv = v; best = [i, j]; } });
      }
      return best;
    }
    function fill() {
      var a = genGrid();
      for (var i = 0; i < R * C; i++) { if (g[i]) g[i].el.remove(); g[i] = newTile(a[i], i); }
    }
    function armHint() {
      clearHint(); if (ctx.fast()) return;
      hintTimer = ctx.later(function () { if (busy || ctx.done()) return; var m = bestMove(); if (m) { g[m[0]].el.classList.add('hint'); g[m[1]].el.classList.add('hint'); } }, 7000);
    }
    function clearHint() { if (hintTimer != null) clearTimeout(hintTimer); hintTimer = null; g.forEach(function (t) { if (t) t.el.classList.remove('hint'); }); }
    function select(i) { if (sel != null && g[sel]) g[sel].el.classList.remove('sel'); sel = i; if (i != null && g[i]) g[i].el.classList.add('sel'); }
    function adj(i, j) { var d = Math.abs(i - j); return (d === C) || (d === 1 && Math.floor(i / C) === Math.floor(j / C)); }
    function trySwap(i, j) {
      if (busy || ctx.done() || !g[i] || !g[j] || !adj(i, j)) return false;
      busy = true; select(null); clearHint();
      swapIn(g, i, j); setPos(g[i], i); setPos(g[j], j);
      if (!runsIn(g).length) {
        snd('bad');
        ctx.later(function () { swapIn(g, i, j); setPos(g[i], i); setPos(g[j], j); ctx.later(function () { busy = false; armHint(); }, 180); }, 180);
        return false;
      }
      left--; ctx.stat('moves', 'Moves', left);
      ctx.later(function () { resolve([i, j], 0); }, 190);
      return true;
    }
    function resolve(sw, chain) {
      var p = plan(sw);
      if (!p) { endTurn(); return; }
      meter += p.clear.length; ctx.bar(Math.min(1, meter / target), Math.min(meter, target) + ' / ' + target);
      snd(chain > 0 ? 'cash' : 'click'); if (chain > 1) snd('good');
      p.clear.forEach(function (i) { var t = g[i]; t.el.classList.add('pop'); g[i] = null; ctx.later(function () { t.el.remove(); }, 260); });
      p.spawn.forEach(function (i) { g[i].sp = 1; g[i].el.classList.add('sp'); });
      if (p.spawn.length) snd('build');
      ctx.later(function () {
        for (var c = 0; c < C; c++) {
          var w = R - 1, r;
          for (r = R - 1; r >= 0; r--) { var i = r * C + c; if (g[i]) { if (w !== r) { g[w * C + c] = g[i]; g[i] = null; setPos(g[w * C + c], w * C + c); } w--; } }
          var k = w + 1;
          for (r = w; r >= 0; r--) g[r * C + c] = newTile(rng.base(), r * C + c, r - k - 0.5);
        }
        void board.offsetWidth;
        for (var i2 = 0; i2 < R * C; i2++) setPos(g[i2], i2);
        ctx.later(function () { resolve(null, chain + 1); }, 300);
      }, 250);
    }
    function endTurn() {
      if (meter >= target) { busy = true; snd('fanfare'); ctx.finish(true, 0.6 + 0.4 * Math.min(1, left / (moves * 0.35)), 'Sequencing meter full with ' + left + ' move' + (left === 1 ? '' : 's') + ' to spare.'); return; }
      if (left <= 0) { busy = true; ctx.finish(false, 0.5 * meter / target, 'Out of moves with the meter at ' + Math.round(100 * meter / target) + '%.'); return; }
      if (!hasMoveIn(g)) {
        var a = genGrid(); g.forEach(function (t, i) { t.sp = 0; t.el.classList.remove('sp'); t.b = a[i]; t.el.className = 'mg-t b-' + a[i]; t.el.innerHTML = bsvg(a[i]); });
      }
      busy = false; armHint();
    }
    // input
    var down = null;
    function cellAt(e) {
      var rc0 = board.getBoundingClientRect(); cs = rc0.width / C;
      var c = Math.floor((e.clientX - rc0.left) / cs), r = Math.floor((e.clientY - rc0.top) / cs);
      return (r < 0 || c < 0 || r >= R || c >= C) ? -1 : r * C + c;
    }
    board.addEventListener('pointerdown', function (e) {
      e.preventDefault(); var i = cellAt(e); if (i < 0 || busy) return;
      try { board.setPointerCapture(e.pointerId); } catch (x) { }
      if (sel != null && adj(sel, i)) { var s = sel; down = { consumed: true }; trySwap(s, i); return; }
      if (sel === i) { select(null); down = { consumed: true }; return; }
      select(i); down = { i: i, x: e.clientX, y: e.clientY, consumed: false };
    });
    board.addEventListener('pointermove', function (e) {
      if (!down || down.consumed || busy) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d < cs * 0.35) return;
      var r = Math.floor(down.i / C), c = down.i % C;
      if (Math.abs(dx) > Math.abs(dy)) c += dx > 0 ? 1 : -1; else r += dy > 0 ? 1 : -1;
      down.consumed = true;
      if (r >= 0 && c >= 0 && r < R && c < C) trySwap(down.i, r * C + c);
    });
    function up() { down = null; }
    board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
    fill(); armHint();
    return {
      solve: function () {
        return new Promise(function (res) {
          (function tick() {
            if (ctx.done() || !ctx.alive()) return res();
            if (!busy) { var m = bestMove(); if (m) trySwap(m[0], m[1]); }
            setTimeout(tick, ctx.fast() ? 0 : 20);
          })();
        });
      },
      _test: { bestMove: bestMove, state: function () { return { meter: meter, left: left, busy: busy }; } }
    };
  });

  // ------------------------------------------------------------------ 2. Codon Cracker (code-breaker)
  function feedback(secret, guess) {
    var n = secret.length, res = [], cnt = {}, i;
    for (i = 0; i < n; i++) { res.push(0); if (guess[i] !== secret[i]) cnt[secret[i]] = (cnt[secret[i]] || 0) + 1; }
    for (i = 0; i < n; i++) { if (guess[i] === secret[i]) res[i] = 2; else if (cnt[guess[i]] > 0) { res[i] = 1; cnt[guess[i]]--; } }
    return res;
  }
  var CC_LEN = [4, 4, 5, 5, 6], CC_TRIES = [6, 6, 6, 7, 7];
  function ccSecret(rng, L) {
    var len = CC_LEN[L - 1];
    if (L === 1) return rng.shuffle(BASES).join('');
    return seqStr(rng, len);
  }
  function ccAll(len) { var out = ['']; for (var i = 0; i < len; i++) { var nx = []; out.forEach(function (s) { BASES.forEach(function (b) { nx.push(s + b); }); }); out = nx; } return out; }
  reg('codon-cracker', 'Codon Cracker', 'Deduce the hidden base sequence from tile feedback before you run out of tries.', 'sequence', function (ctx) {
    var L = ctx.level, len = CC_LEN[L - 1], tries = CC_TRIES[L - 1], secret = ccSecret(ctx.rng, L), row = 0, guess = [], rows = [], keyState = {}, hints = 0, hintPos = [], history = [];
    ctx.setHow('Type a sequence with the keypad. Ringed tick = right base, right place. Dashed swap arrows = right base, wrong place. Cross = not in the sequence.');
    ctx.setGoal('Crack the hidden ' + len + '-base sequence in ' + tries + ' tries.' + (L === 1 ? ' (Each base appears once.)' : ' (Bases can repeat.)'));
    ctx.stat('tries', 'Tries', tries);
    var grid = h('div.mg-cc', { style: '--ts:min(54px,calc((100vw - 60px)/' + len + '),calc((100dvh - 440px)/' + tries + '));--len:' + len });
    for (var r = 0; r < tries; r++) {
      var rowEl = h('div.mg-cc-r' + (r === 0 ? '.cur' : '')), tiles = [];
      for (var c = 0; c < len; c++) { var t = h('div.mg-cc-t'); tiles.push(t); rowEl.appendChild(t); }
      rows.push({ el: rowEl, tiles: tiles }); grid.appendChild(rowEl);
    }
    var hintBox = h('div.mg-note', { text: ' ' });
    var keys = {}, pad = h('div.mg-pad');
    BASES.forEach(function (b) { var k = h('button.mg-key', { html: bsvg(b), 'aria-label': b, on: { click: function () { press(b); } } }); keys[b] = k; pad.appendChild(k); });
    var bs = h('button.mg-key.wide', { html: 'Del', 'aria-label': 'Delete', on: { click: del } });
    var ent = h('button.mg-key.wide.go', { html: 'Check', 'aria-label': 'Check sequence', on: { click: submit } });
    var padRow2 = h('div.mg-pad', bs, ent);
    var hintBtn = h('button.btn.sm.alt', { text: 'Hint (-15%)', on: { click: hint } });
    ctx.el.appendChild(grid); ctx.el.appendChild(hintBox); ctx.el.appendChild(pad); ctx.el.appendChild(padRow2); ctx.el.appendChild(hintBtn);
    function draw() { rows[row].tiles.forEach(function (t, i) { t.innerHTML = guess[i] ? bsvg(guess[i]) : ''; t.classList.toggle('on', !!guess[i]); }); }
    function press(b) { if (ctx.done() || guess.length >= len) return; guess.push(b); snd('click'); draw(); }
    function del() { if (ctx.done() || !guess.length) return; guess.pop(); snd('click'); draw(); }
    function hint() {
      if (ctx.done() || hints >= 1) return;
      var free = []; for (var i = 0; i < len; i++) free.push(i);
      var p = ctx.rng.pick(free); hints++; hintPos.push(p); hintBtn.classList.add('dis');
      hintBox.innerHTML = 'Hint: base ' + (p + 1) + ' is ' + bsvg(secret[p], 'inl'); snd('good');
    }
    function submit() {
      if (ctx.done()) return;
      if (guess.length < len) { rows[row].el.classList.remove('shake'); void rows[row].el.offsetWidth; rows[row].el.classList.add('shake'); snd('bad'); return; }
      var fb = feedback(secret, guess), cr = rows[row];
      fb.forEach(function (f, i) {
        cr.tiles[i].classList.add('f' + f); cr.tiles[i].style.animationDelay = (i * 0.07) + 's';
        cr.tiles[i].insertAdjacentHTML('beforeend', '<i class="bd">' + (f === 2 ? '✓' : f === 1 ? '⇄' : '✕') + '</i>');
        var b = guess[i]; keyState[b] = Math.max(keyState[b] == null ? -1 : keyState[b], f); keys[b].className = 'mg-key k' + keyState[b];
      });
      cr.el.classList.remove('cur'); history.push(guess.join(''));
      var win = fb.every(function (f) { return f === 2; }); row++; ctx.stat('tries', 'Tries', tries - row); guess = [];
      if (win) { snd('fanfare'); ctx.finish(true, clamp(1 - 0.8 * (row - 1) / tries - 0.15 * hints, 0.3, 1), 'Cracked in ' + row + ' ' + (row === 1 ? 'try' : 'tries') + '.'); return; }
      snd('good');
      if (row >= tries) {
        ctx.finish(false, 0.2, 'The sequence was <span class="mg-seq">' + secret.split('').map(function (b) { return bsvg(b, 'inl'); }).join('') + '</span>');
        return;
      }
      rows[row].el.classList.add('cur'); draw();
    }
    return {
      key: function (e) {
        var k = e.key.toUpperCase();
        if (k.length === 1 && BASES.indexOf(k) >= 0 && !e.ctrlKey && !e.metaKey) { press(k); return true; }
        if (e.key === 'Backspace') { del(); return true; }
        if (e.key === 'Enter') { submit(); return true; }
        return false;
      },
      solve: function () {
        return new Promise(function (res) {
          var cand = ccAll(len).filter(function (s) { return L !== 1 || (new Set(s.split(''))).size === len; });
          (function step() {
            if (ctx.done() || !ctx.alive()) return res();
            var fbs = history.map(function (gs) { return { g: gs, f: feedback(secret, gs).join('') }; });
            cand = cand.filter(function (s) { return fbs.every(function (x) { return feedback(s, x.g).join('') === x.f; }); });
            var pick = cand[0]; for (var i = 0; i < pick.length; i++) keys[pick[i]].click();
            ent.click(); setTimeout(step, ctx.fast() ? 0 : 30);
          })();
        });
      },
      _test: { secret: secret, tries: tries, len: len }
    };
  });

  // ------------------------------------------------------------------ 3. Strand Link (connect pairs)
  function genPaths(n, rng) {
    function nb(i) { var r = Math.floor(i / n), c = i % n, o = []; if (r > 0) o.push(i - n); if (c > 0) o.push(i - 1); if (c < n - 1) o.push(i + 1); if (r < n - 1) o.push(i + n); return o; }
    var minL = 3, maxL = n <= 5 ? 6 : 8;
    for (var attempt = 0; attempt < 2000; attempt++) {
      var own = new Array(n * n).fill(-1), paths = [], ok = true;
      function freeN(i) { return nb(i).filter(function (j) { return own[j] < 0; }); }
      for (;;) {
        var best = -1, bf = 99, cnt = 0;
        for (var i = 0; i < n * n; i++) if (own[i] < 0) { var f = freeN(i).length + rng.next() * 0.9; if (f < bf) { bf = f; best = i; } cnt++; }
        if (best < 0) break;
        var cells = [best], pid = paths.length; own[best] = pid;
        var tl = rng.int(minL, maxL);
        while (cells.length < tl) {
          var tail = cells[cells.length - 1], cands = freeN(tail); if (!cands.length) break;
          var pickc; if (rng.next() < 0.75) { var mf = 99; cands.forEach(function (j) { var f2 = freeN(j).length + rng.next() * 0.9; if (f2 < mf) { mf = f2; pickc = j; } }); } else pickc = rng.pick(cands);
          cells.push(pickc); own[pickc] = pid;
        }
        paths.push(cells);
      }
      // merge any too-short path into a neighbour path end
      for (var pi = 0; pi < paths.length && ok; pi++) {
        if (paths[pi].length >= 3) continue;
        var merged = false, pc = paths[pi];
        for (var qi = 0; qi < paths.length && !merged; qi++) {
          if (qi === pi) continue; var q = paths[qi];
          var a = pc[0], b = pc[pc.length - 1];
          if (nb(q[q.length - 1]).indexOf(a) >= 0) { paths[qi] = q.concat(pc); merged = true; }
          else if (nb(q[q.length - 1]).indexOf(b) >= 0) { paths[qi] = q.concat(pc.slice().reverse()); merged = true; }
          else if (nb(q[0]).indexOf(a) >= 0) { paths[qi] = pc.slice().reverse().concat(q); merged = true; }
          else if (nb(q[0]).indexOf(b) >= 0) { paths[qi] = pc.concat(q); merged = true; }
        }
        if (!merged) ok = false; else { paths.splice(pi, 1); pi--; }
      }
      if (ok && paths.length >= 3) return paths;
    }
    return null;
  }
  reg('strand-link', 'Strand Link', 'Join each base to its complementary partner (A with T, C with G) with a strand that fills the board.', 'sequence', function (ctx) {
    var L = ctx.level, n = [5, 5, 6, 6, 7][L - 1], rng = ctx.rng, limit = [90, 100, 110, 120, 130][L - 1];
    var sol = genPaths(n, rng), ep = {}, own = new Array(n * n).fill(-1), paths = [], active = null, nextId = 1, over = false, t0 = performance.now(), pairs = sol.length;
    var kinds = []; for (var i = 0; i < sol.length; i++) kinds.push(i % 2 ? 'CG' : 'AT'); kinds = rng.shuffle(kinds);
    sol.forEach(function (cells, k) { var f = rng.next() < 0.5; ep[cells[0]] = kinds[k][f ? 0 : 1]; ep[cells[cells.length - 1]] = kinds[k][f ? 1 : 0]; });
    ctx.setHow('Press a base and drag to the matching partner (A-T or C-G). Strands cannot cross; drag over a strand to cut it. Back-track to undo.');
    ctx.setGoal('Link all ' + pairs + ' pairs and fill every square within ' + limit + ' seconds.');
    ctx.stat('links', 'Linked', '0/' + pairs); ctx.stat('fill', 'Filled', '0/' + n * n); ctx.stat('time', 'Time', limit + 's');
    var wrap = h('div.mg-sl', { style: '--cs:min(62px,calc((100vw - 36px)/' + n + '),calc((100dvh - 360px)/' + n + '));--n:' + n });
    for (var q = 0; q < n * n; q++) wrap.appendChild(h('div.mg-sl-c', { 'data-i': q }));
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 ' + n + ' ' + n); svg.setAttribute('class', 'mg-sl-svg'); wrap.appendChild(svg);
    var eps = {};
    Object.keys(ep).forEach(function (k) { var i = +k, e = h('div.mg-sl-e', { html: bsvg(ep[k]), style: '--r:' + Math.floor(i / n) + ';--c:' + (i % n) }); eps[i] = e; wrap.appendChild(e); });
    var legend = h('div.mg-leg', { html: bsvg('A', 'inl') + '<b>pairs with</b>' + bsvg('T', 'inl') + '<span class="sep"></span>' + bsvg('C', 'inl') + '<b>pairs with</b>' + bsvg('G', 'inl') });
    ctx.el.appendChild(wrap); ctx.el.appendChild(legend);
    var clearBtn = h('button.btn.sm.alt', { text: 'Clear board', on: { click: function () { if (over) return; paths.slice().forEach(resetPath); render(); } } }); ctx.el.appendChild(clearBtn);
    function pathOf(i) { return own[i] >= 0 ? byId(own[i]) : null; }
    function byId(id) { for (var k = 0; k < paths.length; k++) if (paths[k].id === id) return paths[k]; return null; }
    function resetPath(p) { p.cells.forEach(function (i) { own[i] = -1; }); paths.splice(paths.indexOf(p), 1); if (active === p) active = null; }
    function truncTo(p, k) { for (var j = k; j < p.cells.length; j++) own[p.cells[j]] = -1; p.cells.length = k; p.done = false; }
    function down(i) {
      if (over) return false;
      if (ep[i] != null) {
        var p = pathOf(i); if (p) resetPath(p);
        active = { id: nextId++, cells: [i], done: false, base: ep[i] }; paths.push(active); own[i] = active.id; snd('click'); render(); return true;
      }
      var p2 = pathOf(i);
      if (p2) { truncTo(p2, p2.cells.indexOf(i) + 1); active = p2; render(); return true; }
      return false;
    }
    function stepTo(p, qi) {
      var cells = p.cells, tail = cells[cells.length - 1];
      if (cells.length >= 2 && qi === cells[cells.length - 2]) { own[tail] = -1; cells.pop(); p.done = false; return true; }
      if (own[qi] === p.id) { truncTo(p, cells.indexOf(qi) + 1); return true; }
      if (ep[qi] != null) {
        if (qi !== cells[0] && COMP[p.base] === ep[qi]) {
          var o = pathOf(qi); if (o) resetPath(o);
          cells.push(qi); own[qi] = p.id; p.done = true; snd('good'); return 'done';
        }
        snd('bad'); return false;
      }
      var o2 = pathOf(qi); if (o2) { truncTo(o2, o2.cells.indexOf(qi)); snd('build'); }
      cells.push(qi); own[qi] = p.id; return true;
    }
    function moveTo(j) {
      if (!active || over || active.done) return;
      var guard = 0;
      while (active && !active.done && guard++ < 20) {
        var tail = active.cells[active.cells.length - 1]; if (tail === j) break;
        var tr = Math.floor(tail / n), tc = tail % n, jr = Math.floor(j / n), jc = j % n, dr = jr - tr, dc = jc - tc, nx;
        if (Math.abs(dr) >= Math.abs(dc)) nx = (tr + (dr > 0 ? 1 : -1)) * n + tc; else nx = tr * n + tc + (dc > 0 ? 1 : -1);
        var r = stepTo(active, nx); if (!r) break; if (r === 'done') break;
      }
      render();
    }
    function up() { active = null; check(); }
    function render() {
      var html = '', filled = 0, linked = 0;
      var cells = wrap.querySelectorAll('.mg-sl-c');
      for (var i = 0; i < n * n; i++) { var p = pathOf(i); cells[i].style.background = p ? rgba(COL[p.base], 0.22) : ''; if (p) filled++; }
      paths.forEach(function (p) {
        if (p.done) linked++;
        var pts = p.cells.map(function (i) { return (i % n + 0.5) + ',' + (Math.floor(i / n) + 0.5); }).join(' ');
        html += '<polyline points="' + pts + '" fill="none" stroke="' + COL[p.base] + '" stroke-width="0.34" stroke-linecap="round" stroke-linejoin="round" opacity="' + (p.done ? 1 : 0.8) + '"' + (p.done ? '' : ' stroke-dasharray="0.01 0.5"') + '/>';
      });
      svg.innerHTML = html;
      Object.keys(eps).forEach(function (k) { var p = pathOf(+k); eps[k].classList.toggle('ok', !!(p && p.done)); });
      ctx.stat('links', 'Linked', linked + '/' + pairs); ctx.stat('fill', 'Filled', filled + '/' + n * n);
      return { filled: filled, linked: linked };
    }
    function check() {
      var s = render();
      if (!over && s.linked === pairs && s.filled === n * n) {
        over = true; var left = Math.max(0, limit - (performance.now() - t0) / 1000);
        snd('fanfare'); ctx.finish(true, 0.6 + 0.4 * clamp(left / (limit * 0.5), 0, 1), 'Every base paired and the whole strand filled.');
      }
    }
    ctx.every(function () {
      if (over || ctx.done()) return; var left = limit - (performance.now() - t0) / 1000;
      ctx.stat('time', 'Time', Math.max(0, Math.ceil(left)) + 's', left < 15 ? 'warn' : '');
      if (left <= 0) { over = true; var s = render(); ctx.finish(false, 0.5 * (s.linked / pairs) * 0.8, 'Time ran out with ' + s.linked + ' of ' + pairs + ' pairs linked.'); }
    }, 250);
    function cellAt(e) {
      var r0 = wrap.getBoundingClientRect(), cs = r0.width / n, c = Math.floor((e.clientX - r0.left) / cs), r = Math.floor((e.clientY - r0.top) / cs);
      return (r < 0 || c < 0 || r >= n || c >= n) ? -1 : r * n + c;
    }
    wrap.addEventListener('pointerdown', function (e) { e.preventDefault(); var i = cellAt(e); if (i < 0) return; try { wrap.setPointerCapture(e.pointerId); } catch (x) { } down(i); });
    wrap.addEventListener('pointermove', function (e) { if (!active) return; var j = cellAt(e); if (j >= 0) moveTo(j); });
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
    render();
    return {
      solve: function () {
        return new Promise(function (res) {
          var qn = 0;
          (function next() {
            if (ctx.done() || !ctx.alive()) return res();
            if (qn >= sol.length) { return res(); }
            var cells = sol[qn++]; down(cells[0]); for (var k = 1; k < cells.length; k++) moveTo(cells[k]); up();
            setTimeout(next, ctx.fast() ? 0 : 150);
          })();
        });
      },
      _test: { sol: sol, ep: ep }
    };
  });

  // ------------------------------------------------------------------ 4. Fragment Fit (overlap assembly)
  function overlapLen(contig, frag) {
    for (var l = Math.min(frag.length - 1, contig.length); l >= 1; l--) if (contig.slice(contig.length - l) === frag.slice(0, l)) return l;
    return 0;
  }
  reg('fragment-fit', 'Fragment Fit', 'Assemble overlapping sequencing reads into one contig: pick the read whose start matches the strand end.', 'sequence', function (ctx) {
    var L = ctx.level, rng = ctx.rng, nfrag = [5, 6, 7, 8, 9][L - 1], k = [8, 8, 9, 9, 10][L - 1], minOv = [4, 4, 4, 3, 3][L - 1], ncand = [3, 3, 4, 4, 5][L - 1], maxMiss = [4, 3, 3, 3, 3][L - 1];
    var genome = '', starts = [0], i;
    for (i = 1; i < nfrag; i++) { var ov = rng.int(minOv, Math.min(k - 3, minOv + 2)); starts.push(starts[i - 1] + k - ov); }
    genome = seqStr(rng, starts[nfrag - 1] + k);
    var frags = starts.map(function (s) { return genome.slice(s, s + k); });
    var contig = frags[0], step = 1, miss = 0, busy = false, cands = [], over = false;
    ctx.setHow('Shotgun assembly: the next read must start with the same bases the strand ends with (at least ' + minOv + ' in a row). Tap the read that overlaps.');
    ctx.setGoal('Build the full contig from ' + nfrag + ' reads. ' + maxMiss + ' wrong picks and the run fails.');
    ctx.stat('reads', 'Reads', '1/' + nfrag); ctx.stat('miss', 'Misses', '0/' + maxMiss); ctx.bar(1 / nfrag, 'Contig ' + contig.length + ' bp');
    var strip = h('div.mg-ff-strip'), info = h('div.mg-note', { text: ' ' }), list = h('div.mg-ff-list');
    ctx.el.appendChild(h('div.mg-lbl', { text: 'Contig so far (tail glows)' })); ctx.el.appendChild(strip); ctx.el.appendChild(h('div.mg-lbl', { text: 'Reads on the bench' })); ctx.el.appendChild(list); ctx.el.appendChild(info);
    var cw = Math.min(24, Math.floor((ctx.el.clientWidth - 24) / (k + 2)));
    function seqEl(s, size, cls, ovl) {
      var d = h('div.mg-ff-seq' + (cls ? '.' + cls : ''), { style: '--sz:' + size + 'px' });
      for (var q = 0; q < s.length; q++) d.appendChild(h('span.mg-ff-b' + (ovl && q < ovl ? '.ov' : ''), { html: bsvg(s[q]) }));
      return d;
    }
    function drawStrip() {
      strip.innerHTML = ''; var show = Math.min(contig.length, 14), s = contig.slice(contig.length - show), q;
      if (show < contig.length) strip.appendChild(h('span.mg-ff-dots', { text: '…' }));
      for (q = 0; q < s.length; q++) strip.appendChild(h('span.mg-ff-b' + (q >= s.length - minOv ? '.tail' : ''), { html: bsvg(s[q]), style: '--sz:' + Math.min(24, cw + 2) + 'px' }));
    }
    function makeDecoy(real, contigNow) {
      for (var t = 0; t < 400; t++) {
        var d, mode = rng.int(0, 2);
        if (mode === 0) { d = real.split(''); var cnt = rng.int(1, 2); for (var z = 0; z < cnt; z++) { var p = rng.int(0, minOv + 1); var nb = rng.base(); d[p] = nb === d[p] ? COMP[nb] : nb; } d = d.join(''); }
        else if (mode === 1) { var shift = rng.int(1, 3); d = real.slice(shift) + seqStr(rng, shift); if (rng.next() < 0.5) d = seqStr(rng, shift) + real.slice(0, k - shift); }
        else d = seqStr(rng, k);
        if (overlapLen(contigNow, d) < minOv && d !== real) return d;
      }
      return seqStr(rng, k).replace(/./, 'A');
    }
    function present() {
      if (step >= nfrag) return;
      var real = frags[step], opts = [{ s: real, ok: true }], used = {}; used[real] = 1;
      while (opts.length < ncand) { var dd = makeDecoy(real, contig); if (used[dd] || overlapLen(contig, dd) >= minOv) continue; used[dd] = 1; opts.push({ s: dd, ok: false }); }
      cands = rng.shuffle(opts); list.innerHTML = '';
      cands.forEach(function (o, ci) {
        var b = h('button.mg-ff-read', { 'aria-label': 'Read ' + (ci + 1), on: { click: function () { pick(ci); } } }, seqEl(o.s, cw, '', minOv));
        o.btn = b; list.appendChild(b);
      });
      drawStrip();
    }
    function pick(ci) {
      if (busy || over || ctx.done()) return; var o = cands[ci]; busy = true;
      if (o.ok) {
        var ov = overlapLen(contig, o.s); o.btn.classList.add('good'); snd('good');
        info.textContent = 'Overlap of ' + ov + ' bases found. The strand grows by ' + (o.s.length - ov) + '.';
        ctx.later(function () {
          contig += o.s.slice(ov); step++; ctx.stat('reads', 'Reads', step + '/' + nfrag); ctx.bar(step / nfrag, 'Contig ' + contig.length + ' bp');
          if (step >= nfrag) { over = true; drawStrip(); list.innerHTML = ''; snd('fanfare'); ctx.finish(true, clamp(1 - 0.25 * miss, 0.4, 1), 'Contig of ' + contig.length + ' bp assembled with ' + miss + ' miss' + (miss === 1 ? '' : 'es') + '.'); return; }
          busy = false; present();
        }, 650);
      } else {
        miss++; ctx.stat('miss', 'Misses', miss + '/' + maxMiss); o.btn.classList.add('bad'); snd('bad');
        info.textContent = 'Only ' + overlapLen(contig, o.s) + ' base' + (overlapLen(contig, o.s) === 1 ? '' : 's') + ' match the end of the strand; ' + minOv + ' are needed.';
        if (miss >= maxMiss) { over = true; ctx.finish(false, 0.4 * step / nfrag, 'Too many bad joins: only ' + step + ' of ' + nfrag + ' reads were assembled.'); return; }
        ctx.later(function () { busy = false; }, 350);
      }
    }
    present();
    return {
      solve: function () {
        return new Promise(function (res) {
          (function tick() {
            if (ctx.done() || !ctx.alive()) return res();
            if (!busy) { for (var q = 0; q < cands.length; q++) if (overlapLen(contig, cands[q].s) >= minOv) { cands[q].btn.click(); break; } }
            setTimeout(tick, ctx.fast() ? 0 : 40);
          })();
        });
      },
      _test: { genome: genome }
    };
  });

  // ------------------------------------------------------------------ 5. Helix Memory (own invention: memory pairs, complementary)
  reg('helix-memory', 'Helix Memory', 'Turn over cards to find complementary pairs: A with T, C with G.', 'sequence', function (ctx) {
    var L = ctx.level, rng = ctx.rng, pairs = [6, 8, 10, 12, 15][L - 1], cols = [4, 4, 4, 4, 5][L - 1], limit = [16, 18, 22, 26, 32][L - 1];
    var rows = Math.ceil(pairs * 2 / cols), deck = [], i;
    for (i = 0; i < pairs; i++) { var kk = i % 2 ? 'CG' : 'AT', f = rng.next() < 0.5; deck.push(kk[f ? 0 : 1], kk[f ? 1 : 0]); }
    deck = rng.shuffle(deck);
    var cards = [], open = [], matched = 0, turns = 0, busy = false, seen = {}, over = false;
    ctx.setHow('Tap two cards to turn them over. If they are complementary bases (A-T or C-G) they stay face up.');
    ctx.setGoal('Match all ' + pairs + ' pairs in ' + limit + ' turns or fewer.');
    ctx.stat('turns', 'Turns', limit); ctx.stat('pairs', 'Pairs', '0/' + pairs);
    var grid = h('div.mg-hm', { style: '--cs:min(66px,calc((100vw - 44px)/' + cols + '),calc((100dvh - 340px)/' + rows + '));--cols:' + cols });
    deck.forEach(function (b, idx) {
      var el = h('button.mg-card2', { 'aria-label': 'Card ' + (idx + 1), on: { click: function () { flip(idx); } } },
        h('span.in', h('span.fr.bk', { html: '<svg viewBox="0 0 40 40" class="mgs"><path d="M12 4c0 10 16 12 16 32M28 4c0 10-16 12-16 32M14 12h12M13 20h14M14 28h12" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" opacity=".85"/></svg>' }), h('span.fr.ft', { html: bsvg(b) })));
      cards.push({ b: b, el: el, up: false, done: false }); grid.appendChild(el);
    });
    ctx.el.appendChild(grid);
    ctx.el.appendChild(h('div.mg-leg', { html: bsvg('A', 'inl') + '<b>pairs with</b>' + bsvg('T', 'inl') + '<span class="sep"></span>' + bsvg('C', 'inl') + '<b>pairs with</b>' + bsvg('G', 'inl') }));
    function flip(idx) {
      var c = cards[idx]; if (busy || over || ctx.done() || c.up || c.done) return;
      c.up = true; c.el.classList.add('up'); seen[idx] = c.b; open.push(idx); snd('click');
      if (open.length === 2) {
        busy = true; turns++; ctx.stat('turns', 'Turns', Math.max(0, limit - turns));
        var a = cards[open[0]], b = cards[open[1]];
        if (COMP[a.b] === b.b) {
          matched++; ctx.stat('pairs', 'Pairs', matched + '/' + pairs); snd('good');
          ctx.later(function () { a.done = b.done = true; a.el.classList.add('ok'); b.el.classList.add('ok'); open = []; busy = false; after(); }, 450);
        } else {
          snd('bad');
          ctx.later(function () { a.up = b.up = false; a.el.classList.remove('up'); b.el.classList.remove('up'); open = []; busy = false; after(); }, 750);
        }
      }
    }
    function after() {
      if (matched >= pairs) { over = true; snd('fanfare'); ctx.finish(true, clamp(0.5 + 0.5 * (limit - turns) / Math.max(1, limit - pairs), 0.5, 1), 'All ' + pairs + ' pairs matched in ' + turns + ' turns.'); }
      else if (turns >= limit) { over = true; ctx.finish(false, 0.4 * matched / pairs, 'Out of turns with ' + matched + ' of ' + pairs + ' pairs matched.'); }
    }
    return {
      solve: function () {
        return new Promise(function (res) {
          (function tick() {
            if (ctx.done() || !ctx.alive()) return res();
            if (!busy && open.length === 0) {
              var known = []; cards.forEach(function (c, ix) { if (seen[ix] != null && !c.done) known.push(ix); });
              var pa = null; for (var x = 0; x < known.length && !pa; x++) for (var y = x + 1; y < known.length; y++) if (COMP[cards[known[x]].b] === cards[known[y]].b) { pa = [known[x], known[y]]; break; }
              if (pa) { flip(pa[0]); flip(pa[1]); }
              else {
                var unseen = []; cards.forEach(function (c, ix) { if (seen[ix] == null) unseen.push(ix); });
                var f1 = unseen[0]; flip(f1);
                var mate = null; known.forEach(function (ix) { if (COMP[cards[ix].b] === cards[f1].b) mate = ix; });
                flip(mate != null ? mate : unseen[1]);
              }
            }
            setTimeout(tick, ctx.fast() ? 0 : 30);
          })();
        });
      },
      _test: {}
    };
  });

  // ------------------------------------------------------------------ 6. Gene Splice (cut + ligate)
  reg('gene-splice', 'Gene Splice', 'Cut the vector at its restriction sites, then fit each donor gene into its gap before the ligase times out.', 'splice', function (ctx) {
    var L = ctx.level, rng = ctx.rng, S = 30, DEF = [{ id: 'g1', name: 'Gene A', colour: '#3f8fb5' }, { id: 'g2', name: 'Gene B', colour: '#c4553a' }, { id: 'g3', name: 'Gene C', colour: '#8cc152' }];
    var nmax = [1, 2, 2, 3, 3][L - 1], genes = (ctx.opts.genes && ctx.opts.genes.length ? ctx.opts.genes : DEF).slice(0, nmax), n = genes.length, ovl = L <= 3 ? 2 : 3;
    var speed = [7, 8.500, 10, 11.500, 13][L - 1], tol = [2.300, 1.900, 1.600, 1.300, 1.100][L - 1], missMax = [5, 4, 4, 3, 3][L - 1], tlimit = 18 + 14 * n + (5 - L) * 3;
    var MOTIF = 'GAATTC', sitesP = n === 1 ? [rng.int(10, 14)] : n === 2 ? [rng.int(3, 5), rng.int(18, 21)] : [2 + rng.int(0, 1), 12 + rng.int(0, 1), 22 + rng.int(0, 1)];
    var seq = seqStr(rng, S).split('');
    sitesP.forEach(function (p) { for (var q = 0; q < 6; q++) seq[p + q] = MOTIF[q]; });
    var cutX = sitesP.map(function (p) { return p + 1; });
    var cut = cutX.map(function () { return false; }), phase = 1, misses = 0, prec = [], wrong = 0, placed = 0, tStart = 0, over = false;
    ctx.setHow('Step 1: tap CUT when the blade sits on a marked restriction site. Step 2: tap a gene block to flip it, then drag it into the gap whose sticky ends are complementary (A-T, C-G).');
    ctx.setGoal('Cut ' + n + ' site' + (n > 1 ? 's' : '') + ', then ligate ' + n + ' gene' + (n > 1 ? 's' : '') + ' in the right orientation.');
    ctx.stat('cuts', 'Cuts', '0/' + n); ctx.stat('miss', 'Misses', '0/' + missMax);
    // genes and gaps
    var gaps = [], blocks = [];
    function fits(ends, gap) { return ends[0] === cmp(gap.l) && ends[1] === cmp(gap.r); }
    function gen() {
      for (var t = 0; t < 800; t++) {
        var gs = [], ok = true, j;
        for (j = 0; j < n; j++) gs.push({ l: seqStr(rng, ovl), r: seqStr(rng, ovl) });
        for (j = 0; j < n && ok; j++) {
          var f = [cmp(gs[j].l), cmp(gs[j].r)], fl = [rc(f[1]), rc(f[0])];
          if (fits(fl, gs[j])) ok = false;
          for (var k2 = 0; k2 < n && ok; k2++) if (k2 !== j && (fits(f, gs[k2]) || fits(fl, gs[k2]))) ok = false;
        }
        if (ok) return gs;
      }
      return gs;
    }
    var gs = gen();
    gaps = gs.map(function (g, j) { return { l: g.l, r: g.r, filled: false, el: null, drop: null }; });
    blocks = genes.map(function (gn, j) { return { gene: gn, idx: j, ends: [cmp(gs[j].l), cmp(gs[j].r)], fl: false, placed: false, el: null }; });
    var order = rng.shuffle(blocks.map(function (b, i) { return i; }));
    // ---- phase 1
    var cw = Math.max(8, Math.min(16, Math.floor((ctx.el.clientWidth - 10) / S)));
    var strand = h('div.mg-gs-strand', { style: '--cw:' + cw + 'px;width:' + (cw * S) + 'px' }), cutter = h('div.mg-gs-cutter', h('i')), top = h('div.mg-gs-row'), bot = h('div.mg-gs-row.bot');
    seq.forEach(function (b) { top.appendChild(h('span.mg-gs-b.b-' + b, { text: b })); bot.appendChild(h('span.mg-gs-b.b-' + COMP[b], { text: COMP[b] })); });
    strand.appendChild(top); strand.appendChild(bot);
    sitesP.forEach(function (p, i) { strand.appendChild(h('div.mg-gs-site', { style: 'left:' + (p * cw) + 'px;width:' + (6 * cw) + 'px', 'data-i': i }, h('span', { text: 'cut here' }))); });
    strand.appendChild(cutter);
    var cutBtn = h('button.mg-cutbtn', { html: UI.ic('close') + ' CUT', 'aria-label': 'Cut', on: { pointerdown: function (e) { e.preventDefault(); pressCut(); } } });
    var msg = h('div.mg-note', { text: 'Wait for the blade to cross a marked site.' });
    var p1 = h('div.mg-gs-p1', h('div.mg-lbl', { text: 'Donor vector (restriction sites: ' + MOTIF + ')' }), strand, msg, cutBtn);
    ctx.el.appendChild(p1);
    var bx = 1, t0 = performance.now();
    function xAt(ms) { var T = (S - 2) * 2, u = ((ms / 1000) * speed) % T; return 1 + (u <= S - 2 ? u : T - u); }
    function curX() { return bx; }
    function frame() {
      if (phase !== 1 || ctx.done()) return; bx = xAt(performance.now() - t0); cutter.style.transform = 'translateX(' + (bx * cw - 1) + 'px)';
      var near = false; cutX.forEach(function (x, i) { if (!cut[i] && Math.abs(bx - x) <= tol) near = true; }); cutter.classList.toggle('hot', near);
    }
    ctx.raf(frame);
    function pressCut() {
      if (phase !== 1 || over || ctx.done()) return; var x = bx, bi = -1, bd = 99;
      cutX.forEach(function (cx, i) { if (!cut[i] && Math.abs(x - cx) < bd) { bd = Math.abs(x - cx); bi = i; } });
      if (bi >= 0 && bd <= tol) {
        cut[bi] = true; prec.push(1 - bd / tol); snd('build'); strand.querySelector('.mg-gs-site[data-i="' + bi + '"]').classList.add('done');
        var cnt = cut.filter(Boolean).length; ctx.stat('cuts', 'Cuts', cnt + '/' + n); msg.textContent = 'Clean cut! ' + Math.round(100 * (1 - bd / tol)) + '% precision.';
        if (cnt === n) { phase = 1.5; ctx.later(startPhase2, 700); }
      } else {
        misses++; ctx.stat('miss', 'Misses', misses + '/' + missMax); snd('bad'); msg.textContent = 'Off target! Wait until the blade glows on a site.';
        strand.classList.remove('shake'); void strand.offsetWidth; strand.classList.add('shake');
        if (misses >= missMax) { over = true; phase = 9; ctx.finish(false, 0.1, 'Too many off-target cuts: the vector was shredded.'); }
      }
    }
    // ---- phase 2
    var tray, slotsEl, ghost = null;
    function endsEl(s, cls) { var d = h('span.mg-ends' + (cls ? '.' + cls : '')); for (var q = 0; q < s.length; q++) d.appendChild(h('span', { html: bsvg(s[q]) })); return d; }
    function curEnds(b) { return b.fl ? [rc(b.ends[1]), rc(b.ends[0])] : b.ends; }
    function blockEl(b) {
      var e = curEnds(b), g = b.gene, dark = luma(g.colour) < 0.62;
      var body = h('span.mg-body', { style: 'background:' + g.colour + ';color:' + (dark ? '#fff' : '#2a1d10') }, h('b', { text: (b.fl ? '◀ ' : '') + String(g.name).slice(0, 14) + (b.fl ? '' : ' ▶') }));
      var el = h('div.mg-blk' + (b.placed ? '.gone' : ''), { 'data-i': b.idx }, endsEl(e[0]), body, endsEl(e[1]));
      return el;
    }
    function drawTray() {
      tray.innerHTML = '';
      order.forEach(function (bi) {
        var b = blocks[bi]; if (b.placed) return; var el = blockEl(b); b.el = el; tray.appendChild(el);
        var st = null;
        el.addEventListener('pointerdown', function (e) {
          e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) { }
          st = { x: e.clientX, y: e.clientY, drag: false };
        });
        el.addEventListener('pointermove', function (e) {
          if (!st) return; var dx = e.clientX - st.x, dy = e.clientY - st.y;
          if (!st.drag && Math.abs(dx) + Math.abs(dy) > 7) { st.drag = true; ghost = blockEl(b); ghost.classList.add('ghost'); ctx.root().appendChild(ghost); el.classList.add('lift'); }
          if (st.drag) { ghost.style.left = (e.clientX - 60) + 'px'; ghost.style.top = (e.clientY - 28) + 'px'; }
        });
        function end(e) {
          if (!st) return; var s2 = st; st = null;
          if (s2.drag) {
            if (ghost) { ghost.remove(); ghost = null; }
            var hit = -1; gaps.forEach(function (g, gi) { if (g.filled) return; var r = g.drop.getBoundingClientRect(); if (e.clientX > r.left - 22 && e.clientX < r.right + 22 && e.clientY > r.top - 22 && e.clientY < r.bottom + 22) hit = gi; });
            if (hit >= 0) drop(bi, hit); else { el.classList.remove('lift'); }
          } else flip(bi);
        }
        el.addEventListener('pointerup', end); el.addEventListener('pointercancel', function () { st = null; if (ghost) { ghost.remove(); ghost = null; } el.classList.remove('lift'); });
      });
    }
    function flip(bi) { var b = blocks[bi]; if (phase !== 2 || b.placed || over || ctx.done()) return; b.fl = !b.fl; snd('click'); drawTray(); }
    function drop(bi, gi) {
      if (phase !== 2 || over || ctx.done()) return false; var b = blocks[bi], g = gaps[gi]; if (b.placed || g.filled) return false;
      if (fits(curEnds(b), g)) {
        b.placed = true; g.filled = true; placed++; snd('good'); fillGap(g, b); drawTray();
        msg2.textContent = 'Ligated! Sticky ends joined.';
        if (placed === n) {
          over = true; var tl = Math.max(0, tlimit - (performance.now() - tStart) / 1000);
          var cutS = 0.5 + 0.5 * (prec.reduce(function (a, v) { return a + v; }, 0) / prec.length) - 0.1 * misses, ligS = n / (n + wrong), timeS = Math.min(1, tl / tlimit * 1.5);
          snd('fanfare'); ctx.finish(true, clamp(0.4 * clamp(cutS, 0.2, 1) + 0.4 * ligS + 0.2 * timeS, 0, 1), 'Recombinant plasmid complete. ' + wrong + ' mismatched attempt' + (wrong === 1 ? '' : 's') + '.');
        }
        return true;
      }
      wrong++; snd('bad'); msg2.textContent = 'The sticky ends do not match. Check each end pairs A-T and C-G, and try flipping the block.';
      g.drop.classList.remove('shake'); void g.drop.offsetWidth; g.drop.classList.add('shake'); drawTray(); return false;
    }
    function fillGap(g, b) {
      var gn = b.gene; g.drop.classList.add('full'); g.drop.style.background = gn.colour; g.drop.innerHTML = '<b>' + String(gn.name).slice(0, 14) + '</b>';
      g.drop.style.color = luma(gn.colour) < 0.62 ? '#fff' : '#2a1d10';
      if (g.strip) { g.strip.style.background = gn.colour; g.strip.classList.add('full'); }
    }
    var msg2, timerFill;
    function startPhase2() {
      phase = 2; tStart = performance.now(); p1.remove();
      var sw = Math.max(5, Math.floor((ctx.el.clientWidth - 16 - n * 26) / S)), stripEl = h('div.mg-gs-strip');
      var cuts = cutX.slice().sort(function (a, b) { return a - b; }), ci = 0;
      for (var q = 0; q < S; q++) {
        while (ci < cuts.length && cuts[ci] === q) { var gp = h('span.mg-gs-gap', { text: String(ci + 1) }); gaps[ci].strip = gp; stripEl.appendChild(gp); ci++; }
        stripEl.appendChild(h('span.mg-gs-sb.b-' + seq[q], { style: 'width:' + sw + 'px' }));
      }
      slotsEl = h('div.mg-gs-slots');
      gaps.forEach(function (g, gi) {
        g.drop = h('div.mg-drop', { text: 'Gap ' + (gi + 1) });
        slotsEl.appendChild(h('div.mg-slot', h('span.mg-sl-n', { text: String(gi + 1) }), endsEl(g.l, 'req'), g.drop, endsEl(g.r, 'req')));
      });
      tray = h('div.mg-tray'); msg2 = h('div.mg-note', { text: 'Tap a block to flip it. Drag it into the gap whose ends pair with its ends.' });
      timerFill = h('i'); var tb = h('div.mg-meter.t', timerFill);
      ctx.el.appendChild(h('div.mg-gs-p2', h('div.mg-lbl', { text: 'Cut vector (gaps numbered)' }), stripEl, h('div.mg-lbl', { text: 'Sticky ends the gene must pair with' }), slotsEl, h('div.mg-lbl', { text: 'Donor genes' }), tray, msg2, h('div.mg-lbl', { text: 'Ligase timer' }), tb));
      ctx.stat('lig', 'Ligase', tlimit + 's'); ctx.stat('genes', 'Genes', '0/' + n);
      drawTray();
      ctx.every(function () {
        if (over || ctx.done()) return; var tl = tlimit - (performance.now() - tStart) / 1000; timerFill.style.width = clamp(tl / tlimit, 0, 1) * 100 + '%';
        ctx.stat('lig', 'Ligase', Math.max(0, Math.ceil(tl)) + 's', tl < 8 ? 'warn' : ''); ctx.stat('genes', 'Genes', placed + '/' + n);
        if (tl <= 0) { over = true; ctx.finish(false, 0.35 * placed / n, 'The ligase timed out with ' + placed + ' of ' + n + ' genes joined.'); }
      }, 200);
    }
    return {
      solve: function () {
        return new Promise(function (res) {
          var gi = 0;
          (function tick() {
            if (ctx.done() || !ctx.alive()) return res();
            if (phase === 1) { var bxn = bx; cutX.forEach(function (x, i) { if (!cut[i] && Math.abs(bxn - x) <= tol * 0.35) pressCut(); }); }
            else if (phase === 2 && gi < n) {
              var b = blocks[gi]; if (fits(curEnds(b), gaps[gi])) { drop(gi, gi); gi++; } else flip(gi);
            }
            setTimeout(tick, 8);
          })();
        });
      },
      _test: { gaps: gaps, blocks: blocks, sites: cutX }
    };
  });

  // =================================================================== SHELL
  M.list = ORDER.map(function (id) { var g = GAMES[id]; return { id: id, name: g.name, blurb: g.blurb, kind: g.kind }; });
  M.isOpen = function () { return !!cur; };

  function onKey(e) {
    if (!cur) return;
    if (e.type === 'keydown') {
      if (e.key === 'Escape') { e.preventDefault(); quitTap(); }
      else if (cur.inst && cur.inst.key && !cur.finished && cur.inst.key(e)) e.preventDefault();
    }
    e.stopImmediatePropagation(); e.stopPropagation();
  }

  function open(o) {
    o = o || {}; if (cur) return false;
    var id = o.game, rng0 = mkRng(o.seed != null ? (o.seed | 0) + 17 : (Date.now() ^ Math.floor(Math.random() * 1e9)));
    if (!id || id === 'random-sequence') { var seqs = ORDER.filter(function (k) { return GAMES[k].kind === 'sequence'; }); id = seqs[Math.floor(rng0.next() * seqs.length)]; }
    var G = GAMES[id]; if (!G) return false;
    var level = clamp(Math.round(+o.level || 1), 1, 5), seed = o.seed != null ? (o.seed | 0) : (Math.floor(Math.random() * 2147483647));
    var me = cur = { gen: 0, id: id, G: G, opts: o, level: level, seed: seed, finished: false, called: false, result: null, timers: [], rafId: 0, inst: null, quitArm: 0, prevSpeed: null };
    var S = Z.state;
    if (S && Z.Sim && Z.Sim.setSpeed) { me.prevSpeed = S.speed; if (S.speed !== 0) Z.Sim.setSpeed(0); }
    var stats = {}, statEl = h('div.mg-stats'), bar = h('div.mg-meter', h('i'), h('span')), barWrap = h('div.mg-barwrap', bar), stage = h('div.mg-stage'), howEl = h('div.mg-how'), goalEl = h('div.mg-goal');
    var title = o.title || G.name, sub = o.subtitle || (o.species ? 'Subject: ' + o.species : G.blurb);
    var quit = h('button.btn.sm.alt.mg-x', { html: UI.ic('close') + '<span>Quit</span>', 'aria-label': 'Quit puzzle', on: { click: quitTap } });
    me.quitBtn = quit;
    var card = h('div.mg-card', h('div.mg-head', h('div.mg-ttl', h('b', { text: title }), h('small', { text: sub })), h('span.mg-lv', { text: 'Level ' + level }), quit), howEl, goalEl, statEl, barWrap, stage);
    var root = me.root = h('div.mg', { role: 'dialog', 'aria-label': title }, card);
    barWrap.style.display = 'none';
    document.body.appendChild(root);
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
    function build() {
      stage.innerHTML = ''; statEl.innerHTML = ''; stats = {}; barWrap.style.display = 'none';
      var gen = ++me.gen, rng = mkRng(me.seed * 2654435761 + level * 977 + 5);
      var ctx = {
        level: level, opts: o, rng: rng, el: stage, root: function () { return root; },
        fast: function () { return FAST; }, alive: function () { return cur === me && me.gen === gen; }, done: function () { return me.finished; },
        setHow: function (t) { howEl.textContent = t; }, setGoal: function (t) { goalEl.innerHTML = '<b>Goal</b> ' + t; },
        stat: function (k, label, val, cls) {
          var s = stats[k]; if (!s) { s = stats[k] = { el: h('span.mg-chip', h('em', { text: label }), h('b')) }; statEl.appendChild(s.el); }
          s.el.lastChild.textContent = val; s.el.classList.toggle('warn', cls === 'warn');
        },
        bar: function (f, txt) { barWrap.style.display = ''; bar.firstChild.style.width = clamp(f, 0, 1) * 100 + '%'; bar.lastChild.textContent = txt || ''; },
        later: function (fn, ms) { var t = setTimeout(function () { if (cur === me && me.gen === gen) fn(); }, FAST ? 0 : ms); me.timers.push(t); return t; },
        every: function (fn, ms) { var t = setInterval(function () { if (cur === me && me.gen === gen) fn(); }, ms); me.timers.push(t); return t; },
        raf: function (fn) { (function loop() { if (cur !== me || me.gen !== gen) return; try { fn(); } catch (e) { console.error(e); } me.rafId = requestAnimationFrame(loop); })(); },
        finish: function (won, score, msg) {
          if (me.finished) return; me.finished = true; score = +score || 0; score = clamp(score, 0, 1);
          var stars = !won ? 0 : score >= 0.85 ? 3 : score >= 0.65 ? 2 : 1;
          me.result = { won: !!won, score: Math.round(score * 1000) / 1000, stars: stars, game: id };
          me.timers.push(setTimeout(function () { if (cur === me) showResult(msg); }, FAST ? 0 : 800));
        }
      };
      me.ctx = ctx; me.inst = G.make(ctx);
    }
    function showResult(msg) {
      var r = me.result, st = h('div.mg-stars');
      for (var i = 0; i < 3; i++) st.appendChild(h('span' + (i < r.stars ? '.on' : ''), { text: '★', style: 'animation-delay:' + (0.15 * i) + 's' }));
      var btns = [];
      if (o.retry && !r.won) btns.push(h('button.btn.alt', { text: 'Try again', on: { click: function () { me.finished = false; me.result = null; me.seed = (me.seed + 1) | 0; resBox.remove(); me.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); me.timers = []; build(); } } }));
      btns.push(h('button.btn.gold.mg-cont', { text: 'Continue', on: { click: function () { closeNow(true); } } }));
      var resBox = h('div.mg-res', h('div.mg-rbox', h('h3', { text: r.won ? (r.stars === 3 ? 'Excellent work!' : 'Puzzle solved!') : 'Not this time' }), st,
        h('div.mg-score', { text: 'Score ' + Math.round(r.score * 100) + '%' }), h('p', { html: msg || '' }), h('div.mg-rbtns', btns)));
      me.resBox = resBox; card.appendChild(resBox); snd(r.won ? 'good' : 'bad');
    }
    me.build = build; build();
    return true;
  }
  function quitTap() {
    if (!cur || cur.finished) return;
    var me = cur, b = me.quitBtn, now = performance.now();
    if (me.quitArm && now - me.quitArm < 2600) { me.result = { won: false, score: 0, stars: 0, game: me.id, quit: true }; closeNow(true); return; }
    me.quitArm = now; b.classList.add('warn'); b.querySelector('span').textContent = 'Tap again to quit';
    setTimeout(function () { if (cur === me && !me.finished) { me.quitArm = 0; b.classList.remove('warn'); b.querySelector('span').textContent = 'Quit'; } }, 2700);
  }
  function closeNow(callDone) {
    var me = cur; if (!me) return; cur = null;
    me.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); if (me.rafId) cancelAnimationFrame(me.rafId);
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
    document.querySelectorAll('.mg-blk.ghost').forEach(function (e) { e.remove(); });
    me.root.remove();
    if (me.prevSpeed != null && Z.state && Z.state.speed === 0 && Z.Sim && Z.Sim.setSpeed) Z.Sim.setSpeed(me.prevSpeed);
    if (callDone && !me.called) {
      me.called = true; var r = me.result || { won: false, score: 0, stars: 0, game: me.id };
      if (typeof me.opts.onDone === 'function') { try { me.opts.onDone({ won: r.won, score: r.score, stars: r.stars, game: r.game }); } catch (e) { console.error('minigame onDone error', e); } }
    }
  }
  M.open = open;

  // =================================================================== debug menu + test hooks
  M.debugMenu = function () {
    if (dbg) return; var last = h('div.mg-note', { text: 'Pick a game and level.' });
    var rows = M.list.map(function (g) {
      var lv = h('span.mg-dlv'); for (var l = 1; l <= 5; l++) (function (l) { lv.appendChild(h('button.btn.sm.alt', { text: String(l), 'data-g': g.id, 'data-l': l, on: { click: function () { open({ game: g.id, level: l, retry: true, species: 'Debug subject', genes: [{ id: 'a', name: 'Gene A', colour: '#3f8fb5' }, { id: 'b', name: 'Gene B', colour: '#c4553a' }, { id: 'c', name: 'Gene C', colour: '#8cc152' }], onDone: function (r) { last.textContent = 'Last: ' + g.name + ' L' + l + ' won=' + r.won + ' score=' + r.score + ' stars=' + r.stars; } }); } } })); })(l);
      return h('div.mg-drow', h('div', h('b', { text: g.name }), h('small', { text: g.blurb + ' [' + g.kind + ']' })), lv);
    });
    dbg = h('div.mg.mg-dbg', h('div.mg-card', h('div.mg-head', h('div.mg-ttl', h('b', { text: 'Minigames' }), h('small', { text: 'Debug launcher' })), h('button.btn.sm.alt', { text: 'Close', on: { click: function () { dbg.remove(); dbg = null; } } })), last, h('div.mg-stage.mg-dlist', rows)));
    dbg.style.zIndex = 39; document.body.appendChild(dbg);
  };
  M._setFast = function (v) { FAST = !!v; };
  M._logic = { feedback: feedback, ccAll: ccAll, genPaths: genPaths, overlapLen: overlapLen, mkRng: mkRng, CC_LEN: CC_LEN, CC_TRIES: CC_TRIES, ccSecret: ccSecret };
  M._solve = function () {
    var me = cur; if (!me || !me.inst || !me.inst.solve) return Promise.resolve(null);
    return me.inst.solve().then(function () {
      return new Promise(function (res) {
        (function w() {
          if (cur !== me) return res(me.result);
          if (me.finished && me.resBox && me.resBox.parentNode) { var b = me.resBox.querySelector('.mg-cont'); b.click(); return res(me.result); }
          setTimeout(w, 20);
        })();
      });
    });
  };
  M._state = function () { return cur ? { id: cur.id, level: cur.level, finished: cur.finished, result: cur.result, test: cur.inst && cur.inst._test } : null; };

  // =================================================================== CSS
  var css = [
    '.mg{position:fixed;inset:0;z-index:40;background:rgba(14,26,16,.88);display:flex;align-items:center;justify-content:center;touch-action:none;font-family:var(--sans);color:var(--ink);animation:mgin .2s ease-out}',
    '@keyframes mgin{from{opacity:0}to{opacity:1}}',
    '.mg-card{position:relative;width:100%;max-width:520px;height:100%;display:flex;flex-direction:column;gap:7px;padding:calc(9px + var(--sat)) 12px calc(9px + var(--sab));background:var(--paper);overflow:hidden}',
    '@media(min-width:700px){.mg-card{height:min(calc(100% - 24px),860px);border:3px solid var(--ink);border-radius:20px;box-shadow:var(--shadow)}}',
    '.mg-head{display:flex;align-items:center;gap:8px}',
    '.mg-ttl{flex:1;min-width:0;display:flex;flex-direction:column}.mg-ttl b{font:700 20px/1.1 var(--serif);color:var(--moss3)}',
    '.mg-ttl small{font-size:11.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mg-lv{font:700 11px var(--sans);background:var(--moss);color:var(--paper);border-radius:9px;padding:3px 8px;text-transform:uppercase;letter-spacing:.4px}',
    '.mg-x svg{width:1.1em;height:1.1em}.mg-x.warn{background:var(--terra);color:#fff;box-shadow:0 3px 0 #8f3722;border-color:transparent}',
    '.mg-how{font-size:12.5px;line-height:1.35;color:var(--ink2);background:var(--paper2);border-radius:10px;padding:6px 9px}',
    '.mg-goal{font-size:13.5px;color:var(--ink)}.mg-goal b{color:var(--terra);text-transform:uppercase;font-size:11px;letter-spacing:.5px;margin-right:4px}',
    '.mg-stats{display:flex;gap:6px;flex-wrap:wrap;min-height:28px}',
    '.mg-chip{display:inline-flex;align-items:baseline;gap:5px;background:#fff8e4;border:2px solid rgba(58,42,26,.35);border-radius:10px;padding:2px 9px;font-variant-numeric:tabular-nums}',
    '.mg-chip em{font:600 11px var(--sans);color:var(--ink3);font-style:normal;text-transform:uppercase}.mg-chip b{font:700 15px var(--sans)}.mg-chip.warn{background:#f6d4cb;border-color:var(--bad);color:var(--bad)}',
    '.mg-meter{position:relative;height:20px;border-radius:10px;background:var(--paper3);border:2px solid var(--ink);overflow:hidden}',
    '.mg-meter i{display:block;height:100%;width:0;background:linear-gradient(180deg,#8cc152,#2f9a4f);transition:width .3s}',
    '.mg-meter span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 11px var(--sans);color:var(--ink);text-shadow:0 0 3px #fff8e4,0 0 3px #fff8e4}',
    '.mg-meter.t{width:100%}.mg-meter.t i{background:linear-gradient(180deg,#f0b332,#c4553a)}',
    '.mg-stage{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;overflow:hidden}',
    '.mgs{width:100%;height:100%;display:block}.mgs.inl{display:inline-block;width:22px;height:22px;vertical-align:middle}',
    '.mg-note{min-height:18px;font-size:12.5px;color:var(--ink2);text-align:center;max-width:94%}.mg-note .mgs.inl{width:20px;height:20px}',
    '.mg-lbl{font:700 10.5px var(--sans);text-transform:uppercase;letter-spacing:.6px;color:var(--ink3);align-self:flex-start}',
    '.mg-leg{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink2)}.mg-leg b{font-weight:600}.mg-leg .sep{width:14px}',
    '.mg-seq{display:inline-flex;gap:3px;vertical-align:middle}',
    // base match
    '.mg-b3{position:relative;width:calc(var(--cs)*var(--n));height:calc(var(--cs)*var(--m));background:var(--paper2);border:3px solid var(--ink);border-radius:12px;box-sizing:content-box;overflow:hidden;touch-action:none}',
    '.mg-t{position:absolute;left:0;top:0;width:var(--cs);height:var(--cs);padding:calc(var(--cs)*.06);transform:translate(calc(var(--c)*var(--cs)),calc(var(--r)*var(--cs)));transition:transform .2s ease-in-out;pointer-events:none}',
    '.mg-t.sel{filter:drop-shadow(0 0 5px #fff) drop-shadow(0 0 3px var(--ink));z-index:2;animation:mgpulse .6s infinite alternate}',
    '.mg-t.hint{animation:mgpulse .5s infinite alternate;z-index:2}',
    '.mg-t.sp::before{content:"";position:absolute;inset:2px;border:3px solid #fff;border-radius:10px;box-shadow:0 0 8px 2px #fff8c0,inset 0 0 6px #fff8c0;animation:mgglow 1s infinite alternate}',
    '.mg-t.sp::after{content:"\\21C4";position:absolute;right:-1px;top:-3px;font:900 calc(var(--cs)*.34)/1 var(--sans);color:#fff;text-shadow:0 0 3px #000,0 0 3px #000}',
    '.mg-t.pop{animation:mgpop .26s ease-out forwards}',
    '@keyframes mgpop{to{transform:translate(calc(var(--c)*var(--cs)),calc(var(--r)*var(--cs))) scale(1.4);opacity:0}}',
    '@keyframes mgpulse{from{transform:translate(calc(var(--c)*var(--cs)),calc(var(--r)*var(--cs))) scale(1)}to{transform:translate(calc(var(--c)*var(--cs)),calc(var(--r)*var(--cs))) scale(1.12)}}',
    '@keyframes mgglow{from{opacity:.55}to{opacity:1}}',
    // codon cracker
    '.mg-cc{display:flex;flex-direction:column;gap:5px}.mg-cc-r{display:flex;gap:5px;justify-content:center}.mg-cc-r.cur .mg-cc-t{border-color:var(--ink)}',
    '.mg-cc-t{position:relative;width:var(--ts);height:var(--ts);border:2px solid rgba(58,42,26,.3);border-radius:9px;background:#fff8e4;padding:2px}',
    '.mg-cc-t.on{animation:mgpoppy .12s}@keyframes mgpoppy{from{transform:scale(.8)}to{transform:scale(1)}}',
    '.mg-cc-t.f2{border:4px solid #1b6b36;background:#cdeec0;animation:mgflip .35s both}.mg-cc-t.f1{border:3px dashed #8a5a00;background:#fbe7b0;animation:mgflip .35s both}.mg-cc-t.f0{background:#d8cfbc;opacity:.78;animation:mgflip .35s both}',
    '.mg-cc-t.f0 .mgs{opacity:.55}',
    '@keyframes mgflip{0%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}',
    '.mg-cc-t .bd{position:absolute;right:-5px;top:-7px;min-width:16px;height:16px;border-radius:9px;background:var(--ink);color:#fff;font:700 11px/16px var(--sans);text-align:center;font-style:normal;padding:0 2px}',
    '.mg-cc-t.f2 .bd{background:#1b6b36}.mg-cc-t.f1 .bd{background:#8a5a00}.mg-cc-t.f0 .bd{background:#6b6050}',
    '.mg-cc-r.shake,.shake{animation:mgshake .35s}@keyframes mgshake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}',
    '.mg-pad{display:flex;gap:7px;justify-content:center}',
    '.mg-key{width:62px;height:54px;border-radius:12px;background:var(--paper2);border:2px solid rgba(58,42,26,.45);box-shadow:0 3px 0 var(--paper3);padding:6px;font:700 14px var(--sans);color:var(--ink);touch-action:manipulation}',
    '.mg-key:active{transform:translateY(2px);box-shadow:none}.mg-key.wide{width:96px;padding:0}.mg-key.go{background:var(--moss);color:var(--paper);border-color:var(--moss3);box-shadow:0 3px 0 var(--moss3)}',
    '.mg-key.k2{background:#cdeec0;border-color:#1b6b36}.mg-key.k1{background:#fbe7b0;border-color:#8a5a00}.mg-key.k0{opacity:.45}',
    // strand link
    '.mg-sl{position:relative;display:grid;grid-template-columns:repeat(var(--n),var(--cs));grid-auto-rows:var(--cs);border:3px solid var(--ink);border-radius:10px;background:#fff8e4;touch-action:none;box-sizing:content-box;overflow:hidden}',
    '.mg-sl-c{border:1px solid rgba(58,42,26,.18);pointer-events:none}',
    '.mg-sl-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
    '.mg-sl-e{position:absolute;left:0;top:0;width:var(--cs);height:var(--cs);padding:calc(var(--cs)*.1);transform:translate(calc(var(--c)*var(--cs)),calc(var(--r)*var(--cs)));pointer-events:none}',
    '.mg-sl-e.ok .mgs{filter:drop-shadow(0 0 4px #fff) drop-shadow(0 0 2px #1b6b36)}',
    // fragment fit
    '.mg-ff-strip{display:flex;justify-content:flex-end;align-items:center;gap:1px;width:100%;max-width:440px;min-height:34px;padding:5px 6px;background:var(--paper2);border:2px solid var(--ink);border-radius:10px;overflow:hidden}',
    '.mg-ff-b{display:inline-block;width:var(--sz,22px);height:var(--sz,22px);flex:none;padding:1px;border-radius:5px}.mg-ff-b.tail{background:#fff4b8;box-shadow:0 0 0 2px #f0b332}.mg-ff-b.ov{background:#fff4b8;box-shadow:0 0 0 1.500px #f0b332}',
    '.mg-ff-dots{font:700 18px var(--sans);color:var(--ink3);margin-right:3px}',
    '.mg-ff-list{display:flex;flex-direction:column;gap:7px;align-items:center;width:100%}',
    '.mg-ff-read{background:#fff8e4;border:2px solid rgba(58,42,26,.5);border-radius:11px;padding:5px 6px;box-shadow:0 3px 0 var(--paper3);touch-action:manipulation}',
    '.mg-ff-read:active{transform:translateY(2px)}.mg-ff-seq{display:flex;gap:1px}.mg-ff-seq .mg-ff-b{width:var(--sz);height:var(--sz)}',
    '.mg-ff-read.good{background:#cdeec0;border-color:#1b6b36;animation:mgpoppy .2s}.mg-ff-read.bad{background:#f6d4cb;border-color:var(--bad);animation:mgshake .35s}',
    // helix memory
    '.mg-hm{display:grid;grid-template-columns:repeat(var(--cols),var(--cs));gap:7px}',
    '.mg-card2{width:var(--cs);height:var(--cs);padding:0;perspective:400px;touch-action:manipulation}.mg-card2 .in{display:block;position:relative;width:100%;height:100%;transition:transform .3s;transform-style:preserve-3d}',
    '.mg-card2.up .in{transform:rotateY(180deg)}.mg-card2 .fr{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:10px;border:2px solid var(--ink);padding:4px}',
    '.mg-card2 .bk{background:linear-gradient(135deg,var(--moss2),var(--moss3))}.mg-card2 .ft{background:#fff8e4;transform:rotateY(180deg)}.mg-card2.ok .ft{background:#cdeec0;border-color:#1b6b36}.mg-card2.ok{opacity:.9}',
    // gene splice
    '.mg-gs-p1,.mg-gs-p2{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}',
    '.mg-gs-strand{position:relative;padding:20px 0 18px;margin:6px 0}.mg-gs-row{display:flex}.mg-gs-row.bot{margin-top:5px;opacity:.85}',
    '.mg-gs-b{width:var(--cw);height:calc(var(--cw) + 5px);font:700 calc(var(--cw)*.78)/calc(var(--cw) + 5px) var(--sans);text-align:center;color:#fff;text-shadow:0 0 2px rgba(0,0,0,.8),0 0 2px rgba(0,0,0,.8)}',
    '.mg-gs-b.b-A,.mg-gs-sb.b-A{background:#009E73}.mg-gs-b.b-T,.mg-gs-sb.b-T{background:#D55E00}.mg-gs-b.b-C,.mg-gs-sb.b-C{background:#0072B2}.mg-gs-b.b-G,.mg-gs-sb.b-G{background:#E6A100}',
    '.mg-gs-site{position:absolute;top:11px;bottom:8px;border:2px dashed var(--ink);border-radius:5px;pointer-events:none}',
    '.mg-gs-site span{position:absolute;left:50%;top:-18px;transform:translateX(-50%);font:700 10px var(--sans);white-space:nowrap;background:var(--ink);color:var(--paper);padding:1px 5px;border-radius:5px}',
    '.mg-gs-site.done{border-color:#1b6b36;background:rgba(47,154,79,.25)}.mg-gs-site.done span{background:#1b6b36}',
    '.mg-gs-cutter{position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--ink);will-change:transform;pointer-events:none}',
    '.mg-gs-cutter i{position:absolute;left:-7px;top:-4px;border:8.500px solid transparent;border-top:12px solid var(--ink);border-bottom:0}',
    '.mg-gs-cutter.hot{background:var(--bad);box-shadow:0 0 8px 2px #ff9b8a}.mg-gs-cutter.hot i{border-top-color:var(--bad)}',
    '.mg-cutbtn{width:min(86%,300px);height:64px;border-radius:16px;background:var(--terra);color:#fff;font:800 24px var(--sans);letter-spacing:2px;box-shadow:0 5px 0 #8f3722;touch-action:manipulation}.mg-cutbtn:active{transform:translateY(3px);box-shadow:0 2px 0 #8f3722}.mg-cutbtn svg{width:1em;height:1em}',
    '.mg-gs-strip{display:flex;align-items:center;gap:0;height:18px;background:var(--paper2);padding:2px;border-radius:5px;border:2px solid var(--ink)}',
    '.mg-gs-sb{height:12px;flex:none}.mg-gs-gap{flex:none;width:22px;height:18px;margin:0 3px;border:2px dashed var(--ink);border-radius:4px;font:700 10px/14px var(--sans);text-align:center;background:#fff8e4}.mg-gs-gap.full{border-style:solid;color:transparent}',
    '.mg-gs-slots{display:flex;flex-direction:column;gap:7px;width:100%;align-items:center}',
    '.mg-slot{display:flex;align-items:center;gap:6px}.mg-sl-n{width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--paper);font:700 12px/22px var(--sans);text-align:center}',
    '.mg-ends{display:inline-flex;gap:1px}.mg-ends span{display:block;width:22px;height:22px}.mg-ends.req{background:#fff4b8;padding:2px;border-radius:7px;box-shadow:0 0 0 2px #f0b332}',
    '.mg-drop{width:140px;height:46px;border:3px dashed var(--ink3);border-radius:10px;display:flex;align-items:center;justify-content:center;font:600 12px var(--sans);color:var(--ink3);background:rgba(255,248,228,.7)}.mg-drop.full{border-style:solid;border-color:var(--ink);font-size:13px}',
    '.mg-tray{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;min-height:44px}',
    '.mg-blk{display:inline-flex;align-items:center;gap:3px;padding:3px;border-radius:12px;background:#fff8e4;border:2px solid var(--ink);box-shadow:0 3px 0 var(--paper3);touch-action:none;cursor:grab}',
    '.mg-blk.lift{opacity:.35}.mg-blk.ghost{position:fixed;z-index:60;pointer-events:none;box-shadow:0 8px 18px rgba(0,0,0,.4);transform:scale(1.06)}',
    '.mg-body{display:inline-flex;align-items:center;justify-content:center;min-width:64px;height:34px;padding:0 8px;border-radius:7px;font:700 12px var(--sans);border:2px solid rgba(0,0,0,.4)}',
    // result
    '.mg-res{position:absolute;inset:0;background:rgba(25,18,10,.62);display:flex;align-items:center;justify-content:center;padding:20px;animation:mgin .25s}',
    '.mg-rbox{width:100%;max-width:330px;background:var(--paper);border:3px solid var(--ink);border-radius:20px;padding:16px 16px 14px;text-align:center;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:6px;align-items:center}',
    '.mg-rbox h3{margin:0;font:700 22px var(--serif);color:var(--moss3)}.mg-rbox p{margin:2px 0 4px;font-size:13.5px;color:var(--ink2);line-height:1.4}',
    '.mg-stars{display:flex;gap:6px;font-size:46px;line-height:1}.mg-stars span{color:var(--paper3);text-shadow:0 2px 0 rgba(58,42,26,.3)}.mg-stars span.on{color:#f0a410;animation:mgstar .5s both}',
    '@keyframes mgstar{0%{transform:scale(0) rotate(-40deg)}70%{transform:scale(1.3) rotate(8deg)}100%{transform:scale(1)}}',
    '.mg-score{font:700 15px var(--sans);color:var(--ink)}.mg-rbtns{display:flex;gap:8px;margin-top:4px}',
    // debug
    '.mg-dlist{justify-content:flex-start;align-items:stretch;overflow-y:auto;touch-action:pan-y}.mg-drow{display:flex;flex-direction:column;gap:5px;padding:7px 9px;background:var(--paper2);border-radius:10px}.mg-drow small{display:block;color:var(--ink2);font-size:11.5px}.mg-dlv{display:flex;gap:6px}.mg-dlv .btn{min-width:44px}'
  ].join('\n');
  var st = document.createElement('style'); st.setAttribute('data-mg', '1'); st.textContent = css; document.head.appendChild(st);
})();
