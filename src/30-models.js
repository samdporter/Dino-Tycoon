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

// ---------------------------------------------------------------- geometry builder (smooth/flat shaded, vertex coloured, merged)
var DETAIL = 1.5;
var _ma = new T.Matrix4(), _qa = new T.Quaternion(), _ea = new T.Euler(), _va = new T.Vector3(), _sa = new T.Vector3(), _nm = T.Matrix3 ? new T.Matrix3() : null;
var _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _n = new T.Vector3(), _e1 = new T.Vector3(), _e2 = new T.Vector3();
var _na = new T.Vector3(), _nb = new T.Vector3(), _nc = new T.Vector3();
var _up = new T.Vector3(0, 1, 0), _dir = new T.Vector3();
var unitCache = {};
function unit(key, fn) { return unitCache[key] || (unitCache[key] = fn()); }
function unitSph(ws, hs) {
  ws = Math.max(4, Math.round(ws * DETAIL)); hs = Math.max(3, Math.round(hs * DETAIL));
  return unit('s' + ws + 'x' + hs, function () { var g = new T.SphereGeometry(1, ws, hs).toNonIndexed(); if (g.userData) g.userData._smooth = true; return g; });
}
function unitBox(a, b, c) { return unit('b' + a + b + c, function () { return new T.BoxGeometry(1, 1, 1, a, b, c).toNonIndexed(); }); }
function unitCyl(seg, ratio, hs) {
  if (seg >= 5) seg = Math.round(seg * DETAIL);
  return unit('c' + seg + '_' + ratio + '_' + hs, function () { var g = new T.CylinderGeometry(ratio, 1, 1, seg, hs || 1).toNonIndexed(); if (g.userData) g.userData._smooth = seg >= 5; return g; });
}

function Builder() { this.p = []; this.n = []; this.c = []; }
Builder.prototype.add = function (geo, x, y, z, sx, sy, sz, rot, col, quat) {
  if (quat) _qa.copy(quat); else { _ea.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'XYZ'); _qa.setFromEuler(_ea); }
  _ma.compose(_va.set(x, y, z), _qa, _sa.set(sx, sy, sz));
  var pa = geo.attributes.position.array, flip = sx * sy * sz < 0, fn = typeof col === 'function', r = 0, g = 0, b = 0;
  var smooth = !!(_nm && geo.userData && geo.userData._smooth && geo.attributes.normal && _na.applyMatrix3), normArr = smooth ? geo.attributes.normal.array : null;
  if (smooth) _nm.getNormalMatrix(_ma);
  if (!fn) { r = (col >> 16 & 255) / 255; g = (col >> 8 & 255) / 255; b = (col & 255) / 255; }
  for (var i = 0; i < pa.length; i += 9) {
    _a.set(pa[i], pa[i + 1], pa[i + 2]).applyMatrix4(_ma);
    _b.set(pa[i + 3], pa[i + 4], pa[i + 5]).applyMatrix4(_ma);
    _c.set(pa[i + 6], pa[i + 7], pa[i + 8]).applyMatrix4(_ma);
    if (flip) { _n.copy(_b); _b.copy(_c); _c.copy(_n); }
    _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _n.crossVectors(_e1, _e2);
    var l = _n.length(); if (l < 1e-9) continue; _n.divideScalar(l);
    if (smooth) {
      _na.set(normArr[i], normArr[i + 1], normArr[i + 2]).applyMatrix3(_nm).normalize();
      _nb.set(normArr[i + 3], normArr[i + 4], normArr[i + 5]).applyMatrix3(_nm).normalize();
      _nc.set(normArr[i + 6], normArr[i + 7], normArr[i + 8]).applyMatrix3(_nm).normalize();
      if (flip) { _e1.copy(_nb); _nb.copy(_nc); _nc.copy(_e1); }
    } else {
      _na.copy(_n); _nb.copy(_n); _nc.copy(_n);
    }
    var aoA = clamp(0.92 + 0.10 * _na.y, 0.80, 1.04), aoB = clamp(0.92 + 0.10 * _nb.y, 0.80, 1.04), aoC = clamp(0.92 + 0.10 * _nc.y, 0.80, 1.04);
    this.p.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    this.n.push(_na.x, _na.y, _na.z, _nb.x, _nb.y, _nb.z, _nc.x, _nc.y, _nc.z);
    if (fn) {
      if (smooth) {
        var ha = col(_a.x, _a.y, _a.z, _na.x, _na.y, _na.z);
        var hb = col(_b.x, _b.y, _b.z, _nb.x, _nb.y, _nb.z);
        var hc = col(_c.x, _c.y, _c.z, _nc.x, _nc.y, _nc.z);
        this.c.push(
          (ha >> 16 & 255) / 255 * aoA, (ha >> 8 & 255) / 255 * aoA, (ha & 255) / 255 * aoA,
          (hb >> 16 & 255) / 255 * aoB, (hb >> 8 & 255) / 255 * aoB, (hb & 255) / 255 * aoB,
          (hc >> 16 & 255) / 255 * aoC, (hc >> 8 & 255) / 255 * aoC, (hc & 255) / 255 * aoC
        );
      } else {
        var h = col((_a.x + _b.x + _c.x) / 3, (_a.y + _b.y + _c.y) / 3, (_a.z + _b.z + _c.z) / 3, _n.x, _n.y, _n.z);
        r = (h >> 16 & 255) / 255 * aoA; g = (h >> 8 & 255) / 255 * aoA; b = (h & 255) / 255 * aoA;
        this.c.push(r, g, b, r, g, b, r, g, b);
      }
    } else {
      this.c.push(r * aoA, g * aoA, b * aoA, r * aoB, g * aoB, b * aoB, r * aoC, g * aoC, b * aoC);
    }
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
  if (seg >= 5) seg = Math.round(seg * DETAIL);
  // cylinder: top = +y (r2 end), bottom = -y (r1 end); when ratio<1 top narrower
  var geo = unit('l' + seg + '_' + hs + '_' + Math.round(ratio * 1000) / 1000 + '_' + Math.round(r1 / rm * 1000) / 1000, function () {
    var g = new T.CylinderGeometry(ratio, r1 / rm, 1, seg, hs).toNonIndexed(); if (g.userData) g.userData._smooth = seg >= 5; return g;
  });
  return this.add(geo, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, rm * (o.sx || 1), len, rm * (o.sz || 1), null, col, q);
};

// lathe-style body along z. o: {z0,z1,n,seg, rxA,rxB, ryA,ryB, ycA,ycB, pw, belly}
Builder.prototype.torso = function (o, col) {
  var n = Math.max(4, Math.round((o.n || 16) * DETAIL)), seg = Math.max(6, Math.round((o.seg || 12) * DETAIL)), rings = [], i, k, pw = o.pw || 0.55;
  for (i = 0; i <= n; i++) {
    var t = i / n, e = Math.pow(Math.sqrt(max(0, 1 - (2 * t - 1) * (2 * t - 1))), pw);
    rings.push({ z: lerp(o.z0, o.z1, t), rx: lerp(o.rxA, o.rxB, t) * e, ry: lerp(o.ryA, o.ryB, t) * e, yc: lerp(o.ycA, o.ycB, t) - (o.belly || 0) * Math.sin(PI * t) });
  }
  var fn = typeof col === 'function', P = new Float32Array((n + 1) * seg * 3), CC = new Float32Array((n + 1) * seg * 3), N = new Float32Array((n + 1) * seg * 3);
  var cr = 0, cg = 0, cb = 0; if (!fn) { cr = (col >> 16 & 255) / 255; cg = (col >> 8 & 255) / 255; cb = (col & 255) / 255; }
  for (i = 0; i <= n; i++) for (k = 0; k < seg; k++) {
    var a = k / seg * TAU, sa = Math.sin(a), ca = Math.cos(a), rg = rings[i], idx = (i * seg + k) * 3;
    P[idx] = rg.rx * sa; P[idx + 1] = rg.yc + rg.ry * ca; P[idx + 2] = rg.z;
  }
  var ring = function (ii, kk) { return ((ii * seg) + ((kk + seg) % seg)) * 3; };
  for (i = 0; i <= n; i++) {
    var ia = Math.max(0, i - 1), ib = Math.min(n, i + 1), rg2 = rings[i];
    for (k = 0; k < seg; k++) {
      var idx2 = (i * seg + k) * 3;
      var a1 = ring(ia, k), b1 = ring(ib, k), a2 = ring(i, k - 1), b2 = ring(i, k + 1);
      _e1.set(P[b1] - P[a1], P[b1 + 1] - P[a1 + 1], P[b1 + 2] - P[a1 + 2]);
      _e2.set(P[b2] - P[a2], P[b2 + 1] - P[a2 + 1], P[b2 + 2] - P[a2 + 2]);
      _n.crossVectors(_e1, _e2); var L = _n.length();
      _a.set(P[idx2], P[idx2 + 1] - rg2.yc, 0);
      if (L < 1e-9) { if (_a.lengthSq() < 1e-12) _n.set(0, 0, i === 0 ? -1 : 1); else _n.copy(_a).normalize(); }
      else { _n.divideScalar(L); if (_a.lengthSq() > 1e-10 && _n.dot(_a) < 0) _n.negate(); }
      N[idx2] = _n.x; N[idx2 + 1] = _n.y; N[idx2 + 2] = _n.z;
      var ao = clamp(0.92 + 0.10 * _n.y, 0.80, 1.04);
      if (fn) {
        var h = col(P[idx2], P[idx2 + 1], P[idx2 + 2], _n.x, _n.y, _n.z);
        CC[idx2] = (h >> 16 & 255) / 255 * ao; CC[idx2 + 1] = (h >> 8 & 255) / 255 * ao; CC[idx2 + 2] = (h & 255) / 255 * ao;
      } else {
        CC[idx2] = cr * ao; CC[idx2 + 1] = cg * ao; CC[idx2 + 2] = cb * ao;
      }
    }
  }
  var pushV = function (q) { this.p.push(P[q], P[q + 1], P[q + 2]); this.n.push(N[q], N[q + 1], N[q + 2]); this.c.push(CC[q], CC[q + 1], CC[q + 2]); }.bind(this);
  var tri = function (qa, qb, qc) {
    _e1.set(P[qb] - P[qa], P[qb + 1] - P[qa + 1], P[qb + 2] - P[qa + 2]);
    _e2.set(P[qc] - P[qa], P[qc + 1] - P[qa + 1], P[qc + 2] - P[qa + 2]);
    _n.crossVectors(_e1, _e2); if (_n.lengthSq() < 1e-14) return;
    var dn = _n.x * (N[qa] + N[qb] + N[qc]) + _n.y * (N[qa + 1] + N[qb + 1] + N[qc + 1]) + _n.z * (N[qa + 2] + N[qb + 2] + N[qc + 2]);
    if (dn >= 0) { pushV(qa); pushV(qb); pushV(qc); } else { pushV(qa); pushV(qc); pushV(qb); }
  };
  for (i = 0; i < n; i++) for (k = 0; k < seg; k++) {
    var q00 = ring(i, k), q01 = ring(i, k + 1), q10 = ring(i + 1, k), q11 = ring(i + 1, k + 1);
    tri(q00, q10, q11); tri(q00, q11, q01);
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

// ================================================================ LOFT / SKIN / PLATES  (organic geometry for dinosaurs)
function smooth(x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
// keys: [[s, rx, ry, yc], ...] ascending in s ; hermite interpolation with local-extremum flattening (no overshoot)
function profAt(K, s) {
  var n = K.length;
  if (s <= K[0][0]) return [K[0][1], K[0][2], K[0][3]];
  if (s >= K[n - 1][0]) return [K[n - 1][1], K[n - 1][2], K[n - 1][3]];
  var i = 0; while (i < n - 2 && s > K[i + 1][0]) i++;
  var a = K[i], b = K[i + 1], h = b[0] - a[0], t = (s - a[0]) / h, p0 = K[i > 0 ? i - 1 : 0], p3 = K[i + 2 < n ? i + 2 : n - 1];
  var t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2, out = [0, 0, 0];
  for (var c = 1; c <= 3; c++) {
    var m1 = 0, m2 = 0, d0 = a[c] - p0[c], d1 = b[c] - a[c], d2 = p3[c] - b[c];
    if (i > 0 && d0 * d1 > 0) m1 = (b[c] - p0[c]) / (b[0] - p0[0]) * h;
    if (i + 2 < n && d1 * d2 > 0) m2 = (p3[c] - a[c]) / (p3[0] - a[0]) * h;
    out[c - 1] = h00 * a[c] + h10 * m1 + h01 * b[c] + h11 * m2;
  }
  if (out[0] < 0) out[0] = 0; if (out[1] < 0) out[1] = 0;
  return out;
}
var _lp = new T.Vector3(), _ln = new T.Vector3(), _l1 = new T.Vector3(), _l2 = new T.Vector3();
// shared grid & triangle emission helpers for loft / tube / lathe / wingMembrane / bevelBox / extrude
function _pushTriAO(b, ax, ay, az, nax, nay, naz, ca, bx, by, bz, nbx, nby, nbz, cb, cx, cy, cz, ncx, ncy, ncz, cc) {
  _l1.set(bx - ax, by - ay, bz - az); _l2.set(cx - ax, cy - ay, cz - az); _ln.crossVectors(_l1, _l2);
  if (_ln.lengthSq() < 1e-14) return;
  var dn = _ln.x * (nax + nbx + ncx) + _ln.y * (nay + nby + ncy) + _ln.z * (naz + nbz + ncz);
  if (dn >= 0) {
    b.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    b.n.push(nax, nay, naz, nbx, nby, nbz, ncx, ncy, ncz);
    b.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  } else {
    b.p.push(ax, ay, az, cx, cy, cz, bx, by, bz);
    b.n.push(nax, nay, naz, ncx, ncy, ncz, nbx, nby, nbz);
    b.c.push(ca[0], ca[1], ca[2], cc[0], cc[1], cc[2], cb[0], cb[1], cb[2]);
  }
}
function _evalColAO(col, x, y, z, nx, ny, nz, t, v) {
  var h = typeof col === 'function' ? col(x, y, z, nx, ny, nz, t, v) : col;
  var ao = clamp(0.92 + 0.10 * ny, 0.80, 1.04);
  return [(h >> 16 & 255) / 255 * ao, (h >> 8 & 255) / 255 * ao, (h & 255) / 255 * ao];
}
function _emitGrid(b, P, N, CC, R, S, wrapS) {
  var cols = wrapS ? S : S + 1;
  var ring = function (ii, kk) { return (ii * cols + (wrapS ? ((kk + S) % S) : kk)) * 3; };
  var pushV = function (q) { b.p.push(P[q], P[q + 1], P[q + 2]); b.n.push(N[q], N[q + 1], N[q + 2]); b.c.push(CC[q], CC[q + 1], CC[q + 2]); };
  var tri = function (qa, qb, qc) {
    _l1.set(P[qb] - P[qa], P[qb + 1] - P[qa + 1], P[qb + 2] - P[qa + 2]);
    _l2.set(P[qc] - P[qa], P[qc + 1] - P[qa + 1], P[qc + 2] - P[qa + 2]);
    _ln.crossVectors(_l1, _l2);
    if (_ln.lengthSq() < 1e-14) return;
    var dn = _ln.x * (N[qa] + N[qb] + N[qc]) + _ln.y * (N[qa + 1] + N[qb + 1] + N[qc + 1]) + _ln.z * (N[qa + 2] + N[qb + 2] + N[qc + 2]);
    if (dn >= 0) { pushV(qa); pushV(qb); pushV(qc); } else { pushV(qa); pushV(qc); pushV(qb); }
  };
  for (var i = 0; i < R; i++) for (var k = 0; k < S; k++) {
    var q00 = ring(i, k), q01 = ring(i, k + 1), q10 = ring(i + 1, k), q11 = ring(i + 1, k + 1);
    tri(q00, q10, q11); tri(q00, q11, q01);
  }
}
function _emitQuadFlat(b, p0, p1, p2, p3, nx, ny, nz, col, smoothK, cx, cy, cz, hx, hy, hz) {
  var pts = [p0, p1, p2, p3], norms = [], cols = [];
  for (var i = 0; i < 4; i++) {
    var p = pts[i];
    if (smoothK > 0) {
      _na.set((p[0] - cx) / hx, (p[1] - cy) / hy, (p[2] - cz) / hz).normalize();
      _nb.set(lerp(nx, _na.x, smoothK), lerp(ny, _na.y, smoothK), lerp(nz, _na.z, smoothK)).normalize();
      norms.push([_nb.x, _nb.y, _nb.z]);
    } else {
      norms.push([nx, ny, nz]);
    }
    cols.push(_evalColAO(col, p[0], p[1], p[2], norms[i][0], norms[i][1], norms[i][2]));
  }
  _pushTriAO(b, p0[0], p0[1], p0[2], norms[0][0], norms[0][1], norms[0][2], cols[0], p1[0], p1[1], p1[2], norms[1][0], norms[1][1], norms[1][2], cols[1], p2[0], p2[1], p2[2], norms[2][0], norms[2][1], norms[2][2], cols[2]);
  _pushTriAO(b, p0[0], p0[1], p0[2], norms[0][0], norms[0][1], norms[0][2], cols[0], p2[0], p2[1], p2[2], norms[2][0], norms[2][1], norms[2][2], cols[2], p3[0], p3[1], p3[2], norms[3][0], norms[3][1], norms[3][2], cols[3]);
}
// lofted elliptical tube. o: {s0,s1,rings,seg,dir,down,ox,oy,oz,z0,z1,cap0,cap1,flatBot,ridge,superPow,bendX,bendY}
Builder.prototype.loft = function (K, o, col) {
  o = o || {};
  var s0 = o.s0 !== undefined ? o.s0 : K[0][0], s1 = o.s1 !== undefined ? o.s1 : K[K.length - 1][0];
  var R = Math.max(2, Math.round((o.rings || 10) * DETAIL)), S = Math.max(4, Math.round((o.seg || 8) * DETAIL)), dir = o.dir || 1, down = !!o.down, ox = o.ox || 0, oy = o.oy || 0, oz = o.oz || 0;
  var z0 = o.z0 !== undefined ? o.z0 : s0, z1 = o.z1 !== undefined ? o.z1 : s1, fn = typeof col === 'function';
  var flatBot = o.flatBot || 0, ridge = o.ridge || 0, superPow = o.superPow || 0, bendX = o.bendX || 0, bendY = o.bendY || 0;
  var P = new Float32Array((R + 1) * S * 3), CC = new Float32Array((R + 1) * S * 3), i, k, idx;
  var cr = 0, cg = 0, cb = 0; if (!fn) { cr = (col >> 16 & 255) / 255; cg = (col >> 8 & 255) / 255; cb = (col & 255) / 255; }
  for (i = 0; i <= R; i++) {
    var tf = i / R, s = lerp(s0, s1, tf), pr = profAt(K, s), zc = lerp(z0, z1, tf);
    var arc = 4 * tf * (1 - tf), bxOff = bendX * arc, byOff = bendY * arc;
    for (k = 0; k < S; k++) {
      var a = k / S * TAU, ca = cos(a), sa = sin(a), sca = ca, ssa = sa;
      if (superPow > 0 && superPow !== 1) {
        sca = (ca < 0 ? -1 : 1) * Math.pow(abs(ca), superPow);
        ssa = (sa < 0 ? -1 : 1) * Math.pow(abs(sa), superPow);
      }
      if (flatBot > 0 && sca < 0) sca *= (1 - flatBot * 0.55);
      var rAdd = (ridge && ca > 0.55) ? ridge * Math.pow((ca - 0.55) / 0.45, 2) * pr[1] : 0;
      var u = pr[0] * ssa + bxOff, v = pr[2] + pr[1] * sca + rAdd + byOff, x, y, z;
      if (down) { x = u; y = -s; z = v; } else { x = u; y = v; z = dir * s; }
      x += ox; y += oy; z += oz; idx = (i * S + k) * 3; P[idx] = x; P[idx + 1] = y; P[idx + 2] = z;
      if (fn) { var h = col(zc, ca, sa, x, y, z); CC[idx] = (h >> 16 & 255) / 255; CC[idx + 1] = (h >> 8 & 255) / 255; CC[idx + 2] = (h & 255) / 255; }
      else { CC[idx] = cr; CC[idx + 1] = cg; CC[idx + 2] = cb; }
    }
  }
  // smooth normals
  var N = new Float32Array(P.length), ring = function (ii, kk) { return ((ii * S) + ((kk + S) % S)) * 3; };
  for (i = 0; i <= R; i++) {
    var ia = Math.max(0, i - 1), ib = Math.min(R, i + 1);
    var cx = 0, cy = 0, cz = 0; for (k = 0; k < S; k++) { idx = (i * S + k) * 3; cx += P[idx]; cy += P[idx + 1]; cz += P[idx + 2]; } cx /= S; cy /= S; cz /= S;
    for (k = 0; k < S; k++) {
      idx = (i * S + k) * 3;
      var a1 = ring(ia, k), b1 = ring(ib, k), a2 = ring(i, k - 1), b2 = ring(i, k + 1);
      _l1.set(P[b1] - P[a1], P[b1 + 1] - P[a1 + 1], P[b1 + 2] - P[a1 + 2]); _l2.set(P[b2] - P[a2], P[b2 + 1] - P[a2 + 1], P[b2 + 2] - P[a2 + 2]);
      _ln.crossVectors(_l1, _l2); var L = _ln.length();
      _lp.set(P[idx] - cx, P[idx + 1] - cy, P[idx + 2] - cz);
      if (L < 1e-9) { if (_lp.lengthSq() < 1e-12) _lp.set(0, 0, i === 0 ? -1 : 1); _ln.copy(_lp).normalize(); }
      else { _ln.divideScalar(L); var rl = _lp.length(); if (rl > 1e-6 && _ln.dot(_lp) < 0) _ln.negate(); else if (rl <= 1e-6) { _ln.set(0, 0, (i === 0 ? -1 : 1) * (_ln.z < 0 ? -1 : 1)); } }
      N[idx] = _ln.x; N[idx + 1] = _ln.y; N[idx + 2] = _ln.z;
      var aoL = clamp(0.92 + 0.10 * _ln.y, 0.80, 1.04);
      CC[idx] *= aoL; CC[idx + 1] *= aoL; CC[idx + 2] *= aoL;
    }
  }
  _emitGrid(this, P, N, CC, R, S, true);
  var capf = function (i0, sgn) {
    var cx = 0, cy = 0, cz = 0, r = 0, g = 0, b = 0; for (var kk = 0; kk < S; kk++) { var q = (i0 * S + kk) * 3; cx += P[q]; cy += P[q + 1]; cz += P[q + 2]; r += CC[q]; g += CC[q + 1]; b += CC[q + 2]; }
    cx /= S; cy /= S; cz /= S; r /= S; g /= S; b /= S;
    var nz = down ? 0 : dir * sgn, ny = down ? -sgn : 0;
    for (var kk2 = 0; kk2 < S; kk2++) {
      var qa = ring(i0, kk2), qb = ring(i0, kk2 + 1);
      _l1.set(P[qa] - cx, P[qa + 1] - cy, P[qa + 2] - cz); _l2.set(P[qb] - cx, P[qb + 1] - cy, P[qb + 2] - cz); _ln.crossVectors(_l1, _l2);
      var fl = (_ln.y * ny + _ln.z * nz) < 0;
      var A = [cx, cy, cz], Bv = [P[qa], P[qa + 1], P[qa + 2]], Cv = [P[qb], P[qb + 1], P[qb + 2]]; if (fl) { var tmp = Bv; Bv = Cv; Cv = tmp; }
      this.p.push(A[0], A[1], A[2], Bv[0], Bv[1], Bv[2], Cv[0], Cv[1], Cv[2]);
      for (var m = 0; m < 3; m++) { this.n.push(0, ny, nz); this.c.push(r, g, b); }
    }
  }.bind(this);
  if (o.cap0) capf(0, -1); if (o.cap1) capf(R, 1);
  return this;
};

// smooth 3D Catmull-Rom swept tube with parallel-transport (Bishop) frames
Builder.prototype.tube = function (pts, rSpec, col, o) {
  if (!pts || pts.length < 2) return this;
  o = o || {};
  var S = Math.max(4, Math.round((o.seg || 8) * DETAIL)), sx = o.sx || 1, sz = o.sz || 1;
  var flatBot = o.flatBot || 0, ridge = o.ridge || 0;
  var cap0 = o.cap0 !== undefined ? o.cap0 : true, cap1 = o.cap1 !== undefined ? o.cap1 : true;
  var sm = o.smooth !== false && pts.length >= 3;
  var steps = sm ? Math.max(2, Math.round((o.steps || 3) * DETAIL)) : 1;
  var spine = [], i, k, j;
  if (sm) {
    var m = pts.length;
    for (i = 0; i < m - 1; i++) {
      var p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < m ? i + 2 : m - 1];
      var sub = (i === m - 2) ? steps : steps - 1;
      for (j = 0; j <= sub; j++) {
        var u = j / steps, u2 = u * u, u3 = u2 * u;
        var x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
        var y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
        var z = 0.5 * ((2 * p1[2]) + (-p0[2] + p2[2]) * u + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * u2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * u3);
        spine.push([x, y, z]);
      }
    }
  } else {
    for (i = 0; i < pts.length; i++) spine.push([pts[i][0], pts[i][1], pts[i][2]]);
  }
  var R = spine.length - 1; if (R < 1) return this;
  var arc = [0], tot = 0;
  for (i = 1; i <= R; i++) {
    var dx = spine[i][0] - spine[i - 1][0], dy = spine[i][1] - spine[i - 1][1], dz = spine[i][2] - spine[i - 1][2];
    tot += Math.sqrt(dx * dx + dy * dy + dz * dz); arc.push(tot);
  }
  if (tot < 1e-6) return this;
  var rAt = function (t) {
    if (typeof rSpec === 'function') return max(1e-4, rSpec(t));
    if (typeof rSpec === 'number') return max(1e-4, rSpec);
    if (Array.isArray(rSpec)) {
      if (rSpec.length === 2) return max(1e-4, lerp(rSpec[0], rSpec[1], t));
      var fi = clamp(t, 0, 1) * (rSpec.length - 1), i0 = Math.floor(fi), i1 = Math.min(rSpec.length - 1, i0 + 1);
      return max(1e-4, lerp(rSpec[i0], rSpec[i1], fi - i0));
    }
    return 0.05;
  };
  var Tvecs = [], Nvecs = [], Bvecs = [];
  for (i = 0; i <= R; i++) {
    var ia = Math.max(0, i - 1), ib = Math.min(R, i + 1);
    var tv = new T.Vector3(spine[ib][0] - spine[ia][0], spine[ib][1] - spine[ia][1], spine[ib][2] - spine[ia][2]);
    if (tv.lengthSq() < 1e-12) tv.set(0, 1, 0); else tv.normalize();
    Tvecs.push(tv);
  }
  var n0 = new T.Vector3();
  if (abs(Tvecs[0].y) < 0.92) n0.set(0, 1, 0); else n0.set(1, 0, 0);
  n0.addScaledVector(Tvecs[0], -n0.dot(Tvecs[0])).normalize();
  Nvecs.push(n0); Bvecs.push(new T.Vector3().crossVectors(Tvecs[0], n0).normalize());
  var qStep = new T.Quaternion();
  for (i = 1; i <= R; i++) {
    var ni = Nvecs[i - 1].clone();
    if (qStep.setFromUnitVectors && ni.applyQuaternion) {
      qStep.setFromUnitVectors(Tvecs[i - 1], Tvecs[i]);
      ni.applyQuaternion(qStep);
    }
    ni.addScaledVector(Tvecs[i], -ni.dot(Tvecs[i]));
    if (ni.lengthSq() < 1e-10) ni.copy(Nvecs[i - 1]); else ni.normalize();
    Nvecs.push(ni); Bvecs.push(new T.Vector3().crossVectors(Tvecs[i], ni).normalize());
  }
  var P = new Float32Array((R + 1) * S * 3), CC = new Float32Array((R + 1) * S * 3), N = new Float32Array((R + 1) * S * 3);
  var fn = typeof col === 'function', cr = 0, cg = 0, cb = 0;
  if (!fn) { cr = (col >> 16 & 255) / 255; cg = (col >> 8 & 255) / 255; cb = (col & 255) / 255; }
  for (i = 0; i <= R; i++) {
    var tf = arc[i] / tot, rad = rAt(tf), sp = spine[i], nv = Nvecs[i], bv = Bvecs[i];
    for (k = 0; k < S; k++) {
      var a = k / S * TAU, ca = cos(a), sa = sin(a), sca = ca;
      if (flatBot > 0 && sca < 0) sca *= (1 - flatBot * 0.55);
      var rAdd = (ridge && ca > 0.55) ? ridge * Math.pow((ca - 0.55) / 0.45, 2) * rad : 0;
      var u = (rad * sz * sca + rAdd), v = rad * sx * sa;
      var px = sp[0] + nv.x * u + bv.x * v, py = sp[1] + nv.y * u + bv.y * v, pz = sp[2] + nv.z * u + bv.z * v;
      var idx = (i * S + k) * 3;
      P[idx] = px; P[idx + 1] = py; P[idx + 2] = pz;
    }
  }
  var ring = function (ii, kk) { return (ii * S + ((kk + S) % S)) * 3; };
  for (i = 0; i <= R; i++) {
    var ia2 = Math.max(0, i - 1), ib2 = Math.min(R, i + 1), sp2 = spine[i], tf2 = arc[i] / tot;
    for (k = 0; k < S; k++) {
      var idx2 = (i * S + k) * 3;
      var a1 = ring(ia2, k), b1 = ring(ib2, k), a2 = ring(i, k - 1), b2 = ring(i, k + 1);
      _l1.set(P[b1] - P[a1], P[b1 + 1] - P[a1 + 1], P[b1 + 2] - P[a1 + 2]);
      _l2.set(P[b2] - P[a2], P[b2 + 1] - P[a2 + 1], P[b2 + 2] - P[a2 + 2]);
      _ln.crossVectors(_l1, _l2); var L = _ln.length();
      _lp.set(P[idx2] - sp2[0], P[idx2 + 1] - sp2[1], P[idx2 + 2] - sp2[2]);
      if (L < 1e-9) { if (_lp.lengthSq() < 1e-12) _lp.copy(Tvecs[i]).multiplyScalar(i === 0 ? -1 : 1); _ln.copy(_lp).normalize(); }
      else { _ln.divideScalar(L); if (_lp.lengthSq() > 1e-10 && _ln.dot(_lp) < 0) _ln.negate(); }
      N[idx2] = _ln.x; N[idx2 + 1] = _ln.y; N[idx2 + 2] = _ln.z;
      var ao = clamp(0.92 + 0.10 * _ln.y, 0.80, 1.04);
      if (fn) {
        var h = col(P[idx2], P[idx2 + 1], P[idx2 + 2], _ln.x, _ln.y, _ln.z, tf2);
        CC[idx2] = (h >> 16 & 255) / 255 * ao; CC[idx2 + 1] = (h >> 8 & 255) / 255 * ao; CC[idx2 + 2] = (h & 255) / 255 * ao;
      } else {
        CC[idx2] = cr * ao; CC[idx2 + 1] = cg * ao; CC[idx2 + 2] = cb * ao;
      }
    }
  }
  _emitGrid(this, P, N, CC, R, S, true);
  var capEnd = function (i0, tv, sgn) {
    var c = spine[i0], r = 0, g = 0, b = 0, kk;
    for (kk = 0; kk < S; kk++) { var q = (i0 * S + kk) * 3; r += CC[q]; g += CC[q + 1]; b += CC[q + 2]; }
    r /= S; g /= S; b /= S;
    var nx = tv.x * sgn, ny = tv.y * sgn, nz = tv.z * sgn;
    var cCol = [r, g, b];
    for (kk = 0; kk < S; kk++) {
      var qa = ring(i0, kk), qb = ring(i0, kk + 1);
      _pushTriAO(this, c[0], c[1], c[2], nx, ny, nz, cCol, P[qa], P[qa + 1], P[qa + 2], nx, ny, nz, [CC[qa], CC[qa + 1], CC[qa + 2]], P[qb], P[qb + 1], P[qb + 2], nx, ny, nz, [CC[qb], CC[qb + 1], CC[qb + 2]]);
    }
  }.bind(this);
  if (cap0) capEnd(0, Tvecs[0], -1);
  if (cap1) capEnd(R, Tvecs[R], 1);
  return this;
};

// revolved profile around local Y axis: pts = [[r, y], ...]
Builder.prototype.lathe = function (pts, col, o) {
  if (!pts || pts.length < 2) return this;
  o = o || {};
  var S = Math.max(6, Math.round((o.seg || 12) * DETAIL)), R = pts.length - 1;
  var phi0 = o.phi0 || 0, phiLen = o.phiLen !== undefined ? o.phiLen : TAU, full = abs(phiLen - TAU) < 1e-4;
  var ox = o.x || o.tx || 0, oy = o.y || o.ty || 0, oz = o.z || o.tz || 0, sx = o.sx || 1, sy = o.sy || 1, sz = o.sz || 1;
  var ridgeN = o.ridgeN || 0, ridgeA = o.ridgeA || 0;
  _ea.set(o.rot ? o.rot[0] : 0, o.rot ? o.rot[1] : 0, o.rot ? o.rot[2] : 0, 'XYZ');
  _qa.setFromEuler(_ea);
  _ma.compose(_va.set(ox, oy, oz), _qa, _sa.set(sx, sy, sz));
  var hasNM = !!(_nm && _nm.getNormalMatrix && _ln.applyMatrix3); if (hasNM) _nm.getNormalMatrix(_ma);
  var cols = full ? S : S + 1;
  var P = new Float32Array((R + 1) * cols * 3), N = new Float32Array((R + 1) * cols * 3), CC = new Float32Array((R + 1) * cols * 3);
  var fn = typeof col === 'function', cr = 0, cg = 0, cb = 0;
  if (!fn) { cr = (col >> 16 & 255) / 255; cg = (col >> 8 & 255) / 255; cb = (col & 255) / 255; }
  var i, k, idx;
  for (i = 0; i <= R; i++) {
    var rad = max(0, pts[i][0]), py = pts[i][1];
    for (k = 0; k < cols; k++) {
      var a = phi0 + (k / S) * phiLen, ca = cos(a), sa = sin(a);
      var rMod = ridgeN ? rad * (1 + ridgeA * cos(a * ridgeN)) : rad;
      _a.set(rMod * sa, py, rMod * ca).applyMatrix4(_ma);
      idx = (i * cols + k) * 3; P[idx] = _a.x; P[idx + 1] = _a.y; P[idx + 2] = _a.z;
    }
  }
  var ring = function (ii, kk) {
    var ck = full ? ((kk + S) % S) : clamp(kk, 0, S);
    return (ii * cols + ck) * 3;
  };
  for (i = 0; i <= R; i++) {
    var ia = Math.max(0, i - 1), ib = Math.min(R, i + 1);
    var dr = pts[ib][0] - pts[ia][0], dy = pts[ib][1] - pts[ia][1];
    // outward radial normal in (r, y) plane: (dy, -dr) if y increases upward, check sign
    var nr = dy, nyL = -dr;
    var nl = Math.sqrt(nr * nr + nyL * nyL);
    if (nl < 1e-8) { nr = 1; nyL = 0; } else { nr /= nl; nyL /= nl; if (dy < 0) { nr = -nr; nyL = -nyL; } }
    for (k = 0; k < cols; k++) {
      var a2 = phi0 + (k / S) * phiLen, ca2 = cos(a2), sa2 = sin(a2);
      _ln.set(nr * sa2, nyL, nr * ca2);
      if (hasNM) _ln.applyMatrix3(_nm).normalize(); else if (_ln.applyQuaternion) _ln.applyQuaternion(_qa).normalize();
      idx = (i * cols + k) * 3;
      N[idx] = _ln.x; N[idx + 1] = _ln.y; N[idx + 2] = _ln.z;
      var ao = clamp(0.92 + 0.10 * _ln.y, 0.80, 1.04);
      if (fn) {
        var h = col(P[idx], P[idx + 1], P[idx + 2], _ln.x, _ln.y, _ln.z);
        CC[idx] = (h >> 16 & 255) / 255 * ao; CC[idx + 1] = (h >> 8 & 255) / 255 * ao; CC[idx + 2] = (h & 255) / 255 * ao;
      } else {
        CC[idx] = cr * ao; CC[idx + 1] = cg * ao; CC[idx + 2] = cb * ao;
      }
    }
  }
  _emitGrid(this, P, N, CC, R, S, full);
  var capLathe = function (i0, sgn) {
    if (pts[i0][0] < 1e-5) return;
    _a.set(0, pts[i0][1], 0).applyMatrix4(_ma);
    _ln.set(0, sgn, 0);
    if (hasNM) _ln.applyMatrix3(_nm).normalize(); else if (_ln.applyQuaternion) _ln.applyQuaternion(_qa).normalize();
    var cCol = _evalColAO(col, _a.x, _a.y, _a.z, _ln.x, _ln.y, _ln.z);
    for (var kk = 0; kk < S; kk++) {
      var qa = ring(i0, kk), qb = ring(i0, kk + 1);
      _pushTriAO(this, _a.x, _a.y, _a.z, _ln.x, _ln.y, _ln.z, cCol, P[qa], P[qa + 1], P[qa + 2], _ln.x, _ln.y, _ln.z, [CC[qa], CC[qa + 1], CC[qa + 2]], P[qb], P[qb + 1], P[qb + 2], _ln.x, _ln.y, _ln.z, [CC[qb], CC[qb + 1], CC[qb + 2]]);
    }
  }.bind(this);
  if (o.cap0) capLathe(0, -1);
  if (o.cap1) capLathe(R, 1);
  return this;
};

// 3D chamfered/beveled box (26 faces: 6 main + 12 edge bevels + 8 corner facets)
Builder.prototype.bevelBox = function (w, h, d, bev, x, y, z, col, o) {
  o = o || {};
  var hx = w * 0.5, hy = h * 0.5, hz = d * 0.5;
  var b = clamp(bev !== undefined ? bev : min(w, h, d) * 0.12, 1e-4, min(hx, hy, hz) * 0.9);
  var ix = hx - b, iy = hy - b, iz = hz - b, sm = o.smooth ? (typeof o.smooth === 'number' ? o.smooth : 0.45) : 0;
  _ea.set(o.rot ? o.rot[0] : 0, o.rot ? o.rot[1] : 0, o.rot ? o.rot[2] : 0, 'XYZ');
  _qa.setFromEuler(_ea);
  _ma.compose(_va.set(x, y, z), _qa, _sa.set(1, 1, 1));
  var W = function (px, py, pz) { _a.set(px, py, pz).applyMatrix4(_ma); return [_a.x, _a.y, _a.z]; };
  var WN = function (nx, ny, nz) { _n.set(nx, ny, nz).normalize(); if (_n.applyQuaternion) _n.applyQuaternion(_qa); return [_n.x, _n.y, _n.z]; };
  var Q = function (a, b2, c, d2, n) { _emitQuadFlat(this, a, b2, c, d2, n[0], n[1], n[2], col, sm, x, y, z, hx, hy, hz); }.bind(this);
  // 24 chamfer vertices: 3 per octant (sx,sy,sz in {-1,+1})
  var V = function (sx, sy, sz, face) {
    if (face === 0) return W(sx * hx, sy * iy, sz * iz); // X face corner
    if (face === 1) return W(sx * ix, sy * hy, sz * iz); // Y face corner
    return W(sx * ix, sy * iy, sz * hz);                 // Z face corner
  };
  // 6 main faces
  Q(V(1, -1, -1, 0), V(1, 1, -1, 0), V(1, 1, 1, 0), V(1, -1, 1, 0), WN(1, 0, 0));
  Q(V(-1, -1, 1, 0), V(-1, 1, 1, 0), V(-1, 1, -1, 0), V(-1, -1, -1, 0), WN(-1, 0, 0));
  Q(V(-1, 1, -1, 1), V(-1, 1, 1, 1), V(1, 1, 1, 1), V(1, 1, -1, 1), WN(0, 1, 0));
  Q(V(-1, -1, 1, 1), V(-1, -1, -1, 1), V(1, -1, -1, 1), V(1, -1, 1, 1), WN(0, -1, 0));
  Q(V(-1, -1, 1, 2), V(1, -1, 1, 2), V(1, 1, 1, 2), V(-1, 1, 1, 2), WN(0, 0, 1));
  Q(V(1, -1, -1, 2), V(-1, -1, -1, 2), V(-1, 1, -1, 2), V(1, 1, -1, 2), WN(0, 0, -1));
  // 12 edge chamfers
  for (var s1 = -1; s1 <= 1; s1 += 2) for (var s2 = -1; s2 <= 1; s2 += 2) {
    Q(V(s1, s2, -1, 0), V(s1, s2, 1, 0), V(s1, s2, 1, 1), V(s1, s2, -1, 1), WN(s1, s2, 0)); // XY edges along Z
    Q(V(s1, -1, s2, 0), V(s1, 1, s2, 0), V(s1, 1, s2, 2), V(s1, -1, s2, 2), WN(s1, 0, s2)); // XZ edges along Y
    Q(V(-1, s1, s2, 1), V(1, s1, s2, 1), V(1, s1, s2, 2), V(-1, s1, s2, 2), WN(0, s1, s2)); // YZ edges along X
  }
  // 8 corner triangles
  for (var sx = -1; sx <= 1; sx += 2) for (var sy = -1; sy <= 1; sy += 2) for (var sz = -1; sz <= 1; sz += 2) {
    var p0 = V(sx, sy, sz, 0), p1 = V(sx, sy, sz, 1), p2 = V(sx, sy, sz, 2), cn = WN(sx, sy, sz);
    var c0 = _evalColAO(col, p0[0], p0[1], p0[2], cn[0], cn[1], cn[2]);
    var c1 = _evalColAO(col, p1[0], p1[1], p1[2], cn[0], cn[1], cn[2]);
    var c2 = _evalColAO(col, p2[0], p2[1], p2[2], cn[0], cn[1], cn[2]);
    _pushTriAO(this, p0[0], p0[1], p0[2], cn[0], cn[1], cn[2], c0, p1[0], p1[1], p1[2], cn[0], cn[1], cn[2], c1, p2[0], p2[1], p2[2], cn[0], cn[1], cn[2], c2);
  }
  return this;
};

// extruded 2D polygon with optional bevel, taper & dish curvature (axis: 'z'|'x'|'y')
Builder.prototype.extrude = function (poly2d, depth, x, y, z, rot, col, o) {
  if (!poly2d || poly2d.length < 3) return this;
  o = o || {};
  var n = poly2d.length, axis = o.axis || 'z', hd = (depth || 0.05) * 0.5, bev = clamp(o.bev !== undefined ? o.bev : (o.bevel || 0), 0, hd * 0.9);
  var taper = o.taper !== undefined ? o.taper : 1, cX = o.curveX || 0, cY = o.curveY || 0;
  var cu = 0, cv = 0, i, area2 = 0;
  for (i = 0; i < n; i++) { cu += poly2d[i][0]; cv += poly2d[i][1]; var nxt = poly2d[(i + 1) % n]; area2 += poly2d[i][0] * nxt[1] - nxt[0] * poly2d[i][1]; }
  cu /= n; cv /= n;
  var pts = area2 < 0 ? poly2d.slice().reverse() : poly2d;
  _ea.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'XYZ');
  _qa.setFromEuler(_ea);
  _ma.compose(_va.set(x, y, z), _qa, _sa.set(o.sx || 1, o.sy || 1, o.sz || 1));
  var toW = function (u, v, w) {
    var du = u - cu, dv = v - cv, cw = w + cX * du * du + cY * dv * dv;
    if (axis === 'x') _a.set(cw, u, v); else if (axis === 'y') _a.set(u, cw, v); else _a.set(u, v, cw);
    _a.applyMatrix4(_ma); return [_a.x, _a.y, _a.z];
  };
  var toN = function (u, v, w) {
    if (axis === 'x') _n.set(w, u, v); else if (axis === 'y') _n.set(u, w, v); else _n.set(u, v, w);
    _n.normalize(); if (_n.applyQuaternion) _n.applyQuaternion(_qa); return [_n.x, _n.y, _n.z];
  };
  var nf = toN(0, 0, 1), nb = toN(0, 0, -1), ins = bev > 0 ? clamp(1 - bev * 1.4, 0.35, 0.96) : 1;
  var cf = toW(cu, cv, hd), cb = toW(cu, cv, -hd);
  var cfc = _evalColAO(col, cf[0], cf[1], cf[2], nf[0], nf[1], nf[2]), cbc = _evalColAO(col, cb[0], cb[1], cb[2], nb[0], nb[1], nb[2]);
  var rimF = [], rimB = [], outF = [], outB = [];
  for (i = 0; i < n; i++) {
    var u = pts[i][0], v = pts[i][1];
    var ui = cu + (u - cu) * ins, vi = cv + (v - cv) * ins;
    var ub = cu + (u - cu) * taper, vb = cv + (v - cv) * taper;
    var uib = cu + (ub - cu) * ins, vib = cv + (vb - cv) * ins;
    rimF.push(toW(ui, vi, hd)); rimB.push(toW(uib, vib, -hd));
    outF.push(toW(u, v, hd - bev)); outB.push(toW(ub, vb, -(hd - bev)));
  }
  for (i = 0; i < n; i++) {
    var j = (i + 1) % n;
    // front & back cap triangles
    var fa = rimF[i], fb = rimF[j], ba = rimB[i], bb = rimB[j];
    _pushTriAO(this, cf[0], cf[1], cf[2], nf[0], nf[1], nf[2], cfc, fa[0], fa[1], fa[2], nf[0], nf[1], nf[2], _evalColAO(col, fa[0], fa[1], fa[2], nf[0], nf[1], nf[2]), fb[0], fb[1], fb[2], nf[0], nf[1], nf[2], _evalColAO(col, fb[0], fb[1], fb[2], nf[0], nf[1], nf[2]));
    _pushTriAO(this, cb[0], cb[1], cb[2], nb[0], nb[1], nb[2], cbc, bb[0], bb[1], bb[2], nb[0], nb[1], nb[2], _evalColAO(col, bb[0], bb[1], bb[2], nb[0], nb[1], nb[2]), ba[0], ba[1], ba[2], nb[0], nb[1], nb[2], _evalColAO(col, ba[0], ba[1], ba[2], nb[0], nb[1], nb[2]));
    var eu = pts[j][0] - pts[i][0], ev = pts[j][1] - pts[i][1], en = toN(ev, -eu, 0);
    if (bev > 0) {
      var nbf = toN(ev, -eu, 0.7), nbb = toN(ev, -eu, -0.7);
      _emitQuadFlat(this, rimF[i], outF[i], outF[j], rimF[j], nbf[0], nbf[1], nbf[2], col, 0, x, y, z, 1, 1, 1);
      _emitQuadFlat(this, outB[i], rimB[i], rimB[j], outB[j], nbb[0], nbb[1], nbb[2], col, 0, x, y, z, 1, 1, 1);
    }
    _emitQuadFlat(this, outF[i], outB[i], outB[j], outF[j], en[0], en[1], en[2], col, 0, x, y, z, 1, 1, 1);
  }
  return this;
};

// closed, double-walled, cambered 3D wing airfoil/membrane across ordered skeletal spars
Builder.prototype.wingMembrane = function (spars, thickness, col, o) {
  if (!spars || spars.length < 2) return this;
  o = o || {};
  var U = Math.max(2, Math.round((o.uSteps || 4) * DETAIL)), V = Math.max(2, Math.round((o.vSteps || 3) * DETAIL));
  var th0 = max(0.002, thickness || 0.025), camber = o.camber !== undefined ? o.camber : 0.06, scallop = o.scallop !== undefined ? o.scallop : 0.14;
  var nS = spars.length, sampleSpar = function (sp, u) {
    if (sp.length === 2) return [lerp(sp[0][0], sp[1][0], u), lerp(sp[0][1], sp[1][1], u), lerp(sp[0][2], sp[1][2], u)];
    var om = 1 - u, p0 = sp[0], p1 = sp[1], p2 = sp[sp.length - 1];
    return [om * om * p0[0] + 2 * om * u * p1[0] + u * u * p2[0], om * om * p0[1] + 2 * om * u * p1[1] + u * u * p2[1], om * om * p0[2] + 2 * om * u * p1[2] + u * u * p2[2]];
  };
  var cols = (nS - 1) * V + 1, rows = U + 1;
  var topP = new Float32Array(rows * cols * 3), botP = new Float32Array(rows * cols * 3);
  var topN = new Float32Array(rows * cols * 3), botN = new Float32Array(rows * cols * 3);
  var topC = new Float32Array(rows * cols * 3), botC = new Float32Array(rows * cols * 3);
  var i, j, k, cIdx, sIdx;
  // base surface coordinates
  var midP = new Float32Array(rows * cols * 3);
  for (i = 0; i <= U; i++) {
    var u = i / U;
    for (sIdx = 0; sIdx < nS - 1; sIdx++) {
      var a = sampleSpar(spars[sIdx], u), b = sampleSpar(spars[sIdx + 1], u);
      var a0 = spars[sIdx][0], b0 = spars[sIdx + 1][0];
      var jMax = (sIdx === nS - 2) ? V : V - 1;
      for (j = 0; j <= jMax; j++) {
        var v = j / V, c = sIdx * V + j, arch = 4 * v * (1 - v);
        var scF = scallop * arch * u * u;
        var mx = lerp(a[0], b[0], v), my = lerp(a[1], b[1], v), mz = lerp(a[2], b[2], v);
        var rx = lerp(a0[0], b0[0], v), ry = lerp(a0[1], b0[1], v), rz = lerp(a0[2], b0[2], v);
        mx = lerp(mx, rx, scF); my = lerp(my, ry, scF); mz = lerp(mz, rz, scF);
        my += camber * arch * sin(PI * u) * Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[2] - b[2]) * (a[2] - b[2]) + 0.05);
        var idx = (i * cols + c) * 3;
        midP[idx] = mx; midP[idx + 1] = my; midP[idx + 2] = mz;
      }
    }
  }
  // compute surface normals & offset top/bottom shells
  var idxOf = function (ii, cc) { return (ii * cols + cc) * 3; };
  for (i = 0; i <= U; i++) {
    var u2 = i / U, ia = Math.max(0, i - 1), ib = Math.min(U, i + 1);
    for (cIdx = 0; cIdx < cols; cIdx++) {
      var ca = Math.max(0, cIdx - 1), cb = Math.min(cols - 1, cIdx + 1);
      var q = idxOf(i, cIdx), qia = idxOf(ia, cIdx), qib = idxOf(ib, cIdx), qca = idxOf(i, ca), qcb = idxOf(i, cb);
      _l1.set(midP[qib] - midP[qia], midP[qib + 1] - midP[qia + 1], midP[qib + 2] - midP[qia + 2]);
      _l2.set(midP[qcb] - midP[qca], midP[qcb + 1] - midP[qca + 1], midP[qcb + 2] - midP[qca + 2]);
      _ln.crossVectors(_l1, _l2);
      if (_ln.lengthSq() < 1e-12) _ln.set(0, 1, 0); else { _ln.normalize(); if (_ln.y < 0) _ln.negate(); }
      var vf = cIdx / max(1, cols - 1);
      var halfT = th0 * 0.5 * (1 - 0.65 * u2) * (1 - 0.35 * vf);
      topP[q] = midP[q] + _ln.x * halfT; topP[q + 1] = midP[q + 1] + _ln.y * halfT; topP[q + 2] = midP[q + 2] + _ln.z * halfT;
      botP[q] = midP[q] - _ln.x * halfT; botP[q + 1] = midP[q + 1] - _ln.y * halfT; botP[q + 2] = midP[q + 2] - _ln.z * halfT;
      topN[q] = _ln.x; topN[q + 1] = _ln.y; topN[q + 2] = _ln.z;
      botN[q] = -_ln.x; botN[q + 1] = -_ln.y; botN[q + 2] = -_ln.z;
      var tc = _evalColAO(col, topP[q], topP[q + 1], topP[q + 2], _ln.x, _ln.y, _ln.z, u2, vf);
      var bc = _evalColAO(col, botP[q], botP[q + 1], botP[q + 2], -_ln.x, -_ln.y, -_ln.z, u2, vf);
      topC[q] = tc[0]; topC[q + 1] = tc[1]; topC[q + 2] = tc[2];
      botC[q] = bc[0]; botC[q + 1] = bc[1]; botC[q + 2] = bc[2];
    }
  }
  _emitGrid(this, topP, topN, topC, U, cols - 1, false);
  _emitGrid(this, botP, botN, botC, U, cols - 1, false);
  // stitch perimeter edges
  var stitch = function (qa, qb) {
    var paT = [topP[qa], topP[qa + 1], topP[qa + 2]], pbT = [topP[qb], topP[qb + 1], topP[qb + 2]];
    var paB = [botP[qa], botP[qa + 1], botP[qa + 2]], pbB = [botP[qb], botP[qb + 1], botP[qb + 2]];
    _l1.set(pbT[0] - paT[0], pbT[1] - paT[1], pbT[2] - paT[2]);
    _l2.set(paB[0] - paT[0], paB[1] - paT[1], paB[2] - paT[2]);
    _ln.crossVectors(_l1, _l2); if (_ln.lengthSq() < 1e-14) return; _ln.normalize();
    var cA = [topC[qa], topC[qa + 1], topC[qa + 2]], cB = [topC[qb], topC[qb + 1], topC[qb + 2]];
    _pushTriAO(this, paT[0], paT[1], paT[2], _ln.x, _ln.y, _ln.z, cA, pbT[0], pbT[1], pbT[2], _ln.x, _ln.y, _ln.z, cB, pbB[0], pbB[1], pbB[2], _ln.x, _ln.y, _ln.z, cB);
    _pushTriAO(this, paT[0], paT[1], paT[2], _ln.x, _ln.y, _ln.z, cA, pbB[0], pbB[1], pbB[2], _ln.x, _ln.y, _ln.z, cB, paB[0], paB[1], paB[2], _ln.x, _ln.y, _ln.z, cA);
  }.bind(this);
  for (cIdx = 0; cIdx < cols - 1; cIdx++) { stitch(idxOf(U, cIdx), idxOf(U, cIdx + 1)); stitch(idxOf(0, cIdx + 1), idxOf(0, cIdx)); }
  for (i = 0; i < U; i++) { stitch(idxOf(i, 0), idxOf(i + 1, 0)); stitch(idxOf(i + 1, cols - 1), idxOf(i, cols - 1)); }
  return this;
};
// thin extruded polygon in the (y,z) plane (e.g. plates, sails, crests). poly:[[y,z],...] convex-ish; th=half thickness (x). rot=[rx,ry,rz]
var _pm = new T.Matrix4(), _pq = new T.Quaternion(), _pe = new T.Euler(), _pv = new T.Vector3(), _ps = new T.Vector3(1, 1, 1);
Builder.prototype.plate = function (poly, th, x, y, z, rot, col, sc) {
  _pe.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'XYZ'); _pq.setFromEuler(_pe); _ps.set(sc || 1, sc || 1, sc || 1); _pm.compose(_pv.set(x, y, z), _pq, _ps);
  var n = poly.length, cy = 0, cz = 0, i; for (i = 0; i < n; i++) { cy += poly[i][0]; cz += poly[i][1]; } cy /= n; cz /= n;
  var fn = typeof col === 'function';
  var W = function (px, py, pz) { var v = new T.Vector3(px, py, pz).applyMatrix4(_pm); return [v.x, v.y, v.z]; };
  var nx = new T.Vector3(1, 0, 0).applyQuaternion(_pq);
  for (i = 0; i < n; i++) {
    var j = (i + 1) % n, a = poly[i], b = poly[j];
    var cc = fn ? col((a[0] + b[0] + cy) / 3, (a[1] + b[1] + cz) / 3) : col;
    var cm = fn ? col((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) : col;
    // faces
    this.tri(W(th, cy, cz), W(th, a[0], a[1]), W(th, b[0], b[1]), cc, nx.x, nx.y, nx.z);
    this.tri(W(-th, cy, cz), W(-th, a[0], a[1]), W(-th, b[0], b[1]), cc, -nx.x, -nx.y, -nx.z);
    // rim
    var oy = (a[0] + b[0]) / 2 - cy, oz = (a[1] + b[1]) / 2 - cz, oh = new T.Vector3(0, oy, oz).applyQuaternion(_pq);
    this.tri(W(th, a[0], a[1]), W(-th, a[0], a[1]), W(th, b[0], b[1]), cm, oh.x, oh.y, oh.z);
    this.tri(W(-th, a[0], a[1]), W(-th, b[0], b[1]), W(th, b[0], b[1]), cm, oh.x, oh.y, oh.z);
  }
  return this;
};

// ---- skin colouring: returns fn(zc, ca, sa, x, y, z) -> hex.  ca = cos(angle from top) (1 top, -1 belly), sa = sin (side)
function skin(o) {
  var back = o.back, belly = o.belly, mid = o.mid, bAt = o.bAt !== undefined ? o.bAt : -0.1, bW = o.bW || 0.55, bars = o.bars, spots = o.spots, dors = o.dors, mott = o.mott === undefined ? 0.07 : o.mott;
  var bars2 = o.bars2, z0 = o.z0 !== undefined ? o.z0 : -9, z1 = o.z1 !== undefined ? o.z1 : 9;
  return function (zc, ca, sa, x, y, z) {
    var kb = smooth(ca, bAt - bW * 0.5, bAt + bW * 0.5), c;
    if (mid) { var k2 = smooth(ca, bAt + bW * 0.3, bAt + bW + 0.35); c = mixHex(mixHex(belly, mid, kb), back, k2); } else c = mixHex(belly, back, kb);
    var bb = [bars, bars2];
    for (var q = 0; q < 2; q++) {
      var b = bb[q]; if (!b) continue;
      var rng = smooth(zc, (b.from !== undefined ? b.from : z0) - 0.02, (b.from !== undefined ? b.from : z0) + 0.04) * (1 - smooth(zc, (b.to !== undefined ? b.to : z1) - 0.04, (b.to !== undefined ? b.to : z1) + 0.02));
      if (rng <= 0) continue;
      var v = fract(zc * b.f + (b.ph || 0) + 0.06 * sin(ca * 3.1 + zc * 5)), d = Math.abs(v - 0.5) * 2, m = 1 - smooth(d, b.w * 0.55, b.w);
      m *= smooth(ca, (b.ca0 !== undefined ? b.ca0 : -0.2) - 0.45, (b.ca0 !== undefined ? b.ca0 : -0.2) + 0.25) * rng * (b.k !== undefined ? b.k : 1);
      if (m > 0) c = mixHex(c, b.c, m);
    }
    if (spots) {
      var h = hash3(Math.floor(zc * spots.f), Math.floor((ca + 1) * spots.k), sa > 0 ? 1 : 2);
      if (h < spots.d && ca > (spots.ca0 !== undefined ? spots.ca0 : -0.3)) c = mixHex(c, spots.c, spots.a !== undefined ? spots.a : 0.8);
    }
    if (dors) { var md = smooth(ca, 0.78, 0.96) * (dors.k !== undefined ? dors.k : 1); if (md > 0) c = mixHex(c, dors.c, md); }
    c = shade(c, 1 - 0.05 * smooth(ca, 0.3, 1) + 0.04 * smooth(-ca, 0.2, 1));
    if (mott) {
      var hm = hash3(Math.floor(zc * 18), Math.floor((ca + 1) * 3.5), sa > 0 ? 1 : 2), hf = hash3(Math.floor(zc * 70) + 0.5, Math.floor((ca + 1) * 9), sa > 0 ? 3 : 4);
      c = shade(c, 1 + (hm - 0.5) * mott * 2 + (hf - 0.5) * mott * 1.1 + (sin(zc * 23 + ca * 2.1) * 0.5 + sin(zc * 9 - sa * 3.3) * 0.5) * mott * 0.8);
    }
    return c;
  };
}

function fixZ(f, z) { return function (zc, ca, sa, x, y, z2) { return f(z, ca, sa, x, y, z2); }; }

// ================================================================ DINOSAUR RIG
// All dinosaur geometry is authored in units of H (the species' hip-height 'H' in metres); the rig group is scaled by H (* baby scale).
// Body local frame: origin at the hind hip joint, +y up, +z forward. Angles: 'abs' angles are measured in the world sagittal plane
// from straight-down (legs) or from horizontal (neck/tail/head), positive = forward / upward.
var DINOS = {}, dparts = {};
var EYEC = 0xe8b830;
// reptilian eye pair at +-x. iris colour, round: round pupil (default slit), lid: skin tone for brow/lids
function eye(g, x, y, z, r, iris, round, lid) {
  lid = lid || 0x3a2e24; var rim = shade(lid, 0.6), lidUp = round ? 0.4 : 0.55;
  for (var s = -1; s <= 1; s += 2) {
    g.sph(r * 1.18, r * 1.12, r * 1.1, s * (x - r * 0.38), y, z - r * 0.05, rim, { s: [6, 4] });
    g.sph(r, r, r * 0.9, s * x, y, z, iris || EYEC, { s: [7, 5] });
    g.sph(r * 0.34, r * (round ? 0.5 : 0.78), r * (round ? 0.5 : 0.2), s * (x + r * 0.72), y, z + r * 0.3, 0x120a06, { s: [5, 4] });
    g.sph(r * 0.13, r * 0.13, r * 0.13, s * (x + r * 0.8), y + r * 0.4, z + r * 0.5, 0xffffff, { s: [4, 3] });
    g.sph(r * 1.08, r * lidUp, r * 0.98, s * (x + r * 0.02), y + r * 0.62, z - r * 0.02, rim, { s: [5, 4] });
    g.sph(r * 1.0, r * 0.3, r * 0.92, s * (x + r * 0.02), y - r * 0.74, z, rim, { s: [5, 4] });
    g.sph(r * 1.25, r * 0.42, r * 1.4, s * (x - r * 0.05), y + r * 1.05, z - r * 0.1, lid, { s: [5, 4] });
  }
}
function nostrils(g, x, y, z, r, col) { for (var s = -1; s <= 1; s += 2) g.sph(r, r * 0.8, r * 1.3, s * x, y, z, col || 0x1a1210, { s: [5, 4] }); }
function teethRow(g, zs, x, y, len, w, up, col, inward) {
  for (var s = -1; s <= 1; s += 2) for (var i = 0; i < zs.length; i++) {
    var l = len * (0.75 + 0.25 * (i % 2)), ww = w * (0.85 + 0.15 * (i % 2));
    g.cone(ww, l, s * x, y + (up ? l * 0.5 : -l * 0.5), zs[i], col || 0xf0ead6, { seg: 5, rot: [up ? -0.1 : PI + 0.1, 0, -s * (inward || 0.12)] });
  }
}
function rotP(ph, dy, dz) { return [dy * cos(ph) - dz * sin(ph), dy * sin(ph) + dz * cos(ph)]; }   // pitch (y,z) forward-vector down by ph
// curved keratin claw from (x,y,z) along (dx,dy,dz), hooking towards world-down
function claw(g, x, y, z, dx, dy, dz, len, r, col) {
  var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
  var bx = dx * dy, by = dy * dy - 1, bz = dz * dy, bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1; bx /= bl; by /= bl; bz /= bl;
  var c = col || 0x2a2420, cb = shade(c, 0.7), ct = shade(c, 1.3), cv = len * 0.3;
  g.tube([[x, y, z], [x + dx * len * 0.5 + bx * cv * 0.2, y + dy * len * 0.5 + by * cv * 0.2, z + dz * len * 0.5 + bz * cv * 0.2], [x + dx * len * 0.92 + bx * cv, y + dy * len * 0.92 + by * cv, z + dz * len * 0.92 + bz * cv]], [r, r * 0.6, 0.0008],
    function (px, py, pz, nx, ny, nz, t) { return mixHex(cb, ct, t); }, { seg: 5, steps: 2 });
}
// toes hanging from joint (0,y0,0); baked so that they are flat when the foot is at absolute angle ph. Each toe: 3 jointed lofted phalanges with scute bands + curved claw.
function toeSet(g, y0, o, col) {
  var n = o.n || 3, len = o.len, w = o.w, ph = o.ph || 0, cl = o.claw === undefined ? len * 0.35 : o.claw, cc = o.cc || 0x2a2420, sp = o.spread === undefined ? 0.32 : o.spread, lat = o.lat === undefined ? w * 0.9 : o.lat;
  var fr = [0, 0.4, 0.72, 1], rr = [1, 0.88, 0.76, 0.6];
  g.sph(w * 1.55, w * 1.2, w * 1.7, 0, y0, w * 0.4, col, { s: [6, 4] });
  for (var i = 0; i < n; i++) {
    var k = i - (n - 1) / 2, th = k * sp, l2 = len * (1 - 0.18 * Math.abs(k)), sx = k * lat, P = [], j;
    for (j = 0; j < 4; j++) { var f = fr[j], e = rotP(ph, w * 0.34 * sin(PI * f), w * 0.5 + (cos(th) * l2 - w * 0.5) * f); P.push([sx + sin(th) * l2 * f, y0 + e[0], e[1]]); }
    var ux = P[3][0] - P[0][0], uy = P[3][1] - P[0][1], uz = P[3][2] - P[0][2], ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1, b0 = P[0], base = col;
    var cf = function (px, py, pz, nx, ny, nz) { var d = ((px - b0[0]) * ux + (py - b0[1]) * uy + (pz - b0[2]) * uz) / (ul * ul) * 5.2; return shade(base, (fract(d) < 0.3 ? 0.76 : 1.02) * (ny < -0.45 ? 1.14 : 1)); };
    for (j = 0; j < 3; j++) {
      g.limb(P[j][0], P[j][1], P[j][2], P[j + 1][0], P[j + 1][1], P[j + 1][2], w * rr[j], w * rr[j + 1], cf, { seg: 5 });
      if (j > 0) g.sph(w * rr[j] * 1.1, w * rr[j] * 1.0, w * rr[j] * 1.1, P[j][0], P[j][1], P[j][2], cf, { s: [5, 3] });
    }
    if (cl > 0) { var dx = P[3][0] - P[2][0], dy = P[3][1] - P[2][1], dz = P[3][2] - P[2][2]; claw(g, P[3][0] - dx * 0.2, P[3][1] - dy * 0.2, P[3][2] - dz * 0.2, dx, dy, dz, cl, w * 0.62, cc); }
  }
}
function legCol(S, y0, y1, belly) { // vertical gradient down the leg: body colour -> darker foot
  var a = S.legc || shade(S.back, 0.88), b = S.footc || shade(S.back, 0.62);
  return function (zc, ca, sa, x, y) { var t = clamp((-y - y0) / (y1 - y0), 0, 1); return mixHex(mixHex(a, S.belly, (1 - ca) * 0.22 * (S.legBelly || 1)), b, t * t * 0.9); };
}
// ridged skin colour: subtle darker scute row along the dorsal line; o.scute = scutes per unit length
function scuteCol(col, freq) {
  return function (zc, ca, sa, x, y, z, t) {
    var h = col(zc, ca, sa, x, y, z, t), k = smooth(ca, 0.72, 0.96);
    return k > 0 ? shade(h, 1 + k * (fract(zc * freq) < 0.5 ? -0.09 : 0.03)) : h;
  };
}
function chain(K, n, total, o, col0, dir, zmap, jointFn) {
  var out = [], seg = total / n, col = scuteCol(col0, o.scute || 30);
  for (var i = 0; i < n; i++) {
    var s0 = i * seg, s1 = (i + 1) * seg * (i < n - 1 ? 1.07 : 1.0), g = B();
    var pr = profAt(K, s0);
    g.sph(Math.max(pr[0], 0.003) * 0.98, Math.max(pr[1], 0.003) * 0.98, Math.max(pr[0], pr[1], 0.003) * 1.05, 0, pr[2], 0, function (x, y, z, nx, ny, nz) { return col(zmap(s0), clamp(ny, -1, 1), 0, x, y, z); }, { s: [7, 5] });
    g.loft(K, { s0: s0, s1: s1, rings: o.rr || 4, seg: o.seg || 8, dir: dir, oz: -dir * s0, z0: zmap(s0), z1: zmap(s1), cap1: i === n - 1, ridge: o.ridge || 0 }, col);
    if (jointFn) jointFn(g, i, n, seg, s0);
    out.push(g.build());
  }
  return out;
}
// skin-fold wrinkle bands down a limb (y<0): darkens every L*0.1 by amp
function wrinkled(c, L, amp) {
  return function (zc, ca, sa, x, y, z) { var h = c(zc, ca, sa, x, y, z); return fract(-y / (L * 0.1) + 0.3 * sa) < 0.2 ? shade(h, 1 - amp) : h; };
}

function legGeos(S) {
  var Lg = S.legs, G = {};
  if (S.kind === 'biped') {
    var L = Lg.L, w = Lg.w, g = B(), c = legCol(S, 0, L[0] + L[1]), fc = S.footc || shade(S.back, 0.6);
    // thigh: drumstick merging into the hip, caudofemoral mass behind, knee bump
    g.loft([[0, w[0] * 0.95, w[0] * 1.25, -w[0] * 0.2], [L[0] * 0.15, w[0] * 1.3, w[0] * 1.5, -w[0] * 0.1], [L[0] * 0.42, w[0] * 1.15, w[0] * 1.3, w[0] * 0.08], [L[0] * 0.75, w[0] * 0.74, w[0] * 0.82, w[0] * 0.16], [L[0], w[0] * 0.55, w[0] * 0.6, w[0] * 0.14]], { down: true, rings: 9, seg: 11 }, c);
    g.sph(w[0] * 0.55, w[0] * 0.8, w[0] * 0.95, 0, -L[0] * 0.14, -w[0] * 0.6, c(0, 0, 0, 0, -L[0] * 0.14), { s: [7, 5] });
    g.sph(w[0] * 0.5, w[0] * 0.5, w[0] * 0.66, 0, -L[0], w[0] * 0.16, c(0, 0, 0, 0, -L[0] * 0.95), { s: [7, 5] });
    if (Lg.thighExtra) Lg.thighExtra(g, S);
    G.up = g.build();
    // shin: cnemial crest, calf belly, tendon taper, flared ankle
    g = B();
    g.loft([[0, w[1] * 1.3, w[1] * 1.28, w[1] * 0.1], [L[1] * 0.2, w[1] * 1.42, w[1] * 1.4, -w[1] * 0.02], [L[1] * 0.5, w[1] * 1.0, w[1] * 1.05, -w[1] * 0.06], [L[1] * 0.82, w[1] * 0.68, w[1] * 0.74, 0], [L[1], w[1] * 0.78, w[1] * 0.8, 0]], { down: true, rings: 7, seg: 9 }, c);
    g.sph(w[1] * 0.8, w[1] * 0.74, w[1] * 0.82, 0, -L[1], 0, mixHex(c(0, 0, 0, 0, -L[1] * 0.9), fc, 0.55), { s: [7, 5] });
    if (Lg.shinExtra) Lg.shinExtra(g, S);
    G.lo = g.build();
    // metatarsus: narrow lofted bone with scale banding
    g = B(); var cf = function () { return fc; }, mc = function (zc, ca, sa, x, y) { var t = clamp(-y / L[2], 0, 1), h = mixHex(S.legc || shade(S.back, 0.88), fc, smooth(t, 0.0, 0.35)); return fract(t * 7 + 0.2 * sa) < 0.28 ? shade(h, 0.78) : h; };
    g.loft([[0, w[2] * 0.95, w[2] * 1.25, w[2] * 0.08], [L[2] * 0.4, w[2] * 0.72, w[2] * 0.85, w[2] * 0.04], [L[2] * 0.85, w[2] * 0.8, w[2] * 0.8, 0], [L[2], w[2] * 1.0, w[2] * 0.95, 0]], { down: true, rings: 5, seg: 8 }, mc);
    toeSet(g, -L[2], { n: Lg.toes || 3, len: Lg.toeLen, w: Lg.toeW, ph: Lg.phis, claw: Lg.claw, cc: Lg.clawCol, spread: Lg.spread }, cf());
    if (Lg.dew) claw(g, 0, -L[2] * 0.8, -Lg.toeW * 0.6, 0, -0.5, -0.8, Lg.toeW * 2.6, Lg.toeW * 0.6, Lg.clawCol || 0x2a2420);
    if (Lg.footExtra) Lg.footExtra(g, S);
    G.ft = g.build();
  } else {
    ['f', 'h'].forEach(function (k) {
      var q = Lg[k], L = q.L, w = q.w, g = B(), c = legCol(S, 0, L[0] + (L[1] || 0)), back = k === 'h' ? -1 : 0;
      if (S.kind === 'sauro') {
        var rMid = (w[0] + w[1]) * 0.52, cw = wrinkled(c, L[0], 0.07);
        g.loft([[0, w[0] * 1.3, w[0] * 1.36, w[0] * 0.12 * back], [L[0] * 0.22, w[0] * 1.28, w[0] * 1.34, w[0] * 0.08 * back], [L[0] * 0.6, w[0] * 1.02, w[0] * 1.06, 0], [L[0], rMid * 1.04, rMid * 1.04, 0]], { down: true, rings: 7, seg: 10 }, cw);
        g.sph(rMid * 1.04, rMid * 0.98, rMid * 1.06, 0, -L[0], 0, cw(0, 0, 0, 0, -L[0] * 0.9), { s: [7, 5] });
        var sUp = g.build(); g = B();
        var cl = wrinkled(c, L[1], 0.07);
        g.loft([[0, rMid * 1.02, rMid * 1.02, 0], [L[1] * 0.55, w[1] * 0.98, w[1] * 1.0, 0], [L[1] * 0.9, w[1] * 1.08, w[1] * 1.12, 0], [L[1], w[1] * 1.16, w[1] * 1.2, 0]], { down: true, rings: 6, seg: 10 }, cl);
        var fcol = S.footc || 0x444444;
        g.lathe([[w[1] * 1.48, 0], [w[1] * 1.52, w[1] * 0.36], [w[1] * 1.28, w[1] * 0.72], [w[1] * 0.9, w[1] * 0.85]], fcol, { seg: 10, x: 0, y: -L[1], z: w[1] * 0.25, sx: 1.0, sz: 1.08, cap0: true, cap1: true });
        for (var i = -1; i <= 1; i++) {
          g.sph(w[1] * 0.42, w[1] * 0.3, w[1] * 0.46, i * w[1] * 0.8, -L[1] + w[1] * 0.28, w[1] * 1.3, fcol, { s: [6, 4] });
          g.cyl(w[1] * 0.17, w[1] * 0.3, w[1] * 0.34, i * w[1] * 0.8, -L[1] + w[1] * 0.3, w[1] * 1.6 + (i === 0 ? w[1] * 0.08 : 0), 0x2a2420, { seg: 6, sz: 0.55, rot: [PI / 2 - 0.15, 0, 0] });
        }
        G[k] = { up: sUp, lo: g.build() };
      } else {
        var w2 = w[2] || w[1];
        // shoulder/thigh muscle mass tapering to a slender, tendon-like lower limb
        g.loft([[0, w[0] * 1.22, w[0] * 1.32, w[0] * 0.1 * back], [L[0] * 0.2, w[0] * 1.3, w[0] * 1.4, w[0] * 0.1 * back], [L[0] * 0.55, w[0] * 1.0, w[0] * 1.08, 0], [L[0], w[1] * 1.1, w[1] * 1.1, 0]], { down: true, rings: 6, seg: 9 }, c);
        g.sph(w[1] * 1.15, w[1] * 1.1, w[1] * 1.15, 0, -L[0], 0, c(0, 0, 0, 0, -L[0] * 0.9), { s: [6, 4] });
        var up = g.build(); g = B();
        g.loft([[0, w[1] * 1.2, w[1] * 1.2, 0], [L[1] * 0.28, w[1] * 1.08, w[1] * 1.1, 0], [L[1] * 0.68, w[1] * 0.88, w[1] * 0.9, 0], [L[1], w2 * 1.0, w2 * 1.0, 0]], { down: true, rings: 5, seg: 9 }, c);
        if (q.foot) q.foot(g, L[1], S); else { g.sph(w[1] * 1.5, w[1] * 0.7, w[1] * 1.8, 0, -L[1] + w[1] * 0.5, w[1] * 0.5, S.footc || 0x444444, { s: [7, 4] }); }
        G[k] = { up: up, lo: g.build() };
      }
    });
  }
  return G;
}

function dinoArmGeo(S) {
  var A = S.arms, g = B(); if (!A) return null;
  A.build(g, S); return g.build();
}

function dinoPrep(S) {
  if (S._ready) return; S._ready = true;
  S.p0 = S.p0 || 0; S.bs = S.bs || 0.42; S.bh = S.bh || 1.45; S.sc = S.sc || {};
  var Lg = S.legs, J = S.J;
  if (S.kind === 'biped') {
    Lg.phis = Lg.phis === undefined ? 0.14 : Lg.phis; Lg.tt = Lg.tt || 0.03; Lg.chord = Lg.chord || 0.92;
    var r = Lg.r, s = (J - Lg.tt) / (r[2] * cos(Lg.phis) + Lg.chord * (r[0] + r[1]));
    Lg.L = [s * r[0], s * r[1], s * r[2]]; Lg.fx = Lg.fx === undefined ? 0.05 : Lg.fx; Lg.z = Lg.z || 0;
  } else {
    ['f', 'h'].forEach(function (k) {
      var q = Lg[k]; q.z = q.z || 0; q.y = q.y || 0; q.tt = q.tt === undefined ? 0.03 : q.tt; q.fx = q.fx || 0.0;
      var yj = J + q.y * cos(S.p0) + q.z * sin(S.p0), ck = S.kind === 'sauro' ? 0.985 : (Lg.chord || 0.93), tot = (yj - q.tt) / ck;
      var rr = q.r || (S.kind === 'sauro' ? [0.54, 0.46] : [1, 1]);
      q.L = [tot * rr[0] / (rr[0] + rr[1]), tot * rr[1] / (rr[0] + rr[1])];
      q.yj = yj;
    });
    if (S.pivotZ === undefined) S.pivotZ = (Lg.f.z + Lg.h.z) * 0.5;
  }
  var g = S.gait; g.Dw = g.Dw || 1.6; g.Dr = g.Dr || 3.2; g.bw = g.bw || 0.6; g.br = g.br || 0.42; g.lw = g.lw || 0.08; g.lr = g.lr || 0.16; g.bob = g.bob === undefined ? 0.02 : g.bob; g.bobR = g.bobR === undefined ? 0.05 : g.bobR;
  S.eat = S.eat || {}; S.sleep = S.sleep || {}; S.neck.stab = S.neck.stab || [0.6, 0.9]; S.call = S.call || null;
}

function dinoParts(S, baby) {
  dinoPrep(S);
  var P = dparts[S.id];
  if (!P) {
    P = dparts[S.id] = {};
    var g = B(), b = S.body; g.loft(b.keys, { rings: b.rings || 20, seg: b.seg || 10, z0: b.keys[0][0], z1: b.keys[b.keys.length - 1][0], cap0: true, cap1: true, ridge: b.ridge || 0, flatBot: b.flatBot || 0, superPow: b.superPow || 0 }, S.sk);
    if (b.extra) b.extra(g, S); P.body = g.build();
    var nk = S.neck, zmN = function (s) { return nk.at[2] + s * 0.8; };
    P.neck = chain(nk.keys, nk.n, nk.len, nk, S.sk, 1, zmN, nk.joint);
    var tl = S.tail, zmT = function (s) { return tl.at[1] - s; };
    P.tail = chain(tl.keys, tl.n, tl.len, tl, S.sk, -1, zmT, tl.each);
    P.leg = legGeos(S); P.arm = dinoArmGeo(S);
  }
  var hk = baby ? 'b' : 'a';
  if (!P['head' + hk]) {
    var hg = B(), jg = B(); S.head.build(hg, jg, !!baby, S);
    P['head' + hk] = hg.build(); P['jaw' + hk] = jg.build(0, -S.head.jaw[0], -S.head.jaw[1]);
  }
  return P;
}

function createDino(S, opts) {
  var baby = !!opts.baby, P = dinoParts(S, baby), hk = baby ? 'b' : 'a';
  var sx = opts.sex === 'f' && S.fScale ? S.fScale : 1, sc = baby ? S.bs : sx;
  var root = grp('animal'), rig = grp('rig'), body = grp('body'); body.rotation.order = 'YXZ'; root.add(rig); rig.add(body); rig.scale.setScalar(S.H * sc);
  if (S.pivotZ) rig.position.z = -S.pivotZ * S.H * sc;
  var bodyM = mesh(P.body); body.add(bodyM);
  var I = { S: S, root: root, rig: rig, body: body, bodyM: bodyM, sc: sc, baby: baby, t: Math.random() * 100, ph: Math.random(), seed: Math.random() * 6.28, st: 'idle',
    W: { gait: 0, run: 0, sleep: 0, eat: 0, swim: 0, sick: 0, play: 0, call: 0, rear: 0, drink: 0 }, lookY: 0, lookP: 0, lookT: 1 + Math.random() * 2, lookTY: 0, lookTP: 0,
    callT: 3 + Math.random() * 10, callK: 0, callAge: 99, eatTree: 0, rearFlag: 0, pulse: 0, hopT: 0 };
  // neck
  var nk = S.neck, par = body; I.neck = [];
  for (var i = 0; i < nk.n; i++) {
    var gp = grp('neck' + i); gp.rotation.order = 'YXZ'; par.add(gp);
    if (i === 0) gp.position.set(nk.at[0], nk.at[1], nk.at[2]); else gp.position.set(0, 0, nk.len / nk.n);
    gp.add(mesh(P.neck[i])); I.neck.push(gp); par = gp;
  }
  var head = grp('head'); head.rotation.order = 'YXZ'; head.position.set(0, 0, nk.len / nk.n); par.add(head); head.add(mesh(P['head' + hk])); head.scale.setScalar((baby ? S.bh : 1) * (S.head.scale || 1)); I.head = head;
  var jaw = grp('jaw'); jaw.position.set(0, S.head.jaw[0], S.head.jaw[1]); head.add(jaw); jaw.add(mesh(P['jaw' + hk])); I.jaw = jaw;
  // tail
  var tl = S.tail; par = body; I.tail = [];
  for (i = 0; i < tl.n; i++) {
    var tg = grp('tail' + i); tg.rotation.order = 'YXZ'; par.add(tg);
    if (i === 0) tg.position.set(0, tl.at[0], tl.at[1]); else tg.position.set(0, 0, -tl.len / tl.n);
    tg.add(mesh(P.tail[i])); I.tail.push(tg); par = tg;
  }
  // legs: order LH, LF, RH, RF (quad)  or L,R (biped)
  var Lg = S.legs; I.legs = [];
  var mk = function (side, front) {
    var q = S.kind === 'biped' ? Lg : (front ? Lg.f : Lg.h), lx = S.kind === 'biped' ? Lg.sep : q.x, ly = S.kind === 'biped' ? 0 : q.y, lz = S.kind === 'biped' ? Lg.z : q.z;
    var leg = { side: side, front: front, q: q, lx: side * lx, ly: ly, lz: lz, L: q.L, hip: grp('hip'), kn: null, an: null, tt: q.tt };
    leg.hip.position.set(leg.lx, ly, lz); body.add(leg.hip);
    if (S.kind === 'biped') {
      leg.hip.add(mesh(P.leg.up)); leg.kn = grp('knee'); leg.kn.position.set(0, -q.L[0], 0); leg.hip.add(leg.kn); leg.kn.add(mesh(P.leg.lo));
      leg.an = grp('ankle'); leg.an.position.set(0, -q.L[1], 0); leg.kn.add(leg.an); leg.an.add(mesh(P.leg.ft));
    } else {
      var pg = P.leg[front ? 'f' : 'h']; leg.hip.add(mesh(pg.up));
      if (pg.lo) { leg.kn = grp('knee'); leg.kn.position.set(0, -q.L[0], 0); leg.hip.add(leg.kn); leg.kn.add(mesh(pg.lo)); }
    }
    I.legs.push(leg); return leg;
  };
  if (S.kind === 'biped') { mk(1, false); mk(-1, false); }
  else { mk(1, false); mk(1, true); mk(-1, false); mk(-1, true); }
  // arms
  I.arms = [];
  if (S.arms && P.arm) {
    for (var a = -1; a <= 1; a += 2) {
      var ag = grp('arm'); ag.position.set(a * S.arms.at[0], S.arms.at[1], S.arms.at[2]); ag.rotation.order = 'YXZ'; body.add(ag);
      var am = mesh(P.arm); ag.add(am); I.arms.push(ag);
    }
  }
  var out = { group: root, height: 1, update: function (dt, ent) { dinoUpdate(I, dt, ent); }, _I: I };
  dinoUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  root.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(root); out.height = Math.max(0.2, bb.max.y);
  root.userData.species = S.id;
  return out;
}

function ik2(L1, L2, tx, ty, bend) {
  var d = Math.sqrt(tx * tx + ty * ty), dmax = (L1 + L2) * 0.9995, dmin = Math.abs(L1 - L2) * 1.001 + 1e-4;
  d = clamp(d, dmin, dmax);
  var psi = Math.atan2(tx, -ty), ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), al = Math.acos(ca), p1 = psi + bend * al;
  var kx = L1 * sin(p1), ky = -L1 * cos(p1), ex = d * sin(psi), ey = -d * cos(psi);
  return [p1, Math.atan2(ex - kx, -(ey - ky))];
}
function pulse(x, a, b, c, d) { return smooth(x, a, b) * (1 - smooth(x, c, d)); }

function dinoUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1; if (dt <= 0) dt = 1e-4;
  var S = I.S, W = I.W, t = (I.t += dt), st = ent.state || 'idle', spd = ent.speed || 0, i, j, n, Lg = S.legs, G = S.gait, biped = S.kind === 'biped', sauro = S.kind === 'sauro';
  if (st === 'escaped') st = spd > 0.1 ? 'run' : 'idle';
  var Hm = S.H * I.sc;
  if (st !== I.st) {
    if (st === 'eat' || st === 'drink') I.eatTree = (st === 'eat' && S.eat.tree && Math.random() < S.eat.tree) ? 1 : 0;
    if (st === 'run') I.rearFlag = (S.rear && Math.random() < 0.5) ? 1 : 0;
    I.st = st;
  }
  var moving = spd > 0.05 && st !== 'sleep' && st !== 'eat' && st !== 'drink';
  var runAt = S.runAt || 4.5, isRun = (st === 'run' || spd > runAt) && moving;
  W.gait = damp(W.gait, moving && st !== 'swim' ? 1 : 0, 6, dt); W.run = damp(W.run, isRun ? 1 : 0, 3.5, dt);
  W.sleep = damp(W.sleep, st === 'sleep' ? 1 : 0, 1.8, dt); W.eat = damp(W.eat, (st === 'eat' || st === 'drink') ? 1 : 0, 3, dt);
  W.swim = damp(W.swim, st === 'swim' ? 1 : 0, 2.5, dt); W.sick = damp(W.sick, st === 'sick' ? 1 : 0, 2, dt); W.play = damp(W.play, st === 'play' ? 1 : 0, 4, dt);
  var gw = W.gait, rw = W.run, ew = W.eat, sw = W.sleep, wsw = W.swim, kw = W.sick, pw = W.play;
  var idleish = !moving && st !== 'sleep' && st !== 'eat' && st !== 'drink' && st !== 'swim' && st !== 'sick' && st !== 'play';
  // ---- gait phase (from distance travelled)
  var D = lerp(G.Dw, G.Dr, rw), beta = lerp(G.bw, G.br, rw), lift = lerp(G.lw, G.lr, rw);
  var fmax = Math.max(1.3, 4.6 - 0.75 * Hm);
  if (moving && st !== 'swim') { var f = spd / (D * Hm); if (f > fmax) D = spd / (fmax * Hm); I.ph += spd * dt / (D * Hm); }
  else if (st === 'swim') I.ph += dt * 0.9;
  var ph = I.ph;
  // ---- timers: look, call, rear
  I.lookT -= dt; if (I.lookT <= 0) { I.lookT = 1.4 + Math.random() * 4; I.lookTY = Math.random() < 0.25 ? 0 : (Math.random() - 0.5) * 1.5; I.lookTP = (Math.random() - 0.5) * 0.35; }
  I.lookY = damp(I.lookY, I.lookTY, 2.2, dt); I.lookP = damp(I.lookP, I.lookTP, 2.2, dt);
  var cl = S.call;
  if (cl) {
    if (idleish || (st === 'play' && false)) { I.callT -= dt; if (I.callT <= 0) { I.callT = (cl.min || 7) + Math.random() * (cl.var || 14); I.callAge = 0; I.rearFlag = (S.rear && Math.random() < 0.4) ? 1 : 0; } }
    if (I.callAge < 90) I.callAge += dt;
  }
  var dur = cl ? (cl.dur || 2.2) : 1, ca = I.callAge, callE = 0;
  if (cl && ca < dur) { callE = cl.type === 'honk' ? (pulse(ca, 0.0, 0.18, 0.5, 0.75) + pulse(ca, 0.9, 1.1, 1.45, 1.7)) : pulse(ca, 0, 0.35, dur - 0.5, dur); }
  if (!idleish) callE = 0;
  W.call = damp(W.call, callE, 14, dt);
  var cw = W.call;
  var rearT = S.rear ? ((st === 'eat' && I.eatTree) || (st === 'run' && I.rearFlag) || (idleish && cw > 0.02 && I.rearFlag) ? 1 : 0) : 0;
  W.rear = damp(W.rear, rearT, 2.2, dt); var rw2 = W.rear;
  var breathe = sin(t * (1.9 + (S.H < 1 ? 1 : 0)) + I.seed), sick1 = kw;
  // ---- body pose
  var by = S.J, p = S.p0, roll = 0, yawB = 0, bz = 0;
  by += (S.H < 1.2 ? 0.0025 : 0.003) * breathe;
  var bobA = lerp(G.bob, G.bobR, rw);
  if (gw > 0.01) {
    if (biped) by += gw * bobA * (cos(4 * PI * (ph - beta * 0.5)) - 0.4 * rw) + gw * rw * 0.03 * Math.abs(sin(2 * PI * ph));
    else by += gw * bobA * cos(4 * PI * (ph - beta * 0.5));
    p += gw * (G.pw === undefined ? 0.025 : G.pw) * sin(4 * PI * ph + 0.9);
    roll += gw * (G.roll === undefined ? 0.035 : G.roll) * sin(2 * PI * ph + 0.4); yawB += gw * (G.yaw === undefined ? 0.04 : G.yaw) * sin(2 * PI * ph + 1.0);
    p += rw * (G.runP !== undefined ? G.runP : -0.07) * gw;
  }
  // eat / drink : lean + crouch
  var E = S.eat; p += ew * -(I.eatTree ? (E.pTree || 0) : (E.p || 0)); by -= ew * (I.eatTree ? 0 : (E.crouch || 0));
  if (cw > 0.001 && cl) { p += cw * (cl.pitch || 0.06); by += cw * (cl.up || 0.0); }
  // sleep
  var Sl = S.sleep; if (sw > 0.001) { by = lerp(by, Sl.y !== undefined ? Sl.y : S.J * 0.45, sw); p = lerp(p, S.p0 + (Sl.p || 0), sw); roll = lerp(roll, Sl.roll || 0, sw); yawB *= 1 - sw; }
  // swim
  if (wsw > 0.001) { by = lerp(by, S.J - (S.swimDrop !== undefined ? S.swimDrop : 0.5), wsw); p = lerp(p, S.p0 - 0.04 + 0.03 * sin(t * 1.6), wsw); roll += wsw * 0.03 * sin(t * 1.3); }
  // sick
  if (kw > 0.001) { by -= kw * (S.sickDrop !== undefined ? S.sickDrop : 0.07); p -= kw * 0.06; roll += kw * 0.012 * sin(t * 14); }
  // play hops
  if (pw > 0.001) { var hop = Math.abs(sin(t * 6.2 + I.seed)); by += pw * hop * 0.2; p += pw * 0.08 * sin(t * 6.2 + 1); roll += pw * 0.08 * sin(t * 3.1); yawB += pw * 0.35 * sin(t * 1.9); }
  // rear
  if (rw2 > 0.001 && S.rear) { p += rw2 * S.rear.p; by += rw2 * (S.rear.up || 0); }
  // ---- apply body
  var cp = cos(p), sp = sin(p);
  I.body.position.set(0, by, bz); I.body.rotation.set(-p, yawB, roll);
  var br = 1 + 0.01 * breathe * (1 + 0.8 * sw); I.bodyM.scale.set(1 + 0.004 * breathe, br, 1);
  // ---- neck & head
  var nk = S.neck, nn = nk.n, abs = [], yaw = [], hpA, hy = 0, jawO = 0.02 + 0.015 * (1 + breathe) * 0.5, baseY = by + nk.at[1] * cp + nk.at[2] * sp, pd = p - S.p0;
  for (i = 0; i < nn; i++) { var stab = nk.stab[Math.min(i, nk.stab.length - 1)]; abs.push(nk.rest[i] + (1 - stab) * pd + 0.012 * sin(t * 1.3 + i * 0.7 + I.seed) * (1 - gw)); yaw.push(0); }
  var hstab = nk.stab[nk.stab.length - 1]; hpA = nk.hrest + (1 - Math.min(1, hstab + 0.1)) * pd;
  var lookW = (1 - ew * 0.85) * (1 - sw) * (1 - pw * 0.5) * (1 - kw * 0.6) * (1 - cw);
  for (i = 0; i < nn; i++) { yaw[i] += I.lookY * lookW * (nk.look || 0.5) / nn * (0.7 + 0.6 * i / Math.max(1, nn - 1)) * 1.9; abs[i] += I.lookP * lookW * 0.25; }
  hy += I.lookY * lookW * 0.35; hpA += I.lookP * lookW * 0.3;
  // gait head bob / neck run extension
  if (gw > 0.01) { for (i = 0; i < nn; i++) abs[i] += gw * (S.neckBob || 0.03) * sin(4 * PI * ph + 0.5 + i * 0.4); hpA += gw * 0.05 * sin(4 * PI * ph + 1.4); for (i = 0; i < nn; i++) abs[i] += rw * (nk.run || -0.18) * gw; }
  // call
  if (cw > 0.001 && cl) {
    for (i = 0; i < nn; i++) abs[i] += cw * (cl.neck || 0.3) * (cl.shape ? cl.shape[Math.min(i, cl.shape.length - 1)] : 1);
    hpA += cw * (cl.hp || 0.5); jawO += cw * (cl.jaw || 0.6) * (cl.type === 'honk' ? 1 : (0.85 + 0.15 * sin(t * 30)));
  }
  // rear: neck bends back to keep head up
  if (rw2 > 0.001 && S.rear) { for (i = 0; i < nn; i++) abs[i] += rw2 * (S.rear.neck || -0.3); }
  // eat / drink
  if (ew > 0.001) {
    var tree = I.eatTree, tgtY = tree ? (E.treeY || 1.6) : (E.gy || 0.06), Lt = nk.len, tot = 0;
    var ang = Math.asin(clamp((tgtY - (baseY - (tree ? 0 : (E.hdrop || 0)))) / Lt, -0.97, 0.97)), nod = sin(t * 5.4 + I.seed);
    for (i = 0; i < nn; i++) { var ta = ang + (E.curve || 0.0) * (i / Math.max(1, nn - 1) - 0.5); abs[i] = lerp(abs[i], ta, ew); }
    var hpE = tree ? (E.hpT !== undefined ? E.hpT : -0.2) + 0.06 * nod : (E.hp !== undefined ? E.hp : -1.1) + 0.1 * nod;
    hpA = lerp(hpA, hpE, ew); hy = lerp(hy, 0, ew); jawO += ew * (tree ? 0.12 + 0.1 * Math.max(0, sin(t * 7)) : (E.bite || 0.0) * Math.max(0, nod));
    if (S.eatTear) { hpA += ew * 0.15 * Math.max(0, sin(t * 3.2)); }
  }
  // sleep: neck curls round, head resting low
  if (sw > 0.001) {
    var sl = S.sleep, Lt2 = nk.len, bY = by + nk.at[1] * cp + nk.at[2] * sp, a2 = Math.asin(clamp((0.05 + (sl.neckY || 0) - bY) / Lt2, -0.97, 0.97));
    for (i = 0; i < nn; i++) { abs[i] = lerp(abs[i], a2 + (sl.neckLift || 0) * (i / Math.max(1, nn - 1)), sw); yaw[i] = lerp(yaw[i], (sl.curl !== undefined ? sl.curl : 1.3) / nn, sw); }
    hpA = lerp(hpA, sl.hp !== undefined ? sl.hp : -0.5, sw); hy = lerp(hy, sl.hy !== undefined ? sl.hy : 0.5, sw); jawO *= 1 - sw;
  }
  if (kw > 0.001) { for (i = 0; i < nn; i++) abs[i] = lerp(abs[i], abs[i] - 0.4 - 0.3 * i / nn, kw); hpA = lerp(hpA, hpA - 0.6, kw); jawO += kw * 0.08; }
  if (pw > 0.001) { hpA += pw * 0.25 * sin(t * 6.2 + 0.5); for (i = 0; i < nn; i++) abs[i] += pw * 0.1 * sin(t * 6.2 + i); }
  if (wsw > 0.001) { for (i = 0; i < nn; i++) abs[i] = lerp(abs[i], Math.max(abs[i], S.swimNeck !== undefined ? S.swimNeck : abs[i]), wsw); jawO += wsw * 0.0; }
  var wallNear = clamp(ent._wallNear || 0, 0, 1);
  if (sauro && wallNear > 0.01 && ew < 0.5 && sw < 0.5) {
    for (i = 0; i < nn; i++) abs[i] += wallNear * 0.14 * (1 - i / Math.max(1, nn) * 0.35);
  }
  var prev = p;
  for (i = 0; i < nn; i++) { I.neck[i].rotation.set(-(abs[i] - prev), yaw[i], 0); prev = abs[i]; }
  I.head.rotation.set(-(hpA - prev), hy, 0.04 * Math.sin(t * 0.7 + I.seed) * (1 - sw));
  I.jaw.rotation.x = Math.max(0, jawO);
  // ---- tail
  var tl = S.tail, tn = tl.n, tprev = -p, tby = by + tl.at[0] * cp + tl.at[1] * sp, tpd = p - S.p0;
  var tailG = [];
  var sleepA = sw > 0.001 ? -Math.asin(clamp((tby - 0.05) / tl.len, 0, 0.95)) : 0;
  for (j = 0; j < tn; j++) {
    var rest = tl.rest[Math.min(j, tl.rest.length - 1)], a = rest - (1 - (tl.stab === undefined ? 0.85 : tl.stab)) * tpd;
    var y = 0, seed = I.seed, k = j / Math.max(1, tn - 1);
    // idle sway + gait counter swing
    var idleAmp = (tl.amp || 0.1) * (1 - gw * 0.5) * (1 - wallNear * 0.5), spd2 = tl.freq || 1.0;
    y = idleAmp * sin(t * 0.9 * spd2 + seed - j * 0.8) * (j === 0 ? 0.5 : 1);
    y += gw * (tl.gaitAmp !== undefined ? tl.gaitAmp : 0.12) * (1 - wallNear * 0.45) * sin(2 * PI * ph + 1.2 - j * 0.7) * (1 + 0.6 * rw);
    a += 0.025 * sin(t * 1.3 + seed + j) + gw * 0.04 * sin(4 * PI * ph + j * 0.8);
    a += rw * (tl.run !== undefined ? tl.run : 0.08) * gw + ew * (E.tail || 0.0) + cw * (tl.call || 0.05);
    if (pw > 0.001) { y += pw * 0.5 * sin(t * 6.2 + j); a += pw * 0.1; }
    if (kw > 0.001) { a = lerp(a, a - 0.35, kw); y *= 1 - kw * 0.8; }
    if (sw > 0.001) { a = lerp(a, sleepA + (tl.sleepLift || 0) * k, sw); y = lerp(y, (tl.curl !== undefined ? tl.curl : 0.35), sw); }
    if (wsw > 0.001) { y = lerp(y, 0.5 * sin(t * 3.4 - j * 0.9) * (tl.scull !== undefined ? tl.scull : 1), wsw); a = lerp(a, a * 0.5 - 0.05, wsw); }
    if (rw2 > 0.001) a -= rw2 * (S.rear ? S.rear.tail || 0 : 0);
    I.tail[j].rotation.set(a - tprev, y, 0);   // tail rot.x = +raise relative to parent; abs = a
    tprev = a;
  }
  // ---- arms
  for (i = 0; i < I.arms.length; i++) {
    var ar = S.arms, sd = i ? -1 : 1, sw2 = ar.swing === undefined ? 0.3 : ar.swing;
    var ax = (ar.rest || 0) + gw * sw2 * sin(2 * PI * ph + (i ? PI : 0)) + 0.04 * sin(t * 1.7 + i * 2 + I.seed) + (ar.flick ? 0.2 * Math.max(0, sin(t * 0.7 + I.seed * 2 + i)) : 0);
    ax += ew * (ar.eat || 0) * (I.eatTree ? 0 : 1) + cw * (ar.call || 0) + kw * 0.2 + pw * 0.4 * sin(t * 6.2 + i);
    I.arms[i].rotation.set(-(ax - p), 0, sd * ((ar.out || 0.05) + pw * 0.3));
  }
  // ---- legs
  var restSwim = 0;
  for (i = 0; i < I.legs.length; i++) {
    var lg = I.legs[i], q = lg.q, L = lg.L, front = lg.front;
    var hipY = by + lg.ly * cp + lg.lz * sp, hipZ = bz - lg.ly * sp + lg.lz * cp;
    // rest-world hip z (for stable foot placement): at rest pitch
    var hz0 = -lg.ly * sin(S.p0) + lg.lz * cos(S.p0);
    var off;
    if (biped) off = i ? 0.5 : 0; else { var o1 = [0, 0.25, 0.5, 0.75], o2 = [0, 0.5, 0.5, 0]; off = lerp(o1[i], o2[i], rw); }
    var u = fract(ph + off), fx = 0, fy = 0, fa = 0, s;
    if (u < beta) { s = u / beta; fx = D * beta * (0.5 - s); } else { s = (u - beta) / (1 - beta); var e = s * s * (3 - 2 * s); fx = D * beta * (-0.5 + e); fy = lift * sin(PI * s); fa = sin(PI * s); }
    if (!biped) { fx *= (front ? (q.sw || 0.8) : 1); }
    var restX = hz0 + (biped ? Lg.fx : q.fx), tt = lg.tt, phis = biped ? Lg.phis : 0;
    var toeZ = restX + gw * fx, toeY = tt + gw * fy, phi = phis - gw * (Lg.curl === undefined ? 0.9 : Lg.curl) * fa;
    // rear (front legs of hadrosaur tuck up)
    if (!biped && front && rw2 > 0.001 && S.rear) { toeZ = lerp(toeZ, hipZ + 0.12, rw2); toeY = lerp(toeY, hipY - (L[0] + (L[1] || 0)) * 0.55, rw2); }
    // sleep : feet tucked under the belly
    if (sw > 0.001) {
      var sx = (Sl.fx !== undefined ? Sl.fx : 0.05) + (front && !biped ? (Sl.ffx || 0.06) : 0), sy = tt + (Sl.fy || 0);
      toeZ = lerp(toeZ, hz0 + sx, sw); toeY = lerp(toeY, sy, sw); phi = lerp(phi, phis + (Sl.phi || 0), sw);
    }
    // play: hopping feet
    if (pw > 0.001) { var hh = Math.abs(sin(t * 6.2 + I.seed)); toeY += pw * (hh * 0.2 + 0.05 * (1 - hh)); phi = lerp(phi, phis - 0.5 * hh, pw); }
    // eat crouch : widen stance slightly (already via by drop)
    var az = toeZ - (biped ? L[2] * sin(phi) : 0), ay = toeY + (biped ? L[2] * cos(phi) : 0);
    // swim paddle (relative to hip)
    if (wsw > 0.001) {
      var pa = t * 4.2 + (i % 2 ? PI : 0) + (front ? 1.2 : 0), reach = (biped ? L[0] + L[1] : (L[0] + (L[1] || 0))) * (S.paddleK || 0.72);
      var sz = hipZ + 0.1 * Math.sin(pa) * (S.paddleA || 1) * (0.6 + 0.4 * (biped ? 1 : 0)), syy = hipY - reach + 0.1 * (1 + cos(pa)) * (S.paddleA || 1);
      var pf = wsw; az = lerp(az, sz, pf); ay = lerp(ay, syy, pf); phi = lerp(phi, phis - 0.5 + 0.5 * cos(pa), pf);
    }
    var tx = az - hipZ, ty = ay - hipY;
    if (sauro) {
      var rS = ik2(L[0], L[1], tx, ty, front ? -1 : 1);
      var kBend = lerp(rS[1], rS[0], 0.35 * (1 - sw)); // weighty columnar stride with true knee bend, no foot squash
      lg.hip.rotation.set(-(rS[0] - p), 0, lg.side * sw * 0.25);
      lg.hip.scale.y = 1;
      lg.hip.position.y = lg.ly;
      if (lg.kn) lg.kn.rotation.x = -(kBend - rS[0]);
    } else {
      var r = ik2(L[0], L[1], tx, ty, biped ? 1 : (q.bend !== undefined ? q.bend : (front ? -1 : 1)));
      lg.hip.rotation.set(-(r[0] - p), 0, lg.side * (sw * 0.18 + ew * 0.04));
      lg.kn.rotation.x = -(r[1] - r[0]);
      if (biped) lg.an.rotation.x = -(phi - r[1]);
    }
  }
}

// ================================================================ DINOSAUR SPECIES
function reg(S) { DINOS[S.id] = S; return S; }
function zk(K, k, from) { return K.map(function (r) { var s = r[0] > from ? from + (r[0] - from) * k : r[0]; return [s, r[1], r[2], r[3]]; }); }

// generic skull + lower jaw builder. o: {keys, jkeys, eye:[x,y,z,r], nos:[x,y,z,r], teeth:{z0,z1,n,x,y,len,w}, jteeth, kf, bk, skin, jskin, iris, extra(g,k,b)}
function headStd(g, jg, b, S, o) {
  var k = b ? (o.bk || 0.8) : 1, kf = o.kf === undefined ? 0.1 : o.kf, K = zk(o.keys, k, kf), K2 = zk(o.jkeys, k, kf);
  var hs = o.skin || fixZ(skin({ back: S.back, belly: shade(S.belly, 0.95), bAt: -0.35, bW: 0.5, mott: 0.05 }), 0.6);
  g.loft(K, { rings: o.rings || 12, seg: o.seg || 9, cap0: true, cap1: true }, hs);
  jg.loft(K2, { rings: o.jrings || 8, seg: 8, cap0: true, cap1: true }, o.jskin || fixZ(skin({ back: shade(S.belly, 0.88), belly: S.belly, bAt: 0.4, bW: 0.6, mott: 0.04 }), 0.5));
  // subtle rear jaw-muscle cheek gusset so wide roars/bites don't gap behind the hinge
  if (K2.length >= 2) {
    var j0 = K2[0], j1 = K2[1], jh = S.head.jaw;
    for (var sG = -1; sG <= 1; sG += 2) {
      jg.sph(j0[1] * 0.48, max(0.014, abs(jh[0] - j0[3]) * 0.62), max(0.02, (j1[0] - j0[0]) * 0.65), sG * j0[1] * 0.62, lerp(j0[3], jh[0], 0.48), j0[0] + (j1[0] - j0[0]) * 0.28, shade(S.back, 0.78), { s: [5, 4] });
    }
  }
  eye(g, o.eye[0], o.eye[1], o.eye[2] * (o.eye[2] > kf ? k : 1), o.eye[3] * (b ? 1.55 : 1), o.iris, o.roundPupil, shade(S.back, 0.78));
  if (o.nos) nostrils(g, o.nos[0], o.nos[1], kf + (o.nos[2] - kf) * k, o.nos[3]);
  var tt = o.teeth, zs, i;
  if (tt) { zs = []; for (i = 0; i < tt.n; i++) zs.push(kf + (tt.z0 + (tt.z1 - tt.z0) * i / Math.max(1, tt.n - 1) - kf) * k); teethRow(g, zs, tt.x, tt.y, tt.len, tt.w, false, tt.col); }
  tt = o.jteeth;
  if (tt) { zs = []; for (i = 0; i < tt.n; i++) zs.push(kf + (tt.z0 + (tt.z1 - tt.z0) * i / Math.max(1, tt.n - 1) - kf) * k); teethRow(jg, zs, tt.x, tt.y, tt.len, tt.w, true, tt.col); }
  if (o.extra) o.extra(g, k, b, jg);
}
function feather(g, x, y, z, dx, dy, dz, w, col, flat) {
  var l = Math.sqrt(dx * dx + dy * dy + dz * dz); if (l < 1e-5) return;
  _fq.setFromUnitVectors(_fz, _fd.set(dx / l, dy / l, dz / l));
  _ea.setFromQuaternion(_fq, 'XYZ');
  var poly = [[0, -l * 0.5], [w * 0.85, -l * 0.12], [w, l * 0.18], [w * 0.55, l * 0.42], [0, l * 0.52], [-w * 0.55, l * 0.42], [-w, l * 0.18], [-w * 0.85, -l * 0.12]];
  var th = max(0.004, w * 0.18);
  g.extrude(poly, th, x + dx * 0.5, y + dy * 0.5, z + dz * 0.5, [_ea.x, _ea.y, _ea.z], col, { axis: flat ? 'y' : 'x', curveX: -0.18 });
}
var _fq = new T.Quaternion(), _fz = new T.Vector3(0, 0, 1), _fd = new T.Vector3();
// muscled arm: smooth tapered segments with biceps/forearm bulge, blended elbow/wrist, palm, jointed fingers with curved claws.
// pts [[x,y,z],...] shoulder first; rs radius per point; cl: {n fingers, len finger+claw length, r claw radius, sp finger spacing, col claw colour, down hand droop}
function dinoArm(g, pts, rs, col, cl) {
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i + 1], rm = (rs[i] + rs[i + 1]) * 0.5 * (i === 0 ? 1.3 : 1.18);
    g.tube([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], [rs[i], rm, rs[i + 1]], col, { seg: 6, steps: 2 });
    g.sph(rs[i + 1] * 1.02, rs[i + 1] * 1.02, rs[i + 1] * 1.02, b[0], b[1], b[2], col, { s: [5, 4] });
  }
  if (!cl) return;
  var e = pts[pts.length - 1], q = pts[pts.length - 2], dy = e[1] - q[1], dz = e[2] - q[2], l = Math.sqrt(dy * dy + dz * dz) || 1, r = rs[rs.length - 1];
  var hy = dy / l * 0.9 - (cl.down || 0.25), hz = dz / l * 0.9, hl = Math.sqrt(hy * hy + hz * hz) || 1; hy /= hl; hz /= hl;
  g.sph(r * 1.15, r * 0.9, r * 1.25, e[0], e[1] + hy * r * 0.6, e[2] + hz * r * 0.6, col, { s: [5, 4] });
  for (var k = 0; k < cl.n; k++) {
    var lat = (k - (cl.n - 1) / 2) * cl.sp, fl = cl.len * 0.5, x0 = e[0] + lat * 0.7, y0 = e[1] + hy * r, z0 = e[2] + hz * r, x1 = e[0] + lat * 1.25, y1 = y0 + hy * fl, z1 = z0 + hz * fl;
    g.limb(x0, y0, z0, x1, y1, z1, r * 0.55, r * 0.42, col, { seg: 5 });
    claw(g, x1, y1, z1, hz * 0 + lat * 0.05, hy, hz, cl.len * 0.62, cl.r * 1.1, cl.col);
  }
}

// ---------------------------------------------------------------- Tyrannosaurus rex
reg((function () {
  var S = { id: 'tyrannosaurus', kind: 'biped', H: 4.0, J: 0.77, p0: 0.0, bs: 0.3, bh: 1.55, runAt: 5.5 };
  S.back = 0x6e5b3a; S.belly = 0xd2c196; S.footc = 0x3a3027; S.legc = 0x66543a;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x7d6944, bAt: -0.05, bW: 0.6, bars: { c: 0x2c2218, f: 6.5, w: 0.5, k: 0.75, from: -0.3, to: 1.6, ca0: 0.1 }, dors: { c: 0x40301e, k: 0.7 }, spots: { c: 0x3a2d1d, f: 7, k: 3, d: 0.1, a: 0.5 } });
  S.body = { rings: 22, seg: 10, keys: [[-0.5, 0.07, 0.1, 0.05], [-0.36, 0.11, 0.15, 0.045], [-0.15, 0.18, 0.225, 0.03], [0.05, 0.21, 0.27, 0.0], [0.28, 0.225, 0.29, -0.01], [0.5, 0.2, 0.26, 0.03], [0.64, 0.14, 0.18, 0.07], [0.74, 0.09, 0.1, 0.1]],
    extra: function (g) {
      for (var s = -1; s <= 1; s += 2) dinoArm(g, [[s * 0.17, -0.06, 0.5], [s * 0.205, -0.15, 0.565], [s * 0.205, -0.21, 0.65]], [0.036, 0.028, 0.02], 0x6a583a, { n: 2, len: 0.055, r: 0.007, sp: 0.014, col: 0x2a2420, down: 0.35 });
    } };
  S.neck = { n: 2, len: 0.5, at: [0, 0.1, 0.6], rr: 5, seg: 9, keys: [[0, 0.14, 0.14, 0], [0.25, 0.12, 0.125, 0], [0.5, 0.095, 0.1, 0]], rest: [0.95, 0.3], hrest: -0.12, stab: [0.5, 0.92], look: 0.55 };
  S.head = { len: 0.4, scale: 1.22, jaw: [-0.07, 0.06], build: function (g, jg, b) {
    var k = b ? 0.78 : 1, kf = 0.1, zz = function (z) { return z > kf ? kf + (z - kf) * k : z; }, sp = 0.8;
    var K = zk([[-0.05, 0.065, 0.085, 0], [0.02, 0.105, 0.125, 0], [0.1, 0.112, 0.132, 0], [0.17, 0.094, 0.12, -0.006], [0.24, 0.076, 0.102, -0.012], [0.31, 0.068, 0.088, -0.016], [0.365, 0.066, 0.074, -0.018], [0.395, 0.054, 0.06, -0.02], [0.412, 0.03, 0.036, -0.022], [0.42, 0.01, 0.014, -0.022]], k, kf);
    var K2 = zk([[0.02, 0.04, 0.045, -0.12], [0.12, 0.075, 0.048, -0.138], [0.24, 0.058, 0.04, -0.128], [0.34, 0.05, 0.034, -0.12], [0.39, 0.04, 0.028, -0.116], [0.408, 0.022, 0.018, -0.114], [0.416, 0.006, 0.008, -0.114]], k, kf);
    // half-width of the (boxy) skull section at height y, depth z
    var sideX = function (z, y) { var p = profAt(K, zz(z)), d = clamp(abs(y - p[2]) / p[1], 0, 1); return p[0] * Math.pow(max(0, 1 - Math.pow(d, 2 / sp)), sp / 2); };
    var lipY = function (z) { var p = profAt(K, z); return p[2] - p[1] * 0.58; };
    var base = fixZ(skin({ back: S.back, belly: shade(S.belly, 0.95), bAt: -0.35, bW: 0.5, bars: { c: 0x2c2218, f: 9, w: 0.4, k: 0.5, from: -0.1, to: 0.5, ca0: 0.3 } }), 0.6), dark = 0x2a2016;
    var hs = function (zc, ca, sa, x, y, z) {
      var c = base(zc, ca, sa, x, y, z), ax = abs(x), d = y - lipY(z), m;
      c = shade(c, 1 + (hash3(Math.floor(z * 110), Math.floor(y * 110), Math.floor(ax * 110)) - 0.5) * 0.12);
      if (d < 0) c = mixHex(c, shade(S.belly, 0.9), 0.4 * smooth(-d, 0, 0.012));
      c = mixHex(c, dark, 0.7 * (1 - smooth(abs(d), 0.002, 0.007)));
      var ea = (z - 0.205 * k) / (0.05 * k), eb = (y - 0.028) / 0.034; m = 1 - smooth(ea * ea + eb * eb, 0.45, 1);
      var ta = (z - 0.045) / 0.04, tb = (y - 0.09) / 0.03, m2 = 1 - smooth(ta * ta + tb * tb, 0.4, 1);
      m = max(m, m2); if (m > 0 && ax > 0.04) c = mixHex(c, dark, 0.72 * m);
      if (ca > 0.7 && z > 0.25 * k) c = mixHex(c, shade(S.back, 1.12), 0.3 * smooth(ca, 0.7, 0.95));
      return c;
    };
    g.loft(K, { rings: 28, seg: 12, cap0: true, cap1: true, superPow: sp, ridge: 0.1 }, hs);
    var er = b ? 0.03 : 0.02, ez = 0.145;
    eye(g, sideX(ez, 0.055) - er * 0.1, 0.055, zz(ez), er, 0xe8a820, false, shade(S.back, 0.82));
    for (var sB = -1; sB <= 1; sB += 2) {
      var bossC = shade(S.back, 0.92);
      g.sph(0.012, 0.014, 0.028, sB * (sideX(0.108, 0.113) - 0.003), 0.113, zz(0.108), bossC, { s: [6, 4], rot: [-0.35, 0, 0] });
      g.sph(0.014, 0.011, 0.024, sB * (sideX(0.178, 0.098) - 0.002), 0.098, zz(0.178), bossC, { s: [6, 4], rot: [0.2, 0, 0] });
      g.sph(0.009, 0.007, 0.022, sB * (sideX(0.355, 0.02) + 0.001), 0.022, zz(0.355), 0x120c08, { s: [5, 3], rot: [0, sB * 0.15, 0] });
      g.sph(0.014, 0.016, 0.03, sB * (sideX(0.355, 0.028) - 0.004), 0.034, zz(0.352), shade(S.back, 1.12), { s: [5, 4] });
      var lip = [], zl; for (zl = 0.04; zl <= 0.39; zl += 0.07) lip.push([sB * (sideX(zl, lipY(zz(zl))) + 0.001), lipY(zz(zl)), zz(zl)]);
      g.tube(lip, 0.0045, dark, { seg: 5, steps: 2 });
    }
    // upper teeth along the lip line: four small premaxillary incisors then big maxillary fangs
    for (var t = 0; t < 12; t++) {
      var tz = t < 4 ? 0.385 - t * 0.014 : 0.32 - (t - 4) * 0.026, tl = (t < 4 ? 0.026 : 0.034 + 0.016 * Math.sin((t - 4) / 7 * PI)) * (t % 2 ? 0.88 : 1), tw = t < 4 ? 0.0075 : 0.011, ty = lipY(zz(tz));
      for (var sT = -1; sT <= 1; sT += 2) g.cone(tw, tl, sT * sideX(tz, ty) * 0.93, ty - tl * 0.42, zz(tz), 0xf0ead6, { seg: 5, rot: [PI + 0.1, 0, -sT * 0.08] });
    }
    g.sph(0.05, 0.008, 0.15 * k, 0, -0.112, 0.2 * k, 0x8a4a44, { s: [6, 4] });
    var js = fixZ(skin({ back: mixHex(S.back, S.belly, 0.45), belly: shade(S.belly, 0.95), bAt: 0.4, bW: 0.6 }), 0.5);
    jg.loft(K2, { rings: 18, seg: 10, cap0: true, cap1: true, superPow: 0.85 }, function (zc, ca, sa, x, y, z) {
      var c = shade(js(zc, ca, sa, x, y, z), 1 + (hash3(Math.floor(z * 110), Math.floor(y * 110), Math.floor(abs(x) * 110)) - 0.5) * 0.12);
      return mixHex(c, dark, 0.6 * (1 - smooth(abs(y + 0.096), 0.002, 0.007)));
    });
    for (var sC = -1; sC <= 1; sC += 2) jg.sph(0.032, 0.045, 0.055, sC * 0.05, -0.095, 0.07, 0x5c4c30, { s: [5, 4] });
    jg.sph(0.026, 0.009, 0.12 * k, 0, -0.1, 0.2 * k, 0xb0626a, { s: [6, 4] });
    for (var u = 0; u < 12; u++) {
      var uz = 0.37 - u * 0.022, ul = u < 3 ? 0.02 : 0.026;
      for (var sU = -1; sU <= 1; sU += 2) jg.cone(0.0075, ul, sU * 0.04 * (u < 3 ? 0.8 : 1), -0.105 + ul * 0.42, zz(uz), 0xf0ead6, { seg: 5, rot: [-0.1, 0, sU * 0.1] });
    }
  } };
  S.tail = { n: 4, len: 1.35, at: [0.04, -0.36], rr: 5, seg: 8, keys: [[0, 0.1, 0.13, 0], [0.4, 0.075, 0.1, 0], [0.85, 0.04, 0.052, 0], [1.35, 0.008, 0.012, 0]], rest: [0.03, -0.02, -0.07, -0.14], amp: 0.1, gaitAmp: 0.1, stab: 0.85 };
  S.legs = { sep: 0.17, r: [1, 1.06, 0.62], w: [0.14, 0.062, 0.045], toeLen: 0.22, toeW: 0.034, claw: 0.05, spread: 0.36, dew: true, phis: 0.14, curl: 0.8 };
  S.gait = { Dw: 1.7, Dr: 3.4, bw: 0.62, br: 0.4, lw: 0.1, lr: 0.2, bob: 0.02, bobR: 0.05 };
  S.eat = { p: 0.28, crouch: 0.12, gy: 0.05, hp: -0.9, bite: 0.3, curve: 0.3, hdrop: 0.0 }; S.eatTear = true;
  S.sleep = { y: 0.3, p: 0.0, fx: 0.0, fy: 0.0, phi: 0.0, curl: 1.2, hp: -0.4, hy: 0.8, tail: 0, neckLift: 0.15 };
  S.call = { type: 'roar', neck: 0.3, hp: 0.55, jaw: 0.7, pitch: 0.1, min: 6, var: 14, dur: 2.4, shape: [1, 0.7] };
  S.swimDrop = 0.7;
  return S;
})());

// ================================================================ THEROPODS & OTHER BIPEDS
function bipedLegs(sep, r, w, toeLen, toeW, o) { var L = { sep: sep, r: r, w: w, toeLen: toeLen, toeW: toeW, claw: toeLen * 0.25, phis: 0.14, curl: 0.9, dew: true }; for (var k in o) L[k] = o[k]; return L; }
function rootSkin(S) { return S.sk; }

// ---------------------------------------------------------------- Velociraptor (feathered)
reg((function () {
  var S = { id: 'velociraptor', kind: 'biped', H: 0.55, J: 0.76, p0: 0.0, bs: 0.45, bh: 1.4, runAt: 3.5 };
  S.back = 0xb25c2c; S.belly = 0xf0e0c0; S.footc = 0x3a2c22; S.legc = 0x9a5028;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0xc0703a, bAt: -0.05, bW: 0.6, bars: { c: 0x2c1c14, f: 8, w: 0.5, k: 0.85, from: -0.5, to: 1.4, ca0: 0.2 }, dors: { c: 0x3a241a, k: 0.8 }, mott: 0.08 });
  S.body = { rings: 14, seg: 9, keys: [[-0.5, 0.05, 0.08, 0.05], [-0.35, 0.09, 0.12, 0.045], [-0.15, 0.13, 0.17, 0.03], [0.05, 0.145, 0.19, 0.0], [0.27, 0.14, 0.18, 0.01], [0.47, 0.1, 0.13, 0.05], [0.58, 0.06, 0.07, 0.09]],
    extra: function (g) {
      for (var i = 0; i < 7; i++) feather(g, 0, 0.18 - Math.abs(i - 3) * 0.006, -0.3 + i * 0.12, 0, 0.05, -0.1, 0.014, 0x4a2c1c, false);
      for (var row = 0; row < 3; row++) for (i = 0; i < 9; i++) for (var s = -1; s <= 1; s += 2) {
        var z = -0.3 + i * 0.085 + row * 0.02, a = 0.5 + row * 0.6, ry = 0.19 - Math.pow((z - 0.05) / 0.62, 2) * 0.1, rx = ry * 0.76;
        feather(g, s * rx * Math.sin(a) * 0.96, 0.01 + ry * Math.cos(a) * 0.96, z, s * 0.01, -0.015, -0.11, 0.022, shade(S.sk(z, Math.max(0.5, Math.cos(a)), 1, 0, 0, z), 0.9 + 0.1 * row), false);
      }
    } };
  S.neck = { n: 2, len: 0.42, at: [0, 0.1, 0.52], rr: 4, seg: 7, keys: [[0, 0.075, 0.085, 0], [0.42, 0.045, 0.05, 0]], rest: [0.9, 0.5], hrest: -0.2, stab: [0.5, 0.9], look: 0.8 };
  S.head = { len: 0.4, scale: 1.0, jaw: [-0.04, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { keys: [[-0.03, 0.045, 0.055, 0], [0.04, 0.066, 0.078, 0.0], [0.15, 0.055, 0.06, -0.004], [0.27, 0.035, 0.04, -0.01], [0.36, 0.025, 0.03, -0.008], [0.395, 0.014, 0.02, -0.006]],
      jkeys: [[0.03, 0.03, 0.025, -0.075], [0.15, 0.045, 0.028, -0.082], [0.28, 0.03, 0.02, -0.075], [0.37, 0.016, 0.014, -0.068], [0.39, 0.01, 0.01, -0.066]], eye: [0.058, 0.04, 0.12, 0.016], nos: [0.012, 0.012, 0.38, 0.006],
      teeth: { z0: 0.2, z1: 0.37, n: 8, x: 0.03, y: -0.062, len: 0.025, w: 0.005 }, jteeth: { z0: 0.2, z1: 0.36, n: 7, x: 0.024, y: -0.063, len: 0.02, w: 0.005 },
      extra: function (gg, k) { for (var i = 0; i < 5; i++) feather(gg, (i - 2) * 0.018, 0.075 - Math.abs(i - 2) * 0.008, -0.02, (i - 2) * 0.012, 0.01 + (i % 2) * 0.02, -0.11, 0.012, i % 2 ? 0x3a241a : 0x6a3a20, false); } });
  } };
  S.tail = { n: 4, len: 1.7, at: [0.04, -0.4], rr: 4, seg: 7, keys: [[0, 0.075, 0.1, 0], [0.5, 0.05, 0.065, 0], [1.2, 0.028, 0.035, 0], [1.7, 0.012, 0.016, 0]], rest: [0.04, 0.03, 0.0, -0.03], amp: 0.05, gaitAmp: 0.06, stab: 0.92, run: 0.02,
    each: function (g, i, n, seg) { if (i === n - 1) { for (var k = -3; k <= 3; k++) feather(g, k * 0.006, 0.0, -seg * 0.55, k * 0.035, 0.0, -0.3, 0.02, k % 2 ? 0x3a241a : 0xe8d8b8, true); } else for (var s = -1; s <= 1; s += 2) feather(g, s * 0.03, 0.01, -seg * 0.3, s * 0.07, -0.02, -0.12, 0.013, 0x5a321e, true); } };
  S.arms = { at: [0.12, 0.03, 0.4], rest: 0.15, swing: 0.4, out: 0.1, flick: true, build: function (g) {
    dinoArm(g, [[0, 0, 0], [0, -0.075, -0.035], [0, -0.095, 0.075]], [0.026, 0.02, 0.016], 0x9a5028, { n: 3, len: 0.07, r: 0.008, sp: 0.014, down: 0.15 });
    for (var i = 0; i < 8; i++) { var t = i / 7; feather(g, 0.014, -0.075 - 0.02 * t, -0.035 + 0.11 * t, 0.0, -0.06 - 0.02 * t, -0.2 - 0.03 * t, 0.022, i % 2 ? 0x3a241a : 0xe8d8b8, false); }
    for (i = 0; i < 6; i++) feather(g, 0.02, -0.06 - 0.003 * i, -0.025 + 0.085 * i / 5, 0.0, -0.04, -0.14, 0.022, i % 2 ? 0x5a321e : 0x7a4428, false);
    for (i = 0; i < 4; i++) feather(g, 0.012, -0.01 - 0.018 * i, -0.015 + 0.01 * i, 0.0, -0.025, -0.09, 0.017, 0x4a2c1c, false);
  } };
  S.legs = bipedLegs(0.12, [1, 1.18, 0.95], [0.085, 0.036, 0.028], 0.19, 0.017, { claw: 0.04, thighExtra: function (g) { for (var i = 0; i < 7; i++) for (var s = -1; s <= 1; s += 2) feather(g, s * 0.075, -0.02 - i * 0.014, -0.075, s * 0.012, -0.06, -0.075, 0.02, i % 2 ? 0x5a3220 : 0x7a4428, false); },
    footExtra: function (g, S) { var L = S.legs.L[2]; g.tube([[0.035, -L + 0.012, 0.0], [0.035, -L + 0.07, 0.045], [0.035, -L + 0.095, 0.1]], [0.016, 0.013, 0.01], 0x3a2c22, { seg: 6, steps: 2 }); claw(g, 0.035, -L + 0.095, 0.1, 0, 0.35, 1, 0.09, 0.014, 0xe6dcc0); } });
  S.gait = { Dw: 1.9, Dr: 3.8, bw: 0.58, br: 0.38, lw: 0.1, lr: 0.2, bob: 0.025, bobR: 0.06 };
  S.eat = { p: 0.35, crouch: 0.14, gy: 0.05, hp: -0.9, bite: 0.4, curve: 0.25 }; S.eatTear = true;
  S.sleep = { y: 0.3, fx: 0.0, phi: 0, curl: 1.4, hp: -0.4, hy: 0.7 };
  S.call = { type: 'roar', neck: 0.3, hp: 0.5, jaw: 0.6, pitch: 0.08, min: 7, var: 12, dur: 1.8, shape: [1, 0.8] }; S.swimDrop = 0.3;
  return S;
})());

// ---------------------------------------------------------------- Compsognathus (tiny)
reg((function () {
  var S = { id: 'compsognathus', kind: 'biped', H: 0.3, J: 0.74, p0: 0.0, bs: 0.5, bh: 1.35, runAt: 2.4 };
  S.back = 0xa9b840; S.belly = 0xf2ecc4; S.footc = 0x4a3c28; S.legc = 0x93a038;
  S.sk = skin({ back: S.back, belly: S.belly, bAt: -0.05, bW: 0.6, bars: { c: 0x3c3a1c, f: 9, w: 0.5, k: 0.85, from: -0.6, to: 1.6, ca0: 0.1 }, dors: { c: 0x4a4a1c, k: 0.8 }, spots: { c: 0x3c3a1c, f: 9, k: 4, d: 0.14, a: 0.6 } });
  S.body = { rings: 12, seg: 8, keys: [[-0.5, 0.045, 0.07, 0.05], [-0.35, 0.08, 0.11, 0.04], [-0.12, 0.115, 0.15, 0.025], [0.1, 0.125, 0.16, 0.02], [0.3, 0.1, 0.13, 0.04], [0.45, 0.065, 0.08, 0.07], [0.52, 0.04, 0.05, 0.09]],
    extra: function (g) { for (var i = 0; i < 12; i++) for (var s = -1; s <= 1; s += 2) feather(g, s * 0.03, 0.17 - Math.abs(i - 5) * 0.004, -0.32 + i * 0.065, s * 0.008, 0.03, -0.06, 0.007, 0x7a8830, false); } };
  S.neck = { n: 2, len: 0.45, at: [0, 0.09, 0.45], rr: 4, seg: 7, keys: [[0, 0.06, 0.065, 0], [0.45, 0.04, 0.045, 0]], rest: [1.0, 0.4], hrest: -0.25, stab: [0.5, 0.9], look: 0.9 };
  S.head = { len: 0.3, scale: 1.0, jaw: [-0.03, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.04, 0.05, 0], [0.05, 0.062, 0.07, 0], [0.14, 0.05, 0.055, -0.004], [0.24, 0.03, 0.036, -0.01], [0.3, 0.015, 0.02, -0.012]], jkeys: [[0.03, 0.028, 0.024, -0.062], [0.14, 0.04, 0.025, -0.068], [0.26, 0.022, 0.017, -0.062], [0.3, 0.01, 0.01, -0.06]],
      eye: [0.058, 0.03, 0.1, 0.022], nos: [0.01, 0.008, 0.29, 0.005], teeth: { z0: 0.16, z1: 0.27, n: 6, x: 0.025, y: -0.055, len: 0.02, w: 0.004 },
      extra: function (gg, k, b, jg) { var bc = shade(S.back, 0.82);
        for (var s = -1; s <= 1; s += 2) gg.tube([[s * 0.045, 0.058 * k, 0.05], [s * 0.056, 0.058 * k, 0.115 * k], [s * 0.044, 0.04 * k, 0.175 * k]], [0.011, 0.013, 0.006], bc, { seg: 5, steps: 2 });
        gg.tube([[0, 0.072, 0.1 * k], [0, 0.055, 0.2 * k], [0, 0.03, 0.27 * k]], [0.008, 0.012, 0.007], bc, { seg: 5, steps: 2 }); } });
  } };
  S.tail = { n: 4, len: 1.8, at: [0.04, -0.45], rr: 4, seg: 6, keys: [[0, 0.065, 0.085, 0], [0.5, 0.04, 0.052, 0], [1.2, 0.022, 0.028, 0], [1.8, 0.008, 0.01, 0]], rest: [0.04, 0.02, 0.0, -0.03], amp: 0.12, gaitAmp: 0.1, stab: 0.9, freq: 1.4 };
  S.arms = { at: [0.1, 0.0, 0.38], rest: 0.2, swing: 0.5, out: 0.1, flick: true, build: function (g) { dinoArm(g, [[0, 0, 0], [0, -0.09, 0.05], [0, -0.13, 0.13]], [0.02, 0.016, 0.012], 0x93a038, { n: 2, len: 0.05, r: 0.007, sp: 0.012, down: 0.1 }); } };
  S.legs = bipedLegs(0.09, [1, 1.15, 0.95], [0.05, 0.025, 0.02], 0.17, 0.014, { claw: 0.035, phis: 0.1 });
  S.gait = { Dw: 2.0, Dr: 4.0, bw: 0.55, br: 0.35, lw: 0.1, lr: 0.22, bob: 0.03, bobR: 0.06 };
  S.eat = { p: 0.3, crouch: 0.12, gy: 0.05, hp: -0.9, bite: 0.3, curve: 0.2 };
  S.sleep = { y: 0.28, curl: 1.5, hp: -0.4, hy: 0.7 }; S.swimDrop = 0.3;
  return S;
})());

// ---------------------------------------------------------------- Dilophosaurus (twin crests)
reg((function () {
  var S = { id: 'dilophosaurus', kind: 'biped', H: 1.5, J: 0.77, p0: 0.0, bs: 0.35, bh: 1.5, runAt: 4.5 };
  S.back = 0x6f8c44; S.belly = 0xe2d89a; S.footc = 0x3a3a24; S.legc = 0x61803c;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x7e9a4c, bAt: -0.05, bW: 0.6, spots: { c: 0x2c3a1c, f: 7, k: 4, d: 0.22, a: 0.75 }, bars: { c: 0x34441e, f: 5, w: 0.3, k: 0.5, from: -0.5, to: 1.4, ca0: 0.1 }, dors: { c: 0x3a4a1e, k: 0.6 } });
  S.body = { rings: 16, seg: 9, keys: [[-0.48, 0.05, 0.08, 0.05], [-0.35, 0.09, 0.13, 0.045], [-0.15, 0.14, 0.19, 0.03], [0.05, 0.16, 0.22, 0.0], [0.28, 0.16, 0.22, 0.0], [0.5, 0.125, 0.17, 0.04], [0.63, 0.08, 0.1, 0.08]] };
  S.neck = { n: 2, len: 0.6, at: [0, 0.1, 0.55], rr: 4, seg: 8, keys: [[0, 0.1, 0.105, 0], [0.3, 0.075, 0.08, 0], [0.6, 0.06, 0.065, 0]], rest: [1.0, 0.35], hrest: -0.15, stab: [0.5, 0.9], look: 0.7 };
  S.head = { len: 0.45, scale: 1.0, jaw: [-0.05, 0.06], build: function (g, jg, b) {
    headStd(g, jg, b, S, { keys: [[-0.03, 0.05, 0.065, 0], [0.04, 0.075, 0.09, 0], [0.16, 0.065, 0.075, -0.004], [0.3, 0.048, 0.054, -0.012], [0.35, 0.04, 0.046, -0.013], [0.41, 0.046, 0.046, -0.014], [0.445, 0.034, 0.036, -0.016], [0.455, 0.02, 0.022, -0.016]],
      jkeys: [[0.03, 0.035, 0.03, -0.092], [0.15, 0.056, 0.034, -0.1], [0.3, 0.04, 0.026, -0.092], [0.43, 0.026, 0.02, -0.086], [0.46, 0.016, 0.014, -0.084]], eye: [0.072, 0.045, 0.14, 0.02], nos: [0.02, 0.014, 0.44, 0.007],
      teeth: { z0: 0.2, z1: 0.44, n: 9, x: 0.04, y: -0.075, len: 0.032, w: 0.006 }, jteeth: { z0: 0.22, z1: 0.42, n: 7, x: 0.03, y: -0.085, len: 0.024, w: 0.006 },
      extra: function (gg, k) { var cc = function (x, y, z) { var t = smooth(y, 0.07, 0.2); return shade(mixHex(mixHex(0x6f8c44, 0xc23a28, smooth(y, 0.06, 0.1)), 0xf0a040, t * t), 0.9 + 0.2 * fract(z * 17 + y * 3) * (y > 0.09 ? 1 : 0)); };
        var poly = [[0.05, 0.08], [0.1, 0.08], [0.135, 0.1], [0.172, 0.14], [0.2, 0.185], [0.205, 0.22], [0.185, 0.25], [0.15, 0.275], [0.115, 0.3], [0.09, 0.315], [0.06, 0.3]].map(function (p) { return [p[0], p[1] * k]; });
        for (var s = -1; s <= 1; s += 2) gg.extrude(poly, 0.012, s * 0.03, 0.0, 0.0, [0, 0, s * 0.14], cc, { axis: 'x', bev: 0.004, curveX: s * 1.3, curveY: s * 0.5 }); } });
  } };
  S.tail = { n: 4, len: 1.45, at: [0.04, -0.4], rr: 5, seg: 8, keys: [[0, 0.085, 0.12, 0], [0.4, 0.065, 0.09, 0], [0.95, 0.035, 0.05, 0], [1.45, 0.01, 0.014, 0]], rest: [0.03, -0.01, -0.06, -0.12], amp: 0.1, gaitAmp: 0.11, stab: 0.85 };
  S.arms = { at: [0.12, 0.0, 0.48], rest: 0.35, swing: 0.3, out: 0.12, build: function (g) { dinoArm(g, [[0, 0, 0], [0, -0.09, 0.04], [0, -0.14, 0.14]], [0.03, 0.022, 0.018], 0x61803c, { n: 3, len: 0.06, r: 0.008, sp: 0.014, down: 0.15 }); } };
  S.legs = bipedLegs(0.14, [1, 1.1, 0.68], [0.1, 0.045, 0.036], 0.2, 0.026, { claw: 0.05 });
  S.gait = { Dw: 1.8, Dr: 3.6, bw: 0.6, br: 0.4, lw: 0.1, lr: 0.2, bob: 0.02, bobR: 0.05 };
  S.eat = { p: 0.3, crouch: 0.13, gy: 0.05, hp: -0.9, bite: 0.3, curve: 0.3 }; S.eatTear = true;
  S.sleep = { y: 0.3, curl: 1.2, hp: -0.4, hy: 0.8 };
  S.call = { type: 'roar', neck: 0.3, hp: 0.5, jaw: 0.65, pitch: 0.08, min: 7, var: 14, dur: 2.0, shape: [1, 0.7] }; S.swimDrop = 0.4;
  return S;
})());

// ---------------------------------------------------------------- Cryolophosaurus (forward-curled crest)
reg((function () {
  var S = { id: 'cryolophosaurus', kind: 'biped', H: 1.45, J: 0.77, p0: 0.0, bs: 0.35, bh: 1.5, runAt: 4.5 };
  S.back = 0x7f95a6; S.belly = 0xeef0ee; S.footc = 0x38424a; S.legc = 0x74899a;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x93a8b6, bAt: -0.05, bW: 0.6, bars: { c: 0x2a3640, f: 7, w: 0.45, k: 0.8, from: -0.5, to: 1.4, ca0: 0.15 }, dors: { c: 0x34424e, k: 0.6 }, mott: 0.08 });
  S.body = { rings: 16, seg: 9, keys: [[-0.48, 0.05, 0.08, 0.05], [-0.35, 0.09, 0.13, 0.045], [-0.15, 0.15, 0.2, 0.03], [0.05, 0.17, 0.23, 0.0], [0.28, 0.17, 0.23, 0.0], [0.5, 0.13, 0.18, 0.04], [0.63, 0.085, 0.11, 0.08]] };
  S.neck = { n: 2, len: 0.55, at: [0, 0.1, 0.55], rr: 4, seg: 8, keys: [[0, 0.105, 0.11, 0], [0.3, 0.08, 0.085, 0], [0.55, 0.065, 0.07, 0]], rest: [1.0, 0.35], hrest: -0.15, stab: [0.5, 0.9], look: 0.7 };
  S.head = { len: 0.42, scale: 1.0, jaw: [-0.05, 0.06], build: function (g, jg, b) {
    headStd(g, jg, b, S, { keys: [[-0.03, 0.05, 0.065, 0], [0.04, 0.078, 0.092, 0], [0.16, 0.068, 0.078, -0.004], [0.28, 0.055, 0.06, -0.01], [0.37, 0.05, 0.05, -0.013], [0.42, 0.036, 0.038, -0.015]],
      jkeys: [[0.03, 0.036, 0.03, -0.095], [0.15, 0.06, 0.036, -0.103], [0.3, 0.043, 0.028, -0.095], [0.4, 0.028, 0.02, -0.088], [0.43, 0.017, 0.014, -0.086]], eye: [0.075, 0.045, 0.13, 0.02], nos: [0.02, 0.014, 0.41, 0.007],
      teeth: { z0: 0.18, z1: 0.4, n: 8, x: 0.043, y: -0.077, len: 0.03, w: 0.006 }, jteeth: { z0: 0.2, z1: 0.4, n: 7, x: 0.032, y: -0.087, len: 0.022, w: 0.006 },
      extra: function (gg, k) { // transverse fan crest across the brow, curled forward into a quiff
        var cc = function (x, y, z) { var t = smooth(y, 0.06, 0.16), r = fract(x * 34) < 0.3 ? 0.78 : 1; return shade(mixHex(0x7f95a6, mixHex(0xd2492e, 0xf08a3c, smooth(y, 0.15, 0.24)), t), r); };
        var poly = [[-0.07, 0.05], [-0.09, 0.11], [-0.1, 0.17], [-0.08, 0.215], [-0.05, 0.2], [-0.035, 0.235], [-0.01, 0.2], [0.01, 0.245], [0.035, 0.2], [0.05, 0.225], [0.08, 0.2], [0.1, 0.17], [0.09, 0.11], [0.07, 0.05]];
        gg.extrude(poly, 0.022, 0, 0, 0.115 * k, [0, 0, 0], cc, { axis: 'z', bev: 0.007, curveX: -0.9, curveY: -1.6 }); } });
  } };
  S.tail = { n: 4, len: 1.45, at: [0.04, -0.4], rr: 5, seg: 8, keys: [[0, 0.085, 0.12, 0], [0.4, 0.065, 0.09, 0], [0.95, 0.035, 0.05, 0], [1.45, 0.01, 0.014, 0]], rest: [0.03, -0.01, -0.06, -0.12], amp: 0.1, gaitAmp: 0.11, stab: 0.85 };
  S.arms = { at: [0.12, 0.0, 0.48], rest: 0.35, swing: 0.3, out: 0.12, build: function (g) { dinoArm(g, [[0, 0, 0], [0, -0.09, 0.04], [0, -0.14, 0.14]], [0.03, 0.022, 0.018], 0x74899a, { n: 3, len: 0.06, r: 0.008, sp: 0.014, down: 0.15 }); } };
  S.legs = bipedLegs(0.14, [1, 1.1, 0.68], [0.1, 0.045, 0.036], 0.2, 0.026, { claw: 0.05 });
  S.gait = { Dw: 1.8, Dr: 3.6, bw: 0.6, br: 0.4, lw: 0.1, lr: 0.2, bob: 0.02, bobR: 0.05 };
  S.eat = { p: 0.3, crouch: 0.13, gy: 0.05, hp: -0.9, bite: 0.3, curve: 0.3 }; S.eatTear = true;
  S.sleep = { y: 0.3, curl: 1.2, hp: -0.4, hy: 0.8 };
  S.call = { type: 'roar', neck: 0.3, hp: 0.5, jaw: 0.65, pitch: 0.08, min: 7, var: 14, dur: 2.0, shape: [1, 0.7] }; S.swimDrop = 0.4;
  return S;
})());

// ---------------------------------------------------------------- Baryonyx (crocodile snout, thumb claw)
reg((function () {
  var S = { id: 'baryonyx', kind: 'biped', H: 2.4, J: 0.74, p0: 0.0, bs: 0.33, bh: 1.5, runAt: 4.0 };
  S.back = 0x546a40; S.belly = 0xdcd2a0; S.footc = 0x30382a; S.legc = 0x4c613a;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x62784a, bAt: -0.05, bW: 0.6, spots: { c: 0x1e2a18, f: 6, k: 4, d: 0.28, a: 0.8 }, bars: { c: 0xb86a2a, f: 5, w: 0.22, k: 0.55, from: -0.4, to: 1.3, ca0: 0.3 }, dors: { c: 0x2c3a22, k: 0.7 }, mott: 0.07 });
  S.body = { rings: 18, seg: 10, keys: [[-0.5, 0.06, 0.09, 0.05], [-0.36, 0.1, 0.14, 0.045], [-0.15, 0.16, 0.21, 0.03], [0.05, 0.19, 0.25, 0.0], [0.3, 0.19, 0.25, 0.0], [0.52, 0.15, 0.2, 0.03], [0.66, 0.1, 0.12, 0.07]] };
  S.neck = { n: 2, len: 0.55, at: [0, 0.1, 0.58], rr: 4, seg: 8, keys: [[0, 0.115, 0.12, 0], [0.28, 0.09, 0.095, 0], [0.55, 0.07, 0.075, 0]], rest: [0.95, 0.3], hrest: -0.18, stab: [0.5, 0.9], look: 0.7 };
  S.head = { len: 0.58, scale: 1.0, jaw: [-0.045, 0.06], build: function (g, jg, b) {
    headStd(g, jg, b, S, { kf: 0.12, bk: 0.8, keys: [[-0.03, 0.05, 0.065, 0], [0.04, 0.072, 0.082, 0], [0.16, 0.062, 0.062, -0.006], [0.3, 0.042, 0.042, -0.014], [0.45, 0.04, 0.036, -0.018], [0.52, 0.052, 0.034, -0.02], [0.57, 0.042, 0.028, -0.021], [0.585, 0.025, 0.018, -0.022]],
      jkeys: [[0.03, 0.034, 0.028, -0.085], [0.15, 0.052, 0.03, -0.088], [0.3, 0.036, 0.022, -0.082], [0.45, 0.034, 0.02, -0.078], [0.54, 0.044, 0.022, -0.077], [0.585, 0.025, 0.014, -0.075]], eye: [0.066, 0.042, 0.1, 0.017], nos: [0.02, 0.016, 0.5, 0.007],
      teeth: { z0: 0.24, z1: 0.56, n: 12, x: 0.04, y: -0.04, len: 0.024, w: 0.005, col: 0xe8e0c8 }, jteeth: { z0: 0.26, z1: 0.54, n: 11, x: 0.032, y: -0.082, len: 0.02, w: 0.005, col: 0xe8e0c8 },
      extra: function (gg, k) { var cc = function (x, y, z) { return mixHex(0x546a40, 0xb8522a, smooth(y, 0.07, 0.115)); };
        gg.extrude([[0.05, 0.07], [0.085, 0.09], [0.11, 0.13], [0.118, 0.19], [0.1, 0.24], [0.075, 0.26], [0.05, 0.25]].map(function (p) { return [p[0], p[1] * k]; }), 0.01, 0, 0, 0, [0, 0, 0], cc, { axis: 'x', bev: 0.003, curveX: 0 });
        for (var s = -1; s <= 1; s += 2) gg.tube([[s * 0.05, 0.07, 0.03], [s * 0.06, 0.066, 0.1 * k], [s * 0.05, 0.05, 0.17 * k]], [0.011, 0.014, 0.006], shade(S.back, 0.82), { seg: 5, steps: 2 }); } });
  } };
  S.tail = { n: 4, len: 1.55, at: [0.04, -0.42], rr: 5, seg: 8, keys: [[0, 0.09, 0.13, 0], [0.45, 0.07, 0.1, 0], [1.0, 0.04, 0.06, 0], [1.55, 0.012, 0.018, 0]], rest: [0.03, -0.01, -0.07, -0.12], amp: 0.1, gaitAmp: 0.11, stab: 0.85, scull: 1.3 };
  S.arms = { at: [0.15, 0.0, 0.5], rest: 0.45, swing: 0.25, out: 0.15, build: function (g) {
    dinoArm(g, [[0, 0, 0], [0, -0.1, 0.05], [0, -0.17, 0.16]], [0.04, 0.03, 0.025], 0x4c613a, { n: 2, len: 0.06, r: 0.01, sp: 0.02, down: 0.15 });
    claw(g, 0.032, -0.15, 0.15, 0.15, -0.35, 0.75, 0.17, 0.022, 0xe6dcc0);
  } };
  S.legs = bipedLegs(0.15, [1, 1.12, 0.65], [0.11, 0.05, 0.04], 0.22, 0.028, { claw: 0.05 });
  S.gait = { Dw: 1.7, Dr: 3.4, bw: 0.62, br: 0.42, lw: 0.1, lr: 0.2, bob: 0.02, bobR: 0.05 };
  S.eat = { p: 0.3, crouch: 0.12, gy: 0.05, hp: -0.8, bite: 0.25, curve: 0.3 };
  S.sleep = { y: 0.3, curl: 1.2, hp: -0.4, hy: 0.8 };
  S.call = { type: 'roar', neck: 0.3, hp: 0.5, jaw: 0.55, pitch: 0.08, min: 8, var: 14, dur: 2.0, shape: [1, 0.7] };
  S.swimDrop = 0.5; S.swimNeck = 0.55; S.paddleA = 1.1;
  return S;
})());

// ---------------------------------------------------------------- Carnotaurus (horns, tiny arms, deep short skull)
reg((function () {
  var S = { id: 'carnotaurus', kind: 'biped', H: 2.2, J: 0.78, p0: 0.0, bs: 0.33, bh: 1.5, runAt: 5.0 };
  S.back = 0xa8432c; S.belly = 0xe6d4a8; S.footc = 0x3a2820; S.legc = 0x9a3e28;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0xb84e32, bAt: -0.05, bW: 0.6, bars: { c: 0x3a1c14, f: 6, w: 0.5, k: 0.8, from: -0.5, to: 1.4, ca0: 0.15 }, dors: { c: 0x44201a, k: 0.7 }, spots: { c: 0xd8b070, f: 8, k: 3, d: 0.08, a: 0.7 } });
  S.body = { rings: 17, seg: 10, keys: [[-0.5, 0.06, 0.09, 0.05], [-0.36, 0.1, 0.15, 0.045], [-0.15, 0.17, 0.215, 0.03], [0.05, 0.19, 0.245, 0.0], [0.28, 0.19, 0.25, 0.0], [0.5, 0.15, 0.2, 0.03], [0.64, 0.1, 0.12, 0.07]],
    extra: function (g) {
      for (var s = -1; s <= 1; s += 2) dinoArm(g, [[s * 0.17, -0.02, 0.5], [s * 0.2, -0.09, 0.545], [s * 0.2, -0.125, 0.585]], [0.032, 0.022, 0.016], 0x9a3e28, { n: 2, len: 0.035, r: 0.006, sp: 0.012, down: 0.4, col: 0x2a2420 }); } };
  S.neck = { n: 2, len: 0.55, at: [0, 0.1, 0.58], rr: 4, seg: 8, keys: [[0, 0.12, 0.125, 0], [0.28, 0.1, 0.105, 0], [0.55, 0.08, 0.085, 0]], rest: [1.0, 0.3], hrest: -0.15, stab: [0.5, 0.9], look: 0.6 };
  S.head = { len: 0.38, scale: 1.1, jaw: [-0.06, 0.06], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.055, 0.07, 0], [0.04, 0.1, 0.12, 0], [0.14, 0.098, 0.115, -0.006], [0.24, 0.075, 0.09, -0.018], [0.32, 0.06, 0.07, -0.03], [0.375, 0.045, 0.052, -0.034], [0.395, 0.026, 0.03, -0.036]],
      jkeys: [[0.03, 0.04, 0.035, -0.115], [0.14, 0.07, 0.042, -0.128], [0.27, 0.052, 0.034, -0.12], [0.36, 0.036, 0.026, -0.116], [0.39, 0.02, 0.016, -0.114]], eye: [0.092, 0.05, 0.12, 0.019], nos: [0.022, 0.0, 0.385, 0.009],
      teeth: { z0: 0.18, z1: 0.37, n: 8, x: 0.048, y: -0.098, len: 0.03, w: 0.007 }, jteeth: { z0: 0.2, z1: 0.36, n: 6, x: 0.036, y: -0.112, len: 0.024, w: 0.007 },
      extra: function (gg, k) { var hc = function (px, py, pz, nx, ny, nz, t) { return shade(mixHex(shade(S.back, 0.9), 0xece0c4, smooth(t, 0.18, 0.5)), fract(t * 7) < 0.25 && t > 0.2 ? 0.88 : 1); }, bc = shade(S.back, 0.85);
        for (var s = -1; s <= 1; s += 2) {
          gg.tube([[s * 0.062, 0.08, 0.105 * k], [s * 0.09, 0.14, 0.09 * k], [s * 0.15, 0.2, 0.06 * k], [s * 0.2, 0.245, 0.04 * k]], [0.045, 0.032, 0.02, 0.002], hc, { seg: 7, steps: 3 });
          gg.tube([[s * 0.06, 0.085, 0.06 * k], [s * 0.085, 0.108, 0.115 * k], [s * 0.085, 0.1, 0.185 * k]], [0.014, 0.018, 0.009], bc, { seg: 5, steps: 2 });
        }
        gg.tube([[0, 0.095, 0.17 * k], [0, 0.08, 0.26 * k], [0, 0.045, 0.345 * k]], [0.018, 0.018, 0.011], bc, { seg: 6, steps: 3 }); } });
  } };
  S.tail = { n: 4, len: 1.5, at: [0.04, -0.42], rr: 5, seg: 8, keys: [[0, 0.1, 0.13, 0], [0.4, 0.08, 0.1, 0], [1.0, 0.04, 0.055, 0], [1.5, 0.01, 0.014, 0]], rest: [0.03, -0.01, -0.06, -0.12], amp: 0.1, gaitAmp: 0.11, stab: 0.85 };
  S.legs = bipedLegs(0.16, [1, 1.15, 0.68], [0.11, 0.046, 0.036], 0.2, 0.026, { claw: 0.045 });
  S.gait = { Dw: 1.9, Dr: 3.8, bw: 0.6, br: 0.4, lw: 0.1, lr: 0.2, bob: 0.02, bobR: 0.05 };
  S.eat = { p: 0.3, crouch: 0.13, gy: 0.05, hp: -0.9, bite: 0.3, curve: 0.3 }; S.eatTear = true;
  S.sleep = { y: 0.31, curl: 1.2, hp: -0.4, hy: 0.8 };
  S.call = { type: 'roar', neck: 0.3, hp: 0.5, jaw: 0.65, pitch: 0.08, min: 7, var: 14, dur: 2.0, shape: [1, 0.7] }; S.swimDrop = 0.4;
  return S;
})());

// ---------------------------------------------------------------- Spinosaurus (sail, long snout, short legs, swims)
reg((function () {
  var S = { id: 'spinosaurus', kind: 'biped', H: 3.0, J: 0.64, p0: -0.02, bs: 0.3, bh: 1.5, runAt: 4.0 };
  S.back = 0x3f6f80; S.belly = 0xdde4cc; S.footc = 0x24343a; S.legc = 0x386070;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x4a8090, bAt: -0.05, bW: 0.6, bars: { c: 0x1c2e38, f: 5.5, w: 0.5, k: 0.7, from: -0.7, to: 1.6, ca0: 0.15 }, dors: { c: 0x22404c, k: 0.7 }, spots: { c: 0x1c2e38, f: 7, k: 3, d: 0.1, a: 0.6 } });
  S.body = { rings: 22, seg: 10, keys: [[-0.62, 0.07, 0.1, 0.05], [-0.42, 0.11, 0.15, 0.04], [-0.2, 0.16, 0.2, 0.02], [0.05, 0.19, 0.23, 0.0], [0.35, 0.2, 0.23, 0.0], [0.62, 0.16, 0.2, 0.03], [0.82, 0.1, 0.13, 0.07], [0.9, 0.06, 0.08, 0.09]],
    extra: function (g) {
      var zs = [], tops = [], n = 14, i, s;
      for (i = 0; i < n; i++) { var u = i / (n - 1), z = -0.3 + u * 0.93; zs.push(z + (z - 0.1) * 0.08); tops.push(0.27 + 0.6 * Math.pow(Math.sin(PI * (0.04 + 0.92 * Math.pow(u, 0.85))), 0.8)); }
      var sailCol = function (x, y, z) { var d = Math.abs(((z + 0.3) / 0.93 * (n - 1)) % 1 - 0.5) * 2, up = smooth(y, 0.25, 0.9), c = mixHex(mixHex(0x7a2e26, 0xd24a2c, smooth(y, 0.22, 0.45)), 0xf29a40, up * up);
        return shade(c, (d > 0.8 ? 0.8 : 1) * (0.94 + 0.12 * hash3(Math.floor(y * 14), Math.floor(z * 20), 3))); };
      var poly = [[0.17, zs[0] - 0.02]];
      for (i = 0; i < n; i++) { poly.push([tops[i] * 0.97 + 0.01, zs[i]]); if (i < n - 1) poly.push([Math.min(tops[i], tops[i + 1]) * 0.88, (zs[i] + zs[i + 1]) / 2]); }
      poly.push([0.17, zs[n - 1] + 0.02]);
      g.extrude(poly, 0.018, 0, 0, 0, [0, 0, 0], sailCol, { axis: 'x', bev: 0.006, curveY: 0.16 });
      for (i = 0; i < n; i++) g.tube([[0, 0.17, zs[i]], [0, 0.17 + (tops[i] - 0.17) * 0.5, zs[i] - 0.004], [0, tops[i] + 0.035, zs[i] - 0.012]], [0.022, 0.014, 0.006], function (px, py, pz, nx, ny, nz, t) { return mixHex(shade(S.back, 0.85), 0xe8602e, smooth(t, 0.25, 0.7)); }, { seg: 5, steps: 2 });
      for (s = -1; s <= 1; s += 2) dinoArm(g, [[s * 0.19, -0.02, 0.62], [s * 0.24, -0.14, 0.72], [s * 0.24, -0.22, 0.86]], [0.05, 0.038, 0.03], 0x386070, { n: 3, len: 0.13, r: 0.013, sp: 0.024, down: 0.5, col: 0xe6dcc0 });
    } };
  S.neck = { n: 2, len: 0.6, at: [0, 0.1, 0.78], rr: 4, seg: 8, keys: [[0, 0.115, 0.12, 0], [0.3, 0.09, 0.095, 0], [0.6, 0.062, 0.07, 0]], rest: [0.7, 0.2], hrest: -0.1, stab: [0.5, 0.9], look: 0.6 };
  S.head = { len: 0.66, scale: 1.0, jaw: [-0.04, 0.06], build: function (g, jg, b) {
    headStd(g, jg, b, S, { kf: 0.12, bk: 0.8, keys: [[-0.03, 0.045, 0.06, 0], [0.04, 0.066, 0.078, 0], [0.18, 0.056, 0.058, -0.006], [0.34, 0.036, 0.04, -0.014], [0.5, 0.034, 0.034, -0.018], [0.58, 0.046, 0.032, -0.02], [0.64, 0.038, 0.026, -0.021], [0.665, 0.022, 0.016, -0.022]],
      jkeys: [[0.03, 0.03, 0.025, -0.078], [0.16, 0.048, 0.028, -0.082], [0.34, 0.032, 0.02, -0.076], [0.5, 0.03, 0.018, -0.073], [0.6, 0.04, 0.02, -0.072], [0.665, 0.022, 0.012, -0.07]], eye: [0.06, 0.04, 0.1, 0.016], nos: [0.016, 0.026, 0.46, 0.007],
      teeth: { z0: 0.26, z1: 0.64, n: 13, x: 0.036, y: -0.037, len: 0.026, w: 0.005, col: 0xece4cc }, jteeth: { z0: 0.28, z1: 0.62, n: 12, x: 0.03, y: -0.078, len: 0.022, w: 0.005, col: 0xece4cc },
      extra: function (gg, k) { var cc = function (x, y, z) { return mixHex(0x3f6f80, 0xd8502c, smooth(y, 0.07, 0.12)); };
        gg.extrude([[0.045, 0.1], [0.08, 0.12], [0.12, 0.16], [0.155, 0.22], [0.15, 0.28], [0.118, 0.33], [0.085, 0.345], [0.05, 0.31]].map(function (p) { return [p[0], p[1] * k]; }), 0.01, 0, 0, 0, [0, 0, 0], cc, { axis: 'x', bev: 0.0035 }); } });
  } };
  S.tail = { n: 4, len: 2.0, at: [0.04, -0.62], rr: 5, seg: 9, keys: [[0, 0.1, 0.14, 0], [0.5, 0.075, 0.13, 0.0], [1.2, 0.05, 0.11, 0.02], [1.7, 0.03, 0.07, 0.01], [2.0, 0.01, 0.03, 0]], rest: [0.03, -0.01, -0.05, -0.1], amp: 0.1, gaitAmp: 0.1, stab: 0.85, scull: 1.3,
    each: function (g, i, n, seg) { if (i < 3) g.extrude([[0.1, 0.0], [0.17, -seg * 0.25], [0.2, -seg * 0.55], [0.18, -seg * 0.85], [0.1, -seg * 1.02]], 0.014, 0, 0, 0, [0, 0, 0], function (x, y) { return mixHex(0x3f6f80, 0xc4482c, smooth(y, 0.1, 0.17)); }, { axis: 'x', bev: 0.005 }); } };
  S.legs = bipedLegs(0.17, [1, 1.1, 0.6], [0.115, 0.055, 0.045], 0.24, 0.03, { claw: 0.05 });
  S.gait = { Dw: 1.6, Dr: 3.0, bw: 0.62, br: 0.44, lw: 0.08, lr: 0.16, bob: 0.015, bobR: 0.04 };
  S.eat = { p: 0.18, crouch: 0.08, gy: 0.05, hp: -0.7, bite: 0.25, curve: 0.2, hdrop: 0.1 };
  S.sleep = { y: 0.27, curl: 1.0, hp: -0.4, hy: 0.7 };
  S.call = { type: 'roar', neck: 0.35, hp: 0.5, jaw: 0.5, pitch: 0.07, min: 8, var: 15, dur: 2.2, shape: [1, 0.7] };
  S.swimDrop = 0.52; S.swimNeck = 0.5; S.paddleA = 1.1; S.paddleK = 0.8;
  return S;
})());

// ---------------------------------------------------------------- Gallimimus (ostrich-like)
reg((function () {
  var S = { id: 'gallimimus', kind: 'biped', H: 1.6, J: 0.8, p0: 0.0, bs: 0.4, bh: 1.4, runAt: 4.5 };
  S.back = 0xb08860; S.belly = 0xf4ecd8; S.footc = 0x5a4634; S.legc = 0xc4a478;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0xc09870, bAt: -0.05, bW: 0.6, bars: { c: 0x6a3e2a, f: 5, w: 0.45, k: 0.8, from: -0.4, to: 1.3, ca0: 0.1 }, dors: { c: 0x5a3626, k: 0.8 }, mott: 0.08 });
  S.body = { rings: 14, seg: 9, keys: [[-0.48, 0.04, 0.06, 0.05], [-0.34, 0.08, 0.11, 0.04], [-0.1, 0.115, 0.16, 0.02], [0.12, 0.125, 0.17, 0.02], [0.32, 0.1, 0.13, 0.05], [0.46, 0.065, 0.08, 0.08], [0.54, 0.04, 0.05, 0.1]],
    extra: function (g) { for (var i = 0; i < 8; i++) feather(g, 0, 0.17, -0.3 + i * 0.1, 0, 0.04, -0.06, 0.016, 0x7a5436, false);
      for (var row = 0; row < 4; row++) for (i = 0; i < 9; i++) for (var s = -1; s <= 1; s += 2) {
        var z = -0.3 + i * 0.085 + row * 0.02, a = 0.4 + row * 0.42, ry = 0.17 - Math.pow((z - 0.1) / 0.6, 2) * 0.09, rx = ry * 0.75;
        feather(g, s * rx * Math.sin(a) * 0.96, 0.02 + ry * Math.cos(a) * 0.96, z, s * 0.01, -0.012, -0.1, 0.02, shade(S.sk(z, Math.max(0.5, Math.cos(a)), 1, 0, 0, z), 0.88 + 0.08 * (i % 3)), false);
      } } };
  S.neck = { n: 3, len: 1.0, at: [0, 0.1, 0.5], rr: 4, seg: 7, keys: [[0, 0.06, 0.065, 0], [0.5, 0.042, 0.045, 0], [1.0, 0.03, 0.033, 0]], rest: [1.15, 0.75, 0.2], hrest: -0.2, stab: [0.5, 0.75, 0.95], look: 0.8, run: -0.35 };
  S.head = { len: 0.25, scale: 1.0, jaw: [-0.025, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.02, 0.03, 0.035, 0], [0.04, 0.048, 0.054, 0], [0.12, 0.04, 0.042, -0.004], [0.2, 0.026, 0.028, -0.01], [0.25, 0.012, 0.016, -0.012]], jkeys: [[0.03, 0.026, 0.02, -0.05], [0.12, 0.032, 0.018, -0.054], [0.22, 0.016, 0.012, -0.05], [0.25, 0.008, 0.008, -0.048]],
      eye: [0.049, 0.03, 0.08, 0.019], nos: [0.01, 0.01, 0.22, 0.005], iris: 0xd89a28,
      extra: function (gg, k, b, jg) { gg.loft([[0.17 * k, 0.027, 0.03, -0.007], [0.22 * k, 0.027, 0.03, -0.01], [0.25 * k, 0.014, 0.017, -0.012]], { rings: 4, seg: 7, cap1: true }, 0xd8b878); jg.loft([[0.19 * k, 0.017, 0.013, -0.05], [0.235 * k, 0.017, 0.013, -0.05], [0.25 * k, 0.008, 0.009, -0.048]], { rings: 3, seg: 6, cap1: true }, 0xcaa868); } });
  } };
  S.tail = { n: 4, len: 1.4, at: [0.04, -0.42], rr: 4, seg: 7, keys: [[0, 0.07, 0.09, 0], [0.5, 0.05, 0.065, 0], [1.0, 0.03, 0.04, 0], [1.4, 0.01, 0.014, 0]], rest: [0.03, 0.02, 0.01, 0.0], amp: 0.05, gaitAmp: 0.05, stab: 0.95, run: 0.0,
    each: function (g, i, n, seg) { for (var s = -1; s <= 1; s += 2) feather(g, s * 0.03, 0.025, -seg * 0.2, s * 0.02, 0.0, -0.13, 0.02, i % 2 ? 0x7a5436 : 0xb08860, false); if (i === n - 1) for (var k = -3; k <= 3; k++) feather(g, k * 0.005, 0.01, -seg * 0.5, k * 0.03, 0.0, -0.22, 0.026, k % 2 ? 0x6a4428 : 0xf4ecd8, true); } };
  S.arms = { at: [0.1, 0.0, 0.42], rest: 0.5, swing: 0.4, out: 0.1, flick: true, build: function (g) { dinoArm(g, [[0, 0, 0], [0, -0.12, 0.05], [0, -0.2, 0.15]], [0.026, 0.02, 0.016], 0xc4a478, { n: 3, len: 0.07, r: 0.008, sp: 0.014, down: 0.15 });
    for (var i = 0; i < 7; i++) feather(g, 0.014, -0.1 - 0.015 * i, 0.03 + 0.017 * i, 0.0, -0.05, -0.17, 0.021, i % 2 ? 0x7a5436 : 0xf4ecd8, false); } };
  S.legs = bipedLegs(0.1, [1, 1.28, 1.1], [0.07, 0.032, 0.025], 0.2, 0.018, { claw: 0.03, phis: 0.1, dew: false, thighExtra: function (g) { for (var i = 0; i < 5; i++) for (var s = -1; s <= 1; s += 2) feather(g, s * 0.055, -0.03 - i * 0.02, -0.05, s * 0.006, -0.05, -0.06, 0.02, i % 2 ? 0x7a5436 : 0xb08860, false); } });
  S.gait = { Dw: 2.1, Dr: 4.6, bw: 0.58, br: 0.36, lw: 0.1, lr: 0.22, bob: 0.025, bobR: 0.06 }; S.neckBob = 0.05;
  S.eat = { p: 0.3, crouch: 0.12, gy: 0.05, hp: -0.8, bite: 0.0, curve: 0.2 };
  S.sleep = { y: 0.3, curl: 1.5, hp: -0.4, hy: 0.7 }; S.swimDrop = 0.35;
  return S;
})());

// ---------------------------------------------------------------- Therizinosaurus (pot belly, giant claws, upright)
reg((function () {
  var S = { id: 'therizinosaurus', kind: 'biped', H: 3.0, J: 0.74, p0: 0.5, bs: 0.35, bh: 1.4, runAt: 4.0 };
  S.back = 0x8a4a34; S.belly = 0xe6d2a6; S.footc = 0x3a2a22; S.legc = 0x7a4430;
  var fur = function (zc, ca, sa, x, y, z) { return 0; };
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x9a5a3e, bAt: -0.1, bW: 0.7, bars: { c: 0x3a1c14, f: 6, w: 0.4, k: 0.65, from: -0.5, to: 1.0, ca0: 0.1 }, spots: { c: 0xd8b888, f: 9, k: 4, d: 0.12, a: 0.6 }, mott: 0.1 });
  S.body = { rings: 18, seg: 10, keys: [[-0.4, 0.06, 0.09, 0.05], [-0.28, 0.12, 0.16, 0.04], [-0.1, 0.2, 0.26, 0.02], [0.12, 0.29, 0.32, -0.03], [0.3, 0.29, 0.31, -0.03], [0.5, 0.21, 0.25, 0.03], [0.62, 0.12, 0.15, 0.08]],
    extra: function (g) {
      for (var row = 0; row < 9; row++) for (var i = 0; i < 9; i++) {
        var z = -0.28 + row * 0.095 + (i % 2) * 0.04, a = (i - 4) * 0.62, rx = 0.3 - Math.pow((z - 0.2) / 0.5, 2) * 0.12, ry = 0.32 - Math.pow((z - 0.2) / 0.5, 2) * 0.14, y0 = z < 0.1 ? 0 : -0.03;
        if (z < -0.28 + 0.2 && Math.abs(a) > 1.6) continue;
        var c = shade(S.sk(z, Math.cos(a), Math.sin(a), 0, 0, z), 0.93 + 0.06 * ((row + i) % 3));
        feather(g, rx * Math.sin(a) * 0.95, y0 + ry * Math.cos(a) * 0.95, z, Math.sin(a) * 0.035, Math.cos(a) * 0.035, -0.14, 0.028, c, false);
      }
    } };
  S.neck = { n: 2, len: 0.8, at: [0, 0.14, 0.52], rr: 4, seg: 8, keys: [[0, 0.1, 0.105, 0], [0.4, 0.075, 0.08, 0], [0.8, 0.055, 0.06, 0]], rest: [1.25, 1.0], hrest: -0.1, stab: [0.5, 0.85], look: 0.6 };
  S.head = { len: 0.3, scale: 1.0, jaw: [-0.04, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.04, 0.05, 0], [0.04, 0.06, 0.07, 0], [0.13, 0.05, 0.056, -0.004], [0.22, 0.035, 0.04, -0.01], [0.28, 0.024, 0.026, -0.014], [0.3, 0.012, 0.014, -0.016]], jkeys: [[0.03, 0.03, 0.022, -0.065], [0.13, 0.04, 0.022, -0.07], [0.23, 0.026, 0.016, -0.066], [0.285, 0.013, 0.01, -0.062]],
      eye: [0.056, 0.035, 0.09, 0.016], nos: [0.012, 0.008, 0.285, 0.006],
      extra: function (gg, k, b, jg) { gg.loft([[0.17 * k, 0.034, 0.039, -0.008], [0.24 * k, 0.03, 0.034, -0.012], [0.3 * k, 0.013, 0.016, -0.016]], { rings: 5, seg: 8, cap1: true }, 0xcfae66); jg.loft([[0.2 * k, 0.02, 0.015, -0.064], [0.26 * k, 0.019, 0.014, -0.063], [0.288 * k, 0.008, 0.009, -0.061]], { rings: 3, seg: 6, cap1: true }, 0xbf9e58);
        for (var s = -1; s <= 1; s += 2) gg.tube([[s * 0.048, 0.062, 0.05], [s * 0.058, 0.06, 0.1 * k], [s * 0.046, 0.044, 0.15 * k]], [0.012, 0.015, 0.008], shade(S.back, 0.8), { seg: 5, steps: 2 }); } });
  } };
  S.tail = { n: 3, len: 0.9, at: [0.04, -0.36], rr: 4, seg: 8, keys: [[0, 0.085, 0.11, 0], [0.45, 0.06, 0.075, 0], [0.9, 0.012, 0.018, 0]], rest: [-0.2, -0.3, -0.4], amp: 0.06, gaitAmp: 0.08, stab: 0.85,
    each: function (g, i, n, seg) { for (var s = -1; s <= 1; s += 2) feather(g, s * 0.05, 0.02, -seg * 0.2, s * 0.05, -0.05, -0.13, 0.02, i % 2 ? 0xe0c8a0 : 0x6a3424, true); } };
  S.arms = { at: [0.2, 0.05, 0.42], rest: 0.35, swing: 0.2, out: 0.12, ar: 1, build: function (g) {
    dinoArm(g, [[0, 0, 0], [0, -0.24, 0.1], [0, -0.45, 0.26]], [0.05, 0.042, 0.035], 0x7a4430, { n: 3, len: 0.42, r: 0.02, sp: 0.045, down: -0.15, col: 0xf0e8d0 });
    for (var i = 0; i < 9; i++) { var t = i / 8; feather(g, 0.035, -0.02 - 0.4 * t, 0.01 + 0.24 * t, 0.0, -0.1, -0.14, 0.032, i % 2 ? 0xe0c8a0 : 0x6a3424, false); feather(g, -0.035, -0.02 - 0.4 * t, 0.01 + 0.24 * t, 0.0, -0.09, -0.12, 0.03, i % 2 ? 0x6a3424 : 0xe0c8a0, false); }
  } };
  S.legs = bipedLegs(0.18, [1, 1.0, 0.6], [0.12, 0.062, 0.05], 0.2, 0.03, { claw: 0.05, toes: 4, thighExtra: function (g) { for (var i = 0; i < 6; i++) for (var s = -1; s <= 1; s += 2) feather(g, s * 0.1, -0.02 - i * 0.025, -0.06, s * 0.01, -0.07, -0.08, 0.028, i % 2 ? 0xe0c8a0 : 0x6a3424, false); } });
  S.gait = { Dw: 1.5, Dr: 3.0, bw: 0.64, br: 0.45, lw: 0.08, lr: 0.16, bob: 0.015, bobR: 0.04, pw: 0.02, runP: -0.04 };
  S.eat = { p: 0.0, pTree: 0.0, crouch: 0.0, gy: 0.05, hp: -0.8, bite: 0.0, curve: 0.2, tree: 0.5, treeY: 1.7, hpT: -0.2 };
  S.sleep = { y: 0.32, p: -0.45, curl: 1.0, hp: -0.4, hy: 0.7 };
  S.call = { type: 'raise', neck: 0.15, hp: 0.35, jaw: 0.3, pitch: 0.0, min: 10, var: 16, dur: 2.0, shape: [1, 0.5] }; S.swimDrop = 0.35;
  return S;
})());

// ================================================================ ORNITHOPODS, QUADRUPEDS, SAUROPODS
function padFoot(n, wk, col, nail) { // hoofed ornithischian foot: heel pad, rounded digits, flattened hoof nails
  return function (g, L, S) {
    var w = wk, fc = col || S.footc || 0x444444, nc = nail || 0x2a2420, y = -L + w * 0.5;
    g.sph(w * 1.45, w * 0.62, w * 1.5, 0, y, w * 0.35, fc, { s: [7, 4] });
    for (var i = 0; i < n; i++) {
      var k = i - (n - 1) / 2, x = k * w * (n > 3 ? 0.8 : 0.95), zc = w * (1.25 - 0.1 * Math.abs(k));
      g.sph(w * 0.5, w * 0.46, w * 0.8, x, y - w * 0.05, zc, fc, { s: [6, 4] });
      g.cyl(w * 0.22, w * 0.46, w * 0.62, x * 1.08, y - w * 0.07, zc + w * 0.62, nc, { seg: 5, sz: 0.6, rot: [PI / 2 - 0.2, k * 0.1, 0] });
    }
  };
}
function bump(g, x, y, z, r, col) { g.sph(r, r * 0.7, r, x, y, z, col, { s: [5, 4] }); }

// ---------------------------------------------------------------- Dryosaurus (starter ornithopod)
reg((function () {
  var S = { id: 'dryosaurus', kind: 'biped', H: 0.9, J: 0.78, p0: 0.0, bs: 0.45, bh: 1.4, runAt: 4.0 };
  S.back = 0xc6a05a; S.belly = 0xf3e8c4; S.footc = 0x6a5030; S.legc = 0xb89350;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0xd0aa62, bAt: -0.05, bW: 0.6, bars: { c: 0x6a4a28, f: 8, w: 0.4, k: 0.6, from: -0.5, to: 1.4, ca0: 0.1 }, dors: { c: 0x7a5630, k: 0.85 }, spots: { c: 0x8a6636, f: 10, k: 4, d: 0.1, a: 0.5 } });
  S.body = { rings: 14, seg: 9, keys: [[-0.46, 0.045, 0.07, 0.05], [-0.34, 0.09, 0.12, 0.04], [-0.12, 0.13, 0.17, 0.02], [0.1, 0.14, 0.18, 0.015], [0.3, 0.11, 0.14, 0.04], [0.45, 0.07, 0.09, 0.07], [0.52, 0.045, 0.055, 0.09]] };
  S.neck = { n: 2, len: 0.5, at: [0, 0.1, 0.46], rr: 4, seg: 7, keys: [[0, 0.075, 0.08, 0], [0.5, 0.042, 0.048, 0]], rest: [1.0, 0.4], hrest: -0.25, stab: [0.5, 0.9], look: 0.8 };
  S.head = { len: 0.3, scale: 1.0, jaw: [-0.035, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.04, 0.05, 0], [0.04, 0.064, 0.076, 0], [0.14, 0.056, 0.064, -0.006], [0.23, 0.04, 0.044, -0.014], [0.285, 0.036, 0.03, -0.02], [0.305, 0.024, 0.02, -0.022]],
      jkeys: [[0.03, 0.03, 0.022, -0.068], [0.14, 0.044, 0.024, -0.074], [0.25, 0.034, 0.016, -0.074], [0.295, 0.02, 0.01, -0.072]], eye: [0.062, 0.04, 0.1, 0.021], nos: [0.014, 0.018, 0.24, 0.006], iris: 0x6a3a18,
      extra: function (gg, k) { gg.sph(0.032, 0.014, 0.03, 0, -0.026, 0.29 * k, 0xe0c880, { s: [5, 4] }); } });
  } };
  S.tail = { n: 4, len: 1.3, at: [0.04, -0.42], rr: 4, seg: 7, keys: [[0, 0.07, 0.095, 0], [0.45, 0.05, 0.065, 0], [0.9, 0.03, 0.038, 0], [1.3, 0.008, 0.012, 0]], rest: [0.03, 0.02, 0.0, -0.02], amp: 0.06, gaitAmp: 0.05, stab: 0.95, run: 0.0 };
  S.arms = { at: [0.11, 0.0, 0.4], rest: 0.3, swing: 0.35, out: 0.1, build: function (g) { dinoArm(g, [[0, 0, 0], [0, -0.1, 0.04], [0, -0.17, 0.1]], [0.025, 0.02, 0.016], 0xb89350, { n: 3, len: 0.04, r: 0.008, sp: 0.014, down: 0.1, col: 0x6a5030 }); } };
  S.legs = bipedLegs(0.1, [1, 1.3, 1.05], [0.075, 0.033, 0.026], 0.17, 0.022, { claw: 0.0, phis: 0.1, dew: false, spread: 0.3 });
  S.gait = { Dw: 2.0, Dr: 4.2, bw: 0.58, br: 0.36, lw: 0.1, lr: 0.22, bob: 0.025, bobR: 0.06 };
  S.eat = { p: 0.3, crouch: 0.12, gy: 0.05, hp: -0.9, bite: 0.0, curve: 0.2 };
  S.sleep = { y: 0.3, curl: 1.4, hp: -0.4, hy: 0.7 }; S.swimDrop = 0.3;
  return S;
})());

// ---------------------------------------------------------------- Leaellynasaura (fluffy, big eyes, long tail)
reg((function () {
  var S = { id: 'leaellynasaura', kind: 'biped', H: 0.36, J: 0.76, p0: 0.0, bs: 0.5, bh: 1.3, runAt: 2.6 };
  S.back = 0x6f86a8; S.belly = 0xf4f0e6; S.footc = 0x4a4a58; S.legc = 0x7a90b0;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x7f96b4, bAt: -0.05, bW: 0.6, bars: { c: 0x3a4a6a, f: 8, w: 0.45, k: 0.6, from: -0.6, to: 2.4, ca0: 0.2 }, dors: { c: 0xe08840, k: 0.9 }, spots: { c: 0xe8e4d8, f: 9, k: 4, d: 0.14, a: 0.7 }, mott: 0.09 });
  var fuzz = function (g, n, y, z0, z1, col) { for (var i = 0; i < n; i++) { var z = z0 + (z1 - z0) * i / (n - 1); for (var s = -1; s <= 1; s += 2) feather(g, s * 0.03, y, z, s * 0.04, 0.045, -0.03, 0.02, i % 2 ? 0xe8a050 : col, false); } };
  S.body = { rings: 12, seg: 8, keys: [[-0.45, 0.05, 0.075, 0.05], [-0.3, 0.09, 0.12, 0.04], [-0.1, 0.12, 0.155, 0.02], [0.1, 0.125, 0.16, 0.02], [0.3, 0.1, 0.13, 0.04], [0.42, 0.065, 0.08, 0.07], [0.5, 0.04, 0.05, 0.09]],
    extra: function (g) { for (var i = 0; i < 12; i++) { for (var s = -1; s <= 1; s += 2) feather(g, s * (0.02 + 0.07 * Math.sin(i * 0.5)), 0.14, -0.32 + i * 0.07, s * 0.03, 0.05, -0.04, 0.018, i % 3 ? 0xc8d4e4 : 0xe8a050, false); } } };
  S.neck = { n: 2, len: 0.4, at: [0, 0.09, 0.42], rr: 4, seg: 7, keys: [[0, 0.065, 0.07, 0], [0.4, 0.045, 0.05, 0]], rest: [0.95, 0.4], hrest: -0.2, stab: [0.5, 0.9], look: 0.9 };
  S.head = { len: 0.26, scale: 1.1, jaw: [-0.03, 0.045], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.9, keys: [[-0.03, 0.05, 0.06, 0], [0.04, 0.07, 0.078, 0], [0.12, 0.054, 0.06, -0.004], [0.2, 0.034, 0.038, -0.01], [0.25, 0.02, 0.022, -0.012], [0.265, 0.01, 0.012, -0.014]],
      jkeys: [[0.03, 0.03, 0.022, -0.058], [0.12, 0.04, 0.022, -0.062], [0.22, 0.022, 0.014, -0.058], [0.26, 0.01, 0.008, -0.056]], eye: [0.066, 0.04, 0.075, 0.034], nos: [0.01, 0.008, 0.25, 0.005], iris: 0x2a1a10,
      extra: function (gg, k) { for (var i = 0; i < 4; i++) feather(gg, (i - 1.5) * 0.015, 0.075, -0.01, (i - 1.5) * 0.01, 0.035, -0.04, 0.012, i % 2 ? 0xe8a050 : 0xc8d4e4, false); } });
  } };
  S.tail = { n: 4, len: 2.1, at: [0.04, -0.42], rr: 4, seg: 6, keys: [[0, 0.06, 0.08, 0], [0.6, 0.04, 0.052, 0], [1.4, 0.022, 0.03, 0], [2.1, 0.008, 0.01, 0]], rest: [0.04, 0.02, 0.0, -0.03], amp: 0.14, gaitAmp: 0.12, stab: 0.9, freq: 1.4,
    each: function (g, i, n, seg) { for (var s = -1; s <= 1; s += 2) feather(g, s * 0.025, 0.02, -seg * 0.3, s * 0.03, 0.04, -0.06, 0.016, i % 2 ? 0xe8a050 : 0xc8d4e4, false); } };
  S.arms = { at: [0.1, 0.0, 0.37], rest: 0.2, swing: 0.5, out: 0.1, flick: true, build: function (g) { dinoArm(g, [[0, 0, 0], [0, -0.1, 0.04], [0, -0.15, 0.11]], [0.022, 0.017, 0.013], 0x7a90b0, { n: 3, len: 0.04, r: 0.007, sp: 0.012, down: 0.1 }); } };
  S.legs = bipedLegs(0.09, [1, 1.2, 1.0], [0.052, 0.026, 0.02], 0.16, 0.014, { claw: 0.03, phis: 0.1, dew: false });
  S.gait = { Dw: 2.0, Dr: 4.0, bw: 0.55, br: 0.35, lw: 0.1, lr: 0.22, bob: 0.03, bobR: 0.06 };
  S.eat = { p: 0.3, crouch: 0.12, gy: 0.05, hp: -0.9, bite: 0.0, curve: 0.2 };
  S.sleep = { y: 0.28, curl: 1.6, hp: -0.4, hy: 0.7 }; S.swimDrop = 0.3;
  return S;
})());

// ---------------------------------------------------------------- Pachycephalosaurus (domed skull)
reg((function () {
  var S = { id: 'pachycephalosaurus', kind: 'biped', H: 1.2, J: 0.76, p0: 0.0, bs: 0.4, bh: 1.4, runAt: 4.0 };
  S.back = 0x5e4a46; S.belly = 0xd6c4a2; S.footc = 0x2e2420; S.legc = 0x554240;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x6c5650, bAt: -0.05, bW: 0.6, bars: { c: 0x2a1e1c, f: 6, w: 0.4, k: 0.5, from: -0.5, to: 1.3, ca0: 0.1 }, spots: { c: 0x8a7060, f: 8, k: 4, d: 0.12, a: 0.6 }, mott: 0.09 });
  S.body = { rings: 14, seg: 9, keys: [[-0.46, 0.07, 0.1, 0.05], [-0.32, 0.14, 0.18, 0.035], [-0.1, 0.19, 0.23, 0.01], [0.12, 0.2, 0.24, 0.01], [0.32, 0.16, 0.2, 0.03], [0.46, 0.1, 0.13, 0.06], [0.54, 0.06, 0.08, 0.08]] };
  S.neck = { n: 2, len: 0.42, at: [0, 0.1, 0.48], rr: 4, seg: 8, keys: [[0, 0.1, 0.105, 0], [0.42, 0.07, 0.075, 0]], rest: [0.85, 0.35], hrest: -0.2, stab: [0.5, 0.9], look: 0.6 };
  S.head = { len: 0.3, scale: 1.0, jaw: [-0.04, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.055, 0.065, 0], [0.04, 0.08, 0.09, 0], [0.14, 0.07, 0.078, -0.005], [0.23, 0.05, 0.05, -0.014], [0.285, 0.04, 0.036, -0.02], [0.305, 0.026, 0.024, -0.022]],
      jkeys: [[0.03, 0.036, 0.028, -0.082], [0.14, 0.055, 0.03, -0.086], [0.25, 0.04, 0.022, -0.082], [0.3, 0.022, 0.014, -0.08]], eye: [0.075, 0.04, 0.115, 0.017], nos: [0.014, 0.012, 0.275, 0.006],
      teeth: { z0: 0.18, z1: 0.25, n: 3, x: 0.05, y: -0.075, len: 0.018, w: 0.006 },
      extra: function (gg, k) { var dm = 0xe0a060, kn = 0xc88848;
        gg.sph(0.07, 0.07, 0.1, 0, 0.1, 0.08 * k, function (x, y, z, nx, ny) { return ny > 0.3 ? dm : shade(dm, 0.82); }, { s: [9, 7] });
        for (var i = 0; i < 7; i++) { var a = i / 7 * TAU; bump(gg, Math.sin(a) * 0.085, 0.045, 0.02 + Math.cos(a) * 0.01 - 0.0, 0.016, kn); }
        for (i = -1; i <= 1; i++) gg.cone(0.014, 0.036, i * 0.025, 0.04, -0.025, kn, { seg: 4, rot: [-0.6, 0, 0] });
        for (i = 0; i < 3; i++) bump(gg, (i - 1) * 0.022, 0.06, 0.2 * k + i * 0.0, 0.015, kn); } });
  } };
  S.tail = { n: 4, len: 1.2, at: [0.04, -0.42], rr: 4, seg: 7, keys: [[0, 0.1, 0.13, 0], [0.5, 0.07, 0.09, 0], [0.9, 0.04, 0.05, 0], [1.2, 0.01, 0.014, 0]], rest: [0.03, 0.02, 0.0, -0.02], amp: 0.04, gaitAmp: 0.04, stab: 0.95, run: 0.0 };
  S.arms = { at: [0.15, 0.0, 0.42], rest: 0.3, swing: 0.3, out: 0.1, build: function (g) { dinoArm(g, [[0, 0, 0], [0, -0.1, 0.04], [0, -0.16, 0.1]], [0.03, 0.024, 0.02], 0x554240, { n: 3, len: 0.04, r: 0.008, sp: 0.014, down: 0.1 }); } };
  S.legs = bipedLegs(0.14, [1, 1.05, 0.72], [0.1, 0.05, 0.04], 0.17, 0.026, { claw: 0.03, dew: false });
  S.gait = { Dw: 1.7, Dr: 3.4, bw: 0.6, br: 0.4, lw: 0.09, lr: 0.18, bob: 0.02, bobR: 0.05 };
  S.eat = { p: 0.3, crouch: 0.12, gy: 0.05, hp: -0.9, bite: 0.0, curve: 0.2 };
  S.sleep = { y: 0.3, curl: 1.3, hp: -0.4, hy: 0.7 }; S.swimDrop = 0.35;
  return S;
})());

// ---------------------------------------------------------------- Parasaurolophus (hadrosaur, long tube crest, walks on four, can rear)
reg((function () {
  var S = { id: 'parasaurolophus', kind: 'quad', H: 2.2, J: 0.74, p0: 0.0, bs: 0.35, bh: 1.4, runAt: 4.5 };
  S.back = 0x4d8c78; S.belly = 0xe2e2bc; S.footc = 0x3a3c2a; S.legc = 0x437c6a;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x5a9c86, bAt: -0.05, bW: 0.6, bars: { c: 0x1f3a32, f: 6, w: 0.4, k: 0.6, from: -0.6, to: 1.3, ca0: 0.1 }, dors: { c: 0x2a5648, k: 0.6 }, spots: { c: 0xe8a050, f: 8, k: 4, d: 0.08, a: 0.7 } });
  S.body = { rings: 20, seg: 10, keys: [[-0.56, 0.07, 0.1, 0.06], [-0.4, 0.13, 0.18, 0.05], [-0.2, 0.2, 0.25, 0.03], [0.0, 0.23, 0.28, 0.01], [0.3, 0.23, 0.28, 0.0], [0.55, 0.18, 0.23, 0.0], [0.72, 0.1, 0.13, 0.04]] };
  S.neck = { n: 2, len: 0.6, at: [0, 0.1, 0.66], rr: 4, seg: 8, keys: [[0, 0.12, 0.13, 0], [0.3, 0.09, 0.1, 0], [0.6, 0.065, 0.075, 0]], rest: [0.65, 0.2], hrest: -0.3, stab: [0.55, 0.85], look: 0.7 };
  S.head = { len: 0.4, scale: 1.0, jaw: [-0.045, 0.06], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.8, keys: [[-0.03, 0.05, 0.07, 0], [0.05, 0.08, 0.095, 0], [0.16, 0.066, 0.075, -0.01], [0.27, 0.056, 0.05, -0.026], [0.35, 0.078, 0.034, -0.034], [0.4, 0.074, 0.026, -0.036], [0.415, 0.05, 0.018, -0.036]],
      jkeys: [[0.03, 0.036, 0.03, -0.088], [0.15, 0.055, 0.032, -0.094], [0.28, 0.05, 0.024, -0.092], [0.38, 0.066, 0.016, -0.088], [0.415, 0.04, 0.01, -0.086]], eye: [0.074, 0.05, 0.11, 0.02], nos: [0.02, 0.05, 0.27, 0.008],
      extra: function (gg, k) {
        var cc = function (x, y, z) { return fract(z * 11 + y * 4) < 0.35 ? 0xe85a30 : 0xf0a040; };
        gg.tube([[0, 0.068, 0.14 * k], [0, 0.165, 0.02], [0, 0.26, -0.15], [0, 0.295, -0.33], [0, 0.255, -0.48]], [0.046, 0.042, 0.038, 0.033, 0.026], cc, { seg: 8, sx: 0.72, sz: 1.25, steps: 3 });
        gg.sph(0.05, 0.03, 0.04, 0, 0.065, 0.1, S.back, { s: [6, 4] }); } });
  } };
  S.tail = { n: 4, len: 1.55, at: [0.04, -0.5], rr: 5, seg: 8, keys: [[0, 0.095, 0.13, 0], [0.5, 0.075, 0.115, 0], [1.1, 0.04, 0.065, 0], [1.55, 0.01, 0.02, 0]], rest: [0.03, 0.0, -0.05, -0.1], amp: 0.06, gaitAmp: 0.08, stab: 0.9, run: 0.03 };
  S.legs = { chord: 0.93,
    h: { x: 0.2, y: 0, z: 0, r: [1, 1.15], w: [0.125, 0.065, 0.058], fx: 0.04, bend: 1, foot: padFoot(3, 0.058, 0x3a3c2a, 0x2a2a20) },
    f: { x: 0.19, y: -0.13, z: 0.58, r: [1, 1], w: [0.075, 0.05, 0.045], fx: 0.02, bend: -1, sw: 0.75, foot: padFoot(3, 0.045, 0x3a3c2a, 0x2a2a20) } };
  S.gait = { Dw: 1.5, Dr: 3.0, bw: 0.68, br: 0.45, lw: 0.07, lr: 0.14, bob: 0.015, bobR: 0.035 };
  S.eat = { p: 0.14, crouch: 0.05, gy: 0.05, hp: -0.85, bite: 0.0, curve: 0.3, tree: 0.5, treeY: 1.3, hpT: -0.1, pTree: 0.0 };
  S.sleep = { y: 0.34, curl: 1.3, hp: -0.4, hy: 0.7, ffx: 0.1 };
  S.rear = { p: 0.5, up: 0.0, neck: -0.25, tail: 0.2 };
  S.call = { type: 'honk', neck: 0.2, hp: 0.5, jaw: 0.35, pitch: 0.05, min: 6, var: 12, dur: 2.0, shape: [1, 0.8] }; S.swimDrop = 0.4;
  return S;
})());

// ---------------------------------------------------------------- Stegosaurus (plates + thagomizer)
reg((function () {
  var S = { id: 'stegosaurus', kind: 'quad', H: 2.1, J: 0.76, p0: -0.08, bs: 0.35, bh: 1.4, runAt: 4.0 };
  S.back = 0x6f8248; S.belly = 0xd9d6a2; S.footc = 0x3c4028; S.legc = 0x647644;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x7b8e4f, bAt: -0.05, bW: 0.6, spots: { c: 0x3a4a24, f: 7, k: 4, d: 0.16, a: 0.7 }, bars: { c: 0x445a2a, f: 4, w: 0.3, k: 0.45, from: -0.6, to: 1.5, ca0: 0.1 }, mott: 0.08 });
  var K = [[-0.55, 0.08, 0.11, 0.06], [-0.4, 0.15, 0.2, 0.06], [-0.2, 0.24, 0.29, 0.05], [0.0, 0.27, 0.32, 0.04], [0.25, 0.27, 0.3, 0.0], [0.5, 0.2, 0.23, -0.04], [0.68, 0.11, 0.13, -0.06]];
  S.body = { rings: 20, seg: 10, keys: K, extra: function (g) {
    var pc = function (x, y, z) { return y > 0.45 ? 0xf09a3e : (y > 0.25 ? 0xe2702c : 0xb8502a); };
    for (var i = 0; i < 9; i++) { var z = -0.34 + i * 0.1, pr = profAt(K, z), top = pr[2] + pr[1] * 0.96, h = 0.16 + 0.26 * Math.sin(PI * (0.12 + 0.76 * i / 8)), sd = i % 2 ? 1 : -1;
      g.extrude([[0, -0.085], [h * 0.46, -0.105], [h, -0.01], [h * 0.48, 0.095], [0, 0.085]], 0.026, sd * 0.045, top - 0.03, z + sd * 0.025, [0, 0, -sd * 0.12], pc, { axis: 'x', bev: 0.008 }); } } };
  S.neck = { n: 1, len: 0.4, at: [0, 0.0, 0.66], rr: 4, seg: 8, keys: [[0, 0.14, 0.15, 0], [0.4, 0.085, 0.09, 0]], rest: [-0.15], hrest: -0.45, stab: [0.5], look: 0.7 };
  S.head = { len: 0.32, scale: 1.0, jaw: [-0.03, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.05, 0.06, 0], [0.04, 0.07, 0.08, 0], [0.14, 0.058, 0.06, -0.006], [0.24, 0.042, 0.04, -0.016], [0.3, 0.034, 0.03, -0.02], [0.32, 0.02, 0.02, -0.022]],
      jkeys: [[0.03, 0.034, 0.024, -0.068], [0.14, 0.046, 0.024, -0.072], [0.26, 0.032, 0.016, -0.07], [0.31, 0.016, 0.01, -0.068]], eye: [0.066, 0.036, 0.1, 0.015], nos: [0.014, 0.012, 0.3, 0.006],
      extra: function (gg, k) { gg.sph(0.03, 0.016, 0.03, 0, -0.03, 0.305 * k, 0xd8c890, { s: [5, 4] }); } });
  } };
  S.tail = { n: 4, len: 1.45, at: [-0.04, -0.58], rr: 5, seg: 8, keys: [[0, 0.13, 0.16, 0], [0.5, 0.09, 0.12, 0], [1.1, 0.05, 0.065, 0], [1.45, 0.016, 0.02, 0]], rest: [0.12, 0.16, 0.16, 0.14], amp: 0.07, gaitAmp: 0.09, stab: 0.9, run: 0.04,
    each: function (g, i, n, seg) {
      var pc = function (y, z) { return y > 0.1 ? 0xf09a3e : 0xe2702c; };
      if (i === 0 || i === 1) for (var k = 0; k < 2; k++) { var sd = k ? 1 : -1, pr = profAt(S.tail.keys, i * seg + seg * (0.25 + k * 0.5)); g.plate([[0, -0.06], [0.14, -0.07], [0.22 - i * 0.03, 0], [0.14, 0.06], [0, 0.06]], 0.01, sd * 0.03, pr[1] * 0.9, -seg * (0.25 + k * 0.5), [0, 0, -sd * 0.12], pc);
      }
      if (i === n - 1) for (var q = 0; q < 2; q++) for (var s = -1; s <= 1; s += 2) {
        var spZ = -seg * (0.35 + q * 0.4), spL = 0.34 - q * 0.04;
        g.tube([[s * 0.025, 0.02, spZ], [s * (0.025 + spL * 0.46), 0.04 + spL * 0.24, spZ - spL * 0.22], [s * (0.025 + spL * 0.85), 0.05 + spL * 0.44, spZ - spL * 0.42]], [0.028, 0.016, 0.002], 0xe8dcc0, { seg: 6, steps: 2 });
      } } };
  S.legs = { chord: 0.94,
    h: { x: 0.2, y: 0, z: 0, r: [1, 1.05], w: [0.12, 0.075, 0.07], fx: 0.03, bend: 1, foot: padFoot(3, 0.07, 0x3c4028, 0x2a2a20) },
    f: { x: 0.18, y: -0.17, z: 0.56, r: [1, 1], w: [0.085, 0.06, 0.055], fx: 0.02, bend: -1, sw: 0.7, foot: padFoot(5, 0.055, 0x3c4028, 0x2a2a20) } };
  S.gait = { Dw: 1.3, Dr: 2.6, bw: 0.72, br: 0.5, lw: 0.06, lr: 0.12, bob: 0.012, bobR: 0.03 };
  S.eat = { p: 0.12, crouch: 0.04, gy: 0.05, hp: -0.7, bite: 0.0, curve: 0.2 };
  S.sleep = { y: 0.36, p: 0.06, curl: 1.0, hp: -0.4, hy: 0.7, ffx: 0.05 }; S.swimDrop = 0.4;
  return S;
})());

// ---------------------------------------------------------------- Triceratops
reg((function () {
  var S = { id: 'triceratops', kind: 'quad', H: 2.0, J: 0.7, p0: 0.0, bs: 0.35, bh: 1.35, runAt: 4.5 };
  S.back = 0x7a7552; S.belly = 0xd2c8a0; S.footc = 0x3c3a2a; S.legc = 0x6e6a4a;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x857f5a, bAt: -0.05, bW: 0.6, spots: { c: 0x504a34, f: 7, k: 4, d: 0.14, a: 0.6 }, bars: { c: 0x5a5438, f: 4, w: 0.3, k: 0.4, from: -0.6, to: 1.0, ca0: 0.1 }, mott: 0.08 });
  S.body = { rings: 20, seg: 10, keys: [[-0.6, 0.09, 0.13, 0.06], [-0.45, 0.19, 0.24, 0.04], [-0.2, 0.29, 0.34, 0.02], [0.1, 0.33, 0.37, 0.0], [0.4, 0.31, 0.35, 0.0], [0.6, 0.23, 0.28, 0.02], [0.76, 0.13, 0.16, 0.05]] };
  S.neck = { n: 1, len: 0.3, at: [0, 0.06, 0.78], rr: 4, seg: 8, keys: [[0, 0.2, 0.2, 0], [0.3, 0.14, 0.15, 0]], rest: [0.1], hrest: -0.2, stab: [0.5], look: 0.5 };
  S.head = { len: 0.55, scale: 1.0, jaw: [-0.05, 0.08], build: function (g, jg, b) {
    var fc = function (x, y, z, nx, ny, nz) { var ex = Math.sqrt(x * x / 0.1 + (y - 0.26) * (y - 0.26) / 0.09); return ex > 0.82 ? 0xe8d6a8 : (hash3(Math.floor(x * 14), Math.floor(y * 14), 3) > 0.8 ? 0xd8c090 : (ny > 0.0 ? 0xb4623c : 0x8a4a30)); };
    headStd(g, jg, b, S, { bk: 0.8, kf: 0.15, keys: [[-0.06, 0.09, 0.11, 0], [0.04, 0.125, 0.15, 0], [0.2, 0.1, 0.125, -0.004], [0.34, 0.08, 0.1, -0.02], [0.46, 0.06, 0.085, -0.04], [0.54, 0.04, 0.07, -0.05], [0.575, 0.02, 0.04, -0.055]],
      jkeys: [[0.04, 0.05, 0.04, -0.125], [0.2, 0.075, 0.04, -0.13], [0.38, 0.05, 0.034, -0.125], [0.5, 0.034, 0.026, -0.12], [0.55, 0.018, 0.016, -0.115]], eye: [0.118, 0.07, 0.17, 0.02], nos: [0.02, 0.05, 0.5, 0.008],
      extra: function (gg, k, bb, jj) {
        var hc = 0xf0e4bc, hSc = k < 1 ? 0.6 : 1, hcol = function (x, y, z, nx, ny, nz, t) { return mixHex(mixHex(0x6a5c3e, hc, smooth(t, 0.05, 0.55)), 0xd8c690, hash3(Math.floor(t * 18), Math.floor(x * 40), 7) * 0.25); };
        // tapered, curved brow horns on bony bosses + nose horn
        for (var s = -1; s <= 1; s += 2) {
          gg.tube([[s * 0.095, 0.14, 0.16 * k], [s * 0.12, 0.19, 0.22 * k + 0.04 * hSc], [s * 0.15, 0.25, 0.3 * k + 0.12 * hSc], [s * 0.172, 0.31, 0.36 * k + 0.22 * hSc], [s * 0.168, 0.37, 0.375 * k + 0.32 * hSc], [s * 0.158, 0.405, 0.38 * k + 0.37 * hSc]], [0.044, 0.036, 0.027, 0.018, 0.009, 0.001], hcol, { seg: 7, steps: 2 });
          gg.sph(0.05, 0.034, 0.06, s * 0.1, 0.14, 0.17 * k, 0x5a5238, { s: [6, 4], rot: [-0.3, 0, 0] });
        }
        gg.tube([[0, 0.07, 0.4 * k], [0, 0.11, 0.44 * k], [0, 0.16 * hSc + 0.02, 0.475 * k], [0, 0.215 * hSc + 0.06, 0.495 * k]], [0.046, 0.036, 0.022, 0.002], hcol, { seg: 6, steps: 2 });
        gg.sph(0.05, 0.03, 0.06, 0, 0.075, 0.405 * k, 0x6a6244, { s: [6, 4] });
        // hooked keratin parrot beak: rostral cap over the snout tip, predentary in the jaw
        gg.loft([[0.44 * k, 0.046, 0.05, -0.03], [0.5 * k, 0.046, 0.058, -0.045], [0.56 * k, 0.034, 0.058, -0.07], [0.592 * k, 0.014, 0.046, -0.098], [0.6 * k, 0.004, 0.012, -0.112]], { rings: 8, seg: 8, cap0: true, cap1: true }, 0xd8c88c);
        jj.loft([[0.47 * k, 0.03, 0.022, -0.114], [0.53 * k, 0.03, 0.028, -0.118], [0.575 * k, 0.014, 0.022, -0.122]], { rings: 5, seg: 7, cap0: true, cap1: true }, 0xe0cf98);
        // dish frill with scalloped epoccipital edge
        var th = 0.46, cy0 = 0.2, cz0 = -0.11, rx = 0.35, ry = 0.31, fPoly = [], fi;
        for (fi = 0; fi < 16; fi++) {
          var fa = -0.25 + (PI + 0.5) * (fi / 15), sc = 1 + 0.05 * Math.sin(fi * 3.14159);
          fPoly.push([Math.cos(fa) * rx * sc, Math.sin(fa) * ry * sc]);
        }
        gg.extrude(fPoly, 0.044, 0, cy0, cz0, [-th, 0, 0], fc, { axis: 'z', bev: 0.014, curveX: -0.26, curveY: -0.16 });
        for (var i = 0; i <= 22; i++) { var a = PI * (i / 22), px = Math.cos(a) * rx * 1.0, py = Math.sin(a) * ry * 1.0, dishZ = -0.26 * px * px - 0.16 * py * py, big = i % 2 ? 0.7 : 1, side = 1 + 0.5 * Math.abs(Math.cos(a));
          var yy = py * cos(th) + dishZ * sin(th), zz = -py * sin(th) + dishZ * cos(th);
          gg.cone(0.026 * big * side, 0.05 * big * side, px, cy0 + yy, cz0 + zz, i % 2 ? 0xe4d4a4 : 0xf0e2b8, { seg: 4, sz: 0.42, rot: [-th, 0, -Math.cos(a) * 1.1] }); }
        for (var j = 0; j < 2; j++) for (s = -1; s <= 1; s += 2) gg.sph(0.04, 0.045, 0.022, s * (0.14 + j * 0.1), cy0 + 0.02 + j * 0.06, cz0 - 0.022, 0xe4d2a0, { s: [6, 4], rot: [-th, 0, 0] });
      } });
  } };
  S.tail = { n: 3, len: 0.95, at: [0.0, -0.58], rr: 5, seg: 8, keys: [[0, 0.14, 0.17, 0], [0.45, 0.09, 0.11, 0], [0.95, 0.012, 0.018, 0]], rest: [-0.05, -0.12, -0.2], amp: 0.06, gaitAmp: 0.08, stab: 0.9 };
  S.legs = { chord: 0.94,
    h: { x: 0.26, y: 0, z: 0, r: [1, 1.05], w: [0.13, 0.085, 0.075], fx: 0.02, bend: 1, foot: padFoot(3, 0.075, 0x3c3a2a, 0x2a2a20) },
    f: { x: 0.25, y: 0.0, z: 0.58, r: [1, 1], w: [0.12, 0.085, 0.078], fx: 0.02, bend: -1, sw: 0.8, foot: padFoot(4, 0.078, 0x3c3a2a, 0x2a2a20) } };
  S.gait = { Dw: 1.4, Dr: 3.0, bw: 0.68, br: 0.46, lw: 0.06, lr: 0.14, bob: 0.014, bobR: 0.04 };
  S.eat = { p: 0.18, crouch: 0.05, gy: 0.05, hp: -0.8, bite: 0.0, curve: 0.2, hdrop: 0.0 };
  S.sleep = { y: 0.37, curl: 1.0, hp: -0.4, hy: 0.7, ffx: 0.05 }; S.swimDrop = 0.4;
  return S;
})());

// ---------------------------------------------------------------- Protoceratops (small, frill, no horns)
reg((function () {
  var S = { id: 'protoceratops', kind: 'quad', H: 0.55, J: 0.66, p0: 0.0, bs: 0.5, bh: 1.3, runAt: 3.0 };
  S.back = 0xc5a064; S.belly = 0xf0e4c0; S.footc = 0x5a4630; S.legc = 0xb08e56;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0xcfaa6c, bAt: -0.05, bW: 0.6, spots: { c: 0x7a5a34, f: 9, k: 4, d: 0.18, a: 0.6 }, bars: { c: 0x8a6a3c, f: 6, w: 0.3, k: 0.4, from: -0.5, to: 0.8, ca0: 0.1 }, mott: 0.08 });
  S.body = { rings: 14, seg: 9, keys: [[-0.5, 0.08, 0.11, 0.05], [-0.36, 0.15, 0.2, 0.03], [-0.1, 0.2, 0.25, 0.0], [0.2, 0.21, 0.25, 0.0], [0.42, 0.16, 0.2, 0.02], [0.56, 0.1, 0.13, 0.04]] };
  S.neck = { n: 1, len: 0.25, at: [0, 0.06, 0.6], rr: 4, seg: 8, keys: [[0, 0.14, 0.14, 0], [0.25, 0.1, 0.11, 0]], rest: [0.2], hrest: -0.15, stab: [0.5], look: 0.7 };
  S.head = { len: 0.45, scale: 1.0, jaw: [-0.05, 0.07], build: function (g, jg, b) {
    var fc = function (x, y, z, nx, ny) { var ex = Math.sqrt(x * x / 0.09 + (y - 0.2) * (y - 0.2) / 0.08); return ex > 0.82 ? 0xf0dcb0 : (hash3(Math.floor(x * 12), Math.floor(y * 12), 5) > 0.82 ? 0x8a5a3a : (ny > 0 ? 0xd8845a : 0xa8643e)); };
    headStd(g, jg, b, S, { bk: 0.8, kf: 0.15, keys: [[-0.05, 0.09, 0.1, 0], [0.04, 0.12, 0.135, 0], [0.18, 0.1, 0.12, -0.005], [0.3, 0.08, 0.1, -0.02], [0.4, 0.055, 0.085, -0.035], [0.44, 0.035, 0.06, -0.04], [0.465, 0.015, 0.03, -0.042]],
      jkeys: [[0.04, 0.05, 0.036, -0.118], [0.18, 0.07, 0.036, -0.124], [0.34, 0.05, 0.03, -0.118], [0.42, 0.03, 0.022, -0.112], [0.46, 0.014, 0.012, -0.108]], eye: [0.108, 0.06, 0.15, 0.025], nos: [0.02, 0.05, 0.4, 0.008],
      extra: function (gg, k) {
        gg.sph(0.05, 0.03, 0.06, 0, 0.12, 0.3 * k, 0xc09858, { s: [6, 4] });
        gg.sph(0.04, 0.05, 0.055, 0, -0.04, 0.44 * k, 0xe0cc90, { s: [6, 4] });
        var th = 0.36, cy0 = 0.17, cz0 = -0.11, rx = 0.31, ry = 0.27, pPoly = [], pi;
        for (pi = 0; pi < 14; pi++) { var pa = -0.2 + (PI + 0.4) * (pi / 13); pPoly.push([Math.cos(pa) * rx, Math.sin(pa) * ry]); }
        gg.extrude(pPoly, 0.036, 0, cy0, cz0, [-th, 0, 0], fc, { axis: 'z', bev: 0.01, curveX: -0.24, curveY: -0.15 });
        for (var i = 1; i < 16; i++) { var a = PI * (i / 16), px = Math.cos(a) * rx * 0.98, py = Math.sin(a) * ry * 0.98, dz = -0.24 * px * px - 0.15 * py * py; gg.cone(0.016, 0.04, px, cy0 + py * cos(th) + dz * sin(th), cz0 - py * sin(th) + dz * cos(th), 0xf0dcb0, { seg: 4, rot: [-th, 0, -Math.cos(a) * 0.9] }); }
        for (var s = -1; s <= 1; s += 2) gg.sph(0.07, 0.07, 0.04, s * 0.22, 0.05, 0.0, 0xd8a060, { s: [6, 4] }); } });
  } };
  S.tail = { n: 3, len: 1.1, at: [0.0, -0.5], rr: 4, seg: 7, keys: [[0, 0.1, 0.13, 0], [0.5, 0.06, 0.08, 0], [1.1, 0.01, 0.014, 0]], rest: [-0.02, -0.08, -0.15], amp: 0.1, gaitAmp: 0.1, stab: 0.9, freq: 1.3 };
  S.legs = { chord: 0.92,
    h: { x: 0.2, y: 0, z: 0, r: [1, 1.0], w: [0.1, 0.06, 0.055], fx: 0.02, bend: 1, foot: padFoot(3, 0.055, 0x5a4630, 0x2a2018) },
    f: { x: 0.18, y: 0.0, z: 0.5, r: [1, 1], w: [0.085, 0.055, 0.05], fx: 0.02, bend: -1, sw: 0.8, foot: padFoot(4, 0.05, 0x5a4630, 0x2a2018) } };
  S.gait = { Dw: 1.8, Dr: 3.8, bw: 0.65, br: 0.42, lw: 0.07, lr: 0.14, bob: 0.02, bobR: 0.05 };
  S.eat = { p: 0.1, crouch: 0.03, gy: 0.05, hp: -0.85, bite: 0.0, curve: 0.2 };
  S.sleep = { y: 0.3, curl: 1.2, hp: -0.4, hy: 0.7, ffx: 0.05 }; S.swimDrop = 0.3;
  return S;
})());

// ---------------------------------------------------------------- Ankylosaurus (armoured, tail club)
reg((function () {
  var S = { id: 'ankylosaurus', kind: 'quad', H: 1.4, J: 0.5, p0: 0.0, bs: 0.35, bh: 1.35, runAt: 3.5 };
  S.back = 0x655a50; S.belly = 0xb4a68a; S.footc = 0x3a322c; S.legc = 0x584e46;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x70655a, bAt: -0.05, bW: 0.6, spots: { c: 0x3c342e, f: 7, k: 4, d: 0.14, a: 0.6 }, mott: 0.1 });
  var K = [[-0.72, 0.09, 0.09, 0.06], [-0.55, 0.28, 0.17, 0.06], [-0.3, 0.46, 0.24, 0.05], [0.0, 0.52, 0.27, 0.04], [0.3, 0.5, 0.27, 0.04], [0.55, 0.4, 0.22, 0.04], [0.72, 0.24, 0.15, 0.05], [0.82, 0.1, 0.08, 0.05]];
  S.body = { rings: 20, seg: 12, keys: K, flatBot: 0.65, extra: function (g) {
    var oc = function (x, y, z, nx, ny) { return ny > 0.3 ? 0xc8aa74 : 0x8a7650; };
    for (var i = 0; i < 9; i++) { var z = -0.46 + i * 0.125, pr = profAt(K, z);
      for (var row = 0; row < 5; row++) { var a = (row - 2) * 0.34, x = Math.sin(a) * pr[0] * 0.96, y = pr[2] + Math.cos(a) * pr[1] * 0.96, big = row === 2 ? 0.78 : 1;
        g.bevelBox(0.08 * big, 0.042 * big, 0.092 * big, 0.016 * big, x, y + 0.016, z + (row % 2) * 0.03, oc, { rot: [0, 0, -Math.sin(a) * 0.5] });
        g.cone(0.026 * big, 0.052 * big + (row % 2) * 0.012, x, y + 0.042, z + (row % 2) * 0.03, oc, { seg: 4, rot: [0, 0, -Math.sin(a) * 0.5] }); }
      for (var s = -1; s <= 1; s += 2) g.tube([[s * (pr[0] - 0.02), pr[2], z], [s * (pr[0] + 0.08), pr[2] + 0.015, z - 0.02], [s * (pr[0] + 0.145), pr[2] + 0.02, z - 0.05]], [0.032, 0.02, 0.002], 0xe8dcc0, { seg: 4, smooth: false }); } } };
  S.neck = { n: 1, len: 0.26, at: [0, 0.04, 0.78], rr: 4, seg: 8, keys: [[0, 0.2, 0.15, 0], [0.26, 0.16, 0.12, 0]], rest: [0.0], hrest: -0.2, stab: [0.5], look: 0.5 };
  S.head = { len: 0.46, scale: 1.0, jaw: [-0.03, 0.07], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.05, 0.14, 0.09, 0], [0.04, 0.17, 0.105, 0], [0.18, 0.125, 0.09, -0.005], [0.32, 0.075, 0.065, -0.015], [0.42, 0.055, 0.052, -0.022], [0.46, 0.03, 0.03, -0.024]],
      jkeys: [[0.03, 0.06, 0.03, -0.075], [0.18, 0.09, 0.03, -0.08], [0.34, 0.052, 0.022, -0.076], [0.44, 0.026, 0.014, -0.072]], eye: [0.145, 0.045, 0.15, 0.02], nos: [0.02, 0.01, 0.43, 0.008],
      extra: function (gg, k) { var hc = 0xd8c8a0;
        for (var s = -1; s <= 1; s += 2) { gg.cone(0.045, 0.2, s * 0.15, 0.04, -0.02, hc, { seg: 5, rot: [-1.2, 0, -s * 0.9] }); gg.cone(0.035, 0.12, s * 0.14, -0.04, 0.0, hc, { seg: 5, rot: [-0.9, 0, -s * 1.3] }); gg.sph(0.05, 0.03, 0.05, s * 0.13, 0.095, 0.1 * k, 0xc8aa74, { s: [5, 4] }); }
        for (var i = 0; i < 3; i++) for (s = -1; s <= 1; s += 2) bump(gg, s * (0.05 + i * 0.03), 0.095, 0.06 + i * 0.07, 0.022, 0xc8aa74); } });
  } };
  S.tail = { n: 4, len: 1.75, at: [0.0, -0.8], rr: 5, seg: 9, keys: [[0, 0.1, 0.12, 0], [0.5, 0.11, 0.1, 0], [1.2, 0.06, 0.06, 0], [1.75, 0.04, 0.04, 0]], rest: [-0.02, -0.05, -0.07, -0.08], amp: 0.06, gaitAmp: 0.07, stab: 0.9,
    each: function (g, i, n, seg) {
      for (var s = -1; s <= 1; s += 2) g.cone(0.03, 0.08, s * (profAt(S.tail.keys, i * seg + seg * 0.5)[0] + 0.0), 0.0, -seg * 0.5, 0xe8dcc0, { seg: 4, rot: [0, 0, -s * 1.3] });
      if (i === n - 1) { var cc = function (x, y, z, nx, ny) { return ny > 0.4 ? 0xc8aa74 : 0x8a7650; };
        g.sph(0.2, 0.1, 0.17, 0, 0.0, -seg * 0.85, cc, { s: [9, 6] }); for (s = -1; s <= 1; s += 2) { g.sph(0.07, 0.06, 0.08, s * 0.19, 0.0, -seg * 0.85, cc, { s: [6, 5] }); g.cone(0.05, 0.1, s * 0.22, 0.0, -seg * 0.85, 0xe8dcc0, { seg: 4, rot: [0, 0, -s * 1.4] }); } } } };
  S.legs = { chord: 0.93,
    h: { x: 0.32, y: 0, z: 0, r: [1, 1.0], w: [0.15, 0.1, 0.09], fx: 0.02, bend: 1, foot: padFoot(4, 0.085, 0x3a322c, 0x1f1a16) },
    f: { x: 0.34, y: 0.0, z: 0.45, r: [1, 1], w: [0.14, 0.1, 0.09], fx: 0.02, bend: -1, sw: 0.8, foot: padFoot(4, 0.085, 0x3a322c, 0x1f1a16) } };
  S.gait = { Dw: 1.4, Dr: 2.6, bw: 0.7, br: 0.5, lw: 0.05, lr: 0.1, bob: 0.01, bobR: 0.025 };
  S.eat = { p: 0.1, crouch: 0.03, gy: 0.05, hp: -0.85, bite: 0.0, curve: 0.2 };
  S.sleep = { y: 0.26, curl: 0.8, hp: -0.4, hy: 0.7, ffx: 0.05 }; S.swimDrop = 0.3;
  return S;
})());

// ---------------------------------------------------------------- Diplodocus (long horizontal neck, whip tail)
reg((function () {
  var S = { id: 'diplodocus', kind: 'sauro', H: 3.6, J: 0.8, p0: 0.03, bs: 0.25, bh: 1.35, runAt: 5.0 };
  S.back = 0x6f84a0; S.belly = 0xd3d8d2; S.footc = 0x3e4452; S.legc = 0x647894;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0x7a90ac, bAt: -0.05, bW: 0.7, spots: { c: 0x3c4c68, f: 5, k: 4, d: 0.16, a: 0.6 }, bars: { c: 0x4a5c78, f: 3, w: 0.3, k: 0.45, from: -1, to: 4.2, ca0: 0.1 }, mott: 0.07 });
  S.body = { rings: 20, seg: 10, ridge: 0.09, keys: [[-0.7, 0.1, 0.13, 0.06], [-0.5, 0.2, 0.26, 0.04], [-0.2, 0.28, 0.33, 0.02], [0.2, 0.28, 0.32, 0.0], [0.55, 0.22, 0.27, 0.0], [0.82, 0.14, 0.17, 0.04], [0.95, 0.09, 0.1, 0.07]],
    extra: function (g) {
      for (var i = 0; i < 10; i++) { var z = -0.58 + i * 0.155, pr = profAt(S.body.keys, z); g.cone(0.014, 0.042, 0, pr[2] + pr[1] * 1.03, z, 0x4a5a74, { seg: 4, rot: [-0.25, 0, 0] }); }
    } };
  S.neck = { n: 5, len: 2.0, at: [0, 0.1, 0.86], rr: 4, seg: 8, keys: [[0, 0.14, 0.16, 0], [0.5, 0.105, 0.115, 0], [1.2, 0.065, 0.07, 0], [2.0, 0.036, 0.04, 0]], rest: [0.5, 0.36, 0.26, 0.16, 0.08], hrest: -0.2, stab: [0.5, 0.6, 0.7, 0.8, 0.9], look: 0.8, run: -0.1 };
  S.head = { len: 0.36, scale: 1.0, jaw: [-0.03, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.04, 0.05, 0], [0.04, 0.056, 0.065, 0], [0.14, 0.05, 0.05, -0.008], [0.26, 0.042, 0.034, -0.02], [0.34, 0.046, 0.028, -0.026], [0.365, 0.034, 0.02, -0.027]],
      jkeys: [[0.03, 0.03, 0.02, -0.06], [0.14, 0.04, 0.02, -0.064], [0.28, 0.034, 0.014, -0.064], [0.35, 0.03, 0.01, -0.064]], eye: [0.052, 0.035, 0.09, 0.015], nos: [0.014, 0.06, 0.1, 0.008], iris: 0x302018 });
  } };
  S.tail = { n: 5, len: 4.2, at: [0.04, -0.7], rr: 5, seg: 8, keys: [[0, 0.15, 0.19, 0], [1.0, 0.1, 0.125, 0], [2.4, 0.052, 0.062, 0], [3.5, 0.026, 0.03, 0], [4.2, 0.008, 0.01, 0]], rest: [0.04, 0.03, 0.0, -0.04, -0.07], amp: 0.2, gaitAmp: 0.1, stab: 0.92, freq: 0.7 };
  S.legs = { f: { x: 0.2, y: -0.03, z: 0.7, w: [0.15, 0.1], sw: 0.9 }, h: { x: 0.2, y: 0, z: 0, w: [0.16, 0.11], sw: 1 } };
  S.gait = { Dw: 1.0, Dr: 1.8, bw: 0.78, br: 0.62, lw: 0.04, lr: 0.08, bob: 0.008, bobR: 0.02, pw: 0.012, roll: 0.02, yaw: 0.015 };
  S.eat = { p: 0.0, crouch: 0.0, gy: 0.05, hp: -1.0, bite: 0.0, curve: 0.2, tree: 0.3, treeY: 1.5, hpT: -0.1 };
  S.sleep = { y: 0.3, curl: 1.6, hp: -0.1, hy: 0.6, neckY: 0.0 }; S.swimDrop = 0.3; S.swimNeck = 0.3;
  S.call = { type: 'raise', neck: 0.18, hp: 0.3, jaw: 0.1, pitch: 0.0, min: 12, var: 20, dur: 3.0, shape: [1, 1, 1, 1, 1] };
  return S;
})());

// ---------------------------------------------------------------- Brachiosaurus (tall sloping body, vertical neck, long forelegs)
reg((function () {
  var S = { id: 'brachiosaurus', kind: 'sauro', H: 6.0, J: 0.6, p0: 0.26, bs: 0.22, bh: 1.35, runAt: 5.0 };
  S.back = 0xa8744a; S.belly = 0xe6d8b0; S.footc = 0x4a3828; S.legc = 0x9a6a42;
  S.sk = skin({ back: S.back, belly: S.belly, mid: 0xb4825a, bAt: -0.05, bW: 0.7, spots: { c: 0x5a3820, f: 5, k: 4, d: 0.18, a: 0.6 }, bars: { c: 0x6a4428, f: 3, w: 0.3, k: 0.4, from: -1, to: 2, ca0: 0.1 }, mott: 0.08 });
  S.body = { rings: 20, seg: 10, ridge: 0.08, keys: [[-0.78, 0.09, 0.12, 0.05], [-0.55, 0.18, 0.23, 0.04], [-0.2, 0.25, 0.3, 0.02], [0.2, 0.26, 0.3, 0.0], [0.6, 0.24, 0.29, 0.0], [0.9, 0.18, 0.24, 0.03], [1.04, 0.1, 0.14, 0.07]] };
  S.neck = { n: 5, len: 1.15, at: [0, 0.18, 0.92], rr: 4, seg: 8, keys: [[0, 0.15, 0.17, 0], [0.4, 0.1, 0.11, 0], [0.8, 0.062, 0.068, 0], [1.15, 0.04, 0.044, 0]], rest: [0.95, 1.15, 1.3, 1.25, 1.0], hrest: -0.5, stab: [0.5, 0.7, 0.8, 0.85, 0.9], look: 0.6, run: -0.1 };
  S.head = { len: 0.3, scale: 1.0, jaw: [-0.035, 0.05], build: function (g, jg, b) {
    headStd(g, jg, b, S, { bk: 0.85, keys: [[-0.03, 0.045, 0.055, 0], [0.04, 0.062, 0.075, 0.0], [0.14, 0.055, 0.062, -0.008], [0.23, 0.045, 0.045, -0.018], [0.285, 0.042, 0.034, -0.024], [0.305, 0.03, 0.022, -0.026]],
      jkeys: [[0.03, 0.034, 0.024, -0.075], [0.14, 0.044, 0.024, -0.08], [0.25, 0.036, 0.016, -0.078], [0.3, 0.026, 0.01, -0.076]], eye: [0.058, 0.04, 0.09, 0.017], nos: [0.014, 0.108, 0.105, 0.009], iris: 0x302018,
      extra: function (gg, k) {
        // iconic arched Brachiosaurus nasal crest dome
        gg.tube([[0, 0.042, 0.015], [0, 0.115, 0.07 * k], [0, 0.118, 0.135 * k], [0, 0.04, 0.2 * k]], [0.028, 0.042, 0.036, 0.022], S.back, { seg: 8, sx: 0.85, sz: 1.15, steps: 2 });
      } });
  } };
  S.tail = { n: 4, len: 1.4, at: [0.0, -0.75], rr: 5, seg: 8, keys: [[0, 0.13, 0.17, 0], [0.5, 0.09, 0.11, 0], [1.0, 0.045, 0.055, 0], [1.4, 0.01, 0.014, 0]], rest: [-0.05, -0.15, -0.22, -0.28], amp: 0.12, gaitAmp: 0.08, stab: 0.9, freq: 0.7 };
  S.legs = { f: { x: 0.21, y: 0.0, z: 0.72, w: [0.12, 0.085], sw: 0.9 }, h: { x: 0.21, y: 0, z: 0, w: [0.12, 0.085], sw: 1 } };
  S.gait = { Dw: 0.9, Dr: 1.6, bw: 0.8, br: 0.62, lw: 0.03, lr: 0.06, bob: 0.006, bobR: 0.015, pw: 0.01, roll: 0.015, yaw: 0.012 };
  S.eat = { p: 0.0, crouch: 0.0, gy: 0.05, hp: -1.0, bite: 0.0, curve: 0.2, tree: 0.55, treeY: 1.95, hpT: -0.2, hdrop: 0.0 };
  S.sleep = { y: 0.28, p: -0.2, curl: 1.8, hp: -0.1, hy: 0.6, neckY: 0.0 }; S.swimDrop = 0.3; S.swimNeck = 1.2;
  S.call = { type: 'raise', neck: 0.12, hp: 0.3, jaw: 0.1, pitch: 0.0, min: 12, var: 20, dur: 3.0, shape: [1, 1, 1, 1, 1] };
  return S;
})());
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
  g.cyl(0.056, 0.068, 0.11, 0, 1.43, 0, shade(sk, 0.92), { seg: 8 });
  g.sph(r, r * 1.06, r * 1.0, 0, hy, 0, sk, { s: [10, 8] });
  g.sph(0.024 * ks, 0.036 * ks, 0.018 * ks, r * 0.96, hy - 0.005, -0.005, shade(sk, 0.92), { s: [5, 4] });
  g.sph(0.024 * ks, 0.036 * ks, 0.018 * ks, -r * 0.96, hy - 0.005, -0.005, shade(sk, 0.92), { s: [5, 4] });
  g.sph(0.025, 0.022, 0.014, 0.056 * ks, hy + 0.016, r * 0.90, 0xfafafa, { s: [5, 4] });
  g.sph(0.025, 0.022, 0.014, -0.056 * ks, hy + 0.016, r * 0.90, 0xfafafa, { s: [5, 4] });
  g.sph(0.015, 0.016, 0.014, 0.056 * ks, hy + 0.016, r * 0.945, 0x15100c, { s: [5, 4] });
  g.sph(0.015, 0.016, 0.014, -0.056 * ks, hy + 0.016, r * 0.945, 0x15100c, { s: [5, 4] });
  g.limb(0.032 * ks, hy + 0.048 * ks, r * 0.93, 0.078 * ks, hy + 0.044 * ks, r * 0.88, 0.009, 0.007, shade(hc, 0.85), { seg: 4 });
  g.limb(-0.032 * ks, hy + 0.048 * ks, r * 0.93, -0.078 * ks, hy + 0.044 * ks, r * 0.88, 0.009, 0.007, shade(hc, 0.85), { seg: 4 });
  g.sph(0.022 * ks, 0.026 * ks, 0.028 * ks, 0, hy - 0.028 * ks, r * 1.01, shade(sk, 0.91), { s: [5, 4] });
  g.sph(0.036 * ks, 0.011 * ks, 0.012 * ks, 0, hy - 0.075 * ks, r * 0.94, shade(sk, 0.68), { s: [5, 4] });
  if (st === 1) { g.sph(r * 1.07, r * 0.78, r * 1.09, 0, hy + 0.052, -0.014, hc, { s: [9, 6] }); g.sph(0.11 * ks, 0.032, 0.045, 0, hy + 0.10 * ks, r * 0.78, hc, { s: [6, 4] }); }
  else if (st === 2) { g.sph(r * 1.08, r * 0.82, r * 1.1, 0, hy + 0.05, -0.02, hc, { s: [9, 6] }); g.sph(r * 1.06, 0.23 * ks, 0.075, 0, hy - 0.17, -r * 0.76, hc, { s: [8, 5] }); g.limb(r * 0.92, hy + 0.04, -0.02, r * 0.98, hy - 0.22, -0.03, 0.048, 0.034, hc, { seg: 6 }); g.limb(-r * 0.92, hy + 0.04, -0.02, -r * 0.98, hy - 0.22, -0.03, 0.048, 0.034, hc, { seg: 6 }); }
  else if (st === 3) { g.sph(r * 1.07, r * 0.82, r * 1.09, 0, hy + 0.05, -0.015, hc, { s: [9, 6] }); g.sph(0.06, 0.06, 0.06, 0, hy + 0.0, -r * 1.1, hc, { s: [6, 4] }); g.limb(0, hy, -r * 1.1, 0, hy - 0.21, -r * 1.2, 0.042, 0.028, hc, { seg: 6 }); }
  else if (st === 4) { for (var i = 0; i < 9; i++) { var a = i / 9 * TAU; g.sph(0.072, 0.072, 0.072, Math.sin(a) * r * 0.85, hy + 0.07 + (i % 2) * 0.03, Math.cos(a) * r * 0.85, hc, { s: [6, 4] }); } g.sph(0.1, 0.085, 0.1, 0, hy + 0.15, 0, hc, { s: [6, 4] }); }
  else if (st === 5) { g.sph(r * 1.08, r * 0.82, r * 1.1, 0, hy + 0.048, -0.015, k.hat, { s: [9, 6] }); g.cyl(0.11 * ks, 0.125 * ks, 0.022, 0, hy + 0.052, r * 0.98, shade(k.hat, 0.85), { seg: 8, sx: 1.05, sz: 0.72 }); }
  else if (st === 6) { g.cyl(0.36 * ks, 0.36 * ks, 0.025, 0, hy + 0.08, 0, shade(k.hat, 1.05), { seg: 12 }); g.cyl(0.17 * ks, 0.2 * ks, 0.12, 0, hy + 0.14, 0, k.hat, { seg: 10 }); }
  else if (st === 7) { g.sph(r * 1.09, r * 0.96, r * 1.1, 0, hy + 0.06, 0, k.hat, { s: [9, 6] }); g.sph(0.048, 0.048, 0.048, 0, hy + 0.24, 0, shade(k.hat, 1.2), { s: [6, 4] }); }
  else if (st === 8) { /* peaked cap */ g.cyl(r * 1.08, r * 1.12, 0.1, 0, hy + 0.1, 0, k.hat, { seg: 10 }); g.cyl(0.11 * ks, 0.125 * ks, 0.02, 0, hy + 0.07, r * 0.98, shade(k.hat, 0.7), { seg: 8, sx: 1.08, sz: 0.75 }); g.sph(0.025, 0.025, 0.012, 0, hy + 0.12, r * 1.1, 0xe8c030, { s: [5, 4] }); g.sph(r * 1.05, r * 0.5, r * 1.05, 0, hy + 0.04, 0, hc, { s: [8, 5] }); }
  else if (st === 9) { /* bush hat */ g.cyl(0.4 * ks, 0.4 * ks, 0.025, 0, hy + 0.09, 0, k.hat, { seg: 12 }); g.cyl(0.16 * ks, 0.2 * ks, 0.12, 0, hy + 0.15, 0, k.hat, { seg: 10 }); g.cyl(0.165 * ks, 0.165 * ks, 0.03, 0, hy + 0.1, 0, shade(k.hat, 0.6), { seg: 10 }); }
  else if (st === 10) { /* hard hat: dome, brim all round, centre ridge */ g.sph(r * 1.1, r * 0.85, r * 1.12, 0, hy + 0.05, -0.01, k.hat, { s: [9, 6] }); g.cyl(r * 1.35, r * 1.35, 0.02, 0, hy + 0.045, 0, shade(k.hat, 0.9), { seg: 12 }); g.box(0.05, 0.03, 0.3, 0, hy + 0.17, 0, shade(k.hat, 0.8)); }
  // st 0 = bald
}
function bodyGeo(k) {
  var key = [k.shirt, k.trouser, k.skin, k.style, k.hair, k.hat, k.kid ? 1 : 0, k.pack, k.stripe, k.coat ? 1 : 0, k.vest ? 1 : 0].join('|');
  if (bodyCache[key]) return bodyCache[key];
  var g = B(), sc = k.shirt, sf = k.stripe ? function (zc, ca, sa, x, y) { return fract(y * 8) < 0.5 ? sc : shade(sc, 0.82); } : sc;
  g.loft([[-1.40, 0.105, 0.075, 0], [-1.34, 0.215, 0.12, 0.005], [-1.18, 0.20, 0.125, 0.01], [-0.96, 0.172, 0.105, 0], [-0.79, 0.195, 0.118, 0], [-0.73, 0.135, 0.088, 0]], { down: true, rings: 8, seg: 10, cap0: true, cap1: true }, sf);
  g.sph(0.082, 0.074, 0.078, 0.23, SHO - 0.01, 0, sc, { s: [7, 5] });
  g.sph(0.082, 0.074, 0.078, -0.23, SHO - 0.01, 0, sc, { s: [7, 5] });
  g.cyl(0.082, 0.105, 0.042, 0, 1.39, 0, shade(sc, 0.86), { seg: 10 });
  var beltCol = shade(k.trouser || sc, 0.62);
  g.cyl(0.182, 0.192, 0.055, 0, HIP + 0.03, 0, beltCol, { seg: 12, sx: 1.12, sz: 0.66 });
  g.box(0.05, 0.04, 0.02, 0, HIP + 0.03, 0.13, 0xd8b848);
  if (k.coat) {
    g.cyl(0.195, 0.228, 0.34, 0, HIP - 0.12, 0, sc, { seg: 12, sx: 1.14, sz: 0.68 });
    g.limb(0.045, SHO - 0.02, 0.105, 0.012, HIP + 0.22, 0.125, 0.028, 0.02, shade(sc, 0.82), { seg: 6 });
    g.limb(-0.045, SHO - 0.02, 0.105, -0.012, HIP + 0.22, 0.125, 0.028, 0.02, shade(sc, 0.82), { seg: 6 });
    g.sph(0.013, 0.013, 0.008, 0, HIP + 0.14, 0.128, 0x333333, { s: [4, 3] });
    g.sph(0.013, 0.013, 0.008, 0, HIP + 0.24, 0.128, 0x333333, { s: [4, 3] });
  }
  if (k.vest) {
    g.cyl(0.196, 0.192, 0.06, 0, HIP + 0.29, 0, 0xf2d43a, { seg: 12, sx: 1.12, sz: 0.66 });
    g.cyl(0.205, 0.20, 0.06, 0, HIP + 0.43, 0, 0xf2d43a, { seg: 12, sx: 1.12, sz: 0.66 });
  }
  if (k.pack) {
    g.sph(0.15, 0.19, 0.088, 0, HIP + 0.35, -0.17, k.pack, { s: [8, 6] });
    g.sph(0.14, 0.06, 0.08, 0, HIP + 0.49, -0.165, shade(k.pack, 0.84), { s: [7, 4] });
  }
  headParts(g, k);
  return (bodyCache[key] = g.build());
}
function legGeo(trouser, skin, shorts) {
  var key = trouser + '|' + (shorts ? skin : 0) + '|' + (shorts ? 1 : 0);
  if (legCache[key]) return legCache[key];
  var g = B(), L = HIP;
  g.sph(0.086, 0.086, 0.086, 0, 0, 0, trouser, { s: [7, 5] });
  if (shorts) {
    g.limb(0, 0, 0, 0, -0.31, 0, 0.088, 0.076, trouser, { seg: 8 });
    g.sph(0.066, 0.066, 0.068, 0, -0.35, 0.004, skin, { s: [6, 5] });
    g.limb(0, -0.34, 0, 0, -0.71, 0, 0.065, 0.048, skin, { seg: 8 });
  } else {
    g.limb(0, 0, 0, 0, -0.38, 0, 0.088, 0.072, trouser, { seg: 8 });
    g.sph(0.07, 0.07, 0.072, 0, -0.38, 0.004, trouser, { s: [6, 5] });
    g.limb(0, -0.38, 0, 0, -0.71, 0, 0.072, 0.056, trouser, { seg: 8 });
  }
  g.cyl(0.06, 0.065, 0.075, 0, -L + 0.046, -0.005, 0x2b2b30, { seg: 8 });
  g.sph(0.07, 0.046, 0.11, 0, -L + 0.044, 0.072, 0x2b2b30, { s: [7, 5] });
  g.cyl(0.07, 0.074, 0.022, 0, -L + 0.011, 0.034, 0x45454c, { seg: 8, sx: 1.0, sz: 1.72 });
  return (legCache[key] = g.build());
}
function armGeo(shirt, skin, shortSl) {
  var key = shirt + '|' + skin + '|' + (shortSl ? 1 : 0);
  if (armCache[key]) return armCache[key];
  var g = B(), sl = shortSl ? 0.22 : 0.48;
  g.sph(0.064, 0.064, 0.064, 0, 0, 0, shirt, { s: [7, 5] });
  g.limb(0, 0, 0, 0, -sl, 0, 0.060, shortSl ? 0.054 : 0.045, shirt, { seg: 8 });
  g.cyl(0.056, 0.056, 0.022, 0, -sl, 0, shade(shirt, 0.86), { seg: 8 });
  g.limb(0, -sl, 0, 0, -0.56, 0, shortSl ? 0.046 : 0.042, 0.035, shortSl ? skin : shirt, { seg: 8 });
  g.sph(0.044, 0.054, 0.038, 0, -0.6, 0.004, skin, { s: [7, 5] });
  g.sph(0.018, 0.026, 0.018, 0, -0.585, 0.038, shade(skin, 0.94), { s: [5, 4] });
  return (armCache[key] = g.build());
}
function propGeo(name) {
  if (propCache[name]) return propCache[name];
  var g = B();
  if (name === 'bucket') { g.cyl(0.12, 0.09, 0.17, 0, -0.08, 0, 0x8d98a4, { seg: 8 }); g.cyl(0.115, 0.115, 0.01, 0, 0.0, 0, 0xd8b24a, { seg: 8 }); g.limb(-0.12, 0.0, 0, 0.12, 0.0, 0, 0.012, 0.012, 0x555a60, { seg: 4 }); }
  else if (name === 'case') { g.box(0.24, 0.17, 0.08, 0, -0.08, 0, 0xf4f4f4); g.box(0.07, 0.02, 0.085, 0, -0.08, 0, 0xd8322e); g.box(0.02, 0.07, 0.085, 0, -0.08, 0, 0xd8322e); g.box(0.1, 0.03, 0.04, 0, 0.01, 0, 0x888d94); }
  else if (name === 'toolbox') { g.box(0.26, 0.15, 0.1, 0, -0.1, 0, 0xc2402f); g.box(0.27, 0.025, 0.105, 0, -0.03, 0, 0x8d2a1f); g.box(0.12, 0.03, 0.04, 0, 0.01, 0, 0x888d94); g.box(0.04, 0.05, 0.11, 0.07, -0.1, 0, 0xd8d8d8); g.limb(-0.1, -0.06, 0.07, 0.1, -0.06, 0.07, 0.012, 0.012, 0xb8bdc4, { seg: 4 }); g.limb(0.05, -0.06, 0.07, 0.14, 0.02, 0.07, 0.012, 0.012, 0xb8bdc4, { seg: 4 }); }
  else if (name === 'clipboard') { g.box(0.17, 0.22, 0.015, 0, -0.1, 0.03, 0x8a6a3a); g.box(0.14, 0.18, 0.018, 0, -0.1, 0.035, 0xf8f8f2); g.box(0.06, 0.025, 0.02, 0, 0.02, 0.035, 0x888d94); g.box(0.1, 0.01, 0.02, 0, -0.06, 0.045, 0x4a7ac8); g.box(0.1, 0.01, 0.02, 0, -0.1, 0.045, 0x4a7ac8); }
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
    if (prop === 'bucket' || prop === 'case' || prop === 'clipboard' || prop === 'toolbox') { pr = grp('prop'); pr.position.set(0, -0.62, 0.02); (prop === 'bucket' ? arms[0] : arms[1]).add(pr); pr.add(mesh(propGeo(prop))); }
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
    else if (pn === 'case' || pn === 'toolbox') { a1 = lerp(a1, -0.8, wl); a0 = lerp(a0, -0.4 + 0.15 * sin(t * 3), wl); }
    else if (pn === 'flag') { a0 = lerp(a0, -0.7, wl); a1 = lerp(a1, -2.3 + 0.2 * sin(t * 3), wl); }
    else { a0 = lerp(a0, -0.5 + 0.15 * sin(t * 2), wl); }
  }
  I.a0 = damp(I.a0, a0, 14, dt); I.a1 = damp(I.a1, a1, 14, dt); I.a0z = damp(I.a0z, a0z, 12, dt); I.a1z = damp(I.a1z, a1z, 12, dt);
  var rg = I.rig;
  rg.position.y = (Math.abs(s) * 0.035 * gw * (1 + rw)) - 0.36 * sw;
  rg.rotation.x = 0.05 * gw + 0.28 * rw - 0.05 * sw + (st === 'work' && (I.propName === 'case' || I.propName === 'toolbox') ? 0.35 * wk : 0);
  rg.rotation.z = sway + 0.04 * gw * s;
  I.body.rotation.y = 0.12 * s * gw;
  I.legs[0].rotation.x = l0; I.legs[1].rotation.x = l1;
  I.arms[0].rotation.set(I.a0, 0, I.a0z); I.arms[1].rotation.set(I.a1, 0, -I.a1z);
  if (I.prop && I.propName !== 'bucket' && I.propName !== 'case' && I.propName !== 'toolbox') {
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
  scientist: { shirt: 0xf8f8f8, trouser: 0x2f6a6a, style: 1, coat: true, prop: 'clipboard', shortSl: false },
  cleaner: { shirt: 0x2f78c4, trouser: 0x24456e, style: 5, hat: 0x2f78c4, prop: 'broom', shortSl: true },
  guide: { shirt: 0xd8322e, trouser: 0x25252b, style: 5, hat: 0xd8322e, prop: 'flag', shortSl: false },
  mechanic: { shirt: 0xe2762a, trouser: 0xb85a1c, style: 10, hat: 0xf2c230, prop: 'toolbox', vest: true, shortSl: false },
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
  return function (x, y, z, nx, ny) {
    var h = hash3(Math.floor(x * 2.6), Math.floor(y * 2.6), Math.floor(z * 2.6));
    var grad = clamp((y - 1.2) * 0.05, -0.06, 0.12);
    var c = shade(base, 1 - amt / 2 + h * amt + grad);
    if (ny > 0.35) c = mixHex(shade(c, 1.12), 0x9de052, 0.14);
    else if (ny < -0.25) c = shade(c, 0.82);
    return c;
  };
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

SC.pine = { build: function (g) {
  g.lathe([[0.32, 0], [0.22, 0.4], [0.18, 1.5], [0.12, 3.2]], 0x5a3e24, { seg: 8, cap0: true });
  var L = [[1.58, 1.65, 1.25], [1.34, 1.55, 2.05], [1.06, 1.45, 2.85], [0.76, 1.28, 3.65], [0.44, 1.08, 4.4]];
  for (var i = 0; i < L.length; i++) {
    var r = L[i][0], h = L[i][1], y0 = L[i][2];
    g.lathe([[r * 0.72, y0 - 0.12], [r, y0 + 0.08], [r * 0.62, y0 + h * 0.52], [0.02, y0 + h]], leaf(shade(0x2f7040, 1 + i * 0.05), 0.3), { seg: 12, ridgeN: 7, ridgeA: 0.14, cap0: true });
  }
} };
SC.snow_pine = { build: function (g) {
  g.lathe([[0.32, 0], [0.22, 0.4], [0.18, 1.5], [0.12, 3.2]], 0x5a4a3a, { seg: 8, cap0: true });
  var L = [[1.58, 1.65, 1.25], [1.34, 1.55, 2.05], [1.06, 1.45, 2.85], [0.76, 1.28, 3.65], [0.44, 1.08, 4.4]];
  for (var i = 0; i < L.length; i++) {
    var r = L[i][0], h = L[i][1], y0 = L[i][2];
    g.lathe([[r * 0.72, y0 - 0.12], [r, y0 + 0.08], [r * 0.62, y0 + h * 0.52], [0.02, y0 + h]], leaf(0x2a6040, 0.25), { seg: 12, ridgeN: 7, ridgeA: 0.14, cap0: true });
    g.lathe([[r * 0.84, y0 + h * 0.24], [r * 0.62, y0 + h * 0.55], [0.02, y0 + h + 0.04]], function (px, py, pz) { return hash3(Math.floor(px * 3), 1, Math.floor(pz * 3)) > 0.12 ? 0xf2f7fb : 0xdde8f0; }, { seg: 12, ridgeN: 7, ridgeA: 0.12 });
  }
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
SC.flower_bed = { build: function (g) {
  g.bevelBox(1.74, 0.2, 0.15, 0.03, 0, 0.1, 0.8, 0x9a8a78); g.bevelBox(1.74, 0.2, 0.15, 0.03, 0, 0.1, -0.8, 0x9a8a78);
  g.bevelBox(0.15, 0.2, 1.5, 0.03, 0.8, 0.1, 0, 0x9a8a78); g.bevelBox(0.15, 0.2, 1.5, 0.03, -0.8, 0.1, 0, 0x9a8a78);
  g.box(1.5, 0.16, 1.5, 0, 0.1, 0, 0x5a3e28);
  var r = mkrng(5), cs = [0xf05a8a, 0xf4d040, 0xff8a3a, 0xffffff, 0xa060e0, 0xe84a4a];
  for (var i = 0; i < 14; i++) {
    var x = (r() - 0.5) * 1.25, z = (r() - 0.5) * 1.25, h = 0.24 + r() * 0.22;
    g.tube([[x, 0.15, z], [x + (r() - 0.5) * 0.05, 0.15 + h * 0.6, z + (r() - 0.5) * 0.05], [x, 0.15 + h, z]], [0.02, 0.014], 0x3f8a3a, { seg: 4, steps: 2 });
    g.lathe([[0.03, 0], [0.12, 0.04], [0.13, 0.08], [0.07, 0.09], [0.02, 0.04]], cs[i % 6], { seg: 6, ridgeN: 5, ridgeA: 0.28, x: x, y: 0.14 + h, z: z });
    g.sph(0.036, 0.028, 0.036, x, 0.19 + h, z, 0xf6d848, { s: [5, 3] });
    g.extrude([[0, 0], [0.07, 0.06], [0, 0.16], [-0.07, 0.06]], 0.015, x + 0.03, 0.22, z, [0.5, r() * TAU, 0], 0x4a9a40, { axis: 'y' });
  }
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
SC.cave_shelter = { build: function (g) {
  var RC = 0x7f7a74;
  rock(g, 1.3, 1.0, 1.0, -0.9, 0.8, -0.2, RC, 21); rock(g, 1.3, 1.0, 1.0, 0.9, 0.8, -0.2, RC, 22, 1); rock(g, 1.5, 0.85, 1.1, 0, 1.45, -0.35, 0x8a857e, 23, 0.5); rock(g, 1.2, 1.0, 0.9, 0, 0.9, -0.85, RC, 24);
  g.sph(0.62, 0.78, 0.5, 0, 0.65, 0.58, 0x1a1816, { s: [8, 6] }); g.box(1.0, 0.1, 0.5, 0, 0.05, 0.9, 0x6a655e);
  rock(g, 0.35, 0.3, 0.3, 1.2, 0.25, 0.85, 0x8d8882, 25);
} };
SC.wooden_shelter = { build: function (g) {
  var P = 0x7c5430, R = 0xa8774a, F = 0x6f4d2c;
  g.bevelBox(2.26, 0.1, 1.86, 0.03, 0, 0.05, 0, F);
  var ps = [[-1.0, -0.8, 1.75], [1.0, -0.8, 1.75], [-1.0, 0.8, 1.5], [1.0, 0.8, 1.5]];
  for (var i = 0; i < ps.length; i++) {
    g.cyl(0.08, 0.095, ps[i][2], ps[i][0], ps[i][2] * 0.5, ps[i][1], P, { seg: 7 });
    g.limb(ps[i][0], ps[i][2] - 0.35, ps[i][1], ps[i][0] * 0.72, ps[i][2], ps[i][1] * 0.82, 0.045, 0.04, P, { seg: 5 });
  }
  // horizontal log rails & planked back/side walls
  for (var ly = 0.25; ly <= 1.5; ly += 0.24) {
    g.cyl(0.085, 0.085, 2.08, 0, ly, -0.84, shade(R, 0.92 + (ly % 0.4) * 0.2), { seg: 6, rot: [0, 0, PI / 2] });
    if (ly < 1.35) {
      g.cyl(0.075, 0.075, 1.62, -1.02, ly, 0, shade(R, 0.9), { seg: 6, rot: [PI / 2, 0, 0] });
      g.cyl(0.075, 0.075, 1.62, 1.02, ly, 0, shade(R, 0.9), { seg: 6, rot: [PI / 2, 0, 0] });
    }
  }
  // pitched timber & moss-shingle gable roof with ridge beam
  gable(g, 2.2, 2.05, 1.55, 0.65, 0x6a4a2a, 0.22);
  g.cyl(0.065, 0.065, 2.66, 0, 2.22, 0, 0x4f351e, { seg: 6, rot: [0, 0, PI / 2] });
  g.sph(0.55, 0.22, 0.34, -0.25, 0.2, -0.35, 0xe0c878, { s: [7, 4] });
  g.sph(0.45, 0.18, 0.3, 0.35, 0.18, -0.4, 0xd4ba68, { s: [6, 4] });
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
SC.bench = { build: function (g) {
  var W = 0xb8864e, M = 0x3a3d44;
  for (var i = 0; i < 3; i++) g.box(1.5, 0.06, 0.14, 0, 0.46, 0.1 - i * 0.16, W);
  g.box(1.5, 0.12, 0.05, 0, 0.8, -0.26, W); g.box(1.5, 0.12, 0.05, 0, 0.64, -0.24, W);
  for (var s = -1; s <= 1; s += 2) { g.box(0.06, 0.46, 0.5, s * 0.68, 0.23, -0.02, M); g.limb(s * 0.68, 0.45, -0.25, s * 0.68, 0.85, -0.28, 0.03, 0.03, M, { seg: 4 }); g.box(0.07, 0.05, 0.55, s * 0.68, 0.55, 0, M); }
} };

var INSTANCED = { ginkgo: 1, pine: 1, monkey_puzzle: 1, cycad: 1, horsetail: 1, tree_fern: 1, dead_tree: 1, snow_pine: 1, jungle_tree: 1, bush: 1, fern: 1, reed_clump: 1, boulder: 1, rock_pile: 1, ice_floe: 1, log: 1, heat_rock: 1 };
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

// ================================================================ PREHISTORIC SCENERY (new ids)
var _sq = new T.Quaternion(), _sd = new T.Vector3();
function spike(g, x, y, z, dx, dy, dz, r, col, seg) { // cone from base (x,y,z) along (dx,dy,dz)
  var l = Math.sqrt(dx * dx + dy * dy + dz * dz); if (l < 1e-6) return;
  _sd.set(dx / l, dy / l, dz / l); _sq.setFromUnitVectors(_up, _sd);
  g.add(unitCyl(seg || 5, 0, 1), x + dx / 2, y + dy / 2, z + dz / 2, r, l, r, null, col, _sq);
}
function fanLeaf(g, x, y, z, r, col, tilt, yaw) { g.sph(r, r * 0.12, r * 0.8, x, y, z, col, { s: [6, 3], rot: [tilt || 0, yaw || 0, (tilt || 0) * 0.5] }); }

SC.ginkgo = { build: function (g) {
  var br = 0x7d6c58, r = mkrng(31), i;
  g.limb(0, 0, 0, 0.05, 2.4, 0, 0.3, 0.17, br, { seg: 7 });
  for (i = 0; i < 4; i++) { var a = i * 1.6 + 0.4; g.limb(Math.sin(a) * 0.12, 0.05, Math.cos(a) * 0.12, Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5, 0.11, 0.05, br, { seg: 5 }); }
  var Y = function (base) { return function (x, y, z, nx, ny) { var h = hash3(Math.floor(x * 3.1), Math.floor(y * 3.1), Math.floor(z * 3.1)); var c = mixHex(0x9cbc38, 0xe4d04a, h * 0.85 + (ny > 0.3 ? 0.15 : 0)); return ny < -0.3 ? shade(c, 0.78) : c; }; };
  var cols = Y();
  g.limb(0.05, 2.0, 0, 0.9, 3.0, 0.2, 0.1, 0.06, br, { seg: 5 }); g.limb(0.05, 2.2, 0, -0.8, 3.2, -0.3, 0.1, 0.06, br, { seg: 5 }); g.limb(0.05, 2.3, 0, 0.1, 3.6, 0.8, 0.09, 0.05, br, { seg: 5 });
  g.sph(1.0, 0.8, 1.0, 0.05, 3.7, 0.0, cols, { s: [8, 6] }); g.sph(0.85, 0.65, 0.8, 0.95, 3.1, 0.25, cols, { s: [7, 5] }); g.sph(0.85, 0.65, 0.8, -0.85, 3.3, -0.3, cols, { s: [7, 5] }); g.sph(0.75, 0.6, 0.75, 0.1, 3.4, 0.85, cols, { s: [7, 5] });
  g.sph(0.7, 0.55, 0.7, -0.2, 4.35, -0.1, cols, { s: [7, 5] });
  for (i = 0; i < 16; i++) { var az = r() * TAU, el = 0.2 + r() * 1.0, rr = 1.0 + r() * 0.25; fanLeaf(g, Math.sin(az) * Math.cos(el) * rr, 3.5 + Math.sin(el) * rr * 0.75, Math.cos(az) * Math.cos(el) * rr, 0.26, i % 3 ? 0xf2dc48 : 0xc8d040, el * 0.8, az); }
} };
SC.monkey_puzzle = { build: function (g) {
  var br = function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 6 + y * 4) < 0.25 ? 0x4c4034 : 0x6a5a48; };
  g.limb(0, 0, 0, 0, 3.4, 0, 0.3, 0.17, br, { seg: 7 });
  for (var i = 0; i < 3; i++) { var a = i * 2.1; g.limb(Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15, Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5, 0.1, 0.05, 0x5a4a38, { seg: 4 }); }
  var tiers = [[2.4, 6, 1.9, 0.5], [2.95, 6, 1.75, 0.55], [3.45, 5, 1.5, 0.6], [3.9, 5, 1.2, 0.65], [4.3, 4, 0.9, 0.7], [4.6, 3, 0.55, 0.9]];
  var G = function (x, y, z) { var d = Math.sqrt(x * x + z * z); return mixHex(0x2f6a3c, 0x6fa24c, clamp(d / 1.9, 0, 1) * 0.8 + hash3(Math.floor(x * 5), Math.floor(y * 5), Math.floor(z * 5)) * 0.2); };
  tiers.forEach(function (T2, k) {
    var y = T2[0], n = T2[1], len = T2[2], up = T2[3];
    for (var j = 0; j < n; j++) {
      var a = j / n * TAU + k * 0.7, dx = Math.sin(a), dz = Math.cos(a), ex = dx * len, ez = dz * len, ey = y + len * 0.12 * up;
      g.limb(dx * 0.1, y, dz * 0.1, ex, ey, ez, 0.09, 0.045, 0x4a3c2e, { seg: 5 });
      for (var s = 0; s < 4; s++) { var t = 0.35 + s * 0.2, px = dx * len * t, pz = dz * len * t, py = y + (ey - y) * t; spike(g, px, py, pz, dx * 0.45 + dz * (s % 2 ? 0.15 : -0.15), 0.34 * up, dz * 0.45 - dx * (s % 2 ? 0.15 : -0.15), 0.2, G, 4); }
      spike(g, ex, ey, ez, dx * 0.5, 0.3, dz * 0.5, 0.2, G, 4);
    }
  });
  spike(g, 0, 4.5, 0, 0, 0.6, 0, 0.22, G, 4);
} };
SC.cycad = { build: function (g) {
  var tk = function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 8 + y * 5) < 0.3 ? 0x4a3a2c : 0x6a5640; };
  g.cyl(0.34, 0.4, 1.2, 0, 0.6, 0, tk, { seg: 8 }); g.sph(0.38, 0.22, 0.38, 0, 1.2, 0, 0x5a4a38, { s: [8, 4] });
  var fc = [0x2c7a38, 0x3a8c44, 0x256c34];
  for (var i = 0; i < 13; i++) { var a = i / 13 * TAU, up = i % 3; frond(g, 0, 1.25 + up * 0.08, 0, a, 2.3 - up * 0.25, 0.05 + up * 0.3, 0.7 + up * 0.25, 0.28, fc[i % 3]); }
  g.sph(0.18, 0.3, 0.18, 0, 1.55, 0, 0xd8642a, { s: [6, 4] }); g.sph(0.1, 0.12, 0.1, 0, 1.85, 0, 0xe88a3a, { s: [5, 3] });
} };
SC.horsetail = { build: function (g) {
  var r = mkrng(17), i, k;
  for (i = 0; i < 11; i++) {
    var a = r() * TAU, d = 0.1 + r() * 0.5, h = 1.4 + r() * 1.5, lean = 0.05 + r() * 0.12, x0 = Math.sin(a) * d, z0 = Math.cos(a) * d, n = 5, cc = i % 2 ? 0x7fb860 : 0x92c86c;
    for (k = 0; k < n; k++) {
      var t0 = k / n, t1 = (k + 1) / n, ax = x0 + Math.sin(a) * lean * t0 * t0 * h, az = z0 + Math.cos(a) * lean * t0 * t0 * h, bx = x0 + Math.sin(a) * lean * t1 * t1 * h, bz = z0 + Math.cos(a) * lean * t1 * t1 * h;
      g.limb(ax, t0 * h, az, bx, t1 * h, bz, 0.055 - t0 * 0.02, 0.05 - t1 * 0.02, cc, { seg: 5 });
      if (k > 0) g.cone(0.26 - k * 0.03, 0.12, bx, t1 * h - 0.04, bz, 0x58a050, { seg: 6, rot: [PI, 0, 0] });
      else g.cyl(0.075, 0.075, 0.04, bx, t1 * h, bz, 0x5a7a40, { seg: 5 });
    }
    g.cone(0.06, 0.32, x0 + Math.sin(a) * lean * h, h + 0.14, z0 + Math.cos(a) * lean * h, 0x6a9a44, { seg: 5 });
  }
} };
SC.tree_fern = { build: function (g) {
  var tk = function (x, y, z) { return hash3(Math.floor(x * 9), Math.floor(y * 6), Math.floor(z * 9)) > 0.5 ? 0x4a3828 : 0x5c4630; };
  var pts = [], i; for (i = 0; i <= 5; i++) { var t = i / 5; pts.push([0.35 * t * t, t * 2.8, 0.05 * t]); }
  for (i = 0; i < 5; i++) { var a = pts[i], b = pts[i + 1]; g.limb(a[0], a[1], a[2], b[0], b[1], b[2], 0.2 - i * 0.012, 0.2 - (i + 1) * 0.012, tk, { seg: 6 }); }
  var c = pts[5], fc = [0x4aa84a, 0x5cba54, 0x3e9a44];
  for (i = 0; i < 11; i++) frond(g, c[0], c[1] + 0.05, c[2], i / 11 * TAU + 0.3, 2.3 + (i % 3) * 0.25, 0.15 + (i % 3) * 0.17, 0.95 + (i % 2) * 0.2, 0.34, fc[i % 3]);
  for (i = 0; i < 4; i++) g.sph(0.1, 0.1, 0.1, c[0] + Math.sin(i * 1.6) * 0.18, c[1] + 0.22 + (i % 2) * 0.1, c[2] + Math.cos(i * 1.6) * 0.18, 0xc0d870, { s: [5, 4] });
} };
SC.dead_tree = { build: function (g) {
  var br = function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 5 + y * 3) < 0.3 ? 0x5e564c : 0x80766a; };
  g.limb(0, 0, 0, 0.1, 1.6, 0.0, 0.3, 0.2, br, { seg: 7 }); g.limb(0.1, 1.6, 0, -0.1, 2.9, 0.1, 0.2, 0.1, br, { seg: 6 }); g.cone(0.1, 0.35, -0.1, 3.0, 0.1, 0x6e655a, { seg: 5, rot: [0.2, 0, 0.1] });
  g.limb(0.1, 1.5, 0, 1.2, 2.5, 0.2, 0.12, 0.05, br, { seg: 5 }); g.limb(1.2, 2.5, 0.2, 1.7, 3.5, 0.1, 0.05, 0.02, br, { seg: 4 });
  g.limb(0.0, 2.1, 0.0, -1.0, 2.9, -0.3, 0.1, 0.04, br, { seg: 5 }); g.limb(-1.0, 2.9, -0.3, -1.5, 3.6, -0.2, 0.04, 0.02, br, { seg: 4 }); g.limb(-0.5, 2.5, -0.1, -0.8, 3.5, 0.2, 0.04, 0.02, br, { seg: 4 });
  g.limb(0.0, 1.0, 0.2, 0.7, 1.7, 0.8, 0.08, 0.03, br, { seg: 4 });
  g.sph(0.1, 0.16, 0.06, 0.1, 1.1, 0.26, 0x2a2420, { s: [5, 4] });
  for (var i = 0; i < 3; i++) { var a = i * 2.1 + 0.5; g.limb(Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15, Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6, 0.12, 0.05, br, { seg: 4 }); }
} };
SC.reed_clump = { build: function (g) {
  var r = mkrng(5), cs = [0x8aa048, 0x6e9040, 0x9ab454, 0x7c9a44], i;
  for (i = 0; i < 20; i++) { var a = r() * TAU, d = r() * 0.5, h = 1.0 + r() * 1.0, lean = 0.1 + r() * 0.3; g.cone(0.045, h, Math.sin(a) * d, h / 2, Math.cos(a) * d, cs[i % 4], { seg: 3, rot: [Math.cos(a) * lean, 0, -Math.sin(a) * lean] }); }
  for (i = 0; i < 6; i++) { var b = i * 1.1 + 0.3, dd = 0.1 + (i % 3) * 0.14, hh = 1.5 + (i % 3) * 0.2, x = Math.sin(b) * dd, z = Math.cos(b) * dd; g.limb(x, 0, z, x + Math.sin(b) * 0.05, hh, z + Math.cos(b) * 0.05, 0.012, 0.01, 0x7a9040, { seg: 3 }); g.cyl(0.045, 0.045, 0.3, x + Math.sin(b) * 0.05, hh + 0.12, z + Math.cos(b) * 0.05, 0x6a4a2a, { seg: 5 }); g.cone(0.045, 0.08, x + Math.sin(b) * 0.05, hh + 0.31, z + Math.cos(b) * 0.05, 0x6a4a2a, { seg: 5 }); }
} };
SC.scratching_post = { build: function (g) {
  var bk = function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 9 + y * 1.5) < 0.22 ? 0x4a3422 : 0x6e4e32; };
  g.cyl(0.24, 0.27, 2.4, 0, 1.2, 0, bk, { seg: 9 }); g.cyl(0.235, 0.235, 0.03, 0, 2.4, 0, 0xc8a070, { seg: 9 });
  for (var i = 0; i < 5; i++) { var a = 0.4 + i * 0.5; for (var k = 0; k < 3; k++) g.box(0.03, 0.7, 0.025, Math.sin(a + k * 0.07) * 0.245, 1.4 + (i % 2) * 0.3, Math.cos(a + k * 0.07) * 0.245, 0xdcb98c, { rot: [0, a + k * 0.07, 0.0] }); }
  rock(g, 0.5, 0.3, 0.45, 0.35, 0.15, 0.25, 0x8a8478, 41); rock(g, 0.4, 0.26, 0.4, -0.4, 0.12, 0.3, 0x7a756a, 42, 1); rock(g, 0.38, 0.24, 0.36, 0.0, 0.1, -0.45, 0x868074, 43, 2);
  g.limb(0.0, 0.3, 0.0, 0.85, 0.0, 0.0, 0.07, 0.05, 0x5a4028, { seg: 4 }); g.limb(0.0, 0.3, 0.0, -0.85, 0.0, 0.0, 0.07, 0.05, 0x5a4028, { seg: 4 });
  g.sph(0.2, 0.5, 0.2, 0, 2.55, 0, 0x6e4e32, { s: [6, 4] });
} };
SC.mud_wallow = { custom: function (grp0) {
  var g = B(), i;
  var mc = function (x, y, z, nx, ny) { var d = Math.sqrt(x * x + z * z); return d < 0.55 ? 0x4a3420 : (d < 0.8 ? 0x5e4228 : 0x7a5c3c); };
  g.cyl(0.96, 1.0, 0.08, 0, 0.04, 0, mc, { seg: 16 });
  for (i = 0; i < 14; i++) { var a = i / 14 * TAU; g.sph(0.2, 0.1, 0.16, Math.sin(a) * 0.98, 0.07, Math.cos(a) * 0.98, 0x8a6a46, { s: [5, 3], rot: [0, a, 0] }); }
  g.sph(0.5, 0.012, 0.4, 0.05, 0.085, -0.05, 0x6a4c30, { s: [9, 3] });
  for (i = 0; i < 4; i++) { var b = i * 1.7 + 0.4; g.sph(0.05, 0.02, 0.08, Math.sin(b) * 0.5, 0.1, Math.cos(b) * 0.5, 0x3a2816, { s: [4, 3], rot: [0, b, 0] }); }
  rock(g, 0.14, 0.09, 0.12, 0.8, 0.1, 0.5, 0x8a8478, 51);
  grp0.add(mesh(g.build()));
  var bg = unit('mudbub', function () { return new T.SphereGeometry(0.07, 6, 5); }), bm = mat(0x6a4c30), bubs = [];
  for (i = 0; i < 3; i++) { var m = new T.Mesh(bg, bm); m.userData.ph = i / 3; m.userData.x = (i - 1) * 0.28; m.userData.z = ((i * 7) % 3 - 1) * 0.2; grp0.add(m); bubs.push(m); }
  grp0.userData.update = function (dt, t) { for (var j = 0; j < bubs.length; j++) { var u = fract((t || 0) * 0.35 + bubs[j].userData.ph), s = Math.sin(u * PI); bubs[j].position.set(bubs[j].userData.x, 0.08, bubs[j].userData.z); bubs[j].scale.set(s * 1.0 + 0.01, s * 0.6 + 0.01, s * 1.0 + 0.01); } };
  grp0.userData.update(0, 0); return grp0;
} };
SC.carcass_feeder = { build: function (g) {
  var W = 0x7a5532, D = 0x5a3e22, i;
  g.box(2.0, 0.1, 1.2, 0, 0.05, 0, 0x6a4a2a);
  for (var s = -1; s <= 1; s += 2) { g.limb(s * 0.9, 0.05, 0.35, s * 0.85, 2.1, 0.0, 0.07, 0.06, W, { seg: 5 }); g.limb(s * 0.9, 0.05, -0.35, s * 0.85, 2.1, 0.0, 0.07, 0.06, W, { seg: 5 }); }
  g.limb(-0.95, 2.1, 0, 0.95, 2.1, 0, 0.08, 0.08, D, { seg: 6 });
  g.limb(0, 2.1, 0, 0, 1.75, 0, 0.02, 0.02, 0x555a60, { seg: 4 }); g.limb(0, 1.78, 0, 0.0, 1.55, 0.14, 0.02, 0.02, 0x555a60, { seg: 4 });
  var meat = function (x, y, z, nx, ny) { return hash3(Math.floor(x * 9), Math.floor(y * 9), Math.floor(z * 9)) > 0.75 ? 0xf0b0a0 : (ny > 0.3 ? 0xc43a3a : 0xa02c30); };
  g.sph(0.34, 0.5, 0.26, 0, 1.2, 0.1, meat, { s: [8, 6] }); g.sph(0.2, 0.2, 0.18, 0.0, 0.85, 0.1, 0xe8a0a0, { s: [6, 4] });
  g.limb(0, 0.8, 0.1, 0.1, 0.55, 0.12, 0.05, 0.035, 0xf2ead4, { seg: 5 }); g.sph(0.07, 0.06, 0.07, 0.1, 0.52, 0.12, 0xf2ead4, { s: [5, 4] }); g.sph(0.06, 0.05, 0.06, 0.16, 0.55, 0.16, 0xf2ead4, { s: [5, 4] });
  g.box(1.3, 0.18, 0.45, 0, 0.19, 0.85, D); g.box(1.2, 0.05, 0.36, 0, 0.3, 0.85, 0x3a2a1a);
  g.sph(0.2, 0.12, 0.16, -0.3, 0.36, 0.85, 0xb83034, { s: [6, 4] }); g.sph(0.16, 0.1, 0.14, 0.15, 0.35, 0.85, 0xd05a50, { s: [6, 4] }); g.limb(0.35, 0.34, 0.8, 0.55, 0.4, 0.9, 0.03, 0.025, 0xf2ead4, { seg: 4 });
  g.box(0.5, 0.35, 0.03, 0.0, 2.35, 0.0, 0xb8322e); g.box(0.4, 0.06, 0.04, 0.0, 2.35, 0.0, 0xf2ead4);
} };
SC.fossil_skeleton = { build: function (g) {
  var BN = function (x, y, z, nx, ny) { return ny > 0.2 ? 0xf4ecd6 : (ny < -0.3 ? 0xcabd9c : 0xe6dcc2); }, DK = 0xb0a280, i, s;
  g.box(1.5, 0.16, 2.3, 0, 0.08, 0, 0x6a655c); g.box(1.4, 0.06, 2.2, 0, 0.19, 0, 0x8a8478); g.box(1.0, 0.02, 0.3, 0, 0.23, 1.05, 0xc8b878);
  // posts
  g.limb(0, 0.2, 0.0, 0, 1.0, -0.08, 0.025, 0.025, 0x3a3d44, { seg: 5 }); g.limb(0, 0.2, -0.55, 0, 1.05, -0.55, 0.02, 0.02, 0x3a3d44, { seg: 5 });
  // spine: tail -> hips -> neck
  var sp = [], n = 26;
  for (i = 0; i < n; i++) { var t = i / (n - 1), z, y, r;
    if (t < 0.4) { var u = t / 0.4; z = -0.95 + u * 0.8; y = 1.0 + u * 0.12; r = 0.016 + u * 0.03; }
    else if (t < 0.72) { var u2 = (t - 0.4) / 0.32; z = -0.15 + u2 * 0.62; y = 1.12 + Math.sin(u2 * 2) * 0.03 + u2 * 0.04; r = 0.05; }
    else { var u3 = (t - 0.72) / 0.28; z = 0.47 + u3 * 0.3; y = 1.18 + u3 * u3 * 0.5 + u3 * 0.2; r = 0.05 - u3 * 0.02; }
    sp.push([0, y, z, r]); }
  for (i = 0; i < n; i++) { var p = sp[i]; g.sph(p[3], p[3] * 0.85, p[3] * 1.5, p[0], p[1], p[2], BN, { s: [6, 4] }); g.cone(p[3] * 0.4, p[3] * 2.2, 0, p[1] + p[3] * 1.6, p[2], DK, { seg: 3 }); }
  // ribs
  for (i = 0; i < 7; i++) { var q = sp[10 + i * 1 + 2 > n - 1 ? n - 1 : 11 + i], ys = q[1] - 0.02, zz = q[2]; var sz = 0.15 - Math.abs(i - 3) * 0.02;
    for (s = -1; s <= 1; s += 2) { g.limb(s * 0.03, ys, zz, s * (0.17 + sz), ys - 0.1, zz + 0.01, 0.014, 0.012, BN, { seg: 3 }); g.limb(s * (0.17 + sz), ys - 0.1, zz + 0.01, s * (0.19 + sz), ys - 0.3, zz + 0.03, 0.012, 0.01, BN, { seg: 3 }); g.limb(s * (0.19 + sz), ys - 0.3, zz + 0.03, s * 0.08, ys - 0.42, zz + 0.05, 0.01, 0.008, BN, { seg: 3 }); } }
  // pelvis and legs
  for (s = -1; s <= 1; s += 2) {
    g.sph(0.05, 0.14, 0.2, s * 0.09, 1.04, -0.12, BN, { s: [6, 5] }); g.sph(0.04, 0.1, 0.1, s * 0.09, 0.95, -0.28, BN, { s: [5, 4] });
    g.limb(s * 0.13, 1.0, -0.1, s * 0.16, 0.72, 0.12, 0.035, 0.028, BN, { seg: 5 }); g.sph(0.035, 0.035, 0.035, s * 0.16, 0.72, 0.12, BN, { s: [5, 4] });
    g.limb(s * 0.16, 0.72, 0.12, s * 0.16, 0.42, -0.06, 0.028, 0.02, BN, { seg: 5 }); g.sph(0.03, 0.03, 0.03, s * 0.16, 0.42, -0.06, BN, { s: [5, 4] });
    g.limb(s * 0.16, 0.42, -0.06, s * 0.16, 0.25, 0.04, 0.02, 0.017, BN, { seg: 5 });
    for (var tt = -1; tt <= 1; tt++) { g.limb(s * 0.16, 0.25, 0.04, s * 0.16 + tt * 0.05, 0.22, 0.24, 0.016, 0.01, BN, { seg: 4 }); spike(g, s * 0.16 + tt * 0.05, 0.22, 0.24, tt * 0.02, -0.02, 0.07, 0.012, 0x8a7e66, 4); }
    g.limb(s * 0.09, 1.1, 0.4, s * 0.12, 0.98, 0.5, 0.014, 0.01, BN, { seg: 4 }); g.limb(s * 0.12, 0.98, 0.5, s * 0.12, 0.9, 0.62, 0.01, 0.008, BN, { seg: 4 });
    for (i = 0; i < 6; i++) g.limb(s * 0.02, 0.05 + 1.12, -0.15 - i * 0.02, s * 0.05, 1.06 + 0, -0.18 - i * 0.12, 0.01, 0.006, BN, { seg: 3 });
  }
  // skull
  var hz = 0.8, hy = 1.62; g.loft([[0, 0.04, 0.05, 0], [0.08, 0.06, 0.075, 0.0], [0.2, 0.04, 0.05, -0.01], [0.3, 0.025, 0.032, -0.016], [0.34, 0.012, 0.02, -0.018]], { rings: 8, seg: 7, oz: hz, oy: hy, cap0: true, cap1: true }, BN);
  g.loft([[0.02, 0.03, 0.02, -0.065], [0.14, 0.045, 0.024, -0.07], [0.26, 0.026, 0.017, -0.066], [0.34, 0.012, 0.01, -0.062]], { rings: 6, seg: 6, oz: hz, oy: hy - 0.01, cap0: true, cap1: true }, shade(0xe6dcc2, 0.95));
  g.sph(0.026, 0.026, 0.026, 0.05, hy + 0.02, hz + 0.11, 0x2a241c, { s: [5, 4] }); g.sph(0.026, 0.026, 0.026, -0.05, hy + 0.02, hz + 0.11, 0x2a241c, { s: [5, 4] });
  g.box(0.012, 0.03, 0.09, 0.0, hy - 0.03, hz + 0.25, 0x2a241c);
  for (i = 0; i < 7; i++) for (s = -1; s <= 1; s += 2) { spike(g, s * 0.033, hy - 0.03, hz + 0.13 + i * 0.03, 0, -0.045, 0, 0.007, 0xfaf4e2, 3); spike(g, s * 0.027, hy - 0.08, hz + 0.14 + i * 0.027, 0, 0.035, 0, 0.006, 0xfaf4e2, 3); }
} };

SC.themepark_arch = { custom: function (grp0) {
  var g = B(), R = 0xe84a4a, W = 0xfaf0d8, G = 0xf2c030, B1 = 0x3b82f6;
  for (var s = -1; s <= 1; s += 2) {
    var x = s * 0.92;
    g.box(0.36, 0.26, 0.36, x, 0.13, 0, 0x8d8a84);
    g.cyl(0.13, 0.14, 2.3, x, 1.4, 0, function (px, py) { return fract(py * 2.2) < 0.5 ? R : W; }, { seg: 10 });
    g.cyl(0.18, 0.15, 0.14, x, 2.6, 0, G, { seg: 10 });
    g.sph(0.13, 0.13, 0.13, x, 2.78, 0, G, { s: [6, 5] });
  }
  var nSeg = 12, cols = [R, G, B1, 0x58b040, 0xf06aa0];
  for (var i = 0; i < nSeg; i++) {
    var t0 = i / nSeg, t1 = (i + 1) / nSeg;
    var a0 = lerp(PI, 0, t0), a1 = lerp(PI, 0, t1);
    var x0 = Math.cos(a0) * 0.92, y0 = 2.6 + Math.sin(a0) * 0.95;
    var x1 = Math.cos(a1) * 0.92, y1 = 2.6 + Math.sin(a1) * 0.95;
    g.limb(x0, y0, 0, x1, y1, 0, 0.13, 0.13, i % 2 ? R : W, { seg: 6 });
    g.cone(0.09, 0.22, (x0 + x1) / 2, (y0 + y1) / 2 - 0.18, 0, cols[i % cols.length], { seg: 4, rot: [PI, 0, 0] });
    g.sph(0.06, 0.06, 0.06, x0, y0 + 0.13, 0.08, 0xfff1b0, { s: [5, 4] });
  }
  g.box(1.1, 0.42, 0.12, 0, 3.55, 0, B1);
  g.box(1.18, 0.48, 0.08, 0, 3.55, 0, G);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('MIDWAY', 0xe84a4a, 0xfff4d0, 1.0, 0.32, 0, 3.55, 0.07, 0));
  grp0.add(labelMesh('MIDWAY', 0xe84a4a, 0xfff4d0, 1.0, 0.32, 0, 3.55, -0.07, PI));
  return grp0;
} };

SC.bunting_poles = { build: function (g) {
  var R = 0xe84a4a, W = 0xfaf0d8, G = 0xf2c030, cols = [0xe84a4a, 0xf2c030, 0x3b82f6, 0xf06aa0, 0x58b040];
  for (var s = -1; s <= 1; s += 2) {
    var x = s * 0.85;
    g.cyl(0.12, 0.15, 0.18, x, 0.09, 0, 0x7a7874, { seg: 8 });
    g.cyl(0.055, 0.065, 2.5, x, 1.35, 0, function (px, py) { return fract(py * 2.5) < 0.5 ? R : W; }, { seg: 8 });
    g.sph(0.09, 0.09, 0.09, x, 2.66, 0, G, { s: [6, 5] });
  }
  var n = 8;
  for (var i = 0; i < n; i++) {
    var t0 = i / n, t1 = (i + 1) / n;
    var x0 = lerp(-0.85, 0.85, t0), x1 = lerp(-0.85, 0.85, t1);
    var y0 = 2.45 - 0.38 * sin(PI * t0), y1 = 2.45 - 0.38 * sin(PI * t1);
    g.limb(x0, y0, 0, x1, y1, 0, 0.02, 0.02, 0x5a4a3a, { seg: 4 });
    g.cone(0.09, 0.22, (x0 + x1) / 2, (y0 + y1) / 2 - 0.12, 0, cols[i % cols.length], { seg: 3, rot: [PI, 0, 0] });
  }
} };

SC.funhouse_mirror = { build: function (g) {
  var G = 0xe8b838, R = 0xd83a2a, W = 0xfaf0d8, MIR = function (x, y) { return shade(0xb8e4fa, 0.92 + 0.12 * sin(y * 5 + x * 4)); };
  g.box(1.7, 0.14, 0.65, 0, 0.07, 0, 0x6a4a2e);
  var panels = [[-0.56, 0.08, 0.25], [0, 0, 0], [0.56, 0.08, -0.25]];
  for (var i = 0; i < panels.length; i++) {
    var p = panels[i];
    g.box(0.52, 1.85, 0.1, p[0], 1.06, p[1], G, { rot: [0, p[2], 0] });
    g.box(0.42, 1.68, 0.12, p[0], 1.06, p[1] + 0.01, MIR, { rot: [0, p[2], 0], s: [1, 6, 1] });
    g.sph(0.18, 0.45, 0.07, p[0], 1.05, p[1] + 0.04, 0xd8f2ff, { s: [6, 6], rot: [0, p[2], 0] });
  }
  g.box(1.72, 0.24, 0.18, 0, 2.08, 0.04, function (px) { return fract(px * 4) < 0.5 ? R : W; });
  for (var j = 0; j < 5; j++) g.sph(0.05, 0.05, 0.05, -0.68 + j * 0.34, 2.08, 0.14, 0xfff1b0, { s: [5, 4] });
} };

SC.balloon_arch = { custom: function (grp0) {
  var g = B(), cols = [0xe84a4a, 0xff8a3a, 0xf2c030, 0x58b040, 0x3b82f6, 0xa060e0, 0xf06aa0];
  for (var s = -1; s <= 1; s += 2) {
    g.cyl(0.22, 0.26, 0.25, s * 0.9, 0.125, 0, 0x8d8a84, { seg: 8 });
    g.cyl(0.14, 0.14, 0.1, s * 0.9, 0.28, 0, 0xf2c030, { seg: 8 });
  }
  grp0.add(mesh(g.build()));
  var arch = grp('arch'), bg = B();
  var n = 15;
  for (var i = 0; i < n; i++) {
    var a = lerp(PI, 0, i / (n - 1));
    var bx = Math.cos(a) * 0.9, by = 0.42 + Math.sin(a) * 2.25;
    bg.sph(0.22, 0.26, 0.22, bx, by, 0, cols[i % cols.length], { s: [7, 5] });
    bg.sph(0.16, 0.19, 0.16, bx + 0.08, by + 0.04, 0.12, cols[(i + 2) % cols.length], { s: [6, 4] });
    bg.sph(0.16, 0.19, 0.16, bx - 0.08, by + 0.04, -0.12, cols[(i + 4) % cols.length], { s: [6, 4] });
  }
  arch.add(mesh(bg.build()));
  grp0.add(arch);
  grp0.userData.update = function (dt, t) { arch.rotation.z = Math.sin((t || 0) * 1.4) * 0.035; };
  return grp0;
} };

SC.circus_lamp = { custom: function (grp0) {
  var g = B(), D = 0x3a3d44, R = 0xe84a4a, W = 0xfaf0d8;
  g.cyl(0.16, 0.2, 0.22, 0, 0.11, 0, D, { seg: 8 });
  g.cyl(0.06, 0.07, 2.7, 0, 1.55, 0, function (px, py) { return fract(py * 2.4) < 0.5 ? R : W; }, { seg: 8 });
  g.cyl(0.1, 0.1, 0.08, 0, 2.9, 0, 0xf2c030, { seg: 8 });
  g.limb(-0.5, 2.95, 0, 0.5, 2.95, 0, 0.035, 0.035, D, { seg: 5 });
  for (var s = -1; s <= 1; s += 2) {
    g.cyl(0.18, 0.04, 0.12, s * 0.5, 3.04, 0, R, { seg: 8 });
    g.cyl(0.02, 0.18, 0.05, s * 0.5, 3.12, 0, 0xf2c030, { seg: 8 });
  }
  grp0.add(mesh(g.build()));
  var bGeo = unit('bulbg', function () { return new T.SphereGeometry(0.13, 8, 6); });
  for (s = -1; s <= 1; s += 2) {
    var bulb = new T.Mesh(bGeo, LAMP_MAT); bulb.name = 'bulb'; bulb.position.set(s * 0.5, 2.88, 0); grp0.add(bulb);
  }
  grp0.userData.isLamp = true;
  return grp0;
} };

SC.clown_statue = { build: function (g) {
  var R = 0xe84a4a, W = 0xfaf0d8, G = 0xf0c038, G2 = 0xc89828;
  g.box(1.15, 0.24, 1.15, 0, 0.12, 0, 0x8d8a84);
  g.cyl(0.42, 0.46, 0.72, 0, 0.6, 0, function (px, py, pz) { return fract(Math.atan2(px, pz) / TAU * 6) < 0.5 ? R : W; }, { seg: 12 });
  g.cyl(0.48, 0.48, 0.1, 0, 1.0, 0, G, { seg: 12 });
  var y = 1.05;
  g.cyl(0.24, 0.3, 0.65, 0, y + 0.32, 0, G, { seg: 10 });
  g.cyl(0.32, 0.32, 0.08, 0, y + 0.65, 0, G2, { seg: 10 }); // ruff collar
  g.sph(0.24, 0.26, 0.24, 0, y + 0.92, 0, G, { s: [9, 7] }); // head
  g.sph(0.06, 0.06, 0.06, 0, y + 0.9, 0.25, R, { s: [5, 4] }); // clown nose
  // 3-pronged jester hat
  g.cone(0.11, 0.42, -0.22, y + 1.25, 0, G, { seg: 6, rot: [0, 0, 0.55] });
  g.cone(0.11, 0.42, 0.22, y + 1.25, 0, G, { seg: 6, rot: [0, 0, -0.55] });
  g.cone(0.1, 0.44, 0, y + 1.32, -0.1, G2, { seg: 6, rot: [-0.4, 0, 0] });
  g.sph(0.06, 0.06, 0.06, -0.34, y + 1.4, 0, R, { s: [5, 4] });
  g.sph(0.06, 0.06, 0.06, 0.34, y + 1.4, 0, R, { s: [5, 4] });
  g.sph(0.06, 0.06, 0.06, 0, y + 1.5, -0.18, R, { s: [5, 4] });
  // arms & star wand
  g.limb(-0.22, y + 0.52, 0, -0.45, y + 0.35, 0.15, 0.07, 0.06, G, { seg: 5 });
  g.limb(0.22, y + 0.52, 0, 0.42, y + 0.72, 0.18, 0.07, 0.06, G, { seg: 5 });
  g.limb(0.42, y + 0.72, 0.18, 0.48, y + 1.25, 0.22, 0.025, 0.025, G2, { seg: 4 });
  g.sph(0.12, 0.12, 0.06, 0.48, y + 1.32, 0.22, 0xfff080, { s: [6, 5] });
} };

// ---- 'rock' kind remap : legacy names kept harmlessly
// ================================================================ BUILDINGS
var BLD = {};
var BLD_DEF = { burger_stand: [1, 1], ice_cream: [1, 1], drinks_stall: [1, 1], coffee_cart: [1, 1], balloon_stand: [1, 1], info_kiosk: [1, 1], pizza_hut: [2, 1], toilets: [2, 1], viewing_platform: [2, 1], gift_shop: [2, 2], keeper_hut: [2, 2], emergency_bunker: [2, 2], hatchery: [3, 2], vet_clinic: [3, 2], carousel: [3, 3], research_lab: [4, 3], restaurant: [4, 3], education_centre: [4, 3], wooden_coaster: [5, 4], loop_coaster: [6, 4], mine_coaster: [4, 3], log_flume: [4, 4], ferris_wheel: [3, 3], rubber_duck_stand: [2, 1], air_rifle_stand: [2, 2], ring_toss_stand: [1, 1], whack_a_mole: [2, 1], high_striker: [1, 2], candy_floss: [1, 1], popcorn_stand: [1, 1], hot_dog_stand: [2, 1], slushie_bar: [2, 1] };
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
  g.box(w + 0.06, 0.045, 0.05, x, y + 0.025, z + 0.01, shade(c1, 0.7));
  for (var i = 0; i < n; i++) { g.box(sw * 1.01, 0.05, s, x - w / 2 + sw * (i + 0.5), y - Math.sin(slope) * d / 2, z + Math.cos(slope) * d / 2, i % 2 ? c2 : c1, { rot: [slope, 0, 0] }); g.box(sw * 1.01, 0.12, 0.04, x - w / 2 + sw * (i + 0.5), y - Math.sin(slope) * d - 0.04, z + d, i % 2 ? c2 : c1); }
}
function gable(g, w, d, y, h, col, over, ridgeAlongX) {
  over = over || 0.15; var half = d / 2, ang = Math.atan2(h, half), s = Math.sqrt(half * half + h * h) + over;
  g.box(w + over * 2, 0.1, s, 0, y + h / 2, half / 2, col, { rot: [ang, 0, 0] }); g.box(w + over * 2, 0.1, s, 0, y + h / 2, -half / 2, shade(col, 0.88), { rot: [-ang, 0, 0] });
  g.box(w + over * 2 + 0.04, 0.09, 0.14, 0, y + h + 0.03, 0, shade(col, 0.78));
  g.tri([w / 2, y, -half], [w / 2, y, half], [w / 2, y + h, 0], shade(col, 0.8), 1, 0, 0); g.tri([-w / 2, y, -half], [-w / 2, y, half], [-w / 2, y + h, 0], shade(col, 0.8), -1, 0, 0);
}
function windowAt(g, x, y, z, w, h, frame, glass) {
  g.box(w + 0.1, h + 0.1, 0.05, x, y, z, frame);
  g.box(w, h, 0.07, x, y, z + 0.005, glass || 0x9fd0ec);
  g.box(0.04, h, 0.08, x, y, z + 0.01, frame);
  g.box(w, 0.04, 0.08, x, y, z + 0.01, frame);
  g.box(w + 0.16, 0.055, 0.12, x, y - h / 2 - 0.04, z + 0.025, shade(frame, 0.88));
  g.box(w + 0.14, 0.045, 0.08, x, y + h / 2 + 0.04, z + 0.012, shade(frame, 0.84));
}
function stall(g, o) {
  var W = o.w || 1.6, D = o.d || 1.4, H = o.h || 1.2, y0 = 0.12;
  g.bevelBox(W + 0.2, 0.08, D + 0.2, 0.025, 0, 0.04, 0, 0x7c7972);
  g.bevelBox(W + 0.12, 0.08, D + 0.12, 0.02, 0, 0.11, 0, 0x949088);
  g.bevelBox(W, H, D, 0.04, 0, y0 + H / 2, 0, o.wall);
  for (var cx = -1; cx <= 1; cx += 2) for (var cz = -1; cz <= 1; cz += 2) g.cyl(0.048, 0.054, H, cx * (W / 2 - 0.01), y0 + H / 2, cz * (D / 2 - 0.01), shade(o.trim, 0.9), { seg: 6 });
  g.bevelBox(W + 0.05, 0.08, D + 0.05, 0.02, 0, y0 + H * 0.12, 0, o.trim);
  g.bevelBox(W + 0.06, 0.09, D + 0.06, 0.025, 0, y0 + H, 0, o.trim);
  g.box(W * 0.72, H * 0.36, 0.05, 0, y0 + H * 0.64, D / 2 + 0.005, 0x2a221e); g.bevelBox(W * 0.72 + 0.12, 0.06, 0.08, 0.015, 0, y0 + H * 0.82 + 0.05, D / 2 + 0.01, o.trim);
  g.bevelBox(W * 0.82, 0.07, 0.32, 0.02, 0, y0 + H * 0.45, D / 2 + 0.16, o.counter || 0xe8e0d0);
  g.box(0.3, 0.45, 0.04, W / 2 + 0.005, y0 + H * 0.6, 0.1, 0x2a221e); // side hatch
  awning(g, 0, y0 + H * 1.0 + 0.2, D / 2 - 0.02, W + 0.1, 0.65, o.awn1, o.awn2, 8, 0.45);
  g.bevelBox(W + 0.26, 0.07, D + 0.26, 0.025, 0, y0 + H + 0.04, 0, shade(o.roof, 0.88));
  g.bevelBox(W + 0.18, 0.1, D + 0.18, 0.035, 0, y0 + H + 0.11, 0, o.roof);
  for (var s = -1; s <= 1; s += 2) {
    g.cyl(0.026, 0.026, H * 0.56, s * (W / 2 + 0.02), y0 + H * 0.72, D / 2 + 0.55, 0xe8e0d0, { seg: 6 });
    g.limb(s * (W / 2 - 0.02), y0 + H * 0.44, D / 2 + 0.18, s * (W / 2 - 0.02), y0 + H * 0.26, D / 2 + 0.02, 0.025, 0.025, o.trim, { seg: 4 });
  }
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
  g.bevelBox(3.7, 0.12, 1.82, 0.04, 0, 0.06, 0, 0x8d8a84);
  g.bevelBox(3.45, 0.55, 1.56, 0.04, 0, 0.38, 0, 0xb4b8bc);
  g.bevelBox(3.4, 1.52, 1.52, 0.05, 0, 1.38, 0, 0xe0e4e8);
  for (var sP = -1; sP <= 1; sP += 2) g.cyl(0.08, 0.09, 2.02, sP * 1.66, 1.12, 0.74, 0x6a8aa8, { seg: 8 });
  gable(g, 3.45, 1.65, 2.08, 0.58, 0x526576, 0.22);
  g.bevelBox(1.2, 0.26, 0.52, 0.04, 0, 2.55, 0, 0x6c7c8a); // roof clerestory vent
  g.bevelBox(3.54, 0.22, 0.08, 0.03, 0, 1.94, 0.77, 0x5d82a4);
  var door = function (x, col, fem) {
    g.bevelBox(0.92, 1.62, 0.08, 0.025, x, 0.92, 0.74, 0xf4f4f4);
    g.bevelBox(0.8, 1.5, 0.07, 0.02, x, 0.9, 0.77, col);
    g.sph(0.04, 0.04, 0.04, x + 0.3, 0.85, 0.83, 0xe8c040, { s: [5, 4] });
    g.sph(0.07, 0.07, 0.03, x, 1.5, 0.82, 0xffffff, { s: [6, 4] }); g.box(fem ? 0.1 : 0.14, 0.22, 0.03, x, 1.32, 0.82, 0xffffff);
    if (fem) g.cone(0.14, 0.22, x, 1.26, 0.82, 0xffffff, { seg: 3 });
    else { g.box(0.04, 0.16, 0.03, x - 0.1, 1.3, 0.82, 0xffffff); g.box(0.04, 0.16, 0.03, x + 0.1, 1.3, 0.82, 0xffffff); }
  };
  door(-0.9, 0x3b82f6, false); door(0.9, 0xf472b6, true);
  windowAt(g, 0, 1.48, 0.77, 0.45, 0.35, 0xffffff, 0xaed8f0); g.bevelBox(0.55, 0.3, 0.06, 0.02, 0, 1.0, 0.77, 0x5d82a4);
  g.lathe([[0.18, 0], [0.22, 0.22], [0.16, 0.24]], 0x9a6a4a, { seg: 8, x: 1.52, y: 0.1, z: 0.92, cap0: true });
  g.sph(0.22, 0.2, 0.22, 1.52, 0.4, 0.92, 0x3f8a4a, { s: [6, 5] });
  g.lathe([[0.18, 0], [0.22, 0.22], [0.16, 0.24]], 0x9a6a4a, { seg: 8, x: -1.52, y: 0.1, z: 0.92, cap0: true });
  g.sph(0.22, 0.2, 0.22, -1.52, 0.4, 0.92, 0x3f8a4a, { s: [6, 5] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('WC', 0x5d82a4, 0xffffff, 0.45, 0.25, 0, 1.0, 0.81, 0));
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

// ================================================================ BUILDINGS (larger footprints)
function glassMesh(geo, col, op) { var m = new T.Mesh(geo, mat(col || 0x9fd8f0, { opacity: op || 0.35 })); m.renderOrder = 2; return m; }
function pulseMat(col, em) { return new T.MeshLambertMaterial({ color: col, emissive: em, transparent: true, opacity: 0.8, depthWrite: false }); }
function chainUpd(grp0, fn) { var prev = grp0.userData.update; grp0.userData.update = function (dt, t) { if (prev) prev(dt, t); fn(dt, t || 0); }; }
function post(g, x, z, y0, y1, col, r) { g.limb(x, y0, z, x, y1, z, r || 0.05, r || 0.05, col, { seg: 5 }); }
function railing(g, x0, z0, x1, z1, y, col) { post(g, x0, z0, y - 0.9, y, col, 0.04); post(g, x1, z1, y - 0.9, y, col, 0.04); g.limb(x0, y, z0, x1, y, z1, 0.03, 0.03, col, { seg: 4 }); g.limb(x0, y - 0.45, z0, x1, y - 0.45, z1, 0.025, 0.025, col, { seg: 4 }); }
function skullShape(g, x, y, z, s, col) { // dinosaur skull emblem facing +Z
  g.sph(0.5 * s, 0.4 * s, 0.55 * s, x, y + 0.05 * s, z, col, { s: [8, 6] }); g.box(0.42 * s, 0.26 * s, 0.6 * s, x, y - 0.18 * s, z + 0.4 * s, col);
  g.box(0.36 * s, 0.07 * s, 0.5 * s, x, y - 0.36 * s, z + 0.38 * s, shade(col, 0.9));
  for (var i = 0; i < 6; i++) { g.cone(0.025 * s, 0.1 * s, x + (i % 2 ? 1 : -1) * 0.16 * s, y - 0.31 * s, z + (0.2 + (i >> 1) * 0.14) * s + 0.2 * s, 0xfffaf0, { seg: 3, rot: [PI, 0, 0] }); }
  for (var e = -1; e <= 1; e += 2) { g.sph(0.14 * s, 0.14 * s, 0.1 * s, x + e * 0.27 * s, y + 0.08 * s, z + 0.35 * s, 0x2a2420, { s: [6, 4] }); g.sph(0.04 * s, 0.04 * s, 0.04 * s, x + e * 0.1 * s, y - 0.12 * s, z + 0.7 * s, 0x2a2420, { s: [4, 3] }); }
}

BLD.pizza_hut = function (grp0) { // 4x2 m: trattoria with brick oven, chimney, outdoor seating
  var g = B(), brick = function (x, y, z) { return fract(y * 8 + Math.floor(x * 4 + z * 4) * 0.5) < 0.12 ? 0xb8805a : 0xd8905a; };
  g.box(3.9, 0.12, 1.9, 0, 0.06, 0, 0x8d8a84); g.box(2.8, 1.5, 1.4, -0.5, 0.87, -0.2, 0xe8c898, { s: [1, 3, 1] });
  gable(g, 2.8, 1.4, 1.62, 0.6, 0xc03a2a, 0.2);
  g.cyl(0.62, 0.7, 0.2, 1.35, 0.22, -0.15, 0x8a7a68, { seg: 10 }); g.sph(0.62, 0.55, 0.6, 1.35, 0.5, -0.15, brick, { s: [10, 6] });
  g.box(0.5, 0.4, 0.04, 1.35, 0.5, 0.45, 0x2a1a14); g.sph(0.2, 0.15, 0.04, 1.35, 0.48, 0.46, 0xf08a20, { s: [6, 4] });
  g.box(0.3, 1.5, 0.3, 1.4, 1.35, -0.55, brick); g.box(0.4, 0.07, 0.4, 1.4, 2.12, -0.55, 0x6a5040);
  g.box(0.9, 1.1, 0.06, -1.3, 0.67, 0.52, 0x6a3a22); g.sph(0.04, 0.04, 0.04, -1.05, 0.65, 0.57, 0xe8c040, { s: [4, 3] });
  g.box(0.9, 0.6, 0.05, 0.05, 1.0, 0.52, 0x2a221e); g.box(1.0, 0.06, 0.3, 0.05, 0.7, 0.66, 0xf4ead0);
  awning(g, 0.05, 1.45, 0.52, 1.2, 0.55, 0x2f8a3c, 0xfaf0d8, 8, 0.45);
  for (var t = 0; t < 2; t++) { var tx = -1.4 + t * 1.0; g.cyl(0.26, 0.26, 0.04, tx, 0.7, 1.45, 0xf4ead0, { seg: 8 }); post(g, tx, 1.45, 0.1, 0.7, 0x4a3a2a, 0.03); g.box(0.22, 0.04, 0.22, tx - 0.4, 0.4, 1.45, 0x8a5a3a); g.box(0.22, 0.04, 0.22, tx + 0.4, 0.4, 1.45, 0x8a5a3a); post(g, tx - 0.4, 1.45, 0.1, 0.4, 0x4a3a2a, 0.02); post(g, tx + 0.4, 1.45, 0.1, 0.4, 0x4a3a2a, 0.02); }
  g.cyl(0.14, 0.12, 0.35, -1.75, 0.3, 0.5, 0x6a4a2a, { seg: 8 });
  grp0.add(mesh(g.build()));
  var p = addSpin(grp0, foods('pizza'), 2.75, 0.8); p.children[0].rotation.x = PI / 2; p.scale.setScalar(0.8); p.position.x = -0.5;
  grp0.add(labelMesh('PIZZA', 0x2f8a3c, 0xfff4d0, 1.0, 0.28, 0.05, 1.7, 0.74, 0));
  var sm = [], sg = unit('steamg', function () { return new T.SphereGeometry(0.07, 5, 4); }), smk = mat(0xdddddd, { opacity: 0.5 });
  for (var i = 0; i < 4; i++) { var m = new T.Mesh(sg, smk); m.userData.ph = i / 4; grp0.add(m); sm.push(m); }
  chainUpd(grp0, function (dt, tm) { for (var j = 0; j < 4; j++) { var u = fract(tm * 0.4 + sm[j].userData.ph); sm[j].position.set(1.4 + Math.sin(u * 6 + j) * 0.06, 2.25 + u * 0.8, -0.55); sm[j].scale.setScalar(0.6 + u * 1.3); } });
};
BLD.gift_shop = function (grp0) { // 4x4 m
  var g = B();
  g.box(3.9, 0.12, 3.9, 0, 0.06, 0, 0x8d8a84); g.box(3.5, 2.1, 2.2, 0, 1.17, -0.8, 0xf4d880, { s: [1, 3, 1] });
  gable(g, 3.5, 2.2, 2.22, 0.7, 0x7a4a9a, 0.22); g.box(3.6, 0.1, 2.3, 0, 2.2, -0.8, 0x5a3a7a);
  windowAt(g, -1.1, 1.3, 0.31, 1.0, 1.0, 0xffffff, 0xcfe8f6); windowAt(g, 1.1, 1.3, 0.31, 1.0, 1.0, 0xffffff, 0xcfe8f6);
  g.box(0.9, 1.6, 0.06, 0, 0.92, 0.31, 0x8a5a3a); g.box(1.0, 1.7, 0.04, 0, 0.97, 0.3, 0xffffff); g.sph(0.04, 0.04, 0.04, 0.3, 0.9, 0.36, 0xe8c040, { s: [4, 3] });
  awning(g, 0, 1.85, 0.31, 3.4, 0.75, 0x7a4a9a, 0xf8f0ff, 12, 0.4);
  g.box(0.2, 0.2, 0.2, -1.1, 0.62, 0.16, 0xe84a6a); g.sph(0.18, 0.2, 0.15, 1.0, 0.72, 0.16, 0xb87a4a, { s: [6, 5] });
  // stands in forecourt
  for (var s = -1; s <= 1; s += 2) { var x = s * 1.4; g.box(0.9, 0.06, 0.5, x, 0.62, 1.4, 0xb08050); post(g, x - 0.38, 1.25, 0.12, 0.6, 0x6a4a2a, 0.03); post(g, x + 0.38, 1.25, 0.12, 0.6, 0x6a4a2a, 0.03); post(g, x - 0.38, 1.55, 0.12, 0.6, 0x6a4a2a, 0.03); post(g, x + 0.38, 1.55, 0.12, 0.6, 0x6a4a2a, 0.03);
    g.sph(0.16, 0.18, 0.14, x - 0.2, 0.8, 1.4, 0x58b040, { s: [6, 5] }); g.sph(0.09, 0.09, 0.09, x - 0.2, 1.0, 1.44, 0x58b040, { s: [6, 4] }); g.box(0.2, 0.2, 0.2, x + 0.15, 0.75, 1.4, 0xf06a8a); g.sph(0.1, 0.1, 0.1, x + 0.3, 0.75, 1.4, 0xf2c030, { s: [5, 4] }); }
  // giant plush-dino gift box on roof
  g.box(0.8, 0.6, 0.8, 1.2, 3.0, -0.8, 0xe84a6a); g.box(0.84, 0.1, 0.84, 1.2, 3.35, -0.8, 0xf06a8a); g.box(0.14, 0.6, 0.84, 1.2, 3.0, -0.8, 0xf6d030); g.box(0.84, 0.6, 0.14, 1.2, 3.0, -0.8, 0xf6d030);
  g.sph(0.22, 0.12, 0.12, 1.1, 3.5, -0.8, 0xf6d030, { s: [5, 4] }); g.sph(0.22, 0.12, 0.12, 1.3, 3.5, -0.8, 0xf6d030, { s: [5, 4] });
  g.sph(0.3, 0.26, 0.3, -1.0, 2.55, -0.9, 0x6ac06a, { s: [6, 5] }); g.sph(0.14, 0.12, 0.2, -1.0, 2.8, -0.65, 0x6ac06a, { s: [5, 4] }); g.cone(0.1, 0.4, -1.0, 2.5, -1.2, 0x58a858, { seg: 5, rot: [-1.4, 0, 0] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('GIFT SHOP', 0x7a4a9a, 0xfff4d0, 1.5, 0.34, 0, 2.0, 0.34, 0));
  var bg = B(), cols = [0xe84a4a, 0xf2c030, 0x3b82f6, 0x58b040, 0xf06aa0]; for (var i = 0; i < 5; i++) { var bx = Math.sin(i * 1.3) * 0.25, hy = 0.5 + (i % 3) * 0.2; bg.sph(0.2, 0.25, 0.2, bx, hy + 0.5, Math.cos(i * 1.3) * 0.2, cols[i], { s: [7, 5] }); bg.limb(bx, hy + 0.25, 0, 0, 0, 0, 0.006, 0.006, 0xeeeeee, { seg: 3 }); }
  var bn = grp(); bn.position.set(-1.8, 0.1, 1.7); bn.add(mesh(bg.build())); grp0.add(bn);
  chainUpd(grp0, function (dt, tm) { bn.rotation.z = Math.sin(tm * 1.2) * 0.06; bn.rotation.y = tm * 0.3; });
};
BLD.keeper_hut = function (grp0) { // 4x4 m: Ranger station with watchtower and parked buggy
  var g = B(), wc = function (x, y, z) { return fract(y * 6) < 0.12 ? 0x7a5230 : 0x9a6a40; };
  g.box(3.9, 0.1, 3.9, 0, 0.05, 0, 0x8d8a84);
  g.box(2.2, 1.5, 1.9, -0.8, 0.85, -0.7, wc, { s: [1, 6, 1] }); gable(g, 2.2, 1.9, 1.6, 0.7, 0x3f7a4a, 0.22);
  g.box(0.6, 1.1, 0.06, -1.2, 0.65, 0.27, 0x6a4a2a); g.sph(0.035, 0.035, 0.035, -1.0, 0.65, 0.32, 0xe8c040, { s: [4, 3] });
  windowAt(g, -0.4, 0.95, 0.26, 0.6, 0.5, 0xf4ead0, 0xa8d0e8); g.box(0.24, 0.5, 0.05, -0.75, 0.95, 0.3, 0x3f7a4a); g.box(0.24, 0.5, 0.05, -0.05, 0.95, 0.3, 0x3f7a4a);
  g.box(1.3, 0.08, 0.5, -0.8, 0.14, 0.55, 0xb09a78); // porch
  g.box(0.5, 0.3, 0.35, -1.4, 0.15, 0.7, 0xe0c060); g.cyl(0.12, 0.1, 0.22, -0.3, 0.2, 0.75, 0x8d98a4, { seg: 8 });
  // watchtower (back right)
  var tx = 1.25, tz = -1.1;
  for (var a = -1; a <= 1; a += 2) for (var b = -1; b <= 1; b += 2) g.limb(tx + a * 0.5, 0.05, tz + b * 0.5, tx + a * 0.38, 3.2, tz + b * 0.38, 0.07, 0.06, 0x7a5230, { seg: 5 });
  for (var k = 1; k <= 2; k++) { var yy = k * 1.0; g.limb(tx - 0.5, yy, tz + 0.5, tx + 0.5, yy + 0.0, tz - 0.5, 0.03, 0.03, 0x6a4a2a, { seg: 4 }); g.limb(tx + 0.5, yy, tz + 0.5, tx - 0.5, yy, tz - 0.5, 0.03, 0.03, 0x6a4a2a, { seg: 4 }); }
  g.box(1.1, 0.1, 1.1, tx, 3.2, tz, 0x8a6a3a); railing(g, tx - 0.55, tz + 0.55, tx + 0.55, tz + 0.55, 4.05, 0x7a5230); railing(g, tx - 0.55, tz - 0.55, tx - 0.55, tz + 0.55, 4.05, 0x7a5230); railing(g, tx + 0.55, tz - 0.55, tx + 0.55, tz + 0.55, 4.05, 0x7a5230);
  for (a = -1; a <= 1; a += 2) for (b = -1; b <= 1; b += 2) post(g, tx + a * 0.5, tz + b * 0.5, 3.2, 4.5, 0x7a5230, 0.05);
  g.cone(0.95, 0.6, tx, 4.5, tz, 0x3f7a4a, { seg: 4, rot: [0, PI / 4, 0] }); g.box(0.2, 0.06, 1.1, tx + 0.0, 3.5, tz + 0.58, 0x3f7a4a);
  for (var r = 0; r < 7; r++) g.box(0.5, 0.05, 0.05, tx - 0.8 - Math.sin(0) , 0.2 + r * 0.45, tz + 0.12, 0x7a5230, { rot: [0, 0, 0] });
  g.limb(tx - 0.62, 0.0, tz + 0.65, tx - 0.55, 3.2, tz + 0.55, 0.03, 0.03, 0x7a5230, { seg: 4 }); g.limb(tx - 0.95, 0.0, tz + 0.7, tx - 0.55, 3.15, tz + 0.5, 0.03, 0.03, 0x7a5230, { seg: 4 });
  g.limb(tx, 4.7, tz, tx, 5.3, tz, 0.03, 0.03, 0x555555, { seg: 4 }); g.box(0.45, 0.28, 0.03, tx + 0.25, 5.15, tz, 0xe0a030);
  // parked buggy (front right)
  var bx = 1.0, bz = 1.1;
  g.box(1.1, 0.35, 0.65, bx, 0.45, bz, 0x3f8a4a); g.box(0.5, 0.25, 0.55, bx - 0.2, 0.72, bz, 0x2f6a3a); g.box(0.4, 0.14, 0.5, bx + 0.45, 0.5, bz, 0x2f6a3a);
  g.box(0.5, 0.03, 0.62, bx + 0.15, 0.86, bz, 0xf4ead0); for (var q = -1; q <= 1; q += 2) { post(g, bx + 0.4, bz + q * 0.3, 0.6, 1.35, 0x555555, 0.025); post(g, bx - 0.5, bz + q * 0.3, 0.6, 1.35, 0x555555, 0.025); }
  g.box(1.3, 0.05, 0.75, bx - 0.05, 1.37, bz, 0x3f7a4a); g.box(0.3, 0.1, 0.5, bx - 0.6, 0.9, bz, 0x8a6a3a);
  for (var w = 0; w < 4; w++) g.cyl(0.2, 0.2, 0.14, bx + (w < 2 ? 0.38 : -0.38), 0.22, bz + (w % 2 ? 0.36 : -0.36), 0x2a2a2a, { seg: 8, rot: [PI / 2, 0, 0] });
  g.sph(0.07, 0.07, 0.05, bx + 0.58, 0.55, bz + 0.2, 0xf8e890, { s: [5, 4] }); g.sph(0.07, 0.07, 0.05, bx + 0.58, 0.55, bz - 0.2, 0xf8e890, { s: [5, 4] });
  g.limb(-1.8, 0.0, 0.9, -1.8, 1.5, 0.9, 0.025, 0.025, 0x8a6a3a, { seg: 4 }); g.box(0.2, 0.03, 0.03, -1.8, 1.52, 0.9, 0xaaaaaa);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('RANGERS', 0x3f7a4a, 0xfff4d0, 1.0, 0.24, -0.8, 1.35, 0.275, 0));
  var beacon = new T.Mesh(unit('rbeacon', function () { return new T.SphereGeometry(0.12, 6, 5); }), pulseMat(0xff4a3a, 0xff2a1a)); beacon.position.set(tx, 4.62, tz); grp0.add(beacon);
  chainUpd(grp0, function (dt, tm) { beacon.material.opacity = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(tm * 4)); });
};
BLD.vet_clinic = function (grp0) { // 6x4 m
  var g = B();
  g.box(5.9, 0.12, 3.9, 0, 0.06, 0, 0x8d8a84);
  g.box(3.6, 2.4, 2.3, -0.9, 1.32, -0.75, 0xf4f6f8, { s: [1, 3, 1] }); g.box(3.8, 0.15, 2.5, -0.9, 2.55, -0.75, 0x3b82c4); g.box(3.4, 0.1, 2.2, -0.9, 2.65, -0.75, 0xe0e6ec);
  windowAt(g, -2.0, 1.45, 0.41, 0.9, 0.9, 0xffffff, 0xa8d8ee); windowAt(g, 0.2, 1.45, 0.41, 0.9, 0.9, 0xffffff, 0xa8d8ee);
  g.box(1.0, 1.7, 0.06, -0.9, 0.97, 0.41, 0xa8d8ee); g.box(1.1, 1.8, 0.05, -0.9, 1.02, 0.4, 0x3b82c4); g.box(0.04, 1.7, 0.08, -0.9, 0.97, 0.43, 0x3b82c4);
  awning(g, -0.9, 2.1, 0.4, 1.7, 0.8, 0x3b82c4, 0xffffff, 8, 0.38);
  g.box(2.0, 0.1, 0.9, -0.9, 0.08, 1.1, 0xc8c4bc); g.box(1.4, 0.2, 1.8, -0.9, 0.1, 1.5, 0xc8c4bc, { rot: [0.0, 0, 0] });
  g.cyl(0.6, 0.6, 0.14, -0.9, 3.25, -0.2, 0xffffff, { seg: 14, rot: [PI / 2, 0, 0] }); g.box(0.7, 0.2, 0.18, -0.9, 3.25, -0.1, 0xd8322e); g.box(0.2, 0.7, 0.18, -0.9, 3.25, -0.1, 0xd8322e);
  post(g, -0.9, -0.2, 2.65, 2.7, 0x888888, 0.05);
  // recovery paddock wing
  g.box(1.5, 1.4, 2.0, 1.95, 0.8, -0.8, 0xdfe8e0, { s: [1, 2, 1] }); g.box(1.7, 0.1, 2.2, 1.95, 1.55, -0.8, 0x3f8a4a); g.box(0.9, 1.0, 0.06, 1.95, 0.6, 0.22, 0x4a9a54);
  // fenced pen with hay and a patient
  g.box(2.4, 0.05, 1.5, 2.1, 0.14, 1.4, 0xd8c070); for (var i = 0; i <= 4; i++) post(g, 0.9 + i * 0.6, 2.15, 0.1, 0.9, 0xe8e0d0, 0.035);
  for (i = 0; i <= 2; i++) post(g, 0.9, 0.7 + i * 0.7, 0.1, 0.9, 0xe8e0d0, 0.035);
  g.limb(0.9, 0.85, 2.15, 3.3, 0.85, 2.15, 0.025, 0.025, 0xe8e0d0, { seg: 4 }); g.limb(0.9, 0.5, 2.15, 3.3, 0.5, 2.15, 0.025, 0.025, 0xe8e0d0, { seg: 4 }); g.limb(0.9, 0.85, 0.7, 0.9, 0.85, 2.15, 0.025, 0.025, 0xe8e0d0, { seg: 4 });
  g.sph(0.36, 0.22, 0.2, 2.2, 0.32, 1.3, 0x6aa860, { s: [7, 5] }); g.sph(0.13, 0.12, 0.13, 2.65, 0.38, 1.3, 0x6aa860, { s: [6, 4] }); g.limb(1.85, 0.3, 1.3, 1.4, 0.2, 1.4, 0.1, 0.03, 0x6aa860, { seg: 5 });
  g.box(0.5, 0.28, 0.4, 3.0, 0.18, 1.0, 0xf4f4f4); g.box(0.1, 0.3, 0.42, 3.0, 0.2, 1.0, 0xd8322e); g.box(0.3, 0.1, 0.42, 3.0, 0.2, 1.0, 0xd8322e);
  g.box(0.6, 0.5, 0.5, -2.4, 0.3, 1.5, 0x3f8a4a); g.sph(0.3, 0.3, 0.3, -2.4, 0.7, 1.5, 0x4a9a54, { s: [6, 4] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('VET CLINIC', 0x3b82c4, 0xffffff, 1.5, 0.32, -0.9, 2.35, 0.45, 0));
};
BLD.carousel = function (grp0) { // 6x6 m: dinosaur carousel
  var K = 1.62, g = B();
  g.cyl(2.9, 3.0, 0.16, 0, 0.08, 0, 0x8d8a84, { seg: 20 }); g.cyl(2.0, 2.2, 0.12, 0, 0.2, 0, 0xa8a49c, { seg: 20 });
  grp0.add(mesh(g.build()));
  var sp = grp('spin'); grp0.add(sp); var i;
  var s = B();
  s.cyl(2.7, 2.7, 0.14, 0, 0.3, 0, 0xc8923a, { seg: 20 }); s.cyl(2.78, 2.78, 0.06, 0, 0.38, 0, 0xe84a4a, { seg: 20 });
  s.cyl(0.36, 0.42, 3.9, 0, 2.3, 0, 0xf6e8b8, { seg: 10 }); s.cyl(0.55, 0.55, 0.12, 0, 0.46, 0, 0xe0b040, { seg: 10 });
  s.cyl(2.85, 2.85, 0.4, 0, 4.2, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 20) < 0.5 ? 0xf6e8b8 : 0x3fae8a; }, { seg: 20 });
  s.cyl(0.03, 3.1, 1.5, 0, 5.15, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 12) < 0.5 ? 0xe86a3a : 0xfaf0d8; }, { seg: 12 });
  for (i = 0; i < 16; i++) { var a = (i + 0.5) / 16 * TAU; s.sph(0.25, 0.14, 0.25, Math.sin(a) * 2.95, 4.05, Math.cos(a) * 2.95, i % 2 ? 0xe86a3a : 0xfaf0d8, { s: [5, 4] }); }
  s.sph(0.22, 0.22, 0.22, 0, 6.0, 0, 0xf2c030, { s: [6, 5] }); s.limb(0, 5.95, 0, 0, 6.4, 0, 0.03, 0.03, 0x555555, { seg: 4 }); s.box(0.4, 0.22, 0.02, 0.2, 6.3, 0, 0x3fae8a);
  for (i = 0; i < 8; i++) { var c = i / 8 * TAU; s.sph(0.07, 0.07, 0.07, Math.sin(c) * 2.85, 3.9, Math.cos(c) * 2.85, 0xfff4b0, { s: [4, 3] }); }
  sp.add(mesh(s.build()));
  var mounts = [], cols = [0x6ab04a, 0xe8864a, 0x5a9ad8, 0xe8c070, 0xc86aa8, 0x8a7ad0, 0xe8e0c0, 0x58b8a8];
  for (i = 0; i < 8; i++) {
    var h = B(), col = cols[i], c2 = shade(col, 1.2), tri = i % 3, ang = i / 8 * TAU;
    h.sph(0.26, 0.24, 0.5, 0, 0, 0, function (x, y) { return y < -0.05 ? c2 : col; }, { s: [8, 6] });
    h.limb(0, 0.12, 0.35, 0, 0.55, 0.55, 0.12, 0.09, col, { seg: 5 }); h.sph(0.15, 0.14, 0.26, 0, 0.64, 0.7, col, { s: [7, 5] });
    h.limb(0, 0.0, -0.4, 0, -0.1, -0.95, 0.15, 0.04, col, { seg: 5 });
    h.sph(0.04, 0.04, 0.04, 0.1, 0.7, 0.8, 0x222222, { s: [4, 3] }); h.sph(0.04, 0.04, 0.04, -0.1, 0.7, 0.8, 0x222222, { s: [4, 3] });
    if (tri === 0) for (var p = 0; p < 5; p++) h.cone(0.07, 0.2, 0, 0.26, -0.3 + p * 0.18, 0xf6d030, { seg: 4 });
    else if (tri === 1) { h.cone(0.04, 0.3, 0.07, 0.78, 0.9, 0xf6f0d8, { seg: 4, rot: [1.3, 0, 0] }); h.cone(0.04, 0.3, -0.07, 0.78, 0.9, 0xf6f0d8, { seg: 4, rot: [1.3, 0, 0] }); h.box(0.5, 0.35, 0.05, 0, 0.78, 0.56, shade(col, 0.85), { rot: [0.5, 0, 0] }); }
    else h.box(0.04, 0.3, 0.5, 0, 0.58, 0.75, 0xf06a4a, { rot: [0.4, 0, 0] });
    h.box(0.4, 0.06, 0.34, 0, 0.26, -0.05, 0xe84a4a);
    for (var l = 0; l < 4; l++) h.limb((l % 2 ? 1 : -1) * 0.18, -0.12, l < 2 ? 0.25 : -0.25, (l % 2 ? 1 : -1) * 0.18, -0.55, l < 2 ? 0.3 : -0.3, 0.07, 0.05, col, { seg: 4 });
    var hm = grp(), rad = 2.2 + (i % 2) * 0.25; hm.position.set(Math.sin(ang) * rad, 1.35, Math.cos(ang) * rad); hm.rotation.y = ang + PI / 2; hm.userData.r = rad; hm.add(mesh(h.build())); sp.add(hm); mounts.push(hm);
  }
  var pg = B(); for (i = 0; i < 8; i++) { var ang2 = i / 8 * TAU, rr = 2.2 + (i % 2) * 0.25; pg.limb(Math.sin(ang2) * rr, 0.45, Math.cos(ang2) * rr, Math.sin(ang2) * rr, 4.0, Math.cos(ang2) * rr, 0.035, 0.035, 0xe0b040, { seg: 5 }); }
  sp.add(mesh(pg.build()));
  chainUpd(grp0, function (dt, tm) { sp.rotation.y += dt * 0.6; for (var j = 0; j < mounts.length; j++) mounts[j].position.y = 1.35 + 0.22 * Math.sin(tm * 2.4 + j * PI); });
  grp0.userData.update(0, 0);
};
BLD.restaurant = function (grp0) { // 8x6 m with terrace
  var g = B();
  g.box(7.9, 0.1, 5.9, 0, 0.05, 0, 0x8d8a84);
  g.box(7.2, 2.6, 3.0, 0, 1.4, -1.8, 0xf6e6c4, { s: [1, 3, 1] }); gable(g, 7.2, 3.0, 2.7, 1.1, 0xb04a30, 0.3);
  g.box(0.5, 1.2, 0.5, -2.5, 3.5, -2.2, 0xa87a58); g.box(0.6, 0.08, 0.6, -2.5, 4.14, -2.2, 0x886040);
  for (var w = -1; w <= 1; w += 2) windowAt(g, w * 2.3, 1.55, -0.28, 1.5, 1.2, 0x7a4a2a, 0xaedcf0);
  g.box(1.3, 2.0, 0.06, 0, 1.1, -0.28, 0x7a4a2a); g.box(0.56, 1.6, 0.07, -0.3, 1.05, -0.25, 0xaedcf0); g.box(0.56, 1.6, 0.07, 0.3, 1.05, -0.25, 0xaedcf0);
  awning(g, 0, 2.4, -0.28, 6.4, 0.9, 0xc83a2a, 0xfaf0d8, 16, 0.35);
  // terrace
  g.box(7.4, 0.14, 2.6, 0, 0.1, 1.55, 0xb89870);
  for (var s = -1; s <= 1; s += 2) { post(g, s * 3.6, 2.8, 0.15, 2.4, 0x6a4a2a, 0.05); post(g, s * 3.6, 0.5, 0.15, 2.4, 0x6a4a2a, 0.05); g.limb(s * 3.6, 2.4, 0.5, s * 3.6, 2.4, 2.8, 0.04, 0.04, 0x6a4a2a, { seg: 4 }); }
  g.limb(-3.6, 2.4, 2.8, 3.6, 2.4, 2.8, 0.04, 0.04, 0x6a4a2a, { seg: 4 });
  for (var i = 0; i < 6; i++) g.limb(-3.3 + i * 1.32, 2.4, 0.5, -3.3 + i * 1.32, 2.4, 2.8, 0.02, 0.02, 0x7a5a38, { seg: 3 });
  for (i = 0; i < 3; i++) { var x = -2.3 + i * 2.3; g.cyl(0.5, 0.5, 0.05, x, 0.8, 1.6, 0xf4ead0, { seg: 10 }); post(g, x, 1.6, 0.17, 0.8, 0x4a3a2a, 0.04);
    for (var c = -1; c <= 1; c += 2) { g.box(0.34, 0.05, 0.34, x + c * 0.75, 0.48, 1.6, 0x8a5a3a); g.box(0.34, 0.34, 0.04, x + c * 0.88, 0.68, 1.6, 0x8a5a3a); post(g, x + c * 0.75, 1.6, 0.17, 0.48, 0x4a3a2a, 0.025); }
    g.sph(0.07, 0.07, 0.07, x, 0.9, 1.6, 0xe84a4a, { s: [4, 3] }); }
  for (var f = -1; f <= 1; f += 2) { g.cyl(0.25, 0.22, 0.4, f * 3.2, 0.37, 2.6, 0x8a6a4a, { seg: 8 }); g.sph(0.3, 0.28, 0.3, f * 3.2, 0.7, 2.6, 0x3f8a4a, { s: [6, 4] }); }
  g.box(0.5, 0.25, 0.1, 3.3, 0.9, 0.4, 0xf4ead0);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('RESTAURANT', 0x7a2a1a, 0xfff4d0, 2.4, 0.4, 0, 2.95, -0.18, 0, -0.3));
};
BLD.education_centre = function (grp0) { // 8x6 m Discovery museum
  var g = B(), st = 0xece2c8, st2 = 0xd8ccae;
  g.box(7.9, 0.12, 5.9, 0, 0.06, 0, 0x8d8a84);
  g.box(6.6, 3.0, 3.6, 0, 1.7, -1.1, st, { s: [1, 3, 1] }); g.box(6.9, 0.2, 3.9, 0, 3.3, -1.1, st2); g.box(6.5, 0.2, 3.7, 0, 3.5, -1.1, 0x4f8a5a);
  g.box(2.6, 1.0, 2.6, 0, 4.1, -1.8, 0xaed8ea, { s: [1, 1, 1] }); g.cone(2.0, 0.9, 0, 5.1, -1.8, 0x4f8a5a, { seg: 4, rot: [0, PI / 4, 0] });
  // steps and portico
  g.box(5.4, 0.15, 1.6, 0, 0.2, 1.45, 0xcec4a8); g.box(5.0, 0.15, 1.2, 0, 0.35, 1.2, 0xd6ccb0); g.box(4.6, 0.15, 0.9, 0, 0.5, 1.05, 0xded4b8);
  g.box(5.0, 0.2, 1.1, 0, 3.1, 1.1, st2); g.box(5.2, 0.15, 1.2, 0, 3.28, 1.1, st);
  g.tri([-2.7, 3.35, 1.7], [2.7, 3.35, 1.7], [0, 4.25, 1.7], st2, 0, 0, 1); g.tri([-2.7, 3.35, 0.5], [2.7, 3.35, 0.5], [0, 4.25, 0.5], st2, 0, 0, -1);
  g.box(5.4, 0.15, 1.2, 0, 3.3, 1.1, st); g.tri([-2.3, 3.4, 1.72], [2.3, 3.4, 1.72], [0, 4.1, 1.72], 0xd0c4a4, 0, 0, 1);
  for (var c = 0; c < 6; c++) { var x = -2.2 + c * 0.88; g.cyl(0.2, 0.22, 2.6, x, 1.75, 1.6, st, { seg: 8 }); g.box(0.55, 0.13, 0.55, x, 0.62, 1.6, st2); g.box(0.55, 0.13, 0.55, x, 3.0, 1.6, st2); }
  skullShape(g, 0, 3.75, 1.78, 0.62, 0xe8dcb8);
  g.box(1.4, 2.1, 0.07, 0, 1.15, 0.72, 0x4a3a2a); g.box(0.6, 1.8, 0.08, -0.34, 1.1, 0.74, 0xaedcf0); g.box(0.6, 1.8, 0.08, 0.34, 1.1, 0.74, 0xaedcf0);
  for (var s = -1; s <= 1; s += 2) { windowAt(g, s * 2.4, 1.9, 0.72, 0.9, 1.2, 0x6a4a2a, 0xaedcf0); g.box(0.07, 1.8, 0.07, s * 3.0, 4.3, 0.2, 0x555555); }
  g.limb(-3.3, 0.5, 2.4, -3.3, 3.2, 2.4, 0.03, 0.03, 0x666666, { seg: 4 }); g.box(0.05, 1.0, 0.5, -3.3, 2.6, 2.65, 0xe0a030); g.limb(3.3, 0.5, 2.4, 3.3, 3.2, 2.4, 0.03, 0.03, 0x666666, { seg: 4 }); g.box(0.05, 1.0, 0.5, 3.3, 2.6, 2.65, 0x3b82f6);
  g.cyl(0.25, 0.3, 0.5, -3.0, 0.25, 2.5, 0x8a7a68, { seg: 8 }); g.sph(0.4, 0.4, 0.4, -3.0, 0.9, 2.5, function (x, y, z) { return hash3(Math.floor(x * 5), Math.floor(y * 5), Math.floor(z * 5)) > 0.55 ? 0x58b040 : 0x3b82f6; }, { s: [10, 8] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('DISCOVERY', 0x4f8a5a, 0xfff4d0, 2.2, 0.38, 0, 2.95, 1.72, 0));
};
BLD.research_lab = function (grp0) { // 8x6 m
  var g = B(), wall = 0xe4e8ee, dk = 0x4a5868;
  g.box(7.9, 0.1, 5.9, 0, 0.05, 0, 0x8d8a84);
  g.box(7.0, 3.0, 3.6, -0.2, 1.6, -1.3, wall, { s: [1, 3, 1] }); g.box(7.2, 0.22, 3.8, -0.2, 3.2, -1.3, dk);
  g.box(7.0, 0.3, 0.08, -0.2, 2.9, 0.52, 0x3b82c4); g.box(7.0, 0.1, 0.12, -0.2, 0.2, 0.55, dk);
  for (var i = 0; i < 5; i++) { g.box(0.07, 2.3, 0.14, -3.0 + i * 1.5, 1.55, 0.54, dk); }
  g.box(1.2, 2.0, 0.08, 1.2, 1.1, 0.56, 0x7a8a98);
  // roof vents
  for (i = 0; i < 3; i++) { var vx = -2.4 + i * 1.5; g.box(0.7, 0.4, 0.7, vx, 3.5, -2.0, 0xc8ccd2); for (var k = 0; k < 4; k++) g.box(0.7, 0.04, 0.72, vx, 3.4 + k * 0.1, -2.0, 0x6a7480); g.box(0.74, 0.05, 0.74, vx, 3.73, -2.0, dk); }
  g.cyl(0.14, 0.18, 0.7, 2.6, 3.6, -2.1, 0xa8aeb6, { seg: 8 }); g.cyl(0.26, 0.2, 0.08, 2.6, 3.99, -2.1, 0x7a8590, { seg: 8 });
  // satellite dish on mast
  g.cyl(0.1, 0.14, 0.9, 3.0, 3.65, -0.3, 0x8a929c, { seg: 6 }); g.sph(0.7, 0.28, 0.7, 3.0, 4.3, -0.3, 0xf2f4f6, { s: [10, 4], rot: [-0.9, 0.0, 0.3] }); g.limb(3.0, 4.2, -0.3, 3.35, 4.75, 0.05, 0.025, 0.025, 0x555555, { seg: 4 });
  // side annexe and tanks outside
  g.cyl(0.55, 0.55, 1.8, 3.4, 0.9, 1.4, 0xc8ccd2, { seg: 10 }); g.sph(0.55, 0.3, 0.55, 3.4, 1.8, 1.4, 0xb0b6be, { s: [10, 4] }); g.box(0.4, 0.3, 0.05, 3.4, 1.0, 1.96, 0x4aa0d8);
  g.box(1.0, 0.7, 0.9, -3.0, 0.45, 1.8, 0x8a929c); g.box(1.0, 0.06, 0.9, -3.0, 0.82, 1.8, 0xd0d4da); g.box(0.12, 0.2, 0.12, -3.0, 0.94, 1.8, 0xe84a4a);
  g.cyl(0.9, 0.9, 0.12, -0.2, 0.16, 1.7, 0xb8bcc2, { seg: 12 });
  grp0.add(mesh(g.build()));
  grp0.add(glassMesh(B().box(6.9, 2.35, 0.07, -0.2, 1.55, 0.54, 0xffffff).build(), 0x8ed0ee, 0.4));
  grp0.add(labelMesh('RESEARCH', 0x3b82c4, 0xffffff, 1.9, 0.36, -0.2, 2.98, 0.6, 0));
  // rotating amber tank (visible through glass)
  var tank = B(); tank.cyl(0.55, 0.55, 1.7, 0, 0.95, 0, 0xffffff, { seg: 12 });
  var tg = new T.Mesh(unit('amberTank', function () { return new T.CylinderGeometry(0.62, 0.62, 1.9, 14); }), pulseMat(0xf2a830, 0xc06a10)); tg.position.set(-1.8, 1.25, -0.5); grp0.add(tg);
  var bs = B(); bs.cyl(0.72, 0.8, 0.2, -1.8, 0.2, -0.5, 0x4a5868, { seg: 12 }); bs.cyl(0.7, 0.7, 0.14, -1.8, 2.28, -0.5, 0x4a5868, { seg: 12 });
  var spin = grp(); spin.position.set(-1.8, 1.25, -0.5);
  var hx = B(); for (i = 0; i < 18; i++) { var ha = i * 0.55, hy = -0.8 + i * 0.09; hx.sph(0.07, 0.07, 0.07, Math.sin(ha) * 0.34, hy, Math.cos(ha) * 0.34, 0x6a3a10, { s: [5, 4] }); hx.sph(0.07, 0.07, 0.07, -Math.sin(ha) * 0.34, hy, -Math.cos(ha) * 0.34, 0x3a1a05, { s: [5, 4] }); }
  spin.add(mesh(hx.build())); grp0.add(mesh(bs.build())); grp0.add(spin);
  var cons = B(); cons.box(0.9, 0.9, 0.5, 1.3, 0.5, -0.9, 0x5a6878); cons.box(0.8, 0.4, 0.04, 1.3, 0.95, -0.62, 0x58d8e8); cons.box(0.5, 0.3, 0.04, 1.3, 0.55, -0.64, 0x88e868); grp0.add(mesh(cons.build()));
  var dish = new T.Mesh(unit('dotg', function () { return new T.SphereGeometry(0.06, 5, 4); }), mat(0x70f0a0, { emissive: 0x30c060 })); dish.position.set(3.35, 4.75, 0.05); grp0.add(dish);
  chainUpd(grp0, function (dt, tm) { spin.rotation.y = tm * 0.8; tg.material.opacity = 0.65 + 0.15 * Math.sin(tm * 1.7); dish.visible = Math.sin(tm * 3) > -0.3; });
  grp0.userData.update(0, 0);
};
BLD.hatchery = function (grp0) { // 6x4 m: domed glasshouse
  var g = B(), fr = 0xe8eef0;
  g.box(5.9, 0.1, 3.9, 0, 0.05, 0, 0x8d8a84); g.cyl(2.5, 2.6, 0.6, 0, 0.4, -0.1, 0xb8b2a4, { seg: 18, sx: 1.0, sz: 0.72 });
  // straw bed and eggs
  g.cyl(2.1, 2.2, 0.12, 0, 0.74, -0.1, 0xe0c060, { seg: 16, sx: 1, sz: 0.7 });
  var eggs = [[-1.3, -0.2, 0.34, 0xf4e8d0], [-0.5, 0.3, 0.3, 0xd8e8d0], [0.4, -0.3, 0.4, 0xf0d8c0], [1.2, 0.2, 0.32, 0xe0e8f0], [0.0, -0.9, 0.3, 0xf4e8d0], [-1.0, -0.9, 0.26, 0xe8d8b8]];
  eggs.forEach(function (e, k) { g.sph(e[2] * 0.78, e[2], e[2] * 0.78, e[0], 0.8 + e[2], e[1], function (x, y, z) { return hash3(Math.floor(x * 12 + k), Math.floor(y * 12), Math.floor(z * 12)) > 0.84 ? 0x8a7a58 : e[3]; }, { s: [8, 6] }); g.sph(e[2] * 1.15, 0.07, e[2] * 1.15, e[0], 0.8, e[1], 0xcaa84a, { s: [8, 3] }); });
  // door arch and sign frame
  g.box(1.0, 1.6, 0.06, 0, 0.9, 1.45, 0x8a6a3a); g.box(1.3, 0.1, 0.1, 0, 1.8, 1.46, fr);
  for (var i = 0; i < 4; i++) g.cyl(0.22, 0.25, 0.4, -2.6 + i * 1.7 + (i > 1 ? 0.3 : 0), 0.3, 1.75, 0x8a6a4a, { seg: 8 });
  for (i = 0; i < 4; i++) g.sph(0.26, 0.24, 0.26, -2.6 + i * 1.7 + (i > 1 ? 0.3 : 0), 0.62, 1.75, 0x3f8a4a, { s: [6, 4] });
  // glass ribs of the dome
  for (var r = 0; r < 7; r++) { var a = r / 7 * PI; for (var s2 = 0; s2 < 14; s2++) { var t0 = s2 / 14 * PI / 2, t1 = (s2 + 1) / 14 * PI / 2; g.limb(Math.cos(a) * Math.cos(t0) * 2.45, 0.7 + Math.sin(t0) * 2.3, -0.1 + Math.sin(a) * Math.cos(t0) * 1.75 * 0 + 0, Math.cos(a) * Math.cos(t1) * 2.45, 0.7 + Math.sin(t1) * 2.3, -0.1, 0.0, 0.0, fr, { seg: 3 }); } }
  grp0.add(mesh(g.build()));
  // glass dome: front-facing half ellipsoid
  var dome = new T.Mesh(new T.SphereGeometry(1, 20, 12, 0, TAU, 0, PI / 2), mat(0xa8e0f0, { opacity: 0.32 })); dome.scale.set(2.45, 2.4, 1.75); dome.position.set(0, 0.7, -0.1); dome.renderOrder = 2; grp0.add(dome);
  var rib = B(); for (r = 0; r < 8; r++) { var ra = r / 8 * TAU; for (var q = 0; q < 8; q++) { var u0 = q / 8 * PI / 2, u1 = (q + 1) / 8 * PI / 2; rib.limb(Math.sin(ra) * Math.cos(u0) * 2.47, 0.7 + Math.sin(u0) * 2.42, -0.1 + Math.cos(ra) * Math.cos(u0) * 1.77, Math.sin(ra) * Math.cos(u1) * 2.47, 0.7 + Math.sin(u1) * 2.42, -0.1 + Math.cos(ra) * Math.cos(u1) * 1.77, 0.035, 0.035, fr, { seg: 3 }); } }
  for (var h = 1; h <= 3; h++) { var uu = h / 4 * PI / 2, rr = Math.cos(uu); for (q = 0; q < 24; q++) { var q0 = q / 24 * TAU, q1 = (q + 1) / 24 * TAU; rib.limb(Math.sin(q0) * rr * 2.47, 0.7 + Math.sin(uu) * 2.42, -0.1 + Math.cos(q0) * rr * 1.77, Math.sin(q1) * rr * 2.47, 0.7 + Math.sin(uu) * 2.42, -0.1 + Math.cos(q1) * rr * 1.77, 0.03, 0.03, fr, { seg: 3 }); } }
  grp0.add(mesh(rib.build()));
  grp0.add(labelMesh('HATCHERY', 0x3b9a8a, 0xffffff, 1.5, 0.32, 0, 2.15, 1.76, 0, 0));
  var glow = new T.Mesh(unit('hglow', function () { return new T.SphereGeometry(0.5, 10, 8); }), pulseMat(0xffd070, 0xffa030)); glow.position.set(0, 1.3, -0.1); glow.scale.set(1.2, 0.9, 1.0); grp0.add(glow);
  var lamp = grp(); lamp.position.set(0, 2.5, -0.1); grp0.add(lamp);
  chainUpd(grp0, function (dt, tm) { var s = 0.5 + 0.5 * Math.sin(tm * 1.8); glow.material.opacity = 0.12 + 0.3 * s; glow.scale.setScalar(1.0 + 0.2 * s); glow.scale.y *= 0.8; });
  grp0.userData.update(0, 0);
};
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
  g.bevelBox(3.92, 0.14, 3.92, 0.05, 0, 0.07, 0, 0x7a7c7a);
  // sloped/chamfered reinforced concrete bunker hull + buttresses
  g.bevelBox(3.35, 1.85, 2.7, 0.28, 0, 1.05, -0.4, cn);
  g.bevelBox(3.45, 0.26, 2.8, 0.1, 0, 2.02, -0.4, 0x767a78);
  g.bevelBox(2.95, 0.24, 2.35, 0.1, 0, 2.26, -0.4, 0x5c605e);
  for (var sb = -1; sb <= 1; sb += 2) {
    g.extrude([[-0.18, 0], [0.22, 0], [0.06, 1.6], [-0.18, 1.6]], 0.22, sb * 1.68, 0.12, -0.4, [0, sb > 0 ? 0 : PI, 0], 0x7e8280, { axis: 'z', bev: 0.03 });
  }
  g.box(3.15, 0.26, 0.06, 0, 0.35, 0.96, hz, { s: [24, 1, 1] }); g.box(3.15, 0.26, 0.06, 0, 1.74, 0.96, hz, { s: [24, 1, 1] });
  // recessed armored blast door & locking wheel
  g.bevelBox(1.56, 1.46, 0.26, 0.08, 0, 0.84, 0.98, 0x454c54);
  g.bevelBox(1.3, 1.22, 0.12, 0.04, 0, 0.84, 1.09, 0x6a727c);
  g.box(1.32, 0.06, 0.12, 0, 0.84, 1.14, 0x2a2e34);
  g.lathe([[0.06, 0], [0.18, 0.02], [0.18, 0.06], [0.11, 0.07], [0.05, 0.04]], 0xc83a2a, { seg: 10, x: 0, y: 1.08, z: 1.14, rot: [PI / 2, 0, 0] });
  g.bevelBox(0.8, 0.3, 0.06, 0.02, -1.1, 1.3, 0.96, 0xf4ead0); g.bevelBox(0.32, 0.32, 0.06, 0.02, 1.2, 1.1, 0.96, 0xd8322e); g.box(0.08, 0.2, 0.07, 1.2, 1.1, 0.97, 0xffffff); g.box(0.2, 0.08, 0.07, 1.2, 1.1, 0.97, 0xffffff);
  g.bevelBox(0.7, 0.45, 0.05, 0.02, 1.0, 1.42, 0.96, 0x2a3038);
  g.bevelBox(1.5, 0.1, 0.52, 0.03, 0, 0.12, 1.24, 0x8a8c8a);
  // curved ventilator cupola + comms mast
  g.lathe([[0.38, 0], [0.36, 0.42], [0.46, 0.48], [0.3, 0.64], [0.02, 0.7]], 0x6a6e6c, { seg: 10, x: 0.9, y: 2.35, z: -1.0, cap0: true });
  post(g, -1.2, -1.2, 2.35, 3.65, 0x555a60, 0.045); g.limb(-1.2, 3.4, -1.2, -0.7, 3.7, -1.2, 0.02, 0.02, 0x555a60, { seg: 4 });
  g.lathe([[0.04, 0], [0.22, 0.08], [0.26, 0.14]], 0xdce0e4, { seg: 10, x: -1.18, y: 3.35, z: -1.12, rot: [0.9, 0.4, 0] }); // satellite dish
  g.bevelBox(0.55, 0.36, 0.42, 0.04, -1.5, 0.3, 1.55, 0x4a6a3a); // supply crate
  g.cyl(0.11, 0.11, 0.9, 1.7, 0.45, 1.5, 0xd8322e, { seg: 8 }); g.sph(0.11, 0.07, 0.11, 1.7, 0.9, 1.5, 0xf2c030, { s: [6, 4] });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('EMERGENCY', 0xc83a2a, 0xffffff, 1.4, 0.26, -0.5, 1.9, 1.0, 0));
  var bk = new T.Mesh(unit('ebeacon', function () { return new T.SphereGeometry(0.22, 8, 6); }), pulseMat(0xff3a2a, 0xff1a0a)); bk.position.set(0, 3.45, -0.4);
  var rot = grp(); rot.position.set(0, 2.45, -0.4); var bb = B(); bb.cyl(0.3, 0.3, 0.2, 0, 0.1, 0, 0x4a4c4a, { seg: 8 }); bb.sph(0.3, 0.3, 0.3, 0, 0.45, 0, 0xff3a2a, { s: [8, 5] }); grp0.add(mesh(bb.build()));
  var rb = B(); rb.box(1.1, 0.05, 0.12, 0, 0.45, 0, 0xffe0c0); rot.add(mesh(rb.build())); grp0.add(rot);
  var lg = new T.Mesh(unit('ebeaconl', function () { return new T.SphereGeometry(0.42, 8, 6); }), pulseMat(0xff3a2a, 0xff1a0a)); lg.position.set(0, 2.95, -0.4); grp0.add(lg);
  chainUpd(grp0, function (dt, tm) { rot.rotation.y = tm * 4; var s = Math.max(0, Math.sin(tm * 4.5)); lg.material.opacity = 0.1 + 0.5 * s; });
  grp0.userData.update(0, 0);
};

// ================================================================ THEME PARK BUILDINGS
function pitchedRoof(g, x, y, z, w, d, h, col, over) {
  over = over || 0.15;
  var half = d / 2, ang = Math.atan2(h, half), s = Math.sqrt(half * half + h * h) + over;
  g.box(w + over * 2, 0.1, s, x, y + h / 2, z + half / 2, col, { rot: [ang, 0, 0] });
  g.box(w + over * 2, 0.1, s, x, y + h / 2, z - half / 2, shade(col, 0.88), { rot: [-ang, 0, 0] });
  g.box(w + over * 2 + 0.04, 0.09, 0.14, x, y + h + 0.03, z, shade(col, 0.78));
  g.tri([x + w / 2, y, z - half], [x + w / 2, y, z + half], [x + w / 2, y + h, z], shade(col, 0.8), 1, 0, 0);
  g.tri([x - w / 2, y, z - half], [x - w / 2, y, z + half], [x - w / 2, y + h, z], shade(col, 0.8), -1, 0, 0);
}

function wideStall(g, o) {
  var W = o.w || 3.3, D = o.d || 1.0, H = o.h || 1.38, y0 = 0.14, bz = -0.24;
  g.bevelBox(3.84, 0.08, 1.84, 0.025, 0, 0.04, 0, 0x7c7972);
  g.bevelBox(3.74, 0.08, 1.74, 0.02, 0, 0.11, 0, 0x949088);
  g.bevelBox(W, H, D, 0.04, 0, y0 + H / 2, bz, o.wall);
  for (var cx = -1; cx <= 1; cx += 2) for (var cz = -1; cz <= 1; cz += 2) {
    g.cyl(0.052, 0.058, H, cx * (W / 2 - 0.01), y0 + H / 2, bz + cz * (D / 2 - 0.01), shade(o.trim, 0.9), { seg: 6 });
  }
  g.bevelBox(W + 0.05, 0.08, D + 0.05, 0.02, 0, y0 + H * 0.12, bz, o.trim);
  g.bevelBox(W + 0.06, 0.09, D + 0.06, 0.025, 0, y0 + H, bz, o.trim);
  g.box(W * 0.82, H * 0.4, 0.05, 0, y0 + H * 0.64, bz + D / 2 + 0.005, 0x2a221e);
  g.bevelBox(W * 0.82 + 0.14, 0.06, 0.08, 0.015, 0, y0 + H * 0.84 + 0.05, bz + D / 2 + 0.01, o.trim);
  if (o.divider) g.cyl(0.045, 0.05, H * 0.46, 0, y0 + H * 0.64, bz + D / 2 + 0.015, o.trim, { seg: 6 });
  g.bevelBox(W * 0.9, 0.08, 0.44, 0.02, 0, y0 + H * 0.44, 0.48, o.counter || 0xe8e0d0);
  g.bevelBox(W * 0.86, 0.56, 0.4, 0.02, 0, y0 + 0.28, 0.46, shade(o.wall, 0.9));
  awning(g, 0, y0 + H + 0.18, 0.24, W + 0.12, 0.56, o.awn1, o.awn2, 12, 0.42);
  g.bevelBox(W + 0.28, 0.07, D + 0.26, 0.025, 0, y0 + H + 0.04, bz, shade(o.roof, 0.88));
  g.bevelBox(W + 0.2, 0.1, D + 0.18, 0.035, 0, y0 + H + 0.11, bz, o.roof);
  for (var s = -1; s <= 1; s += 2) {
    g.cyl(0.028, 0.028, H * 0.54, s * (W / 2 + 0.02), y0 + H * 0.72, 0.76, 0xe8e0d0, { seg: 6 });
  }
}

function buildCoasterTrack(g, fn, steps, halfW, railCol, tieCol, supCol, opts) {
  opts = opts || {};
  var pts = [], i;
  for (i = 0; i < steps; i++) pts.push(fn(i / steps));
  var vF = new T.Vector3(), vU = new T.Vector3(), vR = new T.Vector3();
  var supEvery = opts.supEvery || 3;
  for (i = 0; i < steps; i++) {
    var p0 = pts[i], p1 = pts[(i + 1) % steps];
    vF.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    if (vF.lengthSq() < 1e-8) continue;
    vF.normalize();
    if (p0.up) { vU.set(p0.up[0], p0.up[1], p0.up[2]); if (vU.lengthSq() < 1e-8) vU.set(0, 1, 0); else vU.normalize(); } else vU.set(0, 1, 0);
    vR.crossVectors(vU, vF);
    if (vR.lengthSq() < 1e-6) vR.set(1, 0, 0); else vR.normalize();
    var p2 = pts[(i + 2) % steps];
    var vF2 = new T.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    if (vF2.lengthSq() > 1e-8) vF2.normalize(); else vF2.copy(vF);
    var vU2 = p1.up ? new T.Vector3(p1.up[0], p1.up[1], p1.up[2]) : new T.Vector3(0, 1, 0);
    if (vU2.lengthSq() < 1e-8) vU2.set(0, 1, 0); else vU2.normalize();
    var vR2 = new T.Vector3().crossVectors(vU2, vF2);
    if (vR2.lengthSq() < 1e-6) vR2.copy(vR); else vR2.normalize();
    for (var s = -1; s <= 1; s += 2) {
      g.limb(p0.x + vR.x * halfW * s, p0.y + vR.y * halfW * s, p0.z + vR.z * halfW * s,
        p1.x + vR2.x * halfW * s, p1.y + vR2.y * halfW * s, p1.z + vR2.z * halfW * s,
        opts.railR || 0.036, opts.railR || 0.036, railCol, { seg: 5 });
    }
    if (i % (opts.tieEvery || 1) === 0) {
      g.limb(p0.x - vR.x * (halfW + 0.06), p0.y - vR.y * (halfW + 0.06), p0.z - vR.z * (halfW + 0.06),
        p0.x + vR.x * (halfW + 0.06), p0.y + vR.y * (halfW + 0.06), p0.z + vR.z * (halfW + 0.06),
        0.03, 0.03, tieCol, { seg: 4 });
    }
    if (opts.spine) {
      g.limb(p0.x - vU.x * 0.11, p0.y - vU.y * 0.11, p0.z - vU.z * 0.11,
        p1.x - vU2.x * 0.11, p1.y - vU2.y * 0.11, p1.z - vU2.z * 0.11,
        0.055, 0.055, opts.spine, { seg: 5 });
    }
    if (supCol && (i % supEvery === 0) && p0.y > 0.45 && (!p0.noSup)) {
      if (opts.trestle) {
        for (var s2 = -1; s2 <= 1; s2 += 2) {
          var bx = p0.x + vR.x * (halfW + 0.08) * s2, bz = p0.z + vR.z * (halfW + 0.08) * s2;
          g.limb(bx, 0.06, bz, bx, p0.y - 0.04, bz, 0.048, 0.042, supCol, { seg: 4 });
        }
        g.limb(p0.x - vR.x * (halfW + 0.08), p0.y * 0.52, p0.z - vR.z * (halfW + 0.08),
          p0.x + vR.x * (halfW + 0.08), p0.y * 0.52, p0.z + vR.z * (halfW + 0.08), 0.032, 0.032, shade(supCol, 0.88), { seg: 4 });
      } else {
        g.limb(p0.x, 0.06, p0.z, p0.x, p0.y - 0.06, p0.z, 0.068, 0.055, supCol, { seg: 6 });
      }
    }
  }
}

function makeCoasterCar(col, accent, guestHead) {
  var cg = B();
  cg.box(0.4, 0.18, 0.52, 0, 0.11, 0, col);
  cg.box(0.42, 0.06, 0.54, 0, 0.2, 0, accent || 0xfaf0d8);
  if (guestHead !== false) {
    cg.sph(0.085, 0.085, 0.085, -0.09, 0.29, 0.04, 0xf2c8a0, { s: [5, 4] });
    cg.sph(0.085, 0.085, 0.085, 0.09, 0.29, 0.04, 0xe8b890, { s: [5, 4] });
    cg.sph(0.08, 0.05, 0.08, -0.09, 0.36, 0.04, 0x4a3220, { s: [5, 3] });
    cg.sph(0.08, 0.05, 0.08, 0.09, 0.36, 0.04, 0xd8a030, { s: [5, 3] });
  }
  var m = grp('car'); m.add(mesh(cg.build())); return m;
}

function orientOnTrack(obj, fn, u) {
  var p0 = fn(fract(u)), p1 = fn(fract(u + 0.008));
  var fwd = _a.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1); else fwd.normalize();
  var upHint = p0.up ? _b.set(p0.up[0], p0.up[1], p0.up[2]) : _b.set(0, 1, 0);
  if (upHint.lengthSq() < 1e-8) upHint.set(0, 1, 0); else upHint.normalize();
  var right = _c.crossVectors(upHint, fwd);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
  var up = _e1.crossVectors(fwd, right).normalize();
  _ma.makeBasis(right, up, fwd);
  obj.quaternion.setFromRotationMatrix(_ma);
  obj.position.set(p0.x, p0.y, p0.z);
}

BLD.wooden_coaster = function (grp0) { // 5x4 = 10x8m
  var g = B(), WD = 0xa06a38, WD2 = 0x7c4f28, RAIL = 0xc8ccd0;
  g.box(9.8, 0.12, 7.8, 0, 0.06, 0, 0x8d8a84);
  // boarding station at front +Z
  g.box(3.8, 0.24, 1.25, 0, 0.24, 2.78, WD2);
  for (var sx = -1; sx <= 1; sx += 2) {
    post(g, sx * 1.7, 2.25, 0.2, 1.92, WD, 0.06);
    post(g, sx * 1.7, 3.3, 0.2, 1.92, WD, 0.06);
  }
  awning(g, 0, 2.04, 2.78, 3.9, 1.0, 0xd83a2a, 0xfaf0d8, 12, 0.22);
  g.box(3.9, 0.1, 1.25, 0, 1.98, 2.75, 0xb83020);
  var trackFn = function (u) {
    var a = u * TAU;
    var x = 3.85 * Math.sin(a) + 0.45 * Math.sin(2 * a);
    var z = 2.85 * Math.cos(a) - 0.18 * Math.cos(3 * a);
    var lift = 2.4 * Math.pow(0.5 - 0.5 * Math.cos(a), 1.15);
    var camel1 = 1.75 * Math.exp(-Math.pow((a - 1.55) / 0.55, 2));
    var camel2 = 1.65 * Math.exp(-Math.pow((a - 4.7) / 0.55, 2));
    var backPeak = 1.35 * Math.exp(-Math.pow((a - PI) / 0.65, 2));
    var y = 0.58 + lift + camel1 + camel2 + backPeak;
    if (z > 1.7 && Math.abs(x) < 1.9) {
      var st = clamp((z - 1.7) / 0.8, 0, 1) * clamp(1 - Math.abs(x) / 1.9, 0, 1);
      y = lerp(y, 0.56, st * 0.9);
    }
    return { x: x, y: y, z: z };
  };
  buildCoasterTrack(g, trackFn, 80, 0.2, RAIL, WD2, WD, { trestle: true, supEvery: 2 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('COASTER', 0xc83a2a, 0xfff4d0, 2.1, 0.42, 0, 1.92, 3.42, 0));
  var cars = [makeCoasterCar(0xe84a4a, 0xf6d030), makeCoasterCar(0xf2c030, 0xe84a4a), makeCoasterCar(0x3b82f6, 0xfaf0d8), makeCoasterCar(0x58b040, 0xfaf0d8)];
  cars.forEach(function (c) { grp0.add(c); });
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < cars.length; i++) orientOnTrack(cars[i], trackFn, tm * 0.18 - i * 0.032);
  };
  grp0.userData.update(0, 0);
};

BLD.loop_coaster = function (grp0) { // 6x4 = 12x8m
  var g = B(), SUP = 0x2684a8, SPINE = 0xf05a28, RAIL = 0xf6d030;
  g.box(11.8, 0.12, 7.8, 0, 0.06, 0, 0x6a727a);
  // grand modern station at front +Z
  g.box(4.2, 0.26, 1.35, -0.3, 0.25, 2.95, 0x46525e);
  for (var sx = -1; sx <= 1; sx += 2) {
    post(g, -0.3 + sx * 1.9, 2.35, 0.2, 2.0, 0xd8e2ec, 0.06);
    post(g, -0.3 + sx * 1.9, 3.55, 0.2, 2.0, 0xd8e2ec, 0.06);
  }
  g.box(4.35, 0.14, 1.45, -0.3, 2.02, 2.95, 0x1e6496);
  g.box(4.45, 0.08, 1.5, -0.3, 2.11, 2.95, 0x42c8f5);
  var crPts = [
    [-1.4, 0.62, 0.05], // phantom before P0
    [0.0, 0.62, 0.15],  // P0: loop exit
    [2.6, 1.25, 0.35],  // P1: rising into right helix
    [4.85, 2.85, -1.35],// P2: wide right helix back
    [4.75, 2.25, 1.95], // P3: wide right helix front
    [2.1, 0.65, 2.95],  // P4: dive into station
    [-0.3, 0.62, 2.95], // P5: station platform
    [-3.0, 0.85, 2.65], // P6: leaving station
    [-5.0, 2.95, 0.4],  // P7: climbing lift hill
    [-4.6, 4.35, -2.75],// P8: tall lift crest
    [-2.2, 1.95, -2.2], // P9: steep drop toward loop
    [0.0, 0.62, -0.85], // P10: loop entry
    [1.4, 0.62, -0.75]  // phantom after P10
  ];
  var trackFn = function (u) {
    u = fract(u);
    if (u >= 0.42 && u <= 0.68) {
      var lu = (u - 0.42) / 0.26;
      var th = lu * TAU - PI / 2;
      var lr = 2.0;
      return {
        x: lr * Math.cos(th),
        y: 2.62 + lr * Math.sin(th),
        z: lerp(-0.85, 0.15, lu),
        up: [-Math.cos(th), -Math.sin(th), 0],
        noSup: lu > 0.16 && lu < 0.84
      };
    }
    var s = u > 0.68 ? (u - 0.68) / 0.74 : (u + 0.32) / 0.74;
    s = clamp(s, 0, 1);
    var seg = Math.min(9, Math.floor(s * 10)), t = s * 10 - seg, t2 = t * t, t3 = t2 * t;
    var p0 = crPts[seg], p1 = crPts[seg + 1], p2 = crPts[seg + 2], p3 = crPts[seg + 3];
    var x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
    var y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
    var z = 0.5 * ((2 * p1[2]) + (-p0[2] + p2[2]) * t + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3);
    var bank = s < 0.42 ? Math.sin(clamp((s - 0.04) / 0.36, 0, 1) * PI) * 0.34 : 0;
    return { x: x, y: Math.max(0.55, y), z: z, up: [-bank, 1, 0] };
  };
  buildCoasterTrack(g, trackFn, 96, 0.19, RAIL, 0x2a343e, SUP, { spine: SPINE, supEvery: 3 });
  // A-frame bracing supports for the tall vertical loop
  g.limb(-0.35, 0.08, -1.6, 0.0, 2.62, -0.35, 0.08, 0.06, SUP, { seg: 6 });
  g.limb(0.35, 0.08, 0.9, 0.0, 2.62, -0.35, 0.08, 0.06, SUP, { seg: 6 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('LOOP COASTER', 0x1e6496, 0xfff4d0, 2.6, 0.4, -0.3, 2.02, 3.72, 0));
  var cars = [makeCoasterCar(0x38bdf8, 0xf6d030), makeCoasterCar(0xf43f5e, 0xffffff), makeCoasterCar(0xa855f7, 0xf6d030), makeCoasterCar(0x22c55e, 0xffffff)];
  cars.forEach(function (c) { grp0.add(c); });
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < cars.length; i++) orientOnTrack(cars[i], trackFn, tm * 0.21 - i * 0.028);
  };
  grp0.userData.update(0, 0);
};

BLD.mine_coaster = function (grp0) { // 4x3 = 8x6m
  var g = B(), RK = 0xb8663a, WD = 0x7c4f28, IR = 0x525860;
  g.box(7.8, 0.12, 5.8, 0, 0.06, 0, 0x9c866a);
  // craggy canyon rock peak + boulders
  rock(g, 1.8, 2.2, 1.35, 0, 1.55, -0.45, RK, 31, 0.2);
  rock(g, 1.35, 1.45, 1.1, -1.45, 1.05, -0.35, shade(RK, 0.9), 32, 0.9);
  rock(g, 1.3, 1.35, 1.05, 1.5, 0.98, -0.4, shade(RK, 1.08), 33, 1.4);
  rock(g, 0.72, 0.62, 0.65, -2.95, 0.42, 1.55, shade(RK, 0.92), 34);
  rock(g, 0.68, 0.58, 0.6, 2.95, 0.38, -1.65, shade(RK, 1.05), 35);
  rock(g, 0.6, 0.52, 0.55, -2.8, 0.35, -1.8, shade(RK, 0.88), 36, 0.6);
  // mine tunnel portal frame at back
  post(g, -0.58, -1.95, 0.1, 1.65, WD, 0.07); post(g, 0.58, -1.95, 0.1, 1.65, WD, 0.07);
  g.box(1.36, 0.18, 0.22, 0, 1.68, -1.95, WD);
  g.box(0.16, 0.18, 0.16, 0, 1.85, -1.95, 0xf6d030);
  // boarding shack at front +Z
  g.box(2.7, 0.22, 1.15, 0, 0.22, 2.05, WD);
  pitchedRoof(g, 0, 1.62, 2.05, 2.6, 1.15, 0.58, 0x8a4a2a, 0.15);
  for (var sx = -1; sx <= 1; sx += 2) { post(g, sx * 1.15, 1.55, 0.2, 1.62, WD, 0.055); post(g, sx * 1.15, 2.55, 0.2, 1.62, WD, 0.055); }
  var trackFn = function (u) {
    var a = u * TAU;
    var x = 3.05 * Math.sin(a) + 0.25 * Math.sin(2 * a);
    var z = 1.95 * Math.cos(a) - 0.15 * Math.cos(3 * a);
    var y = 0.6 + 1.45 * (1 - Math.cos(a)) * 0.5 + 0.55 * Math.sin(2 * a - 0.4);
    if (z > 1.2 && Math.abs(x) < 1.35) {
      var st = clamp((z - 1.2) / 0.6, 0, 1) * clamp(1 - Math.abs(x) / 1.35, 0, 1);
      y = lerp(y, 0.56, st * 0.88);
    }
    return { x: x, y: y, z: z };
  };
  buildCoasterTrack(g, trackFn, 64, 0.17, IR, WD, WD, { trestle: true, supEvery: 3 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('MINE TRAIN', 0x7c4f28, 0xffe8a8, 1.95, 0.36, 0, 1.68, 2.66, 0));
  var loco = makeCoasterCar(0x3a3e44, 0xd88828, false);
  var cgL = B(); cgL.cyl(0.065, 0.055, 0.28, 0, 0.32, 0.15, 0x222226, { seg: 6 }); cgL.box(0.35, 0.22, 0.24, 0, 0.27, -0.1, 0x8a3a28);
  loco.add(mesh(cgL.build()));
  var cars = [loco, makeCoasterCar(0x9a6234, 0x555860), makeCoasterCar(0x8a542a, 0x555860)];
  cars.forEach(function (c) { grp0.add(c); });
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < cars.length; i++) orientOnTrack(cars[i], trackFn, tm * 0.18 - i * 0.038);
  };
  grp0.userData.update(0, 0);
};

BLD.log_flume = function (grp0) { // 4x4 = 8x8m
  var g = B(), WD = 0x8a5a32, WD2 = 0x6a4222, WT = 0x3b9ae0;
  g.box(7.8, 0.12, 7.8, 0, 0.06, 0, 0x8d8a84);
  // large stone-rimmed splashdown lagoon at front-right
  g.box(4.6, 0.36, 0.2, 1.1, 0.22, 3.4, 0x7e7a72); g.box(4.6, 0.36, 0.2, 1.1, 0.22, 0.9, 0x7e7a72);
  g.box(0.2, 0.36, 2.7, -1.1, 0.22, 2.15, 0x7e7a72); g.box(0.2, 0.36, 2.7, 3.3, 0.22, 2.15, 0x7e7a72);
  // boarding dock at front-left
  g.box(2.15, 0.28, 1.35, -2.25, 0.26, 2.65, WD);
  for (var sx = -1; sx <= 1; sx += 2) { post(g, -2.25 + sx * 0.9, 2.05, 0.3, 1.78, WD2, 0.055); post(g, -2.25 + sx * 0.9, 3.25, 0.3, 1.78, WD2, 0.055); }
  pitchedRoof(g, -2.25, 1.78, 2.65, 2.05, 1.25, 0.52, 0x2f8a5a, 0.14);
  var trackFn = function (u) {
    var a = u * TAU;
    var x = 2.75 * Math.sin(a);
    var z = 2.55 * Math.cos(a) - 0.35;
    var y = 0.44 + 3.45 * Math.pow(Math.max(0, -Math.cos(a + 0.35)), 1.35);
    return { x: x, y: y, z: z };
  };
  buildCoasterTrack(g, trackFn, 68, 0.22, WD, WD2, WD2, { spine: WT, trestle: true, supEvery: 3 });
  grp0.add(mesh(g.build()));
  var pool = new T.Mesh(unit('flumepool8', function () { return new T.BoxGeometry(4.25, 0.08, 2.32); }), WATER_MAT);
  pool.position.set(1.1, 0.26, 2.15); grp0.add(pool);
  grp0.add(labelMesh('LOG FLUME', 0x2f8a5a, 0xfff4d0, 1.85, 0.36, -2.25, 1.74, 3.36, 0));
  var boats = [];
  for (var b = 0; b < 2; b++) {
    var lb = B();
    lb.cyl(0.2, 0.2, 0.72, 0, 0.16, 0, 0x6a3e20, { seg: 8, rot: [PI / 2, 0, 0] });
    lb.box(0.26, 0.11, 0.48, 0, 0.22, 0, 0x3b82f6);
    lb.sph(0.085, 0.085, 0.085, 0, 0.35, 0.07, 0xf2c8a0, { s: [5, 4] });
    var bm = grp('logboat'); bm.add(mesh(lb.build())); grp0.add(bm); boats.push(bm);
  }
  var drops = [], dGeo = unit('fdrop', function () { return new T.SphereGeometry(0.06, 5, 4); }), dMat = mat(0xd8f4ff, { opacity: 0.85 });
  for (var d = 0; d < 12; d++) { var dm = new T.Mesh(dGeo, dMat); dm.userData = { a: d / 12 * TAU, ph: d * 0.21 }; grp0.add(dm); drops.push(dm); }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < boats.length; i++) orientOnTrack(boats[i], trackFn, tm * 0.15 + i * 0.5);
    for (var j = 0; j < drops.length; j++) {
      var dd = drops[j], u = fract(tm * 1.15 + dd.userData.ph);
      dd.position.set(1.65 + Math.sin(dd.userData.a) * 0.55 * u, 0.3 + Math.sin(u * PI) * 0.85, 1.75 + Math.cos(dd.userData.a) * 0.55 * u);
      dd.scale.setScalar(1.2 - u * 0.65);
    }
  };
  grp0.userData.update(0, 0);
};

BLD.ferris_wheel = function (grp0) { // 3x3 = 6x6m
  var g = B(), ST = 0xd8e0e8, ACC = 0xe84a6a;
  g.box(5.8, 0.14, 5.8, 0, 0.07, 0, 0x8d8a84);
  g.box(4.6, 0.18, 3.2, 0, 0.21, 0, 0xa8a49c);
  // taller A-frame support towers
  for (var s = -1; s <= 1; s += 2) {
    var z = s * 0.85;
    g.limb(-1.85, 0.22, z, 0, 4.35, z, 0.1, 0.08, ST, { seg: 6 });
    g.limb(1.85, 0.22, z, 0, 4.35, z, 0.1, 0.08, ST, { seg: 6 });
    g.limb(-0.98, 2.3, z, 0.98, 2.3, z, 0.055, 0.055, ACC, { seg: 5 });
  }
  g.cyl(0.14, 0.14, 2.0, 0, 4.35, 0, 0xf2c030, { seg: 10, rot: [PI / 2, 0, 0] });
  // front ticket booth
  g.box(1.5, 1.15, 0.82, 0, 0.72, 2.05, 0xf4e8c8);
  g.box(1.62, 0.16, 0.94, 0, 1.36, 2.05, ACC);
  g.box(0.68, 0.52, 0.04, 0, 0.86, 2.47, 0x2a221e);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('FERRIS WHEEL', 0xe84a6a, 0xffffff, 1.45, 0.28, 0, 1.24, 2.5, 0));
  var wheel = grp('wheel'); wheel.position.set(0, 4.35, 0); grp0.add(wheel);
  var wg = B(), R = 3.0, nG = 10, nRim = 20;
  for (var i = 0; i < nRim; i++) {
    var a0 = i / nRim * TAU, a1 = (i + 1) / nRim * TAU;
    for (var side = -1; side <= 1; side += 2) {
      var wz = side * 0.46;
      wg.limb(Math.cos(a0) * R, Math.sin(a0) * R, wz, Math.cos(a1) * R, Math.sin(a1) * R, wz, 0.055, 0.055, 0xfaf0d8, { seg: 5 });
      wg.limb(Math.cos(a0) * R * 0.65, Math.sin(a0) * R * 0.65, wz, Math.cos(a1) * R * 0.65, Math.sin(a1) * R * 0.65, wz, 0.036, 0.036, ACC, { seg: 4 });
    }
    if (i % 2 === 0) {
      for (side = -1; side <= 1; side += 2) wg.limb(0, 0, side * 0.46, Math.cos(a0) * R, Math.sin(a0) * R, side * 0.46, 0.032, 0.032, 0xf2c030, { seg: 4 });
      wg.limb(Math.cos(a0) * R, Math.sin(a0) * R, -0.46, Math.cos(a0) * R, Math.sin(a0) * R, 0.46, 0.034, 0.034, 0x8d98a4, { seg: 4 });
    }
    wg.sph(0.08, 0.08, 0.08, Math.cos(a0) * R, Math.sin(a0) * R, 0.54, i % 2 ? 0xfff1b0 : 0x60d8ff, { s: [5, 4] });
  }
  wg.cyl(0.3, 0.3, 1.05, 0, 0, 0, 0xf2c030, { seg: 10, rot: [PI / 2, 0, 0] });
  wheel.add(mesh(wg.build()));
  var gCols = [0xe84a4a, 0x3b82f6, 0xf2c030, 0x58b040, 0xf06aa0, 0xa060e0, 0xff8a3a, 0x30c8d8, 0x22c55e, 0xf43f5e];
  var gondolas = [];
  for (i = 0; i < nG; i++) {
    var ga = i / nG * TAU, gg = B(), col = gCols[i % gCols.length];
    gg.limb(0, 0, -0.36, 0, -0.24, -0.24, 0.024, 0.024, 0x666666, { seg: 4 });
    gg.limb(0, 0, 0.36, 0, -0.24, 0.24, 0.024, 0.024, 0x666666, { seg: 4 });
    gg.lathe([[0.14, -0.72], [0.25, -0.65], [0.28, -0.44], [0.26, -0.4]], col, { seg: 10, sx: 0.92, sz: 1.08 });
    gg.lathe([[0.3, -0.22], [0.25, -0.15], [0.02, -0.12]], shade(col, 1.15), { seg: 10, sx: 0.95, sz: 1.12, cap0: false });
    gg.limb(-0.2, -0.4, -0.22, -0.2, -0.2, -0.22, 0.018, 0.018, 0xd8dde4, { seg: 4 });
    gg.limb(0.2, -0.4, 0.22, 0.2, -0.2, 0.22, 0.018, 0.018, 0xd8dde4, { seg: 4 });
    var gm = grp('gondola'); gm.position.set(Math.cos(ga) * R, Math.sin(ga) * R, 0); gm.add(mesh(gg.build()));
    wheel.add(gm); gondolas.push(gm);
  }
  grp0.userData.update = function (dt) {
    wheel.rotation.z += (dt || 0) * 0.4;
    for (var j = 0; j < gondolas.length; j++) gondolas[j].rotation.z = -wheel.rotation.z;
  };
};

BLD.rubber_duck_stand = function (grp0) { // 2x1 = 4x2m
  var g = B();
  wideStall(g, { w: 3.3, d: 1.0, h: 1.38, wall: 0x38a8e8, trim: 0xf6d030, roof: 0x1d70b8, awn1: 0xf6d030, awn2: 0x38a8e8, counter: 0x1d70b8 });
  // long water trough on front counter
  g.box(2.78, 0.14, 0.42, 0, 0.8, 0.48, 0x0c4a6e);
  // leaning fishing rods & hanging plush prizes
  for (var s = -1; s <= 1; s += 2) {
    g.limb(s * 1.48, 0.16, 0.72, s * 1.32, 1.38, 0.46, 0.02, 0.015, 0xc8923a, { seg: 4 });
    g.sph(0.13, 0.14, 0.11, s * 1.44, 1.44, 0.56, s < 0 ? 0xf06aa0 : 0x58b040, { s: [5, 4] });
  }
  // giant rubber duck on roof
  g.cyl(0.06, 0.06, 0.28, 0, 1.72, -0.24, 0x555555, { seg: 5 });
  g.sph(0.38, 0.28, 0.45, 0, 2.04, -0.24, 0xf6d030, { s: [8, 6] });
  g.sph(0.24, 0.22, 0.24, 0, 2.38, -0.02, 0xf6d030, { s: [7, 5] });
  g.cone(0.09, 0.19, 0, 2.35, 0.22, 0xff7a1a, { seg: 5, rot: [PI / 2, 0, 0] });
  grp0.add(mesh(g.build()));
  var twater = new T.Mesh(unit('duckwater2', function () { return new T.BoxGeometry(2.64, 0.04, 0.34); }), WATER_MAT);
  twater.position.set(0, 0.86, 0.48); grp0.add(twater);
  var ducks = [];
  for (var i = 0; i < 6; i++) {
    var dg = B();
    dg.sph(0.07, 0.055, 0.085, 0, 0.04, 0, 0xf6d030, { s: [6, 4] });
    dg.sph(0.048, 0.048, 0.048, 0, 0.1, 0.048, 0xf6d030, { s: [5, 4] });
    dg.cone(0.022, 0.045, 0, 0.095, 0.095, 0xff7a1a, { seg: 4, rot: [PI / 2, 0, 0] });
    var dm = grp('duck'); dm.add(mesh(dg.build())); dm.userData.ph = i / 6; grp0.add(dm); ducks.push(dm);
  }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var j = 0; j < ducks.length; j++) {
      var a = (tm * 0.85 + ducks[j].userData.ph * TAU);
      ducks[j].position.set(Math.sin(a) * 1.12, 0.87 + Math.sin(tm * 3 + j) * 0.015, 0.48 + Math.cos(a) * 0.08);
      ducks[j].rotation.y = a + PI / 2;
    }
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('HOOK A DUCK', 0x1d70b8, 0xfff080, 1.85, 0.34, 0, 0.42, 0.675, 0));
};

BLD.air_rifle_stand = function (grp0) { // 2x2 = 4x4m
  var g = B(), W = 3.4, H = 1.68, y0 = 0.14;
  g.bevelBox(3.84, 0.08, 3.84, 0.03, 0, 0.04, 0, 0x7c7972);
  g.bevelBox(3.72, 0.08, 3.72, 0.02, 0, 0.11, 0, 0x949088);
  // deep enclosed range bay: back wall, side walls, dark floor, front counter
  g.bevelBox(W, H, 0.18, 0.03, 0, y0 + H / 2, -1.55, 0x7a1a1a);
  for (var s = -1; s <= 1; s += 2) {
    g.bevelBox(0.16, H, 2.6, 0.03, s * (W / 2 - 0.08), y0 + H / 2, -0.34, 0xb82828);
    g.cyl(0.055, 0.06, H, s * (W / 2 - 0.04), y0 + H / 2, 0.94, 0xf2c030, { seg: 6 });
  }
  g.box(W - 0.2, 0.04, 2.45, 0, y0 + 0.02, -0.32, 0x241e1c);
  g.bevelBox(W, 0.64, 0.48, 0.02, 0, y0 + 0.32, 0.96, 0x9a2222);
  g.bevelBox(W + 0.1, 0.09, 0.62, 0.02, 0, y0 + 0.68, 1.0, 0x8a5a3a);
  g.bevelBox(W + 0.24, 0.12, 2.85, 0.035, 0, y0 + H + 0.06, -0.35, 0x7a1a1a);
  g.bevelBox(W + 0.1, 0.08, 2.75, 0.02, 0, y0 + H + 0.14, -0.35, 0xf2c030);
  awning(g, 0, y0 + H + 0.14, 0.96, W + 0.12, 0.68, 0xd83a2a, 0xfaf0d8, 12, 0.4);
  for (s = -1; s <= 1; s += 2) g.cyl(0.03, 0.03, H * 0.56, s * (W / 2 + 0.02), y0 + H * 0.72, 1.56, 0xe8e0d0, { seg: 6 });
  // 4 cork air rifles on counter
  for (var i = 0; i < 4; i++) {
    var rx = -1.05 + i * 0.7;
    g.limb(rx, y0 + 0.75, 1.24, rx, y0 + 0.77, 0.78, 0.024, 0.018, 0x3a3d44, { seg: 4 });
    g.box(0.06, 0.07, 0.22, rx, y0 + 0.74, 1.22, 0x6a3a22);
  }
  // back shelf with colourful tin cans
  g.box(W - 0.5, 0.06, 0.26, 0, y0 + 0.88, -1.32, 0x8a5a3a);
  for (var c = 0; c < 7; c++) g.cyl(0.048, 0.048, 0.13, -1.2 + c * 0.4, y0 + 0.98, -1.32, [0xe84a4a, 0xf2c030, 0x3b82f6, 0x58b040][c % 4], { seg: 6 });
  // rooftop bullseye target sign
  g.cyl(0.065, 0.065, 0.42, 0, y0 + H + 0.34, -0.2, 0x555555, { seg: 5 });
  g.cyl(0.52, 0.52, 0.1, 0, y0 + H + 0.85, -0.2, 0xffffff, { seg: 14, rot: [PI / 2, 0, 0] });
  g.cyl(0.35, 0.35, 0.11, 0, y0 + H + 0.85, -0.2, 0xd83a2a, { seg: 14, rot: [PI / 2, 0, 0] });
  g.cyl(0.16, 0.16, 0.12, 0, y0 + H + 0.85, -0.2, 0xf2c030, { seg: 12, rot: [PI / 2, 0, 0] });
  grp0.add(mesh(g.build()));
  // 4 moving mechanical bullseye targets inside deep range bay
  var targets = [];
  for (i = 0; i < 4; i++) {
    var tg = B();
    tg.cyl(0.14, 0.14, 0.035, 0, 0, 0, 0xffffff, { seg: 10, rot: [PI / 2, 0, 0] });
    tg.cyl(0.075, 0.075, 0.045, 0, 0, 0, 0xd83a2a, { seg: 8, rot: [PI / 2, 0, 0] });
    var tm2 = grp('target'); tm2.add(mesh(tg.build())); grp0.add(tm2); targets.push(tm2);
  }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var j = 0; j < targets.length; j++) {
      var row = j % 2;
      targets[j].position.set(Math.sin(tm * (1.5 + row * 0.4) + j * 1.6) * 1.15, y0 + 1.08 + row * 0.28, -0.65 - row * 0.4);
    }
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('AIR RIFLES', 0x7a1a1a, 0xfff080, 1.9, 0.36, 0, 0.46, 1.22, 0));
};

BLD.ring_toss_stand = function (grp0) { // 1x1 = 2x2m
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0x7c3aed, trim: 0xf6d030, roof: 0x5b21b6, awn1: 0xa855f7, awn2: 0xf6d030, counter: 0xf4ead0, bands: true });
  var bCols = [0x58b040, 0x3b82f6, 0xe84a4a, 0xf2c030];
  for (var bx = -1; bx <= 1; bx++) for (var bz = 0; bz <= 1; bz++) {
    var col = bCols[(bx + 1 + bz) % 4];
    g.cyl(0.038, 0.045, 0.16, bx * 0.22, 0.76, 0.8 + bz * 0.18, col, { seg: 7 });
    g.cyl(0.018, 0.032, 0.06, bx * 0.22, 0.87, 0.8 + bz * 0.18, col, { seg: 6 });
  }
  for (var s = -1; s <= 1; s += 2) {
    g.sph(0.12, 0.14, 0.1, s * 0.65, 1.22, 0.84, s < 0 ? 0xd89050 : 0xf49ac0, { s: [6, 5] });
    g.sph(0.08, 0.08, 0.08, s * 0.65, 1.4, 0.84, s < 0 ? 0xd89050 : 0xf49ac0, { s: [5, 4] });
  }
  g.cyl(0.05, 0.05, 0.25, 0, 1.54, 0, 0x555555, { seg: 5 });
  g.cyl(0.1, 0.12, 0.5, 0, 1.9, 0, 0x58b040, { seg: 8 });
  for (var r = 0; r < 10; r++) {
    var a0 = r / 10 * TAU, a1 = (r + 1) / 10 * TAU;
    g.limb(Math.sin(a0) * 0.26, 2.02, Math.cos(a0) * 0.26, Math.sin(a1) * 0.26, 2.02, Math.cos(a1) * 0.26, 0.045, 0.045, 0xf6d030, { seg: 5 });
  }
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('RING TOSS', 0x5b21b6, 0xfff080, 1.15, 0.24, 0, 0.35, 0.73, 0));
};

BLD.whack_a_mole = function (grp0) { // 2x1 = 4x2m
  var g = B();
  wideStall(g, { w: 3.3, d: 1.0, h: 1.38, wall: 0x16a34a, trim: 0xf97316, roof: 0x15803d, awn1: 0xf97316, awn2: 0xfef08a, counter: 0x7a4a2a, divider: true });
  // 5 holes + 2 resting mallets across double-bay counter
  for (var m = -2; m <= 2; m++) g.cyl(0.12, 0.12, 0.05, m * 0.56, 0.8, 0.48, 0x222226, { seg: 8 });
  for (var s = -1; s <= 1; s += 2) {
    g.limb(s * 1.28, 0.8, 0.62, s * 1.42, 0.82, 0.38, 0.022, 0.022, 0xc89050, { seg: 4 });
    g.cyl(0.065, 0.065, 0.15, s * 1.42, 0.84, 0.38, 0xe84a4a, { seg: 6, rot: [0, 0, PI / 2] });
  }
  // giant mallet on roof
  g.limb(0, 1.65, -0.24, 0, 2.24, -0.24, 0.055, 0.055, 0xc89050, { seg: 5 });
  g.cyl(0.2, 0.2, 0.56, 0, 2.34, -0.24, 0xe84a4a, { seg: 8, rot: [0, 0, PI / 2] });
  grp0.add(mesh(g.build()));
  // 5 animated pop-up dinos/critters
  var moles = [], dCols = [0x65a30d, 0xf97316, 0x14b8a6, 0x84cc16, 0xeab308];
  for (var i = 0; i < 5; i++) {
    var mg = B(), col = dCols[i];
    mg.cyl(0.075, 0.088, 0.15, 0, 0.075, 0, col, { seg: 7 });
    mg.sph(0.08, 0.075, 0.095, 0, 0.16, 0.01, col, { s: [6, 5] });
    mg.cone(0.03, 0.06, 0, 0.24, -0.02, 0xfef08a, { seg: 4 });
    mg.sph(0.02, 0.02, 0.02, -0.04, 0.18, 0.08, 0x111111, { s: [4, 3] });
    mg.sph(0.02, 0.02, 0.02, 0.04, 0.18, 0.08, 0x111111, { s: [4, 3] });
    var mm = grp('mole'); mm.add(mesh(mg.build())); grp0.add(mm); moles.push(mm);
  }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var j = 0; j < moles.length; j++) {
      var h = Math.max(0, Math.sin(tm * 3.6 + j * 1.45));
      moles[j].position.set((j - 2) * 0.56, 0.73 + h * 0.18, 0.48);
    }
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('WHACK!', 0x15803d, 0xfef08a, 1.75, 0.34, 0, 0.42, 0.675, 0));
};

BLD.high_striker = function (grp0) { // 1x2 = 2x4m
  var g = B();
  g.box(1.85, 0.14, 3.85, 0, 0.07, 0, 0x8d8a84);
  // rear ticket/operator booth & backdrop
  g.box(1.55, 1.05, 0.85, 0, 0.66, -1.25, 0xd83a2a, { s: [1, 3, 1] });
  g.box(1.62, 0.1, 0.92, 0, 1.22, -1.25, 0xf6d030);
  awning(g, 0, 1.18, -0.82, 1.55, 0.42, 0xd83a2a, 0xfaf0d8, 8, 0.35);
  // long front striker runway deck + striker pad
  g.box(1.12, 0.16, 1.95, 0, 0.22, 0.65, 0x3b82f6);
  for (var s = -1; s <= 1; s += 2) g.box(0.06, 0.08, 1.95, s * 0.53, 0.32, 0.65, 0xf6d030);
  g.cyl(0.22, 0.24, 0.14, 0, 0.36, 1.25, 0xf6d030, { seg: 10 });
  // tall graduated striker tower
  g.box(0.34, 3.35, 0.18, 0, 1.82, -0.35, function (px, py) { return fract(py * 2.0) < 0.5 ? 0xfaf0d8 : 0xe84a4a; });
  g.box(0.07, 3.25, 0.07, 0, 1.82, -0.24, 0xc8ccd0);
  // golden bell at top
  g.cyl(0.16, 0.27, 0.25, 0, 3.62, -0.32, 0xf6d030, { seg: 10 });
  g.sph(0.16, 0.11, 0.16, 0, 3.74, -0.32, 0xf6d030, { s: [8, 4] });
  // resting heavy mallet
  g.limb(0.45, 0.22, 1.2, 0.68, 1.08, 0.95, 0.03, 0.025, 0x8a5a3a, { seg: 4 });
  g.cyl(0.12, 0.12, 0.28, 0.68, 1.12, 0.95, 0x3a3d44, { seg: 6, rot: [0, 0, PI / 2] });
  grp0.add(mesh(g.build()));
  var pg = B(); pg.cyl(0.13, 0.13, 0.1, 0, 0, 0, 0xf2c030, { seg: 8, rot: [PI / 2, 0, 0] });
  var puck = grp('puck'); puck.add(mesh(pg.build())); grp0.add(puck);
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    var u = fract(tm * 0.45);
    var h = u < 0.35 ? Math.sin((u / 0.35) * PI * 0.5) : u < 0.65 ? Math.cos(((u - 0.35) / 0.3) * PI * 0.5) : 0;
    puck.position.set(0, 0.52 + h * 2.95, -0.21);
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('STRIKER', 0xd83a2a, 0xfff4d0, 1.25, 0.26, 0, 0.85, -0.78, 0));
};

BLD.candy_floss = function (grp0) { // 1x1 = 2x2m
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0xf472b6, trim: 0xffffff, roof: 0xec4899, awn1: 0xf472b6, awn2: 0x7dd3fc, counter: 0xfdf2f8, bands: true });
  g.cyl(0.24, 0.2, 0.16, -0.25, 0.78, 0.85, 0xd8dde4, { seg: 10 });
  g.sph(0.2, 0.14, 0.2, -0.25, 0.88, 0.85, 0xf9a8d4, { s: [8, 5] });
  g.sph(0.12, 0.18, 0.12, 0.35, 0.92, 0.86, 0x7dd3fc, { s: [6, 5] });
  g.cyl(0.05, 0.05, 0.4, 0, 1.56, 0, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  var cf = B();
  cf.limb(0, -0.35, 0, 0, 0.35, 0, 0.03, 0.03, 0xffffff, { seg: 5 });
  cf.sph(0.32, 0.38, 0.32, 0, 0.28, 0, 0xf472b6, { s: [9, 6] });
  cf.sph(0.26, 0.28, 0.26, 0.1, 0.42, 0.05, 0xf9a8d4, { s: [8, 5] });
  cf.sph(0.22, 0.22, 0.22, -0.1, 0.15, -0.05, 0x7dd3fc, { s: [7, 5] });
  addSpin(grp0, cf.build(), 2.0, 1.1);
  grp0.add(labelMesh('CANDY FLOSS', 0xec4899, 0xffffff, 1.2, 0.24, 0, 0.35, 0.73, 0));
};

BLD.popcorn_stand = function (grp0) { // 1x1 = 2x2m
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0xd83a2a, trim: 0xf6d030, roof: 0xb82820, awn1: 0xd83a2a, awn2: 0xffffff, counter: 0xfaf0d8, bands: true });
  g.box(0.45, 0.42, 0.34, 0, 0.9, 0.85, 0xd8f0fa);
  g.box(0.47, 0.06, 0.36, 0, 1.12, 0.85, 0xd83a2a);
  g.sph(0.18, 0.12, 0.14, 0, 0.78, 0.85, 0xfef08a, { s: [6, 4] });
  g.cyl(0.05, 0.05, 0.4, 0, 1.56, 0, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  var pc = B();
  pc.cyl(0.32, 0.22, 0.65, 0, 0, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 8) < 0.5 ? 0xd83a2a : 0xffffff; }, { seg: 8 });
  for (var i = 0; i < 9; i++) {
    var a = i / 9 * TAU, rr = i < 7 ? 0.17 : 0.05;
    pc.sph(0.12, 0.1, 0.12, Math.sin(a) * rr, 0.36 + (i % 3) * 0.05, Math.cos(a) * rr, i % 2 ? 0xfef08a : 0xfffbe0, { s: [5, 4] });
  }
  addSpin(grp0, pc.build(), 2.05, 0.9);
  grp0.add(labelMesh('POPCORN', 0xb82820, 0xfef08a, 1.15, 0.24, 0, 0.35, 0.73, 0));
};

BLD.hot_dog_stand = function (grp0) { // 2x1 = 4x2m patio
  var g = B(), cx = -0.68, cz = 0.05;
  g.box(3.85, 0.12, 1.85, 0, 0.06, 0, 0x8d8a84);
  // hot dog cart on left side
  g.box(1.45, 0.68, 0.95, cx, 0.74, cz, 0xd83a2a, { s: [1, 3, 1] });
  g.box(1.52, 0.08, 1.02, cx, 1.12, cz, 0xe8ecf0);
  g.box(1.4, 0.1, 0.9, cx, 0.4, cz, 0xf6d030);
  for (var s = -1; s <= 1; s += 2) {
    g.cyl(0.32, 0.32, 0.09, cx + s * 0.68, 0.38, cz, 0x2a2a2a, { seg: 10, rot: [0, 0, PI / 2] });
    g.cyl(0.12, 0.12, 0.11, cx + s * 0.68, 0.38, cz, 0xf6d030, { seg: 6, rot: [0, 0, PI / 2] });
  }
  // grill + sausages + mustard/ketchup bottles
  g.box(0.65, 0.06, 0.5, cx - 0.2, 1.19, cz, 0x3a3d44);
  for (var i = 0; i < 3; i++) g.cyl(0.04, 0.04, 0.32, cx - 0.35 + i * 0.15, 1.24, cz, 0xc85228, { seg: 6, rot: [PI / 2, 0, 0] });
  g.cyl(0.04, 0.04, 0.2, cx + 0.35, 1.26, cz + 0.15, 0xd83a2a, { seg: 6 });
  g.cyl(0.04, 0.04, 0.2, cx + 0.5, 1.26, cz + 0.15, 0xf6d030, { seg: 6 });
  // striped carnival umbrella
  g.limb(cx + 0.45, 1.16, cz - 0.08, cx + 0.45, 2.48, cz - 0.08, 0.032, 0.032, 0x555555, { seg: 4 });
  g.cone(0.92, 0.46, cx + 0.45, 2.52, cz - 0.08, function (x, y, z) { return fract(Math.atan2(x - (cx + 0.45), z - (cz - 0.08)) / TAU * 10) < 0.5 ? 0xd83a2a : 0xf6d030; }, { seg: 10 });
  // giant hot dog sign on roof of cart
  g.cyl(0.16, 0.16, 0.72, cx - 0.2, 1.62, cz, 0xe0a050, { seg: 8, rot: [0, 0, PI / 2] });
  g.cyl(0.12, 0.12, 0.86, cx - 0.2, 1.72, cz, 0xc84824, { seg: 8, rot: [0, 0, PI / 2] });
  g.box(0.7, 0.04, 0.06, cx - 0.2, 1.84, cz, 0xf6d030);
  // outdoor picnic table & benches on right patio
  var tx = 1.05, W = 0xb08050, D = 0x8a6038;
  g.box(1.32, 0.07, 0.68, tx, 0.78, cz, W);
  g.box(1.32, 0.06, 0.28, tx, 0.46, cz + 0.54, W);
  g.box(1.32, 0.06, 0.28, tx, 0.46, cz - 0.54, W);
  for (s = -1; s <= 1; s += 2) {
    g.limb(tx + s * 0.46, 0.12, cz + 0.58, tx + s * 0.46, 0.78, cz + 0.12, 0.036, 0.036, D, { seg: 4 });
    g.limb(tx + s * 0.46, 0.12, cz - 0.58, tx + s * 0.46, 0.78, cz - 0.12, 0.036, 0.036, D, { seg: 4 });
    g.box(0.06, 0.06, 1.24, tx + s * 0.46, 0.44, cz, D);
  }
  g.cyl(0.035, 0.035, 0.16, tx - 0.2, 0.89, cz, 0xf6d030, { seg: 6 });
  g.box(0.24, 0.04, 0.16, tx + 0.2, 0.83, cz, 0xfaf0d8);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('HOT DOGS', 0xd83a2a, 0xfef08a, 1.05, 0.24, cx, 0.74, cz + 0.485, 0));
};

BLD.slushie_bar = function (grp0) { // 2x1 = 4x2m
  var g = B();
  wideStall(g, { w: 3.2, d: 0.96, h: 1.38, wall: 0x06b6d4, trim: 0xf43f5e, roof: 0x0e7490, awn1: 0x22d3ee, awn2: 0xf43f5e, counter: 0xe0f2fe });
  // twin-flavour slushie dispenser tanks on wide counter
  var tx = [-0.95, -0.5, 0.5, 0.95], tCols = [0xf43f5e, 0x38bdf8, 0xf43f5e, 0x38bdf8];
  for (var i = 0; i < 4; i++) {
    g.box(0.32, 0.4, 0.26, tx[i], 0.98, 0.42, tCols[i]);
    g.box(0.34, 0.06, 0.28, tx[i], 1.2, 0.42, 0xffffff);
  }
  // neon side stools along front counter
  var sCols = [0xf43f5e, 0x38bdf8, 0xfacc15, 0xf43f5e];
  for (i = 0; i < 4; i++) {
    var sx = -1.14 + i * 0.76;
    g.cyl(0.035, 0.05, 0.36, sx, 0.3, 0.82, 0xd8dde4, { seg: 6 });
    g.cyl(0.15, 0.15, 0.06, sx, 0.5, 0.82, sCols[i], { seg: 8 });
  }
  g.cyl(0.06, 0.06, 0.42, 0, 1.82, -0.24, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  var sl = B();
  sl.cyl(0.34, 0.22, 0.8, 0, 0, 0, function (x, y) { return y > 0 ? 0xf43f5e : 0x38bdf8; }, { seg: 10 });
  sl.sph(0.33, 0.24, 0.33, 0, 0.42, 0, 0xe0f2fe, { s: [10, 6] });
  sl.limb(0.06, 0.44, 0, 0.16, 0.84, 0, 0.035, 0.035, 0xfacc15, { seg: 4 });
  sl.limb(0.16, 0.84, 0, 0.36, 0.9, 0, 0.035, 0.035, 0xfacc15, { seg: 4 });
  var sp = addSpin(grp0, sl.build(), 2.38, 1.0); sp.position.z = -0.24;
  grp0.add(labelMesh('SLUSHIES', 0x0e7490, 0xffffff, 1.7, 0.34, 0, 0.42, 0.675, 0));
};
// ================================================================ EGG
function createEgg() {
  var grp0 = grp('egg'), g = B(), i;
  var shell = function (x, y, z, nx, ny) { var h = hash3(Math.floor(x * 22), Math.floor(y * 22), Math.floor(z * 22)); return h > 0.86 ? 0x7a5e3c : (h > 0.7 ? 0xb89a70 : (ny > 0.4 ? 0xf6ecd4 : 0xe6d8b8)); };
  // nest of twigs and straw
  g.cyl(0.36, 0.3, 0.08, 0, 0.04, 0, 0xc8a050, { seg: 10 });
  for (i = 0; i < 14; i++) { var a = i / 14 * TAU, r = 0.3 + (i % 2) * 0.04; g.limb(Math.sin(a) * r, 0.06 + (i % 3) * 0.02, Math.cos(a) * r, Math.sin(a + 0.8) * (r + 0.02), 0.1 + (i % 3) * 0.03, Math.cos(a + 0.8) * (r + 0.02), 0.025, 0.02, i % 3 ? 0x8a6a3a : 0xb08a48, { seg: 3 }); }
  for (i = 0; i < 8; i++) { var b = i / 8 * TAU + 0.2; g.limb(Math.sin(b) * 0.2, 0.08, Math.cos(b) * 0.2, Math.sin(b) * 0.34, 0.16, Math.cos(b) * 0.34, 0.012, 0.008, 0xe0c060, { seg: 3 }); }
  grp0.add(mesh(g.build()));
  var eg = new T.Mesh(unit('eggShell', function () { var geo = new T.SphereGeometry(1, 12, 10).toNonIndexed(), p = geo.attributes.position, c = new Float32Array(p.count * 3), n = geo.attributes.normal;
    for (var j = 0; j < p.count; j++) { var y = p.getY(j), t = (y + 1) / 2; var k = 1 - 0.18 * t; p.setX(j, p.getX(j) * k); p.setZ(j, p.getZ(j) * k); p.setY(j, y * 1.25);
      var h = hash3(Math.floor(p.getX(j) * 6), Math.floor(y * 6), Math.floor(p.getZ(j) * 6)), col = h > 0.86 ? 0x7a5e3c : (h > 0.7 ? 0xb89a70 : (n.getY(j) > 0.3 ? 0xf6ecd4 : 0xe6d8b8)); c[j * 3] = (col >> 16 & 255) / 255; c[j * 3 + 1] = (col >> 8 & 255) / 255; c[j * 3 + 2] = (col & 255) / 255; }
    geo.setAttribute('color', new T.BufferAttribute(c, 3)); geo.computeVertexNormals(); return geo; }), VC);
  var holder = grp('eggwob'); holder.position.set(0, 0.1, 0); eg.scale.set(0.2, 0.2, 0.2); eg.position.y = 0.24; eg.rotation.z = 0.12; holder.add(eg); grp0.add(holder);
  var ph = Math.random() * 6;
  grp0.userData.update = function (dt, time) { var t = (time || 0) + ph, burst = Math.max(0, Math.sin(t * 0.7)) ; var w = Math.pow(burst, 6); holder.rotation.z = 0.12 * 0 + Math.sin(t * 9) * 0.12 * w; holder.rotation.x = Math.cos(t * 7) * 0.06 * w; holder.scale.y = 1 + 0.02 * Math.sin(t * 2); };
  grp0.userData.height = 0.6;
  return grp0;
}

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
// measure(obj) -> tight bounding data from real vertices (world space): sphere centre/radius around the bbox centre, horizontal radius rh
// about the vertical axis through (cx,cz), minY/maxY. Used by thumbnails and 64-portrait.js.
API.measure = function (obj) {
  obj.updateMatrixWorld(true);
  var v = new T.Vector3(), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], meshes = [];
  obj.traverse(function (o) {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position) return;
    var pa = o.geometry.attributes.position, n = pa.count, k; meshes.push(o);
    for (k = 0; k < n; k++) {
      v.fromBufferAttribute(pa, k).applyMatrix4(o.matrixWorld); if (!isFinite(v.x + v.y + v.z)) continue;
      if (v.x < mn[0]) mn[0] = v.x; if (v.y < mn[1]) mn[1] = v.y; if (v.z < mn[2]) mn[2] = v.z; if (v.x > mx[0]) mx[0] = v.x; if (v.y > mx[1]) mx[1] = v.y; if (v.z > mx[2]) mx[2] = v.z;
    }
  });
  if (mn[0] > mx[0]) return { cx: 0, cy: 1, cz: 0, r: 2, rh: 2, minY: 0, maxY: 2 };      // nothing measurable: generic frame
  var cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2, r2 = 1e-6, rh2 = 1e-6, i, k2, dx, dy, dz;
  for (i = 0; i < meshes.length; i++) {
    var pb = meshes[i].geometry.attributes.position, mw = meshes[i].matrixWorld;
    for (k2 = 0; k2 < pb.count; k2++) {
      v.fromBufferAttribute(pb, k2).applyMatrix4(mw); if (!isFinite(v.x + v.y + v.z)) continue;
      dx = v.x - cx; dy = v.y - cy; dz = v.z - cz; if (dx * dx + dz * dz > rh2) rh2 = dx * dx + dz * dz; if (dx * dx + dy * dy + dz * dz > r2) r2 = dx * dx + dy * dy + dz * dz;
    }
  }
  return { cx: cx, cy: cy, cz: cz, r: Math.sqrt(r2), rh: Math.sqrt(rh2), minY: mn[1], maxY: mx[1] };
};
API.thumbRenderer = function () { return thumbInit() ? thumbR : null; };
API.thumbnail = function (kind, id, size) {
  size = size || 96; var key = kind + '|' + id + '|' + size; if (thumbCache[key]) return thumbCache[key];
  if (!thumbInit()) return null;
  var obj = null;
  try {
    if (kind === 'animal') { var a = API.createAnimal(id, { sex: 'm' }); if (!a) return null; obj = a.group; for (var i = 0; i < 8; i++) a.update(0.05, { state: 'idle', speed: 0 }); }
    else if (kind === 'scenery') obj = API.createScenery(id);
    else if (kind === 'building') obj = API.createBuilding(id);
    else if (kind === 'guest') { var gu = API.createGuest(+id || 1); obj = gu.group; gu.update(0.05, { state: 'idle', speed: 0 }); }
    else if (kind === 'staff') { var st = API.createStaff(id); obj = st.group; st.update(0.05, { state: 'idle', speed: 0 }); }
    else if (kind === 'egg') obj = API.createEgg();
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    var bb = new T.Box3().setFromObject(obj), c = new T.Vector3(), sz = new T.Vector3(); bb.getCenter(c); bb.getSize(sz);
    var r = Math.max(sz.x, sz.z * 0.9, sz.y) * 0.62 + 0.001, dist = r / Math.tan(14 * PI / 180);
    if (kind === 'animal') { var ms = API.measure(obj); c.set(ms.cx, ms.cy, ms.cz); dist = ms.r * 1.12 / Math.sin(14 * PI / 180); }   // bounding-sphere fit: head/tail never clip at any angle
    var az = kind === 'animal' ? 0.85 : 0.7, el = kind === 'building' ? 0.42 : 0.32;
    thumbCam.position.set(c.x + Math.sin(az) * dist * Math.cos(el), c.y + Math.sin(el) * dist, c.z + Math.cos(az) * dist * Math.cos(el)); thumbCam.lookAt(c);
    thumbScene.add(obj); thumbR.setSize(size, size, false); thumbR.render(thumbScene, thumbCam);
    var url = thumbR.domElement.toDataURL('image/png'); thumbScene.remove(obj);
    return (thumbCache[key] = url);
  } catch (e) { try { if (obj) thumbScene.remove(obj); } catch (e2) { } return null; }
};

// ================================================================ API
// createAnimal(speciesId, {baby?, sex?}) -> {group, update(dt, ent), height}
API.createAnimal = function (id, opts) {
  opts = opts || {};
  if (DINOS[id]) return createDino(DINOS[id], opts);
  var fb = grp('animal'); fb.add(mesh(B().box(0.8, 0.6, 1.6, 0, 0.7, 0, 0xaa8866).build())); return { group: fb, update: function () { }, height: 1.4 };
};
API.createGuest = function (seed) { return API_people.guest(seed); };
API.createStaff = function (type) { return API_people.staff(type); };
function fallbackBox() { var f = grp('missing'); f.add(mesh(B().box(1.2, 1.2, 1.2, 0, 0.6, 0, 0xc08060).build())); return f; }
API.createScenery = function (id) { return SCENERY_API.scenery(id) || fallbackBox(); };
API.createBuilding = function (id) { return BUILDING_API.building(id) || fallbackBox(); };
API.createEgg = function () { return createEgg(); };
API.sceneryInstancing = SCENERY_API.instancing;
API.speciesIds = function () { return Object.keys(DINOS); };
API.buildingFootprint = function (id) { var d = BLD_DEF[id]; return d ? { w: d[0], h: d[1] } : null; };
API.setDetail = function (d) {
  var v = clamp(+d || 1.5, 0.8, 2.2);
  if (Math.abs(v - DETAIL) < 0.01) return;
  DETAIL = v;
  unitCache = {}; bodyCache = {}; legCache = {}; armCache = {}; propCache = {}; sceneryGeoCache = {}; dparts = {};
  if (API._onDetail) API._onDetail(DETAIL);
};
API.getDetail = function () { return DETAIL; };
// helper kit for sibling model modules (31-models-extra.js builds the sea/air/modern creatures from these)
API.kit = { T: T, B: B, mesh: mesh, grp: grp, VC: VC, mat: mat, skin: skin, profAt: profAt, clamp: clamp, lerp: lerp, damp: damp, smooth: smooth, mixHex: mixHex, shade: shade, hash3: hash3, fract: fract, eye: eye, fixZ: fixZ, detail: function () { return DETAIL; } };
return API;
})();


