// ===== 53-standard-tabs.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Shared guest, goals and news tabs; the park/zoo wording stays configurable. */
(function () {
  'use strict';
  Z.createStandardTabs = function (UI, D, fmt, bar, h, ic) {
    function guests(place) {
      return function (b) {
        var top = h('div.box'), needs = h('div.box'), th = h('div.box'); b.appendChild(top); b.appendChild(needs); b.appendChild(th);
        function upd() {
          var S = Z.state, gs = S.guests, n = gs.length;
          function avg(f) { var s = 0; gs.forEach(function (g) { s += f(g); }); return n ? s / n : 0; }
          top.innerHTML = ''; top.appendChild(h('div', { style: 'display:flex;gap:16px;flex-wrap:wrap' }, h('div', h('div.big', { text: String(n) }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'in the ' + place + ' now' })), h('div', h('div.big', { text: n ? Math.round(avg(function (g) { return g.happiness; })) + '%' : '-' }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'average happiness' })), h('div', h('div.big', { text: S.stats.guestsTotal.toLocaleString('en-GB') }), h('div', { style: 'font-size:12px;color:var(--ink2)', text: 'visitors so far' }))));
          needs.innerHTML = ''; needs.appendChild(h('h4', { text: 'What guests are feeling' }));
          if (!n) { needs.appendChild(h('div.fact', { text: Z.Sim.isOpenNow() ? 'No guests right now. Animals, paths and a pleasant price draw them in.' : 'The ' + place + ' is closed. Gates open at 08:00.' })); }
          else [['Happiness', avg(function (g) { return g.happiness; }) / 100], ['Fed', 1 - avg(function (g) { return g.hunger; }) / 100], ['Hydrated', 1 - avg(function (g) { return g.thirst; }) / 100], ['Comfort', 1 - avg(function (g) { return g.bladder; }) / 100], ['Energy', avg(function (g) { return g.energy; }) / 100], ['Entertained', avg(function (g) { return g.fun || 0; }) / 100]].forEach(function (r) { needs.appendChild(h('div', { style: 'display:grid;grid-template-columns:90px 1fr 40px;gap:8px;align-items:center;font-size:12.5px' }, h('span', { style: 'font-weight:700;color:var(--ink2)', text: r[0] }), bar(r[1]), h('b.num', { style: 'text-align:right', text: Math.round(r[1] * 100) + '%' }))); });
          th.innerHTML = ''; th.appendChild(h('h4', { text: 'What they are saying' })); var cnt = {};
          gs.forEach(function (g) { if (g.thought) cnt[g.thought] = (cnt[g.thought] || 0) + 1; });
          var top6 = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; }).slice(0, 7);
          if (!top6.length) th.appendChild(h('div', { style: 'font-size:13px;color:var(--ink2)', text: 'Quiet at the moment.' }));
          top6.forEach(function (t) { th.appendChild(h('div.thought', h('span', { text: '“' + t + '”' }), h('b', { text: '×' + cnt[t] }))); });
        }
        upd(); return upd;
      };
    }
    function goals(b) {
      var wrap = h('div', { style: 'display:flex;flex-direction:column;gap:8px' }); b.appendChild(wrap);
      function upd() {
        var S = Z.state; wrap.innerHTML = ''; var done = 0;
        D.goals.forEach(function (g) {
          var isDone = !!S.goals[g.id]; if (isDone) done++; var p = UI.goalProgress(g);
          wrap.appendChild(h('div.goal' + (isDone ? '.done' : ''), h('div.gh', h('span', { html: (isDone ? ic('check') + ' ' : '') + g.text }), h('span', { text: isDone ? 'Done' : 'Reward ' + fmt(g.reward) })), isDone ? null : bar(p.frac), isDone ? null : h('div', { style: 'font-size:12px;color:var(--ink2)', text: p.text })));
        });
        wrap.insertBefore(h('div', { style: 'font:700 14px var(--serif)', text: done + ' of ' + D.goals.length + ' goals complete' }), wrap.firstChild);
      }
      upd(); return upd;
    }
    function messages(b) {
      var wrap = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }); b.appendChild(wrap);
      function upd() {
        var S = Z.state; wrap.innerHTML = ''; if (!S.messages.length) wrap.appendChild(h('div.fact', { text: 'No news yet.' }));
        S.messages.slice().reverse().forEach(function (m) { wrap.appendChild(h('div.msg.' + (m.kind || 'info'), h('small', { text: 'Day ' + m.day }), m.text)); });
      }
      upd(); return upd;
    }
    return { guests: guests, goals: goals, messages: messages };
  };
})();
