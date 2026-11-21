// ===== 32-models-mods.js =====
// DNA package, render side: the `mods` hook. Wraps Z.Models.createAnimal so that
//   * donor-gene traits (Z.DATA.traits[].look, carried by the animal as ent.traits) and
//   * hybrid species (Z.DATA.animals[].look = {base, partner, seed})
// change how a model LOOKS without touching the species models. It never edits 30/31-models.
//
// createAnimal(id, { baby, sex, traits:[traitIds], seed, mods })  - `mods` can also be passed in directly:
//   mods = { tint:[r,g,b]   multiplies the vertex colours (palette shift; >1 brightens)
//            shift:1        chameleon: the tint cycles slowly through hues
//            glow:[r,g,b], glowK  bioluminescent patches, strength follows the night (glowK = daytime floor 0..1)
//            scale          overall size multiplier
//            crest|fan|frill|sail|spikes|spots|shell|ears : 1   add-on parts (adults only), attached to the head or the back
//          }
// Add-ons are built in rig units (units of the species hip height) from the real body profile, so they fit any dinosaur; models without a rig
// (marine reptiles, pterosaurs, modern animals) get them from their bounding box.
(function () {
  'use strict';
  var M = Z.Models; if (!M || !M.kit) return;
  var Kt = M.kit, T = Kt.T, B = Kt.B, mesh = Kt.mesh, grp = Kt.grp, profAt = Kt.profAt, clamp = Kt.clamp, mixHex = Kt.mixHex, shade = Kt.shade;
  var D = Z.DATA, PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
  var orig = M.createAnimal, origIds = M.speciesIds;

  function sp(id) { for (var k = 0; k < D.animals.length; k++) if (D.animals[k].id === id) return D.animals[k]; return null; }
  function trait(id) { for (var k = 0; k < D.traits.length; k++) if (D.traits[k].id === id) return D.traits[k]; return null; }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function night() {   // same curve as the world's sky: 0 by day .. 1 in full dark
    var s = Z.state; if (!s || typeof s.time !== 'number') return 0;
    var t = s.time - Math.floor(s.time), e = sin((t - 0.25) * TAU), u = clamp((e + 0.22) / 0.26, 0, 1);
    return 1 - u * u * (3 - 2 * u);
  }

  // ---- average colour of a species model (cached): used to blend a hybrid's palette
  var colCache = {};
  function speciesColour(id) {
    if (colCache[id]) return colCache[id];
    var c = [0.55, 0.5, 0.4];
    try {
      var a = orig(id, { sex: 'm' }), best = null, bc = 0;
      a.group.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.attributes.color && o.geometry.attributes.position.count > bc) { bc = o.geometry.attributes.position.count; best = o; } });
      if (best) { var ca = best.geometry.attributes.color, n = ca.count, st = max(1, (n / 64) | 0), r = 0, g = 0, b = 0, k = 0; for (var i = 0; i < n; i += st) { r += ca.getX(i); g += ca.getY(i); b += ca.getZ(i); k++; } c = [r / k, g / k, b / k]; }
    } catch (e) { }
    return (colCache[id] = c);
  }

  // ---- mods for an animal: hybrid look + gene looks
  function hybridMods(def) {
    var L = def.look, h = L.seed >>> 0, base = sp(L.base), par = sp(L.partner), m = {}, cb = speciesColour(L.base), cp = speciesColour(L.partner);
    m.tint = [0, 1, 2].map(function (i) { return clamp(1 + (cp[i] / max(0.05, cb[i]) - 1) * 0.55, 0.6, 1.5); });
    var o = h % 4; m[['crest', 'frill', 'spikes', 'sail'][o]] = 1;
    if ((h >> 3) % 3 === 0) m.spots = 1;
    if (base && par && base.size) m.scale = clamp(1 + (par.size / base.size - 1) * 0.35, 0.82, 1.25);
    m.col = mixHex(0xc8603a, 0x3a8a8a, ((h >> 5) % 100) / 100);   // ornament colour
    return m;
  }
  function geneMods(traits, m) {
    for (var k = 0; k < traits.length; k++) {
      var t = trait(traits[k]), L = t && t.look; if (!L) continue;
      for (var key in L) {
        if (key === 'tint') m.tint = m.tint ? m.tint.map(function (v, i) { return clamp(v * L.tint[i], 0.5, 1.8); }) : L.tint.slice();
        else if (key === 'scale') m.scale = (m.scale || 1) * L.scale;
        else if (key === 'glow') { m.glow = L.glow; m.glowK = L.glowK === undefined ? 0.2 : L.glowK; }
        else m[key] = L[key];
      }
    }
    return m;
  }
  M.modsFor = function (speciesId, traits) {
    var s = sp(speciesId), m = s && s.hybrid && s.look ? hybridMods(s) : {};
    if (traits && traits.length) geneMods(traits, m);
    return Object.keys(m).length ? m : null;
  };

  // ---- anchors: where the add-ons go. u = unit scale of the build coordinates (1 for dinosaur rigs and 31-models-extra rigs)
  function headAnchor(headGrp, S) {
    if (S.head && S.head.len) {
      var hl0 = S.head.len;
      return { hl: hl0, headTop: hl0 * 0.27, headZ: hl0 * 0.12 };
    }
    var hm = headGrp.children && headGrp.children[0];
    if (hm && hm.geometry) {
      if (!hm.geometry.boundingBox) hm.geometry.computeBoundingBox();
      var hb = hm.geometry.boundingBox;
      if (hb) {
        var hH = max(0.05, hb.max.y - hb.min.y), hW = max(0.04, hb.max.x - hb.min.x), hL = max(0.05, hb.max.z - hb.min.z);
        var hl = clamp(max(hH, hW) * 1.65, 0.14, 1.0);
        return { hl: hl, headTop: hb.max.y * 0.88, headZ: hb.min.z + min(hL, hl * 0.9) * 0.32 };
      }
    }
    return { hl: 0.4, headTop: 0.11, headZ: 0.05 };
  }
  function anchors(a) {
    var I = a._I;
    if (I && I.S && I.S.body && I.body && I.head) {
      var S = I.S, K = S.body.keys, z0 = K[0][0], z1 = K[K.length - 1][0], ha = headAnchor(I.head, S);
      return { u: 1, body: I.body, head: I.head, z0: z0, z1: z1, prof: function (z) { return profAt(K, clamp(z, z0, z1)); }, hl: ha.hl, headTop: ha.headTop, headZ: ha.headZ };
    }
    if (I && I.S && I.S.body && I.bank && I.head) {
      var Sp = I.S, Kp = Sp.body.keys, zp0 = Kp[0][0], zp1 = Kp[Kp.length - 1][0], hap = headAnchor(I.head, Sp);
      return { u: 1, body: I.bank, head: I.head, z0: zp0, z1: zp1, prof: function (z) { return profAt(Kp, clamp(z, zp0, zp1)); }, hl: hap.hl, headTop: hap.headTop, headZ: hap.headZ };
    }
    if (I && I.S && I.S.keys && I.segs && I.segs.length) {
      var Ss = I.S, Ks = Ss.keys, zTail = Ks[0][0], zNose = Ks[Ks.length - 1][0], p0 = Ss.cuts[0];
      var zMinW = Ss.cuts[1] !== undefined ? Ss.cuts[1] : zTail, zMaxW = zTail + (zNose - zTail) * 0.65;
      if (zMaxW < p0 + 0.1) zMaxW = p0 + (zNose - p0) * 0.45;
      var hz = p0 + (zNose - p0) * 0.58, prH = profAt(Ks, hz), hls = clamp(prH[1] * 2.4, 0.14, 1.0);
      return { u: 1, body: I.segs[0], head: I.segs[0], z0: zMinW - p0, z1: zMaxW - p0, prof: function (z) { return profAt(Ks, clamp(z + p0, zTail, zNose)); }, hl: hls, headTop: prH[2] + prH[1] * 0.92, headZ: hz - p0 };
    }
    var bb = new T.Box3().setFromObject(a.group), sz = new T.Vector3(); bb.getSize(sz);
    var u = max(0.1, sz.y), len = sz.z / u, cz = (bb.min.z + bb.max.z) / 2 / u, top = bb.max.y / u * 0.82, wid = sz.x / u * 0.4;
    return { u: u, body: a.group, head: a.group, z0: cz - len * 0.38, z1: cz + len * 0.38, prof: function () { return [wid, top * 0.3, top * 0.55]; }, hl: len * 0.25, headTop: top * 0.9, headZ: cz + len * 0.38 };
  }
  function topY(an, z) { var p = an.prof(z); return p[2] + p[1]; }

  // ---- add-on builders (return nothing; they draw into the builders gb (body) / gh (head))
  function build(an, m, rr) {
    var gb = B(), gh = B(), L = max(0.15, an.z1 - an.z0), fL = clamp(L, 0.25, 2.2), f = clamp(an.hl / 0.4, 0.3, 2.5), col = m.col || 0xc8603a, i, k, z, p, a;
    var hasB = false, hasH = false;
    if (m.fan) {   // peacock tail fan: layered beveled feather blades with ocellus eye-spots
      var y0 = topY(an, an.z0 + L * 0.12) * 0.8, Lf = clamp(L * 0.52, 0.22, 0.95), zf = an.z0 + L * 0.06, bw = Lf * 0.14;
      for (i = 0; i < 11; i++) {
        a = (i / 10 - 0.5) * 2.25;
        var tx = sin(a) * Lf, ty = y0 + cos(a) * Lf * 0.92, tz = zf - 0.08 * fL - Math.abs(a) * 0.04 * fL;
        var mx = tx * 0.5, my = y0 + (ty - y0) * 0.5, mz = (zf + tz) * 0.5;
        var bCol = i % 2 ? 0x1f8f7a : 0x2aa08a;
        gb.extrude([[0, -Lf * 0.48], [bw * 0.6, -Lf * 0.1], [bw, Lf * 0.34], [0, Lf * 0.52], [-bw, Lf * 0.34], [-bw * 0.6, -Lf * 0.1]], 0.01 * fL, mx, my, mz, [0.12, 0, -a], bCol, { axis: 'z', bev: 0.0025 * fL, taper: 0.85 });
        gb.sph(0.044 * fL, 0.056 * fL, 0.014 * fL, tx, ty, tz, 0xe8b030, { rot: [0, 0, -a], s: [7, 5] });
        gb.sph(0.030 * fL, 0.038 * fL, 0.017 * fL, tx, ty, tz - 0.004 * fL, 0x20a878, { rot: [0, 0, -a], s: [6, 4] });
        gb.sph(0.020 * fL, 0.026 * fL, 0.02 * fL, tx, ty, tz - 0.007 * fL, 0x1b3b8f, { rot: [0, 0, -a], s: [6, 4] });
      }
      hasB = true;
    }
    if (m.sail) {   // contoured curved neural-spined dorsal fin
      var poly = [], zS, topPts = [], botPts = [], nS = 8;
      for (i = 0; i < nS; i++) {
        var u = i / (nS - 1); zS = an.z0 + L * (0.14 + 0.70 * u); p = an.prof(zS);
        var hh = 0.16 * fL * (0.35 + 0.65 * sin(PI * u)), yb = p[2] + p[1] * 0.78, yt = p[2] + p[1] + hh;
        botPts.push([yb, zS]); topPts.push([yt, zS]);
      }
      for (i = 0; i < nS; i++) poly.push(topPts[i]);
      for (i = nS - 1; i >= 0; i--) poly.push(botPts[i]);
      gb.extrude(poly, 0.016 * fL, 0, 0, 0, [0, 0, 0], shade(col, 0.92), { axis: 'x', bev: 0.004 * fL });
      for (i = 0; i < nS; i++) {
        gb.tube([[0, botPts[i][0], botPts[i][1]], [0, topPts[i][0] + 0.012 * fL, topPts[i][1] - 0.018 * fL]], [0.011 * fL, 0.003 * fL], i % 2 ? col : shade(col, 1.25), { seg: 5, cap0: true, cap1: true });
      }
      hasB = true;
    }
    if (m.spikes) {
      for (i = 0; i < 10; i++) {
        z = an.z0 + L * (0.1 + 0.8 * i / 9); p = an.prof(z);
        var sh = 0.055 * (0.6 + 0.4 * sin(PI * i / 9)) * fL;
        gb.tube([[0, p[2] + p[1] * 0.88, z], [0, p[2] + p[1] + sh * 0.6, z - sh * 0.15], [0, p[2] + p[1] + sh, z - sh * 0.35]], [0.014 * fL, 0.008 * fL, 0.002 * fL], 0x4a4630, { seg: 5, steps: 2, cap0: true, cap1: true });
      }
      hasB = true;
    }
    if (m.spots) {
      for (i = 0; i < 20; i++) { z = an.z0 + L * (0.08 + 0.84 * rr()); p = an.prof(z); a = (rr() - 0.5) * 2.6; var sr = (0.018 + 0.015 * rr()) * clamp(L, 0.4, 1.6); gb.sph(sr, sr, sr * 0.5, p[0] * sin(a) * 1.02, p[2] + p[1] * cos(a) * 1.02, z, 0x2a1c10, { s: [5, 4] }); }
      hasB = true;
    }
    if (m.shell) {   // sculpted domed ridged carapace (lathe with ridgeN/ridgeA + marginal rim + dorsal keel)
      z = an.z0 + L * 0.46; p = an.prof(z);
      gb.lathe([
        [0.0, 1.0], [0.36, 0.94], [0.68, 0.74], [0.92, 0.40], [1.0, 0.10], [1.08, -0.02], [0.94, -0.07]
      ], function (x, y, zz, nx, ny) {
        return ny < 0.15 ? 0x4e3e1e : (y > p[2] + p[1] * 1.15 ? 0x8a7440 : 0x6e5a2e);
      }, { seg: 14, x: 0, y: p[2] + p[1] * 0.42, z: z, sx: p[0] * 1.38, sy: p[1] * 1.15, sz: L * 0.28, ridgeN: 10, ridgeA: 0.055 });
      gb.tube([[0, p[2] + p[1] * 0.8, z - L * 0.24], [0, p[2] + p[1] * 1.56, z], [0, p[2] + p[1] * 0.82, z + L * 0.24]], [0.02 * fL, 0.032 * fL, 0.02 * fL], 0x8a7440, { seg: 6, steps: 2, cap0: true, cap1: true });
      hasB = true;
    }
    if (m.crest) {   // swept curved tube crest plumes + beveled central fin
      for (i = 0; i < 5; i++) {
        var uC = i / 4, lean = 0.35 + 0.14 * i, ll = (0.22 + 0.09 * sin(PI * uC)) * f, cz0 = an.headZ + i * 0.018 * f;
        var sx0 = (i % 2 ? 0.008 : -0.008) * f;
        gh.tube([
          [sx0, an.headTop, cz0],
          [sx0 * 0.5, an.headTop + cos(lean) * ll * 0.58, cz0 - sin(lean) * ll * 0.45],
          [0, an.headTop + cos(lean) * ll, cz0 - sin(lean) * ll]
        ], [0.018 * f, 0.011 * f, 0.003 * f], i % 2 ? col : shade(col, 1.25), { seg: 6, steps: 2, cap0: true, cap1: true });
      }
      gh.extrude([[an.headTop, an.headZ + 0.06 * f], [an.headTop + 0.14 * f, an.headZ - 0.03 * f], [an.headTop + 0.12 * f, an.headZ - 0.16 * f], [an.headTop - 0.01 * f, an.headZ - 0.06 * f]], 0.014 * f, 0, 0, 0, [0, 0, 0], shade(col, 0.9), { axis: 'x', bev: 0.003 * f });
      hasH = true;
    }
    if (m.frill) {   // curved concave scalloped shield + edge osteoderm bosses
      var fPoly = [], nF = 12, rxF = 0.17 * f, ryF = 0.20 * f;
      for (i = 0; i < nF; i++) {
        a = (i / nF) * TAU;
        var rSc = (i % 2 === 0 ? 1.04 : 0.92);
        fPoly.push([sin(a) * rxF * rSc, cos(a) * ryF * rSc]);
      }
      var fy0 = an.headTop * 0.9 + 0.04 * f, fz0 = an.headZ - 0.02 * f;
      gh.extrude(fPoly, 0.018 * f, 0, fy0, fz0, [-0.42, 0, 0], col, { axis: 'z', bev: 0.005 * f, curveX: 1.3 / max(0.2, f), curveY: 0.9 / max(0.2, f) });
      for (i = 0; i < 9; i++) {
        a = (i / 8 - 0.5) * 2.5;
        gh.cone(0.013 * f, 0.05 * f, sin(a) * rxF * 1.02, fy0 + cos(a) * ryF * 0.95, fz0 - 0.04 * f + (sin(a) * sin(a)) * 0.02 * f, shade(col, 1.3), { seg: 4, rot: [-0.42, 0, -a * 0.8] });
      }
      hasH = true;
    }
    if (m.ears) {   // cupped curved extrude ears + inner pink hollow
      var ex = 0.06 * f, ey = an.headTop + 0.11 * f, ez = an.headZ, erx = 0.048 * f, ery = 0.145 * f;
      var ePoly = [[0, -ery], [erx * 0.9, -ery * 0.3], [erx * 0.8, ery * 0.45], [0, ery], [-erx * 0.8, ery * 0.45], [-erx * 0.9, -ery * 0.3]];
      var iPoly = [[0, -ery * 0.72], [erx * 0.56, -ery * 0.2], [erx * 0.48, ery * 0.34], [0, ery * 0.7], [-erx * 0.48, ery * 0.34], [-erx * 0.56, -ery * 0.2]];
      var cX = 4.5 / max(0.2, f), cY = 1.5 / max(0.2, f);
      for (k = -1; k <= 1; k += 2) {
        gh.extrude(ePoly, 0.016 * f, k * ex, ey, ez, [0.15, k * -0.18, -k * 0.22], 0x4a3a52, { axis: 'z', bev: 0.004 * f, curveX: cX, curveY: cY, taper: 0.88 });
        gh.extrude(iPoly, 0.008 * f, k * (ex + 0.002 * f), ey, ez + 0.006 * f, [0.15, k * -0.18, -k * 0.22], 0xd89aa6, { axis: 'z', bev: 0.002 * f, curveX: cX, curveY: cY, taper: 0.85 });
      }
      hasH = true;
    }
    return { gb: hasB ? gb : null, gh: hasH ? gh : null };
  }

  // ---- apply mods to a freshly built animal
  var matCache = {};
  function tintMat(src, tint) {
    var key = src.uuid + '|' + tint.map(function (v) { return Math.round(v * 20); }).join(',');
    if (matCache[key]) return matCache[key];
    var c = src.clone(); c.color.setRGB(src.color.r * tint[0], src.color.g * tint[1], src.color.b * tint[2]); c.userData.tint = true;
    return (matCache[key] = c);
  }
  var glowMats = {};
  function apply(a, m, opts) {
    var root = a.group, baby = !!(opts && opts.baby), seed = (opts && opts.seed) | 0, rr = rnd(hashStr('mods' + (m.glow ? 'g' : '') + (seed & 3))), live = [];
    if (m.scale) root.scale.multiplyScalar(m.scale);
    // palette: every material of the model is cloned once per tint (shared between animals); chameleons get their own clones to animate
    var tint = m.tint, own = null;
    if (m.shift || m.glow) own = [];
    if (tint || own) root.traverse(function (o) {
      if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.userData.mod) return;
      if (own) { var c = o.material.clone(); c.userData.mod = true; if (tint) c.color.setRGB(c.color.r * tint[0], c.color.g * tint[1], c.color.b * tint[2]); o.material = c; own.push({ m: c, r: c.color.r, g: c.color.g, b: c.color.b }); }
      else o.material = tintMat(o.material, tint);
    });
    if (!baby) {
      var an = anchors(a), parts = build(an, m, rr);
      if (parts.gb) { var bm = mesh(parts.gb.build()); bm.scale.setScalar(an.u); an.body.add(bm); }
      if (parts.gh) { var hm = mesh(parts.gh.build()); hm.scale.setScalar(an.u); an.head.add(hm); }
      if (m.glow) {   // glowing patches: unlit (basic) material whose colour follows the night
        var key = m.glow.join(','), gmat = glowMats[key] || (glowMats[key] = new T.MeshBasicMaterial({ color: 0xffffff }));
        var gp = B(); var gr2 = rnd(hashStr('gl' + (seed & 3))), glScale = clamp(an.z1 - an.z0, 0.4, 1.6);
        for (var i = 0; i < 26; i++) { var z = an.z0 + (an.z1 - an.z0) * (0.04 + 0.92 * gr2()), p = an.prof(z), ang = (gr2() - 0.5) * 3.0, r = (0.018 + 0.022 * gr2()) * glScale; gp.sph(r, r, r * 0.6, p[0] * sin(ang) * 1.04, p[2] + p[1] * cos(ang) * 1.04, z, 0xffffff, { s: [5, 4] }); }
        var pm = mesh(gp.build(), gmat); pm.scale.setScalar(an.u); an.body.add(pm); live.push(gmat);
      }
    }
    var gk = m.glowK === undefined ? 0.2 : m.glowK, t0 = hashStr('shift' + seed) / 4294967296 * 6;
    var upd = a.update, tt = 0;
    a.update = function (dt, ent) {
      upd(dt, ent); tt += dt;
      if (m.shift && own) {   // chameleon: hue drifts; colours are scaled so the vivid hue dominates the original palette
        var h = (t0 + tt * 0.045) % 1, hr = clamp(Math.abs(h * 6 - 3) - 1, 0, 1), hg = clamp(2 - Math.abs(h * 6 - 2), 0, 1), hb = clamp(2 - Math.abs(h * 6 - 4), 0, 1);
        for (var q = 0; q < own.length; q++) own[q].m.color.setRGB(own[q].r * (0.45 + 1.5 * hr), own[q].g * (0.45 + 1.5 * hg), own[q].b * (0.45 + 1.5 * hb));
      }
      if (m.glow) {
        var s = gk + (1 - gk) * night(), g = m.glow;
        for (var w = 0; w < live.length; w++) live[w].color.setRGB(g[0] * (0.25 + 0.75 * s), g[1] * (0.25 + 0.75 * s), g[2] * (0.25 + 0.75 * s));
        if (own) for (var e = 0; e < own.length; e++) if (own[e].m.emissive) own[e].m.emissive.setRGB(g[0] * 0.34 * s, g[1] * 0.34 * s, g[2] * 0.34 * s);
      }
    };
    a.update(0.0001, { state: 'idle', speed: 0 });
    return a;
  }

  M.applyMods = apply;
  M.createAnimal = function (id, opts) {
    opts = opts || {};
    var s = sp(id), isHy = !!(s && s.hybrid && s.look), tr = opts.traits;
    if (!isHy && !(tr && tr.length) && !opts.mods) return orig(id, opts);
    var m = opts.mods || M.modsFor(id, tr);
    var a = orig(isHy ? s.look.base : id, opts);
    if (!m || !a || !a.group) return a;
    try { return apply(a, m, opts); } catch (e) { return a; }
  };
  M.speciesIds = function () { var ids = origIds(); D.animals.forEach(function (a) { if (a.hybrid && ids.indexOf(a.id) < 0) ids.push(a.id); }); return ids; };
})();
