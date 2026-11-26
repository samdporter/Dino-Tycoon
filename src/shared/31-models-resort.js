// ===== 31-models-resort.js =====
// Shared Luxury Resort 3D models (11 buildings, 6 scenery items, 1 staff member: resort_guard).
// Compatible with both Dino Tycoon (src/dino/30-models.js) and Zoo Tycoon (src/zoo/30-models.js).
// Front of every building is +z at rotation 0.
(function () {
  'use strict';
  var M = window.Z && Z.Models;
  if (!M || !M.kit || M._resortHooked) return;
  M._resortHooked = true;

  var K = M.kit;
  var T = K.T || THREE;
  var B = K.B;
  var mesh = K.mesh;
  var PI = Math.PI, TAU = PI * 2;

  // Local helpers (zoo's M.kit exposes fewer utilities than dino's M.kit)
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function fract(x) { return x - Math.floor(x); }
  function grp(name) { var g = new T.Group(); if (name) g.name = name; return g; }
  function shade(col, f) {
    var r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
    return (clamp(Math.round(r * f), 0, 255) << 16) | (clamp(Math.round(g * f), 0, 255) << 8) | clamp(Math.round(b * f), 0, 255);
  }
  function makeMat(opts) {
    var useStd = !!(opts && opts.std && T.MeshStandardMaterial);
    var Ctor = useStd ? T.MeshStandardMaterial : T.MeshLambertMaterial;
    var p = {};
    for (var k in opts) if (k !== 'std' && Object.prototype.hasOwnProperty.call(opts, k)) p[k] = opts[k];
    if (!useStd) { delete p.metalness; delete p.roughness; }
    return new Ctor(p);
  }
  function detailScale() {
    if (typeof M.getDetail === 'function') return M.getDetail();
    if (typeof K.detail === 'function') return K.detail();
    return 1.5;
  }
  function segCount(n) { return Math.max(4, Math.round(n * detailScale() / 1.5)); }
  function chainUpdate(g, fn) {
    var prev = g.userData.update;
    g.userData.update = function (dt, t, gr, obj) {
      if (prev) prev.call(this, dt, t, gr, obj);
      fn.call(this, dt || 0, t || 0, gr || g, obj);
    };
  }
  function getNight() {
    try {
      if (window.Z && Z.World && typeof Z.World.info === 'function') {
        var inf = Z.World.info();
        if (inf && typeof inf.night === 'number' && isFinite(inf.night)) return clamp(inf.night, 0, 1);
      }
    } catch (e) { }
    return 0;
  }

  // Resort luxury palette
  var P = {
    ivory: 0xf4efe2,
    cream: 0xebe0c8,
    marble: 0xf3eee6,
    marbleDark: 0xd9d0c0,
    travertine: 0xe4d6ba,
    slate: 0x2f3640,
    charcoal: 0x22262c,
    darkWood: 0x4d3321,
    cedar: 0x9b623b,
    teak: 0xb67d4b,
    gold: 0xd8af48,
    goldBright: 0xf2ca5c,
    brass: 0xc29537,
    crimson: 0x9e1f2f,
    burgundy: 0x6f1726,
    terracotta: 0xc65b38,
    water: 0x29c3d6,
    waterDeep: 0x1688a2,
    glass: 0x9bd2ea,
    chrome: 0xd8e0e6,
    cushion: 0xfbf7ed,
    leaf: 0x338f47,
    leafLight: 0x48a852
  };

  // Shared cached materials for static translucent / accent parts
  var matCache = {};
  function cachedMat(key, opts) {
    if (!matCache[key]) matCache[key] = makeMat(opts);
    return matCache[key];
  }
  function waterMat() {
    return cachedMat('water', { std: true, color: P.water, emissive: 0x0d4f60, emissiveIntensity: 0.28, roughness: 0.16, metalness: 0.15, transparent: true, opacity: 0.82, depthWrite: false });
  }
  function glassMat() {
    return cachedMat('glass', { std: true, color: P.glass, emissive: 0x183848, emissiveIntensity: 0.12, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.56, depthWrite: false });
  }
  function lampMat(name) {
    var m = cachedMat('lamp_' + (name || 'warm'), { color: 0xfff0b8, emissive: 0xffc858, emissiveIntensity: 0.55 });
    m.name = name || 'lamp-bulb';
    return m;
  }

  // Reusable architectural builder helpers
  function plinth(b, w, d, h, col, stepCol) {
    b.bevelBox(w, h * 0.55, d, 0.03, 0, h * 0.275, 0, stepCol || shade(col, 0.92));
    b.bevelBox(w - 0.16, h * 0.45, d - 0.16, 0.025, 0, h * 0.775, 0, col);
  }
  function column(b, x, y0, z, r, h, col, trimCol) {
    var colC = col || P.marble, tr = trimCol || P.gold;
    b.bevelBox(r * 2.9, 0.12, r * 2.9, 0.02, x, y0 + 0.06, z, shade(colC, 0.92));
    b.cyl(r * 1.15, r * 1.2, 0.08, x, y0 + 0.16, z, tr, { seg: 10 });
    b.cyl(r * 0.9, r, Math.max(0.1, h - 0.38), x, y0 + 0.2 + (h - 0.38) * 0.5, z, colC, { seg: 10 });
    b.cyl(r * 1.18, r * 0.95, 0.1, x, y0 + h - 0.13, z, tr, { seg: 10 });
    b.bevelBox(r * 2.9, 0.08, r * 2.9, 0.02, x, y0 + h - 0.04, z, colC);
  }
  function windowBay(b, x, y, z, w, h, frameCol, rotY) {
    var r = rotY ? [0, rotY, 0] : null;
    b.box(w + 0.12, h + 0.12, 0.06, x, y, z, frameCol || P.gold, { rot: r });
    b.box(w, h, 0.07, x, y, z, P.glass, { rot: r });
    b.box(w + 0.18, 0.06, 0.12, x, y - h * 0.5 - 0.05, z, P.marbleDark, { rot: r });
  }
  function balcony(b, x, y, z, w, d) {
    b.bevelBox(w, 0.1, d, 0.02, x, y, z, P.marble);
    var rz = z + d * 0.5 - 0.04, n = Math.max(3, Math.round(w / 0.28));
    b.box(w, 0.05, 0.05, x, y + 0.42, rz, P.gold);
    for (var i = 0; i <= n; i++) {
      var px = x - w * 0.46 + (w * 0.92) * (i / n);
      b.cyl(0.022, 0.022, 0.38, px, y + 0.22, rz, P.brass, { seg: 5 });
    }
    for (var s = -1; s <= 1; s += 2) {
      b.box(0.05, 0.05, d, x + s * (w * 0.48), y + 0.42, z, P.gold);
      b.cyl(0.022, 0.022, 0.38, x + s * (w * 0.48), y + 0.22, z, P.brass, { seg: 5 });
    }
  }
  function lounger(b, x, y, z, rotY, stripeCol) {
    var cr = Math.cos(rotY || 0), sr = Math.sin(rotY || 0);
    function lx(px, pz) { return x + px * cr + pz * sr; }
    function lz(px, pz) { return z - px * sr + pz * cr; }
    var r = [0, rotY || 0, 0];
    b.bevelBox(0.7, 0.12, 1.55, 0.02, x, y + 0.18, z, P.teak, { rot: r });
    for (var sx = -1; sx <= 1; sx += 2) for (var sz = -1; sz <= 1; sz += 2) {
      b.box(0.07, 0.16, 0.07, lx(sx * 0.28, sz * 0.65), y + 0.08, lz(sx * 0.28, sz * 0.65), P.darkWood, { rot: r });
    }
    b.bevelBox(0.62, 0.08, 1.0, 0.02, lx(0, 0.22), y + 0.27, lz(0, 0.22), stripeCol || P.cushion, { rot: r });
    b.bevelBox(0.62, 0.08, 0.52, 0.02, lx(0, -0.46), y + 0.39, lz(0, -0.46), P.cushion, { rot: [0.48, rotY || 0, 0] });
    b.cyl(0.06, 0.06, 0.48, lx(0, -0.58), y + 0.5, lz(0, -0.58), stripeCol || P.gold, { seg: 6, rot: [0, rotY || 0, PI * 0.5] });
  }
  function parasol(b, x, y, z, col1, col2, tilt) {
    var tx = tilt || 0.16;
    b.cyl(0.24, 0.28, 0.08, x, y + 0.04, z, P.marbleDark, { seg: 8 });
    b.limb(x, y + 0.06, z, x + Math.sin(tx) * 0.35, y + 1.85, z, 0.032, 0.028, P.brass, { seg: 6 });
    var cx = x + Math.sin(tx) * 0.35, cy = y + 1.85;
    b.lathe([[0.01, 0.35], [0.55, 0.25], [1.05, 0.02], [1.08, 0]], function (px, py, pz) {
      var ang = Math.atan2(px - cx, pz - z);
      return fract(ang / TAU * 8) < 0.5 ? (col1 || P.cushion) : (col2 || P.water);
    }, { x: cx, y: cy - 0.18, z: z, rot: [0, 0, -tx], seg: 12, cap1: false });
    b.sph(0.05, 0.06, 0.05, cx - Math.sin(tx) * 0.04, cy + 0.2, z, P.gold, { s: [6, 4] });
  }
  function lanternPost(b, x, y, z, h) {
    b.bevelBox(0.26, 0.14, 0.26, 0.02, x, y + 0.07, z, P.travertine);
    b.cyl(0.05, 0.06, h, x, y + 0.14 + h * 0.5, z, P.darkWood, { seg: 6 });
    b.bevelBox(0.24, 0.05, 0.24, 0.01, x, y + 0.14 + h, z, P.gold);
    b.cone(0.2, 0.14, x, y + 0.35 + h, z, P.darkWood, { seg: 4, rot: [0, PI * 0.25, 0] });
    return [x, y + 0.23 + h, z];
  }
  function palmTree(b, x, y, z, height, leanX, leanZ) {
    var steps = 5, trCol = 0x8f6b47;
    var px = x, py = y, pz = z;
    for (var i = 0; i < steps; i++) {
      var t0 = i / steps, t1 = (i + 1) / steps;
      var nx = x + (leanX || 0.25) * t1 * t1, ny = y + height * t1, nz = z + (leanZ || 0.08) * t1 * t1;
      var r0 = lerp(0.18, 0.11, t0), r1 = lerp(0.18, 0.11, t1);
      b.limb(px, py, pz, nx, ny, nz, r0, r1, trCol, { seg: 6 });
      b.cyl(r1 * 1.15, r1 * 1.15, 0.05, nx, ny, nz, 0x735234, { seg: 6 });
      px = nx; py = ny; pz = nz;
    }
    var nF = 8, fc = [P.leaf, P.leafLight, 0x2c7d3e];
    for (i = 0; i < nF; i++) {
      var a = (i / nF) * TAU + 0.25;
      var len = 1.45 + (i % 2) * 0.25;
      var dx = Math.cos(a), dz = Math.sin(a);
      var mx = px + dx * len * 0.48, my = py + 0.22 - (i % 3) * 0.06, mz = pz + dz * len * 0.48;
      var ex = px + dx * len, ey = py - 0.35 - (i % 2) * 0.18, ez = pz + dz * len;
      b.sph(len * 0.38, 0.06, 0.19, mx, my, mz, fc[i % 3], { s: [5, 4], rot: [0, -a, 0.15] });
      b.sph(len * 0.35, 0.05, 0.16, (mx + ex) * 0.5, (my + ey) * 0.5, (mz + ez) * 0.5, fc[(i + 1) % 3], { s: [5, 4], rot: [0, -a, -0.45] });
    }
    for (i = 0; i < 3; i++) {
      var ca = i * 2.1;
      b.sph(0.1, 0.1, 0.1, px + Math.cos(ca) * 0.14, py - 0.1, pz + Math.sin(ca) * 0.14, 0x624327, { s: [5, 4] });
    }
  }
  function addLampBulbs(g, positions, r, mat) {
    var sg = new T.SphereGeometry(r || 0.08, segCount(7), segCount(5));
    var lm = mat || lampMat('lamp-bulb');
    for (var i = 0; i < positions.length; i++) {
      var m = new T.Mesh(sg, lm);
      m.position.set(positions[i][0], positions[i][1], positions[i][2]);
      m.name = 'lamp';
      g.add(m);
    }
  }
  function addSteamSystem(g, origins, maxRise, baseScale) {
    var sg = new T.SphereGeometry(baseScale || 0.16, segCount(6), segCount(4));
    var puffs = [];
    for (var i = 0; i < origins.length; i++) {
      var sm = makeMat({ color: 0xf6fbff, emissive: 0xdbeeff, emissiveIntensity: 0.12, transparent: true, opacity: 0.45, depthWrite: false });
      var m = new T.Mesh(sg, sm);
      m.userData = { ox: origins[i][0], oy: origins[i][1], oz: origins[i][2], ph: (i * 0.23) % 1 };
      g.add(m);
      puffs.push(m);
    }
    chainUpdate(g, function (dt, time) {
      for (var j = 0; j < puffs.length; j++) {
        var p = puffs[j], u = fract(time * 0.32 + p.userData.ph);
        p.position.set(p.userData.ox + Math.sin(u * 6 + j) * 0.09, p.userData.oy + u * (maxRise || 0.9), p.userData.oz + Math.cos(u * 5 + j) * 0.07);
        p.scale.setScalar(0.55 + u * 1.15);
        p.material.opacity = 0.48 * Math.sin(u * PI);
      }
    });
    g.userData.update(0, 0);
  }

  // ================================================================ 11 RESORT BUILDINGS
  var DEF = {
    luxury_hotel: [4, 3],
    private_villa: [3, 3],
    sky_lodge: [3, 2],
    michelin_restaurant: [3, 2],
    champagne_lounge: [2, 2],
    infinity_pool: [4, 3],
    luxury_spa: [3, 2],
    vip_viewing_lounge: [3, 2],
    grand_conservatory: [4, 3],
    vip_gatehouse: [2, 2],
    valet_concierge: [2, 2]
  };
  var MODELS = {};

  // 1. luxury_hotel (4x3 -> 8x6m)
  MODELS.luxury_hotel = function (g) {
    var b = B();
    plinth(b, 7.7, 5.7, 0.34, P.marble, P.marbleDark);
    // Grand front steps & crimson carpet runner (+z)
    b.bevelBox(3.4, 0.14, 0.9, 0.02, 0, 0.1, 2.38, P.marbleDark);
    b.bevelBox(3.1, 0.14, 0.6, 0.02, 0, 0.22, 2.18, P.marble);
    b.box(1.3, 0.04, 1.35, 0, 0.34, 2.25, P.crimson);
    b.box(1.42, 0.03, 1.35, 0, 0.325, 2.25, P.gold);

    // 3-story palatial main body
    b.bevelBox(6.8, 3.85, 3.8, 0.05, 0, 2.26, -0.35, P.ivory);
    // Gold floor cornice trims
    b.bevelBox(7.02, 0.1, 4.02, 0.02, 0, 1.56, -0.35, P.gold);
    b.bevelBox(7.02, 0.1, 4.02, 0.02, 0, 2.86, -0.35, P.gold);
    b.bevelBox(7.14, 0.16, 4.14, 0.03, 0, 4.18, -0.35, P.marbleDark);
    b.bevelBox(7.2, 0.08, 4.2, 0.02, 0, 4.28, -0.35, P.gold);

    // Pillared portico entrance (+z)
    b.bevelBox(3.3, 0.22, 1.3, 0.03, 0, 2.52, 1.95, P.marble);
    b.bevelBox(3.45, 0.08, 1.42, 0.02, 0, 2.66, 1.95, P.gold);
    b.extrude([[-1.65, 0], [1.65, 0], [0, 0.65]], 1.32, 0, 2.7, 1.95, null, P.ivory, { bev: 0.03 });
    b.extrude([[-1.3, 0.06], [1.3, 0.06], [0, 0.5]], 1.36, 0, 2.72, 1.97, null, P.gold, { bev: 0.02 });
    var colX = [-1.35, -0.62, 0.62, 1.35];
    for (var i = 0; i < colX.length; i++) column(b, colX[i], 0.34, 2.42, 0.13, 2.08, P.marble, P.gold);
    // Grand glass-and-gold entrance doors
    b.box(1.35, 1.75, 0.08, 0, 1.22, 1.56, P.gold);
    b.box(1.16, 1.58, 0.1, 0, 1.18, 1.57, P.glass);
    b.box(0.06, 1.58, 0.12, 0, 1.18, 1.58, P.gold);

    // Wrought-gold balconies on 2nd and 3rd stories
    for (var s = -1; s <= 1; s += 2) {
      balcony(b, s * 2.15, 1.58, 1.82, 1.6, 0.56);
      balcony(b, s * 2.15, 2.88, 1.82, 1.6, 0.56);
    }
    balcony(b, 0, 2.88, 1.82, 1.7, 0.56);

    // Dark slate mansard roof & rooftop gold crest
    b.bevelBox(6.8, 0.55, 3.8, 0.25, 0, 4.56, -0.35, P.slate);
    b.bevelBox(5.9, 0.35, 3.0, 0.12, 0, 4.95, -0.35, shade(P.slate, 0.88));
    b.bevelBox(6.05, 0.08, 3.15, 0.02, 0, 5.14, -0.35, P.gold);
    b.cyl(0.05, 0.06, 0.75, 0, 5.52, -0.35, P.gold, { seg: 8 });
    b.sph(0.12, 0.12, 0.12, 0, 5.92, -0.35, P.goldBright, { s: [8, 6] });

    // Window frames (glass panes added separately for night glow)
    var winFrames = [
      [-2.15, 1.0, 1.56], [2.15, 1.0, 1.56],
      [-2.15, 2.22, 1.56], [2.15, 2.22, 1.56],
      [-2.15, 3.52, 1.56], [0, 3.52, 1.56], [2.15, 3.52, 1.56]
    ];
    for (i = 0; i < winFrames.length; i++) {
      var wf = winFrames[i];
      b.box(0.96, 0.82, 0.06, wf[0], wf[1], wf[2], P.gold);
    }
    // Side & back window frames
    for (s = -1; s <= 1; s += 2) {
      for (var fl = 0; fl < 3; fl++) {
        for (var wz = -1.25; wz <= 0.6; wz += 1.8) {
          b.box(0.06, 0.78, 0.82, s * 3.41, 1.0 + fl * 1.26, wz, P.gold);
        }
      }
    }
    g.add(mesh(b.build()));

    // Warm glowing windows controlled by userData.update
    var winMat = makeMat({ std: true, color: 0xffe4a8, emissive: 0xffb23f, emissiveIntensity: 0.3, roughness: 0.25, metalness: 0.1 });
    winMat.name = 'hotel-window-glow';
    var wg = B();
    for (i = 0; i < winFrames.length; i++) {
      var wp = winFrames[i];
      wg.box(0.82, 0.68, 0.08, wp[0], wp[1], wp[2] + 0.01, 0xffffff);
    }
    for (s = -1; s <= 1; s += 2) {
      for (fl = 0; fl < 3; fl++) {
        for (wz = -1.25; wz <= 0.6; wz += 1.8) {
          wg.box(0.08, 0.64, 0.68, s * 3.42, 1.0 + fl * 1.26, wz, 0xffffff);
        }
      }
    }
    for (var bx = -2.1; bx <= 2.15; bx += 1.4) {
      for (fl = 0; fl < 3; fl++) wg.box(0.76, 0.62, 0.08, bx, 1.0 + fl * 1.26, -2.26, 0xffffff);
    }
    g.add(mesh(wg.build(), winMat));
    addLampBulbs(g, [[-1.35, 2.38, 2.52], [1.35, 2.38, 2.52]], 0.1);

    chainUpdate(g, function (dt, time) {
      var n = getNight();
      var shimmer = 0.06 * Math.sin(time * 1.4);
      winMat.emissiveIntensity = 0.22 + n * 1.45 + shimmer;
      if (winMat.emissive && winMat.emissive.setRGB) {
        winMat.emissive.setRGB(1.0, lerp(0.72, 0.82, n), lerp(0.28, 0.44, n));
      }
    });
    g.userData.update(0, 0);
  };

  // 2. private_villa (3x3 -> 6x6m)
  MODELS.private_villa = function (g) {
    var b = B();
    plinth(b, 5.7, 5.7, 0.24, P.travertine, shade(P.travertine, 0.88));
    // Cream stucco villa body
    b.bevelBox(4.8, 1.85, 2.6, 0.04, -0.15, 1.16, -1.25, P.cream);
    b.bevelBox(2.2, 1.65, 2.2, 0.04, -1.45, 1.06, 0.55, P.cream);
    // Terracotta hipped roofs
    b.bevelBox(5.3, 0.22, 3.1, 0.08, -0.15, 2.18, -1.25, P.terracotta);
    b.bevelBox(4.4, 0.34, 2.2, 0.14, -0.15, 2.42, -1.25, shade(P.terracotta, 0.92));
    b.bevelBox(3.1, 0.22, 0.9, 0.08, -0.15, 2.64, -1.25, shade(P.terracotta, 0.84));
    b.bevelBox(2.6, 0.22, 2.6, 0.08, -1.45, 1.98, 0.55, P.terracotta);
    b.bevelBox(1.8, 0.3, 1.8, 0.12, -1.45, 2.2, 0.55, shade(P.terracotta, 0.9));

    // Arched villa windows & door
    windowBay(b, 0.85, 1.25, 0.06, 1.15, 0.95, P.darkWood);
    windowBay(b, -1.35, 1.25, 1.66, 0.95, 0.9, P.darkWood);
    b.box(0.88, 1.45, 0.06, -0.35, 0.96, 0.22, P.darkWood);
    b.box(0.72, 1.32, 0.08, -0.35, 0.96, 0.23, P.glass);

    // Wooden pergola veranda over terrace
    var pCols = [[-0.25, 0.25], [2.25, 0.25], [-0.25, 2.35], [2.25, 2.35]];
    for (var i = 0; i < pCols.length; i++) {
      b.box(0.12, 1.75, 0.12, pCols[i][0], 1.12, pCols[i][1], P.darkWood);
    }
    b.box(2.7, 0.1, 0.12, 1.0, 2.02, 2.35, P.cedar);
    b.box(2.7, 0.1, 0.12, 1.0, 2.02, 0.25, P.cedar);
    for (i = 0; i < 6; i++) b.box(0.08, 0.08, 2.35, -0.15 + i * 0.46, 2.08, 1.3, P.teak);

    // Private turquoise plunge pool (marble coping + recessed basin)
    b.bevelBox(2.4, 0.16, 2.0, 0.02, 1.15, 0.28, 1.25, P.marble);
    b.box(2.05, 0.06, 1.65, 1.15, 0.25, 1.25, P.waterDeep);
    // Deck chairs by pool
    lounger(b, -0.55, 0.24, 2.1, 0.15, P.terracotta);
    lounger(b, 0.35, 0.24, 2.32, -0.12, P.terracotta);

    // Patio lanterns
    var lanterns = [
      lanternPost(b, -2.55, 0.24, 2.55, 0.85),
      lanternPost(b, 2.55, 0.24, 2.55, 0.85),
      lanternPost(b, 2.55, 0.24, -0.15, 0.85)
    ];
    g.add(mesh(b.build()));

    var poolWater = new T.Mesh(new T.BoxGeometry(2.02, 0.05, 1.62), waterMat());
    poolWater.position.set(1.15, 0.31, 1.25);
    g.add(poolWater);
    addLampBulbs(g, lanterns, 0.09);

    chainUpdate(g, function (dt, time) {
      poolWater.position.y = 0.31 + Math.sin(time * 2.1) * 0.008;
    });
    g.userData.update(0, 0);
  };

  // 3. sky_lodge (3x2 -> 6x4m)
  MODELS.sky_lodge = function (g) {
    var b = B();
    plinth(b, 5.7, 3.7, 0.2, P.marbleDark, shade(P.marbleDark, 0.88));
    // Sturdy support columns & diagonal bracing
    var cols = [[-2.0, -1.1], [2.0, -1.1], [-2.0, 1.1], [2.0, 1.1]];
    for (var i = 0; i < cols.length; i++) {
      b.cyl(0.14, 0.17, 1.55, cols[i][0], 0.96, cols[i][1], P.darkWood, { seg: 8 });
      b.cyl(0.2, 0.22, 0.14, cols[i][0], 0.27, cols[i][1], P.brass, { seg: 8 });
    }
    b.limb(-2.0, 0.35, -1.1, -0.8, 1.65, -0.6, 0.07, 0.06, P.brass, { seg: 6 });
    b.limb(2.0, 0.35, -1.1, 0.8, 1.65, -0.6, 0.07, 0.06, P.brass, { seg: 6 });
    // Timber access stairs (+z)
    for (i = 0; i < 6; i++) {
      b.bevelBox(1.1, 0.1, 0.28, 0.015, 0, 0.35 + i * 0.23, 1.65 - i * 0.16, P.teak);
    }

    // Elevated sky deck
    b.bevelBox(5.5, 0.18, 3.55, 0.03, 0, 1.72, 0, P.teak);
    b.bevelBox(5.55, 0.08, 3.6, 0.02, 0, 1.63, 0, P.brass);
    // Corner timber-and-brass cabin frame & warm interior floor/back wall
    b.bevelBox(4.1, 1.55, 2.25, 0.04, 0, 2.56, -0.25, P.cedar);
    b.box(3.75, 1.32, 1.95, 0, 2.54, -0.18, 0xf2c87a); // warm interior glow core
    // Balcony brass posts & top rail
    var rails = [[-2.65, 1.68], [2.65, 1.68], [-2.65, -1.68], [2.65, -1.68], [-1.3, 1.68], [1.3, 1.68]];
    for (i = 0; i < rails.length; i++) b.cyl(0.03, 0.03, 0.55, rails[i][0], 2.08, rails[i][1], P.brass, { seg: 6 });
    b.box(5.35, 0.05, 0.06, 0, 2.36, 1.68, P.brass);
    b.box(5.35, 0.05, 0.06, 0, 2.36, -1.68, P.brass);
    b.box(0.06, 0.05, 3.4, -2.65, 2.36, 0, P.brass);
    b.box(0.06, 0.05, 3.4, 2.65, 2.36, 0, P.brass);

    // Cantilevered luxury roof
    b.bevelBox(5.8, 0.16, 3.85, 0.04, 0, 3.44, 0.08, P.darkWood);
    b.bevelBox(5.5, 0.18, 3.4, 0.06, 0, 3.58, 0.05, P.slate);
    b.box(5.82, 0.05, 3.87, 0, 3.38, 0.08, P.gold);
    g.add(mesh(b.build()));

    // Wrap-around glass viewing balcony & cabin windows
    var gm = glassMat();
    var gb = B();
    gb.box(5.24, 0.45, 0.04, 0, 2.06, 1.68, 0xffffff);
    gb.box(0.04, 0.45, 3.3, -2.65, 2.06, 0, 0xffffff);
    gb.box(0.04, 0.45, 3.3, 2.65, 2.06, 0, 0xffffff);
    gb.box(3.85, 1.25, 0.05, 0, 2.55, 0.89, 0xffffff);
    gb.box(0.05, 1.25, 2.0, -2.06, 2.55, -0.25, 0xffffff);
    gb.box(0.05, 1.25, 2.0, 2.06, 2.55, -0.25, 0xffffff);
    g.add(mesh(gb.build(), gm));

    var interiorGlow = makeMat({ color: 0xffe49c, emissive: 0xffaa38, emissiveIntensity: 0.45 });
    var ig = new T.Mesh(new T.BoxGeometry(3.4, 1.05, 1.6), interiorGlow);
    ig.position.set(0, 2.55, -0.22);
    g.add(ig);
    chainUpdate(g, function (dt, time) {
      interiorGlow.emissiveIntensity = 0.35 + getNight() * 0.95 + 0.05 * Math.sin(time * 1.5);
    });
    g.userData.update(0, 0);
  };

  // 4. michelin_restaurant (3x2 -> 6x4m)
  MODELS.michelin_restaurant = function (g) {
    var b = B();
    plinth(b, 5.7, 3.7, 0.24, P.marble, P.marbleDark);
    // Fine-dining hall (-z)
    b.bevelBox(5.1, 2.35, 1.9, 0.04, 0, 1.4, -0.82, P.ivory);
    b.bevelBox(5.35, 0.16, 2.15, 0.03, 0, 2.64, -0.82, P.marbleDark);
    b.bevelBox(5.42, 0.08, 2.22, 0.02, 0, 2.74, -0.82, P.gold);
    b.bevelBox(4.7, 0.26, 1.6, 0.06, 0, 2.9, -0.82, P.slate);

    // Arched glass facade bays
    for (var s = -1; s <= 1; s++) {
      var wx = s * 1.55;
      b.box(1.18, 1.55, 0.08, wx, 1.25, 0.14, P.gold);
      b.cyl(0.59, 0.59, 0.08, wx, 2.02, 0.14, P.gold, { seg: 10, rot: [PI * 0.5, 0, 0] });
      b.box(1.04, 1.44, 0.1, wx, 1.23, 0.15, P.glass);
      b.cyl(0.5, 0.5, 0.1, wx, 1.98, 0.15, P.glass, { seg: 10, rot: [PI * 0.5, 0, 0] });
    }
    // Burgundy-and-gold striped awning
    var nAwn = 10, awW = 4.9, sw = awW / nAwn;
    for (var i = 0; i < nAwn; i++) {
      var ax = -awW * 0.5 + sw * (i + 0.5), ac = (i % 2 === 0) ? P.burgundy : P.gold;
      b.box(sw * 0.99, 0.05, 0.85, ax, 2.06, 0.52, ac, { rot: [0.38, 0, 0] });
      b.box(sw * 0.99, 0.14, 0.04, ax, 1.85, 0.92, ac);
    }

    // Marble dining terrace with 3 white-clothed tables, chairs, and tiny golden lamps
    var lamps = [];
    for (i = 0; i < 3; i++) {
      var tx = -1.75 + i * 1.75, tz = 1.18;
      b.cyl(0.05, 0.12, 0.56, tx, 0.52, tz, P.gold, { seg: 8 });
      b.cyl(0.44, 0.44, 0.06, tx, 0.82, tz, P.cushion, { seg: 12 });
      b.cyl(0.42, 0.45, 0.12, tx, 0.74, tz, P.marble, { seg: 12 });
      for (var c = -1; c <= 1; c += 2) {
        b.box(0.28, 0.05, 0.28, tx + c * 0.52, 0.52, tz, P.burgundy);
        b.box(0.05, 0.38, 0.28, tx + c * 0.64, 0.72, tz, P.burgundy);
        b.cyl(0.03, 0.03, 0.28, tx + c * 0.52, 0.38, tz, P.gold, { seg: 5 });
      }
      b.cyl(0.03, 0.04, 0.14, tx, 0.92, tz, P.gold, { seg: 6 });
      lamps.push([tx, 1.03, tz]);
    }
    // Topiary urns flanking terrace
    for (s = -1; s <= 1; s += 2) {
      b.cyl(0.2, 0.14, 0.34, s * 2.55, 0.41, 1.55, P.marbleDark, { seg: 8 });
      b.sph(0.24, 0.28, 0.24, s * 2.55, 0.74, 1.55, P.leaf, { s: [7, 5] });
    }
    g.add(mesh(b.build()));
    addLampBulbs(g, lamps, 0.065);
    if (K.labelMesh) g.add(K.labelMesh('LE GOURMET', P.burgundy, P.goldBright, 1.9, 0.3, 0, 2.46, 0.17, 0));
  };

  // 5. champagne_lounge (2x2 -> 4x4m)
  MODELS.champagne_lounge = function (g) {
    var b = B();
    // Octagonal marble & gold dais
    b.cyl(1.88, 1.95, 0.16, 0, 0.08, 0, P.marbleDark, { seg: 8 });
    b.cyl(1.75, 1.82, 0.14, 0, 0.23, 0, P.marble, { seg: 8 });
    b.cyl(1.62, 1.62, 0.03, 0, 0.31, 0, P.gold, { seg: 8 });
    // 8 slender gilded columns
    for (var i = 0; i < 8; i++) {
      var a = (i + 0.5) / 8 * TAU;
      column(b, Math.cos(a) * 1.48, 0.3, Math.sin(a) * 1.48, 0.065, 1.88, P.gold, P.goldBright);
    }
    // Gilded octagonal canopy roof
    b.cyl(1.78, 1.85, 0.14, 0, 2.24, 0, P.gold, { seg: 8 });
    b.cyl(1.62, 1.72, 0.12, 0, 2.36, 0, P.burgundy, { seg: 8 });
    b.lathe([[1.62, 0], [1.3, 0.36], [0.7, 0.68], [0.15, 0.86], [0.02, 1.1]], P.gold, { y: 2.42, seg: 8, cap1: true });
    b.sph(0.11, 0.14, 0.11, 0, 3.55, 0, P.goldBright, { s: [8, 6] });

    // Curved marble bar counter & glittering bottle display
    b.lathe([[0.65, 0], [0.92, 0], [0.92, 0.72], [0.98, 0.78], [0.6, 0.78], [0.6, 0]], P.marble, { y: 0.3, seg: 10, phi0: -1.1, phiLen: 2.2 });
    b.lathe([[0.58, 0.78], [0.99, 0.78], [0.99, 0.84], [0.58, 0.84]], P.gold, { y: 0.3, seg: 10, phi0: -1.1, phiLen: 2.2 });
    // Central tiered champagne bottle tower
    b.cyl(0.38, 0.42, 0.9, 0, 0.75, -0.35, P.darkWood, { seg: 8 });
    b.cyl(0.44, 0.44, 0.05, 0, 1.22, -0.35, P.gold, { seg: 8 });
    b.cyl(0.3, 0.3, 0.05, 0, 1.5, -0.35, P.gold, { seg: 8 });
    for (i = 0; i < 6; i++) {
      var ba = i / 6 * TAU;
      var bc = (i % 2 === 0) ? 0x2e7d4a : P.goldBright;
      b.cyl(0.035, 0.045, 0.24, Math.cos(ba) * 0.28, 1.36, -0.35 + Math.sin(ba) * 0.28, bc, { seg: 6 });
    }
    // 4 bar stools around front
    for (i = 0; i < 4; i++) {
      var sa = -0.78 + i * 0.52, sx = Math.sin(sa) * 1.18, sz = Math.cos(sa) * 1.18;
      b.cyl(0.035, 0.08, 0.46, sx, 0.53, sz, P.brass, { seg: 6 });
      b.cyl(0.15, 0.14, 0.08, sx, 0.78, sz, P.crimson, { seg: 8 });
    }
    g.add(mesh(b.build()));
    addLampBulbs(g, [[0, 2.1, 0], [-0.45, 1.45, -0.35], [0.45, 1.45, -0.35]], 0.08);
  };

  // 6. infinity_pool (4x3 -> 8x6m)
  MODELS.infinity_pool = function (g) {
    var b = B();
    plinth(b, 7.7, 5.7, 0.22, P.travertine, P.marbleDark);
    // Raised infinity basin walls & deep tiled floor
    b.bevelBox(5.2, 0.34, 3.6, 0.03, 0.75, 0.36, 0.1, P.marble);
    b.box(4.85, 0.08, 3.25, 0.75, 0.34, 0.1, P.waterDeep);
    // Infinity weir cascade lip (+z side)
    b.bevelBox(4.8, 0.24, 0.16, 0.02, 0.75, 0.28, 1.94, shade(P.water, 0.95));

    // Striped sun loungers & tilted parasols
    lounger(b, -0.9, 0.22, -2.05, 0.0, P.water);
    lounger(b, 0.55, 0.22, -2.05, 0.0, P.goldBright);
    lounger(b, 2.0, 0.22, -2.05, 0.0, P.water);
    lounger(b, -2.55, 0.22, 1.45, 0.55, P.goldBright);
    parasol(b, -0.18, 0.22, -2.2, P.cushion, P.water, 0.16);
    parasol(b, 2.8, 0.22, -1.9, P.cushion, P.goldBright, -0.15);

    // Poolside draped cabana (-x side)
    b.bevelBox(1.9, 0.12, 2.1, 0.02, -2.65, 0.28, -1.1, P.teak);
    var cPost = [[-3.45, -1.98], [-1.85, -1.98], [-3.45, -0.22], [-1.85, -0.22]];
    for (var i = 0; i < cPost.length; i++) b.cyl(0.045, 0.045, 1.65, cPost[i][0], 1.15, cPost[i][1], P.cushion, { seg: 6 });
    b.bevelBox(2.05, 0.14, 2.25, 0.04, -2.65, 2.02, -1.1, P.cushion);
    b.bevelBox(1.5, 0.16, 1.65, 0.06, -2.65, 2.15, -1.1, P.gold);
    b.bevelBox(1.3, 0.18, 1.5, 0.04, -2.65, 0.42, -1.1, P.cushion);

    // Chrome pool ladder
    for (var s = -1; s <= 1; s += 2) {
      b.cyl(0.024, 0.024, 0.65, -1.55, 0.58, 0.1 + s * 0.24, P.chrome, { seg: 6 });
      b.limb(-1.55, 0.9, 0.1 + s * 0.24, -1.85, 0.52, 0.1 + s * 0.24, 0.024, 0.024, P.chrome, { seg: 6 });
    }
    b.box(0.05, 0.04, 0.48, -1.55, 0.44, 0.1, P.chrome);
    g.add(mesh(b.build()));

    // Shimmering animated water surface
    var poolWaterMat = waterMat().clone();
    var water = new T.Mesh(new T.BoxGeometry(4.82, 0.08, 3.22), poolWaterMat);
    water.position.set(0.75, 0.49, 0.1);
    g.add(water);
    chainUpdate(g, function (dt, time) {
      water.position.y = 0.49 + Math.sin(time * 2.2) * 0.012;
      poolWaterMat.emissiveIntensity = 0.24 + 0.14 * Math.sin(time * 2.8);
    });
    g.userData.update(0, 0);
  };

  // 7. luxury_spa (3x2 -> 6x4m)
  MODELS.luxury_spa = function (g) {
    var b = B();
    plinth(b, 5.7, 3.7, 0.22, P.travertine, shade(P.travertine, 0.88));
    // Warm cedar sauna pavilion (-x)
    b.bevelBox(2.55, 1.75, 2.65, 0.04, -1.35, 1.1, -0.2, P.cedar);
    for (var i = 0; i < 6; i++) b.box(2.58, 0.04, 2.68, -1.35, 0.42 + i * 0.26, -0.2, shade(P.darkWood, 1.05));
    b.bevelBox(2.95, 0.16, 3.05, 0.04, -1.35, 2.04, -0.2, P.darkWood);
    b.bevelBox(2.4, 0.22, 2.4, 0.08, -1.35, 2.2, -0.2, P.slate);
    b.box(0.95, 1.35, 0.08, -1.35, 0.96, 1.14, P.gold);
    b.box(0.82, 1.22, 0.1, -1.35, 0.96, 1.15, P.glass);

    // Steaming turquoise thermal pool (+x)
    b.bevelBox(2.45, 0.24, 2.55, 0.04, 1.35, 0.34, -0.05, P.travertine);
    b.box(2.05, 0.06, 2.15, 1.35, 0.32, -0.05, P.waterDeep);
    // Stone stepping blocks
    var steps = [[0.2, 0.85], [0.55, 1.15], [0.95, 1.35]];
    for (i = 0; i < steps.length; i++) {
      b.bevelBox(0.38, 0.1, 0.32, 0.02, steps[i][0], 0.28, steps[i][1], P.marbleDark);
    }
    // Zen stone lantern
    var lp = lanternPost(b, 2.42, 0.22, 1.42, 0.58);
    g.add(mesh(b.build()));

    var thermWater = new T.Mesh(new T.BoxGeometry(2.02, 0.06, 2.12), waterMat());
    thermWater.position.set(1.35, 0.42, -0.05);
    g.add(thermWater);
    addLampBulbs(g, [lp], 0.08);
    addSteamSystem(g, [[0.85, 0.48, -0.45], [1.45, 0.5, 0.2], [1.75, 0.48, -0.35], [1.1, 0.5, 0.45], [1.55, 0.52, -0.05]], 1.05, 0.17);
  };

  // 8. vip_viewing_lounge (3x2 -> 6x4m)
  MODELS.vip_viewing_lounge = function (g) {
    var b = B();
    plinth(b, 5.7, 3.7, 0.22, P.slate, P.charcoal);
    // Sculpted angled brass & dark-stone piers supporting cantilevered lounge
    b.bevelBox(2.4, 1.25, 1.6, 0.05, 0, 0.84, -0.75, P.charcoal);
    for (var s = -1; s <= 1; s += 2) {
      b.limb(s * 1.65, 0.22, -0.8, s * 1.95, 1.55, 0.4, 0.15, 0.12, P.brass, { seg: 8 });
      b.limb(s * 1.65, 0.22, 0.4, s * 1.95, 1.55, 0.9, 0.12, 0.1, P.gold, { seg: 8 });
    }
    // Cantilevered deck & rear enclosure
    b.bevelBox(5.2, 0.22, 3.25, 0.04, 0, 1.62, 0.18, P.marble);
    b.bevelBox(5.32, 0.08, 3.36, 0.02, 0, 1.52, 0.18, P.brass);
    b.bevelBox(4.8, 1.4, 1.15, 0.04, 0, 2.42, -0.85, P.charcoal);
    // Plush interior VIP sofas visible through panoramic front glass
    b.bevelBox(1.5, 0.34, 0.65, -1.25, 1.9, 0.35, P.crimson);
    b.bevelBox(1.5, 0.34, 0.65, 1.25, 1.9, 0.35, P.crimson);
    b.cyl(0.35, 0.35, 0.24, 0, 1.85, 0.45, P.gold, { seg: 10 });
    // Brass window mullions
    for (var i = -2; i <= 2; i++) {
      b.box(0.08, 1.42, 0.1, i * 1.18, 2.42, 1.72, P.brass);
    }
    // Cantilevered roof & glowing VIP crest
    b.bevelBox(5.45, 0.18, 3.55, 0.04, 0, 3.2, 0.22, P.charcoal);
    b.bevelBox(5.55, 0.08, 3.65, 0.02, 0, 3.31, 0.22, P.gold);
    b.bevelBox(1.4, 0.32, 0.25, 0, 3.5, 1.45, P.gold);
    g.add(mesh(b.build()));

    var gm = glassMat();
    var gb = B();
    gb.box(4.78, 1.32, 0.05, 0, 2.42, 1.72, 0xffffff);
    gb.box(0.05, 1.32, 2.0, -2.42, 2.42, 0.72, 0xffffff);
    gb.box(0.05, 1.32, 2.0, 2.42, 2.42, 0.72, 0xffffff);
    g.add(mesh(gb.build(), gm));
    addLampBulbs(g, [[0, 3.52, 1.58], [-1.3, 2.95, 0.45], [1.3, 2.95, 0.45]], 0.11);
  };

  // 9. grand_conservatory (4x3 -> 8x6m)
  MODELS.grand_conservatory = function (g) {
    var b = B();
    plinth(b, 7.7, 5.7, 0.26, P.marble, P.marbleDark);
    // Classical marble arched entrance portico (+z)
    b.bevelBox(2.8, 1.95, 1.05, 0.04, 0, 1.24, 2.18, P.marble);
    b.box(1.5, 1.55, 1.12, 0, 1.04, 2.18, P.glass);
    column(b, -1.18, 0.26, 2.62, 0.11, 1.85, P.marble, P.gold);
    column(b, 1.18, 0.26, 2.62, 0.11, 1.85, P.marble, P.gold);
    b.bevelBox(3.05, 0.16, 1.25, 0.03, 0, 2.24, 2.22, P.gold);

    // Base marble ring & side glass-wing frames
    b.cyl(2.65, 2.75, 0.48, 0, 0.5, -0.25, P.marble, { seg: 16 });
    b.cyl(2.72, 2.72, 0.1, 0, 0.76, -0.25, P.gold, { seg: 16 });
    for (var s = -1; s <= 1; s += 2) {
      b.bevelBox(1.3, 0.45, 2.7, 0.03, s * 2.85, 0.48, -0.25, P.marble);
      b.box(1.2, 0.08, 2.7, s * 2.85, 0.74, -0.25, P.gold);
      b.box(0.08, 1.35, 2.7, s * 3.45, 1.42, -0.25, P.gold);
    }

    // Gilded meridian ribs wrapping biosphere dome
    var nRib = 8;
    for (var i = 0; i < nRib; i++) {
      var a = (i / nRib) * TAU;
      for (var k = 0; k < 5; k++) {
        var t0 = k / 5 * PI * 0.48, t1 = (k + 1) / 5 * PI * 0.48;
        var r0 = Math.cos(t0) * 2.62, y0 = 0.8 + Math.sin(t0) * 2.85;
        var r1 = Math.cos(t1) * 2.62, y1 = 0.8 + Math.sin(t1) * 2.85;
        b.limb(Math.cos(a) * r0, y0, -0.25 + Math.sin(a) * r0, Math.cos(a) * r1, y1, -0.25 + Math.sin(a) * r1, 0.045, 0.045, P.gold, { seg: 5 });
      }
    }
    b.cyl(1.88, 1.88, 0.08, 0, 2.85, -0.25, P.gold, { seg: 16 });
    // Apex cupola lantern
    b.cyl(0.45, 0.52, 0.35, 0, 3.72, -0.25, P.gold, { seg: 10 });
    b.cone(0.54, 0.45, 0, 4.12, -0.25, P.goldBright, { seg: 10 });

    // Lush interior tropical palms, foliage & tiered interior waterfall/pool
    b.cyl(1.35, 1.45, 0.22, 0, 0.37, -0.25, P.marbleDark, { seg: 12 });
    b.cyl(1.18, 1.18, 0.14, 0, 0.44, -0.25, P.water, { seg: 12 });
    b.cyl(0.5, 0.62, 0.55, 0, 0.72, -0.55, P.marble, { seg: 10 });
    b.cyl(0.65, 0.45, 0.12, 0, 1.02, -0.55, P.water, { seg: 10 });
    palmTree(b, -1.25, 0.26, -0.85, 2.1, 0.18, 0.1);
    palmTree(b, 1.25, 0.26, -0.75, 1.95, -0.15, 0.12);
    b.sph(0.65, 0.45, 0.65, -2.5, 0.65, -0.3, P.leaf, { s: [6, 5] });
    b.sph(0.65, 0.45, 0.65, 2.5, 0.65, -0.3, P.leafLight, { s: [6, 5] });
    g.add(mesh(b.build()));

    // Crystal glass dome & side wings
    var gm = glassMat();
    var gb = B();
    gb.lathe([[2.56, 0.8], [2.42, 1.55], [2.02, 2.35], [1.35, 3.05], [0.48, 3.56]], 0xffffff, { z: -0.25, seg: 16, cap1: true });
    for (s = -1; s <= 1; s += 2) {
      gb.box(1.18, 1.28, 2.55, s * 2.8, 1.38, -0.25, 0xffffff);
    }
    g.add(mesh(gb.build(), gm));
    addLampBulbs(g, [[0, 3.7, -0.25]], 0.14);
  };

  // 10. vip_gatehouse (2x2 -> 4x4m)
  MODELS.vip_gatehouse = function (g) {
    var b = B();
    plinth(b, 3.7, 3.7, 0.18, P.marble, P.marbleDark);
    // Crimson carpet walkway
    b.box(1.5, 0.03, 3.55, 0, 0.195, 0, P.crimson);
    b.box(1.66, 0.02, 3.55, 0, 0.185, 0, P.gold);
    // Marble & gold security arch spanning walkway
    for (var s = -1; s <= 1; s += 2) {
      b.bevelBox(0.55, 2.25, 0.72, 0.03, s * 1.25, 1.3, 0, P.marble);
      b.box(0.62, 0.1, 0.78, s * 1.25, 2.38, 0, P.gold);
    }
    b.bevelBox(3.3, 0.42, 0.8, 0.04, 0, 2.64, 0, P.marble);
    b.bevelBox(3.45, 0.1, 0.9, 0.02, 0, 2.9, 0, P.gold);
    b.extrude([[-1.2, 0], [1.2, 0], [0, 0.48]], 0.76, 0, 2.96, 0, null, P.marbleDark, { bev: 0.02 });
    // Guard kiosk booth on left side
    b.bevelBox(1.1, 1.55, 1.1, 0.03, -1.18, 0.96, -0.82, P.ivory);
    b.box(0.82, 0.72, 1.14, -1.18, 1.22, -0.82, P.glass);
    b.bevelBox(1.28, 0.16, 1.28, 0.03, -1.18, 1.8, -0.82, P.gold);

    // 4 gold stanchions + draped crimson velvet ropes
    for (s = -1; s <= 1; s += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        var px = s * 0.9, pz = sz * 1.35;
        b.cyl(0.11, 0.13, 0.06, px, 0.21, pz, P.gold, { seg: 8 });
        b.cyl(0.035, 0.035, 0.68, px, 0.56, pz, P.gold, { seg: 6 });
        b.sph(0.06, 0.06, 0.06, px, 0.92, pz, P.goldBright, { s: [6, 4] });
      }
      b.tube([[s * 0.9, 0.84, -1.35], [s * 0.9, 0.64, 0], [s * 0.9, 0.84, 1.35]], 0.032, P.crimson, { seg: 6, steps: 3 });
    }
    g.add(mesh(b.build()));

    // Subtle glowing golden crest
    var crestMat = makeMat({ color: P.goldBright, emissive: 0xffb830, emissiveIntensity: 0.55 });
    var crest = new T.Mesh(new T.CylinderGeometry(0.24, 0.24, 0.08, segCount(10)), crestMat);
    crest.rotation.x = PI * 0.5;
    crest.position.set(0, 3.16, 0.42);
    g.add(crest);
    chainUpdate(g, function (dt, time) {
      crestMat.emissiveIntensity = 0.4 + getNight() * 0.8 + 0.12 * Math.sin(time * 2.0);
    });
    g.userData.update(0, 0);
  };

  // 11. valet_concierge (2x2 -> 4x4m)
  MODELS.valet_concierge = function (g) {
    var b = B();
    plinth(b, 3.7, 3.7, 0.18, P.marble, P.marbleDark);
    // Red carpet approach (+z)
    b.box(1.35, 0.03, 1.9, 0, 0.195, 0.95, P.crimson);
    b.box(1.48, 0.02, 1.9, 0, 0.185, 0.95, P.gold);

    // Ornate ivory & gold concierge kiosk
    b.bevelBox(2.2, 1.55, 1.8, 0.04, 0, 0.96, -0.55, P.ivory);
    b.bevelBox(2.35, 0.12, 1.95, 0.02, 0, 1.78, -0.55, P.gold);
    b.box(1.45, 0.72, 0.08, 0, 1.18, 0.36, P.glass);
    b.bevelBox(1.75, 0.09, 0.36, 0.02, 0, 0.82, 0.44, P.marbleDark);
    b.box(1.75, 0.04, 0.36, 0, 0.87, 0.44, P.gold);
    // Domed gold-and-ivory roof
    b.lathe([[1.22, 0], [1.14, 0.24], [0.85, 0.58], [0.38, 0.82], [0.04, 0.96]], function (px, py, pz) {
      return fract(Math.atan2(px, pz + 0.55) / TAU * 8) < 0.5 ? P.gold : P.ivory;
    }, { y: 1.84, z: -0.55, seg: 12, cap1: true });
    b.sph(0.11, 0.15, 0.11, 0, 2.9, -0.55, P.goldBright, { s: [8, 6] });

    // Brass luggage trolley (+x, +z) with stacked luxury suitcases
    var tx = 1.25, tz = 0.85;
    b.bevelBox(0.66, 0.08, 0.92, 0.015, tx, 0.29, tz, P.crimson);
    for (var s = -1; s <= 1; s += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        b.cyl(0.055, 0.055, 0.04, tx + s * 0.26, 0.23, tz + sz * 0.34, P.charcoal, { seg: 8, rot: [0, 0, PI * 0.5] });
      }
      b.cyl(0.024, 0.024, 0.95, tx + s * 0.28, 0.78, tz, P.brass, { seg: 6 });
    }
    b.tube([[tx - 0.28, 1.24, tz], [tx - 0.18, 1.44, tz], [tx + 0.18, 1.44, tz], [tx + 0.28, 1.24, tz]], 0.025, P.gold, { seg: 6, steps: 2 });
    b.bevelBox(0.46, 0.22, 0.34, 0.02, tx, 0.44, tz - 0.1, P.darkWood);
    b.bevelBox(0.36, 0.18, 0.28, 0.02, tx + 0.03, 0.64, tz + 0.06, 0xa87438);
    g.add(mesh(b.build()));
    addLampBulbs(g, [[-0.85, 1.56, 0.42], [0.85, 1.56, 0.42]], 0.075);
  };

  // ================================================================ 6 SCENERY ITEMS
  var SCENERY = {};

  // 12. heated_oasis_pool (enclosure luxury item)
  SCENERY.heated_oasis_pool = function (g) {
    var b = B();
    b.lathe([[1.38, 0], [1.42, 0.24], [1.34, 0.3], [1.14, 0.3], [1.1, 0.08], [0, 0.08]], P.marble, { seg: 14, cap0: true, cap1: false });
    b.cyl(1.12, 1.12, 0.05, 0, 0.11, 0, P.waterDeep, { seg: 12 });
    // Cascading rock waterfall on -z rim
    b.sph(0.55, 0.45, 0.42, 0, 0.46, -1.18, 0x8e867a, { s: [7, 5] });
    b.sph(0.38, 0.34, 0.34, -0.46, 0.38, -1.06, 0x7b746a, { s: [6, 5] });
    b.sph(0.36, 0.32, 0.32, 0.48, 0.36, -1.06, 0x9b9285, { s: [6, 5] });
    b.box(0.46, 0.48, 0.12, 0, 0.44, -0.92, P.water, { rot: [0.35, 0, 0] });
    g.add(mesh(b.build()));

    var owMat = waterMat().clone();
    var water = new T.Mesh(new T.CylinderGeometry(1.12, 1.12, 0.06, segCount(14)), owMat);
    water.position.y = 0.22;
    g.add(water);
    chainUpdate(g, function (dt, time) {
      water.position.y = 0.22 + Math.sin(time * 2.0) * 0.01;
      owMat.emissiveIntensity = 0.24 + 0.12 * Math.sin(time * 2.6);
    });
    addSteamSystem(g, [[-0.4, 0.28, 0.2], [0.35, 0.3, -0.15], [0, 0.28, 0.45]], 0.72, 0.13);
  };

  // 13. marble_pavilion_shelter (enclosure luxury shelter)
  SCENERY.marble_pavilion_shelter = function (g) {
    var b = B();
    b.bevelBox(2.75, 0.12, 2.75, 0.03, 0, 0.06, 0, P.marbleDark);
    b.bevelBox(2.55, 0.12, 2.55, 0.03, 0, 0.18, 0, P.marble);
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        column(b, sx * 1.0, 0.24, sz * 1.0, 0.11, 1.85, P.marble, P.gold);
      }
    }
    b.bevelBox(2.58, 0.16, 2.58, 0.03, 0, 2.18, 0, P.marble);
    b.bevelBox(2.68, 0.08, 2.68, 0.02, 0, 2.3, 0, P.gold);
    b.lathe([[1.22, 0], [1.05, 0.32], [0.55, 0.62], [0.05, 0.76]], P.marble, { y: 2.34, seg: 12, cap1: true });
    b.sph(0.11, 0.15, 0.11, 0, 3.16, 0, P.goldBright, { s: [8, 6] });
    g.add(mesh(b.build()));
  };

  // 14. golden_enrichment (enclosure luxury toy)
  SCENERY.golden_enrichment = function (g) {
    var b = B();
    b.bevelBox(1.45, 0.16, 1.45, 0.03, 0, 0.08, 0, P.marbleDark);
    b.lathe([[0.64, 0.16], [0.68, 0.36], [0.56, 0.38], [0.18, 0.4], [0.14, 0.85], [0.48, 0.96], [0.44, 1.02], [0.12, 1.02], [0.09, 1.45], [0.32, 1.54], [0.28, 1.58], [0.07, 1.58], [0.05, 1.86]], P.gold, { seg: 12, cap0: true, cap1: true });
    b.sph(0.16, 0.16, 0.16, 0, 1.98, 0, P.goldBright, { s: [9, 7] });
    g.add(mesh(b.build()));

    var pool = new T.Mesh(new T.CylinderGeometry(0.56, 0.56, 0.05, segCount(12)), waterMat());
    pool.position.y = 0.34;
    g.add(pool);

    var dropGeo = new T.SphereGeometry(0.05, segCount(5), segCount(4));
    var dropMat = makeMat({ color: 0xcff5ff, emissive: 0x55d8f0, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 });
    var drops = [];
    for (var i = 0; i < 12; i++) {
      var d = new T.Mesh(dropGeo, dropMat);
      d.userData = { a: (i / 12) * TAU, tier: i % 2, ph: (i * 0.29) % 1 };
      g.add(d);
      drops.push(d);
    }
    chainUpdate(g, function (dt, time) {
      pool.position.y = 0.34 + Math.sin(time * 2.2) * 0.006;
      for (var j = 0; j < drops.length; j++) {
        var dr = drops[j], u = fract(time * 0.85 + dr.userData.ph);
        var rad = dr.userData.tier ? 0.42 : 0.24;
        var y0 = dr.userData.tier ? 1.0 : 1.56;
        dr.position.set(Math.cos(dr.userData.a) * rad * (0.4 + 0.7 * u), y0 - 0.65 * u * u + 0.18 * Math.sin(u * PI), Math.sin(dr.userData.a) * rad * (0.4 + 0.7 * u));
        dr.scale.setScalar(1 - u * 0.35);
      }
    });
    g.userData.update(0, 0);
  };

  // 15. cabana_lounger (deco)
  SCENERY.cabana_lounger = function (g) {
    var b = B();
    b.bevelBox(1.85, 0.14, 1.85, 0.03, 0, 0.07, 0, P.teak);
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        b.cyl(0.045, 0.045, 1.68, sx * 0.78, 0.96, sz * 0.78, P.cushion, { seg: 6 });
      }
      // Draped side curtains
      b.box(0.06, 1.32, 0.28, sx * 0.78, 0.85, -0.66, P.cushion);
    }
    b.bevelBox(1.96, 0.12, 1.96, 0.03, 0, 1.86, 0, P.cushion);
    b.bevelBox(1.42, 0.16, 1.42, 0.06, 0, 1.98, 0, P.gold);
    lounger(b, 0, 0.14, 0.05, 0, P.water);
    g.add(mesh(b.build()));
  };

  // 16. gold_fountain (deco)
  SCENERY.gold_fountain = function (g) {
    var b = B();
    // Octagonal marble & gold basin
    b.cyl(1.22, 1.28, 0.34, 0, 0.17, 0, P.marble, { seg: 8 });
    b.cyl(1.26, 1.26, 0.08, 0, 0.36, 0, P.gold, { seg: 8 });
    b.cyl(1.06, 1.06, 0.06, 0, 0.1, 0, P.waterDeep, { seg: 8 });
    // 3-tier marble & gold spire
    b.lathe([
      [0.24, 0.12], [0.22, 0.65], [0.62, 0.78], [0.62, 0.86], [0.16, 0.86],
      [0.14, 1.32], [0.42, 1.42], [0.42, 1.48], [0.11, 1.48],
      [0.09, 1.86], [0.24, 1.94], [0.22, 1.98], [0.05, 1.98], [0.03, 2.22]
    ], function (px, py) {
      return (py > 0.74 && py < 0.88) || (py > 1.4 && py < 1.5) || py > 1.92 ? P.gold : P.marble;
    }, { seg: 12, cap0: true, cap1: true });
    b.sph(0.11, 0.12, 0.11, 0, 2.3, 0, P.goldBright, { s: [7, 5] });
    g.add(mesh(b.build()));

    var basinMat = makeMat({ std: true, color: 0x35d6e6, emissive: 0x1aaac0, emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, depthWrite: false });
    var water = new T.Mesh(new T.CylinderGeometry(1.06, 1.06, 0.06, segCount(12)), basinMat);
    water.position.y = 0.28;
    g.add(water);

    var dropGeo = new T.SphereGeometry(0.055, segCount(5), segCount(4));
    var dropMat = makeMat({ color: 0xdff8ff, emissive: 0x55d8f0, emissiveIntensity: 0.25, transparent: true, opacity: 0.86 });
    var drops = [];
    for (var i = 0; i < 14; i++) {
      var d = new T.Mesh(dropGeo, dropMat);
      d.userData = { a: (i / 14) * TAU, k: i % 3, ph: (i * 0.31) % 1 };
      g.add(d);
      drops.push(d);
    }
    chainUpdate(g, function (dt, time) {
      water.position.y = 0.28 + Math.sin(time * 2.1) * 0.008;
      basinMat.emissiveIntensity = 0.35 + getNight() * 0.75 + 0.08 * Math.sin(time * 2.4);
      for (var j = 0; j < drops.length; j++) {
        var dr = drops[j], u = fract(time * 0.8 + dr.userData.ph), k = dr.userData.k;
        var rad = k === 0 ? 0.52 : (k === 1 ? 0.82 : 0.26);
        var base = k === 0 ? 1.46 : (k === 1 ? 0.84 : 2.02);
        dr.position.set(Math.sin(dr.userData.a) * rad * u, base + 0.34 * Math.sin(u * PI) - 0.55 * u * u, Math.cos(dr.userData.a) * rad * u);
        dr.scale.setScalar(1 - u * 0.35);
      }
    });
    g.userData.update(0, 0);
  };

  // 17. palm_colonnade (deco)
  SCENERY.palm_colonnade = function (g) {
    var b = B();
    b.bevelBox(1.18, 0.14, 1.18, 0.03, 0, 0.07, 0, P.marbleDark);
    b.bevelBox(1.04, 0.44, 1.04, 0.03, 0, 0.34, 0, P.marble);
    b.bevelBox(1.12, 0.08, 1.12, 0.02, 0, 0.56, 0, P.gold);
    b.box(0.86, 0.08, 0.86, 0, 0.56, 0, 0x563d28);
    palmTree(b, 0, 0.56, 0, 4.1, 0.22, 0.08);
    g.add(mesh(b.build()));
    // 4 warm uplight lenses at planter corners
    addLampBulbs(g, [[-0.36, 0.62, 0.36], [0.36, 0.62, 0.36], [-0.36, 0.62, -0.36], [0.36, 0.62, -0.36]], 0.06);
  };

  // ================================================================ 18. STAFF: resort_guard
  function createResortGuard() {
    var HIP = 0.78, SHO = 1.36;
    var skins = [0xf6d0b0, 0xe8b88c, 0xd1996a, 0xa56a43];
    var hairs = [0x1c1814, 0x2b1d14, 0x4b331d, 0x151515];
    var skin = skins[Math.floor(Math.random() * skins.length) % skins.length];
    var hair = hairs[Math.floor(Math.random() * hairs.length) % hairs.length];
    var suit = 0x23272e, suitDark = 0x16191e, shirt = 0xf7f7f4, shoe = 0x121317;

    var root = grp('person'), rig = grp('rig');
    root.add(rig);

    // Tailored charcoal suit torso, white shirt V-front, dark tie, gold lapel badge, black sunglasses & earpiece
    var bg = B();
    bg.loft([[-1.40, 0.105, 0.075, 0], [-1.34, 0.215, 0.12, 0.005], [-1.18, 0.20, 0.125, 0.01], [-0.96, 0.172, 0.105, 0], [-0.79, 0.195, 0.118, 0], [-0.73, 0.135, 0.088, 0]], { down: true, rings: 8, seg: 10, cap0: true, cap1: true }, suit);
    // Tailored jacket skirt & shoulders
    bg.cyl(0.19, 0.215, 0.24, 0, HIP - 0.08, 0, suit, { seg: 12, sx: 1.12, sz: 0.66 });
    bg.sph(0.084, 0.074, 0.078, 0.23, SHO - 0.01, 0, suit, { s: [7, 5] });
    bg.sph(0.084, 0.074, 0.078, -0.23, SHO - 0.01, 0, suit, { s: [7, 5] });
    // Crisp white dress shirt V-front & collar + sleek dark tie
    bg.cyl(0.082, 0.105, 0.042, 0, 1.39, 0, shirt, { seg: 10 });
    bg.extrude([[-0.06, 0.3], [0.06, 0.3], [0, 0]], 0.04, 0, 1.06, 0.118, null, shirt);
    bg.box(0.036, 0.26, 0.03, 0, 1.19, 0.132, suitDark);
    // Suit lapels & gold lapel badge on left chest
    bg.limb(0.055, SHO - 0.03, 0.112, 0.014, HIP + 0.24, 0.128, 0.028, 0.02, suitDark, { seg: 5 });
    bg.limb(-0.055, SHO - 0.03, 0.112, -0.014, HIP + 0.24, 0.128, 0.028, 0.02, suitDark, { seg: 5 });
    bg.cyl(0.024, 0.024, 0.012, -0.105, 1.22, 0.125, P.goldBright, { seg: 8, rot: [PI * 0.5, 0, 0] });
    // Belt & gold buckle
    bg.cyl(0.184, 0.194, 0.05, 0, HIP + 0.03, 0, suitDark, { seg: 12, sx: 1.12, sz: 0.66 });
    bg.box(0.048, 0.038, 0.02, 0, HIP + 0.03, 0.132, P.gold);

    // Neck, head, ears, nose, mouth, styled hair
    var hy = 1.58, hr = 0.16;
    bg.cyl(0.056, 0.068, 0.11, 0, 1.43, 0, shade(skin, 0.92), { seg: 8 });
    bg.sph(hr, hr * 1.06, hr, 0, hy, 0, skin, { s: [10, 8] });
    bg.sph(0.024, 0.036, 0.018, hr * 0.96, hy - 0.005, -0.005, shade(skin, 0.92), { s: [5, 4] });
    bg.sph(0.024, 0.036, 0.018, -hr * 0.96, hy - 0.005, -0.005, shade(skin, 0.92), { s: [5, 4] });
    bg.sph(0.022, 0.026, 0.028, 0, hy - 0.028, hr * 1.01, shade(skin, 0.91), { s: [5, 4] });
    bg.sph(0.036, 0.01, 0.012, 0, hy - 0.075, hr * 0.94, shade(skin, 0.68), { s: [5, 4] });
    bg.sph(hr * 1.07, hr * 0.78, hr * 1.09, 0, hy + 0.054, -0.014, hair, { s: [9, 6] });
    bg.sph(0.11, 0.032, 0.045, 0, hy + 0.10, hr * 0.78, hair, { s: [6, 4] });
    // Sleek black sunglasses (lenses + bridge + temple arms)
    bg.box(0.095, 0.055, 0.025, 0.064, hy + 0.016, hr * 0.98, 0x0b0c10);
    bg.box(0.095, 0.055, 0.025, -0.064, hy + 0.016, hr * 0.98, 0x0b0c10);
    bg.box(0.04, 0.014, 0.022, 0, hy + 0.024, hr * 0.99, 0x1c1e24);
    bg.limb(0.11, hy + 0.022, hr * 0.92, hr * 0.96, hy + 0.018, 0.01, 0.008, 0.008, 0x16181e, { seg: 4 });
    bg.limb(-0.11, hy + 0.022, hr * 0.92, -hr * 0.96, hy + 0.018, 0.01, 0.008, 0.008, 0x16181e, { seg: 4 });
    // Tactical earpiece + coiled cord down right neck to collar
    bg.sph(0.022, 0.024, 0.02, -hr * 0.98, hy - 0.005, 0.01, 0x14151a, { s: [5, 4] });
    bg.tube([[-hr * 0.96, hy - 0.02, 0.005], [-0.14, 1.48, -0.02], [-0.11, 1.38, 0.04]], 0.008, 0x16181e, { seg: 4, steps: 2 });

    var body = mesh(bg.build());
    rig.add(body);

    // Tailored trousers & dress shoes
    var lg = B();
    lg.sph(0.086, 0.086, 0.086, 0, 0, 0, suit, { s: [7, 5] });
    lg.limb(0, 0, 0, 0, -0.38, 0, 0.088, 0.072, suit, { seg: 8 });
    lg.sph(0.07, 0.07, 0.072, 0, -0.38, 0.004, suit, { s: [6, 5] });
    lg.limb(0, -0.38, 0, 0, -0.71, 0, 0.072, 0.056, suit, { seg: 8 });
    lg.cyl(0.06, 0.065, 0.075, 0, -HIP + 0.046, -0.005, shoe, { seg: 8 });
    lg.sph(0.07, 0.046, 0.11, 0, -HIP + 0.044, 0.072, shoe, { s: [7, 5] });
    lg.cyl(0.07, 0.074, 0.022, 0, -HIP + 0.011, 0.034, 0x2a2a30, { seg: 8, sx: 1.0, sz: 1.72 });
    var legGeo = lg.build();

    // Suit jacket sleeves + crisp white cuffs + hands
    var ag = B();
    ag.sph(0.064, 0.064, 0.064, 0, 0, 0, suit, { s: [7, 5] });
    ag.limb(0, 0, 0, 0, -0.48, 0, 0.06, 0.045, suit, { seg: 8 });
    ag.cyl(0.046, 0.046, 0.03, 0, -0.51, 0, shirt, { seg: 8 });
    ag.limb(0, -0.52, 0, 0, -0.56, 0, 0.042, 0.035, skin, { seg: 8 });
    ag.sph(0.044, 0.054, 0.038, 0, -0.6, 0.004, skin, { s: [7, 5] });
    var armGeo = ag.build();

    var legs = [], arms = [];
    for (var s = 0; s < 2; s++) {
      var sd = s ? -1 : 1;
      var lp = grp('leg'); lp.position.set(sd * 0.1, HIP, 0); rig.add(lp); lp.add(mesh(legGeo)); legs.push(lp);
      var ap = grp('arm'); ap.position.set(sd * 0.27, SHO, 0); rig.add(ap); ap.add(mesh(armGeo)); arms.push(ap);
    }

    var I = {
      rig: rig, body: body, legs: legs, arms: arms, prop: null, propName: null, sc: 1,
      ph: Math.random() * 6, t: Math.random() * 50, gw: 0, rw: 0, sw: 0,
      lookY: 0, lookTY: 0, lookT: 1 + Math.random() * 3,
      actT: 3 + Math.random() * 6, act: 0, actK: 0, a0: 0, a1: 0, a0z: 0, a1z: 0,
      seed: Math.random() * 6, work: 0
    };
    var upd = function (dt, ent) {
      if (window.Z && Z.ModelCommon && typeof Z.ModelCommon.personUpdate === 'function') {
        Z.ModelCommon.personUpdate(I, dt, ent || { state: 'idle', speed: 0 }, false);
      }
    };
    upd(0.0001, { state: 'idle', speed: 0 });
    return { group: root, height: 1.78, update: upd };
  }

  // ================================================================ Z.Models HOOKS
  var origCreateBuilding = M.createBuilding;
  var origCreateScenery = M.createScenery;
  var origCreateStaff = M.createStaff;
  var origFootprint = M.buildingFootprint;
  var origSetDetail = M.setDetail;

  M.createBuilding = function (id) {
    if (MODELS[id]) {
      var g = grp(id);
      g.userData.buildingId = id;
      MODELS[id](g);
      var def = DEF[id], w = def[0], h = def[1];
      try {
        var D = window.Z && Z.DATA && Z.DATA.buildings;
        if (D) for (var i = 0; i < D.length; i++) if (D[i].id === id) { w = D[i].w || w; h = D[i].h || h; break; }
      } catch (e) { }
      if (w !== def[0] || h !== def[1]) g.scale.set(w / def[0], 1, h / def[1]);
      g.userData.footprint = { w: w, h: h };
      return g;
    }
    return origCreateBuilding.apply(this, arguments);
  };

  if (typeof origFootprint === 'function') {
    M.buildingFootprint = function (id) {
      return DEF[id] ? { w: DEF[id][0], h: DEF[id][1] } : origFootprint.apply(this, arguments);
    };
  }

  M.createScenery = function (id) {
    if (SCENERY[id]) {
      var g = grp(id);
      g.userData.sceneryId = id;
      SCENERY[id](g);
      return g;
    }
    return origCreateScenery.apply(this, arguments);
  };

  if (typeof origCreateStaff === 'function') {
    M.createStaff = function (type) {
      if (type === 'resort_guard') return createResortGuard();
      return origCreateStaff.apply(this, arguments);
    };
  }

  if (typeof origSetDetail === 'function') {
    M.setDetail = function (d) {
      return origSetDetail.apply(this, arguments);
    };
  }
})();
