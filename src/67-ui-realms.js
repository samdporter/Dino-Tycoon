// ===== 67-ui-realms.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - realms UI: the Marine, Aviary and Tagging build categories, the area tool (tank, Thunder Dome, virtual zones) and the walkway
   tool (tunnel, pier, mesh walk, skywalk), enclosure and object panel blocks, the species requirement rows, the Hatch realm filter and the Guide.
   All behaviour lives in Z.Realms (26-sim-realms.js); this file only draws it.
   Hooks used: UI.extraCats / UI.onCard / UI.openCat (50-ui), Tools.stripHook / Tools.PLAN / Tools.refresh (51-tools), UI.Realms.* (50-ui, 52-panels, 57-guide). */
(function () {
  'use strict';
  var UI = Z.UI = Z.UI || {}, D = Z.DATA, h = UI.h, fmt = UI.fmt, ic = UI.ic, N = Z.N;
  var RL = UI.Realms = {}, RD = D.realms, T = UI.Tools;
  function R() { return Z.Realms; }
  function find(a, id) { for (var k = 0; k < a.length; k++) if (a[k].id === id) return a[k]; return null; }
  function metres(u) { return Math.round(u * 16) / 10; }

  var css = '.realmbox{margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(40,150,150,.10);border:1px solid rgba(40,150,150,.30);font-size:12.5px}' +
    '.realmbox h4{margin:0 0 4px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}' +
    '.realmbox .rrow{display:flex;justify-content:space-between;gap:8px;padding:1px 0}.realmbox .rrow.ok b{color:var(--good)}.realmbox .rrow.bad,.realmbox .rrow.bad b{color:var(--bad)}' +
    '.realmbox .rwarn{color:var(--bad);margin:2px 0}.realmbox .rbar{height:7px;border-radius:4px;background:rgba(0,0,0,.12);overflow:hidden;margin:3px 0 4px}.realmbox .rbar i{display:block;height:100%;background:#2f9e9e}' +
    '.realmbox .rbar.low i{background:var(--bad)}.realmbox .rbtn{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap}' +
    '.realmbox .rtags{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.realmbox .rtag{padding:1px 7px;border-radius:9px;background:rgba(0,0,0,.08);font-size:11.5px}.realmbox .rtag.no{background:rgba(190,50,40,.18);color:var(--bad)}' +
    '.card{position:relative}.rbadge{position:absolute;top:4px;left:4px;font:800 9px var(--sans);letter-spacing:.06em;padding:1px 5px;border-radius:7px;color:#fff;z-index:2}.rbadge.sea{background:#2778b5}.rbadge.air{background:#7a5bb5}' +
    '.rreq{font-size:12.5px;line-height:1.35}.rreq div{padding:1px 0}.rnote{font-size:12px;color:var(--ink2);font-style:italic;margin-top:3px}' +
    '.gd-rl .gd-info{font-size:12.5px}.gd-rl .gd-note{font-size:12px;color:var(--ink2);font-style:italic;margin:3px 0}';
  var st = document.createElement('style'); st.setAttribute('data-realms', '1'); st.textContent = css; document.head.appendChild(st);

  // ---------------------------------------------------------------- species facts
  var KIND_NOTE = {
    ichthyosaurus: 'Not a dinosaur: an ichthyosaur, a dolphin-shaped marine reptile that gave birth to live young at sea.',
    archelon: 'Not a dinosaur: the largest sea turtle that ever lived. It lays eggs on a beach.',
    elasmosaurus: 'Not a dinosaur: a plesiosaur, a marine reptile with a very long neck. Gave birth to live young.',
    liopleurodon: 'Not a dinosaur: a pliosaur, a short-necked marine reptile and an apex hunter.',
    mosasaurus: 'Not a dinosaur: a giant marine lizard, a distant cousin of the monitors. It needs the strongest barrier.',
    dimorphodon: 'Not a dinosaur: a small pterosaur (flying reptile) with a big head.',
    rhamphorhynchus: 'Not a dinosaur: a pterosaur with a long tail, a fish-eater.',
    pteranodon: 'Not a dinosaur: a pterosaur, a flying reptile. Needs open air and a fish supply.',
    quetzalcoatlus: 'Not a dinosaur: one of the largest flying animals ever. Needs a tall Grand dome and reinforced mesh.',
    seagull: 'A living bird, and birds are the living descendants of dinosaurs. Wild: it cannot be hatched.',
    heron: 'A living bird, descended from dinosaurs. Wild: it cannot be hatched.',
    seal: 'A living mammal, not a reptile. Wild: it cannot be hatched.',
    dolphin: 'A living mammal, not a reptile. Wild: it cannot be hatched.',
    fish_shoal: 'Ordinary fish. Wild: a shoal drifts in by itself.'
  };
  RL.realmOf = function (sp) { return (sp && sp.realm) || 'land'; };
  RL.hatchTip = function (sp) {
    var rl = RL.realmOf(sp);
    return rl === 'sea' ? sp.name + ': a marine reptile (not a dinosaur). Needs a lagoon tank, sea pen or virtual sea zone.' : rl === 'air' ? sp.name + ': a flying reptile (not a dinosaur). Needs the Thunder Dome or a virtual sky zone.' : undefined;
  };
  RL.hatchShows = function (sp) { return !UI.hatchRealm || UI.hatchRealm === 'all' || RL.realmOf(sp) === UI.hatchRealm; };
  RL.hatchFor = function (encId) {
    var e = find(Z.state.enclosures, encId); UI.hatchRealm = e ? (e.kind ? e.realm : 'land') : null; UI._hf = true;
  };
  RL.hatchMore = function () {
    if (!UI.hatchRealm || UI.hatchRealm === 'all') return [];
    var nm = UI.hatchRealm === 'sea' ? 'marine animals' : UI.hatchRealm === 'air' ? 'flying animals' : 'land animals';
    return [{ kind: 'rhatch', id: 'all', name: 'Show all', cost: 0, star: 0, priceHtml: 'Now: ' + nm, tip: 'Only ' + nm + ' are listed because they suit the enclosure you came from. Tap to show every species.',
      iconHtml: '<svg viewBox="0 0 64 48" width="100%" height="100%"><rect width="64" height="48" fill="#e8dfc4"/><text x="32" y="30" text-anchor="middle" font-size="13" font-weight="700" fill="#5a4328">ALL</text></svg>' }];
  };
  var openCat0 = UI.openCat;
  UI.openCat = function (id, noToggle) {
    if (id === 'hatch') { if (UI._hf) UI._hf = false; else UI.hatchRealm = null; }
    return openCat0.apply(this, arguments);
  };

  // ---------------------------------------------------------------- card icons
  function svg(inner) { return '<svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true">' + inner + '</svg>'; }
  function tankIcon(lvl) {
    var dd = 8 + lvl * 4;
    return svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="7" y="9" width="50" height="30" rx="3" fill="#d9eef2" stroke="#fff" stroke-width="2"/><rect x="10" y="12" width="44" height="24" fill="' + (lvl === 1 ? '#6cc1d6' : lvl === 2 ? '#3e9dbd' : '#1f6f95') + '"/>' +
      '<path d="M14 30c4-3 7 3 11 0s7 3 11 0 7 3 11 0" stroke="#fff" stroke-opacity=".45" fill="none" stroke-width="1.5"/><ellipse cx="28" cy="22" rx="' + (4 + lvl) + '" ry="2.5" fill="#34506a"/><text x="55" y="45" text-anchor="end" font-size="8" font-weight="700" fill="#2d4a2a">' + dd + 'm</text>');
  }
  function domeIcon(lvl) {
    var r = 14 + lvl * 3;
    return svg('<rect width="64" height="48" fill="#a8c47a"/><path d="M' + (32 - r) + ' 40A' + r + ' ' + (r + 4) + ' 0 0 1 ' + (32 + r) + ' 40Z" fill="#cfe3ea" fill-opacity=".55" stroke="#4a5a60" stroke-width="1.6"/>' +
      '<path d="M' + (32 - r) + ' 40L32 ' + (40 - r - 4) + 'L' + (32 + r) + ' 40M' + (32 - r * 0.5) + ' 40L32 ' + (40 - r - 4) + 'L' + (32 + r * 0.5) + ' 40M' + (32 - r * 0.85) + ' ' + (40 - r * 0.55) + 'H' + (32 + r * 0.85) + '" stroke="#4a5a60" stroke-width="1" fill="none"/><path d="M26 24l4-3 3 3-3 1zM37 18l3-2 2 2-2 1z" fill="#6a4a8a"/>');
  }
  function zoneIcon(realm) {
    var fill = realm === 'sea' ? '#3d8fd0' : realm === 'air' ? '#8fb6e8' : '#a8c47a';
    return svg('<rect width="64" height="48" fill="' + (realm === 'sea' ? '#2a6fa8' : '#a8c47a') + '"/><rect x="9" y="9" width="46" height="30" fill="' + fill + '" fill-opacity=".5" stroke="#7af0ff" stroke-width="2" stroke-dasharray="4 3"/>' +
      '<circle cx="9" cy="9" r="2.6" fill="#ffd34a"/><circle cx="55" cy="9" r="2.6" fill="#ffd34a"/><circle cx="9" cy="39" r="2.6" fill="#ffd34a"/><circle cx="55" cy="39" r="2.6" fill="#ffd34a"/>' +
      (realm === 'air' ? '<path d="M24 26l8-6 8 6-8-2z" fill="#4a3a6a"/>' : realm === 'sea' ? '<ellipse cx="32" cy="24" rx="8" ry="3.5" fill="#173a5a"/>' : '<ellipse cx="32" cy="25" rx="8" ry="4.5" fill="#6b8f45"/><circle cx="38" cy="21" r="2" fill="#6b8f45"/>'));
  }
  function walkIcon(w) {
    if (w === 'tunnel') return svg('<rect width="64" height="48" fill="#2a79ae"/><path d="M6 40V26a26 20 0 0 1 52 0v14z" fill="#b9e3f0" fill-opacity=".55" stroke="#e8fbff" stroke-width="2"/><rect x="6" y="36" width="52" height="4" fill="#8a8f93"/><circle cx="26" cy="22" r="2.2" fill="#fff"/><path d="M36 20c3-3 6-3 9 0-3 3-6 3-9 0z" fill="#173a5a"/>');
    if (w === 'pier') return svg('<rect width="64" height="48" fill="#3d8fd0"/><rect x="26" y="0" width="12" height="48" fill="#b79a6a"/><rect x="29" y="4" width="6" height="40" fill="#cfeaf2" fill-opacity=".8"/><path d="M8 14c3-2 6 2 9 0M44 34c3-2 6 2 9 0" stroke="#fff" stroke-opacity=".5" fill="none" stroke-width="1.5"/>');
    if (w === 'mesh') return svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="24" y="0" width="16" height="48" fill="#9aa3a8"/><path d="M24 6h16M24 14h16M24 22h16M24 30h16M24 38h16M28 0v48M32 0v48M36 0v48" stroke="#4d5559" stroke-width="1"/>');
    return svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="21" y="0" width="22" height="48" rx="6" fill="#aeb7bd" stroke="#5a6468" stroke-width="2"/><rect x="26" y="3" width="12" height="42" rx="3" fill="#cfe3ea" fill-opacity=".6"/>');
  }
  function eyeIcon() { return svg('<rect width="64" height="48" fill="#a8c47a"/><rect x="6" y="14" width="52" height="20" fill="#7af0ff" fill-opacity=".45" stroke="#7af0ff" stroke-width="2" stroke-dasharray="4 3"/><circle cx="32" cy="24" r="6" fill="#fff"/><circle cx="32" cy="24" r="3" fill="#2a4a6a"/>'); }

  // ---------------------------------------------------------------- build categories
  var AREA = {
    tank: { name: 'Lagoon tank', realm: 'sea', kind: 'tank' },
    dome: { name: 'Thunder Dome', realm: 'air', kind: 'dome' },
    zl: { name: 'Land zone', realm: 'land', kind: 'virtual' },
    zs: { name: 'Sea zone', realm: 'sea', kind: 'virtual' },
    za: { name: 'Sky zone', realm: 'air', kind: 'virtual' }
  };
  var WALK = { tunnel: 'acrylic_tunnel', mesh: 'mesh_walk', pier: 'glass_pier', sky: 'skywalk' };
  function walkDef(w) { return find(D.paths, WALK[w]); }
  function areaItem(id) {
    var a = AREA[id], star = R().starNeeded(a.kind, a.realm), cost, unit = '/tile', icon, tip;
    if (id === 'tank') { cost = RD.tank.levels[0].cost; icon = tankIcon(2); tip = 'Dig a sunken basin on dry land with acrylic walls. Choose the depth and wall strength. Needs a pump or a sea connection. Volume is area times depth.'; }
    else if (id === 'dome') { cost = Math.round(RD.dome.heights[0].cost * RD.dome.meshes[0].mult); icon = domeIcon(2); tip = 'A geodesic mesh dome for flying animals. Height and mesh strength matter. Add perches and a fish pool.'; }
    else { cost = RD.virtual.tileCost[id === 'za' ? 'sky' : id === 'zs' ? 'sea' : 'land']; icon = zoneIcon(a.realm); tip = 'Paint a zone with no fence. Animals wear tags and a Tagging control tower holds them in with an invisible geofence. Needs power.'; }
    return { kind: 'rarea', id: id, name: a.name, cost: cost, unit: unit, star: star, iconHtml: icon, tip: tip, sub: 'from' };
  }
  function walkItem(w) {
    var d = walkDef(w), star = w === 'tunnel' || w === 'pier' ? 2 : 3;
    return { kind: 'rwalk', id: w, name: d.name, cost: d.cost, unit: '/tile', star: star, iconHtml: walkIcon(w), tip: d.blurb };
  }
  function bld(id) { var d = UI.byId(D.buildings, id); return { kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, fp: [d.w || 1, d.h || 1] }; }
  function scn(id) { var d = UI.byId(D.scenery, id); return { kind: 'scenery', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0 }; }
  function netIcon(str) {
    var col = str >= 5 ? '#8a949a' : str >= 4 ? '#d9822b' : '#e8dcc0', fl = str >= 5 ? '#5a6468' : str >= 4 ? '#e8742a' : '#e24a3a';
    return svg('<rect width="64" height="48" fill="#3d8fd0"/><path d="M0 34c8-3 10 3 18 0s10 3 18 0 10 3 18 0 8 2 10 0V48H0z" fill="#2a79ae"/><path d="M4 18H60" stroke="' + col + '" stroke-width="2"/>' +
      '<path d="M4 18V36M12 18V36M20 18V36M28 18V36M36 18V36M44 18V36M52 18V36M60 18V36M4 24H60M4 30H60" stroke="' + col + '" stroke-width="1" opacity=".85"/>' + [4, 20, 36, 52].map(function (x) { return '<circle cx="' + x + '" cy="18" r="3.2" fill="' + fl + '"/>'; }).join(''));
  }
  function net(id) { var d = UI.byId(D.fences, id); return { kind: 'fence', id: id, name: d.name, cost: d.cost, unit: '/panel', def: d, star: 0, sub: 'Str ' + d.strength, tip: d.blurb, iconHtml: netIcon(d.strength) }; }
  function marine() { return [areaItem('tank'), net('sea_net'), net('steel_sea_mesh'), net('armoured_sea_barrier'), walkItem('tunnel'), walkItem('pier'), bld('underwater_gallery'), bld('feeding_grandstand'), bld('filtration_plant'), bld('boathouse'), scn('kelp_bed'), scn('reef_block'), scn('fish_feeder')]; }
  function aviary() { return [areaItem('dome'), walkItem('mesh'), bld('canopy_tower'), bld('drone_hangar'), scn('perch_crag'), scn('perch_pole'), scn('fish_pool')]; }
  function tagging() {
    var on = Z.RealmsWorld && Z.RealmsWorld.overlayOn && Z.RealmsWorld.overlayOn();
    return [bld('tagging_tower'), areaItem('zl'), areaItem('zs'), areaItem('za'), walkItem('sky'),
      { kind: 'rview', id: 'overlay', name: 'Zone overlay', cost: 0, star: 0, iconHtml: eyeIcon(), priceHtml: on ? 'On' : 'Off', tip: 'Show geofences, tower range and tag coverage. Red means a zone is not holding.' }];
  }
  UI.extraCats = (UI.extraCats || []).concat([
    { id: 'marine', name: 'Marine', icon: 'wave', items: marine, hint: 'Tanks, sea pens and underwater viewing for sea animals.' },
    { id: 'aviary', name: 'Aviary', icon: 'wing', items: aviary, hint: 'The Thunder Dome and viewing for pterosaurs and birds.' },
    { id: 'tagging', name: 'Tagging', icon: 'radar', items: tagging, hint: 'Fence-free virtual enclosures held by tagging towers.' }
  ]);

  RL.costOf = function (k, id) {
    if (k === 'rarea') return areaItem(id).cost;
    if (k === 'rwalk') return walkDef(id).cost;
    if (k === 'rview' || k === 'rhatch') return 0;
    return undefined;
  };

  var origCard = UI.onCard;
  UI.onCard = function (it, locked) {
    if (it.kind === 'rhatch') { UI.hatchRealm = 'all'; UI.refreshCards && UI.refreshCards(); return; }
    if (it.kind === 'rview') {
      var on = !Z.RealmsWorld.overlayOn(); Z.RealmsWorld.setOverlay(on);
      UI.toast(on ? 'Zone overlay on: geofences, tower range and tag cover.' : 'Zone overlay off', 'info'); UI.refreshCards && UI.refreshCards(); return;
    }
    if (it.kind === 'rarea' || it.kind === 'rwalk') {
      if (locked) { UI.toast('Needs a ' + it.star + '-star park. Keep improving your rating!', 'info'); return; }
      T.start({ kind: it.kind, id: it.id, name: it.name, def: it.def }); return;
    }
    return origCard.apply(this, arguments);
  };

  // ---------------------------------------------------------------- the area and walkway tools
  var HINT = {
    tank: 'Drag a rectangle on dry, level land. The basin is dug for you.', dome: 'Drag a rectangle for the dome floor.',
    zl: 'Paint a zone on land. A tagging tower must cover it.', zs: 'Paint a zone on sea water. A tagging tower must cover it.', za: 'Paint a zone; the airspace above it is the sky zone.'
  };
  var prevStrip = T.stripHook;
  T.stripHook = function (t, s, seg) {
    if (prevStrip) prevStrip(t, s, seg);
    if (t.kind === 'rwalk') { var sm = s.querySelector('.tname small'); if (sm) sm.textContent = walkDef(t.id).blurb + ' Drag a straight run; join both ends to a path.'; return; }
    if (t.kind !== 'rarea') return;
    var P = UI.prefs, sm2 = s.querySelector('.tname small'); if (sm2 && !t.move) sm2.textContent = HINT[t.id] || '';
    t.lvl = t.lvl || P.rlvl || (t.id === 'dome' ? 2 : 1); t.wall = t.wall || P.rwall || 1; t.mesh = t.mesh || P.rmesh || 1; t.band = t.band || P.rband || 1; t.zmode = t.zmode || P.rzmode || 'rect'; t.zbrush = t.zbrush || P.rzbrush || 2;
    if (t.id === 'tank') {
      s.appendChild(seg(RD.tank.levels.map(function (l) { return [l.id, l.name.split(' ')[0] + ' ' + l.label]; }), t.lvl, function (v) { t.lvl = P.rlvl = +v; T.refresh(); }));
      s.appendChild(seg(RD.tank.walls.map(function (l) { return [l.id, 'Str ' + l.strength]; }), t.wall, function (v) { t.wall = P.rwall = +v; T.refresh(); }));
    } else if (t.id === 'dome') {
      s.appendChild(seg(RD.dome.heights.map(function (l) { return [l.id, l.label]; }), t.lvl, function (v) { t.lvl = P.rlvl = +v; T.refresh(); }));
      s.appendChild(seg(RD.dome.meshes.map(function (l) { return [l.id, 'Str ' + l.strength]; }), t.mesh, function (v) { t.mesh = P.rmesh = +v; T.refresh(); }));
    } else {
      if (t.id === 'za') s.appendChild(seg(RD.virtual.bands.map(function (l) { return [l.id, l.label]; }), t.band, function (v) { t.band = P.rband = +v; T.refresh(); }));
      s.appendChild(seg([['rect', 'Rectangle'], ['paint', 'Paint']], t.zmode, function (v) { t.zmode = P.rzmode = v; T.refresh(); }));
      if (t.zmode === 'paint') s.appendChild(seg([[1, 'S'], [2, 'M'], [3, 'L']], t.zbrush, function (v) { t.zbrush = P.rzbrush = +v; T.refresh(); }));
    }
  };
  function sea(t) { var m = Z.realmCtx.seaMask(); return !!m[t]; }
  function areaTiles(t, d) {
    var a = d.a, b = d.b || d.a, set = {}, out = [], i, j, k;
    function add(i, j) { if (!Z.inb(i, j)) return; var q = i + j * N; if (!set[q]) { set[q] = 1; out.push(q); } }
    if (t.id.charAt(0) === 'z' && t.zmode === 'paint') {
      var r = t.zbrush - 1;
      for (k = 0; k < d.pts.length; k++) for (j = -r; j <= r; j++) for (i = -r; i <= r; i++) if (i * i + j * j <= r * r + 0.5) add(d.pts[k].i + i, d.pts[k].j + j);
    } else {
      for (j = Math.min(a.j, b.j); j <= Math.max(a.j, b.j); j++) for (i = Math.min(a.i, b.i); i <= Math.max(a.i, b.i); i++) add(i, j);
    }
    // ignore tiles of the wrong kind of ground so a loose rectangle still works
    var spec = AREA[t.id], mapT = Z.Sim.inMap;
    return out.filter(function (q) {
      var qi = q % N, qj = (q - qi) / N; if (mapT && !mapT(qi, qj)) return false;
      if (spec.kind === 'virtual' && spec.realm === 'sea') return sea(q);
      if (spec.kind === 'virtual' && spec.realm === 'land') return !sea(q);
      if (spec.kind === 'tank') return !sea(q) && Z.state.terrain[q] !== Z.DATA.terrain.findIndex(function (x) { return x.id === 'water'; });
      return !sea(q);
    });
  }
  function pathNear(tiles) {   // QA: keepers only service an enclosure with a path or walkway within 3 tiles (the sim's viewTiles rule)
    var S = Z.state, set = {}, seen = {}, q = [], k, d, nxt;
    tiles.forEach(function (t) { set[t] = 1; seen[t] = 1; q.push(t); });
    for (d = 0; d < 3; d++) {
      nxt = [];
      for (k = 0; k < q.length; k++) {
        var t = q[k], i = t % N, j = (t - i) / N;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { var ai = i + o[0], aj = j + o[1]; if (!Z.inb(ai, aj)) return; var at = ai + aj * N; if (seen[at]) return; seen[at] = 1; if (S.path[at] && !set[at]) nxt.push(-1 - at); else nxt.push(at); });
      }
      for (k = 0; k < nxt.length; k++) if (nxt[k] < 0) return true;
      q = nxt;
    }
    return false;
  }
  T.PLAN.rarea = function (d) {
    var t = UI.tool, a = AREA[t.id], tiles = areaTiles(t, d), p = { lvl: t.lvl, wall: t.wall, mesh: t.mesh, band: t.band };
    var spec = function (ok) { return { type: 'tiles', tiles: tiles.map(function (q) { return { i: q % N, j: (q - q % N) / N }; }), ok: ok }; };
    if (!tiles.length) return { spec: spec(false), ok: false, cost: 0, n: 0, msg: a.realm === 'sea' && a.kind === 'virtual' ? 'A sea zone must be painted on sea water' : 'Nothing buildable here', label: '' };
    var small = !!d.committing && t.zmode !== 'paint' && d.moved === false && a.kind !== 'virtual';
    var r = R().place(a.kind, a.realm, tiles, p, { dry: true }), ok = !!r.ok && !small, label = '', warn = '';
    if (r.ok) {
      label = r.n + ' tile' + (r.n > 1 ? 's' : '');
      if (a.kind === 'tank') label += ', ' + RD.tank.levels[t.lvl - 1].label + ' deep';
      if (a.kind === 'dome') label += ', ' + RD.dome.heights[t.lvl - 1].label + ' high';
      if (r.merged) warn = 'joins an existing one';
      if (a.kind === 'virtual') warn = 'tower needed in range';
      if (!pathNear(tiles)) warn = (warn ? warn + '; ' : '') + 'no path or pier within 3 tiles, so keepers could not feed its animals';
    }
    return { spec: spec(ok), ok: ok, cost: r.cost || 0, n: r.n || 0, msg: small ? 'Drag out an area' : (r.ok ? '' : (r.msg || 'Cannot build here')), label: label, warn: warn,
      run: function () { var q = R().place(a.kind, a.realm, tiles, p); if (!q.ok) return { n: 0, cost: 0 }; if (UI.toast && a.kind === 'virtual') UI.toast('Zone painted. Place a Tagging control tower in range, then tag animals by hatching them here.', 'good'); return { n: q.n, cost: q.cost }; } };
  };
  T.PLAN.rwalk = function (d) {
    var t = UI.tool, a = d.a, b = d.b || d.a, tiles = [], i, j;
    if (Math.abs(b.i - a.i) >= Math.abs(b.j - a.j)) { var s1 = a.i <= b.i ? 1 : -1; for (i = a.i; i !== b.i + s1; i += s1) tiles.push(i + a.j * N); }
    else { var s2 = a.j <= b.j ? 1 : -1; for (j = a.j; j !== b.j + s2; j += s2) tiles.push(a.i + j * N); }
    var r = R().placeWalk(tiles, t.id, { dry: true });
    return { spec: { type: 'tiles', tiles: tiles.map(function (q) { return { i: q % N, j: (q - q % N) / N }; }), ok: !!r.ok }, ok: !!r.ok, cost: r.cost || 0, n: r.n || 0, msg: r.ok ? '' : (r.msg || 'Cannot build here'),
      label: r.ok ? r.n + ' tile' + (r.n > 1 ? 's' : '') : '', warn: r.ok && r.warn ? r.warn : '',
      run: function () { var q = R().placeWalk(tiles, t.id); if (q.ok && q.warn && UI.toast) UI.toast(q.warn, 'info'); return { n: q.ok ? q.n : 0, cost: q.cost || 0 }; } };
  };

  // ---------------------------------------------------------------- panels
  function row(cls, k, v) { return h('div.rrow' + (cls ? '.' + cls : ''), h('span', { text: k }), h('b', { text: v })); }
  function bar(v, low) { return h('div.rbar' + (low ? '.low' : ''), h('i', { style: 'width:' + Math.round(Math.max(0, Math.min(1, v)) * 100) + '%' })); }
  RL.encBlock = function (id) {
    var el = h('div.realmbox'), key = '';
    function update() {
      var enc = find(Z.state.enclosures, id); if (!enc) return;
      var r = R().report(enc); if (!r) { el.style.display = 'none'; return; }
      var k = JSON.stringify([r, enc.species]); if (k === key) return; key = k;
      el.style.display = ''; el.innerHTML = '';
      el.appendChild(h('h4', { text: r.label.charAt(0).toUpperCase() + r.label.slice(1) }));
      var okc = r.status.ok ? 'ok' : 'bad';
      el.appendChild(row(okc, 'Containment', r.status.ok ? 'Holding' : 'Not holding'));
      r.status.reasons.forEach(function (w) { el.appendChild(h('div.rwarn', { text: w })); });
      if (r.kind === 'tank') {
        el.appendChild(row('', 'Size', r.area + ' tiles, ' + r.level.label + ' deep (' + Math.round(r.vol || 0) + ' units of water)'));
        el.appendChild(row('', 'Walls', r.wall.name + ' (strength ' + r.wall.strength + ')'));
        el.appendChild(row(r.supply.supplied ? 'ok' : 'bad', 'Salt water', r.supply.intake ? 'Sea connection' : r.supply.plant ? 'Filtration plant' : 'No supply'));
        el.appendChild(row(r.powered ? 'ok' : 'bad', 'Filtration', r.supply.filter === 'off' ? 'Off' : r.supply.filter === 'ok' ? 'Running' : 'Basic'));
        var q = r.wq === undefined ? 1 : r.wq; el.appendChild(row(q < 0.4 ? 'bad' : '', 'Water quality', Math.round(q * 100) + '%')); el.appendChild(bar(q, q < 0.4));
      } else if (r.kind === 'dome') {
        el.appendChild(row('', 'Size', r.area + ' tiles, ' + r.height.label + ' high'));
        el.appendChild(row('', 'Mesh', r.mesh.name + ' (strength ' + r.mesh.strength + ')'));
        if (!r.powered) el.appendChild(h('div.rwarn', { text: 'On battery: door locks and tag backup are down.' }));
      } else if (r.kind === 'pen') {
        el.appendChild(row('', 'Size', r.area + ' tiles, ' + Math.round(r.vol || 0) + ' units of water'));
        el.appendChild(row('', 'Weakest net', 'strength ' + r.strength));
        if (r.salt === false) el.appendChild(h('div.rwarn', { text: 'Fresh water. Most marine animals need salt water.' }));
      } else if (r.kind === 'virtual') {
        var z = r.zone;
        el.appendChild(row(z.tower ? 'ok' : 'bad', 'Tagging tower', z.tower ? 'Level ' + z.lvl + ', ' + Math.round((z.cover || 0) * 100) + '% covered' : 'None in range'));
        el.appendChild(row(z.powered ? 'ok' : 'bad', 'Power', z.powered ? 'On' : 'Off: geofence down'));
        if (z.cap) el.appendChild(row(z.used > z.cap ? 'bad' : '', 'Tag capacity', z.used + ' of ' + z.cap));
        if (z.band) el.appendChild(row('', 'Airspace', z.band.name + ' ' + z.band.label));
        if (z.hold) el.appendChild(row('', 'Days without escape', String(z.hold)));
        if (r.tags && r.tags.length) el.appendChild(h('div.rtags', r.tags.map(function (g) { return h('span.rtag' + (g.tag ? '' : '.no'), { text: g.name + (g.tag ? '' : ' (no tag)') }); })));
        el.appendChild(h('div.rnote', { text: 'Tagged animals stay inside an invisible fence. Keep a ranger and a vet on hand: staff maintain tags.' }));
        el.appendChild(h('div.rbtn', h('button.btn.sm.alt', { text: 'Show overlay', on: { click: function () { Z.RealmsWorld.setOverlay(true); UI.toast('Zone overlay on', 'info'); } } })));
      }
    }
    update();
    return { el: el, update: update };
  };
  RL.objectBlock = function (id) {
    var el = h('div.realmbox'), key = '', shown = false;
    function update() {
      var i = R().objectInfo(id); if (!i) return;
      var k = JSON.stringify(i); if (k === key) return; key = k; el.innerHTML = '';
      if (i.tanks) {
        el.appendChild(h('h4', { text: 'Filtration' }));
        el.appendChild(row(i.powered ? 'ok' : 'bad', 'Power', i.powered ? 'On' : 'Off: water quality falling'));
        el.appendChild(row(i.load > i.capacity ? 'bad' : '', 'Water treated', i.load + ' of ' + i.capacity + ' units'));
        el.appendChild(bar(i.load / i.capacity, i.load > i.capacity));
        i.tanks.forEach(function (tk) { el.appendChild(row(tk.wq < 0.4 ? 'bad' : '', tk.name, 'quality ' + Math.round(tk.wq * 100) + '%')); });
        if (!i.tanks.length) el.appendChild(h('div.rnote', { text: 'No tank in range yet (about ' + i.radius + ' tiles).' }));
      } else {
        el.appendChild(h('h4', { text: 'Tagging tower, level ' + i.lvl }));
        el.appendChild(row(i.powered ? 'ok' : 'bad', 'Power', i.powered ? 'On' : 'Off: geofences down'));
        el.appendChild(row('', 'Range', i.radius + ' tiles'));
        el.appendChild(row(i.used > i.capacity ? 'bad' : '', 'Tags', i.used + ' of ' + i.capacity));
        el.appendChild(bar(i.used / i.capacity, i.used > i.capacity));
        el.appendChild(row('', 'Fence strength', String(i.strength)));
        i.zones.forEach(function (z) { el.appendChild(row(z.ok ? 'ok' : 'bad', z.name, z.animals + ' animals, ' + (z.ok ? 'holding' : 'not holding'))); });
        if (i.next) el.appendChild(h('div.rbtn', h('button.btn.sm.gold', { text: 'Upgrade ' + fmt(i.next.cost) + ': range ' + i.next.radius + ', ' + i.next.capacity + ' tags, strength ' + i.next.strength, on: { click: function () {
          var r = R().upgradeTower(id); if (r.ok) { UI.snd('build'); UI.toast('Tower upgraded', 'good'); key = ''; update(); } else { UI.snd('bad'); UI.toast(r.msg, 'bad'); }
        } } })));
      }
      el.appendChild(h('div.rbtn', h('button.btn.sm.alt', { text: 'Show range', on: { click: function () { Z.RealmsWorld.showRange(id); Z.RealmsWorld.setOverlay(true); } } })));
    }
    update();
    return { el: el, update: update };
  };
  RL.speciesRows = function (sp, row2) {
    var rl = RL.realmOf(sp), lines = R().requirements(sp.id || sp);
    if (rl === 'land') { if (lines[1]) row2('Zone', h('div.rreq', h('div', { text: lines[1].replace('Virtual zone tag: ', 'Virtual zone: tag ') }))); return; }
    var kids = lines.map(function (l) { return h('div', { text: l }); });
    if (KIND_NOTE[sp.id]) kids.push(h('div.rnote', { text: KIND_NOTE[sp.id] }));
    row2(rl === 'sea' ? 'Sea home' : 'Air home', h('div.rreq', kids));
  };
  RL.sortEncs = function (encs, spId) {
    var fit = [], rest = [];
    encs.forEach(function (e) { (R().fitsEnc(spId, e).ok ? fit : rest).push(e); });
    return fit.concat(rest);
  };

  // ---------------------------------------------------------------- guide
  function speciesCards(realm) {
    return D.animals.filter(function (sp) { return RL.realmOf(sp) === realm; }).map(function (sp) {
      var lines = R().requirements(sp);
      return h('div.box.gd-card.gd-rl', h('div.gd-head', h('span.gd-em', { text: sp.emoji || '' }), h('div', h('b', { text: sp.name }), h('div.gd-sub', { text: sp.modern ? 'Wild visitor' : sp.diet }))),
        h('div.gd-note', { text: KIND_NOTE[sp.id] || '' }), h('div.rreq', lines.map(function (l) { return h('div', { text: l }); })));
    });
  }
  function buildCards(ids) {
    return ids.map(function (id) {
      var d = UI.byId(D.buildings, id) || UI.byId(D.scenery, id) || UI.byId(D.paths, id) || UI.byId(D.fences, id);
      return h('div.box.gd-card.gd-rl', h('div.gd-head', h('span.gd-em', { text: d.emoji || '' }), h('div', h('b', { text: d.name }), h('div.gd-sub', { text: fmt(d.cost) + (d.walk || d.strength ? ' each' : '') }))), h('div.gd-info', { text: d.info || d.blurb || '' }));
    });
  }
  RL.guideSection = function () {
    return [
      ['sea', 'Marine', function () { return speciesCards('sea').concat(buildCards(['sea_net', 'steel_sea_mesh', 'armoured_sea_barrier', 'acrylic_tunnel', 'glass_pier', 'underwater_gallery', 'feeding_grandstand', 'filtration_plant', 'boathouse', 'kelp_bed', 'reef_block', 'fish_feeder'])); },
        'Sea animals are marine reptiles and living mammals and fish, not dinosaurs. They live in a lagoon tank (dug on land), a sea pen (nets in the water) or a virtual sea zone. Volume is area times depth.'],
      ['air', 'Aviary', function () { return speciesCards('air').concat(buildCards(['mesh_walk', 'canopy_tower', 'drone_hangar', 'perch_crag', 'perch_pole', 'fish_pool'])); },
        'Pterosaurs are flying reptiles, not dinosaurs; gulls and herons are living birds. They need the Thunder Dome (height and mesh strength matter) or a virtual sky zone. Loose flyers need a net-gun drone team.'],
      ['tags', 'Tagging', function () {
        var info = [h('div.box.gd-card.gd-rl', h('div.gd-head', h('span.gd-em', { text: '📡' }), h('div', h('b', { text: 'How virtual enclosures work' }))), h('div.gd-info', { text: 'Paint a zone on land, sea or sky. A powered Tagging control tower within range projects an invisible geofence and every animal is fitted with a tag (a fee each). Stronger species need a higher tower level. Tags can fail; keepers and vets keep them working. If the power goes out the fence drops and animals wander off within hours. Guests only walk through a zone on a skywalk or tunnel.' }))];
        return info.concat(buildCards(['tagging_tower', 'skywalk']));
      }, 'Fence-free enclosures held by electronics. Star-gated, powered, and worth the risk only if your power is solid.']
    ];
  };
})();
