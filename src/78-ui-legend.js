// ===== 78-ui-legend.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Overlay key: while a moat, power coverage, zone, monorail or safari overlay is switched on, a small non-interactive card names every
   colour AND its pattern (X, dots, stripes, dashes), so the overlays never rely on colour alone (colour-blind players, bright sun on a phone).
   Patterns are drawn in the world by 47-world-patterns.js (moats, safari, monorail), 45-world-power.js (dashed ring) and 44-world-realms.js (tall spike). */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h;
  var st = document.createElement('style'); st.setAttribute('data-legend', '1');
  st.textContent = '#ovlegend{position:absolute;z-index:5;left:8px;top:46%;transform:translateY(-50%);max-width:172px;padding:6px 8px;border-radius:12px;pointer-events:none;display:none;font:600 11.5px/1.25 var(--sans);color:var(--ink);background:rgba(248,240,218,.93);border:2px solid rgba(58,42,26,.5);box-shadow:var(--shadow)}' +
    '#ovlegend.on{display:block}.ui-hidden #ovlegend{display:none}#ovlegend h5{margin:0 0 3px;font:700 11px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}#ovlegend h5:not(:first-child){margin-top:5px}' +
    '#ovlegend .lr{display:flex;align-items:center;gap:6px;margin:2px 0}#ovlegend svg{flex:none;width:20px;height:20px;border-radius:4px;border:1px solid rgba(20,34,44,.55)}' +
    '@media(max-width:819px) and (max-height:520px){#ovlegend{top:150px;transform:none;max-width:150px;font-size:10.5px}}';
  document.head.appendChild(st);
  var INK = '#14222c';
  function glyph(col, kind) {
    var g = '';
    switch (kind) {
      case 'x': g = '<path d="M5 5L15 15M5 15L15 5" stroke="' + INK + '" stroke-width="2.6"/>'; break;
      case 'dots': g = '<rect x="3" y="9" width="3" height="3" fill="' + INK + '"/><rect x="8.5" y="9" width="3" height="3" fill="' + INK + '"/><rect x="14" y="9" width="3" height="3" fill="' + INK + '"/>'; break;
      case 's1': g = '<rect x="4" y="9" width="12" height="2.4" fill="' + INK + '"/>'; break;
      case 's2': g = '<rect x="4" y="6" width="12" height="2.4" fill="' + INK + '"/><rect x="4" y="12" width="12" height="2.4" fill="' + INK + '"/>'; break;
      case 's3': g = '<rect x="4" y="4.5" width="12" height="2" fill="' + INK + '"/><rect x="4" y="9" width="12" height="2" fill="' + INK + '"/><rect x="4" y="13.5" width="12" height="2" fill="' + INK + '"/>'; break;
      case 'diag': g = '<path d="M5 15L15 5" stroke="' + INK + '" stroke-width="2.6"/>'; break;
      case 'dot': g = '<rect x="7.5" y="7.5" width="5" height="5" fill="' + INK + '"/>'; break;
      case 'ring': g = '<rect x="4.5" y="4.5" width="11" height="11" fill="none" stroke="' + INK + '" stroke-width="2"/>'; break;
      case 'post': g = '<rect x="8" y="12" width="4" height="4" fill="#fff"/>'; break;
      case 'spike': g = '<rect x="8.6" y="3" width="2.8" height="14" fill="#fff"/>'; break;
      case 'dashring': g = '<circle cx="10" cy="10" r="6.5" fill="none" stroke="' + INK + '" stroke-width="3" stroke-dasharray="4 3"/>'; break;
      case 'ring2': g = '<circle cx="10" cy="10" r="6.5" fill="none" stroke="' + INK + '" stroke-width="1.6"/>'; break;
    }
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" fill="' + col + '"/>' + g + '</svg>';
  }
  var SETS = [
    { id: 'moats', title: 'Moats', on: function () { var w = Z.MoatsWorld; return !!(w && w.overlayOn && w.overlayOn()); }, rows: [['#e0a030', 'dots', 'Dry ditch'], ['#7fc4f0', 's1', 'Filling, part wet'], ['#3a8fe0', 's2', 'Fresh water'], ['#2fb8b0', 's3', 'Salt water'], ['#e0453a', 'x', 'Not holding animals']] },
    { id: 'power', title: 'Power coverage', on: function () { var w = Z.PowerWorld; return !!(w && w.coverageOn && w.coverageOn()); }, rows: [['#4fc3f7', 'ring2', 'Powered: solid ring'], ['#e0574a', 'dashring', 'No power: dashed ring']] },
    { id: 'zones', title: 'Zones', on: function () { var w = Z.RealmsWorld; return !!(w && w.overlayOn && w.overlayOn()); }, rows: [['#4aff9a', 'post', 'Short green post: powered'], ['#ff3b2a', 'spike', 'Tall red spike: no power']] },
    { id: 'mono', title: 'Monorail', on: function () { return !!(Z.MonoWorld && Z.MonoWorld.overlayOn); }, rows: [['#3ab5e8', null, 'Line working'], ['#e8a23a', 'x', 'Line not working'], ['#f5d36a', 'dot', 'Pylon'], ['#6ed99a', 's1', 'Enclosure under the line']] },
    { id: 'safari', title: 'Safari', on: function () { return !!(Z.SafariWorld && Z.SafariWorld.overlayOn); }, rows: [['#6ed99a', null, 'Zone ready'], ['#e8a23a', 'dots', 'Zone: no power'], ['#b0b6ba', 'diag', 'Zone: not connected'], ['#46e08a', null, 'Route works'], ['#e0614a', 'x', 'Route broken'], ['#ff7a3a', 'ring', 'Corridor marker']] }
  ];
  var el = null, sig = '';
  function tick() {
    if (!UI.el) return;
    if (!el) { el = h('div#ovlegend', { role: 'note', 'aria-label': 'Overlay key' }); var root = document.getElementById('ui') || document.body; root.appendChild(el); }
    var on = SETS.filter(function (s) { try { return s.on(); } catch (e) { return false; } }), k = on.map(function (s) { return s.id; }).join();
    if (k === sig) return; sig = k;
    el.innerHTML = on.map(function (s) { return '<h5>' + s.title + '</h5>' + s.rows.map(function (r) { return '<div class="lr">' + glyph(r[0], r[1]) + '<span>' + r[2] + '</span></div>'; }).join(''); }).join('');
    el.classList.toggle('on', on.length > 0);
  }
  setInterval(tick, 400);
  UI.Legend = { tick: tick, sets: SETS };
})();
