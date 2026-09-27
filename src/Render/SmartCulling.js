(() => {
  'use strict';

  const W = globalThis;
  try { W.__MF_SMARTCULLING_SCOPE__?.destroy?.(); } catch (_) {}

  const TAG = '[MF SmartCulling]';
  const SWEEP_MS = 400;

  const state = {
    timer: 0,
    frozen: new WeakMap(),
    frozenCount: 0,
    destroyed: false
  };

  function findGameScene() {
    const g = W.miniblox || W.__MINIBLOX_GAME__;
    if (g?.gameScene) return g.gameScene;
    try {
      const react = document.querySelector('#react');
      if (react) {
        for (const v of Object.values(react)) {
          const gs = v?.updateQueue?.baseState?.element?.props?.game?.gameScene;
          if (gs?.chunkMeshes) {
            W.__MINIBLOX_GAME__ = v.updateQueue.baseState.element.props.game;
            return gs;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function freeze(mesh) {
    mesh.matrixAutoUpdate = false;
    state.frozen.set(mesh, {
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
      parent: mesh.parent
    });
    state.frozenCount++;
  }

  function unfreeze(mesh) {
    mesh.matrixAutoUpdate = true;
    mesh.updateMatrix();
    mesh.matrixWorldNeedsUpdate = true;
    state.frozen.delete(mesh);
    state.frozenCount--;
  }

  function sweep() {
    const gameScene = findGameScene();
    const chunks = gameScene?.chunkMeshes;
    if (!chunks?.children?.length) return;

    for (const mesh of chunks.children) {
      if (!mesh || typeof mesh.position !== 'object') continue;

      const snap = state.frozen.get(mesh);
      if (!snap) {
        freeze(mesh);
        continue;
      }
      if (
        snap.parent !== mesh.parent ||
        snap.x !== mesh.position.x ||
        snap.y !== mesh.position.y ||
        snap.z !== mesh.position.z
      ) {
        unfreeze(mesh);
      }
    }
  }

  state.timer = setInterval(() => {
    if (state.destroyed) return;
    try { sweep(); } catch (_) {}
  }, SWEEP_MS);

  W.MF_SmartCulling = Object.freeze({
    get frozen() { return state.frozenCount; }
  });

  W.__MF_SMARTCULLING_SCOPE__ = {
    destroy() {
      state.destroyed = true;
      clearInterval(state.timer);
      try {
        const gs = findGameScene();
        for (const mesh of gs?.chunkMeshes?.children || []) {
          if (state.frozen.has(mesh)) unfreeze(mesh);
        }
      } catch (_) {}
    }
  };
})();
