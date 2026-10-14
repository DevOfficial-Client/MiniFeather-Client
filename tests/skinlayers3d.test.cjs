const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/Render/BetterPlayerLayers.js'), 'utf8');
const geometryFunctions = ['pixelAlpha', 'vertexPosition', 'bilinear', 'shifted', 'textureQuad', 'pushQuad', 'pushTile', 'sourcePixel', 'buildGeometry'];

function functionSource(name) {
  const start = source.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, name);
  const next = source.indexOf('\n    function ', start + 1);
  return source.slice(start, next < 0 ? source.length : next).trim();
}

class Attribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
  getX(i) { return this.array[i * this.itemSize]; }
  getY(i) { return this.array[i * this.itemSize + 1]; }
  getZ(i) { return this.array[i * this.itemSize + 2]; }
}

let nextId = 1;
class Geometry {
  constructor() { this.uuid = `geometry-${nextId++}`; this.attributes = {}; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
  setIndex(indices) { this.index = { array: indices, count: indices.length }; return this; }
  computeVertexNormals() {}
  computeBoundingBox() {}
  computeBoundingSphere() {}
  clone() {
    const geometry = new Geometry();
    for (const [name, attribute] of Object.entries(this.attributes)) geometry.setAttribute(name, new Attribute(attribute.array.slice(), attribute.itemSize));
    if (this.index) geometry.setIndex(this.index.array.slice());
    if (this.groups) geometry.groups = this.groups.map(group => ({ ...group }));
    return geometry;
  }
  dispose() { this.disposed = true; }
}

const geometryApi = vm.runInNewContext(`(() => {
  ${source.match(/    const EXTREME = Object\.freeze\([\s\S]*?\n    \}\);/)[0]}
  ${source.match(/    const FACE_LAYOUT = Object\.freeze\([\s\S]*?\n    \]\);/)[0]}
  ${geometryFunctions.map(functionSource).join('\n')}
  return { buildGeometry, textureQuad, EXTREME };
})()`);

function fixture(width = 2, height = 1) {
  const reference = new Geometry();
  const positions = new Float32Array(48 * 3);
  // Native overlay's top-face corners follow FACE_LAYOUT.
  positions.set([1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0], 24 * 3);
  reference.setAttribute('position', new Attribute(positions, 3));
  reference.setAttribute('uv', new Attribute(new Float32Array(48 * 2), 2));
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  const overlay = { definition: { uvs: [[40, 40, width, height], ...Array.from({ length: 5 }, () => [0, 0, 0, 0])] } };
  const opaque = (x, y = 0, alpha = 255) => { pixels[((40 + y) * 64 + 40 + x) * 4 + 3] = alpha; };
  return { reference, pixels, overlay, opaque };
}

test('adjacent skin pixels omit their shared walls while retaining exposed boundaries', () => {
  const f = fixture();
  f.opaque(0); f.opaque(1);
  const geometry = geometryApi.buildGeometry(f.reference, f.overlay, f.pixels);
  assert.equal(geometry.attributes.position.count, 32); // 2 front faces + 6 external walls.
  assert.equal(geometry.index.count, 48);
  assert.equal(f.reference.attributes.position.count, 48);
  assert.equal(f.reference.disposed, undefined);
});

test('holes retain all visible walls and very transparent pixels do not create cubes', () => {
  const f = fixture(3);
  f.opaque(0); f.opaque(1, 0, 7); f.opaque(2);
  const geometry = geometryApi.buildGeometry(f.reference, f.overlay, f.pixels);
  assert.equal(geometry.attributes.position.count, 40); // Two separated tiles, 5 faces each.
  assert.equal(geometryApi.buildGeometry(f.reference, f.overlay, new Uint8ClampedArray(64 * 64 * 4)), null);
});

test('texture corners match the native triangle-strip order and honor texture flipY', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(geometryApi.textureQuad(40, 40))), [
    [40 / 64, 24 / 64], [41 / 64, 24 / 64], [40 / 64, 23 / 64], [41 / 64, 23 / 64]
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(geometryApi.textureQuad(40, 40, false))), [
    [40 / 64, 40 / 64], [41 / 64, 40 / 64], [40 / 64, 41 / 64], [41 / 64, 41 / 64]
  ]);
});

test('generated front triangles face outward and extrusion fits beneath the armor shell', () => {
  const f = fixture(1);
  f.opaque(0);
  const geometry = geometryApi.buildGeometry(f.reference, f.overlay, f.pixels);
  const positions = geometry.attributes.position;
  const [a, b, c] = geometry.index.array;
  const ax = positions.getX(b) - positions.getX(a), az = positions.getZ(b) - positions.getZ(a);
  const bx = positions.getX(c) - positions.getX(a), bz = positions.getZ(c) - positions.getZ(a);
  assert.ok(az * bx - ax * bz > 0, 'top-face winding points upward');
  assert.ok(geometryApi.EXTREME.inflate < 0.5, 'skin remains inside the native armor surface');
  assert.equal(geometryApi.EXTREME.inflate - geometryApi.EXTREME.depth, geometryApi.EXTREME.nativeInflate);
});

function environment(game) {
  const listeners = new Map();
  const intervals = new Map();
  let timer = 0, time = 2000, reads = 0;
  const sandbox = {
    Game: game,
    performance: { now: () => time },
    setInterval(fn) { intervals.set(++timer, fn); return timer; },
    clearInterval(id) { intervals.delete(id); },
    document: {
      querySelector: () => null,
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      createElement() { return { getContext() { return { drawImage() {}, getImageData() { reads++; return { data: sandbox.pixels }; } }; } }; }
    }
  };
  vm.runInNewContext(source, sandbox);
  return {
    sandbox, intervals, listeners,
    get reads() { return reads; },
    config(enabled) { for (const fn of listeners.get('minifeather:better-player-layers-config') ?? []) fn({ detail: JSON.stringify({ enabled }) }); },
    tick() { time += 250; for (const fn of intervals.values()) fn(); }
  };
}

test('Realistic Mode owns an independent lease and never erases the manual module toggle', () => {
  const e = environment();
  const mod = e.sandbox.MF_BetterPlayerLayers;
  e.config(true);
  mod.setRealisticOptions({ enabled: true });
  e.config(false);
  assert.equal(mod.getState().enabled, true);
  assert.equal(mod.getState().manualEnabled, false);
  mod.setRealisticOptions({ enabled: false });
  assert.equal(mod.getState().enabled, false);
  e.config(true);
  mod.setRealisticOptions({ enabled: true });
  mod.setRealisticOptions({ enabled: false });
  assert.equal(mod.getState().enabled, true);
  assert.equal(mod.getState().manualEnabled, true);
});

test('destroy and reinjection remove all owned listeners and timers', () => {
  const e = environment();
  const old = e.sandbox.MF_BetterPlayerLayers;
  old.enable();
  vm.runInNewContext(source, e.sandbox);
  assert.equal(old.getState().destroyed, true);
  assert.equal(e.intervals.size, 1);
  assert.equal(e.listeners.get('minifeather:better-player-layers-config').size, 1);
  const next = e.sandbox.MF_BetterPlayerLayers;
  assert.equal(next.getState().manualEnabled, true);
  next.destroy(); next.destroy();
  assert.equal(e.intervals.size, 0);
  assert.equal(e.listeners.get('minifeather:better-player-layers-config').size, 0);
  assert.equal(e.sandbox.MF_BetterPlayerLayers, undefined);
});

const vector = () => ({ copy(value) { Object.assign(this, value); return this; } });
class Mesh {
  constructor(geometry, material) {
    this.uuid = `mesh-${nextId++}`;
    this.geometry = geometry; this.material = material; this.visible = true;
    this.position = vector(); this.quaternion = vector(); this.scale = vector(); this.children = [];
  }
  add(child) { child.removeFromParent?.(); this.children.push(child); child.parent = this; }
  removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
}

function playerEnvironment() {
  const f = fixture(1);
  f.opaque(0);
  const image = { width: 64, height: 64, src: 'local-skin.png' };
  const map = { uuid: 'texture', image, flipY: true };
  const material = { uuid: 'skin-material', map, color: { r: 1, copy(value) { this.r = value.r; } }, clone() { return { ...this, color: { ...this.color }, dispose() { this.disposed = true; } }; } };
  const reference = new Mesh(f.reference, material);
  const pivot = new Mesh();
  const mesh = { uuid: 'player-mesh', meshes: { head: reference }, model: { parts: { head2: f.overlay.definition } }, headPivot: pivot, visible: true };
  const entity = { id: 5, mesh };
  const e = environment({ player: { id: 5 }, world: { players: new Map([[5, entity]]) } });
  e.sandbox.pixels = f.pixels;
  return { ...f, e, mesh, reference, pivot, material };
}

test('skin geometry builds once, keeps native material colors and cleans only owned resources', () => {
  const f = playerEnvironment();
  f.e.config(true);
  assert.equal(f.e.sandbox.MF_BetterPlayerLayers.getState().parts, 1);
  assert.equal(f.pivot.children.length, 1);
  const generated = f.pivot.children[0];
  f.material.color.r = 0.4;
  f.e.tick(); f.e.tick();
  assert.equal(generated.material.color.r, 0.4);
  assert.equal(f.e.reads, 1);
  assert.equal(f.pivot.children[0], generated);
  f.e.config(false);
  assert.equal(f.pivot.children.length, 0);
  assert.equal(generated.geometry.disposed, true);
  assert.equal(generated.material.disposed, true);
  assert.equal(f.reference.geometry.disposed, undefined);
  assert.equal(f.material.disposed, undefined);
  assert.equal(generated.material.map, f.material.map);
});

test('a native shadow-only material unwraps to the original skin texture', () => {
  const f = playerEnvironment();
  f.reference.material = { uuid: 'shadow-only', __realMaterial: f.material };
  f.e.config(true);
  assert.equal(f.pivot.children.length, 1);
  assert.equal(f.pivot.children[0].material.map, f.material.map);
});

test('world transitions remove stale layers instead of leaving the old player attached', () => {
  const f = playerEnvironment();
  f.e.config(true);
  f.e.sandbox.Game.world.players.clear();
  f.e.tick();
  assert.equal(f.pivot.children.length, 0);
  assert.equal(f.e.sandbox.MF_BetterPlayerLayers.getState().parts, 0);
});

function addNativeTriangles(geometry) {
  const uv = geometry.attributes.uv.array;
  uv.set([0, 0, 0.125, 0, 0, 0.125, 0.125, 0.125]);
  uv.set([40 / 64, 24 / 64, 41 / 64, 24 / 64, 40 / 64, 23 / 64, 41 / 64, 23 / 64], 24 * 2);
  geometry.setIndex([0, 1, 2, 2, 1, 3, 24, 25, 26, 26, 25, 27]);
}

test('successful voxel generation replaces the native flat layer and restores its exact original geometry', () => {
  const f = playerEnvironment();
  addNativeTriangles(f.reference.geometry);
  const original = f.reference.geometry;
  f.pivot.add(f.reference);
  f.e.config(true);
  const filtered = f.reference.geometry;
  assert.notEqual(filtered, original);
  assert.deepEqual(Array.from(filtered.index.array), [0, 1, 2, 2, 1, 3]);
  assert.equal(f.e.sandbox.MF_BetterPlayerLayers.getState().flatReplacements, 1);
  f.e.tick(); f.e.tick();
  assert.equal(f.reference.geometry, filtered, 'stable geometry is not cloned on every scan');
  f.e.config(false);
  assert.equal(f.reference.geometry, original);
  assert.equal(filtered.disposed, true);
  assert.equal(original.disposed, undefined);
});

test('merged skin filtering requires the exact native overlay triangle and its matching rigid bone', () => {
  const f = playerEnvironment();
  addNativeTriangles(f.reference.geometry);
  const bodyGeometry = new Geometry();
  const positions = new Float32Array(72 * 3);
  positions.set(f.reference.geometry.attributes.position.array);
  bodyGeometry.setAttribute('position', new Attribute(positions, 3));
  const uvs = new Float32Array(72 * 2);
  uvs.set(f.reference.geometry.attributes.uv.array);
  uvs.set(f.reference.geometry.attributes.uv.array.slice(24 * 2, 28 * 2), 48 * 2);
  bodyGeometry.setAttribute('uv', new Attribute(uvs, 2));
  const indices = new Uint16Array(72 * 4), weights = new Float32Array(72 * 4);
  for (let i = 0; i < 72; i++) { indices[i * 4] = i >= 48 ? 1 : 0; weights[i * 4] = 1; }
  bodyGeometry.setAttribute('skinIndex', new Attribute(indices, 4));
  bodyGeometry.setAttribute('skinWeight', new Attribute(weights, 4));
  bodyGeometry.setIndex([...f.reference.geometry.index.array, 48, 49, 50, 50, 49, 51]);
  const body = new Mesh(bodyGeometry, f.material);
  body.skeleton = { bones: [f.pivot, new Mesh()] };
  f.mesh.skinnedBody = body;
  f.e.config(true);
  assert.deepEqual(Array.from(body.geometry.index.array), [0, 1, 2, 2, 1, 3, 48, 49, 50, 50, 49, 51]);
  f.e.config(false);
  assert.equal(body.geometry, bodyGeometry);
});

test('flat skin replacement composes with First Person geometry ownership and cleans its own clone only', () => {
  const f = playerEnvironment();
  addNativeTriangles(f.reference.geometry);
  const original = f.reference.geometry;
  const firstPersonGeometry = original.clone();
  f.reference.__mfFirstPersonGeometry = { source: original, filtered: firstPersonGeometry, filteredSource: original };
  f.reference.geometry = firstPersonGeometry;
  f.pivot.add(f.reference);
  f.e.config(true);
  const skinGeometry = f.reference.__mfFirstPersonGeometry.source;
  assert.notEqual(skinGeometry, original);
  assert.equal(skinGeometry.index.count, 6);
  assert.equal(f.reference.geometry, firstPersonGeometry);
  f.e.tick();
  assert.equal(f.reference.__mfFirstPersonGeometry.source, skinGeometry);
  f.e.config(false);
  assert.equal(f.reference.__mfFirstPersonGeometry.source, original);
  assert.equal(f.reference.geometry, firstPersonGeometry);
  assert.equal(skinGeometry.disposed, true);
  assert.equal(firstPersonGeometry.disposed, undefined);
  assert.equal(original.disposed, undefined);
});

test('ambiguous base and overlay UV layouts are left intact', () => {
  const f = playerEnvironment();
  addNativeTriangles(f.reference.geometry);
  const original = f.reference.geometry;
  original.attributes.uv.array.set(original.attributes.uv.array.slice(24 * 2, 28 * 2), 0);
  f.pivot.add(f.reference);
  f.e.config(true);
  assert.equal(f.reference.geometry, original);
  assert.equal(f.e.sandbox.MF_BetterPlayerLayers.getState().flatReplacements, 0);
});

test('flat-layer filtering preserves material group indices after removed triangles', () => {
  const f = playerEnvironment();
  addNativeTriangles(f.reference.geometry);
  const original = f.reference.geometry;
  original.setIndex([24, 25, 26, 26, 25, 27, 0, 1, 2, 2, 1, 3]);
  original.groups = [{ start: 0, count: 6, materialIndex: 1 }, { start: 6, count: 6, materialIndex: 2 }];
  f.pivot.add(f.reference);
  f.e.config(true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.reference.geometry.groups)), [{ start: 0, count: 6, materialIndex: 2 }]);
  assert.deepEqual(original.groups, [{ start: 0, count: 6, materialIndex: 1 }, { start: 6, count: 6, materialIndex: 2 }]);
  f.e.config(false);
  assert.equal(f.reference.geometry, original);
});
