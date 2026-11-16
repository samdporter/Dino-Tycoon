// ===== 35-models-safari.js =====
// Safari package, models: depot, harbour, balloon pad, geofence portal, ranger post, corridor marker, scarecrow, pinger, bird scarer; plus the vehicle bodies
// (armoured truck, glass-bottom boat, tethered balloon) and gate parts used by 46-world-safari.js (Z.Models.safari).  Front of every building is +z at rotation 0.
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var K = M.kit, B = K.B, mesh = K.mesh, grp = K.grp, shade = K.shade, PI = Math.PI;
  var DEF = { safari_depot: [3, 2], safari_harbour: [3, 2], safari_balloon: [2, 2], safari_portal: [2, 1], ranger_post: [2, 2] };
  var MODELS = {}, SCEN = {};
  var khaki = 0xb7a26a, olive = 0x6b7448, dark = 0x2f3438, steel = 0x7f8a92, conc = 0xb9b5aa, red = 0xb83a2e, orange = 0xe8742a, white = 0xf0eee6, teal = 0x2c8fa6, glassC = 0x9fd4ea, wood = 0x7a5233;

  MODELS.safari_depot = function (g) {   // 6 x 4 m garage: two open bays at the front, ticket window, striped awning, corrugated roof
    var b = B();
    b.box(5.9, 0.16, 3.9, 0, 0.08, 0, conc);
    b.box(5.4, 2.5, 0.25, 0, 1.4, -1.7, shade(khaki, 0.95)); b.box(0.25, 2.5, 3.4, -2.75, 1.4, 0, shade(khaki, 0.9)); b.box(0.25, 2.5, 3.4, 2.75, 1.4, 0, shade(khaki, 0.9));
    b.box(5.9, 0.22, 4.1, 0, 2.75, 0, shade(olive, 1.0)); b.box(5.9, 0.08, 4.1, 0, 2.9, 0, shade(olive, 1.2), { rot: [0.06, 0, 0] });
    for (var k = -2; k <= 2; k++) b.box(0.06, 0.1, 4.1, k * 1.1, 2.97, 0, shade(olive, 0.8));
    b.box(2.6, 0.9, 0.08, -1.45, 2.3, 1.96, orange); b.box(2.6, 0.12, 0.1, -1.45, 1.8, 1.97, dark);     // pelmet above the bays
    b.box(0.2, 2.3, 0.2, -2.7, 1.2, 1.95, dark); b.box(0.2, 2.3, 0.2, 0.0, 1.2, 1.95, dark);
    b.box(1.8, 1.1, 0.12, 1.85, 1.2, 1.9, 0xe9e3cf); b.box(1.5, 0.6, 0.06, 1.85, 1.5, 1.98, glassC); b.box(1.9, 0.12, 0.5, 1.85, 0.7, 2.1, wood);   // ticket window and counter
    b.box(2.4, 0.18, 0.9, 1.85, 2.3, 2.3, red); b.box(2.4, 0.18, 0.9, 1.85, 2.3, 2.3, white, { s: [1, 1, 0.3] });
    b.box(0.7, 0.9, 0.06, 2.6, 2.35, 1.97, 0xfff1c4);
    for (k = 0; k < 3; k++) b.box(0.55, 0.12, 0.06, -2.2 + k * 0.8, 2.6, 1.99, k === 1 ? 0x2c6a3a : orange);                                  // stripe sign
    b.cyl(0.18, 0.18, 0.7, -2.9, 0.35, 1.9, 0x2d2d2d, { seg: 8 }); b.box(0.5, 0.06, 0.4, 2.8, 0.55, -2.15, 0xcaa24a);
    g.add(mesh(b.build()));
  };
  MODELS.safari_harbour = function (g) {   // 6 x 4 m boathouse with a timber jetty stub reaching out the back (-z)
    var b = B();
    b.box(5.9, 0.16, 3.9, 0, 0.08, 0.2, conc);
    b.box(3.0, 2.2, 2.2, -1.2, 1.2, 0.8, 0xdcd6c4); b.box(3.3, 0.18, 2.5, -1.2, 2.4, 0.8, teal); b.box(3.3, 0.1, 2.5, -1.2, 2.55, 0.8, shade(teal, 1.2), { rot: [0.0, 0, 0.12] });
    b.box(1.5, 1.8, 0.08, -1.2, 1.05, 1.92, shade(wood, 0.9)); b.box(0.8, 0.8, 0.06, -2.4, 1.6, 1.92, glassC);
    b.box(1.9, 0.12, 0.5, 1.7, 0.7, 1.7, wood); b.box(1.7, 1.0, 0.1, 1.7, 1.2, 1.5, 0xe9e3cf); b.box(1.5, 0.5, 0.06, 1.7, 1.45, 1.58, glassC);
    b.box(1.6, 0.16, 0.8, 1.7, 2.2, 1.9, red); b.box(0.08, 1.5, 0.08, 0.95, 1.0, 1.9, dark); b.box(0.08, 1.5, 0.08, 2.45, 1.0, 1.9, dark);
    // jetty
    b.box(2.2, 0.14, 5.4, 1.2, 0.35, -3.9, 0x9a7a52); for (var k = 0; k < 9; k++) b.box(2.25, 0.05, 0.08, 1.2, 0.44, -1.4 - k * 0.6, 0x7a5a38);
    for (k = 0; k < 4; k++) { b.cyl(0.1, 0.1, 1.4, 0.15, 0.1, -2.4 - k * 1.5, 0x5a4026, { seg: 6 }); b.cyl(0.1, 0.1, 1.4, 2.25, 0.1, -2.4 - k * 1.5, 0x5a4026, { seg: 6 }); }
    b.cyl(0.12, 0.12, 1.0, 0.15, 0.95, -6.4, orange, { seg: 6 }); b.cyl(0.12, 0.12, 1.0, 2.25, 0.95, -6.4, orange, { seg: 6 });
    b.box(0.04, 0.7, 0.04, 1.2, 0.8, -6.55, 0xfff1c4);
    g.add(mesh(b.build()));
  };
  MODELS.safari_balloon = function (g) {   // 4 x 4 m launch pad: round deck, winch, tether post, striped furled envelope on a rack
    var b = B();
    b.cyl(1.9, 2.0, 0.2, 0, 0.1, 0, conc, { seg: 20 }); b.cyl(1.5, 1.5, 0.05, 0, 0.22, 0, 0x6f7b84, { seg: 20 });
    b.cyl(0.35, 0.45, 0.9, 0, 0.65, 0, steel, { seg: 10 }); b.cyl(0.16, 0.16, 1.4, 0, 1.4, 0, dark, { seg: 8 });
    b.box(1.8, 0.3, 0.9, -1.1, 0.4, 1.1, red); b.box(1.8, 0.1, 0.9, -1.1, 0.6, 1.1, white);
    b.cyl(0.5, 0.5, 0.18, 1.0, 0.3, -1.0, orange, { seg: 8 }); b.cyl(0.04, 0.04, 2.0, 1.0, 1.3, -1.0, dark, { seg: 4 });
    g.add(mesh(b.build()));
  };
  MODELS.safari_portal = function (g) {   // 4 x 2 m: cattle grid across the lane, bollards, gate house; the world adds the animated boom
    var b = B();
    b.box(3.9, 0.1, 1.9, 0, 0.05, 0, 0x4a4f55);
    for (var k = -4; k <= 4; k++) b.box(0.07, 0.07, 1.7, k * 0.4, 0.14, 0, 0xc8ccce);
    for (k = -1; k <= 1; k += 2) { b.cyl(0.12, 0.12, 0.9, k * 1.7, 0.5, 0.85, 0xf2c94c, { seg: 8 }); b.cyl(0.12, 0.12, 0.9, k * 1.7, 0.5, -0.85, 0xf2c94c, { seg: 8 }); b.box(0.2, 0.1, 0.2, k * 1.7, 0.98, 0.85, red); b.box(0.2, 0.1, 0.2, k * 1.7, 0.98, -0.85, red); }
    b.box(0.7, 1.4, 0.7, -1.6, 0.8, -0.65, 0xdcd6c4); b.box(0.8, 0.1, 0.8, -1.6, 1.55, -0.65, red); b.box(0.5, 0.35, 0.06, -1.6, 1.0, -0.28, glassC);
    b.box(0.25, 0.25, 0.25, 1.6, 0.25, -0.65, dark); b.cyl(0.05, 0.05, 0.7, 1.6, 0.8, -0.65, steel, { seg: 6 }); b.sph(0.1, 0.1, 0.1, 1.6, 1.2, -0.65, 0xff3b30, { s: [6, 4] });
    g.add(mesh(b.build()));
  };
  MODELS.ranger_post = function (g) {   // 4 x 4 m: log cabin, lookout, jeep
    var b = B();
    b.box(3.9, 0.12, 3.9, 0, 0.06, 0, 0x8f8a7c);
    b.box(2.2, 1.7, 2.0, -0.7, 1.0, -0.7, 0x8a6240); for (var k = 0; k < 6; k++) b.box(2.3, 0.05, 2.1, -0.7, 0.4 + k * 0.28, -0.7, 0x70502f);
    b.box(2.6, 0.12, 2.4, -0.7, 1.95, -0.7, shade(olive, 0.9), { rot: [0, 0, 0.0] }); b.box(2.5, 0.1, 2.3, -0.7, 2.06, -0.7, olive);
    b.box(0.5, 0.8, 0.06, -0.7, 0.8, 0.32, 0x3a2a1c); b.box(0.5, 0.45, 0.06, 0.15, 1.1, 0.32, glassC);
    b.cyl(0.1, 0.1, 3.2, 1.2, 1.7, -1.4, 0x6a4a2a, { seg: 6 }); b.box(0.9, 0.1, 0.9, 1.2, 3.35, -1.4, olive); b.box(0.7, 0.4, 0.7, 1.2, 3.1, -1.4, 0xbfae88);
    b.box(1.5, 0.45, 0.8, 0.9, 0.42, 1.3, 0x4f6a3a); b.box(0.7, 0.4, 0.78, 1.0, 0.8, 1.3, shade(0x4f6a3a, 0.9)); for (k = -1; k <= 1; k += 2) { b.cyl(0.2, 0.2, 0.12, 0.45, 0.2, 1.3 + k * 0.45, dark, { seg: 8, rot: [0, 0, PI / 2] }); b.cyl(0.2, 0.2, 0.12, 1.4, 0.2, 1.3 + k * 0.45, dark, { seg: 8, rot: [0, 0, PI / 2] }); }
    g.add(mesh(b.build()));
  };
  SCEN.wildlife_corridor = function (g) {   // a gap flanked by two stone piers with a rolled-up shutter and a deer sign
    var b = B();
    b.box(0.5, 1.5, 0.5, -1.3, 0.75, 0, 0x8d877d); b.box(0.5, 1.5, 0.5, 1.3, 0.75, 0, 0x8d877d); b.box(0.6, 0.12, 0.6, -1.3, 1.56, 0, 0x6e6a62); b.box(0.6, 0.12, 0.6, 1.3, 1.56, 0, 0x6e6a62);
    b.box(2.3, 0.35, 0.3, 0, 1.4, 0, 0x5c6a72); b.box(0.9, 0.6, 0.06, 0, 2.0, 0.1, 0x2c6a3a); b.box(0.5, 0.35, 0.04, 0, 2.0, 0.14, 0xf0eee6);
    b.box(2.1, 0.06, 0.5, 0, 0.04, 0, 0x6e6a62);
    for (var k = -4; k <= 4; k++) b.box(0.05, 0.05, 0.4, k * 0.2, 0.09, 0, 0xc8ccce);
    g.add(mesh(b.build()));
  };
  SCEN.scarecrow = function (g) {
    var b = B();
    b.cyl(0.05, 0.06, 1.7, 0, 0.85, 0, wood, { seg: 5 }); b.cyl(0.04, 0.04, 1.3, 0, 1.4, 0, wood, { seg: 5, rot: [0, 0, PI / 2] });
    b.box(0.5, 0.7, 0.2, 0, 1.2, 0, 0x4a6ea0); b.sph(0.17, 0.2, 0.17, 0, 1.75, 0, 0xe7c88a, { s: [7, 5] }); b.cone(0.3, 0.3, 0, 1.98, 0, 0x8a6a3a, { seg: 8 });
    b.box(0.24, 0.1, 0.1, 0.52, 1.3, 0, 0xc8352b); b.box(0.24, 0.1, 0.1, -0.52, 1.3, 0, 0xe8a23a);
    g.add(mesh(b.build()));
  };
  SCEN.acoustic_pinger = function (g) {
    var b = B();
    b.cyl(0.28, 0.28, 0.25, 0, 0.12, 0, orange, { seg: 12 }); b.cyl(0.1, 0.1, 0.6, 0, 0.5, 0, steel, { seg: 8 }); b.sph(0.12, 0.12, 0.12, 0, 0.86, 0, 0xff3b30, { s: [6, 4] }); b.cyl(0.02, 0.02, 0.5, 0.15, 0.7, 0, dark, { seg: 4 });
    g.add(mesh(b.build()));
  };
  SCEN.bird_scarer = function (g) {
    var b = B();
    b.box(0.5, 0.35, 0.5, 0, 0.18, 0, 0xcaa24a); b.cyl(0.04, 0.04, 1.2, 0, 0.9, 0, steel, { seg: 6 }); b.cyl(0.1, 0.18, 0.5, 0, 1.6, 0, 0x4f6a3a, { seg: 8, rot: [PI / 3, 0, 0] });
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

  // ------------------------------------------------------------------ vehicle bodies (origin at ground / waterline / gondola floor; front +z)
  var LIV = [[0xb7a26a, 0x6b7448], [0xd9c27a, 0x8a3a2e], [0x8fa86a, 0x3d4a2c], [0xc9b08a, 0x2f5f78]];
  var SF = M.safari = {};
  SF.truck = function (li) {
    var c = LIV[((li | 0) % LIV.length + LIV.length) % LIV.length], b = B(), body = c[0], trim = c[1];
    b.box(1.9, 0.35, 3.7, 0, 0.62, 0, dark);                                                         // chassis
    b.box(1.95, 0.6, 1.0, 0, 1.0, 1.35, body); b.box(1.9, 0.05, 0.9, 0, 1.32, 1.35, shade(body, 1.15));    // bonnet
    b.box(1.9, 0.9, 0.12, 0, 1.55, 0.8, trim); b.box(1.5, 0.45, 0.06, 0, 1.55, 0.88, 0x9fd0ec);        // windscreen frame and glass
    b.box(1.95, 1.0, 2.2, 0, 1.3, -0.65, body);                                                       // passenger box (lower body)
    b.box(2.0, 0.08, 2.3, 0, 2.5, -0.65, trim); b.box(1.6, 0.14, 1.0, 0.1, 2.62, -0.8, shade(trim, 0.8));  // roof and hatch housing
    for (var k = 0; k < 5; k++) { b.box(0.05, 1.0, 0.05, -0.97, 2.0, 0.35 - k * 0.5, steel); b.box(0.05, 1.0, 0.05, 0.97, 2.0, 0.35 - k * 0.5, steel); }   // cage bars
    b.box(0.05, 0.05, 2.2, -0.97, 2.35, -0.65, steel); b.box(0.05, 0.05, 2.2, 0.97, 2.35, -0.65, steel); b.box(0.05, 0.05, 2.2, -0.97, 1.75, -0.65, steel); b.box(0.05, 0.05, 2.2, 0.97, 1.75, -0.65, steel);
    b.box(1.9, 0.05, 0.05, 0, 2.0, -1.78, steel); b.box(1.9, 0.9, 0.06, 0, 1.95, -1.76, shade(body, 0.9));
    b.box(2.0, 0.1, 0.1, 0, 0.9, 1.9, dark); b.box(0.08, 0.5, 0.08, -0.6, 1.1, 1.92, dark); b.box(0.08, 0.5, 0.08, 0.6, 1.1, 1.92, dark);   // bull bar
    b.box(0.3, 0.2, 0.06, -0.65, 1.15, 1.86, 0xfff1c4); b.box(0.3, 0.2, 0.06, 0.65, 1.15, 1.86, 0xfff1c4);
    b.cyl(0.4, 0.4, 0.18, 0, 1.3, -1.9, 0x2d2d2d, { seg: 10, rot: [PI / 2, 0, 0] });                  // spare wheel
    for (var wz = -1; wz <= 1; wz += 2) for (var wx = -1; wx <= 1; wx += 2) { b.cyl(0.42, 0.42, 0.34, wx * 0.98, 0.42, wz * 1.2, 0x23272b, { seg: 10, rot: [0, 0, PI / 2] }); b.cyl(0.2, 0.2, 0.36, wx * 0.98, 0.42, wz * 1.2, 0xa8adb2, { seg: 8, rot: [0, 0, PI / 2] }); }
    b.box(0.3, 0.06, 1.4, -1.1, 0.5, 0.0, dark); b.box(0.3, 0.06, 1.4, 1.1, 0.5, 0.0, dark);
    return mesh(b.build());
  };
  SF.truckHatch = function (li) { var c = LIV[((li | 0) % LIV.length + LIV.length) % LIV.length], b = B(); b.box(1.2, 0.05, 0.8, 0, 0, 0.4, shade(c[1], 0.7)); return mesh(b.build()); };
  SF.boat = function (li) {
    var c = LIV[((li | 0) % LIV.length + LIV.length) % LIV.length], b = B();
    b.sph(0.95, 0.5, 2.5, 0, 0.1, 0, c[1], { s: [14, 8] }); b.sph(0.97, 0.18, 2.4, 0, 0.42, 0, white, { s: [14, 6] });                  // hull and white gunwale
    b.box(1.5, 0.08, 3.4, 0, 0.5, -0.1, 0xb98d5a);                                                                                          // deck
    b.box(0.9, 0.04, 1.3, 0, 0.45, -0.1, 0x66c3e0);                                                                                         // glass-bottom panel (a lighter slab on the deck)
    for (var k = 0; k < 5; k++) { b.box(0.45, 0.1, 0.4, -0.45, 0.62, 1.2 - k * 0.6, 0xe9e3cf); b.box(0.45, 0.1, 0.4, 0.45, 0.62, 1.2 - k * 0.6, 0xe9e3cf); }   // benches
    for (k = -1; k <= 1; k += 2) for (var q = 0; q < 3; q++) b.cyl(0.04, 0.04, 1.6, k * 0.85, 1.35, 1.3 - q * 1.5, steel, { seg: 5 });
    b.box(1.9, 0.09, 4.2, 0, 2.15, -0.1, shade(c[0], 1.1)); b.box(1.9, 0.04, 4.2, 0, 2.22, -0.1, white);                                   // canopy
    b.box(0.06, 0.06, 4.2, -0.88, 0.95, -0.1, white); b.box(0.06, 0.06, 4.2, 0.88, 0.95, -0.1, white);                                     // rail
    b.box(0.5, 0.6, 0.4, 0, 0.8, -2.3, dark); b.cyl(0.04, 0.04, 0.5, 0, 0.3, -2.55, steel, { seg: 5 });                                     // outboard
    b.cyl(0.04, 0.04, 1.4, 0, 1.2, 2.0, steel, { seg: 5 }); b.box(0.3, 0.2, 0.02, 0.15, 1.8, 2.0, red);                                      // bow flag
    return mesh(b.build());
  };
  SF.balloon = function (li) {
    var c = LIV[((li | 0) % LIV.length + LIV.length) % LIV.length], b = B();
    b.cyl(0.9, 0.8, 0.45, 0, 0.3, 0, 0xb98d5a, { seg: 14 }); b.cyl(0.95, 0.95, 0.06, 0, 0.55, 0, white, { seg: 14 });
    for (var k = 0; k < 6; k++) { var a = k / 6 * PI * 2; b.cyl(0.02, 0.02, 3.2, Math.cos(a) * 0.8, 2.1, Math.sin(a) * 0.8, dark, { seg: 3 }); }
    b.sph(2.5, 2.9, 2.5, 0, 5.4, 0, c[1], { s: [18, 12] });
    for (k = 0; k < 6; k++) { var a2 = k / 6 * PI * 2; b.sph(0.35, 2.7, 2.5, Math.cos(a2) * 1.0, 5.4, Math.sin(a2) * 1.0, k & 1 ? c[0] : white, { s: [6, 10], rot: [0, -a2, 0] }); }
    b.cyl(0.4, 0.5, 0.2, 0, 3.0, 0, 0x222222, { seg: 8 }); b.cyl(0.03, 0.03, 8.0, 0, -3.4, 0, 0x555555, { seg: 3 });
    return mesh(b.build());
  };
  // airlock parts: a pair of door leaves (sliding in local x) and a gate house post, built facing +z
  SF.gateLeaf = function (kind) {
    var b = B(), col = kind === 'sea' ? 0x3a7aa0 : 0x6b7448;
    b.box(3.2, 2.5, 0.12, 0, 1.3, 0, col); for (var k = -3; k <= 3; k++) b.box(0.05, 2.4, 0.16, k * 0.45, 1.3, 0, 0xc8ccce);
    b.box(3.3, 0.1, 0.18, 0, 2.55, 0, 0xf2c94c); b.box(3.3, 0.1, 0.18, 0, 0.1, 0, 0xf2c94c);
    return mesh(b.build());
  };
  SF.gatePost = function (kind) {
    var b = B(), col = kind === 'sea' ? 0x3a7aa0 : 0x6b7448;
    b.box(0.35, 3.0, 0.35, 0, 1.5, 0, 0x8d877d); b.box(0.45, 0.12, 0.45, 0, 3.05, 0, 0x6e6a62); b.box(0.2, 0.2, 0.2, 0, 3.25, 0, 0x2ee06a);
    return mesh(b.build());
  };
  SF.gateRoof = function (kind) {   // the chamber: side walls and a roof joining the two doors (4 m long, 3.6 wide)
    var b = B(), col = kind === 'sea' ? 0x3a7aa0 : 0x6b7448;
    b.box(0.2, 2.5, 4.1, -1.7, 1.3, 0, shade(col, 0.9)); b.box(0.2, 2.5, 4.1, 1.7, 1.3, 0, shade(col, 0.9)); b.box(3.8, 0.12, 4.2, 0, 2.65, 0, 0xb9b5aa);
    b.box(3.8, 0.05, 0.1, 0, 2.5, 2.05, 0xff6a2a); b.box(3.8, 0.05, 0.1, 0, 2.5, -2.05, 0xff6a2a);
    return mesh(b.build());
  };
  SF.boom = function () { var b = B(); b.box(0.12, 0.12, 3.4, 0, 0, 1.7, 0xffffff); for (var k = 0; k < 5; k++) b.box(0.13, 0.13, 0.34, 0, 0, 0.3 + k * 0.7, red); return mesh(b.build()); };
})();
