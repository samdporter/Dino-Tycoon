// ===== 22-sim-dna.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - DNA package (sim side, DOM-free).
   Plugs into the research section of 20-sim.js through Z.simCtx (closure state getters + helpers) and is called back through the Z.DNA hooks:
   - DNA fragments: an extraction no longer adds genome % directly. It creates a sequencing BATCH (research.batches) that waits in a queue.
   - Background sequencing: scientists without a job work through the queue (rate: skill, sequencer level, how many are free).
   - Sequencing puzzles (assistSequencing), donor DNA (gene bank, addDonor), cross-splicing hybrids (hybrid species registered into Z.DATA.animals).
   Public API lives on Z.Sim.research (see notes/dna.md). */
(function () {
  'use strict';
  var C = Z.simCtx; if (!C) return;
  var DNA = Z.DNA = {}, api = C.researchAPI, RC = C.RC, rng = Z.rng, bus = Z.bus, D = C.D, clamp = C.clamp, round1 = C.round1, round3 = C.round3, fail = C.fail, okr = C.okr, fmt = C.fmt;
  var K = DNA.CONST = {
    queueCap: 16,
    work: [8, 11, 15],            // scientist-hours (at rate 1) to sequence one batch, by amber grade
    donorWork: 4,                 // donor DNA is short to sequence
    seqEq: 0.3,                   // sequencer level adds 30% speed per level
    gainMul: 1.12,                // makes up for integrity < 1 so the pace of a genome matches the old direct gain
    excellentBase: 0.1,           // chance that a successful extraction is a 'critical success' (superb integrity, more fragments)
    assistPerDay: 5, maxBoost: 2, // puzzle attempts per game day, wins per batch
    boostLo: 0.14, boostHi: 0.3,  // fraction of a batch's work done by a puzzle win (score 0..1)
    integrityPerStar: 0.025, focusFrac: 0.08,
    hybMax: 8, hybGenome: 58, hybMinGenome: 80, hybBase: 0.18, hybCost: 7000, hybCostPerRar: 2200, hybHours: 36, guideBonus: 0.14,
    donorStockN: 5
  };

  function S() { return C.S(); }
  function SPt() { return C.SP(); }
  var ensured = null, ensuredN = -1;
  function ensure(R) {
    if (!R) return R;
    if (R === ensured && ensuredN === D.animals.length) return R;
    if (!R.batches) R.batches = [];
    if (!R.assist) R.assist = { day: 0, used: 0 };
    if (!R.donorDoses) R.donorDoses = {};
    if (!R.donorStock) R.donorStock = [];
    if (R.donorDay === undefined) R.donorDay = 0;
    if (!R.hybrids) R.hybrids = [];
    var st = R.stats; ['seqDone', 'fragments', 'puzzles', 'genes', 'hybrids', 'donorsBought'].forEach(function (k) { if (st[k] === undefined) st[k] = 0; });
    D.animals.forEach(function (a) { if (R.genomes[a.id] === undefined) R.genomes[a.id] = 0; if (!R.traits[a.id]) R.traits[a.id] = []; });
    ensured = R; ensuredN = D.animals.length;
    return R;
  }
  function RS() { return ensure(S().research); }
  function donor(id) { for (var k = 0; k < D.donors.length; k++) if (D.donors[k].id === id) return D.donors[k]; return null; }
  function realmOf(sp) { return sp.realm || 'land'; }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  // ------------------------------------------------------------------ batches
  DNA.queueFull = function () { return RS().batches.length >= K.queueCap; };
  DNA.queueCap = function () { return K.queueCap; };
  DNA.makeBatch = function (o) {
    var R = RS(), SP = SPt(), sp = SP[o.species], g = o.grade, skill = o.skill || 1, clean = C.eqLevel('clean_room'), seq = C.eqLevel('sequencer');
    var integ, mulF = 1, mulW = 1, q = 'good';
    if (o.outcome === 'success') {
      integ = 0.8 + 0.03 * (skill - 1) + 0.02 * clean + 0.025 * (g - 1) + rng.range(-0.05, 0.05);
      if (rng.chance(K.excellentBase + 0.03 * seq + 0.015 * (skill - 1))) { integ = rng.range(0.96, 1); mulF = 1.35; q = 'excellent'; }
      else integ = clamp(integ, 0.6, 0.95);
    } else { integ = rng.range(0.2, 0.36); mulF = 0.55; mulW = 0.6; q = 'poor'; }
    var gain = round1(Math.max(1, RC.gain[g - 1] * K.gainMul * mulF * rng.range(0.8, 1.2)));
    var site = C.SITE()[o.site];
    var b = { id: C.newId(), kind: 'dino', species: o.species, site: o.site, grade: g, day: S().day, quality: q, integrity: round3(integ), gain: gain, frags: Math.round(gain * 3.4 + 6),
      work: round1(K.work[g - 1] * mulW * (0.9 + 0.1 * (sp.rarity || 1))), done: 0, boosts: 0, src: site ? site.name : 'amber' };
    R.batches.push(b); R.stats.fragments += b.frags;
    bus.emit('research');
    return b;
  };
  function batchById(id) { var R = RS(); for (var k = 0; k < R.batches.length; k++) if (R.batches[k].id === id) return R.batches[k]; return null; }

  // ------------------------------------------------------------------ background sequencing
  var asg = { sci: {}, batch: {}, rate: {}, free: 0 };
  function sciRate(s) { return (0.55 + 0.45 * s.skill) * (1 + K.seqEq * C.eqLevel('sequencer')); }
  function assign() {
    var R = RS(), free = C.freeScientists().slice().sort(function (a, b) { return b.skill - a.skill; }), m = R.batches.length, n = Math.min(m, free.length), k;
    asg.sci = {}; asg.batch = {}; asg.rate = {}; asg.free = free.length;
    if (!m || !n || !C.labOnline()) return asg;
    for (k = 0; k < free.length; k++) {
      var b = R.batches[k % n], s = free[k];
      asg.sci[s.id] = b.id; (asg.batch[b.id] || (asg.batch[b.id] = [])).push(s); asg.rate[b.id] = (asg.rate[b.id] || 0) + sciRate(s);
    }
    return asg;
  }
  DNA.sciTask = function (s) {
    var id = asg.sci[s.id]; if (!id) return null;
    var b = batchById(id); if (!b) return null;
    var nm = b.kind === 'donor' ? (donor(b.donor) || {}).name + ' DNA' : SPt()[b.species].name;
    return 'Sequencing ' + nm + ' (' + Math.floor(100 * b.done / b.work) + '%)';
  };
  DNA.step = function (dt, dh) {
    var R = RS(), k, j;
    if (!R.batches.length) { if (asg.free || asg.rate) { asg.sci = {}; asg.batch = {}; asg.rate = {}; asg.free = 0; } return; }
    assign();
    var done = null;
    for (k = 0; k < R.batches.length; k++) {
      var b = R.batches[k], r = asg.rate[b.id]; if (!r) continue;
      b.done += r * dh;
      var ws = asg.batch[b.id]; for (j = 0; j < ws.length; j++) C.xpUp(ws[j], 0.3 * dh);
      if (b.done >= b.work) (done || (done = [])).push(b);
    }
    if (done) for (k = 0; k < done.length; k++) complete(done[k]);
  };
  function complete(b) {
    var R = RS(), idx = R.batches.indexOf(b); if (idx < 0) return;
    R.batches.splice(idx, 1); R.stats.seqDone++;
    if (b.kind === 'donor') {
      R.donorDoses[b.donor] = (R.donorDoses[b.donor] || 0) + b.doses;
      var d = donor(b.donor);
      C.rlog('Sequencing complete: ' + b.doses + ' ' + d.name + ' gene sample' + (b.doses > 1 ? 's are' : ' is') + ' ready for splicing (' + (C.TR()[d.gene] ? C.TR()[d.gene].name : d.gene) + ').', 'good');
      bus.emit('sequenced', { batch: b, donor: b.donor, doses: b.doses });
    } else {
      var sp = SPt()[b.species], g0 = R.genomes[b.species], gain = 0, ng = g0, sold = 0;
      if (g0 >= 99.95) { sold = Math.round(C.priceFor(b.site, b.grade) * 0.4 * b.integrity); R.funding += sold; }
      else {
        gain = b.gain * b.integrity * (1 - g0 / RC.gainDiminish); gain = Math.max(0.3, Math.min(gain, 100 - g0)); gain = Math.round(gain * 10) / 10;
        ng = C.addGenome(b.species, gain);
      }
      if (sold) C.rlog('The ' + sp.name + ' genome was already complete, so the finished sequence was sold to museums for ' + fmt(sold) + ' of research funding.', 'good');
      else C.rlog('Sequencing complete: ' + sp.name + ' genome +' + gain.toFixed(1) + '% (integrity ' + Math.round(b.integrity * 100) + '%), now ' + Math.floor(ng) + '%.', 'good');
      bus.emit('sequenced', { batch: b, species: b.species, gain: gain, genome: ng, sold: sold, unlocked: g0 < RC.unlockGenome && ng >= RC.unlockGenome });
    }
    bus.emit('research');
  }
  function prioritise(batchId, opts) {
    var dry = C.dryOf(arguments), R = RS(), b = batchById(batchId); if (!b) return fail('That batch has already been sequenced');
    var i = R.batches.indexOf(b); if (i === 0) return fail('It is already at the front of the queue');
    if (dry) return okr(0);
    R.batches.splice(i, 1); R.batches.unshift(b); bus.emit('research'); return okr(0);
  }

  // ------------------------------------------------------------------ sequencing puzzles
  function assistState() { var R = RS(); if (R.assist.day !== S().day) { R.assist.day = S().day; R.assist.used = 0; } return R.assist; }
  function levelFor(b) {
    if (b.kind === 'donor') { var d = donor(b.donor); return clamp(1 + (d && d.star >= 2 ? 1 : 0), 1, 5); }
    return clamp(Math.round((SPt()[b.species].rarity || 1) + (b.grade >= 3 ? 1 : 0)), 1, 5);
  }
  function assistInfo(batchId) {
    var b = batchById(batchId), st = assistState(), out = { canAssist: false, why: '', level: 1, game: 'random-sequence', boostsLeft: 0, attemptsLeft: Math.max(0, K.assistPerDay - st.used), attemptsMax: K.assistPerDay, maxBoost: K.maxBoost };
    if (!b) { out.why = 'That batch has already been sequenced'; return out; }
    out.level = levelFor(b); out.boostsLeft = Math.max(0, K.maxBoost - b.boosts);
    out.bonus = [Math.round(K.boostLo * 100), Math.round((K.boostLo + K.boostHi) * 100)];
    if (!out.boostsLeft) out.why = 'This batch has had all the help it can take (' + K.maxBoost + ' boosts)';
    else if (!out.attemptsLeft) out.why = 'The team is tired of puzzles for today. More tomorrow.';
    else out.canAssist = true;
    return out;
  }
  // result: {won, score 0..1, stars 0..3, focus?, quit?}. A win costs a daily attempt and a batch boost. A loss (time or moves ran out) costs only the batch's
  // boost (one of maxBoost), not the daily allowance. Quitting at once (res.quit) costs the daily attempt only, so you cannot reroll for a kinder puzzle.
  function assistSequencing(batchId, res) {
    var info = assistInfo(batchId); if (!info.canAssist) return fail(info.why);
    var b = batchById(batchId), st = assistState(), R = RS(); res = res || {};
    R.stats.puzzles++;
    if (!res.won && res.quit) { st.used++; bus.emit('research'); return okr(0, { won: false, quit: true, progress: 0, msg: 'You walked away. That used one of today\'s attempts.' }); }
    if (!res.won) { b.boosts++; bus.emit('research'); return okr(0, { won: false, quit: false, progress: 0, msg: 'No luck this time. The batch is unchanged.' }); }
    st.used++;
    var score = clamp(+res.score || 0, 0, 1), stars = clamp(Math.round(+res.stars || 0), 0, 3), frac, dInt = 0;
    if (res.focus) frac = K.focusFrac;
    else { frac = K.boostLo + K.boostHi * score; dInt = K.integrityPerStar * stars + 0.01 * score; }
    b.boosts++; b.done = Math.min(b.work, b.done + b.work * frac);
    var before = b.integrity; b.integrity = round3(Math.min(1, b.integrity + dInt));
    var r = okr(0, { won: true, progress: Math.round(frac * 100), integrityGain: round3(b.integrity - before), complete: b.done >= b.work, stars: stars });
    if (b.done >= b.work) complete(b); else bus.emit('research');
    return r;
  }

  // ------------------------------------------------------------------ donor DNA
  DNA.doses = function (id) { return RS().donorDoses[id] || 0; };
  DNA.donorName = function (id) { var d = donor(id); return d ? d.name : id; };
  DNA.useDose = function (id) { var R = RS(); R.donorDoses[id] = Math.max(0, (R.donorDoses[id] || 0) - 1); };
  DNA.returnDose = function (id) { var R = RS(); R.donorDoses[id] = (R.donorDoses[id] || 0) + 1; };
  // Public: a modern animal's DNA arrives (gene bank purchase, expedition find, or a wild animal wandering into the park). Needs sequencing before use.
  function addDonor(donorId, amount, sourceText) {
    var d = donor(donorId); if (!d) return fail('Unknown donor animal: ' + donorId);
    var R = RS(), n = clamp(Math.round(+amount || 1), 1, 9);
    var b = { id: C.newId(), kind: 'donor', donor: donorId, doses: n, day: S().day, quality: 'good', integrity: 1, gain: 0, frags: 10 * n + 4, work: round1(Math.min(8, K.donorWork * (0.8 + 0.2 * n))), done: 0, boosts: 0, src: sourceText || 'Delivered to the lab' };
    R.batches.push(b); R.stats.fragments += b.frags;
    C.rlog(d.name + ' DNA arrived (' + b.src + '): ' + n + ' sample' + (n > 1 ? 's' : '') + ' queued for sequencing.', 'info', false);
    bus.emit('donorBatch', { batch: b, donor: donorId });
    bus.emit('research');
    return okr(0, { batchId: b.id });
  }
  function availDonors() { return D.donors.filter(function (d) { return d.star <= S().unlocked.star; }); }
  function refreshDonors(initial) {
    var R = RS(), day = S().day, k;
    R.donorStock = R.donorStock.filter(function (l) { return l.exp > day && !(!initial && rng.chance(0.2)); });
    var av = availDonors(), have = {}; R.donorStock.forEach(function (l) { have[l.donor] = 1; });
    var target = Math.min(av.length, K.donorStockN + (S().unlocked.star >= 3 ? 1 : 0)), guard = 0;
    while (R.donorStock.length < target && guard++ < 40) {
      var d = rng.pick(av); if (have[d.id]) continue; have[d.id] = 1;
      var doses = rng.chance(0.3) ? 2 : 1;
      R.donorStock.push({ id: C.newId(), donor: d.id, doses: doses, price: Math.round(d.price * doses * rng.range(0.92, 1.1) * (doses > 1 ? 0.9 : 1) / 10) * 10, exp: day + rng.int(2, 4) });
    }
    if (!R.donorStock.some(function (l) { return donor(l.donor).star === 0; })) {   // always something affordable early on
      var cheap = av.filter(function (d) { return d.star === 0; }), c0 = rng.pick(cheap);
      R.donorStock = R.donorStock.filter(function (l) { return l.donor !== c0.id; });
      R.donorStock.push({ id: C.newId(), donor: c0.id, doses: 1, price: Math.round(c0.price * rng.range(0.92, 1.1) / 10) * 10, exp: day + rng.int(2, 4) });
    }
    R.donorStock.sort(function (a, b) { return donor(a.donor).price - donor(b.donor).price; });
    R.donorDay = day; bus.emit('research');
  }
  function buyDonor(lotId, opts) {
    var dry = C.dryOf(arguments), R = RS(), k, lot = null;
    for (k = 0; k < R.donorStock.length; k++) if (R.donorStock[k].id === lotId) { lot = R.donorStock[k]; break; }
    if (!lot) return fail('That sample has been sold');
    if (R.batches.length >= K.queueCap + 4) return fail('The sequencing backlog is full. Let the team catch up first.');
    if (S().money + R.funding < lot.price) return fail('Not enough money');
    if (dry) return okr(lot.price);
    R.donorStock.splice(k, 1);
    C.payScience(lot.price); R.stats.donorsBought += lot.doses;
    var r = addDonor(lot.donor, lot.doses, 'Bought from the conservation gene bank for ' + fmt(lot.price));
    bus.emit('research');
    return okr(lot.price, { batchId: r.batchId, donor: lot.donor });
  }
  DNA.expeditionFind = function (siteId) {
    if (!rng.chance(0.2)) return null;
    var av = availDonors(); if (!av.length) return null;
    var d = rng.pick(av); addDonor(d.id, 1, 'Traded with local vets on an expedition'); return d.name;
  };

  // ------------------------------------------------------------------ hybrids
  function portmanteau(a, b) {
    var A = a.name.replace(/[^A-Za-z]/g, ''), B = b.name.replace(/[^A-Za-z]/g, ''), i = Math.round(A.length * 0.55), j = Math.round(B.length * 0.45);
    while (i < A.length - 1 && /[aeiou]/i.test(A.charAt(i - 1))) i++;
    while (j < B.length - 1 && !/[aeiou]/i.test(B.charAt(j))) j++;
    var nm = A.slice(0, i) + B.slice(j).toLowerCase();
    if (nm.toLowerCase() === a.name.toLowerCase() || nm.toLowerCase() === b.name.toLowerCase()) nm = A.slice(0, Math.max(3, i - 1)) + B.slice(Math.max(1, j - 1)).toLowerCase();
    return nm.charAt(0).toUpperCase() + nm.slice(1);
  }
  function mix(x, y, t) { return x + (y - x) * t; }
  // Deterministic hybrid species definition from two parents (A supplies the body plan, B ornaments/colour). Pure: no state.
  function makeHybridDef(a, b) {
    var h = hashStr(a.id + '|' + b.id), k, tp = {}, fol = [], seen = {};
    for (k in a.terrainPrefs) tp[k] = (tp[k] || 0) + a.terrainPrefs[k] * 0.6;
    for (k in b.terrainPrefs) tp[k] = (tp[k] || 0) + b.terrainPrefs[k] * 0.4;
    for (k in tp) tp[k] = round3(tp[k]);
    (a.foliage || []).concat(b.foliage || []).forEach(function (f) { if (!seen[f] && fol.length < 5) { seen[f] = 1; fol.push(f); } });
    var up = Math.round(mix(a.upkeep, b.upkeep, 0.5) * 1.4), rar = Math.min(4, Math.max(a.rarity || 1, b.rarity || 1) + 1), pred = !!(a.predator || b.predator), len = round1(mix(a.length, b.length, 0.5) * 1.08);
    var def = {
      id: 'hy_' + a.id + '_' + b.id, name: portmanteau(a, b), emoji: a.emoji, biome: a.biome, terrainPrefs: tp,
      cost: Math.round(mix(a.cost, b.cost, 0.5) * 1.6 / 10) * 10, upkeep: up, 'upkeep/day': up,
      appeal: Math.round(mix(a.appeal, b.appeal, 0.5) * 1.35 + 2), space: round1(Math.max(a.space, b.space) * 1.1), social: a.social.slice(), diet: a.diet === b.diet ? a.diet : 'omnivore', foliage: fol,
      needsWater: !!(a.needsWater || b.needsWater), needsShelter: !!(a.needsShelter || b.needsShelter), needsRocks: !!(a.needsRocks || b.needsRocks),
      minFence: Math.min(5, Math.max(a.minFence, b.minFence) + 1), speed: round1(mix(a.speed, b.speed, 0.5)), size: round1(mix(a.size, b.size, 0.5) * 1.05),
      lifespan: Math.round(mix(a.lifespan, b.lifespan, 0.5)), breedChance: round3(mix(a.breedChance, b.breedChance, 0.5) * 0.75), star: Math.max(a.star || 0, b.star || 0),
      danger: Math.max(a.danger || 0, b.danger || 0), site: a.site, rarity: rar, period: 'Hybrid (' + a.name + ' × ' + b.name + ')', length: len, predator: pred,
      fact: 'A laboratory hybrid: it has the body of a ' + a.name + ' with the head, colours and temperament of a ' + b.name + '. It draws crowds, eats well, tests every fence and is a little unstable.',
      hybrid: true, parents: [a.id, b.id], look: { base: a.id, partner: b.id, seed: h }
    };
    if (a.realm) def.realm = a.realm;
    return def;
  }
  function hybridFor(aId, bId) { var R = RS(); for (var k = 0; k < R.hybrids.length; k++) { var p = R.hybrids[k].def.parents; if ((p[0] === aId && p[1] === bId) || (p[0] === bId && p[1] === aId)) return R.hybrids[k]; } return null; }
  function hybridOdds(aId, bId, staffId, opts) {
    var R = RS(), SP = SPt(), a = SP[aId], b = SP[bId], guide = opts && typeof opts.guide === 'number' ? clamp(opts.guide, 0, 1) : 0;
    var out = { success: 0, critical: 0, fail: 1, hours: 0, cost: 0, canStart: false, why: '', breakdown: [], genomeLoss: [2, 4], genomeLossCrit: [6, 10], scientist: null, preview: null };
    if (!a || !b) { out.why = 'Pick two species'; return out; }
    if (aId === bId) { out.why = 'Pick two different species'; return out; }
    out.preview = makeHybridDef(a, b);
    var ga = R.genomes[aId], gb = R.genomes[bId], mn = Math.min(ga, gb), sci = C.sciPick(staffId), skill = sci ? sci.skill : 1, seqL = C.eqLevel('sequencer'), cleanL = C.eqLevel('clean_room'), bd = [];
    var gbn = clamp((mn - K.hybMinGenome) * 0.01, 0, 0.2), rarPen = 0.03 * ((a.rarity || 1) + (b.rarity || 1) - 2);
    var raw = K.hybBase + gbn + RC.skillPerPoint * (skill - 1) + RC.seqBonus[seqL] + K.guideBonus * guide - rarPen, pS = clamp(raw, 0.05, 0.8);
    bd.push({ label: 'Base chance', value: K.hybBase });
    bd.push({ label: 'Both genomes high (lowest ' + Math.floor(mn) + '%)', value: round3(gbn) });
    bd.push({ label: 'Scientist skill ' + skill.toFixed(1), value: round3(RC.skillPerPoint * (skill - 1)) });
    if (seqL) bd.push({ label: 'Genome sequencer ' + ({ 1: 'I', 2: 'II', 3: 'III' })[seqL], value: RC.seqBonus[seqL] });
    if (rarPen) bd.push({ label: 'Rare parents are harder to match', value: -round3(rarPen) });
    if (guide > 0) bd.push({ label: 'Guided by your splicing puzzle', value: round3(K.guideBonus * guide) });
    if (pS !== raw) bd.push({ label: 'Limits', value: round3(pS - raw) });
    var crit = Math.min(0.18 * RC.cleanMul[cleanL] * (1.2 - 0.12 * (skill - 1)) * (1 - 0.4 * guide), 1 - pS);
    var cost = K.hybCost + K.hybCostPerRar * ((a.rarity || 1) + (b.rarity || 1)), fu = Math.min(R.funding, cost), why = '';
    if (a.modern || b.modern) why = 'Modern animals cannot be crossed (use their genes instead)';
    else if (realmOf(a) !== realmOf(b)) why = 'Land, sea and air species cannot be crossed with each other';
    else if (ga < K.hybMinGenome || gb < K.hybMinGenome) why = 'Both genomes need to be at least ' + K.hybMinGenome + '% (now ' + Math.floor(ga) + '% and ' + Math.floor(gb) + '%)';
    else if (hybridFor(aId, bId)) why = 'You have already created ' + hybridFor(aId, bId).def.name + ' from this pair';
    else if (R.hybrids.length >= K.hybMax) why = 'Your lab can only keep ' + K.hybMax + ' hybrid species';
    else if (C.labWhy()) why = C.labWhy();
    else if (!sci) why = C.scientists().length ? 'All scientists are busy' : 'Hire a scientist first';
    else if (S().money < cost - fu) why = 'Not enough money (' + fmt(cost) + ')';
    out.success = round3(pS); out.critical = round3(crit); out.fail = round3(1 - pS - crit); out.hours = C.jobHours(K.hybHours, sci); out.cost = cost; out.fundingUsed = fu; out.cashCost = cost - fu;
    out.canStart = !why; out.why = why; out.breakdown = bd; out.scientist = sci ? { id: sci.id, name: sci.name, skill: sci.skill } : null; out.a = aId; out.b = bId;
    return out;
  }
  function startHybrid(aId, bId, staffId, opts) {
    var dry = C.dryOf(arguments), op = staffId && typeof staffId === 'object' ? staffId : opts; if (typeof staffId === 'object') staffId = undefined;
    var R = RS(), od = hybridOdds(aId, bId, staffId, op);
    if (!od.canStart) return fail(od.why);
    if (dry) return okr(od.cost);
    C.payScience(od.cost);
    var job = { id: C.newId(), kind: 'hybrid', a: aId, b: bId, staffId: od.scientist.id, t: od.hours, total: od.hours, chance: od.success, cost: od.cost, odds: { ok: od.success, crit: od.critical }, guide: op && typeof op.guide === 'number' ? clamp(op.guide, 0, 1) : 0 };
    R.jobs.push(job); R.stats.experiments++;
    bus.emit('research');
    return okr(od.cost, { jobId: job.id, hours: od.hours });
  }
  function register(def) {
    var SP = SPt(); if (!SP[def.id]) D.animals.push(def); else { for (var k = 0; k < D.animals.length; k++) if (D.animals[k].id === def.id) D.animals[k] = def; }
    SP[def.id] = def;
  }
  DNA.resolveHybrid = function (job) {
    var R = RS(), SP = SPt(), a = SP[job.a], b = SP[job.b], u = rng.next(), outcome, st = S();
    var nmS = (function () { for (var k = 0; k < st.staff.length; k++) if (st.staff[k].id === job.staffId) return st.staff[k]; return null; })(), nm = nmS ? nmS.name : 'The scientist';
    var F = C.RT().force; if (F && F.hybrid) { var fo = F.hybrid; F.hybrid = null; u = fo === 'success' ? 0 : fo === 'critical' ? job.odds.ok + 0.0001 : 0.99999; }
    outcome = u < job.odds.ok ? 'success' : u < job.odds.ok + job.odds.crit ? 'critical' : 'fail';
    if (outcome === 'success' && (R.hybrids.length >= K.hybMax || hybridFor(job.a, job.b))) outcome = 'fail';
    var res = { job: job, outcome: outcome, species: job.a }, loss;
    if (outcome === 'success') {
      var def = makeHybridDef(a, b);
      register(def); ensure(R); R.genomes[def.id] = K.hybGenome; R.traits[def.id] = [];
      R.hybrids.push({ id: def.id, a: job.a, b: job.b, day: st.day, def: def });
      R.stats.hybrids++; R.stats.successes++; res.species = def.id; res.hybrid = def;
      C.rlog(nm + ' has created a new species: ' + def.name + ' (' + a.name + ' × ' + b.name + ')! Its genome starts at ' + K.hybGenome + '% and improves with good husbandry.', 'good');
      C.xpUp(nmS, 45);
    } else {
      loss = outcome === 'critical' ? [rng.range(6, 10), rng.range(6, 10)] : [rng.range(2, 4), rng.range(2, 4)];
      R.genomes[job.a] = Math.max(0, round1(R.genomes[job.a] - loss[0])); R.genomes[job.b] = Math.max(0, round1(R.genomes[job.b] - loss[1]));
      res.loss = loss.map(round1); R.stats.failures++; if (outcome === 'critical') R.stats.criticals++;
      C.rlog(outcome === 'critical' ? 'The ' + a.name + ' × ' + b.name + ' cross collapsed. Both genomes were damaged: -' + round1(loss[0]) + '% and -' + round1(loss[1]) + '%.' : nm + "'s " + a.name + ' × ' + b.name + ' cross did not take. Some genome material was wasted: -' + round1(loss[0]) + '% and -' + round1(loss[1]) + '%.', outcome === 'critical' ? 'bad' : 'info');
      C.xpUp(nmS, outcome === 'critical' ? 5 : 12);
    }
    bus.emit('experiment', { job: job, outcome: outcome, species: res.species, hybrid: res.hybrid || null, loss: res.loss, genome: R.genomes[res.species] });
  };

  // ------------------------------------------------------------------ lifecycle hooks (called from 20-sim.js)
  function purge() {
    var SP = SPt(); for (var k = D.animals.length - 1; k >= 0; k--) if (D.animals[k].hybrid) { delete SP[D.animals[k].id]; D.animals.splice(k, 1); }
    ensured = null;
  }
  DNA.beforeReset = purge;
  DNA.afterReset = function () { var R = ensure(S().research); refreshDonors(true); };
  DNA.afterLoad = function () {
    purge();
    var R = S().research; if (!R.hybrids) R.hybrids = [];
    R.hybrids.forEach(function (h) { register(h.def); });
    ensure(R);
    if (!R.donorStock.length) refreshDonors(true);
  };
  DNA.daily = function () { RS(); refreshDonors(false); };

  // ------------------------------------------------------------------ public API (Z.Sim.research)
  function bench() {
    var R = RS(), SP = SPt(), a = assign(), st = assistState(), free = C.freeScientists(), sc = C.scientists(), totalRem = 0, totalRate = 0;
    var list = R.batches.map(function (b, i) {
      var r = a.rate[b.id] || 0, rem = Math.max(0, b.work - b.done), ws = (a.batch[b.id] || []).map(function (s) { return { id: s.id, name: s.name, skill: s.skill }; });
      totalRem += rem; totalRate += r;
      var d = b.kind === 'donor' ? donor(b.donor) : null;
      return { id: b.id, kind: b.kind, species: b.species || null, donor: b.donor || null, name: d ? d.name + ' DNA' : SP[b.species].name, emoji: d ? d.emoji : SP[b.species].emoji, grade: b.grade || 0, site: b.site || null,
        quality: b.quality, integrity: b.integrity, frags: b.frags, doses: b.doses || 0, gain: b.gain, expectedGain: b.kind === 'dino' ? round1(b.gain * b.integrity * (1 - R.genomes[b.species] / RC.gainDiminish)) : 0,
        pct: clamp(b.done / b.work, 0, 1), work: b.work, done: b.done, rate: round3(r), etaHours: r > 0 ? rem / r : null, workers: ws, boosts: b.boosts, src: b.src, day: b.day, position: i, assist: assistInfo(b.id) };
    });
    var hint = '';
    if (!R.batches.length) hint = '';
    else if (!C.labOnline()) hint = C.labWhy() || 'The lab is offline, so sequencing is paused.';
    else if (!sc.length) hint = 'No scientists. Hire one in the Team tab: nobody is sequencing.';
    else if (!free.length) hint = 'Every scientist is busy with an experiment, so no sequencing is happening until one is free.';
    return { batches: list, free: free.length, scientists: sc.length, labOnline: C.labOnline(), hint: hint, rate: round3(totalRate), backlogHours: totalRate > 0 ? totalRem / totalRate : null, queueCap: K.queueCap,
      attemptsLeft: Math.max(0, K.assistPerDay - st.used), attemptsMax: K.assistPerDay, working: free.length > 0 && R.batches.length > 0 && C.labOnline() };
  }
  function donorList() {
    var R = RS();
    return D.donors.map(function (d) { var g = null; for (var k = 0; k < D.traits.length; k++) if (D.traits[k].id === d.gene) g = D.traits[k]; return { id: d.id, name: d.name, emoji: d.emoji, blurb: d.blurb, gene: d.gene, geneName: g ? g.name : d.gene, doses: R.donorDoses[d.id] || 0, price: d.price, star: d.star, unlocked: d.star <= S().unlocked.star, queued: R.batches.filter(function (b) { return b.donor === d.id; }).reduce(function (n, b) { return n + b.doses; }, 0) }; });
  }
  function hybridList() { return RS().hybrids.map(function (h) { return { id: h.id, name: h.def.name, a: h.a, b: h.b, day: h.day, genome: S().research.genomes[h.id] }; }); }
  var oSummary = api.summary, oGenomeInfo = api.genomeInfo;
  Object.assign(api, {
    sequencing: bench, prioritise: prioritise, assistInfo: assistInfo, assistSequencing: assistSequencing,
    donorStock: function () { var R = RS(); return R.donorStock.map(function (l) { var d = donor(l.donor); return { id: l.id, donor: l.donor, name: d.name, emoji: d.emoji, blurb: d.blurb, gene: d.gene, doses: l.doses, price: l.price, daysLeft: Math.max(0, l.exp - S().day), star: d.star }; }); },
    buyDonor: buyDonor, addDonor: addDonor, donors: donorList,
    hybridOdds: hybridOdds, startHybrid: startHybrid, hybrids: hybridList, previewHybrid: function (a, b) { var SP = SPt(); return SP[a] && SP[b] && a !== b ? makeHybridDef(SP[a], SP[b]) : null; },
    summary: function () {
      var s = oSummary(), R = RS(), sq = bench();
      s.batches = R.batches.length; s.batchCap = K.queueCap; s.sequencingFree = sq.free; s.sequencingHint = sq.hint; s.backlogHours = sq.backlogHours; s.puzzleAttempts = sq.attemptsLeft; s.hybrids = R.hybrids.length;
      return s;
    },
    genomeInfo: function (id) { var g = oGenomeInfo(id); if (g) { var sp = SPt()[id]; g.hybrid = !!sp.hybrid; g.modern = !!sp.modern; g.realm = realmOf(sp); } return g; },
    DNA_CONST: K
  });
  // the sim's own Z.Sim.addDonor shortcut for other packages (wild modern animals wandering in)
  Z.Sim.research.addDonor = addDonor;
})();
