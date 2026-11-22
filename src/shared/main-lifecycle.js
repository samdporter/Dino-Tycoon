// ===== main-lifecycle.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Shared save-file lifecycle and adaptive graphics policy for both tycoons. */
(function () {
  'use strict';
  Z.createSaveLifecycle = function (o) {
    var Main = o.Main, UI = o.UI;
    function hasSave() { return !!o.get(o.saveKey); }
    function exportSave() {
      var raw = Main.playing ? Z.Sim.save() : o.get(o.saveKey);
      if (!raw) { UI.toast('No park to export yet.', 'info'); return; }
      var url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      var a = document.createElement('a'); a.href = url; a.download = o.filePrefix + '-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }
    function importSave(raw) {
      var previous = Z.Sim.save(), parsed;
      try {
        parsed = JSON.parse(raw);
        if (!parsed || o.acceptedVersions.indexOf(parsed.v) < 0 || !parsed.s || !Array.isArray(parsed.s.animals) || !Array.isArray(parsed.s.guests) || !Array.isArray(parsed.s.staff)) throw new Error('Invalid save');
        if (!Z.Sim.load(raw)) throw new Error('Unsupported save');
      } catch (e) {
        Z.Sim.load(previous); UI.toast('Invalid or unsupported save. Your park was kept.', 'bad'); return Promise.resolve(false);
      }
      o.afterImportLoad();
      return o.afterImportSave();
    }
    function chooseImport() {
      if ((Main.playing || Main.hasSave()) && !window.confirm('Import a park and replace the current save? Export a backup first if you want to keep it.')) return;
      var input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
      input.onchange = function () {
        var file = input.files[0]; if (!file) return;
        if (file.size > 20 * 1024 * 1024) { UI.toast('Save file is too large (maximum 20 MB).', 'bad'); return; }
        var reader = new FileReader(); reader.onload = function () { Main.importSave(reader.result); };
        reader.onerror = function () { UI.toast('Could not read this file.', 'bad'); }; reader.readAsText(file);
      };
      input.click();
    }
    function loadCandidate() {
      var saved = o.get(o.saveKey), candidates = o.getCandidates ? o.getCandidates(o.saveKey, saved) : (saved ? [saved] : []);
      var previous = Z.Sim.save(), loaded = -1;
      if (!candidates || !candidates.length) candidates = saved ? [saved] : [];
      for (var i = 0; i < candidates.length; i++) {
        try { if (candidates[i] && Z.Sim.load(candidates[i])) { loaded = i; break; } } catch (e) { }
        try { Z.Sim.load(previous); } catch (e) { }
      }
      return loaded;
    }
    return { hasSave: hasSave, exportSave: exportSave, importSave: importSave, chooseImport: chooseImport, loadCandidate: loadCandidate };
  };

  Z.createGraphicsQuality = function (settings, UI, saveSettings) {
    var ema = 0.016, slowT = 0, prCap = 2, budget = 3200, qOpts = { detail: 1.5, shadows: true, impostors: false, farScale: 1.15 };
    var QUAL = {
      low: { pr: 1.0, budget: 600, detail: 1.0, shadows: false, impostors: true, farScale: 0.85 },
      med: { pr: 1.5, budget: 1800, detail: 1.25, shadows: true, impostors: false, farScale: 1.0 },
      high: { pr: 2.0, budget: 3600, detail: 1.5, shadows: true, impostors: false, farScale: 1.25 },
      ultra: { pr: 2.5, budget: 8000, detail: 1.8, shadows: true, impostors: false, farScale: 1.6 }
    };
    var labels = { auto: 'Auto', low: 'Low', med: 'Medium', high: 'High', ultra: 'Ultra' };
    function apply() {
      if (Z.World.setQuality) Z.World.setQuality(prCap, budget, qOpts);
      else if (Z.World.resize) Z.World.resize();
      if (UI.updateGfxBadge) UI.updateGfxBadge();
    }
    function setQuality(q, preserveToggles) {
      if (!QUAL[q] && q !== 'auto') q = 'auto';
      settings.quality = q; ema = 0.016; slowT = 0;
      if (q === 'auto') {
        var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        var touch = UI.touch ? UI.touch() : false;
        prCap = Math.min(dpr, touch ? 1.5 : 2);
        budget = touch ? 1800 : 3200;
        if (!preserveToggles) { settings.shadows = true; settings.impostors = false; }
        qOpts = { detail: touch ? 1.25 : 1.5, shadows: settings.shadows !== false, impostors: !!settings.impostors, farScale: 1.15 };
      } else {
        var p = QUAL[q]; prCap = p.pr; budget = p.budget;
        if (!preserveToggles) { settings.shadows = p.shadows; settings.impostors = p.impostors; }
        qOpts = { detail: p.detail, shadows: settings.shadows !== false, impostors: !!settings.impostors, farScale: p.farScale };
      }
      saveSettings(); apply();
    }
    function getSettings() { return { quality: settings.quality, shadows: settings.shadows !== false, impostors: !!settings.impostors, detail: qOpts.detail, farScale: qOpts.farScale, budget: budget, prCap: prCap }; }
    function setSetting(key, val) {
      if (key === 'shadows') { settings.shadows = !!val; qOpts.shadows = settings.shadows; }
      else if (key === 'impostors') { settings.impostors = !!val; qOpts.impostors = settings.impostors; }
      else return;
      saveSettings(); apply();
    }
    function frame(raw) {
      ema += (Math.min(raw, 0.25) - ema) * 0.05;
      if (settings.quality !== 'auto' || !Z.World.setQuality) return;
      if (ema > 0.042) {
        slowT += raw;
        if (slowT > 2.5) {
          slowT = 0;
          if (prCap > 0.85 || budget > 1200) {
            prCap = Math.max(0.85, prCap * 0.85); budget = Math.max(1200, budget - 200);
            qOpts.impostors = !!settings.impostors; apply(); ema = 0.03;
          }
        }
      } else slowT = Math.max(0, slowT - raw * 0.5);
    }
    return { setQuality: setQuality, getQuality: function () { return settings.quality; }, isQuality: function (q) { return !!QUAL[q]; }, labels: labels, getSettings: getSettings, setSetting: setSetting, apply: apply, frame: frame };
  };
})();
