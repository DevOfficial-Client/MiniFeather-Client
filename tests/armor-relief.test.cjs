const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/Render/BetterPlayerLayersArmorPatch.js'), 'utf8');

class Attribute {
  constructor(array, itemSize, normalized = false) { Object.assign(this, { array, itemSize, normalized }); this.count = array.length / itemSize; }
  getX(i) { return this.array[i * this.itemSize]; }
  getY(i) { return this.array[i * this.itemSize + 1]; }
  getZ(i) { return this.array[i * this.itemSize + 2]; }
  getW(i) { return this.array[i * this.itemSize + 3]; }
}
class Geometry {
  constructor() { this.attributes = {}; this.groups = []; this.disposed = false; }
  setAttribute(key, value) { this.attributes[key] = value; return this; }
  setIndex(indices) { this.index = new Attribute(new Uint16Array(indices), 1); return this; }
  addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
  computeBoundingBox() {}
  computeBoundingSphere() {}
  dispose() { this.disposed = true; }
}
function quad(bone = 2) {
  const geometry = new Geometry();
  geometry.setAttribute('position', new Attribute(new Float32Array([0, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0]), 3));
  geometry.setAttribute('normal', new Attribute(new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]), 3));
  geometry.setAttribute('uv', new Attribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
  geometry.setAttribute('skinIndex', new Attribute(new Uint16Array([bone, 0, 0, 0, bone, 0, 0, 0, bone, 0, 0, 0, bone, 0, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new Attribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return geometry;
}
function texture(width = 2, height = 2, painter = () => [100, 140, 180, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(painter(x, y), (y * width + x) * 4);
  return { image: { width, height, data }, flipY: true };
}
function fixture(options = {}) {
  const listeners = new Map(), timers = new Map();
  let now = 1000;
  const original = quad(), material = { map: options.map || texture(), color: { r: 0.1, g: 0.7, b: 0.4 }, enchant: true };
  const object = { geometry: original, material, parent: {}, visible: true, userData: { _equipped: true } };
  const root = { skinnedArmor: { chestplate: object }, children: [object] };
  const game = { player: { id: 1 }, world: { entities: new Map([[1, { mesh: root }]]) } };
  const sandbox = {
    __MINIBLOX_GAME__: game, performance: { now: () => now },
    document: { querySelector: () => null, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
    setInterval(fn) { const id = timers.size + 1; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); }
  };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { sandbox, api: sandbox.MF_BetterPlayerLayersArmor, original, material, object, root, game, listeners, timers,
    step() { now += 500; sandbox.MF_BetterPlayerLayersArmor.synchronize(); } };
}

test('armor relief retains native material, colors, skin weights and transforms with no extra mesh', () => {
  const f = fixture(); f.api.setRealisticOptions({ enabled: true });
  const generated = f.object.geometry;
  assert.notEqual(generated, f.original);
  assert.equal(f.object.material, f.material);
  assert.equal(f.root.children.length, 1);
  assert.equal(f.api.getState().extraDrawCalls, 0);
  assert.equal(generated.attributes.position.count, 48, 'four top quads plus eight external walls, not internal faces');
  const bones = generated.attributes.skinIndex.array;
  const weights = generated.attributes.skinWeight.array;
  for (let i = 0; i < bones.length; i += 4) { assert.equal(bones[i], 2); assert.equal(weights[i], 1); }
  const positions = generated.attributes.position.array;
  assert.ok([...positions].every(Number.isFinite));
  assert.ok(Math.max(...[...positions].filter((_, i) => i % 3 === 2).map(Math.abs)) <= 0.18 / 16 + 1e-6);
  assert.equal(f.original.disposed, false);
  f.api.setRealisticOptions({ enabled: false });
  assert.equal(f.object.geometry, f.original);
  assert.equal(generated.disposed, true);
  assert.equal(f.timers.size, 0);
});

test('geometry stays cached across frames and dye/glint material changes sharing a texture', () => {
  const f = fixture(); f.api.enable(); const geometry = f.object.geometry;
  for (let i = 0; i < 5; i++) f.step();
  assert.equal(f.object.geometry, geometry);
  const dyed = { map: f.material.map, color: { r: 1, g: 0, b: 0 }, enchant: false };
  f.object.material = dyed; f.step();
  assert.equal(f.object.geometry, geometry);
  assert.equal(f.object.material, dyed);
  f.object.material = { map: texture(2, 2, () => [255, 255, 255, 255]) }; f.step();
  assert.notEqual(f.object.geometry, geometry);
  assert.equal(geometry.disposed, true);
});

test('manual and Realistic owners do not disable each other or enable armor from Realistic skin alone', () => {
  const f = fixture();
  f.sandbox.MF_BetterPlayerLayers = { getState: () => ({ enabled: true, manualEnabled: false, realisticEnabled: true }) };
  f.step(); assert.equal(f.api.getState().enabled, false);
  f.api.enable(); f.api.setRealisticOptions({ enabled: true });
  f.api.setRealisticOptions({ enabled: false }); assert.equal(f.api.getState().enabled, true);
  f.api.setRealisticOptions({ enabled: true }); f.api.disable(); assert.equal(f.api.getState().enabled, true);
  f.api.setRealisticOptions({ enabled: false }); assert.equal(f.api.getState().enabled, false);
});

test('FirstPerson geometry ownership restores the current relief/native source, not its filtered view', () => {
  const f = fixture(), filtered = new Geometry();
  f.object.__mfFirstPersonGeometry = { source: f.original, filtered };
  f.object.geometry = filtered;
  f.api.setRealisticOptions({ enabled: true });
  const relief = f.object.__mfFirstPersonGeometry.source;
  assert.notEqual(relief, f.original); assert.equal(f.object.geometry, filtered);
  f.api.setRealisticOptions({ enabled: false });
  assert.equal(f.object.__mfFirstPersonGeometry.source, f.original);
  assert.equal(f.object.geometry, filtered); assert.equal(filtered.disposed, false);
  assert.equal(relief.disposed, true);
});

test('unequip, entity replacement and destroy restore and dispose only owned geometry', () => {
  const f = fixture(); f.api.enable(); const first = f.object.geometry;
  f.object.userData._equipped = false; f.step();
  assert.equal(f.object.geometry, f.original); assert.equal(first.disposed, true);
  f.object.userData._equipped = true; f.step(); const second = f.object.geometry;
  f.game.world.entities.clear(); f.step();
  assert.equal(f.object.geometry, f.original); assert.equal(second.disposed, true);
  f.api.destroy(); assert.equal(f.original.disposed, false);
  assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
  assert.equal(f.sandbox.MF_BetterPlayerLayersArmor, undefined);
});

test('F5 bindings displaying the unfiltered source update both geometry pointers', () => {
  const f = fixture(), filtered = new Geometry();
  f.object.__mfFirstPersonGeometry = { source: f.original, filtered };
  f.api.setRealisticOptions({ enabled: true });
  const relief = f.object.geometry;
  assert.notEqual(relief, f.original);
  assert.equal(f.object.__mfFirstPersonGeometry.source, relief);
  f.api.setRealisticOptions({ enabled: false });
  assert.equal(f.object.geometry, f.original);
  assert.equal(f.object.__mfFirstPersonGeometry.source, f.original);
  assert.equal(relief.disposed, true);
  assert.equal(filtered.disposed, false);
});

test('only registered armor is patched and unsupported topology is left unchanged', () => {
  const f = fixture(), cosmetic = { geometry: quad(), material: f.material, parent: {}, visible: true, isSkinnedMesh: true };
  f.root.children.push(cosmetic); f.api.enable();
  assert.equal(cosmetic.geometry.attributes.position.count, 4);
  f.api.disable();
  f.original.setIndex([0, 2, 1, 1, 2, 3]); f.api.enable();
  assert.equal(f.object.geometry, f.original); assert.equal(f.api.getState().armorMeshes, 0);
});

test('transparent armor pixels remain holes and empty textures fall back to the original', () => {
  const f = fixture({ map: texture(2, 2, (x, y) => x === 0 && y === 0 ? [200, 180, 120, 255] : [0, 0, 0, 0]) });
  f.api.enable(); assert.equal(f.object.geometry.attributes.position.count, 20);
  f.object.material = { map: texture(2, 2, () => [0, 0, 0, 0]) }; f.step();
  assert.equal(f.object.geometry, f.original); assert.equal(f.api.getState().armorMeshes, 0);
});

test('reinjection removes previous timers and listeners without leaking owned resources', () => {
  const f = fixture(); f.api.enable(); const generated = f.object.geometry;
  vm.runInContext(source, f.sandbox);
  assert.equal(f.object.geometry, f.original); assert.equal(generated.disposed, true);
  assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 1);
});
