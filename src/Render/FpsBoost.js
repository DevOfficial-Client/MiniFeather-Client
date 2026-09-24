// FpsBoost.js — Ajusta los gráficos NATIVOS del juego para PCs muy
// limitadas. El bundle (index-BfBcwb2y.js) expone un store reactivo con
// .value/.onChange por setting (resolution, renderDistance, particles,
// clouds, shadows, entities...). Sus presets nativos son low/medium/high/
// ultra/epic; "potato" es un low aún más agresivo (resolución 60%, 2
// chunks) + snapshot para restaurar exactamente lo que tenías.
(() => {
  'use strict';

  const W = globalThis;
  const EVENT_NAME = 'minifeather:fpsboost-config';

  // Guard de re-inyección: sin esto se acumulan listeners por recarga.
  try { W.__MF_FPSBOOST_SCOPE__?.destroy?.(); } catch (_) {}

  // Claves del store gráfico del juego (bundle: cX/lX) + extras vistos
  // en el bundle (footstepParticles, acrylicEffect).
  const STORE_KEYS = [
    'resolution', 'renderDistance', 'particles', 'inventoryParticles',
    'lighting', 'dynamicLighting', 'globalIllumination', 'clouds',
    'stars', 'atmosphericSky', 'grassWave', 'fastRender', 'entities',
    'godRays', 'bloom', 'eyeAdaptation', 'waterShaders', 'shadows',
    'volumetricFog', 'emissiveFogGlow', 'motionBlur',
    'footstepParticles', 'acrylicEffect'
  ];

  // Presets nativos del juego (dX en el bundle), con "potato" propio:
  // low nativo un poco más hundido en resolución (60% vs 75) pero sin
  // dejar el mundo muerto — se conservan estrellas (coste ~0, son un
  // solo Points) y unas pocas partículas para feedback de acciones.
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
    snapshot: null,   // {key: value} original del usuario
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

  // BFS acotado (patrón RenderDistanceSystem): busca un objeto que
  // tenga ≥8 de las claves conocidas del store con reactive .value.
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

  // Aplica (o restaura con null). Reintenta cada 800ms mientras el
  // juego no exponga el store (menú de carga, cambio de mundo...).
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
      // Snapshot solo la primera vez (para no guardar el propio potato)
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
      state.store = null; // re-resolver (el mundo pudo cambiar)
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
      if (state.enabled) apply(state.level); // cambia de preset al vuelo
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
