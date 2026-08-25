(function () {
  'use strict';

  const EVENT_CONFIG = 'minifeather:auto-respawn-config';
  const GLOBAL_KEY = '__MINIFEATHER_AUTO_RESPAWN__';
  const CHECK_INTERVAL_MS = 50;
  const RESPAWN_COOLDOWN_MS = 500;

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    enabled: false,
    game: null,
    lastRespawnAt: 0,
    timer: 0,
    destroyed: false
  };

  function getGame() {
    if (globalThis.miniblox?.player) {
      state.game = globalThis.miniblox;
      return state.game;
    }

    if (state.game?.player) return state.game;

    try {
      const react = document.querySelector('#react');
      if (!react) return null;

      for (const root of Object.values(react)) {
        const game = root?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player) {
          state.game = game;
          return game;
        }
      }
    } catch (_) {}

    return null;
  }

  function getHealth(game, player) {
    try {
      if (typeof player?.getHealth === 'function') {
        const value = Number(player.getHealth());
        if (Number.isFinite(value)) return value;
      }
    } catch (_) {}

    const value = Number(game?.info?.health);
    return Number.isFinite(value) ? value : null;
  }

  function shouldRespawn(game, player) {
    if (!game || !player) return false;
    if (game.info?.awaitingRespawn === true) return false;

    const health = getHealth(game, player);
    return game.info?.showDeathScreen === true || (health !== null && health <= 0);
  }

  function tick() {
    if (state.destroyed || !state.enabled) return;

    const game = getGame();
    const player = game?.player;
    if (!player || typeof player.sendRespawnPacket !== 'function') return;
    if (!shouldRespawn(game, player)) return;

    const now = performance.now();
    if (now - state.lastRespawnAt < RESPAWN_COOLDOWN_MS) return;
    state.lastRespawnAt = now;

    try {
      player.sendRespawnPacket();
    } catch (_) {}
  }

  function applyConfig(detail) {
    let config = detail;

    if (typeof detail === 'string') {
      try {
        config = JSON.parse(detail);
      } catch (_) {
        config = null;
      }
    }

    if (!config || typeof config !== 'object') return;
    state.enabled = !!config.enabled;

    if (!state.enabled) {
      state.lastRespawnAt = 0;
    }
  }

  function onConfig(event) {
    applyConfig(event?.detail);
  }

  document.addEventListener(EVENT_CONFIG, onConfig);
  state.timer = window.setInterval(tick, CHECK_INTERVAL_MS);

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;

    clearInterval(state.timer);
    document.removeEventListener(EVENT_CONFIG, onConfig);

    if (globalThis[GLOBAL_KEY]?.destroy === destroy) {
      delete globalThis[GLOBAL_KEY];
    }
  }

  globalThis[GLOBAL_KEY] = {
    destroy
  };
})();
