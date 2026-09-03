(function () {
  'use strict';

  const EVENT = 'minifeather:movement-assist-config';
  const KEY = '__MINIFEATHER_MOVEMENT_ASSIST__';

  try {
    globalThis[KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    autoSprint: false,
    safeSneak: false,
    game: null,
    player: null,
    applyName: '',
    previousApply: null,
    hook: null,
    timer: 0,
    destroyed: false
  };

  function getGame() {
    if (state.game?.player?.pos && state.game?.world) return state.game;

    try {
      const direct = [
        globalThis.__MB?.game,
        globalThis.game,
        globalThis.__game,
        globalThis.minibloxGame,
        globalThis.MiniBlox?.game
      ];

      for (const game of direct) {
        if (game?.player?.pos && game?.world) {
          state.game = game;
          return game;
        }
      }
    } catch (_) {}

    try {
      const roots = [
        document.querySelector('#react'),
        document.querySelector('#root'),
        document.querySelector('[id*="react"]')
      ].filter(Boolean);

      for (const element of roots) {
        for (const root of Object.values(element)) {
          const candidates = [
            root?.updateQueue?.baseState?.element?.props?.game,
            root?.memoizedProps?.game,
            root?.pendingProps?.game,
            root?.return?.memoizedProps?.game,
            root?.return?.return?.memoizedProps?.game,
            root?.child?.memoizedProps?.game,
            root?.child?.child?.memoizedProps?.game
          ];

          for (const game of candidates) {
            if (game?.player?.pos && game?.world) {
              state.game = game;
              return game;
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  function nativeMethods(player) {
    const methods = [];
    const seen = new Set();
    let proto = Object.getPrototypeOf(player);

    for (let depth = 0; proto && depth < 12; depth += 1) {
      let names = [];
      try {
        names = Object.getOwnPropertyNames(proto);
      } catch (_) {}

      for (const name of names) {
        if (name === 'constructor') continue;
        let fn = null;
        try {
          fn = proto[name];
        } catch (_) {}
        if (typeof fn !== 'function' || seen.has(fn)) continue;
        seen.add(fn);

        let source = '';
        try {
          source = Function.prototype.toString.call(fn);
        } catch (_) {}

        methods.push({ name, fn, source });
      }

      try {
        proto = Object.getPrototypeOf(proto);
      } catch (_) {
        break;
      }
    }

    return methods;
  }

  function findApply(player) {
    let best = null;

    for (const method of nativeMethods(player)) {
      const source = method.source;
      let score = 0;

      if (source.includes('this.jumping')) score += 8;
      if (source.includes('.up')) score += 5;
      if (source.includes('.down')) score += 5;
      if (source.includes('.left')) score += 4;
      if (source.includes('.right')) score += 4;
      if (source.includes('.jump')) score += 4;
      if (source.includes('.sneak')) score += 5;
      if (source.includes('.sprint')) score += 5;
      if (source.includes('usingItem')) score += 2;
      if (source.includes('ayHGaukUNSp')) score += 8;
      if (source.includes('yNDNKuoxzL')) score += 8;

      const writes = (source.match(/this\.[A-Za-z_$][\w$]*\s*=(?!=)/g) || []).length;
      if (writes >= 3) score += 6;

      if (!best || score > best.score) best = { ...method, score };
    }

    return best?.score >= 24 ? best : null;
  }

  function getBlockState(world, x, y, z) {
    if (!world || y < 0 || y > 255) return null;

    try {
      const fx = Math.floor(x);
      const fy = Math.floor(y);
      const fz = Math.floor(z);
      const proto = Object.getPrototypeOf(world);

      if (typeof proto.getChunk === 'function') {
        const chunk = proto.getChunk.call(world, { x: fx, y: fy, z: fz });
        if (!chunk || chunk.isDummyChunk || typeof chunk.getBlockState !== 'function') return null;
        return chunk.getBlockState({ x: fx, y: fy, z: fz });
      }

      if (typeof proto.getBlockState === 'function') {
        return proto.getBlockState.call(world, { x: fx, y: fy, z: fz });
      }
    } catch (_) {}

    return null;
  }

  function supportAt(world, x, y, z) {
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

  function shouldSneak(player, input, world) {
    if (!state.safeSneak || !player?.pos || !world) return false;
    if (input?.sneak || input?.jump || player?.jumping || player?.onGround === false) return false;

    const direction = movementVector(input, player);
    if (!direction) return false;

    const px = Number(player.pos.x);
    const py = Number(player.pos.y);
    const pz = Number(player.pos.z);
    if (![px, py, pz].every(Number.isFinite)) return false;

    const floorY = Math.floor(py - 0.08);
    const lookAhead = 0.34;
    const radius = 0.29;
    const cx = px + direction.x * lookAhead;
    const cz = pz + direction.z * lookAhead;
    const samples = [
      [cx - radius, cz - radius],
      [cx + radius, cz - radius],
      [cx - radius, cz + radius],
      [cx + radius, cz + radius]
    ];

    const currentCenter = supportAt(world, px, floorY, pz);
    if (currentCenter !== true) return false;

    let missingSupport = false;
    for (const [x, z] of samples) {
      const support = supportAt(world, x, floorY, z);
      if (support === null) return false;
      if (support === false) missingSupport = true;
    }

    return missingSupport;
  }

  function adjustedInput(input, player) {
    if (!input || typeof input !== 'object') return input;
    const game = state.game || getGame();
    const next = { ...input };
    const edgeSneak = shouldSneak(player, next, game?.world);

    if (edgeSneak) next.sneak = true;

    if (state.autoSprint) {
      const forward = next.up === true && next.down !== true;
      const blocked = next.sneak === true || next.usingItem === true;
      next.sprint = forward && !blocked;
    }

    return next;
  }

  function restoreHook() {
    const player = state.player;
    if (player && state.applyName && state.hook && player[state.applyName] === state.hook) {
      try {
        if (typeof state.previousApply === 'function') player[state.applyName] = state.previousApply;
        else delete player[state.applyName];
      } catch (_) {}
    }

    state.player = null;
    state.applyName = '';
    state.previousApply = null;
    state.hook = null;
  }

  function hookPlayer(player) {
    if (!player) return false;
    const apply = findApply(player);
    if (!apply) return false;

    const current = player[apply.name];
    if (state.player === player && state.applyName === apply.name && state.hook && current === state.hook) return true;

    restoreHook();

    const previous = typeof current === 'function' ? current : apply.fn;
    const hook = function (input, ...args) {
      return previous.call(this, adjustedInput(input, this), ...args);
    };

    try {
      player[apply.name] = hook;
      if (player[apply.name] !== hook) return false;
    } catch (_) {
      return false;
    }

    state.player = player;
    state.applyName = apply.name;
    state.previousApply = previous;
    state.hook = hook;
    return true;
  }

  function ensureHook() {
    if (state.destroyed || (!state.autoSprint && !state.safeSneak)) {
      restoreHook();
      return;
    }

    const game = getGame();
    const player = game?.player;
    if (!player?.pos) return;

    if (state.player !== player || !state.hook || player[state.applyName] !== state.hook) {
      hookPlayer(player);
    }
  }

  function applyConfig(detail) {
    let config = null;
    try {
      config = typeof detail === 'string' ? JSON.parse(detail) : detail;
    } catch (_) {}
    if (!config || typeof config !== 'object') return;

    state.autoSprint = config.autoSprint === true;
    state.safeSneak = config.safeSneak === true;
    ensureHook();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    clearInterval(state.timer);
    document.removeEventListener(EVENT, onConfig);
    restoreHook();
    if (globalThis[KEY]?.destroy === destroy) delete globalThis[KEY];
  }

  function onConfig(event) {
    applyConfig(event.detail);
  }

  document.addEventListener(EVENT, onConfig);
  state.timer = window.setInterval(ensureHook, 500);
  globalThis[KEY] = { destroy };
})();
