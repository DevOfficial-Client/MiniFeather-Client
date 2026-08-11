(function () {
  'use strict';

  const EVENT_CONFIG = 'minifeather:anti-afk-config';
  const GLOBAL_KEY = '__MINIFEATHER_ANTI_AFK__';
  const MIN_DELAY_SECONDS = 5;
  const MAX_DELAY_SECONDS = 150;
  const DEFAULT_DELAY_SECONDS = 120;
  const ACTION_INTERVAL_MS = 2500;
  const ACTION_DURATION_MS = 550;

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    delaySeconds: DEFAULT_DELAY_SECONDS,
    active: false,

    game: null,
    player: null,
    readerName: null,
    applyName: null,
    originalReader: null,
    nativeApply: null,

    lastUserActivity: Date.now(),
    lastPosition: null,

    action: 'idle',
    actionStartedAt: 0,
    lastActionAt: 0,

    scanTimer: 0,
    idleTimer: 0,
    movementTimer: 0,

    lastMouseX: null,
    lastMouseY: null,

    destroyed: false
  };

  function clampDelay(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_DELAY_SECONDS;
    const stepped = Math.round(parsed / 5) * 5;
    return Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, stepped));
  }

  function getGame() {
    if (state.game?.player?.pos && state.game?.world) return state.game;

    try {
      const react = document.querySelector('#react');
      if (!react) return null;

      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player?.pos && game?.world) return game;
      }
    } catch (_) {}

    return null;
  }

  function getMethods(player) {
    const methods = [];
    const seen = new Set();
    let proto = player;

    for (let depth = 0; proto && depth < 10; depth++) {
      let names = [];
      try {
        names = Object.getOwnPropertyNames(proto);
      } catch (_) {}

      for (const name of names) {
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);

        let fn;
        try {
          fn = player[name];
        } catch (_) {
          continue;
        }

        if (typeof fn !== 'function') continue;

        let source = '';
        try {
          source = Function.prototype.toString.call(fn);
        } catch (_) {}

        methods.push({ name, fn, source });
      }

      proto = Object.getPrototypeOf(proto);
    }

    return methods;
  }

  function resolveNativeInput(player) {
    const methods = getMethods(player);

    const reader =
      methods.find(method => method.name === 'bkkAvIfjEgvYuYRLXBgtj') ||
      methods.find(method =>
        method.source.includes('sentInputThisTick') &&
        method.source.includes('currentInput') &&
        method.source.includes('jumping') &&
        method.source.includes('inputSequenceNumber')
      );

    const apply =
      methods.find(method => method.name === 'OBHUlAPATf') ||
      methods.find(method =>
        method.source.includes('this.wWQmwuDLqA') &&
        method.source.includes('this.YApHmhhGagG') &&
        method.source.includes('this.jumping')
      );

    if (!reader || !apply) return null;

    return {
      readerName: reader.name,
      applyName: apply.name,
      originalReader: player[reader.name],
      nativeApply: player[apply.name]
    };
  }

  function neutralMovement(player = state.player) {
    if (!player) return;

    try {
      player.wWQmwuDLqA = 0;
      player.YApHmhhGagG = 0;
      player.jumping = false;
    } catch (_) {}
  }

  function resetAction() {
    state.action = 'idle';
    state.actionStartedAt = 0;
    state.lastActionAt = 0;
  }

  function rememberPosition() {
    const player = state.player;
    if (!player?.pos) {
      state.lastPosition = null;
      return;
    }

    state.lastPosition = {
      x: Number(player.pos.x) || 0,
      y: Number(player.pos.y) || 0,
      z: Number(player.pos.z) || 0
    };
  }

  function deactivate(reason = 'user_activity') {
    const wasActive = state.active;
    state.active = false;
    resetAction();
    neutralMovement();
    state.lastUserActivity = Date.now();
    rememberPosition();

    if (wasActive) {
      try {
        console.debug('[MiniFeather Anti-AFK] stopped:', reason);
      } catch (_) {}
    }
  }

  function activate() {
    if (!state.enabled || state.active || !state.player) return;
    state.active = true;
    resetAction();

    try {
      console.debug('[MiniFeather Anti-AFK] active');
    } catch (_) {}
  }

  function chooseAction() {
    const actions = ['forward', 'backward', 'left', 'right', 'jump'];
    state.action = actions[Math.floor(Math.random() * actions.length)];
    state.actionStartedAt = Date.now();
    state.lastActionAt = state.actionStartedAt;
  }

  function getControls() {
    const now = Date.now();

    if (
      state.action === 'idle' &&
      (state.lastActionAt === 0 || now - state.lastActionAt >= ACTION_INTERVAL_MS)
    ) {
      chooseAction();
    }

    if (
      state.action !== 'idle' &&
      now - state.actionStartedAt >= ACTION_DURATION_MS
    ) {
      state.action = 'idle';
    }

    const controls = {
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false
    };

    if (state.action === 'forward') controls.up = true;
    else if (state.action === 'backward') controls.down = true;
    else if (state.action === 'left') controls.left = true;
    else if (state.action === 'right') controls.right = true;
    else if (state.action === 'jump') controls.jump = true;

    return controls;
  }

  function createNativeInput(player) {
    const controls = getControls();
    const data = {
      sequenceNumber: ++player.inputSequenceNumber,
      left: controls.left,
      right: controls.right,
      up: controls.up,
      down: controls.down,
      yaw: player.yaw,
      pitch: player.pitch,
      jump: controls.jump,
      sneak: false,
      sprint: false,
      pos: null,
      ackId: player.lastServerAckId > 0 ? player.lastServerAckId : undefined,
      onGround: player.onGround,
      usingItem: false
    };

    try {
      const InputClass = player.currentInput?.constructor;
      if (InputClass && InputClass !== Object) return new InputClass(data);
    } catch (_) {}

    return data;
  }

  function restorePlayerHook() {
    const player = state.player;
    const readerName = state.readerName;
    const originalReader = state.originalReader;

    if (player && readerName && typeof originalReader === 'function') {
      try {
        if (player[readerName] !== originalReader) {
          player[readerName] = originalReader;
        }
      } catch (_) {}
    }

    neutralMovement(player);

    state.player = null;
    state.readerName = null;
    state.applyName = null;
    state.originalReader = null;
    state.nativeApply = null;
    state.active = false;
    resetAction();
    state.lastPosition = null;
  }

  function hookPlayer(player) {
    if (!player) return false;

    if (
      state.player === player &&
      state.readerName &&
      typeof state.originalReader === 'function' &&
      typeof state.nativeApply === 'function'
    ) {
      return true;
    }

    restorePlayerHook();

    const native = resolveNativeInput(player);
    if (!native) return false;

    state.player = player;
    state.readerName = native.readerName;
    state.applyName = native.applyName;
    state.originalReader = native.originalReader;
    state.nativeApply = native.nativeApply;
    state.lastUserActivity = Date.now();
    rememberPosition();

    const readerName = state.readerName;
    const originalReader = state.originalReader;
    const nativeApply = state.nativeApply;

    player[readerName] = function (...args) {
      if (
        state.destroyed ||
        !state.enabled ||
        !state.active ||
        state.player !== this
      ) {
        return originalReader.apply(this, args);
      }

      const input = createNativeInput(this);

      this.sentInputThisTick = false;
      this.wWQmwuDLqA = 0;
      this.YApHmhhGagG = 0;
      this.currentInput = input;

      return nativeApply.call(this, input);
    };

    return true;
  }

  function ensureRuntime() {
    if (!state.enabled || state.destroyed) return false;

    const game = getGame();
    if (!game?.player) return false;

    state.game = game;

    if (state.player !== game.player) {
      return hookPlayer(game.player);
    }

    return true;
  }

  function noteUserActivity(event) {
    if (event && event.isTrusted === false) return;

    state.lastUserActivity = Date.now();

    if (state.active) {
      deactivate('user_activity');
    } else {
      rememberPosition();
    }
  }

  function onMouseMove(event) {
    if (event.isTrusted === false) return;

    const movementDistance = Math.hypot(
      Number(event.movementX) || 0,
      Number(event.movementY) || 0
    );

    if (movementDistance >= 1) {
      state.lastMouseX = event.clientX;
      state.lastMouseY = event.clientY;
      noteUserActivity(event);
      return;
    }

    if (state.lastMouseX === null || state.lastMouseY === null) {
      state.lastMouseX = event.clientX;
      state.lastMouseY = event.clientY;
      return;
    }

    const distance = Math.hypot(
      event.clientX - state.lastMouseX,
      event.clientY - state.lastMouseY
    );

    state.lastMouseX = event.clientX;
    state.lastMouseY = event.clientY;

    if (distance >= 4) noteUserActivity(event);
  }

  const activityListeners = [
    ['keydown', noteUserActivity],
    ['mousedown', noteUserActivity],
    ['pointerdown', noteUserActivity],
    ['wheel', noteUserActivity],
    ['touchstart', noteUserActivity],
    ['mousemove', onMouseMove]
  ];

  function addActivityListeners() {
    for (const [type, listener] of activityListeners) {
      window.addEventListener(type, listener, true);
    }
  }

  function removeActivityListeners() {
    for (const [type, listener] of activityListeners) {
      window.removeEventListener(type, listener, true);
    }
  }

  function startTimers() {
    if (!state.scanTimer) {
      state.scanTimer = window.setInterval(() => {
        if (!state.enabled) return;
        ensureRuntime();
      }, 1000);
    }

    if (!state.idleTimer) {
      state.idleTimer = window.setInterval(() => {
        if (!state.enabled || state.active) return;
        if (!ensureRuntime()) return;

        if (Date.now() - state.lastUserActivity >= state.delaySeconds * 1000) {
          activate();
        }
      }, 200);
    }

    if (!state.movementTimer) {
      state.movementTimer = window.setInterval(() => {
        if (!state.enabled || state.active) return;
        if (!ensureRuntime()) return;

        const player = state.player;
        if (!player?.pos) return;

        if (!state.lastPosition) {
          rememberPosition();
          return;
        }

        const distance = Math.hypot(
          player.pos.x - state.lastPosition.x,
          player.pos.y - state.lastPosition.y,
          player.pos.z - state.lastPosition.z
        );

        if (distance > 0.08) {
          state.lastUserActivity = Date.now();
          rememberPosition();
        }
      }, 250);
    }
  }

  function stopTimers() {
    if (state.scanTimer) clearInterval(state.scanTimer);
    if (state.idleTimer) clearInterval(state.idleTimer);
    if (state.movementTimer) clearInterval(state.movementTimer);
    state.scanTimer = 0;
    state.idleTimer = 0;
    state.movementTimer = 0;
  }

  function enable() {
    if (state.destroyed) return;

    state.enabled = true;
    state.active = false;
    state.lastUserActivity = Date.now();
    resetAction();
    addActivityListeners();
    startTimers();
    ensureRuntime();
  }

  function disable() {
    state.enabled = false;
    state.active = false;
    stopTimers();
    removeActivityListeners();
    restorePlayerHook();
    state.game = null;
    state.lastUserActivity = Date.now();
  }

  function applyConfig(config = {}) {
    state.delaySeconds = clampDelay(config.delaySeconds ?? state.delaySeconds);

    if (config.enabled === true) {
      if (!state.enabled) enable();
      return;
    }

    if (config.enabled === false && state.enabled) {
      disable();
    }
  }

  function onConfig(event) {
    let config = {};

    try {
      config = typeof event.detail === 'string'
        ? JSON.parse(event.detail || '{}')
        : (event.detail || {});
    } catch (_) {
      config = {};
    }

    applyConfig(config);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    document.removeEventListener(EVENT_CONFIG, onConfig);
    disable();

    if (globalThis[GLOBAL_KEY]?.destroy === destroy) {
      delete globalThis[GLOBAL_KEY];
    }
  }

  document.addEventListener(EVENT_CONFIG, onConfig);

  globalThis[GLOBAL_KEY] = {
    destroy,
    applyConfig,
    get status() {
      return {
        enabled: state.enabled,
        active: state.active,
        delaySeconds: state.delaySeconds,
        action: state.action,
        idleSeconds: Math.max(0, (Date.now() - state.lastUserActivity) / 1000),
        hooked: !!state.player,
        readerName: state.readerName,
        applyName: state.applyName
      };
    }
  };
})();
