// Wild Acres Zoo — Pier and helipad panel controls (Zoo Tycoon only)
(function () {
  'use strict';
  var Z = window.Z, UI = Z && Z.UI;
  if (!Z || !UI) return;

  var h = UI.h, fmt = UI.fmt;
  var MAX_FARE = 20;

  UI.Boats = {
    fareControl: function (o, def, body) {
      var isPier = def.boatPier === 'guest', max = isPier ? MAX_FARE : 100;
      var label = isPier ? 'Fare per trip' : 'Arrival fee', value = h('b.num');
      var slider = h('input', { type: 'range', min: '0', max: String(max), step: '1', value: String(o.price), 'aria-label': label });
      function paint() {
        slider.style.setProperty('--p', (slider.value / max * 100) + '%');
        value.textContent = +slider.value === 0 ? 'Free' : fmt(+slider.value);
      }
      slider.addEventListener('input', function () { Z.Sim.setPrice(o.id, +slider.value); free && (free.firstChild.checked = o.price === 0); paint(); });
      body.appendChild(h('div.kv', h('span', { text: label }), value));
      body.appendChild(slider);
      var free = null;
      if (isPier) {
        free = h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px' },
          h('input', { type: 'checkbox', on: { change: function () {
            Z.Sim.setPrice(o.id, this.checked ? 0 : def.price); slider.value = String(o.price); paint();
          } } }), h('span', { text: 'Free boat rides' }));
        free.firstChild.checked = o.price === 0;
        body.appendChild(free);

        if (Z.Boats && Z.Boats.setFerries) {
          var statsOf = function () { return Z.Boats.pierStats ? Z.Boats.pierStats(o) : null; };
          var maxOf = function () {
            var st = statsOf();
            return (st && (st.maxFerries || st.ferryMax)) || Z.Boats.FERRY_MAX || 4;
          };
          var curF = function () {
            var st = statsOf();
            return (st && (st.configuredFerries || st.ferries)) || o.ferries || 1;
          };
          var fVal = h('b.num'), minusBtn, plusBtn;
          var fleetNote = h('div', { style: 'font-size:12px;color:var(--ink2);line-height:1.35;margin-top:2px' });
          function paintFerries() {
            var st = statsOf();
            var maxF = (st && (st.maxFerries || st.ferryMax)) || Z.Boats.FERRY_MAX || 4;
            var cap = (st && st.capacity) || Z.Boats.FERRY_CAP || 16;
            var largeNet = !!(st && st.largeNet);
            var n = Math.max(1, Math.min(maxF, curF()));
            fVal.textContent = String(n);
            if (minusBtn) minusBtn.disabled = n <= 1;
            if (plusBtn) plusBtn.disabled = n >= maxF;
            fleetNote.textContent = largeNet
              ? ('Upgraded by Large ferry terminal: shared fleet on this water supports up to ' + maxF + ' double-deck ferries × ' + cap + ' guests each.')
              : ('Ferries are shared by all guest piers on this water (max ' + maxF + ' × ' + cap + ' guests). Build a Large ferry terminal on this water to upgrade to 48-guest double-deck ferries (max 6).');
          }
          minusBtn = h('button.btn.sm.alt', { text: '-', on: { click: function () {
            Z.Boats.setFerries(o.id, Math.max(1, curF() - 1));
            UI.snd && UI.snd('click');
            paintFerries();
          } } });
          plusBtn = h('button.btn.sm.alt', { text: '+', on: { click: function () {
            Z.Boats.setFerries(o.id, Math.min(maxOf(), curF() + 1));
            UI.snd && UI.snd('click');
            paintFerries();
          } } });
          var fRow = h('div.kv', { style: 'margin-top:4px' },
            h('span', { text: 'Ferries' }),
            h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, minusBtn, fVal, plusBtn));
          body.appendChild(fRow);
          body.appendChild(fleetNote);
          paintFerries();
        }
      }
      paint();
    },
    rows: function (o, def, r) {
      var rows = [], linked = Z.Boats ? Z.Boats.linkedCount(o) : 0;
      var st = Z.Boats && Z.Boats.pierStats ? Z.Boats.pierStats(o) : null;
      if (def.boatPier === 'guest') {
        if (st) {
          var maxF = st.maxFerries || st.ferryMax || 4;
          rows.push(
            ['Shared fleet (this water)', st.ferries + ' / ' + maxF + (st.largeNet ? ' large ferries' : ' ferries')],
            ['Ferry capacity', st.capacity + ' guests / ferry (' + (st.ferries * st.capacity) + ' total)'],
            ['Queueing', st.queueing]
          );
        }
        rows.push(['Boardings', r.uses], ['Fares so far', fmt(r.income)], ['Other piers on this water', linked]);
      } else if (def.boatPier) {
        if (st) {
          rows.push(
            ['Service boats (this water)', st.serviceAvail + ' / ' + st.serviceTotal + ' available (max ' + st.serviceMax + ')'],
            ['Fleet rule', st.servicePerPier + ' per service pier (shared on water)'],
            ['Staff waiting', st.staffWaiting]
          );
        }
        rows.push(['Other piers on this water', linked]);
      } else if (def.helipad === 'vip') rows.push(['VIPs flown in', r.uses], ['Arrival fees so far', fmt(r.income)]);
      else rows.push(['Other staff helipads', linked]);
      return rows;
    }
  };
})();
