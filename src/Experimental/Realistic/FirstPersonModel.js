(() => {
  'use strict';

  const FIRST_PERSON_MODEL_VERSION = 3;
  const CONFIG_EVENT = 'minifeather:realistic-config';
  const W = globalThis;
  try { W.MF_RealisticFirstPerson?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    nativeHands: false,
    active: false,
    reason: 'disabled',
    game: null,
    mesh: null,
    hook: null,
    handHook: null,
    modelHands: false,
    mainItemMode: 'none',
    offItemMode: 'none',
    bodyOffset: null,
    timer: 0,
    renderCount: 0,
    error: '',
    destroyed: false,
    lastGameScan: -Infinity,
    visibility: new Map(),
    handVisibility: new Map(),
    transforms: new Map(),
    materials: new Map(),
    geometry: new Map()
  };

  const isGame = value => !!(value?.player && value?.world);

  function findGame() {
    for (const game of [W.__MINIBLOX_GAME__, W.__MB?.game, W.Game, W.game, W.miniblox, W.miniblox?.game]) {
      if (isGame(game)) return (state.game = game);
    }
    const now = W.performance?.now?.() ?? Date.now();
    if (now - state.lastGameScan < 1200) return isGame(state.game) ? state.game : null;
    state.lastGameScan = now;
    const root = document.querySelector?.('#react') || document.querySelector?.('#root');
    if (!root) return null;
    for (const key of Object.keys(root)) {
      if (!/^__react(Fiber|Container|InternalInstance)\$/.test(key)) continue;
      const queue = [root[key]], visited = new Set();
      for (let index = 0; index < queue.length && index < 1000; index++) {
        const fiber = queue[index];
        if (!fiber || visited.has(fiber)) continue;
        visited.add(fiber);
        const candidates = [fiber.stateNode, fiber.memoizedProps, fiber.pendingProps, fiber.memoizedState,
          fiber.updateQueue?.baseState?.element?.props];
        for (const candidate of candidates) {
          if (isGame(candidate)) return (state.game = candidate);
          if (isGame(candidate?.game)) return (state.game = candidate.game);
        }
        if (fiber.child) queue.push(fiber.child);
        if (fiber.sibling) queue.push(fiber.sibling);
        if (fiber.return) queue.push(fiber.return);
      }
    }
    return null;
  }

  function localMesh(game) {
    const player = game?.player;
    if (!player) return null;
    for (const getter of [
      () => game.world.getPlayerById?.(player.id),
      () => game.world.players?.get?.(player.id),
      () => game.world.entities?.get?.(player.id),
      () => player
    ]) {
      try { const mesh = getter()?.mesh; if (mesh?.skeleton && typeof mesh.render === 'function') return mesh; } catch (_) {}
    }
    return null;
  }

  function collect(root) {
    const objects = [], queue = [root], seen = new Set();
    for (let index = 0; index < queue.length && index < 260; index++) {
      const object = queue[index];
      if (!object || seen.has(object)) continue;
      seen.add(object); objects.push(object);
      if (Array.isArray(object.children)) queue.push(...object.children);
    }
    return objects;
  }

  function eligibility(game, mesh) {
    const player = game?.player;
    if (!state.enabled || state.destroyed) return 'disabled';
    if (!player || !mesh) return 'waiting for player';
    if (Number(player.perspective) !== 0) return 'third person';
    if (W.MF_FREECAM?.active) return 'freecam';
    if (mesh.renderArmorOnly === true) return 'invisible player';
    if (player.sleeping || player.dead || player.deathTime > 0) return 'inactive player';
    try {
      if (player.getHealth?.() <= 0 || player.mode?.isSpectator?.() || player.isSpectator?.() ||
        player.isSpectatingOtherPlayer?.()) return 'spectator';
      if (typeof game.inGame === 'function' && !game.inGame()) return 'outside world';
    } catch (_) { return 'waiting for player'; }
    const camera = game.gameScene?.camera || game.gameScene?.axesHelper?.parent;
    const position = player.pos || player.position;
    if (camera?.getWorldPosition && camera.position?.clone && position) {
      try {
        const point = camera.getWorldPosition(camera.position.clone());
        const distance = Math.hypot(point.x - position.x, point.z - position.z);
        if (distance > Math.max(1.5, Number(player.width || 0.6) * 3)) return 'detached camera';
      } catch (_) { return 'waiting for camera'; }
    }
    if (mesh.model?.foldHead && !mesh.skinnedBody?.geometry?.attributes?.skinIndex) return 'unsupported head rig';
    return '';
  }

  function visibility(object, value) {
    if (!object || object.visible === value) return;
    if (!state.visibility.has(object)) state.visibility.set(object, { before: object.visible, applied: value });
    else state.visibility.get(object).applied = value;
    object.visible = value;
  }

  function transform(target, values) {
    if (!target || Object.keys(values).some(key => !Number.isFinite(target[key]) || !Number.isFinite(values[key]))) return;
    const before = {}, applied = {};
    for (const [key, value] of Object.entries(values)) { before[key] = target[key]; applied[key] = value; }
    state.transforms.set(target, { before, applied });
    Object.assign(target, applied);
  }

  function restoreFrame() {
    for (const [object, saved] of state.visibility) {
      if (object.visible === saved.applied) object.visible = saved.before;
    }
    state.visibility.clear();
    for (const [object, saved] of state.materials) {
      // Native visibility runs before entity render. Switching perspective or
      // disabling shadows restores the skin and clears this native snapshot;
      // never put the old shadow-only material back after that transition.
      if (object.material === saved.applied && object.__realMaterial === saved.applied) object.material = saved.before;
    }
    state.materials.clear();
    for (const [target, saved] of state.transforms) {
      // Do not undo a pose supplied by another renderer/module after ours.
      if (Object.keys(saved.applied).every(key => target[key] === saved.applied[key])) Object.assign(target, saved.before);
    }
    state.transforms.clear();
    for (const [object, binding] of state.geometry) {
      if (object.geometry === binding.filtered) object.geometry = binding.source;
    }
    if (state.mesh) state.mesh.__mfFirstPersonActive = false;
    state.active = false;
    state.modelHands = false;
    state.bodyOffset = null;
  }

  function releaseBinding(object, binding) {
    if (object.geometry === binding.filtered) object.geometry = binding.source;
    if (object.__mfFirstPersonGeometry === binding) delete object.__mfFirstPersonGeometry;
    try { binding.filtered?.dispose?.(); } catch (_) {}
  }

  function releaseGeometry() {
    for (const [object, binding] of state.geometry) releaseBinding(object, binding);
    state.geometry.clear();
  }

  function isUnder(bone, root) {
    for (let node = bone, depth = 0; node && depth < 30; node = node.parent, depth++) {
      if (node === root) return true;
    }
    return false;
  }

  function hideBones(mesh, bones) {
    const head = [mesh.headPivot].filter(Boolean);
    const neckOwnsBody = [mesh.body, mesh.torso, mesh.leftShoulder, mesh.rightShoulder, mesh.leftHip, mesh.rightHip]
      .some(part => part && isUnder(part, mesh.neck));
    if (mesh.neck && !neckOwnsBody && !bones.some(bone => head.some(root => isUnder(bone, root)))) head.push(mesh.neck);
    const arms = state.nativeHands ? [mesh.leftShoulder, mesh.rightShoulder,
      mesh.leftShoulderJoint, mesh.rightShoulderJoint, mesh.leftElbowJoint, mesh.rightElbowJoint].filter(Boolean) : [];
    const roots = [...head, ...arms];
    const hidden = new Set();
    for (let index = 0; index < bones.length; index++) {
      if (roots.some(root => isUnder(bones[index], root))) hidden.add(index);
    }
    return hidden;
  }

  function filterGeometry(object, mesh) {
    const bones = object.skeleton?.bones;
    let binding = state.geometry.get(object);
    let source = binding?.source || object.geometry;
    if (binding && object.geometry !== binding.filtered && object.geometry !== binding.source) {
      source = object.geometry;
      binding.source = source;
    }
    const attribute = source?.attributes?.skinIndex;
    if (!Array.isArray(bones) || !attribute || !source.clone || !source.setIndex) return;
    const hidden = hideBones(mesh, bones);
    if (!hidden.size) return;
    const key = [...hidden].join(',');
    if (!binding) {
      binding = { source, filtered: null, filteredSource: null, key: '' };
      state.geometry.set(object, binding);
      object.__mfFirstPersonGeometry = binding;
    }
    if (binding.filteredSource !== source || binding.key !== key) {
      try { binding.filtered?.dispose?.(); } catch (_) {}
      binding.filtered = null;
      binding.source = source;
      binding.filteredSource = source;
      binding.key = key;
      const weights = source.attributes.skinWeight;
      const read = (attr, index, component) => attr.array?.[index * attr.itemSize + component] ??
        [attr.getX, attr.getY, attr.getZ, attr.getW][component]?.call(attr, index);
      const hiddenVertex = index => {
        for (let component = 0; component < Math.min(4, attribute.itemSize); component++) {
          if (hidden.has(read(attribute, index, component)) && (!weights || read(weights, index, component) > 0.0001)) return true;
        }
        return false;
      };
      const originalIndex = source.index;
      const count = originalIndex?.count ?? source.attributes.position?.count ?? 0;
      const readIndex = index => originalIndex ? originalIndex.array?.[index] ?? originalIndex.getX(index) : index;
      const indices = [];
      for (let index = 0; index + 2 < count; index += 3) {
        const a = readIndex(index), b = readIndex(index + 1), c = readIndex(index + 2);
        if (!hiddenVertex(a) && !hiddenVertex(b) && !hiddenVertex(c)) indices.push(a, b, c);
      }
      if (indices.length < count) {
        const filtered = source.clone();
        filtered.setIndex(indices);
        // Rebuild material groups in the filtered triangle order rather than reusing old offsets.
        if (Array.isArray(source.groups) && source.groups.length && filtered.clearGroups && filtered.addGroup) {
          filtered.clearGroups();
          let output = 0;
          for (const group of source.groups) {
            const start = output;
            const end = Math.min(count, group.start + group.count);
            for (let index = group.start; index + 2 < end; index += 3) {
              if (!hiddenVertex(readIndex(index)) && !hiddenVertex(readIndex(index + 1)) && !hiddenVertex(readIndex(index + 2))) output += 3;
            }
            if (output > start) filtered.addGroup(start, output - start, group.materialIndex);
          }
        }
        filtered.setDrawRange?.(0, indices.length);
        binding.filtered = filtered;
      }
    }
    if (binding.filtered) object.geometry = binding.filtered;
  }

  function restoreNativeMaterials(objects) {
    for (const object of objects) {
      if (object.__realMaterial && object.material !== object.__realMaterial) {
        state.materials.set(object, { before: object.material, applied: object.__realMaterial });
        object.material = object.__realMaterial;
      }
    }
  }

  function retainMaterialUpdates() {
    for (const [object, saved] of state.materials) {
      if (object.material && object.material !== saved.applied && object.material !== saved.before) {
        // Armor and skin can replace their material during native animation/render updates.
        object.__realMaterial = object.material;
        saved.applied = object.material;
      }
    }
  }

  function findHandRenderer(game) {
    for (const camera of [game?.gameScene?.axesHelper?.parent, game?.gameScene?.camera]) {
      for (const child of camera?.children || []) {
        if (typeof child?.update === 'function' && typeof child.updateArmAnimation === 'function' && child.item && child.rightArm) return child;
      }
    }
    return null;
  }

  function restoreHandVisibility() {
    for (const [object, saved] of state.handVisibility) {
      if (object.visible === saved.applied) object.visible = saved.before;
    }
    state.handVisibility.clear();
    state.mainItemMode = 'none';
    state.offItemMode = 'none';
  }

  function handVisibility(object, value) {
    if (!object || object.visible === value) return;
    state.handVisibility.set(object, { before: object.visible, applied: value });
    object.visible = value;
  }

  function detachHandRenderer() {
    restoreHandVisibility();
    const hook = state.handHook;
    if (hook && hook.renderer.update === hook.wrapper) hook.renderer.update = hook.original;
    state.handHook = null;
  }

  function drawable(root, excluded = []) {
    const queue = [root], seen = new Set();
    for (let index = 0; index < queue.length && index < 100; index++) {
      const object = queue[index];
      if (!object || seen.has(object) || object.visible === false || excluded.includes(object)) continue;
      seen.add(object);
      const material = object.__realMaterial || object.material;
      const materials = Array.isArray(material) ? material : [material];
      const geometry = object.geometry;
      const triangles = geometry?.attributes?.position?.count >= 3 &&
        (geometry.index == null || geometry.index.count >= 3) && (geometry.drawRange?.count ?? Infinity) >= 3 &&
        (!object.isInstancedMesh || object.count > 0);
      if ((triangles || object.isSprite) && materials.some(value => {
        if (!value || value.visible === false || value.colorWrite === false || value.opacity === 0) return false;
        if (!value.map) return true;
        const image = value.map.image;
        return !!image && image.complete !== false && image.width > 0 && image.height > 0;
      })) return true;
      if (Array.isArray(object.children)) queue.push(...object.children);
    }
    return false;
  }

  function hasModelArms(mesh) {
    const bones = mesh.skinnedBody?.skeleton?.bones;
    return [mesh.leftShoulder, mesh.rightShoulder].every(shoulder => shoulder &&
      ((Array.isArray(bones) && mesh.skinnedBody?.geometry?.attributes?.position?.count > 0 && bones.some(bone => isUnder(bone, shoulder))) ||
        drawable(shoulder, [mesh.leftHand, mesh.rightHand])));
  }

  function maskHands(game, mesh, renderer) {
    restoreHandVisibility();
    if (state.nativeHands || !hasModelArms(mesh)) return;
    handVisibility(renderer.rightArm, false);
    handVisibility(renderer.leftArm, false);
    // Only replace a HUD object with a drawable world copy. An empty hand,
    // loading texture or unsupported offhand TESR must not hide an item.
    const main = drawable(mesh.rightHand), off = drawable(mesh.leftHand);
    if (main) handVisibility(renderer.item, false);
    if (off) handVisibility(renderer.offHandSwing, false);
    state.mainItemMode = main ? 'model' : renderer.item.visible ? 'overlay' : 'none';
    state.offItemMode = off ? 'model' : renderer.offHandSwing?.visible ? 'overlay' : 'none';
  }

  function synchronizeHands(game, mesh) {
    state.modelHands = !state.nativeHands && hasModelArms(mesh);
    const renderer = state.modelHands ? findHandRenderer(game) : null;
    if (renderer !== state.handHook?.renderer) {
      detachHandRenderer();
      if (renderer) {
        const original = renderer.update;
        const wrapper = function () {
          // The HUD updates before entity render. Restore before that update,
          // not after it, so slot changes/F5 never revive a stale HUD item.
          restoreHandVisibility();
          const result = original.apply(this, arguments);
          try {
            if (state.enabled && !state.destroyed && state.handHook?.renderer === this &&
              state.mesh && !eligibility(state.game, state.mesh)) maskHands(state.game, state.mesh, this);
          } catch (_) { restoreHandVisibility(); }
          return result;
        };
        state.handHook = { renderer, original, wrapper };
        renderer.update = wrapper;
      }
    }
    if (renderer) maskHands(game, mesh, renderer);
  }

  function alignModel(game, mesh) {
    const player = game.player;
    if (player.ridingEntity || mesh.entity?.ridingEntity || mesh.glideAmount > 0.001 || mesh.emoteAmount > 0.02) return;
    const yaw = Number(player.yaw);
    const position = mesh.position;
    const camera = game.gameScene?.camera;
    if (!position || !Number.isFinite(yaw)) return;
    const scale = Math.abs(Number(mesh.scale?.x ?? 1) * Number(mesh.skeleton?.scale?.x ?? 0.95) / 0.95);
    if (!(scale > 0) || !Number.isFinite(scale)) return;
    let dy = -0.035 * scale;
    // The native eye is just below the middle of the head, not at the neck.
    // Measure a yaw-only anchor so looking up/down cannot pump the body height.
    if (mesh.neck?.localToWorld && camera?.getWorldPosition && position.clone) {
      const eye = position.clone(), anchor = position.clone();
      anchor.x = 0; anchor.y = 0.25; anchor.z = 0;
      mesh.neck.localToWorld(anchor);
      camera.getWorldPosition(eye);
      if (Number.isFinite(eye.y - anchor.y)) dy = Math.max(-0.08 * scale, Math.min(0, eye.y - anchor.y));
    }
    const dx = Math.sin(yaw) * 0.13 * scale, dz = Math.cos(yaw) * 0.13 * scale;
    let local = { x: position.x + dx, y: position.y + dy, z: position.z + dz };
    if (position.clone && mesh.getWorldPosition && mesh.parent?.worldToLocal) {
      local = mesh.getWorldPosition(position.clone());
      local.x += dx; local.y += dy; local.z += dz;
      mesh.parent.worldToLocal(local);
    }
    transform(position, { x: local.x, y: local.y, z: local.z });
    if (mesh.body?.quaternion && mesh.neck?.quaternion && mesh.body.parent === mesh.neck.parent) {
      const q = mesh.neck.quaternion;
      transform(mesh.body.quaternion, { x: q.x, y: q.y, z: q.z, w: q.w });
    }
    state.bodyOffset = { x: dx, y: dy, z: dz };
  }

  function applyFrame(game, mesh) {
    state.reason = eligibility(game, mesh);
    if (state.reason) { detachHandRenderer(); return; }
    visibility(mesh, true);
    // The native visibility/LOD controller can hide body meshes independently
    // from the player root. Showing only that root never unhides its children.
    visibility(mesh.skeleton, true);
    visibility(mesh.body, true);
    visibility(mesh.skinnedBody, true);
    visibility(mesh.lodBody, false);
    for (const object of Object.values(mesh.lodArmor || {})) visibility(object, false);
    for (const object of Object.values(mesh.skinnedRig || {})) visibility(object, true);
    if (!mesh.skinnedBody) {
      for (const [name, object] of Object.entries(mesh.meshes || {})) {
        if (/torso|leg/i.test(name)) visibility(object, true);
      }
    }
    for (const [name, object] of Object.entries(mesh.skinnedArmor || {})) {
      if (name !== 'helmet' && object.userData?._equipped === true) visibility(object, true);
    }
    visibility(mesh.headPivot, false);
    visibility(mesh.meshes?.head, false);
    visibility(mesh.skinnedArmor?.helmet, false);
    visibility(mesh.armorMesh?.helmet, false);
    visibility(mesh.playerHeadMesh, false);
    visibility(mesh.pumpkinHeadMesh, false);
    if (state.nativeHands) {
      visibility(mesh.leftShoulder, false);
      visibility(mesh.rightShoulder, false);
      visibility(mesh.leftHand, false);
      visibility(mesh.rightHand, false);
    } else {
      visibility(mesh.leftShoulder, true);
      visibility(mesh.rightShoulder, true);
      visibility(mesh.leftHand, true);
      visibility(mesh.rightHand, true);
    }
    const objects = collect(mesh), live = new Set(objects);
    for (const [object, binding] of state.geometry) {
      if (!live.has(object)) { releaseBinding(object, binding); state.geometry.delete(object); }
    }
    restoreNativeMaterials(objects);
    for (const object of objects) {
      if (object.isSkinnedMesh || (object.geometry?.attributes?.skinIndex && object.skeleton?.bones)) filterGeometry(object, mesh);
    }
    alignModel(game, mesh);
    synchronizeHands(game, mesh);
    state.active = true;
    mesh.__mfFirstPersonActive = true;
  }

  function applySafely(game, mesh) {
    try {
      applyFrame(game, mesh);
      state.error = '';
    } catch (error) {
      restoreFrame();
      detachHandRenderer();
      state.reason = 'unsupported body rig';
      state.error = String(error?.message || error).slice(0, 200);
    }
  }

  function nativeVisibility(game) {
    const player = game?.player;
    if (!player) return;
    let target = player;
    const visited = new Set();
    for (let depth = 0; target && depth < 8; target = Object.getPrototypeOf(target), depth++) {
      for (const name of Object.getOwnPropertyNames(target)) {
        if (name === 'constructor' || visited.has(name)) continue;
        visited.add(name);
        const descriptor = Object.getOwnPropertyDescriptor(target, name);
        const method = descriptor?.value;
        if (typeof method !== 'function') continue;
        const source = Function.prototype.toString.call(method);
        if (source.includes('__realMaterial') && source.includes('perspective')) {
          try { method.call(player); } catch (_) {}
          return;
        }
      }
    }
  }

  function detach() {
    restoreFrame();
    detachHandRenderer();
    releaseGeometry();
    const hook = state.hook;
    if (hook && hook.mesh.render === hook.wrapper) hook.mesh.render = hook.original;
    if (state.mesh) delete state.mesh.__mfFirstPersonActive;
    state.mesh = null;
    state.hook = null;
    nativeVisibility(state.game);
  }

  function sync() {
    if (state.destroyed) return;
    if (!state.enabled) {
      if (state.mesh) detach();
      state.reason = 'disabled';
      return;
    }
    const game = findGame(), mesh = localMesh(game);
    if (!mesh || mesh !== state.mesh) {
      detach();
      state.game = game;
      if (!mesh) { state.reason = 'waiting for player'; return; }
      const original = mesh.render;
      const wrapper = function () {
        state.renderCount++;
        const wasActive = state.active;
        restoreFrame();
        if (!eligibility(state.game, this)) restoreNativeMaterials(collect(this));
        else if (wasActive) nativeVisibility(state.game);
        const result = original.apply(this, arguments);
        retainMaterialUpdates();
        if (state.enabled && !state.destroyed && state.mesh === this) applySafely(state.game, this);
        return result;
      };
      state.mesh = mesh;
      state.hook = { mesh, original, wrapper };
      mesh.render = wrapper;
    }
    const wasActive = state.active;
    restoreFrame();
    if (wasActive && eligibility(game, mesh)) nativeVisibility(game);
    applySafely(game, mesh);
  }

  function configure(config) {
    if (state.destroyed || !config || typeof config !== 'object') return;
    if ('enabled' in config) state.enabled = !!config.enabled;
    if ('nativeHands' in config) state.nativeHands = !!config.nativeHands;
    if (state.enabled && !state.timer) state.timer = W.setInterval(sync, 700);
    if (!state.enabled && state.timer) { W.clearInterval(state.timer); state.timer = 0; }
    sync();
  }

  function onConfig(event) {
    let config = event.detail;
    if (typeof config === 'string') try { config = JSON.parse(config); } catch (_) { return; }
    if (!config || typeof config !== 'object' || typeof config.enabled !== 'boolean') return;
    // Also listen directly: an older hot-updated Realistic controller may not
    // yet call this companion API, but the saved UI configuration is canonical.
    configure({ enabled: config.enabled && config.firstPersonBody !== false });
  }

  function destroy() {
    if (state.destroyed) return;
    state.enabled = false;
    if (state.timer) W.clearInterval(state.timer);
    state.timer = 0;
    detach();
    state.destroyed = true;
    document.removeEventListener?.(CONFIG_EVENT, onConfig, true);
    if (W.MF_RealisticFirstPerson === api) delete W.MF_RealisticFirstPerson;
  }

  const api = Object.freeze({
    configure, sync, destroy,
    getState: () => ({ version: FIRST_PERSON_MODEL_VERSION, enabled: state.enabled, active: state.active, nativeHands: state.nativeHands,
      handsMode: state.modelHands ? 'model' : 'native-overlay', mainItemMode: state.mainItemMode, offItemMode: state.offItemMode,
      handRendererFound: !!state.handHook, bodyOffset: state.bodyOffset,
      reason: state.reason, error: state.error, renderCount: state.renderCount,
      hooked: !!state.hook && state.hook.mesh.render === state.hook.wrapper,
      playerFound: !!state.mesh, bodyVisible: state.mesh?.skinnedBody?.visible ?? null,
      modelVisible: state.mesh?.visible ?? null, skeletonVisible: state.mesh?.skeleton?.visible ?? null,
      bodyTriangles: (state.mesh?.skinnedBody?.geometry?.index?.count ?? 0) / 3,
      materialColorWrite: (Array.isArray(state.mesh?.skinnedBody?.material) ? state.mesh.skinnedBody.material[0] : state.mesh?.skinnedBody?.material)?.colorWrite ?? null,
      filteredMeshes: [...state.geometry.values()].filter(binding => !!binding.filtered).length })
  });
  W.MF_RealisticFirstPerson = api;
  document.addEventListener?.(CONFIG_EVENT, onConfig, true);
})();
