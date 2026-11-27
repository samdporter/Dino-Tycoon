// ===== 72-examples-advanced.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Masterclass games: "Moats, Power and Keeping Giants In" (mid-game) and "Sea, Sky and the Lab" (advanced). Plain data, see notes/examples.md. */
(function () {
  'use strict';
  var Ex = Z.Examples;
  // moat park layout (fern_meadow, seed 101): A west of the lake, B north of it, C south of it, E the electric paddock beside the path
  var A = [25, 22, 31, 27], B = [35, 15, 40, 20], C = [35, 32, 40, 37], E = [24, 31, 29, 36];
  function escaped(V, from) { return V.escapes() > from; }
  function rec(run, key) { return run.mark && run.mark[key]; }
  function mark(run, key, v) { run.mark = run.mark || {}; run.mark[key] = v; }

  Ex.register({
    id: 'moats', title: 'Moats, Power and Keeping Giants In', badge: 'mixed', minutes: 5,
    blurb: 'Good and bad in one park: a moat that holds and one that is too narrow, a swimmer that no moat can stop, and a storm that tests the electric fences with and without a backup generator.',
    topics: ['Moats', 'Water supply', 'Swimmers', 'Electric fences', 'Backup power', 'News and reputation'],
    start: { seed: 101, map: 'fern_meadow', difficulty: 'normal', money: 250000 },
    setup: function (V) {
      V.midgame({ star: 5, money: 250000, rating: 3 });
      V.clear(20, 10, 44, 41);
      V.path(22, 13, 22, 40, 'paved'); V.path(23, 40, 41, 40, 'paved');
      V.put('toilets', 23, 41); V.put('burger_stand', 26, 41); V.put('drinks_stall', 30, 41); V.put('bin', 32, 41); V.put('bench', 34, 41); V.put('bin', 21, 38);
      V.hire('keeper', 22, 38); V.hire('keeper', 22, 20); V.hire('cleaner', 22, 30); V.hire('security', 22, 28);
    },
    chapters: [
      { id: 'moats', title: 'Moats that hold, and moats that do not',
        steps: [
          { cam: { rect: [20, 10, 44, 41], pad: 0 }, say: ['Keeping giants in', 'This park is mid-game and well funded. The lake and river feed three moats, and we will build each one wrongly or rightly on purpose.', 'A moat holds an animal only if it is wide and deep enough for that species, and not every species can be held at all.'] },
          { cam: { rect: [22, 19, 34, 30], pad: 1 }, act: [['ring', 25, 22, 31, 27, 2, 2]],
            say: ['A moat that fits', 'Therizinosaurus is huge with a long stride, so it needs a wet moat two tiles wide and medium deep. This ring is dug two wide and touches the lake.', 'Wet moats fill from a lake or river, so the water is free. A moat with no fence is a clear view for guests.'] },
          { cam: { rect: [22, 19, 34, 30], pad: 1 }, act: [['spawn', 'therizinosaurus', 27, 24, 2]],
            say: ['Two giants move in', 'Two Therizinosaurus step into the paddock. No fence at all, just the moat.', 'Check the enclosure panel: a moat that is big enough gets no warning.'], hold: 6 },
          { cam: { rect: [32, 12, 43, 24], pad: 1 }, act: [['ring', 35, 15, 40, 20, 1, 2], ['dig', [{ i: 36, j: 22 }], 2], ['spawn', 'therizinosaurus', 37, 17, 2]],
            say: ['A moat that is too narrow', 'Same species, same depth, but the ring is only one tile wide. It looks fine, and it is fed from the lake just the same.', 'Width matters as much as depth. A long-legged giant steps across a one-tile moat.'], hold: 8 },
          { cam: { follow: { sp: 'therizinosaurus', at: [37, 17] }, d: 26 },
            say: ['Watching the narrow moat', 'Time speeds up while we watch the herd. Sooner or later one of them wades across.', 'Animals test their boundaries all day long, so the escape roll comes round every hour.'],
            until: function (V, run) { return V.escapes() >= 1; }, rate: 60, timeout: 60 },
          { cam: { rect: [30, 10, 44, 26], pad: 0 }, act: [function (V, run) { mark(run, 'narrowEsc', V.escapes()); }],
            say: ['Escape across the moat', 'A Therizinosaurus has waded out. The warning in the enclosure panel said so all along.', 'Moats that are too narrow are the commonest water-moat mistake. Read the warning before opening.'], hold: 7 },
          { cam: { rect: [32, 12, 43, 24], pad: 1 }, act: [['ring', 35, 15, 40, 20, 2, 2]],
            say: ['Widen it', 'The ring is dug out to two tiles. The response team returns the giants and the moat now holds.', 'Fixing a moat is cheap compared with compensation, bad headlines and a lost day of visitors.'],
            until: function (V, run) { return V.looseCount() === 0; }, rate: 50, timeout: 60, soft: true },
          { cam: { rect: [32, 12, 43, 24], pad: 1 }, act: [function (V, run) { mark(run, 'afterFix', V.escapes()); }],
            say: ['Holding at last', 'A day passes and nothing gets out of the widened moat.', 'Check again after any change. A fixed boundary should stay quiet.'],
            until: function (V, run) { return V.hours() >= (run.mark.fixHour = run.mark.fixHour || V.hours() + 20); }, rate: 60, timeout: 40 },
          { cam: { rect: [30, 27, 45, 41], pad: 0 }, act: [['ring', 35, 32, 40, 37, 2, 3], ['dig', [{ i: 36, j: 29 }], 3], ['spawn', 'spinosaurus', 37, 34, 1]],
            say: ['A swimmer behind a moat', 'Spinosaurus is a swimmer. We give it a deep, wide, water-filled moat, which is exactly what it wants.', 'A swimmer treats a wet moat as a swimming pool. The same goes for a Baryonyx.'], hold: 8 },
          { cam: { follow: { sp: 'spinosaurus' }, d: 28 }, act: [function (V, run) { mark(run, 'swimEsc', V.escapes()); }],
            say: ['It swims straight out', 'The Spinosaurus paddles across without a care. A fence of strength 5 is what holds it, and the moat is not enough.', 'Know the animal. Swimmers need a strong fence, and a dry ditch is no better.'],
            until: function (V, run) { return V.escapes() > run.mark.swimEsc; }, rate: 60, timeout: 60 },
          { cam: { rect: [32, 29, 43, 40], pad: 1 }, act: [['fillRing', 35, 32, 40, 37, 2], ['fence', 35, 32, 40, 37, 'reinforced']],
            say: ['The right answer: a fence', 'We fill the moat in and fence the paddock instead. A reinforced fence is strength 5, which is what a Spinosaurus needs.', 'A fence is judged by strength alone. For a swimmer there is no moat that works, so the fence must carry the job.'],
            until: function (V, run) { return V.looseCount() === 0; }, rate: 50, timeout: 60, soft: true }
        ],
        stats: function (V) { return { Moats: 3, 'Escapes so far': Z.state.stats.escapes }; },
        lessons: ['A moat must be wide and deep enough for the species.', 'A narrow moat is crossed; widen it and it holds.', 'A wet moat is fed by a lake or a river, or by a pump or borehole.', 'Swimmers cross water. Give them a strong fence instead.', 'Check the warning in the enclosure panel before you open.'] },
      { id: 'power', title: 'The storm and the backup generator',
        steps: [
          { cam: { rect: [20, 28, 36, 42], pad: 0 }, act: [['clear', 22, 29, 36, 40], ['paint', 24, 31, 29, 36, 'savannah'], ['fence', 24, 31, 29, 36, 'electric_light'], ['put', 'substation', 31, 35]],
            say: ['An electric fence', 'Velociraptors need strength 4. Electric wire gives strength 4 while the power is on, and costs far less than a heavy fence.', 'An electric fence is only as good as its power. When it is dead its strength falls to 1.'] },
          { cam: { rect: [22, 29, 34, 38], pad: 0 }, act: [['spawn', 'velociraptor', 26, 33, 2]],
            say: ['Two raptors move in', 'The paddock is fed from a substation beside it. The Power screen shows supply and demand.', 'Check coverage: a fence that is out of range of a substation is never switched on.'], panel: 'power', hold: 7 },
          { cam: { rect: [22, 29, 34, 38], pad: 0 }, act: [['powerCut', 6], function (V, run) { mark(run, 'cut1', V.escapes()); }],
            tick: function (V, run) { if (V.escapes() <= run.mark.cut1 && Z.Power && !Z.Power.status().outage) return V.powerCut(8); },
            say: ['Lightning on the cable', 'A storm strikes the mainland cable. The island goes dark, and the electric fence goes with it.', 'Storms are the main cause of outages. Plan for them before the first one arrives.'],
            until: function (V, run) { return V.escapes() > run.mark.cut1; }, rate: 40, timeout: 45 },
          { cam: { follow: { sp: 'velociraptor' }, d: 26 },
            say: ['Without a backup: an escape', 'The fence is dead and the raptors walk through it. Guests are hurt and the park pays compensation.', 'This is the cost of having no backup power: the containment is gone the moment the cable is.'],
            until: function (V) { return !Z.Power || !Z.Power.status().outage; }, rate: 50, timeout: 45, soft: true },
          { cam: 'keep', panel: 'news', act: [['respond', 'apology']],
            say: ['The headlines', 'The papers run the story. Apologising and refunding costs a little and cuts the damage to arrivals and reputation.', 'Answer bad news quickly. Staying silent leaves the story to grow.'], hold: 8 },
          { cam: { rect: [26, 34, 40, 42], pad: 1 }, act: [['put', 'backup_gen', 24, 38], ['put', 'battery_bank', 31, 38]],
            say: ['Now build the backup', 'A backup generator and a battery bank pick up the containment load when the cable fails, and the batteries cover the gap while the generator starts.', 'Containment comes first in the priority list. Fences, pumps and the lab stay on.'], panel: 'power', hold: 8 },
          { cam: { rect: [26, 34, 40, 42], pad: 1 }, panel: 'power',
            say: ['Charging up', 'The batteries need a few hours on the mains to fill before they are any use.', 'Build backup power before the storm, not during it.'],
            until: function (V) { return !Z.Power || Z.Power.status().stored >= 80; }, rate: 40, timeout: 30, soft: true },
          { cam: { rect: [22, 29, 34, 38], pad: 0 }, act: [['powerCut', 6], function (V, run) { mark(run, 'cut2', V.escapes()); }],
            say: ['The same storm, again', 'Another strike on the cable. This time the batteries and the generator carry the fence.', 'Test your assumptions. The same event now costs nothing but a news line.'],
            until: function (V) { return !Z.Power || !Z.Power.status().outage; }, rate: 40, timeout: 50 },
          { cam: { rect: [22, 29, 34, 38], pad: 0 }, panel: 'power',
            say: ['It held', 'No escape this time. A short outage is now a non-event.', 'Backup power is cheap insurance next to compensation, headlines and a day of closed gates.'], hold: 6 }
        ],
        stats: function (V, run) { return { 'Escapes in the first storm': (run.mark.cut2 || 0) - (run.mark.cut1 || 0), 'Escapes in the second storm': Z.state.stats.escapes - (run.mark.cut2 || 0) }; },
        lessons: ['Electric fences fall to strength 1 when the power is off.', 'Storms cut the cable. Build a backup generator and a battery bank.', 'Containment is first in the power priority list.', 'Answer bad headlines at once: an apology is cheap.', 'Test the fix with the same storm.'] }
    ]
  });

  // ====================================================================== Sea, Sky and the Lab
  Ex.register({
    id: 'lab', title: 'Sea, Sky and the Lab', badge: 'good', minutes: 5,
    blurb: 'An advanced tour: a monorail over the enclosures, a donor gene spliced into a dinosaur, a hybrid, and (when available) a marine tank, the Aviary and a virtual tagged zone.',
    topics: ['Monorail', 'Donor DNA', 'Splicing', 'Hybrids', 'Marine tanks', 'Aviary', 'Virtual zones'],
    start: { seed: 101, map: 'fern_meadow', difficulty: 'normal', money: 700000 },
    setup: function (V) {
      V.midgame({ star: 5, money: 700000, rating: 3.4 });
      V.setGenome('dryosaurus', 88); V.setGenome('leaellynasaura', 84);
      V.clear(9, 18, 42, 40);
      V.path(27, 36, 28, 39, 'paved'); V.path(14, 38, 39, 38, 'paved'); V.path(14, 21, 14, 37, 'paved');
      V.put('toilets', 22, 39); V.put('burger_stand', 31, 39); V.put('drinks_stall', 34, 39); V.put('bin', 24, 39); V.put('bench', 36, 39);
      V.hire('keeper', 28, 38); V.hire('keeper', 14, 30); V.hire('cleaner', 20, 38); V.hire('vet', 25, 38); V.hire('mechanic', 29, 38);
      V.fence(20, 32, 25, 37, 'chainlink'); V.fence(30, 32, 35, 37, 'chainlink');
      V.paint(20, 32, 25, 37, ['forest', 'grass']); V.paint(30, 32, 35, 37, ['forest', 'grass']);
      V.plants('fern', [[21, 33], [23, 35], [31, 33], [33, 35]]); V.plants('horsetail', [[24, 33], [32, 34]]); V.put('wooden_shelter', 20, 34, 0); V.put('wooden_shelter', 30, 34, 0);
      V.spawn('dryosaurus', 22, 34, 3); V.spawn('leaellynasaura', 32, 34, 3);
    },
    chapters: [
      { id: 'rail', title: 'A line in the sky',
        steps: [
          { cam: { rect: [12, 28, 42, 41], pad: 0 }, say: ['The advanced tour', 'A well-run park with two paddocks, paths and shops. Now for the bigger ideas, starting with a monorail.', 'A ride that passes over the animals earns fares and gives guests a view they cannot get from the path.'] },
          { cam: { rect: [14, 34, 41, 40], pad: 0 }, act: [['station', 16, 36], ['station', 36, 36]],
            say: ['Two stations', 'A monorail station is four tiles wide with its entrance facing a path, so guests can walk in.', 'A station with no path in front of it cannot be used, and a line needs one at each end.'] },
          { cam: { rect: [16, 30, 40, 38], pad: 0 }, act: [['track', 19, 36, 36, 36]],
            say: ['Track over the paddocks', 'The line runs straight over both paddocks. Pylons stand where they are needed and never inside an enclosure\'s fence line.', 'Rails never change the fences below, so there is no risk to containment. The view bonus is a gift.'] },
          { cam: { rect: [14, 34, 24, 40], pad: 1 }, act: [['train', 16, 36, 3]], panel: 'power',
            say: ['A train and power', 'A three-car train runs between the stations. The stations need power, and the Power screen shows them on the grid.', 'An unpowered station stops the whole line. Check the grid when you add anything electric.'], hold: 8 },
          { cam: { follow: { train: true }, d: 22 }, tick: function (V) { return ({ ok: true }); },
            say: ['Riding the line', 'Guests ride across the park and look down on the herds. Time speeds up while the line settles.', 'The ride earns a fare and lifts how much guests enjoy the animals they pass.'],
            until: function (V) { return V.riders() >= 6; }, rate: 40, timeout: 70, soft: true }
        ],
        stats: function (V) { var m = Z.state.mono && Z.state.mono.stats || {}; return { 'Riders': m.riders || 0, 'Fare income': '\u00a3' + Math.round(m.income || 0) }; },
        lessons: ['A station needs a path at its entrance.', 'Track can pass over enclosures without changing the fences.', 'Stations need power.', 'A line with two stations and a train earns fares and adds a view bonus.'] },
      { id: 'genes', title: 'Donor genes and a hybrid',
        steps: [
          { cam: 'keep', panel: ['res', 'amber'], act: [['donor', 'chameleon']],
            say: ['Donor DNA', 'The gene bank sells samples from modern animals. We buy a chameleon sample. It has to be sequenced like any other DNA.', 'Donor genes give a dinosaur one new trait, with a benefit and a risk.'] },
          { cam: 'keep', panel: ['res', 'lab'],
            say: ['Sequencing the donor', 'A free scientist works through the sample in the background.', 'Hire enough scientists that one is always free for this kind of job.'],
            until: function (V) { return V.donorDoses('chameleon') >= 1; }, rate: 40, timeout: 40 },
          { cam: 'keep', panel: ['res', 'splice'], act: [['splice', 'dryosaurus', 'chameleon_skin', 0.9]],
            say: ['Splice a trait', 'Dryosaurus is over 80% sequenced, so it can take the gene. A guided splice improves the odds.', 'Check the odds and risks first. A failed splice costs genome quality on the parent.'],
            until: function (V) { return V.hasTrait('dryosaurus', 'chameleon_skin'); }, rate: 50, timeout: 40 },
          { cam: { rect: [20, 32, 25, 37], pad: 2 }, act: [['hatch', 'dryosaurus', 22, 36]],
            say: ['Every hatchling carries it', 'The next Dryosaurus egg carries the colour-shifting gene, so the new hatchling changes colour as it moves.', 'A visible trait is good for guests, but read the risks before you splice again.'],
            force: { hatch: true }, until: function (V) { return V.count('dryosaurus') >= 4; }, rate: 40, timeout: 40 },
          { cam: 'keep', panel: ['res', 'splice'], act: [['hybrid', 'dryosaurus', 'leaellynasaura', 0.9]],
            say: ['A hybrid', 'Two well-sequenced species of the same realm can be combined into a hybrid. It takes longer, costs more and can fail.', 'A hybrid is a new species, popular with guests, but harder to keep and costly to run.'],
            until: function (V) { return !!V.hybridId(); }, rate: 60, timeout: 50 },
          { cam: { rect: [28, 30, 37, 39], pad: 1 }, act: [function (V) { var id = V.hybridId(); return id ? V.hatch(id, 33, 35) : { ok: false, msg: 'no hybrid' }; }],
            say: ['Hatch the hybrid', 'The hybrid gets its own listing and hatches into the second paddock.', 'Give a hybrid the same care as its parents. It needs a fence at least as strong as either.'],
            force: { hatch: true }, until: function (V) { var id = V.hybridId(); return !!id && V.count(id) >= 1; }, rate: 40, timeout: 40 }
        ],
        stats: function (V) { var rs = Z.state.research.stats; return { 'Genes spliced': rs.genes || 0, 'Hybrids': rs.hybrids || 0, 'Sequenced': rs.seqDone || 0 }; },
        lessons: ['Donor genes add a trait; read the benefit and the risk.', 'A species needs a genome of about 80% before it can be spliced.', 'Guiding the splice improves the odds.', 'A hybrid is a new species, with its own needs.'] },
      { id: 'realms', title: 'Tank, dome and virtual zone', when: function () { return !!(Z.Sim.realms && Z.Sim.realms.place && Z.Sim.realms.placeWalk); },
        steps: [
          { cam: { rect: [8, 18, 24, 30], pad: 1 }, act: [['realm', 'tank', 'sea', 10, 20, 13, 23, { lvl: 2, wall: 2 }]],
            say: ['A marine tank', 'Marine reptiles are not dinosaurs, and they live in water, not in a paddock. A tank by the shore gets its sea water from an intake.', 'Salt water, depth and a strong wall matter more than land. Check the tank panel before you buy animals.'] },
          { cam: { rect: [8, 18, 16, 26], pad: 1 }, act: [['spawn', 'ichthyosaurus', 10, 21, 3], ['put', 'fish_feeder', 11, 20, 0], ['put', 'kelp_bed', 12, 22, 0], ['walk', 10, 21, 13, 21, 'tunnel']],
            say: ['A viewing tunnel', 'A glass tunnel through the tank lets guests walk among the Ichthyosaurus.', 'A tunnel is the best view in the park, and a strong draw for guests.'], hold: 8 },
          { cam: { rect: [14, 20, 23, 29], pad: 1 }, act: [['realm', 'dome', 'air', 16, 22, 21, 27, { lvl: 1, mesh: 1 }], ['spawn', 'pteranodon', 18, 24, 2]],
            say: ['The Aviary', 'A tall glass-and-mesh aviary keeps pterosaurs in. Like the marine reptiles, they are not dinosaurs, so they need an aviary.', 'The aviary keeps its strength in a blackout, but door locks may fail, so keep the power on.'], hold: 8 },
          { cam: { rect: [22, 18, 34, 30], pad: 0 }, act: [['tower', 30, 25, true], ['put', 'substation', 32, 28], ['realm', 'virtual', 'land', 24, 20, 29, 25, {}]],
            say: ['A virtual tagged zone', 'No fence at all: animals wear tags, and a powered tagging tower keeps them inside a painted zone.', 'It looks wonderful and costs a lot, and it depends entirely on the power staying on.'] },
          { cam: { rect: [22, 18, 34, 30], pad: 0 }, act: [['spawn', 'triceratops', 25, 22, 3]],
            say: ['Three Triceratops move in', 'Each one has a tag fitted. The zone shows as a glowing curtain.', 'Tags are fitted by rangers and vets, so keep staff on duty.'], hold: 8 },
          { cam: { rect: [22, 18, 34, 30], pad: 0 }, act: [['powerCut', 8], function (V, run) { mark(run, 'zoneEsc', V.escapes()); }],
            say: ['The power fails', 'The tagging tower loses power and the zone goes dark. The Triceratops simply walk out.', 'A virtual zone has no backup of its own. Put the tower on a backup generator before you rely on it.'],
            until: function (V, run) { return V.escapes() > run.mark.zoneEsc; }, rate: 40, timeout: 40 },
          { cam: { rect: [22, 18, 34, 30], pad: 0 }, act: [['powerBack']],
            say: ['Back on', 'The power is restored and the response team returns the herd to the zone.', 'Recovery is quick, but the headlines are not.'],
            until: function (V) { return V.looseCount() === 0; }, rate: 40, timeout: 40, soft: true }
        ],
        stats: function (V) { var rs = Z.Sim.realms.stats ? Z.Sim.realms.stats() : {}; return { 'Tunnel guests': rs.tunnelGuests || 0, 'Zone escapes': Z.state.stats.escapes }; },
        lessons: ['Marine reptiles need tanks or sea pens, not paddocks.', 'A tunnel is a superb view for guests.', 'The Aviary keeps its mesh in a blackout, but its door locks need power.', 'A virtual zone is only as reliable as its power.', 'Check each barrier type before you rely on it.'] }
    ]
  });
})();
