(function () {
  'use strict';

  const EVENT = 'minifeather:anti-afk-config';
  const KEY = '__MINIFEATHER_ANTI_AFK__';
  const HOOK_ID = 'minifeather-anti-afk';

  try { globalThis[KEY]?.destroy?.(); } catch (_) {}

  const state = {
    enabled: false,
    active: false,
    destroyed: false,
    delaySeconds: 120,
    player: null,
    lastActivity: Date.now(),
    lastNativeInput: 0,
    lastPulse: 0,
    nextPulseAt: 0,
    pulseIndex: 0,
    scanTimer: 0,
    idleTimer: 0,
    fallbackTimer: 0,
    mouseX: null,
    mouseY: null
  };

  function movementAPI() {
    return globalThis.__MINIFEATHER_MOVEMENT_API__ || null;
  }

  function clampDelay(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 120;
    return Math.max(5, Math.min(150, Math.round(n / 5) * 5));
  }

  function scheduleNextPulse(now = Date.now()) {
    const cadence = [22000, 26000, 30000, 25000];
    state.nextPulseAt = now + cadence[state.pulseIndex % cadence.length];
  }

  function unhookPlayer() {
    const bridge = movementAPI();
    if (state.player && bridge) bridge.unregisterAll(state.player, HOOK_ID);
    state.player = null;
  }

  function hookPlayer(player) {
    const bridge = movementAPI();
    if (!bridge || !player) return false;
    const api = bridge.resolve(player, true);
    if (!api?.names?.collectInput) return false;

    if (state.player && state.player !== player) unhookPlayer();
    state.player = player;

    bridge.register(player, 'collectInput', HOOK_ID, {
      before(ctx) {
        state.lastNativeInput = Date.now();
        if (!state.enabled || !state.active || Date.now() < state.nextPulseAt) return;

        const yaw = Number(ctx.player.yaw);
        const pitch = Number(ctx.player.pitch);
        if (!Number.isFinite(yaw)) return;

        const sign = state.pulseIndex % 2 === 0 ? 1 : -1;
        ctx.data.afkPulse = {
          yaw,
          pitch,
          pulsed: true
        };

        ctx.player.yaw = yaw + sign * 0.0035;
        if (Number.isFinite(pitch)) {
          ctx.player.pitch = Math.max(-1.55, Math.min(1.55, pitch + sign * 0.0012));
        }
      },
      after(ctx) {
        const pulse = ctx.data.afkPulse;
        if (!pulse?.pulsed) return;

        const apiNow = ctx.api || bridge.resolve(ctx.player);
        if (!apiNow?.usesInputMovement()) apiNow?.syncPosLook();

        ctx.player.yaw = pulse.yaw;
        if (Number.isFinite(pulse.pitch)) ctx.player.pitch = pulse.pitch;

        state.lastPulse = Date.now();
        state.pulseIndex += 1;
        scheduleNextPulse(state.lastPulse);
      }
    });

    return true;
  }

  function ensureRuntime() {
    if (!state.enabled || state.destroyed) return false;
    const bridge = movementAPI();
    const player = bridge?.getGame()?.player;
    if (!player?.pos) return false;

    if (state.player !== player) return hookPlayer(player);
    const api = bridge.resolve(player);
    if (!api?.isValid()) return hookPlayer(player);
    return true;
  }

  function pulseFallback() {
    if (!state.enabled || !state.active || !ensureRuntime()) return;
    if (Date.now() < state.nextPulseAt) return;
    if (Date.now() - state.lastNativeInput < 1800) return;

    const bridge = movementAPI();
    const player = state.player;
    const api = bridge?.resolve(player);
    if (!api || !player) return;

    const yaw = Number(player.yaw);
    const pitch = Number(player.pitch);
    if (!Number.isFinite(yaw)) return;

    const sign = state.pulseIndex % 2 === 0 ? 1 : -1;
    player.yaw = yaw + sign * 0.0035;
    if (Number.isFinite(pitch)) player.pitch = Math.max(-1.55, Math.min(1.55, pitch + sign * 0.0012));

    api.syncPosLook() || api.syncState();

    player.yaw = yaw;
    if (Number.isFinite(pitch)) player.pitch = pitch;

    state.lastPulse = Date.now();
    state.pulseIndex += 1;
    scheduleNextPulse(state.lastPulse);
  }

  function activate() {
    if (!state.enabled || state.active || !ensureRuntime()) return;
    state.active = true;
    state.nextPulseAt = Date.now() + 750;
  }

  function deactivate(resetActivity = true) {
    state.active = false;
    if (resetActivity) state.lastActivity = Date.now();
    scheduleNextPulse();
  }

  function activity(event) {
    if (event?.isTrusted === false) return;
    deactivate(true);
  }

  function mouseMove(event) {
    if (event.isTrusted === false) return;
    const dx = Number(event.movementX) || 0;
    const dy = Number(event.movementY) || 0;

    if (Math.hypot(dx, dy) >= 1) {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
      activity(event);
      return;
    }

    if (state.mouseX === null || state.mouseY === null) {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
      return;
    }

    const distance = Math.hypot(event.clientX - state.mouseX, event.clientY - state.mouseY);
    state.mouseX = event.clientX;
    state.mouseY = event.clientY;
    if (distance >= 4) activity(event);
  }

  const listeners = [
    ['keydown', activity],
    ['mousedown', activity],
    ['pointerdown', activity],
    ['wheel', activity],
    ['touchstart', activity],
    ['mousemove', mouseMove]
  ];

  function addListeners() {
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
  }

  function removeListeners() {
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
  }

  function startTimers() {
    if (!state.scanTimer) {
      state.scanTimer = setInterval(() => {
        if (state.enabled) ensureRuntime();
      }, 1000);
    }

    if (!state.idleTimer) {
      state.idleTimer = setInterval(() => {
        if (!state.enabled || state.active) return;
        if (Date.now() - state.lastActivity >= state.delaySeconds * 1000) activate();
      }, 250);
    }

    if (!state.fallbackTimer) {
      state.fallbackTimer = setInterval(pulseFallback, 1000);
    }
  }

  function stopTimers() {
    clearInterval(state.scanTimer);
    clearInterval(state.idleTimer);
    clearInterval(state.fallbackTimer);
    state.scanTimer = 0;
    state.idleTimer = 0;
    state.fallbackTimer = 0;
  }

  function enable() {
    if (state.destroyed) return false;
    if (state.enabled) return true;
    state.enabled = true;
    state.active = false;
    state.lastActivity = Date.now();
    scheduleNextPulse();
    addListeners();
    startTimers();
    ensureRuntime();
    return true;
  }

  function disable() {
    state.enabled = false;
    state.active = false;
    stopTimers();
    removeListeners();
    unhookPlayer();
    state.lastActivity = Date.now();
    state.lastNativeInput = 0;
  }

  function applyConfig(config = {}) {
    const delay = config.delaySeconds ?? config.delay ?? config.seconds;
    if (delay != null) state.delaySeconds = clampDelay(delay);
    if (config.enabled === true) enable();
    if (config.enabled === false) disable();
  }

  function onConfig(event) {
    let config = {};
    try {
      config = typeof event.detail === 'string'
        ? JSON.parse(event.detail || '{}')
        : (event.detail || {});
    } catch (_) {}
    applyConfig(config);
  }

  function destroy() {
    if (state.destroyed) return;
    document.removeEventListener(EVENT, onConfig);
    disable();
    state.destroyed = true;
    try { if (globalThis[KEY]?.destroy === destroy) delete globalThis[KEY]; } catch (_) {}
  }

  document.addEventListener(EVENT, onConfig);

  globalThis[KEY] = {
    enable,
    disable,
    destroy,
    applyConfig,
    get status() {
      const api = state.player ? movementAPI()?.resolve(state.player) : null;
      return {
        enabled: state.enabled,
        active: state.active,
        delaySeconds: state.delaySeconds,
        idleSeconds: Math.max(0, (Date.now() - state.lastActivity) / 1000),
        playerHooked: !!state.player,
        movementAPI: api?.names || null,
        lastPulse: state.lastPulse,
        nextPulseAt: state.nextPulseAt,
        hidden: document.hidden
      };
    }
  };
})();
