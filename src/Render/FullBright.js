(function () {
  'use strict';

  const GLOBAL_KEY = '__MINIFEATHER_FULLBRIGHT__';
  const EVENT_CONFIG = 'minifeather:fullbright-config';
  const DEFAULT_FLOOR = 0.16;
  const SCAN_INTERVAL_MS = 900;
  const WORKER_LIGHTING_TYPE = 8;
  const PATCH_MARK = Symbol.for('minifeather.fullbright.uniform.v2');

  try {
    globalThis[GLOBAL_KEY]?.destroy?.();
  } catch (_) {}

  const controller = new AbortController();
  const patchedUniforms = new Set();
  const state = {
    enabled: false,
    floor: DEFAULT_FLOOR,
    game: null,
    lastGameScan: 0,
    timer: 0,
    destroyed: false,
    originalWorkerPostMessage: null,
    workerPatched: false
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function parseDetail(detail) {
    if (detail && typeof detail === 'object') return detail;
    try {
      return JSON.parse(String(detail || '{}'));
    } catch (_) {
      return {};
    }
  }

  function findGame(force = false) {
    if (state.game?.player && state.game?.world) return state.game;

    const now = performance.now();
    if (!force && now - state.lastGameScan < 900) return null;
    state.lastGameScan = now;

    for (const candidate of [
      globalThis.__MINIBLOX_GAME__,
      globalThis.miniblox,
      globalThis.__MB?.game,
      globalThis.game
    ]) {
      if (candidate?.player && candidate?.world) {
        state.game = candidate;
        return candidate;
      }
    }

    for (const root of [document.querySelector('#react'), document.querySelector('#root')]) {
      if (!root) continue;

      let keys = [];
      try {
        keys = Object.keys(root);
      } catch (_) {}

      for (const key of keys) {
        if (!key.startsWith('__react')) continue;

        const queue = [root[key]];
        const seen = new Set();
        let visited = 0;

        while (queue.length && visited++ < 1400) {
          const fiber = queue.shift();
          if (!fiber || seen.has(fiber)) continue;
          seen.add(fiber);

          for (const source of [
            fiber.stateNode,
            fiber.memoizedProps,
            fiber.pendingProps,
            fiber.memoizedState
          ]) {
            const candidate = source?.player && source?.world ? source : source?.game;
            if (candidate?.player && candidate?.world) {
              globalThis.__MINIBLOX_GAME__ = candidate;
              state.game = candidate;
              return candidate;
            }
          }

          if (fiber.child) queue.push(fiber.child);
          if (fiber.sibling) queue.push(fiber.sibling);
        }
      }
    }

    return null;
  }

  function patchAmbientUniform(uniform) {
    if (!uniform || typeof uniform !== 'object' || !('value' in uniform)) return false;

    if (uniform[PATCH_MARK]) {
      patchedUniforms.add(uniform[PATCH_MARK]);
      return true;
    }

    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(uniform, 'value');
    } catch (_) {
      descriptor = null;
    }

    if (descriptor && descriptor.configurable === false) {
      if (state.enabled && Number.isFinite(Number(uniform.value))) {
        uniform.value = Math.max(Number(uniform.value), state.floor);
      }
      return false;
    }

    let rawValue;
    try {
      rawValue = uniform.value;
    } catch (_) {
      return false;
    }

    const record = {
      uniform,
      descriptor,
      rawValue,
      restored: false
    };

    try {
      Object.defineProperty(uniform, 'value', {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() {
          const raw = record.rawValue;
          if (!state.enabled || !Number.isFinite(Number(raw))) return raw;
          return Math.max(Number(raw), state.floor);
        },
        set(value) {
          record.rawValue = value;
        }
      });

      Object.defineProperty(uniform, PATCH_MARK, {
        value: record,
        configurable: true,
        enumerable: false
      });
    } catch (_) {
      return false;
    }

    patchedUniforms.add(record);
    return true;
  }

  function patchMaterial(material) {
    if (!material || typeof material !== 'object') return false;

    let patched = false;
    const userUniform = material.userData?.uAmbientLight;
    const shaderUniform = material.uniforms?.uAmbientLight;

    if (userUniform) patched = patchAmbientUniform(userUniform) || patched;
    if (shaderUniform && shaderUniform !== userUniform) {
      patched = patchAmbientUniform(shaderUniform) || patched;
    }

    return patched;
  }

  function patchMaterialValue(value) {
    if (Array.isArray(value)) {
      for (const material of value) patchMaterial(material);
      return;
    }
    patchMaterial(value);
  }

  function scanScene(root) {
    if (!root) return;

    if (typeof root.traverse === 'function') {
      try {
        root.traverse(object => patchMaterialValue(object?.material));
        return;
      } catch (_) {}
    }

    const queue = [root];
    const seen = new WeakSet();
    let visited = 0;

    while (queue.length && visited++ < 7000) {
      const object = queue.shift();
      if (!object || typeof object !== 'object' || seen.has(object)) continue;
      seen.add(object);

      patchMaterialValue(object.material);

      if (Array.isArray(object.children)) {
        for (const child of object.children) queue.push(child);
      }
    }
  }

  function scanObjectGraph(root) {
    if (!root || typeof root !== 'object') return;

    const queue = [{ value: root, depth: 0 }];
    const seen = new WeakSet();
    let visited = 0;

    while (queue.length && visited++ < 2600) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);

      patchMaterial(value);
      patchMaterialValue(value.material);
      patchMaterialValue(value.materialWorld);
      patchMaterialValue(value.materialFluidWorld);
      patchMaterialValue(value.materialTransparent);

      if (depth >= 3) continue;

      let keys = [];
      try {
        keys = Object.keys(value);
      } catch (_) {
        continue;
      }

      for (const key of keys) {
        if (
          key === 'parent' ||
          key === 'geometry' ||
          key === 'attributes' ||
          key === 'image' ||
          key === 'texture' ||
          key === 'buffer'
        ) continue;

        let child;
        try {
          child = value[key];
        } catch (_) {
          continue;
        }

        if (child && typeof child === 'object' && child !== window && child !== document) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
  }

  function scanGlobalMaterials() {
    const materials = globalThis.Materials;
    if (!materials || typeof materials !== 'object') return;

    let values = [];
    try {
      values = Object.values(materials);
    } catch (_) {}

    for (const value of values) {
      if (Array.isArray(value)) {
        for (const item of value) patchMaterialValue(item?.material || item);
      } else {
        patchMaterialValue(value?.material || value);
      }
    }
  }

  function patchWorkerLighting() {
    if (state.workerPatched || typeof Worker === 'undefined') return;

    const proto = Worker.prototype;
    const original = proto?.postMessage;
    if (typeof original !== 'function') return;

    state.originalWorkerPostMessage = original;

    try {
      proto.postMessage = function (message, ...rest) {
        if (
          state.enabled &&
          message &&
          typeof message === 'object' &&
          message.type === WORKER_LIGHTING_TYPE &&
          Number.isFinite(Number(message.ambientLight))
        ) {
          message = {
            ...message,
            ambientLight: Math.max(Number(message.ambientLight), state.floor)
          };
        }
        return original.call(this, message, ...rest);
      };
      state.workerPatched = true;
    } catch (_) {}
  }

  function restoreWorkerLighting() {
    if (!state.workerPatched || !state.originalWorkerPostMessage || typeof Worker === 'undefined') return;

    try {
      Worker.prototype.postMessage = state.originalWorkerPostMessage;
    } catch (_) {}

    state.workerPatched = false;
    state.originalWorkerPostMessage = null;
  }

  function scan(force = false) {
    if (!state.enabled || state.destroyed) return 0;

    patchWorkerLighting();

    const game = findGame(force);
    scanGlobalMaterials();

    for (const root of [
      game?.gameScene?.scene,
      game?.scene,
      game?.renderer?.scene,
      game?.world?.scene
    ]) {
      scanScene(root);
    }

    for (const root of [
      game?.gameScene,
      game?.renderer,
      game?.world,
      game
    ]) {
      scanObjectGraph(root);
    }

    return patchedUniforms.size;
  }

  // Escaneo con backoff: traverse de toda la escena cada 900ms para siempre
  // es caro; si varios scans seguidos no encuentran uniforms nuevos, duplicar
  // el intervalo (tope 6s). Cualquier hallazgo nuevo resetea al ritmo rápido.
  let _scanDelay = SCAN_INTERVAL_MS;
  let _staleScans = 0;
  function scheduleScan() {
    if (state.destroyed) return;
    state.timer = window.setTimeout(() => {
      if (state.enabled) {
        const before = patchedUniforms.size;
        scan(false);
        if (patchedUniforms.size === before) {
          _staleScans++;
          if (_staleScans >= 3) {
            _staleScans = 0;
            _scanDelay = Math.min(6000, _scanDelay * 2);
          }
        } else {
          _staleScans = 0;
          _scanDelay = SCAN_INTERVAL_MS;
        }
      } else {
        // Apagado: chequeo barato cada 2s por si se re-activa
        _scanDelay = 2000;
      }
      scheduleScan();
    }, _scanDelay);
  }

  function ensureTimer() {
    if (state.timer || state.destroyed) return;
    scheduleScan();
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled;

    if (state.enabled) {
      patchWorkerLighting();
      ensureTimer();
      _scanDelay = SCAN_INTERVAL_MS; // re-activado: ritmo rápido de nuevo
      scan(true);
    }
  }

  function setFloor(value) {
    const next = Number(value);
    state.floor = Number.isFinite(next)
      ? clamp(next, 0, 0.35)
      : DEFAULT_FLOOR;
  }

  function restoreUniforms() {
    for (const record of patchedUniforms) {
      if (!record || record.restored) continue;
      record.restored = true;

      const { uniform, descriptor, rawValue } = record;
      try {
        delete uniform[PATCH_MARK];
      } catch (_) {}

      try {
        if (descriptor) {
          if ('value' in descriptor) {
            Object.defineProperty(uniform, 'value', {
              ...descriptor,
              value: rawValue
            });
          } else {
            Object.defineProperty(uniform, 'value', descriptor);
            uniform.value = rawValue;
          }
        } else {
          delete uniform.value;
          uniform.value = rawValue;
        }
      } catch (_) {
        try {
          uniform.value = rawValue;
        } catch (_) {}
      }
    }
    patchedUniforms.clear();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    state.enabled = false;

    controller.abort();

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = 0;
    }

    restoreWorkerLighting();
    restoreUniforms();

    if (globalThis[GLOBAL_KEY]?.destroy === destroy) {
      try {
        delete globalThis[GLOBAL_KEY];
      } catch (_) {}
    }
  }

  document.addEventListener(EVENT_CONFIG, event => {
    const config = parseDetail(event.detail);
    if ('floor' in config) setFloor(config.floor);
    setEnabled(config.enabled === true);
  }, { signal: controller.signal });

  globalThis[GLOBAL_KEY] = {
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    setFloor,
    scan: () => scan(true),
    destroy,
    getState: () => ({
      enabled: state.enabled,
      floor: state.floor,
      patchedAmbientUniforms: patchedUniforms.size,
      workerLightingPatched: state.workerPatched
    })
  };
})();
