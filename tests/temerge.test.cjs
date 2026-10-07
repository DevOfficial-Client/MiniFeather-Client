// mf temerge: el chunk-mesher del juego fusiona [opaco, ...muebles] exigiendo
// sets de atributos idénticos; el juego solo backfillea light/wave/emissive.
// este módulo alinea TODOS los 9 al crearse el mueble (recetas del propio
// setGeometry del juego) + reporta extras sin quitarlos.
// run: node tests/temerge.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'Render', 'MF_TileEntityMerge.js'), 'utf8');

// ── fakes ───────────────────────────────────────────────────────────────

class Attr {
  constructor(arr, itemSize, normalized = false) {
    this.array = arr; this.itemSize = itemSize; this.normalized = normalized;
  }
  get count() { return this.array.length / this.itemSize; }
}

class Geo {
  constructor() { this.attributes = {}; }
  setAttribute(name, a) { this.attributes[name] = a; }
  deleteAttribute(name) { delete this.attributes[name]; }
}

// mueble del juego cojo: solo position/normal/uv (lo que deja initMesh)
function makeLameModel(kind) {
  const geo = new Geo();
  geo.setAttribute('position', new Attr(new Float32Array(8 * 3), 3));
  geo.setAttribute('normal', new Attr(new Float32Array(8 * 3), 3));
  geo.setAttribute('uv', new Attr(new Float32Array(8 * 2), 2));
  return { name: kind, root: { geometry: geo } };
}

function makeCtx() {
  const logs = [];
  const records = new Map();
  const cm = { meshes: records, tileEntityQueue: new Map(), updateChunkMesh() {} };
  const models = new Map();
  const ter = {
    tileEntityModels: models,
    rebuildTileEntity(te) {
      const model = makeLameModel(te.name);
      models.set(te.pos, model);
      return model;
    }
  };
  const game = {
    player: { pos: { x: 0, y: 64, z: 0 } },
    world: {},
    gameScene: { tileEntityRenderer: ter },
    chunkRenderManager: cm
  };
  const reactRoot = {
    '__reactContainer$test': {
      updateQueue: { baseState: { element: { props: { game } } } }
    }
  };
  const ctx = {
    __listeners: {},
    document: {
      getElementById: (id) => (id === 'react' ? reactRoot : null),
      addEventListener(type, fn) { (ctx.__listeners[type] ||= []).push(fn); },
      removeEventListener() {}
    },
    console: {
      info(...a) { logs.push(a.join(' ')); },
      warn(...a) { logs.push(a.join(' ')); },
      error() {}, log() {}
    },
    performance: { now: () => 0 },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    Uint8Array, Float32Array
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { ctx, ter, cm, models, logs };
}

test('mueble cojo al crearse: termina con los 9 atributos y formatos del juego', () => {
  const { ctx, ter, logs } = makeCtx();
  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });
  assert.equal(ctx.MF_TileEntityMerge.aligned, true, 'wrap instalado al cargar');

  ter.rebuildTileEntity({ name: 'chest', pos: { x: 1, y: 64, z: 2 } });
  const model = [...ter.tileEntityModels.values()][0];
  const a = model.root.geometry.attributes;
  for (const name of ['position', 'color', 'normal', 'uv', 'overlayUV', 'animation', 'light', 'wave', 'emissive']) {
    assert.ok(a[name], 'falta ' + name);
  }
  assert.equal(a.color.array.length, 8 * 4);
  assert.equal(a.color.normalized, true, 'color Uint8 normalizado como el juego');
  assert.equal(a.color.array[0], 255, 'blanco neutro');
  assert.equal(a.emissive.normalized, true);
  assert.equal(a.wave.array.length, 8);
  assert.ok(logs.some((l) => l.includes('chest') && l.includes('sin color')), 'log dice qué rellenó');
});

test('mueble ya vivo antes del módulo: el sweep lo alinea también', () => {
  const { ctx, ter, cm } = makeCtx();
  const pre = makeLameModel('bed');
  cm.meshes.set('k', { tileEntities: new Map([['p', pre]]) });
  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });
  const a = pre.root.geometry.attributes;
  assert.ok(a.color, 'sweep alineó el mueble pre-existente');
  assert.ok(a.emissive, 'sweep alineó emissive');
  void ter;
});

test('extras: se reportan pero NO se quitan (romperían shaders scene-only)', () => {
  const { ctx, ter, logs } = makeCtx();
  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });
  const model = makeLameModel('sign');
  model.root.geometry.setAttribute('mfWeird', new Attr(new Float32Array(8), 1));
  ter.tileEntityModels.set('s', model);
  // re-align manual vía rebuild de otro mueble no toca este; el sweep tampoco
  // (models map ya lo tiene): forzamos segundo tick llamando a enable de nuevo
  ctx.MF_TileEntityMerge.disable();
  ctx.MF_TileEntityMerge.enable();
  assert.ok(model.root.geometry.attributes.mfWeird, 'extra intacto');
  assert.ok(logs.some((l) => l.includes('EXTRA mfWeird')), 'extra reportado');
});

test('disable restaura el rebuildTileEntity original (unwrap por conducta)', () => {
  const { ctx, ter } = makeCtx();
  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });
  const wrapped = ter.rebuildTileEntity;
  ctx.MF_TileEntityMerge.disable();
  assert.notEqual(ter.rebuildTileEntity, wrapped, 'rebuild des-envuelto');
  assert.equal(ctx.MF_TileEntityMerge.aligned, false);
});
