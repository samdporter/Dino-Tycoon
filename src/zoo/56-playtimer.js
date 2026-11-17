// ===== 56-playtimer.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Wild Acres Zoo - session play timer HUD chip + interactive Play Timer mini-app. */
(function () {
  'use strict';
  var UI = Z.UI, h = UI.h, ic = UI.ic;
  var REMINDERS = [0, 15, 30, 45, 60];
  var MAX_LAPS = 50;
  var el = {}, active = false, paused = false, elapsed = 0, startedAt = null;
  var reminderMin = 0, alertBaseSec = 0, nextAlertSec = 0, alertFired = false, alertDismissed = false;
  var laps = [], lapSeq = 0, hudOn = true, popOpen = false, lastSec = -1, lastPaused = null, lastSubKey = '';
  var resetArmed = false, resetTimer = 0;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function formatTime(sec, alwaysHours) {
    var s = Math.max(0, Math.floor(sec || 0));
    var hr = Math.floor(s / 3600), mn = Math.floor((s % 3600) / 60), sc = s % 60;
    if (alwaysHours) return pad2(hr) + ':' + pad2(mn) + ':' + pad2(sc);
    return hr > 0 ? hr + ':' + pad2(mn) + ':' + pad2(sc) : pad2(mn) + ':' + pad2(sc);
  }
  function formatShort(sec) { return formatTime(sec, false); }
  function formatLong(sec) { return formatTime(sec, true); }
  function formatClock(ms) {
    if (!ms) return '--:--';
    var d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function formatHuman(sec) {
    var m = Math.round(sec / 60);
    if (m >= 60 && m % 60 === 0) { var h1 = m / 60; return h1 === 1 ? '1 hour' : h1 + ' hours'; }
    return m === 1 ? '1 minute' : m + ' minutes';
  }
  function clearResetArm() {
    resetArmed = false;
    if (resetTimer) { clearTimeout(resetTimer); resetTimer = 0; }
    if (el.resetBtn) {
      el.resetBtn.innerHTML = ic('rot') + 'Reset';
      el.resetBtn.classList.remove('warn');
    }
  }

  function parkLabel() {
    var S = Z.state;
    if (!S) return 'Session active';
    var name = (S.map && S.map.name) ? S.map.name : 'Wild Acres Zoo';
    return name + ' · Day ' + (S.day || 1);
  }

  function syncReminderUI() {
    if (!el.pop) return;
    if (el.remBtns) {
      el.remBtns.forEach(function (b) {
        b.classList.toggle('on', +b.getAttribute('data-m') === reminderMin);
      });
    }
    var alertActive = alertFired && !alertDismissed && reminderMin > 0;
    if (el.banner) {
      el.banner.style.display = alertActive ? 'flex' : 'none';
      if (alertActive && el.bannerTxt) {
        el.bannerTxt.textContent = "You've been playing for " + formatShort(elapsed) + ' this session. Ready for a quick breather?';
      }
    }
    if (el.remProgWrap && el.remBar && el.remStatus) {
      if (!reminderMin || !nextAlertSec) {
        el.remStatus.textContent = 'Off';
        el.remProgWrap.style.display = 'none';
      } else {
        var span = Math.max(1, nextAlertSec - alertBaseSec);
        var done = Math.max(0, Math.min(1, (elapsed - alertBaseSec) / span));
        var left = Math.max(0, Math.ceil(nextAlertSec - elapsed));
        el.remProgWrap.style.display = '';
        el.remBar.style.width = Math.round(done * 100) + '%';
        el.remStatus.textContent = alertFired ? 'Time for a break' : formatShort(left) + ' left';
      }
    }
  }

  function renderLaps() {
    if (!el.lapsWrap || !el.lapsList) return;
    el.lapsWrap.style.display = laps.length ? 'flex' : 'none';
    el.lapsList.innerHTML = '';
    for (var i = laps.length - 1; i >= 0; i--) {
      var lp = laps[i];
      el.lapsList.appendChild(h('div.pt-lap',
        h('span.pt-lap-n', { text: '#' + lp.n }),
        h('span.pt-lap-d', { text: 'Day ' + lp.day }),
        h('span.pt-lap-delta.num', { text: '+' + formatShort(lp.delta) }),
        h('b.pt-lap-at.num', { text: formatShort(lp.at) })));
    }
  }

  function render(force) {
    var sec = Math.max(0, Math.floor(elapsed));
    if (!force && sec === lastSec) return;
    lastSec = sec;
    var shortStr = formatShort(sec);
    var alertDot = alertFired && !alertDismissed;

    if (el.chip) {
      el.val.textContent = shortStr;
      el.chip.classList.toggle('pt-paused', paused);
      el.chip.classList.toggle('pt-alert', alertDot);
      el.chip.setAttribute('aria-label', 'Play timer: ' + shortStr + (paused ? ', paused' : ''));
      if (el.dot) el.dot.style.display = alertDot ? '' : 'none';
    }
    if (el.pop && (force || popOpen)) {
      el.clockBig.textContent = formatLong(sec);
      var subKey = formatClock(startedAt) + '|' + parkLabel();
      if (force || subKey !== lastSubKey) {
        lastSubKey = subKey;
        el.sub.textContent = 'Session started at ' + formatClock(startedAt);
        el.parkMeta.textContent = parkLabel();
      }
      if (force || paused !== lastPaused) {
        lastPaused = paused;
        el.statusBadge.textContent = paused ? 'Paused' : 'Running';
        el.statusBadge.className = 'pt-status' + (paused ? ' paused' : '');
        el.pauseBtn.innerHTML = ic(paused ? 'play' : 'pause') + (paused ? 'Resume' : 'Pause');
        el.pauseBtn.className = 'btn sm ' + (paused ? 'gold' : '');
      }
      syncReminderUI();
    }
  }

  function place() {
    if (!el.pop) return;
    var w = Math.min(window.innerWidth - 12, 336);
    el.pop.style.width = w + 'px';
    if (el.chip && el.chip.offsetParent !== null) {
      var r = el.chip.getBoundingClientRect();
      el.pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6)) + 'px';
      el.pop.style.top = Math.min(r.bottom + 6, Math.max(6, window.innerHeight - 180)) + 'px';
    } else {
      el.pop.style.left = Math.max(6, Math.round((window.innerWidth - w) / 2)) + 'px';
      el.pop.style.top = '64px';
    }
  }

  function open(on) {
    if (!el.pop) { popOpen = false; return; }
    var next = !!on;
    popOpen = next;
    if (next) {
      if (UI.WeatherHud && UI.WeatherHud.close) UI.WeatherHud.close();
      render(true);
      renderLaps();
      place();
    } else {
      clearResetArm();
    }
    el.pop.classList.toggle('on', next);
    if (el.chip) {
      el.chip.classList.toggle('open', next);
      el.chip.setAttribute('aria-expanded', String(next));
    }
  }

  function applyHudVisibility() {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('pt-hud-off', !hudOn);
    }
    if (el.chip) el.chip.style.display = hudOn ? '' : 'none';
  }

  function buildPop() {
    el.statusBadge = h('span.pt-status', { text: 'Running' });
    var closeBtn = h('button.pt-x', {
      html: ic('close'),
      'aria-label': 'Close play timer',
      on: { click: function () { UI.snd('click'); open(false); } }
    });
    var head = h('div.pt-head',
      h('div.pt-title', h('span.pt-hic', { html: ic('timer') }), h('b', { text: 'Play Timer' }), el.statusBadge),
      closeBtn);

    el.clockBig = h('div.pt-clock.num', { text: '00:00:00' });
    el.sub = h('div.pt-sub', { text: 'Session started at --:--' });
    el.parkMeta = h('div.pt-meta', { text: '' });
    var hero = h('div.pt-hero', el.clockBig, el.sub, el.parkMeta);

    el.pauseBtn = h('button.btn.sm', {
      html: ic('pause') + 'Pause',
      on: { click: function () { UI.snd('click'); PT.togglePause(); } }
    });
    var markBtn = h('button.btn.sm.alt', {
      html: ic('flag') + 'Mark',
      title: 'Record a checkpoint in this session',
      on: { click: function () { UI.snd('click'); PT.mark(); } }
    });
    el.resetBtn = h('button.btn.sm.alt', {
      html: ic('rot') + 'Reset',
      on: {
        click: function () {
          UI.snd('click');
          if (elapsed < 5 || resetArmed) {
            clearResetArm();
            PT.reset();
            UI.toast('Play timer reset for this session.', 'info');
          } else {
            resetArmed = true;
            el.resetBtn.innerHTML = ic('rot') + 'Reset?';
            el.resetBtn.classList.add('warn');
            resetTimer = setTimeout(clearResetArm, 3000);
          }
        }
      }
    });
    var actions = h('div.btnrow.pt-actions', el.pauseBtn, markBtn, el.resetBtn);

    el.bannerTxt = h('p');
    var banner = el.banner = h('div.pt-banner', { style: 'display:none' },
      el.bannerTxt,
      h('div.btnrow',
        h('button.btn.sm.gold', { text: 'Snooze +15m', on: { click: function () { UI.snd('click'); PT.snooze(15); } } }),
        h('button.btn.sm.alt', { text: 'Dismiss', on: { click: function () { UI.snd('click'); PT.dismissAlert(); } } })));

    el.remStatus = h('span.pt-rem-st.num', { text: 'Off' });
    var seg = h('div.seg.pt-seg');
    el.remBtns = REMINDERS.map(function (m) {
      var btn = h('button' + (m === reminderMin ? '.on' : ''), {
        'data-m': String(m),
        text: m === 0 ? 'Off' : m + 'm',
        on: { click: function () { UI.snd('click'); PT.setReminder(m); } }
      });
      seg.appendChild(btn);
      return btn;
    });
    el.remBar = h('i', { style: 'width:0%' });
    el.remProgWrap = h('div.mini.pt-mini', { style: 'display:none' }, el.remBar);
    var rem = h('div.pt-rem',
      h('div.pt-rem-head', h('span', { text: 'Break reminder' }), el.remStatus),
      seg,
      el.remProgWrap);

    el.lapsList = h('div.pt-lap-list');
    el.lapsWrap = h('div.pt-laps', { style: 'display:none' },
      h('div.pt-laps-head',
        h('span', { text: 'Session checkpoints' }),
        h('button.pt-clear', { text: 'Clear', on: { click: function () { UI.snd('click'); PT.clearLaps(); } } })),
      el.lapsList);

    el.pop = h('div#timerpop.pill', { role: 'dialog', 'aria-label': 'Play timer' }, head, hero, banner, actions, rem, el.lapsWrap);
  }

  function init() {
    var speed = UI.el && UI.el.speed;
    if (!speed || !speed.parentNode || el.chip) return;
    el.val = h('span.pt-val.num', { text: '00:00' });
    el.dot = h('i.pt-dot', { style: 'display:none' });
    el.chip = h('button#timerchip.pill.hud-cell', {
      'aria-label': 'Play timer: 00:00',
      'aria-expanded': 'false',
      title: 'Session play timer',
      on: {
        click: function (e) {
          e.stopPropagation();
          UI.snd('click');
          open(!popOpen);
        }
      }
    }, h('span.pt-ic', { html: ic('timer') }), el.val, el.dot);
    speed.parentNode.insertBefore(el.chip, speed);

    buildPop();
    var root = UI.$('#ui');
    if (root) root.appendChild(el.pop);

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('pointerdown', function (e) {
        if (popOpen && el.pop && !el.pop.contains(e.target) && (!el.chip || !el.chip.contains(e.target))) {
          open(false);
        }
      }, true);
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', function () {
        if (popOpen) place();
      });
    }
    if (Z.bus && Z.bus.on) {
      Z.bus.on('newDay', function () {
        if (popOpen && el.parkMeta) el.parkMeta.textContent = parkLabel();
      });
    }
    applyHudVisibility();
    render(true);
  }

  function resetSessionState(nextActive, nextPaused) {
    active = nextActive;
    paused = nextPaused;
    elapsed = 0;
    startedAt = Date.now();
    laps = [];
    lapSeq = 0;
    alertFired = false;
    alertDismissed = false;
    alertBaseSec = 0;
    nextAlertSec = reminderMin > 0 ? reminderMin * 60 : 0;
    lastSec = -1;
    clearResetArm();
    renderLaps();
    render(true);
  }

  function scheduleReminderFrom(baseSec, targetSec) {
    alertFired = false;
    alertDismissed = false;
    alertBaseSec = baseSec;
    nextAlertSec = targetSec;
  }

  var PT = UI.PlayTimer = {
    init: init,
    startSession: function () { resetSessionState(true, false); },
    endSession: function () {
      active = false;
      paused = false;
      open(false);
    },
    tick: function (dt) {
      if (!active || paused) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!(dt > 0) || !isFinite(dt)) return;
      elapsed += dt;
      if (nextAlertSec > 0 && !alertFired && elapsed >= nextAlertSec) {
        alertFired = true;
        alertDismissed = false;
        if (UI.toast) UI.toast('Play timer: ' + formatHuman(nextAlertSec) + ' this session — take a quick breather if you need one!', 'info');
        UI.snd('good');
        render(true);
        return;
      }
      render(false);
    },
    pause: function () {
      if (!paused) { paused = true; render(true); }
    },
    resume: function () {
      if (paused) { paused = false; render(true); }
    },
    togglePause: function () {
      paused = !paused;
      render(true);
    },
    reset: function () { resetSessionState(active, paused); },
    mark: function () {
      var prev = laps.length ? laps[laps.length - 1].at : 0;
      lapSeq += 1;
      laps.push({
        n: lapSeq,
        at: elapsed,
        delta: Math.max(0, elapsed - prev),
        day: (Z.state && Z.state.day) ? Z.state.day : 1
      });
      if (laps.length > MAX_LAPS) laps.shift();
      renderLaps();
    },
    clearLaps: function () {
      laps = [];
      lapSeq = 0;
      renderLaps();
    },
    setReminder: function (minutes) {
      var m = REMINDERS.indexOf(minutes) >= 0 ? minutes : 0;
      reminderMin = m;
      if (m === 0) {
        scheduleReminderFrom(0, 0);
      } else {
        var cur = Math.floor(elapsed);
        var target = m * 60;
        if (cur < target) scheduleReminderFrom(0, target);
        else scheduleReminderFrom(cur, cur + target);
      }
      render(true);
    },
    snooze: function (minutes) {
      var m = (typeof minutes === 'number' && minutes > 0) ? minutes : 15;
      var cur = Math.floor(elapsed);
      scheduleReminderFrom(cur, cur + m * 60);
      render(true);
    },
    dismissAlert: function () {
      alertDismissed = true;
      render(true);
    },
    open: open,
    isOpen: function () { return popOpen; },
    setHudVisible: function (on, silent) {
      hudOn = !!on;
      applyHudVisibility();
      if (!hudOn && popOpen && !silent) open(false);
      if (!silent && Z.Main && Z.Main.setTimerHud) Z.Main.setTimerHud(hudOn);
    },
    hudVisible: function () { return hudOn; },
    elapsed: function () { return elapsed; },
    formatted: function () { return formatShort(elapsed); },
    formattedLong: function () { return formatLong(elapsed); },
    formatShort: formatShort,
    formatLong: formatLong,
    state: function () {
      return {
        active: active,
        paused: paused,
        elapsed: elapsed,
        startedAt: startedAt,
        reminderMin: reminderMin,
        nextAlertSec: nextAlertSec,
        alertFired: alertFired,
        alertDismissed: alertDismissed,
        hudVisible: hudOn,
        laps: laps.map(function (l) { return { n: l.n, at: l.at, delta: l.delta, day: l.day }; })
      };
    }
  };

  var oinit = UI.init;
  if (typeof oinit === 'function') {
    UI.init = function () { oinit.apply(this, arguments); init(); };
  }
})();
