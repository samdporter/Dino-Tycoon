// Wild Acres Zoo — Custom Rollercoaster UI, Tools & Inspect Panels (Zoo Tycoon only)
(function () {
  'use strict';
  var Z = window.Z, UI = Z && Z.UI, D = Z && Z.DATA;
  if (!Z || !UI || !D || !D.coaster) return;

  var CD = D.coaster;
  var h = UI.h, fmt = UI.fmt, ic = UI.ic;

  // ---- 1. Coaster Tab Items ----
  function items(bd) {
    var stations = bd(['coaster_wooden', 'coaster_mine', 'coaster_flume', 'coaster_steel', 'coaster_hyper'], 'stations')();
    var track = [
      { kind: 'ctrack', id: 'ctrack', name: 'Build Track', emoji: '🛤️', cost: 35, unit: '/tile', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Drag from one end of a coaster station and loop back to the other end to complete the circuit.' },
      { kind: 'craise', id: 'craise', name: 'Raise Track', emoji: '⬆️', cost: 15, unit: '/step', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Click or drag over coaster track to raise hills and build bigger drops.' },
      { kind: 'clower', id: 'clower', name: 'Lower Track', emoji: '⬇️', cost: 0, priceHtml: 'Free', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Click or drag over coaster track to lower its height.' },
      { kind: 'ctrackrm', id: 'ctrackrm', name: 'Remove Track', emoji: '✂️', cost: 0, priceHtml: '50% back', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Drag over coaster track tiles to dismantle them.' },
      { kind: 'cview', id: 'cview', name: 'Track Overlay', emoji: '🗺️', cost: 0, priceHtml: 'Toggle', star: 0, tpCat: 'track', coasterTool: true,
        tip: 'Highlight coaster track heights and special pieces.' }
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

  // ---- 2. Orthogonal 4-connected Route Normalizer & Station Snapper ----
  function route4(pts) {
    var N = Z.N || 56, out = [];
    for (var k = 0; k < pts.length; k++) {
      var t = pts[k].i + pts[k].j * N;
      if (!out.length) { out.push(t); continue; }
      var prev = out[out.length - 1];
      if (t === prev) continue;
      var i0 = prev % N, j0 = (prev - i0) / N, i1 = pts[k].i, j1 = pts[k].j;
      while (i0 !== i1 || j0 !== j1) {
        if (Math.abs(i1 - i0) >= Math.abs(j1 - j0)) i0 += i1 > i0 ? 1 : -1;
        else j0 += j1 > j0 ? 1 : -1;
        var nt = i0 + j0 * N;
        if (out[out.length - 1] !== nt) out.push(nt);
      }
    }
    return out;
  }

  function snapStations(rt) {
    if (!Z.Coaster || !rt.length) return rt;
    var X = Z.Coaster.state(), N = Z.N || 56;
    if (!X.stations.length) return rt;
    function adjEnd(t) {
      var ti = t % N, tj = (t - ti) / N;
      for (var k = 0; k < X.stations.length; k++) {
        var st = X.stations[k];
        var eF = st.endF, eB = st.endB;
        if (Math.abs((eF % N) - ti) + Math.abs(((eF - (eF % N)) / N) - tj) === 1) return eF;
        if (Math.abs((eB % N) - ti) + Math.abs(((eB - (eB % N)) / N) - tj) === 1) return eB;
      }
      return -1;
    }
    var a = adjEnd(rt[0]);
    if (a >= 0 && X.stAt[rt[0]] < 0) rt.unshift(a);
    var b = adjEnd(rt[rt.length - 1]);
    if (b >= 0 && X.stAt[rt[rt.length - 1]] < 0) rt.push(b);
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
      var rt = snapStations(route4(d.pts || []));
      var p = Z.Coaster.planTrack(rt, { dry: true });
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(rt), ok: p.ok },
        run: function () { var r = Z.Coaster.buildTrack(rt); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.craise = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var p = Z.Coaster.changeHeight(ts, 1, { dry: true });
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(ts), ok: p.ok },
        run: function () { var r = Z.Coaster.changeHeight(ts, 1); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.clower = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var p = Z.Coaster.changeHeight(ts, -1, { dry: true });
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(ts), ok: p.ok },
        run: function () { var r = Z.Coaster.changeHeight(ts, -1); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.ctrackrm = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var p = Z.Coaster.removeTiles(ts, { dry: true });
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(ts), ok: p.ok },
        run: function () { var r = Z.Coaster.removeTiles(ts); return { n: r.ok ? (r.tiles ? r.tiles.length : 1) : 0, cost: r.cost || 0 }; }
      };
    };

    T.PLAN.cspec = function (d) {
      if (!Z.Coaster) return { ok: false, cost: 0, n: 0, spec: null, run: function () { return { n: 0, cost: 0 }; } };
      var ts = uniqTiles(d.pts || []);
      var specId = (UI.tool && UI.tool.def && UI.tool.def.id) || (UI.tool && UI.tool.specId) || 1;
      var p = Z.Coaster.placeSpecial(ts, specId, { dry: true });
      return {
        ok: p.ok, cost: p.cost || 0, n: p.tiles ? p.tiles.length : 0, msg: p.msg,
        spec: { type: 'tiles', tiles: tileObjs(ts), ok: p.ok },
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

    // Ticket price slider
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
      text: 'Build Track',
      on: { click: function () { UI.Panel.hide(); UI.openCat('coasters', true); UI.Tools.start({ kind: 'ctrack', id: 'ctrack', name: 'Build Track' }); } }
    });
    var refund = Math.floor(def.cost * 0.5);
    b.appendChild(h('div.btnrow', trackBtn, pauseBtn, kit.confirmBtn(ic('trash') + 'Demolish', 'Demolish for +' + fmt(refund) + '?', function () {
      Z.Sim.bulldoze(o.i, o.j); UI.snd('build'); UI.Panel.hide();
    }, 'alt')));

    var lastKey = '';
    kit.setCur({
      kind: 'object',
      update: function () {
        var info = Z.Coaster.stationInfo(o.id);
        if (!info) return false;
        var td = info.typeDef;
        var key = JSON.stringify([info.ready, info.loop, info.branch, info.trackLen, info.excitement, info.intensity, info.maxHeight, info.totalDrop, info.overlooks.length, info.queueLen, info.trains.length, info.connected, info.paused, o.uses, Math.round(o.income || 0), info.trains.map(function (t) { return [t.id, t.state, t.cars]; })]);
        if (key === lastKey) return true;
        lastKey = key;
        syncPrice();

        statusEl.innerHTML = '';
        if (info.ready) {
          statusEl.appendChild(h('ul.issues', h('li.ok', { text: info.paused ? 'Paused — closed to guests' : 'Circuit complete & running!' })));
        } else if (info.branch) {
          statusEl.appendChild(kit.issuesList(['Track cannot branch or cross — remove extra branches']));
        } else {
          statusEl.appendChild(kit.issuesList(['Incomplete circuit — drag track from one end of this station back to the other end']));
        }
        if (!info.connected) statusEl.appendChild(kit.issuesList(['Station entrance is not connected to a path']));

        statsEl.innerHTML = '';
        var rows = [
          ['Excitement', info.ready ? info.excitement.toFixed(1) + ' / 10' : '—'],
          ['Intensity', info.ready ? info.intensity.toFixed(1) + ' / 10' : '—'],
          ['Track length', info.trackLen + ' tiles'],
          ['Max height / Drop', info.maxHeight + 'm / ' + info.totalDrop + 'm'],
          ['Peak speed', info.ready ? info.peakSpeed + ' m/s' : '—'],
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
        if (info.trains.length) {
          trainsEl.appendChild(h('div', { style: 'font-weight:700;font-size:12px;margin-top:4px', text: 'Trains (' + info.trains.length + '/' + td.maxTrains + ')' }));
          info.trains.forEach(function (T) {
            var ti = Z.Coaster.trainInfo(T.id);
            var stTxt = ti.state === 'broken' ? '⚠️ Broken' : (ti.state === 'dwell' ? 'Boarding' : Math.round(ti.speed) + ' m/s');
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
        var stLabel = info.state === 'broken' ? (info.eng ? 'Mechanic repairing (' + Math.ceil(info.fix) + 's)' : 'Broken down! (' + Math.ceil(info.fix) + 's)') : (info.state === 'dwell' ? 'Boarding at station' : 'Running');
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

  // ---- 5. Ride-Along Floating Pill & Breakdown Banner ----
  var ridePill = null;
  function showRidePill(trainId) {
    if (!ridePill && typeof document !== 'undefined') {
      ridePill = h('div', {
        id: 'coasterRide',
        style: 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:900;display:none;background:rgba(18,24,32,0.92);color:#fff;padding:8px 16px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,0.4);font:600 13px var(--sans,sans-serif);align-items:center;gap:10px;border:1px solid rgba(255,255,255,0.2)'
      });
      var lbl = h('span', { text: '🎢 Riding Rollercoaster' });
      var exitBtn = h('button', {
        text: 'Leave Train (Esc)',
        style: 'background:#e84b3c;color:#fff;border:none;border-radius:999px;padding:5px 12px;font-weight:700;cursor:pointer',
        on: { click: function () { if (Z.CoasterWorld) Z.CoasterWorld.endRide(); } }
      });
      ridePill.appendChild(lbl);
      ridePill.appendChild(exitBtn);
      if (document.body) document.body.appendChild(ridePill);
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && Z.CoasterWorld && Z.CoasterWorld.isRiding()) Z.CoasterWorld.endRide();
        });
      }
    }
    if (ridePill) ridePill.style.display = trainId ? 'flex' : 'none';
  }

  if (Z.bus && Z.bus.on) {
    Z.bus.on('coasterRide', showRidePill);
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
