// ===== 53-screens.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - management screens (tabbed modal). */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, fmt = UI.fmt, D = Z.DATA;
  var Screens = UI.Screens = {}, el, tabEls = {}, curTab = null, tabUpdate = null, pausedBy = false, pressing = false, tick = 0;
  var TABS = [['ov', 'Overview', 'star'], ['fin', 'Finances', 'coin'], ['ani', 'Animals', 'paw'], ['gst', 'Guests', 'guests'], ['stf', 'Staff', 'person'], ['goals', 'Goals', 'flag'], ['msg', 'News', 'bell'], ['guide', 'Guide', 'book'], ['set', 'Settings', 'gear']];
  var BUILD = { ov: ovTab, fin: finTab, ani: aniTab, gst: gstTab, stf: stfTab, goals: goalsTab, msg: msgTab, guide: function (b) { return UI.Guide && UI.Guide.build ? UI.Guide.build(b) : null; }, set: setTab };

  Screens.init = function () {
    el = UI.el; var m = el.modal; m.innerHTML = '';
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
    if (UI.PlayTimer && UI.PlayTimer.open) UI.PlayTimer.open(false);
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
    var top = h('div.box'), starsHolder = h('div'), ratingTxt = h('div.big'), sub = h('div', { style: 'font-size:13px;color:var(--ink2)' });
    var status = h('div', { style: 'font-size:12.5px;color:var(--ink2);margin-top:4px' });
    top.appendChild(h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, h('div', starsHolder, sub, status), ratingTxt));
    var openBtn = h('button.btn.sm', { on: { click: function () { Z.Sim.setOpen(!Z.state.open); UI.snd('click'); upd(); } } });
    top.appendChild(h('div.btnrow', openBtn));
    var parts = h('div.box');
    var keys = ['animals', 'welfare', 'guests', 'facilities', 'cleanliness', 'scenery'];
    var rows = {};
    parts.appendChild(h('h4', { text: 'How your rating is made' }));
    keys.forEach(function (k) {
      var bb = bar(0), v = h('b.num'), label = h('span');
      var r = h('div', { style: 'display:flex;flex-direction:column;gap:3px' }, h('div.kv', label, v), bb);
      rows[k] = { bb: bb, v: v, label: label }; parts.appendChild(r);
    });
    var next = h('div.box'), actions = h('div.box'), stats = h('div.box');
    b.appendChild(top); b.appendChild(parts); b.appendChild(actions); b.appendChild(next); b.appendChild(stats);
    var labels = { animals: 'Animal collection', welfare: 'Animal welfare', guests: 'Guest happiness', facilities: 'Facilities', cleanliness: 'Cleanliness', scenery: 'Scenery' };
    var advice = { animals: 'Add a new species or improve animal appeal.', welfare: 'Open the enclosure report to address animal needs.', guests: 'Check guest needs, value and access.', facilities: 'Add capacity for the services guests need.', cleanliness: 'Assign cleaners to paths and keepers to enclosures.', scenery: 'Add scenery near guest routes and viewing areas.' };
    function upd() {
      var S2 = Z.state, rb = Z.Sim.ratingBreakdown(), weights = rb.weights || {};
      var calculated = Number.isFinite(rb.stars) ? rb.stars : (Number.isFinite(rb.rating) ? rb.rating : S2.rating);
      var current = Number.isFinite(S2.rating) ? S2.rating : (Number.isFinite(rb.rating) ? rb.rating : calculated);
      starsHolder.innerHTML = ''; starsHolder.appendChild(starRow(current, 32)); ratingTxt.textContent = current.toFixed(1);
      sub.textContent = 'Zoo rating - ' + S2.unlocked.star + '-star unlocks active';
      var bonus = Number.isFinite(rb.attractionBonus) ? rb.attractionBonus : 0, panic = Number.isFinite(rb.panic) ? rb.panic : (Number.isFinite(S2.panic) ? S2.panic : 0);
      var shownBase = Number.isFinite(rb.baseStars) && Number.isFinite(rb.collectionCap) ? Math.min(rb.baseStars, rb.collectionCap) : rb.baseStars;
      status.textContent = 'Calculated ' + calculated.toFixed(2) + (calculated > current + 0.05 ? ' · catching up' : calculated < current - 0.05 ? ' · recalculating' : ' · up to date') + (Number.isFinite(shownBase) ? ' · base ' + shownBase.toFixed(2) : '') + ' + attractions ' + bonus.toFixed(2) + ' − panic ' + (panic * 0.6).toFixed(2);
      var mp = S2.map && D.maps && UI.byId(D.maps, S2.map.id), df = S2.difficulty && D.difficulties && UI.byId(D.difficulties, S2.difficulty);
      if (mp || df) sub.textContent += ' - ' + [mp && mp.name, df && df.name].filter(function (x) { return x; }).join(', ');
      openBtn.innerHTML = ic(S2.open ? 'lock' : 'play') + (S2.open ? 'Close the zoo to visitors' : 'Open the zoo to visitors'); openBtn.className = 'btn sm ' + (S2.open ? 'alt' : '');
      keys.forEach(function (k) {
        var v = Number.isFinite(rb[k]) ? rb[k] : 0, w = Number.isFinite(weights[k]) ? weights[k] : 0;
        rows[k].label.textContent = labels[k] + (Number.isFinite(weights[k]) ? ' (' + Math.round(w * 100) + '%)' : '');
        setBar(rows[k].bb, v); rows[k].v.textContent = Math.round(v * 100) + '%';
      });
      var hints = [];
      function hint(text, weight, kind, id, x, z, category) { hints.push({ text: text, weight: weight || 0, kind: kind, id: id, x: x, z: z, category: category || 'other' }); }
      var escaped = (S2.animals || []).find(function (a) { return a.state === 'escaped'; });
      if (escaped) {
        hint(escaped.name + ' has escaped. Secure the enclosure and send security to recapture them.', 2, 'animal', escaped.id, escaped.x, escaped.z, 'safety');
      } else if (panic > 0.01) {
        hint('Recent panic is still lowering the rating. Keep animals secure while guests settle.', 0.6 * panic, null, null, null, null, 'safety');
      }
      var collectionCap = Number.isFinite(rb.collectionCap) ? rb.collectionCap : null, speciesCount = rb.speciesCount, animalCount = rb.animalCount;
      if (!Number.isFinite(speciesCount)) { var foundSpecies = {}; (S2.animals || []).forEach(function (a) { foundSpecies[a.species] = 1; }); speciesCount = Object.keys(foundSpecies).length; }
      if (!Number.isFinite(animalCount)) animalCount = (S2.animals || []).length;
      if (collectionCap !== null && Number.isFinite(rb.baseStars) && rb.baseStars >= collectionCap) hint('Collection ceiling ' + collectionCap.toFixed(2) + ' stars · ' + speciesCount + ' species, ' + animalCount + ' animals. Add species or maintain larger groups.', 1, null, null, null, null, 'animals');
      else if (rb.animals < 0.8) hint(advice.animals + (rb.speciesCount != null ? ' You have ' + rb.speciesCount + ' species and ' + (rb.animalCount || 0) + ' animals.' : ''), (weights.animals || 0) * (1 - rb.animals), null, null, null, null, 'animals');
      if (rb.welfare < 0.8) {
        var troubled = null;
        (S2.enclosures || []).some(function (e) { var report = Z.Sim.enclosureReport(e.id); if (report && report.issues && report.issues.length) { troubled = { e: e, issue: report.issues[0] }; return true; } return false; });
        hint(troubled ? troubled.e.name + ': ' + troubled.issue : advice.welfare, (weights.welfare || 0) * (1 - rb.welfare), troubled ? 'enclosure' : null, troubled && troubled.e.id, troubled ? troubled.e.cx : undefined, troubled ? troubled.e.cz : undefined, 'welfare');
      }
      var serviceNames = { food: 'Food', drink: 'Drink', toilet: 'Toilet', bench: 'Bench', bin: 'Bin', fun: 'Entertainment' };
      var services = rb.services || {}, serviceShort = false;
      Object.keys(serviceNames).forEach(function (k) { var svc = services[k]; if (svc && Number.isFinite(svc.needed) && Number.isFinite(svc.capacity) && svc.needed > svc.capacity) { serviceShort = true; hint(serviceNames[k] + ' capacity is short: ' + Math.ceil(svc.needed - svc.capacity) + ' typical units.', (weights.facilities || 0) * (1 - rb.facilities) * ((svc.needed - svc.capacity) / svc.needed), null, null, null, null, 'services'); } });
      var guests = S2.guests || [], demand = rb.serviceDemand;
      if (guests.length) {
        var avg = function (key) { return guests.reduce(function (sum, g) { return sum + (Number.isFinite(g[key]) ? g[key] : 0); }, 0) / guests.length; };
        if ((avg('hunger') > 55 || avg('thirst') > 55 || avg('bladder') > 55)) {
          var need = avg('hunger') >= avg('thirst') && avg('hunger') >= avg('bladder') ? 'hunger' : avg('thirst') >= avg('bladder') ? 'thirst' : 'toilets';
          hint(need === 'hunger' ? 'Guests are hungry on average (' + Math.round(avg('hunger')) + '%). Check food capacity and prices.' : need === 'thirst' ? 'Guests are thirsty on average (' + Math.round(avg('thirst')) + '%). Check drink capacity and prices.' : 'Guest comfort is low: average toilet need is ' + Math.round(avg('bladder')) + '%.', (weights.guests || 0) * (1 - rb.guests), null, null, null, null, 'guests');
        }
      } else if (!serviceShort && Number.isFinite(demand) && demand > 0 && (rb.guests < 0.8 || rb.facilities < 0.8)) hint('Service demand is based on about ' + Math.round(demand) + ' guests; compare facility capacity with that crowd.', (weights.facilities || 0) * (1 - rb.facilities), null, null, null, null, 'facilities');
      var thoughtCounts = {};
      guests.forEach(function (g) { if (g.thoughtKey && g.thought && (g.thoughtT === undefined || g.thoughtT > 0)) thoughtCounts[g.thoughtKey] = (thoughtCounts[g.thoughtKey] || 0) + 1; });
      if (guests.length >= 5) {
        var thoughtKeys = Object.keys(thoughtCounts).filter(function (k) { return thoughtCounts[k] >= 3; }).sort(function (a, b) { return thoughtCounts[b] - thoughtCounts[a]; });
        if (thoughtKeys.length) {
          var causeByThought = { expensive: 'Guests repeatedly decline purchases as too expensive. Check venue prices.', hungry: 'Several guests are hungry. Add food capacity or lower prices.', thirsty: 'Several guests are thirsty. Add drink capacity or lower prices.', toilet: 'Several guests need toilets. Add toilet capacity.', noBench: 'Several guests cannot find a bench. Add seating along busy paths.', cantSee: 'Several guests cannot see animals. Improve viewing access.' };
          var recognizedThoughts = thoughtKeys.filter(function (k) { return !!causeByThought[k]; });
          var causeText = recognizedThoughts.length ? causeByThought[recognizedThoughts[0]] : '';
          if (causeText) hint(causeText, (weights.guests || 0) * (1 - rb.guests), null, null, null, null, 'guests');
        }
      }
      (S2.objects || []).forEach(function (o) {
        if (o.kind !== 'building' && o.type !== 'bin' && o.type !== 'bench') return;
        var r = Z.Sim.objectReport && Z.Sim.objectReport(o.id);
        if (!r) return;
        var coaster = o.kind === 'building' && Z.Coaster && Z.Coaster.stationInfo ? Z.Coaster.stationInfo(o.id) : null;
        var cause = '';
        if (r.connected === false) cause = ' needs a path connected to the entrance.';
        else if (Z.Power && r.needsPower && !Z.Power.usable(o)) cause = ' has lost power. Check its supply.';
        else if (o.broken) cause = ' is broken. Check its repair status.';
        else if (o.paused) cause = ' is paused. Reopen it when ready.';
        else if (coaster && !coaster.ready) cause = coaster.stallReason ? '. ' + coaster.stallReason : ' needs a complete track loop.';
        else if (coaster && !coaster.trains.length) cause = ' has no train. Add one to open the ride.';
        else if (coaster && coaster.queueLen > 12) cause = ' has ' + coaster.queueLen + ' guests waiting. Check train capacity.';
        else if (o.type === 'bin' && (o.fill || 0) >= 15) cause = ' is full. Check cleaner coverage.';
        if (!cause) return;
        var fp = Z.Sim.footprint && Z.Sim.footprint(o.type, o.i, o.j, o.rot);
        hint(r.name + cause, (weights.facilities || 0) * (1 - rb.facilities), 'object', o.id, fp ? fp.cx : NaN, fp ? fp.cz : NaN, 'access');
      });
      if (rb.cleanliness < 0.8) {
        if (Number.isFinite(rb.cleanPaths) && rb.cleanPaths < 0.8) hint('Paths are dirty: assign cleaners to sweep guest routes.', (weights.cleanliness || 0) * (1 - rb.cleanliness), null, null, null, null, 'cleanliness');
        if (Number.isFinite(rb.cleanEnclosures) && rb.cleanEnclosures < 0.8) {
          var dirty = (S2.enclosures || []).filter(function (e) { return Number.isFinite(e.poop) && e.poop > 0; }).sort(function (a, b) { return b.poop - a.poop; } )[0];
          hint(dirty ? dirty.name + ' needs cleaning. Assign or reposition a keeper.' : 'Enclosure cleanliness is low. Check keeper coverage.', (weights.cleanliness || 0) * (1 - rb.cleanliness), dirty ? 'enclosure' : null, dirty && dirty.id, dirty ? dirty.cx : undefined, dirty ? dirty.cz : undefined, 'cleanliness');
        }
        if (!Number.isFinite(rb.cleanPaths) && !Number.isFinite(rb.cleanEnclosures)) hint(advice.cleanliness, (weights.cleanliness || 0) * (1 - rb.cleanliness), null, null, null, null, 'cleanliness');
      }
      if (rb.scenery < 0.8) hint(advice.scenery, (weights.scenery || 0) * (1 - rb.scenery), null, null, null, null, 'scenery');
      hints.sort(function (a, b) { return b.weight - a.weight; });
      var seenCats = {}; hints = hints.filter(function (item) { if (seenCats[item.category]) return false; seenCats[item.category] = true; return true; });
      actions.innerHTML = ''; actions.appendChild(h('h4', { text: 'What to improve next' }));
      if (hints.length) hints.slice(0, 3).forEach(function (item) {
        var node = item.kind ? h('button.btn.sm.alt', { style: 'width:100%;text-align:left;white-space:normal;margin:2px 0', text: item.text, on: { click: function () { jump(item.kind, item.id, item.x, item.z); } } }) : h('div.fact', { text: item.text });
        actions.appendChild(node);
      });
      else actions.appendChild(h('div.fact', { text: 'No clear rating bottleneck right now. Keep the park accessible and services matched to demand.' }));
      var ns = (S2.unlocked && Number.isFinite(S2.unlocked.star) ? S2.unlocked.star : Math.floor(current)) + 1, ul = [];
      D.animals.forEach(function (a) { if (a.star === ns) ul.push(a.name); }); D.buildings.forEach(function (a) { if (a.star === ns) ul.push(a.name); });
      next.innerHTML = ''; next.appendChild(h('h4', { text: ns <= 5 ? 'At ' + ns + ' stars you unlock' : 'You have unlocked everything' }));
      if (ns <= 5) next.appendChild(h('div.chips', ul.length ? ul.map(function (n) { return h('span.chip', { text: n }); }) : [h('span.chip', { text: 'Bragging rights' })]));
      var sp = {}; S2.animals.forEach(function (a) { sp[a.species] = 1; });
      stats.innerHTML = ''; stats.appendChild(h('h4', { text: 'Your zoo' }));
      var stList = [['Day', S2.day], ['Animals', S2.animals.length + ' (' + Object.keys(sp).length + ' species)'], ['Guests in the zoo', S2.guests.length], ['Guests so far', S2.stats.guestsTotal.toLocaleString('en-GB')], ['Babies born', S2.stats.babiesBorn], ['Staff', S2.staff.length]];
      if (collectionCap !== null && rb.baseStars < collectionCap) stList.push(['Base collection ceiling', collectionCap.toFixed(2) + ' stars']);
      var rt2 = Z.Sim._rt();
      if ((S2.stats && S2.stats.ridesTaken > 0) || (rt2 && rt2.rides && rt2.rides.length)) stList.push(['Rides taken', (S2.stats && S2.stats.ridesTaken) || 0]);
      if ((S2.stats && S2.stats.arcadePlayed > 0) || (rt2 && rt2.arcades && rt2.arcades.length)) stList.push(['Arcade games played', (S2.stats && S2.stats.arcadePlayed) || 0]);
      if (UI.PlayTimer && UI.PlayTimer.formatted) stList.push(['Session play time', UI.PlayTimer.formatted()]); if (S2.panic > 0) stList.push(['Park panic', Math.round(S2.panic * 100) + '%']); if (S2.stats && S2.stats.injuries) stList.push(['Guest injuries', S2.stats.injuries]); if (S2.stats && S2.stats.compensation) stList.push(['Compensation paid', fmt(S2.stats.compensation)]);
      stList.forEach(function (r) { stats.appendChild(h('div.kv', h('span', { text: r[0] }), h('b', { text: String(r[1]) }))); });
    }
    upd(); return upd;
  }
  function setBar(b, frac) { var f = UI.clamp(frac, 0, 1); b.className = 'bar' + (f > 0.6 ? '' : f > 0.35 ? ' mid' : ' low'); b.firstChild.style.width = Math.round(f * 100) + '%'; }

  // ------------------------------------------------------------------ finances
  var CATN = { tickets: 'Tickets', food: 'Food & drink', shops: 'Shops, rides & arcade', donations: 'Donations', animals: 'Animals bought/sold', construction: 'Construction', upkeep: 'Animal & building upkeep', wages: 'Wages', marketing: 'Marketing', other: 'Loans, hiring & other' };
  function finTab(b) {
    var S = Z.state;
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
      cashBox.innerHTML = ''; cashBox.appendChild(h('div.kv', h('span', { text: 'In the bank' }), h('b.big' + (S2.money < 0 ? '.neg' : ''), { text: fmt(S2.money) })));
      if (S2.loan) cashBox.appendChild(h('div.kv', h('span', { text: 'Loan outstanding' }), h('b.neg', { text: fmt(S2.loan) })));
      if (S2.stats && S2.stats.injuries) cashBox.appendChild(h('div.kv', h('span', { text: 'Guest injuries' }), h('b.neg', { text: String(S2.stats.injuries) })));
      if (S2.stats && S2.stats.compensation) cashBox.appendChild(h('div.kv', h('span', { text: 'Injury compensation' }), h('b.neg', { text: fmt(S2.stats.compensation) })));
      if (S2.panic > 0) cashBox.appendChild(h('div.kv', h('span', { text: 'Park panic' }), h('b.neg', { text: Math.round(S2.panic * 100) + '%' })));
      if (hist.length) { var l = hist[hist.length - 1]; cashBox.appendChild(h('div.kv', h('span', { text: 'Yesterday (day ' + l.day + ')' }), h('b' + (l.profit >= 0 ? '.pos' : '.neg'), { text: (l.profit >= 0 ? '+' : '') + fmt(l.profit) + ' profit' }))); }
      table.innerHTML = ''; var tot = 0;
      Object.keys(CATN).forEach(function (k) { var v = f[k] || 0; if (!v) return; tot += v; table.appendChild(h('tr', h('td', { text: CATN[k] }), h('td.r.num' + (v >= 0 ? '.pos' : '.neg'), { text: (v >= 0 ? '+' : '-') + fmt(Math.abs(v)).replace('-', '') }))); });
      if (!tot) table.appendChild(h('tr', h('td', { text: 'Nothing yet today.' }), h('td')));
      table.appendChild(h('tr', h('td', h('b', { text: 'Net' })), h('td.r.num', h('b' + (tot >= 0 ? '.pos' : '.neg'), { text: (tot >= 0 ? '+' : '-') + fmt(Math.abs(tot)).replace('-', '') }))));
      drawChart(chart, hist);
      loanBox.innerHTML = ''; loanBox.appendChild(h('h4', { text: 'Bank loan' }));
      loanBox.appendChild(h('div.kv', h('span', { text: 'Owed (0.4% interest a day)' }), h('b.num', { text: fmt(S2.loan) })));
      var lr = h('div.btnrow');
      lr.appendChild(h('button.btn.sm', { text: 'Borrow £5,000', on: { click: function () { var r = Z.Sim.takeLoan(5000); UI.toast(r.ok ? 'Borrowed £5,000' : r.msg, r.ok ? 'money' : 'bad'); UI.snd(r.ok ? 'cash' : 'bad'); upd(); } } }));
      lr.appendChild(h('button.btn.sm.alt' + (S2.loan ? '' : '.dis'), { text: 'Repay £1,000', on: { click: function () { var r = Z.Sim.repayLoan(1000); if (!r.ok) UI.toast(r.msg, 'bad'); UI.snd(r.ok ? 'click' : 'bad'); upd(); } } }));
      lr.appendChild(h('button.btn.sm.alt' + (S2.loan ? '' : '.dis'), { text: 'Repay all', on: { click: function () { var r = Z.Sim.repayLoan(Z.state.loan); if (!r.ok) UI.toast(r.msg, 'bad'); UI.snd(r.ok ? 'click' : 'bad'); upd(); } } }));
      loanBox.appendChild(lr);
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
      if (!list.length) { wrap.appendChild(h('div.fact', { text: 'No animals yet. Build an enclosure and adopt your first animal from the Animals tab.' })); return; }
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
      top.innerHTML = ''; top.appendChild(h('div', { style: 'display:flex;gap:16px;flex-wrap:wrap' }, h('div', h('div.big', { text: String(n) }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'in the zoo now' })), h('div', h('div.big', { text: n ? Math.round(avg(function (g) { return g.happiness; })) + '%' : '-' }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'average happiness' })), h('div', h('div.big', { text: S.stats.guestsTotal.toLocaleString('en-GB') }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'visitors so far' }))));
      needs.innerHTML = ''; needs.appendChild(h('h4', { text: 'What guests are feeling' }));
      if (!n) { needs.appendChild(h('div.fact', { text: Z.Sim.isOpenNow() ? 'No guests right now. Animals, paths and a pleasant price draw them in.' : 'The zoo is closed. Gates open at 08:00.' })); }
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
        h('button.btn.sm', { text: 'Hire ' + fmt(s.hireCost), on: { click: function () { var r = Z.Sim.hireStaff(s.id); if (r.ok) { UI.toast(s.name + ' hired at the main gate.', 'good'); UI.snd('cash'); } else { UI.toast(r.msg, 'bad'); UI.snd('bad'); } upd(); } } })));
    });
    var key = '';
    function upd() {
      var S = Z.state, k = S.staff.map(function (s) { return s.id + s.task; }).join('|'); if (k === key) return; key = k;
      list.innerHTML = ''; list.appendChild(h('h4', { text: 'Your team (' + S.staff.length + ')' }));
      if (!S.staff.length) list.appendChild(h('div.fact', { text: 'No staff yet. Keepers feed animals and clean enclosures; cleaners sweep the paths; security recaptures escapees.' }));
      S.staff.forEach(function (s) {
        var def = UI.byId(D.staff, s.type);
        var sub = (s.task || '') + ((s.type === 'keeper' || s.type === 'vet') ? ' · radio on call' : '');
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
    row._sync = function () { var v = !!get(); sw.classList.toggle('on', v); row.setAttribute('aria-pressed', String(v)); };
    return row;
  }
  function setTab(b) {
    var snd = box('Sound & picture');
    snd.appendChild(toggle('Sound', function () { return Z.Audio && Z.Audio.enabled(); }, function (v) { Z.Audio && Z.Audio.setEnabled(v); Z.Main.saveSettings(); }));
    var gfx = box('Graphics & Performance');
    var q = h('div.seg', { style: 'align-self:flex-start;flex-wrap:wrap' }), qv = Z.Main.getQuality();
    var gfxStatus = h('div', { style: 'font-size:12px;color:var(--ink2);line-height:1.4', role: 'status' });
    function updateGfxStatus() {
      var gs = Z.Main.getGraphicsSettings ? Z.Main.getGraphicsSettings() : { quality: Z.Main.getQuality(), shadows: true, impostors: false, detail: 1.5 };
      var dLbl = gs.detail >= 1.7 ? 'Ultra' : gs.detail >= 1.45 ? 'High' : gs.detail >= 1.2 ? 'Medium' : 'Standard';
      var parts = [gs.impostors ? 'Distant simplification allowed' : 'Full 3D models active', dLbl + ' detail geometry', gs.shadows ? 'Soft shadows' : 'Shadows off'];
      var es = Z.World && Z.World._G && Z.World._G.entStats;
      if (es) parts.push(es.visible + ' entities, ' + es.meshes + ' meshes (' + es.impostors + ' simplified)');
      gfxStatus.textContent = parts.join(' · ');
    }
    var shRow = toggle('Real-time shadows', function () { return Z.Main.getGraphicsSettings ? Z.Main.getGraphicsSettings().shadows : true; }, function (v) { Z.Main.setGraphicsSetting && Z.Main.setGraphicsSetting('shadows', v); updateGfxStatus(); });
    var fullRow = toggle('Always show full 3D models (never simplify to blocks)', function () { return Z.Main.getGraphicsSettings ? !Z.Main.getGraphicsSettings().impostors : true; }, function (v) { Z.Main.setGraphicsSetting && Z.Main.setGraphicsSetting('impostors', !v); updateGfxStatus(); });
    [['auto', 'Auto'], ['low', 'Low'], ['med', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']].forEach(function (o) {
      q.appendChild(h('button' + (qv === o[0] ? '.on' : ''), { text: o[1], on: { click: function () {
        Z.Main.setQuality(o[0]);
        Array.prototype.forEach.call(q.children, function (c) { c.classList.toggle('on', c.textContent === o[1]); });
        shRow._sync(); fullRow._sync(); updateGfxStatus(); UI.snd('click');
      } } }));
    });
    gfx.appendChild(h('div.kv', h('span', { text: 'Graphics quality' }), h('span', { style: 'font-size:12px;color:var(--ink3)', text: 'Higher presets boost detail & shadows' })));
    gfx.appendChild(q);
    gfx.appendChild(shRow);
    gfx.appendChild(fullRow);
    gfx.appendChild(gfxStatus);
    updateGfxStatus();
    b.appendChild(snd);
    b.appendChild(gfx);
    var ptVal = null;
    if (UI.PlayTimer) {
      var ptBox = box('Play timer');
      ptVal = h('b.num', { text: UI.PlayTimer.formattedLong ? UI.PlayTimer.formattedLong() : UI.PlayTimer.formatted() });
      ptBox.appendChild(h('div.kv', h('span', { text: 'Current play session' }), ptVal));
      ptBox.appendChild(toggle('Show play timer on HUD', function () { return UI.PlayTimer.hudVisible(); }, function (v) { UI.PlayTimer.setHudVisible(v); }));
      ptBox.appendChild(h('div.btnrow', h('button.btn.sm.alt', { html: ic('timer') + 'Open Play Timer', on: { click: function () { UI.snd('click'); UI.closeModal(); UI.PlayTimer.open(true); } } })));
      b.appendChild(ptBox);
    }
    var game = box('Game');
    game.appendChild(h('div.btnrow', h('button.btn.sm', { html: ic('save') + 'Save now', on: { click: function () { var ok = Z.Main.save(); UI.toast(ok ? 'Game saved' : 'Could not save in this browser', ok ? 'good' : 'bad'); } } }),
      h('button.btn.sm.alt', { html: ic('flag') + 'Replay tutorial', on: { click: function () { UI.closeModal(); UI.Tutorial.restart(); } } }),
      h('button.btn.sm.alt', { html: ic('home') + 'Title screen', on: { click: function () { Z.Main.toTitle(); } } })));
    var nb = h('button.btn.sm.warn', { text: 'New game setup' });
    nb.addEventListener('click', function () {
      UI.closeModal();
      if (Z.Main.openSetup) Z.Main.openSetup();
    });
    game.appendChild(nb);
    game.appendChild(h('div.btnrow',
      h('button.btn.sm.alt', { text: 'Export save', on: { click: function () { Z.Main.exportSave(); } } }),
      h('button.btn.sm.alt', { text: 'Import save', on: { click: function () { Z.Main.chooseImport(); } } })));
    var status = h('p', { text: (Z.Storage && Z.Storage.status) ? Z.Storage.status() : '', role: 'status' });
    game.appendChild(status);
    game.appendChild(h('p', { text: 'Saves belong to this browser and web address. Export backups before changing devices or addresses.' }));
    b.appendChild(game);
    var how = box('How to play'); how.classList.add('help');
    how.appendChild(h('div', { html:
      '<p><b>Goal:</b> build a zoo people love. Fence an enclosure, give the animals the ground, plants and shelter they like, then lay paths so guests can see them. Add food, drink and toilets, hire staff, and watch the stars climb.</p>' +
      '<p><b>Touch:</b> one finger drags the map; with a build tool selected, one finger uses the tool (press, slide to adjust, lift to place) and <i>Move</i> lets you scroll. Two fingers pan, pinch to zoom, twist to rotate. Tap an animal, guest or building to inspect it.</p>' +
      '<p><b>Mouse:</b> left click uses the tool or pans; right-drag rotates; wheel zooms. <b>Keys:</b> WASD or arrows pan, Q/E rotate, +/- zoom, R rotates the item, B bulldoze, Space pause, 1-2-3 speed, H hides the interface, Esc cancels.</p>' +
      '<p><b>Tip:</b> ' + (D.tips[(Math.random() * D.tips.length) | 0]) + '</p>' }));
    b.appendChild(how);
    return function () { if (Z.Storage && Z.Storage.status) status.textContent = Z.Storage.status(); if (ptVal && UI.PlayTimer && UI.PlayTimer.formattedLong) ptVal.textContent = UI.PlayTimer.formattedLong(); updateGfxStatus(); };
  }
  Screens.buildSettings = setTab;
})();
