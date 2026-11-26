// ===== 40-world.js =====
window.Z = window.Z || {};
(function () {
'use strict';
var RENDER = Z.WorldRendererShared;

/* ======================================================================
   Z.World - three.js scene, camera, picking, overlays.  See CONTRACT.md.
   ====================================================================== */

var N = 56, T = 2, W = 112, D = {}, CH = 8, NCH = 7;
var SRGB = false; // linear output: matches how Z.Models colours were authored (plain hex colours)
var PI = Math.PI, TAU = PI * 2;

/* ---------------------------------------------------------------- utils */
function isFin(v) { return typeof v === 'number' && isFinite(v); }
function fin(v, fb) { return isFin(v) ? v : fb; }
function clamp(v, a, b) { if (!isFin(v)) return a; return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function h2(ix, iy) {
  var n = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function h3(a, b, c) { return h2(Math.imul(a | 0, 31) + (c | 0) * 7919, b | 0); }
function vnoise(x, y) {
  var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  var a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}
function fbm(x, y, o) {
  var s = 0, a = 0.5, f = 1, n = 0;
  for (var k = 0; k < o; k++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function rng32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hex3(h) {
  if (typeof h === 'string') h = parseInt(h.replace('#', ''), 16);
  if (!(h >= 0)) h = 0x888888;
  return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
}
function lin3(h) { var c = hex3(h); return SRGB ? [s2l(c[0]), s2l(c[1]), s2l(c[2])] : c; }
function tcol(h) { var l = lin3(h); return new THREE.Color().setRGB(l[0], l[1], l[2]); }
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mul3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function wrapPI(a) { if (!isFin(a)) return 0; a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/* --------------------------------------------------- merged geometry builder */
function MB() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; }
MB.prototype.vtx = function (x, y, z, nx, ny, nz, col, u, v) {
  var k = this.p.length / 3;
  this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); this.u.push(u || 0, v || 0);
  return k;
};
MB.prototype.tri = function (a, b, c) { this.i.push(a, b, c); };
// quad p0..p3 counter-clockwise seen from the normal side; uv maps p0->(u0,v0) p1->(u1,v0) p2->(u1,v1) p3->(u0,v1)
MB.prototype.quad = function (p0, p1, p2, p3, nx, ny, nz, col, u0, v0, u1, v1) {
  u0 = u0 || 0; v0 = v0 || 0; if (u1 === undefined) u1 = 1; if (v1 === undefined) v1 = 1;
  var a = this.vtx(p0[0], p0[1], p0[2], nx, ny, nz, col, u0, v0);
  var b = this.vtx(p1[0], p1[1], p1[2], nx, ny, nz, col, u1, v0);
  var c = this.vtx(p2[0], p2[1], p2[2], nx, ny, nz, col, u1, v1);
  var d = this.vtx(p3[0], p3[1], p3[2], nx, ny, nz, col, u0, v1);
  this.i.push(a, b, c, a, c, d);
};
var _q0 = [0, 0, 0], _q1 = [0, 0, 0], _q2 = [0, 0, 0], _q3 = [0, 0, 0];
function q4(a, b, c) { a[0] = b; a[1] = c; }
// axis aligned box; shade: darkens sides/bottom a bit for fake AO
MB.prototype.box = function (x0, y0, z0, x1, y1, z1, col, noBottom) {
  var c = col, cs = [col[0] * 0.86, col[1] * 0.86, col[2] * 0.86], cb = [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6];
  // top
  this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, c);
  // +z
  this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, cs);
  // -z
  this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, cs);
  // +x
  this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, cs);
  // -x
  this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, cs);
  if (!noBottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, cb);
};
// append a THREE geometry (flat shaded) with matrix and colour fn
var _m4 = null, _v3 = null;
MB.prototype.addGeo = function (geo, mat, col, vary) {
  var g = geo.index ? geo.toNonIndexed() : geo;
  var pa = g.attributes.position, cnt = pa.count;
  var nm = new THREE.Matrix3().getNormalMatrix(mat);
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (var t = 0; t < cnt; t += 3) {
    a.fromBufferAttribute(pa, t).applyMatrix4(mat);
    b.fromBufferAttribute(pa, t + 1).applyMatrix4(mat);
    c.fromBufferAttribute(pa, t + 2).applyMatrix4(mat);
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2).normalize();
    var k = vary ? vary(a, b, c, n) : 1, cc = [col[0] * k, col[1] * k, col[2] * k];
    var i0 = this.vtx(a.x, a.y, a.z, n.x, n.y, n.z, cc, 0, 0);
    var i1 = this.vtx(b.x, b.y, b.z, n.x, n.y, n.z, cc, 0, 0);
    var i2 = this.vtx(c.x, c.y, c.z, n.x, n.y, n.z, cc, 0, 0);
    this.i.push(i0, i1, i2);
  }
};
MB.prototype.addSmoothGeo = function (geo, mat, col, vary) {
  var g = geo.index ? geo.toNonIndexed() : geo;
  var pa = g.attributes.position, na = g.attributes.normal, cnt = pa.count;
  var nm = new THREE.Matrix3().getNormalMatrix(mat);
  var v = new THREE.Vector3(), n = new THREE.Vector3();
  for (var t = 0; t < cnt; t += 3) {
    var ids = [];
    for (var k = 0; k < 3; k++) {
      v.fromBufferAttribute(pa, t + k).applyMatrix4(mat);
      if (na) n.fromBufferAttribute(na, t + k).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
      var vk = vary ? vary(v, n) : clamp(0.90 + 0.12 * n.y, 0.78, 1.04);
      ids.push(this.vtx(v.x, v.y, v.z, n.x, n.y, n.z, [col[0] * vk, col[1] * vk, col[2] * vk], 0, 0));
    }
    this.i.push(ids[0], ids[1], ids[2]);
  }
};
MB.prototype.geometry = function () {
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2));
  var big = this.p.length / 3 > 65000;
  g.setIndex(new THREE.BufferAttribute(big ? new Uint32Array(this.i) : new Uint16Array(this.i), 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
};
MB.prototype.empty = function () { return this.i.length === 0; };

/* ------------------------------------------------------------- global state */
var G = { inited: false, t: 0, frameNo: 0, time: 0.5, daylight: 1, night: 0, sunE: 1, speed: 1, shadows: true, detail: 2, impostors: false };
var renderer, scene, camera, root;
var maxAniso = 4;
var TEX = {};
var MAT = {};

/* ------------------------------------------------------ shared textures */
function texFrom(c, rep, srgb) { return RENDER.canvasTexture(THREE, SRGB, maxAniso, c, rep, srgb); }
function makeSignTex() {
  var c = mkCanvas(512, 192), x = c.getContext('2d');
  var g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#2a7a4a'); g.addColorStop(1, '#17583a');
  x.fillStyle = g; x.fillRect(0, 0, 512, 192);
  x.strokeStyle = '#f3e3b0'; x.lineWidth = 9; x.strokeRect(11, 11, 490, 170);
  x.strokeStyle = '#d9a441'; x.lineWidth = 3; x.strokeRect(22, 22, 468, 148);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 34px Georgia, "Times New Roman", serif'; x.fillStyle = '#f3e3b0'; x.fillText('W I L D   A C R E S', 256, 48);
  x.font = 'bold 104px Georgia, "Times New Roman", serif';
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillText('ZOO', 260, 124);
  x.fillStyle = '#ffd35a'; x.fillText('ZOO', 256, 119);
  x.fillStyle = '#f3e3b0'; x.beginPath(); x.arc(70, 120, 7, 0, TAU); x.arc(442, 120, 7, 0, TAU); x.fill();
  return texFrom(c, false);
}

/* --------------------------------------------------------- atmosphere owner */
var ATM = null;
function createAtmosphere() {
  ATM = RENDER.createAtmosphere({ THREE: THREE, Z: Z, scene: scene, materials: MAT, graphics: G, clouds: clouds,
    srgb: SRGB, width: W, view: view, streetView: SV, camera: camera, rng32: rng32,
    fogRange: { near: 1.35, far: 3.8 } , onLightning: function () { if (Z.Audio && Z.Audio.play) Z.Audio.play('thunder'); else if (Z.Audio && Z.Audio.thunder) Z.Audio.thunder(); } });
  ATM.buildLighting();
}

function buildMaterials() {
  var white = new THREE.Color(1, 1, 1);
  var sharedTextures = RENDER.createWorldTextures({ THREE: THREE, srgb: SRGB, anisotropy: maxAniso, createCanvas: mkCanvas, rng32: rng32, tau: TAU }).build();
  TEX.grain = sharedTextures.grain; TEX.path = sharedTextures.path; TEX.chain = sharedTextures.chain; TEX.blob = sharedTextures.blob;
  TEX.glow = sharedTextures.glow; TEX.tile = sharedTextures.tile;
  MAT.terrain = new THREE.MeshLambertMaterial({ map: TEX.grain, vertexColors: true });
  MAT.outer = new THREE.MeshLambertMaterial({ map: TEX.grain, vertexColors: true });
  MAT.path = new THREE.MeshLambertMaterial({ map: TEX.path, vertexColors: true });
  MAT.solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.chain = new THREE.MeshLambertMaterial({ map: TEX.chain, vertexColors: true, transparent: true, depthWrite: false });
  MAT.chainRoof = new THREE.MeshLambertMaterial({ map: TEX.chain, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  MAT.glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false });
  MAT.glass.emissive = tcol('#3a5a66'); MAT.glass.emissiveIntensity = 0.5;
  MAT.shadow = new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.shadow.color = new THREE.Color(0x000000);
  MAT.chain.polygonOffset = false;
  MAT.chainRoof.polygonOffset = false;
}

function init(container) {
  if (G.inited) return;
  D = Z.DATA || {};
  N = Z.N || 56; T = Z.TILE || 2; W = N * T; NCH = Math.ceil(N / CH);
  DIST_MAX = Math.max(150, W * 1.4);
  cam.target.x = W / 2; cam.target.z = W * 0.7; cam.dist = clamp(W * 0.56, DIST_MIN, DIST_MAX);
  SV.x = W / 2; SV.z = W - 6;
  G.container = container || document.body;
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = SRGB ? THREE.sRGBEncoding : THREE.LinearEncoding;
  renderer.setClearColor(0x8fb6d8, 1);
  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = !!G.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
  var dom = renderer.domElement;
  dom.style.display = 'block'; dom.style.width = '100%'; dom.style.height = '100%'; dom.style.touchAction = 'none';
  dom.style.outline = 'none';
  dom.addEventListener('webglcontextlost', function (e) { e.preventDefault(); G.lost = true; }, false);
  dom.addEventListener('webglcontextrestored', function () { G.lost = false; if (renderer) resize(); }, false);
  G.container.appendChild(dom);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb8dcf5, 150, 430);
  camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1100);
  root = new THREE.Group(); scene.add(root);
  createAtmosphere();
  buildMaterials();
  ATM.buildSky();
  buildTerrain();
  buildOuter();
  buildSurroundings();
  buildPathsFences();
  buildObjectsSystem();
  buildEntitySystem();
  buildOverlays();
  buildBreakageFX();
  buildPreview();
  ATM.buildRain(rng32);
  buildCameraSystem();
  hookBus();
  G.inited = true;
  resetAll();
  resize();
  ATM.updateAtmosphere();
}

function resize() {
  if (!renderer) return;
  var c = G.container, w = (c && c.clientWidth) || window.innerWidth, h = (c && c.clientHeight) || window.innerHeight;
  w = Math.max(2, w); h = Math.max(2, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.prCap || 2));
  renderer.setSize(w, h, false);
  G.w = w; G.h = h;
  camera.aspect = w / h;
  G.baseFov = camera.fov = w / h < 0.8 ? 52 : (w / h < 1.2 ? 46 : 40);
  camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------- terrain */
var S2, TH, TE, tBase, WLT, WLV, tGeo, tPos, tNor, tCol, tUV, tMesh, TC = [], waterIdx = -1, lavaIdx = -1, terrDirty = null;
var AMP = {
  grass: 0.07, savannah: 0.06, dirt: 0.08, sand: 0.035, snow: 0.025,
  rainforest: 0.08, forest: 0.08, rock: 0.13, water: 0.03,
  enchanted: 0.07, misty_moor: 0.08, starlight_sand: 0.045, lava: 0.09
};
var WATER_Y = -0.1, DEPTH_MAX = 0.42;
var waterMesh = null, lavaMesh = null;
var ESTEP = 0.5, elevTouched = false;
var ROCK = null;
function mapB() {
  var s = Z.state, m = s && s.map;
  if (!m || typeof m.i0 !== 'number') return { i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
  return m;
}
function inMapT(i, j) { if (Z.Sim && typeof Z.Sim.inMap === 'function') return Z.Sim.inMap(i, j); var m = mapB(); return i >= m.i0 && i <= m.i1 && j >= m.j0 && j <= m.j1; }
function elevAt(i, j) {
  var s = Z.state, e = s && s.elev; if (!e) { if (Z.Sim && typeof Z.Sim.heightAt === 'function') return Z.Sim.heightAt(i * T, j * T) || 0; return 0; }
  i = i < 0 ? 0 : i > N ? N : i; j = j < 0 ? 0 : j > N ? N : j;
  return e[i + j * (N + 1)] * ESTEP;
}

function setupTerrainTables() {
  var td = (Z.DATA && Z.DATA.terrain) || D.terrain;
  var ts = (td && td.length) ? td : [{ id: 'grass', colour: '#6fae4a' }];
  TC = []; waterIdx = -1; lavaIdx = -1;
  ts.forEach(function (t, k) {
    var a = AMP[t.id];
    TC.push({ id: t.id, c: lin3(t.colour), amp: a === undefined ? 0.06 : a });
    if (t.id === 'water') waterIdx = k;
    else if (t.id === 'lava') lavaIdx = k;
  });
  if (waterIdx >= 0) TC[waterIdx].c = lin3('#4f7a72');
  if (lavaIdx >= 0) TC[lavaIdx].c = lin3('#36140c');
}
function buildTerrain() {
  if (tMesh) { root.remove(tMesh); tGeo.dispose(); tMesh = null; tGeo = null; }
  if (waterMesh) { root.remove(waterMesh); waterMesh.geometry.dispose(); waterMesh = null; }
  if (lavaMesh) { root.remove(lavaMesh); lavaMesh.geometry.dispose(); lavaMesh = null; }
  WLT = null; WLV = null; waterDirty = true; lavaDirty = true;
  setupTerrainTables();
  S2 = 2 * N + 1;
  var nv = S2 * S2;
  TH = new Float32Array(nv); TE = new Float32Array(nv); tBase = new Float32Array(nv * 3);
  ESTEP = Z.ELEV_STEP || 0.5; ROCK = lin3('#8f8674');
  tPos = new Float32Array(nv * 3); tNor = new Float32Array(nv * 3); tCol = new Float32Array(nv * 3); tUV = new Float32Array(nv * 2);
  var idx = new (nv > 65535 ? Uint32Array : Uint16Array)((S2 - 1) * (S2 - 1) * 6), p = 0;
  for (var b = 0; b < S2 - 1; b++) for (var a = 0; a < S2 - 1; a++) {
    var v = a + b * S2;
    idx[p++] = v; idx[p++] = v + S2; idx[p++] = v + 1;
    idx[p++] = v + 1; idx[p++] = v + S2; idx[p++] = v + S2 + 1;
  }
  tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('normal', new THREE.BufferAttribute(tNor, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('uv', new THREE.BufferAttribute(tUV, 2));
  tGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  tGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(W / 2, 1.5, W / 2), W);
  tGeo.boundingBox = new THREE.Box3(new THREE.Vector3(0, -3, 0), new THREE.Vector3(W, 8, W));
  tMesh = new THREE.Mesh(tGeo, MAT.terrain);
  tMesh.frustumCulled = false;
  tMesh.receiveShadow = true;
  root.add(tMesh);
  for (b = 0; b < S2; b++) for (a = 0; a < S2; a++) {
    var q = a + b * S2;
    tUV[q * 2] = a * T * 0.5 / 9; tUV[q * 2 + 1] = b * T * 0.5 / 9;
    tPos[q * 3] = a * T * 0.5; tPos[q * 3 + 2] = b * T * 0.5; tNor[q * 3 + 1] = 1;
  }
}
function calcVertex(a, b) {
  var s = Z.state, ter = s && s.terrain, v = a + b * S2;
  var x = a * T * 0.5, z = b * T * 0.5;
  var i0, i1, j0, j1;
  if (a & 1) { i0 = i1 = (a - 1) >> 1; } else { i0 = (a >> 1) - 1; i1 = a >> 1; }
  if (b & 1) { j0 = j1 = (b - 1) >> 1; } else { j0 = (b >> 1) - 1; j1 = b >> 1; }
  var r = 0, g = 0, bl = 0, ws = 0, wat = 0, amp = 0, outW = 0, enchW = 0, moorW = 0, starW = 0, lavaW = 0, mp = mapB();
  for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    var tid = ter ? ter[i + j * N] : 0, tc = TC[tid] || TC[0];
    var w = 0.7 + 0.6 * h2(i * 7 + a, j * 13 + b);
    r += tc.c[0] * w; g += tc.c[1] * w; bl += tc.c[2] * w; ws += w; amp += tc.amp * w;
    if (tid === waterIdx) wat += w;
    if (tc.id === 'enchanted') enchW += w;
    else if (tc.id === 'misty_moor') moorW += w;
    else if (tc.id === 'starlight_sand') starW += w;
    else if (tc.id === 'lava') lavaW += w;
    if (i < mp.i0 || i > mp.i1 || j < mp.j0 || j > mp.j1) outW += w;
  }
  if (ws === 0) { var tc0 = TC[0]; r = tc0.c[0]; g = tc0.c[1]; bl = tc0.c[2]; ws = 1; amp = tc0.amp; }
  r /= ws; g /= ws; bl /= ws; amp /= ws;
  var fr = wat / ws;
  // elevation: bilinear over tile corners (even a,b sit exactly on corners)
  var ia = a >> 1, ib = b >> 1, fa = (a & 1) ? 0.5 : 0, fb = (b & 1) ? 0.5 : 0, el;
  if (fa === 0 && fb === 0) el = elevAt(ia, ib);
  else el = (elevAt(ia, ib) * (1 - fa) + elevAt(ia + 1, ib) * fa) * (1 - fb) + (elevAt(ia, ib + 1) * (1 - fa) + elevAt(ia + 1, ib + 1) * fa) * fb;
  var hgt = el - DEPTH_MAX * sstep(0.3, 0.9, fr);
  if (fr > 0.05 && fr < 0.95) {
    var wet = sstep(0.08, 0.5, fr) * (1 - 0.5 * sstep(0.7, 1.0, fr));
    r = lerp(r, 0.36, wet * 0.28); g = lerp(g, 0.33, wet * 0.28); bl = lerp(bl, 0.26, wet * 0.28);
  }
  var n1 = fbm(x * 0.11 + 3.1, z * 0.11 + 9.7, 3) - 0.5, n2 = h2(a * 3 + 1, b * 7 + 5) - 0.5, n3 = fbm(x * 0.45, z * 0.45, 2) - 0.5;
  var m = 1 + amp * (n1 * 2.2 + n2 * 0.9 + n3 * 1.2);
  var hue = 1 + amp * n1 * 0.9;
  r = r * m * (2 - hue); g = g * m * hue; bl = bl * m;
  // subtle magical vertex color variation for fantasy terrain types
  if (enchW > 0) {
    var ew = enchW / ws, esh = fbm(x * 0.22 + 5.3, z * 0.22 + 2.7, 2), esp = h2(a * 11 + 3, b * 17 + 7);
    var elav = sstep(0.56, 0.85, esh), emnt = sstep(0.44, 0.15, esh);
    r = lerp(r, lerp(lerp(r, 0.38, emnt * 0.35), 0.72, elav * 0.28), ew);
    g = lerp(g, lerp(lerp(g, 0.90, emnt * 0.28), 0.58, elav * 0.22), ew);
    bl = lerp(bl, lerp(lerp(bl, 0.65, emnt * 0.25), 0.92, elav * 0.36), ew);
    if (esp > 0.91) { var eg = (esp - 0.91) * 3.0 * ew; r = lerp(r, 0.88, eg); g = lerp(g, 0.98, eg); bl = lerp(bl, 0.95, eg); }
  }
  if (moorW > 0) {
    var mw = moorW / ws, mh = fbm(x * 0.16 + 11.1, z * 0.16 + 7.4, 3), ms = fbm(x * 0.42 + 1.3, z * 0.42 + 4.9, 2);
    var mheather = sstep(0.55, 0.82, mh), mmoss = sstep(0.52, 0.82, ms) * (1 - mheather * 0.6);
    r = lerp(r, lerp(lerp(r, 0.29, mmoss * 0.36), 0.47, mheather * 0.34), mw);
    g = lerp(g, lerp(lerp(g, 0.44, mmoss * 0.36), 0.36, mheather * 0.25), mw);
    bl = lerp(bl, lerp(lerp(bl, 0.35, mmoss * 0.28), 0.52, mheather * 0.38), mw);
  }
  if (starW > 0) {
    var sw = starW / ws, sf = fbm(x * 0.18 + 1.9, z * 0.18 + 8.3, 2), st = h2(a * 19 + 7, b * 23 + 11);
    var srose = sstep(0.54, 0.85, sf);
    r = lerp(r, lerp(r * 0.96, 0.92, srose * 0.32), sw);
    g = lerp(g, lerp(g * 0.95, 0.78, srose * 0.25), sw);
    bl = lerp(bl, lerp(bl * 1.03, 0.97, srose * 0.28), sw);
    if (st > 0.89) { var sg = (st - 0.89) * 3.5 * sw; r = lerp(r, 0.99, sg); g = lerp(g, 0.89, sg); bl = lerp(bl, 0.62, sg); }
  }
  if (lavaW > 0) {
    var lw = lavaW / ws, lf = fbm(x * 0.28 + 3.7, z * 0.28 + 6.1, 3), lv = Math.abs(fbm(x * 0.48 + 9.2, z * 0.48 + 1.4, 2) - 0.5);
    var vein = 1 - sstep(0.03, 0.22, lv), hot = sstep(0.58, 0.86, lf) * 0.6 + vein * 0.85;
    var lr = lerp(0.11, 0.98, clamp(hot, 0, 1)), lg = lerp(0.04, 0.36, clamp(hot, 0, 1)), lb = lerp(0.03, 0.04, clamp(hot, 0, 1));
    if (hot > 0.75) { var core = (hot - 0.75) * 2.6; lr = lerp(lr, 1.0, core); lg = lerp(lg, 0.76, core); lb = lerp(lb, 0.14, core); }
    r = lerp(r, lr, lw); g = lerp(g, lg, lw); bl = lerp(bl, lb, lw);
  }
  if (outW > 0) {
    // land the player does not own: duller, darker, wilder
    var o = outW / ws, lum = 0.3 * r + 0.59 * g + 0.11 * bl;
    var wr = lum * 0.74 + 0.01, wg = lum * 0.88 + 0.02, wb = lum * 0.58;
    r = lerp(r, wr * 0.82, 0.78 * o); g = lerp(g, wg * 0.82, 0.78 * o); bl = lerp(bl, wb * 0.82, 0.78 * o);
  }
  tBase[v * 3] = r; tBase[v * 3 + 1] = g; tBase[v * 3 + 2] = bl;
  tCol[v * 3] = r; tCol[v * 3 + 1] = g; tCol[v * 3 + 2] = bl;
  TE[v] = el; TH[v] = hgt;
  tPos[v * 3] = x; tPos[v * 3 + 1] = hgt; tPos[v * 3 + 2] = z;
}
function calcNormals(a0, a1, b0, b1) {
  var hs = T * 0.5;
  for (var b = b0; b <= b1; b++) for (var a = a0; a <= a1; a++) {
    var v = a + b * S2;
    var aE = Math.min(S2 - 1, a + 1), aW = Math.max(0, a - 1), bS = Math.min(S2 - 1, b + 1), bN = Math.max(0, b - 1);
    var hx = (TH[aE + b * S2] - TH[aW + b * S2]) / ((aE - aW) * hs);
    var hz = (TH[a + bS * S2] - TH[a + bN * S2]) / ((bS - bN) * hs);
    var l = Math.sqrt(hx * hx + 1 + hz * hz), ny = 1 / l;
    tNor[v * 3] = -hx / l; tNor[v * 3 + 1] = ny; tNor[v * 3 + 2] = -hz / l;
    // slope shading: steep faces read as exposed rock/earth; dips darker, crests lighter
    var cr = TH[v] - 0.25 * (TH[aE + b * S2] + TH[aW + b * S2] + TH[a + bS * S2] + TH[a + bN * S2]);
    var k = 1 + clamp(cr * 0.45, -0.14, 0.1);
    var rt = sstep(0.0, 1.0, clamp((0.965 - ny) / 0.13, 0, 1));
    if (Z.Sim && typeof Z.Sim.isCliff === 'function') { var ti = Math.min(N - 1, a >> 1), tj = Math.min(N - 1, b >> 1); if (Z.Sim.isCliff(ti, tj) || (ti > 0 && Z.Sim.isCliff(ti - 1, tj)) || (tj > 0 && Z.Sim.isCliff(ti, tj - 1))) rt = Math.max(rt, 0.88); }
    var br = tBase[v * 3] * k, bg = tBase[v * 3 + 1] * k, bb = tBase[v * 3 + 2] * k;
    if (rt > 0.001) {
      var st = 0.82 + 0.3 * (0.5 + 0.5 * Math.sin(TH[v] * 13 + h2(a, b) * 1.2)) + 0.1 * (h2(a * 5 + 3, b * 11 + 1) - 0.5);
      br = lerp(br, ROCK[0] * st, rt * 0.92); bg = lerp(bg, ROCK[1] * st, rt * 0.92); bb = lerp(bb, ROCK[2] * st, rt * 0.92);
    }
    tCol[v * 3] = br; tCol[v * 3 + 1] = bg; tCol[v * 3 + 2] = bb;
  }
}
function terrainRange(i0, j0, i1, j1) {
  var a0 = clamp(2 * i0, 0, S2 - 1), a1 = clamp(2 * i1 + 2, 0, S2 - 1), b0 = clamp(2 * j0, 0, S2 - 1), b1 = clamp(2 * j1 + 2, 0, S2 - 1);
  for (var b = b0; b <= b1; b++) for (var a = a0; a <= a1; a++) calcVertex(a, b);
  calcNormals(Math.max(0, a0 - 1), Math.min(S2 - 1, a1 + 1), Math.max(0, b0 - 1), Math.min(S2 - 1, b1 + 1));
  var rb0 = Math.max(0, b0 - 1), rb1 = Math.min(S2 - 1, b1 + 1);
  var off = rb0 * S2 * 3, cnt = (rb1 - rb0 + 1) * S2 * 3;
  var at = tGeo.attributes;
  ['position', 'normal', 'color'].forEach(function (k) {
    at[k].updateRange.offset = off; at[k].updateRange.count = cnt; at[k].needsUpdate = true;
  });
  waterDirty = true;
  lavaDirty = true;
  var full = i0 <= 0 && j0 <= 0 && i1 >= N - 1 && j1 >= N - 1;
  if (typeof outerSig !== 'undefined') {
    if (full || i0 <= 0 || j0 <= 0 || i1 >= N - 1 || j1 >= N - 1) refreshOuter();
    if (full) { rebuildWild(); rebuildWall(); }
    else if (wallNear(i0, j0, i1, j1)) rebuildWall();
  }
  if (elevTouched || full) { elevTouched = false; reseatWorld(); }
}
var waterDirty = false;
function rebuildWater() {
  waterDirty = false;
  var ter = Z.state && Z.state.terrain, any = false;
  if (!WLT || WLT.length !== N * N) WLT = new Float32Array(N * N);
  WLT.fill(-99);
  if (ter && waterIdx >= 0) for (var k = 0; k < ter.length; k++) if (ter[k] === waterIdx) { any = true; break; }
  if (waterMesh) { root.remove(waterMesh); waterMesh.geometry.dispose(); waterMesh = null; }
  if (!any) return;
  // connected (8-way) water bodies; each gets one surface level = its lowest tile corner + WATER_Y
  var lab = new Int16Array(N * N).fill(-1), stack = [], nb = 0, i, j, q, di, dj;
  if (!WLV || WLV.length !== S2 * S2) WLV = new Float32Array(S2 * S2);
  WLV.fill(1e9);
  for (q = 0; q < N * N; q++) {
    if (ter[q] !== waterIdx || lab[q] >= 0) continue;
    var tiles = [], mn = 1e9;
    lab[q] = nb; stack.push(q);
    while (stack.length) {
      var t = stack.pop(); tiles.push(t);
      i = t % N; j = (t / N) | 0;
      var c0 = Math.min(Math.min(elevAt(i, j), elevAt(i + 1, j)), Math.min(elevAt(i, j + 1), elevAt(i + 1, j + 1)));
      if (c0 < mn) mn = c0;
      for (dj = -1; dj <= 1; dj++) for (di = -1; di <= 1; di++) {
        var ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        var nq = ni + nj * N; if (ter[nq] === waterIdx && lab[nq] < 0) { lab[nq] = nb; stack.push(nq); }
      }
    }
    var lvl = mn + WATER_Y;
    for (var tt = 0; tt < tiles.length; tt++) {
      var ti = tiles[tt] % N, tj = (tiles[tt] / N) | 0;
      WLT[tiles[tt]] = lvl;
      for (var bb = Math.max(0, 2 * tj - 1); bb <= Math.min(S2 - 1, 2 * tj + 3); bb++) for (var aa = Math.max(0, 2 * ti - 1); aa <= Math.min(S2 - 1, 2 * ti + 3); aa++) {
        var vq = aa + bb * S2; if (lvl < WLV[vq]) WLV[vq] = lvl;
      }
    }
    nb++;
  }
  var vmap = new Int32Array(S2 * S2).fill(-1), pos = [], dep = [], idx = [];
  function gv(a, b) {
    var q = a + b * S2, m = vmap[q];
    if (m < 0) { m = pos.length / 3; vmap[q] = m; pos.push(a * T * 0.5, WLV[q], b * T * 0.5); dep.push(Math.max(0, WLV[q] - TH[q])); }
    return m;
  }
  for (var b = 0; b < S2 - 1; b++) for (var a = 0; a < S2 - 1; a++) {
    q = a + b * S2;
    var l0 = WLV[q], l1 = WLV[q + 1], l2 = WLV[q + S2], l3 = WLV[q + S2 + 1];
    if (l0 > 1e8 || l1 > 1e8 || l2 > 1e8 || l3 > 1e8) continue;
    if (TH[q] < l0 || TH[q + 1] < l1 || TH[q + S2] < l2 || TH[q + S2 + 1] < l3) {
      var v0 = gv(a, b), v1 = gv(a + 1, b), v2 = gv(a, b + 1), v3 = gv(a + 1, b + 1);
      idx.push(v0, v2, v1, v1, v2, v3);
    }
  }
  if (!idx.length) return;
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(dep), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  if (!MAT.water) {
    MAT.water = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uLight: { value: 1 }, uSky: { value: new THREE.Color(0.6, 0.8, 1) },
        uDeep: { value: tcol('#1f6a8c') }, uShallow: { value: tcol('#58b6c0') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunI: { value: 1 }
      }]),
      vertexShader: [
        'attribute float aDepth; varying float vDepth; varying vec3 vW; uniform float uTime;',
        '#include <fog_pars_vertex>',
        'void main(){ vDepth = aDepth; vec4 wp = modelMatrix*vec4(position,1.0);',
        ' wp.y += (sin(wp.x*1.9+uTime*1.4)+cos(wp.z*2.3+uTime*1.1))*0.012*smoothstep(0.0,0.2,aDepth);',
        ' vW = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;',
        ' #include <fog_vertex>',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime; uniform float uLight; uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI;',
        'varying float vDepth; varying vec3 vW;',
        '#include <fog_pars_fragment>',
        'void main(){',
        ' vec3 V = normalize(cameraPosition - vW); float t = uTime; vec2 p = vW.xz;',
        ' float dx = cos(p.x*1.7+t*1.3)*0.5 + cos((p.x+p.y)*2.9-t*1.9)*0.35 + cos(p.y*4.1+t*2.3)*0.15;',
        ' float dz = cos(p.y*1.5-t*1.1)*0.5 + cos((p.x-p.y)*3.3+t*1.7)*0.35 + cos(p.x*3.7-t*2.0)*0.15;',
        ' vec3 n = normalize(vec3(-dx*0.14,1.0,-dz*0.14));',
        ' float fres = pow(1.0-max(dot(n,V),0.0),3.0);',
        ' vec3 col = mix(uShallow,uDeep,smoothstep(0.0,0.42,vDepth));',
        ' col = mix(col,uSky,clamp(0.10+fres*0.8,0.0,1.0));',
        ' vec3 R = reflect(-V,n); float sp = pow(max(dot(R,uSunDir),0.0),80.0)*uSunI;',
        ' float w1 = sin(p.x*2.3+sin(p.y*1.7+t*0.7)*1.6+t*0.6)*sin(p.y*2.1+sin(p.x*1.9-t*0.5)*1.6); float glint = smoothstep(0.55,1.0,w1)*0.09;',
        ' col *= uLight; col += uSunCol*sp + vec3(glint)*uLight;',
        ' float foam = smoothstep(0.0,0.012,vDepth)*(1.0-smoothstep(0.012,0.07,vDepth));',
        ' col += vec3(0.55,0.62,0.6)*foam*uLight*(0.6+0.4*sin(p.x*5.0+t*2.0));',
        ' float a = smoothstep(0.0,0.10,vDepth)*0.84; a = max(a, max(sp*0.6, foam*0.55));',
        ' gl_FragColor = vec4(col,a);',
        ' #include <encodings_fragment>',
        ' #include <fog_fragment>',
        '}'
      ].join('\n')
    });
  }
  waterMesh = new THREE.Mesh(g, MAT.water);
  waterMesh.renderOrder = 2; waterMesh.frustumCulled = false;
  root.add(waterMesh);
}
var lavaDirty = false;
function rebuildLava() {
  lavaDirty = false;
  var ter = Z.state && Z.state.terrain, any = false;
  if (ter && lavaIdx >= 0) for (var k = 0; k < ter.length; k++) if (ter[k] === lavaIdx) { any = true; break; }
  if (lavaMesh) { root.remove(lavaMesh); lavaMesh.geometry.dispose(); lavaMesh = null; }
  if (!any) return;
  var lv = new Float32Array(S2 * S2);
  for (var b = 0; b < S2; b++) for (var a = 0; a < S2; a++) {
    var i0 = (a & 1) ? ((a - 1) >> 1) : ((a >> 1) - 1), i1 = (a & 1) ? i0 : (a >> 1);
    var j0 = (b & 1) ? ((b - 1) >> 1) : ((b >> 1) - 1), j1 = (b & 1) ? j0 : (b >> 1);
    var cnt = 0, hits = 0;
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      cnt++; if (ter[i + j * N] === lavaIdx) hits++;
    }
    lv[a + b * S2] = cnt ? hits / cnt : 0;
  }
  var vmap = new Int32Array(S2 * S2).fill(-1), pos = [], wgt = [], idx = [];
  function gl(a, b) {
    var q = a + b * S2, m = vmap[q];
    if (m < 0) { m = pos.length / 3; vmap[q] = m; pos.push(a * T * 0.5, TH[q] + 0.028, b * T * 0.5); wgt.push(lv[q]); }
    return m;
  }
  for (b = 0; b < S2 - 1; b++) for (a = 0; a < S2 - 1; a++) {
    var q = a + b * S2;
    if (lv[q] <= 0 && lv[q + 1] <= 0 && lv[q + S2] <= 0 && lv[q + S2 + 1] <= 0) continue;
    var v0 = gl(a, b), v1 = gl(a + 1, b), v2 = gl(a, b + 1), v3 = gl(a + 1, b + 1);
    idx.push(v0, v2, v1, v1, v2, v3);
  }
  if (!idx.length) return;
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aLava', new THREE.BufferAttribute(new Float32Array(wgt), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  if (!MAT.lava) {
    MAT.lava = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: [
        'attribute float aLava; varying float vLava; varying vec3 vW; uniform float uTime;',
        '#include <fog_pars_vertex>',
        'void main(){ vLava = aLava; vec4 wp = modelMatrix*vec4(position,1.0);',
        ' wp.y += (sin(wp.x*1.6+uTime*1.3)+cos(wp.z*1.9-uTime*1.1))*0.015*aLava;',
        ' vW = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;',
        ' #include <fog_vertex>',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime; varying float vLava; varying vec3 vW;',
        '#include <fog_pars_fragment>',
        'void main(){',
        ' vec2 p = vW.xz; float t = uTime * 0.7;',
        ' float w1 = sin(p.x*1.3 + t + sin(p.y*1.1 - t*0.8)*1.5);',
        ' float w2 = cos(p.y*1.5 - t*0.9 + cos(p.x*1.4 + t*0.7)*1.4);',
        ' float w3 = sin((p.x+p.y)*2.4 - t*1.4) * cos((p.x-p.y)*2.1 + t*1.2);',
        ' float f = 0.5 + 0.25*w1 + 0.17*w2 + 0.14*w3;',
        ' float cracks = smoothstep(0.32, 0.78, f);',
        ' float core = smoothstep(0.66, 0.96, f);',
        ' vec3 crust = vec3(0.11, 0.03, 0.02);',
        ' vec3 magma = vec3(0.98, 0.26, 0.02);',
        ' vec3 glow = vec3(1.0, 0.84, 0.20);',
        ' vec3 col = mix(crust, magma, cracks); col = mix(col, glow, core);',
        ' float pulse = 0.92 + 0.08 * sin(uTime*3.2 + p.x*0.9 + p.y*0.7);',
        ' col *= pulse;',
        ' float alpha = smoothstep(0.05, 0.55, vLava) * (0.78 + 0.20 * cracks);',
        ' gl_FragColor = vec4(col, alpha);',
        ' #include <encodings_fragment>',
        ' #include <fog_fragment>',
        '}'
      ].join('\n')
    });
  }
  lavaMesh = new THREE.Mesh(g, MAT.lava);
  lavaMesh.renderOrder = 2; lavaMesh.frustumCulled = false;
  root.add(lavaMesh);
}
function groundY(x, z) {
  if (!TH) { if (Z.Sim && typeof Z.Sim.heightAt === 'function') return Z.Sim.heightAt(x, z) || 0; return 0; }
  var hs = T * 0.5, fx = x / hs, fz = z / hs, mx = S2 - 1.00001;
  fx = fx < 0 ? 0 : fx > mx ? mx : fx; fz = fz < 0 ? 0 : fz > mx ? mx : fz;
  var a = fx | 0, b = fz | 0, u = fx - a, w = fz - b, v = a + b * S2;
  // matches the mesh triangulation (diagonal from (a+1,b) to (a,b+1))
  if (u + w <= 1) return TH[v] + u * (TH[v + 1] - TH[v]) + w * (TH[v + S2] - TH[v]);
  var h11 = TH[v + S2 + 1];
  return h11 + (1 - u) * (TH[v + S2] - h11) + (1 - w) * (TH[v + 1] - h11);
}
// water surface level at a world position (or -99 when the tile has no water)
function waterLvlAt(x, z) {
  if (!WLT) return -99;
  var i = (x / T) | 0, j = (z / T) | 0;
  if (x < 0 || z < 0 || i >= N || j >= N) return -99;
  return WLT[i + j * N];
}
// Piers may overhang water: when a footprint mixes water and land, only corners of the dry tiles count.
function footWet(i, j, w, h) {
  var ter = Z.state && Z.state.terrain; if (!ter || waterIdx < 0) return null;
  var wet = [], any = false, dry = false;
  for (var b = 0; b < h; b++) for (var a = 0; a < w; a++) {
    var x = i + a, y = j + b, v = x >= 0 && y >= 0 && x < N && y < N && ter[x + y * N] === waterIdx;
    wet[a + b * w] = v; if (v) any = true; else dry = true;
  }
  return any && dry ? wet : null;
}
function footCorners(i, j, w, h, fn) {
  var wet = footWet(i, j, w, h);
  for (var b = 0; b <= h; b++) for (var a = 0; a <= w; a++) {
    if (wet) {
      var near = false;
      for (var db = -1; db <= 0 && !near; db++) for (var da = -1; da <= 0; da++) {
        var ta = a + da, tb = b + db;
        if (ta >= 0 && tb >= 0 && ta < w && tb < h && !wet[ta + tb * w]) { near = true; break; }
      }
      if (!near) continue;
    }
    fn(groundY((i + a) * T, (j + b) * T));
  }
}
// highest ground over a tile footprint's corners (buildings stand on the plateau)
function footBase(i, j, w, h) {
  var m = -99;
  footCorners(i, j, w, h, function (y) { if (y > m) m = y; });
  return m;
}
function footLow(i, j, w, h) {
  var m = 99;
  footCorners(i, j, w, h, function (y) { if (y < m) m = y; });
  return m;
}

/* ------------------------------------------------- outside the zoo boundary */
var RING_D = [0, 1.5, 4, 8, 14, 22, 32, 45, 60, 80, 105, 135, 170, 210, 255, 310];
var outerMesh;
function outerH(x, z) {
  var dx = Math.max(-x, 0, x - W), dz = Math.max(-z, 0, z - W), d = Math.sqrt(dx * dx + dz * dz);
  var hill = sstep(30, 135, d);
  var n = fbm(x * 0.011 + 13.7, z * 0.011 + 4.2, 4);
  var ridge = 1 - Math.abs(fbm(x * 0.02 + 50, z * 0.02 + 80, 3) * 2 - 1);
  var h = hill * (5 + n * 46 + ridge * 16) + (n - 0.5) * 2.5 * sstep(6, 50, d);
  if (z > W - 4) {
    var c = sstep(16, 100, Math.abs(x - W / 2)); c = Math.max(c, sstep(130, 240, z - W));
    h *= lerp(0.03, 1, c);
  }
  if (d < 30) {
    // blend from the playable grid's border elevation into the surroundings
    var ex = clamp(x, 0, W) / T, ez = clamp(z, 0, W) / T, ei = Math.min(N - 1, ex | 0), ej = Math.min(N - 1, ez | 0), fu = ex - ei, fv = ez - ej;
    var eb = (elevAt(ei, ej) * (1 - fu) + elevAt(ei + 1, ej) * fu) * (1 - fv) + (elevAt(ei, ej + 1) * (1 - fu) + elevAt(ei + 1, ej + 1) * fu) * fv;
    h += eb * (1 - sstep(0, 30, d));
  }
  return h;
}
function calcOuterSig() {
  var e = Z.state && Z.state.elev, mp = mapB(), sg = (mp.i0 * 7 + mp.j0 * 13 + mp.i1 * 17 + mp.j1 * 19) | 0;
  if (!e) return sg;
  for (var k = 0; k <= N; k++) {
    sg = (sg * 31 + e[k] + 17) | 0; sg = (sg * 31 + e[k + N * (N + 1)] + 17) | 0;
    sg = (sg * 31 + e[k * (N + 1)] + 17) | 0; sg = (sg * 31 + e[N + k * (N + 1)] + 17) | 0;
  }
  return sg;
}
var outerSig = null, forestGeo = null, forestObjs = [], wildObjs = [], wallMesh = null, gateGrp = null, roadMesh = null;
function refreshOuter() {
  var sg = calcOuterSig();
  if (sg === outerSig) return;
  buildOuter();
}
function buildOuter() {
  if (outerMesh) { root.remove(outerMesh); outerMesh.geometry.dispose(); outerMesh = null; }
  forestObjs.forEach(function (m) { root.remove(m); m.dispose && m.dispose(); }); forestObjs.length = 0;
  outerSig = calcOuterSig();
  var M = Math.max(56, N), rings = RING_D.length, pos = [], col = [], uv = [], nor = [], idx = [];
  var gc = lin3((D.terrain && D.terrain[0] && D.terrain[0].colour) || '#6fae4a');
  var far = lin3('#4d8a3a'), forest = lin3('#356a30'), rock = lin3('#85827a'), dry = lin3('#7f9a46');
  for (var r = 0; r < rings; r++) {
    var d = RING_D[r];
    var x0 = -d, z0 = -d, x1 = W + d, z1 = W + d;
    for (var s = 0; s < 4 * M; s++) {
      var side = Math.floor(s / M), f = (s % M) / M, x, z;
      if (side === 0) { x = lerp(x0, x1, f); z = z0; }
      else if (side === 1) { x = x1; z = lerp(z0, z1, f); }
      else if (side === 2) { x = lerp(x1, x0, f); z = z1; }
      else { x = x0; z = lerp(z1, z0, f); }
      var h = outerH(x, z);
      var t = sstep(8, 100, d);
      var c = mix3(gc, far, t);
      c = mix3(c, dry, sstep(0.3, 0.7, fbm(x * 0.03, z * 0.03, 2)) * 0.35 * t);
      c = mix3(c, forest, sstep(6, 36, h) * 0.75);
      c = mix3(c, rock, sstep(36, 58, h) * 0.65);
      if (!inMapT(clamp(Math.floor(x / T), 0, N - 1), clamp(Math.floor(z / T), 0, N - 1))) {
        // continue the "land you do not own" tint of the playable grid's wild margin
        var ow = 0.78 * (1 - 0.6 * sstep(15, 150, d)), lm = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
        c = mix3(c, [(lm * 0.74 + 0.01) * 0.82, (lm * 0.88 + 0.02) * 0.82, lm * 0.58 * 0.82], ow);
      }
      var nn = 1 + (fbm(x * 0.09, z * 0.09, 2) - 0.5) * 0.35 + (h2(Math.round(x), Math.round(z)) - 0.5) * 0.07;
      pos.push(x, h - 0.02, z); col.push(c[0] * nn * 1.08, c[1] * nn * 1.08, c[2] * nn * 1.08);
      uv.push(x / 9, z / 9);
      var e = 3, hx = outerH(x + e, z) - outerH(x - e, z), hz = outerH(x, z + e) - outerH(x, z - e);
      var l = Math.sqrt(hx * hx / (4 * e * e) + 1 + hz * hz / (4 * e * e));
      nor.push(-hx / (2 * e) / l, 1 / l, -hz / (2 * e) / l);
    }
  }
  for (r = 0; r < rings - 1; r++) for (s = 0; s < 4 * M; s++) {
    var a = r * 4 * M + s, b = r * 4 * M + (s + 1) % (4 * M), c2 = (r + 1) * 4 * M + s, d2 = (r + 1) * 4 * M + (s + 1) % (4 * M);
    idx.push(a, b, c2, b, d2, c2);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(W / 2, 0, W / 2), W + 380);
  outerMesh = new THREE.Mesh(g, MAT.outer);
  outerMesh.frustumCulled = false;
  root.add(outerMesh);
  buildForest();
}
function buildForest() {
  var pb = new MB(), rb = new MB(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  var needGeo = !forestGeo;
  var trunk = lin3('#5b3f28'), leaf1 = lin3('#2f6a35'), leaf2 = lin3('#3f8a3c'), leaf3 = lin3('#25582f');
  function M4(x, y, z, sx, sy, sz) { return m.compose(ps.set(x, y, z), q.set(0, 0, 0, 1), sc.set(sx, sy, sz)).clone(); }
  var vary = function (a, b, c, n) { return 0.82 + 0.3 * Math.max(0, n.y) + 0.06 * (h2(Math.round(a.x * 9), Math.round(a.y * 9 + a.z * 7)) - 0.5); };
  pb.addGeo(new THREE.CylinderGeometry(0.22, 0.34, 1.6, 5), M4(0, 0.8, 0, 1, 1, 1), trunk);
  pb.addGeo(new THREE.ConeGeometry(1.9, 3.0, 7), M4(0, 2.2, 0, 1, 1, 1), leaf3, vary);
  pb.addGeo(new THREE.ConeGeometry(1.5, 2.7, 7), M4(0, 3.7, 0, 1, 1, 1), leaf1, vary);
  pb.addGeo(new THREE.ConeGeometry(1.0, 2.3, 7), M4(0, 5.1, 0, 1, 1, 1), leaf3, vary);
  rb.addGeo(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5), M4(0, 1.1, 0, 1, 1, 1), trunk);
  rb.addGeo(new THREE.IcosahedronGeometry(1.9, 1), M4(0, 3.5, 0, 1, 0.9, 1), leaf2, vary);
  rb.addGeo(new THREE.IcosahedronGeometry(1.3, 1), M4(1.0, 2.8, 0.5, 1, 0.9, 1), leaf1, vary);
  rb.addGeo(new THREE.IcosahedronGeometry(1.2, 1), M4(-0.9, 3.0, -0.6, 1, 0.9, 1), leaf2, vary);
  var NT = Math.round(760 * Math.max(1, W / 112)), rnd = rng32(777), pines = [], rounds = [];
  var tries = 0;
  while (pines.length + rounds.length < NT && tries++ < 6000) {
    var x = -330 + rnd() * (W + 660), z = -330 + rnd() * (W + 660);
    var dx = Math.max(-x, 0, x - W), dz = Math.max(-z, 0, z - W), d = Math.sqrt(dx * dx + dz * dz);
    if (d < 5 || d > 320) continue;
    if (z > W - 2 && Math.abs(x - W / 2) < 16) continue;
    var fo = fbm(x * 0.022 + 5, z * 0.022 + 9, 3);
    var p = (fo - 0.40) * 3.2 + (d < 60 ? 0.22 : 0) + sstep(100, 300, d) * 0.2;
    if (rnd() > p) continue;
    var h = outerH(x, z), hf = h > 34 ? 0 : 1;
    if (!hf && rnd() < 0.7) continue;
    var s = (0.9 + rnd() * 0.9) * (1 + d / 260);
    var rec = { x: x, y: h - 0.05, z: z, s: s, r: rnd() * TAU, k: 0.85 + rnd() * 0.3, k2: 0.9 + rnd() * 0.2 };
    (h > 14 || rnd() < 0.55 ? pines : rounds).push(rec);
  }
  function inst(geo, list, mat) {
    var im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    var mm = new THREE.Matrix4(), cc = new THREE.Color();
    for (var k = 0; k < list.length; k++) {
      var t = list[k];
      mm.compose(ps.set(t.x, t.y, t.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r), sc.set(t.s, t.s * (0.9 + t.k2 * 0.2), t.s));
      im.setMatrixAt(k, mm);
      cc.setRGB(t.k * 1.0, t.k * t.k2, t.k * 0.95); im.setColorAt(k, cc);
    }
    im.frustumCulled = false; im.instanceMatrix.needsUpdate = true;
    root.add(im); forestObjs.push(im); return im;
  }
  if (needGeo) forestGeo = { p: pb.geometry(), r: rb.geometry() };
  var gP = forestGeo.p, gR = forestGeo.r;
  if (pines.length) inst(gP, pines, MAT.solid);
  if (rounds.length) inst(gR, rounds, MAT.solid);
}

/* ----------------------------------------- wild land outside the map bounds */
function rebuildWild() {
  wildObjs.forEach(function (m) { root.remove(m); m.dispose && m.dispose(); }); wildObjs.length = 0;
  var mp = mapB();
  if (!forestGeo || (mp.i0 <= 0 && mp.j0 <= 0 && mp.i1 >= N - 1 && mp.j1 >= N - 1)) return;
  var ter = Z.state && Z.state.terrain, rnd = rng32(4242), pines = [], rounds = [], i, j, tot = 0;
  for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
    if (i >= mp.i0 && i <= mp.i1 && j >= mp.j0 && j <= mp.j1) continue;
    if (ter && ter[i + j * N] === waterIdx) continue;
    var fo = fbm(i * 0.11 + 5, j * 0.11 + 9, 3), p = clamp((fo - 0.3) * 2.0, 0.05, 0.8);
    if (rnd() > p || tot > 1700) continue;
    var x = (i + 0.15 + rnd() * 0.7) * T, z = (j + 0.15 + rnd() * 0.7) * T;
    var rec = { x: x, y: groundY(x, z) - 0.05, z: z, s: 0.75 + rnd() * 0.55, r: rnd() * TAU, k: 0.8 + rnd() * 0.25, k2: 0.9 + rnd() * 0.2 };
    (rnd() < 0.5 ? pines : rounds).push(rec); tot++;
  }
  var ps = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), mm = new THREE.Matrix4(), cc = new THREE.Color();
  function inst(geo, list) {
    if (!list.length) return;
    var im = new THREE.InstancedMesh(geo, MAT.solid, list.length);
    for (var k = 0; k < list.length; k++) {
      var t = list[k];
      mm.compose(ps.set(t.x, t.y, t.z), q.setFromAxisAngle(up, t.r), sc.set(t.s, t.s * (0.9 + t.k2 * 0.2), t.s));
      im.setMatrixAt(k, mm); cc.setRGB(t.k * 0.9, t.k * t.k2 * 0.95, t.k * 0.85); im.setColorAt(k, cc);
    }
    im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; root.add(im); wildObjs.push(im);
  }
  inst(forestGeo.p, pines); inst(forestGeo.r, rounds);
}

/* ------------------------------------------------ perimeter wall (map bounds) */
function wallNear(i0, j0, i1, j1) {
  var m = mapB();
  return !(i1 < m.i0 - 2 || i0 > m.i1 + 2 || j1 < m.j0 - 2 || j0 > m.j1 + 2) &&
    (i0 <= m.i0 + 1 || j0 <= m.j0 + 1 || i1 >= m.i1 - 1 || j1 >= m.j1 - 1);
}
function rebuildWall() {
  if (wallMesh) { root.remove(wallMesh); wallMesh.geometry.dispose(); wallMesh = null; }
  var wb = new MB(), stone = lin3('#b3a38b'), stoneD = lin3('#8e8068'), cap = lin3('#cdbfa5'), mp = mapB();
  var X0 = mp.i0 * T, X1 = (mp.i1 + 1) * T, Z0 = mp.j0 * T, Z1 = (mp.j1 + 1) * T, cx = Math.floor(N / 2) * T, PW = 1.0;
  var gx0 = (Math.floor(N / 2) - 1) * T, gx1 = (Math.floor(N / 2) + 1) * T;
  function wallSeg(x0, z0, x1, z1, side) {
    var len = Math.max(x1 - x0, z1 - z0), segs = Math.max(1, Math.round(len / 2));
    for (var k = 0; k < segs; k++) {
      var f0 = k / segs, f1 = (k + 1) / segs, k2 = 0.93 + 0.14 * h2(Math.round(x0 * 3 + k), Math.round(z0 * 5 + k * 3));
      var ax0, ax1, az0, az1;
      if (side === 'n' || side === 's') { ax0 = lerp(x0, x1, f0); ax1 = lerp(x0, x1, f1); az0 = z0; az1 = z1; }
      else { az0 = lerp(z0, z1, f0); az1 = lerp(z0, z1, f1); ax0 = x0; ax1 = x1; }
      var g0 = groundY(ax0, az0), g1 = groundY(ax1, az1), gm = groundY((ax0 + ax1) / 2, (az0 + az1) / 2);
      var yt = Math.max(g0, g1, gm), yb = Math.min(g0, g1, gm) - 0.35;
      wb.box(ax0, yb, az0, ax1, yt + 1.45, az1, mul3(stone, k2));
      var gx = side === 'n' || side === 's' ? 0.07 : 0, gz = side === 'e' || side === 'w' ? 0.07 : 0;
      wb.box(ax0 - gx, yt + 1.45, az0 - gz, ax1 + gx, yt + 1.6, az1 + gz, mul3(cap, k2), true);
      wb.box(ax0 - gx * 0.5, yb, az0 - gz * 0.5, ax1 + gx * 0.5, yt + 0.35, az1 + gz * 0.5, mul3(stoneD, k2), true);
    }
  }
  function pillar(x, z, h) {
    var g = groundY(x, z), y0 = g - 0.4;
    wb.box(x - 0.4, y0, z - 0.4, x + 0.4, g + h, z + 0.4, mul3(stone, 0.96));
    wb.box(x - 0.5, g + h, z - 0.5, x + 0.5, g + h + 0.14, z + 0.5, cap, true);
    wb.box(x - 0.3, g + h + 0.14, z - 0.3, x + 0.3, g + h + 0.34, z + 0.3, mul3(cap, 0.95), true);
  }
  var e = 0.5;
  wallSeg(X0 - e, Z0 - e, X1 + e, Z0, 'n');
  wallSeg(X0 - e, Z1, gx0 - PW - 0.6, Z1 + e, 's');
  wallSeg(gx1 + PW + 0.6, Z1, X1 + e, Z1 + e, 's');
  wallSeg(X0 - e, Z0, X0, Z1, 'w');
  wallSeg(X1, Z0, X1 + e, Z1, 'e');
  var nx = Math.max(1, Math.round((X1 - X0) / 8)), nz = Math.max(1, Math.round((Z1 - Z0) / 8)), p;
  for (p = 0; p <= nx; p++) {
    var px = lerp(X0, X1, p / nx);
    pillar(px, Z0 - 0.25, 1.95);
    if (Math.abs(px - cx) > 4.4) pillar(px, Z1 + 0.25, 1.95);
  }
  for (p = 0; p <= nz; p++) { var pz = lerp(Z0, Z1, p / nz); pillar(X0 - 0.25, pz, 1.95); pillar(X1 + 0.25, pz, 1.95); }
  wallMesh = new THREE.Mesh(wb.geometry(), MAT.solid); wallMesh.frustumCulled = false; root.add(wallMesh);
  if (gateGrp) gateGrp.position.y = Math.max(0, groundY(cx, W - 0.5));
}

/* ------------------------------------- perimeter wall, gate, road, clouds */
var clouds = [];
function buildGate() {
  if (gateGrp) {
    gateGrp.traverse(function (o) { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    root.remove(gateGrp);
    gateGrp = null;
  }
  var wb = new MB(), stone = lin3('#b3a38b'), stoneD = lin3('#8e8068'), cap = lin3('#cdbfa5');
  gateGrp = new THREE.Group(); root.add(gateGrp);
  // gate pillars positioned at x = Math.floor(N / 2) * T, z = N * T
  var cx = Math.floor(N / 2) * T, gz = 0.25, wood = lin3('#7a4e2c');
  gateGrp.position.set(cx, Math.max(0, groundY(cx, W - 0.5)), N * T);
  [-2.9, 2.9].forEach(function (x) {
    wb.box(x - 0.7, -1.2, gz - 0.7, x + 0.7, 0.5, gz + 0.7, mul3(stoneD, 1.0));
    wb.box(x - 0.55, 0.5, gz - 0.55, x + 0.55, 5.3, gz + 0.55, mul3(stone, 1.0));
    wb.box(x - 0.68, 5.3, gz - 0.68, x + 0.68, 5.5, gz + 0.68, cap, true);
    wb.box(x - 0.5, 5.5, gz - 0.5, x + 0.5, 5.65, gz + 0.5, mul3(cap, 0.95), true);
    var gm = new THREE.Matrix4().compose(new THREE.Vector3(x, 6.05, gz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    wb.addGeo(new THREE.IcosahedronGeometry(0.4, 1), gm, lin3('#d9a441'), function (a, b, c, n) { return 0.8 + 0.3 * n.y; });
  });
  // arch: wooden arc segments
  var arcN = 14, R = 2.9, cyA = 4.2;
  for (var k = 0; k < arcN; k++) {
    var a0 = PI * k / arcN, a1 = PI * (k + 1) / arcN, am = (a0 + a1) / 2;
    var mx = Math.cos(am) * R, my = cyA + Math.sin(am) * R;
    var segL = R * (a1 - a0) * 1.12;
    var mat = new THREE.Matrix4().compose(new THREE.Vector3(mx, my, gz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), am + PI / 2), new THREE.Vector3(segL, 0.62, 0.9));
    wb.addGeo(new THREE.BoxGeometry(1, 1, 1), mat, wood, function (a, b, c, n) { return 0.78 + 0.22 * Math.abs(n.y) + 0.18 * Math.abs(n.z); });
  }
  // iron-ish gate leaves folded open + little lamps
  [-2.35, 2.35].forEach(function (x) { wb.box(x - 0.12, 0, gz - 0.12, x + 0.12, 3.6, gz + 0.12, lin3('#3d3a38')); });
  var wg = wb.geometry(), wm = new THREE.Mesh(wg, MAT.solid); wm.frustumCulled = false; gateGrp.add(wm);
  // sign board
  if (!TEX.sign) TEX.sign = makeSignTex();
  var sm = G.signMat;
  if (!sm) {
    sm = new THREE.MeshLambertMaterial({ map: TEX.sign, side: THREE.FrontSide });
    sm.emissive = new THREE.Color(1, 1, 1); sm.emissiveMap = TEX.sign; sm.emissiveIntensity = 0.0; G.signMat = sm;
  }
  var sg = new THREE.PlaneGeometry(5.6, 2.1);
  var s1 = new THREE.Mesh(sg, sm); s1.position.set(0, 8.35, gz + 0.12); gateGrp.add(s1);
  var s2 = new THREE.Mesh(sg, sm); s2.position.set(0, 8.35, gz - 0.12); s2.rotation.y = PI; gateGrp.add(s2);
  var frame = new MB(), fc = lin3('#6b4423'), sy0 = 7.2, sy1 = 9.5;
  frame.box(-2.95, sy0 - 0.05, gz - 0.16, 2.95, sy0 + 0.05, gz + 0.16, fc); frame.box(-2.95, sy1 - 0.05, gz - 0.16, 2.95, sy1 + 0.05, gz + 0.16, fc);
  frame.box(-2.95, sy0 - 0.05, gz - 0.16, -2.85, sy1 + 0.05, gz + 0.16, fc); frame.box(2.85, sy0 - 0.05, gz - 0.16, 2.95, sy1 + 0.05, gz + 0.16, fc);
  frame.box(-2.6, 6.6, gz - 0.1, -2.4, sy0, gz + 0.1, fc); frame.box(2.4, 6.6, gz - 0.1, 2.6, sy0, gz + 0.1, fc);
  frame.box(-0.1, 7.0, gz - 0.1, 0.1, sy0, gz + 0.1, fc);
  var fm = new THREE.Mesh(frame.geometry(), MAT.solid); gateGrp.add(fm);
}
function buildSurroundings() {
  buildGate();
  if (roadMesh) { root.remove(roadMesh); roadMesh.geometry.dispose(); roadMesh = null; }
  for (var ci = 0; ci < clouds.length; ci++) {
    root.remove(clouds[ci]);
    if (clouds[ci].geometry) clouds[ci].geometry.dispose();
    if (clouds[ci].material) clouds[ci].material.dispose();
  }
  clouds.length = 0;

  var cx = Math.floor(N / 2) * T;
  // road + plaza outside the gate
  var rb = new MB(), PY = 0.03;
  function cell(k) { return [k * 0.25 + 0.004, k * 0.25 + 0.246]; }
  function tileQ(x0, z0, k, c) { var u = cell(k); rb.quad([x0, PY, z0 + T], [x0 + T, PY, z0 + T], [x0 + T, PY, z0], [x0, PY, z0], 0, 1, 0, c, u[0], 0.01, u[1], 0.99); }
  var asph = lin3('#5a5d63'), plaza = lin3('#d6cdbb'), plaza2 = lin3('#c4b9a4');
  for (var rz = W + 1; rz < W + 220; rz += T) for (var rx = cx - 4; rx < cx + 4; rx += T) tileQ(rx, rz, 3, mul3(asph, 0.9 + 0.2 * h2(rx, rz)));
  for (var pz = W + 1; pz < W + 17; pz += T) for (var px = cx - 10; px < cx + 10; px += T) {
    var inRoad = Math.abs(px + 1 - cx) < 4 && pz > W + 10;
    if (!inRoad) tileQ(px, pz, 1, mul3(((px / T + pz / T) & 1) ? plaza : plaza2, 0.94 + 0.1 * h2(px, pz)));
  }
  for (var dz = W + 18; dz < W + 210; dz += 7) rb.quad([cx - 0.12, PY + 0.004, dz + 3], [cx + 0.12, PY + 0.004, dz + 3], [cx + 0.12, PY + 0.004, dz], [cx - 0.12, PY + 0.004, dz], 0, 1, 0, lin3('#e8e4d0'), 0.5, 0.5, 0.52, 0.52);
  // plaza planters: two little hedge boxes with flowers
  var pl = lin3('#2f6b2a'), fl = lin3('#e0527a'), fl2 = lin3('#f4c84a');
  [[cx - 7.5, W + 3.4], [cx + 7.5, W + 3.4], [cx - 7.5, W + 11], [cx + 7.5, W + 11]].forEach(function (p, k) {
    rb.box(p[0] - 1.2, PY, p[1] - 1.2, p[0] + 1.2, PY + 0.5, p[1] + 1.2, lin3('#9a8a70'));
    rb.box(p[0] - 1.05, PY + 0.5, p[1] - 1.05, p[0] + 1.05, PY + 0.62, p[1] + 1.05, pl, true);
    for (var f = 0; f < 9; f++) rb.box(p[0] - 0.9 + (f % 3) * 0.9, PY + 0.62, p[1] - 0.9 + Math.floor(f / 3) * 0.9, p[0] - 0.6 + (f % 3) * 0.9, PY + 0.8, p[1] - 0.6 + Math.floor(f / 3) * 0.9, ((f + k) & 1) ? fl : fl2, true);
  });
  roadMesh = new THREE.Mesh(rb.geometry(), MAT.path); roadMesh.frustumCulled = false; root.add(roadMesh);

  // clouds
  var cb = new MB(), mat = new THREE.Matrix4(), rr = rng32(99);
  var cg = new THREE.IcosahedronGeometry(1, 1);
  for (var c = 0; c < 9; c++) {
    var b = new MB(), blobs = 4 + Math.floor(rr() * 3);
    for (var k2 = 0; k2 < blobs; k2++) {
      var s = 5 + rr() * 5;
      mat.compose(new THREE.Vector3((k2 - blobs / 2) * 6 + rr() * 3, rr() * 2.5, rr() * 5 - 2.5), new THREE.Quaternion(), new THREE.Vector3(s * 1.3, s * 0.55, s));
      b.addGeo(cg, mat.clone(), [1, 1, 1], function (a, bb, cc, n) { return 0.78 + 0.22 * Math.max(0, n.y * 0.8 + 0.3); });
    }
    var cm = new THREE.Mesh(b.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0.18, 0.18, 0.2), fog: true }));
    cm.position.set(-200 + rr() * (W + 350), 70 + rr() * 30, -200 + rr() * (W + 310));
    cm.userData.sp = 1.2 + rr() * 1.6; cm.frustumCulled = false;
    cm.scale.setScalar(0.8 + rr() * 0.7);
    root.add(cm); clouds.push(cm);
  }
}

/* ------------------------------------------------------- paths and fences */
var PY = 0.045, PONTOON_Y = 0.14;
var pathGroup, fenceGroup, cageRoofGroup, pathMeshes = [], fenceMeshes = [], pathDirty, fenceDirty, PCOL = [];
function clearCageRoofs() {
  if (!cageRoofGroup) return;
  while (cageRoofGroup.children.length) disposeMesh(cageRoofGroup.children[0]);
}
function buildPathsFences() {
  if (!pathGroup) { pathGroup = new THREE.Group(); root.add(pathGroup); }
  if (!fenceGroup) { fenceGroup = new THREE.Group(); root.add(fenceGroup); }
  if (!cageRoofGroup) { cageRoofGroup = new THREE.Group(); root.add(cageRoofGroup); }
  clearCageRoofs();
  for (var i = 0; i < pathMeshes.length; i++) disposeMesh(pathMeshes[i]);
  for (i = 0; i < fenceMeshes.length; i++) if (fenceMeshes[i]) fenceMeshes[i].forEach(disposeMesh);
  pathMeshes.length = 0; fenceMeshes.length = 0;
  pathDirty = new Uint8Array(NCH * NCH); fenceDirty = new Uint8Array(NCH * NCH);
  for (var k = 0; k < NCH * NCH; k++) { pathMeshes.push(null); fenceMeshes.push(null); }
  PCOL = (D.paths || []).map(function (p) { return lin3(p.colour); });
}
function markRect(arr, i0, j0, i1, j1, pad) {
  var c0 = Math.floor(clamp(i0 - pad, 0, N) / CH), c1 = Math.floor(clamp(i1 + pad, 0, N) / CH);
  var r0 = Math.floor(clamp(j0 - pad, 0, N) / CH), r1 = Math.floor(clamp(j1 + pad, 0, N) / CH);
  c1 = Math.min(c1, NCH - 1); r1 = Math.min(r1, NCH - 1);
  for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) arr[r * NCH + c] = 1;
}
function disposeMesh(m) { if (m) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); } }

function pathKind(pt, pv) {
  var id = pt && pt.id;
  if (id === 'dirt_path') return 0; if (id === 'paved') return 1; if (id === 'cobble') return 2;
  return (pv - 1) % 3;
}
// ground-draped path pieces: a tile is 2x2 quads that follow the terrain mesh triangulation exactly
var _tn = [0, 1, 0];
function terrNormal(x, z) {
  var hs = T * 0.5, a = clamp(Math.round(x / hs), 0, S2 - 1), b = clamp(Math.round(z / hs), 0, S2 - 1), v = (a + b * S2) * 3;
  _tn[0] = tNor[v]; _tn[1] = tNor[v + 1]; _tn[2] = tNor[v + 2]; return _tn;
}
var _pv = [0, 0, 0, 0, 0, 0, 0, 0, 0];
function pathTile(mb, x0, z0, c, u0, u1) {
  var hs = T * 0.5, aa, bb, k = 0;
  for (bb = 0; bb < 3; bb++) for (aa = 0; aa < 3; aa++) {
    var x = x0 + aa * hs, z = z0 + bb * hs, n = terrNormal(x, z);
    _pv[k++] = mb.vtx(x, groundY(x, z) + PY, z, n[0], n[1], n[2], c, u0 + (u1 - u0) * aa * 0.5, 0.99 - 0.98 * bb * 0.5);
  }
  for (bb = 0; bb < 2; bb++) for (aa = 0; aa < 2; aa++) {
    var q = aa + bb * 3;
    mb.tri(_pv[q], _pv[q + 3], _pv[q + 1]); mb.tri(_pv[q + 1], _pv[q + 3], _pv[q + 4]);
  }
}
function pathStrip(mb, x0, z1, x1, z0, c) {
  var y = PY + 0.014;
  mb.quad([x0, groundY(x0, z1) + y, z1], [x1, groundY(x1, z1) + y, z1], [x1, groundY(x1, z0) + y, z0], [x0, groundY(x0, z0) + y, z0], 0, 1, 0, c, 0.1, 0.1, 0.2, 0.2);
}
function pathKerb(mb, x0, z0, x1, z1, c) {
  var hh = 0.055, yb = PY, cs = mul3(c, 0.86);
  var gA = groundY(x0, z0), gB = groundY(x1, z0), gC = groundY(x1, z1), gD = groundY(x0, z1);
  var lA = gA - 0.06, lB = gB - 0.06, lC = gC - 0.06, lD = gD - 0.06;
  var tA = gA + yb + hh, tB = gB + yb + hh, tC = gC + yb + hh, tD = gD + yb + hh;
  mb.quad([x0, tD, z1], [x1, tC, z1], [x1, tB, z0], [x0, tA, z0], 0, 1, 0, c);
  mb.quad([x0, lD, z1], [x1, lC, z1], [x1, tC, z1], [x0, tD, z1], 0, 0, 1, cs);
  mb.quad([x1, lB, z0], [x0, lA, z0], [x0, tA, z0], [x1, tB, z0], 0, 0, -1, cs);
  mb.quad([x1, lC, z1], [x1, lB, z0], [x1, tB, z0], [x1, tC, z1], 1, 0, 0, cs);
  mb.quad([x0, lA, z0], [x0, lD, z1], [x0, tD, z1], [x0, tA, z0], -1, 0, 0, cs);
}
function buildPathChunk(ci, cj) {
  var key = cj * NCH + ci;
  disposeMesh(pathMeshes[key]); pathMeshes[key] = null;
  var s = Z.state, pth = s && s.path;
  if (!pth) return;
  var mb = new MB(), types = D.paths || [], any = false;
  var i0 = ci * CH, j0 = cj * CH, i1 = Math.min(N, i0 + CH), j1 = Math.min(N, j0 + CH);
  function has(i, j) { return i >= 0 && j >= 0 && i < N && j < N && pth[i + j * N] > 0; }
  for (var j = j0; j < j1; j++) for (var i = i0; i < i1; i++) {
    var pv = pth[i + j * N]; if (!pv) continue;
    if (types[pv - 1] && types[pv - 1].pontoon) continue;
    any = true;
    var pt = types[pv - 1] || types[0], kind = pathKind(pt, pv);
    var base = PCOL[pv - 1] || PCOL[0] || [0.5, 0.5, 0.5];
    var k = 0.93 + 0.14 * h2(i * 3 + 1, j * 5 + 2);
    var c = [base[0] * k, base[1] * k, base[2] * k];
    var x0 = i * T, z0 = j * T, x1 = x0 + T, z1 = z0 + T;
    var u0 = kind * 0.25 + 0.004, u1 = kind * 0.25 + 0.246;
    pathTile(mb, x0, z0, c, u0, u1);
    var kc = mul3(c, kind === 0 ? 0.78 : 0.8);
    if (kind === 0) {
      var w = 0.3;
      if (!has(i, j - 1)) pathStrip(mb, x0, z0 + w, x1, z0, kc);
      if (!has(i, j + 1)) pathStrip(mb, x0, z1, x1, z1 - w, kc);
      if (!has(i - 1, j)) pathStrip(mb, x0, z1, x0 + w, z0, kc);
      if (!has(i + 1, j)) pathStrip(mb, x1 - w, z1, x1, z0, kc);
    } else {
      var kw = 0.17;
      if (!has(i, j - 1)) pathKerb(mb, x0, z0 - 0.02, x1, z0 + kw, kc);
      if (!has(i, j + 1)) pathKerb(mb, x0, z1 - kw, x1, z1 + 0.02, kc);
      if (!has(i - 1, j)) pathKerb(mb, x0 - 0.02, z0, x0 + kw, z1, kc);
      if (!has(i + 1, j)) pathKerb(mb, x1 - kw, z0, x1, z1, kc);
    }
  }
  if (!any) return;
  var m = new THREE.Mesh(mb.geometry(), MAT.path);
  m.receiveShadow = true;
  pathMeshes[key] = m; pathGroup.add(m);
}

/* fences */
var FC = {
  wood: { post: '#6a4222', rail: '#a06f3d', cap: '#4f3118' }, rail: { post: '#7d5d3b', rail: '#b38d5e' },
  chain: { post: '#8e969e' }, chainR: { post: '#454c53' }, cage: { post: '#384048', rail: '#2b3238', bar: '#46505a' },
  glass: { post: '#b8c1c8' }, gildedGlass: { post: '#d4af37', rail: '#b8922c' }, royalMarble: { post: '#f0ead6', rail: '#d4af37' }, concrete: { wall: '#bcb8ae', cap: '#d3cfc5', plinth: '#9a968c' },
  hedge: { a: '#2c6a2b', b: '#3b8a37' }
};
var FCL = null;
function fcl() {
  if (FCL) return FCL;
  FCL = {};
  Object.keys(FC).forEach(function (k) { FCL[k] = {}; Object.keys(FC[k]).forEach(function (kk) { FCL[k][kk] = lin3(FC[k][kk]); }); });
  FCL.glassPane = lin3('#a8e0ee');
  FCL.hazRed = lin3('#ef2b2d');
  FCL.hazAmb = lin3('#f59e0b');
  FCL.woodDebris = lin3('#7c522c');
  FCL.bark = lin3('#4b3520');
  return FCL;
}
// quad auto oriented to a desired normal
function quadN(mb, a, b, c, d, n, col, u0, v0, u1, v1) {
  var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) mb.quad(a, d, c, b, n[0], n[1], n[2], col, u0, v1, u1, v0);
  else mb.quad(a, b, c, d, n[0], n[1], n[2], col, u0, v0, u1, v1);
}
function fenceEdge(set, axis, i, j, f, contNext, broken) {
  var C = fcl(), h = f.height || 1.2, st = f.style, ox = i * T, oz = j * T, solid = set.solid;
  var jit = h2(i * 17 + (axis === 'x' ? 0 : 5), j * 29 + 3);
  // ground heights at the two ends of the edge; everything is sheared to follow the slope
  var gA = groundY(ox, oz), gB = axis === 'x' ? groundY(ox + T, oz) : groundY(ox, oz + T);
  function P(s, y, t) { var yy = y + gA + (gB - gA) * (s / T); return axis === 'x' ? [ox + s, yy, oz + t] : [ox + t, yy, oz + s]; }
  function bx(mb, s0, y0, t0, s1, y1, t1, col, nb) {
    if (y0 < 0.1) y0 -= 0.2;
    var cs = mul3(col, 0.86), up = [0, 1, 0];
    var a0 = P(s0, y0, t0), b0 = P(s1, y0, t0), c0 = P(s1, y0, t1), d0 = P(s0, y0, t1);
    var a1 = P(s0, y1, t0), b1 = P(s1, y1, t0), c1 = P(s1, y1, t1), d1 = P(s0, y1, t1);
    var nt = axis === 'x' ? [0, 0, 1] : [1, 0, 0], ns = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
    var ntm = [-nt[0], 0, -nt[2]], nsm = [-ns[0], 0, -ns[2]];
    quadN(mb, a1, b1, c1, d1, up, col);
    quadN(mb, a0, b0, b1, a1, ntm, cs); quadN(mb, d0, c0, c1, d1, nt, cs);
    quadN(mb, a0, d0, d1, a1, nsm, cs); quadN(mb, b0, c0, c1, b1, ns, cs);
    if (!nb) quadN(mb, a0, b0, c0, d0, [0, -1, 0], mul3(col, 0.6));
  }
  function fallenBox(mb, sc, yc, tc, hs, hy, ht, yaw, tilt, col) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), stt = Math.sin(tilt);
    function pt(ls, ly, lt) {
      var ly1 = ly * ct - lt * stt, lt1 = ly * stt + lt * ct;
      var ds = ls * cy - lt1 * sy, dt = ls * sy + lt1 * cy;
      return P(sc + ds, yc + ly1, tc + dt);
    }
    var p000 = pt(-hs, -hy, -ht), p100 = pt(hs, -hy, -ht), p110 = pt(hs, hy, -ht), p010 = pt(-hs, hy, -ht);
    var p001 = pt(-hs, -hy, ht), p101 = pt(hs, -hy, ht), p111 = pt(hs, hy, ht), p011 = pt(-hs, hy, ht);
    var cs = mul3(col, 0.84), cb = mul3(col, 0.62);
    function qf(a, b, c, d, cl) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      mb.quad(a, b, c, d, nx / nl, ny / nl, nz / nl, cl);
    }
    qf(p011, p111, p110, p010, col);
    qf(p000, p100, p101, p001, cb);
    qf(p001, p101, p111, p011, cs);
    qf(p100, p000, p010, p110, cs);
    qf(p101, p100, p110, p111, cs);
    qf(p000, p001, p011, p010, cs);
  }
  function hazardTrim(sEdge, topY) {
    var ty = clamp(topY || 0.42, 0.28, 0.56);
    bx(solid, sEdge - 0.055, 0.02, -0.09, sEdge + 0.055, ty * 0.56, 0.09, C.hazRed);
    bx(solid, sEdge - 0.06, ty * 0.56, -0.095, sEdge + 0.06, ty, 0.095, C.hazAmb, true);
  }
  function panel(mb, s0, s1, y0, y1, col, ru, rv) {
    var nf = axis === 'x' ? [0, 0, 1] : [1, 0, 0], nb = axis === 'x' ? [0, 0, -1] : [-1, 0, 0];
    var a = P(s0, y0, 0), b = P(s1, y0, 0), c = P(s1, y1, 0), d = P(s0, y1, 0);
    quadN(mb, a, b, c, d, nf, col, 0, 0, ru, rv); quadN(mb, a, b, c, d, nb, col, 0, 0, ru, rv);
  }
  function posts(w, ph, col, capCol) {
    var ss = contNext ? [0] : [0, T];
    for (var k = 0; k < ss.length; k++) {
      var s = ss[k];
      bx(solid, s - w, -0.05, -w, s + w, ph, w, col);
      if (capCol) bx(solid, s - w * 1.3, ph, -w * 1.3, s + w * 1.3, ph + 0.05, w * 1.3, capCol, true);
    }
  }
  if (broken) {
    var gap0 = T * 0.28, gap1 = T * 0.72;
    if (st === 'wood') {
      var bw = C.wood;
      bx(solid, -0.07, -0.05, -0.07, 0.07, h * 0.62, 0.07, bw.post);
      if (!contNext) bx(solid, T - 0.07, -0.05, -0.07, T + 0.07, h * 0.58, 0.07, bw.post);
      bx(solid, gap0 - 0.06, -0.05, -0.06, gap0 + 0.04, h * 0.44, 0.06, bw.post);
      bx(solid, gap1 - 0.04, -0.05, -0.06, gap1 + 0.06, h * 0.40, 0.06, bw.post);
      bx(solid, 0.06, h * 0.20, -0.035, gap0, h * 0.20 + 0.11, 0.035, bw.rail);
      bx(solid, 0.06, h * 0.46, -0.035, gap0 - 0.05, h * 0.46 + 0.10, 0.035, bw.rail);
      bx(solid, gap1, h * 0.20, -0.035, T - 0.06, h * 0.20 + 0.11, 0.035, bw.rail);
      fallenBox(solid, T * 0.42, 0.05, -0.18, 0.34, 0.045, 0.05, 0.45, 0.08, bw.rail);
      fallenBox(solid, T * 0.58, 0.05, 0.20, 0.32, 0.045, 0.05, -0.55, -0.06, C.woodDebris);
      fallenBox(solid, T * 0.50, 0.06, -0.32, 0.22, 0.055, 0.055, 0.18, 0.12, bw.post);
      hazardTrim(gap0, 0.44); hazardTrim(gap1, 0.44);
    } else if (st === 'rail') {
      var br = C.rail;
      bx(solid, -0.06, -0.05, -0.06, 0.06, h * 0.62, 0.06, br.post);
      if (!contNext) bx(solid, T - 0.06, -0.05, -0.06, T + 0.06, h * 0.56, 0.06, br.post);
      bx(solid, gap0 - 0.05, -0.05, -0.05, gap0 + 0.04, h * 0.42, 0.05, br.post);
      bx(solid, gap1 - 0.04, -0.05, -0.05, gap1 + 0.05, h * 0.38, 0.05, br.post);
      bx(solid, 0.05, h * 0.42, -0.025, gap0, h * 0.42 + 0.07, 0.025, mul3(br.rail, 0.85));
      bx(solid, gap1, h * 0.42, -0.025, T - 0.05, h * 0.42 + 0.07, 0.025, mul3(br.rail, 0.85));
      fallenBox(solid, T * 0.44, 0.05, 0.16, 0.35, 0.045, 0.055, -0.42, 0.10, br.rail);
      fallenBox(solid, T * 0.57, 0.05, -0.22, 0.28, 0.04, 0.045, 0.52, -0.08, br.post);
      hazardTrim(gap0, 0.42); hazardTrim(gap1, 0.42);
    } else if (st === 'chain') {
      var bheavy = f.strength >= 5, bc = bheavy ? C.chainR : C.chain, bpw = bheavy ? 0.055 : 0.04;
      bx(solid, -bpw, -0.05, -bpw, bpw, h * 0.56, bpw, bc.post);
      if (!contNext) bx(solid, T - bpw, -0.05, -bpw, T + bpw, h * 0.54, bpw, bc.post);
      bx(solid, gap0 - bpw, -0.05, -bpw, gap0 + bpw, h * 0.42, bpw, bc.post);
      bx(solid, gap1 - bpw, -0.05, -bpw, gap1 + bpw, h * 0.38, bpw, bc.post);
      bx(solid, 0, 0, -0.025, gap0, 0.07, 0.025, bc.post);
      bx(solid, gap1, 0, -0.025, T, 0.07, 0.025, bc.post);
      panel(set.chain, 0, gap0, 0.07, h * 0.48, bheavy ? [0.55, 0.58, 0.6] : [0.9, 0.93, 0.95], gap0, h * 0.41);
      panel(set.chain, gap1, T, 0.07, h * 0.44, bheavy ? [0.55, 0.58, 0.6] : [0.9, 0.93, 0.95], T - gap1, h * 0.37);
      fallenBox(solid, T * 0.45, 0.045, 0.18, 0.36, 0.035, 0.035, 0.38, 0.06, bc.post);
      fallenBox(solid, T * 0.55, 0.045, -0.20, 0.30, 0.03, 0.03, -0.48, -0.08, bc.post);
      quadN(set.chain, P(gap0 + 0.04, 0.04, -0.18), P(gap1 - 0.04, 0.05, -0.10), P(gap1 - 0.08, 0.06, 0.32), P(gap0 + 0.08, 0.04, 0.24), [0, 1, 0], bheavy ? [0.55, 0.58, 0.6] : [0.85, 0.88, 0.9], 0, 0, 0.8, 0.5);
      hazardTrim(gap0, 0.44); hazardTrim(gap1, 0.44);
    } else if (st === 'cage') {
      var bc7 = C.cage, bch = f.height || 3.0;
      bx(solid, -0.065, -0.05, -0.065, 0.065, bch * 0.38, 0.065, bc7.post);
      if (!contNext) bx(solid, T - 0.065, -0.05, -0.065, T + 0.065, bch * 0.36, 0.065, bc7.post);
      bx(solid, gap0 - 0.055, -0.05, -0.055, gap0 + 0.045, bch * 0.32, 0.055, bc7.post);
      bx(solid, gap1 - 0.045, -0.05, -0.055, gap1 + 0.055, bch * 0.30, 0.055, bc7.post);
      bx(solid, 0, 0, -0.04, gap0, 0.09, 0.04, bc7.rail);
      bx(solid, gap1, 0, -0.04, T, 0.09, 0.04, bc7.rail);
      bx(solid, T * 0.14 - 0.02, 0.09, -0.02, T * 0.14 + 0.02, bch * 0.34, 0.02, bc7.bar, true);
      bx(solid, T * 0.86 - 0.02, 0.09, -0.02, T * 0.86 + 0.02, bch * 0.30, 0.02, bc7.bar, true);
      panel(set.chain, 0, gap0, 0.09, bch * 0.32, [0.48, 0.52, 0.56], gap0, bch * 0.23);
      panel(set.chain, gap1, T, 0.09, bch * 0.30, [0.48, 0.52, 0.56], T - gap1, bch * 0.21);
      fallenBox(solid, T * 0.44, 0.06, -0.22, 0.38, 0.045, 0.045, 0.52, 0.08, bc7.post);
      fallenBox(solid, T * 0.56, 0.06, 0.24, 0.36, 0.035, 0.035, -0.36, -0.06, bc7.bar);
      fallenBox(solid, T * 0.48, 0.05, 0.04, 0.26, 0.03, 0.03, 0.95, 0.10, bc7.rail);
      hazardTrim(gap0, 0.52); hazardTrim(gap1, 0.52);
    } else if (st === 'glass') {
      var bc4 = f.id === 'gilded_glass' ? C.gildedGlass : f.id === 'royal_marble' ? C.royalMarble : C.glass;
      var bpw4 = f.id === 'royal_marble' ? 0.10 : f.id === 'gilded_glass' ? 0.055 : 0.04;
      var brl4 = bc4.rail || mul3(bc4.post, 0.9);
      bx(solid, -bpw4, -0.05, -bpw4, bpw4, h * 0.52, bpw4, bc4.post);
      if (!contNext) bx(solid, T - bpw4, -0.05, -bpw4, T + bpw4, h * 0.48, bpw4, bc4.post);
      bx(solid, gap0 - bpw4, -0.05, -bpw4, gap0 + 0.03, h * 0.42, bpw4, bc4.post);
      bx(solid, gap1 - 0.03, -0.05, -bpw4, gap1 + bpw4, h * 0.38, bpw4, bc4.post);
      bx(solid, 0, 0, -0.05, gap0, 0.1, 0.05, brl4);
      bx(solid, gap1, 0, -0.05, T, 0.1, 0.05, brl4);
      panel(set.glass, 0.02, gap0 - 0.02, 0.1, h * 0.42, C.glassPane, 0.4, 0.4);
      panel(set.glass, gap1 + 0.02, T - 0.02, 0.1, h * 0.36, C.glassPane, 0.4, 0.4);
      fallenBox(solid, T * 0.46, 0.045, -0.22, 0.32, 0.035, 0.035, 0.42, 0.05, bc4.post);
      fallenBox(set.glass, T * 0.40, 0.03, 0.16, 0.16, 0.02, 0.13, 0.72, 0.08, C.glassPane);
      fallenBox(set.glass, T * 0.56, 0.03, -0.10, 0.14, 0.02, 0.11, -0.58, -0.10, C.glassPane);
      fallenBox(set.glass, T * 0.62, 0.03, 0.25, 0.15, 0.02, 0.10, 0.25, 0.12, C.glassPane);
      hazardTrim(gap0, 0.44); hazardTrim(gap1, 0.44);
    } else if (st === 'concrete') {
      var bc5 = C.concrete, bk5 = 0.94 + 0.12 * jit;
      bx(solid, 0, 0, -0.17, gap0, 0.22, 0.17, mul3(bc5.plinth, bk5));
      bx(solid, gap1, 0, -0.17, T, 0.22, 0.17, mul3(bc5.plinth, bk5));
      bx(solid, 0, 0.22, -0.14, gap0 * 0.72, h * 0.58, 0.14, mul3(bc5.wall, bk5));
      bx(solid, gap0 * 0.72, 0.22, -0.14, gap0, h * 0.38, 0.14, mul3(bc5.wall, 0.9 * bk5));
      bx(solid, gap1 + (T - gap1) * 0.28, 0.22, -0.14, T, h * 0.55, 0.14, mul3(bc5.wall, bk5));
      bx(solid, gap1, 0.22, -0.14, gap1 + (T - gap1) * 0.28, h * 0.36, 0.14, mul3(bc5.wall, 0.9 * bk5));
      bx(solid, -0.2, 0, -0.2, 0.2, h * 0.62, 0.2, mul3(bc5.wall, 0.92 * bk5));
      if (!contNext) bx(solid, T - 0.2, 0, -0.2, T + 0.2, h * 0.60, 0.2, mul3(bc5.wall, 0.92 * bk5));
      fallenBox(solid, T * 0.42, 0.09, -0.20, 0.19, 0.09, 0.15, 0.38, 0.16, mul3(bc5.wall, bk5));
      fallenBox(solid, T * 0.58, 0.08, 0.22, 0.18, 0.08, 0.14, -0.62, -0.14, mul3(bc5.cap, bk5));
      fallenBox(solid, T * 0.49, 0.07, 0.02, 0.13, 0.07, 0.11, 0.95, 0.20, mul3(bc5.plinth, bk5));
      hazardTrim(gap0, 0.52); hazardTrim(gap1, 0.52);
    } else if (st === 'hedge') {
      var bc6 = C.hedge, bhh = h * (0.95 + 0.1 * jit), bkk = 0.88 + 0.24 * h2(i * 3 + 9, j * 7 + 1);
      var bcol = mul3(bc6.a, bkk), bcolTop = mul3(bc6.b, bkk);
      bx(solid, -0.08, 0, -0.42, gap0, bhh * 0.48, 0.42, bcol);
      bx(solid, -0.04, bhh * 0.48, -0.32, gap0 - 0.05, bhh * 0.64, 0.32, bcolTop, true);
      bx(solid, gap1, 0, -0.42, T + 0.08, bhh * 0.45, 0.42, bcol);
      bx(solid, gap1 + 0.05, bhh * 0.45, -0.32, T + 0.04, bhh * 0.60, 0.32, bcolTop, true);
      bx(solid, gap0 - 0.06, 0.08, -0.14, gap0 + 0.06, 0.24, 0.14, C.bark, true);
      bx(solid, gap1 - 0.06, 0.08, -0.14, gap1 + 0.06, 0.22, 0.14, C.bark, true);
      fallenBox(solid, T * 0.43, 0.07, -0.18, 0.18, 0.08, 0.16, 0.45, 0.12, bcol);
      fallenBox(solid, T * 0.57, 0.06, 0.20, 0.16, 0.07, 0.15, -0.52, -0.10, bcolTop);
      fallenBox(solid, T * 0.50, 0.04, 0.02, 0.22, 0.035, 0.04, 0.32, 0.08, C.bark);
      hazardTrim(gap0, 0.46); hazardTrim(gap1, 0.46);
    } else {
      bx(solid, -0.06, -0.05, -0.06, 0.06, h * 0.58, 0.06, [0.4, 0.3, 0.2]);
      if (!contNext) bx(solid, T - 0.06, -0.05, -0.06, T + 0.06, h * 0.56, 0.06, [0.4, 0.3, 0.2]);
      bx(solid, 0, h * 0.38, -0.03, gap0, h * 0.38 + 0.09, 0.03, [0.5, 0.4, 0.3]);
      bx(solid, gap1, h * 0.38, -0.03, T, h * 0.38 + 0.09, 0.03, [0.5, 0.4, 0.3]);
      fallenBox(solid, T * 0.50, 0.05, 0.12, 0.32, 0.04, 0.05, 0.48, 0.08, [0.5, 0.4, 0.3]);
      hazardTrim(gap0, 0.44); hazardTrim(gap1, 0.44);
    }
    return;
  }
  if (st === 'wood') {
    var c = C.wood;
    posts(0.07, h, c.post, c.cap);
    for (var r = 0; r < 3; r++) { var y = h * (0.2 + 0.33 * r); bx(solid, 0.06, y, -0.035, T - 0.06, y + 0.12, 0.035, c.rail); }
  } else if (st === 'rail') {
    var c2 = C.rail;
    posts(0.06, h, c2.post);
    var y2 = h * 0.8; bx(solid, 0.05, y2, -0.04, T - 0.05, y2 + 0.13, 0.04, c2.rail);
    bx(solid, 0.05, h * 0.42, -0.025, T - 0.05, h * 0.42 + 0.07, 0.025, mul3(c2.rail, 0.85));
  } else if (st === 'chain') {
    var heavy = f.strength >= 5, c3 = heavy ? C.chainR : C.chain, pw = heavy ? 0.055 : 0.04;
    posts(pw, h, c3.post);
    bx(solid, 0, h - 0.06, -0.03, T, h, 0.03, c3.post);
    bx(solid, 0, 0, -0.025, T, 0.07, 0.025, c3.post);
    if (heavy) bx(solid, 0, h * 0.5, -0.03, T, h * 0.5 + 0.05, 0.03, c3.post);
    panel(set.chain, 0, T, 0.07, h - 0.06, heavy ? [0.55, 0.58, 0.6] : [0.9, 0.93, 0.95], T, (h - 0.13));
  } else if (st === 'cage') {
    var c7 = C.cage, ch = f.height || 3.0;
    posts(0.065, ch, c7.post, c7.rail);
    bx(solid, 0, ch - 0.08, -0.045, T, ch, 0.045, c7.post);
    bx(solid, 0, 0, -0.04, T, 0.09, 0.04, c7.rail);
    bx(solid, 0, ch * 0.5 - 0.025, -0.025, T, ch * 0.5 + 0.025, 0.025, c7.rail);
    for (var bi = 1; bi <= 3; bi++) {
      var bs = T * bi / 4;
      bx(solid, bs - 0.02, 0.09, -0.02, bs + 0.02, ch - 0.08, 0.02, c7.bar, true);
    }
    panel(set.chain, 0, T, 0.09, ch - 0.08, [0.48, 0.52, 0.56], T, ch - 0.17);
  } else if (st === 'glass') {
    var c4 = f.id === 'gilded_glass' ? C.gildedGlass : f.id === 'royal_marble' ? C.royalMarble : C.glass;
    var isRoyal = f.id === 'royal_marble', isGilded = f.id === 'gilded_glass';
    var pw4 = isRoyal ? 0.11 : isGilded ? 0.055 : 0.04;
    var cap4 = isRoyal ? c4.rail : isGilded ? c4.post : null;
    var rail4 = c4.rail || mul3(c4.post, 0.9);
    posts(pw4, h, c4.post, cap4);
    bx(solid, 0, h - 0.09, -0.045, T, h, 0.045, isRoyal ? rail4 : c4.post);
    bx(solid, 0, 0, -0.06, T, isRoyal ? 0.24 : 0.1, 0.06, isRoyal ? c4.post : rail4);
    if (isRoyal) bx(solid, 0, 0.24, -0.05, T, 0.30, 0.05, rail4, true);
    panel(set.glass, 0.02, T - 0.02, isRoyal ? 0.30 : 0.1, h - 0.09, C.glassPane, 1, 1);
  } else if (st === 'concrete') {
    var c5 = C.concrete, k5 = 0.94 + 0.12 * jit;
    bx(solid, 0, 0, -0.17, T, 0.22, 0.17, mul3(c5.plinth, k5));
    bx(solid, 0, 0.22, -0.14, T, h - 0.12, 0.14, mul3(c5.wall, k5));
    bx(solid, -0.02, h - 0.12, -0.2, T + 0.02, h, 0.2, mul3(c5.cap, k5), true);
    bx(solid, -0.2, 0, -0.2, 0.2, h + 0.03, 0.2, mul3(c5.wall, 0.92 * k5));
    if (!contNext) bx(solid, T - 0.2, 0, -0.2, T + 0.2, h + 0.03, 0.2, mul3(c5.wall, 0.92 * k5));
    // panel seam shadow lines
    bx(solid, T * 0.5 - 0.015, 0.22, -0.145, T * 0.5 + 0.015, h - 0.12, 0.145, mul3(c5.wall, 0.8 * k5), true);
  } else if (st === 'hedge') {
    var c6 = C.hedge, hh = h * (0.95 + 0.1 * jit), kk = 0.88 + 0.24 * h2(i * 3 + 9, j * 7 + 1);
    var prof = [[-0.46, 0], [-0.52, 0.45], [-0.4, 0.82], [-0.22, 1], [0.22, 1], [0.4, 0.82], [0.52, 0.45], [0.46, 0]];
    var s0 = -0.12, s1 = T + 0.12;
    for (var k = 0; k < prof.length - 1; k++) {
      var p = prof[k], q = prof[k + 1], dt = q[0] - p[0], dy = (q[1] - p[1]) * hh;
      var l = Math.sqrt(dt * dt + dy * dy) || 1, nt = -dy / l, ny = dt / l;
      var n = axis === 'x' ? [0, ny, nt] : [nt, ny, 0];
      var up = (p[1] + q[1]) * 0.5;
      var col = mix3(mul3(c6.a, kk), mul3(c6.b, kk), clamp(up * 1.1, 0, 1));
      var a = P(s0, p[1] * hh, p[0]), b = P(s1, p[1] * hh, p[0]), c = P(s1, q[1] * hh, q[0]), d = P(s0, q[1] * hh, q[0]);
      quadN(solid, a, b, c, d, n, col, 0, 0, 1, 1);
    }
    var capn = axis === 'x' ? [1, 0, 0] : [0, 0, 1], capn2 = axis === 'x' ? [-1, 0, 0] : [0, 0, -1];
    [[s0, capn2], [s1, capn]].forEach(function (e) {
      var ids = []; var cc = mul3(c6.a, kk * 0.9);
      for (var m = 0; m < prof.length; m++) { var pp = P(e[0], prof[m][1] * hh, prof[m][0]); ids.push(solid.vtx(pp[0], pp[1], pp[2], e[1][0], e[1][1], e[1][2], cc, 0, 0)); }
      for (m = 1; m < ids.length - 1; m++) {
        var A_ = [solid.p[ids[0] * 3], solid.p[ids[0] * 3 + 1], solid.p[ids[0] * 3 + 2]], B_ = [solid.p[ids[m] * 3], solid.p[ids[m] * 3 + 1], solid.p[ids[m] * 3 + 2]], C_ = [solid.p[ids[m + 1] * 3], solid.p[ids[m + 1] * 3 + 1], solid.p[ids[m + 1] * 3 + 2]];
        var cx = (B_[1] - A_[1]) * (C_[2] - A_[2]) - (B_[2] - A_[2]) * (C_[1] - A_[1]), cy = (B_[2] - A_[2]) * (C_[0] - A_[0]) - (B_[0] - A_[0]) * (C_[2] - A_[2]), cz = (B_[0] - A_[0]) * (C_[1] - A_[1]) - (B_[1] - A_[1]) * (C_[0] - A_[0]);
        if (cx * e[1][0] + cy * e[1][1] + cz * e[1][2] >= 0) solid.tri(ids[0], ids[m], ids[m + 1]); else solid.tri(ids[0], ids[m + 1], ids[m]);
      }
    });
  } else {
    posts(0.06, h, [0.4, 0.3, 0.2]); bx(solid, 0, h * 0.7, -0.03, T, h * 0.7 + 0.1, 0.03, [0.5, 0.4, 0.3]);
  }
}
function buildFenceChunk(ci, cj) {
  var key = cj * NCH + ci, old = fenceMeshes[key];
  if (old) { old.forEach(disposeMesh); }
  fenceMeshes[key] = null;
  var s = Z.state; if (!s || !s.fenceX || !s.fenceZ) return;
  var types = D.fences || [], fx = s.fenceX, fz = s.fenceZ;
  var brokenMap = {}, encs = s.enclosures;
  if (encs && encs.length) {
    for (var ek = 0; ek < encs.length; ek++) {
      var enc = encs[ek];
      if (enc && enc.breach > 0 && enc.breachEdge) {
        var be = enc.breachEdge;
        brokenMap[be.axis + ':' + be.i + ':' + be.j] = 1;
      }
    }
  }
  var set = { solid: new MB(), chain: new MB(), glass: new MB() }, any = false;
  var i0 = ci * CH, j0 = cj * CH, i1 = Math.min(N, i0 + CH), j1 = Math.min(N, j0 + CH);
  var iEnd = ci === NCH - 1 ? N : i1 - 1, jEnd = cj === NCH - 1 ? N : j1 - 1;
  var i, j, v, f;
  for (j = j0; j <= jEnd; j++) for (i = i0; i < i1; i++) {   // fenceX: along north side of (i,j)
    v = fx[i + j * N]; if (!v) continue;
    f = types[v - 1]; if (!f) continue; any = true;
    fenceEdge(set, 'x', i, j, f, i + 1 < N && fx[i + 1 + j * N] === v, !!brokenMap['x:' + i + ':' + j]);
  }
  for (j = j0; j < j1; j++) for (i = i0; i <= iEnd; i++) {   // fenceZ: along west side of (i,j)
    v = fz[i + j * (N + 1)]; if (!v) continue;
    f = types[v - 1]; if (!f) continue; any = true;
    fenceEdge(set, 'z', i, j, f, j + 1 < N && fz[i + (j + 1) * (N + 1)] === v, !!brokenMap['z:' + i + ':' + j]);
  }
  if (!any) return;
  var meshes = [];
  if (!set.solid.empty()) { var m1 = new THREE.Mesh(set.solid.geometry(), MAT.solid); m1.castShadow = true; m1.receiveShadow = true; meshes.push(m1); }
  if (!set.chain.empty()) { var m2 = new THREE.Mesh(set.chain.geometry(), MAT.chain); m2.renderOrder = 3; m2.receiveShadow = true; meshes.push(m2); }
  if (!set.glass.empty()) { var m3 = new THREE.Mesh(set.glass.geometry(), MAT.glass); m3.renderOrder = 4; m3.receiveShadow = true; meshes.push(m3); }
  meshes.forEach(function (m) { fenceGroup.add(m); });
  fenceMeshes[key] = meshes;
}
function processChunks() {
  var n = 0, k, ci, cj;
  for (k = 0; k < pathDirty.length && n < 14; k++) if (pathDirty[k]) { pathDirty[k] = 0; buildPathChunk(k % NCH, (k / NCH) | 0); n++; }
  n = 0;
  for (k = 0; k < fenceDirty.length && n < 14; k++) if (fenceDirty[k]) { fenceDirty[k] = 0; buildFenceChunk(k % NCH, (k / NCH) | 0); n++; }
}

function rebuildCageRoofs() {
  clearCageRoofs();
  if (!cageRoofGroup) return;
  var s = Z.state, encs = s && s.enclosures;
  if (!encs || !encs.length) return;
  var C = fcl().cage, solidMB = new MB(), meshMB = new MB(), roofH = 3.0, any = false;

  function roofBeam(axis, x0, z0, ya, yb, hw, hd, col) {
    var cs = mul3(col, 0.86), cb = mul3(col, 0.65);
    var pA = function (y, t) { return axis === 'x' ? [x0, ya + y, z0 + t] : [x0 + t, ya + y, z0]; };
    var pB = function (y, t) { return axis === 'x' ? [x0 + T, yb + y, z0 + t] : [x0 + t, yb + y, z0 + T]; };
    var nt = axis === 'x' ? [0, 0, 1] : [1, 0, 0], ntm = [-nt[0], 0, -nt[2]];
    var y0 = -hd, y1 = hd * 0.65;
    var a0 = pA(y0, -hw), b0 = pB(y0, -hw), c0 = pB(y0, hw), d0 = pA(y0, hw);
    var a1 = pA(y1, -hw), b1 = pB(y1, -hw), c1 = pB(y1, hw), d1 = pA(y1, hw);
    quadN(solidMB, a1, b1, c1, d1, [0, 1, 0], col);
    quadN(solidMB, a0, b0, c0, d0, [0, -1, 0], cb);
    quadN(solidMB, a0, b0, b1, a1, ntm, cs);
    quadN(solidMB, d0, c0, c1, d1, nt, cs);
  }

  for (var e = 0; e < encs.length; e++) {
    var enc = encs[e];
    if (!enc || !enc.isCage || !enc.tiles || !enc.tiles.length) continue;
    any = true;
    var tileSet = {}, k, ti;
    for (k = 0; k < enc.tiles.length; k++) tileSet[enc.tiles[k]] = 1;
    for (k = 0; k < enc.tiles.length; k++) {
      ti = enc.tiles[k];
      var i = ti % N, j = (ti / N) | 0;
      var x0 = i * T, x1 = x0 + T, z0 = j * T, z1 = z0 + T;
      var y00 = groundY(x0, z0) + roofH, y10 = groundY(x1, z0) + roofH;
      var y11 = groundY(x1, z1) + roofH, y01 = groundY(x0, z1) + roofH;
      quadN(meshMB, [x0, y00, z0], [x1, y10, z0], [x1, y11, z1], [x0, y01, z1], [0, 1, 0], [0.48, 0.52, 0.56], 0, 0, T, T);

      var edgeN = j === 0 || !tileSet[i + (j - 1) * N];
      var edgeS = j === N - 1 || !tileSet[i + (j + 1) * N];
      var edgeW = i === 0 || !tileSet[(i - 1) + j * N];
      var edgeE = i === N - 1 || !tileSet[(i + 1) + j * N];

      roofBeam('x', x0, z0, y00, y10, edgeN ? 0.055 : 0.028, edgeN ? 0.06 : 0.04, edgeN ? C.post : C.rail);
      if (edgeS) roofBeam('x', x0, z1, y01, y11, 0.055, 0.06, C.post);
      roofBeam('z', x0, z0, y00, y01, edgeW ? 0.055 : 0.028, edgeW ? 0.06 : 0.04, edgeW ? C.post : C.rail);
      if (edgeE) roofBeam('z', x1, z0, y10, y11, 0.055, 0.06, C.post);
    }
  }
  if (!any) return;
  if (!solidMB.empty()) {
    var bm = new THREE.Mesh(solidMB.geometry(), MAT.solid);
    bm.castShadow = true; bm.receiveShadow = true;
    cageRoofGroup.add(bm);
  }
  if (!meshMB.empty()) {
    var rm = new THREE.Mesh(meshMB.geometry(), MAT.chainRoof);
    rm.renderOrder = 3;
    rm.receiveShadow = true;
    cageRoofGroup.add(rm);
  }
}

/* -------------------------------------------------- fallback primitives */
var fbMats = {}, fbGeos = {};
function fbMat(hex) {
  if (!fbMats[hex]) fbMats[hex] = new THREE.MeshLambertMaterial({ color: tcol(hex) });
  return fbMats[hex];
}
function fbBox(g, w, h, d, hex, x, y, z) {
  var m = new THREE.Mesh(fbGeos.box || (fbGeos.box = new THREE.BoxGeometry(1, 1, 1)), fbMat(hex));
  m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); return m;
}
function fbCone(g, r, h, hex, x, y, z) {
  var m = new THREE.Mesh(fbGeos.cone || (fbGeos.cone = new THREE.ConeGeometry(1, 1, 7)), fbMat(hex));
  m.scale.set(r, h, r); m.position.set(x, y, z); g.add(m); return m;
}
function fbBall(g, r, hex, x, y, z) {
  var m = new THREE.Mesh(fbGeos.ball || (fbGeos.ball = new THREE.SphereGeometry(1, 10, 8)), fbMat(hex));
  m.scale.setScalar(r); m.position.set(x, y, z); g.add(m); return m;
}
function fbCapsule(g, rx, ry, rz, hex, x, y, z) {
  var m = new THREE.Mesh(fbGeos.ball || (fbGeos.ball = new THREE.SphereGeometry(1, 10, 8)), fbMat(hex));
  m.scale.set(rx, ry, rz); m.position.set(x, y, z); g.add(m); return m;
}
function hashHex(str, l) {
  var h = 0; for (var k = 0; k < str.length; k++) h = (h * 31 + str.charCodeAt(k)) | 0;
  var c = new THREE.Color().setHSL(((h >>> 0) % 360) / 360, 0.45, l || 0.5);
  return '#' + c.getHexString();
}
function findIn(arr, id) { if (arr) for (var k = 0; k < arr.length; k++) if (arr[k].id === id) return arr[k]; return null; }
function fallbackScenery(id) {
  var g = new THREE.Group(), m = findIn(D.scenery, id) || { kind: 'deco' };
  if (m.kind === 'tree') { fbBox(g, 0.3, 1.6, 0.3, '#6b4a2b', 0, 0.8, 0); fbBall(g, 1.3, hashHex(id, 0.35), 0, 2.4, 0); }
  else if (m.kind === 'bush') fbBall(g, 0.6, hashHex(id, 0.35), 0, 0.45, 0);
  else if (m.kind === 'rock') { var r = fbBall(g, 0.7, '#8a8680', 0, 0.35, 0); r.scale.y = 0.6; }
  else if (m.kind === 'shelter') { fbBox(g, 1.6, 1.0, 1.6, '#8a6a44', 0, 0.5, 0); fbCone(g, 1.4, 0.8, '#6a4a2c', 0, 1.4, 0); }
  else fbBox(g, 0.7, 0.7, 0.7, hashHex(id, 0.55), 0, 0.35, 0);
  return g;
}
function fallbackBuilding(id) {
  var g = new THREE.Group(), b = findIn(D.buildings, id) || { w: 1, h: 1 };
  var w = (b.w || 1) * T * 0.82, d = (b.h || 1) * T * 0.82, col = hashHex(id, 0.6);
  fbBox(g, w, 1.8, d, col, 0, 0.9, 0); fbBox(g, w * 1.1, 0.25, d * 1.1, '#9c4a3a', 0, 1.95, 0);
  return g;
}
function fallbackAnimal(sp, opts) {
  var g = new THREE.Group(), m = findIn(D.animals, sp) || { size: 1 }, s = (m.size || 1) * (opts && opts.baby ? 0.5 : 1), col = hashHex(sp, 0.5);
  fbCapsule(g, s * 0.28, s * 0.28, s * 0.54, col, 0, s * 0.72, 0);
  fbCapsule(g, s * 0.16, s * 0.20, s * 0.16, col, 0, s * 0.96, s * 0.42);
  fbCapsule(g, s * 0.17, s * 0.16, s * 0.22, col, 0, s * 1.05, s * 0.56);
  fbCapsule(g, s * 0.11, s * 0.10, s * 0.14, col, 0, s * 1.01, s * 0.72);
  fbCapsule(g, s * 0.07, s * 0.08, s * 0.34, col, 0, s * 0.68, -s * 0.66);
  fbCapsule(g, s * 0.09, s * 0.28, s * 0.09, col, s * 0.16, s * 0.28, s * 0.26);
  fbCapsule(g, s * 0.09, s * 0.28, s * 0.09, col, -s * 0.16, s * 0.28, s * 0.26);
  fbCapsule(g, s * 0.09, s * 0.28, s * 0.09, col, s * 0.16, s * 0.28, -s * 0.28);
  fbCapsule(g, s * 0.09, s * 0.28, s * 0.09, col, -s * 0.16, s * 0.28, -s * 0.28);
  return { group: g, update: function () { }, height: s * 1.3 };
}
function fallbackGuest(seed) {
  var g = new THREE.Group(), col = hashHex('g' + seed, 0.5);
  fbCapsule(g, 0.21, 0.32, 0.13, col, 0, 1.06, 0);
  fbCapsule(g, 0.08, 0.36, 0.09, '#33384a', 0.09, 0.38, 0);
  fbCapsule(g, 0.08, 0.36, 0.09, '#33384a', -0.09, 0.38, 0);
  fbCapsule(g, 0.05, 0.26, 0.05, col, 0.25, 1.08, 0);
  fbCapsule(g, 0.05, 0.26, 0.05, col, -0.25, 1.08, 0);
  fbBall(g, 0.16, '#e8b88a', 0, 1.54, 0);
  return { group: g, update: function () { }, height: 1.7 };
}
function fallbackStaff(type) {
  var g = new THREE.Group(), col = hashHex('s' + type, 0.4);
  fbCapsule(g, 0.22, 0.34, 0.14, col, 0, 1.08, 0);
  fbCapsule(g, 0.085, 0.37, 0.095, '#33384a', 0.095, 0.38, 0);
  fbCapsule(g, 0.085, 0.37, 0.095, '#33384a', -0.095, 0.38, 0);
  fbCapsule(g, 0.055, 0.27, 0.055, col, 0.26, 1.10, 0);
  fbCapsule(g, 0.055, 0.27, 0.055, col, -0.26, 1.10, 0);
  fbBall(g, 0.17, '#e8b88a', 0, 1.56, 0);
  fbCapsule(g, 0.24, 0.04, 0.24, col, 0, 1.70, 0);
  return { group: g, update: function () { }, height: 1.75 };
}
function M() { return Z.Models || {}; }

/* ------------------------------------------------------ objects system */
var objGroup, objRecs = new Map(), pools = {}, instCache = {}, objDirty = true, shMesh, shCap = 0, shList = [];
var lampList = [], lampPoints, lampLights = [], lampPosAttr, lampMats = [], lampTimer = 0, bldList = [];
var _mat = new THREE.Matrix4();

function buildObjectsSystem() {
  objGroup = new THREE.Group(); root.add(objGroup);
  var shGeo = new THREE.PlaneGeometry(2, 2); shGeo.rotateX(-PI / 2);
  G.shGeo = shGeo;
  growShadowMesh(64);
  // lamps: additive glow points + a few pooled point lights
  var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 64), 3));
  pg.setDrawRange(0, 0);
  var pm = new THREE.PointsMaterial({ size: 3.4, map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0, fog: false });
  pm.color = new THREE.Color(1, 0.92, 0.7);
  lampPoints = new THREE.Points(pg, pm); lampPoints.frustumCulled = false; lampPoints.renderOrder = 6; lampPoints.visible = false;
  root.add(lampPoints);
  for (var k = 0; k < 3; k++) {
    var pl = new THREE.PointLight(0xffc880, 0, 16, 2); pl.position.set(0, 3, 0); scene.add(pl); lampLights.push(pl);
  }
}
function growShadowMesh(cap) {
  if (shMesh) { root.remove(shMesh); }
  shCap = cap;
  shMesh = new THREE.InstancedMesh(G.shGeo, MAT.shadow, cap);
  shMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shMesh.frustumCulled = false; shMesh.renderOrder = 1; shMesh.count = 0;
  root.add(shMesh);
}
function getInst(id) {
  if (instCache[id] !== undefined) return instCache[id];
  var r = false;
  try {
    var f = M().sceneryInstancing;
    var v = f && f.call(M(), id);
    if (v && v.geometry && v.material) {
      if (!v.geometry.boundingBox) v.geometry.computeBoundingBox();
      r = v;
    }
  } catch (e) { r = false; }
  instCache[id] = r; return r;
}
function sceneryMeta(id) { return findIn(D.scenery, id) || { kind: 'deco' }; }
function buildingMeta(id) { return findIn(D.buildings, id) || { w: 1, h: 1 }; }

function makeSceneryGroup(id) {
  try { var g = M().createScenery && M().createScenery(id); if (g && g.isObject3D) return g; } catch (e) { }
  return fallbackScenery(id);
}
function makeBuildingGroup(id) {
  try { var g = M().createBuilding && M().createBuilding(id); if (g && g.isObject3D) return g; } catch (e) { }
  return fallbackBuilding(id);
}
function collectLampMats(g) {
  g.traverse(function (o) {
    if (!o.isMesh) return;
    var ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(function (m) {
      if (!m) return;
      var em = m.emissive && m.emissive.getHex() > 0, nm = /bulb|lamp|glow|light/i.test(m.name || '');
      if ((em || nm) && lampMats.indexOf(m) < 0) {
        if (m.userData._ei === undefined) m.userData._ei = m.emissiveIntensity === undefined ? 1 : m.emissiveIntensity;
        lampMats.push(m);
      }
    });
  });
}
function removeRec(rec) {
  if (rec.group) { objGroup.remove(rec.group); }
  if (rec.skirt) { objGroup.remove(rec.skirt); rec.skirt = null; }
}
// buildings stand on the highest corner of their (nearly flat) footprint, with a stone foundation filling the gap
var skirtMat = null, skirtGeo = null, postMat = null;
function enableShadows(obj, cast, recv) {
  if (!obj) return;
  obj.traverse(function (o) {
    if (o.isMesh) {
      if (cast !== undefined) o.castShadow = cast;
      if (recv !== undefined) o.receiveShadow = recv;
    }
  });
}
function placeBuilding(rec) {
  var o = rec.obj, base = footBase(o.i, o.j, rec.w, rec.h), low = footLow(o.i, o.j, rec.w, rec.h);
  rec.y = base; rec.group.position.y = base;
  if (rec.skirt) { objGroup.remove(rec.skirt); rec.skirt = null; }
  var wet = footWet(o.i, o.j, rec.w, rec.h);
  if (base - low > 0.03 || wet) {
    if (!skirtGeo) { skirtGeo = new THREE.BoxGeometry(1, 1, 1); skirtMat = new THREE.MeshLambertMaterial({ color: tcol('#8e877a') }); }
  }
  if (wet) {
    // deck on pilings: stone foundation only under the dry tiles, wooden posts over the water tiles
    if (!postMat) postMat = new THREE.MeshLambertMaterial({ color: tcol('#5b4630') });
    var grp = new THREE.Group(), w = rec.w, h = rec.h, x0 = rec.x - w * T / 2, z0 = rec.z - h * T / 2;
    var di0 = 99, di1 = -1, dj0 = 99, dj1 = -1, a, b;
    for (b = 0; b < h; b++) for (a = 0; a < w; a++) if (!wet[a + b * w]) { if (a < di0) di0 = a; if (a > di1) di1 = a; if (b < dj0) dj0 = b; if (b > dj1) dj1 = b; }
    var hgt = Math.max(base - low, 0) + 0.35, sk = new THREE.Mesh(skirtGeo, skirtMat);
    sk.scale.set((di1 - di0 + 1) * T + 0.12, hgt, (dj1 - dj0 + 1) * T + 0.12);
    sk.position.set(x0 + (di0 + di1 + 1) * T / 2 - rec.x, base - hgt / 2 - 0.01 - base, z0 + (dj0 + dj1 + 1) * T / 2 - rec.z);
    sk.castShadow = true; sk.receiveShadow = true; grp.add(sk);
    for (b = 0; b <= h; b++) for (a = 0; a <= w; a++) {
      var tw = false, td = false;
      for (var db = -1; db <= 0; db++) for (var da = -1; da <= 0; da++) {
        var ta = a + da, tb = b + db; if (ta < 0 || tb < 0 || ta >= w || tb >= h) continue;
        if (wet[ta + tb * w]) tw = true; else td = true;
      }
      if (!tw || td) continue;
      var ti = o.i + a, tj = o.j + b, bed = groundY(ti * T, tj * T), top = base - 0.1, bot = Math.min(bed, top - 0.5) - 0.2;
      var post = new THREE.Mesh(skirtGeo, postMat);
      post.scale.set(0.3, top - bot, 0.3);
      post.position.set(x0 + a * T - rec.x, (top + bot) / 2 - base, z0 + b * T - rec.z);
      post.castShadow = true; grp.add(post);
    }
    grp.position.set(rec.x, base, rec.z);
    sk.position.x = x0 + (di0 + di1 + 1) * T / 2 - rec.x; sk.position.z = z0 + (dj0 + dj1 + 1) * T / 2 - rec.z;
    objGroup.add(grp); rec.skirt = grp;
  } else if (base - low > 0.03) {
    var hgt2 = base - low + 0.35, m = new THREE.Mesh(skirtGeo, skirtMat);
    m.scale.set(rec.w * T + 0.12, hgt2, rec.h * T + 0.12); m.position.set(rec.x, base - hgt2 / 2 - 0.01, rec.z);
    m.castShadow = true; m.receiveShadow = true;
    objGroup.add(m); rec.skirt = m;
  }
}
// ground changed: re-seat everything that stands on it
function reseatWorld() {
  if (!objGroup) return;
  var pools_ = false;
  objRecs.forEach(function (r) {
    if (r.kind === 'building') { if (r.group) placeBuilding(r); return; }
    var y = groundY(r.x, r.z);
    if (Math.abs(y - r.y) < 1e-4) return;
    r.y = y;
    if (r.group) r.group.position.y = y; else if (r.inst) pools_ = true;
  });
  if (pools_) rebuildPools();
  rebuildLamps(); rebuildCageRoofs(); G.shDirty = true; G.poopSig = -1; G.litterSig = -1;
  if (pv.tiles) { if (pv.spec) setPreview(pv.spec); if (pv.encId) rebuildEncHighlight(); }
}
function syncObjects() {
  objDirty = false;
  var s = Z.state, arr = (s && s.objects) || [];
  var gen = ++G.objGen;
  var poolsDirty = false;
  for (var k = 0; k < arr.length; k++) {
    var o = arr[k], rec = objRecs.get(o.id);
    var key = o.kind + '|' + o.type + '|' + o.i + '|' + o.j + '|' + (o.rot | 0);
    if (rec && rec.key === key) { rec.gen = gen; continue; }
    if (rec) { removeRec(rec); if (rec.inst) poolsDirty = true; objRecs.delete(o.id); }
    rec = { id: o.id, key: key, obj: o, kind: o.kind, type: o.type, gen: gen, group: null, inst: null, upd: null, lamp: false };
    var rot = (o.rot | 0) & 3;
    if (o.kind === 'building') {
      var bm = buildingMeta(o.type), w = bm.w || 1, h = bm.h || 1;
      if ((rot & 1) && w !== h) { var t0 = w; w = h; h = t0; }
      rec.w = w; rec.h = h;
      rec.bType = bm.type || '';
      rec.powered = (rec.bType === 'ride' || rec.bType === 'food' || rec.bType === 'drink' || rec.bType === 'shop' || rec.bType === 'arcade');
      rec.coasterStation = !!bm.coasterStation;
      rec.x = (o.i + w / 2) * T; rec.z = (o.j + h / 2) * T; rec.y = 0;
      var g = makeBuildingGroup(o.type);
      enableShadows(g, true, true);
      g.position.set(rec.x, 0, rec.z); g.rotation.y = rot * PI / 2;
      objGroup.add(g); rec.group = g;
      placeBuilding(rec);
      if (g.userData && typeof g.userData.update === 'function') rec.upd = g.userData.update;
      rec.shR = Math.max(w, h) * T * 0.62; rec.shK = 0.9;
    } else {
      var sm = sceneryMeta(o.type), kd = sm.kind || 'deco';
      var jit = (kd === 'tree' || kd === 'bush' || kd === 'rock') ? 0.55 : 0;
      rec.x = (o.i + 0.5) * T + (h2(o.i * 3 + 1, o.j * 5 + 2) - 0.5) * jit;
      rec.z = (o.j + 0.5) * T + (h2(o.i * 7 + 3, o.j * 11 + 4) - 0.5) * jit;
      rec.y = groundY(rec.x, rec.z);
      var rnd = kd === 'tree' || kd === 'bush' || kd === 'rock' || kd === 'toy';
      rec.rot = rnd ? h2(o.i * 13 + 5, o.j * 17 + 9) * TAU : rot * PI / 2;
      rec.sc = rnd ? 0.9 + 0.25 * h2(o.i * 19 + 7, o.j * 23 + 1) : 1;
      rec.tint = 0.92 + 0.16 * h2(o.i * 29 + 2, o.j * 31 + 6);
      rec.shR = kd === 'tree' ? 1.5 : kd === 'bush' ? 0.8 : kd === 'rock' ? 0.8 : kd === 'shelter' ? 1.3 : kd === 'toy' ? 0.7 : 0.45;
      if (o.type === 'flower_bed' || o.type === 'ball' || o.type === 'tall_grass') rec.shR = 0;
      rec.shR *= rec.sc; rec.shK = kd === 'tree' ? 0.8 : 0.9;
      var inst = o.type === 'lamp' ? false : getInst(o.type);
      if (inst) { rec.inst = inst; poolsDirty = true; }
      else {
        var g2 = makeSceneryGroup(o.type);
        enableShadows(g2, !(o.type === 'flower_bed' || o.type === 'tall_grass'), true);
        g2.position.set(rec.x, rec.y, rec.z); g2.rotation.y = rec.rot; g2.scale.multiplyScalar(rec.sc);
        objGroup.add(g2); rec.group = g2;
        if (g2.userData && typeof g2.userData.update === 'function') rec.upd = g2.userData.update;
      }
      rec.lamp = o.type === 'lamp' || !!(rec.group && rec.group.userData && rec.group.userData.isLamp);
      if (rec.lamp) {
        if (rec.group) {
          var bb = new THREE.Box3().setFromObject(rec.group); rec.lampY = isFinite(bb.max.y) && bb.max.y > 0.5 ? bb.max.y * 0.95 : 3;
          collectLampMats(rec.group);
        } else rec.lampY = (rec.inst.geometry.boundingBox.max.y || 3) * 0.95 * rec.sc;
      }
    }
    objRecs.set(o.id, rec);
  }
  // remove stale
  var stale = [];
  objRecs.forEach(function (r, id) { if (r.gen !== gen) stale.push(id); });
  for (k = 0; k < stale.length; k++) { var r = objRecs.get(stale[k]); removeRec(r); if (r.inst) poolsDirty = true; objRecs.delete(stale[k]); }
  if (poolsDirty || stale.length || true) rebuildPools();
  // static shadows, lamps, building list
  shList.length = 0; lampList.length = 0; bldList.length = 0;
  objRecs.forEach(function (r) {
    if (r.shR > 0) shList.push(r);
    if (r.lamp) lampList.push(r);
    if (r.upd) bldList.push(r);
  });
  rebuildLamps();
  G.shDirty = true;
}
G.objGen = 0;
function rebuildPools() {
  var need = {};
  objRecs.forEach(function (r) { if (r.inst) need[r.type] = (need[r.type] || 0) + 1; });
  var type, p;
  for (type in need) {
    p = pools[type];
    if (!p || p.cap < need[type]) {
      var cap = Math.max(16, 1 << Math.ceil(Math.log2(need[type] + 1)));
      if (p) { root.remove(p.mesh); }
      var inst = getInst(type);
      var mesh = new THREE.InstancedMesh(inst.geometry, inst.material, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false; root.add(mesh);
      p = pools[type] = { mesh: mesh, cap: cap, count: 0 };
    }
  }
  for (type in pools) { pools[type].count = 0; }
  objRecs.forEach(function (r) {
    if (!r.inst) return;
    var p = pools[r.type], n = p.count++, a = p.mesh.instanceMatrix.array, c = Math.cos(r.rot) * r.sc, s = Math.sin(r.rot) * r.sc, b = n * 16;
    a[b] = c; a[b + 1] = 0; a[b + 2] = -s; a[b + 3] = 0; a[b + 4] = 0; a[b + 5] = r.sc; a[b + 6] = 0; a[b + 7] = 0;
    a[b + 8] = s; a[b + 9] = 0; a[b + 10] = c; a[b + 11] = 0; a[b + 12] = r.x; a[b + 13] = r.y; a[b + 14] = r.z; a[b + 15] = 1;
    var ca = p.mesh.instanceColor.array; ca[n * 3] = r.tint; ca[n * 3 + 1] = r.tint; ca[n * 3 + 2] = r.tint;
  });
  for (type in pools) {
    p = pools[type]; p.mesh.count = p.count; p.mesh.visible = p.count > 0;
    p.mesh.instanceMatrix.needsUpdate = true; p.mesh.instanceColor.needsUpdate = true;
  }
}
function writeStaticShadows() {
  G.shDirty = false;
  if (shList.length > shCap) growShadowMesh(1 << Math.ceil(Math.log2(shList.length + 1)));
  var a = shMesh.instanceMatrix.array;
  for (var k = 0; k < shList.length; k++) {
    var r = shList[k], b = k * 16, s = r.shR;
    a[b] = s; a[b + 1] = 0; a[b + 2] = 0; a[b + 3] = 0; a[b + 4] = 0; a[b + 5] = 1; a[b + 6] = 0; a[b + 7] = 0;
    a[b + 8] = 0; a[b + 9] = 0; a[b + 10] = s; a[b + 11] = 0; a[b + 12] = r.x; a[b + 13] = r.y + 0.055; a[b + 14] = r.z; a[b + 15] = 1;
  }
  shMesh.count = shList.length; shMesh.instanceMatrix.needsUpdate = true;
  G.staticShadowCount = shList.length;
}
function rebuildLamps() {
  var pos = lampPoints.geometry.attributes.position;
  if (lampList.length * 3 > pos.array.length) {
    lampPoints.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lampList.length * 3 * 2), 3));
    pos = lampPoints.geometry.attributes.position;
  }
  for (var k = 0; k < lampList.length; k++) { var l = lampList[k]; pos.array[k * 3] = l.x; pos.array[k * 3 + 1] = l.y + l.lampY; pos.array[k * 3 + 2] = l.z; }
  pos.needsUpdate = true; lampPoints.geometry.setDrawRange(0, lampList.length);
  lampTimer = 0;
}
function updateLamps(dt) {
  var powerCut = !!(Z.Sim && Z.Sim.powerCutActive && Z.Sim.powerCutActive());
  var n = powerCut ? 0 : G.night, i;
  lampPoints.visible = !powerCut && n > 0.03 && lampList.length > 0;
  lampPoints.material.opacity = clamp(n * 1.1, 0, 1);
  for (i = 0; i < lampMats.length; i++) { var m = lampMats[i]; if (m.emissiveIntensity !== undefined) m.emissiveIntensity = powerCut ? 0 : m.userData._ei * (0.35 + 2.2 * n); }
  if (G.signMat) G.signMat.emissiveIntensity = powerCut ? 0 : 0.55 * n;
  lampTimer -= dt;
  if (lampTimer <= 0) {
    lampTimer = 0.4;
    for (i = 0; i < lampLights.length; i++) {
      var best = -1, bd = 1e9;
      for (var k = 0; k < lampList.length; k++) {
        var l = lampList[k], dx = l.x - view.x, dz = l.z - view.z, d = dx * dx + dz * dz;
        if (d < bd && l._u !== G.frameNo) { bd = d; best = k; }
      }
      var pl = lampLights[i];
      if (best >= 0 && n > 0.03 && bd < 70 * 70) {
        var lb = lampList[best]; lb._u = G.frameNo;
        pl.position.set(lb.x, lb.y + lb.lampY, lb.z); pl.userData.target = 1.5 * n;
      } else pl.userData.target = 0;
    }
  }
  for (i = 0; i < lampLights.length; i++) { var p = lampLights[i]; p.intensity += ((p.userData.target || 0) - p.intensity) * Math.min(1, dt * 6); }
}

/* ----------------------------------------------------------- entity system */
var ents = { animal: new Map(), guest: new Map(), staff: new Map() };
var entGroup, entShMesh, entShCap = 0, bubbleList = [], MAXB = 12;
var impG, impH, impA, visList = [], MESH_BUDGET = 2400, IMPOSTORS_ON = false;
var IMP_CLS = ['quad', 'biped', 'tall', 'aero'];
var IMP_MAP = {
  giraffe: 'tall', flamingo: 'tall', ostrich: 'tall', nessie: 'tall',
  gorilla: 'biped', chimpanzee: 'biped', orangutan: 'biped', sasquatch: 'biped',
  kangaroo: 'biped', penguin: 'biped', meerkat: 'biped', puss_in_boots: 'biped', peacock: 'biped',
  phoenix: 'aero', griffin: 'aero', winged_monkey: 'aero',
  purple_dragon: 'aero', pugon: 'aero', drassy: 'aero'
};
function animalImpCls(sp) { return IMP_MAP[sp] || 'quad'; }
var KIND_ARR = { animal: 'animals', guest: 'guests', staff: 'staff' };
function mkImp(geo, mat, cap) {
  var im = new THREE.InstancedMesh(geo, mat, cap);
  im.setColorAt(0, new THREE.Color(1, 1, 1));
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false;
  im.castShadow = true; im.receiveShadow = true; im.count = 0; root.add(im); return im;
}
function addPartGeo(mb, geo, sx, sy, sz, px, py, pz, rx, col, ry, rz) {
  var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(rx || 0, ry || 0, rz || 0);
  q.setFromEuler(e); m.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(sx, sy, sz));
  mb.addSmoothGeo(geo, m, col);
}
function buildGuestImpostorGeo() {
  var mbB = new MB(), mbH = new MB();
  var legC = [0.58, 0.58, 0.62], shoeC = [0.32, 0.32, 0.36], torsoC = [1, 1, 1], neckC = [0.92, 0.84, 0.78];
  var sph = new THREE.SphereGeometry(1, 10, 7);
  var legCyl = new THREE.CylinderGeometry(0.085, 0.062, 0.74, 8), torCyl = new THREE.CylinderGeometry(0.21, 0.17, 0.56, 10);
  var armCyl = new THREE.CylinderGeometry(0.056, 0.04, 0.54, 8), neckCyl = new THREE.CylinderGeometry(0.056, 0.068, 0.12, 8);
  addPartGeo(mbB, sph, 0.075, 0.048, 0.125, 0.10, 0.048, 0.04, 0, shoeC);
  addPartGeo(mbB, sph, 0.075, 0.048, 0.125, -0.10, 0.048, 0.04, 0, shoeC);
  addPartGeo(mbB, legCyl, 1, 1, 1, 0.10, 0.41, 0, 0, legC);
  addPartGeo(mbB, legCyl, 1, 1, 1, -0.10, 0.41, 0, 0, legC);
  addPartGeo(mbB, sph, 0.21, 0.12, 0.14, 0, 0.78, 0, 0, [0.65, 0.65, 0.68]);
  addPartGeo(mbB, torCyl, 1.05, 1.0, 0.66, 0, 1.08, 0, 0, torsoC);
  addPartGeo(mbB, sph, 0.25, 0.10, 0.14, 0, 1.34, 0, 0, torsoC);
  addPartGeo(mbB, armCyl, 1, 1, 1, 0.26, 1.08, 0, 0, [0.95, 0.95, 0.95]);
  addPartGeo(mbB, armCyl, 1, 1, 1, -0.26, 1.08, 0, 0, [0.95, 0.95, 0.95]);
  addPartGeo(mbB, neckCyl, 1, 1, 1, 0, 1.43, 0, 0, neckC);
  var hairGeo = new THREE.SphereGeometry(0.174, 10, 6, 0, TAU, 0, PI * 0.56);
  addPartGeo(mbH, sph, 0.158, 0.172, 0.16, 0, 1.59, 0, 0, [0.92, 0.74, 0.58]);
  addPartGeo(mbH, hairGeo, 1, 1, 1, 0, 1.61, -0.01, 0, [0.35, 0.25, 0.18]);
  return { body: mbB.geometry(), head: mbH.geometry() };
}
function buildAnimalImpostorGeo(cls) {
  var mb = new MB();
  var sph = new THREE.SphereGeometry(1, 9, 6);
  if (cls === 'biped') {
    var bLeg = new THREE.CylinderGeometry(0.068, 0.048, 0.38, 6);
    var bNeck = new THREE.CylinderGeometry(0.08, 0.11, 0.14, 6);
    var bArm = new THREE.CylinderGeometry(0.052, 0.036, 0.36, 6);
    var bTail = new THREE.CylinderGeometry(0.022, 0.065, 0.30, 6);
    addPartGeo(mb, sph, 0.20, 0.28, 0.17, 0, 0.56, 0, 0.18, [1, 1, 1]);
    addPartGeo(mb, sph, 0.21, 0.16, 0.16, 0, 0.70, 0.04, 0, [0.96, 0.96, 0.96]);
    addPartGeo(mb, bNeck, 1, 1, 1, 0, 0.84, 0.06, 0.15, [0.95, 0.95, 0.95]);
    addPartGeo(mb, sph, 0.115, 0.12, 0.13, 0, 0.93, 0.08, 0, [0.95, 0.95, 0.95]);
    addPartGeo(mb, sph, 0.065, 0.06, 0.09, 0, 0.90, 0.18, 0, [0.91, 0.91, 0.91]);
    addPartGeo(mb, bLeg, 1, 1, 1, 0.11, 0.19, 0, 0, [0.84, 0.84, 0.84]);
    addPartGeo(mb, bLeg, 1, 1, 1, -0.11, 0.19, 0, 0, [0.84, 0.84, 0.84]);
    addPartGeo(mb, sph, 0.065, 0.035, 0.10, 0.11, 0.035, 0.05, 0, [0.80, 0.80, 0.80]);
    addPartGeo(mb, sph, 0.065, 0.035, 0.10, -0.11, 0.035, 0.05, 0, [0.80, 0.80, 0.80]);
    addPartGeo(mb, bArm, 1, 1, 1, 0.22, 0.56, 0.06, 0.32, [0.88, 0.88, 0.88]);
    addPartGeo(mb, bArm, 1, 1, 1, -0.22, 0.56, 0.06, 0.32, [0.88, 0.88, 0.88]);
    addPartGeo(mb, bTail, 1, 1, 1, 0, 0.34, -0.18, -1.05, [0.86, 0.86, 0.86]);
    return mb.geometry();
  }
  if (cls === 'tall') {
    var tLeg = new THREE.CylinderGeometry(0.052, 0.034, 0.38, 6);
    var tNeckA = new THREE.CylinderGeometry(0.075, 0.115, 0.32, 7), tNeckB = new THREE.CylinderGeometry(0.048, 0.075, 0.34, 7);
    var tTail = new THREE.CylinderGeometry(0.015, 0.065, 0.40, 6);
    addPartGeo(mb, sph, 0.20, 0.16, 0.28, 0, 0.38, -0.02, 0, [1, 1, 1]);
    addPartGeo(mb, sph, 0.18, 0.15, 0.16, 0, 0.40, 0.14, 0, [0.96, 0.96, 0.96]);
    addPartGeo(mb, tLeg, 1, 1, 1, 0.12, 0.19, 0.14, 0, [0.84, 0.84, 0.84]);
    addPartGeo(mb, tLeg, 1, 1, 1, -0.12, 0.19, 0.14, 0, [0.84, 0.84, 0.84]);
    addPartGeo(mb, tLeg, 1, 1, 1, 0.12, 0.19, -0.18, 0, [0.84, 0.84, 0.84]);
    addPartGeo(mb, tLeg, 1, 1, 1, -0.12, 0.19, -0.18, 0, [0.84, 0.84, 0.84]);
    addPartGeo(mb, tNeckA, 1, 1, 1, 0, 0.55, 0.22, 0.28, [0.96, 0.96, 0.96]);
    addPartGeo(mb, tNeckB, 1, 1, 1, 0, 0.81, 0.28, 0.12, [0.95, 0.95, 0.95]);
    addPartGeo(mb, sph, 0.075, 0.068, 0.11, 0, 0.96, 0.33, 0, [0.94, 0.94, 0.94]);
    addPartGeo(mb, sph, 0.048, 0.045, 0.08, 0, 0.94, 0.42, 0, [0.91, 0.91, 0.91]);
    addPartGeo(mb, tTail, 1, 1, 1, 0, 0.34, -0.36, -1.25, [0.88, 0.88, 0.88]);
    return mb.geometry();
  }
  if (cls === 'aero') {
    var aNeck = new THREE.CylinderGeometry(0.055, 0.085, 0.22, 7), aBeak = new THREE.CylinderGeometry(0.012, 0.045, 0.16, 6);
    var aTail = new THREE.CylinderGeometry(0.02, 0.07, 0.34, 6), aLeg = new THREE.CylinderGeometry(0.032, 0.020, 0.24, 5);
    addPartGeo(mb, sph, 0.17, 0.15, 0.34, 0, 0.52, 0, 0, [1, 1, 1]);
    addPartGeo(mb, aNeck, 1, 1, 1, 0, 0.58, 0.28, 1.15, [0.96, 0.96, 0.96]);
    addPartGeo(mb, sph, 0.08, 0.075, 0.11, 0, 0.62, 0.40, 0, [0.95, 0.95, 0.95]);
    addPartGeo(mb, aBeak, 1, 1, 1, 0, 0.61, 0.52, 1.57, [0.92, 0.92, 0.92]);
    addPartGeo(mb, aTail, 1, 1, 1, 0, 0.50, -0.36, -1.48, [0.88, 0.88, 0.88]);
    addPartGeo(mb, sph, 0.14, 0.022, 0.09, 0, 0.50, -0.50, 0, [0.86, 0.86, 0.86]);
    addPartGeo(mb, sph, 0.25, 0.032, 0.14, 0.28, 0.56, 0.03, 0, [0.94, 0.94, 0.94], -0.18, 0.10);
    addPartGeo(mb, sph, 0.25, 0.032, 0.14, -0.28, 0.56, 0.03, 0, [0.94, 0.94, 0.94], 0.18, -0.10);
    addPartGeo(mb, sph, 0.22, 0.022, 0.09, 0.54, 0.59, -0.06, 0, [0.88, 0.88, 0.88], -0.30, 0.16);
    addPartGeo(mb, sph, 0.22, 0.022, 0.09, -0.54, 0.59, -0.06, 0, [0.88, 0.88, 0.88], 0.30, -0.16);
    addPartGeo(mb, aLeg, 1, 1, 1, 0.10, 0.30, 0.08, 0, [0.82, 0.82, 0.82]);
    addPartGeo(mb, aLeg, 1, 1, 1, -0.10, 0.30, 0.08, 0, [0.82, 0.82, 0.82]);
    return mb.geometry();
  }
  var legCyl = new THREE.CylinderGeometry(0.068, 0.044, 0.48, 7);
  var neckCyl = new THREE.CylinderGeometry(0.10, 0.16, 0.34, 7), tailCyl = new THREE.CylinderGeometry(0.02, 0.075, 0.42, 6);
  addPartGeo(mb, sph, 0.25, 0.24, 0.38, 0, 0.56, -0.02, 0, [1, 1, 1]);
  addPartGeo(mb, sph, 0.22, 0.22, 0.20, 0, 0.58, 0.18, 0, [0.96, 0.96, 0.96]);
  addPartGeo(mb, sph, 0.22, 0.22, 0.20, 0, 0.53, -0.22, 0, [0.95, 0.95, 0.95]);
  addPartGeo(mb, neckCyl, 1, 1, 1, 0, 0.72, 0.31, 0.65, [0.96, 0.96, 0.96]);
  addPartGeo(mb, sph, 0.12, 0.12, 0.16, 0, 0.87, 0.43, 0, [0.95, 0.95, 0.95]);
  addPartGeo(mb, sph, 0.08, 0.08, 0.11, 0, 0.83, 0.54, 0, [0.92, 0.92, 0.92]);
  addPartGeo(mb, legCyl, 1, 1, 1, 0.14, 0.24, 0.18, 0, [0.84, 0.84, 0.84]);
  addPartGeo(mb, legCyl, 1, 1, 1, -0.14, 0.24, 0.18, 0, [0.84, 0.84, 0.84]);
  addPartGeo(mb, legCyl, 1, 1, 1, 0.14, 0.24, -0.22, 0, [0.84, 0.84, 0.84]);
  addPartGeo(mb, legCyl, 1, 1, 1, -0.14, 0.24, -0.22, 0, [0.84, 0.84, 0.84]);
  addPartGeo(mb, tailCyl, 1, 1, 1, 0, 0.52, -0.46, -1.05, [0.88, 0.88, 0.88]);
  return mb.geometry();
}
function buildEntitySystem() {
  entGroup = new THREE.Group(); root.add(entGroup);
  entShCap = 800;
  entShMesh = new THREE.InstancedMesh(G.shGeo, MAT.shadow, entShCap);
  entShMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); entShMesh.frustumCulled = false; entShMesh.renderOrder = 1; entShMesh.count = 0;
  root.add(entShMesh);
  // sculpted organic silhouettes for distant impostors (only used if enabled)
  var gGeo = buildGuestImpostorGeo(), aMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  impG = mkImp(gGeo.body, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 600);
  impH = mkImp(gGeo.head, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 600);
  impA = {};
  for (var ci = 0; ci < IMP_CLS.length; ci++) impA[IMP_CLS[ci]] = mkImp(buildAnimalImpostorGeo(IMP_CLS[ci]), aMat, 300);
}
function makeVis(kind, e) {
  var v = null;
  try {
    var m = M();
    if (kind === 'animal' && m.createAnimal) v = m.createAnimal(e.species, { baby: !!e.baby, sex: e.sex });
    else if (kind === 'guest' && m.createGuest) v = m.createGuest(e.seed | 0);
    else if (kind === 'staff' && m.createStaff) v = m.createStaff(e.type);
  } catch (err) { v = null; }
  if (!v || !v.group || !v.group.isObject3D) {
    v = kind === 'animal' ? fallbackAnimal(e.species, { baby: e.baby }) : kind === 'guest' ? fallbackGuest(e.seed | 0) : fallbackStaff(e.type);
  }
  return v;
}
var _shBox = new THREE.Box3();
function addEnt(kind, e) {
  var v = makeVis(kind, e);
  var am = kind === 'animal' ? findIn(D.animals, e.species) : null;
  var ht = (isFin(v.height) && v.height > 0) ? v.height : (kind === 'animal' ? Math.max(0.5, ((am && am.size) || 1) * 1.2) : 1.7);
  var rad = kind === 'animal' ? clamp(0.4 + ((am && am.size) || 1) * 0.55, 0.55, 2.4) * (e.baby ? 0.6 : 1) : kind === 'guest' ? 0.38 : 0.42;
  var shW = rad, shL = rad, shZ = 0;
  if (kind === 'animal') {
    _shBox.setFromObject(v.group);
    if (!_shBox.isEmpty() && isFin(_shBox.min.x) && isFin(_shBox.max.x) && isFin(_shBox.min.z) && isFin(_shBox.max.z)) {
      var bw = _shBox.max.x - _shBox.min.x, bl = _shBox.max.z - _shBox.min.z;
      shW = clamp(bw * 0.44, 0.35, 2.0);
      shL = clamp(bl * 0.40, 0.42, 4.6);
      if (shW > Math.max(1.4, shL * 0.95)) shW = Math.max(1.4, shL * 0.95);
      shZ = clamp((_shBox.min.z + _shBox.max.z) * 0.15, -0.9, 0.9);
    }
  }
  var mc = 0; v.group.traverse(function (o) { if (o.isMesh) mc++; });
  var colSeed = kind === 'animal' ? hash32(String(e.species)) : kind === 'guest' ? (e.seed | 0) * 2654435761 : hash32(String(e.type));
  var c = new THREE.Color().setHSL((((colSeed >>> 0) % 360) / 360), kind === 'animal' ? 0.32 : 0.55, kind === 'animal' ? 0.46 : 0.5);
  if (kind === 'animal') { var ac = avgColour(v.group); if (ac) c = ac; }
  var rec = { kind: kind, id: e.id, ent: e, vis: v, group: v.group, h: fin(e.heading, 0), baby: !!e.baby, acc: 0, phase: (e.id | 0) % 3, ht: ht, rad: rad, shW: shW, shL: shL, shZ: shZ, impCls: kind === 'animal' ? animalImpCls(e.species) : null, bad: false, fresh: true, stamp: 0, thought: null, cat: 'happy', mc: Math.max(1, mc), sz: (am && am.size) || 1, len: (am && am.length) || 0, col: c, imp: false, d2: 0, gy: 0 };
  enableShadows(v.group, true, true);
  v.group.position.set(fin(e.x, 0), 0, fin(e.z, 0));
  entGroup.add(v.group);
  ents[kind].set(e.id, rec);
  return rec;
}
function avgColour(g) {
  var best = null, bc = 0;
  g.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.count > bc) { bc = o.geometry.attributes.position.count; best = o; } });
  if (!best) return null;
  var ca = best.geometry.attributes.color, r = 1, gg = 1, b = 1;
  if (ca) {
    var n = ca.count, step = Math.max(1, (n / 64) | 0), sr = 0, sg = 0, sb = 0, k = 0;
    for (var i = 0; i < n; i += step) { sr += ca.getX(i); sg += ca.getY(i); sb += ca.getZ(i); k++; }
    if (!k) return null;
    r = sr / k; gg = sg / k; b = sb / k;
  }
  var mc = best.material && best.material.color;
  if (mc) { r *= mc.r; gg *= mc.g; b *= mc.b; }
  if (!isFin(r) || !isFin(gg) || !isFin(b)) return null;
  return new THREE.Color(r, gg, b);
}
function hash32(str) { var h = 0; for (var k = 0; k < str.length; k++) h = (Math.imul(h, 31) + str.charCodeAt(k)) | 0; return h; }
function removeEnt(kind, id) {
  var m = ents[kind], r = m.get(id);
  if (r) { entGroup.remove(r.group); m.delete(id); }
}
function clearEnts() { ['animal', 'guest', 'staff'].forEach(function (k) { ents[k].forEach(function (r) { entGroup.remove(r.group); }); ents[k].clear(); }); }

var _sph = new THREE.Sphere(), _fr = new THREE.Frustum(), _vp = new THREE.Matrix4();
var FAR = { animal: 340, guest: 200, staff: 240 }, UPD_FAR = { animal: 130, guest: 85, staff: 95 };
function cmpFar(a, b) { return b.score - a.score; }
function updateEntities(dt, dtGame) {
  var s = Z.state; if (!s) return;
  var cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, sa = entShMesh.instanceMatrix.array;
  var kinds = ['animal', 'guest', 'staff'], ki, k, rec, e;
  bubbleList.length = 0; visList.length = 0;
  var totalMc = 0;
  // pass 1: reconcile, cull, place
  for (ki = 0; ki < 3; ki++) {
    var kind = kinds[ki], arr = s[KIND_ARR[kind]] || [], map = ents[kind], far2 = FAR[kind] * FAR[kind];
    for (k = 0; k < arr.length; k++) {
      e = arr[k]; rec = map.get(e.id);
      if (!rec) rec = addEnt(kind, e);
      else {
        rec.ent = e;
        if (kind === 'animal' && !!e.baby !== rec.baby) { entGroup.remove(rec.group); map.delete(e.id); rec = addEnt(kind, e); }
      }
      rec.stamp = G.frameNo;
      var x = fin(e.x, 0), z = fin(e.z, 0);
      var dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz + cy * cy;
      var vis = isFin(d2) && d2 < far2;
      if (vis && kind === 'guest' && e.state === 'resort_sleep') vis = false;
      if (vis && SV.blend > 0.4 && dx * dx + dz * dz < 0.9) vis = false; // street view: never draw a body around the camera
      var alt = (e.y || 0) + (e.flyAlt || 0);
      var hasAbsY = typeof e.absY === 'number' && isFin(e.absY);
      if (vis) { _sph.center.set(x, (hasAbsY ? e.absY : groundY(x, z) + alt) + rec.ht * 0.5, z); _sph.radius = rec.ht * 0.8 + 1.2; vis = _fr.intersectsSphere(_sph); }
      rec.vis_ = vis; rec.imp = false;
      if (!vis) { rec.group.visible = false; continue; }
      rec.d2 = d2;
      var gy;
      var wl = waterLvlAt(x, z);
      if (hasAbsY) { gy = e.absY; rec.gy = e.absY; rec.gy0 = groundY(x, z); }
      else {
        if (e.state === 'swim') gy = wl > -50 ? wl : groundY(x, z) + WATER_Y;
        else if (e.state === 'boat' && wl > -50) gy = wl + (e.boatY || 0.3);
        else {
          var ti = (x / T) | 0, tj = (z / T) | 0, onPath = ti >= 0 && tj >= 0 && ti < N && tj < N && s.path && s.path[ti + tj * N];
          gy = onPath && wl > -50 ? wl + PONTOON_Y : groundY(x, z) + (onPath ? PY : 0);
        }
        rec.gy = gy + alt; rec.gy0 = gy;
      }
      rec.wl = wl;
      rec.score = kind === 'animal' ? d2 * 0.15 : d2;
      visList.push(rec); totalMc += rec.mc;
    }
    if (map.size > arr.length || (G.frameNo % 30) === 0) {
      var stale = null;
      map.forEach(function (r, id) { if (r.stamp !== G.frameNo) (stale || (stale = [])).push(id); });
      if (stale) for (var q = 0; q < stale.length; q++) removeEnt(kind, stale[q]);
    }
  }
  // pass 2: budget governor - farthest entities become sculpted impostors (only if IMPOSTORS_ON && beyond close threshold)
  var nG = 0, nA = { quad: 0, biped: 0, tall: 0, aero: 0 }, nATot = 0, n = visList.length;
  if (IMPOSTORS_ON && totalMc > MESH_BUDGET) {
    visList.sort(cmpFar);
    for (k = 0; k < n && totalMc > MESH_BUDGET; k++) {
      var vr = visList[k];
      if (vr.d2 < (vr.kind === 'animal' ? 140 * 140 : 85 * 85)) continue;
      vr.imp = true; totalMc -= vr.mc - 0.02;
    }
  }
  // pass 3: animate real ones, write impostors/shadows
  var nsh = 0, ga = impG.instanceMatrix.array, gc = impG.instanceColor.array, ha = impH.instanceMatrix.array;
  for (k = 0; k < n; k++) {
    rec = visList[k]; e = rec.ent; var g = rec.group, x2 = fin(e.x, 0), z2 = fin(e.z, 0), gy2 = fin(rec.gy, 0);
    if (!isFin(rec.h)) rec.h = 0;
    var isFight = e.state === 'fight';
    if (dtGame > 0) {
      if (isFight) rec.h = wrapPI(rec.h + dtGame * 18);
      else { var dh = wrapPI(fin(e.heading, rec.h) - rec.h); rec.h += dh * Math.min(1, dtGame * 9); }
    }
    var fightRock = 0;
    if (isFight) {
      var fph = G.t * 22 + (e.id | 0) * 1.7;
      gy2 += Math.abs(Math.sin(fph)) * 0.32;
      fightRock = Math.sin(fph * 1.15) * 0.35;
    }
    var c = Math.cos(rec.h), sn = Math.sin(rec.h);
    if (rec.imp) {
      g.visible = false;
      var b;
      if (rec.kind === 'animal') {
        var cls = rec.impCls || 'quad', cntA = nA[cls];
        if (cntA < 300) {
          var imA = impA[cls], aa = imA.instanceMatrix.array, ac = imA.instanceColor.array;
          b = cntA * 16; var sz = rec.sz * (e.baby ? 0.55 : 1), w = sz * 0.85 + 0.2, hh = Math.max(rec.ht, sz * 0.85 + 0.15), l = (rec.len ? rec.len * (e.baby ? 0.55 : 1) * 0.95 : sz * 1.25) + 0.3;
          aa[b] = c * w; aa[b + 1] = 0; aa[b + 2] = -sn * w; aa[b + 3] = 0; aa[b + 4] = 0; aa[b + 5] = hh; aa[b + 6] = 0; aa[b + 7] = 0;
          aa[b + 8] = sn * l; aa[b + 9] = 0; aa[b + 10] = c * l; aa[b + 11] = 0; aa[b + 12] = x2; aa[b + 13] = gy2; aa[b + 14] = z2; aa[b + 15] = 1;
          ac[cntA * 3] = rec.col.r; ac[cntA * 3 + 1] = rec.col.g; ac[cntA * 3 + 2] = rec.col.b;
          nA[cls] = cntA + 1; nATot++;
        }
      } else if (nG < 600) {
        var hs = rec.ht / 1.75; b = nG * 16;
        ga[b] = c * hs; ga[b + 1] = 0; ga[b + 2] = -sn * hs; ga[b + 3] = 0; ga[b + 4] = 0; ga[b + 5] = hs; ga[b + 6] = 0; ga[b + 7] = 0;
        ga[b + 8] = sn * hs; ga[b + 9] = 0; ga[b + 10] = c * hs; ga[b + 11] = 0; ga[b + 12] = x2; ga[b + 13] = gy2; ga[b + 14] = z2; ga[b + 15] = 1;
        for (var hi = 0; hi < 16; hi++) ha[b + hi] = ga[b + hi];
        gc[nG * 3] = rec.col.r; gc[nG * 3 + 1] = rec.col.g; gc[nG * 3 + 2] = rec.col.b; nG++;
      }
    } else {
      g.visible = true;
      g.position.set(x2, gy2, z2); g.rotation.y = rec.h; g.rotation.z = fightRock;
      if (!rec.bad && (dtGame > 0 || rec.fresh)) {
        var step = dtGame;
        if (rec.fresh) { step = 0.016; rec.fresh = false; }
        else if (rec.d2 > UPD_FAR[rec.kind] * UPD_FAR[rec.kind] && ((G.frameNo + rec.phase) % 3)) { rec.acc += step; step = -1; }
        if (step >= 0) {
          var tt = Math.min(0.3, step + rec.acc); rec.acc = 0;
          try { rec.vis.update && rec.vis.update(tt, e); } catch (err) { rec.bad = true; if (window.console) console.warn('Z.World: model update failed', rec.kind, err); }
        }
      }
      if (rec.kind === 'guest' && e.thoughtT > 0 && e.thought && rec.d2 < 2300 && bubbleList.length < MAXB) bubbleList.push(rec);
    }
    if (nsh < entShCap) {
      var altK = rec.kind === 'animal' ? Math.max(0.45, 1 - Math.max(0, (e.flyAlt || 0) + (e.y || 0)) * 0.05) : 1;
      var sw = rec.shW * altK, sl = rec.shL * altK, bs = nsh * 16;
      var sc = rec.kind === 'animal' ? c : 1, ss = rec.kind === 'animal' ? sn : 0;
      var sxOff = rec.kind === 'animal' ? ss * rec.shZ * altK : 0;
      var szOff = rec.kind === 'animal' ? sc * rec.shZ * altK : 0;
      sa[bs] = sc * sw; sa[bs + 1] = 0; sa[bs + 2] = -ss * sw; sa[bs + 3] = 0; sa[bs + 4] = 0; sa[bs + 5] = 1; sa[bs + 6] = 0; sa[bs + 7] = 0;
      sa[bs + 8] = ss * sl; sa[bs + 9] = 0; sa[bs + 10] = sc * sl; sa[bs + 11] = 0; sa[bs + 12] = x2 + sxOff; sa[bs + 13] = Math.max(rec.gy0, rec.wl) + 0.06; sa[bs + 14] = z2 + szOff; sa[bs + 15] = 1;
      nsh++;
    }
  }
  entShMesh.count = nsh; entShMesh.instanceMatrix.needsUpdate = true;
  impG.count = nG; impH.count = nG;
  impG.instanceMatrix.needsUpdate = true; impH.instanceMatrix.needsUpdate = true;
  impG.instanceColor.needsUpdate = true;
  for (var ci = 0; ci < IMP_CLS.length; ci++) {
    var ck = IMP_CLS[ci], imC = impA[ck];
    imC.count = nA[ck];
    if (nA[ck] > 0) { imC.instanceMatrix.needsUpdate = true; imC.instanceColor.needsUpdate = true; }
  }
  G.entStats = { visible: n, impostors: nG + nATot, meshes: Math.round(totalMc) };
}
function updateBuildings(dtGame) {
  var t = G.t;
  var powerCut = !!(Z.Sim && Z.Sim.powerCutActive && Z.Sim.powerCutActive());
  for (var k = 0; k < bldList.length; k++) {
    var r = bldList[k], dx = r.x - view.x, dz = r.z - view.z;
    if (!r.upd) continue;
    if (r.obj && (r.obj.broken || r.obj.paused)) continue;
    if (powerCut && r.powered) continue;
    if (r.coasterStation && Z.Coaster && Z.Coaster.stationInfo) {
      var stInfo = Z.Coaster.stationInfo(r.obj.id);
      if (stInfo && (stInfo.broken || stInfo.paused)) continue;
    }
    if (dx * dx + dz * dz > 130 * 130 && (G.frameNo & 7)) continue;
    try { r.upd.call(r.group.userData, dtGame, t, r.group); } catch (e) { r.upd = null; }
  }
}
function entityRec(kind, id) { var m = ents[kind]; return m ? m.get(id) : null; }

/* --------------------------------------------- overlays: bubbles, floaters */
var EMOJI = { happy: '😊', hungry: '🍔', thirsty: '🥤', toilet: '🚻', bored: '😐', tired: '😴', dirty: '🗑️', animalsUnhappy: '😟', enclosureCrowded: '😟', expensive: '💸', cheap: '👍', crowded: '👥', escaped: '❗', flyingMonkey: '🦇', baby: '🍼', greatExhibit: '🤩', cantSee: '🙈', noBench: '🪑', leaving: '👋', coaster: '🎢', arcade: '🎯', candyFloss: '🍭' };
var BUB = {}, EMO = {}, bubSprites = [], floaters = [], emotes = [], thoughtCache = {};
var thoughtIdx = null;
function mkSpriteMat(canvas) {
  var t = texFrom(canvas, false);
  return new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false });
}
function drawBubble(emoji, tint) {
  var c = mkCanvas(128, 128), x = c.getContext('2d');
  x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 6; x.shadowOffsetY = 2;
  x.fillStyle = '#ffffff'; x.strokeStyle = tint || '#555'; x.lineWidth = 4;
  x.beginPath();
  var l = 10, t = 8, r = 118, b = 92, rad = 24;
  x.moveTo(l + rad, t); x.arcTo(r, t, r, b, rad); x.arcTo(r, b, l, b, rad);
  x.lineTo(76, b); x.lineTo(64, 116); x.lineTo(52, b);
  x.arcTo(l, b, l, t, rad); x.arcTo(l, t, r, t, rad); x.closePath();
  x.fill(); x.shadowColor = 'transparent'; x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '58px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.fillStyle = '#222'; x.fillText(emoji, 64, 52);
  return c;
}
function drawEmote(kind) {
  var c = mkCanvas(96, 96), x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (kind === 'heart') {
    x.font = '70px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText('❤️', 48, 52);
    x.fillStyle = '#e8365d'; // vector fallback underlay
  } else if (kind === 'bite' || kind === 'egg') {
    x.font = '70px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillStyle = '#fff'; x.fillText(kind === 'bite' ? '🦷' : '🥚', 48, 52);
    if (kind === 'bite') { x.strokeStyle = '#e63a2e'; x.lineWidth = 6; x.beginPath(); x.arc(48, 48, 40, 0, TAU); x.stroke(); }
  } else if (kind === 'fight') {
    x.save(); x.translate(48, 48);
    var spikes = 10, i, r, ang;
    x.beginPath();
    for (i = 0; i < spikes * 2; i++) {
      r = (i & 1) ? 22 : 42; ang = (i * PI) / spikes - PI / 2;
      if (i === 0) x.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); else x.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    x.closePath(); x.fillStyle = '#ff3b1f'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#ffdf2b'; x.stroke();
    x.beginPath();
    for (i = 0; i < spikes * 2; i++) {
      r = (i & 1) ? 13 : 27; ang = (i * PI) / spikes - PI / 2 + 0.15;
      if (i === 0) x.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); else x.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    x.closePath(); x.fillStyle = '#ffd93d'; x.fill();
    x.restore();
    x.font = '46px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText('💥', 48, 50);
  } else {
    x.fillStyle = '#e63a2e'; x.strokeStyle = '#fff'; x.lineWidth = 5;
    x.beginPath(); x.arc(48, 48, 36, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 60px Arial, sans-serif'; x.fillText('!', 48, 52);
  }
  return c;
}
function drawMoney(c, text, good) {
  var x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 44px "Trebuchet MS", Arial, sans-serif';
  x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.65)'; x.lineJoin = 'round'; x.strokeText(text, c.width / 2, c.height / 2 + 2);
  x.fillStyle = good ? '#7dff8a' : '#ff7a6a'; x.fillText(text, c.width / 2, c.height / 2 + 2);
}
function buildOverlays() {
  Object.keys(EMOJI).forEach(function (k) { BUB[k] = mkSpriteMat(drawBubble(EMOJI[k], k === 'escaped' ? '#c33' : '#556')); });
  EMO.heart = mkSpriteMat(drawEmote('heart')); EMO.alert = mkSpriteMat(drawEmote('alert')); EMO.bite = mkSpriteMat(drawEmote('bite')); EMO.egg = mkSpriteMat(drawEmote('egg')); EMO.fight = mkSpriteMat(drawEmote('fight'));
  var k, sp;
  for (k = 0; k < MAXB; k++) { sp = new THREE.Sprite(BUB.happy); sp.visible = false; sp.renderOrder = 10; root.add(sp); bubSprites.push(sp); }
  for (k = 0; k < 14; k++) {
    var c = mkCanvas(256, 80), tex = texFrom(c, false);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
    sp = new THREE.Sprite(mat); sp.visible = false; sp.renderOrder = 12; root.add(sp);
    floaters.push({ sp: sp, canvas: c, tex: tex, life: 0, max: 1.6, x: 0, y: 0, z: 0 });
  }
  for (k = 0; k < 8; k++) {
    sp = new THREE.Sprite(EMO.heart); sp.visible = false; sp.renderOrder = 11; root.add(sp);
    emotes.push({ sp: sp, life: 0, max: 2.2, x: 0, y: 0, z: 0 });
  }
  // poop and litter
  var pg = new THREE.IcosahedronGeometry(0.15, 0); pg.scale(1, 0.62, 1);
  G.poopMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: tcol('#5a3a1e') }), 700);
  G.poopMesh.count = 0; G.poopMesh.frustumCulled = false; G.poopMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(G.poopMesh);
  var lg = new THREE.BoxGeometry(0.2, 0.025, 0.14);
  G.litterMesh = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ color: 0xffffff }), 900);
  G.litterMesh.setColorAt(0, new THREE.Color(1, 1, 1)); G.litterMesh.count = 0; G.litterMesh.frustumCulled = false; root.add(G.litterMesh);
  G.poopSig = -1; G.litterSig = -1; G.ovTimer = 0;
}
function buildThoughtIndex() {
  thoughtIdx = []; thoughtCache = {};
  var gt = D.guestThoughts || {};
  Object.keys(gt).forEach(function (cat) {
    (gt[cat] || []).forEach(function (str) {
      var p = str.split('{animal}');
      thoughtIdx.push({ cat: cat, pre: p[0], post: p.length > 1 ? p[1] : null, str: str });
    });
  });
}
function thoughtCat(text) {
  if (!thoughtIdx) buildThoughtIndex();
  var c = thoughtCache[text]; if (c) return c;
  var res = null;
  for (var k = 0; k < thoughtIdx.length && !res; k++) {
    var t = thoughtIdx[k];
    if (t.post === null) { if (t.str === text) res = t.cat; }
    else if (text.length >= t.pre.length + t.post.length && text.indexOf(t.pre) === 0 && text.lastIndexOf(t.post) === text.length - t.post.length) res = t.cat;
  }
  if (!res) {
    var l = text.toLowerCase();
    res = /hungr|eat|starv|burger|bite|food/.test(l) ? 'hungry' : /thirst|drink|water/.test(l) ? 'thirsty' : /loo|toilet|wait much/.test(l) ? 'toilet' :
      /bored|dull|nothing/.test(l) ? 'bored' : /tired|rest|feet/.test(l) ? 'tired' : /bench|sit/.test(l) ? 'noBench' : /litter|bin|dirty|mess/.test(l) ? 'dirty' :
      /expensive|price|cost/.test(l) ? 'expensive' : /cheap|bargain/.test(l) ? 'cheap' : /crowd|busy/.test(l) ? 'crowded' : /escape|loose/.test(l) ? 'escaped' :
      /coaster|ride|loop|flume|wheel/.test(l) ? 'coaster' : /duck|rifle|bullseye|carnival|high striker|ring toss|whack/.test(l) ? 'arcade' : /candy floss|popcorn|slushie|fairground/.test(l) ? 'candyFloss' :
      /baby|cub|foal/.test(l) ? 'baby' : /see|view/.test(l) ? 'cantSee' : /leav|home/.test(l) ? 'leaving' : /unhappy|sad|poor/.test(l) ? 'animalsUnhappy' : 'happy';
  }
  thoughtCache[text] = res; return res;
}
function updateBubbles() {
  var k, n = bubbleList.length, cx = camera.position.x, cz = camera.position.z;
  for (k = 0; k < MAXB; k++) {
    var sp = bubSprites[k];
    if (k >= n) { sp.visible = false; continue; }
    var rec = bubbleList[k], e = rec.ent;
    if (rec.thought !== e.thought) { rec.thought = e.thought; rec.cat = thoughtCat(String(e.thought)); }
    var m = BUB[rec.cat] || BUB.happy;
    if (sp.material !== m) sp.material = m;
    var g = rec.group, dx = g.position.x - cx, dz = g.position.z - cz, d = Math.sqrt(dx * dx + dz * dz + camera.position.y * camera.position.y);
    var sc = clamp(0.55 + d * 0.022, 0.8, 1.9);
    var pop = Math.min(1, (e.thoughtT || 0) * 4);
    sp.scale.set(sc * pop, sc * pop, 1);
    sp.position.set(g.position.x, g.position.y + rec.ht + 0.45 * sc + Math.sin(G.t * 3 + (e.id | 0)) * 0.05, g.position.z);
    sp.visible = true;
  }
}
function fmtMoney(v) {
  var a = Math.round(Math.abs(v)), s = String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (v < 0 ? '-' : '+') + '£' + s;
}
function spawnMoney(delta, x, z) {
  if (!isFinite(delta) || Math.abs(delta) < 1) return;
  var f = null, k;
  for (k = 0; k < floaters.length; k++) if (floaters[k].life <= 0) { f = floaters[k]; break; }
  if (!f) { f = floaters[0]; for (k = 1; k < floaters.length; k++) if (floaters[k].life < f.life) f = floaters[k]; }
  drawMoney(f.canvas, fmtMoney(delta), delta > 0); f.tex.needsUpdate = true;
  f.life = f.max = 1.7; f.x = x; f.z = z; f.y = groundY(x, z) + 2.2;
  f.sp.visible = true;
}
function spawnEmote(kind, x, z, y) {
  var f = null, k;
  for (k = 0; k < emotes.length; k++) if (emotes[k].life <= 0) { f = emotes[k]; break; }
  if (!f) f = emotes[0];
  f.sp.material = EMO[kind] || EMO.heart; f.life = f.max = 2.4; f.x = x; f.z = z; f.y = groundY(x, z) + (y || 2);
  f.sp.visible = true;
}
function updateFloaters(dt) {
  var k, f, d = camera.position.distanceTo(view3);
  for (k = 0; k < floaters.length; k++) {
    f = floaters[k]; if (f.life <= 0) continue;
    f.life -= dt; if (f.life <= 0) { f.sp.visible = false; continue; }
    var p = 1 - f.life / f.max, sc = clamp(0.5 + d * 0.016, 1, 3.6);
    f.sp.scale.set(3.2 * sc * Math.min(1, p * 8 + 0.4), 1 * sc * Math.min(1, p * 8 + 0.4), 1);
    f.sp.position.set(f.x, f.y + p * 2.4 * Math.min(1.5, sc * 0.8), f.z);
    f.sp.material.opacity = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
  }
  for (k = 0; k < emotes.length; k++) {
    f = emotes[k]; if (f.life <= 0) continue;
    f.life -= dt; if (f.life <= 0) { f.sp.visible = false; continue; }
    var q = 1 - f.life / f.max, s2 = clamp(0.7 + d * 0.012, 1.3, 2.8) * (0.6 + 0.4 * Math.min(1, q * 6));
    f.sp.scale.set(s2, s2, 1);
    f.sp.position.set(f.x, f.y + q * 1.6, f.z);
  }
}
function updateGrime(dt) {
  G.ovTimer -= dt; if (G.ovTimer > 0) return; G.ovTimer = 0.5;
  var s = Z.state; if (!s) return;
  var encs = s.enclosures || [], sig = encs.length * 7919, k, j, tl;
  for (k = 0; k < encs.length; k++) sig = (sig + (encs[k].poop | 0) * (k + 3) + (encs[k].tiles ? encs[k].tiles.length : 0)) | 0;
  if (sig !== G.poopSig) {
    G.poopSig = sig;
    var pa = G.poopMesh.instanceMatrix.array, n = 0, m = new THREE.Matrix4();
    for (k = 0; k < encs.length && n < 700; k++) {
      var en = encs[k], np = Math.min(en.poop | 0, 16); tl = en.tiles || [];
      if (!tl.length) continue;
      for (j = 0; j < np && n < 700; j++) {
        var ti = tl[(h3(en.id | 0, j, 1) * tl.length) | 0], i = ti % N, jj = (ti / N) | 0;
        if (s.terrain && s.terrain[ti] === waterIdx) continue;
        var px = (i + 0.15 + 0.7 * h3(en.id | 0, j, 2)) * T, pz = (jj + 0.15 + 0.7 * h3(en.id | 0, j, 3)) * T, sc = 0.8 + 0.5 * h3(en.id | 0, j, 4), b = n * 16;
        var cs = Math.cos(j * 2.1) * sc, sn = Math.sin(j * 2.1) * sc;
        pa[b] = cs; pa[b + 1] = 0; pa[b + 2] = -sn; pa[b + 3] = 0; pa[b + 4] = 0; pa[b + 5] = sc; pa[b + 6] = 0; pa[b + 7] = 0;
        pa[b + 8] = sn; pa[b + 9] = 0; pa[b + 10] = cs; pa[b + 11] = 0; pa[b + 12] = px; pa[b + 13] = Math.max(groundY(px, pz), waterLvlAt(px, pz)) + 0.05; pa[b + 14] = pz; pa[b + 15] = 1;
        n++;
      }
    }
    G.poopMesh.count = n; G.poopMesh.instanceMatrix.needsUpdate = true;
  }
  // litter
  var dirt = s.dirt, path = s.path; if (!dirt || !path) return;
  var ls = 0, i2, cnt = 0;
  for (k = 0; k < dirt.length; k++) if (dirt[k] > 25 && path[k]) { ls = (ls * 31 + k * (dirt[k] >> 5)) | 0; cnt++; }
  if (ls !== G.litterSig) {
    G.litterSig = ls;
    var la = G.litterMesh.instanceMatrix.array, ca = G.litterMesh.instanceColor.array, c = 0;
    var cols = [[0.9, 0.2, 0.2], [0.95, 0.85, 0.2], [0.9, 0.9, 0.9], [0.2, 0.6, 0.9], [0.4, 0.8, 0.3]];
    for (k = 0; k < dirt.length && c < 900; k++) {
      if (!path[k] || dirt[k] <= 25) continue;
      var pcs = dirt[k] > 200 ? 5 : dirt[k] > 120 ? 4 : dirt[k] > 60 ? 3 : 2, ii = k % N, jj2 = (k / N) | 0;
      for (j = 0; j < pcs && c < 900; j++) {
        var lx = (ii + 0.12 + 0.76 * h3(k, j, 11)) * T, lz = (jj2 + 0.12 + 0.76 * h3(k, j, 12)) * T, a = h3(k, j, 13) * TAU, cc = Math.cos(a), ss = Math.sin(a), b2 = c * 16;
        la[b2] = cc; la[b2 + 1] = 0; la[b2 + 2] = -ss; la[b2 + 3] = 0; la[b2 + 4] = 0; la[b2 + 5] = 1; la[b2 + 6] = 0; la[b2 + 7] = 0;
        la[b2 + 8] = ss; la[b2 + 9] = 0; la[b2 + 10] = cc; la[b2 + 11] = 0; la[b2 + 12] = lx; la[b2 + 13] = groundY(lx, lz) + PY + 0.02; la[b2 + 14] = lz; la[b2 + 15] = 1;
        var cl = cols[(h3(k, j, 14) * 5) | 0]; ca[c * 3] = SRGB ? s2l(cl[0]) : cl[0]; ca[c * 3 + 1] = SRGB ? s2l(cl[1]) : cl[1]; ca[c * 3 + 2] = SRGB ? s2l(cl[2]) : cl[2];
        c++;
      }
    }
    G.litterMesh.count = c; G.litterMesh.instanceMatrix.needsUpdate = true; G.litterMesh.instanceColor.needsUpdate = true;
  }
}

/* ------------------------------------------------ eggs with progress rings */
var eggRecs = new Map(), eggT = 0;
function eggRing(c, frac, wait) {
  var x = c.getContext('2d'), s = c.width; x.clearRect(0, 0, s, s);
  x.lineWidth = 12; x.lineCap = 'round'; x.strokeStyle = 'rgba(30,22,10,0.55)'; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 12, 0, TAU); x.stroke();
  x.strokeStyle = wait ? '#e8b84a' : '#7be07b'; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 12, -PI / 2, -PI / 2 + TAU * clamp(frac, 0.02, 1)); x.stroke();
}
function syncEggs(dt) {
  var s = Z.state, list = (s && s.research && s.research.eggs) || [], seen = {}, k, m = M();
  eggT -= dt; var refresh = eggT <= 0; if (refresh) eggT = 0.25;
  for (k = 0; k < list.length; k++) {
    var eg = list[k], rec = eggRecs.get(eg.id); seen[eg.id] = 1;
    if (!isFin(eg.i) || !isFin(eg.j)) continue;
    if (!rec) {
      var grp = m.createEgg ? m.createEgg() : new THREE.Group(), cv = mkCanvas(96, 96), tex = texFrom(cv, false);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false })); sp.renderOrder = 11;
      var ex = (eg.i + 0.5) * T, ez = (eg.j + 0.5) * T; grp.position.set(ex, groundY(ex, ez), ez); grp.scale.setScalar(1.7); root.add(grp); root.add(sp);
      rec = { g: grp, sp: sp, cv: cv, tex: tex, f: -1, x: ex, z: ez }; eggRecs.set(eg.id, rec);
    }
    if (refresh) {
      rec.g.position.y = groundY(rec.x, rec.z);
      var fr = eg.wait ? 1 : 1 - eg.t / eg.total, key = Math.round(fr * 50) + (eg.wait ? 100 : 0);
      if (key !== rec.f) { rec.f = key; eggRing(rec.cv, fr, eg.wait); rec.tex.needsUpdate = true; }
    }
    if (rec.g.userData.update) rec.g.userData.update(dt, G.t);
    var d = Math.hypot(camera.position.x - rec.x, camera.position.y, camera.position.z - rec.z), sc = clamp(0.55 + d * 0.018, 0.8, 2.2);
    rec.sp.scale.set(sc, sc, 1); rec.sp.position.set(rec.x, rec.g.position.y + 1.5 * sc * 0.6 + 0.6, rec.z); rec.sp.visible = true;
  }
  eggRecs.forEach(function (rec, id) { if (!seen[id]) { root.remove(rec.g); root.remove(rec.sp); rec.sp.material.dispose(); rec.tex.dispose(); eggRecs.delete(id); } });
}

/* ------------------------------------------------ cartoon fight dust clouds */
var fightClouds = new Map(), _fightPuffGeo = null, _fightStarGeo = null;
var FIGHT_PUFF_COLS = ['#e8d4ad', '#f4e8ce', '#d8be8e'];
var FIGHT_STAR_COLS = ['#ffe033', '#ff8c1a', '#ff3322'];
function disposeFightCloud(rec) {
  if (!rec) return;
  root.remove(rec.grp);
  var k;
  for (k = 0; k < rec.puffMats.length; k++) rec.puffMats[k].dispose();
  for (k = 0; k < rec.starMats.length; k++) rec.starMats[k].dispose();
  if (rec.sp && rec.sp.material) rec.sp.material.dispose();
}
function clearFightClouds() {
  fightClouds.forEach(function (rec) { disposeFightCloud(rec); });
  fightClouds.clear();
}
function makeFightCloud(f) {
  if (!_fightPuffGeo) _fightPuffGeo = new THREE.IcosahedronGeometry(0.42, 1);
  if (!_fightStarGeo) _fightStarGeo = new THREE.OctahedronGeometry(0.22, 0);
  var grp = new THREE.Group(), puffs = [], stars = [], puffMats = [], starMats = [], k;
  for (k = 0; k < FIGHT_PUFF_COLS.length; k++) {
    puffMats.push(new THREE.MeshLambertMaterial({ color: tcol(FIGHT_PUFF_COLS[k]), transparent: true, opacity: 0.88, depthWrite: false }));
  }
  for (k = 0; k < FIGHT_STAR_COLS.length; k++) {
    starMats.push(new THREE.MeshBasicMaterial({ color: FIGHT_STAR_COLS[k], transparent: true, opacity: 0.95 }));
  }
  for (k = 0; k < 11; k++) {
    var pm = new THREE.Mesh(_fightPuffGeo, puffMats[k % puffMats.length]);
    var ang = (k / 11) * TAU, rad = 0.22 + (k % 3) * 0.22, y0 = (k < 4 ? 0.42 : 0.14) + (k % 2) * 0.16;
    var sc = 0.72 + (k % 4) * 0.18;
    pm.position.set(Math.cos(ang) * rad, y0, Math.sin(ang) * rad);
    pm.scale.setScalar(sc);
    grp.add(pm);
    puffs.push({ mesh: pm, ang: ang, rad: rad, y0: y0, sc: sc, spd: (k & 1 ? 4.4 : -3.8), ph: k * 0.9 });
  }
  for (k = 0; k < 6; k++) {
    var sm = new THREE.Mesh(_fightStarGeo, starMats[k % starMats.length]);
    var sang = (k / 6) * TAU;
    sm.scale.setScalar(0.01);
    grp.add(sm);
    stars.push({ mesh: sm, ang: sang, y0: 0.3 + (k % 2) * 0.35, ph: k * 1.15, freq: 7.5 + (k % 3) * 1.4 });
  }
  var spMat = EMO.fight ? EMO.fight.clone() : new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
  var sp = new THREE.Sprite(spMat);
  sp.renderOrder = 12;
  sp.position.set(0, 1.25, 0);
  grp.add(sp);
  var sz = f.size || 1.2;
  grp.position.set(f.x, groundY(f.x, f.z) + 0.32 * sz, f.z);
  grp.scale.setScalar(sz);
  root.add(grp);
  return { grp: grp, puffs: puffs, stars: stars, puffMats: puffMats, starMats: starMats, sp: sp, x: f.x, z: f.z, size: sz, age: 0, fade: 0 };
}
function syncFights(dtReal) {
  var s = Z.state, list = (s && s.fights) || [], seen = {}, k;
  for (k = 0; k < list.length; k++) {
    var f = list[k];
    if (!isFin(f.x) || !isFin(f.z)) continue;
    seen[f.id] = 1;
    var rec = fightClouds.get(f.id);
    if (!rec) { rec = makeFightCloud(f); fightClouds.set(f.id, rec); }
    rec.x = f.x; rec.z = f.z; rec.size = f.size || 1.2; rec.fade = 0;
  }
  fightClouds.forEach(function (rec, id) {
    var active = !!seen[id], dt = isFin(dtReal) ? dtReal : 0.016;
    rec.age += dt;
    var t = rec.age, i, p, st;
    if (active) {
      rec.grp.position.set(rec.x, groundY(rec.x, rec.z) + 0.32 * rec.size, rec.z);
      rec.grp.scale.setScalar(rec.size * (0.94 + 0.08 * Math.sin(t * 14)));
      for (i = 0; i < rec.puffMats.length; i++) rec.puffMats[i].opacity = 0.88;
      for (i = 0; i < rec.starMats.length; i++) rec.starMats[i].opacity = 0.95;
      rec.sp.material.opacity = 1;
    } else {
      rec.fade += dt;
      var u = clamp(rec.fade / 0.65, 0, 1);
      if (u >= 1) {
        disposeFightCloud(rec);
        fightClouds.delete(id);
        return;
      }
      rec.grp.position.set(rec.x, groundY(rec.x, rec.z) + 0.32 * rec.size + u * 0.75, rec.z);
      rec.grp.scale.setScalar(rec.size * (1 + u * 0.65));
      for (i = 0; i < rec.puffMats.length; i++) rec.puffMats[i].opacity = (1 - u) * 0.88;
      for (i = 0; i < rec.starMats.length; i++) rec.starMats[i].opacity = (1 - u) * 0.95;
      rec.sp.material.opacity = 1 - u;
    }
    for (i = 0; i < rec.puffs.length; i++) {
      p = rec.puffs[i];
      var a = p.ang + t * p.spd;
      var br = p.rad * (0.88 + 0.22 * Math.sin(t * 7.5 + p.ph));
      p.mesh.position.set(Math.cos(a) * br, p.y0 + Math.sin(t * 6.5 + p.ph) * 0.12, Math.sin(a) * br);
      var bsc = p.sc * (0.85 + 0.25 * Math.sin(t * 9 + p.ph));
      p.mesh.scale.setScalar(bsc);
      p.mesh.rotation.set(t * 2 + p.ph, t * 2.5, 0);
    }
    for (i = 0; i < rec.stars.length; i++) {
      st = rec.stars[i];
      var pop = Math.pow(Math.max(0, Math.sin(t * st.freq + st.ph)), 1.5);
      var srad = 0.35 + pop * 0.75, sang = st.ang + t * 3.2;
      st.mesh.position.set(Math.cos(sang) * srad, st.y0 + pop * 0.45, Math.sin(sang) * srad);
      st.mesh.scale.setScalar(Math.max(0.01, pop * 1.15));
      st.mesh.rotation.set(t * 9, t * 7, st.ph);
    }
    rec.sp.position.set(0, 1.18 + Math.sin(t * 7) * 0.14, 0);
    var sps = 0.85 + 0.18 * Math.sin(t * 10);
    rec.sp.scale.set(sps, sps, 1);
  });
}

/* ------------------------------------------------ breakage & power-cut FX */
var breakageGrp = null, _brkRes = null, brkBeacons = [], brkParts = [], brkEmitT = 0;
var MAX_BRK_PARTS = 140;
function getBrkRes() {
  if (_brkRes) return _brkRes;
  _brkRes = {
    sphereGeo: new THREE.SphereGeometry(0.28, 10, 8),
    diamondGeo: new THREE.OctahedronGeometry(0.32, 0),
    partGeo: new THREE.SphereGeometry(0.16, 6, 5),
    redMat: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    amberMat: new THREE.MeshBasicMaterial({ color: 0xffa818 }),
    smokeMat: new THREE.MeshBasicMaterial({ color: 0x3a3e44, transparent: true, opacity: 0.72 }),
    sparkMat: new THREE.MeshBasicMaterial({ color: 0xffc832 })
  };
  return _brkRes;
}
function buildBreakageFX() {
  if (!breakageGrp && scene) {
    breakageGrp = new THREE.Group();
    scene.add(breakageGrp);
  }
}
function clearBreakageFX() {
  if (breakageGrp) {
    while (breakageGrp.children.length) breakageGrp.remove(breakageGrp.children[0]);
  }
  brkBeacons.length = 0;
  brkParts.length = 0;
  brkEmitT = 0;
}
function allocBrkBeacon(idx, isAmber) {
  var R = getBrkRes();
  var rec = brkBeacons[idx];
  if (!rec) {
    var g = new THREE.Group();
    var sp = new THREE.Mesh(R.sphereGeo, isAmber ? R.amberMat : R.redMat);
    var dm = new THREE.Mesh(R.diamondGeo, isAmber ? R.amberMat : R.redMat);
    dm.position.set(0, 0.58, 0);
    g.add(sp);
    g.add(dm);
    breakageGrp.add(g);
    rec = brkBeacons[idx] = { grp: g, sphere: sp, diamond: dm };
  } else {
    var mat = isAmber ? R.amberMat : R.redMat;
    rec.sphere.material = mat;
    rec.diamond.material = mat;
  }
  return rec;
}
function spawnBrkPart(kind, x, y, z) {
  if (!breakageGrp) return;
  var R = getBrkRes(), slot = null;
  for (var k = 0; k < brkParts.length; k++) {
    if (!brkParts[k].active) { slot = brkParts[k]; break; }
  }
  if (!slot) {
    if (brkParts.length >= MAX_BRK_PARTS) return;
    var m = new THREE.Mesh(R.partGeo, R.smokeMat);
    breakageGrp.add(m);
    slot = { active: false, mesh: m, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, kind: 'smoke' };
    brkParts.push(slot);
  }
  slot.active = true;
  slot.kind = kind;
  slot.mesh.material = kind === 'spark' ? R.sparkMat : R.smokeMat;
  slot.mesh.position.set(x + (Math.random() - 0.5) * 0.45, y, z + (Math.random() - 0.5) * 0.45);
  slot.mesh.visible = true;
  if (kind === 'spark') {
    slot.vx = (Math.random() - 0.5) * 2.4;
    slot.vy = 2.3 + Math.random() * 1.8;
    slot.vz = (Math.random() - 0.5) * 2.4;
    slot.maxLife = 0.42 + Math.random() * 0.25;
    slot.mesh.scale.setScalar(0.55);
  } else {
    slot.vx = (Math.random() - 0.5) * 0.45;
    slot.vy = 1.15 + Math.random() * 0.7;
    slot.vz = (Math.random() - 0.5) * 0.45;
    slot.maxLife = 1.15 + Math.random() * 0.45;
    slot.mesh.scale.setScalar(0.75);
  }
  slot.life = slot.maxLife;
}
function syncBreakageFX(dtReal) {
  if (!breakageGrp || !Z.state) return;
  var dt = isFin(dtReal) ? dtReal : 0.016;
  var s = Z.state, tNow = G.t;
  var powerCut = !!(Z.Sim && Z.Sim.powerCutActive && Z.Sim.powerCutActive());
  var emitTick = false;
  brkEmitT += dt;
  if (brkEmitT >= 0.16) { brkEmitT = brkEmitT % 0.16; emitTick = true; }

  var bCount = 0;
  function placeBeacon(x, y, z, isAmber, ph) {
    var rec = allocBrkBeacon(bCount++, isAmber);
    rec.grp.visible = true;
    rec.grp.position.set(x, y, z);
    var pulse = 0.85 + 0.25 * Math.sin(tNow * 8 + ph);
    rec.sphere.scale.setScalar(pulse);
    rec.sphere.visible = Math.sin(tNow * 9 + ph) > -0.25;
    rec.diamond.position.y = 0.58 + Math.sin(tNow * 5 + ph) * 0.14;
    rec.diamond.rotation.y = tNow * 2.6 + ph;
  }

  // 1. Breached enclosures: red pulsing beacon + sparks at the exact broken fence panel
  var encs = s.enclosures || [];
  for (var k = 0; k < encs.length; k++) {
    var e = encs[k];
    if (!e || !(e.breach > 0) || !e.breachEdge) continue;
    var ed = e.breachEdge;
    var fx = ed.axis === 'x' ? (ed.i + 0.5) * T : ed.i * T;
    var fz = ed.axis === 'x' ? ed.j * T : (ed.j + 0.5) * T;
    var gy = groundY(fx, fz);
    placeBeacon(fx, gy + 1.5, fz, false, k * 0.9);
    if (emitTick) {
      spawnBrkPart('spark', fx, gy + 0.55, fz);
      if (Math.random() < 0.5) spawnBrkPart('spark', fx, gy + 0.65, fz);
    }
  }

  // 2. Broken buildings (red pulsing beacon + smoke) and 3. Power-cut rides/stalls/arcades (amber pulsing outage beacon)
  objRecs.forEach(function (r) {
    if (r.kind !== 'building' || !r.obj) return;
    var isBroken = !!r.obj.broken;
    var isOutage = powerCut && r.powered;
    if (!isBroken && !isOutage) return;
    var topY = r.y + (r.coasterStation ? 5.2 : (r.w >= 3 || r.h >= 3 ? 3.4 : r.w >= 2 || r.h >= 2 ? 2.8 : 2.25));
    placeBeacon(r.x, topY, r.z, !isBroken && isOutage, (r.id | 0) * 0.7);
    if (emitTick && isBroken) {
      spawnBrkPart('smoke', r.x, topY - 0.5, r.z);
    }
  });

  for (k = bCount; k < brkBeacons.length; k++) {
    brkBeacons[k].grp.visible = false;
  }

  // Update pooled smoke & spark particles
  for (k = 0; k < brkParts.length; k++) {
    var pt = brkParts[k];
    if (!pt.active) continue;
    pt.life -= dt;
    if (pt.life <= 0) {
      pt.active = false;
      pt.mesh.visible = false;
      continue;
    }
    var u = pt.life / pt.maxLife;
    if (pt.kind === 'spark') pt.vy -= 5.6 * dt;
    pt.mesh.position.x += pt.vx * dt;
    pt.mesh.position.y += pt.vy * dt;
    pt.mesh.position.z += pt.vz * dt;
    var sc = pt.kind === 'spark' ? Math.max(0.1, 0.55 * u) : (0.65 + (1 - u) * 1.15) * Math.min(1, u * 2.2);
    pt.mesh.scale.setScalar(Math.max(0.08, sc));
  }
}
/* ------------------------------------------------ preview / highlighting */
var pv = {};
function mkInstQuads(cap, mat, renderOrder) {
  var g = new THREE.PlaneGeometry(T, T); g.rotateX(-PI / 2);
  var im = new THREE.InstancedMesh(g, mat, cap);
  im.count = 0; im.frustumCulled = false; im.renderOrder = renderOrder; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.visible = false;
  root.add(im); return im;
}
// ground-hugging tile highlights: each tile is 2x2 quads draped over the terrain (rewritten by fillTiles)
function mkDrapedTiles(cap, mat, renderOrder) {
  var pos = new Float32Array(cap * 27), uv = new Float32Array(cap * 18), idx = new Uint16Array(cap * 24), t, aa, bb, k;
  for (t = 0; t < cap; t++) {
    for (bb = 0; bb < 3; bb++) for (aa = 0; aa < 3; aa++) { k = t * 9 + aa + bb * 3; uv[k * 2] = aa * 0.5; uv[k * 2 + 1] = 1 - bb * 0.5; }
    for (bb = 0; bb < 2; bb++) for (aa = 0; aa < 2; aa++) {
      var q = t * 9 + aa + bb * 3, o = t * 24 + (aa + bb * 2) * 6;
      idx[o] = q; idx[o + 1] = q + 3; idx[o + 2] = q + 1; idx[o + 3] = q + 1; idx[o + 4] = q + 3; idx[o + 5] = q + 4;
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(W / 2, 0, W / 2), W);
  var m = new THREE.Mesh(g, mat);
  m.userData.draped = true; m.frustumCulled = false; m.renderOrder = renderOrder; m.visible = false;
  root.add(m); return m;
}
function mkInstBars(cap, mat, renderOrder) {
  var g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  var im = new THREE.InstancedMesh(g, mat, cap);
  im.count = 0; im.frustumCulled = false; im.renderOrder = renderOrder; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.visible = false;
  root.add(im); return im;
}
function buildPreview() {
  pv.tileMat = new THREE.MeshBasicMaterial({ map: TEX.tile, transparent: true, depthWrite: false, opacity: 0.7, color: 0x40ff70, fog: false });
  pv.tiles = mkDrapedTiles(1200, pv.tileMat, 5);
  pv.barMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.6, color: 0x40ff70, fog: false });
  pv.bars = mkInstBars(600, pv.barMat, 5);
  pv.encTileMat = new THREE.MeshBasicMaterial({ map: TEX.tile, transparent: true, depthWrite: false, opacity: 0.4, color: 0xffe27a, fog: false });
  pv.encTiles = mkDrapedTiles(3600, pv.encTileMat, 4);
  pv.encBarMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.85, color: 0xffd24a, fog: false });
  pv.encBars = mkInstBars(800, pv.encBarMat, 4);
  pv.badTileMat = new THREE.MeshBasicMaterial({ map: TEX.tile, transparent: true, depthWrite: false, opacity: 0.7, color: 0xff4d44, fog: false });
  pv.tilesBad = mkDrapedTiles(400, pv.badTileMat, 6);
  pv.frontMat = new THREE.MeshBasicMaterial({ map: TEX.tile, transparent: true, depthWrite: false, opacity: 0.8, color: 0xffb81f, fog: false });
  pv.front = mkDrapedTiles(40, pv.frontMat, 7);
  pv.doorMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.95, color: 0xffa500, fog: false });
  pv.door = mkInstBars(8, pv.doorMat, 8);
  var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; var cx2 = cv.getContext('2d');
  cx2.fillStyle = '#ffb81f'; cx2.strokeStyle = '#5a3306'; cx2.lineWidth = 6; cx2.beginPath(); cx2.moveTo(14, 4); cx2.lineTo(242, 4); cx2.quadraticCurveTo(252, 4, 252, 14); cx2.lineTo(252, 50); cx2.quadraticCurveTo(252, 60, 242, 60); cx2.lineTo(14, 60); cx2.quadraticCurveTo(4, 60, 4, 50); cx2.lineTo(4, 14); cx2.quadraticCurveTo(4, 4, 14, 4); cx2.fill(); cx2.stroke();
  cx2.fillStyle = '#3b2204'; cx2.font = 'bold 34px sans-serif'; cx2.textAlign = 'center'; cx2.textBaseline = 'middle'; cx2.fillText('ENTRANCE', 128, 34);
  var tx = new THREE.CanvasTexture(cv); pv.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, fog: false })); pv.label.renderOrder = 20; pv.label.visible = false; root.add(pv.label);
  pv.ghost = null; pv.ghostCache = {}; pv.spec = null; pv.enc = null;
  pv.rangeGrp = new THREE.Group(); pv.rangeGrp.visible = false; root.add(pv.rangeGrp); pv.rangeKey = '';
  pv.okCol = new THREE.Color(0.35, 1, 0.45); pv.badCol = new THREE.Color(1, 0.3, 0.28);
}
function writeQuad(a, n, x, y, z) {
  var b = n * 16;
  a[b] = 1; a[b + 1] = 0; a[b + 2] = 0; a[b + 3] = 0; a[b + 4] = 0; a[b + 5] = 1; a[b + 6] = 0; a[b + 7] = 0;
  a[b + 8] = 0; a[b + 9] = 0; a[b + 10] = 1; a[b + 11] = 0; a[b + 12] = x; a[b + 13] = y; a[b + 14] = z; a[b + 15] = 1;
}
function writeBar(a, n, x, y, z, sx, sy, sz) {
  var b = n * 16;
  a[b] = sx; a[b + 1] = 0; a[b + 2] = 0; a[b + 3] = 0; a[b + 4] = 0; a[b + 5] = sy; a[b + 6] = 0; a[b + 7] = 0;
  a[b + 8] = 0; a[b + 9] = 0; a[b + 10] = sz; a[b + 11] = 0; a[b + 12] = x; a[b + 13] = y; a[b + 14] = z; a[b + 15] = 1;
}
function fillTiles(mesh, list, cap) {
  var pa = mesh.geometry.attributes.position.array, n = 0, hs = T * 0.5;
  for (var k = 0; k < list.length && n < cap; k++) {
    var t = list[k], i = t.i, j = t.j;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    var wl = waterLvlAt((i + 0.5) * T, (j + 0.5) * T), o = n * 27;
    for (var bb = 0; bb < 3; bb++) for (var aa = 0; aa < 3; aa++) {
      var x = i * T + aa * hs, z = j * T + bb * hs, y = groundY(x, z);
      pa[o++] = x; pa[o++] = (y > wl ? y : wl) + 0.075; pa[o++] = z;
    }
    n++;
  }
  mesh.geometry.setDrawRange(0, n * 24); mesh.geometry.attributes.position.needsUpdate = true;
  mesh.visible = n > 0;
}
// edge bar lying along a tile edge, tilted to follow the ground between its two corners
function writeEdgeBar(a, n, axis, i, j, hh, thick) {
  var b = n * 16, x = i * T, z = j * T, g0 = groundY(x, z), g1 = axis === 'x' ? groundY(x + T, z) : groundY(x, z + T);
  var dy = g1 - g0, len = Math.sqrt(T * T + dy * dy) + thick, c = T / Math.sqrt(T * T + dy * dy), sn = dy / Math.sqrt(T * T + dy * dy), ym = (g0 + g1) * 0.5 + 0.02;
  for (var q = 0; q < 16; q++) a[b + q] = 0;
  if (axis === 'x') { a[b] = len * c; a[b + 1] = len * sn; a[b + 5] = hh; a[b + 10] = thick; a[b + 12] = x + T * 0.5; a[b + 13] = ym; a[b + 14] = z; }
  else { a[b] = thick; a[b + 5] = hh; a[b + 9] = len * sn; a[b + 10] = len * c; a[b + 12] = x; a[b + 13] = ym; a[b + 14] = z + T * 0.5; }
  a[b + 15] = 1;
}
function fillEdges(mesh, list, cap, hh, thick) {
  var a = mesh.instanceMatrix.array, n = 0;
  for (var k = 0; k < list.length && n < cap; k++) {
    var e = list[k];
    writeEdgeBar(a, n++, e.axis, e.i, e.j, hh, thick);
  }
  mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true;
}
function ghostMake(kind, id) {
  var key = kind + ':' + id, c = pv.ghostCache[key];
  if (c) return c;
  var g = null, upd = null;
  try {
    var m = M();
    if (kind === 'building') g = makeBuildingGroup(id);
    else if (kind === 'scenery') g = makeSceneryGroup(id);
    else if (kind === 'animal') { var v = m.createAnimal ? m.createAnimal(id, {}) : null; if (v && v.group) { g = v.group; upd = v.update; } else g = fallbackAnimal(id).group; }
    else if (kind === 'staff') { var v2 = m.createStaff ? m.createStaff(id) : null; if (v2 && v2.group) { g = v2.group; upd = v2.update; } else g = fallbackStaff(id).group; }
  } catch (e) { g = null; }
  if (!g) g = new THREE.Group();
  var mats = [];
  g.traverse(function (o) {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    var conv = function (m0) {
      var m1 = m0.clone(); m1.transparent = true; m1.opacity = 0.62; m1.depthWrite = false;
      if (m1.emissive) { m1.emissiveIntensity = 0.9; }
      mats.push(m1); return m1;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    o.castShadow = false;
  });
  c = pv.ghostCache[key] = { group: g, mats: mats, upd: upd, ok: null };
  return c;
}
var _ghostEnt = { speed: 0, state: 'idle', heading: 0, x: 0, z: 0 };
function clearRangePreview() {
  pv.rangeKey = '';
  if (!pv.rangeGrp) return;
  while (pv.rangeGrp.children.length) {
    var ch = pv.rangeGrp.children.pop();
    if (ch.geometry) ch.geometry.dispose();
    if (ch.material) ch.material.dispose();
  }
  pv.rangeGrp.visible = false;
}
function syncRangePreview(ranges) {
  if (!pv.rangeGrp) return;
  if (!ranges || !ranges.length) { clearRangePreview(); return; }
  var key = '', k, rg;
  for (k = 0; k < ranges.length; k++) {
    rg = ranges[k];
    key += Math.round(rg.x * 10) + ',' + Math.round(rg.z * 10) + ',' + Math.round(rg.r * 10) + ',' + (rg.col || 0) + ',' + (rg.alpha || 1) + ';';
  }
  if (key === pv.rangeKey) { pv.rangeGrp.visible = true; return; }
  clearRangePreview();
  pv.rangeKey = key;
  var SEG = 64;
  for (k = 0; k < ranges.length; k++) {
    rg = ranges[k];
    var col = rg.col !== undefined ? rg.col : 0x42f578, al = rg.alpha !== undefined ? rg.alpha : 1;
    var cx = rg.x, cz = rg.z, rad = rg.r;
    var cs0 = clamp(cx, 0, N * T), cz0 = clamp(cz, 0, N * T);
    var yc = Math.max(groundY(cs0, cz0), waterLvlAt(cs0, cz0)) + 0.14;
    var dPos = new Float32Array((SEG + 1) * 3), dIdx = [];
    dPos[0] = cx; dPos[1] = yc; dPos[2] = cz;
    var rPos = new Float32Array((SEG + 1) * 2 * 3), rIdx = [];
    var halfW = al < 0.8 ? 0.34 : 0.5;
    for (var s = 0; s <= SEG; s++) {
      var ang = s * PI * 2 / SEG, cs = Math.cos(ang), sn = Math.sin(ang);
      var px = cx + cs * rad, pz = cz + sn * rad;
      var sx = clamp(px, 0, N * T), sz = clamp(pz, 0, N * T);
      var gy = Math.max(groundY(sx, sz), waterLvlAt(sx, sz));
      if (s < SEG) {
        dPos[(s + 1) * 3] = px; dPos[(s + 1) * 3 + 1] = gy + 0.14; dPos[(s + 1) * 3 + 2] = pz;
        dIdx.push(0, s + 1, s + 1 < SEG ? s + 2 : 1);
      }
      var ri = rad - halfW, ro = rad + halfW;
      rPos[s * 6] = cx + cs * ri; rPos[s * 6 + 1] = gy + 0.25; rPos[s * 6 + 2] = cz + sn * ri;
      rPos[s * 6 + 3] = cx + cs * ro; rPos[s * 6 + 4] = gy + 0.25; rPos[s * 6 + 5] = cz + sn * ro;
      if (s < SEG) {
        var b = s * 2;
        rIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    var dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dg.setIndex(dIdx);
    var dm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08 * al, depthWrite: false, side: THREE.DoubleSide, fog: false });
    var disc = new THREE.Mesh(dg, dm); disc.renderOrder = 3; disc.frustumCulled = false;
    var eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
    eg.setIndex(rIdx);
    var em = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.78 * al, depthWrite: false, side: THREE.DoubleSide, fog: false });
    var ring = new THREE.Mesh(eg, em); ring.renderOrder = 4; ring.frustumCulled = false;
    ring.userData.baseOp = 0.78 * al; ring.userData.isEdge = true;
    pv.rangeGrp.add(disc); pv.rangeGrp.add(ring);
  }
  pv.rangeGrp.visible = true;
}
function setPreview(spec) {
  pv.spec = spec || null;
  if (pv.ghost) { root.remove(pv.ghost.group); pv.ghost = null; }
  pv.tilesBad.visible = false; pv.front.visible = false; pv.door.visible = false; pv.label.visible = false;
  syncRangePreview(spec && (spec.ranges || (spec.range ? [spec.range] : null)));
  if (!spec || spec.type === 'ranges') { pv.tiles.visible = false; pv.bars.visible = false; return; }
  var ok = spec.ok !== false;
  pv.tileMat.color.copy(ok ? pv.okCol : pv.badCol); pv.barMat.color.copy(ok ? pv.okCol : pv.badCol);
  if (spec.type === 'tiles') { fillTiles(pv.tiles, spec.tiles || [], 1200); pv.bars.visible = false; }
  else if (spec.type === 'edges') { fillEdges(pv.bars, spec.edges || [], 600, spec.height || 1.1, 0.22); pv.tiles.visible = false; }
  else if (spec.type === 'object') {
    pv.bars.visible = false;
    var kind = spec.kind, rot = (spec.rot | 0) & 3, w = 1, h = 1;
    if (kind === 'building') { var bm = buildingMeta(spec.id); w = bm.w || 1; h = bm.h || 1; if ((rot & 1) && w !== h) { var t0 = w; w = h; h = t0; } }
    var tl = [];
    for (var jj = 0; jj < h; jj++) for (var ii = 0; ii < w; ii++) tl.push({ i: spec.i + ii, j: spec.j + jj });
    if (spec.tileOk && spec.tileOk.length === tl.length) {
      var gl = [], rl = [];
      for (var q = 0; q < tl.length; q++) (spec.tileOk[q] ? gl : rl).push(tl[q]);
      pv.tileMat.color.copy(pv.okCol); fillTiles(pv.tiles, gl, 1200); fillTiles(pv.tilesBad, rl, 400);
    } else fillTiles(pv.tiles, tl, 1200);
    if (kind === 'building' && spec.door !== false) {
      var fl = [], da = [], dx0, dz0, dsx, dsz, fr = [];
      for (var a = 0; a < (rot & 1 ? h : w); a++) {
        if (rot === 0) fr.push({ i: spec.i + a, j: spec.j + h }); else if (rot === 2) fr.push({ i: spec.i + a, j: spec.j - 1 });
        else if (rot === 1) fr.push({ i: spec.i + w, j: spec.j + a }); else fr.push({ i: spec.i - 1, j: spec.j + a });
      }
      fillTiles(pv.front, fr, 40); pv.frontMat.opacity = 0.55;
      var ea = rot & 1 ? 'z' : 'x', ei = rot === 1 ? spec.i + w : rot === 3 ? spec.i : spec.i, ej = rot === 0 ? spec.j + h : rot === 2 ? spec.j : spec.j;
      var db = pv.door.instanceMatrix.array, n0 = 0, len = rot & 1 ? h : w, lx, lz;
      if (rot & 1) { lx = ei * T; lz = (spec.j + h / 2) * T; writeBar(db, 0, lx, groundY(lx, lz) + 0.05, lz, 0.34, 0.5, len * T); }
      else { lx = (spec.i + w / 2) * T; lz = ej * T; writeBar(db, 0, lx, groundY(lx, lz) + 0.05, lz, len * T, 0.5, 0.34); }
      pv.door.count = 1; pv.door.visible = true; pv.door.instanceMatrix.needsUpdate = true;
      var gy0 = groundY(lx, lz);
      var off = rot === 0 ? [0, 1] : rot === 2 ? [0, -1] : rot === 1 ? [1, 0] : [-1, 0];
      pv.label.position.set(lx + off[0] * T * 0.55, gy0 + 1.7, lz + off[1] * T * 0.55); pv.label.scale.set(4.2, 1.05, 1); pv.label.visible = true;
    }
    var gh = ghostMake(kind, spec.id);
    var cx = (spec.i + w / 2) * T, cz = (spec.j + h / 2) * T;
    gh.group.position.set(cx, kind === 'building' ? footBase(spec.i, spec.j, w, h) : groundY(cx, cz), cz);
    gh.group.rotation.y = rot * PI / 2;
    if (gh.ok !== ok) {
      gh.ok = ok;
      for (var k = 0; k < gh.mats.length; k++) { var m = gh.mats[k]; if (m.emissive) m.emissive.setRGB(ok ? 0.05 : 0.55, ok ? 0.45 : 0.05, ok ? 0.12 : 0.05); else if (m.color) m.color.lerp(ok ? pv.okCol : pv.badCol, 0.5); }
    }
    root.add(gh.group); pv.ghost = gh;
  }
}
function highlightEnclosure(id) {
  pv.enc = id || null; pv.encId = id || null;
  rebuildEncHighlight();
}
function rebuildEncHighlight() {
  var s = Z.state, id = pv.encId;
  if (!id || !s) { pv.encTiles.visible = false; pv.encBars.visible = false; return; }
  var en = findIn(s.enclosures, id);
  if (!en || !en.tiles) { pv.encTiles.visible = false; pv.encBars.visible = false; return; }
  var tl = [], set = {}, k;
  for (k = 0; k < en.tiles.length; k++) { var ti = en.tiles[k]; set[ti] = 1; tl.push({ i: ti % N, j: (ti / N) | 0 }); }
  fillTiles(pv.encTiles, tl, 1600);
  var edges = [];
  for (k = 0; k < tl.length; k++) {
    var i = tl[k].i, j = tl[k].j;
    if (!set[i + (j - 1) * N] || j === 0) edges.push({ axis: 'x', i: i, j: j });
    if (!set[i + (j + 1) * N] || j === N - 1) edges.push({ axis: 'x', i: i, j: j + 1 });
    if (!set[(i - 1) + j * N] || i === 0) edges.push({ axis: 'z', i: i, j: j });
    if (!set[(i + 1) + j * N] || i === N - 1) edges.push({ axis: 'z', i: i + 1, j: j });
  }
  fillEdges(pv.encBars, edges, 800, 0.35, 0.2);
}
function updatePreview() {
  var p = 0.5 + 0.5 * Math.sin(G.t * 5);
  if (pv.tiles.visible) pv.tileMat.opacity = 0.55 + 0.2 * p;
  if (pv.tilesBad.visible) pv.badTileMat.opacity = 0.55 + 0.2 * p;
  if (pv.front.visible) pv.frontMat.opacity = 0.45 + 0.3 * p;
  if (pv.bars.visible) pv.barMat.opacity = 0.45 + 0.2 * p;
  if (pv.encTiles.visible) { pv.encTileMat.opacity = 0.3 + 0.12 * p; pv.encBarMat.opacity = 0.65 + 0.25 * p; }
  if (pv.rangeGrp && pv.rangeGrp.visible) {
    for (var rk = 0; rk < pv.rangeGrp.children.length; rk++) {
      var rc = pv.rangeGrp.children[rk];
      if (rc.userData && rc.userData.isEdge && rc.material) rc.material.opacity = rc.userData.baseOp * (0.8 + 0.2 * p);
    }
  }
  if (pv.ghost && pv.ghost.upd) { try { pv.ghost.upd(0.016, _ghostEnt); } catch (e) { pv.ghost.upd = null; } }
}

/* ------------------------------------------------------------------ camera */
var World = Z.World = {};
var cam = { target: { x: 56, z: 78 }, dist: 62, yaw: 0.3, pitch: 0.88 };
var view = { x: 56, z: 78, ty: 0, dist: 62, yaw: 0.3, pitch: 0.88 };
var view3 = new THREE.Vector3();
World.cam = cam;
var followMin = 14, followK = null, followId = null, lastRot = -99, lastPan = -99, panVx = 0, panVz = 0;
var PITCH_MIN = 0.35, PITCH_MAX = 1.4, DIST_MIN = 6, DIST_MAX = 140;
function buildCameraSystem() {
  World.cam = cam;
  buildSVMarker();
  view.x = cam.target.x; view.z = cam.target.z; view.dist = cam.dist; view.yaw = cam.yaw; view.pitch = cam.pitch;
}
function clampCam() {
  var chase = !!followK;
  cam.target.x = fin(cam.target.x, fin(view.x, W / 2));
  cam.target.z = fin(cam.target.z, fin(view.z, W * 0.7));
  cam.dist = fin(cam.dist, fin(view.dist, 62));
  cam.yaw = fin(cam.yaw, fin(view.yaw, 0.3));
  cam.pitch = fin(cam.pitch, fin(view.pitch, 0.88));
  cam.pitch = clamp(cam.pitch, chase ? 0.1 : (G.pitchMin !== undefined ? G.pitchMin : PITCH_MIN), PITCH_MAX);
  cam.dist = clamp(cam.dist, chase ? 3.2 : DIST_MIN, DIST_MAX);
  cam.target.x = clamp(cam.target.x, 0, W); cam.target.z = clamp(cam.target.z, 0, W);
}
function pan(dx, dy) {
  if (!isFin(dx) || !isFin(dy)) return;
  followK = null; followId = null; clampCam();
  var delta = RENDER.cameraPanDelta(cam, dx, dy, camera.fov, G.h, clamp(cam.pitch, 0.3, 1.5)), mx = delta[0], mz = delta[1];
  if (!isFin(mx) || !isFin(mz)) return;
  cam.target.x += mx; cam.target.z += mz;
  clampCam();
  var now = G.t, dt = Math.max(0.008, now - lastPan);
  if (now - lastPan < 0.25 && isFin(dt)) { panVx = lerp(panVx, mx / dt, 0.4); panVz = lerp(panVz, mz / dt, 0.4); } else { panVx = 0; panVz = 0; }
  if (!isFin(panVx) || !isFin(panVz)) { panVx = 0; panVz = 0; }
  lastPan = now;
}
function rotate(dYaw, dPitch) {
  RENDER.cameraRotate(cam, dYaw, dPitch); lastRot = G.t; clampCam();
}
function zoom(factor) {
  if (!isFin(factor) || factor <= 0) return;
  clampCam(); RENDER.cameraZoom(cam, factor); clampCam();
}
function focus(x, z, dist) {
  if (!isFin(x) || !isFin(z)) return;
  followK = null; followId = null;
  cam.target.x = x; cam.target.z = z;
  if (isFin(dist) && dist > 0) cam.dist = dist;
  clampCam();
}
function follow(kind, id) {
  if (!kind || id === null || id === undefined) { followK = null; followId = null; return; }
  followK = kind; followId = id; lastRot = -99;
  var fr = kind === 'animal' ? entityRec(kind, id) : null; followMin = fr && isFin(fr.len) && fr.len > 0 ? clamp(fr.len * 1.3 + 4, 14, 36) : 14;
  if (cam.dist > 22 || cam.dist < followMin) cam.dist = followMin;
  clampCam();
}
function updateCamera(dt) {
  dt = isFin(dt) && dt > 0 ? dt : 0.016;
  clampCam();
  if (followK) {
    var rec = entityRec(followK, followId), arr = Z.state && Z.state[KIND_ARR[followK]], e = null;
    if (rec) e = rec.ent; else if (arr) e = findIn(arr, followId);
    if (!e || !isFin(e.x) || !isFin(e.z)) { followK = null; followId = null; }
    else {
      cam.target.x = e.x; cam.target.z = e.z;
      if (cam.dist < followMin && rec) {
        var ht = isFin(rec.ht) ? rec.ht : 1.5;
        view.ty += ((ht * 0.55) - view.ty) * (1 - Math.exp(-dt * 4));
        if (G.t - lastRot > 2.2 && isFin(rec.h)) {
          cam.yaw += wrapPI(rec.h + PI - cam.yaw) * (1 - Math.exp(-dt * 1.4));
          cam.pitch += (0.3 - cam.pitch) * (1 - Math.exp(-dt * 1.2));
        }
      } else view.ty += (0 - view.ty) * (1 - Math.exp(-dt * 4));
    }
  } else view.ty += (0 - view.ty) * (1 - Math.exp(-dt * 6));
  if (!isFin(panVx) || !isFin(panVz)) { panVx = 0; panVz = 0; }
  if (G.t - lastPan > 0.07 && (panVx * panVx + panVz * panVz) > 0.01) {
    cam.target.x += panVx * dt; cam.target.z += panVz * dt;
    var dec = Math.exp(-dt * 4.5); panVx *= dec; panVz *= dec;
  }
  clampCam();
  if (!isFin(view.x)) view.x = cam.target.x; if (!isFin(view.z)) view.z = cam.target.z;
  if (!isFin(view.ty)) view.ty = 0; if (!isFin(view.dist)) view.dist = cam.dist;
  if (!isFin(view.yaw)) view.yaw = cam.yaw; if (!isFin(view.pitch)) view.pitch = cam.pitch;
  var kT = 1 - Math.exp(-dt * (followK ? 7 : 11)), kZ = 1 - Math.exp(-dt * 9), kR = 1 - Math.exp(-dt * 11);
  view.x += (cam.target.x - view.x) * kT; view.z += (cam.target.z - view.z) * kT;
  view.dist += (cam.dist - view.dist) * kZ;
  view.yaw += wrapPI(cam.yaw - view.yaw) * kR;
  view.pitch += (cam.pitch - view.pitch) * kR;
  if (!isFin(view.x) || !isFin(view.z) || !isFin(view.ty) || !isFin(view.dist) || !isFin(view.yaw) || !isFin(view.pitch)) {
    view.x = cam.target.x; view.z = cam.target.z; view.ty = 0; view.dist = cam.dist; view.yaw = cam.yaw; view.pitch = cam.pitch;
  }
  var cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  camera.position.set(view.x + Math.sin(view.yaw) * cp * view.dist, view.ty + sp * view.dist, view.z + Math.cos(view.yaw) * cp * view.dist);
  var lkx = view.x, lky = view.ty, lkz = view.z, fov = G.baseFov || camera.fov;
  camera.near = clamp(view.dist * 0.05, 0.25, 3); camera.far = 1100;
  if (SV.on || SV.blend > 0) {
    // street view: blend the orbit pose into the eye-level pose (and back, which restores the orbit camera exactly)
    SV.blend = clamp(SV.blend + (SV.on ? dt : -dt) / 0.7, 0, 1);
    if (SV.on) svStep(dt);
    var kb = SV.blend * SV.blend * (3 - 2 * SV.blend), P = svPose(), op = camera.position;
    if (isFin(P.x) && isFin(P.y) && isFin(P.z) && isFin(P.lx) && isFin(P.ly) && isFin(P.lz)) {
      op.set(lerp(op.x, P.x, kb), lerp(op.y, P.y, kb), lerp(op.z, P.z, kb));
      lkx = lerp(lkx, P.lx, kb); lky = lerp(lky, P.ly, kb); lkz = lerp(lkz, P.lz, kb);
      fov = lerp(fov, (SV.fov + Math.max(0, 1 - camera.aspect) * 32) * fin(SV.zoom, 1), kb); camera.near = lerp(camera.near, 0.1, kb);
    } else { SV.on = false; SV.blend = 0; }
  }
  camera.fov = isFin(fov) && fov > 1 ? fov : (G.baseFov || 42);
  camera.up.set(0, 1, 0);
  if (Z.CoasterWorld && Z.CoasterWorld.applyCamera && Z.CoasterWorld.applyCamera(camera, dt)) {
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  } else {
    camera.updateProjectionMatrix();
    camera.lookAt(lkx, lky, lkz);
    camera.updateMatrixWorld();
  }
  view3.set(view.x, view.ty, view.z);
  _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _fr.setFromProjectionMatrix(_vp);
}

/* ------------------------------------------------------------- street view */
// Eye-level walk-through. The orbit camera (cam/view) keeps its state untouched, so leaving blends back exactly.
// Heading convention: forward = (sin yaw, cos yaw) on the ground plane; yaw = PI looks "up" the park (towards -z, away from the gate).
var SV = { on: false, x: 56, z: 106, yaw: PI, pitch: 0, eye: 1.7, fov: 70, zoom: 1, blend: 0, gy: 0, vx: 0, vz: 0, fwd: 0, str: 0, turn: 0, run: false, bobT: 0, bob: 0, go: null, marker: null, mk: 0 };
function svBounds() {
  var m = Z.state && Z.state.map, i0 = 0, j0 = 0, i1 = N - 1, j1 = N - 1;
  if (m && typeof m.i0 === 'number') { i0 = m.i0; j0 = m.j0; i1 = m.i1; j1 = m.j1; }
  return { x0: i0 * T + 0.6, x1: (i1 + 1) * T - 0.6, z0: j0 * T + 0.6, z1: (j1 + 1) * T - 0.6 };
}
function svGround(x, z) {
  var y = groundY(x, z), s = Z.state, ti = Math.floor(x / T), tj = Math.floor(z / T);
  if (s && s.path && ti >= 0 && tj >= 0 && ti < N && tj < N && s.path[ti + tj * N]) y = Math.max(y, PY);
  return Math.max(y, WATER_Y);
}
function svStep(dt) {
  var b = svBounds(), sp = SV.run ? 11 : 5, f = SV.fwd, st = SV.str, l = Math.max(1, Math.hypot(f, st)), tx = 0, tz = 0;
  SV.yaw = wrapPI(SV.yaw + SV.turn * dt * 1.7);
  var fx = Math.sin(SV.yaw), fz = Math.cos(SV.yaw), rx = -Math.cos(SV.yaw), rz = Math.sin(SV.yaw);
  if (f || st) { SV.go = null; tx = (fx * f + rx * st) / l * sp; tz = (fz * f + rz * st) / l * sp; }
  else if (SV.go) {
    var dx = SV.go.x - SV.x, dz = SV.go.z - SV.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.25) SV.go = null; else { var v = clamp(d * 2.4, 2.5, SV.run ? 20 : 15); tx = dx / d * v; tz = dz / d * v; }
  }
  var k = 1 - Math.exp(-dt * (SV.go ? 6 : 10));
  SV.vx += (tx - SV.vx) * k; SV.vz += (tz - SV.vz) * k;
  SV.x = clamp(SV.x + SV.vx * dt, b.x0, b.x1); SV.z = clamp(SV.z + SV.vz * dt, b.z0, b.z1);
  var spd = Math.sqrt(SV.vx * SV.vx + SV.vz * SV.vz);
  SV.bobT += spd * dt * 1.6; SV.bob = Math.sin(SV.bobT) * 0.035 * Math.min(1, spd / 4);
  var gt = svGround(SV.x, SV.z);
  SV.gy += (gt - SV.gy) * (1 - Math.exp(-dt * 12));
  if (SV.marker) {
    if (SV.go) { SV.mk = Math.min(1, SV.mk + dt * 5); SV.marker.position.set(SV.go.x, svGround(SV.go.x, SV.go.z) + 0.08, SV.go.z); }
    else SV.mk = Math.max(0, SV.mk - dt * 4);
    SV.marker.visible = SV.mk > 0.01; var ps = 1 + 0.15 * Math.sin(G.t * 6); SV.marker.scale.set(ps, ps, ps); SV.marker.material.opacity = 0.85 * SV.mk;
  }
}
var _svP = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 };
function svPose() {
  var P = _svP, cp = Math.cos(SV.pitch), y = SV.gy + SV.eye + SV.bob;
  P.x = SV.x; P.y = y; P.z = SV.z;
  P.lx = SV.x + Math.sin(SV.yaw) * cp * 10; P.ly = y + Math.sin(SV.pitch) * 10; P.lz = SV.z + Math.cos(SV.yaw) * cp * 10;
  return P;
}
function setStreetView(on, x, z, yaw) {
  on = !!on;
  if (on) {
    var b = svBounds(), first = !SV.on;
    if (typeof x !== 'number' || typeof z !== 'number') { x = cam.target.x; z = cam.target.z; }
    SV.x = clamp(x, b.x0, b.x1); SV.z = clamp(z, b.z0, b.z1);
    if (first) { SV.yaw = typeof yaw === 'number' ? yaw : wrapPI(cam.yaw + PI); SV.pitch = -0.04; SV.vx = SV.vz = 0; SV.zoom = 1; SV.gy = svGround(SV.x, SV.z); SV.go = null; SV.fwd = SV.str = SV.turn = 0; }
    else if (typeof yaw === 'number') SV.yaw = yaw;
    SV.on = true;
    if (first && Z.bus) Z.bus.emit('streetview', true);
  } else if (SV.on) {
    SV.on = false; SV.go = null; SV.fwd = SV.str = SV.turn = 0;
    if (Z.bus) Z.bus.emit('streetview', false);
  }
}
function buildSVMarker() {
  var g = new THREE.RingGeometry(0.42, 0.62, 28); g.rotateX(-PI / 2);
  var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
  m.renderOrder = 12; m.visible = false; m.frustumCulled = false; scene.add(m); SV.marker = m;
}

/* ----------------------------------------------------------------- picking */
var _v = new THREE.Vector3(), _rect = { left: 0, top: 0, width: 1, height: 1 };
function canvasRect() {
  return RENDER.canvasRect(renderer, _rect);
}
function pickGround(cx, cy) {
  if (!G.inited) return null;
  var r = canvasRect();
  camera.updateMatrixWorld();
  _v.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
  var ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
  var dx = _v.x - ox, dy = _v.y - oy, dz = _v.z - oz;
  if (dy > -1e-6) return null;
  // march the ray against the heightfield, then bisect the crossing
  var rl = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= rl; dy /= rl; dz /= rl;
  var t = Math.max(0, (9 - oy) / dy), tEnd = (-3.2 - oy) / dy, tp = t, hit = false, x = 0, z = 0, st = 0;
  for (; t <= tEnd && st < 1800; t += 0.35, st++) {
    x = ox + dx * t; z = oz + dz * t;
    if (x >= 0 && z >= 0 && x < W && z < W && oy + dy * t <= groundY(x, z)) { hit = true; break; }
    tp = t;
  }
  if (!hit) return null;
  for (var it = 0; it < 9; it++) {
    var tm = (tp + t) * 0.5; x = ox + dx * tm; z = oz + dz * tm;
    if (oy + dy * tm <= groundY(x, z)) t = tm; else tp = tm;
  }
  x = ox + dx * t; z = oz + dz * t;
  if (x < 0 || z < 0 || x >= W || z >= W) return null;
  var i = Math.floor(x / T), j = Math.floor(z / T), fx = x / T - i, fz = z / T - j;
  var dN = fz, dS = 1 - fz, dW = fx, dE = 1 - fx, m = Math.min(dN, dS, dW, dE), edge;
  if (m === dN) edge = { axis: 'x', i: i, j: j }; else if (m === dS) edge = { axis: 'x', i: i, j: j + 1 };
  else if (m === dW) edge = { axis: 'z', i: i, j: j }; else edge = { axis: 'z', i: i + 1, j: j };
  return { x: x, z: z, i: i, j: j, edge: edge };
}
var _pr = { x: 0, y: 0, w: 0, vis: false };
function projectPoint(x, y, z, out) {
  return RENDER.projectPoint(_vp, canvasRect(), x, y, z, out);
}
function pickEntity(cx, cy) {
  if (!G.inited || !Z.state) return null;
  var r = canvasRect();
  camera.updateMatrixWorld(); _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  var touch = (typeof window !== 'undefined') && ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
  var base = touch ? 40 : 26, pxPerUnit = (r.height * 0.5) / Math.tan(camera.fov * PI / 360);
  var best = null, bestS = 1, kinds = ['animal', 'staff', 'guest'], bonus = { animal: 0, staff: 0.06, guest: 0.14 };
  for (var ki = 0; ki < 3; ki++) {
    var kind = kinds[ki];
    ents[kind].forEach(function (rec) {
      if (!rec.vis_) return;
      projectPoint(rec.ent.x || 0, rec.gy + rec.ht * 0.5, rec.ent.z || 0, _pr);
      if (!_pr.vis) return;
      var rad = Math.max(base * (kind === 'guest' ? 0.85 : 1), pxPerUnit * rec.ht * 0.55 / _pr.w);
      var dx = _pr.x - cx, dy = _pr.y - cy, d = Math.sqrt(dx * dx + dy * dy), sc = d / rad + bonus[kind];
      if (d < rad && sc < bestS) { bestS = sc; best = { kind: kind, id: rec.id }; }
    });
  }
  if (Z.CoasterWorld && Z.CoasterWorld.pickTrain) {
    var ct = Z.CoasterWorld.pickTrain(cx, cy, projectPoint, pxPerUnit, base);
    if (ct) return ct;
  }
  if (best) {
    if (best.kind === 'guest') {
      var ge = ents.guest.get(best.id);
      if (ge && ge.ent && ge.ent.state === 'ride' && ge.ent.coasterTrain) return { kind: 'ctrain', id: ge.ent.coasterTrain };
    }
    return best;
  }
  var gp = pickGround(cx, cy), s = Z.state;
  if (gp) {
    var idx = gp.i + gp.j * N, oid = s.tileObj ? s.tileObj[idx] : 0;
    if (oid) return { kind: 'object', id: oid };
  }
  // tall buildings: test projected centres
  var bo = null, bd = 1e9;
  objRecs.forEach(function (rc) {
    if (rc.kind !== 'building') return;
    projectPoint(rc.x, 1.4, rc.z, _pr); if (!_pr.vis) return;
    var rad = Math.max(base, pxPerUnit * 1.6 * Math.max(rc.w, rc.h) / _pr.w * 0.6), dx = _pr.x - cx, dy = _pr.y - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d < rad && d < bd) { bd = d; bo = rc.id; }
  });
  if (bo) return { kind: 'object', id: bo };
  if (gp && s.tileEnc) { var eid = s.tileEnc[gp.i + gp.j * N]; if (eid) return { kind: 'enclosure', id: eid }; }
  return null;
}

/* ------------------------------------------------------------ events/reset */
function rebuildForGridSize() {
  if (!G.inited) return;
  N = Z.N || 56; T = Z.TILE || 2; W = N * T; NCH = Math.ceil(N / CH);
  DIST_MAX = Math.max(150, W * 1.4);
  terrDirty = null;
  outerSig = null;
  if (wallMesh) { root.remove(wallMesh); wallMesh.geometry.dispose(); wallMesh = null; }
  wildObjs.forEach(function (m) { root.remove(m); m.dispose && m.dispose(); }); wildObjs.length = 0;
  buildTerrain();
  buildOuter();
  buildSurroundings();
  buildPathsFences();
  cam.target.x = W / 2; cam.target.z = W * 0.7;
  cam.dist = clamp(W * 0.56, DIST_MIN, DIST_MAX);
  clampCam();
  view.x = cam.target.x; view.z = cam.target.z; view.dist = cam.dist;
  SV.x = W / 2; SV.z = W - 6;
  if (SV.on) {
    var sb = svBounds();
    SV.x = clamp(SV.x, sb.x0, sb.x1);
    SV.z = clamp(SV.z, sb.z0, sb.z1);
  }
  terrainRange(0, 0, N - 1, N - 1);
  pathDirty.fill(1); fenceDirty.fill(1);
  rebuildCageRoofs();
}
function resetAll() {
  if (!G.inited) return;
  if ((Z.N || 56) !== N || (Z.TILE || 2) !== T) {
    rebuildForGridSize();
  }
  terrDirty = null;
  terrainRange(0, 0, N - 1, N - 1);
  pathDirty.fill(1); fenceDirty.fill(1);
  rebuildCageRoofs();
  objRecs.forEach(function (r) { removeRec(r); }); objRecs.clear();
  for (var t in pools) { root.remove(pools[t].mesh); } pools = {};
  clearEnts();
  clearFightClouds();
  clearBreakageFX();
  objDirty = true; G.poopSig = -1; G.litterSig = -1; G.ovTimer = 0;
  followK = null; followId = null;
  setPreview(null);
  pv.encId = null; rebuildEncHighlight();
  thoughtIdx = null;
  var s = Z.state;
  // keep camera on the zoo
  if (s) { G.fresh = true; }
}
function hookBus() {
  var b = Z.bus; if (!b || !b.on) return;
  b.on('reset', resetAll);
  b.on('gridsize', rebuildForGridSize);
  b.on('terrain', function (r) {
    if (!r) r = { i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
    if (!terrDirty) terrDirty = { i0: r.i0, j0: r.j0, i1: r.i1, j1: r.j1 };
    else { terrDirty.i0 = Math.min(terrDirty.i0, r.i0); terrDirty.j0 = Math.min(terrDirty.j0, r.j0); terrDirty.i1 = Math.max(terrDirty.i1, r.i1); terrDirty.j1 = Math.max(terrDirty.j1, r.j1); }
  });
  function onElev(r) {
    if (!r) r = { i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
    var q = { i0: Math.max(0, r.i0 - 1), j0: Math.max(0, r.j0 - 1), i1: Math.min(N - 1, r.i1 + 1), j1: Math.min(N - 1, r.j1 + 1) };
    if (!terrDirty) terrDirty = q;
    else { terrDirty.i0 = Math.min(terrDirty.i0, q.i0); terrDirty.j0 = Math.min(terrDirty.j0, q.j0); terrDirty.i1 = Math.max(terrDirty.i1, q.i1); terrDirty.j1 = Math.max(terrDirty.j1, q.j1); }
    markRect(pathDirty, q.i0, q.j0, q.i1, q.j1, 1); markRect(fenceDirty, q.i0, q.j0, q.i1 + 1, q.j1 + 1, 1);
    elevTouched = true;
  }
  b.on('elev', onElev);
  b.on('elev:change', onElev);
  b.on('path', function (r) { if (!r) pathDirty.fill(1); else markRect(pathDirty, r.i0, r.j0, r.i1, r.j1, 1); });
  b.on('fence', function (e) {
    if (!e) { fenceDirty.fill(1); return; }
    if (e.axis === 'x') markRect(fenceDirty, e.i - 1, e.j - 1, e.i + 1, e.j, 1); else markRect(fenceDirty, e.i - 1, e.j - 1, e.i, e.j + 1, 1);
  });
  function dirtyFenceEdge(e) {
    var ed = e && (e.edge || (e.axis ? e : null));
    if (!ed) { fenceDirty.fill(1); return; }
    if (ed.axis === 'x') markRect(fenceDirty, ed.i - 1, ed.j - 1, ed.i + 1, ed.j, 1); else markRect(fenceDirty, ed.i - 1, ed.j - 1, ed.i, ed.j + 1, 1);
  }
  b.on('fenceBreach', dirtyFenceEdge);
  b.on('fenceFixed', dirtyFenceEdge);
  b.on('fences', function () { fenceDirty.fill(1); rebuildCageRoofs(); });
  b.on('objectAdded', function () { objDirty = true; });
  b.on('objectRemoved', function () { objDirty = true; });
  b.on('animalRemoved', function (a) { if (a) removeEnt('animal', a.id); });
  b.on('guestRemoved', function (a) { if (a) removeEnt('guest', a.id); });
  b.on('staffRemoved', function (a) { if (a) removeEnt('staff', a.id); });
  b.on('enclosures', function () { G.poopSig = -1; if (pv.encId) rebuildEncHighlight(); rebuildCageRoofs(); });
  b.on('money', function (m) { if (m && typeof m.x === 'number' && typeof m.z === 'number') spawnMoney(m.delta, m.x, m.z); });
  b.on('birth', function (a) { if (a && typeof a.x === 'number') spawnEmote('heart', a.x, a.z, (entityRec('animal', a.id) ? entityRec('animal', a.id).ht : 1.5) + 0.6); });
  b.on('predation', function (e) { var p = e && (e.prey || e.predator); if (p && typeof p.x === 'number') spawnEmote('bite', p.x, p.z, (entityRec('animal', p.id) ? entityRec('animal', p.id).ht : 1.5) + 0.8); });
  b.on('fightStart', function (f) { if (f && typeof f.x === 'number' && typeof f.z === 'number') spawnEmote('fight', f.x, f.z, 1.8 + (f.size || 1) * 0.45); });
  b.on('hatch', function (e) { var a = e && e.ok && e.animal; if (a && typeof a.x === 'number') spawnEmote('heart', a.x, a.z, (entityRec('animal', a.id) ? entityRec('animal', a.id).ht : 1.5) + 0.6); });
  b.on('escape', function (a) { if (a && typeof a.x === 'number') spawnEmote('alert', a.x, a.z, (entityRec('animal', a.id) ? entityRec('animal', a.id).ht : 1.5) + 0.8); });
}

/* ------------------------------------------------------------------- frame */
function frame(dtReal) {
  if (!G.inited || G.lost) return;
  dtReal = isFin(dtReal) ? clamp(dtReal, 0, 0.1) : 0.016;
  G.t += dtReal; G.frameNo++;
  var s = Z.state, speed = s && typeof s.speed === 'number' ? s.speed : 1, dtGame = dtReal * speed;
  G.speed = speed;
  updateCamera(dtReal);
  ATM.context(view, W, SV, camera);
  if (G.shadows) ATM.updateSunTarget();
  ATM.updateWeather(dtReal);
  // atmosphere
  var tm = s && typeof s.time === 'number' ? s.time : 0.5;
  if (Math.abs(tm - G.lastTm) > 0.0003 || G.frameNo % 30 === 0 || G.lastTm === undefined || ATM.weatherDirty() || SV.blend > 0) { G.lastTm = tm; ATM.updateAtmosphere(); }
  ATM.updateRain(dtReal);
  ATM.frameUpdate(); if (MAT.lava) MAT.lava.uniforms.uTime.value = G.t;
  ATM.centerSky(camera);
  for (var c = 0; c < clouds.length; c++) { var cm = clouds[c]; cm.position.x += cm.userData.sp * dtReal; if (cm.position.x > W + 170) cm.position.x = -240; }
  // dirty work
  if (terrDirty) { var r = terrDirty; terrDirty = null; terrainRange(r.i0, r.j0, r.i1, r.j1); }
  if (waterDirty) rebuildWater();
  if (lavaDirty) rebuildLava();
  processChunks();
  if (objDirty || (s && s.objects && s.objects.length !== objRecs.size)) syncObjects();
  if (G.lockdown) ATM.setLockdown(true, G.t);
  if (G.shDirty) writeStaticShadows();
  updateEntities(dtReal, dtGame);
  updateBuildings(dtGame);
  syncEggs(dtReal);
  syncFights(dtReal);
  syncBreakageFX(dtReal);
  updateBubbles();
  updateFloaters(dtReal);
  updateGrime(dtReal);
  updateLamps(dtReal);
  if (Z.CoasterWorld && Z.CoasterWorld.frame) Z.CoasterWorld.frame(dtReal, dtGame);
  if (Z.BoatsWorld) Z.BoatsWorld.frame(dtReal);
  updatePreview();
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------- API */
World.init = init; World.frame = frame; World.resize = resize;
World.pan = pan; World.rotate = rotate; World.zoom = zoom; World.focus = focus; World.follow = follow;
World.pickGround = pickGround; World.pickEntity = pickEntity;
World.setLockdown = function (on) { G.lockdown = !!on; if (!on) ATM.restoreLockdown(); };
World.setPreview = setPreview; World.highlightEnclosure = highlightEnclosure;
// additions (not in the contract)
World.groundY = groundY;
World.waterLevelAt = waterLvlAt;
World.reseatWorld = reseatWorld;
World.objectBox = function (id) { var r = objRecs.get(id); if (!r || !r.group) return null; var b = new THREE.Box3().setFromObject(r.group); return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], pos: [r.group.position.x, r.group.position.y, r.group.position.z], w: r.w, h: r.h }; };
World.project = function (x, y, z) { var o = { x: 0, y: 0, w: 0, vis: false }; if (!G.inited) return o; _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); return projectPoint(x, y, z, o); };
World.entityPos = function (kind, id) { var r = entityRec(kind, id); return r ? { x: fin(r.ent.x, 0), y: fin(r.gy, 0), z: fin(r.ent.z, 0), h: fin(r.ht, 1.5) } : null; };
World.setStreetView = setStreetView;
World.isStreetView = function () { return SV.on; };
World.svInput = function (fwd, strafe, run, turn) { SV.fwd = clamp(+fwd || 0, -1, 1); SV.str = clamp(+strafe || 0, -1, 1); SV.run = !!run; SV.turn = clamp(+turn || 0, -1, 1); };
World.svLook = function (dyaw, dpitch) { SV.yaw = wrapPI(SV.yaw + fin(dyaw, 0)); SV.pitch = clamp(SV.pitch + fin(dpitch, 0), -1.2, 1.2); };
World.svZoom = function (factor) { if (!isFin(factor) || factor <= 0) return; SV.zoom = clamp(SV.zoom * factor, 0.4, 1.15); };
World.svGoto = function (x, z) { if (!isFin(x) || !isFin(z)) return; var b = svBounds(); SV.go = { x: clamp(x, b.x0, b.x1), z: clamp(z, b.z0, b.z1) }; SV.fwd = SV.str = 0; };
// teleport (optionally turning to face lx,lz)
World.svHeading = function () { return SV.yaw; };
World.svJump = function (x, z, lx, lz) {
  if (!isFin(x) || !isFin(z)) return;
  var b = svBounds(); SV.x = clamp(x, b.x0, b.x1); SV.z = clamp(z, b.z0, b.z1); SV.vx = SV.vz = 0; SV.go = null; SV.gy = svGround(SV.x, SV.z);
  if (isFin(lx) && isFin(lz)) { SV.yaw = Math.atan2(lx - SV.x, lz - SV.z); SV.pitch = -0.05; }
};
World.svInfo = function () { return { on: SV.on, x: SV.x, z: SV.z, yaw: SV.yaw, pitch: SV.pitch, zoom: SV.zoom, blend: SV.blend, walking: !!SV.go || Math.abs(SV.vx) + Math.abs(SV.vz) > 0.3, bounds: svBounds() }; };
// weather (test hook): the renderer reads Z.state.weather every frame, this just forces an immediate look
World.weatherInfo = function () { return ATM ? ATM.weatherInfo() : RENDER.emptyWeatherInfo(); };
World.isFollowing = function () { return followK ? { kind: followK, id: followId } : null; };
World.info = function () { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, night: G.night, daylight: G.daylight, view: { x: view.x, z: view.z, dist: view.dist, yaw: view.yaw, pitch: view.pitch } }; };
World.snapCamera = function () { clampCam(); view.x = cam.target.x; view.z = cam.target.z; view.dist = cam.dist; view.yaw = cam.yaw; view.pitch = cam.pitch; };
World._G = G;
World.renderer = function () { return renderer; };
World.setQuality = function (pr, budget, opts) {
  if (pr) G.prCap = pr;
  if (budget) MESH_BUDGET = budget;
  if (opts) {
    if (opts.impostors !== undefined) { IMPOSTORS_ON = !!opts.impostors; G.impostors = IMPOSTORS_ON; }
    if (opts.shadows !== undefined) {
      G.shadows = !!opts.shadows;
      if (renderer && renderer.shadowMap) { renderer.shadowMap.enabled = G.shadows; renderer.shadowMap.needsUpdate = true; }
      if (ATM) ATM.setShadows(G.shadows);
      if (MAT.shadow) ATM.updateAtmosphere();
    }
    if (opts.farScale) {
      FAR.animal = Math.round(280 * opts.farScale); FAR.guest = Math.round(160 * opts.farScale); FAR.staff = Math.round(190 * opts.farScale);
      UPD_FAR.animal = Math.round(130 * opts.farScale); UPD_FAR.guest = Math.round(85 * opts.farScale); UPD_FAR.staff = Math.round(95 * opts.farScale);
    }
    if (opts.detail !== undefined) {
      if (G.detail !== opts.detail) instCache = {};
      G.detail = opts.detail;
      if (Z.Models && Z.Models.setDetail) Z.Models.setDetail(opts.detail);
    }
  }
  resize();
};
World.scene = function () { return scene; };
World.root = function () { return root; };
World.camera = function () { return camera; };
World.cam = cam;
})();
