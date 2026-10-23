'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('three');
const source = fs.readFileSync(path.join(__dirname, '../src/Render/BetterAnimationCape.js'), 'utf8');

function fixture(options = {}) {
  const listeners = new Map(), timers = new Map();
  let time = 0, nextTimer = 0, nativeCalls = 0;
  const geometry = options.geometry || new THREE.BoxGeometry(0.6, 0.95, 0.04).translate(0, -0.475, 0);
  const texture = new THREE.Texture({ width: 64, height: 32 });
  const material = new THREE.MeshBasicMaterial({ map: texture, color: 0x5fa8d3 });
  const mesh = new THREE.Group(), body = new THREE.Group(), cape = new THREE.Group();
  body.position.y = 1.5; cape.position.z = 0.18;
  const child = new THREE.Mesh(geometry, material);
  cape.add(child); body.add(cape); mesh.add(body);
  mesh.body = body; mesh.capeMesh = cape;
  const entity = { id: 1, pos: new THREE.Vector3(), mesh, sneak: false, inWater: false };
  if (options.collider) {
    const torso = new THREE.Bone(); torso.position.y = -0.375; body.add(torso);
    const torsoGeometry = new THREE.BoxGeometry(0.5, 0.75, 0.25);
    const reference = new THREE.Mesh(torsoGeometry, new THREE.MeshBasicMaterial());
    // Modern Miniblox detaches the references after baking a skinned rig.
    reference.matrixWorld.makeTranslation(1000, 1000, 1000);
    mesh.torso = torso; mesh.meshes = { torso: reference };
  }
  mesh.render = function (...args) {
    nativeCalls++; mesh.position.copy(entity.pos);
    cape.rotation.x = entity.sneak ? -0.55 : -0.08;
    cape.position.y = entity.sneak ? -0.20 : 0;
    mesh.updateMatrixWorld(true);
    return args[0] ?? 19;
  };
  const nativeRender = mesh.render;
  mesh.clear = function () { this.capeMesh?.children[0]?.geometry.dispose(); this.capeMesh = null; return 31; };
  const nativeClear = mesh.clear;
  const game = { player: entity, world: { players: new Map([[1, entity]]) } };
  const sandbox = {
    __MINIBLOX_GAME__: game, performance: { now: () => time },
    document: { querySelector: () => null, addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback);
    }, removeEventListener(type, callback) { listeners.get(type)?.delete(callback); } },
    setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); }
  };
  const fixtureSource = options.inspect ? source.replace('globalThis.BetterAnimationCape = api;',
    'globalThis.BetterAnimationCape = api; globalThis.__testCapeState = state;') : source;
  vm.createContext(sandbox); vm.runInContext(fixtureSource, sandbox);
  return { sandbox, api: sandbox.BetterAnimationCape, listeners, timers, game, mesh, body, cape, child, entity, geometry, material, texture,
    nativeRender, nativeClear, get nativeCalls() { return nativeCalls; },
    step(milliseconds = 1000 / 60, motion = null) {
      time += milliseconds; if (motion) entity.pos.add(motion);
      const result = mesh.render(42);
      assert.equal(result, 42, 'native render result is retained');
      return child.geometry;
    }, reload() { vm.runInContext(source, sandbox); this.api = sandbox.BetterAnimationCape; },
    advance(milliseconds) { time += milliseconds; }
  };
}

function validateGeometry(geometry) {
  assert.ok(Array.from(geometry.attributes.position.array).every(Number.isFinite));
  assert.ok(Array.from(geometry.attributes.normal.array).every(Number.isFinite));
  assert.ok(Array.from(geometry.index.array).every(index => index < geometry.attributes.position.count));
}

test('starts inactive without an idle animation loop; config and disable preserve the entire native cape', () => {
  const f = fixture(), original = f.geometry.attributes.position.array.slice();
  assert.equal(f.api.enabled, false); assert.equal(f.timers.size, 0);
  for (const callback of f.listeners.get('minifeather:better-animation-cape-config')) callback({ detail: JSON.stringify({ enabled: true }) });
  f.step();
  assert.notEqual(f.child.geometry, f.geometry);
  assert.equal(f.child.material, f.material); assert.equal(f.child.material.map, f.texture);
  assert.equal(f.cape.children.length, 1, 'no second cape and no mesh per segment');
  assert.deepEqual(f.geometry.attributes.position.array, original);
  let ownedDisposals = 0, originalDisposals = 0;
  f.child.geometry.addEventListener('dispose', () => ownedDisposals++);
  f.geometry.addEventListener('dispose', () => originalDisposals++);
  f.api.setEnabled(false);
  assert.equal(f.child.geometry, f.geometry);
  assert.equal(f.mesh.render, f.nativeRender); assert.equal(f.mesh.clear, f.nativeClear);
  assert.equal(f.cape.rotation.x, -0.08);
  assert.equal(ownedDisposals, 1); assert.equal(originalDisposals, 0); assert.equal(f.timers.size, 0);
});

test('a rigid native box acquires real intermediate rows, UVs and a curved trailing cloth rather than moving only the ends', () => {
  const f = fixture(); f.api.configure({ enabled: true, wind: 'none' }); f.step();
  const generated = f.child.geometry;
  const restPositions = generated.attributes.position.array.slice();
  const rows = new Set(Array.from(generated.attributes.position.array).filter((_, i) => i % 3 === 1).map(value => value.toFixed(4)));
  assert.ok(rows.size >= 17);
  assert.ok(generated.attributes.uv.count === generated.attributes.position.count);
  assert.ok(Array.from(generated.attributes.uv.array).every(value => value >= -1e-6 && value <= 1 + 1e-6));
  for (let i = 0; i < 90; i++) f.step(1000 / 60, new THREE.Vector3(0, 0, -0.08));
  validateGeometry(generated);
  const positions = generated.attributes.position;
  const near = [], middle = [], tip = [];
  for (let i = 0; i < positions.count; i++) {
    const y = restPositions[i * 3 + 1], z = positions.getZ(i);
    if (y > -0.06) near.push(z);
    else if (y < -0.35 && y > -0.55) middle.push(z);
    else if (y < -0.65) tip.push(z);
  }
  assert.ok(Math.max(...tip) > Math.max(...near) + 0.12);
  assert.ok(Math.max(...middle) > Math.max(...near) + 0.02);
  assert.equal(f.api.getState().geometryBuilds, 1);
  assert.equal(f.nativeCalls, 91);
});

test('both roots of a shared native geometry acquire independent owned buffers and restore the shared source', () => {
  const f = fixture();
  const second = new THREE.Mesh(f.geometry, f.material);
  const otherCape = new THREE.Group(); otherCape.add(second);
  const otherMesh = new THREE.Group(); otherMesh.add(otherCape); otherMesh.capeMesh = otherCape;
  otherMesh.render = function () { this.updateMatrixWorld(true); };
  f.game.world.players.set(2, { id: 2, mesh: otherMesh, pos: new THREE.Vector3(2, 0, 0) });
  f.api.setEnabled(true); f.step(); otherMesh.render();
  assert.notEqual(f.child.geometry, second.geometry);
  assert.notEqual(f.child.geometry, f.geometry); assert.notEqual(second.geometry, f.geometry);
  f.api.setEnabled(false);
  assert.equal(second.geometry, f.geometry); assert.equal(f.child.geometry, f.geometry);
});

test('detached modern player references collide through their live bones instead of a stale bind-pose transform', () => {
  const f = fixture({ collider: true });
  f.api.configure({ enabled: true, wind: 'none' });
  for (let i = 0; i < 100; i++) f.step(1000 / 60, new THREE.Vector3(0, 0, 0.07));
  assert.ok(f.api.getState().contacts > 0);
  validateGeometry(f.child.geometry);
  const positions = f.child.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) < -0.06 && positions.getY(i) > -0.7 && Math.abs(positions.getX(i)) < 0.24) {
      assert.ok(positions.getZ(i) > -0.07, 'cloth stays behind the torso');
    }
  }
});

test('crouching, jumping, falling, underwater motion and turns remain finite without changing player or camera state', () => {
  const f = fixture({ collider: true }); f.api.setEnabled(true);
  const entity = f.entity;
  for (let i = 0; i < 180; i++) {
    entity.sneak = i > 30 && i < 65; entity.inWater = i > 100 && i < 140;
    f.body.rotation.y = i * 0.025;
    f.step(1000 / 60, new THREE.Vector3(Math.sin(i / 12) * 0.02, Math.sin(i / 20) * 0.008, -0.025));
    validateGeometry(f.child.geometry);
  }
  assert.equal(f.api.getState().error, '');
  assert.equal(f.entity, entity);
  assert.equal(f.cape.rotation.x, 0);
});

test('teleports, long pauses and tiny or large model scales reset safely rather than launch the cloth', () => {
  const f = fixture({ collider: true }); f.api.setEnabled(true);
  for (const scale of [1, 0.025, 2]) {
    f.mesh.scale.setScalar(scale);
    f.api.configure({ gravity: scale === 1 ? 10 : 9 });
    f.step();
    f.advance(10000);
    f.step(1000 / 60, new THREE.Vector3(300, 40, -200));
    for (let i = 0; i < 20; i++) f.step();
    validateGeometry(f.child.geometry);
    assert.ok(Math.max(...Array.from(f.child.geometry.attributes.position.array).map(Math.abs)) < 4);
  }
});

test('all four motion modes, smooth and blocky rendering, wind and numeric options are available and bounded', () => {
  const f = fixture();
  for (const movement of ['simulation-v2', 'simulation', 'classic', 'dungeons']) for (const style of ['smooth', 'blocky']) {
    f.api.configure({ enabled: true, movement, style, wind: 'none', windStrength: 0, gravity: 10, strength: 1 });
    for (let i = 0; i < 8; i++) f.step(1000 / 60, new THREE.Vector3(0, 0, -0.06));
    validateGeometry(f.child.geometry);
    assert.equal(f.api.getState().options.movement, movement); assert.equal(f.api.getState().options.style, style);
  }
  f.api.configure({ gravity: Infinity, windStrength: -2, strength: 9000, movement: 'invalid', style: 'invalid' });
  assert.equal(f.api.getState().options.gravity, 10);
  assert.equal(f.api.getState().options.windStrength, 0); assert.equal(f.api.getState().options.strength, 2);
});

test('a replaced geometry or recreated cape is respected and only old owned buffers are disposed', () => {
  const f = fixture(); f.api.setEnabled(true); f.step();
  const oldOwned = f.child.geometry; let disposed = 0;
  oldOwned.addEventListener('dispose', () => disposed++);
  const replacement = new THREE.BoxGeometry(0.6, 0.8, 0.04).translate(0, -0.4, 0);
  f.child.geometry = replacement; f.step();
  assert.equal(disposed, 1); assert.notEqual(f.child.geometry, replacement);
  f.api.setEnabled(false); assert.equal(f.child.geometry, replacement);
});

test('native clear sees the original geometry and destroy or reload never leaks timers, listeners or hooks', () => {
  const f = fixture(); f.api.setEnabled(true); f.step();
  const old = f.api; f.reload();
  assert.equal(old.getState().destroyed, true);
  assert.equal(f.listeners.get('minifeather:better-animation-cape-config').size, 1);
  assert.equal(f.timers.size, 1);
  f.step();
  let originalDisposed = false; f.geometry.addEventListener('dispose', () => { originalDisposed = true; });
  assert.equal(f.mesh.clear(), 31); assert.equal(originalDisposed, true);
  assert.equal(f.api.getState().capes, 0);
  f.api.destroy(); f.api.destroy();
  assert.equal(f.mesh.render, f.nativeRender); assert.equal(f.mesh.clear, f.nativeClear);
  assert.equal(f.timers.size, 0); assert.equal(f.listeners.get('minifeather:better-animation-cape-config').size, 0);
});

test('players leaving the world and distant players restore native capes without affecting other entities', () => {
  const f = fixture(); f.api.setEnabled(true); f.step();
  f.game.world.players.delete(1); f.game.player = { pos: new THREE.Vector3(1000, 0, 0) };
  f.api.synchronize();
  assert.equal(f.child.geometry, f.geometry); assert.equal(f.mesh.render, f.nativeRender);
  assert.equal(f.api.getState().capes, 0);
});

test('smooth motion and live physics controls reuse buffers without recomputing bounds or triangle normals each frame', () => {
  const f = fixture(); f.api.setEnabled(true); f.step();
  const owned = f.child.geometry;
  assert.equal(owned.groups.length, f.geometry.groups.length, 'constructor groups must not double the draw calls');
  owned.computeBoundingSphere = owned.computeVertexNormals = () => assert.fail('no expensive per-frame recomputation');
  for (let i = 0; i < 30; i++) {
    f.api.configure({ windStrength: i / 30, gravity: 10 + i / 30, strength: 1.2 });
    f.step();
    assert.equal(f.child.geometry, owned);
  }
  f.api.configure({ movement: 'classic' }); f.step();
  assert.equal(f.child.geometry, owned); assert.equal(f.api.getState().geometryBuilds, 1);
});

test('voxel capes discard paired internal cube walls while retaining original texture and external faces', () => {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let row = 0; row < 16; row++) for (let col = 0; col < 4; col++) {
    const box = new THREE.BoxGeometry(0.15, 0.95 / 16, 0.04).translate((col - 1.5) * 0.15, -(row + 0.5) * 0.95 / 16, 0);
    const offset = positions.length / 3;
    positions.push(...box.attributes.position.array); normals.push(...box.attributes.normal.array); uvs.push(...box.attributes.uv.array);
    indices.push(...Array.from(box.index.array, index => index + offset)); box.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
  const original = geometry.attributes.position.array.slice();
  const f = fixture({ geometry }); f.api.setEnabled(true); f.step();
  assert.ok(f.child.geometry.index.count < geometry.index.count * 0.6, 'no hidden faces between neighboring pixels');
  validateGeometry(f.child.geometry); assert.deepEqual(geometry.attributes.position.array, original);
  assert.equal(f.child.material.map, f.texture);
});

test('fixed-step physics is consistent at 30, 60 and 144 FPS', () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const f = fixture(); f.api.configure({ enabled: true, wind: 'none' }); f.step(0);
    for (let i = 0; i < fps * 2; i++) f.step(1000 / fps, new THREE.Vector3(0, 0, -4 / fps));
    results.push(f.child.geometry.attributes.position.array.slice());
    validateGeometry(f.child.geometry);
  }
  for (const positions of [results[0], results[2]]) {
    const error = Math.max(...positions.map((value, at) => Math.abs(value - results[1][at])));
    assert.ok(error < 0.09, `frame-rate difference ${error}`);
  }
});

test('external render wrappers remain callable and disabling never discards another module wrapper', () => {
  const f = fixture(); f.api.setEnabled(true); f.step();
  const capeWrapper = f.mesh.render; let otherCalls = 0;
  const otherWrapper = function () { otherCalls++; return capeWrapper.apply(this, arguments); };
  f.mesh.render = otherWrapper;
  f.api.synchronize(); f.step();
  assert.equal(otherCalls, 1); assert.equal(f.nativeCalls, 2);
  f.api.setEnabled(false);
  assert.equal(f.mesh.render, otherWrapper); assert.equal(f.child.geometry, f.geometry);
  f.step(); assert.equal(otherCalls, 2); assert.equal(f.nativeCalls, 3);
});

test('invalid geometry and singular transforms fail closed without altering native buffers', () => {
  const invalid = new THREE.BoxGeometry(0.6, 0.95, 0.04); invalid.attributes.position.array[0] = NaN;
  const f = fixture({ geometry: invalid }); f.api.setEnabled(true); f.step();
  assert.equal(f.child.geometry, invalid); assert.equal(f.api.getState().capes, 0);
  const normal = fixture(); normal.api.setEnabled(true); normal.mesh.scale.setScalar(0); normal.step();
  assert.equal(normal.child.geometry, normal.geometry, 'a singular pose must not capture a collapsed rest shape');
  validateGeometry(normal.child.geometry);
  normal.mesh.scale.setScalar(1); normal.step(); validateGeometry(normal.child.geometry);
  const restoredPosition = normal.child.geometry.attributes.position;
  assert.ok(Math.max(...Array.from(restoredPosition.array).filter((_, at) => at % 3 === 0)) > 0.25);
});

test('sprinting, reversing direction and crouching never invert cloth rows or stretch a segment into a spike', () => {
  const f = fixture({ collider: true, inspect: true }); f.api.setEnabled(true); f.step(0);
  let largestStretch = 0, largestJerk = 0, visualJerk = 0, previous = null, previousVisual = null;
  for (let frame = 0; frame < 720; frame++) {
    const time = frame / 60;
    f.body.rotation.y = Math.sin(time * 1.7) * 1.4;
    f.entity.sneak = frame % 150 > 100 && frame % 150 < 115;
    f.step(frame % 70 === 0 ? 75 : 1000 / 60,
      new THREE.Vector3(Math.sin(time * 1.7) * 5.5 / 60, 0, -Math.cos(time * 1.7) * 5.5 / 60));
    const data = [...f.sandbox.__testCapeState.capes.values()][0];
    const inverse = f.cape.matrixWorld.clone().invert(), points = [];
    for (let at = 0; at < data.points.length; at += 3) {
      points.push(new THREE.Vector3(data.points[at], data.points[at + 1], data.points[at + 2]).applyMatrix4(inverse));
    }
    for (let row = 1; row <= 16; row++) for (let col = 0; col <= 4; col++) {
      const upper = points[(row - 1) * 5 + col], lower = points[row * 5 + col];
      assert.ok(lower.y < upper.y - 0.001, `inverted row at frame ${frame}, row ${row}`);
      largestStretch = Math.max(largestStretch, upper.distanceTo(lower) / (0.95 / 16));
    }
    if (previous) for (let at = 5; at < points.length; at++) {
      largestJerk = Math.max(largestJerk, points[at].distanceTo(previous[at]));
    }
    if (previousVisual) for (let at = 15; at < data.visualLocal.length; at += 3) {
      visualJerk = Math.max(visualJerk, Math.hypot(data.visualLocal[at] - previousVisual[at],
        data.visualLocal[at + 1] - previousVisual[at + 1], data.visualLocal[at + 2] - previousVisual[at + 2]));
    }
    previous = points;
    previousVisual = data.visualLocal.slice();
  }
  assert.ok(largestStretch < 1.65, `segment stretched ${largestStretch} times`);
  assert.ok(largestJerk < 0.28, `sudden physics displacement ${largestJerk}`);
  assert.ok(visualJerk < 0.08, `sudden visible displacement ${visualJerk}`);
});

test('extreme wind, zero gravity and rapid turns keep all motion modes ordered at low and high frame rates', () => {
  for (const movement of ['simulation-v2', 'simulation', 'dungeons', 'classic']) for (const fps of [30, 144]) {
    const f = fixture({ collider: true, inspect: true });
    f.api.configure({ enabled: true, movement, windStrength: 2, strength: 2, gravity: 0 }); f.step(0);
    let previous = null;
    for (let frame = 0; frame < fps; frame++) {
      const time = frame / fps;
      f.body.rotation.y = Math.sin(time * 5) * 2;
      f.entity.sneak = time > 0.25 && time < 0.5; f.entity.inWater = time > 0.6;
      f.step(1000 / fps, new THREE.Vector3(Math.sin(time * 5) * 6 / fps, 0, -Math.cos(time * 5) * 6 / fps));
      const data = [...f.sandbox.__testCapeState.capes.values()][0], local = data.visualLocal;
      for (let row = 1; row <= 16; row++) for (let col = 0; col <= 4; col++) {
        const at = (row * 5 + col) * 3, parent = at - 15;
        assert.ok(local[at + 1] < local[parent + 1] - 0.001, `${movement}, ${fps} FPS: no folded row`);
        if (previous) assert.ok(Math.hypot(local[at] - previous[at], local[at + 1] - previous[at + 1],
          local[at + 2] - previous[at + 2]) <= 0.95 * 2.5 / fps + 1e-6, 'bounded visible speed');
      }
      previous = local.slice();
    }
    validateGeometry(f.child.geometry);
    assert.equal(f.api.getState().error, '');
  }
});
