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
    Uint8Array, Uint16Array, Float32Array
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
  assert.equal(ctx.MF_TileEntityMerge.watching, true, 'watcher del updateChunkMesh armado');

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
  const { ctx, ter, cm } = makeCtx();
  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });
  const wrapped = ter.rebuildTileEntity;
  const wrappedCm = cm.updateChunkMesh;
  ctx.MF_TileEntityMerge.disable();
  assert.notEqual(ter.rebuildTileEntity, wrapped, 'rebuild des-envuelto');
  assert.notEqual(cm.updateChunkMesh, wrappedCm, 'watcher des-envuelto');
  assert.equal(ctx.MF_TileEntityMerge.aligned, false);
  assert.equal(ctx.MF_TileEntityMerge.watching, false);
});

test('mismatch real tras el merge: el watcher lo reporta con el par exacto', () => {
  const { ctx, ter, cm, logs } = makeCtx();
  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });
  // chunk con opaco de 9 y un mueble cojo insertado POR DEBAJO del guardián
  // (el escenario que se le escapó a la v1)
  const lame = makeLameModel('chest/normal');
  cm.meshes.set('z', { pos: { x: 3, z: 4 }, opaque: { geometry: lameFakeOpaque() },
    tileEntities: new Map([['p', lame]]) });
  cm.updateChunkMesh({ chunkX: 3, chunkZ: 4 });
  assert.ok(logs.some((l) => l.includes('MISMATCH REAL') && l.includes('falta=[')), 'diff exacto en consola');
  function lameFakeOpaque() {
    const g = new Geo();
    g.setAttribute('position', new Attr(new Float32Array(3), 3));
    for (const n of ['color', 'normal', 'uv', 'overlayUV', 'animation', 'light', 'wave', 'emissive']) {
      g.setAttribute(n, new Attr(new Float32Array(3), 3));
    }
    return g;
  }
});

test('v3: extra del opaco (mfLeaf) se aprende, se rellena en el mueble y se re-intenta el merge', () => {
  const { ctx, cm, logs } = makeCtx();
  // updateChunkMesh contable: el wrap llama orig, repara y re-intenta (orig directo)
  const calls = [];
  cm.updateChunkMesh = function (meshResult) { calls.push(meshResult); };
  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });

  // opaco de 9 + mfLeaf (la firma exacta del log del usuario), mueble ya con 9
  const opaqueGeo = new Geo();
  opaqueGeo.setAttribute('position', new Attr(new Float32Array(3), 3));
  for (const n of ['color', 'normal', 'uv', 'overlayUV', 'animation', 'light', 'wave', 'emissive']) {
    opaqueGeo.setAttribute(n, new Attr(new Float32Array(3), 3));
  }
  opaqueGeo.setAttribute('mfLeaf', new Attr(new Float32Array(3), 1));
  const mueble = makeLameModel('bed');
  // alinear a los 9 base como dejaría el guardián v1
  mueble.root.geometry.setAttribute('color', new Attr(new Uint8Array(8 * 4).fill(255), 4, true));
  mueble.root.geometry.setAttribute('overlayUV', new Attr(new Float32Array(8 * 2), 2));
  mueble.root.geometry.setAttribute('animation', new Attr(new Uint8Array(8 * 2), 2));
  mueble.root.geometry.setAttribute('light', new Attr(new Uint8Array(8 * 3).fill(255), 3, true));
  mueble.root.geometry.setAttribute('wave', new Attr(new Float32Array(8), 1));
  mueble.root.geometry.setAttribute('emissive', new Attr(new Uint8Array(8), 1, true));

  cm.meshes.set('c1', { pos: { x: 1, z: 2 }, opaque: { geometry: opaqueGeo },
    tileEntities: new Map([['p', mueble]]) });

  const result = { chunkX: 1, chunkZ: 2 };
  cm.updateChunkMesh(result);

  const leaf = mueble.root.geometry.attributes.mfLeaf;
  assert.ok(leaf, 'mfLeaf rellenado en el mueble');
  assert.equal(leaf.array.length, 8, 'un valor por vértice');
  assert.equal(leaf.itemSize, 1);
  assert.equal(leaf.array.constructor, Float32Array, 'ctor del array igual al del opaco (exigencia del merge)');
  assert.equal(calls.length, 2, 'merge re-intentado una vez tras el relleno');
  assert.equal(ctx.MF_TileEntityMerge.status().mergeRetries, 1);
  assert.ok(logs.some((l) => l.includes('aprendido del opaco: mfLeaf')), 'aprendizaje documentado');
  assert.ok(logs.some((l) => l.includes('MISMATCH REAL') && l.includes('mfLeaf')), 'diff con el culpable nombrado');

  // segundo remesh del mismo chunk: ya no hay mismatch, no hay tercer intento
  cm.updateChunkMesh(result);
  assert.equal(calls.length, 3, 'sin re-intento adicional cuando ya está alineado');
});

test('v3: rig skinned cojo (sin skinIndex) se repara y el render no muere', () => {
  const { ctx, logs } = makeCtx();
  // escena con un SkinnedMesh estilo NA del juego: applyBoneTransform en el
  // PROTOTYPE (como la clase real) leyendo skinIndex del geometry — sin el
  // guard, TypeError en cada frame
  const skinnedGeo = new Geo();
  skinnedGeo.setAttribute('position', new Attr(new Float32Array(4 * 3), 3));
  function NAFake() {}
  NAFake.prototype.applyBoneTransform = function (index, vector) {
    const si = this.geometry.attributes.skinIndex;   // undefined antes del guard
    void si.array[index * 4];
    return vector;
  };
  const skinned = new NAFake();
  skinned.isSkinnedMesh = true;
  skinned.skeleton = { bones: [{}, {}, {}] };
  skinned.geometry = skinnedGeo;
  const scene = { traverse(cb) { cb(skinned); } };
  const reactRoot = ctx.document.getElementById('react');
  const fiber = reactRoot['__reactContainer$test'];
  fiber.updateQueue.baseState.element.props.game.gameScene.scene = scene;

  vm.runInContext(SRC, ctx, { filename: 'MF_TileEntityMerge.js' });

  assert.ok(ctx.MF_TileEntityMerge.status().rigProtos >= 1, 'prototype del rig parcheado');
  assert.doesNotThrow(() => skinned.applyBoneTransform(1, { x: 0, y: 0, z: 0 }));
  const si = skinnedGeo.attributes.skinIndex;
  const sw = skinnedGeo.attributes.skinWeight;
  assert.ok(si && sw, 'skin attrs rellenados');
  assert.equal(si.array.constructor, Uint16Array);
  assert.equal(si.array.length, 4 * 4);
  assert.equal(sw.array[0], 1, 'peso 1 en el hueso 0 (receta del builder del juego)');
  assert.equal(ctx.MF_TileEntityMerge.status().rigRepairs, 1);
  assert.ok(logs.some((l) => l.includes('render salvado')));
  // segunda llamada ya no cuenta reparación
  skinned.applyBoneTransform(1, { x: 0, y: 0, z: 0 });
  assert.equal(ctx.MF_TileEntityMerge.status().rigRepairs, 1);
});
