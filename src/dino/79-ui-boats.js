// ===== 79-ui-boats.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Amber Acres - boats UI: the Transport build category (guest pier, service pier, staff helipad, VIP helipad) and the panel for those buildings.
   Pontoons are an ordinary path type and appear in the Paths category. Behaviour lives in Z.Boats (29b-sim-boats.js); drawing in Z.BoatsWorld. */
(function () {
  'use strict';
  var UI = Z.UI = Z.UI || {}, D = Z.DATA, BC = D.boats, h = UI.h, fmt = UI.fmt, ic = UI.ic;
  var U = UI.Boats = {};
  var IDS = ['guest_pier', 'service_pier', 'staff_helipad', 'vip_helipad'];
  var BLURB = { guest: 'Guest pier', service: 'Service pier (staff only)', staff: 'Staff helipad', vip: 'VIP helipad' };

  UI.extraCats = (UI.extraCats || []).concat([{
    id: 'transport', name: 'Transport', icon: 'boat',
    items: function () { return IDS.map(function (id) { var d = UI.byId(D.buildings, id); return { kind: 'building', id: id, name: d.name, cost: d.cost, emoji: d.emoji, def: d, star: d.star || 0, fp: [d.w, d.h] }; }); },
    hint: 'Piers carry boats across water, helipads fly staff or VIP guests. Pontoons (Paths) float on any water.'
  }]);

  function mrow(label) { var v = h('b'), r = h('div.mr', h('span', { text: label }), v); r._v = v; return r; }

  U.open = function (kind, id) {
    var P = UI.Panel && UI.Panel.kit, o = P && kind === 'object' && P.find(Z.state.objects, id);
    if (!o || IDS.indexOf(o.type) < 0) return false;
    var def = UI.byId(D.buildings, o.type), kindOf = def.boats, B = Z.Boats;
    var f = P.frame(P.thumbBox('building', o.type, 96, def.emoji), def.name, BLURB[kindOf]), b = f.body;
    var fp = Z.Sim.footprint(o.type, o.i, o.j, o.rot), tiles = [];
    for (var a = 0; a < fp.w; a++) for (var c = 0; c < fp.h; c++) tiles.push({ i: fp.i0 + a, j: fp.j0 + c });
    Z.World.setPreview({ type: 'tiles', tiles: tiles, ok: true });
    var info = h('div.mbx'), rStatus = mrow('Status'), r1 = mrow(kindOf === 'vip' ? 'VIPs welcomed' : kindOf === 'guest' ? 'Boat rides from here' : 'Linked to'), r2 = mrow(kindOf === 'vip' ? 'Arrival fees earned' : 'Fares taken here');
    var rQueue = kindOf === 'guest' ? mrow('Queueing') : null;
    var rSvc = kindOf === 'service' ? mrow('Service boats') : null;
    var rWait = kindOf === 'service' ? mrow('Staff waiting') : null;
    info.appendChild(h('h4', { text: BLURB[kindOf] }));
    [rStatus].concat(rQueue ? [rQueue] : []).concat([r1]).concat(kindOf === 'guest' || kindOf === 'vip' ? [r2] : []).concat(rSvc ? [rSvc, rWait] : []).forEach(function (r) { info.appendChild(r); });
    b.appendChild(info);
    var rFerries = null, ferryMinus = null, ferryPlus = null;
    if (kindOf === 'guest') {
      rFerries = mrow('Ferries on this water');
      ferryMinus = h('button.btn.sm.alt', { text: '-' });
      ferryPlus = h('button.btn.sm.alt', { text: '+' });
      function adjFerries(delta) {
        var pi = B.pierInfo(id); if (!pi || pi.guestPeers < 2) return;
        B.setFerries(id, pi.ferries + delta); UI.snd('click');
        var np = B.pierInfo(id); if (np) paintFerries(np);
      }
      ferryMinus.addEventListener('click', function () { adjFerries(-1); });
      ferryPlus.addEventListener('click', function () { adjFerries(1); });
      b.appendChild(h('div.mbx', h('h4', { text: 'Ferry fleet' }), rFerries, h('div.btnrow', ferryMinus, ferryPlus)));
    }
    function paintFerries(pi) {
      if (!rFerries) return;
      var active = pi.guestPeers >= 2;
      rFerries._v.textContent = active ? (pi.ferries + ' (cap ' + pi.ferryCap + ' each)') : '0 (needs 2+ guest piers)';
      ferryMinus.disabled = !active || pi.ferries <= 1;
      ferryPlus.disabled = !active || pi.ferries >= pi.ferryMax;
    }
    var fareV = h('b'), slider = h('input', { type: 'range', min: '0', max: String(BC.fareMax), step: '0.5', 'aria-label': 'Fare' }), freeBtn = h('button.btn.sm.alt');
    function paintFare() {
      var q = P.find(Z.state.objects, id); if (!q) return; var free = !!q.mfree, fv = B.fareOf(q);
      fareV.textContent = free ? 'Free with entry ticket' : fmt(fv);
      freeBtn.textContent = free ? 'Free with ticket: on' : 'Free with ticket: off'; freeBtn.className = 'btn sm' + (free ? '' : ' alt');
      slider.disabled = free; if (document.activeElement !== slider) slider.value = String(fv);
    }
    slider.addEventListener('input', function () { B.setFare(id, +slider.value); paintFare(); });
    freeBtn.addEventListener('click', function () { B.setFree(id, !(P.find(Z.state.objects, id) || {}).mfree); UI.snd('click'); paintFare(); });
    if (kindOf === 'guest') {
      var fare = h('div.mbx', h('h4', { text: 'Fare' }), h('div.mr', h('span', { text: 'Ticket per boat ride' }), fareV), slider, h('div.btnrow', freeBtn));
      b.appendChild(fare); paintFare();
    }
    var note = kindOf === 'guest' ? 'Guests use a pier only when they cannot walk to an exhibit. Build another pier beside the paths on the other shore of the same water.'
      : kindOf === 'service' ? 'Guests never use this pier. Keepers, vets, cleaners and mechanics use it, and guest piers, to reach paths they cannot walk to.'
      : kindOf === 'staff' ? 'Staff fly between any two staff helipads. Guests cannot use them.'
      : 'VIPs arrive and leave by helicopter while a pad is open. Keep the park clean and well stocked: they expect more.';
    b.appendChild(h('div', { style: 'font-size:12px;color:var(--ink2);margin:6px 0', text: note }));
    var refund = Math.floor(def.cost * 0.5);
    b.appendChild(h('div.btnrow', P.confirmBtn(ic('trash') + 'Demolish', 'Demolish for +' + fmt(refund) + '?', function () { Z.Sim.bulldoze(o.i, o.j); UI.snd('build'); UI.Panel.hide(); }, 'alt')));
    P.setCur({
      kind: 'object', update: function () {
        var q = P.find(Z.state.objects, id), pi = q && B.pierInfo(id); if (!pi) return false;
        rStatus._v.textContent = !pi.connected ? 'No path at the entrance' : pi.kind !== 'vip' && pi.kind !== 'staff' && !pi.onWater ? 'Not touching water' : 'Open';
        rStatus.className = 'mr ' + (pi.connected && (pi.onWater || pi.kind === 'vip' || pi.kind === 'staff') ? 'ok' : 'bad');
        if (kindOf === 'vip') { r1._v.textContent = String(Z.state.boats.stats.vip); r2._v.textContent = fmt(Z.state.boats.stats.vipIncome); }
        else if (kindOf === 'guest') {
          rQueue._v.textContent = String(pi.queueing);
          r1._v.textContent = String(pi.rides); r2._v.textContent = fmt(pi.income);
          paintFerries(pi);
        } else {
          r1._v.textContent = pi.linked + (kindOf === 'staff' ? ' other helipad' : ' other pier') + (pi.linked === 1 ? '' : 's');
          if (rSvc) rSvc._v.textContent = pi.serviceAvail + ' / ' + pi.serviceTotal + ' available';
          if (rWait) rWait._v.textContent = String(pi.staffWaiting);
        }
        if (kindOf === 'guest' && document.activeElement !== slider) paintFare();
        return true;
      }
    });
    return true;
  };

  Z.bus.on('guestAdded', function (g) { if (g && g.vip && UI.toast) UI.toast('A VIP guest has arrived by helicopter.', 'good'); });
})();
