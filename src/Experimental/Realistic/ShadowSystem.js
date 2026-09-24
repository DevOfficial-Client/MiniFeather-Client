(() => {
  'use strict';

  const W = globalThis;
  try { W.MF_RealisticShadows?.destroy?.(); } catch (_) {}

  const state = {
    renderer: null,
    sun: null,
    sunlight: null,
    moonlight: null,
    shadowTarget: null,
    sunSnapshot: null,
    moonSnapshot: null,
    rendererSnapshot: null,
    profile: null,
    game: null,
    originalSunUpdate: null,
    sunUpdateWrapper: null
  };

  function rendererOf(game) {
    return [game?.renderer, game?.gameScene?.renderer, game?.engine?.renderer, game?.graphics?.renderer]
      .find(r => r?.shadowMap && (r?.isWebGLRenderer || (r?.domElement && r?.render))) || null;
  }

  function floorPow2(value) {
    let n = Math.max(1, Math.floor(Number(value) || 1));
    let p = 1;
    while (p * 2 <= n) p *= 2;
    return p;
  }

  function lightSnapshot(light) {
    if (!light?.shadow) return null;
    const s = light.shadow, c = s.camera;
    return {
      castShadow: light.castShadow,
      target: light.target,
      bias: s.bias,
      normalBias: s.normalBias,
      radius: s.radius,
      intensity: s.intensity,
      mapWidth: s.mapSize?.width,
      mapHeight: s.mapSize?.height,
      camera: c ? { left: c.left, right: c.right, top: c.top, bottom: c.bottom, near: c.near, far: c.far } : null
    };
  }

  function disposeShadowMap(shadow) {
    try { shadow?.map?.dispose?.(); } catch (_) {}
    if (shadow) {
      shadow.map = null;
      shadow.needsUpdate = true;
    }
  }

  function setMapSize(renderer, shadow, wanted) {
    if (!shadow?.mapSize) return;
    const gpuMax = floorPow2(renderer?.capabilities?.maxTextureSize || 4096);
    const size = Math.min(floorPow2(wanted), gpuMax);
    if (shadow.mapSize.width !== size || shadow.mapSize.height !== size) {
      shadow.mapSize.set(size, size);
      disposeShadowMap(shadow);
    }
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function installSunUpdateHook(game, sun) {
    if (!sun || typeof sun.update !== 'function') return;
    if (state.sun === sun && state.sunUpdateWrapper && sun.update === state.sunUpdateWrapper) return;
    if (state.sun && state.originalSunUpdate && state.sunUpdateWrapper && state.sun.update === state.sunUpdateWrapper) {
      try { state.sun.update = state.originalSunUpdate; } catch (_) {}
    }
    const original = sun.update;
    const wrapper = function(...args) {
      const result = original.apply(this, args);
      try { if (state.profile && state.game) tuneDynamic(state.game, state.profile); } catch (_) {}
      return result;
    };
    state.originalSunUpdate = original;
    state.sunUpdateWrapper = wrapper;
    sun.update = wrapper;
  }

  function attach(game, profile) {
    const renderer = rendererOf(game);
    const sun = game?.gameScene?.sun;
    const sunlight = sun?.sunlight;
    const moonlight = sun?.moonlight;
    if (!renderer?.shadowMap || !sunlight?.shadow || !profile?.shadow) return false;

    if (state.renderer !== renderer || state.sunlight !== sunlight || state.moonlight !== moonlight) {
      restore();
      state.renderer = renderer;
      state.sun = sun;
      state.sunlight = sunlight;
      state.moonlight = moonlight || null;
      state.shadowTarget = sun?.shadowTarget || sunlight.target || null;
      state.game = game;
      state.rendererSnapshot = {
        enabled: renderer.shadowMap.enabled,
        type: renderer.shadowMap.type,
        autoUpdate: renderer.shadowMap.autoUpdate
      };
      state.sunSnapshot = lightSnapshot(sunlight);
      state.moonSnapshot = lightSnapshot(moonlight);
    }

    state.profile = profile;
    state.game = game;
    installSunUpdateHook(game, sun);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = 1;
    renderer.shadowMap.autoUpdate = true;
    setMapSize(renderer, sunlight.shadow, profile.shadow.mapSize);

    if (moonlight?.shadow && profile.shadow.moon) {
      setMapSize(renderer, moonlight.shadow, profile.shadow.moonMapSize);
      if (state.shadowTarget) moonlight.target = state.shadowTarget;
      const sc = sunlight.shadow.camera, mc = moonlight.shadow.camera;
      if (sc && mc) {
        mc.left = sc.left; mc.right = sc.right; mc.top = sc.top; mc.bottom = sc.bottom;
        mc.near = sc.near; mc.far = sc.far;
        mc.updateProjectionMatrix?.();
      }
    }
    return true;
  }

  function tuneDynamic(game, profile = state.profile) {
    if (!state.renderer || !state.sunlight || !profile?.shadow) return false;

    const cfg = profile.shadow;
    const sun = state.sun;
    const sunlight = state.sunlight;
    const moonlight = state.moonlight;
    const offset = sun?.offset;
    const dist = Math.max(1e-6, Number(sun?.sunDist) || Math.hypot(offset?.x || 0, offset?.y || 0, offset?.z || 0) || 1);
    const sx = Number(offset?.x) || 0;
    const sy = Number(offset?.y) || 0;
    const sz = Number(offset?.z) || 0;
    const elevation = Math.max(0, Math.min(1, Math.abs(sy) / dist));

    // Large apparent penumbra near the horizon, crisp shadow at high sun.
    // This stays on MiniBlox's stabilized 16-tap Vogel PCF path and does not fight its snapped shadow camera.
    const horizon = 1 - smoothstep(0.10, 0.72, elevation);
    const s = sunlight.shadow;
    s.radius = lerp(cfg.noonRadius, cfg.horizonRadius, horizon);
    s.bias = cfg.bias;
    s.normalBias = lerp(cfg.normalBias, cfg.horizonNormalBias, horizon);
    if ('intensity' in s) s.intensity = cfg.intensity;

    const daylight = sy > 0 && sunlight.visible !== false;
    sunlight.castShadow = daylight;

    if (moonlight?.shadow) {
      const moonEnabled = !!cfg.moon && sy <= 0 && moonlight.visible !== false;
      moonlight.castShadow = moonEnabled;
      if (moonEnabled) {
        // MiniBlox positions the moon sprite/light at astronomical visual distance. For a shadow camera,
        // keep the same direction but place the DirectionalLight close to the stabilized shadow target.
        const len = Math.hypot(sx, sy, sz) || 1;
        const dx = -sx / len, dy = -sy / len, dz = -sz / len;
        const target = state.shadowTarget?.position || game?.player?.position || game?.player?.pos;
        if (target && moonlight.position?.set) {
          const shadowDistance = 110;
          moonlight.position.set(
            Number(target.x || 0) + dx * shadowDistance,
            Number(target.y || 0) + dy * shadowDistance,
            Number(target.z || 0) + dz * shadowDistance
          );
        }
        if (state.shadowTarget) moonlight.target = state.shadowTarget;
        const ms = moonlight.shadow;
        ms.bias = cfg.bias * 1.15;
        ms.normalBias = cfg.horizonNormalBias;
        ms.radius = cfg.moonRadius;
        if ('intensity' in ms) ms.intensity = cfg.moonIntensity;
      }
    }

    return true;
  }

  function update(game, profile = state.profile) {
    // attach() solo si cambió algo; tuneDynamic ya corre cada frame vía
    // el hook de sun.update del juego (antes: doble trabajo por frame).
    if (state.renderer !== rendererOf(game) || state.sun !== game?.gameScene?.sun || state.profile !== profile) {
      if (!attach(game, profile)) return false;
    } else {
      state.profile = profile;
      state.game = game;
    }
    return true;
  }

  function restoreLight(light, snap) {
    if (!light?.shadow || !snap) return;
    light.castShadow = snap.castShadow;
    if (snap.target) light.target = snap.target;
    const s = light.shadow;
    s.bias = snap.bias;
    s.normalBias = snap.normalBias;
    s.radius = snap.radius;
    if ('intensity' in s && snap.intensity !== undefined) s.intensity = snap.intensity;
    if (Number.isFinite(snap.mapWidth) && Number.isFinite(snap.mapHeight) &&
        (s.mapSize?.width !== snap.mapWidth || s.mapSize?.height !== snap.mapHeight)) {
      s.mapSize?.set?.(snap.mapWidth, snap.mapHeight);
      disposeShadowMap(s);
    }
    const c = s.camera, sc = snap.camera;
    if (c && sc) {
      c.left = sc.left; c.right = sc.right; c.top = sc.top; c.bottom = sc.bottom;
      c.near = sc.near; c.far = sc.far;
      c.updateProjectionMatrix?.();
    }
  }

  function restore() {
    if (state.renderer?.shadowMap && state.rendererSnapshot) {
      state.renderer.shadowMap.enabled = state.rendererSnapshot.enabled;
      state.renderer.shadowMap.type = state.rendererSnapshot.type;
      state.renderer.shadowMap.autoUpdate = state.rendererSnapshot.autoUpdate;
    }
    restoreLight(state.sunlight, state.sunSnapshot);
    restoreLight(state.moonlight, state.moonSnapshot);
    if (state.sun && state.originalSunUpdate && state.sunUpdateWrapper && state.sun.update === state.sunUpdateWrapper) {
      try { state.sun.update = state.originalSunUpdate; } catch (_) {}
    }
    state.renderer = null;
    state.sun = null;
    state.sunlight = null;
    state.moonlight = null;
    state.shadowTarget = null;
    state.sunSnapshot = null;
    state.moonSnapshot = null;
    state.rendererSnapshot = null;
    state.profile = null;
    state.game = null;
    state.originalSunUpdate = null;
    state.sunUpdateWrapper = null;
  }

  W.MF_RealisticShadows = Object.freeze({ apply: attach, update, restore, destroy: restore });
})();
