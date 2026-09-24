// SmartCulling.js — Elimina el trabajo de matrices de chunks estáticos.
//
// Qué ya hace el juego (verificado en el bundle BfBcwb2y):
//  - Chunks: frustum culling nativo (computeBoundingSphere + default) →
//    lo que no está en cámara NO se dibuja.
//  - Entidades: LOD en 2 niveles (fastLOD por distancia; lodFar oculta
//    el cuerpo y deja solo nametag).
//  - Nubes/atmósfera/estrellas: frustumCulled=false intencional (son
//    shells centrados en el jugador; cullarlas haría desaparecer el cielo).
//
// Lo que queda desperdiciado: cada mesh de chunk (miles con render
// distance alto) paga compose+multiply de matrix cada frame en
// updateMatrixWorld, aunque NUNCA se mueva. Aquí los congelamos
// (matrixAutoUpdate=false) y vigilamos defensivamente: si el juego
// reposiciona o re-parenta un mesh congelado, se descongela, se deja
// recomponer 1 frame y se vuelve a congelar.
(() => {
  'use strict';

  const W = globalThis;
  try { W.__MF_SMARTCULLING_SCOPE__?.destroy?.(); } catch (_) {}

  const TAG = '[MF SmartCulling]';
  const SWEEP_MS = 400;

  const state = {
    timer: 0,
    frozen: new WeakMap(), // mesh → {x, y, z, parent}
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
    // matrix ya compuesta por el juego en el frame anterior: se conserva
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
        // Solo meshes quietos: congelar en el segundo sweep tras verlos
        // estables (el primer sighting registra candidato implícitamente
        // al congelar directo: los chunks se posicionan al crearse y no
        // se mueven; el check defensivo cubre cualquier excepción).
        freeze(mesh);
        continue;
      }

      // Defensa: ¿el juego movió o re-parentó el mesh? → descongelar
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
      // Descongelar todo lo vivo que siga en la escena
      try {
        const gs = findGameScene();
        for (const mesh of gs?.chunkMeshes?.children || []) {
          if (state.frozen.has(mesh)) unfreeze(mesh);
        }
      } catch (_) {}
    }
  };
})();
