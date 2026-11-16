// ===== 45-world-power.js =====
// Power package, world side: sparks when an animal tests a live fence, a translucent coverage overlay for substations and pylons,
// protesters at the gate while the news has an angry story running. Fence wires and lamps are hooked in 40-world.js (Z.Power.fenceLive / lit).
(function () {
  'use strict';
  var PW = Z.PowerWorld = {}, T = Z.TILE, D = Z.DATA, scene = null, sparks = null, spPos, spLife, spVel, SPN = 48, spHead = 0;
  var ring = null, ringKey = '', ringOn = false, prot = [], protGroup = null, protN = -1, protT = 0, covForce = false;

  function ensureScene() {
    if (scene || !Z.World || !Z.World.scene) return !!scene;
    scene = Z.World.scene(); if (!scene || typeof THREE === 'undefined') { scene = null; return false; }
    spPos = new Float32Array(SPN * 3); spLife = new Float32Array(SPN); spVel = new Float32Array(SPN * 3);
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.28, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparks.frustumCulled = false; sparks.renderOrder = 8; sparks.visible = false; scene.add(sparks);
    for (var k = 0; k < SPN; k++) spPos[k * 3 + 1] = -50;
    return true;
  }
  function burst(x, z, live) {
    if (!ensureScene()) return;
    var y = (Z.World.groundY ? Z.World.groundY(x, z) : 0) + (live ? 1.1 : 0.5), n = live ? 9 : 3;
    for (var k = 0; k < n; k++) {
      var s = spHead; spHead = (spHead + 1) % SPN;
      spPos[s * 3] = x + (Math.random() - 0.5) * 0.4; spPos[s * 3 + 1] = y + Math.random() * 0.4; spPos[s * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      spVel[s * 3] = (Math.random() - 0.5) * (live ? 4 : 0.8); spVel[s * 3 + 1] = (live ? 1.5 : 0.4) + Math.random() * 2; spVel[s * 3 + 2] = (Math.random() - 0.5) * (live ? 4 : 0.8);
      spLife[s] = live ? 0.35 + Math.random() * 0.25 : 0.2;
    }
  }
  Z.bus.on('fenceTest', function (e) { if (e && e.x !== undefined) burst(e.x, e.z, !!e.live); });
  Z.bus.on('power', function (e) { if (e && e.tiles !== undefined) ringKey = ''; });
  Z.bus.on('reset', function () { ringKey = ''; protN = -1; });

  PW.setCoverage = function (on) { covForce = !!on; };
  PW.coverageOn = function () { return covForce; };

  function updRing() {
    var want = covForce || (Z.UI && Z.UI.cat === 'power');
    if (!want) { if (ring) ring.visible = false; return; }
    var nodes = Z.Power ? Z.Power.nodes() : [], key = nodes.map(function (n) { return n.id + ':' + (n.alive ? 1 : 0); }).join(',');
    if (ring && key === ringKey) { ring.visible = true; return; }
    ringKey = key;
    if (ring) { scene.remove(ring); ring.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    ring = new THREE.Group();
    nodes.forEach(function (n) {
      var r = n.r * T, col = n.alive ? 0x4fc3f7 : 0xe0574a;
      var disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(n.i * T, 0, n.j * T); disc.position.y = (Z.World.groundY ? Z.World.groundY(n.i * T, n.j * T) : 0) + 0.35; disc.renderOrder = 3;
      var edge, emat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false });
      if (n.alive) edge = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 48), emat);
      else { edge = new THREE.Group(); for (var dk = 0; dk < 14; dk++) edge.add(new THREE.Mesh(new THREE.RingGeometry(r - 0.3, r, 6, 1, dk * Math.PI * 2 / 14, Math.PI * 2 / 14 * 0.5), emat)); }   // dashed fat ring = out of power (not colour alone)
      edge.rotation.x = -Math.PI / 2; edge.position.copy(disc.position); edge.position.y += 0.02; edge.traverse(function (o) { o.renderOrder = 3; });
      ring.add(disc); ring.add(edge);
    });
    scene.add(ring); ring.visible = true;
  }

  // ------------------------------------------------------------------ protesters at the gate
  var SIGNS = [0xf2e6a0, 0xf0b9a8, 0xbfe0f0, 0xd7f0b0];
  var gHead, gBody, gSign, gStick;
  function mkProt(k) {
    var g = new THREE.Group(), skin = [0xe3b48c, 0xc58f65, 0x8d5f3d][k % 3], cl = [0xcf4a3a, 0x3a7ec2, 0x5aa04a, 0xd49a2a][k % 4];
    var body = new THREE.Mesh(gBody, new THREE.MeshLambertMaterial({ color: cl })); body.position.y = 0.55; g.add(body);
    var head = new THREE.Mesh(gHead, new THREE.MeshLambertMaterial({ color: skin })); head.position.y = 1.2; g.add(head);
    var arm = new THREE.Group(); arm.position.set(0.18, 1.0, 0);
    var st = new THREE.Mesh(gStick, new THREE.MeshLambertMaterial({ color: 0x8a6a42 })); st.position.y = 0.45; arm.add(st);
    var sg = new THREE.Mesh(gSign, new THREE.MeshLambertMaterial({ color: SIGNS[k % SIGNS.length] })); sg.position.y = 1.0; arm.add(sg);
    g.add(arm); g.userData.arm = arm; return g;
  }
  function updProt(dt) {
    var want = Math.min(8, Math.round((Z.News && Z.News.protest ? Z.News.protest() : 0)));
    if (want !== protN) {
      protN = want;
      if (!protGroup) {
        protGroup = new THREE.Group(); scene.add(protGroup);
        gHead = new THREE.SphereGeometry(0.17, 8, 6); gBody = new THREE.CylinderGeometry(0.17, 0.22, 0.9, 7);
        gSign = new THREE.BoxGeometry(0.7, 0.5, 0.05); gStick = new THREE.CylinderGeometry(0.025, 0.025, 1.2, 4);
      }
      while (prot.length > want) protGroup.remove(prot.pop());
      var cb = D.power.cable, cx = cb.ci * T, cz = cb.cj * T;
      while (prot.length < want) {
        var k = prot.length, p = mkProt(k), a = (k - 3.5) * 0.55;
        p.position.set(cx + Math.sin(a) * 4.5 + 3, 0, cz - 5 - Math.cos(a) * 1.2 + (k & 1) * 0.8);
        p.position.y = Z.World.groundY ? Z.World.groundY(p.position.x, p.position.z) : 0;
        p.rotation.y = Math.PI; protGroup.add(p); prot.push(p);
      }
    }
    protT += dt;
    for (var q = 0; q < prot.length; q++) { var arm = prot[q].userData.arm; arm.rotation.z = Math.sin(protT * 3 + q * 1.7) * 0.25; prot[q].position.x += Math.sin(protT * 0.8 + q) * 0.002; }
  }

  PW.frame = function (dt) {
    if (!ensureScene()) return;
    if (sparks) {
      var any = false;
      for (var k = 0; k < SPN; k++) {
        if (spLife[k] > 0) {
          spLife[k] -= dt; any = true;
          if (spLife[k] <= 0) { spPos[k * 3 + 1] = -50; continue; }
          spVel[k * 3 + 1] -= 9 * dt; spPos[k * 3] += spVel[k * 3] * dt; spPos[k * 3 + 1] += spVel[k * 3 + 1] * dt; spPos[k * 3 + 2] += spVel[k * 3 + 2] * dt;
        }
      }
      sparks.visible = any; if (any) sparks.geometry.attributes.position.needsUpdate = true;
    }
    try { updRing(); updProt(dt); } catch (e) { }
  };
})();
