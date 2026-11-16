// ===== 56-research.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - research screen (Lab, Amber, Genomes, Equipment, Team, Splicing) and the result reveal cards. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, fmt = UI.fmt, D = Z.DATA;
  var Res = UI.Research = {}, R = null, SUBS = [['lab', 'Lab', 'flask'], ['amber', 'Amber', 'gem'], ['genomes', 'Genomes', 'dna'], ['equip', 'Equipment', 'gear'], ['team', 'Team', 'person'], ['splice', 'Splicing', 'dna']];
  var sub = 'lab', flow = null, spliceFlow = null, body = null, lastKey = '', unseen = 0, rootEl = null;

  function RS() { return Z.Sim.research; }
  function S() { return Z.state; }
  function sp(id) { return UI.byId(D.animals, id); }
  function site(id) { return UI.byId(D.sites, id); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function dots(n, max) { var s = ''; for (var i = 0; i < (max || 5); i++) s += '<i class="rd' + (i < n ? ' on' : '') + '"></i>'; return '<span class="rds">' + s + '</span>'; }
  function pips(skill) { var s = ''; for (var k = 1; k <= 5; k++) s += '<i class="pip' + (skill >= k ? ' on' : skill >= k - 0.5 ? ' half' : '') + '"></i>'; return '<span class="pips">' + s + '</span>'; }
  var GEM = ['#e8b84a', '#f2a81d', '#d96a0c'];
  function gem(grade, size) {
    var c = GEM[grade - 1] || GEM[0], n = grade || 1;
    return '<span class="gem g' + n + '" title="' + (D.grades[n - 1] || {}).name + ' amber" style="--gc:' + c + '">' + ic('gem') + '</span>';
  }
  function thumb(id, size, plain) {
    var d = h('div.rth'); UI.lazyThumb(d, 'animal', id, '', size || 96); if (!plain && RS().genomeInfo(id).genome <= 0) d.classList.add('sil'); return d;
  }
  function genome(id) { return RS().genomeInfo(id).genome; }
  function note(txt, kind) { return h('div.rnote' + (kind ? '.' + kind : ''), { text: txt }); }
  function fundNote(used) { return used > 0 ? h('div.fundnote', { text: fmt(used) + ' of this is paid by science donations' }) : null; }
  function whyRow(why, fix) { var r = h('div.rwhy', h('span', { text: why })); if (fix) r.appendChild(h('button.btn.sm.gold', { text: fix[0], on: { click: function () { UI.snd('click'); fix[1](); } } })); return r; }
  function labFix(sm) {
    if (!sm.labsBuilt) return ['Build a research lab', function () { UI.closeModal(); UI.openCat('sci', true); setTimeout(function () { var c = document.querySelector('#cards .card[data-id="research_lab"]'); if (c) c.click(); }, 60); }];
    return null;
  }

  // -------------------------------------------------------------- header
  function header(sm) {
    var st = !sm.labsBuilt ? ['No lab', 'bad'] : sm.labOfflineHours > 0 ? ['Sealed ' + Math.ceil(sm.labOfflineHours) + ' h', 'bad'] : sm.labOnline ? ['Lab online', 'good'] : ['Lab offline', 'bad'];
    return h('div.rhead',
      h('span.rchip.' + st[1], { text: st[0] }),
      h('span.rchip', { html: ic('vial') + sm.samples + '/' + sm.sampleCap + ' samples' }),
      h('span.rchip', { html: ic('person') + sm.freeScientists + '/' + sm.scientists + ' free' }),
      h('span.rchip' + (sm.funding > 0 ? '.fund' : ''), { html: ic('coin') + 'Donations ' + fmt(sm.funding) }));
  }

  // -------------------------------------------------------------- LAB
  function labTab(sm) {
    var c = h('div.rtab'), st = S(), r = st.research;
    if (!sm.labOnline) {
      var why = !sm.labsBuilt ? 'You have no research lab. Build one and join its entrance to a path.' : sm.labOfflineHours > 0 ? 'The lab is sealed for decontamination (' + Math.ceil(sm.labOfflineHours) + ' h left).' : 'The lab is not joined to a path. Lay a path at its entrance.';
      c.appendChild(whyRow(why, labFix(sm)));
    }
    if (flow) { c.appendChild(extractFlow()); return c; }
    // scientists
    c.appendChild(h('div.rsect', { text: 'Scientists' }));
    var sc = st.staff.filter(function (x) { return x.type === 'scientist'; });
    if (!sc.length) c.appendChild(note('No scientists yet. Hire one in the Team tab.'));
    sc.forEach(function (s) {
      var job = r.jobs.filter(function (j) { return j.staffId === s.id; })[0], frac = job ? 1 - job.t / job.total : 0;
      var xpNeed = 30 + (s.skill | 0) * 20;
      c.appendChild(h('div.rcard.sci',
        h('div.rrow', h('b', { text: s.name }), h('span', { html: pips(s.skill) + ' ' + (+s.skill).toFixed(1) })),
        h('div.rsub', { text: job ? (job.kind === 'splice' ? 'Splicing ' + (UI.byId(D.traits, job.trait) || {}).name + ' into ' + (sp(job.species) || {}).name : 'Extracting from ' + (site(job.site) || {}).name + ' amber') + ' - ' + Math.ceil(job.t) + ' h left' : 'Free. ' + (s.xp | 0) + ' xp' }),
        job ? h('div.rbar', h('i', { style: 'width:' + Math.round(frac * 100) + '%' })) : null,
        job ? h('div.rrow', h('button.btn.sm.alt', { text: 'Cancel', on: { click: function () { var x = RS().cancelJob(job.id); UI.toast(x.ok ? 'Experiment cancelled. The sample is back in the store.' : x.msg, x.ok ? 'info' : 'bad'); render(); } } })) : null));
    });
    // other jobs (splices without staff listed above are shown above too)
    // samples
    c.appendChild(h('div.rsect', { text: 'Samples awaiting extraction (' + sm.samples + '/' + sm.sampleCap + ')' }));
    if (!r.samples.length) { c.appendChild(note('No samples. Buy amber in the Amber tab or send an expedition.')); c.appendChild(h('button.btn.sm.gold', { html: ic('gem') + 'Browse amber', on: { click: function () { Res.open('amber'); } } })); }
    r.samples.forEach(function (smp) {
      var s0 = site(smp.site);
      c.appendChild(h('div.rcard.smp', h('div.rrow', h('span', { html: gem(smp.grade) + ' <b>' + (D.grades[smp.grade - 1] || {}).name + '</b> amber' + (smp.degraded ? ' (degraded)' : '') }), h('span.rsub', { text: s0 ? s0.name : smp.site })),
        h('div.rpool', { html: pool(RS().siteOdds(smp.site, smp.grade)) }),
        h('button.btn.sm' + (sm.freeScientists && sm.labOnline ? '.gold' : ''), { html: ic('dna') + 'Run extraction', on: { click: function () { UI.snd('click'); flow = { sample: smp.id, staff: null }; render(); } } })));
    });
    // log
    if (r.log && r.log.length) {
      c.appendChild(h('div.rsect', { text: 'Lab notebook' }));
      var lg = h('div.rlog'); r.log.slice(-6).reverse().forEach(function (e) { lg.appendChild(h('div.' + (e.kind || ''), { text: 'Day ' + e.day + ': ' + e.text })); }); c.appendChild(lg);
    }
    return c;
  }
  function pool(list) {
    return list.map(function (o) { var g = o.genome; return '<span class="rsp' + (g >= 99.9 ? ' done' : '') + (o.focus ? ' foc' : '') + '" title="' + o.name + '">' + (g > 0 ? o.name : '???') + ' ' + dots(o.rarity, 5) + ' <small>' + Math.round(o.share * 100) + '%' + (g > 0 ? ' (have ' + Math.round(g) + '%)' : '') + '</small></span>'; }).join('');
  }
  function oddsBar(a) {
    var seg = [['succ', a.success], ['con', a.contaminated || 0], ['salv', a.salvage || 0], ['crit', a.critical], ['fail', a.fail]];
    return h('div.obar', seg.map(function (x) { return x[1] > 0.004 ? h('i.' + x[0], { style: 'flex:' + x[1], title: x[0] }) : null; }));
  }
  function breakdown(list) { return h('div.rbd', list.map(function (x) { var v = Math.round(x.value * 1000) / 10; return h('div', h('span', { text: x.label }), h('b' + (v < 0 ? '.neg' : ''), { text: (v > 0 ? '+' : '') + v + '%' })); })); }
  function extractFlow() {
    var st = S(), smp = st.research.samples.filter(function (x) { return x.id === flow.sample; })[0];
    if (!smp) { flow = null; return labTab(RS().summary()); }
    var o = RS().extractionOdds(smp.id, flow.staff || undefined), c = h('div.rflow');
    c.appendChild(h('div.rrow', h('b.serif', { style: 'font-size:18px', text: 'Run extraction' }), h('button.x', { html: ic('close'), 'aria-label': 'Close', on: { click: function () { flow = null; render(); } } })));
    c.appendChild(h('div.rcard', h('div.rrow', h('span', { html: gem(smp.grade) + ' <b>' + (D.grades[smp.grade - 1] || {}).name + '</b> ' + (site(smp.site) || {}).name })), h('div.rpool', { html: pool(o.pool || RS().siteOdds(smp.site, smp.grade)) })));
    var free = st.staff.filter(function (x) { return x.type === 'scientist' && !st.research.jobs.some(function (j) { return j.staffId === x.id; }); });
    var sg = h('div.seg.wrap'); sg.appendChild(h('button' + (!flow.staff ? '.on' : ''), { text: 'Auto', on: { click: function () { flow.staff = null; render(); } } }));
    free.forEach(function (s) { sg.appendChild(h('button' + (flow.staff === s.id ? '.on' : ''), { html: s.name.replace(/^Dr /, '') + ' ' + pips(s.skill), on: { click: function () { flow.staff = s.id; render(); } } })); });
    c.appendChild(h('div.rsub', { text: 'Scientist' })); c.appendChild(sg);
    c.appendChild(h('div.oddscard', oddsBar(o),
      h('div.orow', h('span.l.succ', { text: 'Success ' + pct(o.success) }), h('span.l.fail', { text: 'Fail ' + pct(o.fail + (o.salvage || 0) + (o.contaminated || 0)) }), h('span.l.crit', { text: 'Critical ' + pct(o.critical) })),
      breakdown(o.breakdown || []),
      o.salvage > 0 ? h('div.rsub', { text: 'Cryo store may salvage a failed sample: ' + pct(o.salvage) }) : null,
      h('div.rrow', h('span', { text: 'Reagents' }), h('b', { text: fmt(o.cost) })),
      h('div.rrow', h('span', { text: 'Time' }), h('b', { text: Math.round(o.hours) + ' game hours' })),
      o.gainTypical ? h('div.rrow', h('span', { text: 'Typical gain' }), h('b', { text: '+' + Math.round(o.gainTypical) + '% genome' })) : null,
      fundNote(o.fundingUsed),
      h('div.rsub', { text: 'A critical failure seals the lab for 24 h and costs a clean-up bill.' })));
    if (!o.canStart) c.appendChild(whyRow(o.why, labFix(RS().summary())));
    c.appendChild(h('div.btnrow', h('button.btn.gold' + (o.canStart ? '' : '.dis'), { html: ic('flask') + 'Start', on: { click: function () {
      var r = RS().startExtraction(smp.id, flow.staff || undefined);
      if (r.ok) { UI.snd('cash'); UI.toast('Extraction started (' + Math.round(r.hours) + ' h).', 'good'); flow = null; if (UI.Tutorial && UI.Tutorial.onExtract) UI.Tutorial.onExtract(); render(); } else { UI.snd('bad'); UI.toast(r.msg || 'Cannot start', 'bad'); }
    } } }), h('button.btn.alt', { text: 'Cancel', on: { click: function () { flow = null; render(); } } })));
    return c;
  }

  // -------------------------------------------------------------- AMBER
  function amberTab(sm) {
    var c = h('div.rtab'), st = S(), r = st.research;
    c.appendChild(h('div.rsect', { text: 'Amber market' }));
    c.appendChild(h('div.rcap', h('div.rbar', h('i', { style: 'width:' + Math.round(sm.samples / sm.sampleCap * 100) + '%' })), h('span', { text: sm.samples + '/' + sm.sampleCap + ' in the sample store' })));
    if (!r.market.length) c.appendChild(note('No lots today. The market refreshes every couple of days.'));
    r.market.forEach(function (lot) {
      var s0 = site(lot.site), full = sm.samples >= sm.sampleCap, can = st.money + sm.funding >= lot.price && !full;
      c.appendChild(h('div.rcard.lot',
        h('div.rrow', h('span', { html: gem(lot.grade) + ' <b>' + (D.grades[lot.grade - 1] || {}).name + '</b> amber' }), h('b.num', { text: fmt(lot.price) })),
        h('div.rsub', { text: (s0 ? s0.name : lot.site) + ' - gone in ' + Math.max(0, Math.ceil(lot.exp - st.day)) + ' day(s)' }),
        h('div.rsub', { text: 'Possible species:' }),
        h('div.rpool', { html: pool(RS().siteOdds(lot.site, lot.grade)) }),
        h('button.btn.sm' + (can ? '' : '.dis'), { html: ic('coin') + (full ? 'Store full' : 'Buy'), on: { click: function () {
          var b = RS().buyLot(lot.id); if (b.ok) { UI.snd('cash'); UI.toast('Bought ' + (D.grades[lot.grade - 1] || {}).name.toLowerCase() + ' amber from ' + (s0 || {}).name, 'good'); if (UI.Tutorial && UI.Tutorial.onBuyAmber) UI.Tutorial.onBuyAmber(); render(); } else { UI.snd('bad'); UI.toast(b.msg, 'bad'); }
        } } })));
    });
    c.appendChild(h('div.rsect', { text: 'Expeditions' }));
    c.appendChild(note('Send a team to dig at a site. They return in a few days with 3 to 5 samples.'));
    RS().sites().forEach(function (s0) {
      var info = RS().expeditionInfo(s0.id), job = r.jobs.filter(function (j) { return j.kind === 'expedition' && j.site === s0.id; })[0];
      var locked = !s0.unlocked;
      c.appendChild(h('div.rcard.site' + (locked ? '.lock' : ''),
        h('div.rrow', h('b', { text: s0.name }), locked ? h('span.lk', { html: ic('lock') + 'needs ★' + s0.star }) : h('span.rsub', { text: 'from ' + fmt(s0.basePrice) })),
        h('div.rsub', { text: s0.blurb }),
        h('div.rpool', { html: s0.species.map(function (id) { var g = genome(id); return '<span class="rsp' + (g >= 99.9 ? ' done' : '') + '">' + (g > 0 ? sp(id).name : '???') + ' ' + dots(sp(id).rarity, 5) + '</span>'; }).join('') }),
        job ? h('div', h('div.rbar', h('i', { style: 'width:' + Math.round((1 - job.t / job.total) * 100) + '%' })), h('div.rsub', { text: 'Team digging: ' + Math.ceil(job.t / 24) + ' day(s) left' }))
          : locked ? null : h('div', h('div.rrow', h('span', { text: info.days + ' days, ' + info.samples[0] + '-' + info.samples[1] + ' samples' }), h('b', { text: fmt(info.cost) })), fundNote(info.fundingUsed),
            !info.canStart && info.why ? h('div.rsub.bad', { text: info.why }) : null,
            h('button.btn.sm' + (info.canStart ? '.gold' : '.dis'), { html: ic('mount') + 'Send expedition', on: { click: function () { var x = RS().startExpedition(s0.id); if (x.ok) { UI.snd('cash'); UI.toast('Expedition sent to ' + s0.name, 'good'); render(); } else UI.toast(x.msg, 'bad'); } } }))));
    });
    return c;
  }

  // -------------------------------------------------------------- GENOMES
  function genomeBar(g) { return UI.genomeBar(g, false); }
  function genomesTab(sm) {
    var c = h('div.rtab'), grid = h('div.rgrid'), foc = sm.focus;
    c.appendChild(note('Raise a genome to 50% to hatch it. Reach 80% to splice in traits. Tap a card for details.'));
    var list = D.animals.map(function (a) { return { a: a, g: RS().genomeInfo(a.id), h: RS().hatchOdds(a.id) }; }).sort(function (x, y) { return y.g.genome - x.g.genome || x.a.rarity - y.a.rarity; });
    list.forEach(function (x) {
      var g = x.g.genome, known = g > 0, trs = (x.g.traits || []).map(function (t) { return (UI.byId(D.traits, t) || {}).name; }).join(', ');
      var card = h('div.rcard.gcard' + (g >= 50 ? '' : '.lockd'), { on: { click: function () { UI.snd('click'); UI.Panel.species(x.a.id); } } },
        thumb(x.a.id, 96), h('div.gi', h('b', { text: known ? x.a.name : '???' }), h('span.rsub', { html: known ? x.a.period + ' ' + dots(x.a.rarity, 5) : (site(x.a.site) || {}).name }),
          h('div.genrow', genomeBar(g), h('b.num', { text: Math.round(g) + '%' })),
          g >= 50 ? h('span.rsub', { text: 'Hatch ' + pct(x.h.chance) + (x.h.guaranteed ? ' (guaranteed)' : '') }) : h('span.rsub', { text: 'Needs 50% to hatch' }),
          trs ? h('span.rsub', { text: 'Traits: ' + trs }) : null,
          g > 0 && g < 100 ? h('button.focbtn' + (foc === x.a.id ? '.on' : ''), { html: ic('star') + (foc === x.a.id ? 'Focus' : 'Focus?'), title: 'Make this species more likely in extractions', on: { click: function (e) { e.stopPropagation(); RS().setFocus(foc === x.a.id ? null : x.a.id); UI.snd('click'); render(); } } }) : null));
      grid.appendChild(card);
    });
    c.appendChild(grid); return c;
  }

  // -------------------------------------------------------------- EQUIPMENT
  function equipTab(sm) {
    var c = h('div.rtab');
    RS().equipment().forEach(function (e) {
      var lv = ''; for (var i = 0; i < e.max; i++) lv += '<i class="rd' + (i < e.level ? ' on' : '') + '"></i>';
      c.appendChild(h('div.rcard.equip',
        h('div.rrow', h('b', { html: (e.emoji || '') + ' ' + e.name }), h('span.rds', { html: lv })),
        h('div.rsub', { text: e.effect }), h('div.rsub', { text: e.detail }),
        e.next ? h('div', h('div.rrow', h('span', { text: 'Level ' + (e.level + 1) + (e.next.star ? '  (needs ★' + e.next.star + ')' : '') }), h('b', { text: fmt(e.next.cost) })),
          !e.canBuy && e.why ? h('div.rsub.bad', { text: e.why }) : null,
          h('button.btn.sm' + (e.canBuy ? '.gold' : '.dis'), { html: ic('coin') + 'Upgrade', on: { click: function () { var x = RS().buyEquipment(e.id); if (x.ok) { UI.snd('cash'); UI.toast(e.name + ' upgraded', 'good'); render(); } else UI.toast(x.msg, 'bad'); } } }))
          : h('div.rsub', { text: 'Fully upgraded' })));
    });
    return c;
  }

  // -------------------------------------------------------------- TEAM
  function teamTab(sm) {
    var c = h('div.rtab'), st = S(), r = st.research;
    c.appendChild(h('div.rsect', { text: 'Your scientists (' + sm.scientists + '/' + sm.capacity + ' desks)' }));
    st.staff.filter(function (x) { return x.type === 'scientist'; }).forEach(function (s) {
      c.appendChild(h('div.rcard', h('div.rrow', h('b', { text: s.name }), h('span', { html: pips(s.skill) + ' ' + (+s.skill).toFixed(1) })), h('div.rrow', h('span.rsub', { text: fmt(s.wage) + ' / day, ' + (s.xp | 0) + ' xp' }),
        h('button.btn.sm.alt', { text: 'Fire', on: { click: function () { var b = this; if (!b._a) { b._a = 1; b.textContent = 'Really?'; setTimeout(function () { b._a = 0; b.textContent = 'Fire'; }, 2500); } else { Z.Sim.fireStaff(s.id); render(); } } } }))));
    });
    c.appendChild(h('div.rsect', { text: 'Candidates' }));
    if (!sm.labsBuilt || sm.scientists >= sm.capacity) c.appendChild(note(!sm.labsBuilt ? 'Build a research lab to hire scientists.' : 'All desks are taken. Upgrade the lab bench for another desk or build a second lab.', 'warn'));
    r.candidates.forEach(function (cd) {
      var dry = RS().hireScientist(cd.id, { dry: true });
      c.appendChild(h('div.rcard', h('div.rrow', h('b', { text: cd.name }), h('span', { html: pips(cd.skill) + ' ' + cd.skill.toFixed(1) })), h('div.rrow', h('span.rsub', { text: fmt(cd.wage) + ' / day, hiring fee ' + fmt(cd.hireCost) }),
        h('button.btn.sm' + (dry.ok ? '.gold' : '.dis'), { text: 'Hire', on: { click: function () { var x = RS().hireScientist(cd.id); if (x.ok) { UI.snd('cash'); UI.toast(cd.name + ' joined the lab', 'good'); render(); } else UI.toast(x.msg, 'bad'); } } })),
        !dry.ok ? h('div.rsub.bad', { text: dry.msg }) : null));
    });
    c.appendChild(note('New candidates arrive every 3 days (next on day ' + sm.nextCandidateDay + ').'));
    return c;
  }

  // -------------------------------------------------------------- SPLICE
  function spliceTab(sm) {
    var c = h('div.rtab'), elig = D.animals.filter(function (a) { return genome(a.id) >= 80; });
    if (!elig.length) { c.appendChild(note('Splicing opens when a genome reaches 80%.')); return c; }
    c.appendChild(note('Splice a trait into a species. A critical failure costs 3-6% genome.'));
    elig.forEach(function (a) {
      var gi = RS().genomeInfo(a.id), card = h('div.rcard', h('div.rrow', h('b', { text: a.name }), h('span.rsub', { text: Math.round(gi.genome) + '% genome' })));
      D.traits.forEach(function (t) {
        var has = (gi.traits || []).indexOf(t.id) >= 0, o = RS().spliceOdds(a.id, t.id);
        card.appendChild(h('div.trow', h('div', h('b', { text: t.name }), h('div.rsub', { text: t.effect })),
          has ? h('span.rsub', { text: 'Installed' }) : h('div.tr', h('span', { text: pct(o.success) + ' / ' + fmt(o.cost) }), h('button.btn.sm' + (o.canStart ? '.gold' : '.dis'), { text: 'Splice', on: { click: function () { spliceFlow = { s: a.id, t: t.id }; render(); } } }))));
      });
      c.appendChild(card);
    });
    if (spliceFlow) {
      var o = RS().spliceOdds(spliceFlow.s, spliceFlow.t), tr = UI.byId(D.traits, spliceFlow.t), box = h('div.rflow');
      box.appendChild(h('b.serif', { style: 'font-size:17px', text: 'Splice ' + tr.name + ' into ' + sp(spliceFlow.s).name })); box.appendChild(h('div.oddscard', oddsBar(o), h('div.orow', h('span.l.succ', { text: 'Success ' + pct(o.success) }), h('span.l.fail', { text: 'Fail ' + pct(o.fail) }), h('span.l.crit', { text: 'Setback ' + pct(o.critical) })), breakdown(o.breakdown || []),
        h('div.rrow', h('span', { text: 'Cost' }), h('b', { text: fmt(o.cost) })), h('div.rrow', h('span', { text: 'Time' }), h('b', { text: Math.round(o.hours) + ' h' })), fundNote(o.fundingUsed)));
      if (!o.canStart) box.appendChild(whyRow(o.why));
      box.appendChild(h('div.btnrow', h('button.btn.gold' + (o.canStart ? '' : '.dis'), { text: 'Start splice', on: { click: function () { var x = RS().startSplice(spliceFlow.s, spliceFlow.t); if (x.ok) { UI.toast('Splice started', 'good'); spliceFlow = null; render(); } else UI.toast(x.msg, 'bad'); } } }), h('button.btn.alt', { text: 'Cancel', on: { click: function () { spliceFlow = null; render(); } } })));
      c.insertBefore(box, c.firstChild);
    }
    return c;
  }

  // -------------------------------------------------------------- shell
  function visibleSubs() { return SUBS.filter(function (s) { return s[0] !== 'splice' || D.animals.some(function (a) { return genome(a.id) >= 80; }); }); }
  function stateKey() {
    var sm = RS().summary(), r = S().research;
    return JSON.stringify([sub, !!flow, flow && flow.staff, !!spliceFlow, sm.labOnline, Math.round(sm.labOfflineHours), sm.samples, sm.freeScientists, sm.scientists, sm.funding, r.jobs.map(function (j) { return j.id + ':' + Math.ceil(j.t); }), r.market.length, r.market.map(function (m) { return m.id; }), r.candidates.map(function (m) { return m.id; }), Math.floor(S().money / 250), sm.focus, S().day, sm.eggs]);
  }
  function render() {
    if (!body || !body.isConnected) return;
    var sm = RS().summary(), keep = body.scrollTop;
    body.innerHTML = '';
    var vs = visibleSubs(); if (!vs.some(function (s) { return s[0] === sub; })) sub = 'lab';
    var bar = h('div.rsubs');
    vs.forEach(function (s) {
      var b = h('button' + (s[0] === sub ? '.on' : ''), { html: ic(s[2]) + '<span>' + s[1] + '</span>', on: { click: function () { UI.snd('click'); sub = s[0]; flow = null; spliceFlow = s[0] === 'splice' ? spliceFlow : null; render(); body.scrollTop = 0; } } });
      if (s[0] === 'lab' && sm.samples > 0 && sm.freeScientists > 0 && sm.labOnline) b.appendChild(h('i.bdg', { text: '!' }));
      bar.appendChild(b);
    });
    body.appendChild(bar); body.appendChild(header(sm));
    var t = ({ lab: labTab, amber: amberTab, genomes: genomesTab, equip: equipTab, team: teamTab, splice: spliceTab })[sub];
    body.appendChild(t(sm));
    body.scrollTop = keep; lastKey = stateKey();
  }
  Res.build = function (b) {
    body = b; unseen = 0; updBadge(); render();
    return function () { if (!body || !body.isConnected) return; var k = stateKey(); if (k !== lastKey) render(); };
  };
  Res.open = function (tab, arg) {
    if (tab) { sub = tab; flow = null; }
    if (UI.Tools && UI.tool) UI.Tools.cancel();
    if (UI.Panel) { UI.Panel.hide(true); UI.Panel.closeSheet(); }
    UI.openModal('res'); if (UI.Tutorial && UI.Tutorial.onResearch) UI.Tutorial.onResearch(sub);
  };
  Res.tab = function () { return sub; };

  // -------------------------------------------------------------- HUD badge
  var badgeKey = '';
  function updBadge() {
    if (!UI.el || !UI.el.bResBadge) return;
    var sm = RS().summary(), waiting = sm.labOnline && sm.freeScientists > 0 && sm.samples > 0 && !S().research.jobs.some(function (j) { return j.kind === 'extract'; });
    var txt = unseen > 0 ? String(unseen) : waiting ? String(sm.samples) : '';
    if (txt === badgeKey) return; badgeKey = txt;
    UI.el.bResBadge.textContent = txt; UI.el.bResBadge.style.display = txt ? '' : 'none';
    UI.el.bRes.classList.toggle('pulse', !!txt);
  }
  Res.tick = function () { try { updBadge(); } catch (e) { } };

  // -------------------------------------------------------------- reveal cards
  var queue = [], cardEl = null, cardTimer = 0;
  function ensureLayer() { if (rootEl) return; rootEl = h('div#reveal'); document.getElementById('ui').appendChild(rootEl); }
  var SHARDS = '<svg viewBox="0 0 80 80" width="84" height="84"><g stroke="#5a3306" stroke-width="2" stroke-linejoin="round"><path d="M40 8l14 18-12 6z" fill="#f2a81d"/><path d="M54 26l16 12-18 10z" fill="#d98a10"/><path d="M42 32l10 16-20 8z" fill="#ffd36a"/><path d="M14 36l20-6 8 26z" fill="#e8b84a"/><path d="M32 56l24-8-6 22z" fill="#b86a0a"/><path d="M20 58l12-2 6 14z" fill="#f2a81d"/></g></svg>';
  var HAZARD = '<svg viewBox="0 0 80 80" width="84" height="84"><path d="M40 8L74 68H6z" fill="#ffd23a" stroke="#3b2204" stroke-width="4" stroke-linejoin="round"/><path d="M40 28v22M40 58v2" stroke="#3b2204" stroke-width="6" stroke-linecap="round"/></svg>';
  function push(card) { queue.push(card); if (!cardEl) next(); }
  function next() {
    ensureLayer(); clearTimeout(cardTimer);
    var c = queue.shift(); if (!c) { cardEl = null; rootEl.innerHTML = ''; return; }
    rootEl.innerHTML = '';
    var art = h('div.rv-art');
    if (c.species) art.appendChild(thumb(c.species, 128, c.plain)); else art.innerHTML = c.svg || '';
    var el = h('div.rvcard.' + c.cls,
      h('button.x', { html: ic('close'), 'aria-label': 'Dismiss', on: { click: function () { UI.snd('click'); next(); } } }),
      h('div.vial', { html: '<svg viewBox="0 0 40 60" width="46" height="70"><rect x="12" y="2" width="16" height="6" rx="2" fill="#8a6a3a"/><path d="M14 8h12v32a6 6 0 01-12 0z" fill="#fffbe8" stroke="#3b2204" stroke-width="2"/><path d="M14 30h12v10a6 6 0 01-12 0z" fill="#f2a81d"/></svg>' }),
      h('div.rv-body', art, h('div.rv-t', { text: c.title }), h('div.rv-s', { text: c.text }), c.more ? h('div.rv-s.sm', { text: c.more }) : null,
        c.open ? h('button.btn.sm.gold', { text: c.open[0], on: { click: function () { next(); c.open[1](); } } }) : null),
      queue.length ? h('div.rv-q', { text: '+' + queue.length + ' more' }) : null);
    cardEl = el; rootEl.appendChild(el);
    cardTimer = setTimeout(next, queue.length ? 7000 : 16000);
  }
  function hook() {
    var b = Z.bus;
    function seen() { if (!UI.modalOpen || !UI.modalOpen()) unseen++; updBadge(); render(); }
    b.on('research', function () { if (body && body.isConnected) render(); updBadge(); });
    b.on('market', function () { if (body && body.isConnected) render(); });
    b.on('experiment', function (e) {
      if (!e) return; var spd = e.species && sp(e.species); seen();
      var o = e.outcome;
      if (o === 'success') push({ cls: 'good', species: e.species, title: e.sold ? 'Genome already complete' : '+' + Math.round(e.gain) + '% ' + spd.name + ' genome', text: e.sold ? 'You sold the data to museums for ' + fmt(e.sold) + '.' : 'Now ' + Math.round(e.genome) + '% complete.' + (e.genome >= 50 && e.genome - e.gain < 50 ? ' It can now hatch!' : ''), open: ['See genomes', function () { Res.open('genomes'); }] });
      else if (o === 'contaminated') push({ cls: 'neutral', svg: SHARDS, title: 'Contaminated sample', text: 'Only insect DNA. Harmless, but no gain.', more: e.pity ? 'Lessons learned: next try is a little luckier.' : '' });
      else if (o === 'critical') push({ cls: 'bad', svg: HAZARD, title: 'Containment breach!', text: 'The lab is sealed for 24 hours. Clean-up bill ' + fmt(e.bill || 0) + '.' });
      else if (o === 'salvaged') push({ cls: 'neutral', svg: SHARDS, title: 'Failed, but salvaged', text: 'The cryo store saved a degraded sample.', more: 'Lessons learned: next try is a little luckier.' });
      else push({ cls: 'bad', svg: SHARDS, title: 'The amber shattered', text: 'No usable DNA this time.', more: e.pity ? 'Lessons learned: +' + Math.min(20, e.pity * 5) + '% on the next extraction.' : '' });
    });
    b.on('unlock', function (e) { if (e && e.species) { var s = sp(e.species); UI.banner({ title: 'New species: ' + s.name, text: 'Genome 50%. You can now hatch it.', kind: 'good', jump: function () { Res.open('genomes'); } }); UI.snd('unlock'); } });
    b.on('hatch', function (e) {
      if (!e) return; var egg = e.egg || {}; var spd = sp(egg.species); seen();
      if (e.ok) push({ cls: 'good', species: egg.species, plain: true, title: 'A ' + (spd ? spd.name : 'dinosaur') + ' hatched!', text: 'It has joined your park.', open: ['Find it', function () { if (e.animal) UI.jumpTo('animal', e.animal.id); }] });
      else push({ cls: 'bad', svg: SHARDS, title: 'The egg did not hatch', text: '30% of the cost was refunded (' + fmt(e.refund || 0) + ').' });
    });
    b.on('expedition', function (e) { if (!e) return; seen(); push({ cls: 'good', svg: ic('mount'), title: 'Expedition returned', text: (e.samples ? e.samples.length : 0) + ' samples from ' + ((site(e.site) || {}).name || 'the field') + '.' + (e.lost ? ' Some were lost.' : ''), open: ['Open lab', function () { Res.open('lab'); }] }); });
    b.on('grant', function (e) { if (e) UI.toast('A research grant of ' + fmt(e.amount) + ' arrived.', 'money'); });
    b.on('reset', function () { queue = []; cardEl = null; clearTimeout(cardTimer); if (rootEl) rootEl.innerHTML = ''; flow = null; spliceFlow = null; unseen = 0; badgeKey = ''; });
  }
  Res.init = function () { hook(); ensureLayer(); };
})();
