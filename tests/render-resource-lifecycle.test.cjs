'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, THREE } = require('./helpers/render-lifecycle.cjs');

function leafFixture() {
  const f = fixture();
  f.leaf = f.load('src/Render/LeafWind.js', 'state, setEnabled, scan');
  return f;
}

test('Leaf Wind caches unchanged non-leaf geometry instead of querying every scan', () => {
  const f = leafFixture();
  f.setLeaf(false);
  f.mesh();
  f.leaf.setEnabled(true);
  f.flush();
  const before = f.queries;
  assert.ok(before > 0);
  for (let i = 0; i < 4; i++) { f.leaf.scan(); f.flush(); }
  assert.equal(f.queries, before);
  f.leaf.setEnabled(false);
});

test('Leaf Wind invalidates an in-place position update and removes obsolete leaf flags', () => {
  const f = leafFixture();
  const mesh = f.mesh();
  const original = mesh.material;
  f.leaf.setEnabled(true);
  f.flush();
  assert.ok(mesh.geometry.getAttribute('mfLeaf'));
  f.setLeaf(false);
  mesh.geometry.translate(8, 0, 0);
  f.leaf.scan();
  f.flush();
  assert.equal(mesh.material, original);
  assert.equal(mesh.geometry.getAttribute('mfLeaf'), undefined);
  f.leaf.setEnabled(false);
});

test('Leaf Wind never reuses a mask after a buffer replacement with more vertices', () => {
  const f = leafFixture();
  const mesh = f.mesh();
  const original = mesh.material;
  f.leaf.setEnabled(true);
  f.flush();
  const p = mesh.geometry.attributes.position;
  const replacement = new Float32Array(p.array.length * 2);
  replacement.set(p.array); replacement.set(p.array, p.array.length);
  mesh.geometry.setAttribute('position', new THREE.BufferAttribute(replacement, 3));
  f.setLeaf(false);
  f.leaf.scan();
  assert.equal(mesh.geometry.getAttribute('mfLeaf'), undefined, 'old mask is removed before queued work');
  f.flush();
  assert.equal(mesh.material, original);
  f.leaf.setEnabled(false);
});

test('Leaf Wind restores and releases chunks removed from the active world', () => {
  const f = leafFixture();
  const mesh = f.mesh();
  const original = mesh.material;
  f.leaf.setEnabled(true);
  f.flush();
  const patched = mesh.material;
  let disposed = 0;
  patched.addEventListener('dispose', () => disposed++);
  f.chunks.remove(mesh);
  f.leaf.scan(); f.flush();
  assert.equal(f.leaf.state.records.size, 0);
  assert.equal(mesh.material, original);
  assert.equal(disposed, 1);
  assert.equal(mesh.geometry.getAttribute('mfLeaf'), undefined);
  f.leaf.setEnabled(false);
});

test('Leaf Wind cancels queued work across disable and a world replacement', () => {
  const f = leafFixture();
  const old = f.mesh();
  const original = old.material;
  f.leaf.setEnabled(true);
  f.leaf.setEnabled(false);
  assert.equal(f.jobs.size, 0, 'disable cancels scheduled work');
  f.leaf.setEnabled(true);
  f.game.world = { getBlock: () => ({ name: 'stone' }) };
  f.leaf.scan(); f.flush();
  assert.equal(old.material, original);
  assert.equal(f.leaf.state.records.size, 0);
  f.leaf.setEnabled(false);
  assert.equal(f.frames.size, 0);
});

test('Leaf Wind splits a large chunk analysis across scheduled slices', () => {
  const f = leafFixture();
  f.mesh(new THREE.PlaneGeometry(64, 64, 64, 64));
  f.leaf.setEnabled(true);
  assert.ok(f.flush() > 1, 'one large mesh must not be analysed in one task');
  f.leaf.setEnabled(false);
});

test('Leaf Wind leaves unsupported interleaved layouts native instead of attaching an invalid attribute', () => {
  const f = leafFixture();
  const geometry = new THREE.BoxGeometry();
  const data = new THREE.InterleavedBuffer(geometry.attributes.position.array, 3);
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
  const mesh = f.mesh(geometry);
  const original = mesh.material;
  f.leaf.setEnabled(true); f.flush();
  assert.equal(mesh.material, original);
  assert.equal(geometry.getAttribute('mfLeaf'), undefined);
  f.leaf.setEnabled(false);
});

test('Leaf Wind never patches a non-cloneable shared material in place', () => {
  const f = leafFixture();
  const mesh = f.mesh();
  const original = mesh.material;
  const compile = original.onBeforeCompile;
  original.clone = () => original;
  f.leaf.setEnabled(true); f.flush();
  assert.equal(mesh.material, original);
  assert.equal(original.onBeforeCompile, compile);
  assert.equal(mesh.geometry.getAttribute('mfLeaf'), undefined);
  f.leaf.setEnabled(false);
});

test('Leaf Wind fails open before the next draw when a mesher changes a buffer', () => {
  const f = leafFixture();
  const mesh = f.mesh();
  let nativeCalls = 0;
  const native = mesh.onBeforeRender = () => nativeCalls++;
  f.leaf.setEnabled(true); f.flush();
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.onBeforeRender();
  assert.equal(nativeCalls, 1);
  assert.equal(mesh.geometry.getAttribute('mfLeaf'), undefined);
  assert.deepEqual(Array.from(mesh.material.defaultAttributeValues.mfLeaf), [0]);
  f.leaf.setEnabled(false);
  assert.equal(mesh.onBeforeRender, native);
});

test('Leaf Wind releases disposed geometry and rejects an outdated partial analysis', () => {
  const f = leafFixture();
  const mesh = f.mesh(new THREE.PlaneGeometry(64, 64, 64, 64));
  f.leaf.setEnabled(true);
  const [id, work] = f.jobs.entries().next().value;
  f.jobs.delete(id); work({ didTimeout: false, timeRemaining: () => 5 });
  mesh.geometry.translate(1, 0, 0);
  f.setLeaf(false); f.leaf.scan(); f.flush();
  assert.equal(f.leaf.state.records.size, 0);
  f.setLeaf(true);
  mesh.geometry.attributes.position.needsUpdate = true;
  f.leaf.scan(); f.flush();
  assert.equal(f.leaf.state.records.size, 1);
  mesh.geometry.dispose();
  assert.equal(f.leaf.state.records.size, 0);
  f.leaf.setEnabled(false);
});

test('Leaf Wind and custom shaders do not accumulate cloned materials during chunk churn', () => {
  const f = leafFixture();
  const cs = f.load('src/Shaders/CustomShader.js', 'state, scan, disable');
  cs.state.enabled = true;
  f.leaf.setEnabled(true);
  for (let i = 0; i < 20; i++) {
    const mesh = f.mesh();
    f.leaf.scan(); f.flush(); cs.scan();
    assert.equal(cs.state.hooked.size, 1);
    f.chunks.remove(mesh);
    f.leaf.scan(); f.flush(); cs.scan();
    assert.equal(cs.state.hooked.size, 0);
    assert.equal(f.leaf.state.records.size, 0);
  }
  f.leaf.setEnabled(false); cs.disable();
});

test('custom shaders prune unloaded or disposed materials without disposing native resources', () => {
  const f = fixture();
  const cs = f.load('src/Shaders/CustomShader.js', 'state, scan, disable');
  cs.state.enabled = true;
  const native = new THREE.MeshBasicMaterial({ transparent: true });
  let nativeDisposed = 0;
  native.addEventListener('dispose', () => nativeDisposed++);
  for (let i = 0; i < 10; i++) {
    const mesh = f.mesh(undefined, native.clone());
    cs.scan();
    f.chunks.remove(mesh);
  }
  cs.scan();
  assert.equal(cs.state.hooked.size, 0);
  const mesh = f.mesh(undefined, native);
  cs.scan();
  native.dispose();
  assert.equal(cs.state.hooked.size, 0, 'dispose releases the hook immediately');
  assert.equal(nativeDisposed, 1, 'the module must not dispose native materials');
  f.chunks.remove(mesh);
  cs.disable();
});

test('custom shader disable restores callback identity and does not build dead wrapper chains', () => {
  const f = fixture();
  const mesh = f.mesh();
  const original = mesh.material.onBeforeCompile;
  const key = mesh.material.customProgramCacheKey;
  const cs = f.load('src/Shaders/CustomShader.js', 'state, scan, disable');
  for (let i = 0; i < 20; i++) {
    cs.state.enabled = true; cs.scan(); cs.disable();
    assert.equal(mesh.material.onBeforeCompile, original);
    assert.equal(mesh.material.customProgramCacheKey, key);
  }
});

test('custom shader disable preserves a wrapper installed later by another module', () => {
  const f = fixture();
  const mesh = f.mesh();
  const cs = f.load('src/Shaders/CustomShader.js', 'state, scan, disable');
  cs.state.enabled = true; cs.scan();
  const previous = mesh.material.onBeforeCompile;
  const outside = function (shader, renderer) { previous.call(this, shader, renderer); };
  mesh.material.onBeforeCompile = outside;
  cs.disable();
  assert.equal(mesh.material.onBeforeCompile, outside);
});

test('Water Style restores the native water uniform and prunes retired materials', () => {
  const f = fixture();
  const mesh = f.mesh();
  mesh.material.userData.waterShadersEnabled = { value: 0 };
  const original = mesh.material.onBeforeCompile;
  const ws = f.load('src/Shaders/MF_WaterStyle.js', 'state, scan, disable');
  ws.state.enabled = true; ws.state.subdiv = false; ws.state.caustics = 0;
  ws.scan();
  assert.equal(mesh.material.userData.waterShadersEnabled.value, 1);
  ws.disable();
  assert.equal(mesh.material.userData.waterShadersEnabled.value, 0);
  assert.equal(mesh.material.onBeforeCompile, original);
  ws.state.enabled = true;
  f.advance(); ws.scan();
  f.chunks.remove(mesh); f.advance(); ws.scan();
  assert.equal(ws.state.hooked.size, 0);
  assert.equal(mesh.material.userData.waterShadersEnabled.value, 0);
  ws.disable();
});

test('Water Style does not overwrite a replaced uniform or a later external wrapper', () => {
  const f = fixture();
  const mesh = f.mesh();
  mesh.material.userData.waterShadersEnabled = { value: 0 };
  const ws = f.load('src/Shaders/MF_WaterStyle.js', 'state, scan, disable');
  ws.state.enabled = true; ws.state.subdiv = false; ws.state.caustics = 0; ws.scan();
  const previous = mesh.material.onBeforeCompile;
  const outside = function (...args) { previous.apply(this, args); };
  mesh.material.onBeforeCompile = outside;
  const replacement = { value: 0.5 };
  mesh.material.userData.waterShadersEnabled = replacement;
  ws.disable();
  assert.equal(mesh.material.onBeforeCompile, outside);
  assert.equal(replacement.value, 0.5);
});
