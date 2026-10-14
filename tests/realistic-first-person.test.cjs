const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/Experimental/Realistic/FirstPersonModel.js'), 'utf8');

class Geometry {
  constructor(boneIndices = [0, 1, 2, 3, 4], groups = []) {
    const values = boneIndices.flatMap(index => [index, 0, 0, 0, index, 0, 0, 0, index, 0, 0, 0]);
    this.attributes = {
      position: { count: boneIndices.length * 3 },
      skinIndex: { array: new Uint16Array(values), itemSize: 4 },
      skinWeight: { array: new Float32Array(values.map((_, index) => index % 4 === 0 ? 1 : 0)), itemSize: 4 }
    };
    this.setIndex(Array.from({ length: boneIndices.length * 3 }, (_, index) => index));
    this.groups = groups.map(group => ({ ...group }));
    this.disposed = false;
  }
  clone() {
    const copy = new Geometry();
    copy.attributes = this.attributes;
    copy.setIndex([...this.index.array]);
    copy.groups = this.groups.map(group => ({ ...group }));
    return copy;
  }
  setIndex(indices) { this.index = { array: new Uint16Array(indices), count: indices.length }; }
  clearGroups() { this.groups = []; }
  addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
  dispose() { this.disposed = true; }
}

function vector(x = 0, y = 0, z = 0) { return { x, y, z, clone() { return vector(this.x, this.y, this.z); } }; }
function node() { return { visible: true, children: [], parent: null, position: vector(), quaternion: { x: 0, y: 0, z: 0, w: 1 } }; }
function attach(parent, child) { parent.children.push(child); child.parent = parent; return child; }

function fixture(options = {}) {
  const timers = new Map();
  const listeners = new Map();
  const shadow = { name: 'shadow-only' }, skin = { name: 'skin', map: { image: { width: 64, height: 64 } } };
  const mesh = node();
  mesh.skeleton = attach(mesh, node());
  mesh.neck = attach(mesh.skeleton, node());
  mesh.headPivot = attach(mesh.neck, node());
  mesh.body = attach(mesh.skeleton, node());
  mesh.leftShoulder = attach(mesh.body, node());
  mesh.rightShoulder = attach(mesh.body, node());
  mesh.leftHipJoint = attach(mesh.body, node());
  mesh.torso = attach(mesh.body, node());
  mesh.leftHand = attach(mesh.leftShoulder, node());
  mesh.rightHand = attach(mesh.rightShoulder, node());
  mesh.meshes = { head: attach(mesh.headPivot, node()) };
  mesh.model = { foldHead: !!options.foldHead };
  const bones = [mesh.torso, mesh.leftShoulder, mesh.rightShoulder, mesh.headPivot, mesh.leftHipJoint];
  const geometry = new Geometry(undefined, options.groups || []);
  mesh.skinnedBody = attach(mesh, Object.assign(node(), {
    geometry, isSkinnedMesh: true, skeleton: { bones }, material: shadow, __realMaterial: skin
  }));
  mesh.skinnedArmor = { helmet: attach(mesh.headPivot, Object.assign(node(), { material: skin })) };
  const camera = {
    position: vector(0, 1.62, 0),
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    getWorldPosition(point) { return Object.assign(point, this.position); }
  };
  let nativeCalls = 0, seenGeometry, seenPosition, seenBodyQuaternion;
  const player = {
    id: 5, pos: { x: 0, y: 0, z: 0 }, width: 0.6, perspective: 0, yaw: 0, pitch: 0,
    getActiveItemStack() { return this.activeStack || null; },
    getOffhandItem() { return this.offStack || null; },
    mode: { isSpectator: () => false }, getHealth: () => 20,
    nativeVisibility() {
      const target = game.world.entities.get(this.id)?.mesh;
      if (!target) return;
      target.visible = this.perspective !== 0 || options.shadowsEnabled === true;
      const body = target.skinnedBody;
      if (body && this.perspective === 0 && options.shadowsEnabled !== false) {
        if (body.material !== shadow) body.__realMaterial = body.material;
        body.material = shadow;
      } else if (body?.__realMaterial) {
        body.material = body.__realMaterial;
        body.__realMaterial = null;
      }
    }
  };
  const entity = { id: player.id, mesh };
  const game = { player, world: { entities: new Map([[player.id, entity]]) }, gameScene: { camera }, inGame: () => true };
  mesh.render = function () {
    nativeCalls++;
    seenGeometry = this.skinnedBody?.geometry;
    seenPosition = { x: this.position.x, y: this.position.y, z: this.position.z };
    seenBodyQuaternion = { ...this.body.quaternion };
    if (options.nativeVisibilityInRender !== false) player.nativeVisibility();
    this.headPivot.visible = true;
    options.onNativeRender?.(this);
    return 37;
  };
  const nativeRender = mesh.render;
  let hud, nativeHudUpdate, hudCalls = 0;
  if (options.hands) {
    const hudCamera = node();
    hud = attach(hudCamera, node());
    hud.rightArm = attach(hud, Object.assign(node(), { geometry: new Geometry(), material: skin }));
    hud.leftArm = attach(hud, node());
    hud.item = attach(hud, node());
    hud.offHandSwing = attach(hud, node());
    hud.updateArmAnimation = function () {};
    hud.update = function (...args) {
      hudCalls++;
      hud.rightArm.visible = player.perspective === 0 && !player.activeStack;
      hud.item.visible = player.perspective === 0 && !!player.activeStack;
      hud.offHandSwing.visible = player.perspective === 0 && !!player.offStack;
      options.onHudUpdate?.(this, args);
      return 19;
    };
    nativeHudUpdate = hud.update;
    hud.update();
    game.gameScene.axesHelper = { parent: hudCamera };
  }
  const sandbox = {
    __MINIBLOX_GAME__: game,
    document: {
      querySelector: () => null,
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); }
    },
    performance: { now: () => 1000 },
    setInterval(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return { sandbox, api: sandbox.MF_RealisticFirstPerson, game, mesh, geometry, camera, player, timers, listeners, skin, shadow,
    nativeRender, nativeCalls: () => nativeCalls, seenGeometry: () => seenGeometry,
    seenPosition: () => seenPosition, seenBodyQuaternion: () => seenBodyQuaternion,
    hud, nativeHudUpdate, hudCalls: () => hudCalls };
}

test('body keeps both real arms and native skin and animation without changing camera or player', () => {
  const f = fixture();
  const position = { ...f.camera.position }, orientation = { ...f.camera.quaternion };
  f.api.configure({ enabled: true });
  assert.equal(f.api.getState().active, true);
  assert.equal(f.mesh.visible, true);
  assert.equal(f.mesh.headPivot.visible, false);
  assert.equal(f.mesh.leftShoulder.visible, true);
  assert.equal(f.mesh.rightShoulder.visible, true);
  assert.equal(f.mesh.leftHand.visible, true);
  assert.equal(f.mesh.rightHand.visible, true);
  assert.equal(f.mesh.skinnedBody.material, f.skin);
  assert.deepEqual([...f.mesh.skinnedBody.geometry.index.array], [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14]);
  assert.equal(f.api.getState().nativeHands, false);
  assert.equal(f.api.getState().handsMode, 'model');
  assert.equal(f.mesh.render(), 37);
  assert.equal(f.nativeCalls(), 1);
  assert.equal(f.seenGeometry(), f.geometry);
  assert.equal(f.mesh.skinnedBody.material, f.skin);
  assert.deepEqual(f.camera.position, position);
  assert.deepEqual(f.camera.quaternion, orientation);
  assert.equal(f.player.perspective, 0);
  assert.equal(f.geometry.disposed, false);
});

test('F5, freecam and spectator restore the native model immediately on render', () => {
  const f = fixture();
  f.api.configure({ enabled: true });
  f.player.perspective = 1;
  f.mesh.render();
  assert.equal(f.api.getState().active, false);
  assert.equal(f.api.getState().reason, 'third person');
  assert.equal(f.mesh.headPivot.visible, true);
  assert.equal(f.mesh.leftShoulder.visible, true);
  assert.equal(f.mesh.skinnedBody.geometry, f.geometry);
  f.player.perspective = 0;
  f.sandbox.MF_FREECAM = { active: true };
  f.mesh.render();
  assert.equal(f.api.getState().reason, 'freecam');
  f.sandbox.MF_FREECAM.active = false;
  f.camera.position.x = 8;
  f.mesh.render();
  assert.equal(f.api.getState().reason, 'detached camera');
  f.camera.position.x = 0;
  f.player.mode.isSpectator = () => true;
  f.mesh.render();
  assert.equal(f.api.getState().reason, 'spectator');
  assert.equal(f.mesh.visible, false);
});

test('disable and hot reload restore hooks, materials and geometry and free owned resources', () => {
  const f = fixture();
  f.api.configure({ enabled: true });
  const filtered = f.mesh.skinnedBody.geometry;
  assert.notEqual(filtered, f.geometry);
  f.api.configure({ enabled: false });
  assert.equal(f.mesh.render, f.nativeRender);
  assert.equal(f.mesh.skinnedBody.geometry, f.geometry);
  assert.equal(f.mesh.skinnedBody.material, f.shadow);
  assert.equal(f.mesh.headPivot.visible, true);
  assert.equal(f.mesh.leftShoulder.visible, true);
  assert.equal(filtered.disposed, true);
  assert.equal(f.geometry.disposed, false);
  assert.equal(f.mesh.skinnedBody.__mfFirstPersonGeometry, undefined);
  assert.equal(f.timers.size, 0);
  f.api.configure({ enabled: true });
  vm.runInNewContext(source, f.sandbox);
  assert.equal(f.mesh.render, f.nativeRender);
  assert.equal(f.timers.size, 0);
  assert.equal(f.sandbox.MF_RealisticFirstPerson.getState().enabled, false);
});

test('armor relief can update shared source geometry while the first-person filter is active', () => {
  const f = fixture();
  f.api.configure({ enabled: true });
  const body = f.mesh.skinnedBody, firstFiltered = body.geometry;
  const relief = f.geometry.clone();
  body.__mfFirstPersonGeometry.source = relief;
  f.mesh.render();
  assert.equal(f.seenGeometry(), relief);
  assert.notEqual(body.geometry, firstFiltered);
  assert.equal(firstFiltered.disposed, true);
  f.api.configure({ enabled: false });
  assert.equal(body.geometry, relief);
  assert.equal(relief.disposed, false);
});

test('native armor and skin material replacements retain dyes and maps in first person', () => {
  const dyed = { name: 'dyed armor', color: { hex: 0xff3366 }, map: { image: { width: 64, height: 32 } } };
  const f = fixture({ onNativeRender: mesh => { mesh.skinnedBody.material = dyed; } });
  f.api.configure({ enabled: true });
  f.mesh.render();
  assert.equal(f.mesh.skinnedBody.material, dyed);
  assert.equal(f.mesh.skinnedBody.__realMaterial, dyed);
  f.api.configure({ enabled: false });
  assert.equal(f.mesh.skinnedBody.__realMaterial, dyed);
  assert.equal(f.mesh.skinnedBody.material, f.shadow);
});

test('recreated player meshes and external skin changes do not leave the old model modified', () => {
  const f = fixture();
  f.api.configure({ enabled: true });
  const oldFiltered = f.mesh.skinnedBody.geometry;
  const replacement = fixture();
  f.game.world.entities.set(f.player.id, { mesh: replacement.mesh });
  f.api.sync();
  assert.equal(f.mesh.render, f.nativeRender);
  assert.equal(f.mesh.headPivot.visible, true);
  assert.equal(f.mesh.skinnedBody.geometry, f.geometry);
  assert.equal(oldFiltered.disposed, true);
  assert.equal(replacement.mesh.headPivot.visible, false);
  assert.equal(f.api.getState().active, true);
});

test('material group ranges are rebuilt when head triangles are removed without discarding arms', () => {
  const f = fixture({ groups: [{ start: 0, count: 9, materialIndex: 0 }, { start: 9, count: 6, materialIndex: 1 }] });
  f.api.configure({ enabled: true });
  const groups = f.mesh.skinnedBody.geometry.groups;
  assert.deepEqual(JSON.parse(JSON.stringify(groups)), [
    { start: 0, count: 9, materialIndex: 0 }, { start: 9, count: 3, materialIndex: 1 }
  ]);
});

test('skin rebuilds within the same player release detached filtered meshes', () => {
  const f = fixture();
  f.api.configure({ enabled: true });
  const oldBody = f.mesh.skinnedBody, oldFiltered = oldBody.geometry;
  f.mesh.children.splice(f.mesh.children.indexOf(oldBody), 1);
  const rebuilt = attach(f.mesh, Object.assign(node(), {
    geometry: f.geometry.clone(), skeleton: oldBody.skeleton, isSkinnedMesh: true,
    material: f.skin, __realMaterial: f.skin
  }));
  f.mesh.skinnedBody = rebuilt;
  f.mesh.render();
  assert.equal(oldFiltered.disposed, true);
  assert.equal(oldBody.__mfFirstPersonGeometry, undefined);
  assert.equal(f.api.getState().filteredMeshes, 1);
  assert.notEqual(rebuilt.geometry, oldFiltered);
});

test('folded heads without separable bone data fail closed rather than clip the camera', () => {
  const f = fixture({ foldHead: true });
  delete f.mesh.skinnedBody.geometry.attributes.skinIndex;
  f.api.configure({ enabled: true });
  assert.equal(f.api.getState().active, false);
  assert.equal(f.api.getState().reason, 'unsupported head rig');
  assert.equal(f.mesh.headPivot.visible, true);
});

test('missing worlds wait without a render loop or mutating unrelated game settings', () => {
  const f = fixture();
  f.sandbox.__MINIBLOX_GAME__ = null;
  f.api.configure({ enabled: true });
  assert.equal(f.api.getState().reason, 'waiting for player');
  assert.equal(f.api.getState().active, false);
  assert.equal(f.mesh.render, f.nativeRender);
  assert.equal(f.timers.size, 1);
  f.api.destroy();
  assert.equal(f.timers.size, 0);
  assert.equal(f.sandbox.MF_RealisticFirstPerson, undefined);
  assert.doesNotMatch(source, /requestAnimationFrame|new WebGLRenderer|toggleCameraPerspective\(/);
});

test('discovers the direct miniblox game and the shared adapter without a private global', () => {
  for (const globalName of ['miniblox', '__MB']) {
    const f = fixture();
    delete f.sandbox.__MINIBLOX_GAME__;
    f.sandbox[globalName] = globalName === '__MB' ? { game: f.game } : f.game;
    f.api.configure({ enabled: true });
    assert.equal(f.api.getState().active, true, globalName);
    assert.equal(f.api.getState().hooked, true);
  }
});

test('discovers the game through the alternative React root', () => {
  const f = fixture();
  delete f.sandbox.__MINIBLOX_GAME__;
  const root = { '__reactFiber$test': { memoizedProps: { game: f.game } } };
  f.sandbox.document.querySelector = selector => selector === '#root' ? root : null;
  f.api.configure({ enabled: true });
  assert.equal(f.api.getState().active, true);
});

test('unhides the native body and skeleton independently and restores LOD and armor flags', () => {
  const f = fixture();
  f.mesh.skeleton.visible = false;
  f.mesh.skinnedBody.visible = false;
  f.mesh.lodBody = attach(f.mesh, node());
  f.mesh.lodArmor = { chest: attach(f.mesh, node()) };
  f.mesh.skinnedRig = { torso: f.mesh.torso };
  f.mesh.torso.visible = false;
  const chest = attach(f.mesh, Object.assign(node(), { visible: false, userData: { _equipped: true } }));
  const emptyBoots = attach(f.mesh, Object.assign(node(), { visible: false, userData: { _equipped: false } }));
  f.mesh.skinnedArmor.chest = chest;
  f.mesh.skinnedArmor.boots = emptyBoots;
  f.api.configure({ enabled: true });
  assert.equal(f.mesh.skeleton.visible, true);
  assert.equal(f.mesh.skinnedBody.visible, true);
  assert.equal(f.mesh.torso.visible, true);
  assert.equal(f.mesh.lodBody.visible, false);
  assert.equal(f.mesh.lodArmor.chest.visible, false);
  assert.equal(chest.visible, true);
  assert.equal(emptyBoots.visible, false);
  f.api.configure({ enabled: false });
  assert.equal(f.mesh.skeleton.visible, false);
  assert.equal(f.mesh.skinnedBody.visible, false);
  assert.equal(f.mesh.torso.visible, false);
  assert.equal(f.mesh.lodBody.visible, true);
  assert.equal(f.mesh.lodArmor.chest.visible, true);
  assert.equal(chest.visible, false);
  assert.equal(emptyBoots.visible, false);
});

test('native visibility before entity render works both with shadows on and off', () => {
  for (const shadowsEnabled of [true, false]) {
    const f = fixture({ shadowsEnabled, nativeVisibilityInRender: false,
      onNativeRender: mesh => { mesh.skinnedBody.visible = false; } });
    f.player.nativeVisibility();
    f.api.configure({ enabled: true });
    const filtered = f.mesh.skinnedBody.geometry;
    for (let frame = 0; frame < 4; frame++) {
      // The real game updates player visibility before rendering the entities.
      f.player.nativeVisibility();
      f.mesh.render();
      assert.equal(f.seenGeometry(), f.geometry);
      assert.equal(f.mesh.visible, true);
      assert.equal(f.mesh.skinnedBody.visible, true);
      assert.equal(f.mesh.skinnedBody.material, f.skin);
      assert.equal(f.mesh.skinnedBody.geometry, filtered);
    }
    const status = f.api.getState();
    assert.equal(status.version, 3);
    assert.equal(status.renderCount, 4);
    assert.equal(status.playerFound, true);
    assert.equal(status.hooked, true);
    assert.equal(status.bodyVisible, true);
    assert.equal(status.modelVisible, true);
    assert.equal(status.skeletonVisible, true);
    assert.equal(status.bodyTriangles, 4);
    assert.equal(status.error, '');
    f.api.configure({ enabled: false });
    assert.equal(f.mesh.render, f.nativeRender);
    assert.equal(f.mesh.visible, shadowsEnabled);
    assert.equal(f.mesh.skinnedBody.material, shadowsEnabled ? f.shadow : f.skin);
  }
});

test('F5 does not restore an obsolete shadow material after native visibility clears its snapshot', () => {
  const f = fixture({ shadowsEnabled: true, nativeVisibilityInRender: false });
  f.player.nativeVisibility();
  f.api.configure({ enabled: true });
  f.player.perspective = 1;
  f.player.nativeVisibility();
  assert.equal(f.mesh.skinnedBody.__realMaterial, null);
  f.mesh.render();
  assert.equal(f.api.getState().active, false);
  assert.equal(f.api.getState().reason, 'third person');
  assert.equal(f.mesh.skinnedBody.material, f.skin);
  assert.equal(f.mesh.skinnedBody.geometry, f.geometry);
  assert.equal(f.mesh.headPivot.visible, true);
  f.player.perspective = 0;
  f.player.nativeVisibility();
  f.mesh.render();
  assert.equal(f.api.getState().active, true);
  assert.equal(f.mesh.skinnedBody.material, f.skin);
  assert.notEqual(f.mesh.skinnedBody.geometry, f.geometry);
  f.player.perspective = 2;
  f.player.nativeVisibility();
  f.api.configure({ enabled: false });
  assert.equal(f.mesh.skinnedBody.material, f.skin);
  assert.equal(f.mesh.render, f.nativeRender);
});

test('changing native shadow settings before entity render does not leave an invisible body', () => {
  const options = { shadowsEnabled: true, nativeVisibilityInRender: false };
  const f = fixture(options);
  f.player.nativeVisibility();
  f.api.configure({ enabled: true });
  options.shadowsEnabled = false;
  f.player.nativeVisibility();
  f.mesh.render();
  assert.equal(f.mesh.skinnedBody.material, f.skin);
  assert.equal(f.mesh.visible, true);
  f.api.configure({ enabled: false });
  assert.equal(f.mesh.skinnedBody.material, f.skin);
  assert.equal(f.mesh.visible, false);
});

test('F5 keeps the native player root visible without shadows on render and on periodic sync', () => {
  for (const useSync of [false, true]) {
    const f = fixture({ shadowsEnabled: false, nativeVisibilityInRender: false });
    f.player.nativeVisibility();
    assert.equal(f.mesh.visible, false);
    f.api.configure({ enabled: true });
    f.player.perspective = 1;
    f.player.nativeVisibility();
    assert.equal(f.mesh.visible, true);
    if (useSync) f.api.sync();
    else f.mesh.render();
    assert.equal(f.api.getState().reason, 'third person');
    assert.equal(f.mesh.visible, true);
    assert.equal(f.mesh.skinnedBody.material, f.skin);
    assert.equal(f.mesh.skinnedBody.geometry, f.geometry);
    assert.equal(f.mesh.leftShoulder.visible, true);
  }
});

test('realistic configuration enables the companion directly and removes listeners on reload', () => {
  const f = fixture();
  const type = 'minifeather:realistic-config';
  const dispatch = detail => { for (const callback of f.listeners.get(type) || []) callback({ detail }); };
  assert.equal(f.listeners.get(type).size, 1);
  dispatch(JSON.stringify({ enabled: true, firstPersonBody: true }));
  assert.equal(f.api.getState().active, true);
  dispatch('{invalid');
  assert.equal(f.api.getState().active, true);
  dispatch({ firstPersonBody: false });
  assert.equal(f.api.getState().active, true);
  dispatch({ enabled: true, firstPersonBody: false });
  assert.equal(f.api.getState().enabled, false);
  dispatch({ enabled: true });
  assert.equal(f.api.getState().active, true);
  vm.runInNewContext(source, f.sandbox);
  assert.equal(f.listeners.get(type).size, 1);
  const nextApi = f.sandbox.MF_RealisticFirstPerson;
  dispatch({ enabled: true, firstPersonBody: true });
  assert.equal(nextApi.getState().active, true);
  assert.equal(f.api.getState().enabled, false);
  dispatch({ enabled: false, firstPersonBody: true });
  assert.equal(nextApi.getState().active, false);
  nextApi.destroy();
  assert.equal(f.listeners.get(type).size, 0);
});

test('invisibility mode is not overridden by forcing the local body visible', () => {
  const f = fixture();
  f.mesh.renderArmorOnly = true;
  f.mesh.skinnedBody.visible = false;
  f.api.configure({ enabled: true });
  assert.equal(f.api.getState().active, false);
  assert.equal(f.api.getState().reason, 'invisible player');
  assert.equal(f.mesh.skinnedBody.visible, false);
  assert.equal(f.mesh.headPivot.visible, true);
});

test('unsupported geometry cannot abort the native entity render and partial changes are restored', () => {
  const f = fixture();
  f.geometry.clone = () => { throw new Error('unsupported geometry'); };
  f.api.configure({ enabled: true });
  assert.equal(f.api.getState().active, false);
  assert.equal(f.api.getState().reason, 'unsupported body rig');
  assert.equal(f.api.getState().error, 'unsupported geometry');
  assert.equal(f.mesh.headPivot.visible, true);
  assert.equal(f.mesh.skinnedBody.geometry, f.geometry);
  assert.equal(f.mesh.skinnedBody.material, f.shadow);
  assert.equal(f.mesh.render(), 37);
  assert.equal(f.nativeCalls(), 1);
  f.api.destroy();
  assert.equal(f.mesh.render, f.nativeRender);
  assert.equal(f.mesh.skinnedBody.__mfFirstPersonGeometry, undefined);
});

function heldMesh(f, parent) {
  return attach(parent, Object.assign(node(), { geometry: new Geometry([0]), material: f.skin }));
}

test('model arms replace only the HUD arm and keep its sway and skin-layer children intact', () => {
  const f = fixture({ hands: true });
  const child = attach(f.hud.rightArm, node());
  const animation = f.hud.updateArmAnimation;
  const originalGeometry = f.hud.rightArm.geometry;
  f.api.configure({ enabled: true });
  assert.equal(f.hud.rightArm.visible, false);
  assert.equal(f.mesh.leftShoulder.visible, true);
  assert.equal(f.mesh.rightShoulder.visible, true);
  assert.equal(child.visible, true);
  assert.equal(f.hud.updateArmAnimation, animation);
  assert.equal(f.hud.rightArm.geometry, originalGeometry);
  assert.equal(f.api.getState().handRendererFound, true);
  assert.equal(f.hud.update(true), 19);
  assert.equal(f.hud.rightArm.visible, false);
  assert.equal(f.hudCalls(), 2);
  f.mesh.render();
  f.api.configure({ enabled: false });
  assert.equal(f.hud.rightArm.visible, true);
  assert.equal(f.hud.update, f.nativeHudUpdate);
  assert.equal(f.hud.updateArmAnimation, animation);
  assert.equal(child.visible, true);
  assert.equal(originalGeometry.disposed, false);
});

test('drawn main and offhand world items replace their HUD copies without duplicated arms', () => {
  const f = fixture({ hands: true });
  f.player.activeStack = { item: { name: 'stone' } };
  f.player.offStack = { item: { name: 'shield' } };
  const main = heldMesh(f, f.mesh.rightHand), off = heldMesh(f, f.mesh.leftHand);
  f.hud.update();
  f.api.configure({ enabled: true });
  assert.equal(f.hud.rightArm.visible, false);
  assert.equal(f.hud.item.visible, false);
  assert.equal(f.hud.offHandSwing.visible, false);
  assert.equal(f.mesh.rightHand.visible, true);
  assert.equal(f.mesh.leftHand.visible, true);
  assert.equal(main.visible, true);
  assert.equal(off.visible, true);
  assert.equal(f.api.getState().mainItemMode, 'model');
  assert.equal(f.api.getState().offItemMode, 'model');
  f.api.configure({ enabled: false });
  assert.equal(f.hud.item.visible, true);
  assert.equal(f.hud.offHandSwing.visible, true);
  assert.equal(main.geometry.disposed, false);
  assert.equal(off.geometry.disposed, false);
});

test('HUD items remain available while their world geometry or texture is missing', () => {
  for (const invalid of ['missing', 'hidden', 'vertices', 'indices', 'drawRange', 'image', 'loading', 'parent']) {
    const f = fixture({ hands: true });
    f.player.activeStack = { item: { name: 'stone' } };
    f.player.offStack = { item: { name: 'sign' } };
    if (invalid !== 'missing') {
      const main = heldMesh(f, f.mesh.rightHand);
      main.material = { map: { image: { width: 64, height: 64, complete: true } } };
      if (invalid === 'hidden') main.visible = false;
      if (invalid === 'vertices') main.geometry.attributes.position.count = 0;
      if (invalid === 'indices') main.geometry.setIndex([]);
      if (invalid === 'drawRange') main.geometry.setDrawRange(0, 0);
      if (invalid === 'image') main.material.map.image.width = 0;
      if (invalid === 'loading') main.material.map.image.complete = false;
      if (invalid === 'parent') {
        f.mesh.rightHand.children.splice(f.mesh.rightHand.children.indexOf(main), 1);
        const group = attach(f.mesh.rightHand, Object.assign(node(), { visible: false }));
        attach(group, main);
      }
    }
    f.hud.update();
    f.api.configure({ enabled: true });
    assert.equal(f.api.getState().handsMode, 'model', invalid);
    assert.equal(f.hud.rightArm.visible, false, invalid);
    assert.equal(f.hud.item.visible, true, invalid);
    assert.equal(f.hud.offHandSwing.visible, true, invalid);
    assert.equal(f.api.getState().mainItemMode, 'overlay', invalid);
    assert.equal(f.api.getState().offItemMode, 'overlay', invalid);
  }
});

test('HUD update restores before native slot changes and never revives a removed item', () => {
  const nativeItemFlags = [];
  const f = fixture({ hands: true, onHudUpdate: hud => nativeItemFlags.push(hud.item.visible) });
  const held = heldMesh(f, f.mesh.rightHand);
  f.player.activeStack = { item: { name: 'stone' } };
  f.hud.update();
  f.api.configure({ enabled: true });
  assert.equal(f.hud.item.visible, false);
  f.player.activeStack = null;
  held.visible = false;
  f.hud.update();
  f.mesh.render();
  assert.equal(nativeItemFlags.at(-1), false);
  assert.equal(f.hud.item.visible, false);
  assert.equal(f.api.getState().mainItemMode, 'none');
  f.api.configure({ enabled: false });
  assert.equal(f.hud.item.visible, false);
  assert.equal(f.hud.rightArm.visible, true);
  assert.equal(f.hud.update, f.nativeHudUpdate);
});

test('F5 and freecam release the HUD hook and restore the unmodified third-person model', () => {
  const f = fixture({ hands: true, nativeVisibilityInRender: false });
  const baseline = { ...f.mesh.position }, bodyYaw = { ...f.mesh.body.quaternion };
  f.api.configure({ enabled: true });
  f.player.perspective = 1;
  f.hud.update();
  f.player.nativeVisibility();
  f.mesh.render();
  assert.equal(f.hud.rightArm.visible, false, 'native third person keeps the overlay hidden');
  assert.equal(f.hud.update, f.nativeHudUpdate);
  assert.deepEqual(f.mesh.position, baseline);
  assert.deepEqual(f.mesh.body.quaternion, bodyYaw);
  f.player.perspective = 0;
  f.hud.update();
  f.player.nativeVisibility();
  f.mesh.render();
  assert.equal(f.hud.rightArm.visible, false, 'first person is back to the real arms');
  f.sandbox.MF_FREECAM = { active: true };
  f.mesh.render();
  assert.equal(f.hud.update, f.nativeHudUpdate);
  assert.equal(f.hud.rightArm.visible, true);
  assert.deepEqual(f.mesh.position, baseline);
});

test('native hand compatibility remains explicit and restores complete model arms on switching back', () => {
  const f = fixture({ hands: true });
  f.api.configure({ enabled: true });
  const fullArms = f.mesh.skinnedBody.geometry;
  f.api.configure({ nativeHands: true });
  assert.equal(f.hud.rightArm.visible, true);
  assert.equal(f.hud.update, f.nativeHudUpdate);
  assert.equal(f.mesh.rightHand.visible, false);
  assert.equal(f.mesh.leftShoulder.visible, false);
  assert.deepEqual([...f.mesh.skinnedBody.geometry.index.array], [0, 1, 2, 12, 13, 14]);
  assert.equal(fullArms.disposed, true);
  f.api.configure({ nativeHands: false });
  assert.equal(f.hud.rightArm.visible, false);
  assert.equal(f.mesh.rightHand.visible, true);
  assert.equal(f.mesh.leftShoulder.visible, true);
  assert.equal(f.mesh.skinnedBody.geometry.index.count, 12);
});

test('partial unsupported rigs keep the original HUD hand even when a held world item exists', () => {
  const f = fixture({ hands: true });
  f.mesh.skinnedBody.skeleton.bones = [f.mesh.torso, f.mesh.headPivot];
  const item = heldMesh(f, f.mesh.rightHand);
  f.api.configure({ enabled: true });
  assert.equal(f.api.getState().handsMode, 'native-overlay');
  assert.equal(f.hud.rightArm.visible, true);
  assert.equal(f.hud.update, f.nativeHudUpdate);
  assert.equal(item.visible, true);
});

test('yaw alignment and eye clearance are visual-only and never accumulate over native frames', () => {
  const f = fixture({ hands: true });
  f.mesh.neck.quaternion = { x: 0, y: Math.sin(0.3), z: 0, w: Math.cos(0.3) };
  f.mesh.neck.localToWorld = point => Object.assign(point, { x: point.x + f.mesh.position.x,
    y: point.y + f.mesh.position.y + 1.41125, z: point.z + f.mesh.position.z });
  const root = { x: f.mesh.position.x, y: f.mesh.position.y, z: f.mesh.position.z };
  const body = { ...f.mesh.body.quaternion }, eyes = { ...f.camera.position };
  const player = { ...f.player.pos };
  f.api.configure({ enabled: true });
  const filtered = f.mesh.skinnedBody.geometry;
  for (let frame = 0; frame < 80; frame++) {
    f.hud.update();
    f.mesh.render();
    assert.deepEqual(f.seenPosition(), root);
    assert.deepEqual(f.seenBodyQuaternion(), body);
    assert.deepEqual(f.mesh.body.quaternion, f.mesh.neck.quaternion);
    assert.ok(Math.abs(f.mesh.position.y + 0.04125) < 1e-9);
    assert.equal(f.mesh.position.z, 0.21);
    assert.equal(f.mesh.skinnedBody.geometry, filtered);
    assert.deepEqual(f.camera.position, eyes);
    assert.deepEqual(f.player.pos, player);
  }
  f.player.yaw = Math.PI / 2;
  f.mesh.render();
  assert.ok(Math.abs(f.mesh.position.x - 0.21) < 1e-9);
  assert.ok(Math.abs(f.mesh.position.z) < 1e-9);
  f.api.configure({ enabled: false });
  assert.equal(f.mesh.position.x, root.x);
  assert.equal(f.mesh.position.y, root.y);
  assert.equal(f.mesh.position.z, root.z);
  assert.deepEqual(f.mesh.body.quaternion, body);
});

test('model clearance respects crouch, custom scale, mounts, gliding and emotes', () => {
  const f = fixture();
  f.mesh.scale = vector(0.1, 0.1, 0.1);
  f.mesh.skeleton.scale = vector(0.95, 0.95, 0.95);
  f.mesh.neck.localToWorld = point => Object.assign(point, { y: point.y + 0.4 });
  f.api.configure({ enabled: true });
  assert.ok(Math.abs(f.mesh.position.z - 0.021) < 1e-9);
  assert.equal(f.mesh.position.y, 0, 'a crouched/shorter head does not lift the body to the camera');
  f.mesh.neck.localToWorld = point => Object.assign(point, { y: point.y + 8 });
  f.mesh.render();
  assert.ok(Math.abs(f.mesh.position.y + 0.008) < 1e-9, 'eye correction stays bounded to model scale');
  for (const field of ['mount', 'glide', 'emote']) {
    f.player.ridingEntity = field === 'mount' ? {} : null;
    f.mesh.glideAmount = field === 'glide' ? 1 : 0;
    f.mesh.emoteAmount = field === 'emote' ? 1 : 0;
    f.mesh.render();
    assert.equal(f.mesh.position.x, 0);
    assert.equal(f.mesh.position.y, 0);
    assert.equal(f.mesh.position.z, 0);
    assert.equal(f.api.getState().bodyOffset, null);
  }
});

test('extra neck clearance stays behind the view for every yaw without changing camera pitch or player position', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = fixture();
    f.player.yaw = yaw;
    const eyes = { ...f.camera.position }, player = { ...f.player.pos }, orientation = { ...f.camera.quaternion };
    f.api.configure({ enabled: true });
    for (const pitch of [-1.3, 0, 1.3]) {
      f.player.pitch = pitch;
      f.mesh.render();
      const offset = f.api.getState().bodyOffset;
      assert.ok(Math.abs(offset.x * Math.sin(yaw) + offset.z * Math.cos(yaw) - 0.21) < 1e-9);
      assert.ok(Math.abs(offset.x * Math.cos(yaw) - offset.z * Math.sin(yaw)) < 1e-9);
      assert.deepEqual(f.camera.position, eyes);
      assert.deepEqual(f.camera.quaternion, orientation);
      assert.deepEqual(f.player.pos, player);
      assert.equal(f.mesh.leftShoulder.visible, true);
      assert.equal(f.mesh.rightShoulder.visible, true);
    }
    f.api.configure({ enabled: false });
    assert.equal(f.mesh.position.x, 0);
    assert.equal(f.mesh.position.y, 0);
    assert.equal(f.mesh.position.z, 0);
  }
});

test('a shared neck ancestor never causes body or arm triangles to disappear', () => {
  const f = fixture();
  f.mesh.skeleton.children.splice(f.mesh.skeleton.children.indexOf(f.mesh.body), 1);
  attach(f.mesh.neck, f.mesh.body);
  f.api.configure({ enabled: true });
  assert.deepEqual([...f.mesh.skinnedBody.geometry.index.array], [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14]);
  assert.equal(f.mesh.headPivot.visible, false);
  assert.equal(f.mesh.torso.visible, true);
  assert.equal(f.mesh.leftShoulder.visible, true);
});

test('native attack and walking arm poses remain unchanged while the body follows the view yaw', () => {
  const f = fixture({ onNativeRender: mesh => {
    mesh.leftShoulder.rotation = { x: 0.2, y: 0, z: -0.1 };
    mesh.rightShoulder.rotation = { x: 0.7, y: 0, z: 0.2 };
  } });
  f.api.configure({ enabled: true });
  f.mesh.render();
  assert.deepEqual(f.mesh.leftShoulder.rotation, { x: 0.2, y: 0, z: -0.1 });
  assert.deepEqual(f.mesh.rightShoulder.rotation, { x: 0.7, y: 0, z: 0.2 });
  assert.equal(f.mesh.skinnedBody.geometry.index.count, 12);
});

test('destroy and reinjection restore all HUD methods and scoped model transforms', () => {
  const f = fixture({ hands: true });
  f.api.configure({ enabled: true });
  const hooked = f.hud.update;
  assert.notEqual(hooked, f.nativeHudUpdate);
  vm.runInNewContext(source, f.sandbox);
  assert.equal(f.hud.update, f.nativeHudUpdate);
  assert.equal(f.hud.rightArm.visible, true);
  assert.equal(f.mesh.position.y, 0);
  assert.equal(f.mesh.position.z, 0);
  const nextApi = f.sandbox.MF_RealisticFirstPerson;
  nextApi.configure({ enabled: true });
  assert.notEqual(f.hud.update, hooked, 'reloading creates one fresh hook, not a chain of old wrappers');
  nextApi.destroy();
  assert.equal(f.hud.update, f.nativeHudUpdate);
  assert.equal(f.hud.rightArm.visible, true);
  assert.equal(f.timers.size, 0);
});
