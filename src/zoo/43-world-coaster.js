// Wild Acres Zoo — Custom Rollercoaster 3D World Renderer (Zoo Tycoon only)
// Renders themed coaster stations, 3D twin-rail splines (with vertical loops & corkscrews),
// trestle/steel supports, animated coaster trains, water splashes, and first-person Ride Along.
(function () {
  'use strict';
  var Z = window.Z, D = Z && Z.DATA;
  if (!Z || !D || !D.coaster || typeof THREE === 'undefined') return;

  var CD = D.coaster;
  var TYPES = CD.types;
  var TILE = Z.TILE || 2;
  var ELEV_UNIT = Z.ELEV_UNIT || 0.75;

  var grp = null;       // root THREE.Group attached to World.root()
  var trackGrp = null;  // rebuilt when coaster graph ver changes
  var trainGrp = null;  // holds train car groups
  var fxGrp = null;     // splash droplets
  var ovGrp = null;     // overlay tiles
  var builtVer = -1;
  var trainMeshes = {}; // trainId -> { group, cars: [Group], type, count, beacon }
  var splashes = [];    // { mesh, vx, vy, vz, life }
  var rideTrainId = 0;  // first-person ride-along train id
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
    var mRail = new THREE.MeshLambertMaterial({ color: col.rail });
    var mDark = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
    var deckY = CD.stationDeck;

    // 4x2 footprint = 8m (x: -4..4) by 4m (z: -2..2). Front entrance faces +z, track runs along z = -0.9 (row 0)
    // Raised timber/stone foundation platform
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

    // Entrance stairs up to boarding deck
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

    // Roof ridge trim / signage bar
    var ridge = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.22, 0.3), mAcc);
    ridge.position.set(0, deckY + 2.85, -0.8);
    g.add(ridge);

    // Track rails running through station along z = -1.0 (center of back row)
    var railGeo = new THREE.BoxGeometry(8.0, 0.14, 0.12);
    var r1 = new THREE.Mesh(railGeo, mRail); r1.position.set(0, deckY + 0.08, -1.42); g.add(r1);
    var r2 = new THREE.Mesh(railGeo, mRail); r2.position.set(0, deckY + 0.08, -0.58); g.add(r2);

    // Mythical hyper coaster gets glowing corner crystals
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

  // ---- 2. Geometry builder helper for merged rail/support meshes ----
  function makeBufBuilder() {
    var pos = [], nrm = [], col = [];
    function pushQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, r, g, b) {
      // Normal = (B-A) x (C-A)
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
      // Top (+y), Bottom (-y), Right (+x), Left (-x), Front (+z), Back (-z)
      pushQuad(p011[0], p011[1], p011[2], p111[0], p111[1], p111[2], p110[0], p110[1], p110[2], p010[0], p010[1], p010[2], cr, cg, cb);
      pushQuad(p000[0], p000[1], p000[2], p100[0], p100[1], p100[2], p101[0], p101[1], p101[2], p001[0], p001[1], p001[2], cr * 0.7, cg * 0.7, cb * 0.7);
      pushQuad(p101[0], p101[1], p101[2], p100[0], p100[1], p100[2], p110[0], p110[1], p110[2], p111[0], p111[1], p111[2], cr * 0.88, cg * 0.88, cb * 0.88);
      pushQuad(p000[0], p000[1], p000[2], p001[0], p001[1], p001[2], p011[0], p011[1], p011[2], p010[0], p010[1], p010[2], cr * 0.88, cg * 0.88, cb * 0.88);
      pushQuad(p001[0], p001[1], p001[2], p101[0], p101[1], p101[2], p111[0], p111[1], p111[2], p011[0], p011[1], p011[2], cr * 0.92, cg * 0.92, cb * 0.92);
      pushQuad(p100[0], p100[1], p100[2], p000[0], p000[1], p000[2], p010[0], p010[1], p010[2], p110[0], p110[1], p110[2], cr * 0.82, cg * 0.82, cb * 0.82);
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
    return { addBox: addBox, build: build };
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
      var gauge = td.id === 'flume' ? 0.56 : 0.42;

      for (i = 0; i < segs; i++) {
        var j = (i + 1) % n;
        var x0 = L.px[i], y0 = L.py[i], z0 = L.pz[i];
        var x1 = L.px[j], y1 = L.py[j], z1 = L.pz[j];
        var mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5, mz = (z0 + z1) * 0.5;
        var fx = x1 - x0, fy = y1 - y0, fz = z1 - z0;
        var segLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
        if (segLen < 1e-4) continue;
        fx /= segLen; fy /= segLen; fz /= segLen;
        var ux = L.ux[i], uy = L.uy[i], uz = L.uz[i];
        // Right = F x U
        var rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
        var rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;

        var sp = L.sSpec[i];
        var halfL = segLen * 0.54;

        if (td.id === 'flume') {
          // U-shaped water chute
          gb.addBox(mx, my - 0.14, mz, 0.64, 0.08, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, col.tie);
          gb.addBox(mx - rx * 0.58, my + 0.12, mz - rz * 0.58, 0.08, 0.24, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, col.rail);
          gb.addBox(mx + rx * 0.58, my + 0.12, mz + rz * 0.58, 0.08, 0.24, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, col.rail);
          gb.addBox(mx, my + 0.02, mz, 0.5, 0.05, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, sp === 3 ? 0x9ef4ff : 0x45b8e8);
        } else {
          // Twin rails + spine
          var railCol = sp === 2 ? 0x38e8ff : (sp === 4 || sp === 5 ? col.rail : col.rail);
          gb.addBox(mx - rx * gauge, my + 0.06, mz - rz * gauge, 0.07, 0.08, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, railCol);
          gb.addBox(mx + rx * gauge, my + 0.06, mz + rz * gauge, 0.07, 0.08, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, railCol);
          // Central spine beam
          gb.addBox(mx, my - 0.1, mz, 0.14, 0.1, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, col.tie);
          // Cross-ties every sample
          if ((i % 2) === 0) {
            gb.addBox(mx, my - 0.01, mz, gauge + 0.14, 0.04, 0.09, rx, ry, rz, ux, uy, uz, fx, fy, fz, col.tie);
          }
        }
        // Special piece visual accents
        if (sp === 1 && (i % 2) === 0) {
          // Chain lift golden bar down center
          gb.addBox(mx, my + 0.05, mz, 0.06, 0.05, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, 0xf0b840);
        } else if (sp === 2) {
          // Glowing boost strips
          gb.addBox(mx, my + 0.04, mz, 0.22, 0.04, halfL * 0.85, rx, ry, rz, ux, uy, uz, fx, fy, fz, 0x30f2ff);
        } else if (sp === 3 && td.id !== 'flume') {
          // Water splash trough
          gb.addBox(mx, my + 0.02, mz, 0.65, 0.06, halfL, rx, ry, rz, ux, uy, uz, fx, fy, fz, 0x52c8f5);
        }
      }

      // Support pylons
      for (i = 0; i < L.pylons.length; i++) {
        var py = L.pylons[i];
        var ht = py.yTop - py.yBot;
        if (ht <= 0.15) continue;
        var midY = (py.yTop + py.yBot) * 0.5;
        if (td.id === 'wooden' || td.id === 'mine') {
          // Wooden A-frame trestle legs + cross-bracing
          gb.addBox(py.x - 0.42, midY, py.z, 0.11, ht * 0.5, 0.11, 1, 0, 0, 0, 1, 0, 0, 0, 1, col.support);
          gb.addBox(py.x + 0.42, midY, py.z, 0.11, ht * 0.5, 0.11, 1, 0, 0, 0, 1, 0, 0, 0, 1, col.support);
          for (var yb = py.yBot + 1.2; yb < py.yTop - 0.3; yb += 1.6) {
            gb.addBox(py.x, yb, py.z, 0.48, 0.07, 0.08, 1, 0, 0, 0, 1, 0, 0, 0, 1, col.tie);
          }
        } else {
          // Steel / Hyper / Flume single column + footing cap
          gb.addBox(py.x, midY, py.z, 0.18, ht * 0.5, 0.18, 1, 0, 0, 0, 1, 0, 0, 0, 1, col.support);
          gb.addBox(py.x, py.yBot + 0.16, py.z, 0.34, 0.16, 0.34, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0x5c626a);
        }
      }
    }

    // Also render any orphan/unconnected track tiles so players see partial tracks as they build!
    var N = Z.N || 56, rail = s.coasterRail, elev = s.coasterElev;
    var DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0], BIT = [1, 2, 4, 8];
    for (var t = 0; t < rail.length; t++) {
      if (!rail[t]) continue;
      if (X.lineAt && X.lineAt[t] >= 0) continue;
      var ti = t % N, tj = (t - ti) / N;
      var cx = (ti + 0.5) * TILE, cz = (tj + 0.5) * TILE;
      var gy = Z.World && Z.World.groundY ? Z.World.groundY(cx, cz) : 0;
      var y = gy + CD.clearance + (elev[t] || 0) * CD.elevStep;
      // Draw short stub arms for each connected bit
      gb.addBox(cx, y - 0.05, cz, 0.38, 0.08, 0.38, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0x8b6b4a);
      gb.addBox(cx, (y + gy) * 0.5, cz, 0.13, Math.max(0.2, (y - gy) * 0.5), 0.13, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0x7b5c3e);
      for (var d = 0; d < 4; d++) {
        if (rail[t] & BIT[d]) {
          gb.addBox(cx + DX[d] * 0.5, y, cz + DZ[d] * 0.5, d % 2 ? 0.5 : 0.34, 0.08, d % 2 ? 0.34 : 0.5, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0xa87c4f);
        }
      }
    }

    var mesh = gb.build();
    if (mesh) trackGrp.add(mesh);
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
      // Carved log boat
      var log = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 1.85, 8), mBody);
      log.rotation.x = Math.PI * 0.5;
      log.position.y = 0.32;
      log.castShadow = true;
      g.add(log);
      var inner = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.25, 1.35), mDark);
      inner.position.y = 0.44;
      g.add(inner);
    } else {
      // Coaster chassis + side walls + lap bar
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.48, 1.75), mBody);
      body.position.y = 0.32;
      body.castShadow = true;
      g.add(body);
      var trim = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 1.82), mAcc);
      trim.position.y = 0.48;
      g.add(trim);
      var seats = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.26, 1.25), mDark);
      seats.position.y = 0.48;
      g.add(seats);
      if (isLead) {
        // Aerodynamic nose + headlight
        var nose = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.36, 0.45), mAcc);
        nose.position.set(0, 0.3, 1.0);
        g.add(nose);
        if (typeId === 'hyper') {
          // Dragon crest on lead hyper car!
          var mGlow = new THREE.MeshBasicMaterial({ color: col.accent });
          var hornL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 5), mGlow);
          hornL.position.set(-0.28, 0.72, 0.85); hornL.rotation.x = -0.35; g.add(hornL);
          var hornR = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 5), mGlow);
          hornR.position.set(0.28, 0.72, 0.85); hornR.rotation.x = -0.35; g.add(hornR);
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
        // Breakdown warning beacon on lead car
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
      var ready = !!(info && info.line && info.line.ready);
      rec.group.visible = ready;
      if (!ready) continue;
      rec.beacon.visible = (info.state === 'broken') && blink;
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

  // ---- 5. Overlay ----
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
      var hCol = spec[t] >= 4 ? 0xd84dff : spec[t] === 2 ? 0x30f2ff : spec[t] === 3 ? 0x45b8e8 : (elev[t] > 0 ? 0xffb84d : 0x56d97e);
      gb.addBox(cx, gy, cz, 0.85, 0.03, 0.85, 1, 0, 0, 0, 1, 0, 0, 0, 1, hCol);
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
    trainGrp = new THREE.Group();
    fxGrp = new THREE.Group();
    ovGrp = new THREE.Group();
    grp.add(trackGrp); grp.add(trainGrp); grp.add(fxGrp); grp.add(ovGrp);
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
