// mf rainbow/waterstyle: el clon del material del fluido NO debe serializar
// el userData del original. copy() de three hace JSON.parse(JSON.stringify(
// userData)) y el fluido guarda ahí texturas vivas del juego → lluvia de
// "THREE.Texture: Unable to serialize Texture" por cada clon (y CPU tirada).
// el guard vacía el userData solo durante el clon y lo restaura por identidad.
// run: node tests/rainbow-waterstyle-clone.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC_RB = fs.readFileSync(path.join(ROOT, 'src', 'Render', 'MF_Rainbow.js'), 'utf8');
const SRC_WS = fs.readFileSync(path.join(ROOT, 'src', 'Shaders', 'MF_WaterStyle.js'), 'utf8');

// ── fakes three ─────────────────────────────────────────────────────────

class FakePhongMaterial {
  constructor() {
    this.userData = {};
    this.color = { setRGB() {} };
    this.emissive = { setRGB() {} };
    this.map = null;
  }
  // replica el copy() real del build de three del juego (r16x): userData
  // viaja por JSON.parse(JSON.stringify(...)) — ahí viven los warns
  clone() {
    const m = new FakePhongMaterial();
    m.userData = JSON.parse(JSON.stringify(this.userData));
    return m;
  }
}

class FakeAttr {
  constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; }
}

class FakeGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; }
  setIndex(attr) { this.index = attr; }
  computeBoundingSphere() { this.boundingSphere = {}; }
}

class FakeFluidMesh {
  constructor(geo, mat) { this.geometry = geo; this.material = mat; }
}

class FakeScene {
  constructor() { this.children = []; }
  add(o) { o.parent = this; this.children.push(o); }
  remove(o) {
    const i = this.children.indexOf(o);
    if (i >= 0) this.children.splice(i, 1);
    if (o.parent === this) o.parent = null;
  }
  traverse(cb) { for (const c of this.children.slice()) cb(c); }
}

// "textura viva" del juego puesta en el userData del fluido: si copy() la
// serializa, su toJSON se entera
function makeTexViva(calls) {
  return {
    isTexture: true,
    image: { width: 4, height: 4 }, // ni Image ni con .data → no serializa
    toJSON() { calls.push('toJSON'); return {}; }
  };
}

function makeCtx(fluidMat, scene) {
  const reactRoot = {
    '__reactContainer$test': {
      updateQueue: { baseState: { element: { props: { game: {
        player: { pos: { x: 0, y: 64, z: 0 } },
        gameScene: { scene }
      } } } } }
    }
  };
  const ctx = {
    document: {
      getElementById: (id) => (id === 'react' ? reactRoot : null),
      addEventListener() {}
    },
    localStorage: {
      _m: {},
      getItem(k) { return this._m[k] ?? null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; }
    },
    console: { info() {}, warn() {}, error() {}, log() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    JSON, Math, Object, Array, Number, parseFloat,
    Float32Array, Uint32Array
  };
  ctx.window = ctx; // el módulo mezcla window.X y globales pelados
  vm.createContext(ctx);
  return ctx;
}

test('control del fake: JSON.stringify SÍ llama toJSON en la textura viva', () => {
  const calls = [];
  JSON.parse(JSON.stringify({ t: makeTexViva(calls) }));
  assert.equal(calls.length, 1, 'el instrumento debe ser sensible al walk de JSON');
});

test('rainbow: clon del fluido sin serializar userData y original restaurado', () => {
  const calls = [];
  const originalUD = {
    waterShadersEnabled: true,
    sunDirection: { x: 0, y: 1, z: 0 },
    uSunLight: { value: 1 },
    texViva: makeTexViva(calls)
  };
  const fluidMat = new FakePhongMaterial();
  fluidMat.userData = originalUD;
  const geo = new FakeGeometry();
  geo.attributes.position = new FakeAttr(new Float32Array(3), 3);
  const scene = new FakeScene();
  scene.add(new FakeFluidMesh(geo, fluidMat));

  const ctx = makeCtx(fluidMat, scene);
  vm.runInContext(SRC_RB, ctx, { filename: 'MF_Rainbow.js' });
  ctx.MF_Rainbow.enable();

  assert.equal(calls.length, 0, 'copy() no debe recorrer el userData del fluido');
  assert.equal(fluidMat.userData, originalUD, 'el original se restaura por identidad');
  assert.equal(originalUD.sunDirection.x, 0, 'los datos vivos del sol quedan intactos');
  assert.equal(originalUD.texViva.isTexture, true);

  const mesh = scene.children.find((o) => o.material?.__mfSkipHook);
  assert.ok(mesh, 'el arco se construyó igual');
  assert.equal(Object.keys(mesh.material.userData).length, 0, 'el clon queda sin marcador de fluido');

  ctx.MF_Rainbow.disable();
  assert.equal(ctx.MF_Rainbow.status().mesh, false, 'disable desmonta el arco');
  assert.equal(fluidMat.userData, originalUD, 'el original sigue intacto tras disable');
});

test('guard presente y en orden en ambos módulos (rainbow + waterstyle)', () => {
  for (const [name, src] of [['MF_Rainbow', SRC_RB], ['MF_WaterStyle', SRC_WS]]) {
    const save = src.indexOf('const ud = fluidMat.userData;');
    const wipe = src.indexOf('fluidMat.userData = {};');
    const clone = src.indexOf('fluidMat.clone()');
    const restore = src.indexOf('fluidMat.userData = ud;');
    assert.ok(save !== -1 && wipe !== -1 && restore !== -1, name + ': guard incompleto');
    assert.ok(save < clone && clone < restore, name + ': orden guardar → clonar → restaurar');
  }
});
