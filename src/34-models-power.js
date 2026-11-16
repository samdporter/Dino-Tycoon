// ===== 34-models-power.js =====
// Power package, models: substation, pylon, diesel / backup generators, solar field, wind turbine, battery bank, geothermal plant.
// Wrapped into Z.Models.createBuilding / buildingFootprint (same pattern as 33-models-moats.js). Animation reads Z.Power only.
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var K = M.kit, B = K.B, mesh = K.mesh, grp = K.grp, shade = K.shade, PI = Math.PI;
  var DEF = { substation: [2, 2], power_pylon: [1, 1], diesel_gen: [2, 2], solar_field: [3, 3], wind_turbine: [1, 1], battery_bank: [2, 2], backup_gen: [2, 2], geothermal_plant: [4, 4] };
  var MODELS = {};
  function spin(g, fn) { var prev = g.userData.update; g.userData.update = function (dt, t, gr) { if (prev) prev.call(this, dt, t, gr); fn.call(this, dt, t || 0, gr || g); }; }
  function genState(gr) { return Z.Power && Z.Power.genAt ? Z.Power.genAt(gr.position.x, gr.position.z) : null; }
  var steel = 0x8a949c, dark = 0x3b4248, conc = 0x9a968c;

  MODELS.substation = function (g) {   // 4 x 4 m: transformer yard behind a low wall, insulators, a bolt sign
    var b = B();
    b.box(3.8, 0.12, 3.8, 0, 0.06, 0, conc);
    b.box(3.8, 0.7, 0.12, 0, 0.4, -1.85, 0xb8b2a4); b.box(0.12, 0.7, 3.6, -1.85, 0.4, 0, 0xb8b2a4); b.box(0.12, 0.7, 3.6, 1.85, 0.4, 0, 0xb8b2a4);
    b.box(1.3, 1.0, 1.0, -0.7, 0.62, -0.5, 0x4f7a5a); b.box(1.4, 0.12, 1.1, -0.7, 1.16, -0.5, shade(0x4f7a5a, 0.8));
    for (var k = 0; k < 3; k++) b.cyl(0.1, 0.1, 0.5, -1.1 + k * 0.4, 1.45, -0.5, 0xe8e2d2, { seg: 6 });
    b.box(1.0, 1.2, 0.9, 0.9, 0.72, 0.5, 0xc9c4b6); b.box(0.2, 0.2, 0.04, 0.9, 1.0, 0.97, 0xf2c230);
    for (k = 0; k < 4; k++) { b.cyl(0.04, 0.04, 2.4, -1.5 + k * 1.0, 1.3, 1.4, steel, { seg: 5 }); }
    b.limb(-1.5, 2.5, 1.4, 1.5, 2.5, 1.4, 0.03, 0.03, dark, { seg: 4 });
    b.box(0.5, 0.5, 0.05, 1.6, 0.9, 1.88, 0xf2c230);
    g.add(mesh(b.build()));
  };
  MODELS.power_pylon = function (g) {   // 2 x 2 m: lattice pylon with two cross arms
    var b = B();
    b.cyl(0.4, 0.5, 0.12, 0, 0.06, 0, conc, { seg: 6 });
    for (var s = -1; s <= 1; s += 2) { b.limb(s * 0.35, 0.1, s * 0.2, s * 0.08, 3.6, 0, 0.05, 0.04, steel, { seg: 4 }); b.limb(s * 0.35, 0.1, -s * 0.2, s * 0.08, 3.6, 0, 0.05, 0.04, steel, { seg: 4 }); }
    b.box(0.7, 0.05, 0.05, 0, 1.3, 0, steel); b.box(0.9, 0.05, 0.05, 0, 2.2, 0, steel);
    b.box(2.2, 0.08, 0.08, 0, 3.3, 0, steel); b.box(1.6, 0.08, 0.08, 0, 2.7, 0, steel);
    for (var e = -1; e <= 1; e += 2) { b.cyl(0.04, 0.04, 0.3, e * 1.05, 3.12, 0, 0xe8e2d2, { seg: 5 }); b.cyl(0.04, 0.04, 0.3, e * 0.75, 2.52, 0, 0xe8e2d2, { seg: 5 }); }
    b.sph(0.1, 0.1, 0.1, 0, 3.7, 0, 0xcf3a2a, { s: [5, 4] });
    g.add(mesh(b.build()));
  };
  function genBody(b, col, stripe) {
    b.box(3.8, 0.14, 3.8, 0, 0.07, 0, conc);
    b.box(2.6, 1.3, 1.5, -0.2, 0.8, 0.1, col); b.box(2.7, 0.1, 1.6, -0.2, 1.5, 0.1, shade(col, 0.75));
    b.box(2.62, 0.18, 1.52, -0.2, 0.7, 0.1, stripe);
    for (var k = 0; k < 5; k++) b.box(0.06, 0.7, 0.04, -1.25 + k * 0.28, 0.9, 0.87, dark);   // louvres
    b.box(1.2, 0.5, 0.8, 1.1, 0.4, -1.1, 0xb0873a);   // fuel tank
    b.cyl(0.2, 0.2, 1.3, 1.1, 0.75, -1.1, 0xc4973f, { seg: 8, rot: [0, 0, PI / 2] });
  }
  MODELS.diesel_gen = function (g) {   // grubby diesel set with a tall stack and puffing exhaust
    var b = B(); genBody(b, 0x6f7f5a, 0xc9a02a);
    b.cyl(0.14, 0.18, 1.4, -1.1, 2.0, -0.5, 0x2e3236, { seg: 8 }); b.cyl(0.2, 0.2, 0.08, -1.1, 2.75, -0.5, 0x1d2023, { seg: 8 });
    b.box(0.5, 0.35, 0.05, 0.5, 0.95, 0.9, 0xd9d4c6);
    g.add(mesh(b.build()));
    var puffs = [], pg = grp('puffs'); pg.position.set(-1.1, 2.9, -0.5);
    for (var k = 0; k < 4; k++) { var pb = B(); pb.sph(0.28, 0.28, 0.28, 0, 0, 0, 0x6a6e72, { s: [6, 4] }); var m = mesh(pb.build()); pg.add(m); puffs.push(m); }
    g.add(pg);
    spin(g, function (dt, t, gr) {
      var st = genState(gr), on = st && st.out > 0.02, pw = on ? 0.4 + st.out * 0.8 : 0;
      for (var k = 0; k < puffs.length; k++) { var u = ((t * 0.5 + k / puffs.length) % 1), m = puffs[k]; m.position.set(u * 0.9, u * 1.6, u * 0.3); m.scale.setScalar(pw * (0.5 + u * 1.3) * (1 - u * 0.6) + 0.001); m.visible = pw > 0; }
      pg.rotation.z = on ? Math.sin(t * 40) * 0.003 : 0;
      gr.rotation.z = on ? Math.sin(t * 55) * 0.0025 : 0;
    });
  };
  MODELS.backup_gen = function (g) {   // tidier white standby set, light flashes when it is running
    var b = B(); genBody(b, 0xd8dde0, 0x3a7ec2);
    b.cyl(0.1, 0.1, 0.9, -1.1, 1.8, -0.5, 0x555a60, { seg: 8 });
    g.add(mesh(b.build()));
    var lb = B(); lb.sph(0.16, 0.16, 0.16, 1.0, 1.75, 0.5, 0xff9c1a, { s: [6, 4] }); var lamp = mesh(lb.build()); g.add(lamp);
    spin(g, function (dt, t, gr) { var st = genState(gr), on = st && st.out > 0.02; lamp.visible = !!on && (Math.floor(t * 3) & 1) === 0; });
  };
  MODELS.solar_field = function (g) {   // 6 x 6 m: rows of tilted panels on frames
    var b = B(); b.box(5.8, 0.1, 5.8, 0, 0.05, 0, 0x7a8a5a);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 2; c++) {
      var x = -1.35 + c * 2.7, z = -1.9 + r * 1.9;
      b.box(0.08, 0.7, 0.08, x - 1.0, 0.45, z + 0.3, steel); b.box(0.08, 0.7, 0.08, x + 1.0, 0.45, z + 0.3, steel);
      b.box(2.4, 0.06, 1.3, x, 0.95, z, 0x1f3f78, { rot: [-0.45, 0, 0] });
      b.box(2.4, 0.07, 0.04, x, 0.93, z, 0xaab8c8, { rot: [-0.45, 0, 0] });
      b.box(0.04, 0.07, 1.3, x, 0.94, z, 0xaab8c8, { rot: [-0.45, 0, 0] });
    }
    b.box(0.7, 0.6, 0.5, 2.4, 0.3, 2.3, 0xc9c4b6);
    g.add(mesh(b.build()));
  };
  MODELS.wind_turbine = function (g) {   // 2 x 2 m tile: slender tower, three blades that spin with the wind
    var b = B();
    b.cyl(0.5, 0.6, 0.15, 0, 0.07, 0, conc, { seg: 8 });
    b.cyl(0.1, 0.2, 5.6, 0, 2.9, 0, 0xe8ecee, { seg: 8 });
    b.box(0.3, 0.3, 0.7, 0, 5.8, 0.1, 0xdfe4e6);
    g.add(mesh(b.build()));
    var rot = grp('rotor'), rb = B(); rb.sph(0.16, 0.16, 0.16, 0, 0, 0, 0xcf3a2a, { s: [6, 4] });
    for (var k = 0; k < 3; k++) { var a = k * PI * 2 / 3; rb.limb(0, 0, 0, Math.sin(a) * 2.1, Math.cos(a) * 2.1, 0, 0.09, 0.03, 0xf2f2ee, { seg: 4 }); }
    rot.add(mesh(rb.build())); rot.position.set(0, 5.8, 0.5); g.add(rot);
    var ang = 0;
    spin(g, function (dt) { var w = Z.Power && Z.Power.windK ? Z.Power.windK() : 0.4; ang += dt * (0.2 + w * 5); rot.rotation.z = ang; });
  };
  MODELS.battery_bank = function (g) {   // two shipping-container style cabinets with a charge light
    var b = B(); b.box(3.8, 0.12, 3.8, 0, 0.06, 0, conc);
    for (var k = 0; k < 2; k++) {
      var z = -0.9 + k * 1.8; b.box(3.0, 1.4, 1.5, 0, 0.82, z, 0x3d7a8f); b.box(3.05, 0.08, 1.55, 0, 1.54, z, shade(0x3d7a8f, 0.7));
      for (var r = 0; r < 6; r++) b.box(0.05, 1.2, 0.04, -1.25 + r * 0.5, 0.82, z + (k ? 0.77 : -0.77), shade(0x3d7a8f, 0.78));
      b.box(0.5, 0.35, 0.04, 1.0, 1.0, z + (k ? 0.77 : -0.77), 0xe8e2d2);
    }
    b.box(0.5, 0.9, 0.5, 1.6, 0.6, 0, dark);
    g.add(mesh(b.build()));
    var lb = B(); lb.sph(0.14, 0.14, 0.14, 1.6, 1.15, 0, 0x4fe07a, { s: [6, 4] }); var led = mesh(lb.build()); g.add(led);
    spin(g, function (dt, t) { var s = Z.Power && Z.Power.status ? Z.Power.status() : null; led.visible = !s || s.capacity <= 0 || s.stored > 0.5 ? true : (Math.floor(t * 2) & 1) === 0; });
  };
  MODELS.geothermal_plant = function (g) {   // 8 x 8 m: turbine hall, cooling stacks with steam, pipework
    var b = B(), wall = 0xb8b4a8, roof = 0x586873;
    b.box(7.8, 0.14, 7.8, 0, 0.07, 0, conc);
    b.box(4.2, 2.2, 2.8, -1.2, 1.2, -1.8, wall); b.box(4.4, 0.2, 3.0, -1.2, 2.4, -1.8, roof);
    b.box(3.0, 0.6, 0.06, -1.2, 1.4, -0.38, 0x9fd0ec);
    for (var k = 0; k < 2; k++) { var x = 2.2 + k * 1.6; b.cyl(0.9, 1.1, 2.6, x, 1.4, 1.8, 0xc9c4b6, { seg: 12 }); b.cyl(0.85, 0.85, 0.1, x, 2.75, 1.8, dark, { seg: 12 }); }
    b.limb(-3.0, 0.45, 2.2, 1.2, 0.45, 2.0, 0.22, 0.22, 0xb0873a, { seg: 8 }); b.limb(-3.0, 0.45, 2.2, -3.0, 0.45, 3.4, 0.22, 0.22, 0xb0873a, { seg: 8 });
    b.cyl(0.4, 0.4, 1.4, -3.0, 0.9, 3.4, 0x7a7e82, { seg: 8 }); b.cyl(0.14, 0.14, 1.0, -3.0, 2.0, 3.4, steel, { seg: 6 });
    b.box(1.2, 1.6, 1.0, 2.8, 0.9, -2.6, 0x4f7a5a);
    g.add(mesh(b.build()));
    var puffs = [], pg = grp('steam');
    for (k = 0; k < 6; k++) { var pb = B(); pb.sph(0.5, 0.5, 0.5, 0, 0, 0, 0xf2f4f6, { s: [6, 4] }); var m = mesh(pb.build()); pg.add(m); puffs.push(m); }
    g.add(pg);
    spin(g, function (dt, t) {
      for (var k = 0; k < puffs.length; k++) { var u = (t * 0.25 + k / 6) % 1, m = puffs[k], tower = k & 1; m.position.set(2.2 + tower * 1.6 + Math.sin(k * 3 + t) * 0.2, 2.9 + u * 2.4, 1.8); m.scale.setScalar(0.4 + u * 1.2); }
    });
  };

  var oc = M.createBuilding, of = M.buildingFootprint;
  M.createBuilding = function (id) {
    if (MODELS[id]) { var g = grp(id); g.userData.buildingId = id; MODELS[id](g); g.userData.footprint = { w: DEF[id][0], h: DEF[id][1] }; return g; }
    return oc.apply(this, arguments);
  };
  M.buildingFootprint = function (id) { return DEF[id] ? { w: DEF[id][0], h: DEF[id][1] } : of.apply(this, arguments); };
})();
