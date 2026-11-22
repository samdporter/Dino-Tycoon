// ===== 72-examples-safari.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Masterclass: the safari chapter of "Sea, Sky and the Lab". DOM-free. Adds one chapter to the 'lab' game when Z.Sim.safari exists.
   It reuses the powered virtual land zone the previous chapter built (tiles 24..29 x 20..25, tower (30,25), substation (32,28)). */
(function () {
  'use strict';
  var Ex = Z.Examples; if (!Ex || !Ex.get) return;
  var lab = Ex.get('lab'); if (!lab || !lab.chapters) return;
  function mark(run, k, v) { run.mark = run.mark || {}; run.mark[k] = v; }
  lab.chapters.push({
    id: 'safari', title: 'Safari: guests in the open', when: function () { return !!(Z.Sim.safari && Z.Sim.realms); },
    steps: [
      { cam: { rect: [22, 18, 34, 32], pad: 1 }, act: [['path', 27, 30, 27, 35, 'paved'], ['put', 'safari_depot', 26, 28, 0], ['put', 'safari_portal', 29, 27, 0]],
        say: ['Guests in the open range', 'A safari takes guests into a zone instead of past it. The zone we built is already powered, so we add a depot for the trucks and a geofence portal where the route crosses the invisible boundary.', 'A safari zone needs at least 36 tiles and a route that runs well inside it. The portal needs power, like the tagging tower.'], hold: 8 },
      { cam: { rect: [22, 18, 34, 32], pad: 1 }, act: [['safariRoute', 26, 28, [[27, 27], [27, 21], [29, 21], [29, 25]]], ['safariBuy', 26, 28], ['safariFare', 26, 28, 6]],
        say: ['A route and a truck', 'The route starts at the depot, drives into the zone, loops round the herd and returns. One truck is enough to start, and the fare is set at the depot.', 'Fares are income, but a fair price keeps the trucks full. Check the depot panel after a few days.'], hold: 8 },
      { cam: { rect: [24, 18, 32, 30], pad: 0 },
        say: ['The first riders', 'Guests queue at the depot, board, and are driven among the Triceratops. Time speeds up while the truck runs its loops.', 'Guests who get close to a herd feel it more than from the path, and the ride pays for itself.'],
        until: function (V) { return V.safariRiders() >= 6; }, rate: 40, timeout: 80, soft: true },
      { cam: { rect: [22, 18, 34, 32], pad: 1 }, act: [['safariLockdown', true]], panel: 'power',
        say: ['Lockdown', 'If something goes wrong, lockdown closes the corridors and stops the rides until you lift it. It costs money, and the guests wait.', 'Use it early. Tagged zones are safe only while the power holds, so keep a backup next to the tower and the portal.'], hold: 8 },
      { cam: { rect: [22, 18, 34, 32], pad: 1 }, act: [['safariLockdown', false]],
        say: ['Back to normal', 'Lockdown lifted and the trucks roll again. A safari is the most exciting thing in the park and also the most exposed.', 'Wild visitors may wander into a connected zone as well. Deer and seals are harmless, a hungry predator is not.'], hold: 6 }
    ],
    stats: function (V) { var st = Z.Safari ? Z.Safari.stats() : {}; return { 'Safari riders': st.riders || 0, 'Safari income': '£' + Math.round(st.income || 0) }; },
    lessons: ['A safari zone is a powered area of at least 36 tiles with a route inside it.', 'A depot, a portal at the boundary and a truck are the minimum.', 'Set a fair fare and watch the queue.', 'Lockdown stops rides when something goes wrong.', 'A tagged safari depends on power: back up the tower and the portal.']
  });
  // the lab game gets longer: keep the length check honest (3 to 6 minutes at 1x)
  if (lab.minutes) lab.minutes = Math.min(6, lab.minutes + 1);
  lab.topics = (lab.topics || []).concat(['Safari']);
})();
