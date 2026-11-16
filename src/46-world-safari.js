// ===== 46-world-safari.js =====
// Safari package, world side: vehicles (trucks, boats, balloons), airlock gates with sliding doors, portal booms, route decals / buoys, overlay, route ghost,
// follow camera and ride-along, picking of vehicles and wild visitors.  Hooks in 40-world.js: animals() (wild visitors join the entity list), svY (ride-along floor), fence style 'gate'.
(function () {
  'use strict';
  var N = Z.N, T = Z.TILE, NN = N * N, D = Z.DATA, PI = Math.PI, TAU = PI * 2, SEA_Y = -0.1;
  var SW = Z.SafariWorld = { rideId: 0, followId: 0, overlayOn: false };
  var SM = Z.Models && Z.Models.safari;
  var scene = null, VM = {}, GM = {}, PM = {}, builtVer = -1, routeGrp = null, ovMesh = null, ghostMesh = null, ghostSig = '', ovDirty = true, t0 = 0;
  function S() { return Z.state; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function GB() { this.p = []; this.c = []; }
  GB.prototype.tri = function (a, b, c, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); var r = (col >> 16 & 255) / 255, g = (col >> 8 & 255) / 255, bl = (col & 255) / 255; for (var k = 0; k < 3; k++) this.c.push(r, g, bl); };
  GB.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  GB.prototype.geo = function () { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3)); g.computeVertexNormals(); g.computeBoundingSphere(); return g; };
  var _ovMat = null, _routeMat = null, _ghostMat = null;

  // ---- wild visitors join the animal list the entity pass walks (no allocation unless there are any)
  var _all = [];
  SW.animals = function (arr) {
    var W = Z.Safari && Z.Safari.wildList(); if (!W || !W.length) return arr;
    _all.length = 0; for (var k = 0; k < arr.length; k++) _all.push(arr[k]); for (k = 0; k < W.length; k++) _all.push(W[k]); return _all;
  };

  // ---- vehicles
  function makeVeh(v) {
    var g = new THREE.Group(), li = (v.id - 1) % 4, body = v.kind === 'sea' ? SM.boat(li) : v.kind === 'air' ? SM.balloon(li) : SM.truck(li);
    g.add(body); g.userData.body = body; scene.add(g); return g;
  }
  var _pz = { x: 0, y: 0, z: 0, h: 0 };
  function updateVehicles(dt) {
    var SA = Z.Safari, s = S(); if (!SA || !s || !s.safari || !SM) { for (var i0 in VM) { scene.remove(VM[i0]); delete VM[i0]; } return; }
    var seen = {}, gy = Z.World.groundY;
    s.safari.veh.forEach(function (v) {
      var p = SA.pose(v.id); if (!p) return; seen[v.id] = 1;
      var g = VM[v.id]; if (!g) g = VM[v.id] = makeVeh(v);
      g.userData.body.visible = SW.rideId !== v.id;      // the ride-along camera sits inside the vehicle: hide its own shell
      g.position.set(p.x, p.y, p.z); g.rotation.y = p.h; g.rotation.order = 'YXZ';
      if (v.kind === 'land') { var fx = Math.sin(p.h) * 1.6, fz = Math.cos(p.h) * 1.6, yF = gy(p.x + fx, p.z + fz), yR = gy(p.x - fx, p.z - fz); g.position.y = (yF + yR) / 2; g.rotation.x = -Math.atan2(yF - yR, 3.2) * 0.9; g.rotation.z = Math.sin(t0 * 9 + v.id) * 0.006 * Math.min(1, p.v); }
      else if (v.kind === 'sea') { g.position.y = SEA_Y + 0.08 + Math.sin(t0 * 1.6 + v.id) * 0.05; g.rotation.x = Math.sin(t0 * 1.1 + v.id) * 0.03; g.rotation.z = Math.sin(t0 * 0.9 + v.id * 2) * 0.04; }
      else { g.rotation.x = 0; g.rotation.z = Math.sin(t0 * 0.6 + v.id) * 0.03; }
    });
    for (var id in VM) if (!seen[id]) { scene.remove(VM[id]); delete VM[id]; }
  }

  // ---- gates
  function makeGate(gt) {
    var g = new THREE.Group(), kind = gt.kind;
    var roof = SM.gateRoof(kind); g.add(roof);
    var lo = SM.gateLeaf(kind), li = SM.gateLeaf(kind); lo.position.z = -2.0; li.position.z = 2.0; g.add(lo); g.add(li);
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { var p = SM.gatePost(kind); p.position.set(sx * 1.85, 0, sz * 2.0); g.add(p); }); });
    g.userData.lo = lo; g.userData.li = li; scene.add(g); return g;
  }
  function updateGates() {
    var SA = Z.Safari; if (!SA || !SM) return;
    var list = SA.gates(), seen = {}, gy = Z.World.groundY;
    list.forEach(function (gt) {
      seen[gt.key] = 1; var g = GM[gt.key]; if (!g) g = GM[gt.key] = makeGate(gt);
      var gs = SA.gateState(gt.key) || { out: 0, 'in': 0 };
      var yy = gy(gt.cx, gt.cz); g.position.set(gt.cx, yy, gt.cz); g.rotation.y = gt.ang;
      g.userData.lo.position.x = gs.out * 3.3; g.userData.li.position.x = -gs['in'] * 3.3;
    });
    for (var k in GM) if (!seen[k]) { scene.remove(GM[k]); delete GM[k]; }
    // portal booms
    var ports = SA.portals(), pseen = {};
    ports.forEach(function (p) {
      pseen[p.id] = 1; var m = PM[p.id]; if (!m) { m = PM[p.id] = SM.boom(); m.scale.z = 0.55; scene.add(m); }
      var o = p.o, gs = SA.gateState('p' + p.id) || { out: 0 }, rot = (o.rot | 0) & 3, ang = rot * PI / 2, ox = -0.0, oz = -0.9;
      var cs = Math.cos(ang), sn = Math.sin(ang), wx = p.x + cs * ox + sn * oz, wz = p.z - sn * ox + cs * oz;
      m.position.set(wx, gy(p.x, p.z) + 1.0, wz); m.rotation.order = 'YXZ'; m.rotation.y = ang; m.rotation.x = -gs.out * PI * 0.48;
    });
    for (var q in PM) if (!pseen[q]) { scene.remove(PM[q]); delete PM[q]; }
  }

  // ---- route decals: dirt track, buoys, balloon flight line
  function buildRoutes() {
    if (routeGrp) { scene.remove(routeGrp); routeGrp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); routeGrp = null; }
    var SA = Z.Safari, s = S(); if (!SA || !s || !s.safari) return;
    var gb = new GB(), gy = Z.World.groundY, any = false;
    s.safari.routes.forEach(function (r) {
      var P = SA.route(r.id); if (!P || !P.ok) return; any = true;
      var pts = P.pts, n = pts.length, k;
      if (P.kind === 'land') {
        for (k = 0; k < n; k++) {
          var a = pts[k], b = pts[(k + 1) % n], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, rx = dz / l, rz = -dx / l;
          var ya = gy(a.x, a.z) + 0.07, yb = gy(b.x, b.z) + 0.07, w = 1.15, tint = ((k * 7) % 5) * 0.012;
          gb.quad([a.x - rx * w, ya, a.z - rz * w], [a.x + rx * w, ya, a.z + rz * w], [b.x + rx * w, yb, b.z + rz * w], [b.x - rx * w, yb, b.z - rz * w], tint > 0.03 ? 0x9b7d52 : 0xa4865a);
          var w2 = 0.18; for (var sgn = -1; sgn <= 1; sgn += 2) { var cx = sgn * 0.5; gb.quad([a.x + rx * (cx - w2), ya + 0.012, a.z + rz * (cx - w2)], [a.x + rx * (cx + w2), ya + 0.012, a.z + rz * (cx + w2)], [b.x + rx * (cx + w2), yb + 0.012, b.z + rz * (cx + w2)], [b.x + rx * (cx - w2), yb + 0.012, b.z + rz * (cx - w2)], 0x7d6342); }
        }
      } else if (P.kind === 'sea') {
        var acc = 0;
        for (k = 0; k < n; k++) {
          var a2 = pts[k], b2 = pts[(k + 1) % n], seg = Math.hypot(b2.x - a2.x, b2.z - a2.z); acc += seg;
          if (acc < 4.5) continue; acc = 0;
          var dx2 = b2.x - a2.x, dz2 = b2.z - a2.z, l2 = Math.hypot(dx2, dz2) || 1, side = (k & 1) ? 1 : -1, bx = a2.x + dz2 / l2 * 1.6 * side, bz = a2.z - dx2 / l2 * 1.6 * side, col = (k & 1) ? 0xe8402e : 0xf4f1e6, h = 0.34;
          gb.quad([bx - 0.2, SEA_Y, bz], [bx + 0.2, SEA_Y, bz], [bx + 0.15, SEA_Y + h, bz], [bx - 0.15, SEA_Y + h, bz], col); gb.quad([bx, SEA_Y, bz - 0.2], [bx, SEA_Y, bz + 0.2], [bx, SEA_Y + h, bz + 0.15], [bx, SEA_Y + h, bz - 0.15], col);
          gb.quad([bx - 0.12, SEA_Y + h, bz - 0.12], [bx + 0.12, SEA_Y + h, bz - 0.12], [bx + 0.12, SEA_Y + h, bz + 0.12], [bx - 0.12, SEA_Y + h, bz + 0.12], 0xffd24a);
        }
      } else {
        for (k = 0; k < n; k += 2) { var a3 = pts[k], b3 = pts[(k + 1) % n], ya3 = gy(a3.x, a3.z) + 7.5; gb.quad([a3.x - 0.08, ya3, a3.z], [a3.x + 0.08, ya3, a3.z], [b3.x + 0.08, ya3, b3.z], [b3.x - 0.08, ya3, b3.z], 0xffd24a); }
      }
    });
    if (!any) return;
    if (!_routeMat) _routeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    routeGrp = new THREE.Mesh(gb.geo(), _routeMat); routeGrp.frustumCulled = false; routeGrp.renderOrder = 1; scene.add(routeGrp);
  }

  // ---- overlay: zones (connected / closed / unpowered), corridor markers, gates; ghost for the route tool
  SW.setOverlay = function (on) { SW.overlayOn = !!on; ovDirty = true; if (ovMesh) ovMesh.visible = SW.overlayOn; };
  function buildOverlay() {
    if (ovMesh) { scene.remove(ovMesh); ovMesh.geometry.dispose(); ovMesh = null; }
    var SA = Z.Safari, s = S(); if (!SW.overlayOn || !SA || !s) return;
    var gb = new GB(), gy = Z.World.groundY;
    function tile(t, col, ins, dy) { var i = t % N, j = (t - i) / N, x0 = i * T + ins, z0 = j * T + ins, x1 = (i + 1) * T - ins, z1 = (j + 1) * T - ins, y = Math.max(gy(x0, z0), gy(x1, z0), gy(x0, z1), gy(x1, z1), 0.05) + dy; gb.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], col); }
    function gyAt(t) { var i = t % N, j = (t - i) / N; return Math.max(gy(i * T, j * T), gy((i + 1) * T, j * T), gy(i * T, (j + 1) * T), gy((i + 1) * T, (j + 1) * T), 0.05); }
    SA.zones().forEach(function (z) {
      var pw = SA.zoneInfo(z.id).powered, col = !z.eligible ? 0x8aa0aa : (z.connected ? (pw ? 0x6ed99a : 0xe8a23a) : 0xb0b6ba);
      z.enc.tiles.forEach(function (t) { tile(t, col, 0.1, 0.1); if (Z.OvPat && !(z.eligible && z.connected && pw)) Z.OvPat.mark(gb, t, z.eligible && z.connected ? 'dots' : 'diag', 0.1 + gyAt(t)); });   // pattern as well as colour: dots = no power, slash = not connected / not eligible
      z.exits.forEach(function (t) { if (z.connected) tile(t, 0xf5d36a, 0.55, 0.12); });
      if (z.marker) { tile(z.marker.t, 0xff7a3a, 0.25, 0.16); if (Z.OvPat) Z.OvPat.mark(gb, z.marker.t, 'ring', 0.16 + gyAt(z.marker.t)); }
    });
    SA.gates().forEach(function (g) { if (g.inside >= 0) tile(g.inside, 0x3ab5e8, 0.3, 0.16); if (g.outside >= 0) tile(g.outside, 0x3ab5e8, 0.3, 0.16); });
    s.safari.routes.forEach(function (r) { var P = SA.route(r.id); r.tiles.forEach(function (t) { tile(t, P && P.ok ? 0x46e08a : 0xe0614a, 0.45, 0.14); if (Z.OvPat && !(P && P.ok)) Z.OvPat.mark(gb, t, 'x', 0.14 + gyAt(t)); }); });
    if (!gb.p.length) return;
    if (!_ovMat) _ovMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
    ovMesh = new THREE.Mesh(gb.geo(), _ovMat); ovMesh.frustumCulled = false; ovMesh.renderOrder = 5; scene.add(ovMesh);
  }
  SW.setGhost = function (plan) {
    if (!scene) { try { scene = Z.World.scene(); } catch (e) { return; } }
    var sig = plan && plan.ghost ? (plan.ok ? 'o' : 'x') + plan.ghost.tiles.join(',') : '';
    if (sig === ghostSig) return; ghostSig = sig;
    if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.geometry.dispose(); ghostMesh = null; }
    if (!plan || !plan.ghost || !plan.ghost.tiles.length) return;
    var gb = new GB(), gy = Z.World.groundY, col = plan.ok ? 0x46e08a : (plan.partial ? 0xe8c23a : 0xe0614a);
    plan.ghost.tiles.forEach(function (t) { var i = t % N, j = (t - i) / N, x0 = i * T + 0.3, z0 = j * T + 0.3, x1 = (i + 1) * T - 0.3, z1 = (j + 1) * T - 0.3, y = Math.max(gy((x0 + x1) / 2, (z0 + z1) / 2), -0.05) + 0.2; gb.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], col); });
    if (!_ghostMat) _ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    ghostMesh = new THREE.Mesh(gb.geo(), _ghostMat); ghostMesh.frustumCulled = false; ghostMesh.renderOrder = 6; scene.add(ghostMesh);
  };
  SW.clearGhost = function () { SW.setGhost(null); };

  // ---- camera: follow and ride along
  var ridePrevH = null, _rideY = 0;
  SW.follow = function (id) { SW.followId = id || 0; var p = id && Z.Safari.pose(id); if (p && Z.World.focus) { try { Z.World.focus(p.x, p.z, 26); } catch (e) { } } };
  SW.rideAlong = function (id) {
    var p = Z.Safari && Z.Safari.pose(id); if (!p) return false;
    SW.followId = 0; SW.rideId = id; ridePrevH = null;
    var fx = p.x + Math.sin(p.h) * 0.5, fz = p.z + Math.cos(p.h) * 0.5;
    Z.World.setStreetView(true, fx, fz, p.h); Z.World.svJump(fx, fz, fx + Math.sin(p.h) * 10, fz + Math.cos(p.h) * 10);
    Z.bus.emit('safariRide', { id: id, on: true }); return true;
  };
  SW.endRide = function () { if (!SW.rideId) return; SW.rideId = 0; ridePrevH = null; if (Z.World.isStreetView()) Z.World.setStreetView(false); Z.bus.emit('safariRide', { id: 0, on: false }); };
  SW.svY = function () { return SW.rideId ? _rideY : null; };
  Z.bus.on('streetview', function (on) { if (!on && SW.rideId) { SW.rideId = 0; ridePrevH = null; Z.bus.emit('safariRide', { id: 0, on: false }); } });
  function updateCamera() {
    var W = Z.World;
    if (SW.rideId) {
      var p = Z.Safari.pose(SW.rideId); if (!p || !W.isStreetView()) { SW.endRide(); return; }
      var fx = p.x + Math.sin(p.h) * 0.5, fz = p.z + Math.cos(p.h) * 0.5; _rideY = p.y + (p.kind === 'air' ? 0.05 : 0.15) - 0.5 + (p.kind === 'land' ? 0.3 : p.kind === 'sea' ? 0.2 : 0);
      W.svJump(fx, fz);
      if (ridePrevH !== null) { var dy = p.h - ridePrevH; while (dy > PI) dy -= TAU; while (dy < -PI) dy += TAU; if (dy) W.svLook(dy, 0); }
      ridePrevH = p.h;
    } else if (SW.followId) { var p1 = Z.Safari.pose(SW.followId); if (!p1) { SW.followId = 0; return; } if (W.focus) W.focus(p1.x, p1.z); }
  }

  function frame(dt) {
    if (!scene) { try { scene = Z.World.scene(); } catch (e) { scene = null; } if (!scene) return; }
    var SA = Z.Safari; if (!SA) return; t0 += dt || 0.016;
    if (SA.version() !== builtVer) { builtVer = SA.version(); buildRoutes(); ovDirty = true; }
    if (ovDirty && (SW.overlayOn || ovMesh)) { ovDirty = false; buildOverlay(); } else ovDirty = false;
    updateVehicles(dt); updateGates(); updateCamera();
  }
  function resetAll() { builtVer = -1; ovDirty = true; for (var id in VM) { scene && scene.remove(VM[id]); delete VM[id]; } for (var k in GM) { scene && scene.remove(GM[k]); delete GM[k]; } for (var q in PM) { scene && scene.remove(PM[q]); delete PM[q]; } SW.rideId = 0; SW.followId = 0; ghostSig = ''; }
  Z.bus.on('reset', resetAll); Z.bus.on('safari', function () { ovDirty = true; }); Z.bus.on('enclosures', function () { ovDirty = true; }); Z.bus.on('fence', function () { ovDirty = true; });
  if (Z.World && Z.World.frame) { var ofr = Z.World.frame; Z.World.frame = function (dt) { try { frame(dt); } catch (e) { if (!SW._err) { SW._err = 1; console.error('safari world', e); } } return ofr.apply(this, arguments); }; }
  if (Z.World && Z.World.pickEntity) {
    var opick = Z.World.pickEntity;
    Z.World.pickEntity = function (cx, cy) {
      var hit = opick.apply(this, arguments), s = S(), SA = Z.Safari;
      if (!SA || !s || !s.safari) return hit;
      if (hit && hit.kind === 'guest') { var g = null; for (var q = 0; q < s.guests.length; q++) if (s.guests[q].id === hit.id) { g = s.guests[q]; break; } if (g && g.state === 'ride' && g.sfv) return { kind: 'safari_veh', id: g.sfv }; }
      if (hit && hit.kind === 'animal' && hit.id >= 1000000) return { kind: 'wild', id: hit.id };
      if (hit && hit.kind !== 'object' && hit.kind !== 'enclosure') return hit;
      var best = null, bd = (('ontouchstart' in window) ? 46 : 30);
      s.safari.veh.forEach(function (v) { var p = SA.pose(v.id); if (!p) return; var pr = Z.World.project(p.x, p.y + 1.2, p.z); if (!pr.vis) return; var d = Math.hypot(pr.x - cx, pr.y - cy); if (d < bd) { bd = d; best = { kind: 'safari_veh', id: v.id }; } });
      return best || hit;
    };
  }
  if (Z.World && Z.World.setPreview) {
    var osp = Z.World.setPreview;
    Z.World.setPreview = function (spec) {
      if (spec && spec.type === 'safari') { SW.setGhost(spec.plan); return osp.call(this, null); }
      if (ghostSig) SW.clearGhost();
      return osp.apply(this, arguments);
    };
  }
  if (Z.World && Z.World.pan) { var opan = Z.World.pan; Z.World.pan = function () { SW.followId = 0; return opan.apply(this, arguments); }; }
  SW.info = function () { return { veh: Object.keys(VM).length, gates: Object.keys(GM).length, routes: !!routeGrp, ride: SW.rideId, follow: SW.followId }; };
})();
