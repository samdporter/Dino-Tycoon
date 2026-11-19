// ===== 54-audio.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - synthesised sound: UI clicks, cash, build thuds, ambience, species calls. No audio files. */
(function () {
  'use strict';
  var A = Z.Audio = {}, ctx = null, master = null, on = true, noiseBuf = null, ambNoise = null, ambGain = null, lastT = {}, birdT = 2, cricT = 1;
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
  A.enabled = function () { return on; };
  A.setEnabled = function (v) { on = !!v; if (ctx) { try { if (on) ctx.resume(); else if (ambGain) ambGain.gain.value = 0; } catch (e) { } } };
  A.unlock = function () {
    if (!on) return; if (!ensure()) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
    if (!ambNoise && ctx.state !== 'closed') startAmbience();
  };
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
  A.click = function () { if (!ready() || !limit('click', 40)) return; tone(760, 0.05, 'triangle', 0.07, 0, 520); };
  A.cash = function () { if (!ready() || !limit('cash', 350)) return; tone(1318, 0.14, 'sine', 0.07, 0); tone(1760, 0.22, 'triangle', 0.06, 0.09); tone(2637, 0.3, 'sine', 0.02, 0.09); };
  A.build = function () { if (!ready() || !limit('build', 90)) return; tone(150, 0.16, 'sine', 0.22, 0, 55); noise(0.09, 0.12, 500, 'lowpass', 0); };
  A.bad = function () { if (!ready() || !limit('bad', 200)) return; tone(190, 0.16, 'square', 0.045, 0, 120); };
  A.good = function () { if (!ready() || !limit('good', 250)) return; tone(660, 0.12, 'triangle', 0.06, 0); tone(880, 0.2, 'triangle', 0.06, 0.09); };
  A.fanfare = function () { if (!ready() || !limit('fan', 800)) return; [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.07, i * 0.11); tone(f * 2, 0.2, 'sine', 0.02, i * 0.11); }); tone(1047, 0.7, 'triangle', 0.06, 0.5); };
  A.alarm = function () { if (!ready() || !limit('alarm', 1200)) return; for (var i = 0; i < 3; i++) { tone(880, 0.13, 'square', 0.035, i * 0.3); tone(660, 0.13, 'square', 0.035, i * 0.3 + 0.15); } };
  A.thunder = function () {
    if (!ready() || !limit('thunder', 1200)) return;
    noise(0.4, 0.28, 420, 'lowpass', 0, 2);
    tone(110, 0.6, 'sawtooth', 0.14, 0, 30);
    noise(1.8, 0.24, 180, 'lowpass', 0.08);
    tone(75, 1.4, 'sine', 0.22, 0.05, 38);
    noise(2.4, 0.18, 140, 'lowpass', 0.25);
    tone(55, 2.0, 'sine', 0.2, 0.3, 30);
    noise(2.8, 0.12, 100, 'lowpass', 0.6);
  };
  A.play = function (name, a, b) {
    if (!ready()) return;
    if (name === 'thunder') A.thunder();
    else if (typeof A[name] === 'function') A[name](a, b);
  };

  // species calls
  function growl(f) { var t = tone(f, 0.75, 'sawtooth', 0.1, 0, f * 0.7), lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 22; lg.gain.value = f * 0.25; lfo.connect(lg); lg.connect(t.o.frequency); lfo.start(); lfo.stop(ctx.currentTime + 0.9); noise(0.5, 0.05, 300, 'lowpass', 0.05); }
  function howl() { var t = tone(330, 1.4, 'sine', 0.09, 0, 330); t.o.frequency.cancelScheduledValues(ctx.currentTime); var tt = ctx.currentTime; t.o.frequency.setValueAtTime(300, tt); t.o.frequency.linearRampToValueAtTime(520, tt + 0.5); t.o.frequency.linearRampToValueAtTime(400, tt + 1.3); var v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 6; vg.gain.value = 8; v.connect(vg); vg.connect(t.o.frequency); v.start(); v.stop(tt + 1.5); }
  function trumpet() { var tt = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.5; o.frequency.setValueAtTime(280, tt); o.frequency.linearRampToValueAtTime(680, tt + 0.25); o.frequency.linearRampToValueAtTime(520, tt + 0.9); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.14, tt + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.0); o.connect(f); f.connect(g); g.connect(master); o.start(tt); o.stop(tt + 1.1); }
  function chirp(b) { for (var i = 0; i < 3; i++) tone(b * (1 + i * 0.12), 0.07, 'sine', 0.06, i * 0.11, b * 1.35); }
  function honk(f) { for (var i = 0; i < 2; i++) { var t = tone(f, 0.22, 'square', 0.04, i * 0.3, f * 0.85); } noise(0.2, 0.02, 1200, 'bandpass', 0, 2); }
  function whinny() { var tt = ctx.currentTime, t = tone(720, 0.8, 'sawtooth', 0.06, 0, 380), v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 19; vg.gain.value = 45; v.connect(vg); vg.connect(t.o.frequency); v.start(); v.stop(tt + 0.9); }
  function grunt(f) { for (var i = 0; i < 2; i++) { tone(f, 0.28, 'sawtooth', 0.08, i * 0.34, f * 0.7); noise(0.2, 0.04, 380, 'lowpass', i * 0.34); } }
  function hoot() { for (var i = 0; i < 3; i++) tone(400 - i * 30, 0.26, 'sine', 0.08, i * 0.32, 300); }
  function hiss() { noise(0.9, 0.07, 4500, 'bandpass', 0, 1.2); tone(90, 0.5, 'sawtooth', 0.04, 0.1); }
  function snort() { for (var i = 0; i < 2; i++) noise(0.22, 0.09, 900, 'lowpass', i * 0.3); }
  function boom() { tone(95, 0.45, 'sine', 0.16, 0, 60); tone(190, 0.3, 'sine', 0.05, 0.02, 120); }
  var CALLS = { lion: function () { growl(110); }, tiger: function () { growl(90); }, brown_bear: function () { growl(75); }, polar_bear: function () { growl(70); }, wolf: howl, crocodile: hiss, elephant: trumpet,
    flamingo: function () { honk(520); }, meerkat: function () { chirp(2400); }, penguin: function () { honk(300); }, ostrich: boom, red_panda: function () { chirp(3100); }, zebra: whinny, giraffe: function () { tone(120, 0.7, 'sine', 0.08, 0, 100); },
    hippo: function () { grunt(95); honk(130); }, rhino: snort, camel: function () { grunt(150); }, kangaroo: function () { for (var i = 0; i < 2; i++) { tone(150, 0.1, 'sine', 0.14, i * 0.18, 70); } }, gorilla: hoot, panda: function () { tone(520, 0.4, 'triangle', 0.06, 0, 420); tone(480, 0.3, 'triangle', 0.05, 0.4, 380); },
    jaguar: function () { growl(100); }, cheetah: function () { chirp(1600); }, anaconda: hiss, hyena: function () { for (var i = 0; i < 3; i++) tone(420 + i * 110, 0.14, 'triangle', 0.08, i * 0.16, 680 + i * 120); },
    monkey: function () { for (var i = 0; i < 4; i++) tone(900 + (i % 2) * 350, 0.08, 'sine', 0.07, i * 0.1, 1300); }, chimpanzee: function () { hoot(); for (var i = 0; i < 2; i++) tone(520 + i * 140, 0.15, 'sawtooth', 0.05, 0.7 + i * 0.18, 700); },
    lemur: function () { for (var i = 0; i < 2; i++) tone(680, 0.14, 'triangle', 0.07, i * 0.22, 460); }, orangutan: function () { grunt(110); tone(210, 0.5, 'sine', 0.08, 0.25, 130); },
    komodo_dragon: function () { noise(0.8, 0.08, 2200, 'bandpass', 0, 1.4); tone(75, 0.45, 'sawtooth', 0.05, 0.05); },
    puss_in_boots: function () { tone(520, 0.28, 'triangle', 0.08, 0, 820); tone(760, 0.32, 'sine', 0.07, 0.22, 440); },
    tortoise: function () { noise(0.32, 0.05, 360, 'lowpass', 0, 1.5); tone(95, 0.25, 'sine', 0.05, 0.04, 65); },
    peacock: function () { tone(920, 0.28, 'sawtooth', 0.05, 0, 620); tone(820, 0.32, 'sawtooth', 0.05, 0.32, 540); },
    capybara: function () { chirp(2600); noise(0.08, 0.04, 1800, 'bandpass', 0.16, 3); },
    alpaca: function () { tone(260, 0.45, 'triangle', 0.06, 0, 290); tone(290, 0.35, 'sine', 0.04, 0.42, 240); },
    fennec_fox: function () { for (var i = 0; i < 3; i++) tone(1500 + i * 180, 0.08, 'triangle', 0.06, i * 0.12, 2200); },
    otter: function () { for (var i = 0; i < 3; i++) tone(1100 + (i % 2) * 350, 0.09, 'sine', 0.06, i * 0.11, 1650); },
    koala: function () { grunt(85); },
    arctic_fox: function () { for (var i = 0; i < 2; i++) tone(980, 0.11, 'triangle', 0.06, i * 0.18, 620); } };
  A.call = function (sp) { if (!ready() || !limit('call', 900)) return; try { (CALLS[sp] || function () { chirp(1800); })(); } catch (e) { } };

  // ambience (called every frame from main with dt)
  A.update = function (dt) {
    if (!ready() || !Z.state) return;
    var S = Z.state, t = S.time, day = t > 0.27 && t < 0.78;
    var w = S.weather, rainK = (w && (w.type === 'rain' || w.type === 'storm')) ? (typeof w.intensity === 'number' ? w.intensity : 0.6) : 0;
    if (ambGain) { var target = 0.016 + Math.min(0.03, S.guests.length * 0.00045) + (rainK > 0 ? rainK * 0.035 : 0); ambGain.gain.value += (target - ambGain.gain.value) * Math.min(1, dt * 0.5); }
    if (S.speed === 0) return;
    if (day && rainK < 0.6) {
      birdT -= dt; if (birdT <= 0) { birdT = 1.6 + Math.random() * 4.5; var b = 2600 + Math.random() * 1800, n = 2 + (Math.random() * 3 | 0); for (var i = 0; i < n; i++) tone(b * (1 + (i % 2) * 0.18), 0.07, 'sine', 0.018, i * 0.1, b * (1.2 + Math.random() * 0.3)); }
    } else if (!day && rainK < 0.6) {
      cricT -= dt; if (cricT <= 0) {
        cricT = 1.2 + Math.random() * 2.5;
        var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), tt = ctx.currentTime; o.frequency.value = 4300 + Math.random() * 400; lfo.frequency.value = 28; lg.gain.value = 0.008; g.gain.value = 0.008;
        lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(master); o.start(tt); lfo.start(tt); g.gain.setValueAtTime(0.008, tt); g.gain.linearRampToValueAtTime(0, tt + 0.9); o.stop(tt + 0.95); lfo.stop(tt + 0.95);
      }
    }
  };
  // cash register for positive income, soft and rare
  var cashAcc = 0;
  Z.bus.on('money', function (m) { if (m && m.delta >= 25 && m.x === undefined) A.cash(); else if (m && m.delta >= 4 && m.x !== undefined) { cashAcc += m.delta; if (cashAcc > 60) { cashAcc = 0; A.cash(); } } });
  Z.bus.on('objectAdded', function () { A.build(); });
  Z.bus.on('fence', function () { A.build(); });
  Z.bus.on('path', function () { A.build(); });
  Z.bus.on('terrain', function () { A.build(); });
})();
