// ===== 59-weather-hud.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - weather chip next to the clock + popover (effects, hours left, forecast, active events). Missing weather = clear. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic, el = {}, key = '', pinned = false, FALL = {
    clear: ['☀️', 'Clear', 'Bright skies.', ''], cloudy: ['☁️', 'Cloudy', 'Grey skies.', ''], rain: ['🌧️', 'Rain', 'Steady rain.', ''],
    storm: ['⛈️', 'Storm', 'Thunder and lightning.', ''], heatwave: ['🔥', 'Heatwave', 'Scorching sun.', ''], fog: ['🌫️', 'Fog', 'Thick fog.', '']
  };
  function defOf(type) {
    var list = (Z.DATA && Z.DATA.weather) || [], d = null, k;
    for (k = 0; k < list.length; k++) if (list[k].id === type) d = list[k];
    var f = FALL[type] || FALL.clear;
    return { id: type, emoji: (d && d.emoji) || f[0], name: (d && d.name) || f[1], blurb: (d && d.blurb) || f[2], effects: (d && d.effects) || f[3] };
  }
  function info() {
    var S = Z.state, w = (S && S.weather) || null, type = (w && w.type) || 'clear', d = defOf(type), r = null;
    try { if (Z.Sim && Z.Sim.weatherInfo) r = Z.Sim.weatherInfo(); } catch (e) { r = null; }
    if (r && r.type) { type = r.type; d = defOf(type); if (r.name) d.name = r.name; if (r.emoji) d.emoji = r.emoji; if (r.effects) d.effects = r.effects; }
    return { type: type, def: d, hours: r && typeof r.hoursLeft === 'number' ? r.hoursLeft : (w && typeof w.hoursLeft === 'number' ? w.hoursLeft : null), forecast: r ? r.forecast : (w ? w.next : null), inten: w && typeof w.intensity === 'number' ? w.intensity : null };
  }
  function hoursText(hh) {
    if (hh === null || hh === undefined || isNaN(hh)) return '';
    if (hh < 1) return 'less than an hour';
    return 'about ' + Math.round(hh) + (Math.round(hh) === 1 ? ' hour' : ' hours');
  }
  function fcOne(f) {
    if (f === null || f === undefined) return '';
    if (typeof f === 'string') { var d = defOf(f); return FALL[f] || (Z.DATA.weather || []).some(function (x) { return x.id === f; }) ? d.emoji + ' ' + d.name : f; }
    var t = f.type || f.id || f.weather, dd = t ? defOf(t) : null, nm = f.name || (dd ? dd.name : ''), em = f.emoji || (dd ? dd.emoji : '');
    var when = typeof f.hours === 'number' ? ' in ' + hoursText(f.hours).replace('about ', '') : (typeof f.inHours === 'number' ? ' in ' + hoursText(f.inHours).replace('about ', '') : (f.when ? ' ' + f.when : ''));
    return (em ? em + ' ' : '') + nm + when;
  }
  function fcText(f) {
    if (f === null || f === undefined || f === '') return '';
    if (Array.isArray(f)) return f.map(fcOne).filter(Boolean).join(', then ');
    if (f.text) return f.text;
    return fcOne(f);
  }
  function eventLeft(e) {
    var S = Z.state;
    if (typeof e.hoursLeft === 'number') return hoursText(e.hoursLeft).replace('about ', '') + ' left';
    if (typeof e.until === 'number' && S) {
      var left = (e.until - (S.day + S.time)) * 24;   // 'until' is a fractional day number (day + time of day)
      if (left > 0) return left < 1 ? 'under an hour left' : left < 36 ? Math.round(left) + (Math.round(left) === 1 ? ' hour' : ' hours') + ' left' : 'until day ' + Math.floor(e.until);
    }
    return typeof e.until === 'string' ? e.until : '';
  }
  function events() { try { return (Z.Sim && Z.Sim.activeEvents && Z.Sim.activeEvents()) || []; } catch (e) { return []; } }

  function render(force) {
    if (!el.chip) return;
    var i = info(), ev = events(), S = Z.state;
    var k = i.type + '|' + (i.hours === null ? '' : Math.round(i.hours)) + '|' + ev.map(function (e) { return e.id + (eventLeft(e)); }).join(',') + '|' + fcText(i.forecast) + '|' + (i.def.effects || '');
    if (!force && k === key) return; key = k;
    el.emoji.textContent = i.def.emoji; el.name.textContent = i.def.name;
    el.chip.setAttribute('aria-label', 'Weather: ' + i.def.name + (ev.length ? ', ' + ev.length + ' event' + (ev.length > 1 ? 's' : '') : ''));
    el.chip.classList.toggle('wx-bad', i.type === 'storm' || i.type === 'heatwave');
    el.chip.classList.toggle('wx-ev', ev.length > 0);
    el.evdot.style.display = ev.length ? '' : 'none';
    var fc = fcText(i.forecast), ht = hoursText(i.hours);
    var html = '<div class="wxh"><span class="wxe">' + i.def.emoji + '</span><div><b>' + i.def.name + '</b><small>' + (ht ? 'Lasts ' + ht : 'Settled') + '</small></div></div>' +
      (i.def.blurb ? '<p class="wxb">' + i.def.blurb + '</p>' : '') +
      '<div class="wxfx"><span>Effects on the park</span>' + (i.def.effects ? i.def.effects : 'Nothing out of the ordinary.') + '</div>' +
      (fc ? '<div class="wxfc"><span>Forecast</span>' + fc + '</div>' : '') +
      '<div class="wxev"><span>Events</span>' + (ev.length ? ev.map(function (e) { var l = eventLeft(e); return '<div class="wxe1"><i>' + (e.emoji || '✨') + '</i><div><b>' + (e.name || 'Event') + '</b><small>' + (e.text || '') + '</small></div>' + (l ? '<em>' + l + '</em>' : '') + '</div>'; }).join('') : '<div class="wxnone">Nothing special going on.</div>') + '</div>';
    el.pop.innerHTML = html;
  }
  function place() {
    var r = el.chip.getBoundingClientRect(), w = Math.min(window.innerWidth - 12, 330);
    el.pop.style.width = w + 'px';
    el.pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6)) + 'px';
    el.pop.style.top = (r.bottom + 6) + 'px';
  }
  function open(on) { if (!el.chip) return; if (on) { render(true); place(); } el.pop.classList.toggle('on', on); el.chip.classList.toggle('open', on); if (!on) pinned = false; }

  function init() {
    var clock = UI.el && UI.el.clock; if (!clock || el.chip) return;
    el.emoji = h('span.wxe'); el.name = h('span.wxn'); el.evdot = h('i.wxdot', { style: 'display:none' });
    el.chip = h('button#wxchip.pill.hud-cell', { 'aria-label': 'Weather', title: 'Weather and events', on: { click: function (e) { e.stopPropagation(); UI.snd('click'); pinned = !el.pop.classList.contains('on') || !pinned; open(pinned); } } }, el.emoji, el.name, el.evdot);
    el.pop = h('div#wxpop.pill', { role: 'dialog', 'aria-label': 'Weather details' });
    clock.parentNode.insertBefore(el.chip, clock.nextSibling);
    UI.$('#ui').appendChild(el.pop);
    el.chip.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && !pinned) open(true); });
    el.chip.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !pinned) open(false); });
    document.addEventListener('pointerdown', function (e) { if (el.pop.classList.contains('on') && !el.pop.contains(e.target) && !el.chip.contains(e.target)) open(false); }, true);
    window.addEventListener('resize', function () { if (el.pop.classList.contains('on')) place(); });
    var b = Z.bus; b.on('weather', function () { render(); }); b.on('newDay', function () { render(); }); b.on('reset', function () { key = ''; render(true); });
    setInterval(function () { if (Z.state) render(); }, 1000);
    render(true);
  }
  var oinit = UI.init;
  UI.init = function () { oinit.apply(this, arguments); init(); };
  UI.Weather = { render: function () { render(true); }, open: open };
})();
