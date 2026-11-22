// ===== 65-ui-moats.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - moats UI: the Moats build category (Ditch tool, Pump station, Borehole, overlay toggle), the ditch tool plan
   (line / area / ring, width 1-3, live cost and water preview), enclosure and object panel blocks, the species requirement row
   and the Guide table. All behaviour lives in Z.Moats (23-sim-moats.js); this file only draws it.
   Hooks used: UI.extraCats (50-ui), Tools.stripHook / Tools.PLAN / Tools.refresh (51-tools), UI.Moats.* (52-panels, 57-guide). */
(function () {
  'use strict';
  var UI = Z.UI = Z.UI || {}, D = Z.DATA, h = UI.h, fmt = UI.fmt, ic = UI.ic, N = Z.N;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; });
  var M = UI.Moats = {};
  var DEPTHS = D.moats.depths;

  var css = '.moatbox{margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(60,120,170,.10);border:1px solid rgba(60,120,170,.28);font-size:12.5px}' +
    '.moatbox h4{margin:0 0 4px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}' +
    '.moatbox .mrow{display:flex;justify-content:space-between;gap:8px;padding:1px 0}' +
    '.moatbox .mrow.ok b{color:var(--good)}.moatbox .mrow.bad{color:var(--bad)}.moatbox .mrow.bad b{color:var(--bad)}' +
    '.moatbox .mwarn{color:var(--bad);margin:2px 0}.moatbox .mbar{height:7px;border-radius:4px;background:rgba(0,0,0,.12);overflow:hidden;margin:3px 0 4px}.moatbox .mbar i{display:block;height:100%;background:#3d8fd0}' +
    '.moatbox .mbar.full i{background:var(--bad)}' +
    '.mt-wrap{grid-column:1/-1;overflow-x:auto}.mt{width:100%;border-collapse:collapse;font-size:12.5px}.mt th,.mt td{padding:4px 6px;text-align:left;border-bottom:1px solid rgba(0,0,0,.08);white-space:nowrap}' +
    '.mt th{font:700 11px var(--sans);text-transform:uppercase;color:var(--ink2)}.mt td.no{color:var(--bad)}.mt td.sw{color:#2f77b8}' +
    '.mreq{font-size:12.5px;line-height:1.35}.mreq div{padding:1px 0}';
  var st = document.createElement('style'); st.setAttribute('data-moats', '1'); st.textContent = css; document.head.appendChild(st);

  function find(a, id) { for (var k = 0; k < a.length; k++) if (a[k].id === id) return a[k]; return null; }
  function dn(d) { return Z.Moats.depthName(d); }

  // ---------------------------------------------------------------- build category
  function trenchIcon(depth) {
    var dd = 5 + depth * 6;
    return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true"><rect width="64" height="48" fill="#a8c47a"/>' +
      '<path d="M0 12H16L22 ' + (12 + dd) + 'H42L48 12H64V48H0Z" fill="#8a6a42"/><path d="M22 ' + (12 + dd) + 'H42L48 12H16Z" fill="#5a4328" opacity=".55"/>' +
      '<path d="M0 12H16M48 12H64" stroke="#6b8f45" stroke-width="3"/></svg>';
  }
  function overlayIcon() {
    return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true"><rect width="64" height="48" fill="#a8c47a"/><rect x="6" y="18" width="52" height="12" fill="#3d8fd0" opacity=".85"/><rect x="6" y="18" width="20" height="12" fill="#d9a43a" opacity=".9"/><rect x="42" y="18" width="16" height="12" fill="#d9503a" opacity=".9"/></svg>';
  }
  function items() {
    var out = DEPTHS.map(function (d) { return { kind: 'ditch', id: String(d.id), name: d.name + ' ditch', cost: d.cost, unit: '/tile', def: d, star: 0, iconHtml: trenchIcon(d.id), tip: 'Dig a ditch. Wider and deeper holds bigger animals; water makes it a moat.' }; });
    ['pump_station', 'borehole'].forEach(function (id) { var d = UI.byId(D.buildings, id); if (d) out.push({ kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, fp: [d.w || 1, d.h || 1] }); });
    var on = Z.MoatsWorld && Z.MoatsWorld.overlayOn && Z.MoatsWorld.overlayOn();
    out.push({ kind: 'moatview', id: 'overlay', name: 'Moat overlay', cost: 0, star: 0, iconHtml: overlayIcon(), priceHtml: on ? 'On' : 'Off', tip: 'Colour moats: blue wet, amber dry, red not holding its animals.' });
    return out;
  }
  UI.extraCats = (UI.extraCats || []).concat([{ id: 'moats', name: 'Moats', icon: 'ditch', items: items, hint: 'Ditches keep animals in. Dig one, then add water.' }]);

  var origCard = UI.onCard;
  UI.onCard = function (it, locked) {
    if (it.kind === 'moatview') {
      var on = !(Z.MoatsWorld.overlayOn()); Z.MoatsWorld.setOverlay(on); UI.toast(on ? 'Moat overlay on: blue wet, amber dry, red not holding.' : 'Moat overlay off', 'info');
      UI.refreshCards && UI.refreshCards(); return;
    }
    if (it.kind === 'ditch') { UI.Tools.start({ kind: 'ditch', id: it.id, name: it.name, def: it.def }); return; }
    return origCard.apply(this, arguments);
  };

  // ---------------------------------------------------------------- the ditch tool
  var T = UI.Tools;
  T.stripHook = function (t, s, seg) {
    if (t.kind !== 'ditch') return;
    t.dmode = t.dmode || UI.prefs.dmode || 'line'; t.dwidth = t.dwidth || UI.prefs.dwidth || 1;
    s.appendChild(seg(DEPTHS.map(function (d) { return [String(d.id), d.name]; }), t.id, function (v) { t.id = v; t.name = DEPTHS[+v - 1].name + ' ditch'; T.refresh(); }));
    s.appendChild(seg([['line', 'Line'], ['area', 'Area'], ['ring', 'Ring']], t.dmode, function (v) { t.dmode = UI.prefs.dmode = v; T.refresh(); }));
    if (t.dmode !== 'area') s.appendChild(seg([[1, '1'], [2, '2'], [3, '3']], t.dwidth, function (v) { t.dwidth = UI.prefs.dwidth = +v; T.refresh(); }));
  };
  T.PLAN.ditch = function (d) {
    var t = UI.tool, depth = +t.id || 1, w = t.dwidth || 1, mode = t.dmode || 'line', a = d.a, b = d.b || d.a, set = {}, tiles = [], i, j, o;
    function add(i, j) { if (!Z.inb(i, j)) return; var k = i + j * N; if (!set[k]) { set[k] = 1; tiles.push({ i: i, j: j }); } }
    var lo = -Math.floor((w - 1) / 2), hi = Math.ceil((w - 1) / 2);
    var i0 = Math.min(a.i, b.i), i1 = Math.max(a.i, b.i), j0 = Math.min(a.j, b.j), j1 = Math.max(a.j, b.j);
    if (mode === 'line') {
      if (Math.abs(b.i - a.i) >= Math.abs(b.j - a.j)) { for (i = i0; i <= i1; i++) for (o = lo; o <= hi; o++) add(i, a.j + o); }
      else { for (j = j0; j <= j1; j++) for (o = lo; o <= hi; o++) add(a.i + o, j); }
    } else if (mode === 'area') { for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) add(i, j); }
    else { for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) if (i - i0 < w || i1 - i < w || j - j0 < w || j1 - j < w) add(i, j); }
    var r = Z.Moats.dig(tiles, depth, { dry: true }), ok = !!r.ok, label = '', warn = '';
    if (ok) {
      var net = Z.Moats.preview(tiles, depth), txt = !net ? 'dry' : net.state === 'wet' ? (net.salt ? 'salt moat' : 'wet moat') : net.state === 'partial' ? 'partly filled' : 'dry ditch';
      label = r.n + ' tile' + (r.n > 1 ? 's' : '') + ', ' + txt;
      if (net && net.cap > 0) warn = 'water ' + net.used + '/' + net.cap;
      else if (net && net.warnings[0]) warn = net.warnings[0];
    }
    return { spec: { type: 'tiles', tiles: tiles, ok: ok }, ok: ok, cost: r.cost || 0, n: r.n || 0, msg: ok ? '' : (r.msg || 'Cannot dig here'), label: label, warn: warn,
      run: function () { var q = Z.Moats.dig(tiles, depth); return { n: q.ok ? q.n : 0, cost: q.cost || 0 }; } };
  };

  // ---------------------------------------------------------------- panels
  M.speciesRow = function (sp) {
    var lines = Z.Moats.reqText(sp.id || sp);
    return h('div.mreq', lines.map(function (l) { return h('div', { text: l }); }));
  };
  function netLine(n) {
    var src = n.sources.map(function (z) { return z.name || z.type; }).join(', ');
    return (n.state === 'wet' ? (n.salt ? 'Salt moat' : 'Wet moat') : n.state === 'partial' ? 'Partly filled' : 'Dry ditch') + (src ? ' - ' + src : '');
  }
  M.encBlock = function (id) {
    var el = h('div.moatbox'), key = '';
    function update() {
      var enc = find(Z.state.enclosures, id); if (!enc) return;
      var r = Z.Moats.report(enc); if (!r) { el.style.display = 'none'; return; }
      var k = JSON.stringify([r, enc.species]); if (k === key) return; key = k;
      el.style.display = ''; el.innerHTML = '';
      el.appendChild(h('h4', { text: 'Boundary' }));
      el.appendChild(h('div.mrow', h('span', { text: 'Made of' }), h('b', { text: r.boundary === 'mixed' ? 'Fence and ditch' : r.boundary === 'ditch' ? 'Ditch only' : 'Fence only' })));
      if (!r.fenceEdges && !r.ditchEdges) return;
      r.groups.forEach(function (g) { el.appendChild(h('div.mrow', h('span', { text: (g.wet ? (g.salt ? 'Salt moat' : 'Wet moat') : 'Dry ditch') + ' (' + g.n + ' edges)' }), h('b', { text: g.w + ' wide, ' + dn(g.d) }))); });
      r.networks.forEach(function (n) {
        el.appendChild(h('div.mrow', h('span', { text: netLine(n) }), h('b', { text: n.cap ? n.used + ' of ' + n.cap : '' })));
        if (n.cap) el.appendChild(h('div.mbar' + (n.used >= n.cap - 0.01 ? '.full' : ''), h('i', { style: 'width:' + Math.min(100, Math.round(100 * n.used / n.cap)) + '%' })));
        n.warnings.forEach(function (w) { if (n.state !== 'dry' || n.sources.length) el.appendChild(h('div.mwarn', { text: w })); });
      });
      if (r.drinking) el.appendChild(h('div.mrow.ok', h('span', { text: 'Drinking water' }), h('b', { text: 'Fresh moat' })));
      if (r.ditchEdges) enc.species.forEach(function (spId) {
        var q = r.species[spId], sp = UI.sp(spId); if (!q || !sp) return;
        if (q.ok) el.appendChild(h('div.mrow.ok', h('span', { text: sp.name }), h('b', { text: 'Held' })));
        else el.appendChild(h('div.mwarn', { text: q.msg }));
      });
    }
    update();
    return { el: el, update: update };
  };
  M.objectBlock = function (id) {
    var el = h('div.moatbox'), key = '';
    function update() {
      var i = Z.Moats.objectInfo(id); if (!i) return;
      var k = JSON.stringify(i); if (k === key) return; key = k; el.innerHTML = '';
      el.appendChild(h('h4', { text: i.kind === 'pump' ? 'Pump' : 'Borehole' }));
      el.appendChild(h('div.mrow', h('span', { text: 'Water supplied' }), h('b', { text: i.used + ' of ' + i.cap + ' units' })));
      el.appendChild(h('div.mbar' + (i.used >= i.cap - 0.01 && i.used > 0 ? '.full' : ''), h('i', { style: 'width:' + Math.min(100, Math.round(100 * i.used / i.cap)) + '%' })));
      el.appendChild(h('div.mrow', h('span', { text: 'Water' }), h('b', { text: i.salt ? 'Salt (sea)' : 'Fresh' })));
      if (i.needsPower) el.appendChild(h('div.mrow' + (i.powered ? '.ok' : '.bad'), h('span', { text: 'Power' }), h('b', { text: i.powered ? 'On' : 'Off' })));
      i.issues.forEach(function (w) { el.appendChild(h('div.mwarn', { text: w })); });
    }
    update();
    return { el: el, update: update };
  };

  // ---------------------------------------------------------------- guide
  function cell(n, none) { return n ? h('td', { text: n.w + ' wide, ' + dn(n.d) }) : h('td.' + (none || 'no'), { text: none === 'sw' ? 'swims across' : 'cannot hold' }); }
  M.guideSection = function () {
    return ['moats', 'Moats', function () {
      var rows = Z.Moats.table().map(function (r) {
        if (r.air) return h('tr', h('td', { text: r.name }), h('td.no', { text: 'flies over' }), h('td.no', { text: 'flies over' }));
        return h('tr', h('td', { text: r.name }), cell(r.dry), r.swims ? h('td.sw', { text: 'swims across' }) : cell(r.wet));
      });
      return [h('div.mt-wrap', h('table.mt', h('thead', h('tr', h('th', { text: 'Species' }), h('th', { text: 'Dry ditch' }), h('th', { text: 'Wet moat' }))), h('tbody', rows)))];
    }, 'Minimum ditch to hold each species. Width counts ditch tiles across; depth is Shallow, Medium or Deep. Water helps against non-swimmers; swimmers cross a moat freely. Fences and ditches can be mixed: the weakest side counts.'];
  };
})();
