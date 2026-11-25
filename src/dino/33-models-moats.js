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
    g.userData.update = function (dt, t, gr, obj) {
      if (prev) prev.call(this, dt, t, gr, obj);
      var o = obj || (gr && gr.userData && gr.userData.obj) || (g.userData && g.userData.obj) || (this && this.obj);
      fn.call(this, dt, t || 0, gr || g, o);
    };
  }
  MODELS.pump_station = function (g) {   // 4 x 4 m: beveled brick pump house, curved pipes, pressure tank, paddle wheel
    var b = B(), brick = 0xa9684a, roof = 0x5d6b73, steel = 0x7f8a92, dark = 0x3b4248, stone = 0x9a968c;
    b.bevelBox(3.8, 0.16, 3.8, 0.04, 0, 0.08, 0, stone);
    b.bevelBox(2.08, 0.24, 1.78, 0.03, -0.7, 0.26, -0.5, 0x7d7a72);
    b.bevelBox(2.0, 1.45, 1.7, 0.05, -0.7, 0.92, -0.5, brick);
    // beveled eaves cornice & pitched gable roof (axis:'x' => u=Y, v=Z)
    b.bevelBox(2.16, 0.12, 1.88, 0.03, -0.7, 1.66, -0.5, shade(roof, 0.88));
    b.extrude([[0, -0.96], [0, 0.96], [0.72, 0]], 2.22, -0.7, 1.70, -0.5, [0, 0, 0], roof, { axis: 'x', bev: 0.04 });
    b.bevelBox(2.26, 0.09, 0.14, 0.02, -0.7, 2.43, -0.5, shade(roof, 0.78));
    // door & framed window
    b.bevelBox(0.56, 0.96, 0.08, 0.02, -0.65, 0.62, 0.36, 0x5a4432);
    b.box(0.42, 0.84, 0.06, -0.65, 0.58, 0.39, dark);
    b.bevelBox(0.56, 0.38, 0.08, 0.02, -1.32, 1.12, 0.36, 0xd8d2c4);
    b.box(0.44, 0.28, 0.06, -1.32, 1.12, 0.39, 0x9fd0ec);
    // curved cast-iron outlet manifold & riser
    b.tube([[0.25, 1.05, -0.45], [0.72, 1.35, -0.30], [0.85, 2.02, -0.22], [1.45, 2.08, -0.10], [1.70, 1.35, 0.45], [1.70, 0.35, 0.95]], 0.12, steel, { seg: 8, steps: 3 });
    b.cyl(0.18, 0.18, 0.08, 0.85, 1.65, -0.25, shade(steel, 0.75), { seg: 8 });
    b.cyl(0.20, 0.22, 0.26, 1.70, 0.26, 0.95, shade(steel, 0.8), { seg: 8 });
    // red handwheel valve on upright pipe
    b.cyl(0.03, 0.03, 0.20, 0.85, 1.65, -0.08, dark, { seg: 6, rot: [PI / 2, 0, 0] });
    b.lathe([[0.16, -0.02], [0.19, 0], [0.16, 0.02], [0.13, 0]], 0xc83a2e, { x: 0.85, y: 1.65, z: 0.02, rot: [PI / 2, 0, 0], seg: 10 });
    // curved cast-iron intake pipe with flared bell
    b.tube([[-1.60, 0.34, 1.88], [-1.58, 0.46, 1.35], [-1.42, 0.76, 0.82], [-1.20, 0.86, 0.25]], 0.11, shade(steel, 0.9), { seg: 8, steps: 3 });
    b.lathe([[0.12, 0], [0.15, 0.06], [0.22, 0.16], [0.22, 0.20], [0.16, 0.20]], dark, { x: -1.60, y: 0.34, z: 1.76, rot: [PI / 2, 0, 0], seg: 10 });
    // domed cylindrical pressure tank + gauge
    b.lathe([[0.36, 0], [0.36, 0.50], [0.32, 0.64], [0.20, 0.74], [0, 0.78]], 0x4a6ea0, { x: 0.40, y: 0.16, z: 1.20, seg: 12, cap0: true });
    b.cyl(0.39, 0.39, 0.06, 0.40, 0.24, 1.20, dark, { seg: 12 });
    b.cyl(0.08, 0.08, 0.05, 0.40, 0.78, 1.54, 0xf2eee4, { seg: 8, rot: [PI / 2, 0, 0] });
    // flywheel mounted on pump house side
    b.cyl(0.05, 0.05, 0.18, 0.35, 0.82, -0.50, dark, { seg: 6, rot: [0, 0, PI / 2] });
    b.lathe([[0.34, -0.04], [0.40, -0.04], [0.40, 0.04], [0.34, 0.04], [0.34, -0.04]], 0x3f474e, { x: 0.42, y: 0.82, z: -0.50, rot: [0, 0, PI / 2], seg: 12 });
    g.add(mesh(b.build()));
    var w = grp('wheel'), wb = B();
    wb.cyl(0.55, 0.55, 0.10, 0, 0, 0, shade(steel, 0.9), { seg: 12, rot: [0, 0, PI / 2] });
    wb.cyl(0.16, 0.16, 0.24, 0, 0, 0, dark, { seg: 8, rot: [0, 0, PI / 2] });
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * PI * 2;
      wb.bevelBox(0.14, 0.44, 0.66, 0.02, 0, Math.cos(a) * 0.50, Math.sin(a) * 0.50, 0xc9a24a, { rot: [-a, 0, 0] });
    }
    w.add(mesh(wb.build())); w.position.set(1.1, 0.75, 1.1); g.add(w);
    spinner(g, w, 0, function (dt, t, gr, o) { if (o && (o.off || o.broken)) return; w.rotation.x += dt * 2.2; });
  };
  MODELS.borehole = function (g) {      // 2 x 2 m: wellhead with arched A-frame derrick and nodding curved horsehead pump jack
    var b = B(), steel = 0x7f8a92, red = 0xb23a2c, dark = 0x3b4248;
    b.bevelBox(1.45, 0.14, 1.45, 0.04, 0, 0.07, 0, 0x9a968c);
    b.lathe([[0.28, 0], [0.28, 0.10], [0.20, 0.16], [0.18, 0.64], [0.24, 0.68], [0.24, 0.76], [0.14, 0.80], [0, 0.80]], dark, { x: 0, y: 0.12, z: 0, seg: 10, cap0: true });
    b.tube([[0, 0.66, 0], [0.35, 0.62, 0.12], [0.68, 0.44, 0.24], [0.70, 0.14, 0.25]], 0.07, steel, { seg: 8, steps: 3 });
    b.cyl(0.12, 0.13, 0.10, 0.70, 0.18, 0.25, shade(steel, 0.8), { seg: 8 });
    // arched A-frame derrick legs + cross brace
    b.tube([[-0.72, 0.12, 0.16], [-0.58, 0.78, 0.10], [-0.45, 1.22, 0], [-0.30, 0.78, -0.10], [-0.18, 0.12, -0.16]], 0.055, red, { seg: 6, steps: 3 });
    b.tube([[-0.72, 0.12, -0.16], [-0.58, 0.78, -0.10], [-0.45, 1.22, 0], [-0.30, 0.78, 0.10], [-0.18, 0.12, 0.16]], 0.055, red, { seg: 6, steps: 3 });
    b.bevelBox(0.52, 0.34, 0.42, 0.04, -0.22, 0.28, -0.22, 0x4a4f55);
    b.cyl(0.18, 0.18, 0.08, -0.22, 0.30, -0.45, steel, { seg: 10, rot: [PI / 2, 0, 0] });
    g.add(mesh(b.build()));
    var beam = grp('beam'), bb = B();
    bb.bevelBox(1.48, 0.11, 0.12, 0.02, 0, 0, 0, red);
    // curved horsehead pump arc at +x end
    bb.extrude([[0.64, -0.24], [0.84, -0.20], [0.92, 0.04], [0.86, 0.24], [0.68, 0.14]], 0.12, 0, 0, 0, [0, 0, 0], shade(red, 0.82), { bev: 0.02 });
    // counterweight crank at -x end
    bb.extrude([[-0.64, -0.16], [-0.88, -0.10], [-0.88, 0.12], [-0.66, 0.14]], 0.16, 0, 0, 0, [0, 0, 0], 0x555a60, { bev: 0.025 });
    beam.add(mesh(bb.build())); beam.position.set(-0.45, 1.2, 0); g.add(beam);
    spinner(g, beam, 0, function (dt, t, gr, o) { if (o && (o.off || o.broken)) return; beam.rotation.z = Math.sin(t * 2.4) * 0.22; });
  };
  var oc = M.createBuilding, of = M.buildingFootprint;
  M.createBuilding = function (id) {
    if (MODELS[id]) { var g = grp(id); g.userData.buildingId = id; MODELS[id](g); g.userData.footprint = { w: DEF[id][0], h: DEF[id][1] }; return g; }
    return oc.apply(this, arguments);
  };
  M.buildingFootprint = function (id) { return DEF[id] ? { w: DEF[id][0], h: DEF[id][1] } : of.apply(this, arguments); };
})();
