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
  var gHead, gTorso, gShoulder, gNeck, gLeg, gShoe, gArmSeg, gHand, gHair, gCap, gVisor, gSign, gSignBar, gStick;
  function mkProt(k) {
    var g = new THREE.Group(), skin = [0xe3b48c, 0xc58f65, 0x8d5f3d][k % 3], cl = [0xcf4a3a, 0x3a7ec2, 0x5aa04a, 0xd49a2a][k % 4];
    var pantCol = [0x2f3b4c, 0x45423d, 0x29343a][k % 3], hairCol = [0x2a1d14, 0x5c3c22, 0x8a6436, 0x1d1f24][k % 4];
    var mCloth = new THREE.MeshLambertMaterial({ color: cl });
    var mSkin = new THREE.MeshLambertMaterial({ color: skin });
    var mPant = new THREE.MeshLambertMaterial({ color: pantCol });
    var mDark = new THREE.MeshLambertMaterial({ color: 0x24272c });
    // legs & shoes
    for (var s = -1; s <= 1; s += 2) {
      var leg = new THREE.Mesh(gLeg, mPant); leg.position.set(s * 0.085, 0.25, 0); g.add(leg);
      var shoe = new THREE.Mesh(gShoe, mDark); shoe.position.set(s * 0.085, 0.035, 0.025); g.add(shoe);
    }
    // tapered torso, shoulders & neck
    var torso = new THREE.Mesh(gTorso, mCloth); torso.position.y = 0.72; torso.scale.set(1.12, 1, 0.78); g.add(torso);
    var sh = new THREE.Mesh(gShoulder, mCloth); sh.position.y = 0.96; sh.scale.set(1.18, 0.44, 0.80); g.add(sh);
    var neck = new THREE.Mesh(gNeck, mSkin); neck.position.y = 1.03; g.add(neck);
    // head + hair or baseball cap
    var head = new THREE.Mesh(gHead, mSkin); head.position.y = 1.18; g.add(head);
    if (k % 3 === 0) {
      var capMat = new THREE.MeshLambertMaterial({ color: [0x2d6aa0, 0xb83a2e, 0x3b7a48][k % 3] });
      var cap = new THREE.Mesh(gCap, capMat); cap.position.set(0, 1.27, 0); g.add(cap);
      var vis = new THREE.Mesh(gVisor, capMat); vis.position.set(0, 1.23, 0.14); vis.rotation.x = 0.15; g.add(vis);
    } else {
      var hair = new THREE.Mesh(gHair, new THREE.MeshLambertMaterial({ color: hairCol }));
      hair.position.set(0, 1.19, -0.01); hair.rotation.x = -0.18; g.add(hair);
    }
    // left arm (pumping fist)
    var armL = new THREE.Group(); armL.position.set(-0.22, 0.94, 0);
    var uL = new THREE.Mesh(gArmSeg, mCloth); uL.position.set(-0.02, -0.13, 0.03); uL.rotation.set(-0.4, 0, -0.15); armL.add(uL);
    var hL = new THREE.Mesh(gHand, mSkin); hL.position.set(-0.05, -0.25, 0.09); armL.add(hL);
    g.add(armL);
    // right raised arm holding protest placard
    var arm = new THREE.Group(); arm.position.set(0.22, 0.94, 0);
    var uR = new THREE.Mesh(gArmSeg, mCloth); uR.position.set(0.03, 0.14, 0.04); uR.rotation.set(0.25, 0, -0.18); arm.add(uR);
    var hR = new THREE.Mesh(gHand, mSkin); hR.position.set(0.06, 0.28, 0.08); arm.add(hR);
    var st = new THREE.Mesh(gStick, new THREE.MeshLambertMaterial({ color: 0x8a6a42 })); st.position.set(0.06, 0.56, 0.08); arm.add(st);
    var sg = new THREE.Mesh(gSign, new THREE.MeshLambertMaterial({ color: SIGNS[k % SIGNS.length] })); sg.position.set(0.06, 1.08, 0.08); arm.add(sg);
    var sb = new THREE.Mesh(gSignBar, new THREE.MeshLambertMaterial({ color: cl })); sb.position.set(0.06, 1.16, 0.11); arm.add(sb);
    g.add(arm); g.userData.arm = arm; return g;
  }
  function updProt(dt) {
    var want = Math.min(8, Math.round((Z.News && Z.News.protest ? Z.News.protest() : 0)));
    if (want !== protN) {
      protN = want;
      if (!protGroup) {
        protGroup = new THREE.Group(); scene.add(protGroup);
        gHead = new THREE.SphereGeometry(0.15, 10, 8);
        gTorso = new THREE.CylinderGeometry(0.175, 0.125, 0.48, 8);
        gShoulder = new THREE.SphereGeometry(0.165, 8, 5);
        gNeck = new THREE.CylinderGeometry(0.05, 0.058, 0.10, 6);
        gLeg = new THREE.CylinderGeometry(0.066, 0.050, 0.46, 6);
        gShoe = new THREE.BoxGeometry(0.10, 0.07, 0.16);
        gArmSeg = new THREE.CylinderGeometry(0.048, 0.040, 0.30, 6);
        gHand = new THREE.SphereGeometry(0.048, 6, 5);
        gHair = new THREE.SphereGeometry(0.158, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);
        gCap = new THREE.CylinderGeometry(0.135, 0.158, 0.09, 10);
        gVisor = new THREE.BoxGeometry(0.22, 0.025, 0.15);
        gSign = new THREE.BoxGeometry(0.72, 0.50, 0.045);
        gSignBar = new THREE.BoxGeometry(0.56, 0.10, 0.02);
        gStick = new THREE.CylinderGeometry(0.024, 0.024, 1.18, 5);
      }
      while (prot.length > want) protGroup.remove(prot.pop());
      var curN = Z.N || 56, cx = (Math.floor(curN / 2) - 0.5) * T, cz = (curN - 0.5) * T;
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
