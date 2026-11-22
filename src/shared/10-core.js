// ===== 10-core.js =====
var window = typeof window!=='undefined' ? window : globalThis; window.Z = window.Z || {}; var Z = window.Z;
(function () {
  'use strict';
  var N = 56, TILE = 2;
  Z.N = N; Z.TILE = TILE;

  // ---- event bus ----
  var handlers = {};
  Z.bus = {
    on: function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); return fn; },
    off: function (evt, fn) {
      var a = handlers[evt]; if (!a) return;
      var k = a.indexOf(fn); if (k >= 0) a.splice(k, 1);
    },
    emit: function (evt, payload) {
      var a = handlers[evt]; if (!a) return;
      var c = a.length > 1 ? a.slice() : a;
      for (var k = 0; k < c.length; k++) {
        try { c[k](payload); } catch (e) { if (typeof console !== 'undefined') console.error('bus handler error [' + evt + ']', e); }
      }
    }
  };

  // ---- seeded rng (mulberry32) ----
  var seed = 123456789;
  var rng = {
    seed: function (s) { seed = (s >>> 0) || 1; },
    getSeed: function () { return seed >>> 0; },
    next: function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range: function (a, b) { return a + (b - a) * rng.next(); },
    int: function (a, b) { return a + Math.floor(rng.next() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    chance: function (p) { return rng.next() < p; }
  };
  Z.rng = rng;

  Z.idx = function (i, j) { return i + j * Z.N; };
  Z.inb = function (i, j) { return i >= 0 && j >= 0 && i < Z.N && j < Z.N; };
  Z.w2t = function (x) { return Math.floor(x / Z.TILE); };
  Z.fenceXIdx = function (i, j) { return i + j * Z.N; };
  Z.fenceZIdx = function (i, j) { return i + j * (Z.N + 1); };
  // elevation: corner heights in levels (Int8Array, (N+1)^2), one level = ELEV_STEP world units
  Z.ELEV_STEP = 0.5;
  Z.eidx = function (i, j) { return i + j * (Z.N + 1); };
  function validGridSize(n, fallback) {
    n = Math.round(Number(n));
    return isFinite(n) && n >= 32 && n <= 128 ? n : fallback;
  }
  Z.setGridSize = function (n) {
    n = validGridSize(n, 56);
    N = n;
    Z.N = n;
    if (Z.bus && Z.bus.emit) Z.bus.emit('gridsize', n);
    return n;
  };

  if (!Z.GameConfig || typeof Z.GameConfig.createState !== 'function') throw new Error('Game config must load before shared core');
  Z.newState = function (seed, gridN) {
    if (seed !== undefined) rng.seed(seed);
    // Map previews can temporarily set Z.N without changing the live grid.
    return Z.GameConfig.createState(validGridSize(gridN, Z.N || N));
  };
  Z.emptyFinance = Z.GameConfig.emptyFinance;

  // ---- compact typed-array (de)serialisation: byte RLE + base64 ----
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64R = null;
  function b64enc(bytes) {
    var s = '', n = bytes.length, k;
    for (k = 0; k + 2 < n; k += 3) {
      var v = (bytes[k] << 16) | (bytes[k + 1] << 8) | bytes[k + 2];
      s += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
    }
    if (k < n) {
      var a = bytes[k], b = k + 1 < n ? bytes[k + 1] : 0, v2 = (a << 16) | (b << 8);
      s += B64[(v2 >> 18) & 63] + B64[(v2 >> 12) & 63] + (k + 1 < n ? B64[(v2 >> 6) & 63] : '=') + '=';
    }
    return s;
  }
  function b64dec(s) {
    if (!B64R) { B64R = {}; for (var q = 0; q < 64; q++) B64R[B64[q]] = q; }
    var pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
    var len = (s.length / 4) * 3 - pad, out = new Uint8Array(len), o = 0;
    for (var k = 0; k < s.length; k += 4) {
      var v = (B64R[s[k]] << 18) | (B64R[s[k + 1]] << 12) | ((B64R[s[k + 2]] || 0) << 6) | (B64R[s[k + 3]] || 0);
      if (o < len) out[o++] = (v >> 16) & 255;
      if (o < len) out[o++] = (v >> 8) & 255;
      if (o < len) out[o++] = v & 255;
    }
    return out;
  }
  Z.packArray = function (arr) {
    var bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    var out = [], n = bytes.length, k = 0;
    while (k < n) {
      var v = bytes[k], run = 1;
      while (k + run < n && bytes[k + run] === v && run < 255) run++;
      out.push(run, v); k += run;
    }
    var t = arr instanceof Uint8Array ? 'u8' : arr instanceof Int32Array ? 'i32' : arr instanceof Int16Array ? 'i16' : arr instanceof Int8Array ? 'i8' : 'u8';
    return { __t: t, n: arr.length, d: b64enc(out) };
  };
  Z.unpackArray = function (o) {
    var rl = b64dec(o.d), C = o.__t === 'i32' ? Int32Array : o.__t === 'i16' ? Int16Array : o.__t === 'i8' ? Int8Array : Uint8Array;
    var arr = new C(o.n), bytes = new Uint8Array(arr.buffer), p = 0;
    for (var k = 0; k + 1 < rl.length; k += 2) {
      var run = rl[k], v = rl[k + 1];
      for (var r = 0; r < run && p < bytes.length; r++) bytes[p++] = v;
    }
    return arr;
  };
})();
