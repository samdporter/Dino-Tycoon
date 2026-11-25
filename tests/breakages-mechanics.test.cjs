const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');

const root = path.join(__dirname, '..');

function loadSim(zoo = false) {
  const ctx = vm.createContext({
    console,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Map,
    Set,
    Uint8Array,
    Int8Array,
    Uint16Array,
    Int16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    setTimeout,
    clearTimeout,
  });
  ctx.window = ctx;
  ctx.globalThis = ctx;
  for (const file of simulationScripts(zoo, true)) {
    vm.runInContext(readScript(file, zoo), ctx, { filename: file });
  }
  return ctx.Z;
}

function buildBoxEnclosure(Z, i0, j0, w, h, fenceId) {
  const fid = fenceId || Z.DATA.fences[0].id;
  for (let j = j0 - 1; j <= j0 + h; j++) {
    for (let i = i0 - 1; i <= i0 + w; i++) {
      Z.Sim.paintTerrain(i, j, 'grass');
      Z.Sim.bulldoze(i, j);
    }
  }
  for (let i = i0; i < i0 + w; i++) {
    Z.Sim.placeFence({ axis: 'x', i, j: j0 }, fid);
    Z.Sim.placeFence({ axis: 'x', i, j: j0 + h }, fid);
  }
  for (let j = j0; j < j0 + h; j++) {
    Z.Sim.placeFence({ axis: 'z', i: i0, j }, fid);
    Z.Sim.placeFence({ axis: 'z', i: i0 + w, j }, fid);
  }
  return Z.Sim.enclosureAt(i0 + 1, j0 + 1);
}

test('Dino Tycoon: fence breach records specific perimeter panel, persists save/load, and can be fixed via Call Fence Crew without hired rangers', () => {
  const Z = loadSim(false);
  Z.Sim.newGame({ seed: 42, difficulty: 'easy' });
  Z.state.money = 20000;
  const enc = buildBoxEnclosure(Z, 30, 30, 6, 6);
  assert.ok(enc, 'enclosure should exist');

  let breachEvent = null;
  let fixedEvent = null;
  Z.bus.on('fenceBreach', ev => { breachEvent = ev; });
  Z.bus.on('fenceFixed', ev => { fixedEvent = ev; });

  const edge = Z.Sim.breachEnclosure(enc.id);
  assert.ok(edge && (edge.axis === 'x' || edge.axis === 'z'), 'breachEdge should be a valid axis edge');
  assert.equal(enc.breach, 1);
  assert.deepEqual(enc.breachEdge, edge);
  assert.ok(breachEvent && breachEvent.encId === enc.id && breachEvent.edge, 'fenceBreach event should fire with edge');

  // Verify the edge actually has a fence on the enclosure perimeter
  const v = edge.axis === 'x'
    ? Z.state.fenceX[edge.i + edge.j * Z.N]
    : Z.state.fenceZ[edge.i + edge.j * (Z.N + 1)];
  assert.ok(v > 0, 'breachEdge should point to an actual placed fence panel');

  // Verify enclosureReport exposes breach details and issue text
  const rep = Z.Sim.enclosureReport(enc.id);
  assert.equal(rep.breach, 1);
  assert.deepEqual(rep.breachEdge, edge);
  assert.equal(rep.breachCrew, false);
  assert.equal(rep.fenceCrewFee, Z.Sim.FENCE_CREW_FEE);
  assert.ok(rep.issues.some(t => /broken/i.test(t)), 'report issues should mention broken fence panel');

  // Verify save/load preserves breachEdge, AND legacy save without breachEdge auto-assigns one
  const saved = Z.Sim.save();
  assert.equal(Z.Sim.load(saved), true);
  const loadedEnc = Z.state.enclosures.find(e => e.id === enc.id);
  assert.equal(loadedEnc.breach, 1);
  assert.equal(loadedEnc.breachEdge.axis, edge.axis);
  assert.equal(loadedEnc.breachEdge.i, edge.i);
  assert.equal(loadedEnc.breachEdge.j, edge.j);

  const legacyObj = JSON.parse(saved);
  legacyObj.s.enclosures.find(e => e.id === enc.id).breachEdge = null;
  assert.equal(Z.Sim.load(JSON.stringify(legacyObj)), true);
  const legacyEnc = Z.state.enclosures.find(e => e.id === enc.id);
  assert.equal(legacyEnc.breach, 1);
  assert.ok(legacyEnc.breachEdge && (legacyEnc.breachEdge.axis === 'x' || legacyEnc.breachEdge.axis === 'z'),
    'legacy save with breach=1 should auto-populate a valid breachEdge');

  // Call Fence Crew with zero hired rangers
  assert.equal(Z.state.staff.filter(s => s.type === 'keeper').length, 0);
  const moneyBefore = Z.state.money;
  const res = Z.Sim.callFenceCrew(enc.id);
  assert.equal(res.ok, true);
  assert.equal(Z.state.money, moneyBefore - Z.Sim.FENCE_CREW_FEE);
  assert.equal(legacyEnc.breachCrew, true);

  // Duplicate call rejected
  const dup = Z.Sim.callFenceCrew(enc.id);
  assert.equal(dup.ok, false);

  // Step simulation ~5 seconds -> emergency crew repairs breach
  for (let i = 0; i < 60; i++) Z.Sim._step(0.1);
  assert.equal(legacyEnc.breach, 0);
  assert.equal(legacyEnc.breachEdge, null);
  assert.equal(legacyEnc.breachCrew, false);
  assert.ok(fixedEvent && fixedEvent.encId === enc.id, 'fenceFixed event should fire after crew repair');
});

test('Zoo Tycoon: fence breach records specific perimeter panel, Call Fence Crew repairs without keepers, and power cut supports Call Electrician', () => {
  const Z = loadSim(true);
  Z.Sim.newGame({ seed: 42, difficulty: 'easy' });
  Z.state.money = 20000;
  const enc = buildBoxEnclosure(Z, 26, 26, 5, 5);
  assert.ok(enc, 'zoo enclosure should exist');

  let breachEvent = null;
  let fixedEvent = null;
  Z.bus.on('fenceBreach', ev => { breachEvent = ev; });
  Z.bus.on('fenceFixed', ev => { fixedEvent = ev; });

  const edge = Z.Sim.breachEnclosure(enc.id);
  assert.ok(edge && (edge.axis === 'x' || edge.axis === 'z'));
  assert.equal(enc.breach, 1);
  assert.ok(breachEvent && breachEvent.encId === enc.id);

  const rep = Z.Sim.enclosureReport(enc.id);
  assert.equal(rep.breach, 1);
  assert.deepEqual(rep.breachEdge, edge);
  assert.equal(rep.fenceCrewFee, Z.Sim.FENCE_CREW_FEE);
  assert.ok(rep.issues.some(t => /broken/i.test(t)));

  // Call Fence Crew with zero keepers
  assert.equal(Z.state.staff.length, 0);
  const moneyBefore = Z.state.money;
  const res = Z.Sim.callFenceCrew(enc.id);
  assert.equal(res.ok, true);
  assert.equal(Z.state.money, moneyBefore - Z.Sim.FENCE_CREW_FEE);

  for (let i = 0; i < 60; i++) Z.Sim._step(0.1);
  assert.equal(enc.breach, 0);
  assert.equal(enc.breachEdge, null);
  assert.ok(fixedEvent && fixedEvent.encId === enc.id);

  // Zoo power cut + Call Electrician
  assert.equal(Z.Sim.powerCutActive(), false);
  Z.Sim.triggerEvent('power_cut');
  assert.equal(Z.Sim.powerCutActive(), true);

  const m2 = Z.state.money;
  const pRes = Z.Sim.callPowerCrew();
  assert.equal(pRes.ok, true);
  assert.equal(Z.state.money, m2 - Z.Sim.POWER_CREW_FEE);
  assert.equal(Z.Sim.callPowerCrew().ok, false, 'duplicate power crew call rejected');

  for (let i = 0; i < 60; i++) Z.Sim._step(0.1);
  assert.equal(Z.Sim.powerCutActive(), false, 'power cut should be cleared after emergency electrician finishes');
});

test('Dino Tycoon: Power outages, broken generators, downed substations, and sealed labs support one-off emergency callouts', () => {
  const Z = loadSim(false);
  Z.Sim.newGame({ seed: 77, difficulty: 'easy' });
  Z.state.money = 50000;
  Z.state.rating = 5;

  // Place a diesel generator and substation on clear grass tiles
  let gRes = { ok: false }, sRes = { ok: false };
  for (let j = 20; j < Z.N - 12 && !gRes.ok; j++) {
    for (let i = 20; i < Z.N - 12 && !gRes.ok; i++) {
      gRes = Z.Sim.placeObject('diesel_gen', i, j, 0);
    }
  }
  assert.equal(gRes.ok, true, 'diesel_gen placed: ' + (gRes.msg || ''));
  for (let j = 20; j < Z.N - 12 && !sRes.ok; j++) {
    for (let i = 20; i < Z.N - 12 && !sRes.ok; i++) {
      sRes = Z.Sim.placeObject('substation', i, j, 0);
    }
  }
  assert.equal(sRes.ok, true, 'substation placed: ' + (sRes.msg || ''));

  const genObj = Z.state.objects.find(o => o.type === 'diesel_gen');
  const subObj = Z.state.objects.find(o => o.type === 'substation');
  assert.ok(genObj && subObj);

  // 1. Break generator -> Call Mechanic
  let genBrokenEv = null;
  Z.bus.on('powerGenBroken', ev => { genBrokenEv = ev; });
  Z.Power.breakGenerator(genObj.id, 6);
  assert.ok(genBrokenEv && genBrokenEv.id === genObj.id);
  assert.equal(Z.Power.objectInfo(genObj.id).state, 'broken');

  const mGen = Z.state.money;
  const callG = Z.Power.callRepairGen(genObj.id);
  assert.equal(callG.ok, true);
  assert.equal(Z.state.money, mGen - Z.Power.CREW_FEES.gen);
  assert.equal(Z.Power.objectInfo(genObj.id).crew, true);
  for (let i = 0; i < 70; i++) Z.Sim._step(0.1);
  assert.notEqual(Z.Power.objectInfo(genObj.id).state, 'broken', 'generator should be repaired by emergency mechanic');

  // 2. Knock out substation -> Call Electrician
  let nodeDownEv = null;
  Z.bus.on('powerNodeDown', ev => { nodeDownEv = ev; });
  Z.Power.nodeDown(subObj.id, 5, 'storm');
  assert.ok(nodeDownEv && nodeDownEv.id === subObj.id);
  assert.equal(Z.Power.objectInfo(subObj.id).alive, false);

  const mNode = Z.state.money;
  const callN = Z.Power.callRepairNode(subObj.id);
  assert.equal(callN.ok, true);
  assert.equal(Z.state.money, mNode - Z.Power.CREW_FEES.node);
  assert.equal(Z.Power.objectInfo(subObj.id).crew, true);
  for (let i = 0; i < 70; i++) Z.Sim._step(0.1);
  assert.equal(Z.Power.objectInfo(subObj.id).alive, true, 'substation should be online after emergency electrician');

  // 3. Park-wide power cut -> Call Line Crew
  Z.Power.cut('storm', 6, 'cable');
  assert.equal(Z.Power.outageActive(), true);
  const mCut = Z.state.money;
  const callC = Z.Power.callRepairCut();
  assert.equal(callC.ok, true);
  assert.equal(Z.state.money, mCut - Z.Power.CREW_FEES.cut);
  assert.equal(Z.Power.status().outage.crew, true);
  for (let i = 0; i < 75; i++) Z.Sim._step(0.1);
  assert.equal(Z.Power.outageActive(), false, 'power cut should be cleared after emergency line crew');

  // 4. Sealed lab -> Call Decon Crew
  Z.state.research.labOffline = 12;
  const mLab = Z.state.money;
  const callL = Z.Sim.callLabDecon();
  assert.equal(callL.ok, true);
  assert.equal(Z.state.money, mLab - Z.Sim.LAB_DECON_FEE);
  assert.ok(Z.state.research.labOffline <= 0.25);
});

test('Dino Tycoon: Handyman repairs fences/power slowly while Electrician repairs power outages rapidly', () => {
  const Z = loadSim(false);
  Z.Sim.newGame({ seed: 101, difficulty: 'easy' });
  Z.state.money = 50000;
  Z.state.rating = 5;

  const handyDef = Z.DATA.staff.find(s => s.id === 'handyman');
  const elecDef = Z.DATA.staff.find(s => s.id === 'electrician');
  assert.ok(handyDef && elecDef, 'handyman and electrician should exist in Dino D.staff');
  assert.ok(handyDef.hireCost < elecDef.hireCost && handyDef.wage < elecDef.wage,
    'handyman should be cheaper to hire and pay than electrician');

  // Build enclosure next to the entrance path so staff can reach it
  const enc = buildBoxEnclosure(Z, 24, 34, 5, 5);
  assert.ok(enc, 'enclosure built');
  for (let i = 24; i <= 34; i++) Z.Sim.placePath(i, 39, 'paved');
  for (let j = 39; j < Z.N - 1; j++) Z.Sim.placePath(28, j, 'paved');

  // Hire a handyman and breach the fence
  const hRes = Z.Sim.hireStaff('handyman', 26, 39);
  assert.equal(hRes.ok, true, hRes.msg || 'handyman hired');
  Z.Sim.breachEnclosure(enc.id);
  assert.equal(enc.breach, 1);

  for (let i = 0; i < 300 && enc.breach > 0; i++) Z.Sim._step(0.1);
  assert.equal(enc.breach, 0, 'handyman should repair the breached fence');
  assert.equal(enc.breachEdge, null);

  // Fire handyman, hire an electrician, and test rapid repair of park-wide power cut
  const hStaff = Z.state.staff.find(s => s.type === 'handyman');
  Z.Sim.fireStaff(hStaff.id);
  const eRes = Z.Sim.hireStaff('electrician', 26, 39);
  assert.equal(eRes.ok, true, eRes.msg || 'electrician hired');

  Z.Power.cut('storm', 6, 'cable');
  assert.equal(Z.Power.outageActive(), true);
  for (let i = 0; i < 200 && Z.Power.outageActive(); i++) Z.Sim._step(0.1);
  assert.equal(Z.Power.outageActive(), false, 'electrician should restore park-wide power cut');
});

test('Zoo Tycoon: Handyman repairs fences & power cuts slowly while Electrician restores power cuts rapidly', () => {
  const Z = loadSim(true);
  Z.Sim.newGame({ seed: 101, difficulty: 'easy' });
  Z.state.money = 50000;
  Z.state.rating = 5;

  const handyDef = Z.DATA.staff.find(s => s.id === 'handyman');
  const elecDef = Z.DATA.staff.find(s => s.id === 'electrician');
  assert.ok(handyDef && elecDef, 'handyman and electrician should exist in Zoo D.staff');
  assert.ok(handyDef.hireCost < elecDef.hireCost && handyDef.wage < elecDef.wage,
    'handyman should be cheaper to hire and pay than electrician');

  // Build enclosure next to path
  const enc = buildBoxEnclosure(Z, 24, 34, 5, 5);
  assert.ok(enc, 'zoo enclosure built');
  for (let i = 24; i <= 34; i++) Z.Sim.placePath(i, 39, 'paved');
  for (let j = 39; j < Z.N - 1; j++) Z.Sim.placePath(28, j, 'paved');

  // Hire handyman -> repairs breached fence
  const hRes = Z.Sim.hireStaff('handyman', 26, 39);
  assert.equal(hRes.ok, true, hRes.msg || 'handyman hired');
  const liveEnc = Z.state.enclosures.find(e => e.id === enc.id);
  Z.Sim.breachEnclosure(liveEnc.id);
  assert.equal(liveEnc.breach, 1);

  for (let i = 0; i < 300 && liveEnc.breach > 0; i++) Z.Sim._step(0.1);
  assert.equal(liveEnc.breach, 0, 'zoo handyman should repair the breached fence');

  // Fire handyman, hire electrician -> restores zoo power cut rapidly
  const hStaff = Z.state.staff.find(s => s.type === 'handyman');
  Z.Sim.fireStaff(hStaff.id);
  const eRes = Z.Sim.hireStaff('electrician', 26, 39);
  assert.equal(eRes.ok, true, eRes.msg || 'electrician hired');

  Z.Sim.triggerEvent('power_cut');
  assert.equal(Z.Sim.powerCutActive(), true);
  for (let i = 0; i < 150 && Z.Sim.powerCutActive(); i++) Z.Sim._step(0.1);
  assert.equal(Z.Sim.powerCutActive(), false, 'zoo electrician should restore power cut rapidly');
});
