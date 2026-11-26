// ===== 68-ui-resort.js =====
// Luxury Resort UI module (window.UI.Resort) for Dino Tycoon and Zoo Tycoon
(function () {
  'use strict';
  window.Z = window.Z || {};
  var Z = window.Z, UI = Z.UI = Z.UI || {};
  var h = UI.h, fmt = UI.fmt;

  var Resort = UI.Resort = {
    drawerMode: 'all',
    FILTERS: [
      { id: 'all', label: 'All' },
      { id: 'stays', label: 'Stays' },
      { id: 'dining', label: 'Dining & Spa' },
      { id: 'enclosures', label: 'Enclosures' },
      { id: 'security', label: 'Security & Staff' },
      { id: 'decor', label: 'Paths & Decor' }
    ],
    items: function (D, mode) {
      if (!D) return [];
      var list = [];

      // 1. Buildings
      if (D.buildings) {
        Object.keys(D.buildings).forEach(function (k) {
          var b = D.buildings[k];
          if (b && b.resort) {
            list.push({
              kind: 'building',
              id: b.id,
              name: b.name,
              emoji: b.emoji || '🏨',
              cost: b.cost,
              star: b.star || 1,
              resortTab: b.resortTab || 'stays',
              def: b,
              fp: b.w && b.h ? [b.w, b.h] : undefined
            });
          }
        });
      }

      // 2. Fences
      if (D.fences) {
        Object.keys(D.fences).forEach(function (k) {
          var f = D.fences[k];
          if (f && f.resort) {
            list.push({
              kind: 'fence',
              id: f.id,
              name: f.name,
              emoji: f.emoji || '🧱',
              cost: f.cost,
              star: f.star || 1,
              resortTab: 'enclosures',
              def: f
            });
          }
        });
      }

      // 3. Paths
      if (D.paths) {
        Object.keys(D.paths).forEach(function (k) {
          var p = D.paths[k];
          if (p && p.resort) {
            list.push({
              kind: 'path',
              id: p.id,
              name: p.name,
              emoji: p.emoji || '⚜️',
              cost: p.cost,
              star: p.star || 1,
              resortTab: 'decor',
              def: p
            });
          }
        });
      }

      // 4. Scenery
      if (D.scenery) {
        Object.keys(D.scenery).forEach(function (k) {
          var s = D.scenery[k];
          if (s && s.resort) {
            var tab = s.resortTab || (s.inEnclosure ? 'enclosures' : 'decor');
            list.push({
              kind: 'scenery',
              id: s.id,
              name: s.name,
              emoji: s.emoji || '🪴',
              cost: s.cost,
              star: s.star || 1,
              resortTab: tab,
              def: s
            });
          }
        });
      }

      // 5. Staff
      if (D.staff) {
        Object.keys(D.staff).forEach(function (k) {
          var st = D.staff[k];
          if (st && st.resort) {
            list.push({
              kind: 'staff',
              id: st.id,
              name: st.name,
              emoji: st.emoji || '🛡️',
              cost: st.hireCost || st.cost || 0,
              star: st.star || 1,
              resortTab: 'security',
              def: st
            });
          }
        });
      }

      if (mode && mode !== 'all') {
        list = list.filter(function (it) {
          return it.resortTab === mode;
        });
      }

      // Sort by cost or star
      list.sort(function (a, b) {
        return (a.star - b.star) || (a.cost - b.cost);
      });

      return list;
    },
    catDef: function (D) {
      return {
        id: 'resort',
        name: 'Resort',
        icon: '👑',
        items: function () {
          return Resort.items(D, Resort.drawerMode);
        },
        hint: 'Build a private Luxury Resort with overnight villas, five-star dining, infinity pools, exclusive enclosures & VIP security.'
      };
    },
    renderFilterBar: function (container, onChange) {
      if (!container) return;
      container.innerHTML = '';
      container.className = 'tp-fbar';
      Resort.FILTERS.forEach(function (f) {
        var active = Resort.drawerMode === f.id;
        var chip = h('button.tp-chip' + (active ? '.active' : ''), {
          type: 'button',
          text: f.label
        });
        chip.addEventListener('click', function () {
          Resort.drawerMode = f.id;
          if (typeof onChange === 'function') onChange(f.id);
          var chips = container.querySelectorAll('.tp-chip');
          chips.forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
        });
        container.appendChild(chip);
      });
    },
    objectBlock: function (o, def, body) {
      if (!body || !def || !def.resort) return;
      var ZR = Z.Resort;
      var stats = ZR && typeof ZR.objectStats === 'function' ? ZR.objectStats(o) : null;

      var sec = h('div.psec');
      var roleLabel = def.resortRole || (def.resortTab === 'stays' ? 'Overnight Lodging' : def.resortTab === 'dining' ? 'Fine Dining & Wellness' : def.resortTab === 'enclosures' ? 'VIP Viewing' : def.resortTab === 'security' ? 'Resort Security' : 'Concierge');

      sec.appendChild(h('div.flex.between.mb4',
        h('span.badge.gold', '👑 Luxury Resort'),
        h('span.text-muted', { style: 'font-size:12px' }, roleLabel)
      ));

      if (stats) {
        if (def.resortTab === 'stays') {
          sec.appendChild(h('div.mr', h('span', 'Beds Occupied'), h('b', (stats.occupied || 0) + ' / ' + (stats.capacity || 0))));
          sec.appendChild(h('div.mr', h('span', 'Guests Sleeping Tonight'), h('b', stats.sleepingTonight || 0)));
          sec.appendChild(h('div.mr', h('span', 'Total Nights Booked'), h('b', stats.totalNights || 0)));
          sec.appendChild(h('div.mr', h('span', 'Room Revenue'), h('b', fmt(stats.revenue || 0))));
        } else if (def.resortTab === 'security') {
          sec.appendChild(h('div.mr', h('span', 'Protected Radius'), h('b', (stats.radius || 16) + ' tiles')));
          sec.appendChild(h('div.mr', h('span', 'Resort Security Rating'), h('b', (stats.securityRating || 100) + '%')));
        }
        if (stats.prestige !== undefined) {
          sec.appendChild(h('div.mr', h('span', 'Resort Prestige'), h('b', stats.prestige + ' / 100')));
        }
        if (stats.vipGuests !== undefined) {
          sec.appendChild(h('div.mr', h('span', 'VIP Guests in Park'), h('b', stats.vipGuests)));
        }
      } else {
        sec.appendChild(h('div.mr', h('span', 'Resort Prestige'), h('b', def.star ? (def.star * 25) + ' / 100' : '75 / 100')));
      }

      body.appendChild(sec);
    },
    enclosureBlock: function (enc, body) {
      if (!body || !enc) return;
      var ZR = Z.Resort;
      var bonus = ZR && typeof ZR.enclosureBonus === 'function' ? ZR.enclosureBonus(enc) : null;
      if (!bonus || !bonus.isLuxury) return;

      var sec = h('div.psec');
      sec.appendChild(h('div.flex.between.mb4',
        h('span.badge.gold', '👑 Luxury Enclosure'),
        h('span.text-muted', { style: 'font-size:12px' }, 'Five-Star Habitat')
      ));

      sec.appendChild(h('div.mr', h('span', 'Prestige Score'), h('b', (bonus.prestige || 0) + ' / 100')));
      sec.appendChild(h('div.mr', h('span', 'Appeal Bonus'), h('b', '+' + (bonus.appealBonus || 0) + '%')));
      if (bonus.welfareBonus) {
        sec.appendChild(h('div.mr', h('span', 'Animal Welfare Bonus'), h('b', '+' + bonus.welfareBonus + '%')));
      }

      body.appendChild(sec);
    },
    registerExtraCat: function (D) {
      if (!UI.extraCats) UI.extraCats = [];
      var cat = Resort.catDef(D);
      var exists = UI.extraCats.some(function (c) { return c.id === 'resort'; });
      if (!exists) {
        UI.extraCats.push(cat);
      }
    }
  };

  // Auto register if D is available
  if (window.Z && window.Z.DATA) {
    Resort.registerExtraCat(window.Z.DATA);
  }
})();
