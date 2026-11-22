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
      }
      paint();
    },
    rows: function (o, def, r) {
      var rows = [], linked = Z.Boats ? Z.Boats.linkedCount(o) : 0;
      if (def.boatPier === 'guest') rows.push(['Boardings', r.uses], ['Fares so far', fmt(r.income)], ['Other piers on this water', linked]);
      else if (def.boatPier) rows.push(['Other piers on this water', linked]);
      else if (def.helipad === 'vip') rows.push(['VIPs flown in', r.uses], ['Arrival fees so far', fmt(r.income)]);
      else rows.push(['Other staff helipads', linked]);
      return rows;
    }
  };
})();
