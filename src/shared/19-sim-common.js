// Shared, DOM-free simulation algorithms whose state dependencies stay game-owned.
window.Z = window.Z || {};
Z.SimCommon = (function () {
'use strict';
function createAnimalMovement(deps) {
function steerAnimal(a) {
    var tileOf = deps.tileOf, DT4 = deps.getDT4(), rng = deps.rng, tilePt = deps.tilePt;
    var RT = deps.getRT(), cxOf = deps.cxOf, czOf = deps.czOf, canStepTile = deps.canStepTile;
    var t0 = tileOf(a.x, a.z), d, nt, pt;
    if (a.tg === 'wander' || (a.state === 'escaped' && !a.lg)) {
      var cur = t0, prev = a.prevT >= 0 ? a.prevT : -1, wroute = [];
      for (var s = 0; s < 3; s++) {
        var cands = [], fall = [];
        for (d = 0; d < 4; d++) {
          if (!canStepTile(a, cur, d)) continue;
          nt = cur + DT4[d];
          if (nt !== prev) cands.push(nt); else fall.push(nt);
        }
        var pool = cands.length ? cands : fall;
        if (!pool.length) break;
        var nxt = pool[Math.floor(rng.next() * pool.length)];
        wroute.push(nxt);
        prev = cur; cur = nxt;
      }
      if (!wroute.length) return false;
      a.prevT = t0;
      var lastW = wroute[wroute.length - 1];
      pt = tilePt(a, lastW, 0.4); a.tx = pt.x; a.tz = pt.z;
      var firstW = wroute[0];
      pt = tilePt(a, firstW, 0.35); a.wx = pt.x; a.wz = pt.z;
      a.aroute = wroute.length > 1 ? wroute.slice(1) : null;
      return true;
    }
    var goalT = tileOf(a.tx, a.tz);
    var st = ++RT.stampN, stamp = RT.stamp, q = RT.queue, prevArr = RT.prev, h = 0, tl = 0;
    q[tl++] = t0; stamp[t0] = st; prevArr[t0] = -1;
    var bestT = -1, bestD = 1e9;
    while (h < tl && tl < 160) {
      var t = q[h++];
      if (t === goalT) { bestT = t; break; }
      if (t !== t0) {
        var bdx = cxOf(t) - a.tx, bdz = czOf(t) - a.tz, bdd = bdx * bdx + bdz * bdz;
        if (t === a.prevT) bdd += 64;
        if (bdd < bestD) { bestD = bdd; bestT = t; }
      }
      for (d = 0; d < 4; d++) {
        if (!canStepTile(a, t, d)) continue;
        nt = t + DT4[d];
        if (stamp[nt] === st) continue;
        stamp[nt] = st; prevArr[nt] = t; q[tl++] = nt;
      }
    }
    if (bestT < 0 || bestT === t0) return false;
    var route = [], c = bestT;
    while (c !== t0 && prevArr[c] >= 0) { route.push(c); c = prevArr[c]; }
    if (!route.length) return false;
    route.reverse();
    a.prevT = t0;
    var first = route[0];
    pt = tilePt(a, first, 0.35); a.wx = pt.x; a.wz = pt.z;
    var chasing = a.tg === 'hunt' || (a.state === 'escaped' && a.lg);
    a.aroute = (!chasing && route.length > 1) ? route.slice(1) : null;
    if (!chasing && bestT !== goalT) {
      var last = route[route.length - 1];
      pt = tilePt(a, last, 0.4); a.tx = pt.x; a.tz = pt.z;
    }
    return true;
  }
function animalMove(a, dt, spd) {
    var tileOf = deps.tileOf, tilePt = deps.tilePt, canGo = deps.canGo, RT = deps.getRT();
    var pushFromWalls = deps.pushFromWalls, animalMetrics = deps.animalMetrics, SP = deps.getSP(), turn = deps.turn;
    var ct = tileOf(a.x, a.z);
    if (a.curT !== ct) { a.prevT = a.curT !== undefined ? a.curT : ct; a.curT = ct; }
    var gx = a.wx ? a.wx : a.tx, gz = a.wz ? a.wz : a.tz;
    var dx = gx - a.x, dz = gz - a.z, d = Math.sqrt(dx * dx + dz * dz);
    if (!isFinite(d) || d < 0.3) {
      if (!isFinite(d)) { a.wx = 0; a.wz = 0; a.aroute = null; a.tx = a.x; a.tz = a.z; a.speed = 0; a.detours = 0; return true; }
      if (a.wx) {
        if (a.aroute && a.aroute.length) {
          var nt = a.aroute.shift();
          var wpt = tilePt(a, nt, 0.35);
          a.wx = wpt.x; a.wz = wpt.z;
        } else { a.wx = 0; a.wz = 0; }
        gx = a.wx ? a.wx : a.tx; gz = a.wz ? a.wz : a.tz;
        dx = gx - a.x; dz = gz - a.z; d = Math.sqrt(dx * dx + dz * dz);
        if (!isFinite(d) || d < 0.3) { a.speed = 0; a.detours = 0; return true; }
      } else { a.speed = 0; a.detours = 0; return true; }
    }
    // separateAnimals runs after this move and can undo it every frame, so judge progress over a window of frames
    if (a.progX !== gx || a.progZ !== gz) { a.progX = gx; a.progZ = gz; a.progD = d; a.progT = 0; }
    a.progT += dt;
    if (a.progT > 2.5) {
      if (a.progD - d < spd * a.progT * 0.2) { a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0; a.speed = 0; a.progX = undefined; return true; }
      a.progD = d; a.progT = 0;
    }
    var step = Math.min(spd * dt, d), ox = a.x, oz = a.z;
    var vx = dx / d * step, vz = dz / d * step;
    var okX = Math.abs(dx) > 1e-4 && canGo(a, ox, oz, ox + vx, oz);
    var nx = okX ? ox + vx : ox;
    var okZ = Math.abs(dz) > 1e-4 && canGo(a, nx, oz, nx, oz + vz);
    if (okX && okZ) {
      a.x = nx; a.z = oz + vz;
    } else if (okX && Math.abs(dx) > 0.25) {
      var sx = ox + (dx > 0 ? 1 : -1) * Math.min(step, Math.abs(dx));
      if (canGo(a, ox, oz, sx, oz)) a.x = sx; else a.x = nx;
    } else if (okZ && Math.abs(dz) > 0.25) {
      var sz = oz + (dz > 0 ? 1 : -1) * Math.min(step, Math.abs(dz));
      if (canGo(a, ox, oz, ox, sz)) a.z = sz; else a.z = oz + vz;
    }
    if (a.enc) { var _enc = RT.eMap[a.enc]; if (_enc) pushFromWalls(a, _enc, animalMetrics(SP[a.species], a), dt); }
    var mx = a.x - ox, mz = a.z - oz, md = Math.sqrt(mx * mx + mz * mz);
    var prog = d > 1e-5 ? (mx * dx + mz * dz) / d : md;
    if (prog < step * 0.35 && step > 1e-4) {
      a.stuck += dt;
      if (a.stuck > 0.08) {
        a.stuck = 0;
        a.detours = (a.detours || 0) + 1;
        if (a.detours <= 8 && steerAnimal(a)) {
          a.speed = spd;
          a.heading = turn(a.heading, Math.atan2((a.wx || a.tx) - a.x, (a.wz || a.tz) - a.z), dt * 8);
          return false;
        }
        a.wx = 0; a.wz = 0; a.aroute = null; a.detours = 0; a.speed = 0;
        return true;
      }
      a.speed = 0;
      return false;
    }
    a.stuck = 0; a.speed = spd;
    if (md > 1e-4) a.heading = turn(a.heading, Math.atan2(mx, mz), dt * 6);
    return false;
  }
  var movement = { animalMove: animalMove };
  return movement;
}
function wxScale(v, i, add) { return add ? v * i : 1 + (v - 1) * i; }
function wxHoursTxt(h) { return h >= 1.5 ? 'about ' + Math.round(h) + ' hours' : 'about an hour'; }
function forecastText(hoursLeft, currentName, nextName, nextNotable) {
  return hoursLeft < 0.5 ? nextName + ' arriving now.' : (nextNotable ? nextName + ' expected in ' + wxHoursTxt(hoursLeft) + '.' : currentName + ' for ' + wxHoursTxt(hoursLeft) + ', then ' + nextName.toLowerCase() + '.');
}
function applyWeatherBase(wx, type, intensity, t) {
  wx.type = type; wx.intensity = intensity;
  wx.arrivals = wxScale(t.arrivals, intensity); wx.thirst = wxScale(t.thirst, intensity); wx.hunger = wxScale(t.hunger, intensity); wx.energy = wxScale(t.energy, intensity); wx.guestSpeed = wxScale(t.guestSpeed, intensity);
  wx.fun = wxScale(t.fun, intensity, true); wx.spend = wxScale(t.spend, intensity); wx.shelter = !!t.shelter && intensity >= 0.4; wx.animalMood = wxScale(t.animalMood, intensity, true);
  wx.sick = wxScale(t.sick, intensity); wx.escape = wxScale(t.escape, intensity); wx.dirt = wxScale(t.dirt, intensity);
}
function transitionWeather(w, type, intensity, hours, pickNext) {
  var old = w.type;
  if (old === type) {
    w.hoursLeft = Math.max(w.hoursLeft, hours);
    w.intensity = Math.max(w.intensity, intensity);
    return { changed: false, old: old };
  }
  w.type = type; w.intensity = intensity; w.hoursLeft = hours; w.next = pickNext();
  if (w.next === type) w.next = 'cloudy';
  return { changed: true, old: old };
}
return { createAnimalMovement: createAnimalMovement, wxScale: wxScale, wxHoursTxt: wxHoursTxt, forecastText: forecastText, transitionWeather: transitionWeather, applyWeatherBase: applyWeatherBase };
})();
