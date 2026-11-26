// Luxury Resort Simulation (shared across Dino Tycoon and Zoo Tycoon)
// Manages resort prestige, luxury enclosures, security auras, wealthy VIP arrivals,
// overnight lodging bookings/check-ins/wakeups, and resort revenue tracking.
(function () {
  'use strict';
  var window = typeof window !== 'undefined' ? window : globalThis;
  window.Z = window.Z || {};
  var Z = window.Z;

  var LUXURY_FENCE_IDS = { gilded_glass: 1, royal_marble: 1 };
  var LUXURY_SCENERY_IDS = { heated_oasis_pool: 1, marble_pavilion_shelter: 1, golden_enrichment: 1 };

  // Transient runtime timers (never serialized; reset in afterLoad)
  var scanTimer = 0;
  var arrivalTimer = 0;
  var bookingTimer = 0;
  var initializedScan = false;
  var localGroupSeq = -1000;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function ctx() {
    return Z.resortCtx || {};
  }

  function getS() {
    var c = ctx();
    return typeof c.S === 'function' ? c.S() : null;
  }

  function getRT() {
    var c = ctx();
    return typeof c.RT === 'function' ? c.RT() : {};
  }

  function getD() {
    var c = ctx();
    return typeof c.D === 'function' ? (c.D() || {}) : (Z.DATA || {});
  }

  function getBD() {
    var c = ctx();
    if (typeof c.BD === 'function') {
      var m = c.BD();
      if (m) return m;
    }
    var D = getD(), map = {};
    if (Array.isArray(D.buildings)) {
      for (var i = 0; i < D.buildings.length; i++) map[D.buildings[i].id] = D.buildings[i];
    }
    return map;
  }

  function getSD() {
    var c = ctx();
    if (typeof c.SD === 'function') {
      var m = c.SD();
      if (m) return m;
    }
    var D = getD(), map = {};
    if (Array.isArray(D.scenery)) {
      for (var i = 0; i < D.scenery.length; i++) map[D.scenery[i].id] = D.scenery[i];
    }
    return map;
  }

  function getFD() {
    var c = ctx();
    if (typeof c.FD === 'function') {
      var fd = c.FD();
      if (fd) return fd;
    }
    var D = getD();
    return D.fences || [];
  }

  function getTile() {
    var c = ctx();
    return (isFinite(c.TILE) && c.TILE > 0) ? c.TILE : (Z.TILE || 2);
  }

  function getOpenT() {
    var c = ctx();
    return isFinite(c.OPEN_T) ? c.OPEN_T : 8 / 24;
  }

  function getCloseT() {
    var c = ctx();
    return isFinite(c.CLOSE_T) ? c.CLOSE_T : 20 / 24;
  }

  function getDaySeconds() {
    var c = ctx();
    return (isFinite(c.DAY_SECONDS) && c.DAY_SECONDS > 0) ? c.DAY_SECONDS : 180;
  }

  function getMaxGuests() {
    var c = ctx();
    return (isFinite(c.MAX_GUESTS) && c.MAX_GUESTS > 0) ? c.MAX_GUESTS : 340;
  }

  function getN(S) {
    if (S && isFinite(S.gridN) && S.gridN > 0) return S.gridN;
    var c = ctx();
    if (typeof c.getN === 'function') return c.getN();
    return Z.N || 56;
  }

  function rand() {
    var c = ctx();
    if (typeof c.rng === 'function') return c.rng();
    if (c.rng && typeof c.rng.next === 'function') return c.rng.next();
    if (Z.rng && typeof Z.rng.next === 'function') return Z.rng.next();
    return 0.5;
  }

  function postMsg(text, kind) {
    var c = ctx();
    if (typeof c.msg === 'function') c.msg(text, kind || 'info');
  }

  function earnRevenue(amount, cat, x, z) {
    if (!(amount > 0)) return;
    var c = ctx();
    if (typeof c.earn === 'function') {
      c.earn(amount, cat || 'tickets', x, z);
      return;
    }
    var S = getS();
    if (!S) return;
    S.money = (S.money || 0) + amount;
    if (S.finance && S.finance.today) {
      var key = cat || 'tickets';
      S.finance.today[key] = (S.finance.today[key] || 0) + amount;
    }
  }

  function isConnected(o) {
    if (!o) return false;
    var BD = getBD(), def = getBuildingDef(o.type, BD);
    if (def && def.safariReserve && Z.Safari && typeof Z.Safari.campConnected === 'function') {
      if (Z.Safari.campConnected(o)) return true;
    }
    var c = ctx();
    if (typeof c.isConnected === 'function') return Boolean(c.isConnected(o));
    return o.connected !== false;
  }

  function objCenter(o) {
    if (!o) return { x: 0, z: 0 };
    var c = ctx();
    if (typeof c.objCenter === 'function') {
      var pt = c.objCenter(o);
      if (pt && isFinite(pt.x) && isFinite(pt.z)) return pt;
    }
    var TILE = getTile();
    var bd = getBD(), sd = getSD();
    var def = bd[o.type] || sd[o.type] || {};
    var rot = ((o.rot | 0) % 4 + 4) % 4;
    var w = (rot & 1) ? (def.h || 1) : (def.w || 1);
    var h = (rot & 1) ? (def.w || 1) : (def.h || 1);
    if (isFinite(o.i) && isFinite(o.j)) {
      return { x: (o.i + w * 0.5) * TILE, z: (o.j + h * 0.5) * TILE };
    }
    return { x: isFinite(o.x) ? o.x : 0, z: isFinite(o.z) ? o.z : 0 };
  }

  function objFront(o) {
    if (!o) return { x: 0, z: 0 };
    var c = ctx();
    if (typeof c.objFront === 'function') {
      var pt = c.objFront(o);
      if (pt && isFinite(pt.x) && isFinite(pt.z)) return pt;
    }
    var TILE = getTile();
    var bd = getBD(), sd = getSD();
    var def = bd[o.type] || sd[o.type] || {};
    var rot = ((o.rot | 0) % 4 + 4) % 4;
    var w = (rot & 1) ? (def.h || 1) : (def.w || 1);
    var h = (rot & 1) ? (def.w || 1) : (def.h || 1);
    if (isFinite(o.i) && isFinite(o.j)) {
      var fi = o.i + w * 0.5, fj = o.j + h * 0.5;
      if (rot === 0) fj = o.j + h + 0.5;
      else if (rot === 2) fj = o.j - 0.5;
      else if (rot === 1) fi = o.i + w + 0.5;
      else fi = o.i - 0.5;
      return { x: fi * TILE, z: fj * TILE };
    }
    return objCenter(o);
  }

  function getBuildingDef(type, BD) {
    if (!type) return null;
    var map = BD || getBD();
    return map[type] || null;
  }

  function getSceneryDef(type, SD) {
    if (!type) return null;
    var map = SD || getSD();
    return map[type] || null;
  }

  function resolveFenceDef(f, FD, D) {
    if (!f) return null;
    if (typeof f === 'string') {
      if (FD && !Array.isArray(FD) && FD[f]) return FD[f];
      var list = Array.isArray(FD) ? FD : (D && Array.isArray(D.fences) ? D.fences : null);
      if (list) {
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === f) return list[i];
      }
      return { id: f };
    }
    if (typeof f === 'number' && f > 0) {
      if (Array.isArray(FD)) return FD[f - 1] || null;
      if (D && Array.isArray(D.fences) && D.fences[f - 1]) return D.fences[f - 1];
      if (FD && FD[f]) return FD[f];
    }
    return null;
  }

  function isLuxuryFenceDef(fd) {
    if (!fd) return false;
    return Boolean(LUXURY_FENCE_IDS[fd.id] || fd.luxury || fd.resort);
  }

  function isLuxurySceneryDef(sd, type) {
    var id = (sd && sd.id) || type;
    if (LUXURY_SCENERY_IDS[id]) return true;
    return Boolean(sd && (sd.luxuryEnclosure || (sd.resort && sd.enclosure)));
  }

  function isLuxuryDecorDef(sd) {
    return Boolean(sd && (sd.resort || sd.luxuryDecor));
  }

  function staffRoleOf(st) {
    return st ? (st.type || st.role || '') : '';
  }

  function staffActive(st, S) {
    if (!st) return false;
    if (S && isFinite(st.sickUntil) && isFinite(S.day) && isFinite(S.time)) {
      if (st.sickUntil > S.day + S.time) return false;
    }
    return true;
  }

  function guestFunds(g) {
    if (!g) return 0;
    if (isFinite(g.budget)) return g.budget;
    if (isFinite(g.money)) return g.money;
    return 0;
  }

  function spendGuestFunds(g, amount) {
    if (!g || !(amount > 0)) return;
    if (isFinite(g.budget)) g.budget = Math.max(0, g.budget - amount);
    if (isFinite(g.money)) g.money = Math.max(0, g.money - amount);
    g.spent = (g.spent || 0) + amount;
  }

  function defaultResortState() {
    return {
      vipArrivals: 0,
      overnightStays: 0,
      resortRevenue: 0,
      roomRevenue: 0,
      diningRevenue: 0,
      wellnessRevenue: 0,
      viewingRevenue: 0,
      prestige: 0,
      securityScore: 0,
      luxuryEncCount: 0,
      bookingsToday: 0,
      totalBeds: 0,
      occupiedBeds: 0
    };
  }

  /** Ensure S.resort exists with all expected numeric fields for save/load compatibility. */
  function ensureState(S) {
    S = S || getS();
    if (!S) return null;
    var def = defaultResortState();
    if (!S.resort || typeof S.resort !== 'object') {
      S.resort = def;
      return S.resort;
    }
    for (var key in def) {
      if (Object.prototype.hasOwnProperty.call(def, key)) {
        if (!isFinite(S.resort[key])) S.resort[key] = def[key];
      }
    }
    return S.resort;
  }

  function findLodge(id, S, BD) {
    if (!id) return null;
    S = S || getS();
    if (!S || !Array.isArray(S.objects)) return null;
    BD = BD || getBD();
    for (var i = 0; i < S.objects.length; i++) {
      var o = S.objects[i];
      if (!o || o.id !== id) continue;
      var def = getBuildingDef(o.type, BD);
      if (def && def.resortRole === 'lodging') return o;
    }
    return null;
  }

  function collectViewingLounges(S, BD) {
    var lounges = [];
    if (!S || !Array.isArray(S.objects)) return lounges;
    for (var i = 0; i < S.objects.length; i++) {
      var o = S.objects[i];
      if (!o) continue;
      var def = getBuildingDef(o.type, BD);
      var role = def && def.resortRole;
      if ((o.type === 'vip_viewing_lounge' || role === 'viewing' || role === 'enclosure_pavilion') && !o.paused && !o.broken && isConnected(o)) {
        var ctr = objCenter(o);
        lounges.push({ o: o, x: ctr.x, z: ctr.z, isVipLounge: o.type === 'vip_viewing_lounge' || role === 'enclosure_pavilion' || role === 'viewing' });
      }
    }
    return lounges;
  }

  function computeEnclosureLuxuryWith(enc, S, BD, SD, FD, D, lounges) {
    if (!enc) return { isLuxury: false, prestige: 0 };
    var N = getN(S);
    var TILE = getTile();
    var tiles = Array.isArray(enc.tiles) ? enc.tiles : [];
    var tileSet = {};
    var k;
    for (k = 0; k < tiles.length; k++) tileSet[tiles[k]] = 1;

    var perimTotal = 0;
    var luxFenceCount = 0;
    var luxSceneryCount = 0;
    var luxSceneryTypes = {};
    var seenObj = {};

    // Perimeter luxury fences from S.fenceX / S.fenceZ
    var hasFenceArrays = S && S.fenceX && S.fenceZ;
    if (hasFenceArrays && tiles.length) {
      var tileEnc = S.tileEnc;
      for (k = 0; k < tiles.length; k++) {
        var t = tiles[k];
        var i = t % N;
        var j = (t - i) / N;
        // 0: N, 1: E, 2: S, 3: W
        for (var d = 0; d < 4; d++) {
          var ni = i + (d === 1 ? 1 : d === 3 ? -1 : 0);
          var nj = j + (d === 2 ? 1 : d === 0 ? -1 : 0);
          var nt = (ni < 0 || nj < 0 || ni >= N || nj >= N) ? -1 : ni + nj * N;
          var sameEnc = nt >= 0 && (tileEnc ? tileEnc[nt] === enc.id : Boolean(tileSet[nt]));
          if (sameEnc) continue;

          var fid = 0;
          if (d === 0) fid = S.fenceX[i + j * N];
          else if (d === 2) fid = S.fenceX[i + (j + 1) * N];
          else if (d === 3) fid = S.fenceZ[i + j * (N + 1)];
          else fid = S.fenceZ[(i + 1) + j * (N + 1)];

          if (!fid) continue;
          perimTotal++;
          var fd = resolveFenceDef(fid, FD, D);
          if (isLuxuryFenceDef(fd)) luxFenceCount++;
        }
      }
    }

    // Optional direct mock fence list on enclosure
    if (Array.isArray(enc.fences)) {
      for (k = 0; k < enc.fences.length; k++) {
        perimTotal++;
        if (isLuxuryFenceDef(resolveFenceDef(enc.fences[k], FD, D))) luxFenceCount++;
      }
    }

    // Luxury enclosure scenery inside enclosure
    if (S && Array.isArray(S.objects)) {
      for (k = 0; k < S.objects.length; k++) {
        var o = S.objects[k];
        if (!o || seenObj[o.id]) continue;
        var sd = getSceneryDef(o.type, SD);
        if (!sd && o.kind !== 'scenery') continue;
        var inEnc = false;
        if (isFinite(o.i) && isFinite(o.j)) {
          var ot = o.i + o.j * N;
          inEnc = (S.tileEnc && S.tileEnc[ot] === enc.id) || Boolean(tileSet[ot]);
        } else if (o.encId === enc.id) {
          inEnc = true;
        }
        if (!inEnc) continue;
        seenObj[o.id] = 1;
        if (isLuxurySceneryDef(sd, o.type)) {
          luxSceneryCount++;
          luxSceneryTypes[o.type] = 1;
        }
      }
    }

    // Optional direct mock scenery list on enclosure
    if (Array.isArray(enc.scenery)) {
      for (k = 0; k < enc.scenery.length; k++) {
        var stype = typeof enc.scenery[k] === 'string' ? enc.scenery[k] : (enc.scenery[k] && enc.scenery[k].type);
        var sdef = getSceneryDef(stype, SD);
        if (isLuxurySceneryDef(sdef, stype)) {
          luxSceneryCount++;
          luxSceneryTypes[stype || ('m' + k)] = 1;
        }
      }
    }

    // Within 9 tiles of a vip_viewing_lounge
    var maxRangeSq = (9 * TILE) * (9 * TILE);
    var viewingLoungesNear = 0;
    for (k = 0; k < lounges.length; k++) {
      var lg = lounges[k];
      var near = false;
      if (isFinite(enc.cx) && isFinite(enc.cz)) {
        var cdx = lg.x - enc.cx, cdz = lg.z - enc.cz;
        if (cdx * cdx + cdz * cdz <= maxRangeSq) near = true;
      }
      if (!near && tiles.length) {
        for (var m = 0; m < tiles.length; m++) {
          var tt = tiles[m], ti = tt % N, tj = (tt - ti) / N;
          var tx = (ti + 0.5) * TILE, tz = (tj + 0.5) * TILE;
          var tdx = lg.x - tx, tdz = lg.z - tz;
          if (tdx * tdx + tdz * tdz <= maxRangeSq) {
            near = true;
            break;
          }
        }
      }
      if (near) viewingLoungesNear++;
    }

    var fenceRatio = perimTotal > 0 ? luxFenceCount / perimTotal : (luxFenceCount > 0 ? 1 : 0);
    var sceneryTypeCount = Object.keys(luxSceneryTypes).length;

    var fencePts = luxFenceCount > 0 ? Math.min(40, Math.round(15 + 25 * fenceRatio)) : 0;
    var sceneryPts = luxSceneryCount > 0 ? Math.min(35, luxSceneryCount * 12 + sceneryTypeCount * 10) : 0;
    var viewPts = viewingLoungesNear > 0 ? Math.min(25, 20 + Math.min(5, (viewingLoungesNear - 1) * 5)) : 0;

    var prestige = clamp(fencePts + sceneryPts + viewPts, 0, 100);
    var isLuxury = Boolean(luxFenceCount > 0 || luxSceneryCount > 0 || viewingLoungesNear > 0);

    enc.luxuryPrestige = prestige;
    enc.isLuxury = isLuxury;
    return { isLuxury: isLuxury, prestige: prestige };
  }

  /** Compute and stamp enc.luxuryPrestige (0..100) and enc.isLuxury (boolean). */
  function computeEnclosureLuxury(enc) {
    if (!enc) return { isLuxury: false, prestige: 0 };
    var S = getS();
    var BD = getBD();
    var SD = getSD();
    var FD = getFD();
    var D = getD();
    var lounges = collectViewingLounges(S, BD);
    return computeEnclosureLuxuryWith(enc, S, BD, SD, FD, D, lounges);
  }

  /** Return true if enclosure qualifies as a luxury enclosure. */
  function isLuxuryEnclosure(enc) {
    if (!enc) return false;
    if (enc.isLuxury === undefined) computeEnclosureLuxury(enc);
    return Boolean(enc.isLuxury);
  }

  /** Return { isLuxury, prestige, appealMul, welfareBonus } for an enclosure. */
  function enclosureBonus(enc) {
    if (!enc) return { isLuxury: false, prestige: 0, appealMul: 1, welfareBonus: 0 };
    if (enc.isLuxury === undefined || !isFinite(enc.luxuryPrestige)) computeEnclosureLuxury(enc);
    var isLux = Boolean(enc.isLuxury);
    var prestige = clamp(isFinite(enc.luxuryPrestige) ? enc.luxuryPrestige : 0, 0, 100);
    if (!isLux) return { isLuxury: false, prestige: prestige, appealMul: 1, welfareBonus: 0 };
    var t = prestige / 100;
    return {
      isLuxury: true,
      prestige: prestige,
      appealMul: Math.round((1.25 + 0.35 * t) * 1000) / 1000,
      welfareBonus: Math.round((0.02 + 0.06 * t) * 1000) / 1000
    };
  }

  function scanPark(S) {
    var BD = getBD(), SD = getSD(), FD = getFD(), D = getD();
    var objects = Array.isArray(S.objects) ? S.objects : [];
    var guests = Array.isArray(S.guests) ? S.guests : [];
    var enclosures = Array.isArray(S.enclosures) ? S.enclosures : [];
    var staff = Array.isArray(S.staff) ? S.staff : [];

    var lodgeById = {};
    var lodges = [];
    var counts = { lodging: 0, dining: 0, wellness: 0, viewing: 0, security: 0, concierge: 0, decor: 0, guards: 0, stdSec: 0 };
    var types = { lodging: {}, dining: {}, wellness: {} };
    var totalBeds = 0;
    var lounges = [];
    var i, o, def;

    for (i = 0; i < objects.length; i++) {
      o = objects[i];
      if (!o) continue;
      def = getBuildingDef(o.type, BD);
      var sdef = !def ? getSceneryDef(o.type, SD) : null;
      var role = def && def.resortRole;

      if (role === 'lodging') {
        o.booked = 0;
        o.sleeping = 0;
        lodgeById[o.id] = o;
        lodges.push(o);
        if (isConnected(o) && !o.paused && !o.broken) {
          counts.lodging++;
          types.lodging[o.type] = 1;
          totalBeds += (def.capacity || o.capacity || 4);
        }
      } else if (role === 'dining') {
        if (isConnected(o) && !o.paused && !o.broken) {
          counts.dining++;
          types.dining[o.type] = 1;
        }
      } else if (role === 'wellness') {
        if (isConnected(o) && !o.paused && !o.broken) {
          counts.wellness++;
          types.wellness[o.type] = 1;
        }
      } else if (o.type === 'vip_viewing_lounge' || role === 'viewing' || role === 'enclosure_pavilion') {
        if (isConnected(o) && !o.paused && !o.broken) {
          counts.viewing++;
          var ctr = objCenter(o);
          lounges.push({ o: o, x: ctr.x, z: ctr.z, isVipLounge: true });
        }
      } else if (o.type === 'vip_gatehouse' || role === 'security') {
        if (isConnected(o)) counts.security++;
      } else if (o.type === 'valet_concierge' || role === 'concierge') {
        if (isConnected(o)) counts.concierge++;
      } else if (sdef && isLuxuryDecorDef(sdef)) {
        counts.decor++;
      }
    }

    var occupiedBeds = 0;
    var sleepingTotal = 0;
    for (i = 0; i < guests.length; i++) {
      var g = guests[i];
      if (!g || !g.resortLodging) continue;
      var ldg = lodgeById[g.resortLodging];
      if (!ldg) continue;
      ldg.booked = (ldg.booked || 0) + 1;
      occupiedBeds++;
      if (g.state === 'resort_sleep') {
        ldg.sleeping = (ldg.sleeping || 0) + 1;
        sleepingTotal++;
      }
    }

    for (i = 0; i < staff.length; i++) {
      var st = staff[i];
      if (!staffActive(st, S)) continue;
      var srole = staffRoleOf(st);
      if (srole === 'resort_guard') counts.guards++;
      else if (srole === 'security') counts.stdSec++;
      else if (srole === 'valet_concierge') counts.concierge++;
    }

    var securityScore = Math.min(1, counts.security * 0.4 + counts.guards * 0.35 + counts.stdSec * 0.12);

    var luxuryEncCount = 0;
    var luxuryPrestigeSum = 0;
    for (i = 0; i < enclosures.length; i++) {
      var enc = enclosures[i];
      var res = computeEnclosureLuxuryWith(enc, S, BD, SD, FD, D, lounges);
      if (res.isLuxury) {
        luxuryEncCount++;
        luxuryPrestigeSum += res.prestige;
      }
    }
    var avgLuxuryPrestige = luxuryEncCount > 0 ? luxuryPrestigeSum / luxuryEncCount : 0;

    var lodgingTypes = Object.keys(types.lodging).length;
    var diningTypes = Object.keys(types.dining).length;
    var wellnessTypes = Object.keys(types.wellness).length;

    var pLodging = Math.min(18, totalBeds * 1.2) + Math.min(8, lodgingTypes * 4);
    var pDining = Math.min(16, counts.dining * 10 + Math.max(0, diningTypes - 1) * 4);
    var pWellness = Math.min(16, counts.wellness * 10 + Math.max(0, wellnessTypes - 1) * 4);
    var pEnc = Math.min(18, luxuryEncCount * 6 + avgLuxuryPrestige * 0.06);
    var pSecurity = Math.round(securityScore * 10);
    var pConcierge = Math.min(7, counts.concierge * 7);
    var pDecor = Math.min(7, counts.decor * 1.5);
    var prestige = clamp(Math.round(pLodging + pDining + pWellness + pEnc + pSecurity + pConcierge + pDecor), 0, 100);

    var hasFacilities = (counts.lodging + counts.dining + counts.wellness + counts.viewing + counts.security + counts.concierge) > 0;

    return {
      counts: counts,
      lodges: lodges,
      lodgeById: lodgeById,
      totalBeds: totalBeds,
      occupiedBeds: occupiedBeds,
      sleepingTotal: sleepingTotal,
      securityScore: Math.round(securityScore * 1000) / 1000,
      luxuryEncCount: luxuryEncCount,
      prestige: prestige,
      hasFacilities: hasFacilities
    };
  }

  /** Recompute resort prestige, securityScore, luxury enclosures, and bed occupancy. */
  function recompute() {
    var S = getS();
    if (!S) return null;
    var sr = ensureState(S);
    var info = scanPark(S);
    sr.prestige = info.prestige;
    sr.securityScore = info.securityScore;
    sr.luxuryEncCount = info.luxuryEncCount;
    sr.totalBeds = info.totalBeds;
    sr.occupiedBeds = info.occupiedBeds;
    initializedScan = true;
    return info;
  }

  /** Reconcile lodging occupancy and reset transient timers after loading a save. */
  function afterLoad() {
    scanTimer = 0;
    arrivalTimer = 0;
    bookingTimer = 0;
    initializedScan = false;
    var S = getS();
    if (!S) return;
    ensureState(S);
    var BD = getBD();
    var guests = Array.isArray(S.guests) ? S.guests : [];
    var lodgeById = {};
    var objects = Array.isArray(S.objects) ? S.objects : [];
    var i, o;

    for (i = 0; i < objects.length; i++) {
      o = objects[i];
      if (!o) continue;
      var def = getBuildingDef(o.type, BD);
      if (def && def.resortRole === 'lodging') {
        o.booked = 0;
        o.sleeping = 0;
        lodgeById[o.id] = o;
      }
    }

    for (i = 0; i < guests.length; i++) {
      var g = guests[i];
      if (!g) continue;
      if (g.resortLodging) {
        var lodge = lodgeById[g.resortLodging];
        if (!lodge) {
          g.resortLodging = 0;
          g.nightsLeft = 0;
          g.resortCheckout = 0;
          if (g.state === 'resort_sleep' || g.inObj) {
            g.inObj = 0;
            g.state = 'walk';
            g.gt = '';
            g.dk = '';
            g.ni = -1;
            g.glide = 0;
          }
        } else {
          lodge.booked = (lodge.booked || 0) + 1;
          if (g.state === 'resort_sleep' || g.inObj === lodge.id) {
            g.state = 'resort_sleep';
            g.inObj = lodge.id;
            lodge.sleeping = (lodge.sleeping || 0) + 1;
          }
        }
      } else if (g.state === 'resort_sleep') {
        g.inObj = 0;
        g.state = 'walk';
        g.gt = '';
        g.dk = '';
        g.ni = -1;
        g.glide = 0;
      }
    }

    recompute();
  }

  /** Check security coverage aura at world position (x, z). */
  function securityAura(x, z) {
    if (!isFinite(x) || !isFinite(z)) {
      return { protected: false, safetyBonus: 0, panicDamp: 1 };
    }
    var S = getS();
    if (!S) return { protected: false, safetyBonus: 0, panicDamp: 1 };
    var TILE = getTile();
    var BD = getBD();
    var objects = Array.isArray(S.objects) ? S.objects : [];
    var staff = Array.isArray(S.staff) ? S.staff : [];

    var rGate = 16 * TILE, rGateSq = rGate * rGate;
    var rGuard = 12 * TILE, rGuardSq = rGuard * rGuard;
    var rConc = 10 * TILE, rConcSq = rConc * rConc;

    var hasGate = false, hasGuard = false, hasConc = false;
    var bonus = 0;
    var i, dx, dz, dSq, d, factor;

    for (i = 0; i < objects.length; i++) {
      var o = objects[i];
      if (!o || !isConnected(o)) continue;
      var def = getBuildingDef(o.type, BD);
      var role = def && def.resortRole;
      var ctr;
      if (o.type === 'vip_gatehouse' || role === 'security') {
        ctr = objCenter(o);
        dx = x - ctr.x; dz = z - ctr.z; dSq = dx * dx + dz * dz;
        if (dSq <= rGateSq) {
          hasGate = true;
          d = Math.sqrt(dSq);
          factor = 0.5 + 0.5 * (1 - d / rGate);
          bonus += 6 * factor;
        }
      } else if (o.type === 'valet_concierge' || role === 'concierge') {
        ctr = objCenter(o);
        dx = x - ctr.x; dz = z - ctr.z; dSq = dx * dx + dz * dz;
        if (dSq <= rConcSq) {
          hasConc = true;
          d = Math.sqrt(dSq);
          factor = 0.5 + 0.5 * (1 - d / rConc);
          bonus += 3 * factor;
        }
      } else if (def && def.safariReserve) {
        var cg = o.campGuards === undefined ? 1 : (o.campGuards | 0);
        if (cg > 0) {
          ctr = objCenter(o);
          dx = x - ctr.x; dz = z - ctr.z; dSq = dx * dx + dz * dz;
          if (dSq <= rGuardSq) {
            hasGuard = true;
            d = Math.sqrt(dSq);
            factor = 0.5 + 0.5 * (1 - d / rGuard);
            bonus += (4 + Math.min(4, cg * 1.5)) * factor;
          }
        }
      }
    }

    for (i = 0; i < staff.length; i++) {
      var st = staff[i];
      if (!staffActive(st, S) || !isFinite(st.x) || !isFinite(st.z)) continue;
      var srole = staffRoleOf(st);
      if (srole === 'resort_guard') {
        dx = x - st.x; dz = z - st.z; dSq = dx * dx + dz * dz;
        if (dSq <= rGuardSq) {
          hasGuard = true;
          d = Math.sqrt(dSq);
          factor = 0.5 + 0.5 * (1 - d / rGuard);
          bonus += 5 * factor;
        }
      } else if (srole === 'valet_concierge') {
        dx = x - st.x; dz = z - st.z; dSq = dx * dx + dz * dz;
        if (dSq <= rConcSq) {
          hasConc = true;
          d = Math.sqrt(dSq);
          factor = 0.5 + 0.5 * (1 - d / rConc);
          bonus += 3 * factor;
        }
      }
    }

    var isProtected = hasGate || hasGuard || hasConc;
    if (!isProtected) return { protected: false, safetyBonus: 0, panicDamp: 1 };

    var safetyBonus = clamp(Math.round(Math.max(4, bonus) * 10) / 10, 0, 12);
    var panicDamp = (hasGate && hasGuard) ? 0.25 : 0.35;
    return { protected: true, safetyBonus: safetyBonus, panicDamp: panicDamp };
  }

  /** Book an overnight stay for guest g in a connected lodging building with capacity. */
  function tryBookOvernight(g) {
    if (!g || g.resortLodging) return false;
    var S = getS();
    if (!S || !Array.isArray(S.objects)) return false;
    var sr = ensureState(S);
    var BD = getBD();
    var guests = Array.isArray(S.guests) ? S.guests : [];

    // Compute live occupancy per lodge to prevent overbooking within a tick
    var occ = {};
    var i;
    for (i = 0; i < guests.length; i++) {
      var og = guests[i];
      if (og && og.resortLodging) occ[og.resortLodging] = (occ[og.resortLodging] || 0) + 1;
    }

    var funds = guestFunds(g);
    var bestO = null;
    var bestDef = null;
    var bestPrice = 0;
    var bestScore = -1e9;

    for (i = 0; i < S.objects.length; i++) {
      var o = S.objects[i];
      if (!o || o.paused || o.broken) continue;
      var def = getBuildingDef(o.type, BD);
      if (!def || def.resortRole !== 'lodging') continue;
      if (!isConnected(o)) continue;

      var cap = def.capacity || o.capacity || 4;
      var booked = occ[o.id] || 0;
      if (booked >= cap) continue;

      var price = (def.safariReserve && Z.Safari && typeof Z.Safari.campPrice === 'function')
        ? Z.Safari.campPrice(o)
        : (o.price != null ? o.price : (def.price || 0));
      if (funds < price) continue;

      var tier = def.prestige || def.luxury || def.price || price;
      if (def.safariReserve) tier = Math.max(tier, price * 1.45);
      // Super-rich guests strongly prefer higher-prestige villas/suites
      var score = (funds >= price * 2 ? tier * 2 : tier) + (cap - booked) * 0.5 - price * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestO = o;
        bestDef = def;
        bestPrice = price;
      }
    }

    if (!bestO) return false;

    spendGuestFunds(g, bestPrice);
    var ctr = objCenter(bestO);
    earnRevenue(bestPrice, 'tickets', ctr.x, ctr.z);

    bestO.income = (bestO.income || 0) + bestPrice;
    bestO.uses = (bestO.uses || 0) + 1;
    bestO.nightsSold = (bestO.nightsSold || 0) + 1;
    bestO.booked = (occ[bestO.id] || 0) + 1;

    sr.roomRevenue += bestPrice;
    sr.resortRevenue += bestPrice;
    sr.bookingsToday += 1;
    sr.occupiedBeds = (sr.occupiedBeds || 0) + 1;

    g.resortLodging = bestO.id;
    g.resortCheckout = 0;
    g.nightsLeft = 1 + (rand() < 0.6 ? 1 : 0) + (rand() < 0.25 ? 1 : 0);
    return true;
  }

  /** True if guest g holds an active overnight reservation and should not be evicted at closing. */
  function shouldStayOvernight(g) {
    if (!g || !g.resortLodging) return false;
    if (!(g.nightsLeft > 0 || g.state === 'resort_sleep')) return false;
    return Boolean(findLodge(g.resortLodging));
  }

  function wakeGuestFromLodge(g, lodge, S, OPEN_T, CLOSE_T, DAY_SECONDS) {
    var pt = objFront(lodge);
    g.x = pt.x;
    g.z = pt.z;
    if (S && S.path) {
      var N = getN(S), TILE = getTile();
      var ti = clamp(Math.floor(pt.x / TILE), 0, N - 1) + clamp(Math.floor(pt.z / TILE), 0, N - 1) * N;
      if (S.path[ti]) g.ti = ti;
    }
    g.inObj = 0;
    g.state = 'walk';
    g.gt = '';
    g.dk = '';
    g.ni = -1;
    g.glide = 0;
    g.idle = 0;
    g.speed = 0;

    var remDay = Math.max(0.1, CLOSE_T - (S ? S.time : OPEN_T)) * DAY_SECONDS;
    g.stay = Math.max(g.stay || 0, remDay * 0.85);
    g.stay0 = Math.max(g.stay0 || 0, g.stay);
    if (g.stayEnd !== undefined && S) {
      g.stayEnd = (S.day || 1) + CLOSE_T - 0.04;
    }
    g.happiness = clamp((isFinite(g.happiness) ? g.happiness : 70) + 12, 0, 100);
    if (isFinite(g.mood)) g.mood += 8;

    if (g.resortCheckout || !(g.nightsLeft > 0)) {
      g.resortLodging = 0;
      g.nightsLeft = 0;
      g.resortCheckout = 0;
    }
  }

  function spawnResortVip(S, RT, c, info) {
    if (typeof c.spawnGuest !== 'function') return null;
    var grp = RT && isFinite(RT.nextGroup) ? RT.nextGroup++ : (localGroupSeq--);
    var g = c.spawnGuest(grp, true);
    if (!g) return null;

    g.resortVip = 1;
    g.vip = 1;
    var baseBudget = guestFunds(g);
    var boosted = Math.round(Math.max(baseBudget * 3.5, 750 + rand() * 1400));
    g.budget = boosted;
    g.money = Math.max(isFinite(g.money) ? g.money : 0, boosted);
    g.tol = (g.tol || 1) * 1.75;

    if (g.al && typeof g.al === 'object') {
      g.al.meal = Math.max(g.al.meal || 0, 2);
      g.al.drink = Math.max(g.al.drink || 0, 3);
      g.al.treat = Math.max(g.al.treat || 0, 2);
      g.al.shop = Math.max(g.al.shop || 0, 2);
      g.al.act = Math.max(g.al.act || 0, 4);
    }

    S.resort.vipArrivals += 1;
    tryBookOvernight(g);
    return g;
  }

  function stepSleepNeeds(g, dt) {
    var k = 1 - Math.exp(-dt * 0.12);
    g.energy = isFinite(g.energy) ? g.energy + (98 - g.energy) * k : 98;
    g.fun = isFinite(g.fun) ? g.fun + (96 - g.fun) * k : 96;
    g.happiness = isFinite(g.happiness) ? g.happiness + (96 - g.happiness) * k : 96;
    // In Dino/Zoo sim polarity, hunger/thirst/bladder = 0 means fully satisfied
    g.hunger = isFinite(g.hunger) ? g.hunger + (4 - g.hunger) * k : 4;
    g.thirst = isFinite(g.thirst) ? g.thirst + (4 - g.thirst) * k : 4;
    g.bladder = isFinite(g.bladder) ? g.bladder + (4 - g.bladder) * k : 4;
  }

  /** Advance resort simulation by dt seconds. */
  function step(dt) {
    if (!isFinite(dt) || dt <= 0) return;
    var S = getS();
    if (!S) return;
    var RT = getRT();
    var c = ctx();
    var sr = ensureState(S);

    scanTimer += dt;
    var info = null;
    if (!initializedScan || scanTimer >= 2) {
      scanTimer = 0;
      info = recompute();
    }

    var OPEN_T = getOpenT();
    var CLOSE_T = getCloseT();
    var DAY_SECONDS = getDaySeconds();
    var maxGuests = getMaxGuests();
    var guests = Array.isArray(S.guests) ? S.guests : [];
    var parkOpen = S.open !== false && S.time >= OPEN_T && S.time < CLOSE_T - 0.04;
    var lockedDown = Boolean(RT && RT.lockdown);

    // Wealthy Resort Guest arrivals
    if (parkOpen && !lockedDown) {
      if (!info) info = scanPark(S);
      if (info.hasFacilities && guests.length < maxGuests) {
        var freeBeds = Math.max(0, sr.totalBeds - sr.occupiedBeds);
        var rate = 0.03 +
          (sr.prestige / 100) * 0.07 +
          Math.min(3, freeBeds * 0.015) +
          info.counts.security * 0.02 +
          info.counts.concierge * 0.025;
        rate *= Math.min(2, 180 / DAY_SECONDS);
        arrivalTimer += dt * rate;
        if (arrivalTimer >= 1) {
          arrivalTimer = Math.min(1, arrivalTimer - 1);
          spawnResortVip(S, RT, c, info);
        }
      }
    }

    // Mid-day overnight bookings for wealthy or high-budget guests
    bookingTimer += dt;
    if (bookingTimer >= 4 && S.time >= OPEN_T && S.time < CLOSE_T - 0.03) {
      bookingTimer = 0;
      if (sr.occupiedBeds < sr.totalBeds) {
        var bookedBatch = 0;
        for (var i = 0; i < guests.length && bookedBatch < 2; i++) {
          var bg = guests[i];
          if (!bg || bg.resortLodging || bg.state === 'leave' || bg.state === 'resort_sleep') continue;
          if (bg.resortVip || guestFunds(bg) >= 350) {
            if (tryBookOvernight(bg)) bookedBatch++;
          }
        }
      }
    }

    // Overnight lodging lifecycle (check-in, sleep restoration, morning wakeup)
    var BD = getBD();
    var lodgeOcc = {};
    var lodgeSleep = {};
    var checkInWindow = S.time >= CLOSE_T - 0.02 || S.time < OPEN_T;
    var wakeWindow = S.time >= OPEN_T && S.time < CLOSE_T - 0.05;

    for (var k = 0; k < guests.length; k++) {
      var g = guests[k];
      if (!g) continue;
      if (!g.resortLodging) {
        if (g.state === 'resort_sleep') {
          g.inObj = 0;
          g.state = 'walk';
          g.gt = '';
          g.dk = '';
          g.ni = -1;
          g.glide = 0;
        }
        continue;
      }

      var lodge = findLodge(g.resortLodging, S, BD);
      if (!lodge) {
        g.resortLodging = 0;
        g.nightsLeft = 0;
        g.resortCheckout = 0;
        if (g.state === 'resort_sleep' || g.inObj) {
          g.inObj = 0;
          g.state = 'walk';
          g.gt = '';
          g.dk = '';
          g.ni = -1;
          g.glide = 0;
        }
        continue;
      }

      lodgeOcc[lodge.id] = (lodgeOcc[lodge.id] || 0) + 1;

      if (checkInWindow && g.state !== 'resort_sleep' && (g.nightsLeft || 0) > 0) {
        var ctr = objCenter(lodge);
        g.state = 'resort_sleep';
        g.inObj = lodge.id;
        g.gt = '';
        g.dk = '';
        g.ni = -1;
        g.glide = 0;
        g.speed = 0;
        g.x = ctr.x;
        g.z = ctr.z;
      }

      if (g.state === 'resort_sleep') {
        if (wakeWindow) {
          wakeGuestFromLodge(g, lodge, S, OPEN_T, CLOSE_T, DAY_SECONDS);
        } else {
          g.inObj = lodge.id;
          g.speed = 0;
          stepSleepNeeds(g, dt);
          lodgeSleep[lodge.id] = (lodgeSleep[lodge.id] || 0) + 1;
        }
      }
    }

    // Keep lodging transient occupancy fields synced
    var objects = Array.isArray(S.objects) ? S.objects : [];
    for (var j = 0; j < objects.length; j++) {
      var obj = objects[j];
      if (!obj) continue;
      var def = getBuildingDef(obj.type, BD);
      if (def && def.resortRole === 'lodging') {
        obj.booked = lodgeOcc[obj.id] || 0;
        obj.sleeping = lodgeSleep[obj.id] || 0;
      }
    }
  }

  /** Advance overnight reservations at midnight / new day rollover. */
  function onNewDay() {
    var S = getS();
    if (!S) return;
    var sr = ensureState(S);
    sr.bookingsToday = 0;

    var BD = getBD();
    var guests = Array.isArray(S.guests) ? S.guests : [];
    for (var i = 0; i < guests.length; i++) {
      var g = guests[i];
      if (!g || !g.resortLodging) continue;
      var lodge = findLodge(g.resortLodging, S, BD);
      if (!lodge || !isConnected(lodge)) {
        g.nightsLeft = 0;
        g.resortLodging = 0;
        g.resortCheckout = 0;
        if (g.state === 'resort_sleep') {
          g.inObj = 0;
          g.state = 'walk';
          g.gt = '';
          g.dk = '';
          g.ni = -1;
        }
        continue;
      }

      sr.overnightStays += 1;
      g.nightsLeft = (g.nightsLeft || 0) - 1;

      if (g.nightsLeft > 0) {
        var def = getBuildingDef(lodge.type, BD);
        var price = lodge.price != null ? lodge.price : (def ? def.price || 0 : 0);
        if (guestFunds(g) >= price) {
          spendGuestFunds(g, price);
          var ctr = objCenter(lodge);
          earnRevenue(price, 'tickets', ctr.x, ctr.z);
          lodge.income = (lodge.income || 0) + price;
          lodge.nightsSold = (lodge.nightsSold || 0) + 1;
          sr.roomRevenue += price;
          sr.resortRevenue += price;
        } else {
          g.nightsLeft = 0;
          if (g.state === 'resort_sleep') g.resortCheckout = 1;
          else { g.resortLodging = 0; g.resortCheckout = 0; }
        }
      } else {
        g.nightsLeft = 0;
        if (g.state === 'resort_sleep') {
          g.resortCheckout = 1;
        } else {
          g.resortLodging = 0;
          g.resortCheckout = 0;
        }
      }
    }

    recompute();
  }

  /** Record non-lodging resort spend (dining/wellness/viewing/concierge) into S.resort buckets. */
  function recordSpend(o, amount) {
    if (!o || !(amount > 0)) return;
    var S = getS();
    if (!S) return;
    var sr = ensureState(S);
    var BD = getBD();
    var def = getBuildingDef(o.type, BD);
    var role = (def && def.resortRole) || o.resortRole || '';

    sr.resortRevenue += amount;
    if (role === 'lodging') sr.roomRevenue += amount;
    else if (role === 'dining') sr.diningRevenue += amount;
    else if (role === 'wellness') sr.wellnessRevenue += amount;
    else if (role === 'viewing' || role === 'enclosure_pavilion') sr.viewingRevenue += amount;
  }

  /** Release any guests tied to a removed/bulldozed resort building so none are stranded. */
  function onObjectRemoved(o) {
    var oid = typeof o === 'object' && o ? o.id : o;
    var S = getS();
    if (!S) return;
    var guests = Array.isArray(S.guests) ? S.guests : [];
    var front = typeof o === 'object' && o ? objFront(o) : null;
    var N = getN(S), TILE = getTile();

    for (var i = 0; i < guests.length; i++) {
      var g = guests[i];
      if (!g) continue;
      if ((oid && g.resortLodging === oid) || (oid && g.inObj === oid)) {
        g.resortLodging = 0;
        g.nightsLeft = 0;
        g.resortCheckout = 0;
        g.inObj = 0;
        g.state = 'walk';
        g.gt = '';
        g.dk = '';
        g.ni = -1;
        g.glide = 0;
        g.speed = 0;
        if (front && isFinite(front.x) && isFinite(front.z)) {
          g.x = front.x;
          g.z = front.z;
          if (S.path) {
            var ti = clamp(Math.floor(front.x / TILE), 0, N - 1) + clamp(Math.floor(front.z / TILE), 0, N - 1) * N;
            if (S.path[ti]) g.ti = ti;
          }
        }
      }
    }

    recompute();
  }

  /** Return park/zoo rating bonus in 0..0.25 based on resort prestige (0 if no connected facility). */
  function ratingBonus() {
    var S = getS();
    if (!S || !S.resort) return 0;
    var info = scanPark(S);
    if (!info.hasFacilities) return 0;
    return clamp((S.resort.prestige || 0) / 100 * 0.25, 0, 0.25);
  }

  /** Return inspection stats for a resort building object. */
  function objectStats(o) {
    var S = getS();
    var sr = S ? ensureState(S) : defaultResortState();
    if (!o) {
      return {
        occupancy: 0, capacity: 0, sleeping: 0, nightsSold: 0, income: 0,
        prestige: sr.prestige, securityScore: sr.securityScore, luxuryEncCount: sr.luxuryEncCount
      };
    }
    var BD = getBD();
    var def = getBuildingDef(o.type, BD);
    var role = (def && def.resortRole) || o.resortRole || '';
    var cap = role === 'lodging' ? (def && def.capacity ? def.capacity : (o.capacity || 4)) : 0;
    var guests = S && Array.isArray(S.guests) ? S.guests : [];
    var booked = 0, sleeping = 0;
    for (var i = 0; i < guests.length; i++) {
      var g = guests[i];
      if (!g) continue;
      if (g.resortLodging === o.id) {
        booked++;
        if (g.state === 'resort_sleep') sleeping++;
      } else if (g.inObj === o.id && g.state === 'resort_sleep') {
        sleeping++;
      }
    }
    return {
      id: o.id,
      type: o.type,
      role: role,
      connected: isConnected(o),
      occupancy: booked,
      booked: booked,
      capacity: cap,
      sleeping: sleeping,
      nightsSold: o.nightsSold || 0,
      uses: o.uses || 0,
      income: o.income || 0,
      price: o.price != null ? o.price : (def ? def.price || 0 : 0),
      prestige: sr.prestige,
      securityScore: sr.securityScore,
      luxuryEncCount: sr.luxuryEncCount
    };
  }

  /** Return aggregate resort dashboard/test summary. */
  function summary() {
    var S = getS();
    if (!S) {
      var empty = defaultResortState();
      empty.sleepingGuests = 0;
      empty.lodgingCount = 0;
      empty.diningCount = 0;
      empty.wellnessCount = 0;
      empty.viewingCount = 0;
      empty.securityCount = 0;
      empty.conciergeCount = 0;
      empty.decorCount = 0;
      empty.guardCount = 0;
      empty.ratingBonus = 0;
      return empty;
    }
    var sr = ensureState(S);
    var info = scanPark(S);
    return {
      vipArrivals: sr.vipArrivals,
      overnightStays: sr.overnightStays,
      resortRevenue: sr.resortRevenue,
      roomRevenue: sr.roomRevenue,
      diningRevenue: sr.diningRevenue,
      wellnessRevenue: sr.wellnessRevenue,
      viewingRevenue: sr.viewingRevenue,
      prestige: sr.prestige,
      securityScore: sr.securityScore,
      luxuryEncCount: sr.luxuryEncCount,
      bookingsToday: sr.bookingsToday,
      totalBeds: sr.totalBeds,
      occupiedBeds: sr.occupiedBeds,
      sleepingGuests: info.sleepingTotal,
      lodgingCount: info.counts.lodging,
      diningCount: info.counts.dining,
      wellnessCount: info.counts.wellness,
      viewingCount: info.counts.viewing,
      securityCount: info.counts.security,
      conciergeCount: info.counts.concierge,
      decorCount: info.counts.decor,
      guardCount: info.counts.guards,
      ratingBonus: info.hasFacilities ? clamp((sr.prestige || 0) / 100 * 0.25, 0, 0.25) : 0
    };
  }

  Z.Resort = {
    ensureState: ensureState,
    afterLoad: afterLoad,
    recompute: recompute,
    computeEnclosureLuxury: computeEnclosureLuxury,
    isLuxuryEnclosure: isLuxuryEnclosure,
    enclosureBonus: enclosureBonus,
    securityAura: securityAura,
    step: step,
    tryBookOvernight: tryBookOvernight,
    shouldStayOvernight: shouldStayOvernight,
    onNewDay: onNewDay,
    recordSpend: recordSpend,
    onObjectRemoved: onObjectRemoved,
    ratingBonus: ratingBonus,
    objectStats: objectStats,
    summary: summary
  };

  if (Z.Sim) Z.Sim.resort = Z.Resort;
})();
