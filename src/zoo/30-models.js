// ===== 30-models.js =====
window.Z = window.Z || {};
Z.Models = (function () {
'use strict';
var T = THREE, PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;

var OTHERS = {};
// ---------------------------------------------------------------- utils
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(c, t, k, dt) { return c + (t - c) * (1 - Math.exp(-k * dt)); }
function fract(x) { return x - Math.floor(x); }
function hash1(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function hash3(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function mkrng(seed) { var a = (seed >>> 0) + 0x6D2B79F5; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function mixHex(a, b, t) {
  var ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}
function shade(a, f) { // f>1 lighten, <1 darken
  var r = a >> 16 & 255, g = a >> 8 & 255, b = a & 255;
  return (clamp(Math.round(r * f), 0, 255) << 16) | (clamp(Math.round(g * f), 0, 255) << 8) | clamp(Math.round(b * f), 0, 255);
}
function pick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }

// ---------------------------------------------------------------- geometry builder (flat shaded, vertex coloured, merged)
var _ma = new T.Matrix4(), _qa = new T.Quaternion(), _ea = new T.Euler(), _va = new T.Vector3(), _sa = new T.Vector3();
var _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _n = new T.Vector3(), _e1 = new T.Vector3(), _e2 = new T.Vector3();
var _up = new T.Vector3(0, 1, 0), _dir = new T.Vector3();
var unitCache = {};
function unit(key, fn) { return unitCache[key] || (unitCache[key] = fn()); }
function unitSph(ws, hs) { return unit('s' + ws + 'x' + hs, function () { return new T.SphereGeometry(1, ws, hs).toNonIndexed(); }); }
function unitBox(a, b, c) { return unit('b' + a + b + c, function () { return new T.BoxGeometry(1, 1, 1, a, b, c).toNonIndexed(); }); }
function unitCyl(seg, ratio, hs) { return unit('c' + seg + '_' + ratio + '_' + hs, function () { return new T.CylinderGeometry(ratio, 1, 1, seg, hs || 1).toNonIndexed(); }); }

function Builder() { this.p = []; this.n = []; this.c = []; }
Builder.prototype.add = function (geo, x, y, z, sx, sy, sz, rot, col, quat) {
  if (quat) _qa.copy(quat); else { _ea.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'XYZ'); _qa.setFromEuler(_ea); }
  _ma.compose(_va.set(x, y, z), _qa, _sa.set(sx, sy, sz));
  var pa = geo.attributes.position.array, flip = sx * sy * sz < 0, fn = typeof col === 'function', r = 0, g = 0, b = 0;
  if (!fn) { r = (col >> 16 & 255) / 255; g = (col >> 8 & 255) / 255; b = (col & 255) / 255; }
  for (var i = 0; i < pa.length; i += 9) {
    _a.set(pa[i], pa[i + 1], pa[i + 2]).applyMatrix4(_ma);
    _b.set(pa[i + 3], pa[i + 4], pa[i + 5]).applyMatrix4(_ma);
    _c.set(pa[i + 6], pa[i + 7], pa[i + 8]).applyMatrix4(_ma);
    if (flip) { _n.copy(_b); _b.copy(_c); _c.copy(_n); }
    _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _n.crossVectors(_e1, _e2);
    var l = _n.length(); if (l < 1e-9) continue; _n.divideScalar(l);
    if (fn) {
      var h = col((_a.x + _b.x + _c.x) / 3, (_a.y + _b.y + _c.y) / 3, (_a.z + _b.z + _c.z) / 3, _n.x, _n.y, _n.z);
      r = (h >> 16 & 255) / 255; g = (h >> 8 & 255) / 255; b = (h & 255) / 255;
    }
    this.p.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    this.n.push(_n.x, _n.y, _n.z, _n.x, _n.y, _n.z, _n.x, _n.y, _n.z);
    this.c.push(r, g, b, r, g, b, r, g, b);
  }
  return this;
};
// ellipsoid
Builder.prototype.sph = function (rx, ry, rz, x, y, z, col, o) {
  o = o || {}; var s = o.s || [8, 6];
  if (o.ax === 'z') return this.add(unitSph(s[0], s[1]), x, y, z, rx, rz, ry, [PI / 2, 0, 0], col);
  return this.add(unitSph(s[0], s[1]), x, y, z, rx, ry, rz, o.rot, col);
};
Builder.prototype.box = function (w, h, d, x, y, z, col, o) {
  o = o || {}; var s = o.s || [1, 1, 1];
  return this.add(unitBox(s[0], s[1], s[2]), x, y, z, w, h, d, o.rot, col);
};
// cylinder/frustum along y; rt = top radius, rb = bottom radius
Builder.prototype.cyl = function (rt, rb, h, x, y, z, col, o) {
  o = o || {}; var seg = o.seg || 6, rm = max(rt, rb, 1e-4), ratio = rt / rm;
  return this.add(unitCyl(seg, Math.round(ratio * 1000) / 1000, o.hs), x, y, z, rm * (o.sx || 1), h, rm * (o.sz || 1), o.rot, col);
};
Builder.prototype.cone = function (r, h, x, y, z, col, o) { return this.cyl(0.0001, r, h, x, y, z, col, o); };
// tapered limb from p1 to p2 with radii r1 (at p1) and r2 (at p2)
Builder.prototype.limb = function (x1, y1, z1, x2, y2, z2, r1, r2, col, o) {
  o = o || {}; _dir.set(x2 - x1, y2 - y1, z2 - z1); var len = _dir.length(); if (len < 1e-6) return this;
  _dir.divideScalar(len); var q = new T.Quaternion().setFromUnitVectors(_up, _dir);
  var rm = max(r1, r2, 1e-4), ratio = r2 / rm, seg = o.seg || 6, hs = o.hs || 1;
  // cylinder: top = +y (r2 end), bottom = -y (r1 end); when ratio<1 top narrower
  var geo = unit('l' + seg + '_' + hs + '_' + Math.round(ratio * 1000) / 1000 + '_' + Math.round(r1 / rm * 1000) / 1000, function () {
    return new T.CylinderGeometry(ratio, r1 / rm, 1, seg, hs).toNonIndexed();
  });
  return this.add(geo, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, rm * (o.sx || 1), len, rm * (o.sz || 1), null, col, q);
};

// lathe-style body along z. o: {z0,z1,n,seg, rxA,rxB, ryA,ryB, ycA,ycB, pw, belly}
Builder.prototype.torso = function (o, col) {
  var n = o.n || 16, seg = o.seg || 12, rings = [], i, k, pw = o.pw || 0.55;
  for (i = 0; i <= n; i++) {
    var t = i / n, e = Math.pow(Math.sqrt(max(0, 1 - (2 * t - 1) * (2 * t - 1))), pw);
    rings.push({ z: lerp(o.z0, o.z1, t), rx: lerp(o.rxA, o.rxB, t) * e, ry: lerp(o.ryA, o.ryB, t) * e, yc: lerp(o.ycA, o.ycB, t) - (o.belly || 0) * Math.sin(PI * t) * 0 });
  }
  var fn = typeof col === 'function', P = function (r, a) { return [r.rx * Math.sin(a), r.yc + r.ry * Math.cos(a), r.z]; };
  for (i = 0; i < n; i++) for (k = 0; k < seg; k++) {
    var a0 = k / seg * TAU, a1 = (k + 1) / seg * TAU, p00 = P(rings[i], a0), p01 = P(rings[i], a1), p10 = P(rings[i + 1], a0), p11 = P(rings[i + 1], a1);
    var cx = (p00[0] + p01[0] + p10[0] + p11[0]) / 4, cy = (p00[1] + p01[1] + p10[1] + p11[1]) / 4, cz = (p00[2] + p01[2] + p10[2] + p11[2]) / 4;
    var am = (a0 + a1) / 2, nx = Math.sin(am), ny = Math.cos(am), h = fn ? col(cx, cy, cz, nx, ny, 0) : col, r = (h >> 16 & 255) / 255, g = (h >> 8 & 255) / 255, b = (h & 255) / 255;
    var tris = [[p00, p10, p11], [p00, p11, p01]];
    for (var q = 0; q < 2; q++) {
      var A = tris[q][0], Bq = tris[q][1], C = tris[q][2];
      _a.set(A[0], A[1], A[2]); _b.set(Bq[0], Bq[1], Bq[2]); _c.set(C[0], C[1], C[2]);
      _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _n.crossVectors(_e1, _e2); var l = _n.length(); if (l < 1e-9) continue; _n.divideScalar(l);
      if (_n.x * nx + _n.y * ny < 0) { _n.negate(); this.p.push(A[0], A[1], A[2], C[0], C[1], C[2], Bq[0], Bq[1], Bq[2]); } else this.p.push(A[0], A[1], A[2], Bq[0], Bq[1], Bq[2], C[0], C[1], C[2]);
      this.n.push(_n.x, _n.y, _n.z, _n.x, _n.y, _n.z, _n.x, _n.y, _n.z); this.c.push(r, g, b, r, g, b, r, g, b);
    }
  }
  return this;
};
Builder.prototype.tri = function (a, b, c, col, hx, hy, hz) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _c.set(c[0], c[1], c[2]); _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _n.crossVectors(_e1, _e2); var l = _n.length(); if (l < 1e-9) return this; _n.divideScalar(l);
  if (_n.x * hx + _n.y * hy + _n.z * hz < 0) { _n.negate(); var t = b; b = c; c = t; }
  this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (var i = 0; i < 3; i++) { this.n.push(_n.x, _n.y, _n.z); this.c.push((col >> 16 & 255) / 255, (col >> 8 & 255) / 255, (col & 255) / 255); }
  return this;
};
Builder.prototype.merge = function (other, dx, dy, dz) {
  for (var i = 0; i < other.p.length; i += 3) { this.p.push(other.p[i] + dx, other.p[i + 1] + dy, other.p[i + 2] + dz); }
  for (i = 0; i < other.n.length; i++) this.n.push(other.n[i]);
  for (i = 0; i < other.c.length; i++) this.c.push(other.c[i]);
  return this;
};
Builder.prototype.build = function (ox, oy, oz) {
  ox = ox || 0; oy = oy || 0; oz = oz || 0;
  var p = new Float32Array(this.p.length);
  for (var i = 0; i < p.length; i += 3) { p[i] = this.p[i] + ox; p[i + 1] = this.p[i + 1] + oy; p[i + 2] = this.p[i + 2] + oz; }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(p, 3));
  g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.n), 3));
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.c), 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
};
function B() { return new Builder(); }

// ---------------------------------------------------------------- materials (cached)
var VC = new T.MeshLambertMaterial({ vertexColors: true });
VC.name = 'zoo-vc';
var matCache = {};
function mat(col, o) {
  o = o || {}; var k = col + '|' + (o.emissive || 0) + '|' + (o.opacity || 1) + '|' + (o.flat ? 1 : 0) + '|' + (o.side || 0);
  if (matCache[k]) return matCache[k];
  var p = { color: col };
  if (o.emissive) { p.emissive = o.emissive; }
  if (o.opacity && o.opacity < 1) { p.transparent = true; p.opacity = o.opacity; p.depthWrite = false; }
  if (o.side) p.side = T.DoubleSide;
  return (matCache[k] = new T.MeshLambertMaterial(p));
}
function mesh(geo, material) { var m = new T.Mesh(geo, material || VC); m.matrixAutoUpdate = true; return m; }
function grp(name) { var g = new T.Group(); if (name) g.name = name; return g; }
function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
function addTo(parent, child, x, y, z) { child.position.set(x || 0, y || 0, z || 0); parent.add(child); return child; }
function eyePair(g, x, y, z, r, col) { // x is |x|
  g.sph(r, r, r * 0.8, x, y, z, col || 0x111111, { s: [6, 4] }); g.sph(r, r, r * 0.8, -x, y, z, col || 0x111111, { s: [6, 4] });
  g.sph(r * 0.35, r * 0.35, r * 0.3, x + r * 0.2, y + r * 0.35, z + r * 0.5, 0xffffff, { s: [4, 3] });
  g.sph(r * 0.35, r * 0.35, r * 0.3, -x - r * 0.2, y + r * 0.35, z + r * 0.5, 0xffffff, { s: [4, 3] });
}
function mirrorX(fn) { return fn; }
function stripeFn(freq, phase, thick, base, dark, slant, wob) {
  return function (x, y, z) {
    var v = (z + (slant || 0) * y + (wob ? sin(y * 5 + x * 3) * wob : 0)) * freq + phase;
    return fract(v) < thick ? dark : base;
  };
}

// ================================================================ QUADRUPED RIG
var TY = 0, TZ = 1, TP = 2, TR = 3, NA = 4, HP = 5, HY = 6, TW = 7, TU = 8, EAR = 9, A0 = 10, B0 = 14, S0 = 18, TRK = 22, TWV = 23, SPIN = 24, EF = 25, NPOSE = 26;
var partsCache = {};
var OFF0 = [0, PI, PI, 0], OFF1 = [0, 0.45, PI * 0.88, PI * 0.88 + 0.45];
var SPECS = {};   // species id -> {kind, build(opts)}
var QUADS = {};

function legColFn(lg, front) {
  var c = lg.col;
  if (typeof c === 'function') return function (x, y, z, nx, ny, nz) { return c(y, ny, front, x, z); };
  return c || 0x888888;
}
function legPieces(spec, front) {
  var lg = spec.legs, len = front ? lg.fLen : lg.hLen, r = (front ? lg.fr : lg.hr), kf = lg.two === false ? 1 : (lg.kf || 0.5);
  var up = len * kf, lo = len - up, col = legColFn(lg, front), ft = lg.foot || {}, fh = ft.h || 0.08;
  var gU = B(), gL = null, kneeCol = col;
  var r0 = r[0], r1 = r[1], r2 = r[2];
  var addFoot = function (g, y0) {
    var fc = ft.col || 0x222222, type = ft.type || 'hoof', fr = r2;
    if (type === 'hoof') g.cyl(fr * 0.95, fr * 1.25, fh, 0, y0 + fh / 2, 0.01, fc, { seg: 6 });
    else if (type === 'paw') { g.sph(fr * 1.35, fh * 0.75, fr * 1.9, 0, y0 + fh * 0.7, fr * 0.55, ft.pawCol || col, { s: [6, 4] }); if (ft.claws) { for (var i = -1; i <= 1; i++) g.sph(fr * 0.18, fr * 0.18, fr * 0.35, i * fr * 0.5, y0 + fh * 0.5, fr * 2.3, fc, { s: [4, 3] }); } }
    else if (type === 'foot') { g.cyl(fr * 1.05, fr * 1.2, fh, 0, y0 + fh / 2, 0, ft.base || col, { seg: 8 }); for (var j = -1; j <= 1; j++) g.sph(fr * 0.3, fr * 0.2, fr * 0.3, j * fr * 0.62, y0 + fh * 0.5, fr * 1.0, fc, { s: [4, 3] }); }
    else if (type === 'toes') { g.cyl(fr * 1.0, fr * 1.15, fh, 0, y0 + fh / 2, 0, col, { seg: 6 }); for (var k = -1; k <= 1; k++) g.sph(fr * 0.4, fr * 0.3, fr * 0.5, k * fr * 0.7, y0 + fh * 0.45, fr * 0.95, fc, { s: [4, 3] }); }
    else if (type === 'hand') { g.sph(fr * 1.4, fh * 0.9, fr * 1.5, 0, y0 + fh * 0.7, fr * 0.4, ft.col, { s: [6, 4] }); }
  };
  {
    gU.sph(r0 * 1.05, r0 * 1.05, r0 * 1.05, 0, 0, 0, col, { s: [6, 4] });
    if (lg.haunch && !front) { var h = lg.haunch; gU.sph(h[0], h[1], h[2], h[3] || 0, h[4] || -h[1] * 0.4, h[5] || -h[2] * 0.2, col, { s: [7, 5] }); }
    if (lg.shoulder && front) { var s = lg.shoulder; gU.sph(s[0], s[1], s[2], s[3] || 0, s[4] || 0, s[5] || 0, col, { s: [7, 5] }); }
    if (lg.two === false) {
      gU.limb(0, 0, 0, 0, -len + fh * 0.8, 0, r0, r2, col, { seg: lg.seg || 6, hs: lg.hs });
      addFoot(gU, -len);
    } else {
      gU.limb(0, 0, 0, 0, -up, 0, r0, r1, col, { seg: lg.seg || 6, hs: lg.hs });
      gU.sph(r1 * 1.05, r1 * 1.05, r1 * 1.05, 0, -up, 0, col, { s: [5, 4] });
      gL = B();
      gL.limb(0, 0, 0, 0, -lo + fh * 0.8, 0, r1, r2, col, { seg: lg.seg || 6, hs: lg.hs });
      addFoot(gL, -lo);
    }
  }
  return { up: gU.build(), lo: gL ? gL.build() : null, upLen: up, loLen: lo };
}
function tailGeos(spec) {
  var tl = spec.tail; if (!tl) return null; var out = [], n = tl.n || 1, sl = tl.len / n;
  for (var i = 0; i < n; i++) {
    var g = B(), r0 = lerp(tl.r0, tl.r1, i / n), r1 = lerp(tl.r0, tl.r1, (i + 1) / n);
    var col = typeof tl.col === 'function' ? (function (ii) { return function (x, y, z, nx, ny, nz) { return tl.col(ii, x, y, z, nx, ny, nz); }; })(i) : (tl.col || 0x888888);
    g.limb(0, 0, 0, 0, 0, -sl * 1.05, r0, r1, col, { seg: tl.seg || 5, hs: tl.hs });
    if (i === n - 1 && tl.tip) tl.tip(g, sl, r1);
    if (tl.each) tl.each(g, i, sl, r0, r1);
    out.push(g.build());
  }
  return out;
}
function quadParts(spec, sex) {
  var key = spec.id + (spec.sexed ? sex : '');
  if (partsCache[key]) return partsCache[key];
  var P = {}, cy = spec.cy;
  var g = B(); spec.body(g, sex); P.body = g.build(0, -cy, 0);
  var nk = spec.neck;
  if (nk && nk.len > 0) {
    g = B();
    var ncol = typeof nk.col === 'function' ? nk.col : (nk.col || 0x888888);
    g.limb(0, 0, -0.02, 0, 0, nk.len, nk.r0, nk.r1, ncol, { seg: nk.seg || 7, hs: nk.hs });
    g.sph(nk.r0 * 1.05, nk.r0 * 1.05, nk.r0 * 1.05, 0, 0, 0, ncol, { s: [6, 4] });
    if (nk.extra) nk.extra(g, sex);
    P.neck = g.build();
  }
  g = B(); spec.head(g, sex); P.head = g.build();
  if (spec.ears) { g = B(); spec.ears(g, sex); P.ears = g.build(-spec.earAt[0], -spec.earAt[1], -spec.earAt[2]); }
  if (spec.earsLR) { P.earL = spec.earsLR(false); P.earR = spec.earsLR(true); }
  P.legF = legPieces(spec, true); P.legH = legPieces(spec, false);
  P.tail = tailGeos(spec);
  if (spec.trunk) {
    var tr = spec.trunk; P.trunk = [];
    for (var i = 0; i < tr.n; i++) {
      var gg = B(), r0 = lerp(tr.r0, tr.r1, i / tr.n), r1 = lerp(tr.r0, tr.r1, (i + 1) / tr.n), sl = tr.len / tr.n;
      var tc = tr.col;
      gg.limb(0, 0, 0, 0, -sl * 1.06, 0, r0, r1, tc, { seg: 7 });
      gg.sph(r0 * 1.02, r0 * 1.02, r0 * 1.02, 0, 0, 0, tc, { s: [6, 4] });
      if (i === tr.n - 1) { gg.sph(r1 * 1.3, r1 * 0.7, r1 * 1.3, 0, -sl * 1.06, 0, shade(tc, 0.85), { s: [6, 4] }); }
      P.trunk.push(gg.build());
    }
  }
  partsCache[key] = P; return P;
}

function lowestY(hl, hh, p) {
  var m = 1e9, c = cos(p), s = sin(p);
  for (var a = -1; a <= 1; a += 2) for (var b = -1; b <= 1; b += 2) { var yy = (b * hh) * c - (a * hl) * s; if (yy < m) m = yy; }
  return m;
}

function createQuad(spec, opts) {
  var baby = !!opts.baby, sex = baby ? 'f' : (opts.sex || 'm'), P = quadParts(spec, sex);
  var sc = baby ? (spec.babyScale || 0.5) : (sex === 'f' && spec.fScale ? spec.fScale : 1);
  var root = grp('animal'), rig = grp('rig'), torso = grp('torso');
  root.add(rig); rig.add(torso); rig.scale.setScalar(sc);
  torso.position.set(0, spec.cy, 0);
  var bodyM = mesh(P.body); torso.add(bodyM);
  var nk = spec.neck, neckP = grp('neck'); neckP.rotation.order = 'YXZ';
  torso.add(neckP); neckP.position.set(nk.x || 0, nk.y - spec.cy, nk.z);
  if (P.neck) neckP.add(mesh(P.neck));
  var headP = grp('head'); headP.rotation.order = 'YXZ'; neckP.add(headP); headP.position.set(0, 0, nk.len);
  var headM = mesh(P.head); headP.add(headM);
  var hs = baby ? (spec.babyHead || 1.45) : 1; headP.scale.setScalar(hs);
  var earM = null, earL = null, earR = null, trunk = null;
  if (P.ears) { earM = mesh(P.ears); headP.add(earM); earM.position.set(spec.earAt[0], spec.earAt[1], spec.earAt[2]); }
  if (P.earL) {
    var ea = spec.earPivot;
    earL = grp('earL'); earR = grp('earR'); earL.rotation.order = 'YXZ'; earR.rotation.order = 'YXZ';
    earL.add(mesh(P.earL)); earR.add(mesh(P.earR)); earL.position.set(ea[0], ea[1], ea[2]); earR.position.set(-ea[0], ea[1], ea[2]);
    headP.add(earL); headP.add(earR);
  }
  if (P.trunk) {
    trunk = []; var par = headP, tr = spec.trunk;
    for (var i = 0; i < tr.n; i++) {
      var tp = grp('trunk' + i); par.add(tp); trunk.push(tp);
      if (i === 0) tp.position.set(tr.at[0], tr.at[1], tr.at[2]); else tp.position.set(0, -tr.len / tr.n * 1.0, 0);
      tp.add(mesh(P.trunk[i])); par = tp;
    }
  }
  if (spec.headExtra) spec.headExtra(headP, P, sex);
  // legs
  var lg = spec.legs, hips = [], knees = [], legs = [];
  var defs = [[lg.fx, lg.fy, lg.fz, true], [-lg.fx, lg.fy, lg.fz, true], [lg.hx || lg.fx, lg.hy, lg.hz, false], [-(lg.hx || lg.fx), lg.hy, lg.hz, false]];
  for (var l = 0; l < 4; l++) {
    var d = defs[l], hip = grp('hip' + l); hip.position.set(d[0], d[1] - spec.cy, d[2]); torso.add(hip);
    var pc = d[3] ? P.legF : P.legH; hip.add(mesh(pc.up)); hips.push(hip);
    if (pc.lo) { var kn = grp('knee'); kn.position.set(0, -pc.upLen, 0); hip.add(kn); kn.add(mesh(pc.lo)); knees.push(kn); } else knees.push(null);
  }
  var tails = [];
  if (P.tail) {
    var par2 = torso, tl = spec.tail;
    for (var k = 0; k < P.tail.length; k++) {
      var tp2 = grp('tail' + k); tp2.rotation.order = 'YXZ'; par2.add(tp2);
      if (k === 0) tp2.position.set(0, tl.y - spec.cy, tl.z); else tp2.position.set(0, 0, -tl.len / P.tail.length * 1.0);
      tp2.add(mesh(P.tail[k])); tails.push(tp2); par2 = tp2;
    }
  }
  var I = {
    sp: spec, root: root, rig: rig, torso: torso, bodyM: bodyM, neckP: neckP, headP: headP, earM: earM, earL: earL, earR: earR, trunk: trunk,
    hips: hips, knees: knees, tails: tails, sc: sc, baby: baby, t: Math.random() * 100, phase: 0, seed: Math.random() * 6.28,
    W: { gait: 0, run: 0, sleep: 0, eat: 0, sick: 0, swim: 0, sit: 0, play: 0 },
    pose: new Float32Array(NPOSE), lookY: 0, lookP: 0, lookT: 1 + Math.random() * 2, lookTY: 0, lookTP: 0, earT: 2 + Math.random() * 4, earK: 0, hopT: 0, spin: 0,
    Lm: (lg.fLen + lg.hLen) / 2
  };
  var out = { group: root, height: spec.height * sc, update: function (dt, ent) { quadUpdate(I, dt, ent); } };
  quadUpdate(I, 0.0001, { state: 'idle', speed: 0 }); // initial pose
  return out;
}

function quadUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var sp = I.sp, W = I.W, t = (I.t += dt), st = ent.state || 'idle', spd = ent.speed || 0, p = I.pose, lg = sp.legs;
  var moving = spd > 0.06 && st !== 'sleep' && st !== 'eat' && st !== 'drink';
  var isRun = (st === 'run' || spd > 4.2) ? 1 : 0;
  var sitNow = sp.sit && sp.sitStates && sp.sitStates.indexOf(st) >= 0 && !moving ? 1 : 0;
  var sleeping = st === 'sleep' ? 1 : 0, eating = (st === 'eat' || st === 'drink') ? 1 : 0;
  W.gait = damp(W.gait, moving && st !== 'swim' ? 1 : 0, 7, dt);
  W.run = damp(W.run, isRun && moving ? 1 : 0, 4, dt);
  W.sleep = damp(W.sleep, sleeping, 2.2, dt);
  W.eat = damp(W.eat, eating, 4, dt);
  W.sick = damp(W.sick, st === 'sick' ? 1 : 0, 2.5, dt);
  W.swim = damp(W.swim, st === 'swim' ? 1 : 0, 3, dt);
  W.sit = damp(W.sit, sitNow, 2.5, dt);
  W.play = damp(W.play, st === 'play' ? 1 : 0, 4, dt);
  var gw = W.gait, rw = W.run;
  var A = lerp(sp.walkA || 0.42, sp.runA || 0.7, rw), amp = A * gw * (1 - 0.45 * W.sick);
  var Lm = I.Lm * I.sc;
  if (moving && gw > 0.02 && dt > 0.001) { var den = 4 * Lm * Math.max(0.05, sin(A)) * (1 + 0.25 * rw); I.phase += spd * dt / den * TAU * (st === 'swim' ? 0 : 1); }
  var ph = I.phase, i;
  // ---- look around / ear timers
  I.lookT -= dt;
  if (I.lookT <= 0) { I.lookT = 1.4 + Math.random() * 3.6; I.lookTY = Math.random() < 0.3 ? 0 : (Math.random() - 0.5) * 1.5; I.lookTP = (Math.random() - 0.5) * 0.3; }
  I.lookY = damp(I.lookY, I.lookTY, 2.5, dt); I.lookP = damp(I.lookP, I.lookTP, 2.5, dt);
  I.earT -= dt; if (I.earT <= 0) { I.earT = 2 + Math.random() * 6; I.earK = 1; }
  I.earK = Math.max(0, I.earK - dt * 2.2);
  // ---- base (stand / gait) pose
  var off0 = OFF0, off1 = OFF1, bend = (sp.bend || 0.8) * (1 + 0.5 * rw), mc = 0;
  for (i = 0; i < 4; i++) {
    var o = lerp(off0[i], off1[i], rw), s = sin(ph + o), c = cos(ph + o);
    p[A0 + i] = amp * s; p[B0 + i] = bend * gw * Math.max(0, -c) * (1 - 0.3 * W.sick); mc += cos(p[A0 + i]);
    p[S0 + i] = 0;
  }
  var lookW = 1 - W.eat * 0.8;
  p[TY] = Lm / I.sc * 0.9 * (mc / 4 - 1) + rw * Math.abs(sin(ph + 0.45)) * 0.05 * Lm / I.sc;
  p[TZ] = 0; p[TP] = rw * 0.1 * sin(ph + 0.45 - 1) + 0.025 * gw * sin(ph * 2); p[TR] = 0.03 * gw * sin(ph);
  var breathe = sin(t * 1.9 + I.seed);
  p[NA] = sp.neck.up + I.lookP * lookW + 0.05 * breathe * (1 - gw) + gw * 0.04 * sin(ph * 2) + rw * 0.12;
  p[HP] = (sp.hpitch || 0.3) + 0.08 * sin(ph * 2) * gw;
  p[HY] = I.lookY * lookW;
  p[TW] = sin(t * 1.3 + I.seed) * 0.28 * (1 - gw * 0.5); p[TU] = 0;
  p[TWV] = 0.12 + 0.2 * gw + 0.1 * (1 - gw);
  p[EAR] = I.earK * sin(t * 38) * 0.5;
  p[EF] = 0.5 * sin(t * 1.6 + I.seed) + gw * 0.9 * sin(ph * 2) * 0.5 + (1 - gw) * I.earK * sin(t * 30) * 0.4;
  p[TRK] = 0; p[SPIN] = 0;
  var pyw = sp.neck.y;   // neck pivot height (ground frame)
  // ---- eat / drink
  if (W.eat > 0.001) {
    var w = W.eat, tgtTY = sp.eatDrop ? -sp.eatDrop : 0;
    var pyE = pyw + tgtTY, nl = Math.max(sp.neck.len, 0.05), ey = sp.eatY || 0.22;
    var na = nl > 0.25 ? Math.asin(clamp((ey - pyE) / nl, -1, 1)) : -0.5;
    if (nl <= 0.25) na = sp.eatNA !== undefined ? sp.eatNA : -0.45;
    var nod = sin(t * 5.2 + I.seed) * (st === 'drink' ? 0.05 : 0.1);
    p[TY] = lerp(p[TY], tgtTY, w); p[TP] = lerp(p[TP], sp.eatTP !== undefined ? sp.eatTP : 0.08, w);
    p[NA] = lerp(p[NA], na + nod * 0.5, w); p[HP] = lerp(p[HP], (sp.eatHP !== undefined ? sp.eatHP : 1.1) + nod, w);
    p[HY] = lerp(p[HY], 0, w);
    if (sp.reach) { p[A0] = lerp(p[A0], -sp.reach, w); p[A0 + 1] = lerp(p[A0 + 1], sp.reach, w); p[S0] = lerp(p[S0], 0.2, w); p[S0 + 1] = lerp(p[S0 + 1], 0.2, w); }
    p[TRK] = lerp(p[TRK], 1, w);
  }
  // ---- sick: droopy
  if (W.sick > 0.001) {
    var ws = W.sick;
    p[TY] = lerp(p[TY], p[TY] - (sp.cy * 0.07), ws); p[NA] = lerp(p[NA], sp.neck.up * 0.3 - 0.25, ws); p[HP] = lerp(p[HP], 1.0, ws);
    p[TW] = lerp(p[TW], 0, ws); p[TWV] = lerp(p[TWV], 0.03, ws); p[TP] = lerp(p[TP], 0.05, ws);
    p[TR] = lerp(p[TR], 0.025 * sin(t * 18), ws * (1 - gw));
    for (i = 0; i < 4; i++) p[B0 + i] = lerp(p[B0 + i], p[B0 + i] + 0.25, ws);
  }
  // ---- play: hops
  if (W.play > 0.001) {
    var wp = W.play, hop = Math.abs(sin(t * 6.5 + I.seed));
    p[TY] += wp * hop * 0.2 * Math.min(1, sp.size ? sp.size : 1) * (sp.hopH || 1);
    p[TP] = lerp(p[TP], -0.28 * sin(t * 6.5 + I.seed + 1.2), wp);
    var kk = sin(t * 6.5 + I.seed + 0.5);
    p[A0] = lerp(p[A0], -0.7 * Math.max(0, kk) - 0.1, wp); p[A0 + 1] = lerp(p[A0 + 1], -0.7 * Math.max(0, kk) - 0.1, wp);
    p[B0] = lerp(p[B0], 0.9 * Math.max(0, kk), wp); p[B0 + 1] = lerp(p[B0 + 1], 0.9 * Math.max(0, kk), wp);
    p[HP] = lerp(p[HP], 0.1 + 0.3 * sin(t * 6.5 + I.seed), wp); p[NA] = lerp(p[NA], sp.neck.up + 0.25, wp);
    p[TW] = lerp(p[TW], sin(t * 9) * 0.6, wp); p[TWV] = lerp(p[TWV], 0.5, wp);
    p[SPIN] = wp * sin(t * 1.6 + I.seed) * 1.1;
  }
  // ---- swim
  if (W.swim > 0.001) {
    var wsw = W.swim, drop = sp.swimDrop !== undefined ? sp.swimDrop : sp.cy * 0.75;
    p[TY] = lerp(p[TY], -drop + 0.03 * sin(t * 2.3), wsw); p[TP] = lerp(p[TP], -0.05, wsw);
    for (i = 0; i < 4; i++) {
      var pp = t * 5.5 + (i === 0 || i === 3 ? 0 : PI);
      p[A0 + i] = lerp(p[A0 + i], 0.7 * sin(pp), wsw); p[B0 + i] = lerp(p[B0 + i], 0.5 + 0.6 * Math.max(0, cos(pp)), wsw);
    }
    p[NA] = lerp(p[NA], Math.max(sp.neck.up, 0.35), wsw); p[HP] = lerp(p[HP], 0.1, wsw);
    p[TWV] = lerp(p[TWV], 0.45, wsw); p[TW] = lerp(p[TW], 0, wsw);
  }
  // ---- sit (panda, meerkat, gorilla)
  if (W.sit > 0.001 && sp.sit) {
    var s = sp.sit, wst = W.sit, cp = s.p, ty = -lowestY(sp.hl * 0.85, sp.hh * 0.85, cp) + 0.02 - sp.cy;
    if (s.feet) ty = lg.hLen * cos(s.ha) - ((lg.hy - sp.cy) * cos(cp) - lg.hz * sin(cp)) - sp.cy;
    p[TP] = lerp(p[TP], cp, wst); p[TY] = lerp(p[TY], ty, wst); p[TZ] = lerp(p[TZ], s.z || 0, wst);
    p[A0] = lerp(p[A0], s.fa, wst); p[A0 + 1] = lerp(p[A0 + 1], s.fa, wst); p[B0] = lerp(p[B0], s.fb || 0, wst); p[B0 + 1] = lerp(p[B0 + 1], s.fb || 0, wst);
    p[A0 + 2] = lerp(p[A0 + 2], s.ha, wst); p[A0 + 3] = lerp(p[A0 + 3], s.ha, wst); p[B0 + 2] = lerp(p[B0 + 2], s.hb || 0, wst); p[B0 + 3] = lerp(p[B0 + 3], s.hb || 0, wst);
    p[S0 + 2] = lerp(p[S0 + 2], s.hs || 0.3, wst); p[S0 + 3] = lerp(p[S0 + 3], s.hs || 0.3, wst);
    p[S0] = lerp(p[S0], s.fs || 0, wst); p[S0 + 1] = lerp(p[S0 + 1], s.fs || 0, wst);
    p[NA] = lerp(p[NA], (s.na !== undefined ? s.na : 0.15) + I.lookP * 0.5, wst);
    var eatSit = st === 'eat' || st === 'drink';
    p[HP] = lerp(p[HP], (s.hp !== undefined ? s.hp : 0.1) + (eatSit ? 0.7 + 0.12 * sin(t * 5) : 0), wst);
    p[HY] = lerp(p[HY], I.lookY * 0.6, wst);
    if (eatSit && s.eat) { // hold food to mouth
      p[A0] = lerp(p[A0], s.eat.fa, wst); p[A0 + 1] = lerp(p[A0 + 1], s.eat.fa, wst); p[B0] = lerp(p[B0], s.eat.fb + 0.15 * sin(t * 5), wst); p[B0 + 1] = lerp(p[B0 + 1], s.eat.fb + 0.15 * sin(t * 5), wst);
    }
  }
  // ---- sleep (lying)
  if (W.sleep > 0.001) {
    var wl = W.sleep, fo = sp.fold || {}, lie = sp.lieY !== undefined ? sp.lieY : -lowestY(sp.hl * 0.8, sp.hh * 0.85, 0) + 0.02;
    p[TY] = lerp(p[TY], lie - sp.cy, wl); p[TP] = lerp(p[TP], 0, wl); p[TR] = lerp(p[TR], fo.roll || 0, wl); p[TZ] = lerp(p[TZ], 0, wl);
    var fa = fo.fa !== undefined ? fo.fa : -1.25, fb = fo.fb !== undefined ? fo.fb : 2.3, ha = fo.ha !== undefined ? fo.ha : -1.1, hb = fo.hb !== undefined ? fo.hb : 2.3;
    p[A0] = lerp(p[A0], fa, wl); p[A0 + 1] = lerp(p[A0 + 1], fa, wl); p[A0 + 2] = lerp(p[A0 + 2], ha, wl); p[A0 + 3] = lerp(p[A0 + 3], ha, wl);
    p[B0] = lerp(p[B0], fb, wl); p[B0 + 1] = lerp(p[B0 + 1], fb, wl); p[B0 + 2] = lerp(p[B0 + 2], hb, wl); p[B0 + 3] = lerp(p[B0 + 3], hb, wl);
    for (i = 0; i < 4; i++) p[S0 + i] = lerp(p[S0 + i], fo.splay !== undefined ? fo.splay : 0.3, wl);
    var pyL = pyw + lie - sp.cy, nl2 = Math.max(sp.neck.len, 0.05);
    var na2 = nl2 > 0.25 ? Math.asin(clamp((0.18 - pyL) / nl2, -1, 1)) : (fo.na !== undefined ? fo.na : 0.0);
    if (nl2 > 0.25 && sp.neck.up > 0.9) na2 = Math.max(na2, 0.0);
    p[NA] = lerp(p[NA], na2, wl); p[HP] = lerp(p[HP], fo.hp !== undefined ? fo.hp : 0.7, wl); p[HY] = lerp(p[HY], fo.hy !== undefined ? fo.hy : 0.8, wl);
    p[TW] = lerp(p[TW], 0, wl); p[TWV] = lerp(p[TWV], 0.02, wl); p[TRK] = lerp(p[TRK], 2, wl);
  }
  // ---- apply
  var tor = I.torso;
  tor.position.y = sp.cy + p[TY]; tor.position.z = p[TZ]; tor.rotation.set(p[TP], 0, p[TR]);
  var br = 1 + 0.012 * breathe * (1 - 0.5 * gw) * (1 + 0.5 * W.sleep);
  I.bodyM.scale.set(1, br, 1 + 0.004 * breathe);
  I.rig.rotation.y = p[SPIN];
  I.neckP.rotation.set(-p[NA], p[HY] * 0.3, 0);
  I.headP.rotation.set(p[HP] - p[TP] + p[NA], p[HY] * 0.7, 0);
  if (I.earM) I.earM.rotation.x = p[EAR];
  if (I.earL) { var base = sp.earFlare || 0.35, fl = p[EF] * (sp.earFlap || 0.35); I.earL.rotation.y = -(base + fl); I.earR.rotation.y = base + fl; }
  for (i = 0; i < 4; i++) {
    var hip = I.hips[i]; hip.rotation.x = p[A0 + i] - p[TP];
    var side = (i & 1) ? -1 : 1; hip.rotation.z = (p[S0 + i] + (sp.legs.splay || 0)) * side;
    if (I.knees[i]) I.knees[i].rotation.x = p[B0 + i];
  }
  var tl = sp.tail;
  if (I.tails.length) {
    var tup = (tl.up || 0), tf = sp.tailF || 1;
    for (i = 0; i < I.tails.length; i++) {
      var tt = I.tails[i];
      if (i === 0) { tt.rotation.x = tup + (tl.drop ? 0 : 0) - 0.05 * sin(t * 2) + (st === 'sleep' ? -0.2 * W.sleep : 0) - 0.3 * W.sick; tt.rotation.y = p[TW]; }
      else { tt.rotation.x = (tl.curl || 0) + 0.06 * sin(t * 2.4 - i); tt.rotation.y = p[TWV] * sin(t * 3.2 * tf + I.seed - i * 0.9) * 0.9 + (tl.curlY || 0) * 0.0; }
      if (i === 0 && gw > 0.1) tt.rotation.y += sin(ph) * 0.12 * gw;
    }
  }
  if (I.trunk) {
    var tr = sp.trunk, n = tr.n, ids = tr.idle, eatA = tr.eat, sl = tr.slp || ids;
    for (i = 0; i < n; i++) {
      var a = lerp(ids[i], eatA[i], Math.min(1, W.eat));
      a = lerp(a, sl[i], Math.min(1, W.sleep)); // trunk rests
      a += (0.12 + 0.1 * gw) * sin(t * (1.4 + gw * 2) - i * 0.8 + I.seed) * (1 - W.eat * 0.7) - 0.0;
      if (W.swim > 0.01) a = lerp(a, -0.5 - i * 0.35, W.swim);
      I.trunk[i].rotation.x = a;
    }
  }
}

// ================================================================ QUADRUPED SPECIES
function earCone(g, x, y, z, r, h, tilt, col, inner) {
  var s = x < 0 ? -1 : 1;
  g.cone(r, h, x, y, z, col, { seg: 4, rot: [0, 0, -s * tilt] });
  if (inner) g.cone(r * 0.55, h * 0.8, x, y - h * 0.02, z + r * 0.35, inner, { seg: 4, rot: [0, 0, -s * tilt] });
}
function earBall(g, x, y, z, r, col, inner) {
  g.sph(r, r * 1.05, r * 0.45, x, y, z, col, { s: [6, 5], rot: [0, x < 0 ? 0.5 : -0.5, 0] });
  if (inner) g.sph(r * 0.6, r * 0.65, r * 0.3, x * 0.98, y, z + r * 0.25, inner, { s: [5, 4], rot: [0, x < 0 ? 0.5 : -0.5, 0] });
}

// ---- ZEBRA
(function () {
  var W = 0xf3f1ea, K = 0x1d1d22;
  var sf = function (x, y, z, nx, ny) { return (ny < -0.55 && y < 0.95) ? 0xe8e6de : (fract((z + 0.35 * y) * 5.5) < 0.5 ? K : W); };
  QUADS.zebra = {
    id: 'zebra', cy: 1.1, hl: 0.95, hh: 0.4, height: 1.95, size: 1.4, walkA: 0.4, runA: 0.65,
    body: function (g) { g.torso({ z0: -1.0, z1: 0.95, n: 20, seg: 14, rxA: 0.36, rxB: 0.34, ryA: 0.4, ryB: 0.42, ycA: 1.1, ycB: 1.12 }, sf); },
    neck: { y: 1.3, z: 0.72, len: 0.66, up: 0.92, r0: 0.2, r1: 0.125, hs: 6, col: function (x, y, z) { return fract(z * 5 + y * 1.5) < 0.5 ? K : W; },
      extra: function (g) { for (var i = 0; i < 7; i++) { var z = 0.05 + i * 0.1, r = lerp(0.2, 0.125, z / 0.66); g.box(0.04, 0.14, 0.1, 0, r + 0.04, z, i % 2 ? W : K); } } },
    hpitch: 0.95, eatY: 0.2,
    head: function (g) {
      var hc = function (x, y, z) { return z > 0.38 ? 0x2a2326 : (fract(y * 8 + z * 5) < 0.5 ? K : W); };
      g.sph(0.115, 0.13, 0.18, 0, 0, 0.1, hc, { s: [8, 6] }); g.sph(0.092, 0.092, 0.2, 0, -0.07, 0.3, hc, { s: [8, 6] });
      g.sph(0.088, 0.09, 0.07, 0, -0.08, 0.43, 0x2c2427, { s: [6, 4] });
      eyePair(g, 0.1, 0.07, 0.17, 0.028);
      g.box(0.015, 0.03, 0.01, 0.03, -0.06, 0.5, 0x555555); g.box(0.015, 0.03, 0.01, -0.03, -0.06, 0.5, 0x555555);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earCone(g, 0.075, 0.2, 0.0, 0.05, 0.17, 0.15, K, 0xf0b8b8); earCone(g, -0.075, 0.2, 0.0, 0.05, 0.17, 0.15, K, 0xf0b8b8); },
    legs: { fx: 0.17, fy: 0.84, fz: 0.5, hy: 0.86, hz: -0.6, hx: 0.18, fLen: 0.84, hLen: 0.86, fr: [0.085, 0.06, 0.045], hr: [0.1, 0.065, 0.045], haunch: [0.15, 0.22, 0.2],
      hs: 8, col: function (y) { return y > -0.25 ? W : ((y > -0.78 && fract(y * 8) < 0.5) ? K : (y > -0.78 ? W : (y > -0.82 ? W : K))); }, foot: { type: 'hoof', col: 0x2a2a2a, h: 0.07 } },
    tail: { y: 1.14, z: -0.92, n: 2, len: 0.8, r0: 0.04, r1: 0.03, col: K, up: -1.0, curl: -0.15, tip: function (g, sl) { g.sph(0.055, 0.1, 0.055, 0, 0, -sl, K, { s: [5, 4] }); } },
    fold: { roll: 0.0 }
  };
})();

// ---- GIRAFFE
(function () {
  var TAN = 0xe8bd62, BR = 0x8d5b25, CR = 0xf3e2b0;
  var cells = function (x, y, z, scale, line) {
    var X = x * scale, Y = y * scale, Z = z * scale, ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z), d1 = 9, d2 = 9, id = 0;
    for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) for (var c = -1; c <= 1; c++) {
      var cx = ix + a, cy = iy + b, cz = iz + c, px = cx + hash3(cx, cy, cz), py = cy + hash3(cx + 7, cy, cz), pz = cz + hash3(cx, cy + 5, cz + 3);
      var d = (px - X) * (px - X) + (py - Y) * (py - Y) + (pz - Z) * (pz - Z);
      if (d < d1) { d2 = d1; d1 = d; id = hash3(cx + 1, cy + 2, cz + 3); } else if (d < d2) d2 = d;
    }
    if (Math.sqrt(d2) - Math.sqrt(d1) < line) return CR;
    return shade(BR, 0.85 + id * 0.35);
  };
  var pat = function (x, y, z, nx, ny) { return ny < -0.6 ? CR : cells(x, y, z, 2.6, 0.2); };
  QUADS.giraffe = {
    id: 'giraffe', cy: 2.3, hl: 1.0, hh: 0.5, height: 5.1, size: 3.0, walkA: 0.3, runA: 0.5, reach: 0.5, eatY: 0.45, sexed: false, hopH: 1.5, bend: 0.5,
    body: function (g) { g.torso({ z0: -1.0, z1: 1.0, n: 18, seg: 14, rxA: 0.4, rxB: 0.44, ryA: 0.5, ryB: 0.62, ycA: 2.2, ycB: 2.45 }, pat);
    },
    neck: { y: 2.72, z: 0.78, len: 2.35, up: 1.15, r0: 0.3, r1: 0.15, seg: 8, hs: 8, col: function (x, y, z, nx, ny) { return cells(x * 1.0, y, z * 0.8, 2.6, 0.22); },
      extra: function (g) { for (var i = 0; i < 9; i++) { var z = 0.1 + i * 0.26, r = lerp(0.3, 0.15, z / 2.35); g.box(0.04, 0.1, 0.18, 0, r + 0.025, z, 0x6b4318); } } },
    hpitch: 0.55,
    head: function (g) {
      var hc = function (x, y, z) { return z > 0.4 ? 0xc9a07a : TAN; };
      g.sph(0.14, 0.15, 0.23, 0, 0, 0.1, TAN, { s: [8, 6] }); g.sph(0.1, 0.1, 0.2, 0, -0.07, 0.34, hc, { s: [8, 6] }); g.sph(0.095, 0.09, 0.06, 0, -0.08, 0.5, 0x7a5a48, { s: [6, 4] });
      eyePair(g, 0.125, 0.07, 0.17, 0.035);
      // ossicones
      g.limb(0.07, 0.12, 0.02, 0.07, 0.35, -0.03, 0.03, 0.025, TAN, { seg: 5 }); g.limb(-0.07, 0.12, 0.02, -0.07, 0.35, -0.03, 0.03, 0.025, TAN, { seg: 5 });
      g.sph(0.045, 0.045, 0.045, 0.07, 0.36, -0.03, 0x4a2e12, { s: [6, 4] }); g.sph(0.045, 0.045, 0.045, -0.07, 0.36, -0.03, 0x4a2e12, { s: [6, 4] });
    },
    earAt: [0, 0.1, -0.02], ears: function (g) { earBall(g, 0.17, 0.1, -0.02, 0.08, TAN, 0xd9a0a0); earBall(g, -0.17, 0.1, -0.02, 0.08, TAN, 0xd9a0a0); },
    legs: { hs: 6, fx: 0.2, fy: 1.75, fz: 0.52, hy: 1.7, hz: -0.58, hx: 0.21, fLen: 1.75, hLen: 1.7, fr: [0.125, 0.085, 0.065], hr: [0.14, 0.085, 0.065], haunch: [0.2, 0.34, 0.25],
      col: function (y, ny) { return y < -0.9 ? (fract(y * 4) < 0.1 ? 0xb88c48 : 0xefd9a0) : cells(0, y, 0.0, 3.4, 0.2); }, foot: { type: 'hoof', col: 0x3a2e24, h: 0.09 }, kf: 0.5 },
    tail: { y: 2.3, z: -0.9, n: 2, len: 1.2, r0: 0.045, r1: 0.03, col: TAN, up: -1.2, curl: 0.0, tip: function (g, sl) { g.sph(0.055, 0.13, 0.055, 0, 0, -sl, 0x3a2a1a, { s: [5, 4] }); } },
    fold: { fa: -1.25, ha: -1.2, splay: 0.15, hp: 1.1, hy: 1.4 }
  };
})();

// ---- LION (male with mane) / LIONESS
(function () {
  var TAN = 0xd9a455, LT = 0xeed6a2, MANE = 0x6b3d1b, MANE2 = 0x4a2a12;
  var bc = function (x, y, z, nx, ny) { return ny < -0.45 ? LT : TAN; };
  QUADS.lion = {
    id: 'lion', sexed: true, fScale: 0.88, cy: 0.88, hl: 0.85, hh: 0.34, height: 1.55, size: 1.1, walkA: 0.45, runA: 0.8, bend: 0.9,
    body: function (g, sex) {
      g.sph(0.33, 0.37, 0.52, 0, 0.92, 0.35, bc, { s: [9, 6] }); g.sph(0.29, 0.33, 0.5, 0, 0.84, -0.38, bc, { s: [9, 6] }); g.sph(0.27, 0.3, 0.62, 0, 0.82, 0, bc, { s: [9, 6] });
      if (sex !== 'f') g.sph(0.4, 0.42, 0.34, 0, 0.9, 0.5, function (x, y, z) { return hash3(Math.floor(x * 9), Math.floor(y * 9), Math.floor(z * 9)) > 0.5 ? MANE : MANE2; }, { s: [8, 6] });
    },
    neck: { y: 1.02, z: 0.62, len: 0.3, up: 0.5, r0: 0.22, r1: 0.19, col: TAN },
    hpitch: 0.25, eatY: 0.2,
    head: function (g, sex) {
      var lion = sex !== 'f';
      g.sph(0.19, 0.17, 0.2, 0, 0, 0.1, TAN, { s: [8, 6] }); g.sph(0.105, 0.08, 0.13, 0, -0.065, 0.28, LT, { s: [7, 5] });
      g.sph(0.045, 0.035, 0.035, 0, -0.025, 0.4, 0x3a2220, { s: [5, 4] });
      eyePair(g, 0.1, 0.06, 0.2, 0.026, 0x2a1a08);
      g.box(0.01, 0.05, 0.01, 0, -0.07, 0.38, 0x3a2220);
      if (lion) {
        var mc = function (x, y, z) { return hash3(Math.floor(x * 11), Math.floor(y * 11), Math.floor(z * 11)) > 0.45 ? MANE : MANE2; };
        g.sph(0.4, 0.4, 0.3, 0, -0.04, -0.03, mc, { s: [9, 7] }); g.sph(0.3, 0.25, 0.25, 0, -0.17, 0.05, mc, { s: [8, 6] });
      }
    },
    earAt: [0, 0.1, 0.0], ears: function (g, sex) { var d = sex !== 'f' ? 0.01 : 0; earBall(g, 0.14, 0.17 + d, 0.0, 0.065, TAN, 0xd9a0a0); earBall(g, -0.14, 0.17 + d, 0.0, 0.065, TAN, 0xd9a0a0); },
    legs: { fx: 0.14, fy: 0.62, fz: 0.46, hy: 0.6, hz: -0.55, hx: 0.15, fLen: 0.62, hLen: 0.6, fr: [0.1, 0.075, 0.065], hr: [0.11, 0.075, 0.065], haunch: [0.13, 0.17, 0.2],
      col: function (y, ny) { return y < -0.45 ? LT : TAN; }, foot: { type: 'paw', col: 0x222222, h: 0.07, pawCol: LT } },
    tail: { y: 0.86, z: -0.8, n: 3, len: 0.95, r0: 0.05, r1: 0.035, col: TAN, up: -0.7, curl: 0.2, tip: function (g, sl) { g.sph(0.07, 0.07, 0.15, 0, 0, -sl * 0.9, MANE2, { s: [6, 5] }); } },
    fold: { roll: 0.15, hp: 0.6, hy: 0.9 }
  };
})();

// ---- TIGER
(function () {
  var OR = 0xe5842a, WH = 0xf4efe4, K = 0x1c1614;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.45) return WH;
    var v = (z * 6.5 + sin(y * 5 + x * 2) * 0.45 + (x > 0 ? 0 : 0.3)); return fract(v) < 0.3 ? K : OR;
  };
  QUADS.tiger = {
    id: 'tiger', cy: 0.82, hl: 0.9, hh: 0.33, height: 1.4, size: 1.0, walkA: 0.45, runA: 0.8, bend: 0.9,
    body: function (g) { g.torso({ z0: -1.0, z1: 0.92, n: 20, seg: 14, rxA: 0.29, rxB: 0.33, ryA: 0.34, ryB: 0.38, ycA: 0.8, ycB: 0.86 }, bc); },
    neck: { y: 0.96, z: 0.66, len: 0.28, up: 0.45, r0: 0.21, r1: 0.19, hs: 3, col: function (x, y, z) { return fract(z * 12 + x * 3) < 0.3 ? K : OR; } },
    hpitch: 0.3, eatY: 0.2,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { if (z > 0.18 && ny < 0.3) return WH; if (y > 0.07 && z < 0.12 && z > -0.02) return fract(x * 14) < 0.35 ? K : OR; return fract(z * 16 + abs(x) * 6) < 0.25 ? K : OR; };
      g.sph(0.17, 0.155, 0.19, 0, 0, 0.1, hc, { s: [9, 6] }); g.sph(0.1, 0.075, 0.12, 0, -0.06, 0.27, WH, { s: [7, 5] });
      g.sph(0.2, 0.09, 0.1, 0, -0.05, 0.12, function (x, y, z, nx, ny) { return ny < 0.2 ? WH : OR; }, { s: [8, 5] });
      g.sph(0.042, 0.032, 0.03, 0, -0.025, 0.385, 0xd68a8a, { s: [5, 4] });
      eyePair(g, 0.095, 0.06, 0.21, 0.025, 0x3a2208);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earBall(g, 0.12, 0.17, 0.0, 0.06, OR, K); earBall(g, -0.12, 0.17, 0.0, 0.06, OR, K); },
    legs: { hs: 4, fx: 0.13, fy: 0.62, fz: 0.47, hy: 0.6, hz: -0.58, hx: 0.14, fLen: 0.62, hLen: 0.6, fr: [0.095, 0.07, 0.06], hr: [0.11, 0.07, 0.06], haunch: [0.13, 0.17, 0.2],
      col: function (y, ny) { return y < -0.5 ? WH : (fract(y * 10) < 0.3 ? K : OR); }, foot: { type: 'paw', col: 0x222222, h: 0.07, pawCol: WH } },
    tail: { y: 0.84, z: -0.82, n: 3, len: 1.0, r0: 0.05, r1: 0.04, hs: 4, col: function (i, x, y, z) { return fract(-z * 9 + i * 0.4) < 0.3 ? K : OR; }, up: -0.6, curl: 0.15, tip: function (g, sl) { g.sph(0.045, 0.045, 0.08, 0, 0, -sl, K, { s: [5, 4] }); } },
    fold: { roll: 0.1, hp: 0.6, hy: 0.9 }
  };
})();

// ---- ELEPHANT
(function () {
  var GR = 0x8e8f9a, GL = 0xa4a5b0, GD = 0x75767f, IV = 0xf3ecd8;
  var bc = function (x, y, z, nx, ny, nz) { return hash3(Math.floor(x * 6), Math.floor(y * 6), Math.floor(z * 6)) > 0.8 ? GD : GR; };
  QUADS.elephant = {
    id: 'elephant', cy: 2.45, hl: 1.9, hh: 1.0, height: 4.0, size: 3.0, walkA: 0.3, runA: 0.45, bend: 0.25, babyScale: 0.42, babyHead: 1.35, hopH: 1.4, eatNA: 0.0, eatTP: 0.0, eatHP: 0.3,
    body: function (g) { g.sph(1.0, 1.1, 1.0, 0, 2.55, 0.8, bc, { s: [10, 8] }); g.sph(1.0, 1.04, 1.05, 0, 2.4, -0.85, bc, { s: [10, 8] }); g.sph(0.95, 1.0, 1.2, 0, 2.45, 0, bc, { s: [10, 8] }); },
    neck: { y: 2.85, z: 1.45, len: 0.35, up: 0.0, r0: 0.6, r1: 0.55, col: GR },
    hpitch: 0.1, eatY: 0.5,
    head: function (g) {
      g.sph(0.58, 0.66, 0.6, 0, 0.0, 0.28, GR, { s: [9, 7] }); g.sph(0.46, 0.44, 0.44, 0, 0.32, 0.18, GR, { s: [8, 6] }); g.sph(0.38, 0.38, 0.34, 0, -0.2, 0.68, GR, { s: [8, 6] });
      eyePair(g, 0.45, 0.1, 0.6, 0.05, 0x1a1210);
      g.limb(0.28, -0.32, 0.75, 0.34, -0.8, 1.05, 0.085, 0.055, IV, { seg: 6 }); g.limb(0.34, -0.8, 1.05, 0.32, -0.75, 1.5, 0.055, 0.015, IV, { seg: 6 });
      g.limb(-0.28, -0.32, 0.75, -0.34, -0.8, 1.05, 0.085, 0.055, IV, { seg: 6 }); g.limb(-0.34, -0.8, 1.05, -0.32, -0.75, 1.5, 0.055, 0.015, IV, { seg: 6 });
    },
    trunk: { n: 4, len: 2.2, r0: 0.38, r1: 0.12, at: [0, -0.12, 0.84], col: GR, idle: [0.15, -0.1, -0.3, -0.5], eat: [-1.1, -0.9, -0.7, -0.6], slp: [0.3, 0.1, -0.2, -0.5] },
    earPivot: [0.5, 0.3, 0.08], earFlare: 0.35, earFlap: 0.4,
    earsLR: function (r) {
      var g = B(), s = r ? -1 : 1;
      g.sph(0.045, 0.75, 0.66, s * 0.03, -0.2, -0.5, function (x, y, z, nx) { return abs(nx) < 0.5 ? GR : shade(GL, 0.95); }, { s: [8, 7] });
      g.sph(0.05, 0.6, 0.52, s * 0.03 + s * 0.015, -0.22, -0.52, 0xb09090, { s: [7, 6] });
      return g.build();
    },
    legs: { fx: 0.55, fy: 1.5, fz: 1.0, hy: 1.5, hz: -1.15, hx: 0.55, fLen: 1.5, hLen: 1.5, fr: [0.36, 0.31, 0.29], hr: [0.38, 0.31, 0.29], two: false, col: GR,
      foot: { type: 'foot', col: 0xe0dac8, h: 0.14, base: GD } },
    tail: { y: 2.25, z: -1.85, n: 2, len: 1.3, r0: 0.06, r1: 0.04, col: GR, up: -1.3, curl: -0.1, tip: function (g, sl) { g.sph(0.07, 0.1, 0.07, 0, 0, -sl, 0x333338, { s: [5, 4] }); } },
    fold: { fa: -0.5, ha: -0.5, fb: 0, hb: 0, splay: 1.25, hp: 0.7, hy: 0.0, na: 0, lieY: 1.15 }
  };
})();

// ---- RHINO
(function () {
  var GR = 0x8f8c86, GD = 0x74716c, HORN = 0xe8e0c6;
  var bc = function (x, y, z) { return hash3(Math.floor(x * 5), Math.floor(y * 5), Math.floor(z * 5)) > 0.85 ? GD : GR; };
  QUADS.rhino = {
    id: 'rhino', cy: 1.3, hl: 1.45, hh: 0.7, height: 1.95, size: 1.7, walkA: 0.35, runA: 0.55, bend: 0.3, babyScale: 0.48, babyHead: 1.4,
    body: function (g) {
      g.sph(0.68, 0.76, 0.85, 0, 1.35, 0.55, bc, { s: [10, 7] }); g.sph(0.7, 0.72, 0.85, 0, 1.28, -0.55, bc, { s: [10, 7] }); g.sph(0.65, 0.7, 0.95, 0, 1.28, 0, bc, { s: [10, 7] });
      g.sph(0.7, 0.07, 0.32, 0, 1.2, 0.48, GD, { s: [8, 4], rot: [0, 0, 0] }); g.sph(0.7, 0.07, 0.3, 0, 1.15, -0.5, GD, { s: [8, 4] });
    },
    neck: { y: 1.3, z: 1.1, len: 0.5, up: -0.05, r0: 0.42, r1: 0.36, col: GR },
    hpitch: 0.5, eatY: 0.2, eatHP: 0.9, eatNA: -0.7,
    head: function (g) {
      g.sph(0.31, 0.33, 0.45, 0, 0, 0.2, GR, { s: [9, 7] }); g.sph(0.25, 0.23, 0.35, 0, -0.08, 0.6, GR, { s: [8, 6] }); g.sph(0.2, 0.12, 0.2, 0, -0.17, 0.82, GD, { s: [7, 5] });
      g.cone(0.14, 0.62, 0, 0.3, 0.76, HORN, { seg: 7, rot: [0.55, 0, 0] }); g.cone(0.09, 0.28, 0, 0.36, 0.42, HORN, { seg: 6, rot: [0.2, 0, 0] });
      eyePair(g, 0.29, 0.1, 0.34, 0.032);
      g.sph(0.04, 0.04, 0.03, 0.08, -0.05, 0.98, 0x333333, { s: [4, 3] }); g.sph(0.04, 0.04, 0.03, -0.08, -0.05, 0.98, 0x333333, { s: [4, 3] });
    },
    earAt: [0, 0.2, 0.0], ears: function (g) { earCone(g, 0.17, 0.3, 0.0, 0.09, 0.26, 0.2, GR, 0xc9a8a0); earCone(g, -0.17, 0.3, 0.0, 0.09, 0.26, 0.2, GR, 0xc9a8a0); },
    legs: { fx: 0.4, fy: 0.78, fz: 0.62, hy: 0.78, hz: -0.7, hx: 0.42, fLen: 0.78, hLen: 0.78, fr: [0.23, 0.2, 0.19], hr: [0.25, 0.21, 0.19], two: false, col: function (y) { return y < -0.55 ? GD : GR; },
      foot: { type: 'toes', col: 0x4a4844, h: 0.09 }, bend: 0.3 },
    tail: { y: 1.25, z: -1.4, n: 2, len: 0.75, r0: 0.05, r1: 0.03, col: GD, up: -1.2, tip: function (g, sl) { g.sph(0.05, 0.08, 0.05, 0, 0, -sl, 0x333333, { s: [5, 4] }); } },
    fold: { fa: -0.4, ha: -0.4, splay: 1.2, hp: 0.9, hy: 0.4, na: -0.2 }
  };
})();

// ---- HIPPO
(function () {
  var GR = 0x8b8094, PK = 0xd9a0a6, GD = 0x70667a;
  var bc = function (x, y, z, nx, ny) { return ny < -0.55 ? 0xb89aa6 : GR; };
  QUADS.hippo = {
    id: 'hippo', cy: 1.0, hl: 1.5, hh: 0.75, height: 1.9, size: 1.5, walkA: 0.35, runA: 0.5, bend: 0.3, babyScale: 0.45, babyHead: 1.3, swimDrop: 1.15,
    body: function (g) { g.sph(0.8, 0.74, 1.0, 0, 1.0, 0.45, bc, { s: [10, 7] }); g.sph(0.82, 0.74, 1.0, 0, 1.0, -0.5, bc, { s: [10, 7] }); g.sph(0.76, 0.72, 1.2, 0, 0.98, 0, bc, { s: [10, 7] }); },
    neck: { y: 1.05, z: 1.15, len: 0.25, up: 0.0, r0: 0.55, r1: 0.5, col: GR },
    hpitch: 0.12, eatY: 0.2, eatNA: -0.4, eatHP: 0.6,
    head: function (g) {
      g.sph(0.52, 0.45, 0.55, 0, 0.0, 0.25, GR, { s: [9, 7] }); g.sph(0.5, 0.3, 0.42, 0, -0.1, 0.72, GR, { s: [9, 6] });
      g.sph(0.44, 0.17, 0.4, 0, -0.3, 0.68, 0xc29aa4, { s: [8, 5] });
      g.box(0.78, 0.025, 0.02, 0, -0.17, 0.94, 0x40303a);
      g.sph(0.065, 0.06, 0.06, 0.17, 0.2, 1.0, GD, { s: [5, 4] }); g.sph(0.065, 0.06, 0.06, -0.17, 0.2, 1.0, GD, { s: [5, 4] });
      g.sph(0.1, 0.1, 0.1, 0.3, 0.4, 0.3, GR, { s: [6, 5] }); g.sph(0.1, 0.1, 0.1, -0.3, 0.4, 0.3, GR, { s: [6, 5] });
      eyePair(g, 0.3, 0.45, 0.36, 0.045, 0x1a1210);
      g.cone(0.04, 0.1, 0.22, -0.2, 0.92, 0xf0ead8, { seg: 5, rot: [0, 0, 0] }); g.cone(0.04, 0.1, -0.22, -0.2, 0.92, 0xf0ead8, { seg: 5 });
    },
    earAt: [0, 0.3, 0.05], ears: function (g) { earBall(g, 0.34, 0.55, 0.05, 0.075, GR, PK); earBall(g, -0.34, 0.55, 0.05, 0.075, GR, PK); },
    legs: { fx: 0.46, fy: 0.55, fz: 0.75, hy: 0.55, hz: -0.8, hx: 0.48, fLen: 0.55, hLen: 0.55, fr: [0.26, 0.23, 0.22], hr: [0.27, 0.23, 0.22], two: false, col: function (y) { return y < -0.4 ? GD : GR; },
      foot: { type: 'toes', col: 0x4a4048, h: 0.08 } },
    tail: { y: 1.2, z: -1.4, n: 1, len: 0.3, r0: 0.07, r1: 0.04, col: GD, up: -0.7 },
    fold: { fa: -0.4, ha: -0.4, splay: 1.25, hp: 0.4, hy: 0.5, na: -0.1 }
  };
})();

// ---- PANDA
(function () {
  var W = 0xf6f4ee, K = 0x1a1a1e;
  var bc = function (x, y, z, nx, ny) { return (z > 0.04 && z < 0.5 && ny > -0.65) ? K : W; };
  QUADS.panda = {
    id: 'panda', cy: 0.58, hl: 0.65, hh: 0.4, height: 1.0, size: 0.8, walkA: 0.4, runA: 0.6, bend: 0.5, babyScale: 0.5, babyHead: 1.35, sitStates: ['idle', 'eat', 'drink', 'play'], hopH: 0.8,
    body: function (g) { g.sph(0.4, 0.42, 0.45, 0, 0.62, 0.3, bc, { s: [9, 7] }); g.sph(0.43, 0.43, 0.45, 0, 0.58, -0.28, bc, { s: [9, 7] }); g.sph(0.39, 0.4, 0.5, 0, 0.58, 0, bc, { s: [9, 7] }); },
    neck: { y: 0.78, z: 0.55, len: 0.18, up: 0.15, r0: 0.28, r1: 0.26, col: W },
    hpitch: 0.35, eatY: 0.1, eatNA: -0.4, eatHP: 0.8,
    head: function (g) {
      g.sph(0.28, 0.25, 0.26, 0, 0.0, 0.12, W, { s: [9, 7] }); g.sph(0.11, 0.09, 0.13, 0, -0.07, 0.34, W, { s: [7, 5] });
      g.sph(0.05, 0.035, 0.035, 0, -0.03, 0.46, K, { s: [5, 4] });
      g.sph(0.07, 0.095, 0.05, 0.12, 0.04, 0.3, K, { s: [6, 5], rot: [0, 0, 0.5] }); g.sph(0.07, 0.095, 0.05, -0.12, 0.04, 0.3, K, { s: [6, 5], rot: [0, 0, -0.5] });
      eyePair(g, 0.115, 0.04, 0.34, 0.018, 0x333333); g.sph(0.012, 0.012, 0.01, 0.116, 0.045, 0.356, 0xffffff, { s: [3, 3] });
    },
    earAt: [0, 0.2, 0.0], ears: function (g) { earBall(g, 0.2, 0.22, 0.02, 0.095, K); earBall(g, -0.2, 0.22, 0.02, 0.095, K); },
    legs: { fx: 0.27, fy: 0.37, fz: 0.4, hy: 0.37, hz: -0.4, hx: 0.27, fLen: 0.4, hLen: 0.4, fr: [0.13, 0.11, 0.1], hr: [0.15, 0.12, 0.1], col: K, two: true, foot: { type: 'paw', col: K, h: 0.07, pawCol: K } },
    tail: { y: 0.6, z: -0.7, n: 1, len: 0.14, r0: 0.07, r1: 0.04, col: W, up: -0.2 },
    sit: { p: -1.15, fa: -0.35, fb: -0.1, ha: -1.45, hb: 0.1, hs: 0.25, fs: 0.2, na: -0.25, hp: 0.25, eat: { fa: -0.95, fb: -1.5 } },
    fold: { roll: 0.2, hp: 0.9, hy: 0.7 }
  };
})();

// ---- GORILLA
(function () {
  var BL = 0x34343a, SK = 0x4a4a52, SIL = 0xb0b0b8, FC = 0x232328;
  QUADS.gorilla = {
    id: 'gorilla', sexed: true, fScale: 0.82, cy: 1.0, hl: 0.8, hh: 0.55, height: 1.7, size: 1.4, walkA: 0.38, runA: 0.55, bend: 0.4, babyScale: 0.45, babyHead: 1.4, sitStates: ['idle', 'eat', 'drink'], hopH: 0.8,
    body: function (g, sex) {
      var bc = function (x, y, z, nx, ny) { if (sex !== 'f' && ny > 0.25 && z < 0.5) return SIL; return BL; };
      g.sph(0.58, 0.62, 0.5, 0, 1.2, 0.38, bc, { s: [9, 7] }); g.sph(0.46, 0.42, 0.5, 0, 0.82, -0.38, bc, { s: [9, 7] }); g.sph(0.5, 0.52, 0.6, 0, 1.0, 0, bc, { s: [9, 7] });
      g.sph(0.3, 0.2, 0.2, 0, 1.15, 0.8, SK, { s: [7, 5] });
    },
    neck: { y: 1.38, z: 0.62, len: 0.2, up: 0.0, r0: 0.38, r1: 0.34, col: BL },
    hpitch: 0.25, eatY: 0.3, eatNA: -0.5, eatHP: 0.7,
    head: function (g, sex) {
      g.sph(0.23, 0.25, 0.26, 0, 0.06, 0.1, BL, { s: [8, 6] }); g.sph(0.17, 0.2, 0.2, 0, sex === 'f' ? 0.2 : 0.27, 0.0, sex === 'f' ? BL : 0x4a4a52, { s: [7, 5] });
      g.sph(0.19, 0.14, 0.12, 0, 0.0, 0.25, SK, { s: [7, 5] }); g.sph(0.14, 0.09, 0.13, 0, -0.09, 0.3, SK, { s: [7, 5] });
      g.box(0.34, 0.05, 0.08, 0, 0.11, 0.3, FC);
      g.sph(0.025, 0.02, 0.02, 0.04, -0.03, 0.4, FC, { s: [4, 3] }); g.sph(0.025, 0.02, 0.02, -0.04, -0.03, 0.4, FC, { s: [4, 3] });
      eyePair(g, 0.075, 0.07, 0.34, 0.02, 0x3a1e10);
      g.sph(0.04, 0.06, 0.02, 0.22, 0.04, 0.05, SK, { s: [5, 4] }); g.sph(0.04, 0.06, 0.02, -0.22, 0.04, 0.05, SK, { s: [5, 4] });
    },
    legs: { fx: 0.5, fy: 1.1, fz: 0.42, hy: 0.55, hz: -0.42, hx: 0.3, fLen: 1.1, hLen: 0.55, fr: [0.2, 0.16, 0.14], hr: [0.17, 0.13, 0.11], col: BL, two: true, kf: 0.5,
      shoulder: [0.2, 0.22, 0.2, 0, 0, 0], foot: { type: 'hand', col: FC, h: 0.1 }, haunch: [0.17, 0.2, 0.2] },
    sit: { p: -0.85, fa: -0.35, fb: 0.3, ha: -1.2, hb: 0.2, hs: 0.3, fs: 0.25, na: 0.15, hp: 0.15, eat: { fa: -0.8, fb: -1.2 }, z: 0 },
    fold: { roll: 0.1, hp: 0.8, hy: 0.6 }
  };
})();

// ---- RED PANDA
(function () {
  var RU = 0xc9561f, DK = 0x2e1b16, WH = 0xf7eee2, CR = 0xe9cfae;
  var bc = function (x, y, z, nx, ny) { return ny < -0.4 ? DK : RU; };
  QUADS.red_panda = {
    id: 'red_panda', cy: 0.34, hl: 0.5, hh: 0.2, height: 0.62, size: 0.45, walkA: 0.5, runA: 0.8, bend: 0.8, babyScale: 0.55, babyHead: 1.3, hopH: 0.6,
    body: function (g) { g.sph(0.19, 0.18, 0.24, 0, 0.36, 0.17, bc, { s: [8, 6] }); g.sph(0.2, 0.18, 0.24, 0, 0.35, -0.17, bc, { s: [8, 6] }); g.sph(0.18, 0.17, 0.3, 0, 0.34, 0, bc, { s: [8, 6] }); },
    neck: { y: 0.42, z: 0.34, len: 0.08, up: 0.2, r0: 0.13, r1: 0.12, col: RU },
    hpitch: 0.35, eatY: 0.08, eatNA: -0.3, eatHP: 0.8,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { if (z > 0.12 && ny < 0.7) return WH; return RU; };
      g.sph(0.125, 0.105, 0.11, 0, 0, 0.06, hc, { s: [8, 6] }); g.sph(0.055, 0.045, 0.06, 0, -0.035, 0.15, WH, { s: [6, 5] });
      g.sph(0.026, 0.02, 0.02, 0, -0.025, 0.2, 0x1a1010, { s: [4, 3] });
      g.sph(0.015, 0.04, 0.02, 0.06, -0.01, 0.14, DK, { s: [4, 3], rot: [0.3, 0, 0.3] }); g.sph(0.015, 0.04, 0.02, -0.06, -0.01, 0.14, DK, { s: [4, 3], rot: [0.3, 0, -0.3] });
      eyePair(g, 0.06, 0.04, 0.13, 0.017);
    },
    earAt: [0, 0.1, 0.02], ears: function (g) { earCone(g, 0.08, 0.1, 0.0, 0.05, 0.1, 0.2, RU, WH); earCone(g, -0.08, 0.1, 0.0, 0.05, 0.1, 0.2, RU, WH); },
    legs: { fx: 0.1, fy: 0.22, fz: 0.2, hy: 0.22, hz: -0.2, hx: 0.1, fLen: 0.22, hLen: 0.22, fr: [0.055, 0.045, 0.04], hr: [0.06, 0.047, 0.04], col: DK, foot: { type: 'paw', col: DK, h: 0.04, pawCol: DK } },
    tail: { y: 0.36, z: -0.34, n: 3, len: 0.7, r0: 0.075, r1: 0.085, col: function (i, x, y, z) { return fract(-z * 7 + i * 0.5) < 0.5 ? RU : CR; }, up: -0.35, curl: -0.2, tip: function (g, sl) { g.sph(0.085, 0.085, 0.09, 0, 0, -sl * 0.8, DK, { s: [6, 5] }); } },
    fold: { roll: 0.0, hp: 0.9, hy: 0.7 }
  };
})();

// ---- WOLF
(function () {
  var GR = 0x8e8f96, LT = 0xd3d0c8, DK = 0x56575f;
  var bc = function (x, y, z, nx, ny) { if (ny < -0.35) return LT; return (ny > 0.5 ? DK : GR); };
  QUADS.wolf = {
    id: 'wolf', cy: 0.74, hl: 0.8, hh: 0.27, height: 1.2, size: 0.85, walkA: 0.42, runA: 0.75, bend: 0.9, babyScale: 0.5, babyHead: 1.4,
    body: function (g) { g.sph(0.25, 0.3, 0.42, 0, 0.8, 0.32, bc, { s: [9, 7] }); g.sph(0.22, 0.26, 0.38, 0, 0.72, -0.34, bc, { s: [9, 7] }); g.sph(0.2, 0.24, 0.52, 0, 0.72, 0, bc, { s: [9, 7] }); },
    neck: { y: 0.88, z: 0.56, len: 0.3, up: 0.6, r0: 0.17, r1: 0.14, col: function (x, y, z, nx, ny) { return ny < -0.3 ? LT : GR; } },
    hpitch: 0.5, eatY: 0.15,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return (z > 0.2 && ny < 0.5) ? LT : (ny > 0.55 ? DK : GR); };
      g.sph(0.14, 0.135, 0.17, 0, 0, 0.1, hc, { s: [8, 6] }); g.sph(0.075, 0.065, 0.18, 0, -0.045, 0.3, hc, { s: [7, 5] });
      g.sph(0.04, 0.032, 0.03, 0, -0.03, 0.48, 0x151515, { s: [5, 4] });
      g.sph(0.17, 0.07, 0.1, 0, -0.07, 0.05, LT, { s: [7, 5] });
      eyePair(g, 0.08, 0.05, 0.2, 0.022, 0xd8a020);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earCone(g, 0.075, 0.19, -0.02, 0.055, 0.17, 0.1, GR, 0xd8b8b0); earCone(g, -0.075, 0.19, -0.02, 0.055, 0.17, 0.1, GR, 0xd8b8b0); },
    legs: { fx: 0.11, fy: 0.54, fz: 0.4, hy: 0.52, hz: -0.46, hx: 0.12, fLen: 0.54, hLen: 0.52, fr: [0.07, 0.05, 0.042], hr: [0.08, 0.05, 0.042], haunch: [0.1, 0.16, 0.16], col: function (y) { return y < -0.35 ? LT : GR; },
      foot: { type: 'paw', col: 0x222222, h: 0.05, pawCol: LT } },
    tail: { y: 0.78, z: -0.66, n: 2, len: 0.85, r0: 0.05, r1: 0.09, col: function (i, x, y, z, nx, ny) { return ny > 0.4 ? DK : GR; }, up: -0.55, curl: -0.1, tip: function (g, sl) { g.sph(0.08, 0.08, 0.1, 0, 0, -sl * 0.7, 0x2c2d33, { s: [6, 5] }); } },
    fold: { roll: 0.15, hp: 0.7, hy: 0.8 }
  };
})();

// ---- BROWN BEAR
(function () {
  var BR = 0x6d4a2e, LT = 0x8d6a47, DK = 0x4e3320;
  var bc = function (x, y, z, nx, ny) { return hash3(Math.floor(x * 7), Math.floor(y * 7), Math.floor(z * 7)) > 0.8 ? DK : BR; };
  QUADS.brown_bear = {
    id: 'brown_bear', cy: 0.95, hl: 0.9, hh: 0.5, height: 1.65, size: 1.3, walkA: 0.35, runA: 0.55, bend: 0.5, babyScale: 0.45, babyHead: 1.4, sitStates: ['eat'],
    body: function (g) {
      g.sph(0.5, 0.55, 0.6, 0, 1.0, 0.4, bc, { s: [9, 7] }); g.sph(0.36, 0.3, 0.42, 0, 1.4, 0.42, bc, { s: [8, 6] }); g.sph(0.5, 0.5, 0.6, 0, 0.9, -0.4, bc, { s: [9, 7] }); g.sph(0.46, 0.5, 0.65, 0, 0.92, 0, bc, { s: [9, 7] });
    },
    neck: { y: 1.12, z: 0.85, len: 0.25, up: -0.05, r0: 0.38, r1: 0.34, col: BR },
    hpitch: 0.4, eatY: 0.2, eatNA: -0.5, eatHP: 0.8,
    head: function (g) {
      g.sph(0.27, 0.26, 0.29, 0, 0, 0.1, BR, { s: [9, 7] }); g.sph(0.14, 0.12, 0.19, 0, -0.08, 0.32, LT, { s: [8, 6] });
      g.sph(0.06, 0.045, 0.04, 0, -0.04, 0.5, 0x1a1210, { s: [5, 4] });
      eyePair(g, 0.14, 0.08, 0.27, 0.026, 0x1a1008);
    },
    earAt: [0, 0.2, 0.0], ears: function (g) { earBall(g, 0.19, 0.22, 0.0, 0.075, BR, DK); earBall(g, -0.19, 0.22, 0.0, 0.075, BR, DK); },
    legs: { fx: 0.3, fy: 0.62, fz: 0.5, hy: 0.6, hz: -0.55, hx: 0.3, fLen: 0.62, hLen: 0.6, fr: [0.17, 0.13, 0.12], hr: [0.19, 0.14, 0.12], col: BR, haunch: [0.18, 0.22, 0.22],
      foot: { type: 'paw', col: 0xd8d0c0, h: 0.08, pawCol: DK, claws: true } },
    tail: { y: 0.95, z: -0.95, n: 1, len: 0.14, r0: 0.07, r1: 0.05, col: BR, up: -0.4 },
    sit: { p: -0.9, fa: -0.4, fb: 0.2, ha: -1.4, hb: 0.1, hs: 0.3, fs: 0.2, na: 0.0, hp: 0.3, eat: { fa: -0.9, fb: -1.3 } },
    fold: { roll: 0.15, hp: 0.8, hy: 0.8 }
  };
})();

// ---- POLAR BEAR
(function () {
  var WH = 0xf4f2ea, SH = 0xdedbd0;
  var bc = function (x, y, z, nx, ny) { return ny < -0.3 ? SH : WH; };
  QUADS.polar_bear = {
    id: 'polar_bear', cy: 0.9, hl: 1.0, hh: 0.5, height: 1.6, size: 1.35, walkA: 0.35, runA: 0.55, bend: 0.5, babyScale: 0.45, babyHead: 1.4, swimDrop: 0.65,
    body: function (g) { g.sph(0.46, 0.5, 0.6, 0, 0.98, 0.45, bc, { s: [9, 7] }); g.sph(0.5, 0.5, 0.65, 0, 0.88, -0.45, bc, { s: [9, 7] }); g.sph(0.44, 0.48, 0.75, 0, 0.92, 0, bc, { s: [9, 7] }); },
    neck: { y: 1.1, z: 0.9, len: 0.4, up: 0.15, r0: 0.3, r1: 0.25, col: WH },
    hpitch: 0.4, eatY: 0.2, eatNA: -0.5, eatHP: 0.8,
    head: function (g) {
      g.sph(0.21, 0.2, 0.24, 0, 0, 0.1, WH, { s: [9, 7] }); g.sph(0.11, 0.1, 0.22, 0, -0.06, 0.33, WH, { s: [8, 6] });
      g.sph(0.055, 0.04, 0.035, 0, -0.02, 0.54, 0x1a1a1a, { s: [5, 4] });
      eyePair(g, 0.11, 0.06, 0.25, 0.022, 0x111111);
    },
    earAt: [0, 0.15, 0.0], ears: function (g) { earBall(g, 0.14, 0.17, 0.0, 0.06, WH, 0xe8c8c0); earBall(g, -0.14, 0.17, 0.0, 0.06, WH, 0xe8c8c0); },
    legs: { fx: 0.28, fy: 0.62, fz: 0.52, hy: 0.6, hz: -0.58, hx: 0.29, fLen: 0.62, hLen: 0.6, fr: [0.17, 0.13, 0.12], hr: [0.18, 0.14, 0.12], col: WH, haunch: [0.16, 0.2, 0.22],
      foot: { type: 'paw', col: 0x2a2a2a, h: 0.08, pawCol: SH, claws: true } },
    tail: { y: 0.92, z: -1.0, n: 1, len: 0.1, r0: 0.06, r1: 0.04, col: WH, up: -0.3 },
    fold: { roll: 0.12, hp: 0.8, hy: 0.7 }
  };
})();

// ---- CAMEL
(function () {
  var TN = 0xc9995a, DK = 0x9a7040, LT = 0xdcb67e;
  var bc = function (x, y, z, nx, ny) { return ny < -0.5 ? LT : TN; };
  QUADS.camel = {
    id: 'camel', cy: 1.58, hl: 1.2, hh: 0.5, height: 2.7, size: 1.9, walkA: 0.33, runA: 0.5, bend: 0.6, babyScale: 0.5, babyHead: 1.35, reach: 0.25, eatY: 0.3,
    body: function (g) {
      g.sph(0.4, 0.5, 0.55, 0, 1.62, 0.5, bc, { s: [9, 7] }); g.sph(0.4, 0.5, 0.55, 0, 1.58, -0.5, bc, { s: [9, 7] }); g.sph(0.37, 0.46, 0.8, 0, 1.56, 0, bc, { s: [9, 7] });
      g.sph(0.33, 0.45, 0.42, 0, 2.05, -0.05, function (x, y, z, nx, ny) { return ny > 0.4 ? DK : TN; }, { s: [8, 6] });
      g.sph(0.28, 0.2, 0.3, 0, 2.3, -0.05, DK, { s: [7, 5] });
    },
    neck: { y: 1.82, z: 0.8, len: 1.05, up: 0.85, r0: 0.25, r1: 0.14, col: TN },
    hpitch: 0.65, eatY: 0.3,
    head: function (g) {
      g.sph(0.135, 0.14, 0.2, 0, 0, 0.1, TN, { s: [8, 6] }); g.sph(0.105, 0.095, 0.17, 0, -0.065, 0.3, LT, { s: [7, 5] }); g.sph(0.1, 0.07, 0.06, 0, -0.08, 0.44, 0xb89870, { s: [6, 4] });
      g.sph(0.02, 0.02, 0.02, 0.04, -0.02, 0.47, 0x333333, { s: [4, 3] }); g.sph(0.02, 0.02, 0.02, -0.04, -0.02, 0.47, 0x333333, { s: [4, 3] });
      g.sph(0.15, 0.04, 0.05, 0, 0.1, 0.2, DK, { s: [6, 4] });
      eyePair(g, 0.12, 0.07, 0.18, 0.03, 0x2a1a0a);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earBall(g, 0.1, 0.18, -0.03, 0.05, TN, 0xd9a0a0); earBall(g, -0.1, 0.18, -0.03, 0.05, TN, 0xd9a0a0); },
    legs: { fx: 0.2, fy: 1.2, fz: 0.55, hy: 1.2, hz: -0.58, hx: 0.21, fLen: 1.2, hLen: 1.2, fr: [0.12, 0.085, 0.065], hr: [0.14, 0.09, 0.065], haunch: [0.17, 0.28, 0.24],
      col: function (y) { return y < -0.9 ? DK : TN; }, foot: { type: 'paw', col: 0xa07c50, h: 0.08, pawCol: 0xa07c50 } },
    tail: { y: 1.62, z: -1.1, n: 2, len: 0.75, r0: 0.04, r1: 0.04, col: DK, up: -1.1, curl: 0, tip: function (g, sl) { g.sph(0.06, 0.1, 0.06, 0, 0, -sl, 0x5a4028, { s: [5, 4] }); } },
    fold: { fa: -1.3, ha: -1.25, splay: 0.25, hp: 0.9, hy: 0.2, na: 0.2, lieY: 0.85 }
  };
})();

// ---- MEERKAT
(function () {
  var SD = 0xcaa774, LT = 0xe8d6b0, DK = 0x3b2a20;
  var bc = function (x, y, z, nx, ny) { if (ny < -0.1 || (ny < 0.3 && z > 0)) return LT; return fract(z * 22 + y * 5) < 0.2 ? 0x9a7c52 : SD; };
  QUADS.meerkat = {
    id: 'meerkat', cy: 0.25, hl: 0.35, hh: 0.14, height: 0.55, size: 0.35, walkA: 0.55, runA: 0.9, bend: 1.0, babyScale: 0.6, babyHead: 1.3, sitStates: ['idle', 'eat', 'drink', 'play'], hopH: 0.5,
    body: function (g) { g.sph(0.115, 0.125, 0.17, 0, 0.27, 0.12, bc, { s: [8, 6] }); g.sph(0.12, 0.125, 0.19, 0, 0.25, -0.12, bc, { s: [8, 6] }); g.sph(0.105, 0.115, 0.22, 0, 0.25, 0, bc, { s: [8, 6] }); },
    neck: { y: 0.31, z: 0.22, len: 0.07, up: 0.3, r0: 0.08, r1: 0.075, col: SD },
    hpitch: 0.3, eatY: 0.05, eatNA: -0.3, eatHP: 0.8,
    head: function (g) {
      g.sph(0.085, 0.075, 0.085, 0, 0, 0.05, SD, { s: [8, 6] }); g.sph(0.04, 0.035, 0.07, 0, -0.025, 0.14, LT, { s: [6, 5] });
      g.sph(0.018, 0.015, 0.015, 0, -0.01, 0.2, 0x1a1210, { s: [4, 3] });
      g.sph(0.03, 0.04, 0.02, 0.05, 0.02, 0.1, DK, { s: [5, 4] }); g.sph(0.03, 0.04, 0.02, -0.05, 0.02, 0.1, DK, { s: [5, 4] });
      eyePair(g, 0.05, 0.025, 0.115, 0.015, 0x050505);
    },
    earAt: [0, 0.05, 0.0], ears: function (g) { earBall(g, 0.08, 0.04, 0.0, 0.025, DK); earBall(g, -0.08, 0.04, 0.0, 0.025, DK); },
    legs: { fx: 0.075, fy: 0.17, fz: 0.15, hy: 0.17, hz: -0.16, hx: 0.08, fLen: 0.17, hLen: 0.17, fr: [0.04, 0.032, 0.028], hr: [0.05, 0.036, 0.03], col: SD, haunch: [0.06, 0.08, 0.09],
      foot: { type: 'paw', col: 0x3a2a20, h: 0.03, pawCol: SD } },
    tail: { y: 0.2, z: -0.3, n: 2, len: 0.42, r0: 0.04, r1: 0.022, col: SD, up: -0.45, curl: 0.0, tip: function (g, sl) { g.sph(0.024, 0.024, 0.05, 0, 0, -sl, DK, { s: [4, 3] }); } },
    sit: { p: -1.3, fa: -0.15, fb: -0.4, ha: -0.3, hb: 0.5, hs: 0.15, fs: 0.15, na: -0.2, hp: 0.0, feet: true, eat: { fa: -0.9, fb: -1.6 } },
    fold: { roll: 0.1, hp: 0.8, hy: 0.6 }
  };
})();

// ---- CROCODILE
(function () {
  var GR = 0x62803a, DK = 0x435e2b, LT = 0xd6d3a0;
  var bc = function (x, y, z, nx, ny) { if (ny < -0.3) return LT; return hash3(Math.floor(x * 14), Math.floor(y * 14), Math.floor(z * 10)) > 0.6 ? DK : GR; };
  QUADS.crocodile = {
    id: 'crocodile', cy: 0.27, hl: 1.0, hh: 0.17, height: 0.5, size: 0.5, walkA: 0.3, runA: 0.5, bend: 0.5, babyScale: 0.35, babyHead: 1.3, swimDrop: 0.2, hopH: 0.3,
    body: function (g) {
      g.sph(0.42, 0.22, 0.95, 0, 0.28, 0, bc, { s: [10, 6] });
      for (var i = 0; i < 8; i++) { var z = -0.7 + i * 0.22; g.cone(0.045, 0.1, -0.08, 0.45 + (i % 2) * 0.0, z, DK, { seg: 4 }); g.cone(0.045, 0.1, 0.08, 0.45, z, DK, { seg: 4 }); }
    },
    neck: { y: 0.3, z: 0.85, len: 0.0, up: 0.0, r0: 0.2, r1: 0.2, col: GR },
    hpitch: 0.0, eatNA: 0.0, eatHP: 0.55, eatTP: 0.0,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return ny < -0.3 ? LT : (hash3(Math.floor(x * 20), Math.floor(y * 20), Math.floor(z * 12)) > 0.7 ? DK : GR); };
      g.sph(0.2, 0.13, 0.3, 0, 0, 0.1, hc, { s: [8, 6] }); g.sph(0.13, 0.07, 0.45, 0, -0.01, 0.55, hc, { s: [8, 5] }); g.sph(0.13, 0.04, 0.42, 0, -0.08, 0.5, LT, { s: [8, 4] });
      g.sph(0.1, 0.03, 0.05, 0, 0.0, 0.95, GR, { s: [6, 4] });
      g.sph(0.03, 0.025, 0.03, 0.05, 0.05, 0.98, 0x1a1a10, { s: [4, 3] }); g.sph(0.03, 0.025, 0.03, -0.05, 0.05, 0.98, 0x1a1a10, { s: [4, 3] });
      for (var i = 0; i < 5; i++) { var z = 0.35 + i * 0.12; g.cone(0.015, 0.04, 0.115, -0.065, z, 0xf4f0e0, { seg: 3, rot: [0, 0, PI] }); g.cone(0.015, 0.04, -0.115, -0.065, z, 0xf4f0e0, { seg: 3, rot: [0, 0, PI] }); }
      g.sph(0.07, 0.07, 0.08, 0.13, 0.13, 0.15, GR, { s: [6, 5] }); g.sph(0.07, 0.07, 0.08, -0.13, 0.13, 0.15, GR, { s: [6, 5] });
      g.sph(0.04, 0.045, 0.03, 0.14, 0.17, 0.2, 0xe2c030, { s: [5, 4] }); g.sph(0.04, 0.045, 0.03, -0.14, 0.17, 0.2, 0xe2c030, { s: [5, 4] });
      g.sph(0.012, 0.035, 0.02, 0.15, 0.17, 0.225, 0x111111, { s: [4, 3] }); g.sph(0.012, 0.035, 0.02, -0.15, 0.17, 0.225, 0x111111, { s: [4, 3] });
    },
    legs: { fx: 0.24, fy: 0.22, fz: 0.62, hy: 0.22, hz: -0.55, hx: 0.25, fLen: 0.34, hLen: 0.34, fr: [0.075, 0.06, 0.05], hr: [0.09, 0.065, 0.05], col: GR, splay: 0.95, foot: { type: 'toes', col: DK, h: 0.04 } },
    tail: { y: 0.26, z: -0.9, n: 4, len: 1.9, r0: 0.2, r1: 0.04, col: function (i, x, y, z, nx, ny) { return ny < -0.35 ? LT : (hash3(Math.floor(x * 15), Math.floor(y * 15), Math.floor(z * 8) + i) > 0.65 ? DK : GR); }, up: -0.02, curl: 0, seg: 6,
      each: function (g, i, sl, r0) { for (var k = 0; k < 2; k++) g.cone(r0 * 0.28, r0 * 0.5, 0, r0 * 0.95, -sl * (0.25 + k * 0.5), DK, { seg: 4 }); } },
    tailF: 1.2,
    fold: { fa: 0.0, fb: 0.3, ha: 0.0, hb: 0.3, splay: 0.0, hp: 0.0, hy: 0.4, lieY: 0.18, na: 0 }
  };
})();

// ================================================================ SHARED STATE WEIGHTS (non-quad rigs)
function newW() { return { gait: 0, run: 0, sleep: 0, eat: 0, sick: 0, swim: 0, play: 0, idle: 1, up: 0 }; }
function stepW(I, dt, ent) {
  var W = I.W, st = ent.state || 'idle', spd = ent.speed || 0;
  var moving = spd > 0.06 && st !== 'sleep' && st !== 'eat' && st !== 'drink';
  I.moving = moving; I.spd = spd; I.st = st;
  W.gait = damp(W.gait, moving && st !== 'swim' ? 1 : 0, 7, dt);
  W.run = damp(W.run, (st === 'run' || spd > 4.2) && moving ? 1 : 0, 4, dt);
  W.sleep = damp(W.sleep, st === 'sleep' ? 1 : 0, 2.2, dt);
  W.eat = damp(W.eat, (st === 'eat' || st === 'drink') ? 1 : 0, 4, dt);
  W.sick = damp(W.sick, st === 'sick' ? 1 : 0, 2.5, dt);
  W.swim = damp(W.swim, st === 'swim' ? 1 : 0, 3, dt);
  W.play = damp(W.play, st === 'play' ? 1 : 0, 4, dt);
  I.lookT -= dt;
  if (I.lookT <= 0) { I.lookT = 1.4 + Math.random() * 3.6; I.lookTY = Math.random() < 0.3 ? 0 : (Math.random() - 0.5) * 1.6; I.lookTP = (Math.random() - 0.5) * 0.3; }
  I.lookY = damp(I.lookY, I.lookTY, 2.5, dt); I.lookP = damp(I.lookP, I.lookTP, 2.5, dt);
  return W;
}
function newInst(o) {
  o.W = newW(); o.t = Math.random() * 100; o.phase = 0; o.seed = Math.random() * 6.28; o.lookY = 0; o.lookP = 0; o.lookT = 1 + Math.random() * 2; o.lookTY = 0; o.lookTP = 0;
  return o;
}

// ================================================================ BIRD RIG (flamingo, ostrich)
var BIRDS = {};
function createBird(spec, opts) {
  var baby = !!opts.baby, sex = baby ? 'f' : (opts.sex || 'm'), key = spec.id + (spec.sexed ? sex : ''), P = partsCache[key];
  if (!P) {
    P = partsCache[key] = {}; var g = B(); spec.body(g, sex); P.body = g.build(0, -spec.cy, 0);
    g = B(); var nA = spec.neckA; g.limb(0, 0, -0.02, 0, 0, nA.len, nA.r0, nA.r1, nA.col, { seg: 6 }); g.sph(nA.r0 * 1.05, nA.r0 * 1.05, nA.r0 * 1.05, 0, 0, 0, nA.col, { s: [6, 4] }); P.neckA = g.build();
    g = B(); var nB = spec.neckB; g.limb(0, 0, -0.02, 0, 0, nB.len, nB.r0, nB.r1, nB.col, { seg: 6 }); spec.head(g, sex, nB.len); P.neckB = g.build();
    var lg = spec.legs; g = B(); g.sph(lg.r[0] * 1.2, lg.r[0] * 1.2, lg.r[0] * 1.2, 0, 0, 0, lg.thighCol || lg.col, { s: [6, 4] });
    if (lg.thighFluff) g.sph(lg.thighFluff[0], lg.thighFluff[1], lg.thighFluff[2], 0, -lg.thighFluff[1] * 0.5, 0, typeof lg.thighFluffCol === 'function' ? lg.thighFluffCol(sex) : lg.thighFluffCol, { s: [7, 5] });
    g.limb(0, 0, 0, 0, -lg.thigh, 0, lg.r[0], lg.r[1], lg.thighCol || lg.col, { seg: 5 }); g.sph(lg.r[1] * 1.2, lg.r[1] * 1.2, lg.r[1] * 1.2, 0, -lg.thigh, 0, lg.col, { s: [5, 4] }); P.legU = g.build();
    g = B(); g.limb(0, 0, 0, 0, -lg.shank, 0, lg.r[1], lg.r[2], lg.col, { seg: 5 }); lg.foot(g, -lg.shank); P.legL = g.build();
    if (spec.wings) { P.wing = spec.wings(false, sex); P.wingR = spec.wings(true, sex); }
    if (spec.tailGeo) { g = B(); spec.tailGeo(g, sex); P.tail = g.build(0, -spec.cy, 0); }
  }
  var sc = baby ? (spec.babyScale || 0.5) : (sex === 'f' && spec.fScale ? spec.fScale : 1);
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso'); root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, spec.cy, 0); var bodyM = mesh(P.body); tor.add(bodyM);
  var nA = spec.neckA, nB = spec.neckB, na = grp('nA'), nb = grp('nB'); na.rotation.order = 'YXZ'; nb.rotation.order = 'YXZ';
  tor.add(na); na.position.set(0, nA.y - spec.cy, nA.z); na.add(mesh(P.neckA)); na.add(nb); nb.position.set(0, 0, nA.len); var neckBM = mesh(P.neckB); nb.add(neckBM);
  if (baby) neckBM.scale.setScalar(spec.babyHead || 1.35);
  var lg = spec.legs, hips = [], knees = [];
  for (var l = 0; l < 2; l++) {
    var hip = grp('hip'); hip.position.set(l ? -lg.x : lg.x, lg.hipY - spec.cy, lg.z || 0); tor.add(hip); hip.add(mesh(P.legU));
    var kn = grp('kn'); kn.position.set(0, -lg.thigh, 0); hip.add(kn); kn.add(mesh(P.legL)); hips.push(hip); knees.push(kn);
  }
  var wings = null;
  if (P.wing) { wings = []; for (var w = 0; w < 2; w++) { var wp = grp('wing'); wp.position.set(w ? -spec.wingAt[0] : spec.wingAt[0], spec.wingAt[1] - spec.cy, spec.wingAt[2]); tor.add(wp); wp.add(mesh(w ? P.wingR : P.wing)); wings.push(wp); } }
  if (P.tail) tor.add(mesh(P.tail));
  var I = newInst({ sp: spec, rig: rig, tor: tor, bodyM: bodyM, na: na, nb: nb, hips: hips, knees: knees, wings: wings, sc: sc, p: {}, liftSide: 0, liftT: 4 + Math.random() * 4, liftW: [1, 0], flutter: 0, flutT: 3 + Math.random() * 5 });
  I.Lm = lg.thigh + lg.shank;
  var out = { group: root, height: spec.height * sc, update: function (dt, ent) { birdUpdate(I, dt, ent); } };
  birdUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
}
function birdUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var sp = I.sp, lg = sp.legs, W = stepW(I, dt, ent), t = (I.t += dt), p = I.p, gw = W.gait, rw = W.run, i, spd = I.spd;
  var A = lerp(sp.walkA || 0.5, sp.runA || 0.8, rw), amp = A * gw * (1 - 0.4 * W.sick), Lm = I.Lm * I.sc;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (4 * Lm * Math.max(0.05, sin(A)) * (1 + 0.15 * rw)) * TAU;
  var ph = I.phase, breathe = sin(t * 2 + I.seed);
  // one-leg timer
  I.liftT -= dt; if (I.liftT <= 0) { I.liftT = 5 + Math.random() * 8; I.liftSide = 1 - I.liftSide; }
  var oneW = sp.oneLeg ? (1 - gw) * (1 - W.eat) * (1 - W.play) * (1 - W.swim * 0.5) : 0;
  I.liftW[0] = damp(I.liftW[0], I.liftSide === 0 ? 1 : 0, 2.5, dt); I.liftW[1] = damp(I.liftW[1], I.liftSide === 1 ? 1 : 0, 2.5, dt);
  var mc = 0, bend = (sp.bend || 0.9) * (1 + 0.3 * rw);
  for (i = 0; i < 2; i++) {
    var o = i * PI + (rw > 0.5 ? 0 : 0), s = sin(ph + o), c = cos(ph + o);
    p['a' + i] = amp * s; p['b' + i] = bend * gw * Math.max(0, -c) * 1.0 + (sp.kneeBase || 0.0);
    // one-leg stance
    var lw = I.liftW[i] * oneW; p['a' + i] = lerp(p['a' + i], sp.liftA !== undefined ? sp.liftA : -0.4, lw); p['b' + i] = lerp(p['b' + i], sp.liftB !== undefined ? sp.liftB : 2.4, lw);
    mc += cos(p['a' + i]) * (lg.thigh / I.Lm) + cos(p['a' + i] + p['b' + i]) * (lg.shank / I.Lm) * 1;
  }
  var stand = Math.max(cos(p.a0) * lg.thigh + cos(p.a0 + p.b0) * lg.shank, cos(p.a1) * lg.thigh + cos(p.a1 + p.b1) * lg.shank);
  p.ty = (stand - I.Lm) * 1.0 + rw * Math.abs(sin(ph)) * 0.08 * Lm / I.sc;
  p.tp = 0.03 * gw * sin(ph * 2) + (sp.tilt || 0) * 0 + rw * 0.08;
  p.tr = 0.02 * gw * sin(ph) - oneW * 0.0;
  p.na = sp.neckA.up + I.lookP * 0.6 + 0.04 * breathe; p.nb = sp.neckB.up + 0.05 * breathe; p.hy = I.lookY; p.nbob = 0;
  if (gw > 0.05) { p.nb += 0.12 * sin(ph * 2 - 0.5) * gw * (sp.bob || 1); p.na += 0.05 * sin(ph * 2) * gw; }
  p.wing = 0.12 + 0.02 * breathe; p.wingF = 0;
  // ostrich wing flutter / run
  I.flutT -= dt; if (I.flutT <= 0) { I.flutT = 4 + Math.random() * 8; I.flutter = 1; } I.flutter = Math.max(0, I.flutter - dt * 1.2);
  p.wing += I.flutter * 0.3 * (0.5 + 0.5 * sin(t * 18)) + rw * (0.5 + 0.3 * sin(ph * 2));
  if (W.eat > 0.001) { var w = W.eat, e = sp.eat, nod = sin(t * 4 + I.seed) * 0.12;
    p.na = lerp(p.na, e.na, w); p.nb = lerp(p.nb, e.nb + nod, w); p.tp = lerp(p.tp, e.tp || 0, w); p.hy = lerp(p.hy, 0, w); p.ty = lerp(p.ty, e.ty || 0, w); }
  if (W.sick > 0.001) { var ws = W.sick; p.na = lerp(p.na, sp.neckA.up * 0.5, ws); p.nb = lerp(p.nb, sp.neckB.up - 0.9, ws); p.ty = lerp(p.ty, p.ty - 0.05, ws); p.wing = lerp(p.wing, -0.15, ws); }
  if (W.play > 0.001) { var wp = W.play, hop = Math.abs(sin(t * 6 + I.seed)); p.ty += wp * hop * 0.25; p.wing = lerp(p.wing, 0.9 + 0.4 * sin(t * 14), wp); p.na = lerp(p.na, sp.neckA.up + 0.2 * sin(t * 6), wp);
    for (i = 0; i < 2; i++) { p['a' + i] = lerp(p['a' + i], -0.4 * hop, wp); p['b' + i] = lerp(p['b' + i], 0.8 * hop, wp); } p.spin = wp * sin(t * 1.7) * 1.2; } else p.spin = 0;
  if (W.swim > 0.001) { var wsw = W.swim; p.ty = lerp(p.ty, -0.02 + 0.02 * sin(t * 2), wsw);
    for (i = 0; i < 2; i++) { var pp = t * 3 + i * PI; p['a' + i] = lerp(p['a' + i], 0.4 * sin(pp), wsw); p['b' + i] = lerp(p['b' + i], 0.3 + 0.4 * Math.max(0, cos(pp)), wsw); } }
  if (W.sleep > 0.001) {
    var wl = W.sleep, sl = sp.sleep;
    if (sl.lie) { p.ty = lerp(p.ty, sl.lie - sp.cy, wl); for (i = 0; i < 2; i++) { p['a' + i] = lerp(p['a' + i], -1.4, wl); p['b' + i] = lerp(p['b' + i], 2.6, wl); } p.tp = lerp(p.tp, 0, wl); }
    else { // stand on one leg
      var la = I.liftSide; p.ty = lerp(p.ty, 0, wl); var ll = lerp(I.liftW[0], 0, 0); for (i = 0; i < 2; i++) { var lf = i === 0 ? I.liftW[0] : I.liftW[1]; p['a' + i] = lerp(p['a' + i], lerp(0, sp.liftA !== undefined ? sp.liftA : -0.4, lf), wl); p['b' + i] = lerp(p['b' + i], lerp(0, sp.liftB !== undefined ? sp.liftB : 2.4, lf), wl); }
    }
    p.na = lerp(p.na, sl.na, wl); p.nb = lerp(p.nb, sl.nb, wl); p.hy = lerp(p.hy, sl.hy || 0, wl); p.wing = lerp(p.wing, 0.05, wl);
  }
  // apply
  var tor = I.tor; tor.position.y = sp.cy + p.ty; tor.rotation.set(p.tp, 0, p.tr); I.rig.rotation.y = p.spin;
  I.bodyM.scale.set(1 + 0.006 * breathe, 1 + 0.012 * breathe, 1);
  I.na.rotation.set(-p.na - 0 * p.tp, p.hy * 0.4, 0); I.nb.rotation.set(-(p.nb - 0) + p.na - p.tp * 0 + 0, p.hy * 0.6, 0);
  I.na.rotation.x = -(p.na) - p.tp; I.nb.rotation.x = -(p.nb) + p.na;
  for (i = 0; i < 2; i++) { I.hips[i].rotation.x = p['a' + i] - p.tp; I.knees[i].rotation.x = p['b' + i]; }
  if (I.wings) { I.wings[0].rotation.z = p.wing; I.wings[1].rotation.z = -p.wing; }
}

// ---- FLAMINGO
(function () {
  var PK = 0xf2829c, PL = 0xf8a9bb, PD = 0xd9607f, BK = 0x2a2428, LEG = 0xe5607f;
  BIRDS.flamingo = {
    id: 'flamingo', cy: 1.0, height: 1.7, walkA: 0.45, runA: 0.7, bend: 1.1, oneLeg: true, liftA: -0.5, liftB: 2.3, babyScale: 0.5, babyHead: 1.35, bob: 1.2,
    body: function (g) {
      var bc = function (x, y, z, nx, ny) { return (z < -0.12 && abs(x) > 0.1) ? BK : (ny < -0.3 ? PL : PK); };
      g.sph(0.2, 0.2, 0.34, 0, 1.0, 0.0, PK, { s: [9, 7] }); g.sph(0.15, 0.15, 0.2, 0, 1.03, 0.25, PL, { s: [7, 5] });
      g.sph(0.07, 0.15, 0.32, 0.17, 1.03, -0.05, function (x, y, z) { return z < -0.1 ? BK : PD; }, { s: [7, 5] }); g.sph(0.07, 0.15, 0.32, -0.17, 1.03, -0.05, function (x, y, z) { return z < -0.1 ? BK : PD; }, { s: [7, 5] });
      g.sph(0.1, 0.08, 0.22, 0, 1.0, -0.36, PK, { s: [6, 5], rot: [-0.3, 0, 0] });
    },
    neckA: { y: 1.12, z: 0.28, len: 0.55, up: 1.25, r0: 0.07, r1: 0.05, col: PK },
    neckB: { len: 0.55, up: 0.35, r0: 0.05, r1: 0.04, col: PK },
    head: function (g, sex, L) {
      g.sph(0.06, 0.055, 0.075, 0, 0, L + 0.03, PK, { s: [7, 5] });
      g.limb(0, -0.01, L + 0.07, 0, -0.02, L + 0.17, 0.04, 0.035, 0xf6d9cf, { seg: 5 }); g.limb(0, -0.02, L + 0.17, 0, -0.09, L + 0.24, 0.035, 0.012, 0x2a2428, { seg: 5 });
      eyePair(g, 0.045, 0.02, L + 0.06, 0.016, 0x111111); g.sph(0.01, 0.01, 0.01, 0.047, 0.025, L + 0.07, 0xf2c030, { s: [3, 3] });
    },
    legs: { x: 0.07, hipY: 0.9, z: 0.0, thigh: 0.45, shank: 0.45, r: [0.032, 0.022, 0.017], col: LEG, thighCol: PK, foot: function (g, y0) { g.box(0.09, 0.012, 0.15, 0, y0 + 0.008, 0.05, LEG); g.sph(0.025, 0.02, 0.025, 0, y0 + 0.02, 0, LEG, { s: [4, 3] }); } },
    eat: { na: 0.35, nb: -1.35, tp: 0.12, ty: -0.05 },
    sleep: { na: 0.9, nb: -2.5, hy: 0.0 },
    wingAt: null
  };
})();

// ---- OSTRICH
(function () {
  var BKM = 0x23232a, WH = 0xf4f0e6, FM = 0x9a8470, SK = 0xe3b9a6, BEAK = 0xe8d4a8;
  BIRDS.ostrich = {
    id: 'ostrich', sexed: true, fScale: 0.92, cy: 1.55, height: 2.7, walkA: 0.5, runA: 0.8, bend: 0.8, babyScale: 0.4, babyHead: 1.4, bob: 1.5,
    body: function (g, sex) {
      var m = sex !== 'f', C = m ? BKM : FM;
      g.sph(0.42, 0.42, 0.62, 0, 1.5, 0, C, { s: [10, 7] }); g.sph(0.32, 0.32, 0.3, 0, 1.58, 0.42, C, { s: [8, 6] });
      g.sph(0.26, 0.3, 0.4, 0, 1.52, -0.5, m ? WH : shade(FM, 1.15), { s: [8, 6], rot: [-0.3, 0, 0] });
    },
    neckA: { y: 1.8, z: 0.42, len: 0.55, up: 1.0, r0: 0.15, r1: 0.11, col: SK },
    neckB: { len: 0.6, up: 1.25, r0: 0.11, r1: 0.08, col: SK },
    head: function (g, sex, L) {
      g.sph(0.075, 0.07, 0.09, 0, 0.0, L + 0.04, SK, { s: [7, 5] }); g.sph(0.045, 0.03, 0.08, 0, -0.025, L + 0.14, BEAK, { s: [6, 4] });
      eyePair(g, 0.062, 0.03, L + 0.06, 0.028, 0x1a1008); g.sph(0.07, 0.025, 0.03, 0, 0.065, L + 0.03, 0x4a3a30, { s: [6, 4] });
    },
    legs: { x: 0.17, hipY: 1.3, z: 0.0, thigh: 0.6, shank: 0.7, r: [0.1, 0.075, 0.06], col: 0xe0b2a0, thighCol: 0xe3b9a6,
      thighFluff: [0.22, 0.28, 0.3], thighFluffCol: 0x777, foot: function (g, y0) { g.sph(0.06, 0.03, 0.14, 0, y0 + 0.03, 0.08, 0xd9a898, { s: [6, 4] }); g.sph(0.03, 0.025, 0.05, 0.04, y0 + 0.03, 0.2, 0x333333, { s: [4, 3] }); } },
    wingAt: [0.42, 1.7, 0.0],
    wings: function (r, sex) { var g = B(), s = r ? -1 : 1, m = sex !== 'f'; g.sph(0.08, 0.42, 0.5, s * 0.06, -0.24, -0.1, m ? WH : FM, { s: [8, 6] }); g.sph(0.07, 0.26, 0.38, s * 0.08, -0.4, -0.12, m ? BKM : shade(FM, 0.8), { s: [7, 5] }); return g.build(); },
    eat: { na: 0.15, nb: -1.0, tp: 0.15, ty: -0.2 },
    sleep: { lie: 0.5, na: 0.2, nb: -0.15, hy: 0.0 }
  };
  // fix ostrich legs thighs fluff colour at build: uses sexed body colour (set by thighFluffCol) - give plumage colour hook
  BIRDS.ostrich.legs.thighFluffCol = function (sex) { return sex === 'f' ? FM : BKM; };
})();
for (var bid in BIRDS) (function (id) { OTHERS[id] = function (o) { return createBird(BIRDS[id], o); }; })(bid);

// ================================================================ PENGUIN
OTHERS.penguin = function (opts) {
  var baby = !!opts.baby, P = partsCache.penguin;
  var BK = 0x1e2128, WH = 0xf6f6f2, OR = 0xf0892a, YL = 0xf3cf5a;
  if (!P) {
    P = partsCache.penguin = {};
    var g = B();
    g.sph(0.27, 0.44, 0.24, 0, 0.5, 0, function (x, y, z, nx, ny, nz) { if (y > 0.72 && z > 0.06) return mixHex(WH, YL, clamp((y - 0.72) * 5, 0, 1)); return z > 0.045 - Math.max(0, y - 0.6) * 0.0 ? WH : BK; }, { s: [10, 8] });
    g.sph(0.1, 0.06, 0.12, 0, 0.1, -0.08, BK, { s: [6, 4] });
    P.body = g.build(0, -0.5, 0);
    g = B(); g.sph(0.175, 0.17, 0.17, 0, 0.0, 0.0, function (x, y, z, nx, ny) { return (z > 0.07 && ny < 0.5 && ny > -0.9 && abs(x) < 0.12) ? WH : BK; }, { s: [9, 7] });
    g.cone(0.045, 0.14, 0, -0.01, 0.2, OR, { seg: 5, rot: [PI / 2, 0, 0] }); g.sph(0.04, 0.012, 0.05, 0, -0.04, 0.19, shade(OR, 0.8), { s: [4, 3] });
    g.sph(0.03, 0.05, 0.015, 0.115, 0.02, 0.05, YL, { s: [4, 3] }); g.sph(0.03, 0.05, 0.015, -0.115, 0.02, 0.05, YL, { s: [4, 3] });
    eyePair(g, 0.085, 0.05, 0.13, 0.026, 0x050505);
    P.head = g.build();
    g = B(); g.sph(0.045, 0.24, 0.11, 0.0, -0.2, 0, function (x, y, z, nx) { return nx > 0 ? BK : mixHex(BK, WH, 0.3); }, { s: [6, 6] }); P.fl = g.build();
    g = B(); g.sph(0.045, 0.24, 0.11, 0.0, -0.2, 0, function (x, y, z, nx) { return nx < 0 ? BK : mixHex(BK, WH, 0.3); }, { s: [6, 6] }); P.fr = g.build();
    g = B(); g.box(0.1, 0.035, 0.18, 0, -0.01, 0.06, OR); g.sph(0.04, 0.03, 0.04, 0, 0.02, 0, OR, { s: [4, 3] }); P.foot = g.build();
  }
  var sc = baby ? 0.5 : 1;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso'); root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.5, 0); var bodyM = mesh(P.body); tor.add(bodyM);
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.44, 0.04); var headM = mesh(P.head); head.add(headM); if (baby) head.scale.setScalar(1.45);
  var fls = [], fts = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1, f = grp('flip'); f.rotation.order = 'ZXY'; f.position.set(sd * 0.25, 0.22, 0); tor.add(f); f.add(mesh(s ? P.fr : P.fl)); fls.push(f);
    var ft = grp('foot'); ft.position.set(sd * 0.11, -0.43, 0.02); tor.add(ft); ft.add(mesh(P.foot)); fts.push(ft);
  }
  var I = newInst({ rig: rig, tor: tor, head: head, fls: fls, fts: fts, p: {}, sc: sc, flutT: 3 + Math.random() * 5, flutter: 0 });
  var out = { group: root, height: 1.05 * sc, update: function (dt, ent) { penguinUpdate(I, dt, ent); } };
  penguinUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function penguinUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), p = I.p, gw = W.gait, rw = W.run, spd = I.spd, i;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.5 * I.sc * (1 + 0.3 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 2.1 + I.seed);
  I.flutT -= dt; if (I.flutT <= 0) { I.flutT = 4 + Math.random() * 7; I.flutter = 1; } I.flutter = Math.max(0, I.flutter - dt * 1.1);
  p.ty = -0.02 * Math.abs(sin(ph)) * gw; p.tp = -0.06 + 0.04 * gw; p.tr = 0.2 * gw * sin(ph) * (1 + 0.3 * rw);
  p.hp = 0.0 + I.lookP; p.hy = I.lookY; p.fl = 0.18 + 0.03 * br + I.flutter * 0.7 * (0.5 + 0.5 * sin(t * 20)); p.fswing = 0; p.spin = 0;
  p.fl += gw * (0.2 + 0.15 * rw); p.fsw = gw * 0.35 * sin(ph);
  var lift0 = Math.max(0, sin(ph)) * 0.07 * gw, lift1 = Math.max(0, -sin(ph)) * 0.07 * gw, f0 = cos(ph) * 0.08 * gw, f1 = -cos(ph) * 0.08 * gw;
  p.l0 = lift0; p.l1 = lift1; p.z0 = f0; p.z1 = f1;
  if (W.eat > 0.001) { var w = W.eat; p.tp = lerp(p.tp, 0.55, w); p.hp = lerp(p.hp, 0.6 + 0.15 * sin(t * 5), w); p.hy = lerp(p.hy, 0, w); p.ty = lerp(p.ty, -0.03, w); }
  if (W.sick > 0.001) { var ws = W.sick; p.hp = lerp(p.hp, 0.7, ws); p.fl = lerp(p.fl, -0.05, ws); p.tp = lerp(p.tp, 0.2, ws); p.ty = lerp(p.ty, -0.04, ws); p.tr = lerp(p.tr, 0.04 * sin(t * 1.2), ws); }
  if (W.play > 0.001) { var wp = W.play, hop = Math.abs(sin(t * 6 + I.seed)); p.ty += wp * hop * 0.25; p.fl = lerp(p.fl, 0.8 + 0.5 * sin(t * 16), wp); p.spin = wp * sin(t * 1.7) * 1.4; p.tr = lerp(p.tr, 0.2 * sin(t * 6), wp); p.l0 = lerp(p.l0, 0.05 * hop, wp); p.l1 = lerp(p.l1, 0.05 * hop, wp); }
  if (W.sleep > 0.001) { var wl = W.sleep; p.ty = lerp(p.ty, -0.05, wl); p.hp = lerp(p.hp, 0.55, wl); p.hy = lerp(p.hy, 1.2, wl); p.fl = lerp(p.fl, 0.05, wl); p.tp = lerp(p.tp, 0.05, wl); p.tr = lerp(p.tr, 0, wl); }
  if (W.swim > 0.001) { var wsw = W.swim; p.tp = lerp(p.tp, 1.45 + 0.1 * sin(t * 3), wsw); p.ty = lerp(p.ty, -0.52 + 0.04 * sin(t * 2.6), wsw); p.fl = lerp(p.fl, 0.9 + 0.7 * sin(t * 8), wsw); p.hp = lerp(p.hp, -0.9, wsw); p.tr = lerp(p.tr, 0.1 * sin(t * 4), wsw); p.l0 = lerp(p.l0, 0, wsw); p.l1 = lerp(p.l1, 0, wsw); p.z0 = p.z1 = 0; p.hy = lerp(p.hy, 0, wsw); }
  var tor = I.tor; tor.position.y = 0.5 + p.ty; tor.rotation.set(p.tp, 0, p.tr); I.rig.rotation.y = p.spin;
  tor.scale.set(1 + 0.008 * br, 1 + 0.014 * br, 1);
  I.head.rotation.set(p.hp - p.tp * 0.7, p.hy, 0);
  I.fls[0].rotation.set(p.fsw || 0, 0, -(0.12 + p.fl)); I.fls[1].rotation.set(-(p.fsw || 0), 0, (0.12 + p.fl));
  I.fts[0].position.set(0.11, -0.43 + p.l0, 0.02 + p.z0); I.fts[1].position.set(-0.11, -0.43 + p.l1, 0.02 + p.z1);
}

// ================================================================ KANGAROO
OTHERS.kangaroo = function (opts) {
  var baby = !!opts.baby, sex = baby ? 'f' : (opts.sex || 'm'), key = 'kangaroo' + sex, P = partsCache[key];
  var FUR = 0xc78b55, LT = 0xe9d2ac, DK = 0x7a5232, NOSE = 0x2a1a14;
  var UL = 0.45, SL = 0.5, FL = 0.4, AL = 0.5, male = sex !== 'f';
  if (!P) {
    P = partsCache[key] = {};
    var g = B(), bc = function (x, y, z, nx, ny) { return (ny < -0.35 && z > -0.1) ? LT : FUR; };
    g.sph(0.27, 0.29, 0.55, 0, 0, 0, bc, { s: [9, 7] }); g.sph(0.2, 0.22, 0.28, 0, 0.04, 0.42, bc, { s: [8, 6] });
    if (male) g.sph(0.22, 0.2, 0.2, 0, 0.1, 0.45, mixHex(FUR, 0xb87a48, 0.5), { s: [7, 5] });
    P.body = g.build();
    // head in world-aligned frame
    g = B(); g.limb(0, 0, 0, 0, 0.26, 0.1, 0.13, 0.085, FUR, { seg: 6 });
    var hy = 0.33, hz = 0.14;
    g.sph(0.1, 0.095, 0.12, 0, hy, hz, FUR, { s: [8, 6] }); g.sph(0.052, 0.052, 0.11, 0, hy - 0.04, hz + 0.14, LT, { s: [7, 5] }); g.sph(0.03, 0.025, 0.025, 0, hy - 0.025, hz + 0.25, NOSE, { s: [5, 4] });
    g.cone(0.045, 0.22, 0.065, hy + 0.2, hz - 0.04, FUR, { seg: 5, rot: [0, 0, -0.18] }); g.cone(0.045, 0.22, -0.065, hy + 0.2, hz - 0.04, FUR, { seg: 5, rot: [0, 0, 0.18] });
    g.cone(0.025, 0.15, 0.065, hy + 0.2, hz - 0.02, 0xe0b0a8, { seg: 4, rot: [0, 0, -0.18] }); g.cone(0.025, 0.15, -0.065, hy + 0.2, hz - 0.02, 0xe0b0a8, { seg: 4, rot: [0, 0, 0.18] });
    eyePair(g, 0.075, hy + 0.025, hz + 0.07, 0.022, 0x15100a);
    P.head = g.build();
    g = B(); g.limb(0, 0, 0, 0, -AL * 0.9, 0.0, 0.05, 0.035, FUR, { seg: 5 }); g.sph(0.045, 0.06, 0.05, 0, -AL * 0.95, 0.02, DK, { s: [5, 4] }); P.arm = g.build();
    g = B(); g.sph(0.15, 0.2, 0.17, 0, -0.12, 0, FUR, { s: [7, 6] }); g.limb(0, 0, 0, 0, -UL, 0.0, 0.14, 0.075, FUR, { seg: 6 }); P.thigh = g.build();
    g = B(); g.limb(0, 0, 0, 0, -SL, -0.05, 0.075, 0.045, FUR, { seg: 6 }); P.shank = g.build();
    g = B(); g.limb(0, 0.0, -0.05, 0, 0.0, FL, 0.05, 0.04, DK, { seg: 5 }); g.sph(0.045, 0.03, 0.07, 0, 0, FL + 0.03, 0x3a2a20, { s: [5, 4] }); P.foot = g.build();
    P.tail = [];
    for (var i = 0; i < 3; i++) { var gt = B(), r0 = lerp(0.14, 0.04, i / 3), r1 = lerp(0.14, 0.04, (i + 1) / 3); gt.limb(0, 0, 0, 0, 0, -0.38, r0, r1, function (x, y, z, nx, ny) { return ny < -0.4 ? LT : FUR; }, { seg: 6 }); P.tail.push(gt.build()); }
  }
  var sc = baby ? 0.45 : (sex === 'f' ? 0.88 : 1.0);
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso'); root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  var bodyM = mesh(P.body); tor.add(bodyM);
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.12, 0.5); head.add(mesh(P.head)); if (baby) head.scale.setScalar(1.4);
  var arms = [], hips = [], knees = [], ankles = [], tails = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1, a = grp('arm'); a.position.set(sd * 0.19, 0.12, 0.38); tor.add(a); a.add(mesh(P.arm)); arms.push(a);
    var h = grp('hip'); h.position.set(sd * 0.2, -0.1, -0.22); tor.add(h); h.add(mesh(P.thigh)); hips.push(h);
    var k = grp('knee'); k.position.set(0, -UL, 0); h.add(k); k.add(mesh(P.shank)); knees.push(k);
    var an = grp('ankle'); an.position.set(0, -SL, -0.05); k.add(an); an.add(mesh(P.foot)); ankles.push(an);
  }
  var par = tor;
  for (var q = 0; q < 3; q++) { var tp = grp('tail'); tp.rotation.order = 'YXZ'; par.add(tp); if (q === 0) tp.position.set(0, -0.02, -0.5); else tp.position.set(0, 0, -0.38); tp.add(mesh(P.tail[q])); tails.push(tp); par = tp; }
  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, hips: hips, knees: knees, ankles: ankles, tails: tails, p: {}, sc: sc, UL: UL, SL: SL, baby: baby });
  var out = { group: root, height: 1.85 * sc, update: function (dt, ent) { kangUpdate(I, dt, ent); } };
  kangUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function kangUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), p = I.p, gw = W.gait, rw = W.run, spd = I.spd, UL = I.UL, SL = I.SL, i;
  var hopLen = 1.0 + 0.5 * spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (hopLen * I.sc) * TAU;
  var s = fract(I.phase / TAU), br = sin(t * 2 + I.seed);
  var air = 0, hgt = 0, cr = 0;
  if (s > 0.12 && s < 0.88) { var u = (s - 0.12) / 0.76; hgt = sin(PI * u); air = Math.min(1, hgt * 3); }
  var uu = s < 0.12 ? s + 0.12 : (s > 0.88 ? s - 0.88 : -1); if (uu >= 0) cr = sin(PI * uu / 0.24);
  air *= gw; hgt *= gw; cr *= gw;
  // stand pose
  var tp0 = -0.9, A = -0.7, Bk = 1.4;
  var wA = lerp(-0.7, -1.0, cr), wB = lerp(1.4, 2.0, cr);
  A = lerp(A, wA, gw); Bk = lerp(Bk, wB, gw);
  A = lerp(A, -0.2, air); Bk = lerp(Bk, 0.6, air);
  var tp = lerp(tp0, -0.55, air * 0.8) + 0.02 * br;
  var armA = lerp(-0.15 + 0.05 * br, -0.7, gw), armB = 0;
  p.hp = I.lookP + 0.05 * br; p.hy = I.lookY * (1 - gw * 0.8);
  var tailUp = -0.35 + 0.35 * air; var tailSw = sin(t * 1.2 + I.seed) * 0.15 * (1 - gw);
  var spin = 0;
  var eatW = W.eat, slW = W.sleep, sickW = W.sick;
  if (eatW > 0.001) { var w = eatW; tp = lerp(tp, -0.2, w); A = lerp(A, -0.9, w); Bk = lerp(Bk, 1.7, w); armA = lerp(armA, 0.15, w); p.hp = lerp(p.hp, 0.9 + 0.12 * sin(t * 5), w); p.hy = lerp(p.hy, 0, w); }
  if (sickW > 0.001) { var ws = sickW; tp = lerp(tp, -0.5, ws); p.hp = lerp(p.hp, 0.9, ws); A = lerp(A, -0.85, ws); Bk = lerp(Bk, 1.7, ws); }
  if (W.play > 0.001) { var wp = W.play, hop = Math.abs(sin(t * 5 + I.seed)); hgt = lerp(hgt, hop, wp); air = lerp(air, Math.min(1, hop * 3), wp); A = lerp(A, -0.2 - 0.5 * (1 - hop), wp); Bk = lerp(Bk, 0.6 + 1.0 * (1 - hop), wp); armA = lerp(armA, -0.8 + 0.5 * sin(t * 10), wp); spin = wp * sin(t * 1.6) * 1.3; }
  // body height from foot contact
  var footDrop = UL * cos(A) + SL * cos(A + Bk) + 0.03;
  var hipLocalY = -0.1, hipLocalZ = -0.22, hipW = hipLocalY * cos(tp) - hipLocalZ * sin(tp);
  var ty = footDrop - hipW + hgt * (0.25 + 0.1 * spd) * (1 - 0.0);
  if (slW > 0.001) { var wl = slW; tp = lerp(tp, -0.15, wl); A = lerp(A, -1.35, wl); Bk = lerp(Bk, 2.5, wl); armA = lerp(armA, -0.5, wl); p.hp = lerp(p.hp, 0.8, wl); p.hy = lerp(p.hy, 0.7, wl); ty = lerp(ty, 0.3, wl); tailUp = lerp(tailUp, 0.0, wl); }
  var tor = I.tor; tor.position.y = ty; tor.rotation.set(tp, 0, 0.03 * gw * sin(I.phase)); I.rig.rotation.y = spin;
  tor.scale.set(1 + 0.006 * br, 1 + 0.01 * br, 1);
  I.head.rotation.set(p.hp - tp, p.hy, 0);
  for (i = 0; i < 2; i++) {
    I.arms[i].rotation.x = armA - tp + (i ? 0.06 : -0.06) * sin(t * 1.5 + i);
    I.hips[i].rotation.x = A - tp; I.knees[i].rotation.x = Bk; I.ankles[i].rotation.x = -(A + Bk) + 0.9 * air;
    I.hips[i].rotation.z = (i ? -1 : 1) * 0.05 * (1 + slW * 3);
  }
  var t0 = I.tails[0]; t0.rotation.x = -tp + tailUp; t0.rotation.y = tailSw + sin(I.phase) * 0.0;
  I.tails[1].rotation.x = -0.05 + (air ? -0.15 * air : 0) + 0.05 * sin(t * 2); I.tails[1].rotation.y = tailSw * 0.5 + 0.1 * sin(t * 1.5 + 1) * (1 - gw);
  I.tails[2].rotation.x = 0.05 + 0.1 * air; I.tails[2].rotation.y = tailSw * 0.5;
}

// ================================================================ PEOPLE (guests + staff)
var SKINS = [0xf6d0b0, 0xe8b88c, 0xd1996a, 0xa56a43, 0x7a4a2c, 0x5a3825];
var HAIRS = [0x2b1d14, 0x5a3a1e, 0xc9a35a, 0x9b3a22, 0xd8d4cc, 0x151515, 0xe6c46a, 0x6a4a8a];
var SHIRTS = [0xe94b4b, 0x3b82f6, 0x22a06b, 0xf2c744, 0xa855f7, 0xff8c42, 0x2dd4bf, 0xf472b6, 0xf5f5f5, 0x64748b, 0x84cc16, 0x14b8a6];
var TROUS = [0x2f3e5c, 0x3b3b3b, 0x6b4f2a, 0x8a7a5a, 0x1f2937, 0x4b5d3a, 0x7a3e3e, 0xc9b79c, 0x3a5a8a];
var HATS = [0xe94b4b, 0x3b82f6, 0xf2c744, 0xffffff, 0x22a06b, 0x1f2937];
var bodyCache = {}, legCache = {}, armCache = {}, propCache = {};
var HIP = 0.78, SHO = 1.36;

function headParts(g, k) {
  var ks = k.kid ? 1.22 : 1.0, hy = 1.58 + (k.kid ? 0.03 : 0), r = 0.16 * ks, sk = k.skin, hc = k.hair, st = k.style;
  g.cyl(0.055, 0.065, 0.1, 0, 1.43, 0, shade(sk, 0.92), { seg: 6 });
  g.sph(r, r * 1.04, r, 0, hy, 0, sk, { s: [9, 7] });
  g.sph(0.022, 0.022, 0.018, 0.058 * ks, hy + 0.015, r * 0.92, 0x15100c, { s: [4, 3] }); g.sph(0.022, 0.022, 0.018, -0.058 * ks, hy + 0.015, r * 0.92, 0x15100c, { s: [4, 3] });
  g.sph(0.026, 0.028, 0.03, 0, hy - 0.035, r * 1.0, shade(sk, 0.9), { s: [4, 3] });
  g.sph(0.04, 0.012, 0.012, 0, hy - 0.08, r * 0.93, shade(sk, 0.7), { s: [4, 3] });
  if (st === 1) { g.sph(r * 1.06, r * 0.75, r * 1.08, 0, hy + 0.05, -0.012, hc, { s: [8, 5] }); g.box(0.2 * ks, 0.045, 0.05, 0, hy + 0.1, r * 0.8, hc); }
  else if (st === 2) { g.sph(r * 1.08, r * 0.8, r * 1.1, 0, hy + 0.05, -0.02, hc, { s: [8, 5] }); g.box(0.34 * ks, 0.42, 0.1, 0, hy - 0.2, -r * 0.8, hc); g.box(0.06, 0.3, 0.1, r * 0.95, hy - 0.08, -0.02, hc); g.box(0.06, 0.3, 0.1, -r * 0.95, hy - 0.08, -0.02, hc); }
  else if (st === 3) { g.sph(r * 1.06, r * 0.8, r * 1.08, 0, hy + 0.05, -0.015, hc, { s: [8, 5] }); g.sph(0.06, 0.06, 0.06, 0, hy + 0.0, -r * 1.1, hc, { s: [5, 4] }); g.limb(0, hy, -r * 1.1, 0, hy - 0.2, -r * 1.2, 0.04, 0.03, hc, { seg: 5 }); }
  else if (st === 4) { for (var i = 0; i < 9; i++) { var a = i / 9 * TAU; g.sph(0.07, 0.07, 0.07, Math.sin(a) * r * 0.85, hy + 0.07 + (i % 2) * 0.03, Math.cos(a) * r * 0.85, hc, { s: [5, 4] }); } g.sph(0.1, 0.08, 0.1, 0, hy + 0.15, 0, hc, { s: [5, 4] }); }
  else if (st === 5) { g.sph(r * 1.07, r * 0.8, r * 1.1, 0, hy + 0.045, -0.015, k.hat, { s: [8, 5] }); g.box(0.2 * ks, 0.025, 0.14, 0, hy + 0.05, r * 1.05, shade(k.hat, 0.85)); }
  else if (st === 6) { g.cyl(0.36 * ks, 0.36 * ks, 0.025, 0, hy + 0.08, 0, shade(k.hat, 1.05), { seg: 10 }); g.cyl(0.17 * ks, 0.2 * ks, 0.12, 0, hy + 0.14, 0, k.hat, { seg: 8 }); }
  else if (st === 7) { g.sph(r * 1.08, r * 0.95, r * 1.1, 0, hy + 0.06, 0, k.hat, { s: [8, 5] }); g.sph(0.045, 0.045, 0.045, 0, hy + 0.24, 0, shade(k.hat, 1.2), { s: [5, 4] }); }
  else if (st === 8) { /* peaked cap */ g.cyl(r * 1.08, r * 1.12, 0.1, 0, hy + 0.1, 0, k.hat, { seg: 9 }); g.box(0.22 * ks, 0.02, 0.15, 0, hy + 0.07, r * 1.05, shade(k.hat, 0.7)); g.sph(0.025, 0.025, 0.012, 0, hy + 0.12, r * 1.1, 0xe8c030, { s: [4, 3] }); g.sph(r * 1.05, r * 0.5, r * 1.05, 0, hy + 0.04, 0, hc, { s: [7, 4] }); }
  else if (st === 9) { /* bush hat */ g.cyl(0.4 * ks, 0.4 * ks, 0.025, 0, hy + 0.09, 0, k.hat, { seg: 10 }); g.cyl(0.16 * ks, 0.2 * ks, 0.12, 0, hy + 0.15, 0, k.hat, { seg: 8 }); g.cyl(0.165 * ks, 0.165 * ks, 0.03, 0, hy + 0.1, 0, shade(k.hat, 0.6), { seg: 8 }); }
  // st 0 = bald
}
function bodyGeo(k) {
  var key = [k.shirt, k.skin, k.style, k.hair, k.hat, k.kid ? 1 : 0, k.pack, k.stripe, k.coat ? 1 : 0, k.vest ? 1 : 0].join('|');
  if (bodyCache[key]) return bodyCache[key];
  var g = B(), sc = k.shirt, sf = k.stripe ? function (x, y) { return fract(y * 8) < 0.5 ? sc : shade(sc, 0.82); } : sc;
  g.box(0.42, 0.62, 0.24, 0, HIP + 0.31, 0, sf, { s: [1, k.stripe ? 6 : 1, 1] });
  g.box(0.43, 0.06, 0.25, 0, HIP + 0.03, 0, shade(sc, 0.75));
  if (k.coat) g.box(0.44, 0.34, 0.27, 0, HIP - 0.12, 0, sc);
  if (k.vest) { g.box(0.435, 0.07, 0.245, 0, HIP + 0.3, 0, 0xf2d43a); g.box(0.435, 0.07, 0.245, 0, HIP + 0.44, 0, 0xf2d43a); }
  if (k.pack) g.box(0.3, 0.38, 0.14, 0, HIP + 0.36, -0.19, k.pack);
  headParts(g, k);
  return (bodyCache[key] = g.build());
}
function legGeo(trouser, skin, shorts) {
  var key = trouser + '|' + (shorts ? skin : 0) + '|' + (shorts ? 1 : 0);
  if (legCache[key]) return legCache[key];
  var g = B(), L = HIP;
  if (shorts) { g.box(0.17, 0.3, 0.2, 0, -0.15, 0, trouser); g.box(0.12, 0.42, 0.14, 0, -0.51, 0, skin); }
  else g.box(0.17, 0.72, 0.2, 0, -0.36, 0, trouser);
  g.box(0.18, 0.09, 0.3, 0, -L + 0.045, 0.045, 0x2b2b30);
  return (legCache[key] = g.build());
}
function armGeo(shirt, skin, shortSl) {
  var key = shirt + '|' + skin + '|' + (shortSl ? 1 : 0);
  if (armCache[key]) return armCache[key];
  var g = B(), sl = shortSl ? 0.22 : 0.48;
  g.box(0.11, sl, 0.11, 0, -sl / 2, 0, shirt);
  g.box(0.09, 0.58 - sl, 0.09, 0, -sl - (0.58 - sl) / 2 + 0.02, 0, skin);
  g.sph(0.055, 0.06, 0.055, 0, -0.6, 0, skin, { s: [5, 4] });
  return (armCache[key] = g.build());
}
function propGeo(name) {
  if (propCache[name]) return propCache[name];
  var g = B();
  if (name === 'bucket') { g.cyl(0.12, 0.09, 0.17, 0, -0.08, 0, 0x8d98a4, { seg: 8 }); g.cyl(0.115, 0.115, 0.01, 0, 0.0, 0, 0xd8b24a, { seg: 8 }); g.limb(-0.12, 0.0, 0, 0.12, 0.0, 0, 0.012, 0.012, 0x555a60, { seg: 4 }); }
  else if (name === 'case') { g.box(0.24, 0.17, 0.08, 0, -0.08, 0, 0xf4f4f4); g.box(0.07, 0.02, 0.085, 0, -0.08, 0, 0xd8322e); g.box(0.02, 0.07, 0.085, 0, -0.08, 0, 0xd8322e); g.box(0.1, 0.03, 0.04, 0, 0.01, 0, 0x888d94); }
  else if (name === 'broom') { g.limb(0, 0.45, 0, 0, -0.95, 0.0, 0.016, 0.016, 0x8a6a3a, { seg: 5 }); g.box(0.28, 0.06, 0.07, 0, -0.95, 0, 0x6a4a2a); g.box(0.26, 0.17, 0.05, 0, -1.04, 0, 0xd8b24a, { s: [1, 1, 1] }); }
  else if (name === 'flag') { g.limb(0, -0.4, 0, 0, 1.0, 0, 0.014, 0.014, 0xe9e9e9, { seg: 4 }); g.box(0.36, 0.22, 0.015, 0.19, 0.88, 0, 0xd8322e); g.box(0.12, 0.1, 0.018, 0.1, 0.88, 0, 0xf2d43a); g.sph(0.03, 0.03, 0.03, 0, 1.02, 0, 0xf2d43a, { s: [5, 4] }); }
  return (propCache[name] = g.build());
}

function createPerson(k, prop) {
  var sc = k.kid ? 0.64 : (k.scale || 1);
  var root = grp('person'), rig = grp('rig'); root.add(rig); rig.scale.setScalar(sc);
  var body = mesh(bodyGeo(k)); rig.add(body);
  var lg = legGeo(k.trouser, k.skin, k.shorts), ag = armGeo(k.shirt, k.skin, k.shortSl);
  var legs = [], arms = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1, lp = grp('leg'); lp.position.set(sd * 0.1, HIP, 0); rig.add(lp); lp.add(mesh(lg)); legs.push(lp);
    var ap = grp('arm'); ap.position.set(sd * 0.27, SHO, 0); rig.add(ap); ap.add(mesh(ag)); arms.push(ap);
  }
  var pr = null;
  if (prop) {
    if (prop === 'bucket' || prop === 'case') { pr = grp('prop'); pr.position.set(0, -0.62, 0.02); (prop === 'bucket' ? arms[0] : arms[1]).add(pr); pr.add(mesh(propGeo(prop))); }
    else { pr = grp('prop'); pr.position.set(-0.3, 1.0, 0.2); rig.add(pr); pr.add(mesh(propGeo(prop))); }
  }
  var I = { rig: rig, body: body, legs: legs, arms: arms, prop: pr, propName: prop, sc: sc, ph: Math.random() * 6, t: Math.random() * 50, gw: 0, rw: 0, sw: 0, lookY: 0, lookTY: 0, lookT: 1 + Math.random() * 3,
    actT: 3 + Math.random() * 6, act: 0, actK: 0, a0: 0, a1: 0, a0z: 0, a1z: 0, seed: Math.random() * 6, work: 0 };
  var out = { group: root, height: 1.78 * sc, update: function (dt, ent) { personUpdate(I, dt, ent); } };
  personUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
}
function personUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var st = ent.state || 'idle', spd = ent.speed || 0, t = (I.t += dt), sc = I.sc;
  var sit = st === 'sit', flee = st === 'flee', moving = spd > 0.05 && !sit && st !== 'use' && st !== 'watch' && st !== 'queue';
  I.gw = damp(I.gw, moving ? 1 : 0, 9, dt); I.rw = damp(I.rw, flee ? 1 : 0, 6, dt); I.sw = damp(I.sw, sit ? 1 : 0, 5, dt);
  I.work = damp(I.work, st === 'work' ? 1 : 0, 5, dt);
  if (moving && dt > 0.001) I.ph += spd * dt / (1.35 * sc * (1 + 0.2 * I.rw)) * TAU;
  var gw = I.gw, rw = I.rw, sw = I.sw, ph = I.ph, amp = lerp(0.5, 0.85, rw) * gw, s = sin(ph);
  I.lookT -= dt; if (I.lookT <= 0) { I.lookT = 1.5 + Math.random() * 3; I.lookTY = Math.random() < 0.3 ? 0 : (Math.random() - 0.5) * 1.2; }
  I.lookY = damp(I.lookY, I.lookTY, 3, dt);
  // action timer (watch)
  I.actT -= dt;
  if (I.actT <= 0) { I.act = (st === 'watch' || st === 'queue') ? (Math.random() < 0.5 ? 1 : (Math.random() < 0.6 ? 2 : 3)) : 0; I.actT = I.act ? 1.8 + Math.random() * 1.6 : 3 + Math.random() * 6; }
  if (st !== 'watch' && st !== 'queue') I.act = 0;
  // arm targets
  var a0 = -amp * 0.9 * s, a1 = amp * 0.9 * s, a0z = 0.06, a1z = 0.06;
  // leg targets
  var l0 = amp * s, l1 = -amp * s;
  var sway = (1 - gw) * 0.04 * sin(t * 0.8 + I.seed);
  if (st === 'queue' || st === 'use' || st === 'idle' || st === 'watch') { l0 += 0.07 * sin(t * 0.7 + I.seed) * (1 - gw); l1 -= 0.07 * sin(t * 0.7 + I.seed) * (1 - gw); }
  if (flee) { a0 = lerp(a0, -2.7 + 0.35 * sin(ph * 2), rw); a1 = lerp(a1, -2.7 + 0.35 * sin(ph * 2 + 1), rw); a0z = lerp(a0z, 0.35, rw); a1z = lerp(a1z, 0.35, rw); }
  if (I.act === 1) { a1 = -1.9; a1z = -0.1; } else if (I.act === 2) { a1 = -1.45; a1z = -0.25; a0 = -0.1; } else if (I.act === 3) { a0 = -2.6 + 0.25 * sin(t * 8); a0z = 0.45; }
  if (sit) { l0 = l1 = -1.45; a0 = a1 = -0.5; I.act = 0; }
  var wk = I.work;
  if (wk > 0.01) {
    var pn = I.propName, wl = wk;
    if (pn === 'broom') { a0 = lerp(a0, -0.7 + 0.2 * sin(t * 4), wl); a1 = lerp(a1, -0.7 + 0.2 * sin(t * 4), wl); }
    else if (pn === 'bucket') { a0 = lerp(a0, -0.9 + 0.7 * Math.max(0, sin(t * 2)), wl); a1 = lerp(a1, -0.3, wl); }
    else if (pn === 'case') { a1 = lerp(a1, -0.8, wl); a0 = lerp(a0, -0.4 + 0.15 * sin(t * 3), wl); }
    else if (pn === 'flag') { a0 = lerp(a0, -0.7, wl); a1 = lerp(a1, -2.3 + 0.2 * sin(t * 3), wl); }
    else { a0 = lerp(a0, -0.5 + 0.15 * sin(t * 2), wl); }
  }
  I.a0 = damp(I.a0, a0, 14, dt); I.a1 = damp(I.a1, a1, 14, dt); I.a0z = damp(I.a0z, a0z, 12, dt); I.a1z = damp(I.a1z, a1z, 12, dt);
  var rg = I.rig;
  rg.position.y = (Math.abs(s) * 0.035 * gw * (1 + rw)) - 0.36 * sw;
  rg.rotation.x = 0.05 * gw + 0.28 * rw - 0.05 * sw + (st === 'work' && I.propName === 'case' ? 0.35 * wk : 0);
  rg.rotation.z = sway + 0.04 * gw * s;
  I.body.rotation.y = 0.12 * s * gw;
  I.legs[0].rotation.x = l0; I.legs[1].rotation.x = l1;
  I.arms[0].rotation.set(I.a0, 0, I.a0z); I.arms[1].rotation.set(I.a1, 0, -I.a1z);
  if (I.prop && I.propName !== 'bucket' && I.propName !== 'case') {
    var bw = I.propName === 'broom' ? 0.3 * Math.sin(t * 4) * wk : 0.1 * Math.sin(t * 3 + I.seed) + 0.1 * gw * s;
    I.prop.rotation.set(bw * 0.7 - 0.12, 0, I.propName === 'flag' ? 0.05 * sin(t * 2) : 0);
  }
}

function guestLook(seed) {
  var r = mkrng((seed * 2654435761 + 12345) >>> 0 || 7); r(); r();
  var kid = r() < 0.2, hatty = r() < 0.38, style = Math.floor(r() * 5);
  if (hatty) style = 5 + Math.floor(r() * 3);
  var k = { shirt: pick(SHIRTS, r()), trouser: pick(TROUS, r()), skin: pick(SKINS, r()), hair: pick(HAIRS, r()), hat: pick(HATS, r()), style: style, kid: kid,
    shorts: r() < 0.3, shortSl: r() < 0.5, stripe: r() < 0.25, pack: (r() < 0.22 && !kid) ? pick(SHIRTS, r()) : 0, scale: 0.94 + r() * 0.12 };
  if (kid) k.scale = 1; if (k.style === 2 && r() < 0.5) k.style = 3;
  if (k.stripe && k.shirt === 0xf5f5f5) k.stripe = false;
  return k;
}
var STAFF = {
  keeper: { shirt: 0xb89d55, trouser: 0x5c5236, style: 9, hat: 0xb89d55, prop: 'bucket', shortSl: true },
  vet: { shirt: 0xf4f4f4, trouser: 0x3a4a6a, style: 1, coat: true, prop: 'case', shortSl: false },
  cleaner: { shirt: 0x2f78c4, trouser: 0x24456e, style: 5, hat: 0x2f78c4, prop: 'broom', shortSl: true },
  guide: { shirt: 0xd8322e, trouser: 0x25252b, style: 5, hat: 0xd8322e, prop: 'flag', shortSl: false },
  security: { shirt: 0x2a3042, trouser: 0x1b1f2b, style: 8, hat: 0x2a3042, prop: null, vest: true, shortSl: false }
};
API_people = {
  guest: function (seed) { var k = guestLook(seed | 0); return createPerson(k, null); },
  staff: function (type) {
    var d = STAFF[type] || STAFF.keeper, r = mkrng((Math.random() * 1e9) | 0 || 5); r();
    var k = { shirt: d.shirt, trouser: d.trouser, skin: pick(SKINS, r()), hair: pick(HAIRS, r()), hat: d.hat || 0, style: d.style === 1 ? 1 + Math.floor(r() * 3) % 3 : d.style, kid: false, shorts: false, shortSl: !!d.shortSl, stripe: false, pack: 0, coat: !!d.coat, vest: !!d.vest, scale: 1 };
    return createPerson(k, d.prop);
  }
};
var API_people;

// ================================================================ SCENERY
var SC = {};            // id -> {build(g), custom(group)}
var sceneryGeoCache = {};
var LAMP_MAT = new T.MeshLambertMaterial({ color: 0xfff1b0, emissive: 0xffd566 }); LAMP_MAT.emissiveIntensity = 0.25; LAMP_MAT.name = 'lamp-bulb';
var WATER_MAT = new T.MeshLambertMaterial({ color: 0x4aa8e0, emissive: 0x103050, transparent: true, opacity: 0.82, depthWrite: false });

function leaf(base, amt) {
  amt = amt || 0.36;
  return function (x, y, z, nx, ny) { var h = hash3(Math.floor(x * 2.6), Math.floor(y * 2.6), Math.floor(z * 2.6)); var c = shade(base, 1 - amt / 2 + h * amt); if (ny > 0.45) c = shade(c, 1.1); else if (ny < -0.3) c = shade(c, 0.85); return c; };
}
function rockGeo(seed) {
  return unit('rock' + seed, function () {
    var g = new T.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new T.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      var d = 1 + (hash3(Math.round(v.x * 6) + seed, Math.round(v.y * 6), Math.round(v.z * 6) + seed * 3) - 0.5) * 0.45; v.multiplyScalar(d);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return g.index ? g.toNonIndexed() : g;
  });
}
function rock(g, rx, ry, rz, x, y, z, col, seed, rotY) {
  var c = typeof col === 'number' ? function (px, py, pz, nx, ny) { var h = hash3(Math.floor(px * 4), Math.floor(py * 4), Math.floor(pz * 4)); var q = shade(col, 0.86 + h * 0.28); return ny > 0.5 ? shade(q, 1.1) : q; } : col;
  g.add(rockGeo(seed || 1), x, y, z, rx, ry, rz, [0, rotY || 0, 0], c);
}
function frond(g, bx, by, bz, az, len, droop1, droop2, w, col) {
  var h = len / 2;
  var d1 = [Math.cos(droop1) * Math.cos(az), -Math.sin(droop1), -Math.cos(droop1) * Math.sin(az)];
  g.sph(h * 0.55, w * 0.18, w, bx + d1[0] * h * 0.55, by + d1[1] * h * 0.55, bz + d1[2] * h * 0.55, col, { s: [5, 4], rot: [0, az, -droop1] });
  var ex = bx + d1[0] * h * 1.1, ey = by + d1[1] * h * 1.1, ez = bz + d1[2] * h * 1.1;
  var d2 = [Math.cos(droop2) * Math.cos(az), -Math.sin(droop2), -Math.cos(droop2) * Math.sin(az)];
  g.sph(h * 0.6, w * 0.16, w * 0.8, ex + d2[0] * h * 0.55, ey + d2[1] * h * 0.55, ez + d2[2] * h * 0.55, col, { s: [5, 4], rot: [0, az, -droop2] });
}

SC.oak = { build: function (g) {
  var br = 0x6b4a2b; g.limb(0, 0, 0, 0, 1.7, 0, 0.3, 0.2, br, { seg: 7 }); g.limb(0, 1.2, 0, 0.55, 2.3, 0.15, 0.12, 0.07, br); g.limb(0, 1.3, 0, -0.5, 2.4, -0.1, 0.12, 0.07, br);
  for (var i = 0; i < 3; i++) { var a = i * 2.1; g.limb(Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15, Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5, 0.1, 0.05, br); }
  var L = leaf(0x4f9a3a); g.sph(1.5, 1.2, 1.5, 0, 3.1, 0, L, { s: [8, 6] }); g.sph(1.1, 0.95, 1.1, 0.95, 2.7, 0.3, L, { s: [7, 5] }); g.sph(1.1, 0.95, 1.1, -0.95, 2.8, -0.2, L, { s: [7, 5] });
  g.sph(1.0, 0.9, 1.0, 0.2, 3.7, -0.5, leaf(0x5aa842), { s: [7, 5] }); g.sph(1.0, 0.85, 1.0, -0.3, 2.7, 0.95, L, { s: [7, 5] }); g.sph(0.8, 0.7, 0.8, 0.5, 3.8, 0.6, leaf(0x62b04a), { s: [6, 5] });
} };
SC.pine = { build: function (g) {
  g.limb(0, 0, 0, 0, 1.5, 0, 0.22, 0.16, 0x5a3e24, { seg: 6 });
  var L = [[1.55, 1.7, 1.9], [1.3, 1.6, 2.7], [1.02, 1.5, 3.5], [0.72, 1.3, 4.3], [0.4, 1.1, 5.0]];
  for (var i = 0; i < L.length; i++) g.cone(L[i][0], L[i][1], 0, L[i][2], 0, leaf(shade(0x2f7040, 1 + i * 0.05), 0.3), { seg: 8 });
} };
SC.acacia = { build: function (g) {
  var br = 0x7a5a38; g.limb(0, 0, 0, 0.1, 1.9, 0, 0.24, 0.14, br, { seg: 6 }); g.limb(0.1, 1.8, 0, 1.0, 3.0, 0.1, 0.13, 0.08, br); g.limb(0.1, 1.8, 0, -0.9, 2.9, -0.2, 0.13, 0.08, br); g.limb(0.1, 1.8, 0, 0.0, 3.0, 0.9, 0.11, 0.07, br);
  var L = leaf(0x6f9438, 0.3); g.sph(2.0, 0.42, 1.6, 0.2, 3.35, 0.1, L, { s: [9, 4] }); g.sph(1.4, 0.36, 1.3, 0.8, 3.7, 0.4, leaf(0x7a9f3e, 0.3), { s: [8, 4] }); g.sph(1.3, 0.34, 1.2, -0.9, 3.2, -0.3, L, { s: [8, 4] });
} };
SC.palm = { build: function (g) {
  var tr = 0xa8845a, pts = [], i;
  for (i = 0; i <= 6; i++) { var t = i / 6; pts.push([0.7 * t * t, t * 5.4, 0.1 * t]); }
  for (i = 0; i < 6; i++) { var a = pts[i], b = pts[i + 1], r0 = lerp(0.24, 0.16, i / 6), r1 = lerp(0.24, 0.16, (i + 1) / 6); g.limb(a[0], a[1], a[2], b[0], b[1], b[2], r0, r1, tr, { seg: 6 }); g.cyl(r1 * 1.15, r1 * 1.15, 0.07, b[0], b[1], b[2], 0x8a6a42, { seg: 6 }); }
  var c = pts[6], fc = [0x3f9a3c, 0x4fae48, 0x35903a];
  for (i = 0; i < 9; i++) frond(g, c[0], c[1] + 0.05, c[2], i / 9 * TAU + 0.2, 2.5 + (i % 2) * 0.3, 0.25 + (i % 3) * 0.12, 0.9 + (i % 2) * 0.2, 0.28, fc[i % 3]);
  frond(g, c[0], c[1] + 0.1, c[2], 0, 1.2, 1.3, 1.4, 0.2, 0x58b04a);
  for (i = 0; i < 3; i++) g.sph(0.14, 0.14, 0.14, c[0] + Math.sin(i * 2.1) * 0.2, c[1] - 0.15, c[2] + Math.cos(i * 2.1) * 0.2, 0x6a4a2a, { s: [6, 4] });
} };
SC.bamboo = { build: function (g) {
  var r = mkrng(7), i, k;
  for (i = 0; i < 9; i++) {
    var a = i / 9 * TAU + r() * 0.5, d = 0.15 + r() * 0.45, h = 3.6 + r() * 1.8, lean = 0.12 + r() * 0.25, x0 = Math.sin(a) * d, z0 = Math.cos(a) * d, n = 5;
    var cc = i % 2 ? 0x9acd4a : 0x86bf42;
    for (k = 0; k < n; k++) {
      var t0 = k / n, t1 = (k + 1) / n;
      var ax = x0 + Math.sin(a) * lean * t0 * t0 * h * 0.5, ay = t0 * h, az = z0 + Math.cos(a) * lean * t0 * t0 * h * 0.5;
      var bx = x0 + Math.sin(a) * lean * t1 * t1 * h * 0.5, by = t1 * h, bz = z0 + Math.cos(a) * lean * t1 * t1 * h * 0.5;
      g.limb(ax, ay, az, bx, by, bz, 0.075, 0.07, cc, { seg: 6 }); g.cyl(0.09, 0.09, 0.05, bx, by, bz, 0x5d7a2e, { seg: 6 });
    }
    var tx = x0 + Math.sin(a) * lean * h * 0.5, tz = z0 + Math.cos(a) * lean * h * 0.5;
    for (k = 0; k < 4; k++) { var aa = a + k * 1.6 + i; frond(g, tx, h * (0.82 + 0.05 * k), tz, aa, 0.9, 0.3, 0.8, 0.1, k % 2 ? 0x4aa83a : 0x62b84a); }
  }
} };
SC.baobab = { build: function (g) {
  var tc = function (x, y, z, nx, ny) { var h = hash3(Math.floor(Math.atan2(x, z) * 4), Math.floor(y * 3), 3); return shade(0x8c7863, 0.85 + h * 0.3); };
  g.cyl(1.15, 1.45, 0.6, 0, 0.3, 0, tc, { seg: 10 }); g.sph(1.2, 2.0, 1.2, 0, 2.0, 0, tc, { s: [10, 8] }); g.sph(0.95, 0.9, 0.95, 0, 3.8, 0, tc, { s: [8, 6] });
  var br = 0x7a6652, G = leaf(0x6d9d42);
  for (var i = 0; i < 6; i++) { var a = i / 6 * TAU, ex = Math.sin(a) * 1.7, ez = Math.cos(a) * 1.7, ey = 4.9 + (i % 2) * 0.4; g.limb(0, 4.0, 0, ex, ey, ez, 0.22, 0.09, br, { seg: 5 }); g.sph(0.85, 0.4, 0.85, ex, ey + 0.2, ez, G, { s: [7, 4] }); }
  g.sph(0.9, 0.4, 0.9, 0, 5.2, 0, leaf(0x78a84a), { s: [7, 4] });
} };
SC.cactus = { build: function (g) {
  var C = function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 8) < 0.18 ? 0x3a7a3a : 0x4f9248; };
  g.cyl(0.28, 0.32, 2.4, 0, 1.2, 0, C, { seg: 8 }); g.sph(0.28, 0.28, 0.28, 0, 2.4, 0, 0x4f9248, { s: [8, 5] });
  g.limb(0.2, 0.9, 0, 0.85, 1.0, 0, 0.16, 0.16, 0x4a8d44, { seg: 6 }); g.limb(0.85, 1.0, 0, 0.9, 1.85, 0, 0.16, 0.14, 0x4a8d44, { seg: 6 }); g.sph(0.14, 0.14, 0.14, 0.9, 1.88, 0, 0x4a8d44, { s: [6, 4] });
  g.limb(-0.2, 1.4, 0, -0.75, 1.5, 0, 0.14, 0.14, 0x4a8d44, { seg: 6 }); g.limb(-0.75, 1.5, 0, -0.8, 2.15, 0, 0.14, 0.12, 0x4a8d44, { seg: 6 }); g.sph(0.12, 0.12, 0.12, -0.8, 2.18, 0, 0x4a8d44, { s: [6, 4] });
  g.sph(0.09, 0.07, 0.09, 0, 2.65, 0, 0xf06a9a, { s: [5, 4] });
} };
SC.snow_pine = { build: function (g) {
  g.limb(0, 0, 0, 0, 1.5, 0, 0.22, 0.16, 0x5a4a3a, { seg: 6 });
  var L = [[1.55, 1.7, 1.9], [1.3, 1.6, 2.7], [1.02, 1.5, 3.5], [0.72, 1.3, 4.3], [0.4, 1.1, 5.0]];
  for (var i = 0; i < L.length; i++) { var r = L[i][0], h = L[i][1], y = L[i][2]; g.cone(r, h, 0, y, 0, leaf(0x2a6040, 0.25), { seg: 8 }); g.cone(r * 0.66, h * 0.62, 0, y + h * 0.19, 0, function (px, py, pz) { return hash3(Math.floor(px * 3), 1, Math.floor(pz * 3)) > 0.12 ? 0xf2f7fb : 0xdde8f0; }, { seg: 8 }); }
} };
SC.jungle_tree = { build: function (g) {
  var br = 0x6a5038; g.limb(0, 0, 0, 0, 5.2, 0, 0.4, 0.28, br, { seg: 7 });
  for (var i = 0; i < 3; i++) { var a = i * 2.1 + 0.4; g.limb(Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8, Math.sin(a) * 0.15, 1.8, Math.cos(a) * 0.15, 0.22, 0.08, br, { seg: 4 }); }
  var L = leaf(0x2f8a3c, 0.3); g.sph(1.7, 1.2, 1.7, 0, 5.9, 0, L, { s: [8, 6] }); g.sph(1.2, 0.9, 1.2, 1.3, 5.2, 0.6, leaf(0x27803a), { s: [7, 5] }); g.sph(1.2, 0.9, 1.2, -1.2, 5.3, -0.5, L, { s: [7, 5] }); g.sph(1.1, 0.9, 1.1, 0.1, 6.8, -0.3, leaf(0x3a9a46), { s: [7, 5] });
  var vc = [[1.3, 5.0, 0.8], [-1.2, 5.1, -0.4], [0.2, 4.9, -1.4], [-0.6, 5.0, 1.2]];
  for (i = 0; i < vc.length; i++) { var v = vc[i]; g.limb(v[0], v[1], v[2], v[0] * 1.05, v[1] - 2.6 - i * 0.3, v[2] * 1.05, 0.035, 0.03, 0x2d6a30, { seg: 4 }); g.sph(0.1, 0.18, 0.04, v[0] * 1.05, v[1] - 1.5 - i * 0.2, v[2] * 1.05, 0x3a9a40, { s: [4, 3] }); }
  g.sph(0.09, 0.09, 0.09, 0.3, 3.0, 0.3, 0xe84a5a, { s: [4, 3] }); g.sph(0.09, 0.09, 0.09, -0.3, 4.0, 0.1, 0xf0a030, { s: [4, 3] });
} };
SC.bush = { build: function (g) {
  var L = leaf(0x4e9a3e, 0.34); g.sph(0.65, 0.55, 0.65, 0, 0.55, 0, L, { s: [7, 5] }); g.sph(0.45, 0.4, 0.45, 0.55, 0.4, 0.2, L, { s: [6, 4] }); g.sph(0.45, 0.4, 0.45, -0.5, 0.42, 0.15, leaf(0x5aa646), { s: [6, 4] }); g.sph(0.42, 0.38, 0.42, 0.1, 0.4, -0.5, L, { s: [6, 4] });
  for (var i = 0; i < 6; i++) g.sph(0.05, 0.05, 0.05, Math.sin(i * 2.4) * 0.5, 0.5 + (i % 3) * 0.15, Math.cos(i * 2.4) * 0.5 + 0.1, 0xe0405a, { s: [4, 3] });
} };
SC.fern = { build: function (g) {
  for (var i = 0; i < 11; i++) { var a = i / 11 * TAU; frond(g, 0, 0.12 + (i % 3) * 0.05, 0, a, 1.0 + (i % 3) * 0.2, 0.75 - (i % 3) * 0.2, 1.1, 0.15, i % 2 ? 0x3f9f44 : 0x56b44c); }
} };
SC.tall_grass = { build: function (g) {
  var r = mkrng(3), cs = [0xc8c05a, 0xa8b048, 0xd4cc6a, 0x98a840];
  for (var i = 0; i < 18; i++) { var a = r() * TAU, d = r() * 0.45, h = 0.8 + r() * 0.8, lean = 0.1 + r() * 0.3; g.cone(0.05, h, Math.sin(a) * d, h / 2, Math.cos(a) * d, cs[i % 4], { seg: 3, rot: [Math.cos(a) * lean, 0, -Math.sin(a) * lean] }); }
} };
SC.boulder = { build: function (g) { rock(g, 1.0, 0.8, 0.9, 0, 0.62, 0, 0x8c8c8c, 1); rock(g, 0.5, 0.4, 0.45, 0.85, 0.28, 0.35, 0x7e7e80, 2, 1); } };
SC.rock_pile = { build: function (g) {
  rock(g, 0.7, 0.5, 0.6, 0, 0.4, 0, 0x908c88, 3); rock(g, 0.5, 0.42, 0.5, 0.75, 0.3, 0.2, 0x828080, 4, 0.7); rock(g, 0.45, 0.38, 0.4, -0.6, 0.3, 0.4, 0x9a9690, 5, 1.4); rock(g, 0.35, 0.3, 0.35, 0.1, 0.78, 0.0, 0x9c9a96, 6); rock(g, 0.3, 0.25, 0.3, 0.2, 0.25, -0.7, 0x7a7876, 7);
} };
SC.ice_floe = { build: function (g) {
  var ic = function (px, py, pz, nx, ny) { return ny > 0.6 ? 0xf2fafe : (py < 0.1 ? 0xaedaf0 : 0xcdebf8); };
  rock(g, 1.2, 0.4, 1.0, 0, 0.3, 0, ic, 8, 0.3); rock(g, 0.7, 0.3, 0.6, 0.9, 0.2, 0.6, ic, 9, 1.0); rock(g, 0.4, 0.5, 0.35, -0.3, 0.7, -0.2, ic, 10, 0.5);
} };
SC.log = { build: function (g) {
  var bk = function (x, y, z) { return fract(Math.atan2(y - 0.32, z) / TAU * 10) < 0.2 ? 0x4a3220 : 0x6b4a2e; };
  g.cyl(0.3, 0.3, 1.9, 0, 0.3, 0, bk, { seg: 8, rot: [0, 0, PI / 2] }); g.cyl(0.25, 0.25, 0.02, 0.96, 0.3, 0, 0xc8a070, { seg: 8, rot: [0, 0, PI / 2] }); g.cyl(0.25, 0.25, 0.02, -0.96, 0.3, 0, 0xc8a070, { seg: 8, rot: [0, 0, PI / 2] });
  g.limb(0.2, 0.5, 0.2, 0.3, 0.85, 0.5, 0.06, 0.04, 0x5a3e26, { seg: 4 }); g.sph(0.25, 0.08, 0.2, -0.3, 0.58, 0.05, 0x5a8a3a, { s: [5, 4] });
} };
SC.heat_rock = { build: function (g) {
  var hc = function (px, py, pz, nx, ny) { var h = hash3(Math.floor(px * 4), Math.floor(py * 4), Math.floor(pz * 4)); return ny > 0.6 ? shade(0xd89a5c, 0.9 + h * 0.2) : shade(0xb87a48, 0.85 + h * 0.3); };
  rock(g, 0.9, 0.38, 0.8, 0, 0.32, 0, hc, 11); rock(g, 0.45, 0.25, 0.4, 0.8, 0.2, 0.3, hc, 12, 0.8);
  g.sph(0.35, 0.03, 0.3, 0.05, 0.69, 0.0, 0xe8b070, { s: [6, 3] });
} };
SC.ball = { build: function (g) {
  var bc = function (x, y, z) { var a = Math.atan2(x, z); return fract(a / TAU * 6 + y * 0.8) < 0.5 ? 0xe84a4a : 0xf4d040; };
  g.sph(0.38, 0.38, 0.38, 0, 0.38, 0, bc, { s: [12, 8] });
} };
SC.flower_bed = { build: function (g) {
  g.box(1.7, 0.18, 0.12, 0, 0.09, 0.8, 0x9a8a78); g.box(1.7, 0.18, 0.12, 0, 0.09, -0.8, 0x9a8a78); g.box(0.12, 0.18, 1.5, 0.8, 0.09, 0, 0x9a8a78); g.box(0.12, 0.18, 1.5, -0.8, 0.09, 0, 0x9a8a78);
  g.box(1.5, 0.16, 1.5, 0, 0.1, 0, 0x5a3e28);
  var r = mkrng(5), cs = [0xf05a8a, 0xf4d040, 0xff8a3a, 0xffffff, 0xa060e0, 0xe84a4a];
  for (var i = 0; i < 16; i++) { var x = (r() - 0.5) * 1.3, z = (r() - 0.5) * 1.3, h = 0.25 + r() * 0.2; g.limb(x, 0.15, z, x, 0.15 + h, z, 0.02, 0.02, 0x3f8a3a, { seg: 3 }); g.sph(0.1, 0.07, 0.1, x, 0.18 + h, z, cs[i % 6], { s: [5, 4] }); g.sph(0.14, 0.05, 0.14, x + 0.05, 0.2, z, 0x4a9a40, { s: [4, 3] }); }
} };
SC.bin = { build: function (g) {
  g.cyl(0.27, 0.21, 0.72, 0, 0.36, 0, 0x3f7a4a, { seg: 8 }); g.cyl(0.3, 0.3, 0.07, 0, 0.75, 0, 0x2a5a34, { seg: 8 }); g.sph(0.27, 0.09, 0.27, 0, 0.78, 0, 0x2a5a34, { s: [8, 4] });
  g.box(0.22, 0.09, 0.03, 0, 0.72, 0.29, 0x111111); g.box(0.16, 0.16, 0.012, 0, 0.42, 0.235, 0xf2f2f2); g.box(0.1, 0.1, 0.014, 0, 0.42, 0.237, 0x3f7a4a);
} };
SC.picnic_table = { build: function (g) {
  var W = 0xb08050, D = 0x8a6038;
  g.box(2.0, 0.07, 0.8, 0, 0.75, 0, W); g.box(2.0, 0.07, 0.35, 0, 0.45, 0.72, W); g.box(2.0, 0.07, 0.35, 0, 0.45, -0.72, W);
  for (var s = -1; s <= 1; s += 2) { g.limb(s * 0.7, 0.0, 0.8, s * 0.7, 0.75, 0.15, 0.04, 0.04, D, { seg: 4 }); g.limb(s * 0.7, 0.0, -0.8, s * 0.7, 0.75, -0.15, 0.04, 0.04, D, { seg: 4 }); g.box(0.07, 0.07, 1.65, s * 0.7, 0.43, 0, D); }
} };
SC.sign = { build: function (g) {
  g.limb(0, 0, 0, 0, 1.9, 0, 0.06, 0.06, 0x6b4a2e, { seg: 5 }); g.box(1.1, 0.7, 0.06, 0, 1.6, 0, 0x2f7a44); g.box(1.16, 0.76, 0.04, 0, 1.6, -0.01, 0xf2ead0);
  for (var s = -1; s <= 1; s += 2) { var z = s * 0.04; g.sph(0.17, 0.14, 0.02, 0, 1.55, z, 0xf2ead0, { s: [6, 4] }); for (var i = 0; i < 4; i++) g.sph(0.06, 0.07, 0.02, (i - 1.5) * 0.14, 1.78 - Math.abs(i - 1.5) * 0.05 + 0.0, z, 0xf2ead0, { s: [5, 4] }); }
} };
SC.statue = { build: function (g) {
  var S = 0xb9b2a4, BR = 0x8a6a3a;
  g.box(1.2, 0.3, 1.2, 0, 0.15, 0, shade(S, 0.9)); g.box(0.95, 0.7, 0.95, 0, 0.65, 0, S); g.box(1.05, 0.1, 1.05, 0, 1.05, 0, shade(S, 1.08));
  var y = 1.1, G = function (x, yy, z, nx, ny) { return ny > 0.4 ? 0x9a7a4a : BR; };
  g.sph(0.42, 0.34, 0.55, 0, y + 0.62, 0, G, { s: [8, 6] }); g.sph(0.3, 0.3, 0.3, 0, y + 0.8, 0.5, G, { s: [7, 5] });
  g.limb(0, y + 0.7, 0.72, 0.0, y + 0.3, 0.95, 0.1, 0.05, BR, { seg: 5 }); g.limb(0, y + 0.3, 0.95, 0, y + 0.35, 1.15, 0.05, 0.04, BR, { seg: 5 });
  g.sph(0.04, 0.2, 0.2, 0.28, y + 0.82, 0.4, G, { s: [5, 4] }); g.sph(0.04, 0.2, 0.2, -0.28, y + 0.82, 0.4, G, { s: [5, 4] });
  for (var i = 0; i < 4; i++) g.cyl(0.1, 0.09, 0.45, (i % 2 ? 1 : -1) * 0.28, y + 0.22, i < 2 ? 0.3 : -0.3, BR, { seg: 5 });
  g.limb(0.08, y + 0.58, 0.8, 0.08, y + 0.3, 1.0, 0.025, 0.012, 0xf0e8d0, { seg: 4 }); g.limb(-0.08, y + 0.58, 0.8, -0.08, y + 0.3, 1.0, 0.025, 0.012, 0xf0e8d0, { seg: 4 });
} };
SC.cave_shelter = { build: function (g) {
  var RC = 0x7f7a74;
  rock(g, 1.3, 1.0, 1.0, -0.9, 0.8, -0.2, RC, 21); rock(g, 1.3, 1.0, 1.0, 0.9, 0.8, -0.2, RC, 22, 1); rock(g, 1.5, 0.85, 1.1, 0, 1.45, -0.35, 0x8a857e, 23, 0.5); rock(g, 1.2, 1.0, 0.9, 0, 0.9, -0.85, RC, 24);
  g.sph(0.62, 0.78, 0.5, 0, 0.65, 0.58, 0x1a1816, { s: [8, 6] }); g.box(1.0, 0.1, 0.5, 0, 0.05, 0.9, 0x6a655e);
  rock(g, 0.35, 0.3, 0.3, 1.2, 0.25, 0.85, 0x8d8882, 25);
} };
SC.wooden_shelter = { build: function (g) {
  var P = 0x8a5e36, R = 0xa8774a, F = 0x7a5530;
  g.box(2.2, 0.08, 1.8, 0, 0.04, 0, F);
  var px = [[-1.0, -0.8], [1.0, -0.8]]; for (var i = 0; i < 2; i++) { g.limb(px[i][0], 0, px[i][1], px[i][0], 1.9, px[i][1], 0.07, 0.07, P, { seg: 5 }); }
  g.limb(-1.0, 0, 0.8, -1.0, 1.4, 0.8, 0.07, 0.07, P, { seg: 5 }); g.limb(1.0, 0, 0.8, 1.0, 1.4, 0.8, 0.07, 0.07, P, { seg: 5 });
  g.box(2.1, 1.9, 0.06, 0, 0.95, -0.9, R, { s: [1, 4, 1] }); g.box(0.06, 1.6, 1.7, -1.05, 0.85, 0, R); g.box(0.06, 1.6, 1.7, 1.05, 0.85, 0, R);
  g.box(2.6, 0.1, 2.3, 0, 1.78, 0.05, 0x6a4a2a, { rot: [0.17, 0, 0] }); g.box(2.6, 0.06, 2.3, 0, 1.86, 0.05, 0x4f8a3e, { rot: [0.17, 0, 0] });
  g.box(1.0, 0.2, 0.5, 0, 0.18, -0.4, 0xe0c878); // hay
} };
SC.climbing_frame = { build: function (g) {
  var P = 0x9a6a3e, R = 0xc8b078, i;
  var px = [[-1.0, -0.8], [1.0, -0.8], [-1.0, 0.8], [1.0, 0.8]];
  for (i = 0; i < 4; i++) g.limb(px[i][0], 0, px[i][1], px[i][0], 2.6, px[i][1], 0.1, 0.09, P, { seg: 6 });
  g.box(2.2, 0.08, 0.1, 0, 2.55, -0.8, P); g.box(2.2, 0.08, 0.1, 0, 2.55, 0.8, P); g.box(0.1, 0.08, 1.7, -1.0, 2.55, 0, P); g.box(0.1, 0.08, 1.7, 1.0, 2.55, 0, P);
  g.box(2.0, 0.1, 1.0, 0, 1.4, -0.3, 0xb88850); g.box(2.0, 0.08, 0.08, 0, 1.0, 0.8, P);
  for (i = 0; i < 5; i++) g.limb(-0.8 + i * 0.4, 1.4, 0.2, -0.8 + i * 0.4, 2.5, 0.8, 0.02, 0.02, R, { seg: 3 });
  g.limb(-0.5, 2.55, 0.0, -0.5, 1.3, 0.8, 0.03, 0.03, R, { seg: 4 }); g.limb(0.5, 2.55, 0.0, 0.5, 1.3, 0.8, 0.03, 0.03, R, { seg: 4 });
  g.limb(0.0, 1.45, 0.4, 0.0, 0.2, 1.1, 0.04, 0.04, P, { seg: 4 });
  g.limb(0.9, 2.55, 0.8, 0.9, 1.5, 0.8, 0.02, 0.02, R, { seg: 3 }); g.sph(0.1, 0.1, 0.1, 0.9, 1.45, 0.8, 0xd8a040, { s: [5, 4] });
} };
SC.lamp = { custom: function (grp0) {
  var g = B(), D = 0x3a3d44;
  g.cyl(0.14, 0.18, 0.2, 0, 0.1, 0, D, { seg: 8 }); g.limb(0, 0.2, 0, 0, 2.7, 0, 0.06, 0.05, D, { seg: 6 }); g.cyl(0.09, 0.09, 0.08, 0, 1.0, 0, 0x555a62, { seg: 8 });
  g.limb(0, 2.7, 0, 0.22, 2.95, 0, 0.04, 0.035, D, { seg: 5 }); g.cyl(0.2, 0.05, 0.12, 0.22, 3.1, 0, D, { seg: 8 }); g.cyl(0.02, 0.2, 0.05, 0.22, 3.2, 0, 0x2a2c32, { seg: 8 });
  g.cyl(0.13, 0.13, 0.03, 0.22, 2.9, 0, D, { seg: 8 });
  grp0.add(mesh(g.build()));
  var bulb = new T.Mesh(unit('bulbg', function () { return new T.SphereGeometry(0.13, 8, 6); }), LAMP_MAT); bulb.name = 'bulb'; bulb.position.set(0.22, 3.0, 0); grp0.add(bulb);
  grp0.userData.isLamp = true; return grp0;
} };
SC.fountain = { custom: function (grp0) {
  var g = B(), S = 0xbdb8ac, S2 = 0xa09a8e, i;
  var ring = function (r0, r1, h, y, col, n) { n = n || 12; for (var k = 0; k < n; k++) { var a = (k + 0.5) / n * TAU, rm = (r0 + r1) / 2; g.box(r1 - r0, h, 2 * rm * Math.tan(PI / n) * 1.02, Math.sin(a) * rm, y, Math.cos(a) * rm, col, { rot: [0, a - PI / 2, 0] }); } };
  ring(0.95, 1.2, 0.5, 0.25, S); ring(0.9, 1.25, 0.08, 0.54, shade(S, 1.1));
  g.cyl(0.95, 0.95, 0.05, 0, 0.06, 0, S2, { seg: 12 });
  g.cyl(0.22, 0.3, 0.9, 0, 0.5, 0, S, { seg: 8 }); g.cyl(0.55, 0.3, 0.12, 0, 0.98, 0, S2, { seg: 10 }); g.cyl(0.55, 0.55, 0.06, 0, 1.04, 0, S, { seg: 10 });
  g.cyl(0.1, 0.2, 0.7, 0, 1.4, 0, S, { seg: 8 }); g.cyl(0.32, 0.12, 0.1, 0, 1.78, 0, S2, { seg: 8 });
  g.sph(0.14, 0.14, 0.14, 0, 1.95, 0, 0xcfcabc, { s: [6, 4] });
  grp0.add(mesh(g.build()));
  var water = new T.Mesh(unit('fwater', function () { return new T.CylinderGeometry(1.0, 1.0, 0.04, 14); }), WATER_MAT); water.position.y = 0.42; water.name = 'water'; grp0.add(water);
  var dropG = unit('fdrop', function () { return new T.SphereGeometry(0.06, 5, 4); }), dropM = mat(0xcfeeff, { opacity: 0.85 });
  var drops = [];
  for (i = 0; i < 18; i++) { var d = new T.Mesh(dropG, dropM); d.userData = { a: i / 18 * TAU, k: i % 3, ph: i * 0.37 }; grp0.add(d); drops.push(d); }
  grp0.userData.update = function (dt, time) {
    time = time || 0; water.position.y = 0.42 + 0.008 * Math.sin(time * 2);
    for (var j = 0; j < drops.length; j++) { var dd = drops[j], u = fract(time * 0.8 + dd.userData.ph), k = dd.userData.k; var rad = k === 0 ? 0.45 : (k === 1 ? 0.8 : 0.15), top = k === 0 ? 1.4 : (k === 1 ? 1.1 : 2.3);
      var base = k === 0 ? 1.05 : (k === 1 ? 0.6 : 2.0); dd.position.set(Math.sin(dd.userData.a) * rad * u * (k === 2 ? 0.5 : 1), base + (top - base) * Math.sin(PI * u * 0.5 + 0.0) - (k === 2 ? 0 : 1.2 * u * u * (top - base)), Math.cos(dd.userData.a) * rad * u * (k === 2 ? 0.5 : 1)); dd.scale.setScalar(1 - u * 0.4); }
  };
  grp0.userData.update(0, 0); return grp0;
} };
SC.tyre_swing = { custom: function (grp0) {
  var g = B(), P = 0x8a6038;
  g.limb(-1.1, 0, 0.3, 0, 2.9, 0, 0.09, 0.09, P, { seg: 6 }); g.limb(-1.1, 0, -0.3, 0, 2.9, 0, 0.09, 0.09, P, { seg: 6 }); g.limb(1.1, 0, 0.3, 0, 2.9, 0, 0.09, 0.09, P, { seg: 6 }); g.limb(1.1, 0, -0.3, 0, 2.9, 0, 0.09, 0.09, P, { seg: 6 });
  g.cyl(0.07, 0.07, 2.3, 0, 2.9, 0, 0x6a4a2a, { seg: 6, rot: [0, 0, PI / 2] });
  grp0.add(mesh(g.build()));
  var sw = grp(); sw.position.y = 2.85; grp0.add(sw); var g2 = B();
  g2.limb(0, 0, 0, 0, -1.45, 0, 0.025, 0.025, 0xc8b078, { seg: 4 });
  for (var i = 0; i < 12; i++) { var a = i / 12 * TAU, a2 = (i + 1) / 12 * TAU; g2.limb(Math.sin(a) * 0.38, -1.85 + Math.cos(a) * 0.38, 0, Math.sin(a2) * 0.38, -1.85 + Math.cos(a2) * 0.38, 0, 0.1, 0.1, 0x222226, { seg: 5 }); }
  sw.add(mesh(g2.build())); grp0.userData.update = function (dt, time) { sw.rotation.x = Math.sin((time || 0) * 1.6) * 0.25; sw.rotation.z = Math.sin((time || 0) * 1.1) * 0.05; };
  return grp0;
} };
SC.bench = { build: function (g) {
  var W = 0xb8864e, M = 0x3a3d44;
  for (var i = 0; i < 3; i++) g.box(1.5, 0.06, 0.14, 0, 0.46, 0.1 - i * 0.16, W);
  g.box(1.5, 0.12, 0.05, 0, 0.8, -0.26, W); g.box(1.5, 0.12, 0.05, 0, 0.64, -0.24, W);
  for (var s = -1; s <= 1; s += 2) { g.box(0.06, 0.46, 0.5, s * 0.68, 0.23, -0.02, M); g.limb(s * 0.68, 0.45, -0.25, s * 0.68, 0.85, -0.28, 0.03, 0.03, M, { seg: 4 }); g.box(0.07, 0.05, 0.55, s * 0.68, 0.55, 0, M); }
} };

var INSTANCED = { oak: 1, pine: 1, acacia: 1, palm: 1, bamboo: 1, baobab: 1, cactus: 1, snow_pine: 1, jungle_tree: 1, bush: 1, fern: 1, tall_grass: 1, boulder: 1, rock_pile: 1, ice_floe: 1, log: 1, heat_rock: 1 };
function sceneryGeo(id) {
  if (sceneryGeoCache[id]) return sceneryGeoCache[id];
  var d = SC[id]; if (!d || !d.build) return null;
  var g = B(); d.build(g); return (sceneryGeoCache[id] = g.build());
}
SCENERY_API = {
  scenery: function (id) {
    var d = SC[id], grp0 = grp(id); if (!d) return null;
    grp0.userData.sceneryId = id;
    if (d.custom) return d.custom(grp0);
    grp0.add(mesh(sceneryGeo(id))); return grp0;
  },
  instancing: function (id) { if (!INSTANCED[id]) return null; var g = sceneryGeo(id); return g ? { geometry: g, material: VC } : null; }
};
var SCENERY_API;

// ================================================================ BUILDINGS
var BLD = {};
var BLD_DEF = { burger_stand: [1, 1], pizza_hut: [1, 1], ice_cream: [1, 1], drinks_stall: [1, 1], coffee_cart: [1, 1], toilets: [2, 1], gift_shop: [2, 1], balloon_stand: [1, 1], carousel: [2, 2], info_kiosk: [1, 1], restaurant: [2, 2], keeper_hut: [1, 1], vet_clinic: [2, 2], education_centre: [2, 2], viewing_platform: [2, 1], emergency_bunker: [2, 2] };
var texMats = {};
function labelMat(text, bg, fg, w, h) {
  var key = text + bg + fg + w + h; if (texMats[key]) return texMats[key];
  var cv = document.createElement('canvas'); cv.width = w || 256; cv.height = h || 64; var c = cv.getContext('2d');
  c.fillStyle = '#' + ('000000' + bg.toString(16)).slice(-6); c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = '#' + ('000000' + fg.toString(16)).slice(-6); c.lineWidth = 4; c.strokeRect(4, 4, cv.width - 8, cv.height - 8);
  c.fillStyle = c.strokeStyle; c.font = 'bold ' + Math.floor(cv.height * 0.58) + 'px "Trebuchet MS",Verdana,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cv.width / 2, cv.height / 2 + 2);
  var tex = new T.CanvasTexture(cv); tex.anisotropy = 2;
  return (texMats[key] = new T.MeshLambertMaterial({ map: tex }));
}
function labelMesh(text, bg, fg, w, h, x, y, z, ry, rx) {
  var m = new T.Mesh(unit('plane1', function () { return new T.PlaneGeometry(1, 1); }), labelMat(text, bg, fg, 256, Math.round(256 * h / w)));
  m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry || 0; m.rotation.x = rx || 0; return m;
}
function awning(g, x, y, z, w, d, c1, c2, n, slope) {
  n = n || 8; slope = slope || 0.4; var sw = w / n, s = d / Math.cos(slope);
  for (var i = 0; i < n; i++) { g.box(sw * 1.01, 0.05, s, x - w / 2 + sw * (i + 0.5), y - Math.sin(slope) * d / 2, z + Math.cos(slope) * d / 2, i % 2 ? c2 : c1, { rot: [slope, 0, 0] }); g.box(sw * 1.01, 0.12, 0.04, x - w / 2 + sw * (i + 0.5), y - Math.sin(slope) * d - 0.04, z + d, i % 2 ? c2 : c1); }
}
function gable(g, w, d, y, h, col, over, ridgeAlongX) {
  over = over || 0.15; var half = d / 2, ang = Math.atan2(h, half), s = Math.sqrt(half * half + h * h) + over;
  g.box(w + over * 2, 0.1, s, 0, y + h / 2, half / 2, col, { rot: [ang, 0, 0] }); g.box(w + over * 2, 0.1, s, 0, y + h / 2, -half / 2, shade(col, 0.88), { rot: [-ang, 0, 0] });
  g.tri([w / 2, y, -half], [w / 2, y, half], [w / 2, y + h, 0], shade(col, 0.8), 1, 0, 0); g.tri([-w / 2, y, -half], [-w / 2, y, half], [-w / 2, y + h, 0], shade(col, 0.8), -1, 0, 0);
}
function windowAt(g, x, y, z, w, h, frame, glass) { g.box(w + 0.1, h + 0.1, 0.05, x, y, z, frame); g.box(w, h, 0.07, x, y, z + 0.005, glass || 0x9fd0ec); g.box(0.04, h, 0.08, x, y, z + 0.01, frame); g.box(w, 0.04, 0.08, x, y, z + 0.01, frame); }
function stall(g, o) {
  var W = o.w || 1.6, D = o.d || 1.4, H = o.h || 1.2, y0 = 0.12;
  g.box(W + 0.12, 0.12, D + 0.12, 0, 0.06, 0, 0x8d8a84);
  g.box(W, H, D, 0, y0 + H / 2, 0, o.wall, { s: [1, o.bands ? 4 : 1, 1] });
  g.box(W + 0.04, 0.08, D + 0.04, 0, y0 + H * 0.12, 0, o.trim); g.box(W + 0.04, 0.08, D + 0.04, 0, y0 + H, 0, o.trim);
  g.box(W * 0.72, H * 0.36, 0.05, 0, y0 + H * 0.64, D / 2 + 0.005, 0x2a221e); g.box(W * 0.72 + 0.1, 0.05, 0.06, 0, y0 + H * 0.82 + 0.05, D / 2 + 0.01, o.trim); g.box(W * 0.72 + 0.1, 0.05, 0.06, 0, y0 + H * 0.46 - 0.02, D / 2 + 0.01, o.trim);
  g.box(W * 0.8, 0.06, 0.3, 0, y0 + H * 0.45, D / 2 + 0.16, o.counter || 0xe8e0d0);
  g.box(0.3, 0.45, 0.04, W / 2 + 0.005, y0 + H * 0.6, 0.1, 0x2a221e); // side hatch
  awning(g, 0, y0 + H * 1.0 + 0.2, D / 2 - 0.02, W + 0.1, 0.65, o.awn1, o.awn2, 8, 0.45);
  g.box(W + 0.2, 0.1, D + 0.2, 0, y0 + H + 0.05 + 0.0, 0, o.roof);
  for (var s = -1; s <= 1; s += 2) g.limb(s * (W / 2 + 0.02), y0 + H, D / 2 + 0.55, s * (W / 2 + 0.02), y0 + H * 0.45, D / 2 + 0.55, 0.025, 0.025, 0xe8e0d0, { seg: 4 });
}
function addSpin(grp0, geo, y, speed) {
  var p = grp('spin'); p.position.y = y; grp0.add(p); p.add(mesh(geo));
  var prev = grp0.userData.update;
  grp0.userData.update = function (dt, t) { if (prev) prev(dt, t); p.rotation.y += dt * speed; };
  return p;
}
function foods(name) { // rooftop signs (each a merged geometry centred at origin)
  var g = B();
  if (name === 'burger') {
    g.sph(0.46, 0.3, 0.46, 0, 0.3, 0, 0xe0a050, { s: [10, 6] }); for (var i = 0; i < 9; i++) { var a = i / 9 * TAU; g.sph(0.035, 0.015, 0.025, Math.sin(a) * 0.28, 0.55 - Math.sin(a * 2) * 0.01 - 0.12 * (Math.cos(a * 0) * 0.0), Math.cos(a) * 0.28, 0xf6e8c0, { s: [4, 3] }); }
    g.cyl(0.5, 0.5, 0.06, 0, 0.1, 0, function (x, y, z) { return 0x58b040; }, { seg: 10 }); g.cyl(0.46, 0.46, 0.08, 0, 0.02, 0, 0xe03a2a, { seg: 10 }); g.cyl(0.45, 0.45, 0.14, 0, -0.08, 0, 0x6a3a22, { seg: 10 }); g.cyl(0.47, 0.47, 0.04, 0, -0.17, 0, 0xf2c030, { seg: 4, rot: [0, 0.8, 0] });
    g.sph(0.44, 0.17, 0.44, 0, -0.26, 0, 0xd8903a, { s: [10, 5] });
    g.translateY = 0;
  } else if (name === 'cone') {
    g.cone(0.26, 0.8, 0, 0.0, 0, function (x, y, z) { return (fract(x * 6 + z * 6) < 0.5) !== (fract(x * 6 - z * 6) < 0.5) ? 0xd8a860 : 0xe8c078; }, { seg: 8, rot: [PI, 0, 0] });
    g.sph(0.3, 0.26, 0.3, 0, 0.5, 0, 0xf49ac0, { s: [9, 6] }); g.sph(0.27, 0.24, 0.27, 0, 0.8, 0, 0xa8f0d0, { s: [9, 6] }); g.sph(0.09, 0.09, 0.09, 0, 1.08, 0, 0xe02040, { s: [6, 4] });
  } else if (name === 'cup') {
    g.cyl(0.32, 0.23, 0.75, 0, 0.0, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 8) < 0.5 ? 0xe84a4a : 0xffffff; }, { seg: 8 }); g.cyl(0.35, 0.35, 0.07, 0, 0.4, 0, 0xf4f4f4, { seg: 8 });
    g.limb(0.05, 0.4, 0, 0.1, 0.75, 0, 0.03, 0.03, 0x3b82f6, { seg: 4 }); g.limb(0.1, 0.75, 0, 0.3, 0.8, 0, 0.03, 0.03, 0x3b82f6, { seg: 4 });
    g.sph(0.2, 0.05, 0.2, 0, 0.36, 0, 0x6ac8f0, { s: [6, 3] });
  } else if (name === 'pizza') {
    g.cyl(0.55, 0.55, 0.08, 0, 0, 0, 0xd8a050, { seg: 14 }); g.cyl(0.48, 0.48, 0.1, 0, 0.0, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 6) < 0.06 ? 0xe8c070 : 0xf2b840; }, { seg: 12 });
    for (var k = 0; k < 7; k++) { var a2 = k / 7 * TAU + 0.3, rr = k < 6 ? 0.26 : 0; g.cyl(0.07, 0.07, 0.13, Math.sin(a2) * rr, 0, Math.cos(a2) * rr, 0xc83a2a, { seg: 6 }); }
    g.sph(0.05, 0.03, 0.05, 0.1, 0.06, -0.18, 0x3f8a3a, { s: [4, 3] }); g.sph(0.05, 0.03, 0.05, -0.2, 0.06, 0.1, 0x3f8a3a, { s: [4, 3] });
  }
  return g.build();
}

BLD.burger_stand = function (grp0, W, D) {
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.25, wall: 0xf2e0a8, trim: 0xd83a2a, roof: 0xb83020, awn1: 0xd83a2a, awn2: 0xfaf0d8, counter: 0x8a5a3a, bands: true });
  g.limb(0, 1.52, 0, 0, 1.95, 0, 0.05, 0.05, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  var burger = addSpin(grp0, foods('burger'), 2.5, 0.9); burger.scale.setScalar(0.95);
  grp0.add(labelMesh('BURGERS', 0xd83a2a, 0xfff4d0, 1.1, 0.24, 0, 0.36, 0.73, 0));
};
BLD.pizza_hut = function (grp0) {
  var g = B();
  g.box(1.8, 0.12, 1.7, 0, 0.06, 0, 0x8d8a84); g.box(1.6, 1.4, 1.4, 0, 0.82, 0, 0xd8905a, { s: [1, 3, 1] });
  for (var i = 0; i < 6; i++) g.box(0.35, 0.18, 0.02, -0.6 + (i % 3) * 0.6, 0.7 + Math.floor(i / 3) * 0.7, 0.705, 0xc87848);
  gable(g, 1.6, 1.4, 1.52, 0.55, 0xc03a2a, 0.18);
  g.box(0.26, 0.6, 0.26, 0.55, 2.0, -0.35, 0xa86a48); g.box(0.32, 0.06, 0.32, 0.55, 2.32, -0.35, 0x886040);
  g.box(0.5, 1.0, 0.06, -0.45, 0.65, 0.72, 0x6a3a22); g.sph(0.04, 0.04, 0.04, -0.3, 0.65, 0.76, 0xe8c040, { s: [4, 3] });
  g.box(0.7, 0.55, 0.05, 0.45, 0.95, 0.72, 0x2a221e); g.box(0.8, 0.05, 0.3, 0.45, 0.66, 0.85, 0xf4ead0);
  awning(g, 0.45, 1.3, 0.72, 0.9, 0.5, 0x2f8a3c, 0xfaf0d8, 6, 0.45);
  for (var s = -1; s <= 1; s += 2) g.limb(0.45 + s * 0.42, 1.0, 1.2, 0.45 + s * 0.42, 0.1, 1.2, 0.025, 0.025, 0xe8e0d0, { seg: 4 });
  g.cyl(0.14, 0.14, 0.4, -0.45, 0.2, 1.1, 0x6a4a2a, { seg: 8 });
  grp0.add(mesh(g.build()));
  var p = addSpin(grp0, foods('pizza'), 2.25, 0.8); p.children[0].rotation.x = PI / 2; p.children[0].position.z = 0; p.scale.setScalar(0.9);
  var m = labelMesh('PIZZA', 0x2f8a3c, 0xfff4d0, 1.0, 0.28, 0.45, 1.42, 0.75, 0);
  grp0.add(m);
};
BLD.ice_cream = function (grp0) {
  var g = B();
  stall(g, { w: 1.5, d: 1.3, h: 1.2, wall: 0xf6b8d0, trim: 0xffffff, roof: 0x8adcc0, awn1: 0xf06aa0, awn2: 0xffffff, counter: 0xa8f0d0, bands: true });
  g.cyl(0.05, 0.05, 0.5, 0, 1.6, 0, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  var c = addSpin(grp0, foods('cone'), 2.05, 1.0); c.scale.setScalar(0.95);
  grp0.add(labelMesh('ICE CREAM', 0xf06aa0, 0xffffff, 1.1, 0.24, 0, 0.36, 0.665, 0));
};
BLD.drinks_stall = function (grp0) {
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.2, wall: 0x6ab4ee, trim: 0xffffff, roof: 0x2f6fb8, awn1: 0x3b82f6, awn2: 0xffffff, counter: 0xe8f4ff, bands: false });
  g.cyl(0.05, 0.05, 0.5, 0, 1.6, 0, 0x555555, { seg: 5 });
  for (var i = 0; i < 3; i++) { g.cyl(0.07, 0.05, 0.22, -0.4 + i * 0.4, 0.78, 0.98, [0xe84a4a, 0xf2c030, 0x58b040][i], { seg: 6 }); }
  grp0.add(mesh(g.build()));
  var c = addSpin(grp0, foods('cup'), 2.15, 0.9); c.scale.setScalar(1.1);
  grp0.add(labelMesh('DRINKS', 0x2f6fb8, 0xffffff, 1.0, 0.24, 0, 0.36, 0.73, 0));
};
BLD.coffee_cart = function (grp0) {
  var g = B();
  g.box(1.3, 0.7, 0.9, 0, 0.7, 0, 0x7a4a2e, { s: [1, 3, 1] }); g.box(1.4, 0.08, 1.0, 0, 1.08, 0, 0xe8d8b8); g.box(1.3, 0.1, 0.9, 0, 0.35, 0, 0x5a3a24);
  g.box(0.9, 0.35, 0.05, 0, 0.75, 0.46, 0x2a221e); g.box(0.5, 0.06, 0.2, 0, 1.14, 0.55, 0xf4ead0);
  for (var s = -1; s <= 1; s += 2) { g.cyl(0.32, 0.32, 0.1, s * 0.62, 0.32, 0.0, 0x2a2a2a, { seg: 10, rot: [0, 0, PI / 2] }); g.cyl(0.12, 0.12, 0.12, s * 0.62, 0.32, 0.0, 0xc8c8c8, { seg: 6, rot: [0, 0, PI / 2] }); }
  g.limb(-0.65, 0.6, -0.4, -1.05, 0.9, -0.5, 0.03, 0.03, 0x555555, { seg: 4 }); g.limb(-1.05, 0.9, -0.5, -1.1, 0.9, 0.0, 0.03, 0.03, 0x555555, { seg: 4 });
  g.limb(0.5, 1.1, -0.3, 0.5, 2.5, -0.3, 0.03, 0.03, 0x555555, { seg: 4 });
  g.cone(1.25, 0.55, 0.5, 2.5, -0.3, function (x, y, z) { return fract(Math.atan2(x - 0.5, z + 0.3) / TAU * 10) < 0.5 ? 0xf4e8d0 : 0x8a5a3a; }, { seg: 10 }); g.sph(0.06, 0.06, 0.06, 0.5, 2.8, -0.3, 0x8a5a3a, { s: [4, 3] });
  g.cyl(0.14, 0.1, 0.2, -0.3, 1.22, 0.1, 0xf4f4f4, { seg: 8 }); g.cyl(0.14, 0.14, 0.02, -0.3, 1.32, 0.1, 0x5a3a24, { seg: 8 });
  g.cyl(0.18, 0.18, 0.05, 0.3, 1.14, 0.05, 0xc8c8c8, { seg: 8 });
  grp0.add(mesh(g.build()));
  var steam = []; var sg = unit('steamg', function () { return new T.SphereGeometry(0.07, 5, 4); }), sm = mat(0xffffff, { opacity: 0.55 });
  for (var i = 0; i < 4; i++) { var m = new T.Mesh(sg, sm); m.userData.ph = i / 4; grp0.add(m); steam.push(m); }
  grp0.userData.update = function (dt, t) { for (var j = 0; j < steam.length; j++) { var u = fract((t || 0) * 0.5 + steam[j].userData.ph); steam[j].position.set(-0.3 + Math.sin(u * 7 + j) * 0.05, 1.38 + u * 0.6, 0.1); steam[j].scale.setScalar(0.6 + u * 1.1); steam[j].material.opacity = 0.55 * (1 - u); } };
  grp0.add(labelMesh('COFFEE', 0x5a3a24, 0xf4ead0, 0.8, 0.2, 0, 0.38, 0.456, 0));
};
BLD.toilets = function (grp0) {
  var g = B();
  g.box(3.6, 0.1, 1.7, 0, 0.05, 0, 0x8d8a84); g.box(3.4, 2.0, 1.5, 0, 1.1, 0, 0xd8dce0, { s: [1, 3, 1] }); g.box(3.5, 0.14, 1.6, 0, 2.17, 0, 0x5a6672);
  g.box(3.6, 0.25, 0.04, 0, 1.9, 0.77, 0x6a8aa8);
  var door = function (x, col, fem) {
    g.box(0.8, 1.5, 0.06, x, 0.9, 0.76, col); g.box(0.9, 1.6, 0.04, x, 0.9, 0.74, 0xf4f4f4); g.sph(0.04, 0.04, 0.04, x + 0.3, 0.85, 0.82, 0xe8c040, { s: [4, 3] });
    g.sph(0.07, 0.07, 0.03, x, 1.5, 0.8, 0xffffff, { s: [6, 4] }); g.box(fem ? 0.1 : 0.14, 0.22, 0.03, x, 1.32, 0.8, 0xffffff);
    if (fem) g.cone(0.14, 0.22, x, 1.26, 0.8, 0xffffff, { seg: 3 });
    else { g.box(0.04, 0.16, 0.03, x - 0.1, 1.3, 0.8, 0xffffff); g.box(0.04, 0.16, 0.03, x + 0.1, 1.3, 0.8, 0xffffff); }
  };
  door(-0.9, 0x3b82f6, false); door(0.9, 0xf472b6, true);
  windowAt(g, 0, 1.45, 0.77, 0.45, 0.35, 0xffffff, 0xaed8f0); g.box(0.55, 0.3, 0.05, 0, 1.0, 0.77, 0x6a8aa8);
  g.sph(0.2, 0.2, 0.2, 1.5, 0.3, 0.9, 0x3f8a4a, { s: [5, 4] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('WC', 0x6a8aa8, 0xffffff, 0.45, 0.25, 0, 1.0, 0.8, 0));
};
BLD.gift_shop = function (grp0) {
  var g = B();
  g.box(3.7, 0.12, 1.7, 0, 0.06, 0, 0x8d8a84); g.box(3.4, 1.9, 1.4, 0, 1.07, -0.05, 0xf4d880, { s: [1, 3, 1] });
  gable(g, 3.4, 1.4, 2.02, 0.5, 0x7a4a9a, 0.2); g.box(3.5, 0.1, 1.5, 0, 2.0, -0.05, 0x5a3a7a);
  windowAt(g, -1.05, 1.15, 0.66, 1.0, 0.9, 0xffffff, 0xcfe8f6); windowAt(g, 1.05, 1.15, 0.66, 1.0, 0.9, 0xffffff, 0xcfe8f6);
  g.box(0.9, 1.5, 0.06, 0, 0.87, 0.67, 0x8a5a3a); g.box(1.0, 1.6, 0.04, 0, 0.92, 0.66, 0xffffff);
  g.sph(0.04, 0.04, 0.04, 0.3, 0.85, 0.72, 0xe8c040, { s: [4, 3] });
  awning(g, 0, 1.62, 0.66, 3.3, 0.55, 0x7a4a9a, 0xf8f0ff, 12, 0.4);
  // window displays
  g.sph(0.18, 0.2, 0.15, -1.2, 0.72, 0.5, 0xb87a4a, { s: [6, 5] }); g.sph(0.11, 0.11, 0.1, -1.2, 0.98, 0.5, 0xb87a4a, { s: [6, 4] }); g.box(0.22, 0.2, 0.2, -0.85, 0.62, 0.5, 0xe84a6a); g.box(0.04, 0.2, 0.2, -0.85, 0.62, 0.5, 0xf2c030);
  g.box(0.2, 0.2, 0.2, 1.0, 0.62, 0.5, 0x3b82f6); g.sph(0.12, 0.12, 0.12, 1.3, 0.7, 0.5, 0xf2c030, { s: [6, 4] });
  // giant gift box on roof
  g.box(0.7, 0.55, 0.7, 1.2, 2.85, -0.2, 0xe84a6a); g.box(0.74, 0.1, 0.74, 1.2, 3.15, -0.2, 0xf06a8a); g.box(0.12, 0.55, 0.74, 1.2, 2.85, -0.2, 0xf6d030); g.box(0.74, 0.55, 0.12, 1.2, 2.85, -0.2, 0xf6d030);
  g.sph(0.2, 0.12, 0.12, 1.12, 3.28, -0.2, 0xf6d030, { s: [5, 4] }); g.sph(0.2, 0.12, 0.12, 1.28, 3.28, -0.2, 0xf6d030, { s: [5, 4] });
  g.limb(1.2, 2.5, -0.2, 1.2, 2.3, -0.2, 0.05, 0.05, 0x555555, { seg: 4 });
  // table outside
  g.box(0.8, 0.06, 0.4, -1.45, 0.55, 1.4, 0xb08050 - 0); g.limb(-1.7, 0.0, 1.3, -1.7, 0.55, 1.3, 0.025, 0.025, 0x6a4a2a, { seg: 4 }); g.limb(-1.2, 0.0, 1.3, -1.2, 0.55, 1.3, 0.025, 0.025, 0x6a4a2a, { seg: 4 }); g.sph(0.1, 0.1, 0.1, -1.6, 0.66, 1.4, 0xf06aa0, { s: [5, 4] }); g.sph(0.1, 0.1, 0.1, -1.4, 0.66, 1.4, 0x3b82f6, { s: [5, 4] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('GIFT SHOP', 0x7a4a9a, 0xfff4d0, 1.4, 0.34, 0, 1.78, 0.7, 0));
};
BLD.balloon_stand = function (grp0) {
  var g = B();
  stall(g, { w: 1.3, d: 1.2, h: 1.1, wall: 0xb08ae0, trim: 0xffffff, roof: 0x6a4aa8, awn1: 0xf06aa0, awn2: 0xf6e04a, counter: 0xf4ead0, bands: true });
  g.cyl(0.05, 0.05, 0.4, 0.5, 1.5, -0.3, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  var bg = B(), cols = [0xe84a4a, 0xf2c030, 0x3b82f6, 0x58b040, 0xf06aa0, 0xa060e0, 0xff8a3a, 0x30c8d8];
  for (var i = 0; i < 8; i++) { var a = i / 8 * TAU, r = i % 2 ? 0.35 : 0.55, hy = 0.9 + (i % 3) * 0.35; var bx = Math.sin(a) * r, bz = Math.cos(a) * r;
    bg.sph(0.28, 0.34, 0.28, bx, hy + 0.5, bz, cols[i], { s: [8, 6] }); bg.cone(0.04, 0.07, bx, hy + 0.12, bz, shade(cols[i], 0.8), { seg: 4, rot: [PI, 0, 0] }); bg.limb(bx, hy + 0.1, bz, 0, 0, 0, 0.008, 0.008, 0xf0f0f0, { seg: 3 }); }
  var bunch = grp(); bunch.position.set(0.5, 1.9, -0.3); bunch.add(mesh(bg.build())); grp0.add(bunch);
  grp0.userData.update = function (dt, t) { t = t || 0; bunch.rotation.z = Math.sin(t * 1.3) * 0.07; bunch.rotation.x = Math.sin(t * 1.0 + 1) * 0.05; bunch.rotation.y = Math.sin(t * 0.6) * 0.3; };
  grp0.add(labelMesh('BALLOONS', 0x6a4aa8, 0xffffff, 1.0, 0.22, 0, 0.32, 0.665, 0));
};
BLD.carousel = function (grp0) {
  var g = B();
  g.cyl(1.75, 1.85, 0.16, 0, 0.08, 0, 0x8d8a84, { seg: 16 }); g.cyl(1.2, 1.35, 0.1, 0, 0.19, 0, 0xa8a49c, { seg: 16 });
  grp0.add(mesh(g.build()));
  var sp = grp('spin'); grp0.add(sp);
  var s = B();
  s.cyl(1.65, 1.65, 0.14, 0, 0.3, 0, 0xc8923a, { seg: 16 }); s.cyl(1.7, 1.7, 0.06, 0, 0.38, 0, 0xe84a4a, { seg: 16 });
  s.cyl(0.22, 0.26, 2.7, 0, 1.7, 0, 0xf6e8b8, { seg: 10 }); s.cyl(0.35, 0.35, 0.1, 0, 0.45, 0, 0xe0b040, { seg: 10 });
  s.cyl(1.75, 1.75, 0.3, 0, 2.95, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 16) < 0.5 ? 0xf6e8b8 : 0x5a9ad8; }, { seg: 16 });
  s.cyl(0.02, 1.95, 1.0, 0, 3.6, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 12) < 0.5 ? 0xe84a4a : 0xfaf0d8; }, { seg: 12 });
  for (var i = 0; i < 12; i++) { var a = (i + 0.5) / 12 * TAU; s.sph(0.2, 0.12, 0.2, Math.sin(a) * 1.82, 3.05, Math.cos(a) * 1.82, i % 2 ? 0xe84a4a : 0xfaf0d8, { s: [5, 4] }); }
  s.sph(0.16, 0.16, 0.16, 0, 4.15, 0, 0xf2c030, { s: [6, 5] }); s.limb(0, 4.1, 0, 0, 4.5, 0, 0.03, 0.03, 0x555555, { seg: 4 }); s.box(0.35, 0.2, 0.02, 0.18, 4.4, 0, 0xe84a4a);
  for (i = 0; i < 6; i++) { var b = i / 6 * TAU, px = Math.sin(b) * 1.15, pz = Math.cos(b) * 1.15; s.cyl(0.03, 0.03, 2.55, px, 1.65, pz, 0xe0b040, { seg: 5 }); }
  for (i = 0; i < 8; i++) { var c = i / 8 * TAU; s.sph(0.07, 0.07, 0.07, Math.sin(c) * 1.75, 2.78, Math.cos(c) * 1.75, 0xfff4b0, { s: [4, 3] }); }
  sp.add(mesh(s.build()));
  var horses = [], hc = [0xf4f0e8, 0x8a5a3a, 0xf08ab0, 0x3a3a4a, 0xe8c070, 0x6a9ae0];
  var hg = unit('horse', function () { return null; });
  for (i = 0; i < 6; i++) {
    var h = B(), col = hc[i];
    h.sph(0.16, 0.2, 0.36, 0, 0.0, 0, col, { s: [7, 5] }); h.limb(0, 0.1, 0.25, 0, 0.42, 0.42, 0.08, 0.06, col, { seg: 5 }); h.sph(0.09, 0.1, 0.17, 0, 0.5, 0.5, col, { s: [6, 5] });
    h.box(0.04, 0.2, 0.05, 0, 0.45, 0.3, 0x3a2a20); h.limb(0, 0.05, -0.3, 0, -0.25, -0.42, 0.04, 0.02, 0x3a2a20, { seg: 4 }); h.box(0.34, 0.06, 0.3, 0, 0.17, -0.02, 0xe84a4a);
    for (var l = 0; l < 4; l++) h.limb((l % 2 ? 1 : -1) * 0.09, -0.12, l < 2 ? 0.2 : -0.2, (l % 2 ? 1 : -1) * 0.09, -0.4, l < 2 ? 0.3 : -0.3, 0.05, 0.035, col, { seg: 4 });
    var hm = grp(); var ang = i / 6 * TAU; hm.position.set(Math.sin(ang) * 1.15, 1.25, Math.cos(ang) * 1.15); hm.rotation.y = ang + PI / 2; hm.add(mesh(h.build())); sp.add(hm); horses.push(hm);
  }
  grp0.userData.update = function (dt, t) { sp.rotation.y += dt * 0.7; for (var j = 0; j < horses.length; j++) horses[j].position.y = 1.25 + 0.22 * Math.sin((t || 0) * 2.6 + j * PI); };
  grp0.userData.update(0, 0);
};
BLD.info_kiosk = function (grp0) {
  var g = B();
  g.cyl(0.95, 1.0, 0.12, 0, 0.06, 0, 0x8d8a84, { seg: 8 }); g.cyl(0.8, 0.8, 1.2, 0, 0.72, 0, 0x4ab0b8, { seg: 8, rot: [0, PI / 8, 0] }); g.cyl(0.84, 0.84, 0.1, 0, 0.14, 0, 0x2f8a90, { seg: 8, rot: [0, PI / 8, 0] });
  g.cyl(0.82, 0.82, 0.5, 0, 1.0, 0, 0xaee0f0, { seg: 8, rot: [0, PI / 8, 0] });
  g.cyl(0.9, 0.9, 0.08, 0, 1.36, 0, 0xffffff, { seg: 8, rot: [0, PI / 8, 0] }); g.cone(1.05, 0.55, 0, 1.68, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 8) < 0.5 ? 0x3b82f6 : 0xffffff; }, { seg: 8 });
  g.limb(0, 1.9, 0, 0, 2.2, 0, 0.05, 0.05, 0x555555, { seg: 5 });
  g.box(0.9, 0.06, 0.4, 0, 0.62, 0.9, 0xe8e0d0); for (var i = 0; i < 3; i++) g.box(0.2, 0.28, 0.02, -0.3 + i * 0.3, 0.78, 0.88, [0xe84a4a, 0xf2c030, 0x58b040][i]);
  grp0.add(mesh(g.build()));
  var disc = new T.Mesh(unit('disc', function () { return new T.CircleGeometry(0.45, 16); }), labelMat('i', 0x3b82f6, 0xffffff, 128, 128));
  disc.position.set(0, 2.45, 0); var holder = grp(); holder.add(disc); grp0.add(holder);
  var back = disc.clone(); back.rotation.y = PI; holder.add(back);
  var prev = grp0.userData.update; grp0.userData.update = function (dt, t) { holder.rotation.y = Math.sin((t || 0) * 0.8) * 0.5; };
};
BLD.keeper_hut = function (grp0) {
  var g = B(), wc = function (x, y, z) { return fract(y * 6) < 0.12 ? 0x7a5230 : 0x9a6a40; };
  g.box(1.8, 0.1, 1.7, 0, 0.05, 0, 0x8d8a84); g.box(1.6, 1.3, 1.4, 0, 0.75, 0, wc, { s: [1, 6, 1] });
  gable(g, 1.6, 1.4, 1.4, 0.6, 0x3f7a4a, 0.2);
  g.box(0.5, 1.0, 0.06, -0.35, 0.6, 0.72, 0x6a4a2a); g.sph(0.035, 0.035, 0.035, -0.2, 0.6, 0.77, 0xe8c040, { s: [4, 3] });
  windowAt(g, 0.4, 0.85, 0.72, 0.5, 0.4, 0xf4ead0, 0xa8d0e8); g.box(0.2, 0.4, 0.05, 0.1, 0.85, 0.75, 0x3f7a4a); g.box(0.2, 0.4, 0.05, 0.7, 0.85, 0.75, 0x3f7a4a);
  g.box(0.26, 0.5, 0.26, 0.5, 2.0, -0.3, 0x7a5a48);
  // bucket + hay + pitchfork
  g.cyl(0.14, 0.11, 0.24, 0.75, 0.12, 1.05, 0x8d98a4, { seg: 8 }); g.cyl(0.13, 0.13, 0.02, 0.75, 0.24, 1.05, 0xd8b24a, { seg: 8 });
  g.box(0.5, 0.3, 0.35, -0.5, 0.15, 1.1, 0xe0c060); g.box(0.52, 0.03, 0.37, -0.5, 0.15, 1.1, 0xb89a40); g.box(0.52, 0.03, 0.37, -0.5, 0.28, 1.1, 0xb89a40);
  g.limb(-0.95, 0.0, 0.8, -0.95, 1.4, 0.8, 0.02, 0.02, 0x8a6a3a, { seg: 4 }); g.box(0.16, 0.03, 0.03, -0.95, 1.42, 0.8, 0xaaaaaa);
  g.limb(0.6, 1.9, 0.6, 0.6, 2.6, 0.6, 0.02, 0.02, 0x555555, { seg: 4 }); g.box(0.3, 0.2, 0.02, 0.75, 2.5, 0.6, 0xe0a030);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('KEEPER', 0x3f7a4a, 0xfff4d0, 0.8, 0.2, 0, 1.28, 0.73, 0));
};
BLD.vet_clinic = function (grp0) {
  var g = B();
  g.box(3.7, 0.12, 3.7, 0, 0.06, 0, 0x8d8a84); g.box(3.4, 2.3, 2.6, 0, 1.27, -0.4, 0xf4f6f8, { s: [1, 3, 1] }); g.box(3.5, 0.15, 2.7, 0, 2.5, -0.4, 0x3b82c4); g.box(3.2, 0.12, 2.4, 0, 2.62, -0.4, 0xe0e6ec);
  g.box(2.2, 0.2, 1.0, 0, 0.1, 1.4, 0xc8c4bc);
  windowAt(g, -1.1, 1.4, 0.91, 0.8, 0.8, 0xffffff, 0xa8d8ee); windowAt(g, 1.1, 1.4, 0.91, 0.8, 0.8, 0xffffff, 0xa8d8ee);
  g.box(1.0, 1.6, 0.06, 0, 0.95, 0.92, 0xa8d8ee); g.box(1.1, 1.7, 0.05, 0, 1.0, 0.9, 0x3b82c4); g.box(0.04, 1.6, 0.08, 0, 0.95, 0.93, 0x3b82c4);
  awning(g, 0, 1.95, 0.9, 1.6, 0.8, 0x3b82c4, 0xffffff, 8, 0.38);
  g.box(0.9, 0.9, 0.9, 0, 0.45, 1.8, 0x8a6a3a, { s: [1, 1, 1] }); g.box(0.9, 0.9, 0.9, 0, 0.45, 1.8, 0x8a6a3a);
  // red cross sign on roof (front)
  g.cyl(0.55, 0.55, 0.12, 0, 3.15, 0.2, 0xffffff, { seg: 14, rot: [PI / 2, 0, 0] }); g.box(0.64, 0.2, 0.16, 0, 3.15, 0.22, 0xd8322e); g.box(0.2, 0.64, 0.16, 0, 3.15, 0.22, 0xd8322e);
  g.limb(-0.4, 2.62, 0.2, -0.3, 2.7, 0.2, 0.04, 0.04, 0x888, { seg: 4 }); g.limb(0.4, 2.62, 0.2, 0.3, 2.7, 0.2, 0.04, 0.04, 0x888, { seg: 4 });
  // side
  g.box(0.9, 0.6, 0.9, 1.4, 0.3, 1.3, 0x3f8a4a);
  g.sph(0.45, 0.4, 0.45, 1.4, 0.8, 1.3, 0x4a9a54, { s: [6, 4] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('VET CLINIC', 0x3b82c4, 0xffffff, 1.3, 0.3, 0, 2.28, 0.93, 0));
};
BLD.restaurant = function (grp0) {
  var g = B();
  g.box(3.8, 0.1, 3.8, 0, 0.05, 0, 0x8d8a84);
  g.box(3.4, 2.4, 2.0, 0, 1.3, -1.0, 0xf6e6c4, { s: [1, 3, 1] });
  gable(g, 3.4, 2.0, 2.5, 0.9, 0xb04a30, 0.25);
  g.box(0.4, 0.9, 0.4, -1.1, 3.0, -1.4, 0xa87a58); g.box(0.5, 0.08, 0.5, -1.1, 3.45, -1.4, 0x886040);
  windowAt(g, -1.15, 1.5, 0.02, 0.9, 1.0, 0x7a4a2a, 0xaedcf0); windowAt(g, 1.15, 1.5, 0.02, 0.9, 1.0, 0x7a4a2a, 0xaedcf0);
  g.box(1.1, 1.8, 0.06, 0, 1.0, 0.02, 0x7a4a2a); g.box(0.48, 1.4, 0.07, -0.26, 0.95, 0.04, 0xaedcf0); g.box(0.48, 1.4, 0.07, 0.26, 0.95, 0.04, 0xaedcf0);
  awning(g, 0, 2.15, 0.0, 3.2, 0.7, 0xc83a2a, 0xfaf0d8, 12, 0.35);
  for (var s = -1; s <= 1; s += 2) g.limb(s * 1.55, 2.0, 0.7, s * 1.55, 0.1, 0.7, 0.04, 0.04, 0x6a4a2a, { seg: 5 });
  // terrace tables with umbrellas
  g.box(3.6, 0.06, 1.5, 0, 0.1, 1.25, 0xb89870);
  for (var i = 0; i < 2; i++) { var x = i ? 0.95 : -0.95; g.cyl(0.4, 0.4, 0.05, x, 0.8, 1.3, 0xf4ead0, { seg: 10 }); g.limb(x, 0.1, 1.3, x, 0.8, 1.3, 0.04, 0.04, 0x4a3a2a, { seg: 5 }); g.limb(x, 0.8, 1.3, x, 2.0, 1.3, 0.025, 0.025, 0x555555, { seg: 4 });
    g.cone(0.85, 0.35, x, 2.05, 1.3, function (px, py, pz) { return fract(Math.atan2(px - x, pz - 1.3) / TAU * 8) < 0.5 ? 0xe84a4a : 0xfaf0d8; }, { seg: 8 });
    for (var c = 0; c < 2; c++) { var cz = 1.3 + (c ? 0.6 : -0.6) * 0; g.box(0.3, 0.05, 0.3, x + (c ? 0.6 : -0.6), 0.45, cz, 0x8a5a3a); g.box(0.3, 0.3, 0.04, x + (c ? 0.6 : -0.6), 0.62, cz + (c ? 0.15 : 0.15), 0x8a5a3a); g.limb(x + (c ? 0.6 : -0.6), 0.1, cz, x + (c ? 0.6 : -0.6), 0.45, cz, 0.025, 0.025, 0x4a3a2a, { seg: 4 }); } }
  g.sph(0.2, 0.2, 0.2, 1.7, 0.3, 1.7, 0x3f8a4a, { s: [5, 4] }); g.sph(0.2, 0.2, 0.2, -1.7, 0.3, 1.7, 0x3f8a4a, { s: [5, 4] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('RESTAURANT', 0x7a2a1a, 0xfff4d0, 1.7, 0.34, 0, 2.55, 0.62, 0, -0.35));
};
BLD.education_centre = function (grp0) {
  var g = B();
  g.box(3.8, 0.12, 3.8, 0, 0.06, 0, 0x8d8a84);
  g.box(3.4, 2.0, 2.2, 0, 1.12, -0.6, 0xe6d2a0, { s: [1, 3, 1] }); g.box(3.5, 0.12, 2.3, 0, 2.18, -0.6, 0x4f8a5a); g.box(3.2, 0.5, 2.0, 0, 2.5, -0.6, 0xaed8ea, { rot: [0.0, 0, 0] });
  g.box(1.6, 1.6, 1.6, 0, 3.1, -0.9, 0xe6d2a0); g.cone(1.3, 0.8, 0, 4.3, -0.9, 0x4f8a5a, { seg: 4, rot: [0, PI / 4, 0] });
  g.cyl(0.35, 0.35, 0.06, 0, 3.55, -0.08, 0xffffff, { seg: 14, rot: [PI / 2, 0, 0] }); g.box(0.04, 0.26, 0.04, 0, 3.58, -0.03, 0x222222); g.box(0.2, 0.04, 0.04, 0.08, 3.5, -0.03, 0x222222);
  windowAt(g, -1.2, 1.3, 0.52, 0.8, 1.0, 0x6a4a2a, 0xaedcf0); windowAt(g, 1.2, 1.3, 0.52, 0.8, 1.0, 0x6a4a2a, 0xaedcf0);
  g.box(1.0, 1.7, 0.06, 0, 0.97, 0.52, 0x6a4a2a); g.box(0.4, 1.4, 0.07, -0.24, 0.95, 0.54, 0xaedcf0); g.box(0.4, 1.4, 0.07, 0.24, 0.95, 0.54, 0xaedcf0);
  for (var s = -1; s <= 1; s += 2) { g.cyl(0.14, 0.14, 1.9, s * 0.75, 1.0, 0.85, 0xf2ead8, { seg: 8 }); g.box(0.4, 0.1, 0.4, s * 0.75, 0.08, 0.85, 0xf2ead8); g.box(0.4, 0.1, 0.4, s * 0.75, 2.0, 0.85, 0xf2ead8); }
  g.box(2.0, 0.12, 0.7, 0, 2.1, 0.85, 0xe6d2a0); g.box(1.8, 0.2, 0.6, 0, 0.1, 1.3, 0xc8c4bc); g.box(1.4, 0.2, 0.4, 0, 0.2, 1.1, 0xc8c4bc);
  // globe
  g.cyl(0.22, 0.28, 0.5, -1.4, 0.25, 1.5, 0x8a7a68, { seg: 8 }); g.sph(0.38, 0.38, 0.38, -1.4, 0.88, 1.5, function (x, y, z) { return hash3(Math.floor(x * 5), Math.floor(y * 5), Math.floor(z * 5)) > 0.55 ? 0x58b040 : 0x3b82f6; }, { s: [10, 8] });
  g.cyl(0.02, 0.02, 0.9, -1.4, 0.88, 1.5, 0x666666, { seg: 4, rot: [0, 0, 0.4] });
  // banner flags
  g.limb(1.6, 1.0, 1.2, 1.6, 2.6, 1.2, 0.03, 0.03, 0x666666, { seg: 4 }); g.box(0.04, 0.8, 0.4, 1.6, 2.2, 1.4, 0xe84a4a);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('LEARN', 0x4f8a5a, 0xfff4d0, 1.0, 0.28, 0, 2.55, 0.9, 0));
};

function pulseMat(col, em) { return new T.MeshLambertMaterial({ color: col, emissive: em, transparent: true, opacity: 0.8, depthWrite: false }); }
function chainUpd(grp0, fn) { var prev = grp0.userData.update; grp0.userData.update = function (dt, t) { if (prev) prev(dt, t); fn(dt, t || 0); }; }
function post(g, x, z, y0, y1, col, r) { g.limb(x, y0, z, x, y1, z, r || 0.05, r || 0.05, col, { seg: 5 }); }
function railing(g, x0, z0, x1, z1, y, col) { post(g, x0, z0, y - 0.9, y, col, 0.04); post(g, x1, z1, y - 0.9, y, col, 0.04); g.limb(x0, y, z0, x1, y, z1, 0.03, 0.03, col, { seg: 4 }); g.limb(x0, y - 0.45, z0, x1, y - 0.45, z1, 0.025, 0.025, col, { seg: 4 }); }

BLD.viewing_platform = function (grp0) { // 4x2 m
  var g = B(), wd = 0x9a6a40, wd2 = 0x7a5230;
  g.box(3.9, 0.1, 1.9, 0, 0.05, 0, 0x8d8a84);
  for (var a = -1; a <= 1; a += 2) for (var b = -1; b <= 1; b += 2) post(g, a * 1.7, b * 0.7, 0.05, 2.9, wd2, 0.09);
  for (var k = 0; k < 2; k++) { g.limb(-1.7, 0.2 + k * 1.1, 0.7, 1.7, 0.2 + k * 1.1 + 0.0, 0.7, 0.03, 0.03, wd2, { seg: 4 }); }
  g.box(3.8, 0.14, 1.7, 0, 1.6, 0, wd); for (k = 0; k < 8; k++) g.box(0.02, 0.02, 1.72, -1.6 + k * 0.46, 1.69, 0, wd2);
  railing(g, 0.1, 0.8, 1.9, 0.8, 2.7, wd2); railing(g, -1.9, -0.8, 1.9, -0.8, 2.7, wd2); railing(g, -1.9, -0.8, -1.9, 0.8, 2.7, wd2); railing(g, 1.9, -0.8, 1.9, 0.8, 2.7, wd2);
  // staircase along the front face (left to right)
  for (k = 0; k < 5; k++) g.box(0.36, 0.3 * (k + 1), 0.4, -1.75 + k * 0.36, 0.15 * (k + 1), 0.95, wd);
  // roof canopy
  for (a = -1; a <= 1; a += 2) for (b = -1; b <= 1; b += 2) post(g, a * 1.5, b * 0.6, 1.6, 3.3, wd2, 0.05);
  g.box(3.6, 0.1, 1.6, 0, 3.35, 0, 0x3f7a4a); g.cone(2.0, 0.5, 0, 3.7, 0, 0x4a8a56, { seg: 4, rot: [0, PI / 4, 0], sx: 1, sz: 0.5 });
  // binoculars on posts
  for (a = 0; a < 2; a++) { var bx = -0.5 + a * 1.4; post(g, bx, 0.6, 1.67, 2.3, 0x555a60, 0.04); g.cyl(0.07, 0.07, 0.3, bx - 0.07, 2.35, 0.7, 0x2a2e34, { seg: 6, rot: [PI / 2, 0, 0] }); g.cyl(0.07, 0.07, 0.3, bx + 0.07, 2.35, 0.7, 0x2a2e34, { seg: 6, rot: [PI / 2, 0, 0] }); }
  g.box(0.9, 0.5, 0.04, 1.2, 2.0, 0.78, 0xf4ead0);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('LOOKOUT', 0x3f7a4a, 0xfff4d0, 1.0, 0.24, -0.4, 2.95, 0.62, 0));
};

BLD.emergency_bunker = function (grp0) { // 4x4 m
  var g = B(), cn = function (x, y, z) { return hash3(Math.floor(x * 5), Math.floor(y * 4), Math.floor(z * 5)) > 0.7 ? 0x8a8c8a : 0x9a9c9a; };
  var hz = function (x, y, z) { return fract((x + y) * 3.2) < 0.5 ? 0xf2c030 : 0x2a2a2a; };
  g.box(3.9, 0.12, 3.9, 0, 0.06, 0, 0x7a7c7a);
  g.box(3.2, 1.8, 2.6, 0, 1.0, -0.4, cn, { s: [1, 2, 1] }); g.box(3.4, 0.25, 2.8, 0, 2.0, -0.4, 0x7a7c7a);
  g.box(3.0, 0.2, 2.4, 0, 2.25, -0.4, 0x5a5c5a, { rot: [0.0, 0, 0] });
  g.box(3.3, 0.3, 0.06, 0, 0.35, 0.92, hz, { s: [24, 1, 1] }); g.box(3.3, 0.3, 0.06, 0, 1.75, 0.92, hz, { s: [24, 1, 1] });
  g.box(1.5, 1.4, 0.2, 0, 0.8, 0.95, 0x4a5058); g.box(1.3, 1.2, 0.1, 0, 0.8, 1.05, 0x6a7078); g.box(1.4, 0.06, 0.1, 0, 0.8, 1.12, 0x2a2e34);
  g.cyl(0.14, 0.14, 0.05, 0.0, 1.1, 1.12, 0xc83a2a, { seg: 8, rot: [PI / 2, 0, 0] });
  g.box(0.8, 0.3, 0.05, -1.1, 1.3, 0.93, 0xf4ead0); g.box(0.3, 0.3, 0.06, 1.2, 1.1, 0.93, 0xd8322e); g.box(0.08, 0.2, 0.07, 1.2, 1.1, 0.93, 0xffffff); g.box(0.2, 0.08, 0.07, 1.2, 1.1, 0.93, 0xffffff);
  g.box(0.7, 0.45, 0.04, 1.0, 1.4, 0.93, 0x2a3038);
  for (var i = 0; i < 5; i++) g.box(1.4 - i * 0.04, 0.06, 0.3, 0, 0.1 + i * 0.0, 1.2 + 0.0, 0x8a8c8a);
  g.cyl(0.35, 0.35, 0.5, 0.9, 2.6, -1.0, 0x6a6c6a, { seg: 8 }); g.cyl(0.4, 0.4, 0.05, 0.9, 2.85, -1.0, 0x4a4c4a, { seg: 8 });
  post(g, -1.2, -1.2, 2.35, 3.6, 0x555a60, 0.04); g.limb(-1.2, 3.4, -1.2, -0.7, 3.7, -1.2, 0.02, 0.02, 0x555a60, { seg: 3 }); g.box(0.35, 0.22, 0.04, -1.38, 3.45, -1.2, 0xe0a030);
  for (i = 0; i < 4; i++) g.box(0.3, 0.3, 0.3, -1.5 + i * 0.0, 0.25 + i * 0.0, 1.6 + (i % 2) * 0.0, 0x4a6a3a, { rot: [0, 0.2 * i, 0] });
  g.cyl(0.1, 0.1, 0.9, 1.7, 0.45, 1.5, 0xd8322e, { seg: 6 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('EMERGENCY', 0xc83a2a, 0xffffff, 1.4, 0.26, -0.5, 1.9, 0.98, 0));
  var bk = new T.Mesh(unit('ebeacon', function () { return new T.SphereGeometry(0.22, 8, 6); }), pulseMat(0xff3a2a, 0xff1a0a)); bk.position.set(0, 3.45, -0.4);
  var rot = grp(); rot.position.set(0, 2.45, -0.4); var bb = B(); bb.cyl(0.3, 0.3, 0.2, 0, 0.1, 0, 0x4a4c4a, { seg: 8 }); bb.sph(0.3, 0.3, 0.3, 0, 0.45, 0, 0xff3a2a, { s: [8, 5] }); grp0.add(mesh(bb.build()));
  var rb = B(); rb.box(1.1, 0.05, 0.12, 0, 0.45, 0, 0xffe0c0); rot.add(mesh(rb.build())); grp0.add(rot);
  var lg = new T.Mesh(unit('ebeaconl', function () { return new T.SphereGeometry(0.42, 8, 6); }), pulseMat(0xff3a2a, 0xff1a0a)); lg.position.set(0, 2.95, -0.4); grp0.add(lg);
  chainUpd(grp0, function (dt, tm) { rot.rotation.y = tm * 4; var s = Math.max(0, Math.sin(tm * 4.5)); lg.material.opacity = 0.1 + 0.5 * s; });
  grp0.userData.update(0, 0);
};

BUILDING_API = {
  building: function (id) {
    var b = BLD[id]; if (!b) return null;
    var grp0 = grp(id); grp0.userData.buildingId = id;
    b(grp0);
    var def = BLD_DEF[id] || [1, 1], w = def[0], h = def[1];
    try { var D = Z.DATA && Z.DATA.buildings; if (D) for (var i = 0; i < D.length; i++) if (D[i].id === id) { w = D[i].w || w; h = D[i].h || h; break; } } catch (e) { }
    if (w !== def[0] || h !== def[1]) { grp0.scale.set(w / def[0], 1, h / def[1]); }
    grp0.userData.footprint = { w: w, h: h };
    return grp0;
  }
};
var BUILDING_API;

var API = {};
// ================================================================ THUMBNAILS
var thumbR = null, thumbFail = false, thumbScene = null, thumbCam = null, thumbCache = {};
function thumbInit() {
  if (thumbR || thumbFail) return !!thumbR;
  try {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    thumbR = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!thumbR || !thumbR.getContext()) throw new Error('no gl');
    thumbR.setClearColor(0x000000, 0);
    thumbScene = new T.Scene();
    thumbScene.add(new T.HemisphereLight(0xffffff, 0x8a9070, 0.85));
    var d = new T.DirectionalLight(0xfff2dc, 0.75); d.position.set(-3, 6, 5); thumbScene.add(d);
    thumbCam = new T.PerspectiveCamera(28, 1, 0.1, 200);
  } catch (e) { thumbR = null; thumbFail = true; return false; }
  return true;
}
API.thumbnail = function (kind, id, size) {
  size = size || 96; var key = kind + '|' + id + '|' + size; if (thumbCache[key]) return thumbCache[key];
  if (!thumbInit()) return null;
  var obj = null, upd = null;
  try {
    if (kind === 'animal') { var a = API.createAnimal(id, { sex: 'm' }); if (!a) return null; obj = a.group; for (var i = 0; i < 6; i++) a.update(0.05, { state: 'idle', speed: 0 }); }
    else if (kind === 'scenery') obj = API.createScenery(id);
    else if (kind === 'building') obj = API.createBuilding(id);
    else if (kind === 'guest') { var gu = API.createGuest(+id || 1); obj = gu.group; gu.update(0.05, { state: 'idle', speed: 0 }); }
    else if (kind === 'staff') { var st = API.createStaff(id); obj = st.group; st.update(0.05, { state: 'idle', speed: 0 }); }
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    var bb = new T.Box3().setFromObject(obj), c = new T.Vector3(), sz = new T.Vector3(); bb.getCenter(c); bb.getSize(sz);
    var r = Math.max(sz.x, sz.z * 0.9, sz.y) * 0.62 + 0.001, dist = r / Math.tan(14 * PI / 180);
    var az = kind === 'animal' ? 0.85 : 0.7, el = 0.32;
    thumbCam.position.set(c.x + Math.sin(az) * dist * Math.cos(el), c.y + Math.sin(el) * dist, c.z + Math.cos(az) * dist * Math.cos(el)); thumbCam.lookAt(c);
    thumbScene.add(obj); thumbR.setSize(size, size, false); thumbR.render(thumbScene, thumbCam);
    var url = thumbR.domElement.toDataURL('image/png'); thumbScene.remove(obj);
    return (thumbCache[key] = url);
  } catch (e) { try { if (obj) thumbScene.remove(obj); } catch (e2) { } return null; }
};

// ================================================================ API
API.createAnimal = function (id, opts) {
  opts = opts || {};
  if (QUADS[id]) return createQuad(QUADS[id], opts);
  if (OTHERS[id]) return OTHERS[id](opts);
  var fb = grp('animal'); fb.add(mesh(B().box(0.6, 0.5, 1.0, 0, 0.5, 0, 0xaa8866).build())); return { group: fb, update: function () { }, height: 1 };
};
API.createGuest = function (seed) { return API_people.guest(seed); };
API.createStaff = function (type) { return API_people.staff(type); };
function fallbackBox() { var f = grp('missing'); f.add(mesh(B().box(1.2, 1.2, 1.2, 0, 0.6, 0, 0xc08060).build())); return f; }
API.createScenery = function (id) { return SCENERY_API.scenery(id) || fallbackBox(); };
API.createBuilding = function (id) { return BUILDING_API.building(id) || fallbackBox(); };
API.makeBuilding = API.createBuilding;
API.sceneryInstancing = SCENERY_API.instancing;
API.speciesIds = function () { return Object.keys(QUADS).concat(Object.keys(OTHERS)); };
return API;
})();
