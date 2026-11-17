// ===== 53-screens.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - management screens (tabbed modal). */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, fmt = UI.fmt, D = Z.DATA;
  var Screens = UI.Screens = {}, el, tabEls = {}, curTab = null, tabUpdate = null, pausedBy = false, pressing = false, tick = 0;
  var TABS = [['ov', 'Overview', 'star'], ['res', 'Research', 'flask'], ['fin', 'Finances', 'coin'], ['ani', 'Dinosaurs', 'paw'], ['gst', 'Guests', 'guests'], ['stf', 'Staff', 'person'], ['goals', 'Goals', 'flag'], ['msg', 'Log', 'bell'], ['guide', 'Guide', 'leaf'], ['set', 'Settings', 'gear']];
  var BUILD = { res: function (b) { return UI.Research.build(b); }, ov: ovTab, fin: finTab, ani: aniTab, gst: gstTab, stf: stfTab, goals: goalsTab, msg: msgTab, set: setTab, guide: function (b) { return UI.Guide && UI.Guide.build ? UI.Guide.build(b) : null; } };

  Screens.init = function () {
    el = UI.el; var m = el.modal; m.innerHTML = '';
    if (UI.extraTabs && !Screens._xt) { Screens._xt = 1; UI.extraTabs.forEach(function (x) { var at = -1; TABS.forEach(function (t, k) { if (t[0] === (x.before || 'guide')) at = k; }); TABS.splice(at < 0 ? TABS.length : at, 0, [x.id, x.name, x.icon]); BUILD[x.id] = x.build; }); }   // power / news packages add tabs
    var tabs = h('div#mtabs');
    TABS.forEach(function (t) { var b = h('button', { html: ic(t[2]) + '<span>' + t[1] + '</span>', 'data-t': t[0], on: { click: function () { UI.snd('click'); Screens.open(t[0]); } } }); tabEls[t[0]] = b; tabs.appendChild(b); });
    el.mbody = h('div#mbody');
    var box = h('div#mbox', h('div#mhead', tabs, h('button#mclose', { html: ic('close'), 'aria-label': 'Close', on: { click: function () { UI.snd('click'); UI.closeModal(); } } })), el.mbody);
    m.appendChild(box);
    m.addEventListener('pointerdown', function (e) { if (e.target === m) UI.closeModal(); else pressing = true; });
    window.addEventListener('pointerup', function () { pressing = false; }); window.addEventListener('pointercancel', function () { pressing = false; });
  };
  UI.modalOpen = function () { return el && el.modal.classList.contains('on'); };
  UI.openModal = function (tab) {
    var S = Z.state;
    if (!UI.modalOpen()) { if (S.speed > 0) { UI.lastSpeed = S.speed; Z.Sim.setSpeed(0); pausedBy = true; } else pausedBy = false; }
    if (UI.Panel) UI.Panel.closeSheet();
    el.modal.classList.add('on'); UI.unread = 0; Screens.open(tab || 'ov');
  };
  UI.closeModal = function () {
    if (!UI.modalOpen()) return;
    el.modal.classList.remove('on'); curTab = null; tabUpdate = null; el.mbody.innerHTML = '';
    if (pausedBy && Z.state.speed === 0 && !Z.state.gameOver) Z.Sim.setSpeed(UI.lastSpeed || 1); pausedBy = false;
  };
  Screens.open = function (t) {
    curTab = t; for (var k in tabEls) tabEls[k].classList.toggle('on', k === t);
    el.mbody.innerHTML = ''; el.mbody.scrollTop = 0; tabUpdate = BUILD[t](el.mbody) || null;
    var b = tabEls[t]; if (b && b.scrollIntoView) { try { b.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { } }
    if (UI.Tutorial) UI.Tutorial.onModal && UI.Tutorial.onModal(t);
  };
  Screens.update = function () {
    if (!UI.modalOpen() || !tabUpdate) return;
    tick++; if (tick % 4 !== 0 || pressing) return;
    var sc = el.mbody.scrollTop; tabUpdate(); el.mbody.scrollTop = sc;
  };
  function bar(frac, label) { var f = UI.clamp(frac, 0, 1); return h('div.bar' + (f > 0.6 ? '' : f > 0.35 ? '.mid' : '.low'), h('i', { style: 'width:' + Math.round(f * 100) + '%' })); }
  function box(title) { var b = h('div.box'); if (title) b.appendChild(h('h4', { text: title })); for (var i = 1; i < arguments.length; i++) if (arguments[i]) b.appendChild(arguments[i]); return b; }
  function starRow(r, size) {
    var d = h('div', { style: 'display:flex;gap:2px;font-size:' + (size || 30) + 'px;line-height:1' });
    for (var i = 0; i < 5; i++) d.appendChild(h('span.star', { text: '★', style: '--f:' + Math.round(UI.clamp(r - i, 0, 1) * 100) + '%;font-size:inherit' }));
    return d;
  }
  function jump(kind, id, x, z) {
    UI.closeModal(); if (isFinite(x) && isFinite(z)) Z.World.focus(x, z, Math.min(Z.World.cam.dist, 30));
    if (UI.tool) UI.Tools.cancel(); UI.Panel.open(kind, id);
  }

  // ------------------------------------------------------------------ overview
  function ovTab(b) {
    var S = Z.state, top = h('div.box'), starsHolder = h('div'), ratingTxt = h('div.big'), sub = h('div', { style: 'font-size:13px;color:var(--ink2)' });
    top.appendChild(h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, h('div', starsHolder, sub), ratingTxt));
    var openBtn = h('button.btn.sm', { on: { click: function () { Z.Sim.setOpen(!Z.state.open); UI.snd('click'); upd(); } } });
    top.appendChild(h('div.btnrow', openBtn));
    var parts = h('div.box'), tips = { animals: 'More species, rarer dinosaurs and higher genome quality.', welfare: 'Happy, healthy dinosaurs: read the enclosure reports.', guests: 'Keep guests fed, watered, amused and not charged too much.', facilities: 'Food, drinks, toilets, benches and bins to match the crowds.', cleanliness: 'Cleaners sweep paths; rangers clean enclosures.', scenery: 'Trees, flowers, fountains and statues.' };
    var names = { animals: 'Dinosaur collection (35%)', welfare: 'Dinosaur welfare (17%)', guests: 'Guest happiness (18%)', facilities: 'Facilities (12%)', cleanliness: 'Cleanliness (10%)', scenery: 'Scenery (8%)' };
    parts.appendChild(h('h4', { text: 'How your rating is made' })); var rows = {};
    Object.keys(names).forEach(function (k) { var bb = bar(0), tip = h('div', { style: 'font-size:11.5px;color:var(--ink3);display:none' }), v = h('b.num'); var r = h('div', { style: 'display:flex;flex-direction:column;gap:3px' }, h('div.kv', h('span', { text: names[k] }), v), bb, tip); rows[k] = { bb: bb, v: v, tip: tip }; parts.appendChild(r); });
    var next = h('div.box'), stats = h('div.box');
    b.appendChild(top); b.appendChild(parts); b.appendChild(next); b.appendChild(stats);
    function upd() {
      var S2 = Z.state, rb = Z.Sim.ratingBreakdown();
      starsHolder.innerHTML = ''; starsHolder.appendChild(starRow(S2.rating, 32)); ratingTxt.textContent = S2.rating.toFixed(1);
      sub.textContent = 'Park rating - ' + S2.unlocked.star + '-star unlocks active';
      var mp = S2.map && D.maps && UI.byId(D.maps, S2.map.id), df = S2.difficulty && D.difficulties && UI.byId(D.difficulties, S2.difficulty);
      if (mp || df) sub.textContent += ' - ' + [mp && mp.name, df && df.name].filter(function (x) { return x; }).join(', ');
      openBtn.innerHTML = ic(S2.open ? 'lock' : 'play') + (S2.open ? 'Close the park to visitors' : 'Open the park to visitors'); openBtn.className = 'btn sm ' + (S2.open ? 'alt' : '');
      var low = null; Object.keys(rows).forEach(function (k) { var v = rb[k]; setBar(rows[k].bb, v); rows[k].v.textContent = Math.round(v * 100) + '%'; if (!low || v < rb[low]) low = k; });
      Object.keys(rows).forEach(function (k) { rows[k].tip.style.display = (k === low && rb[k] < 0.8) ? 'block' : 'none'; rows[k].tip.textContent = 'Tip: ' + tips[k]; });
      var ns = Math.floor(S2.rating) + 1, ul = [];
      D.buildings.forEach(function (a) { if (a.star === ns) ul.push(a.name); });
      next.innerHTML = ''; next.appendChild(h('h4', { text: ns <= 5 ? 'At ' + ns + ' stars you unlock' : 'You have unlocked everything' }));
      if (ns <= 5) next.appendChild(h('div.chips', ul.length ? ul.map(function (n) { return h('span.chip', { text: n }); }) : [h('span.chip', { text: 'Bragging rights' })]));
      var sp = {}; S2.animals.forEach(function (a) { sp[a.species] = 1; });
      stats.innerHTML = ''; stats.appendChild(h('h4', { text: 'Your park' }));
      [['Day', S2.day], ['Dinosaurs', S2.animals.length + ' (' + Object.keys(sp).length + ' species)'], ['Species unlocked', Z.Sim.research.summary().unlockedSpecies + ' of 20'], ['Experiments', S2.research.stats.experiments], ['Hatched', S2.research.stats.hatched], ['Guests in the park', S2.guests.length], ['Guests so far', S2.stats.guestsTotal.toLocaleString('en-GB')], ['Babies born', S2.stats.babiesBorn], ['Staff', S2.staff.length]].forEach(function (r) { stats.appendChild(h('div.kv', h('span', { text: r[0] }), h('b', { text: String(r[1]) }))); });
    }
    upd(); return upd;
  }
  function setBar(b, frac) { var f = UI.clamp(frac, 0, 1); b.className = 'bar' + (f > 0.6 ? '' : f > 0.35 ? ' mid' : ' low'); b.firstChild.style.width = Math.round(f * 100) + '%'; }

  // ------------------------------------------------------------------ finances
  var CATN = { tickets: 'Tickets', food: 'Food & drink', shops: 'Shops & rides', donations: 'Donations & grants', research: 'Research (amber, reagents, labs)', animals: 'Hatchery (eggs, refunds, sales)', construction: 'Construction', upkeep: 'Dinosaur & building upkeep', wages: 'Wages', marketing: 'Marketing', interest: 'Loan interest', other: 'Loans, hiring & other' };
  function pctStr(r) { return (r * 100).toFixed(1) + '%'; }
  function finTab(b) {
    var S = Z.state, borrowAmt = 5000, loanSig = '';
    var cashBox = h('div.box'), table = h('table.tbl'), chart = h('canvas.chart'), loanBox = h('div.box'), ticketBox = h('div.box'), mkBox = h('div.box');
    b.appendChild(cashBox);
    b.appendChild(box('Today so far', table));
    b.appendChild(box('Last 30 days', chart, h('div', { style: 'font-size:11.5px;color:var(--ink3);display:flex;gap:12px;flex-wrap:wrap', html: '<span><b style="color:#3f9a4f">■</b> takings</span><span><b style="color:#c4553a">■</b> running costs</span><span><b style="color:#2f6a95">—</b> bank balance</span>' })));
    b.appendChild(ticketBox); b.appendChild(loanBox); b.appendChild(mkBox);
    // ticket slider (built once)
    var tv = h('b.num'), th = h('div', { style: 'font-size:12.5px;color:var(--ink2);line-height:1.35' });
    var ts = h('input', { type: 'range', min: '0', max: '40', step: '1', value: String(S.ticketPrice), 'aria-label': 'Ticket price' });
    function tsPaint() { ts.style.setProperty('--p', (ts.value / 40 * 100) + '%'); }
    ts.addEventListener('input', function () { Z.Sim.setTicketPrice(+ts.value); tsPaint(); tHint(); });
    ticketBox.appendChild(h('h4', { text: 'Ticket price' })); ticketBox.appendChild(h('div.kv', h('span', { text: 'Entry per guest' }), tv)); ticketBox.appendChild(ts); ticketBox.appendChild(th);
    function tHint() {
      var S2 = Z.state, rt = Z.Sim._rt(), val = rt && rt.value || 10, p = S2.ticketPrice, per = Z.Sim.arrivalRate() * Z.Sim.DAY_SECONDS * 0.5;
      tv.textContent = fmt(p);
      th.innerHTML = 'Guests think a visit is worth about <b>' + fmt(val) + '</b>. ' + (p <= val * 0.6 ? 'Great value: crowds will flock in, but each pays little.' : p <= val * 1.05 ? 'A fair price. Guests arrive happily.' : p <= val * 1.4 ? 'A bit steep. Fewer visitors, and some grumbling.' : 'Far too dear! Few will come and those who do will be unhappy.') + '<br>Expect roughly <b>' + Math.round(per) + '</b> visitors a day, about <b>' + fmt(per * p) + '</b> in tickets.';
    }
    ts.value = S.ticketPrice; tsPaint(); tHint();
    function upd() {
      var S2 = Z.state, f = S2.finance.today, hist = S2.finance.history;
      var ls = Z.Sim.loanSummary ? Z.Sim.loanSummary() : { total: S2.loan || 0, max: 100000, dailyInterest: 0, avgRate: 0, loans: [] };
      cashBox.innerHTML = ''; cashBox.appendChild(h('div.kv', h('span', { text: 'In the bank' }), h('b.big' + (S2.money < 0 ? '.neg' : ''), { text: fmt(S2.money) })));
      if (S2.loan) {
        cashBox.appendChild(h('div.kv', h('span', { text: 'Loan outstanding' }), h('b.neg', { text: fmt(S2.loan) })));
        cashBox.appendChild(h('div.kv', h('span', { text: 'Daily loan interest' }), h('b.neg', { text: fmt(ls.dailyInterest) + ' / day (' + pctStr(ls.avgRate) + ')' })));
      }
      if (hist.length) {
        var l = hist[hist.length - 1], intrNote = l.interest ? ' (incl. ' + fmt(Math.abs(l.interest)) + ' interest)' : '';
        cashBox.appendChild(h('div.kv', h('span', { text: 'Yesterday (day ' + l.day + ')' }), h('b' + (l.profit >= 0 ? '.pos' : '.neg'), { text: (l.profit >= 0 ? '+' : '') + fmt(l.profit) + ' profit' + intrNote })));
      }
      table.innerHTML = ''; var tot = 0;
      Object.keys(CATN).forEach(function (k) { var v = f[k] || 0; if (!v) return; tot += v; table.appendChild(h('tr', h('td', { text: CATN[k] }), h('td.r.num' + (v >= 0 ? '.pos' : '.neg'), { text: (v >= 0 ? '+' : '-') + fmt(Math.abs(v)).replace('-', '') }))); });
      if (!tot) table.appendChild(h('tr', h('td', { text: 'Nothing yet today.' }), h('td')));
      table.appendChild(h('tr', h('td', h('b', { text: 'Net' })), h('td.r.num', h('b' + (tot >= 0 ? '.pos' : '.neg'), { text: (tot >= 0 ? '+' : '-') + fmt(Math.abs(tot)).replace('-', '') }))));
      drawChart(chart, hist);

      var q = Z.Sim.loanQuote ? Z.Sim.loanQuote(borrowAmt) : { ok: true, amount: borrowAmt, rate: 0.01, dailyInterest: Math.round(borrowAmt * 0.01), factors: [] };
      var lkey = JSON.stringify([borrowAmt, S2.loan, Math.floor(S2.money / 100), ls.loans, q.rate, q.ok, hist.length]);
      if (lkey !== loanSig) {
        loanSig = lkey;
        loanBox.innerHTML = ''; loanBox.appendChild(h('h4', { text: 'Bank loans' }));
        loanBox.appendChild(h('div.kv', h('span', { text: 'Total owed (interest paid daily)' }), h('b.num' + (S2.loan ? '.neg' : ''), { text: fmt(S2.loan) })));
        if (S2.loan > 0) loanBox.appendChild(h('div.kv', h('span', { text: 'Interest due each day' }), h('b.neg', { text: fmt(ls.dailyInterest) + ' / day (' + pctStr(ls.avgRate) + ')' })));
        if (ls.loans.length) {
          ls.loans.forEach(function (ln) {
            loanBox.appendChild(h('div.kv', { style: 'padding:4px 0;border-top:1px solid rgba(58,42,26,.1);align-items:center' },
              h('span', { html: '<b>' + fmt(ln.principal) + '</b> at <b>' + pctStr(ln.rate) + '/day</b><br><small style="color:var(--ink2)">' + fmt(ln.dailyInterest) + '/day · taken day ' + ln.takenDay + '</small>' }),
              h('button.btn.sm.alt', { text: 'Repay', on: { click: function () { var r = Z.Sim.repayLoan(ln.principal, { loanId: ln.id }); if (!r.ok) UI.toast(r.msg, 'bad'); UI.snd(r.ok ? 'click' : 'bad'); loanSig = ''; upd(); } } })));
          });
          var repRow = h('div.btnrow', { style: 'margin-top:6px' });
          repRow.appendChild(h('button.btn.sm.alt', { text: 'Repay £1,000', on: { click: function () { var r = Z.Sim.repayLoan(1000); if (!r.ok) UI.toast(r.msg, 'bad'); UI.snd(r.ok ? 'click' : 'bad'); loanSig = ''; upd(); } } }));
          repRow.appendChild(h('button.btn.sm.alt', { text: 'Repay all', on: { click: function () { var r = Z.Sim.repayLoan(Z.state.loan); if (!r.ok) UI.toast(r.msg, 'bad'); UI.snd(r.ok ? 'click' : 'bad'); loanSig = ''; upd(); } } }));
          loanBox.appendChild(repRow);
        }
        var quoteBox = h('div', { style: 'margin-top:8px;padding-top:8px;border-top:1px dashed rgba(58,42,26,.22)' });
        var seg = h('div.seg', { style: 'margin-bottom:6px' });
        [5000, 10000, 25000].forEach(function (amt) {
          seg.appendChild(h('button' + (borrowAmt === amt ? '.on' : ''), { text: fmt(amt), on: { click: function () { borrowAmt = amt; loanSig = ''; UI.snd('click'); upd(); } } }));
        });
        quoteBox.appendChild(seg);
        if (q.ok) {
          quoteBox.appendChild(h('div.kv', h('span', { text: 'Offered daily interest' }), h('b.num', { text: pctStr(q.rate) + ' / day (' + fmt(q.dailyInterest) + '/day)' })));
          if (q.factors && q.factors.length) {
            var fTxt = q.factors.map(function (fc) { return fc.label + ' (' + (fc.delta >= 0 ? '+' : '') + pctStr(fc.delta) + ')'; }).join(' · ');
            quoteBox.appendChild(h('div', { style: 'font-size:11.5px;color:var(--ink2);line-height:1.35;margin:3px 0 6px', text: 'Rate factors: ' + fTxt }));
          }
          quoteBox.appendChild(h('div.btnrow', h('button.btn.sm', { text: 'Borrow ' + fmt(borrowAmt) + ' at ' + pctStr(q.rate) + '/day', on: { click: function () {
            var r = Z.Sim.takeLoan(borrowAmt);
            UI.toast(r.ok ? 'Borrowed ' + fmt(borrowAmt) + ' at ' + pctStr(r.rate) + '/day (' + fmt(r.dailyInterest) + '/day)' : r.msg, r.ok ? 'money' : 'bad');
            UI.snd(r.ok ? 'cash' : 'bad'); loanSig = ''; upd();
          } } })));
        } else {
          quoteBox.appendChild(h('div', { style: 'font-size:12.5px;color:var(--bad)', text: q.msg }));
        }
        loanBox.appendChild(quoteBox);
      }

      mkBox.innerHTML = ''; mkBox.appendChild(h('h4', { text: 'Marketing' }));
      if (S2.marketing.active) mkBox.appendChild(h('div', { style: 'font-size:13px', html: 'Campaign running: <b>' + S2.marketing.daysLeft + '</b> day' + (S2.marketing.daysLeft === 1 ? '' : 's') + ' left. Visitor numbers are up.' }));
      else { mkBox.appendChild(h('div', { style: 'font-size:13px;color:var(--ink2)', text: 'Posters and radio spots bring about 70% more visitors for five days.' })); mkBox.appendChild(h('button.btn.sm.gold', { text: 'Start campaign ' + fmt(Z.Sim.MARKETING_COST), on: { click: function () { var r = Z.Sim.startMarketing(); UI.toast(r.ok ? 'Campaign launched!' : r.msg, r.ok ? 'good' : 'bad'); UI.snd(r.ok ? 'cash' : 'bad'); upd(); } } })); }
    }
    var n = 0;
    upd(); return function () { if (n++ % 2 === 0) { upd(); tHint(); } };
  }
  function drawChart(cv, hist) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 300, hh = cv.clientHeight || 170;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hh);
    c.font = '11px sans-serif'; c.textBaseline = 'middle';
    if (hist.length < 2) { c.fillStyle = '#9a8466'; c.textAlign = 'center'; c.fillText('The chart fills in after a couple of days.', w / 2, hh / 2); return; }
    var L = 44, R = 8, Tp = 10, B = 20, pw = w - L - R, ph = hh - Tp - B, n = hist.length;
    var mx = 100, mnB = 0, mxB = 100; hist.forEach(function (r) { mx = Math.max(mx, r.income, r.costs); mnB = Math.min(mnB, r.balance); mxB = Math.max(mxB, r.balance); });
    var mxCash = Math.max(mx, 1);
    var step = pw / n, bw = Math.max(2, Math.min(16, step * 0.36));
    c.strokeStyle = 'rgba(58,42,26,.12)'; c.fillStyle = '#9a8466'; c.textAlign = 'right';
    for (var g = 0; g <= 3; g++) { var y = Tp + ph - ph * g / 3; c.beginPath(); c.moveTo(L, y); c.lineTo(w - R, y); c.stroke(); c.fillText(fmt(mxCash * g / 3), L - 4, y); }
    hist.forEach(function (r, k) {
      var x = L + k * step + step / 2, hi = r.income / mxCash * ph, hc = r.costs / mxCash * ph;
      c.fillStyle = '#3f9a4f'; c.fillRect(x - bw, Tp + ph - hi, bw, hi); c.fillStyle = '#c4553a'; c.fillRect(x, Tp + ph - hc, bw, hc);
    });
    var rng = Math.max(1, mxB - mnB); c.strokeStyle = '#2f6a95'; c.lineWidth = 2; c.beginPath();
    hist.forEach(function (r, k) { var x = L + k * step + step / 2, y = Tp + ph - (r.balance - mnB) / rng * ph; k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    c.fillStyle = '#9a8466'; c.textAlign = 'center'; c.fillText('day ' + hist[0].day, L + step / 2 + 8, hh - 8); c.fillText('day ' + hist[n - 1].day, w - R - 18, hh - 8);
  }

  // ------------------------------------------------------------------ animals
  var aniSort = { k: 'name', d: 1 };
  function aniTab(b) {
    var wrap = h('div.box', { style: 'padding:6px 4px;overflow-x:auto' }); b.appendChild(wrap);
    function upd() {
      var S = Z.state, list = S.animals.map(function (a) {
        var enc = S.enclosures.filter(function (e) { return e.id === a.enc; })[0]; var sp = UI.sp(a.species);
        return { a: a, name: a.name, species: sp.name, home: enc ? enc.name : 'Escaped', hap: a.happiness, hp: a.health, age: a.age };
      });
      var k = aniSort.k, d = aniSort.d; list.sort(function (x, y) { return (typeof x[k] === 'string' ? x[k].localeCompare(y[k]) : x[k] - y[k]) * d; });
      wrap.innerHTML = '';
      if (!list.length) { wrap.appendChild(h('div.fact', { text: 'No dinosaurs yet. Build an enclosure and lay your first egg from the Hatch tab.' })); return; }
      var t = h('table.tbl'), tr = h('tr');
      [['name', 'Name'], ['species', 'Species'], ['home', 'Home'], ['hap', 'Happy'], ['hp', 'Health']].forEach(function (c) { tr.appendChild(h('th' + (c[0] === 'hap' || c[0] === 'hp' ? '.r' : ''), { text: c[1] + (aniSort.k === c[0] ? (aniSort.d > 0 ? ' ▲' : ' ▼') : ''), on: { click: function () { if (aniSort.k === c[0]) aniSort.d *= -1; else { aniSort.k = c[0]; aniSort.d = 1; } upd(); } } })); });
      t.appendChild(tr);
      list.slice(0, 120).forEach(function (r) {
        var col = r.hap > 65 ? 'pos' : r.hap > 40 ? '' : 'neg';
        t.appendChild(h('tr.tap', { on: { click: function () { jump('animal', r.a.id, r.a.x, r.a.z); } } }, h('td', h('b', { text: r.name })), h('td', { text: r.species }), h('td', { text: r.home }), h('td.r.num.' + (col || 'x'), { text: Math.round(r.hap) + '%' }), h('td.r.num', { text: Math.round(r.hp) + '%' })));
      });
      wrap.appendChild(t);
    }
    upd(); return upd;
  }

  // ------------------------------------------------------------------ guests
  function gstTab(b) {
    var top = h('div.box'), needs = h('div.box'), th = h('div.box'); b.appendChild(top); b.appendChild(needs); b.appendChild(th);
    function upd() {
      var S = Z.state, gs = S.guests, n = gs.length;
      function avg(f) { var s = 0; gs.forEach(function (g) { s += f(g); }); return n ? s / n : 0; }
      top.innerHTML = ''; top.appendChild(h('div', { style: 'display:flex;gap:16px;flex-wrap:wrap' }, h('div', h('div.big', { text: String(n) }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'in the park now' })), h('div', h('div.big', { text: n ? Math.round(avg(function (g) { return g.happiness; })) + '%' : '-' }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'average happiness' })), h('div', h('div.big', { text: S.stats.guestsTotal.toLocaleString('en-GB') }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'visitors so far' }))));
      needs.innerHTML = ''; needs.appendChild(h('h4', { text: 'What guests are feeling' }));
      if (!n) { needs.appendChild(h('div.fact', { text: Z.Sim.isOpenNow() ? 'No guests right now. Animals, paths and a pleasant price draw them in.' : 'The park is closed. Gates open at 08:00.' })); }
      else [['Happiness', avg(function (g) { return g.happiness; }) / 100], ['Fed', 1 - avg(function (g) { return g.hunger; }) / 100], ['Hydrated', 1 - avg(function (g) { return g.thirst; }) / 100], ['Comfort', 1 - avg(function (g) { return g.bladder; }) / 100], ['Energy', avg(function (g) { return g.energy; }) / 100], ['Entertained', avg(function (g) { return g.fun || 0; }) / 100]].forEach(function (r) { needs.appendChild(h('div', { style: 'display:grid;grid-template-columns:90px 1fr 40px;gap:8px;align-items:center;font-size:12.5px' }, h('span', { style: 'font-weight:700;color:var(--ink2)', text: r[0] }), bar(r[1]), h('b.num', { style: 'text-align:right', text: Math.round(r[1] * 100) + '%' }))); });
      th.innerHTML = ''; th.appendChild(h('h4', { text: 'What they are saying' })); var cnt = {};
      gs.forEach(function (g) { if (g.thought) cnt[g.thought] = (cnt[g.thought] || 0) + 1; });
      var top6 = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; }).slice(0, 7);
      if (!top6.length) th.appendChild(h('div', { style: 'font-size:13px;color:var(--ink2)', text: 'Quiet at the moment.' }));
      top6.forEach(function (t) { th.appendChild(h('div.thought', h('span', { text: '“' + t + '”' }), h('b', { text: '×' + cnt[t] }))); });
    }
    upd(); return upd;
  }

  // ------------------------------------------------------------------ staff
  function stfTab(b) {
    var hire = h('div.box'), list = h('div.box'); b.appendChild(hire); b.appendChild(list);
    hire.appendChild(h('h4', { text: 'Hire staff' }));
    D.staff.forEach(function (s) {
      hire.appendChild(h('div.sp-row', { style: 'padding:8px' }, h('div.sth', (function () { var d = h('div', { style: 'width:100%;height:100%;display:flex;align-items:center;justify-content:center' }); UI.lazyThumb(d, 'staff', s.id, s.emoji, 64); return d; })()), h('div.sm', s.name + '  ' + fmt(s['wage/day'] || s.wage) + '/day', h('small', { text: s.effect })),
        s.id === 'scientist' ? h('button.btn.sm', { text: 'Hire in Research', on: { click: function () { UI.closeModal(); UI.Research.open('team'); } } }) :
        h('button.btn.sm', { text: 'Hire ' + fmt(s.hireCost), on: { click: function () {
          var r = Z.Sim.hireStaff(s.id);
          if (r.ok) {
            if (s.id === 'keeper') {
              var cov = Z.Sim.rangerCoverage ? Z.Sim.rangerCoverage() : { baseTiles: 32 };
              UI.toast(s.name + ' hired at the main gate (' + cov.baseTiles + '-tile range). Place rangers on paths via Staff bar or build a Ranger station to reach far enclosures.', 'good');
            } else UI.toast(s.name + ' hired at the main gate.', 'good');
            UI.snd('cash');
          } else { UI.toast(r.msg, 'bad'); UI.snd('bad'); }
          upd();
        } } })));
    });
    var key = '';
    function upd() {
      var S = Z.state, k = S.staff.map(function (s) { return s.id + s.task; }).join('|'); if (k === key) return; key = k;
      list.innerHTML = ''; list.appendChild(h('h4', { text: 'Your team (' + S.staff.length + ')' }));
      if (!S.staff.length) list.appendChild(h('div.fact', { text: 'No staff yet. Rangers feed dinosaurs and clean enclosures; cleaners sweep the paths; security recaptures escapees; scientists work in the lab (hire them in Research).' }));
      var baseT = Z.Sim.rangerCoverage ? Z.Sim.rangerCoverage().baseTiles : 32;
      S.staff.forEach(function (s) {
        var def = UI.byId(D.staff, s.type);
        var sub = (s.task || '') + (s.type === 'keeper' ? ' · ' + baseT + 't range' : '');
        list.appendChild(h('div.sp-row', { style: 'padding:7px 8px' }, h('div.sm', s.name + ' the ' + def.name.toLowerCase(), h('small', { text: sub })),
          h('button.btn.sm.alt', { html: ic('eye'), 'aria-label': 'Follow', on: { click: function () { UI.closeModal(); UI.startFollow('staff', s.id); } } }),
          h('button.btn.sm.alt', { html: ic('close'), 'aria-label': 'Fire', on: { click: function () { Z.Sim.fireStaff(s.id); UI.toast(s.name + ' has left.', 'info'); key = ''; upd(); } } })));
      });
    }
    upd(); return upd;
  }

  // ------------------------------------------------------------------ goals / messages
  function goalsTab(b) {
    var wrap = h('div', { style: 'display:flex;flex-direction:column;gap:8px' }); b.appendChild(wrap);
    function upd() {
      var S = Z.state; wrap.innerHTML = ''; var done = 0;
      D.goals.forEach(function (g) {
        var isDone = !!S.goals[g.id]; if (isDone) done++; var p = UI.goalProgress(g);
        wrap.appendChild(h('div.goal' + (isDone ? '.done' : ''), h('div.gh', h('span', { html: (isDone ? ic('check') + ' ' : '') + g.text }), h('span', { text: isDone ? 'Done' : 'Reward ' + fmt(g.reward) })), isDone ? null : bar(p.frac), isDone ? null : h('div', { style: 'font-size:12px;color:var(--ink2)', text: p.text })));
      });
      wrap.insertBefore(h('div', { style: 'font:700 14px var(--serif)', text: done + ' of ' + D.goals.length + ' goals complete' }), wrap.firstChild);
    }
    upd(); return upd;
  }
  function msgTab(b) {
    var wrap = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }); b.appendChild(wrap);
    function upd() {
      var S = Z.state; wrap.innerHTML = ''; if (!S.messages.length) wrap.appendChild(h('div.fact', { text: 'No news yet.' }));
      S.messages.slice().reverse().forEach(function (m) { wrap.appendChild(h('div.msg.' + (m.kind || 'info'), h('small', { text: 'Day ' + m.day }), m.text)); });
    }
    upd(); return upd;
  }

  // ------------------------------------------------------------------ settings
  function toggle(label, get, set) {
    var sw = h('span.sw' + (get() ? '.on' : '')), row = h('button.toggle', { 'aria-pressed': String(!!get()), style: 'width:100%' }, h('span', { text: label }), sw);
    row.addEventListener('click', function () { var v = !get(); set(v); sw.classList.toggle('on', v); row.setAttribute('aria-pressed', String(v)); UI.snd('click'); });
    return row;
  }
  function setTab(b) {
    var snd = box('Sound & picture');
    snd.appendChild(toggle('Sound', function () { return Z.Audio && Z.Audio.enabled(); }, function (v) { Z.Audio && Z.Audio.setEnabled(v); Z.Main.saveSettings(); }));
    var q = h('div.seg', { style: 'align-self:flex-start' }), qv = Z.Main.getQuality();
    [['auto', 'Auto'], ['low', 'Low'], ['med', 'Medium'], ['high', 'High']].forEach(function (o) { q.appendChild(h('button' + (qv === o[0] ? '.on' : ''), { text: o[1], on: { click: function () { Z.Main.setQuality(o[0]); Array.prototype.forEach.call(q.children, function (c) { c.classList.toggle('on', c.textContent === o[1]); }); UI.snd('click'); } } })); });
    snd.appendChild(h('div.kv', h('span', { text: 'Graphics quality' }), h('span', { style: 'font-size:12px;color:var(--ink3)', text: 'Lower it if the game feels slow' }))); snd.appendChild(q);
    b.appendChild(snd);
    var game = box('Game');
    game.appendChild(h('div.btnrow', h('button.btn.sm', { html: ic('save') + 'Save now', on: { click: function () { Z.Main.save().then(function (ok) { UI.toast(ok ? 'Game saved on this device' : 'Could not save. Export a backup.', ok ? 'good' : 'bad'); }); } } }),
      h('button.btn.sm.alt', { html: ic('flag') + 'Replay tutorial', on: { click: function () { UI.closeModal(); UI.Tutorial.restart(); } } }),
      h('button.btn.sm.alt', { html: ic('home') + 'Title screen', on: { click: function () { Z.Main.toTitle(); } } })));
    var nb = h('button.btn.sm.warn', { html: ic('trash') + 'New game' }), armed = false;
    nb.addEventListener('click', function () {
      if (!armed) { armed = true; nb.innerHTML = 'Really start over? Tap again'; setTimeout(function () { armed = false; nb.innerHTML = ic('trash') + 'New game'; }, 3500); }
      else { UI.closeModal(); Z.Main.openSetup(); }
    });
    game.appendChild(nb);
    game.appendChild(h('div.btnrow', h('button.btn.sm.alt', { text: 'Export save', on: { click: Z.Main.exportSave } }), h('button.btn.sm.alt', { text: 'Import save', on: { click: Z.Main.chooseImport } })));
    var status = h('p', { text: Z.Storage.status(), role: 'status' }); game.appendChild(status);
    game.appendChild(h('p', { text: 'Saves belong to this browser and web address. Export backups before changing devices or addresses.' }));
    b.appendChild(game);
    var how = box('How to play'); how.classList.add('help');
    how.appendChild(h('div', { html:
      '<p><b>Goal:</b> run a dinosaur park people love. Two loops drive it. <b>Science:</b> buy amber, extract DNA in the lab, and raise each genome to 50% to hatch it (80% to splice traits). <b>Park:</b> fence an enclosure, give it the ground and plants the species likes, lay paths, add food, toilets and rangers. Strong fences matter for big predators. Mistakes can be undone with the Undo button or Z.</p>' +
      '<p><b>Touch:</b> one finger drags the map; with a build tool selected, one finger uses the tool (press, slide to adjust, lift to place) and <i>Move</i> lets you scroll. Two fingers pan, pinch to zoom, twist to rotate. Tap a dinosaur, guest or building to inspect it. Tap the lab or the flask button to open Research.</p>' +
      '<p><b>Mouse:</b> left click uses the tool or pans; right-drag rotates; wheel zooms. <b>Keys:</b> WASD or arrows pan, Q/E rotate, +/- zoom, R rotates the item, Z (or Ctrl+Z) undoes, B bulldoze, Space pause, 1-2-3 speed, H hides the interface, Esc cancels.</p>' +
      '<p><b>Tip:</b> ' + (D.tips[(Math.random() * D.tips.length) | 0]) + '</p>' }));
    b.appendChild(how);
    return function () { status.textContent = Z.Storage.status(); };
  }
})();


