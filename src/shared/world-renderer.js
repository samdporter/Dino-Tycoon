// Small renderer primitives shared by the Dino and Zoo world implementations.
// Load after THREE and before either 40-world.js.
window.Z = window.Z || {};
window.Z.WorldRendererShared = (function () {
  'use strict';

  function canvasRect(renderer, out) {
    var r = renderer.domElement.getBoundingClientRect();
    out.left = r.left; out.top = r.top; out.width = r.width || 1; out.height = r.height || 1;
    return out;
  }

  function projectPoint(vp, rect, x, y, z, out) {
    var e = vp.elements;
    var cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (cw <= 0.01) { out.vis = false; return out; }
    var nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw;
    var ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw;
    out.x = (nx * 0.5 + 0.5) * rect.width + rect.left;
    out.y = (-ny * 0.5 + 0.5) * rect.height + rect.top;
    out.w = cw; out.vis = true;
    return out;
  }

  function createSkyMaterial(THREE) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1, 1, 1) }, uStars: { value: 0 }, uGlow: { value: 1 }, uTime: { value: 0 }
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }',
      fragmentShader: [
        'uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uStars; uniform float uGlow; uniform float uTime;',
        'varying vec3 vDir;',
        'float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
        'void main(){',
        ' vec3 d = normalize(vDir); float h = d.y;',
        ' float t = pow(clamp(h,0.0,1.0),0.5);',
        ' vec3 col = mix(uHor,uZen,t);',
        ' if(h<0.0) col = uHor*mix(1.0,0.9,clamp(-h*4.0,0.0,1.0));',
        ' float sd = max(dot(d,uSunDir),0.0);',
        ' col += uSunCol*(pow(sd,5.0)*0.22*uGlow + pow(sd,48.0)*0.45*uGlow);',
        ' float disc = smoothstep(0.99935,0.9997,sd) * step(-0.06,uSunDir.y);',
        ' col = mix(col, uSunCol*1.6, disc);',
        ' float md = dot(d,-uSunDir);',
        ' col = mix(col, vec3(0.85,0.9,1.0)*0.9, smoothstep(0.9993,0.9997,md)*uStars);',
        ' col += vec3(0.06,0.08,0.14)*pow(max(md,0.0),30.0)*uStars;',
        ' if(uStars>0.01 && h>0.01){',
        '  vec3 gg = d*260.0; vec3 g = floor(gg); vec3 fr = fract(gg)-0.5; float s = hash(g); float star = step(0.992,s)*smoothstep(0.42,0.05,length(fr));',
        '  float tw = 0.65+0.35*sin(uTime*2.3+s*60.0);',
        '  col += vec3(star*tw*uStars*smoothstep(0.01,0.18,h)) * vec3(1.0,0.95,0.9);',
        ' }',
        ' gl_FragColor = vec4(col,1.0);',
        ' #include <encodings_fragment>',
        '}'
      ].join('\n')
    });
  }

  function weatherTarget(type, i, g) {
    g.rain = g.cloud = g.fog = g.heat = g.storm = 0;
    switch (type) {
      case 'cloudy': g.cloud = 0.45 + 0.45 * i; break;
      case 'rain': g.rain = 0.35 + 0.65 * i; g.cloud = 0.55 + 0.35 * i; break;
      case 'storm': g.rain = 0.75 + 0.25 * i; g.cloud = 0.9 + 0.1 * i; g.storm = 1; break;
      case 'heatwave': g.heat = 0.5 + 0.5 * i; break;
      case 'fog': g.fog = 0.55 + 0.45 * i; g.cloud = 0.3; break;
    }
  }

  function canvasTexture(THREE, useSRGB, anisotropy, canvas, repeat, forceSRGB) {
    var t = new THREE.CanvasTexture(canvas);
    if (useSRGB && forceSRGB !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = anisotropy;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  function createWorldTextures(opts) {
    var THREE = opts.THREE, SRGB = opts.srgb, maxAniso = opts.anisotropy;
    var mkCanvas = opts.createCanvas, rng32 = opts.rng32, TAU = opts.tau;
    function texFrom(c, rep, srgb) { return canvasTexture(THREE, SRGB, maxAniso, c, rep, srgb); }
    function makeGrain() {
      var c = mkCanvas(128, 128), x = c.getContext('2d'), r = rng32(11);
      var id = x.createImageData(128, 128), d = id.data;
      for (var k = 0; k < 128 * 128; k++) {
        var v = 226 + r() * 29; var j = k * 4;
        d[j] = v; d[j + 1] = v; d[j + 2] = v; d[j + 3] = 255;
      }
      x.putImageData(id, 0, 0);
      // soft blotches (wrapped)
      for (var b = 0; b < 46; b++) {
        var bx = r() * 128, by = r() * 128, br = 6 + r() * 14, dark = r() < 0.5;
        for (var ox = -128; ox <= 128; ox += 128) for (var oy = -128; oy <= 128; oy += 128) {
          var g = x.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, br);
          g.addColorStop(0, dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(bx + ox - br, by + oy - br, br * 2, br * 2);
        }
      }
      // tiny grass-blade flecks
      for (var f = 0; f < 260; f++) {
        var fx = r() * 128, fy = r() * 128;
        x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.14)';
        x.fillRect(fx, fy, 1, 2 + r() * 2);
      }
      return texFrom(c, true);
    }
    // path atlas: 4 cells of 128px: dirt, paved, cobble, asphalt (greyscale-ish detail, tinted by vertex colour)
    function makePathAtlas() {
      var c = mkCanvas(512, 128), x = c.getContext('2d'), r = rng32(5), k, i, j;
      function noise(ox, amp, base) {
        var id = x.getImageData(ox, 0, 128, 128), d = id.data;
        for (var p = 0; p < 128 * 128; p++) { var n = (r() - 0.5) * amp; d[p * 4] += n; d[p * 4 + 1] += n; d[p * 4 + 2] += n; }
        x.putImageData(id, ox, 0);
      }
      // dirt
      x.fillStyle = '#e4e0da'; x.fillRect(0, 0, 128, 128);
      for (k = 0; k < 90; k++) {
        var bx = r() * 128, by = r() * 128, br = 4 + r() * 12, dk = r() < 0.5;
        for (var ox = -128; ox <= 128; ox += 128) for (var oy = -128; oy <= 128; oy += 128) {
          var g = x.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, br);
          g.addColorStop(0, dk ? 'rgba(60,40,20,0.16)' : 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(bx + ox - br, by + oy - br, br * 2, br * 2);
        }
      }
      for (k = 0; k < 60; k++) { x.fillStyle = 'rgba(70,55,40,' + (0.2 + r() * 0.3) + ')'; x.beginPath(); x.arc(r() * 128, r() * 128, 0.8 + r() * 1.6, 0, TAU); x.fill(); }
      noise(0, 18);
      // paved slabs (2x2 per tile)
      x.fillStyle = '#6e6c68'; x.fillRect(128, 0, 128, 128);
      for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
        var sh = 222 + r() * 30;
        x.fillStyle = 'rgb(' + sh + ',' + sh + ',' + (sh - 3) + ')';
        x.fillRect(128 + i * 64 + 2, j * 64 + 2, 60, 60);
        // bevel highlight
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(128 + i * 64 + 2, j * 64 + 2, 60, 2); x.fillRect(128 + i * 64 + 2, j * 64 + 2, 2, 60);
        x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(128 + i * 64 + 2, j * 64 + 60, 60, 2); x.fillRect(128 + i * 64 + 60, j * 64 + 2, 2, 60);
      }
      noise(128, 14);
      // cobbles
      x.fillStyle = '#716e69'; x.fillRect(256, 0, 128, 128);
      var G8 = 8, cs = 128 / G8;
      for (i = 0; i < G8; i++) for (j = 0; j < G8; j++) {
        var cx = (i + 0.5) * cs + (r() - 0.5) * 3 + ((j & 1) ? cs * 0.35 : 0), cy = (j + 0.5) * cs + (r() - 0.5) * 3;
        var rx = cs * (0.40 + r() * 0.07), ry = cs * (0.38 + r() * 0.07), sh2 = 185 + r() * 65;
        for (var wx = -128; wx <= 128; wx += 128) {
          var px = cx + wx;
          if (px < -cs || px > 128 + cs) continue;
          var gg = x.createRadialGradient(256 + px - 2, cy - 2, 1, 256 + px, cy, rx * 1.05);
          gg.addColorStop(0, 'rgb(' + Math.min(255, sh2 + 30) + ',' + Math.min(255, sh2 + 28) + ',' + Math.min(255, sh2 + 24) + ')');
          gg.addColorStop(1, 'rgb(' + (sh2 - 40) + ',' + (sh2 - 42) + ',' + (sh2 - 46) + ')');
          x.save(); x.beginPath(); x.rect(256, 0, 128, 128); x.clip();
          x.fillStyle = gg; x.beginPath(); x.ellipse(256 + px, cy, rx, ry, 0, 0, TAU); x.fill(); x.restore();
        }
      }
      noise(256, 12);
      // asphalt
      x.fillStyle = '#c8c8cc'; x.fillRect(384, 0, 128, 128);
      for (k = 0; k < 400; k++) { x.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (0.05 + r() * 0.12) + ')'; x.fillRect(384 + r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
      noise(384, 16);
      var t = texFrom(c, false);
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    }
    function makeChainTex() {
      var c = mkCanvas(64, 64), x = c.getContext('2d');
      x.clearRect(0, 0, 64, 64);
      x.fillStyle = 'rgba(180,190,200,0.07)'; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = 'rgba(215,222,230,0.95)'; x.lineWidth = 2.4;
      for (var k = -64; k <= 128; k += 16) {
        x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 64, 64); x.stroke();
        x.beginPath(); x.moveTo(k, 64); x.lineTo(k + 64, 0); x.stroke();
      }
      return texFrom(c, true);
    }
    function makeBlobTex() {
      var c = mkCanvas(64, 64), x = c.getContext('2d');
      var g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
      g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.5, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return texFrom(c, false, false);
    }
    function makeGlowTex() {
      var c = mkCanvas(64, 64), x = c.getContext('2d');
      var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,248,220,1)'); g.addColorStop(0.18, 'rgba(255,214,140,0.85)'); g.addColorStop(0.5, 'rgba(255,170,70,0.22)'); g.addColorStop(1, 'rgba(255,150,50,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return texFrom(c, false, false);
    }
    function makeTileTex() {
      var c = mkCanvas(64, 64), x = c.getContext('2d');
      x.fillStyle = 'rgba(255,255,255,0.42)'; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 5; x.strokeRect(2.5, 2.5, 59, 59);
      return texFrom(c, false, false);
    }
    return {
      build: function () {
        return { grain: makeGrain(), path: makePathAtlas(), chain: makeChainTex(), blob: makeBlobTex(), glow: makeGlowTex(), tile: makeTileTex() };
      }
    };
  }

  function cameraPanDelta(cam, dx, dy, fov, height, pitch) {
    var wpp = 2 * cam.dist * Math.tan(fov * Math.PI / 360) / (height || 600);
    var sy = Math.sin(pitch), c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    return [-(c * dx) * wpp - (s * dy) * wpp / sy, (s * dx) * wpp - (c * dy) * wpp / sy];
  }
  function cameraRotate(cam, dYaw, dPitch) {
    cam.yaw += typeof dYaw === 'number' && isFinite(dYaw) ? dYaw : 0;
    cam.pitch += typeof dPitch === 'number' && isFinite(dPitch) ? dPitch : 0;
  }
  function cameraZoom(cam, factor) { cam.dist *= factor; }
  function emptyWeatherInfo() { return { type: '', cur: { rain: 0, cloud: 0, fog: 0, heat: 0, storm: 0 }, flash: 0 }; }

  function createAtmosphere(opts) {
    var THREE = opts.THREE, Z = opts.Z, scene = opts.scene, MAT = opts.materials, G = opts.graphics;
    var SRGB = !!opts.srgb, clouds = opts.clouds, fogRange = opts.fogRange;
    var onLightning = opts.onLightning, rng32Local = opts.rng32;
    var TAU = Math.PI * 2, W = opts.width, view = opts.view;
    var SV = opts.streetView, camera = opts.camera;
    function clamp(v, a, b) { return typeof v !== 'number' || !isFinite(v) ? a : v < a ? a : v > b ? b : v; }
    function isFin(v) { return typeof v === 'number' && isFinite(v); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
    function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function hex3(h) { if (typeof h === 'string') h = parseInt(h.replace('#', ''), 16); if (!(h >= 0)) h = 0x888888; return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }
    var SKY_KEYS = [
      [0.00, '#050a1e', '#0f1838'], [0.19, '#070d26', '#1a2147'], [0.235, '#2b3a72', '#c8708a'],
      [0.27, '#4d7fc0', '#f6a78a'], [0.32, '#4a90d8', '#cfe4f2'], [0.50, '#2f7fe0', '#b8dcf5'],
      [0.68, '#3f87dc', '#c3dff2'], [0.745, '#5a86c8', '#f8c58a'], [0.79, '#3a4a8a', '#f08a5a'],
      [0.835, '#1a2150', '#6a4a78'], [0.88, '#0a1030', '#232d5c'], [1.0, '#050a1e', '#0f1838']
    ].map(function (k) { return { t: k[0], z: hex3(k[1]), h: hex3(k[2]) }; });
    var A = { zen: [0, 0, 0], hor: [0, 0, 0], zenL: [0, 0, 0], horL: [0, 0, 0] };
    var sunL, moonL, hemi, skyMesh, skyMat, sunDir = null, moonDir = null;
    function skyAt(t) {
      var k = SKY_KEYS, i = 0;
      while (i < k.length - 2 && t > k[i + 1].t) i++;
      var a = k[i], b = k[i + 1], f = clamp((t - a.t) / (b.t - a.t), 0, 1);
      for (var c = 0; c < 3; c++) { A.zen[c] = lerp(a.z[c], b.z[c], f); A.hor[c] = lerp(a.h[c], b.h[c], f); }
      for (c = 0; c < 3; c++) { A.zenL[c] = SRGB ? s2l(A.zen[c]) : A.zen[c]; A.horL[c] = SRGB ? s2l(A.hor[c]) : A.hor[c]; }
    }
    var _zero = new THREE.Vector3();
    function updateSunTarget() {
      if (!sunL || !sunDir) return;
      var tx = (typeof view !== 'undefined' && view && isFin(view.x)) ? view.x : W / 2;
      var tz = (typeof view !== 'undefined' && view && isFin(view.z)) ? view.z : W / 2;
      if (sunL.target) { sunL.target.position.set(tx, 0, tz); sunL.target.updateMatrixWorld(); }
      sunL.position.copy(sunDir).multiplyScalar(100).add(sunL.target ? sunL.target.position : _zero);
    }
    function updateAtmosphere() {
      var s = Z.state, t = s && typeof s.time === 'number' ? s.time : 0.5;
      t = t - Math.floor(t);
      G.time = t;
      skyAt(t);
      var a = (t - 0.25) * TAU;
      sunDir.set(Math.cos(a), Math.sin(a), 0.38).normalize();
      moonDir.copy(sunDir).multiplyScalar(-1);
      var e = sunDir.y; G.sunE = e;
      var dayK = sstep(-0.10, 0.30, e);
      G.daylight = dayK; G.night = 1 - sstep(-0.22, 0.04, e);
      // sky
      var u = skyMat.uniforms;
      u.uZen.value.setRGB(A.zenL[0], A.zenL[1], A.zenL[2]);
      u.uHor.value.setRGB(A.horL[0], A.horL[1], A.horL[2]);
      u.uSunDir.value.copy(sunDir);
      var warm = 1 - sstep(0.05, 0.5, e);
      u.uSunCol.value.setRGB(1.0, lerp(0.93, 0.55, warm), lerp(0.80, 0.30, warm));
      u.uStars.value = clamp(1 - sstep(-0.22, 0.02, e), 0, 1);
      u.uGlow.value = clamp(1.2 - sstep(-0.1, 0.35, Math.abs(e)) * 0.7, 0.3, 1.2);
      u.uTime.value = G.t;
      // fog follows horizon
      scene.fog.color.setRGB(A.horL[0] * 0.96, A.horL[1] * 0.96, A.horL[2] * 0.96);
      // sun & moon
      updateSunTarget();
      sunL.castShadow = !!G.shadows && e > -0.02;
      sunL.intensity = (G.shadows ? 0.68 : 0.58) * sstep(-0.03, 0.22, e);
      var sc = mix3([1, 0.62, 0.36], [1, 0.95, 0.84], sstep(0.02, 0.5, e));
      sunL.color.setRGB(SRGB ? s2l(sc[0]) : sc[0], SRGB ? s2l(sc[1]) : sc[1], SRGB ? s2l(sc[2]) : sc[2]);
      moonL.position.copy(moonDir).multiplyScalar(100);
      moonL.intensity = 0.5 * sstep(0.02, 0.25, -e + 0.06) * (1 - dayK);
      // hemisphere
      var dayC = [0.80, 0.90, 1.0], nightC = [0.34, 0.42, 0.72];
      var hc = mix3(nightC, dayC, dayK);
      hc = mix3(hc, A.horL, 0.28 * (1 - sstep(0.05, 0.4, e)) * dayK);
      hemi.color.setRGB(hc[0], hc[1], hc[2]);
      var gc = mix3([0.18, 0.2, 0.26], [0.52, 0.55, 0.42], dayK);
      hemi.groundColor.setRGB(gc[0], gc[1], gc[2]);
      hemi.intensity = lerp(0.9, 0.64, dayK);
      // blob shadow strength
      MAT.shadow.opacity = (0.18 + 0.5 * sstep(0.0, 0.35, e)) * (G.shadows ? 0.38 : 1.0);
      // water
      if (MAT.water) {
        var w = MAT.water.uniforms;
        w.uTime.value = G.t; w.uLight.value = lerp(0.42, 1.0, dayK);
        w.uSky.value.setRGB(A.horL[0], A.horL[1], A.horL[2]);
        w.uSunDir.value.copy(sunDir); w.uSunCol.value.copy(u.uSunCol.value);
        w.uSunI.value = 0.9 * sstep(0.0, 0.3, e) + 0.35 * (1 - dayK);
      }
      applyWeather(dayK, e);
    }

    /* ------------------------------------------------------- weather visuals */
    // S.weather = { type, intensity, hoursLeft }. Missing = clear. Values glide towards the target over ~2 s.
    var WXV = { type: '', inten: -1, cur: { rain: 0, cloud: 0, fog: 0, heat: 0, storm: 0 }, tgt: { rain: 0, cloud: 0, fog: 0, heat: 0, storm: 0 }, flash: 0, flashT: 9, nextFlash: 5, dirty: false, wet: 0 };
    var rainMesh = null, rainU = null, RAIN_MAX = 3200;
    function setWeatherTarget(type, i) {
      weatherTarget(type, i, WXV.tgt);
    }
    function updateWeather(dt) {
      var s = Z.state, w = s && s.weather, type = (w && w.type) || 'clear', i = w && typeof w.intensity === 'number' ? clamp(w.intensity, 0, 1) : 0.6;
      if (type !== WXV.type || i !== WXV.inten) { WXV.type = type; WXV.inten = i; setWeatherTarget(type, i); }
      var c = WXV.cur, g = WXV.tgt, k = 1 - Math.exp(-dt * 1.5), ch = false, key;
      for (key in c) { var d = g[key] - c[key]; if (Math.abs(d) > 0.002) { c[key] += d * k; ch = true; } else if (d !== 0) { c[key] = g[key]; ch = true; } }
      // lightning
      if (c.storm > 0.6) {
        WXV.nextFlash -= dt;
        if (WXV.nextFlash <= 0) { WXV.flashT = 0; WXV.nextFlash = 4 + Math.random() * 9 * (1.4 - WXV.inten * 0.6); if (onLightning) onLightning(); }
      }
      if (WXV.flashT < 1.2) {
        WXV.flashT += dt; var t = WXV.flashT;
        WXV.flash = Math.max(Math.exp(-t * 8), t > 0.17 ? 0.75 * Math.exp(-(t - 0.17) * 7) : 0);
        if (t >= 1.2) WXV.flash = 0;
        ch = true;
      }
      WXV.dirty = ch;
    }
    var _wc = new THREE.Color();
    function applyWeather(dayK, sunE) {
      var c = WXV.cur, u = skyMat.uniforms, f = WXV.flash;
      var cl = clamp(c.cloud + c.rain * 0.2, 0, 1), fg = c.fog, ht = c.heat, st = c.storm, rn = c.rain;
      var svk = typeof SV !== 'undefined' && SV ? SV.blend : 0, near = lerp(Math.max(150, W * fogRange.near), 70, svk), far = lerp(Math.max(430, W * fogRange.far), 300, svk);
      scene.fog.near = near; scene.fog.far = far;
      if (cl + fg + ht + f + rn < 0.002) { tintMat(MAT.terrain, 1); tintMat(MAT.outer, 1); tintMat(MAT.path, 1); setCloudTint(0); if (rainMesh) rainMesh.visible = false; return; }
      var z = u.uZen.value, hr = u.uHor.value, sc = u.uSunCol.value, lum;
      // overcast: pull sky towards a flat grey that keeps the time-of-day brightness
      if (cl > 0) {
        lum = z.r * 0.3 + z.g * 0.59 + z.b * 0.11; var kz = cl * (0.78 + 0.1 * st);
        z.r = lerp(z.r, lum * 0.78, kz); z.g = lerp(z.g, lum * 0.8, kz); z.b = lerp(z.b, lum * 0.86, kz);
        lum = hr.r * 0.3 + hr.g * 0.59 + hr.b * 0.11; var kh = cl * 0.85;
        hr.r = lerp(hr.r, lum * 0.9, kh); hr.g = lerp(hr.g, lum * 0.92, kh); hr.b = lerp(hr.b, lum * 0.97, kh);
        if (st > 0) { var dk = 1 - 0.38 * st * (0.4 + 0.6 * dayK); z.multiplyScalar(dk); hr.multiplyScalar(1 - 0.28 * st * dayK); }
        sc.r = lerp(sc.r, hr.r, cl * 0.95); sc.g = lerp(sc.g, hr.g, cl * 0.95); sc.b = lerp(sc.b, hr.b, cl * 0.95);
        u.uGlow.value *= 1 - 0.85 * cl; u.uStars.value *= 1 - 0.92 * cl;
      }
      // heat haze: warm, pale horizon
      if (ht > 0) {
        var hk = ht * dayK;
        hr.r += 0.12 * hk; hr.g += 0.05 * hk; hr.b -= 0.03 * hk;
        z.r = lerp(z.r, hr.r, 0.25 * hk); z.g = lerp(z.g, hr.g, 0.25 * hk); z.b = lerp(z.b, hr.b, 0.2 * hk);
        u.uGlow.value *= 1 + 0.35 * hk;
      }
      // fog: sky dissolves into the fog colour
      if (fg > 0) {
        lum = hr.r * 0.3 + hr.g * 0.59 + hr.b * 0.11; var fl = lum * 0.95 + 0.03 * dayK;
        hr.r = lerp(hr.r, fl, 0.7 * fg); hr.g = lerp(hr.g, fl * 1.01, 0.7 * fg); hr.b = lerp(hr.b, fl * 1.04, 0.7 * fg);
        z.r = lerp(z.r, hr.r, 0.9 * fg); z.g = lerp(z.g, hr.g, 0.9 * fg); z.b = lerp(z.b, hr.b, 0.9 * fg);
        sc.r = lerp(sc.r, hr.r, fg); sc.g = lerp(sc.g, hr.g, fg); sc.b = lerp(sc.b, hr.b, fg);
        u.uGlow.value *= 1 - 0.6 * fg; u.uStars.value *= 1 - 0.95 * fg;
      }
      // lightning flash
      if (f > 0.001) { _wc.setRGB(0.82, 0.86, 1.0); z.lerp(_wc, f * 0.55); hr.lerp(_wc, f * 0.75); }
      // scene fog
      near *= 1 - 0.55 * rn; far *= 1 - 0.5 * rn;
      if (ht > 0) { near = lerp(near, 80, ht * 0.7); far = lerp(far, 300, ht * 0.7); }
      if (fg > 0) { near = lerp(near, svk > 0 ? 4 : 12, fg); far = lerp(far, svk > 0 ? 70 : 105, fg); }
      scene.fog.near = near; scene.fog.far = far;
      scene.fog.color.copy(hr).multiplyScalar(0.96);
      if (ht > 0) { _wc.setRGB(0.95, 0.82, 0.58); scene.fog.color.lerp(_wc, 0.18 * ht * dayK); }
      // lights
      sunL.intensity *= (1 - 0.72 * cl) * (1 - 0.25 * st) * (1 + 0.16 * ht) * (1 - 0.9 * fg);
      moonL.intensity *= 1 - 0.55 * cl;
      hemi.intensity *= 1 - 0.1 * cl + 0.08 * ht + 0.06 * fg;
      if (cl > 0) { _wc.setRGB(0.66, 0.72, 0.82); hemi.color.lerp(_wc, 0.55 * cl * dayK); }
      if (ht > 0) { _wc.setRGB(1.0, 0.92, 0.74); hemi.color.lerp(_wc, 0.55 * ht * dayK); sunL.color.lerp(_wc.setRGB(1.0, 0.8, 0.5), 0.55 * ht * dayK); }
      if (f > 0.001) { hemi.intensity += f * 1.5; _wc.setRGB(0.85, 0.9, 1); hemi.color.lerp(_wc, f * 0.8); sunL.intensity += f * 0.5; }
      MAT.shadow.opacity *= 1 - 0.65 * cl;
      var wet = 1 - 0.2 * clamp(rn * 1.2, 0, 1);
      tintMat(MAT.terrain, wet); tintMat(MAT.outer, wet); tintMat(MAT.path, 1 - 0.16 * clamp(rn * 1.2, 0, 1));
      if (MAT.water) {
        var w = MAT.water.uniforms;
        w.uSky.value.copy(hr); w.uLight.value *= 1 - 0.3 * cl; w.uSunI.value *= 1 - 0.85 * Math.max(cl, fg);
      }
      setCloudTint(cl);
      // rain tint follows the (modified) fog colour
      if (rainU) { _wc.copy(scene.fog.color); _wc.r = lerp(_wc.r, 0.92, 0.45); _wc.g = lerp(_wc.g, 0.95, 0.45); _wc.b = lerp(_wc.b, 1.0, 0.45); rainU.uCol.value.copy(_wc).multiplyScalar(0.55 + 0.55 * dayK + f); }
    }
    function tintMat(m, v) { if (m && m.color && m.color.setScalar) m.color.setScalar(v); }
    function setCloudTint(cl) {
      for (var k = 0; k < clouds.length; k++) {
        var m = clouds[k], mt = m.material, v = 1 - 0.52 * cl;
        mt.color.setScalar(v); mt.emissive.setRGB(0.18 * (1 - 0.7 * cl), 0.18 * (1 - 0.7 * cl), 0.2 * (1 - 0.7 * cl));
        if (m.userData.s0 === undefined) m.userData.s0 = m.scale.x;
        m.scale.set(m.userData.s0 * (1 + 0.45 * cl), m.userData.s0 * (1 + 0.15 * cl), m.userData.s0 * (1 + 0.45 * cl));
      }
    }
    function buildRain() {
      var n = RAIN_MAX, pos = new Float32Array(n * 12), seed = new Float32Array(n * 16), cor = new Float32Array(n * 8), idx = new Uint32Array(n * 6), r = rng32Local(4242), i, q;
      for (i = 0; i < n; i++) {
        var a = r(), b = r(), c = r(), d = r();
        for (q = 0; q < 4; q++) { seed[(i * 4 + q) * 4] = a; seed[(i * 4 + q) * 4 + 1] = b; seed[(i * 4 + q) * 4 + 2] = c; seed[(i * 4 + q) * 4 + 3] = d; cor[(i * 4 + q) * 2] = q >> 1; cor[(i * 4 + q) * 2 + 1] = (q & 1) ? 1 : -1; }
        idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); geo.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      rainU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(32, 18, 32) }, uLen: { value: 1.2 }, uSpeed: { value: 22 }, uWind: { value: 0.2 }, uPx: { value: 0.002 }, uAsp: { value: 1.6 }, uCol: { value: new THREE.Color(0.8, 0.85, 0.95) }, uAlpha: { value: 0.5 } };
      var mat = new THREE.ShaderMaterial({
        uniforms: rainU, transparent: true, depthWrite: false, fog: false,
        vertexShader: [
          'uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform float uLen; uniform float uSpeed; uniform float uWind; uniform float uPx; uniform float uAsp; uniform float uAlpha;',
          'attribute vec4 aSeed; attribute vec2 aCorner; varying float vA;',
          'void main(){',
          ' vec3 p; p.x = uCenter.x + (fract(aSeed.x - uCenter.x/uBox.x) - 0.5)*uBox.x; p.z = uCenter.z + (fract(aSeed.z - uCenter.z/uBox.z) - 0.5)*uBox.z;',
          ' float fy = fract(aSeed.y - uTime*uSpeed*(0.85+0.3*aSeed.w)/uBox.y); p.y = uCenter.y + fy*uBox.y;',
          ' vec3 dir = normalize(vec3(uWind, -1.0, uWind*0.35)); float len = uLen*(0.7+0.6*aSeed.w);',
          ' vec3 pb = p + dir*len;',
          ' vec4 cT = projectionMatrix*viewMatrix*vec4(p,1.0); vec4 cB = projectionMatrix*viewMatrix*vec4(pb,1.0);',
          ' if(cT.w < 0.08 || cB.w < 0.08){ gl_Position = vec4(2.0,2.0,2.0,1.0); vA = 0.0; return; }',
          ' vec2 sd = cT.xy/cT.w - cB.xy/cB.w; sd.x *= uAsp; float l = length(sd); sd = l > 1e-5 ? sd/l : vec2(0.0,1.0);',
          ' vec2 nr = vec2(-sd.y, sd.x); nr.x /= uAsp;',
          ' vec4 c = aCorner.x < 0.5 ? cT : cB; c.xy += nr*aCorner.y*uPx*c.w;',
          ' gl_Position = c;',
          ' float hd = length(p.xz - uCenter.xz)/(uBox.x*0.5);',
          ' vA = uAlpha*(aCorner.x < 0.5 ? 0.15 : 1.0)*(1.0-smoothstep(0.55,1.0,hd))*smoothstep(0.0,0.08,fy)*(1.0-smoothstep(0.92,1.0,fy))*(0.6+0.4*aSeed.w);',
          '}'
        ].join('\n'),
        fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA);\n#include <encodings_fragment>\n}'
      });
      rainMesh = new THREE.Mesh(geo, mat); rainMesh.frustumCulled = false; rainMesh.renderOrder = 5; rainMesh.visible = false;
      scene.add(rainMesh);
    }
    // called every frame from the camera/frame code once the camera is placed
    function updateRain(dt) {
      if (!rainMesh) return;
      var rn = WXV.cur.rain;
      if (rn < 0.01) { rainMesh.visible = false; return; }
      var sv = typeof SV !== 'undefined' ? clamp(SV.blend, 0, 1) : 0, st = WXV.cur.storm;
      var span = lerp(clamp(view.dist * 1.15, 44, 150), 23, sv), hgt = lerp(clamp(view.dist * 0.5, 18, 44), 15, sv);
      var qual = clamp((G.prCap || 2) / 1.5, 0.45, 1);
      var n = Math.floor(RAIN_MAX * clamp(0.14 + 0.86 * rn, 0, 1) * qual);
      rainMesh.visible = n > 0; rainMesh.geometry.setDrawRange(0, n * 6);
      var u = rainU;
      u.uTime.value = G.t;
      var cx = lerp(view.x, camera.position.x, sv), cz = lerp(view.z, camera.position.z, sv), base = lerp(0, camera.position.y - 2.7, sv);
      u.uCenter.value.set(cx, base, cz); u.uBox.value.set(span, hgt, span);
      u.uLen.value = lerp(clamp(view.dist * 0.05, 1.8, 6), 1.1 + 0.5 * st, sv);
      u.uSpeed.value = 21 + 12 * st; u.uWind.value = 0.12 + 0.3 * st;
      u.uPx.value = 1.3 / Math.max(300, G.h || 600) * (sv > 0.5 ? 1 : 1.4); u.uAsp.value = (G.w || 1) / (G.h || 1);
      u.uAlpha.value = (0.28 + 0.3 * rn) * (1 + 0.5 * sv);
    }


    function makeSky() {
      skyMat = createSkyMaterial(THREE);
      skyMesh = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), skyMat);
      skyMesh.renderOrder = -100; skyMesh.frustumCulled = false;
      scene.add(skyMesh);
    }

    function buildLighting() {
      sunDir = new THREE.Vector3(0, 1, 0); moonDir = new THREE.Vector3(0, -1, 0);
      sunL = new THREE.DirectionalLight(0xffffff, 1); sunL.castShadow = !!G.shadows;
      if (sunL.shadow) {
        sunL.shadow.mapSize.width = 2048; sunL.shadow.mapSize.height = 2048;
        sunL.shadow.camera.near = 10; sunL.shadow.camera.far = 260;
        var sd = 75;
        sunL.shadow.camera.left = -sd; sunL.shadow.camera.right = sd; sunL.shadow.camera.top = sd; sunL.shadow.camera.bottom = -sd;
        sunL.shadow.bias = -0.0008;
      }
      scene.add(sunL); scene.add(sunL.target);
      moonL = new THREE.DirectionalLight(0x8fa8ff, 0); scene.add(moonL);
      hemi = new THREE.HemisphereLight(0xaaccff, 0x556644, 0.7); scene.add(hemi);
    }
    function context(nextView, width, streetView, nextCamera) { view = nextView; W = width; SV = streetView; camera = nextCamera; }
    function centerSky(cam) { if (skyMesh && cam) skyMesh.position.copy(cam.position); }
    function frameUpdate() { if (skyMat) skyMat.uniforms.uTime.value = G.t; if (MAT.water) MAT.water.uniforms.uTime.value = G.t; }
    function setLockdown(on, t) { if (on && hemi) { var lp = 0.5 + 0.5 * Math.sin(t * 5); hemi.color.setRGB(1, 0.35 + 0.25 * (1 - lp), 0.3 + 0.2 * (1 - lp)); hemi.intensity = 0.95; scene.fog.color.lerp(new THREE.Color(0.55, 0.15, 0.12), 0.25); } }
    function restoreLockdown() { if (hemi) hemi.color.setRGB(0.8, 0.9, 1); updateAtmosphere(); }
    function setShadows(on) { if (sunL) sunL.castShadow = !!on && (G.sunE > -0.02); }
    function weatherInfo() { return { type: WXV.type, cur: WXV.cur, flash: WXV.flash }; }
    return { buildLighting: buildLighting, buildSky: makeSky, buildRain: buildRain, updateSunTarget: updateSunTarget,
      updateWeather: updateWeather, updateAtmosphere: updateAtmosphere, updateRain: updateRain, context: context,
      centerSky: centerSky, frameUpdate: frameUpdate, setLockdown: setLockdown, restoreLockdown: restoreLockdown,
      setShadows: setShadows, weatherInfo: weatherInfo, weatherDirty: function () { return WXV.dirty; },
    };
  }

  return { canvasRect: canvasRect, projectPoint: projectPoint, createSkyMaterial: createSkyMaterial, weatherTarget: weatherTarget,
    createAtmosphere: createAtmosphere, cameraPanDelta: cameraPanDelta, cameraRotate: cameraRotate, cameraZoom: cameraZoom,
    emptyWeatherInfo: emptyWeatherInfo, canvasTexture: canvasTexture, createWorldTextures: createWorldTextures };
}());
