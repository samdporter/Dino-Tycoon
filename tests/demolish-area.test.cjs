// Coverage for bulldoze 'Area' mode (and multi-tile 'Things' deduplication) in Zoo Tycoon and Dino Tycoon.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readScript, simulationScripts } = require('./game-scripts.cjs');

function makeNode(tag) {
  const classSet = new Set();
  const node = {
    nodeType: 1,
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    children: [],
    attributes: {},
    listeners: {},
    style: {},
    _html: '',
    _text: '',
    classList: {
      add(...cls) { for (const c of cls) classSet.add(c); },
      remove(...cls) { for (const c of cls) classSet.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (classSet.has(c)) { classSet.delete(c); return false; }
          classSet.add(c); return true;
        }
        if (force) classSet.add(c); else classSet.delete(c);
        return !!force;
      },
      contains(c) { return classSet.has(c); }
    },
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v);
      if (v === '') this.children.length = 0;
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    appendChild(child) {
      if (child && child.nodeType === 1) this.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    click() {
      for (const fn of (this.listeners.click || [])) {
        fn({ type: 'click', target: this, preventDefault() {} });
      }
    }
  };
  return node;
}

function findButtons(root, out = []) {
  if (!root) return out;
  if (root.tagName === 'BUTTON') out.push(root);
  for (const child of (root.children || [])) findButtons(child, out);
  return out;
}

function setupGame(zoo) {
  const world = makeNode('div');
  const el = {
    strip: makeNode('div'),
    cost: makeNode('div'),
    bRotObj: makeNode('button'),
    bMove: makeNode('button'),
    cards: makeNode('div'),
    tabs: makeNode('div')
  };
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: {
      createElement: tag => makeNode(tag),
      createTextNode: text => ({ nodeType: 3, textContent: String(text) }),
      getElementById: id => id === 'world' ? world : null
    }
  });
  vm.runInContext('var window = globalThis;', ctx);
  ctx.window.innerHeight = 1000;
  ctx.window.addEventListener = () => {};

  for (const file of simulationScripts(zoo)) {
    vm.runInContext(readScript(file, zoo), ctx, { filename: file });
  }
  vm.runInContext(readScript('50-ui-dom.js', zoo), ctx, { filename: '50-ui-dom.js' });

  const z = ctx.Z;
  z.UI = {
    h: z.sharedUI.h,
    ic: () => '',
    fmt: v => '$' + v,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    narrow: () => false,
    snd() {},
    toast() {},
    markSelected() {},
    modalOpen: () => false,
    Panel: { isOpen: () => false, hide() {} },
    prefs: {},
    held: {},
    el
  };
  z.World = {
    setPreview() {},
    pickGround: () => null,
    zoom() {},
    pan() {},
    rotate() {}
  };

  for (const file of ['51-input.js', '51-tools.js']) {
    vm.runInContext(readScript(file, zoo), ctx, { filename: file });
  }
  z.UI.Tools.init();
  z.Sim.newGame({ seed: 42, money: 100000 });
  return z;
}

function clearFlatRect(z, i0, j0, i1, j1) {
  const S = z.state;
  const N = z.N;
  for (let j = j0; j <= j1 + 1; j++) {
    for (let i = i0; i <= i1 + 1; i++) {
      S.elev[i + j * (N + 1)] = 0;
    }
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const t = i + j * N;
      S.terrain[t] = 0;
      if (S.tileObj[t] || S.path[t] || (S.ditch && S.ditch[t])) z.Sim.bulldoze(i, j);
    }
  }
  for (let j = j0; j <= j1 + 1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (S.fenceX[i + j * N]) z.Sim.removeFence({ axis: 'x', i, j });
    }
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1 + 1; i++) {
      if (S.fenceZ[i + j * (N + 1)]) z.Sim.removeFence({ axis: 'z', i, j });
    }
  }
}

for (const zoo of [true, false]) {
  const gameName = zoo ? 'Zoo Tycoon' : 'Dino Tycoon';

  test(`${gameName}: bulldoze Area mode strips, refunds, demolishes, undoes, handles empty areas, and deduplicates multi-tile drags`, () => {
    const z = setupGame(zoo);
    const S = z.state;
    const N = z.N;
    const Tools = z.UI.Tools;

    // 1. Select bulldoze tool and click the 'Area' mode button in the tool strip
    Tools.start({ kind: 'bulldoze' });
    const areaBtn = findButtons(z.UI.el.strip).find(b => b.getAttribute('aria-label') === 'Area');
    assert.ok(areaBtn, 'Area mode button should be rendered in the tool strip');
    areaBtn.click();
    assert.equal(z.UI.tool.bmode, 'area');
    assert.equal(z.UI.prefs.bmode, 'area');

    // Prepare a clean 5x4 rectangle and a clean 3x3 empty rectangle inside the map bounds
    const i0 = S.map.i0 + 2;
    const j0 = S.map.j0 + 2;
    const i1 = i0 + 4;
    const j1 = j0 + 3;
    clearFlatRect(z, i0, j0, i1, j1);

    const ei0 = i1 + 3;
    const ej0 = j0;
    const ei1 = ei0 + 2;
    const ej1 = ej0 + 2;
    clearFlatRect(z, ei0, ej0, ei1, ej1);

    // 2. Place a 2x2 multi-tile building, a scenery item, 3 path tiles, and 3 fences
    const bldgId = zoo ? 'viewing_platform' : 'keeper_hut';
    const bldgDef = z.DATA.buildings.find(b => b.id === bldgId);
    const sceneryDef = z.DATA.scenery.find(s => s.id === 'flower_bed');
    const pathDef = z.DATA.paths.find(p => p.id === 'paved');
    const fenceDef = z.DATA.fences.find(f => f.id === 'post_rail');

    assert.equal(bldgDef.w, 2);
    assert.equal(bldgDef.h, 2);

    const bRes = z.Sim.placeObject(bldgId, i0, j0, 0);
    assert.equal(bRes.ok, true);
    const sRes = z.Sim.placeObject('flower_bed', i0 + 2, j0, 0);
    assert.equal(sRes.ok, true);

    const pathCoords = [
      { i: i0, j: j0 + 2 },
      { i: i0 + 1, j: j0 + 2 },
      { i: i0 + 2, j: j0 + 2 }
    ];
    for (const q of pathCoords) {
      assert.equal(z.Sim.placePath(q.i, q.j, 'paved').ok, true);
    }

    const fenceEdges = [
      { axis: 'x', i: i0 + 3, j: j0 + 1 },
      { axis: 'x', i: i0 + 4, j: j0 + 1 },
      { axis: 'z', i: i0 + 4, j: j0 + 2 }
    ];
    for (const e of fenceEdges) {
      assert.equal(z.Sim.placeFence(e, 'post_rail').ok, true);
    }

    const bldgRefund = Math.floor(bldgDef.cost * 0.5);
    const sceneryRefund = Math.floor(sceneryDef.cost * 0.5);
    const pathRefund = Math.floor(pathDef.cost * 0.5);
    const fenceRefund = Math.floor(fenceDef.cost * 0.5);
    const expectedRefund = bldgRefund + sceneryRefund + pathCoords.length * pathRefund + fenceEdges.length * fenceRefund;

    const plan = Tools.PLAN.bulldoze({ a: { i: i0, j: j0 }, b: { i: i1, j: j1 } });
    assert.equal(plan.ok, true);
    assert.equal(plan.spec.type, 'area');
    assert.equal(plan.spec.tiles.length, (i1 - i0 + 1) * (j1 - j0 + 1));
    assert.ok(plan.spec.edges.length > 0);
    assert.equal(plan.spec.edges.length, fenceEdges.length);
    assert.equal(plan.cost, -expectedRefund);

    const moneyBefore = S.money;
    const undoBefore = z.Sim.canUndo().count;
    const objectsBefore = S.objects.length;

    z.Sim.beginStroke('demolish area');
    const res = plan.run();
    z.Sim.endStroke();

    assert.equal(res.n, 1 + 1 + pathCoords.length + fenceEdges.length);
    assert.equal(res.cost, -expectedRefund);
    assert.equal(S.money, moneyBefore + expectedRefund);
    assert.equal(S.objects.length, objectsBefore - 2);
    assert.equal(z.Sim.canUndo().count, undoBefore + 1);

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const t = i + j * N;
        assert.equal(S.tileObj[t], 0);
        assert.equal(S.path[t], 0);
      }
    }
    for (const e of fenceEdges) {
      const val = e.axis === 'x' ? S.fenceX[e.i + e.j * N] : S.fenceZ[e.i + e.j * (N + 1)];
      assert.equal(val, 0);
    }

    const undoRes = z.Sim.undo();
    assert.equal(undoRes.ok, true);
    assert.equal(z.Sim.canUndo().count, undoBefore);
    assert.equal(S.money, moneyBefore);
    assert.equal(S.objects.length, objectsBefore);

    const restoredBldgId = S.tileObj[i0 + j0 * N];
    assert.ok(restoredBldgId > 0);
    assert.equal(S.tileObj[(i0 + 1) + j0 * N], restoredBldgId);
    assert.equal(S.tileObj[i0 + (j0 + 1) * N], restoredBldgId);
    assert.equal(S.tileObj[(i0 + 1) + (j0 + 1) * N], restoredBldgId);
    assert.ok(S.tileObj[(i0 + 2) + j0 * N] > 0);
    for (const q of pathCoords) {
      assert.ok(S.path[q.i + q.j * N] > 0);
    }
    for (const e of fenceEdges) {
      const val = e.axis === 'x' ? S.fenceX[e.i + e.j * N] : S.fenceZ[e.i + e.j * (N + 1)];
      assert.ok(val > 0);
    }

    // 3. Empty area returns ok: false and 'Nothing to remove here'
    const emptyPlan = Tools.PLAN.bulldoze({ a: { i: ei0, j: ej0 }, b: { i: ei1, j: ej1 } });
    assert.equal(emptyPlan.ok, false);
    assert.equal(emptyPlan.msg, 'Nothing to remove here');

    // 4. In 'things' mode, dragging pts across multiple tiles of the same multi-tile building does not double-count
    const thingsBtn = findButtons(z.UI.el.strip).find(b => b.getAttribute('aria-label') === 'Things');
    assert.ok(thingsBtn, 'Things mode button should be rendered in the tool strip');
    thingsBtn.click();
    assert.equal(z.UI.tool.bmode, 'things');
    assert.equal(z.UI.prefs.bmode, 'things');

    const thingsPlan = Tools.PLAN.bulldoze({
      a: { i: i0, j: j0 },
      pts: [
        { i: i0, j: j0 },
        { i: i0 + 1, j: j0 },
        { i: i0, j: j0 + 1 },
        { i: i0 + 1, j: j0 + 1 }
      ]
    });
    assert.equal(thingsPlan.ok, true);
    assert.equal(thingsPlan.n, 1);
    assert.equal(thingsPlan.cost, -bldgRefund);
    assert.equal(thingsPlan.spec.type, 'tiles');
    assert.equal(thingsPlan.spec.tiles.length, 4);
  });
}
