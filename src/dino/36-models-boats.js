// ===== 36-models-boats.js =====
// Boats package, models: guest pier, service pier, staff helipad, VIP helipad; plus the boat and helicopter bodies drawn by 49-world-boats.js (Z.Models.boats).
// Front of every building is +z at rotation 0.
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var K = M.kit, B = K.B, mesh = K.mesh, grp = K.grp, shade = K.shade, PI = Math.PI;
  var DEF = { guest_pier: [2, 2], large_guest_pier: [3, 3], service_pier: [2, 2], staff_helipad: [3, 3], vip_helipad: [5, 5] };
  var MODELS = {};
  var wood = 0x9a7448, darkWood = 0x6a4a2c, conc = 0xb9b5aa, dark = 0x2f3438, steel = 0x7f8a92, white = 0xf0eee6, red = 0xb83a2e, teal = 0x2c8fa6, orange = 0xe8742a, gold = 0xd9b45a, glassC = 0x9fd4ea;

  function pier(g, trim, roof) {   // 4 x 4 m: plank deck on posts, small shelter at the entrance side, bollards at the water edge
    var b = B();
    b.bevelBox(3.9, 0.16, 3.9, 0.03, 0, 0.5, 0, wood);
    for (var x = -1.8; x <= 1.9; x += 1.2) for (var z = -1.8; z <= 1.9; z += 1.2) b.cyl(0.1, 0.1, 1.0, x, 0.1, z, darkWood, { seg: 6 });
    for (var k = -1; k <= 1; k += 2) b.cyl(0.1, 0.12, 0.34, k * 1.5, 0.75, -1.8, dark, { seg: 8 });
    b.bevelBox(2.4, 1.5, 1.2, 0.04, 0, 1.4, 1.2, shade(trim, 1.0));
    b.bevelBox(2.8, 0.14, 1.6, 0.03, 0, 2.2, 1.2, roof);
    b.box(1.0, 0.8, 0.05, 0, 1.5, 1.83, glassC);
    g.add(mesh(b.build()));
  }
  MODELS.guest_pier = function (g) { pier(g, 0xe9e3cf, teal); };
  MODELS.large_guest_pier = function (g) {   // 6 x 6 m: concrete quay + plank pier deck, pilings, ticket hall + signboard, twin waiting canopies, bollards, lifebuoys & warm beacon
    var b = B(), x, z, k;
    // Quay apron (entrance +z side) & timber pier decking (-z water side)
    b.bevelBox(5.85, 0.24, 2.4, 0.04, 0, 0.46, 1.75, conc);
    b.bevelBox(5.85, 0.16, 3.6, 0.03, 0, 0.52, -1.15, wood);
    for (x = -2.6; x <= 2.7; x += 1.3) for (z = -2.7; z <= 2.7; z += 1.35) b.cyl(0.13, 0.13, 1.05, x, 0.08, z, darkWood, { seg: 8 });
    // Ticket hall at entrance side (+z) with glass facade and signboard
    b.bevelBox(3.8, 1.7, 1.5, 0.05, 0, 1.42, 1.75, 0xe9e3cf);
    b.box(2.5, 0.9, 0.06, 0, 1.48, 2.52, glassC);
    b.box(1.6, 0.36, 0.08, 0, 2.22, 2.56, dark);
    b.box(1.4, 0.22, 0.04, 0, 2.22, 2.61, gold);
    b.bevelBox(4.3, 0.16, 1.9, 0.04, 0, 2.36, 1.75, teal);
    // Twin covered waiting canopies toward the water
    for (k = -1; k <= 1; k += 2) {
      var cx = k * 1.65;
      b.cyl(0.08, 0.08, 1.8, cx - 0.85, 1.5, -0.1, steel, { seg: 6 });
      b.cyl(0.08, 0.08, 1.8, cx + 0.85, 1.5, -0.1, steel, { seg: 6 });
      b.cyl(0.08, 0.08, 1.8, cx - 0.85, 1.5, -2.1, steel, { seg: 6 });
      b.cyl(0.08, 0.08, 1.8, cx + 0.85, 1.5, -2.1, steel, { seg: 6 });
      b.bevelBox(2.1, 0.12, 2.5, 0.03, cx, 2.45, -1.1, shade(teal, 1.12));
      b.box(1.5, 0.2, 0.45, cx, 0.72, -1.1, darkWood);
    }
    // Mooring bollards along water edge (-z)
    for (k = -2; k <= 2; k += 2) b.cyl(0.12, 0.14, 0.42, k * 1.25, 0.8, -2.75, dark, { seg: 8 });
    // Lifebuoys & warm pier beacon
    for (k = -1; k <= 1; k += 2) {
      b.cyl(0.24, 0.24, 0.09, k * 2.55, 1.15, -2.75, orange, { seg: 12 });
      b.cyl(0.11, 0.11, 0.1, k * 2.55, 1.15, -2.75, white, { seg: 10 });
    }
    b.cyl(0.06, 0.08, 1.1, 2.5, 2.9, 1.75, steel, { seg: 6 });
    b.sph(0.2, 0.2, 0.2, 2.5, 3.55, 1.75, 0xffe49c, { s: [10, 8] });
    g.add(mesh(b.build()));
  };
  MODELS.service_pier = function (g) {
    pier(g, 0xc9c5be, dark);
    var b = B(); b.bevelBox(0.8, 0.6, 0.8, 0.04, -1.2, 0.88, -0.6, orange); b.bevelBox(0.7, 0.5, 0.7, 0.04, -0.9, 1.4, -0.7, shade(orange, 0.85));
    g.add(mesh(b.build()));
  };
  function padMarkings(b, r, y, col) {   // an H on a round pad
    b.box(r * 0.12, 0.03, r * 0.8, -r * 0.28, y, 0, col); b.box(r * 0.12, 0.03, r * 0.8, r * 0.28, y, 0, col); b.box(r * 0.56, 0.03, r * 0.12, 0, y, 0, col);
  }
  MODELS.staff_helipad = function (g) {   // 6 x 6 m: round concrete pad with an H, a windsock and edge lights
    var b = B();
    b.bevelBox(5.8, 0.16, 5.8, 0.04, 0, 0.08, 0, conc);
    b.cyl(2.5, 2.5, 0.05, 0, 0.19, 0, 0x4a4f55, { seg: 24 }); b.cyl(2.35, 2.35, 0.03, 0, 0.215, 0, shade(0x4a4f55, 1.15), { seg: 24 });
    padMarkings(b, 2.4, 0.25, 0xf2c94c);
    for (var k = 0; k < 8; k++) { var a = k / 8 * PI * 2; b.box(0.16, 0.12, 0.16, Math.cos(a) * 2.7, 0.22, Math.sin(a) * 2.7, 0xffe9a8); }
    b.cyl(0.05, 0.05, 2.0, 2.5, 1.1, 2.5, steel, { seg: 6 }); b.box(0.6, 0.18, 0.18, 2.8, 2.0, 2.5, orange);
    g.add(mesh(b.build()));
  };
  MODELS.vip_helipad = function (g) {   // 10 x 10 m: big round pad with a gold ring, a lounge with a glass front, landing lights
    var b = B();
    b.bevelBox(9.8, 0.2, 9.8, 0.05, 0, 0.1, 0, conc);
    b.cyl(4.2, 4.2, 0.06, 0, 0.23, 0.6, 0x3d4349, { seg: 32 }); b.cyl(4.0, 4.0, 0.04, 0, 0.26, 0.6, shade(0x3d4349, 1.2), { seg: 32 });
    b.cyl(3.7, 3.7, 0.05, 0, 0.29, 0.6, gold, { seg: 32 }); b.cyl(3.55, 3.55, 0.06, 0, 0.3, 0.6, shade(0x3d4349, 1.2), { seg: 32 });
    b.box(0.5, 0.03, 2.8, -0.95, 0.36, 0.6, white); b.box(0.5, 0.03, 2.8, 0.95, 0.36, 0.6, white); b.box(1.4, 0.03, 0.5, 0, 0.36, 0.6, white);
    for (var k = 0; k < 12; k++) { var a = k / 12 * PI * 2; b.box(0.2, 0.14, 0.2, Math.cos(a) * 4.4, 0.28, 0.6 + Math.sin(a) * 4.4, 0xffe9a8); }
    b.bevelBox(7.0, 2.2, 1.8, 0.06, 0, 1.3, -3.6, 0xe9e3cf);
    b.box(6.2, 1.3, 0.06, 0, 1.4, -2.68, glassC);
    b.bevelBox(7.6, 0.2, 2.5, 0.04, 0, 2.5, -3.5, gold);
    b.cyl(0.06, 0.06, 3.0, 4.6, 1.6, 4.4, steel, { seg: 6 }); b.box(0.8, 0.2, 0.2, 5.0, 2.9, 4.4, orange);
    g.add(mesh(b.build()));
  };

  var oc = M.createBuilding, of = M.buildingFootprint;
  M.createBuilding = function (id) {
    if (MODELS[id]) { var g = grp(id); g.userData.buildingId = id; MODELS[id](g); g.userData.footprint = { w: DEF[id][0], h: DEF[id][1] }; return g; }
    return oc.apply(this, arguments);
  };
  M.buildingFootprint = function (id) { return DEF[id] ? { w: DEF[id][0], h: DEF[id][1] } : of.apply(this, arguments); };

  var BT = M.boats = {};
  BT.ferry = function () {   // large multi-passenger ferry (~7m long, ~2.8m wide), bow at +z
    var b = B(), k;
    // broad hull & waterline trim
    b.sph(1.4, 0.55, 3.5, 0, 0.08, 0, white, { s: [16, 10] });
    b.sph(1.42, 0.2, 3.46, 0, 0.34, 0, teal, { s: [16, 6] });
    b.sph(1.44, 0.09, 3.48, 0, 0.22, 0, dark, { s: [16, 6] });
    // broad planked deck
    b.box(2.35, 0.08, 5.4, 0, 0.44, 0, 0xb98d5a);
    b.bevelBox(1.75, 0.08, 0.9, 0.03, 0, 0.44, 2.7, 0xb98d5a);
    b.bevelBox(2.05, 0.08, 0.9, 0.03, 0, 0.44, -2.7, 0xb98d5a);
    // side railings & stanchions
    for (var s = -1; s <= 1; s += 2) {
      b.box(0.06, 0.06, 5.0, s * 1.15, 0.92, -0.1, white);
      b.box(0.05, 0.05, 5.0, s * 1.15, 0.68, -0.1, white);
      for (k = -2.4; k <= 2.4; k += 1.2) b.box(0.06, 0.48, 0.06, s * 1.15, 0.68, k, white);
    }
    b.box(2.3, 0.06, 0.06, 0, 0.92, -2.6, white);
    // roofed cabin / wheelhouse at stern
    b.bevelBox(1.8, 1.05, 1.5, 0.06, 0, 1.0, -1.75, 0xe9e3cf);
    b.box(1.5, 0.45, 0.06, 0, 1.15, -0.99, glassC);
    b.box(0.06, 0.42, 1.0, -0.91, 1.15, -1.75, glassC);
    b.box(0.06, 0.42, 1.0, 0.91, 1.15, -1.75, glassC);
    b.bevelBox(2.05, 0.12, 1.8, 0.04, 0, 1.58, -1.75, teal);
    b.cyl(0.04, 0.05, 0.55, 0, 1.9, -1.75, steel, { seg: 6 });
    b.box(0.12, 0.12, 0.12, 0, 2.2, -1.75, gold);
    // passenger bench rows
    var zs = [2.1, 1.45, 0.8, 0.15];
    for (k = 0; k < zs.length; k++) {
      b.box(0.86, 0.18, 0.34, -0.62, 0.56, zs[k], wood);
      b.box(0.86, 0.2, 0.06, -0.62, 0.72, zs[k] - 0.14, darkWood);
      b.box(0.86, 0.18, 0.34, 0.62, 0.56, zs[k], wood);
      b.box(0.86, 0.2, 0.06, 0.62, 0.72, zs[k] - 0.14, darkWood);
    }
    // life buoys on cabin roof / stern
    for (var lb = -1; lb <= 1; lb += 2) {
      b.cyl(0.22, 0.22, 0.08, lb * 0.72, 1.66, -1.75, orange, { seg: 12 });
      b.cyl(0.1, 0.1, 0.09, lb * 0.72, 1.66, -1.75, white, { seg: 10 });
    }
    return mesh(b.build());
  };
  BT.largeFerry = function () {   // large double-deck ferry (~9.2m long, ~3.8m wide), bow at +z
    var b = B(), k, s;
    // broad double-deck hull & waterline trim
    b.sph(1.9, 0.7, 4.6, 0, 0.06, 0, white, { s: [18, 12] });
    b.sph(1.92, 0.24, 4.56, 0, 0.34, 0, teal, { s: [18, 6] });
    b.sph(1.94, 0.1, 4.58, 0, 0.2, 0, dark, { s: [18, 6] });
    // lower planked deck
    b.box(3.3, 0.08, 7.2, 0, 0.44, 0, 0xb98d5a);
    b.bevelBox(2.4, 0.08, 1.1, 0.03, 0, 0.44, 3.65, 0xb98d5a);
    b.bevelBox(2.9, 0.08, 1.1, 0.03, 0, 0.44, -3.65, 0xb98d5a);
    // lower railings & stanchions
    for (s = -1; s <= 1; s += 2) {
      b.box(0.06, 0.06, 6.9, s * 1.62, 0.92, -0.1, white);
      b.box(0.05, 0.05, 6.9, s * 1.62, 0.68, -0.1, white);
      for (k = -3.3; k <= 3.3; k += 1.1) b.box(0.06, 0.48, 0.06, s * 1.62, 0.68, k, white);
      // structural pillars supporting upper deck
      for (k = -2.8; k <= 2.6; k += 1.35) b.cyl(0.06, 0.06, 1.1, s * 1.5, 1.0, k, steel, { seg: 6 });
    }
    b.box(3.24, 0.06, 0.06, 0, 0.92, -3.55, white);
    // lower deck bench rows (6 rows matching LARGE_FERRY_SEATS lower deck)
    var lzs = [3.1, 2.35, 1.6, 0.85, 0.1, -0.65];
    for (k = 0; k < lzs.length; k++) {
      b.box(1.15, 0.18, 0.34, -0.9, 0.56, lzs[k], wood);
      b.box(1.15, 0.18, 0.06, -0.9, 0.72, lzs[k] - 0.14, darkWood);
      b.box(1.15, 0.18, 0.34, 0.9, 0.56, lzs[k], wood);
      b.box(1.15, 0.18, 0.06, 0.9, 0.72, lzs[k] - 0.14, darkWood);
    }
    // stern lower cabin / stairwell enclosure
    b.bevelBox(2.4, 1.08, 1.8, 0.06, 0, 0.98, -2.4, 0xe9e3cf);
    b.box(1.8, 0.45, 0.06, 0, 1.08, -1.49, glassC);
    // upper passenger deck (floor top ~1.54, passenger absY = 1.45)
    b.bevelBox(3.15, 0.12, 6.6, 0.04, 0, 1.52, -0.2, white);
    b.box(2.95, 0.04, 6.3, 0, 1.59, -0.2, 0xb98d5a);
    // upper deck railings & stanchions
    for (s = -1; s <= 1; s += 2) {
      b.box(0.06, 0.06, 6.2, s * 1.52, 2.04, -0.2, white);
      b.box(0.05, 0.05, 6.2, s * 1.52, 1.8, -0.2, white);
      for (k = -3.1; k <= 2.9; k += 1.2) b.box(0.06, 0.48, 0.06, s * 1.52, 1.8, k, white);
    }
    b.box(3.04, 0.06, 0.06, 0, 2.04, 2.9, white);
    b.box(3.04, 0.06, 0.06, 0, 2.04, -3.3, white);
    // upper deck bench rows (6 rows matching LARGE_FERRY_SEATS upper deck)
    var uzs = [2.5, 1.8, 1.1, 0.4, -0.3, -1.0];
    for (k = 0; k < uzs.length; k++) {
      b.box(1.05, 0.18, 0.32, -0.82, 1.7, uzs[k], wood);
      b.box(1.05, 0.18, 0.06, -0.82, 1.86, uzs[k] - 0.13, darkWood);
      b.box(1.05, 0.18, 0.32, 0.82, 1.7, uzs[k], wood);
      b.box(1.05, 0.18, 0.06, 0.82, 1.86, uzs[k] - 0.13, darkWood);
    }
    // upper bridge / wheelhouse at stern
    b.bevelBox(2.1, 1.05, 1.55, 0.06, 0, 2.12, -2.4, 0xe9e3cf);
    b.box(1.75, 0.45, 0.06, 0, 2.24, -1.61, glassC);
    b.box(0.06, 0.42, 1.0, -1.06, 2.24, -2.4, glassC);
    b.box(0.06, 0.42, 1.0, 1.06, 2.24, -2.4, glassC);
    b.bevelBox(2.35, 0.12, 1.85, 0.04, 0, 2.7, -2.4, teal);
    b.cyl(0.05, 0.06, 0.7, 0, 3.08, -2.4, steel, { seg: 6 });
    b.box(0.16, 0.16, 0.16, 0, 3.45, -2.4, gold);
    // life buoys on upper deck / bridge sides
    for (var lb = -1; lb <= 1; lb += 2) {
      b.cyl(0.24, 0.24, 0.09, lb * 1.12, 2.25, -2.4, orange, { seg: 12 });
      b.cyl(0.11, 0.11, 0.1, lb * 1.12, 2.25, -2.4, white, { seg: 10 });
    }
    return mesh(b.build());
  };
  BT.serviceBoat = function () {   // smaller utilitarian service boat (~2.8m long, ~1.2m wide), bow at +z
    var b = B();
    b.sph(0.6, 0.35, 1.4, 0, 0.1, 0, 0x243b55, { s: [12, 8] });
    b.sph(0.62, 0.14, 1.36, 0, 0.3, 0, orange, { s: [12, 6] });
    b.box(0.86, 0.06, 1.9, 0, 0.38, -0.05, 0xb98d5a);
    b.bevelBox(0.62, 0.42, 0.5, 0.03, 0, 0.62, 0.25, 0xe9e3cf);
    b.box(0.56, 0.25, 0.05, 0, 0.85, 0.45, glassC);
    b.bevelBox(0.52, 0.36, 0.52, 0.03, 0, 0.58, -0.45, orange);
    b.box(0.36, 0.28, 0.26, 0, 0.46, -1.35, dark);
    return mesh(b.build());
  };
  BT.boat = BT.serviceBoat;
  BT.heli = function () {   // compact helicopter, nose at +z; userData.rotor is the spinning part
    var g = new THREE.Group(), b = B();
    b.sph(0.8, 0.75, 1.5, 0, 0.9, 0, 0x2a2f36, { s: [14, 10] }); b.sph(0.82, 0.5, 1.1, 0, 0.9, 0.5, glassC, { s: [12, 8] });
    b.box(0.25, 0.3, 2.4, 0, 1.0, -2.1, 0x2a2f36); b.box(0.08, 0.9, 0.4, 0, 1.4, -3.2, red);
    b.cyl(0.08, 0.08, 0.3, 0, 1.75, 0, steel, { seg: 6 });
    for (var k = -1; k <= 1; k += 2) { b.box(0.08, 0.08, 1.8, k * 0.6, 0.12, 0.1, steel); b.box(0.08, 0.5, 0.08, k * 0.6, 0.38, 0.6, steel); b.box(0.08, 0.5, 0.08, k * 0.6, 0.38, -0.4, steel); }
    g.add(mesh(b.build()));
    var r = B(); r.box(5.6, 0.04, 0.24, 0, 1.92, 0, 0x3a3f45); r.box(0.24, 0.04, 5.6, 0, 1.93, 0, 0x3a3f45);
    var rotor = mesh(r.build()); g.add(rotor); g.userData.rotor = rotor;
    return g;
  };
})();
