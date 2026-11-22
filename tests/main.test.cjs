// Lifecycle integration without a renderer; actual DOM interaction is in Playwright.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');
function main() {
  const saved = new Map(), notices = []; let candidateValues = null;
  function node() { return { appendChild() {}, classList: { add() {}, remove() {} }, style: {}, innerHTML: '' }; }
  const ctx = vm.createContext({ console, setTimeout, clearTimeout,
    btoa: s => Buffer.from(s,'binary').toString('base64'), atob: s => Buffer.from(s,'base64').toString('binary'),
    document: {readyState:'loading',addEventListener(){},getElementById:node}, location:{protocol:'http:'} });
  vm.runInContext('var window=globalThis',ctx);
  const load = f => vm.runInContext(readScript(f),ctx);
  const simFiles = simulationScripts();
  simFiles.forEach(load);
  const z=ctx.Z;
  z.Storage={get:k=>saved.get(k)||null,getCandidates:k=>candidateValues || [saved.get(k)||null],set:(k,v)=>{saved.set(k,v);candidateValues=null;return Promise.resolve(true)},requestPersistence(){}};
  z.UI={h:node,ic:()=>'',snd(){},toast:message=>notices.push(message),reset(){},closeModal(){},narrow:()=>false,
    Tutorial:{restart(){}},el:{cards:node()}};
  z.World={cam:{target:{x:0,z:0}},resize(){}};
  load('90-main.js'); z.Main.showTitle();
  return {z,saved,notices,setCandidates(values){candidateValues=values}};
}
test('new park is checkpointed immediately and save returns an awaited boolean', async () => {
  const {z,saved}=main(); z.Main.newGame({seed:17});
  assert.equal(z.Main.playing,true);
  assert.ok(saved.has('amberacres.save.v2'));
  assert.equal(await z.Main.save(),true);
  assert.equal(JSON.parse(saved.get('amberacres.save.v2')).s.money,z.state.money);
  z.Storage.set=()=>Promise.resolve(false); assert.equal(await z.Main.save(),false);
});
test('invalid imported save preserves current park and stored data', async () => {
  const {z,saved}=main();z.Main.newGame({seed:17});z.state.money=32123;await z.Main.save();
  const original=saved.get('amberacres.save.v2');
  assert.equal(await z.Main.importSave('{bad JSON'),false);
  assert.equal(z.state.money,32123);assert.equal(saved.get('amberacres.save.v2'),original);
  // Valid outer fields but broken internals can fail after Sim.load assigns state.
  const broken=JSON.parse(original);broken.s.stats=null;broken.s.research=null;
  assert.equal(await z.Main.importSave(JSON.stringify(broken)),false);
  assert.equal(z.state.money,32123);assert.equal(saved.get('amberacres.save.v2'),original);
});
test('valid backup loads and checkpoints; corrupt Continue does not overwrite it', async () => {
  const {z,saved,setCandidates}=main();z.Main.newGame({seed:17});
  const raw=JSON.parse(z.Sim.save());raw.s.money=65432;
  assert.equal(await z.Main.importSave(JSON.stringify(raw)),true);
  assert.equal(JSON.parse(saved.get('amberacres.save.v2')).s.money,65432);
  z.Main.showTitle();saved.set('amberacres.save.v2','corrupt');setCandidates(['corrupt']);z.Main.continueGame();
  assert.equal(z.Main.playing,false);assert.equal(z.state.money,65432);
  assert.equal(saved.get('amberacres.save.v2'),'corrupt');
});
test('Continue falls back to an older valid backend candidate when the newest is corrupt', () => {
  const {z,saved,notices,setCandidates}=main(); z.Main.newGame({seed:17});
  z.state.money=76543; const valid=z.Sim.save(); saved.set('amberacres.save.v2','corrupt newest');
  setCandidates(['corrupt newest',valid]); z.Main.showTitle(); z.Main.continueGame();
  assert.equal(z.Main.playing,true); assert.equal(z.state.money,76543);
  assert.match(notices.at(-1),/older saved park/i);
});
test('Continue keeps the newest candidate when it is valid', () => {
  const {z,setCandidates}=main(); z.Main.newGame({seed:17});
  const older=JSON.parse(z.Sim.save()); older.s.money=45678;
  z.state.money=87654; const newest=z.Sim.save(); setCandidates([newest,JSON.stringify(older)]);
  z.Main.showTitle(); z.Main.continueGame();
  assert.equal(z.Main.playing,true); assert.equal(z.state.money,87654);
});
test('Continue rolls back a partially applied corrupt candidate before trying the older save', () => {
  const {z,saved,notices,setCandidates}=main(); z.Main.newGame({seed:17});
  z.state.money=76543; const valid=z.Sim.save(), malformed=JSON.parse(valid); malformed.s.money=999; malformed.s.guests=null;
  saved.set('amberacres.save.v2',JSON.stringify(malformed)); setCandidates([JSON.stringify(malformed),valid]); z.Main.showTitle(); z.Main.continueGame();
  assert.equal(z.Main.playing,true); assert.equal(z.state.money,76543);
  assert.match(notices.at(-1),/older saved park/i);
});
test('Continue preserves park and stored data when all backend candidates are corrupt', () => {
  const {z,saved,setCandidates}=main(); z.Main.newGame({seed:17});
  z.state.money=76543; const before={money:z.state.money,animals:z.state.animals.length,staff:z.state.staff.length};
  const malformed=JSON.parse(z.Sim.save()); malformed.s.money=999; malformed.s.guests=null;
  saved.set('amberacres.save.v2',JSON.stringify(malformed)); setCandidates([JSON.stringify(malformed),'also corrupt']); z.Main.showTitle(); z.Main.continueGame();
  assert.equal(z.Main.playing,false); assert.equal(z.state.money,76543);
  assert.equal(saved.get('amberacres.save.v2'),JSON.stringify(malformed));
  assert.deepEqual({money:z.state.money,animals:z.state.animals.length,staff:z.state.staff.length},before);
});
