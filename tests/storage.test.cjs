// Unit tests exercise backend failures. Real IndexedDB is covered by test_browser.py.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript } = require('./game-scripts.cjs');
const source = readScript('15-storage.js');
const SAVE = 'amberacres.save.v2';
function storage(options = {}) {
  const local = options.local || new Map(), records = options.records || new Map();
  const localStorage = {
    getItem(k) { if (options.denyLocal) throw Error('SecurityError'); return local.get(k) ?? null; },
    setItem(k, v) { if (options.denyLocal) throw Error('QuotaExceededError'); local.set(k, v); }
  };
  const indexedDB = { open() {
    if (options.denyIDB) throw Error('SecurityError');
    const request = {};
    setTimeout(() => {
      request.result = {
        close() {},
        transaction() {
          const tx = { abort() { tx.onabort?.(); }, objectStore() { return {
            get(key) { const req = {}; setTimeout(() => { req.result = records.get(key); req.onsuccess?.(); tx.oncomplete?.(); }, 0); return req; },
            put(record, key) { const req = {}; setTimeout(() => {
              if (options.failCommit) { tx.onabort?.(); return; }
              records.set(key, record); req.onsuccess?.(); tx.oncomplete?.();
            }, 0); return req; }
          }; } };
          return tx;
        }
      };
      request.onsuccess?.();
    }, 0);
    return request;
  } };
  const window = {};
  const ctx = vm.createContext({ window, localStorage, indexedDB, navigator: {}, setTimeout, clearTimeout, console });
  vm.runInContext(readScript('dino-config.js'), ctx);
  vm.runInContext(source, ctx);
  return { api: window.Z.Storage, local, records };
}
test('legacy localStorage raw save is readable after startup', async () => {
  const s = storage({ local: new Map([[SAVE, '{"v":2}']]) });
  await s.api.init(); assert.equal(s.api.get(SAVE), '{"v":2}');
});
test('newest IndexedDB snapshot wins over stale localStorage', async () => {
  const s = storage({ local: new Map([[SAVE,'old'], [SAVE+'.time','10']]), records: new Map([[SAVE,{value:'new',updatedAt:11}]]) });
  await s.api.init(); assert.equal(s.api.get(SAVE), 'new');
  assert.deepEqual(Array.from(s.api.getCandidates(SAVE)), ['new', 'old']);
});
test('newer localStorage snapshot leads recovery candidates over IndexedDB', async () => {
  const s = storage({ local: new Map([[SAVE,'new local'], [SAVE+'.time','12']]), records: new Map([[SAVE,{value:'old idb',updatedAt:11}]]) });
  await s.api.init(); assert.equal(s.api.get(SAVE), 'new local');
  assert.deepEqual(Array.from(s.api.getCandidates(SAVE)), ['new local', 'old idb']);
});
test('startup candidates are newest first and deduplicated when backends match', async () => {
  const s = storage({ local: new Map([[SAVE,'same'], [SAVE+'.time','11']]), records: new Map([[SAVE,{value:'same',updatedAt:11}]]) });
  await s.api.init(); assert.deepEqual(Array.from(s.api.getCandidates(SAVE)), ['same']);
});
test('new writes replace recovery candidates so old parks cannot return', async () => {
  const s = storage({ local: new Map([[SAVE,'old'], [SAVE+'.time','10']]), records: new Map([[SAVE,{value:'new',updatedAt:11}]]) });
  await s.api.init(); await s.api.set(SAVE, 'latest');
  assert.deepEqual(Array.from(s.api.getCandidates(SAVE)), ['latest']);
});
test('synchronous local checkpoint precedes promise completion; reload restores it', async () => {
  const s = storage({ denyIDB: true }); await s.api.init();
  const pending = s.api.set(SAVE, 'park'); assert.equal(s.local.get(SAVE), 'park');
  assert.equal(await pending, true);
  const next = storage({local:s.local,denyIDB:true}); await next.api.init(); assert.equal(next.api.get(SAVE), 'park');
});
test('IndexedDB-only save succeeds after commit and survives fresh startup', async () => {
  const s = storage({denyLocal:true}); await s.api.init();
  assert.equal(await s.api.set(SAVE, 'idb park'), true);
  const next = storage({denyLocal:true,records:s.records}); await next.api.init(); assert.equal(next.api.get(SAVE),'idb park');
});
test('both backends denied returns failure despite having a session cache', async () => {
  const s = storage({denyLocal:true,denyIDB:true}); await s.api.init();
  assert.equal(await s.api.set(SAVE,'temporary'),false); assert.match(s.api.status(),/Save failed/);
  const next = storage({denyLocal:true,denyIDB:true}); await next.api.init(); assert.equal(next.api.get(SAVE),null);
});
test('aborted IDB write must not be reported as saved', async () => {
  const s = storage({denyLocal:true,failCommit:true}); await s.api.init();
  assert.equal(await s.api.set(SAVE,'lost'),false); assert.equal(s.records.has(SAVE),false);
});
test('rapid writes receive strictly increasing timestamps', async () => {
  const s = storage(); await s.api.init();
  await s.api.set(SAVE,'one'); const first = s.records.get(SAVE).updatedAt;
  await s.api.set(SAVE,'two'); assert.ok(s.records.get(SAVE).updatedAt>first);
});
