// Shared classic geometry and biped animation primitives for Dino and Zoo.
window.Z = window.Z || {};
Z.ModelCommon = (function () {
'use strict';
function createBuilder(THREE, detail, capMode) {
var T = THREE, PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
var DETAIL = detail;
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
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
  var capf;
  if (capMode === 'dome') {
  var capf = function (i0, sgn) { // domed cap: rings shrink toward an apex pushed outward
    var cx = 0, cy = 0, cz = 0, r = 0, g = 0, b = 0, kk, q, fs = [1, 0.78, 0.45, 0], rows = fs.length, ny = down ? -sgn : 0, nz = down ? 0 : dir * sgn;
    for (kk = 0; kk < S; kk++) { q = (i0 * S + kk) * 3; cx += P[q]; cy += P[q + 1]; cz += P[q + 2]; r += CC[q]; g += CC[q + 1]; b += CC[q + 2]; }
    cx /= S; cy /= S; cz /= S; r /= S; g /= S; b /= S;
    var rad = 0; for (kk = 0; kk < S; kk++) { q = (i0 * S + kk) * 3; rad += Math.sqrt((P[q] - cx) * (P[q] - cx) + (P[q + 1] - cy) * (P[q + 1] - cy) + (P[q + 2] - cz) * (P[q + 2] - cz)); }
    var depth = rad / S * 0.45, Q = new Float32Array(rows * S * 3), QN = new Float32Array(rows * S * 3), QC = new Float32Array(rows * S * 3), j, f, h, qi, nx2, ny2, nz2, l;
    for (j = 0; j < rows; j++) {
      f = fs[j]; h = depth * Math.sqrt(1 - f * f);
      for (kk = 0; kk < S; kk++) {
        q = (i0 * S + kk) * 3; qi = (j * S + kk) * 3;
        Q[qi] = cx + (P[q] - cx) * f; Q[qi + 1] = cy + (P[q + 1] - cy) * f + ny * h; Q[qi + 2] = cz + (P[q + 2] - cz) * f + nz * h;
        nx2 = N[q] * f; ny2 = N[q + 1] * f + ny * (1 - f); nz2 = N[q + 2] * f + nz * (1 - f); l = Math.sqrt(nx2 * nx2 + ny2 * ny2 + nz2 * nz2) || 1;
        QN[qi] = nx2 / l; QN[qi + 1] = ny2 / l; QN[qi + 2] = nz2 / l;
        QC[qi] = lerp(r, CC[q], f); QC[qi + 1] = lerp(g, CC[q + 1], f); QC[qi + 2] = lerp(b, CC[q + 2], f);
      }
    }
    _emitGrid(this, Q, QN, QC, rows - 1, S, true);
  }.bind(this);
  } else {
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
  }
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

Builder.prototype.tri = function (a, b, c, col, hx, hy, hz) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _c.set(c[0], c[1], c[2]); _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _n.crossVectors(_e1, _e2); var l = _n.length(); if (l < 1e-9) return this; _n.divideScalar(l);
  if (_n.x * hx + _n.y * hy + _n.z * hz < 0) { _n.negate(); var t = b; b = c; c = t; }
  this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (var i = 0; i < 3; i++) { this.n.push(_n.x, _n.y, _n.z); this.c.push((col >> 16 & 255) / 255, (col >> 8 & 255) / 255, (col & 255) / 255); }
  return this;
}
Builder.prototype.merge = function (other, dx, dy, dz) {
  for (var i = 0; i < other.p.length; i += 3) { this.p.push(other.p[i] + dx, other.p[i + 1] + dy, other.p[i + 2] + dz); }
  for (i = 0; i < other.n.length; i++) this.n.push(other.n[i]);
  for (i = 0; i < other.c.length; i++) this.c.push(other.c[i]);
  return this;
}
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
}
return { Builder: Builder, unit: unit, unitSph: unitSph, unitBox: unitBox, unitCyl: unitCyl, setDetail: function (value) { DETAIL = value; unitCache = {}; }, profAt: profAt, pushTriAO: _pushTriAO, emitGrid: _emitGrid };
}
function personUpdate(I, dt, ent, toolboxAsCase) {
  var PI = Math.PI, TAU = PI * 2, sin = Math.sin;
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(c, t, k, dt) { return c + (t - c) * (1 - Math.exp(-k * dt)); }
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
    else if (pn === 'case' || (toolboxAsCase && pn === 'toolbox')) { a1 = lerp(a1, -0.8, wl); a0 = lerp(a0, -0.4 + 0.15 * sin(t * 3), wl); }
    else if (pn === 'flag') { a0 = lerp(a0, -0.7, wl); a1 = lerp(a1, -2.3 + 0.2 * sin(t * 3), wl); }
    else { a0 = lerp(a0, -0.5 + 0.15 * sin(t * 2), wl); }
  }
  I.a0 = damp(I.a0, a0, 14, dt); I.a1 = damp(I.a1, a1, 14, dt); I.a0z = damp(I.a0z, a0z, 12, dt); I.a1z = damp(I.a1z, a1z, 12, dt);
  var rg = I.rig;
  rg.position.y = (Math.abs(s) * 0.035 * gw * (1 + rw)) - 0.36 * sw;
  rg.rotation.x = 0.05 * gw + 0.28 * rw - 0.05 * sw + (st === 'work' && (I.propName === 'case' || (toolboxAsCase && I.propName === 'toolbox')) ? 0.35 * wk : 0);
  rg.rotation.z = sway + 0.04 * gw * s;
  I.body.rotation.y = 0.12 * s * gw;
  I.legs[0].rotation.x = l0; I.legs[1].rotation.x = l1;
  I.arms[0].rotation.set(I.a0, 0, I.a0z); I.arms[1].rotation.set(I.a1, 0, -I.a1z);
  if (I.prop && I.propName !== 'bucket' && I.propName !== 'case' && !(toolboxAsCase && I.propName === 'toolbox')) {
    var bw = I.propName === 'broom' ? 0.3 * Math.sin(t * 4) * wk : 0.1 * Math.sin(t * 3 + I.seed) + 0.1 * gw * s;
    I.prop.rotation.set(bw * 0.7 - 0.12, 0, I.propName === 'flag' ? 0.05 * sin(t * 2) : 0);
  }
}
return { createBuilder: createBuilder, personUpdate: personUpdate };
})();
