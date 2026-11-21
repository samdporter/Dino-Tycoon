// ===== 66b-ui-coaster.js =====
// Amber Acres — Custom Rollercoaster UI, Tools & Inspect Panels
(function () {
  'use strict';
  var Z = window.Z, UI = Z && Z.UI, D = Z && Z.DATA;
  if (!Z || !UI || !D || !D.coaster) return;

  var CD = D.coaster;
  var h = UI.h, fmt = UI.fmt, ic = UI.ic;
  var DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];

  if (typeof document !== 'undefined' && document.head) {
    var st = document.createElement('style');
    st.setAttribute('data-coaster', '1');
    st.textContent = '.drawer-mode{flex:0 0 auto;align-self:center}' +
      '#coasterRide{position:fixed;bottom:calc(74px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);z-index:30;display:none;background:rgba(18,24,32,0.92);color:#fff;padding:8px 16px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,0.4);font:600 13px var(--sans,sans-serif);align-items:center;gap:10px;border:1px solid rgba(255,255,255,0.2);pointer-events:auto}' +
      '#coasterRide.on{display:flex}';
    document.head.appendChild(st);
  }

  // ---- 1. Coaster Tab Items & Category Registration ----
  function items() {
    var stationIds = ['coaster_wooden', 'coaster_mine', 'coaster_flume', 'coaster_steel', 'coaster_hyper'];
    var stations = [];
    for (var i = 0; i < stationIds.length; i++) {
      var id = stationIds[i], d = UI.byId(D.buildings, id);
      if (d) stations.push({ kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, fp: [d.w || 4, d.h || 2], tpCat: 'stations' });
    }
    var ovOn = !!(Z.CoasterWorld && Z.CoasterWorld.isOverlay && Z.CoasterWorld.isOverlay());
    var track = [
      { kind: 'ctrack', id: 'ctrack', name: 'Build Track', emoji: '🛤️', cost: 35, unit: '/tile', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Drag from the green arrow on a coaster station around in a loop to the amber arrow. Curves and hills smooth automatically!' },
      { kind: 'craise', id: 'craise', name: 'Raise Hill', emoji: '⬆️', cost: 15, unit: '/step', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Click or drag over coaster track to raise a smooth hill (+1 level). Stamp a Chain Lift Hill (⛓️) on uphill climbs so trains can reach the top!' },
      { kind: 'clower', id: 'clower', name: 'Lower Track', emoji: '⬇️', cost: 0, priceHtml: 'Free', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Click or drag over coaster track to lower its height.' },
      { kind: 'ctrackrm', id: 'ctrackrm', name: 'Remove Track', emoji: '✂️', cost: 0, priceHtml: '50% back', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Drag over coaster track tiles to dismantle them.' },
      { kind: 'cview', id: 'cview', name: 'Track Overlay', emoji: '🗺️', cost: 0, priceHtml: ovOn ? 'On' : 'Off', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Highlight coaster track heights, station connection arrows, and special pieces.' }
    ];
    var specials = CD.specials.map(function (sp) {
      return {
        kind: 'cspec', id: 'cspec_' + sp.id, specId: sp.id,
        name: sp.name, emoji: sp.emoji, cost: sp.cost, star: sp.star || 0,
        tpCat: 'specials', coasterTool: true, def: sp, tip: sp.info
      };
    });
    return stations.concat(track).concat(specials);
  }

  UI.extraCats = (UI.extraCats || []).concat([{
    id: 'coasters',
    name: 'Coasters',
    icon: 'coaster',
    items: items
  }]);

  // ---- 2. Orthogonal 4-connected Route Normalizer (with Backtrack Trimming) & Smart Station Snapper ----
  function stepTile(t, d) {
    var N = Z.N || 56, i = t % N, j = (t - i) / N;
    var ni = i + DX[d], nj = j + DZ[d];
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return -1;
    return ni + nj * N;
  }

  function pushOrtho(out, idxMap, nt) {
    if (!out.length) { out.push(nt); idxMap[nt] = 0; return; }
    if (out[out.length - 1] === nt) return;
    // Backtrack trimming: if the cursor jitters back onto a recently visited tile in this stroke, pop back to it instead of creating an illegal branch!
    var prevIdx = idxMap[nt];
    if (prevIdx !== undefined && (out.length - prevIdx) <= 4) {
      while (out.length - 1 > prevIdx) {
        var popped = out.pop();
        delete idxMap[popped];
      }
      return;
    }
    idxMap[nt] = out.length;
    out.push(nt);
  }

  function route4(pts) {
    var N = Z.N || 56, out = [], idxMap = {};
    for (var k = 0; k < pts.length; k++) {
      var t = pts[k].i + pts[k].j * N;
      if (!out.length) { pushOrtho(out, idxMap, t); continue; }
      var prev = out[out.length - 1];
      if (t === prev) continue;
      var i0 = prev % N, j0 = (prev - i0) / N, i1 = pts[k].i, j1 = pts[k].j;
      while (i0 !== i1 || j0 !== j1) {
        if (Math.abs(i1 - i0) >= Math.abs(j1 - j0)) i0 += i1 > i0 ? 1 : -1;
        else j0 += j1 > j0 ? 1 : -1;
        pushOrtho(out, idxMap, i0 + j0 * N);
      }
    }
    return out;
  }

  function orthoConnect(t0, t1, stAt, N) {
    var path = [t0], i0 = t0 % N, j0 = (t0 - i0) / N, i1 = t1 % N, j1 = (t1 - i1) / N;
    var guard = 0;
    while ((i0 !== i1 || j0 !== j1) && guard++ < 32) {
      var di = i1 - i0, dj = j1 - j0;
      var stepI = i0 + (di > 0 ? 1 : -1) + j0 * N;
      var stepJ = i0 + (j0 + (dj > 0 ? 1 : -1)) * N;
      if (di !== 0 && (dj === 0 || (stAt[stepI] < 0 && Math.abs(di) >= Math.abs(dj)) || stAt[stepJ] >= 0)) {
        i0 += di > 0 ? 1 : -1;
      } else {
        j0 += dj > 0 ? 1 : -1;
      }
      var nt = i0 + j0 * N;
      if (path[path.length - 1] !== nt) path.push(nt);
    }
    return path;
  }

  function snapStations(rt) {
    if (!Z.Coaster || rt.length < 2) return rt;
    var X = Z.Coaster.state(), N = Z.N || 56;
    if (!X.stations.length) return rt;

    // 1. If drag started INSIDE any of the 8 tiles of a station, route cleanly out of the nearest inline end (endF -> exitF or endB -> exitB)!
    if (X.stAt[rt[0]] >= 0) {
      var stIdx0 = X.stAt[rt[0]], st0 = X.stations[stIdx0];
      var firstOutIdx = -1;
      for (var k = 0; k < rt.length; k++) if (X.stAt[rt[k]] !== stIdx0) { firstOutIdx = k; break; }
      if (firstOutIdx < 0) return [st0.endF];
      var target0 = rt[firstOutIdx];
      var exitF0 = stepTile(st0.endF, st0.fd), exitB0 = stepTile(st0.endB, st0.bd);
      var ti0 = target0 % N, tj0 = (target0 - ti0) / N;
      var dF0 = exitF0 >= 0 ? Math.abs((exitF0 % N) - ti0) + Math.abs(Math.floor(exitF0 / N) - tj0) : 1e9;
      var dB0 = exitB0 >= 0 ? Math.abs((exitB0 % N) - ti0) + Math.abs(Math.floor(exitB0 / N) - tj0) : 1e9;
      var useF0 = dF0 <= dB0;
      var end0 = useF0 ? st0.endF : st0.endB;
      var ex0 = useF0 ? exitF0 : exitB0;
      if (ex0 >= 0) {
        var bridge0 = orthoConnect(ex0, target0, X.stAt, N);
        rt = [end0].concat(bridge0).concat(rt.slice(firstOutIdx + 1));
      }
    } else {
      // Strictly inline exterior snap: only snap if rt[0] is the exact inline tile in front of endF or endB!
      for (var s = 0; s < X.stations.length; s++) {
        var stA = X.stations[s];
        if (rt[0] === stepTile(stA.endF, stA.fd)) { rt.unshift(stA.endF); break; }
        if (rt[0] === stepTile(stA.endB, stA.bd)) { rt.unshift(stA.endB); break; }
      }
    }

    // 2. If drag ended INSIDE any of the 8 tiles of a station, route cleanly into the nearest inline end!
    var lastT = rt[rt.length - 1];
    if (X.stAt[lastT] >= 0) {
      var stIdx1 = X.stAt[lastT], st1 = X.stations[stIdx1];
      var lastOutIdx = -1;
      for (var j = rt.length - 1; j >= 0; j--) if (X.stAt[rt[j]] !== stIdx1) { lastOutIdx = j; break; }
      if (lastOutIdx >= 0) {
        var target1 = rt[lastOutIdx];
        var exitF1 = stepTile(st1.endF, st1.fd), exitB1 = stepTile(st1.endB, st1.bd);
        var ti1 = target1 % N, tj1 = (target1 - ti1) / N;
        var dF1 = exitF1 >= 0 ? Math.abs((exitF1 % N) - ti1) + Math.abs(Math.floor(exitF1 / N) - tj1) : 1e9;
        var dB1 = exitB1 >= 0 ? Math.abs((exitB1 % N) - ti1) + Math.abs(Math.floor(exitB1 / N) - tj1) : 1e9;
        // Prefer the opposite end if rt[0] already used one end of this same station!
        var useF1 = rt[0] === st1.endF ? false : rt[0] === st1.endB ? true : (dF1 <= dB1);
        var end1 = useF1 ? st1.endF : st1.endB;
        var ex1 = useF1 ? exitF1 : exitB1;
        if (ex1 >= 0) {
          var bridge1 = orthoConnect(target1, ex1, X.stAt, N);
          rt = rt.slice(0, lastOutIdx).concat(bridge1).concat([end1]);
        }
      }
    } else {
      for (var s2 = 0; s2 < X.stations.length; s2++) {
        var stB = X.stations[s2];
        if (lastT === stepTile(stB.endF, stB.fd) && rt[0] !== stB.endF) { rt.push(stB.endF); break; }
        if (lastT === stepTile(stB.endB, stB.bd) && rt[0] !== stB.endB) { rt.push(stB.endB); break; }
      }
    }
    return rt;
  }

  function tileObjs(ts) {
    var N = Z.N || 56, out = [];
    for (var k = 0; k < ts.length; k++) { var t = ts[k]; out.push({ i: t % N, j: (t - (t % N)) / N }); }
    return out;
  }

  function uniqTiles(pts) {
    var N = Z.N || 56, seen = {}, out = [];
    for (var k = 0; k < pts.length; k++) {
      var t = pts[k].i + pts[k].j * N;
      if (!seen[t]) { seen[t] = 1; out.push(t); }
    }
    return out;
  }

  // ---- 3. Hook Tools.PLAN, Tools.start/cancel & UI.onCard ----
  function hookTools() {
    var T = UI.Tools;
    if (!T || !T.PLAN || T._coasterHooked) return;
    T._coasterHooked = true;

    T.PLAN.ctrack = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, msg: 'Coaster sim unavailable', spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var raw = route4(d.pts || []);
      // Idle hover before dragging: show a friendly green tile cursor instead of a red error message
      if (raw.length < 2 && !d.committing) {
        return {
          ok: true, cost: 0, n: 0, msg: '',
          spec: { type: 'tiles', tiles: tileObjs(raw), ok: true },
          run: function () { return { n: 0, cost: 0, silent: true }; }
        };
      }
      var rt = snapStations(raw);
      var p = Z.Coaster.planTrack(rt, { dry: true });
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        label: p.ok && p.tiles ? p.tiles.length + ' track tiles' : '',
        spec: { type: 'tiles', tiles: tileObjs(p.tiles && p.tiles.length ? p.tiles : rt), ok: p.ok },
        run: function () { var r = Z.Coaster.buildTrack(rt); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.craise = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var p = Z.Coaster.changeHeight(ts, 1, { dry: true });
      if (!p.ok && !d.committing && ts.length === 1 && !Z.Coaster.hasTrack(ts[0])) {
        return { ok: true, cost: 0, n: 0, msg: '', spec: { type: 'tiles', tiles: tileObjs(ts), ok: true }, run: function () { return { n: 0, cost: 0, silent: true }; } };
      }
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        warn: p.ok && p.peakLv ? 'Hill level +' + p.peakLv + ' (' + (p.peakLv * CD.elevStep).toFixed(1) + 'm)' : '',
        spec: { type: 'tiles', tiles: tileObjs(p.tiles && p.tiles.length ? p.tiles : ts), ok: p.ok },
        run: function () { var r = Z.Coaster.changeHeight(ts, 1); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.clower = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var p = Z.Coaster.changeHeight(ts, -1, { dry: true });
      if (!p.ok && !d.committing && ts.length === 1 && !Z.Coaster.hasTrack(ts[0])) {
        return { ok: true, cost: 0, n: 0, msg: '', spec: { type: 'tiles', tiles: tileObjs(ts), ok: true }, run: function () { return { n: 0, cost: 0, silent: true }; } };
      }
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(p.tiles && p.tiles.length ? p.tiles : ts), ok: p.ok },
        run: function () { var r = Z.Coaster.changeHeight(ts, -1); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.ctrackrm = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var p = Z.Coaster.removeTiles(ts, { dry: true });
      if (!p.ok && !d.committing && ts.length === 1 && !Z.Coaster.hasTrack(ts[0])) {
        return { ok: true, cost: 0, n: 0, msg: '', spec: { type: 'tiles', tiles: tileObjs(ts), ok: true }, run: function () { return { n: 0, cost: 0, silent: true }; } };
      }
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(p.tiles && p.tiles.length ? p.tiles : ts), ok: p.ok },
        run: function () { var r = Z.Coaster.removeTiles(ts); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.cspec = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var specId = (UI.tool && UI.tool.def && UI.tool.def.id) || (UI.tool && UI.tool.specId) || 1;
      var p = Z.Coaster.placeSpecial(ts, specId, { dry: true });
      if (!p.ok && !d.committing && ts.length === 1 && !Z.Coaster.hasTrack(ts[0])) {
        return { ok: true, cost: 0, n: 0, msg: '', spec: { type: 'tiles', tiles: tileObjs(ts), ok: true }, run: function () { return { n: 0, cost: 0, silent: true }; } };
      }
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(p.tiles && p.tiles.length ? p.tiles : ts), ok: p.ok },
        run: function () { var r = Z.Coaster.placeSpecial(ts, specId); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    var origStart = T.start, origCancel = T.cancel;
    var autoOv = false;
    T.start = function (spec) {
      if (spec && (spec.kind === 'ctrack' || spec.kind === 'craise' || spec.kind === 'clower' || spec.kind === 'ctrackrm' || spec.kind === 'cspec')) {
        if (Z.CoasterWorld && !Z.CoasterWorld.isOverlay()) { Z.CoasterWorld.setOverlay(true); autoOv = true; }
      }
      return origStart.apply(this, arguments);
    };
    T.cancel = function () {
      if (autoOv && Z.CoasterWorld) { Z.CoasterWorld.setOverlay(false); autoOv = false; }
      return origCancel.apply(this, arguments);
    };

    var origOnCard = UI.onCard;
    UI.onCard = function (it, locked) {
      if (it && it.kind === 'cview') {
        if (Z.CoasterWorld) {
          var next = !Z.CoasterWorld.isOverlay();
          Z.CoasterWorld.setOverlay(next);
          UI.toast(next ? 'Coaster track overlay ON' : 'Coaster track overlay OFF', 'info');
        }
        return;
      }
      if (!locked && it && it.coasterTool) {
        T.start({ kind: it.kind, id: it.id, name: it.name, def: it.def, tip: it.tip, specId: it.specId });
        return;
      }
      return origOnCard.apply(this, arguments);
    };
  }

  // ---- 4. Inspect Panels: Coaster Station & Coaster Train ----
  function open(kind, id) {
    if (!Z.Coaster || !UI.Panel || !UI.Panel.kit) return false;
    if (kind === 'ctrain') return openTrain(id);
    if (kind === 'object') {
      var o = null, objs = Z.state && Z.state.objects;
      if (objs) for (var k = 0; k < objs.length; k++) if (objs[k].id === id) { o = objs[k]; break; }
      if (!o || o.kind !== 'building') return false;
      var def = UI.byId(D.buildings, o.type);
      if (!def || !def.coasterStation) return false;
      return openStation(o, def);
    }
    return false;
  }

  function openStation(o, def) {
    var kit = UI.Panel.kit;
    var f = kit.frame(kit.thumbBox('building', o.type, 96, def.emoji), def.name, 'Custom Rollercoaster');
    var b = f.body;
    var statusEl = h('div'), statsEl = h('div', { style: 'display:flex;flex-direction:column;gap:3px' });
    var trainsEl = h('div', { style: 'margin-top:8px;display:flex;flex-direction:column;gap:4px' });
    var buyEl = h('div', { style: 'margin-top:6px;display:flex;flex-wrap:wrap;gap:4px' });

    b.appendChild(statusEl);

    var maxP = CD.fareMax || 35;
    var pv = h('b.num');
    var slider = h('input', { type: 'range', min: '0', max: String(maxP), step: '1', value: String(o.price || def.price), 'aria-label': 'Ticket price' });
    var hint = h('div', { style: 'font-size:12px;color:var(--ink2)' });
    function syncPrice() {
      var info = Z.Coaster.stationInfo(o.id);
      var rec = info ? info.recPrice : def.price;
      pv.textContent = fmt(+slider.value);
      slider.style.setProperty('--p', (+slider.value / maxP * 100) + '%');
      hint.textContent = 'Recommended: ' + fmt(rec) + ' (based on excitement)';
    }
    slider.addEventListener('input', function () { Z.Sim.setPrice(o.id, +slider.value); syncPrice(); });
    b.appendChild(h('div.kv', h('span', { text: 'Ticket price' }), pv));
    b.appendChild(slider);
    b.appendChild(hint);
    syncPrice();

    b.appendChild(statsEl);
    b.appendChild(trainsEl);
    b.appendChild(buyEl);

    var pauseBtn = h('button.btn.alt', {
      text: o.paused ? 'Resume Ride' : 'Pause Ride',
      on: { click: function () { Z.Coaster.setPaused(o.id, !o.paused); pauseBtn.textContent = o.paused ? 'Resume Ride' : 'Pause Ride'; UI.snd('click'); } }
    });
    var trackBtn = h('button.btn', {
      text: '🛤️ Build Track',
      on: { click: function () { UI.Panel.hide(); UI.openCat('coasters', true); UI.Tools.start({ kind: 'ctrack', id: 'ctrack', name: 'Build Track' }); } }
    });
    var liftBtn = h('button.btn.alt', {
      text: '⛓️ Add Chain Lift',
      on: { click: function () { UI.Panel.hide(); UI.openCat('coasters', true); UI.Tools.start({ kind: 'cspec', id: 'cspec_1', specId: 1, name: 'Chain Lift Hill', def: CD.specials[0] }); } }
    });
    var refund = Math.floor(def.cost * 0.5);
    b.appendChild(h('div.btnrow', { style: 'flex-wrap:wrap' }, trackBtn, liftBtn, pauseBtn, kit.confirmBtn(ic('trash') + 'Demolish', 'Demolish for +' + fmt(refund) + '?', function () {
      Z.Sim.bulldoze(o.i, o.j); UI.snd('build'); UI.Panel.hide();
    }, 'alt')));

    var lastKey = '';
    kit.setCur({
      kind: 'object',
      update: function () {
        var info = Z.Coaster.stationInfo(o.id);
        if (!info) return false;
        var td = info.typeDef;
        var mechStaff = null, mechCount = 0;
        if (Z.state && Z.state.staff) {
          for (var ms = 0; ms < Z.state.staff.length; ms++) {
            var sf = Z.state.staff[ms];
            if (sf.type === 'mechanic') {
              mechCount++;
              if (sf.tk && sf.tk.k === 'coaster' && sf.tk.id === o.id) mechStaff = sf;
            }
          }
        }
        var key = JSON.stringify([info.ready, info.broken, info.condition, info.eng, mechCount, mechStaff ? mechStaff.id : 0, info.energyOk, info.stallReason, info.loop, info.branch, info.trackLen, info.excitement, info.intensity, info.maxHeight, info.totalDrop, info.overlooks.length, info.queueLen, info.trains.length, info.connected, info.paused, o.uses, Math.round(o.income || 0), info.trains.map(function (t) { return [t.id, t.state, t.cars]; })]);
        if (key === lastKey) return true;
        lastKey = key;
        syncPrice();

        statusEl.innerHTML = '';
        if (info.broken) {
          statusEl.appendChild(kit.issuesList(['⚠️ BROKEN DOWN — Rollercoaster Stopped! ' + (info.eng ? 'Emergency mechanic repairing...' : mechStaff ? ('Mechanic ' + mechStaff.name + ' is on the way!') : 'Call an emergency mechanic below or hire a Mechanic in Staff.')]));
        } else if (info.ready) {
          statusEl.appendChild(h('ul.issues', h('li.ok', { text: info.paused ? 'Paused — closed to guests' : 'Circuit complete & running!' })));
        } else if (info.branch) {
          statusEl.appendChild(kit.issuesList(['Track cannot branch or cross — remove extra branches']));
        } else if (info.loop && !info.energyOk && info.stallReason) {
          statusEl.appendChild(kit.issuesList([info.stallReason]));
        } else {
          statusEl.appendChild(kit.issuesList(['Incomplete circuit — drag track from the green station arrow around in a loop to the amber arrow']));
        }
        if (!info.connected) statusEl.appendChild(kit.issuesList(['Station entrance is not connected to a path']));

        statsEl.innerHTML = '';
        var condTxt = info.broken ? '⚠️ Broken (' + info.condition + '%)' : (info.condition + '% ' + (info.condition >= 75 ? '(Good)' : info.condition >= 45 ? '(Worn)' : '(Needs service!)'));
        var mechTxt = info.eng ? '🔧 Emergency crew repairing' : mechStaff ? ('🔧 ' + mechStaff.name + ' (' + (mechStaff.state === 'work' ? 'Repairing' : 'On the way') + ')') : mechCount > 0 ? ('🔧 ' + mechCount + ' on radio call') : 'None hired (hire in Staff)';
        var rows = [
          ['Condition', condTxt],
          ['Mechanics', mechTxt],
          ['Excitement', info.loop ? info.excitement.toFixed(1) + ' / 10' : '—'],
          ['Intensity', info.loop ? info.intensity.toFixed(1) + ' / 10' : '—'],
          ['Track length', info.trackLen + ' tiles'],
          ['Max height / Drop', info.maxHeight + 'm / ' + info.totalDrop + 'm'],
          ['Peak speed', info.loop ? info.peakSpeed + ' m/s' : '—'],
          ['Enclosures overlooked', info.overlooks.length],
          ['In queue', info.queueLen],
          ['Riders served', o.uses || 0],
          ['Takings', fmt(o.income || 0)]
        ];
        var spParts = [];
        for (var k = 0; k < CD.specials.length; k++) {
          var sp = CD.specials[k], cnt = info.specs[sp.id] || 0;
          if (cnt) spParts.push(sp.emoji + '×' + cnt);
        }
        if (spParts.length) rows.push(['Special elements', spParts.join(' ')]);
        rows.forEach(function (r) { statsEl.appendChild(h('div.kv', h('span', { text: r[0] }), h('b', { text: String(r[1]) }))); });

        trainsEl.innerHTML = '';
        // Breakdown / Maintenance Action Row right on the Station panel!
        var maintRow = h('div.btnrow', { style: 'gap:4px;flex-wrap:wrap' });
        if (info.broken && !info.eng) {
          maintRow.appendChild(h('button.btn', {
            text: '🔧 Call Mechanic (' + fmt(CD.engineerFee) + ')',
            on: {
              click: function () {
                var res = Z.Coaster.callEngineer(o.id);
                if (!res.ok) UI.toast(res.msg, 'bad');
                else { UI.snd('click'); UI.toast('Emergency mechanic dispatched!', 'good'); lastKey = ''; }
              }
            }
          }));
        } else if (!info.broken && info.condition < 95) {
          maintRow.appendChild(h('button.btn.alt', {
            text: '🔧 Service Now (' + fmt(CD.callOutFee) + ')',
            on: {
              click: function () {
                var res = Z.Coaster.callEngineer(o.id);
                if (!res.ok) UI.toast(res.msg, 'bad');
                else { UI.snd('click'); lastKey = ''; }
              }
            }
          }));
        }
        if (mechCount === 0) {
          maintRow.appendChild(h('button.btn.alt', {
            text: '🔧 Hire Mechanic',
            on: {
              click: function () {
                var mDef = UI.byId(D.staff, 'mechanic');
                UI.Panel.hide();
                UI.openCat('staff', true);
                if (mDef) UI.Tools.start({ kind: 'staff', id: 'mechanic', name: mDef.name, def: mDef });
              }
            }
          }));
        }
        if (maintRow.children.length) trainsEl.appendChild(maintRow);
        if (info.trains.length) {
          trainsEl.appendChild(h('div', { style: 'font-weight:700;font-size:12px;margin-top:4px', text: 'Trains (' + info.trains.length + '/' + td.maxTrains + ')' }));
          info.trains.forEach(function (T) {
            var ti = Z.Coaster.trainInfo(T.id);
            var stTxt = ti.state === 'broken' ? '⚠️ Broken' : ti.state === 'stalled' ? '⚠️ Stalled on hill' : (ti.state === 'dwell' ? 'Boarding' : Math.round(ti.speed) + ' m/s');
            var row = h('div.btnrow', { style: 'gap:4px' });
            row.appendChild(h('button.btn.alt', {
              text: 'Train #' + T.id + ' (' + T.cars + ' cars • ' + ti.riders + '/' + ti.capacity + ' • ' + stTxt + ')',
              on: { click: function () { UI.Panel.open('ctrain', T.id); } }
            }));
            if (Z.CoasterWorld) {
              row.appendChild(h('button.btn', {
                text: '🎢 Ride',
                on: { click: function () { Z.CoasterWorld.rideAlong(T.id); UI.Panel.hide(); } }
              }));
            }
            trainsEl.appendChild(row);
          });
        }

        buyEl.innerHTML = '';
        if (info.ready && info.trains.length < td.maxTrains) {
          for (var c = td.minCars; c <= Math.min(td.maxCars, td.minCars + 2); c++) {
            (function (cars) {
              var cost = td.trainCost + (cars - td.minCars) * td.carCost;
              buyEl.appendChild(h('button.btn.alt', {
                text: '+ ' + cars + '-Car Train (' + fmt(cost) + ')',
                on: {
                  click: function () {
                    var res = Z.Coaster.buyTrain(o.id, cars);
                    if (!res.ok) UI.toast(res.msg, 'bad');
                    else { UI.snd('build'); UI.toast('Launched new ' + cars + '-car train!', 'good'); lastKey = ''; }
                  }
                }
              }));
            })(c);
          }
        }
        return true;
      }
    });
    UI.Panel.update();
    return true;
  }

  function openTrain(trainId) {
    var info0 = Z.Coaster.trainInfo(trainId);
    if (!info0) return false;
    var kit = UI.Panel.kit;
    var f = kit.frame(h('div', { style: 'font-size:28px;display:flex;align-items:center;justify-content:center;width:100%;height:100%', text: '🎢' }), info0.typeDef.name + ' #' + trainId, info0.train.cars + '-car coaster train');
    var b = f.body;
    var statsEl = h('div', { style: 'display:flex;flex-direction:column;gap:3px' });
    var actEl = h('div.btnrow', { style: 'margin-top:8px;flex-wrap:wrap' });
    b.appendChild(statsEl);
    b.appendChild(actEl);

    var lastKey = '';
    kit.setCur({
      kind: 'ctrain',
      update: function () {
        var info = Z.Coaster.trainInfo(trainId);
        if (!info) return false;
        var key = JSON.stringify([info.state, Math.round(info.speed), info.riders, Math.ceil(info.fix), info.eng]);
        if (key === lastKey) return true;
        lastKey = key;

        statsEl.innerHTML = '';
        var stLabel = info.state === 'broken' ? (info.eng ? 'Mechanic repairing (' + Math.ceil(info.fix) + 's)' : 'Broken down! (' + Math.ceil(info.fix) + 's)')
          : info.state === 'stalled' ? 'Stalled! (Needs Chain Lift ⛓️ or Boost ⚡)'
          : (info.state === 'dwell' ? 'Boarding at station' : 'Running');
        [
          ['Status', stLabel],
          ['Speed', info.speed.toFixed(1) + ' m/s'],
          ['Riders', info.riders + ' / ' + info.capacity],
          ['Excitement', info.line ? info.line.excitement.toFixed(1) + ' / 10' : '—']
        ].forEach(function (r) { statsEl.appendChild(h('div.kv', h('span', { text: r[0] }), h('b', { text: String(r[1]) }))); });

        actEl.innerHTML = '';
        if (info.state === 'broken' && !info.eng) {
          actEl.appendChild(h('button.btn', {
            text: '🔧 Call Mechanic (' + fmt(CD.engineerFee) + ')',
            on: {
              click: function () {
                var res = Z.Coaster.callEngineer(trainId);
                if (!res.ok) UI.toast(res.msg, 'bad');
                else { UI.snd('click'); UI.toast('Mechanic dispatched!', 'good'); lastKey = ''; }
              }
            }
          }));
        }
        if (Z.CoasterWorld) {
          actEl.appendChild(h('button.btn', {
            text: '🎢 Ride Along',
            on: { click: function () { Z.CoasterWorld.rideAlong(trainId); UI.Panel.hide(); } }
          }));
          actEl.appendChild(h('button.btn.alt', {
            text: '👁 Follow',
            on: { click: function () { Z.CoasterWorld.follow(trainId); } }
          }));
        }
        actEl.appendChild(h('button.btn.alt', {
          text: 'Station',
          on: { click: function () { UI.Panel.open('object', info.train.stationId); } }
        }));
        actEl.appendChild(kit.confirmBtn('Sell Train', 'Sell this train for 60% refund?', function () {
          var res = Z.Coaster.sellTrain(trainId);
          if (res.ok) { UI.snd('build'); UI.Panel.hide(); }
        }, 'alt'));
        return true;
      }
    });
    UI.Panel.update();
    return true;
  }

  // ---- 5. Ride-Along Floating Pill, Station Placement Guide Toast & Breakdown Banner ----
  // Escape handling is centralized in 51-tools.js so exiting Ride Along never conflicts with tools/panels.
  var ridePill = null;
  function showRidePill(trainId) {
    if (!ridePill && typeof document !== 'undefined') {
      ridePill = h('div', { id: 'coasterRide' });
      var lbl = h('span', { text: '🎢 Riding Rollercoaster' });
      var exitBtn = h('button', {
        text: 'Leave Train (Esc)',
        style: 'background:#e84b3c;color:#fff;border:none;border-radius:999px;padding:5px 12px;font-weight:700;cursor:pointer',
        on: { click: function () { if (Z.CoasterWorld) Z.CoasterWorld.endRide(); } }
      });
      ridePill.appendChild(lbl);
      ridePill.appendChild(exitBtn);
      if (document.body) document.body.appendChild(ridePill);
    }
    if (ridePill) ridePill.classList.toggle('on', !!trainId);
  }

  if (Z.bus && Z.bus.on) {
    Z.bus.on('coasterRide', showRidePill);
    Z.bus.on('reset', function () { showRidePill(0); });
    Z.bus.on('objectAdded', function (o) {
      if (!o || o.kind !== 'building') return;
      var def = UI.byId(D.buildings, o.type);
      if (def && def.coasterStation && UI.toast) {
        UI.toast('Station placed! Use "Build Track" (🛤️) to connect the green & amber arrows, and add a Chain Lift (⛓️) on uphill climbs.', 'info');
      }
    });
    Z.bus.on('coasterBroken', function (ev) {
      if (UI.banner && ev) {
        UI.banner({
          title: '⚠️ Coaster Breakdown!',
          text: ev.name + ' train #' + ev.trainId + ' stopped on the track.',
          jump: function () { UI.Panel.open('ctrain', ev.trainId); }
        });
      }
    });
  }

  UI.Coaster = {
    items: items,
    open: open,
    hookTools: hookTools
  };
  hookTools();
})();
