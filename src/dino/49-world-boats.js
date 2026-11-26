// ===== 49-world-boats.js =====
// Boats package, world side: floating pontoon decks, boats and staff helicopters on their trips, VIP helicopters landing and taking off.
// Hooks in 40-world.js call Z.BoatsWorld.deckY(x, z) (entities and street view stand on pontoons); everything else is drawn from Z.Boats.trips()/helis() each frame.
(function () {
  'use strict';
  var N = Z.N, T = Z.TILE, D = Z.DATA, PI = Math.PI, DECK = 0.16;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; });
  var BW = Z.BoatsWorld = {};
  var scene = null, deckMesh = null, deckSet = {}, deckDirty = true, t0 = 0, boatMeshes = new Map(), helis = new Map();
  function S() { return Z.state; }
  function waterY(x, z) { var w = Z.World.waterLevelAt(x, z); return w > -50 ? w : -0.1; }
  function deckBob() { return Math.sin(t0 * 1.3) * 0.02; }
  function bob(x, z) { return Math.sin(t0 * 1.3 + x * 0.35 + z * 0.27) * 0.02; }

  BW.deckY = function (x, z) {
    var i = Math.floor(x / T), j = Math.floor(z / T);
    return deckSet[i + j * N] ? waterY(x, z) + DECK + deckBob() : null;
  };

  function quad(p, a, b, c, d, col) {
    var r = (col >> 16 & 255) / 255, g = (col >> 8 & 255) / 255, bl = (col & 255) / 255;
    [a, b, c, a, c, d].forEach(function (v) { p.pos.push(v[0], v[1], v[2]); p.col.push(r, g, bl); });
  }
  function buildDecks() {
    deckDirty = false; deckSet = {};
    if (deckMesh) { scene.remove(deckMesh); deckMesh.geometry.dispose(); deckMesh = null; }
    var s = S(), ids = {}, p = { pos: [], col: [] };
    D.paths.forEach(function (pd, k) { if (pd.pontoon) ids[k + 1] = true; });
    for (var t = 0; t < N * N; t++) {
      if (!ids[s.path[t]]) continue;
      deckSet[t] = true;
      var x0 = (t % N) * T + 0.04, z0 = Math.floor(t / N) * T + 0.04, x1 = x0 + T - 0.08, z1 = z0 + T - 0.08, y0 = waterY(x0 + T / 2, z0 + T / 2), yt = y0 + DECK, yb = y0 - 0.12;
      var k2 = 0.94 + 0.12 * (((t * 7919) % 13) / 13);
      quad(p, [x0, yt, z1], [x1, yt, z1], [x1, yt, z0], [x0, yt, z0], (Math.round(0xb0 * k2) << 16) | (Math.round(0x8a * k2) << 8) | Math.round(0x5a * k2));
      quad(p, [x0, yb, z1], [x1, yb, z1], [x1, yt, z1], [x0, yt, z1], 0x6a4a2c); quad(p, [x1, yb, z0], [x0, yb, z0], [x0, yt, z0], [x1, yt, z0], 0x6a4a2c);
      quad(p, [x1, yb, z1], [x1, yb, z0], [x1, yt, z0], [x1, yt, z1], 0x5a3e24); quad(p, [x0, yb, z0], [x0, yb, z1], [x0, yt, z1], [x0, yt, z0], 0x5a3e24);
    }
    if (!p.pos.length) return;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p.pos), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.col), 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    deckMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); deckMesh.receiveShadow = true; scene.add(deckMesh);
  }

  function padPose(padId) {
    var o = S().objects.find(function (q) { return q.id === padId; }); if (!o) return null;
    var fp = Z.Sim.footprint(o.type, o.i, o.j, o.rot); if (!fp) return null;
    return { x: fp.cx, z: fp.cz, y: Z.World.groundY(fp.cx, fp.cz) + 0.3 };
  }
  function ease(f) { return f * f * (3 - 2 * f); }
  function frameBoats(dt) {
    var M = Z.Models.boats, seen = new Set();
    var vessels = Z.Boats.vessels ? Z.Boats.vessels() : [];
    vessels.forEach(function (v) {
      seen.add(v);
      var m = boatMeshes.get(v);
      if (!m) { m = v.kind === 'ferry' ? (M.ferry ? M.ferry() : M.boat()) : (M.serviceBoat ? M.serviceBoat() : M.boat()); scene.add(m); boatMeshes.set(v, m); }
      var wl = waterY(v.x, v.z);
      m.position.set(v.x, wl + 0.05 + bob(v.x, v.z), v.z); m.rotation.y = v.h;
      if (v.kind === 'ferry' && v.pax) {
        for (var k = 0; k < v.pax.length; k++) v.pax[k].e.absY = wl + 0.35;
      } else if (v.kind === 'service' && v.staff) {
        v.staff.absY = wl + 0.35;
      }
    });
    Z.Boats.trips().forEach(function (tr) {
      if (!tr.air) return;
      seen.add(tr);
      var m = boatMeshes.get(tr);
      if (!m) { m = M.heli(); scene.add(m); boatMeshes.set(tr, m); }
      var f = Math.min(1, tr.d / Math.max(1, tr.len)), a = padPose(tr.from.o.id), y = (a ? a.y : 0) + Math.sin(f * PI) * D.boats.airAlt;
      m.position.set(tr.x, y, tr.z); m.rotation.y = tr.h; m.userData.rotor.rotation.y += dt * 30;
      tr.e.absY = -6;
    });
    boatMeshes.forEach(function (m, key) { if (!seen.has(key)) { scene.remove(m); boatMeshes.delete(key); } });
  }
  function frameHelis(dt) {
    var M = Z.Models.boats, seen = new Set();
    Z.Boats.helis().forEach(function (h) {
      seen.add(h);
      var m = helis.get(h), pad = padPose(h.pad); if (!pad) return;
      if (!m) { m = M.heli(); scene.add(m); helis.set(h, m); }
      var p = Math.min(1, h.t / h.dur), fly = h.kind === 'in' ? 1 - ease(p) : ease(p), ang = h.pad * 1.7;
      m.position.set(pad.x + Math.cos(ang) * fly * 60, pad.y + fly * 24, pad.z + Math.sin(ang) * fly * 60);
      m.rotation.y = Math.atan2(h.kind === 'in' ? -Math.cos(ang) : Math.cos(ang), h.kind === 'in' ? -Math.sin(ang) : Math.sin(ang));
      m.userData.rotor.rotation.y += dt * (fly > 0 || p < 1 ? 30 : 0);
    });
    helis.forEach(function (m, h) { if (!seen.has(h)) { scene.remove(m); helis.delete(h); } });
  }
  function clearAll() {
    deckDirty = true;
    boatMeshes.forEach(function (m) { scene && scene.remove(m); }); boatMeshes.clear();
    helis.forEach(function (m) { scene && scene.remove(m); }); helis.clear();
  }
  function frame(dt) {
    if (!scene) { try { scene = Z.World.scene(); } catch (e) { scene = null; } if (!scene) return; }
    if (!Z.Boats || !S() || !S().boats) return;
    t0 += dt || 0.016;
    if (deckDirty) buildDecks();
    if (deckMesh) deckMesh.position.y = deckBob();
    frameBoats(dt || 0.016); frameHelis(dt || 0.016);
  }
  Z.bus.on('reset', clearAll); Z.bus.on('path', function () { deckDirty = true; });
  if (Z.World && Z.World.frame) { var ofr = Z.World.frame; Z.World.frame = function (dt) { try { frame(dt); } catch (e) { if (!BW._err) { BW._err = 1; console.error('boats world', e); } } return ofr.apply(this, arguments); }; }
})();
