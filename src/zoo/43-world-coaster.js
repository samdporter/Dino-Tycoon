// Wild Acres Zoo — Custom Rollercoaster 3D World Renderer (Zoo Tycoon only)
// Renders themed coaster stations with launch/return arrows, continuous stitched twin-rail 3D splines
// (with smooth Bezier corners, hills, vertical loops & corkscrews), visible animated Chain Lift Hills
// (chain trough, moving chain links, sprocket wheels & catwalk), trestle/steel supports, trains & Ride Along.
(function () {
  'use strict';
  var Z = window.Z, D = Z && Z.DATA;
  if (!Z || !D || !D.coaster || typeof THREE === 'undefined') return;

  var CD = D.coaster;
  var TYPES = CD.types;
  var TILE = Z.TILE || 2;

  var grp = null;
  var trackGrp = null;
  var chainGrp = null;  // animated moving chain links on Chain Lift Hills
  var trainGrp = null;
  var fxGrp = null;
  var ovGrp = null;
  var builtVer = -1;
  var trainMeshes = {};
  var chainSegs = [];   // [{ x0,y0,z0, dx,dy,dz, ux,uy,uz, rx,ry,rz, len }]
  var chainMeshes = []; // pool of moving chain link meshes
  var splashes = [];
  var rideTrainId = 0;
  var followTrainId = 0;
  var overlayOn = false;

  var _mat4 = new THREE.Matrix4();
  var _vR = new THREE.Vector3(), _vU = new THREE.Vector3(), _vF = new THREE.Vector3();
  var _pr = { x: 0, y: 0, w: 0, vis: false };

  // ---- 1. Hook Z.Models.createBuilding for the 5 custom coaster stations ----
  function makeStationModel(typeId) {
    var td = TYPES[typeId] || TYPES.wooden;
    var col = td.colors;
    var g = new THREE.Group();
    var mBase = new THREE.MeshLambertMaterial({ color: col.station });
    var mRoof = new THREE.MeshLambertMaterial({ color: col.roof });
    var mAcc = new THREE.MeshLambertMaterial({ color: col.accent });
    var mRail = new THREE.MeshLambertMaterial({ color: 0xd8dfe8 });
    var mTie = new THREE.MeshLambertMaterial({ color: col.tie });
    var mDark = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
    var mLaunch = new THREE.MeshBasicMaterial({ color: 0x38e56b });
    var mReturn = new THREE.MeshBasicMaterial({ color: 0xffb838 });
    var deckY = CD.stationDeck;

    // 4x2 footprint = 8m (x: -4..4) by 4m (z: -2..2). Front entrance faces +z, track runs along z = -1.0 (back row)
    var base = new THREE.Mesh(new THREE.BoxGeometry(7.6, deckY, 3.6), mBase);
    base.position.set(0, deckY * 0.5, 0);
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);

    // Front ticket booth & entrance stairs (+z side)
    var booth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 1.3), mAcc);
    booth.position.set(-1.8, 1.1, 1.15);
    booth.castShadow = true;
    g.add(booth);
    var awning = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 1.5), mRoof);
    awning.position.set(-1.8, 2.35, 1.25);
    awning.rotation.x = 0.18;
    g.add(awning);

    for (var s = 0; s < 4; s++) {
      var st = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 0.42), mBase);
      st.position.set(1.6, 0.14 + s * (deckY / 4), 1.65 - s * 0.32);
      g.add(st);
    }

    // Station canopy columns & roof over boarding track (z = -0.9)
    var postGeo = new THREE.BoxGeometry(0.22, 2.5, 0.22);
    var px = [-3.3, -1.1, 1.1, 3.3], pz = [-1.7, 0.1];
    for (var i = 0; i < px.length; i++) for (var j = 0; j < pz.length; j++) {
      var post = new THREE.Mesh(postGeo, mDark);
      post.position.set(px[i], deckY + 1.25, pz[j]);
      post.castShadow = true;
      g.add(post);
    }
    var roof = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.28, 2.5), mRoof);
    roof.position.set(0, deckY + 2.6, -0.8);
    roof.castShadow = true;
    g.add(roof);

    var ridge = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.22, 0.3), mAcc);
    ridge.position.set(0, deckY + 2.85, -0.8);
    g.add(ridge);

    // Prominent twin rails + cross-ties running through station along z = -1.0 (gauge = 0.52)
    var railGeo = new THREE.BoxGeometry(8.1, 0.14, 0.13);
    var r1 = new THREE.Mesh(railGeo, mRail); r1.position.set(0, deckY + 0.12, -1.52); g.add(r1);
    var r2 = new THREE.Mesh(railGeo, mRail); r2.position.set(0, deckY + 0.12, -0.48); g.add(r2);
    var tieGeo = new THREE.BoxGeometry(0.16, 0.07, 1.32);
    for (var tx = -3.6; tx <= 3.65; tx += 0.6) {
      var tie = new THREE.Mesh(tieGeo, mTie);
      tie.position.set(tx, deckY + 0.04, -1.0);
      g.add(tie);
    }

    // Directional Launch (+x, green) and Return (-x, amber) chevron arrows at station track ends
    var arrowGeo = new THREE.ConeGeometry(0.42, 0.75, 4);
    arrowGeo.rotateZ(-Math.PI * 0.5);
    var launchArr = new THREE.Mesh(arrowGeo, mLaunch);
    launchArr.position.set(4.15, deckY + 0.28, -1.0);
    g.add(launchArr);
    var returnArr = new THREE.Mesh(arrowGeo, mReturn);
    returnArr.position.set(-4.15, deckY + 0.28, -1.0);
    g.add(returnArr);

    if (typeId === 'hyper') {
      var mGlow = new THREE.MeshBasicMaterial({ color: col.accent });
      var cGeo = new THREE.OctahedronGeometry(0.32, 0);
      [-3.5, 3.5].forEach(function (cx) {
        var cr = new THREE.Mesh(cGeo, mGlow);
        cr.position.set(cx, deckY + 3.1, -0.8);
        g.add(cr);
      });
    }
    return g;
  }

  function hookModels() {
    if (!Z.Models || Z.Models._coasterHooked) return;
    Z.Models._coasterHooked = true;
    var origCreate = Z.Models.createBuilding;
    Z.Models.createBuilding = function (id) {
      if (id === 'coaster_wooden') return makeStationModel('wooden');
      if (id === 'coaster_mine') return makeStationModel('mine');
      if (id === 'coaster_flume') return makeStationModel('flume');
      if (id === 'coaster_steel') return makeStationModel('steel');
      if (id === 'coaster_hyper') return makeStationModel('hyper');
      return origCreate ? origCreate.apply(this, arguments) : null;
    };
  }

  // ---- 2. BufferGeometry Builder with Continuous Stitched Extrusion ----
  function makeBufBuilder() {
    var pos = [], nrm = [], col = [];
    function pushQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, r, g, b) {
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
      for (var k = 0; k < 6; k++) { nrm.push(nx, ny, nz); col.push(r, g, b); }
    }
    function addBox(cx, cy, cz, hx, hy, hz, rx, ry, rz, ux, uy, uz, fx, fy, fz, hex) {
      var cr = ((hex >> 16) & 255) / 255, cg = ((hex >> 8) & 255) / 255, cb = (hex & 255) / 255;
      function pt(sx, sy, sz) {
        return [
          cx + rx * sx * hx + ux * sy * hy + fx * sz * hz,
          cy + ry * sx * hx + uy * sy * hy + fy * sz * hz,
          cz + rz * sx * hx + uz * sy * hy + fz * sz * hz
        ];
      }
      var p000 = pt(-1, -1, -1), p100 = pt(1, -1, -1), p110 = pt(1, 1, -1), p010 = pt(-1, 1, -1);
      var p001 = pt(-1, -1, 1), p101 = pt(1, -1, 1), p111 = pt(1, 1, 1), p011 = pt(-1, 1, 1);
      pushQuad(p011[0], p011[1], p011[2], p111[0], p111[1], p111[2], p110[0], p110[1], p110[2], p010[0], p010[1], p010[2], cr, cg, cb);
      pushQuad(p000[0], p000[1], p000[2], p100[0], p100[1], p100[2], p101[0], p101[1], p101[2], p001[0], p001[1], p001[2], cr * 0.7, cg * 0.7, cb * 0.7);
      pushQuad(p101[0], p101[1], p101[2], p100[0], p100[1], p100[2], p110[0], p110[1], p110[2], p111[0], p111[1], p111[2], cr * 0.88, cg * 0.88, cb * 0.88);
      pushQuad(p000[0], p000[1], p000[2], p001[0], p001[1], p001[2], p011[0], p011[1], p011[2], p010[0], p010[1], p010[2], cr * 0.88, cg * 0.88, cb * 0.88);
      pushQuad(p001[0], p001[1], p001[2], p101[0], p101[1], p101[2], p111[0], p111[1], p111[2], p011[0], p011[1], p011[2], cr * 0.92, cg * 0.92, cb * 0.92);
      pushQuad(p100[0], p100[1], p100[2], p000[0], p000[1], p000[2], p010[0], p010[1], p010[2], p110[0], p110[1], p110[2], cr * 0.82, cg * 0.82, cb * 0.82);
    }
    // Extrude a continuous rectangular beam between frame0 (p0, r0, u0) and frame1 (p1, r1, u1) with local offset (offR, offU) and half-size (hw, hh)
    function addBeamSeg(p0x, p0y, p0z, r0x, r0y, r0z, u0x, u0y, u0z, p1x, p1y, p1z, r1x, r1y, r1z, u1x, u1y, u1z, offR, offU, hw, hh, hex) {
      var cr = ((hex >> 16) & 255) / 255, cg = ((hex >> 8) & 255) / 255, cb = (hex & 255) / 255;
      function c0(sr, su) {
        var rr = offR + sr * hw, uu = offU + su * hh;
        return [p0x + r0x * rr + u0x * uu, p0y + r0y * rr + u0y * uu, p0z + r0z * rr + u0z * uu];
      }
      function c1(sr, su) {
        var rr = offR + sr * hw, uu = offU + su * hh;
        return [p1x + r1x * rr + u1x * uu, p1y + r1y * rr + u1y * uu, p1z + r1z * rr + u1z * uu];
      }
      var a00 = c0(-1, -1), a10 = c0(1, -1), a11 = c0(1, 1), a01 = c0(-1, 1);
      var b00 = c1(-1, -1), b10 = c1(1, -1), b11 = c1(1, 1), b01 = c1(-1, 1);
      // Top, Bottom, Outer-Right, Inner-Left
      pushQuad(a01[0], a01[1], a01[2], a11[0], a11[1], a11[2], b11[0], b11[1], b11[2], b01[0], b01[1], b01[2], cr, cg, cb);
      pushQuad(a10[0], a10[1], a10[2], a00[0], a00[1], a00[2], b00[0], b00[1], b00[2], b10[0], b10[1], b10[2], cr * 0.68, cg * 0.68, cb * 0.68);
      pushQuad(a11[0], a11[1], a11[2], a10[0], a10[1], a10[2], b10[0], b10[1], b10[2], b11[0], b11[1], b11[2], cr * 0.86, cg * 0.86, cb * 0.86);
      pushQuad(a00[0], a00[1], a00[2], a01[0], a01[1], a01[2], b01[0], b01[1], b01[2], b00[0], b00[1], b00[2], cr * 0.86, cg * 0.86, cb * 0.86);
    }
    function build() {
      if (!pos.length) return null;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      return mesh;
    }
    return { addBox: addBox, addBeamSeg: addBeamSeg, build: build };
  }

  function clearGroup(g) {
    while (g.children.length) {
      var ch = g.children[g.children.length - 1];
      g.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material && ch.material.dispose) ch.material.dispose();
    }
  }

  function rebuildTrack() {
    if (!trackGrp || !Z.Coaster) return;
    clearGroup(trackGrp);
    if (chainGrp) clearGroup(chainGrp);
    chainSegs.length = 0;
    chainMeshes.length = 0;

    var X = Z.Coaster.state();
    builtVer = X.ver;
    var s = Z.state;
    if (!s || !s.coasterRail) return;

    var gb = makeBufBuilder();
    var lines = X.lines;
    var k, i;

    for (k = 0; k < lines.length; k++) {
      var L = lines[k], td = L.typeDef, col = td.colors;
      var n = L.nS;
      var segs = L.loop ? n : Math.max(0, n - 1);
      var gauge = td.id === 'flume' ? 0.58 : 0.52;

      // High-contrast top rail colors so twin rails stand out unmistakably from cross-ties & spine!
      var topRailHex = td.id === 'wooden' ? 0xdde3ec
        : td.id === 'mine' ? 0xcfd6e0
        : td.id === 'steel' ? 0xf23a3a
        : td.id === 'hyper' ? 0x56f0d0
        : col.rail;

      // Precompute right vectors R[i] = T[i] x U[i] at every sample for seamless stitched extrusion
      var rxA = new Float32Array(n), ryA = new Float32Array(n), rzA = new Float32Array(n);
      for (i = 0; i < n; i++) {
        var rvx = L.ty[i] * L.uz[i] - L.tz[i] * L.uy[i];
        var rvy = L.tz[i] * L.ux[i] - L.tx[i] * L.uz[i];
        var rvz = L.tx[i] * L.uy[i] - L.ty[i] * L.ux[i];
        var rvl = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz) || 1;
        rxA[i] = rvx / rvl; ryA[i] = rvy / rvl; rzA[i] = rvz / rvl;
      }

      for (i = 0; i < segs; i++) {
        var j = (i + 1) % n;
        var x0 = L.px[i], y0 = L.py[i], z0 = L.pz[i];
        var x1 = L.px[j], y1 = L.py[j], z1 = L.pz[j];
        var mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5, mz = (z0 + z1) * 0.5;
        var fx = x1 - x0, fy = y1 - y0, fz = z1 - z0;
        var segLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
        if (segLen < 1e-4) continue;
        fx /= segLen; fy /= segLen; fz /= segLen;

        var r0x = rxA[i], r0y = ryA[i], r0z = rzA[i];
        var u0x = L.ux[i], u0y = L.uy[i], u0z = L.uz[i];
        var r1x = rxA[j], r1y = ryA[j], r1z = rzA[j];
        var u1x = L.ux[j], u1y = L.uy[j], u1z = L.uz[j];

        var sp = L.sSpec[i];
        var spPrev = i > 0 ? L.sSpec[i - 1] : 0;
        var spNext = L.sSpec[j];
        var halfL = segLen * 0.52;

        if (td.id === 'flume') {
          // Stitched U-shaped water chute trough + flowing water
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, 0, -0.14, 0.62, 0.06, col.tie);
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, -gauge, 0.10, 0.08, 0.22, col.rail);
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, gauge, 0.10, 0.08, 0.22, col.rail);
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, 0, 0.01, 0.50, 0.04, sp === 3 ? 0xa6f6ff : 0x45b8e8);
        } else {
          // Continuous stitched TWIN RAILS (left at -gauge, right at +gauge, elevated at +U * 0.11)
          var rHex = sp === 2 ? 0x38f2ff : topRailHex;
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, -gauge, 0.11, 0.075, 0.075, rHex);
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, gauge, 0.11, 0.075, 0.075, rHex);

          if (td.id === 'wooden' || td.id === 'mine') {
            // Wooden / Mine coaster under-rail timber ledges under each rail (leaving the center open so twin rails + sleepers are super clear!)
            gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, -gauge, -0.04, 0.11, 0.08, col.rail);
            gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, gauge, -0.04, 0.11, 0.08, col.rail);
          } else {
            // Steel / Hyper deep recessed backbone tube well below the sleepers (-U * 0.24)
            gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, 0, -0.22, 0.11, 0.10, col.tie);
          }

          // Dense cross-ties / sleepers spanning between and slightly beyond the two rails
          var tieStep = (td.id === 'wooden' || td.id === 'mine') ? 1 : 2;
          if ((i % tieStep) === 0) {
            gb.addBox(
              mx + u0x * 0.01, my + u0y * 0.01, mz + u0z * 0.01,
              gauge + 0.15, 0.045, 0.085,
              r0x, r0y, r0z, u0x, u0y, u0z, fx, fy, fz, col.tie
            );
          }
        }

        // ---- Special Track Elements ----
        if (sp === 1) {
          // CHAIN LIFT HILL:
          // 1) Raised dark-steel chain guide trough down the exact center between the twin rails (+U * 0.09)
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, 0, 0.08, 0.11, 0.055, 0x262b33);
          // 2) Inner bright metallic chain trackbed + static teeth base
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, 0, 0.125, 0.065, 0.03, 0x9aa4b2);
          // 3) Side catwalk planks & safety handrail posts along the right side of the lift hill (+R * (gauge + 0.34))
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, gauge + 0.32, 0.0, 0.18, 0.035, 0x7b5836);
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, gauge + 0.48, 0.48, 0.03, 0.03, 0xd8a838);
          if ((i % 3) === 0) {
            gb.addBox(
              mx + r0x * (gauge + 0.48) + u0x * 0.24,
              my + r0y * (gauge + 0.48) + u0y * 0.24,
              mz + r0z * (gauge + 0.48) + u0z * 0.24,
              0.03, 0.24, 0.03, r0x, r0y, r0z, u0x, u0y, u0z, fx, fy, fz, 0x454d59
            );
          }
          // 4) Toothed sprocket wheel housing at the start and end of every chain lift section
          if (spPrev !== 1 || spNext !== 1) {
            gb.addBox(
              mx + u0x * 0.08, my + u0y * 0.08, mz + u0z * 0.08,
              0.16, 0.22, 0.22, r0x, r0y, r0z, u0x, u0y, u0z, fx, fy, fz, 0xd49b2a
            );
          }
          // Record segment for animated moving chain links!
          chainSegs.push({
            stationId: L.station ? L.station.obj.id : 0,
            x: mx + u0x * 0.155, y: my + u0y * 0.155, z: mz + u0z * 0.155,
            fx: fx, fy: fy, fz: fz, ux: u0x, uy: u0y, uz: u0z, rx: r0x, ry: r0y, rz: r0z,
            len: segLen
          });
        } else if (sp === 2) {
          // Launch Boost glowing LSM fins down the center
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, 0, 0.11, 0.14, 0.05, 0x2cf2ff);
        } else if (sp === 3 && td.id !== 'flume') {
          // Water Splash basin side walls & water sheet outside the rails
          gb.addBeamSeg(x0, y0, z0, r0x, r0y, r0z, u0x, u0y, u0z, x1, y1, z1, r1x, r1y, r1z, u1x, u1y, u1z, 0, 0.02, gauge + 0.28, 0.05, 0x4cc8f5);
        }
      }

      // ---- 3. Support Pylons (properly rotated to track local Right vector!) ----
      for (i = 0; i < L.pylons.length; i++) {
        var py = L.pylons[i];
        var ht = py.yTop - py.yBot;
        if (ht <= 0.15) continue;
        var midY = (py.yTop + py.yBot) * 0.5;
        var prx = py.rx || 1, prz = py.rz || 0;
        var pfx = -prz, pfz = prx;
        if (td.id === 'wooden' || td.id === 'mine') {
          // Wooden trestle A-frame bents straddling both rails + horizontal ledgers
          var legOff = gauge;
          gb.addBox(py.x - prx * legOff, midY, py.z - prz * legOff, 0.11, ht * 0.5, 0.11, prx, 0, prz, 0, 1, 0, pfx, 0, pfz, col.support);
          gb.addBox(py.x + prx * legOff, midY, py.z + prz * legOff, 0.11, ht * 0.5, 0.11, prx, 0, prz, 0, 1, 0, pfx, 0, pfz, col.support);
          for (var yb = py.yBot + 1.2; yb < py.yTop - 0.2; yb += 1.5) {
            gb.addBox(py.x, yb, py.z, legOff + 0.12, 0.07, 0.08, prx, 0, prz, 0, 1, 0, pfx, 0, pfz, col.tie);
          }
        } else {
          // Steel / Hyper / Flume column + top crossbar supporting the twin rails
          gb.addBox(py.x, midY - 0.1, py.z, 0.17, Math.max(0.1, ht * 0.5 - 0.1), 0.17, prx, 0, prz, 0, 1, 0, pfx, 0, pfz, col.support);
          gb.addBox(py.x, py.yTop - 0.08, py.z, gauge + 0.06, 0.08, 0.14, prx, 0, prz, 0, 1, 0, pfx, 0, pfz, col.support);
          gb.addBox(py.x, py.yBot + 0.16, py.z, 0.34, 0.16, 0.34, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0x5c626a);
        }
      }
    }

    // Single isolated 1-tile track stubs (not yet connected to a 2+ tile chain): render proper twin rails + ties too!
    var N = Z.N || 56, rail = s.coasterRail, elev = s.coasterElev;
    for (var t = 0; t < rail.length; t++) {
      if (!rail[t]) continue;
      if (X.lineAt && X.lineAt[t] >= 0) continue;
      var ti = t % N, tj = (t - ti) / N;
      var cx = (ti + 0.5) * TILE, cz = (tj + 0.5) * TILE;
      var gy = Z.World && Z.World.groundY ? Z.World.groundY(cx, cz) : 0;
      var y = gy + CD.clearance + (elev[t] || 0) * CD.elevStep;
      var ew = !!(rail[t] & 10); // East/West vs North/South
      var srx = ew ? 0 : 1, srz = ew ? 1 : 0;
      var sfx = ew ? 1 : 0, sfz = ew ? 0 : 1;
      gb.addBox(cx - srx * 0.52, y + 0.11, cz - srz * 0.52, 0.075, 0.075, 0.9, srx, 0, srz, 0, 1, 0, sfx, 0, sfz, 0xdde3ec);
      gb.addBox(cx + srx * 0.52, y + 0.11, cz + srz * 0.52, 0.075, 0.075, 0.9, srx, 0, srz, 0, 1, 0, sfx, 0, sfz, 0xdde3ec);
      for (var so = -0.6; so <= 0.61; so += 0.6) {
        gb.addBox(cx + sfx * so, y + 0.01, cz + sfz * so, 0.65, 0.045, 0.085, srx, 0, srz, 0, 1, 0, sfx, 0, sfz, 0x6d421e);
      }
    }

    var mesh = gb.build();
    if (mesh) trackGrp.add(mesh);

    // Build animated chain link meshes for all Chain Lift segments
    if (chainGrp && chainSegs.length) {
      var linkGeo = new THREE.BoxGeometry(0.11, 0.07, 0.18);
      var linkMat = new THREE.MeshLambertMaterial({ color: 0xf5b82e });
      for (i = 0; i < chainSegs.length; i++) {
        var cs = chainSegs[i];
        var lm = new THREE.Mesh(linkGeo, linkMat);
        _vF.set(cs.fx, cs.fy, cs.fz).normalize();
        _vU.set(cs.ux, cs.uy, cs.uz).normalize();
        _vR.set(cs.rx, cs.ry, cs.rz).normalize();
        _mat4.makeBasis(_vR, _vU, _vF);
        lm.quaternion.setFromRotationMatrix(_mat4);
        lm.position.set(cs.x, cs.y, cs.z);
        chainGrp.add(lm);
        chainMeshes.push({ mesh: lm, seg: cs });
      }
    }
  }

  var chainTime = 0;
  function updateChains(dtGame) {
    if (!chainMeshes.length) return;
    chainTime += (dtGame || 0) * 3.5;
    for (var k = 0; k < chainMeshes.length; k++) {
      var cm = chainMeshes[k], cs = cm.seg;
      var stopped = false;
      if (cs.stationId && Z.Coaster) {
        var stInfo = Z.Coaster.stationInfo(cs.stationId);
        if (stInfo && (stInfo.broken || stInfo.paused)) stopped = true;
      }
      if (stopped) continue;
      var phase = ((chainTime + k * 0.35) % 1) - 0.5;
      var d = phase * cs.len;
      cm.mesh.position.set(cs.x + cs.fx * d, cs.y + cs.fy * d, cs.z + cs.fz * d);
    }
  }

  // ---- 3. 3D Coaster Train Models & Updates ----
  function makeCarMesh(typeId, isLead) {
    var td = TYPES[typeId] || TYPES.wooden;
    var col = td.colors;
    var g = new THREE.Group();
    var mBody = new THREE.MeshLambertMaterial({ color: col.car });
    var mAcc = new THREE.MeshLambertMaterial({ color: col.accent });
    var mDark = new THREE.MeshLambertMaterial({ color: 0x25282e });

    if (typeId === 'flume') {
      var log = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 1.85, 8), mBody);
      log.rotation.x = Math.PI * 0.5;
      log.position.y = 0.32;
      log.castShadow = true;
      g.add(log);
      var inner = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.25, 1.35), mDark);
      inner.position.y = 0.44;
      g.add(inner);
    } else {
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.48, 1.75), mBody);
      body.position.y = 0.34;
      body.castShadow = true;
      g.add(body);
      var trim = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.14, 1.82), mAcc);
      trim.position.y = 0.50;
      g.add(trim);
      var seats = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.26, 1.25), mDark);
      seats.position.y = 0.50;
      g.add(seats);
      if (isLead) {
        var nose = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.36, 0.45), mAcc);
        nose.position.set(0, 0.32, 1.0);
        g.add(nose);
        if (typeId === 'hyper') {
          var mGlow = new THREE.MeshBasicMaterial({ color: col.accent });
          var hornL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 5), mGlow);
          hornL.position.set(-0.28, 0.74, 0.85); hornL.rotation.x = -0.35; g.add(hornL);
          var hornR = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 5), mGlow);
          hornR.position.set(0.28, 0.74, 0.85); hornR.rotation.x = -0.35; g.add(hornR);
        }
      }
    }
    return g;
  }

  function syncTrains() {
    if (!trainGrp || !Z.state || !Z.state.coaster) return;
    var trains = Z.state.coaster.trains;
    var alive = {};
    for (var k = 0; k < trains.length; k++) {
      var T = trains[k];
      alive[T.id] = 1;
      var rec = trainMeshes[T.id];
      if (!rec || rec.count !== T.cars || rec.type !== T.type) {
        if (rec) trainGrp.remove(rec.group);
        var tg = new THREE.Group();
        var cars = [];
        for (var c = 0; c < T.cars; c++) {
          var cm = makeCarMesh(T.type, c === 0);
          tg.add(cm);
          cars.push(cm);
        }
        var bMat = new THREE.MeshBasicMaterial({ color: 0xff3b2f });
        var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bMat);
        beacon.position.set(0, 1.15, 0);
        beacon.visible = false;
        cars[0].add(beacon);
        trainGrp.add(tg);
        rec = trainMeshes[T.id] = { group: tg, cars: cars, type: T.type, count: T.cars, beacon: beacon };
      }
    }
    for (var id in trainMeshes) {
      if (!alive[id]) {
        trainGrp.remove(trainMeshes[id].group);
        delete trainMeshes[id];
      }
    }
  }

  function updateTrains(dtReal) {
    if (!Z.state || !Z.state.coaster || !Z.Coaster) return;
    syncTrains();
    var trains = Z.state.coaster.trains;
    var pose = {};
    var blink = Math.sin((Z.World && Z.World._G ? Z.World._G.t : 0) * 10) > 0;
    for (var k = 0; k < trains.length; k++) {
      var T = trains[k], rec = trainMeshes[T.id];
      if (!rec) continue;
      var info = Z.Coaster.trainInfo(T.id);
      var hasLoop = !!(info && info.line && info.line.loop && !info.line.branch);
      rec.group.visible = hasLoop;
      if (!hasLoop) continue;
      rec.beacon.visible = (info.state === 'broken' || info.state === 'stalled') && blink;
      for (var c = 0; c < rec.cars.length; c++) {
        var p = Z.Coaster.carPose(T, c, pose);
        if (!p) continue;
        var car = rec.cars[c];
        car.position.set(p.x, p.y, p.z);
        _vF.set(p.tx, p.ty, p.tz).normalize();
        _vU.set(p.ux, p.uy, p.uz).normalize();
        _vR.crossVectors(_vU, _vF).normalize();
        _vU.crossVectors(_vF, _vR).normalize();
        _mat4.makeBasis(_vR, _vU, _vF);
        car.quaternion.setFromRotationMatrix(_mat4);
      }
    }
  }

  // ---- 4. Water Splash FX ----
  function spawnSplash(ev) {
    if (!fxGrp || !ev) return;
    var mat = new THREE.MeshBasicMaterial({ color: 0xb8f2ff, transparent: true, opacity: 0.85 });
    var geo = new THREE.SphereGeometry(0.16, 5, 4);
    for (var k = 0; k < 12; k++) {
      var m = new THREE.Mesh(geo, mat);
      m.position.set(ev.x, ev.y + 0.35, ev.z);
      var ang = (k / 12) * Math.PI * 2 + Math.random() * 0.4;
      var spd = 2.0 + Math.random() * 2.5;
      fxGrp.add(m);
      splashes.push({ mesh: m, vx: Math.cos(ang) * spd, vy: 3.5 + Math.random() * 2.5, vz: Math.sin(ang) * spd, life: 0.9 });
    }
  }
  function updateSplashes(dt) {
    for (var k = splashes.length - 1; k >= 0; k--) {
      var sp = splashes[k];
      sp.life -= dt;
      if (sp.life <= 0) {
        fxGrp.remove(sp.mesh);
        splashes.splice(k, 1);
      } else {
        sp.vy -= 9.8 * dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        var sc = Math.max(0.1, sp.life);
        sp.mesh.scale.set(sc, sc, sc);
      }
    }
  }

  // ---- 5. Overlay (with height gradient & station socket markers!) ----
  var ELEV_COLS = [0x56d97e, 0xa8e052, 0xf2d03b, 0xff9e3b, 0xff623b, 0xe8386d, 0xb838f5, 0x7a38ff, 0x38d8ff];
  function rebuildOverlay() {
    if (!ovGrp) return;
    clearGroup(ovGrp);
    if (!overlayOn || !Z.state || !Z.state.coasterRail) return;
    var N = Z.N || 56, rail = Z.state.coasterRail, elev = Z.state.coasterElev, spec = Z.state.coasterSpec;
    var gb = makeBufBuilder();
    for (var t = 0; t < rail.length; t++) {
      if (!rail[t]) continue;
      var ti = t % N, tj = (t - ti) / N;
      var cx = (ti + 0.5) * TILE, cz = (tj + 0.5) * TILE;
      var gy = (Z.World && Z.World.groundY ? Z.World.groundY(cx, cz) : 0) + 0.09;
      var elv = Math.min(8, Math.max(0, elev[t] || 0));
      var hCol = spec[t] >= 4 ? 0xd84dff : spec[t] === 2 ? 0x30f2ff : spec[t] === 3 ? 0x45b8e8 : spec[t] === 1 ? 0xf5b82e : ELEV_COLS[elv];
      gb.addBox(cx, gy, cz, 0.85, 0.03, 0.85, 1, 0, 0, 0, 1, 0, 0, 0, 1, hCol);
    }
    // Also highlight station Launch (green) and Return (amber) exit tiles so players know where to drag from/to!
    if (Z.Coaster) {
      var X = Z.Coaster.state(), DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
      for (var k = 0; k < X.stations.length; k++) {
        var st = X.stations[k];
        var efI = (st.endF % N) + DX[st.fd], efJ = Math.floor(st.endF / N) + DZ[st.fd];
        var ebI = (st.endB % N) + DX[st.bd], ebJ = Math.floor(st.endB / N) + DZ[st.bd];
        if (efI >= 0 && efJ >= 0 && efI < N && efJ < N) {
          var fx = (efI + 0.5) * TILE, fz = (efJ + 0.5) * TILE, fgy = (Z.World && Z.World.groundY ? Z.World.groundY(fx, fz) : 0) + 0.12;
          gb.addBox(fx, fgy, fz, 0.7, 0.06, 0.7, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0x38e56b);
        }
        if (ebI >= 0 && ebJ >= 0 && ebI < N && ebJ < N) {
          var bx = (ebI + 0.5) * TILE, bz = (ebJ + 0.5) * TILE, bgy = (Z.World && Z.World.groundY ? Z.World.groundY(bx, bz) : 0) + 0.12;
          gb.addBox(bx, bgy, bz, 0.7, 0.06, 0.7, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0xffb838);
        }
      }
    }
    var m = gb.build();
    if (m) ovGrp.add(m);
  }

  // ---- 6. Camera: Ride-Along (1st person) & Orbit Follow ----
  function findTrain(id) {
    if (!Z.state || !Z.state.coaster) return null;
    var ts = Z.state.coaster.trains;
    for (var k = 0; k < ts.length; k++) if (ts[k].id === id) return ts[k];
    return null;
  }

  function applyCamera(camera, dt) {
    if (followTrainId && !rideTrainId) {
      var ft = findTrain(followTrainId);
      if (!ft || !Z.Coaster) { followTrainId = 0; }
      else {
        var fp = Z.Coaster.carPose(ft, 0);
        if (fp && Z.World && Z.World.cam) {
          Z.World.cam.target.x += (fp.x - Z.World.cam.target.x) * Math.min(1, dt * 8);
          Z.World.cam.target.z += (fp.z - Z.World.cam.target.z) * Math.min(1, dt * 8);
        }
      }
    }
    if (!rideTrainId) return false;
    var T = findTrain(rideTrainId);
    if (!T || !Z.Coaster) { endRide(); return false; }
    var p = Z.Coaster.carPose(T, 0);
    if (!p) { endRide(); return false; }
    var eyeX = p.x + p.ux * 1.15 + p.tx * 0.35;
    var eyeY = p.y + p.uy * 1.15 + p.ty * 0.35;
    var eyeZ = p.z + p.uz * 1.15 + p.tz * 0.35;
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.up.set(p.ux, p.uy, p.uz);
    camera.fov = 72;
    camera.near = 0.12;
    camera.lookAt(eyeX + p.tx * 12, eyeY + p.ty * 12, eyeZ + p.tz * 12);
    return true;
  }

  function rideAlong(trainId) {
    var T = findTrain(trainId);
    if (!T) return false;
    rideTrainId = trainId;
    followTrainId = 0;
    if (Z.bus) Z.bus.emit('coasterRide', trainId);
    return true;
  }

  function endRide() {
    if (!rideTrainId) return;
    rideTrainId = 0;
    if (Z.bus) Z.bus.emit('coasterRide', 0);
  }

  function follow(trainId) {
    rideTrainId = 0;
    followTrainId = trainId || 0;
    if (Z.bus) Z.bus.emit('coasterRide', 0);
  }

  function pickTrain(cx, cy, projectPoint, pxPerUnit, base) {
    if (!Z.state || !Z.state.coaster || !Z.Coaster) return null;
    var trains = Z.state.coaster.trains;
    var best = null, bestD = 1e9, pose = {};
    for (var k = 0; k < trains.length; k++) {
      var T = trains[k];
      for (var c = 0; c < T.cars; c++) {
        var p = Z.Coaster.carPose(T, c, pose);
        if (!p) continue;
        projectPoint(p.x, p.y + 0.5, p.z, _pr);
        if (!_pr.vis) continue;
        var rad = Math.max(base, pxPerUnit * 1.1 / _pr.w);
        var dx = _pr.x - cx, dy = _pr.y - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d < rad && d < bestD) { bestD = d; best = { kind: 'ctrain', id: T.id }; }
      }
    }
    return best;
  }

  function ensureAttached() {
    if (grp || !Z.World || !Z.World.root) return;
    var root = Z.World.root();
    if (!root) return;
    grp = new THREE.Group();
    trackGrp = new THREE.Group();
    chainGrp = new THREE.Group();
    trainGrp = new THREE.Group();
    fxGrp = new THREE.Group();
    ovGrp = new THREE.Group();
    grp.add(trackGrp); grp.add(chainGrp); grp.add(trainGrp); grp.add(fxGrp); grp.add(ovGrp);
    root.add(grp);
  }

  function frame(dtReal, dtGame) {
    hookModels();
    ensureAttached();
    if (!grp) return;
    if (Z.Coaster) {
      var v = Z.Coaster.state().ver;
      if (v !== builtVer) {
        rebuildTrack();
        if (overlayOn) rebuildOverlay();
      }
    }
    updateChains(dtGame);
    updateTrains(dtReal);
    updateSplashes(dtReal);
  }

  function setOverlay(on) {
    overlayOn = !!on;
    ensureAttached();
    rebuildOverlay();
  }

  if (Z.bus && Z.bus.on) {
    Z.bus.on('coasterSplash', spawnSplash);
    Z.bus.on('reset', function () {
      builtVer = -1;
      rideTrainId = 0;
      followTrainId = 0;
      if (trackGrp) clearGroup(trackGrp);
      if (chainGrp) { clearGroup(chainGrp); chainSegs.length = 0; chainMeshes.length = 0; }
      if (trainGrp) { clearGroup(trainGrp); trainMeshes = {}; }
      if (ovGrp) clearGroup(ovGrp);
    });
  }
  hookModels();

  Z.CoasterWorld = {
    frame: frame,
    applyCamera: applyCamera,
    pickTrain: pickTrain,
    rideAlong: rideAlong,
    endRide: endRide,
    isRiding: function () { return rideTrainId; },
    follow: follow,
    setOverlay: setOverlay,
    isOverlay: function () { return overlayOn; },
    makeStationModel: makeStationModel
  };
})();
