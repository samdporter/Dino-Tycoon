// ===== 34-models-realms.js =====
// Realms package, models: marine / aviary / tagging buildings and the scenery that goes inside tanks, pens and the dome. Wraps Z.Models.createBuilding,
// buildingFootprint and createScenery (same pattern as 33-models-moats.js). Front of every building is +z (south) at rotation 0.
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var K = M.kit, B = K.B, mesh = K.mesh, grp = K.grp, shade = K.shade, PI = Math.PI;
  var DEF = { filtration_plant: [3, 2], underwater_gallery: [3, 2], feeding_grandstand: [4, 2], canopy_tower: [2, 2], tagging_tower: [2, 2], boathouse: [3, 2], drone_hangar: [2, 2] };
  var MODELS = {}, SCEN = {};
  function spin(g, fn) { var prev = g.userData.update; g.userData.update = function (dt, t) { if (prev) prev(dt, t); fn(dt, t || 0); }; }
  var steel = 0x7f8a92, dark = 0x3b4248, conc = 0xb9b5aa, teal = 0x2c8fa6, glassC = 0x8fd4ea, orange = 0xe8742a, white = 0xeeeeea;

  MODELS.filtration_plant = function (g) {   // 6 x 4 m: two settling tanks, a pump house, pipes
    var b = B();
    b.box(5.8, 0.16, 3.8, 0, 0.08, 0, conc);
    b.cyl(1.0, 1.0, 1.9, -1.8, 1.1, -0.5, 0x4a86a8, { seg: 14 }); b.cyl(1.05, 1.05, 0.14, -1.8, 2.1, -0.5, steel, { seg: 14 });
    b.cyl(0.8, 0.8, 1.5, 0.2, 0.9, -0.7, 0x5a96b8, { seg: 12 }); b.cyl(0.85, 0.85, 0.12, 0.2, 1.7, -0.7, steel, { seg: 12 });
    b.box(1.6, 1.3, 1.5, 2.0, 0.8, -0.3, 0xa7a199); b.box(1.8, 0.12, 1.7, 2.0, 1.5, -0.3, 0x55606a);
    b.box(0.45, 0.8, 0.06, 2.0, 0.55, 0.47, dark); b.cyl(0.14, 0.14, 0.9, 2.5, 2.0, -0.7, steel, { seg: 8 });
    b.limb(-1.8, 1.9, -0.5, 0.2, 1.6, -0.7, 0.12, 0.12, steel, { seg: 8 }); b.limb(0.2, 1.6, -0.7, 2.0, 1.6, -0.5, 0.12, 0.12, steel, { seg: 8 });
    b.limb(-1.8, 0.5, 0.3, -1.8, 0.5, 1.5, 0.14, 0.14, teal, { seg: 8 }); b.limb(-1.8, 0.5, 1.5, 1.4, 0.5, 1.5, 0.14, 0.14, teal, { seg: 8 });
    b.cyl(0.3, 0.3, 0.6, 0.6, 0.45, 1.2, 0x4a6ea0, { seg: 10 }); b.box(0.5, 0.35, 0.5, -0.4, 0.33, 1.2, dark);
    g.add(mesh(b.build()));
  };
  MODELS.underwater_gallery = function (g) {   // 6 x 4 m: low hall, big window onto the water on the -z side, blue light
    var b = B();
    b.box(5.8, 0.14, 3.8, 0, 0.07, 0, 0x8d9aa3);
    b.box(5.4, 2.2, 0.35, 0, 1.2, 1.5, 0x6d7d88);   // back wall (front side, the entrance)
    b.box(0.35, 2.2, 3.2, -2.55, 1.2, 0, 0x6d7d88); b.box(0.35, 2.2, 3.2, 2.55, 1.2, 0, 0x6d7d88);
    b.box(5.6, 0.2, 3.7, 0, 2.4, 0, 0x364955);
    b.box(3.6, 0.12, 0.9, 0, 2.58, 0.9, 0x4a6272);
    b.box(0.5, 1.5, 0.06, 0, 0.9, 1.72, 0x22303a);
    for (var k = -1; k <= 1; k += 2) b.box(0.18, 0.6, 0.18, k * 2.2, 0.5, -1.6, 0xc9a24a);
    g.add(mesh(b.build()));
    var gl = B();
    gl.box(4.6, 1.7, 0.1, 0, 1.2, -1.62, 0x66c3e0); gl.box(4.7, 0.1, 0.16, 0, 2.08, -1.62, 0x2a3a44); gl.box(4.7, 0.1, 0.16, 0, 0.36, -1.62, 0x2a3a44);
    for (var j = -2; j <= 2; j++) gl.box(0.1, 1.8, 0.16, j * 1.1, 1.2, -1.62, 0x2a3a44);
    var m = mesh(gl.build()); m.material = m.material.clone ? m.material.clone() : m.material; m.material.transparent = true; m.material.opacity = 0.22; m.material.depthWrite = false; g.add(m);   // QA: see-through acrylic, so the view into the tank shows
  };
  MODELS.feeding_grandstand = function (g) {   // 8 x 4 m: raked seating facing -z, striped awning
    var b = B(), seat = 0xc8473a, seat2 = 0xe4b24a;
    b.box(7.8, 0.14, 3.8, 0, 0.07, 0, 0x8f8f86);
    for (var r = 0; r < 4; r++) {
      var y = 0.3 + r * 0.42, z = -1.2 + r * 0.8;
      b.box(7.4, y, 0.7, 0, y * 0.5, z, 0x9a958b);
      for (var s = -3; s <= 3; s++) b.box(0.9, 0.12, 0.5, s * 1.0, y + 0.08, z, (s + r) & 1 ? seat : seat2);
    }
    for (var p = -1; p <= 1; p += 2) { b.cyl(0.08, 0.08, 3.6, p * 3.8, 1.8, 1.7, 0x4a4f55, { seg: 6 }); b.cyl(0.08, 0.08, 3.0, p * 3.8, 1.5, -1.7, 0x4a4f55, { seg: 6 }); }
    for (var a = -3; a <= 3; a++) b.box(1.0, 0.08, 4.0, a * 1.07, 3.4 - Math.abs(a) * 0.02, 0, a & 1 ? 0x2d8fb0 : 0xf2f2ee, { rot: [-0.2, 0, 0] });   // QA: rises towards the back posts (was tilted the other way, front edge poking above the front posts)
    b.box(7.4, 0.5, 0.06, 0, 0.7, -1.9, 0x2c8fa6);
    g.add(mesh(b.build()));
  };
  MODELS.canopy_tower = function (g) {   // 4 x 4 m: tall timber and steel tower with a gallery under a small roof
    var b = B(), wood = 0x8b5e3c;
    b.box(3.6, 0.14, 3.6, 0, 0.07, 0, conc);
    for (var sx = -1; sx <= 1; sx += 2) for (var sz = -1; sz <= 1; sz += 2) { b.limb(sx * 1.4, 0.1, sz * 1.4, sx * 0.7, 5.6, sz * 0.7, 0.12, 0.1, wood, { seg: 6 }); }
    for (var h = 1; h <= 4; h++) { var k = 1.4 - (1.4 - 0.7) * (h * 1.3 - 0.1) / 5.5; b.box(k * 2, 0.08, 0.08, 0, h * 1.3, k, wood); b.box(k * 2, 0.08, 0.08, 0, h * 1.3, -k, wood); b.box(0.08, 0.08, k * 2, k, h * 1.3, 0, wood); b.box(0.08, 0.08, k * 2, -k, h * 1.3, 0, wood); }
    b.box(2.2, 0.14, 2.2, 0, 5.6, 0, 0x6b4a2a);
    for (var q = -1; q <= 1; q += 2) { b.box(2.2, 0.55, 0.06, 0, 5.95, q * 1.05, wood); b.box(0.06, 0.55, 2.2, q * 1.05, 5.95, 0, wood); }
    b.cone(1.9, 0.9, 0, 7.0, 0, 0x2f7f55, { seg: 4, rot: [0, PI / 4, 0] });
    for (var c = -1; c <= 1; c += 2) { b.cyl(0.05, 0.05, 1.2, c * 1.0, 6.4, c * 1.0, wood, { seg: 5 }); b.cyl(0.05, 0.05, 1.2, c * 1.0, 6.4, -c * 1.0, wood, { seg: 5 }); }
    b.box(0.5, 2.6, 0.06, 0, 1.4, 1.1, 0x5a4a38, { rot: [-0.45, 0, 0] });
    g.add(mesh(b.build()));
  };
  MODELS.tagging_tower = function (g) {   // 4 x 4 m: lattice mast with a dish array and a status light
    var b = B(), pale = 0xd8dde0;
    b.box(3.6, 0.2, 3.6, 0, 0.1, 0, conc);
    b.box(1.6, 1.1, 1.4, 0, 0.75, 0.9, 0x6d7d88); b.box(1.7, 0.1, 1.5, 0, 1.35, 0.9, 0x4a5760);
    for (var sx = -1; sx <= 1; sx += 2) for (var sz = -1; sz <= 1; sz += 2) b.limb(sx * 0.6, 0.2, sz * 0.6 - 0.5, sx * 0.18, 7.2, sz * 0.18 - 0.5, 0.07, 0.05, pale, { seg: 5 });
    for (var h = 1; h <= 6; h++) { var k = 0.6 - 0.42 * h / 7; b.box(k * 2, 0.04, 0.04, 0, h, -0.5 + k, pale); b.box(k * 2, 0.04, 0.04, 0, h, -0.5 - k, pale); b.box(0.04, 0.04, k * 2, k, h, -0.5, pale); b.box(0.04, 0.04, k * 2, -k, h, -0.5, pale); }
    b.cyl(0.02, 0.02, 1.3, 0, 7.8, -0.5, pale, { seg: 4 });
    for (var d = 0; d < 3; d++) { var a = d / 3 * PI * 2 + 0.4; b.cyl(0.45, 0.12, 0.2, Math.cos(a) * 0.55, 5.2 + d * 0.5, -0.5 + Math.sin(a) * 0.55, white, { seg: 10, rot: [PI / 2 - 0.3, -a + PI / 2, 0] }); }
    g.add(mesh(b.build()));
    var rot = grp('rot'), rb = B(); rb.cyl(0.7, 0.2, 0.22, 0, 0, 0, orange, { seg: 10 }); rb.box(0.06, 0.5, 0.06, 0, 0.3, 0, steel);
    rot.add(mesh(rb.build())); rot.position.set(0, 7.0, -0.5); g.add(rot);
    var lamp = grp('lamp'), lb = B(); lb.sph(0.13, 0.13, 0.13, 0, 0, 0, 0x3ee07a, { s: [6, 4] }); lamp.add(mesh(lb.build())); lamp.position.set(0, 7.45, -0.5); g.add(lamp);
    spin(g, function (dt) { rot.rotation.y += dt * 1.6; });
  };
  MODELS.boathouse = function (g) {   // 6 x 4 m: boat shed with a slip door and an orange rescue boat on a trailer
    var b = B();
    b.box(5.8, 0.14, 3.8, 0, 0.07, 0, 0x9a968c);
    b.box(5.0, 1.9, 0.2, 0, 1.0, -1.2, 0xe8e4d8); b.box(0.2, 1.9, 2.6, -2.4, 1.0, 0.1, 0xe8e4d8); b.box(0.2, 1.9, 2.6, 2.4, 1.0, 0.1, 0xe8e4d8);
    b.box(5.4, 0.16, 3.2, 0, 2.05, 0.1, 0x2c6f93, { rot: [0.12, 0, 0] });
    b.box(2.0, 0.5, 0.9, 0, 0.5, 0.6, orange); b.box(1.1, 0.5, 0.7, -0.2, 0.9, 0.55, white); b.cyl(0.18, 0.18, 0.5, 1.05, 0.6, 0.6, dark, { seg: 8 });
    b.box(2.4, 0.08, 0.5, 0, 0.2, 0.6, steel);
    for (var w = -1; w <= 1; w += 2) b.cyl(0.22, 0.22, 0.12, w * 0.9, 0.22, 1.05, dark, { seg: 8, rot: [0, 0, PI / 2] });
    g.add(mesh(b.build()));
  };
  MODELS.drone_hangar = function (g) {   // 4 x 4 m: hangar with a landing pad and a quadcopter
    var b = B();
    b.box(3.8, 0.14, 3.8, 0, 0.07, 0, 0x8d9aa3);
    b.box(2.4, 1.6, 1.8, 0, 0.95, -0.8, 0x7e8c96); b.cyl(1.25, 1.25, 1.8, 0, 1.75, -0.8, 0x6d7d88, { seg: 14, rot: [0, 0, PI / 2], s: [1, 1, 1] });
    b.box(1.5, 1.1, 0.06, 0, 0.7, 0.14, 0x222c33);
    b.cyl(0.9, 0.9, 0.05, 0.3, 0.17, 1.1, 0x555e66, { seg: 16 }); b.box(0.9, 0.04, 0.12, 0.3, 0.2, 1.1, 0xf2c14a); b.box(0.12, 0.04, 0.9, 0.3, 0.2, 1.1, 0xf2c14a);
    g.add(mesh(b.build()));
    var dr = grp('drone'), db = B(); db.box(0.5, 0.12, 0.5, 0, 0, 0, 0x2a3138);
    for (var a = 0; a < 4; a++) { var ax = (a & 1 ? 1 : -1) * 0.35, az = (a & 2 ? 1 : -1) * 0.35; db.limb(0, 0, 0, ax, 0, az, 0.03, 0.03, 0x2a3138, { seg: 4 }); db.cyl(0.2, 0.2, 0.02, ax, 0.06, az, 0xcfd6db, { seg: 8 }); }
    db.box(0.12, 0.1, 0.3, 0, -0.1, 0.1, orange);
    dr.add(mesh(db.build())); dr.position.set(0.3, 0.6, 1.1); g.add(dr);
    spin(g, function (dt, t) { dr.position.y = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 0.8)); dr.rotation.y += dt * 0.7; });
  };

  // ---- scenery (footprint 1 tile = 2 m) ----
  SCEN.kelp_bed = function (g) {
    var b = B(), cols = [0x2f7d3c, 0x3f9b46, 0x5aa83a];
    for (var k = 0; k < 9; k++) { var a = k * 2.3, r = 0.2 + (k % 3) * 0.28, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.1 + (k % 4) * 0.35; b.limb(x, 0, z, x + 0.12 * Math.sin(k), h, z + 0.1 * Math.cos(k), 0.07, 0.025, cols[k % 3], { seg: 4 }); b.sph(0.12, 0.2, 0.05, x, h * 0.6, z, cols[(k + 1) % 3], { s: [5, 3] }); }
    b.cyl(0.8, 0.9, 0.1, 0, 0.04, 0, 0x8a7a5a, { seg: 8 });
    g.add(mesh(b.build()));
  };
  SCEN.reef_block = function (g) {
    var b = B(), cols = [0xe8725e, 0xe8a23a, 0xc76ab8, 0xf0d6c4];
    b.sph(0.85, 0.5, 0.8, 0, 0.35, 0, 0x9a8f86, { s: [7, 5] });
    for (var k = 0; k < 7; k++) { var a = k * 0.9, r = 0.3 + (k % 3) * 0.2; b.cyl(0.07, 0.12, 0.45 + (k % 3) * 0.2, Math.cos(a) * r, 0.7, Math.sin(a) * r, cols[k % 4], { seg: 5 }); b.sph(0.14, 0.1, 0.14, Math.cos(a) * r, 1.0 + (k % 3) * 0.15, Math.sin(a) * r, cols[(k + 2) % 4], { s: [5, 3] }); }
    g.add(mesh(b.build()));
  };
  SCEN.fish_feeder = function (g) {
    var b = B();
    b.cyl(0.7, 0.7, 0.18, 0, 0.1, 0, orange, { seg: 12 }); b.cyl(0.55, 0.62, 0.12, 0, 0.24, 0, white, { seg: 12 });
    b.cyl(0.14, 0.14, 1.0, 0, 0.8, 0, steel, { seg: 8 }); b.cone(0.5, 0.4, 0, 1.45, 0, 0x2c8fa6, { seg: 10 }); b.cyl(0.22, 0.22, 0.4, 0, 1.15, 0, 0x4a86a8, { seg: 8 });
    b.box(0.3, 0.1, 0.3, 0.55, 0.3, 0.2, dark);
    g.add(mesh(b.build()));
  };
  SCEN.perch_crag = function (g) {
    var b = B(), rock = 0x8c8379;
    b.sph(0.9, 0.55, 0.8, 0, 0.45, 0, rock, { s: [6, 4] }); b.sph(0.7, 0.8, 0.6, 0.15, 1.0, 0.05, shade(rock, 1.1), { s: [6, 4] }); b.box(0.9, 0.2, 0.8, 0.15, 1.75, 0.05, shade(rock, 1.2), { rot: [0, 0.4, 0.05] });
    b.sph(0.4, 0.3, 0.35, -0.7, 0.2, 0.4, shade(rock, 0.9), { s: [5, 4] });
    g.add(mesh(b.build()));
  };
  SCEN.perch_pole = function (g) {
    var b = B(), wood = 0x7a5233;
    b.cyl(0.1, 0.13, 2.3, 0, 1.15, 0, wood, { seg: 6 }); b.cyl(0.07, 0.07, 1.5, 0, 2.1, 0, shade(wood, 1.1), { seg: 6, rot: [0, 0, PI / 2] });
    b.cyl(0.38, 0.42, 0.1, 0, 0.05, 0, 0x7d7a72, { seg: 8 });
    g.add(mesh(b.build()));
  };
  SCEN.fish_pool = function (g) {
    var b = B();
    b.cyl(0.95, 1.0, 0.22, 0, 0.11, 0, 0x8d877d, { seg: 14 }); b.cyl(0.82, 0.82, 0.05, 0, 0.2, 0, 0x2d8fb8, { seg: 14 });
    for (var k = 0; k < 4; k++) { var a = k * 1.6; b.sph(0.12, 0.05, 0.05, Math.cos(a) * 0.4, 0.23, Math.sin(a) * 0.4, k & 1 ? 0xf2a23a : 0xe8e4d8, { s: [5, 3] }); }
    g.add(mesh(b.build()));
  };

  var oc = M.createBuilding, of = M.buildingFootprint, os = M.createScenery;
  M.createBuilding = function (id) {
    if (MODELS[id]) { var g = grp(id); g.userData.buildingId = id; MODELS[id](g); g.userData.footprint = { w: DEF[id][0], h: DEF[id][1] }; return g; }
    return oc.apply(this, arguments);
  };
  M.buildingFootprint = function (id) { return DEF[id] ? { w: DEF[id][0], h: DEF[id][1] } : of.apply(this, arguments); };
  M.createScenery = function (id) {
    if (SCEN[id]) { var g = grp(id); SCEN[id](g); return g; }
    return os.apply(this, arguments);
  };
})();
