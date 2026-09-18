(function () {
  'use strict';

  const KEY = '__MINIFEATHER_MOVEMENT_API__';
  const runtimes = new Set();
  const cache = new WeakMap();

  try { globalThis[KEY]?.destroy?.(); } catch (_) {}

  function sourceOf(fn) {
    try { return Function.prototype.toString.call(fn); } catch (_) { return ''; }
  }

  function nativeMethods(player) {
    const out = [];
    const seen = new Set();
    let proto = Object.getPrototypeOf(player);

    for (let depth = 0; proto && depth < 16; depth += 1) {
      let names = [];
      try { names = Object.getOwnPropertyNames(proto); } catch (_) {}

      for (const name of names) {
        if (name === 'constructor') continue;
        let fn = null;
        try { fn = proto[name]; } catch (_) {}
        if (typeof fn !== 'function' || seen.has(fn)) continue;
        seen.add(fn);
        out.push({ name, fn, source: sourceOf(fn), depth });
      }

      try { proto = Object.getPrototypeOf(proto); } catch (_) { break; }
    }

    return out;
  }

  function pick(methods, scorer, minScore) {
    let best = null;
    for (const method of methods) {
      const score = scorer(method);
      if (!best || score > best.score) best = { ...method, score };
    }
    return best && best.score >= minScore ? best : null;
  }

  function includesAll(source, parts) {
    return parts.every((part) => source.includes(part));
  }

  function resolve(player, force = false) {
    if (!player || typeof player !== 'object') return null;
    if (!force) {
      const existing = cache.get(player);
      if (existing && existing.isValid()) return existing;
    }

    const methods = nativeMethods(player);

    const applyInput = pick(methods, ({ source }) => {
      let score = 0;
      if (includesAll(source, ['.right', '.left', '.up', '.down'])) score += 18;
      if (source.includes('.jump')) score += 4;
      if (source.includes('.sneak')) score += 5;
      if (source.includes('usingItem')) score += 4;
      if (source.includes('setPositionAndRotation')) score += 8;
      if (source.includes('this.jumping')) score += 5;
      return score;
    }, 30);

    const collectInput = pick(methods, ({ source }) => {
      let score = 0;
      if (source.includes('currentInput')) score += 10;
      if (source.includes('inputSequenceNumber')) score += 8;
      if (source.includes('pendingInputs')) score += 8;
      if (source.includes('serverUsesInputMovement')) score += 8;
      if (source.includes('sentInputThisTick')) score += 5;
      if (includesAll(source, ['.up', '.down', '.left', '.right'])) score += 6;
      return score;
    }, 27);

    const controlState = pick(methods, ({ source }) => {
      let score = 0;
      if (source.includes('this.sneak')) score += 10;
      if (source.includes('this.yaw')) score += 5;
      if (source.includes('this.pitch')) score += 5;
      if (source.includes('ctrl')) score += 3;
      if (source.includes('alt')) score += 3;
      if (source.includes('punching')) score += 3;
      return score;
    }, 18);

    const livingUpdate = pick(methods, ({ source, name }) => {
      let score = 0;
      if (name === 'onLivingUpdate') score += 12;
      if (source.includes('sprintToggleTimer')) score += 9;
      if (source.includes('setSprinting')) score += 9;
      if (source.includes('getFoodStats')) score += 6;
      if (source.includes('isUsingItem')) score += 5;
      if (source.includes('sprintKeyWasDown')) score += 4;
      return score;
    }, 22);

    const syncPosLook = pick(methods, ({ source }) => {
      let score = 0;
      if (source.includes('lastReportedPos')) score += 9;
      if (source.includes('lastReportedPitch')) score += 7;
      if (source.includes('positionUpdateTicks')) score += 7;
      if (source.includes('onGround')) score += 3;
      if (source.includes('sendPacket')) score += 5;
      return score;
    }, 22);

    const syncState = pick(methods, ({ source }) => {
      let score = 0;
      if (source.includes('serverSneakState')) score += 9;
      if (source.includes('serverSprintState')) score += 9;
      if (source.includes('serverMoveStrafe')) score += 7;
      if (source.includes('serverMoveForward')) score += 7;
      if (source.includes('sendPacket')) score += 4;
      return score;
    }, 24);

    const setSprinting = pick(methods, ({ source, name }) => {
      let score = 0;
      if (name === 'setSprinting') score += 20;
      if (source.includes('sprintingTicksLeft')) score += 10;
      if (source.includes('600')) score += 2;
      return score;
    }, 10);

    let forwardField = null;
    let strafeField = null;
    if (applyInput?.source) {
      const forward = applyInput.source.match(/this\.([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\.up\s*\?\s*-1\s*:\s*0\)[^;]*\.down/);
      const strafe = applyInput.source.match(/this\.([A-Za-z_$][\w$]*)\s*=\s*\+?!![^;]*\.right[^;]*\.left/);
      forwardField = forward?.[1] || null;
      strafeField = strafe?.[1] || null;
    }

    const names = {
      applyInput: applyInput?.name || '',
      collectInput: collectInput?.name || '',
      controlState: controlState?.name || '',
      livingUpdate: livingUpdate?.name || '',
      syncPosLook: syncPosLook?.name || '',
      syncState: syncState?.name || '',
      setSprinting: setSprinting?.name || '',
      forwardField,
      strafeField
    };

    const api = {
      player,
      names,
      isValid() {
        return !!player && (
          !names.collectInput || typeof player[names.collectInput] === 'function'
        );
      },
      input() {
        return player.currentInput && typeof player.currentInput === 'object'
          ? player.currentInput
          : null;
      },
      isForwardPressed() {
        const input = this.input();
        if (input) return input.up === true && input.down !== true;
        if (forwardField && Number.isFinite(Number(player[forwardField]))) {
          return Number(player[forwardField]) < -0.45;
        }
        return false;
      },
      setSprint(value) {
        const name = names.setSprinting;
        if (!name || typeof player[name] !== 'function') return false;
        try {
          player[name](!!value);
          return true;
        } catch (_) {
          return false;
        }
      },
      usesInputMovement() {
        try {
          return typeof player.serverUsesInputMovement === 'function'
            ? !!player.serverUsesInputMovement()
            : true;
        } catch (_) {
          return true;
        }
      },
      syncPosLook() {
        const name = names.syncPosLook;
        if (!name || typeof player[name] !== 'function') return false;
        try {
          player[name]();
          return true;
        } catch (_) {
          return false;
        }
      },
      syncState() {
        const name = names.syncState;
        if (!name || typeof player[name] !== 'function') return false;
        try {
          player[name]();
          return true;
        } catch (_) {
          return false;
        }
      }
    };

    cache.set(player, api);
    return api;
  }

  function runtimeFor(player) {
    for (const runtime of runtimes) {
      if (runtime.player === player) return runtime;
    }
    const runtime = { player, hooks: new Map() };
    runtimes.add(runtime);
    return runtime;
  }

  function register(player, kind, id, handlers = {}) {
    const api = resolve(player);
    const methodName = api?.names?.[kind];
    if (!methodName || typeof player?.[methodName] !== 'function') return false;

    const runtime = runtimeFor(player);
    let slot = runtime.hooks.get(kind);

    if (!slot || slot.methodName !== methodName || player[methodName] !== slot.wrapper) {
      const previous = player[methodName];
      const handlerMap = slot?.handlers || new Map();
      const wrapper = function (...args) {
        const ctx = {
          kind,
          player: this,
          api: resolve(this),
          args,
          result: undefined,
          skip: false,
          data: Object.create(null)
        };

        for (const handler of handlerMap.values()) {
          try { handler.before?.(ctx); } catch (_) {}
        }

        if (!ctx.skip) ctx.result = previous.apply(this, ctx.args);

        for (const handler of handlerMap.values()) {
          try { handler.after?.(ctx); } catch (_) {}
        }

        return ctx.result;
      };

      slot = {
        methodName,
        previous,
        wrapper,
        handlers: handlerMap,
        hadOwn: Object.prototype.hasOwnProperty.call(player, methodName)
      };

      try {
        player[methodName] = wrapper;
        if (player[methodName] !== wrapper) return false;
      } catch (_) {
        return false;
      }

      runtime.hooks.set(kind, slot);
    }

    slot.handlers.set(id, handlers);
    return true;
  }

  function unregister(player, kind, id) {
    const runtime = [...runtimes].find((entry) => entry.player === player);
    const slot = runtime?.hooks.get(kind);
    if (!slot) return;

    slot.handlers.delete(id);
    if (slot.handlers.size) return;

    try {
      if (player[slot.methodName] === slot.wrapper) {
        if (slot.hadOwn) player[slot.methodName] = slot.previous;
        else delete player[slot.methodName];
      }
    } catch (_) {}

    runtime.hooks.delete(kind);
    if (!runtime.hooks.size) runtimes.delete(runtime);
  }

  function unregisterAll(player, id) {
    const runtime = [...runtimes].find((entry) => entry.player === player);
    if (!runtime) return;
    for (const kind of [...runtime.hooks.keys()]) unregister(player, kind, id);
  }

  function getGame() {
    try {
      const direct = [
        globalThis.__MB?.game,
        globalThis.game,
        globalThis.__game,
        globalThis.minibloxGame,
        globalThis.MiniBlox?.game
      ];
      for (const game of direct) if (game?.player?.pos && game?.world) return game;
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
          for (const game of candidates) if (game?.player?.pos && game?.world) return game;
        }
      }
    } catch (_) {}

    return null;
  }

  function destroy() {
    for (const runtime of [...runtimes]) {
      for (const [kind, slot] of runtime.hooks) {
        try {
          if (runtime.player[slot.methodName] === slot.wrapper) {
            if (slot.hadOwn) runtime.player[slot.methodName] = slot.previous;
            else delete runtime.player[slot.methodName];
          }
        } catch (_) {}
        runtime.hooks.delete(kind);
      }
      runtimes.delete(runtime);
    }
    try { if (globalThis[KEY]?.destroy === destroy) delete globalThis[KEY]; } catch (_) {}
  }

  globalThis[KEY] = {
    resolve,
    register,
    unregister,
    unregisterAll,
    getGame,
    sourceOf,
    destroy
  };
})();
