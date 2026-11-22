// ===== 54-audio.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - synthesised sound: UI clicks, cash, build thuds, ambience, dinosaur calls. No audio files. */
(function () {
  'use strict';
  var core = Z.createAudioCore(), A = Z.Audio = core.A, ctx = null, master = null, ambGain = null, birdT = 2, cricT = 1;
  var ready = core.ready, limit = core.limit, tone = core.tone, noise = core.noise;
  var coreUnlock = A.unlock;
  A.unlock = function () { coreUnlock(); ctx = core.context(); master = core.master(); ambGain = core.ambientGain(); };
  var sharedEffects = Z.sharedAudioEffects({ ready: ready, limit: limit, tone: tone, noise: noise });
  Object.keys(sharedEffects).forEach(function (k) { A[k] = sharedEffects[k]; });

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
  function roar(f, long) { var d = long ? 1.3 : 0.95, t = tone(f, d, 'sawtooth', 0.13, 0, f * 0.55), t2 = tone(f * 1.5, d * 0.8, 'square', 0.04, 0.02, f * 0.8), lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 17; lg.gain.value = f * 0.22; lfo.connect(lg); lg.connect(t.o.frequency); lfo.start(); lfo.stop(ctx.currentTime + d + 0.1); noise(d * 0.8, 0.07, 260, 'lowpass', 0.05); tone(f * 0.5, d, 'sine', 0.12, 0.05, f * 0.3); }
  function rumble(f) { tone(f, 1.0, 'sine', 0.14, 0, f * 0.75); tone(f * 2, 0.8, 'triangle', 0.04, 0.05, f * 1.4); noise(0.7, 0.04, 200, 'lowpass', 0.1); }
  function hadro(f) { for (var i = 0; i < 2; i++) { tone(f, 0.45, 'sawtooth', 0.06, i * 0.5, f * 1.25); tone(f * 2, 0.4, 'square', 0.02, i * 0.5, f * 2.4); } }
  var CALLS = { tyrannosaurus: function () { roar(62, true); }, spinosaurus: function () { roar(70, true); }, carnotaurus: function () { roar(82, false); }, baryonyx: function () { roar(95, false); }, therizinosaurus: function () { growl(110); },
    cryolophosaurus: function () { roar(130, false); }, velociraptor: function () { chirp(1500); hiss(); }, dilophosaurus: function () { hiss(); chirp(2200); }, compsognathus: function () { chirp(3300); }, dryosaurus: function () { chirp(2600); },
    leaellynasaura: function () { chirp(3000); }, protoceratops: function () { chirp(1900); }, gallimimus: function () { honk(420); }, pachycephalosaurus: function () { grunt(170); },
    parasaurolophus: function () { hadro(210); }, stegosaurus: function () { grunt(100); }, triceratops: function () { grunt(85); snort(); }, ankylosaurus: function () { grunt(75); },
    diplodocus: function () { rumble(58); }, brachiosaurus: function () { rumble(48); } };
  if (Z.creatureCalls) Z.creatureCalls(CALLS, { tone: tone, noise: noise, chirp: chirp, grunt: grunt, hiss: hiss, snort: snort, rumble: rumble, honk: honk, roar: roar });   // 31-models-extra.js
  A.call = function (sp) { if (!ready() || !limit('call', 900)) return; try { (CALLS[sp] || function () { chirp(1800); })(); } catch (e) { } };

  // ambience (called every frame from main with dt)
  A.update = function (dt) {
    if (!ready() || !Z.state) return;
    var S = Z.state, t = S.time, day = t > 0.27 && t < 0.78;
    if (ambGain) { var target = 0.016 + Math.min(0.03, S.guests.length * 0.00045); ambGain.gain.value += (target - ambGain.gain.value) * Math.min(1, dt * 0.5); }
    if (S.speed === 0) return;
    if (day) {
      birdT -= dt; if (birdT <= 0) { birdT = 1.6 + Math.random() * 4.5; var b = 2600 + Math.random() * 1800, n = 2 + (Math.random() * 3 | 0); for (var i = 0; i < n; i++) tone(b * (1 + (i % 2) * 0.18), 0.07, 'sine', 0.018, i * 0.1, b * (1.2 + Math.random() * 0.3)); }
    } else {
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


