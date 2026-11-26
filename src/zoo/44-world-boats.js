// Wild Acres Zoo — Pontoon decks, piers, helipads, boats and helicopters (Zoo Tycoon only)
(function () {
  'use strict';
  var Z = window.Z, D = Z && Z.DATA;
  if (!Z || !D || typeof THREE === 'undefined') return;

  var T = Z.TILE || 2;
  var DECK_Y = 0.14;
  var grp = null, deckMesh = null, floatMesh = null, deckSig = -1, sigT = 0, spin = 0, bobT = 0;
  var vehicles = {};
  var mats = {};

  function mat(color) { return mats[color] || (mats[color] = new THREE.MeshLambertMaterial({ color: color })); }
  function box(g, w, h, d, x, y, z, color) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    return m;
  }
  function cyl(g, rTop, rBot, h, x, y, z, color) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 20), mat(color));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    return m;
  }

  function makePier(w, d, booth) {
    var g = new THREE.Group(), W = w * T, Dp = d * T;
    box(g, W, 0.16, Dp, 0, 0.1, 0, 0x9a7448);
    for (var x = -W / 2 + 0.5; x < W / 2; x += 1) box(g, 0.03, 0.02, Dp, x, 0.19, 0, 0x7a5a36);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      cyl(g, 0.09, 0.11, 0.7, c[0] * (W / 2 - 0.15), 0.45, c[1] * (Dp / 2 - 0.15), 0x5a4128);
    });
    if (booth) {
      box(g, 1.1, 0.9, 0.8, -W / 4, 0.7, -Dp / 4, 0xe8dcc0);
      box(g, 1.4, 0.12, 1.1, -W / 4, 1.2, -Dp / 4, 0x3b82f6);
      box(g, 0.5, 0.3, 0.04, -W / 4, 0.9, -Dp / 4 + 0.42, 0xf2c030);
      cyl(g, 0.22, 0.22, 0.08, W / 4, 0.3, Dp / 4, 0xe84a4a);
    } else {
      box(g, 0.5, 0.4, 0.5, 0, 0.38, -Dp / 4, 0x8a6a40);
      box(g, 0.04, 0.9, 0.04, 0.3, 0.8, Dp / 4, 0x555555);
      box(g, 0.4, 0.25, 0.03, 0.5, 1.15, Dp / 4, 0xe0a030);
    }
    return g;
  }

  function makePad(tiles, vip) {
    var g = new THREE.Group(), r = tiles * T / 2 - 0.2;
    box(g, tiles * T - 0.1, 0.12, tiles * T - 0.1, 0, 0.06, 0, 0x8d8a84);
    cyl(g, r, r, 0.14, 0, 0.19, 0, vip ? 0x3a4046 : 0x4a5258);
    cyl(g, r, r, 0.02, 0, 0.27, 0, vip ? 0x3a4046 : 0x4a5258);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.15, 0.05, 6, 32), mat(vip ? 0xf2c030 : 0xf2f2f2));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    var s = r * 0.55, c = vip ? 0xffffff : 0xf2c030;
    box(g, 0.22, 0.02, s * 1.6, -s * 0.45, 0.29, 0, c);
    box(g, 0.22, 0.02, s * 1.6, s * 0.45, 0.29, 0, c);
    box(g, s * 0.9, 0.02, 0.22, 0, 0.29, 0, c);
    if (vip) {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { cyl(g, 0.08, 0.08, 0.3, k[0] * (r - 0.1), 0.35, k[1] * (r - 0.1), 0xf2c030); });
      cyl(g, 0.03, 0.03, 1.4, r - 0.2, 0.9, -r + 0.2, 0xdddddd);
      box(g, 0.5, 0.18, 0.03, r - 0.4, 1.5, -r + 0.2, 0xe84a4a);
    }
    return g;
  }

  function makeFerry() {
    var g = new THREE.Group();
    // Large multi-passenger ferry (~5.8m long, ~2.4m wide)
    box(g, 2.4, 0.36, 4.9, 0, 0.10, -0.25, 0x264653);
    box(g, 1.66, 0.34, 1.66, 0, 0.10, 2.20, 0x264653).rotation.y = Math.PI / 4;
    box(g, 2.46, 0.08, 4.7, 0, 0.28, -0.2, 0x2a7fb8);
    box(g, 2.22, 0.06, 4.5, 0, 0.31, -0.2, 0xc49a6c);
    // Side railings
    [-1.08, 1.08].forEach(function (rx) {
      box(g, 0.06, 0.05, 3.8, rx, 0.72, -0.4, 0xf4f0e6);
      [-2.1, -1.1, 0.0, 1.1].forEach(function (rz) {
        box(g, 0.06, 0.42, 0.06, rx, 0.52, rz, 0xf4f0e6);
      });
    });
    box(g, 2.22, 0.05, 0.06, 0, 0.72, -2.35, 0xf4f0e6);
    // Wheelhouse forward
    box(g, 1.4, 0.85, 0.95, 0, 0.74, 1.75, 0xf8f9fa);
    box(g, 1.44, 0.24, 0.55, 0, 0.92, 1.98, 0x87ceeb);
    box(g, 1.54, 0.10, 1.10, 0, 1.22, 1.75, 0x2a7fb8);
    // Canopy roof & support posts over passenger deck
    [[-1.02, -2.1], [1.02, -2.1], [-1.02, 0.9], [1.02, 0.9]].forEach(function (p) {
      cyl(g, 0.04, 0.04, 1.55, p[0], 1.08, p[1], 0xf4f0e6);
    });
    box(g, 2.28, 0.10, 3.5, 0, 1.88, -0.6, 0x3b82f6);
    box(g, 2.0, 0.04, 3.2, 0, 1.94, -0.6, 0xf2c030);
    // Wooden deck benches
    [-0.55, 0.55].forEach(function (bx) {
      box(g, 0.42, 0.18, 3.3, bx, 0.40, -0.45, 0x8a6238);
    });
    // Life rings on cabin/rails
    [-1.14, 1.14].forEach(function (lx) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 14), mat(0xe84a4a));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(lx, 0.62, 0.55);
      g.add(ring);
    });
    return g;
  }
  function makeServiceBoat() {
    var g = new THREE.Group();
    // Smaller utility workboat (~2.2m long, ~1.0m wide)
    box(g, 0.96, 0.28, 1.95, 0, 0.11, -0.1, 0x475569);
    box(g, 0.66, 0.26, 0.66, 0, 0.11, 0.88, 0x475569).rotation.y = Math.PI / 4;
    box(g, 1.02, 0.06, 1.85, 0, 0.27, -0.08, 0xf97316);
    box(g, 0.84, 0.04, 1.7, 0, 0.29, -0.08, 0xe2e8f0);
    // Forward console & cargo crate
    box(g, 0.62, 0.48, 0.52, 0, 0.52, 0.42, 0x2563eb);
    box(g, 0.68, 0.07, 0.60, 0, 0.78, 0.42, 0xf4f0e6);
    box(g, 0.52, 0.34, 0.48, 0, 0.46, -0.52, 0xb5844c);
    return g;
  }
  function makeHeli() {
    var g = new THREE.Group(), rotor = new THREE.Group(), tail = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), mat(0x2f6fa8));
    body.scale.set(0.85, 0.8, 1.35); body.position.y = 0.9; body.castShadow = true; g.add(body);
    box(g, 0.26, 0.26, 2.2, 0, 1.0, -1.9, 0x2f6fa8);
    var glass = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), mat(0xa8e0f0));
    glass.scale.set(0.9, 0.7, 1.0); glass.position.set(0, 1.0, 0.45); g.add(glass);
    box(g, 0.1, 0.1, 1.9, -0.55, 0.12, 0.1, 0x333333); box(g, 0.1, 0.1, 1.9, 0.55, 0.12, 0.1, 0x333333);
    box(g, 0.08, 0.3, 0.08, -0.5, 0.3, 0.7, 0x333333); box(g, 0.08, 0.3, 0.08, 0.5, 0.3, 0.7, 0x333333);
    cyl(g, 0.08, 0.08, 0.3, 0, 1.85, 0.1, 0x333333);
    box(rotor, 4.6, 0.04, 0.2, 0, 0, 0, 0x222222); box(rotor, 0.2, 0.04, 4.6, 0, 0, 0, 0x222222);
    rotor.position.set(0, 2.02, 0.1); g.add(rotor);
    box(tail, 0.04, 0.9, 0.12, 0, 0, 0, 0x222222);
    tail.position.set(0.16, 1.15, -2.9); g.add(tail);
    g.userData.rotor = rotor; g.userData.tail = tail;
    g.scale.setScalar(0.9);
    return g;
  }

  function hookModels() {
    if (!Z.Models || Z.Models._boatsHooked) return;
    Z.Models._boatsHooked = true;
    var orig = Z.Models.createBuilding;
    Z.Models.createBuilding = function (id) {
      if (id === 'guest_pier') return makePier(2, 2, true);
      if (id === 'service_pier') return makePier(1, 2, false);
      if (id === 'staff_helipad') return makePad(2, false);
      if (id === 'vip_helipad') return makePad(4, true);
      return orig ? orig.apply(this, arguments) : null;
    };
  }

  function ensureAttached() {
    if (grp || !Z.World || !Z.World.root) return;
    var root = Z.World.root();
    if (!root) return;
    grp = new THREE.Group();
    root.add(grp);
  }

  function rebuildDecks(tiles) {
    if (deckMesh) { grp.remove(deckMesh); deckMesh.geometry.dispose(); deckMesh = null; }
    if (floatMesh) { grp.remove(floatMesh); floatMesh.geometry.dispose(); floatMesh = null; }
    if (!tiles.length) return;
    deckMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.98, 0.1, T * 0.98), mat(0xa07a4c), tiles.length);
    floatMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.86, 0.22, T * 0.86), mat(0x3c5a78), tiles.length);
    deckMesh.receiveShadow = true; deckMesh.castShadow = true; floatMesh.castShadow = true;
    var m = new THREE.Matrix4(), N = Z.N;
    tiles.forEach(function (t, k) {
      var x = ((t % N) + 0.5) * T, z = (Math.floor(t / N) + 0.5) * T, wl = Z.World.waterLevelAt(x, z);
      if (wl < -50) wl = 0;
      m.makeTranslation(x, wl + DECK_Y - 0.05, z); deckMesh.setMatrixAt(k, m);
      m.makeTranslation(x, wl - 0.03, z); floatMesh.setMatrixAt(k, m);
    });
    grp.add(deckMesh); grp.add(floatMesh);
  }
  function syncDecks() {
    var S = Z.state, id = 0, k, N = Z.N;
    for (k = 0; k < D.paths.length; k++) if (D.paths[k].pontoon) id = k + 1;
    var tiles = [], sig = 0;
    for (k = 0; S && id && k < S.path.length; k++) if (S.path[k] === id) { tiles.push(k); sig = (sig * 31 + k + 1) % 1000003; }
    sig += tiles.length * 1000003;
    if (sig !== deckSig) { deckSig = sig; rebuildDecks(tiles); }
  }

  function syncVehicles(dt) {
    var list = Z.Boats ? Z.Boats.vehicles() : [], seen = {}, k;
    spin += dt * 30;
    bobT += dt;
    list.forEach(function (v) {
      seen[v.id] = true;
      var isWater = v.kind === 'ferry' || v.kind === 'service' || v.kind === 'boat';
      var m = vehicles[v.id];
      if (!m) {
        m = vehicles[v.id] = v.kind === 'ferry' ? makeFerry() : isWater ? makeServiceBoat() : makeHeli();
        grp.add(m);
      }
      var y = v.y;
      if (isWater) {
        var wl = Z.World.waterLevelAt(v.x, v.z);
        var bob = Math.sin(bobT * 2.2 + v.id * 1.7) * 0.035;
        y = (wl > -50 ? wl : 0) + 0.05 + bob;
        m.rotation.z = Math.sin(bobT * 1.6 + v.id) * 0.018;
        m.rotation.x = Math.cos(bobT * 1.9 + v.id) * 0.012;
      }
      m.position.set(v.x, y, v.z);
      m.rotation.y = v.heading;
      if (m.userData.rotor) { m.userData.rotor.rotation.y = spin; m.userData.tail.rotation.x = spin; }
    });
    for (k in vehicles) if (!seen[k]) { grp.remove(vehicles[k]); delete vehicles[k]; }
  }

  function frame(dt) {
    hookModels();
    ensureAttached();
    if (!grp) return;
    sigT -= dt;
    if (sigT <= 0) { sigT = 0.3; syncDecks(); }
    syncVehicles(dt);
  }

  if (Z.bus && Z.bus.on) {
    Z.bus.on('reset', function () {
      deckSig = -1;
      for (var k in vehicles) { if (grp) grp.remove(vehicles[k]); delete vehicles[k]; }
    });
  }
  hookModels();
  Z.BoatsWorld = { frame: frame };
})();
