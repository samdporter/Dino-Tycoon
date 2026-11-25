// ===== 34-models-realms.js =====
// Realms package, models: marine / aviary / tagging buildings and the scenery that goes inside tanks, pens and the dome. Wraps Z.Models.createBuilding,
// buildingFootprint and createScenery (same pattern as 33-models-moats.js). Front of every building is +z (south) at rotation 0.
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var K = M.kit, B = K.B, mesh = K.mesh, grp = K.grp, shade = K.shade, PI = Math.PI;
  var DEF = { filtration_plant: [3, 2], underwater_gallery: [3, 2], feeding_grandstand: [4, 2], canopy_tower: [2, 2], tagging_tower: [2, 2], boathouse: [3, 2], drone_hangar: [2, 2] };
  var MODELS = {}, SCEN = {};
  function spin(g, fn) {
    var prev = g.userData.update;
    g.userData.update = function (dt, t, gr, obj) {
      if (prev) prev.call(this, dt, t, gr, obj);
      var o = obj || (gr && gr.userData && gr.userData.obj) || (g.userData && g.userData.obj) || (this && this.obj);
      fn.call(this, dt, t || 0, gr || g, o);
    };
  }
  var _lampOnMat = null, _lampOffMat = null;
  function towerLampMat(off) {
    if (!_lampOnMat) _lampOnMat = K.mat(0x3ee07a, { emissive: 0x168a3e });
    if (!_lampOffMat) _lampOffMat = K.mat(0xff3028, { emissive: 0x991810 });
    return off ? _lampOffMat : _lampOnMat;
  }
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
  MODELS.underwater_gallery = function (g) {   // 6 x 4 m: curved arched acrylic observation vault & chamfered concrete retaining wings
    var b = B(), wall = 0x6d7d88, trim = 0x364955;
    b.bevelBox(5.8, 0.16, 3.8, 0.04, 0, 0.08, 0, 0x8d9aa3);
    // chamfered concrete retaining wing buttresses tapering down toward the -z tank edge
    for (var s = -1; s <= 1; s += 2) {
      b.extrude([[1.75, 0.14], [1.75, 2.35], [-0.45, 2.35], [-1.85, 0.85], [-1.85, 0.14]], 0.42, s * 2.58, 0, 0, [0, 0, 0], wall, { axis: 'x', bev: 0.05 });
      b.bevelBox(0.24, 0.56, 0.24, 0.03, s * 2.15, 0.46, -1.62, 0xc9a24a);
    }
    // beveled rear entrance hall (+z) with glazed vestibule
    b.bevelBox(5.2, 2.15, 0.42, 0.05, 0, 1.22, 1.48, wall);
    b.bevelBox(1.5, 1.75, 0.36, 0.04, 0, 1.02, 1.66, trim);
    b.box(0.8, 1.5, 0.08, 0, 0.92, 1.85, 0x22303a);
    b.bevelBox(5.4, 0.18, 0.65, 0.03, 0, 2.34, 1.45, trim);
    // lower retaining curb along -z
    b.bevelBox(4.8, 0.36, 0.28, 0.04, 0, 0.32, -1.66, 0x2a3a44);
    // arched steel rib frames spanning over the curved acrylic vault
    for (var j = -2; j <= 2; j++) {
      var rx = j * 1.12;
      b.tube([[rx, 0.38, -1.68], [rx, 1.55, -1.35], [rx, 2.22, -0.25], [rx, 2.32, 1.28]], 0.065, 0x2a3a44, { seg: 8, steps: 3 });
    }
    g.add(mesh(b.build()));
    // curved transparent acrylic observation vault
    var gl = B();
    gl.lathe([[1.62, -2.24], [1.62, 2.24]], 0x66c3e0, { x: 0, y: 0.42, z: -0.10, phi0: 0, phiLen: PI, rot: [0, 0, PI / 2], seg: 16 });
    var m = mesh(gl.build());
    m.material = m.material.clone ? m.material.clone() : m.material;
    m.material.transparent = true; m.material.opacity = 0.24; m.material.depthWrite = false; m.material.side = K.T.DoubleSide;
    g.add(m);
  };
  MODELS.feeding_grandstand = function (g) {   // 8 x 4 m: tiered beveled seating under a cantilevered curved rib canopy
    var b = B(), seat = 0xc8473a, seat2 = 0xe4b24a;
    b.bevelBox(7.8, 0.16, 3.8, 0.04, 0, 0.08, 0, 0x8f8f86);
    for (var r = 0; r < 4; r++) {
      var y = 0.32 + r * 0.42, z = -1.15 + r * 0.80;
      b.bevelBox(7.4, y, 0.76, 0.03, 0, y * 0.5 + 0.06, z, 0x9a958b);
      for (var s = -3; s <= 3; s++) {
        var colS = (s + r) & 1 ? seat : seat2;
        b.bevelBox(0.84, 0.11, 0.44, 0.02, s * 1.0, y + 0.11, z - 0.04, colS);
        b.bevelBox(0.84, 0.28, 0.10, 0.02, s * 1.0, y + 0.25, z + 0.17, shade(colS, 0.88), { rot: [-0.15, 0, 0] });
      }
    }
    // rear support masts & cantilevered sculpted rib trusses
    for (var p = -1; p <= 1; p++) {
      var mx = p * 3.55;
      b.cyl(0.09, 0.11, 3.35, mx, 1.75, 1.65, 0x4a4f55, { seg: 8 });
      b.extrude([
        [1.75, 2.85], [1.75, 3.38], [0.20, 3.68], [-1.95, 3.22],
        [-1.95, 3.06], [0.15, 3.44], [1.45, 2.75]
      ], 0.10, mx, 0, 0, [0, 0, 0], 0x3b4248, { axis: 'x', bev: 0.015 });
    }
    // curved alternating striped canopy panels along the cantilever
    for (var a = -3; a <= 3; a++) {
      var colA = a & 1 ? 0x2d8fb0 : 0xf2f2ee;
      b.bevelBox(1.04, 0.08, 2.05, 0.02, a * 1.07, 3.55 - Math.abs(a) * 0.02, 0.85, colA, { rot: [0.14, 0, 0] });
      b.bevelBox(1.04, 0.08, 2.05, 0.02, a * 1.07, 3.38 - Math.abs(a) * 0.02, -1.05, colA, { rot: [-0.22, 0, 0] });
    }
    b.bevelBox(7.4, 0.48, 0.08, 0.02, 0, 0.68, -1.86, 0x2c8fa6);
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
    var lamp = grp('lamp'), lb = B(); lb.sph(0.13, 0.13, 0.13, 0, 0, 0, 0xffffff, { s: [6, 4] }); var lampMesh = mesh(lb.build(), towerLampMat(false)); lamp.add(lampMesh); lamp.position.set(0, 7.45, -0.5); g.add(lamp);
    spin(g, function (dt, t, gr, o) {
      var off = !!(o && (o.off || o.broken));
      lampMesh.material = towerLampMat(off);
      if (off) return;
      rot.rotation.y += dt * 1.6;
    });
  };
  MODELS.boathouse = function (g) {   // 6 x 4 m: gabled timber boat shed & sleek-hull rescue boat on trailer
    var b = B(), wall = 0xe8e4d8, roof = 0x2c6f93, timber = 0x7a5233;
    b.bevelBox(5.8, 0.16, 3.8, 0.04, 0, 0.08, 0, 0x9a968c);
    b.bevelBox(5.0, 1.9, 0.24, 0.04, 0, 1.05, -1.2, wall);
    b.bevelBox(0.24, 1.9, 2.6, 0.04, -2.4, 1.05, 0.1, wall);
    b.bevelBox(0.24, 1.9, 2.6, 0.04, 2.4, 1.05, 0.1, wall);
    // corner timber pilasters & gable eaves
    for (var s = -1; s <= 1; s += 2) {
      b.bevelBox(0.18, 1.95, 0.18, 0.02, s * 2.42, 1.05, 1.38, timber);
      b.bevelBox(0.18, 1.95, 0.18, 0.02, s * 2.42, 1.05, -1.20, timber);
    }
    // pitched gabled timber roof (axis:'x' => u=Y, v=Z)
    b.bevelBox(5.36, 0.14, 3.16, 0.03, 0, 2.02, 0.1, shade(roof, 0.85));
    b.extrude([[0, -1.62], [0, 1.62], [0.95, 0]], 5.44, 0, 2.08, 0.1, [0, 0, 0], roof, { axis: 'x', bev: 0.04 });
    b.bevelBox(5.52, 0.10, 0.16, 0.02, 0, 3.04, 0.1, shade(timber, 0.85));
    // lifebuoy ring on side wall
    b.lathe([[0.15, -0.04], [0.24, -0.04], [0.24, 0.04], [0.15, 0.04], [0.15, -0.04]], orange, { x: -2.54, y: 1.35, z: 0.4, rot: [0, 0, PI / 2], seg: 12 });
    // sleek flared V-hull rescue boat on wheeled trailer
    b.extrude([
      [-1.28, 0.0], [-0.72, 0.44], [0.22, 0.50], [1.02, 0.44],
      [1.02, -0.44], [0.22, -0.50], [-0.72, -0.44]
    ], 0.48, 0, 0.54, 0.65, [0, 0, 0], orange, { axis: 'y', bev: 0.04, taper: 0.68 });
    b.bevelBox(1.55, 0.10, 0.78, 0.02, 0.05, 0.78, 0.65, shade(white, 0.94));
    b.bevelBox(0.95, 0.46, 0.68, 0.05, -0.18, 1.02, 0.65, white);
    b.bevelBox(0.28, 0.24, 0.64, 0.02, -0.58, 1.06, 0.65, 0x263844, { rot: [0, 0, 0.28] });
    b.bevelBox(0.32, 0.48, 0.34, 0.04, 1.12, 0.76, 0.65, dark);
    b.limb(1.16, 0.55, 0.65, 1.20, 0.25, 0.65, 0.04, 0.02, steel, { seg: 5 });
    // trailer frame & fenders
    b.bevelBox(2.4, 0.09, 0.52, 0.02, 0, 0.22, 0.65, steel);
    for (var w = -1; w <= 1; w += 2) {
      b.cyl(0.22, 0.22, 0.12, w * 0.85, 0.22, 1.10, dark, { seg: 10, rot: [0, 0, PI / 2] });
      b.cyl(0.11, 0.11, 0.14, w * 0.85, 0.22, 1.10, steel, { seg: 8, rot: [0, 0, PI / 2] });
    }
    g.add(mesh(b.build()));
  };
  MODELS.drone_hangar = function (g) {   // 4 x 4 m: ribbed arched hangar, beveled control alcove, shrouded quadcopter
    var b = B();
    b.bevelBox(3.8, 0.16, 3.8, 0.04, 0, 0.08, 0, 0x8d9aa3);
    // arched hangar side walls + barrel-vault shell + external steel arch ribs
    b.bevelBox(2.2, 1.05, 1.85, 0.04, -0.35, 0.66, -0.78, 0x7e8c96);
    b.lathe([[1.12, -0.92], [1.12, 0.92]], 0x6d7d88, { x: -0.35, y: 1.15, z: -0.78, phi0: 0, phiLen: PI, rot: [0, 0, PI / 2], seg: 14 });
    for (var r = 0; r < 4; r++) {
      var rz = -1.62 + r * 0.56;
      b.tube([[-1.48, 0.95, rz], [-1.15, 1.98, rz], [-0.35, 2.32, rz], [0.45, 1.98, rz], [0.78, 0.95, rz]], 0.055, 0x3b4248, { seg: 6, steps: 3 });
    }
    b.bevelBox(1.55, 1.12, 0.10, 0.02, -0.35, 0.72, 0.14, 0x222c33);
    // beveled control alcove on +x side with panoramic window & antenna
    b.bevelBox(1.05, 1.35, 1.25, 0.06, 1.18, 0.82, -0.65, 0x5d6d78);
    b.bevelBox(0.92, 0.45, 1.02, 0.03, 1.22, 1.12, -0.58, 0x8fd4ea);
    b.cyl(0.03, 0.03, 0.75, 1.35, 1.85, -0.85, steel, { seg: 4 });
    // landing pad
    b.cyl(0.92, 0.96, 0.08, 0.25, 0.18, 1.08, 0x555e66, { seg: 18 });
    b.box(0.88, 0.04, 0.12, 0.25, 0.23, 1.08, 0xf2c14a); b.box(0.12, 0.04, 0.88, 0.25, 0.23, 1.08, 0xf2c14a);
    g.add(mesh(b.build()));
    // sculpted aerodynamic quadcopter with shrouded rotor rings
    var dr = grp('drone'), db = B();
    db.loft([
      [0, 0.05, 0.03, 0], [0.14, 0.13, 0.08, 0], [0.34, 0.12, 0.07, 0], [0.52, 0.04, 0.03, 0]
    ], { rings: 8, seg: 10, cap0: true, cap1: true, oz: -0.26 }, 0x2a3138);
    for (var a = 0; a < 4; a++) {
      var sx = (a & 1 ? 1 : -1), sz = (a & 2 ? 1 : -1), ax = sx * 0.36, az = sz * 0.36;
      db.tube([[sx * 0.08, 0.01, sz * 0.08], [ax * 0.6, 0.03, az * 0.6], [ax, 0.04, az]], 0.028, 0x3b4248, { seg: 5, steps: 2 });
      db.lathe([[0.17, -0.025], [0.20, -0.025], [0.20, 0.025], [0.17, 0.025], [0.17, -0.025]], orange, { x: ax, y: 0.05, z: az, seg: 12 });
      db.cyl(0.16, 0.16, 0.015, ax, 0.05, az, 0xcfd6db, { seg: 10 });
    }
    db.bevelBox(0.12, 0.10, 0.22, 0.02, 0, -0.09, 0.10, orange);
    dr.add(mesh(db.build())); dr.position.set(0.25, 0.6, 1.08); g.add(dr);
    spin(g, function (dt, t, gr, o) {
      if (o && (o.off || o.broken)) { dr.position.y = 0.36; return; }
      dr.position.y = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 0.8)); dr.rotation.y += dt * 0.7;
    });
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
    // multi-tiered jagged faceted rock spire with rugged natural perch crest
    b.extrude([[0.92, 0.10], [0.58, 0.78], [-0.28, 0.86], [-0.88, 0.35], [-0.74, -0.56], [0.12, -0.84], [0.78, -0.45]], 0.56, 0, 0.28, 0, [0, 0.2, 0], shade(rock, 0.92), { axis: 'y', bev: 0.08, taper: 0.74 });
    b.extrude([[0.68, 0.08], [0.42, 0.58], [-0.22, 0.64], [-0.66, 0.24], [-0.52, -0.44], [0.15, -0.62], [0.58, -0.32]], 0.66, 0.08, 0.84, 0.04, [0.05, 0.9, -0.04], rock, { axis: 'y', bev: 0.07, taper: 0.72 });
    b.extrude([[0.48, 0.06], [0.30, 0.42], [-0.18, 0.46], [-0.46, 0.14], [-0.36, -0.32], [0.14, -0.44], [0.42, -0.22]], 0.54, 0.14, 1.38, 0.05, [-0.04, 1.8, 0.06], shade(rock, 1.1), { axis: 'y', bev: 0.06, taper: 0.68 });
    b.extrude([[0.32, 0.04], [0.18, 0.30], [-0.16, 0.32], [-0.34, 0.06], [-0.24, -0.24], [0.10, -0.30], [0.28, -0.14]], 0.30, 0.16, 1.74, 0.05, [0.04, 0.5, -0.05], shade(rock, 1.2), { axis: 'y', bev: 0.05, taper: 0.78 });
    b.extrude([[0.42, 0.05], [0.22, 0.36], [-0.28, 0.28], [-0.34, -0.18], [0.16, -0.34]], 0.48, -0.55, 0.24, 0.35, [0.12, 0.4, 0.22], shade(rock, 0.85), { axis: 'y', bev: 0.06, taper: 0.55 });
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
