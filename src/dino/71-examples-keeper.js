// ===== 71-examples-keeper.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Masterclass games: "The Careful Keeper" (good opening) and "The Reckless Mogul" (bad opening, same seed and map).
   Plain data: chapters -> steps. A step is { cam, say:[title, text, why], act, hold, until, timeout, rate, panel, tick }.  See notes/examples.md. */
(function () {
  'use strict';
  var Ex = Z.Examples;
  var P1 = [30, 30, 35, 35], P2 = [20, 31, 26, 35];      // the two paddocks of the careful park (i0, j0, i1, j1)
  function paddockBasics(p, fence) {   // clear, paint, fence
    return [['clear', p[0] - 1, p[1] - 1, p[2] + 1, p[3] + 2]];
  }
  function settled(V, sp) { var a = Z.state.animals.filter(function (x) { return x.species === sp; }); return a.length >= 2 && a.every(function (x) { return x.happiness >= 55; }); }

  Ex.register({
    id: 'careful', title: 'The Careful Keeper', badge: 'good', minutes: 5,
    blurb: 'A calm, well-planned opening: a right-sized paddock, the amenities in a sensible order and a second species only when the first is settled.',
    topics: ['Paddocks', 'Terrain and plants', 'Amenities', 'Prices', 'Amber and sequencing', 'Hatching'],
    start: { seed: 101, map: 'fern_meadow', difficulty: 'normal' },
    chapters: [
      { id: 'paddock', title: 'A paddock that fits',
        steps: [
          { cam: { rect: [18, 28, 38, 50], pad: 0 }, say: ['The Careful Keeper', 'A modest budget, a lab and an empty meadow. We will start with one easy species, Dryosaurus, and grow slowly.', 'Small beginnings keep the bills low while the park earns its first pounds.'] },
          { cam: { rect: P1 }, act: [['clear', 29, 29, 36, 37], ['paint', 30, 30, 35, 35, ['forest', 'forest', 'forest', 'grass']]],
            say: ['Pick the right ground', 'Dryosaurus like forest and grass. We clear the scrub and paint a small six-by-six paddock.', 'Terrain it likes is the biggest part of an animal\'s comfort score, so get it right first.'] },
          { cam: { rect: P1 }, act: [['fence', 30, 30, 35, 35, 'chainlink']],
            say: ['A fence that is strong enough', 'Chain-link is strength 3 and a Dryosaurus needs only 2. It holds with room to spare and costs little.', 'Pay for the strength the animal needs, no more and no less.'] },
          { cam: { rect: P1 }, act: [['pond', 34, 31, 35, 31], ['paint', 34, 32, 34, 32, 'water'], ['plants', 'fern', [[31, 31], [33, 34]]], ['plants', 'horsetail', [[32, 32], [31, 34]]], ['put', 'wooden_shelter', 30, 33, 0], ['put', 'mud_wallow', 33, 32, 0]],
            say: ['Food, water and shelter', 'A small pond, a few ferns and horsetails, a shelter and a mud wallow. These basics cost well under a thousand pounds.', 'Missing basics are the commonest reason animals sulk, and sulking animals do not please guests.'] },
          { cam: { rect: [19, 28, 38, 40], pad: 1 }, act: [['clear', 26, 35, 37, 40], ['path', 27, 36, 28, 39, 'paved'], ['path', 29, 36, 36, 36, 'paved']],
            say: ['A path from the gate', 'A paved path runs from the entrance to the paddock fence.', 'Guests only see animals from a path, and the closer the better.'] },
          { cam: { rect: P1 }, act: [['hatch', 'dryosaurus', 31, 32], ['hatch', 'dryosaurus', 32, 33]],
            say: ['Hatch the first herd', 'Dryosaurus is already over half sequenced, so the hatchery can set two eggs. Your first two hatches are guaranteed to work.', 'Always hatch something you have the DNA for; a failed egg is money lost.'],
            until: function (V) { return V.count('dryosaurus') >= 2; }, timeout: 40 }
        ],
        lessons: ['Start with one gentle species and a small paddock.', 'Match the terrain to the animal before you spend on anything else.', 'A fence only needs to beat the animal\'s required strength.', 'Basics first: water, shelter and its favourite plants.', 'Link the paddock to the gate by a path.'] },
      { id: 'amenities', title: 'Looking after the guests',
        steps: [
          { cam: { rect: [26, 34, 38, 40], pad: 1 }, act: [['hire', 'keeper', 29, 36]], say: ['Hire a ranger', 'Rangers feed the animals and tidy up. One is plenty for a single paddock.', 'Hungry or dirty animals lose happiness quickly.'] },
          { cam: { rect: [27, 35, 38, 39], pad: 1 }, act: [['put', 'bin', 33, 37], ['put', 'bench', 35, 37], ['put', 'toilets', 30, 37]],
            say: ['Toilets and bins first', 'Before any shops, guests need somewhere to go and somewhere to put litter.', 'Missing toilets are the quickest way to unhappy guests and a bad rating.'] },
          { cam: { rect: [27, 35, 38, 40], pad: 1 }, act: [['put', 'burger_stand', 32, 37], ['put', 'drinks_stall', 34, 37]],
            say: ['Then food and drink', 'A burger stand and a drinks stall sit on the path, entrances facing it.', 'Hungry guests spend. Keep shops on the path, not tucked away.'] },
          { cam: 'keep', act: [['ticket', 9], ['priceType', 'food', 5], ['priceType', 'drink', 2.5]], panel: 'fin',
            say: ['Fair prices', 'The ticket is a modest £9 and the food is priced to sell.', 'Guests compare the price with how much there is to see. Too dear now means empty paths later.'] },
          { cam: { rect: [19, 33, 38, 40], pad: 0 }, act: [['hire', 'cleaner', 28, 38]],
            say: ['Open the gates', 'We hire a cleaner and let the guests in. Time speeds up while we watch the first visitors.', 'Early income pays for the next step, so open as soon as the basics are in place.'],
            until: function (V) { return Z.state.stats.guestsTotal >= 14; }, rate: 30, timeout: 40 }
        ],
        lessons: ['Toilets and bins before shops.', 'Put food and drink on the path where guests walk.', 'Keep prices fair while the park is small.', 'One ranger and one cleaner are enough for a tiny park.'] },
      { id: 'research', title: 'From amber to a second species',
        steps: [
          { cam: 'keep', panel: ['res', 'lab'], act: [['hireScientist']],
            say: ['The lab', 'New species come from amber. We hire a second scientist, because one can extract while another sequences.', 'No DNA, no new species. Research is what lets the park keep growing.'] },
          { cam: 'keep', panel: ['res', 'amber'], act: [['buyAmber'], ['buyAmber']],
            say: ['Reinvest in amber', 'A few lots of amber from the market. We spend a small slice of the profit, never the whole pot.', 'Grade and dig site decide how much DNA is inside, and the price follows.'] },
          { cam: 'keep', panel: ['res', 'lab'], act: [['extract', 'leaellynasaura']],
            say: ['Extract the DNA', 'The lab shows the odds before we start. Extraction can fail, but your very first attempt never does.', 'Check the odds first. A skilled scientist and good amber make failures rare.'],
            until: function (V) { return Z.state.research.stats.fragments > 0 || Z.state.research.batches.length >= 1; }, timeout: 40 },
          { cam: 'keep', panel: ['res', 'lab'], act: [['extract', 'leaellynasaura']],
            say: ['Fragments wait on the bench', 'Extraction gives fragments, not a genome. They queue on the sequencing bench and any free scientist works through them.', 'Idle scientists sequence on their own, so keep one free while another extracts.'], hold: 8 },
          { cam: 'keep', panel: ['res', 'lab'], act: [['assist']],
            say: ['A puzzle boost', 'Tap Help sequence for a short DNA puzzle. A good score jumps the batch forward and raises its quality.', 'It is optional, but a few minutes of puzzles can save a whole day of waiting.'],
            tick: function (V) { return V.extractIfFree('leaellynasaura'); },
            until: function (V) { return V.genome('leaellynasaura') >= 50; }, timeout: 90 }
        ],
        lessons: ['Buy amber with spare cash, not the last of it.', 'Extraction gives fragments; sequencing turns them into genome.', 'Free scientists sequence automatically, so hire enough of them.', 'The puzzle boost speeds sequencing and improves quality.', 'A genome of 50% or more lets you hatch.'] },
      { id: 'second', title: 'A second species, once the first is settled',
        steps: [
          { cam: { follow: { sp: 'dryosaurus', at: [32, 32] }, d: 20 }, panel: null,
            say: ['Check before you expand', 'Before adding anything new we look at the first herd. Are they content, and is the park making money?', 'A second species doubles the work. Only add it when the first is calm and the cash is steady.'],
            until: function (V) { return settled(V, 'dryosaurus'); }, timeout: 40, soft: true },
          { cam: { rect: P2 }, act: [['clear', 19, 30, 27, 37], ['paint', 20, 31, 26, 35, ['forest', 'forest', 'forest', 'grass']], ['fence', 20, 31, 26, 35, 'chainlink'], ['path', 20, 36, 26, 36, 'paved']],
            say: ['The same recipe', 'A second paddock beside the path: forest floor, chain-link and a path along the fence. Leaellynasaura needs a little more room each.', 'Reuse what worked. A proven recipe is cheaper and safer than inventing a new one.'] },
          { cam: { rect: P2 }, act: [['plants', 'fern', [[21, 32], [24, 34], [22, 34]]], ['plants', 'horsetail', [[25, 32], [23, 31]]], ['put', 'wooden_shelter', 20, 33, 0], ['put', 'scratching_post', 25, 34, 0]],
            say: ['Plants and shelter', 'Ferns and horsetails to eat, and a shelter, which this species insists on. It has no need of a pond.', 'Check what each species needs in the Guide. The needs differ even between small herbivores.'] },
          { cam: { rect: P2 }, act: [['hatch', 'leaellynasaura', 22, 33], ['hatch', 'leaellynasaura', 23, 32]],
            say: ['Hatch the newcomers', 'The genome is above 50%, so the hatchery sets two eggs for the new paddock.', 'A new species draws new guests, which is the point of the research.'],
            force: { hatch: true }, until: function (V) { return V.count('leaellynasaura') >= 2; }, timeout: 40 },
          { cam: { rect: [18, 28, 38, 40], pad: 0 }, panel: 'fin',
            say: ['Steady profit', 'Two paddocks, a few amenities and steady crowds. Time speeds up so we can watch the money settle.', 'Slow, steady growth beats a big gamble. The park now earns more each day than it spends.'],
            until: function (V) { return V.day() >= 8; }, rate: 40, timeout: 80 }
        ],
        stats: function (V) { return { Species: 2, Paddocks: 2, Scientists: Z.state.staff.filter(function (x) { return x.type === 'scientist'; }).length }; },
        lessons: ['Check that the first species is settled before adding the next.', 'Reuse a layout that worked.', 'Read each species\' needs: shelter, water and plants differ.', 'Steady profit comes from small, well-judged steps.'] }
    ]
  });

  // ====================================================================== The Reckless Mogul
  var B1 = [29, 29, 40, 35], B2 = [20, 31, 26, 35];
  Ex.register({
    id: 'reckless', title: 'The Reckless Mogul', badge: 'bad', minutes: 5,
    blurb: 'Same island, same money, a very different plan. Watch each mistake being made, then watch it bite, and compare with the Careful Keeper on the same day.',
    topics: ['Fences', 'Habitat', 'Carnivores', 'Staff', 'Prices', 'Loans', 'Escapes', 'Headlines'],
    start: { seed: 101, map: 'fern_meadow', difficulty: 'normal' },
    compare: { game: 'careful', day: 8 },
    setup: function (V) { V.setGenome('velociraptor', 62); },
    chapters: [
      { id: 'grand', title: 'Think big, spend fast',
        steps: [
          { cam: { rect: [18, 28, 42, 50], pad: 0 }, say: ['The Reckless Mogul', 'The same island and the same money as the Careful Keeper. This time every decision is the quick, showy one.', 'Watch for each mistake as it is made. We will name it again when it bites.'] },
          { cam: { rect: B1 }, act: [['clear', 28, 28, 41, 37], ['fence', 29, 29, 40, 35, 'post_rail']],
            say: ['Mistake 1: huge paddock, cheap fence', 'A paddock of 84 tiles for two small dinosaurs, closed in with a light post-and-rail fence.', 'Dryosaurus needs fencing of strength 2. This is strength 1, so it is leaky as well as bare.'] },
          { cam: { rect: B1 }, act: [['path', 27, 36, 28, 39, 'paved'], ['path', 29, 36, 40, 36, 'paved'], ['hatch', 'dryosaurus', 33, 32], ['hatch', 'dryosaurus', 35, 33]],
            say: ['Mistake 2: nothing inside', 'No pond, no shelter, no favourite plants, nothing to enrich the ground. Two eggs go in anyway.', 'Missing water, shelter and food plants quietly drag down every animal in the paddock.'],
            force: { hatch: true }, until: function (V) { return V.count('dryosaurus') >= 2; }, timeout: 40 },
          { cam: { rect: B2 }, act: [['clear', 19, 30, 27, 37], ['fence', 20, 31, 26, 35, 'low_wood'], ['path', 20, 36, 26, 36, 'paved'], ['hatch', 'velociraptor', 22, 33], ['hatch', 'velociraptor', 24, 33]],
            say: ['Mistake 3: a raptor behind a toy fence', 'Velociraptors are fast, clever carnivores that need strength-4 fencing. A low wooden fence is strength 1.', 'The gap between what the animal needs and what the fence gives is what drives escapes.'],
            force: { hatch: true }, until: function (V) { return V.count('velociraptor') >= 2; }, timeout: 40 },
          { cam: 'keep', act: [['ticket', 28]], panel: 'fin',
            say: ['Mistake 4: a greedy ticket', 'A ticket of £28 looks clever on paper. Guests will compare it with a very small park.', 'The Keeper charged £9. Guests who feel overcharged stay away, and word gets round.'] },
          { cam: { rect: [26, 34, 40, 42], pad: 0 }, act: [['loan', 30000], ['clear', 30, 37, 40, 41], ['put', 'carousel', 31, 37], ['put', 'gift_shop', 36, 37], ['marketing']],
            say: ['Mistake 5: a loan for a ride', 'A £30,000 loan buys a carousel, a gift shop and an advertising campaign before the park has a single toilet or bin.', 'Guests choose toilets, food and animals first. The loan costs interest every day, ride or no ride.'] },
          { cam: 'keep', panel: ['res', 'lab'], act: [['hireScientist'], ['buyAmber'], ['buyAmber'], ['buyAmber'], ['extract'], ['extract']], tick: function (V) { return V.extractIfFree(); },
            say: ['Mistake 6: every scientist busy', 'Both scientists are sent on extraction after extraction, so the fragments pile up on the sequencing bench and the genomes crawl.', 'Free scientists sequence. Without a free one the backlog grows, and the amber money sits idle.'], hold: 9 }
        ],
        lessons: ['A big paddock needs more of everything and costs more to fence.', 'A fence must beat the animal\'s required strength.', 'Carnivores need strong fences and careful planning.', 'Do not spend a loan on a ride before the basics.', 'Keep a scientist free so sequencing can run.'] },
      { id: 'bites', title: 'The bill arrives',
        steps: [
          { cam: { follow: { sp: 'dryosaurus' }, d: 22 }, tick: function (V) { return V.extractIfFree(); },
            say: ['Time passes', 'No ranger, no toilets, no bins. We speed things up and watch the herd: its food runs out and its mood sinks.', 'Neglect is quiet at first. Dirt, hunger and queues build for days before anything snaps.'],
            until: function (V) { return V.escapes() >= 1; }, rate: 40, timeout: 70 },
          { cam: { follow: { sp: 'velociraptor' }, d: 10 },
            say: ['Escape: the mistake bites', 'A velociraptor has got out. A strength-1 fence against a strength-4 animal fails within hours.', 'This is Mistake 3 again. The fence was the whole difference between a calm park and a crisis.'], hold: 8 },
          { cam: { rect: [18, 28, 42, 42], pad: 0 }, tick: function (V) { return V.extractIfFree(); },
            say: ['Guests, dirt and headlines', 'Guests are hurt, the paths are filthy and the papers have noticed. Fewer people arrive each day.', 'Reputation takes days to build and hours to lose. Mistakes 4 and 5 are costing money now.'],
            until: function (V) { return V.day() >= 9; }, rate: 40, timeout: 80 }
        ],
        lessons: ['Escapes follow directly from a weak fence.', 'Dirty paths and missing toilets drag the rating down.', 'High prices and bad press shrink the crowds.', 'Loans have to be paid back, with interest, from a falling income.'] },
      { id: 'compare', title: 'Side by side', compare: true,
        steps: [
          { cam: 'keep', panel: 'fin', say: ['The comparison', 'Here is the Mogul against the Careful Keeper on the same day of the same island.', 'Neither started with an advantage. The only difference is the decisions.'], hold: 6 }
        ],
        lessons: ['Same map, same seed, same money: the plan made the difference.', 'Fix the basics, then grow.', 'Count the cost of every shortcut before you take it.'] }
    ]
  });
})();
