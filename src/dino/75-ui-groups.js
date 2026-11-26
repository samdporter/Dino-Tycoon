// ===== 75-ui-groups.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Two-level build bar: 7 top groups (always fit on a phone) and a chip row of the categories inside the open group.
   Every category keeps its data-cat button (chips, or the group button itself for single-category groups) so the tutorial,
   scripts and UI.openCat(id) keep working. Hooks: UI.buildGroups (50-ui buildTabs), UI.groupMark (markTabs). */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic;
  var GROUPS = [
    { id: 'g_land', name: 'Land', icon: 'mount', cats: ['paths', 'terrain', 'plants', 'decor'] },
    { id: 'g_hab', name: 'Habitats', icon: 'fence', cats: ['fences', 'moats', 'marine', 'aviary', 'tagging', 'safari', 'encl'] },
    { id: 'g_hatch', name: 'Hatch', icon: 'egg', cats: ['hatch'] },
    { id: 'g_guest', name: 'Guests', icon: 'cart', cats: ['fac', 'themepark', 'coasters', 'monorail', 'transport'] },
    { id: 'g_resort', name: 'Resort', icon: '👑', cats: ['resort'] },
    { id: 'g_sci', name: 'Science', icon: 'flask', cats: ['sci', 'power'] },
    { id: 'g_staff', name: 'Staff', icon: 'person', cats: ['staff'] },
    { id: 'g_bull', name: 'Bulldoze', icon: 'trash', cats: ['bull'] }
  ];
  function css(t) { var st = document.createElement('style'); st.setAttribute('data-groups', '1'); st.textContent = t; document.head.appendChild(st); }
  var last = {}, minStar = {}, lastUS = -1, grpEl, subEl;
  UI.GROUPS = GROUPS;
  UI.groupOf = function (cat) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].cats.indexOf(cat) >= 0) return GROUPS[i]; return null; };
  // group button for a category id (used by the tutorial when the category's chip is not on screen)
  UI.groupBtn = function (cat) { var g = UI.groupOf(cat); return g && grpEl ? grpEl.querySelector('[data-grp="' + g.id + '"]') : null; };

  css('#tabs{display:block;overflow:visible;padding:2px 8px 4px;touch-action:auto}' +
    '.tgrps{display:flex;gap:3px}.tgrps .tab{flex:1 1 0;min-width:0;height:52px;padding:0 1px;font-size:10px;position:relative}' +
    '.tgrps .tab .sl{position:absolute;top:1px;right:1px;font:700 9px var(--sans);background:#17331f;color:#f2c94c;border-radius:8px;padding:1px 4px}' +
    '.tsub{display:none;gap:5px;overflow-x:auto;padding:5px 0 1px;scrollbar-width:none;touch-action:pan-x;-webkit-overflow-scrolling:touch}.tsub::-webkit-scrollbar{display:none}.tsub.on{display:flex}' +
    '.tsub .tab{display:none;flex:0 0 auto;flex-direction:row;gap:5px;min-width:0;height:40px;padding:0 13px;border-radius:20px;font-size:12px;background:rgba(0,0,0,.22);border:2px solid transparent}.tsub .tab.vis{display:flex}' +
    '.tsub .tab svg{width:17px;height:17px}.tsub .tab .sl{font:700 10px var(--sans);color:#f2c94c;margin-left:2px}.tsub .tab.on .sl{color:#8a5a00}' +
    '.tsub .tab.on{background:var(--paper);color:var(--moss3);border-color:#17331f}.tab.lk{opacity:.82}');

  // star levels used by a category's items (cached): lowest = what opens the category, next = the next unlock
  function stars(c) {
    if (c.tool || c.id === 'hatch') return [0];
    if (minStar[c.id]) return minStar[c.id];
    var u = {}; try { c.items().forEach(function (it) { if (!it.locked) u[it.star || 0] = 1; }); } catch (e) { u[0] = 1; }
    return (minStar[c.id] = Object.keys(u).map(Number).sort(function (a, b) { return a - b; }));
  }
  function groupFirst(g) { var m = 99; g.cats.forEach(function (id) { var c = UI.byId(UI.CATS, id); if (c) m = Math.min(m, stars(c)[0]); }); return m === 99 ? 0 : m; }
  function lockTag(el, st, us, label) {
    var s = el.querySelector('.sl'), all = st[0] > us, next = all ? st[0] : st.filter(function (x) { return x > us; })[0];
    if (next) {
      if (!s) { s = h('span.sl'); el.appendChild(s); }
      s.textContent = (all ? '\u2605' : '+\u2605') + next; el.classList.toggle('lk', all);
      el.title = all ? 'Unlocks at ' + next + ' stars' : 'More items unlock at ' + next + ' stars';
      el.setAttribute('aria-label', label + (all ? ': unlocks at ' + next + ' stars' : ': more unlock at ' + next + ' stars'));
    } else { if (s) s.remove(); el.classList.remove('lk'); el.removeAttribute('title'); el.removeAttribute('aria-label'); }
  }

  UI.buildGroups = function (CATS) {
    var el = UI.el; el.tabs.innerHTML = ''; minStar = {};
    grpEl = h('div.tgrps'); subEl = h('div.tsub'); el.tabs.appendChild(grpEl); el.tabs.appendChild(subEl);
    GROUPS.forEach(function (g) {
      var cats = g.cats.filter(function (id) { return UI.byId(CATS, id); }); g.live = cats; if (!cats.length) return;
      var single = cats.length === 1;
      var b = h('button.tab.gtab', { html: ic(g.icon) + '<span>' + g.name + '</span>', 'data-grp': g.id, on: { click: function () { UI.snd('click'); onGroup(g); } } });
      if (single) b.setAttribute('data-cat', cats[0]);
      grpEl.appendChild(b);
      if (!single) cats.forEach(function (id) {
        var c = UI.byId(CATS, id);
        subEl.appendChild(h('button.tab', { html: ic(c.icon) + '<span>' + c.name + '</span>', 'data-cat': id, 'data-g': g.id, on: { click: function () { UI.snd('click'); UI.openCat(id); } } }));
      });
    });
    UI.groupMark();
  };
  function onGroup(g) {
    var cur = UI.groupOf(UI.cat);
    if (g.live.length === 1) { UI.openCat(g.live[0]); return; }
    if (cur === g) { UI.openCat(UI.cat); return; }              // tapping the open group closes it
    UI.openCat(last[g.id] && g.live.indexOf(last[g.id]) >= 0 ? last[g.id] : g.live[0], true);
  }
  UI.groupMark = function () {
    if (!grpEl) return;
    var g = UI.cat ? UI.groupOf(UI.cat) : null, us = Z.state ? Z.state.unlocked.star : 0;
    if (g && g.live && g.live.length > 1) last[g.id] = UI.cat;
    Array.prototype.forEach.call(grpEl.children, function (b) { b.classList.toggle('on', !!g && b.getAttribute('data-grp') === g.id); });
    var multi = !!g && g.live.length > 1;
    subEl.classList.toggle('on', multi);
    Array.prototype.forEach.call(subEl.children, function (b) {
      var vis = multi && b.getAttribute('data-g') === g.id; b.classList.toggle('vis', vis);
      b.classList.toggle('on', b.getAttribute('data-cat') === UI.cat);
      if (vis) { var c = UI.byId(UI.CATS, b.getAttribute('data-cat')); if (c) lockTag(b, stars(c), us, c.name); }
    });
    if (multi) { var on = subEl.querySelector('.on'); if (on && on.scrollIntoView) { var l = on.offsetLeft - 12; if (l < subEl.scrollLeft || l + on.offsetWidth > subEl.scrollLeft + subEl.clientWidth - 12) subEl.scrollLeft = Math.max(0, l - 24); } }
    if (us !== lastUS) { lastUS = us; Array.prototype.forEach.call(grpEl.children, function (b) { var gg = GROUPS.filter(function (x) { return x.id === b.getAttribute('data-grp'); })[0]; if (gg && gg.live) lockTag(b, [groupFirst(gg)], us, gg.name); }); }
  };
  Z.bus.on('reset', function () { lastUS = -1; minStar = {}; last = {}; });
  setInterval(function () { if (Z.state && Z.state.unlocked && Z.state.unlocked.star !== lastUS && grpEl) UI.groupMark(); }, 1000);
})();
