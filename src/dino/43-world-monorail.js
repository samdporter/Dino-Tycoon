// ===== 43-world-monorail.js =====
// Monorail package, world side: merged elevated beam + pylons per line, the station model (wrapped into Z.Models.createBuilding), one mesh group per
// train (cars, glass, sliding doors, cage bars, night lights), live ghost for the track tool, ground overlay, lightning bolts, train follow camera,
// ride-along (street view locked to the lead carriage) and train picking.
// Hooks in 40-world.js: svGround calls Z.MonoWorld.svY.  Everything else wraps public World calls (frame / pickEntity / pan).
(function () {
  'use strict';
  var N = Z.N, T = Z.TILE, NN = N * N, D = Z.DATA, MD = D.monorail, PI = Math.PI, TAU = PI * 2;
  if (Z.bus && Z.bus.on) Z.bus.on('gridsize', function (n) { N = n; NN = n * n; });
  var MW = Z.MonoWorld = { rideId: 0, followId: 0, overlayOn: false };
  var K = Z.Models && Z.Models.kit;
  function S() { return Z.state; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function shade(col, f) { var r = Math.min(255, (col >> 16 & 255) * f) | 0, g = Math.min(255, (col >> 8 & 255) * f) | 0, b = Math.min(255, (col & 255) * f) | 0; return (r << 16) | (g << 8) | b; }
  var FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // station front vector per rotation (x, z)

  // ======================================================================= station model (4 x 2 tiles = 8 x 4 m, front +z, platform deck at MD.stationDeck)
  var DECK = MD.stationDeck;
  if (K) {
    (function () {
      var B = K.B, mesh = K.mesh, grp = K.grp;
      function station(g) {
        var b = B(), stone = 0x9a968c, cream = 0xe9dfc8, teal = 0x2f9d8f, steel = 0x6f7b84, dark = 0x33383d, orange = 0xe8a23a, glass = 0x9fd0ec;
        var dk = DECK;                                                             // platform surface = deck + a little
        b.box(8, 0.18, 4, 0, 0.09, 0, stone);                                      // plinth
        b.box(6.9, dk - 0.5, 1.9, 0, (dk - 0.5) / 2 + 0.18, 0.95, cream);          // ticket hall (below the platform)
        b.box(7.1, 0.12, 2.05, 0, 0.2, 0.95, shade(stone, 0.9));
        b.box(1.4, 2.1, 0.08, -1.2, 1.2, 1.93, dark); b.box(1.2, 1.9, 0.06, -1.2, 1.15, 1.96, glass);     // entrance doors
        b.box(1.4, 2.1, 0.08, 1.2, 1.2, 1.93, dark); b.box(1.2, 1.9, 0.06, 1.2, 1.15, 1.96, glass);
        b.box(5.6, 0.16, 0.9, 0, 2.55, 2.3, teal);                                  // awning over the entrance
        b.box(5.6, 0.06, 0.9, 0, 2.45, 2.3, shade(teal, 0.7));
        b.box(0.09, 2.4, 0.09, -2.7, 1.3, 2.7, steel); b.box(0.09, 2.4, 0.09, 2.7, 1.3, 2.7, steel);
        for (var k = -2; k <= 2; k++) b.box(0.5, 0.9, 0.05, k * 1.3, dk - 1.1, 1.97, k & 1 ? shade(glass, 0.9) : glass);   // clerestory windows above the hall doors
        b.box(7.0, 0.5, 0.06, 0, dk - 0.55, 1.95, teal);                            // fascia band
        b.box(2.2, 0.32, 0.05, 0, dk - 0.55, 1.99, 0xf7f3e6);                       // name board
        b.box(1.9, 0.12, 0.04, 0, dk - 0.55, 2.02, orange);
        // platform slab, edge strip, rail along the street side
        b.box(7.8, 0.34, 2.05, 0, dk - 0.05, 0.92, shade(stone, 1.1));
        b.box(7.8, 0.04, 0.16, 0, dk + 0.13, -0.05, 0xf2c94c);                      // yellow safety edge
        b.box(7.8, 0.06, 0.06, 0, dk + 1.0, 1.9, steel); b.box(7.8, 0.06, 0.06, 0, dk + 0.5, 1.9, steel);
        for (k = 0; k <= 8; k++) b.box(0.06, 1.0, 0.06, -3.9 + k * 0.975, dk + 0.5, 1.9, steel);
        // benches and a ticket kiosk on the platform
        b.box(1.4, 0.08, 0.36, -2.2, dk + 0.5, 1.4, 0x8a5a36); b.box(1.4, 0.3, 0.06, -2.2, dk + 0.7, 1.58, 0x8a5a36); b.box(0.06, 0.34, 0.3, -2.8, dk + 0.33, 1.4, dark); b.box(0.06, 0.34, 0.3, -1.6, dk + 0.33, 1.4, dark);
        b.box(1.4, 0.08, 0.36, 2.0, dk + 0.5, 1.4, 0x8a5a36); b.box(1.4, 0.3, 0.06, 2.0, dk + 0.7, 1.58, 0x8a5a36); b.box(0.06, 0.34, 0.3, 1.4, dk + 0.33, 1.4, dark); b.box(0.06, 0.34, 0.3, 2.6, dk + 0.33, 1.4, dark);
        // lift tower at the east end: glass shaft, steel frame, little roof
        b.box(1.2, dk + 0.7, 1.2, 3.1, (dk + 0.7) / 2, 1.0, shade(glass, 0.95));
        for (var cx = -1; cx <= 1; cx += 2) for (var cz = -1; cz <= 1; cz += 2) b.box(0.1, dk + 0.8, 0.1, 3.1 + cx * 0.6, (dk + 0.8) / 2, 1.0 + cz * 0.6, steel);
        for (k = 1; k <= 3; k++) b.box(1.3, 0.06, 1.3, 3.1, k * (dk + 0.7) / 4, 1.0, steel);
        b.box(1.5, 0.14, 1.5, 3.1, dk + 0.85, 1.0, teal);
        // canopy roof over the platform and the beam, on slim columns
        var ry = dk + 2.9;
        b.box(8.4, 0.16, 4.3, 0, ry, 0, 0xeceff1); b.box(8.4, 0.1, 4.3, 0, ry + 0.12, 0, shade(teal, 1.05), { s: [1, 1, 1] });
        b.box(8.6, 0.22, 0.2, 0, ry - 0.02, 2.15, teal); b.box(8.6, 0.22, 0.2, 0, ry - 0.02, -2.15, teal);
        for (k = -1; k <= 1; k++) {
          b.box(0.14, ry - dk - 0.2, 0.14, k * 3.6, (ry + dk + 0.2) / 2, 1.95, steel);
          b.box(0.14, ry - dk - 0.2, 0.14, k * 3.6, (ry + dk + 0.2) / 2, -1.95, steel);
        }
        // glass wind screens at the beam ends of the canopy
        b.box(0.05, 1.6, 1.05, -3.9, dk + 1.0, 1.4, shade(glass, 0.85)); b.box(0.05, 1.6, 1.05, 3.9, dk + 1.0, 1.4, shade(glass, 0.85));
        // lamp posts on the platform
        for (k = -1; k <= 1; k += 2) { b.box(0.06, 1.4, 0.06, k * 3.3, dk + 0.8, 0.5, dark); b.box(0.22, 0.1, 0.22, k * 3.3, dk + 1.55, 0.5, 0xfff1c4); }
        g.add(mesh(b.build()));
        // beam stubs in front of and behind the station so the track visibly enters the platform (the line mesh covers the rest)
        var bb = B(); bb.box(8.6, 0.55, 0.9, 0, dk - 0.28, -1, 0xcfcac0); bb.box(8.6, 0.04, 0.26, 0, dk + 0.0, -1, 0x4a4f55);
        g.add(mesh(bb.build()));
        // emissive lamps (night)
        var lb = B(); for (k = -1; k <= 1; k += 2) lb.box(0.2, 0.08, 0.2, k * 3.3, dk + 1.5, 0.5, 0xffe9a8); lb.box(1.9, 0.1, 0.03, 0, dk - 0.55, 2.03, 0xffefc2);
        for (k = -2; k <= 2; k++) lb.box(0.42, 0.12, 0.02, k * 1.3, 0.55 + 2.0, 1.99, 0xffe0a0);
        var lm = new THREE.Mesh(lb.build(), MW.lampMat()); g.add(lm);
        g.userData.update = function (dt, t, gr, obj) {
          var o = obj || (gr && gr.userData && gr.userData.obj) || (g.userData && g.userData.obj);
          var st = S();
          var off = !!(o && o.off) || !!(st && st.mono && st.mono.powered === false);
          lm.material = off ? lampOffMat() : MW.lampMat();
        };
      }
      var oc = K && Z.Models.createBuilding, of = Z.Models.buildingFootprint;
      Z.Models.createBuilding = function (id) {
        if (id === 'monorail_station') { var g = grp(id); g.userData.buildingId = id; station(g); g.userData.footprint = { w: 4, h: 2 }; return g; }
        return oc.apply(this, arguments);
      };
      Z.Models.buildingFootprint = function (id) { return id === 'monorail_station' ? { w: 4, h: 2 } : of.apply(this, arguments); };
    })();
  }

  // ======================================================================= shared materials
  var _lampMat = null, _lampOffMat = null, _lightMat = null, _glassMat = null, _beamMat = null, _ghostMat = null, _ovMat = null, _dotMat = null, _boltMat = null;
  MW.lampMat = function () { return _lampMat || (_lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.25, fog: false })); };
  function lampOffMat() { return _lampOffMat || (_lampOffMat = new THREE.MeshBasicMaterial({ color: 0x3b3830, transparent: true, opacity: 0.08, fog: false })); }
  function lightMat() { return _lightMat || (_lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); }
  function glassMat() { return _glassMat || (_glassMat = new THREE.MeshLambertMaterial({ color: 0xa8d8ee, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })); }
  function beamMat() { return _beamMat || (_beamMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); }
  function dotMat() { return _dotMat || (_dotMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })); }

  // ======================================================================= tiny merged-geometry builder (flat normals, vertex colours)
  function GB() { this.p = []; this.c = []; }
  GB.prototype.tri = function (a, b, c, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); var r = (col >> 16 & 255) / 255, g = (col >> 8 & 255) / 255, bl = (col & 255) / 255; this.c.push(r, g, bl, r, g, bl, r, g, bl); };
  GB.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  GB.prototype.geo = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  };

  // ======================================================================= track meshes
  var scene = null, trackGrp = null, pylonMesh = null, beamMesh = null, dotMesh = null, builtVer = -1, dirty = true;
  var BW = 0.44, BH = 0.58;   // beam half width and depth
  function buildTrack() {
    if (!scene) return;
    var M = Z.Monorail, X = M && M.state();
    if (trackGrp) { scene.remove(trackGrp); trackGrp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); trackGrp = null; }
    if (!X || !X.lines.length) return;
    trackGrp = new THREE.Group(); trackGrp.name = 'monorail-track';
    var gb = new GB(), gd = new GB(), li, k, pb = K ? K.B() : null;
    for (li = 0; li < X.lines.length; li++) {
      var L = X.lines[li]; if (!L.px || L.m < 2) continue;
      var np = L.m, nseg = L.loop ? np : np - 1;
      var cs = Math.cos, sn = Math.sin;
      for (k = 0; k < nseg; k++) {
        var a = k, b = (k + 1) % np, ha = L.ph[a], hb = L.ph[b];
        var ra = [cs(ha), -sn(ha)], rb = [cs(hb), -sn(hb)];
        var ya = L.py[a], yb = L.py[b], ax = L.px[a], az = L.pz[a], bx = L.px[b], bz = L.pz[b];
        var tint = ((k / 7) | 0) & 1 ? 0.96 : 1.0, top = shade(0xd5d1c7, tint), side1 = shade(0xb9b5ab, tint), side2 = shade(0xa6a298, tint), under = 0x6b6d70;
        var tla = [ax - ra[0] * BW, ya, az - ra[1] * BW], tra = [ax + ra[0] * BW, ya, az + ra[1] * BW], tlb = [bx - rb[0] * BW, yb, bz - rb[1] * BW], trb = [bx + rb[0] * BW, yb, bz + rb[1] * BW];
        var bla = [ax - ra[0] * BW * 0.82, ya - BH, az - ra[1] * BW * 0.82], bra = [ax + ra[0] * BW * 0.82, ya - BH, az + ra[1] * BW * 0.82], blb = [bx - rb[0] * BW * 0.82, yb - BH, bz - rb[1] * BW * 0.82], brb = [bx + rb[0] * BW * 0.82, yb - BH, bz + rb[1] * BW * 0.82];
        gb.quad(tla, tra, trb, tlb, top);
        gb.quad(tla, tlb, blb, bla, side1);
        gb.quad(tra, bra, brb, trb, side2);
        gb.quad(bla, blb, brb, bra, under);
        // running surface (dark strip) and a thin power rail on the right
        var s0 = 0.17, ya2 = ya + 0.012, yb2 = yb + 0.012;
        gb.quad([ax - ra[0] * s0, ya2, az - ra[1] * s0], [ax + ra[0] * s0, ya2, az + ra[1] * s0], [bx + rb[0] * s0, yb2, bz + rb[1] * s0], [bx - rb[0] * s0, yb2, bz - rb[1] * s0], 0x4f545a);
        gb.quad([ax + ra[0] * 0.3, ya2, az + ra[1] * 0.3], [ax + ra[0] * 0.36, ya2, az + ra[1] * 0.36], [bx + rb[0] * 0.36, yb2, bz + rb[1] * 0.36], [bx + rb[0] * 0.3, yb2, bz + rb[1] * 0.3], 0xd8a63a);
        if (k % 3 === 1) {   // night dots on both beam faces
          var dy = ya - 0.28, dxl = [ax - ra[0] * (BW + 0.01), dy, az - ra[1] * (BW + 0.01)], dxr = [ax + ra[0] * (BW + 0.01), dy, az + ra[1] * (BW + 0.01)], fx = sn(ha) * 0.1, fz = cs(ha) * 0.1;
          gd.quad([dxl[0] - fx, dy - 0.05, dxl[2] - fz], [dxl[0] + fx, dy - 0.05, dxl[2] + fz], [dxl[0] + fx, dy + 0.06, dxl[2] + fz], [dxl[0] - fx, dy + 0.06, dxl[2] - fz], 0xffd890);
          gd.quad([dxr[0] - fx, dy - 0.05, dxr[2] - fz], [dxr[0] + fx, dy - 0.05, dxr[2] + fz], [dxr[0] + fx, dy + 0.06, dxr[2] + fz], [dxr[0] - fx, dy + 0.06, dxr[2] - fz], 0xffd890);
        }
      }
      // pylons: tapered column, footing, cross head turned along the beam
      for (k = 0; k < L.pylons.length; k++) {
        var p = L.pylons[k], hgt = p.y1 - p.y0; if (hgt < 0.3) continue;
        var best = 0, bd = 1e9; for (var q = 0; q < np; q += 1) { var dd = (L.px[q] - p.x) * (L.px[q] - p.x) + (L.pz[q] - p.z) * (L.pz[q] - p.z); if (dd < bd) { bd = dd; best = q; } }
        var hh = L.ph[best], concrete = 0xbdb9af;
        pb.cyl(0.24, 0.36, hgt, p.x, p.y0 + hgt / 2, p.z, concrete, { seg: 8 });
        pb.box(1.1, 0.34, 1.1, p.x, p.y0 + 0.1, p.z, shade(concrete, 0.85), { rot: [0, hh, 0] });
        pb.box(1.5, 0.3, 0.62, p.x, p.y1 + 0.13, p.z, shade(concrete, 1.05), { rot: [0, hh, 0] });
        pb.box(0.56, 0.1, 0.4, p.x, p.y1 - 0.12, p.z, shade(concrete, 0.7), { rot: [0, hh, 0] });
      }
    }
    if (gb.p.length) { beamMesh = new THREE.Mesh(gb.geo(), beamMat()); beamMesh.frustumCulled = false; trackGrp.add(beamMesh); }
    if (gd.p.length) { dotMesh = new THREE.Mesh(gd.geo(), dotMat()); dotMesh.frustumCulled = false; dotMesh.renderOrder = 4; trackGrp.add(dotMesh); }
    if (pb && pb.p.length) { pylonMesh = K.mesh(pb.build()); pylonMesh.frustumCulled = false; trackGrp.add(pylonMesh); }
    scene.add(trackGrp);
  }

  // ======================================================================= trains
  var GEO = {};         // liveries
  var LIV = [{ body: 0x2f9d8f, stripe: 0xf2b53a, roof: 0xecf0f1 }, { body: 0xd2573f, stripe: 0xf5e6c8, roof: 0xe7e9ea }, { body: 0x3b6fb6, stripe: 0xf2b53a, roof: 0xecf0f1 }];
  var CW = 0.75, CL = MD.carLen, HL = CL / 2;
  function carGeos(li) {
    if (GEO[li]) return GEO[li];
    var lv = LIV[li % LIV.length], B = K.B, steel = 0x4a5159, dark = 0x2c3136, body = B(), gl = B(), dl = B(), dr = B(), lt = B(), lp = B(), lq = B(), k, s, z;
    // frame: floor, running gear straddling the beam, waist panels, posts, roof
    body.box(CW * 2, 0.14, CL, 0, 0.05, 0, shade(lv.body, 0.65));
    for (s = -1; s <= 1; s += 2) {
      body.box(0.1, 0.5, CL - 0.4, s * 0.62, -0.17, 0, shade(lv.body, 0.6));                 // skirts reaching down either side of the beam
      body.box(0.08, 0.14, 0.34, s * 0.54, -0.38, -0.85, steel); body.box(0.08, 0.14, 0.34, s * 0.54, -0.38, 0.85, steel);   // guide wheels
      for (z = -1; z <= 1; z += 2) {                                                          // waist panels either side of the door
        body.box(0.06, 0.43, 1.0, s * 0.72, 0.335, z * 0.95, lv.body);
        body.box(0.062, 0.07, 1.0, s * 0.72, 0.5, z * 0.95, lv.stripe);                      // livery stripe
      }
      // door jambs and corner posts
      for (k = 0; k < 6; k++) { var zp = [-1.42, -0.95, -0.47, 0.47, 0.95, 1.42][k]; body.box(0.08, 0.95, 0.07, s * 0.72, 1.02, zp, shade(lv.body, 0.85)); }
      // cage: vertical bars and a mid rail over the window bays
      for (z = -1; z <= 1; z += 2) {
        for (k = 0; k < 5; k++) body.box(0.022, 0.95, 0.022, s * 0.745, 1.02, z * (0.55 + k * 0.1 + 0.05), dark);
        body.box(0.03, 0.04, 0.95, s * 0.745, 1.0, z * 0.95, dark);
      }
      // window glass
      for (z = -1; z <= 1; z += 2) gl.box(0.02, 0.88, 0.9, s * 0.735, 1.02, z * 0.95, 0xa8d8ee);
      // seats (the door bay stays clear)
      for (z = -1; z <= 1; z += 2) {
        body.box(0.3, 0.08, 0.34, s * 0.43, 0.3, z * 0.95, 0x8d3b32); body.box(0.06, 0.36, 0.34, s * 0.27, 0.5, z * 0.95, shade(0x8d3b32, 0.85));
      }
      // sliding door leaf (frame + lower panel + bars), one mesh per side
      var D2 = s > 0 ? dr : dl, dx = s * 0.78;
      D2.box(0.05, 0.43, 0.9, dx, 0.335, 0, lv.body); D2.box(0.052, 0.07, 0.9, dx, 0.5, 0, lv.stripe);
      D2.box(0.06, 0.07, 0.9, dx, 1.5, 0, shade(lv.body, 0.85)); D2.box(0.06, 0.05, 0.9, dx, 0.57, 0, shade(lv.body, 0.85));
      D2.box(0.06, 0.95, 0.06, dx, 1.02, -0.43, shade(lv.body, 0.85)); D2.box(0.06, 0.95, 0.06, dx, 1.02, 0.43, shade(lv.body, 0.85));
      for (k = -3; k <= 3; k++) D2.box(0.02, 0.9, 0.022, dx + s * 0.02, 1.02, k * 0.125, dark);
      D2.box(0.03, 0.04, 0.86, dx + s * 0.02, 1.0, 0, dark);
    }
    // end walls and corner posts (inner coach ends only; outer train ends get streamlined bullet noses)
    var endGl = B(), noseBody = B(), noseGl = B(), noseLt = B();
    for (z = -1; z <= 1; z += 2) {
      body.box(CW * 2, 0.43, 0.06, 0, 0.335, z * (HL - 0.03), lv.body); body.box(CW * 2, 0.1, 0.06, 0, 1.5, z * (HL - 0.03), shade(lv.body, 0.85));
      for (var sx = -1; sx <= 1; sx += 2) body.box(0.08, 0.95, 0.08, sx * 0.72, 1.02, z * (HL - 0.06), shade(lv.body, 0.85));
      endGl.box(CW * 2 - 0.2, 0.88, 0.02, 0, 1.02, z * (HL - 0.02), 0xa8d8ee);
    }
    // roof (beveled aerodynamic roof shell)
    if (body.bevelBox) {
      body.bevelBox(CW * 2 + 0.08, 0.12, CL + 0.04, 0.04, 0, 1.58, 0, lv.roof);
      body.bevelBox(CW * 2 - 0.3, 0.09, CL - 0.3, 0.03, 0, 1.67, 0, shade(lv.roof, 0.9));
      body.bevelBox(0.55, 0.14, 0.8, 0.03, 0, 1.76, 0.2, 0x8f979d);
    } else {
      body.box(CW * 2 + 0.08, 0.1, CL + 0.04, 0, 1.58, 0, lv.roof); body.box(CW * 2 - 0.3, 0.08, CL - 0.3, 0, 1.66, 0, shade(lv.roof, 0.9)); body.box(0.55, 0.14, 0.8, 0, 1.76, 0.2, 0x8f979d);
    }
    // aerodynamic bullet nose & raked panoramic windshield (+z; cloned & rotated PI on rear car)
    if (noseBody.loft) {
      noseBody.loft([
        [HL - 0.04, 0.74, 0.36, 0.38],
        [HL + 0.22, 0.68, 0.32, 0.38],
        [HL + 0.48, 0.50, 0.24, 0.36],
        [HL + 0.68, 0.26, 0.14, 0.32],
        [HL + 0.76, 0.06, 0.04, 0.30]
      ], { rings: 8, seg: 12, cap1: true, flatBot: 0.65, superPow: 0.65 }, lv.body);
      noseBody.loft([
        [HL - 0.04, 0.755, 0.05, 0.50],
        [HL + 0.22, 0.695, 0.045, 0.48],
        [HL + 0.48, 0.515, 0.04, 0.43],
        [HL + 0.66, 0.28, 0.03, 0.36]
      ], { rings: 6, seg: 10, cap1: true, superPow: 0.65 }, lv.stripe);
      noseBody.bevelBox(1.16, 0.32, 0.52, 0.06, 0, 0.02, HL + 0.20, shade(lv.body, 0.62));
      // swept roof visor & raked A-pillars
      noseBody.extrude([[0, 0], [0.24, -0.02], [0.10, 0.11], [0, 0.11]], 1.48, 0, 1.54, HL - 0.02, [0, 0, 0], lv.roof, { axis: 'x', bev: 0.025 });
      for (s = -1; s <= 1; s += 2) {
        noseBody.limb(s * 0.68, 0.66, HL + 0.36, s * 0.68, 1.52, HL - 0.02, 0.045, 0.04, shade(lv.body, 0.75), { seg: 6 });
        noseBody.cyl(0.09, 0.09, 0.08, s * 0.34, 0.44, HL + 0.56, 0x2c3136, { seg: 8, rot: [PI / 2, 0, 0] });
      }
      // raked panoramic glass canopy
      noseGl.loft([
        [HL - 0.02, 0.71, 0.42, 1.08],
        [HL + 0.20, 0.66, 0.28, 0.90],
        [HL + 0.44, 0.52, 0.14, 0.72]
      ], { rings: 6, seg: 12, flatBot: 0.80, superPow: 0.65 }, 0xa8d8ee);
      noseLt.box(0.76, 0.04, 0.03, 0, 1.08, HL + 0.16, 0xffe7a8);
    } else {
      noseBody.box(CW * 1.8, 0.5, 0.5, 0, 0.35, HL + 0.25, lv.body);
      noseGl.box(CW * 1.6, 0.75, 0.04, 0, 1.05, HL + 0.12, 0xa8d8ee, { rot: [-0.35, 0, 0] });
    }
    // interior light strip, nose lamps
    lt.box(1.0, 0.03, CL - 0.6, 0, 1.5, 0, 0xfff1c9); lt.box(0.04, 0.03, CL - 0.6, 0.65, 1.49, 0, 0xfff1c9); lt.box(0.04, 0.03, CL - 0.6, -0.65, 1.49, 0, 0xfff1c9);
    for (s = -1; s <= 1; s += 2) for (z = -1; z <= 1; z += 2) lt.box(0.02, 0.84, 0.86, s * 0.69, 1.02, z * 0.95, 0xffe7a8);     // lit windows (night)
    for (z = -1; z <= 1; z += 2) lt.box(0.84, 0.02, 0.02, 0, 1.02, z * (HL - 0.12), 0xffe7a8);
    lp.cyl(0.075, 0.075, 0.06, -0.34, 0.44, 0, 0xffffff, { seg: 8, rot: [PI / 2, 0, 0] });
    lp.cyl(0.075, 0.075, 0.06, 0.34, 0.44, 0, 0xffffff, { seg: 8, rot: [PI / 2, 0, 0] });
    GEO[li] = {
      body: body.build(), glass: gl.build(), endGlass: endGl.build(),
      noseBody: noseBody.build(), noseGlass: noseGl.build(), noseLight: noseLt.build(),
      doorL: dl.build(), doorR: dr.build(), light: lt.build(), lamp: lp.build()
    };
    return GEO[li];
  }
  var TRN = {};   // train id -> { group, cars:[{g, dl, dr}], lampF, lampB, beacon, bSph, bDia, n, li }
  var _lampWhite = null, _lampRed = null;
  var _hazSphGeo = null, _hazDiaGeo = null, _hazRedMat = null, _hazAmbMat = null;
  function hazRes() {
    if (!_hazSphGeo) {
      _hazSphGeo = new THREE.SphereGeometry(0.24, 8, 6);
      _hazDiaGeo = new THREE.OctahedronGeometry(0.26, 0);
      _hazRedMat = new THREE.MeshBasicMaterial({ color: 0xff3028, fog: false });
      _hazAmbMat = new THREE.MeshBasicMaterial({ color: 0xffaa18, fog: false });
    }
    return { sphGeo: _hazSphGeo, diaGeo: _hazDiaGeo, red: _hazRedMat, amb: _hazAmbMat };
  }
  function lampMats() {
    if (!_lampWhite) { _lampWhite = new THREE.MeshBasicMaterial({ color: 0xfff8d8, fog: false }); _lampRed = new THREE.MeshBasicMaterial({ color: 0xff4030, fog: false }); }
    return [_lampWhite, _lampRed];
  }
  function makeTrain(T) {
    var li = ((T.id - 1) % LIV.length + LIV.length) % LIV.length, G = carGeos(li), cars = [], grpT = new THREE.Group(), lm = lampMats();
    grpT.name = 'monorail-train-' + T.id;
    for (var k = 0; k < T.cars; k++) {
      var cg = new THREE.Group(); cg.rotation.order = 'YXZ';
      var body = K.mesh(G.body), glass = new THREE.Mesh(G.glass, glassMat()), dl = K.mesh(G.doorL), dr = K.mesh(G.doorR), light = new THREE.Mesh(G.light, lightMat());
      glass.renderOrder = 3; light.renderOrder = 2;
      cg.add(body); cg.add(glass); cg.add(dl); cg.add(dr); cg.add(light);
      if (k > 0 && k < T.cars - 1) {
        var eg = new THREE.Mesh(G.endGlass, glassMat()); eg.renderOrder = 3; cg.add(eg);
      }
      if (k === T.cars - 1) {
        var nbF = K.mesh(G.noseBody), ngF = new THREE.Mesh(G.noseGlass, glassMat()), nlF = new THREE.Mesh(G.noseLight, lightMat());
        ngF.renderOrder = 3; nlF.renderOrder = 2;
        cg.add(nbF); cg.add(ngF); cg.add(nlF);
      }
      if (k === 0) {
        var nbB = K.mesh(G.noseBody), ngB = new THREE.Mesh(G.noseGlass, glassMat()), nlB = new THREE.Mesh(G.noseLight, lightMat());
        nbB.rotation.y = PI; ngB.rotation.y = PI; nlB.rotation.y = PI;
        ngB.renderOrder = 3; nlB.renderOrder = 2;
        cg.add(nbB); cg.add(ngB); cg.add(nlB);
      }
      grpT.add(cg); cars.push({ g: cg, dl: dl, dr: dr });
    }
    var lampF = new THREE.Mesh(G.lamp, lm[0]), lampB = new THREE.Mesh(G.lamp, lm[1]);
    lampF.position.z = HL + 0.62; lampB.position.z = -HL - 0.62; lampB.rotation.y = PI;
    var hr = hazRes(), beacon = new THREE.Group(), bSph = new THREE.Mesh(hr.sphGeo, hr.red), bDia = new THREE.Mesh(hr.diaGeo, hr.red);
    bDia.position.y = 0.55; beacon.position.y = 2.05; beacon.visible = false;
    beacon.add(bSph); beacon.add(bDia);
    cars[T.cars >> 1].g.add(beacon);
    scene.add(grpT);
    return { group: grpT, cars: cars, lampF: lampF, lampB: lampB, beacon: beacon, bSph: bSph, bDia: bDia, n: T.cars, li: li, lampOn: -1 };
  }
  function dropTrain(id) { var r = TRN[id]; if (!r) return; scene.remove(r.group); r.group.traverse(function (o) { /* geometries are shared */ }); delete TRN[id]; }
  var _pose = { x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0 };
  function updateTrains(dt, tm) {
    var M = Z.Monorail, s = S(); if (!M || !s || !s.mono) { for (var id0 in TRN) dropTrain(id0); return; }
    var list = s.mono.trains, seen = {}, X = M.state(), night = (Z.World._G && Z.World._G.night) || 0;
    for (var q = 0; q < list.length; q++) {
      var T0 = list[q], rt = M.trainRt(T0.id), L = rt && rt.line; seen[T0.id] = 1;
      var r = TRN[T0.id];
      if (r && r.n !== T0.cars) { dropTrain(T0.id); r = null; }
      if (!r) { r = TRN[T0.id] = makeTrain(T0); }
      if (!L || !L.px) { r.group.visible = false; continue; }
      r.group.visible = true;
      // doors open on the platform side of the station being served
      var openR = 0, openL = 0;
      if (T0.st === 'dwell' && L.stops[T0.at]) {
        var fv = FRONT[(L.stops[T0.at].o.rot | 0) & 3], dd = rt.door;
        // all cars share the heading roughly; decide per car below
        r._door = dd; r._fv = fv;
      } else { r._door = 0; r._fv = null; }
      for (var k = 0; k < T0.cars; k++) {
        var pz = M.carPose(T0, k, _pose); if (!pz) continue;
        var c = r.cars[k], g = c.g;
        g.position.set(pz.x, pz.y, pz.z); g.rotation.y = pz.h; g.rotation.x = -pz.pitch; g.rotation.z = pz.roll;
        var dR = 0, dL = 0;
        if (r._fv) { var side = Math.cos(pz.h) * r._fv[0] - Math.sin(pz.h) * r._fv[1]; if (side > 0) dR = r._door; else dL = r._door; }
        c.dr.position.z = dR * 0.92; c.dl.position.z = dL * 0.92;
      }
      // head and tail lamps on the lead and trailing cars (swap with the direction of travel)
      var dir = T0.dir >= 0 ? 1 : -1, leadK = dir > 0 ? T0.cars - 1 : 0, tailK = dir > 0 ? 0 : T0.cars - 1;
      if (r.lampOn !== dir) {
        if (r.lampF.parent) r.lampF.parent.remove(r.lampF); if (r.lampB.parent) r.lampB.parent.remove(r.lampB);
        r.cars[leadK].g.add(r.lampF); r.cars[tailK].g.add(r.lampB);
        r.lampF.position.z = dir > 0 ? HL + 0.62 : -HL - 0.62; r.lampF.rotation.y = dir > 0 ? 0 : PI;
        r.lampB.position.z = dir > 0 ? -HL - 0.62 : HL + 0.62; r.lampB.rotation.y = dir > 0 ? PI : 0;
        r.lampOn = dir;
      }
      var stuck = T0.st === 'stuck';
      if (r.beacon) {
        r.beacon.visible = stuck;
        if (stuck) {
          var hr = hazRes(), hm = T0.why === 'power' ? hr.amb : hr.red;
          r.bSph.material = hm; r.bDia.material = hm;
          var blink = Math.sin(tm * 9 + T0.id) > -0.2, pulse = 0.5 + 0.5 * Math.sin(tm * 7 + T0.id);
          r.bSph.scale.setScalar(blink ? 0.85 + 0.4 * pulse : 0.4);
          r.bDia.position.y = 0.55 + Math.sin(tm * 4 + T0.id) * 0.14;
          r.bDia.rotation.y = tm * 2.5;
        }
      }
    }
    for (var id in TRN) if (!seen[id]) dropTrain(id);
    // shared night / occupancy lighting
    var base = 0.03 + 0.92 * night;
    if (_lightMat) { _lightMat.opacity = base; }
    if (_lampMat) _lampMat.opacity = 0.18 + 0.82 * night;
    if (_dotMat) _dotMat.opacity = 0.12 + 0.85 * night;
  }

  // ======================================================================= ghost (the track tool preview) and ground overlay
  var ghostMesh = null, ghostSig = '', ovMesh = null, ovDirty = true;
  MW.setGhost = function (plan) {
    if (!scene) { try { scene = Z.World.scene(); } catch (e) { return; } }
    var sig = plan && plan.ghost ? (plan.ok ? 'o' : 'x') + plan.ghost.tiles.join(',') + '|' + Object.keys(plan.ghost.bad).join(',') : '';
    if (sig === ghostSig) return; ghostSig = sig;
    if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.geometry.dispose(); ghostMesh = null; }
    if (!plan || !plan.ghost || plan.ghost.tiles.length < 1) return;
    var gh = plan.ghost, gb = new GB(), n = gh.tiles.length, gy = Z.World.groundY, ok = !!plan.ok;
    var col = ok ? 0x46e08a : 0xe0614a, colB = 0xff2d2d;
    var P = [];
    for (var k = 0; k < n; k++) { var t = gh.tiles[k], i = t % N, j = (t - i) / N; P.push([(i + 0.5) * T, gh.h[k] || (gy((i + 0.5) * T, (j + 0.5) * T) + MD.clearance), (j + 0.5) * T, !!gh.bad[t]]); }
    function slab(a, b, hw, col2, dy) {
      var dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, rx = dz / l * hw, rz = -dx / l * hw;
      gb.quad([a[0] - rx, a[1] + dy, a[2] - rz], [a[0] + rx, a[1] + dy, a[2] + rz], [b[0] + rx, b[1] + dy, b[2] + rz], [b[0] - rx, b[1] + dy, b[2] - rz], col2);
    }
    for (k = 0; k + 1 < n; k++) { slab(P[k], P[k + 1], 0.46, col, 0.02); slab(P[k], P[k + 1], 0.46, shade(col, 0.6), -0.55); }
    for (k = 0; k < n; k++) {
      var p = P[k], g0 = gy(p[0], p[2]), cc = p[3] ? colB : col;
      var h0 = Math.max(g0, 0.05) + 0.12;
      gb.quad([p[0] - 0.55, h0, p[2] - 0.55], [p[0] - 0.55, h0, p[2] + 0.55], [p[0] + 0.55, h0, p[2] + 0.55], [p[0] + 0.55, h0, p[2] - 0.55], cc);   // footprint marker on the ground
      if (k % 3 === 0 || p[3]) { gb.quad([p[0] - 0.08, g0 + 0.1, p[2]], [p[0] + 0.08, g0 + 0.1, p[2]], [p[0] + 0.08, p[1] - 0.5, p[2]], [p[0] - 0.08, p[1] - 0.5, p[2]], cc); gb.quad([p[0], g0 + 0.1, p[2] - 0.08], [p[0], g0 + 0.1, p[2] + 0.08], [p[0], p[1] - 0.5, p[2] + 0.08], [p[0], p[1] - 0.5, p[2] - 0.08], cc); }
    }
    if (!_ghostMat) _ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    ghostMesh = new THREE.Mesh(gb.geo(), _ghostMat); ghostMesh.frustumCulled = false; ghostMesh.renderOrder = 6; scene.add(ghostMesh);
  };
  MW.clearGhost = function () { MW.setGhost(null); };
  MW.setOverlay = function (on) { MW.overlayOn = !!on; ovDirty = true; if (ovMesh) ovMesh.visible = MW.overlayOn; };
  function buildOverlay() {
    if (ovMesh) { scene.remove(ovMesh); ovMesh.geometry.dispose(); ovMesh = null; }
    var M = Z.Monorail, X = M && M.state(), s = S(); if (!MW.overlayOn || !X || !s) return;
    var gb = new GB(), gy = Z.World.groundY, t, i, j;
    function tile(t2, col, ins, dy) {
      var i2 = t2 % N, j2 = (t2 - i2) / N, x0 = i2 * T + ins, z0 = j2 * T + ins, x1 = (i2 + 1) * T - ins, z1 = (j2 + 1) * T - ins;
      var y = Math.max(gy(x0, z0), gy(x1, z0), gy(x0, z1), gy(x1, z1), 0.05) + dy;
      gb.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], col);
    }
    function ovY(t3) { var i3 = t3 % N, j3 = (t3 - i3) / N; return Math.max(gy(i3 * T, j3 * T), gy((i3 + 1) * T, j3 * T), gy(i3 * T, (j3 + 1) * T), gy((i3 + 1) * T, (j3 + 1) * T), 0.05); }
    var overEnc = {};
    for (var li = 0; li < X.lines.length; li++) { var L = X.lines[li]; for (var q = 0; q < L.over.length; q++) overEnc[L.over[q]] = 1; }
    for (t = 0; t < NN; t++) { var e = s.tileEnc[t]; if (e && overEnc[e]) { tile(t, 0x6ed99a, 0.1, 0.09); if (Z.OvPat) Z.OvPat.mark(gb, t, 's1', ovY(t) + 0.09); } }
    for (li = 0; li < X.lines.length; li++) {
      L = X.lines[li];
      for (q = 0; q < L.nodes.length; q++) { tile(L.nodes[q], L.ok ? 0x3ab5e8 : 0xe8a23a, 0.3, 0.12); if (Z.OvPat && !L.ok) Z.OvPat.mark(gb, L.nodes[q], 'x', ovY(L.nodes[q]) + 0.12); }   // X = line not working (colour is not the only cue)
      for (q = 0; q < L.pylons.length; q++) { tile(L.pylons[q].t, 0xf5d36a, 0.5, 0.14); if (Z.OvPat) Z.OvPat.mark(gb, L.pylons[q].t, 'dot', ovY(L.pylons[q].t) + 0.14); }
    }
    if (!gb.p.length) return;
    if (!_ovMat) _ovMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
    ovMesh = new THREE.Mesh(gb.geo(), _ovMat); ovMesh.frustumCulled = false; ovMesh.renderOrder = 5; scene.add(ovMesh);
  }

  // ======================================================================= lightning bolts
  var bolts = [];
  Z.bus.on('monoLightning', function (e) {
    if (!scene || !e) return;
    var gb = new GB(), x = e.x, z = e.z, y0 = Z.World.groundY(x, z), y1 = (e.y || 8) + 26, px = x + 4, pz = z - 2, py = y1, n = 9;
    for (var k = 1; k <= n; k++) {
      var f = k / n, nx = x + (k === n ? 0 : Math.sin(k * 12.9) * 1.6), nz = z + (k === n ? 0 : Math.cos(k * 7.1) * 1.6), ny = y1 + (y0 + 2 - y1) * f, hw = 0.1 + 0.05 * (1 - f);
      gb.quad([px - hw, py, pz], [px + hw, py, pz], [nx + hw, ny, nz], [nx - hw, ny, nz], 0xffffff); gb.quad([px, py, pz - hw], [px, py, pz + hw], [nx, ny, nz + hw], [nx, ny, nz - hw], 0xe8f0ff);
      px = nx; py = ny; pz = nz;
    }
    if (!_boltMat) _boltMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, transparent: true });
    var m = new THREE.Mesh(gb.geo(), _boltMat.clone()); m.frustumCulled = false; m.renderOrder = 9; scene.add(m); bolts.push({ m: m, t: 0.45 });
  });
  function updateBolts(dt) {
    for (var k = bolts.length - 1; k >= 0; k--) {
      var b = bolts[k]; b.t -= dt; b.m.material.opacity = clamp(b.t / 0.3, 0, 1) * (Math.sin(b.t * 60) > -0.4 ? 1 : 0.35);
      if (b.t <= 0) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); bolts.splice(k, 1); }
    }
  }

  // ======================================================================= camera: follow a train, ride along (street view locked to the lead car)
  var fPrev = 0, ridePrevH = null;
  function leadPose(T, out) {
    var M = Z.Monorail, k = T.dir >= 0 ? T.cars - 1 : 0;
    return M.carPose(T, k, out);
  }
  MW.trainAt = function (id) { var l = S() && S().mono ? S().mono.trains : []; for (var k = 0; k < l.length; k++) if (l[k].id === id) return l[k]; return null; };
  MW.follow = function (id) {
    MW.followId = id || 0;
    if (id && Z.World.focus) { var T0 = MW.trainAt(id), p = T0 && Z.Monorail.carPose(T0, T0.cars >> 1, {}); if (p) { try { Z.World.focus(p.x, p.z, 26); } catch (e) { } } }
  };
  MW.rideAlong = function (id) {
    var T0 = MW.trainAt(id), M = Z.Monorail; if (!T0 || !M) return false;
    var p = leadPose(T0, {}); if (!p) return false;
    MW.followId = 0; MW.rideId = id; ridePrevH = null;
    var dir = T0.dir >= 0 ? 1 : -1, fx = p.x + Math.sin(p.h) * dir * 0.7, fz = p.z + Math.cos(p.h) * dir * 0.7;
    Z.World.setStreetView(true, fx, fz, dir > 0 ? p.h : p.h + PI);
    Z.World.svJump(fx, fz, fx + Math.sin(p.h) * dir * 10, fz + Math.cos(p.h) * dir * 10);
    Z.bus.emit('monoRide', { id: id, on: true });
    return true;
  };
  MW.endRide = function () {
    if (!MW.rideId) return; MW.rideId = 0; ridePrevH = null;
    if (Z.World.isStreetView()) Z.World.setStreetView(false);
    Z.bus.emit('monoRide', { id: 0, on: false });
  };
  var _rideY = 0;
  MW.svY = function (x, z) { return MW.rideId ? _rideY : null; };
  Z.bus.on('streetview', function (on) { if (!on && MW.rideId) { MW.rideId = 0; ridePrevH = null; Z.bus.emit('monoRide', { id: 0, on: false }); } });
  function updateCamera(dt) {
    var W = Z.World;
    if (MW.rideId) {
      var T0 = MW.trainAt(MW.rideId), p = T0 && leadPose(T0, _pose);
      if (!p || !W.isStreetView()) { MW.endRide(); return; }
      var dir = T0.dir >= 0 ? 1 : -1;
      var fx = p.x + Math.sin(p.h) * dir * 0.7, fz = p.z + Math.cos(p.h) * dir * 0.7;
      _rideY = p.y + 0.12 - 0.45;   // the street-view eye stands 1.7 above this: head height just under the carriage roof
      W.svJump(fx, fz);
      var hh = p.h + (dir > 0 ? 0 : PI);
      if (ridePrevH !== null) { var dy = hh - ridePrevH; while (dy > PI) dy -= TAU; while (dy < -PI) dy += TAU; if (dy) W.svLook(dy, 0); }
      ridePrevH = hh;
    } else if (MW.followId) {
      var T1 = MW.trainAt(MW.followId), p1 = T1 && Z.Monorail.carPose(T1, T1.cars >> 1, _pose);
      if (!p1) { MW.followId = 0; return; }
      if (W.focus) W.focus(p1.x, p1.z);
    }
  }

  // ======================================================================= per frame
  var t0 = 0, pickSet = false;
  function frame(dt) {
    if (!scene) { try { scene = Z.World.scene(); } catch (e) { scene = null; } if (!scene) return; }
    var M = Z.Monorail, X = M && M.state();
    t0 += dt || 0.016;
    if (X && X.ver !== builtVer) { builtVer = X.ver; dirty = true; ovDirty = true; }
    if (dirty) { dirty = false; buildTrack(); }
    if (ovDirty && (MW.overlayOn || ovMesh)) { ovDirty = false; buildOverlay(); } else if (ovDirty) ovDirty = false;
    updateTrains(dt, t0);
    updateBolts(dt || 0.016);
    updateCamera(dt || 0.016);
  }
  function resetAll() { dirty = true; ovDirty = true; builtVer = -1; for (var id in TRN) dropTrain(id); MW.rideId = 0; MW.followId = 0; ghostSig = ''; if (ghostMesh && scene) { scene.remove(ghostMesh); ghostMesh = null; } }
  Z.bus.on('reset', resetAll); Z.bus.on('rail', function () { dirty = true; ovDirty = true; });
  Z.bus.on('enclosures', function () { ovDirty = true; }); Z.bus.on('terrain', function () { dirty = true; ovDirty = true; }); Z.bus.on('elev', function () { dirty = true; ovDirty = true; });
  if (Z.World && Z.World.frame) {
    var ofr = Z.World.frame;
    Z.World.frame = function (dt) { try { frame(dt); } catch (e) { if (!MW._err) { MW._err = 1; console.error('monorail world', e); } } return ofr.apply(this, arguments); };
  }
  // a tap on a train (or a rider inside one) opens the train panel
  if (Z.World && Z.World.pickEntity) {
    var opick = Z.World.pickEntity;
    Z.World.pickEntity = function (cx, cy) {
      var hit = opick.apply(this, arguments), s = S(), M = Z.Monorail;
      if (!M || !s || !s.mono || !s.mono.trains.length) return hit;
      if (hit && hit.kind === 'guest') { var g = null; for (var q = 0; q < s.guests.length; q++) if (s.guests[q].id === hit.id) { g = s.guests[q]; break; } if (g && g.state === 'ride' && g.rtr) return { kind: 'train', id: g.rtr }; }
      if (hit && hit.kind !== 'object' && hit.kind !== 'enclosure') return hit;
      var best = null, bd = (('ontouchstart' in window) ? 46 : 30);
      for (var k = 0; k < s.mono.trains.length; k++) {
        var T0 = s.mono.trains[k];
        for (var c = 0; c < T0.cars; c++) {
          var p = M.carPose(T0, c, _pose); if (!p) continue;
          var pr = Z.World.project(p.x, p.y + 0.9, p.z); if (!pr.vis) continue;
          var dx = pr.x - cx, dy = pr.y - cy, d = Math.sqrt(dx * dx + dy * dy);
          if (d < bd) { bd = d; best = { kind: 'train', id: T0.id }; }
        }
      }
      return best || hit;
    };
  }
  // the track tool hands over its plan as a {type:'rail'} preview: drawn as a ghost beam, never by the tile highlighter
  if (Z.World && Z.World.setPreview) {
    var osp = Z.World.setPreview;
    Z.World.setPreview = function (spec) {
      if (spec && spec.type === 'rail') { MW.setGhost(spec.plan); return osp.call(this, null); }
      if (ghostSig) MW.clearGhost();
      return osp.apply(this, arguments);
    };
  }
  if (Z.World && Z.World.pan) { var opan = Z.World.pan; Z.World.pan = function () { MW.followId = 0; return opan.apply(this, arguments); }; }
  MW.info = function () { return { trains: Object.keys(TRN).length, track: !!trackGrp, ride: MW.rideId, follow: MW.followId, ver: builtVer }; };
})();
