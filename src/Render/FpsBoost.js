(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:fpsboost-config';
  try { W.__MF_FPSBOOST_SCOPE__?.destroy?.(); } catch (_) {}
  const STORE_KEYS = [
    'resolution', 'renderDistance', 'particles', 'inventoryParticles',
    'lighting', 'dynamicLighting', 'globalIllumination', 'clouds',
    'stars', 'atmosphericSky', 'grassWave', 'fastRender', 'entities',
    'godRays', 'bloom', 'eyeAdaptation', 'waterShaders', 'shadows',
    'volumetricFog', 'emissiveFogGlow', 'motionBlur',
    'footstepParticles', 'acrylicEffect'
  ];
  const PRESETS = {
    potato: {
      resolution: 60, renderDistance: 3, particles: 10,
      inventoryParticles: false, lighting: 'Classic',
      dynamicLighting: false, globalIllumination: 'Off',
      clouds: 'None', stars: true, atmosphericSky: false,
      grassWave: false, fastRender: true, entities: 'Fastest',
      godRays: 'Off', bloom: 0, eyeAdaptation: 0, waterShaders: false,
      shadows: 'None', volumetricFog: false, emissiveFogGlow: false,
      motionBlur: false, footstepParticles: false, acrylicEffect: false
    }
  };

  const state = {
    enabled: false,
    level: 'potato',
    game: null,
    store: null,
    snapshot: null,
    retryTimer: 0,
    lastGameScan: 0,
    destroyed: false
  };

  function findGame(force = false) {
    const now = performance.now();
    if (!force && state.game?.player && state.game?.world && now - state.lastGameScan < 1200) {
      return state.game;
    }
    state.lastGameScan = now;

    for (const candidate of [W.miniblox, W.__MINIBLOX_GAME__, state.game]) {
      if (candidate?.player && candidate?.world) {
        state.game = candidate;
        return candidate;
      }
    }

    try {
      const react = document.querySelector('#react');
      if (!react) return null;
      for (const value of Object.values(react)) {
        const game = value?.updateQueue?.baseState?.element?.props?.game;
        if (game?.player && game?.world) {
          W.__MINIBLOX_GAME__ = game;
          state.game = game;
          return game;
        }
      }
    } catch (_) {}

    return null;
  }
  function findGraphicsStore(game) {
    const roots = [
      game, game?.gameScene, game?.chunkRenderManager,
      game?.chunkManager, game?.info, game?.renderer, game?.engine
    ];
    for (const root of roots) {
      const found = bfs(root);
      if (found) return found;
    }
    return null;
  }

  function bfs(root, maxDepth = 5, maxNodes = 4000) {
    if (!root || typeof root !== 'object') return null;
    const q = [{ o: root, d: 0 }];
    const seen = new WeakSet();
    let visited = 0;
    while (q.length && visited++ < maxNodes) {
      const { o, d } = q.shift();
      if (!o || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o)) continue;
      seen.add(o);
      try {
        let score = 0;
        for (const k of STORE_KEYS) {
          const v = o[k];
          if (v && typeof v === 'object' && 'value' in v) score++;
        }
        if (score >= 8) return o;
      } catch (_) {}
      if (d >= maxDepth) continue;
      let keys = [];
      try { keys = Object.keys(o).slice(0, 80); } catch (_) {}
      for (const k of keys) {
        if (/^(parent|children|geometry|material|matrix|matrixWorld|texture|map|domElement|position|quaternion)$/i.test(k)) continue;
        let v;
        try { v = o[k]; } catch (_) { continue; }
        if (v && (typeof v === 'object' || typeof v === 'function')) q.push({ o: v, d: d + 1 });
      }
    }
    return null;
  }

  function takeSnapshot(store) {
    const snap = {};
    for (const k of STORE_KEYS) {
      const v = store[k];
      if (v && typeof v === 'object' && 'value' in v) snap[k] = v.value;
    }
    return snap;
  }

  function applyToStore(store, values) {
    for (const k of STORE_KEYS) {
      if (!(k in values)) continue;
      const cell = store[k];
      if (cell && typeof cell === 'object' && 'value' in cell) {
        try { cell.value = values[k]; } catch (_) {}
      }
    }
  }
  function apply(levelOrNull) {
    const game = findGame();
    const store = state.store || findGraphicsStore(game);
    if (store) state.store = store;

    if (!store) {
      if (state.retryTimer || state.destroyed) return;
      state.retryTimer = setTimeout(() => {
        state.retryTimer = 0;
        if (state.enabled || levelOrNull) apply(levelOrNull);
      }, 800);
      return;
    }

    if (levelOrNull) {
        if (!state.snapshot) state.snapshot = takeSnapshot(store);
      applyToStore(store, PRESETS[levelOrNull] || PRESETS.potato);
    } else if (state.snapshot) {
      applyToStore(store, state.snapshot);
      state.snapshot = null;
    }
  }

  function setEnabled(value) {
    const next = !!value;
    if (state.enabled === next) return;
    state.enabled = next;
    if (next) {
      state.store = null;
      apply(state.level);
    } else {
      if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = 0; }
      apply(null);
    }
  }

  function onConfig(event) {
    let detail = event?.detail;
    if (typeof detail === 'string') {
      try { detail = JSON.parse(detail); } catch (_) { detail = {}; }
    }
    if (typeof detail?.level === 'string' && PRESETS[detail.level]) {
      state.level = detail.level;
      if (state.enabled) apply(state.level);
    }
    setEnabled(!!detail?.enabled);
  }

  document.addEventListener(EVENT_NAME, onConfig);

  W.MF_FpsBoost = Object.freeze({
    setEnabled,
    get enabled() { return state.enabled; },
    get level() { return state.level; },
    get storeFound() { return !!state.store; }
  });

  W.__MF_FPSBOOST_SCOPE__ = {
    destroy() {
      state.destroyed = true;
      document.removeEventListener(EVENT_NAME, onConfig);
      if (state.retryTimer) { clearTimeout(state.retryTimer); state.retryTimer = 0; }
      if (state.enabled && state.snapshot) {
        state.enabled = false;
        apply(null);
      }
    }
  };
})();
