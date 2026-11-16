// ===== 66-ui-monorail.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - monorail UI: the Monorail build category (station, track, remove track, overlay), the track tool plan (drag a route, live ghost and cost),
   the station and train inspect panels (fare, trains, riders, overlooked enclosures, breakdown help, follow camera, ride-along), banners, the Guide entry.
   All behaviour lives in Z.Monorail (24-sim-monorail.js); the drawing in Z.MonoWorld (43-world-monorail.js).
   Hooks used: UI.extraCats (50-ui), Tools.PLAN / Tools.stripHook / Tools.refresh (51-tools), UI.Panel.kit + UI.Mono.open (52-panels), UI.Mono.guideSection (57-guide). */
(function () {
  'use strict';
  var UI = Z.UI = Z.UI || {}, D = Z.DATA, MD = D.monorail, h = UI.h, fmt = UI.fmt, ic = UI.ic, N = Z.N;
  var U = UI.Mono = {};
  function M() { return Z.Monorail; }
  function find(a, id) { for (var k = 0; k < a.length; k++) if (a[k].id === id) return a[k]; return null; }

  var css = '.mbx{margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(47,157,143,.10);border:1px solid rgba(47,157,143,.30);font-size:12.5px}' +
    '.mbx h4{margin:0 0 4px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}' +
    '.mbx .mr{display:flex;justify-content:space-between;gap:8px;padding:1px 0}.mbx .mr b{font-weight:700}' +
    '.mbx .mr.ok b{color:var(--good)}.mbx .mr.bad,.mbx .mr.bad b{color:var(--bad)}' +
    '.mbx.fault{background:rgba(200,60,50,.10);border-color:rgba(200,60,50,.38)}.mbx .mw{color:var(--bad);margin:2px 0}' +
    '.mbx .mbar{height:7px;border-radius:4px;background:rgba(0,0,0,.12);overflow:hidden;margin:3px 0 4px}.mbx .mbar i{display:block;height:100%;background:#2f9d8f}' +
    '.trrow{display:flex;align-items:center;gap:6px;padding:5px 0;border-top:1px solid rgba(0,0,0,.08)}.trrow:first-of-type{border-top:0}' +
    '.trrow .tn{flex:1;min-width:0}.trrow .tn b{display:block;font-size:13px}.trrow .tn small{display:block;color:var(--ink2);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.trrow .chip{font:700 10.5px var(--sans);padding:2px 7px;border-radius:9px;background:rgba(47,157,143,.2);color:#1f6f66;white-space:nowrap}.trrow .chip.bad{background:rgba(200,60,50,.2);color:var(--bad)}.trrow .chip.dim{background:rgba(0,0,0,.1);color:var(--ink2)}' +
    '.mbx .btnrow{margin-top:6px}.mbx select,.mbx .seg{margin:0}' +
    '#monoRide{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:30;display:none;gap:8px;align-items:center;padding:7px 12px;border-radius:22px;background:rgba(30,36,40,.78);color:#fff;font:600 12.5px var(--sans);pointer-events:auto}' +
    '#monoRide.on{display:flex}#monoRide button{border:0;border-radius:16px;padding:6px 12px;font:700 12.5px var(--sans);background:#f2b53a;color:#2b2112}';
  var st = document.createElement('style'); st.setAttribute('data-monorail', '1'); st.textContent = css; document.head.appendChild(st);

  // ---------------------------------------------------------------- build category
  function stationIcon() {
    return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true"><rect width="64" height="48" fill="#a8c47a"/><rect x="6" y="30" width="52" height="12" fill="#e9dfc8"/><rect x="4" y="22" width="56" height="6" fill="#d5d1c7"/>' +
      '<rect x="2" y="10" width="60" height="5" fill="#2f9d8f"/><rect x="8" y="15" width="3" height="8" fill="#6f7b84"/><rect x="53" y="15" width="3" height="8" fill="#6f7b84"/><rect x="26" y="34" width="12" height="8" fill="#33383d"/></svg>';
  }
  function trackIcon() {
    return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true"><rect width="64" height="48" fill="#a8c47a"/><path d="M0 18H64" stroke="#d5d1c7" stroke-width="8"/><path d="M0 15H64" stroke="#4f545a" stroke-width="2"/>' +
      '<rect x="12" y="22" width="5" height="22" fill="#bdb9af"/><rect x="34" y="22" width="5" height="22" fill="#bdb9af"/><rect x="8" y="21" width="13" height="4" fill="#cfcac0"/><rect x="30" y="21" width="13" height="4" fill="#cfcac0"/>' +
      '<rect x="40" y="6" width="22" height="9" rx="3" fill="#2f9d8f"/><rect x="43" y="8" width="5" height="4" fill="#bfe6f4"/><rect x="51" y="8" width="5" height="4" fill="#bfe6f4"/></svg>';
  }
  function removeIcon() {
    return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true"><rect width="64" height="48" fill="#a8c47a"/><path d="M4 18H60" stroke="#d5d1c7" stroke-width="8" opacity=".6"/><path d="M20 8l24 28M44 8L20 36" stroke="#c0392b" stroke-width="5" stroke-linecap="round"/></svg>';
  }
  function overlayIcon() {
    return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true"><rect width="64" height="48" fill="#a8c47a"/><rect x="4" y="19" width="56" height="10" fill="#3ab5e8" opacity=".85"/><rect x="26" y="29" width="14" height="14" fill="#6ed99a" opacity=".85"/><rect x="29" y="19" width="6" height="10" fill="#f5d36a"/></svg>';
  }
  function items() {
    var out = [], sd = UI.byId(D.buildings, 'monorail_station');
    if (sd) out.push({ kind: 'building', id: 'monorail_station', name: sd.name, cost: sd.cost, emoji: sd.emoji, def: sd, star: sd.star || 0, fp: [sd.w || 4, sd.h || 2], iconHtml: stationIcon() });
    var star = sd ? (sd.star || 0) : 0;
    out.push({ kind: 'rail', id: 'track', name: 'Monorail track', cost: MD.trackCost, unit: '/tile', star: star, iconHtml: trackIcon(), tip: 'Drag from a station end along the route. Pylons are placed for you; track over water costs extra. Lines run between two stations (or loop).' });
    out.push({ kind: 'railrm', id: 'remove', name: 'Remove track', cost: 0, star: star, iconHtml: removeIcon(), priceHtml: '<small style="font:600 10px var(--sans);color:var(--ink2)">' + Math.round(MD.refund * 100) + '% back</small>', tip: 'Drag over track to take it away.' });
    var on = Z.MonoWorld && Z.MonoWorld.overlayOn;
    out.push({ kind: 'monoview', id: 'overlay', name: 'Track overlay', cost: 0, star: 0, iconHtml: overlayIcon(), priceHtml: on ? 'On' : 'Off', tip: 'Blue: track. Amber: support pylons. Green: enclosures the line looks into.' });
    return out;
  }
  UI.extraCats = (UI.extraCats || []).concat([{ id: 'monorail', name: 'Monorail', icon: 'monorail', items: items, hint: 'An elevated line carries guests over fences, moats and rivers.' }]);

  var origCost = UI.costOf;
  UI.costOf = function (k, id) { if (k === 'rail') return MD.trackCost; if (k === 'railrm' || k === 'monoview') return 0; return origCost.apply(this, arguments); };
  var origCard = UI.onCard, userOverlay = false;
  UI.onCard = function (it, locked) {
    if (it.kind === 'monoview') {
      userOverlay = !Z.MonoWorld.overlayOn; Z.MonoWorld.setOverlay(userOverlay);
      UI.toast(userOverlay ? 'Track overlay on: blue track, amber pylons, green enclosures in view.' : 'Track overlay off', 'info'); UI.refreshCards && UI.refreshCards(); return;
    }
    if (it.kind === 'rail' || it.kind === 'railrm') {
      if (locked) { UI.toast('Needs a ' + it.star + '-star park. Keep improving your rating!', 'info'); return; }
      UI.Tools.start({ kind: it.kind, id: it.id, name: it.name, def: it.def }); return;
    }
    return origCard.apply(this, arguments);
  };

  // ---------------------------------------------------------------- the track tool
  var T = UI.Tools, DT4 = [-N, 1, N, -1];
  // the finger's path as a clean 4-connected route: no diagonals, loops back on itself are trimmed
  function route(pts) {
    var out = [], idx = {}, last = null, k;
    function push(i, j) {
      var t = i + j * N, at = idx[t];
      if (at !== undefined) { for (var q = out.length - 1; q > at; q--) delete idx[out[q]]; out.length = at + 1; last = { i: i, j: j }; return; }
      idx[t] = out.length; out.push(t); last = { i: i, j: j };
    }
    for (k = 0; k < pts.length; k++) {
      var p = pts[k]; if (!Z.inb(p.i, p.j)) continue;
      if (last && (p.i !== last.i && p.j !== last.j)) { var di = p.i - last.i, dj = p.j - last.j; if (Math.abs(di) === 1 && Math.abs(dj) === 1) push(p.i, last.j); else { var sx = Math.sign(di), sz = Math.sign(dj), a = last.i, b = last.j; while (a !== p.i) { a += sx; push(a, b); } while (b !== p.j) { b += sz; push(a, b); } continue; } }
      else if (last && (Math.abs(p.i - last.i) > 1 || Math.abs(p.j - last.j) > 1)) { var sx2 = Math.sign(p.i - last.i), sz2 = Math.sign(p.j - last.j), a2 = last.i, b2 = last.j; while (a2 !== p.i) { a2 += sx2; push(a2, b2); } while (b2 !== p.j) { b2 += sz2; push(a2, b2); } continue; }
      push(p.i, p.j);
    }
    return out;
  }
  // join a station when the drag starts or stops on the tile right outside a platform end
  function snapStations(rt) {
    var X = M().state(); if (!X || !rt.length) return rt;
    function endsOutside(tile) {
      for (var k = 0; k < X.stations.length; k++) {
        var s = X.stations[k], a = s.tiles[0], z = s.tiles[s.tiles.length - 1];
        if (a + DT4[s.bd] === tile) return a; if (z + DT4[s.fd] === tile) return z;
      }
      return -1;
    }
    if (X.stAt[rt[0]] < 0) { var e0 = endsOutside(rt[0]); if (e0 >= 0 && rt.indexOf(e0) < 0) rt = [e0].concat(rt); }
    var lt = rt[rt.length - 1];
    if (X.stAt[lt] < 0) { var e1 = endsOutside(lt); if (e1 >= 0 && rt.indexOf(e1) < 0) rt = rt.concat([e1]); }
    return rt;
  }
  var WATER = -1; function waterIdx() { if (WATER < 0) WATER = D.terrain.findIndex(function (q) { return q.id === 'water'; }); return WATER; }
  T.PLAN.rail = function (d) {
    var m = M(), rt = snapStations(route(d.pts && d.pts.length ? d.pts : [d.a])), r = m.planTrack(rt), ok = !!r.ok, s = Z.state, wet = 0, k;
    if (r.ghost) for (k = 0; k < r.ghost.tiles.length; k++) { var t = r.ghost.tiles[k]; if (s.terrain[t] === waterIdx() && !s.rail[t]) wet++; }
    var label = ok ? r.n + ' piece' + (r.n === 1 ? '' : 's') + (wet ? ', ' + wet + ' over water' : '') : '';
    return { spec: { type: 'rail', plan: r }, ok: ok, cost: r.cost || 0, n: r.n || 0, msg: ok ? '' : (r.msg || 'Cannot build here'), label: label, warn: '',
      run: function () { var q = m.buildTrack(rt); if (!q.ok) return { n: 0, cost: 0 }; if (UI.toast && !q.ok) UI.toast(q.msg, 'bad'); return { n: q.n, cost: q.cost }; } };
  };
  T.PLAN.railrm = function (d) {
    var m = M(), pts = d.pts || [d.a], seen = {}, tiles = [], k;
    for (k = 0; k < pts.length; k++) { var t = pts[k].i + pts[k].j * N; if (!seen[t] && m.hasTrack(t)) { seen[t] = 1; tiles.push(t); } }
    var r = tiles.length ? m.removeTiles(tiles, { dry: true }) : { ok: false, msg: 'No track here' };
    var spec = { type: 'tiles', tiles: tiles.map(function (t) { return { i: t % N, j: (t - t % N) / N }; }), ok: !!r.ok };
    return { spec: spec, ok: !!r.ok, cost: r.ok ? r.cost : 0, n: r.n || 0, msg: r.ok ? '' : (r.msg || 'No track here'), label: r.ok ? r.n + ' piece' + (r.n === 1 ? '' : 's') : '', warn: '',
      run: function () { var q = m.removeTiles(tiles); return { n: q.ok ? q.n : 0, cost: q.ok ? q.cost : 0 }; } };
  };
  // the overlay shows while a monorail tool is open
  function wantsOverlay(t) { return !!t && (t.kind === 'rail' || t.kind === 'railrm' || (t.kind === 'building' && t.id === 'monorail_station')); }
  var oStart = T.start, oCancel = T.cancel;
  T.start = function (spec) { var r = oStart.apply(this, arguments); if (wantsOverlay(UI.tool)) Z.MonoWorld.setOverlay(true); else if (Z.MonoWorld.overlayOn && !userOverlay) Z.MonoWorld.setOverlay(false); return r; };
  T.cancel = function () { var r = oCancel.apply(this, arguments); if (Z.MonoWorld.overlayOn && !userOverlay) Z.MonoWorld.setOverlay(false); return r; };

  // ---------------------------------------------------------------- panels
  var WHY = { fault: 'a mechanical fault', lightning: 'a lightning strike', power: 'no power', test: 'a fault', test2: 'a fault' };
  function statusOf(ti) {
    if (!ti) return ['', 'dim'];
    if (ti.st === 'stuck') return ['Stopped: ' + (WHY[ti.why] || 'a fault'), 'bad'];
    if (ti.st === 'dwell') return ['At platform', ''];
    if (ti.st === 'idle') return ['Waiting', 'dim'];
    return ['Running', ''];
  }
  function dayUpkeep(cars) { return MD.trainUpkeep + MD.carUpkeep * cars; }
  function trainPrice(cars) { return MD.trainCost + (cars - MD.minCars) * MD.carCost; }
  function encName(id) { var e = find(Z.state.enclosures, id); return e ? (e.name || 'Enclosure ' + id) : 'Enclosure ' + id; }
  function viewWord(w) { return w >= 0.75 ? 'excellent view' : w >= 0.45 ? 'good view' : 'glimpse'; }
  function mrow(label, valEl, cls) { var v = h('b'); if (typeof valEl === 'string') v.textContent = valEl; var r = h('div.mr' + (cls ? '.' + cls : ''), h('span', { text: label }), v); r._v = v; return r; }

  U.open = function (kind, id) {
    var P = UI.Panel && UI.Panel.kit; if (!P || !M()) return false;
    if (kind === 'train') return openTrain(id, P);
    if (kind === 'object') { var o = find(Z.state.objects, id); if (!o || o.type !== 'monorail_station') return false; return openStation(o, P); }
    return false;
  };

  function openStation(o, P) {
    var id = o.id, name0 = M().stationName(o), f = P.frame(P.thumbBox('building', 'monorail_station', 96, '🚝'), name0, 'Monorail station'), b = f.body;
    var fp = Z.Sim.footprint(o.type, o.i, o.j, o.rot), tl = []; if (fp) for (var a = 0; a < fp.w; a++) for (var c = 0; c < fp.h; c++) tl.push({ i: fp.i0 + a, j: fp.j0 + c });
    if (tl.length) Z.World.setPreview({ type: 'tiles', tiles: tl, ok: true });
    var line = h('div.mbx'), lineH = h('h4', { text: 'Line' }), rStatus = mrow('Status', ''), rLen = mrow('Length', ''), rTr = mrow('Trains', ''), rLoad = mrow('Aboard now', '');
    line.appendChild(lineH); [rStatus, rLen, rTr, rLoad].forEach(function (r) { line.appendChild(r); });
    var warn = h('div.mw'); line.appendChild(warn);
    var stn = h('div.mbx'), rQ = mrow('Waiting on the platform', ''), rToday = mrow('Riders today', ''), rInc = mrow('Fares taken here', ''), rSat = mrow('Rider satisfaction', ''), rPw = mrow('Power', '');
    stn.appendChild(h('h4', { text: 'This station' })); [rQ, rToday, rInc, rSat, rPw].forEach(function (r) { stn.appendChild(r); });
    var satBar = h('div.mbar', h('i')); stn.appendChild(satBar);
    // fare
    var fare = h('div.mbx'), fareV = h('b.num'), slider = h('input', { type: 'range', min: '0', max: String(MD.fareMax), step: '0.5', value: String(M().fareOf(o)), 'aria-label': 'Fare' }), fareHint = h('div', { style: 'font-size:12px;color:var(--ink2);margin-top:2px' });
    var freeBtn = h('button.btn.sm.alt', { text: '' });
    function sliderPaint() { slider.style.setProperty('--p', (slider.value / MD.fareMax * 100) + '%'); }
    slider.addEventListener('input', function () { M().setFare(id, +slider.value); sliderPaint(); paintFare(); });
    freeBtn.addEventListener('click', function () { var on = !(find(Z.state.objects, id) || {}).mfree; M().setFree(id, on); UI.snd('click'); paintFare(); });
    fare.appendChild(h('h4', { text: 'Fare' })); fare.appendChild(h('div.mr', h('span', { text: 'Ticket per ride' }), fareV)); fare.appendChild(slider); fare.appendChild(fareHint); fare.appendChild(h('div.btnrow', freeBtn));
    function paintFare() {
      var q = find(Z.state.objects, id); if (!q) return; var fv = M().fareOf(q), free = !!q.mfree;
      fareV.textContent = free ? 'Free with entry ticket' : UI.fmt2 ? UI.fmt2(fv) : fmt(fv);
      freeBtn.textContent = free ? 'Free with ticket: on' : 'Free with ticket: off'; freeBtn.className = 'btn sm' + (free ? '' : ' alt');
      slider.disabled = free; if (document.activeElement !== slider) { slider.value = String(fv); sliderPaint(); }
      var r = fv / MD.fareRef;
      fareHint.textContent = free ? 'Riders pay nothing. A free line makes the park feel better value, but earns no fares.' : r < 0.6 ? 'Bargain! Plenty will ride, but you will earn little.' : r <= 1.4 ? 'A fair fare. Guests are happy to pay.' : r <= 2 ? 'A bit steep. Some guests will walk instead.' : 'Too pricey! Most guests will skip the ride.';
    }
    // trains
    var trains = h('div.mbx'), trList = h('div'), buyCars = 3, buyBtn = h('button.btn.sm.gold'), buyBox = h('div.btnrow'), carSeg = h('div.seg');
    [2, 3, 4].forEach(function (n) { carSeg.appendChild(h('button' + (n === buyCars ? '.on' : ''), { text: n + ' cars', on: { click: function () { buyCars = n; Array.prototype.forEach.call(carSeg.children, function (x, q) { x.className = q + 2 === n ? 'on' : ''; }); paintBuy(); UI.snd('click'); } } })); });
    buyBtn.addEventListener('click', function () {
      var r = M().buyTrain(id, buyCars); if (r.ok) { UI.snd('build'); UI.toast('New train on the line. Upkeep ' + fmt(dayUpkeep(buyCars)) + ' / day.', 'good'); key = ''; } else { UI.snd('bad'); UI.toast(r.msg, 'bad'); }
    });
    buyBox.appendChild(carSeg); buyBox.appendChild(buyBtn);
    function paintBuy() { buyBtn.innerHTML = ic('plus') + 'Buy train ' + fmt(trainPrice(buyCars)); }
    trains.appendChild(h('h4', { text: 'Trains' })); trains.appendChild(trList); trains.appendChild(buyBox);
    trains.appendChild(h('div', { style: 'font-size:11.5px;color:var(--ink2);margin-top:4px', text: 'Each train costs ' + fmt(MD.trainUpkeep) + ' a day plus ' + fmt(MD.carUpkeep) + ' per car. Up to ' + MD.maxTrains + ' per line.' }));
    // overlooked
    var ov = h('div.mbx'), ovList = h('div'); ov.appendChild(h('h4', { text: 'What riders see' })); ov.appendChild(ovList);
    // pause and demolish
    var pauseBtn = h('button.btn.sm.alt', { text: '' });
    pauseBtn.addEventListener('click', function () { var q = find(Z.state.objects, id); M().setPaused(id, !(q && q.mpause)); UI.snd('click'); key = ''; });
    var def = UI.byId(D.buildings, o.type), refund = Math.floor(def.cost * 0.5);
    var demo = P.confirmBtn(ic('trash') + 'Demolish', 'Demolish for +' + fmt(refund) + '?', function () { Z.Sim.bulldoze(o.i, o.j); UI.snd('build'); UI.Panel.hide(); }, 'alt');
    [line, stn, fare, trains, ov].forEach(function (x) { b.appendChild(x); });
    b.appendChild(h('div.btnrow', pauseBtn, demo));
    paintBuy(); paintFare();
    var key = '', tkey = '';
    P.setCur({
      kind: 'object', update: function () {
        var q = find(Z.state.objects, id); if (!q) return false;
        var si = M().stationInfo(id); if (!si) return false;
        f.title.textContent = si.name;
        var L = si.line;
        rStatus._v.textContent = !L ? 'Not joined to track' : L.paused ? 'Paused' : L.ok ? (L.stuck ? 'Train stopped' : 'Running') : L.why;
        rStatus.className = 'mr ' + (L && L.ok && !L.paused && !L.stuck ? 'ok' : 'bad');
        rLen._v.textContent = L ? L.length + ' tiles, ' + L.stations.length + ' station' + (L.stations.length === 1 ? '' : 's') + (L.loop ? ', loop' : '') : '-';
        rTr._v.textContent = L ? L.nTrains + ' of ' + L.maxTrains : '0';
        rLoad._v.textContent = L ? L.onboard + ' of ' + L.capacity + ' seats' : '-';
        rQ._v.textContent = String(si.queue); rToday._v.textContent = si.today + ' (yesterday ' + si.yesterday + ')';
        rInc._v.textContent = fmt(si.income) + ' in all'; rSat._v.textContent = si.sat === null ? 'No riders yet' : si.sat + '%';
        satBar.firstChild.style.width = (si.sat === null ? 0 : si.sat) + '%';
        var pwi = !si.powered && Z.Power && Z.Power.objectInfo ? Z.Power.objectInfo(id) : null;
        rPw._v.textContent = si.powered ? 'On' : (pwi && pwi.why ? 'Off: ' + pwi.why : 'Off'); rPw.className = 'mr ' + (si.powered ? 'ok' : 'bad'); rPw.style.display = si.needsPower ? '' : 'none';
        warn.textContent = L && !L.ok ? L.why : '';
        pauseBtn.innerHTML = (q.mpause ? ic('plus') + 'Resume line' : ic('minus') + 'Pause line');
        buyBtn.disabled = !si.canBuy || Z.state.money < trainPrice(buyCars);
        var k2 = JSON.stringify(L ? L.trains : []) + (L ? L.stuck : 0), trs = L ? L.trains.map(function (tid) { return M().trainInfo(tid); }).filter(Boolean) : [];
        var k3 = k2 + trs.map(function (t) { return t.st + t.pax + Math.round(t.brk / 5); }).join('|');
        if (k3 !== tkey) {
          tkey = k3; trList.innerHTML = '';
          if (!trs.length) trList.appendChild(h('div', { style: 'font-size:12.5px;color:var(--ink2)', text: L && L.ok ? 'No trains yet. Buy one below.' : 'Join this station to a second station with track, then add a train.' }));
          trs.forEach(function (t) {
            var s2 = statusOf(t);
            trList.appendChild(h('div.trrow', h('div.tn', h('b', { text: 'Train ' + t.id + ' - ' + t.cars + ' cars' }), h('small', { text: t.pax + ' of ' + t.capacity + ' aboard' + (t.next ? ' - ' + (t.st === 'dwell' ? 'at ' : 'to ') + t.next : '') })),
              h('span.chip' + (s2[1] ? '.' + s2[1] : ''), { text: s2[0] }), h('button.btn.sm.alt', { text: 'View', on: { click: function () { UI.snd('click'); UI.Panel.open('train', t.id); UI.Mono.focusTrain(t.id); } } })));
          });
        }
        var ovl = M().overlookedBy(id), ok2 = JSON.stringify(ovl);
        if (ok2 !== ov._k) {
          ov._k = ok2; ovList.innerHTML = '';
          if (!ovl.length) ovList.appendChild(h('div', { style: 'font-size:12.5px;color:var(--ink2)', text: 'No enclosures in view of this line yet. Run it over or beside an exhibit: riders get a much better look, and dangerous species can be seen safely.' }));
          ovl.forEach(function (e) { ovList.appendChild(h('div.mr', h('span', { text: encName(e.enc) }), h('b', { text: (e.over ? 'passes over' : 'beside') + ', ' + viewWord(e.w) }))); });
        }
        if (document.activeElement !== slider) paintFare();
        return true;
      }
    });
    return true;
  }

  U.focusTrain = function (id) { try { var ti = M().trainInfo(id); if (ti && ti.ok) Z.World.focus(ti.x, ti.z, Math.min(Z.World.cam.dist, 30)); } catch (e) { } };

  function openTrain(id, P) {
    var ti0 = M().trainInfo(id); if (!ti0) return false;
    var f = P.frame(h('div', { style: 'font-size:34px', text: '🚝' }), 'Monorail train ' + id, ti0.cars + ' cars'), b = f.body;
    var box = h('div.mbx'), rSt = mrow('Status', ''), rSp = mrow('Speed', ''), rNx = mrow('Next stop', ''), rLd = mrow('Aboard', ''), rUp = mrow('Upkeep', fmt(dayUpkeep(ti0.cars)) + ' / day');
    var load = h('div.mbar', h('i')); box.appendChild(h('h4', { text: 'Train' })); [rSt, rSp, rNx, rLd].forEach(function (r) { box.appendChild(r); }); box.appendChild(load); box.appendChild(rUp);
    var fault = h('div.mbx.fault'), fTxt = h('div.mw'), fWho = h('div', { style: 'font-size:12.5px;margin:2px 0' }), fEta = h('div', { style: 'font-size:12.5px;color:var(--ink2)' });
    var engBtn = h('button.btn.sm.gold', { html: ic('bell') + 'Call engineer ' + fmt(MD.engineerFee) });
    engBtn.addEventListener('click', function () { var r = M().callEngineer(id); if (r.ok) { UI.snd('build'); UI.toast('An engineer is on the way. Fixed within the hour.', 'good'); } else { UI.snd('bad'); UI.toast(r.msg, 'bad'); } });
    fault.appendChild(h('h4', { text: 'Stopped' })); fault.appendChild(fTxt); fault.appendChild(fWho); fault.appendChild(fEta); fault.appendChild(h('div.btnrow', engBtn));
    var seen = h('div.mbx'), seenL = h('div'); seen.appendChild(h('h4', { text: 'Passing' })); seen.appendChild(seenL);
    var followBtn = h('button.btn.sm.gold', { html: ic('target') + 'Follow' }), rideBtn = h('button.btn.sm', { html: ic('person') + 'Ride along' });
    followBtn.addEventListener('click', function () { UI.snd('click'); var on = Z.MonoWorld.followId !== id; Z.MonoWorld.follow(on ? id : 0); paint(); });
    rideBtn.addEventListener('click', function () { UI.snd('click'); if (Z.MonoWorld.rideAlong(id)) { UI.Panel.hide(); } else UI.toast('That train is not running.', 'bad'); });
    var sell = P.confirmBtn(ic('sell') + 'Sell train', function () { var q = M().sellTrain(id, { dry: true }); return 'Sell for +' + fmt(-q.cost) + '?'; }, function () { M().sellTrain(id); UI.snd('build'); UI.Panel.hide(); }, 'alt');
    b.appendChild(box); b.appendChild(fault); b.appendChild(seen); b.appendChild(h('div.btnrow', followBtn, rideBtn)); b.appendChild(h('div.btnrow', sell));
    function paint() { followBtn.innerHTML = ic('target') + (Z.MonoWorld.followId === id ? 'Stop following' : 'Follow'); }
    var pk = '';
    P.setCur({
      kind: 'train', update: function () {
        var ti = M().trainInfo(id); if (!ti) { if (Z.MonoWorld.followId === id) Z.MonoWorld.follow(0); return false; }
        var s2 = statusOf(ti); rSt._v.textContent = s2[0]; rSt.className = 'mr' + (s2[1] === 'bad' ? ' bad' : '');
        rSp._v.textContent = Math.round(ti.speed * 3.6 * 2) + ' km/h'; rNx._v.textContent = ti.next || '-';
        rLd._v.textContent = ti.pax + ' of ' + ti.capacity; load.firstChild.style.width = Math.round(100 * ti.pax / Math.max(1, ti.capacity)) + '%';
        fault.style.display = ti.st === 'stuck' ? '' : 'none';
        if (ti.st === 'stuck') { fTxt.textContent = 'Stopped by ' + (WHY[ti.why] || 'a fault') + '. Riders are waiting.'; fWho.textContent = ti.fixer || ''; fEta.textContent = 'Back in about ' + Math.max(1, Math.round(ti.brk / (Z.Sim.DAY_SECONDS / 24 / 60))) + ' min of game time.'; engBtn.disabled = Z.state.money < MD.engineerFee; }
        var k = JSON.stringify(ti.over); if (k !== pk) { pk = k; seenL.innerHTML = ''; if (!ti.over.length) seenL.appendChild(h('div', { style: 'font-size:12.5px;color:var(--ink2)', text: 'Nothing special in view right now.' })); ti.over.forEach(function (e) { seenL.appendChild(h('div.mr', h('span', { text: encName(e.enc || e) }), h('b', { text: e.w ? viewWord(e.w) : '' }))); }); }
        paint(); return true;
      }
    });
    return true;
  }
  // closing the train panel hands the camera back
  (function () {
    var P = UI.Panel; if (!P || !P.hide) return; var oh = P.hide;
    P.hide = function (quiet) { if (Z.MonoWorld && Z.MonoWorld.followId && !Z.MonoWorld.rideId) { /* follow continues only while the train panel is open */ Z.MonoWorld.followId = 0; } return oh.apply(this, arguments); };
  })();

  // ---------------------------------------------------------------- banners, ride-along bar
  Z.bus.on('monoStuck', function (e) {
    if (!e) return;
    UI.banner({ title: 'Monorail stopped', text: e.text + ' ' + (e.who || ''), kind: 'alert', jump: function () { Z.World.focus(e.x, e.z, 28); if (UI.Panel && !UI.tool) UI.Panel.open('train', e.train); } });
    UI.snd && UI.snd('alarm');
  });
  Z.bus.on('monoFixed', function (e) { if (e && UI.toast) UI.toast('Monorail train ' + e.train + ' is moving again.', 'good'); });
  var rideBar = null;
  Z.bus.on('monoRide', function (e) {
    if (!rideBar) {
      rideBar = h('div#monoRide', h('span', { text: 'Riding the monorail' }), h('button', { text: 'Leave train', on: { click: function () { Z.MonoWorld.endRide(); } } }));
      document.body.appendChild(rideBar);
    }
    rideBar.classList.toggle('on', !!(e && e.on));
  });

  // ---------------------------------------------------------------- guide
  U.guideSection = function () {
    return ['monorail', 'Monorail', function () {
      var rows = [
        ['Stations', 'A station is a 4 × 2 building with a platform. Its entrance must touch a path. Tracks join at the two ends of the platform. Stars: ' + (UI.byId(D.buildings, 'monorail_station') || { star: 2 }).star + '.'],
        ['Track', 'Drag from a platform end to build track, one piece per tile, ' + fmt(MD.trackCost) + ' each and ' + fmt(MD.trackCost + MD.waterExtra) + ' over water. Pylons are added for you, no further than ' + MD.maxSpan + ' tiles apart, never in deep water or on paths and buildings. Track never affects fences or moats.'],
        ['Lines', 'Two stations joined by track make a there-and-back line. A closed loop with one or more stations is a tour line. Lines cannot branch or cross.'],
        ['Trains', 'Each line takes up to ' + MD.maxTrains + ' trains of ' + MD.minCars + ' to ' + MD.maxCars + ' cars, ' + MD.capacity + ' guests a car. A train costs ' + fmt(MD.trainCost) + ' plus ' + fmt(MD.carCost) + ' per extra car, and ' + fmt(MD.trainUpkeep) + ' a day to run. Buy trains from a station panel.'],
        ['Fares', 'Set the ticket price on a station panel. Guests who think it too dear walk. "Free with ticket" earns nothing but makes the park better value.'],
        ['Views', 'Riders look into enclosures along the track. A line passing over or beside an exhibit gives a much better view than a path, shows shy species, and lets guests watch dangerous animals safely, which they love.'],
        ['Storms and faults', 'Storms slow trains and can strike one with lightning. A train that stops is reset by the nearest free staff member, or call an engineer for ' + fmt(MD.engineerFee) + '. A loose dangerous animal makes the monorail the safest way out of the park, and panic falls faster while a line is running.'],
        ['Ride along', 'Open a train and tap Ride along to see the park from the front carriage.']
      ];
      return rows.map(function (r) { return h('div.box.gd-card', h('div.gd-head', h('span.gd-em', { text: '\ud83d\ude9d' }), h('div', h('b', { text: r[0] }))), h('div.gd-info', { text: r[1] })); });
    }, 'Aerial lines over your park: shorten long walks, show off enclosures and keep guests safe.'];
  };
})();
