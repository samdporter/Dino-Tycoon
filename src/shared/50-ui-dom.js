// ===== 05-ui-dom.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Shared DOM construction helpers used by Dino and Zoo UI modules. */
(function () {
  'use strict';

  function $(s, r) { return (r || document).querySelector(s); }
  function h(sel, a) {
    var m = /^([a-z0-9]*)((?:[.#][\w-]+)*)/i.exec(sel), el = document.createElement(m[1] || 'div'), k, i;
    (m[2].match(/[.#][\w-]+/g) || []).forEach(function (t) { if (t[0] === '#') el.id = t.slice(1); else el.classList.add(t.slice(1)); });
    var kids = Array.prototype.slice.call(arguments, 1);
    if (a && a.constructor === Object) {
      kids.shift();
      for (k in a) {
        if (k === 'html') el.innerHTML = a[k]; else if (k === 'text') el.textContent = a[k];
        else if (k === 'on') { for (var ev in a.on) el.addEventListener(ev, a.on[ev]); }
        else if (k === 'style') el.style.cssText = a[k];
        else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]);
      }
    }
    (function add(list) {
      for (i = 0; i < list.length; i++) {
        var c = list[i]; if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c); else el.appendChild(c.nodeType ? c : document.createTextNode(c));
      }
    })(kids);
    return el;
  }
  Z.sharedUI = { h: h, $: $ };
})();
