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
  var V = function (sx, sy, sz, face) {
    if (face === 0) return W(sx * hx, sy * iy, sz * iz);
    if (face === 1) return W(sx * ix, sy * hy, sz * iz);
    return W(sx * ix, sy * iy, sz * hz);
  };
  Q(V(1, -1, -1, 0), V(1, 1, -1, 0), V(1, 1, 1, 0), V(1, -1, 1, 0), WN(1, 0, 0));
  Q(V(-1, -1, 1, 0), V(-1, 1, 1, 0), V(-1, 1, -1, 0), V(-1, -1, -1, 0), WN(-1, 0, 0));
  Q(V(-1, 1, -1, 1), V(-1, 1, 1, 1), V(1, 1, 1, 1), V(1, 1, -1, 1), WN(0, 1, 0));
  Q(V(-1, -1, 1, 1), V(-1, -1, -1, 1), V(1, -1, -1, 1), V(1, -1, 1, 1), WN(0, -1, 0));
  Q(V(-1, -1, 1, 2), V(1, -1, 1, 2), V(1, 1, 1, 2), V(-1, 1, 1, 2), WN(0, 0, 1));
  Q(V(1, -1, -1, 2), V(-1, -1, -1, 2), V(-1, 1, -1, 2), V(1, 1, -1, 2), WN(0, 0, -1));
  for (var s1 = -1; s1 <= 1; s1 += 2) for (var s2 = -1; s2 <= 1; s2 += 2) {
    Q(V(s1, s2, -1, 0), V(s1, s2, 1, 0), V(s1, s2, 1, 1), V(s1, s2, -1, 1), WN(s1, s2, 0));
    Q(V(s1, -1, s2, 0), V(s1, 1, s2, 0), V(s1, 1, s2, 2), V(s1, -1, s2, 2), WN(s1, 0, s2));
    Q(V(-1, s1, s2, 1), V(1, s1, s2, 1), V(1, s1, s2, 2), V(-1, s1, s2, 2), WN(0, s1, s2));
  }
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
  var midP = new Float32Array(rows * cols * 3), i, j, cIdx, sIdx;
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
// eyes with lid rim, iris, pupil and catchlight; x is |x|
function eyePair(g, x, y, z, r, col) {
  var iris = col || 0x2b1a10, lid = 0x1a1412;
  for (var s = -1; s <= 1; s += 2) {
    var ex = s * x;
    g.sph(r * 1.25, r * 1.1, r * 0.95, ex - s * r * 0.08, y, z - r * 0.05, lid, { s: [6, 4] });
    g.sph(r * 0.98, r * 0.95, r * 0.85, ex + s * r * 0.1, y, z + r * 0.08, iris, { s: [6, 4] });
    g.sph(r * 0.5, r * 0.55, r * 0.32, ex + s * r * 0.6, y - r * 0.02, z + r * 0.52, 0x060606, { s: [5, 4] });
    g.sph(r * 0.2, r * 0.2, r * 0.14, ex + s * r * 0.5, y + r * 0.42, z + r * 0.78, 0xffffff, { s: [4, 3] });
  }
}
// shaped tail tuft: z is the base (tail local, -z is backwards), r base radius, hl half length
function tuft(g, z, r, hl, col, col2) {
  var c2 = col2 || shade(col, 0.7);
  g.loft([[0, r * 0.6, r * 0.6, 0], [hl * 0.3, r * 1.5, r * 1.4, 0], [hl * 0.85, r * 1.55, r * 1.35, 0], [hl * 1.5, r * 1.0, r * 0.8, 0], [hl * 2.0, r * 0.3, r * 0.25, 0]],
    { rings: 7, seg: 7, dir: -1, oz: z + hl * 0.4, cap0: true, cap1: true }, function (zc, ca, sa, x, y, zz) { return fract(zz * 53 + x * 31) > 0.7 ? c2 : col; });
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
  if (typeof c === 'function') return function (zc, ca, sa, x, y, z) { return c(y, 0, front, x, z); };
  return c || 0x888888;
}
function monotone(K) { for (var i = 1; i < K.length; i++) if (K[i][0] < K[i - 1][0] + 0.002) K[i][0] = K[i - 1][0] + 0.002; return K; }
// egg-shaped haunch/shoulder muscle that blends from the body into the leg; m = [w, h, d, ox, oy, oz]
function legMass(g, m, hind, maxS, rEnd, col, seg) {
  var w = m[0], h = m[1], d = m[2], oy = m[4] || (hind ? -h * 0.4 : 0), oz = m[5] || (hind ? -d * 0.3 : 0);
  var a = -oy - h * 0.9, b = Math.max(a + 0.1, Math.min(-oy + h * 1.2, maxS)), L = b - a;
  g.loft(monotone([[a, w * 0.4, d * 0.45, oz], [a + L * 0.15, w * 0.78, d * 0.9, oz], [a + L * 0.38, w * 0.92, d, oz], [a + L * 0.68, lerp(w, rEnd, 0.5) * 0.9, lerp(d, rEnd, 0.4), oz * 0.5], [b, rEnd, rEnd, 0]]),
    { down: true, ox: m[3] || 0, rings: 7, seg: seg, cap0: true }, col);
}
// hoof capsule with coronet band, paw with toes/pad/claws, columnar foot, toes, hand. y0 = ground level, fr = pastern radius
function addFoot(g, ft, y0, fr, fh, col) { // col: leg colour fn (x,y,z,nx,ny,nz) or number
  var fc = ft.col || 0x222222, type = ft.type || 'hoof', i, lc = typeof col === 'function' ? function (zc, ca, sa, x, y, z) { return col(x, y, z, sa, ca, 0); } : col, base = ft.base || lc;
  if (type === 'hoof') {
    var coro = shade(fc, 1.45), sole = shade(fc, 0.55);
    g.loft([[0, fr * 1.0, fr * 1.05, 0], [fh * 0.18, fr * 1.12, fr * 1.2, fr * 0.04], [fh * 0.6, fr * 1.2, fr * 1.4, fr * 0.2], [fh, fr * 1.26, fr * 1.7, fr * 0.34]],
      { down: true, oy: y0 + fh, rings: 4, seg: 8, cap1: true }, function (zc, ca) { return zc < fh * 0.2 ? coro : (zc > fh * 0.92 ? sole : (ca > 0.4 ? shade(fc, 1.12) : fc)); });
  } else if (type === 'paw') {
    var pc = ft.pawCol || col, pad = 0x2e2020;
    g.sph(fr * 1.3, fh * 0.75, fr * 1.55, 0, y0 + fh * 0.62, fr * 0.45, function (x, y, z, nx, ny) { return ny < -0.55 ? pad : pc; }, { s: [7, 5] });
    for (i = -1.5; i <= 1.5; i++) {
      var tx = i * fr * 0.5, tz = fr * (1.55 - Math.abs(i) * 0.16);
      g.sph(fr * 0.36, fh * 0.5, fr * 0.42, tx, y0 + fh * 0.42, tz, function (x, y, z, nx, ny) { return ny < -0.55 ? pad : pc; }, { s: [5, 4] });
      if (ft.claws) g.cone(fr * 0.12, fr * 0.55, tx, y0 + fh * 0.3, tz + fr * 0.5, fc, { seg: 4, rot: [PI / 2 + 0.45, 0, 0] });
    }
  } else if (type === 'foot') {
    g.loft([[0, fr * 1.0, fr * 1.0, 0], [fh * 0.7, fr * 1.12, fr * 1.12, 0], [fh, fr * 1.1, fr * 1.1, 0]], { down: true, oy: y0 + fh, rings: 4, seg: 10, cap1: true },
      function (zc, ca, sa, x, y, z) { var b = typeof base === 'function' ? base(zc, ca, sa, x, y, z) : base; return zc < fh * 0.3 ? shade(b, 1.1) : (fract(zc * 40) < 0.5 ? b : shade(b, 0.88)); });
    for (i = -2; i <= 2; i++) { var an = i * 0.42; g.sph(fr * 0.3, fh * 0.3, fr * 0.2, Math.sin(an) * fr * 1.05, y0 + fh * 0.42, Math.cos(an) * fr * 1.1, fc, { s: [5, 4], rot: [0, an, 0] }); }
  } else if (type === 'toes') {
    g.loft([[0, fr * 0.95, fr * 1.0, 0], [fh * 0.6, fr * 1.1, fr * 1.15, fr * 0.1], [fh, fr * 1.15, fr * 1.25, fr * 0.15]], { down: true, oy: y0 + fh, rings: 3, seg: 8, cap1: true }, lc);
    for (i = -1; i <= 1; i++) {
      var ttx = i * fr * 0.66;
      g.sph(fr * 0.38, fh * 0.42, fr * 0.55, ttx, y0 + fh * 0.4, fr * (1.0 - Math.abs(i) * 0.12), col, { s: [5, 4] });
      g.sph(fr * 0.3, fh * 0.32, fr * 0.26, ttx, y0 + fh * 0.36, fr * (1.45 - Math.abs(i) * 0.1), fc, { s: [4, 3] });
    }
  } else if (type === 'hand') {
    g.sph(fr * 1.3, fh * 0.6, fr * 1.2, 0, y0 + fh * 0.65, fr * 0.3, fc, { s: [7, 5] });
    for (i = -1.5; i <= 1.5; i++) g.sph(fr * 0.27, fh * 0.34, fr * 0.5, i * fr * 0.44, y0 + fh * 0.4, fr * (1.2 - Math.abs(i) * 0.08), fc, { s: [5, 4] });
    g.sph(fr * 0.3, fh * 0.3, fr * 0.45, fr * 1.15, y0 + fh * 0.55, fr * 0.7, fc, { s: [5, 4], rot: [0, -0.5, 0] });
  }
}
function legPieces(spec, front) {
  var lg = spec.legs, len = front ? lg.fLen : lg.hLen, r = (front ? lg.fr : lg.hr), kf = lg.two === false ? 1 : (lg.kf || 0.5);
  var up = len * kf, lo = len - up, col = legColFn(lg, front), colB = typeof lg.col === 'function' ? function (x, y, z, nx, ny) { return lg.col(y, ny, front, x, z); } : lg.col, ft = lg.foot || {}, fh = ft.h || 0.08;
  var gU = B(), gL = null, r0 = r[0], r1 = r[1], r2 = r[2], hind = !front;
  var seg = Math.max(8, lg.seg || 8), rg = Math.max(8, (lg.hs || 4) * 2);
  var kd = front ? 0.35 : -0.6; // carpus bulges forward, hock backward
  var bk = (ft.type === 'foot' || ft.type === 'toes') ? 0.4 : 1; // columnar / reptile legs: subtler joints
  var bmp = function (v) { return 1 + (v - 1) * bk; }, fb = bmp(!ft.type || ft.type === 'hoof' ? 1.12 : 1.03);
  var mass = hind ? lg.haunch : lg.shoulder;
  if (mass) legMass(gU, mass, hind, up * 0.85, r1 * 1.15, col, seg);
  if (lg.two === false) {
    var fe = len - fh;
    gU.loft(monotone([[-r0 * 0.6, r0 * 0.7, r0 * 0.75, 0], [0, r0 * 1.05, r0 * 1.1, 0], [len * 0.3, lerp(r0, r2, 0.35), lerp(r0, r2, 0.35) * 1.1, 0], [fe, r2, r2, 0], [len - fh * 0.3, r2, r2, 0]]),
      { down: true, rings: rg, seg: seg, cap0: true, cap1: true }, col);
    addFoot(gU, ft, -len, r2, fh, colB || 0x888888);
  } else {
    var rm = lerp(r0, r1, 0.35), rn = lerp(r0, r1, 0.7);
    gU.loft(monotone([[-r0 * 0.6, r0 * 0.7, r0 * 0.75, 0], [0, r0 * 1.05, r0 * 1.1, 0], [up * 0.22, rm * 1.1, rm * 1.18, hind ? r0 * 0.1 : 0], [up * 0.55, rn, rn * 1.05, hind ? -r1 * 0.1 : 0], [up * 0.84, r1 * 0.96, r1 * 0.98, 0],
      [up * 0.97, r1 * bmp(1.06), r1 * bmp(1.2), kd * r1 * bk], [up + r1 * 0.45, r1 * 0.8, r1 * 0.95, kd * r1 * 0.6 * bk]]),
      { down: true, rings: rg, seg: seg, cap0: true, cap1: true }, col);
    gL = B();
    if (ft.type === 'boot') {
      var bCol = ft.col || 0x261810, cCol = ft.cuffCol || 0x3a2518, gCol = ft.buckleCol || 0xf2c94c;
      gL.lathe([[r1 * 1.16, -lo * 0.24], [r1 * 1.56, -lo * 0.04], [r1 * 1.44, 0.03], [r1 * 1.12, -lo * 0.02]], cCol, { seg: 9 });
      gL.limb(0, -lo * 0.18, 0, 0, -lo + fh * 0.65, 0, r1 * 1.16, r2 * 1.18, bCol, { seg: 8 });
      gL.sph(r2 * 1.42, fh * 0.72, r2 * 2.1, 0, -lo + fh * 0.52, r2 * 0.68, bCol, { s: [7, 5] });
      gL.bevelBox(r2 * 1.9, fh * 0.62, r2 * 1.3, fh * 0.16, 0, -lo + fh * 0.34, -r2 * 0.2, bCol);
      gL.bevelBox(r2 * 1.1, fh * 0.55, r2 * 0.45, fh * 0.12, 0, -lo + fh * 1.15, r2 * 1.28, gCol);
    } else {
      var fl = Math.max(lo * 0.62, lo - fh);
      gL.loft(monotone([[-r1 * 0.5, r1 * 0.7, r1 * 0.8, kd * r1 * 0.5 * bk], [0, r1 * bmp(1.05), r1 * bmp(1.22), kd * r1 * bk], [lo * 0.16, r1 * 0.85, r1 * 0.95, kd * r1 * 0.35 * bk], [lo * 0.5, lerp(r1, r2, 0.75) * 0.95, lerp(r1, r2, 0.75) * 0.95, 0],
        [fl - r2 * 1.0, r2 * 0.95, r2 * 0.97, 0], [fl - r2 * 0.35, r2 * fb, r2 * fb * 1.07, -r2 * 0.12 * bk], [fl + fh * 0.1, r2 * 0.98, r2, 0], [Math.max(fl + fh * 0.2, lo - fh * 0.3), r2, r2, 0]]),
        { down: true, rings: rg, seg: seg, cap0: true, cap1: true }, col);
      addFoot(gL, ft, -lo, r2, fh, colB || 0x888888);
    }
  }
  return { up: gU.build(), lo: gL ? gL.build() : null, upLen: up, loLen: lo };
}
function tailGeos(spec) {
  var tl = spec.tail; if (!tl) return null; var out = [], n = tl.n || 1, sl = tl.len / n;
  for (var i = 0; i < n; i++) {
    var g = B(), r0 = lerp(tl.r0, tl.r1, i / n), r1 = lerp(tl.r0, tl.r1, (i + 1) / n), rm = lerp(r0, r1, 0.5);
    var col = typeof tl.col === 'function' ? (function (ii) { return function (zc, ca, sa, x, y, z) { return tl.col(ii, x, y, z, sa, ca, 0); }; })(i) : (tl.col || 0x888888);
    g.loft([[-r0 * 0.5, r0 * 0.7, r0 * 0.7, 0], [0, r0, r0, 0], [sl * 0.5, rm * 1.03, rm * 1.03, 0], [sl * 1.05, r1, r1, 0], [sl * 1.05 + r1 * 0.5, r1 * 0.6, r1 * 0.6, 0]],
      { dir: -1, rings: clamp(Math.round(sl * 20), 5, 10), seg: tl.seg || 6, cap0: true, cap1: true }, col);
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
    var ncol = typeof nk.col === 'function' ? function (zc, ca, sa, x, y, z) { return nk.col(x, y, z, sa, ca, 0); } : (nk.col || 0x888888);
    var nl = nk.len, nr0 = nk.r0, nr1 = nk.r1, nw = nl < nr0 * 2 ? 1 : 0.9, nm1 = lerp(nr0, nr1, 0.4), nm2 = lerp(nr0, nr1, 0.75);
    g.loft([[-nr0 * 0.8, nr0 * 0.62, nr0 * 0.68, 0], [0, nr0 * 0.98 * nw, nr0 * 1.12, 0], [nl * 0.3, nm1 * nw, nm1 * 1.14, -nm1 * 0.03], [nl * 0.65, nm2 * nw, nm2 * 1.1, -nm2 * 0.04], [nl * 0.95, nr1 * 0.95 * nw, nr1 * 1.02, 0], [nl + nr1 * 0.25, nr1 * 0.75, nr1 * 0.8, 0]],
      { rings: clamp(Math.round(nl * 10), 8, 22), seg: Math.max(8, nk.seg || 8), cap0: true, cap1: true }, ncol);
    if (nk.extra) nk.extra(g, sex);
    P.neck = g.build();
  }
  g = B(); spec.head(g, sex); P.head = g.build();
  if (spec.ears) { g = B(); spec.ears(g, sex); P.ears = g.build(-spec.earAt[0], -spec.earAt[1], -spec.earAt[2]); }
  if (spec.earsLR) { P.earL = spec.earsLR(false); P.earR = spec.earsLR(true); }
  P.legF = legPieces(spec, true); P.legH = legPieces(spec, false);
  P.tail = tailGeos(spec);
  if (spec.wings) { P.wingL = spec.wings(false, sex); P.wingR = spec.wings(true, sex); }
  if (spec.trunk) {
    var tr = spec.trunk; P.trunk = [];
    for (var i = 0; i < tr.n; i++) {
      var gg = B(), r0 = lerp(tr.r0, tr.r1, i / tr.n), r1 = lerp(tr.r0, tr.r1, (i + 1) / tr.n), sl = tr.len / tr.n, tc = tr.col, tk = [[-r0 * 0.5, r0 * 0.7, r0 * 0.7, 0]], m = 6, j;
      for (j = 0; j <= m; j++) tk.push([sl * 1.06 * j / m, lerp(r0, r1, j / m) * (j % 2 ? 0.94 : 1.03), lerp(r0, r1, j / m) * (j % 2 ? 0.94 : 1.03), 0]);
      if (i === tr.n - 1) { tk.push([sl * 1.06 + r1 * 0.4, r1 * 1.25, r1 * 1.1, 0]); tk.push([sl * 1.06 + r1 * 0.75, r1 * 0.9, r1 * 0.75, 0]); } else tk.push([sl * 1.06 + r1 * 0.4, r1 * 0.7, r1 * 0.7, 0]);
      var endSeg = i === tr.n - 1;
      gg.loft(tk, { down: true, rings: m * 2 + 4, seg: 9, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) {
        var w = fract(zc / sl * m * 0.5 + 0.25) < 0.5 ? 1 : 0.86;
        return shade(endSeg && zc > sl * 1.06 + r1 * 0.2 ? shade(tc, 0.8) : tc, w * (ca < -0.3 ? 0.95 : 1));
      });
      P.trunk.push(gg.build());
    }
  }
  if (spec.bodyGlow) {
    P.bodyGlow = spec.bodyGlow.map(function (it) {
      var bg = B(); it.build(bg, sex);
      return { geo: bg.build(0, -cy, 0), col: it.col, em: it.em };
    });
  }
  if (spec.headGlow) {
    P.headGlow = spec.headGlow.map(function (it) {
      var hg = B(); it.build(hg, sex);
      return { geo: hg.build(), col: it.col, em: it.em };
    });
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
  if (P.bodyGlow) for (var bg = 0; bg < P.bodyGlow.length; bg++) torso.add(mesh(P.bodyGlow[bg].geo, mat(P.bodyGlow[bg].col, { emissive: P.bodyGlow[bg].em })));
  var nk = spec.neck, neckP = grp('neck'); neckP.rotation.order = 'YXZ';
  torso.add(neckP); neckP.position.set(nk.x || 0, nk.y - spec.cy, nk.z);
  if (P.neck) neckP.add(mesh(P.neck));
  var headP = grp('head'); headP.rotation.order = 'YXZ'; neckP.add(headP); headP.position.set(0, 0, nk.len);
  var headM = mesh(P.head); headP.add(headM);
  if (P.headGlow) for (var hg = 0; hg < P.headGlow.length; hg++) headP.add(mesh(P.headGlow[hg].geo, mat(P.headGlow[hg].col, { emissive: P.headGlow[hg].em })));
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
  var wings = null;
  if (P.wingL && spec.wingAt) {
    wings = [];
    for (var w = 0; w < 2; w++) {
      var wp = grp(w ? 'rWing' : 'lWing'); wp.rotation.order = 'YXZ';
      wp.position.set(w ? -spec.wingAt[0] : spec.wingAt[0], spec.wingAt[1] - spec.cy, spec.wingAt[2]);
      torso.add(wp); wp.add(mesh(w ? P.wingR : P.wingL)); wings.push(wp);
    }
  }
  var I = {
    sp: spec, root: root, rig: rig, torso: torso, bodyM: bodyM, neckP: neckP, headP: headP, earM: earM, earL: earL, earR: earR, trunk: trunk,
    hips: hips, knees: knees, tails: tails, wings: wings, sc: sc, baby: baby, t: Math.random() * 100, phase: 0, seed: Math.random() * 6.28,
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
  if (I.wings) {
    var airborne = (ent && ((ent.flyAlt && ent.flyAlt > 0.05) || ent.flyover)) ? 1 : 0;
    var flyA = Math.max(rw, W.play, airborne);
    var wz = lerp(-0.38 + 0.03 * breathe, 0.25 + 0.58 * sin(t * 11 + I.seed), flyA);
    wz = lerp(wz, -0.08 + 0.16 * sin(ph * 2), gw * (1 - flyA) * 0.75);
    wz = lerp(wz, -0.62, W.sleep);
    var wy = lerp(0.38, 0.06, flyA);
    I.wings[0].rotation.set(-0.15, wy, wz);
    I.wings[1].rotation.set(-0.15, -wy, -wz);
  }
}

// ================================================================ QUADRUPED SPECIES
function earCone(g, x, y, z, r, h, tilt, col, inner) {
  var s = x < 0 ? -1 : 1, rot = [0, 0, -s * tilt];
  g.cyl(r * 0.18, r, h, x, y, z, col, { seg: 6, sz: 0.5, rot: rot });
  if (inner) g.cyl(r * 0.12, r * 0.62, h * 0.82, x, y - h * 0.03, z + r * 0.2, inner, { seg: 6, sz: 0.4, rot: rot });
}
function earBall(g, x, y, z, r, col, inner) {
  var rot = [0, x < 0 ? 0.5 : -0.5, 0];
  g.sph(r, r * 1.05, r * 0.4, x, y, z - r * 0.05, col, { s: [7, 5], rot: rot });
  g.sph(r * 0.88, r * 0.93, r * 0.3, x, y, z + r * 0.12, shade(col, 0.82), { s: [7, 5], rot: rot });
  if (inner) g.sph(r * 0.62, r * 0.68, r * 0.22, x * 0.98, y - r * 0.04, z + r * 0.24, inner, { s: [6, 4], rot: rot });
}
// ---- ZEBRA
(function () {
  var W = 0xf3f1ea, K = 0x1d1d22;
  var sf = function (x, y, z, nx, ny) { return (ny < -0.55 && y < 0.95) ? 0xe8e6de : (fract((z + 0.35 * y) * 5.5) < 0.5 ? K : W); };
  QUADS.zebra = {
    id: 'zebra', cy: 1.1, hl: 0.95, hh: 0.4, height: 1.95, size: 1.4, walkA: 0.4, runA: 0.65,
    body: function (g) { g.torso({ z0: -1.0, z1: 0.95, n: 20, seg: 14, rxA: 0.36, rxB: 0.34, ryA: 0.4, ryB: 0.42, ycA: 1.1, ycB: 1.12 }, sf); },
    neck: { y: 1.3, z: 0.72, len: 0.66, up: 0.92, r0: 0.2, r1: 0.125, hs: 6, col: function (x, y, z) { return fract(z * 5 + y * 1.5) < 0.5 ? K : W; },
      extra: function (g) {
        var mn = function (zc) { return fract(zc * 6.5) < 0.5 ? K : W; };
        g.loft([[0.0, 0.035, 0.07, 0.205], [0.15, 0.038, 0.08, 0.21], [0.33, 0.032, 0.08, 0.175], [0.5, 0.03, 0.07, 0.15], [0.66, 0.025, 0.05, 0.12]], { rings: 12, seg: 6, cap0: true, cap1: true }, function (zc) { return mn(zc); });
        for (var mi = 0; mi < 9; mi++) { var mz = 0.04 + mi * 0.07, mt = 0.27 - mi * 0.016; g.cone(0.03, 0.07, 0, mt + 0.01, mz, mn(mz), { seg: 4, rot: [-0.45, 0, 0] }); }
      } },
    hpitch: 0.95, eatY: 0.2,
    head: function (g) {
      var hc = function (x, y, z) { return z > 0.4 ? 0x2a2326 : (fract(y * 8 + z * 5) < 0.5 ? K : W); };
      g.loft([[-0.08, 0.1, 0.13, 0.02], [0.1, 0.12, 0.155, 0.0], [0.26, 0.09, 0.11, -0.05], [0.4, 0.074, 0.088, -0.078], [0.5, 0.064, 0.072, -0.085], [0.54, 0.05, 0.055, -0.09]], { rings: 12, seg: 10, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z); });
      g.sph(0.085, 0.085, 0.1, 0.0, -0.07, 0.04, function (x, y, z) { return fract(y * 8 + z * 5) < 0.5 ? K : W; }, { s: [8, 6] }); // jowls and jaw line
      g.sph(0.066, 0.056, 0.07, 0, -0.095, 0.47, 0x2a2326, { s: [7, 5] });
      for (var nx = -1; nx <= 1; nx += 2) {
        g.sph(0.017, 0.026, 0.014, nx * 0.04, -0.075, 0.535, 0x0e0a0c, { s: [5, 4], rot: [0, 0, nx * 0.4] });
        g.sph(0.011, 0.014, 0.05, nx * 0.062, -0.1, 0.45, 0x1c1618, { s: [4, 3] });
      }
      g.limb(0, 0.15, 0.06, 0, 0.1, 0.17, 0.025, 0.012, K, { seg: 5 }); // forelock
      g.limb(0.012, 0.15, 0.05, 0.02, 0.105, 0.15, 0.015, 0.008, W, { seg: 4 });
      eyePair(g, 0.1, 0.07, 0.17, 0.028);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earCone(g, 0.075, 0.2, 0.0, 0.05, 0.17, 0.15, K, 0xf0b8b8); earCone(g, -0.075, 0.2, 0.0, 0.05, 0.17, 0.15, K, 0xf0b8b8); },
    legs: { fx: 0.17, fy: 0.84, fz: 0.5, hy: 0.86, hz: -0.6, hx: 0.18, fLen: 0.84, hLen: 0.86, fr: [0.085, 0.06, 0.045], hr: [0.1, 0.065, 0.045], haunch: [0.15, 0.22, 0.2],
      hs: 8, col: function (y, ny, front, x, z) { return y > -0.3 ? (fract((z + (front ? 0.5 : -0.6) + 0.35 * (y + 0.3)) * 5.5) < 0.5 ? K : W) : ((y > -0.78 && fract(y * 8) < 0.5) ? K : (y > -0.78 ? W : (y > -0.82 ? W : K))); }, foot: { type: 'hoof', col: 0x2a2a2a, h: 0.07 } },
    tail: { y: 1.14, z: -0.92, n: 2, len: 0.8, r0: 0.04, r1: 0.03, col: K, up: -1.0, curl: -0.15, tip: function (g, sl) { tuft(g, -sl * 0.9, 0.05, 0.13, K); } },
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
    return mixHex(CR, shade(BR, 0.85 + id * 0.35), clamp((Math.sqrt(d2) - Math.sqrt(d1) - line * 0.3) / 0.16, 0, 1));
  };
  var pat = function (x, y, z, nx, ny) { return ny < -0.6 ? CR : cells(x, y, z, 2.6, 0.2); };
  QUADS.giraffe = {
    id: 'giraffe', cy: 2.3, hl: 1.0, hh: 0.5, height: 5.1, size: 3.0, walkA: 0.3, runA: 0.5, reach: 0.5, eatY: 0.45, sexed: false, hopH: 1.5, bend: 0.5,
    body: function (g) {
      g.loft([[-1.0, 0.04, 0.06, 2.18], [-0.96, 0.12, 0.16, 2.18], [-0.8, 0.3, 0.38, 2.26], [-0.5, 0.36, 0.46, 2.3], [-0.1, 0.34, 0.5, 2.31], [0.35, 0.4, 0.58, 2.4], [0.7, 0.42, 0.64, 2.46], [0.92, 0.3, 0.46, 2.52], [0.98, 0.16, 0.24, 2.56], [1.01, 0.05, 0.08, 2.56]],
        { rings: 36, seg: 20, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return pat(x, y, z, sa, ca); });
    },
    neck: { y: 2.72, z: 0.78, len: 2.35, up: 1.15, r0: 0.3, r1: 0.15, seg: 8, hs: 8, col: function (x, y, z, nx, ny) { return cells(x * 1.0, y, z * 0.8, 2.6, 0.22); },
      extra: function (g) {
        g.loft([[0.0, 0.03, 0.06, 0.31], [0.6, 0.03, 0.065, 0.25], [1.2, 0.028, 0.06, 0.19], [1.8, 0.025, 0.055, 0.165], [2.3, 0.02, 0.045, 0.135]], { rings: 12, seg: 6, cap0: true, cap1: true }, function (zc) { return fract(zc * 7) < 0.5 ? 0x6b4318 : 0x4a2e12; });
      } },
    hpitch: 0.55,
    head: function (g) {
      var HT = mixHex(TAN, BR, 0.18), hc = function (x, y, z, nx, ny) {
        if (z > 0.5) return ny < 0.5 ? 0x8a6a58 : 0x7a5a48;
        if (z > 0.36 && ny < -0.3) return 0xe6c898;
        return ny < -0.55 ? CR : (y > 0.03 && z < 0.22 && fract(x * 11 + z * 5) < 0.14 ? shade(BR, 1.1) : HT);
      };
      g.loft([[-0.1, 0.1, 0.12, 0.03], [0.06, 0.13, 0.155, 0.0], [0.2, 0.1, 0.12, -0.035], [0.34, 0.082, 0.09, -0.07], [0.48, 0.08, 0.078, -0.088], [0.56, 0.072, 0.066, -0.09], [0.6, 0.05, 0.045, -0.09]],
        { rings: 14, seg: 10, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      eyePair(g, 0.13, 0.07, 0.17, 0.035);
      for (var s = -1; s <= 1; s += 2) {
        g.tube([[s * 0.07, 0.1, 0.0], [s * 0.074, 0.22, -0.01], [s * 0.07, 0.33, -0.04], [s * 0.068, 0.4, -0.05]], [0.036, 0.029, 0.026, 0.046, 0.004], function (x, y, z, nx, ny, nz, t) { return t > 0.7 ? 0x3a2410 : TAN; }, { seg: 6, steps: 3 });
        g.sph(0.016, 0.012, 0.022, s * 0.032, 0.0, 0.575, 0x2a1c18, { s: [4, 3] });
      }
    },
    earAt: [0, 0.1, -0.02], ears: function (g) {
      var ep = [[0, 0], [0.11, 0.05], [0.22, 0.02], [0.12, -0.045]];
      g.extrude(ep, 0.03, 0.11, 0.1, -0.02, [0.15, -0.25, 0.18], TAN, { axis: 'z', bev: 0.008, curveX: -0.35 });
      g.extrude(ep.map(function (p) { return [-p[0], p[1]]; }), 0.03, -0.11, 0.1, -0.02, [0.15, 0.25, -0.18], TAN, { axis: 'z', bev: 0.008, curveX: -0.35 });
    },
    legs: { hs: 6, fx: 0.2, fy: 1.75, fz: 0.52, hy: 1.7, hz: -0.58, hx: 0.21, fLen: 1.75, hLen: 1.7, fr: [0.125, 0.085, 0.065], hr: [0.14, 0.085, 0.065], haunch: [0.2, 0.34, 0.25],
      col: function (y, ny) { return y < -0.9 ? (fract(y * 4) < 0.1 ? 0xb88c48 : 0xefd9a0) : cells(0, y, 0.0, 3.4, 0.2); }, foot: { type: 'hoof', col: 0x3a2e24, h: 0.09 }, kf: 0.5 },
    tail: { y: 2.3, z: -0.9, n: 2, len: 1.2, r0: 0.045, r1: 0.03, col: TAN, up: -1.2, curl: 0.0, tip: function (g, sl) { tuft(g, -sl * 0.9, 0.05, 0.16, 0x3a2a1a); } },
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
      g.loft([[-0.88, 0.12, 0.15, 0.85], [-0.55, 0.3, 0.34, 0.86], [-0.1, 0.27, 0.31, 0.83], [0.35, 0.35, 0.4, 0.92], [0.76, 0.28, 0.33, 0.96], [0.9, 0.15, 0.18, 0.98]], { rings: 16, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
      if (sex !== 'f') {
        var mc0 = function (x, y, z) { return hash3(Math.floor(x * 9), Math.floor(y * 9), Math.floor(z * 9)) > 0.5 ? MANE : MANE2; };
        g.loft([[0.18, 0.32, 0.34, 0.9], [0.46, 0.44, 0.47, 0.92], [0.74, 0.4, 0.42, 0.96], [0.88, 0.25, 0.26, 0.98]], { rings: 8, seg: 12, ridge: 0.16, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return mc0(x, y, z); });
      }
    },
    neck: { y: 1.02, z: 0.62, len: 0.3, up: 0.5, r0: 0.22, r1: 0.19, col: TAN },
    hpitch: 0.25, eatY: 0.2,
    head: function (g, sex) {
      var lion = sex !== 'f';
      g.loft([[-0.08, 0.16, 0.16, 0.01], [0.1, 0.19, 0.18, 0.0], [0.26, 0.115, 0.105, -0.055], [0.39, 0.088, 0.075, -0.068], [0.44, 0.07, 0.06, -0.07]], { rings: 10, seg: 10, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return z > 0.2 ? (ca < 0.1 ? LT : TAN) : TAN; });
      g.sph(0.058, 0.04, 0.045, 0, -0.012, 0.425, 0x3a2220, { s: [6, 4] }); // nose pad
      g.sph(0.052, 0.048, 0.07, 0.042, -0.075, 0.33, LT, { s: [6, 4] }); g.sph(0.052, 0.048, 0.07, -0.042, -0.075, 0.33, LT, { s: [6, 4] }); // whisker pads
      g.sph(0.05, 0.034, 0.06, 0, -0.115, 0.3, LT, { s: [6, 4] });
      g.limb(0, -0.07, 0.4, 0, -0.1, 0.33, 0.007, 0.007, 0x3a2220, { seg: 4 });
      g.sph(0.04, 0.012, 0.012, 0.05, 0.0, 0.17, 0x5a3a1c, { s: [4, 3] }); g.sph(0.04, 0.012, 0.012, -0.05, 0.0, 0.17, 0x5a3a1c, { s: [4, 3] }); // brow
      eyePair(g, 0.1, 0.055, 0.2, 0.026, 0x4a2a08);
      if (lion) {
        var mc = function (x, y, z) { var h = hash3(Math.floor(x * 14), Math.floor(y * 14), Math.floor(z * 14)); return h > 0.7 ? 0x8a5a2a : (h > 0.35 ? MANE : MANE2); };
        g.loft([[-0.3, 0.3, 0.32, -0.05], [-0.14, 0.43, 0.45, -0.05], [-0.02, 0.42, 0.44, -0.05], [0.05, 0.36, 0.37, -0.04], [0.1, 0.27, 0.27, -0.04], [0.12, 0.21, 0.21, -0.04]], { rings: 9, seg: 14, cap0: true, cap1: true, superPow: 0.9 }, function (zc, ca, sa, x, y, z) { return mc(x, y, z); });
        var ml;
        for (ml = 0; ml < 22; ml++) {
          var ma = ml / 22 * TAU + (ml % 2) * 0.1, ca2 = Math.cos(ma), sa2 = Math.sin(ma), ri = 0.36 + (ml % 3) * 0.015, ro = ri + 0.075;
          g.limb(ca2 * ri, -0.05 + sa2 * ri * 1.03, 0.04, ca2 * ro, -0.05 + sa2 * ro * 1.03, -0.2 - (ml % 2) * 0.05, 0.065, 0.018, ml % 2 ? MANE : MANE2, { seg: 4 });
        }
        g.sph(0.2, 0.2, 0.16, 0, -0.27, 0.0, MANE2, { s: [7, 5] }); // chest ruff under jaw
        g.sph(0.14, 0.14, 0.12, 0, -0.3, 0.08, MANE, { s: [6, 5] });
      }
    },
    earAt: [0, 0.1, 0.0], ears: function (g, sex) { var d = sex !== 'f' ? 0.01 : 0; earBall(g, 0.14, 0.17 + d, 0.0, 0.065, TAN, 0xd9a0a0); earBall(g, -0.14, 0.17 + d, 0.0, 0.065, TAN, 0xd9a0a0); },
    legs: { fx: 0.14, fy: 0.62, fz: 0.46, hy: 0.6, hz: -0.55, hx: 0.15, fLen: 0.62, hLen: 0.6, fr: [0.1, 0.075, 0.065], hr: [0.11, 0.075, 0.065], haunch: [0.13, 0.17, 0.2],
      col: function (y, ny) { return y < -0.45 ? LT : TAN; }, foot: { type: 'paw', col: 0x222222, h: 0.07, pawCol: LT } },
    tail: { y: 0.86, z: -0.8, n: 3, len: 0.95, r0: 0.05, r1: 0.035, col: TAN, up: -0.7, curl: 0.2, tip: function (g, sl) { tuft(g, -sl * 0.9, 0.07, 0.15, MANE2); } },
    fold: { roll: 0.15, hp: 0.6, hy: 0.9 }
  };
})();

// ---- TIGER
(function () {
  var OR = 0xe5842a, OL = 0xf0a350, WH = 0xf4efe4, K = 0x1c1614;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.45) return WH;
    var yy = y - 0.84, side = x > 0 ? 1 : -1;
    var v = z * 6.5 - yy * 1.0 + sin(yy * 6 + z * 3 + side) * 0.18;
    var th = clamp(0.4 + yy * 0.35, 0.12, 0.42) * (0.65 + hash3(Math.floor(v), side, 1) * 0.7);
    var base = ny < -0.15 ? mixHex(OR, WH, 0.5) : (yy < -0.12 ? OL : OR);
    return fract(v) < th ? K : base;
  };
  QUADS.tiger = {
    id: 'tiger', cy: 0.82, hl: 0.9, hh: 0.33, height: 1.4, size: 1.0, walkA: 0.45, runA: 0.8, bend: 0.9,
    body: function (g) {
      g.loft([[-1.0, 0.03, 0.04, 0.8], [-0.95, 0.1, 0.13, 0.8], [-0.82, 0.24, 0.29, 0.83], [-0.55, 0.31, 0.35, 0.85], [-0.1, 0.26, 0.31, 0.8], [0.3, 0.29, 0.36, 0.84], [0.62, 0.31, 0.39, 0.88], [0.84, 0.24, 0.3, 0.88], [0.93, 0.14, 0.18, 0.89], [0.97, 0.03, 0.04, 0.89]],
        { rings: 30, seg: 18, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neck: { y: 0.96, z: 0.66, len: 0.28, up: 0.45, r0: 0.21, r1: 0.19, hs: 3, col: function (x, y, z, nx, ny) { return ny < -0.4 ? WH : (fract(z * 12 + x * 3) < 0.3 ? K : OR); } },
    hpitch: 0.3, eatY: 0.2,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        var ax = abs(x);
        if (z > 0.3) return (ny < 0.4 || y < -0.03) ? WH : (fract(ax * 30) < 0.2 ? K : OR);
        if (y < -0.045 && z > 0.08) return WH;
        if (z > 0.17 && ax > 0.05 && y > 0.0) return mixHex(OR, WH, 0.35);
        if (y > 0.04 && z < 0.2) return fract(ax * 17 + z * 2) < 0.3 ? K : OR;
        return fract(z * 15 + ax * 5 + y * 3) < 0.28 ? K : (y < 0 ? OL : OR);
      };
      g.loft([[-0.12, 0.14, 0.14, 0.02], [0.02, 0.2, 0.18, 0.0], [0.14, 0.21, 0.175, -0.01], [0.23, 0.15, 0.115, -0.04], [0.3, 0.12, 0.09, -0.055], [0.36, 0.1, 0.075, -0.06], [0.4, 0.07, 0.055, -0.058]],
        { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.048, 0.03, 0.026, 0, -0.025, 0.4, 0xd68a8a, { s: [6, 4] });
      for (var s = -1; s <= 1; s += 2) {
        for (var r = 0; r < 3; r++) g.cone(0.065 - r * 0.012, 0.2 - r * 0.03, s * 0.15, -0.065 - r * 0.025, 0.06 - r * 0.045, WH, { seg: 5, rot: [0.2, 0, -s * (1.25 + r * 0.12)] });
        g.sph(0.012, 0.008, 0.008, s * 0.03, 0.0, 0.365, K, { s: [3, 3] });
      }
      eyePair(g, 0.125, 0.055, 0.19, 0.026, 0xc8a020);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earBall(g, 0.13, 0.19, -0.01, 0.07, K, 0xe8d8c8); earBall(g, -0.13, 0.19, -0.01, 0.07, K, 0xe8d8c8); },
    legs: { hs: 4, fx: 0.13, fy: 0.62, fz: 0.47, hy: 0.6, hz: -0.58, hx: 0.14, fLen: 0.62, hLen: 0.6, fr: [0.095, 0.07, 0.06], hr: [0.11, 0.07, 0.06], haunch: [0.13, 0.17, 0.2],
      col: function (y, ny) { return y < -0.5 ? WH : (fract(y * 10) < 0.3 ? K : OR); }, foot: { type: 'paw', col: 0x222222, h: 0.07, pawCol: WH } },
    tail: { y: 0.84, z: -0.82, n: 3, len: 1.0, r0: 0.05, r1: 0.04, hs: 4, col: function (i, x, y, z) { return fract(-z * 9 + i * 0.4) < 0.3 ? K : OR; }, up: -0.6, curl: 0.15, tip: function (g, sl) { tuft(g, -sl, 0.045, 0.08, K); } },
    fold: { roll: 0.1, hp: 0.6, hy: 0.9 }
  };
})();

// ---- ELEPHANT
(function () {
  var GR = 0x8e8f9a, GL = 0xa4a5b0, GD = 0x75767f, IV = 0xf3ecd8, PK = 0xb09a9c;
  var skin = function (x, y, z, ny) {
    var n = hash3(Math.floor(x * 7), Math.floor(y * 7), Math.floor(z * 7));
    var c = n > 0.78 ? GD : GR;
    if (fract(z * 7.5 + sin(y * 3 + x * 2) * 0.35) < 0.1) c = shade(c, 0.86);
    return ny < -0.5 ? shade(c, 1.07) : c;
  };
  var bodyKeys = [[-1.98, 0.06, 0.08, 2.3], [-1.9, 0.3, 0.4, 2.3], [-1.55, 0.78, 0.82, 2.38], [-1.0, 0.98, 1.0, 2.4], [-0.2, 1.0, 1.0, 2.38], [0.6, 1.04, 1.12, 2.5], [1.2, 0.96, 1.1, 2.62], [1.62, 0.62, 0.72, 2.7], [1.8, 0.4, 0.5, 2.72], [1.88, 0.2, 0.25, 2.72]];
  var keys = [];
  for (var i = 0; i < 19; i++) {
    var s = -1.98 + i * 0.215, j = 0;
    while (j < bodyKeys.length - 2 && bodyKeys[j + 1][0] < s) j++;
    var a = bodyKeys[j], b = bodyKeys[j + 1], t = clamp((s - a[0]) / (b[0] - a[0]), 0, 1), f = (i > 1 && i < 17) ? 1 + 0.022 * (i % 2 ? -1 : 1) : 1;
    keys.push([s, lerp(a[1], b[1], t) * f, lerp(a[2], b[2], t) * f, lerp(a[3], b[3], t)]);
  }
  QUADS.elephant = {
    id: 'elephant', cy: 2.45, hl: 1.9, hh: 1.0, height: 4.0, size: 3.0, walkA: 0.3, runA: 0.45, bend: 0.25, babyScale: 0.42, babyHead: 1.35, hopH: 1.4, eatNA: 0.0, eatTP: 0.0, eatHP: 0.3,
    body: function (g) {
      g.loft(keys, { rings: 30, seg: 16, cap0: true, cap1: true, superPow: 0.92 }, function (zc, ca, sa, x, y, z) { return skin(x, y, z, ca); });
    },
    neck: { y: 2.85, z: 1.45, len: 0.35, up: 0.0, r0: 0.6, r1: 0.55, col: GR },
    hpitch: 0.1, eatY: 0.5,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        var c = skin(x, y, z, ny);
        if (z > 0.3 && z < 0.7 && y > 0.0 && fract(y * 10 + abs(x) * 2) < 0.1) c = GD;
        return c;
      };
      g.loft([[-0.25, 0.4, 0.5, 0.1], [0.0, 0.52, 0.64, 0.24], [0.3, 0.5, 0.62, 0.16], [0.58, 0.4, 0.46, 0.02], [0.8, 0.3, 0.34, -0.1], [0.88, 0.26, 0.28, -0.14]],
        { rings: 14, seg: 14, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      for (var s = -1; s <= 1; s += 2) {
        g.sph(0.07, 0.05, 0.06, s * 0.36, 0.14, 0.58, GD, { s: [6, 4] });
        g.tube([[s * 0.26, -0.26, 0.7], [s * 0.35, -0.66, 1.0], [s * 0.37, -0.78, 1.38], [s * 0.32, -0.64, 1.7]], [0.095, 0.075, 0.05, 0.026, 0.006], function (x, y, z, nx, ny, nz, t) { return t < 0.12 ? 0xcfc4a4 : (t > 0.85 ? 0xd8cfb4 : IV); }, { seg: 8, steps: 3 });
      }
      eyePair(g, 0.4, 0.1, 0.56, 0.04, 0x1a1210);
    },
    trunk: { n: 4, len: 2.2, r0: 0.38, r1: 0.12, at: [0, -0.12, 0.84], col: GR, idle: [0.15, -0.1, -0.3, -0.5], eat: [-1.1, -0.9, -0.7, -0.6], slp: [0.3, 0.1, -0.2, -0.5] },
    earPivot: [0.5, 0.3, 0.08], earFlare: 0.35, earFlap: 0.4,
    earsLR: function (r) {
      var g = B(), s = r ? -1 : 1;
      g.loft([[0.0, 0.4, 0.1, 0.0], [0.1, 0.62, 0.085, 0.01], [0.3, 0.72, 0.065, 0.03], [0.55, 0.63, 0.045, 0.06], [0.78, 0.41, 0.03, 0.1], [0.93, 0.17, 0.02, 0.13], [1.0, 0.02, 0.012, 0.14]],
        { down: true, ox: s * 0.3, oy: 0.1, rings: 22, seg: 20, cap0: true, cap1: true },
        function (zc, ca, sa, x, y, z) {
          var inner = ca < 0;
          if (inner) return mixHex(PK, GR, clamp(0.85 - zc * 0.5 - fract(z * 7 + y * 4) * 0.2, 0, 1) * (1 - zc * 0.3));
          return fract(y * 8 + z * 2) < 0.12 ? GD : (zc > 0.85 ? GD : GR);
        });
      var geo = g.build();
      geo.rotateY(s * PI / 2);
      return geo;
    },
    legs: { fx: 0.55, fy: 1.5, fz: 1.0, hy: 1.5, hz: -1.15, hx: 0.55, fLen: 1.5, hLen: 1.5, fr: [0.36, 0.31, 0.29], hr: [0.38, 0.31, 0.29], two: true, kf: 0.54, col: function (y, ny, front, x, z) { return skin(x || 0, y, z || 0, ny); },
      foot: { type: 'foot', col: 0xe0dac8, h: 0.14, base: GD } },
    tail: { y: 2.25, z: -1.85, n: 2, len: 1.3, r0: 0.06, r1: 0.04, col: GR, up: -1.3, curl: -0.1, tip: function (g, sl) { tuft(g, -sl * 0.9, 0.04, 0.12, 0x333338); } },
    fold: { fa: -0.5, ha: -0.5, fb: 0, hb: 0, splay: 1.25, hp: 0.7, hy: 0.0, na: 0, lieY: 1.15 }
  };
})();

// ---- RHINO
(function () {
  var GR = 0x8f8c86, GD = 0x74716c;
  var skin = function (x, y, z) {
    var c = hash3(Math.floor(x * 6), Math.floor(y * 6), Math.floor(z * 6)) > 0.82 ? GD : GR;
    if (fract(y * 9 + z * 2 + sin(z * 5) * 0.4) < 0.08) c = shade(c, 0.88);
    return c;
  };
  var hornCol = function (x, y, z, nx, ny, nz, t) { return t < 0.18 ? mixHex(0x6e6454, 0xb8ab8a, t / 0.18) : mixHex(0xb8ab8a, 0xe8e0c6, clamp((t - 0.18) / 0.6, 0, 1)); };
  QUADS.rhino = {
    id: 'rhino', cy: 1.3, hl: 1.45, hh: 0.7, height: 1.95, size: 1.7, walkA: 0.35, runA: 0.55, bend: 0.3, babyScale: 0.48, babyHead: 1.4,
    body: function (g) {
      g.loft([[-1.5, 0.05, 0.07, 1.24], [-1.42, 0.25, 0.32, 1.24], [-1.15, 0.58, 0.62, 1.28], [-0.82, 0.68, 0.72, 1.29], [-0.57, 0.72, 0.75, 1.29], [-0.47, 0.66, 0.69, 1.27], [-0.36, 0.69, 0.73, 1.28], [0.0, 0.67, 0.71, 1.28], [0.3, 0.72, 0.78, 1.36], [0.46, 0.74, 0.83, 1.4], [0.57, 0.67, 0.75, 1.37], [0.7, 0.7, 0.77, 1.38], [1.0, 0.64, 0.73, 1.36], [1.34, 0.4, 0.46, 1.32], [1.42, 0.12, 0.14, 1.32]],
        { rings: 26, seg: 16, cap0: true, cap1: true, superPow: 0.9 },
        function (zc, ca, sa, x, y, z) { return (abs(z - 0.55) < 0.05 || abs(z + 0.47) < 0.05) ? shade(GD, 0.85) : skin(x, y, z); });
    },
    neck: { y: 1.3, z: 1.1, len: 0.5, up: -0.05, r0: 0.42, r1: 0.36, col: function (x, y, z) { return skin(x, y, z); } },
    hpitch: 0.5, eatY: 0.2, eatHP: 0.9, eatNA: -0.7,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return z > 0.9 ? GD : (z > 0.78 && ny < -0.3 ? shade(GR, 1.1) : skin(x, y, z)); };
      g.loft([[-0.12, 0.24, 0.27, 0.04], [0.15, 0.3, 0.33, 0.02], [0.4, 0.26, 0.28, -0.04], [0.62, 0.22, 0.22, -0.1], [0.85, 0.19, 0.15, -0.17], [0.97, 0.18, 0.12, -0.19], [1.04, 0.15, 0.09, -0.19], [1.08, 0.08, 0.05, -0.19]],
        { rings: 14, seg: 12, cap0: true, cap1: true, superPow: 0.88 }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.tube([[0, -0.02, 0.74], [0, 0.18, 0.82], [0, 0.44, 0.84], [0, 0.72, 0.76]], [0.16, 0.12, 0.075, 0.035, 0.006], hornCol, { seg: 10, steps: 3 });
      g.tube([[0, 0.1, 0.4], [0, 0.26, 0.43], [0, 0.42, 0.4]], [0.1, 0.065, 0.01], hornCol, { seg: 8, steps: 2 });
      g.tube([[-0.16, -0.14, 1.08], [0, -0.15, 1.1], [0.16, -0.14, 1.08]], 0.012, 0x2e2c2a, { seg: 5, steps: 2 });
      for (var s = -1; s <= 1; s += 2) g.sph(0.03, 0.02, 0.035, s * 0.09, -0.04, 1.03, 0x2a2826, { s: [4, 3] });
      eyePair(g, 0.27, 0.1, 0.3, 0.026);
    },
    earAt: [0, 0.2, 0.0], ears: function (g) { earCone(g, 0.19, 0.3, 0.0, 0.1, 0.28, 0.35, GR, 0xc9a8a0); earCone(g, -0.19, 0.3, 0.0, 0.1, 0.28, 0.35, GR, 0xc9a8a0); },
    legs: { fx: 0.4, fy: 0.78, fz: 0.62, hy: 0.78, hz: -0.7, hx: 0.42, fLen: 0.78, hLen: 0.78, fr: [0.23, 0.2, 0.19], hr: [0.25, 0.21, 0.19], two: true, kf: 0.52, col: function (y) { return y < -0.55 ? GD : GR; },
      foot: { type: 'toes', col: 0x4a4844, h: 0.09 }, bend: 0.3 },
    tail: { y: 1.25, z: -1.4, n: 2, len: 0.75, r0: 0.05, r1: 0.03, col: GD, up: -1.2, tip: function (g, sl) { tuft(g, -sl * 0.9, 0.035, 0.07, 0x333333); } },
    fold: { fa: -0.4, ha: -0.4, splay: 1.2, hp: 0.9, hy: 0.4, na: -0.2 }
  };
})();

// ---- HIPPO
(function () {
  var GR = 0x8b8094, PK = 0xd9a0a6, GD = 0x70667a, BP = 0xc29aa4;
  var skin = function (x, y, z, ny) {
    var c = mixHex(GR, 0xb89aa6, clamp(0.25 - ny, 0, 1) * 0.8);
    if (fract(z * 5 + sin(y * 4 + x * 2) * 0.3) < 0.07) c = shade(c, 0.86);
    return hash3(Math.floor(x * 9), Math.floor(y * 9), Math.floor(z * 9)) > 0.85 ? shade(c, 0.93) : c;
  };
  QUADS.hippo = {
    id: 'hippo', cy: 1.0, hl: 1.5, hh: 0.75, height: 1.9, size: 1.5, walkA: 0.35, runA: 0.5, bend: 0.3, babyScale: 0.45, babyHead: 1.3, swimDrop: 1.15,
    body: function (g) {
      g.loft([[-1.55, 0.06, 0.07, 1.02], [-1.46, 0.3, 0.33, 1.02], [-1.2, 0.68, 0.64, 1.0], [-0.6, 0.84, 0.76, 0.98], [0.2, 0.86, 0.78, 0.98], [0.95, 0.8, 0.74, 1.02], [1.3, 0.55, 0.55, 1.04], [1.42, 0.4, 0.42, 1.05], [1.48, 0.12, 0.12, 1.05]],
        { rings: 26, seg: 18, cap0: true, cap1: true, superPow: 0.84, flatBot: 0.32 }, function (zc, ca, sa, x, y, z) { return skin(x, y, z, ca); });
    },
    neck: { y: 1.05, z: 1.15, len: 0.25, up: 0.0, r0: 0.55, r1: 0.5, col: function (x, y, z, nx, ny) { return skin(x, y, z, ny); } },
    hpitch: 0.12, eatY: 0.2, eatNA: -0.4, eatHP: 0.6,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        if (z > 0.62 && ny > 0.2 && hash3(Math.floor(x * 22), Math.floor(z * 22), 3) > 0.9) return 0x6a5a68;
        if (z > 0.55 && ny < -0.1) return BP;
        return y < -0.2 ? BP : skin(x, y, z, ny);
      };
      g.loft([[-0.15, 0.42, 0.4, 0.04], [0.22, 0.52, 0.45, 0.02], [0.64, 0.53, 0.29, -0.08], [0.98, 0.5, 0.25, -0.1], [1.1, 0.4, 0.2, -0.11], [1.16, 0.26, 0.13, -0.11], [1.2, 0.08, 0.04, -0.11]],
        { rings: 14, seg: 14, cap0: true, cap1: true, superPow: 0.76 }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.loft([[0.32, 0.4, 0.13, -0.28], [0.72, 0.45, 0.15, -0.3], [1.04, 0.4, 0.12, -0.28], [1.12, 0.24, 0.08, -0.28], [1.16, 0.06, 0.03, -0.28]], { rings: 8, seg: 10, cap0: true, cap1: true, superPow: 0.78 }, BP);
      g.tube([[-0.4, -0.18, 0.86], [0, -0.19, 1.04], [0.4, -0.18, 0.86]], 0.024, 0x3b2732, { seg: 6, steps: 2 });
      for (var s = -1; s <= 1; s += 2) {
        g.tube([[s * 0.23, -0.26, 0.92], [s * 0.25, -0.16, 0.98], [s * 0.24, -0.08, 0.96]], [0.04, 0.03, 0.008], 0xf0ead8, { seg: 6, steps: 2 });
        g.sph(0.085, 0.06, 0.085, s * 0.19, 0.12, 1.0, function (x, y, z) { return hc(x, y, z, 0, 1); }, { s: [6, 5] });
        g.sph(0.04, 0.025, 0.05, s * 0.19, 0.15, 1.02, 0x2e2630, { s: [5, 4] });
        g.sph(0.11, 0.09, 0.11, s * 0.3, 0.37, 0.3, function (x, y, z) { return hc(x, y, z, 0, 1); }, { s: [6, 5] });
        g.sph(0.026, 0.018, 0.03, s * 0.3, 0.37, 0.37, 0x5a4a58, { s: [4, 3] });
      }
      eyePair(g, 0.31, 0.43, 0.34, 0.04, 0x1a1210);
    },
    earAt: [0, 0.3, 0.05], ears: function (g) { earBall(g, 0.34, 0.55, 0.05, 0.075, GR, PK); earBall(g, -0.34, 0.55, 0.05, 0.075, GR, PK); },
    legs: { fx: 0.46, fy: 0.55, fz: 0.75, hy: 0.55, hz: -0.8, hx: 0.48, fLen: 0.55, hLen: 0.55, fr: [0.26, 0.23, 0.22], hr: [0.27, 0.23, 0.22], two: true, kf: 0.52, col: function (y) { return y < -0.4 ? GD : GR; },
      foot: { type: 'toes', col: 0x4a4048, h: 0.08 } },
    tail: { y: 1.2, z: -1.4, n: 1, len: 0.3, r0: 0.07, r1: 0.04, col: GD, up: -0.7 },
    fold: { fa: -0.4, ha: -0.4, splay: 1.25, hp: 0.4, hy: 0.5, na: -0.1 }
  };
})();

// ---- PANDA
(function () {
  var W = 0xf6f4ee, K = 0x1a1a1e;
  var bc = function (x, y, z, nx, ny) {
    var zb = z + (y - 0.58) * 0.3;
    if (zb > 0.06 && zb < 0.5 && ny > -0.7) return K;
    return (ny < -0.5 && z < 0.06) ? 0xe8e6de : W;
  };
  QUADS.panda = {
    id: 'panda', cy: 0.58, hl: 0.65, hh: 0.4, height: 1.0, size: 0.8, walkA: 0.4, runA: 0.6, bend: 0.5, babyScale: 0.5, babyHead: 1.35, sitStates: ['idle', 'eat', 'drink', 'play'], hopH: 0.8,
    body: function (g) {
      g.loft([[-0.74, 0.04, 0.05, 0.56], [-0.68, 0.18, 0.2, 0.56], [-0.45, 0.43, 0.46, 0.58], [-0.05, 0.42, 0.44, 0.58], [0.32, 0.43, 0.5, 0.64], [0.54, 0.34, 0.4, 0.68], [0.66, 0.2, 0.25, 0.68], [0.7, 0.05, 0.06, 0.68]],
        { rings: 20, seg: 14, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neck: { y: 0.78, z: 0.55, len: 0.18, up: 0.15, r0: 0.28, r1: 0.26, col: W },
    hpitch: 0.35, eatY: 0.1, eatNA: -0.4, eatHP: 0.8,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        var dx = abs(x) - 0.125, dy = y - 0.03, u = dx * 0.88 + dy * 0.48, v = -dx * 0.48 + dy * 0.88;
        if (z > 0.14 && u * u / 0.0065 + v * v / 0.0030 < 1) return K;
        return z > 0.4 && ny > 0.2 ? 0x2a2428 : W;
      };
      g.loft([[-0.2, 0.2, 0.2, 0.0], [0.0, 0.285, 0.26, 0.0], [0.18, 0.27, 0.235, -0.02], [0.3, 0.17, 0.13, -0.07], [0.4, 0.13, 0.1, -0.085], [0.46, 0.09, 0.07, -0.085]],
        { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.05, 0.034, 0.03, 0, -0.03, 0.455, K, { s: [6, 4] });
      g.tube([[0, -0.05, 0.455], [0, -0.09, 0.44], [0.0, -0.1, 0.4]], 0.006, K, { seg: 4, steps: 2 });
      eyePair(g, 0.13, 0.05, 0.27, 0.018, 0x333333);
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
  var BL = 0x34343a, SK = 0x4a4a52, SIL = 0x6a6a74, FC = 0x232328;
  QUADS.gorilla = {
    id: 'gorilla', sexed: true, fScale: 0.82, cy: 1.0, hl: 0.8, hh: 0.55, height: 1.7, size: 1.4, walkA: 0.38, runA: 0.55, bend: 0.4, babyScale: 0.45, babyHead: 1.4, sitStates: ['idle', 'eat', 'drink'], hopH: 0.8,
    body: function (g, sex) {
      var bc = function (x, y, z, nx, ny) {
        var fur = hash3(Math.floor(x * 16), Math.floor(y * 12), Math.floor(z * 16)) > 0.7 ? shade(BL, 1.18) : BL;
        if (sex !== 'f' && ny > 0.2 && z < 0.4) return mixHex(fur, SIL, clamp((ny - 0.2) * 1.5, 0, 1) * clamp((0.4 - z) * 6, 0, 1));
        return (z > 0.45 && ny < 0.1 && ny > -0.6 && abs(x) < 0.4) ? mixHex(fur, SK, 0.7) : fur;
      };
      g.loft([[-0.86, 0.06, 0.08, 0.78], [-0.8, 0.2, 0.22, 0.78], [-0.5, 0.42, 0.42, 0.84], [-0.05, 0.5, 0.5, 0.96], [0.38, 0.6, 0.52, 1.08], [0.66, 0.54, 0.5, 1.2], [0.86, 0.3, 0.32, 1.25], [0.92, 0.06, 0.08, 1.25]],
        { rings: 24, seg: 16, cap0: true, cap1: true, ridge: 0.05 }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neck: { y: 1.38, z: 0.62, len: 0.2, up: 0.0, r0: 0.38, r1: 0.34, col: BL },
    hpitch: 0.25, eatY: 0.3, eatNA: -0.5, eatHP: 0.7,
    head: function (g, sex) {
      var male = sex !== 'f';
      var hc = function (x, y, z, nx, ny) {
        if (z > 0.17 && ny < 0.6 && y < 0.1 && y > -0.2) return z > 0.3 && ny < -0.3 ? shade(SK, 0.8) : SK;
        return hash3(Math.floor(x * 20), Math.floor(y * 20), Math.floor(z * 20)) > 0.75 ? shade(BL, 1.2) : BL;
      };
      var cr = function (x, y, z) { return z > 0.0 && male ? 0x3c3230 : hc(x, y, z, 0, 1); };
      g.loft([[-0.2, 0.21, 0.22, 0.08], [0.0, 0.28, 0.29, 0.08], [0.12, 0.26, 0.26, 0.05], [0.22, 0.22, 0.19, 0.0], [0.3, 0.19, 0.14, -0.05], [0.38, 0.17, 0.115, -0.085], [0.44, 0.12, 0.08, -0.095]],
        { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.loft([[-0.22, 0.05, 0.09, 0.27], [-0.04, 0.07, 0.13, 0.29], [0.12, 0.055, 0.1, 0.25], [0.26, 0.03, 0.05, 0.14]], { rings: 8, seg: 8, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return cr(x, y, z); });
      g.sph(0.14, 0.07, 0.12, 0, -0.14, 0.27, SK, { s: [7, 5] });
      g.tube([[-0.15, 0.1, 0.25], [-0.06, 0.125, 0.3], [0.06, 0.125, 0.3], [0.15, 0.1, 0.25]], [0.026, 0.04, 0.04, 0.026], FC, { seg: 6, steps: 2 });
      for (var s = -1; s <= 1; s += 2) {
        g.sph(0.022, 0.014, 0.016, s * 0.04, -0.045, 0.43, FC, { s: [4, 3] });
        g.tube([[s * 0.03, -0.1, 0.4], [s * 0.1, -0.115, 0.32], [s * 0.14, -0.09, 0.22]], 0.006, FC, { seg: 4, steps: 2 });
      }
      eyePair(g, 0.095, 0.06, 0.32, 0.021, 0x3a1e10);
      var ge = [[0, -0.055], [0.055, -0.03], [0.06, 0.045], [0.02, 0.065], [-0.02, 0.035]];
      g.extrude(ge, 0.028, 0.23, 0.04, 0.05, [0, -0.3, 0], SK, { axis: 'z', bev: 0.008, curveX: -0.3 });
      g.extrude(ge.map(function (p) { return [-p[0], p[1]]; }), 0.028, -0.23, 0.04, 0.05, [0, 0.3, 0], SK, { axis: 'z', bev: 0.008, curveX: -0.3 });
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
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.35) return DK;
    return mixHex(RU, 0xe0803a, clamp(ny * 0.5, 0, 0.5) * (hash3(Math.floor(x * 20), Math.floor(y * 20), Math.floor(z * 20)) > 0.6 ? 1 : 0.3));
  };
  QUADS.red_panda = {
    id: 'red_panda', cy: 0.34, hl: 0.5, hh: 0.2, height: 0.62, size: 0.45, walkA: 0.5, runA: 0.8, bend: 0.8, babyScale: 0.55, babyHead: 1.3, hopH: 0.6,
    body: function (g) {
      g.loft([[-0.42, 0.03, 0.04, 0.35], [-0.38, 0.1, 0.11, 0.35], [-0.18, 0.2, 0.185, 0.35], [0.02, 0.185, 0.18, 0.34], [0.22, 0.195, 0.19, 0.36], [0.36, 0.13, 0.13, 0.39], [0.42, 0.04, 0.05, 0.39]],
        { rings: 16, seg: 12, cap0: true, cap1: true, ridge: 0.03 }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neck: { y: 0.42, z: 0.34, len: 0.08, up: 0.2, r0: 0.13, r1: 0.12, col: RU },
    hpitch: 0.35, eatY: 0.08, eatNA: -0.3, eatHP: 0.8,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        var ax = abs(x);
        if (z > 0.17) return y > -0.01 && ny > 0.5 ? mixHex(WH, RU, 0.3) : WH;
        if (ax > 0.045 && ax < 0.065 && y < 0.03 && y > -0.07 && z > 0.07) return DK;
        if (z > 0.0 && ax > 0.07 && y < 0.035) return WH;
        return RU;
      };
      g.loft([[-0.08, 0.1, 0.09, 0.0], [0.04, 0.14, 0.11, 0.0], [0.12, 0.125, 0.095, -0.01], [0.18, 0.065, 0.055, -0.025], [0.23, 0.05, 0.042, -0.03], [0.26, 0.035, 0.03, -0.03]],
        { rings: 12, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.026, 0.017, 0.016, 0, -0.026, 0.255, 0x1a1010, { s: [5, 4] });
      for (var s = -1; s <= 1; s += 2) {
        for (var r = 0; r < 3; r++) g.cone(0.04 - r * 0.006, 0.1 - r * 0.015, s * 0.12, -0.04 - r * 0.02, 0.02 - r * 0.02, WH, { seg: 5, rot: [0.1, 0, -s * (1.3 + r * 0.1)] });
        g.sph(0.02, 0.014, 0.02, s * 0.058, 0.022, 0.12, DK, { s: [4, 3] });
      }
      eyePair(g, 0.066, 0.04, 0.11, 0.017);
    },
    earAt: [0, 0.1, 0.02], ears: function (g) { earCone(g, 0.085, 0.1, 0.0, 0.065, 0.1, 0.25, RU, WH); earCone(g, -0.085, 0.1, 0.0, 0.065, 0.1, 0.25, RU, WH); },
    legs: { fx: 0.1, fy: 0.22, fz: 0.2, hy: 0.22, hz: -0.2, hx: 0.1, fLen: 0.22, hLen: 0.22, fr: [0.055, 0.045, 0.04], hr: [0.06, 0.047, 0.04], col: DK, foot: { type: 'paw', col: DK, h: 0.04, pawCol: DK } },
    tail: { y: 0.36, z: -0.34, n: 3, len: 0.7, r0: 0.075, r1: 0.085, col: function (i, x, y, z) { return fract(-z * 7 + i * 0.5) < 0.5 ? RU : CR; }, up: -0.35, curl: -0.2, tip: function (g, sl) { tuft(g, -sl * 0.8, 0.085, 0.09, DK); } },
    fold: { roll: 0.0, hp: 0.9, hy: 0.7 }
  };
})();

// ---- WOLF
(function () {
  var GR = 0x8e8f96, LT = 0xd3d0c8, DK = 0x56575f, BRN = 0x8a7a68;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.35) return LT;
    var n = hash3(Math.floor(x * 18), Math.floor(y * 14), Math.floor(z * 18)) > 0.7 ? 1.12 : 1;
    var saddle = clamp((ny - 0.3) * 2, 0, 1) * clamp((0.5 - z) * 3, 0, 1);
    return mixHex(shade(GR, n), DK, saddle * 0.8);
  };
  QUADS.wolf = {
    id: 'wolf', cy: 0.74, hl: 0.8, hh: 0.27, height: 1.2, size: 0.85, walkA: 0.42, runA: 0.75, bend: 0.9, babyScale: 0.5, babyHead: 1.4,
    body: function (g) {
      g.loft([[-0.74, 0.03, 0.04, 0.74], [-0.68, 0.1, 0.13, 0.74], [-0.45, 0.2, 0.24, 0.76], [-0.12, 0.17, 0.2, 0.72], [0.15, 0.2, 0.27, 0.76], [0.42, 0.23, 0.3, 0.82], [0.58, 0.19, 0.25, 0.85], [0.66, 0.1, 0.13, 0.85], [0.7, 0.03, 0.04, 0.85]],
        { rings: 22, seg: 14, cap0: true, cap1: true, ridge: 0.04 }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neck: { y: 0.88, z: 0.56, len: 0.3, up: 0.6, r0: 0.17, r1: 0.14, col: function (x, y, z, nx, ny) { return ny < -0.3 ? LT : mixHex(GR, DK, 0.35); } },
    hpitch: 0.5, eatY: 0.15,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        if (z > 0.2 && ny < -0.15) return LT;
        if (z > 0.2) return mixHex(GR, BRN, 0.4);
        if (y < -0.04 && z > -0.02) return LT;
        return ny > 0.55 ? DK : GR;
      };
      g.loft([[-0.08, 0.11, 0.12, 0.0], [0.06, 0.155, 0.15, 0.0], [0.17, 0.14, 0.125, 0.0], [0.24, 0.1, 0.085, -0.03], [0.36, 0.08, 0.072, -0.045], [0.44, 0.072, 0.063, -0.05], [0.49, 0.05, 0.042, -0.05]],
        { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.04, 0.028, 0.026, 0, -0.025, 0.49, 0x151515, { s: [6, 4] });
      for (var s = -1; s <= 1; s += 2) {
        for (var r = 0; r < 3; r++) g.cone(0.045 - r * 0.007, 0.12 - r * 0.02, s * 0.1, -0.06 - r * 0.02, 0.0 - r * 0.04, LT, { seg: 5, rot: [0.3, 0, -s * (1.1 + r * 0.12)] });
        g.tube([[s * 0.01, -0.055, 0.49], [s * 0.045, -0.08, 0.4], [s * 0.075, -0.07, 0.27]], 0.005, 0x2a2a2a, { seg: 4, steps: 2 });
      }
      eyePair(g, 0.082, 0.052, 0.175, 0.021, 0xd8a020);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earCone(g, 0.075, 0.2, -0.02, 0.075, 0.2, 0.12, GR, 0xd8b8b0); earCone(g, -0.075, 0.2, -0.02, 0.075, 0.2, 0.12, GR, 0xd8b8b0); },
    legs: { fx: 0.11, fy: 0.54, fz: 0.4, hy: 0.52, hz: -0.46, hx: 0.12, fLen: 0.54, hLen: 0.52, fr: [0.07, 0.05, 0.042], hr: [0.08, 0.05, 0.042], haunch: [0.1, 0.16, 0.16], col: function (y) { return y < -0.35 ? LT : GR; },
      foot: { type: 'paw', col: 0x222222, h: 0.05, pawCol: LT } },
    tail: { y: 0.78, z: -0.66, n: 2, len: 0.85, r0: 0.05, r1: 0.09, col: function (i, x, y, z, nx, ny) { return ny > 0.4 ? DK : GR; }, up: -0.55, curl: -0.1, tip: function (g, sl) { tuft(g, -sl * 0.7, 0.08, 0.1, 0x2c2d33); } },
    fold: { roll: 0.15, hp: 0.7, hy: 0.8 }
  };
})();

// ---- BROWN BEAR
(function () {
  var BR = 0x6d4a2e, LT = 0x8d6a47, DK = 0x4e3320;
  var fur = function (x, y, z, ny) {
    var h = hash3(Math.floor(x * 12), Math.floor(y * 10), Math.floor(z * 12));
    var c = h > 0.78 ? DK : (h < 0.2 ? shade(BR, 1.12) : BR);
    return mixHex(c, LT, clamp((ny - 0.35) * 1.2, 0, 0.5) * clamp(z + 0.2, 0, 1));
  };
  QUADS.brown_bear = {
    id: 'brown_bear', cy: 0.95, hl: 0.9, hh: 0.5, height: 1.65, size: 1.3, walkA: 0.35, runA: 0.55, bend: 0.5, babyScale: 0.45, babyHead: 1.4, sitStates: ['eat'],
    body: function (g) {
      g.loft([[-1.0, 0.05, 0.06, 0.9], [-0.94, 0.22, 0.25, 0.9], [-0.6, 0.5, 0.52, 0.92], [-0.15, 0.48, 0.5, 0.92], [0.18, 0.5, 0.58, 1.02], [0.45, 0.52, 0.66, 1.1], [0.72, 0.46, 0.55, 1.08], [0.9, 0.34, 0.4, 1.07], [1.0, 0.2, 0.24, 1.08], [1.05, 0.04, 0.05, 1.08]],
        { rings: 24, seg: 16, cap0: true, cap1: true, ridge: 0.06 }, function (zc, ca, sa, x, y, z) { return fur(x, y, z, ca); });
    },
    neck: { y: 1.12, z: 0.85, len: 0.25, up: -0.05, r0: 0.38, r1: 0.34, col: function (x, y, z, nx, ny) { return fur(x, y, z, ny); } },
    hpitch: 0.4, eatY: 0.2, eatNA: -0.5, eatHP: 0.8,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        if (z > 0.5 && ny > 0.3) return 0x1e1612;
        if (z > 0.3) return mixHex(BR, LT, 0.6);
        return fur(x, y, z, ny);
      };
      g.loft([[-0.2, 0.2, 0.22, 0.04], [0.0, 0.27, 0.27, 0.04], [0.13, 0.26, 0.25, 0.02], [0.24, 0.17, 0.15, -0.03], [0.32, 0.14, 0.12, -0.07], [0.42, 0.12, 0.1, -0.095], [0.52, 0.105, 0.08, -0.1], [0.57, 0.07, 0.05, -0.1]],
        { rings: 14, seg: 14, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.06, 0.04, 0.035, 0, -0.04, 0.565, 0x1a1210, { s: [6, 4] });
      for (var s = -1; s <= 1; s += 2) {
        for (var r = 0; r < 3; r++) g.cone(0.06 - r * 0.01, 0.15 - r * 0.025, s * 0.22, -0.06 - r * 0.04, 0.0 - r * 0.06, r === 0 ? BR : DK, { seg: 5, rot: [0.3, 0, -s * (1.2 + r * 0.1)] });
        g.tube([[s * 0.01, -0.075, 0.565], [s * 0.05, -0.1, 0.5], [s * 0.1, -0.1, 0.38]], 0.006, 0x1a1210, { seg: 4, steps: 2 });
      }
      eyePair(g, 0.125, 0.085, 0.25, 0.024, 0x1a1008);
    },
    earAt: [0, 0.2, 0.0], ears: function (g) { earBall(g, 0.18, 0.24, -0.02, 0.075, BR, DK); earBall(g, -0.18, 0.24, -0.02, 0.075, BR, DK); },
    legs: { fx: 0.3, fy: 0.62, fz: 0.5, hy: 0.6, hz: -0.55, hx: 0.3, fLen: 0.62, hLen: 0.6, fr: [0.17, 0.13, 0.12], hr: [0.19, 0.14, 0.12], col: BR, haunch: [0.18, 0.22, 0.22],
      foot: { type: 'paw', col: 0xd8d0c0, h: 0.08, pawCol: DK, claws: true } },
    tail: { y: 0.95, z: -0.95, n: 1, len: 0.14, r0: 0.07, r1: 0.05, col: BR, up: -0.4 },
    sit: { p: -0.9, fa: -0.4, fb: 0.2, ha: -1.4, hb: 0.1, hs: 0.3, fs: 0.2, na: 0.0, hp: 0.3, eat: { fa: -0.9, fb: -1.3 } },
    fold: { roll: 0.15, hp: 0.8, hy: 0.8 }
  };
})();

// ---- POLAR BEAR
(function () {
  var WH = 0xf4f2ea, SH = 0xdedbd0, CRM = 0xeee6cc;
  var fur = function (x, y, z, ny) {
    var h = hash3(Math.floor(x * 11), Math.floor(y * 9), Math.floor(z * 11));
    return mixHex(ny < -0.3 ? SH : WH, CRM, (h > 0.7 ? 0.5 : 0.1) * clamp(ny + 0.6, 0, 1));
  };
  QUADS.polar_bear = {
    id: 'polar_bear', cy: 0.9, hl: 1.0, hh: 0.5, height: 1.6, size: 1.35, walkA: 0.35, runA: 0.55, bend: 0.5, babyScale: 0.45, babyHead: 1.4, swimDrop: 0.65,
    body: function (g) {
      g.loft([[-1.06, 0.05, 0.06, 0.88], [-1.0, 0.22, 0.25, 0.88], [-0.6, 0.5, 0.52, 0.9], [-0.1, 0.46, 0.49, 0.92], [0.4, 0.46, 0.51, 0.97], [0.7, 0.41, 0.46, 1.01], [0.92, 0.32, 0.36, 1.04], [1.0, 0.18, 0.22, 1.05], [1.05, 0.04, 0.05, 1.05]],
        { rings: 24, seg: 16, cap0: true, cap1: true, ridge: 0.03 }, function (zc, ca, sa, x, y, z) { return fur(x, y, z, ca); });
    },
    neck: { y: 1.1, z: 0.9, len: 0.4, up: 0.15, r0: 0.3, r1: 0.25, col: function (x, y, z, nx, ny) { return fur(x, y, z, ny); } },
    hpitch: 0.4, eatY: 0.2, eatNA: -0.5, eatHP: 0.8,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return z > 0.5 && ny > 0.4 ? 0x2a2a2a : fur(x, y, z, ny); };
      g.loft([[-0.2, 0.17, 0.18, 0.02], [0.05, 0.21, 0.2, 0.0], [0.2, 0.17, 0.16, -0.03], [0.34, 0.125, 0.115, -0.065], [0.46, 0.105, 0.09, -0.08], [0.55, 0.085, 0.065, -0.075], [0.59, 0.06, 0.045, -0.07]],
        { rings: 14, seg: 14, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.058, 0.04, 0.035, 0, -0.025, 0.585, 0x1a1a1a, { s: [6, 4] });
      for (var s = -1; s <= 1; s += 2) g.tube([[s * 0.01, -0.065, 0.585], [s * 0.05, -0.095, 0.5], [s * 0.09, -0.09, 0.38]], 0.005, 0x2a2224, { seg: 4, steps: 2 });
      eyePair(g, 0.115, 0.06, 0.26, 0.021, 0x111111);
    },
    earAt: [0, 0.15, 0.0], ears: function (g) { earBall(g, 0.15, 0.18, -0.02, 0.06, WH, 0xe8c8c0); earBall(g, -0.15, 0.18, -0.02, 0.06, WH, 0xe8c8c0); },
    legs: { fx: 0.28, fy: 0.62, fz: 0.52, hy: 0.6, hz: -0.58, hx: 0.29, fLen: 0.62, hLen: 0.6, fr: [0.17, 0.13, 0.12], hr: [0.18, 0.14, 0.12], col: function (y, ny, front, x, z) { return fur(x || 0, y, z || 0, ny); }, haunch: [0.16, 0.2, 0.22],
      foot: { type: 'paw', col: 0x2a2a2a, h: 0.08, pawCol: SH, claws: true } },
    tail: { y: 0.92, z: -1.0, n: 1, len: 0.1, r0: 0.06, r1: 0.04, col: WH, up: -0.3 },
    fold: { roll: 0.12, hp: 0.8, hy: 0.7 }
  };
})();

// ---- CAMEL
(function () {
  var TN = 0xc9995a, DK = 0x9a7040, LT = 0xdcb67e;
  var coat = function (x, y, z, ny) {
    var c = ny < -0.5 ? LT : (hash3(Math.floor(x * 10), Math.floor(y * 10), Math.floor(z * 10)) > 0.8 ? shade(TN, 0.92) : TN);
    return mixHex(c, DK, clamp((y - 2.0) * 3, 0, 1) * clamp(ny * 1.2, 0, 0.8));
  };
  QUADS.camel = {
    id: 'camel', cy: 1.58, hl: 1.2, hh: 0.5, height: 2.7, size: 1.9, walkA: 0.33, runA: 0.5, bend: 0.6, babyScale: 0.5, babyHead: 1.35, reach: 0.25, eatY: 0.3,
    body: function (g) {
      g.loft([[-1.12, 0.05, 0.07, 1.56], [-1.06, 0.2, 0.26, 1.56], [-0.75, 0.38, 0.46, 1.6], [-0.45, 0.4, 0.52, 1.7], [-0.2, 0.3, 0.64, 1.9], [0.05, 0.29, 0.6, 1.93], [0.25, 0.36, 0.5, 1.72], [0.5, 0.41, 0.52, 1.62], [0.8, 0.31, 0.4, 1.64], [0.96, 0.22, 0.3, 1.68], [1.02, 0.05, 0.07, 1.68]],
        { rings: 26, seg: 16, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return coat(x, y, z, ca); });
    },
    neck: { y: 1.82, z: 0.8, len: 1.05, up: 0.85, r0: 0.25, r1: 0.14, col: function (x, y, z, nx, ny) { return ny < -0.5 ? LT : TN; } },
    hpitch: 0.65, eatY: 0.3,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        if (z > 0.42) return ny < 0.3 ? 0xb89870 : 0xa88860;
        return z > 0.22 && ny < -0.3 ? LT : (y > 0.07 && z < 0.22 && abs(x) < 0.1 ? DK : TN);
      };
      g.loft([[-0.1, 0.12, 0.13, 0.0], [0.07, 0.15, 0.15, 0.0], [0.2, 0.115, 0.115, -0.02], [0.32, 0.085, 0.09, -0.055], [0.46, 0.088, 0.085, -0.085], [0.54, 0.082, 0.072, -0.095], [0.59, 0.055, 0.05, -0.095]],
        { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.06, 0.03, 0.14, 0, 0.12, 0.18, DK, { s: [6, 4] });
      for (var s = -1; s <= 1; s += 2) {
        g.sph(0.045, 0.034, 0.07, s * 0.12, 0.1, 0.14, function (x, y, z) { return hc(x, y, z, 0, 1); }, { s: [6, 4] });
        g.sph(0.018, 0.012, 0.022, s * 0.032, -0.025, 0.575, 0x2a1c10, { s: [4, 3] });
      }
      g.tube([[0, -0.1, 0.59], [0, -0.115, 0.55], [0, -0.1, 0.5]], 0.005, 0x4a3420, { seg: 4, steps: 2 });
      g.cone(0.04, 0.12, 0, -0.14, 0.14, DK, { seg: 5, rot: [-2.7, 0, 0] });
      eyePair(g, 0.125, 0.065, 0.18, 0.027, 0x2a1a0a);
    },
    earAt: [0, 0.1, 0.0], ears: function (g) { earBall(g, 0.1, 0.18, -0.03, 0.05, TN, 0xd9a0a0); earBall(g, -0.1, 0.18, -0.03, 0.05, TN, 0xd9a0a0); },
    legs: { fx: 0.2, fy: 1.2, fz: 0.55, hy: 1.2, hz: -0.58, hx: 0.21, fLen: 1.2, hLen: 1.2, fr: [0.12, 0.085, 0.065], hr: [0.14, 0.09, 0.065], haunch: [0.17, 0.28, 0.24],
      col: function (y) { return y < -0.9 ? DK : TN; }, foot: { type: 'paw', col: 0xa07c50, h: 0.08, pawCol: 0xa07c50 } },
    tail: { y: 1.62, z: -1.1, n: 2, len: 0.75, r0: 0.04, r1: 0.04, col: DK, up: -1.1, curl: 0, tip: function (g, sl) { tuft(g, -sl * 0.9, 0.045, 0.11, 0x5a4028); } },
    fold: { fa: -1.3, ha: -1.25, splay: 0.25, hp: 0.9, hy: 0.2, na: 0.2, lieY: 0.85 }
  };
})();

// ---- MEERKAT
(function () {
  var SD = 0xcaa774, LT = 0xe8d6b0, DK = 0x3b2a20, BD = 0x7a6a5a;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.45 && z > -0.05) return BD;
    if (ny < -0.1 || (ny < 0.3 && z > 0.1)) return LT;
    return fract(z * 20 + sin(y * 14 + x * 8) * 0.15) < 0.22 && ny > 0.1 ? 0x8a6a46 : SD;
  };
  QUADS.meerkat = {
    id: 'meerkat', cy: 0.25, hl: 0.35, hh: 0.14, height: 0.55, size: 0.35, walkA: 0.55, runA: 0.9, bend: 1.0, babyScale: 0.6, babyHead: 1.3, sitStates: ['idle', 'eat', 'drink', 'play'], hopH: 0.5,
    body: function (g) {
      g.loft([[-0.31, 0.02, 0.03, 0.25], [-0.28, 0.06, 0.07, 0.25], [-0.12, 0.125, 0.13, 0.25], [0.02, 0.105, 0.115, 0.255], [0.16, 0.115, 0.128, 0.27], [0.26, 0.08, 0.09, 0.29], [0.31, 0.02, 0.03, 0.29]],
        { rings: 16, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neck: { y: 0.31, z: 0.22, len: 0.07, up: 0.3, r0: 0.08, r1: 0.075, col: SD },
    hpitch: 0.3, eatY: 0.05, eatNA: -0.3, eatHP: 0.8,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        var ax = abs(x), u = (ax - 0.05) * 1.0, v = (y - 0.012) * 1.2;
        if (z > 0.03 && z < 0.12 && u * u / 0.0014 + v * v / 0.0010 < 1) return DK;
        if (z > 0.12 && ny > 0.4) return mixHex(SD, DK, 0.35);
        return z > 0.08 && ny < 0.2 ? LT : (ny > 0.55 && z < 0.06 ? 0xb8935f : SD);
      };
      g.loft([[-0.05, 0.08, 0.075, 0.0], [0.04, 0.1, 0.09, 0.0], [0.1, 0.078, 0.067, -0.01], [0.15, 0.048, 0.042, -0.02], [0.19, 0.032, 0.026, -0.024], [0.21, 0.016, 0.013, -0.024]],
        { rings: 12, seg: 10, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.sph(0.017, 0.012, 0.012, 0, -0.012, 0.205, 0x1a1210, { s: [4, 3] });
      eyePair(g, 0.056, 0.024, 0.085, 0.015, 0x050505);
    },
    earAt: [0, 0.05, 0.0], ears: function (g) { earBall(g, 0.085, 0.04, -0.005, 0.027, DK); earBall(g, -0.085, 0.04, -0.005, 0.027, DK); },
    legs: { fx: 0.075, fy: 0.17, fz: 0.15, hy: 0.17, hz: -0.16, hx: 0.08, fLen: 0.17, hLen: 0.17, fr: [0.04, 0.032, 0.028], hr: [0.05, 0.036, 0.03], col: SD, haunch: [0.06, 0.08, 0.09],
      foot: { type: 'paw', col: 0x3a2a20, h: 0.03, pawCol: SD } },
    tail: { y: 0.2, z: -0.3, n: 2, len: 0.42, r0: 0.04, r1: 0.022, col: SD, up: -0.45, curl: 0.0, tip: function (g, sl) { tuft(g, -sl, 0.024, 0.05, DK); } },
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
      // sculpted low-slung armored crocodilian torso with flat belly & osteoderm scute rows
      g.loft([[-0.96, 0.2, 0.14, 0.27], [-0.55, 0.4, 0.22, 0.28], [0.0, 0.44, 0.24, 0.28], [0.55, 0.36, 0.21, 0.29], [0.92, 0.22, 0.16, 0.3]], { rings: 16, seg: 12, cap0: true, cap1: true, flatBot: 0.78, ridge: 0.14 }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
      for (var i = 0; i < 8; i++) {
        var z = -0.72 + i * 0.21;
        g.bevelBox(0.085, 0.045, 0.12, 0.015, -0.1, 0.46, z, DK, { smooth: 0.3 });
        g.bevelBox(0.085, 0.045, 0.12, 0.015, 0.1, 0.46, z, DK, { smooth: 0.3 });
        g.cone(0.032, 0.075, -0.1, 0.5, z, DK, { seg: 4 }); g.cone(0.032, 0.075, 0.1, 0.5, z, DK, { seg: 4 });
      }
    },
    neck: { y: 0.3, z: 0.85, len: 0.0, up: 0.0, r0: 0.2, r1: 0.2, col: GR },
    hpitch: 0.0, eatNA: 0.0, eatHP: 0.55, eatTP: 0.0,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return ny < -0.3 ? LT : (hash3(Math.floor(x * 20), Math.floor(y * 20), Math.floor(z * 12)) > 0.7 ? DK : GR); };
      g.loft([[-0.12, 0.21, 0.13, 0.02], [0.16, 0.22, 0.13, 0.01], [0.46, 0.145, 0.08, -0.01], [0.78, 0.115, 0.06, -0.015], [0.98, 0.1, 0.045, -0.01]], { rings: 12, seg: 10, cap0: true, cap1: true, flatBot: 0.7 }, function (zc, ca, sa, x, y, z) { return hc(x, y, z, sa, ca); });
      g.loft([[0.05, 0.17, 0.055, -0.085], [0.48, 0.13, 0.045, -0.088], [0.92, 0.085, 0.032, -0.08]], { rings: 9, seg: 9, cap0: true, cap1: true, flatBot: 0.65 }, LT);
      g.sph(0.032, 0.028, 0.032, 0.05, 0.05, 0.96, 0x1a1a10, { s: [5, 4] }); g.sph(0.032, 0.028, 0.032, -0.05, 0.05, 0.96, 0x1a1a10, { s: [5, 4] });
      for (var i = 0; i < 6; i++) { var z = 0.3 + i * 0.115; g.cone(0.016, 0.046, 0.115 - i * 0.005, -0.068, z, 0xf4f0e0, { seg: 5, rot: [0, 0, PI] }); g.cone(0.016, 0.046, -(0.115 - i * 0.005), -0.068, z, 0xf4f0e0, { seg: 5, rot: [0, 0, PI] }); }
      g.sph(0.075, 0.075, 0.085, 0.13, 0.13, 0.15, GR, { s: [6, 5] }); g.sph(0.075, 0.075, 0.085, -0.13, 0.13, 0.15, GR, { s: [6, 5] });
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

// ---- UNICORN
(function () {
  var PW = 0xfaf7ff, SH = 0xe8e2f5, MN = 0xe9a6d8, MN2 = 0xd284c8, MN3 = 0xf6c6eb, GD = 0xf0c642, GD2 = 0xd69f24;
  var bc = function (x, y, z, nx, ny) { return ny < -0.5 ? SH : PW; };
  var mcol = function (i) { return i % 3 === 0 ? MN3 : (i % 3 === 1 ? MN : MN2); };
  QUADS.unicorn = {
    id: 'unicorn', cy: 1.12, hl: 0.95, hh: 0.38, height: 2.05, size: 1.4, walkA: 0.42, runA: 0.68, bend: 0.85, babyScale: 0.5, babyHead: 1.38, hopH: 1.2,
    body: function (g) {
      g.torso({ z0: -0.98, z1: 0.92, n: 20, seg: 14, rxA: 0.33, rxB: 0.32, ryA: 0.38, ryB: 0.41, ycA: 1.12, ycB: 1.15 }, bc);
    },
    neck: { y: 1.32, z: 0.72, len: 0.72, up: 0.95, r0: 0.19, r1: 0.12, hs: 6, col: PW,
      extra: function (g) {
        for (var i = 0; i < 8; i++) {
          var z = 0.04 + i * 0.09, r = lerp(0.19, 0.12, z / 0.72);
          g.sph(0.055, 0.11, 0.075, 0, r + 0.04, z, mcol(i), { s: [5, 4], rot: [0.3, 0, 0] });
          g.sph(0.045, 0.09, 0.06, (i % 2 ? 0.045 : -0.045), r - 0.01, z + 0.02, mcol(i + 1), { s: [4, 3] });
        }
      } },
    hpitch: 0.95, eatY: 0.2,
    head: function (g) {
      g.sph(0.11, 0.125, 0.17, 0, 0, 0.1, PW, { s: [8, 6] });
      g.sph(0.082, 0.085, 0.19, 0, -0.065, 0.29, PW, { s: [8, 6] });
      g.sph(0.078, 0.078, 0.065, 0, -0.075, 0.42, 0xf2d0dc, { s: [6, 4] });
      // flowing forelock
      g.sph(0.05, 0.075, 0.07, 0.03, 0.11, 0.09, MN, { s: [5, 4], rot: [0.3, 0, 0.2] });
      g.sph(0.04, 0.065, 0.06, -0.02, 0.09, 0.13, MN3, { s: [5, 4], rot: [0.35, 0, -0.15] });
      // spiraled golden horn projecting forward & up from forehead
      for (var k = 0; k < 5; k++) {
        var f0 = k / 5, f1 = (k + 1) / 5, len = 0.46;
        var y0 = 0.09 + f0 * len * 0.86, z0 = 0.14 + f0 * len * 0.51;
        var y1 = 0.09 + f1 * len * 0.86, z1 = 0.14 + f1 * len * 0.51;
        g.limb(0, y0, z0, 0, y1, z1, lerp(0.042, 0.008, f0), lerp(0.042, 0.008, f1), k % 2 ? GD : GD2, { seg: 6 });
        g.sph(lerp(0.046, 0.012, f0), lerp(0.022, 0.008, f0), lerp(0.046, 0.012, f0), 0, y0, z0, GD, { s: [5, 3], rot: [0.54, 0, 0] });
      }
      eyePair(g, 0.095, 0.06, 0.16, 0.028, 0x2a1a42);
      g.sph(0.014, 0.022, 0.01, 0.028, -0.06, 0.47, 0xd8a8ba, { s: [4, 3] });
      g.sph(0.014, 0.022, 0.01, -0.028, -0.06, 0.47, 0xd8a8ba, { s: [4, 3] });
    },
    earAt: [0, 0.1, -0.01], ears: function (g) { earCone(g, 0.07, 0.19, 0.0, 0.042, 0.16, 0.14, PW, 0xf6c8da); earCone(g, -0.07, 0.19, 0.0, 0.042, 0.16, 0.14, PW, 0xf6c8da); },
    legs: { fx: 0.16, fy: 0.86, fz: 0.5, hy: 0.88, hz: -0.58, hx: 0.17, fLen: 0.86, hLen: 0.88, fr: [0.08, 0.056, 0.044], hr: [0.095, 0.06, 0.044], haunch: [0.14, 0.21, 0.19],
      hs: 8, col: function (y) { return y < -0.74 ? SH : PW; }, foot: { type: 'hoof', col: GD, h: 0.075 } },
    tail: { y: 1.15, z: -0.92, n: 3, len: 0.92, r0: 0.06, r1: 0.085, col: function (i) { return mcol(i); }, up: -0.75, curl: -0.18,
      tip: function (g, sl) { g.sph(0.09, 0.13, 0.12, 0, 0, -sl * 0.75, MN3, { s: [6, 5] }); g.sph(0.06, 0.09, 0.1, 0, -0.03, -sl * 1.1, MN, { s: [5, 4] }); } },
    fold: { roll: 0.0 }
  };
})();

// ---- GRIFFIN
(function () {
  var LION = 0xd89e48, LION_LT = 0xf0d494, CHEST = 0x7c4624, CHEST_DK = 0x4e2b15, IVORY = 0xf5efe2, BEAK = 0xf2bc28, GD_LEG = 0xe4b234;
  var bc = function (x, y, z, nx, ny) {
    if (z > 0.18) return ny < -0.25 ? IVORY : CHEST;
    if (z > -0.05) return ny < -0.3 ? LION_LT : mixHex(LION, CHEST, (z + 0.05) / 0.23);
    return ny < -0.4 ? LION_LT : LION;
  };
  QUADS.griffin = {
    id: 'griffin', cy: 0.94, hl: 0.9, hh: 0.35, height: 1.78, size: 1.25, walkA: 0.44, runA: 0.76, bend: 0.85, babyScale: 0.5, babyHead: 1.38, hopH: 1.0,
    body: function (g) {
      g.torso({ z0: -0.92, z1: 0.84, n: 18, seg: 14, rxA: 0.31, rxB: 0.37, ryA: 0.34, ryB: 0.42, ycA: 0.90, ycB: 1.0 }, bc);
      // feathered chest ruff
      g.sph(0.36, 0.34, 0.28, 0, 0.96, 0.66, IVORY, { s: [8, 6] });
      g.sph(0.38, 0.28, 0.25, 0, 1.04, 0.45, CHEST, { s: [8, 5] });
    },
    neck: { y: 1.12, z: 0.68, len: 0.36, up: 0.75, r0: 0.22, r1: 0.15, col: IVORY,
      extra: function (g) {
        for (var i = 0; i < 4; i++) g.sph(0.08, 0.08, 0.1, 0, -0.05, 0.06 + i * 0.08, i % 2 ? IVORY : shade(IVORY, 0.94), { s: [5, 4] });
      } },
    hpitch: 0.7, eatY: 0.18,
    head: function (g) {
      g.sph(0.145, 0.145, 0.175, 0, 0.01, 0.1, IVORY, { s: [8, 6] });
      // hooked golden eagle beak
      g.cone(0.065, 0.16, 0, -0.02, 0.29, BEAK, { seg: 6, rot: [PI / 2 + 0.12, 0, 0] });
      g.cone(0.032, 0.09, 0, -0.075, 0.365, shade(BEAK, 0.88), { seg: 5, rot: [PI - 0.15, 0, 0] });
      g.sph(0.048, 0.03, 0.08, 0, -0.065, 0.25, shade(BEAK, 0.82), { s: [5, 4] });
      // noble eagle brow ridges & swept ear tufts
      g.tube([[-0.13, 0.08, 0.13], [-0.04, 0.105, 0.19], [0.04, 0.105, 0.19], [0.13, 0.08, 0.13]], [0.018, 0.024, 0.024, 0.018], shade(IVORY, 0.9), { seg: 5, steps: 2 });
      g.tube([[0.09, 0.09, 0.03], [0.13, 0.16, -0.05], [0.16, 0.2, -0.15]], [0.032, 0.02, 0.004], CHEST, { seg: 5, steps: 2 });
      g.tube([[-0.09, 0.09, 0.03], [-0.13, 0.16, -0.05], [-0.16, 0.2, -0.15]], [0.032, 0.02, 0.004], CHEST, { seg: 5, steps: 2 });
      eyePair(g, 0.105, 0.045, 0.17, 0.028, 0xe89818);
    },
    legs: {
      fx: 0.21, fy: 0.72, fz: 0.48, hy: 0.74, hz: -0.56, hx: 0.21, fLen: 0.72, hLen: 0.74,
      fr: [0.095, 0.065, 0.05], hr: [0.11, 0.075, 0.06], haunch: [0.15, 0.22, 0.21],
      col: function (y, ny, front) { return front ? (y > -0.35 ? CHEST : GD_LEG) : (y < -0.58 ? LION_LT : LION); },
      foot: { type: 'paw', col: 0x262220, h: 0.065, pawCol: GD_LEG, claws: true }
    },
    tail: { y: 0.94, z: -0.88, n: 3, len: 0.96, r0: 0.05, r1: 0.03, col: LION, up: -0.55, curl: 0.22,
      tip: function (g, sl) { tuft(g, -sl * 0.9, 0.065, 0.11, CHEST_DK); } },
    wingAt: [0.24, 1.18, 0.32],
    wings: function (r) {
      var g = B(), s = r ? -1 : 1;
      // sculpted cambered feathered eagle wing + layered primary feather blades
      g.tube([[0, 0, 0], [s * 0.65, 0.16, -0.12], [s * 1.45, 0.04, -0.32]], [0.095, 0.06, 0.024], CHEST, { seg: 6, steps: 2 });
      g.wingMembrane([
        [[0, 0, 0], [s * 0.65, 0.16, -0.12], [s * 1.45, 0.04, -0.32]],
        [[0, -0.02, -0.34], [s * 0.58, 0.06, -0.44], [s * 1.24, -0.02, -0.52]],
        [[0, -0.04, -0.54], [s * 0.45, -0.02, -0.58], [s * 0.95, -0.06, -0.66]]
      ], 0.08, function (x, y, z) { return z < -0.42 ? CHEST_DK : 0x9c6234; }, { camber: 0.08, scallop: 0.06, uSteps: 3, vSteps: 2 });
      for (var k = 0; k < 6; k++) {
        var wx = s * (0.48 + k * 0.19), wy = 0.05 - k * 0.012, wz = -0.42 - k * 0.035;
        g.extrude([[0, 0], [0.065, -0.12], [0.045, -0.42], [0, -0.54], [-0.045, -0.42], [-0.065, -0.12]], 0.024, wx, wy, wz, [0, s * (0.24 + k * 0.07), 0], k >= 3 ? CHEST_DK : 0xb07644, { axis: 'y', bev: 0.007 });
      }
      return g.build();
    },
    fold: { roll: 0.08, hp: 0.8, hy: 0.7 }
  };
})();

// ---- PURPLE DRAGON & HYBRIDS (PUGON, DRASSY)
(function () {
  var PR = 0x6b28aa, PR_DK = 0x451478, PR_LT = 0x924dd6, BELLY = 0xc97cf5, HORN = 0x241432, FANG = 0xf6eed8, WING = 0x561a86, WING_LT = 0x8232ba, SPINE = 0x2c0e4a;
  var OR = 0xe0842c, STR = 0xb05414, CR = 0xf7e3c4, BT = 0x261810, BT2 = 0x3a2518, HAT = 0x221a18, GD = 0xf2c94c, CP = 0xb8222a, CP2 = 0x82141a;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.42) return fract(z * 3.5) < 0.25 ? shade(BELLY, 0.85) : BELLY;
    var h = hash3(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4));
    return h > 0.65 ? PR_DK : (h < 0.25 ? PR_LT : PR);
  };
  function dragonWing(k, r) {
    var g = B(), s = r ? -1 : 1, th = max(0.024, 0.045 * k);
    var sh = [0, 0, 0], el = [s * 1.25 * k, 0.85 * k, -0.15 * k], wr = [s * 2.55 * k, 1.12 * k, -0.30 * k];
    var f1 = [s * 4.0 * k, 0.62 * k, -0.62 * k], f2 = [s * 3.55 * k, -0.18 * k, -1.16 * k], f3 = [s * 2.65 * k, -0.78 * k, -1.36 * k], f4 = [s * 1.45 * k, -0.84 * k, -1.26 * k], rt = [0, -0.42 * k, -0.95 * k];
    // heavy curved dragon wing arm, wrist claw & curved finger spars
    g.tube([sh, el, wr], [0.18 * k, 0.125 * k, 0.068 * k], PR, { seg: 7, steps: 2 });
    g.tube([wr, [s * 2.62 * k, 1.38 * k, -0.14 * k], [s * 2.52 * k, 1.48 * k, 0.02 * k]], [0.055 * k, 0.032 * k, 0.005 * k], HORN, { seg: 5, steps: 2 });
    g.tube([wr, f1], [0.062 * k, 0.02 * k], PR_DK, { seg: 5 });
    g.tube([wr, f2], [0.055 * k, 0.018 * k], PR_DK, { seg: 5 });
    g.tube([wr, f3], [0.05 * k, 0.018 * k], PR_DK, { seg: 5 });
    g.tube([el, f4], [0.06 * k, 0.02 * k], PR_DK, { seg: 5 });
    // true double-walled cambered bat-wing membranes stretched between skeletal spars with scalloped trailing edges
    var wCol = function (x, y, z) { return fract(abs(x / k) * 1.5 + (z / k) * 1.2) < 0.22 ? WING_LT : WING; };
    g.wingMembrane([[wr, f1], [wr, f2], [wr, f3], [el, f4], [sh, rt]], th, wCol, { camber: 0.09, scallop: 0.24, uSteps: 3, vSteps: 2 });
    return g.build();
  }
  function dragonHeadBase(g, k, col, lowHorns) {
    // sculpted armored dragon skull, horned brow arches, snout, jaw & fangs
    g.loft([[-0.22 * k, 0.34 * k, 0.3 * k, 0.04 * k], [0.18 * k, 0.41 * k, 0.35 * k, 0.04 * k], [0.64 * k, 0.27 * k, 0.22 * k, -0.02 * k], [1.05 * k, 0.2 * k, 0.16 * k, -0.03 * k], [1.2 * k, 0.11 * k, 0.1 * k, -0.04 * k]], { rings: 12, seg: 10, cap0: true, cap1: true, ridge: 0.14 }, function (zc, ca, sa, x, y, z) { return typeof col === 'function' ? col(x, y, z, sa, ca) : col; });
    g.loft([[0.15 * k, 0.24 * k, 0.12 * k, -0.2 * k], [0.62 * k, 0.22 * k, 0.12 * k, -0.21 * k], [1.04 * k, 0.15 * k, 0.08 * k, -0.2 * k]], { rings: 8, seg: 8, cap0: true, cap1: true }, PR_LT);
    // flared nasal horn & sculpted curved brow ridges
    g.tube([[0, 0.09 * k, 0.92 * k], [0, 0.22 * k, 1.02 * k], [0, 0.34 * k, 0.99 * k]], [0.075 * k, 0.042 * k, 0.008 * k], HORN, { seg: 6, steps: 2 });
    for (var s = -1; s <= 1; s += 2) {
      g.tube([[s * 0.08 * k, 0.21 * k, 0.52 * k], [s * 0.28 * k, 0.28 * k, 0.32 * k], [s * 0.38 * k, 0.25 * k, 0.08 * k]], [0.045 * k, 0.072 * k, 0.04 * k], PR_DK, { seg: 6, steps: 2 });
      g.cone(0.042 * k, 0.16 * k, s * 0.15 * k, -0.16 * k, 0.94 * k, FANG, { seg: 5, rot: [PI - 0.1, 0, 0] });
      g.cone(0.036 * k, 0.14 * k, s * 0.13 * k, -0.15 * k, 0.72 * k, FANG, { seg: 5, rot: [PI - 0.08, 0, 0] });
      if (lowHorns) {
        g.tube([[s * 0.13, 0.10, -0.02], [s * 0.25, 0.19, -0.20], [s * 0.31, 0.28, -0.37]], [0.054, 0.032, 0.006], HORN, { seg: 6, steps: 2 });
      } else {
        g.tube([[s * 0.22 * k, 0.24 * k, 0.04 * k], [s * 0.42 * k, 0.68 * k, -0.45 * k], [s * 0.54 * k, 1.0 * k, -1.14 * k]], [0.13 * k, 0.082 * k, 0.012 * k], HORN, { seg: 7, steps: 3 });
      }
      g.tube([[s * 0.32 * k, 0.02 * k, 0.06 * k], [s * 0.45 * k, 0.04 * k, -0.16 * k], [s * 0.52 * k, 0.08 * k, -0.36 * k]], [0.068 * k, 0.04 * k, 0.008 * k], PR_DK, { seg: 5, steps: 2 });
    }
    g.cone(0.07 * k, 0.24 * k, 0, -0.30 * k, 0.68 * k, HORN, { seg: 5, rot: [PI - 0.35, 0, 0] });
  }
  function dragonHeadGlow(k) {
    return [
      {
        col: 0xffe24a, em: 0xff7800,
        build: function (g) {
          g.sph(0.065 * k, 0.055 * k, 0.055 * k, 0.26 * k, 0.12 * k, 0.42 * k, 0xffe24a, { s: [6, 4] });
          g.sph(0.065 * k, 0.055 * k, 0.055 * k, -0.26 * k, 0.12 * k, 0.42 * k, 0xffe24a, { s: [6, 4] });
          g.sph(0.04 * k, 0.032 * k, 0.032 * k, 0.12 * k, 0.06 * k, 1.12 * k, 0xff7a18, { s: [5, 4] });
          g.sph(0.04 * k, 0.032 * k, 0.032 * k, -0.12 * k, 0.06 * k, 1.12 * k, 0xff7a18, { s: [5, 4] });
        }
      }
    ];
  }

  QUADS.purple_dragon = {
    id: 'purple_dragon', cy: 2.25, hl: 2.1, hh: 0.9, height: 5.8, size: 4.2, walkA: 0.34, runA: 0.52, bend: 0.55, babyScale: 0.42, babyHead: 1.38, hopH: 1.1,
    body: function (g) {
      g.torso({ z0: -2.0, z1: 1.8, n: 22, seg: 14, rxA: 0.80, rxB: 1.08, ryA: 0.76, ryB: 1.12, ycA: 2.02, ycB: 2.34 }, bc);
      // broad chest keel & muscular shoulder plates
      g.sph(0.98, 0.92, 0.86, 0, 2.28, 1.15, bc, { s: [10, 7] });
      g.sph(0.68, 0.54, 0.85, 0, 1.56, 0.65, BELLY, { s: [8, 6] });
      // dorsal ridge spines running down the back
      for (var i = 0; i < 7; i++) {
        var sz = 1.45 - i * 0.52, sy = 3.38 - Math.abs(sz) * 0.14, sh = 0.72 - i * 0.035;
        g.cone(0.16, sh, 0, sy + sh * 0.35, sz, i % 2 ? SPINE : PR_DK, { seg: 5, rot: [-0.46, 0, 0] });
      }
    },
    bodyGlow: [
      {
        col: 0xff9a28, em: 0xc44200,
        build: function (g) {
          // glowing molten belly & chest ember scales
          for (var i = 0; i < 6; i++) {
            var vz = 1.35 - i * 0.46, vy = 1.32 - Math.abs(vz - 0.3) * 0.06, vw = 0.44 - Math.abs(i - 2) * 0.04;
            g.sph(vw, 0.09, 0.16, 0, vy, vz, 0xffaa30, { s: [7, 4] });
          }
        }
      }
    ],
    neck: {
      y: 2.65, z: 1.42, len: 1.72, up: 0.88, r0: 0.50, r1: 0.33, hs: 5, col: bc,
      extra: function (g) {
        for (var i = 0; i < 4; i++) {
          var nz = 0.28 + i * 0.38;
          g.sph(0.24 - i * 0.025, 0.14, 0.2, 0, -0.26 + i * 0.02, nz, BELLY, { s: [6, 4] });
          g.cone(0.11, 0.48 - i * 0.04, 0, 0.36 - i * 0.02, nz, SPINE, { seg: 5, rot: [-0.55, 0, 0] });
        }
      }
    },
    hpitch: 0.72, eatY: 0.35,
    head: function (g) { dragonHeadBase(g, 1.0, bc, false); },
    headGlow: dragonHeadGlow(1.0),
    legs: {
      fx: 0.72, fy: 1.45, fz: 1.05, hy: 1.45, hz: -1.15, hx: 0.76, fLen: 1.45, hLen: 1.45,
      fr: [0.30, 0.22, 0.18], hr: [0.34, 0.24, 0.18], shoulder: [0.36, 0.42, 0.40], haunch: [0.42, 0.50, 0.48],
      col: function (y, ny, front) { return y < -1.0 ? PR_DK : PR; },
      foot: { type: 'paw', col: 0x1a1024, h: 0.16, pawCol: PR_DK, claws: true }
    },
    tail: {
      y: 2.04, z: -1.92, n: 5, len: 4.5, r0: 0.44, r1: 0.06, seg: 7,
      col: function (i, x, y, z, nx, ny) { return ny < -0.35 ? BELLY : (i % 2 ? PR_DK : PR); },
      up: -0.22, curl: 0.10,
      each: function (g, i, sl, r0) {
        g.cone(r0 * 0.45, 0.36 - i * 0.04, 0, r0 * 0.85, -sl * 0.5, SPINE, { seg: 5, rot: [-0.4, 0, 0] });
      },
      tip: function (g, sl) {
        // dramatic barbed spade tip
        g.sph(0.28, 0.06, 0.36, 0, 0, -sl * 1.08, PR_DK, { s: [6, 4] });
        g.cone(0.12, 0.46, 0, 0, -sl * 1.32, HORN, { seg: 5, rot: [-PI / 2, 0, 0] });
      }
    },
    wingAt: [0.76, 2.95, 0.72],
    wings: function (r) { return dragonWing(1.0, r); },
    fold: { fa: -0.95, fb: 1.9, ha: -0.95, hb: 1.9, splay: 0.25, hp: 0.55, hy: 0.75, lieY: 0.95 }
  };

  // ---- PUGON (male hybrid: small purple dragon + Puss's plumed hat, 4 boots, belt/cape & striped tabby tail)
  var capeCol = function (x, y, z, nx, ny) { return ny < 0 ? CP2 : CP; };
  QUADS.pugon = {
    id: 'pugon', cy: 0.96, hl: 0.92, hh: 0.38, height: 2.15, size: 1.45, walkA: 0.42, runA: 0.68, bend: 0.65, babyScale: 0.48, babyHead: 1.38, hopH: 1.15,
    body: function (g) {
      g.torso({ z0: -0.90, z1: 0.82, n: 20, seg: 14, rxA: 0.34, rxB: 0.44, ryA: 0.32, ryB: 0.45, ycA: 0.88, ycB: 1.00 }, bc);
      g.sph(0.40, 0.38, 0.36, 0, 0.98, 0.50, bc, { s: [9, 6] });
      g.sph(0.28, 0.22, 0.36, 0, 0.68, 0.26, BELLY, { s: [8, 5] });
      // leather waist belt & shiny gold buckles on flanks + curved flowing crimson capelet
      g.cyl(0.415, 0.415, 0.08, 0, 0.94, -0.04, BT, { seg: 14, rot: [PI / 2, 0, 0] });
      g.bevelBox(0.038, 0.11, 0.12, 0.012, 0.415, 0.94, -0.04, GD);
      g.bevelBox(0.038, 0.11, 0.12, 0.012, -0.415, 0.94, -0.04, GD);
      g.cyl(0.26, 0.31, 0.065, 0, 1.22, 0.56, CP, { seg: 10, rot: [0.65, 0, 0] });
      for (var s = -1; s <= 1; s += 2) {
        g.sph(0.044, 0.044, 0.038, s * 0.22, 1.18, 0.66, GD, { s: [5, 4] });
        g.extrude([[0, 0.4], [0.22, 0.34], [0.36, -0.42], [0.16, -0.58], [-0.04, -0.48]], 0.032, s * 0.08, 1.28, 0.02, [0.22, s * 0.14, s * -0.44], capeCol, { axis: 'y', bev: 0.008, curveX: -0.25, sx: s });
      }
      // purple dragon dorsal ridge spines rising cleanly along the spine
      for (var i = 0; i < 6; i++) {
        var sz = 0.46 - i * 0.24, sy = 1.36 - Math.abs(sz) * 0.12, sh = 0.28 - i * 0.015;
        g.cone(0.075, sh, 0, sy + sh * 0.34, sz, i % 2 ? SPINE : PR_DK, { seg: 5, rot: [-0.46, 0, 0] });
      }
    },
    bodyGlow: [
      {
        col: 0xff9a28, em: 0xc44200,
        build: function (g) {
          var zs = [0.54, 0.34, 0.14, -0.22, -0.40];
          for (var i = 0; i < zs.length; i++) {
            var vz = zs[i], vy = 0.57 - Math.abs(vz - 0.15) * 0.04;
            g.sph(0.18 - i * 0.01, 0.042, 0.07, 0, vy, vz, 0xffaa30, { s: [6, 4] });
          }
        }
      }
    ],
    neck: {
      y: 1.16, z: 0.62, len: 0.62, up: 0.92, r0: 0.22, r1: 0.15, hs: 4, col: bc,
      extra: function (g) {
        for (var i = 0; i < 3; i++) {
          var nz = 0.14 + i * 0.16;
          g.sph(0.11 - i * 0.012, 0.06, 0.09, 0, -0.12 + i * 0.01, nz, BELLY, { s: [5, 4] });
          g.cone(0.052, 0.22 - i * 0.02, 0, 0.16 - i * 0.01, nz, SPINE, { seg: 5, rot: [-0.55, 0, 0] });
        }
      }
    },
    hpitch: 0.75, eatY: 0.22,
    head: function (g) {
      dragonHeadBase(g, 0.52, bc, true);
      // iconic wide-brimmed cavalier hat, gold band & sweeping golden feather plume
      g.cyl(0.30, 0.32, 0.028, 0.012, 0.19, 0.04, HAT, { seg: 14, rot: [-0.08, 0, -0.13] });
      g.cyl(0.145, 0.165, 0.16, 0.022, 0.275, 0.035, HAT, { seg: 12, rot: [-0.08, 0, -0.13] });
      g.cyl(0.166, 0.169, 0.034, 0.017, 0.215, 0.038, GD, { seg: 12, rot: [-0.08, 0, -0.13] });
      g.limb(0.13, 0.23, 0.05, 0.24, 0.44, -0.09, 0.028, 0.046, GD, { seg: 5 });
      g.limb(0.24, 0.44, -0.09, 0.28, 0.56, -0.29, 0.046, 0.014, shade(GD, 1.08), { seg: 5 });
    },
    headGlow: dragonHeadGlow(0.52),
    legs: {
      fx: 0.32, fy: 0.68, fz: 0.48, hy: 0.68, hz: -0.52, hx: 0.34, fLen: 0.68, hLen: 0.68, kf: 0.45,
      fr: [0.135, 0.10, 0.082], hr: [0.15, 0.105, 0.082], shoulder: [0.16, 0.19, 0.18], haunch: [0.19, 0.23, 0.22],
      col: function (y) { return y < -0.25 ? PR_DK : PR; },
      foot: { type: 'boot', col: BT, cuffCol: BT2, buckleCol: GD, h: 0.085 }
    },
    tail: {
      y: 0.92, z: -0.84, n: 4, len: 1.55, r0: 0.115, r1: 0.082, seg: 7, hs: 4,
      col: function (i, x, y, z) { return fract(-z * 6.0 + i * 0.25) < 0.34 ? STR : OR; },
      up: 0.28, curl: 0.26,
      tip: function (g, sl) {
        g.sph(0.10, 0.10, 0.125, 0, 0, -sl * 1.02, CR, { s: [7, 5] });
      }
    },
    wingAt: [0.34, 1.24, 0.30],
    wings: function (r) { return dragonWing(0.44, r); },
    fold: { fa: -0.95, fb: 1.9, ha: -0.95, hb: 1.9, splay: 0.24, hp: 0.55, hy: 0.75, lieY: 0.45 }
  };

  // ---- DRASSY (female hybrid: larger sleek ginger cat body + purple dragon head, wings & dorsal crest)
  var catBody = function (x, y, z, nx, ny) {
    if (ny < -0.44 || (z > 1.02 && ny < 0.08)) return CR;
    return fract(z * 4.2 + sin(y * 3.5 + x * 2) * 0.4) < 0.28 ? STR : OR;
  };
  QUADS.drassy = {
    id: 'drassy', cy: 1.18, hl: 1.24, hh: 0.42, height: 2.55, size: 1.95, walkA: 0.45, runA: 0.80, bend: 0.88, babyScale: 0.46, babyHead: 1.38, hopH: 1.05,
    body: function (g) {
      g.torso({ z0: -1.35, z1: 1.25, n: 22, seg: 14, rxA: 0.36, rxB: 0.42, ryA: 0.42, ryB: 0.49, ycA: 1.14, ycB: 1.24 }, catBody);
      // subtle purple dragon dorsal spines & ridge crest along the cat's spine
      for (var i = 0; i < 7; i++) {
        var sz = 0.88 - i * 0.31, sy = 1.66 - Math.abs(sz) * 0.07, sh = 0.30 - i * 0.016;
        g.sph(0.07, 0.055, 0.13, 0, sy - 0.02, sz, PR_DK, { s: [5, 4] });
        g.cone(0.075, sh, 0, sy + sh * 0.34, sz, i % 2 ? SPINE : PR, { seg: 5, rot: [-0.52, 0, 0] });
      }
    },
    neck: {
      y: 1.38, z: 0.94, len: 0.56, up: 0.72, r0: 0.25, r1: 0.19, hs: 4,
      col: function (x, y, z, nx, ny) {
        if (z < 0.20) return ny < -0.4 ? CR : (fract(z * 6.5) < 0.28 ? STR : OR);
        if (z < 0.34) return mixHex(ny < -0.4 ? CR : OR, ny < -0.4 ? BELLY : PR, (z - 0.20) / 0.14);
        return ny < -0.4 ? BELLY : PR;
      },
      extra: function (g) {
        for (var i = 0; i < 3; i++) {
          var nz = 0.16 + i * 0.14;
          g.cone(0.055, 0.22 - i * 0.02, 0, 0.18 - i * 0.01, nz, i % 2 ? PR : SPINE, { seg: 5, rot: [-0.55, 0, 0] });
        }
      }
    },
    hpitch: 0.65, eatY: 0.26,
    head: function (g) { dragonHeadBase(g, 0.62, bc, false); },
    headGlow: dragonHeadGlow(0.62),
    legs: {
      hs: 4, fx: 0.19, fy: 0.90, fz: 0.72, hy: 0.88, hz: -0.84, hx: 0.20, fLen: 0.90, hLen: 0.88,
      fr: [0.13, 0.095, 0.078], hr: [0.15, 0.098, 0.078], haunch: [0.18, 0.24, 0.27],
      col: function (y) { return y < -0.70 ? CR : (fract(y * 7.5) < 0.28 ? STR : OR); },
      foot: { type: 'paw', col: 0x222222, h: 0.095, pawCol: CR, claws: true }
    },
    tail: {
      y: 1.18, z: -1.24, n: 4, len: 1.65, r0: 0.072, r1: 0.048, hs: 4,
      col: function (i, x, y, z) { return fract(-z * 6.5 + i * 0.35) < 0.30 ? STR : OR; },
      up: -0.45, curl: 0.26,
      tip: function (g, sl) { tuft(g, -sl, 0.056, 0.10, STR); }
    },
    wingAt: [0.34, 1.54, 0.42],
    wings: function (r) { return dragonWing(0.58, r); },
    fold: { roll: 0.10, hp: 0.55, hy: 0.85 }
  };
})();

function spotDist(x, y, z, scale) {
  var X = x * scale, Y = y * scale, Z = z * scale, ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z), d1 = 9;
  for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) for (var c = -1; c <= 1; c++) {
    var cx = ix + a, cy = iy + b, cz = iz + c;
    var px = cx + hash3(cx, cy, cz), py = cy + hash3(cx + 7, cy, cz), pz = cz + hash3(cx, cy + 5, cz + 3);
    var d = (px - X) * (px - X) + (py - Y) * (py - Y) + (pz - Z) * (pz - Z);
    if (d < d1) d1 = d;
  }
  return Math.sqrt(d1);
}

// ---- JAGUAR
(function () {
  var GW = 0xd89b3c, CTR = 0xb87622, BL = 0xf2d9a8, DK = 0x221812;
  var rosette = function (x, y, z, nx, ny) {
    if (ny < -0.45) return spotDist(x, y, z, 5.2) < 0.16 ? DK : BL;
    var d = spotDist(x, y, z, 4.6);
    if (d < 0.13) return CTR;
    if (d < 0.25) return DK;
    return GW;
  };
  QUADS.jaguar = {
    id: 'jaguar', cy: 0.78, hl: 0.82, hh: 0.32, height: 1.32, size: 0.95, walkA: 0.45, runA: 0.8, bend: 0.9, babyScale: 0.5, babyHead: 1.35,
    body: function (g) { g.torso({ z0: -0.92, z1: 0.84, n: 20, seg: 14, rxA: 0.29, rxB: 0.32, ryA: 0.32, ryB: 0.36, ycA: 0.76, ycB: 0.82 }, rosette); },
    neck: { y: 0.90, z: 0.62, len: 0.26, up: 0.42, r0: 0.2, r1: 0.175, hs: 3, col: function (x, y, z, nx, ny) { return ny < -0.45 ? BL : (spotDist(x, y, z, 5.5) < 0.22 ? DK : GW); } },
    hpitch: 0.3, eatY: 0.18,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        if (z > 0.17 && ny < 0.2) return BL;
        return spotDist(x, y, z, 9.5) < 0.2 ? DK : GW;
      };
      g.sph(0.165, 0.145, 0.175, 0, 0, 0.09, hc, { s: [9, 6] });
      g.sph(0.098, 0.072, 0.11, 0, -0.055, 0.24, BL, { s: [7, 5] });
      g.sph(0.18, 0.08, 0.09, 0, -0.045, 0.11, function (x, y, z, nx, ny) { return ny < 0.2 ? BL : GW; }, { s: [8, 5] });
      g.sph(0.038, 0.028, 0.028, 0, -0.025, 0.34, 0x2a1a18, { s: [5, 4] });
      eyePair(g, 0.088, 0.055, 0.195, 0.024, 0xc89a20);
    },
    earAt: [0, 0.09, 0.0], ears: function (g) {
      earBall(g, 0.115, 0.15, 0.0, 0.056, GW, 0xd8a898);
      earBall(g, -0.115, 0.15, 0.0, 0.056, GW, 0xd8a898);
      g.sph(0.032, 0.032, 0.022, 0.125, 0.185, -0.015, DK, { s: [4, 3] });
      g.sph(0.032, 0.032, 0.022, -0.125, 0.185, -0.015, DK, { s: [4, 3] });
    },
    legs: {
      hs: 4, fx: 0.14, fy: 0.56, fz: 0.44, hy: 0.55, hz: -0.52, hx: 0.15, fLen: 0.56, hLen: 0.55,
      fr: [0.095, 0.072, 0.06], hr: [0.11, 0.072, 0.06], haunch: [0.13, 0.17, 0.19],
      col: function (y, ny, front, x, z) { return y < -0.45 ? BL : (spotDist(x || 0, y, z || 0, 7.0) < 0.22 ? DK : GW); },
      foot: { type: 'paw', col: 0x222222, h: 0.065, pawCol: BL }
    },
    tail: {
      y: 0.80, z: -0.78, n: 3, len: 0.85, r0: 0.048, r1: 0.036, hs: 4,
      col: function (i, x, y, z) { return i === 2 && z < -0.12 ? DK : (spotDist(x, y, z - i * 0.28, 7.5) < 0.24 ? DK : GW); },
      up: -0.6, curl: 0.16,
      tip: function (g, sl) { tuft(g, -sl, 0.042, 0.08, DK); }
    },
    fold: { roll: 0.12, hp: 0.6, hy: 0.9 }
  };
})();

// ---- CHEETAH
(function () {
  var TAN = 0xe2b254, BL = 0xf5e5c0, DK = 0x1e1814;
  var spotted = function (x, y, z, nx, ny) {
    if (ny < -0.45) return BL;
    return spotDist(x, y, z, 6.2) < 0.20 ? DK : TAN;
  };
  QUADS.cheetah = {
    id: 'cheetah', cy: 0.90, hl: 0.85, hh: 0.28, height: 1.45, size: 0.92, walkA: 0.46, runA: 0.92, bend: 0.95, babyScale: 0.5, babyHead: 1.38,
    body: function (g) { g.torso({ z0: -0.88, z1: 0.84, n: 20, seg: 14, rxA: 0.23, rxB: 0.26, ryA: 0.26, ryB: 0.34, ycA: 0.88, ycB: 0.94 }, spotted); },
    neck: { y: 1.04, z: 0.64, len: 0.32, up: 0.55, r0: 0.16, r1: 0.135, hs: 3, col: function (x, y, z, nx, ny) { return ny < -0.45 ? BL : (spotDist(x, y, z, 7.5) < 0.20 ? DK : TAN); } },
    hpitch: 0.4, eatY: 0.18,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) {
        if (z > 0.14 && ny < 0.25) return BL;
        return spotDist(x, y, z, 11.0) < 0.18 ? DK : TAN;
      };
      g.sph(0.13, 0.12, 0.145, 0, 0, 0.08, hc, { s: [9, 6] });
      g.sph(0.075, 0.06, 0.09, 0, -0.045, 0.20, BL, { s: [7, 5] });
      g.sph(0.03, 0.024, 0.024, 0, -0.02, 0.28, DK, { s: [5, 4] });
      // signature black tear marks from eyes down to muzzle
      g.limb(0.058, 0.032, 0.19, 0.046, -0.052, 0.245, 0.014, 0.011, DK, { seg: 4 });
      g.limb(-0.058, 0.032, 0.19, -0.046, -0.052, 0.245, 0.014, 0.011, DK, { seg: 4 });
      eyePair(g, 0.07, 0.045, 0.165, 0.022, 0xc88a18);
    },
    earAt: [0, 0.08, 0.0], ears: function (g) {
      earBall(g, 0.095, 0.13, -0.01, 0.046, TAN, 0xe8c4b0);
      earBall(g, -0.095, 0.13, -0.01, 0.046, TAN, 0xe8c4b0);
      g.sph(0.028, 0.028, 0.02, 0.10, 0.14, -0.03, DK, { s: [4, 3] });
      g.sph(0.028, 0.028, 0.02, -0.10, 0.14, -0.03, DK, { s: [4, 3] });
    },
    legs: {
      hs: 5, fx: 0.125, fy: 0.72, fz: 0.45, hy: 0.72, hz: -0.52, hx: 0.135, fLen: 0.72, hLen: 0.72,
      fr: [0.075, 0.05, 0.042], hr: [0.09, 0.055, 0.042], haunch: [0.11, 0.16, 0.17],
      col: function (y, ny, front, x, z) { return y < -0.58 ? BL : (spotDist(x || 0, y, z || 0, 8.0) < 0.20 ? DK : TAN); },
      foot: { type: 'paw', col: 0x222222, h: 0.055, pawCol: BL }
    },
    tail: {
      y: 0.90, z: -0.78, n: 3, len: 1.05, r0: 0.045, r1: 0.032, hs: 4,
      col: function (i, x, y, z) { return i === 2 ? (z < -0.18 ? BL : DK) : (fract(-z * 6 + i * 0.4) < 0.32 ? DK : TAN); },
      up: -0.5, curl: 0.18,
      tip: function (g, sl) { tuft(g, -sl, 0.038, 0.075, BL); }
    },
    fold: { roll: 0.08, hp: 0.6, hy: 0.9 }
  };
})();

// ---- HYENA
(function () {
  var TAN = 0xb89668, LT = 0xd2b890, DK = 0x3e2d20, MUZ = 0x2e221a;
  var bc = function (x, y, z, nx, ny) {
    if (ny > 0.65 && z > 0.05) return DK; // dorsal mane ridge
    if (ny < -0.45) return LT;
    return spotDist(x, y, z, 4.4) < 0.21 ? DK : TAN;
  };
  QUADS.hyena = {
    id: 'hyena', cy: 0.80, hl: 0.78, hh: 0.32, height: 1.38, size: 0.88, walkA: 0.42, runA: 0.74, bend: 0.85, babyScale: 0.5, babyHead: 1.35,
    body: function (g) {
      // sloping back: higher front shoulders (ycB=0.90), lower rump (ycA=0.72)
      g.torso({ z0: -0.82, z1: 0.76, n: 18, seg: 14, rxA: 0.24, rxB: 0.30, ryA: 0.27, ryB: 0.36, ycA: 0.72, ycB: 0.90 }, bc);
      for (var i = 0; i < 6; i++) {
        var zz = -0.15 + i * 0.16, yy = lerp(0.99, 1.24, i / 5);
        g.cone(0.055, 0.14, 0, yy, zz, DK, { seg: 4, rot: [-0.35, 0, 0] });
      }
    },
    neck: {
      y: 1.0, z: 0.56, len: 0.30, up: 0.48, r0: 0.22, r1: 0.17, hs: 3, col: TAN,
      extra: function (g) { for (var i = 0; i < 4; i++) g.cone(0.05, 0.13, 0, 0.19, 0.05 + i * 0.07, DK, { seg: 4, rot: [-0.3, 0, 0] }); }
    },
    hpitch: 0.42, eatY: 0.18,
    head: function (g) {
      g.sph(0.155, 0.14, 0.16, 0, 0, 0.08, TAN, { s: [8, 6] });
      g.sph(0.09, 0.075, 0.14, 0, -0.04, 0.23, MUZ, { s: [7, 5] });
      g.sph(0.042, 0.032, 0.032, 0, -0.02, 0.36, 0x181210, { s: [5, 4] });
      eyePair(g, 0.082, 0.05, 0.17, 0.022, 0x1c1410);
    },
    earAt: [0, 0.11, -0.01], ears: function (g) {
      earBall(g, 0.125, 0.165, -0.01, 0.09, TAN, 0x523c2c);
      earBall(g, -0.125, 0.165, -0.01, 0.09, TAN, 0x523c2c);
    },
    legs: {
      hs: 4, fx: 0.14, fy: 0.64, fz: 0.42, hy: 0.52, hz: -0.48, hx: 0.14, fLen: 0.64, hLen: 0.52,
      fr: [0.085, 0.06, 0.05], hr: [0.095, 0.06, 0.048], haunch: [0.11, 0.15, 0.16],
      col: function (y, ny, front, x, z) { return y < -0.35 ? DK : (spotDist(x || 0, y, z || 0, 6.5) < 0.20 ? DK : TAN); },
      foot: { type: 'paw', col: 0x221a14, h: 0.055, pawCol: DK }
    },
    tail: {
      y: 0.74, z: -0.74, n: 2, len: 0.52, r0: 0.055, r1: 0.075, col: DK, up: -0.65, curl: -0.1,
      tip: function (g, sl) { tuft(g, -sl * 0.85, 0.08, 0.12, DK); }
    },
    fold: { roll: 0.12, hp: 0.7, hy: 0.8 }
  };
})();

// ---- KOMODO DRAGON
(function () {
  var OL = 0x5b5d4e, DK = 0x45473b, LT = 0x7c7b6a, TNG = 0xd9667a;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.3) return LT;
    var h = hash3(Math.floor(x * 16), Math.floor(y * 16), Math.floor(z * 12));
    return h > 0.62 ? DK : (h < 0.2 ? shade(OL, 1.12) : OL);
  };
  QUADS.komodo_dragon = {
    id: 'komodo_dragon', cy: 0.32, hl: 0.95, hh: 0.22, height: 0.58, size: 0.6, walkA: 0.35, runA: 0.55, bend: 0.6, babyScale: 0.38, babyHead: 1.3, swimDrop: 0.22, hopH: 0.3,
    body: function (g) {
      g.torso({ z0: -0.88, z1: 0.82, n: 18, seg: 12, rxA: 0.28, rxB: 0.32, ryA: 0.21, ryB: 0.24, ycA: 0.31, ycB: 0.34 }, bc);
    },
    neck: { y: 0.37, z: 0.68, len: 0.24, up: 0.12, r0: 0.20, r1: 0.16, hs: 3, col: bc },
    hpitch: 0.05, eatNA: 0.0, eatHP: 0.45, eatTP: 0.0,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return ny < -0.3 ? LT : (hash3(Math.floor(x * 18), Math.floor(y * 18), Math.floor(z * 14)) > 0.65 ? DK : OL); };
      g.sph(0.16, 0.105, 0.20, 0, 0, 0.10, hc, { s: [8, 6] });
      g.sph(0.115, 0.072, 0.20, 0, -0.02, 0.31, hc, { s: [8, 5] });
      g.sph(0.105, 0.04, 0.18, 0, -0.065, 0.28, LT, { s: [7, 4] });
      // nostrils
      g.sph(0.016, 0.014, 0.014, 0.045, 0.015, 0.47, 0x22231c, { s: [4, 3] });
      g.sph(0.016, 0.014, 0.014, -0.045, 0.015, 0.47, 0x22231c, { s: [4, 3] });
      // forked pink tongue
      g.limb(0, -0.035, 0.46, 0, -0.04, 0.62, 0.015, 0.011, TNG, { seg: 4 });
      g.limb(0, -0.04, 0.62, 0.03, -0.045, 0.70, 0.01, 0.004, TNG, { seg: 4 });
      g.limb(0, -0.04, 0.62, -0.03, -0.045, 0.70, 0.01, 0.004, TNG, { seg: 4 });
      eyePair(g, 0.115, 0.045, 0.18, 0.024, 0x1a1812);
    },
    legs: {
      fx: 0.25, fy: 0.26, fz: 0.52, hy: 0.26, hz: -0.50, hx: 0.26, fLen: 0.36, hLen: 0.36,
      fr: [0.09, 0.07, 0.055], hr: [0.105, 0.075, 0.055], col: OL, splay: 0.82,
      foot: { type: 'toes', col: DK, h: 0.045 }
    },
    tail: {
      y: 0.30, z: -0.82, n: 4, len: 1.75, r0: 0.19, r1: 0.032, seg: 6,
      col: function (i, x, y, z, nx, ny) { return ny < -0.35 ? LT : (hash3(Math.floor(x * 14), Math.floor(y * 14), Math.floor(z * 10) + i) > 0.65 ? DK : OL); },
      up: -0.03, curl: 0
    },
    tailF: 1.15,
    fold: { fa: 0.0, fb: 0.3, ha: 0.0, hb: 0.3, splay: 0.0, hp: 0.0, hy: 0.3, lieY: 0.20, na: 0 }
  };
})();

// ---- TORTOISE
(function () {
  var SH1 = 0x4d5438, SH2 = 0x6b6040, RIM = 0x3a3f29, PL = 0x9e926e, SK = 0x6c6852, SK_DK = 0x524f3e;
  // Hexagonal-style scute vertex shading across the domed carapace
  var hexShell = function (x, y, z, nx, ny) {
    if (ny < -0.35) return PL;
    var sx = x * 5.2, sz = z * 4.4;
    var row = Math.floor(sz / 0.866);
    var col = Math.floor(sx + (row & 1 ? 0.5 : 0));
    var cx = col - (row & 1 ? 0.5 : 0) + 0.5, cz = (row + 0.5) * 0.866;
    var dx = sx - cx, dz = sz - cz, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.42) return SH1;
    return d < 0.25 ? SH2 : mixHex(SH2, SH1, (d - 0.25) / 0.17);
  };
  QUADS.tortoise = {
    id: 'tortoise', cy: 0.34, hl: 0.60, hh: 0.24, height: 0.72, size: 0.72, walkA: 0.28, runA: 0.40, bend: 0.2,
    babyScale: 0.42, babyHead: 1.35, hopH: 0.15, lieY: 0.24,
    body: function (g) {
      // sculpted fluted domed carapace with flared marginal rim & plastron
      g.lathe([[0.48, 0.24], [0.51, 0.29], [0.47, 0.42], [0.39, 0.58], [0.26, 0.72], [0.1, 0.79], [0.005, 0.81]], hexShell, { seg: 14, sx: 0.94, sz: 1.15, ridgeN: 10, ridgeA: 0.045, cap0: true });
      g.lathe([[0.46, 0.21], [0.51, 0.25], [0.48, 0.29]], RIM, { seg: 14, sx: 0.96, sz: 1.16 });
      g.loft([[-0.44, 0.24, 0.06, 0.22], [0, 0.41, 0.08, 0.21], [0.44, 0.24, 0.06, 0.22]], { rings: 8, seg: 10, cap0: true, cap1: true, flatBot: 0.85 }, PL);
    },
    neck: {
      y: 0.32, z: 0.44, len: 0.30, up: 0.22, r0: 0.10, r1: 0.08, hs: 5,
      col: function (x, y, z) { return fract(z * 16) < 0.28 ? SK_DK : SK; }
    },
    hpitch: 0.15, eatY: 0.12, eatTP: 0.04, eatHP: 0.55,
    head: function (g) {
      g.sph(0.095, 0.088, 0.115, 0, 0, 0.06, SK, { s: [8, 6] });
      g.sph(0.072, 0.055, 0.08, 0, -0.025, 0.13, SK_DK, { s: [7, 5] });
      g.sph(0.062, 0.032, 0.05, 0, -0.052, 0.13, 0x867e62, { s: [6, 4] });
      g.sph(0.012, 0.012, 0.012, 0.025, -0.005, 0.20, 0x222018, { s: [4, 3] });
      g.sph(0.012, 0.012, 0.012, -0.025, -0.005, 0.20, 0x222018, { s: [4, 3] });
      eyePair(g, 0.068, 0.025, 0.11, 0.02, 0x181510);
    },
    legs: {
      fx: 0.28, fy: 0.25, fz: 0.34, hy: 0.25, hz: -0.34, hx: 0.28, fLen: 0.25, hLen: 0.25,
      fr: [0.095, 0.09, 0.09], hr: [0.10, 0.09, 0.09], two: true, kf: 0.5, splay: 0.22,
      col: function (y) { return fract(y * 18) < 0.25 ? SK_DK : SK; },
      foot: { type: 'toes', col: 0x3b382c, h: 0.04 }
    },
    tail: { y: 0.24, z: -0.50, n: 1, len: 0.14, r0: 0.048, r1: 0.016, col: SK, up: -0.25 },
    fold: { fa: -0.55, fb: 0.4, ha: -0.55, hb: 0.4, splay: 0.55, hp: 0.25, hy: 0.15, na: -0.15 }
  };
})();

// ---- CAPYBARA
(function () {
  var BR = 0x7c5838, DK = 0x65452a, LT = 0x8d6846, NOSE = 0x362418;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.5) return LT;
    return hash3(Math.floor(x * 12), Math.floor(y * 12), Math.floor(z * 12)) > 0.6 ? DK : BR;
  };
  QUADS.capybara = {
    id: 'capybara', cy: 0.45, hl: 0.60, hh: 0.28, height: 0.78, size: 0.72, walkA: 0.38, runA: 0.62, bend: 0.45,
    babyScale: 0.48, babyHead: 1.35, swimDrop: 0.34, hopH: 0.55,
    body: function (g) {
      g.torso({ z0: -0.60, z1: 0.54, n: 16, seg: 12, rxA: 0.27, rxB: 0.26, ryA: 0.28, ryB: 0.29, ycA: 0.45, ycB: 0.47 }, bc);
    },
    neck: { y: 0.52, z: 0.44, len: 0.14, up: 0.20, r0: 0.195, r1: 0.175, col: BR },
    hpitch: 0.18, eatY: 0.12, eatNA: -0.35, eatHP: 0.65,
    head: function (g) {
      // broad cranium + smoothly sculpted rounded-square barrel snout (no cube edges)
      g.loft([[-0.06, 0.11, 0.11, 0.02], [0.07, 0.145, 0.14, 0.02], [0.22, 0.108, 0.095, -0.008], [0.33, 0.095, 0.082, -0.015], [0.365, 0.062, 0.056, -0.018]], { rings: 10, seg: 12, cap0: true, cap1: true, superPow: 0.72 }, function (zc, ca, sa, x, y, z) { return z > 0.14 ? DK : BR; });
      g.sph(0.019, 0.018, 0.016, 0.042, 0.03, 0.355, NOSE, { s: [5, 4] });
      g.sph(0.019, 0.018, 0.016, -0.042, 0.03, 0.355, NOSE, { s: [5, 4] });
      g.tube([[-0.055, -0.055, 0.33], [0, -0.06, 0.355], [0.055, -0.055, 0.33]], 0.009, NOSE, { seg: 5, steps: 2 });
      eyePair(g, 0.112, 0.09, 0.14, 0.02, 0x15100c);
    },
    earAt: [0, 0.14, -0.02], ears: function (g) {
      earBall(g, 0.115, 0.15, -0.02, 0.04, DK, 0x48301e);
      earBall(g, -0.115, 0.15, -0.02, 0.04, DK, 0x48301e);
    },
    legs: {
      fx: 0.155, fy: 0.30, fz: 0.33, hy: 0.31, hz: -0.36, hx: 0.165, fLen: 0.30, hLen: 0.31,
      fr: [0.072, 0.055, 0.048], hr: [0.088, 0.058, 0.048], haunch: [0.10, 0.13, 0.14],
      col: function (y) { return y < -0.2 ? DK : BR; },
      foot: { type: 'toes', col: 0x3b2818, h: 0.04 }
    },
    fold: { roll: 0.08, hp: 0.55, hy: 0.5 }
  };
})();

// ---- ALPACA
(function () {
  var WH = 0xf0e8d8, CR = 0xe2d6c0, MUZ = 0xdbc9ae, DK = 0x3c3228;
  var wool = function (x, y, z) {
    return hash3(Math.floor(x * 11), Math.floor(y * 11), Math.floor(z * 11)) > 0.55 ? CR : WH;
  };
  QUADS.alpaca = {
    id: 'alpaca', cy: 0.92, hl: 0.64, hh: 0.32, height: 1.65, size: 1.02, walkA: 0.40, runA: 0.65, bend: 0.75,
    babyScale: 0.50, babyHead: 1.38, hopH: 1.1,
    body: function (g) {
      g.torso({ z0: -0.62, z1: 0.56, n: 18, seg: 12, rxA: 0.28, rxB: 0.27, ryA: 0.31, ryB: 0.32, ycA: 0.90, ycB: 0.94 }, wool);
      // fluffy fleece puffs
      g.sph(0.28, 0.26, 0.32, 0, 0.96, 0.34, WH, { s: [8, 6] });
      g.sph(0.29, 0.26, 0.34, 0, 0.94, -0.28, CR, { s: [8, 6] });
    },
    neck: {
      y: 1.06, z: 0.42, len: 0.66, up: 1.05, r0: 0.16, r1: 0.115, hs: 6, col: wool,
      extra: function (g) {
        for (var i = 0; i < 4; i++) {
          var z = 0.08 + i * 0.15, r = lerp(0.15, 0.11, z / 0.66);
          g.sph(r * 1.12, r * 1.12, 0.10, 0, 0, z, i % 2 ? WH : CR, { s: [6, 5] });
        }
      }
    },
    hpitch: 0.95, eatY: 0.18,
    head: function (g) {
      g.sph(0.105, 0.11, 0.13, 0, 0.0, 0.06, WH, { s: [8, 6] });
      // fluffy crown tuft
      g.sph(0.09, 0.075, 0.09, 0, 0.09, 0.06, CR, { s: [6, 5] });
      // gentle tapered snout
      g.sph(0.065, 0.06, 0.10, 0, -0.04, 0.18, MUZ, { s: [7, 5] });
      g.sph(0.024, 0.018, 0.018, 0, -0.025, 0.275, DK, { s: [4, 3] });
      eyePair(g, 0.082, 0.035, 0.125, 0.024, 0x1a1410);
    },
    earAt: [0, 0.09, -0.02], ears: function (g) {
      earCone(g, 0.068, 0.19, -0.02, 0.04, 0.18, 0.14, CR, 0xd8a8a0);
      earCone(g, -0.068, 0.19, -0.02, 0.04, 0.18, 0.14, CR, 0xd8a8a0);
    },
    legs: {
      fx: 0.135, fy: 0.68, fz: 0.35, hy: 0.68, hz: -0.38, hx: 0.145, fLen: 0.68, hLen: 0.68,
      fr: [0.082, 0.048, 0.038], hr: [0.092, 0.052, 0.038], haunch: [0.11, 0.16, 0.14],
      col: function (y) { return y > -0.26 ? WH : CR; },
      foot: { type: 'toes', col: DK, h: 0.05 }
    },
    tail: {
      y: 0.95, z: -0.58, n: 1, len: 0.24, r0: 0.072, r1: 0.06, col: WH, up: -0.65,
      tip: function (g, sl) { tuft(g, -sl * 0.85, 0.075, 0.09, CR); }
    },
    fold: { fa: -1.25, ha: -1.2, splay: 0.15, hp: 0.85, hy: 0.7 }
  };
})();

// ---- FENNEC FOX
(function () {
  var SD = 0xe6cfa4, CR = 0xf7ebd2, EAR_IN = 0xe8b4a0, TIP = 0x3b2c22;
  var bc = function (x, y, z, nx, ny) { return ny < -0.3 ? CR : SD; };
  QUADS.fennec_fox = {
    id: 'fennec_fox', cy: 0.32, hl: 0.36, hh: 0.14, height: 0.56, size: 0.38, walkA: 0.48, runA: 0.85, bend: 0.9,
    babyScale: 0.55, babyHead: 1.32, hopH: 0.85,
    body: function (g) {
      g.torso({ z0: -0.36, z1: 0.34, n: 16, seg: 12, rxA: 0.105, rxB: 0.115, ryA: 0.12, ryB: 0.13, ycA: 0.31, ycB: 0.33 }, bc);
    },
    neck: { y: 0.36, z: 0.24, len: 0.10, up: 0.52, r0: 0.072, r1: 0.062, col: SD },
    hpitch: 0.42, eatY: 0.06, eatNA: -0.3, eatHP: 0.75,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return (ny < 0.0 && z > 0.04) ? CR : SD; };
      g.sph(0.088, 0.078, 0.092, 0, 0, 0.05, hc, { s: [8, 6] });
      g.sph(0.042, 0.036, 0.085, 0, -0.025, 0.14, CR, { s: [6, 5] });
      g.sph(0.016, 0.014, 0.014, 0, -0.015, 0.22, 0x1a1412, { s: [4, 3] });
      eyePair(g, 0.052, 0.025, 0.108, 0.018, 0x150f0a);
    },
    earAt: [0, 0.055, -0.01], ears: function (g) {
      // signature HUGE oversized triangular desert ears with rosy inner ears
      earCone(g, 0.082, 0.19, -0.01, 0.075, 0.25, 0.38, SD, EAR_IN);
      earCone(g, -0.082, 0.19, -0.01, 0.075, 0.25, 0.38, SD, EAR_IN);
    },
    legs: {
      fx: 0.065, fy: 0.23, fz: 0.20, hy: 0.23, hz: -0.22, hx: 0.068, fLen: 0.23, hLen: 0.23,
      fr: [0.035, 0.024, 0.02], hr: [0.042, 0.024, 0.02], haunch: [0.055, 0.075, 0.075],
      col: function (y) { return y < -0.14 ? CR : SD; },
      foot: { type: 'paw', col: CR, h: 0.025, pawCol: CR }
    },
    tail: {
      y: 0.33, z: -0.32, n: 2, len: 0.44, r0: 0.038, r1: 0.062, col: SD, up: -0.42, curl: 0.14,
      tip: function (g, sl) { tuft(g, -sl * 0.78, 0.058, 0.08, TIP); }
    },
    fold: { roll: 0.18, hp: 0.75, hy: 0.9 }
  };
})();

// ---- OTTER
(function () {
  var BR = 0x4d3626, DK = 0x38261a, CR = 0xdccab0;
  var bc = function (x, y, z, nx, ny) {
    if (z > 0.30 && ny < 0.05) return CR;
    if (ny < -0.4) return shade(BR, 1.15);
    return hash3(Math.floor(x * 14), Math.floor(y * 14), Math.floor(z * 12)) > 0.75 ? DK : BR;
  };
  QUADS.otter = {
    id: 'otter', cy: 0.25, hl: 0.70, hh: 0.15, height: 0.48, size: 0.56, walkA: 0.42, runA: 0.72, bend: 0.75,
    babyScale: 0.45, babyHead: 1.32, swimDrop: 0.16, hopH: 0.55,
    body: function (g) {
      g.torso({ z0: -0.70, z1: 0.64, n: 18, seg: 12, rxA: 0.16, rxB: 0.165, ryA: 0.145, ryB: 0.16, ycA: 0.24, ycB: 0.27 }, bc);
    },
    neck: {
      y: 0.30, z: 0.52, len: 0.18, up: 0.24, r0: 0.135, r1: 0.12, hs: 3,
      col: function (x, y, z, nx, ny) { return ny < 0.0 ? CR : BR; }
    },
    hpitch: 0.15, eatY: 0.08, eatNA: -0.3, eatHP: 0.65,
    head: function (g) {
      var hc = function (x, y, z, nx, ny) { return (ny < -0.15 && z > 0.03) ? CR : BR; };
      g.sph(0.112, 0.088, 0.125, 0, 0, 0.07, hc, { s: [8, 6] });
      g.sph(0.068, 0.05, 0.065, 0, -0.025, 0.165, CR, { s: [6, 5] });
      g.sph(0.026, 0.02, 0.02, 0, -0.008, 0.22, 0x1a1210, { s: [5, 4] });
      eyePair(g, 0.064, 0.035, 0.155, 0.017, 0x100c08);
    },
    earAt: [0, 0.05, 0.0], ears: function (g) {
      earBall(g, 0.095, 0.05, 0.0, 0.026, BR, 0x6e4f3a);
      earBall(g, -0.095, 0.05, 0.0, 0.026, BR, 0x6e4f3a);
    },
    legs: {
      fx: 0.115, fy: 0.18, fz: 0.38, hy: 0.18, hz: -0.42, hx: 0.125, fLen: 0.18, hLen: 0.18,
      fr: [0.05, 0.038, 0.034], hr: [0.058, 0.04, 0.036], col: BR, splay: 0.25,
      foot: { type: 'toes', col: DK, h: 0.03 }
    },
    tail: {
      y: 0.24, z: -0.64, n: 3, len: 0.85, r0: 0.115, r1: 0.024, seg: 6,
      col: function (i, x, y, z, nx, ny) { return ny < -0.4 ? shade(BR, 1.1) : BR; },
      up: -0.08, curl: 0.04
    },
    fold: { roll: 0.12, hp: 0.55, hy: 0.7 }
  };
})();

// ---- ARCTIC FOX
(function () {
  var WH = 0xf4f6f9, CG = 0xdce2ea, NOSE = 0x1a1c22;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.3) return CG;
    return hash3(Math.floor(x * 10), Math.floor(y * 10), Math.floor(z * 10)) > 0.74 ? CG : WH;
  };
  QUADS.arctic_fox = {
    id: 'arctic_fox', cy: 0.36, hl: 0.44, hh: 0.18, height: 0.64, size: 0.50, walkA: 0.46, runA: 0.82, bend: 0.85,
    babyScale: 0.52, babyHead: 1.35, hopH: 0.9,
    body: function (g) {
      g.torso({ z0: -0.45, z1: 0.41, n: 18, seg: 12, rxA: 0.15, rxB: 0.165, ryA: 0.16, ryB: 0.175, ycA: 0.35, ycB: 0.37 }, bc);
    },
    neck: {
      y: 0.42, z: 0.29, len: 0.14, up: 0.50, r0: 0.115, r1: 0.10, col: WH,
      extra: function (g) { g.sph(0.135, 0.115, 0.09, 0, -0.01, 0.05, WH, { s: [7, 5] }); }
    },
    hpitch: 0.42, eatY: 0.08, eatNA: -0.3, eatHP: 0.75,
    head: function (g) {
      g.sph(0.112, 0.095, 0.115, 0, 0, 0.06, function (x, y, z, nx, ny) { return ny < -0.25 ? CG : WH; }, { s: [8, 6] });
      g.sph(0.055, 0.045, 0.095, 0, -0.025, 0.175, WH, { s: [6, 5] });
      g.sph(0.02, 0.016, 0.016, 0, -0.015, 0.265, NOSE, { s: [4, 3] });
      eyePair(g, 0.064, 0.032, 0.135, 0.018, 0x14161c);
    },
    earAt: [0, 0.08, -0.01], ears: function (g) {
      earBall(g, 0.075, 0.115, -0.01, 0.044, WH, CG);
      earBall(g, -0.075, 0.115, -0.01, 0.044, WH, CG);
    },
    legs: {
      fx: 0.085, fy: 0.25, fz: 0.24, hy: 0.25, hz: -0.27, hx: 0.09, fLen: 0.25, hLen: 0.25,
      fr: [0.052, 0.038, 0.032], hr: [0.06, 0.04, 0.032], haunch: [0.075, 0.095, 0.095],
      col: function (y) { return y < -0.15 ? CG : WH; },
      foot: { type: 'paw', col: CG, h: 0.032, pawCol: WH }
    },
    tail: {
      y: 0.37, z: -0.41, n: 2, len: 0.56, r0: 0.065, r1: 0.095,
      col: function (i, x, y, z, nx, ny) { return ny < -0.2 ? CG : WH; },
      up: -0.38, curl: 0.12,
      tip: function (g, sl) { tuft(g, -sl * 0.78, 0.095, 0.115, WH); }
    },
    fold: { roll: 0.15, hp: 0.75, hy: 0.8 }
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
  if (sp.wingSweep) {
    p.wing = -0.32 + 0.06 * breathe + I.flutter * 0.7 * sin(t * 11);
    p.wing = lerp(p.wing, 0.12 + 0.48 * sin(ph * 2), gw);
    p.wing = lerp(p.wing, 0.28 + 0.72 * sin(t * 14), rw);
  } else {
    p.wing += I.flutter * 0.3 * (0.5 + 0.5 * sin(t * 18)) + rw * (0.5 + 0.3 * sin(ph * 2));
  }
  if (W.eat > 0.001) { var w = W.eat, e = sp.eat, nod = sin(t * 4 + I.seed) * 0.12;
    p.na = lerp(p.na, e.na, w); p.nb = lerp(p.nb, e.nb + nod, w); p.tp = lerp(p.tp, e.tp || 0, w); p.hy = lerp(p.hy, 0, w); p.ty = lerp(p.ty, e.ty || 0, w); }
  if (W.sick > 0.001) { var ws = W.sick; p.na = lerp(p.na, sp.neckA.up * 0.5, ws); p.nb = lerp(p.nb, sp.neckB.up - 0.9, ws); p.ty = lerp(p.ty, p.ty - 0.05, ws); p.wing = lerp(p.wing, sp.wingSweep ? -0.55 : -0.15, ws); }
  if (W.play > 0.001) { var wp = W.play, hop = Math.abs(sin(t * 6 + I.seed)); p.ty += wp * hop * 0.25; p.wing = lerp(p.wing, (sp.wingSweep ? 0.35 : 0.9) + 0.65 * sin(t * 14), wp); p.na = lerp(p.na, sp.neckA.up + 0.2 * sin(t * 6), wp);
    for (i = 0; i < 2; i++) { p['a' + i] = lerp(p['a' + i], -0.4 * hop, wp); p['b' + i] = lerp(p['b' + i], 0.8 * hop, wp); } p.spin = wp * sin(t * 1.7) * 1.2; } else p.spin = 0;
  if (W.swim > 0.001) { var wsw = W.swim; p.ty = lerp(p.ty, -0.02 + 0.02 * sin(t * 2), wsw);
    for (i = 0; i < 2; i++) { var pp = t * 3 + i * PI; p['a' + i] = lerp(p['a' + i], 0.4 * sin(pp), wsw); p['b' + i] = lerp(p['b' + i], 0.3 + 0.4 * Math.max(0, cos(pp)), wsw); } }
  if (W.sleep > 0.001) {
    var wl = W.sleep, sl = sp.sleep;
    if (sl.lie) { p.ty = lerp(p.ty, sl.lie - sp.cy, wl); for (i = 0; i < 2; i++) { p['a' + i] = lerp(p['a' + i], -1.4, wl); p['b' + i] = lerp(p['b' + i], 2.6, wl); } p.tp = lerp(p.tp, 0, wl); }
    else { // stand on one leg
      var la = I.liftSide; p.ty = lerp(p.ty, 0, wl); var ll = lerp(I.liftW[0], 0, 0); for (i = 0; i < 2; i++) { var lf = i === 0 ? I.liftW[0] : I.liftW[1]; p['a' + i] = lerp(p['a' + i], lerp(0, sp.liftA !== undefined ? sp.liftA : -0.4, lf), wl); p['b' + i] = lerp(p['b' + i], lerp(0, sp.liftB !== undefined ? sp.liftB : 2.4, lf), wl); }
    }
    p.na = lerp(p.na, sl.na, wl); p.nb = lerp(p.nb, sl.nb, wl); p.hy = lerp(p.hy, sl.hy || 0, wl); p.wing = lerp(p.wing, sp.wingSweep ? -0.52 : 0.05, wl);
  }
  // apply
  var tor = I.tor; tor.position.y = sp.cy + p.ty; tor.rotation.set(p.tp, 0, p.tr); I.rig.rotation.y = p.spin;
  I.bodyM.scale.set(1 + 0.006 * breathe, 1 + 0.012 * breathe, 1);
  I.na.rotation.set(-p.na - 0 * p.tp, p.hy * 0.4, 0); I.nb.rotation.set(-(p.nb - 0) + p.na - p.tp * 0 + 0, p.hy * 0.6, 0);
  I.na.rotation.x = -(p.na) - p.tp; I.nb.rotation.x = -(p.nb) + p.na;
  for (i = 0; i < 2; i++) { I.hips[i].rotation.x = p['a' + i] - p.tp; I.knees[i].rotation.x = p['b' + i]; }
  if (I.wings) {
    I.wings[0].rotation.z = p.wing; I.wings[1].rotation.z = -p.wing;
    if (sp.wingSweep) {
      var swp = lerp(0.32, 0.05, clamp((p.wing + 0.4) / 0.8, 0, 1));
      I.wings[0].rotation.y = swp; I.wings[1].rotation.y = -swp;
    }
  }
}

// ---- FLAMINGO
(function () {
  var PK = 0xf2829c, PL = 0xf8a9bb, PD = 0xd9607f, BK = 0x2a2428, LEG = 0xe5607f;
  BIRDS.flamingo = {
    id: 'flamingo', cy: 1.0, height: 1.7, walkA: 0.45, runA: 0.7, bend: 1.1, oneLeg: true, liftA: -0.5, liftB: 2.3, babyScale: 0.5, babyHead: 1.35, bob: 1.2,
    body: function (g) {
      var bc = function (x, y, z, nx, ny) { return (z < -0.18 && ny > -0.2) ? PD : (ny < -0.3 ? PL : PK); };
      g.loft([[-0.48, 0.05, 0.04, 0.96], [-0.26, 0.17, 0.17, 1.0], [0.02, 0.21, 0.22, 1.01], [0.24, 0.17, 0.18, 1.03], [0.36, 0.09, 0.1, 1.06]], { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neckA: { y: 1.12, z: 0.28, len: 0.55, up: 1.25, r0: 0.07, r1: 0.05, col: PK },
    neckB: { len: 0.55, up: 0.35, r0: 0.05, r1: 0.04, col: PK },
    head: function (g, sex, L) {
      g.sph(0.06, 0.055, 0.075, 0, 0, L + 0.03, PK, { s: [7, 5] });
      g.tube([[0, -0.005, L + 0.06], [0, -0.015, L + 0.16], [0, -0.085, L + 0.235]], [0.042, 0.034, 0.012], function (x, y, z, nx, ny, nz, t) { return t > 0.52 ? 0x2a2428 : 0xf6d9cf; }, { seg: 7, steps: 2 });
      eyePair(g, 0.045, 0.02, L + 0.06, 0.016, 0x111111); g.sph(0.01, 0.01, 0.01, 0.047, 0.025, L + 0.07, 0xf2c030, { s: [3, 3] });
    },
    legs: { x: 0.07, hipY: 0.9, z: 0.0, thigh: 0.45, shank: 0.45, r: [0.032, 0.022, 0.017], col: LEG, thighCol: PK, foot: function (g, y0) {
      g.extrude([[0, -0.02], [0.065, 0.13], [0, 0.155], [-0.065, 0.13]], 0.016, 0, y0 + 0.01, 0, [0, 0, 0], LEG, { axis: 'y', bev: 0.004 });
      g.sph(0.025, 0.02, 0.025, 0, y0 + 0.02, 0, LEG, { s: [5, 4] });
    } },
    eat: { na: 0.35, nb: -1.35, tp: 0.12, ty: -0.05 },
    sleep: { na: 0.9, nb: -2.5, hy: 0.0 },
    wingAt: [0.19, 1.04, 0.04],
    wings: function (r) {
      var g = B(), s = r ? -1 : 1;
      g.extrude([[0.06, 0.2], [0.14, 0.02], [0.08, -0.26], [-0.04, -0.36], [-0.14, -0.14], [-0.08, 0.14]], 0.055, s * 0.02, -0.02, -0.08, [0, 0, 0], function (x, y, z) { return z < -0.14 ? BK : PD; }, { axis: 'x', bev: 0.018, curveX: s * 0.25 });
      return g.build();
    }
  };
})();

// ---- OSTRICH
(function () {
  var BKM = 0x23232a, WH = 0xf4f0e6, FM = 0x9a8470, SK = 0xe3b9a6, BEAK = 0xe8d4a8;
  BIRDS.ostrich = {
    id: 'ostrich', sexed: true, fScale: 0.92, cy: 1.55, height: 2.7, walkA: 0.5, runA: 0.8, bend: 0.8, babyScale: 0.4, babyHead: 1.4, bob: 1.5,
    body: function (g, sex) {
      var m = sex !== 'f', C = m ? BKM : FM;
      g.loft([[-0.64, 0.24, 0.25, 1.5], [-0.28, 0.43, 0.43, 1.52], [0.16, 0.41, 0.43, 1.56], [0.54, 0.28, 0.3, 1.62], [0.68, 0.14, 0.16, 1.68]], { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return z < -0.34 ? (m ? WH : shade(FM, 1.15)) : C; });
    },
    neckA: { y: 1.8, z: 0.42, len: 0.55, up: 1.0, r0: 0.15, r1: 0.11, col: SK },
    neckB: { len: 0.6, up: 1.25, r0: 0.11, r1: 0.08, col: SK },
    head: function (g, sex, L) {
      g.sph(0.075, 0.07, 0.09, 0, 0.0, L + 0.04, SK, { s: [7, 5] }); g.sph(0.045, 0.03, 0.08, 0, -0.025, L + 0.14, BEAK, { s: [6, 4] });
      eyePair(g, 0.062, 0.03, L + 0.06, 0.028, 0x1a1008); g.sph(0.07, 0.025, 0.03, 0, 0.065, L + 0.03, 0x4a3a30, { s: [6, 4] });
    },
    legs: { x: 0.17, hipY: 1.3, z: 0.0, thigh: 0.6, shank: 0.7, r: [0.1, 0.075, 0.06], col: 0xe0b2a0, thighCol: 0xe3b9a6,
      thighFluff: [0.22, 0.28, 0.3], thighFluffCol: 0x777, foot: function (g, y0) {
        g.limb(0, y0 + 0.02, 0, -0.02, y0 + 0.015, 0.18, 0.048, 0.026, 0xd9a898, { seg: 5 });
        g.limb(0.02, y0 + 0.02, 0, 0.065, y0 + 0.015, 0.13, 0.032, 0.018, 0xd9a898, { seg: 5 });
        g.cone(0.026, 0.065, -0.02, y0 + 0.02, 0.21, 0x333333, { seg: 5, rot: [PI / 2, 0, 0] });
      } },
    wingAt: [0.42, 1.7, 0.0],
    wings: function (r, sex) {
      var g = B(), s = r ? -1 : 1, m = sex !== 'f';
      g.extrude([[0.15, 0.32], [0.26, -0.05], [0.14, -0.46], [-0.14, -0.52], [-0.36, -0.25], [-0.26, 0.22]], 0.11, s * 0.06, -0.24, -0.1, [0, 0, 0], function (x, y, z) { return y < -0.34 ? (m ? WH : shade(FM, 1.15)) : (m ? BKM : FM); }, { axis: 'x', bev: 0.03, curveX: s * 0.22 });
      return g.build();
    },
    eat: { na: 0.15, nb: -1.0, tp: 0.15, ty: -0.2 },
    sleep: { lie: 0.5, na: 0.2, nb: -0.15, hy: 0.0 }
  };
  // fix ostrich legs thighs fluff colour at build: uses sexed body colour (set by thighFluffCol) - give plumage colour hook
  BIRDS.ostrich.legs.thighFluffCol = function (sex) { return sex === 'f' ? FM : BKM; };
})();

// ---- PHOENIX
(function () {
  var CR = 0xd9261c, OR = 0xf56a18, GD = 0xffd238, DK = 0x8e1410, BK = 0xf0a820;
  var bc = function (x, y, z, nx, ny) { return ny < -0.35 ? GD : (ny > 0.45 ? OR : CR); };
  BIRDS.phoenix = {
    id: 'phoenix', cy: 0.80, height: 1.65, walkA: 0.45, runA: 0.72, bend: 0.9, wingSweep: true, babyScale: 0.5, babyHead: 1.38, bob: 1.1,
    body: function (g) {
      g.loft([[-0.42, 0.08, 0.08, 0.8], [-0.14, 0.24, 0.24, 0.82], [0.18, 0.24, 0.26, 0.84], [0.4, 0.14, 0.16, 0.86]], { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    },
    neckA: { y: 0.96, z: 0.34, len: 0.26, up: 0.95, r0: 0.11, r1: 0.085, col: CR },
    neckB: { len: 0.26, up: 1.1, r0: 0.085, r1: 0.068, col: OR },
    head: function (g, sex, L) {
      g.sph(0.09, 0.088, 0.105, 0, 0.01, L + 0.03, CR, { s: [8, 6] });
      g.tube([[0, 0.01, L + 0.09], [0, -0.01, L + 0.17], [0, -0.055, L + 0.21]], [0.04, 0.028, 0.008], function (x, y, z, nx, ny, nz, t) { return t > 0.6 ? GD : BK; }, { seg: 6, steps: 2 });
      // regal swept golden crest plumes
      g.tube([[0, 0.08, L + 0.02], [0, 0.16, L - 0.08], [0, 0.19, L - 0.22]], [0.026, 0.018, 0.004], GD, { seg: 5, steps: 2 });
      for (var s = -1; s <= 1; s += 2) g.tube([[s * 0.035, 0.075, L + 0.02], [s * 0.065, 0.14, L - 0.06], [s * 0.085, 0.16, L - 0.18]], [0.02, 0.014, 0.003], OR, { seg: 5, steps: 2 });
      eyePair(g, 0.072, 0.03, L + 0.065, 0.02, 0xffe440);
    },
    legs: { x: 0.11, hipY: 0.66, z: 0.0, thigh: 0.32, shank: 0.34, r: [0.05, 0.03, 0.024], col: BK, thighCol: CR,
      foot: function (g, y0) {
        for (var i = -1; i <= 1; i++) g.limb(0, y0 + 0.02, 0, i * 0.05, y0 + 0.01, 0.14, 0.016, 0.008, BK, { seg: 4 });
        g.limb(0, y0 + 0.02, 0, 0, y0 + 0.01, -0.08, 0.015, 0.008, BK, { seg: 4 });
      } },
    wingAt: [0.22, 0.94, 0.08],
    wings: function (r) {
      var g = B(), s = r ? -1 : 1;
      g.tube([[0, 0, 0], [s * 0.55, 0.08, -0.1], [s * 1.15, 0.02, -0.25]], [0.062, 0.038, 0.016], CR, { seg: 6, steps: 2 });
      g.wingMembrane([
        [[0, 0, 0], [s * 0.55, 0.08, -0.1], [s * 1.15, 0.02, -0.25]],
        [[0, -0.02, -0.26], [s * 0.48, 0.04, -0.34], [s * 0.96, 0.0, -0.44]],
        [[0, -0.03, -0.42], [s * 0.36, -0.01, -0.46], [s * 0.72, -0.03, -0.52]]
      ], 0.06, function (x, y, z) { return abs(x) > 0.65 ? GD : (abs(x) > 0.3 ? OR : CR); }, { camber: 0.07, scallop: 0.08, uSteps: 3, vSteps: 2 });
      // blazing sculpted primary wingtip feather blades
      for (var k = 0; k < 6; k++) {
        var wx = s * (0.36 + k * 0.17), wz = -0.32 - k * 0.04;
        g.extrude([[0, 0], [0.055, -0.1], [0.04, -0.38], [0, -0.5], [-0.04, -0.38], [-0.055, -0.1]], 0.02, wx, 0.01, wz, [0, s * (0.22 + k * 0.07), 0], k >= 2 ? GD : OR, { axis: 'y', bev: 0.006 });
      }
      return g.build();
    },
    tailGeo: function (g) {
      // sweeping curved fiery tail plume ribbons
      var plumes = [
        [[0, 0.82, -0.35], [0, 0.68, -0.95], [0, 0.46, -1.6]],
        [[0.09, 0.80, -0.34], [0.22, 0.70, -0.88], [0.34, 0.54, -1.38]],
        [[-0.09, 0.80, -0.34], [-0.22, 0.70, -0.88], [-0.34, 0.54, -1.38]],
        [[0.15, 0.78, -0.33], [0.36, 0.74, -0.75], [0.54, 0.64, -1.16]],
        [[-0.15, 0.78, -0.33], [-0.36, 0.74, -0.75], [-0.54, 0.64, -1.16]]
      ];
      var cols = [GD, OR, OR, CR, CR];
      for (var i = 0; i < plumes.length; i++) {
        var pl = plumes[i], tip = pl[2];
        g.tube(pl, [0.055, 0.032, 0.01], cols[i], { seg: 5, sx: 1.4, sz: 0.5, steps: 2 });
        g.extrude([[0, 0.02], [0.075, -0.06], [0.055, -0.22], [0, -0.3], [-0.055, -0.22], [-0.075, -0.06]], 0.018, tip[0], tip[1], tip[2], [-0.2, -tip[0] * 0.35, 0], i === 0 ? GD : OR, { axis: 'y', bev: 0.005 });
      }
    },
    eat: { na: 0.2, nb: -1.1, tp: 0.18, ty: -0.08 },
    sleep: { lie: 0.35, na: 0.3, nb: -0.4, hy: 0.9 }
  };
})();
for (var bid in BIRDS) (function (id) { OTHERS[id] = function (o) { return createBird(BIRDS[id], o); }; })(bid);

// ================================================================ PENGUIN
OTHERS.penguin = function (opts) {
  var baby = !!opts.baby, P = partsCache.penguin;
  var BK = 0x1e2128, WH = 0xf6f6f2, OR = 0xf0892a, YL = 0xf3cf5a;
  if (!P) {
    P = partsCache.penguin = {};
    var g = B();
    // streamlined hydrodynamic loft body
    g.loft([[-0.94, 0.12, 0.12, 0], [-0.74, 0.25, 0.22, 0.01], [-0.46, 0.28, 0.25, 0.015], [-0.18, 0.22, 0.21, 0.01], [-0.06, 0.12, 0.13, 0]], { down: true, oy: 0, rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) {
      if (y > 0.72 && z > 0.06) return mixHex(WH, YL, clamp((y - 0.72) * 5, 0, 1));
      return z > 0.045 ? WH : BK;
    });
    g.cone(0.08, 0.18, 0, 0.12, -0.14, BK, { seg: 5, rot: [-1.1, 0, 0] });
    P.body = g.build(0, -0.5, 0);
    g = B(); g.sph(0.175, 0.17, 0.17, 0, 0.0, 0.0, function (x, y, z, nx, ny) { return (z > 0.07 && ny < 0.5 && ny > -0.9 && abs(x) < 0.12) ? WH : BK; }, { s: [9, 7] });
    g.tube([[0, 0.0, 0.13], [0, -0.01, 0.21], [0, -0.025, 0.28]], [0.046, 0.032, 0.008], OR, { seg: 6, steps: 2 });
    g.sph(0.03, 0.05, 0.015, 0.115, 0.02, 0.05, YL, { s: [5, 4] }); g.sph(0.03, 0.05, 0.015, -0.115, 0.02, 0.05, YL, { s: [5, 4] });
    eyePair(g, 0.085, 0.05, 0.13, 0.026, 0x050505);
    P.head = g.build();
    // hydrofoil swept flippers
    var fp = [[0.02, 0.06], [0.05, -0.12], [0.02, -0.34], [-0.04, -0.44], [-0.1, -0.26], [-0.08, -0.04]];
    g = B(); g.extrude(fp, 0.042, 0, -0.04, 0, [0, 0, 0], function (x, y, z, nx) { return nx > 0 ? BK : mixHex(BK, WH, 0.35); }, { axis: 'x', bev: 0.014, curveX: 0.18 }); P.fl = g.build();
    g = B(); g.extrude(fp, 0.042, 0, -0.04, 0, [0, 0, 0], function (x, y, z, nx) { return nx < 0 ? BK : mixHex(BK, WH, 0.35); }, { axis: 'x', bev: 0.014, curveX: -0.18 }); P.fr = g.build();
    // sculpted webbed 3-toed penguin feet with ankle joint
    g = B();
    g.cyl(0.038, 0.035, 0.06, 0, 0.025, 0, OR, { seg: 6 });
    g.extrude([[0, -0.03], [0.085, 0.14], [0.03, 0.17], [0, 0.15], [-0.03, 0.17], [-0.085, 0.14]], 0.028, 0, -0.008, 0.01, [0, 0, 0], OR, { axis: 'y', bev: 0.008 });
    P.foot = g.build();
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
    g.loft([[-0.55, 0.14, 0.16, -0.02], [-0.2, 0.28, 0.3, -0.01], [0.22, 0.25, 0.26, 0.02], [0.56, 0.16, 0.18, 0.05], [0.7, 0.1, 0.12, 0.06]], { rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    if (male) g.sph(0.22, 0.2, 0.2, 0, 0.1, 0.45, mixHex(FUR, 0xb87a48, 0.5), { s: [7, 5] });
    else g.sph(0.14, 0.11, 0.15, 0, -0.22, 0.02, LT, { s: [6, 4] }); // subtle female pouch contour
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

// ================================================================ WINGED MONKEY
OTHERS.winged_monkey = function (opts) {
  var baby = !!opts.baby, P = partsCache.winged_monkey;
  var FUR = 0x363a44, FUR_DK = 0x252830, FACE = 0x7a747c, CRIM = 0xb8202c, GOLD = 0xeec238, WING = 0x241e2a, STRUT = 0x18141d;
  if (!P) {
    P = partsCache.winged_monkey = {};
    // sculpted loft torso with crimson & gold bellhop vest
    var g = B();
    g.loft([[-0.28, 0.12, 0.11, 0], [-0.14, 0.19, 0.16, 0], [0.06, 0.21, 0.17, 0.01], [0.22, 0.17, 0.14, 0], [0.28, 0.1, 0.09, 0]], { down: true, oy: 0.02, rings: 12, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) {
      if (y > -0.14 && y < 0.22) {
        if (abs(x) < 0.028 && z > 0.1) return GOLD;
        if (y > 0.17 || y < -0.10) return GOLD;
        return CRIM;
      }
      return FUR;
    });
    g.sph(0.06, 0.03, 0.07, 0.18, 0.2, 0, GOLD, { s: [5, 4] });
    g.sph(0.06, 0.03, 0.07, -0.18, 0.2, 0, GOLD, { s: [5, 4] });
    for (var b = 0; b < 3; b++) g.sph(0.022, 0.022, 0.02, 0, 0.11 - b * 0.08, 0.175, GOLD, { s: [4, 3] });
    P.body = g.build();

    // head with expressive monkey face & tiny crimson/gold bellhop cap
    g = B();
    g.sph(0.145, 0.14, 0.145, 0, 0.12, 0.02, FUR, { s: [9, 7] });
    g.sph(0.115, 0.075, 0.07, 0, 0.13, 0.11, FACE, { s: [7, 5] });
    g.sph(0.085, 0.068, 0.09, 0, 0.06, 0.14, FACE, { s: [7, 5] });
    g.sph(0.024, 0.018, 0.018, 0, 0.08, 0.225, FUR_DK, { s: [4, 3] });
    g.tube([[-0.032, 0.038, 0.21], [0, 0.033, 0.225], [0.032, 0.038, 0.21]], 0.008, FUR_DK, { seg: 4, steps: 2 });
    eyePair(g, 0.055, 0.145, 0.165, 0.022, 0xd89620);
    earBall(g, 0.155, 0.13, 0.01, 0.055, FACE, shade(FACE, 0.8));
    earBall(g, -0.155, 0.13, 0.01, 0.055, FACE, shade(FACE, 0.8));
    // iconic tiny round bellhop pillbox cap tilted jauntily
    g.cyl(0.088, 0.095, 0.09, 0.02, 0.28, 0.02, CRIM, { seg: 9, rot: [0.12, 0, -0.16] });
    g.cyl(0.096, 0.098, 0.024, 0.015, 0.245, 0.025, GOLD, { seg: 9, rot: [0.12, 0, -0.16] });
    g.sph(0.02, 0.016, 0.02, 0.03, 0.33, 0.015, GOLD, { s: [4, 3] });
    P.head = g.build();

    // 2-segment articulated arms (upper + forearm) & legs
    g = B(); g.limb(0, 0, 0, 0, -0.19, 0.01, 0.052, 0.042, FUR, { seg: 6 }); g.sph(0.044, 0.044, 0.044, 0, -0.19, 0.01, FUR, { s: [5, 4] }); P.armU = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.19, 0.02, 0.04, 0.034, FUR, { seg: 6 }); g.sph(0.046, 0.052, 0.046, 0, -0.22, 0.03, FACE, { s: [5, 4] }); P.armL = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.22, 0, 0.065, 0.048, FUR, { seg: 6 }); P.thigh = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.22, 0, 0.046, 0.036, FUR, { seg: 6 }); g.sph(0.048, 0.028, 0.085, 0, -0.23, 0.04, FACE, { s: [5, 4] }); P.shank = g.build();

    // curled tail segments
    P.tail = [];
    for (var ti = 0; ti < 3; ti++) {
      var gt = B(), r0 = lerp(0.034, 0.018, ti / 3), r1 = lerp(0.034, 0.018, (ti + 1) / 3);
      gt.limb(0, 0, 0, 0, 0, -0.28, r0, r1, FUR, { seg: 5 });
      if (ti === 2) gt.sph(0.025, 0.025, 0.025, 0, 0, -0.28, FUR_DK, { s: [4, 3] });
      P.tail.push(gt.build());
    }

    // sculpted 3D cambered bat wings with scalloped trailing membrane
    var mkWing = function (r) {
      var gw = B(), s = r ? -1 : 1;
      var sh = [0, 0, 0], wr = [s * 0.38, 0.24, -0.04], t1 = [s * 0.92, 0.14, -0.10], t2 = [s * 0.72, -0.22, -0.16], t3 = [s * 0.42, -0.32, -0.14], rt = [0, -0.26, -0.06];
      gw.tube([sh, wr, t1], [0.034, 0.024, 0.01], STRUT, { seg: 5, steps: 2 });
      gw.tube([wr, t2], [0.02, 0.008], STRUT, { seg: 4 });
      gw.tube([wr, t3], [0.018, 0.008], STRUT, { seg: 4 });
      gw.wingMembrane([[wr, t1], [wr, t2], [wr, t3], [sh, rt]], 0.022, WING, { camber: 0.06, scallop: 0.22, uSteps: 3, vSteps: 2 });
      return gw.build();
    };
    P.wingL = mkWing(false); P.wingR = mkWing(true);
  }
  var sc = baby ? 0.55 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.58, 0);
  tor.add(mesh(P.body));
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.23, 0.04); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.35);
  var arms = [], elbows = [], hips = [], knees = [], wings = [], tails = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.position.set(sd * 0.21, 0.18, 0.02); tor.add(ar); ar.add(mesh(P.armU)); arms.push(ar);
    var el = grp('elbow'); el.position.set(0, -0.19, 0.01); ar.add(el); el.add(mesh(P.armL)); elbows.push(el);
    var hp = grp('hip'); hp.position.set(sd * 0.1, -0.15, 0); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.22, 0); hp.add(kn); kn.add(mesh(P.shank)); knees.push(kn);
    var wg = grp(s ? 'rWing' : 'lWing'); wg.rotation.order = 'YXZ'; wg.position.set(sd * 0.14, 0.17, -0.14);
    tor.add(wg); wg.add(mesh(s ? P.wingR : P.wingL)); wings.push(wg);
  }
  var par = tor;
  for (var q = 0; q < 3; q++) {
    var tp = grp('tail'); tp.rotation.order = 'YXZ'; par.add(tp);
    tp.position.set(0, q === 0 ? -0.15 : 0, q === 0 ? -0.14 : -0.28);
    tp.add(mesh(P.tail[q])); tails.push(tp); par = tp;
  }
  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, elbows: elbows, hips: hips, knees: knees, wings: wings, tails: tails, sc: sc });
  I.W.fly = 0;
  var out = { group: root, height: 1.05 * sc, update: function (dt, ent) { wingedMonkeyUpdate(I, dt, ent); } };
  wingedMonkeyUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function wingedMonkeyUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd, i;
  var airborne = (ent && ((ent.flyAlt && ent.flyAlt > 0.05) || ent.flyover)) ? 1 : 0;
  W.fly = damp(W.fly || 0, airborne, 8, dt);
  var fw = W.fly;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.65 * I.sc * (1 + 0.25 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 2.2 + I.seed), s = sin(ph), c = cos(ph);
  var ty = 0.58 - 0.03 * abs(s) * gw + 0.015 * br;
  var tp = 0.12 + 0.12 * gw + 0.15 * rw;
  var tr = 0.06 * gw * s;
  var amp = lerp(0.55, 0.85, rw) * gw;
  var arm0 = -amp * s - 0.15, arm1 = amp * s - 0.15;
  var leg0 = amp * s - 0.15, leg1 = -amp * s - 0.15;
  var kn0 = 0.28 + 0.55 * gw * Math.max(0, -c), kn1 = 0.28 + 0.55 * gw * Math.max(0, c);
  var hp = I.lookP * (1 - fw * 0.5) - 0.05, hy = I.lookY * (1 - fw * 0.6);
  // wings: slightly folded on ground, spread and flapping dramatically during flyover
  var wy = lerp(0.88 - 0.12 * rw, 0.12, fw);
  var wz = lerp(-0.28 + 0.04 * br + 0.12 * gw * sin(ph * 2), 0.18 + 0.88 * sin(t * 16 + I.seed), fw);
  var wx = lerp(-0.1, -0.25, fw);
  if (fw > 0.01) {
    tp = lerp(tp, 0.52 + 0.08 * sin(t * 16 + I.seed), fw);
    ty = lerp(ty, 0.58 + 0.08 * sin(t * 16 + I.seed), fw);
    tr = lerp(tr, 0.14 * sin(t * 4 + I.seed), fw);
    arm0 = lerp(arm0, -0.9 + 0.22 * sin(t * 16), fw); arm1 = lerp(arm1, -0.9 - 0.22 * sin(t * 16), fw);
    leg0 = lerp(leg0, 0.55, fw); leg1 = lerp(leg1, 0.55, fw);
    kn0 = lerp(kn0, 0.75, fw); kn1 = lerp(kn1, 0.75, fw);
  }
  if (W.play > 0.001) {
    var wp = W.play * (1 - fw), hop = Math.abs(sin(t * 7 + I.seed));
    ty += wp * hop * 0.26; wz = lerp(wz, 0.25 + 0.65 * sin(t * 14), wp); wy = lerp(wy, 0.25, wp);
    arm0 = lerp(arm0, -1.6 + 0.4 * sin(t * 10), wp); arm1 = lerp(arm1, -1.6 - 0.4 * sin(t * 10), wp);
  }
  if (W.eat > 0.001) { var we = W.eat; tp = lerp(tp, 0.55, we); hp = lerp(hp, 0.4 + 0.15 * sin(t * 5), we); arm0 = lerp(arm0, -0.7 + 0.2 * sin(t * 5), we); }
  if (W.sleep > 0.001) { var wl = W.sleep; ty = lerp(ty, 0.28, wl); tp = lerp(tp, 0.75, wl); leg0 = leg1 = lerp(leg0, -1.1, wl); kn0 = kn1 = lerp(kn0, 1.8, wl); wy = lerp(wy, 1.05, wl); wz = lerp(wz, -0.5, wl); }
  if (W.sick > 0.001) { var ws = W.sick; tp = lerp(tp, 0.35, ws); hp = lerp(hp, 0.6, ws); wz = lerp(wz, -0.55, ws); }
  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr);
  I.head.rotation.set(hp - tp * 0.55, hy, 0);
  I.arms[0].rotation.set(arm0, 0, 0.12 + 0.25 * fw); I.arms[1].rotation.set(arm1, 0, -0.12 - 0.25 * fw);
  if (I.elbows) { I.elbows[0].rotation.x = -0.35 - 0.35 * gw * Math.max(0, s) - 0.45 * W.eat; I.elbows[1].rotation.x = -0.35 - 0.35 * gw * Math.max(0, -s); }
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
  I.wings[0].rotation.set(wx, wy, wz); I.wings[1].rotation.set(wx, -wy, -wz);
  I.tails[0].rotation.set(lerp(0.6, -0.25, fw) + 0.1 * sin(t * 2.5), 0.25 * sin(t * 2 + I.seed), 0);
  I.tails[1].rotation.set(lerp(0.65, 0.12, fw) + 0.12 * sin(t * 3), 0.2 * sin(t * 2.4 + 1), 0);
  I.tails[2].rotation.set(lerp(0.55, 0.2, fw), 0.25 * sin(t * 2.4 + 2), 0);
}

// ================================================================ SASQUATCH
OTHERS.sasquatch = function (opts) {
  var baby = !!opts.baby, P = partsCache.sasquatch;
  var MH = 0x6b3220, RB = 0x86402a, DK = 0x452014, SK = 0x482f26, EYE = 0xffaa22;
  var fc = function (x, y, z, nx, ny) {
    var h = hash3(Math.floor(x * 8), Math.floor(y * 8), Math.floor(z * 8));
    return h > 0.62 ? RB : (ny < -0.3 || h < 0.25 ? DK : MH);
  };
  if (!P) {
    P = partsCache.sasquatch = {};
    var g = B();
    // sculpted muscular hunched shaggy torso
    g.loft([[-0.56, 0.22, 0.2, 0], [-0.3, 0.42, 0.32, 0.02], [0.1, 0.48, 0.36, 0.04], [0.42, 0.56, 0.35, 0.04], [0.62, 0.3, 0.26, 0.05]], { down: true, oy: 0.04, rings: 14, seg: 12, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return fc(x, y, z, sa, ca); });
    g.cone(0.14, 0.24, 0.48, 0.48, 0.02, RB, { seg: 5, rot: [0, 0, -0.6] });
    g.cone(0.14, 0.24, -0.48, 0.48, 0.02, RB, { seg: 5, rot: [0, 0, 0.6] });
    P.body = g.build();

    // head with sculpted curved shaggy brow arch & dark face mask
    g = B();
    g.sph(0.24, 0.28, 0.24, 0, 0.16, 0.04, fc, { s: [9, 7] });
    g.sph(0.18, 0.18, 0.14, 0, 0.12, 0.18, SK, { s: [7, 5] });
    g.sph(0.14, 0.1, 0.14, 0, 0.02, 0.22, SK, { s: [7, 5] });
    g.tube([[-0.18, 0.22, 0.2], [-0.07, 0.26, 0.27], [0.07, 0.26, 0.27], [0.18, 0.22, 0.2]], [0.036, 0.048, 0.048, 0.036], DK, { seg: 6, steps: 2 });
    g.sph(0.045, 0.035, 0.03, 0, 0.11, 0.31, 0x261814, { s: [5, 4] });
    P.head = g.build();

    var eg = B();
    eg.sph(0.032, 0.026, 0.022, 0.078, 0.185, 0.27, EYE, { s: [5, 4] });
    eg.sph(0.032, 0.026, 0.022, -0.078, 0.185, 0.27, EYE, { s: [5, 4] });
    P.eyes = eg.build();

    // 2-segment articulated long shaggy arms (shoulder + elbow)
    g = B(); g.sph(0.15, 0.16, 0.15, 0, -0.02, 0, RB, { s: [7, 5] }); g.limb(0, 0, 0, 0, -0.52, 0, 0.13, 0.1, fc, { seg: 7 }); g.sph(0.1, 0.1, 0.1, 0, -0.52, 0, fc, { s: [6, 4] }); P.armU = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.48, 0.06, 0.1, 0.08, fc, { seg: 7 }); g.sph(0.105, 0.12, 0.105, 0, -0.53, 0.08, SK, { s: [6, 5] }); P.armL = g.build();

    // heavy legs & sculpted arched bigfoot feet
    g = B(); g.limb(0, 0, 0, 0, -0.45, 0, 0.17, 0.13, fc, { seg: 7 }); P.thigh = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.45, 0, 0.13, 0.1, fc, { seg: 7 });
    g.loft([[-0.1, 0.08, 0.06, -0.47], [0.06, 0.11, 0.065, -0.465], [0.24, 0.125, 0.055, -0.475], [0.34, 0.095, 0.04, -0.48]], { rings: 8, seg: 8, cap0: true, cap1: true, flatBot: 0.85 }, SK);
    for (var t2 = -1; t2 <= 1; t2++) g.sph(0.042, 0.035, 0.062, t2 * 0.065, -0.48, 0.34, shade(SK, 0.85), { s: [5, 4] });
    P.shank = g.build();
  }
  var sc = baby ? 0.5 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 1.38, 0);
  tor.add(mesh(P.body));
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.56, 0.14); head.add(mesh(P.head));
  head.add(mesh(P.eyes, mat(EYE, { emissive: 0xd97410 })));
  if (baby) head.scale.setScalar(1.38);
  var arms = [], elbows = [], hips = [], knees = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.position.set(sd * 0.52, 0.42, 0.05); tor.add(ar); ar.add(mesh(P.armU)); arms.push(ar);
    var el = grp('elbow'); el.position.set(0, -0.52, 0); ar.add(el); el.add(mesh(P.armL)); elbows.push(el);
    var hp = grp('hip'); hp.position.set(sd * 0.24, -0.44, 0); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.45, 0); hp.add(kn); kn.add(mesh(P.shank)); knees.push(kn);
  }
  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, elbows: elbows, hips: hips, knees: knees, sc: sc });
  var out = { group: root, height: 2.55 * sc, update: function (dt, ent) { sasquatchUpdate(I, dt, ent); } };
  sasquatchUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function sasquatchUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (1.5 * I.sc * (1 + 0.2 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 1.7 + I.seed), s = sin(ph), c = cos(ph);
  var amp = lerp(0.45, 0.72, rw) * gw;
  var ty = 1.38 - 0.07 * abs(s) * gw + 0.015 * br;
  var tp = 0.14 + 0.08 * gw + 0.15 * rw;
  var tr = 0.12 * gw * s;
  var arm0 = -amp * 1.15 * s, arm1 = amp * 1.15 * s;
  var leg0 = amp * s, leg1 = -amp * s;
  var kn0 = 0.14 + 0.52 * gw * Math.max(0, -c), kn1 = 0.14 + 0.52 * gw * Math.max(0, c);
  var hp = I.lookP, hy = I.lookY;
  if (W.eat > 0.001) { var we = W.eat; tp = lerp(tp, 0.55, we); hp = lerp(hp, 0.25 + 0.12 * sin(t * 4), we); arm0 = lerp(arm0, -0.8 + 0.2 * sin(t * 4), we); arm1 = lerp(arm1, -0.5, we); }
  if (W.play > 0.001) { var wp = W.play, hop = Math.abs(sin(t * 5 + I.seed)); ty += wp * hop * 0.2; arm0 = lerp(arm0, -2.1 + 0.45 * sin(t * 8), wp); arm1 = lerp(arm1, -2.1 - 0.45 * sin(t * 8), wp); tr = lerp(tr, 0.16 * sin(t * 5), wp); }
  if (W.swim > 0.001) { var wsw = W.swim; ty = lerp(ty, 0.62 + 0.04 * sin(t * 2), wsw); tp = lerp(tp, 0.25, wsw); arm0 = lerp(arm0, -0.9 + 0.6 * sin(t * 5), wsw); arm1 = lerp(arm1, -0.9 - 0.6 * sin(t * 5), wsw); }
  if (W.sleep > 0.001) { var wl = W.sleep; ty = lerp(ty, 0.65, wl); tp = lerp(tp, 1.35, wl); leg0 = leg1 = lerp(leg0, -0.4, wl); kn0 = kn1 = lerp(kn0, 0.6, wl); arm0 = arm1 = lerp(arm0, -0.6, wl); }
  if (W.sick > 0.001) { var ws = W.sick; tp = lerp(tp, 0.42, ws); hp = lerp(hp, 0.5, ws); }
  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr);
  I.head.rotation.set(hp - tp * 0.5, hy, 0);
  I.arms[0].rotation.set(arm0, 0, 0.14); I.arms[1].rotation.set(arm1, 0, -0.14);
  if (I.elbows) { I.elbows[0].rotation.x = -0.25 - 0.35 * gw * Math.max(0, s) - 0.5 * W.eat; I.elbows[1].rotation.x = -0.25 - 0.35 * gw * Math.max(0, -s); }
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
}

// ================================================================ NESSIE (Loch Ness Monster)
OTHERS.nessie = function (opts) {
  var baby = !!opts.baby, P = partsCache.nessie;
  var EM = 0x1b6356, EM2 = 0x287c6c, DK = 0x12443b, BL = 0x78aa96, EYE = 0xf4c430;
  var bc = function (x, y, z, nx, ny) {
    if (ny < -0.35) return BL;
    var h = hash3(Math.floor(x * 7), Math.floor(y * 7), Math.floor(z * 7));
    return h > 0.65 ? EM2 : (ny > 0.55 ? DK : EM);
  };
  if (!P) {
    P = partsCache.nessie = {};
    // streamlined hydrodynamic plesiosaur body with sculpted dorsal fin humps
    var g = B();
    g.loft([[-0.88, 0.18, 0.16, 0.02], [-0.4, 0.4, 0.36, 0.03], [0.05, 0.44, 0.38, 0.02], [0.46, 0.38, 0.35, 0.02], [0.84, 0.19, 0.18, 0.06]], { rings: 16, seg: 12, cap0: true, cap1: true, ridge: 0.22 }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    g.extrude([[0.22, -0.58], [0.48, -0.35], [0.36, -0.04], [0.54, 0.26], [0.34, 0.52], [0.22, 0.56]], 0.09, 0, 0, 0, [0, 0, 0], DK, { axis: 'x', bev: 0.025 });
    P.body = g.build();

    // 3 smooth articulated S-curved neck segments + crested head
    P.neck = [];
    var nLen = [0.55, 0.52, 0.45], nR = [0.18, 0.14, 0.11, 0.085];
    for (var ni = 0; ni < 3; ni++) {
      var gn = B();
      gn.loft([[0, nR[ni], nR[ni], 0], [nLen[ni] * 0.5, lerp(nR[ni], nR[ni + 1], 0.5), lerp(nR[ni], nR[ni + 1], 0.5), 0], [nLen[ni] * 1.06, nR[ni + 1], nR[ni + 1], 0]], { rings: 6, seg: 9, ridge: 0.14 }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
      gn.extrude([[nR[ni] * 0.8, nLen[ni] * 0.15], [nR[ni] * 1.45, nLen[ni] * 0.5], [nR[ni + 1] * 0.8, nLen[ni] * 0.85]], 0.036, 0, 0, 0, [0, 0, 0], DK, { axis: 'x', bev: 0.01 });
      P.neck.push(gn.build());
    }
    g = B();
    g.loft([[-0.04, 0.09, 0.085, 0], [0.1, 0.115, 0.098, 0], [0.28, 0.078, 0.062, -0.022], [0.4, 0.052, 0.04, -0.03]], { rings: 9, seg: 9, cap0: true, cap1: true }, function (zc, ca, sa, x, y, z) { return bc(x, y, z, sa, ca); });
    g.tube([[0, 0.06, 0.06], [0, 0.14, -0.04], [0, 0.17, -0.15]], [0.032, 0.02, 0.004], DK, { seg: 5, steps: 2 });
    eyePair(g, 0.075, 0.035, 0.16, 0.024, EYE);
    P.head = g.build();

    // sculpted cambered hydrofoil plesiosaur flippers
    var mkFlip = function (r, sz) {
      var gf = B(), s = r ? -1 : 1;
      gf.tube([[0, 0, 0], [s * 0.3 * sz, -0.02, 0.02 * sz], [s * 0.62 * sz, -0.05, -0.14 * sz]], [0.068 * sz, 0.042 * sz, 0.012 * sz], EM, { seg: 6, steps: 2 });
      gf.wingMembrane([
        [[0, 0, 0.05 * sz], [s * 0.34 * sz, -0.02, 0.04 * sz], [s * 0.64 * sz, -0.05, -0.12 * sz]],
        [[0, -0.01, -0.14 * sz], [s * 0.28 * sz, -0.04, -0.22 * sz], [s * 0.48 * sz, -0.06, -0.3 * sz]]
      ], 0.055 * sz, bc, { camber: 0.04, scallop: 0.05, uSteps: 3, vSteps: 2 });
      return gf.build();
    };
    P.flipFL = mkFlip(false, 1.0); P.flipFR = mkFlip(true, 1.0);
    P.flipRL = mkFlip(false, 0.82); P.flipRR = mkFlip(true, 0.82);

    // 3 tapered tail segments with 3rd dorsal hump & ridge
    P.tail = [];
    var tLen = [0.65, 0.65, 0.65], tR = [0.22, 0.14, 0.075, 0.022];
    for (var ti = 0; ti < 3; ti++) {
      var gt = B();
      gt.limb(0, 0, 0, 0, 0, -tLen[ti], tR[ti], tR[ti + 1], bc, { seg: 7 });
      if (ti === 0) gt.sph(0.16, 0.2, 0.24, 0, 0.16, -0.28, DK, { s: [7, 5] }); // 3rd arched hump
      else gt.cone(0.03, 0.1, 0, tR[ti] * 0.9, -tLen[ti] * 0.5, DK, { seg: 4 });
      P.tail.push(gt.build());
    }
  }
  var sc = baby ? 0.45 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.32, 0);
  tor.add(mesh(P.body));
  var necks = [], parN = tor, nPos = [[0, 0.14, 0.76], [0, 0, 0.55], [0, 0, 0.52]];
  for (var ni = 0; ni < 3; ni++) {
    var np = grp('neck' + ni); np.rotation.order = 'YXZ';
    np.position.set(nPos[ni][0], nPos[ni][1], nPos[ni][2]);
    parN.add(np); np.add(mesh(P.neck[ni])); necks.push(np); parN = np;
  }
  var head = grp('head'); head.rotation.order = 'YXZ'; head.position.set(0, 0, 0.45);
  parN.add(head); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.38);
  var flips = [];
  var fDefs = [[0.36, -0.1, 0.45, P.flipFL], [-0.36, -0.1, 0.45, P.flipFR], [0.32, -0.1, -0.45, P.flipRL], [-0.32, -0.1, -0.45, P.flipRR]];
  for (var fi = 0; fi < 4; fi++) {
    var fd = fDefs[fi], fp = grp('flip' + fi); fp.rotation.order = 'YXZ';
    fp.position.set(fd[0], fd[1], fd[2]); tor.add(fp); fp.add(mesh(fd[3])); flips.push(fp);
  }
  var tails = [], parT = tor;
  for (var ti = 0; ti < 3; ti++) {
    var tp = grp('tail' + ti); tp.rotation.order = 'YXZ';
    tp.position.set(0, ti === 0 ? 0.04 : 0, ti === 0 ? -0.78 : -0.65);
    parT.add(tp); tp.add(mesh(P.tail[ti])); tails.push(tp); parT = tp;
  }
  var I = newInst({ rig: rig, tor: tor, necks: necks, head: head, flips: flips, tails: tails, sc: sc });
  var out = { group: root, height: 1.7 * sc, update: function (dt, ent) { nessieUpdate(I, dt, ent); } };
  nessieUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function nessieUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, sw = W.swim, spd = I.spd;
  if ((I.moving || sw > 0.1) && dt > 0.001) I.phase += (sw > 0.3 ? 1.5 + spd * 0.4 : spd * 0.6) * dt / I.sc * TAU;
  var ph = I.phase, br = sin(t * 1.8 + I.seed), act = Math.max(gw, sw);
  var ty = lerp(0.32, -0.02 + 0.04 * sin(t * 2.1 + I.seed), sw) + 0.015 * br;
  var tp = 0.04 * sin(t * 2.1 + I.seed) * sw;
  // S-curved graceful neck with smooth undulation
  var und = 0.08 + 0.12 * act;
  I.necks[0].rotation.set(-0.95 + und * sin(t * 2.2 + I.seed), I.lookY * 0.25 + 0.08 * act * sin(ph), 0);
  I.necks[1].rotation.set(-0.38 + und * sin(t * 2.2 - 0.8 + I.seed), I.lookY * 0.25 + 0.1 * act * sin(ph - 0.8), 0);
  I.necks[2].rotation.set(0.55 + und * sin(t * 2.2 - 1.6 + I.seed), I.lookY * 0.25, 0);
  var hp = 0.72 + I.lookP * 0.6;
  if (W.eat > 0.001) {
    var we = W.eat;
    I.necks[0].rotation.x = lerp(I.necks[0].rotation.x, -0.25, we);
    I.necks[1].rotation.x = lerp(I.necks[1].rotation.x, 0.45, we);
    I.necks[2].rotation.x = lerp(I.necks[2].rotation.x, 0.65, we);
    hp = lerp(hp, 0.5 + 0.15 * sin(t * 5), we);
  }
  if (W.sleep > 0.001) {
    var wl = W.sleep;
    I.necks[0].rotation.x = lerp(I.necks[0].rotation.x, -0.2, wl);
    I.necks[1].rotation.x = lerp(I.necks[1].rotation.x, 0.25, wl);
    I.necks[2].rotation.x = lerp(I.necks[2].rotation.x, 0.35, wl);
    hp = lerp(hp, 0.45, wl);
  }
  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, 0.04 * act * sin(ph));
  I.head.rotation.set(hp, I.lookY * 0.5, 0);
  // 4 paddling flippers
  for (var fi = 0; fi < 4; fi++) {
    var sd = (fi & 1) ? -1 : 1, front = fi < 2, fph = t * (2.5 + 3.5 * act) + (front ? 0 : PI) + (fi & 1 ? 0.4 : 0);
    var row = act * 0.42 * sin(fph), flap = (0.12 + 0.38 * act) * cos(fph);
    I.flips[fi].rotation.set(0.18 * flap, sd * row, sd * (-0.12 + flap * 0.8));
  }
  // undulating tail
  var tw = 0.14 + 0.28 * act;
  for (var ti = 0; ti < 3; ti++) {
    I.tails[ti].rotation.set(0.06 * sin(t * 2.2 - ti * 0.9), tw * sin(t * (2.0 + 2.5 * act) - ti * 1.1 + I.seed), 0);
  }
}

// ================================================================ ANACONDA
OTHERS.anaconda = function (opts) {
  var baby = !!opts.baby, P = partsCache.anaconda;
  var OL = 0x466932, DK = 0x1e2c18, BL = 0x9bb36b, EYE = 0xe8c428;
  var scCol = function (x, y, z, nx, ny) {
    if (ny < -0.32) return BL;
    var fz = fract(z * 2.1) - 0.5;
    if (ny > 0.25 && (x * x * 42 + fz * fz * 6.5) < 0.22) return DK;
    if (abs(nx) > 0.55 && ny > -0.15 && (fract(z * 2.1 + 0.5) - 0.5) * (fract(z * 2.1 + 0.5) - 0.5) < 0.045) return DK;
    return hash3(Math.floor(x * 12), Math.floor(y * 12), Math.floor(z * 12)) > 0.72 ? shade(OL, 0.88) : OL;
  };
  if (!P) {
    P = partsCache.anaconda = {};
    var g = B();
    g.loft([[-0.24, 0.16, 0.145, 0], [0, 0.165, 0.15, 0], [0.24, 0.16, 0.145, 0]], { rings: 6, seg: 10, flatBot: 0.35 }, function (zc, ca, sa, x, y, z) { return scCol(x, y, z, sa, ca); });
    P.mid = g.build();

    // 2 smooth overlapping forward segments
    P.fwd = [];
    var fR = [0.16, 0.145, 0.115], fL = 0.42;
    for (var fi = 0; fi < 2; fi++) {
      var gf = B();
      gf.loft([[-0.03, fR[fi] * 0.98, fR[fi] * 0.9, 0], [fL * 0.5, lerp(fR[fi], fR[fi + 1], 0.5), lerp(fR[fi], fR[fi + 1], 0.5) * 0.9, 0], [fL + 0.03, fR[fi + 1], fR[fi + 1] * 0.9, 0]], { rings: 6, seg: 9, flatBot: 0.35 }, function (zc, ca, sa, x, y, z) { return scCol(x, y, z, sa, ca); });
      P.fwd.push(gf.build());
    }

    // sculpted broad triangular anaconda head (vertex-shaded post-ocular stripe, no box stripes!)
    g = B();
    g.loft([[-0.04, 0.11, 0.08, 0], [0.1, 0.145, 0.088, 0], [0.25, 0.105, 0.064, -0.01], [0.38, 0.07, 0.042, -0.015]], { rings: 10, seg: 10, cap0: true, cap1: true, flatBot: 0.65 }, function (zc, ca, sa, x, y, z) {
      if (ca < -0.28) return BL;
      if (abs(sa) > 0.65 && ca > -0.15 && ca < 0.38 && z > 0.02 && z < 0.22) return DK;
      return scCol(x, y, z, sa, ca);
    });
    g.sph(0.014, 0.012, 0.012, 0.036, 0.022, 0.36, DK, { s: [4, 3] });
    g.sph(0.014, 0.012, 0.012, -0.036, 0.022, 0.36, DK, { s: [4, 3] });
    g.limb(0, -0.02, 0.37, 0, -0.024, 0.49, 0.01, 0.008, 0xc83a48, { seg: 4 });
    g.limb(0, -0.024, 0.49, 0.022, -0.028, 0.55, 0.007, 0.003, 0xc83a48, { seg: 3 });
    g.limb(0, -0.024, 0.49, -0.022, -0.028, 0.55, 0.007, 0.003, 0xc83a48, { seg: 3 });
    eyePair(g, 0.088, 0.032, 0.21, 0.024, EYE);
    P.head = g.build();

    // 6 smooth overlapping tapered tail segments
    P.back = [];
    var bR = [0.16, 0.155, 0.142, 0.12, 0.092, 0.056, 0.016], bL = 0.42;
    for (var bi = 0; bi < 6; bi++) {
      var gb = B();
      gb.loft([[-0.03, bR[bi] * 0.98, bR[bi] * 0.9, 0], [bL * 0.5, lerp(bR[bi], bR[bi + 1], 0.5), lerp(bR[bi], bR[bi + 1], 0.5) * 0.9, 0], [bL + (bi < 5 ? 0.03 : 0), bR[bi + 1], bR[bi + 1] * 0.9, 0]], { dir: -1, rings: 6, seg: 9, flatBot: 0.35, cap1: bi === 5 }, function (zc, ca, sa, x, y, z) { return scCol(x, y, z, sa, ca); });
      P.back.push(gb.build());
    }
  }
  var sc = baby ? 0.45 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.16, 0);
  tor.add(mesh(P.mid));
  var fwd = [], parF = tor;
  for (var fi = 0; fi < 2; fi++) {
    var fp = grp('fwd' + fi); fp.rotation.order = 'YXZ';
    fp.position.set(0, 0, fi === 0 ? 0.22 : 0.42);
    parF.add(fp); fp.add(mesh(P.fwd[fi])); fwd.push(fp); parF = fp;
  }
  var head = grp('head'); head.rotation.order = 'YXZ';
  head.position.set(0, 0, 0.42); parF.add(head); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.3);
  var back = [], parB = tor;
  for (var bi = 0; bi < 6; bi++) {
    var bp = grp('back' + bi); bp.rotation.order = 'YXZ';
    bp.position.set(0, 0, bi === 0 ? -0.22 : -0.42);
    parB.add(bp); bp.add(mesh(P.back[bi])); back.push(bp); parB = bp;
  }
  var I = newInst({ rig: rig, tor: tor, fwd: fwd, head: head, back: back, sc: sc });
  var out = { group: root, height: 0.65 * sc, update: function (dt, ent) { anacondaUpdate(I, dt, ent); } };
  anacondaUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function anacondaUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, sw = W.swim, slp = W.sleep, spd = I.spd;
  var act = max(gw, sw);
  if ((I.moving || sw > 0.1) && dt > 0.001) {
    I.phase += (sw > 0.3 ? 1.8 + spd * 0.5 : max(0.7, spd) * 0.85) * dt / I.sc * TAU;
  }
  var ph = I.phase, br = sin(t * 1.6 + I.seed);
  var ty = lerp(0.16, -0.01 + 0.02 * sin(t * 2.4 + I.seed), sw);
  var waveAmp = lerp(0.18, 0.56, act) * (1 - slp);
  var lag = 0.85;
  // idle sinusoidal S-bend transitioning smoothly into traveling slither wave
  var torYaw = waveAmp * 0.45 * sin(ph + t * 0.5 * (1 - act)) * (1 - slp);
  var torX = -0.12 * act * sin(ph) * (1 - slp);
  var f0y = waveAmp * sin(ph + lag) * (1 - slp) + slp * 0.72;
  var f1y = waveAmp * sin(ph + lag * 2) * (1 - slp) + slp * 0.72;
  var f0x = lerp(-0.18 + 0.03 * br, -0.04, act);
  var f1x = lerp(-0.14 - 0.03 * br, -0.02, act);
  var hx = lerp(0.28 + I.lookP * 0.5, 0.06, act);
  var hy = I.lookY * 0.45 * (1 - slp);

  if (W.play > 0.001) {
    var wp = W.play;
    f0x = lerp(f0x, -0.58, wp);
    f1x = lerp(f1x, -0.52, wp);
    hx = lerp(hx, 0.92, wp);
    hy = lerp(hy, 0.45 * sin(t * 4.5 + I.seed), wp);
  }
  if (W.eat > 0.001) {
    var we = W.eat;
    f0x = lerp(f0x, 0.02, we);
    f1x = lerp(f1x, 0.08 + 0.14 * sin(t * 5), we);
    hx = lerp(hx, 0.12 + 0.15 * sin(t * 5), we);
  }
  if (slp > 0.001) {
    f0x = lerp(f0x, 0.0, slp);
    f1x = lerp(f1x, 0.0, slp);
    hx = lerp(hx, 0.05, slp);
    ty = lerp(ty, 0.14, slp);
  }
  if (W.sick > 0.001) {
    f0x = lerp(f0x, 0.0, W.sick);
    f1x = lerp(f1x, 0.0, W.sick);
  }

  I.tor.position.set(torX, ty, 0);
  I.tor.rotation.set(0, torYaw, 0);
  I.tor.scale.set(1 + 0.02 * br, 1 + 0.02 * br, 1);
  I.fwd[0].rotation.set(f0x, f0y, 0);
  I.fwd[1].rotation.set(f1x, f1y, 0);
  I.head.rotation.set(hx, hy, 0);

  for (var bi = 0; bi < I.back.length; bi++) {
    var wv = waveAmp * (1.0 + bi * 0.06) * sin(ph - (bi + 1) * lag + 0.4 * (1 - act) * sin(t * 0.7 + I.seed));
    var coil = 0.66 + bi * 0.06;
    I.back[bi].rotation.set(0, lerp(wv, coil, slp), 0);
  }
}

// ================================================================ MONKEY (Capuchin)
OTHERS.monkey = function (opts) {
  var baby = !!opts.baby, P = partsCache.monkey;
  var BR = 0x6e472b, DK = 0x3a2416, CR = 0xe4cfa8;
  if (!P) {
    P = partsCache.monkey = {};
    var g = B();
    g.loft([
      [0.24, 0, 0.08, 0.08, 0.005],
      [0.14, 0, 0.145, 0.125, 0.01],
      [0.01, 0, 0.155, 0.132, 0.0],
      [-0.12, 0, 0.142, 0.128, -0.005],
      [-0.24, 0, 0.095, 0.09, -0.01]
    ], { axis: 'y', seg: 10, steps: 2 }, function (zc, ca, sa, x, y, z) {
      if (z > 0.02 && y > -0.16 && abs(x) < 0.12) return CR;
      return BR;
    });
    P.body = g.build();

    // head with dark cap & cream face mask
    g = B();
    g.sph(0.125, 0.12, 0.125, 0, 0.11, 0.02, function (x, y, z) {
      if (y > 0.165 && z < 0.12) return DK;
      if (z > 0.06 && y > 0.02 && y < 0.18 && abs(x) < 0.095) return CR;
      return BR;
    }, { s: [9, 7] });
    g.sph(0.095, 0.075, 0.07, 0, 0.095, 0.10, CR, { s: [7, 5] });
    g.sph(0.068, 0.055, 0.075, 0, 0.045, 0.125, CR, { s: [7, 5] });
    g.sph(0.022, 0.016, 0.016, 0, 0.065, 0.195, DK, { s: [4, 3] });
    g.tube([[-0.026, 0.027, 0.184], [0, 0.022, 0.196], [0.026, 0.027, 0.184]], 0.006, DK, { seg: 4, steps: 2 });
    eyePair(g, 0.046, 0.125, 0.148, 0.02, 0x24140a);
    earBall(g, 0.13, 0.115, 0.01, 0.046, CR, 0xc8a47c);
    earBall(g, -0.13, 0.115, 0.01, 0.046, CR, 0xc8a47c);
    P.head = g.build();

    g = B();
    g.limb(0, 0, 0, 0, -0.17, 0.01, 0.046, 0.036, BR, { seg: 6 });
    g.sph(0.038, 0.038, 0.038, 0, -0.17, 0.01, BR, { s: [5, 4] });
    P.armU = g.build();
    g = B();
    g.limb(0, 0, 0, 0, -0.17, 0.02, 0.036, 0.03, DK, { seg: 6 });
    g.sph(0.04, 0.045, 0.042, 0, -0.20, 0.03, 0xc8a47c, { s: [5, 4] });
    P.armL = g.build();

    g = B(); g.limb(0, 0, 0, 0, -0.19, 0, 0.055, 0.04, BR, { seg: 6 }); P.thigh = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.19, 0, 0.04, 0.03, DK, { seg: 6 });
    g.sph(0.042, 0.024, 0.075, 0, -0.20, 0.035, 0xc8a47c, { s: [5, 4] }); P.shank = g.build();

    // 4-segment curling prehensile tail
    P.tail = [];
    for (var ti = 0; ti < 4; ti++) {
      var gt = B(), r0 = lerp(0.032, 0.015, ti / 4), r1 = lerp(0.032, 0.015, (ti + 1) / 4);
      gt.limb(0, 0, 0, 0, 0, -0.24, r0, r1, ti >= 2 ? DK : BR, { seg: 5 });
      if (ti === 3) gt.sph(0.02, 0.02, 0.02, 0, 0, -0.24, DK, { s: [4, 3] });
      P.tail.push(gt.build());
    }
  }
  var sc = baby ? 0.55 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.50, 0);
  tor.add(mesh(P.body));
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.19, 0.03); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.35);
  var arms = [], elbows = [], hips = [], knees = [], tails = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.position.set(sd * 0.17, 0.15, 0.02); tor.add(ar); ar.add(mesh(P.armU)); arms.push(ar);
    var el = grp('elbow'); el.position.set(0, -0.17, 0.01); ar.add(el); el.add(mesh(P.armL)); elbows.push(el);
    var hp = grp('hip'); hp.position.set(sd * 0.085, -0.14, 0); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.19, 0); hp.add(kn); kn.add(mesh(P.shank)); knees.push(kn);
  }
  var par = tor;
  for (var q = 0; q < 4; q++) {
    var tp = grp('tail' + q); tp.rotation.order = 'YXZ'; par.add(tp);
    tp.position.set(0, q === 0 ? -0.12 : 0, q === 0 ? -0.12 : -0.24);
    tp.add(mesh(P.tail[q])); tails.push(tp); par = tp;
  }
  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, elbows: elbows, hips: hips, knees: knees, tails: tails, sc: sc });
  var out = { group: root, height: 0.85 * sc, update: function (dt, ent) { monkeyUpdate(I, dt, ent); } };
  monkeyUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function monkeyUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.55 * I.sc * (1 + 0.25 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 2.4 + I.seed), s = sin(ph), c = cos(ph);
  var ty = 0.56 - 0.04 * abs(s) * gw + 0.012 * br;
  var tp = lerp(0.18, 0.72, gw * (0.6 + 0.4 * rw));
  var tr = 0.07 * gw * s;
  var amp = lerp(0.55, 0.85, rw) * gw;
  var arm0 = lerp(-0.18, -0.55 - amp * s, gw), arm1 = lerp(-0.18, -0.55 + amp * s, gw);
  var leg0 = lerp(-0.12, amp * s - 0.2, gw), leg1 = lerp(-0.12, -amp * s - 0.2, gw);
  var kn0 = 0.25 + 0.55 * gw * max(0, -c), kn1 = 0.25 + 0.55 * gw * max(0, c);
  var hp = I.lookP, hy = I.lookY;
  if (W.play > 0.001) {
    var wp = W.play, hop = abs(sin(t * 7.5 + I.seed));
    ty += wp * hop * 0.28;
    tp = lerp(tp, -0.1, wp);
    arm0 = lerp(arm0, -2.0 + 0.5 * sin(t * 11), wp);
    arm1 = lerp(arm1, -2.0 - 0.5 * sin(t * 11), wp);
    leg0 = lerp(leg0, -0.5 * hop, wp); leg1 = lerp(leg1, -0.5 * hop, wp);
  }
  if (W.eat > 0.001) {
    var we = W.eat;
    ty = lerp(ty, 0.38, we); tp = lerp(tp, 0.35, we);
    leg0 = leg1 = lerp(leg0, -0.95, we); kn0 = kn1 = lerp(kn0, 1.4, we);
    arm0 = lerp(arm0, -1.05 + 0.22 * sin(t * 6), we);
    hp = lerp(hp, 0.32 + 0.12 * sin(t * 6), we);
  }
  if (W.swim > 0.001) {
    var wsw = W.swim;
    ty = lerp(ty, 0.30, wsw); tp = lerp(tp, 0.85, wsw);
    arm0 = lerp(arm0, -0.9 + 0.6 * sin(t * 6), wsw); arm1 = lerp(arm1, -0.9 - 0.6 * sin(t * 6), wsw);
  }
  if (W.sleep > 0.001) {
    var wl = W.sleep;
    ty = lerp(ty, 0.22, wl); tp = lerp(tp, 1.05, wl); tr = lerp(tr, 0.35, wl);
    leg0 = leg1 = lerp(leg0, -1.2, wl); kn0 = kn1 = lerp(kn0, 1.85, wl);
    arm0 = arm1 = lerp(arm0, -0.7, wl);
  }
  if (W.sick > 0.001) { tp = lerp(tp, 0.45, W.sick); hp = lerp(hp, 0.55, W.sick); }

  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr);
  I.head.rotation.set(hp - tp * 0.65, hy, 0);
  I.arms[0].rotation.set(arm0, 0, 0.14); I.arms[1].rotation.set(arm1, 0, -0.14);
  if (I.elbows) { I.elbows[0].rotation.x = -0.25 - 0.35 * gw * Math.max(0, s) - 0.5 * W.eat; I.elbows[1].rotation.x = -0.25 - 0.35 * gw * Math.max(0, -s); }
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
  // prehensile curled tail
  var curl = lerp(0.55, 0.15, W.sleep);
  I.tails[0].rotation.set(lerp(0.65, 0.15, W.sleep) + 0.12 * sin(t * 2.5 + I.seed), 0.28 * sin(t * 2.1 + I.seed), 0);
  I.tails[1].rotation.set(curl + 0.1 * sin(t * 2.8), 0.22 * sin(t * 2.4 + 0.8), 0);
  I.tails[2].rotation.set(curl * 1.15, 0.2 * sin(t * 2.4 + 1.6), 0);
  I.tails[3].rotation.set(curl * 1.25, 0.18 * sin(t * 2.4 + 2.4), 0);
}

// ================================================================ CHIMPANZEE
OTHERS.chimpanzee = function (opts) {
  var baby = !!opts.baby, P = partsCache.chimpanzee;
  var BK = 0x252428, BK2 = 0x333238, SK = 0xcfa382, SK2 = 0xb08264;
  var fc = function (x, y, z) { return hash3(Math.floor(x * 9), Math.floor(y * 9), Math.floor(z * 9)) > 0.65 ? BK2 : BK; };
  if (!P) {
    P = partsCache.chimpanzee = {};
    var g = B();
    g.loft([
      [0.36, 0, 0.14, 0.13, 0.02],
      [0.24, 0, 0.30, 0.21, 0.02],
      [0.06, 0, 0.27, 0.22, 0.02],
      [-0.14, 0, 0.25, 0.20, 0.0],
      [-0.33, 0, 0.15, 0.14, -0.01]
    ], { axis: 'y', seg: 10, steps: 2 }, function (zc, ca, sa, x, y, z) { return fc(x, y, z); });
    P.body = g.build();

    g = B();
    g.sph(0.155, 0.165, 0.155, 0, 0.12, 0.01, fc, { s: [9, 7] });
    g.sph(0.125, 0.11, 0.085, 0, 0.10, 0.115, SK, { s: [7, 5] });
    g.sph(0.10, 0.075, 0.10, 0, 0.025, 0.145, SK, { s: [7, 5] });
    g.tube([[-0.115, 0.162, 0.122], [-0.045, 0.184, 0.168], [0, 0.178, 0.175], [0.045, 0.184, 0.168], [0.115, 0.162, 0.122]], [0.018, 0.026, 0.028, 0.026, 0.018], BK, { seg: 5, steps: 2 });
    g.sph(0.028, 0.02, 0.02, 0, 0.075, 0.225, SK2, { s: [4, 3] });
    g.tube([[-0.036, 0.014, 0.222], [0, 0.008, 0.236], [0.036, 0.014, 0.222]], 0.007, 0x5a3a2a, { seg: 4, steps: 2 });
    eyePair(g, 0.052, 0.135, 0.18, 0.02, 0x1c120a);
    // big rounded tan/peach ears
    earBall(g, 0.175, 0.115, 0.0, 0.076, SK, SK2);
    earBall(g, -0.175, 0.115, 0.0, 0.076, SK, SK2);
    P.head = g.build();

    // long muscular arms (2-segment with articulated elbow)
    g = B();
    g.sph(0.085, 0.09, 0.085, 0, -0.02, 0, BK, { s: [6, 5] });
    g.limb(0, 0, 0, 0, -0.34, 0, 0.075, 0.06, fc, { seg: 7 });
    g.sph(0.062, 0.062, 0.062, 0, -0.34, 0, fc, { s: [5, 4] });
    P.armU = g.build();
    g = B();
    g.limb(0, 0, 0, 0, -0.32, 0.04, 0.06, 0.048, fc, { seg: 7 });
    g.sph(0.058, 0.065, 0.055, 0, -0.36, 0.05, 0x3b3432, { s: [6, 4] });
    P.armL = g.build();

    // stocky legs
    g = B(); g.limb(0, 0, 0, 0, -0.24, 0, 0.095, 0.07, fc, { seg: 7 }); P.thigh = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.24, 0, 0.07, 0.052, fc, { seg: 7 });
    g.sph(0.06, 0.032, 0.11, 0, -0.25, 0.05, 0x3b3432, { s: [6, 4] }); P.shank = g.build();
  }
  var sc = baby ? 0.5 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.64, 0);
  tor.add(mesh(P.body));
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.29, 0.06); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.38);
  var arms = [], elbows = [], hips = [], knees = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.position.set(sd * 0.28, 0.22, 0.03); tor.add(ar); ar.add(mesh(P.armU)); arms.push(ar);
    var el = grp('elbow'); el.position.set(0, -0.34, 0); ar.add(el); el.add(mesh(P.armL)); elbows.push(el);
    var hp = grp('hip'); hp.position.set(sd * 0.14, -0.22, 0); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.24, 0); hp.add(kn); kn.add(mesh(P.shank)); knees.push(kn);
  }
  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, elbows: elbows, hips: hips, knees: knees, sc: sc });
  var out = { group: root, height: 1.25 * sc, update: function (dt, ent) { chimpanzeeUpdate(I, dt, ent); } };
  chimpanzeeUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function chimpanzeeUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.85 * I.sc * (1 + 0.2 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 2.0 + I.seed), s = sin(ph), c = cos(ph);
  // semi-upright / knuckle-walk gait
  var ty = lerp(0.74, 0.66 - 0.04 * abs(s), gw) + 0.015 * br;
  var tp = lerp(0.28, 0.72 + 0.12 * rw, gw);
  var tr = 0.09 * gw * s;
  var amp = lerp(0.5, 0.78, rw) * gw;
  var arm0 = lerp(-0.12, -0.58 + amp * 0.9 * s, gw), arm1 = lerp(-0.12, -0.58 - amp * 0.9 * s, gw);
  var leg0 = lerp(-0.2, -amp * s - 0.2, gw), leg1 = lerp(-0.2, amp * s - 0.2, gw);
  var kn0 = lerp(0.35, 0.4 + 0.45 * max(0, -c), gw), kn1 = lerp(0.35, 0.4 + 0.45 * max(0, c), gw);
  var hp = I.lookP, hy = I.lookY;
  if (W.play > 0.001) {
    var wp = W.play, hop = abs(sin(t * 6.5 + I.seed));
    ty += wp * hop * 0.22; tp = lerp(tp, 0.08, wp);
    arm0 = lerp(arm0, -1.8 + 0.55 * sin(t * 10), wp);
    arm1 = lerp(arm1, -1.8 - 0.55 * sin(t * 10), wp);
  }
  if (W.eat > 0.001) {
    var we = W.eat;
    ty = lerp(ty, 0.45, we); tp = lerp(tp, 0.42, we);
    leg0 = leg1 = lerp(leg0, -1.05, we); kn0 = kn1 = lerp(kn0, 1.5, we);
    arm0 = lerp(arm0, -1.05 + 0.22 * sin(t * 5), we);
    hp = lerp(hp, 0.35 + 0.1 * sin(t * 5), we);
  }
  if (W.swim > 0.001) {
    var wsw = W.swim;
    ty = lerp(ty, 0.36, wsw); tp = lerp(tp, 0.65, wsw);
    arm0 = lerp(arm0, -0.9 + 0.6 * sin(t * 5), wsw); arm1 = lerp(arm1, -0.9 - 0.6 * sin(t * 5), wsw);
  }
  if (W.sleep > 0.001) {
    var wl = W.sleep;
    ty = lerp(ty, 0.26, wl); tp = lerp(tp, 1.25, wl); tr = lerp(tr, 0.3, wl);
    leg0 = leg1 = lerp(leg0, -1.1, wl); kn0 = kn1 = lerp(kn0, 1.7, wl);
    arm0 = arm1 = lerp(arm0, -0.75, wl);
  }
  if (W.sick > 0.001) { tp = lerp(tp, 0.52, W.sick); hp = lerp(hp, 0.55, W.sick); }

  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr);
  I.head.rotation.set(hp - tp * 0.65, hy, 0);
  I.arms[0].rotation.set(arm0, 0, 0.16); I.arms[1].rotation.set(arm1, 0, -0.16);
  if (I.elbows) { I.elbows[0].rotation.x = -0.22 - 0.28 * gw * max(0, -s) - 0.45 * W.eat; I.elbows[1].rotation.x = -0.22 - 0.28 * gw * max(0, s); }
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
}

// ================================================================ LEMUR (Ring-tailed)
OTHERS.lemur = function (opts) {
  var baby = !!opts.baby, P = partsCache.lemur;
  var GR = 0x8c8f96, WH = 0xf2f2f0, BK = 0x1c1c20;
  if (!P) {
    P = partsCache.lemur = {};
    var g = B();
    g.loft([
      [0.24, 0, 0.08, 0.075, 0.005],
      [0.14, 0, 0.135, 0.12, 0.01],
      [0.01, 0, 0.145, 0.128, 0.0],
      [-0.12, 0, 0.14, 0.125, -0.005],
      [-0.24, 0, 0.095, 0.085, -0.01]
    ], { axis: 'y', seg: 10, steps: 2 }, function (zc, ca, sa, x, y, z) { return z > 0.01 ? WH : GR; });
    P.body = g.build();

    // white face, silver-grey crown, black eye patches & pointed snout with black nose
    g = B();
    g.sph(0.11, 0.105, 0.11, 0, 0.09, 0.02, function (x, y, z) { return (y > 0.14 || z < 0.0) ? GR : WH; }, { s: [8, 6] });
    // pointed snout
    g.limb(0, 0.06, 0.09, 0, 0.04, 0.21, 0.062, 0.028, WH, { seg: 6 });
    g.sph(0.026, 0.022, 0.024, 0, 0.042, 0.22, BK, { s: [5, 4] }); // black nose
    // signature black eye patches
    g.sph(0.036, 0.032, 0.02, 0.048, 0.10, 0.115, BK, { s: [5, 4], rot: [0, 0.35, 0.2] });
    g.sph(0.036, 0.032, 0.02, -0.048, 0.10, 0.115, BK, { s: [5, 4], rot: [0, -0.35, -0.2] });
    eyePair(g, 0.048, 0.102, 0.126, 0.016, 0xe08820);
    // fuzzy white/grey triangular cupped ears
    for (var es = -1; es <= 1; es += 2) {
      g.extrude([[-0.036, 0], [0.036, 0], [0.022, 0.07], [0, 0.098], [-0.022, 0.07]], 0.016, es * 0.095, 0.132, -0.008, [0.1, es * 0.3, -es * 0.28], function (x, y, z, nx, ny, nz) { return nz > 0.2 ? 0x555860 : WH; }, { bevel: 0.004, curveX: 0.012 });
    }
    P.head = g.build();

    g = B(); g.limb(0, 0, 0, 0, -0.14, 0.008, 0.038, 0.031, GR, { seg: 6 });
    g.sph(0.032, 0.032, 0.032, 0, -0.14, 0.008, GR, { s: [5, 4] }); P.armU = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.13, 0.015, 0.031, 0.026, GR, { seg: 6 });
    g.sph(0.032, 0.038, 0.036, 0, -0.15, 0.022, BK, { s: [5, 4] }); P.armL = g.build();

    g = B(); g.limb(0, 0, 0, 0, -0.19, 0, 0.05, 0.035, GR, { seg: 6 }); P.thigh = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.19, 0, 0.035, 0.025, GR, { seg: 6 });
    g.sph(0.036, 0.022, 0.072, 0, -0.20, 0.035, BK, { s: [5, 4] }); P.shank = g.build();

    // 5-segment iconic black-and-white ringed tail
    P.tail = [];
    for (var ti = 0; ti < 5; ti++) {
      var gt = B(), r0 = lerp(0.04, 0.028, ti / 5), r1 = lerp(0.04, 0.028, (ti + 1) / 5);
      var tc = (function (ii) {
        return function (x, y, z) { return fract((-z / 0.22 + ii) * 1.5) < 0.5 ? BK : WH; };
      })(ti);
      gt.limb(0, 0, 0, 0, 0, -0.22, r0, r1, tc, { seg: 6, hs: 4 });
      if (ti === 4) gt.sph(0.03, 0.03, 0.04, 0, 0, -0.22, BK, { s: [5, 4] });
      P.tail.push(gt.build());
    }
  }
  var sc = baby ? 0.55 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.46, 0);
  tor.add(mesh(P.body));
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.19, 0.04); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.35);
  var arms = [], elbows = [], hips = [], knees = [], tails = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.position.set(sd * 0.145, 0.14, 0.02); tor.add(ar); ar.add(mesh(P.armU)); arms.push(ar);
    var el = grp('elbow'); el.position.set(0, -0.14, 0.008); ar.add(el); el.add(mesh(P.armL)); elbows.push(el);
    var hp = grp('hip'); hp.position.set(sd * 0.08, -0.14, 0); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.19, 0); hp.add(kn); kn.add(mesh(P.shank)); knees.push(kn);
  }
  var par = tor;
  for (var q = 0; q < 5; q++) {
    var tp = grp('tail' + q); tp.rotation.order = 'YXZ'; par.add(tp);
    tp.position.set(0, q === 0 ? -0.10 : 0, q === 0 ? -0.12 : -0.22);
    tp.add(mesh(P.tail[q])); tails.push(tp); par = tp;
  }
  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, elbows: elbows, hips: hips, knees: knees, tails: tails, sc: sc });
  var out = { group: root, height: 0.95 * sc, update: function (dt, ent) { lemurUpdate(I, dt, ent); } };
  lemurUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function lemurUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.55 * I.sc * (1 + 0.25 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 2.2 + I.seed), s = sin(ph), c = cos(ph);
  var ty = 0.55 - 0.04 * abs(s) * gw + 0.012 * br;
  var tp = lerp(0.14, 0.78, gw * (0.65 + 0.35 * rw));
  var tr = 0.06 * gw * s;
  var amp = lerp(0.55, 0.85, rw) * gw;
  var arm0 = lerp(-0.15, -0.6 - amp * s, gw), arm1 = lerp(-0.15, -0.6 + amp * s, gw);
  var leg0 = lerp(-0.12, amp * s - 0.2, gw), leg1 = lerp(-0.12, -amp * s - 0.2, gw);
  var kn0 = 0.25 + 0.55 * gw * max(0, -c), kn1 = 0.25 + 0.55 * gw * max(0, c);
  var hp = I.lookP, hy = I.lookY;
  if (W.play > 0.001) {
    var wp = W.play, hop = abs(sin(t * 7 + I.seed));
    ty += wp * hop * 0.26; tp = lerp(tp, -0.05, wp);
    arm0 = lerp(arm0, -1.4 + 0.3 * sin(t * 9), wp); arm1 = lerp(arm1, -1.4 - 0.3 * sin(t * 9), wp);
  }
  if (W.eat > 0.001) {
    var we = W.eat;
    ty = lerp(ty, 0.35, we); tp = lerp(tp, 0.38, we);
    leg0 = leg1 = lerp(leg0, -0.95, we); kn0 = kn1 = lerp(kn0, 1.4, we);
    arm0 = lerp(arm0, -0.9 + 0.2 * sin(t * 5), we); hp = lerp(hp, 0.35 + 0.1 * sin(t * 5), we);
  }
  if (W.sleep > 0.001) {
    var wl = W.sleep;
    ty = lerp(ty, 0.2, wl); tp = lerp(tp, 1.05, wl); tr = lerp(tr, 0.35, wl);
    leg0 = leg1 = lerp(leg0, -1.15, wl); kn0 = kn1 = lerp(kn0, 1.8, wl);
  }
  if (W.sick > 0.001) { tp = lerp(tp, 0.42, W.sick); hp = lerp(hp, 0.5, W.sick); }

  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr);
  I.head.rotation.set(hp - tp * 0.65, hy, 0);
  I.arms[0].rotation.set(arm0, 0, 0.14 + 0.5 * W.play); I.arms[1].rotation.set(arm1, 0, -0.14 - 0.5 * W.play);
  if (I.elbows) { I.elbows[0].rotation.x = -0.22 - 0.3 * gw * max(0, s) - 0.45 * W.eat; I.elbows[1].rotation.x = -0.22 - 0.3 * gw * max(0, -s); }
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
  // tall question-mark ringed tail held high
  var tBase = [1.15 - tp * 0.4, 0.42, 0.18, -0.35, -0.48];
  for (var ti = 0; ti < 5; ti++) {
    var tx = lerp(tBase[ti], ti === 0 ? -0.1 : 0.2, W.sleep) + 0.05 * sin(t * 2.2 - ti * 0.7);
    var tyaw = lerp(0.14 * sin(t * 2.1 - ti * 0.6 + I.seed), 0.45, W.sleep);
    I.tails[ti].rotation.set(tx, tyaw, 0);
  }
}

// ================================================================ ORANGUTAN
OTHERS.orangutan = function (opts) {
  var baby = !!opts.baby, isMale = !baby && (opts.sex || 'm').toLowerCase() !== 'f';
  var key = 'orangutan_' + (isMale ? 'm' : 'f'), P = partsCache[key];
  var OR = 0xb85020, OR2 = 0x963a14, OR3 = 0xc85c28, FC = 0x5c3624, FC2 = 0x46281a;
  var fc = function (x, y, z) {
    var h = hash3(Math.floor(x * 8), Math.floor(y * 8), Math.floor(z * 8));
    return h > 0.65 ? OR3 : (h < 0.28 ? OR2 : OR);
  };
  if (!P) {
    P = partsCache[key] = {};
    var g = B();
    // rounded belly and shaggy shoulders
    g.loft([
      [0.37, 0, 0.17, 0.15, 0.02],
      [0.24, 0, 0.33, 0.24, 0.025],
      [0.02, 0, 0.35, 0.30, 0.04],
      [-0.16, 0, 0.32, 0.28, 0.02],
      [-0.36, 0, 0.20, 0.18, -0.01]
    ], { axis: 'y', seg: 11, steps: 2 }, function (zc, ca, sa, x, y, z) { return fc(x, y, z); });
    // shaggy shoulder fur tufts
    g.cone(0.12, 0.22, 0.34, 0.24, 0.0, OR2, { seg: 5, rot: [0, 0, -2.5] });
    g.cone(0.12, 0.22, -0.34, 0.24, 0.0, OR2, { seg: 5, rot: [0, 0, 2.5] });
    if (isMale) g.sph(0.17, 0.12, 0.14, 0, 0.24, 0.16, OR2, { s: [7, 5] }); // throat pouch
    P.body = g.build();

    // darker brown face, male wide cheek flanges when sex === 'M'
    g = B();
    g.sph(0.165, 0.18, 0.165, 0, 0.13, 0.01, fc, { s: [9, 7] });
    g.sph(0.13, 0.125, 0.095, 0, 0.11, 0.11, FC, { s: [8, 6] });
    g.sph(0.105, 0.08, 0.105, 0, 0.035, 0.145, FC, { s: [7, 5] });
    g.sph(0.028, 0.02, 0.02, 0, 0.085, 0.23, FC2, { s: [4, 3] });
    g.tube([[-0.038, 0.023, 0.226], [0, 0.017, 0.24], [0.038, 0.023, 0.226]], 0.007, FC2, { seg: 4, steps: 2 });
    eyePair(g, 0.05, 0.14, 0.185, 0.019, 0x1a1008);
    earBall(g, 0.15, 0.12, 0.0, 0.042, FC, FC2);
    earBall(g, -0.15, 0.12, 0.0, 0.042, FC, FC2);
    if (isMale) {
      // wide male cheek flanges
      g.sph(0.095, 0.165, 0.055, 0.155, 0.095, 0.10, FC2, { s: [7, 5], rot: [0, -0.25, 0] });
      g.sph(0.095, 0.165, 0.055, -0.155, 0.095, 0.10, FC2, { s: [7, 5], rot: [0, 0.25, 0] });
    }
    P.head = g.build();

    // very long hanging shaggy arms (2-segment with elbow)
    g = B();
    g.sph(0.095, 0.1, 0.095, 0, -0.02, 0, OR, { s: [6, 5] });
    g.limb(0, 0, 0, 0, -0.44, 0, 0.085, 0.068, fc, { seg: 7 });
    g.sph(0.07, 0.07, 0.07, 0, -0.44, 0, fc, { s: [5, 4] });
    g.cone(0.07, 0.18, 0, -0.38, -0.05, OR2, { seg: 4, rot: [PI, 0, 0] });
    P.armU = g.build();
    g = B();
    g.limb(0, 0, 0, 0, -0.44, 0.04, 0.068, 0.052, fc, { seg: 7 });
    g.sph(0.062, 0.072, 0.06, 0, -0.48, 0.05, FC, { s: [6, 4] });
    P.armL = g.build();

    // shorter bowed legs
    g = B(); g.limb(0, 0, 0, 0, -0.23, 0, 0.10, 0.075, fc, { seg: 7 }); P.thigh = g.build();
    g = B(); g.limb(0, 0, 0, 0, -0.23, 0, 0.075, 0.055, fc, { seg: 7 });
    g.sph(0.065, 0.032, 0.115, 0, -0.24, 0.045, FC, { s: [6, 4] }); P.shank = g.build();
  }
  var sc = baby ? 0.48 : (isMale ? 1.0 : 0.86);
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.64, 0);
  tor.add(mesh(P.body));
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.30, 0.05); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.38);
  var arms = [], elbows = [], hips = [], knees = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.position.set(sd * 0.33, 0.22, 0.03); tor.add(ar); ar.add(mesh(P.armU)); arms.push(ar);
    var el = grp('elbow'); el.position.set(0, -0.44, 0); ar.add(el); el.add(mesh(P.armL)); elbows.push(el);
    var hp = grp('hip'); hp.position.set(sd * 0.16, -0.21, 0); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.23, 0); hp.add(kn); kn.add(mesh(P.shank)); knees.push(kn);
  }
  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, elbows: elbows, hips: hips, knees: knees, sc: sc });
  var out = { group: root, height: 1.38 * sc, update: function (dt, ent) { orangutanUpdate(I, dt, ent); } };
  orangutanUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function orangutanUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.85 * I.sc * (1 + 0.2 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 1.7 + I.seed), s = sin(ph), c = cos(ph);
  var ty = lerp(0.80, 0.72 - 0.03 * abs(s), gw) + 0.015 * br;
  var tp = lerp(0.24, 0.65 + 0.1 * rw, gw);
  var tr = 0.08 * gw * s + 0.04 * sin(t * 1.1 + I.seed) * (1 - gw);
  var amp = lerp(0.45, 0.68, rw) * gw;
  var arm0 = lerp(-0.18, -0.52 + amp * 0.85 * s, gw), arm1 = lerp(-0.18, -0.52 - amp * 0.85 * s, gw);
  var leg0 = lerp(-0.22, -amp * s - 0.22, gw), leg1 = lerp(-0.22, amp * s - 0.22, gw);
  var kn0 = lerp(0.35, 0.4 + 0.4 * max(0, -c), gw), kn1 = lerp(0.35, 0.4 + 0.4 * max(0, c), gw);
  var hp = I.lookP, hy = I.lookY;
  if (W.play > 0.001) {
    var wp = W.play;
    arm0 = lerp(arm0, -1.6 + 0.45 * sin(t * 6), wp); arm1 = lerp(arm1, -1.6 - 0.45 * sin(t * 6), wp);
    tr = lerp(tr, 0.14 * sin(t * 4), wp);
  }
  if (W.eat > 0.001) {
    var we = W.eat;
    ty = lerp(ty, 0.48, we); tp = lerp(tp, 0.36, we);
    leg0 = leg1 = lerp(leg0, -1.0, we); kn0 = kn1 = lerp(kn0, 1.45, we);
    arm0 = lerp(arm0, -1.0 + 0.2 * sin(t * 4.5), we);
    hp = lerp(hp, 0.32 + 0.1 * sin(t * 4.5), we);
  }
  if (W.sleep > 0.001) {
    var wl = W.sleep;
    ty = lerp(ty, 0.28, wl); tp = lerp(tp, 1.22, wl); tr = lerp(tr, 0.28, wl);
    leg0 = leg1 = lerp(leg0, -1.05, wl); kn0 = kn1 = lerp(kn0, 1.65, wl);
    arm0 = arm1 = lerp(arm0, -0.85, wl);
  }
  if (W.sick > 0.001) { tp = lerp(tp, 0.48, W.sick); hp = lerp(hp, 0.5, W.sick); }

  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr);
  I.head.rotation.set(hp - tp * 0.65, hy, 0);
  I.arms[0].rotation.set(arm0, 0, 0.18); I.arms[1].rotation.set(arm1, 0, -0.18);
  if (I.elbows) { I.elbows[0].rotation.x = -0.18 - 0.24 * gw * max(0, -s) - 0.4 * W.eat; I.elbows[1].rotation.x = -0.18 - 0.24 * gw * max(0, s); }
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
}

// ================================================================ PUSS IN BOOTS
OTHERS.puss_in_boots = function (opts) {
  var baby = !!opts.baby, P = partsCache.puss_in_boots;
  var OR = 0xe0842c, STR = 0xb05414, CR = 0xf7e3c4, BT = 0x261810, BT2 = 0x3a2518;
  var HAT = 0x221a18, GD = 0xf2c94c, CP = 0xb8222a, CP2 = 0x82141a, SLV = 0xe0e8f0;
  var tabby = function (x, y, z) {
    if (z > 0.04 && abs(x) < 0.10 && y > -0.16 && y < 0.18) return CR;
    return fract(y * 9.5 + abs(x) * 2.5) < 0.28 ? STR : OR;
  };
  if (!P) {
    P = partsCache.puss_in_boots = {};
    // upright orange tabby torso + leather belt & gold buckle
    var g = B();
    g.loft([
      [0.24, 0, 0.085, 0.08, 0.0],
      [0.14, 0, 0.148, 0.132, 0.006],
      [0.01, 0, 0.158, 0.138, 0.0],
      [-0.12, 0, 0.146, 0.132, -0.004],
      [-0.25, 0, 0.098, 0.092, -0.008]
    ], { axis: 'y', seg: 10, steps: 2 }, function (zc, ca, sa, x, y, z) { return tabby(x, y, z); });
    g.cyl(0.155, 0.155, 0.055, 0, -0.09, 0, BT, { seg: 10 });
    g.bevelBox(0.068, 0.068, 0.032, 0.008, 0, -0.09, 0.146, GD); // gold belt buckle
    g.sph(0.032, 0.032, 0.025, 0.11, 0.18, 0.08, GD, { s: [5, 4] }); // cape clasps
    g.sph(0.032, 0.032, 0.025, -0.11, 0.18, 0.08, GD, { s: [5, 4] });
    P.body = g.build();

    // cute orange tabby cat head, expressive green eyes, wide-brimmed cavalier hat + golden feather plume
    g = B();
    g.sph(0.155, 0.14, 0.145, 0, 0.11, 0.01, function (x, y, z) {
      if (z > 0.07 && y < 0.11 && abs(x) < 0.11) return CR;
      return fract(abs(x) * 14 + y * 5) < 0.26 ? STR : OR;
    }, { s: [9, 7] });
    g.sph(0.068, 0.045, 0.06, 0.036, 0.065, 0.13, CR, { s: [6, 5] });
    g.sph(0.068, 0.045, 0.06, -0.036, 0.065, 0.13, CR, { s: [6, 5] });
    g.sph(0.024, 0.018, 0.02, 0, 0.085, 0.175, 0xe88a98, { s: [5, 4] }); // pink nose
    // expressive large green eyes with catchlights
    g.sph(0.036, 0.04, 0.024, 0.062, 0.135, 0.138, 0x36b848, { s: [6, 5] });
    g.sph(0.036, 0.04, 0.024, -0.062, 0.135, 0.138, 0x36b848, { s: [6, 5] });
    g.sph(0.022, 0.028, 0.018, 0.062, 0.135, 0.15, 0x111111, { s: [5, 4] });
    g.sph(0.022, 0.028, 0.018, -0.062, 0.135, 0.15, 0x111111, { s: [5, 4] });
    g.sph(0.01, 0.01, 0.008, 0.072, 0.148, 0.162, 0xffffff, { s: [4, 3] });
    g.sph(0.01, 0.01, 0.008, -0.052, 0.148, 0.162, 0xffffff, { s: [4, 3] });
    // cat ears
    earCone(g, 0.105, 0.24, 0.0, 0.05, 0.11, 0.25, OR, 0xf2b0b8);
    earCone(g, -0.105, 0.24, 0.0, 0.05, 0.11, 0.25, OR, 0xf2b0b8);
    // wide-brimmed dark cavalier hat + gold band + golden feather plume
    g.cyl(0.28, 0.30, 0.026, 0.015, 0.235, -0.01, HAT, { seg: 12, rot: [-0.08, 0, -0.12] });
    g.cyl(0.135, 0.155, 0.15, 0.025, 0.31, -0.015, HAT, { seg: 10, rot: [-0.08, 0, -0.12] });
    g.cyl(0.156, 0.158, 0.032, 0.02, 0.255, -0.012, GD, { seg: 10, rot: [-0.08, 0, -0.12] });
    // golden feather plume sweeping up & back from left side of hat
    g.tube([[0.13, 0.27, 0.02], [0.19, 0.40, -0.05], [0.23, 0.50, -0.15], [0.25, 0.56, -0.28]], [0.022, 0.036, 0.032, 0.01], GD, { seg: 5, steps: 2 });
    g.extrude([[0, 0], [0.035, 0.06], [0.044, 0.16], [0.028, 0.28], [0, 0.34], [-0.026, 0.26], [-0.038, 0.14], [-0.026, 0.04]], 0.012, 0.18, 0.34, -0.04, [-0.85, 0.35, -0.28], shade(GD, 1.08), { bevel: 0.003, curveY: -0.04 });
    P.head = g.build();

    // flowing crimson cape (sculpted curved cloak articulated from upper back)
    g = B();
    g.extrude([[-0.13, 0], [0.13, 0], [0.18, -0.28], [0.23, -0.56], [0.12, -0.62], [0, -0.60], [-0.12, -0.62], [-0.23, -0.56], [-0.18, -0.28]], 0.028, 0, 0.01, -0.02, [0.18, 0, 0], function (x, y, z, nx, ny, nz) { return nz > 0 ? CP2 : CP; }, { bevel: 0.006, curveX: -0.045, curveY: -0.055 });
    P.cape = g.build();

    // left arm (empty paw) & right arm (holding shiny silver rapier with gold guard!)
    g = B();
    g.limb(0, 0, 0, 0, -0.26, 0.02, 0.045, 0.034, function (x, y) { return fract(y * 12) < 0.3 ? STR : OR; }, { seg: 6 });
    g.sph(0.042, 0.045, 0.042, 0, -0.28, 0.03, CR, { s: [5, 4] });
    P.armL = g.build();

    g = B();
    g.limb(0, 0, 0, 0, -0.26, 0.03, 0.045, 0.034, function (x, y) { return fract(y * 12) < 0.3 ? STR : OR; }, { seg: 6 });
    g.sph(0.042, 0.045, 0.042, 0, -0.28, 0.04, CR, { s: [5, 4] });
    // rapier sword with gold guard & pommel held pointing forward/up
    g.cyl(0.016, 0.016, 0.11, 0, -0.28, 0.06, BT, { seg: 6, rot: [1.15, 0, 0] });
    g.sph(0.022, 0.022, 0.022, 0, -0.26, 0.01, GD, { s: [5, 4] }); // gold pommel
    g.sph(0.048, 0.048, 0.024, 0, -0.30, 0.11, GD, { s: [6, 4], rot: [1.15, 0, 0] }); // gold cup guard
    g.bevelBox(0.115, 0.016, 0.016, 0.004, 0, -0.30, 0.11, GD); // gold crossguard
    g.limb(0, -0.30, 0.11, 0, -0.44, 0.62, 0.014, 0.003, SLV, { seg: 4 }); // shiny silver rapier blade
    P.armR = g.build();

    // thighs & tall dark leather boots with sculpted folded cuffs
    g = B(); g.limb(0, 0, 0, 0, -0.17, 0, 0.062, 0.048, OR, { seg: 6 }); P.thigh = g.build();
    g = B();
    g.lathe([[0.048, -0.055], [0.066, 0.01], [0.06, 0.035], [0.046, 0.02]], BT2, { seg: 10 }); // folded leather cuff
    g.limb(0, -0.02, 0, 0, -0.22, 0, 0.048, 0.042, BT, { seg: 8 }); // boot shaft
    g.sph(0.05, 0.034, 0.088, 0, -0.228, 0.042, BT, { s: [7, 5] }); // rounded cavalier toe
    g.bevelBox(0.082, 0.042, 0.062, 0.008, 0, -0.242, -0.01, BT); // stacked boot heel
    g.bevelBox(0.042, 0.026, 0.022, 0.005, 0, -0.198, 0.084, GD); // tiny gold boot buckle
    P.boot = g.build();

    // 3-segment orange tabby tail
    P.tail = [];
    for (var ti = 0; ti < 3; ti++) {
      var gt = B(), r0 = lerp(0.036, 0.022, ti / 3), r1 = lerp(0.036, 0.022, (ti + 1) / 3);
      gt.limb(0, 0, 0, 0, 0, -0.20, r0, r1, function (x, y, z) { return fract(-z * 11) < 0.35 ? STR : OR; }, { seg: 5, hs: 3 });
      if (ti === 2) gt.sph(0.025, 0.025, 0.035, 0, 0, -0.20, STR, { s: [5, 4] });
      P.tail.push(gt.build());
    }
  }
  var sc = baby ? 0.55 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.56, 0);
  tor.add(mesh(P.body));
  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.21, 0.02); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.32);
  var cape = grp('cape'); cape.position.set(0, 0.18, -0.12); tor.add(cape); cape.add(mesh(P.cape));
  var arms = [], hips = [], knees = [], tails = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.rotation.order = 'YXZ'; ar.position.set(sd * 0.17, 0.16, 0.01); tor.add(ar);
    ar.add(mesh(s ? P.armR : P.armL)); arms.push(ar);
    var hp = grp('hip'); hp.position.set(sd * 0.085, -0.15, 0); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.17, 0); hp.add(kn); kn.add(mesh(P.boot)); knees.push(kn);
  }
  var par = tor;
  for (var q = 0; q < 3; q++) {
    var tp = grp('tail' + q); tp.rotation.order = 'YXZ'; par.add(tp);
    tp.position.set(0, q === 0 ? -0.12 : 0, q === 0 ? -0.12 : -0.20);
    tp.add(mesh(P.tail[q])); tails.push(tp); par = tp;
  }
  var I = newInst({ rig: rig, tor: tor, head: head, cape: cape, arms: arms, hips: hips, knees: knees, tails: tails, sc: sc });
  var out = { group: root, height: 1.25 * sc, update: function (dt, ent) { pussUpdate(I, dt, ent); } };
  pussUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function pussUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.62 * I.sc * (1 + 0.2 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 2.2 + I.seed), s = sin(ph), c = cos(ph);
  // jaunty upright strut
  var ty = 0.585 - 0.03 * abs(s) * gw + 0.012 * br;
  var tp = lerp(-0.04, -0.08 + 0.06 * rw, gw);
  var tr = 0.08 * gw * s;
  var amp = lerp(0.55, 0.85, rw) * gw;
  var arm0 = lerp(-0.15, amp * s, gw), arm1 = lerp(-0.45, -0.45 - amp * 0.7 * s, gw);
  var arm1y = 0, arm1z = -0.16;
  var leg0 = amp * s, leg1 = -amp * s;
  var kn0 = 0.1 + 0.55 * gw * max(0, -c), kn1 = 0.1 + 0.55 * gw * max(0, c);
  var hp = I.lookP * 0.6, hy = I.lookY * 0.7;
  var capeX = 0.08 + 0.25 * gw + 0.22 * rw + 0.06 * sin(t * 2.6 + I.seed);

  if (W.play > 0.001) {
    // flourishing sword arm & fencing lunge!
    var wp = W.play, hop = abs(sin(t * 6.5 + I.seed));
    ty += wp * hop * 0.20;
    tp = lerp(tp, -0.10, wp);
    arm1 = lerp(arm1, -1.25 + 0.45 * sin(t * 9 + I.seed), wp);
    arm1y = lerp(0, 0.5 * cos(t * 9 + I.seed), wp);
    arm1z = lerp(arm1z, -0.45, wp);
    arm0 = lerp(arm0, -0.8, wp);
    capeX = lerp(capeX, 0.55 + 0.18 * sin(t * 8), wp);
  }
  if (W.eat > 0.001) {
    var we = W.eat;
    tp = lerp(tp, 0.28, we); arm0 = lerp(arm0, -0.9 + 0.2 * sin(t * 5), we);
    hp = lerp(hp, 0.35 + 0.1 * sin(t * 5), we);
  }
  if (W.sleep > 0.001) {
    // curled sleep pose
    var wl = W.sleep;
    ty = lerp(ty, 0.18, wl); tp = lerp(tp, 1.15, wl); tr = lerp(tr, 0.42, wl);
    leg0 = leg1 = lerp(leg0, -1.25, wl); kn0 = kn1 = lerp(kn0, 1.85, wl);
    arm0 = arm1 = lerp(arm0, -0.65, wl);
    capeX = lerp(capeX, -0.15, wl);
  }
  if (W.sick > 0.001) { tp = lerp(tp, 0.25, W.sick); hp = lerp(hp, 0.45, W.sick); }

  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr);
  I.head.rotation.set(hp - tp * 0.5, hy, 0);
  I.cape.rotation.set(capeX, 0.06 * sin(t * 3 + I.seed), 0);
  I.arms[0].rotation.set(arm0, 0, 0.18 + 0.3 * W.play);
  I.arms[1].rotation.set(arm1, arm1y, arm1z);
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
  I.tails[0].rotation.set(lerp(0.55, 0.1, W.sleep) + 0.08 * sin(t * 2.4), 0.32 * sin(t * 2.1 + I.seed), 0);
  I.tails[1].rotation.set(lerp(0.55, 0.15, W.sleep) + 0.1 * sin(t * 2.6), 0.25 * sin(t * 2.5 + 1), 0);
  I.tails[2].rotation.set(lerp(0.45, 0.2, W.sleep), 0.22 * sin(t * 2.5 + 2), 0);
}

// ================================================================ PEACOCK
OTHERS.peacock = function (opts) {
  var baby = !!opts.baby, sex = baby ? 'f' : (opts.sex || 'm'), male = sex !== 'f';
  var key = 'peacock_' + (male ? 'm' : 'f'), P = partsCache[key];
  var RB = 0x1652a8, TL = 0x1b7a8c, EM1 = 0x1b8a5a, EM2 = 0x22a670, GD = 0xf2c230, OC_DK = 0x0e182e;
  var WG = 0x3b6a48, BEAK = 0x453c34, LEG = 0x8e7c64, WH = 0xf0ece2;
  var FM = 0x7c6e5c, FM_LT = 0xd2c8b6, FM_GR = 0x526b54;
  if (!P) {
    P = partsCache[key] = {};
    var g = B();
    var bodyCol = male ? function (zc, ca, sa, x, y, z) { return ca > 0.25 ? TL : RB; } : function (zc, ca, sa, x, y, z) { return ca < -0.35 ? FM_LT : FM; };
    g.loft([
      [0.34, 0.06, 0.075, 0.085, 0],
      [0.20, 0.03, 0.145, 0.152, 0],
      [0.02, 0.0, 0.175, 0.168, 0],
      [-0.14, -0.01, 0.145, 0.135, 0],
      [-0.29, 0.01, 0.075, 0.07, 0]
    ], { seg: 10, steps: 2 }, bodyCol);
    P.body = g.build();

    // lower neck
    g = B();
    g.limb(0, 0, -0.02, 0, 0, 0.22, 0.072, 0.052, male ? RB : FM_GR, { seg: 7 });
    g.sph(0.074, 0.074, 0.074, 0, 0, 0, male ? RB : FM_GR, { s: [6, 4] });
    P.neckA = g.build();

    // upper neck + head + golden crown crest
    var L = 0.20;
    g = B();
    g.limb(0, 0, -0.02, 0, 0, L, 0.052, 0.042, male ? TL : FM_GR, { seg: 7 });
    g.sph(0.056, 0.052, 0.068, 0, 0.01, L + 0.025, male ? RB : FM, { s: [8, 6] });
    // white facial cheek patches
    g.sph(0.022, 0.018, 0.028, 0.038, 0.015, L + 0.04, WH, { s: [5, 4] });
    g.sph(0.022, 0.018, 0.028, -0.038, 0.015, L + 0.04, WH, { s: [5, 4] });
    // pointed beak
    g.cone(0.023, 0.085, 0, -0.005, L + 0.105, BEAK, { seg: 5, rot: [PI / 2 + 0.1, 0, 0] });
    // tiny golden head crest
    var crCol = male ? GD : 0x9c8e78, crCh = male ? 0.11 : 0.075;
    for (var ci = -1; ci <= 1; ci++) {
      var cx = ci * 0.024, cy = 0.06 + crCh;
      g.limb(cx * 0.4, 0.055, L + 0.01, cx, cy, L - 0.01, 0.005, 0.004, male ? TL : FM, { seg: 4 });
      g.sph(0.014, 0.018, 0.01, cx, cy + 0.008, L - 0.01, crCol, { s: [5, 4] });
    }
    eyePair(g, 0.043, 0.022, L + 0.046, 0.013, 0x111111);
    P.neckB = g.build();

    // slender bird legs
    g = B();
    g.sph(0.045, 0.055, 0.045, 0, -0.02, 0, male ? RB : FM, { s: [6, 4] });
    g.limb(0, 0, 0, 0, -0.22, 0, 0.03, 0.019, LEG, { seg: 5 });
    g.sph(0.022, 0.022, 0.022, 0, -0.22, 0, LEG, { s: [5, 4] });
    P.legU = g.build();

    g = B();
    g.limb(0, 0, 0, 0, -0.24, 0, 0.019, 0.014, LEG, { seg: 5 });
    for (var ti = -1; ti <= 1; ti++) g.limb(0, -0.235, 0, ti * 0.036, -0.24, 0.09, 0.01, 0.006, LEG, { seg: 4 });
    g.limb(0, -0.235, 0, 0, -0.24, -0.045, 0.01, 0.006, LEG, { seg: 4 });
    P.legL = g.build();

    // sculpted layered wings
    var mkWing = function (r) {
      var wg = B(), s = r ? -1 : 1, wc = male ? WG : shade(FM, 0.85);
      wg.extrude([[0.12, 0.05], [0.02, 0.095], [-0.14, 0.065], [-0.28, 0.005], [-0.24, -0.055], [-0.08, -0.095], [0.08, -0.065]], 0.038, s * 0.022, -0.02, -0.04, [0.08, 0, s * 0.14], function (x, y, z) { return z < -0.14 ? shade(wc, 0.86) : wc; }, { axis: 'x', bevel: 0.012, curveX: s * 0.022 });
      return wg.build();
    };
    P.wingL = mkWing(false); P.wingR = mkWing(true);

    // articulated tail fan (sculpted emerald-green feather blades & gold/royal-blue eyespots on males)
    g = B();
    if (male) {
      var addPlume = function (ang, len, zOff, cMain, rEye) {
        var tx = sin(ang) * len, ty = cos(ang) * len;
        // sculpted tapered feather vane along plume axis
        var wBase = rEye * 0.42, wMid = rEye * 1.15, wTip = rEye * 1.38;
        g.extrude([
          [-wBase, 0.04], [wBase, 0.04], [wMid, len * 0.62], [wTip, len * 0.92],
          [wTip * 0.62, len * 1.07], [0, len * 1.11], [-wTip * 0.62, len * 1.07],
          [-wTip, len * 0.92], [-wMid, len * 0.62]
        ], 0.012, 0, 0, zOff - 0.016, [0, 0, -ang], function (x, y) {
          var d = Math.hypot(x - tx, y - ty);
          if (d < rEye * 0.34) return OC_DK;
          if (d < rEye * 0.66) return RB;
          if (d < rEye * 1.04) return GD;
          return cMain;
        }, { bevel: 0.003, curveY: -0.024 });
        // raised central eyespot relief so the ocellus glints in 3D
        g.sph(rEye * 0.62, rEye * 0.72, 0.018, tx, ty, zOff - 0.012, RB, { s: [5, 4], rot: [0, 0, -ang] });
        g.sph(rEye * 0.32, rEye * 0.36, 0.022, tx, ty, zOff - 0.009, OC_DK, { s: [4, 3], rot: [0, 0, -ang] });
      };
      for (var k = 0; k < 9; k++) {
        var u = (k / 8) * 2 - 1;
        addPlume(u * 1.24, 0.96 - abs(u) * 0.14, 0.0, k % 2 ? EM2 : EM1, 0.072);
      }
      for (var m = 0; m < 7; m++) {
        var v = (m / 6) * 2 - 1;
        addPlume(v * 0.96, 0.65 - abs(v) * 0.08, 0.036, m % 2 ? EM1 : EM2, 0.056);
      }
    } else {
      for (var f = 0; f < 5; f++) {
        var fu = (f / 4) * 2 - 1;
        g.extrude([[-0.018, 0.02], [0.018, 0.02], [0.042, 0.34], [0, 0.41], [-0.042, 0.34]], 0.012, 0, 0, -0.015 + abs(fu) * 0.01, [0, 0, -fu * 0.6], f % 2 ? FM : FM_GR, { bevel: 0.003 });
      }
    }
    P.fan = g.build();
  }

  var sc = baby ? 0.48 : (male ? 1.0 : 0.90);
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.56, 0);
  var bodyM = mesh(P.body); tor.add(bodyM);

  var na = grp('nA'), nb = grp('nB'); na.rotation.order = 'YXZ'; nb.rotation.order = 'YXZ';
  tor.add(na); na.position.set(0, 0.08, 0.21); na.add(mesh(P.neckA));
  na.add(nb); nb.position.set(0, 0, 0.22); var neckBM = mesh(P.neckB); nb.add(neckBM);
  if (baby) neckBM.scale.setScalar(1.35);

  var hips = [], knees = [], wings = [];
  for (var l = 0; l < 2; l++) {
    var sd = l ? -1 : 1;
    var hip = grp('hip'); hip.position.set(sd * 0.075, -0.10, 0.0); tor.add(hip); hip.add(mesh(P.legU));
    var kn = grp('knee'); kn.position.set(0, -0.22, 0); hip.add(kn); kn.add(mesh(P.legL));
    hips.push(hip); knees.push(kn);
    var wp = grp('wing'); wp.position.set(sd * 0.165, 0.04, 0.02); tor.add(wp); wp.add(mesh(l ? P.wingR : P.wingL));
    wings.push(wp);
  }

  var fanP = grp('fan'); fanP.rotation.order = 'XYZ';
  fanP.position.set(0, 0.04, -0.21);
  tor.add(fanP); fanP.add(mesh(P.fan));

  var I = newInst({ rig: rig, tor: tor, bodyM: bodyM, na: na, nb: nb, hips: hips, knees: knees, wings: wings, fanP: fanP, male: male, sc: sc, Lm: 0.46, flutT: 3 + Math.random() * 5, flutter: 0 });
  var out = { group: root, height: (male ? 1.28 : 1.05) * sc, update: function (dt, ent) { peacockUpdate(I, dt, ent); } };
  peacockUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function peacockUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (4 * I.Lm * I.sc * 0.55 * (1 + 0.15 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 2.1 + I.seed);
  I.flutT -= dt; if (I.flutT <= 0) { I.flutT = 4 + Math.random() * 6; I.flutter = 1; }
  I.flutter = Math.max(0, I.flutter - dt * 0.85);

  var amp = lerp(0.45, 0.72, rw) * gw * (1 - 0.4 * W.sick), bend = 0.9 * (1 + 0.3 * rw);
  var a0 = amp * sin(ph), a1 = amp * sin(ph + PI);
  var b0 = bend * gw * max(0, -cos(ph)), b1 = bend * gw * max(0, -cos(ph + PI));
  var stand = max(cos(a0) * 0.22 + cos(a0 + b0) * 0.24, cos(a1) * 0.22 + cos(a1 + b1) * 0.24);
  var ty = (stand - 0.46) + rw * abs(sin(ph)) * 0.04;
  var tp = 0.04 * gw * sin(ph * 2) + 0.08 * rw;
  var tr = 0.025 * gw * sin(ph);
  var na = 1.05 + I.lookP * 0.5 + 0.04 * br + 0.05 * gw * sin(ph * 2);
  var nb = 0.55 + 0.05 * br + 0.14 * sin(ph * 2 - 0.5) * gw;
  var hy = I.lookY;
  var wing = 0.10 + 0.02 * br + I.flutter * 0.22 * (0.5 + 0.5 * sin(t * 14)) + rw * 0.4;
  var spin = 0;

  // Tail fan articulation: males fan dramatically higher & wider during play and walk!
  var display = I.male ? clamp(W.play + W.gait * 0.78 + I.flutter * 0.45, 0, 1) : clamp(W.play * 0.5 + W.gait * 0.3, 0, 1);
  display *= (1 - W.sleep) * (1 - W.sick) * (1 - W.eat * 0.7);
  var fanX = lerp(-1.30, I.male ? -0.10 : -0.65, display) + 0.03 * br;
  var fanScaleX = lerp(I.male ? 0.42 : 0.65, I.male ? 1.05 + 0.04 * sin(t * 9) : 0.95, display);
  var fanScaleY = lerp(I.male ? 0.85 : 0.8, 1.0, display);

  if (W.eat > 0.001) {
    var we = W.eat, nod = sin(t * 4.5 + I.seed) * 0.12;
    na = lerp(na, 0.20, we); nb = lerp(nb, -1.15 + nod, we); tp = lerp(tp, 0.22, we); hy = lerp(hy, 0, we);
  }
  if (W.play > 0.001) {
    var wp = W.play, hop = abs(sin(t * 5.5 + I.seed));
    ty += wp * hop * 0.14;
    wing = lerp(wing, 0.45 + 0.35 * sin(t * 12), wp);
    spin = wp * sin(t * 1.4 + I.seed) * 0.85;
    fanX = lerp(fanX, I.male ? -0.04 + 0.06 * sin(t * 7) : -0.45, wp);
  }
  if (W.swim > 0.001) {
    var wsw = W.swim;
    ty = lerp(ty, -0.18 + 0.02 * sin(t * 2), wsw);
    a0 = lerp(a0, 0.4 * sin(t * 3), wsw); a1 = lerp(a1, -0.4 * sin(t * 3), wsw);
    fanX = lerp(fanX, -1.05, wsw);
  }
  if (W.sleep > 0.001) {
    var wl = W.sleep;
    ty = lerp(ty, -0.34, wl); a0 = a1 = lerp(a0, -1.35, wl); b0 = b1 = lerp(b0, 2.5, wl);
    na = lerp(na, 0.45, wl); nb = lerp(nb, -0.45, wl); hy = lerp(hy, 0.9, wl);
    wing = lerp(wing, 0.04, wl); fanX = lerp(fanX, -1.38, wl);
  }
  if (W.sick > 0.001) {
    var ws = W.sick;
    na = lerp(na, 0.5, ws); nb = lerp(nb, -0.4, ws); ty -= 0.04 * ws; wing = lerp(wing, -0.1, ws);
    fanX = lerp(fanX, -1.40, ws);
  }

  I.tor.position.y = 0.56 + ty; I.tor.rotation.set(tp, 0, tr); I.rig.rotation.y = spin;
  I.bodyM.scale.set(1 + 0.006 * br, 1 + 0.012 * br, 1);
  I.na.rotation.set(-na - tp, hy * 0.4, 0);
  I.nb.rotation.set(-nb + na, hy * 0.6, 0);
  I.hips[0].rotation.x = a0 - tp; I.hips[1].rotation.x = a1 - tp;
  I.knees[0].rotation.x = b0; I.knees[1].rotation.x = b1;
  I.wings[0].rotation.z = wing; I.wings[1].rotation.z = -wing;
  I.fanP.rotation.set(fanX, 0.04 * sin(t * 2.2 + I.seed) * (1 - W.sleep), 0);
  I.fanP.scale.set(fanScaleX, fanScaleY, 1);
}

// ================================================================ KOALA
OTHERS.koala = function (opts) {
  var baby = !!opts.baby, P = partsCache.koala;
  var GR = 0x8d9196, GR_DK = 0x72767c, WH = 0xededeb, NOSE = 0x1c1c20, CLAW = 0x2e2c32;
  if (!P) {
    P = partsCache.koala = {};
    var g = B();
    var bc = function (x, y, z) { return (z > 0.02 && abs(x) < 0.15) ? WH : GR; };
    g.loft([
      [0.24, 0, 0.11, 0.10, 0.01],
      [0.12, 0, 0.195, 0.175, 0.01],
      [-0.03, 0, 0.215, 0.195, 0.0],
      [-0.17, 0, 0.19, 0.175, -0.01],
      [-0.28, 0, 0.115, 0.105, -0.015]
    ], { axis: 'y', seg: 10, steps: 2 }, function (zc, ca, sa, x, y, z) { return bc(x, y, z); });
    P.body = g.build();

    // round koala head, big fluffy round ears with white tufts, prominent oval black nose
    g = B();
    g.sph(0.175, 0.16, 0.155, 0, 0.10, 0.02, function (x, y, z) { return (z > 0.06 && y < 0.07 && abs(x) < 0.09) ? WH : GR; }, { s: [9, 7] });
    // prominent oval black nose
    g.sph(0.042, 0.058, 0.036, 0, 0.088, 0.165, NOSE, { s: [7, 5] });
    eyePair(g, 0.074, 0.125, 0.144, 0.020, 0x141214);
    // big fluffy round ears + white inner tufts
    earBall(g, 0.17, 0.17, 0.0, 0.095, GR, WH);
    earBall(g, -0.17, 0.17, 0.0, 0.095, GR, WH);
    g.sph(0.065, 0.068, 0.032, 0.17, 0.16, 0.024, 0xf7f7f5, { s: [6, 5], rot: [0, -0.45, 0] });
    g.sph(0.065, 0.068, 0.032, -0.17, 0.16, 0.024, 0xf7f7f5, { s: [6, 5], rot: [0, 0.45, 0] });
    P.head = g.build();

    // stubby 2-segment arms with curved grasping claws
    g = B();
    g.limb(0, 0, 0, 0, -0.115, 0.015, 0.068, 0.056, GR, { seg: 6 });
    g.sph(0.056, 0.056, 0.056, 0, -0.115, 0.015, GR, { s: [5, 4] });
    P.armU = g.build();
    g = B();
    g.limb(0, 0, 0, 0, -0.11, 0.018, 0.056, 0.048, GR, { seg: 6 });
    g.sph(0.052, 0.05, 0.055, 0, -0.12, 0.026, GR_DK, { s: [5, 4] });
    g.sph(0.022, 0.018, 0.032, 0, -0.138, 0.066, CLAW, { s: [4, 3] });
    P.armL = g.build();

    // stubby legs
    g = B();
    g.sph(0.085, 0.09, 0.085, 0, -0.04, 0, GR, { s: [6, 5] });
    g.limb(0, 0, 0, 0, -0.15, 0, 0.078, 0.055, GR, { seg: 6 });
    P.thigh = g.build();

    g = B();
    g.limb(0, 0, 0, 0, -0.14, 0, 0.055, 0.045, GR, { seg: 6 });
    g.sph(0.052, 0.03, 0.085, 0, -0.15, 0.035, GR_DK, { s: [5, 4] });
    P.shank = g.build();
  }

  var sc = baby ? 0.54 : 1.0;
  var root = grp('animal'), rig = grp('rig'), tor = grp('torso');
  root.add(rig); rig.add(tor); rig.scale.setScalar(sc);
  tor.position.set(0, 0.40, 0);
  tor.add(mesh(P.body));

  var head = grp('head'); head.rotation.order = 'YXZ'; tor.add(head); head.position.set(0, 0.22, 0.03); head.add(mesh(P.head));
  if (baby) head.scale.setScalar(1.36);

  var arms = [], elbows = [], hips = [], knees = [];
  for (var s = 0; s < 2; s++) {
    var sd = s ? -1 : 1;
    var ar = grp('arm'); ar.position.set(sd * 0.20, 0.14, 0.03); tor.add(ar); ar.add(mesh(P.armU)); arms.push(ar);
    var el = grp('elbow'); el.position.set(0, -0.115, 0.015); ar.add(el); el.add(mesh(P.armL)); elbows.push(el);
    var hp = grp('hip'); hp.position.set(sd * 0.13, -0.16, 0.02); tor.add(hp); hp.add(mesh(P.thigh)); hips.push(hp);
    var kn = grp('knee'); kn.position.set(0, -0.15, 0); hp.add(kn); kn.add(mesh(P.shank)); knees.push(kn);
  }

  var I = newInst({ rig: rig, tor: tor, head: head, arms: arms, elbows: elbows, hips: hips, knees: knees, sc: sc });
  var out = { group: root, height: 0.78 * sc, update: function (dt, ent) { koalaUpdate(I, dt, ent); } };
  koalaUpdate(I, 0.0001, { state: 'idle', speed: 0 });
  return out;
};
function koalaUpdate(I, dt, ent) {
  if (dt > 0.1) dt = 0.1;
  var W = stepW(I, dt, ent), t = (I.t += dt), gw = W.gait, rw = W.run, spd = I.spd;
  if (I.moving && gw > 0.02 && dt > 0.001) I.phase += spd * dt / (0.48 * I.sc * (1 + 0.25 * rw)) * TAU;
  var ph = I.phase, br = sin(t * 1.7 + I.seed), s = sin(ph), c = cos(ph);

  // cozy upright idle vs cute quadrupedal-leaning amble
  var ty = lerp(0.32, 0.36 - 0.025 * abs(s), gw) + 0.010 * br;
  var tp = lerp(0.08, 0.92 + 0.15 * rw, gw);
  var tr = lerp(0.03 * sin(t * 0.9 + I.seed), 0.07 * s, gw);
  var amp = lerp(0.45, 0.72, rw) * gw;
  var arm0 = lerp(-0.35 + 0.04 * br, -0.85 - amp * s, gw);
  var arm1 = lerp(-0.35 + 0.04 * br, -0.85 + amp * s, gw);
  var leg0 = lerp(-1.10, -0.35 + amp * s, gw);
  var leg1 = lerp(-1.10, -0.35 - amp * s, gw);
  var kn0 = lerp(1.15, 0.35 + 0.45 * max(0, -c), gw);
  var kn1 = lerp(1.15, 0.35 + 0.45 * max(0, c), gw);
  var hp = I.lookP * 0.65, hy = I.lookY * 0.75;
  var spin = 0;

  if (W.eat > 0.001) {
    var we = W.eat;
    ty = lerp(ty, 0.30, we); tp = lerp(tp, 0.15, we);
    leg0 = leg1 = lerp(leg0, -1.20, we); kn0 = kn1 = lerp(kn0, 1.35, we);
    arm0 = lerp(arm0, -1.15 + 0.22 * sin(t * 4.5), we);
    arm1 = lerp(arm1, -0.65, we);
    hp = lerp(hp, 0.22 + 0.08 * sin(t * 4.5), we);
    hy = lerp(hy, 0, we);
  }
  if (W.play > 0.001) {
    var wp = W.play, hop = abs(sin(t * 5.8 + I.seed));
    ty += wp * hop * 0.14;
    tp = lerp(tp, -0.04, wp);
    arm0 = lerp(arm0, -1.3 + 0.35 * sin(t * 8), wp);
    arm1 = lerp(arm1, -1.3 - 0.35 * sin(t * 8), wp);
    tr = lerp(tr, 0.14 * sin(t * 5.8), wp);
    spin = wp * sin(t * 1.5 + I.seed) * 0.7;
  }
  if (W.swim > 0.001) {
    var wsw = W.swim;
    ty = lerp(ty, 0.22 + 0.02 * sin(t * 2.2), wsw);
    tp = lerp(tp, 0.65, wsw);
    arm0 = lerp(arm0, -0.9 + 0.55 * sin(t * 5.5), wsw);
    arm1 = lerp(arm1, -0.9 - 0.55 * sin(t * 5.5), wsw);
    leg0 = lerp(leg0, 0.3 * sin(t * 5.5), wsw);
    leg1 = lerp(leg1, -0.3 * sin(t * 5.5), wsw);
  }
  if (W.sleep > 0.001) {
    // cozy curled snooze ball
    var wl = W.sleep;
    ty = lerp(ty, 0.24, wl); tp = lerp(tp, 0.55, wl); tr = lerp(tr, 0.18, wl);
    leg0 = leg1 = lerp(leg0, -1.30, wl); kn0 = kn1 = lerp(kn0, 1.55, wl);
    arm0 = arm1 = lerp(arm0, -0.80, wl);
    hp = lerp(hp, 0.62, wl); hy = lerp(hy, 0.25, wl);
  }
  if (W.sick > 0.001) {
    tp = lerp(tp, 0.42, W.sick); hp = lerp(hp, 0.55, W.sick);
  }

  I.tor.position.y = ty; I.tor.rotation.set(tp, 0, tr); I.rig.rotation.y = spin;
  I.head.rotation.set(hp - tp * 0.55, hy, 0);
  I.arms[0].rotation.set(arm0, 0, 0.18 + 0.25 * W.play);
  I.arms[1].rotation.set(arm1, 0, -0.18 - 0.25 * W.play);
  if (I.elbows) { I.elbows[0].rotation.x = -0.25 - 0.35 * W.eat - 0.25 * gw * max(0, s); I.elbows[1].rotation.x = -0.25 - 0.25 * gw * max(0, -s); }
  I.hips[0].rotation.x = leg0; I.hips[1].rotation.x = leg1;
  I.knees[0].rotation.x = kn0; I.knees[1].rotation.x = kn1;
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
  else if (st === 10) { /* hard hat */ g.sph(r * 1.1, r * 0.85, r * 1.12, 0, hy + 0.05, -0.01, k.hat, { s: [9, 6] }); g.cyl(r * 1.35, r * 1.35, 0.02, 0, hy + 0.045, 0, shade(k.hat, 0.9), { seg: 12 }); g.box(0.05, 0.03, 0.3, 0, hy + 0.17, 0, shade(k.hat, 0.8)); }
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
  security: { shirt: 0x2a3042, trouser: 0x1b1f2b, style: 8, hat: 0x2a3042, prop: null, vest: true, shortSl: false },
  mechanic: { shirt: 0xe07828, trouser: 0x24344d, style: 5, hat: 0xf2b824, prop: 'case', vest: true, shortSl: true }
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

SC.oak = { build: function (g) {
  var br = 0x6b4a2b; g.limb(0, 0, 0, 0, 1.7, 0, 0.3, 0.2, br, { seg: 7 }); g.limb(0, 1.2, 0, 0.55, 2.3, 0.15, 0.12, 0.07, br); g.limb(0, 1.3, 0, -0.5, 2.4, -0.1, 0.12, 0.07, br);
  for (var i = 0; i < 3; i++) { var a = i * 2.1; g.limb(Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15, Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5, 0.1, 0.05, br); }
  var L = leaf(0x4f9a3a); g.sph(1.5, 1.2, 1.5, 0, 3.1, 0, L, { s: [8, 6] }); g.sph(1.1, 0.95, 1.1, 0.95, 2.7, 0.3, L, { s: [7, 5] }); g.sph(1.1, 0.95, 1.1, -0.95, 2.8, -0.2, L, { s: [7, 5] });
  g.sph(1.0, 0.9, 1.0, 0.2, 3.7, -0.5, leaf(0x5aa842), { s: [7, 5] }); g.sph(1.0, 0.85, 1.0, -0.3, 2.7, 0.95, L, { s: [7, 5] }); g.sph(0.8, 0.7, 0.8, 0.5, 3.8, 0.6, leaf(0x62b04a), { s: [6, 5] });
} };
SC.pine = { build: function (g) {
  g.limb(0, 0, 0, 0, 1.8, 0, 0.24, 0.14, 0x5a3e24, { seg: 6 });
  for (var r = 0; r < 4; r++) { var ra = r * 1.57 + 0.3; g.limb(Math.sin(ra) * 0.14, 0.22, Math.cos(ra) * 0.14, Math.sin(ra) * 0.42, 0, Math.cos(ra) * 0.42, 0.09, 0.04, 0x4d341e, { seg: 4 }); }
  var L = [[1.55, 1.5, 1.2], [1.32, 1.45, 2.05], [1.05, 1.4, 2.9], [0.76, 1.25, 3.7], [0.46, 1.1, 4.45]];
  for (var i = 0; i < L.length; i++) {
    var rad = L[i][0], h = L[i][1], y0 = L[i][2];
    g.lathe([[rad * 0.18, y0 + 0.05], [rad, y0], [rad * 0.78, y0 + h * 0.38], [rad * 0.42, y0 + h * 0.72], [0.02, y0 + h]], leaf(shade(0x2f7040, 1 + i * 0.05), 0.3), { seg: 10, ridgeN: 7, ridgeA: 0.12, cap0: true, cap1: false });
  }
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
  g.limb(0, 0, 0, 0, 1.8, 0, 0.24, 0.14, 0x5a4a3a, { seg: 6 });
  var L = [[1.55, 1.5, 1.2], [1.32, 1.45, 2.05], [1.05, 1.4, 2.9], [0.76, 1.25, 3.7], [0.46, 1.1, 4.45]];
  var snCol = function (px, py, pz) { return hash3(Math.floor(px * 3), 1, Math.floor(pz * 3)) > 0.12 ? 0xf2f7fb : 0xdde8f0; };
  for (var i = 0; i < L.length; i++) {
    var rad = L[i][0], h = L[i][1], y0 = L[i][2];
    g.lathe([[rad * 0.18, y0 + 0.05], [rad, y0], [rad * 0.78, y0 + h * 0.38], [rad * 0.42, y0 + h * 0.72], [0.02, y0 + h]], leaf(0x2a6040, 0.25), { seg: 10, ridgeN: 7, ridgeA: 0.12, cap0: true, cap1: false });
    g.lathe([[rad * 0.72, y0 + h * 0.36], [rad * 0.48, y0 + h * 0.68], [0.02, y0 + h * 1.03]], snCol, { seg: 10, ridgeN: 7, ridgeA: 0.10, cap0: false, cap1: false });
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
  g.bevelBox(1.76, 0.20, 0.14, 0.03, 0, 0.10, 0.80, 0x9a8a78); g.bevelBox(1.76, 0.20, 0.14, 0.03, 0, 0.10, -0.80, 0x9a8a78);
  g.bevelBox(0.14, 0.20, 1.52, 0.03, 0.80, 0.10, 0, 0x9a8a78); g.bevelBox(0.14, 0.20, 1.52, 0.03, -0.80, 0.10, 0, 0x9a8a78);
  g.sph(0.76, 0.14, 0.76, 0, 0.10, 0, 0x5a3e28, { s: [8, 4] });
  var r = mkrng(5), cs = [0xf05a8a, 0xf4d040, 0xff8a3a, 0xffffff, 0xa060e0, 0xe84a4a];
  for (var i = 0; i < 16; i++) {
    var x = (r() - 0.5) * 1.24, z = (r() - 0.5) * 1.24, h = 0.24 + r() * 0.20;
    g.limb(x, 0.16, z, x, 0.16 + h, z, 0.02, 0.016, 0x3f8a3a, { seg: 3 });
    g.lathe([[0.02, 0.16 + h], [0.11, 0.21 + h], [0.09, 0.24 + h], [0.02, 0.20 + h]], cs[i % 6], { seg: 6, ridgeN: 5, ridgeA: 0.22, tx: x, tz: z });
    g.sph(0.035, 0.025, 0.035, x, 0.21 + h, z, 0xf8d840, { s: [4, 3] });
    g.sph(0.13, 0.04, 0.13, x + 0.05, 0.21, z, 0x4a9a40, { s: [4, 3] });
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
  g.bevelBox(2.3, 0.10, 1.9, 0.03, 0, 0.05, 0, F);
  var posts = [[-1.02, -0.82], [1.02, -0.82], [-1.02, 0.82], [1.02, 0.82]];
  for (var i = 0; i < 4; i++) g.limb(posts[i][0], 0.04, posts[i][1], posts[i][0], 1.72, posts[i][1], 0.085, 0.075, P, { seg: 6 });
  for (var k = 0; k < 5; k++) {
    var ly = 0.24 + k * 0.30;
    g.cyl(0.08, 0.08, 2.15, 0, ly, -0.88, k % 2 ? R : shade(R, 0.92), { seg: 6, rot: [0, 0, PI / 2] });
    g.cyl(0.075, 0.075, 1.7, -1.04, ly, 0, k % 2 ? R : shade(R, 0.92), { seg: 6, rot: [PI / 2, 0, 0] });
    g.cyl(0.075, 0.075, 1.7, 1.04, ly, 0, k % 2 ? R : shade(R, 0.92), { seg: 6, rot: [PI / 2, 0, 0] });
  }
  g.limb(-1.02, 1.32, 0.82, -0.62, 1.72, 0.82, 0.045, 0.045, P, { seg: 4 });
  g.limb(1.02, 1.32, 0.82, 0.62, 1.72, 0.82, 0.045, 0.045, P, { seg: 4 });
  g.cyl(0.07, 0.07, 2.45, 0, 2.38, 0, 0x5c3e22, { seg: 6, rot: [0, 0, PI / 2] });
  g.bevelBox(2.58, 0.12, 1.32, 0.03, 0, 2.02, -0.54, 0x6a4a2a, { rot: [-0.52, 0, 0] });
  g.bevelBox(2.58, 0.12, 1.32, 0.03, 0, 2.02, 0.54, 0x5c4024, { rot: [0.52, 0, 0] });
  g.bevelBox(2.54, 0.06, 1.26, 0.02, 0, 2.10, -0.54, 0x4f8a3e, { rot: [-0.52, 0, 0] });
  g.bevelBox(2.54, 0.06, 1.26, 0.02, 0, 2.10, 0.54, 0x5a9646, { rot: [0.52, 0, 0] });
  g.sph(0.55, 0.20, 0.34, 0, 0.16, -0.35, 0xe0c878, { s: [7, 4] });
  g.sph(0.32, 0.15, 0.26, 0.42, 0.14, -0.42, 0xd4ba68, { s: [6, 4] });
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
SC.vine_perch = { build: function (g) {
  var P = 0x8f6b3a, B2 = 0xa88a4c, RNG = 0x6b5228, R = 0xc8b078, VN = 0x2f6e30, LF = leaf(0x3d943c, 0.34), i;
  // bamboo/wooden cross-frame A-posts on left and right
  for (var s = -1; s <= 1; s += 2) {
    var x = s * 0.95;
    g.limb(x, 0, -0.78, x, 2.62, 0.14, 0.085, 0.07, P, { seg: 6 });
    g.limb(x, 0, 0.78, x, 2.62, -0.14, 0.085, 0.07, B2, { seg: 6 });
    for (i = 1; i <= 3; i++) {
      var yy = i * 0.72;
      g.cyl(0.092, 0.092, 0.05, x, yy, lerp(-0.78, 0.14, yy / 2.62), RNG, { seg: 6 });
      g.cyl(0.092, 0.092, 0.05, x, yy, lerp(0.78, -0.14, yy / 2.62), RNG, { seg: 6 });
    }
    g.limb(x, 0.95, -0.5, x, 0.95, 0.5, 0.055, 0.055, P, { seg: 5 });
  }
  // top ridge beam, mid perch bar, and diagonal bamboo climbing rail
  g.limb(-1.18, 2.45, 0, 1.18, 2.45, 0, 0.08, 0.08, B2, { seg: 6 });
  g.limb(-0.98, 1.48, -0.24, 0.98, 1.48, -0.24, 0.06, 0.06, P, { seg: 6 });
  g.limb(-0.92, 0.45, 0.65, 0.85, 1.55, -0.2, 0.055, 0.055, B2, { seg: 5 });
  // slung rope perch catenary between posts + hanging knotted climbing rope
  var nRope = 8;
  for (i = 0; i < nRope; i++) {
    var t0 = i / nRope, t1 = (i + 1) / nRope;
    var x0 = lerp(-0.92, 0.92, t0), x1 = lerp(-0.92, 0.92, t1);
    var y0 = 1.28 - 0.34 * sin(PI * t0), y1 = 1.28 - 0.34 * sin(PI * t1);
    g.limb(x0, y0, 0.42, x1, y1, 0.42, 0.032, 0.032, R, { seg: 4 });
  }
  g.limb(0.15, 2.45, 0.02, 0.15, 0.72, 0.08, 0.028, 0.026, R, { seg: 4 });
  g.sph(0.07, 0.07, 0.07, 0.15, 0.70, 0.08, 0xb89c60, { s: [5, 4] });
  // lush green vines twining & draping across top beam and hanging down
  var vines = [[-0.65, 2.45, 0.06, 1.55], [-0.28, 2.46, -0.08, 1.85], [0.42, 2.45, 0.09, 1.65], [0.76, 2.44, -0.06, 1.4], [-0.95, 2.42, 0.12, 1.75], [0.95, 2.42, -0.10, 1.6]];
  for (i = 0; i < vines.length; i++) {
    var v = vines[i], vx = v[0], vy = v[1], vz = v[2], vlen = v[3];
    for (var k = 0; k < 4; k++) {
      var a0 = k / 4, a1 = (k + 1) / 4;
      var sx0 = vx + sin(k * 1.4 + i) * 0.06, sy0 = vy - a0 * vlen, sz0 = vz + cos(k * 1.4 + i) * 0.06;
      var sx1 = vx + sin((k + 1) * 1.4 + i) * 0.06, sy1 = vy - a1 * vlen, sz1 = vz + cos((k + 1) * 1.4 + i) * 0.06;
      g.limb(sx0, sy0, sz0, sx1, sy1, sz1, 0.024, 0.018, VN, { seg: 4 });
      g.sph(0.11, 0.08, 0.07, sx1, sy1 + 0.08, sz1, LF, { s: [5, 4], rot: [0.3, k + i, 0.2] });
    }
  }
  g.sph(0.45, 0.24, 0.34, -0.6, 2.58, 0.02, LF, { s: [6, 4] });
  g.sph(0.42, 0.22, 0.32, 0.55, 2.56, -0.02, LF, { s: [6, 4] });
  g.sph(0.36, 0.2, 0.28, 0.0, 2.58, 0.0, leaf(0x4ca846, 0.3), { s: [6, 4] });
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

SC.enchanted_tree = { build: function (g) {
  var TR = function (x, y, z, nx, ny) { return ny > 0.4 ? 0xeaf0f8 : (hash3(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4)) > 0.5 ? 0xd8e0ec : 0xbec8d8); };
  // twisted silver-white trunk & roots
  g.limb(0, 0, 0, 0.14, 1.0, 0.06, 0.34, 0.24, TR, { seg: 7 });
  g.limb(0.14, 1.0, 0.06, -0.1, 2.0, -0.06, 0.24, 0.17, TR, { seg: 7 });
  g.limb(-0.1, 2.0, -0.06, 0.04, 2.8, 0.04, 0.17, 0.12, TR, { seg: 6 });
  for (var r = 0; r < 4; r++) {
    var ra = r / 4 * TAU + 0.3;
    g.limb(Math.sin(ra) * 0.18, 0.18, Math.cos(ra) * 0.18, Math.sin(ra) * 0.62, 0, Math.cos(ra) * 0.62, 0.11, 0.04, TR, { seg: 5 });
  }
  // gnarled branches
  g.limb(-0.08, 1.9, -0.05, 0.95, 2.7, 0.35, 0.12, 0.06, TR, { seg: 5 });
  g.limb(-0.08, 2.0, -0.05, -0.9, 2.8, -0.3, 0.12, 0.06, TR, { seg: 5 });
  g.limb(0.02, 2.3, 0.0, 0.15, 3.1, -0.85, 0.10, 0.05, TR, { seg: 5 });
  g.limb(0.02, 2.2, 0.0, -0.2, 2.9, 0.85, 0.10, 0.05, TR, { seg: 5 });
  // lush layered pastel violet / pink / cyan fairy blossom clusters
  var bls = function (base) { return function (x, y, z, nx, ny) { var h = hash3(Math.floor(x * 3), Math.floor(y * 3), Math.floor(z * 3)); return shade(base, 0.88 + h * 0.24 + (ny > 0.4 ? 0.08 : 0)); }; };
  g.sph(1.35, 0.95, 1.35, 0.05, 3.45, 0.05, bls(0xc494f6), { s: [8, 6] });
  g.sph(1.0, 0.78, 1.0, 1.0, 2.95, 0.38, bls(0xf4a2d8), { s: [7, 5] });
  g.sph(1.0, 0.78, 1.0, -0.95, 3.05, -0.32, bls(0x8be8f5), { s: [7, 5] });
  g.sph(0.95, 0.72, 0.95, 0.15, 3.25, -0.9, bls(0xf2a8dc), { s: [7, 5] });
  g.sph(0.92, 0.72, 0.92, -0.22, 3.0, 0.9, bls(0xb28cf2), { s: [7, 5] });
  g.sph(0.85, 0.68, 0.85, 0.0, 4.15, 0.0, bls(0x9beefa), { s: [7, 5] });
  // hanging fairy blossom tendrils
  var tend = [[0.9, 2.6, 0.5, 0xf6b8e2], [-0.85, 2.7, -0.4, 0x98effa], [0.25, 2.8, -0.9, 0xd0a8fa], [-0.35, 2.6, 0.85, 0xf6b8e2]];
  for (var i = 0; i < tend.length; i++) {
    var td = tend[i];
    g.limb(td[0], td[1], td[2], td[0] * 1.04, td[1] - 0.85, td[2] * 1.04, 0.04, 0.015, td[3], { seg: 4 });
    g.sph(0.07, 0.07, 0.07, td[0] * 1.04, td[1] - 0.85, td[2] * 1.04, td[3], { s: [4, 3] });
  }
} };

SC.glowing_mushroom = { custom: function (grp0) {
  var gs = B(), ST = 0xf4ead6, ST_DK = 0xdccbb0;
  var shrooms = [
    { x: 0.0, z: 0.0, h: 1.35, r: 0.65, col: 0x36f0e4, em: 0x0e6e68, tilt: [0.05, 0, -0.04] },
    { x: 0.55, z: 0.32, h: 0.95, r: 0.46, col: 0xf24cc0, em: 0x6e104e, tilt: [0.12, 0, 0.16] },
    { x: -0.52, z: 0.25, h: 0.82, r: 0.40, col: 0x4ae8f8, em: 0x106878, tilt: [0.1, 0, -0.18] },
    { x: -0.15, z: -0.52, h: 0.66, r: 0.34, col: 0xeb5ad0, em: 0x641458, tilt: [-0.15, 0, -0.08] },
    { x: 0.36, z: -0.42, h: 0.52, r: 0.26, col: 0x4ef5d6, em: 0x126e58, tilt: [-0.14, 0, 0.14] }
  ];
  // mossy base + cream stems
  gs.sph(0.65, 0.14, 0.62, 0, 0.06, 0, 0x3b6a48, { s: [8, 4] });
  for (var i = 0; i < shrooms.length; i++) {
    var m = shrooms[i], tx = m.x + Math.sin(m.tilt[2]) * m.h * 0.4, tz = m.z + Math.sin(m.tilt[0]) * m.h * 0.4;
    gs.limb(m.x, 0.05, m.z, tx, m.h, tz, m.r * 0.28, m.r * 0.19, ST, { seg: 7 });
    gs.cyl(m.r * 0.72, m.r * 0.22, m.h * 0.12, tx, m.h - m.h * 0.04, tz, ST_DK, { seg: 9, rot: m.tilt });
    m.tx = tx; m.tz = tz;
  }
  grp0.add(mesh(gs.build()));
  // glowing caps & spots
  for (i = 0; i < shrooms.length; i++) {
    var s = shrooms[i], gc = B(), gsp = B();
    gc.sph(s.r, s.r * 0.55, s.r, 0, 0, 0, s.col, { s: [10, 6] });
    for (var k = 0; k < 5; k++) {
      var a = k / 5 * TAU + i, rr = s.r * (k === 0 ? 0.18 : 0.62);
      gsp.sph(s.r * 0.14, s.r * 0.08, s.r * 0.14, Math.sin(a) * rr, s.r * (k === 0 ? 0.52 : 0.34), Math.cos(a) * rr, 0xf8fcff, { s: [5, 4] });
    }
    var capGrp = grp('cap'); capGrp.position.set(s.tx, s.h + s.r * 0.12, s.tz); capGrp.rotation.set(s.tilt[0], s.tilt[1], s.tilt[2]);
    capGrp.add(mesh(gc.build(), mat(0xffffff, { emissive: s.em })));
    capGrp.add(mesh(gsp.build(), mat(0xffffff, { emissive: 0x334455 })));
    grp0.add(capGrp);
  }
  return grp0;
} };

SC.crystal_cluster = { custom: function (grp0) {
  var gb = B();
  rock(gb, 0.95, 0.34, 0.88, 0, 0.26, 0, 0x3a3646, 31);
  rock(gb, 0.55, 0.25, 0.5, 0.55, 0.20, 0.35, 0x322e3e, 32, 0.8);
  grp0.add(mesh(gb.build()));
  var spires = [
    { x: 0.0, y: 1.05, z: 0.0, r: 0.24, h: 1.9, rot: [0.06, 0.2, -0.05], col: 0x9c4ef5, em: 0x341068 },
    { x: 0.36, y: 0.78, z: 0.2, r: 0.18, h: 1.4, rot: [0.24, 0.6, -0.28], col: 0xc964f8, em: 0x481668 },
    { x: -0.34, y: 0.74, z: 0.18, r: 0.17, h: 1.3, rot: [0.2, -0.4, 0.32], col: 0x42e8d8, em: 0x0e5858 },
    { x: -0.14, y: 0.68, z: -0.36, r: 0.16, h: 1.2, rot: [-0.28, 0.3, 0.18], col: 0xa65af8, em: 0x381268 },
    { x: 0.28, y: 0.58, z: -0.28, r: 0.14, h: 0.98, rot: [-0.26, -0.2, -0.32], col: 0x52f2e4, em: 0x105c5c },
    { x: 0.05, y: 0.48, z: 0.44, r: 0.12, h: 0.82, rot: [0.38, 0.1, -0.06], col: 0xd678fa, em: 0x4c1868 }
  ];
  for (var i = 0; i < spires.length; i++) {
    var sp = spires[i], gc = B();
    gc.cyl(sp.r * 0.72, sp.r, sp.h * 0.72, 0, -sp.h * 0.14, 0, sp.col, { seg: 6 });
    gc.cone(sp.r * 0.72, sp.h * 0.28, 0, sp.h * 0.36, 0, shade(sp.col, 1.18), { seg: 6 });
    var cm = mesh(gc.build(), mat(0xffffff, { emissive: sp.em }));
    cm.position.set(sp.x, sp.y, sp.z); cm.rotation.set(sp.rot[0], sp.rot[1], sp.rot[2]);
    grp0.add(cm);
  }
  return grp0;
} };

SC.standing_stones = { build: function (g) {
  var stCol = function (px, py, pz, nx, ny) {
    var h = hash3(Math.floor(px * 4), Math.floor(py * 4), Math.floor(pz * 4));
    var base = shade(0x7e807a, 0.85 + h * 0.28);
    if (py < 0.75 || (ny > 0.45 && h > 0.48)) return mixHex(base, 0x4e7044, 0.55);
    return base;
  };
  // mossy turf base mounds
  rock(g, 1.5, 0.18, 1.0, 0, 0.08, 0, 0x526e44, 41);
  // two tall weathered irregular monolith pillars
  g.extrude([[-0.32, 0], [0.30, 0], [0.27, 1.15], [0.23, 2.34], [-0.21, 2.36], [-0.29, 1.28]], 0.48, -0.82, 0.04, 0.0, [0.02, 0.08, 0.03], stCol, { bevel: 0.08, taper: 0.88 });
  g.extrude([[-0.30, 0], [0.31, 0], [0.26, 1.2], [0.22, 2.32], [-0.24, 2.30], [-0.28, 1.05]], 0.50, 0.82, 0.04, 0.02, [-0.02, -0.06, -0.03], stCol, { bevel: 0.08, taper: 0.90 });
  // heavy weathered stone lintel across top
  g.extrude([[-1.24, -0.18], [-0.95, -0.23], [0.98, -0.22], [1.26, -0.14], [1.18, 0.21], [0.1, 0.24], [-1.16, 0.19]], 0.58, 0, 2.46, 0.01, [0.01, 0.02, -0.01], stCol, { bevel: 0.08 });
  // flanking smaller weathered standing stones
  g.extrude([[-0.22, 0], [0.21, 0], [0.16, 0.85], [0.04, 1.38], [-0.14, 1.18]], 0.30, -1.52, 0.02, 0.42, [0.08, 0.4, 0.1], stCol, { bevel: 0.06, taper: 0.82 });
  g.extrude([[-0.20, 0], [0.20, 0], [0.15, 0.78], [-0.03, 1.18], [-0.16, 0.95]], 0.28, 1.48, 0.02, -0.35, [-0.06, -0.3, -0.09], stCol, { bevel: 0.06, taper: 0.84 });
  rock(g, 0.35, 0.25, 0.32, 0.95, 0.18, 0.45, stCol, 42);
} };

SC.rainbow_arch = { build: function (g) {
  var cols = [0xf24444, 0xf88c28, 0xf8dc38, 0x42cc5c, 0x3c8cf8, 0x9b54f2];
  var baseR = 1.85, bw = 0.118;
  for (var b = 0; b < cols.length; b++) {
    var R = baseR - b * bw, pts = [];
    for (var k = 0; k <= 8; k++) {
      var a = PI * k / 8;
      pts.push([Math.cos(a) * R, 0.34 + Math.sin(a) * R, 0]);
    }
    g.tube(pts, 0.066, cols[b], { seg: 6, steps: 2, cap0: true, cap1: true });
  }
  // fluffy white cloud puffs anchoring both bases
  var cl = function (x, y, z, nx, ny) { return ny < -0.2 ? 0xdce8fa : 0xfafcff; };
  for (var s = -1; s <= 1; s += 2) {
    var cx = s * 1.55;
    g.sph(0.55, 0.38, 0.48, cx, 0.3, 0, cl, { s: [7, 5] });
    g.sph(0.42, 0.32, 0.40, cx + s * 0.35, 0.24, 0.18, cl, { s: [6, 4] });
    g.sph(0.40, 0.30, 0.38, cx - s * 0.32, 0.26, -0.18, cl, { s: [6, 4] });
    g.sph(0.36, 0.34, 0.36, cx, 0.52, 0.05, cl, { s: [6, 4] });
  }
} };

SC.wizard_shelter = { build: function (g) {
  var ST = function (x, y, z, nx, ny) {
    var h = hash3(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4));
    var c = shade(0x82807c, 0.84 + h * 0.28);
    return (y < 0.65 && h > 0.4) ? mixHex(c, 0x4c7442, 0.55) : c;
  };
  var ROOF = function (x, y, z) { return hash3(Math.floor(x * 5), Math.floor(y * 5), Math.floor(z * 5)) > 0.6 ? 0x1d3a92 : 0x284eb8; };
  // mossy stone base & tower walls
  g.cyl(1.38, 1.46, 0.22, 0, 0.11, 0, ST, { seg: 10 });
  g.cyl(1.22, 1.28, 1.85, 0, 1.12, 0, ST, { seg: 10 });
  g.cyl(1.32, 1.24, 0.22, 0, 2.08, 0, 0x6c6b68, { seg: 10 });
  // arched dark doorway & stone arch trim
  g.box(0.86, 1.0, 0.38, 0, 0.62, 1.06, 0x17141d);
  g.sph(0.43, 0.42, 0.24, 0, 1.12, 1.08, 0x17141d, { s: [8, 5] });
  g.box(0.18, 1.15, 0.22, -0.48, 0.68, 1.14, 0x9c9890);
  g.box(0.18, 1.15, 0.22, 0.48, 0.68, 1.14, 0x9c9890);
  g.sph(0.56, 0.18, 0.18, 0, 1.32, 1.16, 0x9c9890, { s: [7, 4] });
  // tall pointed cobalt-blue wizard roof speckled with golden stars
  g.cone(1.52, 2.35, 0, 3.35, 0, ROOF, { seg: 10 });
  g.cyl(1.52, 1.56, 0.08, 0, 2.2, 0, 0xe8c038, { seg: 10 });
  g.sph(0.14, 0.14, 0.14, 0, 4.56, 0, 0xf8d448, { s: [6, 5] });
  // golden stars around the pointed roof
  var stars = [
    [0.0, 2.85, 1.08], [0.95, 2.65, 0.55], [-0.95, 2.65, 0.55],
    [0.62, 3.35, -0.58], [-0.62, 3.35, -0.58], [0.0, 3.5, -0.82],
    [0.48, 3.7, 0.45], [-0.48, 3.7, 0.45]
  ];
  for (var k = 0; k < stars.length; k++) {
    var st = stars[k];
    g.sph(0.085, 0.085, 0.085, st[0], st[1], st[2], 0xf8d448, { s: [4, 3] });
  }
} };

SC.castle = { custom: function (grp0) {
  var g = B();
  var ST = function (x, y, z) {
    var h = hash3(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4));
    var c = shade(0x888494, 0.85 + h * 0.26);
    return (y < 0.45 && h > 0.45) ? mixHex(c, 0x4f6848, 0.35) : c;
  };
  var ST_DK = 0x625e6e, RF = 0x861c46, RF_LT = 0xa22858, GD = 0xf0c43c, GATE = 0x16121d;
  // stone courtyard plinth
  g.box(3.5, 0.22, 3.5, 0, 0.11, 0, ST_DK);
  // outer curtain walls (N, S-flanks, E, W)
  g.box(2.7, 1.5, 0.34, 0, 0.96, -1.25, ST);
  g.box(0.34, 1.5, 2.7, -1.25, 0.96, 0, ST);
  g.box(0.34, 1.5, 2.7, 1.25, 0.96, 0, ST);
  g.box(0.85, 1.5, 0.36, -0.88, 0.96, 1.25, ST);
  g.box(0.85, 1.5, 0.36, 0.88, 0.96, 1.25, ST);
  // gatehouse lintel & stone arch over front portal
  g.box(1.15, 0.56, 0.48, 0, 1.52, 1.28, ST);
  g.box(0.86, 1.05, 0.44, 0, 0.72, 1.22, GATE);
  g.sph(0.43, 0.36, 0.26, 0, 1.18, 1.22, GATE, { s: [8, 5] });
  g.box(0.16, 1.15, 0.22, -0.48, 0.76, 1.38, 0x9c98a6);
  g.box(0.16, 1.15, 0.22, 0.48, 0.76, 1.38, 0x9c98a6);
  // raised iron portcullis grate bars
  for (var p = -2; p <= 2; p++) g.box(0.035, 0.34, 0.04, p * 0.14, 1.14, 1.40, 0x3b3e48);
  g.box(0.76, 0.04, 0.05, 0, 1.04, 1.40, 0x3b3e48);
  // crenellations / battlements along curtain walls
  for (var c = -1; c <= 1; c++) {
    g.box(0.24, 0.22, 0.38, c * 0.45, 1.82, -1.25, ST);
    g.box(0.38, 0.22, 0.24, -1.25, 1.82, c * 0.45, ST);
    g.box(0.38, 0.22, 0.24, 1.25, 1.82, c * 0.45, ST);
  }
  for (var g2 = -1; g2 <= 1; g2 += 2) {
    g.box(0.24, 0.22, 0.48, g2 * 0.34, 1.91, 1.28, ST);
    g.box(0.24, 0.22, 0.38, g2 * 0.85, 1.82, 1.25, ST);
  }
  // central grand royal keep + pitched roof + spire
  g.box(1.45, 2.55, 1.45, 0, 1.48, -0.08, ST);
  g.box(1.56, 0.16, 1.56, 0, 2.74, -0.08, ST_DK);
  g.cone(1.08, 1.25, 0, 3.44, -0.08, RF, { seg: 4, rot: [0, PI / 4, 0] });
  g.sph(0.11, 0.11, 0.11, 0, 4.10, -0.08, GD, { s: [6, 4] });
  // four corner turrets with conical crimson-plum roofs & pennants
  var corners = [[-1.28, -1.28], [1.28, -1.28], [-1.28, 1.28], [1.28, 1.28]];
  for (var i = 0; i < corners.length; i++) {
    var cx = corners[i][0], cz = corners[i][1];
    g.cyl(0.42, 0.46, 2.38, cx, 1.40, cz, ST, { seg: 10 });
    g.cyl(0.49, 0.44, 0.22, cx, 2.66, cz, ST_DK, { seg: 10 });
    g.cone(0.56, 1.05, cx, 3.30, cz, i % 2 ? RF : RF_LT, { seg: 10 });
    g.cyl(0.54, 0.56, 0.06, cx, 2.78, cz, GD, { seg: 10 });
    g.sph(0.075, 0.075, 0.075, cx, 3.86, cz, GD, { s: [5, 4] });
    // tiny royal pennant flag on each turret
    g.limb(cx, 3.86, cz, cx, 4.28, cz, 0.018, 0.014, GD, { seg: 4 });
    g.box(0.28, 0.14, 0.03, cx + 0.15, 4.18, cz, 0xe83862);
  }
  grp0.add(mesh(g.build()));
  // glowing warm amber castle windows & gate sconces
  var gw = B();
  var wins = [
    [-1.28, 1.95, 1.72, 0.16, 0.30, 0.08], [1.28, 1.95, 1.72, 0.16, 0.30, 0.08],
    [-1.28, 1.95, -1.72, 0.16, 0.30, 0.08], [1.28, 1.95, -1.72, 0.16, 0.30, 0.08],
    [-1.72, 1.95, 1.28, 0.08, 0.30, 0.16], [1.72, 1.95, 1.28, 0.08, 0.30, 0.16],
    [0, 2.28, 0.66, 0.22, 0.42, 0.08], [0, 2.28, -0.82, 0.22, 0.42, 0.08],
    [-0.58, 1.15, 1.44, 0.09, 0.14, 0.09], [0.58, 1.15, 1.44, 0.09, 0.14, 0.09]
  ];
  for (i = 0; i < wins.length; i++) {
    var w = wins[i];
    gw.box(w[3], w[4], w[5], w[0], w[1], w[2], 0xffd258);
  }
  grp0.add(mesh(gw.build(), mat(0xffd258, { emissive: 0xe07810 })));
  return grp0;
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

var INSTANCED = { oak: 1, pine: 1, acacia: 1, palm: 1, bamboo: 1, baobab: 1, cactus: 1, snow_pine: 1, jungle_tree: 1, bush: 1, fern: 1, tall_grass: 1, boulder: 1, rock_pile: 1, ice_floe: 1, log: 1, heat_rock: 1, enchanted_tree: 1, standing_stones: 1, rainbow_arch: 1, wizard_shelter: 1 };
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
var BLD_DEF = { burger_stand: [1, 1], pizza_hut: [1, 1], ice_cream: [1, 1], drinks_stall: [1, 1], coffee_cart: [1, 1], toilets: [2, 1], gift_shop: [2, 1], balloon_stand: [1, 1], carousel: [2, 2], info_kiosk: [1, 1], restaurant: [2, 2], keeper_hut: [1, 1], vet_clinic: [2, 2], education_centre: [2, 2], viewing_platform: [2, 1], emergency_bunker: [2, 2], wooden_coaster: [3, 3], loop_coaster: [4, 3], mine_coaster: [3, 2], log_flume: [3, 3], ferris_wheel: [2, 2], rubber_duck_stand: [1, 1], air_rifle_stand: [1, 1], ring_toss_stand: [1, 1], whack_a_mole: [1, 1], high_striker: [1, 1], candy_floss: [1, 1], popcorn_stand: [1, 1], hot_dog_stand: [1, 1], slushie_bar: [1, 1] };
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
  g.bevelBox(W + 0.18, 0.06, D + 0.18, 0.02, 0, 0.03, 0, 0x7c7972);
  g.bevelBox(W + 0.12, 0.08, D + 0.12, 0.02, 0, 0.10, 0, 0x949088);
  g.bevelBox(W, H, D, 0.04, 0, y0 + H / 2, 0, o.wall);
  for (var cx = -1; cx <= 1; cx += 2) for (var cz = -1; cz <= 1; cz += 2) g.cyl(0.048, 0.052, H + 0.02, cx * (W / 2 - 0.01), y0 + H / 2, cz * (D / 2 - 0.01), shade(o.trim, 0.9), { seg: 6 });
  g.bevelBox(W + 0.05, 0.08, D + 0.05, 0.02, 0, y0 + H * 0.12, 0, o.trim); g.bevelBox(W + 0.06, 0.09, D + 0.06, 0.02, 0, y0 + H, 0, o.trim);
  g.box(W * 0.72, H * 0.36, 0.05, 0, y0 + H * 0.64, D / 2 + 0.005, 0x2a221e); g.bevelBox(W * 0.72 + 0.12, 0.06, 0.07, 0.015, 0, y0 + H * 0.82 + 0.05, D / 2 + 0.01, o.trim); g.bevelBox(W * 0.72 + 0.12, 0.06, 0.07, 0.015, 0, y0 + H * 0.46 - 0.02, D / 2 + 0.01, o.trim);
  g.bevelBox(W * 0.82, 0.07, 0.32, 0.02, 0, y0 + H * 0.45, D / 2 + 0.16, o.counter || 0xe8e0d0);
  g.box(0.3, 0.45, 0.04, W / 2 + 0.005, y0 + H * 0.6, 0.1, 0x2a221e); // side hatch
  awning(g, 0, y0 + H * 1.0 + 0.2, D / 2 - 0.02, W + 0.1, 0.65, o.awn1, o.awn2, 8, 0.45);
  g.bevelBox(W + 0.26, 0.07, D + 0.26, 0.025, 0, y0 + H + 0.03, 0, shade(o.roof, 0.88));
  g.bevelBox(W + 0.18, 0.10, D + 0.18, 0.03, 0, y0 + H + 0.10, 0, o.roof);
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
  g.bevelBox(3.66, 0.12, 1.76, 0.03, 0, 0.06, 0, 0x8d8a84);
  g.bevelBox(3.42, 2.0, 1.52, 0.05, 0, 1.12, 0, 0xd8dce0);
  gable(g, 3.44, 1.54, 2.12, 0.56, 0x5a6672, 0.20);
  g.bevelBox(3.56, 0.12, 1.66, 0.03, 0, 2.12, 0, 0x4b5662);
  g.bevelBox(3.54, 0.22, 0.05, 0.015, 0, 1.88, 0.77, 0x6a8aa8);
  for (var px = -1; px <= 1; px += 2) {
    g.cyl(0.06, 0.06, 2.0, px * 1.68, 1.12, 0.74, 0xc2c8d0, { seg: 6 });
    g.cyl(0.22, 0.17, 0.26, px * 1.52, 0.18, 0.94, 0x9a7860, { seg: 8 });
    g.sph(0.21, 0.22, 0.21, px * 1.52, 0.40, 0.94, 0x3f8a4a, { s: [6, 5] });
  }
  var door = function (x, col, fem) {
    g.bevelBox(0.8, 1.5, 0.06, 0.015, x, 0.9, 0.76, col); g.bevelBox(0.92, 1.62, 0.04, 0.015, x, 0.9, 0.74, 0xf4f4f4); g.sph(0.04, 0.04, 0.04, x + 0.3, 0.85, 0.82, 0xe8c040, { s: [4, 3] });
    g.sph(0.07, 0.07, 0.03, x, 1.5, 0.8, 0xffffff, { s: [6, 4] }); g.box(fem ? 0.1 : 0.14, 0.22, 0.03, x, 1.32, 0.8, 0xffffff);
    if (fem) g.cone(0.14, 0.22, x, 1.26, 0.8, 0xffffff, { seg: 3 });
    else { g.box(0.04, 0.16, 0.03, x - 0.1, 1.3, 0.8, 0xffffff); g.box(0.04, 0.16, 0.03, x + 0.1, 1.3, 0.8, 0xffffff); }
  };
  door(-0.9, 0x3b82f6, false); door(0.9, 0xf472b6, true);
  windowAt(g, 0, 1.45, 0.77, 0.45, 0.35, 0xffffff, 0xaed8f0); g.bevelBox(0.55, 0.3, 0.05, 0.015, 0, 1.0, 0.77, 0x6a8aa8);
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
  g.bevelBox(3.74, 0.14, 3.74, 0.03, 0, 0.07, 0, 0x8d8a84);
  g.bevelBox(3.44, 2.34, 2.62, 0.08, 0, 1.29, -0.4, 0xf4f6f8);
  g.bevelBox(3.58, 0.18, 2.76, 0.04, 0, 2.52, -0.4, 0x3b82c4);
  g.bevelBox(3.16, 0.20, 2.34, 0.06, 0, 2.68, -0.4, 0xe0e6ec);
  // stepped entry porch & curved portico canopy with columns
  g.bevelBox(2.2, 0.16, 1.05, 0.03, 0, 0.14, 1.38, 0xc8c4bc);
  g.bevelBox(1.9, 0.12, 0.65, 0.03, 0, 0.08, 1.72, 0xb8b4ac);
  windowAt(g, -1.12, 1.42, 0.91, 0.82, 0.82, 0xffffff, 0xa8d8ee); windowAt(g, 1.12, 1.42, 0.91, 0.82, 0.82, 0xffffff, 0xa8d8ee);
  g.box(1.0, 1.6, 0.06, 0, 0.95, 0.92, 0xa8d8ee); g.bevelBox(1.12, 1.72, 0.06, 0.02, 0, 1.0, 0.9, 0x3b82c4); g.box(0.04, 1.6, 0.08, 0, 0.95, 0.93, 0x3b82c4);
  // curved entrance portico canopy supported on twin steel columns
  g.extrude([[-0.88, 0], [0.88, 0], [0.88, 0.14], [0.55, 0.30], [0, 0.36], [-0.55, 0.30], [-0.88, 0.14]], 0.92, 0, 1.88, 1.36, [0, 0, 0], 0x3b82c4, { bevel: 0.03 });
  for (var cs = -1; cs <= 1; cs += 2) {
    g.cyl(0.055, 0.065, 1.74, cs * 0.78, 1.05, 1.72, 0xd8e2ec, { seg: 8 });
    g.cyl(0.09, 0.10, 0.10, cs * 0.78, 0.24, 1.72, 0x9aa4b0, { seg: 8 });
  }
  // red cross emblem on roof (front)
  g.cyl(0.56, 0.56, 0.12, 0, 3.22, 0.2, 0xffffff, { seg: 14, rot: [PI / 2, 0, 0] });
  g.bevelBox(0.64, 0.20, 0.16, 0.02, 0, 3.22, 0.22, 0xd8322e); g.bevelBox(0.20, 0.64, 0.16, 0.02, 0, 3.22, 0.22, 0xd8322e);
  g.limb(-0.36, 2.72, 0.2, -0.26, 2.8, 0.2, 0.04, 0.04, 0x888, { seg: 4 }); g.limb(0.36, 2.72, 0.2, 0.26, 2.8, 0.2, 0.04, 0.04, 0x888, { seg: 4 });
  // side ornamental shrub planters
  for (var ps = -1; ps <= 1; ps += 2) {
    g.bevelBox(0.62, 0.34, 0.62, 0.04, ps * 1.42, 0.28, 1.36, 0x8d8a84);
    g.sph(0.32, 0.32, 0.32, ps * 1.42, 0.62, 1.36, 0x4a9a54, { s: [7, 5] });
  }
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('VET CLINIC', 0x3b82c4, 0xffffff, 1.3, 0.3, 0, 2.34, 0.93, 0));
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
  g.bevelBox(3.9, 0.14, 3.9, 0.04, 0, 0.07, 0, 0x7a7c7a);
  g.bevelBox(3.32, 1.88, 2.72, 0.24, 0, 1.04, -0.4, cn);
  g.bevelBox(3.48, 0.28, 2.86, 0.08, 0, 2.02, -0.4, 0x7a7c7a);
  g.bevelBox(2.96, 0.28, 2.36, 0.10, 0, 2.28, -0.4, 0x5a5c5a);
  for (var bx = -1; bx <= 1; bx += 2) for (var bz = -1; bz <= 1; bz += 2) {
    g.extrude([[-0.18, 0], [0.18, 0], [0.10, 1.82], [-0.10, 1.82]], 0.22, bx * 1.62, 0.12, -0.4 + bz * 1.24, [0, 0, 0], 0x6e7276, { bevel: 0.03 });
  }
  g.box(3.15, 0.28, 0.06, 0, 0.35, 0.97, hz, { s: [24, 1, 1] }); g.box(3.15, 0.28, 0.06, 0, 1.72, 0.97, hz, { s: [24, 1, 1] });
  g.bevelBox(1.58, 1.48, 0.26, 0.06, 0, 0.84, 0.98, 0x4a5058); g.bevelBox(1.32, 1.22, 0.12, 0.03, 0, 0.82, 1.08, 0x6a7078); g.box(1.36, 0.06, 0.1, 0, 0.82, 1.15, 0x2a2e34);
  g.cyl(0.16, 0.16, 0.06, 0.0, 1.1, 1.15, 0xc83a2a, { seg: 10, rot: [PI / 2, 0, 0] });
  g.box(0.76, 0.3, 0.05, -1.12, 1.3, 0.98, 0xf4ead0); g.bevelBox(0.32, 0.32, 0.06, 0.015, 1.18, 1.1, 0.98, 0xd8322e); g.box(0.08, 0.2, 0.07, 1.18, 1.1, 0.99, 0xffffff); g.box(0.2, 0.08, 0.07, 1.18, 1.1, 0.99, 0xffffff);
  g.box(0.66, 0.42, 0.04, 1.0, 1.44, 0.98, 0x2a3038);
  for (var i = 0; i < 4; i++) g.bevelBox(1.55 - i * 0.06, 0.08, 0.24, 0.015, 0, 0.12 + i * 0.03, 1.15 + i * 0.16, 0x8a8c8a);
  g.lathe([[0.42, 2.38], [0.38, 2.80], [0.46, 2.86], [0.34, 2.96], [0.02, 2.98]], 0x6a6c6a, { seg: 10, tx: 0.9, tz: -1.0 });
  post(g, -1.15, -1.15, 2.38, 3.65, 0x555a60, 0.045); g.lathe([[0.04, 0], [0.34, 0.10], [0.38, 0.18]], 0xd0d4da, { seg: 10, tx: -1.15, ty: 3.45, tz: -1.15, rot: [0.65, 0.5, 0] });
  for (i = 0; i < 3; i++) g.bevelBox(0.36, 0.32, 0.34, 0.03, -1.42 + i * 0.32, 0.28, 1.56, 0x4a6a3a, { rot: [0, 0.18 * i, 0] });
  g.cyl(0.11, 0.11, 0.9, 1.65, 0.45, 1.45, 0xd8322e, { seg: 8 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('EMERGENCY', 0xc83a2a, 0xffffff, 1.4, 0.26, -0.5, 1.9, 1.02, 0));
  var rot = grp(); rot.position.set(0, 2.45, -0.4); var bb = B(); bb.cyl(0.3, 0.3, 0.2, 0, 0.1, 0, 0x4a4c4a, { seg: 8 }); bb.sph(0.3, 0.3, 0.3, 0, 0.45, 0, 0xff3a2a, { s: [8, 5] }); grp0.add(mesh(bb.build()));
  var rb = B(); rb.box(1.1, 0.05, 0.12, 0, 0.45, 0, 0xffe0c0); rot.add(mesh(rb.build())); grp0.add(rot);
  var lg = new T.Mesh(unit('ebeaconl', function () { return new T.SphereGeometry(0.42, 8, 6); }), pulseMat(0xff3a2a, 0xff1a0a)); lg.position.set(0, 2.95, -0.4); grp0.add(lg);
  chainUpd(grp0, function (dt, tm) { rot.rotation.y = tm * 4; var s = Math.max(0, Math.sin(tm * 4.5)); lg.material.opacity = 0.1 + 0.5 * s; });
  grp0.userData.update(0, 0);
};

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
    if (p0.up) vU.set(p0.up[0], p0.up[1], p0.up[2]).normalize(); else vU.set(0, 1, 0);
    vR.crossVectors(vU, vF);
    if (vR.lengthSq() < 1e-6) vR.set(1, 0, 0); else vR.normalize();
    var p2 = pts[(i + 2) % steps];
    var vF2 = new T.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    if (vF2.lengthSq() > 1e-8) vF2.normalize(); else vF2.copy(vF);
    var vU2 = p1.up ? new T.Vector3(p1.up[0], p1.up[1], p1.up[2]).normalize() : new T.Vector3(0, 1, 0);
    var vR2 = new T.Vector3().crossVectors(vU2, vF2);
    if (vR2.lengthSq() < 1e-6) vR2.copy(vR); else vR2.normalize();
    for (var s = -1; s <= 1; s += 2) {
      g.limb(p0.x + vR.x * halfW * s, p0.y + vR.y * halfW * s, p0.z + vR.z * halfW * s,
        p1.x + vR2.x * halfW * s, p1.y + vR2.y * halfW * s, p1.z + vR2.z * halfW * s,
        opts.railR || 0.032, opts.railR || 0.032, railCol, { seg: 5 });
    }
    if (i % (opts.tieEvery || 1) === 0) {
      g.limb(p0.x - vR.x * (halfW + 0.06), p0.y - vR.y * (halfW + 0.06), p0.z - vR.z * (halfW + 0.06),
        p0.x + vR.x * (halfW + 0.06), p0.y + vR.y * (halfW + 0.06), p0.z + vR.z * (halfW + 0.06),
        0.028, 0.028, tieCol, { seg: 4 });
    }
    if (opts.spine) {
      g.limb(p0.x - vU.x * 0.1, p0.y - vU.y * 0.1, p0.z - vU.z * 0.1,
        p1.x - vU2.x * 0.1, p1.y - vU2.y * 0.1, p1.z - vU2.z * 0.1,
        0.048, 0.048, opts.spine, { seg: 5 });
    }
    if (supCol && (i % supEvery === 0) && p0.y > 0.45 && (!p0.noSup)) {
      if (opts.trestle) {
        for (var s2 = -1; s2 <= 1; s2 += 2) {
          var bx = p0.x + vR.x * (halfW + 0.08) * s2, bz = p0.z + vR.z * (halfW + 0.08) * s2;
          g.limb(bx, 0.06, bz, bx, p0.y - 0.04, bz, 0.045, 0.04, supCol, { seg: 4 });
        }
        g.limb(p0.x - vR.x * (halfW + 0.08), p0.y * 0.52, p0.z - vR.z * (halfW + 0.08),
          p0.x + vR.x * (halfW + 0.08), p0.y * 0.52, p0.z + vR.z * (halfW + 0.08), 0.03, 0.03, shade(supCol, 0.88), { seg: 4 });
      } else {
        g.limb(p0.x, 0.06, p0.z, p0.x, p0.y - 0.06, p0.z, 0.06, 0.05, supCol, { seg: 6 });
      }
    }
  }
}

function makeCoasterCar(col, accent, guestHead) {
  var cg = B();
  cg.box(0.36, 0.16, 0.48, 0, 0.1, 0, col);
  cg.box(0.38, 0.06, 0.5, 0, 0.18, 0, accent || 0xfaf0d8);
  if (guestHead !== false) {
    cg.sph(0.08, 0.08, 0.08, -0.08, 0.27, 0.04, 0xf2c8a0, { s: [5, 4] });
    cg.sph(0.08, 0.08, 0.08, 0.08, 0.27, 0.04, 0xe8b890, { s: [5, 4] });
    cg.sph(0.075, 0.05, 0.075, -0.08, 0.33, 0.04, 0x4a3220, { s: [5, 3] });
    cg.sph(0.075, 0.05, 0.075, 0.08, 0.33, 0.04, 0xd8a030, { s: [5, 3] });
  }
  var m = grp('car'); m.add(mesh(cg.build())); return m;
}

function orientOnTrack(obj, fn, u) {
  var p0 = fn(fract(u)), p1 = fn(fract(u + 0.008));
  var fwd = _a.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1); else fwd.normalize();
  var upHint = p0.up ? _b.set(p0.up[0], p0.up[1], p0.up[2]).normalize() : _b.set(0, 1, 0);
  var right = _c.crossVectors(upHint, fwd);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
  var up = _e1.crossVectors(fwd, right).normalize();
  _ma.makeBasis(right, up, fwd);
  obj.quaternion.setFromRotationMatrix(_ma);
  obj.position.set(p0.x, p0.y, p0.z);
}

BLD.wooden_coaster = function (grp0) { // 3x3 = 6x6m
  var g = B(), WD = 0xa06a38, WD2 = 0x7c4f28, RAIL = 0xc8ccd0;
  g.box(5.8, 0.12, 5.8, 0, 0.06, 0, 0x8d8a84);
  // boarding station at front
  g.box(2.6, 0.22, 1.15, 0, 0.22, 2.15, WD2);
  for (var sx = -1; sx <= 1; sx += 2) {
    post(g, sx * 1.15, 1.65, 0.2, 1.75, WD, 0.05);
    post(g, sx * 1.15, 2.65, 0.2, 1.75, WD, 0.05);
  }
  awning(g, 0, 1.9, 2.15, 2.7, 1.1, 0xd83a2a, 0xfaf0d8, 10, 0.22);
  g.box(2.7, 0.1, 1.2, 0, 1.85, 2.1, 0xb83020);
  var trackFn = function (u) {
    var a = u * TAU;
    var x = 2.15 * Math.sin(a) + 0.35 * Math.sin(2 * a);
    var z = 2.05 * Math.cos(a) - 0.15 * Math.cos(3 * a);
    var y = 0.6 + 1.55 * (1 - Math.cos(a - 1.9)) * 0.5 + 1.05 * Math.max(0, Math.sin(a * 2 - 0.6));
    if (z > 1.35 && Math.abs(x) < 1.2) y = lerp(y, 0.52, 0.72);
    return { x: x, y: y, z: z };
  };
  buildCoasterTrack(g, trackFn, 56, 0.18, RAIL, WD2, WD, { trestle: true, supEvery: 2 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('COASTER', 0xc83a2a, 0xfff4d0, 1.6, 0.34, 0, 1.78, 2.74, 0));
  var cars = [makeCoasterCar(0xe84a4a, 0xf6d030), makeCoasterCar(0xf2c030, 0xe84a4a), makeCoasterCar(0x3b82f6, 0xfaf0d8)];
  cars.forEach(function (c) { grp0.add(c); });
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < cars.length; i++) orientOnTrack(cars[i], trackFn, tm * 0.22 - i * 0.042);
  };
  grp0.userData.update(0, 0);
};

BLD.loop_coaster = function (grp0) { // 4x3 = 8x6m
  var g = B(), SUP = 0x2684a8, SPINE = 0xf05a28, RAIL = 0xf6d030;
  g.box(7.8, 0.12, 5.8, 0, 0.06, 0, 0x6a727a);
  // modern station at front
  g.box(3.0, 0.24, 1.15, -0.4, 0.24, 2.15, 0x46525e);
  for (var sx = -1; sx <= 1; sx += 2) {
    post(g, -0.4 + sx * 1.35, 1.65, 0.2, 1.8, 0xd8e2ec, 0.05);
    post(g, -0.4 + sx * 1.35, 2.65, 0.2, 1.8, 0xd8e2ec, 0.05);
  }
  g.box(3.1, 0.14, 1.3, -0.4, 1.88, 2.15, 0x1e6496);
  g.box(3.15, 0.08, 1.35, -0.4, 1.96, 2.15, 0x42c8f5);
  // Parametric loop coaster: vertical loop occupies u in [0.42, 0.68]
  var trackFn = function (u) {
    u = fract(u);
    if (u >= 0.42 && u <= 0.68) {
      var lu = (u - 0.42) / 0.26;
      var th = lu * TAU - PI / 2;
      var lr = 1.45;
      return {
        x: lerp(-0.5, 0.55, lu) + 0.0,
        y: 2.05 + lr * Math.sin(th),
        z: -0.25 + lr * Math.cos(th),
        up: [0, -Math.sin(th), -Math.cos(th)],
        noSup: lu > 0.18 && lu < 0.82
      };
    }
    var ru = u < 0.42 ? u / 0.42 : (u - 0.68) / 0.32;
    if (u < 0.42) {
      // station (x=-0.5, z=2.0) -> left sweep -> back straight -> approach loop (x=-0.5, z=-0.25)
      var a = ru * PI;
      var x = lerp(-0.5, -3.15, Math.sin(a)) + (ru > 0.5 ? lerp(0, 2.65, (ru - 0.5) * 2) : 0);
      var z = lerp(1.95, -2.05, ru) + (ru > 0.72 ? lerp(0, 1.8, (ru - 0.72) / 0.28) : 0);
      var y = 0.55 + 2.8 * Math.sin(ru * PI * 0.85);
      if (ru > 0.75) y = lerp(y, 0.6, (ru - 0.75) / 0.25);
      return { x: x, y: y, z: z };
    } else {
      // exit loop (x=0.55, z=-0.25) -> right helix -> station (x=-0.5, z=1.95)
      var x2 = 0.55 + 2.7 * Math.sin(ru * PI) - ru * 1.05;
      var z2 = -0.25 - 1.5 * Math.sin(ru * PI) + ru * 2.2;
      var y2 = 0.6 + 1.9 * Math.sin(ru * PI);
      return { x: x2, y: y2, z: z2 };
    }
  };
  buildCoasterTrack(g, trackFn, 72, 0.17, RAIL, 0x2a343e, SUP, { spine: SPINE, supEvery: 3 });
  // extra A-frame supports for the vertical loop
  g.limb(-0.5, 0.08, -1.65, -0.1, 2.05, -0.25, 0.07, 0.055, SUP, { seg: 6 });
  g.limb(0.55, 0.08, 1.15, 0.1, 2.05, -0.25, 0.07, 0.055, SUP, { seg: 6 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('LOOP COASTER', 0x1e6496, 0xfff4d0, 2.2, 0.34, -0.4, 1.9, 2.83, 0));
  var cars = [makeCoasterCar(0x38bdf8, 0xf6d030), makeCoasterCar(0xf43f5e, 0xffffff), makeCoasterCar(0xa855f7, 0xf6d030)];
  cars.forEach(function (c) { grp0.add(c); });
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < cars.length; i++) orientOnTrack(cars[i], trackFn, tm * 0.26 - i * 0.036);
  };
  grp0.userData.update(0, 0);
};

BLD.mine_coaster = function (grp0) { // 3x2 = 6x4m
  var g = B(), RK = 0xb8663a, WD = 0x7c4f28, IR = 0x525860;
  g.box(5.8, 0.12, 3.8, 0, 0.06, 0, 0x9c866a);
  // craggy canyon rock peak + side boulders
  rock(g, 1.4, 1.5, 1.1, 0, 1.1, -0.35, RK, 31, 0.2);
  rock(g, 1.0, 1.0, 0.85, -1.15, 0.75, -0.25, shade(RK, 0.9), 32, 0.9);
  rock(g, 0.95, 0.95, 0.8, 1.2, 0.7, -0.3, shade(RK, 1.08), 33, 1.4);
  rock(g, 0.55, 0.5, 0.5, -2.15, 0.35, 1.1, shade(RK, 0.92), 34);
  rock(g, 0.5, 0.45, 0.45, 2.15, 0.32, -1.1, shade(RK, 1.05), 35);
  // mine tunnel portal frame at back/side
  post(g, -0.45, -1.35, 0.1, 1.35, WD, 0.06); post(g, 0.45, -1.35, 0.1, 1.35, WD, 0.06);
  g.box(1.08, 0.14, 0.18, 0, 1.38, -1.35, WD);
  // boarding shack at front
  g.box(2.1, 0.2, 0.9, 0, 0.2, 1.35, WD);
  gable(g, 2.0, 0.9, 1.4, 0.45, 0x8a4a2a, 0.12);
  for (var sx = -1; sx <= 1; sx += 2) { post(g, sx * 0.85, 0.95, 0.2, 1.4, WD, 0.05); post(g, sx * 0.85, 1.75, 0.2, 1.4, WD, 0.05); }
  var trackFn = function (u) {
    var a = u * TAU;
    return {
      x: 2.25 * Math.sin(a),
      y: 0.58 + 1.05 * (1 - Math.cos(a)) * 0.5 + 0.45 * Math.sin(2 * a - 0.5),
      z: 1.25 * Math.cos(a) - 0.1 * Math.sin(2 * a)
    };
  };
  buildCoasterTrack(g, trackFn, 52, 0.15, IR, WD, WD, { trestle: true, supEvery: 3 });
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('MINE TRAIN', 0x7c4f28, 0xffe8a8, 1.6, 0.3, 0, 1.45, 1.85, 0));
  // locomotive + 2 ore cars
  var loco = makeCoasterCar(0x3a3e44, 0xd88828, false);
  var cgL = B(); cgL.cyl(0.06, 0.05, 0.25, 0, 0.3, 0.14, 0x222226, { seg: 6 }); cgL.box(0.32, 0.2, 0.22, 0, 0.25, -0.1, 0x8a3a28);
  loco.add(mesh(cgL.build()));
  var cars = [loco, makeCoasterCar(0x9a6234, 0x555860), makeCoasterCar(0x8a542a, 0x555860)];
  cars.forEach(function (c) { grp0.add(c); });
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < cars.length; i++) orientOnTrack(cars[i], trackFn, tm * 0.2 - i * 0.045);
  };
  grp0.userData.update(0, 0);
};

BLD.log_flume = function (grp0) { // 3x3 = 6x6m
  var g = B(), WD = 0x8a5a32, WD2 = 0x6a4222, WT = 0x3b9ae0;
  g.box(5.8, 0.12, 5.8, 0, 0.06, 0, 0x8d8a84);
  // stone-rimmed splashdown basin at front-right
  g.box(4.8, 0.32, 0.18, 0, 0.2, 2.65, 0x7e7a72); g.box(4.8, 0.32, 0.18, 0, 0.2, 0.5, 0x7e7a72);
  g.box(0.18, 0.32, 2.3, -2.35, 0.2, 1.58, 0x7e7a72); g.box(0.18, 0.32, 2.3, 2.35, 0.2, 1.58, 0x7e7a72);
  // boarding dock at front-left
  g.box(1.9, 0.28, 1.15, -1.3, 0.26, 2.05, WD);
  for (var sx = -1; sx <= 1; sx += 2) { post(g, -1.3 + sx * 0.8, 1.55, 0.3, 1.65, WD2, 0.05); post(g, -1.3 + sx * 0.8, 2.55, 0.3, 1.65, WD2, 0.05); }
  gable(g, 1.8, 1.1, 1.65, 0.45, 0x2f8a5a, 0.12);
  var trackFn = function (u) {
    var a = u * TAU;
    var x = 2.05 * Math.sin(a);
    var z = 1.85 * Math.cos(a) - 0.35;
    // lift hill around back, steep plunge down front-right into splash pool
    var y = 0.42 + 2.85 * Math.pow(Math.max(0, -Math.cos(a + 0.35)), 1.35);
    return { x: x, y: y, z: z };
  };
  buildCoasterTrack(g, trackFn, 54, 0.2, WD, WD2, WD2, { spine: WT, trestle: true, supEvery: 3 });
  grp0.add(mesh(g.build()));
  var pool = new T.Mesh(unit('flumepool', function () { return new T.BoxGeometry(4.5, 0.08, 2.0); }), WATER_MAT);
  pool.position.set(0, 0.24, 1.58); grp0.add(pool);
  grp0.add(labelMesh('LOG FLUME', 0x2f8a5a, 0xfff4d0, 1.6, 0.32, -1.3, 1.65, 2.66, 0));
  // 2 hollow log boats
  var boats = [];
  for (var b = 0; b < 2; b++) {
    var lb = B();
    lb.cyl(0.18, 0.18, 0.62, 0, 0.14, 0, 0x6a3e20, { seg: 8, rot: [PI / 2, 0, 0] });
    lb.box(0.24, 0.1, 0.42, 0, 0.2, 0, 0x3b82f6);
    lb.sph(0.08, 0.08, 0.08, 0, 0.32, 0.06, 0xf2c8a0, { s: [5, 4] });
    var bm = grp('logboat'); bm.add(mesh(lb.build())); grp0.add(bm); boats.push(bm);
  }
  // splash droplets at bottom of plunge
  var drops = [], dGeo = unit('fdrop', function () { return new T.SphereGeometry(0.06, 5, 4); }), dMat = mat(0xd8f4ff, { opacity: 0.85 });
  for (var d = 0; d < 10; d++) { var dm = new T.Mesh(dGeo, dMat); dm.userData = { a: d / 10 * TAU, ph: d * 0.23 }; grp0.add(dm); drops.push(dm); }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var i = 0; i < boats.length; i++) orientOnTrack(boats[i], trackFn, tm * 0.17 + i * 0.5);
    for (var j = 0; j < drops.length; j++) {
      var dd = drops[j], u = fract(tm * 1.1 + dd.userData.ph);
      dd.position.set(1.35 + Math.sin(dd.userData.a) * 0.45 * u, 0.28 + Math.sin(u * PI) * 0.7, 1.2 + Math.cos(dd.userData.a) * 0.45 * u);
      dd.scale.setScalar(1.1 - u * 0.6);
    }
  };
  grp0.userData.update(0, 0);
};

BLD.ferris_wheel = function (grp0) { // 2x2 = 4x4m
  var g = B(), ST = 0xd8e0e8, ACC = 0xe84a6a;
  g.box(3.8, 0.14, 3.8, 0, 0.07, 0, 0x8d8a84);
  g.box(3.2, 0.16, 2.2, 0, 0.2, 0, 0xa8a49c);
  // twin A-frame support towers
  for (var s = -1; s <= 1; s += 2) {
    var z = s * 0.62;
    g.limb(-1.25, 0.2, z, 0, 3.45, z, 0.08, 0.065, ST, { seg: 6 });
    g.limb(1.25, 0.2, z, 0, 3.45, z, 0.08, 0.065, ST, { seg: 6 });
    g.limb(-0.65, 1.8, z, 0.65, 1.8, z, 0.045, 0.045, ACC, { seg: 5 });
  }
  g.cyl(0.11, 0.11, 1.5, 0, 3.45, 0, 0xf2c030, { seg: 10, rot: [PI / 2, 0, 0] });
  // front ticket booth
  g.box(1.15, 1.0, 0.65, 0, 0.65, 1.4, 0xf4e8c8);
  g.box(1.25, 0.14, 0.75, 0, 1.2, 1.4, ACC);
  g.box(0.55, 0.45, 0.04, 0, 0.78, 1.73, 0x2a221e);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('FERRIS WHEEL', 0xe84a6a, 0xffffff, 1.15, 0.24, 0, 1.08, 1.75, 0));
  var wheel = grp('wheel'); wheel.position.set(0, 3.45, 0); grp0.add(wheel);
  var wg = B(), R = 2.25, nG = 8;
  for (var i = 0; i < 16; i++) {
    var a0 = i / 16 * TAU, a1 = (i + 1) / 16 * TAU;
    for (var side = -1; side <= 1; side += 2) {
      var wz = side * 0.36;
      wg.limb(Math.cos(a0) * R, Math.sin(a0) * R, wz, Math.cos(a1) * R, Math.sin(a1) * R, wz, 0.045, 0.045, 0xfaf0d8, { seg: 5 });
      wg.limb(Math.cos(a0) * R * 0.65, Math.sin(a0) * R * 0.65, wz, Math.cos(a1) * R * 0.65, Math.sin(a1) * R * 0.65, wz, 0.03, 0.03, ACC, { seg: 4 });
    }
    if (i % 2 === 0) {
      for (side = -1; side <= 1; side += 2) wg.limb(0, 0, side * 0.36, Math.cos(a0) * R, Math.sin(a0) * R, side * 0.36, 0.025, 0.025, 0xf2c030, { seg: 4 });
      wg.limb(Math.cos(a0) * R, Math.sin(a0) * R, -0.36, Math.cos(a0) * R, Math.sin(a0) * R, 0.36, 0.028, 0.028, 0x8d98a4, { seg: 4 });
    }
    wg.sph(0.065, 0.065, 0.065, Math.cos(a0) * R, Math.sin(a0) * R, 0.42, i % 2 ? 0xfff1b0 : 0x60d8ff, { s: [5, 4] });
  }
  wg.cyl(0.24, 0.24, 0.85, 0, 0, 0, 0xf2c030, { seg: 10, rot: [PI / 2, 0, 0] });
  wheel.add(mesh(wg.build()));
  var gCols = [0xe84a4a, 0x3b82f6, 0xf2c030, 0x58b040, 0xf06aa0, 0xa060e0, 0xff8a3a, 0x30c8d8];
  var gondolas = [];
  for (i = 0; i < nG; i++) {
    var ga = i / nG * TAU, gg = B(), col = gCols[i % gCols.length];
    gg.limb(0, 0, -0.3, 0, -0.22, -0.22, 0.02, 0.02, 0x666666, { seg: 4 });
    gg.limb(0, 0, 0.3, 0, -0.22, 0.22, 0.02, 0.02, 0x666666, { seg: 4 });
    // curved gondola capsule + arched canopy roof
    gg.lathe([[0.12, -0.64], [0.22, -0.58], [0.25, -0.40], [0.23, -0.36]], col, { seg: 10, sx: 0.92, sz: 1.08 });
    gg.lathe([[0.27, -0.20], [0.22, -0.14], [0.02, -0.11]], shade(col, 1.15), { seg: 10, sx: 0.95, sz: 1.12, cap0: false });
    gg.limb(-0.18, -0.36, -0.2, -0.18, -0.18, -0.2, 0.015, 0.015, 0xd8dde4, { seg: 4 });
    gg.limb(0.18, -0.36, 0.2, 0.18, -0.18, 0.2, 0.015, 0.015, 0xd8dde4, { seg: 4 });
    var gm = grp('gondola'); gm.position.set(Math.cos(ga) * R, Math.sin(ga) * R, 0); gm.add(mesh(gg.build()));
    wheel.add(gm); gondolas.push(gm);
  }
  grp0.userData.update = function (dt) {
    wheel.rotation.z += dt * 0.45;
    for (var j = 0; j < gondolas.length; j++) gondolas[j].rotation.z = -wheel.rotation.z;
  };
};

BLD.rubber_duck_stand = function (grp0) { // 1x1
  var g = B();
  stall(g, { w: 1.65, d: 1.45, h: 1.25, wall: 0x38a8e8, trim: 0xf6d030, roof: 0x1d70b8, awn1: 0xf6d030, awn2: 0x38a8e8, counter: 0x1d70b8, bands: true });
  // water trough on the counter
  g.box(1.32, 0.14, 0.42, 0, 0.72, 0.88, 0x0c4a6e);
  // leaning fishing rods & hanging plush prizes
  g.limb(-0.68, 0.12, 0.96, -0.52, 1.22, 0.78, 0.018, 0.014, 0xc8923a, { seg: 4 });
  g.limb(0.68, 0.12, 0.96, 0.52, 1.22, 0.78, 0.018, 0.014, 0xc8923a, { seg: 4 });
  g.sph(0.11, 0.12, 0.1, -0.62, 1.32, 0.84, 0xf06aa0, { s: [5, 4] });
  g.sph(0.11, 0.12, 0.1, 0.62, 1.32, 0.84, 0x58b040, { s: [5, 4] });
  // giant rubber duck on roof
  g.cyl(0.05, 0.05, 0.25, 0, 1.56, 0, 0x555555, { seg: 5 });
  g.sph(0.32, 0.24, 0.38, 0, 1.85, 0, 0xf6d030, { s: [8, 6] });
  g.sph(0.2, 0.19, 0.2, 0, 2.15, 0.18, 0xf6d030, { s: [7, 5] });
  g.cone(0.08, 0.16, 0, 2.12, 0.39, 0xff7a1a, { seg: 5, rot: [PI / 2, 0, 0] });
  grp0.add(mesh(g.build()));
  var twater = new T.Mesh(unit('duckwater', function () { return new T.BoxGeometry(1.22, 0.04, 0.34); }), WATER_MAT);
  twater.position.set(0, 0.78, 0.88); grp0.add(twater);
  var ducks = [];
  for (var i = 0; i < 4; i++) {
    var dg = B();
    dg.sph(0.065, 0.05, 0.08, 0, 0.04, 0, 0xf6d030, { s: [6, 4] });
    dg.sph(0.045, 0.045, 0.045, 0, 0.095, 0.045, 0xf6d030, { s: [5, 4] });
    dg.cone(0.02, 0.04, 0, 0.09, 0.09, 0xff7a1a, { seg: 4, rot: [PI / 2, 0, 0] });
    var dm = grp('duck'); dm.add(mesh(dg.build())); dm.userData.ph = i / 4; grp0.add(dm); ducks.push(dm);
  }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var j = 0; j < ducks.length; j++) {
      var a = (tm * 0.9 + ducks[j].userData.ph * TAU);
      ducks[j].position.set(Math.sin(a) * 0.45, 0.79 + Math.sin(tm * 3 + j) * 0.015, 0.88 + Math.cos(a) * 0.08);
      ducks[j].rotation.y = a + PI / 2;
    }
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('HOOK A DUCK', 0x1d70b8, 0xfff080, 1.2, 0.24, 0, 0.35, 0.75, 0));
};

BLD.air_rifle_stand = function (grp0) { // 1x1
  var g = B();
  stall(g, { w: 1.65, d: 1.45, h: 1.3, wall: 0xb82828, trim: 0xf2c030, roof: 0x7a1a1a, awn1: 0xd83a2a, awn2: 0xfaf0d8, counter: 0x8a5a3a, bands: true });
  // cork air rifles on counter
  for (var i = -1; i <= 1; i++) {
    g.limb(i * 0.36, 0.72, 0.95, i * 0.36, 0.74, 0.65, 0.02, 0.015, 0x3a3d44, { seg: 4 });
    g.box(0.05, 0.06, 0.16, i * 0.36, 0.71, 0.95, 0x6a3a22);
  }
  // tin cans on back shelf
  for (var c = 0; c < 4; c++) g.cyl(0.04, 0.04, 0.1, -0.36 + c * 0.24, 0.95, 0.66, [0xe84a4a, 0xf2c030, 0x3b82f6, 0x58b040][c], { seg: 6 });
  // rooftop bullseye target
  g.cyl(0.05, 0.05, 0.35, 0, 1.6, 0, 0x555555, { seg: 5 });
  g.cyl(0.36, 0.36, 0.08, 0, 2.02, 0, 0xffffff, { seg: 14, rot: [PI / 2, 0, 0] });
  g.cyl(0.24, 0.24, 0.09, 0, 2.02, 0, 0xd83a2a, { seg: 14, rot: [PI / 2, 0, 0] });
  g.cyl(0.11, 0.11, 0.1, 0, 2.02, 0, 0xf2c030, { seg: 12, rot: [PI / 2, 0, 0] });
  grp0.add(mesh(g.build()));
  // moving mechanical bullseye targets
  var targets = [];
  for (i = 0; i < 3; i++) {
    var tg = B();
    tg.cyl(0.1, 0.1, 0.03, 0, 0, 0, 0xffffff, { seg: 10, rot: [PI / 2, 0, 0] });
    tg.cyl(0.05, 0.05, 0.04, 0, 0, 0, 0xd83a2a, { seg: 8, rot: [PI / 2, 0, 0] });
    var tm2 = grp('target'); tm2.add(mesh(tg.build())); grp0.add(tm2); targets.push(tm2);
  }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var j = 0; j < targets.length; j++) {
      targets[j].position.set(Math.sin(tm * 1.8 + j * 2.1) * 0.42, 1.12, 0.72);
    }
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('AIR RIFLES', 0x7a1a1a, 0xfff080, 1.2, 0.24, 0, 0.35, 0.75, 0));
};

BLD.ring_toss_stand = function (grp0) { // 1x1
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0x7c3aed, trim: 0xf6d030, roof: 0x5b21b6, awn1: 0xa855f7, awn2: 0xf6d030, counter: 0xf4ead0, bands: true });
  // grid of colourful glass bottles on counter
  var bCols = [0x58b040, 0x3b82f6, 0xe84a4a, 0xf2c030];
  for (var bx = -1; bx <= 1; bx++) for (var bz = 0; bz <= 1; bz++) {
    var col = bCols[(bx + 1 + bz) % 4];
    g.cyl(0.038, 0.045, 0.16, bx * 0.22, 0.76, 0.8 + bz * 0.18, col, { seg: 7 });
    g.cyl(0.018, 0.032, 0.06, bx * 0.22, 0.87, 0.8 + bz * 0.18, col, { seg: 6 });
  }
  // hanging giant plush bears on sides
  for (var s = -1; s <= 1; s += 2) {
    g.sph(0.12, 0.14, 0.1, s * 0.65, 1.22, 0.84, s < 0 ? 0xd89050 : 0xf49ac0, { s: [6, 5] });
    g.sph(0.08, 0.08, 0.08, s * 0.65, 1.4, 0.84, s < 0 ? 0xd89050 : 0xf49ac0, { s: [5, 4] });
  }
  // rooftop giant ring & bottle
  g.cyl(0.05, 0.05, 0.25, 0, 1.54, 0, 0x555555, { seg: 5 });
  g.cyl(0.1, 0.12, 0.5, 0, 1.9, 0, 0x58b040, { seg: 8 });
  for (var r = 0; r < 10; r++) {
    var a0 = r / 10 * TAU, a1 = (r + 1) / 10 * TAU;
    g.limb(Math.sin(a0) * 0.26, 2.02, Math.cos(a0) * 0.26, Math.sin(a1) * 0.26, 2.02, Math.cos(a1) * 0.26, 0.045, 0.045, 0xf6d030, { seg: 5 });
  }
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('RING TOSS', 0x5b21b6, 0xfff080, 1.15, 0.24, 0, 0.35, 0.73, 0));
};

BLD.whack_a_mole = function (grp0) { // 1x1
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0x16a34a, trim: 0xf97316, roof: 0x15803d, awn1: 0xf97316, awn2: 0xfef08a, counter: 0x7a4a2a, bands: true });
  // mole holes + resting mallet on counter
  for (var m = -1; m <= 1; m++) g.cyl(0.11, 0.11, 0.05, m * 0.34, 0.72, 0.88, 0x222226, { seg: 8 });
  g.limb(0.45, 0.72, 0.96, 0.58, 0.74, 0.78, 0.02, 0.02, 0xc89050, { seg: 4 });
  g.cyl(0.06, 0.06, 0.14, 0.58, 0.76, 0.78, 0xe84a4a, { seg: 6, rot: [0, 0, PI / 2] });
  // giant mallet on roof
  g.limb(0, 1.45, 0, 0, 2.0, 0, 0.045, 0.045, 0xc89050, { seg: 5 });
  g.cyl(0.16, 0.16, 0.44, 0, 2.1, 0, 0xe84a4a, { seg: 8, rot: [0, 0, PI / 2] });
  grp0.add(mesh(g.build()));
  var moles = [];
  for (var i = 0; i < 3; i++) {
    var mg = B();
    mg.cyl(0.075, 0.085, 0.14, 0, 0.07, 0, 0x8a5a3a, { seg: 7 });
    mg.sph(0.075, 0.07, 0.075, 0, 0.15, 0, 0x9a6a44, { s: [6, 5] });
    mg.sph(0.025, 0.02, 0.025, 0, 0.15, 0.07, 0xf06aa0, { s: [4, 3] });
    var mm = grp('mole'); mm.add(mesh(mg.build())); grp0.add(mm); moles.push(mm);
  }
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    for (var j = 0; j < moles.length; j++) {
      var h = Math.max(0, Math.sin(tm * 3.5 + j * 2.1));
      moles[j].position.set((j - 1) * 0.34, 0.66 + h * 0.16, 0.88);
    }
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('WHACK!', 0x15803d, 0xfef08a, 1.1, 0.24, 0, 0.35, 0.73, 0));
};

BLD.high_striker = function (grp0) { // 1x1
  var g = B();
  g.box(1.7, 0.14, 1.5, 0, 0.07, 0, 0x8d8a84);
  g.box(1.5, 0.85, 0.6, 0, 0.56, -0.35, 0xd83a2a, { s: [1, 3, 1] });
  g.box(1.55, 0.1, 0.65, 0, 1.02, -0.35, 0xf6d030);
  // striker platform & lever pad
  g.box(0.85, 0.16, 0.85, 0, 0.2, 0.35, 0x3b82f6);
  g.cyl(0.18, 0.2, 0.12, 0, 0.34, 0.52, 0xf6d030, { seg: 8 });
  // tall graduated striker tower
  g.box(0.28, 3.05, 0.16, 0, 1.72, 0.05, function (px, py) { return fract(py * 2.0) < 0.5 ? 0xfaf0d8 : 0xe84a4a; });
  g.box(0.06, 2.95, 0.06, 0, 1.72, 0.15, 0xc8ccd0);
  // golden bell at top
  g.cyl(0.14, 0.24, 0.22, 0, 3.36, 0.08, 0xf6d030, { seg: 10 });
  g.sph(0.14, 0.1, 0.14, 0, 3.47, 0.08, 0xf6d030, { s: [8, 4] });
  // resting mallet
  g.limb(0.45, 0.15, 0.45, 0.65, 0.95, 0.3, 0.028, 0.025, 0x8a5a3a, { seg: 4 });
  g.cyl(0.11, 0.11, 0.26, 0.65, 0.98, 0.3, 0x3a3d44, { seg: 6, rot: [0, 0, PI / 2] });
  grp0.add(mesh(g.build()));
  var pg = B(); pg.cyl(0.12, 0.12, 0.09, 0, 0, 0, 0xf2c030, { seg: 8, rot: [PI / 2, 0, 0] });
  var puck = grp('puck'); puck.add(mesh(pg.build())); grp0.add(puck);
  grp0.userData.update = function (dt, tm) {
    tm = tm || 0;
    var u = fract(tm * 0.45);
    var h = u < 0.35 ? Math.sin((u / 0.35) * PI * 0.5) : u < 0.65 ? Math.cos(((u - 0.35) / 0.3) * PI * 0.5) : 0;
    puck.position.set(0, 0.45 + h * 2.7, 0.18);
  };
  grp0.userData.update(0, 0);
  grp0.add(labelMesh('STRIKER', 0xd83a2a, 0xfff4d0, 1.15, 0.24, 0, 0.65, -0.04, 0));
};

BLD.candy_floss = function (grp0) { // 1x1
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0xf472b6, trim: 0xffffff, roof: 0xec4899, awn1: 0xf472b6, awn2: 0x7dd3fc, counter: 0xfdf2f8, bands: true });
  // spinning bowl machine on counter + sticks
  g.cyl(0.24, 0.2, 0.16, -0.25, 0.78, 0.85, 0xd8dde4, { seg: 10 });
  g.sph(0.2, 0.14, 0.2, -0.25, 0.88, 0.85, 0xf9a8d4, { s: [8, 5] });
  g.sph(0.12, 0.18, 0.12, 0.35, 0.92, 0.86, 0x7dd3fc, { s: [6, 5] });
  g.cyl(0.05, 0.05, 0.4, 0, 1.56, 0, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  // giant spinning candy floss on roof
  var cf = B();
  cf.limb(0, -0.35, 0, 0, 0.35, 0, 0.03, 0.03, 0xffffff, { seg: 5 });
  cf.sph(0.32, 0.38, 0.32, 0, 0.28, 0, 0xf472b6, { s: [9, 6] });
  cf.sph(0.26, 0.28, 0.26, 0.1, 0.42, 0.05, 0xf9a8d4, { s: [8, 5] });
  cf.sph(0.22, 0.22, 0.22, -0.1, 0.15, -0.05, 0x7dd3fc, { s: [7, 5] });
  addSpin(grp0, cf.build(), 2.0, 1.1);
  grp0.add(labelMesh('CANDY FLOSS', 0xec4899, 0xffffff, 1.2, 0.24, 0, 0.35, 0.73, 0));
};

BLD.popcorn_stand = function (grp0) { // 1x1
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0xd83a2a, trim: 0xf6d030, roof: 0xb82820, awn1: 0xd83a2a, awn2: 0xffffff, counter: 0xfaf0d8, bands: true });
  // glass popper box on counter
  g.box(0.45, 0.42, 0.34, 0, 0.9, 0.85, 0xd8f0fa);
  g.box(0.47, 0.06, 0.36, 0, 1.12, 0.85, 0xd83a2a);
  g.sph(0.18, 0.12, 0.14, 0, 0.78, 0.85, 0xfef08a, { s: [6, 4] });
  g.cyl(0.05, 0.05, 0.4, 0, 1.56, 0, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  // giant striped popcorn tub on roof
  var pc = B();
  pc.cyl(0.32, 0.22, 0.65, 0, 0, 0, function (x, y, z) { return fract(Math.atan2(x, z) / TAU * 8) < 0.5 ? 0xd83a2a : 0xffffff; }, { seg: 8 });
  for (var i = 0; i < 9; i++) {
    var a = i / 9 * TAU, rr = i < 7 ? 0.17 : 0.05;
    pc.sph(0.12, 0.1, 0.12, Math.sin(a) * rr, 0.36 + (i % 3) * 0.05, Math.cos(a) * rr, i % 2 ? 0xfef08a : 0xfffbe0, { s: [5, 4] });
  }
  addSpin(grp0, pc.build(), 2.05, 0.9);
  grp0.add(labelMesh('POPCORN', 0xb82820, 0xfef08a, 1.15, 0.24, 0, 0.35, 0.73, 0));
};

BLD.hot_dog_stand = function (grp0) { // 1x1
  var g = B();
  g.box(1.4, 0.68, 0.95, 0, 0.68, 0, 0xd83a2a, { s: [1, 3, 1] });
  g.box(1.48, 0.08, 1.02, 0, 1.06, 0, 0xe8ecf0);
  g.box(1.36, 0.1, 0.9, 0, 0.34, 0, 0xf6d030);
  for (var s = -1; s <= 1; s += 2) {
    g.cyl(0.32, 0.32, 0.09, s * 0.68, 0.32, 0, 0x2a2a2a, { seg: 10, rot: [0, 0, PI / 2] });
    g.cyl(0.12, 0.12, 0.11, s * 0.68, 0.32, 0, 0xf6d030, { seg: 6, rot: [0, 0, PI / 2] });
  }
  // grill + sausages + mustard/ketchup bottles
  g.box(0.65, 0.06, 0.5, -0.2, 1.13, 0, 0x3a3d44);
  for (var i = 0; i < 3; i++) g.cyl(0.04, 0.04, 0.32, -0.35 + i * 0.15, 1.18, 0, 0xc85228, { seg: 6, rot: [PI / 2, 0, 0] });
  g.cyl(0.04, 0.04, 0.2, 0.35, 1.2, 0.15, 0xd83a2a, { seg: 6 });
  g.cyl(0.04, 0.04, 0.2, 0.5, 1.2, 0.15, 0xf6d030, { seg: 6 });
  // striped carnival umbrella
  g.limb(0.45, 1.1, -0.3, 0.45, 2.45, -0.3, 0.03, 0.03, 0x555555, { seg: 4 });
  g.cone(1.25, 0.52, 0.45, 2.48, -0.3, function (x, y, z) { return fract(Math.atan2(x - 0.45, z + 0.3) / TAU * 10) < 0.5 ? 0xd83a2a : 0xf6d030; }, { seg: 10 });
  // giant hot dog sign on roof of cart
  g.cyl(0.16, 0.16, 0.72, -0.2, 1.56, 0, 0xe0a050, { seg: 8, rot: [0, 0, PI / 2] });
  g.cyl(0.12, 0.12, 0.86, -0.2, 1.66, 0, 0xc84824, { seg: 8, rot: [0, 0, PI / 2] });
  g.box(0.7, 0.04, 0.06, -0.2, 1.78, 0, 0xf6d030);
  grp0.add(mesh(g.build()));
  grp0.add(labelMesh('HOT DOGS', 0xd83a2a, 0xfef08a, 0.95, 0.22, 0, 0.68, 0.485, 0));
};

BLD.slushie_bar = function (grp0) { // 1x1
  var g = B();
  stall(g, { w: 1.6, d: 1.4, h: 1.22, wall: 0x06b6d4, trim: 0xf43f5e, roof: 0x0e7490, awn1: 0x22d3ee, awn2: 0xf43f5e, counter: 0xe0f2fe, bands: true });
  // twin slushie dispenser tanks
  g.box(0.28, 0.36, 0.24, -0.24, 0.9, 0.84, 0xf43f5e);
  g.box(0.28, 0.36, 0.24, 0.24, 0.9, 0.84, 0x38bdf8);
  g.box(0.3, 0.06, 0.26, -0.24, 1.1, 0.84, 0xffffff);
  g.box(0.3, 0.06, 0.26, 0.24, 1.1, 0.84, 0xffffff);
  g.cyl(0.05, 0.05, 0.4, 0, 1.56, 0, 0x555555, { seg: 5 });
  grp0.add(mesh(g.build()));
  // spinning giant slushie cup on roof
  var sl = B();
  sl.cyl(0.3, 0.2, 0.72, 0, 0, 0, function (x, y) { return y > 0 ? 0xf43f5e : 0x38bdf8; }, { seg: 10 });
  sl.sph(0.29, 0.22, 0.29, 0, 0.38, 0, 0xe0f2fe, { s: [10, 6] });
  sl.limb(0.06, 0.4, 0, 0.14, 0.78, 0, 0.03, 0.03, 0xfacc15, { seg: 4 });
  sl.limb(0.14, 0.78, 0, 0.32, 0.84, 0, 0.03, 0.03, 0xfacc15, { seg: 4 });
  addSpin(grp0, sl.build(), 2.1, 1.0);
  grp0.add(labelMesh('SLUSHIES', 0x0e7490, 0xffffff, 1.15, 0.24, 0, 0.35, 0.73, 0));
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
API.setDetail = function (d) {
  var v = clamp(+d || 1.5, 0.8, 2.2);
  if (Math.abs(v - DETAIL) < 0.01) return;
  DETAIL = v;
  unitCache = {}; bodyCache = {}; legCache = {}; armCache = {}; propCache = {}; sceneryGeoCache = {}; partsCache = {};
};
API.getDetail = function () { return DETAIL; };
API.speciesIds = function () { return Object.keys(QUADS).concat(Object.keys(OTHERS)); };
return API;
})();
