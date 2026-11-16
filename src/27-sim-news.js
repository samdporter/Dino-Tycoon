// ===== 27-sim-news.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - news package, sim side (DOM-free, runs under node).  See notes/news.md.
   Z.Sim.news (== Z.News).post({kind, severity 1-5, headline?, data}) turns an incident into a newspaper story with MECHANICAL effects that last for days:
   arrivals (all / family / thrill-seeker guests), merchandise sales, insurance premium, wage demands, protesters at the gate, inspections, fines, a one-day closure, sponsors, grants.
   Bad stories feed MEDIA HEAT (0-100, decays): heat amplifies later bad effects and at the top the authorities act. Good stories feed ACCLAIM and earn awards.
   SAVED  S.news { feed[], effects[], heat, acclaim, resp{}, cool, closedUntil, seen{}, born{}, ... }.  Bus: 'news' {story}, 'newsEffects'. */
(function () {
  'use strict';
  var C = Z.powerCtx; if (!C) return;
  var N = Z.N, D = Z.DATA, ND = D.news, bus = Z.bus, clamp = C.clamp;
  var NW = Z.News = {};
  if (Z.Sim) Z.Sim.news = NW;
  var PARK = 'Amber Acres', TS = 0.15;   // thrill-seeker share of arrivals
  function S() { return C.S(); }
  function RT() { return C.RT(); }

  // private random stream (state saved in rs): keeps the shared sim rng sequence identical to a game without this package
  var R = {
    next: function () { var o = ensure(); var t = (o.rs = (o.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    range: function (a, b) { return a + (b - a) * R.next(); }, chance: function (p) { return R.next() < p; }, pick: function (arr) { return arr[Math.floor(R.next() * arr.length)]; }
  };
  function SPD() { return C.SP(); }
  function now() { var s = S(); return s.day + s.time; }
  function ensure() {
    var s = S(); if (!s) return null;
    var d = { v: 1, rs: ((Z.rng.getSeed() ^ 0x7F4A7C15) | 1), feed: [], effects: [], heat: 0, acclaim: 0, nextId: 1, resp: {}, cool: 0, closedUntil: 0, seen: {}, born: {}, lastBad: 0, ratingMax: 0, peak: 0, hiPrice: -99, wLow: -99, wHigh: -99, quiet: 0, awardDay: -99, inspectDay: 0,
      stormT0: 0, stormBad: false, stormDay: -99, authDay: -99, donSeen: 0, today: {}, counts: {}, sponsorAt: -99 };
    if (!s.news || typeof s.news !== 'object') s.news = d;
    else for (var k in d) if (s.news[k] === undefined) s.news[k] = d[k];
    return s.news;
  }

  // ------------------------------------------------------------------ aggregated effect values (cache)
  var A = { arrivals: 1, family: 1, thrill: 1, merch: 1, insurance: 0, wages: 1, protest: 0, income: 0, sig: '' };
  function recompute() {
    var n = ensure(), t = now(), a = { arrivals: 1, family: 1, thrill: 1, merch: 1, insurance: 0, wages: 1, protest: 0, income: 0 };
    for (var k = 0; k < n.effects.length; k++) {
      var e = n.effects[k]; if (e.until <= t || e.key === 'inspection') continue;
      if (e.key === 'insurance' || e.key === 'income') a[e.key] += e.val;
      else if (e.key === 'protest') a.protest += e.val;
      else a[e.key] *= e.val;
    }
    A.arrivals = clamp(a.arrivals, 0.25, 2.2); A.family = clamp(a.family, 0.3, 1.8); A.thrill = clamp(a.thrill, 0.5, 3); A.merch = clamp(a.merch, 0.7, 2); A.wages = clamp(a.wages, 1, 1.35);
    A.insurance = Math.min(a.insurance, 400); A.income = a.income; A.protest = Math.min(12, Math.round(a.protest));
  }
  NW.arrivalMul = function () {
    var slow = 1 - Math.min(0.28, A.protest * 0.025);
    return clamp(A.arrivals * ((1 - TS) * A.family + TS * A.thrill) * slow, 0.15, 2.6);
  };
  NW.merchMul = function () { return A.merch; };
  NW.wageMul = function () { return A.wages; };
  NW.closed = function () { var n = S() && S().news; return !!(n && S().day < n.closedUntil); };
  NW.protest = function () { return A.protest; };
  NW.heat = function () { var n = S() && S().news; return n ? n.heat : 0; };
  NW.acclaim = function () { var n = S() && S().news; return n ? n.acclaim : 0; };
  NW.tagGuest = function (g) {
    var share = TS * A.thrill / ((1 - TS) * A.family + TS * A.thrill);
    if (R.next() < share) { g.thrill = 1; g.money = Math.round(g.money * 1.15); if (g.al && !g.al.shop) g.al.shop = 1; }
  };

  // ------------------------------------------------------------------ effects
  function heatMul() { return 1 + ensure().heat / 70; }
  function addEffect(sid, key, val, days, name, good, extra) {
    var n = ensure(), e = { id: n.nextId++, sid: sid, key: key, val: val, until: now() + days, name: name, good: !!good, days: days };
    if (extra) for (var k in extra) e[k] = extra[k];
    n.effects.push(e); recompute(); bus.emit('newsEffects');
    return e;
  }
  NW.addEffect = function (key, val, days, name, good) { return addEffect(0, key, val, days, name, good); };
  function effText(e) {
    var pct = function (v) { return Math.round(Math.abs(v - 1) * 100) + '%'; };
    switch (e.key) {
      case 'arrivals': return e.val < 1 ? 'Arrivals down ' + pct(e.val) : 'Arrivals up ' + pct(e.val);
      case 'family': return e.val < 1 ? 'Family visitors down ' + pct(e.val) : 'Family visitors up ' + pct(e.val);
      case 'thrill': return e.val < 1 ? 'Thrill-seekers down ' + pct(e.val) : 'Thrill-seekers up ' + pct(e.val);
      case 'merch': return 'Merchandise sales up ' + pct(e.val);
      case 'insurance': return 'Insurance premium +' + C.fmt(e.val) + ' a day';
      case 'wages': return 'Wage demands: staff costs up ' + pct(e.val);
      case 'protest': return e.val + ' protester' + (e.val === 1 ? '' : 's') + ' at the gate slow the queue';
      case 'income': return 'Sponsor pays ' + C.fmt(e.val) + ' a day';
      case 'inspection': return 'Safety inspection due on day ' + Math.floor(e.until);
    }
    return e.name || e.key;
  }
  function labelOf(e) { return e.name || effText(e); }
  NW.activeEffects = function () {
    var n = ensure(), t = now(), out = [];
    for (var k = 0; k < n.effects.length; k++) { var e = n.effects[k]; if (e.until <= t) continue; out.push({ id: e.id, sid: e.sid, key: e.key, text: effText(e), name: labelOf(e), good: e.good, daysLeft: Math.max(0, e.until - t), val: e.val }); }
    out.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
    return out;
  };
  function addHeat(v) { var n = ensure(); n.heat = clamp(n.heat + v, 0, 100); }
  function addAcclaim(v) { var n = ensure(); n.acclaim = clamp(n.acclaim + v, 0, 100); }
  function rep(v) { var s = S(); s.reputation = clamp(s.reputation + v, 0, 100); }

  // ------------------------------------------------------------------ headline generation
  function fill(tpl, d) { return tpl.replace(/\{(\w+)\}/g, function (m, k) { return d[k] !== undefined ? d[k] : m; }); }
  function tokens(kind, data) {
    var t = { park: PARK, n: 1, hours: 4, amt: '£500', days: 5, hybrid: 'new species', prey: 'a neighbour', price: '£12', award: 'Best Day Out' }, k;
    data = data || {};
    var sp = data.species && SPD()[data.species];
    if (sp) { t.sp = sp.name; t.spp = C.plural(sp); }
    else { t.sp = 'Dinosaur'; t.spp = 'Dinosaurs'; }
    t.name = data.name || 'Dinah';
    if (data.prey && SPD()[data.prey]) t.prey = C.lc(SPD()[data.prey].name);
    for (k in data) if (typeof data[k] === 'string' || typeof data[k] === 'number') { if (k === 'species' || k === 'prey') continue; t[k] = data[k]; }
    if (typeof t.amt === 'number') t.amt = C.fmt(t.amt);
    if (typeof t.price === 'number') t.price = C.fmt(t.price);
    return t;
  }

  // ------------------------------------------------------------------ effect profiles per story kind
  function sv(st) { return clamp(st.sev, 1, 5); }
  function dip(s, k) { return clamp(1 - k * s * heatMul(), 0.45, 1); }
  var PROFILE = {
    escape: function (st) {
      var s = sv(st); addEffect(st.id, 'arrivals', dip(s, 0.045), 2 + s, 'Escape: guests wary', false); addHeat(5 * s);
      if (s >= 3) { addEffect(st.id, 'thrill', 1 + 0.12 * s, 3 + s, 'Disaster tourism', true); addEffect(st.id, 'family', dip(s, 0.05), 3 + s, 'Families stay away', false); addEffect(st.id, 'merch', 1.15, 3, 'Merchandise spike', true); scheduleInspection(st, 3); }
    },
    escape_injury: function (st) {
      var s = sv(st), hm = heatMul(), n = ensure();
      addEffect(st.id, 'arrivals', dip(s, 0.06), 3 + s, 'Injuries: arrivals crash', false);
      addEffect(st.id, 'insurance', Math.round(35 * s * hm / 5) * 5, 6 + 2 * s, 'Insurance premium', false);
      addEffect(st.id, 'protest', 2 + s, 3 + s, 'Protesters at the gate', false);
      addEffect(st.id, 'thrill', 1 + 0.18 * s, 4 + s, 'Disaster tourism', true); addEffect(st.id, 'family', dip(s, 0.08), 4 + s, 'Families stay away', false);
      addEffect(st.id, 'merch', 1.2, 4, 'Merchandise spike', true);
      var claim = Math.round(120 * s * hm / 10) * 10; C.spend(claim, 'other'); st.extra = (st.extra || []).concat(['Compensation claims: ' + C.fmt(claim)]);
      scheduleInspection(st, 3); addHeat(9 * s);
      if (s >= 4 || n.heat > 55) { if (R.chance(0.6)) quitStaff(st); addEffect(st.id, 'wages', 1.08, 6, 'Wage demands', false); }
    },
    escape_cluster: function (st) { var s = sv(st); addHeat(6); addEffect(st.id, 'arrivals', dip(s, 0.04), 3, 'Chaos at the park', false); },
    recapture: function (st) { addEffect(st.id, 'arrivals', 1.07, 3, 'Heroic rangers', true); addEffect(st.id, 'merch', 1.1, 3, 'Merchandise spike', true); addAcclaim(8); addHeat(-5); rep(1.5); },
    death: function (st) { addAcclaim(0); },
    death_neglect: function (st) { addEffect(st.id, 'arrivals', dip(2, 0.04), 4, 'Welfare concerns', false); addEffect(st.id, 'protest', 2, 3, 'Protesters at the gate', false); addHeat(6); rep(-1); },
    predation_view: function (st) { var s = sv(st); addEffect(st.id, 'thrill', 1 + 0.12 * s, 4, 'Thrill-seekers flock in', true); addEffect(st.id, 'family', dip(s, 0.035), 4, 'Families unsettled', false); addEffect(st.id, 'merch', 1.12, 4, 'Merchandise spike', true); addHeat(2); },
    predation_quiet: function (st) { },
    birth: function (st) { var s = sv(st); addEffect(st.id, 'arrivals', 1 + 0.03 + 0.02 * s, 3, 'Baby boom', true); gift(st, 60 * s); addAcclaim(3); },
    hatch: function (st) { addEffect(st.id, 'arrivals', 1.04, 2, 'A new arrival', true); addAcclaim(2); },
    species_first: function (st) {
      addEffect(st.id, 'arrivals', 1.18, 5, 'A first for the island', true); gift(st, 400); addAcclaim(8); rep(2);
      if (R.chance(0.4)) sponsor(st);
    },
    hybrid: function (st) {
      var amt = Math.round(R.range(2200, 3400) / 50) * 50, RS = S().research; if (RS) { RS.funding += amt; S().stats.fundingTotal += amt; }
      st.extra = (st.extra || []).concat(['Scientists offer a research grant of ' + C.fmt(amt)]);
      addEffect(st.id, 'protest', 3, 5, 'Ethics protest at the gate', false); addEffect(st.id, 'arrivals', 0.93, 5, 'Ethics controversy', false); addEffect(st.id, 'thrill', 1.15, 5, 'Curious crowds', true); addHeat(7); addAcclaim(4);
    },
    power_cut: function (st) { var s = sv(st); addEffect(st.id, 'arrivals', dip(s, 0.04), 2, 'Blackout: guests put off', false); addHeat(3 * s); },
    power_backup: function (st) { addAcclaim(6); addEffect(st.id, 'arrivals', 1.05, 2, 'Reliable power', true); },
    sabotage: function (st) { addHeat(6); addEffect(st.id, 'arrivals', 0.95, 2, 'Sabotage scare', false); addEffect(st.id, 'thrill', 1.1, 3, 'Curious crowds', true); },
    mono_stuck: function (st) { var n = (st.data && st.data.n) || 4; C.spend(Math.min(600, 20 * n), 'other'); addEffect(st.id, 'arrivals', 0.92, 3, 'Monorail embarrassment', false); addHeat(3); },
    wildlife_killed: function (st) { addEffect(st.id, 'protest', 4, 6, 'Wildlife protest at the gate', false); addEffect(st.id, 'arrivals', dip(3, 0.04), 5, 'Outrage', false); addHeat(10); },
    storm_weathered: function (st) { addAcclaim(6); addEffect(st.id, 'arrivals', 1.08, 2, 'Storm hero', true); },
    award: function (st) { gift(st, 1200); addEffect(st.id, 'arrivals', 1.15, 6, 'Award winner', true); addEffect(st.id, 'merch', 1.2, 6, 'Merchandise spike', true); rep(5); addAcclaim(-45); addHeat(-12); },
    rating: function (st) { addEffect(st.id, 'arrivals', 1.1, 4, 'Critics are impressed', true); rep(3); addAcclaim(6); },
    record_crowd: function (st) { addEffect(st.id, 'merch', 1.15, 3, 'Merchandise spike', true); addEffect(st.id, 'arrivals', 1.04, 3, 'Buzz', true); addAcclaim(4); },
    donation: function (st) { addAcclaim(2); },
    inspection_pass: function (st) { addAcclaim(6); rep(2); },
    inspection_fail: function (st) { addEffect(st.id, 'arrivals', 0.95, 3, 'Failed inspection', false); addHeat(6); },
    high_prices: function (st) { addEffect(st.id, 'arrivals', dip(2, 0.04), 3, 'Prices criticised', false); rep(-1); },
    welfare_low: function (st) { addEffect(st.id, 'protest', 3, 5, 'Welfare protest at the gate', false); addEffect(st.id, 'arrivals', 0.9, 4, 'Welfare concerns', false); addHeat(8); scheduleInspection(st, 3); },
    welfare_high: function (st) { addAcclaim(8); gift(st, 500); addEffect(st.id, 'arrivals', 1.07, 4, 'Praised for welfare', true); },
    quiet: function (st) { addAcclaim(10); addEffect(st.id, 'arrivals', 1.05, 3, 'Safe reputation', true); },
    closure: function (st) { addEffect(st.id, 'arrivals', 0.9, 3, 'Closure aftermath', false); addHeat(-25); },
    fine: function (st) { var amt = (st.data && st.data.raw) || 600; C.spend(amt, 'other'); addHeat(-15); },
    press_tour: function (st) { addEffect(st.id, 'arrivals', 1.12, 5, 'Press praise', true); addAcclaim(8); addHeat(-14); },
    press_backfire: function (st) { addHeat(16); addEffect(st.id, 'arrivals', 0.9, 4, 'Exposé fallout', false); addEffect(st.id, 'protest', 3, 4, 'Protesters at the gate', false); },
    sponsor: function (st) { },
    grant: function (st) { }
  };
  function gift(st, amt) { amt = Math.round(amt / 10) * 10; if (amt > 0) { C.earn(amt, 'donations'); ensure().donSeen = S().finance.today.donations || 0; st.extra = (st.extra || []).concat(['Donations: ' + C.fmt(amt)]); } }
  function sponsor(st) {
    var amt = Math.round(R.range(50, 90) / 5) * 5, days = 8;
    addEffect(st.id, 'income', amt, days, 'Sponsorship', true); st.extra = (st.extra || []).concat(['Sponsor pays ' + C.fmt(amt) + ' a day for ' + days + ' days']);
  }
  function quitStaff(st) {
    var s = S(), list = s.staff.filter(function (x) { return x.type !== 'scientist'; });
    if (list.length < 2) return;
    var w = R.pick(list); if (Z.Power) Z.Power._quiet = true; C.fireStaff(w.id); if (Z.Power) Z.Power._quiet = false; st.extra = (st.extra || []).concat([w.name + ' has resigned']);
    C.msg(w.name + ' has resigned after the bad press.', 'bad');
  }
  function scheduleInspection(st, days) {
    var n = ensure(), t = now();
    for (var k = 0; k < n.effects.length; k++) if (n.effects[k].key === 'inspection' && n.effects[k].until > t) return;
    addEffect(st.id, 'inspection', 1, days, 'Safety inspection', false);
  }
  var NEG = { escape: 1, escape_injury: 1, escape_cluster: 1, death_neglect: 1, power_cut: 1, sabotage: 1, mono_stuck: 1, wildlife_killed: 1, inspection_fail: 1, high_prices: 1, welfare_low: 1, closure: 1, fine: 1, press_backfire: 1 };

  // ------------------------------------------------------------------ posting
  NW.post = function (o) {
    var n = ensure(), s = S(); if (!n || !o) return null;
    var kind = o.kind || 'generic', K = ND.kinds[kind], data = o.data || {}, sev = clamp(Math.round(o.severity || 1), 1, 5);
    // limit repeats of the same minor kind per day
    var key = kind + (data.species || ''), cnt = n.today[key] || 0;
    if (cnt >= (kind === 'escape' ? 4 : 2) && !o.force) return null;
    n.today[key] = cnt + 1;
    var tk = tokens(kind, data), mood = K ? K.mood : (o.mood || 'info');
    var head = o.headline || (K ? fill(R.pick(K.head), tk) : 'News from ' + PARK);
    var sub = o.sub || (K && K.sub ? fill(R.pick(K.sub), tk) : '');
    var outlet = R.pick(ND.outlets);
    var st = { id: n.nextId++, day: s.day, time: s.time, kind: kind, sev: sev, mood: mood, headline: head, sub: sub, outlet: outlet.name, outletId: outlet.id, data: data, extra: [], fxIds: [], resp: null, open: false };
    var before = n.effects.length;
    if (o.noEffects !== true && PROFILE[kind]) PROFILE[kind](st);
    for (var k = before; k < n.effects.length; k++) if (n.effects[k].sid === st.id) st.fxIds.push(n.effects[k].id);
    st.fx = st.fxIds.map(function (id) { for (var q = 0; q < n.effects.length; q++) if (n.effects[q].id === id) return effText(n.effects[q]) + ' (' + Math.max(1, Math.round(n.effects[q].days)) + ' days)'; return ''; }).filter(Boolean).concat(st.extra);
    st.extra = undefined;
    st.open = (mood === 'bad' || mood === 'mixed') && sev >= 2 && NEG[kind] !== undefined || (kind === 'hybrid');
    if (NEG[kind]) n.lastBad = s.day;
    n.feed.unshift(st); if (n.feed.length > 60) n.feed.length = 60;
    recompute();
    bus.emit('news', { story: st });
    return st;
  };
  NW.feed = function () { return ensure().feed; };
  NW.story = function (id) { var f = ensure().feed; for (var k = 0; k < f.length; k++) if (f[k].id === id) return f[k]; return null; };

  // ------------------------------------------------------------------ player responses
  function welfare() { return C.computeRating().welfare; }
  NW.options = function (id) {
    var st = NW.story(id), n = ensure(), s = S(); if (!st) return [];
    var respondable = st.open && !n.resp[id] && (now() - (st.day + st.time)) < 5, cool = n.cool > now();
    var sev = st.sev, gn = s.guests.length;
    var list = [
      { id: 'apology', label: 'Apologise and refund', cost: 300 + 120 * sev + gn * 2, desc: 'Cuts the damage: shortens this story\'s effects by 40%, heat down a little.' },
      { id: 'pr', label: 'PR campaign', cost: 1200 + 500 * sev, desc: 'Spin doctors cool the heat a lot and halve the damage to arrivals.' },
      { id: 'press', label: 'Invite a press tour', cost: 350, desc: 'Cheap, but risky: great if your animals are happy, a disaster if they are not.' },
      { id: 'ignore', label: 'Say nothing', cost: 0, desc: 'Free. The story fades by itself.' }
    ];
    list.forEach(function (o) { o.ok = respondable && s.money >= o.cost && (o.id === 'ignore' || !cool); o.why = !respondable ? (n.resp[id] ? 'Already answered' : 'Too late to respond') : (o.id !== 'ignore' && cool) ? 'Press office is busy (cooldown)' : s.money < o.cost ? 'Not enough money' : ''; });
    return list;
  };
  NW.respond = function (id, choice) {
    var n = ensure(), s = S(), st = NW.story(id), opt = NW.options(id).filter(function (o) { return o.id === choice; })[0];
    if (!st || !opt) return { ok: false, msg: 'No such story' };
    if (!opt.ok) return { ok: false, msg: opt.why || 'Not available' };
    if (opt.cost) C.spend(opt.cost, 'marketing');
    n.resp[id] = choice; st.resp = { choice: choice, day: s.day };
    var t = now(), k, e, msg = '';
    if (choice === 'apology' || choice === 'pr') {
      for (k = 0; k < n.effects.length; k++) {
        e = n.effects[k]; if (e.sid !== id || e.good || e.key === 'inspection') continue;
        if (choice === 'apology') e.until = t + (e.until - t) * 0.6;
        else { if (e.key === 'arrivals' || e.key === 'family') e.val = 1 - (1 - e.val) * 0.5; if (e.key === 'protest') e.until = t + (e.until - t) * 0.5; }
      }
      if (choice === 'apology') { addHeat(-(8 + 3 * st.sev)); rep(1.5); msg = 'The apology and refunds were well received.'; }
      else { addHeat(-(16 + 4 * st.sev)); rep(2); msg = 'The PR campaign has calmed the headlines.'; }
      n.cool = t + 1;
    } else if (choice === 'press') {
      n.cool = t + 1;
      var w = welfare(), good = w >= 0.62 || (w >= 0.48 && R.chance((w - 0.4) * 3));
      var ex = null; var an = S().animals.filter(function (a) { return a.enc; }); if (an.length) ex = an[Math.floor(R.next() * an.length)];
      var data = ex ? { species: ex.species } : {};
      if (good) { NW.post({ kind: 'press_tour', severity: 2, data: data, force: true }); msg = 'The press tour went wonderfully.'; }
      else { NW.post({ kind: 'press_backfire', severity: 3, data: data, force: true }); msg = 'The press tour backfired: journalists saw the conditions.'; }
    } else msg = 'You decided to say nothing.';
    recompute(); bus.emit('newsEffects'); bus.emit('news', { story: st, updated: true });
    C.msg(msg, choice === 'press' && /backfired/.test(msg) ? 'bad' : 'info', false);
    return { ok: true, msg: msg, cost: opt.cost };
  };

  // ------------------------------------------------------------------ bus-driven stories
  var esc = {}, pendInj = null, pendDeath = {}, tick = 0, lastClusterAt = -9;
  function dangerSev(a) { var d = C.aDanger(a); return d >= 3 ? 4 : d === 2 ? 3 : d === 1 ? 2 : 1; }
  bus.on('escape', function (a) {
    var n = ensure(); if (!n || !a) return; var s = S();
    esc[a.id] = { t: now(), inj: s.stats.injuries };
    var sev = dangerSev(a), cluster = RT().escaped ? RT().escaped.length + 1 : 1;
    if (cluster >= 3 && now() - lastClusterAt > 0.2) { lastClusterAt = now(); NW.post({ kind: 'escape_cluster', severity: Math.min(5, 2 + cluster), data: { n: cluster, species: a.species, name: a.name }, force: true }); return; }
    NW.post({ kind: 'escape', severity: sev, data: { species: a.species, name: a.name } });
  });
  bus.on('injury', function (e) {
    if (!e) return; if (!pendInj) pendInj = { n: 0, animal: e.animal, age: 0, comp: 0 };
    pendInj.n++; pendInj.comp += e.compensation || 0;
  });
  bus.on('recapture', function (a) {
    var rec = a && esc[a.id]; if (!rec) return; delete esc[a.id];
    var s = S(); if (s.stats.injuries !== rec.inj) return;
    if (C.aDanger(a) >= 1 || R.chance(0.4)) NW.post({ kind: 'recapture', severity: C.aDanger(a) >= 2 ? 3 : 2, data: { species: a.species, name: a.name } });
  });
  bus.on('death', function (a) { if (a && a.id) pendDeath[a.id] = { sp: a.species, name: a.name, age: 0, hun: a.hunger, hap: a.happiness, hp: a.health }; });
  bus.on('predation', function (e) {
    if (!e || !e.prey) return; delete pendDeath[e.prey.id];
    var s = S(), px = e.prey.x, pz = e.prey.z, nn = 0;
    for (var k = 0; k < s.guests.length; k++) { var g = s.guests[k]; if (g.state === 'leave') continue; var dx = g.x - px, dz = g.z - pz; if (dx * dx + dz * dz < 196) nn++; }
    if (nn >= 2) NW.post({ kind: 'predation_view', severity: nn >= 8 ? 3 : 2, data: { species: e.predator.species, prey: e.prey.species, n: nn } });
    else if (R.chance(0.25)) NW.post({ kind: 'predation_quiet', severity: 1, data: { species: e.predator.species, prey: e.prey.species } });
  });
  bus.on('birth', function (a) {
    if (!a) return; var n = ensure(), first = !n.born[a.species]; n.born[a.species] = 1;
    NW.post({ kind: 'birth', severity: first ? 2 : 1, data: { species: a.species, name: a.name } });
  });
  bus.on('hatch', function (e) {
    if (!e || !e.ok || !e.animal) return; var n = ensure(), a = e.animal, first = !n.seen[a.species]; n.seen[a.species] = 1;
    NW.post({ kind: first ? 'species_first' : 'hatch', severity: first ? 3 : 1, data: { species: a.species, name: a.name } });
  });
  bus.on('experiment', function (e) {
    if (!e || !e.hybrid) return;
    NW.post({ kind: 'hybrid', severity: 3, data: { hybrid: e.hybrid.name || 'hybrid' }, force: true });
  });
  bus.on('monoStuck', function (e) {
    if (!e) return; var s = S(), nn = 0; for (var k = 0; k < s.guests.length; k++) if (s.guests[k].state === 'ride' && s.guests[k].rtr === e.train) nn++;
    if (nn >= 2) NW.post({ kind: 'mono_stuck', severity: nn >= 10 ? 3 : 2, data: { n: nn } });
  });
  bus.on('wildlifeKilled', function (e) {
    if (e && e.safari) return;   // safari package: wild visitors taken by predators post their own balanced stories
    var sp = e && (e.species || (e.animal && e.animal.species)); NW.post({ kind: 'wildlife_killed', severity: 3, data: { species: sp && SPD()[sp] ? sp : undefined, n: (e && e.count) || 1 }, force: true });
  });
  bus.on('weather', function (w) {
    var n = ensure(), s = S(); if (!n || !w) return;
    if (w.type === 'storm' && !n.stormT0) { n.stormT0 = now(); n.stormBad = false; }
    else if (w.type !== 'storm' && n.stormT0) {
      var good = !n.stormBad && now() - n.stormT0 > 0.06 && s.day - n.stormDay > 2 && s.animals.length > 0;
      n.stormT0 = 0; if (good) { n.stormDay = s.day; NW.post({ kind: 'storm_weathered', severity: 2 }); }
    }
  });
  bus.on('power', function (e) { var n = S() && S().news; if (n && n.stormT0 && e && !e.on) n.stormBad = true; });
  bus.on('escape', function () { var n = S() && S().news; if (n && n.stormT0) n.stormBad = true; });
  bus.on('gameOver', function () { });

  // events hook (20-sim fireEvent)
  NW.onEvent = function (ev, eff, kind) {
    if (!ev || !eff) return;
    if (eff.type === 'inspection') NW.post({ kind: kind === 'good' ? 'inspection_pass' : 'inspection_fail', severity: 2, data: { amt: eff.fine || 600 }, force: true });
  };

  // ------------------------------------------------------------------ per second
  NW.secondly = function () {
    var n = ensure(), s = S(); if (!n) return;
    tick++;
    var t = now(), k, changed = false;
    for (k = n.effects.length - 1; k >= 0; k--) if (n.effects[k].until <= t && n.effects[k].key !== 'inspection') { n.effects.splice(k, 1); changed = true; }
    if (changed) { recompute(); bus.emit('newsEffects'); }
    if (pendInj && ++pendInj.age >= 3) {
      var pi = pendInj; pendInj = null;
      NW.post({ kind: 'escape_injury', severity: clamp(2 + pi.n + (C.aDanger(pi.animal) >= 3 ? 1 : 0), 3, 5), data: { n: pi.n, species: pi.animal.species, name: pi.animal.name }, force: true });
    }
    for (var id in pendDeath) {
      var d = pendDeath[id]; if (++d.age < 2) continue; delete pendDeath[id];
      var neglect = d.hun > 90 || d.hap < 25 || d.hp < 15, sp = SPD()[d.sp];
      if (neglect) NW.post({ kind: 'death_neglect', severity: 3, data: { species: d.sp, name: d.name } });
      else if ((sp && sp.rarity >= 3) || R.chance(0.35)) NW.post({ kind: 'death', severity: 1, data: { species: d.sp, name: d.name } });
    }
    // donations that arrive from events (an envelope at the gate)
    var don = s.finance.today.donations || 0;
    if (don - n.donSeen >= 400) NW.post({ kind: 'donation', severity: 1, data: { amt: Math.round(don - n.donSeen) } });
    n.donSeen = don;
    // record crowds (checked a few times a day)
    if (tick % 15 === 0) {
      var peak = s.stats.peakGuests || 0;
      if (peak >= 40 && peak > n.peak * 1.2) { if (n.peak > 0) NW.post({ kind: 'record_crowd', severity: 2, data: { n: peak } }); n.peak = peak; }
      else if (n.peak === 0) n.peak = peak;
    }
  };

  // ------------------------------------------------------------------ per day
  NW.newDay = function () {
    var n = ensure(), s = S(), t = now(), k;
    n.today = {};
    // insurance and sponsors
    if (A.insurance > 0) C.spend(Math.round(A.insurance), 'other');
    if (A.income > 0) C.earn(Math.round(A.income), 'donations');
    n.donSeen = 0;
    // decay
    n.heat = Math.max(0, n.heat * 0.92 - 1.2); n.acclaim = Math.max(0, n.acclaim - 1.5);
    // inspection due?
    for (k = n.effects.length - 1; k >= 0; k--) {
      var e = n.effects[k]; if (e.key !== 'inspection') continue;
      if (e.until <= t + 1) { n.effects.splice(k, 1); runInspection(); }
    }
    // good-news milestones
    var star = Math.floor(s.rating + 0.0001);
    if (star > n.ratingMax) { if (n.ratingMax >= 1 || star >= 2) NW.post({ kind: 'rating', severity: star >= 5 ? 3 : 2, data: { n: star } }); n.ratingMax = star; }
    var an = s.animals.filter(function (a) { return a.enc && !a.baby; });
    if (an.length >= 3) {
      var hs = 0; an.forEach(function (a) { hs += a.happiness; }); hs /= an.length;
      if (hs < 38 && s.day - n.wLow > 8) { n.wLow = s.day; NW.post({ kind: 'welfare_low', severity: 3 }); }
      else if (hs >= 78 && s.day - n.wHigh > 10) { n.wHigh = s.day; NW.post({ kind: 'welfare_high', severity: 2 }); }
    }
    var val = RT().value || 10;
    if (s.ticketPrice > val * 1.5 && s.day - n.hiPrice > 6) { n.hiPrice = s.day; NW.post({ kind: 'high_prices', severity: 2, data: { price: s.ticketPrice } }); }
    var quiet = s.day - n.lastBad;
    if (quiet >= 12 && quiet % 12 === 0 && s.animals.length >= 2) NW.post({ kind: 'quiet', severity: 2, data: { n: quiet }, force: true });
    if (n.acclaim >= 60 && s.day - n.awardDay > 12 && s.day - n.lastBad >= 4) { n.awardDay = s.day; NW.post({ kind: 'award', severity: 3, data: { award: R.pick(['Best Day Out on the Island', 'Family Attraction of the Year', 'Gold for Animal Welfare', 'Most Improved Visitor Park']) }, force: true }); }
    // the authorities react to a scandal
    if (n.heat >= 75 && s.day - n.authDay > 5 && R.chance((n.heat - 70) / 100)) {
      n.authDay = s.day;
      if (R.chance(0.5)) { n.closedUntil = s.day + 2; NW.post({ kind: 'closure', severity: 4, data: {}, force: true }); C.msg('The authorities have closed the park for the day. Gates stay shut.', 'bad'); }
      else { var raw = Math.round((600 + n.heat * 12) / 50) * 50; NW.post({ kind: 'fine', severity: 3, data: { amt: raw, raw: raw }, force: true }); }
    }
    // keep the response memory small
    for (var id in n.resp) if (+id < n.nextId - 200) delete n.resp[id];
    recompute();
  };
  function runInspection() {
    var s = S(), rt = RT(), ok = true, why = '', k;
    for (k = 0; k < s.enclosures.length && ok; k++) {
      var en = s.enclosures[k]; if (!en.animals.length) continue;
      for (var q = 0; q < en.animals.length; q++) { var a = rt.aById.get(en.animals[q]); if (a && C.aMinFence(a) > en.minFence) { ok = false; why = 'fences too weak in ' + en.name; break; } }
    }
    var rb = C.computeRating();
    if (ok && rb.welfare < 0.35 && s.animals.length) { ok = false; why = 'animal welfare'; }
    if (ok && rb.cleanliness < 0.4) { ok = false; why = 'cleanliness'; }
    var amt = Math.round((500 + ensure().heat * 8) / 50) * 50;
    if (ok) NW.post({ kind: 'inspection_pass', severity: 2, data: { amt: amt }, force: true });
    else { C.spend(amt, 'other'); NW.post({ kind: 'inspection_fail', severity: 3, data: { amt: amt }, sub: 'Inspectors cited: ' + why + '.', force: true }); }
  }

  // ------------------------------------------------------------------ summary for the UI
  NW.summary = function () {
    var n = ensure(); return { heat: Math.round(n.heat), acclaim: Math.round(n.acclaim), effects: NW.activeEffects(), closed: NW.closed(), protest: A.protest, arrivalMul: Math.round(NW.arrivalMul() * 100) / 100, insurance: Math.round(A.insurance), income: Math.round(A.income) };
  };
  NW.afterLoad = function (fresh) {
    if (fresh && S()) S().news = null;
    var n = ensure(); esc = {}; pendInj = null; pendDeath = {}; tick = 0;
    // mark everything already in the park so a loaded game does not announce old "firsts"
    var s = S(); if (s && s.animals) s.animals.forEach(function (a) { if (!fresh && !n.seen[a.species]) n.seen[a.species] = 1; });
    n.donSeen = s && s.finance ? (s.finance.today.donations || 0) : 0;
    recompute();
  };
  if (Z.state) NW.afterLoad(true);
})();
