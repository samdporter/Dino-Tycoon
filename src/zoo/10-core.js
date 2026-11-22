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
  Z.ELEV_STEP = 0.5;
  Z.eidx = function (i, j) { return j * (Z.N + 1) + i; };
  Z.setGridSize = function (n) {
    var v = Math.round(Number(n));
    if (!isFinite(v) || v < 32 || v > 128) v = 56;
    N = v; Z.N = v;
    Z.bus.emit('gridsize', v);
    return v;
  };

  Z.newState = function (seed, gridN) {
    if (seed !== undefined) rng.seed(seed);
    var gn = Math.round(Number(gridN));
    if (!isFinite(gn) || gn < 32 || gn > 128) gn = Z.N || N;
    return {
      version: 1,
      gridN: gn,
      mapSize: gn === 40 ? 'small' : gn === 72 ? 'large' : gn === 88 ? 'huge' : 'medium',
      money: 25000, loan: 0, day: 1, time: 0.3, speed: 1, ticketPrice: 8,
      rating: 1, reputation: 50, marketing: { active: false, daysLeft: 0 }, open: true,
      elev: new Int8Array((gn + 1) * (gn + 1)),
      map: { id: 'meadow', name: 'Grassland Sanctuary', i0: 0, j0: 0, i1: gn - 1, j1: gn - 1 },
      terrain: new Uint8Array(gn * gn), path: new Uint8Array(gn * gn),
      fenceX: new Uint8Array(gn * (gn + 1)), fenceZ: new Uint8Array((gn + 1) * gn),
      tileObj: new Int32Array(gn * gn), tileEnc: new Int16Array(gn * gn), dirt: new Uint8Array(gn * gn),
      coasterRail: new Uint8Array(gn * gn), coasterElev: new Int8Array(gn * gn), coasterSpec: new Uint8Array(gn * gn),
      coaster: { trains: [], nextTrain: 1, stats: { riders: 0, income: 0, boardings: 0, breakdowns: 0, maxExcitement: 0 } },
      objects: [], enclosures: [], animals: [], guests: [], staff: [],
      finance: { today: Z.emptyFinance(), history: [] },
      goals: {},
      stats: { guestsTotal: 0, babiesBorn: 0, escapes: 0, deaths: 0, births: 0, peakGuests: 0, donations: 0, injuries: 0, compensation: 0, ridesTaken: 0, arcadePlayed: 0 },
      unlocked: { star: 0 }, messages: [], nextId: 1,
      panic: 0,
      difficulty: 'normal',
      weather: { type: 'clear', intensity: 0.6, hoursLeft: 9, next: 'cloudy' },
      activeEvents: [],
      eventAt: 3,
      debtWarn: 0,
      boats: { vipT: 0, trips: 0, income: 0, vips: 0, vipIncome: 0 }
    };
  };
  Z.emptyFinance = function () {
    return { tickets: 0, food: 0, shops: 0, boats: 0, donations: 0, animals: 0, construction: 0, upkeep: 0, wages: 0, marketing: 0, other: 0 };
  };

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
