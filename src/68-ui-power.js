// ===== 68-ui-power.js =====
// Power package, UI: HUD chip + popover, the Power tab (sources, priority, consumers, history), the Power build category,
// enclosure / object panel blocks and the coverage overlay toggle. All behaviour lives in Z.Power (25-sim-power.js).
// Hooks used: UI.extraTabs (53-screens), UI.extraCats (50-ui), UI.Power.encBlock / objectBlock (52-panels).
(function () {
  'use strict';
  var UI = Z.UI = Z.UI || {}, D = Z.DATA, h = UI.h, fmt = UI.fmt, ic = UI.ic;
  var PU = UI.Power = {};
  var css = '#pwchip{display:flex;align-items:center;gap:5px;padding:0 9px;cursor:pointer;min-width:0}#pwchip svg{width:17px;height:17px;flex:none;color:#e0a416}' +
    '#pwchip .pwb{width:34px;height:7px;border-radius:4px;background:rgba(0,0,0,.18);overflow:hidden;flex:none}#pwchip .pwb i{display:block;height:100%;background:#3f9a5a;transition:width .4s}' +
    '#pwchip .pwt{font:700 11px var(--sans);white-space:nowrap}#pwchip.pw-warn .pwb i{background:#e0a416}#pwchip.pw-bk svg{color:#e07a16}#pwchip.pw-bk .pwb i{background:#e07a16}' +
    '#pwchip.pw-out{background:#c2402f;color:#fff;animation:pwp 1.2s infinite}#pwchip.pw-out svg{color:#fff}#pwchip.pw-out .pwb i{background:#fff}' +
    '@keyframes pwp{50%{filter:brightness(1.25)}}' +
    '@media(max-width:820px){#pwchip{padding:0 7px;gap:3px}#pwchip .pwb{width:22px}#pwchip .pwt{display:none}}' +
    '#pwpop{position:fixed;z-index:30;display:none;padding:10px 12px;font-size:12.5px;line-height:1.35;max-width:330px;pointer-events:auto}#pwpop.on{display:block}' +
    '#pwpop b{font-weight:700}#pwpop .pph{display:flex;align-items:center;gap:8px;margin-bottom:6px}#pwpop .pph svg{width:22px;height:22px;color:#e0a416}' +
    '#pwpop .pbar,.pwbox .pbar{height:10px;border-radius:5px;background:rgba(0,0,0,.14);overflow:hidden;position:relative;margin:4px 0}' +
    '.pbar i{display:block;height:100%;background:#3f9a5a}.pbar.warn i{background:#e0a416}.pbar.bad i{background:#c2402f}.pbar u{position:absolute;top:0;bottom:0;width:2px;background:#222;opacity:.6}' +
    '#pwpop .prow,.pwbox .prow{display:flex;justify-content:space-between;gap:8px;padding:1px 0}#pwpop .pwarn,.pwbox .pwarn{color:var(--bad);margin:3px 0}#pwpop .pbtn{margin-top:6px}' +
    '.pwbox{margin:8px 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.08)}.pwbox h4{margin:0 0 6px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}' +
    '.pwsrc{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.06)}.pwsrc:last-child{border:0}.pwsrc .em{font-size:20px;width:26px;text-align:center}.pwsrc .nm{flex:1;min-width:0}.pwsrc .nm small{display:block;color:var(--ink2);font-size:11.5px}' +
    '.pwsrc .kw{font:700 12px var(--sans);white-space:nowrap}.pwsrc.off{opacity:.55}.pwsrc.cut .kw{color:var(--bad)}' +
    '.pwcls{border-radius:10px;border:1px solid rgba(0,0,0,.1);margin:6px 0;overflow:hidden}.pwcls .ch{display:flex;align-items:center;gap:8px;padding:7px 8px;background:rgba(0,0,0,.05)}.pwcls .ch .em{font-size:18px}.pwcls .ch .nm{flex:1;min-width:0;font-weight:700}.pwcls .ch .nm small{display:block;font-weight:500;color:var(--ink2);font-size:11.5px}' +
    '@media(max-width:820px){.pwcls .ch{flex-wrap:wrap}.pwcls .ch .nm{flex:1 1 60%}}' +
    '.pwcls.shed .ch{background:rgba(194,64,47,.14)}.pwcls .ch button{min-width:40px;min-height:40px}.pwcls .cb{padding:2px 8px 6px}.pwcon{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.05);font-size:12.5px;cursor:pointer}.pwcon:last-child{border:0}.pwcon .dot{width:9px;height:9px;border-radius:50%;background:#3f9a5a;flex:none}.pwcon.off .dot{background:#c2402f}.pwcon .nm{flex:1;min-width:0}.pwcon .nm small{color:var(--ink2);display:block;font-size:11px}' +
    '.pwhist{font-size:12.5px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.05)}.pwtag{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:700;background:rgba(0,0,0,.08);margin-left:6px}.pwtag.on{background:#e07a16;color:#fff}' +
    '.pwenc{margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(224,164,22,.12);border:1px solid rgba(224,164,22,.4);font-size:12.5px}.pwenc h4{margin:0 0 4px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}.pwenc .bad{color:var(--bad);font-weight:700}.pwenc .ok b{color:var(--good)}';
  var sty = document.createElement('style'); sty.setAttribute('data-power', '1'); sty.textContent = css; document.head.appendChild(sty);

  function S() { return Z.state; }
  function r0(v) { return Math.round(v); }
  function hrs(v) { v = Math.max(0, v); return v < 1 ? 'under an hour' : Math.round(v) + (Math.round(v) === 1 ? ' hour' : ' hours'); }
  var CAUSE = { storm: 'Storm damage', overload: 'Overload trip', breakdown: 'Generator failure', fuel: 'Fuel unpaid', event: 'Grid fault', sabotage: 'Sabotage', lightning: 'Lightning strike', strike: 'Lightning strike', manual: 'Test cut' };
  function causeName(c) { return CAUSE[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : ''); }
  function bar(sup, dem, cls) {
    var mx = Math.max(sup, dem, 1) * 1.15, el = h('div.pbar' + (cls ? '.' + cls : ''), h('i', { style: 'width:' + Math.min(100, Math.round(100 * sup / mx)) + '%' }), h('u', { style: 'left:' + Math.min(99, Math.round(100 * dem / mx)) + '%' }));
    return el;
  }
  function state() {
    var P = Z.Power; if (!P) return null;
    var st = P.status(), out = !!st.outage, bk = st.backup === 'running' || st.onBattery || (out && st.supply >= st.demand - 0.1);
    var cls = out && !bk ? 'out' : bk ? 'bk' : st.brownout ? 'warn' : '';
    return { st: st, out: out, cls: cls };
  }

  // ------------------------------------------------------------------ HUD chip + popover
  var el = {}, key = '', pinned = false;
  function renderChip(force) {
    var s = state(); if (!s) return;
    var st = s.st, k = [s.cls, r0(st.supply), r0(st.demand), st.outage ? 1 : 0, st.shedding.length].join('|');
    if (!force && k === key) { if (el.pop.classList.contains('on')) renderPop(); return; } key = k;
    el.chip.className = 'pill hud-cell' + (s.cls ? ' pw-' + s.cls : '');
    var frac = st.demand > 0 ? Math.min(1, st.supply / st.demand) : 1; el.fill.style.width = Math.round(frac * 100) + '%';
    el.txt.textContent = st.outage && !st.supply ? 'OUT' : r0(st.supply) + '/' + r0(st.demand) + ' kW';
    el.chip.setAttribute('aria-label', 'Power: ' + (s.out ? 'outage' : st.brownout ? 'strained' : 'ok') + ', ' + r0(st.supply) + ' of ' + r0(st.demand) + ' kilowatts');
    if (el.pop.classList.contains('on')) renderPop();
  }
  function renderPop() {
    var s = state(), P = Z.Power; if (!s) return; var st = s.st, rep = P.report(), p = el.pop;
    p.innerHTML = '';
    p.appendChild(h('div.pph', { html: ic('bolt') }, h('div', h('b', { text: s.out ? 'Power cut' : st.brownout ? 'Grid strained' : 'Power on' }), h('small', { style: 'display:block;color:var(--ink2)', text: s.out ? causeName(st.outage.cause) + ', about ' + hrs(Math.max(0, st.outage.eta - (S().day + S().time) ) * 24) + ' to go' : r0(st.supply) + ' kW supplied, ' + r0(st.demand) + ' kW wanted' }))));
    p.appendChild(bar(st.supply, st.demand, s.out ? 'bad' : st.brownout ? 'warn' : ''));
    if (st.capacity > 0) p.appendChild(h('div.prow', h('span', { text: 'Batteries' }), h('b', { text: r0(st.stored) + ' / ' + r0(st.capacity) + ' kWh' })));
    p.appendChild(h('div.prow', h('span', { text: 'Backup' }), h('b', { text: P.hasBackup() ? (st.backup === 'running' ? 'Running' : 'Ready') : 'None' })));
    if (st.shedding.length) p.appendChild(h('div.pwarn', { text: 'Shed: ' + st.shedding.map(function (c) { var d = D.power.classes.filter(function (x) { return x.id === c; })[0]; return d ? d.name : c; }).join(', ') }));
    if (rep.forecast) p.appendChild(h('div.pwarn', { text: rep.forecast + (P.hasBackup() ? '' : ' No backup generator: fences will go dead.') }));
    p.appendChild(h('button.btn.sm.pbtn', { html: ic('bolt') + 'Power screen', on: { click: function () { open(false); UI.snd('click'); UI.openModal('power'); } } }));
    place();
  }
  function place() {
    var r = el.chip.getBoundingClientRect(), w = Math.min(window.innerWidth - 12, 320);
    el.pop.style.width = w + 'px'; el.pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6)) + 'px'; el.pop.style.top = (r.bottom + 6) + 'px';
  }
  function open(on) { if (on) { renderPop(); } el.pop.classList.toggle('on', on); if (!on) pinned = false; }
  function initChip() {
    var anchor = document.getElementById('wxchip') || (UI.el && UI.el.clock); if (!anchor || el.chip) return false;
    el.fill = h('i'); el.txt = h('span.pwt');
    el.chip = h('button#pwchip.pill.hud-cell', { 'aria-label': 'Power', title: 'Power supply and demand', html: ic('bolt'), on: { click: function (e) { e.stopPropagation(); UI.snd('click'); pinned = !el.pop.classList.contains('on') || !pinned; open(pinned); } } });
    el.chip.appendChild(h('span.pwb', el.fill)); el.chip.appendChild(el.txt);
    el.pop = h('div#pwpop.pill', { role: 'dialog', 'aria-label': 'Power details' });
    anchor.parentNode.insertBefore(el.chip, anchor.nextSibling); UI.$('#ui').appendChild(el.pop);
    el.chip.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && !pinned) open(true); });
    el.chip.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !pinned) open(false); });
    document.addEventListener('pointerdown', function (e) { if (el.pop.classList.contains('on') && !el.pop.contains(e.target) && !el.chip.contains(e.target)) open(false); }, true);
    window.addEventListener('resize', function () { if (el.pop.classList.contains('on')) place(); });
    Z.bus.on('power', function () { renderChip(true); }); Z.bus.on('reset', function () { key = ''; renderChip(true); });
    setInterval(function () { if (Z.state && Z.Power) renderChip(); }, 1000);
    renderChip(true); return true;
  }
  var tries = 0; (function wait() { if (!initChip() && tries++ < 200) setTimeout(wait, 150); })();

  // ------------------------------------------------------------------ banners
  var lastOut = null;
  Z.bus.on('power', function (e) {
    if (!e) return;
    if (e.on === false && e.cause && lastOut !== e.cause + Math.floor(S().day)) {
      lastOut = e.cause + Math.floor(S().day);
      UI.banner({ title: 'Power cut', text: causeName(e.cause) + '. ' + (Z.Power.hasBackup() ? 'Backup generator is starting.' : 'Electric fences are dead. Check the enclosures.'), kind: 'alert', ms: 7000 }); UI.snd('bad');
    } else if (e.on === true && e.cause !== 'shed' && lastOut) { lastOut = null; UI.toast('Power restored', 'good'); }
  });
  Z.bus.on('eggLost', function () { UI.toast('An egg was lost in the blackout', 'bad'); });

  // ------------------------------------------------------------------ Power tab
  var ST = { open: {}, cov: false };
  function tab(b) {
    var P = Z.Power, wrap = h('div'); b.appendChild(wrap), sig = '';
    var sig = '';
    function upd() {
      var rep = P.report(), st = rep.status, k = JSON.stringify([rep.status, rep.sources.map(function (x) { return x.out + x.state; }), rep.prio, rep.cover, Object.keys(rep.consumers).map(function (c) { return rep.consumers[c].map(function (x) { return x.on ? 1 : 0; }).join(''); }), rep.history.length, rep.forecast]);
      if (k === sig) return; sig = k; wrap.innerHTML = '';
      var top = h('div.pwbox');
      top.appendChild(h('div', { style: 'display:flex;align-items:center;gap:10px' }, h('span', { html: ic('bolt'), style: 'width:30px;height:30px;color:#e0a416' }), h('div', { style: 'flex:1' }, h('b', { style: 'font-size:16px', text: st.outage ? 'Power cut: ' + causeName(st.outage.cause) : st.brownout ? 'Grid strained, shedding load' : 'Power is on' }), h('div', { style: 'font-size:12.5px;color:var(--ink2)', text: r0(st.supply) + ' kW supply, ' + r0(st.demand) + ' kW demand' + (st.capacity ? ', batteries ' + r0(st.stored) + '/' + r0(st.capacity) + ' kWh' : '') }))));
      top.appendChild(bar(st.supply, st.demand, st.outage ? 'bad' : st.brownout ? 'warn' : ''));
      if (rep.forecast) top.appendChild(h('div.pwarn', { text: rep.forecast + (P.hasBackup() ? '' : ' Build a backup generator and a battery bank.') }));
      if (rep.fuelDue > 0) top.appendChild(h('div.prow', h('span', { text: 'Fuel bill so far today' }), h('b', { text: fmt(rep.fuelDue) })));
      if (rep.mechanics !== undefined) top.appendChild(h('div.prow', h('span', { text: 'Mechanics on duty' }), h('b', { text: rep.mechanics + ' (fewer breakdowns, faster repairs)' })));
      top.appendChild(h('div.btnrow', { style: 'margin-top:8px' },
        h('button.btn.sm' + (ST.cov ? '.gold' : '.alt'), { html: ic('target') + (ST.cov ? 'Hide coverage' : 'Show coverage'), on: { click: function () { ST.cov = !ST.cov; Z.PowerWorld && Z.PowerWorld.setCoverage(ST.cov); sig = ''; upd(); UI.snd('click'); } } }),
        h('button.btn.sm.alt', { html: ic('hammer') + 'Build power', on: { click: function () { UI.closeModal(); UI.openCat('power', true); } } })));
      wrap.appendChild(top);

      var src = h('div.pwbox'); src.appendChild(h('h4', { text: 'Sources' }));
      rep.sources.forEach(function (s) {
        var stTxt = s.why || (s.state === 'run' ? 'Running' : s.state === 'charging' ? 'Charging' : s.state === 'cut' ? 'Cut' : s.state === 'broken' ? 'Broken down' : s.state === 'idle' ? 'Standing by' : s.state);
        src.appendChild(h('div.pwsrc' + (s.state === 'idle' || s.state === 'broken' || s.state === 'cut' ? '.off' : '') + (s.state === 'cut' || s.state === 'broken' ? '.cut' : ''), h('span.em', { text: s.emoji || '⚡' }), h('div.nm', s.name, h('small', { text: stTxt })), h('span.kw', { text: r0(s.out) + ' / ' + r0(s.kw) + ' kW' }),
          s.i ? h('button.btn.sm.alt', { html: ic('target'), 'aria-label': 'Show on map', on: { click: function () { UI.closeModal(); Z.World.focus(s.i * Z.TILE, s.j * Z.TILE, 30); } } }) : null));
      });
      if (rep.wind !== undefined) src.appendChild(h('div', { style: 'font-size:11.5px;color:var(--ink2);margin-top:4px', text: 'Sun ' + Math.round(rep.sun * 100) + '%, wind ' + Math.round(rep.wind * 100) + '%' + (rep.feather ? ' (turbines feathered)' : '') }));
      wrap.appendChild(src);

      var pri = h('div.pwbox'); pri.appendChild(h('h4', { text: 'Priority, top is kept longest' }));
      pri.appendChild(h('div', { style: 'font-size:12px;color:var(--ink2);margin-bottom:4px', text: 'When demand beats supply the bottom class is switched off first. Tick "Backup" for the classes the backup generator should cover.' }));
      rep.prio.forEach(function (cid, idx) {
        var cd = D.power.classes.filter(function (x) { return x.id === cid; })[0], list = rep.consumers[cid] || [], tot = 0, on = 0, shed = st.shedding.indexOf(cid) >= 0; list.forEach(function (c) { tot += c.kw; if (c.on) on++; });
        var open = ST.open[cid], head = h('div.ch', h('span.em', { text: cd.emoji }), h('div.nm', cd.name, h('small', { text: (shed ? 'Shed. ' : '') + list.length + ' consumers, ' + r0(tot) + ' kW' + (list.length ? ', ' + on + ' on' : '') })),
          h('button.btn.sm.alt', { 'aria-label': 'Higher priority', html: '▲', on: { click: function (e) { e.stopPropagation(); P.movePriority(cid, -1); UI.snd('click'); sig = ''; upd(); } } }),
          h('button.btn.sm.alt', { 'aria-label': 'Lower priority', html: '▼', on: { click: function (e) { e.stopPropagation(); P.movePriority(cid, 1); UI.snd('click'); sig = ''; upd(); } } }));
        var covOn = !!rep.cover[cid], bk = h('button.btn.sm' + (covOn ? '.gold' : '.alt'), { text: covOn ? 'Backup on' : 'Backup off', on: { click: function (e) { e.stopPropagation(); P.setBackupCover(cid, !covOn); UI.snd('click'); sig = ''; upd(); } } });
        head.insertBefore(bk, head.children[2]);
        head.addEventListener('click', function () { ST.open[cid] = !ST.open[cid]; sig = ''; upd(); });
        var box = h('div.pwcls' + (shed ? '.shed' : ''), head);
        if (open) {
          var cb = h('div.cb'); if (!list.length) cb.appendChild(h('div', { style: 'padding:6px 0;color:var(--ink2);font-size:12px', text: 'Nothing here yet.' }));
          list.slice(0, 40).forEach(function (c) {
            cb.appendChild(h('div.pwcon' + (c.on ? '' : '.off'), { on: { click: function () { if (c.kind === 'fence' || c.kind === 'virtual') { if (c.i) { UI.closeModal(); Z.World.focus(c.i * Z.TILE, c.j * Z.TILE, 30); } } else if (c.id) { UI.closeModal(); Z.World.focus((c.i + 1) * Z.TILE, (c.j + 1) * Z.TILE, 28); UI.Panel.open('object', c.id); } } } },
              h('i.dot'), h('span', { text: c.emoji || '' }), h('div.nm', c.name, h('small', { text: c.on ? 'On' : (c.why || 'Off') })), h('span', { style: 'font-weight:700', text: c.kw + ' kW' })));
          });
          box.appendChild(cb);
        }
        pri.appendChild(box);
      });
      wrap.appendChild(pri);

      var hist = h('div.pwbox'); hist.appendChild(h('h4', { text: 'Recent outages' }));
      if (!rep.history.length) hist.appendChild(h('div', { style: 'color:var(--ink2);font-size:12.5px', text: 'None so far. Touch wood.' }));
      rep.history.forEach(function (x) { hist.appendChild(h('div.pwhist', h('b', { text: 'Day ' + x.day }), ' ' + causeName(x.cause) + ', ' + hrs(x.hours) + (x.escapes ? ', ' + x.escapes + ' escape' + (x.escapes > 1 ? 's' : '') : ''), h('span.pwtag' + (x.backup ? '.on' : ''), { text: x.backup ? 'backup ran' : 'no backup' }))); });
      var stt = rep.stats; if (stt) hist.appendChild(h('div', { style: 'font-size:11.5px;color:var(--ink2);margin-top:4px', text: stt.outages + ' outages, ' + r0(stt.hoursOut) + ' hours dark, ' + stt.trips + ' overload trips, ' + stt.breakdowns + ' breakdowns' }));
      wrap.appendChild(hist);
    }
    upd(); return upd;
  }
  UI.extraTabs = (UI.extraTabs || []).concat([{ id: 'power', name: 'Power', icon: 'bolt', build: tab, before: 'guide' }]);

  // ------------------------------------------------------------------ build category
  function items() {
    var ids = ['substation', 'power_pylon', 'diesel_gen', 'solar_field', 'wind_turbine', 'battery_bank', 'backup_gen', 'geothermal_plant'], out = [];
    ids.forEach(function (id) { var d = UI.byId(D.buildings, id); if (d) out.push({ kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, fp: [d.w || 1, d.h || 1] }); });
    ['electric_light', 'electric_heavy'].forEach(function (id) { var d = UI.byId(D.fences, id); if (d) out.push({ kind: 'fence', id: id, name: d.name, cost: d.cost, unit: '/panel', def: d, star: d.star || 0, tip: d.info }); });
    out.push({ kind: 'powerview', id: 'coverage', name: 'Coverage', cost: 0, star: 0, emoji: '📡', priceHtml: ST.cov ? 'On' : 'Off', tip: 'Show which tiles each substation and pylon reaches.' });
    return out;
  }
  UI.extraCats = (UI.extraCats || []).concat([{ id: 'power', name: 'Power', icon: 'bolt', items: items, hint: 'Build a substation near buildings, then generators. Electric fences hold dinosaurs only while powered.' }]);
  var origCard = UI.onCard;
  UI.onCard = function (it, locked) {
    if (it.kind === 'powerview') { ST.cov = !ST.cov; Z.PowerWorld && Z.PowerWorld.setCoverage(ST.cov); UI.toast(ST.cov ? 'Coverage overlay on' : 'Coverage overlay off', 'info'); UI.refreshCards && UI.refreshCards(); return; }
    return origCard.apply(this, arguments);
  };

  // ------------------------------------------------------------------ panel blocks
  PU.encBlock = function (encId) {
    var box = h('div.pwenc'), key = '';
    function update() {
      var P = Z.Power, enc = null; Z.state.enclosures.forEach(function (e) { if (e.id === encId) enc = e; });
      var inf = enc && P ? P.fenceInfo(encId) : null; if (!inf) { box.style.display = 'none'; return; }
      var w = P.warnings(enc), k = JSON.stringify([w, inf]); if (k === key) return; key = k;
      box.style.display = ''; box.innerHTML = ''; box.appendChild(h('h4', { text: 'Electric fence' }));
      box.appendChild(h('div.' + (inf.dead ? 'bad' : 'ok'), inf.dead ? h('span', { text: inf.dead + ' panel' + (inf.dead > 1 ? 's' : '') + ' unpowered' }) : h('span', 'Live: ', h('b', { text: 'strength ' + inf.minNow }))));
      w.forEach(function (x) { box.appendChild(h('div' + (x.bad ? '.bad' : ''), { text: x.text })); });
    }
    update(); return { el: box, update: update };
  };
  PU.objectBlock = function (id) {
    var box = h('div.pwenc'), key = '';
    function update() {
      var i = Z.Power && Z.Power.objectInfo(id); if (!i) { box.style.display = 'none'; return; }
      var k = JSON.stringify(i); if (k === key) return; key = k; box.style.display = ''; box.innerHTML = '';
      if (i.kind === 'gen') {
        box.appendChild(h('h4', { text: i.genKind === 'backup' ? 'Backup generator' : 'Generator' }));
        box.appendChild(h('div.kv', h('span', { text: 'Capacity' }), h('b', { text: i.kw + ' kW' })));
        box.appendChild(h('div.kv', h('span', { text: 'Generating now' }), h('b', { text: r0(i.out) + ' / ' + r0(i.kw) + ' kW' })));
        var bad = i.state === 'broken' || i.state === 'nofuel' || i.state === 'tripped' || i.state === 'feathered';
        var stTxt = i.why || (i.state === 'run' ? 'Running' : i.state === 'standby' ? 'Standing by (runs when needed)' : i.state === 'idle' ? 'Idle' : i.state);
        box.appendChild(h('div.' + (bad ? 'bad' : i.state === 'run' ? 'ok' : ''), { text: stTxt }));
      } else if (i.kind === 'battery') {
        box.appendChild(h('h4', { text: 'Battery bank' }));
        box.appendChild(h('div.kv', h('span', { text: 'Unit capacity' }), h('b', { text: i.kwh + ' kWh (±' + i.rate + ' kW)' })));
        box.appendChild(h('div.kv', h('span', { text: 'Grid stored' }), h('b', { text: r0(i.stored) + ' / ' + r0(i.totalCap) + ' kWh' })));
        var bTxt = i.discharging ? 'Discharging to grid' : i.charging ? 'Charging from surplus' : i.stored >= i.totalCap - 0.5 ? 'Full' : i.stored <= 0.1 ? 'Empty' : 'Standing by';
        box.appendChild(h('div.' + (i.discharging || i.charging ? 'ok' : ''), { text: bTxt }));
      } else if (i.kind === 'node') {
        box.appendChild(h('h4', { text: 'Power relay' }));
        box.appendChild(h('div.kv', h('span', { text: 'Reach' }), h('b', { text: i.radius + ' tiles' })));
        box.appendChild(h('div.kv', h('span', { text: 'Consumers in range' }), h('b', { text: String(i.consumers) })));
        box.appendChild(h('div.' + (i.alive ? 'ok' : 'bad'), { text: i.alive ? 'Online' : 'Down: repair due in ' + i.etaHours + ' h' }));
        box.appendChild(h('div.btnrow', { style: 'margin-top:5px' }, h('button.btn.sm.alt', { html: ic('target') + (ST.cov ? 'Hide coverage' : 'Show coverage'), on: { click: function () { ST.cov = !ST.cov; Z.PowerWorld && Z.PowerWorld.setCoverage(ST.cov); key = ''; update(); UI.snd('click'); } } })));
      } else {
        box.appendChild(h('h4', { text: 'Power' }));
        box.appendChild(h('div.' + (i.powered ? 'ok' : 'bad'), h('span', { text: i.powered ? 'On, ' : 'Off (' + i.kw + ' kW): ' }), h('b', { text: i.powered ? i.kw + ' kW' : (i.why || 'no supply') })));
        if (!i.connected) box.appendChild(h('div.bad', { text: 'Not within reach of a substation or pylon.' }));
      }
    }
    update(); return { el: box, update: update };
  };
})();
