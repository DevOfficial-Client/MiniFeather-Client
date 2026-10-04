(function () {
  'use strict';

  const KEY = '__MF_BARITONE_ADAPTER__';
  const instances = new Set();
  const INPUT_FIELDS = ['up', 'down', 'left', 'right', 'jump', 'sneak', 'sprint'];
  let nextId = 0;
  try { globalThis[KEY]?.destroy?.(); } catch (_) {}

  const finite = value => Number.isFinite(value);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
  const xyz = value => value && [value.x, value.y, value.z].every(finite)
    ? { x: value.x, y: value.y, z: value.z } : null;
  function source(fn) {
    try { return Function.prototype.toString.call(fn); } catch (_) { return ''; }
  }
  function methods(object) {
    const result = [], seen = new Set();
    for (let current = object, depth = 0; current && depth < 12; depth++, current = Object.getPrototypeOf(current)) {
      for (const name of Object.getOwnPropertyNames(current)) {
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);
        const descriptor = Object.getOwnPropertyDescriptor(current, name);
        if (typeof descriptor?.value === 'function') result.push({ name, fn: descriptor.value, source: source(descriptor.value) });
      }
    }
    return result;
  }
  function choose(object, parts, explicit) {
    const entries = methods(object);
    const match = entries.find(entry => parts.every(part => entry.source.includes(part)));
    if (match) return match.name;
    return explicit && typeof object?.[explicit] === 'function' ? explicit : '';
  }
  function values(object) {
    if (!object || typeof object !== 'object') return [];
    return Object.values(Object.getOwnPropertyDescriptors(object))
      .filter(descriptor => descriptor.value && typeof descriptor.value === 'object')
      .map(descriptor => descriptor.value);
  }
  function candidates(game) {
    const roots = [game, game?.player, game?.gameScene, game?.controls, game?.controller, game?.playerController].filter(Boolean);
    return [...new Set([...roots, ...roots.flatMap(values)])];
  }
  function unknown(reason = 'unknown') {
    return { known: false, air: false, passable: false, solid: true, liquid: false, hazard: true,
      replaceable: false, breakable: false, hardness: Infinity, name: '', collision: [], supportHeight: 1, height: 1, reason };
  }

  function create() {
    const id = `baritone-${++nextId}`;
    let game = null, player = null, world = null, movement = null, controller = null;
    let nativePosition = null, lookControls = null, hooked = false, destroyed = false;
    let desired = null, lastError = '', inputTicks = 0, inputMode = '', savedPlayer = null;
    let queuePatch = null, mining = null, lastInteract = 0, nativeMiningLoop = false;
    let mouseGain = .002, mousePending = null, mouseVerified = false, lastMouseResponse = 0, firstMouseRequest = 0;
    const keyboardHeld = new Set();
    const names = { left: '', right: '', ray: '', mine: '', reach: '' };

    function resolvePosition() {
      const hit = controller?.objectMouseOver?.block;
      const samples = [hit, world?.storedSpawnPoint, world?.spawnPoint];
      for (let ctor = world?.constructor, depth = 0; ctor && depth < 10; depth++, ctor = Object.getPrototypeOf(ctor)) {
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(ctor))) {
          if (descriptor.value && typeof descriptor.value === 'object') samples.push(descriptor.value);
        }
      }
      const sample = samples.find(value => xyz(value) && typeof value.getX === 'function' &&
        typeof value.up === 'function' && typeof value.down === 'function' && value.constructor !== Object);
      nativePosition = sample || null;
    }
    function position(x, y, z) {
      if (!nativePosition) resolvePosition();
      if (!nativePosition) return null;
      try {
        const result = new nativePosition.constructor(x, y, z);
        return result.constructor === nativePosition.constructor && xyz(result) &&
          result.x === x && result.y === y && result.z === z ? result : null;
      } catch (_) { return null; }
    }
    function resolveController() {
      controller = candidates(game).find(value => value.objectMouseOver &&
        (typeof value.leftClick === 'function' || methods(value).some(entry =>
          entry.source.includes('key.leftClick') && entry.source.includes('punch')))) || null;
      names.left = typeof controller?.leftClick === 'function' ? 'leftClick' : methods(controller)
        .find(entry => entry.name !== 'punch' && entry.source.includes('key.leftClick') && entry.source.includes('punch'))?.name || '';
      names.right = choose(controller, ['objectMouseOver', 'rightClickDelayTimer', 'getHeldItem'], 'rightClickMouse');
      names.ray = choose(controller, ['objectMouseOver=', 'getLook()', 'entities'], 'updateRayTrace');
      names.mine = choose(controller, ['currBreakingLocation', 'getPlayerRelativeBlockHardness'], 'mine');
      const callPattern = name => new RegExp(`this\\s*\\.\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
      nativeMiningLoop = !!names.mine && !!names.ray && methods(controller).some(entry =>
        entry.name !== names.left && entry.name !== names.mine &&
        callPattern(names.ray).test(entry.source) && callPattern(names.mine).test(entry.source));
      names.reach = methods(controller).find(entry =>
        /return\s+[\w$.]+\.abilities\.creative\s*\?\s*[\d.]+\s*:\s*[\d.]+\s*;?\s*\}/.test(entry.source))?.name || '';
      lookControls = candidates(game).find(value => finite(value.yaw) && finite(value.pitch) &&
        value.yawObject?.rotation && value.pitchObject?.rotation && methods(value).some(entry =>
          entry.source.includes('yawObject.rotation.y') && entry.source.includes('pitchObject.rotation.x') &&
          entry.source.includes('onLook'))) || null;
      resolvePosition();
    }
    function refresh() {
      if (!game?.player?.pos || !game.world || destroyed) return false;
      if (player !== game.player || world !== game.world) bind(game);
      return !!player;
    }
    function inputBlocked() {
      if (!game || game.chat?.showInput || game.chat?.inputOpen || player?.dead || player?.getHealth?.() <= 0) return true;
      if (game.info?.menus?.blocksGameplay === true) return true;
      try { if (typeof game.constructor?.isActive === 'function' && !game.constructor.isActive(false)) return true; } catch (_) { return true; }
      try {
        const active = document.activeElement;
        if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return true;
      } catch (_) {}
      return false;
    }
    function bind(nextGame) {
      if (destroyed || !nextGame?.player?.pos || !nextGame.world) { lastError = 'game-not-ready'; return false; }
      if (game === nextGame && player === nextGame.player && world === nextGame.world && movement?.isValid() &&
        typeof player[movement.names.applyInput] === 'function' && typeof player[movement.names.collectInput] === 'function') {
        const nextController = nextGame.controller || nextGame.playerController;
        if (nextController && nextController !== controller) { releaseInteraction(); resolveController(); }
        return true;
      }
      const resume = desired && { ...desired };
      release();
      game = nextGame; player = nextGame.player; world = nextGame.world;
      movement = globalThis.__MINIFEATHER_MOVEMENT_API__?.resolve(player, true) || null;
      mouseVerified = false; firstMouseRequest = 0; lastMouseResponse = 0;
      resolveController();
      if (!movement?.names.applyInput || !movement?.names.collectInput ||
        typeof player[movement.names.applyInput] !== 'function' || typeof player[movement.names.collectInput] !== 'function') {
        movement = null; lastError = 'native-input-unavailable'; return false;
      }
      const nativeCollector = methods(Object.getPrototypeOf(player)).find(entry => entry.name === movement.names.collectInput);
      const collectorSource = nativeCollector?.source || source(player[movement.names.collectInput]);
      const pushIndex = collectorSource.search(/pendingInputs\s*\.\s*push\s*\(\s*this\s*\.\s*currentInput\s*\)/);
      const sendIndex = collectorSource.search(/sendPacket\s*\(\s*this\s*\.\s*currentInput\s*\)/);
      inputMode = pushIndex >= 0 && sendIndex > pushIndex && Array.isArray(player.pendingInputs)
        ? 'native-queue-before-send' : 'native-keys';
      lastError = '';
      if (resume) setControls(resume);
      return true;
    }
    function observe(nextGame) {
      if (desired) return nextGame === game && nextGame?.player === player && nextGame?.world === world;
      bind(nextGame);
      return !!player && player === nextGame?.player && world === nextGame?.world;
    }
    function fields() {
      return { up: desired.forward > .1, down: desired.forward < -.1,
        right: desired.strafe > .1, left: desired.strafe < -.1,
        jump: !!desired.jump, sneak: !!desired.sneak, sprint: !!desired.sprint };
    }
    function patchInput(input) {
      if (!desired || !input || typeof input !== 'object') return;
      const overrides = fields();
      for (const key of INPUT_FIELDS) input[key] = overrides[key];
      // Keep the engine's protobuf object, position, ack and sequence number intact.
      // View angles remain the native camera's angles, never a synthetic packet aim.
      inputTicks++;
    }
    function keyEvent(code, down) {
      try {
        const event = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true });
        globalThis.dispatchEvent(event);
        if (down) keyboardHeld.add(code); else keyboardHeld.delete(code);
      } catch (_) { lastError = 'native-key-event-unavailable'; }
    }
    function feedKeys() {
      const active = fields();
      const map = { KeyW: active.up, KeyS: active.down, KeyD: active.right, KeyA: active.left, Space: active.jump };
      for (const [code, down] of Object.entries(map)) if (keyboardHeld.has(code) !== down) keyEvent(code, down);
    }
    function restoreQueue() {
      if (!queuePatch) return;
      const { queue, original, wrapper, own } = queuePatch;
      if (queue.push === wrapper) {
        if (own) queue.push = original; else delete queue.push;
      }
      queuePatch = null;
    }
    function installHooks() {
      if (hooked) return true;
      const broker = globalThis.__MINIFEATHER_MOVEMENT_API__;
      if (!broker || !movement) return false;
      savedPlayer = { sneak: player.sneak, jumping: player.jumping,
        sprint: typeof player.isSprinting === 'function' ? !!player.isSprinting() : false };
      const collect = broker.register(player, 'collectInput', id, {
        before() {
          if (!desired) return;
          if (inputBlocked()) return;
          player.sneak = !!desired.sneak;
          movement.setSprint(!!desired.sprint);
          if (inputMode === 'native-queue-before-send' && Array.isArray(player.pendingInputs)) {
            restoreQueue();
            const queue = player.pendingInputs, original = queue.push;
            const own = Object.prototype.hasOwnProperty.call(queue, 'push');
            const wrapper = function (...inputs) {
              for (const input of inputs) if (input === player.currentInput) patchInput(input);
              restoreQueue();
              return Reflect.apply(original, this, inputs);
            };
            queue.push = wrapper;
            queuePatch = { queue, original, wrapper, own };
          } else feedKeys();
        },
        after() { restoreQueue(); }
      });
      const apply = broker.register(player, 'applyInput', id, {
        before(context) {
          // Never rewrite old inputs while the native reconciliation replays them.
          if (inputMode === 'native-queue-before-send' && !inputBlocked() && context.args[0] === player.currentInput) patchInput(context.args[0]);
        }
      });
      if (!collect || !apply) {
        broker.unregisterAll(player, id); savedPlayer = null; lastError = 'native-hook-failed'; return false;
      }
      if (movement.names.controlState) broker.register(player, 'controlState', id, {
        after() {
          if (!desired) return;
          if (inputBlocked()) return;
          player.sneak = !!desired.sneak;
          calibrateMouse();
        }
      });
      hooked = true;
      return true;
    }
    function setControls(control = {}) {
      if (!refresh() || !movement) return false;
      if (inputBlocked()) {
        // A chat command is handled before ClientCommands closes the input.
        // Read-only planning may start then, but must not acquire controls.
        if (!control.forward && !control.strafe && !control.jump && !control.sneak && !control.sprint) {
          release();
          return true;
        }
        return false;
      }
      desired = { forward: clamp(Number(control.forward) || 0, -1, 1), strafe: clamp(Number(control.strafe) || 0, -1, 1),
        jump: !!control.jump, sneak: !!control.sneak, sprint: !!control.sprint,
        yaw: finite(control.yaw) ? control.yaw : null, pitch: finite(control.pitch) ? control.pitch : null };
      if (!installHooks()) { desired = null; return false; }
      return true;
    }
    function calibrateMouse() {
      if (!mousePending || !player) return;
      const { yaw, pitch, x, y } = mousePending;
      const change = x ? -wrap(player.yaw - yaw) / x : y ? -(player.pitch - pitch) / y : 0;
      if (finite(change) && change > .00001 && change < .1) {
        mouseGain = change; mousePending = null; mouseVerified = true; lastMouseResponse = Date.now();
      }
    }
    function steer(yaw, pitch, dt) {
      if (!player || inputBlocked() || !finite(yaw) || !finite(pitch)) return false;
      pitch = clamp(pitch, -Math.PI / 2 + .001, Math.PI / 2 - .001);
      const speed = clamp(dt, .005, .1) * 5;
      const nextYaw = player.yaw + clamp(wrap(yaw - player.yaw), -speed, speed);
      const nextPitch = player.pitch + clamp(pitch - player.pitch, -speed, speed);
      if (lookControls) {
        lookControls.yaw = nextYaw; lookControls.pitch = nextPitch;
        if (lookControls.rotation) { lookControls.rotation.y = nextYaw; lookControls.rotation.x = nextPitch; }
        lookControls.yawObject.rotation.y = nextYaw;
        lookControls.pitchObject.rotation.x = nextPitch;
        lookControls.onLook?.(nextYaw, nextPitch);
        return true;
      }
      try {
        calibrateMouse();
        const now = Date.now();
        if (firstMouseRequest && now - (lastMouseResponse || firstMouseRequest) > 1500 &&
          (Math.abs(wrap(yaw - player.yaw)) > .04 || Math.abs(pitch - player.pitch) > .04)) {
          lastError = 'native-camera-not-responding'; return false;
        }
        const x = clamp(-wrap(nextYaw - player.yaw) / mouseGain, -250, 250);
        const y = clamp(-(nextPitch - player.pitch) / mouseGain, -250, 250);
        if (Math.abs(x) < .001 && Math.abs(y) < .001) return true;
        if (!firstMouseRequest) firstMouseRequest = now;
        const event = new MouseEvent('mousemove', { bubbles: true, cancelable: true });
        Object.defineProperties(event, { movementX: { value: x }, movementY: { value: y } });
        mousePending = { yaw: player.yaw, pitch: player.pitch, x, y };
        document.dispatchEvent(event);
        return true;
      } catch (_) { lastError = 'native-camera-unavailable'; return false; }
    }
    function eye() {
      if (!refresh()) return null;
      let height = Number(player.eyeHeight);
      try { if (typeof player.getEyeHeight === 'function') height = Number(player.getEyeHeight()); } catch (_) {}
      if (!finite(height) || height <= 0 || height > 5) height = player.sneak ? 1.54 : 1.62;
      return { x: player.pos.x, y: player.pos.y + height, z: player.pos.z };
    }
    function aimAt(x, y, z, dtSeconds = .05) {
      const origin = eye();
      if (!origin || ![x, y, z].every(finite)) return { aligned: false, reason: 'invalid-target' };
      const dx = x - origin.x, dy = y - origin.y, dz = z - origin.z;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const aligned = Math.abs(wrap(yaw - player.yaw)) < .04 && Math.abs(pitch - player.pitch) < .04;
      const ok = steer(yaw, pitch, dtSeconds);
      return { aligned: ok && aligned, yaw, pitch, reason: ok ? '' : lastError || 'native-camera-unavailable' };
    }
    function readCell(x, y, z) {
      if (!refresh() || ![x, y, z].every(Number.isInteger)) return unknown('invalid-position');
      if (y < 0 || y >= (finite(world.height) ? world.height : 256)) return unknown('world-boundary');
      if (!nativePosition) resolvePosition();
      const pos = position(x, y, z);
      if (!pos || typeof world.getBlockState !== 'function') return unknown('native-block-position-unavailable');
      try {
        if (typeof world.chunkProvider?.isLoaded === 'function') {
          if (!world.chunkProvider.isLoaded(Math.floor(x / 16), Math.floor(z / 16))) return unknown('unloaded-chunk');
        } else if (typeof world.isBlockLoaded === 'function') {
          if (!world.isBlockLoaded(pos)) return unknown('unloaded-chunk');
        } else return unknown('chunk-loading-api-unavailable');
        if (typeof world.getChunk === 'function') {
          const chunk = world.getChunk(pos);
          if (!chunk || chunk.isDummyChunk === true) return unknown('unloaded-chunk');
        }
        const state = world.getBlockState(pos), block = state?.getBlock?.() || state?.block;
        if (!block) return unknown('missing-block');
        const name = String(block.name || block.type || '').toLowerCase();
        const air = typeof block.isAir === 'function' ? !!block.isAir() : /^(?:minecraft:)?(?:air|cave_air|void_air)$/.test(name);
        const liquid = typeof block.material?.isLiquid === 'function' ? !!block.material.isLiquid() : /water|lava/.test(name);
        const hazard = liquid || /lava|fire|magma|cactus|berry_bush|powder_snow/.test(name);
        let hardness = Number(block.hardness);
        if (!finite(hardness)) hardness = air ? 0 : Infinity;
        let box;
        if (typeof state.getCollisionBoundingBox === 'function') box = state.getCollisionBoundingBox(world, pos);
        else if (typeof block.getCollisionBoundingBox === 'function') box = block.getCollisionBoundingBox(world, pos, state);
        else if (air || liquid || block.material?.blocksMovement?.() === false) box = null;
        else return unknown('collision-api-unavailable');
        const collision = [];
        if (box && xyz(box.min) && xyz(box.max)) {
          const local = { min: xyz(box.min), max: xyz(box.max) };
          // Native BlockState boxes are world-space; block-local boxes are accepted only at origin.
          local.min.x -= x; local.max.x -= x;
          local.min.y -= y; local.max.y -= y;
          local.min.z -= z; local.max.z -= z;
          if ([local.min.x, local.min.y, local.min.z, local.max.x, local.max.y, local.max.z].every(finite)) collision.push(local);
        } else if (box) return unknown('invalid-collision');
        const solid = collision.length > 0;
        const replaceable = air || block.isReplaceable === true;
        const supportHeight = solid ? Math.max(...collision.map(item => item.max.y)) : 0;
        return { known: true, air, passable: !solid && !hazard, solid, liquid, hazard, replaceable,
          breakable: !air && !liquid && hardness >= 0 && finite(hardness) && !/bedrock|barrier|portal/.test(name),
          hardness, name, collision, supportHeight, height: supportHeight };
      } catch (_) { return unknown('block-read-failed'); }
    }
    function releaseInteraction() {
      if (mining && controller && names.left) {
        try { controller[names.left](true); } catch (_) {}
      }
      mining = null;
    }
    function interact(type, target) {
      if (!refresh() || !controller) return { ok: false, reason: 'native-controller-unavailable' };
      if (inputBlocked() || game.info?.menus?.isOpen?.('inventory')) {
        releaseInteraction(); return { ok: false, reason: 'game-input-blocked' };
      }
      const origin = eye();
      try {
        if (names.ray) controller[names.ray]();
        const hit = controller.objectMouseOver;
        if (!origin || !hit || !xyz(hit.hitVec)) { releaseInteraction(); return { ok: false, reason: 'wait-ray' }; }
        let reach = player.abilities?.creative ? 5 : 4.5;
        if (names.reach) {
          const nativeReach = controller[names.reach]();
          if (finite(nativeReach) && nativeReach > 0 && nativeReach <= 16) reach = nativeReach;
        }
        if (type === 'attack') {
          const item = player.inventory?.getCurrentItem?.()?.item;
          reach = Math.max(3, Number(item?.getAttackReach?.()) || 0);
        }
        if (Math.hypot(hit.hitVec.x - origin.x, hit.hitVec.y - origin.y, hit.hitVec.z - origin.z) > reach + .03) {
          releaseInteraction(); return { ok: false, reason: 'out-of-reach' };
        }
        if (type === 'attack') {
          const entity = target?.entity || target;
          if (!entity || hit.entity !== entity || !names.left) return { ok: false, reason: 'wait-ray' };
          releaseInteraction();
          if (Date.now() - lastInteract < 250) return { ok: true, reason: 'native-cooldown' };
          controller[names.left](); controller[names.left](true); lastInteract = Date.now();
          return { ok: true, reason: '' };
        }
        if (!target || ![target.x, target.y, target.z].every(Number.isInteger) || !xyz(hit.block)) {
          releaseInteraction(); return { ok: false, reason: 'wait-ray' };
        }
        if (type === 'mine') {
          if (hit.block.x !== target.x || hit.block.y !== target.y || hit.block.z !== target.z) {
            releaseInteraction(); return { ok: false, reason: 'wait-ray' };
          }
          const cell = readCell(target.x, target.y, target.z);
          if (!cell.known || !cell.breakable) { releaseInteraction(); return { ok: false, reason: 'unbreakable' }; }
          if (!names.left || !names.mine) return { ok: false, reason: 'native-mining-unavailable' };
          const key = `${target.x},${target.y},${target.z}`;
          if (mining !== key) { releaseInteraction(); controller[names.left](); mining = key; }
          if (!nativeMiningLoop) controller[names.mine]();
          return { ok: true, reason: '' };
        }
        if (type === 'place') {
          releaseInteraction();
          if (!names.right || typeof hit.block.offset !== 'function' || !hit.side) return { ok: false, reason: 'native-placement-unavailable' };
          const destination = hit.block.offset(hit.side);
          if (destination.x !== target.x || destination.y !== target.y || destination.z !== target.z) return { ok: false, reason: 'wait-ray' };
          const cell = readCell(target.x, target.y, target.z);
          if (!cell.known || !cell.replaceable) return { ok: false, reason: 'not-replaceable' };
          const stack = player.inventory?.getCurrentItem?.();
          if (!stack || stack.stackSize <= 0 || stack.item?.isItemBlock?.() !== true) return { ok: false, reason: 'no-block-item' };
          if (Date.now() - lastInteract < 250) return { ok: true, reason: 'native-cooldown' };
          controller[names.right](); lastInteract = Date.now();
          return { ok: true, reason: '' };
        }
        return { ok: false, reason: 'unknown-action' };
      } catch (_) { releaseInteraction(); lastError = 'native-interaction-failed'; return { ok: false, reason: lastError }; }
    }
    function selectSlot(slot) {
      if (!refresh() || !Number.isInteger(slot) || slot < 1 || slot > 9 || !player.inventory || !('currentItem' in player.inventory)) return false;
      player.inventory.currentItem = slot - 1;
      if (game.info && 'selectedSlot' in game.info) game.info.selectedSlot = slot - 1;
      return true;
    }
    function entities() {
      if (!refresh()) return [];
      const all = world.entities;
      return all instanceof Map || typeof all?.values === 'function' ? [...all.values()] : Array.isArray(all) ? all : [];
    }
    function release() {
      desired = null;
      releaseInteraction(); restoreQueue();
      for (const code of [...keyboardHeld]) keyEvent(code, false);
      if (player && hooked) {
        globalThis.__MINIFEATHER_MOVEMENT_API__?.unregisterAll(player, id);
        if (savedPlayer) {
          player.sneak = savedPlayer.sneak; player.jumping = false;
          movement?.setSprint(savedPlayer.sprint);
        }
        for (const field of [movement?.names.forwardField, movement?.names.strafeField]) {
          if (field && typeof player[field] === 'number') player[field] = 0;
        }
      }
      savedPlayer = null; hooked = false; mousePending = null;
      firstMouseRequest = 0; lastMouseResponse = 0;
    }
    function diagnostics() {
      return { bound: !!player, hooked, inputMode, inputTicks, error: lastError,
        cameraMode: lookControls ? 'verified-native-controls' : mouseVerified ? 'native-mouse-feedback' : 'native-mouse-unverified',
        cameraVerified: !!lookControls || mouseVerified,
        methods: movement ? { ...movement.names } : {},
        capabilities: { movement: !!movement?.names.applyInput && !!movement?.names.collectInput,
          blocks: !!nativePosition && typeof world?.getBlockState === 'function',
          camera: !!lookControls || typeof globalThis.MouseEvent === 'function',
          mine: !!names.left && !!names.mine, nativeMiningLoop, place: !!names.right, attack: !!names.left },
        controls: desired && { ...desired } };
    }
    const runtime = { bind, observe, setControls, release, releaseInteraction, readCell, aimAt, interact, selectSlot, entities, diagnostics, eye,
      get game() { return game; }, get player() { return player; },
      destroy() { release(); destroyed = true; instances.delete(runtime); game = player = world = controller = movement = null; } };
    instances.add(runtime);
    return runtime;
  }
  globalThis[KEY] = { create, destroy() { for (const instance of [...instances]) instance.destroy(); } };
})();
