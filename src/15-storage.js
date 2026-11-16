/* Browser persistence. Cache is session-only; success requires a completed disk write.
 * Keep the original v2 key/payload so hosted legacy games migrate automatically. */
window.Z = window.Z || {};
(function () {
  'use strict';
  var Z = window.Z;
  var cache = {}, candidates = {}, db = null, ready = null;
  var keys = ['amberacres.save.v2', 'amberacres.settings.v1'];
  var lastStatus = 'No save written this session';
  function localRead(key) {
    try { return { value: localStorage.getItem(key), updatedAt: +(localStorage.getItem(key + '.time') || 0) }; }
    catch (_) { return { value: null, updatedAt: 0 }; }
  }
  function localWrite(key, record) {
    try {
      localStorage.setItem(key, record.value);
      localStorage.setItem(key + '.time', String(record.updatedAt));
      return true;
    } catch (_) { return false; }
  }
  function open() {
    return new Promise(function (resolve) {
      var done = false, timer = setTimeout(function () { finish(null); }, 2000);
      function finish(value) { if (!done) { done = true; clearTimeout(timer); resolve(value); } else if (value) value.close(); }
      try {
        var req = indexedDB.open('amberacres', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('saves'); };
        req.onsuccess = function () { finish(req.result); };
        req.onerror = req.onblocked = function () { finish(null); };
      } catch (_) { finish(null); }
    });
  }
  function transaction(mode, action) {
    return new Promise(function (resolve) {
      if (!db) { resolve(null); return; }
      var tx, result = null, done = false;
      var timer = setTimeout(function () { try { tx.abort(); } catch (_) {} finish(null); }, 2000);
      function finish(value) { if (!done) { done = true; clearTimeout(timer); resolve(value); } }
      try {
        tx = db.transaction('saves', mode);
        var req = action(tx.objectStore('saves'));
        req.onsuccess = function () { result = req.result; };
        tx.oncomplete = function () { finish(mode === 'readwrite' ? true : result); };
        tx.onerror = tx.onabort = function () { finish(null); };
      } catch (_) { finish(null); }
    });
  }
  Z.Storage = {
    init: function () {
      if (ready) return ready;
      keys.forEach(function (key) { cache[key] = localRead(key); candidates[key] = cache[key].value ? [cache[key].value] : []; });
      ready = open().then(function (value) {
        db = value;
        if (db) db.onversionchange = function () { db.close(); db = null; };
        return Promise.all(keys.map(function (key) {
          return transaction('readonly', function (store) { return store.get(key); }).then(function (record) {
            var found = [cache[key]];
            if (record && record.value) found.push(record);
            found.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
            candidates[key] = [];
            found.forEach(function (item) {
              if (item.value && candidates[key].indexOf(item.value) === -1) candidates[key].push(item.value);
            });
            if (record && record.value && (!cache[key].value || record.updatedAt > cache[key].updatedAt)) cache[key] = record;
          });
        }));
      });
      return ready;
    },
    get: function (key) { return cache[key] ? cache[key].value : null; },
    getCandidates: function (key) { return candidates[key] ? candidates[key].slice() : (cache[key] && cache[key].value ? [cache[key].value] : []); },
    set: function (key, value) {
      // Synchronous localStorage write is deliberate: pagehide cannot await IndexedDB.
      var record = { value: value, updatedAt: Math.max(Date.now(), (cache[key] && cache[key].updatedAt || 0) + 1) };
      cache[key] = record;
      candidates[key] = [value];
      var localOK = localWrite(key, record);
      return transaction('readwrite', function (store) { return store.put(record, key); }).then(function (idbOK) {
        var ok = localOK || idbOK === true;
        lastStatus = ok ? 'Saved on this device at ' + new Date(record.updatedAt).toLocaleTimeString() : 'Save failed: export a backup before closing';
        return ok;
      });
    },
    status: function () { return lastStatus; },
    requestPersistence: function () {
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (_) {}
    }
  };
})();
