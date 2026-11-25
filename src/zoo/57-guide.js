// ===== 57-guide.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - Guide tab: plants, enclosure additions and species summaries, all built from game data at runtime. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, D = Z.DATA;
  var Guide = UI.Guide = {};

  var ADDITION_KINDS = { shelter: 1, rock: 1, toy: 1 };
  var ADDITION_IDS = { carcass_feeder: 1, log: 1 };
  var FALLBACK = {
    shelter: 'Gives shy species somewhere to hide; needed by species that need shelter (about one per 30 tiles).',
    rock: 'Counts as rocks for species that need rocky ground (about one per 24 tiles).',
    toy: 'Enrichment that keeps animals occupied.',
    carcass_feeder: 'Predators need one in their enclosure.',
    log: 'Decorative fallen log. No species needs it to get by.'
  };

  function byId(list) { var m = {}; (list || []).forEach(function (x) { m[x.id] = x; }); return m; }
  function byName(list) { var m = {}; (list || []).forEach(function (x) { if (x && x.name) m[x.name] = x; }); return m; }
  function sceneryFor(id) { return byId(D.scenery)[id] || null; }

  // Terrains a plant or addition likes: explicit list, else its biome ('any' = every terrain).
  function terrainIds(s) {
    if (s.terrains && s.terrains.length) return s.terrains;
    if (!s.biome || s.biome === 'any') return (D.terrain || []).map(function (t) { return t.id; });
    return [s.biome];
  }
  function terrainChip(id) {
    var t = byId(D.terrain)[id];
    return t ? { name: t.name, colour: t.colour } : null;
  }
  function terrainChips(ids) {
    var out = []; ids.forEach(function (id) { var c = terrainChip(id); if (c) out.push(c); });
    return out;
  }
  function herdText(a) {
    var s = a.social || [1, 1];
    return s[1] <= 1 ? 'Solitary' : 'Herd of ' + s[0] + '–' + s[1];
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  // ---- model, built from Z.DATA; names from Z.Sim.habitatGuide() override the derived lists when present
  function buildModel() {
    var animals = D.animals || [], scen = D.scenery || [];
    var guide = null;
    try { if (Z.Sim && Z.Sim.habitatGuide) guide = Z.Sim.habitatGuide(); } catch (e) { guide = null; }
    var gPlants = byName(guide && guide.plants), gAdds = byName(guide && guide.additions), gSpecies = byName(guide && guide.species);

    var plants = scen.filter(function (s) { return s.kind === 'tree' || s.kind === 'bush'; }).map(function (s) {
      var likedBy = animals.filter(function (a) { return (a.foliage || []).indexOf(s.id) >= 0; }).map(function (a) { return a.name; });
      var g = gPlants[s.name];
      var terr = terrainChips(terrainIds(s));
      if (g && g.terrains && g.terrains.length) terr = g.terrains.map(function (n) { return byName(D.terrain)[n] || { name: n, colour: '#999' }; });
      if (g && g.likedBy) likedBy = g.likedBy;
      return { emoji: s.emoji, name: s.name, anyTerrain: !s.terrains && (!s.biome || s.biome === 'any'), terrains: terr, likedBy: likedBy };
    });

    var adds = [];
    scen.forEach(function (s) {
      if (!s.inEnclosure) return;
      if (!(ADDITION_KINDS[s.kind] || ADDITION_IDS[s.id])) return;
      var neededBy = [];
      if (s.kind === 'shelter') neededBy = animals.filter(function (a) { return a.needsShelter; }).map(function (a) { return a.name; });
      else if (s.kind === 'rock') neededBy = animals.filter(function (a) { return a.needsRocks; }).map(function (a) { return a.name; });
      else if (s.id === 'carcass_feeder') neededBy = animals.filter(function (a) { return a.predator; }).map(function (a) { return a.name; });
      var g = gAdds[s.name];
      var info = s.info || FALLBACK[s.kind] || FALLBACK[s.id] || '';
      if (g && g.info) info = g.info;
      if (g && g.neededBy) neededBy = g.neededBy;
      adds.push({ emoji: s.emoji, name: s.name, info: info, neededBy: neededBy });
    });
    adds.unshift({
      emoji: '🌊', name: 'Water', water: true,
      info: 'Painted water terrain, not an object. Aim for about 6% of the enclosure.',
      neededBy: animals.filter(function (a) { return a.needsWater; }).map(function (a) { return a.name; })
    });

    var species = animals.map(function (a) {
      var prefs = Object.keys(a.terrainPrefs || {}).map(function (id) {
        var t = byId(D.terrain)[id] || { name: id, colour: '#999' };
        return { name: t.name, colour: t.colour, pct: Math.round((a.terrainPrefs[id] || 0) * 100) };
      }).sort(function (x, y) { return y.pct - x.pct; }).slice(0, 3);
      var plantNames = (a.foliage || []).map(function (id) { var s = sceneryFor(id); return s ? s.name : id; });
      var needs = [];
      if (a.needsWater) needs.push('Water');
      if (a.needsShelter) needs.push('Shelter');
      if (a.needsRocks) needs.push('Rocks');
      if (a.predator) needs.push('Carcass feeder');
      needs.push(herdText(a));
      if (a.companion) { var comp = byId(animals)[a.companion]; needs.push('Companion: ' + (comp ? comp.name : a.companion)); }
      var g = gSpecies[a.name];
      if (g && g.plants) plantNames = g.plants;
      if (g && g.needs) needs = g.needs;
      var minSpan = (g && g.minSpan) || (Z.Sim && Z.Sim.animalMetrics ? Z.Sim.animalMetrics(a.id, false).minSpan : 0);
      return { name: a.name, emoji: a.emoji, diet: cap(a.diet), prefs: prefs, plants: plantNames, needs: needs, space: a.space, minFence: a.minFence, minSpan: minSpan, needsCage: !!(a.needsCage || (g && g.needsCage)) };
    });

    return { plants: plants, additions: adds, species: species };
  }

  // ---- rendering helpers
  function label(t) { return h('div.gd-lbl', { text: t }); }
  function chipList(items) { return h('div.chips', items.map(function (t) { return h('span.chip', { text: t }); })); }
  function dotChips(items) {
    return h('div.chips', items.map(function (t) {
      return h('span.chip.gd-t', [h('i.gd-dot', { style: 'background:' + t.colour }), t.name + (t.pct != null ? ' ' + t.pct + '%' : '')]);
    }));
  }
  function head(emoji, name, sub) {
    return h('div.gd-head', h('span.gd-em', { text: emoji || '' }), h('div', h('b', { text: name }), sub ? h('div.gd-sub', { text: sub }) : null));
  }
  function none(list, txt) { return list && list.length ? chipList(list) : h('div.gd-none', { text: txt }); }

  function plantCard(p) {
    var terr = p.anyTerrain ? h('div.gd-none', { text: 'Any terrain' }) : dotChips(p.terrains);
    return h('div.box.gd-card', head(p.emoji, p.name),
      label('Grows best on:'), terr,
      label('Liked by:'), none(p.likedBy, 'No species in particular'));
  }
  function additionCard(a) {
    return h('div.box.gd-card', head(a.emoji, a.name),
      h('div.gd-info', { text: a.info }),
      label('Needed by:'), none(a.neededBy, 'Nobody in particular'));
  }
  function speciesCard(s) {
    var kv = function (k, v) { return h('div.kv', h('span', { text: k }), h('b', { text: v })); };
    return h('div.box.gd-card', head(s.emoji, s.name, s.diet),
      label('Favourite terrain:'), s.prefs.length ? dotChips(s.prefs) : h('div.gd-none', { text: 'No preference' }),
      label('Favourite plants:'), none(s.plants, 'Any plant'),
      label('Needs:'), chipList(s.needs),
      kv('Space per animal', (s.space || 0) + ' tiles' + (s.minSpan >= 4 ? ' · Min width: ' + s.minSpan + '×' + s.minSpan : '')),
      kv('Minimum fence', String(s.minFence || 1)),
      s.needsCage ? kv('Enclosure', 'Roofed cage (Primate cage)') : null);
  }

  var INTROS = {
    plants: 'Plants on terrain they like count fully toward an animal’s favourite-foliage need. On the wrong terrain they struggle and count half.',
    adds: 'Enclosure additions and what they do. Water is painted terrain, so it is listed here by hand.',
    species: 'Wild Acres habitat guide — match soil, foliage and enclosure additions to each species.',
    staff: 'Who fixes what, how fast they work, and how one-off emergency callouts work when you do not want full-time staff.'
  };

  function staffCards() {
    var fmt = UI.fmt || function (n) { return '£' + Math.round(n); };
    var cards = [
      h('div.box.gd-card', head('🚨', 'Emergency Callouts', 'One-off fixes · no payroll'),
        h('div.gd-info', { text: 'Don’t want full-time staff yet? Click any broken fence, ride, or power cut to call a one-off crew (Call Fence Crew, Call Mechanic, or Call Electrician).' }))
    ];
    (D.staff || []).forEach(function (s) {
      var kv = function (k, v) { return h('div.kv', h('span', { text: k }), h('b', { text: v })); };
      cards.push(h('div.box.gd-card', head(s.emoji, s.name, s.badge || ''),
        s.tagline ? h('div', { style: 'font:700 12.5px var(--sans);color:var(--ink);margin-bottom:4px', text: s.tagline }) : null,
        h('div.gd-info', { text: s.duties || s.effect || '' }),
        kv('Hire / Wage', fmt(s.hireCost) + ' · ' + fmt(s['wage/day'] || s.wage) + '/day')));
    });
    return cards;
  }

  Guide.build = function (b) {
    var model = buildModel();
    var seg = h('div.seg.gd-seg'), intro = h('div.gd-intro'), body = h('div.gd-body');
    var sections = [
      ['plants', 'Plants', function () { return model.plants.map(plantCard); }],
      ['adds', 'Additions', function () { return model.additions.map(additionCard); }],
      ['species', 'Species & Needs', function () { return model.species.map(speciesCard); }],
      ['staff', 'Staff & Repairs', staffCards]
    ];
    var btns = {};
    function show(key) {
      sections.forEach(function (s) { btns[s[0]].className = s[0] === key ? 'on' : ''; });
      var sec = sections.filter(function (s) { return s[0] === key; })[0];
      intro.textContent = INTROS[key];
      body.innerHTML = '';
      var list = sec[2]();
      if (!list.length) { body.appendChild(h('div.fact', { text: 'Nothing to show yet.' })); return; }
      body.appendChild(h('div.gd-grid', list));
    }
    sections.forEach(function (s) {
      btns[s[0]] = h('button', { text: s[1], on: { click: function () { UI.snd && UI.snd('click'); show(s[0]); } } });
      seg.appendChild(btns[s[0]]);
    });
    b.appendChild(h('div.gd-top', seg));
    b.appendChild(intro);
    b.appendChild(body);
    show('plants');
    return null;
  };
})();
