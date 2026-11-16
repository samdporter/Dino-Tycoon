// ===== 33-models-moats.js =====
// Moats package, models: pump station and borehole buildings (wrapped into Z.Models.createBuilding / buildingFootprint).
// Bridges and trenches are world geometry (42-world-moats.js).
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var K = M.kit, B = K.B, mesh = K.mesh, grp = K.grp, shade = K.shade, PI = Math.PI;
  var DEF = { pump_station: [2, 2], borehole: [1, 1] };
  var MODELS = {};
  function spinner(g, parent, y, fn) {
    var prev = g.userData.update;
    g.userData.update = function (dt, t) { if (prev) prev(dt, t); fn(dt, t || 0); };
  }
  MODELS.pump_station = function (g) {   // 4 x 4 m: pump house, intake pipe, outlet pipe, paddle wheel
    var b = B(), brick = 0xa9684a, roof = 0x5d6b73, steel = 0x7f8a92, dark = 0x3b4248;
    b.box(3.8, 0.14, 3.8, 0, 0.07, 0, 0x9a968c);
    b.box(2.0, 1.5, 1.7, -0.7, 0.9, -0.5, brick); b.box(2.2, 0.12, 1.9, -0.7, 1.7, -0.5, roof);
    b.cone(1.35, 0.55, -0.7, 2.0, -0.5, roof, { seg: 4, rot: [0, PI / 4, 0] });
    b.box(0.5, 0.9, 0.06, -0.7, 0.6, 0.38, dark); b.box(0.5, 0.3, 0.06, -1.3, 1.1, 0.38, 0x9fd0ec);
    b.cyl(0.14, 0.14, 2.6, 0.75, 0.8, -0.2, steel, { seg: 8 });                       // upright pipe
    b.limb(0.75, 2.05, -0.2, 1.7, 2.05, -0.2, 0.14, 0.14, steel, { seg: 8 });
    b.limb(1.7, 2.05, -0.2, 1.7, 0.5, 0.9, 0.14, 0.14, steel, { seg: 8 });             // outlet to the ditch
    b.cyl(0.2, 0.2, 0.3, 1.7, 0.35, 0.95, shade(steel, 0.8), { seg: 8 });
    b.limb(-1.6, 0.4, 1.0, -1.6, 0.4, 1.9, 0.12, 0.12, steel, { seg: 8 });             // intake pipe towards the water
    b.cyl(0.2, 0.2, 0.2, -1.6, 0.4, 1.9, dark, { seg: 8, rot: [PI / 2, 0, 0] });
    b.cyl(0.35, 0.35, 0.5, 0.4, 0.4, 1.2, 0x4a6ea0, { seg: 10 });                    // pressure tank
    g.add(mesh(b.build()));
    var w = grp('wheel'), wb = B();
    wb.cyl(0.55, 0.55, 0.12, 0, 0, 0, shade(steel, 0.9), { seg: 10, rot: [0, 0, PI / 2] });
    for (var k = 0; k < 6; k++) { var a = k / 6 * PI * 2; wb.box(0.12, 0.5, 0.7, 0, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0xc9a24a, { rot: [-a, 0, 0] }); }
    w.add(mesh(wb.build())); w.position.set(1.1, 0.75, 1.1); g.add(w);
    spinner(g, w, 0, function (dt) { w.rotation.x += dt * 2.2; });
  };
  MODELS.borehole = function (g) {      // 2 x 2 m: wellhead with a nodding pump jack
    var b = B(), steel = 0x7f8a92, red = 0xb23a2c;
    b.cyl(0.7, 0.8, 0.12, 0, 0.06, 0, 0x9a968c, { seg: 10 });
    b.cyl(0.18, 0.2, 0.7, 0, 0.45, 0, 0x3b4248, { seg: 8 });
    b.limb(0, 0.8, 0, 0.7, 0.4, 0.25, 0.07, 0.07, steel, { seg: 6 });
    b.cyl(0.1, 0.1, 0.25, 0.7, 0.2, 0.25, steel, { seg: 6 });
    b.box(0.12, 1.1, 0.12, -0.35, 0.65, 0, red, { rot: [0, 0, 0.3] }); b.box(0.12, 1.1, 0.12, -0.55, 0.65, 0, red, { rot: [0, 0, -0.3] });
    b.box(0.5, 0.3, 0.4, -0.2, 0.25, -0.2, 0x4a4f55);
    g.add(mesh(b.build()));
    var beam = grp('beam'), bb = B();
    bb.box(1.5, 0.1, 0.1, 0, 0, 0, red); bb.sph(0.22, 0.2, 0.12, 0.8, 0.05, 0, shade(red, 0.8), { s: [6, 4] });
    bb.sph(0.2, 0.2, 0.14, -0.78, 0, 0, 0x555a60, { s: [6, 4] });
    beam.add(mesh(bb.build())); beam.position.set(-0.45, 1.2, 0); g.add(beam);
    spinner(g, beam, 0, function (dt, t) { beam.rotation.z = Math.sin(t * 2.4) * 0.22; });
  };
  var oc = M.createBuilding, of = M.buildingFootprint;
  M.createBuilding = function (id) {
    if (MODELS[id]) { var g = grp(id); g.userData.buildingId = id; MODELS[id](g); g.userData.footprint = { w: DEF[id][0], h: DEF[id][1] }; return g; }
    return oc.apply(this, arguments);
  };
  M.buildingFootprint = function (id) { return DEF[id] ? { w: DEF[id][0], h: DEF[id][1] } : of.apply(this, arguments); };
})();
