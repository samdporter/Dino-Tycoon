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

  // ---- anchors: where the add-ons go. u = unit scale of the build coordinates (1 for dinosaur rigs: rig units)
  function anchors(a) {
    var I = a._I;
    if (I && I.S && I.S.body && I.body && I.head) {
      var S = I.S, K = S.body.keys, z0 = K[0][0], z1 = K[K.length - 1][0], hl = (S.head && S.head.len) || 0.4;
      return { u: 1, body: I.body, head: I.head, z0: z0, z1: z1, prof: function (z) { return profAt(K, clamp(z, z0, z1)); }, hl: hl, headTop: hl * 0.27, headZ: hl * 0.12 };
    }
    var bb = new T.Box3().setFromObject(a.group), sz = new T.Vector3(); bb.getSize(sz);
    var u = max(0.1, sz.y), len = sz.z / u, cz = (bb.min.z + bb.max.z) / 2 / u, top = bb.max.y / u * 0.82, wid = sz.x / u * 0.4;
    return { u: u, body: a.group, head: a.group, z0: cz - len * 0.38, z1: cz + len * 0.38, prof: function () { return [wid, top * 0.3, top * 0.55]; }, hl: len * 0.25, headTop: top * 0.9, headZ: cz + len * 0.38 };
  }
  function topY(an, z) { var p = an.prof(z); return p[2] + p[1]; }

  // ---- add-on builders (return nothing; they draw into the builders gb (body) / gh (head))
  function limbs(g, x0, y0, z0, x1, y1, z1, r0, col) { g.limb(x0, y0, z0, x1, y1, z1, r0, 0.002, col, { seg: 4 }); }
  function build(an, m, rr) {
    var gb = B(), gh = B(), any = false, L = an.z1 - an.z0, f = an.hl / 0.4, col = m.col || 0xc8603a, i, k, z, p, a;
    var hasB = false, hasH = false;
    if (m.fan) {   // peacock tail fan: a vertical disc of eyed plumes behind the hips
      var y0 = topY(an, an.z0 + L * 0.12) * 0.8, Lf = clamp(L * 0.5, 0.28, 0.8), zf = an.z0 + L * 0.06;
      for (i = 0; i < 13; i++) {
        a = (i / 12 - 0.5) * 2.3; var tx = sin(a) * Lf, ty = y0 + cos(a) * Lf * 0.92, tz = zf - 0.1 - Math.abs(a) * 0.05;
        gb.limb(0, y0, zf, tx, ty, tz, 0.012, 0.034, i % 2 ? 0x1f8f7a : 0x2aa08a, { seg: 5 });
        gb.sph(0.05, 0.062, 0.016, tx, ty, tz, 0xe8b030, { s: [7, 5] }); gb.sph(0.026, 0.034, 0.02, tx, ty, tz - 0.006, 0x1b3b8f, { s: [6, 4] });
      }
      hasB = true;
    }
    if (m.sail) {
      for (i = 0; i < 8; i++) { z = an.z0 + L * (0.18 + 0.62 * i / 7); p = an.prof(z); var hh = 0.12 * (0.55 + 0.45 * sin(PI * i / 7)) * clamp(L, 0.7, 1.6); gb.sph(0.008, hh, 0.05, 0, p[2] + p[1] + hh * 0.7, z, i % 2 ? col : shade(col, 1.2), { s: [5, 4] }); }
      hasB = true;
    }
    if (m.spikes) {
      for (i = 0; i < 10; i++) { z = an.z0 + L * (0.1 + 0.8 * i / 9); p = an.prof(z); var sh = 0.045 * (0.6 + 0.4 * sin(PI * i / 9)) * clamp(L, 0.7, 1.5); gb.cone(0.018, sh, 0, p[2] + p[1] + sh * 0.3, z, 0x4a4630, { seg: 4 }); }
      hasB = true;
    }
    if (m.spots) {
      for (i = 0; i < 20; i++) { z = an.z0 + L * (0.08 + 0.84 * rr()); p = an.prof(z); a = (rr() - 0.5) * 2.6; var sr = 0.022 + 0.018 * rr(); gb.sph(sr, sr, sr * 0.5, p[0] * sin(a) * 1.02, p[2] + p[1] * cos(a) * 1.02, z, 0x2a1c10, { s: [5, 4] }); }
      hasB = true;
    }
    if (m.shell) {
      z = an.z0 + L * 0.45; p = an.prof(z);
      gb.sph(p[0] * 1.35, p[1] * 1.15, L * 0.27, 0, p[2] + p[1] * 0.45, z, 0x6e5a2e, { s: [10, 7] });
      for (i = 0; i < 5; i++) gb.sph(p[0] * 0.3, p[1] * 0.12, L * 0.055, (i % 2 ? 1 : -1) * p[0] * 0.55 * (i > 0), p[2] + p[1] * (1.3 - 0.08 * (i % 3)), z + (i - 2) * L * 0.1, 0x8a7440, { s: [6, 4] });
      hasB = true;
    }
    if (m.crest) {
      for (i = 0; i < 7; i++) { var lean = 0.35 + 0.1 * i, ll = (0.2 + 0.08 * sin(PI * i / 6)) * f; limbs(gh, (i % 2 ? 0.006 : -0.006), an.headTop, an.headZ + i * 0.016 * f, 0, an.headTop + cos(lean) * ll, an.headZ - sin(lean) * ll + i * 0.016 * f, 0.02 * f, i % 2 ? col : shade(col, 1.25)); }
      hasH = true;
    }
    if (m.frill) {
      gh.sph(0.16 * f, 0.19 * f, 0.012 * f, 0, an.headTop * 0.9 + 0.04 * f, an.headZ - 0.02 * f, col, { s: [10, 7], rot: [-0.45, 0, 0] });
      for (i = 0; i < 9; i++) { a = (i / 8 - 0.5) * 2.5; gh.cone(0.012 * f, 0.05 * f, sin(a) * 0.16 * f, an.headTop * 0.9 + 0.04 * f + cos(a) * 0.18 * f, an.headZ - 0.07 * f, shade(col, 1.3), { seg: 4 }); }
      hasH = true;
    }
    if (m.ears) {
      for (k = -1; k <= 1; k += 2) { gh.sph(0.02 * f, 0.16 * f, 0.075 * f, k * 0.06 * f, an.headTop + 0.11 * f, an.headZ, 0x4a3a52, { s: [6, 5], rot: [0, 0, -k * 0.2] }); gh.sph(0.012 * f, 0.11 * f, 0.045 * f, k * 0.064 * f, an.headTop + 0.11 * f, an.headZ + 0.008, 0xd89aa6, { s: [5, 4], rot: [0, 0, -k * 0.2] }); }
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
        var gp = B(); var gr2 = rnd(hashStr('gl' + (seed & 3)));
        for (var i = 0; i < 26; i++) { var z = an.z0 + (an.z1 - an.z0) * (0.04 + 0.92 * gr2()), p = an.prof(z), ang = (gr2() - 0.5) * 3.0, r = 0.02 + 0.026 * gr2(); gp.sph(r, r, r * 0.6, p[0] * sin(ang) * 1.04, p[2] + p[1] * cos(ang) * 1.04, z, 0xffffff, { s: [5, 4] }); }
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
