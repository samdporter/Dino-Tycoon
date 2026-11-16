// ===== 76-ui-mobile.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Mobile / accessibility layer: HUD fit on phones (portrait 360-430 wide and short landscape 844x390), long numbers,
   the hide-interface button in the side column on narrow screens, reduced-motion preference.  CSS only plus tiny JS. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h;
  function css(t) { var st = document.createElement('style'); st.setAttribute('data-mobile', '1'); st.textContent = t; document.head.appendChild(st); }
  css(
    /* breaking news lives in the HUD stack now (69-ui-news): hidden unless showing */
    '#newsflash{display:none}#newsflash.on{display:flex;animation:nfin .3s}@keyframes nfin{from{opacity:0;transform:translateY(-10px)}}' +
    /* hide-interface button when parked in the side column */
    '#side .hbtn{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--moss3)}#side .hbtn svg{width:22px;height:22px}' +
    '#side .sidechip{width:44px!important;height:44px!important;max-width:44px;min-width:0!important;padding:0!important;border-radius:50%;justify-content:center;flex-direction:column;gap:1px!important}#side .sidechip .wxn,#side .sidechip .pwt{display:none}#side .sidechip .pwb{width:22px!important;height:5px!important}#side .sidechip .wxdot{position:absolute;top:2px;right:2px}' +
    '.hud-row.r2{flex-wrap:wrap;row-gap:5px}#speed button{min-width:36px;height:40px}#speed{height:40px}#clock,#wxchip,#pwchip{height:40px}' +
    /* tap targets: at least 40px for the tool strip and the puzzle read buttons */
    '#toolstrip .btn,#toolstrip .seg button{min-height:40px}.mg-ff-read{min-height:44px}' +
    '#cash.xl{font-size:14px;letter-spacing:-.2px}#gstat.xl{font-size:13px;padding:0 6px}' +
    '@media(max-width:819px){#clock{padding:0 7px;gap:4px;font-size:12px}#clock b{font-size:13px}#clock .open{font-size:9.5px;padding:2px 4px;letter-spacing:.2px}#wxchip,#pwchip{min-width:40px;padding:0 6px;justify-content:center}#wxchip .wxn{display:none}}' +
    /* short landscape phone (for example 844x390): single column HUD, two-column side buttons, one-line build bar */
    '@media(max-height:520px){' +
    '#hud{flex-direction:column;right:auto;max-width:calc(100% - 150px - var(--sal) - var(--sar))}#hud .hud-row{flex-wrap:wrap}' +
    '#stack{top:calc(100px + var(--sat));width:min(400px,calc(100% - 160px))}' +
    '#side{top:calc(6px + var(--sat));flex-wrap:wrap-reverse;max-height:calc(100vh - 175px - var(--sab));align-content:flex-start;gap:4px}#side .cbtn,#side .hbtn{width:42px;height:42px}' +
    '#tabs{display:flex;align-items:center;gap:8px;padding:2px 6px}.tgrps{flex:0 0 auto}.tgrps .tab{flex:0 0 auto;width:62px;height:44px}.tsub{flex:1 1 auto;padding:0;min-width:0}.tsub .tab{height:40px}' +
    '#undoBtn small,#undoBtn kbd{display:none}#undoBtn{min-height:40px;padding:4px 12px}' +
    '#cards{min-height:100px}.card{height:96px}' +
    '#tut{max-width:100%}#cash{flex:0 1 auto;max-width:none}#banner .bn:not(:last-child),#toasts .toast:not(:last-child){display:none}.bn{padding:6px 12px}.bn h3{font-size:15px}body:has(#toolstrip.on) #goalchip{display:none}' +
    '}' +
    '@media(max-width:380px){#cash.xl{font-size:12.5px}#gstat.xl{font-size:12px}}' +
    '@media(max-width:819px) and (max-height:760px){#side{gap:4px}#side .cbtn{width:40px;height:40px}#side .sidechip{width:40px!important;height:40px!important;max-width:40px}#side .hbtn{width:40px;height:40px}}' +
    /* tap targets: nothing a finger must hit is below 40 px (QA round 2) */
    '.btn.sm,.seg button,#goalchip,input[type=range]{min-height:40px}#speed button{width:40px;min-height:40px}#mtabs button{min-width:40px}.bn .row .btn.sm{min-height:40px;min-width:44px}.focbtn{position:relative}.focbtn::after{content:"";position:absolute;left:-6px;right:-6px;top:-10px;bottom:-10px}' +
    /* reduced motion: no pulsing highlights, banner pop, confetti handled in JS */
    '@media(prefers-reduced-motion:reduce){.tab.hl,.hl{animation:none;box-shadow:0 0 0 4px #f0b332}#tut.on,.bn,.toast,#newsflash.on{animation:none}*{scroll-behavior:auto!important}.pulse,#pwchip.pw-out,#lockbar,body.lockdown #ui::after,.mg-t.hint,.mg-t.sel,.mg-t.sp::before,#uwfx i,#newsflash,#newsflash *{animation:none!important;transition:none!important}}'
  );

  // HUD cash: abbreviate only when it would not fit on a phone (100 million and above); the Finances screen keeps the full figure
  UI.hudMoney = function (v) { var a = Math.abs(v); if (a < 1e8) return UI.fmt(v); return (v < 0 ? '-' : '') + '\u00a3' + (a / 1e6).toFixed(a >= 1e9 ? 0 : 1) + 'M'; };
  UI.reducedMotion = function () { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // narrow portrait phones: weather and power chips become round side buttons, the hide button joins them; short landscape keeps the chips in the HUD
  function place() {
    var el = UI.el; if (!el || !el.hide || !el.side) return;
    var narrow = window.innerWidth < 820 || window.innerHeight < 520, portrait = window.innerWidth < 820 && window.innerHeight >= 520;
    if (narrow && el.hide.parentNode !== el.side) { el.side.appendChild(el.hide); el.hide.classList.add('cbtn'); }
    else if (!narrow && el.hide.parentNode === el.side) { el.speed.parentNode.appendChild(el.hide); el.hide.classList.remove('cbtn'); }
    ['wxchip', 'pwchip'].forEach(function (id) {
      var c = document.getElementById(id); if (!c) return;
      if (portrait) { var wx = id === 'pwchip' && document.getElementById('wxchip'); if (wx && wx.parentNode === el.side) { if (wx.nextSibling !== c) el.side.insertBefore(c, wx.nextSibling); } else if (c.parentNode !== el.side) el.side.insertBefore(c, el.side.children[1] || null); c.classList.add('sidechip'); }
      else if (!portrait && (c.parentNode === el.side || c.classList.contains('sidechip'))) { var row = el.speed.parentNode, a = id === 'wxchip' ? el.clock : (document.getElementById('wxchip') || el.clock); row.insertBefore(c, a.nextSibling); c.classList.remove('sidechip'); }
    });
  }
  // an active build tool puts the toolstrip above the bottom bar: the side buttons must end above it (they wrap into a second column instead of sliding under it)
  function clearTool() {
    var el = UI.el, ts = document.getElementById('toolstrip'); if (!el || !el.side || !ts) return;
    if (!ts.classList.contains('on')) { if (el.side.style.maxHeight) el.side.style.maxHeight = ''; return; }
    var st = el.side.getBoundingClientRect().top, mh = Math.max(96, Math.floor(ts.getBoundingClientRect().top - st - 8)) + 'px';
    if (el.side.style.maxHeight !== mh) el.side.style.maxHeight = mh;
  }
  function fit() {
    var el = UI.el; if (!el || !el.cashTxt) return;
    el.cash.classList.toggle('xl', el.cashTxt.textContent.length >= 11);
    el.guests.classList.toggle('xl', el.guestsN.textContent.length >= 5);
  }
  // overlay cards (On/Off) must follow the real overlay state, whoever toggles it (card, panel button, tool start/cancel)
  ['RealmsWorld', 'MoatsWorld', 'MonoWorld', 'SafariWorld'].forEach(function (n) {
    var w = Z[n]; if (!w || !w.setOverlay || w._syncCards) return; w._syncCards = true;
    function isOn() { return typeof w.overlayOn === 'function' ? !!w.overlayOn() : !!w.overlayOn; }
    var o = w.setOverlay;
    w.setOverlay = function () { var was = isOn(), r = o.apply(this, arguments); if (isOn() !== was && UI.refreshCards) setTimeout(UI.refreshCards, 0); return r; };
  });
  var oinit = UI.init;
  UI.init = function () { oinit.apply(this, arguments); place(); window.addEventListener('resize', place); setInterval(function () { fit(); place(); clearTool(); }, 400); };
  // confetti: a handful of still squares would be pointless, so skip it entirely
  var conf = UI.confetti; UI.confetti = function () { if (UI.reducedMotion()) return; return conf.apply(this, arguments); };
})();
