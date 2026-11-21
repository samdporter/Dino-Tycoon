// Dino Tycoon — Custom Rollercoaster 3D World Renderer
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
  var COASTER_STATIONS = {
    coaster_wooden: 'wooden',
    coaster_mine: 'mine',
    coaster_flume: 'flume',
    coaster_steel: 'steel',
    coaster_hyper: 'hyper'
  };

  var grp = null;
  var trackGrp = null;
  var chainGrp = null;  // animated moving chain links on Chain Lift Hills
  var trainGrp = null;
  var fxGrp = null;
  var ovGrp = null;
  var builtVer = -1;
  var trainMeshes = {};
  var chainSegs = [];   // [{ stationId, x,y,z, fx,fy,fz, ux,uy,uz, rx,ry,rz, len }]
  var chainMeshes = []; // pool of moving chain link meshes
  var splashes = [];
  var rideTrainId = 0;
  var followTrainId = 0;
  var overlayOn = false;

  var _mat4 = new THREE.Matrix4();
  var _vR = new THREE.Vector3(), _vU = new THREE.Vector3(), _vF = new THREE.Vector3();
  var _pr = { x: 0, y: 0, w: 0, vis: false };

  // ---- 1. Hook Z.Models.createBuilding & Z.Models.buildingFootprint for the 5 custom coaster stations ----
  var _stArrowGeo = null, _stLaunchMat = null, _stReturnMat = null, _stRailMat = null, _stDarkMat = null;
  function getStationShared() {
    if (!_stArrowGeo) {
      _stArrowGeo = new THREE.ConeGeometry(0.42, 0.75, 4);
      _stArrowGeo.rotateZ(-Math.PI * 0.5);
      _stLaunchMat = new THREE.MeshBasicMaterial({ color: 0x38e56b });
      _stReturnMat = new THREE.MeshBasicMaterial({ color: 0xffb838 });
      _stRailMat = new THREE.MeshLambertMaterial({ color: 0xd8dfe8 });
      _stDarkMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
    }
    return { arrowGeo: _stArrowGeo, mLaunch: _stLaunchMat, mReturn: _stReturnMat, mRail: _stRailMat, mDark: _stDarkMat };
  }
  function makeExtrudeGeo(pts, depth, bev, segs) {
    var sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    var geo = new THREE.ExtrudeGeometry(sh, {
      depth: depth,
      bevelEnabled: bev > 0,
      bevelThickness: bev || 0,
      bevelSize: bev || 0,
      bevelSegments: bev > 0 ? 2 : 0,
      curveSegments: segs || 6
    });
    geo.translate(0, 0, -depth * 0.5);
    return geo;
  }
  function makeSideExtrudeGeo(pts, width, bev, segs) {
    var geo = makeExtrudeGeo(pts, width, bev, segs);
    geo.rotateY(-Math.PI * 0.5);
    return geo;
  }

  function makeStationModel(typeId) {
    var td = TYPES[typeId] || TYPES.wooden;
    var col = td.colors;
    var sh = getStationShared();
    var g = new THREE.Group();
    var mBase = new THREE.MeshLambertMaterial({ color: col.station });
    var mRoof = new THREE.MeshLambertMaterial({ color: col.roof });
    var mAcc = new THREE.MeshLambertMaterial({ color: col.accent });
    var mTie = new THREE.MeshLambertMaterial({ color: col.tie });
    var mRail = sh.mRail, mDark = sh.mDark;
    var deckY = CD.stationDeck;

    // 4x2 footprint = 8m (x: -4..4) by 4m (z: -2..2). Front entrance faces +z, track runs along z = -1.0 (back row)
    var baseGeo = makeExtrudeGeo([[-3.75, -1.75], [3.75, -1.75], [3.75, 1.75], [-3.75, 1.75]], deckY - 0.14, 0.08, 2);
    baseGeo.rotateX(Math.PI * 0.5);
    var base = new THREE.Mesh(baseGeo, mBase);
    base.position.set(0, deckY * 0.5, 0);
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);

    // Entrance stairs (+z side)
    for (var s = 0; s < 4; s++) {
      var st = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.26, 0.42), mBase);
      st.position.set(1.6, 0.13 + s * (deckY / 4), 1.68 - s * 0.32);
      g.add(st);
    }

    // Ticket booth (+z side, themed per coaster)
    if (typeId === 'steel' || typeId === 'hyper') {
      var kShape = new THREE.Shape();
      kShape.moveTo(-1.1, -0.55); kShape.lineTo(1.1, -0.55); kShape.quadraticCurveTo(1.3, 0, 1.1, 0.55);
      kShape.lineTo(-1.1, 0.55); kShape.quadraticCurveTo(-1.3, 0, -1.1, -0.55);
      var kGeo = new THREE.ExtrudeGeometry(kShape, { depth: 2.1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 8 });
      kGeo.rotateX(-Math.PI * 0.5);
      var boothS = new THREE.Mesh(kGeo, mAcc);
      boothS.position.set(-1.8, 0.08, 1.15);
      boothS.castShadow = true;
      g.add(boothS);
      var visorGeo = makeSideExtrudeGeo([[-0.65, 0], [0.92, -0.14], [0.92, 0.04], [-0.65, 0.22]], 2.9, 0.04);
      var visor = new THREE.Mesh(visorGeo, mRoof);
      visor.position.set(-1.8, 2.25, 1.2);
      g.add(visor);
    } else {
      var boothGeo = makeExtrudeGeo([[-1.25, -0.6], [1.25, -0.6], [1.25, 0.6], [-1.25, 0.6]], 2.1, 0.05, 2);
      boothGeo.rotateX(-Math.PI * 0.5);
      var booth = new THREE.Mesh(boothGeo, mAcc);
      booth.position.set(-1.8, 0.05, 1.15);
      booth.castShadow = true;
      g.add(booth);
      var bRoofGeo = makeSideExtrudeGeo([[-0.78, 0], [0, 0.55], [0.78, 0]], 2.95, 0.04);
      var bRoof = new THREE.Mesh(bRoofGeo, mRoof);
      bRoof.position.set(-1.8, 2.22, 1.2);
      g.add(bRoof);
    }

    // Boarding edge safety railing (+z side of boarding platform)
    var railPostGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.85, 6);
    var railBar = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.07, 0.07), mTie);
    railBar.position.set(-1.0, deckY + 0.82, 0.22);
    g.add(railBar);
    for (var rx = -3.6; rx <= 1.85; rx += 0.9) {
      var rp = new THREE.Mesh(railPostGeo, mDark);
      rp.position.set(rx, deckY + 0.42, 0.22);
      g.add(rp);
    }

    // Theme-specific station canopy architecture over boarding track (z = -0.8)
    var px = [-3.35, -1.12, 1.12, 3.35], pz = [-1.72, 0.16];
    var i, j;
    if (typeId === 'mine') {
      // Heavy timber headframe A-trusses + corrugated pitched roof + hanging lanterns + ore chute
      for (i = 0; i < px.length; i++) for (j = 0; j < pz.length; j++) {
        var mPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.45, 0.22), mTie);
        mPost.position.set(px[i], deckY + 1.22, pz[j]); mPost.castShadow = true; g.add(mPost);
      }
      var pitchGeo = makeSideExtrudeGeo([[-1.45, 0], [0, 1.15], [1.45, 0], [1.30, -0.10], [0, 0.96], [-1.30, -0.10]], 7.8, 0.03);
      var mRoofMesh = new THREE.Mesh(pitchGeo, mRoof);
      mRoofMesh.position.set(0, deckY + 2.42, -0.78); mRoofMesh.castShadow = true; g.add(mRoofMesh);
      // Corrugation ribs & A-truss headframe peaks
      var ribGeo = new THREE.BoxGeometry(0.08, 0.08, 2.9);
      for (var cr = -3.4; cr <= 3.45; cr += 0.85) {
        var rib = new THREE.Mesh(ribGeo, mDark);
        rib.position.set(cr, deckY + 2.95, -0.78);
        g.add(rib);
      }
      var aFrameGeo = new THREE.BoxGeometry(0.18, 1.85, 0.18);
      [-3.1, 0, 3.1].forEach(function (ax) {
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var leg = new THREE.Mesh(aFrameGeo, mTie);
          leg.position.set(ax, deckY + 3.15, -0.78 + sgn * 0.55);
          leg.rotation.x = -sgn * 0.58;
          g.add(leg);
        }
      });
      var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 14), mAcc);
      wheel.rotation.y = Math.PI * 0.5;
      wheel.position.set(0, deckY + 3.92, -0.78);
      g.add(wheel);
      // Hanging warm lanterns
      var mLant = new THREE.MeshBasicMaterial({ color: 0xffd670 });
      [-2.2, 0, 2.2].forEach(function (lx) {
        var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 5), mDark);
        cord.position.set(lx, deckY + 2.25, 0.12); g.add(cord);
        var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), mLant);
        bulb.position.set(lx, deckY + 2.02, 0.12); g.add(bulb);
      });
      // Ore chute framing next to booth
      var chute = new THREE.Mesh(makeSideExtrudeGeo([[-0.45, 0], [0.45, 0.45], [0.45, 0.65], [-0.45, 0.22]], 0.72, 0.02), mTie);
      chute.position.set(-0.15, 0.9, 1.25); g.add(chute);
    } else if (typeId === 'flume') {
      // Rustic boathouse timber canopy, arched gable roof, water trough curb & lifebuoy rings
      var logPost = new THREE.CylinderGeometry(0.12, 0.14, 2.45, 8);
      for (i = 0; i < px.length; i++) for (j = 0; j < pz.length; j++) {
        var lp = new THREE.Mesh(logPost, mTie);
        lp.position.set(px[i], deckY + 1.22, pz[j]); lp.castShadow = true; g.add(lp);
      }
      var archRoof = new THREE.Mesh(makeSideExtrudeGeo([
        [-1.42, 0], [-0.95, 0.72], [0, 1.04], [0.95, 0.72], [1.42, 0],
        [1.22, -0.08], [0, 0.84], [-1.22, -0.08]
      ], 7.8, 0.04), mRoof);
      archRoof.position.set(0, deckY + 2.40, -0.78); archRoof.castShadow = true; g.add(archRoof);
      var ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.16, 0.18), mTie);
      ridgeBeam.position.set(0, deckY + 3.44, -0.78); g.add(ridgeBeam);
      // Lifebuoy rings on front dock posts
      var mBuoy = new THREE.MeshLambertMaterial({ color: 0xe85a30 });
      var buoyGeo = new THREE.TorusGeometry(0.24, 0.07, 6, 12);
      [-2.2, 2.2].forEach(function (bx) {
        var buoy = new THREE.Mesh(buoyGeo, mBuoy);
        buoy.position.set(bx, deckY + 1.25, 0.24);
        g.add(buoy);
      });
    } else if (typeId === 'steel') {
      // Curved tubular steel arch ribs + translucent curved canopy roof
      var archGeo = new THREE.TorusGeometry(1.38, 0.08, 8, 18, Math.PI);
      archGeo.rotateY(Math.PI * 0.5);
      for (i = 0; i < px.length; i++) {
        var arch = new THREE.Mesh(archGeo, mDark);
        arch.position.set(px[i], deckY + 1.65, -0.78);
        arch.castShadow = true;
        g.add(arch);
        for (j = 0; j < pz.length; j++) {
          var stP = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 1.7, 8), mDark);
          stP.position.set(px[i], deckY + 0.85, -0.78 + (j === 0 ? -1.38 : 1.38));
          g.add(stP);
        }
      }
      var canopyGeo = new THREE.CylinderGeometry(1.34, 1.34, 7.6, 16, 1, true, 0, Math.PI);
      canopyGeo.rotateZ(Math.PI * 0.5);
      var mGlassRoof = new THREE.MeshLambertMaterial({ color: col.roof, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      var canopy = new THREE.Mesh(canopyGeo, mGlassRoof);
      canopy.position.set(0, deckY + 1.65, -0.78);
      g.add(canopy);
      var spine = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7.8, 8), mAcc);
      spine.rotation.z = Math.PI * 0.5;
      spine.position.set(0, deckY + 3.04, -0.78);
      g.add(spine);
    } else if (typeId === 'hyper') {
      // Swept futuristic wing-arch canopy + tapered glowing pylons + sculpted launch gate arch
      var mGlow = new THREE.MeshBasicMaterial({ color: col.accent });
      var pylonPts = [new THREE.Vector2(0.16, 0), new THREE.Vector2(0.11, 1.4), new THREE.Vector2(0.07, 2.6), new THREE.Vector2(0.13, 2.75)];
      var pylonGeo = new THREE.LatheGeometry(pylonPts, 8);
      for (i = 0; i < px.length; i++) for (j = 0; j < pz.length; j++) {
        var py = new THREE.Mesh(pylonGeo, mDark);
        py.position.set(px[i], deckY, pz[j]); py.castShadow = true; g.add(py);
        var strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.05), mGlow);
        strip.position.set(px[i], deckY + 1.3, pz[j] + (j === 1 ? 0.11 : -0.11));
        g.add(strip);
      }
      var wingGeo = makeSideExtrudeGeo([
        [-1.55, 0.12], [-0.55, 0.58], [0, 0.72], [0.55, 0.58], [1.65, 0.88],
        [1.55, 0.66], [0, 0.44], [-1.45, -0.02]
      ], 7.8, 0.05);
      var wingRoof = new THREE.Mesh(wingGeo, mRoof);
      wingRoof.position.set(0, deckY + 2.48, -0.78); wingRoof.castShadow = true; g.add(wingRoof);
      // Launch gate arch (+x exit)
      var gateGeo = new THREE.TorusGeometry(1.12, 0.11, 8, 18, Math.PI);
      gateGeo.rotateY(Math.PI * 0.5);
      var gate = new THREE.Mesh(gateGeo, mAcc);
      gate.position.set(3.65, deckY + 0.95, -1.0);
      g.add(gate);
      var cGeo = new THREE.OctahedronGeometry(0.32, 0);
      [-3.5, 3.5].forEach(function (cx) {
        var cr = new THREE.Mesh(cGeo, mGlow);
        cr.position.set(cx, deckY + 3.45, -0.78);
        g.add(cr);
      });
    } else {
      // Wooden (and fallback): peaked timber gable roof with truss beams & round log columns
      var wPostGeo = new THREE.CylinderGeometry(0.12, 0.15, 2.5, 8);
      for (i = 0; i < px.length; i++) for (j = 0; j < pz.length; j++) {
        var wp = new THREE.Mesh(wPostGeo, mTie);
        wp.position.set(px[i], deckY + 1.25, pz[j]); wp.castShadow = true; g.add(wp);
      }
      var gableGeo = makeSideExtrudeGeo([[-1.42, 0], [0, 1.08], [1.42, 0], [1.26, -0.08], [0, 0.88], [-1.26, -0.08]], 7.8, 0.04);
      var gRoof = new THREE.Mesh(gableGeo, mRoof);
      gRoof.position.set(0, deckY + 2.44, -0.78); gRoof.castShadow = true; g.add(gRoof);
      // King-post truss tie beams
      [-3.35, 0, 3.35].forEach(function (tx) {
        var tieB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.5), mTie);
        tieB.position.set(tx, deckY + 2.42, -0.78); g.add(tieB);
        var kingP = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 0.12), mTie);
        kingP.position.set(tx, deckY + 2.88, -0.78); g.add(kingP);
      });
      var wRidge = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.18, 0.22), mAcc);
      wRidge.position.set(0, deckY + 3.56, -0.78); g.add(wRidge);
    }

    // Track through station along z = -1.0 (water trough for flume, twin rails + ties for coasters)
    if (typeId === 'flume') {
      var troughBot = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.12, 1.32), mTie);
      troughBot.position.set(0, deckY + 0.02, -1.0); g.add(troughBot);
      var waterMat = new THREE.MeshLambertMaterial({ color: 0x45b8e8 });
      var water = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.08, 1.02), waterMat);
      water.position.set(0, deckY + 0.10, -1.0); g.add(water);
      var curbGeo = new THREE.BoxGeometry(8.1, 0.34, 0.14);
      var c1 = new THREE.Mesh(curbGeo, mRail); c1.position.set(0, deckY + 0.18, -1.58); g.add(c1);
      var c2 = new THREE.Mesh(curbGeo, mRail); c2.position.set(0, deckY + 0.18, -0.42); g.add(c2);
    } else {
      var railGeo = new THREE.BoxGeometry(8.1, 0.14, 0.13);
      var r1 = new THREE.Mesh(railGeo, mRail); r1.position.set(0, deckY + 0.12, -1.52); g.add(r1);
      var r2 = new THREE.Mesh(railGeo, mRail); r2.position.set(0, deckY + 0.12, -0.48); g.add(r2);
      var tieGeo = new THREE.BoxGeometry(0.16, 0.07, 1.32);
      for (var tx = -3.6; tx <= 3.65; tx += 0.6) {
        var tie = new THREE.Mesh(tieGeo, mTie);
        tie.position.set(tx, deckY + 0.04, -1.0);
        g.add(tie);
      }
    }

    // Directional Launch (+x, green) and Return (-x, amber) chevron arrows at station track ends
    var launchArr = new THREE.Mesh(sh.arrowGeo, sh.mLaunch);
    launchArr.position.set(4.15, deckY + 0.28, -1.0);
    g.add(launchArr);
    var returnArr = new THREE.Mesh(sh.arrowGeo, sh.mReturn);
    returnArr.position.set(-4.15, deckY + 0.28, -1.0);
    g.add(returnArr);

    return g;
  }

  function hookModels() {
    if (!Z.Models || Z.Models._coasterHooked) return;
    Z.Models._coasterHooked = true;
    var origCreate = Z.Models.createBuilding;
    var origFootprint = Z.Models.buildingFootprint;
    Z.Models.createBuilding = function (id) {
      var typeId = COASTER_STATIONS[id];
      if (typeId) {
        var g = makeStationModel(typeId);
        g.userData.buildingId = id;
        g.userData.footprint = { w: 4, h: 2 };
        return g;
      }
      return origCreate ? origCreate.apply(this, arguments) : null;
    };
    Z.Models.buildingFootprint = function (id) {
      if (COASTER_STATIONS[id]) return { w: 4, h: 2 };
      return origFootprint ? origFootprint.apply(this, arguments) : { w: 2, h: 2 };
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

  var _beaconRes = null;
  function getBeaconRes() {
    if (!_beaconRes) {
      _beaconRes = {
        openRingGeo: new THREE.TorusGeometry(0.62, 0.08, 6, 18),
        badRingGeo: new THREE.TorusGeometry(0.76, 0.09, 6, 20),
        stemGeo: new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8),
        coneGeo: new THREE.ConeGeometry(0.36, 0.72, 8),
        openMat: new THREE.MeshBasicMaterial({ color: 0xff6a1a }),
        openRingMat: new THREE.MeshBasicMaterial({ color: 0xffb030 }),
        warnMat: new THREE.MeshBasicMaterial({ color: 0xff2222 })
      };
    }
    return _beaconRes;
  }

  function addBeacon(x, y, z, isWarn) {
    var R = getBeaconRes();
    var ring = new THREE.Mesh(R.openRingGeo, isWarn ? R.warnMat : R.openRingMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.set(x, y + 0.08, z);
    ring.userData.shared = true;
    trackGrp.add(ring);

    var stem = new THREE.Mesh(R.stemGeo, isWarn ? R.warnMat : R.openMat);
    stem.position.set(x, y + 0.75, z);
    stem.userData.shared = true;
    trackGrp.add(stem);

    var cone = new THREE.Mesh(R.coneGeo, isWarn ? R.warnMat : R.openMat);
    cone.rotation.x = Math.PI;
    cone.position.set(x, y + 1.65, z);
    cone.userData.shared = true;
    trackGrp.add(cone);
  }

  function addBadRing(x, y, z) {
    var R = getBeaconRes();
    var ring = new THREE.Mesh(R.badRingGeo, R.warnMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.set(x, y + 0.08, z);
    ring.userData.shared = true;
    trackGrp.add(ring);
  }

  function clearGroup(g) {
    while (g.children.length) {
      var ch = g.children[g.children.length - 1];
      g.remove(ch);
      if (ch.children && ch.children.length) clearGroup(ch);
      if (!ch.userData || !ch.userData.shared) {
        if (ch.geometry) ch.geometry.dispose();
        if (ch.material && ch.material.dispose) ch.material.dispose();
      }
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

    var N = Z.N || 56, rail = s.coasterRail, elev = s.coasterElev;
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
        var isLiftSeg = sp === 1 || (L.sLift && L.sLift[i] === 1);
        if (isLiftSeg) {
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
          var liftPrev = i > 0 && (spPrev === 1 || (L.sLift && L.sLift[i - 1] === 1));
          var liftNext = spNext === 1 || (L.sLift && L.sLift[j] === 1);
          if (!liftPrev || !liftNext) {
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
          if (py.spec >= 4) {
            // Reinforced angled steel A-frame / arch support towers bracing loops & corkscrews
            var archTop = py.yTop + (py.spec === 6 ? 5.2 : py.spec === 7 ? 3.2 : py.spec === 4 ? 2.6 : 1.6);
            var baseSpread = py.spec === 6 ? 3.0 : py.spec === 7 ? 4.2 : py.spec === 4 ? 2.0 : 2.6;
            var topSpread = py.spec === 6 ? 2.2 : py.spec === 7 ? 3.5 : py.spec === 4 ? 1.45 : 2.1;
            var foreSpread = py.spec >= 6 ? 1.35 : 0.9;
            for (var sgn = -1; sgn <= 1; sgn += 2) {
              var tx = py.x + prx * (sgn * topSpread), tz = py.z + prz * (sgn * topSpread);
              var bx = py.x + prx * (sgn * baseSpread), bz = py.z + prz * (sgn * baseSpread);
              gb.addBeamSeg(bx - pfx * foreSpread, py.yBot, bz - pfz * foreSpread, prx, 0, prz, pfx, 0, pfz, tx, archTop, tz, prx, 0, prz, pfx, 0, pfz, 0, 0, 0.08, 0.08, col.support);
              gb.addBeamSeg(bx + pfx * foreSpread, py.yBot, bz + pfz * foreSpread, prx, 0, prz, pfx, 0, pfz, tx, archTop, tz, prx, 0, prz, pfx, 0, pfz, 0, 0, 0.08, 0.08, col.support);
              gb.addBox(bx - pfx * foreSpread, py.yBot + 0.12, bz - pfz * foreSpread, 0.24, 0.12, 0.24, prx, 0, prz, 0, 1, 0, pfx, 0, pfz, 0x5c626a);
              gb.addBox(bx + pfx * foreSpread, py.yBot + 0.12, bz + pfz * foreSpread, 0.24, 0.12, 0.24, prx, 0, prz, 0, 1, 0, pfx, 0, pfz, 0x5c626a);
            }
          }
        }
      }

      // ---- 4. 3D Indicators for Open Track Ends, Stall Points & Blocked Supports ----
      if (!L.loop && L.nodes && L.nodes.length >= 2 && n >= 1) {
        var firstT = L.nodes[0];
        if (!X.stAt || X.stAt[firstT] < 0) addBeacon(L.px[0], L.py[0], L.pz[0], false);
        var lastT = L.nodes[L.nodes.length - 1];
        if ((!X.stAt || X.stAt[lastT] < 0) && (lastT !== firstT || n > 1)) {
          addBeacon(L.px[n - 1], L.py[n - 1], L.pz[n - 1], false);
        }
      }
      if (L.loop && !L.energyOk && L.stallSample >= 0 && L.stallSample < n) {
        var ss = L.stallSample;
        addBeacon(L.px[ss], L.py[ss], L.pz[ss], true);
      }
      if (L.bad) {
        for (var bt in L.bad) {
          var bTile = +bt;
          var bti = bTile % N, btj = (bTile - bti) / N;
          var bcx = (bti + 0.5) * TILE, bcz = (btj + 0.5) * TILE;
          var bgy = Z.World && Z.World.groundY ? Z.World.groundY(bcx, bcz) : 0;
          var by = bgy + CD.clearance + (elev[bTile] || 0) * CD.elevStep;
          var bestD2 = 1e9;
          for (i = 0; i < n; i++) {
            var bdx = L.px[i] - bcx, bdz = L.pz[i] - bcz;
            var bd2 = bdx * bdx + bdz * bdz;
            if (bd2 < bestD2) { bestD2 = bd2; by = L.py[i]; }
          }
          addBadRing(bcx, by, bcz);
        }
      }
    }

    // Single isolated 1-tile track stubs (not yet connected to a 2+ tile chain): render proper twin rails + ties + open-end beacon!
    for (var t = 0; t < rail.length; t++) {
      if (!rail[t]) continue;
      if (X.stAt && X.stAt[t] >= 0) continue;
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
      addBeacon(cx, y, cz, false);
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
  var _carCommon = null, _carTypeCache = {};
  function getCarCommon() {
    if (_carCommon) return _carCommon;
    var wheelGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.085, 10);
    wheelGeo.rotateZ(Math.PI * 0.5);
    var guideGeo = new THREE.BoxGeometry(0.08, 0.10, 0.24);
    var axleGeo = new THREE.BoxGeometry(1.12, 0.07, 0.10);
    var cushionGeo = new THREE.BoxGeometry(0.82, 0.09, 0.34);
    var backGeo = new THREE.BoxGeometry(0.32, 0.38, 0.09);
    var headrestGeo = new THREE.CylinderGeometry(0.085, 0.105, 0.14, 8);
    var lapBarGeo = new THREE.TorusGeometry(0.15, 0.024, 6, 10, Math.PI);
    var otsrGeo = new THREE.TorusGeometry(0.14, 0.026, 6, 12, Math.PI);
    var headLampGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.08, 10);
    headLampGeo.rotateX(Math.PI * 0.5);
    _carCommon = {
      wheelGeo: wheelGeo, guideGeo: guideGeo, axleGeo: axleGeo,
      cushionGeo: cushionGeo, backGeo: backGeo, headrestGeo: headrestGeo,
      lapBarGeo: lapBarGeo, otsrGeo: otsrGeo, headLampGeo: headLampGeo,
      mDark: new THREE.MeshLambertMaterial({ color: 0x25282e }),
      mSteel: new THREE.MeshLambertMaterial({ color: 0x8e98a4 }),
      mSeat: new THREE.MeshLambertMaterial({ color: 0x333840 }),
      mBrass: new THREE.MeshLambertMaterial({ color: 0xd9a83e }),
      mLens: new THREE.MeshBasicMaterial({ color: 0xfff0b8 })
    };
    return _carCommon;
  }
  function getCarTypeRes(typeId) {
    if (_carTypeCache[typeId]) return _carTypeCache[typeId];
    var td = TYPES[typeId] || TYPES.wooden;
    var col = td.colors;
    var r = {
      mBody: new THREE.MeshLambertMaterial({ color: col.car }),
      mAcc: new THREE.MeshLambertMaterial({ color: col.accent }),
      mGlow: new THREE.MeshBasicMaterial({ color: col.accent })
    };
    if (typeId === 'flume') {
      var logPts = [
        new THREE.Vector2(0.01, -0.98), new THREE.Vector2(0.30, -0.92),
        new THREE.Vector2(0.43, -0.55), new THREE.Vector2(0.47, 0.0),
        new THREE.Vector2(0.44, 0.55), new THREE.Vector2(0.31, 0.92),
        new THREE.Vector2(0.01, 0.98)
      ];
      r.logGeo = new THREE.LatheGeometry(logPts, 10);
      r.logGeo.rotateX(Math.PI * 0.5);
      r.logGeo.scale(1.06, 0.90, 1.0);
      r.troughGeo = new THREE.BoxGeometry(0.62, 0.24, 1.32);
      r.bandGeo = new THREE.TorusGeometry(0.45, 0.028, 6, 14);
      r.bandGeo.scale(1.06, 0.90, 1.0);
      r.prowGeo = makeSideExtrudeGeo([[0.76, 0.16], [1.14, 0.24], [1.18, 0.44], [0.76, 0.54]], 0.34, 0.03);
    } else if (typeId === 'mine') {
      r.hullGeo = makeSideExtrudeGeo([[-0.82, 0.16], [0.82, 0.16], [0.94, 0.62], [-0.92, 0.62]], 0.96, 0.04);
      r.rimGeo = new THREE.BoxGeometry(1.12, 0.10, 1.92);
      r.bumperGeo = new THREE.BoxGeometry(1.06, 0.14, 0.16);
      r.prowGeo = makeSideExtrudeGeo([[0.82, 0.14], [1.18, 0.18], [0.96, 0.58], [0.82, 0.58]], 0.90, 0.03);
    } else if (typeId === 'steel') {
      r.hullGeo = makeSideExtrudeGeo([
        [-0.88, 0.18], [0.88, 0.18], [0.92, 0.44], [0.58, 0.56],
        [0.02, 0.46], [-0.52, 0.56], [-0.90, 0.64]
      ], 0.96, 0.05);
      r.trimGeo = new THREE.BoxGeometry(1.08, 0.09, 1.80);
      r.noseGeo = makeSideExtrudeGeo([[0.82, 0.18], [1.30, 0.22], [1.22, 0.38], [0.82, 0.54]], 0.84, 0.04);
    } else if (typeId === 'hyper') {
      r.hullGeo = makeSideExtrudeGeo([
        [-0.90, 0.18], [0.90, 0.18], [0.94, 0.42], [0.56, 0.54],
        [0.0, 0.42], [-0.54, 0.54], [-0.92, 0.62]
      ], 0.98, 0.05);
      r.podGeo = new THREE.BoxGeometry(1.14, 0.14, 1.48);
      var conePts = [
        new THREE.Vector2(0.45, 0.0), new THREE.Vector2(0.40, 0.18),
        new THREE.Vector2(0.28, 0.38), new THREE.Vector2(0.12, 0.54),
        new THREE.Vector2(0.01, 0.60)
      ];
      r.noseGeo = new THREE.LatheGeometry(conePts, 12);
      r.noseGeo.rotateX(Math.PI * 0.5);
      r.noseGeo.scale(1.12, 0.64, 1.0);
      r.finGeo = makeSideExtrudeGeo([[0.65, 0.48], [1.08, 0.72], [0.95, 0.82], [0.52, 0.56]], 0.05, 0.015);
    } else {
      // Wooden & fallback: sculpted vintage rounded coaster tub
      r.hullGeo = makeSideExtrudeGeo([
        [-0.86, 0.18], [0.86, 0.18], [0.90, 0.54], [0.52, 0.58],
        [0.0, 0.46], [-0.52, 0.58], [-0.88, 0.64]
      ], 0.96, 0.05);
      r.trimGeo = new THREE.BoxGeometry(1.08, 0.11, 1.78);
      r.noseGeo = makeSideExtrudeGeo([[0.82, 0.18], [1.14, 0.22], [1.12, 0.48], [0.82, 0.56]], 0.82, 0.05);
      r.bumperGeo = new THREE.TorusGeometry(0.42, 0.04, 6, 12, Math.PI);
      r.bumperGeo.rotateX(Math.PI * 0.5);
    }
    _carTypeCache[typeId] = r;
    return r;
  }

  function addCarMesh(g, geo, mat, x, y, z, rx, ry, rz, shadow) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    if (shadow) m.castShadow = true;
    m.userData.shared = true;
    g.add(m);
    return m;
  }

  function makeCarMesh(typeId, isLead) {
    var C = getCarCommon();
    var R = getCarTypeRes(typeId);
    var g = new THREE.Group();

    if (typeId === 'flume') {
      addCarMesh(g, R.logGeo, R.mBody, 0, 0.34, 0, 0, 0, 0, true);
      addCarMesh(g, R.troughGeo, C.mDark, 0, 0.48, 0);
      [-0.60, 0, 0.60].forEach(function (bz) {
        addCarMesh(g, R.bandGeo, C.mDark, 0, 0.34, bz);
      });
      [0.24, -0.34].forEach(function (rz) {
        addCarMesh(g, C.cushionGeo, C.mSeat, 0, 0.44, rz).scale.set(0.72, 1, 0.85);
        addCarMesh(g, C.lapBarGeo, R.mAcc, 0, 0.56, rz + 0.16, 0.55, 0, 0);
      });
      if (isLead) {
        addCarMesh(g, R.prowGeo, R.mAcc, 0, 0.10, 0, 0, 0, 0, true);
      }
      return g;
    }

    // Rail-hugging wheel bogies (front & rear)
    [-0.56, 0.56].forEach(function (bz) {
      addCarMesh(g, C.axleGeo, C.mDark, 0, 0.16, bz);
      [-0.52, 0.52].forEach(function (wx) {
        addCarMesh(g, C.wheelGeo, C.mSteel, wx, 0.15, bz);
        addCarMesh(g, C.guideGeo, C.mDark, wx * 1.12, 0.12, bz);
      });
    });

    // Sculpted car chassis/shell
    addCarMesh(g, R.hullGeo, R.mBody, 0, 0, 0, 0, 0, 0, true);
    if (typeId === 'mine') {
      addCarMesh(g, R.rimGeo, R.mAcc, 0, 0.62, 0);
      addCarMesh(g, R.bumperGeo, C.mDark, 0, 0.24, -0.94);
      addCarMesh(g, R.bumperGeo, C.mDark, 0, 0.24, 0.94);
    } else if (typeId === 'hyper') {
      addCarMesh(g, R.podGeo, R.mAcc, 0, 0.34, -0.05);
    } else {
      addCarMesh(g, R.trimGeo, R.mAcc, 0, 0.54, 0);
    }

    // Two rows of contoured bucket seats, headrests & restraints
    var useOtsr = (typeId === 'steel' || typeId === 'hyper');
    [0.24, -0.36].forEach(function (rz) {
      addCarMesh(g, C.cushionGeo, C.mSeat, 0, 0.34, rz);
      [-0.22, 0.22].forEach(function (sx) {
        addCarMesh(g, C.backGeo, C.mSeat, sx, 0.54, rz - 0.14, -0.22, 0, 0);
        addCarMesh(g, C.headrestGeo, R.mAcc, sx, 0.76, rz - 0.18, -0.22, 0, 0);
        if (useOtsr) {
          addCarMesh(g, C.otsrGeo, R.mAcc, sx, 0.66, rz + 0.04, 0.38, 0, 0);
        } else {
          addCarMesh(g, C.lapBarGeo, C.mSteel, sx, 0.52, rz + 0.14, 1.05, 0, 0);
        }
      });
    });

    // Lead car sculpted nosecone & headlights
    if (isLead) {
      if (typeId === 'hyper') {
        addCarMesh(g, R.noseGeo, R.mBody, 0, 0.34, 0.84, 0, 0, 0, true);
        addCarMesh(g, C.headLampGeo, R.mGlow, -0.28, 0.36, 1.24);
        addCarMesh(g, C.headLampGeo, R.mGlow, 0.28, 0.36, 1.24);
        addCarMesh(g, R.finGeo, R.mGlow, -0.32, 0, 0);
        addCarMesh(g, R.finGeo, R.mGlow, 0.32, 0, 0);
      } else if (typeId === 'steel') {
        addCarMesh(g, R.noseGeo, R.mAcc, 0, 0, 0, 0, 0, 0, true);
        addCarMesh(g, C.headLampGeo, C.mLens, -0.26, 0.32, 1.24);
        addCarMesh(g, C.headLampGeo, C.mLens, 0.26, 0.32, 1.24);
      } else if (typeId === 'mine') {
        addCarMesh(g, R.prowGeo, C.mDark, 0, 0, 0, 0, 0, 0, true);
        addCarMesh(g, C.headLampGeo, C.mBrass, 0, 0.72, 0.94);
        addCarMesh(g, C.headLampGeo, C.mLens, 0, 0.72, 0.96).scale.set(0.75, 0.75, 1.1);
      } else {
        addCarMesh(g, R.noseGeo, R.mAcc, 0, 0, 0, 0, 0, 0, true);
        addCarMesh(g, R.bumperGeo, C.mSteel, 0, 0.24, 0.98);
        addCarMesh(g, C.headLampGeo, C.mBrass, 0, 0.44, 1.14);
        addCarMesh(g, C.headLampGeo, C.mLens, 0, 0.44, 1.16).scale.set(0.75, 0.75, 1.1);
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

  function updateTrains() {
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
    if (Z.World && Z.World.isStreetView && Z.World.isStreetView()) Z.World.setStreetView(false);
    if (Z.MonoWorld) Z.MonoWorld.followId = 0;
    if (Z.SafariWorld) Z.SafariWorld.followId = 0;
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
    if (Z.MonoWorld) Z.MonoWorld.followId = 0;
    if (Z.SafariWorld) Z.SafariWorld.followId = 0;
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
    updateTrains();
    updateSplashes(dtReal);
  }

  function setOverlay(on) {
    overlayOn = !!on;
    CW.overlayOn = overlayOn;
    ensureAttached();
    rebuildOverlay();
  }

  if (Z.World && Z.World.pan) {
    var opan = Z.World.pan;
    Z.World.pan = function () { followTrainId = 0; return opan.apply(this, arguments); };
  }

  if (Z.bus && Z.bus.on) {
    Z.bus.on('coasterSplash', spawnSplash);
    Z.bus.on('streetview', function (on) { if (on) endRide(); });
    Z.bus.on('monoRide', function (on) { if (on && (typeof on !== 'object' || on.on)) endRide(); });
    Z.bus.on('safariRide', function (on) { if (on && (typeof on !== 'object' || on.on)) endRide(); });
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

  var CW = Z.CoasterWorld = {
    overlayOn: false,
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
