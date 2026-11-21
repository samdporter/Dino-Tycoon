// ===== 52-panels.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - inspect panels (animal, enclosure, guest, building, staff) and the species adoption sheet. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, fmt = UI.fmt, D = Z.DATA, N = Z.N;
  Z.bus.on('gridsize', function (n) { N = n; });
  var Panel = UI.Panel = {}, el, cur = null, sheetEl = null;

  Panel.init = function () {
    el = UI.el; sheetEl = h('div#sheet'); document.getElementById('ui').appendChild(sheetEl);
    sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl) Panel.closeSheet(); });
  };
  Panel.isOpen = function () { return !!cur; };
  Panel.hide = function (quiet) {
    if (!cur && !quiet) return;
    cur = null; el.panel.classList.remove('on'); el.panel.innerHTML = '';
    try { Z.World.highlightEnclosure(null); if (!UI.tool) Z.World.setPreview(null); } catch (e) { }
    UI.sel = null;
  };
  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function focusEnc(en, dist) {
    if (!en || !Z.World || !Z.World.focus) return;
    var cur = (Z.state && Z.state.enclosures && find(Z.state.enclosures, en.id)) || en;
    var cx = cur.cx, cz = cur.cz, tl = cur.tiles;
    if ((!isFinite(cx) || !isFinite(cz)) && tl && tl.length) {
      var T = Z.TILE || 2, sx = 0, sz = 0;
      for (var k = 0; k < tl.length; k++) { sx += ((tl[k] % N) + 0.5) * T; sz += (((tl[k] / N) | 0) + 0.5) * T; }
      cx = sx / tl.length; cz = sz / tl.length;
    }
    if (isFinite(cx) && isFinite(cz)) Z.World.focus(cx, cz, dist);
  }
  function bar(frac, goodHigh) {
    var f = UI.clamp(frac, 0, 1), cls = f > 0.6 ? '' : f > 0.35 ? ' mid' : ' low';
    return h('div.bar' + cls, h('i', { style: 'width:' + Math.round(f * 100) + '%' }));
  }
  function setBar(b, frac) { var f = UI.clamp(frac, 0, 1); b.className = 'bar' + (f > 0.6 ? '' : f > 0.35 ? ' mid' : ' low'); b.firstChild.style.width = Math.round(f * 100) + '%'; }
  // a grid of labelled bars; returns {el, set(key, frac, text)}
  function bars(spec) {
    var g = h('div.bars'), refs = {};
    spec.forEach(function (s) {
      var b = bar(0), v = h('span.bv', { text: '' });
      g.appendChild(h('span.bl', { text: s[1] })); g.appendChild(b); g.appendChild(v); refs[s[0]] = { b: b, v: v };
    });
    return { el: g, set: function (k, f, t) { var r = refs[k]; if (!r) return; setBar(r.b, f); r.v.textContent = t !== undefined ? t : Math.round(f * 100) + '%'; } };
  }
  function issuesList(list, okText) {
    var ul = h('ul.issues');
    if (!list.length) ul.appendChild(h('li.ok', { text: okText || 'All good' }));
    list.forEach(function (t) { ul.appendChild(h('li', { text: t })); });
    return ul;
  }
  function sameList(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  function confirmBtn(label, ask, fn, cls) {
    var b = h('button.btn.sm' + (cls ? '.' + cls : ''), { html: label }), t = 0, armed = false;
    b.addEventListener('click', function () {
      UI.snd('click');
      if (!armed) { armed = true; var old = b.innerHTML; b.innerHTML = typeof ask === 'function' ? ask() : ask; b.classList.add('warn'); t = setTimeout(function () { armed = false; b.innerHTML = label; b.classList.remove('warn'); }, 3000); }
      else { clearTimeout(t); armed = false; fn(); }
    });
    return b;
  }
  function frame(thumbEl, title, sub) {
    el.panel.innerHTML = '';
    var head = h('div.ph', h('div.pth', thumbEl), h('div.pt', h('h3', { text: title }), h('p', { text: sub })), h('button.x', { html: ic('close'), 'aria-label': 'Close', on: { click: function () { UI.snd('click'); Panel.hide(); } } }));
    var body = h('div.pb'); el.panel.appendChild(head); el.panel.appendChild(body); el.panel.classList.add('on');
    return { head: head, body: body, title: $q('h3', head), sub: $q('p', head) };
  }
  function $q(s, r) { return r.querySelector(s); }
  function thumbBox(kind, id, size, fb) { var d = h('div', { style: 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:26px' }); UI.lazyThumb(d, kind, id, fb || '', size || 96, true); return d; }

  Panel.kit = { frame: frame, thumbBox: thumbBox, confirmBtn: confirmBtn, issuesList: issuesList, setCur: function (c) { cur = c; } };

  Panel.open = function (kind, id) {
    if (UI.tool) return;
    try { Z.World.highlightEnclosure(null); Z.World.setPreview(null); } catch (e) { }
    var ok = false;
    if (UI.Coaster && UI.Coaster.open && UI.Coaster.open(kind, id)) ok = true;
    else if (kind === 'animal') ok = openAnimal(id); else if (kind === 'enclosure') ok = openEnc(id); else if (kind === 'guest') ok = openGuest(id);
    else if (kind === 'object') ok = openObject(id); else if (kind === 'staff') ok = openStaff(id);
    if (ok) { UI.sel = { kind: kind, id: id }; el.panel.scrollTop = 0; }
  };
  Panel.update = function () {
    if (!cur) return;
    try { if (!cur.update()) Panel.hide(); } catch (e) { console.error(e); Panel.hide(); }
  };

  // ------------------------------------------------------------------ animal
  function ageText(a, sp) {
    var ad = Z.Sim.adultAge(a.species), d = Math.floor(a.age);
    return (a.baby ? 'Baby' : d > sp.lifespan * 0.75 ? 'Elderly' : 'Adult') + ' ' + (a.sex === 'f' ? 'female' : 'male') + ', ' + d + ' day' + (d === 1 ? '' : 's') + ' old';
  }
  function openAnimal(id) {
    var a = find(Z.state.animals, id); if (!a) return false;
    var sp = UI.sp(a.species), f = frame(thumbBox('animal', a.species, 96, sp.emoji), a.name, sp.name);
    var b = f.body, hb = h('div', { style: 'display:flex;align-items:center;gap:10px' });
    var mood = h('div', { style: 'font:700 28px var(--serif);min-width:64px' }), moodTxt = h('div', { style: 'font-size:12.5px;color:var(--ink2);line-height:1.3;flex:1' });
    hb.appendChild(mood); hb.appendChild(moodTxt); b.appendChild(hb);
    var br = bars([['hap', 'Happiness'], ['fed', 'Fed'], ['wat', 'Hydrated'], ['rest', 'Rested'], ['hp', 'Health']]); b.appendChild(br.el);
    var iss = h('div'); b.appendChild(iss); var issKey = [];
    b.appendChild(h('div.fact', { text: sp.fact }));
    var rn = h('div.btnrow', { style: 'display:none' }), inp = h('input.txt', { type: 'text', maxlength: '20', value: a.name, 'aria-label': 'Name' });
    rn.appendChild(inp); rn.appendChild(h('button.btn.sm', { html: ic('check') + 'Save', on: { click: function () { var v = inp.value.trim().slice(0, 20); if (v) { a.name = v; f.title.textContent = v; UI.toast('Renamed to ' + v, 'good'); } rn.style.display = 'none'; UI.snd('click'); } } }));
    var sellBtn = confirmBtn(ic('sell') + 'Sell', function () { var r = Z.Sim.sellAnimal(a.id, { dry: true }); return 'Sell for ' + fmt(-r.cost) + '?'; }, function () { var r = Z.Sim.sellAnimal(a.id); UI.toast(a.name + ' has gone to a new home (' + fmt(-r.cost) + ').', 'money'); Panel.hide(); }, 'alt');
    var row = h('div.btnrow.tight',
      h('button.btn.sm', { html: ic('eye') + 'Follow', on: { click: function () { UI.startFollow('animal', a.id); } } }),
      h('button.btn.sm.alt', { html: ic('move') + 'Move', on: { click: function () { UI.Tools.start({ kind: 'animalmove', id: a.species, name: a.name, aid: a.id }); UI.cat = null; } } }),
      h('button.btn.sm.alt', { html: ic('pencil') + 'Rename', on: { click: function () { rn.style.display = rn.style.display === 'none' ? 'flex' : 'none'; inp.focus(); } } }), sellBtn);
    b.appendChild(rn); b.appendChild(row);
    cur = {
      kind: 'animal', update: function () {
        var an = find(Z.state.animals, id); if (!an) return false;
        var r = Z.Sim.animalReport(id); if (!r) return false;
        var n = r.needs; mood.textContent = Math.round(n.happiness) + '%'; mood.style.color = n.happiness > 65 ? 'var(--good)' : n.happiness > 40 ? '#c88a10' : 'var(--bad)';
        moodTxt.textContent = UI.stateText(an.state) + (r.enclosure ? ' in ' + r.enclosure : '') + '. ' + ageText(an, sp) + (an.pregnant ? '. Expecting!' : '') + (an.sick ? '. Unwell.' : '');
        br.set('hap', n.happiness / 100); br.set('fed', 1 - n.hunger / 100); br.set('wat', 1 - n.thirst / 100); br.set('rest', n.energy / 100); br.set('hp', n.health / 100);
        if (!sameList(issKey, r.issues)) { issKey = r.issues.slice(); var nl = issuesList(r.issues, 'Content and well looked after'); iss.innerHTML = ''; iss.appendChild(nl); }
        return true;
      }
    };
    cur.update(); return true;
  }

  // ------------------------------------------------------------------ enclosure
  var COMPS = [['terrain', 'Ground'], ['space', 'Space'], ['foliage', 'Plants'], ['water', 'Water'], ['shelter', 'Shelter'], ['rocks', 'Rocks'], ['social', 'Company'], ['clean', 'Clean']];
  function openEnc(id) {
    var e = find(Z.state.enclosures, id); if (!e) return false;
    var f = frame(h('div', { html: ic('fence'), style: 'width:28px;height:28px;color:var(--moss)' }), e.name, ''), b = f.body;
    Z.World.highlightEnclosure(id);
    var rn = h('div.btnrow', { style: 'display:none' }), inp = h('input.txt', { type: 'text', maxlength: '28', value: e.name, 'aria-label': 'Enclosure name' });
    rn.appendChild(inp); rn.appendChild(h('button.btn.sm', { html: ic('check') + 'Save', on: { click: function () { var r = Z.Sim.renameEnclosure(id, inp.value); if (r.ok) { f.title.textContent = inp.value.trim(); UI.toast('Enclosure renamed', 'good'); } rn.style.display = 'none'; UI.snd('click'); } } }));
    var env = bars([['clean', 'Cleanliness'], ['food', 'Food'], ['water', 'Water']]); b.appendChild(env.el);
    var fenceTxt = h('div.kv'); b.appendChild(fenceTxt);
    var encTypeTxt = h('div.kv'); b.appendChild(encTypeTxt);
    var spBox = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }); b.appendChild(spBox);
    var iss = h('div'); b.appendChild(iss); var issKey = [], spKey = '';
    b.appendChild(rn);
    b.appendChild(h('div.btnrow',
      h('button.btn.sm', { html: ic('paw') + 'Add animal', on: { click: function () { Panel.hide(); UI.openCat('animals', true); } } }),
      h('button.btn.sm.alt', { html: ic('pencil') + 'Rename', on: { click: function () { rn.style.display = rn.style.display === 'none' ? 'flex' : 'none'; inp.focus(); } } }),
      h('button.btn.sm.alt', { html: ic('target') + 'Centre', on: { click: function () { focusEnc(e); } } })));
    cur = {
      kind: 'enclosure', update: function () {
        var en = find(Z.state.enclosures, id); if (!en) return false;
        var r = Z.Sim.enclosureReport(id); if (!r) return false;
        f.sub.textContent = en.animals.length + ' animal' + (en.animals.length === 1 ? '' : 's') + ' · ' + en.area + ' tiles' + (en.viewTiles && en.viewTiles.length ? '' : ' · not visible from a path');
        env.set('clean', 1 - UI.clamp(en.poop / (en.area / 3 + 3), 0, 1)); env.set('food', en.foodLevel); env.set('water', en.waterLevel);
        var fn = D.fences.filter(function (x) { return x.strength === en.minFence; })[0];
        var worst = 0; en.species.forEach(function (s) { worst = Math.max(worst, UI.sp(s).minFence); });
        fenceTxt.innerHTML = '<span>Weakest fence strength</span><b style="color:' + (en.minFence < worst ? 'var(--bad)' : 'inherit') + '">' + en.minFence + (worst ? ' / needs ' + worst : '') + '</b>';
        var needCage = en.species.some(function (s) { return UI.sp(s).needsCage; });
        encTypeTxt.innerHTML = '<span>Enclosure type</span><b style="color:' + (needCage && !en.isCage ? 'var(--bad)' : 'inherit') + '">' + (en.isCage ? 'Roofed cage' : (needCage ? 'Open (needs roofed cage)' : 'Open-top')) + '</b>';
        var key = en.species.join(',') + '|' + en.animals.length + '|' + Object.keys(r.species).map(function (s) { return s + Math.round(r.species[s].suitability * 100); }).join(',');
        if (key !== spKey) {
          spKey = key; spBox.innerHTML = '';
          if (!en.species.length) spBox.appendChild(h('div.fact', { text: 'No animals live here yet. Choose an animal from the Animals tab and adopt it into this enclosure.' }));
          en.species.forEach(function (sid) {
            var sp = UI.sp(sid), s = r.species[sid], pct = Math.round(s.suitability * 100);
            var worstK = COMPS.map(function (c) { return [c[1], s.breakdown[c[0]]]; }).filter(function (c) { return c[1] < 0.75; }).sort(function (x, y) { return x[1] - y[1]; }).slice(0, 3).map(function (c) { return c[0] + ' ' + Math.round(c[1] * 100) + '%'; }).join(', ');
            spBox.appendChild(h('div.sp-row', h('div.sth', thumbBox('animal', sid, 64, sp.emoji)), h('div.sm', sp.name + ' × ' + s.count, h('small', { text: worstK ? 'Weak: ' + worstK : 'Everything it needs' })), h('div', { style: 'min-width:70px' }, h('div.num', { style: 'font:700 15px var(--serif);text-align:right;color:' + (pct >= 70 ? 'var(--good)' : pct >= 45 ? '#c88a10' : 'var(--bad)'), text: pct + '%' }), bar(s.suitability))));
          });
        }
        var issues = r.issues ? r.issues.slice() : [];
        var bp = (en.badPlants && en.badPlants.length) ? en.badPlants : (r.badPlants && r.badPlants.length ? r.badPlants : null);
        if (bp && bp.length) {
          var plantWarn = bp.length === 1 ? '1 plant is struggling on mismatched soil terrain' : bp.length + ' plants are struggling on mismatched soil terrain';
          if (issues.indexOf(plantWarn) < 0) issues.push(plantWarn);
        }
        if (!sameList(issKey, issues)) { issKey = issues.slice(); iss.innerHTML = ''; iss.appendChild(issuesList(issues, en.animals.length ? 'This enclosure is in good order' : 'Ready for its first residents')); }
        return true;
      }
    };
    cur.update(); return true;
  }
  Panel.showEnclosure = Panel.openEnclosure = openEnc;

  // ------------------------------------------------------------------ guest
  function openGuest(id) {
    var g = find(Z.state.guests, id); if (!g) return false;
    var f = frame(thumbBox('guest', g.seed % 997, 96, ''), g.name, ''), b = f.body;
    var th = h('div.thought', { text: '' }); b.appendChild(th);
    var br = bars([['hap', 'Happiness'], ['hun', 'Fed'], ['thi', 'Hydrated'], ['bla', 'Comfort'], ['ene', 'Energy'], ['fun', 'Entertained']]); b.appendChild(br.el);
    var kv = h('div.kv'), seen = h('div.chips'); b.appendChild(kv); b.appendChild(h('div.sect', { text: 'Animals seen' })); b.appendChild(seen);
    b.appendChild(h('div.btnrow', h('button.btn.sm', { html: ic('eye') + 'Follow', on: { click: function () { UI.startFollow('guest', id); } } })));
    var seenKey = null;
    cur = {
      kind: 'guest', update: function () {
        var q = find(Z.state.guests, id); if (!q) return false;
        f.sub.textContent = UI.stateText(q.state) + ' · ' + (q.group && q.group > 0 ? 'with a group' : 'visiting');
        th.textContent = q.thought ? '“' + q.thought + '”' : 'Enjoying the day.';
        br.set('hap', q.happiness / 100); br.set('hun', 1 - q.hunger / 100); br.set('thi', 1 - q.thirst / 100); br.set('bla', 1 - q.bladder / 100); br.set('ene', q.energy / 100); br.set('fun', (q.fun || 0) / 100);
        kv.innerHTML = '<span>In their pocket</span><b>' + fmt(q.money) + '</b>';
        var ks = Object.keys(q.seen || {}), key = ks.join(',');
        if (key !== seenKey) { seenKey = key; seen.innerHTML = ''; if (!ks.length) seen.appendChild(h('span.chip', { text: 'None yet' })); ks.forEach(function (s) { var sp = UI.sp(s); if (sp) seen.appendChild(h('span.chip', { text: sp.name })); }); }
        return true;
      }
    };
    cur.update(); return true;
  }

  // ------------------------------------------------------------------ staff
  function openStaff(id) {
    var s = find(Z.state.staff, id); if (!s) return false;
    var def = UI.byId(D.staff, s.type), f = frame(thumbBox('staff', s.type, 96, def.emoji), s.name, def.name), b = f.body;
    var task = h('div.thought', { text: '' }); b.appendChild(task);
    b.appendChild(h('div.kv', h('span', { text: 'Wage' }), h('b', { text: fmt(def['wage/day'] || def.wage) + ' / day' })));
    if (s.type === 'keeper' || s.type === 'vet') {
      var cov = Z.Sim.staffCoverage ? Z.Sim.staffCoverage() : { huts: [], clinics: [], stationTiles: 48, vetClinicTiles: 48 };
      var T2 = Z.TILE || 2, hubs = s.type === 'vet' ? (cov.clinics || []) : (cov.huts || []);
      if (hubs.length) try { Z.World.setPreview({ type: 'ranges', ranges: hubs.map(function (ht) { return { x: ht.x, z: ht.z, r: ht.radius * T2, col: s.type === 'vet' ? 0x58c7ff : 0x42f578, alpha: 0.55 }; }) }); } catch (e) { }
      b.appendChild(h('div.kv', h('span', { text: 'Dispatch' }), h('b', { text: 'Radio on call (reachable paths)' })));
      b.appendChild(h('div.kv', h('span', { text: s.type === 'vet' ? 'Vet clinics' : 'Keeper huts' }), h('b', { text: hubs.length ? hubs.length + ' (' + (s.type === 'vet' ? cov.vetClinicTiles : cov.stationTiles) + 't fast hub)' : 'None (standard speed)' })));
    }
    b.appendChild(h('div.fact', { text: def.effect }));
    b.appendChild(h('div.btnrow', h('button.btn.sm', { html: ic('eye') + 'Follow', on: { click: function () { UI.startFollow('staff', id); } } }),
      confirmBtn(ic('close') + 'Fire', 'Really fire?', function () { Z.Sim.fireStaff(id); UI.toast(s.name + ' has left the zoo.', 'info'); Panel.hide(); }, 'alt')));
    cur = { kind: 'staff', update: function () { var q = find(Z.state.staff, id); if (!q) return false; task.textContent = q.task || 'Getting started'; return true; } };
    cur.update(); return true;
  }

  // ------------------------------------------------------------------ objects (buildings / scenery)
  function openObject(id) {
    var o = find(Z.state.objects, id); if (!o) return false;
    var isB = o.kind === 'building', def = UI.byId(isB ? D.buildings : D.scenery, o.type);
    var subTitle = isB ? (def.rideKind === 'coaster' ? 'Rollercoaster' : ({ food: 'Food stall', drink: 'Drinks stall', toilet: 'Toilets', shop: 'Shop', ride: 'Ride', arcade: 'Arcade & game stall', info: 'Information', staff: 'Staff building' })[def.type] || '') : ({ tree: 'Tree', bush: 'Planting', rock: 'Rockwork', shelter: 'Shelter', deco: 'Decoration', toy: 'Enrichment' })[def.kind] || '';
    var f = frame(thumbBox(isB ? 'building' : 'scenery', o.type, 96, def.emoji), def.name, subTitle), b = f.body;
    var fp = Z.Sim.footprint(o.type, o.i, o.j, o.rot), tiles = []; if (fp) for (var a = 0; a < fp.w; a++) for (var c = 0; c < fp.h; c++) tiles.push({ i: fp.i0 + a, j: fp.j0 + c });
    if (tiles.length) {
      var pvSpec = { type: 'tiles', tiles: tiles, ok: true };
      if (isB && (o.type === 'keeper_hut' || o.type === 'vet_clinic') && fp) {
        var covR = Z.Sim.staffCoverage ? Z.Sim.staffCoverage() : { stationTiles: 48, vetClinicTiles: 48 };
        var stR = o.type === 'vet_clinic' ? covR.vetClinicTiles : covR.stationTiles;
        pvSpec.ranges = [{ x: fp.cx, z: fp.cz, r: stR * (Z.TILE || 2), col: o.type === 'vet_clinic' ? 0x58c7ff : 0x42f578 }];
      }
      Z.World.setPreview(pvSpec);
    }
    var st = h('div'), slider = null, pv = null, stats = h('div', { style: 'display:flex;flex-direction:column;gap:3px' });
    b.appendChild(st);
    if (isB && def.price > 0) {
      var max = Math.max(10, Math.round(def.price * 4)), step = def.price >= 10 ? 0.5 : 0.25;
      pv = h('b.num'); slider = h('input', { type: 'range', min: '0', max: String(max), step: String(step), value: String(o.price), 'aria-label': 'Price' });
      var pr = function () { slider.style.setProperty('--p', (slider.value / max * 100) + '%'); };
      slider.addEventListener('input', function () { Z.Sim.setPrice(id, +slider.value); pv.textContent = UI.fmt2(+slider.value); pr(); hint.textContent = priceHint(+slider.value, def.price); });
      var hint = h('div', { style: 'font-size:12px;color:var(--ink2)' });
      b.appendChild(h('div.kv', h('span', { text: 'Price per use' }), pv)); b.appendChild(slider); b.appendChild(hint);
      pv.textContent = UI.fmt2(o.price); pr(); hint.textContent = priceHint(o.price, def.price);
    }
    b.appendChild(stats);
    var refund = Math.floor(def.cost * 0.5);
    b.appendChild(h('div.btnrow', confirmBtn(ic('trash') + 'Demolish', 'Demolish for +' + fmt(refund) + '?', function () { Z.Sim.bulldoze(o.i, o.j); UI.snd('build'); Panel.hide(); }, 'alt')));
    var key = '';
    cur = {
      kind: 'object', update: function () {
        var q = find(Z.state.objects, id); if (!q) return false;
        var r = Z.Sim.objectReport(id); if (!r) return false;
        var pok = (Z.Sim && Z.Sim.plantOk ? Z.Sim.plantOk(id) : (r.thriving !== undefined ? r.thriving : null));
        var covO = isB && (q.type === 'keeper_hut' || q.type === 'vet_clinic') && Z.Sim.staffCoverage ? Z.Sim.staffCoverage() : null;
        var stCovN = covO && fp ? covO.enclosuresInRadius(fp.cx, fp.cz, q.type === 'vet_clinic' ? covO.vetClinicTiles : covO.stationTiles) : 0;
        var k = JSON.stringify([r.connected, r.uses, Math.round(r.income), r.queue, r.users, q.fill, r.thriving, r.thrivesOn, pok, stCovN]);
        if (k !== key) {
          key = k; stats.innerHTML = ''; var rows = [];
          if (isB) {
            if (def.type !== 'staff') {
              rows.push(['Visitors served', r.uses]); if (def.price > 0) rows.push(['Takings so far', fmt(r.income)]); rows.push(['In the queue', r.queue + (r.users ? ' (+' + r.users + ' being served)' : '')]);
              if (def.thrill > 0) rows.push(['Thrill rating', '★'.repeat(def.thrill)]);
            }
            if (q.type === 'keeper_hut' || q.type === 'vet_clinic') {
              var stT = covO ? (q.type === 'vet_clinic' ? covO.vetClinicTiles : covO.stationTiles) : 48;
              rows.push([q.type === 'vet_clinic' ? 'Clinic triage zone' : 'Dispatch hub zone', stT + ' tiles']);
              rows.push(['Enclosures in zone', stCovN]);
            }
            rows.push(['Running cost', fmt(r.upkeep) + ' / day']);
          } else { rows.push(['Beauty', '★'.repeat(def.aesthetic) + '☆'.repeat(Math.max(0, 5 - def.aesthetic))]); if (q.type === 'bin') rows.push(['Bin', Math.round((q.fill || 0) * 100) + '% full']); }
          rows.forEach(function (r2) { stats.appendChild(h('div.kv', h('span', { text: r2[0] }), h('b', { text: String(r2[1]) }))); });
          if (isB && (def.info || r.info)) stats.appendChild(h('div.fact', { text: def.info || r.info }));
          if (!isB) {
            var thriv = pok !== null ? pok : r.thriving;
            if (thriv === true) stats.appendChild(h('ul.issues', h('li.ok', { text: 'Thriving here' })));
            else if (thriv === false) stats.appendChild(issuesList(['Struggling on ' + ((r.terrainHere || r.terrainName || (D.terrain[Z.state.terrain[q.i + q.j * Z.N]] || {}).name || 'this ground')).toLowerCase() + (r.thrivesOn && r.thrivesOn.length ? ' - prefers ' + (r.thrivesOn.map(function (t) { var tt = UI.byId(D.terrain, t); return (tt ? tt.name : String(t)).toLowerCase(); }).join(', ')) : (def.terrains && def.terrains.length ? ' - prefers ' + def.terrains.map(function (t) { var tt = UI.byId(D.terrain, t); return (tt ? tt.name : String(t)).toLowerCase(); }).join(', ') : ''))]));
            if (def.info || r.info) stats.appendChild(h('div.fact', { text: def.info || r.info }));
          }
          if (isB) { if (r.connected) stats.appendChild(h('ul.issues', h('li.ok', { text: 'Connected to a path' }))); else stats.appendChild(issuesList(r.issues.length ? r.issues : ['Not connected to a path'])); }
        }
        return true;
      }
    };
    cur.update(); return true;
  }
  if (Z.Sim && !Z.Sim.plantOk) {
    Z.Sim.plantOk = function (objId) {
      var o = find(Z.state && Z.state.objects, objId); if (!o) return null;
      var d = UI.byId(D.scenery, o.type);
      if (!d || (d.kind !== 'tree' && d.kind !== 'bush') || !d.terrains) return null;
      var t = o.i + o.j * Z.N, tid = Z.state.terrain[t], tn = D.terrain[tid] ? D.terrain[tid].id : null;
      return d.terrains.indexOf(tn) >= 0;
    };
  }
  function priceHint(p, def) {
    var r = p / def;
    return r < 0.6 ? 'Bargain! Guests love it, but you will earn little.' : r <= 1.25 ? 'A fair price. Guests are happy to pay.' : r <= 1.6 ? 'A bit steep. Some guests will grumble.' : 'Too pricey! Many guests will walk away.';
  }

  // ------------------------------------------------------------------ species sheet
  Panel.closeSheet = function () { sheetEl.classList.remove('on'); sheetEl.innerHTML = ''; };
  Panel.species = function (id) {
    var sp = UI.sp(id), S = Z.state; if (!sp) return;
    var box = h('div.sbox'), locked = sp.star > S.unlocked.star;
    var top = h('div', { style: 'display:flex;gap:12px;align-items:center' },
      h('div', { style: 'width:104px;height:104px;border-radius:16px;background:radial-gradient(circle at 50% 35%,#fffdf2,var(--paper3));border:2px solid rgba(58,42,26,.25);flex:none;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:44px' }, thumbBox('animal', id, 192, sp.emoji)),
      h('div', { style: 'flex:1;min-width:0' }, h('h3.serif', { style: 'margin:0;font-size:24px;line-height:1.1', text: sp.name }),
        h('div', { style: 'font:700 18px var(--serif);color:var(--moss3);margin-top:3px', text: fmt(sp.cost) }),
        h('div', { style: 'font-size:12px;color:var(--ink2);margin-top:2px', text: fmt(sp.upkeep) + ' / day upkeep · ' + sp.diet })),
      h('button.x', { html: ic('close'), style: 'align-self:flex-start;width:40px;height:40px;margin:-4px -6px 0 0', 'aria-label': 'Close', on: { click: Panel.closeSheet } }));
    box.appendChild(top);
    box.appendChild(h('div.fact', { text: sp.fact }));
    box.appendChild(h('div.sect', { text: 'What it needs' }));
    var needs = h('div', { style: 'display:grid;grid-template-columns:auto 1fr;gap:6px 10px;font-size:13px;align-items:center' });
    function row(l, content) { needs.appendChild(h('span', { style: 'color:var(--ink2);font-weight:700', text: l })); needs.appendChild(content); }
    var tp = h('div.chips'); Object.keys(sp.terrainPrefs).sort(function (a, b) { return sp.terrainPrefs[b] - sp.terrainPrefs[a]; }).forEach(function (t) { var td = UI.byId(D.terrain, t); tp.appendChild(h('span.chip', { html: '<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + td.colour + ';border:1px solid rgba(0,0,0,.4);margin-right:4px"></i>' + td.name + ' ' + Math.round(sp.terrainPrefs[t] * 100) + '%' })); });
    row('Ground', tp);
    var fl = h('div.chips'); sp.foliage.forEach(function (s) { var sd = UI.byId(D.scenery, s); fl.appendChild(h('span.chip', { text: sd ? sd.name : s })); }); row('Plants', fl);
    row('Space', h('span', { text: sp.space + ' tiles each (' + (sp.space * 4) + ' m²)' }));
    row('Company', h('span', { text: sp.social[0] === sp.social[1] ? 'Lives alone' : 'In groups of ' + sp.social[0] + (sp.social[1] > 20 ? '+' : ' to ' + sp.social[1]) }));
    if (sp.companion) {
      var compSp = UI.sp(sp.companion);
      row('Companion', h('span', { style: 'font-weight:700;color:var(--moss3)', text: 'Must live with ' + (compSp ? compSp.name : sp.companion) }));
    }
    var fn = D.fences.slice().sort(function (a, b) { return a.cost - b.cost; }).filter(function (x) { return x.strength >= sp.minFence; })[0];
    row('Fence', h('span', { text: 'Strength ' + sp.minFence + '+ (' + fn.name.toLowerCase() + (sp.minFence > 1 ? ' or stronger' : '') + ')' }));
    if (sp.needsCage) row('Enclosure', h('span', { text: 'Roofed cage (Primate cage)' }));
    row('Extras', h('div.chips', sp.needsWater ? h('span.chip', { text: 'Pond or pool' }) : null, sp.needsShelter ? h('span.chip', { text: 'Shelter' }) : null, sp.needsRocks ? h('span.chip', { text: 'Rocks' }) : null, (!sp.needsWater && !sp.needsShelter && !sp.needsRocks) ? h('span.chip', { text: 'Nothing special' }) : null));
    row('Appeal', h('div', { style: 'display:flex;align-items:center;gap:8px' }, bar(sp.appeal / 60), h('b', { text: sp.appeal })));
    if (sp.diet === 'carnivore') {
      var compSpW = sp.companion ? UI.sp(sp.companion) : null;
      row('Warning', h('span', { style: 'color:var(--bad);font-weight:700', text: compSpW ? ('Predator. Only shares peacefully with ' + compSpW.name + '.') : 'Predator. Keep it apart from other species.' }));
    }
    else if (sp.danger >= 2) row('Warning', h('span', { style: 'color:#b06a10;font-weight:700', text: 'Dangerous. Use strong fences.' }));
    box.appendChild(needs);
    box.appendChild(h('div.sect', { text: 'Where shall it live?' }));
    var list = h('div', { style: 'display:flex;flex-direction:column;gap:6px' });
    var encs = S.enclosures.slice();
    if (!encs.length) list.appendChild(h('div.fact', { text: 'You have no enclosures yet. Open Fences, choose “Enclosure” and drag a rectangle on the grass.' }));
    encs.forEach(function (en) {
      var f = Z.Sim.suitabilityFor(en.id, id), pct = f ? Math.round(f.value * 100) : 0;
      var spot = findSpot(en, id), money = S.money >= sp.cost;
      var btn = h('button.btn.sm' + (spot.ok && money && !locked ? '' : '.dis'), { text: 'Adopt', on: { click: function () {
        var r = Z.Sim.addAnimal(id, spot.i, spot.j);
        if (r.ok) { UI.snd('cash'); UI.snd('call', id); Panel.closeSheet(); var an = Z.state.animals[Z.state.animals.length - 1]; UI.toast((an ? an.name : 'The ' + sp.name.toLowerCase()) + ' has arrived at ' + en.name + '!', 'good'); focusEnc(en, Math.min(Z.World.cam.dist, 45)); }
        else UI.toast(r.msg || 'Cannot adopt here', 'bad');
      } } });
      var msg = locked ? 'Needs a ' + sp.star + '-star zoo' : !spot.ok ? spot.msg : !money ? 'Not enough money' : (f && f.issues.length ? f.issues[0] : 'A fine home');
      list.appendChild(h('div.sp-row', { style: 'padding:7px 8px' }, h('div.sm', en.name, h('small', { text: msg })),
        h('div', { style: 'min-width:62px;text-align:center' }, h('div.num', { style: 'font:700 17px var(--serif);color:' + (pct >= 70 ? 'var(--good)' : pct >= 45 ? '#c88a10' : 'var(--bad)'), text: pct + '%' }), bar(f ? f.value : 0)), btn));
    });
    box.appendChild(list);
    box.appendChild(h('div.btnrow', { style: 'margin-top:4px' },
      h('button.btn.alt' + (locked ? '.dis' : ''), { html: ic('hand') + 'Place by tapping', on: { click: function () { Panel.closeSheet(); UI.Tools.start({ kind: 'animal', id: id, name: sp.name, def: sp }); UI.cat = null; } } }),
      h('button.btn.alt', { text: 'Close', on: { click: Panel.closeSheet } })));
    if (locked) box.insertBefore(h('div.bn.alert', { style: 'padding:6px;margin:0;animation:none', html: ic('lock') + ' Reach a ' + sp.star + '-star zoo to unlock the ' + sp.name.toLowerCase() }), box.children[1]);
    sheetEl.innerHTML = ''; sheetEl.appendChild(box); sheetEl.classList.add('on'); box.scrollTop = 0;
    UI.snd('call', id);
    if (UI.Tutorial) UI.Tutorial.onSheet && UI.Tutorial.onSheet(id);
  };
  function findSpot(en, species) {
    var tiles = en.tiles.slice(), best = null, fail = 'No room inside';
    // shuffle a bit, prefer central tiles
    for (var k = tiles.length - 1; k > 0; k--) { var j = (Math.random() * (k + 1)) | 0, t = tiles[k]; tiles[k] = tiles[j]; tiles[j] = t; }
    for (k = 0; k < tiles.length; k++) {
      var i = tiles[k] % N, jj = (tiles[k] / N) | 0, r = Z.Sim.addAnimal(species, i, jj, { dry: true });
      if (r.ok) return { ok: true, i: i, j: jj };
      if (r.msg && r.msg !== 'Something is in the way' && r.msg.indexOf("can't swim") < 0) { fail = r.msg; if (r.msg !== 'Not enough money') break; }
    }
    return { ok: false, msg: fail };
  }
})();
