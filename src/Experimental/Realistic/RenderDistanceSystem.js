(() => {
  'use strict';

  const W = globalThis;
  try { W.MF_RealisticRenderDistance?.destroy?.(); } catch (_) {}

  const state = {
    game: null, world: null, camera: null, setting: null,
    originalGetter: null, patchedGetter: null, hadOwnGetter: false, originalChunks: null,
    originalFar: null, desiredBlocks: 96, desiredChunks: 6, active: false,
    lastReloadChunks: 0, lastReloadAt: 0, effectiveChunks: 0
  };

  const clamp = (v, a, b, f) => {
    const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : f;
  };

  function findSetting(root, maxDepth = 5, maxNodes = 3500) {
    if (!root || typeof root !== 'object') return null;
    const q = [{ o: root, d: 0 }], seen = new WeakSet();
    let visited = 0;
    while (q.length && visited++ < maxNodes) {
      const { o, d } = q.shift();
      if (!o || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o)) continue;
      seen.add(o);
      try {
        const rd = o.renderDistance;
        if (rd && typeof rd === 'object' && Number.isFinite(Number(rd.value))) return rd;
      } catch (_) {}
      if (d >= maxDepth) continue;
      let keys = [];
      try { keys = Object.keys(o).slice(0, 80); } catch (_) {}
      for (const k of keys) {
        if (/^(parent|children|geometry|material|matrix|matrixWorld|texture|map|domElement)$/i.test(k)) continue;
        let v;
        try { v = o[k]; } catch (_) { continue; }
        if (v && (typeof v === 'object' || typeof v === 'function')) q.push({ o: v, d: d + 1 });
      }
    }
    return null;
  }

  function resolveSetting(game) {
    for (const root of [game, game?.gameScene, game?.chunkRenderManager, game?.chunkManager, game?.info, game?.renderer, game?.engine]) {
      const found = findSetting(root);
      if (found) return found;
    }
    return null;
  }

  function attach(game) {
    if (!game?.world) return false;
    if (state.game === game && state.world === game.world) return true;
    restore();
    state.game = game;
    state.world = game.world;
    state.camera = game?.gameScene?.camera || game?.camera || null;
    state.setting = resolveSetting(game);
    state.originalGetter = typeof state.world.getRenderDistanceChunks === 'function' ? state.world.getRenderDistanceChunks : null;
    state.hadOwnGetter = Object.prototype.hasOwnProperty.call(state.world, 'getRenderDistanceChunks');
    try { state.originalChunks = Number(state.originalGetter?.call(state.world)); } catch (_) { state.originalChunks = null; }
    if (state.originalGetter) {
      const original = state.originalGetter;
      state.patchedGetter = function(...args) {
        let native = NaN;
        try { native = Number(original.apply(this, args)); } catch (_) {}
        const wanted = state.desiredChunks;
        return Number.isFinite(native) && Math.abs(native - wanted) < 0.51 ? native : wanted;
      };
      state.patchedGetter.__mfRealisticRenderDistance = true;
      try { state.world.getRenderDistanceChunks = state.patchedGetter; } catch (_) {}
    }
    if (state.camera && Number.isFinite(Number(state.camera.far))) state.originalFar = Number(state.camera.far);
    return true;
  }

  function maybeReload() {
    if (state.desiredChunks === state.lastReloadChunks) return;
    const now = performance.now();
    if (now - state.lastReloadAt < 700) return;
    state.lastReloadAt = now;
    state.lastReloadChunks = state.desiredChunks;
    const crm = state.game?.chunkRenderManager;
    try {
      if (typeof crm?.reload === 'function') crm.reload();
      else if (typeof crm?.updateRenderDistance === 'function') crm.updateRenderDistance();
    } catch (_) {}
  }

  function apply(game, blocks) {
    if (!attach(game)) return false;
    state.active = true;
    state.desiredBlocks = Math.round(clamp(blocks, 10, 200, 96));
    state.desiredChunks = Math.max(1, Math.min(13, Math.ceil(state.desiredBlocks / 16)));

    if (state.setting) {
      try {
        if (Number(state.setting.value) !== state.desiredChunks) state.setting.value = state.desiredChunks;
      } catch (_) {}
    }

    if (state.camera) {
      const targetFar = Math.max(32, state.desiredBlocks + 32);
      if (Math.abs(Number(state.camera.far) - targetFar) > 0.5) {
        state.camera.far = targetFar;
        state.camera.updateProjectionMatrix?.();
      }
    }

    state.effectiveChunks = state.desiredChunks;
    maybeReload();
    return true;
  }

  function restore() {
    if (state.world && state.originalGetter) {
      try {
        if (state.hadOwnGetter) state.world.getRenderDistanceChunks = state.originalGetter;
        else delete state.world.getRenderDistanceChunks;
      } catch (_) {}
    }
    if (state.setting && Number.isFinite(state.originalChunks)) {
      try { state.setting.value = state.originalChunks; } catch (_) {}
    }
    if (state.camera && Number.isFinite(state.originalFar)) {
      try { state.camera.far = state.originalFar; state.camera.updateProjectionMatrix?.(); } catch (_) {}
    }
    Object.assign(state, { game: null, world: null, camera: null, setting: null, originalGetter: null, patchedGetter: null, hadOwnGetter: false, originalChunks: null, originalFar: null, active: false, effectiveChunks: 0, lastReloadChunks: 0 });
  }

  W.MF_RealisticRenderDistance = Object.freeze({
    apply, restore, destroy: restore,
    getState: () => ({ active: state.active, requestedBlocks: state.desiredBlocks, requestedChunks: state.desiredChunks, effectiveChunks: state.effectiveChunks, settingFound: !!state.setting })
  });
})();
