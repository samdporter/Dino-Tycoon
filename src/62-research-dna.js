// ===== 62-research-dna.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - DNA package, UI side: sequencing bench (Lab tab), sequencing crew (Team tab), Gene bank (donor DNA), Splicing tab
   (gene picker + hybrid creator) and the puzzle hand-offs to Z.UI.Minigames (guarded: a plain "Focus the team" button when absent).
   Extends 56-research.js through UI.Research.ext / UI.Research.U. */
(function () {
  'use strict';
  var UI = Z.UI, Res = UI && UI.Research; if (!Res || !Res.U) return;
  var U = Res.U, h = U.h, ic = U.ic, fmt = U.fmt, D = Z.DATA, pct = U.pct, note = U.note, whyRow = U.whyRow;
  function RS() { return Z.Sim.research; }
  function S() { return Z.state; }
  function sp(id) { return UI.byId(D.animals, id); }
  function MG() { return UI.Minigames && UI.Minigames.open ? UI.Minigames : null; }
  function hashStr(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return x >>> 0; }

  // ---- css (own style element)
  var st = document.createElement('style'); st.setAttribute('data-dna', '1');
  st.textContent = [
    '.bch{gap:7px}.bch .bhead{display:flex;gap:9px;align-items:center}.bch .bth{width:46px;height:46px;flex:none;border-radius:12px;background:var(--paper2);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:24px}',
    '.bch .bth .rth{width:46px;height:46px;border-radius:0}.bch .bt{flex:1;min-width:0}.bch .bt b{display:block;font:700 14px var(--sans);color:var(--ink)}',
    '.bch .qchip{display:inline-block;font:800 10px var(--sans);padding:1px 7px;border-radius:9px;background:#e3dcc3;color:var(--ink2);margin-left:6px;vertical-align:1px}.bch .qchip.good{background:#d9f0dc;color:#1c6b36}.bch .qchip.bad{background:#f8dcd5;color:#a3321f}',
    '.bch .bstat{display:flex;justify-content:space-between;gap:8px;font:700 12px var(--sans);color:var(--ink2)}.bch .bwho{font:600 12px var(--sans);color:#14594a}.bch .bwho.wait{color:#8a5a0a}',
    '.bch .bbtns{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.bch .bbtns .btn{flex:1 1 auto}.bch .bbtns .tiny{font:500 11px var(--sans);color:var(--ink3);flex:1 1 100%}',
    '.pickrow{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 6px;touch-action:pan-x;scrollbar-width:none}.pickrow::-webkit-scrollbar{display:none}',
    '.pickc{flex:0 0 auto;width:78px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 3px;border-radius:12px;background:var(--paper);border:2px solid rgba(58,42,26,.28);font:700 11px var(--sans);color:var(--ink);text-align:center}',
    '.pickc .rth{width:54px;height:54px;border-radius:10px}.pickc small{font:600 10.5px var(--sans);color:var(--ink2)}.pickc.on{border-color:#17555a;background:#e1f1ee;box-shadow:0 0 0 2px #4fb39a}.pickc.off{opacity:.45}',
    '.fxl{display:flex;flex-wrap:wrap;gap:4px}.fx{font:700 11.5px var(--sans);padding:2px 8px;border-radius:10px;background:#e3dcc3;color:var(--ink2)}.fx.good{background:#d9f0dc;color:#1c6b36}.fx.bad{background:#f8dcd5;color:#a3321f}.fx.look{background:#e0e8f8;color:#274a8a}',
    '.gcrd .gtop{display:flex;align-items:center;gap:8px}.gcrd .gtop .em{font-size:24px;flex:none}.gcrd .gtop div{flex:1;min-width:0}.gcrd b{font:700 14px var(--sans)}',
    '.prev{display:flex;gap:10px;align-items:center}.prev .pimg{width:110px;height:110px;flex:none;border-radius:14px;background:var(--paper2);overflow:hidden;display:flex;align-items:center;justify-content:center}.prev .pimg img,.prev .pimg .rth{width:110px;height:110px;border-radius:0}',
    '.prev .pstats{flex:1;display:flex;flex-direction:column;gap:3px;font:600 12px var(--sans);color:var(--ink2)}.prev .pstats b{font:700 16px var(--serif);color:#17555a}',
    '.guidebtn{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.guidebtn .gres{font:700 12.5px var(--sans);color:#14594a}',
    '#reveal{z-index:12}',   // result cards float above the research modal (they used to hide behind it)
    '.stars{color:#e0a010;letter-spacing:1px}.dlot .rrow b.num{white-space:nowrap}.crew .cl{display:flex;justify-content:space-between;gap:8px;font:600 12.5px var(--sans)}.crew .cl span:last-child{color:var(--ink2);text-align:right}'
  ].join('\n');
  document.head.appendChild(st);

  // ---- small helpers
  function fmtH(x) { if (x === null || x === undefined || !isFinite(x)) return '-'; if (x < 1) return '< 1 h'; if (x < 24) return Math.round(x) + ' h'; var d = Math.floor(x / 24), r = Math.round(x - d * 24); return d + ' d' + (r ? ' ' + r + ' h' : ''); }
  function starsTxt(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }
  function toast(t, k) { UI.toast(t, k || 'info'); }
  var LOOKS = { shift: 'Skin colours drift', fan: 'Display fan', crest: 'Head crest', spikes: 'Back spikes', spots: 'Spotted coat', shell: 'Bony shell', ears: 'Big ears', glow: 'Glows (brightest at dusk)', tint: 'New colouring', scale: 'Bigger frame', frill: 'Neck frill', sail: 'Back sail' };
  function geneLines(t) {
    var f = t.fx, o = [], g = function (txt) { o.push({ k: 'good', t: txt }); }, b = function (txt) { o.push({ k: 'bad', t: txt }); }, p = function (x) { return Math.round(Math.abs(x) * 100) + '%'; };
    if (!f) { o.push({ k: 'good', t: t.effect }); return o; }
    if (f.appeal > 0) g('+' + p(f.appeal) + ' appeal'); else if (f.appeal < 0) b('-' + p(f.appeal) + ' appeal by day');
    if (f.nightAppeal) g('+' + p(f.nightAppeal) + ' appeal at dusk');
    if (f.q) g('+' + f.q + ' genome stability');
    if (f.sick && f.sick < 1) g('-' + p(1 - f.sick) + ' illness'); else if (f.sick > 1) b('+' + p(f.sick - 1) + ' illness');
    if (f.life > 1) g('+' + p(f.life - 1) + ' lifespan'); else if (f.life && f.life < 1) b('-' + p(1 - f.life) + ' lifespan');
    if (f.speed > 1) g('+' + p(f.speed - 1) + ' speed'); else if (f.speed && f.speed < 1) b('-' + p(1 - f.speed) + ' speed');
    if (f.upkeep && f.upkeep < 1) g('-' + p(1 - f.upkeep) + ' upkeep'); else if (f.upkeep > 1) b('+' + p(f.upkeep - 1) + ' upkeep');
    if (f.breed > 1) g('+' + p(f.breed - 1) + ' breeding'); else if (f.breed && f.breed < 1) b('-' + p(1 - f.breed) + ' breeding');
    if (f.swim) g('Amphibious: can swim');
    if (f.terrain) g('Happy on snow as well as its usual ground');
    if (f.fence) b('Needs fence strength +' + f.fence);
    if (f.danger) b('Danger +' + f.danger);
    if (f.sterile) b('Sterile: cannot breed');
    if (t.look) for (var k in t.look) if (LOOKS[k]) o.push({ k: 'look', t: 'Look: ' + LOOKS[k].toLowerCase() });
    return o;
  }
  function fxChips(lines) { return h('div.fxl', lines.map(function (l) { return h('span.fx.' + l.k, { text: l.t }); })); }

  // ---------------------------------------------------------------- sequencing bench
  var seqPick = '';   // '' = random sequencing puzzle
  function seqGames() { var m = MG(); return m && m.list ? m.list.filter(function (g) { return g.kind === 'sequence'; }) : []; }
  function assistResult(batchId, r, name) {
    var x = RS().assistSequencing(batchId, r);
    if (!x.ok) { toast(x.msg, 'bad'); }
    else if (!x.won) { UI.snd && UI.snd('bad'); toast(x.quit ? 'You walked away from the puzzle. That used one of today\'s attempts.' : 'No luck this time. The batch is unchanged, but it has one boost fewer left.', 'info'); }
    else { UI.snd && UI.snd('good'); toast((x.complete ? 'Sequencing finished! ' : 'Great work! ') + '+' + x.progress + '% progress' + (x.integrityGain > 0 ? ', integrity +' + Math.round(x.integrityGain * 100) + '%' : '') + '.', 'good'); }
    Res.render();
  }
  function help(b) {
    var ai = b.assist; if (!ai.canAssist) { toast(ai.why, 'bad'); return; }
    var m = MG();
    if (!m) { assistResult(b.id, { won: true, score: 0, stars: 0, focus: true }, b.name); return; }
    var done = false;
    m.open({ game: seqPick || 'random-sequence', level: ai.level, title: 'Sequence the ' + b.name, subtitle: b.frags + ' fragments, integrity ' + Math.round(b.integrity * 100) + '%', species: b.species || null,
      seed: hashStr(b.id + ':' + S().day + ':' + (b.boosts)), onDone: function (r) { if (done) return; done = true; r = r || {}; assistResult(b.id, { won: !!r.won, score: r.score, stars: r.stars, quit: !!r.quit }, b.name); } });
  }
  function batchCard(b, sq) {
    var isD = b.kind === 'donor', q = b.quality === 'excellent' ? ['Superb', 'good'] : b.quality === 'poor' ? ['Poor', 'bad'] : ['Good', ''];
    var art = isD ? h('div.bth', { text: b.emoji }) : (function () { var d = h('div.bth'); UI.lazyThumb(d.appendChild(h('div.rth')), 'animal', b.species, '', 64); return d; })();
    var who = b.workers.length ? h('div.bwho', { text: 'Sequencing: ' + b.workers.map(function (w) { return w.name.replace(/^Dr /, 'Dr ') + ' (' + w.skill.toFixed(1) + ')'; }).join(', ') })
      : h('div.bwho.wait', { text: !sq.labOnline ? 'Paused: the lab is offline' : !sq.free ? 'Waiting: no free scientist' : 'Queued: #' + (b.position + 1) + ' in line' });
    var ai = b.assist, c = h('div.rcard.bch',
      h('div.bhead', art, h('div.bt', h('b', { html: b.name + '<span class="qchip ' + q[1] + '">' + q[0] + '</span>' }),
        h('div.rsub', { text: (isD ? b.doses + ' sample' + (b.doses > 1 ? 's' : '') : b.frags + ' fragments') + ' - ' + b.src + (isD ? '' : ' - integrity ' + Math.round(b.integrity * 100) + '%') }))),
      h('div.rbar', h('i', { style: 'width:' + Math.round(b.pct * 100) + '%' })),
      h('div.bstat', h('span', { text: Math.round(b.pct * 100) + '% sequenced' }), h('span', { text: b.etaHours === null ? 'ETA: waiting' : 'ETA ' + fmtH(b.etaHours) + ' (' + b.rate.toFixed(1) + 'x)' })),
      who,
      h('div.rsub', { text: isD ? 'Unlocks ' + b.doses + ' gene splice' + (b.doses > 1 ? 's' : '') : 'Expected genome gain: about +' + b.expectedGain.toFixed(1) + '%' }));
    var bt = h('div.bbtns');
    var MGo = MG();
    bt.appendChild(h('button.btn.sm' + (ai.canAssist ? '.gold' : '.dis'), { html: ic('dna') + (MGo ? 'Help sequence' : 'Focus the team'), on: { click: function () { UI.snd && UI.snd('click'); help(b); } } }));
    if (b.position > 0) bt.appendChild(h('button.btn.sm.alt', { text: 'Prioritise', on: { click: function () { var x = RS().prioritise(b.id); if (x.ok) toast('Moved to the front of the queue.', 'good'); Res.render(); } } }));
    bt.appendChild(h('div.tiny', { text: ai.canAssist ? (ai.boostsLeft + ' of ' + ai.maxBoost + ' boosts left on this batch. Win for +' + ai.bonus[0] + '% to +' + ai.bonus[1] + '% progress' + (MGo ? '' : ' (smaller bonus without a puzzle)') + '.') : ai.why }));
    c.appendChild(bt);
    return c;
  }
  Res.ext.bench = function (c, sm) {
    var sq = RS().sequencing();
    c.appendChild(h('div.rsect', { text: 'Sequencing bench' + (sq.batches.length ? ' (' + sq.batches.length + '/' + sq.queueCap + ')' : '') }));
    if (!sq.batches.length) { c.appendChild(note('No DNA fragments waiting. An extraction leaves fragments here; free scientists sequence them in the background and the genome only rises when a batch is finished.')); return; }
    var line = sq.working ? sq.free + ' free scientist' + (sq.free > 1 ? 's' : '') + ' sequencing at ' + sq.rate.toFixed(1) + 'x. Backlog clears in about ' + fmtH(sq.backlogHours) + '.' : '';
    if (sq.hint) c.appendChild(whyRow(sq.hint, sm.scientists ? null : ['Hire a scientist', function () { Res.open('team'); }]));
    else c.appendChild(note(line));
    var games = seqGames();
    if (games.length > 1) {
      var sg = h('div.seg.wrap'); sg.appendChild(h('button' + (!seqPick ? '.on' : ''), { text: 'Random puzzle', on: { click: function () { seqPick = ''; Res.render(); } } }));
      games.forEach(function (g) { sg.appendChild(h('button' + (seqPick === g.id ? '.on' : ''), { text: g.name, title: g.blurb, on: { click: function () { seqPick = g.id; Res.render(); } } })); });
      c.appendChild(sg);
    }
    c.appendChild(h('div.rsub', { text: 'Puzzle attempts today: ' + sq.attemptsLeft + '/' + sq.attemptsMax + ' (a win or a walk-away uses one; losing only uses up one of the batch\'s boosts). Winning gives an instant chunk of progress and a little integrity; it speeds things up but scientists still do the bulk of the work.' }));
    sq.batches.forEach(function (b) { c.appendChild(batchCard(b, sq)); });
  };

  // ---------------------------------------------------------------- team: who is sequencing what
  Res.ext.team = function (c, sm) {
    var sq = RS().sequencing();
    c.appendChild(h('div.rsect', { text: 'Sequencing crew' }));
    var card = h('div.rcard.crew',
      h('div.cl', h('span', { text: 'Free scientists' }), h('span', { text: sq.free + ' of ' + sq.scientists })),
      h('div.cl', h('span', { text: 'Sequencing speed' }), h('span', { text: sq.working ? sq.rate.toFixed(1) + 'x (skill, sequencer level, number free)' : 'none' })),
      h('div.cl', h('span', { text: 'Backlog' }), h('span', { text: sq.batches.length ? sq.batches.length + ' batch' + (sq.batches.length > 1 ? 'es' : '') + (sq.backlogHours !== null ? ', about ' + fmtH(sq.backlogHours) : '') : 'empty' })));
    sq.batches.forEach(function (b) { if (b.workers.length) card.appendChild(h('div.cl', h('span', { text: b.workers.map(function (w) { return w.name; }).join(', ') }), h('span', { text: b.name + ' ' + Math.round(b.pct * 100) + '%, ETA ' + fmtH(b.etaHours) }))); });
    c.appendChild(card);
    if (sq.hint) c.appendChild(whyRow(sq.hint));
    else if (!sq.batches.length) c.appendChild(note('Scientists without an experiment automatically sequence DNA fragments. More free scientists and a better genome sequencer make it faster.'));
  };

  // ---------------------------------------------------------------- gene bank (donor DNA)
  Res.ext.donors = function (sm) {
    var c = h('div.rtab'), stock = RS().donorStock(), list = RS().donors(), sq = RS().sequencing();
    c.appendChild(h('div.rsect', { text: 'Conservation gene bank' }));
    c.appendChild(note('Modern animals carry genes dinosaurs never had. Buy a sample, let the team sequence it (short), then splice the gene into any dinosaur above 80% genome. Stock rotates every few days.'));
    if (!stock.length) c.appendChild(note('The gene bank is out of stock. Check back tomorrow.'));
    stock.forEach(function (l) {
      var t = UI.byId(D.traits, l.gene), can = S().money + sm.funding >= l.price;
      c.appendChild(h('div.rcard.dlot',
        h('div.rrow', h('span', { html: '<b>' + l.emoji + ' ' + l.name + '</b>' + (l.doses > 1 ? ' ×' + l.doses : '') }), h('b.num', { text: fmt(l.price) })),
        h('div.rsub', { text: l.blurb }),
        h('div.rsub', { html: 'Gene: <b>' + (t ? t.name : l.gene) + '</b>. ' + l.doses + ' sample' + (l.doses > 1 ? 's' : '') + ' - gone in ' + l.daysLeft + ' day' + (l.daysLeft === 1 ? '' : 's') }),
        t ? fxChips(geneLines(t)) : null,
        h('button.btn.sm' + (can ? '.gold' : '.dis'), { html: ic('coin') + 'Buy', on: { click: function () { var x = RS().buyDonor(l.id); if (x.ok) { UI.snd('cash'); toast(l.name + ' DNA bought and queued for sequencing.', 'good'); } else { UI.snd('bad'); toast(x.msg, 'bad'); } Res.render(); } } })));
    });
    c.appendChild(h('div.rsect', { text: 'Your donor DNA' }));
    var have = list.filter(function (d) { return d.doses || d.queued; });
    if (!have.length) c.appendChild(note('None yet. Buy a sample above, or send an expedition: vets sometimes trade samples.'));
    have.forEach(function (d) {
      c.appendChild(h('div.rcard', h('div.rrow', h('b', { text: d.emoji + ' ' + d.name }), h('span.rsub', { text: d.geneName })),
        h('div.rsub', { text: d.doses + ' ready to splice' + (d.queued ? ', ' + d.queued + ' waiting for sequencing' : '') })));
    });
    if (sq.batches.some(function (b) { return b.kind === 'donor'; })) c.appendChild(h('button.btn.sm.alt', { text: 'See the sequencing bench', on: { click: function () { Res.open('lab'); } } }));
    return c;
  };

  // ---------------------------------------------------------------- splicing
  var SP = { mode: 'gene', species: null, gene: null, a: null, b: null, guide: null };   // guide: {key, val, stars, won}
  var PAL = ['#2f9a4f', '#c4553a', '#17555a', '#f2a81d', '#7a4fa0', '#3a86b8'];
  function colourFor(id) { return PAL[hashStr(id) % PAL.length]; }
  function eligible() { return D.animals.filter(function (a) { return !a.modern && RS().genomeInfo(a.id).genome >= 80; }); }
  function pickerRow(list, sel, onPick, off) {
    var row = h('div.pickrow');
    list.forEach(function (a) {
      var gi = RS().genomeInfo(a.id), d = off && off(a);
      row.appendChild(h('button.pickc' + (sel === a.id ? '.on' : '') + (d ? '.off' : ''), { title: d || '', on: { click: function () { if (d) { toast(d, 'bad'); return; } UI.snd('click'); onPick(a.id); } } }, U.thumb(a.id, 64, true), h('span', { text: a.name }), h('small', { text: Math.round(gi.genome) + '%' })));
    });
    return row;
  }
  function guideKey() { return SP.mode === 'gene' ? 'g|' + SP.species + '|' + SP.gene : 'h|' + SP.a + '|' + SP.b; }
  function guideVal() { return SP.guide && SP.guide.key === guideKey() ? SP.guide.val : 0; }
  // the splicing puzzle: scores shift the odds before the experiment starts
  function guideControl(genes, level) {
    var cur = SP.guide && SP.guide.key === guideKey() ? SP.guide : null, m = MG(), box = h('div.guidebtn');
    function setG(g) { SP.guide = { key: guideKey(), val: g.val, stars: g.stars, won: g.won }; Res.render(); }
    var games = m && m.list ? m.list.filter(function (g) { return g.kind === 'splice'; }) : [];
    if (m && games.length) {
      box.appendChild(h('button.btn.sm.alt', { html: ic('dna') + (cur ? 'Play again' : 'Guide the splice'), on: { click: function () {
        var done = false;
        m.open({ game: games[hashStr(guideKey() + S().day) % games.length].id, level: level, title: 'Guide the splice', subtitle: genes.map(function (g) { return g.name; }).join(' + '), genes: genes, seed: hashStr(guideKey() + ':' + Date.now() % 997),
          onDone: function (r) { if (done) return; done = true; r = r || {}; setG({ val: r.won ? Math.max(0.15, Math.min(1, r.score || 0)) : 0, stars: r.stars | 0, won: !!r.won }); } });
      } } }));
    } else box.appendChild(h('button.btn.sm.alt', { html: ic('dna') + (cur ? 'Focused' : 'Focus the team (small bonus)'), on: { click: function () { setG({ val: 0.3, stars: 0, won: true }); } } }));
    if (cur) box.appendChild(h('span.gres', { html: cur.won ? 'Guided <span class="stars">' + starsTxt(cur.stars) + '</span> (success odds improved)' : 'The puzzle did not go well: base odds apply' }));
    else box.appendChild(h('span.rsub', { text: 'Optional: play a short puzzle to improve the odds. Skipping uses the base odds.' }));
    return box;
  }
  function oddsCard(o, extra) {
    return h('div.oddscard', U.oddsBar({ success: o.success, critical: o.critical, fail: o.fail }),
      h('div.orow', h('span.l.succ', { text: 'Success ' + pct(o.success) }), h('span.l.fail', { text: 'Fail ' + pct(o.fail) }), h('span.l.crit', { text: 'Critical ' + pct(o.critical) })), U.breakdown(o.breakdown || []),
      h('div.rrow', h('span', { text: 'Cost' }), h('b', { text: fmt(o.cost) })), h('div.rrow', h('span', { text: 'Time' }), h('b', { text: Math.round(o.hours) + ' h' })), U.fundNote(o.fundingUsed), extra || null);
  }
  function geneFlow() {
    var a = sp(SP.species), t = UI.byId(D.traits, SP.gene); if (!a || !t) { SP.gene = null; return null; }
    var g = guideVal(), o = RS().spliceOdds(a.id, t.id, undefined, { guide: g }), box = h('div.rcard.rflow');
    box.appendChild(h('div.rrow', h('b.serif', { style: 'font-size:17px', text: 'Splice ' + t.name + ' into ' + a.name }), h('button.x', { html: ic('close'), 'aria-label': 'Close', on: { click: function () { SP.gene = null; Res.render(); } } })));
    box.appendChild(fxChips(geneLines(t)));
    if (t.donor) box.appendChild(h('div.rsub', { text: 'Uses one sequenced ' + (D.donors.filter(function (d) { return d.id === t.donor; })[0] || {}).name + ' sample. You have ' + RS().donors().filter(function (d) { return d.id === t.donor; })[0].doses + '.' }));
    box.appendChild(oddsCard(o));
    box.appendChild(guideControl([{ id: a.id, name: a.name, colour: colourFor(a.id) }, { id: t.id, name: t.name, colour: colourFor(t.id) }], Math.max(1, Math.min(5, (a.rarity || 1) + (S().research.traits[a.id] || []).length))));
    if (!o.canStart) box.appendChild(whyRow(o.why, !t.donor || !/Gene bank/.test(o.why) ? null : ['Open the Gene bank', function () { Res.open('donors'); }]));
    box.appendChild(h('div.btnrow', h('button.btn.gold' + (o.canStart ? '' : '.dis'), { text: 'Start splice', on: { click: function () {
      var x = RS().startSplice(a.id, t.id, undefined, { guide: g }); if (x.ok) { UI.snd('cash'); toast('Splice started (' + Math.round(x.hours) + ' h).', 'good'); SP.gene = null; SP.guide = null; } else { UI.snd('bad'); toast(x.msg, 'bad'); } Res.render();
    } } }), h('button.btn.alt', { text: 'Cancel', on: { click: function () { SP.gene = null; Res.render(); } } })));
    return box;
  }
  function genesView(c) {
    var el = eligible(), a = sp(SP.species);
    if (!a || !el.some(function (x) { return x.id === a.id; })) { a = el[0]; SP.species = a ? a.id : null; }
    if (!a) { c.appendChild(note('Splicing opens when a genome reaches 80%.')); return; }
    c.appendChild(h('div.rsub', { text: 'Choose a species' }));
    c.appendChild(pickerRow(el, SP.species, function (id) { SP.species = id; SP.gene = null; Res.render(); }));
    var fl = SP.gene ? geneFlow() : null; if (fl) c.appendChild(fl);
    var gi = RS().genomeInfo(a.id), have = gi.traits || [];
    c.appendChild(note(a.name + ' has ' + Math.round(gi.genome) + '% genome' + (have.length ? ' and carries ' + have.map(function (t) { return (UI.byId(D.traits, t) || {}).name; }).join(', ') : '') + '. Each gene spliced in lowers the odds of the next. A critical failure costs 3-6% genome.'));
    [['Donor genes (modern animals)', function (t) { return !!t.donor; }], ['Home-lab traits', function (t) { return !t.donor; }]].forEach(function (grp) {
      c.appendChild(h('div.rsect', { text: grp[0] }));
      D.traits.filter(grp[1]).forEach(function (t) {
        var has = have.indexOf(t.id) >= 0, o = RS().spliceOdds(a.id, t.id), dn = t.donor ? RS().donors().filter(function (d) { return d.id === t.donor; })[0] : null;
        c.appendChild(h('div.rcard.gcrd',
          h('div.gtop', h('span.em', { text: t.emoji }), h('div', h('b', { text: t.name }), h('div.rsub', { text: t.effect }))),
          fxChips(geneLines(t)),
          h('div.rrow', h('span.rsub', { text: has ? 'Installed' : (dn ? 'Sample: ' + dn.doses + ' ready' : 'No donor needed') + ' - ' + pct(o.success) + ' / ' + fmt(o.cost) }),
            has ? null : h('button.btn.sm' + (o.canStart ? '.gold' : '.alt'), { text: 'Splice', on: { click: function () { UI.snd('click'); SP.gene = t.id; SP.guide = null; Res.render(); } } })),
          !has && !o.canStart && o.why ? h('div.rsub.bad', { text: o.why }) : null));
      });
    });
  }

  // ---- hybrids
  function previewThumb(def) {
    var A = D.animals, had = A.indexOf(def) >= 0 || A.some(function (x) { return x.id === def.id; }), url = null;
    if (!had) A.push(def);
    try { url = Z.Models && Z.Models.thumbnail ? Z.Models.thumbnail('animal', def.id, 128) : null; } catch (e) { url = null; } finally { if (!had) A.splice(A.indexOf(def), 1); }
    return url;
  }
  function statLine(def, a, b) {
    var rows = [['Appeal', 'appeal'], ['Upkeep a day', 'upkeep'], ['Fence strength needed', 'minFence'], ['Danger', 'danger'], ['Space per animal', 'space']];
    return rows.map(function (r) { var k = r[1], v = def[k], pv = [a[k], b[k]]; var txt = r[1] === 'upkeep' ? fmt(v) : String(v); return h('div', { html: r[0] + ': <b style="font-size:13px;font-family:var(--sans)">' + txt + '</b> <span style="font-weight:500">(parents ' + (r[1] === 'upkeep' ? fmt(pv[0]) + ', ' + fmt(pv[1]) : pv.join(', ')) + ')</span>' }); });
  }
  function hybridsView(c) {
    var el = eligible(), A = sp(SP.a), B = sp(SP.b), realm = A ? (A.realm || 'land') : null;
    c.appendChild(note('Cross two different species (both at least 80% genome, same land/sea/air realm) to create a brand-new hybrid species. It is a big crowd-puller, but needs stronger fences, costs more to keep and starts unstable. A failed cross wastes genome material from both parents.'));
    if (el.length < 2) { c.appendChild(note('You need two species at 80% genome or more.', 'warn')); }
    c.appendChild(h('div.rsub', { text: 'Parent A gives the body' }));
    c.appendChild(pickerRow(el, SP.a, function (id) { SP.a = id; if (SP.b === id) SP.b = null; SP.guide = null; Res.render(); }));
    c.appendChild(h('div.rsub', { text: 'Parent B gives the head, colours and size' }));
    c.appendChild(pickerRow(el.filter(function (x) { return x.id !== SP.a; }), SP.b, function (id) { SP.b = id; SP.guide = null; Res.render(); }, function (x) { return A && (x.realm || 'land') !== realm ? 'Land, sea and air species cannot be crossed' : null; }));
    if (A && B && A.id !== B.id) {
      var g = guideVal(), o = RS().hybridOdds(A.id, B.id, undefined, { guide: g }), def = o.preview, card = h('div.rcard.rflow');
      card.appendChild(h('b.serif', { style: 'font-size:17px', text: def.name }));
      var pimg = h('div.pimg'), url = previewThumb(def);
      if (url) pimg.appendChild(h('img', { src: url, alt: def.name })); else pimg.appendChild(h('div', { text: def.emoji, style: 'font-size:46px' }));
      card.appendChild(h('div.prev', pimg, h('div.pstats', h('div', { text: 'Predicted from ' + A.name + ' × ' + B.name }), statLine(def, A, B), h('div', { text: 'Starts at ' + Z.Sim.research.DNA_CONST.hybGenome + '% genome, hatches 8% less reliably.' }))));
      var hy = RS().hybrids().filter(function (x) { return x.id === def.id; })[0]; if (hy) card.appendChild(h('div.rsub.bad', { text: 'Already created.' }));
      card.appendChild(oddsCard(o, h('div.rsub', { text: 'A failed cross wastes ' + o.genomeLoss[0] + '-' + o.genomeLoss[1] + '% genome from each parent; a critical failure wastes ' + o.genomeLossCrit[0] + '-' + o.genomeLossCrit[1] + '%.' })));
      card.appendChild(guideControl([{ id: A.id, name: A.name, colour: colourFor(A.id) }, { id: B.id, name: B.name, colour: colourFor(B.id) }], Math.max(2, Math.min(5, Math.round(((A.rarity || 1) + (B.rarity || 1)) / 2 + 1)))));
      if (!o.canStart) card.appendChild(whyRow(o.why));
      card.appendChild(h('div.btnrow', h('button.btn.gold' + (o.canStart ? '' : '.dis'), { text: 'Start the cross', on: { click: function () {
        var x = RS().startHybrid(A.id, B.id, undefined, { guide: g }); if (x.ok) { UI.snd('cash'); toast('Cross-splice started (' + Math.round(x.hours) + ' h).', 'good'); SP.guide = null; } else { UI.snd('bad'); toast(x.msg, 'bad'); } Res.render();
      } } })));
      c.appendChild(card);
    }
    var hs = RS().hybrids();
    c.appendChild(h('div.rsect', { text: 'Your hybrid species (' + hs.length + '/' + RS().DNA_CONST.hybMax + ')' }));
    if (!hs.length) c.appendChild(note('None yet.'));
    hs.forEach(function (x) {
      var d = sp(x.id), box = h('div.rcard.gcard', { on: { click: function () { UI.snd('click'); UI.Panel.species(x.id); } } }), th = h('div.rth');
      if (UI.Portrait && UI.Portrait.mount && UI.Portrait.supported && UI.Portrait.supported(x.id)) { try { UI.Portrait.mount(th, { species: x.id }); } catch (e) { UI.lazyThumb(th, 'animal', x.id, '', 96); } } else UI.lazyThumb(th, 'animal', x.id, '', 96);
      box.appendChild(th); box.appendChild(h('div.gi', h('b', { text: x.name }), h('span.rsub', { text: (sp(x.a) || {}).name + ' × ' + (sp(x.b) || {}).name + ', day ' + x.day }), h('div.genrow', UI.genomeBar ? UI.genomeBar(x.genome, false) : null, h('b.num', { text: Math.round(x.genome) + '%' }))));
      c.appendChild(box);
    });
  }
  Res.ext.splice = function (sm) {
    var c = h('div.rtab'), sg = h('div.seg');
    [['gene', 'Genes'], ['hybrid', 'Hybrids']].forEach(function (m) { sg.appendChild(h('button' + (SP.mode === m[0] ? '.on' : ''), { text: m[1], on: { click: function () { UI.snd('click'); SP.mode = m[0]; SP.guide = null; Res.render(); } } })); });
    c.appendChild(sg);
    if (SP.mode === 'gene') genesView(c); else hybridsView(c);
    return c;
  };
  Res.ext.key = function () { return SP.mode + '|' + SP.species + '|' + SP.gene + '|' + SP.a + '|' + SP.b + '|' + (SP.guide ? SP.guide.val + SP.guide.stars : '') + '|' + seqPick + '|' + RS().hybrids().length; };

  // ---------------------------------------------------------------- bus hooks
  var oinit = Res.init;
  Res.init = function () {
    oinit.apply(this, arguments);
    Z.bus.on('reset', function () { SP = { mode: 'gene', species: null, gene: null, a: null, b: null, guide: null }; });
    Z.bus.on('experiment', function (e) { if (e && e.hybrid && UI.refreshCards) UI.refreshCards(); });
    Z.bus.on('donorBatch', function (e) { if (e && e.batch && UI.toast) { var d = D.donors.filter(function (x) { return x.id === e.donor; })[0]; UI.toast((d ? d.name : 'Donor') + ' DNA queued for sequencing.', 'info'); } });
  };
})();
