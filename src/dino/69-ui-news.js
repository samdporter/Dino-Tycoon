// ===== 69-ui-news.js =====
// News package, UI: breaking-news strip, the News tab (front page, effects, meters, press responses) and the "News effects" box on the
// Overview and Finances screens. All behaviour lives in Z.News (27-sim-news.js).  Hooks used: UI.extraTabs (53-screens), Screens.open wrap.
(function () {
  'use strict';
  var UI = Z.UI = Z.UI || {}, D = Z.DATA, h = UI.h, fmt = UI.fmt, ic = UI.ic;
  var css = '#newsflash{position:relative;transform:translateY(-14px);z-index:25;width:100%;max-width:560px;display:flex;align-items:stretch;border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .3s,transform .3s;background:#fbf6e6;color:#241c10;cursor:pointer}' +
    '#newsflash.on{opacity:1;transform:none;pointer-events:auto}#newsflash .nft{background:#c2402f;color:#fff;font:800 11px var(--sans);letter-spacing:.08em;padding:0 9px;display:flex;align-items:center;text-align:center}#newsflash.good .nft{background:#3f8650}#newsflash.info .nft{background:#35607f}' +
    '#newsflash .nfb{padding:7px 10px;min-width:0}#newsflash .nfb b{display:block;font:700 14px/1.2 Georgia,"Times New Roman",serif}#newsflash .nfb small{display:block;font-size:11px;color:#6b5d44;margin-top:2px}' +
    '@media(max-width:820px){#newsflash .nfb b{font-size:13px}}' +
    '.npaper{background:#fbf6e6;color:#241c10;border-radius:6px;padding:12px 14px;margin:8px 0;border:1px solid #d9cfb3;box-shadow:0 2px 6px rgba(0,0,0,.12)}.npaper .mast{display:flex;justify-content:space-between;align-items:baseline;gap:8px;border-bottom:2px solid #241c10;padding-bottom:4px;margin-bottom:8px;font:italic 700 16px Georgia,"Times New Roman",serif}' +
    '.npaper .mast small{font:600 11px var(--sans);font-style:normal;color:#6b5d44;white-space:nowrap}.npaper h3{margin:0 0 4px;font:800 22px/1.15 Georgia,"Times New Roman",serif}.npaper.small h3{font-size:16px}.npaper p{margin:4px 0 6px;font:14px/1.4 Georgia,serif;color:#3d3220}' +
    '.npaper .nfx{display:flex;flex-direction:column;gap:2px;margin-top:6px;font:12.5px var(--sans)}.npaper .nfx span.g{color:#2d7a47}.npaper .nfx span.b{color:#b5382b}.npaper .nresp{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.npaper .nresp button{min-height:44px;text-align:left;padding:6px 8px;line-height:1.2}.npaper .nresp small{display:block;font-size:10.5px;font-weight:500;opacity:.8}' +
    '.nmeter{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12.5px}.nmeter span{width:92px;flex:none}.nmeter .nb{flex:1;height:10px;border-radius:5px;background:rgba(0,0,0,.14);overflow:hidden}.nmeter .nb i{display:block;height:100%}' +
    '.nfxbox{margin:8px 0;padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.08)}.nfxbox h4{margin:0 0 6px;font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}.nfxbox .r{display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:12.5px}.nfxbox .r.g b{color:#2d7a47}.nfxbox .r.b b{color:#b5382b}.nfxbox small{color:var(--ink2);white-space:nowrap}';
  var sty = document.createElement('style'); sty.setAttribute('data-news', '1'); sty.textContent = css; document.head.appendChild(sty);

  function S() { return Z.state; }
  function dayTxt(st) { return 'Day ' + st.day; }

  // ------------------------------------------------------------------ breaking strip
  var flash = null, ftimer = 0, queue = [], showing = false;
  function showFlash(st) {
    if (UI.modalOpen && UI.modalOpen()) return;
    if (!flash) { flash = h('div#newsflash', { on: { click: function () { flash.classList.remove('on'); UI.openModal('news'); } } }); (UI.el && UI.el.stack ? UI.el.stack.insertBefore(flash, UI.el.stack.firstChild) : document.body.appendChild(flash)); }   // in the HUD stack so it never covers the goal card or toasts
    if (UI.el && UI.el.stack && flash.parentNode !== UI.el.stack) UI.el.stack.insertBefore(flash, UI.el.stack.firstChild);
    var tag = st.sev >= 3 && st.mood !== 'good' ? 'BREAKING' : st.mood === 'good' ? 'GOOD NEWS' : 'NEWS';
    flash.className = st.mood === 'good' ? 'good' : st.sev >= 3 ? '' : 'info';
    flash.innerHTML = ''; flash.appendChild(h('div.nft', { text: tag })); flash.appendChild(h('div.nfb', h('b', { text: st.headline }), h('small', { text: st.outlet })));
    void flash.offsetWidth; flash.classList.add('on'); showing = true;
    clearTimeout(ftimer); ftimer = setTimeout(function () { flash.classList.remove('on'); showing = false; setTimeout(next, 450); }, 6500);
  }
  function next() { if (!showing && queue.length) showFlash(queue.shift()); }
  Z.bus.on('news', function (e) {
    if (!e || !e.story || e.updated) return; var st = e.story;
    if (st.sev < 2 && st.mood !== 'bad') return;
    if (queue.length > 3) queue.shift(); queue.push(st); next();
    if (st.sev >= 3) UI.snd(st.mood === 'good' ? 'good' : 'bad');
    var dot = document.getElementById('menudot'); if (dot && !UI.modalOpen()) dot.style.display = '';
  });
  Z.bus.on('reset', function () { queue.length = 0; if (flash) flash.classList.remove('on'); });

  // ------------------------------------------------------------------ effects list
  function effectsBox(title) {
    var N = Z.News, box = h('div.nfxbox'), key = '';
    function upd() {
      var sm = N.summary(), k = JSON.stringify(sm.effects.map(function (e) { return [e.id, Math.round(e.daysLeft)]; }));
      if (k === key) return; key = k; box.innerHTML = ''; box.appendChild(h('h4', { text: title || 'News effects' }));
      if (!sm.effects.length) { box.appendChild(h('div', { style: 'font-size:12.5px;color:var(--ink2)', text: 'Nothing in the headlines is moving your numbers.' })); return; }
      var seen = {};
      sm.effects.slice().sort(function (a, b) { return a.daysLeft - b.daysLeft; }).forEach(function (e) {
        var t = e.text; if (seen[t]) return; seen[t] = 1;
        box.appendChild(h('div.r.' + (e.good ? 'g' : 'b'), h('b', { text: t }), h('small', { text: Math.max(1, Math.round(e.daysLeft)) + (Math.round(e.daysLeft) <= 1 ? ' day left' : ' days left') })));
      });
    }
    upd(); box.update = upd; return box;
  }
  var xtra = [];
  function wrapScreens() {
    var Sc = UI.Screens; if (!Sc || Sc._newsWrapped) return !!(Sc && Sc._newsWrapped); Sc._newsWrapped = true;
    var open = Sc.open;
    Sc.open = function (t) {
      var r = open.apply(this, arguments);
      if (flash) flash.classList.remove('on');
      if ((t === 'ov' || t === 'fin') && Z.News && UI.el && UI.el.mbody) { var b = effectsBox(); UI.el.mbody.appendChild(b); xtra.push(b); }
      return r;
    };
    return true;
  }
  setInterval(function () { if (flash && UI.modalOpen && UI.modalOpen()) flash.classList.remove('on'); wrapScreens(); xtra = xtra.filter(function (b) { return b.isConnected; }); if (xtra.length && Z.News) xtra.forEach(function (b) { b.update(); }); }, 1000);
  wrapScreens();

  // ------------------------------------------------------------------ News tab
  function meter(label, v, col, txt) {
    return h('div.nmeter', h('span', { text: label }), h('div.nb', h('i', { style: 'width:' + Math.round(UI.clamp(v, 0, 1) * 100) + '%;background:' + col })), h('b', { text: txt }));
  }
  function paper(st, big) {
    var N = Z.News, p = h('div.npaper' + (big ? '' : '.small'));
    p.appendChild(h('div.mast', h('span', { text: st.outlet }), h('small', { text: dayTxt(st) + (st.mood === 'good' ? '  ·  Good news' : st.mood === 'bad' ? '  ·  Bad news' : '') })));
    p.appendChild(h('h3', { text: st.headline })); if (st.sub) p.appendChild(h('p', { text: st.sub }));
    if (st.fx && st.fx.length) { var fx = h('div.nfx'); st.fx.forEach(function (t) { fx.appendChild(h('span.' + (/ up |\bup\b|raised|earned|boost|grant|donation|sponsor|award/i.test(t) && !/premium|demands|claims/i.test(t) ? 'g' : /down|due|premium|demand|claims|protest|fine|closed/i.test(t) ? 'b' : ''), { text: t })); }); p.appendChild(fx); }
    if (big && st.resp) p.appendChild(h('div', { style: 'font:12px var(--sans);margin-top:6px;color:#6b5d44', text: 'You responded: ' + ({ apology: 'apology and refunds', pr: 'PR campaign', press: 'press tour', ignore: 'said nothing' }[st.resp.choice] || st.resp.choice) }));
    if (big) {
      var opts = N.options(st.id);
      if (st.open && !st.resp && opts.length) {
        var g = h('div.nresp');
        opts.forEach(function (o) { g.appendChild(h('button.btn.sm' + (o.id === 'ignore' ? '.alt' : ''), { disabled: !o.ok, title: o.why || o.desc, html: '<b>' + o.label + '</b><small>' + (o.cost ? fmt(o.cost) : 'Free') + (o.ok ? '' : ' · ' + o.why) + '</small>', on: { click: function () { var r = N.respond(st.id, o.id); UI.toast(r.msg || '', r.ok ? 'good' : 'bad'); UI.snd(r.ok ? 'click' : 'bad'); refresh(); } } })); });
        p.appendChild(h('div', { style: 'font:700 12px var(--sans);margin-top:8px', text: 'How will you respond?' })); p.appendChild(g);
        opts.forEach(function (o) { });
        p.appendChild(h('div', { style: 'font:11.5px var(--sans);color:#6b5d44;margin-top:4px', text: opts.map(function (o) { return o.label + ': ' + o.desc; }).join('  ') }));
      }
    }
    return p;
  }
  var refresh = function () { };
  function tab(b) {
    var N = Z.News, wrap = h('div'), sig = ''; b.appendChild(wrap);
    function upd() {
      var sm = N.summary(), feed = N.feed(), k = JSON.stringify([feed.length && feed[0].id, feed.length && feed[0].resp, sm.effects.map(function (e) { return e.id + ':' + Math.round(e.daysLeft); }), Math.round(sm.heat), Math.round(sm.acclaim), S().money > 3000 ? 1 : 0]);
      if (k === sig) return; sig = k; wrap.innerHTML = '';
      var top = h('div.nfxbox'); top.appendChild(h('h4', { text: 'Media mood' }));
      top.appendChild(meter('Media heat', sm.heat / 100, sm.heat > 80 ? '#c2402f' : sm.heat > 45 ? '#e0a416' : '#3f9a5a', Math.round(sm.heat) + '%'));
      top.appendChild(meter('Acclaim', sm.acclaim / 100, '#3f8fb5', Math.round(sm.acclaim) + '%'));
      var hint = sm.closed ? 'The authorities have closed the park.' : sm.heat > 80 ? 'Dangerously hot. The authorities may step in.' : sm.heat > 45 ? 'Journalists are circling.' : sm.acclaim > 55 ? 'The press love you.' : 'A quiet life in the headlines.';
      top.appendChild(h('div', { style: 'font-size:12.5px;color:var(--ink2);margin-top:4px', text: hint }));
      wrap.appendChild(top);
      if (!feed.length) { wrap.appendChild(h('div.fact', { text: 'No stories yet. The papers are waiting for something to happen at the park.' })); }
      else { wrap.appendChild(paper(feed[0], true)); }
      wrap.appendChild(effectsBox('Active news effects'));
      if (feed.length > 1) { wrap.appendChild(h('div', { style: 'font:700 12px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--ink2);margin:10px 2px 0', text: 'Earlier editions' })); feed.slice(1, 14).forEach(function (st) { wrap.appendChild(paper(st, false)); }); }
    }
    refresh = function () { sig = ''; upd(); }; UI.unreadNews = 0;
    upd(); return upd;
  }
  UI.extraTabs = (UI.extraTabs || []).concat([{ id: 'news', name: 'News', icon: 'paper', build: tab, before: 'msg' }]);
})();
