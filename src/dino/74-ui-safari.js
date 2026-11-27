// ===== 74-ui-safari.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - safari UI: the Safari build category (gates, depot / harbour / balloon pad, route tool, corridor and deterrents, overlay), the route tool plan,
   depot / vehicle / wild visitor panels, the zone block in the enclosure panel (status, corridor, lockdown), banners, ride-along bar, the Guide section.
   Behaviour lives in Z.Safari (29-sim-safari.js); drawing in Z.SafariWorld (46-world-safari.js).
   Hooks used: UI.extraCats / UI.onCard / UI.costOf (50-ui), Tools.PLAN / stripHook / refresh (51-tools), UI.Safari.open / encBlock (52-panels), UI.Safari.guideSection (57-guide). */
(function () {
  'use strict';
  var UI = Z.UI = Z.UI || {}, D = Z.DATA, SD = D.safari, h = UI.h, fmt = UI.fmt, ic = UI.ic, N = Z.N;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; if (typeof DT4 !== 'undefined') { DT4[0] = -n; DT4[2] = n; } });
  var U = UI.Safari = {};
  function A() { return Z.Safari; }
  function find(a, id) { for (var k = 0; k < a.length; k++) if (a[k].id === id) return a[k]; return null; }

  var css = '.sfx{margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(201,138,43,.10);border:1px solid rgba(201,138,43,.34);font-size:12.5px}' +
    '.sfx h4{margin:0 0 4px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}' +
    '.sfx .mr{display:flex;justify-content:space-between;gap:8px;padding:1px 0}.sfx .mr b{font-weight:700;text-align:right}' +
    '.sfx .mr.ok b{color:var(--good)}.sfx .mr.bad,.sfx .mr.bad b{color:var(--bad)}' +
    '.sfx.fault{background:rgba(200,60,50,.10);border-color:rgba(200,60,50,.38)}.sfx .mw{color:var(--bad);margin:2px 0}.sfx .nt{color:var(--ink2);font-size:11.5px;margin-top:3px}' +
    '.sfx .mbar{height:7px;border-radius:4px;background:rgba(0,0,0,.12);overflow:hidden;margin:3px 0 4px}.sfx .mbar i{display:block;height:100%;background:#c98a2b}' +
    '.sfx .btnrow{margin-top:6px}' +
    '.svrow{display:flex;align-items:center;gap:6px;padding:5px 0;border-top:1px solid rgba(0,0,0,.08)}.svrow:first-of-type{border-top:0}' +
    '.svrow .tn{flex:1;min-width:0}.svrow .tn b{display:block;font-size:13px}.svrow .tn small{display:block;color:var(--ink2);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.svrow .chip{font:700 10.5px var(--sans);padding:2px 7px;border-radius:9px;background:rgba(201,138,43,.22);color:#7a4f10;white-space:nowrap}.svrow .chip.bad{background:rgba(200,60,50,.2);color:var(--bad)}.svrow .chip.dim{background:rgba(0,0,0,.1);color:var(--ink2)}' +
    '#sfRide{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:30;display:none;gap:8px;align-items:center;padding:7px 12px;border-radius:22px;background:rgba(30,36,40,.78);color:#fff;font:600 12.5px var(--sans);pointer-events:auto}' +
    '#sfRide.on{display:flex}#sfRide button{border:0;border-radius:16px;padding:6px 12px;font:700 12.5px var(--sans);background:#f2b53a;color:#2b2112}' +
    '.sfsel{font:600 12.5px var(--sans);padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:#fff;max-width:46vw}';
  var st = document.createElement('style'); st.setAttribute('data-safari', '1'); st.textContent = css; document.head.appendChild(st);

  // ---------------------------------------------------------------- build category
  function svg(inner) { return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true">' + inner + '</svg>'; }
  var ICONS = {
    gate: svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="4" y="12" width="56" height="24" fill="#c9bfa4"/><rect x="10" y="16" width="16" height="16" fill="#6e7a82"/><rect x="38" y="16" width="16" height="16" fill="#6e7a82"/><rect x="26" y="16" width="12" height="16" fill="#3b4348"/><rect x="2" y="8" width="60" height="5" fill="#c98a2b"/>'),
    boatgate: svg('<rect width="64" height="48" fill="#3d8fd0"/><rect x="4" y="14" width="10" height="22" fill="#6e7a82"/><rect x="50" y="14" width="10" height="22" fill="#6e7a82"/><rect x="14" y="19" width="36" height="4" fill="#c98a2b"/><path d="M0 40c8-3 10 3 18 0s10 3 18 0 10 3 18 0 8 2 10 0V48H0z" fill="#2a79ae"/>'),
    portal: svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="0" y="22" width="64" height="12" fill="#8c8678"/><path d="M0 26h64M0 30h64" stroke="#d8d4c6" stroke-width="2" stroke-dasharray="3 3"/><rect x="8" y="8" width="5" height="26" fill="#e8742a"/><rect x="51" y="8" width="5" height="26" fill="#e8742a"/><rect x="13" y="12" width="38" height="4" fill="#f2f0e6"/>'),
    depot: svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="6" y="14" width="52" height="26" fill="#c98a2b"/><rect x="6" y="10" width="52" height="6" fill="#7a4f10"/><rect x="14" y="22" width="16" height="18" fill="#3b4348"/><rect x="36" y="22" width="16" height="18" fill="#3b4348"/><circle cx="22" cy="40" r="4" fill="#222"/>'),
    harbour: svg('<rect width="64" height="48" fill="#3d8fd0"/><rect x="2" y="8" width="26" height="16" fill="#c98a2b"/><rect x="2" y="24" width="60" height="5" fill="#a08455"/><path d="M34 40l6-8h14l4 8z" fill="#f2f0e6"/><rect x="42" y="26" width="3" height="8" fill="#7a4f10"/><path d="M0 42c8-3 10 3 18 0s10 3 18 0 10 3 18 0 8 2 10 0V48H0z" fill="#2a79ae"/>'),
    balloon: svg('<rect width="64" height="48" fill="#8ec9ef"/><ellipse cx="32" cy="18" rx="14" ry="16" fill="#e8402e"/><path d="M18 18h28" stroke="#f4f1e6" stroke-width="4"/><path d="M26 32l3 8M38 32l-3 8" stroke="#555" stroke-width="1"/><rect x="27" y="40" width="10" height="6" fill="#a08455"/>'),
    route: svg('<rect width="64" height="48" fill="#a8c47a"/><path d="M4 38C20 38 18 12 34 12S50 30 60 22" fill="none" stroke="#a4865a" stroke-width="8" stroke-linecap="round"/><path d="M4 38C20 38 18 12 34 12S50 30 60 22" fill="none" stroke="#7d6342" stroke-width="1.500" stroke-dasharray="4 4"/>'),
    erase: svg('<rect width="64" height="48" fill="#a8c47a"/><path d="M4 30C20 30 18 12 34 12S50 30 60 22" fill="none" stroke="#a4865a" stroke-width="7" opacity=".55"/><path d="M20 8l24 28M44 8L20 36" stroke="#c0392b" stroke-width="5" stroke-linecap="round"/>'),
    overlay: svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="6" y="8" width="40" height="30" fill="#6ed99a" opacity=".85"/><rect x="42" y="18" width="16" height="10" fill="#f5d36a"/><rect x="20" y="28" width="8" height="8" fill="#ff7a3a"/>'),
    corridor: svg('<rect width="64" height="48" fill="#a8c47a"/><path d="M0 26h64" stroke="#7a5a30" stroke-width="10" opacity=".5"/><rect x="26" y="8" width="4" height="30" fill="#ff7a3a"/><rect x="34" y="8" width="4" height="30" fill="#ff7a3a"/><path d="M30 14h4M30 22h4M30 30h4" stroke="#fff" stroke-width="2"/>'),
    ranger: svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="10" y="18" width="44" height="22" fill="#6b8f45"/><path d="M6 20L32 6l26 14z" fill="#4a6a2a"/><rect x="26" y="26" width="12" height="14" fill="#3b4348"/>'),
    camp: svg('<rect width="64" height="48" fill="#a8c47a"/><path d="M8 36L24 12l16 24z" fill="#efe6cf"/><path d="M24 12l16 24h-8L24 22z" fill="#d8cba8"/><path d="M20 36l4-10 4 10z" fill="#ff9e3a"/><path d="M36 36L48 18l10 18z" fill="#efe6cf"/><circle cx="34" cy="40" r="4" fill="#ff7a2a"/>')
  };
  function bld(id, icon) { var d = UI.byId(D.buildings, id); if (!d) return null; return { kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, fp: [d.w || 1, d.h || 1], iconHtml: icon ? ICONS[icon] : undefined }; }
  function scn(id, icon) { var d = UI.byId(D.scenery, id); if (!d) return null; return { kind: 'scenery', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, iconHtml: icon ? ICONS[icon] : undefined }; }
  function fenc(id, icon, tip) { var d = UI.byId(D.fences, id); if (!d) return null; return { kind: 'fence', id: id, name: d.name, cost: d.cost, unit: '/gate', def: d, star: 3, sub: 'Str ' + d.strength, iconHtml: ICONS[icon], tip: tip }; }
  var depotStar = (UI.byId(D.buildings, 'safari_depot') || { star: 3 }).star || 3;
  function items() {
    var on = Z.SafariWorld && Z.SafariWorld.overlayOn;
    var out = [
      fenc('safari_gate', 'gate', 'An airlock: two doors that never open together. Put it on a fence panel, with straight road on either side.'),
      fenc('safari_boat_gate', 'boatgate', 'A boat lock for sea pens: two gates that never open together.'),
      bld('safari_portal', 'portal'), bld('safari_depot', 'depot'), bld('safari_harbour', 'harbour'), bld('safari_balloon', 'balloon'),
      { kind: 'sfroute', id: 'route', name: 'Draw route', cost: SD.trackCost, unit: '/tile', star: depotStar, iconHtml: ICONS.route, tip: 'Build piece-by-piece like a coaster! Drag from the rear bay of a depot, then extend segment by segment. Choose Round Trip (loop) or Out & Back.' },
      { kind: 'sfrm', id: 'erase', name: 'Remove track', cost: 0, star: depotStar, iconHtml: ICONS.erase, priceHtml: '<small style="font:600 10px var(--sans);color:var(--ink2)">' + Math.round(SD.refund * 100) + '% back</small>', tip: 'Click or drag over safari track tiles to trim back from that point.' },
      scn('wildlife_corridor', 'corridor'), scn('scarecrow'), scn('acoustic_pinger'), scn('bird_scarer'), bld('ranger_post', 'ranger'), bld('safari_tent_camp', 'camp'),
      { kind: 'sfview', id: 'overlay', name: 'Safari overlay', cost: 0, star: 0, iconHtml: ICONS.overlay, priceHtml: on ? 'On' : 'Off', tip: 'Green: connected zones. Amber: connected but unpowered. Grey: closed. Yellow: where wildlife can wander in. Blue: gate tiles.' }
    ];
    return out.filter(Boolean);
  }
  UI.extraCats = (UI.extraCats || []).concat([{ id: 'safari', name: 'Safari', icon: 'safari', items: items, hint: 'Open-range zones guests drive, sail or float through. Safe gates, wild visitors, and a fence that must not fail.' }]);

  var origCost = UI.costOf;
  UI.costOf = function (k, id) { if (k === 'sfroute') return SD.trackCost; if (k === 'sfrm' || k === 'sfview') return 0; return origCost.apply(this, arguments); };
  var origCard = UI.onCard, userOverlay = false;
  UI.onCard = function (it, locked) {
    if (it.kind === 'sfview') {
      userOverlay = !Z.SafariWorld.overlayOn; Z.SafariWorld.setOverlay(userOverlay);
      UI.toast(userOverlay ? 'Safari overlay on.' : 'Safari overlay off', 'info'); UI.refreshCards && UI.refreshCards(); return;
    }
    if (it.kind === 'sfroute' || it.kind === 'sfrm') {
      if (locked) { UI.toast('Needs a ' + it.star + '-star park. Keep improving your rating!', 'info'); return; }
      UI.Tools.start({ kind: it.kind, id: it.id, name: it.name }); return;
    }
    var r = origCard.apply(this, arguments);
    if (it.kind === 'fence' && it.def && it.def.safariGate && UI.tool && UI.tool.kind === 'fence') { UI.tool.mode = 'line'; UI.Tools.buildStrip ? UI.Tools.buildStrip() : (UI.Tools.refresh && UI.Tools.refresh()); }
    return r;
  };

  // ---------------------------------------------------------------- the route tool (piece-by-piece + Round Trip / Out & Back)
  var T = UI.Tools;
  function route(pts) {          // the finger's path as a clean 4-connected tile list; allows closing onto pts[0] for loops
    var out = [], idx = {}, last = null, k;
    function push(i, j) {
      var t = i + j * N, at = idx[t];
      if (at !== undefined) {
        if (at === 0 && out.length >= 6) { out.push(t); last = { i: i, j: j }; return; }
        for (var q = out.length - 1; q > at; q--) delete idx[out[q]]; out.length = at + 1; last = { i: i, j: j }; return;
      }
      idx[t] = out.length; out.push(t); last = { i: i, j: j };
    }
    for (k = 0; k < pts.length; k++) {
      var p = pts[k]; if (!Z.inb(p.i, p.j)) continue;
      if (last && (Math.abs(p.i - last.i) > 1 || Math.abs(p.j - last.j) > 1 || (p.i !== last.i && p.j !== last.j))) {
        var sx = Math.sign(p.i - last.i), sz = Math.sign(p.j - last.j), a = last.i, b = last.j;
        while (a !== p.i) { a += sx; push(a, b); } while (b !== p.j) { b += sz; push(a, b); } continue;
      }
      push(p.i, p.j);
    }
    return out;
  }
  function depotsList() { return Z.state.objects.filter(function (o) { var d = UI.byId(D.buildings, o.type); return d && d.safari; }); }
  function depotLabel(o) { var d = UI.byId(D.buildings, o.type); return d.name + ' (' + o.i + ',' + o.j + ')' + (A().routeOfDepot(o.id) ? '' : ' - no route'); }
  function curDepot() {
    var t = UI.tool, list = depotsList(); if (!list.length) return 0;
    if (t && t.depot && find(list, t.depot)) return t.depot;
    var free = list.filter(function (o) { return !A().routeOfDepot(o.id); })[0]; return (free || list[0]).id;
  }
  var oSH = T.stripHook;
  T.stripHook = function (t, s, seg) {
    if (oSH) oSH.apply(this, arguments);
    if (t.kind !== 'sfroute') return;
    var list = depotsList(); if (!list.length) return;
    t.depot = curDepot();
    t.sfMode = t.sfMode || A().routeModeOf(t.depot);
    var sel = h('select.sfsel', { 'aria-label': 'Which depot' });
    list.forEach(function (o) { var op = h('option', { value: String(o.id), text: depotLabel(o) }); if (o.id === t.depot) op.selected = true; sel.appendChild(op); });
    sel.addEventListener('change', function () { t.depot = +sel.value; t.sfMode = A().routeModeOf(t.depot); T.buildStrip ? T.buildStrip() : T.refresh(); UI.snd('click'); });
    s.appendChild(sel);
    if (seg) {
      s.appendChild(seg([['outback', '↔ Out & Back'], ['loop', '🔄 Round Trip']], t.sfMode, function (v) {
        t.depot = curDepot();
        t.sfMode = v;
        if (t.depot) A().setRouteMode(t.depot, v);
        T.refresh();
      }));
    }
  };
  T.PLAN.sfroute = function (d) {
    var t = UI.tool, dep = curDepot(), a = A();
    if (!dep) return { spec: null, ok: false, cost: 0, msg: 'Build a depot, harbour or balloon pad first', label: '', warn: '', run: function () { return { n: 0, cost: 0 }; } };
    t.depot = dep;
    var mode = t.sfMode || a.routeModeOf(dep);
    var rt = route(d.pts && d.pts.length ? d.pts : [d.a]), r = a.planSegment(dep, rt, { mode: mode }), ok = !!r.ok;
    var modeLbl = (r.mode === 'loop' ? 'Round Trip' : 'Out & Back');
    return { spec: { type: 'safari', plan: r }, ok: ok, cost: r.cost || 0, n: r.n || 0, msg: ok ? '' : (r.msg || 'Cannot build here'),
      label: ok ? ('+' + r.n + ' tiles (' + r.mergedTiles.length + ' total, ' + modeLbl + ')') : '',
      warn: ok && r.partial ? (r.msg || 'Keep extending into a dinosaur zone') : '',
      run: function () {
        var q = a.addSegment(dep, rt, { mode: mode });
        if (!q.ok) { return { n: 0, cost: 0 }; }
        if (q.complete) UI.toast('Safari route ready (' + (q.loop ? 'Round Trip' : 'Out & Back') + ')! Buy a vehicle at the ' + (UI.byId(D.buildings, find(Z.state.objects, dep).type).name.toLowerCase()) + '.', 'good');
        else UI.toast('Track segment added (' + q.mergedTiles.length + ' tiles). ' + (q.msg || 'Drag from the blue end tile to keep building.'), 'info');
        return { n: q.n, cost: q.cost };
      } };
  };
  T.PLAN.sfrm = function (d) {
    var a = A(), pts = d.pts || [d.a], rm = pts.map(function (p) { return p.i + p.j * N; });
    var plan = a.planRemoveTiles(rm), ok = !!plan.ok;
    return { spec: { type: 'safari', plan: ok ? { ok: false, partial: true, ghost: plan.ghost } : null }, ok: ok, cost: ok ? plan.cost : 0, n: ok ? plan.n : 0, msg: ok ? '' : 'No safari track here', label: ok ? ('Remove ' + plan.n + ' tile' + (plan.n === 1 ? '' : 's')) : '', warn: '',
      run: function () { var z = a.removeTiles(rm); return { n: z.ok ? z.n : 0, cost: z.ok ? z.cost : 0 }; } };
  };
  function wantsOverlay(t) { return !!t && (t.kind === 'sfroute' || t.kind === 'sfrm' || (t.kind === 'fence' && t.def && t.def.safariGate) || (t.kind === 'building' && t.def && (t.def.safari || t.def.safariPortal)) || (t.kind === 'scenery' && t.def && t.def.safariCorridor)); }
  var oStart = T.start, oCancel = T.cancel;
  T.start = function () { var r = oStart.apply(this, arguments); if (wantsOverlay(UI.tool)) Z.SafariWorld.setOverlay(true); else if (Z.SafariWorld.overlayOn && !userOverlay) Z.SafariWorld.setOverlay(false); return r; };
  T.cancel = function () { var r = oCancel.apply(this, arguments); if (Z.SafariWorld.overlayOn && !userOverlay) Z.SafariWorld.setOverlay(false); return r; };

  // ---------------------------------------------------------------- shared bits
  function mrow(label, cls) { var v = h('b'); var r = h('div.mr' + (cls ? '.' + cls : ''), h('span', { text: label }), v); r._v = v; return r; }
  function setRow(r, text, cls) { r._v.textContent = text; r.className = 'mr' + (cls ? ' ' + cls : ''); }
  var VST = { idle: ['Waiting at the bay', 'dim'], board: ['Boarding', ''], run: ['On tour', ''], wait: ['Waiting at a gate', 'dim'], stuck: ['Stranded', 'bad'], broken: ['Broken down', 'bad'] };
  var KIND = { land: ['Truck', 'Safari truck'], sea: ['Boat', 'Tour boat'], air: ['Balloon', 'Tethered balloon'] };
  function vname(v) { return (KIND[v.kind] || KIND.land)[0] + ' ' + v.id; }
  function encName(id) { var e = find(Z.state.enclosures, id); return e ? (e.name || 'Enclosure ' + id) : 'Enclosure ' + id; }
  function dayUpkeep(kind) { return SD.upkeep[kind] || 0; }

  // ---------------------------------------------------------------- panels
  U.open = function (kind, id) {
    var P = UI.Panel && UI.Panel.kit; if (!P || !A()) return false;
    if (kind === 'safari_veh') return openVeh(id, P);
    if (kind === 'wild') return openWild(id, P);
    if (kind === 'object') { var o = find(Z.state.objects, id); var d = o && UI.byId(D.buildings, o.type); if (d && d.safari) return openDepot(o, d, P); if (d && d.safariReserve) return openCamp(o, d, P); }
    return false;
  };

  function openDepot(o, def, P) {
    var id = o.id, a = A(), kind = def.safari, f = P.frame(P.thumbBox('building', o.type, 96, def.emoji || '🚙'), def.name, kind === 'land' ? 'Safari truck depot' : kind === 'sea' ? 'Tour boat harbour' : 'Balloon pad'), b = f.body;
    var fp = Z.Sim.footprint(o.type, o.i, o.j, o.rot), tl = []; if (fp) for (var q = 0; q < fp.w; q++) for (var c = 0; c < fp.h; c++) tl.push({ i: fp.i0 + q, j: fp.j0 + c });
    if (tl.length) Z.World.setPreview({ type: 'tiles', tiles: tl, ok: true });
    var rt = h('div.sfx'), rS = mrow('Route'), rM = mrow('Trip mode'), rL = mrow('Length'), rEx = mrow('Excitement'), rZ = mrow('Safari zones'), rG = mrow('Gates'), rV = mrow('Vehicles'), warn = h('div.mw');
    rt.appendChild(h('h4', { text: 'Tour route' })); [rS, rM, rL, rEx, rZ, rG, rV].forEach(function (r) { rt.appendChild(r); }); rt.appendChild(warn);
    var outBackBtn = h('button.btn.sm.alt', { text: '↔ Out & Back', on: { click: function () { a.setRouteMode(id, 'outback'); UI.snd('click'); key = ''; } } });
    var loopBtn = h('button.btn.sm.alt', { text: '🔄 Round Trip', on: { click: function () { a.setRouteMode(id, 'loop'); UI.snd('click'); key = ''; } } });
    rt.appendChild(h('div.btnrow', outBackBtn, loopBtn));
    var drawBtn = h('button.btn.sm.gold', { html: ic('pencil') + 'Build / Extend route', on: { click: function () { UI.snd('click'); UI.Panel.hide(); UI.Tools.start({ kind: 'sfroute', id: 'route', name: 'Draw route', depot: id, sfMode: a.routeModeOf(id) }); } } });
    var rmBtn = P.confirmBtn(ic('trash') + 'Clear route', function () { var r = a.removeRoute(id, { dry: true }); return r.ok ? 'Remove for +' + fmt(-r.cost) + '?' : 'No route to remove'; }, function () { a.removeRoute(id); UI.snd('build'); key = ''; }, 'alt');
    rt.appendChild(h('div.btnrow', drawBtn, rmBtn));
    var qb = h('div.sfx'), rQ = mrow('Waiting at the bay'), rT = mrow('Riders today'), rI = mrow('Fares taken'), rSat = mrow('Rider satisfaction'), satBar = h('div.mbar', h('i'));
    qb.appendChild(h('h4', { text: 'Guests' })); [rQ, rT, rI, rSat].forEach(function (r) { qb.appendChild(r); }); qb.appendChild(satBar);
    var fare = h('div.sfx'), fareV = h('b.num'), slider = h('input', { type: 'range', min: '0', max: String(SD.fareMax), step: '0.5', value: String(a.fareOf ? a.fareOf(o) : SD.fare), 'aria-label': 'Fare' }), fareHint = h('div', { style: 'font-size:12px;color:var(--ink2);margin-top:2px' }), freeBtn = h('button.btn.sm.alt');
    slider.addEventListener('input', function () { a.setFare(id, +slider.value); paintFare(); });
    freeBtn.addEventListener('click', function () { var on = !(find(Z.state.objects, id) || {}).mfree; a.setFree(id, on); UI.snd('click'); paintFare(); });
    fare.appendChild(h('h4', { text: 'Fare' })); fare.appendChild(h('div.mr', h('span', { text: 'Ticket per ride' }), fareV)); fare.appendChild(slider); fare.appendChild(fareHint); fare.appendChild(h('div.btnrow', freeBtn));
    function paintFare() {
      var q2 = find(Z.state.objects, id); if (!q2) return; var fv = a.fareOf(q2), free = !!q2.mfree;
      fareV.textContent = free ? 'Free with entry ticket' : (UI.fmt2 ? UI.fmt2(fv) : fmt(fv));
      freeBtn.textContent = free ? 'Free with ticket: on' : 'Free with ticket: off'; freeBtn.className = 'btn sm' + (free ? '' : ' alt');
      slider.disabled = free; if (document.activeElement !== slider) slider.value = String(fv);
      var r = fv / SD.fareRef;
      fareHint.textContent = free ? 'Riders pay nothing. Great value for guests, but no fare income.' : r < 0.6 ? 'Bargain! Everyone will ride, but you earn little.' : r <= 1.4 ? 'A fair fare. Guests are happy to pay.' : r <= 2 ? 'A bit steep. Some guests will skip it.' : 'Too pricey! Most guests will skip the ride.';
    }
    var vb = h('div.sfx'), vList = h('div'), buyBtn = h('button.btn.sm.gold');
    buyBtn.addEventListener('click', function () { var r = a.buyVehicle(id); if (r.ok) { UI.snd('build'); UI.toast('New ' + (KIND[kind] || KIND.land)[1].toLowerCase() + ' ready. Upkeep ' + fmt(dayUpkeep(kind)) + ' / day.', 'good'); key = ''; } else { UI.snd('bad'); UI.toast(r.msg, 'bad'); } });
    buyBtn.innerHTML = ic('plus') + 'Buy ' + (KIND[kind] || KIND.land)[1].toLowerCase() + ' ' + fmt(a.vehicleCost(kind));
    vb.appendChild(h('h4', { text: 'Vehicles' })); vb.appendChild(vList); vb.appendChild(h('div.btnrow', buyBtn));
    vb.appendChild(h('div.nt', { text: 'Each costs ' + fmt(dayUpkeep(kind)) + ' a day to run, carries ' + SD.capacity[kind] + ' guests, and up to ' + SD.maxVeh + ' share a route. Gates and portals need power: if they lock, riders wait for a ranger.' }));
    var def2 = UI.byId(D.buildings, o.type), refund = Math.floor(def2.cost * 0.5);
    var demo = P.confirmBtn(ic('trash') + 'Demolish', 'Demolish for +' + fmt(refund) + '?', function () { Z.Sim.bulldoze(o.i, o.j); UI.snd('build'); UI.Panel.hide(); }, 'alt');
    [rt, qb, fare, vb].forEach(function (x) { b.appendChild(x); }); b.appendChild(h('div.btnrow', demo));
    paintFare();
    var key = '';
    P.setCur({
      kind: 'object', update: function () {
        var i = a.depotInfo(id); if (!i || !find(Z.state.objects, id)) return false;
        var R = i.route;
        setRow(rS, !R ? 'Not drawn yet' : R.ok ? 'Ready' : (R.partial ? 'In progress' : 'Blocked'), R && R.ok ? 'ok' : 'bad');
        setRow(rM, i.mode === 'loop' ? 'Round Trip (Loop)' : 'Out & Back');
        outBackBtn.className = 'btn sm' + (i.mode === 'outback' ? '' : ' alt');
        loopBtn.className = 'btn sm' + (i.mode === 'loop' ? '' : ' alt');
        rmBtn.disabled = !R;
        setRow(rL, R ? R.length + ' tiles' + (R.loop ? ', closed loop' : ', out & back') : '-');
        setRow(rEx, R && R.ok ? (R.excitement + '/100 (' + R.speciesCount + ' species, ' + R.animalCount + ' dinos)') : '-', R && R.ok && R.excitement >= 60 ? 'ok' : '');
        setRow(rZ, R && R.zones.length ? R.zones.map(encName).join(', ') : 'None yet', R && R.zones.length ? '' : 'bad');
        setRow(rG, R ? (R.gates ? R.gates + ' crossing' + (R.gates === 1 ? '' : 's') + (R.powered ? '' : ', unpowered') : 'None') : '-', R && !R.powered ? 'bad' : '');
        setRow(rV, i.vehicles.length + ' of ' + i.maxVeh);
        warn.textContent = a.lockdown() ? 'Park lockdown is active: safari tours are suspended.' : (R && !R.ok ? R.why : (R && R.ok && !R.powered ? 'Safari gates or portals have no power: vehicles cannot depart.' : (!i.conn ? 'This building must touch a path so guests can reach it.' : (!i.open ? 'Park is closed: safari tours resume at opening time.' : ''))));
        setRow(rQ, String(i.queue)); setRow(rT, i.today + ' (yesterday ' + i.yesterday + ')'); setRow(rI, fmt(i.income) + ' in all');
        setRow(rSat, i.sat === null ? 'No riders yet' : i.sat + '%'); satBar.firstChild.style.width = (i.sat === null ? 0 : i.sat) + '%';
        buyBtn.disabled = !i.canBuy || Z.state.money < i.cost;
        var k2 = JSON.stringify(i.vehicles.map(function (v) { return [v.id, v.st, v.pax, v.why || '', Math.round(v.brk / 5), v.stuck > 0]; }));
        if (k2 !== key) {
          key = k2; vList.innerHTML = '';
          if (!i.vehicles.length) vList.appendChild(h('div', { style: 'font-size:12.5px;color:var(--ink2)', text: R && R.ok ? 'No vehicles yet. Buy one below.' : 'Draw a route first, then add a vehicle.' }));
          i.vehicles.forEach(function (v) {
            var s2 = VST[v.st] || ['', 'dim'];
            vList.appendChild(h('div.svrow', h('div.tn', h('b', { text: vname(v) }), h('small', { text: v.pax + ' of ' + v.cap + ' aboard' + (v.why ? ' · ' + v.why : '') })), h('span.chip' + (s2[1] ? '.' + s2[1] : ''), { text: s2[0] }),
              h('button.btn.sm.alt', { text: 'View', on: { click: function () { UI.snd('click'); UI.Panel.open('safari_veh', v.id); Z.SafariWorld.follow(v.id); } } })));
          });
        }
        if (document.activeElement !== slider) paintFare();
        return true;
      }
    });
    return true;
  }

  function openVeh(id, P) {
    var a = A(), v0 = a.vehicle(id); if (!v0) return false;
    var f = P.frame(h('div', { style: 'font-size:34px', text: v0.kind === 'sea' ? '⛵' : v0.kind === 'air' ? '🎈' : '🚙' }), vname(v0), (KIND[v0.kind] || KIND.land)[1]), b = f.body;
    var box = h('div.sfx'), rSt = mrow('Status'), rLd = mrow('Aboard'), rUp = mrow('Upkeep'), load = h('div.mbar', h('i'));
    box.appendChild(h('h4', { text: 'Vehicle' })); [rSt, rLd].forEach(function (r) { box.appendChild(r); }); box.appendChild(load); box.appendChild(rUp); setRow(rUp, fmt(dayUpkeep(v0.kind)) + ' / day');
    var fault = h('div.sfx.fault'), fTxt = h('div.mw'), fEta = h('div', { style: 'font-size:12.5px;color:var(--ink2)' });
    var rescue = h('button.btn.sm.gold', { html: ic('bell') + 'Send rescue ' + fmt(150) }), eng = h('button.btn.sm.gold', { html: ic('bell') + 'Call engineer ' + fmt(160) });
    rescue.addEventListener('click', function () { var r = a.callRescue(id); if (r.ok) { UI.snd('build'); UI.toast('A ranger is on the way.', 'good'); } else { UI.snd('bad'); UI.toast(r.msg, 'bad'); } });
    eng.addEventListener('click', function () { var r = a.callEngineer(id); if (r.ok) { UI.snd('build'); UI.toast('An engineer is fixing it now.', 'good'); } else { UI.snd('bad'); UI.toast(r.msg, 'bad'); } });
    fault.appendChild(h('h4', { text: 'Needs help' })); fault.appendChild(fTxt); fault.appendChild(fEta); fault.appendChild(h('div.btnrow', rescue, eng));
    var followBtn = h('button.btn.sm.gold', { html: ic('target') + 'Follow' }), rideBtn = h('button.btn.sm', { html: ic('person') + 'Ride along' });
    followBtn.addEventListener('click', function () { UI.snd('click'); Z.SafariWorld.follow(Z.SafariWorld.followId === id ? 0 : id); paint(); });
    rideBtn.addEventListener('click', function () { UI.snd('click'); if (Z.SafariWorld.rideAlong(id)) UI.Panel.hide(); else UI.toast('That vehicle is not available.', 'bad'); });
    var sell = P.confirmBtn(ic('sell') + 'Sell', function () { var q = a.sellVehicle(id, { dry: true }); return 'Sell for +' + fmt(-q.cost) + '?'; }, function () { a.sellVehicle(id); UI.snd('build'); UI.Panel.hide(); }, 'alt');
    b.appendChild(box); b.appendChild(fault); b.appendChild(h('div.btnrow', followBtn, rideBtn)); b.appendChild(h('div.btnrow', sell));
    function paint() { followBtn.innerHTML = ic('target') + (Z.SafariWorld.followId === id ? 'Stop following' : 'Follow'); }
    P.setCur({
      kind: 'safari_veh', update: function () {
        var v = a.vehicle(id); if (!v) { if (Z.SafariWorld.followId === id) Z.SafariWorld.follow(0); return false; }
        var vi = null;
        Z.state.objects.forEach(function (o) { var d = UI.byId(D.buildings, o.type); if (d && d.safari && !vi) { var x = a.depotInfo(o.id); var m = x && find(x.vehicles, id); if (m) vi = m; } });
        var pax = vi ? vi.pax : 0, cap = SD.capacity[v.kind], s2 = VST[v.st] || ['', ''];
        setRow(rSt, s2[0], s2[1] === 'bad' ? 'bad' : ''); setRow(rLd, pax + ' of ' + cap); load.firstChild.style.width = Math.round(100 * pax / Math.max(1, cap)) + '%';
        fault.style.display = v.st === 'stuck' || v.st === 'broken' ? '' : 'none';
        if (v.st === 'stuck') { fTxt.textContent = (v.why || 'The gate is locked') + '. Guests are waiting.'; fEta.textContent = 'A ranger will come. Restore power, or send help now.'; rescue.style.display = ''; eng.style.display = 'none'; }
        else if (v.st === 'broken') { fTxt.textContent = 'Broken down. Riders are waiting.'; fEta.textContent = 'Staff will reset it, or call an engineer.'; rescue.style.display = 'none'; eng.style.display = ''; }
        paint(); return true;
      }
    });
    return true;
  }

  function openWild(id, P) {
    var a = A(), w0 = a.wildInfo(id); if (!w0) return false;
    var f = P.frame(h('div', { style: 'font-size:34px', text: w0.kind === 'sea' ? '🐬' : w0.kind === 'air' ? '🐦' : '🦌' }), w0.name, 'Wild visitor'), b = f.body;
    var box = h('div.sfx'), rZ = mrow('In zone'), rPh = mrow('Doing'); box.appendChild(h('h4', { text: 'Wild visitor' })); box.appendChild(rZ); box.appendChild(rPh);
    box.appendChild(h('div.nt', { text: w0.protected ? 'A protected species. If it is killed, expect a conservation story and possibly a fine.' : 'Not one of yours: it wandered in from outside. Predators may hunt it. Guests love the sight of it.' }));
    b.appendChild(box);
    var DO = { arrive: 'Arriving', graze: 'Grazing', roam: 'Wandering', flee: 'Fleeing', leave: 'Leaving', hunted: 'Being hunted', rest: 'Resting' };
    P.setCur({ kind: 'wild', update: function () { var w = a.wildInfo(id); if (!w) return false; setRow(rZ, w.zone ? encName(w.zone) : '-'); setRow(rPh, DO[w.phase] || String(w.phase || 'Roaming')); return true; } });
    return true;
  }

  function openCamp(o, def, P) {
    var id = o.id, a = A(), f = P.frame(P.thumbBox('building', o.type, 96, def.emoji || '⛺'), def.name, 'Luxury Safari Game Reserve Camp'), b = f.body;
    var fp = Z.Sim.footprint(o.type, o.i, o.j, o.rot), tl = []; if (fp) for (var q = 0; q < fp.w; q++) for (var c = 0; c < fp.h; c++) tl.push({ i: fp.i0 + q, j: fp.j0 + c });
    if (tl.length) Z.World.setPreview({ type: 'tiles', tiles: tl, ok: true });
    var stBox = h('div.sfx'), rConn = mrow('Access'), rRate = mrow('Nightly rate'), rWild = mrow('Nearby reserve'), rBeds = mrow('VIP campers'), rRev = mrow('Total revenue'), warn = h('div.mw');
    stBox.appendChild(h('h4', { text: 'Game Reserve Stay' })); [rConn, rRate, rWild, rBeds, rRev].forEach(function (r) { stBox.appendChild(r); }); stBox.appendChild(warn);
    var secBox = h('div.sfx'), rG = mrow('Bodyguards'), rSec = mrow('Perimeter status');
    secBox.appendChild(h('h4', { text: 'Bodyguard Detail' })); secBox.appendChild(rG); secBox.appendChild(rSec);
    var hireBtn = h('button.btn.sm.gold', { html: ic('plus') + 'Hire bodyguard ' + fmt(1200), on: { click: function () { var r = a.hireCampGuard(id); if (r.ok) UI.snd('build'); else { UI.snd('bad'); UI.toast(r.msg, 'bad'); } } } });
    var dimBtn = h('button.btn.sm.alt', { text: 'Dismiss', on: { click: function () { var r = a.dismissCampGuard(id); if (r.ok) UI.snd('click'); else UI.snd('bad'); } } });
    secBox.appendChild(h('div.btnrow', hireBtn, dimBtn));
    secBox.appendChild(h('div.nt', { text: '1 bodyguard is included. Extra bodyguards cost ' + fmt(90) + '/day and deter predators around the tents. Nearby Ranger posts also add +1 security.' }));
    var refund = Math.floor(def.cost * 0.5);
    var demo = P.confirmBtn(ic('trash') + 'Demolish', 'Demolish for +' + fmt(refund) + '?', function () { Z.Sim.bulldoze(o.i, o.j); UI.snd('build'); UI.Panel.hide(); }, 'alt');
    b.appendChild(stBox); b.appendChild(secBox); b.appendChild(h('div.btnrow', demo));
    P.setCur({
      kind: 'object', update: function () {
        var i = a.campInfo(id); if (!i || !find(Z.state.objects, id)) return false;
        setRow(rConn, i.viaPath && i.viaSafari ? 'Path + Safari shuttle' : i.viaSafari ? 'Safari shuttle' : i.viaPath ? 'Path connected' : 'Unreachable', i.connected ? 'ok' : 'bad');
        setRow(rRate, fmt(i.nightlyPrice) + '/night' + (i.bonusPct ? ' (+' + i.bonusPct + '% reserve)' : ''));
        setRow(rWild, i.dinos + ' dinos (' + i.species + ' species' + (i.predators ? ', ' + i.predators + ' predators' : '') + ')');
        setRow(rBeds, i.campers + ' / ' + i.capacity + ' (' + i.nightsSold + ' nights sold)');
        setRow(rRev, fmt(i.income));
        setRow(rG, i.guards + ' / ' + i.maxGuards + (i.rangerNear ? ' (+1 Ranger post)' : ''));
        setRow(rSec, i.safe ? 'Protected perimeter' : ('Needs ' + i.neededGuards + ' guards!'), i.safe ? 'ok' : 'bad');
        warn.textContent = !i.connected ? 'Connect a path or run a Safari route within 6 tiles so VIP campers can reach the camp.' : (!i.safe ? 'Predators nearby! Hire more bodyguards or place a Ranger post.' : '');
        hireBtn.disabled = i.guards >= i.maxGuards || Z.state.money < i.guardCost;
        dimBtn.disabled = i.guards <= 0;
        return true;
      }
    });
    return true;
  }

  // ---------------------------------------------------------------- zone block in the enclosure panel
  U.encBlock = function (id) {
    var a = A(), el = h('div.sfx', { style: 'display:none' }), key = '';
    function update() {
      var enc = find(Z.state.enclosures, id), z = a && enc && a.zoneInfo(id); if (!z || (!z.eligible && !z.safari)) { el.style.display = 'none'; return; }
      var st = Z.state.safari.stats, k = JSON.stringify([z, a.awayList().length, st.wildSeen, st.kills]); if (k === key) return; key = k;
      el.style.display = ''; el.innerHTML = '';
      el.appendChild(h('h4', { text: z.safari ? 'Safari zone' : 'Open range' }));
      function row(l, v, c) { var r = mrow(l, c); r._v.textContent = v; el.appendChild(r); }
      row('Safari status', z.safari ? 'Open for tours' : 'No tour route yet', z.safari ? 'ok' : '');
      if (z.routes.length) row('Riders in the zone', String(z.onboard));
      row('Connected to outside', z.connected ? (z.open ? 'Wildlife corridor open' : 'Corridor closed') : (z.virtual ? 'Not connected' : 'Walled in'), z.connected && z.open ? '' : '');
      row('Wild visitors here', String(z.wild));
      row('Seen / killed (all zones)', st.wildSeen + ' / ' + st.kills);
      var cs = z.containment; if (cs) { row('Containment', cs.ok ? 'Holding' : 'Not holding', cs.ok ? 'ok' : 'bad'); (cs.reasons || []).forEach(function (w) { el.appendChild(h('div.mw', { text: w })); }); }
      row('Power', z.powered ? 'On' : (z.backup ? 'On backup' : 'Off'), z.powered ? 'ok' : 'bad');
      if (z.shutters) el.appendChild(h('div.mw', { text: 'Battery shutters closed' + (z.shutLeft ? ': ' + z.shutLeft + ' s of charge' : '') + '. Wildlife and animals are sealed in.' }));
      if (z.connected || z.safari) {
        el.appendChild(h('div.btnrow',
          h('button.btn.sm' + (z.open ? '.alt' : ''), { html: ic(z.open ? 'close' : 'plus') + (z.open ? 'Close corridor' : 'Open corridor'), on: { click: function () { a.setCorridor(id, !z.open); UI.snd('click'); key = ''; update(); } } }),
          h('button.btn.sm' + (z.lockdown ? '.warn' : '.alt'), { html: ic('bell') + (z.lockdown ? 'Lift lockdown' : 'Lockdown ' + fmt(SD.escape.lockdownCost)), on: { click: function () { var r = a.setLockdown(!z.lockdown); if (!r.ok) { UI.toast(r.msg, 'bad'); UI.snd('bad'); } else UI.snd('click'); key = ''; update(); } } })));
        el.appendChild(h('div.nt', { text: z.connected ? 'Open land lets deer, seals and gulls wander in, and a power cut leaks both ways. Place a scarecrow, pinger or bird scarer to keep them out. Rangers help if a gate sticks.' : 'A zone with a gate and corridor marker can take wildlife.' }));
      }
      var away = a.awayList(); if (away.length) el.appendChild(h('div.mw', { text: away.length + ' animal' + (away.length === 1 ? '' : 's') + ' still unaccounted for beyond the park.' }));
    }
    update(); return { el: el, update: update };
  };

  // ---------------------------------------------------------------- banners, ride-along bar
  Z.bus.on('safariStranded', function (e) { if (!e || !e.vehicle) return; var v = e.vehicle; UI.banner({ title: 'Safari stranded', text: (e.n || 'Guests') + ' guests are stuck in ' + vname(v) + '. Open the vehicle to send help.', kind: 'alert', jump: function () { var p = A().pose(v.id); if (p) Z.World.focus(p.x, p.z, 28); if (UI.Panel && !UI.tool) UI.Panel.open('safari_veh', v.id); } }); UI.snd && UI.snd('alarm'); });
  Z.bus.on('mainlandSighting', function (e) { if (!e) return; UI.banner({ title: 'Mainland sighting!', text: 'A ' + ((UI.sp(e.species) || {}).name || 'dinosaur') + ' was seen beyond the park.' + (e.fine ? ' Fined ' + fmt(e.fine) + '.' : ''), kind: 'alert' }); UI.snd && UI.snd('alarm'); });
  var rideBar = null;
  Z.bus.on('safariRide', function (e) {
    if (!rideBar) { rideBar = h('div#sfRide', h('span', { text: 'On safari' }), h('button', { text: 'Get off', on: { click: function () { Z.SafariWorld.endRide(); } } })); document.body.appendChild(rideBar); }
    rideBar.classList.toggle('on', !!(e && e.on));
  });
  (function () { var P = UI.Panel; if (!P || !P.hide) return; var oh = P.hide; P.hide = function () { if (Z.SafariWorld && Z.SafariWorld.followId && !Z.SafariWorld.rideId) Z.SafariWorld.followId = 0; return oh.apply(this, arguments); }; })();

  // ---------------------------------------------------------------- guide
  U.guideSection = function () {
    return ['safari', 'Safari', function () {
      var E = SD.escape, rows = [
        ['Safari zones', 'Any big open zone (fenced land, a tagging-tower zone, a sea pen or sky zone) can be a safari: at least ' + SD.minZone + ' tiles, with a tour route running ' + SD.minInside + ' tiles or more inside. Mixed species are fine, and predators still hunt.'],
        ['Safe entry', 'Fenced land uses a Safari gate, an airlock whose two doors never open together. A tagging-tower zone uses a Safari portal: cattle grid, bollards and boom. Sea pens use a boat lock. All need power. Keep the road straight for two tiles either side.'],
        ['Depot and route', 'Build a depot (trucks), harbour (tour boats) or balloon pad. Then choose Draw route and drag from the bay through the zone. A loop runs round and round, otherwise vehicles go out and back. Route cost ' + fmt(SD.trackCost) + ' a tile.'],
        ['Vehicles', 'Trucks ' + fmt(SD.truckCost) + ', boats ' + fmt(SD.boatCost) + ', balloons ' + fmt(SD.balloonCost) + '. Up to ' + SD.maxVeh + ' per route. Guests queue, board and ride for a fare you set. A ride gives a big viewing bonus, close encounters and moments feeding from the truck. Tap a vehicle, then Ride along.'],
        ['Wildlife visitors', 'Open zones are connected: deer, boar, goats and rabbits wander in on land, seals and dolphins at sea, gulls and herons in the air. Predators hunt them, sometimes in front of guests. Stories vary from nature documentaries to protests, and protected species can bring a fine. Close the corridor or place deterrents to keep them out.'],
        ['Power cuts', 'If a connected zone loses power with no backup, it leaks both ways. Gates lock and vehicles wait for rangers. An animal that reaches the causeway, open sea or sky is a mainland sighting: the worst story, fines, possible closure, and an expensive recapture. Keep a backup generator, use Lockdown (' + fmt(E.lockdownCost) + '), and hire rangers.'],
        ['Stranded', 'A breakdown or gate that locks leaves riders waiting. Send a ranger or engineer from the vehicle panel. Real danger exists only if the zone stops holding.']
      ];
      return rows.map(function (r) { return h('div.box.gd-card', h('div.gd-head', h('span.gd-em', { text: '🚙' }), h('div', h('b', { text: r[0] }))), h('div.gd-info', { text: r[1] })); });
    }, 'Drive, sail or float guests through open range, and keep what is outside out and what is inside in.'];
  };
})();
