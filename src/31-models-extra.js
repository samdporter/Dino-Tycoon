// ===== 31-models-extra.js =====
// Creatures package: marine reptiles + other sea animals (realm 'sea'), pterosaurs + birds (realm 'air'), modern land wildlife.
// Everything here renders through Z.Models.createAnimal (wrapped at the bottom) so the normal entity path, thumbnails and
// portraits work unchanged.  Conventions (see notes/creatures.md):
//  * Entities supply ent.state, ent.speed, ent.heading and ent.y (offset above the ground / water surface; negative = below surface).
//  * sea models: origin = body centre line (y=0 sits ON the water surface, y<0 below).  Not-swimming sea animals are lifted to rest on the ground.
//  * air models: origin = ground contact; flying when ent.state==='fly' or ent.y>0.6, otherwise perched/grounded (quadrupedal or bipedal walk).
(function () {
'use strict';
var M = Z.Models; if (!M || !M.kit) return;
var Kt = M.kit, T = Kt.T, B = Kt.B, mesh = Kt.mesh, grp = Kt.grp, skin = Kt.skin, profAt = Kt.profAt, mixHex = Kt.mixHex, shade = Kt.shade, clamp = Kt.clamp, lerp = Kt.lerp, damp = Kt.damp, smooth = Kt.smooth, kEye = Kt.eye;
var PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
var SPEC = {};           // id -> species model spec

// ---------------------------------------------------------------- helpers
// double-sided fan sheet (membranes, fins). pts: [[x,y,z],...] convex-ish; alt darkens every other triangle (vein pattern)
function sheet(g, pts, cTop, cBot, alt) {
  var n = pts.length, cx = 0, cy = 0, cz = 0, i;
  for (i = 0; i < n; i++) { cx += pts[i][0]; cy += pts[i][1]; cz += pts[i][2]; }
  var C = [cx / n, cy / n, cz / n];
  for (i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n], ct = alt && (i & 1) ? shade(cTop, alt) : cTop, cb = alt && (i & 1) ? shade(cBot, alt) : cBot;
    g.tri(C, a, b, ct, 0, 1, 0); g.tri(C, a, b, cb, 0, -1, 0);
  }
}
function tube(g, r1, r2, len, col, o) { // along +z from 0 to len
  o = o || {}; g.loft([[0, r1, r1 * (o.fy || 0.9), 0], [len, r2, r2 * (o.fy || 0.9), 0]], { rings: o.rings || 2, seg: o.seg || 8, cap1: o.cap1 !== false, cap0: !!o.cap0 }, col);
}
function teeth(g, zs, x, y, len, w, up, col, curve) {
  var c = col || 0xf1ecd8;
  for (var s = -1; s <= 1; s += 2) for (var i = 0; i < zs.length; i++) {
    var l = len * (0.78 + 0.22 * (i % 2)), z0 = zs[i], sx = s * x;
    if (curve) {
      var dir = up ? 1 : -1;
      g.tube([[sx, y, z0], [sx * 0.96, y + dir * l * 0.55, z0 - l * curve * 0.35], [sx * 0.9, y + dir * l, z0 - l * curve]], [w * 0.72, w * 0.14], c, { seg: 5, steps: 2, cap0: false, cap1: true });
    } else {
      g.cone(w, l, sx, y + (up ? l * 0.5 : -l * 0.5), z0, c, { seg: 5, rot: [up ? 0 : PI, 0, 0] });
    }
  }
}
// sculpted 3D hydrofoil flipper extending along +x (length len, chord, thickness), swept back by 'sw' radians
function paddle(len, chord, th, col, sw, o) {
  o = o || {}; var g = B(), s = sw || 0, cs = cos(s), sn = sin(s);
  var lx = len * cs, swOff = len * sn, cv = o.curve || 0;
  var cFn = typeof col === 'function' ? col : function (x, y, z, nx, ny, nz, u, v) {
    var base = o.tip ? mixHex(col, o.tip, clamp(((v || 0) - 0.5) * 2, 0, 1)) : col;
    return ny < -0.15 ? mixHex(base, 0xd8d6c8, 0.22) : base;
  };
  var sparCol = typeof col === 'function' ? col : function (x, y, z, nx, ny, nz, tf) {
    return o.tip ? mixHex(col, o.tip, clamp((tf - 0.5) * 2, 0, 1)) : col;
  };
  var spars = [
    [[0, 0, chord * 0.38], [lx * 0.02, 0, -chord * 0.04], [0, 0, -chord * 0.46]],
    [[lx * 0.48, -cv * 0.25, chord * 0.30 - swOff * 0.38], [lx * 0.48, -cv * 0.25, -swOff * 0.38 - chord * 0.08], [lx * 0.38, -cv * 0.2, -swOff * 0.32 - chord * 0.42]],
    [[lx, -cv, -swOff + chord * 0.05], [lx * 0.94, -cv, -swOff - chord * 0.07]]
  ];
  g.wingMembrane(spars, max(0.012, th * 1.45), cFn, { camber: len * 0.025, scallop: 0.06, uSteps: 3, vSteps: 3 });
  g.tube([[0, 0, chord * 0.36], [lx * 0.48, -cv * 0.25, chord * 0.29 - swOff * 0.38], [lx * 0.97, -cv, -swOff + chord * 0.02]], [max(0.008, th * 0.95), max(0.006, th * 0.65), max(0.003, th * 0.2)], sparCol, { seg: 6, steps: 2, cap0: true, cap1: true });
  return g.build();
}
// sculpted vertical swept hydrofoil fin / caudal lobe (h > 0 points +y, h < 0 points -y)
function finLoft(g, h, chord, th, sweep, x, y, z, col, o) {
  o = o || {}; var up = h >= 0, ah = abs(h);
  var K = up
    ? [[-ah, th * 0.24, chord * 0.16, sweep], [-ah * 0.62, th * 0.58, chord * 0.35, sweep * 0.42], [-ah * 0.24, th * 0.85, chord * 0.48, sweep * 0.08], [0, th, chord * 0.54, 0]]
    : [[0, th, chord * 0.54, 0], [ah * 0.24, th * 0.85, chord * 0.48, sweep * 0.08], [ah * 0.62, th * 0.58, chord * 0.35, sweep * 0.42], [ah, th * 0.24, chord * 0.16, sweep]];
  g.loft(K, { down: true, rings: o.rings || 5, seg: o.seg || 8, ox: x, oy: y, oz: z, cap0: true, cap1: true, superPow: 1.25 }, col);
}
function sphCol(S, zc) { return function (x, y, z, nx, ny) { return S.col(zc, ny, nx, x, y, z); }; }

// ---------------------------------------------------------------- shared per-frame tracking (turn rate, vertical speed)
function track(I, dt, ent) {
  var h = ent.heading || 0, y = ent.y || 0;
  if (I.h0 === undefined) { I.h0 = h; I.y0 = y; }
  var dh = h - I.h0; dh -= TAU * Math.round(dh / TAU); I.h0 = h;
  var tr = dt > 0.002 ? clamp(dh / dt, -3, 3) : 0; I.turn = damp(I.turn, tr, 5, dt);
  var vy = dt > 0.002 ? clamp((y - I.y0) / dt, -4, 4) : 0; I.y0 = y; I.vy = damp(I.vy, vy, 5, dt);
}
function newI(S, sc) { return { S: S, sc: sc, t: Math.random() * 50, ph: Math.random() * 6, seed: Math.random() * 6.28, turn: 0, vy: 0, h0: undefined, y0: 0, st: 'idle', lookT: 1 + Math.random() * 3, lookY: 0, lookTY: 0, lookP: 0, lookTP: 0, minY: 0, br: 0, brT: 8 + Math.random() * 14, W: { eat: 0, sleep: 0, gait: 0, fly: 0, run: 0, play: 0, call: 0 }, callT: 4 + Math.random() * 10, callA: 99, lift: 0 }; }
function finish(root, I, out) {
  root.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(root); out.height = Math.max(0.2, bb.max.y); I.minY = bb.min.y;
  var S = I.S, hs = bb.max.x - bb.min.x, ds = bb.max.z - bb.min.z; out.cullR = Math.max(hs, ds, (S.wing ? (S.wing.at[0] + S.wing.a + 1.8 * S.wing.a) * 2 * I.sc : 0)) * 0.62 + 0.5; root.userData.species = I.S.id; return out;
}

// ================================================================ SPINE swimmers (ichthyosaurus, mosasaurus, dolphin, seal)
// spec: keys [[s,rx,ry,yc]...] tail->nose, cuts (segment origins, descending z), col(skin fn), app[] appendages, extra(g,i,p) per segment (z already local via dz)
function spineGeos(S) {
  if (S._geo) return S._geo;
  var Kk = S.keys, p = S.cuts, n = p.length, zTail = Kk[0][0], zNose = Kk[Kk.length - 1][0], geos = [], i;
  for (i = 0; i < n; i++) {
    var s0 = i < n - 1 ? p[i + 1] : zTail, s1 = i === 0 ? zNose : p[i], g = B(), len = s1 - s0;
    g.loft(Kk, { s0: s0, s1: s1, rings: Math.max(2, Math.round(len / (S.ringLen || 0.3))), seg: S.seg || 9, oz: -p[i], z0: s0, z1: s1, cap0: i === n - 1, cap1: i === 0, ridge: S.ridge || 0 }, S.col);
    if (i > 0) {
      var pr = profAt(Kk, p[i]), ov = max(pr[0], pr[1]) * 0.42;
      g.loft([[0, pr[0] * 0.99, pr[1] * 0.99, pr[2]], [ov, pr[0] * 0.86, pr[1] * 0.86, pr[2]]], { rings: 2, seg: S.seg || 9, z0: p[i], z1: p[i] + ov, cap1: true, ridge: S.ridge || 0 }, S.col);
    }
    if (S.extra) S.extra(g, i, -p[i]);
    geos.push(g.build());
  }
  S._geo = geos; S._app = (S.app || []).map(function (a) { return a.geo(); });
  return geos;
}
function createSpine(S, opts) {
  var sc = opts.baby ? (S.bs || 0.45) : 1, geos = spineGeos(S), root = grp('animal'), rig = grp('rig'), bank = grp('bank'), I = newI(S, sc), p = S.cuts, n = p.length, i;
  root.add(rig); rig.add(bank); rig.scale.setScalar(sc); I.rig = rig; I.bank = bank; I.segs = []; I.app = [];
  var par = bank;
  for (i = 0; i < n; i++) {
    var g = grp('seg' + i); g.rotation.order = 'YXZ'; g.position.set(0, 0, i === 0 ? p[0] : p[i] - p[i - 1]); par.add(g); g.add(mesh(geos[i])); I.segs.push(g); par = g;
  }
  for (i = 0; i < S.app.length; i++) {
    var a = S.app[i], ag = grp('app'); ag.rotation.order = 'ZXY'; ag.position.set(a.side * a.x, a.y, a.z - p[a.seg]); if (a.side < 0) ag.scale.x = -1;
    ag.add(mesh(S._app[i])); I.segs[a.seg].add(ag); I.app.push(ag);
  }
  if (S.jaw) { var jg = grp('jaw'); jg.position.set(0, S.jaw.y, S.jaw.z - p[0]); jg.add(mesh(S.jaw.geo())); I.segs[0].add(jg); I.jaw = jg; }
  var out = { group: root, height: 1, update: function (dt, ent) { updSpine(I, dt, ent); }, _I: I };
  updSpine(I, 0.0001, { state: 'idle', speed: 0 });
  return finish(root, I, out);
}
function updSpine(I, dt, ent) {
  if (dt > 0.1) dt = 0.1; if (dt <= 0) dt = 1e-4;
  var S = I.S, t = (I.t += dt), spd = ent.speed || 0, n = I.segs.length, i, sw = S.land ? (ent.state === 'swim' || (ent.y || 0) < -0.05) : true;
  track(I, dt, ent);
  var m = clamp(spd / (S.cruise || 1.2), 0, 1.5), mv = clamp(m, 0, 1);
  I.W.gait = damp(I.W.gait, mv, 3, dt);
  var gm = I.W.gait, hump = 0;
  I.ph += dt * (S.f0 + S.f1 * gm) * (sw ? 1 : 0.7);
  var ph = I.ph * TAU, amp = lerp(S.idleAmp, 1, gm), A = S.amp, lag = S.lag;
  if (S.land && !sw) {   // hauled out (seals): hump along the spine when moving, flat when resting
    for (i = 0; i < n; i++) { I.segs[i].rotation.y = 0.04 * sin(t * 0.7 + I.seed + i); I.segs[i].rotation.x = -gm * 0.32 * sin(ph - i * 1.3) * (i ? 1 : 0.4); }
  } else for (i = 0; i < n; i++) {
    var w = A[i] * amp * sin(ph - i * lag) - I.turn * (S.turnBend || 0.12) * (i ? 1 : 0.2);
    if (S.vert) { I.segs[i].rotation.x = w * 0.8 + (i ? 0 : 0.03 * sin(t * 0.9)); I.segs[i].rotation.y = -I.turn * 0.1 * i / n; } else { I.segs[i].rotation.y = w; I.segs[i].rotation.x = 0; }
  }
  // appendages (flippers/fins): role pec / pel / stat
  for (i = 0; i < I.app.length; i++) {
    var a = S.app[i], g = I.app[i], b = a.base;
    if (a.role === 'pec' || a.role === 'pel') {
      var f = sin(ph * (a.role === 'pec' ? 1 : 1) * 0.5 + (a.role === 'pel' ? 1.3 : 0) + (a.side < 0 ? 0.0 : 0.0) + I.seed) * a.flap * (0.35 + 0.65 * gm);
      var lieFlat = (S.land && !sw) ? 1 : 0;
      g.rotation.set(b[0] + 0.15 * sin(ph * 0.5 + 1), a.side * (b[1] + 0.12 * sin(t * 0.8 + i + I.seed) + (lieFlat ? 0.5 : 0)), a.side * (b[2] + f * (lieFlat ? 0.4 : 1)));
    } else if (a.role === 'tail') { g.rotation.set(b[0], 0, b[2]); }
  }
  // jaw
  if (I.jaw) { var jo = (S.jaw.rest || 0.03) + 0.025 * (1 + sin(t * 1.7 + I.seed)) + (I.br > 0 ? 0.35 * sin(PI * I.br) : 0) + gm * 0.0; I.jaw.rotation.x = jo; }
  // body bank / pitch
  var pitch = clamp(-Math.atan2(I.vy, max(0.6, spd)), -0.7, 0.7), roll = clamp(-I.turn * (S.bank || 0.45), -0.55, 0.55);
  // breach (big swimmers surface now and then)
  var by = 0;
  if (S.breach && sw) {
    if (I.br > 0) { I.br += dt / S.breach.dur; if (I.br >= 1) { I.br = 0; I.brT = S.breach.gap * (0.7 + Math.random() * 0.8); } }
    else { I.brT -= dt; if (I.brT <= 0 && (ent.y || 0) > -1.2 && gm > 0.3) I.br = 0.0001; else if (I.brT <= 0) I.brT = 2; }
    if (I.br > 0) { by = S.breach.h * sin(PI * I.br); pitch = -0.95 * cos(PI * I.br); roll += 0.25 * sin(PI * I.br * 2); }
  }
  var bobY = sw ? 0.02 * S.depth * sin(t * 0.8 + I.seed) : 0;
  I.bank.rotation.set(pitch, 0, roll); I.rig.position.y = (sw ? 0 : -I.minY) + by + bobY;
  if (!sw && S.land) { I.bank.rotation.x = 0; I.bank.rotation.z = 0; }
}

// ---- Ichthyosaurus: small dolphin-shaped ichthyosaur, lateral (fish-like) undulation
SPEC.ichthyosaurus = (function () {
  var S = { id: 'ichthyosaurus', kind: 'spine', depth: 0.3, cruise: 1.6, f0: 0.35, f1: 1.0, idleAmp: 0.25, amp: [0.07, 0.13, 0.3, 0.5], lag: 1.0, turnBend: 0.14, bank: 0.5, bs: 0.5, ringLen: 0.22, seg: 10 };
  S.keys = [[-1.0, 0.006, 0.01, 0], [-0.86, 0.02, 0.04, 0], [-0.62, 0.05, 0.09, 0.01], [-0.36, 0.10, 0.15, 0.02], [-0.1, 0.15, 0.20, 0.01], [0.15, 0.155, 0.20, 0.0], [0.4, 0.11, 0.15, 0.0], [0.56, 0.06, 0.075, -0.01], [0.76, 0.036, 0.04, -0.015], [1.0, 0.012, 0.013, -0.02]];
  S.col = skin({ back: 0x4c5d6e, belly: 0xd3d8d2, mid: 0x7d8c94, bAt: -0.2, bW: 0.6, mott: 0.05, spots: { f: 6, k: 3, d: 0.1, c: 0x35424f, a: 0.7 } });
  S.cuts = [0.12, -0.18, -0.5, -0.78];
  S.extra = function (g, i, dz) {
    if (i === 0) { kEye(g, 0.057, 0.02, 0.56 + dz, 0.036, 0xf0d070); g.sph(0.012, 0.012, 0.012, 0.02, 0.0, 0.99 + dz, 0x1c1c1c, { s: [4, 3] }); }
    if (i === 1) finLoft(g, 0.21, 0.22, 0.016, -0.15, 0, 0.16, -0.12 + dz, 0x3d4b5a);
    if (i === 3) { // vertical crescent tail fluke: upper fin + hypocercal lower lobe
      finLoft(g, 0.24, 0.15, 0.014, -0.14, 0, 0.0, -0.94 + dz, 0x3a4856);
      finLoft(g, -0.26, 0.16, 0.015, -0.12, 0, 0.0, -0.94 + dz, 0x3a4856);
    }
  };
  S.app = [
    { seg: 0, side: 1, x: 0.1, y: -0.14, z: 0.32, role: 'pec', base: [0, -0.7, -0.5], flap: 0.28, geo: function () { return paddle(0.36, 0.14, 0.012, 0x435263, 0.5); } },
    { seg: 0, side: -1, x: 0.1, y: -0.14, z: 0.32, role: 'pec', base: [0, -0.7, -0.5], flap: 0.28, geo: function () { return paddle(0.36, 0.14, 0.012, 0x435263, 0.5); } },
    { seg: 1, side: 1, x: 0.07, y: -0.1, z: -0.3, role: 'pel', base: [0, -0.7, -0.45], flap: 0.2, geo: function () { return paddle(0.18, 0.08, 0.01, 0x435263, 0.5); } },
    { seg: 1, side: -1, x: 0.07, y: -0.1, z: -0.3, role: 'pel', base: [0, -0.7, -0.45], flap: 0.2, geo: function () { return paddle(0.18, 0.08, 0.01, 0x435263, 0.5); } }
  ];
  S.breach = { h: 0.8, dur: 1.5, gap: 22 };
  return S;
})();

// ---- Mosasaurus: giant sea lizard, long eel-like swimming, huge toothy jaws
SPEC.mosasaurus = (function () {
  var S = { id: 'mosasaurus', kind: 'spine', depth: 1.0, cruise: 1.5, f0: 0.22, f1: 0.55, idleAmp: 0.3, amp: [0.04, 0.1, 0.17, 0.26, 0.38], lag: 0.95, turnBend: 0.09, bank: 0.4, bs: 0.4, ringLen: 0.55, seg: 11, ridge: 0.14 };
  S.keys = [[-5.4, 0.03, 0.12, -0.02], [-4.8, 0.08, 0.34, -0.06], [-3.9, 0.18, 0.38, -0.05], [-2.7, 0.36, 0.5, -0.02], [-1.4, 0.62, 0.7, 0.0], [-0.2, 0.74, 0.8, 0.03], [1.0, 0.64, 0.7, 0.02], [2.0, 0.45, 0.5, 0.01], [2.7, 0.4, 0.36, 0.0], [3.3, 0.4, 0.32, -0.03], [4.3, 0.32, 0.24, -0.06], [5.3, 0.19, 0.14, -0.08], [5.85, 0.06, 0.06, -0.09]];
  S.col = skin({ back: 0x4d5f55, belly: 0xd2cfb0, mid: 0x6e7e68, bAt: -0.15, bW: 0.6, mott: 0.07, bars: { f: 0.45, w: 0.4, c: 0x34433a, ph: 0.2, ca0: -0.1, k: 0.8, from: -5, to: 2 } });
  S.cuts = [0.5, -1.0, -2.5, -3.7, -4.6];
  S.extra = function (g, i, dz) {
    if (i === 0) {
      kEye(g, 0.385, 0.1, 3.9 + dz, 0.09, 0xe8c040);
      g.sph(0.025, 0.02, 0.04, 0.05, -0.065, 5.7 + dz, 0x1c1c1c, { s: [4, 3] }); g.sph(0.025, 0.02, 0.04, -0.05, -0.065, 5.7 + dz, 0x1c1c1c, { s: [4, 3] });
      var zs = [], pzs = [], k;
      for (k = 0; k < 9; k++) zs.push(3.6 + k * 0.23);
      for (k = 0; k < 5; k++) pzs.push(3.75 + k * 0.28);
      teeth(g, zs, 0.25, -0.16, 0.18, 0.036, false, 0xf1ecd8, 0.32);
      teeth(g, pzs, 0.10, -0.12, 0.11, 0.024, false, 0xeae3c8, 0.38); // pterygoid palate teeth
    }
    if (i === 3) finLoft(g, 0.34, 0.95, 0.03, -0.25, 0, 0.3, -4.2 + dz, 0x3e4d44);
    if (i === 4) { // hypocercal mosasaur swimming tail fluke
      finLoft(g, 0.65, 0.72, 0.035, -0.45, 0, 0.02, -5.05 + dz, 0x3e4d44);
      finLoft(g, -0.78, 0.78, 0.04, -0.42, 0, -0.04, -5.05 + dz, 0x3e4d44);
    }
  };
  S.jaw = { y: -0.17, z: 3.05, rest: 0.05, geo: function () {
    var g = B(), jc = skin({ back: 0xb9b99a, belly: 0xd6d3b6, bAt: 0, bW: 0.6, mott: 0.04 });
    g.loft([[0, 0.26, 0.1, -0.02], [0.8, 0.26, 0.09, -0.03], [1.6, 0.18, 0.07, -0.03], [2.3, 0.09, 0.05, -0.02], [2.85, 0.035, 0.03, -0.01]], { rings: 6, seg: 8, cap0: true, cap1: true }, jc);
    var zs = [], k; for (k = 0; k < 8; k++) zs.push(0.7 + k * 0.28); teeth(g, zs, 0.17, 0.07, 0.16, 0.032, true, 0xf1ecd8, 0.3);
    return g.build();
  } };
  S.app = [
    { seg: 0, side: 1, x: 0.45, y: -0.4, z: 1.3, role: 'pec', base: [0, -0.9, -0.35], flap: 0.35, geo: function () { return paddle(1.3, 0.52, 0.05, 0x44534a, 0.5, { tip: 0x3a4840 }); } },
    { seg: 0, side: -1, x: 0.45, y: -0.4, z: 1.3, role: 'pec', base: [0, -0.9, -0.35], flap: 0.35, geo: function () { return paddle(1.3, 0.52, 0.05, 0x44534a, 0.5, { tip: 0x3a4840 }); } },
    { seg: 1, side: 1, x: 0.4, y: -0.42, z: -1.5, role: 'pel', base: [0, -0.9, -0.3], flap: 0.3, geo: function () { return paddle(1.1, 0.45, 0.045, 0x44534a, 0.5); } },
    { seg: 1, side: -1, x: 0.4, y: -0.42, z: -1.5, role: 'pel', base: [0, -0.9, -0.3], flap: 0.3, geo: function () { return paddle(1.1, 0.45, 0.045, 0x44534a, 0.5); } }
  ];
  S.breach = { h: 2.2, dur: 2.4, gap: 40 };
  return S;
})();

// ---- Bottlenose dolphin (modern): vertical (up-down) undulation, tail flukes horizontal, porpoising leaps
SPEC.dolphin = (function () {
  var S = { id: 'dolphin', kind: 'spine', depth: 0.4, cruise: 2.0, f0: 0.5, f1: 1.4, idleAmp: 0.2, amp: [0.04, 0.12, 0.28, 0.5], lag: 1.1, vert: true, turnBend: 0.1, bank: 0.55, bs: 0.5, ringLen: 0.26, seg: 10 };
  S.keys = [[-1.1, 0.03, 0.03, 0], [-0.8, 0.06, 0.07, 0], [-0.3, 0.16, 0.2, 0], [0.1, 0.235, 0.26, 0.01], [0.5, 0.2, 0.22, 0.01], [0.78, 0.14, 0.15, 0.0], [0.95, 0.1, 0.1, 0.0], [1.06, 0.045, 0.05, -0.02], [1.27, 0.022, 0.022, -0.03]];
  S.col = skin({ back: 0x5e7084, belly: 0xe2e5e4, mid: 0x8b99a5, bAt: -0.1, bW: 0.7, mott: 0.04 });
  S.cuts = [0.25, -0.25, -0.75];
  S.extra = function (g, i, dz) {
    if (i === 0) { kEye(g, 0.09, 0.04, 0.84 + dz, 0.022, 0x20202a); g.sph(0.014, 0.012, 0.014, 0.0, 0.01, 1.26 + dz, 0x20242a, { s: [4, 3] }); }
    if (i === 1) finLoft(g, 0.24, 0.24, 0.018, -0.17, 0, 0.19, -0.12 + dz, 0x4d5d70);
    if (i === 2) {
      var z0 = -0.96 + dz;
      for (var sd = -1; sd <= 1; sd += 2) {
        g.wingMembrane([
          [[0, 0, z0], [0, 0, z0 - 0.16]],
          [[sd * 0.14, 0, z0 - 0.06], [sd * 0.11, 0, z0 - 0.18]],
          [[sd * 0.29, 0, z0 - 0.18], [sd * 0.27, 0, z0 - 0.22]]
        ], 0.022, 0x485769, { camber: 0.008, scallop: 0.14, uSteps: 3, vSteps: 3 });
      }
    }
  };
  S.app = [
    { seg: 0, side: 1, x: 0.17, y: -0.16, z: 0.45, role: 'pec', base: [0.2, -0.6, -0.65], flap: 0.3, geo: function () { return paddle(0.34, 0.13, 0.015, 0x4d5d70, 0.55); } },
    { seg: 0, side: -1, x: 0.17, y: -0.16, z: 0.45, role: 'pec', base: [0.2, -0.6, -0.65], flap: 0.3, geo: function () { return paddle(0.34, 0.13, 0.015, 0x4d5d70, 0.55); } }
  ];
  S.breach = { h: 1.3, dur: 1.3, gap: 14 };
  return S;
})();

// ================================================================ PLESIOSAUR / PLIOSAUR (long-neck or big-head body with four flippers)
function chainGeos(S, c, key) {   // n tapering segments along +z, each with a sleek tapered overlap collar at its start
  var out = [], i, n = c.n, sl = c.len / n, fy = c.fy || 0.85;
  for (i = 0; i < n; i++) {
    var k0 = i / n, k1 = (i + 1) / n, r0 = lerp(c.r1, c.r2, k0), r1 = lerp(c.r1, c.r2, k1), ov = r0 * 0.42, g = B();
    g.loft([[-ov, r0 * 0.86, r0 * fy * 0.86, 0], [0, r0 * 0.99, r0 * fy * 0.99, 0], [sl, r1, r1 * fy, 0]], { rings: 3, seg: c.seg || 8, cap0: true, cap1: i === n - 1 }, S.col);
    if (c.extra) c.extra(g, i, sl);
    out.push(g.build());
  }
  return out;
}
function plesioGeos(S) {
  if (S._geo) return S._geo; var G = {}, g = B(), b = S.body;
  g.loft(b.keys, { rings: b.rings || 12, seg: b.seg || 11, cap0: true, cap1: true, flatBot: b.flatBot || 0, ridge: b.ridge || 0, superPow: b.superPow || 0 }, S.col); if (b.extra) b.extra(g, S); G.body = g.build();
  G.neck = chainGeos(S, S.neck); G.tail = chainGeos(S, S.tail);
  g = B(); S.head.build(g); G.head = g.build(); g = B(); if (S.head.jaw) S.head.jaw.build(g); G.jaw = S.head.jaw ? g.build() : null;
  G.fl = S.flip.map(function (f) { return paddle(f.len, f.chord, f.th, f.col || S.fcol, f.sw === undefined ? 0.45 : f.sw, { tip: f.tip, curve: f.curve }); });
  return (S._geo = G);
}
function createPlesio(S, opts) {
  var sc = opts.baby ? (S.bs || 0.45) : 1, G = plesioGeos(S), root = grp('animal'), rig = grp('rig'), bank = grp('bank'), I = newI(S, sc), i, par;
  root.add(rig); rig.add(bank); rig.scale.setScalar(sc); I.rig = rig; I.bank = bank; bank.add(mesh(G.body));
  I.neck = []; par = bank;
  for (i = 0; i < S.neck.n; i++) { var ng = grp('neck' + i); ng.rotation.order = 'YXZ'; if (i === 0) ng.position.set(0, S.neck.at[0], S.neck.at[1]); else ng.position.set(0, 0, S.neck.len / S.neck.n); par.add(ng); ng.add(mesh(G.neck[i])); I.neck.push(ng); par = ng; }
  var hg = grp('head'); hg.rotation.order = 'YXZ'; hg.position.set(0, 0, S.neck.len / S.neck.n); par.add(hg); hg.add(mesh(G.head)); I.head = hg;
  if (G.jaw) { var jg = grp('jaw'); jg.position.set(0, S.head.jaw.y, S.head.jaw.z); jg.add(mesh(G.jaw)); hg.add(jg); I.jaw = jg; }
  I.tail = []; par = bank;
  for (i = 0; i < S.tail.n; i++) { var tg = grp('tail' + i); tg.rotation.order = 'YXZ'; if (i === 0) tg.position.set(0, S.tail.at[0], S.tail.at[1]); else tg.position.set(0, 0, -S.tail.len / S.tail.n); tg.rotation.y = 0; var tm = mesh(G.tail[i]); tm.rotation.y = PI; tg.add(tm); par.add(tg); I.tail.push(tg); par = tg; }
  I.fl = [];
  for (i = 0; i < S.flip.length; i++) { var f = S.flip[i], fg = grp('flip'); fg.rotation.order = 'ZXY'; fg.position.set(f.side * f.x, f.y, f.z); if (f.side < 0) fg.scale.x = -1; fg.add(mesh(G.fl[i])); bank.add(fg); I.fl.push(fg); }
  var out = { group: root, height: 1, update: function (dt, ent) { updPlesio(I, dt, ent); }, _I: I };
  updPlesio(I, 0.0001, { state: 'idle', speed: 0 });
  return finish(root, I, out);
}
function updPlesio(I, dt, ent) {
  if (dt > 0.1) dt = 0.1; if (dt <= 0) dt = 1e-4;
  var S = I.S, t = (I.t += dt), spd = ent.speed || 0, i, nn = I.neck.length, y = ent.y || 0;
  track(I, dt, ent);
  var m = clamp(spd / (S.cruise || 1.2), 0, 1.4), mv = clamp(m, 0, 1); I.W.gait = damp(I.W.gait, mv, 3, dt); var gm = I.W.gait;
  var ssw = ent.state === 'swim' || y < -0.05;
  I.ph += dt * (S.f0 + S.f1 * gm); var ph = I.ph * TAU;
  // neck: raised near the surface, level when deep; gentle S-curve; leads into turns
  var up = clamp(1 + y * 0.7, 0, 1) * (1 - 0.5 * gm), nk = S.neck;
  I.lookT -= dt; if (I.lookT <= 0) { I.lookT = 2 + Math.random() * 4; I.lookTY = (Math.random() - 0.5) * 0.7; }
  I.lookY = damp(I.lookY, I.lookTY, 1.2, dt);
  var prev = 0;
  for (i = 0; i < nn; i++) {
    var k = i / Math.max(1, nn - 1), rest = (nk.arch[0] * (1 - k) + nk.arch[1] * k) * up + nk.base, yaw = (nk.sway * sin(t * 0.6 + i * 0.55 + I.seed) + (I.lookY * 0.25 + I.turn * 0.12) * (0.4 + k)) / (nn > 3 ? 1 : 2);
    I.neck[i].rotation.set(-(rest - prev) * 1, yaw, 0); prev = rest;
  }
  I.head.rotation.set(0.15 * up - 0.1, I.lookY * 0.3, 0);
  if (I.jaw) I.jaw.rotation.x = 0.04 + 0.03 * (1 + sin(t * 1.3 + I.seed)) + (S.head.jaw.gape || 0) * Math.max(0, sin(t * 0.37 + I.seed * 3) - 0.8) * 4;
  for (i = 0; i < I.tail.length; i++) I.tail[i].rotation.set(0, (0.12 + 0.35 * gm) * sin(ph - i * 0.9) - I.turn * 0.1, 0);
  // flippers: underwater flight stroke, fore and hind pairs in antiphase
  for (i = 0; i < I.fl.length; i++) {
    var f = S.flip[i], a = ph * 0.5 + (f.fore ? 0 : 1.9) + I.seed * 0 + (f.side < 0 ? 0 : 0), st = sin(a), cs = cos(a), amp = f.amp * (0.3 + 0.7 * gm);
    I.fl[i].rotation.set(0.35 * cs * amp / f.amp * 0.5 - 0.1, f.side * (f.ry + 0.25 * st * gm), f.side * (f.rz + st * amp));
  }
  var pitch = clamp(-Math.atan2(I.vy, max(0.6, spd)), -0.5, 0.5), roll = clamp(-I.turn * 0.4, -0.45, 0.45), by = 0;
  if (S.breach && ssw) {
    if (I.br > 0) { I.br += dt / S.breach.dur; if (I.br >= 1) { I.br = 0; I.brT = S.breach.gap * (0.7 + Math.random() * 0.8); } }
    else { I.brT -= dt; if (I.brT <= 0 && y > -1.2 && gm > 0.3) I.br = 0.0001; else if (I.brT <= 0) I.brT = 2; }
    if (I.br > 0) { by = S.breach.h * sin(PI * I.br); pitch = -0.7 * cos(PI * I.br); }
  }
  I.bank.rotation.set(pitch + 0.02 * sin(t * 0.9 + I.seed), 0, roll + 0.03 * sin(t * 0.7 + I.seed)); I.rig.position.y = (ssw ? 0 : -I.minY) + by + (ssw ? 0.03 * sin(t * 0.8 + I.seed) : 0);
}

// ---- Elasmosaurus: very long neck, small head, four long flippers
SPEC.elasmosaurus = (function () {
  var S = { id: 'elasmosaurus', kind: 'plesio', cruise: 1.2, f0: 0.18, f1: 0.4, bs: 0.4, depth: 1 };
  S.col = skin({ back: 0x667359, belly: 0xd5cfa8, mid: 0x8a9070, bAt: -0.1, bW: 0.7, mott: 0.07, bars: { f: 1.3, w: 0.3, c: 0x4a5640, ph: 0.2, ca0: 0.0, k: 0.6, from: -2, to: 3 } });
  S.fcol = 0x5a6650;
  S.body = { keys: [[-1.7, 0.05, 0.05, 0.0], [-1.25, 0.38, 0.3, 0.0], [-0.5, 0.88, 0.56, 0.0], [0.3, 0.92, 0.6, 0.02], [1.1, 0.68, 0.46, 0.06], [1.7, 0.22, 0.2, 0.12]], rings: 12, seg: 12 };
  S.neck = { n: 8, len: 5.0, r1: 0.27, r2: 0.1, at: [0.12, 1.55], arch: [-0.5, 0.35], base: 0.0, sway: 0.08, fy: 0.9 };
  S.tail = { n: 3, len: 1.8, r1: 0.26, r2: 0.03, at: [0.02, -1.6], fy: 0.8 };
  S.head = { build: function (g) {
    g.loft([[0, 0.12, 0.1, 0], [0.18, 0.15, 0.11, 0.0], [0.38, 0.09, 0.07, -0.02], [0.62, 0.04, 0.035, -0.03]], { rings: 5, seg: 8, cap0: true, cap1: true }, S.col);
    kEye(g, 0.125, 0.045, 0.2, 0.034, 0xe0c050); teeth(g, [0.38, 0.45, 0.52, 0.58], 0.04, -0.045, 0.045, 0.012, false, 0xf1ecd8, 0.25);
  } };
  S.flip = [];
  [1, -1].forEach(function (sd) {
    S.flip.push({ side: sd, x: 0.7, y: -0.3, z: 0.85, len: 1.8, chord: 0.5, th: 0.05, fore: true, amp: 0.45, ry: -0.9, rz: -0.25, sw: 0.5 });
    S.flip.push({ side: sd, x: 0.65, y: -0.3, z: -0.8, len: 1.6, chord: 0.45, th: 0.045, fore: false, amp: 0.4, ry: -0.9, rz: -0.2, sw: 0.5 });
  });
  S.breach = null;
  return S;
})();

// ---- Liopleurodon: short-necked pliosaur with an enormous skull
SPEC.liopleurodon = (function () {
  var S = { id: 'liopleurodon', kind: 'plesio', cruise: 1.5, f0: 0.25, f1: 0.55, bs: 0.4, depth: 1 };
  S.col = skin({ back: 0x3f5160, belly: 0xcdd0c6, mid: 0x62747d, bAt: -0.1, bW: 0.65, mott: 0.08, spots: { f: 4, k: 4, d: 0.09, c: 0x2d3944, a: 0.6 } });
  S.fcol = 0x3c4c59;
  S.body = { keys: [[-1.5, 0.05, 0.05, 0.0], [-1.0, 0.32, 0.3, 0.0], [-0.3, 0.64, 0.52, 0.0], [0.4, 0.66, 0.54, 0.02], [1.0, 0.52, 0.44, 0.04], [1.5, 0.3, 0.3, 0.06]], rings: 10, seg: 11 };
  S.neck = { n: 2, len: 0.7, r1: 0.38, r2: 0.34, at: [0.06, 1.4], arch: [-0.15, -0.1], base: 0.0, sway: 0.05, fy: 0.9 };
  S.tail = { n: 3, len: 1.5, r1: 0.26, r2: 0.04, at: [0.0, -1.45], fy: 0.9, extra: function (g, i, sl) {
    if (i === 2) { finLoft(g, 0.34, 0.42, 0.024, -0.22, 0, 0.02, sl * 0.5, 0x384856); finLoft(g, -0.22, 0.32, 0.02, -0.18, 0, -0.02, sl * 0.5, 0x384856); }
  } };
  S.head = {
    jaw: { y: -0.14, z: 0.12, gape: 0.45, build: function (g) {
      g.loft([[0, 0.3, 0.07, -0.02], [0.5, 0.28, 0.065, -0.03], [1.0, 0.18, 0.055, -0.03], [1.3, 0.06, 0.04, -0.03]], { rings: 5, seg: 8, cap0: true, cap1: true }, S.col);
      var zs = [], k; for (k = 0; k < 7; k++) zs.push(0.3 + k * 0.16); teeth(g, zs, 0.14, 0.07, 0.15, 0.035, true, 0xf1ecd8, 0.28);
    } },
    build: function (g) {
      g.loft([[0, 0.3, 0.2, 0.04], [0.28, 0.35, 0.24, 0.05], [0.8, 0.22, 0.14, 0.0], [1.2, 0.13, 0.1, -0.04], [1.45, 0.14, 0.09, -0.05], [1.6, 0.06, 0.06, -0.05]], { rings: 8, seg: 9, cap0: true, cap1: true }, S.col);
      kEye(g, 0.3, 0.17, 0.35, 0.065, 0xe0b040); var zs = [], k; for (k = 0; k < 8; k++) zs.push(0.45 + k * 0.15); teeth(g, zs, 0.17, -0.1, 0.17, 0.036, false, 0xf1ecd8, 0.28);
    } };
  S.flip = [];
  [1, -1].forEach(function (sd) {
    S.flip.push({ side: sd, x: 0.55, y: -0.3, z: 0.7, len: 1.6, chord: 0.62, th: 0.05, fore: true, amp: 0.4, ry: -0.95, rz: -0.25, sw: 0.45 });
    S.flip.push({ side: sd, x: 0.55, y: -0.3, z: -0.6, len: 1.5, chord: 0.58, th: 0.05, fore: false, amp: 0.4, ry: -0.95, rz: -0.2, sw: 0.45 });
  });
  S.breach = null;
  return S;
})();

// ---- Archelon: giant leathery-shelled sea turtle (uses the plesio rig: short neck, rowing fore flippers)
SPEC.archelon = (function () {
  var S = { id: 'archelon', kind: 'plesio', cruise: 0.9, f0: 0.12, f1: 0.3, bs: 0.4, depth: 1 };
  S.col = skin({ back: 0x6d5f40, belly: 0xd6c99c, mid: 0x8a7a52, bAt: -0.15, bW: 0.55, mott: 0.08, spots: { f: 3, k: 5, d: 0.12, c: 0x4e432c, a: 0.6 } });
  S.fcol = 0x5f6a47;
  S.body = { keys: [[-1.2, 0.12, 0.08, 0.02], [-0.9, 0.74, 0.28, 0.02], [-0.3, 1.08, 0.45, 0.02], [0.4, 1.06, 0.45, 0.02], [0.9, 0.80, 0.32, 0.02], [1.2, 0.3, 0.14, 0.02]], rings: 10, seg: 16, flatBot: 0.7, ridge: 0.18, superPow: 0.88, extra: function (g) {
    // flared leathery marginal rim skirt around carapace perimeter
    g.lathe([[0.82, -0.02], [0.98, -0.04], [1.14, -0.085], [1.06, -0.12], [0.84, -0.10]], 0x4e4229, { seg: 14, sx: 1.0, sy: 1.0, sz: 1.12, ridgeN: 12, ridgeA: 0.04 });
    // distinct flattened ventral plastron
    g.loft([[-0.92, 0.44, 0.08, -0.10], [-0.45, 0.82, 0.11, -0.12], [0.25, 0.84, 0.11, -0.12], [0.80, 0.54, 0.08, -0.10]], { rings: 6, seg: 10, flatBot: 0.9, superPow: 0.65, cap0: true, cap1: true }, 0xd8cba0);
    // 5 raised longitudinal leathery keel ridges along the carapace dome
    for (var k = -2; k <= 2; k++) {
      var x = k * 0.28, hMax = (0.45 - abs(k) * 0.04) * Math.sqrt(max(0.05, 1 - Math.pow(x / 1.06, 2))) + (k === 0 ? 0.04 : 0.01);
      var zl = 0.86 - abs(k) * 0.13;
      g.tube([
        [x, hMax * 0.56, -zl],
        [x, hMax * 0.92, -zl * 0.45],
        [x, hMax * 1.03, 0.0],
        [x, hMax * 0.94, zl * 0.45],
        [x, hMax * 0.58, zl]
      ], [0.022, 0.036, 0.042, 0.036, 0.022], 0x52452b, { seg: 6, steps: 2, sx: 0.72, sz: 1.15, cap0: true, cap1: true });
    }
  } };
  S.neck = { n: 2, len: 0.4, r1: 0.34, r2: 0.28, at: [0.02, 1.08], arch: [0.05, 0.1], base: 0.0, sway: 0.07, fy: 0.9 };
  S.tail = { n: 1, len: 0.35, r1: 0.14, r2: 0.03, at: [0.0, -1.15], fy: 0.8 };
  S.head = { build: function (g) {
    g.loft([[0, 0.26, 0.21, 0], [0.26, 0.28, 0.22, 0.0], [0.52, 0.18, 0.15, -0.02], [0.74, 0.09, 0.09, -0.04]], { rings: 5, seg: 9, cap0: true, cap1: true }, S.col);
    // hooked raptor-like turtle beak + lower beak jaw
    g.tube([[0, -0.02, 0.68], [0, -0.04, 0.82], [0, -0.14, 0.88]], [0.085, 0.055, 0.012], 0x3b3324, { seg: 6, steps: 2, sx: 0.85, sz: 1.15, cap0: true, cap1: true });
    g.loft([[0.42, 0.11, 0.06, -0.08], [0.68, 0.075, 0.045, -0.095], [0.80, 0.028, 0.025, -0.095]], { rings: 4, seg: 6, cap0: true, cap1: true }, 0x8e825a);
    kEye(g, 0.245, 0.08, 0.34, 0.05, 0xd8b848);
  } };
  S.flip = [];
  [1, -1].forEach(function (sd) {
    S.flip.push({ side: sd, x: 0.85, y: -0.1, z: 0.55, len: 2.0, chord: 0.62, th: 0.055, fore: true, amp: 0.65, ry: -0.5, rz: -0.15, sw: 0.55, tip: 0x56603f, curve: 0.18 });
    S.flip.push({ side: sd, x: 0.7, y: -0.1, z: -0.8, len: 0.95, chord: 0.45, th: 0.05, fore: false, amp: 0.3, ry: -0.9, rz: -0.1, sw: 0.5, curve: 0.06 });
  });
  S.breach = null;
  return S;
})();

// ================================================================ FLYERS (pterosaurs and birds): open wings in flight, folded wings + walking when grounded
function ik2(L1, L2, tx, ty, bend) {
  var d = Math.sqrt(tx * tx + ty * ty), dmax = (L1 + L2) * 0.9995, dmin = abs(L1 - L2) * 1.001 + 1e-4; d = clamp(d, dmin, dmax);
  var psi = Math.atan2(tx, -ty), al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), p1 = psi + bend * al;
  var kx = L1 * sin(p1), ky = -L1 * cos(p1), ex = d * sin(psi), ey = -d * cos(psi);
  IK0 = p1; IK1 = Math.atan2(ex - kx, -(ey - ky));
}
var IK0 = 0, IK1 = 0;
function limbGeos(c, S) {   // c: {L:[l1,l2], r:[a,b,c], foot:fn(g,L2), up:fn?}
  var g = B(), col = c.col || S.legc || 0x5b5040, r = c.r.map(function (v) { return v * (S.legK || 1.35); });
  if (c.musc) {
    g.loft([[0, r[0] * 1.15, r[0] * 1.3, 0], [c.L[0] * 0.35, r[0] * 1.05, r[0] * 1.2, 0.01], [c.L[0] * 0.75, r[1] * 1.15, r[1] * 1.2, 0], [c.L[0], r[1], r[1], 0]], { down: true, rings: 5, seg: 7, cap0: true, cap1: true }, col);
  } else {
    g.limb(0, 0, 0, 0, -c.L[0], 0, r[0], r[1], col, { seg: 6 }); g.sph(r[1] * 1.05, r[1] * 1.05, r[1] * 1.05, 0, -c.L[0], 0, col, { s: [6, 4] });
  }
  var up = g.build(); g = B();
  g.limb(0, 0, 0, 0, -c.L[1], 0, r[1], r[2], col, { seg: 6 });
  if (c.foot) c.foot(g, c.L[1], col);
  return { up: up, lo: g.build() };
}
function flyerGeos(S) {
  if (S._geo) return S._geo; var G = {}, g = B(), b = S.body;
  g.loft(b.keys, { rings: b.rings || 10, seg: b.seg || 10, cap0: true, cap1: true, flatBot: b.flatBot || 0, ridge: b.ridge || 0, superPow: b.superPow || 0 }, S.col); if (b.extra) b.extra(g, S); G.body = g.build();
  G.neck = chainGeos(S, S.neck); G.tail = chainGeos(S, S.tail);
  g = B(); S.head.build(g); G.head = g.build(); g = B(); if (S.head.jaw) S.head.jaw.build(g); G.jaw = S.head.jaw ? g.build() : null;
  G.wing = S.wing ? S.wing.build() : null; G.hind = limbGeos(S.legs.hind, S); G.fore = S.legs.fore ? limbGeos(S.legs.fore, S) : null;
  return (S._geo = G);
}
function createFlyer(S, opts) {
  var sc = opts.baby ? (S.bs || 0.5) : 1, G = flyerGeos(S), root = grp('animal'), rig = grp('rig'), body = grp('body'), I = newI(S, sc), i, par, sd;
  root.add(rig); rig.add(body); rig.scale.setScalar(sc); I.rig = rig; I.body = body; body.rotation.order = 'YXZ'; body.add(mesh(G.body));
  I.neck = []; par = body;
  for (i = 0; i < S.neck.n; i++) { var ng = grp('neck' + i); ng.rotation.order = 'YXZ'; if (i === 0) ng.position.set(0, S.neck.at[0], S.neck.at[1]); else ng.position.set(0, 0, S.neck.len / S.neck.n); par.add(ng); ng.add(mesh(G.neck[i])); I.neck.push(ng); par = ng; }
  var hg = grp('head'); hg.rotation.order = 'YXZ'; hg.position.set(0, 0, S.neck.len / S.neck.n); par.add(hg); hg.add(mesh(G.head)); I.head = hg;
  if (G.jaw) { var jg = grp('jaw'); jg.position.set(0, S.head.jaw.y, S.head.jaw.z); jg.add(mesh(G.jaw)); hg.add(jg); I.jaw = jg; }
  I.tail = []; par = body;
  for (i = 0; i < S.tail.n; i++) { var tg = grp('tail' + i); tg.rotation.order = 'YXZ'; if (i === 0) tg.position.set(0, S.tail.at[0], S.tail.at[1]); else tg.position.set(0, 0, -S.tail.len / S.tail.n); var tm = mesh(G.tail[i]); tm.rotation.y = PI; tg.add(tm); par.add(tg); I.tail.push(tg); par = tg; }
  if (S.tail.vane) { var vg = grp('vane'); vg.position.set(0, 0, -S.tail.len / S.tail.n); vg.add(mesh(S.tail.vane())); I.tail[I.tail.length - 1].add(vg); I.vane = vg; }
  var W = S.wing; I.wing = []; I.wout = []; I.fold = [];
  for (sd = 1; W && sd >= -1; sd -= 2) {
    var wg = grp('wing'); wg.rotation.order = 'ZXY'; wg.position.set(sd * W.at[0], W.at[1], W.at[2]); if (sd < 0) wg.scale.x = -1; wg.add(mesh(G.wing.inner));
    var og = grp('wout'); og.rotation.order = 'ZXY'; og.position.set(W.a, 0, W.fa); og.add(mesh(G.wing.outer)); wg.add(og); body.add(wg); I.wing.push(wg); I.wout.push(og);
    var fg = grp('fold'); fg.position.set(sd * W.at[0], W.at[1], W.at[2]); if (sd < 0) fg.scale.x = -1; fg.add(mesh(G.wing.fold)); body.add(fg); I.fold.push(fg);
  }
  I.legs = []; var L = S.legs, defs = [[L.hind, G.hind, 1, 0], [L.fore, G.fore, 1, 1], [L.hind, G.hind, -1, 0], [L.fore, G.fore, -1, 1]];
  if (!L.fore) defs = [[L.hind, G.hind, 1, 0], [L.hind, G.hind, -1, 0]];
  for (i = 0; i < defs.length; i++) {
    var d = defs[i], q = d[0], hip = grp('hip'); hip.position.set(d[2] * q.x, q.y, q.z); body.add(hip); hip.add(mesh(d[1].up));
    var kn = grp('knee'); kn.position.set(0, -q.L[0], 0); hip.add(kn); kn.add(mesh(d[1].lo));
    I.legs.push({ q: q, hip: hip, kn: kn, side: d[2], front: !!d[3], off: L.fore ? [0, 0.25, 0.5, 0.75][i] : [0, 0.5][i] });
  }
  var out = { group: root, height: 1, update: function (dt, ent) { updFlyer(I, dt, ent); }, _I: I };
  I.gT = 1 + Math.random() * 2; I.gl = false; I.fp = Math.random();
  updFlyer(I, 0.0001, { state: 'idle', speed: 0 }); I.W.fly = 0;
  return finish(root, I, out);
}
function updFlyer(I, dt, ent) {
  if (dt > 0.1) dt = 0.1; if (dt <= 0) dt = 1e-4;
  var S = I.S, W = I.W, t = (I.t += dt), st = ent.state || 'idle', spd = ent.speed || 0, y = ent.y || 0, i, n, flying = !!S.wing && (st === 'fly' || y > 0.6);
  if (st === 'escaped') st = spd > 0.1 ? 'run' : 'idle';
  track(I, dt, ent);
  var moving = spd > 0.05 && st !== 'sleep' && st !== 'eat' && st !== 'drink';
  W.fly = damp(W.fly, flying ? 1 : 0, 3.2, dt); W.gait = damp(W.gait, (!flying && moving) ? 1 : 0, 6, dt);
  W.eat = damp(W.eat, (!flying && (st === 'eat' || st === 'drink')) ? 1 : 0, 4, dt); W.sleep = damp(W.sleep, (!flying && st === 'sleep') ? 1 : 0, 1.8, dt);
  W.run = damp(W.run, (!flying && (st === 'run' || spd > (S.runAt || 3))) ? 1 : 0, 3.5, dt);
  var fl = W.fly, gw = W.gait, ew = W.eat, sw = W.sleep, wal = 1 - fl;
  // glide / flap cycle
  I.gT -= dt; if (I.gT <= 0) { I.gl = !I.gl; I.gT = I.gl ? S.glide[0] + Math.random() * S.glide[1] : S.flap[0] + Math.random() * S.flap[1]; }
  W.glide = damp(W.glide || 0, (I.gl && flying) ? 1 : 0, 1.6, dt); var gl = W.glide;
  I.fp += dt * S.hz * (1 - 0.65 * gl) * (0.8 + 0.3 * clamp(spd / 2, 0, 1)); var fp = I.fp * TAU;
  var A = S.flapA * (1 - 0.88 * gl);
  // ---- wings
  var ws = smooth(fl, 0.1, 0.9);
  for (i = 0; S.wing && i < 2; i++) {
    var sd = i ? -1 : 1, w = I.wing[i], o = I.wout[i], lagp = fp - S.lag - (i ? 0.12 : 0);
    var rz = (S.dih * fl + A * sin(fp)) * 1, oz = (-S.dih * 0.9 * gl + A * S.outer * sin(lagp)) * fl, sweep = lerp(S.fold.sweep, S.sweep + 0.1 * sin(fp + 0.6) * (1 - gl), ws);
    w.rotation.set(-0.08 * cos(fp) * (1 - gl) * fl, sd * sweep, sd * rz); w.scale.set(sd * (0.4 + 0.6 * ws), 1, 0.5 + 0.5 * ws);
    o.rotation.set(0, sd * lerp(S.fold.out, 0.0, ws) , sd * oz); w.visible = fl > 0.12;
    I.fold[i].visible = fl < 0.6;
  }
  // ---- body pose
  var gwt = gw * (1 + 0.5 * W.run), hipH = S.hipH, by = lerp(hipH, S.flyY, fl), p = lerp(S.pitchG, S.pitchF, fl), roll = 0, yaw = 0;
  var ph0 = I.ph; if (gw > 0.02) { I.ph += spd * dt / S.stride; } ph0 = I.ph;
  by += gw * (S.hop || 0) * abs(sin(2 * PI * ph0)) + wal * (-ew * S.eatDrop - sw * hipH * 0.32) + gw * S.bob * (cos(4 * PI * ph0) * 0.5) - fl * S.bobA * cos(fp) * (1 - gl);
  p += -ew * S.eatPitch + 0.03 * sin(t * 1.9 + I.seed) * wal + fl * (0.05 * sin(fp - 0.6) * (1 - gl) + clamp(I.vy, -2, 2) * 0.08);
  roll += gw * 0.035 * sin(2 * PI * ph0) - fl * clamp(I.turn * S.bankK, -0.8, 0.8);
  yaw += gw * 0.03 * sin(2 * PI * ph0 + 1);
  I.body.position.y = by; I.body.rotation.set(-p, yaw, roll);
  // ---- neck / head
  I.lookT -= dt; if (I.lookT <= 0) { I.lookT = 1.5 + Math.random() * 3.5; I.lookTY = Math.random() < 0.3 ? 0 : (Math.random() - 0.5) * 1.2; I.lookTP = (Math.random() - 0.5) * 0.3; }
  I.lookY = damp(I.lookY, I.lookTY, 2.2, dt); I.lookP = damp(I.lookP, I.lookTP, 2.2, dt);
  var nk = S.neck, nn = I.neck.length, prev = p, lk = (1 - ew) * (1 - sw) * wal;
  I.callT -= dt; if (I.callT <= 0) { I.callT = 8 + Math.random() * 14; I.callA = 0; } if (I.callA < 90) I.callA += dt;
  var ce = I.callA < 1.6 ? smooth(I.callA, 0, 0.25) * (1 - smooth(I.callA, 1.0, 1.6)) : 0;
  for (i = 0; i < nn; i++) {
    var a = lerp(nk.G[i], nk.F[i], fl);
    a = lerp(a, nk.E[i], ew); a = lerp(a, nk.S[i], sw);
    a += (I.lookP * lk * 0.5 + ce * (nk.call || 0.25)) + (gw * (S.neckBob || 0.05) * sin(4 * PI * ph0 + 0.5 + i * 0.4)) + 0.015 * sin(t * 1.3 + i * 0.7 + I.seed);
    I.neck[i].rotation.set(-(a - prev), I.lookY * lk * 0.5 / nn + (fl * I.turn * 0.1) / nn, 0); prev = a;
  }
  var ha = lerp(lerp(lerp(S.head.G, S.head.F, fl), S.head.E, ew), S.head.S, sw) + ce * 0.35 + I.lookP * lk * 0.3;
  I.head.rotation.set(-(ha - prev), I.lookY * lk * 0.5, sw * 0.9);
  if (I.jaw) I.jaw.rotation.x = 0.02 + 0.015 * (1 + sin(t * 1.4 + I.seed)) + ce * 0.45 + ew * 0.18 * max(0, sin(t * 6 + I.seed));
  // ---- tail
  var tn = I.tail.length, tprev = -p;
  for (i = 0; i < tn; i++) {
    var ta = lerp(S.tail.G, S.tail.F, fl) + 0.03 * sin(t * 1.1 + i + I.seed) + fl * 0.05 * sin(fp - 0.8 - i * 0.6);
    I.tail[i].rotation.set(ta - tprev, (0.06 * sin(t * 0.9 + I.seed - i) + fl * (0.1 * sin(fp * 0.5 - i) - I.turn * 0.18) + gw * 0.12 * sin(2 * PI * ph0 + 1.2 - i * 0.6)) * (S.tail.amp || 1), 0); tprev = ta;
  }
  if (I.vane) I.vane.rotation.y = 0;
  // ---- legs (IK on the ground, tucked while flying)
  var beta = 0.62, Ls = S.stride * (1 + 0.5 * W.run), lift = S.lift * (1 + 0.6 * W.run);
  for (i = 0; i < I.legs.length; i++) {
    var lg = I.legs[i], q = lg.q, lo = S.hop ? (lg.front ? 0.12 : 0) : lg.off, u = ph0 + lo - Math.floor(ph0 + lo), fx = 0, fy = 0, s;
    if (u < beta) { s = u / beta; fx = Ls * beta * (0.5 - s); } else { s = (u - beta) / (1 - beta); var e = s * s * (3 - 2 * s); fx = Ls * beta * (-0.5 + e); fy = lift * sin(PI * s); }
    if (lg.front) fx *= 0.9;
    var tx = (q.fx || 0) + gw * fx, ty = -(by + q.y) + gw * fy + (sw > 0 ? sw * q.L[1] * 0.4 : 0);
    ik2(q.L[0], q.L[1], tx, ty, lg.front ? -1 : (q.bend === undefined ? 1 : q.bend));
    var r0 = IK0, r1 = IK1;
    if (lg.front) { lg.hip.visible = fl < 0.5; }
    else if (S.tuck) { r0 = lerp(r0, S.tuck[0], fl); r1 = lerp(r1, S.tuck[1], fl); }
    lg.hip.rotation.set(-(r0 + p * 0), 0, lg.side * sw * 0.15); lg.kn.rotation.x = -(r1 - r0);
  }
}
// membrane wing: solid double-walled cambered airfoil (inner arm + membrane, outer wing-finger + membrane, folded patagium)
function ptWing(P) {
  var a = P.a, fa = P.fa, g = B(), o = B(), f = B(), bone = P.bone || 0x4a3d30, Tx = P.tx * a, Tz = P.tz, sz = P.sz || 0.05;
  var memCol = function (x, y, z, nx, ny, nz, u) {
    var base = ny >= 0 ? P.top : P.bot;
    return (P.alt && u > 0.65) ? mixHex(base, shade(base, P.alt), (u - 0.65) / 0.35) : base;
  };
  // inner wing
  g.wingMembrane([
    [[0, 0, sz], [0, -0.006, (sz + P.rz) * 0.5], [0, 0, P.rz]],
    [[a * 0.5, 0.015, lerp(sz, fa, 0.5)], [a * 0.48, 0.005, lerp((sz + P.rz) * 0.5, lerp(fa, Tz, 0.5), 0.5)], [Tx * 0.48, 0, lerp(P.rz, Tz, 0.5)]],
    [[a, 0, fa], [lerp(a, Tx, 0.5), 0, lerp(fa, Tz, 0.5)], [Tx, 0, Tz]]
  ], max(0.008, P.r[0] * 0.85), memCol, { camber: a * 0.04, scallop: 0.16, uSteps: 3, vSteps: 3 });
  g.tube([[0, 0, sz], [a * 0.46, 0.014, lerp(sz, fa, 0.46) + 0.02 * a], [a, 0, fa]], [P.r[0] * 1.15, P.r[1] * 1.05], bone, { seg: 6, steps: 2, cap0: true, cap1: true });
  // outer wing
  var T2 = [Tx - a, 0, Tz - fa], tip = [P.bx, 0, -P.bz];
  var midL = [P.bx * 0.5, 0.016, -P.bz * 0.45], midT = [lerp(T2[0], tip[0], 0.48), 0, lerp(T2[2], tip[2], 0.48) - P.bz * 0.08];
  var tipT = [tip[0] - 0.02 * P.bx, 0, tip[2] - max(0.012, P.r[2] * 1.6)];
  o.wingMembrane([
    [[0, 0, 0], [T2[0] * 0.5, 0, T2[2] * 0.5], T2],
    [midL, [lerp(midL[0], midT[0], 0.5), 0.005, lerp(midL[2], midT[2], 0.5)], midT],
    [tip, tipT]
  ], max(0.006, P.r[1] * 0.85), memCol, { camber: P.bx * 0.03, scallop: 0.18, uSteps: 3, vSteps: 3 });
  o.tube([[0, 0, 0], midL, tip], [P.r[1] * 1.1, P.r[1] * 0.72, max(0.003, P.r[2] * 0.65)], bone, { seg: 6, steps: 2, cap0: true, cap1: true });
  if (P.claw) {
    for (var c = -1; c <= 1; c++) o.cone(P.r[1] * 0.38, P.r[1] * 2.4, c * P.r[1] * 0.55 - P.r[1] * 0.4, P.r[1] * 0.5, P.r[1] * 1.2, 0x2a221a, { seg: 4, rot: [PI * 0.42, 0, c * 0.22] });
  }
  // folded wing
  var E = P.E, F = P.F, R = P.R;
  f.wingMembrane([
    [[0, 0, 0], [R[0] * 0.25, R[1] * 0.25, R[2] * 0.25]],
    [E, [lerp(E[0], R[0], 0.5), lerp(E[1], R[1], 0.5), lerp(E[2], R[2], 0.5)], R],
    [F, [F[0] - 0.012, F[1] - 0.012, F[2] - 0.02]]
  ], max(0.006, P.r[0] * 0.8), memCol, { camber: 0.018, scallop: 0.12, uSteps: 2, vSteps: 3 });
  f.tube([[0, 0, 0], E, F], [P.r[0] * 1.15, P.r[1] * 1.08, max(0.003, P.r[2] * 0.68)], bone, { seg: 6, steps: 2, cap0: true, cap1: true });
  if (P.claw) f.cone(P.r[1] * 0.4, P.r[1] * 2.2, E[0] + P.r[1] * 0.4, E[1] + P.r[1] * 0.5, E[2] + P.r[1] * 1.1, 0x2a221a, { seg: 4, rot: [PI * 0.42, 0, 0] });
  return { inner: g.build(), outer: o.build(), fold: f.build() };
}
function footTalon(sx, sy, sz, col) { return function (g, L2, c) { g.sph(sx, sy, sz, 0, -L2, sz * 0.7, c, { s: [6, 4] }); for (var k = -1; k <= 1; k++) g.cone(sx * 0.35, sz * 0.7, k * sx * 0.7, -L2 - sy * 0.2, sz * 1.7, 0x2c241c, { seg: 3, rot: [PI / 2, 0, 0] }); }; }

// ---- Pteranodon: toothless fish-hunter, huge swept wings, long crested head
SPEC.pteranodon = (function () {
  var S = { id: 'pteranodon', kind: 'flyer', hz: 0.55, flapA: 0.55, dih: 0.12, outer: 0.7, lag: 1.0, sweep: 0.22, fold: { sweep: 1.4, out: 2.9 }, flyY: 0.55, hipH: 0.66, pitchG: 0.12, pitchF: 0.0, bob: 0.02, bobA: 0.05, bankK: 0.5, eatDrop: 0.1, eatPitch: 0.1, stride: 0.75, lift: 0.1, tuck: [-1.45, -1.35], glide: [3, 4], flap: [3, 4], bs: 0.5, runAt: 3.5, neckBob: 0.05 };
  S.col = skin({ back: 0x6a5b49, belly: 0xc2b697, mid: 0x8c7a5e, bAt: -0.1, bW: 0.6, mott: 0.06 });
  S.legc = 0x6a5b49;
  S.body = { keys: [[-0.42, 0.03, 0.03, 0.0], [-0.3, 0.1, 0.1, 0.0], [-0.05, 0.15, 0.15, 0.01], [0.25, 0.16, 0.16, 0.02], [0.45, 0.09, 0.1, 0.04]], rings: 8, seg: 9 };
  S.neck = { n: 2, len: 0.6, r1: 0.09, r2: 0.065, at: [0.08, 0.42], fy: 0.95, G: [0.95, 0.05], F: [0.2, 0.08], E: [-0.5, -1.0], S: [0.5, 1.0], call: 0.25 };
  S.head = { G: -0.3, F: -0.08, E: -1.2, S: -0.6, jaw: { y: -0.04, z: 0.08, build: function (g) {
    g.loft([[0, 0.05, 0.03, -0.01], [0.35, 0.04, 0.025, -0.015], [1.05, 0.014, 0.011, -0.025], [1.25, 0.006, 0.006, -0.03]], { rings: 4, seg: 6, cap0: true, cap1: true }, 0xcf9a5a);
  } }, build: function (g) {
    g.loft([[0, 0.07, 0.075, 0], [0.18, 0.085, 0.085, 0.005], [0.45, 0.055, 0.05, -0.005], [0.85, 0.028, 0.026, -0.012], [1.35, 0.01, 0.01, -0.016]], { rings: 6, seg: 7, cap0: true, cap1: true }, 0xcf9a5a);
    g.extrude([[0.03, 0.08], [0.14, -0.06], [0.26, -0.36], [0.3, -0.54], [0.19, -0.46], [0.07, -0.22], [-0.01, -0.03]], 0.022, 0, 0, 0, [0, 0, 0], 0xb1523a, { axis: 'x', bev: 0.006 });
    kEye(g, 0.075, 0.025, 0.12, 0.026, 0xe8c850);
  } };
  S.tail = { n: 1, len: 0.2, r1: 0.05, r2: 0.012, at: [0.0, -0.4], G: -0.4, F: 0.0 };
  S.wing = { at: [0.13, 0.08, 0.26], a: 1.15, fa: -0.12, build: function () { return ptWing({ a: 1.15, fa: -0.12, bx: 1.75, bz: 0.75, sz: 0.05, rz: -0.5, tx: 0.88, tz: -0.66, top: 0x7e6a52, bot: 0xb59c76, alt: 0.86, r: [0.036, 0.024, 0.012], E: [0.12, 0.34, -0.42], F: [0.1, 0.06, -1.2], R: [-0.05, -0.02, -0.55], claw: true }); } };
  S.legs = { hind: { x: 0.11, y: -0.07, z: -0.2, L: [0.3, 0.32], r: [0.04, 0.026, 0.016], fx: 0.0, foot: footTalon(0.03, 0.016, 0.07) },
    fore: { x: 0.13, y: -0.07, z: 0.28, L: [0.4, 0.4], r: [0.034, 0.022, 0.016], fx: 0.1, foot: footTalon(0.03, 0.016, 0.06) } };
  return S;
})();

// ---- Quetzalcoatlus: giraffe-sized azhdarchid; stalks on all fours with a stiff upright neck
SPEC.quetzalcoatlus = (function () {
  var S = { id: 'quetzalcoatlus', kind: 'flyer', hz: 0.3, flapA: 0.38, dih: 0.1, outer: 0.7, lag: 1.1, sweep: 0.18, fold: { sweep: 1.45, out: 2.95 }, flyY: 1.1, hipH: 2.02, pitchG: 0.12, pitchF: 0.0, bob: 0.06, bobA: 0.12, bankK: 0.4, eatDrop: 0.25, eatPitch: 0.25, stride: 1.9, lift: 0.22, tuck: [-1.45, -1.35], glide: [5, 6], flap: [2.5, 3], bs: 0.45, runAt: 3.2, neckBob: 0.04 };
  S.col = skin({ back: 0x7c6454, belly: 0xd6c6a6, mid: 0xa08468, bAt: -0.1, bW: 0.6, mott: 0.07 });
  S.legc = 0x7c6454;
  S.body = { keys: [[-0.8, 0.06, 0.06, 0.0], [-0.55, 0.22, 0.22, 0.0], [-0.1, 0.32, 0.32, 0.02], [0.45, 0.32, 0.32, 0.03], [0.9, 0.16, 0.18, 0.07]], rings: 9, seg: 10 };
  S.neck = { n: 4, len: 2.8, r1: 0.17, r2: 0.09, at: [0.15, 0.85], fy: 0.95, G: [1.15, 1.3, 1.35, 1.25], F: [0.35, 0.25, 0.15, 0.12], E: [0.4, -0.2, -0.7, -1.0], S: [0.6, 0.9, 1.1, 1.2], call: 0.12 };
  S.head = { G: -0.1, F: -0.1, E: -1.0, S: -0.4, jaw: { y: -0.07, z: 0.1, build: function (g) {
    g.loft([[0, 0.07, 0.04, -0.02], [0.4, 0.06, 0.035, -0.025], [1.4, 0.022, 0.015, -0.03], [1.8, 0.008, 0.008, -0.03]], { rings: 5, seg: 6, cap0: true, cap1: true }, 0xd9c9a0);
  } }, build: function (g) {
    g.loft([[0, 0.1, 0.11, 0], [0.25, 0.115, 0.1, 0.0], [0.7, 0.065, 0.06, -0.005], [1.4, 0.03, 0.026, -0.012], [1.95, 0.01, 0.01, -0.016]], { rings: 7, seg: 7, cap0: true, cap1: true }, 0xd9c9a0);
    g.extrude([[0.05, 0.28], [0.14, 0.12], [0.19, -0.08], [0.14, -0.26], [0.05, -0.18], [0.02, 0.04]], 0.024, 0, 0, 0, [0, 0, 0], 0xa8503a, { axis: 'x', bev: 0.006 });
    kEye(g, 0.105, 0.03, 0.14, 0.032, 0xe0b040);
  } };
  S.tail = { n: 1, len: 0.25, r1: 0.07, r2: 0.02, at: [0.0, -0.8], G: -0.4, F: 0.0 };
  S.wing = { at: [0.3, 0.2, 0.5], a: 2.0, fa: -0.2, build: function () { return ptWing({ a: 2.0, fa: -0.2, bx: 2.9, bz: 1.1, sz: 0.1, rz: -0.9, tx: 0.88, tz: -1.15, top: 0x8c6a56, bot: 0xc7a687, alt: 0.88, r: [0.07, 0.045, 0.02], E: [0.2, 0.55, -0.8], F: [0.15, 0.12, -2.2], R: [-0.1, -0.1, -1.0], claw: true }); } };
  S.legs = { hind: { x: 0.22, y: -0.15, z: -0.35, L: [0.95, 1.0], r: [0.1, 0.065, 0.04], fx: 0.0, foot: footTalon(0.07, 0.03, 0.14) },
    fore: { x: 0.28, y: -0.12, z: 0.6, L: [1.1, 1.15], r: [0.08, 0.055, 0.035], fx: 0.15, foot: footTalon(0.06, 0.03, 0.12) } };
  return S;
})();

// ---- Dimorphodon: small, big-headed, long-tailed early pterosaur
SPEC.dimorphodon = (function () {
  var S = { id: 'dimorphodon', kind: 'flyer', hz: 1.7, flapA: 0.6, dih: 0.1, outer: 0.7, lag: 0.9, sweep: 0.15, fold: { sweep: 1.4, out: 2.9 }, flyY: 0.22, hipH: 0.24, pitchG: 0.05, pitchF: -0.02, bob: 0.01, bobA: 0.02, bankK: 0.55, eatDrop: 0.05, eatPitch: 0.15, stride: 0.3, lift: 0.04, tuck: [-1.45, -1.3], glide: [1, 1.5], flap: [2, 3], bs: 0.55, runAt: 3, neckBob: 0.06 };
  S.col = skin({ back: 0x485560, belly: 0xbdae8c, mid: 0x6c7479, bAt: -0.1, bW: 0.6, mott: 0.06, bars: { f: 8, w: 0.3, c: 0x333d46, ph: 0.2, ca0: 0.1, k: 0.5, from: -0.2, to: 0.2 } });
  S.legc = 0x4f565b;
  S.body = { keys: [[-0.2, 0.02, 0.02, 0.0], [-0.14, 0.05, 0.05, 0.0], [0.0, 0.075, 0.075, 0.0], [0.13, 0.075, 0.075, 0.01], [0.22, 0.04, 0.045, 0.02]], rings: 6, seg: 8 };
  S.neck = { n: 1, len: 0.12, r1: 0.04, r2: 0.04, at: [0.03, 0.2], fy: 0.95, G: [0.6], F: [0.15], E: [-0.4], S: [0.3], call: 0.2 };
  S.head = { G: -0.2, F: -0.05, E: -1.0, S: -0.5, jaw: { y: -0.03, z: 0.03, build: function (g) {
    g.loft([[0, 0.035, 0.028, -0.005], [0.14, 0.03, 0.025, -0.01], [0.27, 0.01, 0.012, -0.012]], { rings: 3, seg: 6, cap0: true, cap1: true }, 0x9a8a68);
    teeth(g, [0.08, 0.14, 0.2], 0.018, 0.018, 0.025, 0.007, true, 0xf1ecd8, 0.2);
  } }, build: function (g) {
    g.loft([[0, 0.05, 0.065, 0], [0.09, 0.065, 0.078, 0.006], [0.18, 0.05, 0.065, 0.0], [0.28, 0.02, 0.03, -0.012], [0.3, 0.008, 0.012, -0.015]], { rings: 5, seg: 8, cap0: true, cap1: true }, S.col);
    g.sph(0.052, 0.03, 0.09, 0, 0.0, 0.15, 0xcf8a52, { rot: [0, 0, 0], s: [6, 4] }); kEye(g, 0.06, 0.03, 0.1, 0.026, 0xe8c850); teeth(g, [0.17, 0.21, 0.25], 0.02, -0.02, 0.03, 0.008, false, 0xf1ecd8, 0.2);
  } };
  S.tail = { n: 4, len: 0.6, r1: 0.04, r2: 0.008, at: [0.0, -0.2], G: -0.1, F: 0.0, amp: 0.7 };
  S.wing = { at: [0.05, 0.05, 0.1], a: 0.26, fa: -0.04, build: function () { return ptWing({ a: 0.26, fa: -0.04, bx: 0.4, bz: 0.14, sz: 0.03, rz: -0.14, tx: 0.88, tz: -0.2, top: 0x6a5446, bot: 0xa4896a, alt: 0.88, r: [0.014, 0.01, 0.005], E: [0.04, 0.12, -0.12], F: [0.03, 0.03, -0.38], R: [-0.02, -0.01, -0.16], claw: true }); } };
  S.legs = { hind: { x: 0.045, y: -0.04, z: -0.08, L: [0.1, 0.11], r: [0.016, 0.011, 0.007], fx: 0.0, foot: footTalon(0.015, 0.008, 0.03) },
    fore: { x: 0.055, y: -0.04, z: 0.1, L: [0.11, 0.11], r: [0.014, 0.01, 0.007], fx: 0.05, foot: footTalon(0.012, 0.008, 0.025) } };
  return S;
})();

// ---- Rhamphorhynchus: long tail ending in a diamond vane, narrow wings, forward-pointing teeth
SPEC.rhamphorhynchus = (function () {
  var S = { id: 'rhamphorhynchus', kind: 'flyer', hz: 1.4, flapA: 0.5, dih: 0.1, outer: 0.7, lag: 1.0, sweep: 0.2, fold: { sweep: 1.4, out: 2.9 }, flyY: 0.2, hipH: 0.22, pitchG: 0.08, pitchF: 0.0, bob: 0.01, bobA: 0.025, bankK: 0.55, eatDrop: 0.04, eatPitch: 0.15, stride: 0.28, lift: 0.04, tuck: [-1.4, -1.3], glide: [2, 3], flap: [2, 3], bs: 0.55, runAt: 3, neckBob: 0.06 };
  S.col = skin({ back: 0x4f5b41, belly: 0xc8b98e, mid: 0x72785a, bAt: -0.1, bW: 0.6, mott: 0.06 });
  S.legc = 0x514b3a;
  S.body = { keys: [[-0.16, 0.02, 0.02, 0.0], [-0.1, 0.05, 0.05, 0.0], [0.02, 0.07, 0.07, 0.0], [0.14, 0.07, 0.07, 0.01], [0.22, 0.035, 0.04, 0.02]], rings: 6, seg: 8 };
  S.neck = { n: 1, len: 0.14, r1: 0.035, r2: 0.035, at: [0.03, 0.2], fy: 0.95, G: [0.6], F: [0.1], E: [-0.4], S: [0.3], call: 0.2 };
  S.head = { G: -0.3, F: -0.05, E: -1.0, S: -0.5, jaw: { y: -0.025, z: 0.03, build: function (g) {
    g.loft([[0, 0.03, 0.022, -0.005], [0.12, 0.025, 0.018, -0.01], [0.22, 0.008, 0.008, -0.012]], { rings: 3, seg: 6, cap0: true, cap1: true }, 0xa59a74);
    teeth(g, [0.07, 0.12, 0.17, 0.2], 0.012, 0.014, 0.04, 0.005, true);
  } }, build: function (g) {
    g.loft([[0, 0.04, 0.045, 0], [0.08, 0.05, 0.05, 0.004], [0.2, 0.025, 0.026, -0.006], [0.27, 0.008, 0.01, -0.012]], { rings: 5, seg: 7, cap0: true, cap1: true }, 0x7d7a58);
    kEye(g, 0.046, 0.02, 0.07, 0.022, 0xe8c850); teeth(g, [0.12, 0.17, 0.22], 0.012, -0.014, 0.04, 0.005, false);
  } };
  S.tail = { n: 5, len: 0.85, r1: 0.03, r2: 0.006, at: [0.0, -0.15], G: -0.05, F: 0.0, amp: 0.45, vane: function () {
    var g = B();
    g.extrude([[0, 0.02], [0.075, -0.09], [0, -0.23], [-0.075, -0.09]], 0.012, 0, 0, 0, [0, 0, 0], function (x, y, z, nx, ny) { return ny >= 0 ? 0x9a4a38 : 0xc07a5a; }, { axis: 'y', bev: 0.004 });
    g.tube([[0, 0, 0.02], [0, 0, -0.22]], [0.006, 0.002], 0x5c3828, { seg: 5, cap0: true, cap1: true });
    return g.build();
  } };
  S.wing = { at: [0.045, 0.05, 0.09], a: 0.34, fa: -0.05, build: function () { return ptWing({ a: 0.34, fa: -0.05, bx: 0.52, bz: 0.2, sz: 0.03, rz: -0.14, tx: 0.88, tz: -0.2, top: 0x6c5b44, bot: 0xad946f, alt: 0.88, r: [0.012, 0.009, 0.005], E: [0.04, 0.12, -0.14], F: [0.03, 0.03, -0.46], R: [-0.02, -0.01, -0.16], claw: true }); } };
  S.legs = { hind: { x: 0.04, y: -0.04, z: -0.07, L: [0.09, 0.1], r: [0.014, 0.01, 0.006], fx: 0.0, foot: footTalon(0.013, 0.007, 0.028) },
    fore: { x: 0.05, y: -0.04, z: 0.1, L: [0.1, 0.1], r: [0.012, 0.009, 0.006], fx: 0.05, foot: footTalon(0.011, 0.007, 0.024) } };
  return S;
})();

// feathered wing: cambered 3D airfoil + sculpted layered primary feather tips
function birdWing(P) {
  var a = P.a, fa = P.fa, g = B(), o = B(), f = B(), bone = P.bone || P.bcol, Tx = P.tx * a, Tz = P.tz, k, nf = P.nf || 5;
  var topC = P.top, top2 = P.top2 || P.top, botC = P.bot;
  var innerCol = function (x, y, z, nx, ny, nz, u) { return ny >= 0 ? (u > 0.68 ? shade(topC, P.alt || 0.9) : topC) : botC; };
  var outerCol = function (x, y, z, nx, ny, nz, u, v) {
    if (ny < 0) return v > 0.72 && P.tipc ? mixHex(botC, P.tipc, (v - 0.72) / 0.28) : botC;
    var c = u > 0.68 ? shade(top2, P.alt || 0.9) : top2;
    return v > 0.68 && P.tipc ? mixHex(c, P.tipc, (v - 0.68) / 0.32) : c;
  };
  // inner cambered wing airfoil
  g.wingMembrane([
    [[0, 0, P.sz], [0, 0.006, (P.sz + P.rz) * 0.5], [0, 0, P.rz]],
    [[a * 0.5, 0.012, lerp(P.sz, fa, 0.5)], [a * 0.5, 0.01, lerp((P.sz + P.rz) * 0.5, lerp(fa, Tz, 0.5), 0.5)], [Tx * 0.5, 0, lerp(P.rz, Tz, 0.5)]],
    [[a, 0, fa], [lerp(a, Tx, 0.5), 0.005, lerp(fa, Tz, 0.5)], [Tx, 0, Tz]]
  ], max(0.014, P.r[0] * 1.45), innerCol, { camber: a * 0.06, scallop: 0.08, uSteps: 3, vSteps: 3 });
  g.tube([[0, 0, P.sz], [a * 0.5, 0.01, lerp(P.sz, fa, 0.5) + 0.01 * a], [a, 0, fa]], [P.r[0] * 1.25, P.r[1] * 1.1], bone, { seg: 6, steps: 2, cap0: true, cap1: true });
  // outer wing airfoil + layered sculpted primary feather tips
  var T2 = [Tx - a, 0, Tz - fa], tip = [P.bx * 0.8, 0, -P.bz * 0.8];
  var tipT = [P.bx * 0.68, 0, -P.bz * 0.8 - max(0.03, P.bz * 0.6)];
  o.wingMembrane([
    [[0, 0, 0], [T2[0] * 0.5, 0.006, T2[2] * 0.5], T2],
    [[tip[0] * 0.5, 0.01, tip[2] * 0.5], [lerp(tip[0] * 0.5, lerp(T2[0], tipT[0], 0.5), 0.5), 0.006, lerp(tip[2] * 0.5, lerp(T2[2], tipT[2], 0.5), 0.5)], [lerp(T2[0], tipT[0], 0.5), 0, lerp(T2[2], tipT[2], 0.5)]],
    [tip, tipT]
  ], max(0.01, P.r[1] * 1.3), outerCol, { camber: P.bx * 0.04, scallop: 0.09, uSteps: 3, vSteps: 3 });
  o.tube([[0, 0, 0], [P.bx * 0.42, 0.008, -P.bz * 0.42], tip], [P.r[1] * 1.15, P.r[1] * 0.85, P.r[2] * 0.8], bone, { seg: 6, steps: 2, cap0: true, cap1: true });
  for (k = 0; k < nf; k++) {
    var q = k / max(1, nf - 1), fx = lerp(P.bx * 0.64, P.bx * 0.86, q), fz = lerp(-P.bz * 0.85, -P.bz * 0.55, q);
    var flen = P.bx * lerp(0.24, 0.36, 1 - q * 0.5), fw = max(0.014, P.bz * 0.22);
    o.extrude([[0, fw * 0.5], [flen * 0.72, fw * 0.42], [flen, 0], [flen * 0.72, -fw * 0.42], [0, -fw * 0.5]], max(0.005, P.r[1] * 0.55), fx, 0.002 * (nf - k), fz, [0, 0.22 - q * 0.42, 0.03 * (k - nf * 0.5)], P.tipc || 0x222226, { axis: 'y', bev: max(0.0015, P.r[2] * 0.25), taper: 0.8 });
  }
  P.foldBuild(f);
  return { inner: g.build(), outer: o.build(), fold: f.build() };
}
function birdFold(f, bodyCol, tipCol, len, h, w) {
  f.loft([
    [-len * 0.92, w * 0.25, h * 0.28, 0.01],
    [-len * 0.55, w * 0.85, h * 0.85, 0.0],
    [-len * 0.18, w, h, -0.01],
    [0.03, w * 0.55, h * 0.65, 0.0]
  ], { rings: 5, seg: 8, ox: 0.018, oy: -0.015, cap0: true, cap1: true, flatBot: 0.45, superPow: 0.85 }, bodyCol);
  for (var k = 0; k < 4; k++) {
    var zOff = -len * (0.76 + k * 0.11), yOff = -0.01 + k * 0.008;
    f.extrude([[0.018, 0.03], [0.004, -0.06], [-0.016, -0.075], [-0.012, 0.02]], w * 0.48, 0.022 - k * 0.003, yOff, zOff, [0.12 - k * 0.04, 0, 0], tipCol, { axis: 'x', bev: w * 0.12, taper: 0.75 });
  }
}
function webFoot(sx, sz, col) {
  return function (g, L2) {
    g.extrude([[0, 0], [sx * 0.95, sz * 1.15], [sx * 0.35, sz * 1.25], [0, sz * 1.38], [-sx * 0.35, sz * 1.25], [-sx * 0.95, sz * 1.15]], max(0.006, sx * 0.2), 0, -L2 + 0.003, 0, [0, 0, 0], col, { axis: 'y', bev: max(0.0015, sx * 0.06), taper: 0.9 });
    for (var k = -1; k <= 1; k++) {
      g.tube([[0, -L2 + 0.006, 0], [k * sx * 0.45, -L2 + 0.005, sz * 0.68], [k * sx * 0.88, -L2 + 0.003, sz * (k === 0 ? 1.42 : 1.22)]], [max(0.003, sx * 0.16), max(0.002, sx * 0.08)], shade(col, 0.92), { seg: 5, steps: 2, cap0: true, cap1: true });
    }
  };
}
function beakGeo(g, len, r, z0, y, col, hook) {
  var bnd = hook ? -r * 0.65 : 0;
  g.loft([[0, r, r * 1.05, 0], [len * 0.35, r * 0.78, r * 0.85, -r * 0.05], [len * 0.75, r * 0.42, r * 0.48, -r * 0.15], [len, r * 0.1, r * 0.12, hook ? -r * 0.65 : -r * 0.2]], { rings: 5, seg: 6, oy: y, oz: z0, cap0: true, cap1: true, superPow: 1.15, bendY: bnd }, col);
  if (hook) g.tube([[0, y - r * 0.15, z0 + len * 0.84], [0, y - r * 0.35, z0 + len * 0.98], [0, y - r * 1.15, z0 + len * 1.01]], [r * 0.32, r * 0.22, r * 0.08], shade(col, 0.9), { seg: 5, steps: 2, cap0: false, cap1: true });
}

// ---- Seagull (modern): grey-backed gull, black wing tips, yellow beak
SPEC.seagull = (function () {
  var S = { id: 'seagull', kind: 'flyer', bird: true, hz: 2.6, flapA: 0.55, dih: 0.1, outer: 0.65, lag: 0.7, sweep: 0.15, fold: { sweep: 1.4, out: 2.9 }, flyY: 0.2, hipH: 0.24, pitchG: 0.2, pitchF: 0.0, bob: 0.015, bobA: 0.03, bankK: 0.55, eatDrop: 0.03, eatPitch: 0.35, stride: 0.2, lift: 0.04, tuck: [-1.3, -1.35], glide: [2.5, 4], flap: [2, 3], bs: 0.55, runAt: 3, neckBob: 0.1, legK: 1.0 };
  S.col = skin({ back: 0xf3f4f2, belly: 0xffffff, mid: 0xf3f4f2, bAt: -0.1, bW: 0.6, mott: 0.02, dors: { c: 0x9aa4ad, k: 0.9 } });
  S.legc = 0xe39a82;
  S.body = { keys: [[-0.22, 0.015, 0.015, 0.0], [-0.14, 0.06, 0.06, 0.0], [0.0, 0.1, 0.095, 0.0], [0.14, 0.085, 0.085, 0.015], [0.24, 0.035, 0.04, 0.03]], rings: 7, seg: 9 };
  S.neck = { n: 1, len: 0.12, r1: 0.05, r2: 0.04, at: [0.05, 0.2], fy: 1, G: [0.8], F: [0.25], E: [-0.5], S: [0.4], call: 0.3 };
  S.head = { G: -0.3, F: -0.05, E: -1.0, S: 0.0, jaw: { y: -0.012, z: 0.07, build: function (g) { beakGeo(g, 0.06, 0.012, 0.0, 0, 0xe8b830); } },
    build: function (g) {
      g.loft([[0, 0.032, 0.036, 0], [0.05, 0.042, 0.044, 0.004], [0.1, 0.035, 0.036, 0.0], [0.15, 0.012, 0.014, -0.004]], { rings: 4, seg: 8, cap0: true, cap1: true }, S.col);
      beakGeo(g, 0.075, 0.016, 0.12, -0.004, 0xe8b830, true); kEye(g, 0.034, 0.012, 0.07, 0.01, 0xe8d040); g.sph(0.004, 0.004, 0.004, 0.0, 0, 0, 0, { s: [3, 2] });
    } };
  S.tail = { n: 1, len: 0.14, r1: 0.04, r2: 0.04, at: [0.0, -0.2], G: -0.1, F: 0.0, extra: function (g, i, sl) {
    g.extrude([[0, 0.02], [0.075, sl * 1.15], [0, sl * 1.2], [-0.075, sl * 1.15]], 0.01, 0, 0.005, 0, [0, 0, 0], 0xf4f5f4, { axis: 'y', bev: 0.003, taper: 0.9 });
  } };
  S.wing = { at: [0.07, 0.06, 0.08], a: 0.27, fa: -0.02, build: function () { return birdWing({ a: 0.27, fa: -0.02, bx: 0.36, bz: 0.08, sz: 0.04, rz: -0.18, tx: 0.9, tz: -0.2, nf: 5, top: 0x8d99a5, top2: 0x98a3ae, bot: 0xf4f5f4, alt: 0.92, tipc: 0x1f2024, bcol: 0xc4c8cc, r: [0.016, 0.012, 0.006],
    foldBuild: function (f) { birdFold(f, 0xa4aeb8, 0x1f2024, 0.34, 0.055, 0.028); } }); } };
  S.legs = { hind: { x: 0.035, y: -0.05, z: -0.01, L: [0.1, 0.1], r: [0.016, 0.01, 0.007], fx: 0.02, bend: -1, col: 0xe39a82, foot: webFoot(0.035, 0.05, 0xe39a82) } };
  return S;
})();

// ---- Grey heron (modern): tall wader with an S-neck and dagger bill
SPEC.heron = (function () {
  var S = { id: 'heron', kind: 'flyer', bird: true, hz: 1.5, flapA: 0.5, dih: 0.08, outer: 0.55, lag: 0.8, sweep: 0.12, fold: { sweep: 1.4, out: 2.9 }, flyY: 0.55, hipH: 0.93, pitchG: 0.3, pitchF: 0.0, bob: 0.01, bobA: 0.04, bankK: 0.5, eatDrop: 0.05, eatPitch: 0.5, stride: 0.5, lift: 0.1, tuck: [-1.5, -1.5], glide: [3, 4], flap: [3, 4], bs: 0.55, runAt: 3, neckBob: 0.1 };
  S.col = skin({ back: 0x8f9aa3, belly: 0xe8eaea, mid: 0xaab2b8, bAt: -0.1, bW: 0.6, mott: 0.03, dors: { c: 0x7d8991, k: 0.8 } });
  S.legc = 0x9a8a5a;
  S.body = { keys: [[-0.3, 0.02, 0.02, 0.0], [-0.2, 0.07, 0.07, 0.0], [0.0, 0.11, 0.12, 0.0], [0.18, 0.1, 0.11, 0.02], [0.3, 0.04, 0.05, 0.05]], rings: 7, seg: 9 };
  S.neck = { n: 4, len: 0.55, r1: 0.04, r2: 0.028, at: [0.08, 0.28], fy: 1, G: [1.0, 1.35, 0.5, 0.9], F: [0.9, -0.5, 0.7, -0.1], E: [-0.4, -1.0, -1.2, -1.3], S: [0.5, 0.8, 0.0, -0.4], call: 0.1 };
  S.head = { G: -0.3, F: 0.0, E: -1.3, S: 0.0, jaw: { y: -0.014, z: 0.06, build: function (g) { beakGeo(g, 0.14, 0.014, 0.0, 0, 0xd6b24a); } },
    build: function (g) {
      g.loft([[0, 0.022, 0.026, 0], [0.04, 0.028, 0.03, 0.002], [0.09, 0.022, 0.024, 0.0], [0.13, 0.01, 0.012, 0.0]], { rings: 3, seg: 7, cap0: true, cap1: true }, 0xeceeee);
      beakGeo(g, 0.17, 0.018, 0.1, 0.0, 0xd6b24a);
      g.tube([[0.012, 0.022, 0.02], [0.014, 0.032, -0.04], [0.008, 0.022, -0.12]], [0.007, 0.002], 0x2b2f35, { seg: 5, steps: 2, cap0: true, cap1: true });
      g.tube([[-0.012, 0.022, 0.02], [-0.014, 0.032, -0.04], [-0.008, 0.022, -0.12]], [0.007, 0.002], 0x2b2f35, { seg: 5, steps: 2, cap0: true, cap1: true });
      kEye(g, 0.025, 0.012, 0.06, 0.008, 0xe8d040);
    } };
  S.tail = { n: 1, len: 0.14, r1: 0.04, r2: 0.04, at: [0.0, -0.3], G: -0.1, F: 0.0, extra: function (g, i, sl) {
    g.extrude([[0, 0.02], [0.055, sl * 1.1], [0, sl * 1.15], [-0.055, sl * 1.1]], 0.01, 0, 0.005, 0, [0, 0, 0], 0x8e99a2, { axis: 'y', bev: 0.003, taper: 0.9 });
  } };
  S.wing = { at: [0.09, 0.07, 0.1], a: 0.42, fa: -0.04, build: function () { return birdWing({ a: 0.42, fa: -0.04, bx: 0.46, bz: 0.1, sz: 0.05, rz: -0.28, tx: 0.88, tz: -0.3, nf: 5, top: 0x8f9aa3, top2: 0x6e7981, bot: 0xc8ced2, alt: 0.9, tipc: 0x2f343a, bcol: 0x7c868e, r: [0.018, 0.013, 0.007],
    foldBuild: function (f) { birdFold(f, 0x8f9aa3, 0x2f343a, 0.42, 0.065, 0.032); } }); } };
  S.legs = { hind: { x: 0.04, y: -0.1, z: -0.02, L: [0.42, 0.44], r: [0.018, 0.009, 0.007], fx: 0.02, bend: -1, col: 0x9a8a5a, foot: webFoot(0.02, 0.07, 0x7a6e48) } };
  return S;
})();

// ================================================================ MODERN LAND MAMMALS (use the flyer rig without wings: walk / run / eat / sleep / look; rabbit hops)
function hoof(sx, sz) {
  return function (g, L2) {
    for (var s = -1; s <= 1; s += 2) {
      g.loft([
        [0, sx * 0.42, sx * 0.55, 0],
        [sz * 0.75, sx * 0.38, sx * 0.45, -sx * 0.12],
        [sz * 1.15, sx * 0.2, sx * 0.26, -sx * 0.22]
      ], { rings: 3, seg: 6, ox: s * sx * 0.46, oy: -L2 + sx * 0.48, oz: -sz * 0.12, cap0: true, cap1: true, flatBot: 0.8 }, 0x2b2622);
      g.cone(sx * 0.22, sx * 0.55, s * sx * 0.42, -L2 + sx * 1.35, -sz * 0.35, 0x352e28, { seg: 4, rot: [PI * 0.65, 0, 0] });
    }
  };
}
function earPair(g, x, y, z, rx, ry, rz, tilt, col, inner, pitch) {
  var cX = 0.28 / max(0.01, rx);
  var poly = [[0, -ry], [rx * 0.92, -ry * 0.32], [rx * 0.82, ry * 0.45], [0, ry], [-rx * 0.82, ry * 0.45], [-rx * 0.92, -ry * 0.32]];
  var ipoly = inner ? [[0, -ry * 0.75], [rx * 0.58, -ry * 0.22], [rx * 0.5, ry * 0.32], [0, ry * 0.72], [-rx * 0.5, ry * 0.32], [-rx * 0.58, -ry * 0.22]] : null;
  for (var s = -1; s <= 1; s += 2) {
    var rot = [pitch !== undefined ? pitch : 0.2, s * -0.18, s * tilt];
    g.extrude(poly, rz * 1.8, s * x, y, z, rot, col, { axis: 'z', bev: rz * 0.35, curveX: cX, taper: 0.88 });
    if (inner) g.extrude(ipoly, rz * 0.9, s * (x - 0.002), y, z + rz * 0.65, rot, inner, { axis: 'z', bev: rz * 0.18, curveX: cX, taper: 0.85 });
  }
}

SPEC.deer = (function () {
  var S = { id: 'deer', kind: 'flyer', hz: 0, hipH: 1.17, pitchG: 0.0, pitchF: 0, flyY: 1, bob: 0.025, bobA: 0, bankK: 0, eatDrop: 0.25, eatPitch: 0.3, stride: 1.1, lift: 0.14, bs: 0.45, runAt: 2.6, neckBob: 0.05, legK: 1.0, glide: [9, 9], flap: [9, 9] };
  S.col = skin({ back: 0x8c5b3c, belly: 0xcfb593, mid: 0xa5774f, bAt: -0.15, bW: 0.7, mott: 0.05 });
  S.legc = 0x7a5237;
  S.body = { keys: [[-0.68, 0.1, 0.12, 0.02], [-0.5, 0.18, 0.22, 0.02], [-0.1, 0.22, 0.26, 0.0], [0.4, 0.21, 0.25, 0.01], [0.66, 0.13, 0.16, 0.05]], rings: 8, seg: 10, extra: function (g) { g.sph(0.1, 0.1, 0.07, 0, 0.03, -0.68, 0xe4d3b0, { s: [6, 4] }); } };
  S.neck = { n: 2, len: 0.62, r1: 0.12, r2: 0.085, at: [0.12, 0.62], fy: 1, G: [1.0, 0.8], F: [1.0, 0.8], E: [-0.5, -1.1], S: [0.6, 0.2], call: 0.1 };
  S.head = { G: -0.35, F: -0.35, E: -1.0, S: 0.0, build: function (g) {
    g.loft([[0, 0.065, 0.085, 0.01], [0.14, 0.075, 0.085, 0.0], [0.28, 0.05, 0.055, -0.02], [0.38, 0.036, 0.04, -0.03]], { rings: 5, seg: 8, cap0: true, cap1: true }, S.col);
    g.sph(0.038, 0.032, 0.028, 0, -0.026, 0.385, 0x1e1a18, { s: [5, 4] });
    g.sph(0.028, 0.018, 0.032, 0, -0.048, 0.35, 0xcab08e, { s: [5, 4] });
    eyeDark(g, 0.07, 0.04, 0.12, 0.016); earPair(g, 0.075, 0.105, 0.0, 0.038, 0.082, 0.012, 0.85, 0x8c5b3c, 0xd9bfa0);
    for (var s = -1; s <= 1; s += 2) {
      var ac = 0x5c4634;
      // swept curved main antler beam + curved brow, bez & trez tines
      g.tube([[s * 0.036, 0.085, 0.0], [s * 0.075, 0.18, -0.045], [s * 0.135, 0.30, -0.095], [s * 0.165, 0.43, -0.05], [s * 0.135, 0.52, 0.04]], [0.016, 0.013, 0.010, 0.007, 0.003], ac, { seg: 6, steps: 2, cap0: true, cap1: true });
      g.tube([[s * 0.048, 0.125, -0.015], [s * 0.068, 0.20, 0.065], [s * 0.052, 0.28, 0.12]], [0.009, 0.006, 0.003], ac, { seg: 5, steps: 2, cap0: false, cap1: true });
      g.tube([[s * 0.11, 0.25, -0.075], [s * 0.125, 0.34, 0.01], [s * 0.11, 0.42, 0.075]], [0.009, 0.006, 0.003], ac, { seg: 5, steps: 2, cap0: false, cap1: true });
      g.tube([[s * 0.155, 0.37, -0.075], [s * 0.195, 0.46, -0.08], [s * 0.21, 0.53, -0.02]], [0.008, 0.005, 0.0025], ac, { seg: 5, steps: 2, cap0: false, cap1: true });
    }
  } };
  S.tail = { n: 1, len: 0.12, r1: 0.04, r2: 0.025, at: [0.04, -0.66], G: 0.5, F: 0.5 };
  S.legs = { hind: { x: 0.12, y: -0.18, z: -0.45, L: [0.5, 0.52], r: [0.08, 0.05, 0.032], fx: 0.0, bend: 1, musc: true, foot: hoof(0.03, 0.035) },
    fore: { x: 0.12, y: -0.16, z: 0.42, L: [0.48, 0.5], r: [0.07, 0.045, 0.03], fx: 0.04, musc: true, foot: hoof(0.028, 0.032) } };
  return S;
})();
function eyeDark(g, x, y, z, r) { for (var s = -1; s <= 1; s += 2) g.sph(r, r, r * 0.9, s * x, y, z, 0x15110e, { s: [5, 4] }); }

SPEC.boar = (function () {
  var S = { id: 'boar', kind: 'flyer', hz: 0, hipH: 0.78, pitchG: 0.0, pitchF: 0, flyY: 1, bob: 0.02, bobA: 0, bankK: 0, eatDrop: 0.12, eatPitch: 0.25, stride: 0.6, lift: 0.07, bs: 0.45, runAt: 2.0, neckBob: 0.03, legK: 1.0, glide: [9, 9], flap: [9, 9] };
  S.col = skin({ back: 0x4f4439, belly: 0x6e6050, mid: 0x5d5043, bAt: -0.2, bW: 0.7, mott: 0.1, dors: { c: 0x2f2822, k: 0.9 } });
  S.legc = 0x3d342b;
  S.body = { keys: [[-0.52, 0.12, 0.15, 0.0], [-0.34, 0.22, 0.26, 0.0], [0.0, 0.28, 0.32, 0.02], [0.36, 0.28, 0.33, 0.03], [0.55, 0.2, 0.24, 0.02]], rings: 8, seg: 10, ridge: 0.18, extra: function (g) {
    g.extrude([[0.22, -0.44], [0.36, -0.24], [0.43, 0.08], [0.42, 0.38], [0.33, 0.52], [0.24, 0.45], [0.29, 0.05]], 0.036, 0, 0, 0, [0, 0, 0], 0x2a231d, { axis: 'x', bev: 0.008, taper: 0.85 });
  } };
  S.neck = { n: 1, len: 0.2, r1: 0.2, r2: 0.17, at: [0.06, 0.5], fy: 1, G: [0.25], F: [0.25], E: [-0.5], S: [-0.2], call: 0.1 };
  S.head = { G: -0.55, F: -0.55, E: -1.3, S: -0.3, build: function (g) {
    g.loft([[0, 0.13, 0.15, 0.0], [0.18, 0.13, 0.14, -0.01], [0.38, 0.07, 0.08, -0.03], [0.5, 0.055, 0.06, -0.035]], { rings: 5, seg: 8, cap0: true, cap1: true }, S.col);
    // flat beveled snout disc with nostrils
    g.lathe([[0, 0.0], [0.044, 0.0], [0.058, 0.012], [0.052, 0.028], [0.0, 0.03]], 0xb37f7a, { seg: 10, x: 0, y: -0.035, z: 0.505, sx: 1.08, sy: 1.0, sz: 0.92, rot: [PI * 0.5, 0, 0] });
    g.sph(0.012, 0.012, 0.01, 0.022, -0.032, 0.535, 0x2a1a18, { s: [4, 3] }); g.sph(0.012, 0.012, 0.01, -0.022, -0.032, 0.535, 0x2a1a18, { s: [4, 3] });
    eyeDark(g, 0.12, 0.05, 0.2, 0.014); earPair(g, 0.085, 0.145, 0.04, 0.042, 0.082, 0.012, 0.45, 0x4f4439, 0x8f7466);
    for (var s = -1; s <= 1; s += 2) {
      // curved sweeping lower tusks & upper canine flanges
      g.tube([[s * 0.048, -0.038, 0.40], [s * 0.088, 0.0, 0.43], [s * 0.076, 0.062, 0.39]], [0.013, 0.008, 0.0025], 0xefe6cc, { seg: 6, steps: 2, cap0: true, cap1: true });
      g.tube([[s * 0.046, -0.02, 0.39], [s * 0.076, -0.005, 0.41], [s * 0.072, 0.024, 0.39]], [0.010, 0.006, 0.0025], 0xe2d8bc, { seg: 5, steps: 2, cap0: true, cap1: true });
    }
  } };
  S.tail = { n: 1, len: 0.14, r1: 0.02, r2: 0.01, at: [0.1, -0.52], G: 0.3, F: 0.3, extra: function (g, i, sl) { g.sph(0.015, 0.015, 0.04, 0, 0, sl, 0x2a231d, { s: [4, 3] }); } };
  S.legs = { hind: { x: 0.14, y: -0.2, z: -0.34, L: [0.3, 0.3], r: [0.07, 0.045, 0.03], fx: 0.0, bend: 1, musc: true, foot: hoof(0.035, 0.04) },
    fore: { x: 0.14, y: -0.2, z: 0.34, L: [0.3, 0.3], r: [0.065, 0.042, 0.03], fx: 0.03, musc: true, foot: hoof(0.033, 0.038) } };
  return S;
})();

SPEC.goat = (function () {
  var S = { id: 'goat', kind: 'flyer', hz: 0, hipH: 0.75, pitchG: 0.0, pitchF: 0, flyY: 1, bob: 0.02, bobA: 0, bankK: 0, eatDrop: 0.12, eatPitch: 0.3, stride: 0.55, lift: 0.08, bs: 0.5, runAt: 2.2, neckBob: 0.04, legK: 1.0, glide: [9, 9], flap: [9, 9] };
  S.col = skin({ back: 0xece6d6, belly: 0xfaf6ec, mid: 0xf2ecde, bAt: -0.2, bW: 0.7, mott: 0.04 });
  S.legc = 0xe3dccb;
  S.body = { keys: [[-0.4, 0.1, 0.12, 0.0], [-0.28, 0.16, 0.2, 0.0], [0.0, 0.19, 0.24, 0.02], [0.28, 0.18, 0.23, 0.04], [0.42, 0.12, 0.15, 0.04]], rings: 8, seg: 10 };
  S.neck = { n: 1, len: 0.3, r1: 0.1, r2: 0.08, at: [0.12, 0.38], fy: 1, G: [0.65], F: [0.65], E: [-0.6], S: [0.3], call: 0.1 };
  S.head = { G: -0.2, F: -0.2, E: -1.2, S: 0.0, build: function (g) {
    g.loft([[0, 0.055, 0.07, 0.01], [0.1, 0.06, 0.07, 0.0], [0.2, 0.04, 0.05, -0.015], [0.27, 0.03, 0.035, -0.02]], { rings: 4, seg: 8, cap0: true, cap1: true }, S.col);
    g.sph(0.028, 0.026, 0.02, 0, -0.02, 0.275, 0x2a2622, { s: [5, 4] }); eyeDark(g, 0.058, 0.03, 0.1, 0.012);
    earPair(g, 0.072, 0.042, 0.0, 0.028, 0.05, 0.01, 1.35, 0xe5ddca, 0xd4b6aa);
    // sculpted beard tuft
    g.tube([[0, -0.048, 0.19], [0, -0.095, 0.18], [0, -0.145, 0.15]], [0.02, 0.012, 0.003], 0xf2ecde, { seg: 6, steps: 2, sx: 0.75, sz: 1.2, cap0: true, cap1: true });
    for (var s = -1; s <= 1; s += 2) {
      // swept ridged curved horns
      g.tube([
        [s * 0.032, 0.065, 0.02],
        [s * 0.046, 0.155, -0.02],
        [s * 0.07, 0.22, -0.10],
        [s * 0.098, 0.24, -0.20],
        [s * 0.115, 0.205, -0.27]
      ], [0.018, 0.015, 0.011, 0.007, 0.003], function (x, y, z, nx, ny, nz, tf) {
        return sin(tf * 38) > 0.25 ? 0x3b3630 : 0x27231f;
      }, { seg: 7, steps: 3, cap0: true, cap1: true });
    }
  } };
  S.tail = { n: 1, len: 0.1, r1: 0.025, r2: 0.015, at: [0.06, -0.4], G: 0.7, F: 0.7 };
  S.legs = { hind: { x: 0.1, y: -0.16, z: -0.26, L: [0.3, 0.32], r: [0.055, 0.035, 0.025], fx: 0.0, bend: 1, musc: true, foot: hoof(0.026, 0.03) },
    fore: { x: 0.1, y: -0.15, z: 0.25, L: [0.3, 0.32], r: [0.048, 0.032, 0.023], fx: 0.03, musc: true, foot: hoof(0.024, 0.028) } };
  return S;
})();

SPEC.rabbit = (function () {
  var S = { id: 'rabbit', kind: 'flyer', hz: 0, hipH: 0.2, pitchG: 0.12, pitchF: 0, flyY: 1, bob: 0.0, hop: 0.1, bobA: 0, bankK: 0, eatDrop: 0.03, eatPitch: 0.3, stride: 0.34, lift: 0.07, bs: 0.55, runAt: 1.5, neckBob: 0.04, legK: 1.0, glide: [9, 9], flap: [9, 9] };
  S.col = skin({ back: 0x9d8467, belly: 0xe7dfd0, mid: 0xb59b7b, bAt: -0.1, bW: 0.7, mott: 0.08 });
  S.legc = 0x8c7658;
  S.body = { keys: [[-0.17, 0.07, 0.08, 0.0], [-0.1, 0.1, 0.11, 0.02], [0.02, 0.1, 0.11, 0.02], [0.14, 0.08, 0.09, 0.03], [0.2, 0.05, 0.06, 0.04]], rings: 6, seg: 9, extra: function (g) {
    // arched contoured haunches + layered fluffy cotton tail
    for (var s = -1; s <= 1; s += 2) g.sph(0.052, 0.068, 0.072, s * 0.062, -0.005, -0.09, 0x967e62, { rot: [0.35, 0, 0], s: [6, 5] });
    g.sph(0.038, 0.04, 0.04, 0, 0.04, -0.195, 0xf4efe4, { s: [6, 5] });
    g.sph(0.026, 0.028, 0.028, 0, 0.058, -0.215, 0xfaf7f0, { s: [5, 4] });
  } };
  S.neck = { n: 1, len: 0.08, r1: 0.06, r2: 0.055, at: [0.04, 0.17], fy: 1, G: [0.5], F: [0.5], E: [-0.9], S: [0.0], call: 0.1 };
  S.head = { G: -0.2, F: -0.2, E: -1.2, S: -0.4, build: function (g) {
    g.loft([[0, 0.045, 0.05, 0.0], [0.05, 0.05, 0.055, 0.003], [0.1, 0.03, 0.035, -0.006], [0.14, 0.015, 0.02, -0.012]], { rings: 4, seg: 8, cap0: true, cap1: true }, S.col);
    g.sph(0.012, 0.01, 0.01, 0, -0.01, 0.14, 0xd69a9a, { s: [4, 3] }); eyeDark(g, 0.045, 0.025, 0.06, 0.012);
    earPair(g, 0.026, 0.105, -0.01, 0.022, 0.108, 0.008, 0.22, 0x9d8467, 0xdbb8a8, -0.15);
    for (var s = -1; s <= 1; s += 2) {
      g.sph(0.015, 0.012, 0.014, s * 0.014, -0.018, 0.125, 0xe7dfd0, { s: [4, 3] });
      g.tube([[s * 0.016, -0.016, 0.128], [s * 0.052, -0.012, 0.132]], [0.0018, 0.0008], 0xede6da, { seg: 4, cap0: false, cap1: true });
      g.tube([[s * 0.016, -0.02, 0.126], [s * 0.05, -0.026, 0.12]], [0.0018, 0.0008], 0xede6da, { seg: 4, cap0: false, cap1: true });
    }
  } };
  S.tail = { n: 1, len: 0.03, r1: 0.01, r2: 0.01, at: [0.04, -0.2], G: 0.3, F: 0.3 };
  S.legs = { hind: { x: 0.07, y: -0.05, z: -0.08, L: [0.1, 0.1], r: [0.045, 0.02, 0.014], fx: -0.02, bend: 1, musc: true, foot: function (g, L2, c) { g.sph(0.016, 0.012, 0.06, 0, -L2 + 0.01, 0.04, c, { s: [5, 4] }); } },
    fore: { x: 0.05, y: -0.05, z: 0.1, L: [0.08, 0.08], r: [0.022, 0.014, 0.011], fx: 0.02, foot: function (g, L2, c) { g.sph(0.012, 0.01, 0.03, 0, -L2 + 0.01, 0.015, c, { s: [5, 4] }); } } };
  return S;
})();

// ---- Grey seal (modern): swims by sweeping its rear flippers, humps along on land
SPEC.seal = (function () {
  var S = { id: 'seal', kind: 'spine', land: true, depth: 0.3, cruise: 1.4, f0: 0.3, f1: 0.9, idleAmp: 0.15, amp: [0.04, 0.14, 0.36], lag: 1.0, turnBend: 0.12, bank: 0.4, bs: 0.5, ringLen: 0.25, seg: 10 };
  S.keys = [[-0.85, 0.03, 0.03, 0.0], [-0.62, 0.09, 0.075, 0.0], [-0.2, 0.2, 0.19, 0.01], [0.22, 0.235, 0.22, 0.02], [0.52, 0.19, 0.185, 0.03], [0.68, 0.12, 0.12, 0.04], [0.78, 0.115, 0.115, 0.05], [0.9, 0.09, 0.09, 0.04], [1.0, 0.045, 0.05, 0.02], [1.06, 0.015, 0.02, 0.01]];
  S.col = skin({ back: 0x7d7f7e, belly: 0xc9c6b8, mid: 0x9b9a92, bAt: -0.15, bW: 0.6, mott: 0.06, spots: { f: 9, k: 4, d: 0.22, c: 0x4a4c4e, a: 0.75 } });
  S.cuts = [0.2, -0.22, -0.6];
  S.extra = function (g, i, dz) {
    if (i === 0) {
      kEye(g, 0.075, 0.07, 0.86 + dz, 0.03, 0x15110e);
      g.sph(0.024, 0.018, 0.024, 0, 0.008, 1.05 + dz, 0x1c1a1a, { s: [5, 4] });
      // rounded whisker pads & whisker detail
      for (var s = -1; s <= 1; s += 2) {
        g.sph(0.024, 0.02, 0.028, s * 0.025, -0.014, 1.015 + dz, 0xa8a59b, { s: [5, 4] });
        g.tube([[s * 0.03, -0.012, 1.02 + dz], [s * 0.09, -0.018, 1.0 + dz]], [0.0022, 0.0008], 0xdad6ca, { seg: 4, cap0: false, cap1: true });
        g.tube([[s * 0.028, -0.02, 1.015 + dz], [s * 0.085, -0.032, 0.99 + dz]], [0.0022, 0.0008], 0xdad6ca, { seg: 4, cap0: false, cap1: true });
      }
    }
    if (i === 2) {
      // sculpted fan-shaped webbed hind flukes
      for (var sd = -1; sd <= 1; sd += 2) {
        g.extrude([
          [0, 0.02], [sd * 0.05, -0.04], [sd * 0.16, -0.20], [sd * 0.08, -0.25], [sd * 0.02, -0.23], [-sd * 0.02, -0.20], [-sd * 0.01, -0.05]
        ], 0.022, sd * 0.045, -0.005, -0.80 + dz, [0, -sd * 0.32, 0], 0x6b6d6c, { axis: 'y', bev: 0.005, taper: 0.9 });
      }
    }
  };
  S.app = [
    { seg: 0, side: 1, x: 0.2, y: -0.12, z: 0.42, role: 'pec', base: [0, -0.8, -0.7], flap: 0.3, geo: function () { return paddle(0.26, 0.11, 0.014, 0x6b6d6c, 0.45); } },
    { seg: 0, side: -1, x: 0.2, y: -0.12, z: 0.42, role: 'pec', base: [0, -0.8, -0.7], flap: 0.3, geo: function () { return paddle(0.26, 0.11, 0.014, 0x6b6d6c, 0.45); } }
  ];
  return S;
})();

// ================================================================ FISH SHOAL (a small school that behaves as one animal)
function shoalGeos(S) {
  if (S._geo) return S._geo; var out = [], k, j, rnd = 0.37;
  for (k = 0; k < 3; k++) {
    var g = B();
    for (j = 0; j < 4; j++) {
      rnd = (rnd * 9301 + 49297) % 233280; var r1 = rnd / 233280; rnd = (rnd * 9301 + 49297) % 233280; var r2 = rnd / 233280;
      var x = (r1 - 0.5) * 0.5, y = (r2 - 0.5) * 0.22, z = (j - 1.5) * 0.17 + (r1 - 0.5) * 0.08, sz = 0.85 + r2 * 0.3, c = k === 1 ? 0x6f8fae : 0x5b7da2;
      var fcol = (function (bc) { return function (zc, ca) { return ca > 0.2 ? bc : (ca < -0.2 ? 0xe2e8ea : 0x9fb6c4); }; })(c);
      g.loft([[-0.12 * sz, 0.005 * sz, 0.012 * sz, 0], [-0.04 * sz, 0.025 * sz, 0.04 * sz, 0], [0.04 * sz, 0.032 * sz, 0.046 * sz, 0], [0.115 * sz, 0.01 * sz, 0.016 * sz, 0]], { rings: 4, seg: 6, ox: x, oy: y, oz: z, cap0: true, cap1: true }, fcol);
      // dorsal fin + forked crescent tail fin + pectoral fins
      g.extrude([[0.028 * sz, 0.02 * sz], [0.072 * sz, -0.02 * sz], [0.056 * sz, -0.055 * sz], [0.026 * sz, -0.04 * sz]], 0.006 * sz, x, y, z, [0, 0, 0], 0x4f6f90, { axis: 'x', bev: 0.0015 * sz });
      g.extrude([[0.0, 0.0], [0.052 * sz, -0.072 * sz], [0.032 * sz, -0.082 * sz], [-0.002 * sz, -0.024 * sz]], 0.005 * sz, x, y, z - 0.115 * sz, [0, 0, 0], 0x4f6f90, { axis: 'x', bev: 0.0015 * sz });
      g.extrude([[0.0, 0.0], [-0.002 * sz, -0.024 * sz], [-0.032 * sz, -0.082 * sz], [-0.052 * sz, -0.072 * sz]], 0.005 * sz, x, y, z - 0.115 * sz, [0, 0, 0], 0x7392af, { axis: 'x', bev: 0.0015 * sz });
      for (var sd = -1; sd <= 1; sd += 2) {
        g.extrude([[0, 0.01 * sz], [sd * 0.038 * sz, -0.02 * sz], [sd * 0.024 * sz, -0.035 * sz], [0, -0.015 * sz]], 0.004 * sz, x + sd * 0.024 * sz, y - 0.012 * sz, z + 0.03 * sz, [0, 0, sd * -0.25], 0x9db4c3, { axis: 'y' });
      }
      g.sph(0.005, 0.005, 0.005, x + 0.024 * sz, y + 0.01, z + 0.08 * sz, 0x111111, { s: [3, 2] }); g.sph(0.005, 0.005, 0.005, x - 0.024 * sz, y + 0.01, z + 0.08 * sz, 0x111111, { s: [3, 2] });
    }
    out.push(g.build());
  }
  return (S._geo = out);
}
function createShoal(S, opts) {
  var sc = opts.baby ? 0.6 : 1, G = shoalGeos(S), root = grp('animal'), rig = grp('rig'), I = newI(S, sc), i;
  root.add(rig); rig.scale.setScalar(sc); I.rig = rig; I.sub = [];
  for (i = 0; i < 3; i++) { var sg = grp('school' + i); sg.add(mesh(G[i])); rig.add(sg); I.sub.push(sg); }
  var out = { group: root, height: 1, update: function (dt, ent) { updShoal(I, dt, ent); }, _I: I };
  updShoal(I, 0.0001, { state: 'idle', speed: 0 });
  return finish(root, I, out);
}
function updShoal(I, dt, ent) {
  if (dt > 0.1) dt = 0.1; if (dt <= 0) dt = 1e-4;
  var t = (I.t += dt), spd = ent.speed || 0, i, sw = ent.state === 'swim' || (ent.y || 0) < -0.05;
  track(I, dt, ent);
  var m = clamp(spd / 1.5, 0, 1); I.W.gait = damp(I.W.gait, m, 3, dt); var gm = I.W.gait;
  I.ph += dt * (0.5 + 1.8 * gm);
  for (i = 0; i < 3; i++) {
    var a = t * (0.4 + 0.15 * i) + i * 2.1 + I.seed, r = 0.12 + 0.06 * i;
    I.sub[i].position.set(cos(a) * r, 0.08 * sin(a * 1.3 + i), sin(a * 0.8) * r * 0.7);
    I.sub[i].rotation.set(0.05 * sin(a * 2), 0.18 * sin(I.ph * TAU * 2 + i * 1.7) * (0.4 + gm) - I.turn * 0.15 * (i - 1) + 0.25 * cos(a), 0.06 * sin(a * 1.7));
  }
  I.rig.position.y = sw ? 0 : -I.minY;
}

// ================================================================ registry + API hooks (engines below are registered as they are defined)
var ENGINE = { spine: createSpine, plesio: createPlesio, flyer: createFlyer, shoal: createShoal };
SPEC.fish_shoal = { id: 'fish_shoal', kind: 'shoal' };
function createExtra(id, opts) { var S = SPEC[id]; if (!S) return null; return ENGINE[S.kind](S, opts || {}); }

// wrap the public factory + species list (thumbnails call API.createAnimal, so they pick this up too)
var origCreate = M.createAnimal, origIds = M.speciesIds;
M.createAnimal = function (id, opts) { if (SPEC[id]) return createExtra(id, opts); return origCreate(id, opts); };
M.speciesIds = function () { return origIds().concat(Object.keys(SPEC)); };
M._onDetail = function () { Object.keys(SPEC).forEach(function (k) { SPEC[k]._geo = null; SPEC[k]._app = null; }); };
M.poseThumb = function (id, ent, size, az, el, steps) {   // dev/test: render a posed model through the thumbnail renderer
  var r = M.thumbRenderer(); if (!r) return null;
  var a = M.createAnimal(id, { sex: 'm' }), sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x8a9070, 0.85)); var d = new T.DirectionalLight(0xfff2dc, 0.75); d.position.set(-3, 6, 5); sc.add(d);
  for (var i = 0; i < (steps || 8); i++) a.update(0.05, ent);
  sc.add(a.group); var ms = M.measure(a.group), cam = new T.PerspectiveCamera(28, 1, 0.1, 400), dist = ms.r * 1.12 / Math.sin(14 * PI / 180);
  az = az === undefined ? 0.85 : az; el = el === undefined ? 0.32 : el;
  cam.position.set(ms.cx + Math.sin(az) * dist * Math.cos(el), ms.cy + Math.sin(el) * dist, ms.cz + Math.cos(az) * dist * Math.cos(el)); cam.lookAt(ms.cx, ms.cy, ms.cz);
  r.setSize(size || 256, size || 256, false); r.setClearColor(0xbfd8e8, 1); r.render(sc, cam); var url = r.domElement.toDataURL('image/png'); r.setClearColor(0x000000, 0); return url;
};

// species calls for the audio module (54-audio.js passes its CALLS table + synth helpers)
Z.creatureCalls = function (C, h) {
  var tone = h.tone, noise = h.noise;
  function screech(f0, f1, d, v) { tone(f0, d, 'sawtooth', v, 0, f1); tone(f0 * 1.5, d * 0.8, 'square', v * 0.3, 0.02, f1 * 1.4); noise(d * 0.9, v * 0.6, 3800, 'bandpass', 0, 1.5); }
  function whistle(f) { tone(f, 0.35, 'sine', 0.06, 0, f * 1.45); tone(f * 1.2, 0.3, 'sine', 0.03, 0.4, f * 0.9); for (var i = 0; i < 4; i++) tone(3800 + i * 200, 0.025, 'square', 0.02, 0.8 + i * 0.05); }
  C.pteranodon = function () { screech(1900, 900, 0.5, 0.09); };
  C.quetzalcoatlus = function () { screech(800, 320, 0.9, 0.12); h.hiss(); };
  C.dimorphodon = function () { h.chirp(2700); tone(1500, 0.08, 'square', 0.03, 0.4, 1100); };
  C.rhamphorhynchus = function () { h.chirp(2300); noise(0.1, 0.03, 4200, 'bandpass', 0.35, 2); };
  C.ichthyosaurus = function () { whistle(2300); };
  C.dolphin = function () { whistle(2800); };
  C.mosasaurus = function () { tone(46, 1.5, 'sine', 0.18, 0, 36); tone(92, 1.2, 'triangle', 0.05, 0.05, 60); noise(0.9, 0.05, 160, 'lowpass', 0.1); };
  C.liopleurodon = function () { h.rumble(58); h.snort(); };
  C.elasmosaurus = function () { tone(180, 1.8, 'sine', 0.1, 0, 300); tone(270, 1.5, 'sine', 0.04, 0.1, 420); };
  C.archelon = function () { h.grunt(70); h.snort(); };
  C.deer = function () { h.grunt(210); };
  C.boar = function () { h.grunt(120); h.snort(); };
  C.goat = function () { tone(560, 0.5, 'sawtooth', 0.05, 0, 470); tone(1120, 0.4, 'square', 0.015, 0.02, 900); };
  C.rabbit = function () { tone(1900, 0.06, 'sine', 0.05, 0, 1500); };
  C.seagull = function () { for (var i = 0; i < 4; i++) tone(2000 - i * 90, 0.16, 'sawtooth', 0.04, i * 0.2, 1500 - i * 90); };
  C.heron = function () { tone(480, 0.4, 'sawtooth', 0.07, 0, 280); noise(0.35, 0.04, 1800, 'bandpass', 0, 2); };
  C.seal = function () { tone(230, 0.45, 'sawtooth', 0.07, 0, 150); noise(0.3, 0.03, 600, 'lowpass', 0); };
  C.fish_shoal = function () { tone(520, 0.08, 'sine', 0.04, 0, 260); tone(620, 0.07, 'sine', 0.03, 0.12, 300); };
};
})();
