// ===== 34-models-power.js =====
// Power package, models: substation, pylon, diesel / backup generators, solar field, wind turbine, battery bank, geothermal plant.
// Wrapped into Z.Models.createBuilding / buildingFootprint (same pattern as 33-models-moats.js). Animation reads Z.Power only.
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var K = M.kit, B = K.B, mesh = K.mesh, grp = K.grp, shade = K.shade, PI = Math.PI;
  var DEF = { substation: [2, 2], power_pylon: [1, 1], diesel_gen: [2, 2], solar_field: [3, 3], wind_turbine: [1, 1], battery_bank: [2, 2], backup_gen: [2, 2], geothermal_plant: [4, 4] };
  var MODELS = {};
  function spin(g, fn) {
    var prev = g.userData.update;
    g.userData.update = function (dt, t, gr, obj) {
      if (prev) prev.call(this, dt, t, gr, obj);
      var o = obj || (gr && gr.userData && gr.userData.obj) || (g.userData && g.userData.obj) || (this && this.obj);
      fn.call(this, dt, t || 0, gr || g, o);
    };
  }
  function genState(gr) { return Z.Power && Z.Power.genAt ? Z.Power.genAt(gr.position.x, gr.position.z) : null; }
  var steel = 0x8a949c, dark = 0x3b4248, conc = 0x9a968c;

  function insulatorBell(b, x, y, z, h, r, rot) {
    var s = h / 0.34;
    b.lathe([
      [0.035, 0], [r, 0.04 * s], [0.042, 0.08 * s],
      [r, 0.14 * s], [0.042, 0.18 * s],
      [r * 0.92, 0.24 * s], [0.042, 0.28 * s], [0.035, h]
    ], 0xe8e2d2, { x: x, y: y, z: z, rot: rot, seg: 8, cap0: true, cap1: true });
  }

  MODELS.substation = function (g) {   // 4 x 4 m: beveled transformer yard, stacked ceramic insulators, curved busbars
    var b = B();
    b.bevelBox(3.8, 0.14, 3.8, 0.04, 0, 0.07, 0, conc);
    b.bevelBox(3.8, 0.72, 0.14, 0.03, 0, 0.42, -1.84, 0xb8b2a4);
    b.bevelBox(0.14, 0.72, 3.6, 0.03, -1.84, 0.42, 0, 0xb8b2a4);
    b.bevelBox(0.14, 0.72, 3.6, 0.03, 1.84, 0.42, 0, 0xb8b2a4);
    b.bevelBox(3.9, 0.08, 0.20, 0.02, 0, 0.80, -1.84, 0x8e897c);
    // beveled main transformer tank + cooling radiator fins
    b.bevelBox(1.32, 1.02, 1.02, 0.06, -0.7, 0.64, -0.5, 0x4f7a5a);
    b.bevelBox(1.42, 0.12, 1.12, 0.03, -0.7, 1.18, -0.5, shade(0x4f7a5a, 0.8));
    for (var f = 0; f < 4; f++) b.bevelBox(0.06, 0.78, 0.16, 0.015, -1.2 + f * 0.32, 0.64, 0.08, shade(0x4f7a5a, 0.75));
    // domed conservator drum on transformer
    b.lathe([[0.18, -0.45], [0.20, -0.35], [0.20, 0.35], [0.18, 0.45], [0, 0.48]], shade(0x4f7a5a, 1.08), { x: -0.7, y: 1.42, z: -0.82, rot: [0, 0, PI / 2], seg: 10, cap0: true });
    // stacked ceramic insulator bells + curved HV busbar tubes to gantry
    for (var k = 0; k < 3; k++) {
      var bx = -1.1 + k * 0.4;
      insulatorBell(b, bx, 1.24, -0.42, 0.44, 0.11);
      b.tube([[bx, 1.68, -0.42], [bx, 2.08, 0.35], [-1.0 + k * 1.0, 2.38, 1.4]], 0.026, 0xb87a42, { seg: 6, steps: 3 });
    }
    // switchgear control cabinet
    b.bevelBox(1.02, 1.22, 0.92, 0.05, 0.9, 0.72, 0.5, 0xc9c4b6);
    b.bevelBox(1.10, 0.10, 1.00, 0.03, 0.9, 1.35, 0.5, shade(0xc9c4b6, 0.82));
    b.box(0.22, 0.22, 0.04, 0.9, 1.0, 0.98, 0xf2c230);
    // steel gantry frame with hanging insulator strings
    for (k = 0; k < 4; k++) b.cyl(0.045, 0.055, 2.4, -1.5 + k * 1.0, 1.3, 1.4, steel, { seg: 6 });
    b.bevelBox(3.2, 0.12, 0.12, 0.02, 0, 2.52, 1.4, dark);
    for (k = 0; k < 3; k++) insulatorBell(b, -1.0 + k * 1.0, 2.15, 1.4, 0.32, 0.085);
    b.box(0.5, 0.5, 0.05, 1.6, 0.9, 1.88, 0xf2c230);
    g.add(mesh(b.build()));
  };
  MODELS.power_pylon = function (g, opts) {   // 2 x 2 m: lattice pylon with angled truss crossarms and ceramic insulator strings (or floating buoy at sea)
    var sea = !!(opts && opts.sea);
    var b = B();
    var bob = sea ? grp('bob') : null, target = sea ? bob : g, yOff = sea ? 0.48 : 0;
    if (sea) {
      g.add(bob);
      // submerged dark ballast/keel cylinder (-0.35..0.02)
      b.cyl(0.72, 0.60, 0.37, 0, -0.165, 0, 0x262c32, { seg: 16 });
      // safety-orange / red-orange chamfered buoy hull (-0.04..0.38)
      b.lathe([[0.72, -0.04], [0.88, 0.06], [0.88, 0.30], [0.78, 0.38]], 0xe45724, { seg: 18, cap0: true, cap1: true });
      // crisp white/yellow hazard band (0.14..0.24)
      b.cyl(0.892, 0.892, 0.10, 0, 0.19, 0, 0xf4f2ea, { seg: 18 });
      // 4 dark rubber bumper fenders
      for (var f = 0; f < 4; f++) {
        var fa = f * PI / 2 + PI / 4;
        b.bevelBox(0.32, 0.15, 0.12, 0.025, Math.sin(fa) * 0.89, 0.19, Math.cos(fa) * 0.89, 0x22262a, { rot: [0, fa, 0] });
      }
      // steel deck plate (0.38..0.48)
      b.cyl(0.76, 0.78, 0.10, 0, 0.43, 0, steel, { seg: 18 });
      // 4 corner/perimeter safety railing posts and top rail
      var rRail = 0.70, nRail = 4;
      for (var rp = 0; rp < nRail; rp++) {
        var ra0 = rp / nRail * PI * 2 + PI / 4, ra1 = (rp + 1) / nRail * PI * 2 + PI / 4;
        var rx0 = Math.cos(ra0) * rRail, rz0 = Math.sin(ra0) * rRail;
        var rx1 = Math.cos(ra1) * rRail, rz1 = Math.sin(ra1) * rRail;
        b.cyl(0.025, 0.025, 0.42, rx0, 0.69, rz0, 0xd8dee2, { seg: 6 });
        b.limb(rx0, 0.89, rz0, rx1, 0.89, rz1, 0.022, 0.022, 0xf2c838, { seg: 6 });
      }
      b.lathe([[0.48, yOff], [0.45, yOff + 0.08], [0.38, yOff + 0.15], [0, yOff + 0.15]], dark, { seg: 8, cap0: true });
    } else {
      b.lathe([[0.54, 0], [0.50, 0.10], [0.40, 0.18], [0, 0.18]], conc, { seg: 8, cap0: true });
    }
    for (var s = -1; s <= 1; s += 2) {
      b.limb(s * 0.36, yOff + 0.14, s * 0.22, s * 0.08, yOff + 3.65, 0.02, 0.05, 0.035, steel, { seg: 5 });
      b.limb(s * 0.36, yOff + 0.14, -s * 0.22, s * 0.08, yOff + 3.65, -0.02, 0.05, 0.035, steel, { seg: 5 });
      // X-bracing
      b.limb(s * 0.32, yOff + 0.45, 0.19, -s * 0.24, yOff + 1.25, 0.14, 0.02, 0.02, shade(steel, 0.85), { seg: 4 });
      b.limb(s * 0.24, yOff + 1.25, 0.14, -s * 0.16, yOff + 2.20, 0.09, 0.02, 0.02, shade(steel, 0.85), { seg: 4 });
    }
    b.box(0.68, 0.05, 0.38, 0, yOff + 1.25, 0, steel); b.box(0.48, 0.05, 0.26, 0, yOff + 2.20, 0, steel);
    // angled tapered truss crossarms
    b.extrude([[-1.18, 0.03], [1.18, 0.03], [0.22, 0.24], [-0.22, 0.24]], 0.10, 0, yOff + 3.24, 0, [0, 0, 0], steel, { bev: 0.015 });
    b.extrude([[-0.86, 0.03], [0.86, 0.03], [0.20, 0.20], [-0.20, 0.20]], 0.10, 0, yOff + 2.64, 0, [0, 0, 0], steel, { bev: 0.015 });
    for (var e = -1; e <= 1; e += 2) {
      insulatorBell(b, e * 1.08, yOff + 2.94, 0, 0.34, 0.075);
      insulatorBell(b, e * 0.78, yOff + 2.34, 0, 0.34, 0.075);
    }
    b.cyl(0.02, 0.03, 0.35, 0, yOff + 3.80, 0, steel, { seg: 4 });
    b.sph(0.10, 0.10, 0.10, 0, yOff + 3.96, 0, 0xcf3a2a, { s: [6, 4] });
    target.add(mesh(b.build()));
    if (sea) {
      spin(g, function (dt, t, gr, o) {
        var phase = o ? o.id * 1.13 : 0;
        bob.position.y = Math.sin(t * 1.6 + phase) * 0.045;
        bob.rotation.x = Math.sin(t * 1.15 + phase) * 0.03;
        bob.rotation.z = Math.cos(t * 1.0 + phase) * 0.03;
      });
    }
  };
  function genBody(b, col, stripe) {
    b.bevelBox(3.8, 0.14, 3.8, 0.04, 0, 0.07, 0, conc);
    b.bevelBox(2.6, 1.32, 1.52, 0.07, -0.2, 0.80, 0.1, col);
    b.bevelBox(2.72, 0.14, 1.62, 0.04, -0.2, 1.50, 0.1, shade(col, 0.78));
    b.bevelBox(2.2, 0.12, 1.2, 0.03, -0.2, 1.61, 0.1, shade(col, 0.9));
    b.box(2.64, 0.18, 1.54, -0.2, 0.70, 0.1, stripe);
    // radiator grille at -x end & side intake louvres
    b.bevelBox(0.08, 0.88, 1.04, 0.02, -1.51, 0.82, 0.1, dark);
    for (var r = 0; r < 5; r++) b.box(0.10, 0.05, 0.92, -1.53, 0.50 + r * 0.16, 0.1, shade(steel, 0.8));
    for (var k = 0; k < 5; k++) b.bevelBox(0.08, 0.68, 0.06, 0.015, -1.25 + k * 0.28, 0.92, 0.87, dark);
    // rounded horizontal fuel drum on steel cradles
    b.bevelBox(1.15, 0.32, 0.74, 0.03, 1.1, 0.30, -1.1, 0x6a6e74);
    b.lathe([[0.01, -0.68], [0.24, -0.60], [0.27, -0.48], [0.27, 0.48], [0.24, 0.60], [0.01, 0.68]], 0xc4973f, { x: 1.1, y: 0.72, z: -1.1, rot: [0, 0, PI / 2], seg: 12 });
    b.cyl(0.285, 0.285, 0.05, 0.8, 0.72, -1.1, dark, { seg: 10, rot: [0, 0, PI / 2] });
    b.cyl(0.285, 0.285, 0.05, 1.4, 0.72, -1.1, dark, { seg: 10, rot: [0, 0, PI / 2] });
  }
  MODELS.diesel_gen = function (g) {   // grubby diesel set with curved exhaust manifold, muffler & puffing stack
    var b = B(); genBody(b, 0x6f7f5a, 0xc9a02a);
    b.tube([[-0.4, 1.48, -0.25], [-0.75, 1.72, -0.45], [-1.1, 1.80, -0.50]], 0.10, 0x3b4046, { seg: 8, steps: 3 });
    b.lathe([[0.12, 0], [0.22, 0.08], [0.22, 0.62], [0.14, 0.70], [0.14, 1.05], [0.19, 1.12], [0.12, 1.12]], 0x2a2e32, { x: -1.1, y: 1.72, z: -0.5, seg: 10, cap0: true });
    b.bevelBox(0.52, 0.38, 0.07, 0.02, 0.5, 0.95, 0.89, 0xd9d4c6);
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
  MODELS.backup_gen = function (g) {   // tidier white standby set with curved exhaust & flashing beacon
    var b = B(); genBody(b, 0xd8dde0, 0x3a7ec2);
    b.tube([[-0.5, 1.48, -0.25], [-0.85, 1.68, -0.45], [-1.1, 1.85, -0.50]], 0.08, 0x555a60, { seg: 8, steps: 3 });
    b.lathe([[0.09, 0], [0.15, 0.06], [0.15, 0.45], [0.09, 0.52], [0.09, 0.72]], 0x454a50, { x: -1.1, y: 1.68, z: -0.5, seg: 8, cap0: true, cap1: true });
    b.bevelBox(0.46, 0.34, 0.07, 0.02, 0.5, 0.95, 0.89, 0xf2f4f6);
    g.add(mesh(b.build()));
    var lb = B(); lb.sph(0.16, 0.16, 0.16, 1.0, 1.75, 0.5, 0xff9c1a, { s: [6, 4] }); var lamp = mesh(lb.build()); g.add(lamp);
    spin(g, function (dt, t, gr) { var st = genState(gr), on = st && st.out > 0.02; lamp.visible = !!on && (Math.floor(t * 3) & 1) === 0; });
  };
  MODELS.solar_field = function (g) {   // 6 x 6 m: rows of beveled tilted solar arrays on truss frames
    var b = B();
    b.bevelBox(5.8, 0.12, 5.8, 0.04, 0, 0.06, 0, 0x7a8a5a);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 2; c++) {
      var x = -1.35 + c * 2.7, z = -1.9 + r * 1.9;
      // angled steel truss rack
      b.limb(x - 0.95, 0.10, z + 0.35, x - 0.95, 0.72, z + 0.10, 0.045, 0.04, steel, { seg: 5 });
      b.limb(x + 0.95, 0.10, z + 0.35, x + 0.95, 0.72, z + 0.10, 0.045, 0.04, steel, { seg: 5 });
      b.limb(x - 0.95, 0.10, z - 0.30, x - 0.95, 1.08, z - 0.18, 0.045, 0.04, steel, { seg: 5 });
      b.limb(x + 0.95, 0.10, z - 0.30, x + 0.95, 1.08, z - 0.18, 0.045, 0.04, steel, { seg: 5 });
      b.limb(x - 0.95, 0.50, z + 0.20, x + 0.95, 0.50, z + 0.20, 0.03, 0.03, shade(steel, 0.85), { seg: 4 });
      // beveled aluminum frame & photovoltaic panel
      b.bevelBox(2.44, 0.08, 1.34, 0.025, x, 0.94, z, 0xaab8c8, { rot: [-0.45, 0, 0] });
      b.bevelBox(2.30, 0.06, 1.20, 0.015, x, 0.96, z, 0x1f3f78, { rot: [-0.45, 0, 0] });
      b.box(2.26, 0.07, 0.03, x, 0.96, z, 0xb8c8d8, { rot: [-0.45, 0, 0] });
      b.box(0.03, 0.07, 1.18, x, 0.96, z, 0xb8c8d8, { rot: [-0.45, 0, 0] });
    }
    b.bevelBox(0.74, 0.64, 0.54, 0.04, 2.4, 0.36, 2.3, 0xc9c4b6);
    b.tube([[2.05, 0.36, 2.3], [1.4, 0.24, 2.25], [1.35, 0.45, 1.9]], 0.04, dark, { seg: 6, steps: 2 });
    g.add(mesh(b.build()));
  };
  MODELS.wind_turbine = function (g) {   // 2 x 2 m tile: tapered tower, teardrop nacelle, spinner nosecone & twisted airfoil blades
    var b = B();
    b.lathe([[0.64, 0], [0.60, 0.12], [0.46, 0.24], [0, 0.24]], conc, { seg: 10, cap0: true });
    b.lathe([[0.30, 0.18], [0.24, 0.40], [0.19, 1.8], [0.14, 3.8], [0.11, 5.75]], 0xe8ecee, { seg: 10 });
    b.bevelBox(0.24, 0.52, 0.08, 0.02, 0, 0.50, 0.24, 0x5c6670);
    // streamlined teardrop aerodynamic nacelle
    b.lathe([[0.01, -0.50], [0.16, -0.38], [0.22, -0.10], [0.21, 0.24], [0.15, 0.38], [0.01, 0.42]], 0xdfe4e6, { x: 0, y: 5.8, z: 0.05, rot: [PI / 2, 0, 0], seg: 12 });
    b.bevelBox(0.14, 0.14, 0.36, 0.03, 0, 6.02, -0.14, 0x9aa4ac);
    g.add(mesh(b.build()));
    var rot = grp('rotor'), rb = B();
    rb.lathe([[0.15, -0.08], [0.16, 0.02], [0.12, 0.16], [0.05, 0.28], [0.005, 0.34]], 0xcf3a2a, { x: 0, y: 0, z: 0.02, rot: [PI / 2, 0, 0], seg: 12, cap0: true });
    rot.add(mesh(rb.build()));
    // single sculpted airfoil blade extruded with pitch twist, cloned 3x around Z
    var bb = B();
    bb.extrude([
      [0.00, 0.14], [-0.11, 0.42], [-0.075, 1.25], [-0.024, 2.15],
      [0.020, 2.15], [0.052, 1.25], [0.082, 0.42], [0.045, 0.14]
    ], 0.044, 0, 0, 0, [0, 0.26, 0], 0xf2f4f0, { bev: 0.014, taper: 0.55, curveX: 0.35 });
    var bladeGeo = bb.build();
    for (var k = 0; k < 3; k++) {
      var bm = mesh(bladeGeo);
      bm.rotation.z = k * PI * 2 / 3;
      rot.add(bm);
    }
    rot.position.set(0, 5.8, 0.46); g.add(rot);
    var ang = 0;
    spin(g, function (dt, t, gr) {
      var st = genState(gr);
      if (st && (st.state === 'broken' || st.state === 'tripped' || st.state === 'feathered')) return;
      var w = Z.Power && Z.Power.windK ? Z.Power.windK() : 0.4;
      ang += dt * (0.2 + w * 5);
      rot.rotation.z = ang;
    });
  };
  MODELS.battery_bank = function (g) {   // beveled ribbed container cabinets, roof HVAC pods & power conduits
    var b = B();
    b.bevelBox(3.8, 0.14, 3.8, 0.04, 0, 0.07, 0, conc);
    for (var k = 0; k < 2; k++) {
      var z = -0.9 + k * 1.8;
      b.bevelBox(3.0, 1.4, 1.5, 0.06, 0, 0.82, z, 0x3d7a8f);
      b.bevelBox(3.08, 0.10, 1.58, 0.03, 0, 1.54, z, shade(0x3d7a8f, 0.7));
      // roof HVAC pod
      b.bevelBox(0.8, 0.20, 0.65, 0.03, -0.7, 1.68, z, 0xb8c0c6);
      b.cyl(0.22, 0.22, 0.06, -0.7, 1.80, z, dark, { seg: 10 });
      for (var r = 0; r < 6; r++) b.bevelBox(0.06, 1.18, 0.05, 0.015, -1.25 + r * 0.5, 0.82, z + (k ? 0.76 : -0.76), shade(0x3d7a8f, 0.78));
      b.bevelBox(0.52, 0.36, 0.06, 0.015, 1.0, 1.0, z + (k ? 0.76 : -0.76), 0xe8e2d2);
    }
    b.bevelBox(0.54, 0.92, 0.54, 0.04, 1.6, 0.58, 0, dark);
    b.tube([[1.3, 1.15, -0.75], [1.6, 1.25, -0.38], [1.6, 1.02, 0]], 0.045, 0xc9a02a, { seg: 6, steps: 2 });
    b.tube([[1.3, 1.15, 0.75], [1.6, 1.25, 0.38], [1.6, 1.02, 0]], 0.045, 0xc9a02a, { seg: 6, steps: 2 });
    g.add(mesh(b.build()));
    var lb = B(); lb.sph(0.14, 0.14, 0.14, 1.6, 1.15, 0, 0x4fe07a, { s: [6, 4] }); var led = mesh(lb.build()); g.add(led);
    spin(g, function (dt, t) { var s = Z.Power && Z.Power.status ? Z.Power.status() : null; led.visible = !s || s.capacity <= 0 || s.stored > 0.5 ? true : (Math.floor(t * 2) & 1) === 0; });
  };
  MODELS.geothermal_plant = function (g) {   // 8 x 8 m: beveled turbine hall, hyperbolic cooling towers, curved steam manifolds
    var b = B(), wall = 0xb8b4a8, roof = 0x586873;
    b.bevelBox(7.8, 0.16, 7.8, 0.05, 0, 0.08, 0, conc);
    // beveled turbine hall with pilasters & stepped roof
    b.bevelBox(4.2, 2.2, 2.8, 0.08, -1.2, 1.24, -1.8, wall);
    b.bevelBox(4.45, 0.22, 3.05, 0.05, -1.2, 2.42, -1.8, roof);
    b.bevelBox(2.8, 0.45, 1.5, 0.05, -1.2, 2.72, -1.8, shade(roof, 1.12));
    for (var p = -2; p <= 2; p++) b.bevelBox(0.18, 2.15, 0.14, 0.02, -1.2 + p * 0.9, 1.22, -0.38, shade(wall, 0.85));
    b.box(3.0, 0.56, 0.06, -1.2, 1.45, -0.37, 0x9fd0ec);
    // two true hyperbolic lathe cooling towers
    for (var k = 0; k < 2; k++) {
      var tx = 1.95 + k * 1.50, tz = 1.75;
      b.lathe([
        [1.06, 0.14], [0.90, 0.65], [0.74, 1.30], [0.68, 1.90], [0.74, 2.42], [0.88, 2.86]
      ], 0xc9c4b6, { x: tx, y: 0, z: tz, seg: 16 });
      // flared coping rim & dark recessed throat
      b.lathe([[0.82, 2.82], [0.92, 2.86], [0.92, 2.94], [0.80, 2.94]], dark, { x: tx, y: 0, z: tz, seg: 16 });
      b.cyl(0.76, 0.76, 0.08, tx, 2.74, tz, 0x262b30, { seg: 14 });
      b.cyl(1.06, 1.12, 0.16, tx, 0.22, tz, shade(conc, 0.82), { seg: 14 });
    }
    // domed steam separator drum + curved steam manifolds into cooling towers
    b.lathe([[0.42, 0], [0.42, 1.05], [0.36, 1.25], [0.20, 1.38], [0, 1.42]], 0x7a7e82, { x: -2.9, y: 0.14, z: 2.9, seg: 10, cap0: true });
    b.cyl(0.14, 0.14, 0.75, -2.9, 1.85, 2.9, steel, { seg: 8 });
    b.tube([[-2.9, 0.90, 2.9], [-2.2, 0.95, 2.1], [-0.4, 0.75, 1.95], [1.95, 0.75, 1.75], [3.45, 0.75, 1.75]], 0.19, 0xb0873a, { seg: 8, steps: 3 });
    b.tube([[-1.2, 1.60, -0.5], [-0.4, 1.55, 0.55], [0.95, 1.15, 1.25], [1.95, 0.85, 1.65]], 0.15, steel, { seg: 8, steps: 3 });
    // beveled auxiliary transformer
    b.bevelBox(1.2, 1.55, 1.0, 0.06, 2.7, 0.92, -2.5, 0x4f7a5a);
    insulatorBell(b, 2.4, 1.72, -2.5, 0.34, 0.09);
    insulatorBell(b, 3.0, 1.72, -2.5, 0.34, 0.09);
    g.add(mesh(b.build()));
    var puffs = [], pg = grp('steam');
    for (k = 0; k < 6; k++) { var pb = B(); pb.sph(0.5, 0.5, 0.5, 0, 0, 0, 0xf2f4f6, { s: [6, 4] }); var m = mesh(pb.build()); pg.add(m); puffs.push(m); }
    g.add(pg);
    spin(g, function (dt, t, gr) {
      var st = genState(gr);
      if (st && (st.state === 'broken' || st.state === 'tripped')) { pg.visible = false; return; }
      pg.visible = true;
      for (var k = 0; k < puffs.length; k++) { var u = (t * 0.25 + k / 6) % 1, m = puffs[k], tower = k & 1; m.position.set(1.95 + tower * 1.50 + Math.sin(k * 3 + t) * 0.2, 2.95 + u * 2.4, 1.75); m.scale.setScalar(0.4 + u * 1.2); }
    });
  };

  var oc = M.createBuilding, of = M.buildingFootprint;
  M.createBuilding = function (id, opts) {
    if (MODELS[id]) { var g = grp(id); g.userData.buildingId = id; MODELS[id](g, opts); g.userData.footprint = { w: DEF[id][0], h: DEF[id][1] }; return g; }
    return oc.apply(this, arguments);
  };
  M.buildingFootprint = function (id) { return DEF[id] ? { w: DEF[id][0], h: DEF[id][1] } : of.apply(this, arguments); };
})();
