// ===== 06-audio-effects.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Common synthesised UI and park effects shared by Dino and Zoo audio engines. */
(function () {
  'use strict';
  Z.createAudioCore = function () {
    var A = {}, ctx = null, master = null, on = true, noiseBuf = null, ambNoise = null, ambGain = null, lastT = {};
    function ensure() {
      if (ctx) return ctx;
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
        var n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noiseBuf = buf;
      } catch (e) { ctx = null; }
      return ctx;
    }
    function ready() { return on && ctx && ctx.state === 'running'; }
    function startAmbience() {
      try {
        ambNoise = ctx.createBufferSource(); ambNoise.buffer = noiseBuf; ambNoise.loop = true;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; ambGain = ctx.createGain(); ambGain.gain.value = 0.0;
        ambNoise.connect(lp); lp.connect(ambGain); ambGain.connect(master); ambNoise.start();
      } catch (e) { }
    }
    function limit(k, ms) { var n = performance.now(); if (lastT[k] && n - lastT[k] < ms) return false; lastT[k] = n; return true; }
    function tone(f, dur, type, vol, when, f2, dest) {
      var t0 = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || master); o.start(t0); o.stop(t0 + dur + 0.05); return { o: o, g: g };
    }
    function noise(dur, vol, freq, type, when, q) {
      var t0 = ctx.currentTime + (when || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.value = freq || 800; if (q) f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
    }
    A.enabled = function () { return on; };
    A.setEnabled = function (v) { on = !!v; if (ctx) { try { if (on) ctx.resume(); else if (ambGain) ambGain.gain.value = 0; } catch (e) { } } };
    A.unlock = function () {
      if (!on) return; if (!ensure()) return;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
      if (!ambNoise && ctx.state !== 'closed') startAmbience();
    };
    return { A: A, ready: ready, limit: limit, tone: tone, noise: noise, context: function () { return ctx; }, master: function () { return master; }, ambientGain: function () { return ambGain; } };
  };

  Z.sharedAudioEffects = function (engine) {
    var ready = engine.ready, limit = engine.limit, tone = engine.tone, noise = engine.noise;
    return {
      click: function () { if (!ready() || !limit('click', 40)) return; tone(760, 0.05, 'triangle', 0.07, 0, 520); },
      cash: function () { if (!ready() || !limit('cash', 350)) return; tone(1318, 0.14, 'sine', 0.07, 0); tone(1760, 0.22, 'triangle', 0.06, 0.09); tone(2637, 0.3, 'sine', 0.02, 0.09); },
      build: function () { if (!ready() || !limit('build', 90)) return; tone(150, 0.16, 'sine', 0.22, 0, 55); noise(0.09, 0.12, 500, 'lowpass', 0); },
      bad: function () { if (!ready() || !limit('bad', 200)) return; tone(190, 0.16, 'square', 0.045, 0, 120); },
      good: function () { if (!ready() || !limit('good', 250)) return; tone(660, 0.12, 'triangle', 0.06, 0); tone(880, 0.2, 'triangle', 0.06, 0.09); },
      fanfare: function () { if (!ready() || !limit('fan', 800)) return; [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.07, i * 0.11); tone(f * 2, 0.2, 'sine', 0.02, i * 0.11); }); tone(1047, 0.7, 'triangle', 0.06, 0.5); },
      alarm: function () { if (!ready() || !limit('alarm', 1200)) return; for (var i = 0; i < 3; i++) { tone(880, 0.13, 'square', 0.035, i * 0.3); tone(660, 0.13, 'square', 0.035, i * 0.3 + 0.15); } }
    };
  };
})();
