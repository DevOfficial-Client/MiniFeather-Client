(function () {
  'use strict';

  const EVENT = 'minifeather:movement-assist-config';
  const KEY = '__MINIFEATHER_MOVEMENT_ASSIST__';
  const HOOK_ID = 'minifeather-movement-assist';

  try { globalThis[KEY]?.destroy?.(); } catch (_) {}

  const state = {
    autoSprint: false,
    safeSneak: false,
    player: null,
    nativeSneak: false,
    nativeSneakAt: 0,
    forcedSneak: false,
    timer: 0,
    destroyed: false
  };

  function movementAPI() {
    return globalThis.__MINIFEATHER_MOVEMENT_API__ || null;
  }

  function getBlockState(world, x, y, z) {
    if (!world || y < 0 || y > 255) return null;
    const pos = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };

    try {
      if (typeof world.getBlockState === 'function') return world.getBlockState(pos);
    } catch (_) {}

    try {
      const proto = Object.getPrototypeOf(world);
      if (typeof proto?.getBlockState === 'function') return proto.getBlockState.call(world, pos);
      if (typeof proto?.getChunk === 'function') {
        const chunk = proto.getChunk.call(world, pos);
        if (!chunk || chunk.isDummyChunk || typeof chunk.getBlockState !== 'function') return null;
        return chunk.getBlockState(pos);
      }
    } catch (_) {}

    return null;
  }

  function hasSupport(world, x, y, z) {
    const block = getBlockState(world, x, y, z);
    if (!block) return null;
    return Number(block.id) !== 0;
  }

  function movementVector(input, player) {
    const forward = (input?.up ? 1 : 0) - (input?.down ? 1 : 0);
    const strafe = (input?.right ? 1 : 0) - (input?.left ? 1 : 0);
    if (!forward && !strafe) return null;

    const yaw = Number.isFinite(Number(input?.yaw)) ? Number(input.yaw) : Number(player?.yaw) || 0;
    let x = (-Math.sin(yaw) * forward) + (Math.cos(yaw) * strafe);
    let z = (Math.cos(yaw) * forward) + (Math.sin(yaw) * strafe);
    const length = Math.hypot(x, z);
    if (length < 0.0001) return null;
    x /= length;
    z /= length;
    return { x, z };
  }

  function shouldSafeSneak(player, input, world) {
    if (!state.safeSneak || !player?.pos || !world) return false;
    if (input?.jump || player.jumping || player.onGround === false) return false;

    const direction = movementVector(input, player);
    if (!direction) return false;

    const px = Number(player.pos.x);
    const py = Number(player.pos.y);
    const pz = Number(player.pos.z);
    if (![px, py, pz].every(Number.isFinite)) return false;

    const floorY = Math.floor(py - 0.08);
    if (hasSupport(world, px, floorY, pz) !== true) return false;

    const lookAhead = 0.36;
    const radius = 0.29;
    const cx = px + direction.x * lookAhead;
    const cz = pz + direction.z * lookAhead;
    const samples = [
      [cx - radius, cz - radius],
      [cx + radius, cz - radius],
      [cx - radius, cz + radius],
      [cx + radius, cz + radius]
    ];

    let missing = false;
    for (const [x, z] of samples) {
      const support = hasSupport(world, x, floorY, z);
      if (support === null) return false;
      if (support === false) missing = true;
    }

    return missing;
  }

  function canSprint(player, api) {
    if (!state.autoSprint || !player || !api?.isForwardPressed()) return false;
    if (player.sneak === true || player.isCollidedHorizontally === true) return false;

    try { if (typeof player.isUsingItem === 'function' && player.isUsingItem()) return false; } catch (_) {}
    try { if (typeof player.isRiding === 'function' && player.isRiding()) return false; } catch (_) {}

    try {
      const mayFly = player.abilities?.mayFly === true;
      const food = typeof player.getFoodStats === 'function'
        ? Number(player.getFoodStats()?.getFoodLevel?.())
        : 20;
      if (!mayFly && Number.isFinite(food) && food <= 6) return false;
    } catch (_) {}

    return true;
  }

  function unhookPlayer() {
    const bridge = movementAPI();
    if (state.player && bridge) bridge.unregisterAll(state.player, HOOK_ID);
    state.player = null;
    state.forcedSneak = false;
  }

  function hookPlayer(player) {
    const bridge = movementAPI();
    if (!bridge || !player) return false;
    if (!bridge.resolve(player, true)) return false;

    if (state.player && state.player !== player) unhookPlayer();
    state.player = player;

    bridge.register(player, 'controlState', HOOK_ID, {
      after(ctx) {
        state.nativeSneak = ctx.player.sneak === true;
        state.nativeSneakAt = performance.now();
      }
    });

    bridge.register(player, 'collectInput', HOOK_ID, {
      before(ctx) {
        const game = bridge.getGame();
        const input = ctx.player.currentInput || null;
        const recentNative = performance.now() - state.nativeSneakAt < 300;
        const physicalSneak = recentNative ? state.nativeSneak : (ctx.player.sneak === true && !state.forcedSneak);
        const edgeSneak = shouldSafeSneak(ctx.player, input, game?.world);
        state.forcedSneak = edgeSneak && !physicalSneak;
        ctx.player.sneak = physicalSneak || edgeSneak;
      }
    });

    bridge.register(player, 'livingUpdate', HOOK_ID, {
      before(ctx) {
        const api = ctx.api || bridge.resolve(ctx.player);
        if (canSprint(ctx.player, api)) api.setSprint(true);
      },
      after(ctx) {
        const api = ctx.api || bridge.resolve(ctx.player);
        if (canSprint(ctx.player, api)) api.setSprint(true);
      }
    });

    return true;
  }

  function ensureHooks() {
    if (state.destroyed || (!state.autoSprint && !state.safeSneak)) {
      unhookPlayer();
      return;
    }

    const bridge = movementAPI();
    const player = bridge?.getGame()?.player;
    if (!player?.pos) return;

    if (state.player !== player) {
      hookPlayer(player);
      return;
    }

    const api = bridge.resolve(player);
    if (!api?.isValid()) hookPlayer(player);
  }

  function applyConfig(detail) {
    let config = null;
    try { config = typeof detail === 'string' ? JSON.parse(detail) : detail; } catch (_) {}
    if (!config || typeof config !== 'object') return;

    state.autoSprint = config.autoSprint === true;
    state.safeSneak = config.safeSneak === true;
    ensureHooks();
  }

  function onConfig(event) {
    applyConfig(event.detail);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    clearInterval(state.timer);
    document.removeEventListener(EVENT, onConfig);
    unhookPlayer();
    try { if (globalThis[KEY]?.destroy === destroy) delete globalThis[KEY]; } catch (_) {}
  }

  document.addEventListener(EVENT, onConfig);
  state.timer = window.setInterval(ensureHooks, 750);
  globalThis[KEY] = { destroy, applyConfig };
})();
