// ===== 57-guide.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - Guide tab: plants, enclosure additions and dinosaur summaries, all built from game data at runtime. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, D = Z.DATA;
  var Guide = UI.Guide = {};

  var ADDITION_KINDS = { shelter: 1, rock: 1, toy: 1 };
  var ADDITION_IDS = { carcass_feeder: 1, log: 1 };
  var FALLBACK = {
    shelter: 'Gives shy species somewhere to hide; needed by species that need shelter (about one per 30 tiles).',
    rock: 'Counts as rocks for species that need rocky ground (about one per 24 tiles).',
    toy: 'Enrichment that keeps dinosaurs occupied.',
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
      var g = gSpecies[a.name];
      if (g && g.plants) plantNames = g.plants;
      if (g && g.needs) needs = g.needs;
      var minSpan = (g && g.minSpan) || (Z.Sim && Z.Sim.animalMetrics ? Z.Sim.animalMetrics(a.id, false).minSpan : 0);
      return { name: a.name, emoji: a.emoji, diet: cap(a.diet), prefs: prefs, plants: plantNames, needs: needs, space: a.space, minFence: a.minFence, minSpan: minSpan };
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
      kv('Minimum fence', String(s.minFence || 1)));
  }

  var INTROS = {
    plants: 'Plants on terrain they like count fully toward a dinosaur’s favourite-foliage need. On the wrong terrain they struggle and count half.',
    adds: 'Enclosure additions and what they do. Water is painted terrain, so it is listed here by hand.',
    dinos: 'A quick look at each species: where it likes to roam, what it eats and what it needs.'
  };

  // open the Guide tab on a section: 'plants' 'adds' 'dinos' 'moats' 'sea' 'air' 'tags' 'monorail' 'safari' 'mc'
  Guide.openSection = function (key) { Guide.want = key; UI.openModal('guide'); };
  var css = document.createElement('style'); css.setAttribute('data-guide', '1');
  css.textContent = '.gd-index{background:rgba(255,255,255,.5);border:1px solid rgba(58,42,26,.18);border-radius:12px;overflow:hidden}.gd-idxh{width:100%;min-height:44px;display:flex;align-items:center;gap:4px;padding:0 12px;font:700 14px var(--sans);text-align:left}.gd-idxh b{flex:1;font-weight:600;color:var(--moss3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.gd-idxb{padding:0 10px 8px}.gd-idxg small{display:block;font:700 10.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);margin:8px 2px 4px}.gd-idxr{display:flex;flex-wrap:wrap;gap:6px}' +
    '.gd-idxr button{min-height:40px;padding:0 14px;border-radius:20px;background:var(--paper2);border:2px solid rgba(58,42,26,.25);font:700 13px var(--sans)}.gd-idxr button.on{background:var(--moss);color:var(--paper);border-color:var(--moss3)}';
  document.head.appendChild(css);
  Guide.build = function (b) {
    var model = buildModel();
    var seg = h('div.seg.gd-seg'), intro = h('div.gd-intro'), body = h('div.gd-body');
    var sections = [
      ['plants', 'Plants', function () { return model.plants.map(plantCard); }],
      ['adds', 'Enclosure extras', function () { return model.additions.map(additionCard); }],
      ['dinos', 'Dinosaurs', function () { return model.species.map(speciesCard); }]
    ];
    if (UI.Moats && UI.Moats.guideSection) sections.push(UI.Moats.guideSection());
    if (UI.Realms && UI.Realms.guideSection) UI.Realms.guideSection().forEach(function (g) { sections.push(g); });
    if (UI.Mono && UI.Mono.guideSection) sections.push(UI.Mono.guideSection());   // monorail package
    if (UI.Safari && UI.Safari.guideSection) sections.push(UI.Safari.guideSection());   // safari package
    if (UI.Masterclass && UI.Masterclass.guideBlock) sections.push(['mc', 'Masterclass', function () { return [UI.Masterclass.guideBlock()]; }, 'Example games played on the real simulation, with captions that say what is being done and why.']);   // Masterclass package
    var btns = {};
    function show(key) {
      sections.forEach(function (s) { btns[s[0]].className = s[0] === key ? 'on' : ''; });
      var sec = sections.filter(function (s) { return s[0] === key; })[0];
      intro.textContent = sec[3] || INTROS[key];
      var hb = idxHead.querySelector('b'); if (hb) hb.textContent = ': ' + sec[1];
      body.innerHTML = '';
      var list = sec[2]();
      if (!list.length) { body.appendChild(h('div.fact', { text: 'Nothing to show yet.' })); return; }
      body.appendChild(h('div.gd-grid', list));
    }
    // contents: grouped, wrapping buttons (40px tall) instead of one long scrolling strip; folds up after a pick
    var GROUPS = [['The park', ['plants', 'adds', 'dinos']], ['Habitats', ['moats', 'sea', 'air', 'tags']], ['Guests and transport', ['monorail', 'safari']], ['Learn', ['mc']]];
    var idx = h('div.gd-index'), idxHead = h('button.gd-idxh', { 'aria-expanded': 'true' }), idxBody = h('div.gd-idxb');
    function fold(on) { idxBody.style.display = on ? 'none' : ''; idxHead.setAttribute('aria-expanded', on ? 'false' : 'true'); idxHead.querySelector('i').textContent = on ? '\u25be' : '\u25b4'; }
    idxHead.appendChild(h('span', { text: 'Contents' })); idxHead.appendChild(h('b', { text: '' })); idxHead.appendChild(h('i', { text: '\u25b4' }));
    idxHead.addEventListener('click', function () { UI.snd && UI.snd('click'); fold(idxBody.style.display !== 'none'); });
    var used = {};
    function addBtn(row, sct) {
      used[sct[0]] = 1;
      btns[sct[0]] = h('button', { text: sct[1], on: { click: function () { UI.snd && UI.snd('click'); show(sct[0]); fold(true); body.scrollIntoView && body.scrollIntoView({ block: 'nearest' }); } } });
      row.appendChild(btns[sct[0]]);
    }
    GROUPS.forEach(function (g) {
      var list = sections.filter(function (sct) { return g[1].indexOf(sct[0]) >= 0; }); if (!list.length) return;
      var row = h('div.gd-idxr'); list.forEach(function (sct) { addBtn(row, sct); });
      idxBody.appendChild(h('div.gd-idxg', h('small', { text: g[0] }), row));
    });
    var rest = sections.filter(function (sct) { return !used[sct[0]]; });
    if (rest.length) { var row2 = h('div.gd-idxr'); rest.forEach(function (sct) { addBtn(row2, sct); }); idxBody.appendChild(h('div.gd-idxg', h('small', { text: 'More' }), row2)); }
    idx.appendChild(idxHead); idx.appendChild(idxBody);
    b.appendChild(h('div.gd-top', idx));
    b.appendChild(intro);
    b.appendChild(body);
    var first = Guide.want && btns[Guide.want] ? Guide.want : 'plants'; Guide.want = null;
    show(first); fold(first !== 'plants' ? true : false);
    return null;
  };
})();
